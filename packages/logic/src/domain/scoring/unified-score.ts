/**
 * UnifiedScoreCalculator
 *
 * Calcule le Unified Performance Score (UPS) pour tous les modes.
 * Score unique 0-100 comparable entre Tempo, Flow et Recall.
 *
 * Formule: UPS = round(100 * (A ** 0.6) * (C ** 0.4))
 * où A = Accuracy/100, C = Confidence/100
 *
 * Si Confidence = null (données insuffisantes):
 * Fallback: UPS = round(AccuracyScore)
 */

import {
  deriveTier,
  type PlaceAccuracyData,
  type DualPickAccuracyData,
  type MemoAccuracyData,
  type TempoAccuracyData,
  type TempoResponseData,
  type UnifiedPerformanceScore,
  UPS_ACCURACY_WEIGHT,
  UPS_CONFIDENCE_WEIGHT,
} from '../../types/ups';
import { TempoConfidenceCalculator } from './tempo-confidence';
import { JaeggiConfidenceCalculator } from './dualnback-classic-confidence';
import { computeBrainWorkshopScoreFromRaw } from '../journey/scoring';
import { JOURNEY_MIN_UPS } from '../../specs/thresholds';
import { computeSpecDrivenTempoAccuracy } from './tempo-accuracy';
import {
  AllSpecs,
  type DualnbackClassicConfidenceSpec,
  type TempoConfidenceSpec,
} from '../../specs';

// Re-export from thresholds.ts (Single Source of Truth)
export { JOURNEY_MIN_UPS };

// =============================================================================
// Spec-Driven Confidence Helpers
// =============================================================================

/**
 * Check if a confidence spec is DualnbackClassicConfidenceSpec (has accuracyThreshold).
 */
function isDualnbackClassicConfidenceSpec(
  spec: TempoConfidenceSpec | DualnbackClassicConfidenceSpec | undefined,
): spec is DualnbackClassicConfidenceSpec {
  return spec !== undefined && 'accuracyThreshold' in spec;
}

function isTempoConfidenceSpec(
  spec: TempoConfidenceSpec | DualnbackClassicConfidenceSpec | undefined,
): spec is TempoConfidenceSpec {
  return spec !== undefined && 'timingDiscipline' in spec;
}

/**
 * Get confidence spec from game mode.
 * Returns the confidence spec from the mode's scoring config.
 */
function getConfidenceSpecFromMode(
  gameMode: string,
): TempoConfidenceSpec | DualnbackClassicConfidenceSpec | undefined {
  const modeSpec = AllSpecs[gameMode as keyof typeof AllSpecs];
  return modeSpec?.scoring?.confidence;
}

// =============================================================================
// Accuracy Calculators
// =============================================================================

/**
 * Calculate Accuracy for Tempo mode using spec-driven strategy.
 *
 * Uses computeSpecDrivenTempoAccuracy to apply the correct formula based on
 * the game mode's scoring.strategy:
 * - 'sdt': Geometric Mean sqrt(hitRate * crRate)
 * - 'dualnback-classic': Error-based (1 - errorRate)
 * - 'brainworkshop': BW formula H / (H + M + FA)
 * - 'accuracy': Simple accuracy H / (H + M)
 *
 * @param data - SDT counts (hits, misses, FA, CR)
 * @param gameMode - The game mode ID to determine scoring strategy
 * @returns Accuracy on 0-100 scale
 */
function calculateTempoAccuracySpecDriven(data: TempoAccuracyData, gameMode: string): number {
  const { hits, misses, falseAlarms, correctRejections } = data;
  const accuracy = computeSpecDrivenTempoAccuracy(
    gameMode,
    hits,
    misses,
    falseAlarms,
    correctRejections,
  );
  return Math.round(accuracy * 100);
}

/**
 * Calculate Balanced Accuracy for Tempo mode (legacy).
 * Formula: (HitRate + CorrectRejectionRate) / 2
 * Returns 0-100 scale.
 *
 * @deprecated Use calculateTempoAccuracySpecDriven with gameMode for spec-driven accuracy
 */
function calculateTempoAccuracyLegacy(data: TempoAccuracyData): number {
  const { hits, misses, falseAlarms, correctRejections } = data;

  const signalTrials = hits + misses;
  const noiseTrials = falseAlarms + correctRejections;

  // Handle edge cases
  if (signalTrials === 0 && noiseTrials === 0) return 0;

  const hitRate = signalTrials > 0 ? hits / signalTrials : 0;
  const correctRejectionRate = noiseTrials > 0 ? correctRejections / noiseTrials : 0;

  // Balanced Accuracy
  const balancedAccuracy = (hitRate + correctRejectionRate) / 2;

  return Math.round(balancedAccuracy * 100);
}

/**
 * Calculate Accuracy for Place mode.
 * Formula: correctDrops / totalDrops × 100
 * Returns 0-100 scale.
 */
function calculatePlaceAccuracy(data: PlaceAccuracyData): number {
  const { correctDrops, totalDrops } = data;

  if (totalDrops === 0) return 0;

  const accuracy = correctDrops / totalDrops;
  return Math.round(accuracy * 100);
}

/**
 * Calculate Accuracy for Memo mode.
 * Formula: correctPicks / totalPicks × 100
 * Returns 0-100 scale.
 */
function calculateRecallAccuracy(data: MemoAccuracyData): number {
  const { correctPicks, totalPicks } = data;

  if (totalPicks === 0) return 0;

  const accuracy = correctPicks / totalPicks;
  return Math.round(accuracy * 100);
}

/**
 * Calculate Accuracy for Dual Pick mode (Same as Place).
 * Formula: correctDrops / totalDrops × 100
 * Returns 0-100 scale.
 */
function calculateDualPickAccuracy(data: DualPickAccuracyData): number {
  const { correctDrops, totalDrops } = data;

  if (totalDrops === 0) return 0;

  const accuracy = correctDrops / totalDrops;
  return Math.round(accuracy * 100);
}

/**
 * Calculate Brain Workshop accuracy (v5.0).
 * Uses centralized scoring from domain/journey/scoring.ts.
 * Returns 0-100 scale.
 */
function calculateBrainWorkshopAccuracy(data: TempoAccuracyData): number {
  return Math.round(computeBrainWorkshopScoreFromRaw(data.hits, data.correctRejections, data.falseAlarms, data.misses));
}

// =============================================================================
// UPS Core Formula
// =============================================================================

/**
 * Get UPS weights from a game mode's spec.
 * Falls back to default weights if not specified.
 */
function getUPSWeightsFromSpec(gameMode: string): {
  accuracyWeight: number;
  confidenceWeight: number;
} {
  const spec = AllSpecs[gameMode as keyof typeof AllSpecs];
  const upsConfig = spec?.scoring?.ups;
  return {
    accuracyWeight: upsConfig?.accuracyWeight ?? UPS_ACCURACY_WEIGHT,
    confidenceWeight: upsConfig?.confidenceWeight ?? UPS_CONFIDENCE_WEIGHT,
  };
}

/**
 * Calculate UPS from accuracy and confidence scores.
 *
 * Formula: UPS = round(100 * (A ** accuracyWeight) * (C ** confidenceWeight))
 * Fallback (no confidence): UPS = round(AccuracyScore)
 *
 * @param accuracy - Accuracy score 0-100
 * @param confidence - Confidence score 0-100 or null
 * @param weights - Optional UPS weights (defaults to thresholds.ts values)
 * @returns UPS score 0-100
 */
function calculateUPS(
  accuracy: number,
  confidence: number | null,
  weights?: { accuracyWeight: number; confidenceWeight: number },
): number {
  // Clamp accuracy to valid range
  const clampedAccuracy = Math.max(0, Math.min(100, accuracy));

  // Fallback when confidence is unavailable: use accuracy directly
  if (confidence === null) {
    return Math.round(clampedAccuracy);
  }

  // Use provided weights or defaults
  const accuracyWeight = weights?.accuracyWeight ?? UPS_ACCURACY_WEIGHT;
  const confidenceWeight = weights?.confidenceWeight ?? UPS_CONFIDENCE_WEIGHT;

  // Normalize to 0-1 for formula
  const a = clampedAccuracy / 100;
  const c = Math.max(0, Math.min(100, confidence)) / 100;

  // Multiplicative formula: prevents confidence compensating for poor accuracy
  const ups = 100 * a ** accuracyWeight * c ** confidenceWeight;

  return Math.round(Math.max(0, Math.min(100, ups)));
}

// =============================================================================
// Main Calculator
// =============================================================================

/**
 * UnifiedScoreCalculator
 *
 * Calculates Unified Performance Score for all game modes.
 */
export class UnifiedScoreCalculator {
  // ===========================================================================
  // Tempo Mode
  // ===========================================================================

  /**
   * Calculate UPS for Tempo mode using spec-driven accuracy.
   *
   * The accuracy formula depends on the game mode's scoring.strategy:
   * - 'sdt' (dual-catch): Geometric Mean
   * - 'jaeggi' (dualnback-classic): Error-based (1 - errorRate)
   * - 'brainworkshop' (sim-brainworkshop): BW formula
   *
   * @param gameMode - The game mode ID (e.g., 'dual-catch', 'dualnback-classic')
   * @param accuracyData - Hits, misses, FA, CR counts
   * @param responseData - Response details for confidence calculation
   * @param isGaming - Optional gaming detection result
   * @returns UnifiedPerformanceScore
   */
  static calculateTempo(
    gameMode: string,
    accuracyData: TempoAccuracyData,
    responseData: readonly TempoResponseData[],
    isGaming = false,
  ): UnifiedPerformanceScore {
    const accuracy = calculateTempoAccuracySpecDriven(accuracyData, gameMode);

    // Get confidence spec and calculate using appropriate calculator
    const confidenceSpec = getConfidenceSpecFromMode(gameMode);
    const isDualnbackClassicMode = gameMode === 'dualnback-classic';

    const confidenceResult = isDualnbackClassicMode
      ? JaeggiConfidenceCalculator.calculate(
          responseData,
          accuracy / 100, // Jaeggi expects accuracy as 0-1
          isDualnbackClassicConfidenceSpec(confidenceSpec) ? confidenceSpec : undefined,
        )
      : TempoConfidenceCalculator.calculate(
          responseData,
          isTempoConfidenceSpec(confidenceSpec) ? confidenceSpec : undefined,
        );

    const confidence = confidenceResult.hasEnoughData ? confidenceResult.score : null;

    // Get UPS weights from spec (spec-driven UPS calculation)
    const weights = getUPSWeightsFromSpec(gameMode);
    const score = calculateUPS(accuracy, confidence, weights);
    const tier = deriveTier(score);
    const journeyEligible = !isGaming && score >= JOURNEY_MIN_UPS;

    return {
      score,
      components: { accuracy, confidence },
      journeyEligible,
      tier,
    };
  }

  // ===========================================================================
  // Flow Mode
  // ===========================================================================

  /**
   * Calculate UPS for Place mode.
   *
   * @param data - Place accuracy data with confidence score
   * @param isGaming - Optional gaming detection result
   * @returns UnifiedPerformanceScore
   */
  static calculatePlace(data: PlaceAccuracyData, isGaming = false): UnifiedPerformanceScore {
    const accuracy = calculatePlaceAccuracy(data);
    const confidence = data.confidenceScore;

    const score = calculateUPS(accuracy, confidence);
    const tier = deriveTier(score);
    const journeyEligible = !isGaming && score >= JOURNEY_MIN_UPS;

    return {
      score,
      components: { accuracy, confidence },
      journeyEligible,
      tier,
    };
  }

  // ===========================================================================
  // Memo Mode
  // ===========================================================================

  /**
   * Calculate UPS for Memo mode.
   *
   * @param data - Memo accuracy data with average confidence
   * @param isGaming - Optional gaming detection result
   * @returns UnifiedPerformanceScore
   */
  static calculateRecall(data: MemoAccuracyData, isGaming = false): UnifiedPerformanceScore {
    const accuracy = calculateRecallAccuracy(data);
    const confidence = data.avgConfidenceScore;

    const score = calculateUPS(accuracy, confidence);
    const tier = deriveTier(score);
    const journeyEligible = !isGaming && score >= JOURNEY_MIN_UPS;

    return {
      score,
      components: { accuracy, confidence },
      journeyEligible,
      tier,
    };
  }

  // ===========================================================================
  // Dual Pick Mode
  // ===========================================================================

  /**
   * Calculate UPS for Dual Pick mode.
   *
   * @param data - Dual Pick accuracy data with confidence score
   * @param isGaming - Optional gaming detection result
   * @returns UnifiedPerformanceScore
   */
  static calculateDualPick(data: DualPickAccuracyData, isGaming = false): UnifiedPerformanceScore {
    const accuracy = calculateDualPickAccuracy(data);
    const confidence = data.confidenceScore;

    const score = calculateUPS(accuracy, confidence);
    const tier = deriveTier(score);
    const journeyEligible = !isGaming && score >= JOURNEY_MIN_UPS;

    return {
      score,
      components: { accuracy, confidence },
      journeyEligible,
      tier,
    };
  }

  // ===========================================================================
  // Generic UPS Calculation
  // ===========================================================================

  /**
   * Calculate UPS from raw accuracy and confidence values.
   * Useful for testing or custom scenarios.
   *
   * @param accuracy - Accuracy score 0-100
   * @param confidence - Confidence score 0-100 or null
   * @param isGaming - Optional gaming detection result
   * @param gameMode - Optional game mode for spec-driven UPS weights
   * @returns UnifiedPerformanceScore
   */
  static calculate(
    accuracy: number,
    confidence: number | null,
    isGaming = false,
    gameMode?: string,
  ): UnifiedPerformanceScore {
    // Get UPS weights from spec if gameMode provided
    const weights = gameMode ? getUPSWeightsFromSpec(gameMode) : undefined;
    const score = calculateUPS(accuracy, confidence, weights);
    const tier = deriveTier(score);
    const journeyEligible = !isGaming && score >= JOURNEY_MIN_UPS;

    return {
      score,
      components: { accuracy, confidence },
      journeyEligible,
      tier,
    };
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  /**
   * Get just the UPS score (convenience method).
   */
  static getScore(accuracy: number, confidence: number | null): number {
    return calculateUPS(accuracy, confidence);
  }

  /**
   * Check if a UPS score is eligible for Journey progression.
   */
  static isJourneyEligible(ups: UnifiedPerformanceScore): boolean {
    return ups.journeyEligible;
  }

  // ===========================================================================
  // Exposed Helpers for Testing
  // ===========================================================================

  /**
   * Calculate Accuracy for Tempo mode using spec-driven strategy (exposed for testing).
   * @param data - SDT counts
   * @param gameMode - Game mode ID for strategy lookup
   */
  static calculateTempoAccuracy(data: TempoAccuracyData, gameMode: string): number {
    return calculateTempoAccuracySpecDriven(data, gameMode);
  }

  /**
   * Calculate Balanced Accuracy for Tempo mode (legacy, exposed for testing).
   * @deprecated Use calculateTempoAccuracy with gameMode parameter
   */
  static calculateTempoAccuracyLegacy(data: TempoAccuracyData): number {
    return calculateTempoAccuracyLegacy(data);
  }

  /**
   * Calculate Accuracy for Place mode (exposed for testing).
   */
  static calculatePlaceAccuracy(data: PlaceAccuracyData): number {
    return calculatePlaceAccuracy(data);
  }

  /**
   * Calculate Accuracy for Memo mode (exposed for testing).
   */
  static calculateRecallAccuracy(data: MemoAccuracyData): number {
    return calculateRecallAccuracy(data);
  }

  /**
   * Calculate Accuracy for Dual Pick mode (exposed for testing).
   */
  static calculateDualPickAccuracy(data: DualPickAccuracyData): number {
    return calculateDualPickAccuracy(data);
  }

  /**
   * Calculate BrainWorkshop penalty score accuracy.
   * Uses the native BrainWorkshop formula: ((H + CR - FA - M) / Total + 1) / 2 × 100
   */
  static calculateBrainWorkshopAccuracy(data: TempoAccuracyData): number {
    return calculateBrainWorkshopAccuracy(data);
  }

  /**
   * Calculate UPS from raw values (exposed for testing).
   */
  static calculateUPS(accuracy: number, confidence: number | null): number {
    return calculateUPS(accuracy, confidence);
  }

  /**
   * Derive tier from score (exposed for testing).
   */
  static deriveTier(score: number, isGaming = false): UnifiedPerformanceScore {
    const tier = deriveTier(score);
    const journeyEligible = !isGaming && score >= JOURNEY_MIN_UPS;
    return {
      score,
      components: { accuracy: score, confidence: null },
      journeyEligible,
      tier,
    };
  }
}
