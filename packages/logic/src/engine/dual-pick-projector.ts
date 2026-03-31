/**
 * DualPickSessionProjector - Dual Label Session Projection Class
 *
 * Projects Dual Label session statistics from raw events.
 * No stored data - everything is recomputed on demand.
 *
 * Features:
 * - Drop evaluation (correct/incorrect)
 * - Stats per modality and per turn
 * - Placement time analysis
 * - Full session projection
 * - Confidence score calculation from trajectories
 */

import type { ModalityId } from '../types/core';
import type {
  DualPickExtendedStats,
  DualPickExtendedSummary,
  DualPickModalityStats,
  DualPickTurnResult,
  DualPickTrend,
  DualPickDropConfidenceMetrics,
} from '../types/dual-pick';
import { createEmptyDualPickStats } from '../types/dual-pick';
import type {
  GameEvent,
  DualPickDropAttemptedEvent,
  DualPickSessionEndedEvent,
  DualPickSessionStartedEvent,
  DualPickTurnCompletedEvent,
  DualPickStimulusShownEvent,
} from './events';
import { decodeTrajectory } from '../types/trajectory';
import {
  computeDirectnessRatioFromPoints,
  computeTrajectoryConfidence,
  computeWrongDwellPenalty,
} from './trajectory-confidence';
import {
  TREND_WINDOW_SIZE as _TREND_WINDOW_SIZE,
  TREND_THRESHOLD as _TREND_THRESHOLD,
  CONFIDENCE_DIRECTNESS_WEIGHT,
  CONFIDENCE_SIGNIFICANT_DWELL_MS,
  CONFIDENCE_WRONG_SLOT_PENALTY_PER_100MS,
  CONFIDENCE_FAST_DRAG_THRESHOLD_MS,
  CONFIDENCE_DIRECT_RATIO_THRESHOLD,
  CONFIDENCE_SPEED_BONUS,
  CONFIDENCE_DEFAULT_SCORE,
  DUAL_PICK_FALLBACK_POINTS_PER_ERROR,
  DUAL_PICK_MIN_TRAJECTORY_RATIO,
} from '../specs/thresholds';

// =============================================================================
// Constants (@see thresholds.ts SSOT)
// =============================================================================

/** Trend window size */
const TREND_WINDOW_SIZE = _TREND_WINDOW_SIZE;

/** Trend threshold (accuracy change) */
const TREND_THRESHOLD = _TREND_THRESHOLD;

// === Confidence scoring constants ===
const DIRECTNESS_WEIGHT = CONFIDENCE_DIRECTNESS_WEIGHT;
const SIGNIFICANT_DWELL_THRESHOLD_MS = CONFIDENCE_SIGNIFICANT_DWELL_MS;
const WRONG_SLOT_DWELL_PENALTY_PER_100MS = CONFIDENCE_WRONG_SLOT_PENALTY_PER_100MS;
const FAST_DRAG_THRESHOLD_MS = CONFIDENCE_FAST_DRAG_THRESHOLD_MS;
const DIRECT_RATIO_THRESHOLD = CONFIDENCE_DIRECT_RATIO_THRESHOLD;
const SPEED_BONUS = CONFIDENCE_SPEED_BONUS;
const DEFAULT_CONFIDENCE_SCORE = CONFIDENCE_DEFAULT_SCORE;

// =============================================================================
// Helpers
// =============================================================================

/**
 * Compute dwell times from slot entries (includes type for modality comparison).
 */
function computeSlotDwells(
  slotEnters:
    | readonly { slot: number; type?: 'position' | 'audio' | 'unified'; atMs: number }[]
    | undefined,
  dragEndMs: number,
): { slot: number; type: 'position' | 'audio' | 'unified' | undefined; dwellMs: number }[] {
  if (!slotEnters || slotEnters.length === 0) return [];

  const dwells: {
    slot: number;
    type: 'position' | 'audio' | 'unified' | undefined;
    dwellMs: number;
  }[] = [];

  for (let i = 0; i < slotEnters.length; i++) {
    const entry = slotEnters[i];
    if (!entry) continue;

    const nextEntry = slotEnters[i + 1];
    const exitTime = nextEntry ? nextEntry.atMs : dragEndMs;
    const dwellMs = exitTime - entry.atMs;

    dwells.push({ slot: entry.slot, type: entry.type, dwellMs });
  }

  return dwells;
}

/**
 * Compute confidence metrics for a single drop.
 */
function computeDropConfidenceMetrics(
  drop: DualPickDropAttemptedEvent,
): DualPickDropConfidenceMetrics {
  // Last slot = no choice = no hesitation possible → exclude from confidence scoring
  // Return null confidenceScore so it's not included in averages
  if (drop.isLastSlot) {
    return {
      proposalId: drop.proposalId,
      trialIndex: drop.trialIndex,
      correct: drop.correct,
      directnessRatio: 1,
      hesitationCount: 0,
      wrongSlotDwellMs: 0,
      dragDurationMs: drop.placementTimeMs,
      confidenceScore: null, // Excluded from average
      hasTrajectoryData: false,
    };
  }

  const trajectoryPoints = drop.trajectory ? decodeTrajectory(drop.trajectory) : null;
  const trajectoryConfidence = trajectoryPoints
    ? computeTrajectoryConfidence({
        points: trajectoryPoints,
        directDistancePx: drop.directDistancePx,
        containerSize: drop.trajectory?.containerSize,
        slotEnters: drop.slotEnters,
        finalSlot: drop.targetSlot,
        proposalType: drop.proposalType,
      })
    : null;
  const hasDistanceData =
    drop.totalDistancePx !== undefined &&
    drop.totalDistancePx > 0 &&
    drop.directDistancePx !== undefined;
  // hasTrajectoryData = has XY trajectory OR legacy distance data
  const hasTrajectoryData = trajectoryConfidence !== null || hasDistanceData;

  if (!trajectoryConfidence && !trajectoryPoints && !hasDistanceData) {
    return {
      proposalId: drop.proposalId,
      trialIndex: drop.trialIndex,
      correct: drop.correct,
      directnessRatio: 1,
      hesitationCount: 0,
      wrongSlotDwellMs: 0,
      dragDurationMs: drop.placementTimeMs,
      confidenceScore: drop.correct ? DEFAULT_CONFIDENCE_SCORE : 0,
      hasTrajectoryData: false,
    };
  }

  // Calculate directness ratio
  const directnessRatio = hasDistanceData
    ? drop.directDistancePx / drop.totalDistancePx
    : trajectoryPoints
      ? computeDirectnessRatioFromPoints(trajectoryPoints)
      : 1;

  // Calculate drag duration
  const dragDurationMs = drop.placementTimeMs;
  const lastSlotEnter =
    drop.slotEnters && drop.slotEnters.length > 0
      ? drop.slotEnters[drop.slotEnters.length - 1]
      : undefined;
  const dragEndMs =
    drop.dragStartedAtMs !== undefined
      ? drop.dragStartedAtMs + dragDurationMs
      : (lastSlotEnter?.atMs ?? 0);

  // Compute dwell times per slot (now includes type)
  const slotDwells = computeSlotDwells(drop.slotEnters, dragEndMs);

  // Significant dwells on wrong slots
  // A slot is "wrong" if:
  // 1. It's a different slot number than the target, OR
  // 2. It's a different modality type than the proposal type
  const targetType = drop.proposalType; // The type of label being dropped
  const significantWrongDwells = slotDwells.filter((d) => {
    const isWrongSlot = d.slot !== drop.targetSlot;
    const isWrongType = d.type !== undefined && d.type !== targetType;
    return (isWrongSlot || isWrongType) && d.dwellMs > SIGNIFICANT_DWELL_THRESHOLD_MS;
  });

  const hesitationCount = significantWrongDwells.length;
  const wrongSlotDwellMs = significantWrongDwells.reduce((sum, d) => sum + d.dwellMs, 0);

  // Calculate confidence score
  let score = 100;

  if (trajectoryConfidence) {
    score = trajectoryConfidence.score - computeWrongDwellPenalty(wrongSlotDwellMs);
  } else {
    score -= (1 - directnessRatio) * DIRECTNESS_WEIGHT;
    score -= (wrongSlotDwellMs / 100) * WRONG_SLOT_DWELL_PENALTY_PER_100MS;
    const isFast = dragDurationMs < FAST_DRAG_THRESHOLD_MS;
    const isDirect = directnessRatio >= DIRECT_RATIO_THRESHOLD;
    if (isFast && isDirect) {
      score += SPEED_BONUS;
    }
  }

  // Clamp
  score = Math.max(0, Math.min(100, score));

  // If incorrect, score is 0
  if (!drop.correct) {
    score = 0;
  }

  return {
    proposalId: drop.proposalId,
    trialIndex: drop.trialIndex,
    correct: drop.correct,
    directnessRatio,
    hesitationCount,
    wrongSlotDwellMs,
    dragDurationMs,
    confidenceScore: Math.round(score),
    hasTrajectoryData,
  };
}

/**
 * Calculate overall confidence score.
 * Excludes last slot drops (confidenceScore = null) as they had no choice.
 */
function calculateOverallConfidenceScore(
  metrics: readonly DualPickDropConfidenceMetrics[],
): number {
  // Only consider correct drops with trajectory data AND valid confidence score
  // (last slot has null confidenceScore because no choice = no hesitation possible)
  const scorableMetrics = metrics.filter(
    (m) => m.correct && m.hasTrajectoryData && m.confidenceScore !== null,
  );

  if (scorableMetrics.length === 0) {
    return 0;
  }

  const sum = scorableMetrics.reduce((acc, m) => acc + (m.confidenceScore as number), 0);
  return Math.round(sum / scorableMetrics.length);
}

/**
 * Calculate trend.
 */
function calculateTrend(recentAccuracies: readonly number[]): DualPickTrend {
  if (recentAccuracies.length < TREND_WINDOW_SIZE) {
    return 'stable';
  }

  const values = recentAccuracies.slice(-TREND_WINDOW_SIZE);
  const n = values.length;

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

  if (slope > TREND_THRESHOLD) return 'improving';
  if (slope < -TREND_THRESHOLD) return 'declining';
  return 'stable';
}

// =============================================================================
// DualPickSessionProjector
// =============================================================================

export class DualPickSessionProjector {
  // ===========================================================================
  // Turn Result Computation
  // ===========================================================================

  static computeTurnResult(
    turnCompleted: DualPickTurnCompletedEvent,
    drops: readonly DualPickDropAttemptedEvent[],
  ): DualPickTurnResult {
    const trialIndex = turnCompleted.trialIndex;
    const relevantDrops = drops.filter((d) => d.trialIndex === trialIndex);

    const scorableDrops = relevantDrops.filter((d) => !d.isLastSlot);
    const totalDrops = scorableDrops.length;
    const correctDrops = scorableDrops.filter((d) => d.correct).length;
    const errorCount = totalDrops - correctDrops;

    return {
      trialIndex,
      totalDrops,
      correctDrops,
      errorCount,
      accuracy: totalDrops > 0 ? correctDrops / totalDrops : 0,
      turnDurationMs: turnCompleted.turnDurationMs,
    };
  }

  // ===========================================================================
  // Stats Computation
  // ===========================================================================

  static computeExtendedStats(
    turnResults: readonly DualPickTurnResult[],
    modalities: readonly ModalityId[],
    allDrops: readonly DualPickDropAttemptedEvent[],
  ): DualPickExtendedStats {
    if (turnResults.length === 0) {
      return {
        ...createEmptyDualPickStats(),
        byModality: {} as Record<ModalityId, DualPickModalityStats>,
        trend: 'stable',
        avgTurnDurationMs: 0,
        avgPlacementTimeMs: 0,
      };
    }

    let totalDrops = 0;
    let correctDrops = 0;
    let errorCount = 0;
    let totalTurnDurationMs = 0;

    for (const turn of turnResults) {
      totalDrops += turn.totalDrops;
      correctDrops += turn.correctDrops;
      errorCount += turn.errorCount;
      totalTurnDurationMs += turn.turnDurationMs;
    }

    const accuracy = totalDrops > 0 ? correctDrops / totalDrops : 0;
    const avgTurnDurationMs = turnResults.length > 0 ? totalTurnDurationMs / turnResults.length : 0;

    // By Modality
    const byModality: Record<string, DualPickModalityStats> = {};
    for (const modality of modalities) {
      const modalityDrops = allDrops.filter((d) => d.proposalType === modality && !d.isLastSlot);

      const modalityCorrect = modalityDrops.filter((d) => d.correct).length;
      const modalityErrors = modalityDrops.filter((d) => !d.correct).length;
      const totalPlacementTime = modalityDrops.reduce((sum, d) => sum + d.placementTimeMs, 0);

      byModality[modality] = {
        totalDrops: modalityDrops.length,
        correctDrops: modalityCorrect,
        errorCount: modalityErrors,
        accuracy: modalityDrops.length > 0 ? modalityCorrect / modalityDrops.length : 0,
        avgPlacementTimeMs:
          modalityDrops.length > 0 ? totalPlacementTime / modalityDrops.length : 0,
      };
    }

    // Average placement time
    const totalPlacementTime = allDrops.reduce((sum, d) => sum + d.placementTimeMs, 0);
    const avgPlacementTimeMs = allDrops.length > 0 ? totalPlacementTime / allDrops.length : 0;

    // Trend
    const recentAccuracies = turnResults.map((t) => t.accuracy);
    const trend = calculateTrend(recentAccuracies);

    return {
      turnsCompleted: turnResults.length,
      totalDrops,
      correctDrops,
      errorCount,
      accuracy,
      byModality: byModality as Record<ModalityId, DualPickModalityStats>,
      trend,
      avgTurnDurationMs,
      avgPlacementTimeMs,
    };
  }

  // ===========================================================================
  // Full Session Projection
  // ===========================================================================

  static project(events: readonly GameEvent[]): DualPickExtendedSummary | null {
    const sessionStart = events.find(
      (e): e is DualPickSessionStartedEvent => e.type === 'DUAL_PICK_SESSION_STARTED',
    );
    if (!sessionStart) return null;

    const sessionEnd = events.find(
      (e): e is DualPickSessionEndedEvent => e.type === 'DUAL_PICK_SESSION_ENDED',
    );

    const drops = events.filter(
      (e): e is DualPickDropAttemptedEvent => e.type === 'DUAL_PICK_DROP_ATTEMPTED',
    );

    const turnCompleted = events.filter(
      (e): e is DualPickTurnCompletedEvent => e.type === 'DUAL_PICK_TURN_COMPLETED',
    );

    const stimulusEvents = events.filter(
      (e): e is DualPickStimulusShownEvent => e.type === 'DUAL_PICK_STIMULUS_SHOWN',
    );

    // Compute turns
    const turnResults: DualPickTurnResult[] = [];
    for (const turn of turnCompleted) {
      const result = DualPickSessionProjector.computeTurnResult(turn, drops);
      turnResults.push(result);
    }

    // Extended stats
    const modalities = sessionStart.config.activeModalities as ModalityId[];
    const extendedStats = DualPickSessionProjector.computeExtendedStats(
      turnResults,
      modalities,
      drops,
    );

    // Duration
    const lastEvent = events[events.length - 1];
    const durationMs = sessionEnd
      ? sessionEnd.timestamp - sessionStart.timestamp
      : lastEvent
        ? lastEvent.timestamp - sessionStart.timestamp
        : 0;

    // Confidence
    const dropConfidenceMetrics = drops.map(computeDropConfidenceMetrics);
    const confidenceScore = calculateOverallConfidenceScore(dropConfidenceMetrics);

    // Score
    const dropsWithTrajectory = dropConfidenceMetrics.filter((m) => m.hasTrajectoryData);
    const hasEnoughTrajectoryData =
      dropsWithTrajectory.length >= drops.length * DUAL_PICK_MIN_TRAJECTORY_RATIO;

    const score = hasEnoughTrajectoryData
      ? confidenceScore
      : Math.max(0, 100 - extendedStats.errorCount * DUAL_PICK_FALLBACK_POINTS_PER_ERROR);

    // Final zone
    const lastStimulus = stimulusEvents[stimulusEvents.length - 1];
    const finalAdaptiveZone = lastStimulus?.adaptiveZone ?? null;

    return {
      sessionId: sessionStart.sessionId,
      nLevel: sessionStart.config.nLevel,
      totalTrials: sessionStart.config.trialsCount,
      finalStats: {
        turnsCompleted: extendedStats.turnsCompleted,
        totalDrops: extendedStats.totalDrops,
        correctDrops: extendedStats.correctDrops,
        errorCount: extendedStats.errorCount,
        accuracy: extendedStats.accuracy,
      },
      durationMs,
      completed: sessionEnd?.reason === 'completed',
      score,
      turnResults,
      extendedStats,
      finalAdaptiveZone,
      confidenceScore,
      dropConfidenceMetrics,
    };
  }
}
