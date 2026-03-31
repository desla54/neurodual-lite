/**
 * Tests for Judge Factory
 */

import { describe, expect, test } from 'bun:test';
import { createJudgeFromConfig, createJudge, getScoringStrategy } from './judge-factory';
import { AccuracyJudge } from './accuracy-judge';
import { BrainWorkshopJudge } from './brainworkshop-judge';
import { SDTJudge } from './sdt-judge';

describe('JudgeFactory', () => {
  describe('createJudgeFromConfig()', () => {
    test('should create SDTJudge for sdt strategy', () => {
      const judge = createJudgeFromConfig({ strategy: 'sdt', passThreshold: 1.5 });
      expect(judge).toBeInstanceOf(SDTJudge);
    });

    test('should create SDTJudge for dualnback-classic strategy', () => {
      const judge = createJudgeFromConfig({ strategy: 'dualnback-classic', passThreshold: 3 });
      expect(judge).toBeInstanceOf(SDTJudge);
    });

    test('should create BrainWorkshopJudge for brainworkshop strategy', () => {
      const judge = createJudgeFromConfig({ strategy: 'brainworkshop', passThreshold: 80 });
      expect(judge).toBeInstanceOf(BrainWorkshopJudge);
    });

    test('should create AccuracyJudge for accuracy strategy', () => {
      const judge = createJudgeFromConfig({ strategy: 'accuracy', passThreshold: 80 });
      expect(judge).toBeInstanceOf(AccuracyJudge);
    });

    test('should default to SDTJudge for unknown strategy', () => {
      const judge = createJudgeFromConfig({ strategy: 'unknown' as any, passThreshold: 0 });
      expect(judge).toBeInstanceOf(SDTJudge);
    });
  });

  describe('createJudge()', () => {
    test('should create judge from ModeSpec', () => {
      const spec = {
        scoring: {
          strategy: 'accuracy',
          passThreshold: 90,
        },
      } as any;
      const judge = createJudge(spec);
      expect(judge).toBeInstanceOf(AccuracyJudge);
    });
  });

  test('getScoringStrategy() should extract strategy from spec', () => {
    const spec = { scoring: { strategy: 'dualnback-classic' } } as any;
    expect(getScoringStrategy(spec)).toBe('dualnback-classic');
  });
});
