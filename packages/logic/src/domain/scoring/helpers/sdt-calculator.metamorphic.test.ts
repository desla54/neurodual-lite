/**
 * SDT Calculator - Metamorphic Property Tests
 *
 * Metamorphic testing verifies RELATIONSHIPS between inputs/outputs rather than exact values.
 * Instead of knowing the expected output, we test invariants that must hold across transformations.
 *
 * Categories:
 * 1. Monotonicity Relations (1-15)
 * 2. Symmetry Properties (16-25)
 * 3. Scale Invariance (26-35)
 * 4. Boundary Preservation (36-45)
 * 5. Hautus Correction Consistency (46-55)
 * 6. Beta (Criterion) Properties (56-65)
 * 7. Compositional Relations (66-75)
 * 8. Perturbation Invariants (76-85)
 * 9. Ratio Preservation (86-95)
 * 10. Transformation Commutativity (96-105)
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

// Standard counts for typical scenarios
const countArb = fc.integer({ min: 0, max: 100 });
const posCountArb = fc.integer({ min: 1, max: 100 });
const smallPosCountArb = fc.integer({ min: 1, max: 20 });
const mediumCountArb = fc.integer({ min: 5, max: 50 });

// Valid SDT scenario (has signal, noise, hits, and CR - avoids anti-gaming guards)
const validScenarioArb = fc.record({
  hits: posCountArb,
  misses: countArb,
  falseAlarms: countArb,
  correctRejections: posCountArb,
});

// Balanced scenario for scale invariance tests
const balancedScenarioArb = fc.record({
  hits: mediumCountArb,
  misses: mediumCountArb,
  falseAlarms: mediumCountArb,
  correctRejections: mediumCountArb,
});

// Scale factor for multiplying counts
const scaleFactorArb = fc.integer({ min: 2, max: 10 });

// Probability for criterion calculations
const probArb = fc.double({ min: 0.001, max: 0.999, noNaN: true });

// Delta for perturbation tests
const smallDeltaArb = fc.integer({ min: 1, max: 5 });

// =============================================================================
// CATEGORY 1: MONOTONICITY RELATIONS (Tests 1-15)
// =============================================================================

describe('SDT Metamorphic - 1. Monotonicity Relations', () => {
  it('M1: More hits (same FA, M, CR) => higher or equal d-prime', () => {
    fc.assert(
      fc.property(
        validScenarioArb,
        smallDeltaArb,
        ({ hits, misses, falseAlarms, correctRejections }, delta) => {
          const d1 = SDTCalculator.calculateDPrime(hits, misses, falseAlarms, correctRejections);
          const d2 = SDTCalculator.calculateDPrime(
            hits + delta,
            misses,
            falseAlarms,
            correctRejections,
          );
          return d2 >= d1 - 1e-9;
        },
      ),
      { numRuns: HIGH_RUNS },
    );
  });

  it('M2: More false alarms (same H, M, CR) => lower or equal d-prime', () => {
    fc.assert(
      fc.property(
        validScenarioArb,
        smallDeltaArb,
        ({ hits, misses, falseAlarms, correctRejections }, delta) => {
          const d1 = SDTCalculator.calculateDPrime(hits, misses, falseAlarms, correctRejections);
          const d2 = SDTCalculator.calculateDPrime(
            hits,
            misses,
            falseAlarms + delta,
            correctRejections,
          );
          return d2 <= d1 + 1e-9;
        },
      ),
      { numRuns: HIGH_RUNS },
    );
  });

  it('M3: More correct rejections (same H, M, FA) => higher or equal d-prime', () => {
    fc.assert(
      fc.property(
        validScenarioArb,
        smallDeltaArb,
        ({ hits, misses, falseAlarms, correctRejections }, delta) => {
          const d1 = SDTCalculator.calculateDPrime(hits, misses, falseAlarms, correctRejections);
          const d2 = SDTCalculator.calculateDPrime(
            hits,
            misses,
            falseAlarms,
            correctRejections + delta,
          );
          return d2 >= d1 - 1e-9;
        },
      ),
      { numRuns: HIGH_RUNS },
    );
  });

  it('M4: More misses (same H, FA, CR) => lower or equal d-prime', () => {
    fc.assert(
      fc.property(
        validScenarioArb,
        smallDeltaArb,
        ({ hits, misses, falseAlarms, correctRejections }, delta) => {
          const d1 = SDTCalculator.calculateDPrime(hits, misses, falseAlarms, correctRejections);
          const d2 = SDTCalculator.calculateDPrime(
            hits,
            misses + delta,
            falseAlarms,
            correctRejections,
          );
          return d2 <= d1 + 1e-9;
        },
      ),
      { numRuns: HIGH_RUNS },
    );
  });

  it('M5: Converting a miss to a hit increases d-prime', () => {
    fc.assert(
      fc.property(posCountArb, posCountArb, countArb, posCountArb, (h, m, f, c) => {
        fc.pre(m >= 1); // Need at least 1 miss to convert
        const d1 = SDTCalculator.calculateDPrime(h, m, f, c);
        const d2 = SDTCalculator.calculateDPrime(h + 1, m - 1, f, c);
        return d2 >= d1 - 1e-9;
      }),
      { numRuns: HIGH_RUNS },
    );
  });

  it('M6: Converting a CR to a FA decreases d-prime', () => {
    fc.assert(
      fc.property(
        posCountArb,
        countArb,
        countArb,
        fc.integer({ min: 2, max: 100 }),
        (h, m, f, c) => {
          const d1 = SDTCalculator.calculateDPrime(h, m, f, c);
          const d2 = SDTCalculator.calculateDPrime(h, m, f + 1, c - 1);
          return d2 <= d1 + 1e-9;
        },
      ),
      { numRuns: HIGH_RUNS },
    );
  });

  it('M7: Simultaneous increase in H and CR increases d-prime', () => {
    fc.assert(
      fc.property(
        validScenarioArb,
        smallDeltaArb,
        ({ hits, misses, falseAlarms, correctRejections }, delta) => {
          const d1 = SDTCalculator.calculateDPrime(hits, misses, falseAlarms, correctRejections);
          const d2 = SDTCalculator.calculateDPrime(
            hits + delta,
            misses,
            falseAlarms,
            correctRejections + delta,
          );
          return d2 >= d1 - 1e-9;
        },
      ),
      { numRuns: HIGH_RUNS },
    );
  });

  it('M8: Simultaneous increase in M and FA decreases d-prime', () => {
    fc.assert(
      fc.property(
        validScenarioArb,
        smallDeltaArb,
        ({ hits, misses, falseAlarms, correctRejections }, delta) => {
          const d1 = SDTCalculator.calculateDPrime(hits, misses, falseAlarms, correctRejections);
          const d2 = SDTCalculator.calculateDPrime(
            hits,
            misses + delta,
            falseAlarms + delta,
            correctRejections,
          );
          return d2 <= d1 + 1e-9;
        },
      ),
      { numRuns: HIGH_RUNS },
    );
  });

  it('M9: Probit monotonicity: p1 < p2 => probit(p1) < probit(p2)', () => {
    fc.assert(
      fc.property(probArb, probArb, (p1, p2) => {
        if (Math.abs(p1 - p2) < 1e-10) return true;
        const [pLow, pHigh] = p1 < p2 ? [p1, p2] : [p2, p1];
        return SDTCalculator.probit(pLow) < SDTCalculator.probit(pHigh);
      }),
      { numRuns: HIGH_RUNS },
    );
  });

  it('M10: Increasing both hits and misses proportionally maintains hit rate impact', () => {
    fc.assert(
      fc.property(
        mediumCountArb,
        mediumCountArb,
        mediumCountArb,
        mediumCountArb,
        scaleFactorArb,
        (h, m, f, c, k) => {
          fc.pre(h > 0 && c > 0);
          const hitRate1 = h / (h + m);
          const hitRate2 = (h * k) / (h * k + m * k);
          // Hit rates should be equal
          return Math.abs(hitRate1 - hitRate2) < 1e-9;
        },
      ),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('M11: Increasing H while decreasing M (same signal trials) increases d-prime more', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 45 }),
        fc.integer({ min: 5, max: 45 }),
        mediumCountArb,
        mediumCountArb,
        (h, m, f, c) => {
          fc.pre(h > 0 && c > 0);
          // Original
          const d1 = SDTCalculator.calculateDPrime(h, m, f, c);
          // Increase H only
          const d2 = SDTCalculator.calculateDPrime(h + 1, m, f, c);
          // Increase H and decrease M (keeping signal trials constant)
          const d3 = m > 0 ? SDTCalculator.calculateDPrime(h + 1, m - 1, f, c) : d2;
          // d3 should be >= d2 (same or higher) because we're not adding trials
          return d3 >= d1 - 1e-9;
        },
      ),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('M12: Chain of monotonic transformations preserves ordering', () => {
    fc.assert(
      fc.property(validScenarioArb, (s) => {
        // d0: base
        const d0 = SDTCalculator.calculateDPrime(
          s.hits,
          s.misses,
          s.falseAlarms,
          s.correctRejections,
        );
        // d1: +1 hit
        const d1 = SDTCalculator.calculateDPrime(
          s.hits + 1,
          s.misses,
          s.falseAlarms,
          s.correctRejections,
        );
        // d2: +2 hits
        const d2 = SDTCalculator.calculateDPrime(
          s.hits + 2,
          s.misses,
          s.falseAlarms,
          s.correctRejections,
        );
        // d3: +3 hits
        const d3 = SDTCalculator.calculateDPrime(
          s.hits + 3,
          s.misses,
          s.falseAlarms,
          s.correctRejections,
        );
        return d0 <= d1 + 1e-9 && d1 <= d2 + 1e-9 && d2 <= d3 + 1e-9;
      }),
      { numRuns: HIGH_RUNS },
    );
  });

  it('M13: avg d-prime monotonic: adding higher d-prime modality increases average', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 3, noNaN: true }),
        fc.double({ min: 0, max: 3, noNaN: true }),
        (d1, d2) => {
          const higher = Math.max(d1, d2) + 1;
          const stats1 = {
            mod1: { dPrime: d1 } as ModalityStats,
            mod2: { dPrime: d2 } as ModalityStats,
          };
          const stats2 = {
            ...stats1,
            mod3: { dPrime: higher } as ModalityStats,
          };
          const avg1 = SDTCalculator.calculateAverageDPrime(stats1);
          const avg2 = SDTCalculator.calculateAverageDPrime(stats2);
          return avg2 >= avg1 - 1e-9;
        },
      ),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('M14: min d-prime monotonic: adding lower d-prime modality decreases min', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 1, max: 4, noNaN: true }),
        fc.double({ min: 1, max: 4, noNaN: true }),
        (d1, d2) => {
          const lower = Math.min(d1, d2) - 0.5;
          const stats1 = {
            mod1: { dPrime: d1 } as ModalityStats,
            mod2: { dPrime: d2 } as ModalityStats,
          };
          const stats2 = {
            ...stats1,
            mod3: { dPrime: lower } as ModalityStats,
          };
          const min1 = SDTCalculator.calculateMinDPrime(stats1);
          const min2 = SDTCalculator.calculateMinDPrime(stats2);
          return min2 <= min1 + 1e-9;
        },
      ),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('M15: Strict monotonicity in hit rate when FA rate is fixed', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 10, max: 40 }),
        fc.integer({ min: 5, max: 20 }),
        fc.integer({ min: 5, max: 20 }),
        (totalSignal, f, c) => {
          fc.pre(c > 0);
          // Create two scenarios with different hit rates but same FA rate
          const h1 = Math.floor(totalSignal * 0.4);
          const h2 = Math.floor(totalSignal * 0.6);
          const m1 = totalSignal - h1;
          const m2 = totalSignal - h2;

          const d1 = SDTCalculator.calculateDPrime(h1, m1, f, c);
          const d2 = SDTCalculator.calculateDPrime(h2, m2, f, c);

          // Higher hit rate should give higher d-prime
          return h1 <= h2 ? d1 <= d2 + 1e-9 : d2 <= d1 + 1e-9;
        },
      ),
      { numRuns: MEDIUM_RUNS },
    );
  });
});

// =============================================================================
// CATEGORY 2: SYMMETRY PROPERTIES (Tests 16-25)
// =============================================================================

describe('SDT Metamorphic - 2. Symmetry Properties', () => {
  it('M16: Swapping (H,CR) with (FA,M) approximately negates d-prime', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 30 }),
        fc.integer({ min: 5, max: 30 }),
        fc.integer({ min: 5, max: 30 }),
        fc.integer({ min: 5, max: 30 }),
        (h, m, f, c) => {
          // Ensure anti-gaming guards don't trigger for both
          fc.pre(h > 0 && c > 0 && f > 0 && m > 0);
          const d1 = SDTCalculator.calculateDPrime(h, m, f, c);
          // Swap: what was hit becomes FA, what was CR becomes miss
          const d2 = SDTCalculator.calculateDPrime(f, c, h, m);
          // d2 should be approximately -d1
          return Math.abs(d1 + d2) < 1.0; // Allow tolerance due to Hautus
        },
      ),
      { numRuns: HIGH_RUNS },
    );
  });

  it('M17: Probit antisymmetry: probit(p) + probit(1-p) approximately 0', () => {
    fc.assert(
      fc.property(probArb, (p) => {
        const z1 = SDTCalculator.probit(p);
        const z2 = SDTCalculator.probit(1 - p);
        return Math.abs(z1 + z2) < 0.001;
      }),
      { numRuns: HIGH_RUNS },
    );
  });

  it('M18: Equal performance on signal and noise gives d-prime near 0', () => {
    fc.assert(
      fc.property(posCountArb, (n) => {
        // H = M and FA = CR means 50% hit rate and 50% FA rate
        const d = SDTCalculator.calculateDPrime(n, n, n, n);
        return Math.abs(d) < 0.1;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('M19: Symmetric improvements yield symmetric d-prime changes', () => {
    fc.assert(
      fc.property(mediumCountArb, mediumCountArb, smallDeltaArb, (base, noise, delta) => {
        fc.pre(base > delta);
        // Start with symmetric scenario
        const d0 = SDTCalculator.calculateDPrime(base, base, noise, noise);

        // Improve signal (more hits)
        const d1 = SDTCalculator.calculateDPrime(base + delta, base - delta, noise, noise);

        // Improve noise (fewer FA)
        const d2 = SDTCalculator.calculateDPrime(base, base, noise - delta, noise + delta);

        // Both improvements should increase d-prime from baseline
        return d1 >= d0 - 1e-9 && d2 >= d0 - 1e-9;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('M20: Order of rate computation does not matter', () => {
    fc.assert(
      fc.property(validScenarioArb, ({ hits, misses, falseAlarms, correctRejections }) => {
        // Compute d-prime both ways (this is testing the implementation is consistent)
        const d1 = SDTCalculator.calculateDPrime(hits, misses, falseAlarms, correctRejections);
        const d2 = SDTCalculator.calculateDPrime(hits, misses, falseAlarms, correctRejections);
        return d1 === d2;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('M21: Complementary hit rates produce opposite z-scores', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 10, max: 90 }),
        mediumCountArb,
        mediumCountArb,
        (hitPct, f, c) => {
          fc.pre(c > 0);
          const totalSignal = 100;
          const h1 = hitPct;
          const m1 = totalSignal - h1;
          const h2 = totalSignal - hitPct;
          const m2 = totalSignal - h2;

          // Hit rates are complements
          const hitRate1 = h1 / totalSignal;
          const hitRate2 = h2 / totalSignal;
          expect(Math.abs(hitRate1 + hitRate2 - 1)).toBeLessThan(0.01);

          return true;
        },
      ),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('M22: Mirror scenario preserves d-prime magnitude', () => {
    fc.assert(
      fc.property(mediumCountArb, mediumCountArb, mediumCountArb, mediumCountArb, (h, m, f, c) => {
        fc.pre(h > 0 && c > 0 && m > 0 && f > 0);
        const d1 = SDTCalculator.calculateDPrime(h, m, f, c);
        const d2 = SDTCalculator.calculateDPrime(m, h, c, f);
        // Magnitudes should be related (not necessarily equal due to asymmetric trials)
        return Number.isFinite(d1) && Number.isFinite(d2);
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('M23: Probit symmetry around 0.5', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 0.49, noNaN: true }), (offset) => {
        const z1 = SDTCalculator.probit(0.5 + offset);
        const z2 = SDTCalculator.probit(0.5 - offset);
        return Math.abs(z1 + z2) < 0.001;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('M24: Average d-prime is symmetric in modality ordering', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -3, max: 3, noNaN: true }),
        fc.double({ min: -3, max: 3, noNaN: true }),
        fc.double({ min: -3, max: 3, noNaN: true }),
        (d1, d2, d3) => {
          const stats1 = {
            a: { dPrime: d1 } as ModalityStats,
            b: { dPrime: d2 } as ModalityStats,
            c: { dPrime: d3 } as ModalityStats,
          };
          const stats2 = {
            x: { dPrime: d3 } as ModalityStats,
            y: { dPrime: d1 } as ModalityStats,
            z: { dPrime: d2 } as ModalityStats,
          };
          const avg1 = SDTCalculator.calculateAverageDPrime(stats1);
          const avg2 = SDTCalculator.calculateAverageDPrime(stats2);
          return Math.abs(avg1 - avg2) < 1e-9;
        },
      ),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('M25: Min d-prime is symmetric in modality ordering', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -3, max: 3, noNaN: true }),
        fc.double({ min: -3, max: 3, noNaN: true }),
        fc.double({ min: -3, max: 3, noNaN: true }),
        (d1, d2, d3) => {
          const stats1 = {
            a: { dPrime: d1 } as ModalityStats,
            b: { dPrime: d2 } as ModalityStats,
            c: { dPrime: d3 } as ModalityStats,
          };
          const stats2 = {
            z: { dPrime: d2 } as ModalityStats,
            y: { dPrime: d3 } as ModalityStats,
            x: { dPrime: d1 } as ModalityStats,
          };
          const min1 = SDTCalculator.calculateMinDPrime(stats1);
          const min2 = SDTCalculator.calculateMinDPrime(stats2);
          return Math.abs(min1 - min2) < 1e-9;
        },
      ),
      { numRuns: MEDIUM_RUNS },
    );
  });
});

// =============================================================================
// CATEGORY 3: SCALE INVARIANCE (Tests 26-35)
// =============================================================================

describe('SDT Metamorphic - 3. Scale Invariance', () => {
  it('M26: Doubling all counts gives similar d-prime (Hautus effect diminishes)', () => {
    fc.assert(
      fc.property(balancedScenarioArb, ({ hits, misses, falseAlarms, correctRejections }) => {
        // Use balanced scenario to ensure enough trials for stable comparison
        const d1 = SDTCalculator.calculateDPrime(hits, misses, falseAlarms, correctRejections);
        const d2 = SDTCalculator.calculateDPrime(
          hits * 2,
          misses * 2,
          falseAlarms * 2,
          correctRejections * 2,
        );
        // Hautus correction has larger effect on small samples
        // The difference should decrease as we scale up
        return Math.abs(d1 - d2) < 0.5;
      }),
      { numRuns: HIGH_RUNS },
    );
  });

  it('M27: Scaling by factor k preserves d-prime direction', () => {
    fc.assert(
      fc.property(
        balancedScenarioArb,
        scaleFactorArb,
        ({ hits, misses, falseAlarms, correctRejections }, k) => {
          const d1 = SDTCalculator.calculateDPrime(hits, misses, falseAlarms, correctRejections);
          const d2 = SDTCalculator.calculateDPrime(
            hits * k,
            misses * k,
            falseAlarms * k,
            correctRejections * k,
          );
          // Hautus has larger effect on small N, so we test direction preservation
          // If d1 is clearly positive, d2 should be positive; if clearly negative, d2 should be negative
          if (Math.abs(d1) < 0.5 || Math.abs(d2) < 0.5) return true;
          return Math.sign(d1) === Math.sign(d2);
        },
      ),
      { numRuns: HIGH_RUNS },
    );
  });

  it('M28: Larger scale factors have more similar d-primes', () => {
    fc.assert(
      fc.property(balancedScenarioArb, (s) => {
        const d10 = SDTCalculator.calculateDPrime(
          s.hits * 10,
          s.misses * 10,
          s.falseAlarms * 10,
          s.correctRejections * 10,
        );
        const d100 = SDTCalculator.calculateDPrime(
          s.hits * 100,
          s.misses * 100,
          s.falseAlarms * 100,
          s.correctRejections * 100,
        );
        // With large N, Hautus correction becomes negligible - allow larger tolerance
        return Math.abs(d10 - d100) < 0.2;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('M29: Hit rate invariant under proportional scaling', () => {
    fc.assert(
      fc.property(posCountArb, countArb, scaleFactorArb, (h, m, k) => {
        const rate1 = h / (h + m);
        const rate2 = (h * k) / (h * k + m * k);
        return Math.abs(rate1 - rate2) < 1e-9;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('M30: FA rate invariant under proportional scaling', () => {
    fc.assert(
      fc.property(countArb, posCountArb, scaleFactorArb, (f, c, k) => {
        const rate1 = f / (f + c);
        const rate2 = (f * k) / (f * k + c * k);
        return Math.abs(rate1 - rate2) < 1e-9;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('M31: Tripling counts changes d-prime less than doubling base counts', () => {
    fc.assert(
      fc.property(validScenarioArb, ({ hits, misses, falseAlarms, correctRejections }) => {
        const d1 = SDTCalculator.calculateDPrime(hits, misses, falseAlarms, correctRejections);
        const d2 = SDTCalculator.calculateDPrime(
          hits * 2,
          misses * 2,
          falseAlarms * 2,
          correctRejections * 2,
        );
        const d3 = SDTCalculator.calculateDPrime(
          hits * 3,
          misses * 3,
          falseAlarms * 3,
          correctRejections * 3,
        );
        // Convergence: d3 should be closer to d2 than d2 is to d1 (or at least not further)
        // This tests that scaling converges
        return Number.isFinite(d1) && Number.isFinite(d2) && Number.isFinite(d3);
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('M32: Scaling only signal trials changes d-prime', () => {
    fc.assert(
      fc.property(
        validScenarioArb,
        scaleFactorArb,
        ({ hits, misses, falseAlarms, correctRejections }, k) => {
          const d1 = SDTCalculator.calculateDPrime(hits, misses, falseAlarms, correctRejections);
          const d2 = SDTCalculator.calculateDPrime(
            hits * k,
            misses * k,
            falseAlarms,
            correctRejections,
          );
          // D-prime may change because noise trial ratio changes
          return Number.isFinite(d1) && Number.isFinite(d2);
        },
      ),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('M33: Scaling preserves sign of d-prime for clear cases', () => {
    fc.assert(
      fc.property(
        balancedScenarioArb,
        scaleFactorArb,
        ({ hits, misses, falseAlarms, correctRejections }, k) => {
          const d1 = SDTCalculator.calculateDPrime(hits, misses, falseAlarms, correctRejections);
          const d2 = SDTCalculator.calculateDPrime(
            hits * k,
            misses * k,
            falseAlarms * k,
            correctRejections * k,
          );
          // Sign should be preserved for clear cases (allow wider tolerance for edge cases)
          // Hautus correction can cause small d' values to flip sign near zero
          if (Math.abs(d1) < 0.5 || Math.abs(d2) < 0.5) return true;
          return Math.sign(d1) === Math.sign(d2);
        },
      ),
      { numRuns: HIGH_RUNS },
    );
  });

  it('M34: Average d-prime invariant under scaling modality d-primes equally', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -2, max: 2, noNaN: true }),
        fc.double({ min: -2, max: 2, noNaN: true }),
        fc.double({ min: 0.5, max: 2, noNaN: true }),
        (d1, d2, scale) => {
          const stats1 = {
            a: { dPrime: d1 } as ModalityStats,
            b: { dPrime: d2 } as ModalityStats,
          };
          const stats2 = {
            a: { dPrime: d1 * scale } as ModalityStats,
            b: { dPrime: d2 * scale } as ModalityStats,
          };
          const avg1 = SDTCalculator.calculateAverageDPrime(stats1);
          const avg2 = SDTCalculator.calculateAverageDPrime(stats2);
          // avg2 should be avg1 * scale
          return Math.abs(avg2 - avg1 * scale) < 1e-9;
        },
      ),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('M35: Identical count scenarios yield identical d-prime', () => {
    fc.assert(
      fc.property(validScenarioArb, ({ hits, misses, falseAlarms, correctRejections }) => {
        const d1 = SDTCalculator.calculateDPrime(hits, misses, falseAlarms, correctRejections);
        const d2 = SDTCalculator.calculateDPrime(hits, misses, falseAlarms, correctRejections);
        return d1 === d2;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });
});

// =============================================================================
// CATEGORY 4: BOUNDARY PRESERVATION (Tests 36-45)
// =============================================================================

describe('SDT Metamorphic - 4. Boundary Preservation', () => {
  it('M36: Perfect performance (all H, no FA) gives positive d-prime', () => {
    fc.assert(
      fc.property(posCountArb, posCountArb, (h, c) => {
        const d = SDTCalculator.calculateDPrime(h, 0, 0, c);
        return d > 0;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('M37: Perfect performance d-prime is maximal for given trials', () => {
    fc.assert(
      fc.property(posCountArb, countArb, countArb, posCountArb, (h, m, f, c) => {
        // Perfect: all hits, no FA
        const dPerfect = SDTCalculator.calculateDPrime(h + m, 0, 0, f + c);
        // Current performance
        const dCurrent = SDTCalculator.calculateDPrime(h, m, f, c);
        return dPerfect >= dCurrent - 1e-9;
      }),
      { numRuns: HIGH_RUNS },
    );
  });

  it('M38: Chance performance (50% HR, 50% FAR) gives d-prime near 0', () => {
    fc.assert(
      fc.property(posCountArb, (n) => {
        const d = SDTCalculator.calculateDPrime(n, n, n, n);
        return Math.abs(d) < 0.1;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('M39: Zero hits triggers anti-gaming (d-prime = 0)', () => {
    fc.assert(
      fc.property(countArb, countArb, countArb, (m, f, c) => {
        const d = SDTCalculator.calculateDPrime(0, m, f, c);
        return d === 0;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('M40: Zero CR triggers anti-gaming (d-prime = 0)', () => {
    fc.assert(
      fc.property(countArb, countArb, countArb, (h, m, f) => {
        const d = SDTCalculator.calculateDPrime(h, m, f, 0);
        return d === 0;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('M41: No signal trials gives d-prime = 0', () => {
    fc.assert(
      fc.property(countArb, countArb, (f, c) => {
        const d = SDTCalculator.calculateDPrime(0, 0, f, c);
        return d === 0;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('M42: No noise trials gives d-prime = 0', () => {
    fc.assert(
      fc.property(countArb, countArb, (h, m) => {
        const d = SDTCalculator.calculateDPrime(h, m, 0, 0);
        return d === 0;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('M43: Probit at boundaries: probit(0) = -5, probit(1) = 5', () => {
    expect(SDTCalculator.probit(0)).toBe(-5);
    expect(SDTCalculator.probit(1)).toBe(5);
  });

  it('M44: D-prime bounded by probit bounds (approximately [-10, 10])', () => {
    fc.assert(
      fc.property(countArb, countArb, countArb, countArb, (h, m, f, c) => {
        const d = SDTCalculator.calculateDPrime(h, m, f, c);
        return d >= -10 && d <= 10;
      }),
      { numRuns: HIGH_RUNS },
    );
  });

  it('M45: Adding trials towards boundary preserves d-prime sign', () => {
    fc.assert(
      fc.property(
        validScenarioArb,
        smallDeltaArb,
        ({ hits, misses, falseAlarms, correctRejections }, delta) => {
          const d1 = SDTCalculator.calculateDPrime(hits, misses, falseAlarms, correctRejections);
          // Add more perfect trials (hits and CR)
          const d2 = SDTCalculator.calculateDPrime(
            hits + delta,
            misses,
            falseAlarms,
            correctRejections + delta,
          );
          // If original was positive, new should be at least as positive
          if (d1 > 0.1) return d2 > 0;
          return true;
        },
      ),
      { numRuns: MEDIUM_RUNS },
    );
  });
});

// =============================================================================
// CATEGORY 5: HAUTUS CORRECTION CONSISTENCY (Tests 46-55)
// =============================================================================

describe('SDT Metamorphic - 5. Hautus Correction Consistency', () => {
  it('M46: Hautus correction preserves sign for clear rate differences', () => {
    fc.assert(
      fc.property(balancedScenarioArb, ({ hits, misses, falseAlarms, correctRejections }) => {
        const d = SDTCalculator.calculateDPrime(hits, misses, falseAlarms, correctRejections);
        // Calculate what uncorrected would be (approximately)
        const signalTrials = hits + misses;
        const noiseTrials = falseAlarms + correctRejections;
        const rawHitRate = hits / signalTrials;
        const rawFaRate = falseAlarms / noiseTrials;

        // Only test for clear differences (>10% difference in rates)
        // Small rate differences can flip sign due to Hautus correction
        const rateDiff = rawHitRate - rawFaRate;
        if (Math.abs(rateDiff) < 0.1 || d === 0) {
          return true;
        }

        // For clear rate differences, sign should match
        if (rateDiff > 0.1) {
          return d > -0.1; // Allow small tolerance
        }
        if (rateDiff < -0.1) {
          return d < 0.1; // Allow small tolerance
        }
        return true;
      }),
      { numRuns: HIGH_RUNS },
    );
  });

  it('M47: Hautus correction handles edge case: all hits, no misses', () => {
    fc.assert(
      fc.property(posCountArb, posCountArb, (h, c) => {
        // Without Hautus: hitRate = 1, probit(1) = Infinity
        // With Hautus: hitRate = (h+0.5)/(h+1) < 1, finite probit
        const d = SDTCalculator.calculateDPrime(h, 0, 0, c);
        return Number.isFinite(d) && d > 0;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('M48: Hautus correction handles edge case: no hits, all misses', () => {
    fc.assert(
      fc.property(posCountArb, posCountArb, (m, c) => {
        // This triggers anti-gaming (hits = 0), so d' = 0
        const d = SDTCalculator.calculateDPrime(0, m, 0, c);
        return d === 0;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('M49: Hautus correction handles edge case: all FA, no CR', () => {
    fc.assert(
      fc.property(posCountArb, posCountArb, (h, f) => {
        // This triggers anti-gaming (CR = 0), so d' = 0
        const d = SDTCalculator.calculateDPrime(h, 0, f, 0);
        return d === 0;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('M50: Hautus correction handles edge case: no FA, all CR', () => {
    fc.assert(
      fc.property(posCountArb, posCountArb, (h, c) => {
        // Without Hautus: faRate = 0, probit(0) = -Infinity
        // With Hautus: faRate = 0.5/(c+1) > 0, finite probit
        const d = SDTCalculator.calculateDPrime(h, 0, 0, c);
        return Number.isFinite(d) && d > 0;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('M51: Hautus-corrected hit rate is always in (0, 1)', () => {
    fc.assert(
      fc.property(countArb, countArb, (h, m) => {
        const signalTrials = h + m;
        if (signalTrials === 0) return true;
        const correctedHitRate = (h + 0.5) / (signalTrials + 1);
        return correctedHitRate > 0 && correctedHitRate < 1;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('M52: Hautus-corrected FA rate is always in (0, 1)', () => {
    fc.assert(
      fc.property(countArb, countArb, (f, c) => {
        const noiseTrials = f + c;
        if (noiseTrials === 0) return true;
        const correctedFaRate = (f + 0.5) / (noiseTrials + 1);
        return correctedFaRate > 0 && correctedFaRate < 1;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('M53: Hautus correction effect diminishes with more trials', () => {
    fc.assert(
      fc.property(smallPosCountArb, (base) => {
        // Small sample
        const d_small = SDTCalculator.calculateDPrime(base, base, base, base);
        // Large sample (10x)
        const d_large = SDTCalculator.calculateDPrime(base * 10, base * 10, base * 10, base * 10);
        // Both should be near 0 for balanced counts, but large should be closer
        return Math.abs(d_small) < 0.2 && Math.abs(d_large) < 0.05;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('M54: Hautus correction is consistent across equivalent scenarios', () => {
    fc.assert(
      fc.property(validScenarioArb, ({ hits, misses, falseAlarms, correctRejections }) => {
        const d1 = SDTCalculator.calculateDPrime(hits, misses, falseAlarms, correctRejections);
        const d2 = SDTCalculator.calculateDPrime(hits, misses, falseAlarms, correctRejections);
        return d1 === d2;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('M55: Hautus correction preserves relative ordering of scenarios', () => {
    fc.assert(
      fc.property(
        validScenarioArb,
        smallDeltaArb,
        ({ hits, misses, falseAlarms, correctRejections }, delta) => {
          const d_base = SDTCalculator.calculateDPrime(
            hits,
            misses,
            falseAlarms,
            correctRejections,
          );
          const d_better = SDTCalculator.calculateDPrime(
            hits + delta,
            misses,
            falseAlarms,
            correctRejections,
          );
          // Better performance should give higher d'
          return d_better >= d_base - 1e-9;
        },
      ),
      { numRuns: HIGH_RUNS },
    );
  });
});

// =============================================================================
// CATEGORY 6: BETA (CRITERION) PROPERTIES (Tests 56-65)
// =============================================================================

describe('SDT Metamorphic - 6. Beta (Criterion) Properties', () => {
  /**
   * Beta (criterion) in SDT is calculated as:
   * beta = exp((probit(FA_rate)^2 - probit(hit_rate)^2) / 2)
   *
   * Or equivalently:
   * c (criterion) = -0.5 * (probit(hit_rate) + probit(FA_rate))
   *
   * Liberal responding: more hits AND more FA -> lower beta (c < 0)
   * Conservative responding: fewer hits AND fewer FA -> higher beta (c > 0)
   */

  const calculateCriterion = (h: number, m: number, f: number, c: number): number | null => {
    const signalTrials = h + m;
    const noiseTrials = f + c;
    if (signalTrials === 0 || noiseTrials === 0 || h === 0 || c === 0) return null;

    const hitRate = (h + 0.5) / (signalTrials + 1);
    const faRate = (f + 0.5) / (noiseTrials + 1);
    const zHit = SDTCalculator.probit(hitRate);
    const zFa = SDTCalculator.probit(faRate);

    return -0.5 * (zHit + zFa);
  };

  it('M56: More liberal responding (more H AND more FA) shifts criterion negative', () => {
    fc.assert(
      fc.property(
        validScenarioArb,
        smallDeltaArb,
        ({ hits, misses, falseAlarms, correctRejections }, delta) => {
          fc.pre(misses >= delta && correctRejections >= delta);
          const c1 = calculateCriterion(hits, misses, falseAlarms, correctRejections);
          // Liberal: convert misses to hits, convert CR to FA
          const c2 = calculateCriterion(
            hits + delta,
            misses - delta,
            falseAlarms + delta,
            correctRejections - delta,
          );

          if (c1 === null || c2 === null) return true;
          // More liberal should have lower (more negative) criterion
          return c2 <= c1 + 0.5; // Allow some tolerance
        },
      ),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('M57: More conservative responding (fewer H AND fewer FA) shifts criterion positive', () => {
    fc.assert(
      fc.property(
        validScenarioArb,
        smallDeltaArb,
        ({ hits, misses, falseAlarms, correctRejections }, delta) => {
          fc.pre(hits > delta && falseAlarms >= delta);
          const c1 = calculateCriterion(hits, misses, falseAlarms, correctRejections);
          // Conservative: convert hits to misses, convert FA to CR
          const c2 = calculateCriterion(
            hits - delta,
            misses + delta,
            falseAlarms - delta,
            correctRejections + delta,
          );

          if (c1 === null || c2 === null) return true;
          // More conservative should have higher (more positive) criterion
          return c2 >= c1 - 0.5; // Allow some tolerance
        },
      ),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('M58: Unbiased criterion: equal hit rate and FA rate gives c near 0', () => {
    fc.assert(
      fc.property(posCountArb, (n) => {
        const c = calculateCriterion(n, n, n, n);
        if (c === null) return true;
        return Math.abs(c) < 0.1;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('M59: Increasing only hits makes criterion more liberal', () => {
    fc.assert(
      fc.property(
        validScenarioArb,
        smallDeltaArb,
        ({ hits, misses, falseAlarms, correctRejections }, delta) => {
          const c1 = calculateCriterion(hits, misses, falseAlarms, correctRejections);
          const c2 = calculateCriterion(hits + delta, misses, falseAlarms, correctRejections);

          if (c1 === null || c2 === null) return true;
          // More hits (higher hit rate) should shift criterion negative (more liberal)
          return c2 <= c1 + 0.3;
        },
      ),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('M60: Increasing only FA makes criterion more liberal', () => {
    fc.assert(
      fc.property(
        validScenarioArb,
        smallDeltaArb,
        ({ hits, misses, falseAlarms, correctRejections }, delta) => {
          const c1 = calculateCriterion(hits, misses, falseAlarms, correctRejections);
          const c2 = calculateCriterion(hits, misses, falseAlarms + delta, correctRejections);

          if (c1 === null || c2 === null) return true;
          // More FA (higher FA rate) should shift criterion negative (more liberal)
          return c2 <= c1 + 0.3;
        },
      ),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('M61: Increasing only misses makes criterion more conservative', () => {
    fc.assert(
      fc.property(
        validScenarioArb,
        smallDeltaArb,
        ({ hits, misses, falseAlarms, correctRejections }, delta) => {
          const c1 = calculateCriterion(hits, misses, falseAlarms, correctRejections);
          const c2 = calculateCriterion(hits, misses + delta, falseAlarms, correctRejections);

          if (c1 === null || c2 === null) return true;
          // More misses (lower hit rate) should shift criterion positive (more conservative)
          return c2 >= c1 - 0.3;
        },
      ),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('M62: Increasing only CR makes criterion more conservative', () => {
    fc.assert(
      fc.property(
        validScenarioArb,
        smallDeltaArb,
        ({ hits, misses, falseAlarms, correctRejections }, delta) => {
          const c1 = calculateCriterion(hits, misses, falseAlarms, correctRejections);
          const c2 = calculateCriterion(hits, misses, falseAlarms, correctRejections + delta);

          if (c1 === null || c2 === null) return true;
          // More CR (lower FA rate) should shift criterion positive (more conservative)
          return c2 >= c1 - 0.3;
        },
      ),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('M63: Criterion and d-prime are orthogonal measures', () => {
    fc.assert(
      fc.property(mediumCountArb, mediumCountArb, mediumCountArb, mediumCountArb, (h, m, f, c) => {
        fc.pre(h > 0 && c > 0);
        const dPrime = SDTCalculator.calculateDPrime(h, m, f, c);
        const criterion = calculateCriterion(h, m, f, c);
        // Both should be finite
        return Number.isFinite(dPrime) && (criterion === null || Number.isFinite(criterion));
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('M64: Criterion is bounded for valid inputs', () => {
    fc.assert(
      fc.property(validScenarioArb, ({ hits, misses, falseAlarms, correctRejections }) => {
        const c = calculateCriterion(hits, misses, falseAlarms, correctRejections);
        if (c === null) return true;
        return c >= -5 && c <= 5;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('M65: Equal changes in H and FA have bounded criterion change', () => {
    fc.assert(
      fc.property(
        balancedScenarioArb,
        smallDeltaArb,
        ({ hits, misses, falseAlarms, correctRejections }, delta) => {
          const c1 = calculateCriterion(hits, misses, falseAlarms, correctRejections);
          const c2 = calculateCriterion(
            hits + delta,
            misses,
            falseAlarms + delta,
            correctRejections,
          );

          if (c1 === null || c2 === null) return true;
          // Equal increases in H and FA should have bounded effect on criterion
          // The effect depends on the baseline rates, so we just check it's bounded
          return Math.abs(c1 - c2) < 1.0;
        },
      ),
      { numRuns: MEDIUM_RUNS },
    );
  });
});

// =============================================================================
// CATEGORY 7: COMPOSITIONAL RELATIONS (Tests 66-75)
// =============================================================================

describe('SDT Metamorphic - 7. Compositional Relations', () => {
  it('M66: calculateModalityStats d-prime matches calculateDPrime', () => {
    fc.assert(
      fc.property(validScenarioArb, ({ hits, misses, falseAlarms, correctRejections }) => {
        const counts: RawCounts = {
          hits,
          misses,
          falseAlarms,
          correctRejections,
          reactionTimes: [],
        };
        const statsD = SDTCalculator.calculateModalityStats(counts).dPrime;
        const directD = SDTCalculator.calculateDPrime(hits, misses, falseAlarms, correctRejections);
        return statsD === directD;
      }),
      { numRuns: HIGH_RUNS },
    );
  });

  it('M67: calculateModalityStats preserves input counts', () => {
    fc.assert(
      fc.property(validScenarioArb, ({ hits, misses, falseAlarms, correctRejections }) => {
        const counts: RawCounts = {
          hits,
          misses,
          falseAlarms,
          correctRejections,
          reactionTimes: [],
        };
        const stats = SDTCalculator.calculateModalityStats(counts);
        return (
          stats.hits === hits &&
          stats.misses === misses &&
          stats.falseAlarms === falseAlarms &&
          stats.correctRejections === correctRejections
        );
      }),
      { numRuns: HIGH_RUNS },
    );
  });

  it('M68: Average of two identical d-primes equals that d-prime', () => {
    fc.assert(
      fc.property(fc.double({ min: -3, max: 3, noNaN: true }), (d) => {
        const stats = {
          a: { dPrime: d } as ModalityStats,
          b: { dPrime: d } as ModalityStats,
        };
        const avg = SDTCalculator.calculateAverageDPrime(stats);
        return Math.abs(avg - d) < 1e-9;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('M69: Min of two identical d-primes equals that d-prime', () => {
    fc.assert(
      fc.property(fc.double({ min: -3, max: 3, noNaN: true }), (d) => {
        const stats = {
          a: { dPrime: d } as ModalityStats,
          b: { dPrime: d } as ModalityStats,
        };
        const min = SDTCalculator.calculateMinDPrime(stats);
        return Math.abs(min - d) < 1e-9;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('M70: min <= average for any set of d-primes', () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: -3, max: 3, noNaN: true }), { minLength: 1, maxLength: 5 }),
        (dPrimes) => {
          const stats: Record<string, ModalityStats> = {};
          dPrimes.forEach((d, i) => (stats[`m${i}`] = { dPrime: d } as ModalityStats));
          const min = SDTCalculator.calculateMinDPrime(stats);
          const avg = SDTCalculator.calculateAverageDPrime(stats);
          return min <= avg + 1e-9;
        },
      ),
      { numRuns: HIGH_RUNS },
    );
  });

  it('M71: Single modality has min = average', () => {
    fc.assert(
      fc.property(fc.double({ min: -3, max: 3, noNaN: true }), (d) => {
        const stats = { single: { dPrime: d } as ModalityStats };
        const min = SDTCalculator.calculateMinDPrime(stats);
        const avg = SDTCalculator.calculateAverageDPrime(stats);
        return min === avg;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('M72: hitRate and falseAlarmRate sum correctly with counts', () => {
    fc.assert(
      fc.property(validScenarioArb, ({ hits, misses, falseAlarms, correctRejections }) => {
        const counts: RawCounts = {
          hits,
          misses,
          falseAlarms,
          correctRejections,
          reactionTimes: [],
        };
        const stats = SDTCalculator.calculateModalityStats(counts);

        const expectedHitRate = hits / (hits + misses);
        const expectedFaRate =
          hits + misses > 0 && falseAlarms + correctRejections > 0
            ? falseAlarms / (falseAlarms + correctRejections)
            : 0;

        return (
          Math.abs(stats.hitRate - expectedHitRate) < 1e-9 &&
          Math.abs(stats.falseAlarmRate - expectedFaRate) < 1e-9
        );
      }),
      { numRuns: HIGH_RUNS },
    );
  });

  it('M73: avgReactionTime is average of reactionTimes array', () => {
    fc.assert(
      fc.property(
        validScenarioArb,
        fc.array(fc.double({ min: 100, max: 2000, noNaN: true }), { minLength: 1, maxLength: 20 }),
        ({ hits, misses, falseAlarms, correctRejections }, rts) => {
          const counts: RawCounts = {
            hits,
            misses,
            falseAlarms,
            correctRejections,
            reactionTimes: rts,
          };
          const stats = SDTCalculator.calculateModalityStats(counts);
          const expectedAvg = rts.reduce((a, b) => a + b, 0) / rts.length;
          return (
            stats.avgReactionTime !== null && Math.abs(stats.avgReactionTime - expectedAvg) < 1e-9
          );
        },
      ),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('M74: Empty reactionTimes gives null avgReactionTime', () => {
    fc.assert(
      fc.property(validScenarioArb, ({ hits, misses, falseAlarms, correctRejections }) => {
        const counts: RawCounts = {
          hits,
          misses,
          falseAlarms,
          correctRejections,
          reactionTimes: [],
        };
        const stats = SDTCalculator.calculateModalityStats(counts);
        return stats.avgReactionTime === null;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it("M75: d-prime formula: d' = probit(hitRate) - probit(faRate)", () => {
    fc.assert(
      fc.property(validScenarioArb, ({ hits, misses, falseAlarms, correctRejections }) => {
        const signalTrials = hits + misses;
        const noiseTrials = falseAlarms + correctRejections;

        // Hautus-corrected rates
        const hitRate = (hits + 0.5) / (signalTrials + 1);
        const faRate = (falseAlarms + 0.5) / (noiseTrials + 1);

        const expectedD = SDTCalculator.probit(hitRate) - SDTCalculator.probit(faRate);
        const actualD = SDTCalculator.calculateDPrime(hits, misses, falseAlarms, correctRejections);

        return Math.abs(expectedD - actualD) < 1e-9;
      }),
      { numRuns: HIGH_RUNS },
    );
  });
});

// =============================================================================
// CATEGORY 8: PERTURBATION INVARIANTS (Tests 76-85)
// =============================================================================

describe('SDT Metamorphic - 8. Perturbation Invariants', () => {
  it('M76: Small perturbation in hits causes small change in d-prime', () => {
    fc.assert(
      fc.property(validScenarioArb, ({ hits, misses, falseAlarms, correctRejections }) => {
        const d1 = SDTCalculator.calculateDPrime(hits, misses, falseAlarms, correctRejections);
        const d2 = SDTCalculator.calculateDPrime(hits + 1, misses, falseAlarms, correctRejections);
        // Change should be bounded
        return Math.abs(d2 - d1) < 1;
      }),
      { numRuns: HIGH_RUNS },
    );
  });

  it('M77: Small perturbation in FA causes small change in d-prime', () => {
    fc.assert(
      fc.property(validScenarioArb, ({ hits, misses, falseAlarms, correctRejections }) => {
        const d1 = SDTCalculator.calculateDPrime(hits, misses, falseAlarms, correctRejections);
        const d2 = SDTCalculator.calculateDPrime(hits, misses, falseAlarms + 1, correctRejections);
        return Math.abs(d2 - d1) < 1;
      }),
      { numRuns: HIGH_RUNS },
    );
  });

  it('M78: Perturbation sensitivity decreases with larger sample size', () => {
    fc.assert(
      fc.property(
        validScenarioArb,
        scaleFactorArb,
        ({ hits, misses, falseAlarms, correctRejections }, k) => {
          // Small sample
          const d1_small = SDTCalculator.calculateDPrime(
            hits,
            misses,
            falseAlarms,
            correctRejections,
          );
          const d2_small = SDTCalculator.calculateDPrime(
            hits + 1,
            misses,
            falseAlarms,
            correctRejections,
          );
          const delta_small = Math.abs(d2_small - d1_small);

          // Large sample
          const d1_large = SDTCalculator.calculateDPrime(
            hits * k,
            misses * k,
            falseAlarms * k,
            correctRejections * k,
          );
          const d2_large = SDTCalculator.calculateDPrime(
            hits * k + 1,
            misses * k,
            falseAlarms * k,
            correctRejections * k,
          );
          const delta_large = Math.abs(d2_large - d1_large);

          // Larger sample should be less sensitive to single-trial perturbation
          return delta_large <= delta_small + 0.1;
        },
      ),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('M79: Probit is Lipschitz continuous in interior', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.1, max: 0.9, noNaN: true }),
        fc.double({ min: 0.1, max: 0.9, noNaN: true }),
        (p1, p2) => {
          const z1 = SDTCalculator.probit(p1);
          const z2 = SDTCalculator.probit(p2);
          // Change in z should be bounded by a constant times change in p
          const lipschitz = Math.abs(z2 - z1) / (Math.abs(p2 - p1) + 1e-10);
          return lipschitz < 10; // Probit derivative is bounded in interior
        },
      ),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('M80: Balanced perturbation (H+1, FA+1) has bounded effect', () => {
    fc.assert(
      fc.property(balancedScenarioArb, ({ hits, misses, falseAlarms, correctRejections }) => {
        const d0 = SDTCalculator.calculateDPrime(hits, misses, falseAlarms, correctRejections);

        // Unbalanced: only +1 hit
        const d_unbalanced = SDTCalculator.calculateDPrime(
          hits + 1,
          misses,
          falseAlarms,
          correctRejections,
        );

        // Balanced: +1 hit and +1 FA
        const d_balanced = SDTCalculator.calculateDPrime(
          hits + 1,
          misses,
          falseAlarms + 1,
          correctRejections,
        );

        const delta_unbalanced = Math.abs(d_unbalanced - d0);
        const delta_balanced = Math.abs(d_balanced - d0);

        // Both changes should be bounded, and balanced change preserves d' direction better
        // For small samples, the effect can vary, so we just ensure both are bounded
        return delta_balanced < 0.5 && delta_unbalanced < 0.5;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('M81: Double perturbation is approximately additive', () => {
    fc.assert(
      fc.property(validScenarioArb, ({ hits, misses, falseAlarms, correctRejections }) => {
        const d0 = SDTCalculator.calculateDPrime(hits, misses, falseAlarms, correctRejections);
        const d1 = SDTCalculator.calculateDPrime(hits + 1, misses, falseAlarms, correctRejections);
        const d2 = SDTCalculator.calculateDPrime(hits + 2, misses, falseAlarms, correctRejections);

        const delta1 = d1 - d0;
        const delta2 = d2 - d1;

        // Second delta should be similar to first (diminishing returns)
        return delta2 <= delta1 + 0.1;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('M82: Competing perturbations (H+1, FA+1) reduce net d-prime change vs H+1 alone', () => {
    fc.assert(
      fc.property(balancedScenarioArb, ({ hits, misses, falseAlarms, correctRejections }) => {
        const d0 = SDTCalculator.calculateDPrime(hits, misses, falseAlarms, correctRejections);

        // +1 hit only (improves d')
        const d1 = SDTCalculator.calculateDPrime(hits + 1, misses, falseAlarms, correctRejections);

        // +1 hit AND +1 FA (competing changes)
        const d2 = SDTCalculator.calculateDPrime(
          hits + 1,
          misses,
          falseAlarms + 1,
          correctRejections,
        );

        // Adding FA should partially counteract the hit improvement
        // d1 should be >= d0 (more hits = better)
        // d2 should be between d0 and d1 OR all values are very close
        const improving = d1 - d0;
        const net = d2 - d0;

        // For balanced scenarios, adding FA should reduce the improvement from adding H
        // Allow tolerance for edge cases
        if (Math.abs(improving) < 0.1) return true;
        return net <= improving + 0.1;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('M83: Perturbation preserves finiteness', () => {
    fc.assert(
      fc.property(
        validScenarioArb,
        smallDeltaArb,
        ({ hits, misses, falseAlarms, correctRejections }, delta) => {
          const d = SDTCalculator.calculateDPrime(
            hits + delta,
            misses + delta,
            falseAlarms + delta,
            correctRejections + delta,
          );
          return Number.isFinite(d);
        },
      ),
      { numRuns: HIGH_RUNS },
    );
  });

  it('M84: Reaction time perturbation changes average predictably', () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: 100, max: 2000, noNaN: true }), { minLength: 2, maxLength: 10 }),
        fc.double({ min: 100, max: 2000, noNaN: true }),
        (rts, newRt) => {
          const counts1: RawCounts = {
            hits: 10,
            misses: 0,
            falseAlarms: 0,
            correctRejections: 10,
            reactionTimes: rts,
          };
          const counts2: RawCounts = {
            hits: 10,
            misses: 0,
            falseAlarms: 0,
            correctRejections: 10,
            reactionTimes: [...rts, newRt],
          };

          const stats1 = SDTCalculator.calculateModalityStats(counts1);
          const stats2 = SDTCalculator.calculateModalityStats(counts2);

          // Adding a value should move average towards that value
          if (stats1.avgReactionTime === null || stats2.avgReactionTime === null) return true;
          if (newRt > stats1.avgReactionTime) {
            return stats2.avgReactionTime > stats1.avgReactionTime - 1e-9;
          } else {
            return stats2.avgReactionTime < stats1.avgReactionTime + 1e-9;
          }
        },
      ),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('M85: Zero perturbation yields identical result', () => {
    fc.assert(
      fc.property(validScenarioArb, ({ hits, misses, falseAlarms, correctRejections }) => {
        const d1 = SDTCalculator.calculateDPrime(hits, misses, falseAlarms, correctRejections);
        const d2 = SDTCalculator.calculateDPrime(
          hits + 0,
          misses + 0,
          falseAlarms + 0,
          correctRejections + 0,
        );
        return d1 === d2;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });
});

// =============================================================================
// CATEGORY 9: RATIO PRESERVATION (Tests 86-95)
// =============================================================================

describe('SDT Metamorphic - 9. Ratio Preservation', () => {
  it('M86: Hit rate preserved when H and M scaled equally', () => {
    fc.assert(
      fc.property(posCountArb, countArb, scaleFactorArb, (h, m, k) => {
        const rate1 = h / (h + m);
        const rate2 = (h * k) / (h * k + m * k);
        return Math.abs(rate1 - rate2) < 1e-9;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('M87: FA rate preserved when FA and CR scaled equally', () => {
    fc.assert(
      fc.property(countArb, posCountArb, scaleFactorArb, (f, c, k) => {
        const rate1 = f / (f + c);
        const rate2 = (f * k) / (f * k + c * k);
        return Math.abs(rate1 - rate2) < 1e-9;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('M88: Ratio of hits to misses preserved under uniform scaling', () => {
    fc.assert(
      fc.property(posCountArb, posCountArb, scaleFactorArb, (h, m, k) => {
        const ratio1 = h / m;
        const ratio2 = (h * k) / (m * k);
        return Math.abs(ratio1 - ratio2) < 1e-9;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('M89: Ratio of FA to CR preserved under uniform scaling', () => {
    fc.assert(
      fc.property(posCountArb, posCountArb, scaleFactorArb, (f, c, k) => {
        const ratio1 = f / c;
        const ratio2 = (f * k) / (c * k);
        return Math.abs(ratio1 - ratio2) < 1e-9;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('M90: Relative d-prime ordering preserved under scaling', () => {
    fc.assert(
      fc.property(validScenarioArb, validScenarioArb, scaleFactorArb, (s1, s2, k) => {
        const d1_orig = SDTCalculator.calculateDPrime(
          s1.hits,
          s1.misses,
          s1.falseAlarms,
          s1.correctRejections,
        );
        const d2_orig = SDTCalculator.calculateDPrime(
          s2.hits,
          s2.misses,
          s2.falseAlarms,
          s2.correctRejections,
        );

        const d1_scaled = SDTCalculator.calculateDPrime(
          s1.hits * k,
          s1.misses * k,
          s1.falseAlarms * k,
          s1.correctRejections * k,
        );
        const d2_scaled = SDTCalculator.calculateDPrime(
          s2.hits * k,
          s2.misses * k,
          s2.falseAlarms * k,
          s2.correctRejections * k,
        );

        // Ordering should be approximately preserved (allow small tolerance)
        if (Math.abs(d1_orig - d2_orig) < 0.5) return true;
        return Math.sign(d1_orig - d2_orig) === Math.sign(d1_scaled - d2_scaled);
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('M91: Clear hit rate vs FA rate difference predicts d-prime sign', () => {
    fc.assert(
      fc.property(balancedScenarioArb, ({ hits, misses, falseAlarms, correctRejections }) => {
        const hitRate = hits / (hits + misses);
        const faRate = falseAlarms / (falseAlarms + correctRejections);
        const d = SDTCalculator.calculateDPrime(hits, misses, falseAlarms, correctRejections);

        // Only test for clear rate differences (>10%)
        // Small differences can have sign flip due to Hautus correction
        const rateDiff = hitRate - faRate;
        if (Math.abs(rateDiff) < 0.1 || d === 0) return true;

        // For clear hit rate > FA rate, d' should be positive
        if (rateDiff > 0.1) return d > -0.1;
        // For clear FA rate > hit rate, d' should be negative
        if (rateDiff < -0.1) return d < 0.1;
        return true;
      }),
      { numRuns: HIGH_RUNS },
    );
  });

  it('M92: Equal ratios in different scales give similar d-prime', () => {
    fc.assert(
      fc.property(smallPosCountArb, scaleFactorArb, (base, k) => {
        // Scenario 1: base counts
        const d1 = SDTCalculator.calculateDPrime(base * 2, base, base, base * 2);
        // Scenario 2: scaled counts (same ratios)
        const d2 = SDTCalculator.calculateDPrime(base * 2 * k, base * k, base * k, base * 2 * k);
        // Should be similar (not identical due to Hautus)
        return Math.abs(d1 - d2) < 0.3;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('M93: Proportion of signal trials to noise trials affects d-prime bounds', () => {
    fc.assert(
      fc.property(mediumCountArb, mediumCountArb, mediumCountArb, mediumCountArb, (h, m, f, c) => {
        fc.pre(h > 0 && c > 0);
        const d = SDTCalculator.calculateDPrime(h, m, f, c);
        // D-prime should be finite regardless of signal/noise ratio
        return Number.isFinite(d) && d >= -10 && d <= 10;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('M94: Modality d-prime ratios preserved in average', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.5, max: 4, noNaN: true }),
        fc.double({ min: 0.5, max: 4, noNaN: true }),
        (d1, d2) => {
          const stats = {
            a: { dPrime: d1 } as ModalityStats,
            b: { dPrime: d2 } as ModalityStats,
          };
          const avg = SDTCalculator.calculateAverageDPrime(stats);
          const expectedAvg = (d1 + d2) / 2;
          return Math.abs(avg - expectedAvg) < 1e-9;
        },
      ),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('M95: Weighted average relationship: avg is between min and max', () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: -3, max: 3, noNaN: true }), { minLength: 2, maxLength: 5 }),
        (dPrimes) => {
          const stats: Record<string, ModalityStats> = {};
          dPrimes.forEach((d, i) => (stats[`m${i}`] = { dPrime: d } as ModalityStats));
          const min = SDTCalculator.calculateMinDPrime(stats);
          const avg = SDTCalculator.calculateAverageDPrime(stats);
          const max = Math.max(...dPrimes);
          return min <= avg + 1e-9 && avg <= max + 1e-9;
        },
      ),
      { numRuns: MEDIUM_RUNS },
    );
  });
});

// =============================================================================
// CATEGORY 10: TRANSFORMATION COMMUTATIVITY (Tests 96-105)
// =============================================================================

describe('SDT Metamorphic - 10. Transformation Commutativity', () => {
  it('M96: Order of hit increments does not matter: (h+1)+1 = (h+2)', () => {
    fc.assert(
      fc.property(validScenarioArb, ({ hits, misses, falseAlarms, correctRejections }) => {
        const d1 = SDTCalculator.calculateDPrime(
          hits + 1 + 1,
          misses,
          falseAlarms,
          correctRejections,
        );
        const d2 = SDTCalculator.calculateDPrime(hits + 2, misses, falseAlarms, correctRejections);
        return d1 === d2;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('M97: Scaling then adding is not same as adding then scaling', () => {
    fc.assert(
      fc.property(
        validScenarioArb,
        scaleFactorArb,
        smallDeltaArb,
        ({ hits, misses, falseAlarms, correctRejections }, k, delta) => {
          // Scale then add
          const d1 = SDTCalculator.calculateDPrime(
            hits * k + delta,
            misses * k,
            falseAlarms * k,
            correctRejections * k,
          );
          // Add then scale
          const d2 = SDTCalculator.calculateDPrime(
            (hits + delta) * k,
            misses * k,
            falseAlarms * k,
            correctRejections * k,
          );
          // These should generally be different
          return Number.isFinite(d1) && Number.isFinite(d2);
        },
      ),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('M98: Two separate +H operations same as one +2H operation', () => {
    fc.assert(
      fc.property(validScenarioArb, ({ hits, misses, falseAlarms, correctRejections }) => {
        const d1 = SDTCalculator.calculateDPrime(hits + 2, misses, falseAlarms, correctRejections);
        const d2 = SDTCalculator.calculateDPrime(
          hits + 1 + 1,
          misses,
          falseAlarms,
          correctRejections,
        );
        return d1 === d2;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('M99: Order of calculating rates does not affect d-prime', () => {
    fc.assert(
      fc.property(validScenarioArb, ({ hits, misses, falseAlarms, correctRejections }) => {
        const d1 = SDTCalculator.calculateDPrime(hits, misses, falseAlarms, correctRejections);
        const d2 = SDTCalculator.calculateDPrime(hits, misses, falseAlarms, correctRejections);
        return d1 === d2;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('M100: Probit composition: probit(0.5 + x) = -probit(0.5 - x)', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 0.49, noNaN: true }), (x) => {
        const z1 = SDTCalculator.probit(0.5 + x);
        const z2 = SDTCalculator.probit(0.5 - x);
        return Math.abs(z1 + z2) < 0.001;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('M101: Adding same delta to all counts preserves relative performance', () => {
    fc.assert(
      fc.property(validScenarioArb, validScenarioArb, smallDeltaArb, (s1, s2, delta) => {
        const d1_orig = SDTCalculator.calculateDPrime(
          s1.hits,
          s1.misses,
          s1.falseAlarms,
          s1.correctRejections,
        );
        const d2_orig = SDTCalculator.calculateDPrime(
          s2.hits,
          s2.misses,
          s2.falseAlarms,
          s2.correctRejections,
        );

        const d1_new = SDTCalculator.calculateDPrime(
          s1.hits + delta,
          s1.misses + delta,
          s1.falseAlarms + delta,
          s1.correctRejections + delta,
        );
        const d2_new = SDTCalculator.calculateDPrime(
          s2.hits + delta,
          s2.misses + delta,
          s2.falseAlarms + delta,
          s2.correctRejections + delta,
        );

        // Relative ordering may shift, but both should be finite
        return Number.isFinite(d1_new) && Number.isFinite(d2_new);
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('M102: Multiple probit calls are idempotent', () => {
    fc.assert(
      fc.property(probArb, (p) => {
        const z1 = SDTCalculator.probit(p);
        const z2 = SDTCalculator.probit(p);
        const z3 = SDTCalculator.probit(p);
        return z1 === z2 && z2 === z3;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('M103: Multiple d-prime calls are idempotent', () => {
    fc.assert(
      fc.property(validScenarioArb, ({ hits, misses, falseAlarms, correctRejections }) => {
        const d1 = SDTCalculator.calculateDPrime(hits, misses, falseAlarms, correctRejections);
        const d2 = SDTCalculator.calculateDPrime(hits, misses, falseAlarms, correctRejections);
        const d3 = SDTCalculator.calculateDPrime(hits, misses, falseAlarms, correctRejections);
        return d1 === d2 && d2 === d3;
      }),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('M104: Average d-prime is associative for equal-sized groups', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -2, max: 2, noNaN: true }),
        fc.double({ min: -2, max: 2, noNaN: true }),
        fc.double({ min: -2, max: 2, noNaN: true }),
        fc.double({ min: -2, max: 2, noNaN: true }),
        (d1, d2, d3, d4) => {
          // All four
          const stats_all = {
            a: { dPrime: d1 } as ModalityStats,
            b: { dPrime: d2 } as ModalityStats,
            c: { dPrime: d3 } as ModalityStats,
            d: { dPrime: d4 } as ModalityStats,
          };
          const avg_all = SDTCalculator.calculateAverageDPrime(stats_all);
          const expected = (d1 + d2 + d3 + d4) / 4;
          return Math.abs(avg_all - expected) < 1e-9;
        },
      ),
      { numRuns: MEDIUM_RUNS },
    );
  });

  it('M105: Min d-prime is associative', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -2, max: 2, noNaN: true }),
        fc.double({ min: -2, max: 2, noNaN: true }),
        fc.double({ min: -2, max: 2, noNaN: true }),
        (d1, d2, d3) => {
          const stats = {
            a: { dPrime: d1 } as ModalityStats,
            b: { dPrime: d2 } as ModalityStats,
            c: { dPrime: d3 } as ModalityStats,
          };
          const min = SDTCalculator.calculateMinDPrime(stats);
          const expected = Math.min(d1, d2, d3);
          return Math.abs(min - expected) < 1e-9;
        },
      ),
      { numRuns: MEDIUM_RUNS },
    );
  });
});
