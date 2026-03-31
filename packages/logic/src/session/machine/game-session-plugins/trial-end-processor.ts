/**
 * TrialEndProcessor Plugin
 *
 * Processes end of trial:
 * - Evaluates verdict via judge
 * - Builds generator feedback
 * - Determines audio feedback sounds
 *
 * Data in / Data out: Returns results for machine to orchestrate.
 */

import type { ModalityId } from '../../../domain';
import type { TrialVerdict, TrialJudge } from '../../../judge';
import type { TrialFeedback } from '../../../types';
import type {
  TrialEndInput,
  TrialEndResult,
  TrialEndProcessor,
  AudioPolicy,
  ModalityEvaluator,
} from './types';
import { DefaultModalityEvaluator } from './modality-evaluator';
import { DefaultAudioPolicy } from './audio-policy';

export interface TrialEndProcessorConfig {
  readonly audioPolicy: AudioPolicy;
  readonly modalityEvaluator: ModalityEvaluator;
}

/**
 * Default TrialEndProcessor implementation.
 */
export class DefaultTrialEndProcessor implements TrialEndProcessor {
  private readonly audioPolicy: AudioPolicy;
  private readonly modalityEvaluator: ModalityEvaluator;

  constructor(config?: Partial<TrialEndProcessorConfig>) {
    this.audioPolicy = config?.audioPolicy ?? new DefaultAudioPolicy();
    this.modalityEvaluator = config?.modalityEvaluator ?? new DefaultModalityEvaluator();
  }

  /**
   * Process end of trial.
   *
   * Returns:
   * - verdict: from judge evaluation (if judge provided)
   * - generatorFeedback: for adaptive generator
   * - feedbackSounds: audio feedback to play
   */
  processTrial(input: TrialEndInput, judge: TrialJudge | null): TrialEndResult {
    const { trial, responses, activeModalities, passThreshold, downThreshold, scoringStrategy } =
      input;

    // 1. Evaluate with judge if available
    let verdict: TrialVerdict | null = null;

    if (judge) {
      // Build modality responses map for judge
      const modalityResponses = new Map<
        string,
        { modalityId: string; pressed: boolean; reactionTimeMs?: number }
      >();

      for (const [modalityId, record] of responses) {
        modalityResponses.set(modalityId, {
          modalityId,
          pressed: record.pressed,
          reactionTimeMs: record.rt ?? undefined,
        });
      }

      const evalContext = {
        activeModalities: [...activeModalities],
        passThreshold,
        downThreshold,
        strategy: scoringStrategy,
        feedbackReactions: undefined,
      };

      verdict = judge.evaluate(
        trial,
        { trialIndex: trial.index, responses: modalityResponses, timestamp: new Date() },
        evalContext,
      );
    }

    // 2. Get feedback sounds based on verdict
    const feedbackSounds = this.audioPolicy.getFeedbackSounds(verdict);

    // 3. Build generator feedback using modality evaluator
    const evalResult = this.modalityEvaluator.evaluate({
      trial,
      responses,
      activeModalities,
    });

    const generatorFeedback: TrialFeedback = {
      isTarget: evalResult.isAnyTarget,
      isCorrect: evalResult.isCorrect,
      reactionTime: evalResult.minReactionTime,
      byModality: evalResult.byModality as Record<
        ModalityId,
        { wasTarget: boolean; isCorrect: boolean; reactionTime?: number }
      >,
    };

    return {
      verdict,
      generatorFeedback,
      feedbackSounds,
    };
  }
}
