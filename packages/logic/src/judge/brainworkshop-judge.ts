/**
 * BrainWorkshopJudge - Brain Workshop v5.0 scoring judge
 *
 * Uses the Brain Workshop v5.0 scoring formula instead of SDT d' for pass/fail:
 *   score = hits / (hits + misses + falseAlarms)
 *
 * Thresholds:
 *   - Pass: score >= 0.8
 *   - Strike: score < 0.5
 *
 * Extends SDTJudge to reuse trial-level evaluation (hits/misses/FA/CR).
 * Only overrides summarize() for BW-specific scoring.
 */

import type { ModalityId } from '../types/core';
import { SDTJudge } from './sdt-judge';
import type { EvaluationContext } from './trial-judge';
import type { JudgeSummary, ModalitySummary, VerdictCounts } from './verdict';

// =============================================================================
// Brain Workshop Score Calculator
// =============================================================================

/**
 * Calculate the Brain Workshop v5.0 score (normalized 0..1).
 *
 * Formula:
 *   score = hits / (hits + misses + falseAlarms)
 *
 * IMPORTANT: Correct Rejections are IGNORED (faithful to BW v5.0).
 */
function calculateBWScore(counts: VerdictCounts): number {
  const { hits, misses, falseAlarms } = counts;
  const denominator = hits + misses + falseAlarms;

  if (denominator === 0) return 0;

  return hits / denominator;
}

// =============================================================================
// BrainWorkshopJudge Implementation
// =============================================================================

export class BrainWorkshopJudge extends SDTJudge {
  /**
   * Summarize the session using Brain Workshop v5.0 scoring.
   *
   * Overrides SDTJudge.summarize() to:
   * 1. Calculate BW score instead of d'
   * 2. Use BW thresholds from the spec/context for pass/strike decisions
   * 3. Store the BW score in `score` field (aggregateDPrime kept for compatibility)
   */
  override summarize(context: EvaluationContext): JudgeSummary {
    const byModality = new Map<ModalityId, ModalitySummary>();
    const verdicts = this.getVerdicts();

    // Aggregate counts across all modalities
    let totalHits = 0;
    let totalMisses = 0;
    let totalFalseAlarms = 0;
    let totalCorrectRejections = 0;

    for (const modalityId of context.activeModalities) {
      const counts = this.countForModalityBW(modalityId, verdicts);
      const reactionTimes = this.getReactionTimesForModalityBW(modalityId, verdicts);

      // Accumulate totals
      totalHits += counts.hits;
      totalMisses += counts.misses;
      totalFalseAlarms += counts.falseAlarms;
      totalCorrectRejections += counts.correctRejections;

      // Calculate per-modality BW score
      const modalityBWScore = calculateBWScore(counts);

      // SDT rates for UI display (optional)
      const signalTrials = counts.hits + counts.misses;
      const noiseTrials = counts.falseAlarms + counts.correctRejections;
      const hitRate = signalTrials > 0 ? counts.hits / signalTrials : 0;
      const falseAlarmRate = noiseTrials > 0 ? counts.falseAlarms / noiseTrials : 0;

      const avgReactionTimeMs =
        reactionTimes.length > 0
          ? reactionTimes.reduce((a, b) => a + b, 0) / reactionTimes.length
          : null;

      byModality.set(modalityId, {
        modalityId,
        counts,
        hitRate,
        falseAlarmRate,
        dPrime: modalityBWScore, // Store BW score in dPrime field for per-modality display
        avgReactionTimeMs,
        reactionTimes,
      });
    }

    // Calculate aggregate BW score
    const totalCounts: VerdictCounts = {
      hits: totalHits,
      misses: totalMisses,
      falseAlarms: totalFalseAlarms,
      correctRejections: totalCorrectRejections,
      total: totalHits + totalMisses + totalFalseAlarms + totalCorrectRejections,
    };

    const aggregateBWScore = calculateBWScore(totalCounts);

    // Determine pass/fail using BW thresholds (from spec/context)
    const passed = aggregateBWScore >= context.passThreshold;

    // Determine N-level recommendation
    let nLevelRecommendation: 'up' | 'down' | 'maintain';
    if (passed) {
      nLevelRecommendation = 'up';
    } else if (context.downThreshold !== undefined && aggregateBWScore < context.downThreshold) {
      nLevelRecommendation = 'down';
    } else {
      nLevelRecommendation = 'maintain';
    }

    return {
      byModality,
      aggregateDPrime: aggregateBWScore, // BW score stored here for compatibility
      passed,
      score: aggregateBWScore, // Native BW score (normalized 0..1)
      nLevelRecommendation,
      verdicts: [...verdicts],
    };
  }

  // -------------------------------------------------------------------------
  // Private Helper Methods
  // -------------------------------------------------------------------------

  /**
   * Count verdicts for a specific modality.
   */
  private countForModalityBW(
    modalityId: ModalityId,
    verdicts: readonly import('./verdict').TrialVerdict[],
  ): VerdictCounts {
    let hits = 0;
    let misses = 0;
    let falseAlarms = 0;
    let correctRejections = 0;

    for (const verdict of verdicts) {
      const modalityVerdict = verdict.byModality.get(modalityId);
      if (!modalityVerdict) continue;

      switch (modalityVerdict.result) {
        case 'hit':
          hits++;
          break;
        case 'miss':
          misses++;
          break;
        case 'false-alarm':
          falseAlarms++;
          break;
        case 'correct-rejection':
          correctRejections++;
          break;
      }
    }

    return {
      hits,
      misses,
      falseAlarms,
      correctRejections,
      total: hits + misses + falseAlarms + correctRejections,
    };
  }

  /**
   * Get reaction times for a specific modality.
   */
  private getReactionTimesForModalityBW(
    modalityId: ModalityId,
    verdicts: readonly import('./verdict').TrialVerdict[],
  ): number[] {
    const reactionTimes: number[] = [];

    for (const verdict of verdicts) {
      const modalityVerdict = verdict.byModality.get(modalityId);
      if (modalityVerdict?.reactionTimeMs !== undefined) {
        reactionTimes.push(modalityVerdict.reactionTimeMs);
      }
    }

    return reactionTimes;
  }
}
