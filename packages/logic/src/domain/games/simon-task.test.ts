import { describe, it, expect } from 'bun:test';
import {
  type SimonTrial,
  type SimonTrialResult,
  generateTrials,
  isCongruent,
  isResponseCorrect,
  computeSimonEffect,
  computeSummary,
  CONDITIONS,
} from './simon-task';

// =============================================================================
// Helpers
// =============================================================================

function makeTrial(color: 'red' | 'blue', side: 'left' | 'right'): SimonTrial {
  return {
    stimulusColor: color,
    stimulusSide: side,
    congruent: isCongruent(color, side),
  };
}

function makeResult(
  trial: SimonTrial,
  response: 'red' | 'blue' | null,
  rt: number,
  timedOut = false,
): SimonTrialResult {
  return {
    trial,
    response,
    correct: response !== null && isResponseCorrect(trial, response),
    rt,
    timedOut,
  };
}

// =============================================================================
// 1. Congruency classification
// =============================================================================

describe('Simon — Congruency classification', () => {
  it('red on left side is congruent', () => {
    expect(isCongruent('red', 'left')).toBe(true);
  });

  it('blue on right side is congruent', () => {
    expect(isCongruent('blue', 'right')).toBe(true);
  });

  it('red on right side is incongruent', () => {
    expect(isCongruent('red', 'right')).toBe(false);
  });

  it('blue on left side is incongruent', () => {
    expect(isCongruent('blue', 'left')).toBe(false);
  });
});

// =============================================================================
// 2. Trial generation — 4 conditions balanced 25% each
// =============================================================================

describe('Simon — Trial generation', () => {
  it('generates the correct number of trials', () => {
    const trials = generateTrials(24);
    expect(trials).toHaveLength(24);
  });

  it('produces exactly 25% of each condition for multiples of 4', () => {
    const trials = generateTrials(24);
    const redLeft = trials.filter(
      (t) => t.stimulusColor === 'red' && t.stimulusSide === 'left',
    ).length;
    const redRight = trials.filter(
      (t) => t.stimulusColor === 'red' && t.stimulusSide === 'right',
    ).length;
    const blueLeft = trials.filter(
      (t) => t.stimulusColor === 'blue' && t.stimulusSide === 'left',
    ).length;
    const blueRight = trials.filter(
      (t) => t.stimulusColor === 'blue' && t.stimulusSide === 'right',
    ).length;
    expect(redLeft).toBe(6);
    expect(redRight).toBe(6);
    expect(blueLeft).toBe(6);
    expect(blueRight).toBe(6);
  });

  it('50% congruent and 50% incongruent', () => {
    const trials = generateTrials(24);
    const congruent = trials.filter((t) => t.congruent).length;
    const incongruent = trials.filter((t) => !t.congruent).length;
    expect(congruent).toBe(12);
    expect(incongruent).toBe(12);
  });

  it('trials are shuffled', () => {
    let foundShuffled = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      const trials = generateTrials(24);
      const first4 = trials.slice(0, 4).map((t) => `${t.stimulusColor}-${t.stimulusSide}`);
      const expected = CONDITIONS.map((c) => `${c.color}-${c.side}`);
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

    expect(a.map((t) => t.stimulusColor)).toEqual(b.map((t) => t.stimulusColor));
  });

  it('congruency field matches isCongruent logic', () => {
    const trials = generateTrials(24);
    for (const trial of trials) {
      expect(trial.congruent).toBe(isCongruent(trial.stimulusColor, trial.stimulusSide));
    }
  });
});

// =============================================================================
// 3. Response validation
// =============================================================================

describe('Simon — Response validation', () => {
  it('correct response = stimulus color (red stimulus -> red response)', () => {
    const trial = makeTrial('red', 'left');
    expect(isResponseCorrect(trial, 'red')).toBe(true);
    expect(isResponseCorrect(trial, 'blue')).toBe(false);
  });

  it('correct response = stimulus color (blue stimulus -> blue response)', () => {
    const trial = makeTrial('blue', 'right');
    expect(isResponseCorrect(trial, 'blue')).toBe(true);
    expect(isResponseCorrect(trial, 'red')).toBe(false);
  });

  it('position does NOT matter — red on right still needs red response', () => {
    const trial = makeTrial('red', 'right'); // incongruent
    expect(isResponseCorrect(trial, 'red')).toBe(true);
    expect(isResponseCorrect(trial, 'blue')).toBe(false);
  });

  it('position does NOT matter — blue on left still needs blue response', () => {
    const trial = makeTrial('blue', 'left'); // incongruent
    expect(isResponseCorrect(trial, 'blue')).toBe(true);
    expect(isResponseCorrect(trial, 'red')).toBe(false);
  });
});

// =============================================================================
// 4. Simon effect calculation
// =============================================================================

describe('Simon — Simon effect', () => {
  it('positive when incongruent RT > congruent RT', () => {
    const results: SimonTrialResult[] = [
      makeResult(makeTrial('red', 'left'), 'red', 400), // congruent correct
      makeResult(makeTrial('blue', 'right'), 'blue', 420), // congruent correct
      makeResult(makeTrial('red', 'right'), 'red', 500), // incongruent correct
      makeResult(makeTrial('blue', 'left'), 'blue', 520), // incongruent correct
    ];
    const effect = computeSimonEffect(results);
    // mean incongruent (510) - mean congruent (410) = 100
    expect(effect).toBe(100);
  });

  it('zero when congruent and incongruent RTs are equal', () => {
    const results: SimonTrialResult[] = [
      makeResult(makeTrial('red', 'left'), 'red', 450),
      makeResult(makeTrial('red', 'right'), 'red', 450),
    ];
    expect(computeSimonEffect(results)).toBe(0);
  });

  it('ignores timed-out trials', () => {
    const results: SimonTrialResult[] = [
      makeResult(makeTrial('red', 'left'), 'red', 400),
      makeResult(makeTrial('red', 'left'), null, 2000, true), // timed out
      makeResult(makeTrial('red', 'right'), 'red', 500),
    ];
    const effect = computeSimonEffect(results);
    expect(effect).toBe(100); // 500 - 400
  });

  it('ignores incorrect trials', () => {
    const results: SimonTrialResult[] = [
      makeResult(makeTrial('red', 'left'), 'red', 400), // congruent correct
      makeResult(makeTrial('blue', 'right'), 'red', 9999), // congruent WRONG
      makeResult(makeTrial('red', 'right'), 'red', 500), // incongruent correct
    ];
    const effect = computeSimonEffect(results);
    expect(effect).toBe(100); // Only one valid congruent (400) and one valid incongruent (500)
  });

  it('returns 0 when no valid trials exist', () => {
    expect(computeSimonEffect([])).toBe(0);
  });

  it('negative when congruent RT > incongruent RT', () => {
    const results: SimonTrialResult[] = [
      makeResult(makeTrial('red', 'left'), 'red', 600),
      makeResult(makeTrial('red', 'right'), 'red', 400),
    ];
    expect(computeSimonEffect(results)).toBe(-200);
  });
});

// =============================================================================
// 5. Summary computation
// =============================================================================

describe('Simon — Summary computation', () => {
  it('computes accuracy correctly', () => {
    const results: SimonTrialResult[] = [
      makeResult(makeTrial('red', 'left'), 'red', 400), // correct
      makeResult(makeTrial('blue', 'right'), 'blue', 420), // correct
      makeResult(makeTrial('red', 'right'), 'blue', 500), // WRONG
      makeResult(makeTrial('blue', 'left'), 'blue', 520), // correct
    ];
    const summary = computeSummary(results);
    expect(summary.accuracy).toBe(75);
    expect(summary.correctTrials).toBe(3);
    expect(summary.totalTrials).toBe(4);
  });

  it('100% accuracy when all correct', () => {
    const results: SimonTrialResult[] = [
      makeResult(makeTrial('red', 'left'), 'red', 400),
      makeResult(makeTrial('blue', 'right'), 'blue', 420),
      makeResult(makeTrial('red', 'right'), 'red', 500),
      makeResult(makeTrial('blue', 'left'), 'blue', 520),
    ];
    expect(computeSummary(results).accuracy).toBe(100);
  });

  it('0% accuracy when all wrong', () => {
    const results: SimonTrialResult[] = [
      makeResult(makeTrial('red', 'left'), 'blue', 400),
      makeResult(makeTrial('blue', 'right'), 'red', 420),
    ];
    expect(computeSummary(results).accuracy).toBe(0);
  });

  it('computes avgRT from non-timed-out trials only', () => {
    const results: SimonTrialResult[] = [
      makeResult(makeTrial('red', 'left'), 'red', 400),
      makeResult(makeTrial('blue', 'right'), null, 2000, true),
      makeResult(makeTrial('red', 'right'), 'red', 600),
    ];
    const summary = computeSummary(results);
    expect(summary.avgRT).toBe(500); // (400 + 600) / 2
  });

  it('avgRT is 0 when all trials timed out', () => {
    const results: SimonTrialResult[] = [
      makeResult(makeTrial('red', 'left'), null, 2000, true),
      makeResult(makeTrial('blue', 'right'), null, 2000, true),
    ];
    expect(computeSummary(results).avgRT).toBe(0);
  });

  it('breaks down congruent vs incongruent stats', () => {
    const results: SimonTrialResult[] = [
      makeResult(makeTrial('red', 'left'), 'red', 400), // congruent correct
      makeResult(makeTrial('blue', 'right'), 'red', 420), // congruent WRONG
      makeResult(makeTrial('red', 'right'), 'red', 500), // incongruent correct
      makeResult(makeTrial('blue', 'left'), 'red', 520), // incongruent WRONG
    ];
    const summary = computeSummary(results);
    expect(summary.congruentCorrect).toBe(1);
    expect(summary.congruentTotal).toBe(2);
    expect(summary.incongruentCorrect).toBe(1);
    expect(summary.incongruentTotal).toBe(2);
  });

  it('computes simonEffect (rounded)', () => {
    const results: SimonTrialResult[] = [
      makeResult(makeTrial('red', 'left'), 'red', 401),
      makeResult(makeTrial('red', 'right'), 'red', 502),
    ];
    const summary = computeSummary(results);
    expect(summary.simonEffect).toBe(101);
  });

  it('handles empty results', () => {
    const summary = computeSummary([]);
    expect(summary.accuracy).toBe(0);
    expect(summary.avgRT).toBe(0);
    expect(summary.totalTrials).toBe(0);
    expect(summary.simonEffect).toBe(0);
  });

  it('timeout trials count as incorrect for accuracy', () => {
    const results: SimonTrialResult[] = [
      makeResult(makeTrial('red', 'left'), 'red', 400),
      makeResult(makeTrial('blue', 'right'), null, 2000, true),
    ];
    const summary = computeSummary(results);
    expect(summary.accuracy).toBe(50);
    expect(summary.correctTrials).toBe(1);
  });
});
