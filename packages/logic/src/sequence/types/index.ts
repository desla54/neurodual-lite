/**
 * Sequence Types - Exports publics
 */

// Spec types
export type {
  ModalityId,
  ModalitySpec,
  LureType,
  LureSpec,
  CorrelationKey,
  CorrelationMatrix,
  BudgetSpec,
  TimingSpec,
  SequenceSpec,
  ConstraintSpec,
  WeightedConstraintSpec,
} from './spec';

export { getCorrelation, createSequenceSpec } from './spec';

// State types
export type {
  TrialIntention,
  ModalityValue,
  GeneratedTrial,
  LureCount,
  BudgetUsed,
  RandomState,
  EngineState,
  GenerationMetadata,
  GenerationResult,
} from './state';

export { createEmptyBudgetUsed } from './state';

// Constraint types
export type {
  Constraint,
  WeightedConstraint,
  MaxConsecutiveParams,
  MinGapParams,
  NoImmediateRepeatParams,
  ConstraintType,
  ConstraintParamsMap,
} from './constraints';

// Algorithm types
export type {
  SessionConfig,
  AlgorithmContext,
  TrialResult,
  ModalityResponse,
  PerformanceMetrics,
  AlgorithmState,
  AdaptiveAlgorithm,
} from './algorithm';
