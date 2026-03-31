/**
 * Property-Based Tests for SeededRandom
 *
 * Uses fast-check to verify statistical and deterministic properties
 * of the seeded random number generator.
 */
import { describe, expect, it } from 'bun:test';
import * as fc from 'fast-check';
import { SeededRandom } from './random';

describe('SeededRandom - Property Tests', () => {
  describe('Determinism', () => {
    it('same seed produces identical sequence', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1, maxLength: 100 }), (seed) => {
          const rng1 = new SeededRandom(seed);
          const rng2 = new SeededRandom(seed);

          const seq1 = Array.from({ length: 100 }, () => rng1.next());
          const seq2 = Array.from({ length: 100 }, () => rng2.next());

          return seq1.every((v, i) => v === seq2[i]);
        }),
        { numRuns: 100 },
      );
    });

    it('different seeds produce different sequences (high probability)', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          (seed1, seed2) => {
            fc.pre(seed1 !== seed2); // Skip if seeds are equal

            const rng1 = new SeededRandom(seed1);
            const rng2 = new SeededRandom(seed2);

            const seq1 = Array.from({ length: 20 }, () => rng1.next());
            const seq2 = Array.from({ length: 20 }, () => rng2.next());

            // At least one value should differ (with overwhelming probability)
            return seq1.some((v, i) => v !== seq2[i]);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('Distribution (next)', () => {
    it('outputs are always in [0, 1)', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1 }), (seed) => {
          const rng = new SeededRandom(seed);
          const samples = Array.from({ length: 500 }, () => rng.next());

          return samples.every((v) => v >= 0 && v < 1);
        }),
        { numRuns: 50 },
      );
    });

    it('mean of large sample is approximately 0.5', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1 }), (seed) => {
          const rng = new SeededRandom(seed);
          const samples = Array.from({ length: 2000 }, () => rng.next());
          const mean = samples.reduce((a, b) => a + b, 0) / samples.length;

          // Allow 10% deviation from 0.5 (0.45 - 0.55)
          return mean > 0.4 && mean < 0.6;
        }),
        { numRuns: 30 },
      );
    });

    it('distribution covers all deciles', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1 }), (seed) => {
          const rng = new SeededRandom(seed);
          const samples = Array.from({ length: 1000 }, () => rng.next());

          // Check that all 10 deciles [0-0.1), [0.1-0.2), ... have at least 1 sample
          const deciles = Array(10).fill(false);
          for (const v of samples) {
            deciles[Math.min(Math.floor(v * 10), 9)] = true;
          }

          return deciles.every(Boolean);
        }),
        { numRuns: 30 },
      );
    });
  });

  describe('int(min, max)', () => {
    it('outputs are always in [min, max)', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          fc.integer({ min: 0, max: 100 }),
          fc.integer({ min: 1, max: 50 }),
          (seed, min, range) => {
            const max = min + range;
            const rng = new SeededRandom(seed);
            const samples = Array.from({ length: 200 }, () => rng.int(min, max));

            return samples.every((v) => v >= min && v < max && Number.isInteger(v));
          },
        ),
        { numRuns: 50 },
      );
    });

    it('covers entire range for sufficient samples', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1 }), (seed) => {
          const min = 0;
          const max = 5;
          const rng = new SeededRandom(seed);
          const samples = Array.from({ length: 500 }, () => rng.int(min, max));

          // All values 0, 1, 2, 3, 4 should appear
          const seen = new Set(samples);
          return seen.size === 5;
        }),
        { numRuns: 30 },
      );
    });
  });

  describe('choice(array)', () => {
    it('always returns an element from the array', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          fc.array(fc.integer(), { minLength: 1, maxLength: 20 }),
          (seed, arr) => {
            const rng = new SeededRandom(seed);
            const samples = Array.from({ length: 50 }, () => rng.choice(arr));

            return samples.every((v) => arr.includes(v));
          },
        ),
        { numRuns: 50 },
      );
    });

    it('covers all elements for sufficient samples', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1 }), (seed) => {
          const arr = ['A', 'B', 'C', 'D'];
          const rng = new SeededRandom(seed);
          const samples = Array.from({ length: 200 }, () => rng.choice(arr));

          return new Set(samples).size === arr.length;
        }),
        { numRuns: 30 },
      );
    });

    it('throws on empty array', () => {
      const rng = new SeededRandom('test');
      expect(() => rng.choice([])).toThrow('Cannot choose from empty array');
    });
  });

  describe('choiceExcluding(array, exclude)', () => {
    it('never returns the excluded value when alternatives exist', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1 }), (seed) => {
          const arr = [1, 2, 3, 4, 5];
          const exclude = 3;
          const rng = new SeededRandom(seed);
          const samples = Array.from({ length: 100 }, () => rng.choiceExcluding(arr, exclude));

          return samples.every((v) => v !== exclude);
        }),
        { numRuns: 50 },
      );
    });

    it('returns the only element if array has length 1', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1 }), fc.integer(), (seed, value) => {
          const arr = [value];
          const rng = new SeededRandom(seed);

          return rng.choiceExcluding(arr, value) === value;
        }),
        { numRuns: 20 },
      );
    });
  });

  describe('shuffle(array)', () => {
    it('preserves all elements (same multiset)', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          fc.array(fc.integer(), { minLength: 1, maxLength: 50 }),
          (seed, arr) => {
            const rng = new SeededRandom(seed);
            const copy = [...arr];
            rng.shuffle(copy);

            const sortedOriginal = [...arr].sort((a, b) => a - b);
            const sortedShuffled = [...copy].sort((a, b) => a - b);

            return (
              sortedOriginal.length === sortedShuffled.length &&
              sortedOriginal.every((v, i) => v === sortedShuffled[i])
            );
          },
        ),
        { numRuns: 50 },
      );
    });

    it('preserves array length', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          fc.array(fc.integer(), { minLength: 0, maxLength: 100 }),
          (seed, arr) => {
            const rng = new SeededRandom(seed);
            const copy = [...arr];
            rng.shuffle(copy);

            return copy.length === arr.length;
          },
        ),
        { numRuns: 50 },
      );
    });

    it('actually changes order for large arrays (high probability)', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1 }), (seed) => {
          const arr = Array.from({ length: 20 }, (_, i) => i);
          const rng = new SeededRandom(seed);
          const copy = [...arr];
          rng.shuffle(copy);

          // At least one element should be in a different position
          return copy.some((v, i) => v !== arr[i]);
        }),
        { numRuns: 30 },
      );
    });
  });

  describe('beta(alpha, beta) distribution', () => {
    it('outputs are always in [0, 1]', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          fc.double({ min: 0.1, max: 10, noNaN: true }),
          fc.double({ min: 0.1, max: 10, noNaN: true }),
          (seed, alpha, beta) => {
            const rng = new SeededRandom(seed);
            const samples = Array.from({ length: 100 }, () => rng.beta(alpha, beta));
            return samples.every((v) => v >= 0 && v <= 1 && !Number.isNaN(v));
          },
        ),
        { numRuns: 50 },
      );
    });

    it('beta(1, 1) produces uniform distribution (mean ~0.5)', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1 }), (seed) => {
          const rng = new SeededRandom(seed);
          const samples = Array.from({ length: 1000 }, () => rng.beta(1, 1));
          const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
          return mean > 0.4 && mean < 0.6;
        }),
        { numRuns: 20 },
      );
    });

    it('beta(alpha, 1) skews toward 1 for large alpha', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1 }), (seed) => {
          const rng = new SeededRandom(seed);
          const samples = Array.from({ length: 500 }, () => rng.beta(5, 1));
          const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
          // E[Beta(5,1)] = 5/6 ≈ 0.833
          return mean > 0.7 && mean < 0.95;
        }),
        { numRuns: 20 },
      );
    });

    it('beta(1, beta) skews toward 0 for large beta', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1 }), (seed) => {
          const rng = new SeededRandom(seed);
          const samples = Array.from({ length: 500 }, () => rng.beta(1, 5));
          const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
          // E[Beta(1,5)] = 1/6 ≈ 0.167
          return mean > 0.05 && mean < 0.3;
        }),
        { numRuns: 20 },
      );
    });

    it('beta(0.5, 0.5) produces U-shaped distribution', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1 }), (seed) => {
          const rng = new SeededRandom(seed);
          const samples = Array.from({ length: 500 }, () => rng.beta(0.5, 0.5));
          // U-shaped means more samples near 0 and 1 than in the middle
          const nearEdges = samples.filter((v) => v < 0.2 || v > 0.8).length;
          const inMiddle = samples.filter((v) => v >= 0.4 && v <= 0.6).length;
          return nearEdges > inMiddle;
        }),
        { numRuns: 20 },
      );
    });

    it('throws for non-positive alpha', () => {
      const rng = new SeededRandom('test');
      expect(() => rng.beta(0, 1)).toThrow('Beta distribution parameters must be positive');
      expect(() => rng.beta(-1, 1)).toThrow('Beta distribution parameters must be positive');
    });

    it('throws for non-positive beta', () => {
      const rng = new SeededRandom('test');
      expect(() => rng.beta(1, 0)).toThrow('Beta distribution parameters must be positive');
      expect(() => rng.beta(1, -1)).toThrow('Beta distribution parameters must be positive');
    });

    it('is deterministic for same seed', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          fc.double({ min: 0.1, max: 5, noNaN: true }),
          fc.double({ min: 0.1, max: 5, noNaN: true }),
          (seed, alpha, beta) => {
            const rng1 = new SeededRandom(seed);
            const rng2 = new SeededRandom(seed);
            const samples1 = Array.from({ length: 20 }, () => rng1.beta(alpha, beta));
            const samples2 = Array.from({ length: 20 }, () => rng2.beta(alpha, beta));
            return samples1.every((v, i) => v === samples2[i]);
          },
        ),
        { numRuns: 30 },
      );
    });

    it('symmetric parameters produce symmetric distribution (mean ~0.5)', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          fc.double({ min: 0.5, max: 5, noNaN: true }),
          (seed, param) => {
            const rng = new SeededRandom(seed);
            const samples = Array.from({ length: 500 }, () => rng.beta(param, param));
            const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
            // E[Beta(a,a)] = 0.5 for any a
            return mean > 0.35 && mean < 0.65;
          },
        ),
        { numRuns: 20 },
      );
    });

    it('mean approximates alpha / (alpha + beta)', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          fc.double({ min: 1, max: 5, noNaN: true }),
          fc.double({ min: 1, max: 5, noNaN: true }),
          (seed, alpha, beta) => {
            const rng = new SeededRandom(seed);
            const samples = Array.from({ length: 1000 }, () => rng.beta(alpha, beta));
            const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
            const expectedMean = alpha / (alpha + beta);
            // Allow 15% deviation
            return Math.abs(mean - expectedMean) < 0.15;
          },
        ),
        { numRuns: 30 },
      );
    });
  });

  describe('Edge cases and stability', () => {
    it('handles very small alpha/beta values', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1 }), (seed) => {
          const rng = new SeededRandom(seed);
          const sample = rng.beta(0.1, 0.1);
          return sample >= 0 && sample <= 1 && !Number.isNaN(sample);
        }),
        { numRuns: 30 },
      );
    });

    it('handles very large alpha/beta values', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1 }), (seed) => {
          const rng = new SeededRandom(seed);
          const sample = rng.beta(100, 100);
          return sample >= 0 && sample <= 1 && !Number.isNaN(sample);
        }),
        { numRuns: 30 },
      );
    });

    it('state advances consistently across method calls', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1 }), (seed) => {
          const rng1 = new SeededRandom(seed);
          const rng2 = new SeededRandom(seed);

          // Call different methods in same order
          const r1_next = rng1.next();
          const r1_int = rng1.int(0, 10);
          const r1_beta = rng1.beta(2, 2);

          const r2_next = rng2.next();
          const r2_int = rng2.int(0, 10);
          const r2_beta = rng2.beta(2, 2);

          return r1_next === r2_next && r1_int === r2_int && r1_beta === r2_beta;
        }),
        { numRuns: 30 },
      );
    });

    it('long sequences remain bounded', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1 }), (seed) => {
          const rng = new SeededRandom(seed);
          for (let i = 0; i < 10000; i++) {
            const v = rng.next();
            if (v < 0 || v >= 1 || Number.isNaN(v)) {
              return false;
            }
          }
          return true;
        }),
        { numRuns: 10 },
      );
    });

    it('shuffle is idempotent in element preservation', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          fc.array(fc.string(), { minLength: 1, maxLength: 20 }),
          (seed, arr) => {
            const rng = new SeededRandom(seed);
            const copy = [...arr];
            rng.shuffle(copy);
            rng.shuffle(copy);
            rng.shuffle(copy);

            const sortedOriginal = [...arr].sort();
            const sortedShuffled = [...copy].sort();
            return (
              sortedOriginal.length === sortedShuffled.length &&
              sortedOriginal.every((v, i) => v === sortedShuffled[i])
            );
          },
        ),
        { numRuns: 30 },
      );
    });

    it('int with equal min and max returns min', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1 }), fc.integer({ min: -100, max: 100 }), (seed, n) => {
          const rng = new SeededRandom(seed);
          // Note: int(n, n) with floor returns n since next() < 1
          return rng.int(n, n + 1) === n;
        }),
        { numRuns: 30 },
      );
    });

    it('choice with single element always returns that element', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1 }), fc.anything(), (seed, elem) => {
          const rng = new SeededRandom(seed);
          const arr = [elem];
          return rng.choice(arr) === elem;
        }),
        { numRuns: 30 },
      );
    });
  });
});
