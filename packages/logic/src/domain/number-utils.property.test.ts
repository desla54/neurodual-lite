/**
 * Property-Based Tests for Number Utilities
 *
 * Tests number manipulation invariants.
 */
import { describe, it, expect } from 'bun:test';
import * as fc from 'fast-check';

// =============================================================================
// Number Type Invariants
// =============================================================================

describe('Number Types - Property Tests', () => {
  it('isFinite returns false for Infinity', () => {
    expect(Number.isFinite(Infinity)).toBe(false);
    expect(Number.isFinite(-Infinity)).toBe(false);
  });

  it('isFinite returns false for NaN', () => {
    expect(Number.isFinite(NaN)).toBe(false);
  });

  it('isFinite returns true for finite numbers', () => {
    fc.assert(
      fc.property(fc.double({ min: -1e10, max: 1e10, noNaN: true }), (n) => {
        return Number.isFinite(n);
      }),
      { numRuns: 100 },
    );
  });

  it('isInteger returns true for integers', () => {
    fc.assert(
      fc.property(fc.integer({ min: -1000000, max: 1000000 }), (n) => {
        return Number.isInteger(n);
      }),
      { numRuns: 100 },
    );
  });

  it('isInteger returns false for non-integers', () => {
    fc.assert(
      fc.property(fc.double({ min: 0.1, max: 0.9, noNaN: true }), (n) => {
        return !Number.isInteger(n);
      }),
      { numRuns: 100 },
    );
  });

  it('isNaN returns true only for NaN', () => {
    fc.assert(
      fc.property(fc.double({ min: -1e10, max: 1e10, noNaN: true }), (n) => {
        return !Number.isNaN(n);
      }),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// Arithmetic Invariants
// =============================================================================

describe('Arithmetic - Property Tests', () => {
  it('a + b = b + a (commutativity)', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (a, b) => {
        return a + b === b + a;
      }),
      { numRuns: 100 },
    );
  });

  it('(a + b) + c = a + (b + c) (associativity for integers)', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), fc.integer(), (a, b, c) => {
        return a + b + c === a + (b + c);
      }),
      { numRuns: 100 },
    );
  });

  it('a * b = b * a (commutativity)', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (a, b) => {
        return a * b === b * a;
      }),
      { numRuns: 100 },
    );
  });

  it('a * 1 = a (identity)', () => {
    fc.assert(
      fc.property(fc.integer(), (a) => {
        return a * 1 === a;
      }),
      { numRuns: 100 },
    );
  });

  it('a * 0 = 0 (zero property)', () => {
    fc.assert(
      fc.property(fc.integer(), (a) => {
        return a * 0 === 0;
      }),
      { numRuns: 100 },
    );
  });

  it('a + 0 = a (identity)', () => {
    fc.assert(
      fc.property(fc.integer(), (a) => {
        return a + 0 === a;
      }),
      { numRuns: 100 },
    );
  });

  it('a - a = 0 (inverse)', () => {
    fc.assert(
      fc.property(fc.integer(), (a) => {
        return a - a === 0;
      }),
      { numRuns: 100 },
    );
  });

  it('a / a = 1 for non-zero (inverse)', () => {
    fc.assert(
      fc.property(fc.double({ min: 0.001, max: 1000, noNaN: true }), (a) => {
        return Math.abs(a / a - 1) < 1e-10;
      }),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// Comparison Invariants
// =============================================================================

describe('Comparison - Property Tests', () => {
  it('a < b implies b > a', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (a, b) => {
        if (a < b) return b > a;
        if (a > b) return b < a;
        return a === b;
      }),
      { numRuns: 100 },
    );
  });

  it('a <= a (reflexivity)', () => {
    fc.assert(
      fc.property(fc.integer(), (a) => {
        return a <= a;
      }),
      { numRuns: 100 },
    );
  });

  it('if a <= b and b <= a then a === b', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (a, b) => {
        if (a <= b && b <= a) return a === b;
        return true;
      }),
      { numRuns: 100 },
    );
  });

  it('min(a, b) <= a and min(a, b) <= b', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (a, b) => {
        const min = Math.min(a, b);
        return min <= a && min <= b;
      }),
      { numRuns: 100 },
    );
  });

  it('max(a, b) >= a and max(a, b) >= b', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (a, b) => {
        const max = Math.max(a, b);
        return max >= a && max >= b;
      }),
      { numRuns: 100 },
    );
  });

  it('min(a, b) + max(a, b) = a + b', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -10000, max: 10000 }),
        fc.integer({ min: -10000, max: 10000 }),
        (a, b) => {
          return Math.min(a, b) + Math.max(a, b) === a + b;
        },
      ),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// Division/Modulo Invariants
// =============================================================================

describe('Division/Modulo - Property Tests', () => {
  it('a = (a / b) * b + (a % b) for integers (approximately)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1000, max: 1000 }),
        fc.integer({ min: 1, max: 100 }),
        (a, b) => {
          // Use Math.trunc to match JavaScript's % behavior (truncation toward zero)
          const quotient = Math.trunc(a / b);
          const remainder = a % b;
          return quotient * b + remainder === a;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('a % b is always in [0, b) for positive b and non-negative a', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1000 }), fc.integer({ min: 1, max: 100 }), (a, b) => {
        const remainder = a % b;
        return remainder >= 0 && remainder < b;
      }),
      { numRuns: 100 },
    );
  });

  it('a % 1 = 0 for integers', () => {
    fc.assert(
      fc.property(fc.integer(), (a) => {
        return a % 1 === 0;
      }),
      { numRuns: 100 },
    );
  });

  it('a % a = 0 for non-zero', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1000 }), (a) => {
        return a % a === 0;
      }),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// Parsing Invariants
// =============================================================================

describe('Parsing - Property Tests', () => {
  it('parseInt(String(n)) = n for integers', () => {
    fc.assert(
      fc.property(fc.integer({ min: -1000000, max: 1000000 }), (n) => {
        return parseInt(String(n), 10) === n;
      }),
      { numRuns: 100 },
    );
  });

  it('parseFloat(String(n)) ≈ n for floats', () => {
    fc.assert(
      fc.property(fc.double({ min: -1000, max: 1000, noNaN: true }), (n) => {
        const parsed = parseFloat(String(n));
        return Math.abs(parsed - n) < 1e-10;
      }),
      { numRuns: 100 },
    );
  });

  it('Number(String(n)) = n for integers', () => {
    fc.assert(
      fc.property(fc.integer({ min: -1000000, max: 1000000 }), (n) => {
        return Number(String(n)) === n;
      }),
      { numRuns: 100 },
    );
  });

  it('parseInt returns NaN for non-numeric strings', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 10 }).filter((s) => !/^-?\d/.test(s)),
        (s) => {
          return Number.isNaN(parseInt(s, 10));
        },
      ),
      { numRuns: 50 },
    );
  });
});

// =============================================================================
// toFixed/toPrecision Invariants
// =============================================================================

describe('Number Formatting - Property Tests', () => {
  it('toFixed returns string', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1000, max: 1000, noNaN: true }),
        fc.integer({ min: 0, max: 10 }),
        (n, digits) => {
          return typeof n.toFixed(digits) === 'string';
        },
      ),
      { numRuns: 100 },
    );
  });

  it('toFixed(0) rounds to integer string', () => {
    fc.assert(
      fc.property(fc.double({ min: -1000, max: 1000, noNaN: true }), (n) => {
        const fixed = n.toFixed(0);
        const parsed = parseInt(fixed, 10);
        return Math.abs(parsed - Math.round(n)) <= 1;
      }),
      { numRuns: 100 },
    );
  });

  it('toPrecision returns string', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.001, max: 1000, noNaN: true }),
        fc.integer({ min: 1, max: 10 }),
        (n, precision) => {
          return typeof n.toPrecision(precision) === 'string';
        },
      ),
      { numRuns: 100 },
    );
  });

  it('toString returns string', () => {
    fc.assert(
      fc.property(fc.double({ min: -1000, max: 1000, noNaN: true }), (n) => {
        return typeof n.toString() === 'string';
      }),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// Bitwise Invariants
// =============================================================================

describe('Bitwise Operations - Property Tests', () => {
  // JavaScript bitwise ops work on 32-bit signed integers, so max safe value is 0x7FFFFFFF
  const MAX_SAFE_BITWISE = 0x7fffffff;

  it('a & a = a', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: MAX_SAFE_BITWISE }), (a) => {
        return (a & a) === a;
      }),
      { numRuns: 100 },
    );
  });

  it('a | a = a', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: MAX_SAFE_BITWISE }), (a) => {
        return (a | a) === a;
      }),
      { numRuns: 100 },
    );
  });

  it('a ^ a = 0', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: MAX_SAFE_BITWISE }), (a) => {
        return (a ^ a) === 0;
      }),
      { numRuns: 100 },
    );
  });

  it('a & 0 = 0', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: MAX_SAFE_BITWISE }), (a) => {
        return (a & 0) === 0;
      }),
      { numRuns: 100 },
    );
  });

  it('a | 0 = a', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: MAX_SAFE_BITWISE }), (a) => {
        return (a | 0) === a;
      }),
      { numRuns: 100 },
    );
  });

  it('(a & b) = (b & a) (commutativity)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 0xffff }),
        fc.integer({ min: 0, max: 0xffff }),
        (a, b) => {
          return (a & b) === (b & a);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('(a | b) = (b | a) (commutativity)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 0xffff }),
        fc.integer({ min: 0, max: 0xffff }),
        (a, b) => {
          return (a | b) === (b | a);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// Special Values Invariants
// =============================================================================

describe('Special Values - Property Tests', () => {
  it('NaN !== NaN', () => {
    const a = NaN;
    expect(Number.isNaN(a)).toBe(true);
    expect(a === a).toBe(false);
  });

  it('Infinity > any finite number', () => {
    fc.assert(
      fc.property(fc.double({ min: -1e100, max: 1e100, noNaN: true }), (n) => {
        return Infinity > n;
      }),
      { numRuns: 100 },
    );
  });

  it('-Infinity < any finite number', () => {
    fc.assert(
      fc.property(fc.double({ min: -1e100, max: 1e100, noNaN: true }), (n) => {
        return -Infinity < n;
      }),
      { numRuns: 100 },
    );
  });

  it('MAX_VALUE is positive', () => {
    expect(Number.MAX_VALUE > 0).toBe(true);
  });

  it('MIN_VALUE is positive', () => {
    expect(Number.MIN_VALUE > 0).toBe(true);
  });

  it('EPSILON is small positive', () => {
    expect(Number.EPSILON > 0).toBe(true);
    expect(Number.EPSILON < 1).toBe(true);
  });
});

// =============================================================================
// Trigonometric Invariants
// =============================================================================

describe('Trigonometric - Property Tests', () => {
  it('sin^2(x) + cos^2(x) = 1', () => {
    fc.assert(
      fc.property(fc.double({ min: -Math.PI * 10, max: Math.PI * 10, noNaN: true }), (x) => {
        const sin2 = Math.sin(x) ** 2;
        const cos2 = Math.cos(x) ** 2;
        return Math.abs(sin2 + cos2 - 1) < 1e-10;
      }),
      { numRuns: 100 },
    );
  });

  it('sin(0) = 0', () => {
    expect(Math.sin(0)).toBe(0);
  });

  it('cos(0) = 1', () => {
    expect(Math.cos(0)).toBe(1);
  });

  it('tan(0) = 0', () => {
    expect(Math.tan(0)).toBe(0);
  });

  it('sin is bounded [-1, 1]', () => {
    fc.assert(
      fc.property(fc.double({ min: -100, max: 100, noNaN: true }), (x) => {
        const sin = Math.sin(x);
        return sin >= -1 && sin <= 1;
      }),
      { numRuns: 100 },
    );
  });

  it('cos is bounded [-1, 1]', () => {
    fc.assert(
      fc.property(fc.double({ min: -100, max: 100, noNaN: true }), (x) => {
        const cos = Math.cos(x);
        return cos >= -1 && cos <= 1;
      }),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// Logarithmic Invariants
// =============================================================================

describe('Logarithmic - Property Tests', () => {
  it('log(1) = 0', () => {
    expect(Math.log(1)).toBe(0);
  });

  it('log(e) = 1', () => {
    expect(Math.abs(Math.log(Math.E) - 1)).toBeLessThan(1e-10);
  });

  it('exp(log(x)) ≈ x for positive x', () => {
    fc.assert(
      fc.property(fc.double({ min: 0.001, max: 100, noNaN: true }), (x) => {
        return Math.abs(Math.exp(Math.log(x)) - x) < 1e-10;
      }),
      { numRuns: 100 },
    );
  });

  it('log(exp(x)) ≈ x', () => {
    fc.assert(
      fc.property(fc.double({ min: -10, max: 10, noNaN: true }), (x) => {
        return Math.abs(Math.log(Math.exp(x)) - x) < 1e-10;
      }),
      { numRuns: 100 },
    );
  });

  it('log(a * b) ≈ log(a) + log(b) for positive a, b', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.1, max: 100, noNaN: true }),
        fc.double({ min: 0.1, max: 100, noNaN: true }),
        (a, b) => {
          return Math.abs(Math.log(a * b) - (Math.log(a) + Math.log(b))) < 1e-10;
        },
      ),
      { numRuns: 100 },
    );
  });
});
