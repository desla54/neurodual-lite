/**
 * Timer Factory
 *
 * Creates the appropriate timer based on the ModeSpec or session config.
 *
 * Usage:
 * ```typescript
 * // From ModeSpec (recommended)
 * const timer = createTimer(spec, audio);
 *
 * // From explicit timing mode (legacy/special cases)
 * const timer = createTimerFromMode('self-paced');
 * timer.init({ mode: 'self-paced', intervalMs: 3000, stimulusDurationMs: 500, audio });
 * ```
 *
 * The timing mode is determined by:
 * 1. spec.extensions?.timingMode (if specified)
 * 2. Falls back to 'interval' (default, backward compatible)
 */

import type { AudioPort } from '../ports/audio-port';
import type { ModeSpec } from '../specs/types';
import { IntervalTimer } from './interval-timer';
import { RhythmicTimer } from './rhythmic-timer';
import { SelfPacedTimer } from './self-paced-timer';
import type { TimerConfig, TimerPort, TimingMode } from './timer-port';

/**
 * Extension key for timing mode in ModeSpec.extensions
 */
export const TIMING_MODE_KEY = 'timingMode';

/**
 * Get timing mode from spec extensions.
 */
export function getTimingMode(spec: ModeSpec): TimingMode {
  const mode = spec.extensions?.[TIMING_MODE_KEY];
  if (mode === 'self-paced' || mode === 'rhythmic' || mode === 'interval') {
    return mode;
  }
  return 'interval'; // Default for backward compatibility
}

/**
 * Create a timer based on timing mode.
 */
export function createTimerFromMode(mode: TimingMode): TimerPort {
  switch (mode) {
    case 'self-paced':
      return new SelfPacedTimer();
    case 'rhythmic':
      return new RhythmicTimer();
    default:
      return new IntervalTimer();
  }
}

/**
 * Create and initialize a timer from a ModeSpec.
 *
 * This is the main entry point for session code.
 *
 * @param spec The mode specification
 * @param audio The audio port for precise timing
 * @returns Initialized timer ready for use
 */
export function createTimer(spec: ModeSpec, audio: AudioPort): TimerPort {
  const mode = getTimingMode(spec);
  const timer = createTimerFromMode(mode);

  const config: TimerConfig = {
    mode,
    intervalMs: spec.timing.intervalMs,
    stimulusDurationMs: spec.timing.stimulusDurationMs,
    responseWindowMs: spec.timing.responseWindowMs,
    feedbackDurationMs: spec.timing.feedbackDurationMs,
    audio,
  };

  timer.init(config);
  return timer;
}

// =============================================================================
// TraceSession-specific timer creation
// =============================================================================

/**
 * Timing configuration for TraceSession (legacy format).
 * TraceSession uses 'rhythmMode' instead of 'timingMode'.
 */
export interface TraceTimingConfig {
  /** Rhythm mode: 'self-paced' or 'timed' */
  rhythmMode: 'self-paced' | 'timed';
  /** Inter-stimulus interval (ms) */
  intervalMs: number;
  /** Stimulus display duration (ms) */
  stimulusDurationMs: number;
  /** Warmup stimulus duration (ms) - often longer */
  warmupStimulusDurationMs?: number;
  /** Response window duration (ms) - for timed mode */
  responseWindowMs: number;
  /** Feedback display duration (ms) */
  feedbackDurationMs: number;
}

/**
 * Map TraceSession rhythmMode to TimingMode.
 */
export function rhythmModeToTimingMode(rhythmMode: 'self-paced' | 'timed'): TimingMode {
  return rhythmMode === 'self-paced' ? 'self-paced' : 'interval';
}

/**
 * Create and initialize a timer for TraceSession.
 *
 * @param config TraceSession timing config
 * @param audio The audio port for precise timing
 * @returns Initialized timer ready for use
 */
export function createTimerForTrace(config: TraceTimingConfig, audio: AudioPort): TimerPort {
  const mode = rhythmModeToTimingMode(config.rhythmMode);
  const timer = createTimerFromMode(mode);

  const timerConfig: TimerConfig = {
    mode,
    intervalMs: config.intervalMs,
    stimulusDurationMs: config.stimulusDurationMs,
    responseWindowMs: config.responseWindowMs,
    feedbackDurationMs: config.feedbackDurationMs,
    audio,
  };

  timer.init(timerConfig);
  return timer;
}
