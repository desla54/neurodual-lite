/**
 * GameSession Plugins Factory
 *
 * Creates the complete plugin set for a game session.
 * Called once at session creation, plugins are readonly thereafter.
 */

import type { GameSessionPlugins, CreateDefaultPluginsConfig } from './types';
import { DefaultResponseProcessor } from './response-processor';
import { DefaultTrialEndProcessor } from './trial-end-processor';
import { DefaultAudioPolicy, type AudioPolicyConfig } from './audio-policy';
import { DefaultRhythmController } from './rhythm-controller';
import { DefaultModalityEvaluator } from './modality-evaluator';
import { DefaultAudioVisualSyncPolicy } from './audio-visual-sync-policy';

/**
 * Create default plugins for a game session.
 *
 * @param config - Configuration containing spec and optional feedback settings
 * @returns Complete plugin set, readonly for the session lifetime
 */
export function createDefaultGamePlugins(config: CreateDefaultPluginsConfig): GameSessionPlugins {
  const { spec, activeModalities, feedbackConfig } = config;

  // Core plugins
  const response = new DefaultResponseProcessor(spec);
  const rhythm = new DefaultRhythmController(spec);
  const audioVisualSync = new DefaultAudioVisualSyncPolicy({ spec, activeModalities });

  // Audio policy with feedback config
  const audioPolicyConfig: AudioPolicyConfig = {
    audioFeedback: feedbackConfig?.audioFeedback ?? false,
  };
  const audio = new DefaultAudioPolicy(audioPolicyConfig);

  // Modality evaluator
  const modality = new DefaultModalityEvaluator();

  // Trial end processor (uses audio policy and modality evaluator)
  const trialEnd = new DefaultTrialEndProcessor({
    audioPolicy: audio,
    modalityEvaluator: modality,
  });

  return {
    response,
    trialEnd,
    audio,
    rhythm,
    modality,
    audioVisualSync,
  };
}
