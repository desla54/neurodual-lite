/**
 * TraceSession Plugins
 *
 * Plugin architecture for TraceSessionMachine.
 * Machine = minimal shell, Plugins = testable business logic.
 */

// Types
export type {
  // Plugin interfaces
  ResponseProcessor,
  ModalityEvaluator,
  AudioPolicy,
  WritingOrchestrator,
  RhythmController,
  ArithmeticOrchestrator,
  AdaptiveTimingController,
  TraceSessionPlugins,
  // Input types
  SwipeInput,
  DoubleTapInput,
  CenterTapInput,
  ModalityEvalInput,
  WaitingTiming,
  TraceTrialOutcome,
  // Output types
  ResponseResult,
  ModalityEvalResult,
  StimulusSoundDecision,
  FeedbackSoundDecision,
  ArithmeticResult,
  TraceArithmeticProblem,
  TraceArithmeticColorCue,
  TraceArithmeticCueToken,
  AdaptiveTimingState,
  // TimingSource (mutable timing for hot-reload)
  TimingSource,
  TimingSourceUpdate,
} from './types';

// Composition
export {
  type CompositionMode,
  type PluginConfig,
  HOOK_COMPOSITION,
  resolveOverride,
  chainModalityEvaluators,
  resolvePlugins,
} from './composition';

// Factory
export {
  createDefaultTracePlugins,
  type CreateDefaultPluginsConfig,
  // Individual factories for custom composition
  createDefaultResponseProcessor,
  createDefaultAudioPolicy,
  createDefaultRhythmController,
  createDefaultModalityEvaluator,
  createDefaultWritingOrchestrator,
  createArithmeticOrchestrator,
  createNoopArithmeticOrchestrator,
  createAdaptiveTimingController,
  createNoopAdaptiveTimingController,
} from './create-default-plugins';
