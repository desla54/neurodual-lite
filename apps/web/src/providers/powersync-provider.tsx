/**
 * PowerSyncProvider
 *
 * Provides PowerSync context to the app.
 * - Initializes PowerSync database with schema
 * - Connects to PowerSync service when authenticated
 * - Disconnects on logout
 * - Provides database instance via @powersync/react context
 */

import type { AbstractPowerSyncDatabase } from '@powersync/web';
import { PowerSyncContext } from '@powersync/react';
import {
  connectPowerSyncDatabase,
  disconnectPowerSync,
  getPowerSyncDatabase,
  recordPowerSyncLifecycleSignal,
  recordPowerSyncReconnectResult,
  recordPowerSyncReconnectStart,
  recordPowerSyncSyncGate,
  samplePowerSyncRuntimeMemory,
  isPowerSyncInitialized,
  openPowerSyncDatabase,
  reconnectPowerSync,
  isSupabaseConfigured,
  runAuthTransitionHistoryMigration,
  getConfiguredProcessorEngine,
  startPowerSyncStatusWatcher,
  stopPowerSyncStatusWatcher,
  supabaseAuthAdapter,
  supabaseSubscriptionAdapter,
  withWatchdogContext,
  withWatchdogContextAsync,
} from '@neurodual/infra';
import { useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { SystemContext } from './system-provider';
import { logger } from '../lib';
import { useMobileInstanceGuard } from '../hooks/use-mobile-instance-guard';
import { useBetaEnabled } from '../hooks/use-beta-features';
import { useHistoryWatch } from '../hooks/use-history-watch';
import { useMountEffect } from '@neurodual/ui';

interface PowerSyncProviderProps {
  children: ReactNode;
}

/**
 * PowerSyncProvider
 *
 * Wraps children with PowerSync context.
 * Handles:
 * - Database initialization on mount
 * - Connection when user is authenticated
 * - Disconnection when user logs out
 * - Cleanup on unmount
 *
 * Note: PowerSync hooks (useStatus, usePowerSyncStatus, etc.) will only work
 * inside this provider.
 */
export function PowerSyncProvider({ children }: PowerSyncProviderProps) {
  const betaEnabled = useBetaEnabled();
  const instanceGuard = useMobileInstanceGuard({ enabled: betaEnabled });
  const [db, setDb] = useState<AbstractPowerSyncDatabase | null>(() => {
    try {
      return isPowerSyncInitialized() ? getPowerSyncDatabase() : null;
    } catch {
      return null;
    }
  });
  const [desiredEnabled, setDesiredEnabled] = useState(false);
  const [historyWatchUserId, setHistoryWatchUserId] = useState<string>('local');
  const userIdRef = useRef<string | null>(null);
  const lastDesiredReasonRef = useRef<string | null>(null);
  const powerSyncOpChainRef = useRef<Promise<void>>(Promise.resolve());
  const reconnectRunningRef = useRef(false);

  // Always open the local PowerSync DB (single DB for local persistence).
  useMountEffect(() => {
    let cancelled = false;
    withWatchdogContextAsync('PowerSyncProvider.openPowerSyncDatabase', () =>
      openPowerSyncDatabase(),
    )
      .then((database: AbstractPowerSyncDatabase) => {
        if (!cancelled) setDb(database);
      })
      .catch((error: unknown) => {
        console.error('[PowerSyncProvider] Failed to open local DB:', error);
        if (!cancelled) setDb(null);
      });
    return () => {
      cancelled = true;
    };
  });

  // PowerSync is only needed when:
  // - Supabase is configured
  // - user is authenticated
  // - user has cloud sync entitlement
  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setDesiredEnabled(false);
      userIdRef.current = null;
      setHistoryWatchUserId('local');
      return;
    }

    const recomputeDesiredEnabled = () => {
      const authState = supabaseAuthAdapter.getState();
      const subState = supabaseSubscriptionAdapter.getState();

      const isAuthed = authState.status === 'authenticated';
      userIdRef.current = isAuthed ? authState.session.user.id : null;
      setHistoryWatchUserId(isAuthed ? authState.session.user.id : 'local');

      const forceEnable =
        import.meta.env.DEV &&
        (import.meta.env['VITE_POWERSYNC_FORCE_ENABLE'] === '1' ||
          import.meta.env['VITE_POWERSYNC_FORCE_ENABLE'] === 'true');
      const instanceRole = instanceGuard.isFollower
        ? 'follower'
        : instanceGuard.isLeader
          ? 'leader'
          : instanceGuard.isAcquiring
            ? 'acquiring'
            : 'disabled';
      const enabled = Boolean(
        isAuthed && (subState.hasCloudSync || forceEnable) && instanceGuard.allowsSync,
      );
      setDesiredEnabled(enabled);
      const blockedReason = !isSupabaseConfigured()
        ? 'supabase-not-configured'
        : !isAuthed
          ? 'not-authenticated'
          : !subState.hasCloudSync && !forceEnable
            ? 'no-cloud-sync'
            : !instanceGuard.allowsSync
              ? instanceGuard.isFollower
                ? 'secondary-tab'
                : 'instance-guard-blocked'
              : null;
      recordPowerSyncSyncGate({
        desiredEnabled: enabled,
        supabaseConfigured: isSupabaseConfigured(),
        isAuthed,
        hasCloudSync: subState.hasCloudSync,
        forceEnable,
        instanceGuardEnabled: instanceGuard.enabled,
        instanceAllowsSync: instanceGuard.allowsSync,
        instanceRole,
        userPresent: userIdRef.current !== null,
        blockedReason,
      });

      if (import.meta.env.DEV) {
        const reason = JSON.stringify({
          supabaseConfigured: isSupabaseConfigured(),
          isAuthed,
          hasCloudSync: subState.hasCloudSync,
          forceEnable,
          instanceGuardEnabled: instanceGuard.enabled,
          instanceAllowsSync: instanceGuard.allowsSync,
          instanceRole,
          userPresent: userIdRef.current !== null,
          blockedReason,
        });
        if (reason !== lastDesiredReasonRef.current) {
          lastDesiredReasonRef.current = reason;
          logger.debug('[PowerSyncProvider] Desired sync state:', reason);
        }
      }
    };

    recomputeDesiredEnabled();

    const unsubAuth = supabaseAuthAdapter.subscribe(() => recomputeDesiredEnabled());
    const unsubSub = supabaseSubscriptionAdapter.subscribe(() => recomputeDesiredEnabled());

    return () => {
      unsubAuth();
      unsubSub();
    };
  }, [
    instanceGuard.allowsSync,
    instanceGuard.enabled,
    instanceGuard.isAcquiring,
    instanceGuard.isFollower,
    instanceGuard.isLeader,
  ]);

  // Enable/disable PowerSync based on desired state.
  useEffect(() => {
    let cancelled = false;

    async function ensureEnabled(): Promise<void> {
      if (!desiredEnabled) return;
      if (!isSupabaseConfigured()) return;

      try {
        // DB should already be open; connect enables sync.
        const database = await withWatchdogContextAsync(
          'PowerSyncProvider.ensureEnabled.openDb',
          async () =>
            isPowerSyncInitialized() ? getPowerSyncDatabase() : await openPowerSyncDatabase(),
        );
        if (cancelled) return;

        setDb(database);
        withWatchdogContext('PowerSyncProvider.ensureEnabled.startStatusWatcher', () => {
          startPowerSyncStatusWatcher();
        });
        await withWatchdogContextAsync('PowerSyncProvider.ensureEnabled.connect', () =>
          connectPowerSyncDatabase(),
        );
        if (cancelled) return;
        logger.debug('[PowerSyncProvider] PowerSync enabled');
      } catch (error) {
        console.error('[PowerSyncProvider] Failed to enable PowerSync:', error);
      }
    }

    async function ensureDisabled(): Promise<void> {
      if (desiredEnabled) return;

      try {
        withWatchdogContext('PowerSyncProvider.ensureDisabled.stopStatusWatcher', () => {
          stopPowerSyncStatusWatcher();
        });
        const shouldDisconnect = withWatchdogContext(
          'PowerSyncProvider.ensureDisabled.shouldDisconnect',
          () => {
            if (!isPowerSyncInitialized()) return false;
            const database = getPowerSyncDatabase() as unknown as {
              connected?: unknown;
              connecting?: unknown;
            };
            return database.connected === true || database.connecting === true;
          },
        );
        if (!shouldDisconnect) return;

        await withWatchdogContextAsync('PowerSyncProvider.ensureDisabled.disconnect', () =>
          disconnectPowerSync(),
        );
      } catch (error) {
        // Best-effort only (e.g. DB was never initialized)
        if (import.meta.env.DEV) {
          console.warn('[PowerSyncProvider] Failed to disable PowerSync (ignored):', error);
        }
      }
    }

    // Serialize enable/disable operations to avoid connect/disconnect races
    powerSyncOpChainRef.current = powerSyncOpChainRef.current
      .catch(() => {})
      .then(async () => {
        if (desiredEnabled) {
          await ensureEnabled();
        } else {
          await ensureDisabled();
        }
      })
      .catch((error: unknown) => {
        logger.error('[PowerSyncProvider] PowerSync operation failed (unexpected)', error);
      });

    return () => {
      cancelled = true;
    };
  }, [desiredEnabled]);

  // Set up history PowerSync watch when authenticated
  // This bridges PowerSync events → session_summaries projection → UI refresh
  // Use useContext directly to handle HMR gracefully (context may be null during hot reload)
  const systemCtx = useContext(SystemContext);
  const persistence = systemCtx?.persistence ?? null;
  const adapters = systemCtx?.adapters;
  const persistenceRef = useRef(persistence);
  const attemptedAuthMigrationUsersRef = useRef<Set<string>>(new Set());
  persistenceRef.current = persistence;

  // Run local->authenticated history migration on every authenticated scope change,
  // even when cloud sync is disabled or blocked in a follower tab.
  useEffect(() => {
    const persistencePort = persistenceRef.current;
    if (!persistencePort) return;

    const scopedUserId = historyWatchUserId || 'local';
    if (scopedUserId === 'local') {
      attemptedAuthMigrationUsersRef.current.clear();
      return;
    }

    if (attemptedAuthMigrationUsersRef.current.has(scopedUserId)) return;
    attemptedAuthMigrationUsersRef.current.add(scopedUserId);

    let cancelled = false;
    void withWatchdogContextAsync(
      'PowerSyncProvider.runAuthTransitionHistoryMigration',
      async () => {
        const result = await runAuthTransitionHistoryMigration(persistencePort, scopedUserId);
        if (cancelled) return;
        if (!result.wasNoop) {
          logger.info('[PowerSyncProvider] Auth transition migration applied', {
            userId: scopedUserId,
            eventsMigrated: result.eventsMigrated,
            sessionsMigrated: result.sessionsMigrated,
            summariesMigrated: result.summariesMigrated,
            algorithmStatesMigrated: result.algorithmStatesMigrated,
            nLevelProjectionsMigrated: result.nLevelProjectionsMigrated,
          });
        }

        // After migrating event userIds, projections computed from old 'local' events
        // need rebuilding since the ProjectionProcessor checkpoint is already past them.
        if (result.eventsMigrated > 0) {
          try {
            const projectionDb = isPowerSyncInitialized()
              ? getPowerSyncDatabase()
              : await openPowerSyncDatabase();
            const engine = getConfiguredProcessorEngine(projectionDb, {
              persistence: persistencePort,
            });
            await engine.rebuildAll();
            logger.info('[PowerSyncProvider] Projections rebuilt after auth migration');
          } catch (rebuildError) {
            logger.warn('[PowerSyncProvider] Projection rebuild after migration failed', {
              error: rebuildError,
            });
          }
        }
      },
    ).catch((error: unknown) => {
      // Allow retry for this user if migration failed.
      attemptedAuthMigrationUsersRef.current.delete(scopedUserId);
      logger.warn('[PowerSyncProvider] Auth transition migration failed', {
        userId: scopedUserId,
        error,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [historyWatchUserId]);

  // History watch: monitors emt_messages for new events and triggers projection
  // catch-up (session_summaries, cognitive_profile, streaks, etc.).
  // Extracted to useHistoryWatch — purely local, no cloud sync dependency.
  useHistoryWatch(db, historyWatchUserId, persistence, adapters?.history ?? null);

  // Mobile browsers (especially Android PWA) may suspend background sockets.
  // Reconnect when app becomes visible again or network comes back online.
  useEffect(() => {
    if (!db) return;
    if (!desiredEnabled) return;

    // Bump this epoch whenever a server-side change (e.g. new RLS policy) requires
    // connected clients to cycle their sync connection to pick up the fix.
    const SYNC_RECONNECT_EPOCH = 1;
    const EPOCH_KEY = 'neurodual:sync-reconnect-epoch';

    const needsForceReconnect = (() => {
      try {
        const stored = localStorage.getItem(EPOCH_KEY);
        return stored == null || Number(stored) < SYNC_RECONNECT_EPOCH;
      } catch {
        return false;
      }
    })();

    const enqueueReconnect = (
      reason: 'effect-start' | 'visibilitychange' | 'pageshow' | 'online',
    ) => {
      powerSyncOpChainRef.current = powerSyncOpChainRef.current
        .catch(() => {})
        .then(async () => {
          if (!desiredEnabled) return;
          if (!userIdRef.current) return;
          if (reconnectRunningRef.current) return;
          if (!isPowerSyncInitialized()) return;

          const database = getPowerSyncDatabase();
          const connected = (database as unknown as { connected?: unknown }).connected === true;

          // One-shot forced reconnect: cycle the connection so the upload queue
          // restarts against the latest server-side policies (e.g. deleted_sessions UPDATE RLS).
          if (connected && reason === 'effect-start' && needsForceReconnect) {
            reconnectRunningRef.current = true;
            recordPowerSyncReconnectStart('effect-start:forced');
            try {
              logger.info(
                '[PowerSyncProvider] Force-cycling sync connection (epoch %d)',
                SYNC_RECONNECT_EPOCH,
              );
              await disconnectPowerSync();
              await reconnectPowerSync();
              try {
                localStorage.setItem(EPOCH_KEY, String(SYNC_RECONNECT_EPOCH));
              } catch {}
              recordPowerSyncReconnectResult('effect-start:forced', { ok: true });
              logger.info('[PowerSyncProvider] Force-reconnect complete');
            } catch (error) {
              recordPowerSyncReconnectResult('effect-start:forced', { ok: false, error });
              logger.warn('[PowerSyncProvider] Force-reconnect failed', { error });
            } finally {
              reconnectRunningRef.current = false;
            }
            return;
          }

          if (connected) return;

          reconnectRunningRef.current = true;
          recordPowerSyncReconnectStart(reason);
          try {
            logger.debug('[PowerSyncProvider] Attempting reconnect after', reason);
            await withWatchdogContextAsync('PowerSyncProvider.reconnect', () =>
              reconnectPowerSync(),
            );
            recordPowerSyncReconnectResult(reason, { ok: true });
            logger.debug('[PowerSyncProvider] Reconnected after', reason);
          } catch (error) {
            recordPowerSyncReconnectResult(reason, { ok: false, error });
            logger.warn('[PowerSyncProvider] Reconnect failed after visibility/network event', {
              reason,
              error,
            });
          } finally {
            reconnectRunningRef.current = false;
          }
        })
        .catch((error: unknown) => {
          logger.error('[PowerSyncProvider] Reconnect operation failed (unexpected)', error);
        });
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        recordPowerSyncLifecycleSignal('visible');
        void samplePowerSyncRuntimeMemory('visibility:visible');
        enqueueReconnect('visibilitychange');
        return;
      }
      recordPowerSyncLifecycleSignal('hidden');
      void samplePowerSyncRuntimeMemory('visibility:hidden');
    };

    const onPageShow = () => {
      recordPowerSyncLifecycleSignal('pageshow');
      void samplePowerSyncRuntimeMemory('pageshow');
      enqueueReconnect('pageshow');
    };
    const onOnline = () => {
      recordPowerSyncLifecycleSignal('online');
      void samplePowerSyncRuntimeMemory('online');
      enqueueReconnect('online');
    };

    // Run once when effect starts to recover stale disconnected states.
    enqueueReconnect('effect-start');

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('online', onOnline);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener('online', onOnline);
    };
  }, [db, desiredEnabled]);

  // Observe pagehide for diagnostics only.
  // Firefox can emit pagehide during transient lifecycle churn where the app should
  // keep its local SQLite/OPFS handle alive; closing here can trigger remounts and
  // abandon an in-progress session before gameplay actually starts.
  useEffect(() => {
    if (!db) return;

    const onPageHide = () => {
      recordPowerSyncLifecycleSignal('pagehide');
      void samplePowerSyncRuntimeMemory('pagehide', { force: true });
    };

    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [db]);

  const lockNotice =
    betaEnabled &&
    instanceGuard.enabled &&
    instanceGuard.isFollower &&
    instanceGuard.hasPeerLeader ? (
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[10000] w-[min(92vw,32rem)] rounded-2xl border border-amber-200 bg-amber-50/95 backdrop-blur px-4 py-3 shadow-lg">
        <p className="text-sm font-semibold text-amber-900">
          Une autre instance est active sur ce navigateur.
        </p>
        <p className="mt-1 text-xs text-amber-800/90">
          La synchronisation cloud est désactivée ici pour éviter les conflits.
          {instanceGuard.heartbeatAgeMs !== null
            ? ` Dernier signal actif: ${Math.max(0, Math.round(instanceGuard.heartbeatAgeMs / 1000))}s.`
            : ''}
        </p>
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={instanceGuard.requestTakeover}
            disabled={instanceGuard.takeoverPending}
            className="rounded-xl bg-amber-900 text-amber-50 text-xs font-semibold px-3 py-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {instanceGuard.takeoverPending ? 'Reprise en cours...' : 'Reprendre la main'}
          </button>
          <span className="text-[11px] text-amber-900/80">
            Si besoin, ferme l’autre onglet/application puis réessaie.
          </span>
        </div>
      </div>
    ) : null;

  // If PowerSync is not available (Supabase not configured), render children without context.
  if (!db) {
    return (
      <>
        {lockNotice}
        {children}
      </>
    );
  }

  // Provide PowerSync context
  return (
    <PowerSyncContext.Provider value={db}>
      {lockNotice}
      {children}
    </PowerSyncContext.Provider>
  );
}
