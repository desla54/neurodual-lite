/**
 * PlaceSessionProjector - Flow Session Projection Class
 *
 * Projette les statistiques d'une session Flow à partir des events bruts.
 * Aucune donnée stockée - tout est recalculé à la demande.
 *
 * Fonctionnalités:
 * - Évaluation des drops (correct/incorrect)
 * - Calcul des stats par modalité et par tour
 * - Analyse des temps de placement
 * - Projection complète de session
 */

import type { ModalityId } from '../types/core';
import type { PlaceRunningStats, PlaceSessionSummary } from '../types/place';
import { createEmptyPlaceStats } from '../types/place';
import { decodeTrajectory } from '../types/trajectory';
import type {
  GameEvent,
  PlaceDropAttemptedEvent,
  PlaceSessionEndedEvent,
  PlaceSessionStartedEvent,
  PlaceTurnCompletedEvent,
  PlaceStimulusShownEvent,
} from './events';
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
  DUAL_PICK_MIN_TRAJECTORY_RATIO,
  SCORING_POINTS_PER_ERROR,
} from '../specs/thresholds';

// =============================================================================
// Extended Types for Projection
// =============================================================================

/**
 * Stats pour une modalité spécifique.
 */
export interface PlaceModalityStats {
  readonly totalDrops: number;
  readonly correctDrops: number;
  readonly errorCount: number;
  readonly accuracy: number;
  readonly avgPlacementTimeMs: number;
}

/**
 * Résultat d'un tour complet.
 */
export interface PlaceTurnResult {
  readonly trialIndex: number;
  readonly totalDrops: number;
  readonly correctDrops: number;
  readonly errorCount: number;
  readonly accuracy: number;
  readonly turnDurationMs: number;
  readonly drops: readonly PlaceDropAttemptedEvent[];
}

/**
 * Trend direction basée sur les derniers tours.
 */
export type PlaceTrend = 'improving' | 'stable' | 'declining';

/**
 * Stats étendues avec détails par modalité et trend.
 */
export interface PlaceExtendedStats extends PlaceRunningStats {
  readonly byModality: Record<ModalityId, PlaceModalityStats>;
  readonly trend: PlaceTrend;
  readonly avgTurnDurationMs: number;
  readonly avgPlacementTimeMs: number;
}

/**
 * Summary étendu avec résultats par tour.
 */
export interface PlaceExtendedSummary extends PlaceSessionSummary {
  readonly turnResults: readonly PlaceTurnResult[];
  readonly extendedStats: PlaceExtendedStats;
  /** Zone adaptative finale (1-20), null si non adaptatif */
  readonly finalAdaptiveZone: number | null;
  /** Score de confiance basé sur les trajectoires (0-100) */
  readonly confidenceScore: number | null;
  /** Métriques de confiance par drop */
  readonly dropConfidenceMetrics: readonly PlaceDropConfidenceMetrics[];
}

// =============================================================================
// Confidence Metrics (trajectory-based scoring)
// =============================================================================

/**
 * Métriques de confiance pour un drop individuel.
 * Calculées à partir des données de trajectoire.
 */
export interface PlaceDropConfidenceMetrics {
  readonly proposalId: string;
  readonly trialIndex: number;
  readonly correct: boolean;
  /** Ratio entre distance directe et distance totale (1.0 = parfait) */
  readonly directnessRatio: number;
  /** Nombre de slots visités autres que le slot cible */
  readonly hesitationCount: number;
  /** Temps total passé sur des mauvais slots (ms) */
  readonly wrongSlotDwellMs: number;
  /** Durée du drag (ms) */
  readonly dragDurationMs: number;
  /** Score de confiance pour ce drop (0-100), null pour le dernier slot (exclu du calcul) */
  readonly confidenceScore: number | null;
  /** Données de trajectoire disponibles */
  readonly hasTrajectoryData: boolean;
}

// =============================================================================
// Constants (@see thresholds.ts SSOT)
// =============================================================================

/** Nombre de tours pour calculer le trend */
const TREND_WINDOW_SIZE = _TREND_WINDOW_SIZE;

/** Seuil de variation pour détecter un trend (accuracy change) */
const TREND_THRESHOLD = _TREND_THRESHOLD;

// === Confidence scoring constants ===
/** Poids du directnessRatio dans le score (0-60 points d'impact) */
const DIRECTNESS_WEIGHT = CONFIDENCE_DIRECTNESS_WEIGHT;

/** Seuil minimum de dwell (ms) pour considérer un arrêt comme significatif */
const SIGNIFICANT_DWELL_THRESHOLD_MS = CONFIDENCE_SIGNIFICANT_DWELL_MS;

/** Pénalité par 100ms passé sur un mauvais slot (arrêts significatifs seulement) */
const WRONG_SLOT_DWELL_PENALTY_PER_100MS = CONFIDENCE_WRONG_SLOT_PENALTY_PER_100MS;

/** Seuil de temps (ms) pour considérer un drag comme "rapide" */
const FAST_DRAG_THRESHOLD_MS = CONFIDENCE_FAST_DRAG_THRESHOLD_MS;

/** Seuil de directness ratio pour considérer une trajectoire comme "directe" */
const DIRECT_RATIO_THRESHOLD = CONFIDENCE_DIRECT_RATIO_THRESHOLD;

/** Bonus pour un drag rapide ET direct */
const SPEED_BONUS = CONFIDENCE_SPEED_BONUS;

/** Score de confiance par défaut quand pas de données de trajectoire */
const DEFAULT_CONFIDENCE_SCORE = CONFIDENCE_DEFAULT_SCORE;

// =============================================================================
// Helpers
// =============================================================================

/**
 * Compute dwell times from slot entries.
 * Returns array of { slot, type, dwellMs } for each slot visited.
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
function computeDropConfidenceMetrics(drop: PlaceDropAttemptedEvent): PlaceDropConfidenceMetrics {
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
    // No usable trajectory data - return default values
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

  // Only count SIGNIFICANT dwells on wrong slots (> threshold)
  // Quick pass-through while dragging to target = not penalized
  // A slot is "wrong" if:
  // 1. It's a different slot number than the target, OR
  // 2. It's a different modality type than the proposal type (e.g., hovering audio slot while dragging position card)
  const targetType = drop.proposalType; // The type of card being dropped
  const significantWrongDwells = slotDwells.filter((d) => {
    const isWrongSlot = d.slot !== drop.targetSlot;
    const isWrongType = d.type !== undefined && d.type !== targetType;
    return (isWrongSlot || isWrongType) && d.dwellMs > SIGNIFICANT_DWELL_THRESHOLD_MS;
  });

  // Count of significant hesitations (for metrics, not used in score)
  const hesitationCount = significantWrongDwells.length;

  // Sum dwell time on wrong slots (only significant ones)
  const wrongSlotDwellMs = significantWrongDwells.reduce((sum, d) => sum + d.dwellMs, 0);

  // Calculate confidence score
  let score = 100;
  if (trajectoryConfidence) {
    score = trajectoryConfidence.score - computeWrongDwellPenalty(wrongSlotDwellMs);
  } else {
    // Legacy scoring when no usable XY trajectory data is available.
    score -= (1 - directnessRatio) * DIRECTNESS_WEIGHT;
    score -= (wrongSlotDwellMs / 100) * WRONG_SLOT_DWELL_PENALTY_PER_100MS;
    const isFast = dragDurationMs < FAST_DRAG_THRESHOLD_MS;
    const isDirect = directnessRatio >= DIRECT_RATIO_THRESHOLD;
    if (isFast && isDirect) {
      score += SPEED_BONUS;
    }
  }

  // Clamp to 0-100
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
 * Calculate overall confidence score from drop metrics.
 * Only considers correct drops with trajectory data.
 * Excludes last slot drops (confidenceScore = null) as they had no choice.
 */
function calculateOverallConfidenceScore(
  metrics: readonly PlaceDropConfidenceMetrics[],
): number | null {
  // Only consider correct drops with trajectory data AND valid confidence score
  // (last slot has null confidenceScore because no choice = no hesitation possible)
  const scorableMetrics = metrics.filter(
    (m) => m.correct && m.hasTrajectoryData && m.confidenceScore !== null,
  );

  if (metrics.length === 0) {
    return null;
  }

  if (scorableMetrics.length === 0) {
    return 0;
  }

  // Average confidence score of scorable drops
  const sum = scorableMetrics.reduce((acc, m) => acc + (m.confidenceScore as number), 0);
  return Math.round(sum / scorableMetrics.length);
}

/**
 * Calculate trend from recent accuracies using linear regression slope.
 */
function calculateTrend(recentAccuracies: readonly number[]): PlaceTrend {
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
// PlaceSessionProjector
// =============================================================================

/**
 * Projecteur de session Flow.
 * Encapsule toutes les fonctions de projection Event Sourcing.
 */
export class PlaceSessionProjector {
  // ===========================================================================
  // Turn Result Computation
  // ===========================================================================

  /**
   * Calcule le résultat d'un tour à partir des events de drops.
   * Stats computed from FLOW_DROP_ATTEMPTED events (Event Sourcing principle).
   */
  static computeTurnResult(
    turnCompleted: PlaceTurnCompletedEvent,
    drops: readonly PlaceDropAttemptedEvent[],
  ): PlaceTurnResult {
    const trialIndex = turnCompleted.trialIndex;
    const relevantDrops = drops.filter((d) => d.trialIndex === trialIndex);

    // Compute stats from drop events (not stored in turn event)
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
      drops: relevantDrops,
    };
  }

  // ===========================================================================
  // Stats Computation
  // ===========================================================================

  /**
   * Calcule les stats étendues à partir des résultats par tour.
   */
  static computeExtendedStats(
    turnResults: readonly PlaceTurnResult[],
    modalities: readonly ModalityId[],
    allDrops: readonly PlaceDropAttemptedEvent[],
  ): PlaceExtendedStats {
    if (turnResults.length === 0) {
      return {
        ...createEmptyPlaceStats(),
        byModality: {} as Record<ModalityId, PlaceModalityStats>,
        trend: 'stable',
        avgTurnDurationMs: 0,
        avgPlacementTimeMs: 0,
      };
    }

    // Aggregate basic stats
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

    // Compute stats by modality
    const byModality: Record<string, PlaceModalityStats> = {};
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

    // Average placement time across all drops
    const totalPlacementTime = allDrops.reduce((sum, d) => sum + d.placementTimeMs, 0);
    const avgPlacementTimeMs = allDrops.length > 0 ? totalPlacementTime / allDrops.length : 0;

    // Calculate trend from turn accuracies
    const recentAccuracies = turnResults.map((t) => t.accuracy);
    const trend = calculateTrend(recentAccuracies);

    return {
      turnsCompleted: turnResults.length,
      totalDrops,
      correctDrops,
      errorCount,
      accuracy,
      byModality: byModality as Record<ModalityId, PlaceModalityStats>,
      trend,
      avgTurnDurationMs,
      avgPlacementTimeMs,
    };
  }

  // ===========================================================================
  // Full Session Projection
  // ===========================================================================

  /**
   * Projette une session Flow complète à partir des events bruts.
   */
  static project(events: readonly GameEvent[]): PlaceExtendedSummary | null {
    const sessionStart = events.find(
      (e): e is PlaceSessionStartedEvent => e.type === 'FLOW_SESSION_STARTED',
    );
    if (!sessionStart) return null;

    const sessionEnd = events.find(
      (e): e is PlaceSessionEndedEvent => e.type === 'FLOW_SESSION_ENDED',
    );

    const drops = events.filter(
      (e): e is PlaceDropAttemptedEvent => e.type === 'FLOW_DROP_ATTEMPTED',
    );

    const turnCompleted = events.filter(
      (e): e is PlaceTurnCompletedEvent => e.type === 'FLOW_TURN_COMPLETED',
    );

    const stimulusEvents = events.filter(
      (e): e is PlaceStimulusShownEvent => e.type === 'FLOW_STIMULUS_SHOWN',
    );

    // Compute results for each turn
    const turnResults: PlaceTurnResult[] = [];
    for (const turn of turnCompleted) {
      const result = PlaceSessionProjector.computeTurnResult(turn, drops);
      turnResults.push(result);
    }

    // Compute extended stats
    const modalities = sessionStart.config.activeModalities as ModalityId[];
    const extendedStats = PlaceSessionProjector.computeExtendedStats(
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

    // Compute confidence metrics for each drop
    const dropConfidenceMetrics = drops.map(computeDropConfidenceMetrics);

    // Calculate overall confidence score from trajectory data
    const confidenceScore = calculateOverallConfidenceScore(dropConfidenceMetrics);

    // Score: Use confidence score if trajectory data available, otherwise fallback to error-based
    // If most drops have trajectory data, use confidence score; otherwise use legacy score
    const dropsWithTrajectory = dropConfidenceMetrics.filter((m) => m.hasTrajectoryData);
    const hasEnoughTrajectoryData =
      drops.length > 0 &&
      dropsWithTrajectory.length >= drops.length * DUAL_PICK_MIN_TRAJECTORY_RATIO;

    const score =
      drops.length === 0
        ? 0
        : hasEnoughTrajectoryData
          ? (confidenceScore ?? 0)
          : Math.max(0, 100 - extendedStats.errorCount * SCORING_POINTS_PER_ERROR);

    // Final adaptive zone (from last stimulus event)
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

  // ===========================================================================
  // Incremental Stats (pour affichage en temps réel)
  // ===========================================================================

  /**
   * Calcule les stats à un moment donné (après N tours).
   */
  static computeStatsUpToTurn(
    events: readonly GameEvent[],
    upToTurnIndex: number,
  ): PlaceExtendedStats {
    const sessionStart = events.find(
      (e): e is PlaceSessionStartedEvent => e.type === 'FLOW_SESSION_STARTED',
    );
    if (!sessionStart) {
      return {
        ...createEmptyPlaceStats(),
        byModality: {} as Record<ModalityId, PlaceModalityStats>,
        trend: 'stable',
        avgTurnDurationMs: 0,
        avgPlacementTimeMs: 0,
      };
    }

    const drops = events.filter(
      (e): e is PlaceDropAttemptedEvent => e.type === 'FLOW_DROP_ATTEMPTED',
    );

    const turnCompleted = events.filter(
      (e): e is PlaceTurnCompletedEvent => e.type === 'FLOW_TURN_COMPLETED',
    );

    // Only include turns up to the specified index
    const relevantTurns = turnCompleted.slice(0, upToTurnIndex + 1);
    const relevantTrialIndices = new Set(relevantTurns.map((t) => t.trialIndex));
    const relevantDrops = drops.filter((d) => relevantTrialIndices.has(d.trialIndex));

    const turnResults: PlaceTurnResult[] = [];
    for (const turn of relevantTurns) {
      const result = PlaceSessionProjector.computeTurnResult(turn, drops);
      turnResults.push(result);
    }

    const modalities = sessionStart.config.activeModalities as ModalityId[];
    return PlaceSessionProjector.computeExtendedStats(turnResults, modalities, relevantDrops);
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  /**
   * Extract placement timing distribution for analysis.
   */
  static getPlacementTimings(events: readonly GameEvent[]): {
    byDropOrder: Record<number, readonly number[]>;
    byModality: Record<ModalityId, readonly number[]>;
  } {
    const drops = events.filter(
      (e): e is PlaceDropAttemptedEvent => e.type === 'FLOW_DROP_ATTEMPTED',
    );

    const byDropOrder: Record<number, number[]> = {};
    const byModality: Record<string, number[]> = {};

    for (const drop of drops) {
      // By drop order
      let orderArray = byDropOrder[drop.dropOrder];
      if (!orderArray) {
        orderArray = [];
        byDropOrder[drop.dropOrder] = orderArray;
      }
      orderArray.push(drop.placementTimeMs);

      // By modality
      let modalityArray = byModality[drop.proposalType];
      if (!modalityArray) {
        modalityArray = [];
        byModality[drop.proposalType] = modalityArray;
      }
      modalityArray.push(drop.placementTimeMs);
    }

    return {
      byDropOrder,
      byModality: byModality as Record<ModalityId, readonly number[]>,
    };
  }

  /**
   * Get adaptive zone progression through the session.
   */
  static getAdaptiveZoneProgression(
    events: readonly GameEvent[],
  ): readonly { trialIndex: number; zone: number }[] {
    const stimulusEvents = events.filter(
      (e): e is PlaceStimulusShownEvent =>
        e.type === 'FLOW_STIMULUS_SHOWN' && e.adaptiveZone !== undefined,
    );

    return stimulusEvents.map((e) => ({
      trialIndex: e.trialIndex,
      zone: e.adaptiveZone as number,
    }));
  }
}
