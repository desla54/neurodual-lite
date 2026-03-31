/**
 * Sequence Engine - Exports publics
 */

// PRNG
export { createPRNG, type PRNG } from './prng';

// Budget Manager
export {
  calculateEffectiveProbabilities,
  calculateExpectedTargets,
  calculateExpectedLures,
  updateModalityBudget,
  incrementTrialCount,
  isBudgetExhausted,
  resetBudget,
  type EffectiveProbabilities,
} from './budget-manager';

// Value Resolver
export {
  resolveValue,
  isIntentionPossible,
  getModalityValues,
  type ResolvedValue,
} from './value-resolver';

// Correlation Resolver
export {
  buildJointProbabilityTable,
  drawCorrelatedPair,
  drawCorrelatedIntentions,
  isValidCorrelationMatrix,
  type JointProbabilityTable,
  type CorrelatedIntentions,
} from './correlation-resolver';

// Sequence Engine
export { createSequenceEngine, type SequenceEngineConfig } from './sequence-engine';
