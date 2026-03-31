import { describe, expect, it } from 'bun:test';
import { DefaultModalityEvaluator } from './modality-evaluator';
import type { ModalityId, Trial, ResponseRecord } from '../../../domain';

describe('DefaultModalityEvaluator', () => {
  function createTrial(overrides: Partial<Trial> = {}): Trial {
    return {
      index: 0,
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

  const evaluator = new DefaultModalityEvaluator();

  describe('single modality', () => {
    it('should detect hit (target + pressed)', () => {
      const trial = createTrial({ isPositionTarget: true });
      const responses = makeResponses([['position', { pressed: true, rt: 300 }]]);

      const result = evaluator.evaluate({
        trial,
        responses,
        activeModalities: ['position'],
      });

      expect(result.isAnyTarget).toBe(true);
      expect(result.isCorrect).toBe(true);
      expect(result.minReactionTime).toBe(300);
      expect(result.byModality.position).toEqual({
        wasTarget: true,
        isCorrect: true,
        reactionTime: 300,
      });
    });

    it('should detect miss (target + not pressed)', () => {
      const trial = createTrial({ isPositionTarget: true });
      const responses = makeResponses([['position', { pressed: false, rt: null }]]);

      const result = evaluator.evaluate({
        trial,
        responses,
        activeModalities: ['position'],
      });

      expect(result.isAnyTarget).toBe(true);
      expect(result.isCorrect).toBe(false);
      expect(result.minReactionTime).toBeUndefined();
      // @ts-expect-error test: nullable access
      expect(result!.byModality!.position.isCorrect).toBe(false);
    });

    it('should detect correct rejection (not target + not pressed)', () => {
      const trial = createTrial({ isPositionTarget: false });
      const responses = makeResponses([['position', { pressed: false, rt: null }]]);

      const result = evaluator.evaluate({
        trial,
        responses,
        activeModalities: ['position'],
      });

      expect(result.isAnyTarget).toBe(false);
      expect(result.isCorrect).toBe(true);
      expect(result.minReactionTime).toBeUndefined();
    });

    it('should detect false alarm (not target + pressed)', () => {
      const trial = createTrial({ isPositionTarget: false });
      const responses = makeResponses([['position', { pressed: true, rt: 250 }]]);

      const result = evaluator.evaluate({
        trial,
        responses,
        activeModalities: ['position'],
      });

      expect(result.isAnyTarget).toBe(false);
      expect(result.isCorrect).toBe(false);
      expect(result.minReactionTime).toBe(250);
    });
  });

  describe('dual modality', () => {
    it('should be correct only when all modalities correct', () => {
      const trial = createTrial({ isPositionTarget: true, isSoundTarget: false });
      const responses = makeResponses([
        ['position', { pressed: true, rt: 300 }],
        ['audio', { pressed: false, rt: null }],
      ]);

      const result = evaluator.evaluate({
        trial,
        responses,
        activeModalities: ['position', 'audio'],
      });

      expect(result.isAnyTarget).toBe(true);
      expect(result.isCorrect).toBe(true);
      // @ts-expect-error test: nullable access
      expect(result!.byModality!.position.isCorrect).toBe(true);
      // @ts-expect-error test: nullable access
      expect(result!.byModality!.audio.isCorrect).toBe(true);
    });

    it('should be incorrect if any modality is wrong', () => {
      const trial = createTrial({ isPositionTarget: true, isSoundTarget: true });
      const responses = makeResponses([
        ['position', { pressed: true, rt: 300 }],
        ['audio', { pressed: false, rt: null }], // missed audio target
      ]);

      const result = evaluator.evaluate({
        trial,
        responses,
        activeModalities: ['position', 'audio'],
      });

      expect(result.isAnyTarget).toBe(true);
      expect(result.isCorrect).toBe(false);
      // @ts-expect-error test: nullable access
      expect(result!.byModality!.position.isCorrect).toBe(true);
      // @ts-expect-error test: nullable access
      expect(result!.byModality!.audio.isCorrect).toBe(false);
    });

    it('should track isAnyTarget across modalities', () => {
      const trial = createTrial({ isPositionTarget: false, isSoundTarget: true });
      const responses = makeResponses([
        ['position', { pressed: false, rt: null }],
        ['audio', { pressed: true, rt: 400 }],
      ]);

      const result = evaluator.evaluate({
        trial,
        responses,
        activeModalities: ['position', 'audio'],
      });

      expect(result.isAnyTarget).toBe(true);
    });

    it('should return false for isAnyTarget when no modality is target', () => {
      const trial = createTrial({ isPositionTarget: false, isSoundTarget: false });
      const responses = makeResponses([
        ['position', { pressed: false, rt: null }],
        ['audio', { pressed: false, rt: null }],
      ]);

      const result = evaluator.evaluate({
        trial,
        responses,
        activeModalities: ['position', 'audio'],
      });

      expect(result.isAnyTarget).toBe(false);
    });
  });

  describe('reaction time tracking', () => {
    it('should return minimum RT across modalities', () => {
      const trial = createTrial({ isPositionTarget: true, isSoundTarget: true });
      const responses = makeResponses([
        ['position', { pressed: true, rt: 500 }],
        ['audio', { pressed: true, rt: 300 }],
      ]);

      const result = evaluator.evaluate({
        trial,
        responses,
        activeModalities: ['position', 'audio'],
      });

      expect(result.minReactionTime).toBe(300);
    });

    it('should ignore null RT when computing minimum', () => {
      const trial = createTrial({ isPositionTarget: true, isSoundTarget: false });
      const responses = makeResponses([
        ['position', { pressed: true, rt: 400 }],
        ['audio', { pressed: false, rt: null }],
      ]);

      const result = evaluator.evaluate({
        trial,
        responses,
        activeModalities: ['position', 'audio'],
      });

      expect(result.minReactionTime).toBe(400);
    });

    it('should return undefined when no responses have RT', () => {
      const trial = createTrial({ isPositionTarget: false, isSoundTarget: false });
      const responses = makeResponses([
        ['position', { pressed: false, rt: null }],
        ['audio', { pressed: false, rt: null }],
      ]);

      const result = evaluator.evaluate({
        trial,
        responses,
        activeModalities: ['position', 'audio'],
      });

      expect(result.minReactionTime).toBeUndefined();
    });

    it('should handle NaN RT gracefully', () => {
      const trial = createTrial({ isPositionTarget: true });
      const responses = makeResponses([['position', { pressed: true, rt: NaN }]]);

      const result = evaluator.evaluate({
        trial,
        responses,
        activeModalities: ['position'],
      });

      // NaN is not finite, so should be excluded
      expect(result.minReactionTime).toBeUndefined();
    });

    it('should handle Infinity RT gracefully', () => {
      const trial = createTrial({ isPositionTarget: true });
      const responses = makeResponses([['position', { pressed: true, rt: Infinity }]]);

      const result = evaluator.evaluate({
        trial,
        responses,
        activeModalities: ['position'],
      });

      expect(result.minReactionTime).toBeUndefined();
    });
  });

  describe('missing responses', () => {
    it('should treat missing response as not pressed', () => {
      const trial = createTrial({ isPositionTarget: false });
      const responses = new Map<ModalityId, ResponseRecord>();

      const result = evaluator.evaluate({
        trial,
        responses,
        activeModalities: ['position'],
      });

      // not pressed + not target = correct rejection
      expect(result.isCorrect).toBe(true);
      // @ts-expect-error test: nullable access
      expect(result!.byModality!.position.isCorrect).toBe(true);
      // @ts-expect-error test: nullable access
      expect(result!.byModality!.position.wasTarget).toBe(false);
    });

    it('should mark missing response for target as incorrect', () => {
      const trial = createTrial({ isPositionTarget: true });
      const responses = new Map<ModalityId, ResponseRecord>();

      const result = evaluator.evaluate({
        trial,
        responses,
        activeModalities: ['position'],
      });

      expect(result.isCorrect).toBe(false);
      // @ts-expect-error test: nullable access
      expect(result!.byModality!.position.isCorrect).toBe(false);
    });
  });
});
