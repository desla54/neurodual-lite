/**
 * Unified Metrics - Cross-mode performance measurement
 *
 * This module provides two complementary metric systems:
 *
 * 1. **Zone System (1-20)** - Progress visualization
 *    - Combines accuracy + N-level into a single progress indicator
 *    - Used for gamification and progression display
 *    - Zone increases with both skill (accuracy) and difficulty (N-level)
 *
 * 2. **UPS (Unified Performance Score, 0-100)** - Performance measurement
 *    - Cross-mode comparable score based on accuracy and confidence
 *    - Formula: UPS = round(100 * (A^0.6) * (C^0.4))
 *    - Used for Journey validation and stats comparison
 *    - Re-exported from './scoring/unified-score' for convenience
 */

import {
  ZONE_PER_N_LEVEL as _ZONE_PER_N_LEVEL,
  ZONE_MIN_ACCURACY_FOR_BONUS,
  ZONE_MAX_ACCURACY_BONUS,
  ZONE_MIN,
  ZONE_MAX,
  DEFAULT_N_LEVEL,
  DEFAULT_ZONE,
  DEFAULT_ZONE_PROGRESS,
} from '../specs/thresholds';

// =============================================================================
// Re-exports from UPS System (unified-score.ts)
// =============================================================================

export { JOURNEY_MIN_UPS, UnifiedScoreCalculator } from './scoring/unified-score';
export type {
  UnifiedPerformanceScore,
  PerformanceTier,
  TempoAccuracyData,
  PlaceAccuracyData,
  MemoAccuracyData,
} from '../types/ups';
export { deriveTier } from '../types/ups';

// Re-export tempo accuracy calculator (from tempo-accuracy.ts to avoid circular dep)
export { computeSpecDrivenTempoAccuracy } from './scoring/tempo-accuracy';

// =============================================================================
// Types
// =============================================================================

export interface UnifiedMetrics {
  /** Raw accuracy (0-1) */
  readonly accuracy: number;
  /** N-level of the session */
  readonly nLevel: number;
  /** Computed zone (1-20) based on accuracy + N-level */
  readonly zone: number;
  /** Progress towards next zone (0-100) */
  readonly zoneProgress: number;
}

// =============================================================================
// Constants (@see thresholds.ts SSOT)
// =============================================================================

/** Zone increment per N-level */
const ZONE_PER_N_LEVEL = _ZONE_PER_N_LEVEL;

/** Minimum accuracy to get bonus zones */
const MIN_ACCURACY_FOR_BONUS = ZONE_MIN_ACCURACY_FOR_BONUS;

/** Maximum bonus zones from accuracy */
const MAX_ACCURACY_BONUS = ZONE_MAX_ACCURACY_BONUS;

/** Minimum zone */
const MIN_ZONE = ZONE_MIN;

/** Maximum zone */
const MAX_ZONE = ZONE_MAX;

// =============================================================================
// Core Calculation
// =============================================================================

/**
 * Compute base zone from N-level.
 * N=1 → Zone 1, N=2 → Zone 4, N=3 → Zone 7, etc.
 */
function computeBaseZone(nLevel: number): number {
  return Math.min(MAX_ZONE - 1, 1 + (nLevel - 1) * ZONE_PER_N_LEVEL);
}

/**
 * Compute accuracy bonus (0 to MAX_ACCURACY_BONUS zones).
 * 50% accuracy → 0 bonus
 * 100% accuracy → 3 bonus
 */
function computeAccuracyBonus(accuracy: number): number {
  if (accuracy < MIN_ACCURACY_FOR_BONUS) return 0;
  const normalized = (accuracy - MIN_ACCURACY_FOR_BONUS) / (1 - MIN_ACCURACY_FOR_BONUS);
  return Math.floor(normalized * (MAX_ACCURACY_BONUS + 1));
}

/**
 * Compute progress towards next zone (0-100).
 */
function computeZoneProgress(accuracy: number, zone: number): number {
  if (zone >= MAX_ZONE) return 100;

  // Progress is based on accuracy within the current zone's range
  const accuracyBonus = computeAccuracyBonus(accuracy);
  const fractionalBonus =
    ((accuracy - MIN_ACCURACY_FOR_BONUS) / (1 - MIN_ACCURACY_FOR_BONUS)) * (MAX_ACCURACY_BONUS + 1);
  const progress = (fractionalBonus - accuracyBonus) * 100;

  return Math.max(0, Math.min(100, Math.round(progress)));
}

/**
 * Compute unified metrics from accuracy and N-level.
 */
export function computeUnifiedMetrics(accuracy: number, nLevel: number): UnifiedMetrics {
  // Clamp inputs
  const clampedAccuracy = Math.max(0, Math.min(1, accuracy));
  const clampedNLevel = Math.max(1, nLevel);

  // Compute zone
  const baseZone = computeBaseZone(clampedNLevel);
  const accuracyBonus = computeAccuracyBonus(clampedAccuracy);
  const zone = Math.max(MIN_ZONE, Math.min(MAX_ZONE, baseZone + accuracyBonus));

  // Compute progress
  const zoneProgress = computeZoneProgress(clampedAccuracy, zone);

  return {
    accuracy: clampedAccuracy,
    nLevel: clampedNLevel,
    zone,
    zoneProgress,
  };
}

// =============================================================================
// Mode-specific accuracy helpers
// =============================================================================

/**
 * Compute accuracy for Dual Tempo using Geometric Mean.
 * Formula: sqrt(HitRate × CorrectRejectionRate)
 *
 * Unlike Balanced Accuracy (arithmetic mean), geometric mean:
 * - Returns 0 if EITHER rate is 0 (punishes extreme behavior)
 * - Never clicking → 0% (not 50%)
 * - Always clicking → 0% (not 50%)
 * - Rewards genuinely balanced performance
 *
 * @deprecated Use computeSpecDrivenTempoAccuracy() with gameMode for spec-driven accuracy
 */
export function computeTempoAccuracy(
  hits: number,
  misses: number,
  falseAlarms: number,
  correctRejections: number,
): number {
  const signalTrials = hits + misses;
  const noiseTrials = falseAlarms + correctRejections;

  // Handle edge cases
  if (signalTrials === 0 && noiseTrials === 0) return 0;

  const hitRate = signalTrials > 0 ? hits / signalTrials : 0;
  const correctRejectionRate = noiseTrials > 0 ? correctRejections / noiseTrials : 0;

  // Geometric Mean - punishes extreme behavior (0 in either → 0 result)
  return Math.sqrt(hitRate * correctRejectionRate);
}

/**
 * Compute accuracy for Dual Memo (Recall).
 * Accuracy = correctPicks / totalPicks
 */
export function computeMemoAccuracy(correctPicks: number, totalPicks: number): number {
  if (totalPicks === 0) return 0;
  return correctPicks / totalPicks;
}

/**
 * Compute accuracy for Dual Place.
 * Accuracy = correctDrops / totalDrops
 */
export function computePlaceAccuracy(correctDrops: number, totalDrops: number): number {
  if (totalDrops === 0) return 0;
  return correctDrops / totalDrops;
}

// =============================================================================
// Utility
// =============================================================================

/**
 * Create empty unified metrics (for sessions with no data).
 * Uses defaults from thresholds.ts (SSOT).
 */
export function createEmptyUnifiedMetrics(): UnifiedMetrics {
  return {
    accuracy: 0,
    nLevel: DEFAULT_N_LEVEL,
    zone: DEFAULT_ZONE,
    zoneProgress: DEFAULT_ZONE_PROGRESS,
  };
}
