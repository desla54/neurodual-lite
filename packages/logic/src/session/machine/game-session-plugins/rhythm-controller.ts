/**
 * RhythmController Plugin
 *
 * Manages timing, drift correction, pause/resume adjustments.
 *
 * Data in / Data out: Pure calculations, no timer calls.
 */

import type { ModeSpec } from '../../../specs/types';
import { SELF_PACED_MAX_TIMEOUT_MS, AUDIO_SYNC_BUFFER_MS } from '../../../specs/thresholds';
import type { ResumeTimingAdjustment, RhythmController } from './types';

/**
 * Default RhythmController implementation.
 */
export class DefaultRhythmController implements RhythmController {
  private readonly selfPaced: boolean;
  private readonly stimulusDurationMs: number;
  private readonly isiMs: number;

  constructor(spec: ModeSpec) {
    // Check if self-paced mode is enabled in spec extensions
    const extensions = spec.extensions as { selfPaced?: boolean } | undefined;
    this.selfPaced = extensions?.selfPaced === true;
    this.stimulusDurationMs = spec.timing.stimulusDurationMs;
    this.isiMs = spec.timing.intervalMs;
  }

  isSelfPaced(): boolean {
    return this.selfPaced;
  }

  getStimulusDuration(): number {
    return this.stimulusDurationMs;
  }

  getIsi(): number {
    return this.isiMs;
  }

  /**
   * Calculate next trial target time with drift correction.
   *
   * DRIFT CORRECTION with re-alignment safety:
   * If we've somehow fallen behind (proposed target is in the past),
   * realign to current time + ISI instead of accumulating debt.
   */
  getNextTrialTarget(currentTargetTime: number, currentAudioTime: number, isiMs: number): number {
    const proposedTarget = currentTargetTime + isiMs / 1000;

    // If proposed target is in the past, realign to current time + ISI
    return proposedTarget > currentAudioTime ? proposedTarget : currentAudioTime + isiMs / 1000;
  }

  /**
   * Adjust timing after resume from pause.
   *
   * Shift absolute targets forward by pause duration to maintain rhythm.
   */
  adjustAfterResume(
    pauseDurationMs: number,
    pauseElapsedTimeMs: number,
    nextTrialTargetTime: number,
    _stimulusStartTime: number,
    currentAudioTime: number,
  ): ResumeTimingAdjustment {
    const pauseDuration = pauseDurationMs / 1000;
    return {
      nextTrialTargetTime: nextTrialTargetTime + pauseDuration,
      // Adjust stimulusStartTime for correct RT on resume
      stimulusStartTime: currentAudioTime - pauseElapsedTimeMs / 1000,
    };
  }

  /**
   * Calculate waiting duration with drift correction.
   *
   * Uses absolute target time for consistent BPM.
   */
  calculateWaitingDuration(targetTime: number, currentTime: number, _isiMs: number): number {
    return Math.max(0, (targetTime - currentTime) * 1000);
  }

  getSelfPacedMaxTimeout(): number {
    return SELF_PACED_MAX_TIMEOUT_MS;
  }
}

export { AUDIO_SYNC_BUFFER_MS };
