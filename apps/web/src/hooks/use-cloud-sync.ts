/**
 * useCloudSync - Simplified Cloud Sync Hook
 *
 * Handles:
 * - RevenueCat user ID sync
 * - Settings sync on visibility change
 *
 * NOTE: Events sync is handled by PowerSync (SyncPort).
 */

import {
  useAuthAdapter,
  useMountEffect,
  usePaymentAdapter,
  useSubscriptionAdapter,
  useSyncAdapter,
} from '@neurodual/ui';
import { useCallback, useEffectEvent, useRef } from 'react';
import { useSettingsSyncActions, useSettingsAutoSync } from './use-settings-sync';
import { cloudSyncLog } from '../lib/logger';
import { useSessionManager } from '../providers';

/**
 * Hook to manage cloud sync for settings and progression.
 * Call this once at app root level.
 */
export function useCloudSync() {
  const authAdapter = useAuthAdapter();
  const subscriptionAdapter = useSubscriptionAdapter();
  const paymentAdapter = usePaymentAdapter();
  const syncAdapter = useSyncAdapter();
  const sessionManager = useSessionManager();

  const { pullSettingsNow, pushSettingsNow } = useSettingsSyncActions();

  // Auto-sync settings on change (uses TanStack Query internally)
  useSettingsAutoSync();

  // Track user changes
  const lastUserIdRef = useRef<string | null>(null);
  const revenueCatLoggedInRef = useRef(false);

  const getCurrentUserId = useCallback((): string | null => {
    const authState = authAdapter.getState();
    return authState.status === 'authenticated' ? authState.session.user.id : null;
  }, [authAdapter]);

  const hasCloudSyncEnabled = useCallback((): boolean => {
    return subscriptionAdapter.getState().hasCloudSync;
  }, [subscriptionAdapter]);

  // ==========================================================================
  // User Change Detection + Initial Settings Pull
  // ==========================================================================

  const syncRevenueCatUser = useEffectEvent(async (currentUserId: string | null) => {
    if (currentUserId) {
      cloudSyncLog.debug('Setting RevenueCat user ID', { userId: currentUserId });
      try {
        await paymentAdapter.setUserId(currentUserId);
        revenueCatLoggedInRef.current = true;
      } catch (err) {
        cloudSyncLog.warn('Failed to set RevenueCat user ID', err);
      }
      return;
    }

    // Avoid calling logout when RevenueCat is still in anonymous mode (it throws on mobile).
    if (revenueCatLoggedInRef.current) {
      cloudSyncLog.debug('Logging out from RevenueCat');
      try {
        await paymentAdapter.logout();
      } catch (err) {
        cloudSyncLog.warn('Failed to logout from RevenueCat', err);
      } finally {
        revenueCatLoggedInRef.current = false;
      }
    }
  });

  const handleUserStateChange = useEffectEvent(() => {
    const currentUserId = getCurrentUserId();
    const hasCloudSync = hasCloudSyncEnabled();
    if (lastUserIdRef.current !== currentUserId) {
      cloudSyncLog.debug('User changed', { from: lastUserIdRef.current, to: currentUserId });
      lastUserIdRef.current = currentUserId;

      // Pull settings from cloud on login / user change (bidirectional LWW)
      if (currentUserId && hasCloudSync) {
        cloudSyncLog.debug('Pulling settings after user change...');
        pullSettingsNow().catch((err) => {
          cloudSyncLog.error('Settings pull on user change failed', err);
        });
      }

      void syncRevenueCatUser(currentUserId);
    }
  });

  useMountEffect(() => {
    handleUserStateChange();
    const unsubscribeAuth = authAdapter.subscribe(() => {
      handleUserStateChange();
    });
    return () => {
      unsubscribeAuth();
    };
  });

  // ==========================================================================
  // Visibility Change Sync (settings only)
  // ==========================================================================

  const handleVisibilityChange = useEffectEvent(async () => {
    const currentUserId = getCurrentUserId();
    const hasCloudSync = hasCloudSyncEnabled();

    if (!currentUserId || !hasCloudSync) return;

    // Defensive guard: during startup / StrictMode / HMR, we can get a stale handler firing
    // while auth/subscription state is transitioning.
    if (sessionManager.hasActiveSession()) {
      cloudSyncLog.debug('Visibility sync skipped (active session)');
      return;
    }
    if (document.hidden) {
      // User is leaving - push settings (PowerSync syncs events automatically when enabled)
      cloudSyncLog.debug('Page hidden, pushing settings...');
      try {
        await pushSettingsNow();
      } catch (err) {
        cloudSyncLog.error('Sync on hide failed', err);
      }
    } else {
      // User is returning - pull settings
      cloudSyncLog.debug('Page visible, pulling settings...');
      try {
        await pullSettingsNow();
      } catch (err) {
        cloudSyncLog.error('Settings pull on visible failed', err);
      }
    }
  });

  useMountEffect(() => {
    const onVisibilityChange = () => {
      // Defensive guard: during startup / StrictMode / HMR, we can get a stale handler firing
      // while auth/subscription state is transitioning.
      void handleVisibilityChange();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  });

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Trigger a manual sync via SyncPort (PowerSync).
   */
  const syncProgressionNow = useCallback(() => {
    const currentUserId = getCurrentUserId();
    const hasCloudSync = hasCloudSyncEnabled();
    if (!currentUserId || !hasCloudSync) {
      cloudSyncLog.warn('syncProgressionNow skipped', {
        user: currentUserId != null,
        hasCloudSync,
      });
      return;
    }
    if (sessionManager.hasActiveSession()) {
      cloudSyncLog.debug('Manual sync skipped (active session)');
      return;
    }

    cloudSyncLog.debug('Manual sync triggered');
    syncAdapter.sync().catch((err) => {
      cloudSyncLog.error('Manual sync failed', err);
    });
  }, [getCurrentUserId, hasCloudSyncEnabled, syncAdapter, sessionManager]);

  /**
   * Full sync: events, progression, AND settings.
   * 1. Trigger sync via machine
   * 2. Pull settings from cloud
   * 3. Push settings to cloud
   *
   * NOTE: UI refresh is handled automatically by PowerSync watched queries.
   * No need for manual invalidation or forceRebuild calls.
   */
  const syncEventsAndProgression = useCallback(async () => {
    const currentUserId = getCurrentUserId();
    const hasCloudSync = hasCloudSyncEnabled();
    if (!currentUserId || !hasCloudSync) {
      cloudSyncLog.warn('syncEventsAndProgression skipped', {
        user: currentUserId != null,
        hasCloudSync,
      });
      return;
    }
    if (sessionManager.hasActiveSession()) {
      cloudSyncLog.debug('Full sync skipped (active session)');
      return;
    }

    try {
      // 1. Sync events first
      await syncAdapter.sync();

      // 2. Pull settings
      await pullSettingsNow();

      // 3. Push settings
      await pushSettingsNow();

      cloudSyncLog.debug('Full sync complete');
    } catch (err) {
      cloudSyncLog.error('Full sync failed', err);
    }
  }, [
    getCurrentUserId,
    hasCloudSyncEnabled,
    pullSettingsNow,
    pushSettingsNow,
    syncAdapter,
    sessionManager,
  ]);

  /**
   * Push current settings to cloud.
   */
  const syncSettingsNow = useCallback(async () => {
    const currentUserId = getCurrentUserId();
    const hasCloudSync = hasCloudSyncEnabled();
    if (!currentUserId || !hasCloudSync) return;
    if (sessionManager.hasActiveSession()) return;

    try {
      await pushSettingsNow();
      cloudSyncLog.debug('Settings pushed');
    } catch (err) {
      cloudSyncLog.error('Settings push failed', err);
    }
  }, [getCurrentUserId, hasCloudSyncEnabled, pushSettingsNow, sessionManager]);

  return {
    syncProgressionNow,
    syncEventsAndProgression,
    syncSettingsNow,
  };
}
