import { describe, it, expect } from 'vitest';
import { RULES } from './rules';
import { ATTRIBUTE_DOMAINS } from './attributes';
import { SeededRandom } from '../domain/random';

describe('Constant Rule', () => {
  const rule = RULES.constant;

  it('generates a row with all same values', () => {
    const rng = new SeededRandom('test-constant');
    const domain = ATTRIBUTE_DOMAINS.shape;
    const row = rule.generateRow(domain, rng);
    expect(row[0]).toBe(row[1]);
    expect(row[1]).toBe(row[2]);
  });

  it('validates correct rows', () => {
    expect(rule.validate([3, 3, 3])).toBe(true);
    expect(rule.validate([0, 0, 0])).toBe(true);
  });

  it('rejects incorrect rows', () => {
    expect(rule.validate([1, 2, 3])).toBe(false);
    expect(rule.validate([3, 3, 2])).toBe(false);
  });

  it('derives the third value', () => {
    expect(rule.deriveThird(5, 5)).toBe(5);
  });

  it('enumerates valid completions', () => {
    expect(rule.enumerateValid({ min: 0, max: 9 }, 3, 3)).toEqual([3]);
  });
});

describe('Progression Rule', () => {
  const rule = RULES.progression;

  it('generates a valid arithmetic progression', () => {
    const rng = new SeededRandom('test-progression');
    const domain = ATTRIBUTE_DOMAINS.color; // 0-9
    const row = rule.generateRow(domain, rng);
    expect(row[2] - row[1]).toBe(row[1] - row[0]);
  });

  it('validates correct progressions', () => {
    expect(rule.validate([1, 3, 5])).toBe(true); // step=2
    expect(rule.validate([8, 6, 4])).toBe(true); // step=-2
    expect(rule.validate([3, 4, 5])).toBe(true); // step=1
  });

  it('rejects non-progressions', () => {
    expect(rule.validate([1, 3, 4])).toBe(false);
    expect(rule.validate([0, 0, 1])).toBe(false);
  });

  it('derives the third value', () => {
    expect(rule.deriveThird(1, 3)).toBe(5);
    expect(rule.deriveThird(8, 6)).toBe(4);
  });

  it('enumerates valid completions within domain', () => {
    expect(rule.enumerateValid({ min: 0, max: 9 }, 1, 3)).toEqual([5]);
    expect(rule.enumerateValid({ min: 0, max: 4 }, 1, 3)).toEqual([]); // 5 out of range
  });

  it('stays within domain bounds for 100 seeds', () => {
    const domain = ATTRIBUTE_DOMAINS.size; // 0-5
    for (let i = 0; i < 100; i++) {
      const rng = new SeededRandom(`prog-${i}`);
      const row = rule.generateRow(domain, rng);
      for (const v of row) {
        expect(v).toBeGreaterThanOrEqual(domain.min);
        expect(v).toBeLessThanOrEqual(domain.max);
      }
      expect(rule.validate(row)).toBe(true);
    }
  });
});

describe('Arithmetic Rule', () => {
  const rule = RULES.arithmetic;

  it('generates a valid add row', () => {
    const rng = new SeededRandom('test-arith-add');
    const domain = ATTRIBUTE_DOMAINS.color;
    const row = rule.generateRow(domain, rng, { op: 'add' });
    expect(rule.validate(row, { op: 'add' })).toBe(true);
  });

  it('generates a valid sub row', () => {
    const rng = new SeededRandom('test-arith-sub');
    const domain = ATTRIBUTE_DOMAINS.color;
    const row = rule.generateRow(domain, rng, { op: 'sub' });
    expect(rule.validate(row, { op: 'sub' })).toBe(true);
  });

  it('validates add correctly', () => {
    expect(rule.validate([2, 3, 5], { op: 'add' })).toBe(true);
    expect(rule.validate([2, 3, 6], { op: 'add' })).toBe(false);
  });

  it('validates sub correctly', () => {
    expect(rule.validate([5, 3, 2], { op: 'sub' })).toBe(true);
    expect(rule.validate([5, 3, 3], { op: 'sub' })).toBe(false);
  });

  it('derives third for add', () => {
    expect(rule.deriveThird(2, 3, { op: 'add' })).toBe(5);
  });

  it('derives third for sub', () => {
    expect(rule.deriveThird(7, 3, { op: 'sub' })).toBe(4);
  });

  it('enumerates valid completions', () => {
    expect(rule.enumerateValid({ min: 0, max: 9 }, 2, 3, { op: 'add' })).toEqual([5]);
    expect(rule.enumerateValid({ min: 0, max: 4 }, 2, 3, { op: 'add' })).toEqual([]); // 5 out of range
  });
});

describe('Distribute Three Rule', () => {
  const rule = RULES.distribute_three;

  it('generates a row with 3 distinct values', () => {
    const rng = new SeededRandom('test-d3');
    const domain = ATTRIBUTE_DOMAINS.shape; // 0-4
    const row = rule.generateRow(domain, rng);
    expect(new Set(row).size).toBe(3);
  });

  it('validates rows with distinct values', () => {
    expect(rule.validate([0, 1, 2])).toBe(true);
    expect(rule.validate([4, 2, 0])).toBe(true);
  });

  it('rejects rows with duplicates', () => {
    expect(rule.validate([1, 1, 2])).toBe(false);
    expect(rule.validate([3, 3, 3])).toBe(false);
  });

  it('enumerates valid completions excluding a and b', () => {
    const valid = rule.enumerateValid({ min: 0, max: 4 }, 0, 1);
    expect(valid).toContain(2);
    expect(valid).toContain(3);
    expect(valid).toContain(4);
    expect(valid).not.toContain(0);
    expect(valid).not.toContain(1);
  });
});
