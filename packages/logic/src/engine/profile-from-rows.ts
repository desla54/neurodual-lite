/**
 * Project PlayerProfile from raw SQL row arrays.
 *
 * This is the single source of truth for row→domain transformation of profile data.
 * Used by the ProfileReadModel (reactive) and can be used by imperative adapters.
 *
 * The row types match the SQL output of ReadModelPort.profile* methods.
 */

import type { ModalityProfile, PlayerProfile, ProgressionPoint } from '../types';
import { SDTCalculator } from '../domain/scoring/helpers/sdt-calculator';
import { SDT_DPRIME_PASS } from '../specs/thresholds';
import { createEmptyProfile } from './profile-projector';

// =============================================================================
// Row types (match ReadModelPort SQL output)
// =============================================================================

export interface ProfileSummaryRow {
  total_sessions: number;
  total_duration_ms: number;
  total_trials: number;
  avg_d_prime: number;
  best_d_prime: number;
  highest_n_level: number;
  total_focus_lost_ms: number;
  avg_focus_lost_per_session: number;
}

export interface ProfileLatestSessionRow {
  n_level: number;
  created_at: string | null;
}

export interface ProfileProgressionRow {
  week_start: string | null;
  n_level_max: number;
  avg_d_prime: number;
  sessions_count: number;
}

export interface ProfileModalitySourceRow {
  session_id: string;
  by_modality: string | null;
  n_level: number;
  global_d_prime: number;
}

export interface ProfileStreakRow {
  current_streak: number;
  best_streak: number;
  last_active_date: string | null;
}

// =============================================================================
// Pure helpers
// =============================================================================

function computeDPrimeFromRates(hitRate: number, faRate: number): number {
  const hr = Math.max(0.01, Math.min(0.99, hitRate));
  const far = Math.max(0.01, Math.min(0.99, faRate));
  return SDTCalculator.probit(hr) - SDTCalculator.probit(far);
}

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

function detectStrengthsWeaknesses(modalities: ReadonlyMap<string, ModalityProfile>): {
  strengths: string[];
  weaknesses: string[];
} {
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  if (modalities.size < 2) return { strengths, weaknesses };

  const entries = Array.from(modalities.entries());
  const avg = entries.reduce((sum, [, p]) => sum + p.dPrime, 0) / entries.length;

  for (const [modalityId, profile] of entries) {
    const diff = profile.dPrime - avg;
    if (diff > 0.5) strengths.push(modalityId);
    else if (diff < -0.5) weaknesses.push(modalityId);
  }

  return { strengths, weaknesses };
}

function toTimestamp(value: string | null): number | null {
  if (!value) return null;
  const normalized = value.endsWith('Z') ? value : `${value}Z`;
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? timestamp : null;
}

interface ParsedByModalityStats {
  hits?: unknown;
  misses?: unknown;
  falseAlarms?: unknown;
  correctRejections?: unknown;
  avgRT?: unknown;
}

function parseByModality(value: string | null): Record<string, ParsedByModalityStats> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Record<string, ParsedByModalityStats>;
  } catch {
    return {};
  }
}

// =============================================================================
// Main projection
// =============================================================================

/**
 * Project a PlayerProfile from raw SQL row arrays.
 *
 * Each parameter corresponds to the output of a ReadModelPort.profile* method.
 * The `_sessionDayRows` parameter is accepted for API symmetry but currently unused
 * (session day count is not part of PlayerProfile).
 */
export function projectPlayerProfileFromRows(
  userId: string,
  summaryRows: readonly unknown[],
  latestRows: readonly unknown[],
  _sessionDayRows: readonly unknown[],
  progressionRows: readonly unknown[],
  modalityRows: readonly unknown[],
  streakRows: readonly unknown[],
): PlayerProfile {
  const empty = createEmptyProfile(userId);
  const summary = (summaryRows as ProfileSummaryRow[])?.[0];
  const latest = (latestRows as ProfileLatestSessionRow[])?.[0];

  const totalSessions = Number(summary?.total_sessions ?? 0);
  if (totalSessions <= 0) {
    return empty;
  }

  const modalities = new Map<string, ModalityProfile>();
  const maxNByModality = new Map<string, number>();
  const masteryCountByModality = new Map<string, number>();

  const modalityTotals = new Map<
    string,
    {
      hits: number;
      misses: number;
      falseAlarms: number;
      correctRejections: number;
      rtWeightedSum: number;
      rtWeight: number;
      maxNLevel: number;
      masteryCount: number;
    }
  >();

  for (const row of (modalityRows as ProfileModalitySourceRow[]) ?? []) {
    const nLevel = Number(row.n_level ?? 1);
    const mastered = Number(row.global_d_prime ?? 0) >= SDT_DPRIME_PASS;
    const byModality = parseByModality(row.by_modality);

    for (const [modality, stats] of Object.entries(byModality)) {
      const hits = Number(stats?.hits ?? 0);
      const misses = Number(stats?.misses ?? 0);
      const falseAlarms = Number(stats?.falseAlarms ?? 0);
      const correctRejections = Number(stats?.correctRejections ?? 0);
      const avgRT = Number(stats?.avgRT ?? 0);
      const rtWeight = hits + falseAlarms;

      const aggregate = modalityTotals.get(modality) ?? {
        hits: 0,
        misses: 0,
        falseAlarms: 0,
        correctRejections: 0,
        rtWeightedSum: 0,
        rtWeight: 0,
        maxNLevel: 1,
        masteryCount: 0,
      };

      aggregate.hits += hits;
      aggregate.misses += misses;
      aggregate.falseAlarms += falseAlarms;
      aggregate.correctRejections += correctRejections;
      aggregate.maxNLevel = Math.max(aggregate.maxNLevel, nLevel);
      if (mastered) aggregate.masteryCount += 1;
      if (avgRT > 0 && rtWeight > 0) {
        aggregate.rtWeight += rtWeight;
        aggregate.rtWeightedSum += avgRT * rtWeight;
      }

      modalityTotals.set(modality, aggregate);
    }
  }

  for (const [modality, aggregate] of modalityTotals.entries()) {
    const totalTargets = aggregate.hits + aggregate.misses;
    const hitRate = totalTargets > 0 ? aggregate.hits / totalTargets : 0;
    const noise = aggregate.falseAlarms + aggregate.correctRejections;
    const faRate = noise > 0 ? aggregate.falseAlarms / noise : 0;
    const dPrime = computeDPrimeFromRates(hitRate, faRate);

    modalities.set(modality, {
      totalTargets,
      hits: aggregate.hits,
      misses: aggregate.misses,
      falseAlarms: aggregate.falseAlarms,
      correctRejections: aggregate.correctRejections,
      avgReactionTime: aggregate.rtWeight > 0 ? aggregate.rtWeightedSum / aggregate.rtWeight : null,
      dPrime,
      lureVulnerability: faRate,
    });

    maxNByModality.set(modality, aggregate.maxNLevel);
    masteryCountByModality.set(modality, aggregate.masteryCount);
  }

  const streakRow = (streakRows as ProfileStreakRow[])?.[0];
  const currentStreak = Number(streakRow?.current_streak ?? 0);
  const longestStreak = Number(streakRow?.best_streak ?? 0);
  const lastSessionDate = streakRow?.last_active_date ?? null;

  const progression: ProgressionPoint[] = ((progressionRows as ProfileProgressionRow[]) ?? [])
    .filter((row) => typeof row.week_start === 'string' && row.week_start.length > 0)
    .map((row) => ({
      date: row.week_start ?? '',
      nLevel: Number(row.n_level_max ?? 1),
      avgDPrime: Number(row.avg_d_prime ?? 0),
      sessionsAtLevel: Number(row.sessions_count ?? 0),
    }));

  const { strengths, weaknesses } = detectStrengthsWeaknesses(modalities);
  const lastEventTimestamp = toTimestamp(latest?.created_at ?? null);

  return {
    odalisqueId: userId,
    version: 2,
    computedAt: Date.now(),

    currentNLevel: Number(latest?.n_level ?? summary?.highest_n_level ?? 1),
    highestNLevel: Number(summary?.highest_n_level ?? 1),

    totalSessions,
    totalTrials: Number(summary?.total_trials ?? 0),
    totalDurationMs: Number(summary?.total_duration_ms ?? 0),
    avgDPrime: Number(summary?.avg_d_prime ?? 0),
    bestDPrime: Number(summary?.best_d_prime ?? 0),

    modalities,
    strengths,
    weaknesses,

    preferredISI: empty.preferredISI,
    avgReactionTime: computeAvgReactionTime(modalities),

    avgFocusLostPerSession: Number(summary?.avg_focus_lost_per_session ?? 0),
    totalFocusLostMs: Number(summary?.total_focus_lost_ms ?? 0),

    currentStreak,
    longestStreak,
    lastSessionDate,

    maxNByModality,
    masteryCountByModality,

    progression,

    lastEventId: null,
    lastEventTimestamp,
  };
}
