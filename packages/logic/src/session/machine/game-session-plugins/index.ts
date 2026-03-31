/**
 * GameSession Plugins
 *
 * Plugin architecture for GameSessionMachine.
 * Same pattern as TraceSessionPlugins.
 */

// Types
export type {
  ResponseInput,
  ResponseResult,
  ResponseProcessor,
  ScoringStrategy,
  TrialEndInput,
  TrialEndResult,
  TrialEndProcessor,
  AudioPolicy,
  ResumeTimingAdjustment,
  RhythmController,
  ModalityEvalInput,
  ModalityFeedbackResult,
  ModalityEvalResult,
  ModalityEvaluator,
  SyncMode,
  AudioVisualSyncPolicy,
  GameSessionPlugins,
  CreateDefaultPluginsConfig,
} from './types';

// Implementations
export { DefaultResponseProcessor } from './response-processor';
export { DefaultTrialEndProcessor } from './trial-end-processor';
export { DefaultAudioPolicy, type AudioPolicyConfig } from './audio-policy';
export { DefaultRhythmController } from './rhythm-controller';
export { DefaultModalityEvaluator } from './modality-evaluator';
export { DefaultAudioVisualSyncPolicy } from './audio-visual-sync-policy';

// Factory
export { createDefaultGamePlugins } from './create-default-plugins';
