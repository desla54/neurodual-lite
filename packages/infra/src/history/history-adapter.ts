/**
 * History Adapter
 *
 * Implements HistoryPort using projected read-models in local SQLite.
 * This adapter is injected by apps/web into the SessionHistoryContext.
 *
 * FACADE: Delegates to specialized modules:
 * - history-projection.ts - Event → SessionSummary projection
 * - history-import-export.ts - JSON import/export
 *
 * REACTIVITY: UI reads via PowerSync watched queries (useSessionsQuery).
 * Projection writes are owned by the PowerSync history watcher (single-writer model).
 */

import {
  projectSessionReportFromEvents,
  sessionSummaryRowToHistoryItem,
  getModeName,
  SESSION_REPORT_PROJECTION_VERSION,
  SESSION_END_EVENT_TYPES,
  SESSION_END_EVENT_TYPES_ARRAY,
  isSessionEndEventType,
  type HistoryPort,
  type ImportResult,
  type SessionHistoryExport,
  type SessionHistoryItem,
  type PersistencePort,
  type SyncPort,
  type SessionEndReportModel,
  // Migration
  migrateAndValidateEvent,
  migrateAndValidateEventBatch,
  type RawVersionedEvent,
} from '@neurodual/logic';
import { deleteSessionEvents, deleteSessionEventsBatch } from '../persistence/setup-persistence';
import { historyLog } from '../logger';
import { insertSessionSummaryFromEvent } from './history-projection';
import type { AbstractPowerSyncDatabase } from '@powersync/web';
import {
  getActivePowerSyncWatchSubscriptions,
  watchUserDeletedSessions,
  watchUserEventSignalsByTypes,
  watchUserResets,
} from '../powersync/event-watcher';
import { createEventReader } from '../events/event-reader';
import {
  getSessionEvents as getSessionEventsFromEmmettSql,
  getStreamVersion,
  countSessionEvents,
  getSessionEndEventsAfterPosition,
  getLatestEndEventsForSessions,
  buildEventSignalCountQuery,
  type EventRow,
} from '../es-emmett/event-queries';
import { exportSessionsToJSON, importSessionsFromJSON } from './history-import-export';
import { rebuildStatsProjectionsForUser } from '../projections/session-summaries-projection';
import { wipeLocalDeviceData } from '../lifecycle/local-data-wipe';
import { getLastAppliedResetAtMs, setLastAppliedResetAtMs } from '../sync/reset-marker';
import { supabaseAuthAdapter, supabaseSubscriptionAdapter } from '../supabase';
import { isSupabaseConfigured } from '../supabase/client';
import { bulkDeleteWhereIn } from '../db/sql-executor';
import type { PowerSyncEventSignalRow } from '../powersync/schema';
import { withWatchdogContextAsync, withWatchdogStepAsync } from '../diagnostics/freeze-watchdog';
import { createUiCache } from '../cache/ui-cache';
import { nowMs, yieldIfOverBudget, yieldToMain } from '../utils/yield-to-main';
import { parseSqlDateToMs, safeJsonParse } from '../db/sql-helpers';

// =============================================================================
// Helpers
// =============================================================================

function requirePowerSyncDb(persistence: PersistencePort): Promise<AbstractPowerSyncDatabase> {
  const candidate = persistence as unknown as {
    getPowerSyncDb?: () => Promise<AbstractPowerSyncDatabase>;
  };
  if (typeof candidate.getPowerSyncDb !== 'function') {
    throw new Error('[HistoryAdapter] PersistencePort must expose getPowerSyncDb()');
  }
  return candidate.getPowerSyncDb();
}

const HISTORY_SUMMARY_PROJECTOR_ID = 'history-session-summaries-v1';
const HISTORY_WATCH_SIGNAL_LIMIT = 600;
const HISTORY_PROJECTION_TRIGGER_TYPES: ReadonlySet<string> = new Set([
  ...SESSION_END_EVENT_TYPES_ARRAY,
  // Derived/system events can arrive after *_ENDED and must re-trigger projections.
  'XP_BREAKDOWN_COMPUTED',
  'BADGE_UNLOCKED',
]);

async function filterAlreadyPatchedXpBreakdownSignals(
  persistence: PersistencePort,
  rows: readonly PowerSyncEventSignalRow[],
): Promise<PowerSyncEventSignalRow[]> {
  const xpRows = rows.filter((row) => row.type === 'XP_BREAKDOWN_COMPUTED');
  if (xpRows.length === 0) return [...rows];

  const sessionIds = Array.from(
    new Set(
      xpRows
        .map((row) => row.session_id?.trim())
        .filter((sessionId): sessionId is string => Boolean(sessionId && sessionId.length > 0)),
    ),
  );
  if (sessionIds.length === 0) return [...rows];

  try {
    const placeholders = sessionIds.map(() => '?').join(', ');
    const result = await persistence.query<{ session_id: string }>(
      `SELECT session_id
       FROM session_summaries
       WHERE session_id IN (${placeholders})
         AND xp_breakdown IS NOT NULL`,
      sessionIds,
    );
    const alreadyPatched = new Set(
      result.rows
        .map((row) => row.session_id?.trim())
        .filter((sessionId): sessionId is string => Boolean(sessionId && sessionId.length > 0)),
    );
    if (alreadyPatched.size === 0) return [...rows];

    return rows.filter(
      (row) => row.type !== 'XP_BREAKDOWN_COMPUTED' || !alreadyPatched.has(row.session_id),
    );
  } catch {
    return [...rows];
  }
}

// =============================================================================
// Factory (Injection-based)
// =============================================================================

/**
 * Options for creating a HistoryAdapter.
 */
export interface HistoryAdapterOptions {
  /**
   * Optional SyncPort for opportunistic sync after deletions.
   * If not provided, deletions are queued and synced by the background sync.
   */
  syncPort?: SyncPort;
  /**
   * Optional event store reader for faster indexed reads.
   * If provided, uses emt_messages table instead of events_all VIEW.
   */
  eventStore?: {
    readStream(args: {
      streamId: { aggregateType: string; aggregateId: string };
      fromVersion?: bigint;
      maxCount?: bigint;
    }): Promise<{
      currentStreamVersion: bigint;
      streamExists: boolean;
      events: readonly unknown[];
    }>;
  };
}

/**
 * Create a HistoryPort with explicit persistence injection.
 *
 * @param persistence - PersistencePort for DB operations
 * @param options - Optional configuration including SyncPort and eventStore
 */
export function createHistoryAdapter(
  persistence: PersistencePort,
  options?: HistoryAdapterOptions,
): HistoryPort {
  const eventReader = createEventReader(persistence);
  const uiCache = createUiCache(persistence);
  let deletionSyncTimer: ReturnType<typeof setTimeout> | null = null;
  let deletionSyncRequested = false;
  let deletionSyncInFlight = false;

  const scheduleDeletionSync = (): void => {
    const syncPort = options?.syncPort;
    if (!syncPort?.getState().isAvailable) return;

    deletionSyncRequested = true;
    if (deletionSyncTimer) return;

    deletionSyncTimer = setTimeout(() => {
      deletionSyncTimer = null;
      if (!deletionSyncRequested) return;
      if (deletionSyncInFlight) return;
      if (!syncPort.getState().isAvailable) return;

      deletionSyncRequested = false;
      deletionSyncInFlight = true;
      syncPort
        .sync()
        .catch(() => {
          // Silently ignore - background sync will handle this
        })
        .finally(() => {
          deletionSyncInFlight = false;
          if (deletionSyncRequested) {
            scheduleDeletionSync();
          }
        });
    }, 1200);
  };

  // Cache busting when projection logic changes (event-sourced recompute).
  // Keep this tied to SESSION_REPORT_PROJECTION_VERSION on purpose:
  // if report semantics change but this cache version does not move, Stats/History can
  // keep serving an outdated report snapshot even though the event stream is correct.
  const HISTORY_REPORT_CACHE_VERSION = SESSION_REPORT_PROJECTION_VERSION;

  async function getReportRevision(sessionId: string): Promise<string> {
    // Use centralized event-queries for O(1) indexed reads (stream version + event count).
    try {
      const psDb = await requirePowerSyncDb(persistence);
      const [version, count] = await Promise.all([
        getStreamVersion(psDb, `session:${sessionId}`),
        countSessionEvents(psDb, sessionId),
      ]);

      if (count === 0) return '0:0';
      return `events:${count}:${String(version ?? 0n)}`;
    } catch {
      return '0:0';
    }
  }

  async function rebuildReportSnapshotFromEvents(
    sessionId: string,
  ): Promise<SessionEndReportModel | null> {
    // IMPORTANT: Report projection must use the same tolerant read path as summaries.
    // We read raw stored events and normalize them via migrateAndValidateEventBatch (strict=false),
    // so legacy/forward-compatible keys never make historical reports disappear.

    // Read session events from emt_messages via centralized event-queries module.
    let rawEvents: RawVersionedEvent[] = [];
    try {
      const psDb = await requirePowerSyncDb(persistence);
      const eventRows = await getSessionEventsFromEmmettSql(psDb, sessionId);
      rawEvents = eventRows.map((e: EventRow) => ({
        id: e.id,
        sessionId: e.session_id ?? sessionId,
        type: e.type,
        timestamp: Number(e.timestamp),
        schemaVersion: 1,
        ...(typeof e.payload === 'string'
          ? safeJsonParse<Record<string, unknown>>(e.payload, {})
          : e.payload),
      }));
    } catch {
      // Fall through to persistence.getSession()
    }

    // Fallback to persistence.getSession()
    if (rawEvents.length === 0) {
      const storedEvents = await persistence.getSession(sessionId);
      if (storedEvents.length === 0) return null;

      rawEvents = storedEvents.map((e) => ({
        id: e.id,
        sessionId: e.session_id,
        type: e.type,
        timestamp: Number(e.timestamp),
        schemaVersion: (e.payload['schemaVersion'] as number) ?? 1,
        ...e.payload,
      }));
    }

    const batch = migrateAndValidateEventBatch(rawEvents, {
      strict: false,
      logErrors: true,
      targetVersion: 1,
      output: 'canonical',
    });

    if (batch.errorCount > 0) {
      console.warn(
        `[HistoryReport] ${batch.errorCount}/${rawEvents.length} events failed validation for session ${sessionId}`,
        'rawTypes:',
        rawEvents.map((e) => e.type).join(','),
        'validTypes:',
        batch.events.map((e) => e.type).join(','),
      );
    }

    const events = batch.events;
    if (events.length === 0) {
      console.warn(
        `[HistoryReport] ALL events failed validation for session=${sessionId} (${rawEvents.length} raw events, types: ${rawEvents.map((e) => e.type).join(',')})`,
      );
      return null;
    }
    const report = projectSessionReportFromEvents({
      sessionId,
      events,
      // History reports are rebuilt from events; prefer a human-readable label.
      // i18n happens in the app layer, but spec displayName is a better fallback than raw IDs.
      gameModeLabelResolver: (gameMode) => getModeName(gameMode) || gameMode,
    });

    return report;
  }

  // Ready state: false during initial PowerSync sync processing
  // This allows UI to show loading indicator during heavy migrations/rebuilds
  let isReadyState = true; // Default true for local-only mode (no sync processing)

  function getScopedHistoryUserIds(): string[] {
    let userIds: string[] = ['local'];

    if (isSupabaseConfigured()) {
      const authState = supabaseAuthAdapter.getState();
      if (authState.status === 'authenticated') {
        // Keep local sessions visible alongside authenticated sessions.
        // This matches PowerSync query behavior (effectiveUserIdsWithLocal).
        userIds = [authState.session.user.id, 'local'];
      } else {
        // Not authenticated: use 'local' to show sessions created before login
        // Privacy note: After logout, the user's cloud sessions are not visible
        // because they have a different user_id (the authenticated one).
        // Only local sessions (user_id='local') will be shown.
        historyLog.debug(
          'getSessionsFromSQL: Supabase configured but not authenticated, using local userId',
        );
        userIds = ['local'];
      }
    }
    return userIds;
  }

  async function getSessionsFromSQL(filters?: {
    journeyId?: string;
    gameModes?: readonly string[];
  }): Promise<SessionHistoryItem[]> {
    historyLog.debug('getSessionsFromSQL called');

    // Determine userId based on auth configuration:
    // 1. If Supabase is NOT configured → local-only mode, use 'local' as userId
    // 2. If Supabase IS configured:
    //    - authenticated → filter by authenticated userId
    //    - unauthenticated → use 'local' (for local sessions before login)
    const userIds = getScopedHistoryUserIds();
    // Read and merge rows across scoped user IDs, deduplicated by session_id.
    const merged = new Map<
      string,
      Awaited<ReturnType<typeof persistence.getSessionSummaries>>[number]
    >();
    for (const userId of userIds) {
      const rows =
        filters?.journeyId || (filters?.gameModes && filters.gameModes.length > 0)
          ? (
              await persistence.query<
                Awaited<ReturnType<typeof persistence.getSessionSummaries>>[number]
              >(
                `SELECT *
                 FROM session_summaries
                 WHERE reason != 'abandoned'
                   AND ${userId === 'local' ? `user_id = ?` : 'user_id = ?'}
                   ${filters?.journeyId ? 'AND journey_id = ?' : ''}
                   ${
                     filters?.gameModes && filters.gameModes.length > 0
                       ? `AND game_mode IN (${filters.gameModes.map(() => '?').join(', ')})`
                       : ''
                   }
                 ORDER BY created_at DESC`,
                [
                  userId,
                  ...(filters?.journeyId ? [filters.journeyId] : []),
                  ...((filters?.gameModes as readonly string[] | undefined) ?? []),
                ],
              )
            ).rows
          : await persistence.getSessionSummaries(userId);
      for (const row of rows) {
        if (!merged.has(row.session_id)) {
          merged.set(row.session_id, row);
        }
      }
    }

    const rows = Array.from(merged.values()).sort((a, b) => {
      const aMs = parseSqlDateToMs(a.created_at) ?? 0;
      const bMs = parseSqlDateToMs(b.created_at) ?? 0;
      return bMs - aMs;
    });

    historyLog.debug('getSessionsFromSQL returned', rows.length, 'rows');
    const items: SessionHistoryItem[] = [];
    for (const row of rows) {
      try {
        items.push(sessionSummaryRowToHistoryItem(row));
      } catch (error) {
        historyLog.warn(
          `[HistoryAdapter] Skipped corrupt session_summary row (session=${row.session_id})`,
          error,
        );
      }
    }
    return items;
  }

  return {
    async getSessions(): Promise<SessionHistoryItem[]> {
      return getSessionsFromSQL();
    },

    async getJourneySessions(
      journeyId: string,
      options?: { gameModes?: readonly string[] },
    ): Promise<SessionHistoryItem[]> {
      return getSessionsFromSQL({
        journeyId,
        gameModes: options?.gameModes,
      });
    },

    async deleteSession(sessionId: string): Promise<void> {
      await deleteSessionEvents(sessionId);
      historyLog.debug(`Session ${sessionId} deleted locally, scheduling sync`);

      // Opportunistic sync (coalesced): multiple deletes in a burst should trigger
      // one sync operation, not one sync per row deletion.
      scheduleDeletionSync();
    },

    async deleteSessions(sessionIds: readonly string[]): Promise<void> {
      const uniqueSessionIds = Array.from(
        new Set(sessionIds.map((sessionId) => sessionId.trim()).filter((sessionId) => sessionId)),
      );
      if (uniqueSessionIds.length === 0) return;

      await deleteSessionEventsBatch(uniqueSessionIds);
      historyLog.debug(
        `[HistoryAdapter] Batch deleted ${uniqueSessionIds.length} sessions locally, scheduling sync`,
      );

      // Tombstones are already written by persistence for authenticated users.
      // Trigger one coalesced sync after the whole batch instead of one per row.
      scheduleDeletionSync();
    },

    async exportSessions(): Promise<SessionHistoryExport> {
      const sessions = await this.getSessions();
      return exportSessionsToJSON(sessions);
    },

    async importSessions(data: SessionHistoryExport): Promise<ImportResult> {
      const existingSessions = await this.getSessions();

      // Get targetUserId for cloud sync (deterministic IDs + correct user_id)
      const authState = supabaseAuthAdapter.getState();
      const subState = supabaseSubscriptionAdapter.getState();
      const targetUserId =
        authState.status === 'authenticated' && subState.hasCloudSync
          ? authState.session.user.id
          : undefined;

      const result = await importSessionsFromJSON(persistence, data, existingSessions, {
        targetUserId,
      });

      const totalAffected = (result as { totalAffected?: number }).totalAffected ?? 0;
      historyLog.debug(`[importSessions] totalAffected=${totalAffected}`);

      // Large imports: trigger manual sync to reduce cross-device latency
      const syncPort = options?.syncPort;
      if (totalAffected >= 100 && targetUserId && syncPort?.getState().isAvailable) {
        syncPort.sync().catch((err: unknown) => {
          historyLog.warn('[HistoryAdapter] Background sync failed (ignored):', err);
        });
      }

      return result;
    },

    async getReport(sessionId: string): Promise<SessionEndReportModel | null> {
      try {
        const authState = supabaseAuthAdapter.getState();
        const userId =
          isSupabaseConfigured() && authState.status === 'authenticated'
            ? authState.session.user.id
            : 'local';
        const revision = await getReportRevision(sessionId);
        const report = await uiCache.getOrCompute({
          userId,
          kind: 'historyReport',
          key: sessionId,
          revision,
          version: HISTORY_REPORT_CACHE_VERSION,
          compute: async () => {
            // Single source of truth: report is always projected from events.
            return await rebuildReportSnapshotFromEvents(sessionId);
          },
        });
        // DEBUG: surface null reports so we can diagnose via DevTools console
        if (!report) {
          console.warn(
            `[HistoryReport] getReport returned null for session=${sessionId} revision=${revision} userId=${userId}`,
          );
        }
        return report;
      } catch (error) {
        // Important: keep UI resilient (return null) but surface diagnostics in Sentry.
        // In production, infra logger forwards error-level logs to Sentry via __ND_SENTRY_BRIDGE__.
        console.error(`[HistoryReport] getReport THREW for session=${sessionId}`, error);
        historyLog.error(
          '[HistoryReport] Projection failed',
          error instanceof Error ? error : new Error(String(error)),
          { sessionId },
        );
        return null;
      }
    },

    async getSessionEvents(sessionId: string): Promise<unknown[]> {
      return eventReader.getSessionProjectorEvents(sessionId);
    },

    isReady(): boolean {
      return isReadyState;
    },

    setReady(ready: boolean): void {
      const wasReady = isReadyState;
      isReadyState = ready;
      if (!wasReady && ready) {
        historyLog.debug('[HistoryAdapter] Marked as ready - initial sync processing complete');
      } else if (wasReady && !ready) {
        historyLog.debug('[HistoryAdapter] Marked as not ready - sync processing started');
      }
    },
  };
}

// =============================================================================
// PowerSync Watch Integration
// =============================================================================

/**
 * Setup PowerSync watch to detect remotely synced events.
 *
 * When events are synced from other devices via PowerSync:
 * 1. session-end signals are observed from event signals
 * 2. ProjectionProcessor catch-up (checkpoints in emt_subscriptions) updates projections
 * 3. deleted_sessions tombstones are applied in batch
 *
 * PowerSync watched queries in UI auto-update when session_summaries change.
 *
 * @param db - PowerSync database instance (initialized after auth)
 * @param userId - Current user ID for filtering events
 * @param persistence - PersistencePort for session_summaries projection
 * @param historyPort - HistoryPort (used for isReady/setReady lifecycle)
 * @param eventStoreReader - Optional Emmett reader for indexed reads (legacy fallback)
 * @returns Unsubscribe function
 */
export function setupHistoryPowerSyncWatch(
  db: AbstractPowerSyncDatabase,
  userId: string,
  persistence: PersistencePort,
  historyPort: HistoryPort,
  eventStoreReader?: HistoryAdapterOptions['eventStore'],
): () => void {
  historyLog.debug('[PowerSync] Setting up history watch for user:', userId);

  const breathe = async (delayMs = 0): Promise<void> => {
    await yieldToMain();
    // In browsers, allow an extra macrotask so React/passive effects + paint can complete.
    // In tests/SSR, avoid real delays.
    if (delayMs > 0 && typeof window !== 'undefined') {
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    }
  };

  // Watch only session-ending events to keep the dataset small.
  const projectionTriggerTypes = Array.from(HISTORY_PROJECTION_TRIGGER_TYPES);

  const lastSeenSignatureById = new Map<string, string>();
  const seenDeletedSessionIds = new Set<string>();
  let hasReceivedInitialSnapshot = false;
  let hasReceivedDeletedSessionsSnapshot = false;
  let hasReceivedUserResetsSnapshot = false;
  let disposed = false;
  let processing = Promise.resolve();
  let queueDepth = 0;
  let maxQueueDepth = 0;
  let pendingEventSignalRows: PowerSyncEventSignalRow[] | null = null;
  let eventSignalDrainScheduled = false;
  let coalescedEventSignalUpdates = 0;
  let projectionCatchUpScheduled = false;
  let projectionCatchUpDirty = false;
  let projectionCatchUpInvalidateCache = false;
  let projectionCatchUpReasons = new Set<string>();
  let projectionCatchUpCompletion: Promise<void> = Promise.resolve();
  let resolveProjectionCatchUpCompletion: (() => void) | null = null;
  let rejectProjectionCatchUpCompletion: ((error: unknown) => void) | null = null;
  let lastProjectionCatchUpFinishedAtMs = 0;
  const watchStartedAt = nowMs();

  const enqueueProcessingTask = (label: string, task: () => Promise<void>): void => {
    const enqueuedAt = nowMs();
    queueDepth += 1;
    maxQueueDepth = Math.max(maxQueueDepth, queueDepth);

    processing = processing
      .then(async () => {
        const waitMs = nowMs() - enqueuedAt;
        const runStartedAt = nowMs();
        try {
          await withWatchdogContextAsync(`PowerSyncWatch.${label}`, task);
        } finally {
          const runMs = nowMs() - runStartedAt;
          queueDepth = Math.max(0, queueDepth - 1);
          if (runMs > 60 || waitMs > 200) {
            historyLog.debug(
              `[PowerSync][Queue] ${label} wait=${Math.round(waitMs)}ms run=${Math.round(runMs)}ms depth=${queueDepth} max=${maxQueueDepth}`,
            );
          }
        }
      })
      .catch((error) => {
        historyLog.error(`[PowerSync] ${label} processing failed:`, error);
        // Never leave history in a permanently "loading" state after one failed task.
        historyPort.setReady(true);
      });
  };

  const parsePayload = (payload: unknown): Record<string, unknown> => {
    if (!payload) return {};
    if (typeof payload === 'string') {
      const parsed = safeJsonParse<unknown>(payload, {});
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    }
    return typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  };

  // Signature for change detection - uses id, timestamp, deleted only
  // Note: payload is excluded because:
  // 1. PowerSync watch comparator only triggers on id/timestamp/deleted changes
  // 2. JSON.stringify on every payload was causing performance issues with 250+ sessions
  // 3. Payload-only changes don't trigger the watch callback anyway
  const signatureOf = (e: { id?: unknown; timestamp?: unknown; deleted?: unknown }) => {
    const id = e.id == null ? '' : String(e.id);
    const ts = Number.isFinite(Number(e.timestamp)) ? Number(e.timestamp) : 0;
    const deleted = e.deleted === true || Number(e.deleted) === 1 ? 1 : 0;
    return `${id}|${ts}|${deleted}`;
  };

  const INITIAL_CATCH_UP_DELAY_MS = 1_500;
  const EMT_COUNT_TRIGGER_COOLDOWN_MS = 1_500;

  async function ensureProjectionsUpToDate(
    reason: string,
    options?: { invalidateCache?: boolean },
  ): Promise<void> {
    try {
      const report = await withWatchdogStepAsync(
        `PowerSyncWatch.ensureProjectionsUpToDate(${reason})`,
        async () => {
          const { getProcessorEngine } = await import('../es-emmett/processor-engine');
          const engine = getProcessorEngine();
          if (options?.invalidateCache) {
            engine.invalidateCache();
          }
          return engine.ensureUpToDate();
        },
        { warnAfterMs: 1500 },
      );
      if (report.replayed.length > 0) {
        historyLog.info(
          `[PowerSync] Projection replay (${reason}): ${report.replayed.join(', ')} (${
            report.totalEventsProcessed
          } events)`,
        );
      } else if (report.caughtUp.length > 0) {
        historyLog.debug(
          `[PowerSync] Projection catch-up (${reason}): ${report.caughtUp.join(', ')} (${
            report.totalEventsProcessed
          } events)`,
        );
      }
    } catch (error) {
      historyLog.warn(`[PowerSync] Projection ensureUpToDate failed (${reason})`, error);
    }
  }

  const scheduleProjectionCatchUp = (
    reason: string,
    options?: { invalidateCache?: boolean },
  ): Promise<void> => {
    projectionCatchUpDirty = true;
    projectionCatchUpReasons.add(reason);
    if (options?.invalidateCache) {
      projectionCatchUpInvalidateCache = true;
    }

    if (projectionCatchUpScheduled) {
      return projectionCatchUpCompletion;
    }

    projectionCatchUpScheduled = true;
    projectionCatchUpCompletion = new Promise<void>((resolve, reject) => {
      resolveProjectionCatchUpCompletion = resolve;
      rejectProjectionCatchUpCompletion = reject;
    });

    enqueueProcessingTask('projection_catchup', async () => {
      try {
        while (projectionCatchUpDirty && !disposed) {
          projectionCatchUpDirty = false;
          const invalidateCache = projectionCatchUpInvalidateCache;
          projectionCatchUpInvalidateCache = false;
          const reasons = Array.from(projectionCatchUpReasons);
          projectionCatchUpReasons = new Set<string>();
          const mergedReason = reasons.length > 0 ? reasons.join('+') : 'coalesced';
          await ensureProjectionsUpToDate(mergedReason, { invalidateCache });
          lastProjectionCatchUpFinishedAtMs = nowMs();
          await yieldToMain();
        }
        resolveProjectionCatchUpCompletion?.();
      } catch (error) {
        rejectProjectionCatchUpCompletion?.(error);
        throw error;
      } finally {
        projectionCatchUpScheduled = false;
        resolveProjectionCatchUpCompletion = null;
        rejectProjectionCatchUpCompletion = null;
        if (projectionCatchUpDirty && !disposed) {
          scheduleProjectionCatchUp('coalesced');
        }
      }
    });

    return projectionCatchUpCompletion;
  };

  // NOTE: Legacy catch-up helpers below are kept for now; avoid unused-local typecheck failures.
  void drainHistoryProjectionPipeline;

  async function projectSessionEndRawEvent(raw: RawVersionedEvent): Promise<void> {
    const normalizedRawEvent: RawVersionedEvent = {
      ...raw,
      schemaVersion: raw.schemaVersion ?? 1,
    };

    // Validate event before projection
    const validation = migrateAndValidateEvent(normalizedRawEvent, {
      strict: false,
      logErrors: true,
      targetVersion: 1,
    });

    if (!validation.success) {
      historyLog.warn(
        `[historyProjectionRunner] Event validation failed for session ${normalizedRawEvent.sessionId}: ${validation.error}`,
      );
      return;
    }

    try {
      await insertSessionSummaryFromEvent(persistence, validation.event);
    } catch (error) {
      // Do not let a single malformed/legacy session block global projection catch-up.
      // We log and skip this session so subsequent sessions continue to project.
      historyLog.warn(
        `[historyProjectionRunner] Session projection failed for session ${normalizedRawEvent.sessionId}, skipping`,
        error,
      );
    }
  }

  const HISTORY_SUMMARY_CHECKPOINT_META_KEY = `projection:${HISTORY_SUMMARY_PROJECTOR_ID}:global_position`;
  const HISTORY_CATCH_UP_BATCH_SIZE = 200;
  const HISTORY_CATCH_UP_TYPES = Array.from(
    new Set([...SESSION_END_EVENT_TYPES_ARRAY, 'XP_BREAKDOWN_COMPUTED']),
  );

  const toBigIntOr = (value: unknown, fallback: bigint): bigint => {
    try {
      if (typeof value === 'bigint') return value;
      if (typeof value === 'number' && Number.isFinite(value)) return BigInt(value);
      if (typeof value === 'string' && value.length > 0) return BigInt(value);
    } catch {
      // ignore
    }
    return fallback;
  };

  const readHistoryCheckpoint = async (): Promise<bigint> => {
    try {
      const raw = await persistence.getSyncMeta(HISTORY_SUMMARY_CHECKPOINT_META_KEY);
      return raw ? BigInt(raw) : 0n;
    } catch {
      return 0n;
    }
  };

  const writeHistoryCheckpoint = async (pos: bigint): Promise<void> => {
    try {
      await persistence.setSyncMeta(HISTORY_SUMMARY_CHECKPOINT_META_KEY, String(pos));
    } catch {
      // Best-effort: if sync_meta is unavailable in this runtime, projections still work
      // but will not have a durable checkpoint.
    }
  };

  async function catchUpHistorySessionSummaries(
    maxBatches: number,
  ): Promise<{ processedEvents: number; fromGlobalPosition: bigint; toGlobalPosition: bigint }> {
    const fromGlobalPosition = await readHistoryCheckpoint();
    let toGlobalPosition = fromGlobalPosition;
    let processedEvents = 0;
    const sessionsToReproject = new Set<string>();
    const budget = { lastYieldMs: nowMs() };

    for (let batchIndex = 0; batchIndex < maxBatches; batchIndex += 1) {
      const batchRows = await getSessionEndEventsAfterPosition(
        db,
        HISTORY_CATCH_UP_TYPES,
        toGlobalPosition,
        HISTORY_CATCH_UP_BATCH_SIZE,
      );

      if (batchRows.length === 0) {
        break;
      }

      for (const row of batchRows) {
        const pos = toBigIntOr(row.global_position, toGlobalPosition);
        if (pos > toGlobalPosition) {
          toGlobalPosition = pos;
        }

        if (isSessionEndEventType(row.type)) {
          const payload = parsePayload(row.payload);
          await projectSessionEndRawEvent({
            id: row.id,
            sessionId: row.session_id,
            type: row.type,
            timestamp: Number(row.timestamp ?? 0),
            schemaVersion: (payload['schemaVersion'] as number) ?? 1,
            ...payload,
          });
          processedEvents += 1;
          await yieldIfOverBudget(budget);
          continue;
        }

        if (row.type === 'XP_BREAKDOWN_COMPUTED') {
          sessionsToReproject.add(row.session_id);
          await yieldIfOverBudget(budget);
        }
      }

      if (toGlobalPosition !== fromGlobalPosition) {
        await writeHistoryCheckpoint(toGlobalPosition);
      }

      // Slice work across tasks: this runs on the UI thread in web builds.
      await yieldToMain();
    }

    if (sessionsToReproject.size > 0) {
      // Ensure summaries incorporate late system events (journey context, XP breakdown).
      await reprojectSessionSummariesForSessions(Array.from(sessionsToReproject), eventStoreReader);
    }

    return { processedEvents, fromGlobalPosition, toGlobalPosition };
  }

  async function drainHistoryProjectionPipeline(options?: {
    readonly budgetMs?: number;
    readonly maxCycles?: number;
    readonly maxBatches?: number;
  }): Promise<number> {
    // IMPORTANT: This runs on the UI thread in web builds.
    // Do NOT do an unbounded catch-up here: if the checkpoint is behind, projecting can take
    // seconds and will freeze the end-of-game → report transition.
    const budgetMs = Math.max(0, options?.budgetMs ?? 40);
    const maxCycles = Math.max(1, options?.maxCycles ?? 50);
    const maxBatches = Math.max(1, options?.maxBatches ?? 1);
    const deadline = nowMs() + budgetMs;

    let totalProcessed = 0;
    let cycles = 0;

    while (cycles < maxCycles) {
      if (budgetMs > 0 && nowMs() >= deadline) break;
      const summaryResult = await withWatchdogStepAsync(
        `PowerSyncWatch.event_signals:catchUp(batches=${maxBatches})`,
        () => catchUpHistorySessionSummaries(maxBatches),
        { warnAfterMs: 100 },
      );
      totalProcessed += summaryResult.processedEvents;
      cycles += 1;
      if (summaryResult.toGlobalPosition === summaryResult.fromGlobalPosition) break;
      await yieldToMain();
    }

    if (totalProcessed > 0) {
      historyLog.debug(`[historyProjectionRunner] summaries=${totalProcessed}`);
    }

    return totalProcessed;
  }

  async function reprojectSessionSummariesForSessions(
    rawSessionIds: readonly string[],
    eventStoreReader?: HistoryAdapterOptions['eventStore'],
  ): Promise<number> {
    void eventStoreReader;
    const sessionIds = Array.from(
      new Set(
        rawSessionIds
          .map((sessionId) => sessionId?.trim())
          .filter((sessionId): sessionId is string => Boolean(sessionId && sessionId.length > 0)),
      ),
    );
    if (sessionIds.length === 0) return 0;

    let reprojected = 0;

    // Get latest end events via centralized event-queries module (CTE + chunked internally).
    const endTypes = Array.from(SESSION_END_EVENT_TYPES);
    const streamIds = sessionIds.map((id) => `session:${id}`);
    const latestEndEvents = await getLatestEndEventsForSessions(db, streamIds, endTypes);
    const budget = { lastYieldMs: nowMs() };

    for (const latestEndEvent of latestEndEvents) {
      const payload = parsePayload(latestEndEvent.payload);
      await projectSessionEndRawEvent({
        id: latestEndEvent.id,
        sessionId: latestEndEvent.session_id,
        type: latestEndEvent.type,
        timestamp: Number(latestEndEvent.timestamp ?? 0),
        schemaVersion: (payload['schemaVersion'] as number) ?? 1,
        ...payload,
      });
      reprojected += 1;
      await yieldIfOverBudget(budget);
    }

    return reprojected;
  }

  /**
   * Batch delete multiple sessions in a single operation.
   * Much faster than individual deletes for cross-device sync with many tombstones.
   */
  async function applyTombstonesBatch(sessionIds: string[]): Promise<number> {
    if (sessionIds.length === 0) return 0;

    try {
      let hasAnyExistingSummary = false;
      const maxBindVars = 900;
      for (let i = 0; i < sessionIds.length; i += maxBindVars) {
        const chunk = sessionIds.slice(i, i + maxBindVars);
        const placeholders = chunk.map(() => '?').join(', ');
        const existing = await db.getOptional<{ session_id: string }>(
          `SELECT session_id
           FROM session_summaries
           WHERE session_id IN (${placeholders})
           LIMIT 1`,
          chunk,
        );
        if (existing) {
          hasAnyExistingSummary = true;
          break;
        }
      }

      if (!hasAnyExistingSummary) {
        historyLog.debug(
          '[PowerSync] Tombstones already applied, skipping summary delete/stat rebuild',
          sessionIds.length,
        );
        return 0;
      }

      const deleteSessionSummariesTombstonesTx = async (tx: {
        execute(sql: string, params?: unknown[]): Promise<unknown>;
      }) => {
        await bulkDeleteWhereIn(tx, 'session_summaries', 'session_id', sessionIds);
      };
      await persistence.writeTransaction(deleteSessionSummariesTombstonesTx);

      historyLog.debug('[PowerSync] Batch deleted', sessionIds.length, 'sessions from summaries');

      // Rebuild stats projections: tombstones delete from session_summaries but do not
      // decrement user_stats_projection / user_modality_stats_projection incrementally.
      // A full rebuild from the current session_summaries state is the safest approach.
      await rebuildStatsProjectionsForUser(db, userId);

      return sessionIds.length;
    } catch (error) {
      historyLog.warn('[PowerSync] Failed to batch apply tombstones:', error);
      return 0;
    }
  }

  // Watch deleted_sessions tombstones for cross-device deletions
  const unsubscribeDeletedSessions = watchUserDeletedSessions(db, userId, (rows) => {
    historyLog.debug('[PowerSync] deleted_sessions callback received:', rows.length, 'rows');
    enqueueProcessingTask('deleted_sessions', async () => {
      const newTombstones = rows.filter((row) => {
        const seen = seenDeletedSessionIds.has(row.id);
        if (seen) {
          return false;
        }
        seenDeletedSessionIds.add(row.id);
        return true;
      });

      if (newTombstones.length === 0 && hasReceivedDeletedSessionsSnapshot) return;

      // Batch delete all tombstones at once (instead of individual deletes)
      const sessionIds = newTombstones.map((row) => row.session_id);
      const deletedCount = await withWatchdogStepAsync(
        'PowerSyncWatch.deleted_sessions:applyTombstonesBatch',
        () => applyTombstonesBatch(sessionIds),
        { warnAfterMs: 600 },
      );
      historyLog.debug('[PowerSync] Applied', deletedCount, 'tombstones in batch');

      if (!hasReceivedDeletedSessionsSnapshot) {
        hasReceivedDeletedSessionsSnapshot = true;
      }

      // No manual refresh needed: PowerSync watched queries auto-update on SQLite changes.
    });
  });

  // Watch user_resets for cross-device data wipe
  const unsubscribeUserResets = watchUserResets(db, userId, (rows) => {
    enqueueProcessingTask('user_resets', async () => {
      if (!hasReceivedUserResetsSnapshot) {
        hasReceivedUserResetsSnapshot = true;
      }

      const latest = rows[0];
      if (!latest?.reset_at) return;

      const resetAtMs = parseSqlDateToMs(latest.reset_at);
      if (resetAtMs === null) return;

      const lastAppliedMs = getLastAppliedResetAtMs(userId) ?? 0;
      if (resetAtMs <= lastAppliedMs) return;

      // Record first to avoid loops if the wipe succeeds but reload is delayed.
      setLastAppliedResetAtMs(userId, resetAtMs);

      if (typeof window === 'undefined') return;

      historyLog.warn('[PowerSync] Remote reset detected, wiping local device data...');
      const wiped = await wipeLocalDeviceData();
      if (!wiped.success) {
        historyLog.error('[PowerSync] Remote reset local wipe failed:', wiped.error);
        return;
      }

      // Reload to reinitialize persistence cleanly.
      window.location.reload();
    });
  });

  const processEventSignalRows = async (rows: PowerSyncEventSignalRow[]): Promise<void> => {
    const changed = rows.filter((row) => {
      const prev = lastSeenSignatureById.get(row.id);
      const curr = signatureOf(row);
      if (prev === curr) return false;
      lastSeenSignatureById.set(row.id, curr);
      return true;
    });

    const isDeletedRow = (row: { deleted?: unknown }): boolean =>
      row.deleted === true || Number(row.deleted) === 1;

    // Initial snapshot: catch up from emt_messages (global_position checkpoint) to bring read models to latest state.
    if (!hasReceivedInitialSnapshot) {
      hasReceivedInitialSnapshot = true;
      historyLog.debug('[PowerSync] Initial session-end snapshot received:', rows.length);

      // Mark as not ready during initial sync processing
      // UI can use this to show loading indicator instead of empty/stale data
      historyPort.setReady(false);

      // Let the browser commit paint + finish React passive effects before running any heavy DB work.
      await yieldToMain();

      try {
        // Handle deletions first. Prefer deleted_sessions watcher as source of truth.
        // Fallback to event deleted-flag only until deleted_sessions initial snapshot arrives.
        if (!hasReceivedDeletedSessionsSnapshot) {
          const deletedSessionIds = rows
            .filter((row) => isDeletedRow(row as { deleted?: unknown }))
            .map((row) => row.session_id);

          if (deletedSessionIds.length > 0) {
            await withWatchdogStepAsync(
              'PowerSyncWatch.event_signals:applyTombstonesBatch(initial)',
              () => applyTombstonesBatch(deletedSessionIds),
              { warnAfterMs: 100 },
            );
          }
        }

        await ensureProjectionsUpToDate('initial');
        lastProjectionCatchUpFinishedAtMs = nowMs();
      } finally {
        await breathe(40);
        historyPort.setReady(true);
        historyLog.debug(
          `[PowerSync][Perf] History ready t+${Math.round(
            nowMs() - watchStartedAt,
          )}ms queueDepth=${queueDepth} maxQueueDepth=${maxQueueDepth} coalescedSignals=${coalescedEventSignalUpdates}`,
        );
      }

      return;
    }

    if (changed.length === 0) return;

    // Separate deleted vs new/updated rows
    const deletedRows = changed.filter((row) => isDeletedRow(row));

    // Batch delete only as fallback until deleted_sessions watch is online.
    if (!hasReceivedDeletedSessionsSnapshot && deletedRows.length > 0) {
      await withWatchdogStepAsync(
        'PowerSyncWatch.event_signals:applyTombstonesBatch(update)',
        () => applyTombstonesBatch(deletedRows.map((r) => r.session_id)),
        { warnAfterMs: 100 },
      );
    }

    // Process new sessions arriving from sync.
    // The projection processor reads emt_messages from the last checkpoint,
    // so calling ensureUpToDate picks up any events synced since last run.
    const newRows = await filterAlreadyPatchedXpBreakdownSignals(
      persistence,
      changed.filter((row) => !isDeletedRow(row)),
    );
    if (newRows.length > 0) {
      void scheduleProjectionCatchUp('sync', { invalidateCache: true });
    }
  };

  const scheduleEventSignalDrain = (): void => {
    if (eventSignalDrainScheduled || disposed) return;
    eventSignalDrainScheduled = true;

    enqueueProcessingTask('event_signals', async () => {
      try {
        while (pendingEventSignalRows) {
          const rows = pendingEventSignalRows;
          pendingEventSignalRows = null;
          await processEventSignalRows(rows);
          await yieldToMain();
        }
      } finally {
        // Always release the scheduling latch, even if processing throws.
        // Otherwise one transient error can permanently stop future updates.
        eventSignalDrainScheduled = false;
        if (pendingEventSignalRows && !disposed) {
          scheduleEventSignalDrain();
        }
      }
    });
  };

  const unsubscribe = watchUserEventSignalsByTypes(
    db,
    userId,
    projectionTriggerTypes,
    { limit: HISTORY_WATCH_SIGNAL_LIMIT },
    (rows) => {
      if (disposed) return;
      if (pendingEventSignalRows) {
        coalescedEventSignalUpdates += 1;
      }
      pendingEventSignalRows = rows as PowerSyncEventSignalRow[];
      scheduleEventSignalDrain();
    },
  );

  // Secondary trigger: raw emt_messages count (no json_extract = max reliability).
  //
  // PowerSync's change query parser can be flaky on mobile WebView with complex SQL
  // expressions (json_extract, computed columns). This watch is intentionally simple
  // and acts as a "notification only": real work is done by ensureUpToDate().
  let lastRawEmtCount: number | null = null;
  let emtCountTriggerScheduled = false;
  let emtCountTriggerDirty = false;
  const emtCountTriggerTypes = Array.from(HISTORY_PROJECTION_TRIGGER_TYPES);
  const emtCountSignalQuery = buildEventSignalCountQuery(emtCountTriggerTypes);
  const scheduleEmtCountTrigger = (): void => {
    if (disposed) return;
    if (emtCountTriggerScheduled) {
      emtCountTriggerDirty = true;
      return;
    }
    emtCountTriggerScheduled = true;
    setTimeout(() => {
      emtCountTriggerScheduled = false;
      if (disposed) return;
      if (
        projectionCatchUpScheduled ||
        eventSignalDrainScheduled ||
        pendingEventSignalRows !== null
      ) {
        scheduleEmtCountTrigger();
        return;
      }
      if (nowMs() - lastProjectionCatchUpFinishedAtMs < EMT_COUNT_TRIGGER_COOLDOWN_MS) {
        emtCountTriggerDirty = false;
        return;
      }
      const shouldReschedule = emtCountTriggerDirty && !disposed;
      emtCountTriggerDirty = false;
      void scheduleProjectionCatchUp('emt-count-change', { invalidateCache: true });
      if (shouldReschedule) {
        scheduleEmtCountTrigger();
      }
    }, 0);
  };

  const extractCount = (value: unknown): number => {
    const rows = Array.isArray(value)
      ? value
      : (value as { rows?: { _array?: unknown } } | null | undefined)?.rows?._array;
    const arr = Array.isArray(rows) ? rows : [];
    const n = Number((arr[0] as { count?: unknown } | undefined)?.count ?? 0);
    return Number.isFinite(n) ? n : 0;
  };

  const emtCountWatch = db
    .query({
      sql: emtCountSignalQuery.sql,
      parameters: emtCountSignalQuery.params as unknown as (string | number | null)[],
    })
    .watch();
  const unsubEmtCount = emtCountWatch.registerListener({
    onData: (data: unknown) => {
      if (disposed) return;
      const count = extractCount(data);
      if (!hasReceivedInitialSnapshot) {
        lastRawEmtCount = count;
        return;
      }
      if (lastRawEmtCount !== null && count !== lastRawEmtCount) {
        scheduleEmtCountTrigger();
      }
      lastRawEmtCount = count;
    },
    onError: (err: unknown) => {
      historyLog.warn('[PowerSync] emt_messages count watch error (ignored)', err);
    },
  });

  // Periodic catch-up (Emmett subscription safety net).
  //
  // When push triggers are missed (e.g. watcher parser limitation), projections would
  // otherwise stay behind indefinitely. ensureUpToDate is checkpointed and O(1) when up to date.
  const CATCH_UP_INTERVAL_MS = 30_000;
  const catchUpInterval = setInterval(() => {
    if (disposed) return;
    void scheduleProjectionCatchUp('periodic');
  }, CATCH_UP_INTERVAL_MS);

  // Initial catch-up fallback: give the event_signals initial snapshot a short head start
  // so startup does not immediately run two identical projection scans.
  const initialCatchUpTimer = setTimeout(() => {
    if (disposed || hasReceivedInitialSnapshot) return;
    void scheduleProjectionCatchUp('watch-setup');
  }, INITIAL_CATCH_UP_DELAY_MS);

  historyLog.debug(
    `[PowerSync] History watch setup complete (activeWatchers=${getActivePowerSyncWatchSubscriptions()})`,
  );
  return () => {
    disposed = true;
    unsubscribe();
    unsubEmtCount();
    clearInterval(catchUpInterval);
    clearTimeout(initialCatchUpTimer);
    unsubscribeDeletedSessions();
    unsubscribeUserResets();
    historyLog.debug(
      `[PowerSync][Perf] History watch disposed queueDepth=${queueDepth} maxQueueDepth=${maxQueueDepth} coalescedSignals=${coalescedEventSignalUpdates} activeWatchers=${getActivePowerSyncWatchSubscriptions()}`,
    );
  };
}
