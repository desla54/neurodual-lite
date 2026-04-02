import { describe, expect, it } from 'bun:test';
import * as fc from 'fast-check';
// @ts-expect-error test override
import { SDTCalculator, type ModalityStats } from './sdt-calculator';

describe('SDTCalculator - Property Tests', () => {
  describe('probit(p)', () => {
    it('output is bounded [-5, 5] for valid probability range', () => {
      fc.assert(
        fc.property(fc.double({ min: 0, max: 1, noNaN: true }), (p) => {
          const z = SDTCalculator.probit(p);
          return z >= -5 && z <= 5;
        }),
      );
    });

    it('is monotonically increasing', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 0, max: 1, noNaN: true }),
          fc.double({ min: 0, max: 1, noNaN: true }),
          (p1, p2) => {
            const [min, max] = p1 < p2 ? [p1, p2] : [p2, p1];
            if (min === max) return true;
            // Use simple monotonicity because of clamping at 1e-10
            return SDTCalculator.probit(min) <= SDTCalculator.probit(max) + 0.000001;
          },
        ),
      );
    });

    it('probit(0.5) ≈ 0 (median of normal distribution)', () => {
      expect(SDTCalculator.probit(0.5)).toBeCloseTo(0, 5);
    });

    it('is antisymmetric around 0.5: probit(p) ≈ -probit(1-p)', () => {
      fc.assert(
        fc.property(fc.double({ min: 0.0001, max: 0.9999, noNaN: true }), (p) => {
          const z1 = SDTCalculator.probit(p);
          const z2 = SDTCalculator.probit(1 - p);
          return Math.abs(z1 + z2) < 0.001;
        }),
      );
    });

    it('handles edge cases: probit(0) = -5, probit(1) = 5', () => {
      expect(SDTCalculator.probit(0)).toBe(-5);
      expect(SDTCalculator.probit(1)).toBe(5);
    });
  });

  describe('calculateDPrime(hits, misses, fa, cr)', () => {
    const hitsArb = fc.integer({ min: 0, max: 50 });
    const missesArb = fc.integer({ min: 0, max: 50 });
    const faArb = fc.integer({ min: 0, max: 50 });
    const crArb = fc.integer({ min: 0, max: 50 });

    it("d' is finite for all valid inputs", () => {
      fc.assert(
        fc.property(hitsArb, missesArb, faArb, crArb, (h, m, f, c) => {
          const d = SDTCalculator.calculateDPrime(h, m, f, c);
          return Number.isFinite(d);
        }),
      );
    });

    it("d' is bounded between -10 and 10", () => {
      fc.assert(
        fc.property(hitsArb, missesArb, faArb, crArb, (h, m, f, c) => {
          const d = SDTCalculator.calculateDPrime(h, m, f, c);
          return d >= -10.0 && d <= 10.0;
        }),
      );
    });

    it("Monotonicity > increasing hits (keeping others fixed) increases or maintains d'", () => {
      fc.assert(
        fc.property(hitsArb, missesArb, faArb, crArb, (h, m, f, c) => {
          const d1 = SDTCalculator.calculateDPrime(h, m, f, c);
          const d2 = SDTCalculator.calculateDPrime(h + 1, m, f, c);

          // The anti-gaming guard (hits=0 -> d'=0) can cause a non-monotonic jump
          // when going from 0 to 1 hit if the "natural" Hautus d' for 0 hits would have been positive.
          // We only check monotonicity for h > 0.
          if (h === 0) return true;

          return d2 >= d1 - 0.000001;
        }),
      );
    });

    it("Monotonicity > increasing false alarms (keeping others fixed) decreases or maintains d'", () => {
      fc.assert(
        fc.property(hitsArb, missesArb, faArb, crArb, (h, m, f, c) => {
          const d1 = SDTCalculator.calculateDPrime(h, m, f, c);
          const d2 = SDTCalculator.calculateDPrime(h, m, f + 1, c);
          return d2 <= d1 + 0.000001;
        }),
      );
    });

    it('Anti-gaming guards > returns 0 when hits = 0 (inactivity)', () => {
      fc.assert(
        fc.property(missesArb, faArb, crArb, (m, f, c) => {
          return SDTCalculator.calculateDPrime(0, m, f, c) === 0;
        }),
      );
    });

    it('Anti-gaming guards > returns 0 when correctRejections = 0 (spammer)', () => {
      fc.assert(
        fc.property(hitsArb, missesArb, faArb, (h, m, f) => {
          return SDTCalculator.calculateDPrime(h, m, f, 0) === 0;
        }),
      );
    });

    it('Anti-gaming guards > returns 0 when no signal trials (hits + misses = 0)', () => {
      fc.assert(
        fc.property(faArb, crArb, (f, c) => {
          return SDTCalculator.calculateDPrime(0, 0, f, c) === 0;
        }),
      );
    });

    it('Anti-gaming guards > returns 0 when no noise trials (fa + cr = 0)', () => {
      fc.assert(
        fc.property(hitsArb, missesArb, (h, m) => {
          return SDTCalculator.calculateDPrime(h, m, 0, 0) === 0;
        }),
      );
    });

    it("Hautus correction properties > never produces infinite d' even at extremes", () => {
      const largeArb = fc.integer({ min: 1000, max: 10000 });
      fc.assert(
        fc.property(largeArb, (n) => {
          const d = SDTCalculator.calculateDPrime(n, 0, 0, n);
          return Number.isFinite(d);
        }),
      );
    });

    it("d' is bounded for reasonable performance", () => {
      expect(SDTCalculator.calculateDPrime(20, 0, 0, 20)).toBeLessThan(5);
      expect(SDTCalculator.calculateDPrime(10, 10, 10, 10)).toBe(0);
    });
  });

  describe('calculateAverageDPrime', () => {
    it('returns 0 for empty input', () => {
      expect(SDTCalculator.calculateAverageDPrime({})).toBe(0);
    });

    it("equals single d' when only one modality", () => {
      const stats = {
        position: { dPrime: 2.5 } as ModalityStats,
      };
      expect(SDTCalculator.calculateAverageDPrime(stats)).toBe(2.5);
    });

    it('is ordered: min <= average', () => {
      fc.assert(
        fc.property(
          fc.array(fc.double({ min: -5, max: 5, noNaN: true }), { minLength: 1 }),
          (dPrimes) => {
            const stats: Record<string, ModalityStats> = {};
            for (const [i, d] of dPrimes.entries()) stats[`m${i}`] = { dPrime: d } as ModalityStats;

            const avg = SDTCalculator.calculateAverageDPrime(stats);
            const min = SDTCalculator.calculateMinDPrime(stats);
            return min <= avg + 0.00001;
          },
        ),
      );
    });
  });
});
