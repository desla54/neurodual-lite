/**
 * ModalityEvaluator Plugin
 *
 * Evaluates response correctness per modality.
 * Used for adaptive generator feedback.
 *
 * Data in / Data out: Pure evaluation, no side effects.
 */

import type { ModalityId } from '../../../domain';
import { getIsTarget } from '../../../domain/modality';
import type {
  ModalityEvalInput,
  ModalityFeedbackResult,
  ModalityEvalResult,
  ModalityEvaluator,
} from './types';

/**
 * Default ModalityEvaluator implementation.
 */
export class DefaultModalityEvaluator implements ModalityEvaluator {
  /**
   * Evaluate response correctness per modality.
   *
   * For each active modality:
   * - wasTarget: was this modality a target in this trial?
   * - isCorrect: did the user respond correctly (pressed if target, not pressed if not target)?
   * - reactionTime: RT if responded
   */
  evaluate(input: ModalityEvalInput): ModalityEvalResult {
    const { trial, responses, activeModalities } = input;

    const byModality: Record<string, ModalityFeedbackResult> = {};
    let isAnyTarget = false;
    let isCorrect = true;
    let minReactionTime: number | undefined;

    for (const modalityId of activeModalities) {
      const wasTarget = getIsTarget(trial, modalityId as ModalityId);
      const response = responses.get(modalityId as ModalityId);
      const pressed = response?.pressed ?? false;
      const modalityCorrect = wasTarget === pressed;
      const rt = response?.rt ?? undefined;

      byModality[modalityId] = {
        wasTarget,
        isCorrect: modalityCorrect,
        reactionTime: rt,
      };

      isAnyTarget = isAnyTarget || wasTarget;
      isCorrect = isCorrect && modalityCorrect;

      if (typeof rt === 'number' && Number.isFinite(rt)) {
        minReactionTime = minReactionTime === undefined ? rt : Math.min(minReactionTime, rt);
      }
    }

    return {
      byModality,
      isAnyTarget,
      isCorrect,
      minReactionTime,
    };
  }
}
