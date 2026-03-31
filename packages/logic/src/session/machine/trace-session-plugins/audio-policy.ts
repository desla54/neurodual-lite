/**
 * DefaultAudioPolicy
 *
 * Decides which sounds to play for stimulus and feedback.
 * Returns WHAT to play, machine ORCHESTRATES the call.
 *
 * PRINCIPLES:
 * - Data out: returns an audio decision object, not audio.play()
 * - No side effects: pure decision logic
 * - Spec-driven: reads audioEnabled/soundEnabled from spec
 */

import type { TraceTrial } from '../../../types/trace';
import type { TraceSpec } from '../../../specs/trace.spec';
import type { AudioPolicy, StimulusSoundDecision, FeedbackSoundDecision } from './types';

// =============================================================================
// Factory
// =============================================================================

export interface AudioPolicyConfig {
  readonly spec: TraceSpec;
}

/**
 * Creates a DefaultAudioPolicy.
 * Reads audioEnabled and soundEnabled from spec.extensions.
 */
export function createDefaultAudioPolicy(config: AudioPolicyConfig): AudioPolicy {
  const { spec } = config;
  const audioEnabled = spec.extensions.audioEnabled;
  const soundEnabled = spec.extensions.soundEnabled;

  function getStimulusSound(trial: TraceTrial | null): StimulusSoundDecision | null {
    if (!trial) return null;

    // audioEnabled = letter sounds (A, B, C...)
    const sound = audioEnabled && trial.sound ? trial.sound : undefined;

    // Tone stimuli have their own audio channel and are not gated by letter audio.
    const tone = trial.tone;

    // soundEnabled = click sound only when no modality-specific audio is available.
    const click = !sound && !tone && soundEnabled ? true : undefined;

    return sound || tone || click ? { sound, tone, click } : null;
  }

  function getFeedbackSound(feedbackType: 'correct' | 'incorrect' | null): FeedbackSoundDecision {
    if (!soundEnabled) return null;
    if (feedbackType === null) return null;

    return feedbackType;
  }

  function isAudioEnabled(): boolean {
    return audioEnabled;
  }

  function isSoundEnabled(): boolean {
    return soundEnabled;
  }

  return {
    getStimulusSound,
    getFeedbackSound,
    isAudioEnabled,
    isSoundEnabled,
  };
}
