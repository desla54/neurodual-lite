import { describe, it, expect } from 'bun:test';
import {
  type CptTrial,
  type CptTrialResult,
  generateTrials,
  getOutcome,
  isCorrectOutcome,
  computeDPrime,
  computeRtCoefficientOfVariation,
  computeBlockMeanRTs,
  computeSummary,
  TARGET_LETTER,
  TARGET_RATIO,
  NON_TARGET_LETTERS,
} from './cpt';

// =============================================================================
// Helpers
// =============================================================================

function makeTrial(isTarget: boolean): CptTrial {
  return { letter: isTarget ? TARGET_LETTER : 'A', isTarget };
}

function makeResult(isTarget: boolean, responded: boolean, rt = 0): CptTrialResult {
  const trial = makeTrial(isTarget);
  const outcome = getOutcome(isTarget, responded);
  return { trial, responded, rt, outcome };
}

// =============================================================================
// 1. Trial Generation
// =============================================================================

describe('CPT — Trial generation', () => {
  it('generates the correct number of trials', () => {
    const trials = generateTrials(50);
    expect(trials).toHaveLength(50);
  });

  it('has ~10% targets', () => {
    const trials = generateTrials(50);
    const targetCount = trials.filter((t) => t.isTarget).length;
    expect(targetCount).toBe(Math.round(50 * TARGET_RATIO)); // 5
  });

  it('target trials use the letter X', () => {
    const trials = generateTrials(50);
    for (const t of trials) {
      if (t.isTarget) expect(t.letter).toBe(TARGET_LETTER);
    }
  });

  it('non-target trials do not use X', () => {
    const trials = generateTrials(50);
    for (const t of trials) {
      if (!t.isTarget) expect(t.letter).not.toBe(TARGET_LETTER);
    }
  });

  it('non-target letters are from the valid set', () => {
    const trials = generateTrials(100);
    for (const t of trials) {
      if (!t.isTarget) {
        expect(NON_TARGET_LETTERS).toContain(t.letter);
      }
    }
  });

  it('trials are shuffled', () => {
    let foundMixed = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      const trials = generateTrials(50);
      const first20 = trials.slice(0, 20);
      const hasTarget = first20.some((t) => t.isTarget);
      const hasNonTarget = first20.some((t) => !t.isTarget);
      if (hasTarget && hasNonTarget) {
        foundMixed = true;
        break;
      }
    }
    expect(foundMixed).toBe(true);
  });

  it('uses the provided RNG for reproducibility', () => {
    const makeRng = () => {
      let s = 42;
      return () => {
        s = (s * 16807 + 0) % 2147483647;
        return s / 2147483647;
      };
    };
    const a = generateTrials(30, makeRng());
    const b = generateTrials(30, makeRng());
    expect(a.map((t) => t.letter)).toEqual(b.map((t) => t.letter));
  });
});

// =============================================================================
// 2. Outcome Classification (SDT)
// =============================================================================

describe('CPT — getOutcome', () => {
  it('target + responded = hit', () => {
    expect(getOutcome(true, true)).toBe('hit');
  });

  it('target + no response = miss', () => {
    expect(getOutcome(true, false)).toBe('miss');
  });

  it('non-target + responded = false_alarm', () => {
    expect(getOutcome(false, true)).toBe('false_alarm');
  });

  it('non-target + no response = correct_rejection', () => {
    expect(getOutcome(false, false)).toBe('correct_rejection');
  });
});

describe('CPT — isCorrectOutcome', () => {
  it('hit is correct', () => expect(isCorrectOutcome('hit')).toBe(true));
  it('correct_rejection is correct', () =>
    expect(isCorrectOutcome('correct_rejection')).toBe(true));
  it('miss is incorrect', () => expect(isCorrectOutcome('miss')).toBe(false));
  it('false_alarm is incorrect', () => expect(isCorrectOutcome('false_alarm')).toBe(false));
});

// =============================================================================
// 3. d-prime
// =============================================================================

describe('CPT — computeDPrime', () => {
  it('returns 0 when no signal trials', () => {
    expect(computeDPrime(0, 0, 5, 10)).toBe(0);
  });

  it('returns 0 when no noise trials', () => {
    expect(computeDPrime(5, 5, 0, 0)).toBe(0);
  });

  it('returns positive d-prime for perfect performance', () => {
    const dp = computeDPrime(10, 0, 0, 10);
    expect(dp).toBeGreaterThan(2);
  });

  it('returns near-zero d-prime for chance performance', () => {
    const dp = computeDPrime(5, 5, 5, 5);
    expect(Math.abs(dp)).toBeLessThan(0.5);
  });

  it('returns negative d-prime for anti-discriminability', () => {
    const dp = computeDPrime(0, 10, 10, 0);
    expect(dp).toBeLessThan(-2);
  });

  it('handles edge case of all hits, some FA', () => {
    const dp = computeDPrime(10, 0, 3, 7);
    expect(dp).toBeGreaterThan(0);
  });

  it('handles deep tail probabilities without infinities (very high sensitivity)', () => {
    const dp = computeDPrime(1000, 0, 0, 1000);
    expect(Number.isFinite(dp)).toBe(true);
    expect(dp).toBeGreaterThan(4);
  });

  it('handles deep tail probabilities without infinities (very low sensitivity)', () => {
    const dp = computeDPrime(0, 1000, 1000, 0);
    expect(Number.isFinite(dp)).toBe(true);
    expect(dp).toBeLessThan(-4);
  });
});

// =============================================================================
// 4. RT Variability — Sustained Attention
// =============================================================================

describe('CPT — computeRtCoefficientOfVariation', () => {
  it('returns 0 for fewer than 2 values', () => {
    expect(computeRtCoefficientOfVariation([])).toBe(0);
    expect(computeRtCoefficientOfVariation([100])).toBe(0);
  });

  it('returns 0 for identical RTs', () => {
    expect(computeRtCoefficientOfVariation([200, 200, 200])).toBe(0);
  });

  it('returns higher CV for more variable RTs', () => {
    const lowVar = computeRtCoefficientOfVariation([100, 102, 98, 101]);
    const highVar = computeRtCoefficientOfVariation([50, 200, 80, 300]);
    expect(highVar).toBeGreaterThan(lowVar);
  });

  it('computes correct CV for known values', () => {
    // [100, 200] -> mean=150, stdDev=50, CV=50/150 = 0.333
    const cv = computeRtCoefficientOfVariation([100, 200]);
    expect(cv).toBeCloseTo(0.333, 2);
  });
});

describe('CPT — computeBlockMeanRTs', () => {
  it('returns empty for empty input', () => {
    expect(computeBlockMeanRTs([], 5)).toEqual([]);
  });

  it('returns empty for block size 0', () => {
    expect(computeBlockMeanRTs([100, 200], 0)).toEqual([]);
  });

  it('splits into correct number of blocks', () => {
    const rts = [100, 200, 300, 400, 500, 600];
    const blocks = computeBlockMeanRTs(rts, 3);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toBe(200); // mean(100,200,300)
    expect(blocks[1]).toBe(500); // mean(400,500,600)
  });

  it('handles partial last block', () => {
    const blocks = computeBlockMeanRTs([100, 200, 300, 400, 500], 3);
    expect(blocks).toHaveLength(2);
    expect(blocks[1]).toBe(450); // mean(400,500)
  });
});

// =============================================================================
// 5. Summary
// =============================================================================

describe('CPT — computeSummary', () => {
  it('computes correct summary for perfect performance', () => {
    const results: CptTrialResult[] = [
      makeResult(true, true, 250), // hit
      makeResult(false, false), // CR
      makeResult(false, false), // CR
      makeResult(true, true, 300), // hit
      makeResult(false, false), // CR
    ];
    const s = computeSummary(results);
    expect(s.hits).toBe(2);
    expect(s.misses).toBe(0);
    expect(s.falseAlarms).toBe(0);
    expect(s.correctRejections).toBe(3);
    expect(s.accuracy).toBe(100);
    expect(s.avgRT).toBe(275); // (250+300)/2
    expect(s.targetCount).toBe(2);
    expect(s.nonTargetCount).toBe(3);
    expect(s.dPrime).toBeGreaterThan(2);
  });

  it('computes correct summary with errors', () => {
    const results: CptTrialResult[] = [
      makeResult(true, false), // miss
      makeResult(false, true, 150), // false alarm
      makeResult(true, true, 200), // hit
      makeResult(false, false), // CR
    ];
    const s = computeSummary(results);
    expect(s.hits).toBe(1);
    expect(s.misses).toBe(1);
    expect(s.falseAlarms).toBe(1);
    expect(s.correctRejections).toBe(1);
    expect(s.accuracy).toBe(50);
    expect(s.hitRate).toBe(50);
    expect(s.falseAlarmRate).toBe(50);
  });

  it('handles empty results', () => {
    const s = computeSummary([]);
    expect(s.accuracy).toBe(0);
    expect(s.avgRT).toBe(0);
    expect(s.totalTrials).toBe(0);
    expect(s.dPrime).toBe(0);
  });

  it('includes RT coefficient of variation', () => {
    const results: CptTrialResult[] = [
      makeResult(true, true, 200),
      makeResult(true, true, 400),
      makeResult(false, false),
    ];
    const s = computeSummary(results);
    expect(s.rtCoefficientOfVariation).toBeGreaterThan(0);
  });

  it('avgRT only counts hit trials', () => {
    const results: CptTrialResult[] = [
      makeResult(true, true, 200), // hit — counts
      makeResult(false, true, 1000), // false alarm — does NOT count
      makeResult(true, true, 400), // hit — counts
    ];
    const s = computeSummary(results);
    expect(s.avgRT).toBe(300); // (200+400)/2, not including the FA's RT
  });
});
