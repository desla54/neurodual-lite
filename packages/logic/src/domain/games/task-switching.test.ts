import { describe, it, expect } from 'bun:test';
import {
  type TaskSwitchingTrial,
  type TaskSwitchingTrialResult,
  DIGITS,
  getTaskForTrial,
  isSwitchTrial,
  generateTrials,
  isCorrectResponse,
  getCorrectResponse,
  computeSwitchCost,
  computeSummary,
} from './task-switching';

// =============================================================================
// Helpers
// =============================================================================

function makeTrial(index: number, digit: number): TaskSwitchingTrial {
  return {
    trialIndex: index,
    digit,
    task: getTaskForTrial(index),
    isSwitch: isSwitchTrial(index),
  };
}

function makeResult(
  trial: TaskSwitchingTrial,
  response: 'left' | 'right' | null,
  rt: number,
  timedOut = false,
): TaskSwitchingTrialResult {
  return {
    trial,
    response,
    correct: response !== null ? isCorrectResponse(trial.digit, trial.task, response) : false,
    responseTimeMs: rt,
    timedOut,
  };
}

// =============================================================================
// 1. AABB Task Pattern
// =============================================================================

describe('Task Switching — AABB pattern', () => {
  it('indices 0,1 are odd-even', () => {
    expect(getTaskForTrial(0)).toBe('odd-even');
    expect(getTaskForTrial(1)).toBe('odd-even');
  });

  it('indices 2,3 are high-low', () => {
    expect(getTaskForTrial(2)).toBe('high-low');
    expect(getTaskForTrial(3)).toBe('high-low');
  });

  it('indices 4,5 cycle back to odd-even', () => {
    expect(getTaskForTrial(4)).toBe('odd-even');
    expect(getTaskForTrial(5)).toBe('odd-even');
  });

  it('full AABB cycle repeats over 8 trials', () => {
    const tasks = Array.from({ length: 8 }, (_, i) => getTaskForTrial(i));
    expect(tasks).toEqual([
      'odd-even',
      'odd-even',
      'high-low',
      'high-low',
      'odd-even',
      'odd-even',
      'high-low',
      'high-low',
    ]);
  });
});

// =============================================================================
// 2. Switch Detection
// =============================================================================

describe('Task Switching — Switch detection', () => {
  it('first trial is never a switch', () => {
    expect(isSwitchTrial(0)).toBe(false);
  });

  it('trial 1 is not a switch (same task as 0)', () => {
    expect(isSwitchTrial(1)).toBe(false);
  });

  it('trial 2 is a switch (odd-even -> high-low)', () => {
    expect(isSwitchTrial(2)).toBe(true);
  });

  it('trial 3 is not a switch (same task as 2)', () => {
    expect(isSwitchTrial(3)).toBe(false);
  });

  it('trial 4 is a switch (high-low -> odd-even)', () => {
    expect(isSwitchTrial(4)).toBe(true);
  });

  it('generates correct switch pattern over 8 trials', () => {
    const switches = Array.from({ length: 8 }, (_, i) => isSwitchTrial(i));
    expect(switches).toEqual([false, false, true, false, true, false, true, false]);
  });
});

// =============================================================================
// 3. Trial Generation
// =============================================================================

describe('Task Switching — Trial generation', () => {
  it('generates the correct number of trials', () => {
    const trials = generateTrials(32);
    expect(trials).toHaveLength(32);
  });

  it('all digits are valid (1-9 excluding 5)', () => {
    const trials = generateTrials(100);
    for (const trial of trials) {
      expect(DIGITS).toContain(trial.digit);
      expect(trial.digit).not.toBe(5);
    }
  });

  it('trial indices match their position', () => {
    const trials = generateTrials(16);
    for (let i = 0; i < 16; i++) {
      expect(trials[i]!.trialIndex).toBe(i);
    }
  });

  it('tasks follow AABB pattern', () => {
    const trials = generateTrials(8);
    expect(trials.map((t) => t.task)).toEqual([
      'odd-even',
      'odd-even',
      'high-low',
      'high-low',
      'odd-even',
      'odd-even',
      'high-low',
      'high-low',
    ]);
  });

  it('uses provided RNG for reproducibility', () => {
    let seed = 99;
    const rng = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const a = generateTrials(16, rng);

    seed = 99;
    const b = generateTrials(16, rng);
    expect(a.map((t) => t.digit)).toEqual(b.map((t) => t.digit));
  });
});

// =============================================================================
// 4. Response Validation — odd/even
// =============================================================================

describe('Task Switching — Odd/even response', () => {
  it('left is correct for even digits', () => {
    expect(isCorrectResponse(2, 'odd-even', 'left')).toBe(true);
    expect(isCorrectResponse(4, 'odd-even', 'left')).toBe(true);
    expect(isCorrectResponse(8, 'odd-even', 'left')).toBe(true);
  });

  it('right is correct for odd digits', () => {
    expect(isCorrectResponse(1, 'odd-even', 'right')).toBe(true);
    expect(isCorrectResponse(3, 'odd-even', 'right')).toBe(true);
    expect(isCorrectResponse(7, 'odd-even', 'right')).toBe(true);
  });

  it('left is incorrect for odd digits', () => {
    expect(isCorrectResponse(1, 'odd-even', 'left')).toBe(false);
    expect(isCorrectResponse(9, 'odd-even', 'left')).toBe(false);
  });

  it('right is incorrect for even digits', () => {
    expect(isCorrectResponse(2, 'odd-even', 'right')).toBe(false);
    expect(isCorrectResponse(6, 'odd-even', 'right')).toBe(false);
  });
});

// =============================================================================
// 5. Response Validation — high/low
// =============================================================================

describe('Task Switching — High/low response', () => {
  it('right is correct for high digits (>5)', () => {
    expect(isCorrectResponse(6, 'high-low', 'right')).toBe(true);
    expect(isCorrectResponse(9, 'high-low', 'right')).toBe(true);
  });

  it('left is correct for low digits (<5)', () => {
    expect(isCorrectResponse(1, 'high-low', 'left')).toBe(true);
    expect(isCorrectResponse(4, 'high-low', 'left')).toBe(true);
  });

  it('left is incorrect for high digits', () => {
    expect(isCorrectResponse(7, 'high-low', 'left')).toBe(false);
  });

  it('right is incorrect for low digits', () => {
    expect(isCorrectResponse(3, 'high-low', 'right')).toBe(false);
  });
});

// =============================================================================
// 6. getCorrectResponse helper
// =============================================================================

describe('Task Switching — getCorrectResponse', () => {
  it('returns left for even in odd-even task', () => {
    expect(getCorrectResponse(4, 'odd-even')).toBe('left');
  });

  it('returns right for odd in odd-even task', () => {
    expect(getCorrectResponse(7, 'odd-even')).toBe('right');
  });

  it('returns right for high in high-low task', () => {
    expect(getCorrectResponse(8, 'high-low')).toBe('right');
  });

  it('returns left for low in high-low task', () => {
    expect(getCorrectResponse(2, 'high-low')).toBe('left');
  });
});

// =============================================================================
// 7. Switch Cost Computation
// =============================================================================

describe('Task Switching — Switch cost', () => {
  it('positive when switch RT > repeat RT', () => {
    const results: TaskSwitchingTrialResult[] = [
      makeResult(makeTrial(0, 2), 'left', 400), // repeat, correct (even -> left)
      makeResult(makeTrial(1, 4), 'left', 420), // repeat, correct
      makeResult(makeTrial(2, 6), 'right', 550), // switch, correct (high -> right)
      makeResult(makeTrial(4, 8), 'left', 530), // switch, correct (even -> left)
    ];
    const cost = computeSwitchCost(results);
    // switch mean = (550+530)/2 = 540, repeat mean = (400+420)/2 = 410
    expect(cost).toBe(130);
  });

  it('returns 0 when no valid switch or repeat trials', () => {
    expect(computeSwitchCost([])).toBe(0);
  });

  it('ignores timed-out trials', () => {
    const results: TaskSwitchingTrialResult[] = [
      makeResult(makeTrial(0, 2), 'left', 400), // repeat, correct
      makeResult(makeTrial(2, 6), null, 2500, true), // switch, timed out
      makeResult(makeTrial(4, 4), 'left', 500), // switch, correct (even -> left)
    ];
    const cost = computeSwitchCost(results);
    // switch mean = 500, repeat mean = 400
    expect(cost).toBe(100);
  });

  it('ignores incorrect trials', () => {
    const results: TaskSwitchingTrialResult[] = [
      makeResult(makeTrial(0, 2), 'left', 400), // repeat, correct
      makeResult(makeTrial(2, 6), 'left', 9999), // switch, WRONG (high=right)
      makeResult(makeTrial(4, 8), 'left', 500), // switch, correct (even -> left)
    ];
    const cost = computeSwitchCost(results);
    expect(cost).toBe(100);
  });
});

// =============================================================================
// 8. Summary Computation
// =============================================================================

describe('Task Switching — Summary computation', () => {
  it('computes accuracy correctly', () => {
    const results: TaskSwitchingTrialResult[] = [
      makeResult(makeTrial(0, 2), 'left', 400), // correct
      makeResult(makeTrial(1, 3), 'right', 420), // correct
      makeResult(makeTrial(2, 6), 'left', 500), // WRONG (high -> right)
      makeResult(makeTrial(3, 7), 'right', 520), // correct (high -> right)
    ];
    const summary = computeSummary(results);
    expect(summary.accuracy).toBe(75);
    expect(summary.correctTrials).toBe(3);
    expect(summary.totalTrials).toBe(4);
  });

  it('handles 100% accuracy', () => {
    const results: TaskSwitchingTrialResult[] = [
      makeResult(makeTrial(0, 2), 'left', 400),
      makeResult(makeTrial(1, 3), 'right', 420),
    ];
    const summary = computeSummary(results);
    expect(summary.accuracy).toBe(100);
  });

  it('handles 0% accuracy', () => {
    const results: TaskSwitchingTrialResult[] = [
      makeResult(makeTrial(0, 2), 'right', 400), // WRONG
      makeResult(makeTrial(1, 3), 'left', 420), // WRONG
    ];
    const summary = computeSummary(results);
    expect(summary.accuracy).toBe(0);
  });

  it('computes meanRt from non-timed-out trials', () => {
    const results: TaskSwitchingTrialResult[] = [
      makeResult(makeTrial(0, 2), 'left', 400),
      makeResult(makeTrial(1, 4), null, 2500, true),
      makeResult(makeTrial(2, 6), 'right', 600),
    ];
    const summary = computeSummary(results);
    expect(summary.meanRtMs).toBe(500); // (400+600)/2
  });

  it('counts timeouts', () => {
    const results: TaskSwitchingTrialResult[] = [
      makeResult(makeTrial(0, 2), 'left', 400),
      makeResult(makeTrial(1, 4), null, 2500, true),
      makeResult(makeTrial(2, 6), null, 2500, true),
    ];
    const summary = computeSummary(results);
    expect(summary.timeouts).toBe(2);
  });

  it('breaks down switch vs repeat stats', () => {
    const results: TaskSwitchingTrialResult[] = [
      makeResult(makeTrial(0, 2), 'left', 400), // repeat, correct
      makeResult(makeTrial(1, 3), 'right', 420), // repeat, correct
      makeResult(makeTrial(2, 6), 'right', 550), // switch, correct
      makeResult(makeTrial(3, 7), 'right', 500), // repeat, correct
    ];
    const summary = computeSummary(results);
    expect(summary.switchTrials).toBe(1);
    expect(summary.repeatTrials).toBe(3);
    expect(summary.switchCorrect).toBe(1);
    expect(summary.repeatCorrect).toBe(3);
  });

  it('computes switch and repeat accuracy', () => {
    const results: TaskSwitchingTrialResult[] = [
      makeResult(makeTrial(0, 2), 'left', 400), // repeat correct
      makeResult(makeTrial(1, 3), 'left', 420), // repeat WRONG
      makeResult(makeTrial(2, 6), 'right', 550), // switch correct
      makeResult(makeTrial(4, 8), 'right', 500), // switch WRONG (even -> left)
    ];
    const summary = computeSummary(results);
    expect(summary.repeatAccuracy).toBe(50);
    expect(summary.switchAccuracy).toBe(50);
  });

  it('handles empty results', () => {
    const summary = computeSummary([]);
    expect(summary.accuracy).toBe(0);
    expect(summary.totalTrials).toBe(0);
    expect(summary.meanRtMs).toBe(0);
    expect(summary.switchCostMs).toBe(0);
    expect(summary.timeouts).toBe(0);
  });
});
