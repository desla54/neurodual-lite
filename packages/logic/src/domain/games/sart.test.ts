import { describe, it, expect } from 'bun:test';
import {
  type SartTrial,
  type SartTrialResult,
  DEFAULT_NOGO_DIGIT,
  generateTrials,
  classifyOutcome,
  isCorrectOutcome,
  computeRtStdDev,
  computeRtCoefficientOfVariation,
  computeSummary,
} from './sart';

// =============================================================================
// Helpers
// =============================================================================

function makeTrial(digit: number, noGoDigit = DEFAULT_NOGO_DIGIT): SartTrial {
  return { digit, isNoGo: digit === noGoDigit, fontSize: 72 };
}

function makeResult(
  digit: number,
  responded: boolean,
  rt: number = 0,
  noGoDigit = DEFAULT_NOGO_DIGIT,
): SartTrialResult {
  const trial = makeTrial(digit, noGoDigit);
  const outcome = classifyOutcome(trial.isNoGo, responded);
  return { trial, responded, rt, outcome };
}

// =============================================================================
// 1. Trial generation
// =============================================================================

describe('SART — Trial generation', () => {
  it('generates the correct number of trials', () => {
    expect(generateTrials(45)).toHaveLength(45);
    expect(generateTrials(9)).toHaveLength(9);
    expect(generateTrials(10)).toHaveLength(10);
  });

  it('each full cycle of 9 contains exactly one no-go trial', () => {
    const trials = generateTrials(9);
    const nogoCount = trials.filter((t) => t.isNoGo).length;
    expect(nogoCount).toBe(1);
    expect(trials.find((t) => t.isNoGo)?.digit).toBe(DEFAULT_NOGO_DIGIT);
  });

  it('45 trials = 5 full cycles, exactly 5 no-go trials', () => {
    const trials = generateTrials(45);
    const nogoCount = trials.filter((t) => t.isNoGo).length;
    expect(nogoCount).toBe(5);
  });

  it('digits within a cycle contain 1-9', () => {
    const trials = generateTrials(9);
    const digits = trials.map((t) => t.digit).sort((a, b) => a - b);
    expect(digits).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('cycles are shuffled (not always sequential)', () => {
    let foundNonSequential = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      const trials = generateTrials(9);
      const digits = trials.map((t) => t.digit);
      if (digits[0] !== 1 || digits[1] !== 2) {
        foundNonSequential = true;
        break;
      }
    }
    expect(foundNonSequential).toBe(true);
  });

  it('uses custom no-go digit', () => {
    const trials = generateTrials(9, 7);
    const nogoTrials = trials.filter((t) => t.isNoGo);
    expect(nogoTrials).toHaveLength(1);
    expect(nogoTrials[0]?.digit).toBe(7);
  });

  it('uses provided RNG for reproducibility', () => {
    let seed = 99;
    const rng = () => {
      seed = (seed * 16807 + 0) % 2147483647;
      return seed / 2147483647;
    };
    const a = generateTrials(18, 3, rng);

    seed = 99;
    const b = generateTrials(18, 3, rng);
    expect(a).toEqual(b);
  });

  it('each trial has a valid fontSize from the allowed set', () => {
    const trials = generateTrials(45);
    for (const t of trials) {
      expect([48, 60, 72, 84, 96, 108, 120]).toContain(t.fontSize);
    }
  });
});

// =============================================================================
// 2. Outcome classification
// =============================================================================

describe('SART — classifyOutcome', () => {
  it('go + responded = hit', () => {
    expect(classifyOutcome(false, true)).toBe('hit');
  });

  it('go + no response = miss (omission error)', () => {
    expect(classifyOutcome(false, false)).toBe('miss');
  });

  it('no-go + responded = false alarm (commission error)', () => {
    expect(classifyOutcome(true, true)).toBe('false_alarm');
  });

  it('no-go + no response = correct rejection', () => {
    expect(classifyOutcome(true, false)).toBe('correct_rejection');
  });
});

describe('SART — isCorrectOutcome', () => {
  it('hit and correct_rejection are correct', () => {
    expect(isCorrectOutcome('hit')).toBe(true);
    expect(isCorrectOutcome('correct_rejection')).toBe(true);
  });

  it('miss and false_alarm are incorrect', () => {
    expect(isCorrectOutcome('miss')).toBe(false);
    expect(isCorrectOutcome('false_alarm')).toBe(false);
  });
});

// =============================================================================
// 3. RT Variability
// =============================================================================

describe('SART — RT variability', () => {
  it('stddev of identical values is 0', () => {
    expect(computeRtStdDev([200, 200, 200])).toBe(0);
  });

  it('stddev of [200, 400] equals ~141.42', () => {
    const sd = computeRtStdDev([200, 400]);
    expect(Math.round(sd)).toBe(141);
  });

  it('stddev of empty/single array is 0', () => {
    expect(computeRtStdDev([])).toBe(0);
    expect(computeRtStdDev([300])).toBe(0);
  });

  it('coefficient of variation for identical values is 0', () => {
    expect(computeRtCoefficientOfVariation([300, 300, 300])).toBe(0);
  });

  it('coefficient of variation is stddev/mean', () => {
    const rts = [200, 300, 400];
    const cv = computeRtCoefficientOfVariation(rts);
    const sd = computeRtStdDev(rts);
    const m = 300;
    expect(cv).toBeCloseTo(sd / m, 4);
  });
});

// =============================================================================
// 4. Summary computation
// =============================================================================

describe('SART — computeSummary', () => {
  it('perfect session — all go responded, all no-go withheld', () => {
    const results: SartTrialResult[] = [
      makeResult(1, true, 250),
      makeResult(2, true, 260),
      makeResult(3, false), // no-go, withheld = correct rejection
      makeResult(4, true, 240),
      makeResult(5, true, 270),
    ];
    const s = computeSummary(results);
    expect(s.accuracy).toBe(100);
    expect(s.hits).toBe(4);
    expect(s.correctRejections).toBe(1);
    expect(s.misses).toBe(0);
    expect(s.falseAlarms).toBe(0);
    expect(s.commissionErrors).toBe(0);
    expect(s.omissionErrors).toBe(0);
  });

  it('commission error: tapped on no-go digit', () => {
    const results: SartTrialResult[] = [
      makeResult(1, true, 250),
      makeResult(3, true, 200), // false alarm
    ];
    const s = computeSummary(results);
    expect(s.falseAlarms).toBe(1);
    expect(s.commissionErrors).toBe(1);
    expect(s.falseAlarmRate).toBe(100);
  });

  it('omission error: failed to tap on go digit', () => {
    const results: SartTrialResult[] = [
      makeResult(1, false, 0), // miss
      makeResult(2, true, 300),
    ];
    const s = computeSummary(results);
    expect(s.misses).toBe(1);
    expect(s.omissionErrors).toBe(1);
    expect(s.hitRate).toBe(50); // 1 of 2 go trials
  });

  it('computes average RT from hit trials only', () => {
    const results: SartTrialResult[] = [
      makeResult(1, true, 200),
      makeResult(2, true, 400),
      makeResult(3, false), // no-go CR, no RT
      makeResult(4, false, 0), // miss, excluded
    ];
    const s = computeSummary(results);
    expect(s.avgRT).toBe(300); // (200+400)/2
  });

  it('computes RT variability metrics', () => {
    const results: SartTrialResult[] = [
      makeResult(1, true, 200),
      makeResult(2, true, 300),
      makeResult(4, true, 400),
    ];
    const s = computeSummary(results);
    expect(s.rtStdDev).toBeGreaterThan(0);
    expect(s.rtCV).toBeGreaterThan(0);
  });

  it('handles empty results', () => {
    const s = computeSummary([]);
    expect(s.accuracy).toBe(0);
    expect(s.totalTrials).toBe(0);
    expect(s.avgRT).toBe(0);
    expect(s.rtStdDev).toBe(0);
    expect(s.rtCV).toBe(0);
  });

  it('returns correct go/nogo counts', () => {
    const results: SartTrialResult[] = [
      makeResult(1, true, 200),
      makeResult(2, true, 250),
      makeResult(3, false),
      makeResult(4, true, 300),
    ];
    const s = computeSummary(results);
    expect(s.goCount).toBe(3);
    expect(s.nogoCount).toBe(1);
  });

  it('accuracy reflects both go and no-go performance', () => {
    const results: SartTrialResult[] = [
      makeResult(1, true, 200), // hit
      makeResult(2, false, 0), // miss
      makeResult(3, true, 150), // false alarm
      makeResult(4, true, 250), // hit
    ];
    const s = computeSummary(results);
    // 2 correct (2 hits) out of 4 = 50%
    expect(s.accuracy).toBe(50);
  });
});
