/**
 * Database Diagnostics
 *
 * Collects a rich snapshot of the local PowerSync/SQLite database state.
 * Designed to be sent as PostHog event properties for remote debugging.
 *
 * All queries are read-only and best-effort (never throws).
 */

import { getPowerSyncDatabase, isPowerSyncInitialized } from '../powersync/database';
import { getPowerSyncRuntimeState } from '../powersync/database';
import { getEmtTableCounts, getEmtMessageDetails } from '../es-emmett/event-queries';

// ─── Public Types ────────────────────────────────────────────────────────────

export interface DbDiagnostics {
  // Schema & migration
  readonly schema_version: number | null;
  readonly has_legacy_events_table: boolean;
  readonly has_legacy_events_local_table: boolean;
  readonly tables_list: string[];
  readonly tables_count: number;

  // Row counts (core tables)
  readonly emt_messages_count: number;
  readonly session_summaries_count: number;
  readonly emt_streams_count: number;
  readonly deleted_sessions_count: number;
  readonly user_resets_count: number;
  readonly session_in_progress_events_count: number;
  readonly processed_commands_count: number;
  readonly emt_subscriptions_count: number;
  readonly user_stats_projection_count: number;
  readonly user_modality_stats_projection_count: number;
  readonly streak_projection_count: number;
  readonly daily_activity_projection_count: number;
  readonly algorithm_states_count: number;
  readonly settings_count: number;
  readonly replay_runs_count: number;

  // Sync health
  readonly pending_crud_count: number;
  readonly pending_crud_oldest_id: string | null;

  // emt_messages details
  readonly emt_distinct_streams: number;
  readonly emt_oldest_created: string | null;
  readonly emt_newest_created: string | null;
  readonly emt_archived_count: number;
  readonly emt_message_types: Record<string, number>;

  // Session summaries details
  readonly summaries_oldest_date: string | null;
  readonly summaries_newest_date: string | null;
  readonly summaries_distinct_modes: string[];
  readonly summaries_distinct_users: number;

  // Projection health
  readonly stats_projection_sessions_count: number | null;
  readonly stats_projection_active_days: number | null;
  readonly streak_current: number | null;
  readonly streak_best: number | null;
  readonly streak_last_active_date: string | null;

  // PowerSync runtime
  readonly vfs: string | null;
  readonly ps_platform: string | null;
  readonly ps_browser: string | null;
  readonly ps_ios_web: boolean;
  readonly ps_runtime_events_count: number;
  readonly ps_last_runtime_event: string | null;

  // Timing
  readonly diagnostics_duration_ms: number;
  readonly collected_at: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

type DB = ReturnType<typeof getPowerSyncDatabase>;

async function safeCount(db: DB, table: string): Promise<number> {
  try {
    const result = await db.execute(`SELECT COUNT(*) as c FROM "${table}"`);
    return (result.rows?._array?.[0] as { c?: number } | undefined)?.c ?? 0;
  } catch {
    return -1;
  }
}

async function safeScalar<T>(db: DB, sql: string, fallback: T): Promise<T> {
  try {
    const result = await db.execute(sql);
    const row = result.rows?._array?.[0] as Record<string, unknown> | undefined;
    if (!row) return fallback;
    const val = Object.values(row)[0];
    return (val ?? fallback) as T;
  } catch {
    return fallback;
  }
}

async function safeRows<T>(db: DB, sql: string): Promise<T[]> {
  try {
    const result = await db.execute(sql);
    return (result.rows?._array ?? []) as T[];
  } catch {
    return [];
  }
}

async function tableExistsInDb(db: DB, name: string): Promise<boolean> {
  try {
    const result = await db.execute(
      `SELECT 1 FROM sqlite_master WHERE type='table' AND name=? LIMIT 1`,
      [name],
    );
    return (result.rows?._array?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

// ─── Collector ───────────────────────────────────────────────────────────────

export async function collectDbDiagnostics(): Promise<DbDiagnostics | null> {
  if (!isPowerSyncInitialized()) return null;

  const start = performance.now();
  const db = getPowerSyncDatabase();

  // All queries run in parallel for speed
  const [
    // Tables list
    allTables,
    hasLegacyEvents,
    hasLegacyEventsLocal,

    // Schema version
    schemaVersion,

    // Row counts (emt_* tables via centralized event-queries)
    emtTableCounts,
    sessionSummariesCount,
    deletedSessionsCount,
    userResetsCount,
    sessionInProgressCount,
    processedCommandsCount,
    userStatsCount,
    userModalityStatsCount,
    streakProjectionCount,
    dailyActivityCount,
    algorithmStatesCount,
    settingsCount,
    replayRunsCount,

    // Sync health
    pendingCrudCount,
    pendingCrudOldest,

    // emt_messages details (via centralized event-queries)
    emtDetails,

    // Session summaries details
    summariesOldest,
    summariesNewest,
    summariesModes,
    summariesDistinctUsers,

    // Projection health
    statsProjection,
    streakProjection,
  ] = await Promise.all([
    // Tables list
    safeRows<{ name: string }>(
      db,
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'ps_%' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
    ),
    tableExistsInDb(db, 'events'),
    tableExistsInDb(db, 'events_local'),

    // Schema version
    safeScalar<string | null>(
      db,
      `SELECT value FROM sync_meta WHERE id='localDbSchemaVersion' LIMIT 1`,
      null,
    ),

    // Row counts — emt_* tables via centralized event-queries module
    getEmtTableCounts(db).catch(() => ({
      emt_messages_count: -1,
      emt_streams_count: -1,
      emt_subscriptions_count: -1,
    })),
    safeCount(db, 'session_summaries'),
    safeCount(db, 'deleted_sessions'),
    safeCount(db, 'user_resets'),
    safeCount(db, 'session_in_progress_events'),
    safeCount(db, 'processed_commands'),
    safeCount(db, 'user_stats_projection'),
    safeCount(db, 'user_modality_stats_projection'),
    safeCount(db, 'streak_projection'),
    safeCount(db, 'daily_activity_projection'),
    safeCount(db, 'algorithm_states'),
    safeCount(db, 'settings'),
    safeCount(db, 'replay_runs'),

    // Sync health
    safeScalar<number>(db, `SELECT COUNT(*) as c FROM ps_crud`, 0),
    safeScalar<string | null>(db, `SELECT id FROM ps_crud ORDER BY id ASC LIMIT 1`, null),

    // emt_messages details via centralized event-queries module
    getEmtMessageDetails(db).catch(() => ({
      emt_distinct_streams: 0,
      emt_oldest_created: null,
      emt_newest_created: null,
      emt_archived_count: 0,
      emt_message_types: {} as Record<string, number>,
    })),

    // Session summaries details
    safeScalar<string | null>(
      db,
      `SELECT created_date FROM session_summaries ORDER BY created_date ASC LIMIT 1`,
      null,
    ),
    safeScalar<string | null>(
      db,
      `SELECT created_date FROM session_summaries ORDER BY created_date DESC LIMIT 1`,
      null,
    ),
    safeRows<{ m: string }>(
      db,
      `SELECT DISTINCT game_mode as m FROM session_summaries WHERE game_mode IS NOT NULL ORDER BY m`,
    ),
    safeScalar<number>(db, `SELECT COUNT(DISTINCT user_id) as c FROM session_summaries`, 0),

    // Projection health
    safeRows<{ sessions_count: number; active_days: number }>(
      db,
      `SELECT sessions_count, active_days FROM user_stats_projection LIMIT 1`,
    ),
    safeRows<{ current_streak: number; best_streak: number; last_active_date: string }>(
      db,
      `SELECT current_streak, best_streak, last_active_date FROM streak_projection LIMIT 1`,
    ),
  ]);

  // Parse PowerSync runtime state
  const runtime = getPowerSyncRuntimeState();
  const lastEvt = runtime?.events?.length ? runtime.events[runtime.events.length - 1] : null;
  const lastRuntimeEvent = lastEvt ? `${lastEvt.phase}: ${lastEvt.detail}` : null;

  const statsRow = statsProjection[0] ?? null;
  const streakRow = streakProjection[0] ?? null;

  const diagnosticsDuration = Math.round(performance.now() - start);

  return {
    schema_version: schemaVersion ? Number(schemaVersion) : null,
    has_legacy_events_table: hasLegacyEvents,
    has_legacy_events_local_table: hasLegacyEventsLocal,
    tables_list: allTables.map((r) => r.name),
    tables_count: allTables.length,

    emt_messages_count: emtTableCounts.emt_messages_count,
    session_summaries_count: sessionSummariesCount,
    emt_streams_count: emtTableCounts.emt_streams_count,
    deleted_sessions_count: deletedSessionsCount,
    user_resets_count: userResetsCount,
    session_in_progress_events_count: sessionInProgressCount,
    processed_commands_count: processedCommandsCount,
    emt_subscriptions_count: emtTableCounts.emt_subscriptions_count,
    user_stats_projection_count: userStatsCount,
    user_modality_stats_projection_count: userModalityStatsCount,
    streak_projection_count: streakProjectionCount,
    daily_activity_projection_count: dailyActivityCount,
    algorithm_states_count: algorithmStatesCount,
    settings_count: settingsCount,
    replay_runs_count: replayRunsCount,

    pending_crud_count: pendingCrudCount,
    pending_crud_oldest_id: pendingCrudOldest,

    emt_distinct_streams: emtDetails.emt_distinct_streams,
    emt_oldest_created: emtDetails.emt_oldest_created,
    emt_newest_created: emtDetails.emt_newest_created,
    emt_archived_count: emtDetails.emt_archived_count,
    emt_message_types: emtDetails.emt_message_types,

    summaries_oldest_date: summariesOldest,
    summaries_newest_date: summariesNewest,
    summaries_distinct_modes: summariesModes.map((r) => r.m),
    summaries_distinct_users: summariesDistinctUsers,

    stats_projection_sessions_count: statsRow?.sessions_count ?? null,
    stats_projection_active_days: statsRow?.active_days ?? null,
    streak_current: streakRow?.current_streak ?? null,
    streak_best: streakRow?.best_streak ?? null,
    streak_last_active_date: streakRow?.last_active_date ?? null,

    vfs: runtime?.selectedVfs ?? null,
    ps_platform: runtime?.platform ?? null,
    ps_browser: runtime?.browser ?? null,
    ps_ios_web: runtime?.iosWeb ?? false,
    ps_runtime_events_count: runtime?.events?.length ?? 0,
    ps_last_runtime_event: lastRuntimeEvent,

    diagnostics_duration_ms: diagnosticsDuration,
    collected_at: new Date().toISOString(),
  };
}
