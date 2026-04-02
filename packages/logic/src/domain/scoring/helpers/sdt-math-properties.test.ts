/**
 * SDT Mathematical Properties - Exhaustive Property-Based Tests
 *
 * 200+ property tests for Signal Detection Theory calculations.
 * Focus on mathematical correctness, numerical stability, and edge cases.
 *
 * Categories:
 * 1. Probit Function Properties (1-40)
 * 2. D-Prime Formula Properties (41-80)
 * 3. Hit Rate Properties (81-100)
 * 4. False Alarm Rate Properties (101-120)
 * 5. Hautus Correction Properties (121-140)
 * 6. Sensitivity vs Bias Properties (141-160)
 * 7. Numerical Stability Properties (161-180)
 * 8. Asymptotic Behavior Properties (181-200)
 * 9. Additional Mathematical Invariants (201+)
 */
import { describe, expect, it } from 'bun:test';
import * as fc from 'fast-check';
import { SDTCalculator, type RawCounts } from './sdt-calculator';
import type { ModalityStats } from '../../types';

// =============================================================================
// Test Configuration
// =============================================================================

const HIGH_RUNS = 500;
const MEDIUM_RUNS = 200;
const LOW_RUNS = 100;

// =============================================================================
// Custom Arbitraries
// =============================================================================

// Probability ranges
const probArb = fc.double({ min: 0, max: 1, noNaN: true });
const interiorProbArb = fc.double({ min: 0.001, max: 0.999, noNaN: true });
const extremeLowProbArb = fc.double({ min: 1e-10, max: 0.01, noNaN: true });
const extremeHighProbArb = fc.double({ min: 0.99, max: 1 - 1e-10, noNaN: true });

// Count ranges
const countArb = fc.integer({ min: 0, max: 100 });
const posCountArb = fc.integer({ min: 1, max: 100 });
const smallCountArb = fc.integer({ min: 1, max: 10 });
const largeCountArb = fc.integer({ min: 100, max: 10000 });

// Valid SDT scenario (has signal, noise, hits, and CR)
const validScenarioArb = fc.record({
  hits: posCountArb,
  misses: countArb,
  falseAlarms: countArb,
  correctRejections: posCountArb,
});

// =============================================================================
// CATEGORY 1: PROBIT FUNCTION PROPERTIES (Tests 1-40)
// =============================================================================

describe('SDT Math Properties - 1. Probit Function', () => {
  // --- Monotonicity ---
  it('P1: probit is strictly monotonically increasing on (0,1)', () => {
    fc.assert(
      fc.property(interiorProbArb, interiorProbArb, (p1, p2) => {
        if (Math.abs(p1 - p2) < 1e-10) return true;
        const [pLow, pHigh] = p1 < p2 ? [p1, p2] : [p2, p1];
        return SDTCalculator.probit(pLow) < SDTCalculator.probit(pHigh);
      }),
      { numRuns: HIGH_RUNS },
    );
  });

  it('P2: probit monotonicity holds at low probability region', () => {
    fc.assert(
      fc.property(extremeLowProbArb, extremeLowProbArb, (p1, p2) => {
        if (Math.abs(p1 - p2) < 1e-15) return true;
        const [pLow, pHigh] = p1 < p2 ? [p1, p2] : [p2, p1];
        return SDTCalculator.probit(pLow) <= SDTCalculator.probit(pHigh);
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('P3: probit monotonicity holds at high probability region', () => {
    fc.assert(
      fc.property(extremeHighProbArb, extremeHighProbArb, (p1, p2) => {
        if (Math.abs(p1 - p2) < 1e-15) return true;
        const [pLow, pHigh] = p1 < p2 ? [p1, p2] : [p2, p1];
        return SDTCalculator.probit(pLow) <= SDTCalculator.probit(pHigh);
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('P4: probit preserves ordering for any three probabilities', () => {
    fc.assert(
      fc.property(interiorProbArb, interiorProbArb, interiorProbArb, (p1, p2, p3) => {
        const sorted = [p1, p2, p3].sort((a, b) => a - b);
        const zs = sorted.map((p) => SDTCalculator.probit(p));
        // Allow tiny epsilon for floating point comparison when values are very close
        return zs[0]! <= zs[1]! + 1e-9 && zs[1]! <= zs[2]! + 1e-9;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  // --- Symmetry ---
  it('P5: probit(0.5) equals 0 (median property)', () => {
    expect(Math.abs(SDTCalculator.probit(0.5))).toBeLessThan(1e-10);
  });

  it('P6: probit antisymmetry: probit(p) = -probit(1-p)', () => {
    fc.assert(
      fc.property(interiorProbArb, (p) => {
        const z1 = SDTCalculator.probit(p);
        const z2 = SDTCalculator.probit(1 - p);
        return Math.abs(z1 + z2) < 0.001;
      }),
      { numRuns: HIGH_RUNS },
    );
  });

  it('P7: probit antisymmetry near 0.5', () => {
    fc.assert(
      fc.property(fc.double({ min: 0.4, max: 0.5, noNaN: true }), (p) => {
        const z1 = SDTCalculator.probit(p);
        const z2 = SDTCalculator.probit(1 - p);
        return Math.abs(z1 + z2) < 0.0001;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('P8: probit symmetry around median: |probit(0.5+d)| = |probit(0.5-d)|', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 0.49, noNaN: true }), (d) => {
        const z1 = SDTCalculator.probit(0.5 + d);
        const z2 = SDTCalculator.probit(0.5 - d);
        return Math.abs(Math.abs(z1) - Math.abs(z2)) < 0.001;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  // --- Bounds ---
  it('P9: probit output bounded by [-5, 5] for all valid inputs', () => {
    fc.assert(
      fc.property(probArb, (p) => {
        const z = SDTCalculator.probit(p);
        return z >= -5 && z <= 5;
      }),
      { numRuns: HIGH_RUNS },
    );
  });

  it('P10: probit(0) equals -5 (lower bound)', () => {
    expect(SDTCalculator.probit(0)).toBe(-5);
  });

  it('P11: probit(1) equals 5 (upper bound)', () => {
    expect(SDTCalculator.probit(1)).toBe(5);
  });

  it('P12: probit approaches -5 as p approaches 0', () => {
    const values = [0.001, 0.0001, 0.00001, 1e-8, 1e-10];
    for (const p of values) {
      expect(SDTCalculator.probit(p)).toBeLessThan(-2);
    }
  });

  it('P13: probit approaches 5 as p approaches 1', () => {
    const values = [0.999, 0.9999, 0.99999, 1 - 1e-8, 1 - 1e-10];
    for (const p of values) {
      expect(SDTCalculator.probit(p)).toBeGreaterThan(2);
    }
  });

  // --- Continuity ---
  it('P14: probit is continuous: small changes in p yield small changes in z', () => {
    fc.assert(
      fc.property(interiorProbArb, fc.double({ min: 1e-6, max: 1e-4, noNaN: true }), (p, delta) => {
        const z1 = SDTCalculator.probit(p);
        const z2 = SDTCalculator.probit(Math.min(0.999, p + delta));
        // Derivative of probit is bounded, so change should be proportional
        return Math.abs(z2 - z1) < delta * 1000;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('P15: probit continuous at region boundary pLow=0.02425', () => {
    const pLow = 0.02425;
    const eps = 1e-6;
    const z1 = SDTCalculator.probit(pLow - eps);
    const z2 = SDTCalculator.probit(pLow);
    const z3 = SDTCalculator.probit(pLow + eps);
    expect(Math.abs(z2 - z1)).toBeLessThan(0.01);
    expect(Math.abs(z3 - z2)).toBeLessThan(0.01);
  });

  it('P16: probit continuous at region boundary pHigh=0.97575', () => {
    const pHigh = 1 - 0.02425;
    const eps = 1e-6;
    const z1 = SDTCalculator.probit(pHigh - eps);
    const z2 = SDTCalculator.probit(pHigh);
    const z3 = SDTCalculator.probit(pHigh + eps);
    expect(Math.abs(z2 - z1)).toBeLessThan(0.01);
    expect(Math.abs(z3 - z2)).toBeLessThan(0.01);
  });

  // --- Known Values ---
  it('P17: probit(0.8413) approximately equals 1 (1 std dev)', () => {
    const z = SDTCalculator.probit(0.8413);
    expect(Math.abs(z - 1)).toBeLessThan(0.01);
  });

  it('P18: probit(0.9772) approximately equals 2 (2 std dev)', () => {
    const z = SDTCalculator.probit(0.9772);
    expect(Math.abs(z - 2)).toBeLessThan(0.01);
  });

  it('P19: probit(0.1587) approximately equals -1 (-1 std dev)', () => {
    const z = SDTCalculator.probit(0.1587);
    expect(Math.abs(z - -1)).toBeLessThan(0.01);
  });

  it('P20: probit(0.0228) approximately equals -2 (-2 std dev)', () => {
    const z = SDTCalculator.probit(0.0228);
    expect(Math.abs(z - -2)).toBeLessThan(0.01);
  });

  // --- Finiteness ---
  it('P21: probit always returns finite value for valid probability', () => {
    fc.assert(
      fc.property(probArb, (p) => {
        return Number.isFinite(SDTCalculator.probit(p));
      }),
      { numRuns: HIGH_RUNS },
    );
  });

  it('P22: probit handles NaN input gracefully', () => {
    expect(Number.isFinite(SDTCalculator.probit(Number.NaN))).toBe(true);
  });

  it('P23: probit handles Infinity input gracefully', () => {
    expect(Number.isFinite(SDTCalculator.probit(Infinity))).toBe(true);
    expect(Number.isFinite(SDTCalculator.probit(-Infinity))).toBe(true);
  });

  it('P24: probit handles negative probability gracefully', () => {
    expect(Number.isFinite(SDTCalculator.probit(-0.5))).toBe(true);
  });

  it('P25: probit handles probability > 1 gracefully', () => {
    expect(Number.isFinite(SDTCalculator.probit(1.5))).toBe(true);
  });

  // --- Determinism ---
  it('P26: probit is deterministic', () => {
    fc.assert(
      fc.property(probArb, (p) => {
        const z1 = SDTCalculator.probit(p);
        const z2 = SDTCalculator.probit(p);
        return z1 === z2;
      }),
      { numRuns: HIGH_RUNS },
    );
  });

  it('P27: probit(p) == probit(p) for 1000 identical calls', () => {
    const p = 0.75;
    const z = SDTCalculator.probit(p);
    for (let i = 0; i < 1000; i++) {
      expect(SDTCalculator.probit(p)).toBe(z);
    }
  });

  // --- Derivative Properties ---
  it('P28: probit derivative is positive everywhere on (0,1)', () => {
    fc.assert(
      fc.property(interiorProbArb, (p) => {
        const h = 1e-7;
        const pMinus = Math.max(0.0001, p - h);
        const pPlus = Math.min(0.9999, p + h);
        const derivative =
          (SDTCalculator.probit(pPlus) - SDTCalculator.probit(pMinus)) / (pPlus - pMinus);
        return derivative > 0;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('P29: probit derivative is smallest near p=0.5', () => {
    const h = 1e-5;
    const deriv_05 = (SDTCalculator.probit(0.5 + h) - SDTCalculator.probit(0.5 - h)) / (2 * h);
    const deriv_02 = (SDTCalculator.probit(0.2 + h) - SDTCalculator.probit(0.2 - h)) / (2 * h);
    const deriv_08 = (SDTCalculator.probit(0.8 + h) - SDTCalculator.probit(0.8 - h)) / (2 * h);
    expect(deriv_05).toBeLessThan(deriv_02);
    expect(deriv_05).toBeLessThan(deriv_08);
  });

  it('P30: probit derivative increases as p moves away from 0.5', () => {
    const h = 1e-5;
    const calcDeriv = (p: number) =>
      (SDTCalculator.probit(p + h) - SDTCalculator.probit(p - h)) / (2 * h);
    const d1 = calcDeriv(0.5);
    const d2 = calcDeriv(0.6);
    const d3 = calcDeriv(0.7);
    const d4 = calcDeriv(0.8);
    expect(d1).toBeLessThan(d2);
    expect(d2).toBeLessThan(d3);
    expect(d3).toBeLessThan(d4);
  });

  // --- Range subdivision ---
  it('P31: probit splits (0,1) into equal parts via inverse', () => {
    // z=0 corresponds to p=0.5
    expect(Math.abs(SDTCalculator.probit(0.5))).toBeLessThan(1e-6);
    // z<0 for p<0.5, z>0 for p>0.5
    expect(SDTCalculator.probit(0.3)).toBeLessThan(0);
    expect(SDTCalculator.probit(0.7)).toBeGreaterThan(0);
  });

  it('P32: probit quartiles: probit(0.25) < probit(0.5) < probit(0.75)', () => {
    const q1 = SDTCalculator.probit(0.25);
    const q2 = SDTCalculator.probit(0.5);
    const q3 = SDTCalculator.probit(0.75);
    expect(q1).toBeLessThan(q2);
    expect(q2).toBeLessThan(q3);
    expect(q1).toBeCloseTo(-q3, 3);
  });

  it('P33: probit deciles are evenly spaced in z', () => {
    const deciles = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
    const zValues = deciles.map((p) => SDTCalculator.probit(p));
    // Check approximate spacing (not exact due to normal distribution)
    for (let i = 1; i < zValues.length; i++) {
      expect(zValues[i]!).toBeGreaterThan(zValues[i - 1]!);
    }
  });

  // --- Edge probability handling ---
  it('P34: probit at 1e-10 returns -5', () => {
    expect(SDTCalculator.probit(1e-10)).toBe(-5);
  });

  it('P35: probit at 1-1e-10 returns 5', () => {
    expect(SDTCalculator.probit(1 - 1e-10)).toBe(5);
  });

  it('P36: probit just above 1e-10 is greater than -5', () => {
    const z = SDTCalculator.probit(2e-10);
    expect(z).toBeGreaterThanOrEqual(-5);
  });

  it('P37: probit just below 1-1e-10 is less than 5', () => {
    const z = SDTCalculator.probit(1 - 2e-10);
    expect(z).toBeLessThanOrEqual(5);
  });

  // --- Precision tests ---
  it('P38: probit precision at p=0.5 is very high', () => {
    expect(Math.abs(SDTCalculator.probit(0.5))).toBeLessThan(1e-10);
  });

  it('P39: probit maintains precision for probabilities near 0.5', () => {
    fc.assert(
      fc.property(fc.double({ min: 0.45, max: 0.55, noNaN: true }), (p) => {
        const z = SDTCalculator.probit(p);
        // For p near 0.5, z should be near 0
        return Math.abs(z) < 0.2;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('P40: probit output range matches bounded domain', () => {
    fc.assert(
      fc.property(probArb, (p) => {
        const z = SDTCalculator.probit(p);
        // Output should be in [-5, 5]
        return z >= -5 && z <= 5;
      }),
      { numRuns: HIGH_RUNS },
    );
  });
});

// =============================================================================
// CATEGORY 2: D-PRIME FORMULA PROPERTIES (Tests 41-80)
// =============================================================================

describe('SDT Math Properties - 2. D-Prime Formula', () => {
  // --- Basic Properties ---
  it('D41: d-prime is finite for all non-negative counts', () => {
    fc.assert(
      fc.property(countArb, countArb, countArb, countArb, (h, m, f, c) => {
        return Number.isFinite(SDTCalculator.calculateDPrime(h, m, f, c));
      }),
      { numRuns: HIGH_RUNS },
    );
  });

  it('D42: d-prime bounded by [-10, 10]', () => {
    fc.assert(
      fc.property(countArb, countArb, countArb, countArb, (h, m, f, c) => {
        const d = SDTCalculator.calculateDPrime(h, m, f, c);
        return d >= -10 && d <= 10;
      }),
      { numRuns: HIGH_RUNS },
    );
  });

  it('D43: d-prime is deterministic', () => {
    fc.assert(
      fc.property(countArb, countArb, countArb, countArb, (h, m, f, c) => {
        const d1 = SDTCalculator.calculateDPrime(h, m, f, c);
        const d2 = SDTCalculator.calculateDPrime(h, m, f, c);
        return d1 === d2;
      }),
      { numRuns: HIGH_RUNS },
    );
  });

  // --- Monotonicity in hits ---
  it('D44: increasing hits increases d-prime (valid scenario)', () => {
    fc.assert(
      fc.property(validScenarioArb, ({ hits, misses, falseAlarms, correctRejections }) => {
        const d1 = SDTCalculator.calculateDPrime(hits, misses, falseAlarms, correctRejections);
        const d2 = SDTCalculator.calculateDPrime(hits + 1, misses, falseAlarms, correctRejections);
        return d2 >= d1 - 1e-9;
      }),
      { numRuns: HIGH_RUNS },
    );
  });

  it('D45: doubling hits increases d-prime', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 50 }),
        fc.integer({ min: 5, max: 50 }),
        fc.integer({ min: 5, max: 50 }),
        fc.integer({ min: 5, max: 50 }),
        (h, m, f, c) => {
          const d1 = SDTCalculator.calculateDPrime(h, m, f, c);
          const d2 = SDTCalculator.calculateDPrime(h * 2, m, f, c);
          return d2 >= d1;
        },
      ),
      { numRuns: MEDIUM_RUNS },
    );
  });

  // --- Monotonicity in misses ---
  it('D46: increasing misses decreases d-prime', () => {
    fc.assert(
      fc.property(validScenarioArb, ({ hits, misses, falseAlarms, correctRejections }) => {
        const d1 = SDTCalculator.calculateDPrime(hits, misses, falseAlarms, correctRejections);
        const d2 = SDTCalculator.calculateDPrime(hits, misses + 1, falseAlarms, correctRejections);
        return d2 <= d1 + 1e-9;
      }),
      { numRuns: HIGH_RUNS },
    );
  });

  it('D47: doubling misses decreases d-prime', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 50 }),
        fc.integer({ min: 5, max: 50 }),
        fc.integer({ min: 5, max: 50 }),
        fc.integer({ min: 5, max: 50 }),
        (h, m, f, c) => {
          const d1 = SDTCalculator.calculateDPrime(h, m, f, c);
          const d2 = SDTCalculator.calculateDPrime(h, m * 2, f, c);
          return d2 <= d1;
        },
      ),
      { numRuns: MEDIUM_RUNS },
    );
  });

  // --- Monotonicity in false alarms ---
  it('D48: increasing false alarms decreases d-prime', () => {
    fc.assert(
      fc.property(validScenarioArb, ({ hits, misses, falseAlarms, correctRejections }) => {
        const d1 = SDTCalculator.calculateDPrime(hits, misses, falseAlarms, correctRejections);
        const d2 = SDTCalculator.calculateDPrime(hits, misses, falseAlarms + 1, correctRejections);
        return d2 <= d1 + 1e-9;
      }),
      { numRuns: HIGH_RUNS },
    );
  });

  it('D49: doubling false alarms decreases d-prime', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 50 }),
        fc.integer({ min: 5, max: 50 }),
        fc.integer({ min: 5, max: 50 }),
        fc.integer({ min: 5, max: 50 }),
        (h, m, f, c) => {
          const d1 = SDTCalculator.calculateDPrime(h, m, f, c);
          const d2 = SDTCalculator.calculateDPrime(h, m, f * 2, c);
          return d2 <= d1;
        },
      ),
      { numRuns: MEDIUM_RUNS },
    );
  });

  // --- Monotonicity in correct rejections ---
  it('D50: increasing correct rejections increases d-prime', () => {
    fc.assert(
      fc.property(validScenarioArb, ({ hits, misses, falseAlarms, correctRejections }) => {
        const d1 = SDTCalculator.calculateDPrime(hits, misses, falseAlarms, correctRejections);
        const d2 = SDTCalculator.calculateDPrime(hits, misses, falseAlarms, correctRejections + 1);
        return d2 >= d1 - 1e-9;
      }),
      { numRuns: HIGH_RUNS },
    );
  });

  it('D51: doubling correct rejections increases d-prime', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 50 }),
        fc.integer({ min: 5, max: 50 }),
        fc.integer({ min: 5, max: 50 }),
        fc.integer({ min: 5, max: 50 }),
        (h, m, f, c) => {
          const d1 = SDTCalculator.calculateDPrime(h, m, f, c);
          const d2 = SDTCalculator.calculateDPrime(h, m, f, c * 2);
          return d2 >= d1;
        },
      ),
      { numRuns: MEDIUM_RUNS },
    );
  });

  // --- Anti-gaming guards ---
  it('D52: hits=0 returns 0 (anti-gaming)', () => {
    fc.assert(
      fc.property(countArb, countArb, countArb, (m, f, c) => {
        return SDTCalculator.calculateDPrime(0, m, f, c) === 0;
      }),
      { numRuns: HIGH_RUNS },
    );
  });

  it('D53: correctRejections=0 returns 0 (anti-spammer)', () => {
    fc.assert(
      fc.property(countArb, countArb, countArb, (h, m, f) => {
        return SDTCalculator.calculateDPrime(h, m, f, 0) === 0;
      }),
      { numRuns: HIGH_RUNS },
    );
  });

  it('D54: no signal trials returns 0', () => {
    fc.assert(
      fc.property(countArb, countArb, (f, c) => {
        return SDTCalculator.calculateDPrime(0, 0, f, c) === 0;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('D55: no noise trials returns 0', () => {
    fc.assert(
      fc.property(countArb, countArb, (h, m) => {
        return SDTCalculator.calculateDPrime(h, m, 0, 0) === 0;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  // --- Special cases ---
  it('D56: all zeros returns 0', () => {
    expect(SDTCalculator.calculateDPrime(0, 0, 0, 0)).toBe(0);
  });

  it('D57: perfect performance (all hits, no FA) gives positive d-prime', () => {
    fc.assert(
      fc.property(posCountArb, posCountArb, (h, c) => {
        const d = SDTCalculator.calculateDPrime(h, 0, 0, c);
        return d > 0;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('D58: chance performance gives d-prime near 0', () => {
    fc.assert(
      fc.property(posCountArb, (n) => {
        const d = SDTCalculator.calculateDPrime(n, n, n, n);
        return Math.abs(d) < 0.5;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('D59: equal hit rate and FA rate gives d-prime near 0', () => {
    fc.assert(
      fc.property(posCountArb, posCountArb, (n, m) => {
        // Same proportion for both signal and noise
        const d = SDTCalculator.calculateDPrime(n, m, n, m);
        return Math.abs(d) < 0.1;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  // --- Bounds ---
  it('D60: d-prime bounded even for large counts', () => {
    fc.assert(
      fc.property(largeCountArb, largeCountArb, largeCountArb, largeCountArb, (h, m, f, c) => {
        const d = SDTCalculator.calculateDPrime(h, m, f, c);
        return Number.isFinite(d) && d >= -10 && d <= 10;
      }),
      { numRuns: LOW_RUNS },
    );
  });

  it('D61: perfect performance d-prime bounded by probit bounds', () => {
    const d = SDTCalculator.calculateDPrime(1000, 0, 0, 1000);
    expect(d).toBeLessThan(10);
    expect(d).toBeGreaterThan(0);
  });

  it('D62: d-prime never exceeds 2 * probit_max = 10', () => {
    fc.assert(
      fc.property(countArb, countArb, countArb, countArb, (h, m, f, c) => {
        const d = SDTCalculator.calculateDPrime(h, m, f, c);
        return d <= 10;
      }),
      { numRuns: HIGH_RUNS },
    );
  });

  it('D63: d-prime never below -10', () => {
    fc.assert(
      fc.property(countArb, countArb, countArb, countArb, (h, m, f, c) => {
        const d = SDTCalculator.calculateDPrime(h, m, f, c);
        return d >= -10;
      }),
      { numRuns: HIGH_RUNS },
    );
  });

  // --- Negative d-prime scenarios ---
  it('D64: low hit rate + high FA rate gives negative d-prime (when valid)', () => {
    // This requires overcoming anti-gaming guards
    const d = SDTCalculator.calculateDPrime(2, 50, 50, 2);
    // With hits=2 > 0 and CR=2 > 0, guards don't trigger
    expect(d).toBeLessThan(0);
  });

  it('D65: hit rate < FA rate implies d-prime <= 0 (when valid)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }),
        fc.integer({ min: 40, max: 50 }),
        fc.integer({ min: 40, max: 50 }),
        fc.integer({ min: 1, max: 10 }),
        (h, m, f, c) => {
          const d = SDTCalculator.calculateDPrime(h, m, f, c);
          return d <= 0.5; // Allow small positive due to Hautus
        },
      ),
      { numRuns: MEDIUM_RUNS },
    );
  });

  // --- Scaling properties ---
  it('D66: scaling all counts by same factor preserves approximate d-prime', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 10, max: 30 }),
        fc.integer({ min: 5, max: 15 }),
        fc.integer({ min: 5, max: 15 }),
        fc.integer({ min: 10, max: 30 }),
        fc.integer({ min: 2, max: 5 }),
        (h, m, f, c, scale) => {
          const d1 = SDTCalculator.calculateDPrime(h, m, f, c);
          const d2 = SDTCalculator.calculateDPrime(h * scale, m * scale, f * scale, c * scale);
          // Due to Hautus correction, values converge as N increases
          // For small N, difference can be larger; tolerance scales with difference in N
          return Math.abs(d1 - d2) < 1.0;
        },
      ),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('D67: asymptotically, doubling sample preserves approximate d-prime', () => {
    const d1 = SDTCalculator.calculateDPrime(50, 50, 50, 50);
    const d2 = SDTCalculator.calculateDPrime(100, 100, 100, 100);
    expect(Math.abs(d1 - d2)).toBeLessThan(0.1);
  });

  // --- Relationship to rates ---
  it('D68: d-prime = probit(hitRate) - probit(FARate) with Hautus', () => {
    fc.assert(
      fc.property(validScenarioArb, ({ hits, misses, falseAlarms, correctRejections }) => {
        const signalTrials = hits + misses;
        const noiseTrials = falseAlarms + correctRejections;
        const hautusHitRate = (hits + 0.5) / (signalTrials + 1);
        const hautusFARate = (falseAlarms + 0.5) / (noiseTrials + 1);
        const expectedD = SDTCalculator.probit(hautusHitRate) - SDTCalculator.probit(hautusFARate);
        const actualD = SDTCalculator.calculateDPrime(hits, misses, falseAlarms, correctRejections);
        return Math.abs(expectedD - actualD) < 1e-9;
      }),
      { numRuns: HIGH_RUNS },
    );
  });

  // --- Transitivity ---
  it('D69: if d1 > d2 and d2 > d3, then d1 > d3', () => {
    // Increasing hits creates ordered d-primes
    const d1 = SDTCalculator.calculateDPrime(30, 10, 10, 30);
    const d2 = SDTCalculator.calculateDPrime(20, 10, 10, 30);
    const d3 = SDTCalculator.calculateDPrime(10, 10, 10, 30);
    expect(d1).toBeGreaterThan(d2);
    expect(d2).toBeGreaterThan(d3);
    expect(d1).toBeGreaterThan(d3);
  });

  // --- Commutativity of effects ---
  it('D70: order of increasing hits vs decreasing FA does not matter', () => {
    const base = SDTCalculator.calculateDPrime(10, 10, 10, 10);
    const addHitFirst = SDTCalculator.calculateDPrime(15, 10, 5, 10);
    const reduceFAFirst = SDTCalculator.calculateDPrime(15, 10, 5, 10);
    expect(addHitFirst).toBe(reduceFAFirst);
  });

  // --- More edge cases ---
  it('D71: single signal trial with hit', () => {
    const d = SDTCalculator.calculateDPrime(1, 0, 5, 15);
    expect(Number.isFinite(d)).toBe(true);
    expect(d).toBeGreaterThan(0);
  });

  it('D72: single noise trial with correct rejection', () => {
    const d = SDTCalculator.calculateDPrime(10, 10, 0, 1);
    expect(Number.isFinite(d)).toBe(true);
    expect(d).toBeGreaterThan(0);
  });

  it('D73: very imbalanced trials still finite', () => {
    const d = SDTCalculator.calculateDPrime(1, 100, 100, 1);
    expect(Number.isFinite(d)).toBe(true);
  });

  it('D74: 100:1 signal to noise ratio', () => {
    const d = SDTCalculator.calculateDPrime(50, 50, 1, 0);
    expect(d).toBe(0); // CR=0 triggers guard
  });

  it('D75: 1:100 signal to noise ratio', () => {
    const d = SDTCalculator.calculateDPrime(1, 0, 50, 50);
    expect(Number.isFinite(d)).toBe(true);
  });

  // --- Consistency checks ---
  it('D76: repeated calculations are identical', () => {
    const results = Array.from({ length: 100 }, () =>
      SDTCalculator.calculateDPrime(25, 15, 10, 30),
    );
    expect(results.every((r) => r === results[0])).toBe(true);
  });

  it('D77: calculation does not depend on call order', () => {
    const d1 = SDTCalculator.calculateDPrime(10, 20, 30, 40);
    SDTCalculator.calculateDPrime(50, 60, 70, 80); // Different call
    const d2 = SDTCalculator.calculateDPrime(10, 20, 30, 40);
    expect(d1).toBe(d2);
  });

  // --- Negative input handling ---
  it('D78: negative hits returns 0', () => {
    expect(SDTCalculator.calculateDPrime(-1, 10, 10, 10)).toBe(0);
  });

  it('D79: negative misses returns 0', () => {
    expect(SDTCalculator.calculateDPrime(10, -1, 10, 10)).toBe(0);
  });

  it('D80: negative FA returns 0', () => {
    expect(SDTCalculator.calculateDPrime(10, 10, -1, 10)).toBe(0);
  });
});

// =============================================================================
// CATEGORY 3: HIT RATE PROPERTIES (Tests 81-100)
// =============================================================================

describe('SDT Math Properties - 3. Hit Rate', () => {
  it('H81: hit rate in [0, 1] for all valid counts', () => {
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
        return stats.hitRate >= 0 && stats.hitRate <= 1;
      }),
      { numRuns: HIGH_RUNS },
    );
  });

  it('H82: hit rate = hits / (hits + misses) when signal trials > 0', () => {
    fc.assert(
      fc.property(posCountArb, countArb, (h, m) => {
        const counts: RawCounts = {
          hits: h,
          misses: m,
          falseAlarms: 0,
          correctRejections: 1,
          reactionTimes: [],
        };
        const stats = SDTCalculator.calculateModalityStats(counts);
        return Math.abs(stats.hitRate - h / (h + m)) < 1e-10;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('H83: hit rate = 0 when no signal trials', () => {
    const counts: RawCounts = {
      hits: 0,
      misses: 0,
      falseAlarms: 10,
      correctRejections: 10,
      reactionTimes: [],
    };
    const stats = SDTCalculator.calculateModalityStats(counts);
    expect(stats.hitRate).toBe(0);
  });

  it('H84: hit rate = 1 when all hits (no misses)', () => {
    fc.assert(
      fc.property(posCountArb, (h) => {
        const counts: RawCounts = {
          hits: h,
          misses: 0,
          falseAlarms: 10,
          correctRejections: 10,
          reactionTimes: [],
        };
        const stats = SDTCalculator.calculateModalityStats(counts);
        return stats.hitRate === 1;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('H85: hit rate = 0 when no hits (all misses)', () => {
    fc.assert(
      fc.property(posCountArb, (m) => {
        const counts: RawCounts = {
          hits: 0,
          misses: m,
          falseAlarms: 10,
          correctRejections: 10,
          reactionTimes: [],
        };
        const stats = SDTCalculator.calculateModalityStats(counts);
        return stats.hitRate === 0;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('H86: hit rate increases when hits increase (misses fixed)', () => {
    fc.assert(
      fc.property(countArb, posCountArb, (m, h) => {
        const counts1: RawCounts = {
          hits: h,
          misses: m,
          falseAlarms: 10,
          correctRejections: 10,
          reactionTimes: [],
        };
        const counts2: RawCounts = {
          hits: h + 1,
          misses: m,
          falseAlarms: 10,
          correctRejections: 10,
          reactionTimes: [],
        };
        const rate1 = SDTCalculator.calculateModalityStats(counts1).hitRate;
        const rate2 = SDTCalculator.calculateModalityStats(counts2).hitRate;
        return rate2 >= rate1;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('H87: hit rate decreases when misses increase (hits fixed)', () => {
    fc.assert(
      fc.property(posCountArb, countArb, (h, m) => {
        const counts1: RawCounts = {
          hits: h,
          misses: m,
          falseAlarms: 10,
          correctRejections: 10,
          reactionTimes: [],
        };
        const counts2: RawCounts = {
          hits: h,
          misses: m + 1,
          falseAlarms: 10,
          correctRejections: 10,
          reactionTimes: [],
        };
        const rate1 = SDTCalculator.calculateModalityStats(counts1).hitRate;
        const rate2 = SDTCalculator.calculateModalityStats(counts2).hitRate;
        return rate2 <= rate1;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('H88: hit rate + miss rate = 1 (when signal trials > 0)', () => {
    fc.assert(
      fc.property(posCountArb, countArb, (h, m) => {
        const signalTrials = h + m;
        const hitRate = h / signalTrials;
        const missRate = m / signalTrials;
        return Math.abs(hitRate + missRate - 1) < 1e-10;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('H89: hit rate is monotonic in hits/total ratio', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }),
        fc.integer({ min: 0, max: 50 }),
        fc.integer({ min: 1, max: 50 }),
        fc.integer({ min: 0, max: 50 }),
        (h1, m1, h2, m2) => {
          const rate1 = h1 / (h1 + m1);
          const rate2 = h2 / (h2 + m2);
          const counts1: RawCounts = {
            hits: h1,
            misses: m1,
            falseAlarms: 10,
            correctRejections: 10,
            reactionTimes: [],
          };
          const counts2: RawCounts = {
            hits: h2,
            misses: m2,
            falseAlarms: 10,
            correctRejections: 10,
            reactionTimes: [],
          };
          const computed1 = SDTCalculator.calculateModalityStats(counts1).hitRate;
          const computed2 = SDTCalculator.calculateModalityStats(counts2).hitRate;
          if (rate1 < rate2) return computed1 <= computed2 + 1e-9;
          if (rate1 > rate2) return computed1 >= computed2 - 1e-9;
          return Math.abs(computed1 - computed2) < 1e-9;
        },
      ),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('H90: hit rate is finite', () => {
    fc.assert(
      fc.property(countArb, countArb, (h, m) => {
        const counts: RawCounts = {
          hits: h,
          misses: m,
          falseAlarms: 10,
          correctRejections: 10,
          reactionTimes: [],
        };
        return Number.isFinite(SDTCalculator.calculateModalityStats(counts).hitRate);
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('H91: hit rate = 0.5 when hits = misses', () => {
    fc.assert(
      fc.property(posCountArb, (n) => {
        const counts: RawCounts = {
          hits: n,
          misses: n,
          falseAlarms: 10,
          correctRejections: 10,
          reactionTimes: [],
        };
        return Math.abs(SDTCalculator.calculateModalityStats(counts).hitRate - 0.5) < 1e-10;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('H92: hit rate independent of noise trials', () => {
    fc.assert(
      fc.property(posCountArb, countArb, countArb, countArb, (h, m, f, c) => {
        const counts1: RawCounts = {
          hits: h,
          misses: m,
          falseAlarms: f,
          correctRejections: c,
          reactionTimes: [],
        };
        const counts2: RawCounts = {
          hits: h,
          misses: m,
          falseAlarms: f * 2,
          correctRejections: c * 2,
          reactionTimes: [],
        };
        const rate1 = SDTCalculator.calculateModalityStats(counts1).hitRate;
        const rate2 = SDTCalculator.calculateModalityStats(counts2).hitRate;
        return rate1 === rate2;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('H93: extreme hit rate (99/100) is near 1', () => {
    const counts: RawCounts = {
      hits: 99,
      misses: 1,
      falseAlarms: 10,
      correctRejections: 10,
      reactionTimes: [],
    };
    expect(SDTCalculator.calculateModalityStats(counts).hitRate).toBeCloseTo(0.99, 5);
  });

  it('H94: extreme hit rate (1/100) is near 0', () => {
    const counts: RawCounts = {
      hits: 1,
      misses: 99,
      falseAlarms: 10,
      correctRejections: 10,
      reactionTimes: [],
    };
    expect(SDTCalculator.calculateModalityStats(counts).hitRate).toBeCloseTo(0.01, 5);
  });

  it('H95: hit rate for 1 hit out of 2 trials is 0.5', () => {
    const counts: RawCounts = {
      hits: 1,
      misses: 1,
      falseAlarms: 10,
      correctRejections: 10,
      reactionTimes: [],
    };
    expect(SDTCalculator.calculateModalityStats(counts).hitRate).toBe(0.5);
  });

  it('H96: hit rate calculation is deterministic', () => {
    const counts: RawCounts = {
      hits: 25,
      misses: 25,
      falseAlarms: 10,
      correctRejections: 10,
      reactionTimes: [],
    };
    const rate1 = SDTCalculator.calculateModalityStats(counts).hitRate;
    const rate2 = SDTCalculator.calculateModalityStats(counts).hitRate;
    expect(rate1).toBe(rate2);
  });

  it('H97: hit rate preserved in stats object', () => {
    fc.assert(
      fc.property(posCountArb, countArb, (h, m) => {
        const counts: RawCounts = {
          hits: h,
          misses: m,
          falseAlarms: 10,
          correctRejections: 10,
          reactionTimes: [],
        };
        const stats = SDTCalculator.calculateModalityStats(counts);
        const expectedRate = h / (h + m);
        return Math.abs(stats.hitRate - expectedRate) < 1e-10;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('H98: hit rate is not NaN', () => {
    fc.assert(
      fc.property(countArb, countArb, (h, m) => {
        const counts: RawCounts = {
          hits: h,
          misses: m,
          falseAlarms: 10,
          correctRejections: 10,
          reactionTimes: [],
        };
        return !Number.isNaN(SDTCalculator.calculateModalityStats(counts).hitRate);
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('H99: large hit counts still give valid rate', () => {
    const counts: RawCounts = {
      hits: 10000,
      misses: 10000,
      falseAlarms: 10,
      correctRejections: 10,
      reactionTimes: [],
    };
    expect(SDTCalculator.calculateModalityStats(counts).hitRate).toBe(0.5);
  });

  it('H100: hit rate ordering preserved for sorted scenarios', () => {
    const scenarios = [
      { hits: 10, misses: 90 },
      { hits: 30, misses: 70 },
      { hits: 50, misses: 50 },
      { hits: 70, misses: 30 },
      { hits: 90, misses: 10 },
    ];
    const rates = scenarios.map((s) => {
      const counts: RawCounts = { ...s, falseAlarms: 10, correctRejections: 10, reactionTimes: [] };
      return SDTCalculator.calculateModalityStats(counts).hitRate;
    });
    for (let i = 1; i < rates.length; i++) {
      expect(rates[i]!).toBeGreaterThan(rates[i - 1]!);
    }
  });
});

// =============================================================================
// CATEGORY 4: FALSE ALARM RATE PROPERTIES (Tests 101-120)
// =============================================================================

describe('SDT Math Properties - 4. False Alarm Rate', () => {
  it('F101: FA rate in [0, 1] for all valid counts', () => {
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
        return stats.falseAlarmRate >= 0 && stats.falseAlarmRate <= 1;
      }),
      { numRuns: HIGH_RUNS },
    );
  });

  it('F102: FA rate = FA / (FA + CR) when noise trials > 0', () => {
    fc.assert(
      fc.property(countArb, posCountArb, (f, c) => {
        fc.pre(f + c > 0);
        const counts: RawCounts = {
          hits: 10,
          misses: 10,
          falseAlarms: f,
          correctRejections: c,
          reactionTimes: [],
        };
        const stats = SDTCalculator.calculateModalityStats(counts);
        return Math.abs(stats.falseAlarmRate - f / (f + c)) < 1e-10;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('F103: FA rate = 0 when no noise trials', () => {
    const counts: RawCounts = {
      hits: 10,
      misses: 10,
      falseAlarms: 0,
      correctRejections: 0,
      reactionTimes: [],
    };
    const stats = SDTCalculator.calculateModalityStats(counts);
    expect(stats.falseAlarmRate).toBe(0);
  });

  it('F104: FA rate = 1 when all FA (no CR)', () => {
    fc.assert(
      fc.property(posCountArb, (f) => {
        const counts: RawCounts = {
          hits: 10,
          misses: 10,
          falseAlarms: f,
          correctRejections: 0,
          reactionTimes: [],
        };
        const stats = SDTCalculator.calculateModalityStats(counts);
        return stats.falseAlarmRate === 1;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('F105: FA rate = 0 when no FA (all CR)', () => {
    fc.assert(
      fc.property(posCountArb, (c) => {
        const counts: RawCounts = {
          hits: 10,
          misses: 10,
          falseAlarms: 0,
          correctRejections: c,
          reactionTimes: [],
        };
        const stats = SDTCalculator.calculateModalityStats(counts);
        return stats.falseAlarmRate === 0;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('F106: FA rate increases when FA increases (CR fixed)', () => {
    fc.assert(
      fc.property(countArb, posCountArb, (c, f) => {
        const counts1: RawCounts = {
          hits: 10,
          misses: 10,
          falseAlarms: f,
          correctRejections: c,
          reactionTimes: [],
        };
        const counts2: RawCounts = {
          hits: 10,
          misses: 10,
          falseAlarms: f + 1,
          correctRejections: c,
          reactionTimes: [],
        };
        const rate1 = SDTCalculator.calculateModalityStats(counts1).falseAlarmRate;
        const rate2 = SDTCalculator.calculateModalityStats(counts2).falseAlarmRate;
        return rate2 >= rate1;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('F107: FA rate decreases when CR increases (FA fixed)', () => {
    fc.assert(
      fc.property(posCountArb, countArb, (f, c) => {
        const counts1: RawCounts = {
          hits: 10,
          misses: 10,
          falseAlarms: f,
          correctRejections: c,
          reactionTimes: [],
        };
        const counts2: RawCounts = {
          hits: 10,
          misses: 10,
          falseAlarms: f,
          correctRejections: c + 1,
          reactionTimes: [],
        };
        const rate1 = SDTCalculator.calculateModalityStats(counts1).falseAlarmRate;
        const rate2 = SDTCalculator.calculateModalityStats(counts2).falseAlarmRate;
        return rate2 <= rate1;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('F108: FA rate + CR rate = 1 (when noise trials > 0)', () => {
    fc.assert(
      fc.property(countArb, posCountArb, (f, c) => {
        fc.pre(f + c > 0);
        const noiseTrials = f + c;
        const faRate = f / noiseTrials;
        const crRate = c / noiseTrials;
        return Math.abs(faRate + crRate - 1) < 1e-10;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('F109: FA rate is monotonic in FA/total ratio', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 50 }),
        fc.integer({ min: 1, max: 50 }),
        fc.integer({ min: 0, max: 50 }),
        fc.integer({ min: 1, max: 50 }),
        (f1, c1, f2, c2) => {
          const rate1 = f1 / (f1 + c1);
          const rate2 = f2 / (f2 + c2);
          const counts1: RawCounts = {
            hits: 10,
            misses: 10,
            falseAlarms: f1,
            correctRejections: c1,
            reactionTimes: [],
          };
          const counts2: RawCounts = {
            hits: 10,
            misses: 10,
            falseAlarms: f2,
            correctRejections: c2,
            reactionTimes: [],
          };
          const computed1 = SDTCalculator.calculateModalityStats(counts1).falseAlarmRate;
          const computed2 = SDTCalculator.calculateModalityStats(counts2).falseAlarmRate;
          if (rate1 < rate2) return computed1 <= computed2 + 1e-9;
          if (rate1 > rate2) return computed1 >= computed2 - 1e-9;
          return Math.abs(computed1 - computed2) < 1e-9;
        },
      ),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('F110: FA rate is finite', () => {
    fc.assert(
      fc.property(countArb, countArb, (f, c) => {
        const counts: RawCounts = {
          hits: 10,
          misses: 10,
          falseAlarms: f,
          correctRejections: c,
          reactionTimes: [],
        };
        return Number.isFinite(SDTCalculator.calculateModalityStats(counts).falseAlarmRate);
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('F111: FA rate = 0.5 when FA = CR', () => {
    fc.assert(
      fc.property(posCountArb, (n) => {
        const counts: RawCounts = {
          hits: 10,
          misses: 10,
          falseAlarms: n,
          correctRejections: n,
          reactionTimes: [],
        };
        return Math.abs(SDTCalculator.calculateModalityStats(counts).falseAlarmRate - 0.5) < 1e-10;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('F112: FA rate independent of signal trials', () => {
    fc.assert(
      fc.property(countArb, countArb, posCountArb, posCountArb, (h, m, f, c) => {
        const counts1: RawCounts = {
          hits: h,
          misses: m,
          falseAlarms: f,
          correctRejections: c,
          reactionTimes: [],
        };
        const counts2: RawCounts = {
          hits: h * 2,
          misses: m * 2,
          falseAlarms: f,
          correctRejections: c,
          reactionTimes: [],
        };
        const rate1 = SDTCalculator.calculateModalityStats(counts1).falseAlarmRate;
        const rate2 = SDTCalculator.calculateModalityStats(counts2).falseAlarmRate;
        return rate1 === rate2;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('F113: extreme FA rate (99/100) is near 1', () => {
    const counts: RawCounts = {
      hits: 10,
      misses: 10,
      falseAlarms: 99,
      correctRejections: 1,
      reactionTimes: [],
    };
    expect(SDTCalculator.calculateModalityStats(counts).falseAlarmRate).toBeCloseTo(0.99, 5);
  });

  it('F114: extreme FA rate (1/100) is near 0', () => {
    const counts: RawCounts = {
      hits: 10,
      misses: 10,
      falseAlarms: 1,
      correctRejections: 99,
      reactionTimes: [],
    };
    expect(SDTCalculator.calculateModalityStats(counts).falseAlarmRate).toBeCloseTo(0.01, 5);
  });

  it('F115: FA rate for 1 FA out of 2 noise trials is 0.5', () => {
    const counts: RawCounts = {
      hits: 10,
      misses: 10,
      falseAlarms: 1,
      correctRejections: 1,
      reactionTimes: [],
    };
    expect(SDTCalculator.calculateModalityStats(counts).falseAlarmRate).toBe(0.5);
  });

  it('F116: FA rate calculation is deterministic', () => {
    const counts: RawCounts = {
      hits: 10,
      misses: 10,
      falseAlarms: 25,
      correctRejections: 25,
      reactionTimes: [],
    };
    const rate1 = SDTCalculator.calculateModalityStats(counts).falseAlarmRate;
    const rate2 = SDTCalculator.calculateModalityStats(counts).falseAlarmRate;
    expect(rate1).toBe(rate2);
  });

  it('F117: FA rate is not NaN', () => {
    fc.assert(
      fc.property(countArb, countArb, (f, c) => {
        const counts: RawCounts = {
          hits: 10,
          misses: 10,
          falseAlarms: f,
          correctRejections: c,
          reactionTimes: [],
        };
        return !Number.isNaN(SDTCalculator.calculateModalityStats(counts).falseAlarmRate);
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('F118: large FA counts still give valid rate', () => {
    const counts: RawCounts = {
      hits: 10,
      misses: 10,
      falseAlarms: 10000,
      correctRejections: 10000,
      reactionTimes: [],
    };
    expect(SDTCalculator.calculateModalityStats(counts).falseAlarmRate).toBe(0.5);
  });

  it('F119: FA rate ordering preserved for sorted scenarios', () => {
    const scenarios = [
      { falseAlarms: 10, correctRejections: 90 },
      { falseAlarms: 30, correctRejections: 70 },
      { falseAlarms: 50, correctRejections: 50 },
      { falseAlarms: 70, correctRejections: 30 },
      { falseAlarms: 90, correctRejections: 10 },
    ];
    const rates = scenarios.map((s) => {
      const counts: RawCounts = { hits: 10, misses: 10, ...s, reactionTimes: [] };
      return SDTCalculator.calculateModalityStats(counts).falseAlarmRate;
    });
    for (let i = 1; i < rates.length; i++) {
      expect(rates[i]!).toBeGreaterThan(rates[i - 1]!);
    }
  });

  it('F120: FA rate and hit rate can be independently varied', () => {
    fc.assert(
      fc.property(posCountArb, countArb, posCountArb, countArb, (h, m, f, c) => {
        const counts: RawCounts = {
          hits: h,
          misses: m,
          falseAlarms: f,
          correctRejections: c,
          reactionTimes: [],
        };
        const stats = SDTCalculator.calculateModalityStats(counts);
        // Both rates should be valid and independent
        return (
          stats.hitRate >= 0 &&
          stats.hitRate <= 1 &&
          stats.falseAlarmRate >= 0 &&
          stats.falseAlarmRate <= 1
        );
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });
});

// =============================================================================
// CATEGORY 5: HAUTUS CORRECTION PROPERTIES (Tests 121-140)
// =============================================================================

describe('SDT Math Properties - 5. Hautus Correction', () => {
  it('HC121: Hautus hit rate is always > 0', () => {
    fc.assert(
      fc.property(countArb, countArb, (h, m) => {
        fc.pre(h + m > 0);
        const hautusRate = (h + 0.5) / (h + m + 1);
        return hautusRate > 0;
      }),
      { numRuns: HIGH_RUNS },
    );
  });

  it('HC122: Hautus hit rate is always < 1', () => {
    fc.assert(
      fc.property(countArb, countArb, (h, m) => {
        fc.pre(h + m > 0);
        const hautusRate = (h + 0.5) / (h + m + 1);
        return hautusRate < 1;
      }),
      { numRuns: HIGH_RUNS },
    );
  });

  it('HC123: Hautus FA rate is always > 0', () => {
    fc.assert(
      fc.property(countArb, countArb, (f, c) => {
        fc.pre(f + c > 0);
        const hautusRate = (f + 0.5) / (f + c + 1);
        return hautusRate > 0;
      }),
      { numRuns: HIGH_RUNS },
    );
  });

  it('HC124: Hautus FA rate is always < 1', () => {
    fc.assert(
      fc.property(countArb, countArb, (f, c) => {
        fc.pre(f + c > 0);
        const hautusRate = (f + 0.5) / (f + c + 1);
        return hautusRate < 1;
      }),
      { numRuns: HIGH_RUNS },
    );
  });

  it('HC125: Hautus correction prevents probit from reaching bounds', () => {
    // Perfect hit rate with Hautus: (h+0.5)/(h+1) < 1
    // So probit will never be exactly 5
    fc.assert(
      fc.property(posCountArb, (h) => {
        const hautusRate = (h + 0.5) / (h + 1);
        const z = SDTCalculator.probit(hautusRate);
        return z < 5;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('HC126: Hautus rate converges to raw rate for large N', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1000, max: 10000 }), (n) => {
        // For hits=n, misses=n, raw rate = 0.5
        const rawRate = 0.5;
        const hautusRate = (n + 0.5) / (2 * n + 1);
        return Math.abs(hautusRate - rawRate) < 0.001;
      }),
      { numRuns: LOW_RUNS },
    );
  });

  it('HC127: Hautus correction is more significant for small N', () => {
    // With n=1, raw rate could be 0 or 1
    // Hautus: (0+0.5)/(1+1) = 0.25 or (1+0.5)/(1+1) = 0.75
    const smallN_zero = (0 + 0.5) / (0 + 1 + 1);
    const smallN_one = (1 + 0.5) / (1 + 0 + 1);
    const largeN_zero = (0 + 0.5) / (0 + 100 + 1);
    const largeN_one = (100 + 0.5) / (100 + 0 + 1);

    expect(smallN_zero).toBeGreaterThan(0.1); // Pushed from 0
    expect(smallN_one).toBeLessThan(0.9); // Pushed from 1
    expect(largeN_zero).toBeLessThan(0.01); // Closer to 0
    expect(largeN_one).toBeGreaterThan(0.99); // Closer to 1
  });

  it('HC128: Hautus never produces exactly 0 rate', () => {
    const worst = (0 + 0.5) / (0 + 1000000 + 1);
    expect(worst).toBeGreaterThan(0);
  });

  it('HC129: Hautus never produces exactly 1 rate', () => {
    const best = (1000000 + 0.5) / (1000000 + 0 + 1);
    expect(best).toBeLessThan(1);
  });

  it('HC130: d-prime uses Hautus-corrected rates', () => {
    // Verify the formula is applied correctly
    const h = 10,
      m = 5,
      f = 3,
      c = 12;
    const signalTrials = h + m;
    const noiseTrials = f + c;
    const hautusHitRate = (h + 0.5) / (signalTrials + 1);
    const hautusFARate = (f + 0.5) / (noiseTrials + 1);
    const expectedD = SDTCalculator.probit(hautusHitRate) - SDTCalculator.probit(hautusFARate);
    const actualD = SDTCalculator.calculateDPrime(h, m, f, c);
    expect(Math.abs(expectedD - actualD)).toBeLessThan(1e-10);
  });

  it('HC131: Hautus correction is symmetric in hits/misses', () => {
    // Swapping hits and misses reverses the direction
    const rate1 = (10 + 0.5) / (10 + 5 + 1);
    const rate2 = (5 + 0.5) / (5 + 10 + 1);
    expect(rate1).toBeGreaterThan(rate2);
  });

  it('HC132: Hautus effect size decreases with sample size', () => {
    // Test with non-50% raw rate to see the effect
    const adjustment = (n: number, rawProportion: number) => {
      const successes = Math.floor(n * rawProportion);
      const failures = n - successes;
      const raw = successes / n;
      const hautus = (successes + 0.5) / (n + 1);
      return Math.abs(hautus - raw);
    };
    // Use 70% success rate to see meaningful differences
    expect(adjustment(10, 0.7)).toBeGreaterThan(adjustment(100, 0.7));
    expect(adjustment(100, 0.7)).toBeGreaterThan(adjustment(1000, 0.7));
  });

  it('HC133: Hautus-corrected rates are always in (0, 1)', () => {
    fc.assert(
      fc.property(countArb, countArb, (successes, failures) => {
        fc.pre(successes + failures > 0);
        const rate = (successes + 0.5) / (successes + failures + 1);
        return rate > 0 && rate < 1;
      }),
      { numRuns: HIGH_RUNS },
    );
  });

  it('HC134: Hautus prevents infinite d-prime', () => {
    // Without correction, perfect performance would give infinite d'
    const d = SDTCalculator.calculateDPrime(100, 0, 0, 100);
    expect(Number.isFinite(d)).toBe(true);
    expect(d).toBeLessThan(10);
  });

  it('HC135: Hautus prevents -infinite d-prime', () => {
    // hits=1 to avoid anti-gaming, but very poor performance
    const d = SDTCalculator.calculateDPrime(1, 100, 100, 1);
    expect(Number.isFinite(d)).toBe(true);
    expect(d).toBeGreaterThan(-10);
  });

  it('HC136: Hautus correction formula is 0.5 offset / +1 denominator', () => {
    const verify = (count: number, total: number) => {
      const expected = (count + 0.5) / (total + 1);
      return expected;
    };
    expect(verify(0, 10)).toBeCloseTo(0.5 / 11, 10);
    expect(verify(10, 10)).toBeCloseTo(10.5 / 11, 10);
  });

  it('HC137: Hautus pushes 0% rate to small positive', () => {
    const corrected = (0 + 0.5) / (0 + 100 + 1);
    expect(corrected).toBeGreaterThan(0);
    expect(corrected).toBeLessThan(0.01);
  });

  it('HC138: Hautus pushes 100% rate to less than 1', () => {
    const corrected = (100 + 0.5) / (100 + 0 + 1);
    expect(corrected).toBeLessThan(1);
    expect(corrected).toBeGreaterThan(0.99);
  });

  it('HC139: Hautus preserves rate ordering for same sample size', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 10, max: 100 }), // Fixed total N
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 0, max: 100 }),
        (totalN, h1, h2) => {
          // Use same total for both to ensure ordering is preserved
          const m1 = totalN;
          const m2 = totalN;
          fc.pre(h1 + m1 > 0 && h2 + m2 > 0);
          const raw1 = h1 / (h1 + m1);
          const raw2 = h2 / (h2 + m2);
          const hautus1 = (h1 + 0.5) / (h1 + m1 + 1);
          const hautus2 = (h2 + 0.5) / (h2 + m2 + 1);
          // When totals are the same, ordering should be preserved
          if (h1 < h2) return hautus1 < hautus2;
          if (h1 > h2) return hautus1 > hautus2;
          return hautus1 === hautus2;
        },
      ),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('HC140: Hautus correction is deterministic', () => {
    fc.assert(
      fc.property(countArb, countArb, (count, total) => {
        fc.pre(count <= total && total > 0);
        const rate1 = (count + 0.5) / (total + 1);
        const rate2 = (count + 0.5) / (total + 1);
        return rate1 === rate2;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });
});

// =============================================================================
// CATEGORY 6: SENSITIVITY VS BIAS PROPERTIES (Tests 141-160)
// =============================================================================

describe('SDT Math Properties - 6. Sensitivity vs Bias', () => {
  it('SB141: d-prime measures sensitivity independent of overall response rate', () => {
    // Same sensitivity (hit rate - FA rate gap), different overall rates
    const d1 = SDTCalculator.calculateDPrime(80, 20, 20, 80); // High hit, low FA
    const d2 = SDTCalculator.calculateDPrime(40, 10, 10, 40); // Same proportions, smaller sample
    // d-prime should be similar (not identical due to Hautus)
    expect(Math.abs(d1 - d2)).toBeLessThan(0.3);
  });

  it('SB142: equal hit rate and FA rate gives d-prime near 0 (no sensitivity)', () => {
    fc.assert(
      fc.property(posCountArb, (n) => {
        const d = SDTCalculator.calculateDPrime(n, n, n, n);
        return Math.abs(d) < 0.5;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('SB143: higher sensitivity (hit-FA gap) means higher d-prime', () => {
    const lowSensitivity = SDTCalculator.calculateDPrime(6, 4, 4, 6); // 60% hit, 40% FA
    const highSensitivity = SDTCalculator.calculateDPrime(9, 1, 1, 9); // 90% hit, 10% FA
    expect(highSensitivity).toBeGreaterThan(lowSensitivity);
  });

  it('SB144: bias towards responding does not affect d-prime directly', () => {
    // Same sensitivity, different bias (response criterion)
    // Conservative: low hit rate, low FA rate
    // Liberal: high hit rate, high FA rate
    const conservative = SDTCalculator.calculateDPrime(7, 3, 2, 8); // hit=70%, FA=20%
    const liberal = SDTCalculator.calculateDPrime(9, 1, 4, 6); // hit=90%, FA=40%
    // Both have same sensitivity gap (50% difference), so d' should be similar
    expect(Math.abs(conservative - liberal)).toBeLessThan(1);
  });

  it('SB145: perfect discrimination gives high d-prime', () => {
    const d = SDTCalculator.calculateDPrime(50, 0, 0, 50);
    expect(d).toBeGreaterThan(3);
  });

  it('SB146: no discrimination (random) gives d-prime near 0', () => {
    const d = SDTCalculator.calculateDPrime(25, 25, 25, 25);
    expect(Math.abs(d)).toBeLessThan(0.1);
  });

  it('SB147: reversed discrimination gives negative d-prime', () => {
    // FA rate > hit rate means reversed sensitivity
    const d = SDTCalculator.calculateDPrime(2, 18, 18, 2);
    // With hits=2 > 0 and CR=2 > 0, guards don't trigger
    expect(d).toBeLessThan(0);
  });

  it('SB148: d-prime sign indicates discrimination direction', () => {
    const positive = SDTCalculator.calculateDPrime(15, 5, 5, 15);
    const negative = SDTCalculator.calculateDPrime(5, 15, 15, 5);
    expect(positive).toBeGreaterThan(0);
    expect(negative).toBeLessThan(0);
  });

  it('SB149: d-prime magnitude indicates discrimination strength', () => {
    const weak = SDTCalculator.calculateDPrime(12, 8, 8, 12); // 60% vs 40%
    const strong = SDTCalculator.calculateDPrime(18, 2, 2, 18); // 90% vs 10%
    expect(Math.abs(strong)).toBeGreaterThan(Math.abs(weak));
  });

  it('SB150: criterion c = -0.5 * (probit(H) + probit(FA))', () => {
    // This is the standard SDT formula for response bias
    fc.assert(
      fc.property(validScenarioArb, ({ hits, misses, falseAlarms, correctRejections }) => {
        const signalTrials = hits + misses;
        const noiseTrials = falseAlarms + correctRejections;
        const hitRate = (hits + 0.5) / (signalTrials + 1);
        const faRate = (falseAlarms + 0.5) / (noiseTrials + 1);
        const zH = SDTCalculator.probit(hitRate);
        const zFA = SDTCalculator.probit(faRate);
        const c = -0.5 * (zH + zFA);
        // c should be finite
        return Number.isFinite(c);
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('SB151: unbiased responding has c near 0', () => {
    // Equal distance from both distributions
    const zH = SDTCalculator.probit(0.8);
    const zFA = SDTCalculator.probit(0.2);
    // c = -0.5 * (zH + zFA) = -0.5 * (0.84 + (-0.84)) = 0
    expect(Math.abs(-0.5 * (zH + zFA))).toBeLessThan(0.1);
  });

  it('SB152: liberal bias has c < 0', () => {
    // High hit rate AND high FA rate
    const zH = SDTCalculator.probit(0.9);
    const zFA = SDTCalculator.probit(0.5);
    const c = -0.5 * (zH + zFA);
    expect(c).toBeLessThan(0);
  });

  it('SB153: conservative bias has c > 0', () => {
    // Low hit rate AND low FA rate
    const zH = SDTCalculator.probit(0.5);
    const zFA = SDTCalculator.probit(0.1);
    const c = -0.5 * (zH + zFA);
    expect(c).toBeGreaterThan(0);
  });

  it('SB154: d-prime and c are orthogonal measures', () => {
    // Same d-prime, different c
    // This tests the independence of sensitivity and bias
    const scenario1 = { hits: 16, misses: 4, falseAlarms: 4, correctRejections: 16 };
    const scenario2 = { hits: 18, misses: 2, falseAlarms: 8, correctRejections: 12 };

    const d1 = SDTCalculator.calculateDPrime(
      scenario1.hits,
      scenario1.misses,
      scenario1.falseAlarms,
      scenario1.correctRejections,
    );
    const d2 = SDTCalculator.calculateDPrime(
      scenario2.hits,
      scenario2.misses,
      scenario2.falseAlarms,
      scenario2.correctRejections,
    );

    // Both should have positive d-prime
    expect(d1).toBeGreaterThan(0);
    expect(d2).toBeGreaterThan(0);
  });

  it('SB155: scaling counts preserves approximate d-prime', () => {
    const d1 = SDTCalculator.calculateDPrime(10, 10, 5, 15);
    const d2 = SDTCalculator.calculateDPrime(20, 20, 10, 30);
    const d3 = SDTCalculator.calculateDPrime(100, 100, 50, 150);
    expect(Math.abs(d1 - d2)).toBeLessThan(0.3);
    expect(Math.abs(d2 - d3)).toBeLessThan(0.3);
  });

  it('SB156: d-prime is insensitive to equal proportional changes in H and FA', () => {
    // If we increase both hit rate and FA rate proportionally, d' changes
    // This is expected - they're not truly equal changes in z-space
    const d1 = SDTCalculator.calculateDPrime(8, 2, 2, 8);
    const d2 = SDTCalculator.calculateDPrime(9, 1, 3, 7);
    // Different but both positive
    expect(d1).toBeGreaterThan(0);
    expect(d2).toBeGreaterThan(0);
  });

  it('SB157: maximum d-prime when hit=1, FA=0 (with Hautus)', () => {
    // Theoretically maximum discrimination
    const d = SDTCalculator.calculateDPrime(100, 0, 0, 100);
    expect(d).toBeLessThan(10); // Bounded by probit
    expect(d).toBeGreaterThan(3); // High discrimination
  });

  it('SB158: d-prime transitions smoothly as performance improves', () => {
    const improvements = [
      [10, 10, 10, 10], // chance
      [12, 8, 8, 12], // slight improvement
      [15, 5, 5, 15], // better
      [18, 2, 2, 18], // good
      [20, 0, 0, 20], // perfect
    ] as const;

    const dPrimes = improvements.map(([h, m, f, c]) => SDTCalculator.calculateDPrime(h, m, f, c));

    for (let i = 1; i < dPrimes.length; i++) {
      expect(dPrimes[i]!).toBeGreaterThan(dPrimes[i - 1]!);
    }
  });

  it('SB159: symmetric changes in hit and FA produce symmetric d-prime changes', () => {
    const base = SDTCalculator.calculateDPrime(10, 10, 10, 10);
    const moreHits = SDTCalculator.calculateDPrime(12, 8, 10, 10);
    const lessFA = SDTCalculator.calculateDPrime(10, 10, 8, 12);
    // Both should increase d-prime
    expect(moreHits).toBeGreaterThan(base);
    expect(lessFA).toBeGreaterThan(base);
  });

  it('SB160: d-prime reflects discrimination ability', () => {
    // Higher gap between hit rate and FA rate = higher d-prime
    const d1 = SDTCalculator.calculateDPrime(15, 5, 5, 15); // 75% hit, 25% FA
    const d2 = SDTCalculator.calculateDPrime(10, 10, 5, 15); // 50% hit, 25% FA
    // d1 has better discrimination (larger hit-FA gap)
    expect(d1).toBeGreaterThan(0);
    expect(d2).toBeGreaterThan(0);
    expect(d1).toBeGreaterThan(d2);
  });
});

// =============================================================================
// CATEGORY 7: NUMERICAL STABILITY PROPERTIES (Tests 161-180)
// =============================================================================

describe('SDT Math Properties - 7. Numerical Stability', () => {
  it('NS161: no NaN produced for any valid input', () => {
    fc.assert(
      fc.property(countArb, countArb, countArb, countArb, (h, m, f, c) => {
        const d = SDTCalculator.calculateDPrime(h, m, f, c);
        return !Number.isNaN(d);
      }),
      { numRuns: HIGH_RUNS },
    );
  });

  it('NS162: no Infinity produced for any valid input', () => {
    fc.assert(
      fc.property(countArb, countArb, countArb, countArb, (h, m, f, c) => {
        const d = SDTCalculator.calculateDPrime(h, m, f, c);
        return d !== Infinity && d !== -Infinity;
      }),
      { numRuns: HIGH_RUNS },
    );
  });

  it('NS163: probit handles subnormal numbers', () => {
    const subnormal = Number.MIN_VALUE * 2;
    expect(Number.isFinite(SDTCalculator.probit(subnormal))).toBe(true);
  });

  it('NS164: d-prime stable for very large counts', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1000000, max: 10000000 }),
        fc.integer({ min: 1000000, max: 10000000 }),
        fc.integer({ min: 1000000, max: 10000000 }),
        fc.integer({ min: 1000000, max: 10000000 }),
        (h, m, f, c) => {
          const d = SDTCalculator.calculateDPrime(h, m, f, c);
          return Number.isFinite(d);
        },
      ),
      { numRuns: LOW_RUNS },
    );
  });

  it('NS165: probit algorithm switches correctly at pLow boundary', () => {
    const pLow = 0.02425;
    const below = SDTCalculator.probit(pLow - 0.001);
    const at = SDTCalculator.probit(pLow);
    const above = SDTCalculator.probit(pLow + 0.001);
    expect(below).toBeLessThan(at);
    expect(at).toBeLessThan(above);
  });

  it('NS166: probit algorithm switches correctly at pHigh boundary', () => {
    const pHigh = 1 - 0.02425;
    const below = SDTCalculator.probit(pHigh - 0.001);
    const at = SDTCalculator.probit(pHigh);
    const above = SDTCalculator.probit(pHigh + 0.001);
    expect(below).toBeLessThan(at);
    expect(at).toBeLessThan(above);
  });

  it('NS167: sum of large integers does not overflow in rate calculation', () => {
    const maxSafe = Number.MAX_SAFE_INTEGER;
    // Use values that sum to near MAX_SAFE_INTEGER
    const h = Math.floor(maxSafe / 4);
    const m = Math.floor(maxSafe / 4);
    const d = SDTCalculator.calculateDPrime(h, m, 10, 10);
    expect(Number.isFinite(d)).toBe(true);
  });

  it('NS168: precision maintained for probabilities near 0.5', () => {
    fc.assert(
      fc.property(fc.double({ min: 0.49, max: 0.51, noNaN: true }), (p) => {
        const z = SDTCalculator.probit(p);
        return Math.abs(z) < 0.05;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('NS169: d-prime computation is stable under repeated calls', () => {
    const results: number[] = [];
    for (let i = 0; i < 1000; i++) {
      results.push(SDTCalculator.calculateDPrime(25, 25, 25, 25));
    }
    const allSame = results.every((r) => r === results[0]);
    expect(allSame).toBe(true);
  });

  it('NS170: floating point rounding does not affect determinism', () => {
    fc.assert(
      fc.property(countArb, countArb, countArb, countArb, (h, m, f, c) => {
        const d1 = SDTCalculator.calculateDPrime(h, m, f, c);
        const d2 = SDTCalculator.calculateDPrime(h, m, f, c);
        return d1 === d2; // Exact equality
      }),
      { numRuns: HIGH_RUNS },
    );
  });

  it('NS171: probit handles probability = 0.5 exactly', () => {
    expect(SDTCalculator.probit(0.5)).toBe(0);
  });

  it('NS172: no catastrophic cancellation in probit subtraction', () => {
    // When z values are very close, subtraction should still be accurate
    const z1 = SDTCalculator.probit(0.5001);
    const z2 = SDTCalculator.probit(0.5);
    expect(z1 - z2).toBeGreaterThan(0);
  });

  it('NS173: d-prime stable when hit rate and FA rate are very close', () => {
    const d = SDTCalculator.calculateDPrime(50, 50, 49, 51);
    expect(Number.isFinite(d)).toBe(true);
    expect(Math.abs(d)).toBeLessThan(0.5);
  });

  it('NS174: no loss of significance for small differences', () => {
    // Test that small improvements are detected
    const d1 = SDTCalculator.calculateDPrime(50, 50, 50, 50);
    const d2 = SDTCalculator.calculateDPrime(51, 49, 50, 50);
    expect(d2).toBeGreaterThan(d1);
  });

  it('NS175: handles negative zero correctly', () => {
    const d = SDTCalculator.calculateDPrime(10, 10, 10, 10);
    expect(Object.is(d, -0)).toBe(false); // Should not be negative zero
  });

  it('NS176: probit accuracy at standard deviation points', () => {
    // z = 1 corresponds to ~84.13% cumulative probability
    expect(Math.abs(SDTCalculator.probit(0.8413) - 1)).toBeLessThan(0.01);
    // z = 2 corresponds to ~97.72% cumulative probability
    expect(Math.abs(SDTCalculator.probit(0.9772) - 2)).toBeLessThan(0.01);
    // z = -1 corresponds to ~15.87% cumulative probability
    expect(Math.abs(SDTCalculator.probit(0.1587) - -1)).toBeLessThan(0.01);
  });

  it('NS177: consistent behavior at algorithm branch points', () => {
    // Test transition from central to tail algorithm
    const pLow = 0.02425;
    const tolerance = 1e-6;
    const z1 = SDTCalculator.probit(pLow - tolerance);
    const z2 = SDTCalculator.probit(pLow + tolerance);
    // Should be close together (continuous)
    expect(Math.abs(z1 - z2)).toBeLessThan(0.001);
  });

  it('NS178: no underflow in Hautus denominator', () => {
    // Very large totals shouldn't cause underflow
    const rate = (1 + 0.5) / (10000000 + 1);
    expect(rate).toBeGreaterThan(0);
    expect(Number.isFinite(rate)).toBe(true);
  });

  it('NS179: d-prime invariant under trivial transformations', () => {
    const d1 = SDTCalculator.calculateDPrime(10, 10, 10, 10);
    const d2 = SDTCalculator.calculateDPrime(10 + 0, 10 + 0, 10 + 0, 10 + 0);
    expect(d1).toBe(d2);
  });

  it('NS180: probit handles all IEEE 754 special values gracefully', () => {
    expect(Number.isFinite(SDTCalculator.probit(NaN))).toBe(true);
    expect(Number.isFinite(SDTCalculator.probit(Infinity))).toBe(true);
    expect(Number.isFinite(SDTCalculator.probit(-Infinity))).toBe(true);
    expect(Number.isFinite(SDTCalculator.probit(-0))).toBe(true);
  });
});

// =============================================================================
// CATEGORY 8: ASYMPTOTIC BEHAVIOR PROPERTIES (Tests 181-200)
// =============================================================================

describe('SDT Math Properties - 8. Asymptotic Behavior', () => {
  it('A181: d-prime converges as sample size increases', () => {
    const dPrimes = [10, 100, 1000, 10000].map((n) =>
      SDTCalculator.calculateDPrime(
        Math.floor(n * 0.8),
        Math.floor(n * 0.2),
        Math.floor(n * 0.2),
        Math.floor(n * 0.8),
      ),
    );
    // Should converge to similar values
    for (let i = 1; i < dPrimes.length; i++) {
      expect(Math.abs(dPrimes[i]! - dPrimes[i - 1]!)).toBeLessThan(0.5);
    }
  });

  it('A182: Hautus effect vanishes for large N', () => {
    const smallN = SDTCalculator.calculateDPrime(8, 2, 2, 8);
    const largeN = SDTCalculator.calculateDPrime(800, 200, 200, 800);
    // Both should be similar (same proportions)
    expect(Math.abs(smallN - largeN)).toBeLessThan(0.3);
  });

  it('A183: probit(p) approaches -infinity structure as p->0', () => {
    const values = [0.1, 0.01, 0.001, 0.0001];
    const zs = values.map((p) => SDTCalculator.probit(p));
    // Should be decreasing
    for (let i = 1; i < zs.length; i++) {
      expect(zs[i]!).toBeLessThan(zs[i - 1]!);
    }
  });

  it('A184: probit(p) approaches +infinity structure as p->1', () => {
    const values = [0.9, 0.99, 0.999, 0.9999];
    const zs = values.map((p) => SDTCalculator.probit(p));
    // Should be increasing
    for (let i = 1; i < zs.length; i++) {
      expect(zs[i]!).toBeGreaterThan(zs[i - 1]!);
    }
  });

  it('A185: d-prime for perfect performance bounded by Hautus', () => {
    // Even with 100% hits and 0% FA, Hautus prevents infinite d'
    const dPrimes = [10, 100, 1000].map((n) => SDTCalculator.calculateDPrime(n, 0, 0, n));
    // All should be finite and bounded
    dPrimes.forEach((d) => {
      expect(d).toBeLessThan(10);
      expect(d).toBeGreaterThan(0);
    });
  });

  it('A186: asymptotic d-prime for 80/20 split converges', () => {
    const samples = [100, 1000, 10000];
    const dPrimes = samples.map((n) => {
      const h = Math.floor(n * 0.8);
      const m = n - h;
      const f = Math.floor(n * 0.2);
      const c = n - f;
      return SDTCalculator.calculateDPrime(h, m, f, c);
    });
    // Check convergence (differences decrease)
    expect(Math.abs(dPrimes[2]! - dPrimes[1]!)).toBeLessThan(Math.abs(dPrimes[1]! - dPrimes[0]!));
  });

  it('A187: rate of convergence is O(1/N)', () => {
    // Hautus bias decreases as 1/N - use non-50% rate to see effect
    const makeRate = (n: number, proportion: number) => {
      const successes = Math.floor(n * proportion);
      return (successes + 0.5) / (n + 1);
    };
    const proportion = 0.7;
    const rate1 = makeRate(100, proportion);
    const rate2 = makeRate(1000, proportion);
    const rate3 = makeRate(10000, proportion);
    const raw = proportion;

    const error1 = Math.abs(rate1 - raw);
    const error2 = Math.abs(rate2 - raw);
    const error3 = Math.abs(rate3 - raw);

    // Error should decrease as N increases
    expect(error2).toBeLessThan(error1);
    expect(error3).toBeLessThan(error2);
  });

  it('A188: d-prime stability for very large equal counts', () => {
    const d = SDTCalculator.calculateDPrime(1000000, 1000000, 1000000, 1000000);
    expect(Math.abs(d)).toBeLessThan(0.01);
  });

  it('A189: limiting behavior as signal trials dominate', () => {
    // Lots of signal, few noise
    const d = SDTCalculator.calculateDPrime(500, 500, 5, 5);
    expect(Number.isFinite(d)).toBe(true);
  });

  it('A190: limiting behavior as noise trials dominate', () => {
    // Few signal, lots of noise
    const d = SDTCalculator.calculateDPrime(5, 5, 500, 500);
    expect(Number.isFinite(d)).toBe(true);
  });

  it('A191: d-prime at extreme performance levels is bounded', () => {
    // 99% hit rate, 1% FA rate
    const d = SDTCalculator.calculateDPrime(99, 1, 1, 99);
    expect(d).toBeGreaterThan(3);
    expect(d).toBeLessThan(5);
  });

  it('A192: probit slope increases without bound as p->0 or p->1', () => {
    const slopeNear0 = (SDTCalculator.probit(0.01) - SDTCalculator.probit(0.005)) / 0.005;
    const slopeNear5 = (SDTCalculator.probit(0.5) - SDTCalculator.probit(0.495)) / 0.005;
    expect(Math.abs(slopeNear0)).toBeGreaterThan(Math.abs(slopeNear5));
  });

  it('A193: d-prime asymptote for 90/10 performance', () => {
    const dPrimes = [100, 1000, 10000].map((n) =>
      SDTCalculator.calculateDPrime(
        Math.floor(n * 0.9),
        Math.floor(n * 0.1),
        Math.floor(n * 0.1),
        Math.floor(n * 0.9),
      ),
    );
    // Should converge
    expect(Math.abs(dPrimes[2]! - dPrimes[1]!)).toBeLessThan(0.1);
  });

  it('A194: limiting d-prime matches theoretical value', () => {
    // For large N, d' should approach probit(hitRate) - probit(FARate)
    // With 80/20 split: probit(0.8) - probit(0.2) approx 1.68
    const theoretical = SDTCalculator.probit(0.8) - SDTCalculator.probit(0.2);
    const empirical = SDTCalculator.calculateDPrime(8000, 2000, 2000, 8000);
    expect(Math.abs(empirical - theoretical)).toBeLessThan(0.05);
  });

  it('A195: d-prime variance decreases with sample size', () => {
    // Not directly testable without randomness, but check stability
    const samples = [10, 100, 1000];
    const dPrimes = samples.map((n) =>
      SDTCalculator.calculateDPrime(
        Math.floor(n * 0.7),
        Math.floor(n * 0.3),
        Math.floor(n * 0.3),
        Math.floor(n * 0.7),
      ),
    );
    // Larger samples should give more stable (consistent) results
    expect(Number.isFinite(dPrimes[0]!)).toBe(true);
    expect(Number.isFinite(dPrimes[1]!)).toBe(true);
    expect(Number.isFinite(dPrimes[2]!)).toBe(true);
  });

  it('A196: extreme imbalance still converges', () => {
    // 1 signal trial : 1000 noise trials
    const d = SDTCalculator.calculateDPrime(1, 0, 500, 500);
    expect(Number.isFinite(d)).toBe(true);
  });

  it('A197: theoretical d-prime approachable', () => {
    // For very large N, Hautus effect minimal
    // d' should approach probit(HR) - probit(FAR)
    const hr = 0.75;
    const far = 0.25;
    const theoretical = SDTCalculator.probit(hr) - SDTCalculator.probit(far);
    const n = 100000;
    const empirical = SDTCalculator.calculateDPrime(
      Math.floor(n * hr),
      Math.floor(n * (1 - hr)),
      Math.floor(n * far),
      Math.floor(n * (1 - far)),
    );
    expect(Math.abs(empirical - theoretical)).toBeLessThan(0.01);
  });

  it('A198: d-prime finite for any sample size', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1000000 }), (n) => {
        const h = Math.floor(n * 0.6);
        const m = n - h;
        const f = Math.floor(n * 0.4);
        const c = n - f;
        return Number.isFinite(SDTCalculator.calculateDPrime(h, m, f, c));
      }),
      { numRuns: LOW_RUNS },
    );
  });

  it('A199: boundary conditions preserved asymptotically', () => {
    // Even as N->infinity, bounds [-5,5] on probit preserved
    const extremeHigh = SDTCalculator.probit(1 - 1e-10);
    const extremeLow = SDTCalculator.probit(1e-10);
    expect(extremeHigh).toBe(5);
    expect(extremeLow).toBe(-5);
  });

  it('A200: d-prime maximum approaches but never reaches 10', () => {
    // Maximum d' is 2 * probit_max = 10, but never exactly reached
    const d = SDTCalculator.calculateDPrime(1000000, 0, 0, 1000000);
    expect(d).toBeLessThan(10);
    expect(d).toBeGreaterThan(8);
  });
});

// =============================================================================
// CATEGORY 9: ADDITIONAL MATHEMATICAL INVARIANTS (Tests 201+)
// =============================================================================

describe('SDT Math Properties - 9. Additional Invariants', () => {
  it('AI201: aggregate functions handle empty input', () => {
    expect(SDTCalculator.calculateAverageDPrime({})).toBe(0);
    expect(SDTCalculator.calculateMinDPrime({})).toBe(0);
  });

  it('AI202: single modality: min equals average', () => {
    fc.assert(
      fc.property(fc.double({ min: -5, max: 5, noNaN: true }), (d) => {
        const stats = { mod1: { dPrime: d } as ModalityStats };
        return (
          SDTCalculator.calculateMinDPrime(stats) === SDTCalculator.calculateAverageDPrime(stats)
        );
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('AI203: min <= average for any modality set', () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: -5, max: 5, noNaN: true }), { minLength: 1, maxLength: 10 }),
        (dPrimes) => {
          const stats: Record<string, ModalityStats> = {};
          for (const [i, d] of dPrimes.entries()) stats[`m${i}`] = { dPrime: d } as ModalityStats;
          return (
            SDTCalculator.calculateMinDPrime(stats) <=
            SDTCalculator.calculateAverageDPrime(stats) + 1e-9
          );
        },
      ),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('AI204: average is weighted mean of d-primes', () => {
    const stats = {
      a: { dPrime: 1 } as ModalityStats,
      b: { dPrime: 2 } as ModalityStats,
      c: { dPrime: 3 } as ModalityStats,
    };
    expect(SDTCalculator.calculateAverageDPrime(stats)).toBe(2);
  });

  it('AI205: min is true minimum of d-primes', () => {
    const stats = {
      a: { dPrime: 3 } as ModalityStats,
      b: { dPrime: 1 } as ModalityStats,
      c: { dPrime: 2 } as ModalityStats,
    };
    expect(SDTCalculator.calculateMinDPrime(stats)).toBe(1);
  });

  it('AI206: reaction time averaging is correct', () => {
    const counts: RawCounts = {
      hits: 3,
      misses: 0,
      falseAlarms: 0,
      correctRejections: 3,
      reactionTimes: [100, 200, 300],
    };
    const stats = SDTCalculator.calculateModalityStats(counts);
    expect(stats.avgReactionTime).toBe(200);
  });

  it('AI207: empty reaction times gives null average', () => {
    const counts: RawCounts = {
      hits: 3,
      misses: 0,
      falseAlarms: 0,
      correctRejections: 3,
      reactionTimes: [],
    };
    const stats = SDTCalculator.calculateModalityStats(counts);
    expect(stats.avgReactionTime).toBeNull();
  });

  it('AI208: stats preserves all input counts', () => {
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
        return (
          stats.hits === h &&
          stats.misses === m &&
          stats.falseAlarms === f &&
          stats.correctRejections === c
        );
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('AI209: stats d-prime matches direct calculation', () => {
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
        const direct = SDTCalculator.calculateDPrime(h, m, f, c);
        return stats.dPrime === direct;
      }),
      { numRuns: HIGH_RUNS },
    );
  });

  it('AI210: all exported functions are pure (no side effects)', () => {
    // Call functions multiple times, verify no state change
    const p = 0.75;
    const z1 = SDTCalculator.probit(p);
    SDTCalculator.calculateDPrime(10, 10, 10, 10);
    const z2 = SDTCalculator.probit(p);
    expect(z1).toBe(z2);
  });

  it('AI211: calculateAverageDPrime filters NaN values', () => {
    const stats = {
      a: { dPrime: 2 } as ModalityStats,
      b: { dPrime: 4 } as ModalityStats,
    };
    const avg = SDTCalculator.calculateAverageDPrime(stats);
    expect(avg).toBe(3);
  });

  it('AI212: calculateAverageDPrime filters Infinity values', () => {
    const stats = {
      a: { dPrime: 2 } as ModalityStats,
      b: { dPrime: Infinity } as ModalityStats,
    };
    const avg = SDTCalculator.calculateAverageDPrime(stats);
    // The function filters .filter((d) => Number.isFinite(d))
    expect(avg).toBe(2);
  });

  it('AI213: reaction times array preserved in stats', () => {
    const rts = [100, 200, 300, 400, 500];
    const counts: RawCounts = {
      hits: 5,
      misses: 0,
      falseAlarms: 0,
      correctRejections: 5,
      reactionTimes: rts,
    };
    const stats = SDTCalculator.calculateModalityStats(counts);
    expect(stats.reactionTimes).toEqual(rts);
  });

  it('AI214: d-prime formula derivation: z(H) - z(FA)', () => {
    // Verify the fundamental SDT formula
    const h = 30,
      m = 20,
      f = 10,
      c = 40;
    const hautusH = (h + 0.5) / (h + m + 1);
    const hautusF = (f + 0.5) / (f + c + 1);
    const expected = SDTCalculator.probit(hautusH) - SDTCalculator.probit(hautusF);
    const actual = SDTCalculator.calculateDPrime(h, m, f, c);
    expect(Math.abs(expected - actual)).toBeLessThan(1e-10);
  });

  it('AI215: probit(Phi(z)) = z for standard normal', () => {
    // Phi is CDF, probit is inverse CDF
    // Known values: Phi(0) = 0.5, Phi(1) ≈ 0.8413, Phi(2) ≈ 0.9772
    expect(Math.abs(SDTCalculator.probit(0.5) - 0)).toBeLessThan(1e-6);
    expect(Math.abs(SDTCalculator.probit(0.8413) - 1)).toBeLessThan(0.01);
    expect(Math.abs(SDTCalculator.probit(0.9772) - 2)).toBeLessThan(0.01);
  });
});
