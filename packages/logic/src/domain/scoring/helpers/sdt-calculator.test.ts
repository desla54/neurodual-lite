/**
 * Tests for SDTCalculator
 *
 * Covers:
 * - probit (inverse normal CDF) accuracy and edge cases
 * - d-prime calculation with Hautus correction
 * - Anti-gaming guards (silence, inactivity, spam)
 * - calculateModalityStats
 * - calculateAverageDPrime / calculateMinDPrime
 */

import { describe, it, expect } from 'bun:test';
import { SDTCalculator, type RawCounts } from './sdt-calculator';
import type { ModalityStats } from '../../../types';

// =============================================================================
// Probit Tests
// =============================================================================

describe('SDTCalculator.probit', () => {
  it('returns 0 for p = 0.5 (median of normal distribution)', () => {
    expect(SDTCalculator.probit(0.5)).toBeCloseTo(0, 4);
  });

  it('returns negative z-score for p < 0.5', () => {
    expect(SDTCalculator.probit(0.1)).toBeLessThan(0);
    expect(SDTCalculator.probit(0.25)).toBeLessThan(0);
  });

  it('returns positive z-score for p > 0.5', () => {
    expect(SDTCalculator.probit(0.9)).toBeGreaterThan(0);
    expect(SDTCalculator.probit(0.75)).toBeGreaterThan(0);
  });

  it('is symmetric around 0.5', () => {
    const z10 = SDTCalculator.probit(0.1);
    const z90 = SDTCalculator.probit(0.9);
    expect(z10 + z90).toBeCloseTo(0, 3);

    const z25 = SDTCalculator.probit(0.25);
    const z75 = SDTCalculator.probit(0.75);
    expect(z25 + z75).toBeCloseTo(0, 3);
  });

  it('matches known z-score values', () => {
    // Standard normal CDF inverse known values
    expect(SDTCalculator.probit(0.5)).toBeCloseTo(0, 2);
    expect(SDTCalculator.probit(0.8413)).toBeCloseTo(1.0, 1); // ~1 SD
    expect(SDTCalculator.probit(0.1587)).toBeCloseTo(-1.0, 1); // ~-1 SD
    expect(SDTCalculator.probit(0.9772)).toBeCloseTo(2.0, 1); // ~2 SD
    expect(SDTCalculator.probit(0.0228)).toBeCloseTo(-2.0, 1); // ~-2 SD
  });

  it('clamps to -5 for very small p', () => {
    expect(SDTCalculator.probit(0)).toBe(-5);
    expect(SDTCalculator.probit(1e-15)).toBe(-5);
    expect(SDTCalculator.probit(1e-11)).toBe(-5);
  });

  it('clamps to 5 for very large p', () => {
    expect(SDTCalculator.probit(1)).toBe(5);
    expect(SDTCalculator.probit(1 - 1e-15)).toBe(5);
    expect(SDTCalculator.probit(1 - 1e-11)).toBe(5);
  });

  it('returns 0 for NaN', () => {
    expect(SDTCalculator.probit(NaN)).toBe(0);
  });

  it('returns 0 for Infinity', () => {
    expect(SDTCalculator.probit(Infinity)).toBe(0);
    expect(SDTCalculator.probit(-Infinity)).toBe(0);
  });

  it('handles the low tail region (p < 0.02425)', () => {
    const z = SDTCalculator.probit(0.01);
    expect(z).toBeCloseTo(-2.326, 1);
  });

  it('handles the high tail region (p > 0.97575)', () => {
    const z = SDTCalculator.probit(0.99);
    expect(z).toBeCloseTo(2.326, 1);
  });

  it('is monotonically increasing', () => {
    const values = [0.01, 0.1, 0.25, 0.5, 0.75, 0.9, 0.99];
    for (let i = 1; i < values.length; i++) {
      expect(SDTCalculator.probit(values[i]!)).toBeGreaterThan(
        SDTCalculator.probit(values[i - 1]!),
      );
    }
  });
});

// =============================================================================
// d-prime Tests
// =============================================================================

describe('SDTCalculator.calculateDPrime', () => {
  describe('happy paths', () => {
    it('returns positive d-prime for good performance (high hits, low FA)', () => {
      // 8 hits, 2 misses, 1 FA, 9 CR → good discriminability
      const dp = SDTCalculator.calculateDPrime(8, 2, 1, 9);
      expect(dp).toBeGreaterThan(1);
    });

    it('returns higher d-prime for better discrimination', () => {
      const dpGood = SDTCalculator.calculateDPrime(9, 1, 1, 9);
      const dpOk = SDTCalculator.calculateDPrime(6, 4, 3, 7);
      expect(dpGood).toBeGreaterThan(dpOk);
    });

    it('returns near-zero d-prime for chance performance', () => {
      // Equal hit rate and false alarm rate → d' ≈ 0
      const dp = SDTCalculator.calculateDPrime(5, 5, 5, 5);
      expect(Math.abs(dp)).toBeLessThan(0.5);
    });

    it('uses Hautus log-linear correction', () => {
      // Perfect performance: 10 hits, 0 misses, 0 FA, 10 CR
      // Without Hautus, this would be infinite. With Hautus it should be finite.
      const dp = SDTCalculator.calculateDPrime(10, 0, 0, 10);
      // Anti-gaming: hits > 0 and CR > 0, so it computes
      // But FA=0 AND hits=10 → Hautus corrects to finite value
      expect(Number.isFinite(dp)).toBe(true);
      expect(dp).toBeGreaterThan(2);
    });
  });

  describe('anti-gaming: silence (hits=0, FA=0)', () => {
    it('returns 0 when hits=0 and falseAlarms=0', () => {
      // Player did nothing — all misses and CR
      expect(SDTCalculator.calculateDPrime(0, 10, 0, 10)).toBe(0);
    });
  });

  describe('anti-gaming: inactivity (hits=0)', () => {
    it('returns 0 when hits=0 even with some FA', () => {
      // Player never responded correctly to targets
      expect(SDTCalculator.calculateDPrime(0, 10, 2, 8)).toBe(0);
    });

    it('returns 0 when hits=0 and all misses', () => {
      expect(SDTCalculator.calculateDPrime(0, 5, 0, 5)).toBe(0);
    });
  });

  describe('anti-gaming: spam (CR=0)', () => {
    it('returns 0 when correctRejections=0', () => {
      // Player responded to everything
      expect(SDTCalculator.calculateDPrime(10, 0, 10, 0)).toBe(0);
    });

    it('returns 0 when CR=0 and some misses', () => {
      expect(SDTCalculator.calculateDPrime(5, 5, 10, 0)).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('returns 0 for negative counts', () => {
      expect(SDTCalculator.calculateDPrime(-1, 5, 2, 8)).toBe(0);
      expect(SDTCalculator.calculateDPrime(5, -1, 2, 8)).toBe(0);
      expect(SDTCalculator.calculateDPrime(5, 5, -1, 8)).toBe(0);
      expect(SDTCalculator.calculateDPrime(5, 5, 2, -1)).toBe(0);
    });

    it('returns 0 when no signal trials (hits + misses = 0)', () => {
      expect(SDTCalculator.calculateDPrime(0, 0, 5, 5)).toBe(0);
    });

    it('returns 0 when no noise trials (FA + CR = 0)', () => {
      expect(SDTCalculator.calculateDPrime(5, 5, 0, 0)).toBe(0);
    });

    it('returns 0 for all zeros', () => {
      expect(SDTCalculator.calculateDPrime(0, 0, 0, 0)).toBe(0);
    });

    it('handles single trial per category', () => {
      const dp = SDTCalculator.calculateDPrime(1, 0, 0, 1);
      expect(Number.isFinite(dp)).toBe(true);
      expect(dp).toBeGreaterThan(0);
    });
  });
});

// =============================================================================
// calculateModalityStats Tests
// =============================================================================

describe('SDTCalculator.calculateModalityStats', () => {
  it('calculates hit rate and false alarm rate correctly', () => {
    const counts: RawCounts = {
      hits: 8,
      misses: 2,
      falseAlarms: 1,
      correctRejections: 9,
      reactionTimes: [300, 400, 500],
    };
    const stats = SDTCalculator.calculateModalityStats(counts);

    expect(stats.hitRate).toBeCloseTo(0.8, 5); // 8/10
    expect(stats.falseAlarmRate).toBeCloseTo(0.1, 5); // 1/10
    expect(stats.hits).toBe(8);
    expect(stats.misses).toBe(2);
    expect(stats.falseAlarms).toBe(1);
    expect(stats.correctRejections).toBe(9);
  });

  it('calculates average reaction time', () => {
    const counts: RawCounts = {
      hits: 3,
      misses: 0,
      falseAlarms: 0,
      correctRejections: 3,
      reactionTimes: [200, 400, 600],
    };
    const stats = SDTCalculator.calculateModalityStats(counts);
    expect(stats.avgReactionTime).toBeCloseTo(400, 5);
  });

  it('returns null avgReactionTime when no reaction times', () => {
    const counts: RawCounts = {
      hits: 0,
      misses: 5,
      falseAlarms: 0,
      correctRejections: 5,
      reactionTimes: [],
    };
    const stats = SDTCalculator.calculateModalityStats(counts);
    expect(stats.avgReactionTime).toBeNull();
  });

  it('returns 0 hit rate when no signal trials', () => {
    const counts: RawCounts = {
      hits: 0,
      misses: 0,
      falseAlarms: 2,
      correctRejections: 8,
      reactionTimes: [],
    };
    const stats = SDTCalculator.calculateModalityStats(counts);
    expect(stats.hitRate).toBe(0);
  });

  it('returns 0 false alarm rate when no noise trials', () => {
    const counts: RawCounts = {
      hits: 5,
      misses: 5,
      falseAlarms: 0,
      correctRejections: 0,
      reactionTimes: [],
    };
    const stats = SDTCalculator.calculateModalityStats(counts);
    expect(stats.falseAlarmRate).toBe(0);
  });

  it('includes d-prime in the result', () => {
    const counts: RawCounts = {
      hits: 7,
      misses: 3,
      falseAlarms: 2,
      correctRejections: 8,
      reactionTimes: [300],
    };
    const stats = SDTCalculator.calculateModalityStats(counts);
    expect(stats.dPrime).toBe(SDTCalculator.calculateDPrime(7, 3, 2, 8));
  });
});

// =============================================================================
// Aggregate Tests
// =============================================================================

describe('SDTCalculator.calculateAverageDPrime', () => {
  it('returns 0 for empty modalities', () => {
    expect(SDTCalculator.calculateAverageDPrime({})).toBe(0);
  });

  it('returns the single d-prime for one modality', () => {
    const stats: Record<string, ModalityStats> = {
      position: makeModalityStats(2.5),
    };
    expect(SDTCalculator.calculateAverageDPrime(stats)).toBeCloseTo(2.5, 5);
  });

  it('averages d-primes across modalities', () => {
    const stats: Record<string, ModalityStats> = {
      position: makeModalityStats(2.0),
      audio: makeModalityStats(3.0),
    };
    expect(SDTCalculator.calculateAverageDPrime(stats)).toBeCloseTo(2.5, 5);
  });

  it('filters out NaN d-primes', () => {
    const stats: Record<string, ModalityStats> = {
      position: makeModalityStats(2.0),
      audio: makeModalityStats(NaN),
    };
    expect(SDTCalculator.calculateAverageDPrime(stats)).toBeCloseTo(2.0, 5);
  });

  it('filters out Infinity d-primes', () => {
    const stats: Record<string, ModalityStats> = {
      position: makeModalityStats(2.0),
      audio: makeModalityStats(Infinity),
    };
    expect(SDTCalculator.calculateAverageDPrime(stats)).toBeCloseTo(2.0, 5);
  });

  it('returns 0 when all d-primes are NaN', () => {
    const stats: Record<string, ModalityStats> = {
      position: makeModalityStats(NaN),
      audio: makeModalityStats(NaN),
    };
    expect(SDTCalculator.calculateAverageDPrime(stats)).toBe(0);
  });
});

describe('SDTCalculator.calculateMinDPrime', () => {
  it('returns 0 for empty modalities', () => {
    expect(SDTCalculator.calculateMinDPrime({})).toBe(0);
  });

  it('returns the minimum d-prime', () => {
    const stats: Record<string, ModalityStats> = {
      position: makeModalityStats(3.0),
      audio: makeModalityStats(1.5),
    };
    expect(SDTCalculator.calculateMinDPrime(stats)).toBeCloseTo(1.5, 5);
  });

  it('returns the single d-prime for one modality', () => {
    const stats: Record<string, ModalityStats> = {
      position: makeModalityStats(2.0),
    };
    expect(SDTCalculator.calculateMinDPrime(stats)).toBeCloseTo(2.0, 5);
  });
});

// =============================================================================
// Helpers
// =============================================================================

function makeModalityStats(dPrime: number): ModalityStats {
  return {
    hits: 5,
    misses: 5,
    falseAlarms: 2,
    correctRejections: 8,
    hitRate: 0.5,
    falseAlarmRate: 0.2,
    dPrime,
    reactionTimes: [],
    avgReactionTime: null,
  };
}
