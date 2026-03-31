/**
 * Property-Based Tests for Mathematical Utilities
 *
 * Tests mathematical invariants for scoring, statistics, and calculations.
 */
import { describe, it } from 'bun:test';
import * as fc from 'fast-check';

// =============================================================================
// Numeric Arbitraries
// =============================================================================

const finiteNumberArb = fc.double({ min: -1e10, max: 1e10, noNaN: true });
const positiveNumberArb = fc.double({ min: 0.001, max: 1e10, noNaN: true });
const probabilityArb = fc.double({ min: 0.0001, max: 0.9999, noNaN: true });
const percentArb = fc.double({ min: 0, max: 100, noNaN: true });
const integerArb = fc.integer({ min: -1000000, max: 1000000 });
const positiveIntArb = fc.integer({ min: 1, max: 1000000 });

// =============================================================================
// Clamp Function Property Tests
// =============================================================================

const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value));
};

describe('Clamp Function - Property Tests', () => {
  it('clamp result is always between min and max', () => {
    fc.assert(
      fc.property(finiteNumberArb, finiteNumberArb, finiteNumberArb, (value, a, b) => {
        const [min, max] = a < b ? [a, b] : [b, a];
        const result = clamp(value, min, max);
        return result >= min && result <= max;
      }),
      { numRuns: 200 },
    );
  });

  it('clamp is idempotent', () => {
    fc.assert(
      fc.property(finiteNumberArb, finiteNumberArb, finiteNumberArb, (value, a, b) => {
        const [min, max] = a < b ? [a, b] : [b, a];
        const result1 = clamp(value, min, max);
        const result2 = clamp(result1, min, max);
        return result1 === result2;
      }),
      { numRuns: 200 },
    );
  });

  it('clamp preserves value if already in range', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 100, noNaN: true }), (value) => {
        const result = clamp(value, 0, 100);
        return result === value;
      }),
      { numRuns: 100 },
    );
  });

  it('clamp(min, min, max) = min', () => {
    fc.assert(
      fc.property(finiteNumberArb, finiteNumberArb, (a, b) => {
        const [min, max] = a < b ? [a, b] : [b, a];
        return clamp(min, min, max) === min;
      }),
      { numRuns: 100 },
    );
  });

  it('clamp(max, min, max) = max', () => {
    fc.assert(
      fc.property(finiteNumberArb, finiteNumberArb, (a, b) => {
        const [min, max] = a < b ? [a, b] : [b, a];
        return clamp(max, min, max) === max;
      }),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// Linear Interpolation Property Tests
// =============================================================================

const lerp = (a: number, b: number, t: number): number => {
  return a + (b - a) * t;
};

describe('Linear Interpolation - Property Tests', () => {
  it('lerp(a, b, 0) = a', () => {
    fc.assert(
      fc.property(finiteNumberArb, finiteNumberArb, (a, b) => {
        return lerp(a, b, 0) === a;
      }),
      { numRuns: 100 },
    );
  });

  it('lerp(a, b, 1) = b', () => {
    fc.assert(
      fc.property(finiteNumberArb, finiteNumberArb, (a, b) => {
        const result = lerp(a, b, 1);
        return Math.abs(result - b) < 1e-10;
      }),
      { numRuns: 100 },
    );
  });

  it('lerp(a, b, 0.5) = (a + b) / 2', () => {
    fc.assert(
      fc.property(finiteNumberArb, finiteNumberArb, (a, b) => {
        const result = lerp(a, b, 0.5);
        const expected = (a + b) / 2;
        return Math.abs(result - expected) < 1e-10;
      }),
      { numRuns: 100 },
    );
  });

  it('lerp is monotonic in t', () => {
    fc.assert(
      fc.property(
        finiteNumberArb,
        fc.double({ min: 0.001, max: 1e6, noNaN: true }),
        fc.double({ min: 0, max: 0.5, noNaN: true }),
        fc.double({ min: 0.5, max: 1, noNaN: true }),
        (a, b, t1, t2) => {
          // When a < a + b
          const r1 = lerp(a, a + b, t1);
          const r2 = lerp(a, a + b, t2);
          return r1 <= r2;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('lerp with t in [0, 1] stays in range [a, b]', () => {
    fc.assert(
      fc.property(
        finiteNumberArb,
        finiteNumberArb,
        fc.double({ min: 0, max: 1, noNaN: true }),
        (a, b, t) => {
          const result = lerp(a, b, t);
          const [min, max] = a < b ? [a, b] : [b, a];
          return result >= min - 1e-10 && result <= max + 1e-10;
        },
      ),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// Normalization Property Tests
// =============================================================================

const normalize = (value: number, min: number, max: number): number => {
  if (max === min) return 0;
  return (value - min) / (max - min);
};

describe('Normalization - Property Tests', () => {
  it('normalize(min, min, max) = 0', () => {
    fc.assert(
      fc.property(finiteNumberArb, positiveNumberArb, (min, range) => {
        const max = min + range;
        return normalize(min, min, max) === 0;
      }),
      { numRuns: 100 },
    );
  });

  it('normalize(max, min, max) = 1', () => {
    fc.assert(
      fc.property(finiteNumberArb, positiveNumberArb, (min, range) => {
        const max = min + range;
        const result = normalize(max, min, max);
        return Math.abs(result - 1) < 1e-10;
      }),
      { numRuns: 100 },
    );
  });

  it('normalize then denormalize returns original', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1000, max: 1000, noNaN: true }),
        fc.double({ min: -1000, max: 1000, noNaN: true }),
        fc.double({ min: 0.1, max: 1000, noNaN: true }),
        (value, min, range) => {
          const max = min + range;
          const normalized = normalize(value, min, max);
          const denormalized = lerp(min, max, normalized);
          // Use relative tolerance for larger values
          const tolerance = Math.max(1e-9, Math.abs(value) * 1e-10);
          return Math.abs(denormalized - value) < tolerance;
        },
      ),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// Average/Mean Property Tests
// =============================================================================

const mean = (values: number[]): number => {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
};

describe('Mean/Average - Property Tests', () => {
  it('mean of single value is the value', () => {
    fc.assert(
      fc.property(finiteNumberArb, (value) => {
        return mean([value]) === value;
      }),
      { numRuns: 100 },
    );
  });

  it('mean is between min and max', () => {
    fc.assert(
      fc.property(fc.array(finiteNumberArb, { minLength: 1, maxLength: 50 }), (values) => {
        const avg = mean(values);
        const min = Math.min(...values);
        const max = Math.max(...values);
        return avg >= min - 1e-10 && avg <= max + 1e-10;
      }),
      { numRuns: 100 },
    );
  });

  it('mean of equal values is that value', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1000, max: 1000, noNaN: true }),
        fc.integer({ min: 1, max: 20 }),
        (value, count) => {
          const values = Array(count).fill(value);
          const tolerance = Math.max(1e-10, Math.abs(value) * 1e-12);
          return Math.abs(mean(values) - value) < tolerance;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('mean is commutative (order independent)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: -1000, max: 1000, noNaN: true }), {
          minLength: 2,
          maxLength: 20,
        }),
        (values) => {
          const avg1 = mean(values);
          const reversed = [...values].reverse();
          const avg2 = mean(reversed);
          // Use relative tolerance for floating point arithmetic
          const tolerance = Math.max(1e-10, (Math.abs(avg1) + Math.abs(avg2)) * 1e-12);
          return Math.abs(avg1 - avg2) < tolerance;
        },
      ),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// Variance/StdDev Property Tests
// =============================================================================

const variance = (values: number[]): number => {
  if (values.length <= 1) return 0;
  const avg = mean(values);
  const squaredDiffs = values.map((v) => (v - avg) ** 2);
  return mean(squaredDiffs);
};

const stdDev = (values: number[]): number => {
  return Math.sqrt(variance(values));
};

describe('Variance/StdDev - Property Tests', () => {
  it('variance is non-negative', () => {
    fc.assert(
      fc.property(fc.array(finiteNumberArb, { minLength: 1, maxLength: 50 }), (values) => {
        return variance(values) >= 0;
      }),
      { numRuns: 100 },
    );
  });

  it('variance of equal values is 0', () => {
    fc.assert(
      fc.property(finiteNumberArb, fc.integer({ min: 2, max: 20 }), (value, count) => {
        const values = Array(count).fill(value);
        return variance(values) < 1e-10;
      }),
      { numRuns: 100 },
    );
  });

  it('stdDev is non-negative', () => {
    fc.assert(
      fc.property(fc.array(finiteNumberArb, { minLength: 1, maxLength: 50 }), (values) => {
        return stdDev(values) >= 0;
      }),
      { numRuns: 100 },
    );
  });

  it('stdDev = sqrt(variance)', () => {
    fc.assert(
      fc.property(fc.array(finiteNumberArb, { minLength: 2, maxLength: 30 }), (values) => {
        const v = variance(values);
        const sd = stdDev(values);
        return Math.abs(sd - Math.sqrt(v)) < 1e-10;
      }),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// Min/Max Property Tests
// =============================================================================

describe('Min/Max - Property Tests', () => {
  it('min <= max', () => {
    fc.assert(
      fc.property(fc.array(finiteNumberArb, { minLength: 1, maxLength: 50 }), (values) => {
        const min = Math.min(...values);
        const max = Math.max(...values);
        return min <= max;
      }),
      { numRuns: 100 },
    );
  });

  it('min and max are elements of the array', () => {
    fc.assert(
      fc.property(fc.array(finiteNumberArb, { minLength: 1, maxLength: 50 }), (values) => {
        const min = Math.min(...values);
        const max = Math.max(...values);
        return values.includes(min) && values.includes(max);
      }),
      { numRuns: 100 },
    );
  });

  it('single element: min = max = element', () => {
    fc.assert(
      fc.property(finiteNumberArb, (value) => {
        const values = [value];
        return Math.min(...values) === value && Math.max(...values) === value;
      }),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// Percentage Conversion Property Tests
// =============================================================================

describe('Percentage Conversion - Property Tests', () => {
  it('ratio * 100 = percentage', () => {
    fc.assert(
      fc.property(probabilityArb, (ratio) => {
        const percentage = ratio * 100;
        return percentage >= 0 && percentage <= 100;
      }),
      { numRuns: 100 },
    );
  });

  it('percentage / 100 = ratio', () => {
    fc.assert(
      fc.property(percentArb, (percentage) => {
        const ratio = percentage / 100;
        return ratio >= 0 && ratio <= 1;
      }),
      { numRuns: 100 },
    );
  });

  it('round trip: (ratio * 100) / 100 = ratio', () => {
    fc.assert(
      fc.property(probabilityArb, (ratio) => {
        const result = (ratio * 100) / 100;
        return Math.abs(result - ratio) < 1e-10;
      }),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// Rounding Property Tests
// =============================================================================

describe('Rounding - Property Tests', () => {
  it('floor <= value <= ceil', () => {
    fc.assert(
      fc.property(finiteNumberArb, (value) => {
        return Math.floor(value) <= value && value <= Math.ceil(value);
      }),
      { numRuns: 100 },
    );
  });

  it('round is within 0.5 of value', () => {
    fc.assert(
      fc.property(finiteNumberArb, (value) => {
        return Math.abs(Math.round(value) - value) <= 0.5;
      }),
      { numRuns: 100 },
    );
  });

  it('floor and ceil differ by at most 1', () => {
    fc.assert(
      fc.property(finiteNumberArb, (value) => {
        return Math.ceil(value) - Math.floor(value) <= 1;
      }),
      { numRuns: 100 },
    );
  });

  it('floor of integer is the integer', () => {
    fc.assert(
      fc.property(integerArb, (value) => {
        return Math.floor(value) === value;
      }),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// Absolute Value Property Tests
// =============================================================================

describe('Absolute Value - Property Tests', () => {
  it('abs is non-negative', () => {
    fc.assert(
      fc.property(finiteNumberArb, (value) => {
        return Math.abs(value) >= 0;
      }),
      { numRuns: 100 },
    );
  });

  it('abs(x) = abs(-x)', () => {
    fc.assert(
      fc.property(finiteNumberArb, (value) => {
        return Math.abs(value) === Math.abs(-value);
      }),
      { numRuns: 100 },
    );
  });

  it('abs(x) >= x', () => {
    fc.assert(
      fc.property(finiteNumberArb, (value) => {
        return Math.abs(value) >= value;
      }),
      { numRuns: 100 },
    );
  });

  it('abs(positive) = positive', () => {
    fc.assert(
      fc.property(positiveNumberArb, (value) => {
        return Math.abs(value) === value;
      }),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// Sign Function Property Tests
// =============================================================================

describe('Sign Function - Property Tests', () => {
  it('sign is in {-1, 0, 1}', () => {
    fc.assert(
      fc.property(finiteNumberArb, (value) => {
        const s = Math.sign(value);
        return s === -1 || s === 0 || s === 1;
      }),
      { numRuns: 100 },
    );
  });

  it('sign(positive) = 1', () => {
    fc.assert(
      fc.property(positiveNumberArb, (value) => {
        return Math.sign(value) === 1;
      }),
      { numRuns: 100 },
    );
  });

  it('sign(-positive) = -1', () => {
    fc.assert(
      fc.property(positiveNumberArb, (value) => {
        return Math.sign(-value) === -1;
      }),
      { numRuns: 100 },
    );
  });

  it('abs(x) = sign(x) * x or x = 0', () => {
    fc.assert(
      fc.property(finiteNumberArb, (value) => {
        if (value === 0) return true;
        return Math.abs(value) === Math.sign(value) * value;
      }),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// Power/Exponent Property Tests
// =============================================================================

describe('Power/Exponent - Property Tests', () => {
  it('x^0 = 1 (for x != 0)', () => {
    fc.assert(
      fc.property(fc.double({ min: 0.001, max: 1000, noNaN: true }), (x) => {
        return x ** 0 === 1;
      }),
      { numRuns: 100 },
    );
  });

  it('x^1 = x', () => {
    fc.assert(
      fc.property(finiteNumberArb, (x) => {
        return x ** 1 === x;
      }),
      { numRuns: 100 },
    );
  });

  it('x^2 >= 0', () => {
    fc.assert(
      fc.property(finiteNumberArb, (x) => {
        return x ** 2 >= 0;
      }),
      { numRuns: 100 },
    );
  });

  it('sqrt(x^2) = abs(x)', () => {
    fc.assert(
      fc.property(finiteNumberArb, (x) => {
        return Math.abs(Math.sqrt(x ** 2) - Math.abs(x)) < 1e-10;
      }),
      { numRuns: 100 },
    );
  });
});
