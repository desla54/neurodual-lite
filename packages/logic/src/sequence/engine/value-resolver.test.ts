import { describe, expect, it } from 'bun:test';
import {
  getModalityValues,
  resolveValue,
  isIntentionPossible,
  enumerateValidOptions,
  pickOption,
} from './value-resolver';
import { createSequenceSpec, type GeneratedTrial, type TrialIntention } from '../types';
import { createPRNG } from './prng';

describe('ValueResolver', () => {
  const mockModality = { id: 'pos', values: 9 };
  const spec = createSequenceSpec({
    nLevel: 2,
    modalities: [mockModality],
    targetProbabilities: { pos: 0.3 },
    lureProbabilities: { pos: { 'n-1': 0.1 } },
  });

  const history: GeneratedTrial[] = [
    // @ts-expect-error test override
    { index: 0, values: { pos: { value: 1, intention: 'neutral' } } },
    // @ts-expect-error test override
    { index: 1, values: { pos: { value: 2, intention: 'neutral' } } },
    // @ts-expect-error test override
    { index: 2, values: { pos: { value: 3, intention: 'neutral' } } },
  ];

  describe('getModalityValues', () => {
    it('should return array for numeric values', () => {
      expect(getModalityValues({ id: 'v', values: 3 })).toEqual([0, 1, 2]);
    });

    it('should return the same array for string array values', () => {
      const vals = ['A', 'B'];
      expect(getModalityValues({ id: 'v', values: vals })).toBe(vals);
    });
  });

  describe('resolveValue', () => {
    const rng = createPRNG('value-test');

    it('should resolve target value from history (index - nLevel)', () => {
      // current index = 3 (history.length)
      // target index = 3 - 2 = 1. history[1] = 2.
      const res = resolveValue(spec, history, 'pos', 'target', rng);
      expect(res?.value).toBe(2);
      expect(res?.intention).toBe('target');
    });

    it('should resolve lure-n-1 value (index - (n-1))', () => {
      // current = 3, lure index = 3 - 1 = 2. history[2] = 3.
      const res = resolveValue(spec, history, 'pos', 'lure-n-1', rng);
      expect(res?.value).toBe(3);
    });

    it('should resolve lure-n+1 value (index - (n+1))', () => {
      // current = 3, lure index = 3 - 3 = 0. history[0] = 1.
      const res = resolveValue(spec, history, 'pos', 'lure-n+1', rng);
      expect(res?.value).toBe(1);
    });

    it('should resolve neutral value avoiding targets and lures', () => {
      // Avoid: history[1]=2 (target), history[2]=3 (n-1), history[0]=1 (n+1)
      const res = resolveValue(spec, history, 'pos', 'neutral', rng);
      expect([1, 2, 3]).not.toContain(res?.value as number);
    });

    it('should return undefined if history is insufficient', () => {
      expect(resolveValue(spec, [], 'pos', 'target', rng)).toBeUndefined();
    });

    it('should throw for unknown modality', () => {
      expect(() => resolveValue(spec, history, 'unknown', 'target', rng)).toThrow();
    });

    it('should throw for unknown intention', () => {
      expect(() => resolveValue(spec, history, 'pos', 'unknown' as any, rng)).toThrow();
    });
  });

  describe('isIntentionPossible', () => {
    it('checks if enough history for target', () => {
      expect(isIntentionPossible(spec, [], 'pos', 'target')).toBe(false);
      expect(isIntentionPossible(spec, history.slice(0, 2), 'pos', 'target')).toBe(true);
    });

    it('checks if enough history for lures', () => {
      expect(isIntentionPossible(spec, history.slice(0, 2), 'pos', 'lure-n+1')).toBe(false);
      expect(isIntentionPossible(spec, history, 'pos', 'lure-n+1')).toBe(true);
    });
  });

  describe('enumerateValidOptions', () => {
    const probs = { pTarget: 0.3, pLureN1: 0.1, pLureNPlus1: 0.1 };
    const forbiddenIntentions = new Set<TrialIntention>();
    const forbiddenValuesByIntention = new Map<TrialIntention, Set<number | string>>();

    it('should enumerate all basic options', () => {
      const options = enumerateValidOptions(
        spec,
        history,
        'pos',
        probs,
        forbiddenIntentions,
        forbiddenValuesByIntention,
      );

      const intentions = options.map((o) => o.intention);
      expect(intentions).toContain('target');
      expect(intentions).toContain('lure-n-1');
      expect(intentions).toContain('lure-n+1');
      expect(intentions).toContain('neutral');
    });

    it('should respect correlatedIsTarget = true', () => {
      const options = enumerateValidOptions(
        spec,
        history,
        'pos',
        probs,
        forbiddenIntentions,
        forbiddenValuesByIntention,
        true,
      );
      expect(options).toHaveLength(1);
      expect(options[0]!.intention).toBe('target');
    });

    it('should respect correlatedIsTarget = false', () => {
      const options = enumerateValidOptions(
        spec,
        history,
        'pos',
        probs,
        forbiddenIntentions,
        forbiddenValuesByIntention,
        false,
      );
      expect(options.map((o) => o.intention)).not.toContain('target');
    });

    it('should fallback to neutral if target is impossible despite correlatedIsTarget=true', () => {
      // Force target but provide empty history
      const options = enumerateValidOptions(
        spec,
        [],
        'pos',
        probs,
        forbiddenIntentions,
        forbiddenValuesByIntention,
        true,
      );
      // Should have neutral options as fallback
      expect(options.some((o) => o.intention === 'neutral')).toBe(true);
    });

    it('should handle case where no neutral values are possible by using fallback', () => {
      // Modality with only 1 value
      const smallSpec = createSequenceSpec({
        nLevel: 1,
        modalities: [{ id: 'v', values: 1 }],
        targetProbabilities: { v: 0.3 },
      });
      const smallHistory: GeneratedTrial[] = [
        // @ts-expect-error test override
        { index: 0, values: { v: { value: 0, intention: 'target' } } },
      ];

      const forbidden = new Set<TrialIntention>(['target']);

      // Neutral wants to avoid target (0), but only 0 exists.
      // Target is forbidden. So options will be empty.
      const options = enumerateValidOptions(
        smallSpec,
        smallHistory,
        'v',
        probs,
        forbidden,
        forbiddenValuesByIntention,
      );
      expect(options.some((o) => o.intention === 'neutral')).toBe(true);
    });

    it('should return empty if modality is unknown', () => {
      expect(
        enumerateValidOptions(
          spec,
          history,
          'unknown',
          probs,
          forbiddenIntentions,
          forbiddenValuesByIntention,
        ),
      ).toHaveLength(0);
    });
  });

  describe('pickOption', () => {
    const rng = createPRNG('pick-test');

    it('should pick the only option available', () => {
      const opt = { intention: 'target' as const, value: 1, probability: 1 };
      expect(pickOption([opt], rng)).toBe(opt);
    });

    it('should pick weighted option', () => {
      const options = [
        { intention: 'target' as const, value: 1, probability: 0.1 },
        { intention: 'neutral' as const, value: 2, probability: 0.9 },
      ];
      // Over many runs, neutral should be picked ~90% of time
      let neutralCount = 0;
      for (let i = 0; i < 100; i++) {
        if (pickOption(options, rng)?.intention === 'neutral') neutralCount++;
      }
      expect(neutralCount).toBeGreaterThan(80);
    });

    it('should handle zero probability by uniform picking', () => {
      const options = [
        { intention: 'target' as const, value: 1, probability: 0 },
        { intention: 'neutral' as const, value: 2, probability: 0 },
      ];
      expect(pickOption(options, rng)).not.toBeNull();
    });

    it('should return null for empty options', () => {
      expect(pickOption([], rng)).toBeNull();
    });
  });
});
