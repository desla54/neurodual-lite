import { describe, expect, it } from 'bun:test';
import {
  calculateExpectedTargets,
  calculateExpectedLures,
  calculateEffectiveProbabilities,
  updateModalityBudget,
  incrementTrialCount,
  isBudgetExhausted,
  resetBudget,
} from './budget-manager';
import { createSequenceSpec, createEmptyBudgetUsed } from '../types';

describe('BudgetManager', () => {
  const specNoBudget = createSequenceSpec({
    nLevel: 2,
    modalities: [{ id: 'pos', values: 9 }],
    targetProbabilities: { pos: 0.3 },
  });

  const specWithBudget = createSequenceSpec({
    nLevel: 2,
    modalities: [{ id: 'pos', values: 9 }],
    targetProbabilities: { pos: 0.3 },
    lureProbabilities: { pos: { 'n-1': 0.1 } },
    budget: { blockSize: 20 },
  });

  describe('calculateExpectedTargets', () => {
    it('should return -1 if no budget', () => {
      expect(calculateExpectedTargets(specNoBudget, 'pos')).toBe(-1);
    });

    it('should calculate targets from probability if not exact', () => {
      // 20 * 0.3 = 6
      expect(calculateExpectedTargets(specWithBudget, 'pos')).toBe(6);
    });

    it('should use exactTargets if provided', () => {
      const spec = { ...specWithBudget, budget: { blockSize: 20, exactTargets: { pos: 10 } } };
      expect(calculateExpectedTargets(spec, 'pos')).toBe(10);
    });
  });

  describe('calculateExpectedLures', () => {
    it('should calculate lures from probability', () => {
      // 20 * 0.1 = 2
      expect(calculateExpectedLures(specWithBudget, 'pos', 'n-1')).toBe(2);
    });

    it('should use exactLures if provided', () => {
      const spec = {
        ...specWithBudget,
        budget: { blockSize: 20, exactLures: { pos: { 'n-1': 5 } } },
      };
      expect(calculateExpectedLures(spec, 'pos', 'n-1')).toBe(5);
    });
  });

  describe('calculateEffectiveProbabilities', () => {
    it('should use spec probability if no budget', () => {
      const probs = calculateEffectiveProbabilities(specNoBudget, createEmptyBudgetUsed(['pos']));
      expect(probs.targetProbabilities.pos).toBe(0.3);
    });

    it('should calculate hypergeometric probability with budget', () => {
      // 6 targets expected, 0 used, 20 trials remaining
      // P = 6 / 20 = 0.3
      const budgetUsed = createEmptyBudgetUsed(['pos']);
      const probs = calculateEffectiveProbabilities(specWithBudget, budgetUsed);
      expect(probs.targetProbabilities.pos).toBe(0.3);

      // 1 target used, 1 trial generated, 19 trials remaining
      // P = (6 - 1) / 19 = 5 / 19 = 0.263
      const updatedBudget = {
        trialsGenerated: 1,
        targetsUsed: { pos: 1 },
        luresUsed: {},
      };
      const probs2 = calculateEffectiveProbabilities(specWithBudget, updatedBudget);
      expect(probs2.targetProbabilities.pos).toBeCloseTo(5 / 19, 4);
    });

    it('should handle zero trials remaining by falling back', () => {
      const fullBudget = { ...createEmptyBudgetUsed(['pos']), trialsGenerated: 20 };
      const probs = calculateEffectiveProbabilities(specWithBudget, fullBudget);
      expect(probs.targetProbabilities.pos).toBe(0.3);
    });
  });

  describe('updateModalityBudget', () => {
    it('should increment target counter', () => {
      const budget = createEmptyBudgetUsed(['pos']);
      const next = updateModalityBudget(budget, 'pos', 'target');
      expect(next.targetsUsed.pos).toBe(1);
      expect(next.trialsGenerated).toBe(0); // Trial count not incremented here
    });

    it('should increment lure counters', () => {
      const budget = createEmptyBudgetUsed(['pos']);
      const next = updateModalityBudget(budget, 'pos', 'lure-n-1');
      expect(next.luresUsed.pos?.['n-1']).toBe(1);

      const next2 = updateModalityBudget(next, 'pos', 'lure-n+1');
      expect(next2.luresUsed.pos?.['n+1']).toBe(1);
    });

    it('should do nothing for neutral', () => {
      const budget = createEmptyBudgetUsed(['pos']);
      const next = updateModalityBudget(budget, 'pos', 'neutral');
      expect(next).toEqual(budget);
    });
  });

  describe('incrementTrialCount', () => {
    it('should increment trialsGenerated', () => {
      const budget = createEmptyBudgetUsed(['pos']);
      expect(incrementTrialCount(budget).trialsGenerated).toBe(1);
    });
  });

  describe('isBudgetExhausted', () => {
    it('should return false if no budget', () => {
      expect(isBudgetExhausted(specNoBudget, createEmptyBudgetUsed(['pos']))).toBe(false);
    });

    it('should return true if trialsGenerated >= blockSize', () => {
      expect(
        isBudgetExhausted(specWithBudget, {
          ...createEmptyBudgetUsed(['pos']),
          trialsGenerated: 20,
        }),
      ).toBe(true);
      expect(
        isBudgetExhausted(specWithBudget, {
          ...createEmptyBudgetUsed(['pos']),
          trialsGenerated: 19,
        }),
      ).toBe(false);
    });
  });

  describe('resetBudget', () => {
    it('should reset all counters', () => {
      const budget = resetBudget(['pos', 'audio']);
      expect(budget.trialsGenerated).toBe(0);
      expect(budget.targetsUsed.pos).toBe(0);
      expect(budget.luresUsed.audio).toEqual({});
    });
  });
});
