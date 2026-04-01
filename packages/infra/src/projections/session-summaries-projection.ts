// packages/infra/src/projections/session-summaries-projection.ts
/**
 * session_summaries Projection (Emmett session_in_progress pattern)
 *
 * Accumulates session events incrementally in `session_in_progress_events` (local-only table).
 * At SESSION_*_ENDED → finalize → insert session_summaries → DELETE session_in_progress_events.
 *
 * Key improvements over the previous version:
 * - Eliminates persistence.getSession() from the hot path (was 1–2 OPFS IPC round-trips per session)
 * - O(total_events) single pass vs O(sessions × events_per_session) repeated reads on replay
 *
 * Upgrade path: sessions started before v18 have no in-progress rows.
 * When they finalize, a one-time fallback read from emt_messages is performed.
 *
 * Pattern (Emmett evolveState):
 *   SESSION_STARTED / intermediates → append session_in_progress_events
 *   SESSION_*_ENDED                 → finalize → insert session_summaries → DELETE in-progress rows
 *   JOURNEY_TRANSITION_DECIDED / XP_BREAKDOWN_COMPUTED (post-finalize)
 *     → UPDATE session_summaries
 */

import type { PersistencePort, SessionSummaryInput } from '@neurodual/logic';
import {
  isSessionEndEventType,
  SESSION_START_EVENT_TYPES,
  migrateAndValidateEventBatch,
  type GameEvent,
  type RawVersionedEvent,
  type SessionImportedEvent,
  projectDualPickSessionToSummaryInput,
  projectFlowSessionToSummaryInput,
  projectImportedSessionToSummaryInput,
  projectRecallSessionToSummaryInput,
  projectTempoSessionToSummaryInput,
  projectTraceSessionToSummaryInput,
  projectOspanSessionToSummaryInput,
} from '@neurodual/logic';
import type { AbstractPowerSyncDatabase } from '@powersync/web';
import { SESSION_SUMMARIES_PROJECTION_VERSION } from '../history/history-projection';
import { cleanupAbandonedSessionById } from '../history/abandoned-cleanup';
import { getPlayContextFromEvents } from '../utils/session-event-helpers';
import { nowMs, yieldIfOverBudget } from '../utils/yield-to-main';
import type { ProjectedEvent, ProjectionDefinition } from './projection-definition';
import { bulkDeleteWhereIn, bulkInsert } from '../db/sql-executor';
import { parseSqlDateToMs, safeJsonParse } from '../db/sql-helpers';
import {
  SESSION_SUMMARY_INSERT_COLUMNS,
  sessionSummaryInsertValues,
} from '../powersync/session-summary-schema';
import {
  loadAppliedProjectionEffectKeys,
  queryRows,
  storeProjectionEffects,
  type ProjectionSqlExecutor,
} from './projection-effects';

// =============================================================================
// Constants
// =============================================================================

/** All session event types – expands canHandle to accumulate full session streams. */
const SESSION_STREAM_EVENT_TYPES: ReadonlySet<string> = new Set([
  // Core N-back
  'SESSION_STARTED',
  'SESSION_ENDED',
  'SESSION_IMPORTED',
  'TRIAL_PRESENTED',
  'USER_RESPONDED',
  'DUPLICATE_RESPONSE_DETECTED',
  'RESPONSE_FILTERED',
  'INPUT_PIPELINE_LATENCY',
  'INPUT_MISFIRED',
  'FOCUS_LOST',
  'FOCUS_REGAINED',
  'USER_STATE_DECLARED',
  'SESSION_PAUSED',
  'SESSION_RESUMED',
  // Recall (Memo)
  'RECALL_SESSION_STARTED',
  'RECALL_STIMULUS_SHOWN',
  'RECALL_STIMULUS_HIDDEN',
  'RECALL_WINDOW_OPENED',
  'RECALL_PICKED',
  'RECALL_WINDOW_COMMITTED',
  'RECALL_CORRECTION_SHOWN',
  'RECALL_SESSION_ENDED',
  'RECALL_PARAMS_UPDATED',
  // Flow/Place
  'FLOW_SESSION_STARTED',
  'FLOW_STIMULUS_SHOWN',
  'FLOW_PLACEMENT_STARTED',
  'FLOW_DROP_ATTEMPTED',
  'FLOW_DRAG_CANCELLED',
  'FLOW_TURN_COMPLETED',
  'FLOW_SESSION_ENDED',
  // Dual-pick
  'DUAL_PICK_SESSION_STARTED',
  'DUAL_PICK_STIMULUS_SHOWN',
  'DUAL_PICK_PLACEMENT_STARTED',
  'DUAL_PICK_DROP_ATTEMPTED',
  'DUAL_PICK_TURN_COMPLETED',
  'DUAL_PICK_SESSION_ENDED',
  // Trace
  'TRACE_SESSION_STARTED',
  'TRACE_STIMULUS_SHOWN',
  'TRACE_STIMULUS_HIDDEN',
  'TRACE_RESPONDED',
  'TRACE_TIMED_OUT',
  'TRACE_PAUSED',
  'TRACE_RESUMED',
  'TRACE_SESSION_ENDED',
  'TRACE_WRITING_STARTED',
  'TRACE_WRITING_COMPLETED',
  'TRACE_WRITING_TIMEOUT',
  'TRACE_ARITHMETIC_STARTED',
  'TRACE_ARITHMETIC_COMPLETED',
  'TRACE_ARITHMETIC_TIMEOUT',
  // Time
  'TIME_SESSION_STARTED',
  'TIME_TRIAL_COMPLETED',
  'TIME_SESSION_ENDED',
  // Track / MOT
  'MOT_SESSION_STARTED',
  'MOT_TRIAL_COMPLETED',
  'MOT_SESSION_ENDED',
  // Corsi Block
  'CORSI_SESSION_STARTED',
  'CORSI_TRIAL_COMPLETED',
  'CORSI_SESSION_ENDED',
  // OSPAN
  'OSPAN_SESSION_STARTED',
  'OSPAN_SET_COMPLETED',
  'OSPAN_SESSION_ENDED',
  // Running Span
  'RUNNING_SPAN_SESSION_STARTED',
  'RUNNING_SPAN_TRIAL_COMPLETED',
  'RUNNING_SPAN_SESSION_ENDED',
  // PASAT
  'PASAT_SESSION_STARTED',
  'PASAT_TRIAL_COMPLETED',
  'PASAT_SESSION_ENDED',
  // SWM
  'SWM_SESSION_STARTED',
  'SWM_ROUND_COMPLETED',
  'SWM_SESSION_ENDED',
  // Generic Cognitive Task
  'COGNITIVE_TASK_SESSION_STARTED',
  'COGNITIVE_TASK_TRIAL_COMPLETED',
  'COGNITIVE_TASK_SESSION_ENDED',
  // Derived / context events
  'XP_BREAKDOWN_COMPUTED',
  // Note: BADGE_UNLOCKED is NOT accumulated here — badges are read directly from
  // emt_messages by the progression adapter and do not contribute to session_summaries.
]);

/** Session start events (any mode). Imported from centralized registry. */
const SESSION_START_TYPES: ReadonlySet<string> = SESSION_START_EVENT_TYPES;

/** Derived context events that may arrive in a later batch, after in-progress rows were deleted. */
const DERIVED_TYPES: ReadonlySet<string> = new Set([
  'JOURNEY_TRANSITION_DECIDED',
  'XP_BREAKDOWN_COMPUTED',
]);

const STATS_PROJECTION_EFFECTS_ID = 'user-stats-v1';
const USER_STATS_PROFILE_SESSIONS_COUNT_COLUMN = 'profile_sessions_count';

let ensuredProfileSessionsCountColumn = false;

// =============================================================================
// FNV-1a hash (stable version key)
// =============================================================================

function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function isMissingColumnError(error: unknown, columnName: string): boolean {
  return (
    error instanceof Error &&
    error.message.includes('no such column') &&
    error.message.includes(columnName)
  );
}

async function hasTableColumn(
  executor: ProjectionSqlExecutor,
  tableName: string,
  columnName: string,
): Promise<boolean> {
  const rows = await queryRows<{ name?: string }>(executor, `PRAGMA table_info(${tableName})`);
  return rows.some((row) => row.name === columnName);
}

async function ensureProfileSessionsCountColumn(executor: ProjectionSqlExecutor): Promise<void> {
  if (ensuredProfileSessionsCountColumn) return;

  if (
    await hasTableColumn(
      executor,
      'user_stats_projection',
      USER_STATS_PROFILE_SESSIONS_COUNT_COLUMN,
    )
  ) {
    ensuredProfileSessionsCountColumn = true;
    return;
  }

  await executor.execute(
    `ALTER TABLE user_stats_projection
       ADD COLUMN profile_sessions_count INTEGER NOT NULL DEFAULT 0`,
  );
  ensuredProfileSessionsCountColumn = true;
}

// =============================================================================
// StoredSessionEvent: compact in-progress format
// =============================================================================

/**
 * Compact event stored in one `session_in_progress_events` row.
 * Abbreviated keys keep the per-row JSON payload small.
 */
interface StoredSessionEvent {
  /** event type */
  t: string;
  /** event data (= ProjectedEvent.data = message_data.data) */
  d: Record<string, unknown>;
  /** globalPosition as decimal string (for ordering and dedup) */
  p: string;
  /** createdAt as Unix timestamp ms */
  c: number;
}

function projectedToStored(event: ProjectedEvent): StoredSessionEvent {
  return {
    t: event.type,
    d: event.data,
    p: String(event.globalPosition),
    c: event.createdAt.getTime(),
  };
}

function storedToRaw(stored: StoredSessionEvent, sessionId: string): RawVersionedEvent {
  const timestamp = typeof stored.d['timestamp'] === 'number' ? stored.d['timestamp'] : stored.c;
  const schemaVersion =
    typeof stored.d['schemaVersion'] === 'number' ? stored.d['schemaVersion'] : 1;
  const id =
    typeof stored.d['id'] === 'string' && (stored.d['id'] as string).trim().length > 0
      ? (stored.d['id'] as string)
      : `${stored.t}:${stored.p}`;
  return {
    ...stored.d,
    id,
    type: stored.t,
    sessionId,
    timestamp,
    schemaVersion,
  };
}

// =============================================================================
// session_in_progress_events helpers (PowerSync local-only append-only rows)
// =============================================================================

function mergeAndSortByPosition(
  existing: StoredSessionEvent[],
  incoming: StoredSessionEvent[],
): StoredSessionEvent[] {
  const byPos = new Map<string, StoredSessionEvent>();
  for (const e of existing) byPos.set(e.p, e);
  for (const e of incoming) byPos.set(e.p, e); // incoming wins on conflict
  // Compare as positive-integer strings: length first, then lexicographic.
  // Avoids BigInt allocation in the hot path.
  return [...byPos.values()].sort((a, b) => a.p.length - b.p.length || a.p.localeCompare(b.p));
}

function compareStoredEventPosition(a: StoredSessionEvent, b: StoredSessionEvent): number {
  return a.p.length - b.p.length || a.p.localeCompare(b.p);
}

function parseStoredEventData(json: string | null | undefined): Record<string, unknown> {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

async function loadSessionsInProgress(
  db: AbstractPowerSyncDatabase,
  sessionIds: readonly string[],
): Promise<Map<string, StoredSessionEvent[]>> {
  const result = new Map<string, StoredSessionEvent[]>();
  if (sessionIds.length === 0) return result;
  const placeholders = sessionIds.map(() => '?').join(', ');
  const rows = await db.getAll<{
    session_id: string;
    event_type: string;
    event_data: string | null;
    global_position: string;
    created_at: number;
  }>(
    `SELECT session_id, event_type, event_data, global_position, created_at
       FROM session_in_progress_events
      WHERE session_id IN (${placeholders})`,
    sessionIds as string[],
  );
  for (const row of rows) {
    const events = result.get(row.session_id) ?? [];
    events.push({
      t: row.event_type,
      d: parseStoredEventData(row.event_data),
      p: row.global_position,
      c: row.created_at,
    });
    result.set(row.session_id, events);
  }
  for (const events of result.values()) {
    events.sort(compareStoredEventPosition);
  }
  return result;
}

// session_in_progress_events writes are inlined inside the batched writeTransaction
// in handle() to produce a single watcher notification.

// =============================================================================
// emt_messages fallback (upgrade path: session started before v18)
// =============================================================================

async function readSessionEventsFromDb(
  db: AbstractPowerSyncDatabase,
  sessionId: string,
): Promise<StoredSessionEvent[]> {
  const rows = await db.getAll<{
    message_type: string;
    message_data: string | null;
    global_position: string;
    created: string | null;
  }>(
    `SELECT message_type, message_data, global_position, created
     FROM emt_messages
     WHERE (stream_id = 'session:' || ? OR stream_id = 'training:session:' || ?) AND message_kind = 'E' AND is_archived = 0
     ORDER BY CAST(global_position AS INTEGER) ASC`,
    [sessionId, sessionId],
  );
  return rows.map((row) => {
    const envelope = safeJsonParse<Record<string, unknown>>(row.message_data ?? '{}', {});
    const parsed = (envelope['data'] as Record<string, unknown>) ?? envelope;
    const c = parseSqlDateToMs(row.created) ?? 0;
    return { t: row.message_type, d: parsed, p: row.global_position, c };
  });
}

// =============================================================================
// Session finalization
// =============================================================================

function resolveUserId(events: readonly StoredSessionEvent[]): string {
  for (const e of events) {
    const uid = e.d['userId'];
    if (typeof uid === 'string' && uid.trim().length > 0) return uid.trim();
  }
  return 'local';
}

interface JourneyRebuildConfig {
  journeyId: string;
  userId: string;
  startLevel: number;
  targetLevel: number;
  gameMode?: string;
  strategyConfig?: Record<string, unknown>;
}

function extractJourneyRebuildConfig(
  events: readonly StoredSessionEvent[],
): JourneyRebuildConfig | null {
  for (const e of events) {
    if (!SESSION_START_TYPES.has(e.t)) continue;
    const d = e.d;
    if (d['playContext'] !== 'journey') return null;
    const journeyId = d['journeyId'];
    const startLevel = d['journeyStartLevel'];
    const targetLevel = d['journeyTargetLevel'];
    const userId = d['userId'];
    if (typeof journeyId !== 'string' || journeyId.trim().length === 0) return null;
    if (typeof startLevel !== 'number' || typeof targetLevel !== 'number') return null;
    const journeyGameMode =
      typeof d['journeyGameMode'] === 'string' ? d['journeyGameMode'] : undefined;
    const stratRaw = d['journeyStrategyConfig'];
    const strategyConfig =
      stratRaw && typeof stratRaw === 'object'
        ? {
            trackSessionsPerBlock: (stratRaw as Record<string, unknown>)['trackSessionsPerBlock'] as
              | number
              | undefined,
            dnbSessionsPerBlock: (stratRaw as Record<string, unknown>)['dnbSessionsPerBlock'] as
              | number
              | undefined,
          }
        : undefined;
    return {
      journeyId,
      userId: typeof userId === 'string' && userId.trim().length > 0 ? userId.trim() : 'local',
      startLevel,
      targetLevel,
      gameMode: journeyGameMode,
      strategyConfig,
    };
  }
  return null;
}

function extractXpBreakdownFromEvents(
  events: readonly GameEvent[],
): Record<string, unknown> | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e?.type === 'XP_BREAKDOWN_COMPUTED') {
      const xp = (e as unknown as { xpBreakdown?: unknown }).xpBreakdown;
      return typeof xp === 'object' && xp !== null ? (xp as Record<string, unknown>) : undefined;
    }
  }
  return undefined;
}

/**
 * Derive nLevel from cognitive task metrics.
 * Checks maxLevel, maxSpan, maxForwardSpan, maxBackwardSpan in order.
 */
function deriveNLevelFromMetrics(metrics: Record<string, unknown>): number {
  for (const key of [
    'reportedLevel',
    'maxLevel',
    'maxSpan',
    'maxForwardSpan',
    'maxBackwardSpan',
  ] as const) {
    const v = metrics[key];
    if (typeof v === 'number' && v >= 1) return Math.round(v);
  }
  return 1;
}

function enrichWithContext(
  summary: SessionSummaryInput,
  gameEvents: readonly GameEvent[],
): SessionSummaryInput {
  let enriched = summary;
  // journeyContext is no longer written to session_summaries — journey state
  // is rebuilt from facts by the journey-state-projection.
  if (enriched.xpBreakdown === undefined) {
    const xp = extractXpBreakdownFromEvents(gameEvents);
    if (xp) enriched = { ...enriched, xpBreakdown: xp };
  }
  return enriched;
}

interface SessionSummaryWriter {
  insert: (summary: SessionSummaryInput) => Promise<void>;
}

// Aggregated finalize timing (flushed by endBatch / handle exit)
const _finalizeTiming = { count: 0, totalMs: 0, validateMs: 0, totalEvents: 0, maxMs: 0 };
function flushFinalizeTiming(): void {
  if (_finalizeTiming.count === 0) return;
  const { count, totalMs, validateMs, totalEvents, maxMs } = _finalizeTiming;
  console.info(
    `[session-summaries] finalizeSession×${count}: total=${Math.round(totalMs)}ms validate=${Math.round(validateMs)}ms max=${Math.round(maxMs)}ms events=${totalEvents}`,
  );
  _finalizeTiming.count = 0;
  _finalizeTiming.totalMs = 0;
  _finalizeTiming.validateMs = 0;
  _finalizeTiming.totalEvents = 0;
  _finalizeTiming.maxMs = 0;
}

async function finalizeSession(
  sessionId: string,
  storedEvents: StoredSessionEvent[],
  persistence: PersistencePort,
  writer: SessionSummaryWriter,
): Promise<void> {
  const finalizeStart = nowMs();
  const userId = resolveUserId(storedEvents);
  const rawEvents: RawVersionedEvent[] = storedEvents.map((e) => storedToRaw(e, sessionId));

  const rawAbandonedEvent = rawEvents.find(
    (rawEvent) => (rawEvent as { reason?: unknown }).reason === 'abandoned',
  );
  if (rawAbandonedEvent) {
    try {
      await cleanupAbandonedSessionById(persistence, sessionId);
    } catch {
      // best-effort cleanup
    }
    return;
  }

  const validateStart = nowMs();
  let gameEvents: GameEvent[];
  try {
    const result = migrateAndValidateEventBatch(rawEvents, {
      strict: false,
      logErrors: true,
      targetVersion: 1,
      output: 'canonical',
    });
    gameEvents = result.events;
  } catch (err) {
    console.warn(`[session-summaries] Validation failed for session ${sessionId}, skipping`, err);
    return;
  }
  const validateMs = nowMs() - validateStart;

  // Skip and clean up abandoned sessions
  const isAbandoned = gameEvents.some(
    (e) => 'reason' in e && (e as unknown as { reason?: unknown }).reason === 'abandoned',
  );
  if (isAbandoned) {
    try {
      await cleanupAbandonedSessionById(persistence, sessionId);
    } catch {
      // best-effort cleanup
    }
    return;
  }

  // Dispatch based on which *_ENDED event exists in the validated stream
  let summary: SessionSummaryInput | null = null;

  const importedEvent = gameEvents.find((e) => e.type === 'SESSION_IMPORTED') as
    | SessionImportedEvent
    | undefined;
  if (importedEvent) {
    summary = enrichWithContext(
      projectImportedSessionToSummaryInput(importedEvent, userId),
      gameEvents,
    );
  } else if (gameEvents.some((e) => e.type === 'SESSION_ENDED')) {
    const raw = projectTempoSessionToSummaryInput({ sessionId, sessionEvents: gameEvents, userId });
    if (raw) summary = enrichWithContext(raw, gameEvents);
  } else if (gameEvents.some((e) => e.type === 'RECALL_SESSION_ENDED')) {
    const raw = projectRecallSessionToSummaryInput({
      sessionId,
      sessionEvents: gameEvents,
      userId,
    });
    if (raw) summary = enrichWithContext(raw, gameEvents);
  } else if (gameEvents.some((e) => e.type === 'FLOW_SESSION_ENDED')) {
    const raw = projectFlowSessionToSummaryInput({ sessionId, sessionEvents: gameEvents, userId });
    if (raw) summary = enrichWithContext(raw, gameEvents);
  } else if (gameEvents.some((e) => e.type === 'DUAL_PICK_SESSION_ENDED')) {
    const raw = projectDualPickSessionToSummaryInput({
      sessionId,
      sessionEvents: gameEvents,
      userId,
    });
    if (raw) summary = enrichWithContext(raw, gameEvents);
  } else if (gameEvents.some((e) => e.type === 'TRACE_SESSION_ENDED')) {
    const raw = projectTraceSessionToSummaryInput({ sessionId, sessionEvents: gameEvents, userId });
    if (raw) summary = enrichWithContext(raw, gameEvents);
  } else if (gameEvents.some((e) => e.type === 'OSPAN_SESSION_ENDED')) {
    const raw = projectOspanSessionToSummaryInput({ sessionId, sessionEvents: gameEvents, userId });
    if (raw) summary = enrichWithContext(raw, gameEvents);
  } else if (gameEvents.some((e) => e.type === 'COGNITIVE_TASK_SESSION_ENDED')) {
    // Generic cognitive task — build summary from the ended event
    const endEvent = gameEvents.find((e) => e.type === 'COGNITIVE_TASK_SESSION_ENDED') as
      | (Record<string, unknown> & {
          taskType?: string;
          accuracy?: number;
          durationMs?: number;
          totalTrials?: number;
          correctTrials?: number;
          metrics?: Record<string, unknown>;
        })
      | undefined;
    const startEvent = gameEvents.find((e) => e.type === 'COGNITIVE_TASK_SESSION_STARTED') as
      | (Record<string, unknown> & {
          config?: {
            taskType?: string;
          };
        })
      | undefined;
    if (endEvent) {
      const taskType = endEvent.taskType ?? 'unknown';
      const accuracy = endEvent.accuracy ?? 0;
      const durationMs = endEvent.durationMs ?? 0;
      const totalTrials = endEvent.totalTrials ?? 0;
      const correctTrials = endEvent.correctTrials ?? 0;
      const startTimestamp =
        typeof startEvent?.['timestamp'] === 'number' ? startEvent['timestamp'] : undefined;
      const endTimestamp =
        typeof endEvent['timestamp'] === 'number' ? endEvent['timestamp'] : undefined;
      const createdAt = startTimestamp ?? endTimestamp ?? Date.now();
      const metrics = (endEvent.metrics ?? {}) as Record<string, unknown>;

      // Derive nLevel from metrics when available
      const nLevel = deriveNLevelFromMetrics(metrics);

      // Extract SDT counts from metrics if available, fallback to simple correct/incorrect
      const totalHits = typeof metrics['hits'] === 'number' ? metrics['hits'] : correctTrials;
      const totalMisses =
        typeof metrics['misses'] === 'number'
          ? metrics['misses']
          : Math.max(0, totalTrials - correctTrials);
      const totalFa = typeof metrics['falseAlarms'] === 'number' ? metrics['falseAlarms'] : 0;
      const totalCr =
        typeof metrics['correctRejections'] === 'number' ? metrics['correctRejections'] : 0;

      // Extract mean RT
      const meanRtMs = endEvent['meanRtMs'];
      const avgResponseTimeMs =
        typeof meanRtMs === 'number' && meanRtMs > 0 ? Math.round(meanRtMs) : undefined;
      const reason = typeof endEvent['reason'] === 'string' ? endEvent['reason'] : undefined;
      const eventPlayContext = getPlayContextFromEvents(gameEvents);
      const playContext =
        endEvent['playContext'] === 'journey' ||
        endEvent['playContext'] === 'free' ||
        endEvent['playContext'] === 'synergy' ||
        endEvent['playContext'] === 'calibration' ||
        endEvent['playContext'] === 'profile'
          ? endEvent['playContext']
          : (eventPlayContext ?? 'free');

      const raw: SessionSummaryInput = {
        sessionId,
        userId,
        sessionType: 'cognitive-task',
        createdAt: new Date(createdAt),
        gameMode: taskType,
        nLevel,
        durationMs,
        accuracy,
        globalDPrime: 0,
        passed: accuracy >= 0.6,
        reason,
        playContext,
        trialsCount: totalTrials,
        totalHits,
        totalMisses,
        totalFa,
        totalCr,
        upsScore: Math.round(accuracy * 100),
        avgResponseTimeMs,
        byModality: {},
      };
      summary = enrichWithContext(raw, gameEvents);
    }
  }

  if (summary) {
    await writer.insert(summary);
  }

  const totalFinalizeMs = nowMs() - finalizeStart;
  _finalizeTiming.count++;
  _finalizeTiming.totalMs += totalFinalizeMs;
  _finalizeTiming.validateMs += validateMs;
  _finalizeTiming.totalEvents += storedEvents.length;
  if (totalFinalizeMs > _finalizeTiming.maxMs) _finalizeTiming.maxMs = totalFinalizeMs;
}

function toJsonOrNull(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed !== 'object' || parsed === null) return null;
      return JSON.stringify(parsed);
    } catch {
      return null;
    }
  }
  if (typeof value !== 'object') return null;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

// =============================================================================
// Stats Projections: incremental update helpers
// =============================================================================

interface ModalityDelta {
  hits: number;
  misses: number;
  fa: number;
  cr: number;
  rtSum: number;
  rtCount: number;
}

/**
 * Update user_stats_projection and user_modality_stats_projection
 * from a batch of newly finalized SessionSummaryInput objects.
 *
 * Called inside the same transaction that upserts `session_summaries`, so the
 * summary table is already logically up-to-date for the active_days query.
 *
 * Pattern (PowerSync local-only view safety):
 *   UPDATE … SET col = col + delta … WHERE id = ?
 *   INSERT OR IGNORE … with initial values
 */
async function updateStatsProjections(
  db: ProjectionSqlExecutor,
  summaries: readonly SessionSummaryInput[],
): Promise<void> {
  const statsStart = nowMs();
  try {
    await ensureProfileSessionsCountColumn(db);
  } catch (error) {
    if (!isMissingColumnError(error, USER_STATS_PROFILE_SESSIONS_COUNT_COLUMN)) {
      throw error;
    }
  }
  // Group by userId; accumulate progression fields for all sessions,
  // stats fields for completed sessions only.
  const byUser = new Map<
    string,
    {
      sessionsDelta: number;
      durationDelta: number;
      hitsDelta: number;
      missesDelta: number;
      faDelta: number;
      crDelta: number;
      upsSum: number;
      upsTrial: number;
      maxNLevel: number;
      lastNLevel: number;
      lastCreatedAt: string | null;
      modality: Map<string, ModalityDelta>;
      // Progression fields (all sessions including abandoned)
      abandonedDelta: number;
      totalTrialsDelta: number;
      totalXpDelta: number;
      firstSessionAt: string | null;
      earlyMorningDelta: number;
      lateNightDelta: number;
      profileSessionsDelta: number;
      newCreatedDates: Set<string>;
    }
  >();

  for (const s of summaries) {
    const userId = s.userId ?? 'local';
    let acc = byUser.get(userId);
    if (!acc) {
      acc = {
        sessionsDelta: 0,
        durationDelta: 0,
        hitsDelta: 0,
        missesDelta: 0,
        faDelta: 0,
        crDelta: 0,
        upsSum: 0,
        upsTrial: 0,
        maxNLevel: 0,
        lastNLevel: 0,
        lastCreatedAt: null,
        modality: new Map(),
        abandonedDelta: 0,
        totalTrialsDelta: 0,
        totalXpDelta: 0,
        firstSessionAt: null,
        earlyMorningDelta: 0,
        lateNightDelta: 0,
        profileSessionsDelta: 0,
        newCreatedDates: new Set<string>(),
      };
      byUser.set(userId, acc);
    }

    // --- Progression fields: ALL sessions (before completed filter) ---
    acc.totalTrialsDelta += s.trialsCount ?? 0;
    const xpBd = s.xpBreakdown;
    if (
      xpBd &&
      typeof xpBd === 'object' &&
      typeof (xpBd as Record<string, unknown>)['total'] === 'number'
    ) {
      acc.totalXpDelta += (xpBd as Record<string, unknown>)['total'] as number;
    }
    const createdAtStr = s.createdAt instanceof Date ? s.createdAt.toISOString() : null;
    if (createdAtStr && (acc.firstSessionAt === null || createdAtStr < acc.firstSessionAt)) {
      acc.firstSessionAt = createdAtStr;
    }
    if (s.reason === 'abandoned') acc.abandonedDelta++;

    // --- Stats fields: completed sessions only ---
    if (s.reason !== undefined && s.reason !== null && s.reason !== 'completed') continue;

    acc.sessionsDelta++;
    if (s.playContext === 'profile') acc.profileSessionsDelta++;
    if (createdAtStr) {
      acc.newCreatedDates.add(createdAtStr.substring(0, 10));
    }
    acc.durationDelta += s.durationMs ?? 0;
    acc.hitsDelta += s.totalHits ?? 0;
    acc.missesDelta += s.totalMisses ?? 0;
    acc.faDelta += s.totalFa ?? 0;
    acc.crDelta += s.totalCr ?? 0;

    const trialCount =
      (s.totalHits ?? 0) + (s.totalMisses ?? 0) + (s.totalFa ?? 0) + (s.totalCr ?? 0);
    if (s.upsScore != null && trialCount > 0) {
      acc.upsSum += s.upsScore * trialCount;
      acc.upsTrial += trialCount;
    }

    if ((s.nLevel ?? 0) > acc.maxNLevel) acc.maxNLevel = s.nLevel ?? 0;

    if (createdAtStr && (acc.lastCreatedAt === null || createdAtStr > acc.lastCreatedAt)) {
      acc.lastCreatedAt = createdAtStr;
      acc.lastNLevel = s.nLevel ?? 0;
    }

    // Time-of-day counters (completed only, UTC hours to match strftime behavior)
    if (createdAtStr) {
      const hour = new Date(createdAtStr).getUTCHours();
      if (hour < 8) acc.earlyMorningDelta++;
      if (hour >= 22 || hour < 5) acc.lateNightDelta++;
    }

    // Per-modality
    if (s.byModality) {
      for (const [mod, data] of Object.entries(s.byModality)) {
        if (typeof data !== 'object' || data === null) continue;
        const d = data as Record<string, unknown>;
        const hits = typeof d['hits'] === 'number' ? d['hits'] : 0;
        const misses = typeof d['misses'] === 'number' ? d['misses'] : 0;
        const fa = typeof d['falseAlarms'] === 'number' ? d['falseAlarms'] : 0;
        const cr = typeof d['correctRejections'] === 'number' ? d['correctRejections'] : 0;
        const avgRT = typeof d['avgRT'] === 'number' ? d['avgRT'] : 0;
        const rtCount = hits + fa;

        let m = acc.modality.get(mod);
        if (!m) {
          m = { hits: 0, misses: 0, fa: 0, cr: 0, rtSum: 0, rtCount: 0 };
          acc.modality.set(mod, m);
        }
        m.hits += hits;
        m.misses += misses;
        m.fa += fa;
        m.cr += cr;
        if (avgRT > 0 && rtCount > 0) {
          m.rtSum += avgRT * rtCount;
          m.rtCount += rtCount;
        }
      }
    }
  }

  for (const [userId, acc] of byUser) {
    if (acc.sessionsDelta === 0 && acc.abandonedDelta === 0 && acc.totalTrialsDelta === 0) continue;

    // --- user_stats_projection ---
    try {
      await db.execute(
        `UPDATE user_stats_projection SET
           sessions_count   = sessions_count + ?,
           total_duration_ms = total_duration_ms + ?,
           max_n_level      = CASE WHEN ? > max_n_level THEN ? ELSE max_n_level END,
           ups_sum          = ups_sum + ?,
           ups_trial_count  = ups_trial_count + ?,
           total_hits       = total_hits + ?,
           total_misses     = total_misses + ?,
           total_fa         = total_fa + ?,
           total_cr         = total_cr + ?,
           last_n_level     = CASE WHEN ? > COALESCE(last_created_at,'') THEN ? ELSE last_n_level END,
           last_created_at  = CASE WHEN ? > COALESCE(last_created_at,'') THEN ? ELSE last_created_at END,
           abandoned_sessions    = abandoned_sessions + ?,
           total_trials          = total_trials + ?,
           total_xp              = total_xp + ?,
           first_session_at      = CASE WHEN ? < COALESCE(first_session_at, '9999-12-31') THEN ? ELSE first_session_at END,
           early_morning_sessions = early_morning_sessions + ?,
           late_night_sessions    = late_night_sessions + ?,
           profile_sessions_count = profile_sessions_count + ?
         WHERE id = ?`,
        [
          acc.sessionsDelta,
          acc.durationDelta,
          acc.maxNLevel,
          acc.maxNLevel,
          acc.upsSum,
          acc.upsTrial,
          acc.hitsDelta,
          acc.missesDelta,
          acc.faDelta,
          acc.crDelta,
          acc.lastCreatedAt,
          acc.lastNLevel,
          acc.lastCreatedAt,
          acc.lastCreatedAt,
          acc.abandonedDelta,
          acc.totalTrialsDelta,
          acc.totalXpDelta,
          acc.firstSessionAt,
          acc.firstSessionAt,
          acc.earlyMorningDelta,
          acc.lateNightDelta,
          acc.profileSessionsDelta,
          userId,
        ],
      );
      await db.execute(
        `INSERT OR IGNORE INTO user_stats_projection
           (id, user_id, sessions_count, total_duration_ms, active_days,
            max_n_level, last_n_level, last_created_at,
            ups_sum, ups_trial_count,
            total_hits, total_misses, total_fa, total_cr,
            abandoned_sessions, total_trials, total_xp, first_session_at,
            early_morning_sessions, late_night_sessions, profile_sessions_count)
         VALUES (?,?,?,?,0,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          userId,
          userId,
          acc.sessionsDelta,
          acc.durationDelta,
          acc.maxNLevel,
          acc.lastNLevel,
          acc.lastCreatedAt,
          acc.upsSum,
          acc.upsTrial,
          acc.hitsDelta,
          acc.missesDelta,
          acc.faDelta,
          acc.crDelta,
          acc.abandonedDelta,
          acc.totalTrialsDelta,
          acc.totalXpDelta,
          acc.firstSessionAt,
          acc.earlyMorningDelta,
          acc.lateNightDelta,
          acc.profileSessionsDelta,
        ],
      );
    } catch (error) {
      if (!isMissingColumnError(error, USER_STATS_PROFILE_SESSIONS_COUNT_COLUMN)) {
        throw error;
      }
      await ensureProfileSessionsCountColumn(db);
      await db.execute(
        `UPDATE user_stats_projection SET
           sessions_count   = sessions_count + ?,
           total_duration_ms = total_duration_ms + ?,
           max_n_level      = CASE WHEN ? > max_n_level THEN ? ELSE max_n_level END,
           ups_sum          = ups_sum + ?,
           ups_trial_count  = ups_trial_count + ?,
           total_hits       = total_hits + ?,
           total_misses     = total_misses + ?,
           total_fa         = total_fa + ?,
           total_cr         = total_cr + ?,
           last_n_level     = CASE WHEN ? > COALESCE(last_created_at,'') THEN ? ELSE last_n_level END,
           last_created_at  = CASE WHEN ? > COALESCE(last_created_at,'') THEN ? ELSE last_created_at END,
           abandoned_sessions    = abandoned_sessions + ?,
           total_trials          = total_trials + ?,
           total_xp              = total_xp + ?,
           first_session_at      = CASE WHEN ? < COALESCE(first_session_at, '9999-12-31') THEN ? ELSE first_session_at END,
           early_morning_sessions = early_morning_sessions + ?,
           late_night_sessions    = late_night_sessions + ?,
           profile_sessions_count = profile_sessions_count + ?
         WHERE id = ?`,
        [
          acc.sessionsDelta,
          acc.durationDelta,
          acc.maxNLevel,
          acc.maxNLevel,
          acc.upsSum,
          acc.upsTrial,
          acc.hitsDelta,
          acc.missesDelta,
          acc.faDelta,
          acc.crDelta,
          acc.lastCreatedAt,
          acc.lastNLevel,
          acc.lastCreatedAt,
          acc.lastCreatedAt,
          acc.abandonedDelta,
          acc.totalTrialsDelta,
          acc.totalXpDelta,
          acc.firstSessionAt,
          acc.firstSessionAt,
          acc.earlyMorningDelta,
          acc.lateNightDelta,
          acc.profileSessionsDelta,
          userId,
        ],
      );
      await db.execute(
        `INSERT OR IGNORE INTO user_stats_projection
           (id, user_id, sessions_count, total_duration_ms, active_days,
            max_n_level, last_n_level, last_created_at,
            ups_sum, ups_trial_count,
            total_hits, total_misses, total_fa, total_cr,
            abandoned_sessions, total_trials, total_xp, first_session_at,
            early_morning_sessions, late_night_sessions, profile_sessions_count)
         VALUES (?,?,?,?,0,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          userId,
          userId,
          acc.sessionsDelta,
          acc.durationDelta,
          acc.maxNLevel,
          acc.lastNLevel,
          acc.lastCreatedAt,
          acc.upsSum,
          acc.upsTrial,
          acc.hitsDelta,
          acc.missesDelta,
          acc.faDelta,
          acc.crDelta,
          acc.abandonedDelta,
          acc.totalTrialsDelta,
          acc.totalXpDelta,
          acc.firstSessionAt,
          acc.earlyMorningDelta,
          acc.lateNightDelta,
          acc.profileSessionsDelta,
        ],
      );
    }

    // active_days: incremental — for each new date in this batch, check if the user
    // already had a completed session on that date (excluding sessions from this batch).
    // Typically 1 date per batch, so this is 1 cheap indexed query instead of a full COUNT(DISTINCT).
    if (acc.newCreatedDates.size > 0) {
      const batchSessionIds = summaries
        .filter((s) => (s.userId ?? 'local') === userId && s.reason === 'completed')
        .map((s) => s.sessionId);
      const batchIdPlaceholders = batchSessionIds.map(() => '?').join(',');

      let newActiveDays = 0;
      for (const date of acc.newCreatedDates) {
        // Check if any completed session existed on this date BEFORE this batch
        const priorRows = await queryRows<{ cnt: number }>(
          db,
          `SELECT COUNT(*) as cnt FROM session_summaries
           WHERE user_id = ? AND reason = 'completed' AND created_date = ?
             AND session_id NOT IN (${batchIdPlaceholders})`,
          [userId, date, ...batchSessionIds],
        );
        if ((priorRows[0]?.cnt ?? 0) === 0) {
          newActiveDays++;
        }
      }

      if (newActiveDays > 0) {
        await db.execute(
          `UPDATE user_stats_projection SET active_days = active_days + ? WHERE id = ?`,
          [newActiveDays, userId],
        );
      }
    }

    // --- user_modality_stats_projection ---
    for (const [mod, delta] of acc.modality) {
      const modId = `${userId}:${mod}`;
      await db.execute(
        `UPDATE user_modality_stats_projection SET
           hits_sum   = hits_sum + ?,
           misses_sum = misses_sum + ?,
           fa_sum     = fa_sum + ?,
           cr_sum     = cr_sum + ?,
           rt_sum     = rt_sum + ?,
           rt_count   = rt_count + ?
         WHERE id = ?`,
        [delta.hits, delta.misses, delta.fa, delta.cr, delta.rtSum, delta.rtCount, modId],
      );
      await db.execute(
        `INSERT OR IGNORE INTO user_modality_stats_projection
           (id, user_id, modality, hits_sum, misses_sum, fa_sum, cr_sum, rt_sum, rt_count)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [
          modId,
          userId,
          mod,
          delta.hits,
          delta.misses,
          delta.fa,
          delta.cr,
          delta.rtSum,
          delta.rtCount,
        ],
      );
    }
  }

  const statsMs = nowMs() - statsStart;
  if (statsMs > 5) {
    console.debug(
      `[session-summaries] updateStatsProjections: ${Math.round(statsMs)}ms summaries=${summaries.length}`,
    );
  }
}

async function writeSummariesAndStatsAtomically(
  persistence: PersistencePort,
  summaries: readonly SessionSummaryInput[],
): Promise<void> {
  if (summaries.length === 0) return;

  const uniqueBySessionId = new Map<string, SessionSummaryInput>();
  for (const summary of summaries) {
    uniqueBySessionId.set(summary.sessionId, summary);
  }
  const uniqueSummaries = [...uniqueBySessionId.values()];
  const sessionIds = uniqueSummaries.map((summary) => summary.sessionId);

  await persistence.writeTransaction(async (tx) => {
    await bulkDeleteWhereIn(tx, 'session_summaries', 'session_id', sessionIds);
    await bulkInsert(
      tx,
      'session_summaries',
      SESSION_SUMMARY_INSERT_COLUMNS,
      uniqueSummaries.map((summary) => sessionSummaryInsertValues(summary)),
    );

    const alreadyApplied = await loadAppliedProjectionEffectKeys(
      tx,
      STATS_PROJECTION_EFFECTS_ID,
      sessionIds,
    );
    const freshSummaries = uniqueSummaries.filter(
      (summary) => !alreadyApplied.has(summary.sessionId),
    );

    if (freshSummaries.length > 0) {
      await updateStatsProjections(tx, freshSummaries);
      await storeProjectionEffects(
        tx,
        STATS_PROJECTION_EFFECTS_ID,
        freshSummaries.map((summary) => summary.sessionId),
      );
    }
  });
}

// =============================================================================
// Projection Definition
// =============================================================================

export function createSessionSummariesProjectionDefinition(
  persistence: PersistencePort,
): ProjectionDefinition {
  // Batch mode state: when active, summaries are accumulated in memory
  // and flushed once via endBatch() instead of being written per handle() call.
  let batchMode = false;
  let pendingSummaries: SessionSummaryInput[] = [];
  let pendingJourneyRebuildConfigs = new Map<string, JourneyRebuildConfig>();

  async function rebuildAffectedProjections(
    _db: AbstractPowerSyncDatabase,
    _journeyRebuildConfigs: ReadonlyMap<string, JourneyRebuildConfig>,
  ): Promise<void> {
    // Journey projection rebuild removed (journey module deleted)
  }

  return {
    id: 'session-summaries',
    // ':sip-v4' suffix forces a one-time full replay to rebuild user_stats_projection
    // with profile_sessions_count column.
    version: fnv1a32(`${String(SESSION_SUMMARIES_PROJECTION_VERSION)}:sip-v4`),
    canHandle: SESSION_STREAM_EVENT_TYPES,

    beginBatch() {
      batchMode = true;
      pendingSummaries = [];
      pendingJourneyRebuildConfigs = new Map();
    },

    async endBatch(db: AbstractPowerSyncDatabase): Promise<void> {
      batchMode = false;
      flushFinalizeTiming();
      const toFlush = pendingSummaries;
      const journeysToRebuild = pendingJourneyRebuildConfigs;
      pendingSummaries = [];
      pendingJourneyRebuildConfigs = new Map();

      if (toFlush.length > 0) {
        await writeSummariesAndStatsAtomically(persistence, toFlush);
      }

      await rebuildAffectedProjections(db, journeysToRebuild);
    },

    async handle(events: readonly ProjectedEvent[], db: AbstractPowerSyncDatabase): Promise<void> {
      if (events.length === 0) return;

      // Phase 1: Group incoming events by sessionId
      const eventsBySessionId = new Map<string, ProjectedEvent[]>();
      for (const event of events) {
        const raw = event.data['sessionId'];
        if (typeof raw !== 'string' || raw.trim().length === 0) continue;
        const sessionId = raw.trim();
        const existing = eventsBySessionId.get(sessionId) ?? [];
        existing.push(event);
        eventsBySessionId.set(sessionId, existing);
      }
      if (eventsBySessionId.size === 0) return;

      // Phase 2: Batch-load existing in-progress rows
      const sessionIds = [...eventsBySessionId.keys()];
      const inProgressMap = await loadSessionsInProgress(db, sessionIds);

      const summariesToInsert: SessionSummaryInput[] = [];
      const journeyRebuildConfigs = new Map<string, JourneyRebuildConfig>();
      const writer: SessionSummaryWriter = {
        insert: async (summary) => {
          summariesToInsert.push(summary);
        },
      };

      const budget = { lastYieldMs: nowMs() };

      // Collect write operations to batch in a single writeTransaction.
      // This produces ONE watcher notification instead of N individual ones,
      // dramatically reducing React re-render cascades during sync catch-up.
      const sipInserts: Array<{
        id: string;
        sessionId: string;
        eventType: string;
        eventData: string;
        globalPosition: string;
        createdAt: number;
      }> = [];
      const sipDeletes: string[] = [];
      const derivedUpdates: Array<{
        sessionId: string;
        journeyJson: string | null;
        xpJson: string | null;
      }> = [];

      // Phase 3: Per-session logic
      for (const [sessionId, sessionEvents] of eventsBySessionId) {
        const existingFromDb = inProgressMap.get(sessionId) ?? [];
        const newStored = sessionEvents.map(projectedToStored);
        const allEvents = mergeAndSortByPosition(existingFromDb, newStored);

        const hasSessionEndInNew = newStored.some((e) => isSessionEndEventType(e.t));

        if (hasSessionEndInNew) {
          // Finalize this session.
          // Upgrade path: if no start event is present (session started before v18),
          // fall back to reading all events from emt_messages.
          let finalEvents = allEvents;
          if (!allEvents.some((e) => SESSION_START_TYPES.has(e.t))) {
            try {
              const fromDb = await readSessionEventsFromDb(db, sessionId);
              if (fromDb.length > 0) {
                finalEvents = mergeAndSortByPosition(allEvents, fromDb);
              }
            } catch (err) {
              console.warn(
                `[session-summaries] emt_messages fallback failed for session ${sessionId}`,
                err,
              );
            }
          }

          try {
            await finalizeSession(sessionId, finalEvents, persistence, writer);
            // Collect journey rebuild config from finalized events
            const rebuildConfig = extractJourneyRebuildConfig(finalEvents);
            if (rebuildConfig) {
              journeyRebuildConfigs.set(rebuildConfig.journeyId, rebuildConfig);
            }
          } catch (err) {
            console.warn(
              `[session-summaries] Finalization failed for session ${sessionId}, skipping`,
              err,
            );
          }

          // Always delete in-progress state regardless of projection outcome
          sipDeletes.push(sessionId);
        } else if (newStored.every((e) => DERIVED_TYPES.has(e.t))) {
          // Derived events arriving after finalization.
          // after session finalization (in-progress rows already deleted).
          if (existingFromDb.length === 0) {
            // Targeted UPDATE on the already-finalized session_summaries row.
            // Note: JOURNEY_TRANSITION_DECIDED is no longer written to journey_context —
            // journey state is rebuilt from session_summaries by the fact-driven projection.
            const xpEvent = newStored.find((e) => e.t === 'XP_BREAKDOWN_COMPUTED');
            const xpJson = xpEvent ? toJsonOrNull(xpEvent.d['xpBreakdown']) : null;

            if (xpJson) {
              derivedUpdates.push({ sessionId, journeyJson: null, xpJson });
            }
          } else {
            // Derived events while session is still in progress → append rows
            for (const event of newStored) {
              sipInserts.push({
                id: `${sessionId}:${event.p}`,
                sessionId,
                eventType: event.t,
                eventData: JSON.stringify(event.d),
                globalPosition: event.p,
                createdAt: event.c,
              });
            }
          }
        } else {
          // Regular intermediate events → append rows to session_in_progress_events
          for (const event of newStored) {
            sipInserts.push({
              id: `${sessionId}:${event.p}`,
              sessionId,
              eventType: event.t,
              eventData: JSON.stringify(event.d),
              globalPosition: event.p,
              createdAt: event.c,
            });
          }
        }

        await yieldIfOverBudget(budget);
      }

      // Phase 3.5: Execute all in-progress writes in a single transaction.
      // One watcher notification instead of N individual SQL executions.
      if (sipInserts.length > 0 || sipDeletes.length > 0 || derivedUpdates.length > 0) {
        const executeBatch = async (exec: { execute: typeof db.execute }) => {
          const INSERT_BATCH_SIZE = 120;
          for (let i = 0; i < sipInserts.length; i += INSERT_BATCH_SIZE) {
            const chunk = sipInserts.slice(i, i + INSERT_BATCH_SIZE);
            const valuesSql = chunk.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
            const params = chunk.flatMap((op) => [
              op.id,
              op.sessionId,
              op.eventType,
              op.eventData,
              op.globalPosition,
              op.createdAt,
            ]);
            await exec.execute(
              `INSERT OR IGNORE INTO session_in_progress_events
                 (id, session_id, event_type, event_data, global_position, created_at)
               VALUES ${valuesSql}`,
              params,
            );
          }

          if (sipDeletes.length > 0) {
            const DELETE_BATCH_SIZE = 200;
            for (let i = 0; i < sipDeletes.length; i += DELETE_BATCH_SIZE) {
              const chunk = sipDeletes.slice(i, i + DELETE_BATCH_SIZE);
              const placeholders = chunk.map(() => '?').join(', ');
              await exec.execute(
                `DELETE FROM session_in_progress_events WHERE session_id IN (${placeholders})`,
                chunk,
              );
            }
          }

          for (const update of derivedUpdates) {
            if (update.journeyJson) {
              await exec.execute(
                `UPDATE session_summaries SET journey_context = ? WHERE session_id = ?`,
                [update.journeyJson, update.sessionId],
              );
            }
            if (update.xpJson) {
              await exec.execute(
                `UPDATE session_summaries SET xp_breakdown = ? WHERE session_id = ?`,
                [update.xpJson, update.sessionId],
              );
            }
          }
        };

        if (typeof db.writeTransaction === 'function') {
          const writeSessionInProgressBatchTx = async (tx: { execute: typeof db.execute }) =>
            executeBatch(tx);
          await db.writeTransaction(writeSessionInProgressBatchTx);
        } else {
          await executeBatch(db);
        }
      }

      // Phase 4: Batch-insert all finalized summaries + update stats projections.
      // In batch mode (catch-up), defer to endBatch() for a single UI update.
      if (summariesToInsert.length > 0) {
        if (batchMode) {
          pendingSummaries.push(...summariesToInsert);
        } else {
          await writeSummariesAndStatsAtomically(persistence, summariesToInsert);
        }
      }
      if (!batchMode) flushFinalizeTiming();

      // Phase 5: Rebuild projections that still depend on persisted session_summaries.
      // The cognitive profile now rebuilds directly from Emmett session streams.
      if (batchMode) {
        for (const config of journeyRebuildConfigs.values()) {
          pendingJourneyRebuildConfigs.set(config.journeyId, config);
        }
      } else {
        await rebuildAffectedProjections(db, journeyRebuildConfigs);
      }
    },

    // "Reproject in place": clear intermediate + stats projection tables.
    // session_summaries is NOT cleared to avoid blanking the UI while replay catches up.
    // Stats projections are rebuilt incrementally as sessions are re-finalized during replay.
    async truncate(db: AbstractPowerSyncDatabase): Promise<void> {
      await db.execute(`DELETE FROM session_in_progress_events`);
      await db.execute(`DELETE FROM user_stats_projection`);
      await db.execute(`DELETE FROM user_modality_stats_projection`);
      await db.execute(`DELETE FROM cognitive_profile_projection`);
      await db.execute(`DELETE FROM projection_effects WHERE projection_id = ?`, [
        STATS_PROJECTION_EFFECTS_ID,
      ]);
    },
  };
}

// =============================================================================
// Stats Projection Rebuild (after session deletion)
// =============================================================================

/**
 * Rebuild user_stats_projection and user_modality_stats_projection from
 * the current state of session_summaries for a given user.
 *
 * Call this after deleting sessions so that stats reflect the remaining data.
 * Best-effort — the stats adapter has a slow-path fallback when projections are missing.
 */
export async function rebuildStatsProjectionsForUser(
  db: AbstractPowerSyncDatabase,
  userId: string,
): Promise<void> {
  // --- user_stats_projection ---
  await db.execute(`DELETE FROM user_stats_projection WHERE id = ?`, [userId]);
  await db.execute(
    `INSERT INTO user_stats_projection
       (id, user_id, sessions_count, total_duration_ms, active_days,
        max_n_level, last_n_level, last_created_at,
        ups_sum, ups_trial_count,
        total_hits, total_misses, total_fa, total_cr,
        profile_sessions_count)
     SELECT
       s.user_id, s.user_id,
       COUNT(*),
       COALESCE(SUM(s.duration_ms), 0),
       COUNT(DISTINCT s.created_date),
       COALESCE(MAX(s.n_level), 0),
       COALESCE((
         SELECT s2.n_level FROM session_summaries s2
         WHERE s2.user_id = s.user_id AND s2.reason = 'completed'
         ORDER BY s2.created_at DESC LIMIT 1
       ), 0),
       (SELECT s2.created_at FROM session_summaries s2
        WHERE s2.user_id = s.user_id AND s2.reason = 'completed'
        ORDER BY s2.created_at DESC LIMIT 1),
       COALESCE(SUM(CASE WHEN s.ups_score IS NOT NULL
         THEN s.ups_score * (COALESCE(s.total_hits,0) + COALESCE(s.total_misses,0)
                             + COALESCE(s.total_fa,0) + COALESCE(s.total_cr,0))
         ELSE 0 END), 0),
       COALESCE(SUM(CASE WHEN s.ups_score IS NOT NULL
         THEN (COALESCE(s.total_hits,0) + COALESCE(s.total_misses,0)
               + COALESCE(s.total_fa,0) + COALESCE(s.total_cr,0))
         ELSE 0 END), 0),
       COALESCE(SUM(s.total_hits), 0),
       COALESCE(SUM(s.total_misses), 0),
       COALESCE(SUM(s.total_fa), 0),
       COALESCE(SUM(s.total_cr), 0),
       COALESCE(SUM(CASE WHEN s.play_context = 'profile' THEN 1 ELSE 0 END), 0)
     FROM session_summaries s
     WHERE s.user_id = ? AND s.reason = 'completed'
     GROUP BY s.user_id`,
    [userId],
  );

  // --- user_modality_stats_projection ---
  await db.execute(`DELETE FROM user_modality_stats_projection WHERE user_id = ?`, [userId]);
  await db.execute(
    `INSERT INTO user_modality_stats_projection
       (id, user_id, modality, hits_sum, misses_sum, fa_sum, cr_sum, rt_sum, rt_count)
     SELECT
       s.user_id || ':' || km.m,
       s.user_id,
       km.m,
       COALESCE(SUM(CAST(json_extract(s.by_modality, '$.' || km.m || '.hits') AS INTEGER)), 0),
       COALESCE(SUM(CAST(json_extract(s.by_modality, '$.' || km.m || '.misses') AS INTEGER)), 0),
       COALESCE(SUM(CAST(json_extract(s.by_modality, '$.' || km.m || '.falseAlarms') AS INTEGER)), 0),
       COALESCE(SUM(CAST(json_extract(s.by_modality, '$.' || km.m || '.correctRejections') AS INTEGER)), 0),
       COALESCE(SUM(
         CASE
           WHEN CAST(json_extract(s.by_modality, '$.' || km.m || '.avgRT') AS REAL) > 0
            AND (CAST(json_extract(s.by_modality, '$.' || km.m || '.hits') AS INTEGER)
               + CAST(json_extract(s.by_modality, '$.' || km.m || '.falseAlarms') AS INTEGER)) > 0
           THEN CAST(json_extract(s.by_modality, '$.' || km.m || '.avgRT') AS REAL)
              * (CAST(json_extract(s.by_modality, '$.' || km.m || '.hits') AS INTEGER)
               + CAST(json_extract(s.by_modality, '$.' || km.m || '.falseAlarms') AS INTEGER))
           ELSE 0
         END
       ), 0),
       COALESCE(SUM(
         CASE
           WHEN CAST(json_extract(s.by_modality, '$.' || km.m || '.avgRT') AS REAL) > 0
            AND (CAST(json_extract(s.by_modality, '$.' || km.m || '.hits') AS INTEGER)
               + CAST(json_extract(s.by_modality, '$.' || km.m || '.falseAlarms') AS INTEGER)) > 0
           THEN (CAST(json_extract(s.by_modality, '$.' || km.m || '.hits') AS INTEGER)
               + CAST(json_extract(s.by_modality, '$.' || km.m || '.falseAlarms') AS INTEGER))
           ELSE 0
         END
       ), 0)
     FROM session_summaries s
     JOIN (
       SELECT 'position' m UNION ALL SELECT 'audio'
       UNION ALL SELECT 'color' UNION ALL SELECT 'image'
     ) km ON json_extract(s.by_modality, '$.' || km.m) IS NOT NULL
          AND s.by_modality IS NOT NULL
          AND s.by_modality != ''
     WHERE s.user_id = ? AND s.reason = 'completed'
     GROUP BY s.user_id, km.m`,
    [userId],
  );
}
