/**
 * Profile Adapter
 *
 * Implements ProfilePort using SQL aggregations from SQLite.
 * Uses session_summaries table for O(sessions) memory instead of O(events).
 *
 * All DB access goes through the SQLite Worker Bridge for thread safety.
 */

import type {
  ModalityProfile,
  PersistencePort,
  PlayerProfile,
  ProfilePort,
  ProgressionPoint,
  SessionSummaryRow,
} from '@neurodual/logic';
import { SDT_DPRIME_PASS, SDTCalculator } from '@neurodual/logic';
import { eq, sql } from 'drizzle-orm';
import { requireDrizzleDb, sessionSummariesTable } from '../db/drizzle';
import { parseSqlDate, parseSqlDateToMs, safeJsonParse } from '../db/sql-helpers';

// =============================================================================
// Constants
// =============================================================================

const LOCAL_USER_ID = 'local';
const PROFILE_VERSION = 2; // Incremented for SQL-first migration

// =============================================================================
// SQL-First Profile Computation (Helper Functions)
// =============================================================================

// NOTE: computeProfileFromSQL module-level function removed - factory creates its own version

/**
 * Compute aggregate stats from session summaries.
 */
function computeStatsFromSummaries(summaries: SessionSummaryRow[]): {
  modalities: ReadonlyMap<string, ModalityProfile>;
  avgDPrime: number;
  bestDPrime: number;
  totalTrials: number;
  currentNLevel: number;
  highestNLevel: number;
} {
  // Aggregate modality stats across all sessions
  const modalityAccumulators = new Map<
    string,
    {
      hits: number;
      misses: number;
      falseAlarms: number;
      correctRejections: number;
      totalRT: number;
      rtCount: number;
    }
  >();

  let totalDPrime = 0;
  let dPrimeCount = 0;
  let bestDPrime = 0;
  let totalTrials = 0;
  let currentNLevel = 1;
  let highestNLevel = 1;

  for (const summary of summaries) {
    // Track n-levels
    if (summary.n_level > highestNLevel) highestNLevel = summary.n_level;

    // Current n-level is from most recent session (summaries are sorted by date DESC)
    if (dPrimeCount === 0) currentNLevel = summary.n_level;

    // Accumulate d-prime
    if (summary.global_d_prime !== null) {
      totalDPrime += summary.global_d_prime;
      dPrimeCount++;
      if (summary.global_d_prime > bestDPrime) bestDPrime = summary.global_d_prime;
    }

    // Accumulate trials
    totalTrials += summary.trials_count;

    // Accumulate modality stats from by_modality JSON
    // SQLite stores as TEXT, need to parse if string
    const byModality =
      typeof summary.by_modality === 'string'
        ? safeJsonParse<Record<string, unknown>>(summary.by_modality, {})
        : summary.by_modality;

    if (byModality && typeof byModality === 'object') {
      for (const [modalityId, stats] of Object.entries(byModality)) {
        const modalityStats = stats as Record<string, unknown>;
        if (!modalityAccumulators.has(modalityId)) {
          modalityAccumulators.set(modalityId, {
            hits: 0,
            misses: 0,
            falseAlarms: 0,
            correctRejections: 0,
            totalRT: 0,
            rtCount: 0,
          });
        }
        const acc = modalityAccumulators.get(modalityId);
        if (!acc) continue;
        acc.hits += (modalityStats['hits'] as number) ?? 0;
        acc.misses += (modalityStats['misses'] as number) ?? 0;
        acc.falseAlarms += (modalityStats['falseAlarms'] as number) ?? 0;
        acc.correctRejections += (modalityStats['correctRejections'] as number) ?? 0;
        const rt = modalityStats['avgRT'] as number | null;
        if (rt && rt > 0) {
          acc.totalRT += rt;
          acc.rtCount++;
        }
      }
    }
  }

  // Build ModalityProfile map
  const modalities = new Map<string, ModalityProfile>();
  for (const [modalityId, acc] of modalityAccumulators) {
    const totalTargets = acc.hits + acc.misses;
    const hitRate = totalTargets > 0 ? acc.hits / totalTargets : 0;
    const faRate =
      acc.falseAlarms + acc.correctRejections > 0
        ? acc.falseAlarms / (acc.falseAlarms + acc.correctRejections)
        : 0;

    // Compute d-prime from aggregate stats
    const dPrime = computeDPrimeFromRates(hitRate, faRate);

    modalities.set(modalityId, {
      totalTargets,
      hits: acc.hits,
      misses: acc.misses,
      falseAlarms: acc.falseAlarms,
      correctRejections: acc.correctRejections,
      avgReactionTime: acc.rtCount > 0 ? acc.totalRT / acc.rtCount : null,
      dPrime,
      lureVulnerability: faRate, // Simplified: FA rate as vulnerability
    });
  }

  return {
    modalities,
    avgDPrime: dPrimeCount > 0 ? totalDPrime / dPrimeCount : 0,
    bestDPrime,
    totalTrials,
    currentNLevel,
    highestNLevel,
  };
}

/**
 * Compute d-prime from hit rate and false alarm rate.
 * Uses the canonical SDTCalculator.probit (Abramowitz & Stegun algorithm)
 * for consistency with session-level d' calculations.
 */
function computeDPrimeFromRates(hitRate: number, faRate: number): number {
  // Clamp rates to avoid infinite values (SDTCalculator.probit handles extremes)
  const hr = Math.max(0.01, Math.min(0.99, hitRate));
  const far = Math.max(0.01, Math.min(0.99, faRate));

  // Use canonical probit from SDTCalculator (same as session reports)
  return SDTCalculator.probit(hr) - SDTCalculator.probit(far);
}

/**
 * Build progression points from session summaries.
 */
function buildProgressionFromSummaries(summaries: SessionSummaryRow[]): ProgressionPoint[] {
  // Group by week and n-level
  const weeklyMap = new Map<string, { nLevel: number; dPrimes: number[]; count: number }>();

  for (const summary of summaries) {
    // SQLite may return created_at as string
    const date = parseSqlDate(summary.created_at) ?? new Date(0);
    // Get Monday of the week
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(date.setDate(diff));
    const weekKey = monday.toISOString().split('T')[0] ?? '';

    if (!weeklyMap.has(weekKey)) {
      weeklyMap.set(weekKey, { nLevel: summary.n_level, dPrimes: [], count: 0 });
    }
    const week = weeklyMap.get(weekKey);
    if (week) {
      week.nLevel = Math.max(week.nLevel, summary.n_level);
      if (summary.global_d_prime !== null) {
        week.dPrimes.push(summary.global_d_prime);
      }
      week.count++;
    }
  }

  // Convert to progression points, sorted by date
  return Array.from(weeklyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, data]) => ({
      date,
      nLevel: data.nLevel,
      avgDPrime:
        data.dPrimes.length > 0 ? data.dPrimes.reduce((a, b) => a + b, 0) / data.dPrimes.length : 0,
      sessionsAtLevel: data.count,
    }));
}

/**
 * Detect strengths and weaknesses from modality profiles.
 */
function detectStrengthsWeaknesses(modalities: ReadonlyMap<string, ModalityProfile>): {
  strengths: string[];
  weaknesses: string[];
} {
  const strengths: string[] = [];
  const weaknesses: string[] = [];

  // Compare modalities if we have more than one
  if (modalities.size < 2) {
    return { strengths, weaknesses };
  }

  const entries = Array.from(modalities.entries());
  const avgDPrime = entries.reduce((sum, [, p]) => sum + p.dPrime, 0) / entries.length;

  for (const [modalityId, profile] of entries) {
    const diff = profile.dPrime - avgDPrime;
    if (diff > 0.5) {
      strengths.push(modalityId);
    } else if (diff < -0.5) {
      weaknesses.push(modalityId);
    }
  }

  return { strengths, weaknesses };
}

/**
 * Compute max N-level and mastery count per modality.
 */
function computeModalityProgression(summaries: SessionSummaryRow[]): {
  maxNByModality: ReadonlyMap<string, number>;
  masteryCountByModality: ReadonlyMap<string, number>;
} {
  const maxN = new Map<string, number>();
  const masteryCount = new Map<string, number>();
  const MASTERY_THRESHOLD = SDT_DPRIME_PASS; // d-prime threshold for mastery (from centralized thresholds)

  for (const summary of summaries) {
    // SQLite stores as TEXT, need to parse if string
    const byModality =
      typeof summary.by_modality === 'string'
        ? safeJsonParse<Record<string, unknown>>(summary.by_modality, {})
        : summary.by_modality;

    if (byModality && typeof byModality === 'object') {
      for (const modalityId of Object.keys(byModality)) {
        // Max N
        const currentMax = maxN.get(modalityId) ?? 0;
        if (summary.n_level > currentMax) {
          maxN.set(modalityId, summary.n_level);
        }

        // Mastery count (sessions with d-prime >= threshold)
        if (summary.global_d_prime !== null && summary.global_d_prime >= MASTERY_THRESHOLD) {
          masteryCount.set(modalityId, (masteryCount.get(modalityId) ?? 0) + 1);
        }
      }
    }
  }

  return { maxNByModality: maxN, masteryCountByModality: masteryCount };
}

/**
 * Compute average reaction time across all modalities.
 */
function computeAvgReactionTime(modalities: ReadonlyMap<string, ModalityProfile>): number | null {
  let totalRT = 0;
  let count = 0;

  for (const profile of modalities.values()) {
    if (profile.avgReactionTime !== null) {
      totalRT += profile.avgReactionTime;
      count++;
    }
  }

  return count > 0 ? totalRT / count : null;
}

// =============================================================================
// Factory (Injection-based)
// =============================================================================

/**
 * Create a ProfilePort with explicit persistence injection.
 *
 * NOTE: UI reads profile via PowerSync watched queries (useProfileQuery in queries/profile.ts).
 * This adapter is only used for imperative access (tests, pipeline).
 */
export function createProfileAdapter(persistence: PersistencePort): ProfilePort {
  const db = requireDrizzleDb(persistence);

  async function getGlobalStatsSummaryFromPersistence(userId: string): Promise<{
    totalSessions: number;
    totalPlayTimeMs: number;
    maxNLevel: number;
  }> {
    const result = await db
      .select({
        total_sessions: sql<number>`COUNT(*)`.as('total_sessions'),
        total_duration: sql<number>`COALESCE(SUM(${sessionSummariesTable.duration_ms}), 0)`.as(
          'total_duration',
        ),
        max_n: sql<number>`COALESCE(MAX(${sessionSummariesTable.n_level}), 1)`.as('max_n'),
      })
      .from(sessionSummariesTable)
      .where(eq(sessionSummariesTable.user_id, userId));

    const row = result[0] as
      | {
          total_sessions: number;
          total_duration: number;
          max_n: number;
        }
      | undefined;
    return {
      totalSessions: row?.total_sessions ?? 0,
      totalPlayTimeMs: row?.total_duration ?? 0,
      maxNLevel: row?.max_n ?? 1,
    };
  }

  async function getStreakInfoFromPersistence(
    userId: string,
  ): Promise<{ current: number; best: number; lastDate: string | null }> {
    const result = await db.all<{
      current_streak: number;
      best_streak: number;
      last_date: string | null;
    }>(
      sql`WITH dates AS (
            SELECT DISTINCT created_date as day
            FROM session_summaries
            WHERE user_id = ${userId}
              AND created_date IS NOT NULL
          ),
          with_row AS (
            SELECT day, ROW_NUMBER() OVER (ORDER BY day) as rn
            FROM dates
          ),
          with_islands AS (
            SELECT day, julianday(day) - rn as island_id
            FROM with_row
          ),
          streaks AS (
            SELECT island_id, MAX(day) as end_day, COUNT(*) as streak_length
            FROM with_islands
            GROUP BY island_id
          )
          SELECT
            COALESCE((SELECT streak_length FROM streaks WHERE end_day >= date('now', '-1 day')), 0) as current_streak,
            COALESCE((SELECT MAX(streak_length) FROM streaks), 0) as best_streak,
            (SELECT MAX(day) FROM dates) as last_date`,
    );

    const row = result[0];
    if (!row) {
      return { current: 0, best: 0, lastDate: null };
    }

    const current = row.current_streak;
    const best = row.best_streak;

    return {
      current,
      best: Math.max(best, current),
      lastDate: row.last_date,
    };
  }

  async function computeProfileFromPersistence(userId: string): Promise<PlayerProfile> {
    // Parallel SQL queries for maximum efficiency
    const [summaries, globalStats, streakInfoResult] = await Promise.all([
      persistence.getSessionSummaries(userId),
      getGlobalStatsSummaryFromPersistence(userId),
      getStreakInfoFromPersistence(userId),
    ]);

    // Compute stats from session summaries (reuse pure functions)
    const { modalities, avgDPrime, bestDPrime, totalTrials, currentNLevel, highestNLevel } =
      computeStatsFromSummaries(summaries);

    // Build progression points from summaries
    const progression = buildProgressionFromSummaries(summaries);

    // Detect strengths and weaknesses
    const { strengths, weaknesses } = detectStrengthsWeaknesses(modalities);

    // Build maxN and mastery counts per modality
    const { maxNByModality, masteryCountByModality } = computeModalityProgression(summaries);

    return {
      odalisqueId: userId,
      version: PROFILE_VERSION,
      computedAt: Date.now(),

      currentNLevel,
      highestNLevel: Math.max(highestNLevel, globalStats.maxNLevel),

      totalSessions: globalStats.totalSessions,
      totalTrials,
      totalDurationMs: globalStats.totalPlayTimeMs,
      avgDPrime,
      bestDPrime,

      modalities,
      strengths,
      weaknesses,

      preferredISI: 3000,
      avgReactionTime: computeAvgReactionTime(modalities),

      avgFocusLostPerSession: 0,
      totalFocusLostMs: 0,

      currentStreak: streakInfoResult.current,
      longestStreak: streakInfoResult.best,
      lastSessionDate: streakInfoResult.lastDate,

      maxNByModality,
      masteryCountByModality,

      progression,

      lastEventId: null,
      lastEventTimestamp: summaries[0] ? (parseSqlDateToMs(summaries[0].created_at) ?? 0) : null,
    };
  }

  return {
    async getProfile(): Promise<PlayerProfile> {
      return computeProfileFromPersistence(LOCAL_USER_ID);
    },
  };
}
