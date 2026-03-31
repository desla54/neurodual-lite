/**
 * Sequence Algorithm - Exports publics
 */

export {
  FixedAlgorithm,
  createFixedAlgorithm,
  createDualTempoAlgorithm,
  createDualMemoAlgorithm,
  createDualPlaceAlgorithm,
  type AdaptationMode,
  type AdaptiveAlgorithmConfig,
} from './fixed';

export {
  createThompsonSamplingAlgorithm,
  type TrainingObjective,
  type ThompsonSamplingConfig,
} from './thompson-sampling';

export {
  createAdaptiveControllerAlgorithm,
  type AdaptiveControllerConfig,
  type ControllerGains,
  type UserProfile,
} from './adaptive-controller';

export {
  createMetaLearningAlgorithm,
  type MetaLearningConfig,
  type HistoricalSessionData,
} from './meta-learning';

export {
  createJitterAdaptiveAlgorithm,
  type JitterAdaptiveConfig,
  type JitterMode,
} from './jitter-adaptive';
