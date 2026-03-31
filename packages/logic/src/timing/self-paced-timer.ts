/**
 * SelfPacedTimer - Waits for user action before advancing.
 *
 * Used by: TraceSession (self-paced mode), MemoSession, PlaceSession, DualPickSession
 *
 * Features:
 * - waitForResponseWindow() blocks until notifyUserAction() is called
 * - No timeouts (user controls the pace)
 * - Stimulus shown until user responds
 * - Optional soft timeout for warnings (without forcing advance)
 */

import type { AudioPort } from '../ports/audio-port';
import type { TimerConfig, TimerPort, WaitResult } from './timer-port';
import { TIMING_FEEDBACK_DEFAULT_MS } from '../specs/thresholds';

export class SelfPacedTimer implements TimerPort {
  private audio!: AudioPort;
  private config!: TimerConfig;

  // Timing state
  private trialStartTime = 0;
  private pauseStartTime = 0;
  private pauseElapsedTime = 0;
  private paused = false;

  // User action promise
  private userActionResolve: ((result: WaitResult) => void) | null = null;
  private pendingCallbackId: number | null = null;

  init(config: TimerConfig): void {
    this.config = config;
    this.audio = config.audio;
    this.paused = false;
    this.pauseElapsedTime = 0;
  }

  startTrial(_trialIndex: number): void {
    this.trialStartTime = this.audio.getCurrentTime();
  }

  async waitForStimulusEnd(_durationMs?: number): Promise<WaitResult> {
    // In self-paced mode, stimulus stays until user acts
    // So we resolve immediately - the stimulus will be shown
    // until the state receives a user action
    // (durationMs is ignored in self-paced mode)
    return { type: 'completed' };
  }

  async waitForResponseWindow(_remainingMs?: number): Promise<WaitResult> {
    if (this.paused) {
      return new Promise((resolve) => {
        this.userActionResolve = resolve;
      });
    }

    // Wait indefinitely for user action (remainingMs is ignored in self-paced mode)
    return new Promise((resolve) => {
      this.userActionResolve = resolve;

      // Optional soft timeout - emit warning but don't force advance
      // This could be used for UI hints like "Still thinking?"
      // For now, we don't implement soft timeout
    });
  }

  async waitForFeedback(): Promise<WaitResult> {
    const duration = this.config.feedbackDurationMs ?? TIMING_FEEDBACK_DEFAULT_MS;

    if (this.paused) {
      return new Promise((resolve) => {
        this.userActionResolve = resolve;
      });
    }

    // Feedback has a fixed duration even in self-paced mode
    return new Promise((resolve) => {
      this.userActionResolve = resolve;
      this.pendingCallbackId = this.audio.scheduleCallback(duration, () => {
        this.pendingCallbackId = null;
        this.userActionResolve = null;
        resolve({ type: 'completed' });
      });
    });
  }

  async waitForDuration(durationMs: number): Promise<WaitResult> {
    if (this.paused) {
      // For paused state, we need to wait for resume
      // Use a separate resolve that won't be affected by notifyUserAction
      return new Promise((resolve) => {
        // Store in pendingCallbackId's context - will be handled on resume
        // For now, resolve immediately with cancelled (pause should handle this)
        resolve({ type: 'cancelled' });
      });
    }

    // Handle zero or negative duration - resolve immediately
    if (durationMs <= 0) {
      return { type: 'completed' };
    }

    // Use audio scheduler for precise timing
    // IMPORTANT: Do NOT use userActionResolve here - waitForDuration should NOT
    // be interrupted by notifyUserAction (it's a fixed duration, not user-controlled)
    return new Promise((resolve) => {
      const callbackId = this.audio.scheduleCallback(durationMs, () => {
        // Clean up if this was the pending callback
        if (this.pendingCallbackId === callbackId) {
          this.pendingCallbackId = null;
        }
        resolve({ type: 'completed' });
      });
      // Track for cancel() but NOT for notifyUserAction()
      // Note: This means simultaneous waitForDuration calls may have issues
      // but that's an edge case that shouldn't happen in normal flow
      this.pendingCallbackId = callbackId;
    });
  }

  notifyUserAction(): void {
    // This is the key method - resolves the pending wait
    if (this.userActionResolve) {
      const elapsed = this.getElapsedTime();
      const resolve = this.userActionResolve;
      this.userActionResolve = null;

      // Cancel any pending feedback timer
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
    if (this.userActionResolve) {
      this.userActionResolve({ type: 'cancelled' });
      this.userActionResolve = null;
    }
  }

  pause(): void {
    if (this.paused) return;

    this.paused = true;
    this.pauseStartTime = this.audio.getCurrentTime();
    this.pauseElapsedTime = this.pauseStartTime - this.trialStartTime;

    // Cancel pending feedback timer if any
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

    // Note: The pending wait is still active, user action will resolve it
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
