/**
 * WindowEvaluator Plugin
 *
 * Evaluates window completion and builds feedback for adaptive algorithm.
 *
 * PURE: Data in / Data out. No side effects.
 * - Does NOT call generator.generateNext() (that's the machine's job)
 * - Does NOT read from generator (params passed as data)
 * - Only builds feedback from trial data
 */

import type { TrialFeedback } from '../../../types/adaptive';
import { ACCURACY_PASS_NORMALIZED } from '../../../specs/thresholds';
import type { WindowEvaluator, WindowEvalInput, WindowEvalResult } from './types';

/**
 * Default WindowEvaluator implementation.
 * Pure function: builds feedback from trial data.
 */
export class DefaultWindowEvaluator implements WindowEvaluator {
  evaluate(input: WindowEvalInput): WindowEvalResult {
    const { trialIndex, trials, recallDurationMs, windowAccuracy } = input;

    // Build feedback for adaptive algorithm
    const currentTrial = trials[trialIndex];
    const isTarget =
      currentTrial?.isPositionTarget ||
      currentTrial?.isSoundTarget ||
      currentTrial?.isColorTarget ||
      false;

    const feedback: TrialFeedback = {
      isTarget,
      isCorrect: windowAccuracy >= ACCURACY_PASS_NORMALIZED,
      reactionTime: recallDurationMs,
    };

    return { feedback };
  }
}
