/**
 * Judge System Exports
 *
 * Provides abstraction for trial evaluation across all game modes.
 */

// Factory
export { createJudge, createJudgeFromConfig, getScoringStrategy, JUDGE_KEY } from './judge-factory';

// Implementations
export { AccuracyJudge } from './accuracy-judge';
export { BrainWorkshopJudge } from './brainworkshop-judge';
export { SDTJudge } from './sdt-judge';

// Placement Evaluator (for Flow/DualPick modes)
export {
  evaluatePlacement,
  findCorrectSlot,
  type HistoryItem,
  type PlacementEvaluation,
} from './placement-evaluator';

// Types - Trial Judge
export type {
  EvaluationContext,
  JudgeConfig,
  ModalityResponse,
  TrialJudge,
  TrialResponse,
} from './trial-judge';

// Types - Verdict
export type {
  FeedbackAction,
  FeedbackReaction,
  JudgeSummary,
  ModalitySummary,
  ModalityVerdict,
  SoundFeedback,
  TrialResultType,
  TrialVerdict,
  VerdictCounts,
  VisualFeedback,
} from './verdict';

// Constants
export { DEFAULT_SDT_FEEDBACK } from './verdict';
