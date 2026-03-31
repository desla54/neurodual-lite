/**
 * AudioPolicy Plugin
 *
 * Decides when to play audio during stimulus.
 *
 * Data in / Data out: Pure decisions, no side effects.
 */

import { AUDIO_SYNC_BUFFER_MS } from '../../../domain';
import type { AudioPolicy } from './types';

/**
 * Default AudioPolicy implementation.
 */
export class DefaultAudioPolicy implements AudioPolicy {
  shouldPlayStimulus(activeModalities: readonly string[]): boolean {
    return activeModalities.includes('audio');
  }

  getAudioSyncBufferMs(): number {
    return AUDIO_SYNC_BUFFER_MS;
  }
}
