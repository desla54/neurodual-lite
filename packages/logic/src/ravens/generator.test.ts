import { describe, it, expect } from 'vitest';
import { generateMatrix } from './generator';

describe('generateMatrix', () => {
  it('returns a valid matrix for a given seed', () => {
    const matrix = generateMatrix('test-seed-1', 1);
    expect(matrix.grid).toHaveLength(3);
    for (const row of matrix.grid) {
      expect(row).toHaveLength(3);
    }
    expect(matrix.answer).toBeDefined();
    expect(matrix.answer.entities.length).toBeGreaterThan(0);
    expect(matrix.distractors.length).toBe(matrix.optionCount - 1);
    expect(matrix.seed).toBe('test-seed-1');
  });

  it('is deterministic (same seed = same matrix)', () => {
    const m1 = generateMatrix('deterministic-seed', 5);
    const m2 = generateMatrix('deterministic-seed', 5);
    expect(m1.configId).toBe(m2.configId);
    expect(m1.answer).toEqual(m2.answer);
    expect(m1.grid).toEqual(m2.grid);
    expect(m1.distractors).toEqual(m2.distractors);
  });

  it('produces different matrices for different seeds', () => {
    const m1 = generateMatrix('seed-a', 3);
    const m2 = generateMatrix('seed-b', 3);
    // Very unlikely to be identical
    const key1 = JSON.stringify(m1.grid);
    const key2 = JSON.stringify(m2.grid);
    expect(key1).not.toBe(key2);
  });

  it('generates matrices for all difficulty levels', () => {
    for (let level = 1; level <= 10; level++) {
      const matrix = generateMatrix(`level-${level}`, level);
      expect(matrix.difficulty).toBe(level);
      expect(matrix.grid).toHaveLength(3);
      expect(matrix.distractors.length).toBeGreaterThan(0);
    }
  });

  it('answer is never equal to any distractor', () => {
    for (let i = 0; i < 50; i++) {
      const matrix = generateMatrix(`no-dup-${i}`, 5);
      const answerKey = JSON.stringify(matrix.answer);
      for (const d of matrix.distractors) {
        expect(JSON.stringify(d)).not.toBe(answerKey);
      }
    }
  });

  it('no duplicate distractors', () => {
    for (let i = 0; i < 50; i++) {
      const matrix = generateMatrix(`no-dup-dist-${i}`, 6);
      const keys = matrix.distractors.map((d) => JSON.stringify(d));
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});
