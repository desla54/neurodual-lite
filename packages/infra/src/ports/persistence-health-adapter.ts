import type {
  PersistenceHealthData,
  PersistenceHealthPort,
  PowerSyncRuntimeHealth,
  ProjectionHealth,
  ReadModelSnapshot,
  Subscribable,
} from '@neurodual/logic';
import { SESSION_END_EVENT_TYPES_ARRAY } from '@neurodual/logic';
import { getActivePowerSyncWatchSubscriptions } from '../powersync/event-watcher';
import {
  getPowerSyncDatabase,
  getPowerSyncRuntimeState,
  isPowerSyncInitialized,
  samplePowerSyncRuntimeMemory,
} from '../powersync/database';
import { powerSyncSyncAdapter } from '../powersync/powersync-sync-adapter';
import {
  countEndedSessions,
  findMissingSessionSummaries,
  findOrphanSessionSummaries,
} from '../es-emmett/event-queries';

type Listener = () => void;

type PersistenceGlobal = {
  __NEURODUAL_PERSISTENCE_STAGE__?: string | null;
};

function getPersistenceStage(): string | null {
  const g = globalThis as typeof globalThis & PersistenceGlobal;
  return g.__NEURODUAL_PERSISTENCE_STAGE__ ?? null;
}

function toRuntimeHealth(): PowerSyncRuntimeHealth | null {
  const rt = getPowerSyncRuntimeState();
  if (!rt) return null;
  return {
    selectedVfs: rt.selectedVfs,
    preferredVfs: rt.preferredVfs,
    candidates: rt.candidates,
    platform: rt.platform,
    browser: rt.browser,
    iosWeb: rt.iosWeb,
    updatedAt: rt.updatedAt,
    lastEvents: (rt.events ?? []).slice(-12),
    opfsDiagnostics: rt.opfsDiagnostics,
    lifecycle: rt.lifecycle,
    reconnect: rt.reconnect,
    syncGate: rt.syncGate,
    memory: rt.memory,
  };
}

async function computeProjectionHealth(): Promise<ProjectionHealth> {
  const now = new Date().toISOString();

  if (!isPowerSyncInitialized()) {
    return {
      status: 'unavailable',
      source: 'unavailable',
      endedSessions: null,
      sessionSummaries: null,
      missingSummaries: null,
      orphanSummaries: null,
      lastCheckedAt: now,
      errorMessage: null,
    };
  }

  try {
    const db = getPowerSyncDatabase();

    const [endedValue, summariesValue, missingIds, orphanIds] = await Promise.all([
      countEndedSessions(db, SESSION_END_EVENT_TYPES_ARRAY),
      (async () => {
        const row = await db.getOptional<{ count: number }>(
          `SELECT COUNT(*) as count FROM session_summaries WHERE reason != 'abandoned'`,
        );
        return row?.count ?? 0;
      })(),
      findMissingSessionSummaries(db, SESSION_END_EVENT_TYPES_ARRAY),
      findOrphanSessionSummaries(db, SESSION_END_EVENT_TYPES_ARRAY, ''),
    ]);

    const missingValue = missingIds.length;
    const orphanValue = orphanIds.length;
    const status =
      missingValue > 0 || orphanValue > 0 || summariesValue < endedValue ? 'degraded' : 'ok';

    return {
      status,
      source: 'strict-cross-check',
      endedSessions: endedValue,
      sessionSummaries: summariesValue,
      missingSummaries: missingValue,
      orphanSummaries: orphanValue,
      lastCheckedAt: now,
      errorMessage: null,
    };
  } catch (error) {
    return {
      status: 'error',
      source: 'strict-cross-check',
      endedSessions: null,
      sessionSummaries: null,
      missingSummaries: null,
      orphanSummaries: null,
      lastCheckedAt: now,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function collectPersistenceHealthSnapshot(): Promise<PersistenceHealthData> {
  await samplePowerSyncRuntimeMemory('freeze-snapshot', { force: true });
  return {
    persistenceStage: getPersistenceStage(),
    sync: powerSyncSyncAdapter.getState(),
    powerSync: toRuntimeHealth(),
    projections: await computeProjectionHealth(),
    activeWatchSubscriptions: getActivePowerSyncWatchSubscriptions(),
  };
}

function createHealthStore(): Subscribable<ReadModelSnapshot<PersistenceHealthData>> {
  let snapshot: ReadModelSnapshot<PersistenceHealthData> = {
    data: {
      persistenceStage: getPersistenceStage(),
      sync: powerSyncSyncAdapter.getState(),
      powerSync: toRuntimeHealth(),
      projections: {
        status: 'unavailable',
        source: 'unavailable',
        endedSessions: null,
        sessionSummaries: null,
        missingSummaries: null,
        orphanSummaries: null,
        lastCheckedAt: null,
        errorMessage: null,
      },
      activeWatchSubscriptions: getActivePowerSyncWatchSubscriptions(),
    },
    isPending: true,
    error: null,
  };

  const listeners = new Set<Listener>();
  let stopSyncSub: (() => void) | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let started = false;

  const refreshNow = () => {
    void (async () => {
      try {
        snapshot = {
          data: await collectPersistenceHealthSnapshot(),
          isPending: false,
          error: null,
        };
      } catch (error) {
        snapshot = {
          ...snapshot,
          isPending: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
      emit();
    })();
  };

  const emit = () => {
    for (const l of listeners) l();
  };

  const start = () => {
    if (started) return;
    started = true;

    stopSyncSub = powerSyncSyncAdapter.subscribe((sync) => {
      snapshot = {
        ...snapshot,
        data: {
          ...snapshot.data,
          sync,
        },
      };
      emit();
    });

    const poll = () => {
      refreshNow();
    };

    poll();
    pollTimer = setInterval(poll, 2000);
  };

  const stop = () => {
    stopSyncSub?.();
    stopSyncSub = null;
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    started = false;
  };

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      if (listeners.size === 1) start();
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) stop();
      };
    },
    getSnapshot: () => snapshot,
  };
}

const store = createHealthStore();

function refresh(): void {
  // Force a refresh by creating a transient subscription if needed.
  // When no listeners are attached, snapshot stays stale by design.
  // Admin/diagnostics UI keeps a subscription while mounted.
  // Still, we refresh the snapshot eagerly when possible.
  try {
    // Trigger compute via a temporary subscribe/unsubscribe cycle.
    const unsub = store.subscribe(() => {});
    unsub();
  } catch {
    // ignore
  }
}

export const persistenceHealthAdapter: PersistenceHealthPort = {
  watchHealth: () => store,
  refresh,
};
