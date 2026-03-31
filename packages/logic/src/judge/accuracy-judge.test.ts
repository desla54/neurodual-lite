/**
 * Tests for AccuracyJudge
 */

import { describe, expect, test, beforeEach } from 'bun:test';
import { AccuracyJudge } from './accuracy-judge';
import type { Trial, ModalityId } from '../types/core';
import type { TrialResponse, EvaluationContext } from './trial-judge';

describe('AccuracyJudge', () => {
  let judge: AccuracyJudge;
  const activeModalities: ModalityId[] = ['position', 'audio'];
  const context: EvaluationContext = {
    activeModalities,
    passThreshold: 80,
    downThreshold: 50,
    // @ts-expect-error test override
    nLevel: 2,
  };

  beforeEach(() => {
    judge = new AccuracyJudge();
  });

  describe('evaluate()', () => {
    test('should return correct hit verdict when all modalities respond', () => {
      const trial: Trial = { index: 0 } as any;
      const response: TrialResponse = {
        trialIndex: 0,
        // @ts-expect-error test override
        timestamp: 1000,
        // @ts-expect-error test override
        responses: new Map([
          ['position', { pressed: true, reactionTimeMs: 300 }],
          ['audio', { pressed: true, reactionTimeMs: 400 }],
        ]),
      };

      const verdict = judge.evaluate(trial, response, context);

      expect(verdict.isCorrect).toBe(true);
      expect(verdict.overall).toBe('hit');
      expect(verdict.minReactionTimeMs).toBe(300);
      // @ts-expect-error test: nullable access
      expect(verdict!.feedbackActions[0].visual).toBe('flash-green');
    });

    test('should return miss verdict when any modality is missing response', () => {
      const trial: Trial = { index: 0 } as any;
      const response: TrialResponse = {
        trialIndex: 0,
        // @ts-expect-error test override
        timestamp: 1000,
        // @ts-expect-error test override
        responses: new Map([
          ['position', { pressed: true, reactionTimeMs: 300 }],
          ['audio', { pressed: false }],
        ]),
      };

      const verdict = judge.evaluate(trial, response, context);

      expect(verdict.isCorrect).toBe(false);
      expect(verdict.overall).toBe('miss');
      // @ts-expect-error test: nullable access
      expect(verdict!.feedbackActions[0].visual).toBe('flash-red');
    });

    test('should handle undefined reaction times', () => {
      const trial: Trial = { index: 0 } as any;
      const response: TrialResponse = {
        trialIndex: 0,
        // @ts-expect-error test override
        timestamp: 1000,
        // @ts-expect-error test override
        responses: new Map([
          ['position', { pressed: true }], // No RT
        ]),
      };

      const verdict = judge.evaluate(trial, response, {
        ...context,
        activeModalities: ['position'],
      });
      expect(verdict.minReactionTimeMs).toBeUndefined();
    });
  });

  describe('summarize()', () => {
    test('should compute correct summary for perfect session', () => {
      const trial: Trial = { index: 0 } as any;
      const response: TrialResponse = {
        trialIndex: 0,
        responses: new Map([['position', { pressed: true, reactionTimeMs: 300 }]]),
      } as any;

      const v = judge.evaluate(trial, response, { ...context, activeModalities: ['position'] });
      judge.record(v);

      const summary = judge.summarize({ ...context, activeModalities: ['position'] });

      expect(summary.score).toBe(100);
      expect(summary.passed).toBe(true);
      expect(summary.nLevelRecommendation).toBe('up');
      expect(summary.byModality.get('position')?.avgReactionTimeMs).toBe(300);
    });

    test('should compute summary for empty session', () => {
      const summary = judge.summarize(context);
      expect(summary.score).toBe(0);
      expect(summary.passed).toBe(false);
      expect(summary.nLevelRecommendation).toBe('down');
    });

    test('should handle maintain recommendation', () => {
      // 60% score with 80% pass and 50% down threshold
      const trial: Trial = { index: 0 } as any;
      const respCorrect: TrialResponse = {
        trialIndex: 0,
        responses: new Map([['position', { pressed: true }]]),
      } as any;
      const respWrong: TrialResponse = {
        trialIndex: 0,
        responses: new Map([['position', { pressed: false }]]),
      } as any;

      const ctx = { ...context, activeModalities: ['position'] as ModalityId[] };

      judge.record(judge.evaluate(trial, respCorrect, ctx));
      judge.record(judge.evaluate(trial, respCorrect, ctx));
      judge.record(judge.evaluate(trial, respCorrect, ctx));
      judge.record(judge.evaluate(trial, respWrong, ctx));
      judge.record(judge.evaluate(trial, respWrong, ctx));

      const summary = judge.summarize(ctx);
      expect(summary.score).toBe(60);
      expect(summary.passed).toBe(false);
      expect(summary.nLevelRecommendation).toBe('maintain');
    });
  });

  test('reset and getVerdicts', () => {
    judge.record({ isCorrect: true } as any);
    expect(judge.getVerdicts()).toHaveLength(1);
    judge.reset();
    expect(judge.getVerdicts()).toHaveLength(0);
  });
});
