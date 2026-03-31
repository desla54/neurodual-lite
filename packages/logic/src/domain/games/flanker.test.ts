import { describe, it, expect } from 'bun:test';
import {
  type FlankerTrial,
  type FlankerTrialResult,
  generateTrials,
  buildDisplay,
  isResponseCorrect,
  computeCongruencyEffect,
  computeSummary,
  CONDITIONS,
} from './flanker';

// =============================================================================
// Helpers
// =============================================================================

function makeTrial(target: 'left' | 'right', flanker: 'left' | 'right'): FlankerTrial {
  return {
    targetDirection: target,
    flankerDirection: flanker,
    congruent: target === flanker,
    display: buildDisplay(target, flanker),
  };
}

function makeResult(
  trial: FlankerTrial,
  response: 'left' | 'right' | null,
  rt: number,
  timedOut = false,
): FlankerTrialResult {
  return {
    trial,
    response,
    correct: response !== null && isResponseCorrect(trial, response),
    rt,
    timedOut,
  };
}

// =============================================================================
// 1. Trial Generation — 4 conditions balanced 25% each
// =============================================================================

describe('Flanker — Trial generation', () => {
  it('generates the correct number of trials', () => {
    const trials = generateTrials(24);
    expect(trials).toHaveLength(24);
  });

  it('produces exactly 25% of each condition for multiples of 4', () => {
    const trials = generateTrials(24);
    const congruentLeft = trials.filter((t) => t.congruent && t.targetDirection === 'left').length;
    const congruentRight = trials.filter(
      (t) => t.congruent && t.targetDirection === 'right',
    ).length;
    const incongruentLeft = trials.filter(
      (t) => !t.congruent && t.targetDirection === 'left',
    ).length;
    const incongruentRight = trials.filter(
      (t) => !t.congruent && t.targetDirection === 'right',
    ).length;
    expect(congruentLeft).toBe(6);
    expect(congruentRight).toBe(6);
    expect(incongruentLeft).toBe(6);
    expect(incongruentRight).toBe(6);
  });

  it('produces balanced conditions for different counts', () => {
    for (const count of [8, 16, 32]) {
      const trials = generateTrials(count);
      expect(trials).toHaveLength(count);
      const congruent = trials.filter((t) => t.congruent).length;
      const incongruent = trials.filter((t) => !t.congruent).length;
      expect(congruent).toBe(count / 2);
      expect(incongruent).toBe(count / 2);
    }
  });

  it('handles non-multiple-of-4 counts gracefully', () => {
    const trials = generateTrials(5);
    expect(trials).toHaveLength(5);
    // First 4 should cover all conditions, 5th repeats first
    const conditionKeys = trials.map((t) => `${t.targetDirection}-${t.flankerDirection}`);
    const unique = new Set(conditionKeys);
    expect(unique.size).toBe(4); // All 4 conditions present
  });

  it('trials are shuffled (not in sequential condition order)', () => {
    let foundShuffled = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      const trials = generateTrials(24);
      // Check if first 4 trials are NOT in the exact condition order
      const first4 = trials.slice(0, 4).map((t) => `${t.targetDirection}-${t.flankerDirection}`);
      const expected = CONDITIONS.map((c) => `${c.target}-${c.flanker}`);
      if (JSON.stringify(first4) !== JSON.stringify(expected)) {
        foundShuffled = true;
        break;
      }
    }
    expect(foundShuffled).toBe(true);
  });

  it('uses the provided RNG for reproducibility', () => {
    let seed = 42;
    const rng = () => {
      seed = (seed * 16807 + 0) % 2147483647;
      return seed / 2147483647;
    };
    const a = generateTrials(24, rng);

    seed = 42;
    const b = generateTrials(24, rng);

    expect(a.map((t) => t.targetDirection)).toEqual(b.map((t) => t.targetDirection));
  });
});

// =============================================================================
// 2. Display building — congruent vs incongruent
// =============================================================================

describe('Flanker — Display building', () => {
  it('congruent-left: all 5 arrows point left', () => {
    const display = buildDisplay('left', 'left');
    expect(display).toEqual(['left', 'left', 'left', 'left', 'left']);
  });

  it('congruent-right: all 5 arrows point right', () => {
    const display = buildDisplay('right', 'right');
    expect(display).toEqual(['right', 'right', 'right', 'right', 'right']);
  });

  it('incongruent: flankers opposite to target', () => {
    const display = buildDisplay('left', 'right');
    expect(display).toEqual(['right', 'right', 'left', 'right', 'right']);
  });

  it('incongruent (reversed): flankers opposite to target', () => {
    const display = buildDisplay('right', 'left');
    expect(display).toEqual(['left', 'left', 'right', 'left', 'left']);
  });

  it('center arrow (index 2) is always the target', () => {
    expect(buildDisplay('left', 'right')[2]).toBe('left');
    expect(buildDisplay('right', 'left')[2]).toBe('right');
    expect(buildDisplay('left', 'left')[2]).toBe('left');
    expect(buildDisplay('right', 'right')[2]).toBe('right');
  });

  it('generated trials have correct display arrays', () => {
    const trials = generateTrials(24);
    for (const trial of trials) {
      expect(trial.display).toHaveLength(5);
      expect(trial.display[2]).toBe(trial.targetDirection);
      expect(trial.display[0]).toBe(trial.flankerDirection);
      expect(trial.display[1]).toBe(trial.flankerDirection);
      expect(trial.display[3]).toBe(trial.flankerDirection);
      expect(trial.display[4]).toBe(trial.flankerDirection);
    }
  });
});

// =============================================================================
// 3. Response validation
// =============================================================================

describe('Flanker — Response validation', () => {
  it('correct when response matches target direction (congruent-left)', () => {
    const trial = makeTrial('left', 'left');
    expect(isResponseCorrect(trial, 'left')).toBe(true);
    expect(isResponseCorrect(trial, 'right')).toBe(false);
  });

  it('correct when response matches target direction (congruent-right)', () => {
    const trial = makeTrial('right', 'right');
    expect(isResponseCorrect(trial, 'right')).toBe(true);
    expect(isResponseCorrect(trial, 'left')).toBe(false);
  });

  it('correct when response matches CENTER arrow in incongruent-left', () => {
    const trial = makeTrial('left', 'right');
    // Flankers point right, but correct answer is LEFT (center arrow)
    expect(isResponseCorrect(trial, 'left')).toBe(true);
    expect(isResponseCorrect(trial, 'right')).toBe(false);
  });

  it('correct when response matches CENTER arrow in incongruent-right', () => {
    const trial = makeTrial('right', 'left');
    // Flankers point left, but correct answer is RIGHT (center arrow)
    expect(isResponseCorrect(trial, 'right')).toBe(true);
    expect(isResponseCorrect(trial, 'left')).toBe(false);
  });
});

// =============================================================================
// 4. Congruency effect calculation
// =============================================================================

describe('Flanker — Congruency effect', () => {
  it('positive when incongruent RT > congruent RT', () => {
    const results: FlankerTrialResult[] = [
      makeResult(makeTrial('left', 'left'), 'left', 400), // congruent correct
      makeResult(makeTrial('right', 'right'), 'right', 420), // congruent correct
      makeResult(makeTrial('left', 'right'), 'left', 500), // incongruent correct
      makeResult(makeTrial('right', 'left'), 'right', 520), // incongruent correct
    ];
    const effect = computeCongruencyEffect(results);
    // mean incongruent (510) - mean congruent (410) = 100
    expect(effect).toBe(100);
  });

  it('zero when congruent and incongruent RTs are equal', () => {
    const results: FlankerTrialResult[] = [
      makeResult(makeTrial('left', 'left'), 'left', 450),
      makeResult(makeTrial('left', 'right'), 'left', 450),
    ];
    expect(computeCongruencyEffect(results)).toBe(0);
  });

  it('negative when congruent RT > incongruent RT (unusual but possible)', () => {
    const results: FlankerTrialResult[] = [
      makeResult(makeTrial('left', 'left'), 'left', 600),
      makeResult(makeTrial('left', 'right'), 'left', 400),
    ];
    expect(computeCongruencyEffect(results)).toBe(-200);
  });

  it('ignores timed-out trials', () => {
    const results: FlankerTrialResult[] = [
      makeResult(makeTrial('left', 'left'), 'left', 400),
      makeResult(makeTrial('left', 'left'), null, 2000, true), // timed out
      makeResult(makeTrial('left', 'right'), 'left', 500),
    ];
    const effect = computeCongruencyEffect(results);
    expect(effect).toBe(100); // 500 - 400
  });

  it('ignores incorrect trials', () => {
    const results: FlankerTrialResult[] = [
      makeResult(makeTrial('left', 'left'), 'left', 400), // correct
      makeResult(makeTrial('right', 'right'), 'left', 9999), // WRONG — should be ignored
      makeResult(makeTrial('left', 'right'), 'left', 500), // correct
    ];
    const effect = computeCongruencyEffect(results);
    // Only one congruent correct (400), one incongruent correct (500)
    expect(effect).toBe(100);
  });

  it('returns 0 when no valid trials exist', () => {
    expect(computeCongruencyEffect([])).toBe(0);
  });
});

// =============================================================================
// 5. Summary computation
// =============================================================================

describe('Flanker — Summary computation', () => {
  it('computes accuracy correctly', () => {
    const results: FlankerTrialResult[] = [
      makeResult(makeTrial('left', 'left'), 'left', 400), // correct
      makeResult(makeTrial('right', 'right'), 'right', 420), // correct
      makeResult(makeTrial('left', 'right'), 'right', 500), // WRONG
      makeResult(makeTrial('right', 'left'), 'right', 520), // correct
    ];
    const summary = computeSummary(results);
    expect(summary.accuracy).toBe(75); // 3/4
    expect(summary.correctTrials).toBe(3);
    expect(summary.totalTrials).toBe(4);
  });

  it('100% accuracy when all correct', () => {
    const results: FlankerTrialResult[] = [
      makeResult(makeTrial('left', 'left'), 'left', 400),
      makeResult(makeTrial('right', 'right'), 'right', 420),
      makeResult(makeTrial('left', 'right'), 'left', 500),
      makeResult(makeTrial('right', 'left'), 'right', 520),
    ];
    const summary = computeSummary(results);
    expect(summary.accuracy).toBe(100);
  });

  it('0% accuracy when all wrong', () => {
    const results: FlankerTrialResult[] = [
      makeResult(makeTrial('left', 'left'), 'right', 400),
      makeResult(makeTrial('right', 'right'), 'left', 420),
    ];
    const summary = computeSummary(results);
    expect(summary.accuracy).toBe(0);
  });

  it('computes avgRT from non-timed-out trials only', () => {
    const results: FlankerTrialResult[] = [
      makeResult(makeTrial('left', 'left'), 'left', 400),
      makeResult(makeTrial('right', 'right'), null, 2000, true), // timed out
      makeResult(makeTrial('left', 'right'), 'left', 600),
    ];
    const summary = computeSummary(results);
    expect(summary.avgRT).toBe(500); // (400 + 600) / 2
  });

  it('avgRT is 0 when all trials timed out', () => {
    const results: FlankerTrialResult[] = [
      makeResult(makeTrial('left', 'left'), null, 2000, true),
      makeResult(makeTrial('right', 'right'), null, 2000, true),
    ];
    const summary = computeSummary(results);
    expect(summary.avgRT).toBe(0);
  });

  it('breaks down congruent vs incongruent stats', () => {
    const results: FlankerTrialResult[] = [
      makeResult(makeTrial('left', 'left'), 'left', 400), // congruent correct
      makeResult(makeTrial('right', 'right'), 'left', 420), // congruent wrong
      makeResult(makeTrial('left', 'right'), 'left', 500), // incongruent correct
      makeResult(makeTrial('right', 'left'), 'left', 520), // incongruent wrong
    ];
    const summary = computeSummary(results);
    expect(summary.congruentCorrect).toBe(1);
    expect(summary.congruentTotal).toBe(2);
    expect(summary.incongruentCorrect).toBe(1);
    expect(summary.incongruentTotal).toBe(2);
  });

  it('computes congruencyEffect (rounded)', () => {
    const results: FlankerTrialResult[] = [
      makeResult(makeTrial('left', 'left'), 'left', 401),
      makeResult(makeTrial('left', 'right'), 'left', 502),
    ];
    const summary = computeSummary(results);
    expect(summary.congruencyEffect).toBe(101);
  });

  it('handles empty results', () => {
    const summary = computeSummary([]);
    expect(summary.accuracy).toBe(0);
    expect(summary.avgRT).toBe(0);
    expect(summary.totalTrials).toBe(0);
    expect(summary.congruencyEffect).toBe(0);
  });

  it('timeout trials count as incorrect for accuracy', () => {
    const results: FlankerTrialResult[] = [
      makeResult(makeTrial('left', 'left'), 'left', 400), // correct
      makeResult(makeTrial('right', 'right'), null, 2000, true), // timed out = incorrect
    ];
    const summary = computeSummary(results);
    expect(summary.accuracy).toBe(50);
    expect(summary.correctTrials).toBe(1);
  });
});
