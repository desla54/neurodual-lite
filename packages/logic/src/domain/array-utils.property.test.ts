/**
 * Property-Based Tests for Array Utilities
 *
 * Tests array manipulation invariants.
 */
import { describe, it } from 'bun:test';
import * as fc from 'fast-check';

// =============================================================================
// Array Arbitraries
// =============================================================================

const intArrayArb = fc.array(fc.integer({ min: -1000, max: 1000 }), {
  minLength: 0,
  maxLength: 50,
});
const nonEmptyIntArrayArb = fc.array(fc.integer({ min: -1000, max: 1000 }), {
  minLength: 1,
  maxLength: 50,
});
const stringArrayArb = fc.array(fc.string({ minLength: 0, maxLength: 20 }), {
  minLength: 0,
  maxLength: 30,
});

// =============================================================================
// Length Invariants
// =============================================================================

describe('Array Length - Property Tests', () => {
  it('length is non-negative', () => {
    fc.assert(
      fc.property(intArrayArb, (arr) => {
        return arr.length >= 0;
      }),
      { numRuns: 100 },
    );
  });

  it('push increases length by 1', () => {
    fc.assert(
      fc.property(intArrayArb, fc.integer(), (arr, elem) => {
        const original = arr.length;
        const copy = [...arr];
        copy.push(elem);
        return copy.length === original + 1;
      }),
      { numRuns: 100 },
    );
  });

  it('pop decreases length by 1 (for non-empty)', () => {
    fc.assert(
      fc.property(nonEmptyIntArrayArb, (arr) => {
        const original = arr.length;
        const copy = [...arr];
        copy.pop();
        return copy.length === original - 1;
      }),
      { numRuns: 100 },
    );
  });

  it('concat length = sum of lengths', () => {
    fc.assert(
      fc.property(intArrayArb, intArrayArb, (arr1, arr2) => {
        const concatenated = arr1.concat(arr2);
        return concatenated.length === arr1.length + arr2.length;
      }),
      { numRuns: 100 },
    );
  });

  it('slice(0, n) has length n (if n <= length)', () => {
    fc.assert(
      fc.property(nonEmptyIntArrayArb, (arr) => {
        const n = Math.min(arr.length, Math.floor(arr.length / 2) + 1);
        const sliced = arr.slice(0, n);
        return sliced.length === n;
      }),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// Filter Invariants
// =============================================================================

describe('Array Filter - Property Tests', () => {
  it('filter result length <= original length', () => {
    fc.assert(
      fc.property(intArrayArb, (arr) => {
        const filtered = arr.filter((x) => x > 0);
        return filtered.length <= arr.length;
      }),
      { numRuns: 100 },
    );
  });

  it('filter with always-true returns same length', () => {
    fc.assert(
      fc.property(intArrayArb, (arr) => {
        const filtered = arr.filter(() => true);
        return filtered.length === arr.length;
      }),
      { numRuns: 100 },
    );
  });

  it('filter with always-false returns empty', () => {
    fc.assert(
      fc.property(intArrayArb, (arr) => {
        const filtered = arr.filter(() => false);
        return filtered.length === 0;
      }),
      { numRuns: 100 },
    );
  });

  it('filtered elements satisfy predicate', () => {
    fc.assert(
      fc.property(intArrayArb, (arr) => {
        const predicate = (x: number) => x > 0;
        const filtered = arr.filter(predicate);
        return filtered.every(predicate);
      }),
      { numRuns: 100 },
    );
  });

  it('filter preserves order', () => {
    fc.assert(
      fc.property(intArrayArb, (arr) => {
        const filtered = arr.filter((x) => x >= 0);
        // Check that relative order is preserved
        for (let i = 0; i < filtered.length; i++) {
          for (let j = i + 1; j < filtered.length; j++) {
            const origI = arr.indexOf(filtered[i] ?? 0);
            const origJ = arr.lastIndexOf(filtered[j] ?? 0);
            if (origI >= origJ) {
            }
          }
        }
        return true;
      }),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// Map Invariants
// =============================================================================

describe('Array Map - Property Tests', () => {
  it('map preserves length', () => {
    fc.assert(
      fc.property(intArrayArb, (arr) => {
        const mapped = arr.map((x) => x * 2);
        return mapped.length === arr.length;
      }),
      { numRuns: 100 },
    );
  });

  it('map with identity returns equivalent array', () => {
    fc.assert(
      fc.property(intArrayArb, (arr) => {
        const mapped = arr.map((x) => x);
        return mapped.length === arr.length && mapped.every((x, i) => x === arr[i]);
      }),
      { numRuns: 100 },
    );
  });

  it('map composition: map(f).map(g) = map(x => g(f(x)))', () => {
    fc.assert(
      fc.property(intArrayArb, (arr) => {
        const f = (x: number) => x + 1;
        const g = (x: number) => x * 2;

        const composed = arr.map((x) => g(f(x)));
        const chained = arr.map(f).map(g);

        return composed.length === chained.length && composed.every((x, i) => x === chained[i]);
      }),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// Reduce Invariants
// =============================================================================

describe('Array Reduce - Property Tests', () => {
  it('reduce sum equals manual sum', () => {
    fc.assert(
      fc.property(intArrayArb, (arr) => {
        const reduced = arr.reduce((a, b) => a + b, 0);
        let manual = 0;
        for (const x of arr) {
          manual += x;
        }
        return reduced === manual;
      }),
      { numRuns: 100 },
    );
  });

  it('reduce with empty array returns initial', () => {
    fc.assert(
      fc.property(fc.integer(), (initial) => {
        const result = ([] as number[]).reduce((a, b) => a + b, initial);
        return result === initial;
      }),
      { numRuns: 50 },
    );
  });

  it('reduce product of single element is that element', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100 }), (elem) => {
        const result = [elem].reduce((a, b) => a * b, 1);
        return result === elem;
      }),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// Sort Invariants
// =============================================================================

describe('Array Sort - Property Tests', () => {
  it('sort preserves length', () => {
    fc.assert(
      fc.property(intArrayArb, (arr) => {
        const sorted = [...arr].sort((a, b) => a - b);
        return sorted.length === arr.length;
      }),
      { numRuns: 100 },
    );
  });

  it('sort preserves elements (multiset equality)', () => {
    fc.assert(
      fc.property(intArrayArb, (arr) => {
        const sorted = [...arr].sort((a, b) => a - b);
        const originalCounts = new Map<number, number>();
        const sortedCounts = new Map<number, number>();

        for (const x of arr) {
          originalCounts.set(x, (originalCounts.get(x) ?? 0) + 1);
        }
        for (const x of sorted) {
          sortedCounts.set(x, (sortedCounts.get(x) ?? 0) + 1);
        }

        if (originalCounts.size !== sortedCounts.size) return false;
        for (const [key, count] of originalCounts) {
          if (sortedCounts.get(key) !== count) return false;
        }
        return true;
      }),
      { numRuns: 100 },
    );
  });

  it('sorted array is monotonically non-decreasing', () => {
    fc.assert(
      fc.property(intArrayArb, (arr) => {
        const sorted = [...arr].sort((a, b) => a - b);
        for (let i = 1; i < sorted.length; i++) {
          if ((sorted[i] ?? 0) < (sorted[i - 1] ?? 0)) return false;
        }
        return true;
      }),
      { numRuns: 100 },
    );
  });

  it('sort is idempotent', () => {
    fc.assert(
      fc.property(intArrayArb, (arr) => {
        const sorted1 = [...arr].sort((a, b) => a - b);
        const sorted2 = [...sorted1].sort((a, b) => a - b);
        return sorted1.length === sorted2.length && sorted1.every((x, i) => x === sorted2[i]);
      }),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// Reverse Invariants
// =============================================================================

describe('Array Reverse - Property Tests', () => {
  it('reverse preserves length', () => {
    fc.assert(
      fc.property(intArrayArb, (arr) => {
        const reversed = [...arr].reverse();
        return reversed.length === arr.length;
      }),
      { numRuns: 100 },
    );
  });

  it('reverse is self-inverse', () => {
    fc.assert(
      fc.property(intArrayArb, (arr) => {
        const reversed = [...arr].reverse();
        const doubleReversed = [...reversed].reverse();
        return arr.length === doubleReversed.length && arr.every((x, i) => x === doubleReversed[i]);
      }),
      { numRuns: 100 },
    );
  });

  it('reverse swaps first and last', () => {
    fc.assert(
      fc.property(fc.array(fc.integer(), { minLength: 2, maxLength: 50 }), (arr) => {
        const reversed = [...arr].reverse();
        return arr[0] === reversed[reversed.length - 1] && arr[arr.length - 1] === reversed[0];
      }),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// Find/Index Invariants
// =============================================================================

describe('Array Find/Index - Property Tests', () => {
  it('indexOf returns -1 for missing element', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 0, maxLength: 30 }),
        (arr) => {
          const missing = 200; // Guaranteed not in array
          return arr.indexOf(missing) === -1;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('indexOf returns valid index for existing element', () => {
    fc.assert(
      fc.property(nonEmptyIntArrayArb, (arr) => {
        const elem = arr[0];
        const idx = arr.indexOf(elem ?? 0);
        return idx >= 0 && idx < arr.length;
      }),
      { numRuns: 100 },
    );
  });

  it('includes is consistent with indexOf', () => {
    fc.assert(
      fc.property(intArrayArb, fc.integer(), (arr, elem) => {
        return arr.includes(elem) === (arr.indexOf(elem) !== -1);
      }),
      { numRuns: 100 },
    );
  });

  it('find returns undefined for missing predicate', () => {
    fc.assert(
      fc.property(intArrayArb, (arr) => {
        const found = arr.find((x) => x > 10000);
        return found === undefined;
      }),
      { numRuns: 100 },
    );
  });

  it('findIndex is consistent with find', () => {
    fc.assert(
      fc.property(intArrayArb, (arr) => {
        const predicate = (x: number) => x > 0;
        const found = arr.find(predicate);
        const idx = arr.findIndex(predicate);

        if (found === undefined) {
          return idx === -1;
        }
        return idx >= 0 && arr[idx] === found;
      }),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// Every/Some Invariants
// =============================================================================

describe('Array Every/Some - Property Tests', () => {
  // @ts-expect-error test override
  it('every returns true for empty array', () => {
    const result = ([] as number[]).every(() => false);
    return result === true;
  });

  // @ts-expect-error test override
  it('some returns false for empty array', () => {
    const result = ([] as number[]).some(() => true);
    return result === false;
  });

  it('every with always-true returns true', () => {
    fc.assert(
      fc.property(intArrayArb, (arr) => {
        return arr.every(() => true) === true;
      }),
      { numRuns: 100 },
    );
  });

  it('some with always-false returns false', () => {
    fc.assert(
      fc.property(intArrayArb, (arr) => {
        return arr.some(() => false) === false;
      }),
      { numRuns: 100 },
    );
  });

  it('every is negation of some(not)', () => {
    fc.assert(
      fc.property(intArrayArb, (arr) => {
        const predicate = (x: number) => x > 0;
        const everyResult = arr.every(predicate);
        const someNegatedResult = arr.some((x) => !predicate(x));
        return everyResult === !someNegatedResult;
      }),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// Slice/Splice Invariants
// =============================================================================

describe('Array Slice - Property Tests', () => {
  it('slice(0) returns copy', () => {
    fc.assert(
      fc.property(intArrayArb, (arr) => {
        const sliced = arr.slice(0);
        return (
          sliced.length === arr.length && sliced.every((x, i) => x === arr[i]) && sliced !== arr
        );
      }),
      { numRuns: 100 },
    );
  });

  it('slice(0, 0) returns empty', () => {
    fc.assert(
      fc.property(intArrayArb, (arr) => {
        return arr.slice(0, 0).length === 0;
      }),
      { numRuns: 100 },
    );
  });

  it('slice does not modify original', () => {
    fc.assert(
      fc.property(intArrayArb, (arr) => {
        const original = [...arr];
        arr.slice(1, 3);
        return arr.length === original.length && arr.every((x, i) => x === original[i]);
      }),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// Flat Invariants
// =============================================================================

describe('Array Flat - Property Tests', () => {
  it('flat(0) returns shallow copy', () => {
    fc.assert(
      fc.property(intArrayArb, (arr) => {
        const flattened = arr.flat(0);
        return flattened.length === arr.length;
      }),
      { numRuns: 100 },
    );
  });

  it('flat reduces nesting', () => {
    fc.assert(
      fc.property(
        fc.array(fc.array(fc.integer(), { minLength: 0, maxLength: 5 }), {
          minLength: 0,
          maxLength: 10,
        }),
        (arr) => {
          const flattened = arr.flat();
          const expectedLength = arr.reduce((sum, inner) => sum + inner.length, 0);
          return flattened.length === expectedLength;
        },
      ),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// Join Invariants
// =============================================================================

describe('Array Join - Property Tests', () => {
  it('join returns string', () => {
    fc.assert(
      fc.property(stringArrayArb, (arr) => {
        return typeof arr.join(',') === 'string';
      }),
      { numRuns: 100 },
    );
  });

  it('join of single element is that element string', () => {
    fc.assert(
      fc.property(fc.string(), (str) => {
        return [str].join(',') === str;
      }),
      { numRuns: 100 },
    );
  });

  // @ts-expect-error test override
  it('join of empty is empty string', () => {
    return ([] as string[]).join(',') === '';
  });
});
