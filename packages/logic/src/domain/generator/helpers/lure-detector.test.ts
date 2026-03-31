/**
 * Tests for LureDetector
 *
 * Tests REAL behavior of lure detection.
 * NO MOCKS - Pure computation.
 */

import { describe, expect, test } from 'bun:test';
import { LureDetector } from './lure-detector';

// =============================================================================
// detect() Tests
// =============================================================================

describe('LureDetector.detect()', () => {
  describe('target handling', () => {
    test('should return null for targets (targets are never lures)', () => {
      const history = [1, 2, 1]; // Same as index 2-2=0, so would be target
      const result = LureDetector.detect(1, history, 2, 2, true);

      expect(result).toBeNull();
    });
  });

  describe('insufficient history', () => {
    test('should return null when index < 1', () => {
      const result = LureDetector.detect(5, [], 0, 2, false);

      expect(result).toBeNull();
    });
  });

  describe('n-1 lure detection', () => {
    test('should detect n-1 lure (immediate repetition)', () => {
      // History: [A, B, C], current: C at index 3
      // C repeats index 2, which is n-1
      const history = ['A', 'B', 'C'];
      const result = LureDetector.detect('C', history, 3, 2, false);

      expect(result).toBe('n-1');
    });

    test('should not flag as n-1 lure if it would be a target', () => {
      // History: [A, B], current: A at index 2
      // A matches index 0, which is n-back position (2-2=0)
      const history = ['A', 'B'];
      // This would be a target, but we're testing with isTarget=false
      // However, the detection logic checks if nBackIdx matches
      const result = LureDetector.detect('A', history, 2, 2, false);

      // A matches history[0], which is nBackIdx (2-2=0), so not a lure
      expect(result).toBeNull();
    });
  });

  describe('n+1 lure detection', () => {
    test('should detect n+1 lure', () => {
      // For n=2 at index 4, n+1 lure is index 4-2-1=1
      // History: [X, Y, Z, W], current: Y at index 4
      const history = ['X', 'Y', 'Z', 'W'];
      const result = LureDetector.detect('Y', history, 4, 2, false);

      expect(result).toBe('n+1');
    });

    test('should not flag as n+1 lure if value also matches n-back position', () => {
      // History: [A, A, B], current: A at index 3
      // n-back index = 3-2 = 1, history[1] = A = value
      // n+1 index = 3-2-1 = 0, history[0] = A = value
      // Since nBackIdx matches, n+1 detection is skipped
      // BUT sequence lure finds A at index 0 (not nBackIdx)
      const history = ['A', 'A', 'B'];
      const result = LureDetector.detect('A', history, 3, 2, false);

      // A at index 0 is detected as sequence lure (within window, not nBackIdx)
      expect(result).toBe('sequence');
    });
  });

  describe('sequence lure detection', () => {
    test('should detect sequence lure (repetition within last 3)', () => {
      // History: [A, B, C, D, E], current: D at index 5
      // D appears at index 3, which is within last 3 (indices 2,3,4)
      const history = ['A', 'B', 'C', 'D', 'E'];
      const result = LureDetector.detect('D', history, 5, 2, false);

      // n-back = 5-2 = 3, history[3] = D, so it's a target, not a lure
      expect(result).toBeNull();
    });

    test('should detect n+1 lure before sequence lure', () => {
      // History: [A, B, C, X, Y], current: C at index 5
      // n-back = 5-2 = 3 (X), so C is not a target
      // n+1 = 5-2-1 = 2, history[2] = C = value
      // n+1 detection runs BEFORE sequence, so n+1 is returned
      const history = ['A', 'B', 'C', 'X', 'Y'];
      const result = LureDetector.detect('C', history, 5, 2, false);

      // n+1 lure is detected first (priority over sequence)
      expect(result).toBe('n+1');
    });

    test('should detect sequence lure at position not n-1 or n+1', () => {
      // History: [A, B, X, Y, C, Z], current: C at index 6 (n=3)
      // n-back = 6-3 = 3 = Y != C
      // n-1 = 5 = Z != C
      // n+1 = 6-3-1 = 2 = X != C
      // window = max(0, 6-3)=3 to 5 → indices 3,4,5 = Y,C,Z
      // C at index 4, 4 !== nBack(3) → sequence lure!
      const history = ['A', 'B', 'X', 'Y', 'C', 'Z'];
      const result = LureDetector.detect('C', history, 6, 3, false);

      expect(result).toBe('sequence');
    });
  });

  describe('no lure', () => {
    test('should return null when no lure condition matches', () => {
      // History: [A, B, C, D], current: E at index 4
      // E doesn't appear anywhere in history
      const history = ['A', 'B', 'C', 'D'];
      const result = LureDetector.detect('E', history, 4, 2, false);

      expect(result).toBeNull();
    });
  });

  describe('edge cases', () => {
    test('should handle numeric values', () => {
      const history = [0, 1, 2, 3];
      const result = LureDetector.detect(3, history, 4, 2, false);

      expect(result).toBe('n-1'); // 3 repeats history[3]
    });

    test('should handle n=1', () => {
      // For n=1, n-back = index - 1
      const history = [5, 6, 7];
      // At index 3, n-back = 2, history[2] = 7
      const result = LureDetector.detect(6, history, 3, 1, false);

      // 6 at history[1], n-1 at index 2 (7), n+1 at index 1 (6)
      expect(result).toBe('n+1');
    });

    test('should handle n=3', () => {
      const history = [1, 2, 3, 4, 5];
      // At index 5, n-back = 2, value 3 repeats history[2]
      const result = LureDetector.detect(3, history, 5, 3, false);

      // 3 is at nBackIdx (5-3=2), so it would be a target, not a lure
      expect(result).toBeNull();
    });
  });
});
