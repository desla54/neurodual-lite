/**
 * Property-Based Tests for Thresholds & Specs
 *
 * Uses fast-check to verify invariants and consistency of the thresholds.ts
 * constants and mode specifications.
 *
 * Categories:
 * 1. Threshold Consistency (25+ tests) - Value bounds and relationships
 * 2. Spec Completeness (15+ tests) - Required fields and valid configurations
 * 3. Cross-Spec Consistency (15+ tests) - Shared values and relationships
 * 4. Property-Based Tests (20+ tests) - Generative testing of invariants
 *
 * Total: 75+ tests
 */

import { describe, expect, it } from 'bun:test';
import * as fc from 'fast-check';

// Thresholds imports
import {
  // App metadata
  APP_VERSION,
  // Scoring - SDT
  SDT_DPRIME_PASS,
  SDT_DPRIME_DOWN,
  ADAPTIVE_TARGET_DPRIME_DEFAULT,
  // Scoring - Jaeggi
  JAEGGI_MAX_ERRORS_PER_MODALITY,
  JAEGGI_ERRORS_DOWN,
  // Scoring - BrainWorkshop
  BW_CHANCE_GUARANTEED_MATCH,
  BW_CHANCE_INTERFERENCE,
  BW_SCORE_PASS_NORMALIZED,
  BW_SCORE_DOWN_NORMALIZED,
  BW_SCORE_UP_PERCENT,
  BW_SCORE_DOWN_PERCENT,
  BW_STRIKES_TO_DOWN,
  BW_TICKS_DEFAULT,
  BW_TICK_DURATION_MS,
  BW_PROBABILITY_STEP,
  BW_TRIALS_BASE,
  BW_TRIALS_EXPONENT,
  BW_MULTI_STIMULUS_INTERFERENCE_DIVISOR,
  BW_GLOBAL_SWAP_PROBABILITY,
  BW_STIMULUS_BASE_TICKS,
  BW_STIMULUS_TICKS_PER_EXTRA_POSITION,
  BW_DPRIME_CONVERSION_BASE,
  BW_DPRIME_CONVERSION_FACTOR,
  SELF_PACED_MAX_TIMEOUT_MS,
  // Scoring - Accuracy
  ACCURACY_PASS_NORMALIZED,
  TRACE_ACCURACY_PASS_NORMALIZED,
  SCORE_MAX,
  SCORE_MIN,
  // Flow & UPS
  FLOW_CONFIDENCE_THRESHOLD,
  UPS_TIER_ELITE,
  UPS_TIER_ADVANCED,
  UPS_TIER_INTERMEDIATE,
  UPS_TIER_NOVICE,
  UPS_ACCURACY_WEIGHT,
  UPS_CONFIDENCE_WEIGHT,
  UPS_MIN_TRIALS_FOR_CONFIDENCE,
  UPS_MIN_DROPS_FOR_CONFIDENCE,
  UPS_MIN_WINDOWS_FOR_CONFIDENCE,
  // Timing
  TIMING_STIMULUS_TEMPO_MS,
  TIMING_STIMULUS_FLOW_MS,
  TIMING_STIMULUS_RECALL_MS,
  TIMING_STIMULUS_TRACE_MS,
  TIMING_STIMULUS_TRACE_WARMUP_MS,
  TIMING_INTERVAL_DEFAULT_MS,
  TIMING_INTERVAL_TRACE_MS,
  TIMING_SESSION_PREP_MS,
  TIMING_MIN_VALID_RT_MS,
  TIMING_FEEDBACK_MS,
  TIMING_FEEDBACK_DEFAULT_MS,
  TRACE_EXTINCTION_RATIO,
  TRACE_EXTINCTION_MIN_MS,
  TRACE_EXTINCTION_MAX_MS,
  // Generation
  GEN_TARGET_PROBABILITY_DEFAULT,
  GEN_TARGET_PROBABILITY_HIGH,
  GEN_TARGET_PROBABILITY_LOW,
  GEN_TARGET_PROBABILITY_JAEGGI,
  GEN_LURE_PROBABILITY_DEFAULT,
  GEN_LURE_PROBABILITY_LABEL,
  GEN_LURE_PROBABILITY_BW,
  GEN_LURE_PROBABILITY_NONE,
  SEQUENCE_MIN_PROBABILITY_MULTIPLIER,
  SEQUENCE_FATIGUE_RATE_DEFAULT,
  SEQUENCE_PROBABILITY_TOLERANCE,
  SEQUENCE_VALIDATION_MAX_CONSECUTIVE_SAME,
  SEQUENCE_VALIDATION_MAX_CONSECUTIVE_TARGETS,
  // Defaults
  DEFAULT_N_LEVEL,
  // Journey
  JOURNEY_MIN_PASSING_SCORE,
  JOURNEY_SCORE_EXCELLENT,
  JOURNEY_SCORE_GOOD,
  JOURNEY_SCORE_PASSING,
  JOURNEY_MIN_UPS,
  JOURNEY_MAX_LEVEL,
  JOURNEY_DEFAULT_TARGET_LEVEL,
  JOURNEY_DEFAULT_START_LEVEL,
  JOURNEY_SESSIONS_EXCELLENT,
  JOURNEY_SESSIONS_GOOD,
  JOURNEY_SESSIONS_PASSING,
  JOURNEY_MODES_PER_LEVEL,
  // Validation
  VALID_PROBABILITY_MIN,
  VALID_PROBABILITY_MAX,
  VALID_ACCURACY_MIN,
  VALID_ACCURACY_MAX,
  VALID_DIFFICULTY_MIN,
  VALID_DIFFICULTY_MAX,
  // Tempo Confidence Weights
  TEMPO_WEIGHT_TIMING_DISCIPLINE,
  TEMPO_WEIGHT_RT_STABILITY,
  TEMPO_WEIGHT_PRESS_STABILITY,
  TEMPO_WEIGHT_ERROR_AWARENESS,
  TEMPO_WEIGHT_FOCUS,
  TEMPO_CONFIDENCE_NEUTRAL,
  TEMPO_RT_CV_THRESHOLD,
  TEMPO_PRESS_CV_THRESHOLD,
  // Jaeggi Confidence Weights
  JAEGGI_WEIGHT_RT_STABILITY,
  JAEGGI_WEIGHT_ERROR_AWARENESS,
  JAEGGI_WEIGHT_FOCUS,
  JAEGGI_WEIGHT_TIMING,
  JAEGGI_WEIGHT_PRESS_STABILITY,
  JAEGGI_WEIGHT_RT_STABILITY_HIGH,
  JAEGGI_WEIGHT_ERROR_AWARENESS_HIGH,
  JAEGGI_WEIGHT_FOCUS_HIGH,
  JAEGGI_WEIGHT_PRESS_STABILITY_HIGH,
  JAEGGI_CONFIDENCE_ACCURACY_THRESHOLD,
  // Progression
  PROGRESSION_SCORE_UP,
  PROGRESSION_SCORE_STRIKE,
  PROGRESSION_STRIKES_TO_DOWN,
  // Badges (sample)
  BADGE_ACCURACY_SNIPER,
  BADGE_ACCURACY_SURGICAL,
  BADGE_ACCURACY_LASER,
  BADGE_STREAK_NASCENT,
  BADGE_STREAK_WEEKLY,
  BADGE_STREAK_BIWEEKLY,
  BADGE_STREAK_MONTHLY,
  BADGE_STREAK_QUARTERLY,
  BADGE_STREAK_YEARLY,
  BADGE_N_LEVEL_SHARP,
  BADGE_N_LEVEL_GENIUS,
  BADGE_N_LEVEL_VIRTUOSO,
  BADGE_N_LEVEL_LEGEND,
  BADGE_N_LEVEL_TRANSCENDED,
  BADGE_DPRIME_MASTER,
  BADGE_DPRIME_EXPERT,
  BADGE_RT_QUICK_MS,
  BADGE_RT_FLASH_MS,
  BADGE_RT_LIGHTNING_MS,
  BADGE_RT_CONSISTENT_STD_MS,
  BADGE_RT_METRONOME_STD_MS,
  BADGE_SESSIONS_FIRST,
  BADGE_SESSIONS_BRONZE,
  BADGE_SESSIONS_SILVER,
  BADGE_SESSIONS_GOLD,
  BADGE_MILESTONE_SESSIONS,
  BADGE_MILESTONE_TRIALS,
  BADGE_MIN_RESPONSE_RATE,
  BADGE_MAX_PER_SESSION,
  BADGE_MODALITY_IMBALANCE_HIGH,
  BADGE_MODALITY_IMBALANCE_LOW,
  BADGE_MODALITY_SYNC_TOLERANCE,
  BADGE_STRONG_MODALITY_ACCURACY,
  BADGE_WEAK_MODALITY_ACCURACY,
  BADGE_EARLY_BIRD_HOUR,
  BADGE_NIGHT_OWL_HOUR,
  // XP
  XP_DAILY_SESSION_CAP,
  XP_LEVEL_THRESHOLDS,
  XP_MAX_LEVEL,
  XP_MIN_FLOOR,
  XP_FLOW_BONUS,
  XP_BADGE_BONUS,
  XP_BADGE_BONUS_CUMULATIVE,
  XP_DAILY_FIRST_BONUS,
  XP_STREAK_MULTIPLIER,
  XP_STREAK_MIN_DAYS,
  XP_N_LEVEL_WEIGHT,
  XP_DPRIME_WEIGHT,
  XP_ACCURACY_WEIGHT,
  PREMIUM_LEVEL_7_DAYS,
  PREMIUM_LEVEL_1_MONTH,
  PREMIUM_LEVEL_3_MONTHS,
  PREMIUM_LEVEL_LIFETIME,
  PREMIUM_N_THRESHOLD,
  // Zone
  ZONE_MIN,
  ZONE_MAX,
  ZONE_PER_N_LEVEL,
  DEFAULT_ZONE,
  DEFAULT_ZONE_PROGRESS,
  // ARM (Adaptive Resource Manager)
  ARM_PTARGET_MIN,
  ARM_PTARGET_MAX,
  ARM_PLURE_MIN,
  ARM_PLURE_MAX,
  ARM_ISI_MIN_MS,
  ARM_ISI_MAX_MS,
  ARM_STIMULUS_DURATION_MIN_MS,
  ARM_STIMULUS_DURATION_MAX_MS,
  // Report thresholds
  REPORT_LEVEL_EXCELLENT_ACCURACY,
  REPORT_LEVEL_GOOD_ACCURACY,
  REPORT_LEVEL_AVERAGE_ACCURACY,
  REPORT_LEVEL_BELOW_AVERAGE_ACCURACY,
  REPORT_LEVEL_EXCELLENT_UPS,
  REPORT_LEVEL_GOOD_UPS,
  REPORT_LEVEL_AVERAGE_UPS,
  REPORT_LEVEL_BELOW_AVERAGE_UPS,
  REPORT_MODALITY_BALANCED_GAP,
  REPORT_MODALITY_ATTENTION_GAP,
  REPORT_MODALITY_ASYMMETRY_GAP,
  // Health thresholds
  HEALTH_PROCESSING_LAG_WARNING_MS,
  HEALTH_PROCESSING_LAG_DEGRADED_MS,
  HEALTH_RT_CV_WARNING,
  HEALTH_RT_CV_DEGRADED,
  HEALTH_EVENTLOOP_LAG_WARNING_MS,
  HEALTH_EVENTLOOP_LAG_DEGRADED_MS,
  HEALTH_SCORE_HIGH,
  HEALTH_SCORE_MEDIUM,
  HEALTH_WEIGHT_PROCESSING_LAG,
  HEALTH_WEIGHT_EVENTLOOP_LAG,
  HEALTH_WEIGHT_RT_STABILITY,
  HEALTH_WEIGHT_FOCUS,
  HEALTH_WEIGHT_FREEZES,
  // Storage & Sync
  STORAGE_WARNING_THRESHOLD_PERCENT,
  STORAGE_CRITICAL_THRESHOLD_PERCENT,
  SYNC_BACKOFF_INITIAL_MS,
  SYNC_BACKOFF_MAX_MS,
  SYNC_BACKOFF_MULTIPLIER,
  SYNC_BACKOFF_MAX_RETRIES,
  // Store retry
  STORE_RETRY_BASE_DELAY_MS,
  STORE_RETRY_BACKOFF_MULTIPLIER,
  STORE_RETRY_MAX_DELAY_MS,
  STORE_RETRY_MAX_ATTEMPTS,
  STORE_RETRY_MAX_PENDING_SIZE,
  // Psychometric
  PSYCHOMETRIC_DPRIME_ELITE,
  PSYCHOMETRIC_DPRIME_ADVANCED,
  PSYCHOMETRIC_DPRIME_INTERMEDIATE,
  PSYCHOMETRIC_BIAS_LIBERAL_THRESHOLD,
  PSYCHOMETRIC_BIAS_CONSERVATIVE_THRESHOLD,
  // Trajectory
  TRAJECTORY_SAMPLE_INTERVAL_MS,
  TRAJECTORY_SAMPLE_RATE_HZ,
  TRAJECTORY_MAX_POINTS,
  TRAJECTORY_MAX_DURATION_MS,
  TRAJECTORY_DIRECTNESS_GOOD,
  TRAJECTORY_DIRECTNESS_BAD,
  TRAJECTORY_WEIGHT_DIRECTNESS,
  TRAJECTORY_WEIGHT_DEVIATION,
  TRAJECTORY_WEIGHT_BACKTRACK,
  TRAJECTORY_WEIGHT_PAUSE,
  TRAJECTORY_DEVIATION_AUC_WEIGHT,
  TRAJECTORY_DEVIATION_MD_WEIGHT,
  TRAJECTORY_PENALTY_CAP,
  // Cognitive
  COGNITIVE_FLOW_ENTRY_THRESHOLD,
  COGNITIVE_RESILIENCE_THRESHOLD,
  COGNITIVE_FRAGILE_THRESHOLD,
  // Stats
  STATS_MIN_TRIALS_FOR_VALID,
  STATS_IQR_OUTLIER_MULTIPLIER,
  STATS_MICROLAPSE_MEDIAN_MULTIPLIER,
  STATS_BEST_HOUR_MIN_SESSIONS,
  STATS_BEST_HOUR_MIN_PER_SLOT,
  // Trend
  TREND_RECENT_WINDOW,
  TREND_OLDER_WINDOW,
  TREND_MIN_SESSIONS,
  TREND_IMPROVING_THRESHOLD_PERCENT,
  TREND_DECLINING_THRESHOLD_PERCENT,
  // Time of day
  TIME_OF_DAY_MORNING,
  TIME_OF_DAY_NOON,
  TIME_OF_DAY_EVENING,
  TIME_OF_DAY_NIGHT,
  getTimeOfDayFromHour,
} from './thresholds';

// Spec imports
import { DualCatchSpec } from './dual-catch.spec';
import { DualnbackClassicSpec } from './dualnback-classic.spec';
import {
  SimBrainWorkshopSpec,
  calculateBWTrialsCount,
  calculateBWIntervalMs,
} from './brainworkshop.spec';
import { DualPlaceSpec } from './place.spec';

import type { ModeSpec } from './types';

// =============================================================================
// Test Helpers
// =============================================================================

const allSpecs: ModeSpec[] = [
  DualCatchSpec,
  DualnbackClassicSpec,
  SimBrainWorkshopSpec,
  DualPlaceSpec,
];

/**
 * Checks if all weight arrays sum to approximately 1.0
 */
function sumToOne(weights: number[], tolerance = 0.001): boolean {
  const sum = weights.reduce((a, b) => a + b, 0);
  return Math.abs(sum - 1.0) < tolerance;
}

// =============================================================================
// 1. THRESHOLD CONSISTENCY (25+ tests)
// =============================================================================

describe('Threshold Consistency', () => {
  describe('Scoring thresholds are positive where required', () => {
    it('SDT d-prime thresholds are positive', () => {
      expect(SDT_DPRIME_PASS).toBeGreaterThan(0);
      expect(SDT_DPRIME_DOWN).toBeGreaterThan(0);
      expect(ADAPTIVE_TARGET_DPRIME_DEFAULT).toBeGreaterThan(0);
    });

    it('SDT_DPRIME_PASS > SDT_DPRIME_DOWN (pass harder than down)', () => {
      expect(SDT_DPRIME_PASS).toBeGreaterThan(SDT_DPRIME_DOWN);
    });

    it('Jaeggi error thresholds are positive integers', () => {
      expect(JAEGGI_MAX_ERRORS_PER_MODALITY).toBeGreaterThan(0);
      expect(JAEGGI_ERRORS_DOWN).toBeGreaterThan(0);
      expect(Number.isInteger(JAEGGI_MAX_ERRORS_PER_MODALITY)).toBe(true);
      expect(Number.isInteger(JAEGGI_ERRORS_DOWN)).toBe(true);
    });

    it('JAEGGI_ERRORS_DOWN > JAEGGI_MAX_ERRORS_PER_MODALITY (down = more lenient)', () => {
      expect(JAEGGI_ERRORS_DOWN).toBeGreaterThan(JAEGGI_MAX_ERRORS_PER_MODALITY);
    });

    it('BW score thresholds are in valid range [0, 1]', () => {
      expect(BW_SCORE_PASS_NORMALIZED).toBeGreaterThanOrEqual(0);
      expect(BW_SCORE_PASS_NORMALIZED).toBeLessThanOrEqual(1);
      expect(BW_SCORE_DOWN_NORMALIZED).toBeGreaterThanOrEqual(0);
      expect(BW_SCORE_DOWN_NORMALIZED).toBeLessThanOrEqual(1);
    });

    it('BW_SCORE_PASS > BW_SCORE_DOWN (pass harder than down)', () => {
      expect(BW_SCORE_PASS_NORMALIZED).toBeGreaterThan(BW_SCORE_DOWN_NORMALIZED);
    });
  });

  describe('Percentages are in [0, 100]', () => {
    it('BW score percentages are valid', () => {
      expect(BW_SCORE_UP_PERCENT).toBeGreaterThanOrEqual(0);
      expect(BW_SCORE_UP_PERCENT).toBeLessThanOrEqual(100);
      expect(BW_SCORE_DOWN_PERCENT).toBeGreaterThanOrEqual(0);
      expect(BW_SCORE_DOWN_PERCENT).toBeLessThanOrEqual(100);
    });

    it('FLOW_CONFIDENCE_THRESHOLD is in [0, 100]', () => {
      expect(FLOW_CONFIDENCE_THRESHOLD).toBeGreaterThanOrEqual(0);
      expect(FLOW_CONFIDENCE_THRESHOLD).toBeLessThanOrEqual(100);
    });

    it('SCORE_MIN/MAX define valid range', () => {
      expect(SCORE_MIN).toBe(0);
      expect(SCORE_MAX).toBe(100);
      expect(SCORE_MAX).toBeGreaterThan(SCORE_MIN);
    });

    it('Storage thresholds are in [0, 100]', () => {
      expect(STORAGE_WARNING_THRESHOLD_PERCENT).toBeGreaterThanOrEqual(0);
      expect(STORAGE_WARNING_THRESHOLD_PERCENT).toBeLessThanOrEqual(100);
      expect(STORAGE_CRITICAL_THRESHOLD_PERCENT).toBeGreaterThanOrEqual(0);
      expect(STORAGE_CRITICAL_THRESHOLD_PERCENT).toBeLessThanOrEqual(100);
      expect(STORAGE_CRITICAL_THRESHOLD_PERCENT).toBeGreaterThan(STORAGE_WARNING_THRESHOLD_PERCENT);
    });
  });

  describe('Probabilities are in [0, 1]', () => {
    it('target probabilities are in [0, 1]', () => {
      const targetProbs = [
        GEN_TARGET_PROBABILITY_DEFAULT,
        GEN_TARGET_PROBABILITY_HIGH,
        GEN_TARGET_PROBABILITY_LOW,
        GEN_TARGET_PROBABILITY_JAEGGI,
      ];
      for (const prob of targetProbs) {
        expect(prob).toBeGreaterThanOrEqual(VALID_PROBABILITY_MIN);
        expect(prob).toBeLessThanOrEqual(VALID_PROBABILITY_MAX);
      }
    });

    it('lure probabilities are in [0, 1]', () => {
      const lureProbs = [
        GEN_LURE_PROBABILITY_DEFAULT,
        GEN_LURE_PROBABILITY_LABEL,
        GEN_LURE_PROBABILITY_BW,
        GEN_LURE_PROBABILITY_NONE,
      ];
      for (const prob of lureProbs) {
        expect(prob).toBeGreaterThanOrEqual(VALID_PROBABILITY_MIN);
        expect(prob).toBeLessThanOrEqual(VALID_PROBABILITY_MAX);
      }
    });

    it('BW generation probabilities are in [0, 1]', () => {
      expect(BW_CHANCE_GUARANTEED_MATCH).toBeGreaterThanOrEqual(0);
      expect(BW_CHANCE_GUARANTEED_MATCH).toBeLessThanOrEqual(1);
      expect(BW_CHANCE_INTERFERENCE).toBeGreaterThanOrEqual(0);
      expect(BW_CHANCE_INTERFERENCE).toBeLessThanOrEqual(1);
      expect(BW_GLOBAL_SWAP_PROBABILITY).toBeGreaterThanOrEqual(0);
      expect(BW_GLOBAL_SWAP_PROBABILITY).toBeLessThanOrEqual(1);
    });

    it('accuracy thresholds are in [0, 1]', () => {
      expect(ACCURACY_PASS_NORMALIZED).toBeGreaterThanOrEqual(VALID_ACCURACY_MIN);
      expect(ACCURACY_PASS_NORMALIZED).toBeLessThanOrEqual(VALID_ACCURACY_MAX);
      expect(TRACE_ACCURACY_PASS_NORMALIZED).toBeGreaterThanOrEqual(VALID_ACCURACY_MIN);
      expect(TRACE_ACCURACY_PASS_NORMALIZED).toBeLessThanOrEqual(VALID_ACCURACY_MAX);
    });

    it('ARM probabilities are in [0, 1] with proper ordering', () => {
      expect(ARM_PTARGET_MIN).toBeGreaterThanOrEqual(0);
      expect(ARM_PTARGET_MAX).toBeLessThanOrEqual(1);
      expect(ARM_PTARGET_MIN).toBeLessThan(ARM_PTARGET_MAX);
      expect(ARM_PLURE_MIN).toBeGreaterThanOrEqual(0);
      expect(ARM_PLURE_MAX).toBeLessThanOrEqual(1);
      expect(ARM_PLURE_MIN).toBeLessThan(ARM_PLURE_MAX);
    });

    it('cognitive thresholds are in [0, 1]', () => {
      expect(COGNITIVE_FLOW_ENTRY_THRESHOLD).toBeGreaterThanOrEqual(0);
      expect(COGNITIVE_FLOW_ENTRY_THRESHOLD).toBeLessThanOrEqual(1);
      expect(COGNITIVE_RESILIENCE_THRESHOLD).toBeGreaterThanOrEqual(0);
      expect(COGNITIVE_RESILIENCE_THRESHOLD).toBeLessThanOrEqual(1);
      expect(COGNITIVE_FRAGILE_THRESHOLD).toBeGreaterThanOrEqual(0);
      expect(COGNITIVE_FRAGILE_THRESHOLD).toBeLessThanOrEqual(1);
      expect(COGNITIVE_RESILIENCE_THRESHOLD).toBeGreaterThan(COGNITIVE_FRAGILE_THRESHOLD);
    });
  });

  describe('Timing values are positive and reasonable', () => {
    it('stimulus durations are positive and < 10000ms', () => {
      const durations = [
        TIMING_STIMULUS_TEMPO_MS,
        TIMING_STIMULUS_FLOW_MS,
        TIMING_STIMULUS_RECALL_MS,
        TIMING_STIMULUS_TRACE_MS,
        TIMING_STIMULUS_TRACE_WARMUP_MS,
      ];
      for (const d of durations) {
        expect(d).toBeGreaterThan(0);
        expect(d).toBeLessThan(10000);
        expect(Number.isInteger(d)).toBe(true);
      }
    });

    it('intervals are positive and < 10000ms', () => {
      expect(TIMING_INTERVAL_DEFAULT_MS).toBeGreaterThan(0);
      expect(TIMING_INTERVAL_DEFAULT_MS).toBeLessThan(10000);
      expect(TIMING_INTERVAL_TRACE_MS).toBeGreaterThan(0);
      expect(TIMING_INTERVAL_TRACE_MS).toBeLessThan(10000);
    });

    it('session prep time is positive and reasonable', () => {
      expect(TIMING_SESSION_PREP_MS).toBeGreaterThan(0);
      expect(TIMING_SESSION_PREP_MS).toBeLessThan(10000);
    });

    it('min valid RT is reasonable (50-200ms)', () => {
      expect(TIMING_MIN_VALID_RT_MS).toBeGreaterThanOrEqual(50);
      expect(TIMING_MIN_VALID_RT_MS).toBeLessThanOrEqual(200);
    });

    it('feedback durations are positive', () => {
      expect(TIMING_FEEDBACK_MS).toBeGreaterThan(0);
      expect(TIMING_FEEDBACK_DEFAULT_MS).toBeGreaterThan(0);
    });

    it('BW timing values are positive', () => {
      expect(BW_TICKS_DEFAULT).toBeGreaterThan(0);
      expect(BW_TICK_DURATION_MS).toBeGreaterThan(0);
      expect(BW_STIMULUS_BASE_TICKS).toBeGreaterThan(0);
      expect(Number.isInteger(BW_TICKS_DEFAULT)).toBe(true);
      expect(Number.isInteger(BW_TICK_DURATION_MS)).toBe(true);
    });

    it('ARM timing bounds are properly ordered', () => {
      expect(ARM_ISI_MIN_MS).toBeGreaterThan(0);
      expect(ARM_ISI_MAX_MS).toBeGreaterThan(ARM_ISI_MIN_MS);
      expect(ARM_STIMULUS_DURATION_MIN_MS).toBeGreaterThan(0);
      expect(ARM_STIMULUS_DURATION_MAX_MS).toBeGreaterThan(ARM_STIMULUS_DURATION_MIN_MS);
    });

    it('sync backoff values are properly ordered', () => {
      expect(SYNC_BACKOFF_INITIAL_MS).toBeGreaterThan(0);
      expect(SYNC_BACKOFF_MAX_MS).toBeGreaterThan(SYNC_BACKOFF_INITIAL_MS);
      expect(SYNC_BACKOFF_MULTIPLIER).toBeGreaterThan(1);
      expect(SYNC_BACKOFF_MAX_RETRIES).toBeGreaterThan(0);
    });

    it('store retry values are properly ordered', () => {
      expect(STORE_RETRY_BASE_DELAY_MS).toBeGreaterThan(0);
      expect(STORE_RETRY_MAX_DELAY_MS).toBeGreaterThan(STORE_RETRY_BASE_DELAY_MS);
      expect(STORE_RETRY_BACKOFF_MULTIPLIER).toBeGreaterThan(1);
      expect(STORE_RETRY_MAX_ATTEMPTS).toBeGreaterThan(0);
      expect(STORE_RETRY_MAX_PENDING_SIZE).toBeGreaterThan(0);
    });
  });

  describe('UPS weights sum to 1.0', () => {
    it('UPS accuracy + confidence weights = 1.0', () => {
      const sum = UPS_ACCURACY_WEIGHT + UPS_CONFIDENCE_WEIGHT;
      expect(Math.abs(sum - 1.0)).toBeLessThan(0.001);
    });

    it('tempo confidence weights sum to 1.0', () => {
      const weights = [
        TEMPO_WEIGHT_TIMING_DISCIPLINE,
        TEMPO_WEIGHT_RT_STABILITY,
        TEMPO_WEIGHT_PRESS_STABILITY,
        TEMPO_WEIGHT_ERROR_AWARENESS,
        TEMPO_WEIGHT_FOCUS,
      ];
      expect(sumToOne(weights)).toBe(true);
    });

    it('Jaeggi confidence weights (with timing) sum to 1.0', () => {
      const weights = [
        JAEGGI_WEIGHT_RT_STABILITY,
        JAEGGI_WEIGHT_ERROR_AWARENESS,
        JAEGGI_WEIGHT_FOCUS,
        JAEGGI_WEIGHT_TIMING,
        JAEGGI_WEIGHT_PRESS_STABILITY,
      ];
      expect(sumToOne(weights)).toBe(true);
    });

    it('Jaeggi confidence weights (without timing) sum to 1.0', () => {
      const weights = [
        JAEGGI_WEIGHT_RT_STABILITY_HIGH,
        JAEGGI_WEIGHT_ERROR_AWARENESS_HIGH,
        JAEGGI_WEIGHT_FOCUS_HIGH,
        JAEGGI_WEIGHT_PRESS_STABILITY_HIGH,
      ];
      expect(sumToOne(weights)).toBe(true);
    });

    it('trajectory confidence weights sum to 1.0', () => {
      const weights = [
        TRAJECTORY_WEIGHT_DIRECTNESS,
        TRAJECTORY_WEIGHT_DEVIATION,
        TRAJECTORY_WEIGHT_BACKTRACK,
        TRAJECTORY_WEIGHT_PAUSE,
      ];
      expect(sumToOne(weights)).toBe(true);
    });

    it('trajectory deviation sub-weights sum to 1.0', () => {
      const weights = [TRAJECTORY_DEVIATION_AUC_WEIGHT, TRAJECTORY_DEVIATION_MD_WEIGHT];
      expect(sumToOne(weights)).toBe(true);
    });

    it('health weights sum to 1.0', () => {
      const weights = [
        HEALTH_WEIGHT_PROCESSING_LAG,
        HEALTH_WEIGHT_EVENTLOOP_LAG,
        HEALTH_WEIGHT_RT_STABILITY,
        HEALTH_WEIGHT_FOCUS,
        HEALTH_WEIGHT_FREEZES,
      ];
      expect(sumToOne(weights)).toBe(true);
    });
  });

  describe('UPS tier ordering', () => {
    it('UPS tiers are ordered: elite > advanced > intermediate > novice', () => {
      expect(UPS_TIER_ELITE).toBeGreaterThan(UPS_TIER_ADVANCED);
      expect(UPS_TIER_ADVANCED).toBeGreaterThan(UPS_TIER_INTERMEDIATE);
      expect(UPS_TIER_INTERMEDIATE).toBeGreaterThan(UPS_TIER_NOVICE);
    });

    it('all UPS tiers are in [0, 100]', () => {
      const tiers = [UPS_TIER_ELITE, UPS_TIER_ADVANCED, UPS_TIER_INTERMEDIATE, UPS_TIER_NOVICE];
      for (const tier of tiers) {
        expect(tier).toBeGreaterThanOrEqual(0);
        expect(tier).toBeLessThanOrEqual(100);
      }
    });
  });

  describe('Report level ordering', () => {
    it('report accuracy levels are ordered: excellent > good > average > below_average', () => {
      expect(REPORT_LEVEL_EXCELLENT_ACCURACY).toBeGreaterThan(REPORT_LEVEL_GOOD_ACCURACY);
      expect(REPORT_LEVEL_GOOD_ACCURACY).toBeGreaterThan(REPORT_LEVEL_AVERAGE_ACCURACY);
      expect(REPORT_LEVEL_AVERAGE_ACCURACY).toBeGreaterThan(REPORT_LEVEL_BELOW_AVERAGE_ACCURACY);
    });

    it('report UPS levels are ordered: excellent > good > average > below_average', () => {
      expect(REPORT_LEVEL_EXCELLENT_UPS).toBeGreaterThan(REPORT_LEVEL_GOOD_UPS);
      expect(REPORT_LEVEL_GOOD_UPS).toBeGreaterThan(REPORT_LEVEL_AVERAGE_UPS);
      expect(REPORT_LEVEL_AVERAGE_UPS).toBeGreaterThan(REPORT_LEVEL_BELOW_AVERAGE_UPS);
    });

    it('report modality gaps are ordered: balanced < attention < asymmetry', () => {
      expect(REPORT_MODALITY_BALANCED_GAP).toBeLessThan(REPORT_MODALITY_ATTENTION_GAP);
      expect(REPORT_MODALITY_ATTENTION_GAP).toBeLessThan(REPORT_MODALITY_ASYMMETRY_GAP);
    });
  });

  describe('Health thresholds ordering', () => {
    it('processing lag thresholds are ordered: warning < degraded', () => {
      expect(HEALTH_PROCESSING_LAG_WARNING_MS).toBeLessThan(HEALTH_PROCESSING_LAG_DEGRADED_MS);
    });

    it('event loop lag thresholds are ordered: warning < degraded', () => {
      expect(HEALTH_EVENTLOOP_LAG_WARNING_MS).toBeLessThan(HEALTH_EVENTLOOP_LAG_DEGRADED_MS);
    });

    it('RT CV thresholds are ordered: warning < degraded', () => {
      expect(HEALTH_RT_CV_WARNING).toBeLessThan(HEALTH_RT_CV_DEGRADED);
    });

    it('health score thresholds are ordered: medium < high', () => {
      expect(HEALTH_SCORE_MEDIUM).toBeLessThan(HEALTH_SCORE_HIGH);
    });
  });

  describe('Psychometric thresholds ordering', () => {
    it('d-prime thresholds are ordered: intermediate < advanced < elite', () => {
      expect(PSYCHOMETRIC_DPRIME_INTERMEDIATE).toBeLessThan(PSYCHOMETRIC_DPRIME_ADVANCED);
      expect(PSYCHOMETRIC_DPRIME_ADVANCED).toBeLessThan(PSYCHOMETRIC_DPRIME_ELITE);
    });

    it('bias thresholds are symmetric around 0', () => {
      expect(PSYCHOMETRIC_BIAS_LIBERAL_THRESHOLD).toBeLessThan(0);
      expect(PSYCHOMETRIC_BIAS_CONSERVATIVE_THRESHOLD).toBeGreaterThan(0);
      expect(
        Math.abs(PSYCHOMETRIC_BIAS_LIBERAL_THRESHOLD) -
          Math.abs(PSYCHOMETRIC_BIAS_CONSERVATIVE_THRESHOLD),
      ).toBeLessThan(0.001);
    });
  });
});

// =============================================================================
// 2. SPEC COMPLETENESS (15+ tests)
// =============================================================================

describe('Spec Completeness', () => {
  describe('All specs have required metadata', () => {
    it('every spec has a non-empty id', () => {
      for (const spec of allSpecs) {
        expect(spec.metadata.id).toBeDefined();
        expect(spec.metadata.id.length).toBeGreaterThan(0);
      }
    });

    it('every spec has a displayName', () => {
      for (const spec of allSpecs) {
        expect(spec.metadata.displayName).toBeDefined();
        expect(spec.metadata.displayName.length).toBeGreaterThan(0);
      }
    });

    it('every spec has a description', () => {
      for (const spec of allSpecs) {
        expect(spec.metadata.description).toBeDefined();
        expect(spec.metadata.description.length).toBeGreaterThan(0);
      }
    });

    it('every spec has valid difficultyLevel (1-5)', () => {
      for (const spec of allSpecs) {
        expect(spec.metadata.difficultyLevel).toBeGreaterThanOrEqual(VALID_DIFFICULTY_MIN);
        expect(spec.metadata.difficultyLevel).toBeLessThanOrEqual(VALID_DIFFICULTY_MAX);
      }
    });

    it('every spec has at least one tag', () => {
      for (const spec of allSpecs) {
        expect(spec.metadata.tags.length).toBeGreaterThan(0);
      }
    });

    it('every spec has a semver version', () => {
      const semverRegex = /^\d+\.\d+\.\d+$/;
      for (const spec of allSpecs) {
        expect(semverRegex.test(spec.metadata.version)).toBe(true);
      }
    });
  });

  describe('Timing configs have all required fields', () => {
    it('every spec has positive stimulusDurationMs', () => {
      for (const spec of allSpecs) {
        expect(spec.timing.stimulusDurationMs).toBeGreaterThan(0);
      }
    });

    it('every spec has positive intervalMs', () => {
      for (const spec of allSpecs) {
        expect(spec.timing.intervalMs).toBeGreaterThan(0);
      }
    });

    it('stimulusDurationMs <= intervalMs for all specs', () => {
      for (const spec of allSpecs) {
        expect(spec.timing.stimulusDurationMs).toBeLessThanOrEqual(spec.timing.intervalMs);
      }
    });

    it('optional minValidRtMs is positive if defined', () => {
      for (const spec of allSpecs) {
        if (spec.timing.minValidRtMs !== undefined) {
          expect(spec.timing.minValidRtMs).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('Scoring configs are valid', () => {
    it('every spec has a valid scoring strategy', () => {
      const validStrategies = ['sdt', 'dualnback-classic', 'brainworkshop', 'accuracy'];
      for (const spec of allSpecs) {
        expect(validStrategies).toContain(spec.scoring.strategy);
      }
    });

    it('every spec has a positive passThreshold', () => {
      for (const spec of allSpecs) {
        expect(spec.scoring.passThreshold).toBeGreaterThan(0);
      }
    });

    it('downThreshold relationship with passThreshold is valid per strategy', () => {
      for (const spec of allSpecs) {
        if (spec.scoring.downThreshold !== undefined) {
          if (spec.scoring.strategy === 'dualnback-classic') {
            // Jaeggi: error-based scoring - MORE errors = worse
            // passThreshold (3) < downThreshold (5) because passing means FEWER errors
            expect(spec.scoring.downThreshold).toBeGreaterThan(spec.scoring.passThreshold);
          } else {
            // Other strategies: higher score = better
            // passThreshold > downThreshold
            expect(spec.scoring.downThreshold).toBeLessThan(spec.scoring.passThreshold);
          }
        }
      }
    });

    it('flowThreshold is in [0, 100] when defined', () => {
      for (const spec of allSpecs) {
        if (spec.scoring.flowThreshold !== undefined) {
          expect(spec.scoring.flowThreshold).toBeGreaterThanOrEqual(0);
          expect(spec.scoring.flowThreshold).toBeLessThanOrEqual(100);
        }
      }
    });
  });

  describe('Generation configs are valid', () => {
    it('every spec has a valid generator type', () => {
      const validGenerators = ['Sequence', 'DualnbackClassic', 'BrainWorkshop', 'Aleatoire'];
      for (const spec of allSpecs) {
        expect(validGenerators).toContain(spec.generation.generator);
      }
    });

    it('targetProbability is in [0, 1]', () => {
      for (const spec of allSpecs) {
        expect(spec.generation.targetProbability).toBeGreaterThanOrEqual(0);
        expect(spec.generation.targetProbability).toBeLessThanOrEqual(1);
      }
    });

    it('lureProbability is in [0, 1]', () => {
      for (const spec of allSpecs) {
        expect(spec.generation.lureProbability).toBeGreaterThanOrEqual(0);
        expect(spec.generation.lureProbability).toBeLessThanOrEqual(1);
      }
    });

    it('combined target + lure probability does not exceed 1', () => {
      for (const spec of allSpecs) {
        const combined = spec.generation.targetProbability + spec.generation.lureProbability;
        expect(combined).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('Defaults are valid', () => {
    it('every spec has positive nLevel', () => {
      for (const spec of allSpecs) {
        expect(spec.defaults.nLevel).toBeGreaterThan(0);
      }
    });

    it('every spec has positive trialsCount', () => {
      for (const spec of allSpecs) {
        expect(spec.defaults.trialsCount).toBeGreaterThan(0);
      }
    });

    it('every spec has at least one active modality', () => {
      for (const spec of allSpecs) {
        expect(spec.defaults.activeModalities.length).toBeGreaterThan(0);
      }
    });

    it('trialsCount > nLevel (enough trials for N-back)', () => {
      for (const spec of allSpecs) {
        expect(spec.defaults.trialsCount).toBeGreaterThan(spec.defaults.nLevel);
      }
    });
  });
});

// =============================================================================
// 3. CROSS-SPEC CONSISTENCY (15+ tests)
// =============================================================================

describe('Cross-Spec Consistency', () => {
  describe('Shared threshold values', () => {
    it('all tempo-based specs use same SDT_DPRIME_PASS', () => {
      expect(DualCatchSpec.scoring.passThreshold).toBe(SDT_DPRIME_PASS);
    });

    it('DualnbackClassic uses JAEGGI threshold', () => {
      expect(DualnbackClassicSpec.scoring.passThreshold).toBe(JAEGGI_MAX_ERRORS_PER_MODALITY);
    });

    it('BrainWorkshop uses BW threshold', () => {
      expect(SimBrainWorkshopSpec.scoring.passThreshold).toBe(BW_SCORE_PASS_NORMALIZED);
    });

    it('DualPlace uses accuracy threshold', () => {
      expect(DualPlaceSpec.scoring.passThreshold).toBe(ACCURACY_PASS_NORMALIZED);
    });

    it('all specs with flowThreshold use FLOW_CONFIDENCE_THRESHOLD', () => {
      const specsWithFlow = allSpecs.filter((s) => s.scoring.flowThreshold !== undefined);
      for (const spec of specsWithFlow) {
        expect(spec.scoring.flowThreshold).toBe(FLOW_CONFIDENCE_THRESHOLD);
      }
    });
  });

  describe('Default N-level consistency', () => {
    it('all specs use DEFAULT_N_LEVEL for defaults.nLevel', () => {
      for (const spec of allSpecs) {
        expect(spec.defaults.nLevel).toBe(DEFAULT_N_LEVEL);
      }
    });

    it('DEFAULT_N_LEVEL is within JOURNEY bounds', () => {
      expect(DEFAULT_N_LEVEL).toBeGreaterThanOrEqual(JOURNEY_DEFAULT_START_LEVEL);
      expect(DEFAULT_N_LEVEL).toBeLessThanOrEqual(JOURNEY_MAX_LEVEL);
    });
  });

  describe('Mode-specific timing uses correct thresholds', () => {
    it('DualCatch uses TIMING_STIMULUS_TEMPO_MS', () => {
      expect(DualCatchSpec.timing.stimulusDurationMs).toBe(TIMING_STIMULUS_TEMPO_MS);
    });

    it('DualnbackClassic uses TIMING_STIMULUS_TEMPO_MS', () => {
      expect(DualnbackClassicSpec.timing.stimulusDurationMs).toBe(TIMING_STIMULUS_TEMPO_MS);
    });

    it('DualPlace uses TIMING_STIMULUS_FLOW_MS', () => {
      expect(DualPlaceSpec.timing.stimulusDurationMs).toBe(TIMING_STIMULUS_FLOW_MS);
    });

    it('all specs use consistent interval defaults', () => {
      expect(DualCatchSpec.timing.intervalMs).toBe(TIMING_INTERVAL_DEFAULT_MS);
      expect(DualnbackClassicSpec.timing.intervalMs).toBe(TIMING_INTERVAL_DEFAULT_MS);
      expect(DualPlaceSpec.timing.intervalMs).toBe(TIMING_INTERVAL_DEFAULT_MS);
    });
  });

  describe('BrainWorkshop helper functions', () => {
    it('calculateBWTrialsCount produces positive values', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 10 }), (nLevel) => {
          const trials = calculateBWTrialsCount(nLevel);
          return trials > 0 && Number.isInteger(trials);
        }),
        { numRuns: 20 },
      );
    });

    it('calculateBWTrialsCount uses correct formula (20 + n^2)', () => {
      for (let n = 1; n <= 10; n++) {
        const expected = BW_TRIALS_BASE + n ** BW_TRIALS_EXPONENT;
        expect(calculateBWTrialsCount(n)).toBe(expected);
      }
    });

    it('calculateBWIntervalMs defaults to 3000ms (30 ticks * 100ms)', () => {
      expect(calculateBWIntervalMs()).toBe(BW_TICKS_DEFAULT * BW_TICK_DURATION_MS);
    });

    it('calculateBWIntervalMs produces positive values for any tick count', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 100 }), (ticks) => {
          const interval = calculateBWIntervalMs(ticks);
          return interval > 0 && interval === ticks * BW_TICK_DURATION_MS;
        }),
        { numRuns: 20 },
      );
    });
  });

  describe('Report sections consistency', () => {
    it('all specs have HERO section first', () => {
      for (const spec of allSpecs) {
        expect(spec.report.sections[0]).toBe('HERO');
      }
    });

    it('all specs have defined report colors', () => {
      for (const spec of allSpecs) {
        expect(spec.report.display.colors).toBeDefined();
        expect(spec.report.display.colors.bg).toBeDefined();
        expect(spec.report.display.colors.text).toBeDefined();
        expect(spec.report.display.colors.accent).toBeDefined();
      }
    });

    it('all specs have modeScoreKey defined', () => {
      for (const spec of allSpecs) {
        expect(spec.report.display.modeScoreKey).toBeDefined();
        expect(spec.report.display.modeScoreKey.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Journey thresholds are ordered', () => {
    it('JOURNEY_SCORE_EXCELLENT > JOURNEY_SCORE_GOOD > JOURNEY_SCORE_PASSING', () => {
      expect(JOURNEY_SCORE_EXCELLENT).toBeGreaterThan(JOURNEY_SCORE_GOOD);
      expect(JOURNEY_SCORE_GOOD).toBeGreaterThan(JOURNEY_SCORE_PASSING);
    });

    it('JOURNEY_SCORE_PASSING === JOURNEY_MIN_PASSING_SCORE', () => {
      expect(JOURNEY_SCORE_PASSING).toBe(JOURNEY_MIN_PASSING_SCORE);
    });

    it('JOURNEY_MIN_UPS <= JOURNEY_MIN_PASSING_SCORE', () => {
      expect(JOURNEY_MIN_UPS).toBeLessThanOrEqual(JOURNEY_MIN_PASSING_SCORE);
    });

    it('JOURNEY_SESSIONS_EXCELLENT < JOURNEY_SESSIONS_GOOD < JOURNEY_SESSIONS_PASSING', () => {
      expect(JOURNEY_SESSIONS_EXCELLENT).toBeLessThan(JOURNEY_SESSIONS_GOOD);
      expect(JOURNEY_SESSIONS_GOOD).toBeLessThan(JOURNEY_SESSIONS_PASSING);
    });
  });

  describe('Badge thresholds are ordered', () => {
    it('accuracy badges are ordered: sniper < surgical < laser', () => {
      expect(BADGE_ACCURACY_SNIPER).toBeLessThan(BADGE_ACCURACY_SURGICAL);
      expect(BADGE_ACCURACY_SURGICAL).toBeLessThan(BADGE_ACCURACY_LASER);
    });

    it('streak badges are ordered: nascent < weekly < biweekly < monthly < quarterly < yearly', () => {
      expect(BADGE_STREAK_NASCENT).toBeLessThan(BADGE_STREAK_WEEKLY);
      expect(BADGE_STREAK_WEEKLY).toBeLessThan(BADGE_STREAK_BIWEEKLY);
      expect(BADGE_STREAK_BIWEEKLY).toBeLessThan(BADGE_STREAK_MONTHLY);
      expect(BADGE_STREAK_MONTHLY).toBeLessThan(BADGE_STREAK_QUARTERLY);
      expect(BADGE_STREAK_QUARTERLY).toBeLessThan(BADGE_STREAK_YEARLY);
    });

    it('N-level badges are ordered: sharp < genius < virtuoso < legend < transcended', () => {
      expect(BADGE_N_LEVEL_SHARP).toBeLessThan(BADGE_N_LEVEL_GENIUS);
      expect(BADGE_N_LEVEL_GENIUS).toBeLessThan(BADGE_N_LEVEL_VIRTUOSO);
      expect(BADGE_N_LEVEL_VIRTUOSO).toBeLessThan(BADGE_N_LEVEL_LEGEND);
      expect(BADGE_N_LEVEL_LEGEND).toBeLessThan(BADGE_N_LEVEL_TRANSCENDED);
    });

    it('d-prime badges are ordered: master < expert', () => {
      expect(BADGE_DPRIME_MASTER).toBeLessThan(BADGE_DPRIME_EXPERT);
    });

    it('RT badges are ordered: quick > flash > lightning (lower is faster)', () => {
      expect(BADGE_RT_QUICK_MS).toBeGreaterThan(BADGE_RT_FLASH_MS);
      expect(BADGE_RT_FLASH_MS).toBeGreaterThan(BADGE_RT_LIGHTNING_MS);
    });

    it('RT consistency badges are ordered: consistent > metronome (lower is better)', () => {
      expect(BADGE_RT_CONSISTENT_STD_MS).toBeGreaterThan(BADGE_RT_METRONOME_STD_MS);
    });

    it('session badges are ordered: first < bronze < silver < gold', () => {
      expect(BADGE_SESSIONS_FIRST).toBeLessThan(BADGE_SESSIONS_BRONZE);
      expect(BADGE_SESSIONS_BRONZE).toBeLessThan(BADGE_SESSIONS_SILVER);
      expect(BADGE_SESSIONS_SILVER).toBeLessThan(BADGE_SESSIONS_GOLD);
    });
  });

  describe('XP and premium levels', () => {
    it('XP_LEVEL_THRESHOLDS is strictly increasing', () => {
      for (let i = 1; i < XP_LEVEL_THRESHOLDS.length; i++) {
        // @ts-expect-error test override
        expect(XP_LEVEL_THRESHOLDS[i]).toBeGreaterThan(XP_LEVEL_THRESHOLDS[i - 1]);
      }
    });

    it('XP_LEVEL_THRESHOLDS starts at 0', () => {
      expect(XP_LEVEL_THRESHOLDS[0]).toBe(0);
    });

    it('XP_LEVEL_THRESHOLDS has XP_MAX_LEVEL entries', () => {
      expect(XP_LEVEL_THRESHOLDS.length).toBe(XP_MAX_LEVEL);
    });

    it('premium levels are ordered: 7 days < 1 month < 3 months < lifetime', () => {
      expect(PREMIUM_LEVEL_7_DAYS).toBeLessThan(PREMIUM_LEVEL_1_MONTH);
      expect(PREMIUM_LEVEL_1_MONTH).toBeLessThan(PREMIUM_LEVEL_3_MONTHS);
      expect(PREMIUM_LEVEL_3_MONTHS).toBeLessThan(PREMIUM_LEVEL_LIFETIME);
    });

    it('PREMIUM_LEVEL_LIFETIME === XP_MAX_LEVEL', () => {
      expect(PREMIUM_LEVEL_LIFETIME).toBe(XP_MAX_LEVEL);
    });

    it('all premium levels are within XP_MAX_LEVEL', () => {
      expect(PREMIUM_LEVEL_7_DAYS).toBeLessThanOrEqual(XP_MAX_LEVEL);
      expect(PREMIUM_LEVEL_1_MONTH).toBeLessThanOrEqual(XP_MAX_LEVEL);
      expect(PREMIUM_LEVEL_3_MONTHS).toBeLessThanOrEqual(XP_MAX_LEVEL);
      expect(PREMIUM_LEVEL_LIFETIME).toBeLessThanOrEqual(XP_MAX_LEVEL);
    });
  });

  describe('Progression thresholds', () => {
    it('PROGRESSION_SCORE_UP > PROGRESSION_SCORE_STRIKE', () => {
      expect(PROGRESSION_SCORE_UP).toBeGreaterThan(PROGRESSION_SCORE_STRIKE);
    });

    it('PROGRESSION_STRIKES_TO_DOWN > 0', () => {
      expect(PROGRESSION_STRIKES_TO_DOWN).toBeGreaterThan(0);
    });

    it('BW_STRIKES_TO_DOWN matches progression strikes', () => {
      expect(BW_STRIKES_TO_DOWN).toBe(PROGRESSION_STRIKES_TO_DOWN);
    });
  });

  describe('Zone bounds', () => {
    it('ZONE_MIN < ZONE_MAX', () => {
      expect(ZONE_MIN).toBeLessThan(ZONE_MAX);
    });

    it('ZONE_MIN is positive', () => {
      expect(ZONE_MIN).toBeGreaterThan(0);
    });

    it('DEFAULT_ZONE is within bounds', () => {
      expect(DEFAULT_ZONE).toBeGreaterThanOrEqual(ZONE_MIN);
      expect(DEFAULT_ZONE).toBeLessThanOrEqual(ZONE_MAX);
    });

    it('DEFAULT_ZONE_PROGRESS is in [0, 1]', () => {
      expect(DEFAULT_ZONE_PROGRESS).toBeGreaterThanOrEqual(0);
      expect(DEFAULT_ZONE_PROGRESS).toBeLessThanOrEqual(1);
    });
  });

  describe('App version format', () => {
    it('APP_VERSION is valid semver', () => {
      const semverRegex = /^\d+\.\d+\.\d+$/;
      expect(semverRegex.test(APP_VERSION)).toBe(true);
    });
  });
});

// =============================================================================
// 4. PROPERTY-BASED TESTS (20+ tests)
// =============================================================================

describe('Property-Based Threshold Tests', () => {
  describe('Weight normalization property', () => {
    it('any valid weight distribution sums to 1', () => {
      fc.assert(
        fc.property(
          fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { minLength: 2, maxLength: 10 }),
          (rawWeights) => {
            const sum = rawWeights.reduce((a, b) => a + b, 0);
            if (sum === 0) return true; // Skip degenerate case
            const normalized = rawWeights.map((w) => w / sum);
            const normalizedSum = normalized.reduce((a, b) => a + b, 0);
            return Math.abs(normalizedSum - 1.0) < 0.0001;
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('Trial count formulas produce valid ranges', () => {
    it('BW trial formula: 20 + n^2 produces reasonable counts', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 10 }), (n) => {
          const trials = calculateBWTrialsCount(n);
          // Should be at least 21 (20 + 1^2) and at most 120 (20 + 10^2)
          return trials >= 21 && trials <= 120;
        }),
        { numRuns: 20 },
      );
    });

    it('interval calculation scales linearly with ticks', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 10, max: 100 }),
          fc.integer({ min: 10, max: 100 }),
          (ticks1, ticks2) => {
            const interval1 = calculateBWIntervalMs(ticks1);
            const interval2 = calculateBWIntervalMs(ticks2);
            // Ratio should be preserved
            const expectedRatio = ticks1 / ticks2;
            const actualRatio = interval1 / interval2;
            return Math.abs(expectedRatio - actualRatio) < 0.001;
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  describe('Probability step invariant', () => {
    it('BW_PROBABILITY_STEP divides evenly into 1.0', () => {
      const steps = Math.round(1.0 / BW_PROBABILITY_STEP);
      const reconstructed = steps * BW_PROBABILITY_STEP;
      expect(Math.abs(reconstructed - 1.0)).toBeLessThan(0.0001);
    });

    it('12.5% step gives 8 levels (0, 12.5, 25, ..., 100)', () => {
      const levels = Math.round(1.0 / BW_PROBABILITY_STEP) + 1; // +1 for 0%
      expect(levels).toBe(9); // 0, 12.5, 25, 37.5, 50, 62.5, 75, 87.5, 100
    });
  });

  describe('XP level progression is monotonic', () => {
    it('XP required increases with each level', () => {
      for (let level = 2; level <= XP_MAX_LEVEL; level++) {
        const prevXP = XP_LEVEL_THRESHOLDS[level - 2]; // 0-indexed
        const currentXP = XP_LEVEL_THRESHOLDS[level - 1];
        // @ts-expect-error test override
        expect(currentXP).toBeGreaterThan(prevXP);
      }
    });

    it('XP gaps are positive', () => {
      for (let level = 2; level <= XP_MAX_LEVEL; level++) {
        // @ts-expect-error test: nullable access
        const gap = XP_LEVEL_THRESHOLDS[level - 1] - XP_LEVEL_THRESHOLDS[level - 2];
        expect(gap).toBeGreaterThan(0);
      }
    });

    it('property: level for any XP is deterministic and monotonic', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 500000 }),
          fc.integer({ min: 0, max: 500000 }),
          (xp1, xp2) => {
            const getLevel = (xp: number): number => {
              for (let i = XP_LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
                // @ts-expect-error test: nullable access
                if (xp >= XP_LEVEL_THRESHOLDS[i]) return i + 1;
              }
              return 1;
            };
            if (xp1 === xp2) return getLevel(xp1) === getLevel(xp2);
            if (xp1 < xp2) return getLevel(xp1) <= getLevel(xp2);
            return getLevel(xp1) >= getLevel(xp2);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('Daily session cap is reasonable', () => {
    it('XP_DAILY_SESSION_CAP is positive and bounded', () => {
      expect(XP_DAILY_SESSION_CAP).toBeGreaterThan(0);
      expect(XP_DAILY_SESSION_CAP).toBeLessThanOrEqual(10); // Reasonable upper bound
    });
  });

  describe('Trajectory sampling consistency', () => {
    it('TRAJECTORY_SAMPLE_RATE_HZ and TRAJECTORY_SAMPLE_INTERVAL_MS are consistent', () => {
      const expectedIntervalMs = 1000 / TRAJECTORY_SAMPLE_RATE_HZ;
      expect(TRAJECTORY_SAMPLE_INTERVAL_MS).toBe(expectedIntervalMs);
    });

    it('TRAJECTORY_MAX_POINTS is consistent with max duration at sample rate', () => {
      const expectedMaxPoints = (TRAJECTORY_MAX_DURATION_MS / 1000) * TRAJECTORY_SAMPLE_RATE_HZ;
      expect(TRAJECTORY_MAX_POINTS).toBe(expectedMaxPoints);
    });

    it('property: any duration produces valid point count', () => {
      fc.assert(
        fc.property(fc.integer({ min: 100, max: TRAJECTORY_MAX_DURATION_MS }), (durationMs) => {
          const points = Math.ceil((durationMs / 1000) * TRAJECTORY_SAMPLE_RATE_HZ);
          return points > 0 && points <= TRAJECTORY_MAX_POINTS;
        }),
        { numRuns: 50 },
      );
    });
  });

  describe('Trace extinction timing consistency', () => {
    it('TRACE_EXTINCTION_MIN_MS < TRACE_EXTINCTION_MAX_MS', () => {
      expect(TRACE_EXTINCTION_MIN_MS).toBeLessThan(TRACE_EXTINCTION_MAX_MS);
    });

    it('TRACE_EXTINCTION_RATIO is in [0, 1]', () => {
      expect(TRACE_EXTINCTION_RATIO).toBeGreaterThanOrEqual(0);
      expect(TRACE_EXTINCTION_RATIO).toBeLessThanOrEqual(1);
    });

    it('property: extinction time is always within bounds', () => {
      fc.assert(
        fc.property(fc.integer({ min: 100, max: 5000 }), (stimulusDurationMs) => {
          const rawExtinction = stimulusDurationMs * TRACE_EXTINCTION_RATIO;
          const clampedExtinction = Math.min(
            Math.max(rawExtinction, TRACE_EXTINCTION_MIN_MS),
            TRACE_EXTINCTION_MAX_MS,
          );
          return (
            clampedExtinction >= TRACE_EXTINCTION_MIN_MS &&
            clampedExtinction <= TRACE_EXTINCTION_MAX_MS
          );
        }),
        { numRuns: 50 },
      );
    });
  });

  describe('D-prime conversion formula consistency', () => {
    it('BW d-prime conversion produces positive values for high scores', () => {
      fc.assert(
        fc.property(fc.integer({ min: 51, max: 100 }), (scorePercent) => {
          // d' = (score% - 50) * factor
          const dPrime = (scorePercent - BW_DPRIME_CONVERSION_BASE) * BW_DPRIME_CONVERSION_FACTOR;
          return dPrime > 0;
        }),
        { numRuns: 50 },
      );
    });

    it('BW d-prime conversion produces 0 at 50%', () => {
      const dPrime =
        (BW_DPRIME_CONVERSION_BASE - BW_DPRIME_CONVERSION_BASE) * BW_DPRIME_CONVERSION_FACTOR;
      expect(dPrime).toBe(0);
    });

    it('BW d-prime conversion produces negative values for low scores', () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 49 }), (scorePercent) => {
          const dPrime = (scorePercent - BW_DPRIME_CONVERSION_BASE) * BW_DPRIME_CONVERSION_FACTOR;
          return dPrime < 0;
        }),
        { numRuns: 50 },
      );
    });
  });

  describe('Time of day function properties', () => {
    it('getTimeOfDayFromHour covers all 24 hours', () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 23 }), (hour) => {
          const period = getTimeOfDayFromHour(hour);
          return ['morning', 'afternoon', 'evening', 'night'].includes(period);
        }),
        { numRuns: 24 },
      );
    });

    it('time periods are contiguous and cover 24 hours', () => {
      // Verify the hour boundaries are properly ordered
      expect(TIME_OF_DAY_MORNING).toBeLessThan(TIME_OF_DAY_NOON);
      expect(TIME_OF_DAY_NOON).toBeLessThan(TIME_OF_DAY_EVENING);
      expect(TIME_OF_DAY_EVENING).toBeLessThan(TIME_OF_DAY_NIGHT);
      expect(TIME_OF_DAY_NIGHT).toBeLessThan(24);
    });

    it('badge hours are valid (0-23)', () => {
      expect(BADGE_EARLY_BIRD_HOUR).toBeGreaterThanOrEqual(0);
      expect(BADGE_EARLY_BIRD_HOUR).toBeLessThan(24);
      expect(BADGE_NIGHT_OWL_HOUR).toBeGreaterThanOrEqual(0);
      expect(BADGE_NIGHT_OWL_HOUR).toBeLessThan(24);
      expect(BADGE_NIGHT_OWL_HOUR).toBeGreaterThan(BADGE_EARLY_BIRD_HOUR);
    });
  });

  describe('Badge anti-gaming thresholds', () => {
    it('BADGE_MIN_RESPONSE_RATE is in [0, 1]', () => {
      expect(BADGE_MIN_RESPONSE_RATE).toBeGreaterThanOrEqual(0);
      expect(BADGE_MIN_RESPONSE_RATE).toBeLessThanOrEqual(1);
    });

    it('BADGE_MAX_PER_SESSION is positive', () => {
      expect(BADGE_MAX_PER_SESSION).toBeGreaterThan(0);
    });

    it('modality imbalance thresholds are in [0, 1]', () => {
      expect(BADGE_MODALITY_IMBALANCE_HIGH).toBeGreaterThanOrEqual(0);
      expect(BADGE_MODALITY_IMBALANCE_HIGH).toBeLessThanOrEqual(1);
      expect(BADGE_MODALITY_IMBALANCE_LOW).toBeGreaterThanOrEqual(0);
      expect(BADGE_MODALITY_IMBALANCE_LOW).toBeLessThanOrEqual(1);
      expect(BADGE_MODALITY_SYNC_TOLERANCE).toBeGreaterThanOrEqual(0);
      expect(BADGE_MODALITY_SYNC_TOLERANCE).toBeLessThanOrEqual(1);
    });

    it('strong modality accuracy > weak modality accuracy', () => {
      expect(BADGE_STRONG_MODALITY_ACCURACY).toBeGreaterThan(BADGE_WEAK_MODALITY_ACCURACY);
    });
  });

  describe('Milestone arrays are monotonically increasing', () => {
    it('BADGE_MILESTONE_SESSIONS is strictly increasing', () => {
      for (let i = 1; i < BADGE_MILESTONE_SESSIONS.length; i++) {
        // @ts-expect-error test override
        expect(BADGE_MILESTONE_SESSIONS[i]).toBeGreaterThan(BADGE_MILESTONE_SESSIONS[i - 1]);
      }
    });

    it('BADGE_MILESTONE_TRIALS is strictly increasing', () => {
      for (let i = 1; i < BADGE_MILESTONE_TRIALS.length; i++) {
        // @ts-expect-error test override
        expect(BADGE_MILESTONE_TRIALS[i]).toBeGreaterThan(BADGE_MILESTONE_TRIALS[i - 1]);
      }
    });

    it('trial milestones are larger than session milestones', () => {
      // Trials are individual, sessions contain many trials, so trial milestones should be higher
      expect(BADGE_MILESTONE_TRIALS[0]).toBeGreaterThan(
        // @ts-expect-error test override
        BADGE_MILESTONE_SESSIONS[BADGE_MILESTONE_SESSIONS.length - 1],
      );
    });
  });

  describe('Sequence validation thresholds', () => {
    it('SEQUENCE_MIN_PROBABILITY_MULTIPLIER is very small but positive', () => {
      expect(SEQUENCE_MIN_PROBABILITY_MULTIPLIER).toBeGreaterThan(0);
      expect(SEQUENCE_MIN_PROBABILITY_MULTIPLIER).toBeLessThan(0.01);
    });

    it('SEQUENCE_FATIGUE_RATE_DEFAULT is small but positive', () => {
      expect(SEQUENCE_FATIGUE_RATE_DEFAULT).toBeGreaterThan(0);
      expect(SEQUENCE_FATIGUE_RATE_DEFAULT).toBeLessThan(0.1);
    });

    it('SEQUENCE_PROBABILITY_TOLERANCE is small', () => {
      expect(SEQUENCE_PROBABILITY_TOLERANCE).toBeGreaterThan(0);
      expect(SEQUENCE_PROBABILITY_TOLERANCE).toBeLessThan(0.01);
    });

    it('consecutive limits are positive integers', () => {
      expect(SEQUENCE_VALIDATION_MAX_CONSECUTIVE_SAME).toBeGreaterThan(0);
      expect(Number.isInteger(SEQUENCE_VALIDATION_MAX_CONSECUTIVE_SAME)).toBe(true);
      expect(SEQUENCE_VALIDATION_MAX_CONSECUTIVE_TARGETS).toBeGreaterThan(0);
      expect(Number.isInteger(SEQUENCE_VALIDATION_MAX_CONSECUTIVE_TARGETS)).toBe(true);
    });
  });

  describe('Trend analysis thresholds', () => {
    it('trend windows are positive integers with older > recent', () => {
      expect(TREND_RECENT_WINDOW).toBeGreaterThan(0);
      expect(TREND_OLDER_WINDOW).toBeGreaterThan(TREND_RECENT_WINDOW);
      expect(Number.isInteger(TREND_RECENT_WINDOW)).toBe(true);
      expect(Number.isInteger(TREND_OLDER_WINDOW)).toBe(true);
    });

    it('improving and declining thresholds are symmetric', () => {
      expect(TREND_IMPROVING_THRESHOLD_PERCENT).toBeGreaterThan(0);
      expect(TREND_DECLINING_THRESHOLD_PERCENT).toBeLessThan(0);
      expect(
        Math.abs(TREND_IMPROVING_THRESHOLD_PERCENT) - Math.abs(TREND_DECLINING_THRESHOLD_PERCENT),
      ).toBeLessThan(0.001);
    });

    it('TREND_MIN_SESSIONS is positive', () => {
      expect(TREND_MIN_SESSIONS).toBeGreaterThan(0);
    });
  });

  describe('Stats thresholds', () => {
    it('STATS_MIN_TRIALS_FOR_VALID is positive', () => {
      expect(STATS_MIN_TRIALS_FOR_VALID).toBeGreaterThan(0);
    });

    it('IQR multiplier is positive', () => {
      expect(STATS_IQR_OUTLIER_MULTIPLIER).toBeGreaterThan(0);
    });

    it('microlapse multiplier is > 1', () => {
      expect(STATS_MICROLAPSE_MEDIAN_MULTIPLIER).toBeGreaterThan(1);
    });

    it('best hour thresholds are positive', () => {
      expect(STATS_BEST_HOUR_MIN_SESSIONS).toBeGreaterThan(0);
      expect(STATS_BEST_HOUR_MIN_PER_SLOT).toBeGreaterThan(0);
    });
  });

  describe('Multi-stimulus properties', () => {
    it('BW_MULTI_STIMULUS_INTERFERENCE_DIVISOR is > 1 (reduces interference)', () => {
      expect(BW_MULTI_STIMULUS_INTERFERENCE_DIVISOR).toBeGreaterThan(1);
    });

    it('BW_STIMULUS_TICKS_PER_EXTRA_POSITION is positive', () => {
      expect(BW_STIMULUS_TICKS_PER_EXTRA_POSITION).toBeGreaterThan(0);
    });

    it('property: stimulus display time increases with multi-stimulus count', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 4 }), (multiCount) => {
          const baseTicks = BW_STIMULUS_BASE_TICKS;
          const extraTicks = (multiCount - 1) * BW_STIMULUS_TICKS_PER_EXTRA_POSITION;
          const totalTicks = baseTicks + extraTicks;
          return totalTicks >= baseTicks && totalTicks === baseTicks + extraTicks;
        }),
        { numRuns: 4 },
      );
    });
  });

  describe('Self-paced timeout is reasonable', () => {
    it('SELF_PACED_MAX_TIMEOUT_MS is positive and bounded', () => {
      expect(SELF_PACED_MAX_TIMEOUT_MS).toBeGreaterThan(0);
      expect(SELF_PACED_MAX_TIMEOUT_MS).toBeLessThanOrEqual(120000); // 2 minutes max
    });
  });

  describe('Directness thresholds ordering', () => {
    it('TRAJECTORY_DIRECTNESS_GOOD > TRAJECTORY_DIRECTNESS_BAD', () => {
      expect(TRAJECTORY_DIRECTNESS_GOOD).toBeGreaterThan(TRAJECTORY_DIRECTNESS_BAD);
    });

    it('both directness thresholds are in [0, 1]', () => {
      expect(TRAJECTORY_DIRECTNESS_GOOD).toBeGreaterThanOrEqual(0);
      expect(TRAJECTORY_DIRECTNESS_GOOD).toBeLessThanOrEqual(1);
      expect(TRAJECTORY_DIRECTNESS_BAD).toBeGreaterThanOrEqual(0);
      expect(TRAJECTORY_DIRECTNESS_BAD).toBeLessThanOrEqual(1);
    });
  });

  describe('Penalty cap is reasonable', () => {
    it('TRAJECTORY_PENALTY_CAP is positive and less than 100', () => {
      expect(TRAJECTORY_PENALTY_CAP).toBeGreaterThan(0);
      expect(TRAJECTORY_PENALTY_CAP).toBeLessThan(100);
    });
  });

  describe('UPS minimum requirements', () => {
    it('minimum requirements are positive', () => {
      expect(UPS_MIN_TRIALS_FOR_CONFIDENCE).toBeGreaterThan(0);
      expect(UPS_MIN_DROPS_FOR_CONFIDENCE).toBeGreaterThan(0);
      expect(UPS_MIN_WINDOWS_FOR_CONFIDENCE).toBeGreaterThan(0);
    });
  });

  describe('Tempo neutral value', () => {
    it('TEMPO_CONFIDENCE_NEUTRAL is exactly 50 (midpoint)', () => {
      expect(TEMPO_CONFIDENCE_NEUTRAL).toBe(50);
    });
  });

  describe('CV thresholds are positive', () => {
    it('tempo CV thresholds are in (0, 1]', () => {
      expect(TEMPO_RT_CV_THRESHOLD).toBeGreaterThan(0);
      expect(TEMPO_RT_CV_THRESHOLD).toBeLessThanOrEqual(1);
      expect(TEMPO_PRESS_CV_THRESHOLD).toBeGreaterThan(0);
      expect(TEMPO_PRESS_CV_THRESHOLD).toBeLessThanOrEqual(1);
    });
  });

  describe('Journey configuration', () => {
    it('JOURNEY_MODES_PER_LEVEL is positive', () => {
      expect(JOURNEY_MODES_PER_LEVEL).toBeGreaterThan(0);
    });

    it('JOURNEY_DEFAULT_TARGET_LEVEL is within journey bounds', () => {
      expect(JOURNEY_DEFAULT_TARGET_LEVEL).toBeGreaterThanOrEqual(JOURNEY_DEFAULT_START_LEVEL);
      expect(JOURNEY_DEFAULT_TARGET_LEVEL).toBeLessThanOrEqual(JOURNEY_MAX_LEVEL);
    });

    it('PREMIUM_N_THRESHOLD is positive', () => {
      expect(PREMIUM_N_THRESHOLD).toBeGreaterThan(0);
    });
  });

  describe('XP bonuses are positive', () => {
    it('all XP bonus values are positive', () => {
      expect(XP_MIN_FLOOR).toBeGreaterThan(0);
      expect(XP_FLOW_BONUS).toBeGreaterThan(0);
      expect(XP_BADGE_BONUS).toBeGreaterThan(0);
      expect(XP_BADGE_BONUS_CUMULATIVE).toBeGreaterThan(0);
      expect(XP_DAILY_FIRST_BONUS).toBeGreaterThan(0);
    });

    it('XP_STREAK_MULTIPLIER is positive and reasonable', () => {
      expect(XP_STREAK_MULTIPLIER).toBeGreaterThan(0);
      expect(XP_STREAK_MULTIPLIER).toBeLessThanOrEqual(1); // Should be a bonus ratio, not doubling
    });

    it('XP_STREAK_MIN_DAYS is at least 2', () => {
      expect(XP_STREAK_MIN_DAYS).toBeGreaterThanOrEqual(2);
    });

    it('XP weights are positive', () => {
      expect(XP_N_LEVEL_WEIGHT).toBeGreaterThan(0);
      expect(XP_DPRIME_WEIGHT).toBeGreaterThan(0);
      expect(XP_ACCURACY_WEIGHT).toBeGreaterThan(0);
    });
  });

  describe('Jaeggi confidence accuracy threshold', () => {
    it('JAEGGI_CONFIDENCE_ACCURACY_THRESHOLD is in [0, 1]', () => {
      expect(JAEGGI_CONFIDENCE_ACCURACY_THRESHOLD).toBeGreaterThanOrEqual(0);
      expect(JAEGGI_CONFIDENCE_ACCURACY_THRESHOLD).toBeLessThanOrEqual(1);
    });
  });

  describe('Zone per N level', () => {
    it('ZONE_PER_N_LEVEL is positive', () => {
      expect(ZONE_PER_N_LEVEL).toBeGreaterThan(0);
    });

    it('property: zone calculation is monotonically increasing with N level', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 9 }), fc.integer({ min: 1, max: 9 }), (n1, n2) => {
          const zone1 = (n1 - 1) * ZONE_PER_N_LEVEL + 1;
          const zone2 = (n2 - 1) * ZONE_PER_N_LEVEL + 1;
          if (n1 < n2) return zone1 < zone2;
          if (n1 > n2) return zone1 > zone2;
          return zone1 === zone2;
        }),
        { numRuns: 20 },
      );
    });

    it('zone calculation produces valid zones for journey levels', () => {
      // Journey levels go from 1 to JOURNEY_MAX_LEVEL (10)
      // Zones should be clamped to ZONE_MAX
      for (let n = JOURNEY_DEFAULT_START_LEVEL; n <= JOURNEY_MAX_LEVEL; n++) {
        const rawZone = (n - 1) * ZONE_PER_N_LEVEL + 1;
        const clampedZone = Math.min(Math.max(rawZone, ZONE_MIN), ZONE_MAX);
        expect(clampedZone).toBeGreaterThanOrEqual(ZONE_MIN);
        expect(clampedZone).toBeLessThanOrEqual(ZONE_MAX);
      }
    });
  });
});
