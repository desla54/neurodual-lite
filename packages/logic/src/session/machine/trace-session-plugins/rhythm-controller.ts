/**
 * DefaultRhythmController
 *
 * Controls timing based on rhythm mode (self-paced vs timed).
 * Returns DURATIONS, machine ORCHESTRATES timer calls.
 *
 * PRINCIPLES:
 * - Data out: returns durations in ms, not timer.wait()
 * - No side effects: pure calculation logic
 * - TimingSource-driven: reads from mutable TimingSource for hot-reload support
 *
 * HOT-RELOAD:
 * The RhythmController reads timing values from a TimingSource reference.
 * When the machine updates the TimingSource via UPDATE_TIMINGS event,
 * subsequent calls to getRhythmController methods return the new values.
 */

import type { TraceRhythmMode } from '../../../types/trace';
import { TIMING_FEEDBACK_DEFAULT_MS } from '../../../specs/thresholds';
import type { RhythmController, WaitingTiming, TimingSource } from './types';

// =============================================================================
// Factory
// =============================================================================

export interface RhythmControllerConfig {
  /** Rhythm mode (immutable for the session) */
  readonly rhythmMode: TraceRhythmMode;
  /**
   * Reference to the mutable TimingSource in context.
   * The controller reads from this on each call, enabling hot-reload.
   */
  readonly getTimingSource: () => TimingSource;
}

/**
 * Creates a DefaultRhythmController.
 *
 * The controller delegates all timing reads to the TimingSource getter.
 * This enables hot-reload: when context.timingSource is updated,
 * subsequent calls return the new values.
 */
export function createDefaultRhythmController(config: RhythmControllerConfig): RhythmController {
  const { rhythmMode, getTimingSource } = config;

  function getMode(): TraceRhythmMode {
    return rhythmMode;
  }

  function isTimed(): boolean {
    return rhythmMode === 'timed';
  }

  function isSelfPaced(): boolean {
    return rhythmMode === 'self-paced';
  }

  function getStimulusDurationMs(isWarmup: boolean): number {
    const source = getTimingSource();
    return isWarmup ? source.warmupStimulusDurationMs : source.stimulusDurationMs;
  }

  function getResponseWindowMs(): number {
    // 0 in self-paced mode (no timeout)
    if (isSelfPaced()) return 0;
    return getTimingSource().responseWindowMs;
  }

  function getFeedbackDurationMs(): number {
    return getTimingSource().feedbackDurationMs || TIMING_FEEDBACK_DEFAULT_MS;
  }

  function getRuleDisplayMs(): number {
    return getTimingSource().ruleDisplayMs;
  }

  function getIntervalMs(): number {
    return getTimingSource().intervalMs;
  }

  function getTrialCycleDurationMs(): number {
    const source = getTimingSource();
    return (
      source.stimulusDurationMs +
      source.responseWindowMs +
      (source.feedbackDurationMs || TIMING_FEEDBACK_DEFAULT_MS) +
      source.ruleDisplayMs +
      source.intervalMs
    );
  }

  /**
   * Calculate waiting timing with drift correction (timed mode).
   * @param targetTime - Target time for next trial (AudioContext time in seconds)
   * @param currentTime - Current AudioContext time in seconds
   * @returns Actual durations to use (may be compressed if behind schedule)
   */
  function calculateWaitingTiming(targetTime: number, currentTime: number): WaitingTiming {
    const source = getTimingSource();

    if (isSelfPaced()) {
      // Self-paced: fixed timing, no drift correction
      return {
        ruleDisplayMs: source.ruleDisplayMs,
        intervalMs: source.intervalMs,
      };
    }

    // Timed mode with drift correction
    const totalRemainingMs = Math.max(0, (targetTime - currentTime) * 1000);

    const ruleDisplayMs = source.ruleDisplayMs;
    const intervalMs = source.intervalMs;
    const totalNeeded = ruleDisplayMs + intervalMs;

    if (totalRemainingMs >= totalNeeded) {
      // On schedule or ahead: use full durations
      // Interval absorbs the extra time
      return {
        ruleDisplayMs,
        intervalMs: totalRemainingMs - ruleDisplayMs,
      };
    }

    // Behind schedule: compress proportionally
    const ratio = totalRemainingMs / totalNeeded;
    const actualRuleDisplay = Math.max(0, ruleDisplayMs * ratio);
    const actualInterval = Math.max(0, totalRemainingMs - actualRuleDisplay);

    return {
      ruleDisplayMs: actualRuleDisplay,
      intervalMs: actualInterval,
    };
  }

  return {
    getMode,
    isTimed,
    isSelfPaced,
    getStimulusDurationMs,
    getResponseWindowMs,
    getFeedbackDurationMs,
    getRuleDisplayMs,
    getIntervalMs,
    getTrialCycleDurationMs,
    calculateWaitingTiming,
  };
}
