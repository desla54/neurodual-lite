/**
 * PowerSync Sync Adapter
 *
 * Implements SyncPort interface using PowerSync SDK.
 * This adapter exposes PowerSync sync state and provides a best-effort
 * manual sync trigger for the app.
 */

import type {
  SyncState,
  SyncPort,
  SyncResult,
  SyncStateListener,
  GameEvent,
  PersistencePort,
} from '@neurodual/logic';
import { SESSION_END_EVENT_TYPES_ARRAY } from '@neurodual/logic';
import type { AbstractPowerSyncDatabase } from '@powersync/web';
import { getPowerSyncDatabase, isPowerSyncInitialized } from './database';
import { powerSyncLog } from '../logger';
import { getPersistencePort } from '../persistence/setup-persistence';
import { rebuildMissingSessionSummaries } from '../history/history-projection';
import { POWERSYNC_LAST_SYNCED_AT_META_KEY, toSyncMetaSqlLabel } from '../es-emmett/startup-meta';
import {
  getEndedSessionIds,
  EVENTS_CRUD_TABLE_FILTER,
  eventBaseWhere,
  EMT_EVENTS_TABLE,
} from '../es-emmett/event-queries';

// =============================================================================
// Constants
// =============================================================================

/** Timeout for manual sync operations (30 seconds) */
const SYNC_TIMEOUT_MS = 30_000;

// =============================================================================
// Helpers
// =============================================================================

/**
 * Wraps a promise with a timeout to prevent indefinite blocking.
 * Rejects with a TimeoutError if the operation takes too long.
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${operation} timed out after ${timeoutMs}ms`)), timeoutMs),
    ),
  ]);
}

// =============================================================================
// Types
// =============================================================================

type PowerSyncErrorLike =
  | {
      name?: string;
      message?: string;
      stack?: string;
    }
  | null
  | undefined;

type PowerSyncStatus = {
  connected?: boolean;
  connecting?: boolean;
  dataFlow?: {
    uploading?: boolean;
    downloading?: boolean;
    uploadError?: PowerSyncErrorLike;
    downloadError?: PowerSyncErrorLike;
  };
  lastSyncedAt?: Date | string | null;
  hasSynced?: boolean;
};

// =============================================================================
// State
// =============================================================================

let currentState: SyncState = {
  status: 'idle',
  lastSyncAt: null,
  pendingCount: 0,
  errorMessage: null,
  isAvailable: false,
};

const listeners = new Set<SyncStateListener>();
let autoSyncEnabled = true;
let statusWatcherUnsubscribe: (() => void) | null = null;
let lastLoggedErrorSignature: string | null = null;
let lastSeenLastSyncedAtMillis: number | null = null;
let reconcileTimer: ReturnType<typeof setTimeout> | null = null;
let lastSyncActivityAtMs = 0;
let integrityCheckPassed = false;
let integrityRepairAttempted = false;

// =============================================================================
// Helpers
// =============================================================================

function notifyListeners(state: SyncState): void {
  for (const listener of listeners) {
    try {
      listener(state);
    } catch (err) {
      console.error('[PowerSyncSyncAdapter] Listener error:', err);
    }
  }
}

function isSameSyncState(a: SyncState, b: SyncState): boolean {
  return (
    a.status === b.status &&
    a.lastSyncAt === b.lastSyncAt &&
    a.pendingCount === b.pendingCount &&
    a.errorMessage === b.errorMessage &&
    a.isAvailable === b.isAvailable
  );
}

function setState(partial: Partial<SyncState>): void {
  const nextState = { ...currentState, ...partial };
  if (isSameSyncState(currentState, nextState)) {
    return;
  }
  currentState = nextState;
  notifyListeners(nextState);
}

function getErrorMessage(error: PowerSyncErrorLike): string | null {
  if (!error) return null;
  if (typeof error.message === 'string' && error.message.trim().length > 0) return error.message;
  if (typeof error.name === 'string' && error.name.trim().length > 0) return error.name;
  return 'PowerSync error';
}

function getLastSyncedAtMillis(value: Date | string | null | undefined): number | null {
  if (!value) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') {
    const t = new Date(value).getTime();
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

function mapPowerSyncStatus(status: PowerSyncStatus): Partial<SyncState> {
  const connected = status.connected === true;
  const connecting = status.connecting === true;
  const dataFlow = status.dataFlow ?? {};
  const uploading = dataFlow.uploading === true;
  const downloading = dataFlow.downloading === true;
  const uploadErrorMessage = getErrorMessage(dataFlow.uploadError);
  const downloadErrorMessage = getErrorMessage(dataFlow.downloadError);
  const errorMessage = uploadErrorMessage ?? downloadErrorMessage;
  const lastSyncedAtMillis = getLastSyncedAtMillis(status.lastSyncedAt);

  if (!connected && !connecting) {
    return {
      status: 'offline',
      isAvailable: false,
      errorMessage: null,
    };
  }

  if (errorMessage) {
    return {
      status: 'error',
      isAvailable: true,
      errorMessage,
    };
  }

  if (connecting || uploading || downloading) {
    return {
      status: 'syncing',
      isAvailable: true,
      errorMessage: null,
    };
  }

  return {
    status: 'idle',
    isAvailable: true,
    lastSyncAt: lastSyncedAtMillis ?? currentState.lastSyncAt,
    errorMessage: null,
  };
}

/**
 * After ensureUpToDate(), verify that every ended session has a matching
 * session_summaries row. If not, attempt a targeted repair of only the missing
 * summaries, then log once if gaps still remain.
 */
function formatMissingSessionIds(ids: readonly string[], preview = 12): string {
  if (ids.length <= preview) return ids.join(', ');
  return `${ids.slice(0, preview).join(', ')}, ... (+${ids.length - preview} more)`;
}

async function getMissingEndedSessionIds(db: AbstractPowerSyncDatabase): Promise<string[]> {
  const endedSessionIds = await getEndedSessionIds(db, SESSION_END_EVENT_TYPES_ARRAY);
  if (endedSessionIds.length === 0) return [];

  const summaryRows = await db.getAll<{ session_id: string }>(
    `SELECT session_id FROM session_summaries`,
  );
  const summaryIds = new Set(summaryRows.map((r) => r.session_id));
  return endedSessionIds.filter((sid) => !summaryIds.has(sid));
}

async function checkAndRepairProjectionIntegrity(
  db: AbstractPowerSyncDatabase,
  persistence: PersistencePort | null,
): Promise<void> {
  if (integrityCheckPassed) return;

  try {
    const missingBeforeRepair = await getMissingEndedSessionIds(db);
    if (missingBeforeRepair.length === 0) {
      integrityCheckPassed = true;
      return;
    }

    if (persistence && !integrityRepairAttempted) {
      integrityRepairAttempted = true;
      const repairPersistence =
        typeof (persistence as Partial<PersistencePort & { getPowerSyncDb?: unknown }>)
          .getPowerSyncDb === 'function'
          ? persistence
          : ({
              ...persistence,
              getPowerSyncDb: async () => db,
            } as PersistencePort);

      const repaired = await rebuildMissingSessionSummaries(repairPersistence);
      const missingAfterRepair = await getMissingEndedSessionIds(db);

      if (missingAfterRepair.length === 0) {
        powerSyncLog.info(
          `[PowerSyncSyncAdapter] Projection integrity repaired: restored ${missingBeforeRepair.length} missing session_summaries` +
            ` (${repaired} projected)`,
        );
        integrityCheckPassed = true;
        return;
      }

      powerSyncLog.warn(
        `[PowerSyncSyncAdapter] Projection integrity: ${missingAfterRepair.length} ended session(s) still missing from session_summaries after targeted repair ` +
          `(${repaired} projected). IDs: ${formatMissingSessionIds(missingAfterRepair)}.`,
      );
    } else {
      const reason = persistence ? 'targeted repair already attempted' : 'persistence unavailable';
      powerSyncLog.warn(
        `[PowerSyncSyncAdapter] Projection integrity: ${missingBeforeRepair.length} ended session(s) missing from session_summaries. ` +
          `IDs: ${formatMissingSessionIds(missingBeforeRepair)}. Skipping targeted repair (${reason}).`,
      );
    }
  } catch (err) {
    powerSyncLog.warn('[PowerSyncSyncAdapter] Projection integrity check failed (ignored)', err);
  }

  integrityCheckPassed = true;
}

async function reconcileSessionSummariesAfterSync(): Promise<void> {
  // Keep projections (session_summaries, streak, daily-activity, n-level) in sync after downloads.
  // This reads from event tables and advances projection checkpoints.
  try {
    if (!isPowerSyncInitialized()) return;
    const db = getPowerSyncDatabase();

    // Use setTimeout instead of requestIdleCallback (unreliable on Capacitor WebView).
    // The projection processor already uses yieldToMain between batches.
    setTimeout(() => {
      void (async () => {
        try {
          // Resolve persistence HERE (inside the deferred callback) — by this point
          // persistence is almost certainly initialized (750ms+ after sync completes).
          // Resolving it eagerly before the callback can throw if persistence isn't ready yet.
          let persistence: PersistencePort | null = null;
          try {
            persistence = getPersistencePort();
          } catch {
            powerSyncLog.debug(
              '[PowerSyncSyncAdapter] persistence not ready, session-summaries skipped',
            );
          }

          const { getConfiguredProcessorEngine } = await import('../projections/configured-engine');
          const engine = getConfiguredProcessorEngine(
            db,
            persistence ? { persistence } : undefined,
          );
          engine.invalidateCache();
          const report = await engine.ensureUpToDate();
          if (report.replayed.length > 0) {
            powerSyncLog.info(
              `[PowerSyncSyncAdapter] Projection replay: ${report.replayed.join(', ')} (${report.totalEventsProcessed} events)`,
            );
          } else if (report.caughtUp.length > 0) {
            powerSyncLog.debug(
              `[PowerSyncSyncAdapter] Projection catch-up: ${report.caughtUp.join(', ')} (${report.totalEventsProcessed} events)`,
            );
          }

          // After incremental catch-up, verify projection integrity.
          // Detects sessions that slipped through (checkpoint past them but no summary).
          await checkAndRepairProjectionIntegrity(db, persistence);
        } catch (projectionError) {
          powerSyncLog.warn(
            '[PowerSyncSyncAdapter] Projection ensureUpToDate failed (ignored)',
            projectionError,
          );
        }
      })();
    }, 0);
  } catch (error) {
    powerSyncLog.warn('[PowerSyncSyncAdapter] Projection reconcile failed (ignored)', error);
  }
}

async function setSyncMetaBestEffort(
  db: AbstractPowerSyncDatabase,
  key: string,
  value: string | null,
): Promise<void> {
  const label = toSyncMetaSqlLabel(key);
  try {
    await db.execute(`DELETE FROM sync_meta WHERE id = ? /* sync_meta:delete:${label} */`, [key]);
    if (value !== null && value !== '') {
      await db.execute(
        `INSERT INTO sync_meta (id, value, updated_at) VALUES (?, ?, datetime('now')) /* sync_meta:set:${label} */`,
        [key, value],
      );
    }
  } catch {
    // Best-effort only.
  }
}

async function getPendingCount(): Promise<number> {
  if (!isPowerSyncInitialized()) return 0;

  try {
    const db = getPowerSyncDatabase();
    // PowerSync stores pending changes in an internal table
    // We can query the CRUD queue size
    const result = await db.execute(`SELECT COUNT(*) as count FROM ps_crud`);
    return (result.rows?._array?.[0]?.count as number) ?? 0;
  } catch (err) {
    console.warn('[PowerSyncSyncAdapter] Failed to get pending count:', err);
    return 0;
  }
}

// =============================================================================
// Watcher
// =============================================================================

/**
 * Start watching PowerSync status changes.
 * Should be called after PowerSync is initialized.
 */
export function startPowerSyncStatusWatcher(): void {
  if (statusWatcherUnsubscribe) return;

  if (!isPowerSyncInitialized()) {
    console.warn('[PowerSyncSyncAdapter] Cannot start watcher - PowerSync not initialized');
    return;
  }

  try {
    const db = getPowerSyncDatabase();

    // Subscribe to status changes
    const unsubscribe = db.registerListener({
      statusChanged: (status) => {
        const raw = status as unknown as PowerSyncStatus;
        const mapped = mapPowerSyncStatus(raw);
        let nextPartial: Partial<SyncState> = { ...mapped };
        if (mapped.status === 'syncing') {
          lastSyncActivityAtMs = Date.now();
        } else if (mapped.status === 'idle' && currentState.status === 'syncing') {
          // Keep "syncing" for a short quiet window to avoid rapid UI thrash
          // when PowerSync alternates between brief active/idle ticks.
          const quietForMs = Date.now() - lastSyncActivityAtMs;
          if (quietForMs < 900) {
            nextPartial = { ...nextPartial, status: 'syncing' };
          }
        }
        setState(nextPartial);

        // When a full sync completes, reconcile projections.
        const lastSyncedAtMillis = getLastSyncedAtMillis(raw.lastSyncedAt);
        const hasSynced = raw.hasSynced === true;
        const isIdle = mapped.status === 'idle';
        if (
          hasSynced &&
          isIdle &&
          lastSyncedAtMillis !== null &&
          lastSyncedAtMillis !== lastSeenLastSyncedAtMillis
        ) {
          lastSeenLastSyncedAtMillis = lastSyncedAtMillis;
          void setSyncMetaBestEffort(
            db,
            POWERSYNC_LAST_SYNCED_AT_META_KEY,
            new Date(lastSyncedAtMillis).toISOString(),
          );
          if (reconcileTimer) clearTimeout(reconcileTimer);
          reconcileTimer = setTimeout(() => {
            reconcileTimer = null;
            void reconcileSessionSummariesAfterSync();
          }, 750);
        }

        if (raw?.dataFlow?.uploadError || raw?.dataFlow?.downloadError) {
          const signature = JSON.stringify({
            uploadError: raw.dataFlow.uploadError ?? null,
            downloadError: raw.dataFlow.downloadError ?? null,
          });
          if (signature !== lastLoggedErrorSignature) {
            lastLoggedErrorSignature = signature;
            // Enriched error logging with context for debugging
            console.error('[PowerSyncSyncAdapter] Sync error:', {
              uploadError: raw.dataFlow.uploadError ?? null,
              downloadError: raw.dataFlow.downloadError ?? null,
              context: {
                connected: raw.connected,
                connecting: raw.connecting,
                hasSynced: raw.hasSynced,
                lastSyncedAt: raw.lastSyncedAt,
                pendingCount: currentState.pendingCount,
                sdkVersion: (db as unknown as { sdkVersion?: string }).sdkVersion ?? 'unknown',
              },
            });
          }
        } else {
          lastLoggedErrorSignature = null;
        }

        // Refresh pending count when status changes
        getPendingCount().then((count) => {
          if (count !== currentState.pendingCount) {
            setState({ pendingCount: count });
          }
        });
      },
    });

    statusWatcherUnsubscribe = unsubscribe;
    powerSyncLog.debug('Status watcher started');

    // Set initial state
    setState(
      db.connected
        ? { isAvailable: true, status: 'idle' }
        : { isAvailable: false, status: 'offline' },
    );
  } catch (err) {
    console.error('[PowerSyncSyncAdapter] Failed to start status watcher:', err);
  }
}

/**
 * Stop watching PowerSync status changes.
 */
export function stopPowerSyncStatusWatcher(): void {
  if (statusWatcherUnsubscribe) {
    statusWatcherUnsubscribe();
    statusWatcherUnsubscribe = null;
    powerSyncLog.debug('Status watcher stopped');
  }
}

// =============================================================================
// SyncPort Implementation
// =============================================================================

/**
 * PowerSync implementation of SyncPort.
 * Used directly by the UI layer for status and manual sync.
 */
export const powerSyncSyncAdapter: SyncPort = {
  getState(): SyncState {
    return currentState;
  },

  subscribe(listener: SyncStateListener): () => void {
    listeners.add(listener);
    // Immediately call with current state
    listener(currentState);
    return () => listeners.delete(listener);
  },

  async sync(): Promise<SyncResult> {
    if (!isPowerSyncInitialized()) {
      return {
        success: false,
        pushedCount: 0,
        pulledCount: 0,
        errorMessage: 'PowerSync not initialized',
      };
    }

    try {
      const db = getPowerSyncDatabase();
      if (!db.connected) {
        return {
          success: false,
          pushedCount: 0,
          pulledCount: 0,
          errorMessage: 'PowerSync not connected',
        };
      }

      // Get pending count before sync for pushed count estimation
      const pendingBefore = await getPendingCount();

      // Reflect manual sync in UI (PowerSync continues syncing automatically in the background)
      setState({ status: 'syncing', errorMessage: null });

      // Manual sync should be lightweight:
      // - PowerSync already maintains a streaming sync connection once connected.
      // - Forcing disconnect/reconnect is expensive on web (can cause long tasks/freezes).
      // Best-effort: process one CRUD transaction immediately via the connector.
      // Wrapped with timeout to prevent indefinite blocking on network issues.
      const connector = (await import('./supabase-connector')).getPowerSyncConnector();
      await withTimeout(connector.uploadData(db), SYNC_TIMEOUT_MS, 'Sync upload');

      // Get pending count after sync for pushed count estimation
      const pendingAfter = await getPendingCount();
      const pushedCount = Math.max(0, pendingBefore - pendingAfter);

      setState({
        status: 'success',
        lastSyncAt: Date.now(),
        pendingCount: pendingAfter,
        errorMessage: null,
      });

      // Move back to idle shortly after reporting success (keeps UI responsive).
      setTimeout(() => {
        if (currentState.status === 'success') {
          setState({ status: 'idle' });
        }
      }, 750);

      return {
        success: true,
        pushedCount,
        pulledCount: 0, // PowerSync doesn't provide this directly
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown sync error';
      setState({
        status: 'error',
        errorMessage,
      });

      return {
        success: false,
        pushedCount: 0,
        pulledCount: 0,
        errorMessage,
      };
    }
  },

  setAutoSync(enabled: boolean): void {
    autoSyncEnabled = enabled;
    // PowerSync handles auto-sync internally via the connector
    // This is a no-op for the actual sync behavior, but we track it for UI
    powerSyncLog.debug(`Auto-sync ${enabled ? 'enabled' : 'disabled'}`);
  },

  isAutoSyncEnabled(): boolean {
    return autoSyncEnabled;
  },

  async getUnsyncedEvents(): Promise<GameEvent[]> {
    if (!isPowerSyncInitialized()) return [];

    try {
      const db = getPowerSyncDatabase();
      const events: GameEvent[] = [];
      const crud = await db.execute(`SELECT id FROM ps_crud WHERE ${EVENTS_CRUD_TABLE_FILTER}`);
      const pendingIds = (crud.rows?._array ?? [])
        .map((row) => row.id as string | undefined)
        .filter((id): id is string => typeof id === 'string' && id.length > 0);

      if (pendingIds.length === 0) {
        return events;
      }

      const maxBindVars = 900;
      for (let i = 0; i < pendingIds.length; i += maxBindVars) {
        const chunk = pendingIds.slice(i, i + maxBindVars);
        const placeholders = chunk.map(() => '?').join(', ');
        const rows = await db.getAll<{
          id: string;
          type: string;
          payload: string | null;
          timestamp: number | null;
          session_id: string | null;
        }>(
          `SELECT
             message_id as id,
             message_type as type,
             json_extract(message_data, '$.data') as payload,
             CAST(json_extract(message_data, '$.data.timestamp') AS INTEGER) as timestamp,
             CASE
               WHEN stream_id LIKE 'training:session:%' THEN substr(stream_id, 18)
               WHEN stream_id LIKE 'session:%' THEN substr(stream_id, 9)
               ELSE NULL
             END as session_id
           FROM ${EMT_EVENTS_TABLE}
           WHERE id IN (${placeholders})
             AND ${eventBaseWhere()}`,
          chunk,
        );

        for (const row of rows) {
          let payload: Record<string, unknown> = {};
          try {
            payload =
              typeof row.payload === 'string'
                ? (JSON.parse(row.payload) as Record<string, unknown>)
                : {};
          } catch {
            payload = {};
          }

          events.push({
            id: row.id,
            type: row.type,
            timestamp: Number(row.timestamp ?? Date.now()),
            sessionId: row.session_id ?? '',
            schemaVersion: (payload['schemaVersion'] as number) ?? 1,
            ...payload,
          } as GameEvent);
        }
      }

      return events;
    } catch (err) {
      console.error('[PowerSyncSyncAdapter] Failed to get unsynced events:', err);
      return [];
    }
  },

  async refreshPendingCount(): Promise<void> {
    const count = await getPendingCount();
    if (count !== currentState.pendingCount) {
      setState({ pendingCount: count });
    }
  },
};

// =============================================================================
// Factory Functions
// =============================================================================

let adapterInstance: SyncPort | null = null;

/**
 * Get the PowerSync sync adapter singleton.
 */
export function getPowerSyncSyncAdapter(): SyncPort {
  if (!adapterInstance) {
    adapterInstance = powerSyncSyncAdapter;
  }
  return adapterInstance;
}

/**
 * Reset the PowerSync sync adapter.
 * Call this on logout or HMR cleanup.
 */
export function resetPowerSyncSyncAdapter(): void {
  stopPowerSyncStatusWatcher();
  currentState = {
    status: 'idle',
    lastSyncAt: null,
    pendingCount: 0,
    errorMessage: null,
    isAvailable: false,
  };
  listeners.clear();
  adapterInstance = null;
  lastLoggedErrorSignature = null;
  lastSyncActivityAtMs = 0;
  integrityCheckPassed = false;
  integrityRepairAttempted = false;
}
