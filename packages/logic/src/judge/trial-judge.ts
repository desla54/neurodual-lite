/**
 * TrialJudge Interface - Judge System
 *
 * Abstraction for evaluating trial responses.
 * Allows different scoring strategies to be plugged in via ModeSpec.
 */

import type { ModalityId, Trial } from '../types/core';
import type { FeedbackReaction, JudgeSummary, TrialVerdict } from './verdict';

// =============================================================================
// Response Input
// =============================================================================

/**
 * Response data for a single modality.
 * This is what the judge receives for evaluation.
 */
export interface ModalityResponse {
  readonly modalityId: ModalityId;
  readonly pressed: boolean;
  readonly reactionTimeMs?: number;
}

/**
 * Complete response for a trial.
 */
export interface TrialResponse {
  readonly trialIndex: number;
  readonly responses: ReadonlyMap<ModalityId, ModalityResponse>;
  readonly timestamp: Date;
}

// =============================================================================
// Evaluation Context
// =============================================================================

/**
 * Context provided to the judge for evaluation.
 * Includes thresholds and configuration from the ModeSpec.
 */
export interface EvaluationContext {
  /** Active modalities for this session */
  readonly activeModalities: readonly ModalityId[];

  /** Pass threshold (interpretation varies by strategy) */
  readonly passThreshold: number;

  /** Down threshold for regression recommendation */
  readonly downThreshold?: number;

  /** Scoring strategy (needed for DualnbackClassic-specific logic in summarize) */
  readonly strategy?: 'sdt' | 'dualnback-classic' | 'brainworkshop' | 'accuracy';

  /** Configurable feedback reactions */
  readonly feedbackReactions?: readonly FeedbackReaction[];
}

// =============================================================================
// Trial Judge Interface
// =============================================================================

/**
 * Judge for evaluating trial responses.
 *
 * Implementations:
 * - SDTJudge: Signal Detection Theory (hits/misses/FA/CR, d')
 * - AccuracyJudge: Simple accuracy percentage
 * - WindowJudge: Recall window evaluation
 * - TraceJudge: Active recall via swipe/tap
 *
 * The judge is stateless per-trial but accumulates verdicts for summarization.
 */
export interface TrialJudge {
  /**
   * Evaluate a single trial and produce a verdict.
   *
   * @param trial - The trial being evaluated
   * @param response - The user's response
   * @param context - Evaluation context with thresholds
   * @returns Verdict with result and feedback actions
   */
  evaluate(trial: Trial, response: TrialResponse, context: EvaluationContext): TrialVerdict;

  /**
   * Record a verdict (for accumulation).
   * Some judges need to track verdicts for session-level metrics.
   */
  record(verdict: TrialVerdict): void;

  /**
   * Produce a summary from all recorded verdicts.
   *
   * @param context - Evaluation context for thresholds
   * @returns Complete summary with pass/fail decision
   */
  summarize(context: EvaluationContext): JudgeSummary;

  /**
   * Reset the judge for a new session.
   */
  reset(): void;

  /**
   * Get all recorded verdicts.
   */
  getVerdicts(): readonly TrialVerdict[];
}

// =============================================================================
// Judge Configuration
// =============================================================================

/**
 * Configuration for creating a judge.
 */
export interface JudgeConfig {
  /** Which strategy to use */
  readonly strategy: 'sdt' | 'dualnback-classic' | 'brainworkshop' | 'accuracy';

  /** Pass threshold */
  readonly passThreshold: number;

  /** Down threshold (optional) */
  readonly downThreshold?: number;

  /** Custom feedback reactions (optional) */
  readonly feedbackReactions?: readonly FeedbackReaction[];
}
