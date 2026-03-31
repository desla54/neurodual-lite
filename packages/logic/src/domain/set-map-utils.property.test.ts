/**
 * Property-Based Tests for Set and Map Utilities
 *
 * Tests Set and Map invariants.
 */
import { describe, it } from 'bun:test';
import * as fc from 'fast-check';

// =============================================================================
// Set Size Invariants
// =============================================================================

describe('Set Size - Property Tests', () => {
  it('set size is non-negative', () => {
    fc.assert(
      fc.property(fc.array(fc.integer(), { maxLength: 50 }), (arr) => {
        return new Set(arr).size >= 0;
      }),
      { numRuns: 100 },
    );
  });

  it('set size <= array length', () => {
    fc.assert(
      fc.property(fc.array(fc.integer(), { maxLength: 50 }), (arr) => {
        return new Set(arr).size <= arr.length;
      }),
      { numRuns: 100 },
    );
  });

  it('set of unique elements has same size as array', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 50 }), (n) => {
        const arr = Array.from({ length: n }, (_, i) => i);
        return new Set(arr).size === n;
      }),
      { numRuns: 50 },
    );
  });

  it('adding existing element does not increase size', () => {
    fc.assert(
      fc.property(fc.array(fc.integer(), { minLength: 1, maxLength: 50 }), (arr) => {
        const set = new Set(arr);
        const sizeBefore = set.size;
        set.add(arr[0] ?? 0);
        return set.size === sizeBefore;
      }),
      { numRuns: 100 },
    );
  });

  it('adding new element increases size by 1', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 100 }), { maxLength: 50 }), (arr) => {
        const set = new Set(arr);
        const sizeBefore = set.size;
        set.add(200); // Guaranteed new element
        return set.size === sizeBefore + 1;
      }),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// Set Operations Invariants
// =============================================================================

describe('Set Operations - Property Tests', () => {
  it('set.has returns true for added element', () => {
    fc.assert(
      fc.property(fc.integer(), (elem) => {
        const set = new Set<number>();
        set.add(elem);
        return set.has(elem);
      }),
      { numRuns: 100 },
    );
  });

  it('set.has returns false for non-existing element', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 100 }), { maxLength: 30 }), (arr) => {
        const set = new Set(arr);
        return !set.has(200);
      }),
      { numRuns: 100 },
    );
  });

  it('delete returns true for existing element', () => {
    fc.assert(
      fc.property(fc.array(fc.integer(), { minLength: 1, maxLength: 50 }), (arr) => {
        const set = new Set(arr);
        return set.delete(arr[0] ?? 0);
      }),
      { numRuns: 100 },
    );
  });

  it('delete returns false for non-existing element', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 100 }), { maxLength: 30 }), (arr) => {
        const set = new Set(arr);
        return !set.delete(200);
      }),
      { numRuns: 100 },
    );
  });

  it('clear results in size 0', () => {
    fc.assert(
      fc.property(fc.array(fc.integer(), { maxLength: 50 }), (arr) => {
        const set = new Set(arr);
        set.clear();
        return set.size === 0;
      }),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// Set Conversion Invariants
// =============================================================================

describe('Set Conversion - Property Tests', () => {
  it('Array.from(set) has same length as set.size', () => {
    fc.assert(
      fc.property(fc.array(fc.integer(), { maxLength: 50 }), (arr) => {
        const set = new Set(arr);
        return Array.from(set).length === set.size;
      }),
      { numRuns: 100 },
    );
  });

  it('spreading set produces unique elements', () => {
    fc.assert(
      fc.property(fc.array(fc.integer(), { maxLength: 50 }), (arr) => {
        const set = new Set(arr);
        const spread = [...set];
        return new Set(spread).size === spread.length;
      }),
      { numRuns: 100 },
    );
  });

  it('set.values() iterates all elements', () => {
    fc.assert(
      fc.property(fc.array(fc.integer(), { maxLength: 50 }), (arr) => {
        const set = new Set(arr);
        let count = 0;
        for (const _ of set.values()) {
          count++;
        }
        return count === set.size;
      }),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// Map Size Invariants
// =============================================================================

describe('Map Size - Property Tests', () => {
  it('map size is non-negative', () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.string(), fc.integer()), { maxLength: 50 }), (entries) => {
        return new Map(entries).size >= 0;
      }),
      { numRuns: 100 },
    );
  });

  it('map size <= entries length', () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.string(), fc.integer()), { maxLength: 50 }), (entries) => {
        return new Map(entries).size <= entries.length;
      }),
      { numRuns: 100 },
    );
  });

  it('map with unique keys has same size as entries', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 30 }), (n) => {
        const entries: [string, number][] = Array.from({ length: n }, (_, i) => [`key${i}`, i]);
        return new Map(entries).size === n;
      }),
      { numRuns: 50 },
    );
  });

  it('setting existing key does not increase size', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.string(), fc.integer()), { minLength: 1, maxLength: 50 }),
        (entries) => {
          const map = new Map(entries);
          const sizeBefore = map.size;
          const [key] = entries[0] ?? ['', 0];
          map.set(key, 999);
          return map.size === sizeBefore;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('setting new key increases size by 1', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.string({ minLength: 1, maxLength: 10 }), fc.integer()), {
          maxLength: 30,
        }),
        (entries) => {
          const map = new Map(entries);
          const sizeBefore = map.size;
          map.set('__unique_key__', 999);
          return map.size === sizeBefore + 1;
        },
      ),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// Map Operations Invariants
// =============================================================================

describe('Map Operations - Property Tests', () => {
  it('map.get returns set value', () => {
    fc.assert(
      fc.property(fc.string(), fc.integer(), (key, value) => {
        const map = new Map<string, number>();
        map.set(key, value);
        return map.get(key) === value;
      }),
      { numRuns: 100 },
    );
  });

  it('map.get returns undefined for non-existing key', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.string({ minLength: 1, maxLength: 10 }), fc.integer()), {
          maxLength: 30,
        }),
        (entries) => {
          const map = new Map(entries);
          return map.get('__nonexistent__') === undefined;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('map.has returns true for existing key', () => {
    fc.assert(
      fc.property(fc.string(), fc.integer(), (key, value) => {
        const map = new Map<string, number>();
        map.set(key, value);
        return map.has(key);
      }),
      { numRuns: 100 },
    );
  });

  it('map.has returns false for non-existing key', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.string({ minLength: 1, maxLength: 10 }), fc.integer()), {
          maxLength: 30,
        }),
        (entries) => {
          const map = new Map(entries);
          return !map.has('__nonexistent__');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('delete returns true for existing key', () => {
    fc.assert(
      fc.property(fc.string(), fc.integer(), (key, value) => {
        const map = new Map<string, number>();
        map.set(key, value);
        return map.delete(key);
      }),
      { numRuns: 100 },
    );
  });

  it('delete returns false for non-existing key', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.string({ minLength: 1, maxLength: 10 }), fc.integer()), {
          maxLength: 30,
        }),
        (entries) => {
          const map = new Map(entries);
          return !map.delete('__nonexistent__');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('clear results in size 0', () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.string(), fc.integer()), { maxLength: 50 }), (entries) => {
        const map = new Map(entries);
        map.clear();
        return map.size === 0;
      }),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// Map Conversion Invariants
// =============================================================================

describe('Map Conversion - Property Tests', () => {
  it('Array.from(map.keys()) has same length as map.size', () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.string(), fc.integer()), { maxLength: 50 }), (entries) => {
        const map = new Map(entries);
        return Array.from(map.keys()).length === map.size;
      }),
      { numRuns: 100 },
    );
  });

  it('Array.from(map.values()) has same length as map.size', () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.string(), fc.integer()), { maxLength: 50 }), (entries) => {
        const map = new Map(entries);
        return Array.from(map.values()).length === map.size;
      }),
      { numRuns: 100 },
    );
  });

  it('Array.from(map.entries()) has same length as map.size', () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.string(), fc.integer()), { maxLength: 50 }), (entries) => {
        const map = new Map(entries);
        return Array.from(map.entries()).length === map.size;
      }),
      { numRuns: 100 },
    );
  });

  it('Object.fromEntries(map) preserves values', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 20 }), (n) => {
        const entries: [string, number][] = Array.from({ length: n }, (_, i) => [`key${i}`, i]);
        const map = new Map(entries);
        const obj = Object.fromEntries(map);
        for (const [key, value] of entries) {
          if (obj[key] !== value) return false;
        }
        return true;
      }),
      { numRuns: 50 },
    );
  });
});

// =============================================================================
// Set Theory Invariants
// =============================================================================

describe('Set Theory - Property Tests', () => {
  it('union size >= max of individual sizes', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer(), { maxLength: 30 }),
        fc.array(fc.integer(), { maxLength: 30 }),
        (arr1, arr2) => {
          const set1 = new Set(arr1);
          const set2 = new Set(arr2);
          const union = new Set([...set1, ...set2]);
          return union.size >= Math.max(set1.size, set2.size);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('union size <= sum of individual sizes', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer(), { maxLength: 30 }),
        fc.array(fc.integer(), { maxLength: 30 }),
        (arr1, arr2) => {
          const set1 = new Set(arr1);
          const set2 = new Set(arr2);
          const union = new Set([...set1, ...set2]);
          return union.size <= set1.size + set2.size;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('intersection size <= min of individual sizes', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer(), { maxLength: 30 }),
        fc.array(fc.integer(), { maxLength: 30 }),
        (arr1, arr2) => {
          const set1 = new Set(arr1);
          const set2 = new Set(arr2);
          const intersection = new Set([...set1].filter((x) => set2.has(x)));
          return intersection.size <= Math.min(set1.size, set2.size);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('difference size <= original size', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer(), { maxLength: 30 }),
        fc.array(fc.integer(), { maxLength: 30 }),
        (arr1, arr2) => {
          const set1 = new Set(arr1);
          const set2 = new Set(arr2);
          const difference = new Set([...set1].filter((x) => !set2.has(x)));
          return difference.size <= set1.size;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('A ∪ A = A', () => {
    fc.assert(
      fc.property(fc.array(fc.integer(), { maxLength: 50 }), (arr) => {
        const set = new Set(arr);
        const union = new Set([...set, ...set]);
        return union.size === set.size;
      }),
      { numRuns: 100 },
    );
  });

  it('A ∩ A = A', () => {
    fc.assert(
      fc.property(fc.array(fc.integer(), { maxLength: 50 }), (arr) => {
        const set = new Set(arr);
        const intersection = new Set([...set].filter((x) => set.has(x)));
        return intersection.size === set.size;
      }),
      { numRuns: 100 },
    );
  });

  it('A - A = ∅', () => {
    fc.assert(
      fc.property(fc.array(fc.integer(), { maxLength: 50 }), (arr) => {
        const set = new Set(arr);
        const difference = new Set([...set].filter((x) => !set.has(x)));
        return difference.size === 0;
      }),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// WeakMap/WeakSet Basic Invariants
// =============================================================================

describe('WeakMap/WeakSet - Property Tests', () => {
  it('WeakMap.set then get returns same value', () => {
    fc.assert(
      fc.property(fc.integer(), (value) => {
        const map = new WeakMap<object, number>();
        const key = {};
        map.set(key, value);
        return map.get(key) === value;
      }),
      { numRuns: 50 },
    );
  });

  it('WeakMap.has returns true after set', () => {
    fc.assert(
      fc.property(fc.integer(), (value) => {
        const map = new WeakMap<object, number>();
        const key = {};
        map.set(key, value);
        return map.has(key);
      }),
      { numRuns: 50 },
    );
  });

  it('WeakSet.add then has returns true', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const set = new WeakSet<object>();
        const obj = {};
        set.add(obj);
        return set.has(obj);
      }),
      { numRuns: 50 },
    );
  });

  it('WeakSet.delete returns true for existing', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const set = new WeakSet<object>();
        const obj = {};
        set.add(obj);
        return set.delete(obj);
      }),
      { numRuns: 50 },
    );
  });
});
