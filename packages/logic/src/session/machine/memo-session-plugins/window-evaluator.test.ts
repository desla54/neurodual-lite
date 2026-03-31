import { describe, expect, it } from 'bun:test';
import { DefaultWindowEvaluator } from './window-evaluator';
import type { WindowEvalInput } from './types';
import type { Trial } from '../../../types/core';
import { ACCURACY_PASS_NORMALIZED } from '../../../specs/thresholds';

describe('DefaultWindowEvaluator', () => {
  const evaluator = new DefaultWindowEvaluator();

  // Helper to create a trial
  function createTrial(overrides: Partial<Trial> = {}): Trial {
    return {
      index: 0,
      position: 1,
      // @ts-expect-error test override
      sound: 'A',
      // @ts-expect-error test override
      color: 'red',
      isBuffer: false,
      trialType: 'Non-Cible',
      isPositionTarget: false,
      isSoundTarget: false,
      isColorTarget: false,
      ...overrides,
    };
  }

  describe('evaluate', () => {
    it('should mark as correct when accuracy meets threshold', () => {
      const input: WindowEvalInput = {
        trialIndex: 2,
        trials: [createTrial({ index: 0 }), createTrial({ index: 1 }), createTrial({ index: 2 })],
        recallDurationMs: 1500,
        windowAccuracy: ACCURACY_PASS_NORMALIZED, // Exactly at threshold
      };

      const result = evaluator.evaluate(input);

      expect(result.feedback.isCorrect).toBe(true);
      expect(result.feedback.reactionTime).toBe(1500);
    });

    it('should mark as incorrect when accuracy below threshold', () => {
      const input: WindowEvalInput = {
        trialIndex: 2,
        trials: [createTrial({ index: 0 }), createTrial({ index: 1 }), createTrial({ index: 2 })],
        recallDurationMs: 2000,
        windowAccuracy: ACCURACY_PASS_NORMALIZED - 0.01, // Just below threshold
      };

      const result = evaluator.evaluate(input);

      expect(result.feedback.isCorrect).toBe(false);
    });

    it('should mark as correct with high accuracy', () => {
      const input: WindowEvalInput = {
        trialIndex: 1,
        trials: [createTrial({ index: 0 }), createTrial({ index: 1 })],
        recallDurationMs: 800,
        windowAccuracy: 1.0, // Perfect accuracy
      };

      const result = evaluator.evaluate(input);

      expect(result.feedback.isCorrect).toBe(true);
    });

    it('should detect position target for isTarget', () => {
      const input: WindowEvalInput = {
        trialIndex: 1,
        trials: [createTrial({ index: 0 }), createTrial({ index: 1, isPositionTarget: true })],
        recallDurationMs: 1000,
        windowAccuracy: 0.9,
      };

      const result = evaluator.evaluate(input);

      expect(result.feedback.isTarget).toBe(true);
    });

    it('should detect sound target for isTarget', () => {
      const input: WindowEvalInput = {
        trialIndex: 1,
        trials: [createTrial({ index: 0 }), createTrial({ index: 1, isSoundTarget: true })],
        recallDurationMs: 1000,
        windowAccuracy: 0.9,
      };

      const result = evaluator.evaluate(input);

      expect(result.feedback.isTarget).toBe(true);
    });

    it('should detect color target for isTarget', () => {
      const input: WindowEvalInput = {
        trialIndex: 1,
        trials: [createTrial({ index: 0 }), createTrial({ index: 1, isColorTarget: true })],
        recallDurationMs: 1000,
        windowAccuracy: 0.9,
      };

      const result = evaluator.evaluate(input);

      expect(result.feedback.isTarget).toBe(true);
    });

    it('should return isTarget false when no targets', () => {
      const input: WindowEvalInput = {
        trialIndex: 1,
        trials: [
          createTrial({ index: 0 }),
          createTrial({ index: 1 }), // No targets
        ],
        recallDurationMs: 1000,
        windowAccuracy: 0.9,
      };

      const result = evaluator.evaluate(input);

      expect(result.feedback.isTarget).toBe(false);
    });

    it('should return isTarget false when trial not found', () => {
      const input: WindowEvalInput = {
        trialIndex: 5, // Out of bounds
        trials: [createTrial({ index: 0 }), createTrial({ index: 1 })],
        recallDurationMs: 1000,
        windowAccuracy: 0.9,
      };

      const result = evaluator.evaluate(input);

      expect(result.feedback.isTarget).toBe(false);
    });

    it('should include reaction time in feedback', () => {
      const input: WindowEvalInput = {
        trialIndex: 0,
        trials: [createTrial({ index: 0 })],
        recallDurationMs: 2500,
        windowAccuracy: 0.75,
      };

      const result = evaluator.evaluate(input);

      expect(result.feedback.reactionTime).toBe(2500);
    });

    it('should handle zero accuracy', () => {
      const input: WindowEvalInput = {
        trialIndex: 0,
        trials: [createTrial({ index: 0 })],
        recallDurationMs: 1000,
        windowAccuracy: 0,
      };

      const result = evaluator.evaluate(input);

      expect(result.feedback.isCorrect).toBe(false);
    });
  });
});
