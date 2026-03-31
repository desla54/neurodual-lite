/**
 * AudioPolicy Plugin
 *
 * Decides when to play audio for stimuli.
 *
 * Data in / Data out: Pure policy, no side effects.
 */

import type { AudioPolicy } from './types';

/**
 * Default AudioPolicy implementation.
 */
export class DefaultAudioPolicy implements AudioPolicy {
  shouldPlayStimulus(activeModalities: readonly string[]): boolean {
    return activeModalities.includes('audio');
  }
}
