/**
 * Tempo Accuracy Calculators
 *
 * Spec-driven accuracy calculation for Tempo modes.
 * Extracted to break circular dependency between unified-metrics and unified-score.
 */

import { AllSpecs, type ScoringStrategy } from '../../specs';

// =============================================================================
// Spec-Driven Accuracy Calculation
// =============================================================================

/**
 * Get the scoring strategy from a game mode's spec.
 * Falls back to 'sdt' if mode not found.
 */
function getScoringStrategyFromSpec(gameMode: string): ScoringStrategy {
  const spec = AllSpecs[gameMode as keyof typeof AllSpecs];
  return spec?.scoring?.strategy ?? 'sdt';
}

/**
 * Compute accuracy using SDT Geometric Mean.
 * Formula: sqrt(HitRate × CorrectRejectionRate)
 *
 * Returns 0 if either rate is 0 (punishes extreme behavior).
 */
function computeSDTAccuracy(
  hits: number,
  misses: number,
  falseAlarms: number,
  correctRejections: number,
): number {
  const signalTrials = hits + misses;
  const noiseTrials = falseAlarms + correctRejections;
  if (signalTrials === 0 && noiseTrials === 0) return 0;

  const hitRate = signalTrials > 0 ? hits / signalTrials : 0;
  const crRate = noiseTrials > 0 ? correctRejections / noiseTrials : 0;
  return Math.sqrt(hitRate * crRate);
}

/**
 * Compute accuracy using Jaeggi Error-Based formula.
 * Formula: 1 - (errors / totalRelevant)
 *
 * Jaeggi protocol focuses on errors: fewer errors = higher accuracy.
 * CR are excluded from denominator (not relevant in error counting).
 */
function computeJaeggiAccuracy(
  hits: number,
  misses: number,
  falseAlarms: number,
  _correctRejections: number,
): number {
  const errors = misses + falseAlarms;
  const totalRelevant = hits + misses + falseAlarms;
  if (totalRelevant === 0) return 0;
  return 1 - errors / totalRelevant;
}

/**
 * Compute accuracy using Brain Workshop formula.
 * Formula: Hits / (Hits + Misses + FalseAlarms)
 *
 * CR are IGNORED, making this more punitive than standard accuracy.
 */
function computeBrainWorkshopAccuracy(
  hits: number,
  misses: number,
  falseAlarms: number,
  _correctRejections: number,
): number {
  const denominator = hits + misses + falseAlarms;
  if (denominator === 0) return 0;
  return hits / denominator;
}

/**
 * Compute simple accuracy (for non-tempo modes).
 * Formula: Hits / (Hits + Misses)
 */
function computeSimpleAccuracy(hits: number, misses: number): number {
  const total = hits + misses;
  if (total === 0) return 0;
  return hits / total;
}

/**
 * Compute accuracy using the spec-driven scoring strategy.
 *
 * This function reads the game mode's spec and applies the correct
 * accuracy formula based on `spec.scoring.strategy`:
 * - 'sdt': Geometric Mean (sqrt(hitRate * crRate))
 * - 'dualnback-classic': Error-based (1 - errorRate)
 * - 'brainworkshop': BW formula (H / (H + M + FA))
 * - 'accuracy': Simple accuracy (H / (H + M))
 *
 * @param gameMode - The game mode ID (e.g., 'dualnback-classic', 'stroop')
 * @param hits - Number of hits
 * @param misses - Number of misses
 * @param falseAlarms - Number of false alarms
 * @param correctRejections - Number of correct rejections
 * @returns Accuracy value between 0 and 1
 */
export function computeSpecDrivenTempoAccuracy(
  gameMode: string,
  hits: number,
  misses: number,
  falseAlarms: number,
  correctRejections: number,
): number {
  const strategy = getScoringStrategyFromSpec(gameMode);

  switch (strategy) {
    case 'sdt':
      return computeSDTAccuracy(hits, misses, falseAlarms, correctRejections);
    case 'dualnback-classic':
      return computeJaeggiAccuracy(hits, misses, falseAlarms, correctRejections);
    case 'brainworkshop':
      return computeBrainWorkshopAccuracy(hits, misses, falseAlarms, correctRejections);
    case 'accuracy':
      return computeSimpleAccuracy(hits, misses);
    default:
      // Fallback to SDT for unknown strategies
      return computeSDTAccuracy(hits, misses, falseAlarms, correctRejections);
  }
}
