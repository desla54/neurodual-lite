/**
 * AudioPolicy Plugin
 *
 * Decides what feedback sounds to play.
 * Does NOT call audio.play() - machine orchestrates that.
 *
 * Data in / Data out: Pure decisions, no side effects.
 */

import type { TrialVerdict } from '../../../judge';
import type { AudioPolicy } from './types';

export interface AudioPolicyConfig {
  readonly audioFeedback: boolean;
}

/**
 * Default AudioPolicy implementation.
 */
export class DefaultAudioPolicy implements AudioPolicy {
  private readonly audioFeedbackEnabled: boolean;

  constructor(config?: AudioPolicyConfig) {
    this.audioFeedbackEnabled = config?.audioFeedback ?? false;
  }

  isAudioFeedbackEnabled(): boolean {
    return this.audioFeedbackEnabled;
  }

  /**
   * Get sounds to play based on verdict.
   *
   * Machine will call audio.playCorrect() / audio.playIncorrect()
   * for each sound returned.
   */
  getFeedbackSounds(verdict: TrialVerdict | null): ReadonlyArray<'correct' | 'incorrect'> {
    if (!this.audioFeedbackEnabled) {
      return [];
    }

    if (!verdict) {
      return [];
    }

    const sounds: Array<'correct' | 'incorrect'> = [];

    for (const action of verdict.feedbackActions) {
      if (action.sound === 'correct') {
        sounds.push('correct');
      } else if (action.sound === 'incorrect') {
        sounds.push('incorrect');
      }
    }

    return sounds;
  }
}
