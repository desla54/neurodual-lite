/**
 * TimerPort - Abstract timing behavior for session orchestration.
 *
 * Allows sessions to work identically whether auto-paced or self-paced.
 * The session calls timer methods, the timer decides when to resolve.
 *
 * Design principles:
 * - Promise-based API for clean async/await usage in states
 * - Uses AudioPort internally for precise AudioContext timing
 * - Supports pause/resume with accurate time tracking
 * - Drift correction built into IntervalTimer
 */

import type { AudioPort } from '../ports/audio-port';

// =============================================================================
// Timer Configuration
// =============================================================================

export interface TimerConfig {
  /** Timing mode */
  readonly mode: TimingMode;
  /** Inter-stimulus interval (ms) */
  readonly intervalMs: number;
  /** Stimulus display duration (ms) */
  readonly stimulusDurationMs: number;
  /** Response window duration (ms) - for timed modes with separate response phase */
  readonly responseWindowMs?: number;
  /** Feedback display duration (ms) */
  readonly feedbackDurationMs?: number;
  /** Audio port for precise scheduling */
  readonly audio: AudioPort;
}

export type TimingMode = 'interval' | 'self-paced' | 'rhythmic';

// =============================================================================
// Wait Results
// =============================================================================

/**
 * Result of waiting for a timing phase.
 */
export type WaitResult =
  | { readonly type: 'completed' }
  | { readonly type: 'user-action'; readonly elapsedMs: number }
  | { readonly type: 'timeout' }
  | { readonly type: 'cancelled' };

// =============================================================================
// Timer Port Interface
// =============================================================================

/**
 * TimerPort - Abstracts timing behavior for session orchestration.
 *
 * Usage in a state:
 * ```typescript
 * async enter(context: SessionContext): Promise<void> {
 *   // Wait for stimulus display to end
 *   await context.timer.waitForStimulusEnd();
 *   // Timer decides when this resolves based on mode
 *   context.transitionTo('waiting');
 * }
 * ```
 */
export interface TimerPort {
  /**
   * Initialize the timer with configuration.
   * Called once at session start.
   */
  init(config: TimerConfig): void;

  /**
   * Start a new trial.
   * For interval timers: records target time for drift correction.
   * For self-paced: no-op.
   *
   * @param trialIndex Current trial index
   */
  startTrial(trialIndex: number): void;

  /**
   * Wait for stimulus display period to end.
   *
   * - IntervalTimer: Resolves after durationMs (or config.stimulusDurationMs)
   * - SelfPacedTimer: Resolves immediately (stimulus shown until user acts)
   * - RhythmicTimer: Resolves after durationMs OR on user action
   *
   * @param durationMs Optional custom duration (overrides config.stimulusDurationMs).
   *                   Used when stimulus duration varies per trial (adaptive modes)
   *                   or includes audio sync buffer.
   * @returns Promise that resolves when stimulus phase should end
   */
  waitForStimulusEnd(durationMs?: number): Promise<WaitResult>;

  /**
   * Wait for response window to end.
   *
   * - IntervalTimer: Resolves after remainingMs (or uses internal drift correction)
   * - SelfPacedTimer: Waits indefinitely until notifyUserAction() is called
   * - RhythmicTimer: Has timeout but can be accelerated by user
   *
   * @param remainingMs Optional custom remaining time. If provided, uses this
   *                    instead of internal drift correction. Useful when the
   *                    session manages drift correction externally.
   * @returns Promise that resolves when trial should advance
   */
  waitForResponseWindow(remainingMs?: number): Promise<WaitResult>;

  /**
   * Wait for feedback to display.
   *
   * @returns Promise that resolves after feedback duration
   */
  waitForFeedback(): Promise<WaitResult>;

  /**
   * Wait for a generic duration using AudioContext-based timing.
   *
   * This is the preferred way to wait for any timed phase (feedback, writing,
   * waiting, etc.) as it uses the audio clock for drift-free timing.
   * Use this instead of setTimeout for all timing-critical operations.
   *
   * @param durationMs Duration to wait in milliseconds
   * @returns Promise that resolves after the duration
   */
  waitForDuration(durationMs: number): Promise<WaitResult>;

  /**
   * Notify that user has acted.
   *
   * - For self-paced/rhythmic timers: Resolves pending wait
   * - For interval timers: Records time but doesn't affect timing
   */
  notifyUserAction(): void;

  /**
   * Cancel all pending timers.
   * Called on session stop or when transitioning unexpectedly.
   */
  cancel(): void;

  /**
   * Pause the timer.
   * Stores elapsed time for accurate resume.
   */
  pause(): void;

  /**
   * Resume the timer.
   * Calculates remaining time and continues.
   */
  resume(): void;

  /**
   * Get current high-precision time (for RT measurement).
   * Delegates to AudioPort.getCurrentTime().
   */
  getCurrentTime(): number;

  /**
   * Get elapsed time since trial started.
   * Useful for RT calculation and pause/resume.
   */
  getElapsedTime(): number;

  /**
   * Check if timer is currently paused.
   */
  isPaused(): boolean;
}
