/**
 * IntervalTimer - Auto-advances after fixed intervals.
 *
 * Used by: GameSession (Tempo modes), TraceSession (timed mode)
 *
 * Features:
 * - Absolute scheduling with drift correction
 * - Uses AudioContext for precise timing
 * - Pause/resume support with accurate time tracking
 *
 * Drift correction mechanism:
 * Instead of waiting for a relative duration each trial, we track an absolute
 * target time. If a trial runs 10ms slower, the next wait is 10ms shorter,
 * keeping the overall session rhythm consistent.
 */

import type { AudioPort } from '../ports/audio-port';
import { TIMING_FEEDBACK_DEFAULT_MS } from '../specs/thresholds';
import type { TimerConfig, TimerPort, WaitResult } from './timer-port';

export class IntervalTimer implements TimerPort {
  private audio!: AudioPort;
  private config!: TimerConfig;

  // Timing state
  private sessionStartTime = 0;
  private trialStartTime = 0;
  private nextTrialTargetTime = 0;
  private pauseStartTime = 0;
  private pauseElapsedTime = 0;
  private paused = false;

  // Current pending timer
  private pendingCallbackId: number | null = null;
  private pendingResolve: ((result: WaitResult) => void) | null = null;

  init(config: TimerConfig): void {
    this.config = config;
    this.audio = config.audio;

    // Initialize session timing
    this.sessionStartTime = this.audio.getCurrentTime();
    this.nextTrialTargetTime = this.sessionStartTime;
    this.paused = false;
    this.pauseElapsedTime = 0;
  }

  startTrial(trialIndex: number): void {
    this.trialStartTime = this.audio.getCurrentTime();

    // For first trial or after pause, align to current time
    if (trialIndex === 0 || this.nextTrialTargetTime < this.trialStartTime) {
      this.nextTrialTargetTime = this.trialStartTime + this.config.intervalMs;
    }
  }

  async waitForStimulusEnd(durationMs?: number): Promise<WaitResult> {
    if (this.paused) {
      // Will be resumed later
      return new Promise((resolve) => {
        this.pendingResolve = resolve;
      });
    }

    // Use provided duration or fall back to config
    const duration = durationMs ?? this.config.stimulusDurationMs;

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

    let remaining: number;
    if (remainingMs !== undefined) {
      // Use provided remaining time (external drift correction)
      remaining = remainingMs;
    } else {
      // Use internal drift correction: calculate remaining time to target
      const currentTime = this.audio.getCurrentTime();
      remaining = Math.max(0, this.nextTrialTargetTime - currentTime);
      // Advance target for next trial
      this.nextTrialTargetTime += this.config.intervalMs;
    }

    return new Promise((resolve) => {
      this.pendingResolve = resolve;

      if (remaining <= 0) {
        // Already at or past target time, resolve immediately
        this.pendingResolve = null;
        resolve({ type: 'completed' });
        return;
      }

      this.pendingCallbackId = this.audio.scheduleCallback(remaining, () => {
        this.pendingCallbackId = null;
        this.pendingResolve = null;
        resolve({ type: 'completed' });
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
    // In interval mode, user actions don't affect timing
    // They're recorded for RT but the timer continues its pace
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
    const pauseDuration = this.audio.getCurrentTime() - this.pauseStartTime;

    // Shift absolute target forward by pause duration
    this.nextTrialTargetTime += pauseDuration;

    // Recalculate trial start time for RT
    this.trialStartTime = this.audio.getCurrentTime() - this.pauseElapsedTime;

    // If we have a pending promise, re-schedule the remaining time
    if (this.pendingResolve) {
      // Calculate remaining based on what was happening
      // This is approximate - the state should call the wait method again
      const remaining = Math.max(0, this.nextTrialTargetTime - this.audio.getCurrentTime());
      const resolve = this.pendingResolve;
      this.pendingCallbackId = this.audio.scheduleCallback(remaining, () => {
        this.pendingCallbackId = null;
        this.pendingResolve = null;
        resolve({ type: 'completed' });
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
