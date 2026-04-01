/**
 * Progression Adapter
 *
 * Implements ProgressionPort by computing progression from session_summaries.
 * No separate progression table - everything is derived from SQL aggregations.
 *
 * OPTIMIZATION: Uses SQL aggregations via Drizzle query builder
 * instead of loading all events in memory. This is O(1) memory vs O(N).
 *
 * NOTE: UI reads progression via PowerSync watched queries (useProgressionQuery).
 * This adapter is used for imperative access (pipeline, import, tests).
 * No manual cache needed - each call queries SQL directly (fast on session_summaries).
 */

import type {
  BadgeHistorySnapshot,
  PersistencePort,
  ProgressionData,
  ProgressionPort,
  UnlockedBadge,
} from '@neurodual/logic';
import { createEmptyProgression } from '@neurodual/logic';
import { parseSqlDate } from '../db/sql-helpers';
import {
  buildProjectionScopeClause,
  buildSessionSummaryScopeClause,
  effectiveUserIdsWithLocal,
  getActiveEffectiveUserIds,
} from '../user/user-scope';

function isMissingSessionSummariesError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('no such table: session_summaries');
}

function computeDaysSince(dateString: string | null | undefined): number | null {
  if (!dateString) return null;
  const parsed = Date.parse(dateString);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.floor((Date.now() - parsed) / 86400000));
}

// =============================================================================
// Project Badges from Events (SQL-optimized)
// =============================================================================

async function projectBadgesFromEvents(
  _persistence: PersistencePort,
  _userIds: readonly string[],
): Promise<UnlockedBadge[]> {
  // Badge unlock events are no longer stored separately
  return [];
}

export async function getBadgesForUserScope(
  persistence: PersistencePort,
  userId: string | null | undefined,
): Promise<UnlockedBadge[]> {
  return projectBadgesFromEvents(persistence, effectiveUserIdsWithLocal(userId));
}

// =============================================================================
// Compute Progression from session_summaries (SQL-optimized)
// =============================================================================

async function computeUninterruptedSessionsStreak(
  persistence: PersistencePort,
  userIds: readonly string[],
): Promise<number> {
  const scope = buildSessionSummaryScopeClause('user_id', userIds);
  const projectionScope = buildProjectionScopeClause('id', userIds);
  const params = [...scope.params, ...scope.params, ...projectionScope.params];
  const result = await persistence.query<{ uninterrupted_streak: number }>(
    `WITH first_break AS (
        SELECT created_at, session_id
        FROM session_summaries
        WHERE ${scope.clause}
          AND reason = 'completed'
          AND focus_lost_count > 0
        ORDER BY created_at DESC, session_id DESC
        LIMIT 1
      ),
      completed AS (
        SELECT CAST(COALESCE(SUM(sessions_count), 0) AS INTEGER) AS completed_sessions
        FROM user_stats_projection
        WHERE ${projectionScope.clause}
      )
      SELECT
        CASE
          WHEN EXISTS (SELECT 1 FROM first_break) THEN (
            SELECT COUNT(*)
            FROM session_summaries
            WHERE ${scope.clause}
              AND reason = 'completed'
              AND (
                created_at > (SELECT created_at FROM first_break)
                OR (
                  created_at = (SELECT created_at FROM first_break)
                  AND session_id > (SELECT session_id FROM first_break)
                )
              )
          )
          ELSE COALESCE((SELECT completed_sessions FROM completed), 0)
        END as uninterrupted_streak`,
    params,
  );

  return Number(result.rows[0]?.uninterrupted_streak ?? 0);
}

async function computeProgressionFromSummaries(
  persistence: PersistencePort,
): Promise<ProgressionData> {
  return computeProgressionForUserIds(persistence, getActiveEffectiveUserIds());
}

export async function getProgressionForUserScope(
  persistence: PersistencePort,
  userId: string | null | undefined,
): Promise<ProgressionData> {
  return computeProgressionForUserIds(persistence, effectiveUserIdsWithLocal(userId));
}

async function computeProgressionForUserIds(
  persistence: PersistencePort,
  userIds: readonly string[],
): Promise<ProgressionData> {
  const projectionScope = buildProjectionScopeClause('id', userIds);

  try {
    const projectionResult = await persistence.query<{
      completed_sessions: number;
      abandoned_sessions: number;
      total_trials: number;
      early_morning_sessions: number;
      late_night_sessions: number;
      first_session_at: string | null;
      total_xp: number;
    }>(
      `SELECT
         CAST(COALESCE(SUM(sessions_count), 0) AS INTEGER) AS completed_sessions,
         CAST(COALESCE(SUM(abandoned_sessions), 0) AS INTEGER) AS abandoned_sessions,
         CAST(COALESCE(SUM(total_trials), 0) AS INTEGER) AS total_trials,
         CAST(COALESCE(SUM(early_morning_sessions), 0) AS INTEGER) AS early_morning_sessions,
         CAST(COALESCE(SUM(late_night_sessions), 0) AS INTEGER) AS late_night_sessions,
         MIN(first_session_at) AS first_session_at,
         CAST(COALESCE(SUM(total_xp), 0) AS INTEGER) AS total_xp
       FROM user_stats_projection
       WHERE ${projectionScope.clause}`,
      projectionScope.params,
    );

    const row = projectionResult.rows[0] as
      | {
          completed_sessions: number;
          abandoned_sessions: number;
          total_trials: number;
          early_morning_sessions: number;
          late_night_sessions: number;
          first_session_at: string | null;
          total_xp: number;
        }
      | undefined;
    const completedSessions = row?.completed_sessions ?? 0;
    const abandonedSessions = row?.abandoned_sessions ?? 0;
    const totalTrials = row?.total_trials ?? 0;
    const firstSessionAt = parseSqlDate(row?.first_session_at ?? null);

    const totalXP = row?.total_xp ?? 0;
    const earlyMorningSessions = row?.early_morning_sessions ?? 0;
    const lateNightSessions = row?.late_night_sessions ?? 0;

    const uninterruptedSessionsStreak = await computeUninterruptedSessionsStreak(
      persistence,
      userIds,
    );

    return {
      totalXP,
      completedSessions,
      abandonedSessions,
      totalTrials,
      firstSessionAt,
      earlyMorningSessions,
      lateNightSessions,
      comebackCount: 0,
      persistentDays: completedSessions > 0 ? 1 : 0,
      plateausBroken: 0,
      uninterruptedSessionsStreak,
    };
  } catch (error) {
    if (!isMissingSessionSummariesError(error)) {
      throw error;
    }
    return createEmptyProgression();
  }
}

async function computeBadgeHistorySnapshot(
  persistence: PersistencePort,
  userIds: readonly string[],
): Promise<BadgeHistorySnapshot> {
  const sessionScope = buildSessionSummaryScopeClause('user_id', userIds);
  const projectionScope = buildProjectionScopeClause('id', userIds);
  const streakInfo = await persistence.query<{
    current_streak: number;
    best_streak: number;
    last_date: string | null;
  }>(
    `WITH dates AS (
        SELECT DISTINCT created_date as day
        FROM session_summaries
        WHERE ${sessionScope.clause}
          AND created_date IS NOT NULL
          AND reason != 'abandoned'
      ),
      with_row AS (
        SELECT day, ROW_NUMBER() OVER (ORDER BY day) as rn FROM dates
      ),
      with_islands AS (
        SELECT day, date(day, '-' || rn || ' days') as island_id FROM with_row
      ),
      streaks AS (
        SELECT
          island_id,
          MAX(day) as end_day,
          COUNT(*) as streak_length
        FROM with_islands
        GROUP BY island_id
      )
      SELECT
        COALESCE(
          (SELECT streak_length FROM streaks WHERE end_day >= date('now', '-1 day')),
          0
        ) as current_streak,
        COALESCE((SELECT MAX(streak_length) FROM streaks), 0) as best_streak,
        (SELECT MAX(day) FROM dates) as last_date`,
    sessionScope.params,
  );

  const [todayCountResult, bestDPrimeResult, summaryResult] = await Promise.all([
    persistence.query<{ sessions_today: number }>(
      `SELECT COUNT(*) as sessions_today
       FROM session_summaries
       WHERE ${sessionScope.clause}
         AND reason = 'completed'
         AND created_date = date('now')`,
      sessionScope.params,
    ),
    persistence.query<{ best_dprime: number | null }>(
      `SELECT COALESCE((
         SELECT global_d_prime
         FROM session_summaries
         WHERE ${sessionScope.clause}
           AND reason = 'completed'
           AND global_d_prime IS NOT NULL
         ORDER BY global_d_prime DESC
         LIMIT 1
       ), 0) as best_dprime`,
      sessionScope.params,
    ),
    persistence.query<{
      max_n_level: number | null;
      early_morning_days: number | null;
      late_night_days: number | null;
      last_session_at: string | null;
    }>(
      `SELECT
         CAST(COALESCE(MAX(max_n_level), 0) AS INTEGER) as max_n_level,
         CAST(COALESCE(SUM(early_morning_sessions), 0) AS INTEGER) as early_morning_days,
         CAST(COALESCE(SUM(late_night_sessions), 0) AS INTEGER) as late_night_days,
         MAX(last_created_at) as last_session_at
       FROM user_stats_projection
       WHERE ${projectionScope.clause}`,
      projectionScope.params,
    ),
  ]);

  const streak = streakInfo.rows[0];
  const summary = summaryResult.rows[0];

  return {
    currentStreak: Number(streak?.current_streak ?? 0),
    bestStreak: Math.max(Number(streak?.best_streak ?? 0), Number(streak?.current_streak ?? 0)),
    sessionsToday: Number(todayCountResult.rows[0]?.sessions_today ?? 0),
    earlyMorningDays: Number(summary?.early_morning_days ?? 0),
    lateNightDays: Number(summary?.late_night_days ?? 0),
    maxNLevel: Number(summary?.max_n_level ?? 0),
    bestDPrime: Number(bestDPrimeResult.rows[0]?.best_dprime ?? 0),
    daysSinceLastSession: computeDaysSince(summary?.last_session_at ?? null),
  };
}

export async function getBadgeHistorySnapshotForUserScope(
  persistence: PersistencePort,
  userId: string | null | undefined,
): Promise<BadgeHistorySnapshot> {
  return computeBadgeHistorySnapshot(persistence, effectiveUserIdsWithLocal(userId));
}

// =============================================================================
// Adapter
// =============================================================================

/**
 * Create a ProgressionPort with explicit persistence injection.
 *
 * NOTE: UI reads progression via PowerSync watched queries (useProgressionQuery).
 * This adapter is used for imperative access (pipeline, import, tests).
 */
export function createProgressionAdapter(persistence: PersistencePort): ProgressionPort {
  return {
    async getProgression(): Promise<ProgressionData | null> {
      return computeProgressionFromSummaries(persistence);
    },

    async getBadges(): Promise<UnlockedBadge[]> {
      return projectBadgesFromEvents(persistence, getActiveEffectiveUserIds());
    },

    async hasBadge(badgeId: string): Promise<boolean> {
      const badges = await this.getBadges();
      return badges.some((b: UnlockedBadge) => b.badgeId === badgeId);
    },
  };
}
