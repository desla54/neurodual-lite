/**
 * Report Domain - Session report generation
 *
 * Provides:
 * - Contextual message generation (data-driven, factual)
 * - Model converters (from session summaries to unified model)
 */

export {
  generateContextualMessageData,
  generateContextualMessage,
  generateContextualMessageEN,
} from './contextual-message';
export {
  convertTempoSession,
  convertMemoSession,
  convertPlaceSession,
  convertDualPickSession,
  convertTraceSession,
  convertGenericSession,
  type TempoSessionInput,
  type MemoSessionInput,
  type PlaceSessionInput,
  type PlaceModalityStatsInput,
  type DualPickSessionInput,
  type TraceSessionInput,
  type GenericSessionInput,
} from './converters';
export {
  recommendNextLevelForTempo,
  recommendNextLevelFromPassed,
  recommendJourneyStage,
  type LevelRecommendation,
  type RecommendationDirection,
  type TempoLevelRecommendationInput,
  type JourneyStageRecommendation,
  type JourneyStageRecommendationInput,
} from './recommendation';

export {
  computeProgressionIndicatorModel,
  computeJaeggiExplanation,
  computeBrainWorkshopExplanation,
  computeAccuracyExplanation,
  resolveJourneyCompletion,
  type DualTrackJourneyDisplay,
  type ModalityErrorInfo,
  type ProgressionExplanation,
  type JourneyCompletionState,
  type ProgressionIndicatorAction,
  type ProgressionIndicatorHeadline,
  type ProgressionIndicatorModel,
  type ProgressionIndicatorScope,
  type ProgressionIndicatorTone,
  type ProgressionMessageKind,
} from './progression-indicator';
export { buildDualTrackJourneyDisplay } from './dual-track-journey-display';
export { buildCurrentJourneyGuidanceContext } from './current-journey-guidance';

export type {
  ProgressionProtocolConfig,
  PostProcessorContext,
  PostProcessorResult,
} from './protocol-configs';
export {
  RULESET_REGISTRY,
  POST_PROCESSORS,
  deriveProtocolConfig,
} from './protocol-configs';
