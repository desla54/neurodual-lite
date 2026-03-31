import { describe, it, expect } from 'bun:test';
import {
  type PalPair,
  type PalTrial,
  type TrialResult,
  shuffle,
  generateRoundPairs,
  createTestOrder,
  evaluateTrial,
  createInitialState,
  advanceState,
  computeSummary,
  GRID_SIZE,
  SHAPES,
} from './pal';

// =============================================================================
// 1. Shuffle
// =============================================================================

describe('PAL — Shuffle', () => {
  it('returns an array of the same length', () => {
    const input = [1, 2, 3, 4, 5];
    expect(shuffle(input)).toHaveLength(5);
  });

  it('contains the same elements', () => {
    const input = [1, 2, 3, 4, 5];
    expect(shuffle(input).sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it('does not mutate the original array', () => {
    const input = [1, 2, 3] as const;
    shuffle(input);
    expect(input).toEqual([1, 2, 3]);
  });

  it('uses deterministic rng', () => {
    let seed = 0.3;
    const makeRng = () => {
      seed = 0.3;
      return () => {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
      };
    };
    const a = shuffle([1, 2, 3, 4, 5], makeRng());
    const b = shuffle([1, 2, 3, 4, 5], makeRng());
    expect(a).toEqual(b);
  });
});

// =============================================================================
// 2. Pair Generation
// =============================================================================

describe('PAL — Pair generation', () => {
  it('generates the correct number of pairs', () => {
    expect(generateRoundPairs(3)).toHaveLength(3);
    expect(generateRoundPairs(6)).toHaveLength(6);
  });

  it('all positions are within grid bounds (0-8)', () => {
    const pairs = generateRoundPairs(6);
    for (const p of pairs) {
      expect(p.position).toBeGreaterThanOrEqual(0);
      expect(p.position).toBeLessThan(GRID_SIZE);
    }
  });

  it('all positions are unique', () => {
    const pairs = generateRoundPairs(6);
    const positions = pairs.map((p) => p.position);
    expect(new Set(positions).size).toBe(6);
  });

  it('all labels are unique', () => {
    const pairs = generateRoundPairs(6);
    const labels = pairs.map((p) => p.label);
    expect(new Set(labels).size).toBe(6);
  });

  it('pair count cannot exceed available shapes', () => {
    const pairs = generateRoundPairs(SHAPES.length);
    expect(pairs).toHaveLength(SHAPES.length);
  });

  it('pair count cannot exceed grid size', () => {
    const pairs = generateRoundPairs(GRID_SIZE);
    expect(pairs).toHaveLength(GRID_SIZE);
  });
});

// =============================================================================
// 3. Test Order
// =============================================================================

describe('PAL — Test order', () => {
  it('creates test trials from pairs with correct positions', () => {
    const pairs: PalPair[] = [
      { shape: 'circle', color: '#EF4444', label: 'Red', position: 0 },
      { shape: 'circle', color: '#3B82F6', label: 'Blue', position: 4 },
    ];
    const order = createTestOrder(pairs, 0);
    expect(order).toHaveLength(2);
    // All correct positions should be present
    const positions = new Set(order.map((t) => t.correctPosition));
    expect(positions.has(0)).toBe(true);
    expect(positions.has(4)).toBe(true);
  });

  it('sets the round number on all trials', () => {
    const pairs = generateRoundPairs(3);
    const order = createTestOrder(pairs, 2);
    for (const trial of order) {
      expect(trial.round).toBe(2);
    }
  });
});

// =============================================================================
// 4. Trial Evaluation
// =============================================================================

describe('PAL — Trial evaluation', () => {
  const trial: PalTrial = {
    shape: 'circle',
    color: '#EF4444',
    label: 'Red',
    correctPosition: 5,
    round: 0,
  };

  it('correct position returns true', () => {
    expect(evaluateTrial(trial, 5)).toBe(true);
  });

  it('wrong position returns false', () => {
    expect(evaluateTrial(trial, 3)).toBe(false);
    expect(evaluateTrial(trial, 0)).toBe(false);
    expect(evaluateTrial(trial, 8)).toBe(false);
  });
});

// =============================================================================
// 5. Session State Machine
// =============================================================================

describe('PAL — Session state', () => {
  it('initial state starts at round 0', () => {
    const s = createInitialState();
    expect(s.round).toBe(0);
    expect(s.trialIndex).toBe(0);
    expect(s.finished).toBe(false);
  });

  it('stays in same round when not last trial', () => {
    const s = createInitialState();
    const s1 = advanceState(s, 3, 0); // 3 trials in round, at index 0
    expect(s1.round).toBe(0);
    expect(s1.finished).toBe(false);
  });

  it('advances to next round when last trial in round', () => {
    const s = createInitialState();
    const s1 = advanceState(s, 3, 2); // 3 trials, at index 2 (last)
    expect(s1.round).toBe(1);
    expect(s1.finished).toBe(false);
  });

  it('finishes when last trial of last round', () => {
    const s = { round: 3, trialIndex: 15, finished: false };
    const s1 = advanceState(s, 6, 5); // round 3 has 6 pairs, at index 5 (last)
    expect(s1.finished).toBe(true);
  });

  it('does not advance a finished state', () => {
    const s = { round: 3, trialIndex: 18, finished: true };
    const s1 = advanceState(s, 6, 5);
    expect(s1).toBe(s);
  });

  it('trial index increments on each advance', () => {
    let s = createInitialState();
    s = advanceState(s, 3, 0);
    expect(s.trialIndex).toBe(1);
    s = advanceState(s, 3, 1);
    expect(s.trialIndex).toBe(2);
  });
});

// =============================================================================
// 6. Summary — Basic Metrics
// =============================================================================

describe('PAL — Summary basic metrics', () => {
  const mkResult = (round: number, pos: number, correct: boolean, rt: number): TrialResult => ({
    trial: { shape: 'circle', color: '#EF4444', label: 'Red', correctPosition: pos, round },
    selectedPosition: correct ? pos : (pos + 1) % GRID_SIZE,
    correct,
    rt,
  });

  it('computes accuracy', () => {
    const results = [
      mkResult(0, 0, true, 500),
      mkResult(0, 1, false, 600),
      mkResult(0, 2, true, 700),
    ];
    const s = computeSummary(results);
    expect(s.accuracy).toBe(67);
    expect(s.correctTrials).toBe(2);
    expect(s.totalErrors).toBe(1);
  });

  it('computes average correct RT', () => {
    const results = [
      mkResult(0, 0, true, 400),
      mkResult(0, 1, true, 600),
      mkResult(0, 2, false, 1000),
    ];
    expect(computeSummary(results).avgCorrectRt).toBe(500); // (400+600)/2
  });

  it('handles empty results', () => {
    const s = computeSummary([]);
    expect(s.totalTrials).toBe(0);
    expect(s.accuracy).toBe(0);
    expect(s.pairsLearned).toBe(0);
    expect(s.avgCorrectRt).toBe(0);
  });

  it('handles all correct', () => {
    const results = [mkResult(0, 0, true, 500), mkResult(0, 1, true, 600)];
    expect(computeSummary(results).accuracy).toBe(100);
    expect(computeSummary(results).totalErrors).toBe(0);
  });

  it('handles all wrong', () => {
    const results = [mkResult(0, 0, false, 500), mkResult(0, 1, false, 600)];
    const s = computeSummary(results);
    expect(s.accuracy).toBe(0);
    expect(s.totalErrors).toBe(2);
    expect(s.avgCorrectRt).toBe(0);
  });
});

// =============================================================================
// 7. Summary — Pairs Learned & Max Set Size
// =============================================================================

describe('PAL — Summary pairs learned and max set size', () => {
  const mkResult = (round: number, pos: number, correct: boolean): TrialResult => ({
    trial: {
      shape: 'circle',
      color: '#EF4444',
      label: `R${round}P${pos}`,
      correctPosition: pos,
      round,
    },
    selectedPosition: correct ? pos : (pos + 1) % GRID_SIZE,
    correct,
    rt: 500,
  });

  it('counts unique correct pairs', () => {
    const results = [
      mkResult(0, 0, true),
      mkResult(0, 1, true),
      mkResult(0, 2, false),
      mkResult(1, 3, true),
    ];
    expect(computeSummary(results).pairsLearned).toBe(3);
  });

  it('does not double-count same pair', () => {
    // Hypothetically the same pair tested twice (same round + position)
    const results = [mkResult(0, 0, true), mkResult(0, 0, true)];
    expect(computeSummary(results).pairsLearned).toBe(1);
  });

  it('computes max set size from highest correct round', () => {
    const results = [
      mkResult(0, 0, true), // round 0 correct -> pairsPerRound[0] = 3
      mkResult(1, 0, true), // round 1 correct -> pairsPerRound[1] = 4
      mkResult(2, 0, false), // round 2 wrong
    ];
    expect(computeSummary(results).maxSetSize).toBe(4);
  });

  it('max set size is 0 when all wrong', () => {
    const results = [mkResult(0, 0, false), mkResult(1, 0, false)];
    expect(computeSummary(results).maxSetSize).toBe(0);
  });
});

// =============================================================================
// 8. Summary — Round Accuracies
// =============================================================================

describe('PAL — Summary round accuracies', () => {
  const mkResult = (round: number, correct: boolean): TrialResult => ({
    trial: { shape: 'circle', color: '#EF4444', label: 'X', correctPosition: 0, round },
    selectedPosition: correct ? 0 : 1,
    correct,
    rt: 500,
  });

  it('computes per-round accuracy', () => {
    const results = [
      mkResult(0, true),
      mkResult(0, true),
      mkResult(0, false), // round 0: 2/3 = 67%
      mkResult(1, true),
      mkResult(1, true),
      mkResult(1, true),
      mkResult(1, true), // round 1: 4/4 = 100%
    ];
    const s = computeSummary(results);
    expect(s.roundAccuracies[0]).toBe(67);
    expect(s.roundAccuracies[1]).toBe(100);
  });

  it('returns 0 for rounds with no results', () => {
    const results = [mkResult(0, true)]; // only round 0
    const s = computeSummary(results);
    expect(s.roundAccuracies[2]).toBe(0);
    expect(s.roundAccuracies[3]).toBe(0);
  });
});
