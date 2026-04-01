/**
 * SessionWriter — direct SQLite write path replacing Emmett event sourcing.
 *
 * A single writeTransaction atomically persists:
 * - session_events (raw events JSON blob for replay)
 * - session_summaries (projected summary)
 * - user_stats_projection + user_modality_stats_projection (incremental deltas)
 * - streak_projection
 * - daily_activity_projection
 * - n_level_projection
 *
 * Cognitive profile updates (calibration) are handled via the existing
 * applyProfileSessionDirectly / applyBaselineDirectly functions which
 * already bypass the ES.
 */

import type { AbstractPowerSyncDatabase } from '@powersync/web';
import type {
  GameEvent,
  RawVersionedEvent,
  SessionSummaryInput,
  SessionImportedEvent,
} from '@neurodual/logic';
import {
  migrateAndValidateEventBatch,
  projectTempoSessionToSummaryInput,
  projectRecallSessionToSummaryInput,
  projectFlowSessionToSummaryInput,
  projectDualPickSessionToSummaryInput,
  projectTraceSessionToSummaryInput,
  projectOspanSessionToSummaryInput,
  projectImportedSessionToSummaryInput,
} from '@neurodual/logic';
import {
  SESSION_SUMMARY_INSERT_COLUMNS,
  sessionSummaryInsertValues,
} from '../powersync/session-summary-schema';
import { computeStreak } from '../projections/projection-manager';
import { computeNLevel } from '../projections/projection-manager';
import { getPlayContextFromEvents } from '../utils/session-event-helpers';

// =============================================================================
// Types
// =============================================================================

export interface SessionWriterDeps {
  readonly db: AbstractPowerSyncDatabase;
}

export interface FinalizeSessionResult {
  readonly sessionId: string;
  readonly summary: SessionSummaryInput | null;
  readonly wasAbandoned: boolean;
}

// =============================================================================
// Event → Summary projection (extracted from session-summaries-projection.ts)
// =============================================================================

function resolveUserId(events: readonly Record<string, unknown>[]): string {
  for (const e of events) {
    const uid = e['userId'];
    if (typeof uid === 'string' && uid.trim().length > 0) return uid.trim();
  }
  return 'local';
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
  if (enriched.xpBreakdown === undefined) {
    const xp = extractXpBreakdownFromEvents(gameEvents);
    if (xp) enriched = { ...enriched, xpBreakdown: xp };
  }
  return enriched;
}

function projectEventsToSummary(
  sessionId: string,
  gameEvents: readonly GameEvent[],
  userId: string,
): SessionSummaryInput | null {
  const importedEvent = gameEvents.find((e) => e.type === 'SESSION_IMPORTED') as
    | SessionImportedEvent
    | undefined;

  if (importedEvent) {
    return enrichWithContext(projectImportedSessionToSummaryInput(importedEvent, userId), gameEvents);
  }
  if (gameEvents.some((e) => e.type === 'SESSION_ENDED')) {
    const raw = projectTempoSessionToSummaryInput({ sessionId, sessionEvents: gameEvents, userId });
    return raw ? enrichWithContext(raw, gameEvents) : null;
  }
  if (gameEvents.some((e) => e.type === 'RECALL_SESSION_ENDED')) {
    const raw = projectRecallSessionToSummaryInput({ sessionId, sessionEvents: gameEvents, userId });
    return raw ? enrichWithContext(raw, gameEvents) : null;
  }
  if (gameEvents.some((e) => e.type === 'FLOW_SESSION_ENDED')) {
    const raw = projectFlowSessionToSummaryInput({ sessionId, sessionEvents: gameEvents, userId });
    return raw ? enrichWithContext(raw, gameEvents) : null;
  }
  if (gameEvents.some((e) => e.type === 'DUAL_PICK_SESSION_ENDED')) {
    const raw = projectDualPickSessionToSummaryInput({ sessionId, sessionEvents: gameEvents, userId });
    return raw ? enrichWithContext(raw, gameEvents) : null;
  }
  if (gameEvents.some((e) => e.type === 'TRACE_SESSION_ENDED')) {
    const raw = projectTraceSessionToSummaryInput({ sessionId, sessionEvents: gameEvents, userId });
    return raw ? enrichWithContext(raw, gameEvents) : null;
  }
  if (gameEvents.some((e) => e.type === 'OSPAN_SESSION_ENDED')) {
    const raw = projectOspanSessionToSummaryInput({ sessionId, sessionEvents: gameEvents, userId });
    return raw ? enrichWithContext(raw, gameEvents) : null;
  }
  if (gameEvents.some((e) => e.type === 'COGNITIVE_TASK_SESSION_ENDED')) {
    return projectCognitiveTaskSummary(sessionId, gameEvents, userId);
  }
  return null;
}

function projectCognitiveTaskSummary(
  sessionId: string,
  gameEvents: readonly GameEvent[],
  userId: string,
): SessionSummaryInput | null {
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
    | (Record<string, unknown> & { config?: { taskType?: string } })
    | undefined;
  if (!endEvent) return null;

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
  const nLevel = deriveNLevelFromMetrics(metrics);

  const totalHits = typeof metrics['hits'] === 'number' ? metrics['hits'] : correctTrials;
  const totalMisses =
    typeof metrics['misses'] === 'number' ? metrics['misses'] : Math.max(0, totalTrials - correctTrials);
  const totalFa = typeof metrics['falseAlarms'] === 'number' ? metrics['falseAlarms'] : 0;
  const totalCr = typeof metrics['correctRejections'] === 'number' ? metrics['correctRejections'] : 0;
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
  return enrichWithContext(raw, gameEvents);
}

// =============================================================================
// Incremental projection updates
// =============================================================================

type SqlExecutor = {
  execute: (sql: string, params?: (string | number | null | undefined)[]) => Promise<unknown>;
};

async function updateStreak(tx: SqlExecutor, eventDate: string): Promise<void> {
  // Read current state
  const result = await tx.execute(
    "SELECT current_streak, best_streak, last_active_date FROM streak_projection WHERE id = '1'",
  ) as { rows?: { current_streak: number; best_streak: number; last_active_date: string | null }[] };
  const rows = (result as unknown as { rows?: unknown[] }).rows as
    | { current_streak: number; best_streak: number; last_active_date: string | null }[]
    | undefined;
  const row = rows?.[0];

  const current = row
    ? { currentStreak: row.current_streak ?? 0, bestStreak: row.best_streak ?? 0, lastActiveDate: row.last_active_date ?? null }
    : { currentStreak: 0, bestStreak: 0, lastActiveDate: null };

  const next = computeStreak(current, eventDate);

  await tx.execute(
    `INSERT OR IGNORE INTO streak_projection (id, current_streak, best_streak, last_active_date)
     VALUES ('1', 0, 0, NULL)`,
  );
  await tx.execute(
    `UPDATE streak_projection SET current_streak = ?, best_streak = ?, last_active_date = ? WHERE id = '1'`,
    [next.currentStreak, next.bestStreak, next.lastActiveDate],
  );
}

async function updateDailyActivity(
  tx: SqlExecutor,
  eventDate: string,
  durationMs: number,
): Promise<void> {
  await tx.execute(
    `INSERT OR IGNORE INTO daily_activity_projection (date, sessions_count, total_duration_ms)
     VALUES (?, 0, 0)`,
    [eventDate],
  );
  await tx.execute(
    `UPDATE daily_activity_projection
     SET sessions_count = COALESCE(sessions_count, 0) + 1,
         total_duration_ms = COALESCE(total_duration_ms, 0) + ?
     WHERE date = ?`,
    [durationMs, eventDate],
  );
}

async function updateNLevel(
  tx: SqlExecutor,
  userId: string,
  nLevel: number,
  accuracy: number,
  eventDate: string,
): Promise<void> {
  if (nLevel === undefined || accuracy === undefined) return;

  const key = `${userId}:${nLevel}`;
  const result = await tx.execute(
    'SELECT strikes_below_50, strikes_above_80, recommended_level FROM n_level_projection WHERE id = ?',
    [key],
  ) as unknown;
  const rows = (result as { rows?: unknown[] }).rows as
    | { strikes_below_50: number; strikes_above_80: number; recommended_level: number }[]
    | undefined;
  const row = rows?.[0];

  const current = row ?? { strikes_below_50: 0, strikes_above_80: 0, recommended_level: nLevel };
  const next = computeNLevel(current, accuracy, nLevel);

  await tx.execute(
    `INSERT OR IGNORE INTO n_level_projection (id, user_id, n_level, strikes_below_50, strikes_above_80, recommended_level, last_updated)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [key, userId, nLevel, next.strikes_below_50, next.strikes_above_80, next.recommended_level, eventDate],
  );
  await tx.execute(
    `UPDATE n_level_projection
     SET strikes_below_50 = ?, strikes_above_80 = ?, recommended_level = ?, last_updated = ?
     WHERE id = ?`,
    [next.strikes_below_50, next.strikes_above_80, next.recommended_level, eventDate, key],
  );
}

async function updateUserStats(
  tx: SqlExecutor,
  summary: SessionSummaryInput,
): Promise<void> {
  const userId = summary.userId ?? 'local';
  const isCompleted = summary.reason === undefined || summary.reason === null || summary.reason === 'completed';
  const createdAtStr = summary.createdAt.toISOString();

  const sessionsDelta = isCompleted ? 1 : 0;
  const durationDelta = isCompleted ? (summary.durationMs ?? 0) : 0;
  const hitsDelta = isCompleted ? (summary.totalHits ?? 0) : 0;
  const missesDelta = isCompleted ? (summary.totalMisses ?? 0) : 0;
  const faDelta = isCompleted ? (summary.totalFa ?? 0) : 0;
  const crDelta = isCompleted ? (summary.totalCr ?? 0) : 0;
  const maxNLevel = isCompleted ? (summary.nLevel ?? 0) : 0;
  const lastNLevel = isCompleted ? (summary.nLevel ?? 0) : 0;
  const lastCreatedAt = isCompleted ? createdAtStr : null;

  const trialCount = hitsDelta + missesDelta + faDelta + crDelta;
  const upsSum = isCompleted && summary.upsScore != null && trialCount > 0 ? summary.upsScore * trialCount : 0;
  const upsTrial = isCompleted && summary.upsScore != null && trialCount > 0 ? trialCount : 0;

  const abandonedDelta = summary.reason === 'abandoned' ? 1 : 0;
  const totalTrialsDelta = summary.trialsCount ?? 0;
  let totalXpDelta = 0;
  const xpBd = summary.xpBreakdown;
  if (xpBd && typeof xpBd === 'object' && typeof (xpBd as Record<string, unknown>)['total'] === 'number') {
    totalXpDelta = (xpBd as Record<string, unknown>)['total'] as number;
  }

  const hour = summary.createdAt.getUTCHours();
  const earlyMorningDelta = isCompleted && hour < 8 ? 1 : 0;
  const lateNightDelta = isCompleted && (hour >= 22 || hour < 5) ? 1 : 0;
  const profileSessionsDelta = isCompleted && summary.playContext === 'profile' ? 1 : 0;

  // UPDATE existing row
  await tx.execute(
    `UPDATE user_stats_projection SET
       sessions_count    = sessions_count + ?,
       total_duration_ms = total_duration_ms + ?,
       max_n_level       = CASE WHEN ? > max_n_level THEN ? ELSE max_n_level END,
       ups_sum           = ups_sum + ?,
       ups_trial_count   = ups_trial_count + ?,
       total_hits        = total_hits + ?,
       total_misses      = total_misses + ?,
       total_fa          = total_fa + ?,
       total_cr          = total_cr + ?,
       last_n_level      = CASE WHEN ? > COALESCE(last_created_at,'') THEN ? ELSE last_n_level END,
       last_created_at   = CASE WHEN ? > COALESCE(last_created_at,'') THEN ? ELSE last_created_at END,
       abandoned_sessions     = abandoned_sessions + ?,
       total_trials            = total_trials + ?,
       total_xp                = total_xp + ?,
       first_session_at        = CASE WHEN ? < COALESCE(first_session_at, '9999-12-31') THEN ? ELSE first_session_at END,
       early_morning_sessions  = early_morning_sessions + ?,
       late_night_sessions     = late_night_sessions + ?,
       profile_sessions_count  = profile_sessions_count + ?
     WHERE id = ?`,
    [
      sessionsDelta, durationDelta, maxNLevel, maxNLevel,
      upsSum, upsTrial, hitsDelta, missesDelta, faDelta, crDelta,
      lastCreatedAt, lastNLevel, lastCreatedAt, lastCreatedAt,
      abandonedDelta, totalTrialsDelta, totalXpDelta,
      createdAtStr, createdAtStr,
      earlyMorningDelta, lateNightDelta, profileSessionsDelta,
      userId,
    ],
  );
  // INSERT if row didn't exist
  await tx.execute(
    `INSERT OR IGNORE INTO user_stats_projection
       (id, user_id, sessions_count, total_duration_ms, active_days,
        max_n_level, last_n_level, last_created_at,
        ups_sum, ups_trial_count,
        total_hits, total_misses, total_fa, total_cr,
        abandoned_sessions, total_trials, total_xp, first_session_at,
        early_morning_sessions, late_night_sessions, profile_sessions_count)
     VALUES (?,?,?,?,0,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      userId, userId, sessionsDelta, durationDelta,
      maxNLevel, lastNLevel, lastCreatedAt,
      upsSum, upsTrial,
      hitsDelta, missesDelta, faDelta, crDelta,
      abandonedDelta, totalTrialsDelta, totalXpDelta, createdAtStr,
      earlyMorningDelta, lateNightDelta, profileSessionsDelta,
    ],
  );

  // Per-modality stats (completed only)
  if (isCompleted && summary.byModality) {
    for (const [mod, data] of Object.entries(summary.byModality)) {
      if (typeof data !== 'object' || data === null) continue;
      const d = data as Record<string, unknown>;
      const hits = typeof d['hits'] === 'number' ? d['hits'] : 0;
      const misses = typeof d['misses'] === 'number' ? d['misses'] : 0;
      const fa = typeof d['falseAlarms'] === 'number' ? d['falseAlarms'] : 0;
      const cr = typeof d['correctRejections'] === 'number' ? d['correctRejections'] : 0;
      const avgRT = typeof d['avgRT'] === 'number' ? d['avgRT'] : 0;
      const rtCount = hits + fa;

      const modId = `${userId}:${mod}`;
      await tx.execute(
        `UPDATE user_modality_stats_projection SET
           hits_sum  = hits_sum + ?,
           misses_sum = misses_sum + ?,
           fa_sum    = fa_sum + ?,
           cr_sum    = cr_sum + ?,
           rt_sum    = rt_sum + ?,
           rt_count  = rt_count + ?
         WHERE id = ?`,
        [hits, misses, fa, cr, avgRT > 0 && rtCount > 0 ? avgRT * rtCount : 0, avgRT > 0 && rtCount > 0 ? rtCount : 0, modId],
      );
      await tx.execute(
        `INSERT OR IGNORE INTO user_modality_stats_projection
           (id, user_id, modality, hits_sum, misses_sum, fa_sum, cr_sum, rt_sum, rt_count)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [modId, userId, mod, hits, misses, fa, cr, avgRT > 0 && rtCount > 0 ? avgRT * rtCount : 0, avgRT > 0 && rtCount > 0 ? rtCount : 0],
      );
    }
  }
}

// =============================================================================
// SessionWriter
// =============================================================================

export function createSessionWriter(deps: SessionWriterDeps) {
  const { db } = deps;

  /**
   * Finalize a completed session: project summary, write all read-model tables atomically.
   *
   * @param sessionId - Unique session identifier
   * @param rawEvents - Raw events from the XState machine context (context.sessionEvents)
   */
  async function finalizeSession(
    sessionId: string,
    rawEvents: readonly Record<string, unknown>[],
  ): Promise<FinalizeSessionResult> {
    const userId = resolveUserId(rawEvents);

    // Convert raw events to RawVersionedEvent format
    const versionedEvents: RawVersionedEvent[] = rawEvents.map((e, i) => ({
      ...e,
      id: typeof e['id'] === 'string' ? (e['id'] as string) : `${sessionId}:${i}`,
      sessionId: typeof e['sessionId'] === 'string' ? (e['sessionId'] as string) : sessionId,
      type: String(e['type'] ?? ''),
      timestamp: typeof e['timestamp'] === 'number' ? (e['timestamp'] as number) : Date.now(),
      schemaVersion: typeof e['schemaVersion'] === 'number' ? (e['schemaVersion'] as number) : 1,
    }));

    // Validate and migrate
    let gameEvents: GameEvent[];
    try {
      const result = migrateAndValidateEventBatch(versionedEvents, {
        strict: false,
        logErrors: true,
        targetVersion: 1,
        output: 'canonical',
      });
      gameEvents = result.events;
    } catch (err) {
      console.warn(`[SessionWriter] Validation failed for session ${sessionId}, skipping`, err);
      return { sessionId, summary: null, wasAbandoned: false };
    }

    // Check for abandoned sessions
    const isAbandoned = gameEvents.some(
      (e) => 'reason' in e && (e as unknown as { reason?: unknown }).reason === 'abandoned',
    );
    if (isAbandoned) {
      return { sessionId, summary: null, wasAbandoned: true };
    }

    // Project to summary
    const summary = projectEventsToSummary(sessionId, gameEvents, userId);
    if (!summary) {
      return { sessionId, summary: null, wasAbandoned: false };
    }

    const isCompleted = summary.reason === undefined || summary.reason === null || summary.reason === 'completed';
    const eventDate = summary.createdAt.toISOString().substring(0, 10);
    const now = new Date().toISOString();

    // Serialize raw events for replay
    const eventsJson = JSON.stringify(rawEvents);

    // Atomic write: all read-model tables in a single transaction
    await db.writeTransaction(async (tx) => {
      // 1. session_events (raw events for replay)
      await tx.execute(
        `INSERT OR IGNORE INTO session_events (id, session_id, events_json, created_at)
         VALUES (?, ?, ?, ?)`,
        [sessionId, sessionId, eventsJson, now],
      );

      // 2. session_summaries
      const placeholders = SESSION_SUMMARY_INSERT_COLUMNS.map(() => '?').join(', ');
      const columns = SESSION_SUMMARY_INSERT_COLUMNS.join(', ');
      await tx.execute(
        `INSERT OR IGNORE INTO session_summaries (${columns}) VALUES (${placeholders})`,
        sessionSummaryInsertValues(summary) as (string | number | null)[],
      );

      // 3. Streak (completed only)
      if (isCompleted) {
        await updateStreak(tx, eventDate);
      }

      // 4. Daily activity (completed only)
      if (isCompleted) {
        await updateDailyActivity(tx, eventDate, summary.durationMs ?? 0);
      }

      // 5. N-level (completed sessions with nLevel data)
      if (isCompleted && summary.nLevel !== undefined && summary.accuracy !== undefined) {
        await updateNLevel(tx, userId, summary.nLevel, summary.accuracy * 100, eventDate);
      }

      // 6. User stats + modality stats
      await updateUserStats(tx, summary);
    });

    return { sessionId, summary, wasAbandoned: false };
  }

  return { finalizeSession };
}
