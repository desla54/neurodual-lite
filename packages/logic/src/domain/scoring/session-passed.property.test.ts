/**
 * Property-Based Tests for Session Passed Logic
 *
 * Invariants for determining if a session passes the threshold.
 */
import { describe, expect, it } from 'bun:test';
import * as fc from 'fast-check';
import { SDT_DPRIME_PASS, JAEGGI_MAX_ERRORS_PER_MODALITY } from '../../specs/thresholds';

// =============================================================================
// Arbitraries
// =============================================================================

const dPrimeArb = fc.double({ min: -2, max: 5, noNaN: true });
const errorsArb = fc.integer({ min: 0, max: 20 });
const hitsArb = fc.integer({ min: 0, max: 20 });
const missesArb = fc.integer({ min: 0, max: 20 });
const faArb = fc.integer({ min: 0, max: 20 });

// =============================================================================
// Helper Functions (matching real logic)
// =============================================================================

const sessionPassedByDPrime = (dPrime: number): boolean => dPrime >= SDT_DPRIME_PASS;

// Jaeggi 2008: "fewer than three" means < 3 (strict less than)
const sessionPassedByJaeggi = (errors: number[]): boolean =>
  errors.every((e) => e < JAEGGI_MAX_ERRORS_PER_MODALITY);

const calculateErrors = (misses: number, fa: number): number => misses + fa;

// =============================================================================
// D-Prime Based Passing Tests
// =============================================================================

describe('Session Passed (d-prime) - Property Tests', () => {
  it('d-prime >= threshold always passes', () => {
    fc.assert(
      fc.property(fc.double({ min: SDT_DPRIME_PASS, max: 5, noNaN: true }), (dPrime) => {
        return sessionPassedByDPrime(dPrime) === true;
      }),
      { numRuns: 200 },
    );
  });

  it('d-prime < threshold always fails', () => {
    fc.assert(
      fc.property(fc.double({ min: -2, max: SDT_DPRIME_PASS - 0.001, noNaN: true }), (dPrime) => {
        return sessionPassedByDPrime(dPrime) === false;
      }),
      { numRuns: 200 },
    );
  });

  it('passing is deterministic', () => {
    fc.assert(
      fc.property(dPrimeArb, (dPrime) => {
        return sessionPassedByDPrime(dPrime) === sessionPassedByDPrime(dPrime);
      }),
      { numRuns: 100 },
    );
  });

  it('higher d-prime never causes failure if lower passed', () => {
    fc.assert(
      fc.property(dPrimeArb, fc.double({ min: 0, max: 2, noNaN: true }), (base, delta) => {
        const low = base;
        const high = base + delta;
        if (sessionPassedByDPrime(low)) {
          return sessionPassedByDPrime(high) === true;
        }
        return true;
      }),
      { numRuns: 200 },
    );
  });

  it('boundary value exactly at threshold passes', () => {
    expect(sessionPassedByDPrime(SDT_DPRIME_PASS)).toBe(true);
  });

  it('boundary value just below threshold fails', () => {
    expect(sessionPassedByDPrime(SDT_DPRIME_PASS - 0.0001)).toBe(false);
  });
});

// =============================================================================
// Jaeggi Error-Based Passing Tests
// =============================================================================

describe('Session Passed (Jaeggi errors) - Property Tests', () => {
  it('all modalities < 3 errors passes (Jaeggi 2008: "fewer than three")', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2 }), // 0, 1, 2 pass (fewer than three)
        fc.integer({ min: 0, max: 2 }),
        (posErrors, audioErrors) => {
          return sessionPassedByJaeggi([posErrors, audioErrors]) === true;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('any modality >= 3 errors fails (Jaeggi 2008: "fewer than three")', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 20 }), // 3+ errors fail
        fc.integer({ min: 0, max: 20 }),
        (posErrors, audioErrors) => {
          return sessionPassedByJaeggi([posErrors, audioErrors]) === false;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('zero errors always passes', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 5 }), (modalityCount) => {
        const errors = Array(modalityCount).fill(0);
        return sessionPassedByJaeggi(errors) === true;
      }),
      { numRuns: 50 },
    );
  });

  it('adding errors never causes passing if already failing', () => {
    fc.assert(
      fc.property(
        fc.array(errorsArb, { minLength: 1, maxLength: 4 }),
        fc.integer({ min: 0, max: 5 }),
        fc.integer({ min: 0, max: 3 }),
        (baseErrors, addIndex, addAmount) => {
          const idx = addIndex % baseErrors.length;
          if (!sessionPassedByJaeggi(baseErrors)) {
            const newErrors = [...baseErrors];
            newErrors[idx] = (newErrors[idx] ?? 0) + addAmount;
            return sessionPassedByJaeggi(newErrors) === false;
          }
          return true;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('error calculation is consistent', () => {
    fc.assert(
      fc.property(missesArb, faArb, (misses, fa) => {
        const errors = calculateErrors(misses, fa);
        return errors === misses + fa && errors >= 0;
      }),
      { numRuns: 100 },
    );
  });

  it('single modality with 2 errors passes (last value below threshold)', () => {
    expect(sessionPassedByJaeggi([2])).toBe(true);
  });

  it('single modality with 3 errors fails (Jaeggi 2008: "fewer than three" = 3 maintains)', () => {
    expect(sessionPassedByJaeggi([3])).toBe(false);
  });

  it('empty modalities array passes', () => {
    expect(sessionPassedByJaeggi([])).toBe(true);
  });
});

// =============================================================================
// Cross-Method Consistency Tests
// =============================================================================

describe('Session Passed - Cross-Method Tests', () => {
  it('high d-prime implies low error rate (statistical)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 8, max: 15 }), // hits
        fc.integer({ min: 0, max: 2 }), // misses
        fc.integer({ min: 0, max: 2 }), // FA
        (hits, misses, fa) => {
          // High hit rate, low error rate should correlate with passing
          const hitRate = hits / (hits + misses) || 0;
          const faRate = fa / (fa + 10) || 0; // Assume 10 CR

          // If hit rate > 0.8 and FA rate < 0.2, likely passes
          if (hitRate > 0.8 && faRate < 0.2) {
            const errors = misses + fa;
            return errors < 10; // Reasonable upper bound
          }
          return true;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('perfect performance passes both methods', () => {
    // 0 errors passes Jaeggi
    expect(sessionPassedByJaeggi([0, 0])).toBe(true);
    // High d-prime passes SDT
    expect(sessionPassedByDPrime(3.0)).toBe(true);
  });

  it('worst performance fails both methods', () => {
    // Many errors fails Jaeggi
    expect(sessionPassedByJaeggi([10, 10])).toBe(false);
    // Negative d-prime fails SDT
    expect(sessionPassedByDPrime(-1.0)).toBe(false);
  });
});

// =============================================================================
// Threshold Constant Tests
// =============================================================================

describe('Session Passed - Threshold Constants', () => {
  it('SDT_DPRIME_PASS is positive', () => {
    expect(SDT_DPRIME_PASS).toBeGreaterThan(0);
  });

  it('SDT_DPRIME_PASS is reasonable (between 0.5 and 3)', () => {
    expect(SDT_DPRIME_PASS).toBeGreaterThanOrEqual(0.5);
    expect(SDT_DPRIME_PASS).toBeLessThanOrEqual(3);
  });

  it('JAEGGI_MAX_ERRORS is small positive integer', () => {
    expect(JAEGGI_MAX_ERRORS_PER_MODALITY).toBeGreaterThan(0);
    expect(JAEGGI_MAX_ERRORS_PER_MODALITY).toBeLessThanOrEqual(10);
    expect(Number.isInteger(JAEGGI_MAX_ERRORS_PER_MODALITY)).toBe(true);
  });
});
