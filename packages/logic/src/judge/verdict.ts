/**
 * Verdict Types - Judge System
 *
 * Types for trial evaluation results and feedback actions.
 * These are spec-driven and decoupled from specific implementations.
 */

import type { ModalityId } from '../types/core';

// =============================================================================
// Trial Result
// =============================================================================

/**
 * Possible outcomes for a single modality in a trial.
 * Based on Signal Detection Theory.
 */
export type TrialResultType =
  | 'hit' // Target correctly detected
  | 'miss' // Target not detected
  | 'false-alarm' // Response without target
  | 'correct-rejection'; // Correctly ignored non-target

// =============================================================================
// Feedback Actions
// =============================================================================

/**
 * Visual feedback types available.
 */
export type VisualFeedback = 'flash-green' | 'flash-red' | 'flash-amber' | 'none';

/**
 * Sound feedback types available.
 */
export type SoundFeedback = 'correct' | 'incorrect' | 'neutral' | 'none';

/**
 * A feedback action to be executed after evaluation.
 * Decouples evaluation logic from feedback execution.
 */
export interface FeedbackAction {
  readonly visual?: VisualFeedback;
  readonly sound?: SoundFeedback;
  readonly haptic?: boolean;
  readonly duration?: number; // ms
}

// =============================================================================
// Modality Verdict
// =============================================================================

/**
 * Verdict for a single modality within a trial.
 */
export interface ModalityVerdict {
  readonly modalityId: ModalityId;
  readonly result: TrialResultType;
  readonly reactionTimeMs?: number;
  readonly wasTarget: boolean;
  readonly hadResponse: boolean;
}

// =============================================================================
// Trial Verdict
// =============================================================================

/**
 * Complete verdict for a single trial.
 * Contains per-modality results and recommended feedback.
 */
export interface TrialVerdict {
  readonly trialIndex: number;
  readonly timestamp: Date;

  /** Overall result (aggregated across modalities) */
  readonly overall: TrialResultType;

  /** Was this trial an overall target (any modality was target) */
  readonly isTarget: boolean;

  /** Was the response correct (all modalities correct) */
  readonly isCorrect: boolean;

  /** Per-modality breakdown */
  readonly byModality: ReadonlyMap<ModalityId, ModalityVerdict>;

  /** Minimum reaction time across modalities (for speed metrics) */
  readonly minReactionTimeMs?: number;

  /** Recommended feedback actions based on the verdict */
  readonly feedbackActions: readonly FeedbackAction[];
}

// =============================================================================
// Session Summary (Judge-level)
// =============================================================================

/**
 * Aggregate counts from all trial verdicts.
 */
export interface VerdictCounts {
  readonly hits: number;
  readonly misses: number;
  readonly falseAlarms: number;
  readonly correctRejections: number;
  readonly total: number;
}

/**
 * Per-modality summary statistics.
 */
export interface ModalitySummary {
  readonly modalityId: ModalityId;
  readonly counts: VerdictCounts;
  readonly hitRate: number;
  readonly falseAlarmRate: number;
  readonly dPrime: number;
  readonly avgReactionTimeMs: number | null;
  readonly reactionTimes: readonly number[];
}

/**
 * Complete judge summary for a session.
 * This is what the Judge produces after evaluating all trials.
 */
export interface JudgeSummary {
  /** Per-modality summaries */
  readonly byModality: ReadonlyMap<ModalityId, ModalitySummary>;

  /** Aggregate d' (average or min across modalities) */
  readonly aggregateDPrime: number;

  /** Whether the session passed the threshold */
  readonly passed: boolean;

  /** Score used for comparison (varies by strategy) */
  readonly score: number;

  /** Optional: Recommendation for N-level adjustment */
  readonly nLevelRecommendation?: 'up' | 'down' | 'maintain';

  /** All trial verdicts for detailed analysis */
  readonly verdicts: readonly TrialVerdict[];
}

// =============================================================================
// Feedback Configuration
// =============================================================================

/**
 * Configurable feedback reaction for a result type.
 * Can be specified in ModeSpec to customize feedback behavior.
 */
export interface FeedbackReaction {
  readonly on: TrialResultType;
  readonly sound: SoundFeedback;
  readonly visual: VisualFeedback;
  readonly haptic?: boolean;
}

/**
 * Default feedback reactions for SDT-based modes.
 */
export const DEFAULT_SDT_FEEDBACK: readonly FeedbackReaction[] = [
  { on: 'hit', sound: 'correct', visual: 'flash-green' },
  { on: 'miss', sound: 'none', visual: 'none' },
  { on: 'false-alarm', sound: 'incorrect', visual: 'flash-red' },
  { on: 'correct-rejection', sound: 'none', visual: 'none' },
];
