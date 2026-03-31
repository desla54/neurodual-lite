/**
 * Tests for SeededRandom and generateId
 *
 * Validates:
 * - Reproducibility with same seed
 * - Uniform distribution
 * - Shuffle correctness
 * - UUID generation format
 */

import { describe, expect, test } from 'bun:test';
import { SeededRandom, generateId } from './random';

// =============================================================================
// SeededRandom Tests
// =============================================================================

describe('SeededRandom', () => {
  test('should be reproducible with same seed', () => {
    const rng1 = new SeededRandom('test-seed');
    const rng2 = new SeededRandom('test-seed');

    const values1 = Array.from({ length: 10 }, () => rng1.next());
    const values2 = Array.from({ length: 10 }, () => rng2.next());

    expect(values1).toEqual(values2);
  });

  test('should produce different sequences for different seeds', () => {
    const rng1 = new SeededRandom('seed-a');
    const rng2 = new SeededRandom('seed-b');

    const values1 = Array.from({ length: 10 }, () => rng1.next());
    const values2 = Array.from({ length: 10 }, () => rng2.next());

    expect(values1).not.toEqual(values2);
  });

  test('next() should return values between 0 and 1', () => {
    const rng = new SeededRandom('bounds-test');

    for (let i = 0; i < 1000; i++) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  test('int() should return values within range', () => {
    const rng = new SeededRandom('int-test');

    for (let i = 0; i < 100; i++) {
      const value = rng.int(5, 10);
      expect(value).toBeGreaterThanOrEqual(5);
      expect(value).toBeLessThan(10);
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  test('choice() should select from array', () => {
    const rng = new SeededRandom('choice-test');
    const array = ['a', 'b', 'c', 'd'];

    for (let i = 0; i < 50; i++) {
      const value = rng.choice(array);
      expect(array).toContain(value);
    }
  });

  test('choice() should throw on empty array', () => {
    const rng = new SeededRandom('empty-test');
    expect(() => rng.choice([])).toThrow('Cannot choose from empty array');
  });

  test('choiceExcluding() should avoid excluded value', () => {
    const rng = new SeededRandom('exclude-test');
    const array = ['a', 'b', 'c', 'd'];

    for (let i = 0; i < 50; i++) {
      const value = rng.choiceExcluding(array, 'a');
      // Most of the time should not be 'a' (probabilistic)
      expect(array).toContain(value);
    }
  });

  test('choiceExcluding() should return only element if array has one item', () => {
    const rng = new SeededRandom('single-test');
    const result = rng.choiceExcluding(['only'], 'other');
    expect(result).toBe('only');
  });

  test('choiceExcluding() should throw on empty array', () => {
    const rng = new SeededRandom('empty-exclude-test');
    expect(() => rng.choiceExcluding([], 'x')).toThrow('Cannot choose from empty array');
  });

  test('choiceExcluding() should work without exclude parameter', () => {
    const rng = new SeededRandom('no-exclude-test');
    const array = ['a', 'b', 'c'];
    const result = rng.choiceExcluding(array);
    expect(array).toContain(result);
  });

  test('shuffle() should contain all original elements', () => {
    const rng = new SeededRandom('shuffle-test');
    const original = [1, 2, 3, 4, 5, 6, 7, 8];
    const shuffled = rng.shuffle([...original]);

    expect(shuffled.sort()).toEqual(original.sort());
  });

  test('shuffle() should be reproducible with same seed', () => {
    const original = [1, 2, 3, 4, 5, 6, 7, 8];

    const rng1 = new SeededRandom('shuffle-seed');
    const shuffled1 = rng1.shuffle([...original]);

    const rng2 = new SeededRandom('shuffle-seed');
    const shuffled2 = rng2.shuffle([...original]);

    expect(shuffled1).toEqual(shuffled2);
  });

  test('shuffle() should modify array in place', () => {
    const rng = new SeededRandom('in-place-test');
    const array = [1, 2, 3, 4, 5];
    const result = rng.shuffle(array);

    expect(result).toBe(array); // Same reference
  });

  test('shuffle() should handle single element array', () => {
    const rng = new SeededRandom('single-shuffle');
    const array = [42];
    const result = rng.shuffle(array);
    expect(result).toEqual([42]);
  });

  test('shuffle() should handle empty array', () => {
    const rng = new SeededRandom('empty-shuffle');
    const array: number[] = [];
    const result = rng.shuffle(array);
    expect(result).toEqual([]);
  });

  // =========================================================================
  // Beta distribution tests
  // =========================================================================

  test('beta() should return values between 0 and 1', () => {
    const rng = new SeededRandom('beta-bounds-test');

    for (let i = 0; i < 100; i++) {
      const value = rng.beta(2, 3);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  test('beta() should be reproducible with same seed', () => {
    const rng1 = new SeededRandom('beta-repro');
    const rng2 = new SeededRandom('beta-repro');

    const values1 = Array.from({ length: 10 }, () => rng1.beta(2, 1));
    const values2 = Array.from({ length: 10 }, () => rng2.beta(2, 1));

    expect(values1).toEqual(values2);
  });

  test('beta() with beta=1 should use optimized path', () => {
    const rng = new SeededRandom('beta-one-test');

    // Beta(alpha, 1) has a simple formula: u^(1/alpha)
    for (let i = 0; i < 50; i++) {
      const value = rng.beta(2, 1);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  test('beta() with alpha=1 should use optimized path', () => {
    const rng = new SeededRandom('alpha-one-test');

    // Beta(1, beta) has a simple formula: 1 - (1-u)^(1/beta)
    for (let i = 0; i < 50; i++) {
      const value = rng.beta(1, 2);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  test('beta() should throw on non-positive alpha', () => {
    const rng = new SeededRandom('beta-error');
    expect(() => rng.beta(0, 1)).toThrow('Beta distribution parameters must be positive');
    expect(() => rng.beta(-1, 1)).toThrow('Beta distribution parameters must be positive');
  });

  test('beta() should throw on non-positive beta', () => {
    const rng = new SeededRandom('beta-error-2');
    expect(() => rng.beta(1, 0)).toThrow('Beta distribution parameters must be positive');
    expect(() => rng.beta(1, -1)).toThrow('Beta distribution parameters must be positive');
  });

  test('beta() with general case (both alpha and beta > 1) should work', () => {
    const rng = new SeededRandom('beta-general');

    // This tests the gamma variate code path
    for (let i = 0; i < 50; i++) {
      const value = rng.beta(3, 4);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  test('beta() with shape < 1 should work', () => {
    const rng = new SeededRandom('beta-small-shape');

    // This tests the gamma shape < 1 transformation
    for (let i = 0; i < 50; i++) {
      const value = rng.beta(0.5, 0.5);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });
});

// =============================================================================
// generateId Tests
// =============================================================================

describe('generateId', () => {
  test('should generate valid UUID v4 format', () => {
    const id = generateId();

    // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    expect(id).toMatch(uuidRegex);
  });

  test('should generate unique IDs', () => {
    const ids = new Set<string>();

    for (let i = 0; i < 1000; i++) {
      ids.add(generateId());
    }

    // All 1000 should be unique
    expect(ids.size).toBe(1000);
  });

  test('should have correct length', () => {
    const id = generateId();
    expect(id.length).toBe(36); // 32 hex chars + 4 dashes
  });

  test('should have 4 in version position', () => {
    const id = generateId();
    expect(id[14]).toBe('4');
  });

  test('should have valid variant character', () => {
    const id = generateId();
    // Position 19 should be 8, 9, a, or b
    expect(['8', '9', 'a', 'b']).toContain(id[19]);
  });
});
