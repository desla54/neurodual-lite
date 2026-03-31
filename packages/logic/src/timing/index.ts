/**
 * Timing System
 *
 * Abstracts timing behavior for session orchestration.
 * Sessions use TimerPort without knowing if they're interval-paced or self-paced.
 *
 * Timer Types:
 * - IntervalTimer: Auto-advances after fixed intervals (with drift correction)
 * - SelfPacedTimer: Waits for user action before advancing
 * - RhythmicTimer: Hybrid - has timeout but can be accelerated by user
 *
 * Usage:
 * ```typescript
 * import { createTimer } from '@neurodual/logic/timing';
 *
 * // In session constructor
 * const timer = createTimer(spec, audio);
 *
 * // In state
 * await timer.waitForStimulusEnd();
 * const result = await timer.waitForResponseWindow();
 * if (result.type === 'user-action') {
 *   // User responded
 * } else if (result.type === 'timeout') {
 *   // Time expired
 * }
 * ```
 */

// Main factory
export {
  createTimer,
  createTimerFromMode,
  createTimerForTrace,
  getTimingMode,
  rhythmModeToTimingMode,
  TIMING_MODE_KEY,
} from './timer-factory';
export type { TraceTimingConfig } from './timer-factory';

// Interface and types
export type { TimerConfig, TimerPort, TimingMode, WaitResult } from './timer-port';

// Implementations (for testing/advanced use)
export { IntervalTimer } from './interval-timer';
export { RhythmicTimer, type RhythmicTimerConfig } from './rhythmic-timer';
export { SelfPacedTimer } from './self-paced-timer';

// Event loop lag measurement (for session health metrics)
export {
  measureEventLoopLag,
  startLagSampler,
  stopLagSampler,
  getLastMeasuredLag,
  isLagSamplerRunning,
} from './event-loop-lag';
