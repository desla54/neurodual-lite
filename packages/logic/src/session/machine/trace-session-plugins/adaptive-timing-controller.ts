/**
 * AdaptiveTimingController
 *
 * Controls adaptive timing to maintain target accuracy (~75%).
 * Adjusts stimulus duration, extinction ratio, and response window
 * based on recent performance using EMA smoothing.
 *
 * PRINCIPLES:
 * - Data out: returns values, machine applies to TimingSource
 * - Pure calculation: deterministic given same input
 * - Spec-driven: all thresholds from thresholds.ts SSOT
 *
 * ALGORITHM:
 * 1. Track accuracy over sliding window of recent trials
 * 2. Smooth with EMA to avoid oscillation
 * 3. Calculate error = estimatedAccuracy - targetAccuracy
 * 4. Adjust parameters proportionally:
 *    - Positive error (too easy) → decrease timings (harder)
 *    - Negative error (too hard) → increase timings (easier)
 * 5. Clamp all values to bounds
 */

import type { AdaptiveTimingController, AdaptiveTimingState, TraceTrialOutcome } from './types';
import {
  TRACE_ADAPTIVE_TARGET_ACCURACY,
  TRACE_ADAPTIVE_WINDOW_SIZE,
  TRACE_ADAPTIVE_SMOOTHING_FACTOR,
  TRACE_ADAPTIVE_MIN_TRIALS,
  TRACE_ADAPTIVE_STIMULUS_MIN_MS,
  TRACE_ADAPTIVE_STIMULUS_MAX_MS,
  TRACE_ADAPTIVE_EXTINCTION_MIN,
  TRACE_ADAPTIVE_EXTINCTION_MAX,
  TRACE_ADAPTIVE_RESPONSE_WINDOW_MIN_MS,
  TRACE_ADAPTIVE_RESPONSE_WINDOW_MAX_MS,
  TRACE_ADAPTIVE_GAIN_STIMULUS_MS,
  TRACE_ADAPTIVE_GAIN_EXTINCTION,
  TRACE_ADAPTIVE_GAIN_RESPONSE_WINDOW_MS,
  TRACE_EXTINCTION_RATIO,
  TIMING_STIMULUS_TRACE_MS,
  TIMING_RESPONSE_WINDOW_TRACE_MS,
} from '../../../specs/thresholds';

// =============================================================================
// Factory
// =============================================================================

export interface AdaptiveTimingControllerConfig {
  /** Whether adaptive timing is enabled */
  readonly enabled: boolean;
  /** Whether the session is in timed mode (affects responseWindow adjustment) */
  readonly isTimed: boolean;
  /** Initial stimulus duration (from spec) */
  readonly initialStimulusDurationMs?: number;
  /** Initial extinction ratio (from spec) */
  readonly initialExtinctionRatio?: number;
  /** Initial response window (from spec) */
  readonly initialResponseWindowMs?: number;
}

/**
 * Creates an AdaptiveTimingController.
 *
 * The controller tracks trial outcomes and calculates adaptive timing values.
 * It does NOT mutate TimingSource directly - the machine reads values and
 * applies them via UPDATE_TIMINGS event.
 */
export function createAdaptiveTimingController(
  config: AdaptiveTimingControllerConfig,
): AdaptiveTimingController {
  const {
    enabled,
    isTimed,
    initialStimulusDurationMs = TIMING_STIMULUS_TRACE_MS,
    initialExtinctionRatio = TRACE_EXTINCTION_RATIO,
    initialResponseWindowMs = TIMING_RESPONSE_WINDOW_TRACE_MS,
  } = config;

  // Mutable state
  let recentTrials: TraceTrialOutcome[] = [];
  let trialCount = 0;
  let estimatedAccuracy = TRACE_ADAPTIVE_TARGET_ACCURACY; // Start at target

  // Current adaptive values
  let currentStimulusDurationMs = initialStimulusDurationMs;
  let currentExtinctionRatio = initialExtinctionRatio;
  let currentResponseWindowMs = initialResponseWindowMs;

  // ---------------------------------------------------------------------------
  // Helper functions
  // ---------------------------------------------------------------------------

  /**
   * Calculate raw accuracy from sliding window.
   */
  function calculateWindowAccuracy(): number {
    if (recentTrials.length === 0) return TRACE_ADAPTIVE_TARGET_ACCURACY;

    const correct = recentTrials.filter((t) => t.isCorrect).length;
    return correct / recentTrials.length;
  }

  /**
   * Update EMA-smoothed accuracy estimate.
   */
  function updateEstimatedAccuracy(): void {
    const windowAccuracy = calculateWindowAccuracy();
    // EMA: new = alpha * current + (1 - alpha) * previous
    estimatedAccuracy =
      TRACE_ADAPTIVE_SMOOTHING_FACTOR * windowAccuracy +
      (1 - TRACE_ADAPTIVE_SMOOTHING_FACTOR) * estimatedAccuracy;
  }

  /**
   * Clamp a value between min and max.
   */
  function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  /**
   * Adjust timing parameters based on accuracy error.
   * Called after each trial.
   */
  function adjustTimings(): void {
    // Don't adjust until we have enough data
    if (trialCount < TRACE_ADAPTIVE_MIN_TRIALS) return;

    // Error: positive = too easy, negative = too hard
    const error = estimatedAccuracy - TRACE_ADAPTIVE_TARGET_ACCURACY;

    // Scale error to percentage (e.g., 0.05 error = 5% → scale factor 0.5)
    // Gain is defined "per 10% error", so multiply error by 10
    const scaledError = error * 10;

    // Adjust stimulus duration: harder when easy → decrease
    // Positive error → decrease duration (subtract)
    const stimulusAdjustment = -scaledError * TRACE_ADAPTIVE_GAIN_STIMULUS_MS;
    currentStimulusDurationMs = clamp(
      currentStimulusDurationMs + stimulusAdjustment,
      TRACE_ADAPTIVE_STIMULUS_MIN_MS,
      TRACE_ADAPTIVE_STIMULUS_MAX_MS,
    );

    // Adjust extinction ratio: harder when easy → decrease (less time visible)
    // Positive error → decrease ratio (subtract)
    const extinctionAdjustment = -scaledError * TRACE_ADAPTIVE_GAIN_EXTINCTION;
    currentExtinctionRatio = clamp(
      currentExtinctionRatio + extinctionAdjustment,
      TRACE_ADAPTIVE_EXTINCTION_MIN,
      TRACE_ADAPTIVE_EXTINCTION_MAX,
    );

    // Adjust response window only in timed mode
    if (isTimed) {
      // Positive error → decrease window (more time pressure)
      const responseAdjustment = -scaledError * TRACE_ADAPTIVE_GAIN_RESPONSE_WINDOW_MS;
      currentResponseWindowMs = clamp(
        currentResponseWindowMs + responseAdjustment,
        TRACE_ADAPTIVE_RESPONSE_WINDOW_MIN_MS,
        TRACE_ADAPTIVE_RESPONSE_WINDOW_MAX_MS,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Public interface
  // ---------------------------------------------------------------------------

  function isEnabled(): boolean {
    return enabled;
  }

  function onTrialCompleted(outcome: TraceTrialOutcome): void {
    // Ignore warmup trials
    if (outcome.isWarmup) return;

    // Add to sliding window
    recentTrials.push(outcome);
    trialCount++;

    // Keep window size limited
    if (recentTrials.length > TRACE_ADAPTIVE_WINDOW_SIZE) {
      recentTrials = recentTrials.slice(-TRACE_ADAPTIVE_WINDOW_SIZE);
    }

    // Update accuracy estimate and adjust timings
    updateEstimatedAccuracy();
    adjustTimings();
  }

  function getEstimatedAccuracy(): number {
    return estimatedAccuracy;
  }

  function getCurrentExtinctionRatio(): number {
    return currentExtinctionRatio;
  }

  function getCurrentStimulusDurationMs(): number {
    return currentStimulusDurationMs;
  }

  function getCurrentResponseWindowMs(): number {
    return currentResponseWindowMs;
  }

  function getTrialCount(): number {
    return trialCount;
  }

  function serialize(): AdaptiveTimingState {
    return {
      estimatedAccuracy,
      recentTrials: [...recentTrials],
      trialCount,
      currentValues: {
        stimulusDurationMs: currentStimulusDurationMs,
        extinctionRatio: currentExtinctionRatio,
        responseWindowMs: currentResponseWindowMs,
      },
    };
  }

  function restore(state: AdaptiveTimingState): void {
    estimatedAccuracy = state.estimatedAccuracy;
    recentTrials = [...state.recentTrials];
    trialCount = state.trialCount;
    currentStimulusDurationMs = state.currentValues.stimulusDurationMs;
    currentExtinctionRatio = state.currentValues.extinctionRatio;
    currentResponseWindowMs = state.currentValues.responseWindowMs;
  }

  return {
    isEnabled,
    onTrialCompleted,
    getEstimatedAccuracy,
    getCurrentExtinctionRatio,
    getCurrentStimulusDurationMs,
    getCurrentResponseWindowMs,
    getTrialCount,
    serialize,
    restore,
  };
}

/**
 * Creates a no-op AdaptiveTimingController for when adaptation is disabled.
 * Returns fixed values from config.
 */
export function createNoopAdaptiveTimingController(config: {
  readonly stimulusDurationMs: number;
  readonly extinctionRatio: number;
  readonly responseWindowMs: number;
}): AdaptiveTimingController {
  return {
    isEnabled: () => false,
    onTrialCompleted: () => {},
    getEstimatedAccuracy: () => TRACE_ADAPTIVE_TARGET_ACCURACY,
    getCurrentExtinctionRatio: () => config.extinctionRatio,
    getCurrentStimulusDurationMs: () => config.stimulusDurationMs,
    getCurrentResponseWindowMs: () => config.responseWindowMs,
    getTrialCount: () => 0,
    serialize: () => ({
      estimatedAccuracy: TRACE_ADAPTIVE_TARGET_ACCURACY,
      recentTrials: [],
      trialCount: 0,
      currentValues: {
        stimulusDurationMs: config.stimulusDurationMs,
        extinctionRatio: config.extinctionRatio,
        responseWindowMs: config.responseWindowMs,
      },
    }),
    restore: () => {},
  };
}
