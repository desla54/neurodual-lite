/**
 * Profile Projector
 *
 * Calcule le profil utilisateur à partir de l'historique des events.
 * Le profil est une PROJECTION - toujours recalculable depuis les events.
 *
 * Principe:
 * - Events = source de vérité (immutable)
 * - Profil = vue calculée (rebuildable)
 * - Snapshot = cache du profil (optimisation)
 */

import type { ModalityId } from '../domain';
import type { ModalityProfile, PlayerProfile, ProgressionPoint } from '../types';
import type { GameEvent, SessionStartedEvent, SessionSummary } from './events';
import { SessionProjector } from './session-projector';
import {
  PROFILE_PREFERRED_ISI_DEFAULT_MS,
  PROFILE_PREFERRED_ISI_MIN_MS,
  PROFILE_PREFERRED_ISI_MAX_MS,
  PROFILE_ISI_RT_MULTIPLIER,
  PROFILE_ISI_OFFSET_MS,
  PROFILE_LURE_VULNERABILITY_DEFAULT,
  PROFILE_DPRIME_GAP_THRESHOLD,
  PROFILE_MASTERY_DPRIME_THRESHOLD,
  MS_PER_DAY,
  DEFAULT_N_LEVEL,
} from '../specs/thresholds';

// =============================================================================
// Re-export types depuis types/ pour rétro-compatibilité
// =============================================================================

export type { ModalityProfile, PlayerProfile, ProgressionPoint };

// =============================================================================
// Empty Profile
// =============================================================================

export function createEmptyProfile(userId: string): PlayerProfile {
  return {
    odalisqueId: userId,
    version: 1,
    computedAt: Date.now(),
    currentNLevel: 1,
    highestNLevel: 1,
    totalSessions: 0,
    totalTrials: 0,
    totalDurationMs: 0,
    avgDPrime: 0,
    bestDPrime: 0,
    modalities: new Map(),
    strengths: [],
    weaknesses: [],
    preferredISI: PROFILE_PREFERRED_ISI_DEFAULT_MS,
    avgReactionTime: null,
    avgFocusLostPerSession: 0,
    totalFocusLostMs: 0,
    currentStreak: 0,
    longestStreak: 0,
    lastSessionDate: null,
    maxNByModality: new Map(),
    masteryCountByModality: new Map(),
    progression: [],
    lastEventId: null,
    lastEventTimestamp: null,
  };
}

// =============================================================================
// Profile Computation
// =============================================================================

/**
 * Groupe les events par session.
 */
function groupEventsBySessions(events: readonly GameEvent[]): Map<string, GameEvent[]> {
  const sessions = new Map<string, GameEvent[]>();

  for (const event of events) {
    const existing = sessions.get(event.sessionId) ?? [];
    existing.push(event);
    sessions.set(event.sessionId, existing);
  }

  return sessions;
}

// =============================================================================
// Internal types for aggregation
// =============================================================================

interface ModalityAccumulator {
  hits: number;
  misses: number;
  falseAlarms: number;
  correctRejections: number;
  lureErrors: number;
  lureTrials: number;
  reactionTimes: number[];
}

function createEmptyAccumulator(): ModalityAccumulator {
  return {
    hits: 0,
    misses: 0,
    falseAlarms: 0,
    correctRejections: 0,
    lureErrors: 0,
    lureTrials: 0,
    reactionTimes: [],
  };
}

/**
 * Calcule le profil complet à partir de tous les events.
 * Utilisé pour rebuild ou premier calcul.
 * Supporte N modalités dynamiquement.
 */
export function computeProfileFromEvents(
  userId: string,
  events: readonly GameEvent[],
): PlayerProfile {
  if (events.length === 0) {
    return createEmptyProfile(userId);
  }

  const sessionGroups = groupEventsBySessions(events);
  const sessionSummaries: SessionSummary[] = [];

  // Projeter chaque session
  for (const sessionEvents of sessionGroups.values()) {
    const summary = SessionProjector.project(sessionEvents);
    if (summary) {
      sessionSummaries.push(summary);
    }
  }

  if (sessionSummaries.length === 0) {
    return createEmptyProfile(userId);
  }

  // Trier par timestamp
  sessionSummaries.sort((a, b) => {
    const aStart = events.find(
      (e): e is SessionStartedEvent => e.type === 'SESSION_STARTED' && e.sessionId === a.sessionId,
    );
    const bStart = events.find(
      (e): e is SessionStartedEvent => e.type === 'SESSION_STARTED' && e.sessionId === b.sessionId,
    );
    return (aStart?.timestamp ?? 0) - (bStart?.timestamp ?? 0);
  });

  // Agréger les stats
  let totalTrials = 0;
  let totalDurationMs = 0;
  let totalDPrimeSum = 0;
  let bestDPrime = 0;
  let totalFocusLostMs = 0;
  let totalFocusLostCount = 0;

  // Stats par modalité (dynamique)
  const modalityAccumulators = new Map<ModalityId, ModalityAccumulator>();

  // Daily activity (just dates for streak calculation)
  const dailyDates = new Set<string>();

  // Progression
  const nLevelHistory: { date: string; nLevel: number; dPrime: number }[] = [];
  let highestNLevel = DEFAULT_N_LEVEL;

  // Progression par modalité (dynamique)
  const maxNByModality = new Map<ModalityId, number>();
  // Sessions par modalité pour calculer mastery count
  const masterySessions = new Map<ModalityId, { timestamp: number; dPrime: number }[]>();

  for (const summary of sessionSummaries) {
    totalTrials += summary.totalTrials;
    totalDurationMs += summary.durationMs;
    totalDPrimeSum += summary.finalStats.globalDPrime;
    bestDPrime = Math.max(bestDPrime, summary.finalStats.globalDPrime);
    totalFocusLostMs += summary.totalFocusLostMs;
    totalFocusLostCount += summary.focusLostCount;

    // Identifier les modalités de cette session
    const sessionStart = events.find(
      (e): e is SessionStartedEvent =>
        e.type === 'SESSION_STARTED' && e.sessionId === summary.sessionId,
    );

    // Agréger stats par modalité depuis byModality
    for (const [modalityId, stats] of Object.entries(summary.finalStats.byModality)) {
      const acc = modalityAccumulators.get(modalityId) ?? createEmptyAccumulator();

      acc.hits += stats.hits;
      acc.misses += stats.misses;
      acc.falseAlarms += stats.falseAlarms;
      acc.correctRejections += stats.correctRejections;

      if (stats.avgRT !== null) {
        acc.reactionTimes.push(stats.avgRT);
      }

      modalityAccumulators.set(modalityId, acc);
    }

    // Lure vulnerability par modalité
    for (const outcome of summary.outcomes) {
      for (const [modalityId, modalityOutcome] of Object.entries(outcome.byModality)) {
        const acc = modalityAccumulators.get(modalityId) ?? createEmptyAccumulator();

        if (modalityOutcome.wasLure) {
          acc.lureTrials++;
          if (modalityOutcome.result === 'falseAlarm') {
            acc.lureErrors++;
          }
        }

        modalityAccumulators.set(modalityId, acc);
      }
    }

    // Daily activity et progression
    if (sessionStart) {
      const dateParts = new Date(sessionStart.timestamp).toISOString().split('T');
      const date = dateParts[0] ?? new Date(sessionStart.timestamp).toDateString();
      dailyDates.add(date);

      // N-level progression
      highestNLevel = Math.max(highestNLevel, sessionStart.nLevel);
      nLevelHistory.push({
        date,
        nLevel: sessionStart.nLevel,
        dPrime: summary.finalStats.globalDPrime,
      });

      // Progression par modalité (dynamique)
      // Fallback for legacy events that may not have activeModalities
      const activeModalities = sessionStart.config?.activeModalities ?? ['position', 'audio'];

      // Track maxN par combinaison de modalités
      const modalityKey = [...activeModalities].sort().join('+') as ModalityId;
      const currentMaxN = maxNByModality.get(modalityKey) ?? 0;
      maxNByModality.set(modalityKey, Math.max(currentMaxN, sessionStart.nLevel));

      // Track mastery sessions pour chaque combinaison à N=3
      if (sessionStart.nLevel === 3) {
        const sessions = masterySessions.get(modalityKey) ?? [];
        sessions.push({
          timestamp: sessionStart.timestamp,
          dPrime: summary.finalStats.globalDPrime,
        });
        masterySessions.set(modalityKey, sessions);
      }
    }
  }

  // Construire les profils par modalité
  const modalities = new Map<ModalityId, ModalityProfile>();
  const allReactionTimes: number[] = [];

  for (const [modalityId, acc] of modalityAccumulators) {
    const dPrime = computeDPrime(acc.hits, acc.misses, acc.falseAlarms, acc.correctRejections);
    const lureVulnerability =
      acc.lureTrials > 0 ? acc.lureErrors / acc.lureTrials : PROFILE_LURE_VULNERABILITY_DEFAULT;
    const avgRT =
      acc.reactionTimes.length > 0
        ? acc.reactionTimes.reduce((a, b) => a + b, 0) / acc.reactionTimes.length
        : null;

    allReactionTimes.push(...acc.reactionTimes);

    modalities.set(modalityId, {
      totalTargets: acc.hits + acc.misses,
      hits: acc.hits,
      misses: acc.misses,
      falseAlarms: acc.falseAlarms,
      correctRejections: acc.correctRejections,
      avgReactionTime: avgRT,
      dPrime,
      lureVulnerability,
    });
  }

  // Strengths and weaknesses (comparer toutes les modalités)
  const strengths: ModalityId[] = [];
  const weaknesses: ModalityId[] = [];

  if (modalities.size >= 2) {
    const modalityDPrimes = Array.from(modalities.entries())
      .map(([id, profile]) => ({ id, dPrime: profile.dPrime }))
      .sort((a, b) => b.dPrime - a.dPrime);

    const best = modalityDPrimes[0];
    const worst = modalityDPrimes[modalityDPrimes.length - 1];

    if (best && worst && best.dPrime - worst.dPrime > PROFILE_DPRIME_GAP_THRESHOLD) {
      strengths.push(best.id);
      weaknesses.push(worst.id);
    }
  }

  // Streaks
  // NOTE: computeStreaks() removed - streak computation moved to UnifiedProjectionManager
  // Using placeholder values for now - will be replaced with projection read
  const sortedDates = Array.from(dailyDates).sort();
  const currentStreak = 0;
  const longestStreak = 0;

  // Progression points (weekly aggregation)
  const progression = aggregateProgression(nLevelHistory);

  // Current N level (calculated from last session performance)
  // Le niveau actuel = niveau joué ± recommandation du coach
  const lastSession = sessionSummaries[sessionSummaries.length - 1];
  const lastSessionStart = lastSession
    ? events.find(
        (e): e is SessionStartedEvent =>
          e.type === 'SESSION_STARTED' && e.sessionId === lastSession.sessionId,
      )
    : undefined;
  const playedLevel = lastSessionStart?.nLevel ?? 1;

  // Le niveau actuel est simplement le dernier niveau joué
  // La progression est gérée indépendamment par computeProgressionIndicatorModel
  const currentNLevel = playedLevel;

  // Last event for incremental updates
  const lastEvent = events[events.length - 1];

  // Compute mastery count par modalité
  const masteryCountByModality = new Map<ModalityId, number>();
  for (const [modalityKey, sessions] of masterySessions) {
    masteryCountByModality.set(
      modalityKey,
      computeConsecutiveMasteryCount(sessions, PROFILE_MASTERY_DPRIME_THRESHOLD),
    );
  }

  return {
    odalisqueId: userId,
    version: 1,
    computedAt: Date.now(),
    currentNLevel,
    highestNLevel,
    totalSessions: sessionSummaries.length,
    totalTrials,
    totalDurationMs,
    avgDPrime: totalDPrimeSum / sessionSummaries.length,
    bestDPrime,
    modalities,
    strengths,
    weaknesses,
    preferredISI: computePreferredISI(allReactionTimes),
    avgReactionTime:
      allReactionTimes.length > 0
        ? allReactionTimes.reduce((a, b) => a + b, 0) / allReactionTimes.length
        : null,
    avgFocusLostPerSession:
      sessionSummaries.length > 0 ? totalFocusLostCount / sessionSummaries.length : 0,
    totalFocusLostMs,
    currentStreak,
    longestStreak,
    lastSessionDate: sortedDates.length > 0 ? (sortedDates[sortedDates.length - 1] ?? null) : null,
    maxNByModality,
    masteryCountByModality,
    progression,
    lastEventId: lastEvent?.id ?? null,
    lastEventTimestamp: lastEvent?.timestamp ?? null,
  };
}

// =============================================================================
// Helpers
// =============================================================================

function computeDPrime(hits: number, misses: number, fa: number, cr: number): number {
  const totalTargets = hits + misses;
  const totalNonTargets = fa + cr;

  if (totalTargets === 0 || totalNonTargets === 0) return 0;

  const hitRate = (hits + 0.5) / (totalTargets + 1);
  const faRate = (fa + 0.5) / (totalNonTargets + 1);

  const zHit = Math.sqrt(2) * inverseErf(2 * hitRate - 1);
  const zFa = Math.sqrt(2) * inverseErf(2 * faRate - 1);

  return zHit - zFa;
}

function inverseErf(x: number): number {
  const a = 0.147;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const ln1MinusXSq = Math.log(1 - x * x);
  const term1 = 2 / (Math.PI * a) + ln1MinusXSq / 2;
  const term2 = ln1MinusXSq / a;
  return sign * Math.sqrt(Math.sqrt(term1 * term1 - term2) - term1);
}

/** @see thresholds.ts (SSOT) for ISI formula constants */
function computePreferredISI(allRTs: number[]): number {
  if (allRTs.length === 0) return PROFILE_PREFERRED_ISI_DEFAULT_MS;

  const avgRT = allRTs.reduce((a, b) => a + b, 0) / allRTs.length;
  // ISI = avg RT * multiplier + offset
  const preferredISI = Math.round(avgRT * PROFILE_ISI_RT_MULTIPLIER + PROFILE_ISI_OFFSET_MS);
  return Math.max(
    PROFILE_PREFERRED_ISI_MIN_MS,
    Math.min(PROFILE_PREFERRED_ISI_MAX_MS, preferredISI),
  );
}

function aggregateProgression(
  history: { date: string; nLevel: number; dPrime: number }[],
): ProgressionPoint[] {
  if (history.length === 0) return [];

  // Group by week and n-level
  const weeklyMap = new Map<string, { nLevel: number; dPrimes: number[]; count: number }>();

  for (const { date, nLevel, dPrime } of history) {
    const weekStart = getWeekStart(date);
    const key = `${weekStart}-${nLevel}`;
    const existing = weeklyMap.get(key);

    if (existing) {
      existing.dPrimes.push(dPrime);
      existing.count++;
    } else {
      weeklyMap.set(key, { nLevel, dPrimes: [dPrime], count: 1 });
    }
  }

  const progression: ProgressionPoint[] = [];
  for (const [key, value] of weeklyMap) {
    // Key format: "YYYY-MM-DD-nLevel", extract date
    const parts = key.split('-');
    const date = parts.length >= 3 ? `${parts[0]}-${parts[1]}-${parts[2]}` : key;
    progression.push({
      date,
      nLevel: value.nLevel,
      avgDPrime: value.dPrimes.reduce((a, b) => a + b, 0) / value.dPrimes.length,
      sessionsAtLevel: value.count,
    });
  }

  return progression.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
}

function getWeekStart(dateStr: string): string {
  const date = new Date(dateStr);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  const parts = date.toISOString().split('T');
  return parts[0] ?? dateStr;
}

/**
 * Compte les sessions consécutives (depuis la plus récente) avec d' >= threshold.
 * Utilisé pour déterminer la maîtrise d'un niveau.
 */
function computeConsecutiveMasteryCount(
  sessions: { timestamp: number; dPrime: number }[],
  threshold: number,
): number {
  if (sessions.length === 0) return 0;

  // Trier par timestamp décroissant (plus récent en premier)
  const sorted = [...sessions].sort((a, b) => b.timestamp - a.timestamp);

  let count = 0;
  for (const session of sorted) {
    if (session.dPrime >= threshold) {
      count++;
    } else {
      break; // Stop at first non-mastered session
    }
  }

  return count;
}

// =============================================================================
// Rebuild (for event deletion)
// =============================================================================

/**
 * Recalcule le profil après suppression d'events.
 * Prend le profil actuel et les events restants.
 */
export function rebuildProfile(
  userId: string,
  remainingEvents: readonly GameEvent[],
): PlayerProfile {
  // Simple: just recompute from scratch
  // In production, could be smarter with partial recalc
  return computeProfileFromEvents(userId, remainingEvents);
}

// =============================================================================
// Projection from SessionHistoryItem (for reactive queries)
// =============================================================================

import type { SessionHistoryItem } from '../ports/history-port';
import { SDTCalculator } from '../domain';

/**
 * Compute d-prime from hit rate and false alarm rate using SDTCalculator.probit.
 * Consistent with session-level d' calculations.
 */
function computeDPrimeFromRates(hitRate: number, faRate: number): number {
  const hr = Math.max(0.01, Math.min(0.99, hitRate));
  const far = Math.max(0.01, Math.min(0.99, faRate));
  return SDTCalculator.probit(hr) - SDTCalculator.probit(far);
}

/**
 * Compute streaks from session dates using islands-and-gaps algorithm.
 */
function computeStreaksFromSessions(sessions: readonly SessionHistoryItem[]): {
  current: number;
  longest: number;
  lastDate: string | null;
} {
  if (sessions.length === 0) {
    return { current: 0, longest: 0, lastDate: null };
  }

  const uniqueDays = new Set<string>();
  for (const session of sessions) {
    const dateStr = session.createdAt.toISOString().split('T')[0];
    if (dateStr) uniqueDays.add(dateStr);
  }

  if (uniqueDays.size === 0) {
    return { current: 0, longest: 0, lastDate: null };
  }

  const sortedDays = Array.from(uniqueDays).sort();
  const lastDate = sortedDays[sortedDays.length - 1] ?? null;
  const dayTimestamps = sortedDays.map((d) => new Date(d).getTime());

  const streaks: { length: number; endTimestamp: number }[] = [];
  let currentStreakLength = 1;
  let currentStreakEnd = dayTimestamps[0] ?? 0;

  for (let i = 1; i < dayTimestamps.length; i++) {
    const current = dayTimestamps[i] ?? 0;
    const previous = dayTimestamps[i - 1] ?? 0;
    const diff = current - previous;

    if (diff === MS_PER_DAY) {
      currentStreakLength++;
      currentStreakEnd = current;
    } else {
      streaks.push({ length: currentStreakLength, endTimestamp: currentStreakEnd });
      currentStreakLength = 1;
      currentStreakEnd = current;
    }
  }
  streaks.push({ length: currentStreakLength, endTimestamp: currentStreakEnd });

  const longestStreak = Math.max(...streaks.map((s) => s.length), 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayTimestamp = today.getTime();
  const yesterdayTimestamp = todayTimestamp - MS_PER_DAY;

  let currentStreak = 0;
  for (const streak of streaks) {
    if (streak.endTimestamp >= yesterdayTimestamp) {
      currentStreak = streak.length;
      break;
    }
  }

  return {
    current: currentStreak,
    longest: Math.max(longestStreak, currentStreak),
    lastDate,
  };
}

/**
 * Projette le profil joueur depuis l'historique des sessions.
 *
 * Cette fonction est PURE (déterministe, sans effets de bord).
 * Utilisée par useProfileQuery() pour calculer réactivement
 * le profil depuis useSessionsQuery().
 *
 * Différence avec computeProfileFromEvents:
 * - computeProfileFromEvents prend des GameEvent[] (events bruts)
 * - projectProfileFromSessions prend des SessionHistoryItem[] (summaries)
 *
 * Cette version est optimisée pour le pattern PowerSync réactif.
 */
export function projectProfileFromSessions(
  sessions: readonly SessionHistoryItem[],
  userId: string = 'local',
): PlayerProfile {
  if (sessions.length === 0) {
    return createEmptyProfile(userId);
  }

  // Aggregate modality stats
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
  let totalDurationMs = 0;
  let currentNLevel = DEFAULT_N_LEVEL;
  let highestNLevel = DEFAULT_N_LEVEL;

  // Sessions are sorted DESC by date, so first one is most recent
  for (let i = 0; i < sessions.length; i++) {
    const session = sessions[i];
    if (!session) continue;

    if (session.nLevel > highestNLevel) highestNLevel = session.nLevel;
    if (i === 0) currentNLevel = session.nLevel;

    if (session.dPrime !== null && session.dPrime !== undefined) {
      totalDPrime += session.dPrime;
      dPrimeCount++;
      if (session.dPrime > bestDPrime) bestDPrime = session.dPrime;
    }

    totalTrials += session.trialsCount;
    totalDurationMs += session.durationMs;

    for (const [modalityId, stats] of Object.entries(session.byModality)) {
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

      acc.hits += stats.hits ?? 0;
      acc.misses += stats.misses ?? 0;
      acc.falseAlarms += stats.falseAlarms ?? 0;
      acc.correctRejections += stats.correctRejections ?? 0;

      const rt = stats.avgRT;
      if (rt && rt > 0) {
        acc.totalRT += rt;
        acc.rtCount++;
      }
    }
  }

  // Build ModalityProfile map
  const modalities = new Map<string, ModalityProfile>();
  const allRTs: number[] = [];

  for (const [modalityId, acc] of modalityAccumulators) {
    const totalTargets = acc.hits + acc.misses;
    const hitRate = totalTargets > 0 ? acc.hits / totalTargets : 0;
    const faRate =
      acc.falseAlarms + acc.correctRejections > 0
        ? acc.falseAlarms / (acc.falseAlarms + acc.correctRejections)
        : 0;

    const dPrime = computeDPrimeFromRates(hitRate, faRate);
    const avgRT = acc.rtCount > 0 ? acc.totalRT / acc.rtCount : null;
    if (avgRT) allRTs.push(avgRT);

    modalities.set(modalityId, {
      totalTargets,
      hits: acc.hits,
      misses: acc.misses,
      falseAlarms: acc.falseAlarms,
      correctRejections: acc.correctRejections,
      avgReactionTime: avgRT,
      dPrime,
      lureVulnerability: faRate,
    });
  }

  // Detect strengths and weaknesses
  const strengths: string[] = [];
  const weaknesses: string[] = [];

  if (modalities.size >= 2) {
    const entries = Array.from(modalities.entries());
    const avgModDPrime = entries.reduce((sum, [, p]) => sum + p.dPrime, 0) / entries.length;

    for (const [modalityId, profile] of entries) {
      const diff = profile.dPrime - avgModDPrime;
      if (diff > PROFILE_DPRIME_GAP_THRESHOLD) strengths.push(modalityId);
      else if (diff < -PROFILE_DPRIME_GAP_THRESHOLD) weaknesses.push(modalityId);
    }
  }

  // Build progression from sessions
  const weeklyMap = new Map<string, { nLevel: number; dPrimes: number[]; count: number }>();
  for (const session of sessions) {
    const date = session.createdAt;
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(date);
    monday.setDate(diff);
    const weekKey = monday.toISOString().split('T')[0] ?? '';

    if (!weeklyMap.has(weekKey)) {
      weeklyMap.set(weekKey, { nLevel: session.nLevel, dPrimes: [], count: 0 });
    }
    const week = weeklyMap.get(weekKey);
    if (week) {
      week.nLevel = Math.max(week.nLevel, session.nLevel);
      if (session.dPrime !== null && session.dPrime !== undefined) {
        week.dPrimes.push(session.dPrime);
      }
      week.count++;
    }
  }

  const progression = Array.from(weeklyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, data]) => ({
      date,
      nLevel: data.nLevel,
      avgDPrime:
        data.dPrimes.length > 0 ? data.dPrimes.reduce((a, b) => a + b, 0) / data.dPrimes.length : 0,
      sessionsAtLevel: data.count,
    }));

  // Max N and mastery per modality
  const maxNByModality = new Map<string, number>();
  const masteryCountByModality = new Map<string, number>();

  for (const session of sessions) {
    for (const modalityId of Object.keys(session.byModality)) {
      const currentMax = maxNByModality.get(modalityId) ?? 0;
      if (session.nLevel > currentMax) {
        maxNByModality.set(modalityId, session.nLevel);
      }
      if (session.dPrime !== null && session.dPrime >= PROFILE_MASTERY_DPRIME_THRESHOLD) {
        masteryCountByModality.set(modalityId, (masteryCountByModality.get(modalityId) ?? 0) + 1);
      }
    }
  }

  const streaks = computeStreaksFromSessions(sessions);
  const latestSession = sessions[0];

  return {
    odalisqueId: userId,
    version: 1,
    computedAt: Date.now(),
    currentNLevel,
    highestNLevel,
    totalSessions: sessions.length,
    totalTrials,
    totalDurationMs,
    avgDPrime: dPrimeCount > 0 ? totalDPrime / dPrimeCount : 0,
    bestDPrime,
    modalities,
    strengths,
    weaknesses,
    preferredISI: computePreferredISI(allRTs),
    avgReactionTime: allRTs.length > 0 ? allRTs.reduce((a, b) => a + b, 0) / allRTs.length : null,
    avgFocusLostPerSession: 0,
    totalFocusLostMs: 0,
    currentStreak: streaks.current,
    longestStreak: streaks.longest,
    lastSessionDate: streaks.lastDate,
    maxNByModality,
    masteryCountByModality,
    progression,
    lastEventId: null,
    lastEventTimestamp: latestSession?.createdAt.getTime() ?? null,
  };
}
