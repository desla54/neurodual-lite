/**
 * Settings Sync Hooks
 *
 * TanStack Query mutations for settings cloud sync.
 * Uses Zustand store for local state, Supabase for cloud storage.
 *
 * KEY: _settingsUpdatedAt is persisted in the local SQLite blob so that
 * Last-Write-Wins (LWW) comparison works correctly across app restarts.
 */

import type { SettingsData } from '@neurodual/logic';
import {
  queryKeys,
  useHasCloudSync,
  useMountEffect,
  useMutation,
  type UseMutationResult,
} from '@neurodual/ui';
import { useCallback, useEffectEvent, useLayoutEffect, useRef } from 'react';
import { useAppPorts } from '../providers';
import { useSettingsStore } from '../stores/settings-store';

// =============================================================================
// Types
// =============================================================================

export interface PullSettingsResult {
  applied: boolean;
  cloudUpdatedAt: number;
}

export interface PushSettingsResult {
  pushed: boolean;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Convert typed object to generic Record using runtime iteration.
 * Avoids TypeScript index signature incompatibility.
 */
function toGenericRecord<T extends object>(obj: T): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = value;
  }
  return result;
}

/**
 * Convert map of typed objects to nested generic Records.
 */
function modesMapToSettingsData<T extends object>(
  modes: Record<string, T>,
): Record<string, Record<string, unknown>> {
  const result: Record<string, Record<string, unknown>> = {};
  for (const [modeId, settings] of Object.entries(modes)) {
    result[modeId] = toGenericRecord(settings);
  }
  return result;
}

/**
 * Get current settings data from Zustand store.
 * Uses explicit conversion to avoid unsafe type casts.
 */
function getSettingsData(): SettingsData {
  const state = useSettingsStore.getState();
  return {
    currentMode: state.currentMode,
    savedJourneys: state.savedJourneys as SettingsData['savedJourneys'],
    modes: modesMapToSettingsData(state.modes),
    ui: toGenericRecord(state.ui),
  };
}

/**
 * Read the persisted LWW timestamp from the Zustand store.
 */
function getLocalUpdatedAt(): number {
  return useSettingsStore.getState()._settingsUpdatedAt;
}

/**
 * Apply pulled settings to Zustand store and update the LWW timestamp.
 */
function applySettingsToStore(settings: SettingsData, cloudUpdatedAt: number): void {
  useSettingsStore.setState((state) => ({
    _settingsUpdatedAt: cloudUpdatedAt,
    currentMode: settings.currentMode ?? state.currentMode,
    savedJourneys:
      settings.savedJourneys && settings.savedJourneys.length > 0
        ? settings.savedJourneys
        : state.savedJourneys,
    modes: settings.modes ? { ...state.modes, ...settings.modes } : state.modes,
    ui: settings.ui ? { ...state.ui, ...settings.ui } : state.ui,
  }));
}

// =============================================================================
// Mutations
// =============================================================================

/**
 * Pull settings from cloud and apply to local store.
 * Only applies if cloud is newer than local.
 */
export function usePullSettings(): UseMutationResult<PullSettingsResult, Error, number> {
  const { settingsSync } = useAppPorts();
  return useMutation<PullSettingsResult, Error, number>({
    mutationKey: [...queryKeys.settings.all, 'pull'],
    mutationFn: async (localUpdatedAt: number): Promise<PullSettingsResult> => {
      const pulled = await settingsSync.pullSettings(localUpdatedAt);

      if (pulled) {
        applySettingsToStore(pulled.settings, pulled.cloudUpdatedAt);
        return { applied: true, cloudUpdatedAt: pulled.cloudUpdatedAt };
      }

      return { applied: false, cloudUpdatedAt: localUpdatedAt };
    },
  });
}

/**
 * Push current local settings to cloud.
 */
export function usePushSettings(): UseMutationResult<PushSettingsResult, Error, number> {
  const { settingsSync } = useAppPorts();
  return useMutation<PushSettingsResult, Error, number>({
    mutationKey: [...queryKeys.settings.all, 'push'],
    mutationFn: async (localUpdatedAt: number): Promise<PushSettingsResult> => {
      const result = await settingsSync.pushSettings(getSettingsData(), localUpdatedAt);
      return { pushed: result.direction === 'pushed' };
    },
  });
}

// =============================================================================
// Auto-Sync Hook
// =============================================================================

const SETTINGS_SYNC_DEBOUNCE_MS = 2000;

interface SettingsSyncSnapshot {
  readonly currentMode: ReturnType<typeof useSettingsStore.getState>['currentMode'];
  readonly modes: ReturnType<typeof useSettingsStore.getState>['modes'];
  readonly ui: ReturnType<typeof useSettingsStore.getState>['ui'];
}

function readSettingsSyncSnapshot(): SettingsSyncSnapshot {
  const state = useSettingsStore.getState();
  return {
    currentMode: state.currentMode,
    modes: state.modes,
    ui: state.ui,
  };
}

function serializeSettingsSyncSnapshot(snapshot: SettingsSyncSnapshot): string {
  return JSON.stringify(snapshot);
}

/**
 * Hook to auto-sync settings to cloud when they change (debounced).
 * Call this once at app root level.
 *
 * IMPORTANT: Uses refs for mutations to avoid infinite re-render loops.
 * TanStack Query mutations create new references each render.
 */
export function useSettingsAutoSync(): void {
  const hasCloudSync = useHasCloudSync();
  const pushSettingsMutation = usePushSettings();

  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFingerprintRef = useRef(serializeSettingsSyncSnapshot(readSettingsSyncSnapshot()));

  const scheduleSettingsSync = useEffectEvent((snapshot: SettingsSyncSnapshot) => {
    if (!hasCloudSync) {
      return;
    }

    const fingerprint = serializeSettingsSyncSnapshot(snapshot);
    if (fingerprint === lastFingerprintRef.current) {
      return;
    }
    lastFingerprintRef.current = fingerprint;

    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }

    syncTimeoutRef.current = setTimeout(() => {
      const ts = getLocalUpdatedAt() || Date.now();
      pushSettingsMutation.mutate(ts);
    }, SETTINGS_SYNC_DEBOUNCE_MS);
  });

  useMountEffect(() => {
    const unsubscribe = useSettingsStore.subscribe(
      (state) => ({
        currentMode: state.currentMode,
        modes: state.modes,
        ui: state.ui,
      }),
      (snapshot) => {
        scheduleSettingsSync(snapshot);
      },
    );

    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
      unsubscribe();
    };
  });
}

/**
 * Hook to get settings sync functions for manual use.
 * Returns functions that can be called imperatively.
 *
 * IMPORTANT: Uses refs for mutations to avoid callback instability.
 */
export function useSettingsSyncActions() {
  const pullSettingsMutation = usePullSettings();
  const pushSettingsMutation = usePushSettings();

  // Store mutateAsync in refs to avoid dependency issues
  const pullMutateAsyncRef = useRef(pullSettingsMutation.mutateAsync);
  const pushMutateAsyncRef = useRef(pushSettingsMutation.mutateAsync);
  useLayoutEffect(() => {
    pullMutateAsyncRef.current = pullSettingsMutation.mutateAsync;
    pushMutateAsyncRef.current = pushSettingsMutation.mutateAsync;
  }, [pullSettingsMutation.mutateAsync, pushSettingsMutation.mutateAsync]);

  const pullSettingsNow = useCallback(async (): Promise<PullSettingsResult> => {
    const localTs = getLocalUpdatedAt();
    const result = await pullMutateAsyncRef.current(localTs);
    return result;
  }, []);

  const pushSettingsNow = useCallback(async (): Promise<PushSettingsResult> => {
    // Use the persisted timestamp (already bumped by the store auto-save)
    const ts = getLocalUpdatedAt() || Date.now();
    return pushMutateAsyncRef.current(ts);
  }, []);

  return {
    pullSettingsNow,
    pushSettingsNow,
    isPulling: pullSettingsMutation.isPending,
    isPushing: pushSettingsMutation.isPending,
  };
}
