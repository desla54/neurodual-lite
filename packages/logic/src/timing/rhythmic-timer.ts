/**
 * RhythmicTimer - Hybrid timing mode.
 *
 * Auto-advances like IntervalTimer, but can be accelerated by user action.
 *
 * Use cases:
 * - Modes where there's a maximum pace but skilled users can go faster
 * - Training modes that have a "target rhythm" but don't punish fast responses
 *
 * Features:
 * - Has timeout like IntervalTimer
 * - But resolves early on user action like SelfPacedTimer
 * - Maintains minimum inter-stimulus interval to prevent spam
 */

import type { AudioPort } from '../ports/audio-port';
import { TIMING_FEEDBACK_DEFAULT_MS, TIMING_MIN_INTERVAL_SPAM_MS } from '../specs/thresholds';
import type { TimerConfig, TimerPort, WaitResult } from './timer-port';

export interface RhythmicTimerConfig extends TimerConfig {
  /** Minimum time before user action can advance (prevents spam) */
  minimumIntervalMs?: number;
}

export class RhythmicTimer implements TimerPort {
  private audio!: AudioPort;
  private config!: RhythmicTimerConfig;

  // Timing state
  private trialStartTime = 0;
  private pauseStartTime = 0;
  private pauseElapsedTime = 0;
  private paused = false;

  // Current pending state
  private pendingCallbackId: number | null = null;
  private pendingResolve: ((result: WaitResult) => void) | null = null;
  private waitStartTime = 0;

  init(config: TimerConfig): void {
    this.config = config as RhythmicTimerConfig;
    this.audio = config.audio;
    this.paused = false;
    this.pauseElapsedTime = 0;
  }

  startTrial(_trialIndex: number): void {
    this.trialStartTime = this.audio.getCurrentTime();
  }

  async waitForStimulusEnd(durationMs?: number): Promise<WaitResult> {
    if (this.paused) {
      return new Promise((resolve) => {
        this.pendingResolve = resolve;
      });
    }

    // Use provided duration or fall back to config
    const duration = durationMs ?? this.config.stimulusDurationMs;
    this.waitStartTime = this.audio.getCurrentTime();

    return new Promise((resolve) => {
      this.pendingResolve = resolve;
      this.pendingCallbackId = this.audio.scheduleCallback(duration, () => {
        this.pendingCallbackId = null;
        this.pendingResolve = null;
        resolve({ type: 'completed' });
      });
    });
  }

  async waitForResponseWindow(remainingMs?: number): Promise<WaitResult> {
    if (this.paused) {
      return new Promise((resolve) => {
        this.pendingResolve = resolve;
      });
    }

    // Use provided remaining time or calculate from config
    const duration = remainingMs ?? this.config.intervalMs - this.config.stimulusDurationMs;
    this.waitStartTime = this.audio.getCurrentTime();

    return new Promise((resolve) => {
      this.pendingResolve = resolve;
      this.pendingCallbackId = this.audio.scheduleCallback(duration, () => {
        this.pendingCallbackId = null;
        this.pendingResolve = null;
        resolve({ type: 'timeout' });
      });
    });
  }

  async waitForFeedback(): Promise<WaitResult> {
    const duration = this.config.feedbackDurationMs ?? TIMING_FEEDBACK_DEFAULT_MS;

    if (this.paused) {
      return new Promise((resolve) => {
        this.pendingResolve = resolve;
      });
    }

    this.waitStartTime = this.audio.getCurrentTime();

    return new Promise((resolve) => {
      this.pendingResolve = resolve;
      this.pendingCallbackId = this.audio.scheduleCallback(duration, () => {
        this.pendingCallbackId = null;
        this.pendingResolve = null;
        resolve({ type: 'completed' });
      });
    });
  }

  async waitForDuration(durationMs: number): Promise<WaitResult> {
    if (this.paused) {
      return new Promise((resolve) => {
        this.pendingResolve = resolve;
      });
    }

    // Handle zero or negative duration - resolve immediately
    if (durationMs <= 0) {
      return { type: 'completed' };
    }

    this.waitStartTime = this.audio.getCurrentTime();

    return new Promise((resolve) => {
      this.pendingResolve = resolve;
      this.pendingCallbackId = this.audio.scheduleCallback(durationMs, () => {
        this.pendingCallbackId = null;
        this.pendingResolve = null;
        resolve({ type: 'completed' });
      });
    });
  }

  notifyUserAction(): void {
    // Check minimum interval to prevent spam
    const minimumMs = this.config.minimumIntervalMs ?? TIMING_MIN_INTERVAL_SPAM_MS;
    const elapsed = this.audio.getCurrentTime() - this.waitStartTime;

    if (elapsed < minimumMs) {
      // Too fast - ignore (don't advance early)
      return;
    }

    // Resolve pending wait early
    if (this.pendingResolve) {
      const resolve = this.pendingResolve;
      this.pendingResolve = null;

      // Cancel the timeout
      if (this.pendingCallbackId !== null) {
        this.audio.cancelCallback(this.pendingCallbackId);
        this.pendingCallbackId = null;
      }

      resolve({ type: 'user-action', elapsedMs: elapsed });
    }
  }

  cancel(): void {
    if (this.pendingCallbackId !== null) {
      this.audio.cancelCallback(this.pendingCallbackId);
      this.pendingCallbackId = null;
    }
    if (this.pendingResolve) {
      this.pendingResolve({ type: 'cancelled' });
      this.pendingResolve = null;
    }
  }

  pause(): void {
    if (this.paused) return;

    this.paused = true;
    this.pauseStartTime = this.audio.getCurrentTime();
    this.pauseElapsedTime = this.pauseStartTime - this.trialStartTime;

    // Cancel pending timer
    if (this.pendingCallbackId !== null) {
      this.audio.cancelCallback(this.pendingCallbackId);
      this.pendingCallbackId = null;
    }
  }

  resume(): void {
    if (!this.paused) return;

    this.paused = false;

    // Adjust trial start time for accurate RT
    this.trialStartTime = this.audio.getCurrentTime() - this.pauseElapsedTime;

    // Re-schedule remaining time if we have a pending promise
    if (this.pendingResolve) {
      const elapsedBeforePause = this.pauseStartTime - this.waitStartTime;
      const fullDuration = this.config.intervalMs - this.config.stimulusDurationMs;
      const remaining = Math.max(0, fullDuration - elapsedBeforePause);

      this.waitStartTime = this.audio.getCurrentTime() - elapsedBeforePause;

      const resolve = this.pendingResolve;
      this.pendingCallbackId = this.audio.scheduleCallback(remaining, () => {
        this.pendingCallbackId = null;
        this.pendingResolve = null;
        resolve({ type: 'timeout' });
      });
    }
  }

  getCurrentTime(): number {
    return this.audio.getCurrentTime();
  }

  getElapsedTime(): number {
    if (this.paused) {
      return this.pauseElapsedTime;
    }
    return this.audio.getCurrentTime() - this.trialStartTime;
  }

  isPaused(): boolean {
    return this.paused;
  }
}
