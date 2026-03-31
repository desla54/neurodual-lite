/**
 * Tests for prng.ts
 */

import { describe, expect, it } from 'bun:test';
import { createPRNG } from './prng';

describe('createPRNG', () => {
  it('creates a PRNG with all required methods', () => {
    const rng = createPRNG('test-seed');
    expect(typeof rng.random).toBe('function');
    expect(typeof rng.randomInt).toBe('function');
    expect(typeof rng.randomElement).toBe('function');
    expect(typeof rng.shuffle).toBe('function');
    expect(typeof rng.getState).toBe('function');
  });
});

describe('PRNG determinism', () => {
  it('produces same sequence for same seed', () => {
    const rng1 = createPRNG('same-seed');
    const rng2 = createPRNG('same-seed');

    const sequence1 = Array.from({ length: 10 }, () => rng1.random());
    const sequence2 = Array.from({ length: 10 }, () => rng2.random());

    expect(sequence1).toEqual(sequence2);
  });

  it('produces different sequences for different seeds', () => {
    const rng1 = createPRNG('seed-a');
    const rng2 = createPRNG('seed-b');

    const sequence1 = Array.from({ length: 10 }, () => rng1.random());
    const sequence2 = Array.from({ length: 10 }, () => rng2.random());

    expect(sequence1).not.toEqual(sequence2);
  });
});

describe('random()', () => {
  it('returns values between 0 and 1', () => {
    const rng = createPRNG('bounds-test');
    const values = Array.from({ length: 1000 }, () => rng.random());

    expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
  });

  it('increments call count', () => {
    const rng = createPRNG('count-test');
    expect(rng.getState().callCount).toBe(0);

    rng.random();
    expect(rng.getState().callCount).toBe(1);

    rng.random();
    rng.random();
    expect(rng.getState().callCount).toBe(3);
  });
});

describe('randomInt()', () => {
  it('returns integers in range [0, max)', () => {
    const rng = createPRNG('int-test');
    const values = Array.from({ length: 100 }, () => rng.randomInt(10));

    expect(values.every((v) => Number.isInteger(v) && v >= 0 && v < 10)).toBe(true);
  });

  it('produces variety of values', () => {
    const rng = createPRNG('variety-int');
    const values = Array.from({ length: 100 }, () => rng.randomInt(5));
    const unique = new Set(values);

    // Should hit all values 0-4 with 100 samples
    expect(unique.size).toBe(5);
  });
});

describe('randomElement()', () => {
  it('returns element from array', () => {
    const rng = createPRNG('element-test');
    const array = ['a', 'b', 'c', 'd'];
    const result = rng.randomElement(array);

    expect(array).toContain(result);
  });

  it('throws on empty array', () => {
    const rng = createPRNG('empty-test');
    expect(() => rng.randomElement([])).toThrow('Cannot pick from empty array');
  });

  it('produces variety of elements', () => {
    const rng = createPRNG('variety-element');
    const array = [1, 2, 3, 4, 5];
    const results = Array.from({ length: 100 }, () => rng.randomElement(array));
    const unique = new Set(results);

    expect(unique.size).toBe(5);
  });
});

describe('shuffle()', () => {
  it('returns array with same elements', () => {
    const rng = createPRNG('shuffle-test');
    const original = [1, 2, 3, 4, 5];
    const shuffled = rng.shuffle(original);

    expect(shuffled.sort()).toEqual(original.sort());
  });

  it('does not modify original array', () => {
    const rng = createPRNG('immutable-test');
    const original = [1, 2, 3, 4, 5];
    const copy = [...original];
    rng.shuffle(original);

    expect(original).toEqual(copy);
  });

  it('produces deterministic shuffles', () => {
    const rng1 = createPRNG('shuffle-seed');
    const rng2 = createPRNG('shuffle-seed');
    const array = [1, 2, 3, 4, 5, 6, 7, 8];

    const shuffle1 = rng1.shuffle(array);
    const shuffle2 = rng2.shuffle(array);

    expect(shuffle1).toEqual(shuffle2);
  });
});

describe('getState() and state restoration', () => {
  it('returns current state', () => {
    const rng = createPRNG('state-test');
    rng.random();
    rng.random();

    const state = rng.getState();
    expect(state.seed).toBe('state-test');
    expect(state.callCount).toBe(2);
  });

  it('restores state correctly', () => {
    const rng1 = createPRNG('restore-test');
    rng1.random();
    rng1.random();
    rng1.random();

    const state = rng1.getState();
    const nextValue1 = rng1.random();

    // Create new PRNG with same state
    const rng2 = createPRNG('restore-test', state);
    const nextValue2 = rng2.random();

    expect(nextValue1).toBe(nextValue2);
  });
});
