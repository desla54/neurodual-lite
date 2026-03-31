/**
 * Tests for StatisticalCalculator
 *
 * Tests REAL behavior of statistical functions.
 * NO MOCKS - Pure computation.
 */

import { describe, expect, test } from 'bun:test';
import { StatisticalCalculator } from './statistical-calculator';

// =============================================================================
// mean() Tests
// =============================================================================

describe('StatisticalCalculator.mean()', () => {
  test('should calculate mean of numbers', () => {
    expect(StatisticalCalculator.mean([1, 2, 3, 4, 5])).toBe(3);
  });

  test('should handle single value', () => {
    expect(StatisticalCalculator.mean([42])).toBe(42);
  });

  test('should return 0 for empty array', () => {
    expect(StatisticalCalculator.mean([])).toBe(0);
  });

  test('should handle decimals', () => {
    expect(StatisticalCalculator.mean([1.5, 2.5, 3.0])).toBeCloseTo(2.333, 2);
  });

  test('should handle negative numbers', () => {
    expect(StatisticalCalculator.mean([-5, 0, 5])).toBe(0);
  });
});

// =============================================================================
// variance() Tests
// =============================================================================

describe('StatisticalCalculator.variance()', () => {
  test('should calculate sample variance', () => {
    // [2, 4, 4, 4, 5, 5, 7, 9] → mean=5, variance=4.57
    const values = [2, 4, 4, 4, 5, 5, 7, 9];
    expect(StatisticalCalculator.variance(values)).toBeCloseTo(4.571, 2);
  });

  test('should handle exactly 2 values', () => {
    // Mean = 1.5. Variance = ((1-1.5)^2 + (2-1.5)^2) / (2-1) = (0.25 + 0.25) / 1 = 0.5
    expect(StatisticalCalculator.variance([1, 2])).toBe(0.5);
  });

  test('should return 0 for single value', () => {
    expect(StatisticalCalculator.variance([42])).toBe(0);
  });

  test('should return 0 for empty array', () => {
    expect(StatisticalCalculator.variance([])).toBe(0);
  });

  test('should return 0 for identical values', () => {
    expect(StatisticalCalculator.variance([5, 5, 5, 5])).toBe(0);
  });
});

// =============================================================================
// stdDev() Tests
// =============================================================================

describe('StatisticalCalculator.stdDev()', () => {
  test('should calculate standard deviation', () => {
    const values = [2, 4, 4, 4, 5, 5, 7, 9];
    // sqrt of variance ~4.57 = ~2.14
    expect(StatisticalCalculator.stdDev(values)).toBeCloseTo(2.138, 2);
  });

  test('should return 0 for single value', () => {
    expect(StatisticalCalculator.stdDev([100])).toBe(0);
  });

  test('should return 0 for identical values', () => {
    expect(StatisticalCalculator.stdDev([3, 3, 3])).toBe(0);
  });
});

// =============================================================================
// coefficientOfVariation() Tests
// =============================================================================

// =============================================================================
// median() Tests
// =============================================================================

describe('StatisticalCalculator.median()', () => {
  test('should calculate median of odd count', () => {
    expect(StatisticalCalculator.median([1, 3, 5, 7, 9])).toBe(5);
  });

  test('should calculate median of even count', () => {
    // Average of two middle values: (4 + 5) / 2 = 4.5
    expect(StatisticalCalculator.median([1, 4, 5, 9])).toBe(4.5);
  });

  test('should handle unsorted input', () => {
    expect(StatisticalCalculator.median([9, 1, 5, 3, 7])).toBe(5);
  });

  test('should return 0 for empty array', () => {
    expect(StatisticalCalculator.median([])).toBe(0);
  });

  test('should return single value', () => {
    expect(StatisticalCalculator.median([42])).toBe(42);
  });

  test('should handle two values', () => {
    expect(StatisticalCalculator.median([10, 20])).toBe(15);
  });

  test('should handle identical values', () => {
    expect(StatisticalCalculator.median([5, 5, 5, 5])).toBe(5);
  });
});

// =============================================================================
// filterOutliers() Tests
// =============================================================================

describe('StatisticalCalculator.filterOutliers()', () => {
  test('should filter extreme outliers using IQR method', () => {
    // Normal values with one extreme outlier
    const values = [10, 11, 12, 13, 14, 15, 100];
    const filtered = StatisticalCalculator.filterOutliers(values);
    expect(filtered).not.toContain(100);
    expect(filtered).toContain(10);
    expect(filtered).toContain(15);
  });

  test('should keep values within IQR bounds', () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const filtered = StatisticalCalculator.filterOutliers(values);
    expect(filtered.length).toBe(values.length); // No outliers
  });

  test('should return original array if less than 4 values', () => {
    const values = [1, 100, 200];
    const filtered = StatisticalCalculator.filterOutliers(values);
    expect(filtered).toEqual(values);
  });

  test('should handle custom k multiplier', () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 50];
    // With stricter k=1, more values filtered
    const strictFiltered = StatisticalCalculator.filterOutliers(values, 1);
    // With looser k=3, fewer values filtered
    const looseFiltered = StatisticalCalculator.filterOutliers(values, 3);
    expect(looseFiltered.length).toBeGreaterThanOrEqual(strictFiltered.length);
  });

  test('should filter both low and high outliers', () => {
    const values = [-100, 10, 11, 12, 13, 14, 15, 200];
    const filtered = StatisticalCalculator.filterOutliers(values);
    expect(filtered).not.toContain(-100);
    expect(filtered).not.toContain(200);
  });

  test('should handle identical values', () => {
    const values = [5, 5, 5, 5, 5, 5];
    const filtered = StatisticalCalculator.filterOutliers(values);
    expect(filtered.length).toBe(6); // All kept (IQR = 0)
  });
});

// =============================================================================
// countMicroLapses() Tests
// =============================================================================

describe('StatisticalCalculator.countMicroLapses()', () => {
  test('should count reaction times above threshold * median', () => {
    // Median = 100, threshold 2.5 → lapse if > 250ms
    const reactionTimes = [80, 90, 100, 110, 120, 300, 400];
    const lapses = StatisticalCalculator.countMicroLapses(reactionTimes);
    expect(lapses).toBe(2); // 300 and 400 are > 250
  });

  test('should return 0 if less than 3 values', () => {
    expect(StatisticalCalculator.countMicroLapses([100, 500])).toBe(0);
    expect(StatisticalCalculator.countMicroLapses([100])).toBe(0);
    expect(StatisticalCalculator.countMicroLapses([])).toBe(0);
  });

  test('should handle custom threshold', () => {
    const reactionTimes = [100, 100, 100, 200, 300];
    // Median = 100
    // threshold 1.5 → lapse if > 150 → 2 lapses (200, 300)
    // threshold 2.5 → lapse if > 250 → 1 lapse (300)
    expect(StatisticalCalculator.countMicroLapses(reactionTimes, 1.5)).toBe(2);
    expect(StatisticalCalculator.countMicroLapses(reactionTimes, 2.5)).toBe(1);
  });

  test('should return 0 when no lapses', () => {
    const reactionTimes = [100, 110, 120, 130, 140];
    // Median ~120, threshold * 120 = 300, all values < 300
    expect(StatisticalCalculator.countMicroLapses(reactionTimes)).toBe(0);
  });
});

// =============================================================================
// microLapseRate() Tests
// =============================================================================

describe('StatisticalCalculator.microLapseRate()', () => {
  test('should calculate percentage of micro-lapses', () => {
    const reactionTimes = [100, 100, 100, 100, 500]; // 1 lapse out of 5
    const rate = StatisticalCalculator.microLapseRate(reactionTimes);
    expect(rate).toBeCloseTo(0.2, 2); // 20%
  });

  test('should return 0 for empty array', () => {
    expect(StatisticalCalculator.microLapseRate([])).toBe(0);
  });

  test('should return 0 when no lapses', () => {
    const reactionTimes = [100, 110, 120, 130, 140];
    expect(StatisticalCalculator.microLapseRate(reactionTimes)).toBe(0);
  });

  test('should handle custom threshold', () => {
    const reactionTimes = [100, 100, 100, 200, 300];
    // With threshold 1.5: 2/5 = 0.4
    // With threshold 2.5: 1/5 = 0.2
    expect(StatisticalCalculator.microLapseRate(reactionTimes, 1.5)).toBeCloseTo(0.4, 2);
    expect(StatisticalCalculator.microLapseRate(reactionTimes, 2.5)).toBeCloseTo(0.2, 2);
  });

  test('should return rate in [0, 1] range', () => {
    // All lapses
    const allLapses = [100, 100, 100, 300, 400, 500];
    const rate = StatisticalCalculator.microLapseRate(allLapses);
    expect(rate).toBeGreaterThanOrEqual(0);
    expect(rate).toBeLessThanOrEqual(1);
  });
});

// =============================================================================
// coefficientOfVariation() Tests
// =============================================================================

describe('StatisticalCalculator.coefficientOfVariation()', () => {
  test('should calculate CV (stdDev / mean)', () => {
    // Values with mean=10, stdDev≈2.58 → CV≈0.258
    const values = [8, 9, 10, 11, 12];
    const cv = StatisticalCalculator.coefficientOfVariation(values);
    expect(cv).toBeGreaterThan(0);
    expect(cv).toBeLessThan(1);
  });

  test('should return 0 when mean is 0', () => {
    expect(StatisticalCalculator.coefficientOfVariation([-1, 0, 1])).toBe(0);
  });

  test('should return 0 for identical values', () => {
    expect(StatisticalCalculator.coefficientOfVariation([5, 5, 5])).toBe(0);
  });
});

// =============================================================================
// linearTrend() Tests
// =============================================================================

describe('StatisticalCalculator.linearTrend()', () => {
  test('should detect positive trend (increasing values)', () => {
    const trend = StatisticalCalculator.linearTrend([1, 2, 3, 4, 5]);
    expect(trend).toBeGreaterThan(0);
    expect(trend).toBeCloseTo(1, 5); // Perfect linear increase
  });

  test('should handle exactly 2 values', () => {
    expect(StatisticalCalculator.linearTrend([10, 20])).toBe(10);
  });

  test('should detect negative trend accurately', () => {
    const trend = StatisticalCalculator.linearTrend([10, 5, 0]);
    // x = [0, 1, 2], meanX = 1
    // y = [10, 5, 0], meanY = 5
    // num = (0-1)*(10-5) + (1-1)*(5-5) + (2-1)*(0-5) = -5 + 0 - 5 = -10
    // den = (0-1)^2 + (1-1)^2 + (2-1)^2 = 1 + 0 + 1 = 2
    // trend = -10 / 2 = -5
    expect(trend).toBe(-5);
  });

  test('should return ~0 for flat data', () => {
    const trend = StatisticalCalculator.linearTrend([5, 5, 5, 5, 5]);
    expect(trend).toBe(0);
  });

  test('should return 0 for single value', () => {
    expect(StatisticalCalculator.linearTrend([42])).toBe(0);
  });

  test('should return 0 for empty array', () => {
    expect(StatisticalCalculator.linearTrend([])).toBe(0);
  });

  test('should handle noisy increasing data', () => {
    // Generally increasing but with noise
    const trend = StatisticalCalculator.linearTrend([1, 3, 2, 4, 3, 5, 4, 6]);
    expect(trend).toBeGreaterThan(0); // Still positive trend
  });
});

// =============================================================================
// computeDPrime() Tests
// =============================================================================

describe('StatisticalCalculator.computeDPrime()', () => {
  describe('guard conditions', () => {
    test('should return 0 when no targets (hits + misses = 0)', () => {
      expect(StatisticalCalculator.computeDPrime(0, 0, 5, 15)).toBe(0);
    });

    test('should return 0 when no non-targets (FA + CR = 0)', () => {
      expect(StatisticalCalculator.computeDPrime(5, 5, 0, 0)).toBe(0);
    });

    test('should return 0 when hits = 0 (inactive player)', () => {
      expect(StatisticalCalculator.computeDPrime(0, 10, 2, 18)).toBe(0);
    });

    test('should return 0 when correct rejections = 0 (spammer)', () => {
      expect(StatisticalCalculator.computeDPrime(10, 0, 20, 0)).toBe(0);
    });
  });

  describe('normal performance', () => {
    test('should return positive d-prime for good performance', () => {
      // High hits, low FA
      const dPrime = StatisticalCalculator.computeDPrime(9, 1, 1, 19);
      expect(dPrime).toBeGreaterThan(1.5);
    });

    test('should return low d-prime for poor performance', () => {
      // Low hits, high FA
      const dPrime = StatisticalCalculator.computeDPrime(3, 7, 7, 13);
      expect(dPrime).toBeLessThan(0.5);
    });

    test('should return higher d-prime for better discrimination', () => {
      const poor = StatisticalCalculator.computeDPrime(5, 5, 5, 15);
      const good = StatisticalCalculator.computeDPrime(9, 1, 1, 19);
      expect(good).toBeGreaterThan(poor);
    });
  });

  describe('practical bounds', () => {
    test('should return bounded d-prime for excellent performance', () => {
      // Near-perfect performance (100 hits, 0 miss, 0 FA, 100 CR)
      // SDTCalculator uses Hautus correction and probit (Abramowitz & Stegun)
      // d' can slightly exceed 5 for near-perfect performance (~5.16)
      const dPrime = StatisticalCalculator.computeDPrime(100, 0, 0, 100);
      expect(Number.isFinite(dPrime)).toBe(true);
      expect(dPrime).toBeGreaterThan(4); // Excellent performance → high d'
      expect(dPrime).toBeLessThan(6); // But practically bounded
    });
  });

  describe('Hautus correction', () => {
    test('should handle edge cases without infinity', () => {
      // Near-perfect but not perfect (1 miss, 1 FA)
      const dPrime = StatisticalCalculator.computeDPrime(99, 1, 1, 99);
      expect(Number.isFinite(dPrime)).toBe(true);
      expect(dPrime).toBeGreaterThan(2);
    });
  });
});

// =============================================================================
// clamp() Tests
// =============================================================================

describe('StatisticalCalculator.clamp()', () => {
  test('should return value when within range', () => {
    expect(StatisticalCalculator.clamp(5, 0, 10)).toBe(5);
  });

  test('should return min when value below', () => {
    expect(StatisticalCalculator.clamp(-5, 0, 10)).toBe(0);
  });

  test('should return max when value above', () => {
    expect(StatisticalCalculator.clamp(15, 0, 10)).toBe(10);
  });

  test('should handle equal min and max', () => {
    expect(StatisticalCalculator.clamp(5, 3, 3)).toBe(3);
  });

  test('should handle negative ranges', () => {
    expect(StatisticalCalculator.clamp(0, -10, -5)).toBe(-5);
  });
});

// =============================================================================
// computeTimingStats() Tests
// =============================================================================

describe('StatisticalCalculator.computeTimingStats()', () => {
  test('should compute min, max, avg', () => {
    const stats = StatisticalCalculator.computeTimingStats([100, 200, 300, 400, 500]);

    expect(stats.min).toBe(100);
    expect(stats.max).toBe(500);
    expect(stats.avg).toBe(300);
    expect(stats.values).toEqual([100, 200, 300, 400, 500]);
  });

  test('should handle single value', () => {
    const stats = StatisticalCalculator.computeTimingStats([250]);

    expect(stats.min).toBe(250);
    expect(stats.max).toBe(250);
    expect(stats.avg).toBe(250);
  });

  test('should return zeros for empty array', () => {
    const stats = StatisticalCalculator.computeTimingStats([]);

    expect(stats.min).toBe(0);
    expect(stats.max).toBe(0);
    expect(stats.avg).toBe(0);
    expect(stats.values).toEqual([]);
  });

  test('should preserve original values', () => {
    const original = [150, 200, 175];
    const stats = StatisticalCalculator.computeTimingStats(original);

    expect(stats.values).toEqual(original);
  });
});
