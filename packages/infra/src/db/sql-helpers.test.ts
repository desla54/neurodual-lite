/**
 * Unit tests for SQL helper functions
 *
 * Tests coverage for:
 * - percentile() - Statistical percentile calculation
 * - stddev() - Sample standard deviation
 * - buildPlaceholders() - SQL IN clause placeholders
 * - buildInClause() - SQL IN clause with values
 * - safeJsonParse() - Safe JSON parsing
 */

import { describe, expect, it } from 'bun:test';
import {
  percentile,
  stddev,
  buildPlaceholders,
  buildInClause,
  safeJsonParse,
  parseSqlDate,
  parseSqlDateToMs,
  toFiniteNumber,
} from './sql-helpers';

describe('percentile', () => {
  describe('edge cases', () => {
    it('should return null for empty array', () => {
      expect(percentile([], 0.5)).toBeNull();
    });

    it('should return the single value for array of length 1', () => {
      expect(percentile([42], 0.5)).toBe(42);
      expect(percentile([100], 0.25)).toBe(100);
      expect(percentile([0], 0.75)).toBe(0);
    });
  });

  describe('common percentiles', () => {
    it('should calculate median (50th percentile) correctly', () => {
      expect(percentile([1, 2, 3, 4, 5], 0.5)).toBe(3);
      expect(percentile([10, 20, 30], 0.5)).toBe(20);
      expect(percentile([1, 2, 3, 4], 0.5)).toBe(2.5);
      expect(percentile([10, 20, 30, 40], 0.5)).toBe(25);
    });

    it('should calculate Q1 (25th percentile) correctly', () => {
      // Matches PERCENTILE_CONT linear interpolation (PostgreSQL behavior)
      expect(percentile([1, 2, 3, 4, 5, 6, 7, 8], 0.25)).toBe(2.75);
      expect(percentile([10, 20, 30, 40, 50], 0.25)).toBe(20);
    });

    it('should calculate Q3 (75th percentile) correctly', () => {
      // Matches PERCENTILE_CONT linear interpolation (PostgreSQL behavior)
      expect(percentile([1, 2, 3, 4, 5, 6, 7, 8], 0.75)).toBe(6.25);
      expect(percentile([10, 20, 30, 40, 50], 0.75)).toBe(40);
    });
  });

  describe('interpolation behavior', () => {
    it('should interpolate between values correctly', () => {
      const arr = [10, 20, 30, 40];
      const lower = 20;
      const upper = 30;
      const weight = 0.5;
      const expected = lower * (1 - weight) + upper * weight;
      expect(percentile(arr, 0.5)).toBe(expected);
    });

    it('should handle negative values', () => {
      expect(percentile([-5, -3, -1, 0, 2, 4], 0.5)).toBe(-0.5);
      expect(percentile([-10, -5, 0, 5, 10], 0.5)).toBe(0);
    });

    it('should handle decimal values', () => {
      expect(percentile([1.1, 2.2, 3.3, 4.4], 0.5)).toBe(2.75);
    });
  });

  describe('boundary percentiles', () => {
    it('should return minimum for 0th percentile', () => {
      expect(percentile([5, 10, 15, 20], 0)).toBe(5);
    });

    it('should return maximum for 100th percentile', () => {
      expect(percentile([5, 10, 15, 20], 1)).toBe(20);
    });
  });
});

describe('stddev', () => {
  describe('edge cases', () => {
    it('should return null for empty array', () => {
      expect(stddev([])).toBeNull();
    });

    it('should return null for single element array', () => {
      expect(stddev([42])).toBeNull();
    });
  });

  describe('basic calculations', () => {
    it('should calculate standard deviation correctly for simple case', () => {
      const result = stddev([2, 4, 4, 4, 5, 5, 7, 9]);
      expect(result).toBeCloseTo(2.1380899, 5);
    });

    it('should calculate standard deviation for uniform distribution', () => {
      expect(stddev([5, 5, 5, 5, 5])).toBeCloseTo(0, 5);
    });

    it('should handle two elements', () => {
      const result = stddev([0, 10]);
      expect(result).toBeCloseTo(7.0710678, 5);
    });
  });

  describe('various data distributions', () => {
    it('should handle negative values', () => {
      const result = stddev([-5, -2, 0, 2, 5]);
      // Sample standard deviation (n-1), matches stddev() implementation
      expect(result).toBeCloseTo(3.8078866, 5);
    });

    it('should handle large numbers', () => {
      const result = stddev([1000, 2000, 3000, 4000]);
      // Sample standard deviation (n-1)
      expect(result).toBeCloseTo(1290.9944, 3);
    });

    it('should handle decimal values', () => {
      const result = stddev([1.5, 2.5, 3.5]);
      expect(result).toBeCloseTo(1, 5);
    });
  });

  describe('Bessel correction', () => {
    it('should use n-1 denominator (sample standard deviation)', () => {
      const result = stddev([1, 2, 3, 4, 5]);
      expect(result).toBeCloseTo(1.5811388, 5);
    });
  });
});

describe('buildPlaceholders', () => {
  describe('edge cases', () => {
    it('should return empty string for zero count', () => {
      expect(buildPlaceholders(0)).toBe('');
    });

    it('should return empty string for negative count', () => {
      expect(buildPlaceholders(-1)).toBe('');
      expect(buildPlaceholders(-5)).toBe('');
    });
  });

  describe('generating placeholders', () => {
    it('should generate single placeholder', () => {
      expect(buildPlaceholders(1)).toBe('?');
    });

    it('should generate multiple placeholders', () => {
      expect(buildPlaceholders(3)).toBe('?, ?, ?');
      expect(buildPlaceholders(5)).toBe('?, ?, ?, ?, ?');
    });

    it('should generate placeholders without trailing space', () => {
      const result = buildPlaceholders(2);
      expect(result.endsWith(' ')).toBe(false);
      expect(result.startsWith(' ')).toBe(false);
    });
  });

  describe('large counts', () => {
    it('should handle large counts efficiently', () => {
      const count = 100;
      const result = buildPlaceholders(count);
      const placeholders = result.split(', ');
      expect(placeholders).toHaveLength(count);
      expect(placeholders.every((p) => p === '?')).toBe(true);
    });
  });
});

describe('buildInClause', () => {
  describe('edge cases', () => {
    it('should return impossible condition for empty array', () => {
      const result = buildInClause([]);
      expect(result.sql).toBe('(NULL)');
      expect(result.params).toEqual([]);
    });
  });

  describe('basic functionality', () => {
    it('should build IN clause with single value', () => {
      const result = buildInClause(['a']);
      expect(result.sql).toBe('(?)');
      expect(result.params).toEqual(['a']);
    });

    it('should build IN clause with multiple values', () => {
      const result = buildInClause(['a', 'b', 'c']);
      expect(result.sql).toBe('(?, ?, ?)');
      expect(result.params).toEqual(['a', 'b', 'c']);
    });

    it('should preserve order of values', () => {
      const values = ['first', 'second', 'third'];
      const result = buildInClause(values);
      expect(result.params).toEqual(values);
    });
  });

  describe('various data types', () => {
    it('should handle numbers', () => {
      const result = buildInClause([1, 2, 3]);
      expect(result.sql).toBe('(?, ?, ?)');
      expect(result.params).toEqual([1, 2, 3]);
    });

    it('should handle mixed types', () => {
      const result = buildInClause([1, 'two', 3.5, null]);
      expect(result.sql).toBe('(?, ?, ?, ?)');
      expect(result.params).toEqual([1, 'two', 3.5, null]);
    });

    it('should handle strings with special characters', () => {
      const result = buildInClause(["test's", '"quoted"', 'normal']);
      expect(result.sql).toBe('(?, ?, ?)');
      expect(result.params).toEqual(["test's", '"quoted"', 'normal']);
    });
  });

  describe('large arrays', () => {
    it('should handle large number of values', () => {
      const values = Array.from({ length: 100 }, (_, i) => `id-${i}`);
      const result = buildInClause(values);
      const expectedPlaceholders = Array(100).fill('?').join(', ');
      expect(result.sql).toBe(`(${expectedPlaceholders})`);
      expect(result.params).toHaveLength(100);
    });
  });
});

describe('safeJsonParse', () => {
  describe('error handling', () => {
    it('should return fallback for null input', () => {
      const fallback = { default: true };
      expect(safeJsonParse(null, fallback)).toBe(fallback);
    });

    it('should return fallback for empty string', () => {
      const fallback = { default: true };
      expect(safeJsonParse('', fallback)).toBe(fallback);
    });

    it('should return fallback for empty string', () => {
      const fallback = { default: true };
      expect(safeJsonParse('', fallback)).toBe(fallback);
    });

    it('should return fallback for invalid JSON', () => {
      const fallback = { default: true };
      expect(safeJsonParse('not valid json', fallback)).toBe(fallback);
      expect(safeJsonParse('{invalid}', fallback)).toBe(fallback);
      expect(safeJsonParse('undefined', fallback)).toBe(fallback);
    });
  });

  describe('valid JSON', () => {
    it('should parse valid object JSON', () => {
      const input = '{"key": "value", "number": 42}';
      const result = safeJsonParse(input, { default: false });
      expect(result as any).toEqual({ key: 'value', number: 42 });
    });

    it('should parse valid array JSON', () => {
      const input = '[1, 2, 3, 4, 5]';
      const result = safeJsonParse(input, []);
      expect(result as any).toEqual([1, 2, 3, 4, 5]);
    });

    it('should parse primitive values', () => {
      expect(safeJsonParse('true', false)).toBe(true);
      expect(safeJsonParse('false', true)).toBe(false);
      expect(safeJsonParse('null', {})).toBeNull();
      expect(safeJsonParse('42', 0)).toBe(42);
      expect(safeJsonParse('"string"', '')).toBe('string');
    });
  });

  describe('type inference', () => {
    it('should preserve type based on fallback parameter', () => {
      const fallback = { key: '' };
      const input = '{"key": "value"}';
      const result = safeJsonParse(input, fallback);
      expect(result.key).toBe('value');
    });

    it('should handle complex nested structures', () => {
      const input = JSON.stringify({
        nested: { deep: { value: 123 } },
        array: [{ id: 1 }, { id: 2 }],
      });
      const result = safeJsonParse(input, {
        nested: { deep: { value: 0 } },
        array: [{ id: 0 }],
      });
      expect(result.nested.deep.value).toBe(123);
      expect(result.array).toHaveLength(2);
    });
  });

  describe('fallback types', () => {
    it('should use different fallback types correctly', () => {
      expect(safeJsonParse('invalid', {})).toEqual({});
      expect(safeJsonParse('invalid', [])).toEqual([]);
      expect(safeJsonParse('invalid', 'fallback')).toBe('fallback');
      expect(safeJsonParse('invalid', 42)).toBe(42);
      expect(safeJsonParse('invalid', true)).toBe(true);
      expect(safeJsonParse('invalid', null)).toBeNull();
    });
  });

  describe('realistic SQLite scenarios', () => {
    it('should handle TEXT column storing JSON', () => {
      const dbValue = '{"config": {"level": 2, "mode": "dual-catch"}}';
      const result = safeJsonParse(dbValue, {
        config: { level: 0, mode: '' },
      });
      expect(result.config.level).toBe(2);
      expect(result.config.mode).toBe('dual-catch');
    });

    it('should handle malformed data from database', () => {
      const corruptedValue = 'corrupted data from crash';
      const fallback = { level: 1, mode: 'default' };
      const result = safeJsonParse(corruptedValue, fallback);
      expect(result).toBe(fallback);
    });
  });
});

describe('parseSqlDate', () => {
  it('parses ISO strings without timezone as UTC', () => {
    const parsed = parseSqlDate('2026-03-16T10:20:30.000');
    expect(parsed?.toISOString()).toBe('2026-03-16T10:20:30.000Z');
  });

  it('parses numeric timestamps from SQLite-ish values', () => {
    const parsed = parseSqlDate('1710000000000');
    expect(parsed?.getTime()).toBe(1710000000000);
    expect(parseSqlDateToMs(1710000000000)).toBe(1710000000000);
  });

  it('returns null for malformed dates', () => {
    expect(parseSqlDate('not-a-date')).toBeNull();
    expect(parseSqlDateToMs('')).toBeNull();
  });
});

describe('toFiniteNumber', () => {
  it('coerces finite numeric strings', () => {
    expect(toFiniteNumber('42')).toBe(42);
  });

  it('falls back for nullish and invalid values', () => {
    expect(toFiniteNumber(null, 7)).toBe(7);
    expect(toFiniteNumber('NaN', 7)).toBe(7);
  });
});
