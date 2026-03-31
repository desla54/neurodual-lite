/**
 * Unified Performance Score (UPS) Types
 *
 * Score unique 0-100 utilisable sur tous les modes "Dual" et le Journey.
 * Basé uniquement sur les events (Event Sourcing).
 *
 * Formule: UPS = round(100 * (A ** 0.6) * (C ** 0.4))
 * où A = AccuracyScore/100, C = ConfidenceScore/100
 */

import type { SDTCounts } from './core';
import {
  // UPS Formula
  UPS_ACCURACY_WEIGHT as _UPS_ACCURACY_WEIGHT,
  UPS_CONFIDENCE_WEIGHT as _UPS_CONFIDENCE_WEIGHT,
  UPS_MIN_TRIALS_FOR_CONFIDENCE as _UPS_MIN_TRIALS_FOR_CONFIDENCE,
  UPS_MIN_DROPS_FOR_CONFIDENCE as _UPS_MIN_DROPS_FOR_CONFIDENCE,
  UPS_MIN_WINDOWS_FOR_CONFIDENCE as _UPS_MIN_WINDOWS_FOR_CONFIDENCE,
  // UPS Tiers
  UPS_TIER_ELITE,
  UPS_TIER_ADVANCED,
  UPS_TIER_INTERMEDIATE,
  // Tempo Confidence Weights
  TEMPO_WEIGHT_TIMING_DISCIPLINE,
  TEMPO_WEIGHT_RT_STABILITY,
  TEMPO_WEIGHT_PRESS_STABILITY,
  TEMPO_WEIGHT_ERROR_AWARENESS,
  TEMPO_WEIGHT_FOCUS,
  TEMPO_CONFIDENCE_NEUTRAL as _TEMPO_CONFIDENCE_NEUTRAL,
  // Tempo Stability
  TEMPO_RT_CV_THRESHOLD,
  TEMPO_PRESS_CV_THRESHOLD,
  // Mouse Input Adjustments
  MOUSE_CURSOR_SPEED_PX_PER_MS,
  MOUSE_RESPONSE_THRESHOLD,
  // Tempo PES
  TEMPO_PES_MIN_PAIRS,
  TEMPO_PES_MIN_RATIO,
  TEMPO_PES_MAX_RATIO,
  TEMPO_PES_LOOKAHEAD_TRIALS,
  // Tempo Focus
  TEMPO_FOCUS_MIN_HITS,
  TEMPO_FOCUS_LAPSE_MULTIPLIER,
  // Jaeggi Confidence Weights
  JAEGGI_CONFIDENCE_ACCURACY_THRESHOLD,
  JAEGGI_WEIGHT_RT_STABILITY,
  JAEGGI_WEIGHT_ERROR_AWARENESS,
  JAEGGI_WEIGHT_FOCUS,
  JAEGGI_WEIGHT_TIMING,
  JAEGGI_WEIGHT_PRESS_STABILITY,
  JAEGGI_WEIGHT_RT_STABILITY_HIGH,
  JAEGGI_WEIGHT_ERROR_AWARENESS_HIGH,
  JAEGGI_WEIGHT_FOCUS_HIGH,
  JAEGGI_WEIGHT_PRESS_STABILITY_HIGH,
} from '../specs/thresholds';

// =============================================================================
// Re-export Constants (for backwards compatibility)
// =============================================================================

export const UPS_ACCURACY_WEIGHT = _UPS_ACCURACY_WEIGHT;
export const UPS_CONFIDENCE_WEIGHT = _UPS_CONFIDENCE_WEIGHT;
export const UPS_MIN_TRIALS_FOR_CONFIDENCE = _UPS_MIN_TRIALS_FOR_CONFIDENCE;
export const UPS_MIN_DROPS_FOR_CONFIDENCE = _UPS_MIN_DROPS_FOR_CONFIDENCE;
export const UPS_MIN_WINDOWS_FOR_CONFIDENCE = _UPS_MIN_WINDOWS_FOR_CONFIDENCE;
export const TEMPO_CONFIDENCE_NEUTRAL = _TEMPO_CONFIDENCE_NEUTRAL;

// =============================================================================
// Performance Tiers
// =============================================================================

/**
 * Performance tier based on UPS score.
 */
export type PerformanceTier = 'elite' | 'advanced' | 'intermediate' | 'novice';

/**
 * Tier thresholds (from thresholds.ts SSOT).
 */
export const UPS_TIER_THRESHOLDS = {
  elite: UPS_TIER_ELITE,
  advanced: UPS_TIER_ADVANCED,
  intermediate: UPS_TIER_INTERMEDIATE,
} as const;

/**
 * Derive tier from UPS score.
 */
export function deriveTier(score: number): PerformanceTier {
  if (score >= UPS_TIER_THRESHOLDS.elite) return 'elite';
  if (score >= UPS_TIER_THRESHOLDS.advanced) return 'advanced';
  if (score >= UPS_TIER_THRESHOLDS.intermediate) return 'intermediate';
  return 'novice';
}

// =============================================================================
// UPS Components
// =============================================================================

/**
 * Components of the UPS calculation.
 */
export interface UPSComponents {
  /** Accuracy score 0-100 */
  readonly accuracy: number;
  /** Confidence score 0-100 or null if insufficient data */
  readonly confidence: number | null;
}

/**
 * Unified Performance Score result.
 */
export interface UnifiedPerformanceScore {
  /** Score global 0-100 */
  readonly score: number;
  /** Composantes du score */
  readonly components: UPSComponents;
  /** Éligible pour la validation Journey */
  readonly journeyEligible: boolean;
  /** Niveau de performance */
  readonly tier: PerformanceTier;
}

// =============================================================================
// Tempo Confidence Types
// =============================================================================

/**
 * Sub-scores for TempoConfidence calculation.
 */
export interface TempoConfidenceComponents {
  /** Timing discipline: penalizes early responses during stimulus (0-100) */
  readonly timingDiscipline: number;
  /** RT stability: based on CV of reaction times (0-100) */
  readonly rtStability: number;
  /** Press stability: based on CV of press durations (0-100) */
  readonly pressStability: number;
  /** Error awareness: Post-Error Slowing ratio (0-100) */
  readonly errorAwareness: number;
  /** Focus score: based on micro-lapse detection (0-100) */
  readonly focusScore: number;
}

/**
 * Tempo confidence calculation result.
 */
export interface TempoConfidenceResult {
  /** Overall confidence score 0-100 */
  readonly score: number;
  /** Individual components */
  readonly components: TempoConfidenceComponents;
  /** Whether sufficient data was available */
  readonly hasEnoughData: boolean;
}

// =============================================================================
// Tempo Confidence Constants
// =============================================================================

/**
 * Weights for TempoConfidence aggregation (from thresholds.ts SSOT).
 * Sum = 1.0
 */
export const TEMPO_CONFIDENCE_WEIGHTS = {
  timingDiscipline: TEMPO_WEIGHT_TIMING_DISCIPLINE,
  rtStability: TEMPO_WEIGHT_RT_STABILITY,
  pressStability: TEMPO_WEIGHT_PRESS_STABILITY,
  errorAwareness: TEMPO_WEIGHT_ERROR_AWARENESS,
  focusScore: TEMPO_WEIGHT_FOCUS,
} as const;

/**
 * CV thresholds for stability calculations (from thresholds.ts SSOT).
 */
export const TEMPO_STABILITY_THRESHOLDS = {
  /** CV threshold for RT stability (60% variation) */
  rtCv: TEMPO_RT_CV_THRESHOLD,
  /** CV threshold for press duration stability (80% variation) */
  pressCv: TEMPO_PRESS_CV_THRESHOLD,
} as const;

/**
 * Error awareness (PES) thresholds (from thresholds.ts SSOT).
 */
export const TEMPO_PES_THRESHOLDS = {
  /** Minimum post-error pairs to calculate PES */
  minPairs: TEMPO_PES_MIN_PAIRS,
  /** PES ratio range for scoring */
  minRatio: TEMPO_PES_MIN_RATIO,
  maxRatio: TEMPO_PES_MAX_RATIO,
  /** Lookahead window (in trials) for post-error hit */
  lookaheadTrials: TEMPO_PES_LOOKAHEAD_TRIALS,
} as const;

/**
 * Focus score (micro-lapse) thresholds (from thresholds.ts SSOT).
 */
export const TEMPO_FOCUS_THRESHOLDS = {
  /** Minimum hits to calculate focus score */
  minHits: TEMPO_FOCUS_MIN_HITS,
  /** RT multiplier to detect lapses (2.5x median RT) */
  lapseMultiplier: TEMPO_FOCUS_LAPSE_MULTIPLIER,
} as const;

/**
 * Mouse input adjustment thresholds (from thresholds.ts SSOT).
 */
export const MOUSE_INPUT_THRESHOLDS = {
  /** Estimated cursor speed in pixels per millisecond */
  cursorSpeedPxPerMs: MOUSE_CURSOR_SPEED_PX_PER_MS,
  /** Minimum proportion of mouse responses to trigger mouse-aware calculations */
  responseThreshold: MOUSE_RESPONSE_THRESHOLD,
} as const;

// =============================================================================
// Jaeggi Confidence Types
// =============================================================================

/**
 * Sub-scores for JaeggiConfidence calculation.
 * Note: timingDiscipline is optional (only present when accuracy < 90%)
 */
export interface JaeggiConfidenceComponents {
  /** RT stability: based on CV of reaction times (0-100) */
  readonly rtStability: number;
  /** Error awareness: Post-Error Slowing ratio (0-100) */
  readonly errorAwareness: number;
  /** Focus score: based on micro-lapse detection (0-100) */
  readonly focusScore: number;
  /** Press stability: based on CV of press durations (0-100) */
  readonly pressStability: number;
  /** Timing discipline: penalizes early responses during stimulus (0-100), only when accuracy < 90% */
  readonly timingDiscipline: number | null;
}

/**
 * Jaeggi confidence calculation result.
 */
export interface JaeggiConfidenceResult {
  /** Overall confidence score 0-100 */
  readonly score: number;
  /** Individual components */
  readonly components: JaeggiConfidenceComponents;
  /** Whether sufficient data was available */
  readonly hasEnoughData: boolean;
  /** Whether timing penalty was applied (accuracy < 90%) */
  readonly timingPenaltyApplied: boolean;
  /** Session accuracy used to determine timing penalty */
  readonly sessionAccuracy: number;
}

// =============================================================================
// Jaeggi Confidence Constants
// =============================================================================

/** Accuracy threshold above which timing penalty is waived */
export const JAEGGI_ACCURACY_THRESHOLD = JAEGGI_CONFIDENCE_ACCURACY_THRESHOLD;

/**
 * Weights for JaeggiConfidence WITH timing penalty (accuracy < 90%).
 * Sum = 1.0
 */
export const JAEGGI_WEIGHTS_WITH_TIMING = {
  rtStability: JAEGGI_WEIGHT_RT_STABILITY,
  errorAwareness: JAEGGI_WEIGHT_ERROR_AWARENESS,
  focusScore: JAEGGI_WEIGHT_FOCUS,
  timingDiscipline: JAEGGI_WEIGHT_TIMING,
  pressStability: JAEGGI_WEIGHT_PRESS_STABILITY,
} as const;

/**
 * Weights for JaeggiConfidence WITHOUT timing penalty (accuracy >= 90%).
 * Sum = 1.0
 */
export const JAEGGI_WEIGHTS_WITHOUT_TIMING = {
  rtStability: JAEGGI_WEIGHT_RT_STABILITY_HIGH,
  errorAwareness: JAEGGI_WEIGHT_ERROR_AWARENESS_HIGH,
  focusScore: JAEGGI_WEIGHT_FOCUS_HIGH,
  pressStability: JAEGGI_WEIGHT_PRESS_STABILITY_HIGH,
} as const;

// =============================================================================
// Input Types for Calculators
// =============================================================================

/**
 * Response data for TempoConfidence calculation.
 */
export interface TempoResponseData {
  readonly trialIndex: number;
  readonly reactionTimeMs: number;
  readonly pressDurationMs: number | null;
  readonly responsePhase: 'during_stimulus' | 'after_stimulus';
  readonly result: 'hit' | 'miss' | 'falseAlarm' | 'correctRejection';
  readonly modality: string;

  // Mouse-specific fields for accurate RT analysis
  /** Input method used for this response */
  readonly inputMethod?: 'keyboard' | 'mouse' | 'touch' | 'gamepad' | 'bot';
  /**
   * Cursor travel distance in pixels (mouse only).
   * Calculated as Euclidean distance from cursor position at stimulus time
   * to button center at click time.
   */
  readonly cursorTravelDistance?: number;
  /**
   * Response index within the trial (0 = first response, 1 = second response).
   * Used to detect dual-match trials where user must click twice.
   * Second response should have lower RT (cursor already near buttons).
   */
  readonly responseIndexInTrial?: 0 | 1;
}

/**
 * Accuracy data for UPS calculation (Tempo mode).
 * @deprecated Use SDTCounts from types/core.ts instead.
 */
export type TempoAccuracyData = SDTCounts;

/**
 * Accuracy data for UPS calculation (Place mode).
 */
export interface PlaceAccuracyData {
  readonly correctDrops: number;
  readonly totalDrops: number;
  readonly confidenceScore: number | null;
}

/**
 * Accuracy data for UPS calculation (Memo mode).
 */
export interface MemoAccuracyData {
  readonly correctPicks: number;
  readonly totalPicks: number;
  readonly avgConfidenceScore: number | null;
  readonly windowsCompleted: number;
}

/**
 * Accuracy data for UPS calculation (Dual Pick mode).
 */
export interface DualPickAccuracyData {
  readonly correctDrops: number;
  readonly totalDrops: number;
  readonly confidenceScore: number | null;
}
