/**
 * MemoSessionProjector - Recall Session Projection Class
 *
 * Projette les statistiques d'une session Recall à partir des events bruts.
 * Aucune donnée stockée - tout est recalculé à la demande.
 *
 * Fonctionnalités:
 * - Évaluation des picks contre les trials attendus
 * - Règle "last-write-wins" pour picks multiples
 * - Calcul des stats par modalité et par slotIndex
 * - Projection complète de session
 */

import type { ModalityId, Trial } from '../types/core';
import type {
  EvaluatedPick,
  ModalityPick,
  MemoModalityStats,
  MemoRunningStats,
  MemoSessionSummary,
  MemoSlotStats,
  MemoTrend,
  WindowResult,
} from '../types/memo';
import { TREND_THRESHOLD, TREND_WINDOW_SIZE, createEmptyMemoStats } from '../types/memo';
import type {
  GameEvent,
  RecallPickedEvent,
  MemoSessionEndedEvent,
  MemoSessionStartedEvent,
  RecallWindowCommittedEvent,
  RecallWindowOpenedEvent,
} from './events';
import {
  RECALL_FIRST_PICK_HESITATION_MS,
  RECALL_FIRST_PICK_HESITATION_PENALTY,
  RECALL_CORRECTION_PENALTY,
  RECALL_CORRECTION_RATE_MAX_PENALTY,
  RECALL_TIMING_IRREGULARITY_MS,
  RECALL_TIMING_IRREGULARITY_MAX_PENALTY,
  RECALL_BURST_THRESHOLD_MS,
  RECALL_SEQUENTIAL_THRESHOLD_MS,
  RECALL_MIN_PICKS_FOR_STRATEGY,
} from '../specs/thresholds';

// =============================================================================
// Confidence Metrics Types (projection-only, not stored)
// =============================================================================

/**
 * Preparation strategy detected from recall timing patterns.
 *
 * - 'burst': All picks happen in quick succession (< 300ms between picks)
 *   Indicates the user recalled everything at once before picking.
 *
 * - 'sequential': Picks are spread out with pauses (> 500ms average delay)
 *   Indicates the user recalls one item at a time while picking.
 *
 * - 'mixed': Neither clearly burst nor sequential.
 */
export type PreparationStrategy = 'burst' | 'sequential' | 'mixed';

/**
 * Confidence metrics for a single window.
 * Computed from pick timing and corrections.
 */
export interface MemoWindowConfidenceMetrics {
  /** Time from window opened to first pick (ms) */
  readonly timeToFirstPickMs: number;
  /** Total picks made (including corrections) */
  readonly totalPicksMade: number;
  /** Unique cells filled (should equal windowDepth * modalities) */
  readonly uniqueCellsFilled: number;
  /** Number of corrections (picks that replaced previous picks) */
  readonly correctionCount: number;
  /** Average time between picks (ms) */
  readonly avgInterPickDelayMs: number;
  /** Standard deviation of inter-pick delays (ms) */
  readonly interPickDelayStdDev: number;
  /** Confidence score (0-100) */
  readonly confidenceScore: number;
  /** Detected preparation strategy */
  readonly preparationStrategy: PreparationStrategy;
}

/**
 * Extended session summary with confidence metrics.
 */
export interface MemoExtendedSummary extends MemoSessionSummary {
  /** Confidence metrics per window */
  readonly windowConfidence: readonly MemoWindowConfidenceMetrics[];
  /** Average confidence score across all windows */
  readonly avgConfidenceScore: number | null;
  /** Fluency score based on timing consistency (0-100) */
  readonly fluencyScore: number;
  /** Dominant preparation strategy across the session */
  readonly dominantStrategy: PreparationStrategy;
  /** Preparation strategy consistency (0-100): how consistently the user uses the same strategy */
  readonly strategyConsistency: number;
}

// =============================================================================
// Confidence Scoring Constants (@see thresholds.ts SSOT)
// =============================================================================

/** Penalty for first pick hesitation (> this threshold in ms) */
const FIRST_PICK_HESITATION_THRESHOLD_MS = RECALL_FIRST_PICK_HESITATION_MS;
const FIRST_PICK_HESITATION_PENALTY = RECALL_FIRST_PICK_HESITATION_PENALTY;

/** Penalty per correction */
const CORRECTION_PENALTY = RECALL_CORRECTION_PENALTY;

/** Penalty for irregular timing (high std dev) */
const TIMING_IRREGULARITY_THRESHOLD_MS = RECALL_TIMING_IRREGULARITY_MS;
const TIMING_IRREGULARITY_MAX_PENALTY = RECALL_TIMING_IRREGULARITY_MAX_PENALTY;

// =============================================================================
// Preparation Strategy Constants (@see thresholds.ts SSOT)
// =============================================================================

/** Burst threshold: average inter-pick delay below this = burst strategy */
const BURST_THRESHOLD_MS = RECALL_BURST_THRESHOLD_MS;

/** Sequential threshold: average inter-pick delay above this = sequential strategy */
const SEQUENTIAL_THRESHOLD_MS = RECALL_SEQUENTIAL_THRESHOLD_MS;

/** Minimum picks needed to detect strategy (need at least 2 inter-pick delays) */
const MIN_PICKS_FOR_STRATEGY = RECALL_MIN_PICKS_FOR_STRATEGY;

// =============================================================================
// Helpers
// =============================================================================

/**
 * Detect preparation strategy from inter-pick delays.
 *
 * Burst: All picks happen rapidly (< 300ms average delay)
 * Sequential: Picks are spread out (> 500ms average delay)
 * Mixed: Neither clearly burst nor sequential
 */
function detectPreparationStrategy(
  avgInterPickDelayMs: number,
  totalPicks: number,
): PreparationStrategy {
  // Need enough picks to determine strategy
  if (totalPicks < MIN_PICKS_FOR_STRATEGY) {
    return 'mixed';
  }

  if (avgInterPickDelayMs <= BURST_THRESHOLD_MS) {
    return 'burst';
  }

  if (avgInterPickDelayMs >= SEQUENTIAL_THRESHOLD_MS) {
    return 'sequential';
  }

  return 'mixed';
}

/**
 * Compute dominant strategy and consistency from window strategies.
 */
function computeDominantStrategy(windowConfidence: readonly MemoWindowConfidenceMetrics[]): {
  dominant: PreparationStrategy;
  consistency: number;
} {
  if (windowConfidence.length === 0) {
    return { dominant: 'mixed', consistency: 100 };
  }

  // Count strategies
  const counts = { burst: 0, sequential: 0, mixed: 0 };
  for (const w of windowConfidence) {
    counts[w.preparationStrategy]++;
  }

  // Find dominant
  let dominant: PreparationStrategy = 'mixed';
  let maxCount = counts.mixed;

  if (counts.burst > maxCount) {
    dominant = 'burst';
    maxCount = counts.burst;
  }
  if (counts.sequential > maxCount) {
    dominant = 'sequential';
    maxCount = counts.sequential;
  }

  // Consistency = percentage using dominant strategy
  const consistency = Math.round((maxCount / windowConfidence.length) * 100);

  return { dominant, consistency };
}

/**
 * Extract value from trial for a given modality.
 */
function getTrialValueForModality(trial: Trial, modality: ModalityId): ModalityPick {
  switch (modality) {
    case 'position':
      return { modality: 'position', value: trial.position };
    case 'audio':
      return { modality: 'audio', value: trial.sound };
    case 'color':
      return { modality: 'color', value: trial.color };
    default:
      throw new Error(`Unknown modality: ${modality}`);
  }
}

/**
 * Compare two ModalityPick values for equality.
 */
function picksAreEqual(a: ModalityPick, b: ModalityPick): boolean {
  if (a.modality !== b.modality) return false;
  return a.value === b.value;
}

/**
 * Calculate trend from recent accuracies using linear regression slope.
 * Deterministic: positive slope = improving, negative = declining.
 */
function calculateTrend(recentAccuracies: readonly number[]): MemoTrend {
  if (recentAccuracies.length < TREND_WINDOW_SIZE) {
    return 'stable';
  }

  // Use last TREND_WINDOW_SIZE values
  const values = recentAccuracies.slice(-TREND_WINDOW_SIZE);
  const n = values.length;

  // Linear regression slope: sum((x - x̄)(y - ȳ)) / sum((x - x̄)²)
  const xMean = (n - 1) / 2;
  const yMean = values.reduce((a, b) => a + b, 0) / n;

  let numerator = 0;
  let denominator = 0;

  for (let i = 0; i < n; i++) {
    const xDiff = i - xMean;
    const value = values[i];
    if (value === undefined) continue;
    const yDiff = value - yMean;
    numerator += xDiff * yDiff;
    denominator += xDiff * xDiff;
  }

  const slope = denominator !== 0 ? numerator / denominator : 0;

  // Normalize slope to per-window change
  if (slope > TREND_THRESHOLD) return 'improving';
  if (slope < -TREND_THRESHOLD) return 'declining';
  return 'stable';
}

// =============================================================================
// MemoSessionProjector
// =============================================================================

/**
 * Projecteur de session Recall.
 * Encapsule toutes les fonctions de projection Event Sourcing.
 */
export class MemoSessionProjector {
  // ===========================================================================
  // Pick Evaluation (avec last-write-wins)
  // ===========================================================================

  /**
   * Évalue les picks pour un trial donné contre les trials attendus.
   * Applique la règle "last-write-wins" : le dernier pick par (slotIndex, modality) fait foi.
   *
   * @param picks - Tous les RECALL_PICKED events pour ce trial
   * @param trials - Liste des trials de la session
   * @param trialIndex - Index du trial courant
   * @returns Liste des picks évalués
   */
  static evaluatePicks(
    picks: readonly RecallPickedEvent[],
    trials: readonly Trial[],
    trialIndex: number,
  ): readonly EvaluatedPick[] {
    // Appliquer last-write-wins: grouper par (slotIndex, modality), garder le dernier
    const lastPickBySlotModality = new Map<string, RecallPickedEvent>();

    for (const pick of picks) {
      const key = `${pick.slotIndex}:${pick.pick.modality}`;
      lastPickBySlotModality.set(key, pick);
    }

    const evaluated: EvaluatedPick[] = [];

    for (const pick of lastPickBySlotModality.values()) {
      // slotIndex 1 = N (current trial)
      // slotIndex 2 = N-1 (previous trial)
      // slotIndex s = N-(s-1) = trialIndex - (s-1)
      const targetTrialIndex = trialIndex - (pick.slotIndex - 1);

      if (targetTrialIndex < 0 || targetTrialIndex >= trials.length) {
        // Should not happen if picks are valid
        continue;
      }

      const targetTrial = trials[targetTrialIndex];
      if (!targetTrial) continue; // TypeScript guard

      const expected = getTrialValueForModality(targetTrial, pick.pick.modality);
      const correct = picksAreEqual(pick.pick, expected);

      evaluated.push({
        slotIndex: pick.slotIndex,
        modality: pick.pick.modality,
        picked: pick.pick,
        expected,
        correct,
      });
    }

    return evaluated;
  }

  // ===========================================================================
  // Running Stats Computation
  // ===========================================================================

  /**
   * Calcule les stats agrégées depuis les picks évalués.
   * Accuracy-based (pas de d-prime pour le recall).
   */
  static computeStats(
    windowResults: readonly WindowResult[],
    modalities: readonly ModalityId[],
  ): MemoRunningStats {
    if (windowResults.length === 0) {
      return createEmptyMemoStats();
    }

    // Accumulateurs
    let totalPicks = 0;
    let correctPicks = 0;
    const byModality: Record<ModalityId, { total: number; correct: number }> = {};
    const bySlotIndex: Record<number, { total: number; correct: number }> = {};

    // Initialize modality stats
    for (const modality of modalities) {
      byModality[modality] = { total: 0, correct: 0 };
    }

    // Aggregate from all windows
    for (const window of windowResults) {
      for (const pick of window.picks) {
        totalPicks++;
        if (pick.correct) correctPicks++;

        // By modality
        let modalityAcc = byModality[pick.modality];
        if (!modalityAcc) {
          modalityAcc = { total: 0, correct: 0 };
          byModality[pick.modality] = modalityAcc;
        }
        modalityAcc.total++;
        if (pick.correct) modalityAcc.correct++;

        // By slotIndex
        let slotAcc = bySlotIndex[pick.slotIndex];
        if (!slotAcc) {
          slotAcc = { total: 0, correct: 0 };
          bySlotIndex[pick.slotIndex] = slotAcc;
        }
        slotAcc.total++;
        if (pick.correct) slotAcc.correct++;
      }
    }

    // Build final stats
    const accuracy = totalPicks > 0 ? correctPicks / totalPicks : 0;

    const modalityStats: Record<ModalityId, MemoModalityStats> = {};
    for (const [modality, acc] of Object.entries(byModality)) {
      modalityStats[modality as ModalityId] = {
        totalPicks: acc.total,
        correctPicks: acc.correct,
        accuracy: acc.total > 0 ? acc.correct / acc.total : 0,
      };
    }

    const slotStats: Record<number, MemoSlotStats> = {};
    for (const [slotIndex, acc] of Object.entries(bySlotIndex)) {
      slotStats[Number(slotIndex)] = {
        totalPicks: acc.total,
        correctPicks: acc.correct,
        accuracy: acc.total > 0 ? acc.correct / acc.total : 0,
      };
    }

    // Recent accuracies for trend
    const recentAccuracies = windowResults.map((w) => w.accuracy);
    const trend = calculateTrend(recentAccuracies);

    return {
      windowsCompleted: windowResults.length,
      totalPicks,
      correctPicks,
      accuracy,
      byModality: modalityStats,
      bySlotIndex: slotStats,
      trend,
      recentAccuracies,
    };
  }

  // ===========================================================================
  // Window Result Computation
  // ===========================================================================

  /**
   * Calcule le résultat d'une fenêtre commitée.
   */
  static computeWindowResult(
    committedEvent: RecallWindowCommittedEvent,
    picks: readonly RecallPickedEvent[],
    trials: readonly Trial[],
    windowDepth: number,
  ): WindowResult {
    const trialIndex = committedEvent.trialIndex;
    const relevantPicks = picks.filter((p) => p.trialIndex === trialIndex);
    const evaluatedPicks = MemoSessionProjector.evaluatePicks(relevantPicks, trials, trialIndex);

    const correctCount = evaluatedPicks.filter((p) => p.correct).length;
    const totalCount = evaluatedPicks.length;

    return {
      trialIndex,
      windowDepth,
      picks: evaluatedPicks,
      correctCount,
      totalCount,
      accuracy: totalCount > 0 ? correctCount / totalCount : 0,
      recallDurationMs: committedEvent.recallDurationMs,
    };
  }

  // ===========================================================================
  // Full Session Projection
  // ===========================================================================

  /**
   * Projette une session Recall complète à partir des events bruts.
   */
  static project(
    events: readonly GameEvent[],
    trials: readonly Trial[],
  ): MemoSessionSummary | null {
    const sessionStart = events.find(
      (e): e is MemoSessionStartedEvent => e.type === 'RECALL_SESSION_STARTED',
    );
    if (!sessionStart) return null;

    const sessionEnd = events.find(
      (e): e is MemoSessionEndedEvent => e.type === 'RECALL_SESSION_ENDED',
    );

    const picks = events.filter((e): e is RecallPickedEvent => e.type === 'RECALL_PICKED');

    const commits = events.filter(
      (e): e is RecallWindowCommittedEvent => e.type === 'RECALL_WINDOW_COMMITTED',
    );

    // Extract window depths from RECALL_WINDOW_OPENED events
    const windowDepths = new Map<number, number>();
    for (const e of events) {
      if (e.type === 'RECALL_WINDOW_OPENED') {
        windowDepths.set(e.trialIndex, e.requiredWindowDepth);
      }
    }

    // Compute results for each committed window
    const windowResults: WindowResult[] = [];
    for (const commit of commits) {
      const windowDepth = windowDepths.get(commit.trialIndex) ?? sessionStart.config.nLevel;
      const result = MemoSessionProjector.computeWindowResult(commit, picks, trials, windowDepth);
      windowResults.push(result);
    }

    // Compute final stats
    const finalStats = MemoSessionProjector.computeStats(
      windowResults,
      sessionStart.config.activeModalities,
    );

    // Duration
    const lastEvent = events[events.length - 1];
    const durationMs = sessionEnd
      ? sessionEnd.timestamp - sessionStart.timestamp
      : lastEvent
        ? lastEvent.timestamp - sessionStart.timestamp
        : 0;

    // Average recall time
    const avgRecallTimeMs =
      windowResults.length > 0
        ? windowResults.reduce((sum, w) => sum + w.recallDurationMs, 0) / windowResults.length
        : 0;

    return {
      sessionId: sessionStart.sessionId,
      nLevel: sessionStart.config.nLevel,
      totalTrials: trials.length,
      windowResults,
      finalStats,
      durationMs,
      avgRecallTimeMs,
      completed: sessionEnd?.reason === 'completed',
    };
  }

  // ===========================================================================
  // Incremental Stats (pour affichage en temps réel)
  // ===========================================================================

  /**
   * Calcule les stats à un moment donné (après N windows).
   */
  static computeStatsUpToWindow(
    events: readonly GameEvent[],
    trials: readonly Trial[],
    upToWindowIndex: number,
    modalities: readonly ModalityId[],
  ): MemoRunningStats {
    const picks = events.filter((e): e is RecallPickedEvent => e.type === 'RECALL_PICKED');

    const commits = events.filter(
      (e): e is RecallWindowCommittedEvent => e.type === 'RECALL_WINDOW_COMMITTED',
    );

    // Extract window depths
    const windowDepths = new Map<number, number>();
    for (const e of events) {
      if (e.type === 'RECALL_WINDOW_OPENED') {
        windowDepths.set(e.trialIndex, e.requiredWindowDepth);
      }
    }

    // Get session config for nLevel fallback
    const sessionStart = events.find(
      (e): e is MemoSessionStartedEvent => e.type === 'RECALL_SESSION_STARTED',
    );
    const nLevel = sessionStart?.config.nLevel ?? 2;

    // Only include commits up to the specified index
    const relevantCommits = commits.slice(0, upToWindowIndex + 1);

    const windowResults: WindowResult[] = [];
    for (const commit of relevantCommits) {
      const windowDepth = windowDepths.get(commit.trialIndex) ?? nLevel;
      const result = MemoSessionProjector.computeWindowResult(commit, picks, trials, windowDepth);
      windowResults.push(result);
    }

    return MemoSessionProjector.computeStats(windowResults, modalities);
  }

  // ===========================================================================
  // Confidence Metrics Computation
  // ===========================================================================

  /**
   * Compute confidence metrics for a single window.
   */
  static computeWindowConfidence(
    windowOpenedEvent: RecallWindowOpenedEvent,
    picks: readonly RecallPickedEvent[],
    committedEvent: RecallWindowCommittedEvent,
  ): MemoWindowConfidenceMetrics {
    const trialIndex = windowOpenedEvent.trialIndex;
    const windowPicks = picks.filter((p) => p.trialIndex === trialIndex);

    // Sort picks by timestamp
    const sortedPicks = [...windowPicks].sort((a, b) => a.monotonicMs - b.monotonicMs);

    // Time to first pick
    const firstPick = sortedPicks[0];
    const timeToFirstPickMs = firstPick
      ? firstPick.monotonicMs - windowOpenedEvent.monotonicMs
      : committedEvent.recallDurationMs;

    // Count corrections (picks where isCorrection === true)
    const correctionCount = windowPicks.filter((p) => p.isCorrection === true).length;

    // Unique cells = unique (slotIndex, modality) combinations
    const uniqueCells = new Set(windowPicks.map((p) => `${p.slotIndex}:${p.pick.modality}`));
    const uniqueCellsFilled = uniqueCells.size;

    // Inter-pick delays
    const interPickDelays: number[] = [];
    for (let i = 1; i < sortedPicks.length; i++) {
      const prev = sortedPicks[i - 1];
      const curr = sortedPicks[i];
      if (prev && curr) {
        interPickDelays.push(curr.monotonicMs - prev.monotonicMs);
      }
    }

    const avgInterPickDelayMs =
      interPickDelays.length > 0
        ? interPickDelays.reduce((a, b) => a + b, 0) / interPickDelays.length
        : 0;

    // Standard deviation of inter-pick delays
    let interPickDelayStdDev = 0;
    if (interPickDelays.length > 1) {
      const variance =
        interPickDelays.reduce((sum, d) => sum + (d - avgInterPickDelayMs) ** 2, 0) /
        interPickDelays.length;
      interPickDelayStdDev = Math.sqrt(variance);
    }

    // Compute confidence score
    let confidenceScore = 100;

    // Penalty for first pick hesitation
    if (timeToFirstPickMs > FIRST_PICK_HESITATION_THRESHOLD_MS) {
      confidenceScore -= FIRST_PICK_HESITATION_PENALTY;
    }

    // Penalty per correction
    confidenceScore -= correctionCount * CORRECTION_PENALTY;

    // Penalty for irregular timing
    if (interPickDelayStdDev > TIMING_IRREGULARITY_THRESHOLD_MS) {
      const irregularityRatio = Math.min(
        interPickDelayStdDev / TIMING_IRREGULARITY_THRESHOLD_MS - 1,
        1,
      );
      confidenceScore -= irregularityRatio * TIMING_IRREGULARITY_MAX_PENALTY;
    }

    // Clamp to 0-100
    confidenceScore = Math.max(0, Math.min(100, Math.round(confidenceScore)));

    // Detect preparation strategy
    const preparationStrategy = detectPreparationStrategy(avgInterPickDelayMs, windowPicks.length);

    return {
      timeToFirstPickMs,
      totalPicksMade: windowPicks.length,
      uniqueCellsFilled,
      correctionCount,
      avgInterPickDelayMs,
      interPickDelayStdDev,
      confidenceScore,
      preparationStrategy,
    };
  }

  /**
   * Compute fluency score from window confidence metrics.
   * Based on timing consistency across all windows.
   */
  static computeFluencyScore(windowConfidence: readonly MemoWindowConfidenceMetrics[]): number {
    if (windowConfidence.length === 0) return 100;

    // Fluency is based on:
    // 1. Low average correction rate
    // 2. Consistent inter-pick timing
    // 3. Quick first picks

    let score = 100;

    // Average correction rate penalty
    const totalCorrections = windowConfidence.reduce((sum, w) => sum + w.correctionCount, 0);
    const totalPicks = windowConfidence.reduce((sum, w) => sum + w.totalPicksMade, 0);
    const correctionRate = totalPicks > 0 ? totalCorrections / totalPicks : 0;
    score -= correctionRate * RECALL_CORRECTION_RATE_MAX_PENALTY;

    // Average std dev penalty
    const avgStdDev =
      windowConfidence.reduce((sum, w) => sum + w.interPickDelayStdDev, 0) /
      windowConfidence.length;
    if (avgStdDev > TIMING_IRREGULARITY_THRESHOLD_MS) {
      score -= Math.min(
        RECALL_TIMING_IRREGULARITY_MAX_PENALTY,
        ((avgStdDev - TIMING_IRREGULARITY_THRESHOLD_MS) / TIMING_IRREGULARITY_THRESHOLD_MS) *
          RECALL_TIMING_IRREGULARITY_MAX_PENALTY,
      );
    }

    // First pick hesitation penalty (average)
    const avgFirstPickTime =
      windowConfidence.reduce((sum, w) => sum + w.timeToFirstPickMs, 0) / windowConfidence.length;
    if (avgFirstPickTime > FIRST_PICK_HESITATION_THRESHOLD_MS) {
      score -= RECALL_FIRST_PICK_HESITATION_PENALTY;
    }

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  // ===========================================================================
  // Extended Projection (with confidence)
  // ===========================================================================

  /**
   * Project session with extended confidence metrics.
   */
  static projectExtended(
    events: readonly GameEvent[],
    trials: readonly Trial[],
  ): MemoExtendedSummary | null {
    // First get the base summary
    const baseSummary = MemoSessionProjector.project(events, trials);
    if (!baseSummary) return null;

    // Get window opened events
    const windowOpenedEvents = events.filter(
      (e): e is RecallWindowOpenedEvent => e.type === 'RECALL_WINDOW_OPENED',
    );

    // Get picks and commits
    const picks = events.filter((e): e is RecallPickedEvent => e.type === 'RECALL_PICKED');
    const commits = events.filter(
      (e): e is RecallWindowCommittedEvent => e.type === 'RECALL_WINDOW_COMMITTED',
    );

    // Compute confidence for each window
    const windowConfidence: MemoWindowConfidenceMetrics[] = [];

    for (const commit of commits) {
      const windowOpened = windowOpenedEvents.find((w) => w.trialIndex === commit.trialIndex);
      if (windowOpened) {
        const confidence = MemoSessionProjector.computeWindowConfidence(
          windowOpened,
          picks,
          commit,
        );
        windowConfidence.push(confidence);
      }
    }

    // Compute aggregate scores
    const avgConfidenceScore =
      windowConfidence.length > 0
        ? Math.round(
            windowConfidence.reduce((sum, w) => sum + w.confidenceScore, 0) /
              windowConfidence.length,
          )
        : null;

    const fluencyScore = MemoSessionProjector.computeFluencyScore(windowConfidence);

    // Compute dominant strategy and consistency
    const { dominant: dominantStrategy, consistency: strategyConsistency } =
      computeDominantStrategy(windowConfidence);

    return {
      ...baseSummary,
      windowConfidence,
      avgConfidenceScore,
      fluencyScore,
      dominantStrategy,
      strategyConsistency,
    };
  }
}
