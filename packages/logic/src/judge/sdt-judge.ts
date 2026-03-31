/**
 * SDTJudge - Signal Detection Theory Judge
 *
 * Evaluates trials using SDT metrics (hits, misses, false alarms, correct rejections).
 * Computes d' (d-prime) for sensitivity measurement.
 *
 * Used by: DualCatch, SimJaeggi, SimBrainWorkshop, Custom modes.
 */

import { getIsTarget as getIsTargetFromAdapter } from '../domain/modality';
import type { ModalityId, Trial } from '../types/core';
import type { EvaluationContext, TrialJudge, TrialResponse } from './trial-judge';
import {
  DEFAULT_SDT_FEEDBACK,
  type FeedbackAction,
  type JudgeSummary,
  type ModalitySummary,
  type ModalityVerdict,
  type TrialResultType,
  type TrialVerdict,
  type VerdictCounts,
} from './verdict';

// =============================================================================
// SDT Calculator (Pure Functions)
// =============================================================================

/**
 * Probit function - inverse CDF of normal distribution.
 * Uses Abramowitz & Stegun approximation.
 */
function probit(p: number): number {
  if (Number.isNaN(p) || !Number.isFinite(p)) return 0;
  if (p <= 1e-10) return -5;
  if (p >= 1 - 1e-10) return 5;

  const a1 = -3.969683028665376e1;
  const a2 = 2.209460984245205e2;
  const a3 = -2.759285104469687e2;
  const a4 = 1.38357751867269e2;
  const a5 = -3.066479806614716e1;
  const a6 = 2.506628277459239;

  const b1 = -5.447609879822406e1;
  const b2 = 1.615858368580409e2;
  const b3 = -1.556989798598866e2;
  const b4 = 6.680131188771972e1;
  const b5 = -1.328068155288572e1;

  const c1 = -7.784894002430293e-3;
  const c2 = -3.223964580411365e-1;
  const c3 = -2.400758277161838;
  const c4 = -2.549732539343734;
  const c5 = 4.374664141464968;
  const c6 = 2.938163982698783;

  const d1 = 7.784695709041462e-3;
  const d2 = 3.224671290700398e-1;
  const d3 = 2.445134137142996;
  const d4 = 3.754408661907416;

  const pLow = 0.02425;
  const pHigh = 1 - pLow;

  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    const z =
      (((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6) /
      ((((d1 * q + d2) * q + d3) * q + d4) * q + 1);
    return Math.max(-5, Math.min(5, z));
  }

  if (p <= pHigh) {
    const q = p - 0.5;
    const r = q * q;
    const z =
      ((((((a1 * r + a2) * r + a3) * r + a4) * r + a5) * r + a6) * q) /
      (((((b1 * r + b2) * r + b3) * r + b4) * r + b5) * r + 1);
    return Math.max(-5, Math.min(5, z));
  }

  const q = Math.sqrt(-2 * Math.log(1 - p));
  const z =
    -(((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6) /
    ((((d1 * q + d2) * q + d3) * q + d4) * q + 1);
  return Math.max(-5, Math.min(5, z));
}

/**
 * Calculate d' (d-prime) with Hautus log-linear correction.
 *
 * Anti-gaming safeguards:
 * - Silence (hits=0 AND FA=0) → d' = 0
 * - Inactivity (hits=0) → d' = 0
 * - Spamming (CR=0) → d' = 0
 */
function calculateDPrime(
  hits: number,
  misses: number,
  falseAlarms: number,
  correctRejections: number,
): number {
  const signalTrials = hits + misses;
  const noiseTrials = falseAlarms + correctRejections;

  if (signalTrials === 0 || noiseTrials === 0) return 0;
  if (hits === 0) return 0;
  if (correctRejections === 0) return 0;

  const hitRate = (hits + 0.5) / (signalTrials + 1);
  const falseAlarmRate = (falseAlarms + 0.5) / (noiseTrials + 1);

  return probit(hitRate) - probit(falseAlarmRate);
}

// =============================================================================
// SDTJudge Implementation
// =============================================================================

export class SDTJudge implements TrialJudge {
  private verdicts: TrialVerdict[] = [];

  // -------------------------------------------------------------------------
  // TrialJudge Interface
  // -------------------------------------------------------------------------

  evaluate(trial: Trial, response: TrialResponse, context: EvaluationContext): TrialVerdict {
    const byModality = new Map<ModalityId, ModalityVerdict>();
    let isAnyTarget = false;
    let isAllCorrect = true;
    let minReactionTimeMs: number | undefined;

    for (const modalityId of context.activeModalities) {
      const wasTarget = getIsTargetFromAdapter(trial, modalityId);
      const modalityResponse = response.responses.get(modalityId);
      const hadResponse = modalityResponse?.pressed ?? false;
      const reactionTimeMs = modalityResponse?.reactionTimeMs;

      // Determine result type
      let result: TrialResultType;
      if (wasTarget) {
        result = hadResponse ? 'hit' : 'miss';
      } else {
        result = hadResponse ? 'false-alarm' : 'correct-rejection';
      }

      // Track correctness
      const isCorrect = result === 'hit' || result === 'correct-rejection';
      isAllCorrect = isAllCorrect && isCorrect;
      isAnyTarget = isAnyTarget || wasTarget;

      // Track min RT
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
        wasTarget,
        hadResponse,
      });
    }

    // Determine overall result
    const overall = this.determineOverallResult(byModality);

    // Build feedback actions
    const feedbackActions = this.buildFeedbackActions(overall, context);

    return {
      trialIndex: trial.index,
      timestamp: response.timestamp,
      overall,
      isTarget: isAnyTarget,
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

      const signalTrials = counts.hits + counts.misses;
      const noiseTrials = counts.falseAlarms + counts.correctRejections;

      const hitRate = signalTrials > 0 ? counts.hits / signalTrials : 0;
      const falseAlarmRate = noiseTrials > 0 ? counts.falseAlarms / noiseTrials : 0;
      const dPrime = calculateDPrime(
        counts.hits,
        counts.misses,
        counts.falseAlarms,
        counts.correctRejections,
      );

      const avgReactionTimeMs =
        reactionTimes.length > 0
          ? reactionTimes.reduce((a, b) => a + b, 0) / reactionTimes.length
          : null;

      byModality.set(modalityId, {
        modalityId,
        counts,
        hitRate,
        falseAlarmRate,
        dPrime,
        avgReactionTimeMs,
        reactionTimes,
      });
    }

    // Calculate aggregate d' based on strategy
    const dPrimes = Array.from(byModality.values()).map((s) => s.dPrime);
    let aggregateDPrime: number;
    let passed: boolean;

    if (context.strategy === 'dualnback-classic') {
      // DualnbackClassic protocol (Jaeggi 2008):
      // - globalDPrime = MIN(d' per modality) for display
      // - passed = ALL modalities have < passThreshold errors (not d-prime based)
      aggregateDPrime = dPrimes.length > 0 ? Math.min(...dPrimes) : 0;

      // Check errors per modality (passThreshold = error boundary, default 3)
      // Jaeggi 2008: "fewer than three" = errors < 3 for PASS
      passed = Array.from(byModality.values()).every((stats) => {
        const errors = stats.counts.misses + stats.counts.falseAlarms;
        return errors < context.passThreshold;
      });
    } else {
      // SDT standard: d' = AVERAGE across modalities
      aggregateDPrime =
        dPrimes.length > 0 ? dPrimes.reduce((a, b) => a + b, 0) / dPrimes.length : 0;
      passed = aggregateDPrime >= context.passThreshold;
    }

    // Determine N-level recommendation
    let nLevelRecommendation: 'up' | 'down' | 'maintain' | undefined;
    if (passed) {
      nLevelRecommendation = 'up';
    } else if (context.downThreshold !== undefined) {
      const downThreshold = context.downThreshold;
      if (context.strategy === 'dualnback-classic') {
        // Jaeggi 2008: "more than five" errors in any modality → down
        const anyAboveDown = Array.from(byModality.values()).some((stats) => {
          const errors = stats.counts.misses + stats.counts.falseAlarms;
          return errors > downThreshold;
        });
        nLevelRecommendation = anyAboveDown ? 'down' : 'maintain';
      } else {
        // SDT standard: d-prime below threshold → down
        nLevelRecommendation = aggregateDPrime < downThreshold ? 'down' : 'maintain';
      }
    } else {
      nLevelRecommendation = 'maintain';
    }

    return {
      byModality,
      aggregateDPrime,
      passed,
      score: aggregateDPrime,
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

  private determineOverallResult(
    byModality: ReadonlyMap<ModalityId, ModalityVerdict>,
  ): TrialResultType {
    const results = Array.from(byModality.values());

    // If any modality has a miss, overall is miss
    if (results.some((r) => r.result === 'miss')) {
      return 'miss';
    }

    // If any modality has a false-alarm, overall is false-alarm
    if (results.some((r) => r.result === 'false-alarm')) {
      return 'false-alarm';
    }

    // If any modality has a hit, overall is hit
    if (results.some((r) => r.result === 'hit')) {
      return 'hit';
    }

    // Otherwise, correct-rejection
    return 'correct-rejection';
  }

  private buildFeedbackActions(
    result: TrialResultType,
    context: EvaluationContext,
  ): FeedbackAction[] {
    const reactions = context.feedbackReactions ?? DEFAULT_SDT_FEEDBACK;
    const reaction = reactions.find((r) => r.on === result);

    if (!reaction) return [];

    const action: FeedbackAction = {
      visual: reaction.visual,
      sound: reaction.sound,
      haptic: reaction.haptic,
    };

    // Don't include action if both are 'none'
    if (action.visual === 'none' && action.sound === 'none' && !action.haptic) {
      return [];
    }

    return [action];
  }

  private countForModality(modalityId: ModalityId): VerdictCounts {
    let hits = 0;
    let misses = 0;
    let falseAlarms = 0;
    let correctRejections = 0;

    for (const verdict of this.verdicts) {
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
