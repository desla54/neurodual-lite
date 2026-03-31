import { describe, it, expect } from 'bun:test';
import {
  type DualTrial,
  type DualTrialResult,
  generateTrials,
  isTaskACorrect,
  isTaskBCorrect,
  buildTrialResult,
  estimateSingleTaskRTs,
  computeDualTaskCost,
  computeDualTaskCostFromBaselines,
  computeSummary,
  NUMBER_POOL,
  SYMBOL_POOL,
} from './dual-task';

// =============================================================================
// Helpers
// =============================================================================

function seededRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return s / 2147483647;
  };
}

function makeTrial(num: number, sym: '^' | 'v'): DualTrial {
  return {
    number: num,
    numberIsOdd: num % 2 !== 0,
    symbol: sym,
    symbolIsUp: sym === '^',
  };
}

function makeResult(
  trial: DualTrial,
  respA: 'odd' | 'even' | null,
  respB: 'up' | 'down' | null,
  rt: number,
  timedOut = false,
): DualTrialResult {
  return buildTrialResult(trial, respA, respB, rt, timedOut);
}

// =============================================================================
// 1. Trial generation
// =============================================================================

describe('Dual Task — Trial generation', () => {
  it('generates the correct number of trials', () => {
    const trials = generateTrials(24);
    expect(trials).toHaveLength(24);
  });

  it('all numbers are from the NUMBER_POOL', () => {
    const trials = generateTrials(100);
    for (const t of trials) {
      expect(NUMBER_POOL).toContain(t.number as any);
    }
  });

  it('all symbols are from the SYMBOL_POOL', () => {
    const trials = generateTrials(100);
    for (const t of trials) {
      expect(SYMBOL_POOL).toContain(t.symbol);
    }
  });

  it('numberIsOdd matches actual parity', () => {
    const trials = generateTrials(50);
    for (const t of trials) {
      expect(t.numberIsOdd).toBe(t.number % 2 !== 0);
    }
  });

  it('symbolIsUp matches actual symbol', () => {
    const trials = generateTrials(50);
    for (const t of trials) {
      expect(t.symbolIsUp).toBe(t.symbol === '^');
    }
  });

  it('uses provided RNG for reproducibility', () => {
    const a = generateTrials(24, seededRng(42));
    const b = generateTrials(24, seededRng(42));
    expect(a.map((t) => t.number)).toEqual(b.map((t) => t.number));
    expect(a.map((t) => t.symbol)).toEqual(b.map((t) => t.symbol));
  });

  it('different seeds produce different trials', () => {
    const a = generateTrials(24, seededRng(42));
    const b = generateTrials(24, seededRng(99));
    const numsA = a.map((t) => t.number).join(',');
    const numsB = b.map((t) => t.number).join(',');
    expect(numsA).not.toBe(numsB);
  });
});

// =============================================================================
// 2. Task A (number) validation
// =============================================================================

describe('Dual Task — Task A validation', () => {
  it('odd number + "odd" response = correct', () => {
    expect(isTaskACorrect(makeTrial(3, '^'), 'odd')).toBe(true);
  });

  it('odd number + "even" response = incorrect', () => {
    expect(isTaskACorrect(makeTrial(5, '^'), 'even')).toBe(false);
  });

  it('even number + "even" response = correct', () => {
    expect(isTaskACorrect(makeTrial(4, 'v'), 'even')).toBe(true);
  });

  it('even number + "odd" response = incorrect', () => {
    expect(isTaskACorrect(makeTrial(8, 'v'), 'odd')).toBe(false);
  });

  it('null response = incorrect', () => {
    expect(isTaskACorrect(makeTrial(3, '^'), null)).toBe(false);
  });
});

// =============================================================================
// 3. Task B (symbol) validation
// =============================================================================

describe('Dual Task — Task B validation', () => {
  it('^ symbol + "up" response = correct', () => {
    expect(isTaskBCorrect(makeTrial(3, '^'), 'up')).toBe(true);
  });

  it('^ symbol + "down" response = incorrect', () => {
    expect(isTaskBCorrect(makeTrial(3, '^'), 'down')).toBe(false);
  });

  it('v symbol + "down" response = correct', () => {
    expect(isTaskBCorrect(makeTrial(3, 'v'), 'down')).toBe(true);
  });

  it('v symbol + "up" response = incorrect', () => {
    expect(isTaskBCorrect(makeTrial(3, 'v'), 'up')).toBe(false);
  });

  it('null response = incorrect', () => {
    expect(isTaskBCorrect(makeTrial(3, '^'), null)).toBe(false);
  });
});

// =============================================================================
// 4. Build trial result
// =============================================================================

describe('Dual Task — buildTrialResult', () => {
  it('both correct when both responses match', () => {
    const trial = makeTrial(3, '^'); // odd, up
    const result = buildTrialResult(trial, 'odd', 'up', 500, false);
    expect(result.taskACorrect).toBe(true);
    expect(result.taskBCorrect).toBe(true);
    expect(result.bothCorrect).toBe(true);
  });

  it('not bothCorrect when only task A is correct', () => {
    const trial = makeTrial(3, '^');
    const result = buildTrialResult(trial, 'odd', 'down', 500, false);
    expect(result.taskACorrect).toBe(true);
    expect(result.taskBCorrect).toBe(false);
    expect(result.bothCorrect).toBe(false);
  });

  it('not bothCorrect when only task B is correct', () => {
    const trial = makeTrial(3, '^');
    const result = buildTrialResult(trial, 'even', 'up', 500, false);
    expect(result.taskACorrect).toBe(false);
    expect(result.taskBCorrect).toBe(true);
    expect(result.bothCorrect).toBe(false);
  });

  it('both wrong when both responses wrong', () => {
    const trial = makeTrial(3, '^');
    const result = buildTrialResult(trial, 'even', 'down', 500, false);
    expect(result.bothCorrect).toBe(false);
    expect(result.taskACorrect).toBe(false);
    expect(result.taskBCorrect).toBe(false);
  });

  it('timed out with null responses = both wrong', () => {
    const trial = makeTrial(3, '^');
    const result = buildTrialResult(trial, null, null, 3000, true);
    expect(result.timedOut).toBe(true);
    expect(result.bothCorrect).toBe(false);
  });
});

// =============================================================================
// 5. Dual-task cost
// =============================================================================

describe('Dual Task — Dual-task cost', () => {
  it('estimates single-task RTs as fractions of dual-task RT', () => {
    const { singleTask1Rt, singleTask2Rt } = estimateSingleTaskRTs(1000);
    expect(singleTask1Rt).toBe(700); // 0.7 * 1000
    expect(singleTask2Rt).toBe(750); // 0.75 * 1000
  });

  it('computes dual-task cost > 0', () => {
    const cost = computeDualTaskCost(1000);
    // cost = 1000 - (700 + 750) / 2 = 1000 - 725 = 275
    expect(cost).toBe(275);
  });

  it('returns 0 for zero RT', () => {
    expect(computeDualTaskCost(0)).toBe(0);
  });

  it('computes cost from explicit baselines', () => {
    const cost = computeDualTaskCostFromBaselines(1000, 600, 650);
    // 1000 - (600 + 650) / 2 = 1000 - 625 = 375
    expect(cost).toBe(375);
  });

  it('returns 0 from baselines when dualTaskRt is 0', () => {
    expect(computeDualTaskCostFromBaselines(0, 600, 650)).toBe(0);
  });
});

// =============================================================================
// 6. Summary computation
// =============================================================================

describe('Dual Task — Summary', () => {
  it('handles empty results', () => {
    const summary = computeSummary([]);
    expect(summary.accuracy).toBe(0);
    expect(summary.totalTrials).toBe(0);
    expect(summary.avgRT).toBe(0);
    expect(summary.dualTaskCost).toBe(0);
  });

  it('computes accuracy from both-correct trials', () => {
    const results: DualTrialResult[] = [
      makeResult(makeTrial(3, '^'), 'odd', 'up', 500), // both correct
      makeResult(makeTrial(4, 'v'), 'even', 'down', 600), // both correct
      makeResult(makeTrial(5, '^'), 'even', 'up', 700), // A wrong
      makeResult(makeTrial(6, 'v'), 'even', 'up', 800), // B wrong
    ];
    const summary = computeSummary(results);
    expect(summary.correctTrials).toBe(2);
    expect(summary.accuracy).toBe(50);
  });

  it('computes per-task accuracy', () => {
    const results: DualTrialResult[] = [
      makeResult(makeTrial(3, '^'), 'odd', 'up', 500), // A correct, B correct
      makeResult(makeTrial(4, 'v'), 'even', 'up', 600), // A correct, B wrong
      makeResult(makeTrial(5, '^'), 'even', 'down', 700), // A wrong, B wrong
    ];
    const summary = computeSummary(results);
    expect(summary.taskACorrectCount).toBe(2);
    expect(summary.taskBCorrectCount).toBe(1);
    expect(summary.task1Accuracy).toBe(67); // 2/3 rounded
    expect(summary.task2Accuracy).toBe(33); // 1/3 rounded
  });

  it('computes avgRT from non-timed-out trials only', () => {
    const results: DualTrialResult[] = [
      makeResult(makeTrial(3, '^'), 'odd', 'up', 400),
      makeResult(makeTrial(4, 'v'), null, null, 3000, true),
      makeResult(makeTrial(5, '^'), 'odd', 'up', 600),
    ];
    const summary = computeSummary(results);
    expect(summary.avgRT).toBe(500); // (400 + 600) / 2
  });

  it('avgRT is 0 when all trials timed out', () => {
    const results: DualTrialResult[] = [
      makeResult(makeTrial(3, '^'), null, null, 3000, true),
      makeResult(makeTrial(4, 'v'), null, null, 3000, true),
    ];
    const summary = computeSummary(results);
    expect(summary.avgRT).toBe(0);
    expect(summary.dualTaskCost).toBe(0);
  });

  it('100% accuracy when all both-correct', () => {
    const results: DualTrialResult[] = [
      makeResult(makeTrial(3, '^'), 'odd', 'up', 500),
      makeResult(makeTrial(4, 'v'), 'even', 'down', 600),
    ];
    const summary = computeSummary(results);
    expect(summary.accuracy).toBe(100);
  });

  it('0% accuracy when all wrong', () => {
    const results: DualTrialResult[] = [
      makeResult(makeTrial(3, '^'), 'even', 'down', 500),
      makeResult(makeTrial(4, 'v'), 'odd', 'up', 600),
    ];
    const summary = computeSummary(results);
    expect(summary.accuracy).toBe(0);
  });

  it('dual-task cost is computed from avgRT', () => {
    const results: DualTrialResult[] = [
      makeResult(makeTrial(3, '^'), 'odd', 'up', 1000),
      makeResult(makeTrial(4, 'v'), 'even', 'down', 1000),
    ];
    const summary = computeSummary(results);
    expect(summary.dualTaskRt).toBe(1000);
    expect(summary.singleTask1Rt).toBe(700);
    expect(summary.singleTask2Rt).toBe(750);
    expect(summary.dualTaskCost).toBe(275);
  });
});
