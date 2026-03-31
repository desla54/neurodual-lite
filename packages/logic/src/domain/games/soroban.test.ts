import { describe, it, expect } from 'bun:test';
import {
  digitToBeads,
  beadsToDigit,
  numberToDigits,
  digitsToNumber,
  getMaxValue,
  clampRodCount,
  clampTrialsCount,
  generateTrials,
  validateAnswer,
  computeSummary,
  MIN_RODS,
  MAX_RODS,
  DEFAULT_ROD_COUNT,
  MIN_TRIALS,
  MAX_TRIALS,
  DEFAULT_TOTAL_TRIALS,
  type SorobanTrialResult,
} from './soroban';

// =============================================================================
// Helpers
// =============================================================================

function makeResult(
  targetNumber: number,
  response: number,
  rt: number,
  rodCount = 2,
): SorobanTrialResult {
  return {
    trial: { targetNumber, rodCount },
    response,
    correct: response === targetNumber,
    rt,
  };
}

// =============================================================================
// 1. Bead ↔ Digit Conversion
// =============================================================================

describe('Soroban — digitToBeads', () => {
  it('converts 0 to no beads', () => {
    const b = digitToBeads(0);
    expect(b.heaven).toBe(false);
    expect(b.earth).toBe(0);
  });

  it('converts 4 to 4 earth beads, no heaven', () => {
    const b = digitToBeads(4);
    expect(b.heaven).toBe(false);
    expect(b.earth).toBe(4);
  });

  it('converts 5 to heaven only', () => {
    const b = digitToBeads(5);
    expect(b.heaven).toBe(true);
    expect(b.earth).toBe(0);
  });

  it('converts 9 to heaven + 4 earth', () => {
    const b = digitToBeads(9);
    expect(b.heaven).toBe(true);
    expect(b.earth).toBe(4);
  });

  it('converts 7 to heaven + 2 earth', () => {
    const b = digitToBeads(7);
    expect(b.heaven).toBe(true);
    expect(b.earth).toBe(2);
  });

  it('clamps negative to 0', () => {
    const b = digitToBeads(-3);
    expect(b.heaven).toBe(false);
    expect(b.earth).toBe(0);
  });

  it('clamps >9 to 9', () => {
    const b = digitToBeads(15);
    expect(b.heaven).toBe(true);
    expect(b.earth).toBe(4);
  });
});

describe('Soroban — beadsToDigit', () => {
  it('round-trips all digits 0-9', () => {
    for (let d = 0; d <= 9; d++) {
      const { heaven, earth } = digitToBeads(d);
      expect(beadsToDigit(heaven, earth)).toBe(d);
    }
  });

  it('clamps earth above 4', () => {
    expect(beadsToDigit(false, 6)).toBe(4);
  });

  it('clamps earth below 0', () => {
    expect(beadsToDigit(true, -2)).toBe(5);
  });
});

// =============================================================================
// 2. Number ↔ Digits
// =============================================================================

describe('Soroban — numberToDigits / digitsToNumber', () => {
  it('decomposes 42 with 2 rods', () => {
    expect(numberToDigits(42, 2)).toEqual([4, 2]);
  });

  it('pads with leading zeros', () => {
    expect(numberToDigits(5, 3)).toEqual([0, 0, 5]);
  });

  it('clamps to max for rod count', () => {
    expect(numberToDigits(150, 2)).toEqual([9, 9]);
  });

  it('clamps negative to 0', () => {
    expect(numberToDigits(-10, 2)).toEqual([0, 0]);
  });

  it('round-trips correctly', () => {
    for (const value of [0, 1, 9, 42, 99, 100, 999]) {
      const rodCount = value < 10 ? 1 : value < 100 ? 2 : 3;
      expect(digitsToNumber(numberToDigits(value, rodCount))).toBe(
        Math.min(value, getMaxValue(rodCount)),
      );
    }
  });

  it('digitsToNumber accumulates correctly', () => {
    expect(digitsToNumber([3, 7, 5])).toBe(375);
    expect(digitsToNumber([0, 0, 0])).toBe(0);
  });
});

// =============================================================================
// 3. getMaxValue
// =============================================================================

describe('Soroban — getMaxValue', () => {
  it('returns 9 for 1 rod', () => expect(getMaxValue(1)).toBe(9));
  it('returns 99 for 2 rods', () => expect(getMaxValue(2)).toBe(99));
  it('returns 9999999 for 7 rods', () => expect(getMaxValue(7)).toBe(9999999));
});

// =============================================================================
// 4. Configuration clamping
// =============================================================================

describe('Soroban — clampRodCount', () => {
  it('clamps below minimum', () => expect(clampRodCount(0)).toBe(MIN_RODS));
  it('clamps above maximum', () => expect(clampRodCount(10)).toBe(MAX_RODS));
  it('returns default for NaN', () => expect(clampRodCount(NaN)).toBe(DEFAULT_ROD_COUNT));
  it('returns default for Infinity', () => expect(clampRodCount(Infinity)).toBe(DEFAULT_ROD_COUNT));
  it('rounds non-integer', () => expect(clampRodCount(2.7)).toBe(3));
  it('passes through valid value', () => expect(clampRodCount(4)).toBe(4));
});

describe('Soroban — clampTrialsCount', () => {
  it('clamps below minimum', () => expect(clampTrialsCount(1)).toBe(MIN_TRIALS));
  it('clamps above maximum', () => expect(clampTrialsCount(100)).toBe(MAX_TRIALS));
  it('returns default for NaN', () => expect(clampTrialsCount(NaN)).toBe(DEFAULT_TOTAL_TRIALS));
  it('passes through valid value', () => expect(clampTrialsCount(25)).toBe(25));
});

// =============================================================================
// 5. Trial generation
// =============================================================================

describe('Soroban — generateTrials', () => {
  it('generates the correct number of trials', () => {
    const trials = generateTrials(20, 2);
    expect(trials).toHaveLength(20);
  });

  it('all targets are within valid range for rodCount', () => {
    const rodCount = 3;
    const trials = generateTrials(50, rodCount);
    const max = getMaxValue(rodCount);
    for (const t of trials) {
      expect(t.targetNumber).toBeGreaterThanOrEqual(0);
      expect(t.targetNumber).toBeLessThanOrEqual(max);
      expect(t.rodCount).toBe(rodCount);
    }
  });

  it('uses the provided RNG for reproducibility', () => {
    let seed = 42;
    const rng = () => {
      seed = (seed * 16807 + 0) % 2147483647;
      return seed / 2147483647;
    };
    const a = generateTrials(10, 2, rng);
    seed = 42;
    const b = generateTrials(10, 2, rng);
    // Same seed produces same sequence (note: rng is shared, so b starts from a's end)
    // Instead, make a fresh closure each time:
    const makeRng = () => {
      let s = 42;
      return () => {
        s = (s * 16807 + 0) % 2147483647;
        return s / 2147483647;
      };
    };
    const c = generateTrials(10, 2, makeRng());
    const d = generateTrials(10, 2, makeRng());
    expect(c.map((t) => t.targetNumber)).toEqual(d.map((t) => t.targetNumber));
  });

  it('generates single-rod trials in range 0-9', () => {
    const trials = generateTrials(100, 1);
    for (const t of trials) {
      expect(t.targetNumber).toBeLessThanOrEqual(9);
    }
  });
});

// =============================================================================
// 6. Answer validation
// =============================================================================

describe('Soroban — validateAnswer', () => {
  it('returns true for correct answer', () => {
    expect(validateAnswer([4, 2], 42)).toBe(true);
  });

  it('returns false for incorrect answer', () => {
    expect(validateAnswer([4, 3], 42)).toBe(false);
  });

  it('validates zero correctly', () => {
    expect(validateAnswer([0, 0], 0)).toBe(true);
  });

  it('validates large numbers', () => {
    expect(validateAnswer([9, 9, 9], 999)).toBe(true);
  });
});

// =============================================================================
// 7. Summary computation
// =============================================================================

describe('Soroban — computeSummary', () => {
  it('computes 100% accuracy for all correct', () => {
    const results: SorobanTrialResult[] = [
      makeResult(42, 42, 1000),
      makeResult(7, 7, 800),
      makeResult(99, 99, 1200),
    ];
    const s = computeSummary(results, 2);
    expect(s.accuracy).toBe(100);
    expect(s.correctTrials).toBe(3);
    expect(s.totalTrials).toBe(3);
  });

  it('computes 0% accuracy for all wrong', () => {
    const results: SorobanTrialResult[] = [makeResult(42, 43, 1000), makeResult(7, 8, 800)];
    const s = computeSummary(results, 2);
    expect(s.accuracy).toBe(0);
    expect(s.correctTrials).toBe(0);
  });

  it('computes correct average RT', () => {
    const results: SorobanTrialResult[] = [
      makeResult(1, 1, 1000),
      makeResult(2, 2, 2000),
      makeResult(3, 3, 3000),
    ];
    const s = computeSummary(results, 1);
    expect(s.avgRT).toBe(2000);
  });

  it('handles empty results', () => {
    const s = computeSummary([], 2);
    expect(s.accuracy).toBe(0);
    expect(s.avgRT).toBe(0);
    expect(s.totalTrials).toBe(0);
  });

  it('includes rodCount and maxValue', () => {
    const s = computeSummary([makeResult(5, 5, 500)], 3);
    expect(s.rodCount).toBe(3);
    expect(s.maxValue).toBe(999);
  });

  it('rounds accuracy to nearest integer', () => {
    const results: SorobanTrialResult[] = [
      makeResult(1, 1, 100),
      makeResult(2, 2, 100),
      makeResult(3, 4, 100), // wrong
    ];
    const s = computeSummary(results, 1);
    expect(s.accuracy).toBe(67); // 2/3 = 66.67 → 67
  });
});
