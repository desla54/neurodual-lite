import { describe, expect, it } from 'bun:test';
import { DefaultTrialEndProcessor } from './trial-end-processor';
import type { ModalityId, Trial, ResponseRecord } from '../../../domain';
import type { TrialVerdict, TrialJudge } from '../../../judge';
import type { AudioPolicy, ModalityEvaluator, TrialEndInput, ModalityEvalResult } from './types';

describe('DefaultTrialEndProcessor', () => {
  function createTrial(overrides: Partial<Trial> = {}): Trial {
    return {
      index: 5,
      isBuffer: false,
      position: 0,
      sound: 0,
      color: 0,
      image: 0,
      trialType: 'filler',
      isPositionTarget: false,
      isSoundTarget: false,
      isColorTarget: false,
      isImageTarget: false,
      ...overrides,
    } as Trial;
  }

  function makeResponses(
    entries: Array<[string, { pressed: boolean; rt: number | null }]>,
  ): Map<ModalityId, ResponseRecord> {
    return new Map(entries as Array<[ModalityId, ResponseRecord]>);
  }

  function createInput(overrides: Partial<TrialEndInput> = {}): TrialEndInput {
    return {
      trial: createTrial(),
      responses: makeResponses([['position', { pressed: true, rt: 300 }]]),
      activeModalities: ['position'],
      passThreshold: 0.8,
      downThreshold: 0.5,
      scoringStrategy: 'sdt',
      ...overrides,
    };
  }

  // Stub AudioPolicy
  function createAudioPolicy(sounds: ReadonlyArray<'correct' | 'incorrect'> = []): AudioPolicy {
    return {
      isAudioFeedbackEnabled: () => sounds.length > 0,
      getFeedbackSounds: () => sounds,
    };
  }

  // Stub ModalityEvaluator
  function createModalityEvaluator(result?: Partial<ModalityEvalResult>): ModalityEvaluator {
    const defaults: ModalityEvalResult = {
      byModality: {
        position: { wasTarget: false, isCorrect: true, reactionTime: undefined },
      },
      isAnyTarget: false,
      isCorrect: true,
      minReactionTime: undefined,
      ...result,
    };
    return {
      evaluate: () => defaults,
    };
  }

  // Stub TrialJudge
  function createJudge(verdict: TrialVerdict): TrialJudge {
    return {
      evaluate: () => verdict,
      record: () => {},
      summarize: () => ({}) as any,
    } as unknown as TrialJudge;
  }

  function createVerdict(overrides: Partial<TrialVerdict> = {}): TrialVerdict {
    return {
      trialIndex: 5,
      timestamp: new Date(),
      overall: 'correct_rejection',
      isTarget: false,
      isCorrect: true,
      byModality: new Map(),
      feedbackActions: [],
      ...overrides,
    } as TrialVerdict;
  }

  describe('processTrial without judge', () => {
    it('should return null verdict when no judge provided', () => {
      const processor = new DefaultTrialEndProcessor({
        audioPolicy: createAudioPolicy(),
        modalityEvaluator: createModalityEvaluator(),
      });

      const result = processor.processTrial(createInput(), null);

      expect(result.verdict).toBeNull();
    });

    it('should still compute generator feedback without judge', () => {
      const processor = new DefaultTrialEndProcessor({
        audioPolicy: createAudioPolicy(),
        modalityEvaluator: createModalityEvaluator({
          isAnyTarget: true,
          isCorrect: true,
          minReactionTime: 300,
          byModality: {
            position: { wasTarget: true, isCorrect: true, reactionTime: 300 },
          },
        }),
      });

      const result = processor.processTrial(createInput(), null);

      expect(result.generatorFeedback).not.toBeNull();
      expect(result.generatorFeedback!.isTarget).toBe(true);
      expect(result.generatorFeedback!.isCorrect).toBe(true);
      expect(result.generatorFeedback!.reactionTime).toBe(300);
    });

    it('should return feedback sounds from audio policy', () => {
      const processor = new DefaultTrialEndProcessor({
        audioPolicy: createAudioPolicy(['correct']),
        modalityEvaluator: createModalityEvaluator(),
      });

      const result = processor.processTrial(createInput(), null);

      expect(result.feedbackSounds).toEqual(['correct']);
    });
  });

  describe('processTrial with judge', () => {
    it('should return verdict from judge', () => {
      const verdict = createVerdict({ isCorrect: true, isTarget: true });
      const processor = new DefaultTrialEndProcessor({
        audioPolicy: createAudioPolicy(),
        modalityEvaluator: createModalityEvaluator(),
      });

      const result = processor.processTrial(createInput(), createJudge(verdict));

      expect(result.verdict).toBe(verdict);
    });

    it('should pass trial and responses to judge.evaluate', () => {
      const trial = createTrial({ index: 7, isPositionTarget: true });
      const responses = makeResponses([['position', { pressed: true, rt: 250 }]]);
      let capturedTrial: Trial | null = null;
      let capturedResponse: any = null;
      let capturedContext: any = null;

      const judge: TrialJudge = {
        evaluate: (t: any, r: any, c: any) => {
          capturedTrial = t;
          capturedResponse = r;
          capturedContext = c;
          return createVerdict();
        },
        record: () => {},
        summarize: () => ({}) as any,
      } as unknown as TrialJudge;

      const processor = new DefaultTrialEndProcessor({
        audioPolicy: createAudioPolicy(),
        modalityEvaluator: createModalityEvaluator(),
      });

      processor.processTrial(
        createInput({
          trial,
          responses,
          activeModalities: ['position'],
          passThreshold: 0.75,
          downThreshold: 0.4,
          scoringStrategy: 'accuracy',
        }),
        judge,
      );

      expect(capturedTrial).toBe(trial as any);
      expect(capturedResponse.trialIndex).toBe(7);
      expect(capturedResponse.responses.get('position')).toEqual({
        modalityId: 'position',
        pressed: true,
        reactionTimeMs: 250,
      });
      expect(capturedContext.passThreshold).toBe(0.75);
      expect(capturedContext.downThreshold).toBe(0.4);
      expect(capturedContext.strategy).toBe('accuracy');
      expect(capturedContext.activeModalities).toEqual(['position']);
    });

    it('should convert null rt to undefined for judge', () => {
      let capturedResponse: any = null;
      const judge: TrialJudge = {
        evaluate: (_t: any, r: any, _c: any) => {
          capturedResponse = r;
          return createVerdict();
        },
        record: () => {},
        summarize: () => ({}) as any,
      } as unknown as TrialJudge;

      const processor = new DefaultTrialEndProcessor({
        audioPolicy: createAudioPolicy(),
        modalityEvaluator: createModalityEvaluator(),
      });

      processor.processTrial(
        createInput({
          responses: makeResponses([['position', { pressed: false, rt: null }]]),
        }),
        judge,
      );

      expect(capturedResponse.responses.get('position').reactionTimeMs).toBeUndefined();
    });
  });

  describe('generator feedback structure', () => {
    it('should map modality evaluator result to TrialFeedback', () => {
      const processor = new DefaultTrialEndProcessor({
        audioPolicy: createAudioPolicy(),
        modalityEvaluator: createModalityEvaluator({
          isAnyTarget: false,
          isCorrect: true,
          minReactionTime: undefined,
          byModality: {
            position: { wasTarget: false, isCorrect: true, reactionTime: undefined },
            audio: { wasTarget: false, isCorrect: true, reactionTime: undefined },
          },
        }),
      });

      const result = processor.processTrial(createInput(), null);

      expect(result.generatorFeedback).toEqual({
        isTarget: false,
        isCorrect: true,
        reactionTime: undefined,
        byModality: {
          position: { wasTarget: false, isCorrect: true, reactionTime: undefined },
          audio: { wasTarget: false, isCorrect: true, reactionTime: undefined },
        },
      });
    });

    it('should include reaction time in feedback when present', () => {
      const processor = new DefaultTrialEndProcessor({
        audioPolicy: createAudioPolicy(),
        modalityEvaluator: createModalityEvaluator({
          isAnyTarget: true,
          isCorrect: true,
          minReactionTime: 250,
          byModality: {
            position: { wasTarget: true, isCorrect: true, reactionTime: 250 },
          },
        }),
      });

      const result = processor.processTrial(createInput(), null);

      expect(result.generatorFeedback!.reactionTime).toBe(250);
    });
  });

  describe('default plugins', () => {
    it('should work with default plugins when no config provided', () => {
      const processor = new DefaultTrialEndProcessor();
      const trial = createTrial({ isPositionTarget: true });
      const responses = makeResponses([['position', { pressed: true, rt: 300 }]]);

      const result = processor.processTrial(
        createInput({ trial, responses, activeModalities: ['position'] }),
        null,
      );

      // Should not throw, and should produce valid feedback
      expect(result.verdict).toBeNull();
      expect(result.generatorFeedback).not.toBeNull();
      expect(result.generatorFeedback!.isTarget).toBe(true);
      expect(result.generatorFeedback!.isCorrect).toBe(true);
    });
  });

  describe('audio feedback with verdict', () => {
    it('should pass verdict to audio policy for sound decisions', () => {
      const verdict = createVerdict({
        feedbackActions: [{ sound: 'correct' }],
      });
      let capturedVerdict: TrialVerdict | null = null;

      const audioPolicy: AudioPolicy = {
        isAudioFeedbackEnabled: () => true,
        getFeedbackSounds: (v) => {
          capturedVerdict = v;
          return ['correct'];
        },
      };

      const processor = new DefaultTrialEndProcessor({
        audioPolicy,
        modalityEvaluator: createModalityEvaluator(),
      });

      processor.processTrial(createInput(), createJudge(verdict));

      expect(capturedVerdict).toBe(verdict as any);
    });

    it('should return empty sounds when audio disabled', () => {
      const processor = new DefaultTrialEndProcessor({
        audioPolicy: createAudioPolicy([]),
        modalityEvaluator: createModalityEvaluator(),
      });

      const result = processor.processTrial(createInput(), null);

      expect(result.feedbackSounds).toEqual([]);
    });

    it('should return incorrect sounds when verdict incorrect', () => {
      const processor = new DefaultTrialEndProcessor({
        audioPolicy: createAudioPolicy(['incorrect']),
        modalityEvaluator: createModalityEvaluator(),
      });

      const result = processor.processTrial(createInput(), null);

      expect(result.feedbackSounds).toEqual(['incorrect']);
    });
  });
});
