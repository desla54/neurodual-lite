/**
 * SDT Calculator - Extended Property-Based Tests
 *
 * Comprehensive property tests covering:
 * 1. Bounds invariants (20 tests)
 * 2. Mathematical invariants (15 tests)
 * 3. Consistency invariants (15 tests)
 *
 * Uses fast-check for generative testing.
 */
import { describe, expect, it } from 'bun:test';
import * as fc from 'fast-check';
import { SDTCalculator, type RawCounts } from './sdt-calculator';
import type { ModalityStats } from '../../types';

// =============================================================================
// Test Arbitraries
// =============================================================================

// Standard count range for typical sessions (0-50 trials per category)
const countArb = fc.integer({ min: 0, max: 50 });

// Small count range for edge case testing
const smallCountArb = fc.integer({ min: 0, max: 10 });

// Large count range for stress testing
const largeCountArb = fc.integer({ min: 100, max: 10000 });

// Positive count (at least 1)
const positiveCountArb = fc.integer({ min: 1, max: 50 });

// Probability in valid range
const probabilityArb = fc.double({ min: 0, max: 1, noNaN: true });

// Probability in interior of range (avoiding boundaries)
const interiorProbabilityArb = fc.double({ min: 0.001, max: 0.999, noNaN: true });

// Raw counts generator
const rawCountsArb = fc.record({
  hits: countArb,
  misses: countArb,
  falseAlarms: countArb,
  correctRejections: countArb,
  reactionTimes: fc.array(fc.double({ min: 50, max: 3000, noNaN: true }), { maxLength: 50 }),
});

// Valid counts (with at least some signal and noise trials)
const validCountsArb = fc.record({
  hits: positiveCountArb,
  misses: countArb,
  falseAlarms: countArb,
  correctRejections: positiveCountArb,
  reactionTimes: fc.array(fc.double({ min: 50, max: 3000, noNaN: true }), { maxLength: 50 }),
});

// Generate d-prime values for testing aggregation functions
const dPrimeArb = fc.double({ min: -5, max: 5, noNaN: true });

// Generate ModalityStats-like objects
const modalityStatsArb = fc.record({
  hits: countArb,
  misses: countArb,
  falseAlarms: countArb,
  correctRejections: countArb,
  hitRate: probabilityArb,
  falseAlarmRate: probabilityArb,
  dPrime: dPrimeArb,
  reactionTimes: fc.array(fc.double({ min: 50, max: 3000, noNaN: true }), { maxLength: 20 }),
  avgReactionTime: fc.oneof(fc.constant(null), fc.double({ min: 50, max: 3000, noNaN: true })),
});

// =============================================================================
// 1. BOUNDS INVARIANTS (20 tests)
// =============================================================================

describe('SDTCalculator - Bounds Invariants', () => {
  describe('probit bounds', () => {
    it('1. probit output is always in [-5, 5] for any probability in [0, 1]', () => {
      fc.assert(
        fc.property(probabilityArb, (p) => {
          const z = SDTCalculator.probit(p);
          return z >= -5 && z <= 5;
        }),
        { numRuns: 500 },
      );
    });

    it('2. probit returns finite value for all valid probabilities', () => {
      fc.assert(
        fc.property(probabilityArb, (p) => {
          const z = SDTCalculator.probit(p);
          return Number.isFinite(z);
        }),
        { numRuns: 500 },
      );
    });

    it('3. probit handles extreme probabilities near 0', () => {
      fc.assert(
        fc.property(fc.double({ min: 1e-15, max: 1e-5, noNaN: true }), (p) => {
          const z = SDTCalculator.probit(p);
          return Number.isFinite(z) && z >= -5;
        }),
        { numRuns: 100 },
      );
    });

    it('4. probit handles extreme probabilities near 1', () => {
      fc.assert(
        fc.property(fc.double({ min: 1 - 1e-5, max: 1 - 1e-15, noNaN: true }), (p) => {
          const z = SDTCalculator.probit(p);
          return Number.isFinite(z) && z <= 5;
        }),
        { numRuns: 100 },
      );
    });

    it('5. probit returns 0 for NaN input (defensive guard)', () => {
      expect(SDTCalculator.probit(Number.NaN)).toBe(0);
    });

    it('6. probit returns 0 for Infinity input (defensive guard)', () => {
      expect(SDTCalculator.probit(Number.POSITIVE_INFINITY)).toBe(0);
      expect(SDTCalculator.probit(Number.NEGATIVE_INFINITY)).toBe(0);
    });
  });

  describe('d-prime bounds', () => {
    it('7. d-prime is always finite for any non-negative counts', () => {
      fc.assert(
        fc.property(countArb, countArb, countArb, countArb, (h, m, f, c) => {
          const d = SDTCalculator.calculateDPrime(h, m, f, c);
          return Number.isFinite(d);
        }),
        { numRuns: 1000 },
      );
    });

    it('8. d-prime is bounded between -10 and 10 for standard counts', () => {
      fc.assert(
        fc.property(countArb, countArb, countArb, countArb, (h, m, f, c) => {
          const d = SDTCalculator.calculateDPrime(h, m, f, c);
          return d >= -10 && d <= 10;
        }),
        { numRuns: 1000 },
      );
    });

    it('9. d-prime is bounded even for large counts', () => {
      fc.assert(
        fc.property(largeCountArb, largeCountArb, largeCountArb, largeCountArb, (h, m, f, c) => {
          const d = SDTCalculator.calculateDPrime(h, m, f, c);
          return Number.isFinite(d) && d >= -10 && d <= 10;
        }),
        { numRuns: 100 },
      );
    });

    it('10. d-prime returns exactly 0 when hits = 0 (anti-gaming)', () => {
      fc.assert(
        fc.property(countArb, countArb, countArb, (m, f, c) => {
          const d = SDTCalculator.calculateDPrime(0, m, f, c);
          return d === 0;
        }),
        { numRuns: 200 },
      );
    });

    it('11. d-prime returns exactly 0 when correctRejections = 0 (anti-spammer)', () => {
      fc.assert(
        fc.property(countArb, countArb, countArb, (h, m, f) => {
          const d = SDTCalculator.calculateDPrime(h, m, f, 0);
          return d === 0;
        }),
        { numRuns: 200 },
      );
    });

    it('12. d-prime returns 0 when no signal trials (hits + misses = 0)', () => {
      fc.assert(
        fc.property(countArb, countArb, (f, c) => {
          const d = SDTCalculator.calculateDPrime(0, 0, f, c);
          return d === 0;
        }),
        { numRuns: 100 },
      );
    });

    it('13. d-prime returns 0 when no noise trials (fa + cr = 0)', () => {
      fc.assert(
        fc.property(countArb, countArb, (h, m) => {
          const d = SDTCalculator.calculateDPrime(h, m, 0, 0);
          return d === 0;
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('rate bounds', () => {
    it('14. hit rate from calculateModalityStats is in [0, 1]', () => {
      fc.assert(
        fc.property(rawCountsArb, (counts) => {
          const stats = SDTCalculator.calculateModalityStats(counts);
          return stats.hitRate >= 0 && stats.hitRate <= 1;
        }),
        { numRuns: 500 },
      );
    });

    it('15. false alarm rate from calculateModalityStats is in [0, 1]', () => {
      fc.assert(
        fc.property(rawCountsArb, (counts) => {
          const stats = SDTCalculator.calculateModalityStats(counts);
          return stats.falseAlarmRate >= 0 && stats.falseAlarmRate <= 1;
        }),
        { numRuns: 500 },
      );
    });

    it('16. hit rate equals hits / (hits + misses) when signal trials > 0', () => {
      fc.assert(
        fc.property(positiveCountArb, countArb, countArb, countArb, (h, m, f, c) => {
          const counts: RawCounts = {
            hits: h,
            misses: m,
            falseAlarms: f,
            correctRejections: c,
            reactionTimes: [],
          };
          const stats = SDTCalculator.calculateModalityStats(counts);
          const expectedRate = h / (h + m);
          return Math.abs(stats.hitRate - expectedRate) < 0.0001;
        }),
        { numRuns: 200 },
      );
    });

    it('17. false alarm rate equals fa / (fa + cr) when noise trials > 0', () => {
      fc.assert(
        fc.property(countArb, countArb, positiveCountArb, countArb, (h, m, f, c) => {
          fc.pre(f + c > 0); // Ensure noise trials exist
          const counts: RawCounts = {
            hits: h,
            misses: m,
            falseAlarms: f,
            correctRejections: c,
            reactionTimes: [],
          };
          const stats = SDTCalculator.calculateModalityStats(counts);
          const expectedRate = f / (f + c);
          return Math.abs(stats.falseAlarmRate - expectedRate) < 0.0001;
        }),
        { numRuns: 200 },
      );
    });

    it('18. all counts in stats are non-negative', () => {
      fc.assert(
        fc.property(rawCountsArb, (counts) => {
          const stats = SDTCalculator.calculateModalityStats(counts);
          return (
            stats.hits >= 0 &&
            stats.misses >= 0 &&
            stats.falseAlarms >= 0 &&
            stats.correctRejections >= 0
          );
        }),
        { numRuns: 500 },
      );
    });

    it('19. average d-prime from calculateAverageDPrime is bounded', () => {
      fc.assert(
        fc.property(fc.array(dPrimeArb, { minLength: 1, maxLength: 10 }), (dPrimes) => {
          const stats: Record<string, ModalityStats> = {};
          dPrimes.forEach((d, i) => (stats[`m${i}`] = { dPrime: d } as ModalityStats));
          const avg = SDTCalculator.calculateAverageDPrime(stats);
          return Number.isFinite(avg) && avg >= -5 && avg <= 5;
        }),
        { numRuns: 200 },
      );
    });

    it('20. min d-prime from calculateMinDPrime is bounded', () => {
      fc.assert(
        fc.property(fc.array(dPrimeArb, { minLength: 1, maxLength: 10 }), (dPrimes) => {
          const stats: Record<string, ModalityStats> = {};
          dPrimes.forEach((d, i) => (stats[`m${i}`] = { dPrime: d } as ModalityStats));
          const min = SDTCalculator.calculateMinDPrime(stats);
          return Number.isFinite(min) && min >= -5 && min <= 5;
        }),
        { numRuns: 200 },
      );
    });
  });
});

// =============================================================================
// 2. MATHEMATICAL INVARIANTS (15 tests)
// =============================================================================

describe('SDTCalculator - Mathematical Invariants', () => {
  describe('probit mathematical properties', () => {
    it('21. probit is monotonically increasing', () => {
      fc.assert(
        fc.property(probabilityArb, probabilityArb, (p1, p2) => {
          const [pMin, pMax] = p1 < p2 ? [p1, p2] : [p2, p1];
          if (pMin === pMax) return true;
          // Allow tiny epsilon for numerical precision
          return SDTCalculator.probit(pMin) <= SDTCalculator.probit(pMax) + 1e-9;
        }),
        { numRuns: 500 },
      );
    });

    it('22. probit(0.5) is approximately 0 (median property)', () => {
      const z = SDTCalculator.probit(0.5);
      expect(Math.abs(z)).toBeLessThan(1e-6);
    });

    it('23. probit is antisymmetric: probit(p) approximately equals -probit(1-p)', () => {
      fc.assert(
        fc.property(interiorProbabilityArb, (p) => {
          const z1 = SDTCalculator.probit(p);
          const z2 = SDTCalculator.probit(1 - p);
          return Math.abs(z1 + z2) < 0.001;
        }),
        { numRuns: 300 },
      );
    });

    it('24. probit approaches -5 as p approaches 0', () => {
      const values = [0.001, 0.0001, 0.00001, 0.000001];
      for (const p of values) {
        const z = SDTCalculator.probit(p);
        expect(z).toBeLessThan(-2);
      }
    });

    it('25. probit approaches 5 as p approaches 1', () => {
      const values = [0.999, 0.9999, 0.99999, 0.999999];
      for (const p of values) {
        const z = SDTCalculator.probit(p);
        expect(z).toBeGreaterThan(2);
      }
    });
  });

  describe('d-prime mathematical properties', () => {
    it('26. increasing hits (fixing others) increases or maintains d-prime', () => {
      fc.assert(
        fc.property(positiveCountArb, countArb, countArb, positiveCountArb, (h, m, f, c) => {
          const d1 = SDTCalculator.calculateDPrime(h, m, f, c);
          const d2 = SDTCalculator.calculateDPrime(h + 1, m, f, c);
          return d2 >= d1 - 1e-9;
        }),
        { numRuns: 500 },
      );
    });

    it('27. increasing false alarms (fixing others) decreases or maintains d-prime', () => {
      fc.assert(
        fc.property(positiveCountArb, countArb, countArb, positiveCountArb, (h, m, f, c) => {
          const d1 = SDTCalculator.calculateDPrime(h, m, f, c);
          const d2 = SDTCalculator.calculateDPrime(h, m, f + 1, c);
          return d2 <= d1 + 1e-9;
        }),
        { numRuns: 500 },
      );
    });

    it('28. increasing misses (fixing others) decreases or maintains d-prime', () => {
      fc.assert(
        fc.property(positiveCountArb, countArb, countArb, positiveCountArb, (h, m, f, c) => {
          const d1 = SDTCalculator.calculateDPrime(h, m, f, c);
          const d2 = SDTCalculator.calculateDPrime(h, m + 1, f, c);
          return d2 <= d1 + 1e-9;
        }),
        { numRuns: 500 },
      );
    });

    it('29. increasing correct rejections (fixing others) increases or maintains d-prime', () => {
      fc.assert(
        fc.property(positiveCountArb, countArb, countArb, positiveCountArb, (h, m, f, c) => {
          const d1 = SDTCalculator.calculateDPrime(h, m, f, c);
          const d2 = SDTCalculator.calculateDPrime(h, m, f, c + 1);
          return d2 >= d1 - 1e-9;
        }),
        { numRuns: 500 },
      );
    });

    it('30. perfect performance (all hits, no FA) gives positive d-prime', () => {
      fc.assert(
        fc.property(positiveCountArb, positiveCountArb, (h, c) => {
          const d = SDTCalculator.calculateDPrime(h, 0, 0, c);
          return d > 0;
        }),
        { numRuns: 200 },
      );
    });

    it('31. perfect performance gives high d-prime (near maximum)', () => {
      // With Hautus correction, perfect performance still gives bounded d'
      const d = SDTCalculator.calculateDPrime(20, 0, 0, 20);
      expect(d).toBeGreaterThan(3);
      expect(d).toBeLessThan(5);
    });

    it('32. chance performance (equal hits and FA rates) gives d-prime near 0', () => {
      fc.assert(
        fc.property(positiveCountArb, (n) => {
          // Equal distribution across all categories
          const d = SDTCalculator.calculateDPrime(n, n, n, n);
          return Math.abs(d) < 0.5;
        }),
        { numRuns: 100 },
      );
    });

    it('33. d-prime is 0 when hit rate equals false alarm rate (via SDT definition)', () => {
      // When H = FA (equal hits and false alarms), with equal signal/noise trials
      // The Hautus-corrected d' should be near 0
      fc.assert(
        fc.property(positiveCountArb, positiveCountArb, (h, c) => {
          // h hits out of 2h signal trials -> hit rate = 0.5
          // h FA out of 2h noise trials -> FA rate = 0.5
          const d = SDTCalculator.calculateDPrime(h, h, h, h);
          return Math.abs(d) < 0.1;
        }),
        { numRuns: 100 },
      );
    });

    it('34. balanced high performance has positive d-prime', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 10, max: 50 }),
          fc.integer({ min: 0, max: 5 }),
          fc.integer({ min: 0, max: 5 }),
          fc.integer({ min: 10, max: 50 }),
          (h, m, f, c) => {
            // High hits, few misses, few FA, many CR -> good performance
            const d = SDTCalculator.calculateDPrime(h, m, f, c);
            return d > 1; // Should be clearly positive
          },
        ),
        { numRuns: 100 },
      );
    });

    it('35. poor performance (low hits, high FA) has low d-prime', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 5 }),
          fc.integer({ min: 10, max: 50 }),
          fc.integer({ min: 10, max: 50 }),
          fc.integer({ min: 1, max: 5 }),
          (h, m, f, c) => {
            // Few hits, many misses, many FA, few CR -> poor performance
            const d = SDTCalculator.calculateDPrime(h, m, f, c);
            return d < 1; // Should be low or negative
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});

// =============================================================================
// 3. CONSISTENCY INVARIANTS (15 tests)
// =============================================================================

describe('SDTCalculator - Consistency Invariants', () => {
  describe('determinism', () => {
    it('36. probit is deterministic: same input always gives same output', () => {
      fc.assert(
        fc.property(probabilityArb, (p) => {
          const z1 = SDTCalculator.probit(p);
          const z2 = SDTCalculator.probit(p);
          const z3 = SDTCalculator.probit(p);
          return z1 === z2 && z2 === z3;
        }),
        { numRuns: 300 },
      );
    });

    it('37. calculateDPrime is deterministic: same inputs always give same output', () => {
      fc.assert(
        fc.property(countArb, countArb, countArb, countArb, (h, m, f, c) => {
          const d1 = SDTCalculator.calculateDPrime(h, m, f, c);
          const d2 = SDTCalculator.calculateDPrime(h, m, f, c);
          const d3 = SDTCalculator.calculateDPrime(h, m, f, c);
          return d1 === d2 && d2 === d3;
        }),
        { numRuns: 500 },
      );
    });

    it('38. calculateModalityStats is deterministic', () => {
      fc.assert(
        fc.property(rawCountsArb, (counts) => {
          const s1 = SDTCalculator.calculateModalityStats(counts);
          const s2 = SDTCalculator.calculateModalityStats(counts);
          return (
            s1.hits === s2.hits &&
            s1.misses === s2.misses &&
            s1.falseAlarms === s2.falseAlarms &&
            s1.correctRejections === s2.correctRejections &&
            s1.hitRate === s2.hitRate &&
            s1.falseAlarmRate === s2.falseAlarmRate &&
            s1.dPrime === s2.dPrime
          );
        }),
        { numRuns: 200 },
      );
    });
  });

  describe('ordering properties', () => {
    it('39. min d-prime is always <= average d-prime', () => {
      fc.assert(
        fc.property(fc.array(dPrimeArb, { minLength: 1, maxLength: 10 }), (dPrimes) => {
          const stats: Record<string, ModalityStats> = {};
          dPrimes.forEach((d, i) => (stats[`m${i}`] = { dPrime: d } as ModalityStats));
          const min = SDTCalculator.calculateMinDPrime(stats);
          const avg = SDTCalculator.calculateAverageDPrime(stats);
          return min <= avg + 1e-9;
        }),
        { numRuns: 200 },
      );
    });

    it('40. min d-prime equals actual minimum of d-primes', () => {
      fc.assert(
        fc.property(fc.array(dPrimeArb, { minLength: 1, maxLength: 10 }), (dPrimes) => {
          const stats: Record<string, ModalityStats> = {};
          dPrimes.forEach((d, i) => (stats[`m${i}`] = { dPrime: d } as ModalityStats));
          const min = SDTCalculator.calculateMinDPrime(stats);
          const expectedMin = Math.min(...dPrimes);
          return Math.abs(min - expectedMin) < 1e-9;
        }),
        { numRuns: 200 },
      );
    });

    it('41. average d-prime equals arithmetic mean of d-primes', () => {
      fc.assert(
        fc.property(fc.array(dPrimeArb, { minLength: 1, maxLength: 10 }), (dPrimes) => {
          const stats: Record<string, ModalityStats> = {};
          dPrimes.forEach((d, i) => (stats[`m${i}`] = { dPrime: d } as ModalityStats));
          const avg = SDTCalculator.calculateAverageDPrime(stats);
          const expectedAvg = dPrimes.reduce((a, b) => a + b, 0) / dPrimes.length;
          return Math.abs(avg - expectedAvg) < 1e-9;
        }),
        { numRuns: 200 },
      );
    });

    it('42. with single modality, min equals average', () => {
      fc.assert(
        fc.property(dPrimeArb, (d) => {
          const stats = { position: { dPrime: d } as ModalityStats };
          const min = SDTCalculator.calculateMinDPrime(stats);
          const avg = SDTCalculator.calculateAverageDPrime(stats);
          return min === avg;
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('relationship invariants', () => {
    it('43. d-prime from calculateModalityStats equals calculateDPrime with same counts', () => {
      fc.assert(
        fc.property(rawCountsArb, (counts) => {
          const stats = SDTCalculator.calculateModalityStats(counts);
          const direct = SDTCalculator.calculateDPrime(
            counts.hits,
            counts.misses,
            counts.falseAlarms,
            counts.correctRejections,
          );
          return stats.dPrime === direct;
        }),
        { numRuns: 500 },
      );
    });

    it('44. counts from calculateModalityStats match input counts', () => {
      fc.assert(
        fc.property(rawCountsArb, (counts) => {
          const stats = SDTCalculator.calculateModalityStats(counts);
          return (
            stats.hits === counts.hits &&
            stats.misses === counts.misses &&
            stats.falseAlarms === counts.falseAlarms &&
            stats.correctRejections === counts.correctRejections
          );
        }),
        { numRuns: 500 },
      );
    });

    it('45. higher hit rate implies higher d-prime (given fixed FA rate)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 5, max: 20 }),
          fc.integer({ min: 5, max: 20 }),
          fc.integer({ min: 1, max: 10 }),
          fc.integer({ min: 10, max: 30 }),
          (h1, h2, f, c) => {
            // Keep FA and CR constant to fix FA rate
            const d1 = SDTCalculator.calculateDPrime(Math.min(h1, h2), 20 - Math.min(h1, h2), f, c);
            const d2 = SDTCalculator.calculateDPrime(Math.max(h1, h2), 20 - Math.max(h1, h2), f, c);
            // Higher hit rate should give higher d'
            return d2 >= d1 - 1e-9;
          },
        ),
        { numRuns: 200 },
      );
    });

    it('46. lower FA rate implies higher d-prime (given fixed hit rate)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 10, max: 20 }),
          fc.integer({ min: 1, max: 5 }),
          fc.integer({ min: 6, max: 10 }),
          (h, f1, f2) => {
            // Keep hits and misses constant to fix hit rate
            const c = 20; // Fixed CR
            const d1 = SDTCalculator.calculateDPrime(h, 5, Math.max(f1, f2), c);
            const d2 = SDTCalculator.calculateDPrime(h, 5, Math.min(f1, f2), c);
            // Lower FA rate should give higher d'
            return d2 >= d1 - 1e-9;
          },
        ),
        { numRuns: 200 },
      );
    });

    it('47. reaction times are preserved in calculateModalityStats', () => {
      fc.assert(
        fc.property(rawCountsArb, (counts) => {
          const stats = SDTCalculator.calculateModalityStats(counts);
          return (
            stats.reactionTimes.length === counts.reactionTimes.length &&
            stats.reactionTimes.every((rt, i) => rt === counts.reactionTimes[i])
          );
        }),
        { numRuns: 200 },
      );
    });

    it('48. avgReactionTime is null when no reaction times', () => {
      fc.assert(
        fc.property(countArb, countArb, countArb, countArb, (h, m, f, c) => {
          const counts: RawCounts = {
            hits: h,
            misses: m,
            falseAlarms: f,
            correctRejections: c,
            reactionTimes: [],
          };
          const stats = SDTCalculator.calculateModalityStats(counts);
          return stats.avgReactionTime === null;
        }),
        { numRuns: 100 },
      );
    });

    it('49. avgReactionTime equals arithmetic mean when reaction times exist', () => {
      fc.assert(
        fc.property(
          fc.array(fc.double({ min: 50, max: 3000, noNaN: true }), { minLength: 1, maxLength: 50 }),
          (rts) => {
            const counts: RawCounts = {
              hits: rts.length,
              misses: 0,
              falseAlarms: 0,
              correctRejections: 10,
              reactionTimes: rts,
            };
            const stats = SDTCalculator.calculateModalityStats(counts);
            const expectedAvg = rts.reduce((a, b) => a + b, 0) / rts.length;
            return (
              stats.avgReactionTime !== null && Math.abs(stats.avgReactionTime - expectedAvg) < 1e-9
            );
          },
        ),
        { numRuns: 200 },
      );
    });

    it('50. calculateAverageDPrime returns 0 for empty stats object', () => {
      const avg = SDTCalculator.calculateAverageDPrime({});
      expect(avg).toBe(0);
    });

    it('51. calculateMinDPrime returns 0 for empty stats object', () => {
      const min = SDTCalculator.calculateMinDPrime({});
      expect(min).toBe(0);
    });

    it('52. d-prime is symmetric in swapped hit/FA and miss/CR when anti-gaming does not apply', () => {
      // This tests the mathematical property that swapping signal and noise roles
      // inverts the sign of d' (since we're now measuring the opposite discrimination)
      fc.assert(
        fc.property(
          fc.integer({ min: 5, max: 20 }),
          fc.integer({ min: 1, max: 10 }),
          fc.integer({ min: 1, max: 10 }),
          fc.integer({ min: 5, max: 20 }),
          (h, m, f, c) => {
            // Ensure anti-gaming guards don't trigger
            fc.pre(h > 0 && c > 0 && h + m > 0 && f + c > 0);
            const d1 = SDTCalculator.calculateDPrime(h, m, f, c);
            // Swap roles: what was FA becomes hit, what was CR becomes miss
            const d2 = SDTCalculator.calculateDPrime(f, c, h, m);
            // d2 should be approximately -d1 (sign reversal)
            return Math.abs(d1 + d2) < 0.5; // Allow some tolerance due to Hautus
          },
        ),
        { numRuns: 200 },
      );
    });
  });
});
