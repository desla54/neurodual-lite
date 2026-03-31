/**
 * AccuracyJudge - Simple Accuracy-based Judge
 *
 * Evaluates trials using simple accuracy (correct / total).
 * Used by: PlaceSession, DualPickSession, MemoSession
 *
 * Unlike SDTJudge, this doesn't use Signal Detection Theory.
 * It simply counts correct vs incorrect placements.
 */

import type { ModalityId, Trial } from '../types/core';
import type { EvaluationContext, TrialJudge, TrialResponse } from './trial-judge';
import type {
  FeedbackAction,
  JudgeSummary,
  ModalitySummary,
  ModalityVerdict,
  TrialResultType,
  TrialVerdict,
  VerdictCounts,
} from './verdict';

// =============================================================================
// Accuracy Feedback (simpler than SDT)
// =============================================================================

const ACCURACY_FEEDBACK: Record<'correct' | 'incorrect', FeedbackAction[]> = {
  correct: [{ visual: 'flash-green', sound: 'correct' }],
  incorrect: [{ visual: 'flash-red', sound: 'incorrect' }],
};

// =============================================================================
// AccuracyJudge Implementation
// =============================================================================

export class AccuracyJudge implements TrialJudge {
  private verdicts: TrialVerdict[] = [];

  // -------------------------------------------------------------------------
  // TrialJudge Interface
  // -------------------------------------------------------------------------

  evaluate(trial: Trial, response: TrialResponse, context: EvaluationContext): TrialVerdict {
    const byModality = new Map<ModalityId, ModalityVerdict>();
    let isAllCorrect = true;
    let minReactionTimeMs: number | undefined;

    for (const modalityId of context.activeModalities) {
      const modalityResponse = response.responses.get(modalityId);
      const hadResponse = modalityResponse?.pressed ?? false;
      const reactionTimeMs = modalityResponse?.reactionTimeMs;

      // For accuracy-based modes, we consider "correct" as a hit
      // and "incorrect" as a miss (simplified model)
      const result: TrialResultType = hadResponse ? 'hit' : 'miss';
      const isCorrect = hadResponse;

      isAllCorrect = isAllCorrect && isCorrect;

      if (reactionTimeMs !== undefined && Number.isFinite(reactionTimeMs)) {
        minReactionTimeMs =
          minReactionTimeMs === undefined
            ? reactionTimeMs
            : Math.min(minReactionTimeMs, reactionTimeMs);
      }

      byModality.set(modalityId, {
        modalityId,
        result,
        reactionTimeMs,
        wasTarget: true, // In accuracy mode, every trial is a "target" (something to get right)
        hadResponse,
      });
    }

    const overall: TrialResultType = isAllCorrect ? 'hit' : 'miss';
    const feedbackActions = isAllCorrect ? ACCURACY_FEEDBACK.correct : ACCURACY_FEEDBACK.incorrect;

    return {
      trialIndex: trial.index,
      timestamp: response.timestamp,
      overall,
      isTarget: true,
      isCorrect: isAllCorrect,
      byModality,
      minReactionTimeMs,
      feedbackActions,
    };
  }

  record(verdict: TrialVerdict): void {
    this.verdicts.push(verdict);
  }

  summarize(context: EvaluationContext): JudgeSummary {
    const byModality = new Map<ModalityId, ModalitySummary>();

    for (const modalityId of context.activeModalities) {
      const counts = this.countForModality(modalityId);
      const reactionTimes = this.getReactionTimesForModality(modalityId);

      const total = counts.hits + counts.misses;
      const accuracy = total > 0 ? counts.hits / total : 0;

      const avgReactionTimeMs =
        reactionTimes.length > 0
          ? reactionTimes.reduce((a, b) => a + b, 0) / reactionTimes.length
          : null;

      byModality.set(modalityId, {
        modalityId,
        counts,
        hitRate: accuracy,
        falseAlarmRate: 0, // Not used in accuracy mode
        dPrime: 0, // Not used in accuracy mode
        avgReactionTimeMs,
        reactionTimes,
      });
    }

    // Calculate overall accuracy
    const totalCorrect = this.verdicts.filter((v) => v.isCorrect).length;
    const totalTrials = this.verdicts.length;
    const overallAccuracy = totalTrials > 0 ? totalCorrect / totalTrials : 0;

    // Score is percentage (0-100 scale)
    const score = overallAccuracy * 100;
    const passed = score >= context.passThreshold;

    // Determine N-level recommendation
    let nLevelRecommendation: 'up' | 'down' | 'maintain' | undefined;
    if (passed) {
      nLevelRecommendation = 'up';
    } else if (context.downThreshold !== undefined && score < context.downThreshold) {
      nLevelRecommendation = 'down';
    } else {
      nLevelRecommendation = 'maintain';
    }

    return {
      byModality,
      aggregateDPrime: 0, // Not used in accuracy mode
      passed,
      score,
      nLevelRecommendation,
      verdicts: [...this.verdicts],
    };
  }

  reset(): void {
    this.verdicts = [];
  }

  getVerdicts(): readonly TrialVerdict[] {
    return this.verdicts;
  }

  // -------------------------------------------------------------------------
  // Private Helpers
  // -------------------------------------------------------------------------

  private countForModality(modalityId: ModalityId): VerdictCounts {
    let hits = 0;
    let misses = 0;

    for (const verdict of this.verdicts) {
      const modalityVerdict = verdict.byModality.get(modalityId);
      if (!modalityVerdict) continue;

      if (modalityVerdict.result === 'hit') {
        hits++;
      } else {
        misses++;
      }
    }

    return {
      hits,
      misses,
      falseAlarms: 0,
      correctRejections: 0,
      total: hits + misses,
    };
  }

  private getReactionTimesForModality(modalityId: ModalityId): number[] {
    const reactionTimes: number[] = [];

    for (const verdict of this.verdicts) {
      const modalityVerdict = verdict.byModality.get(modalityId);
      if (modalityVerdict?.reactionTimeMs !== undefined) {
        reactionTimes.push(modalityVerdict.reactionTimeMs);
      }
    }

    return reactionTimes;
  }
}
