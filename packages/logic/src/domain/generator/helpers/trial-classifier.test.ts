/**
 * Tests for TrialClassifier
 *
 * Tests REAL behavior of trial classification.
 * NO MOCKS - Pure computation.
 */

import { describe, expect, test } from 'bun:test';
import { TrialClassifier } from './trial-classifier';

// =============================================================================
// classify() Tests
// =============================================================================

describe('TrialClassifier.classify()', () => {
  describe('buffer trials', () => {
    test('should return Tampon for buffer trials regardless of targets', () => {
      // Buffer with no targets
      expect(TrialClassifier.classify(true, false, false, false)).toBe('Tampon');

      // Buffer with position target
      expect(TrialClassifier.classify(true, true, false, false)).toBe('Tampon');

      // Buffer with sound target
      expect(TrialClassifier.classify(true, false, true, false)).toBe('Tampon');

      // Buffer with all targets
      expect(TrialClassifier.classify(true, true, true, true)).toBe('Tampon');
    });
  });

  describe('dual targets', () => {
    test('should return Dual for position + sound', () => {
      const result = TrialClassifier.classify(false, true, true, false);

      expect(result).toBe('Dual');
    });

    test('should return Dual for position + color', () => {
      const result = TrialClassifier.classify(false, true, false, true);

      expect(result).toBe('Dual');
    });

    test('should return Dual for sound + color', () => {
      const result = TrialClassifier.classify(false, false, true, true);

      expect(result).toBe('Dual');
    });

    test('should return Dual for all three targets', () => {
      const result = TrialClassifier.classify(false, true, true, true);

      expect(result).toBe('Dual');
    });
  });

  describe('visual-only targets', () => {
    test('should return V-Seul for position target only', () => {
      const result = TrialClassifier.classify(false, true, false, false);

      expect(result).toBe('V-Seul');
    });

    test('should return V-Seul for color target only', () => {
      const result = TrialClassifier.classify(false, false, false, true);

      expect(result).toBe('V-Seul');
    });
  });

  describe('audio-only targets', () => {
    test('should return A-Seul for sound target only', () => {
      const result = TrialClassifier.classify(false, false, true, false);

      expect(result).toBe('A-Seul');
    });
  });

  describe('non-targets', () => {
    test('should return Non-Cible when no targets', () => {
      const result = TrialClassifier.classify(false, false, false, false);

      expect(result).toBe('Non-Cible');
    });
  });
});

// =============================================================================
// isTarget() Tests
// =============================================================================

describe('TrialClassifier.isTarget()', () => {
  test('should return true for position target', () => {
    expect(TrialClassifier.isTarget(true, false, false)).toBe(true);
  });

  test('should return true for sound target', () => {
    expect(TrialClassifier.isTarget(false, true, false)).toBe(true);
  });

  test('should return true for color target', () => {
    expect(TrialClassifier.isTarget(false, false, true)).toBe(true);
  });

  test('should return true for multiple targets', () => {
    expect(TrialClassifier.isTarget(true, true, false)).toBe(true);
    expect(TrialClassifier.isTarget(true, false, true)).toBe(true);
    expect(TrialClassifier.isTarget(false, true, true)).toBe(true);
    expect(TrialClassifier.isTarget(true, true, true)).toBe(true);
  });

  test('should return false for no targets', () => {
    expect(TrialClassifier.isTarget(false, false, false)).toBe(false);
  });
});

// =============================================================================
// isVisualTarget() Tests
// =============================================================================

describe('TrialClassifier.isVisualTarget()', () => {
  test('should return true for position target', () => {
    expect(TrialClassifier.isVisualTarget(true, false)).toBe(true);
  });

  test('should return true for color target', () => {
    expect(TrialClassifier.isVisualTarget(false, true)).toBe(true);
  });

  test('should return true for both position and color', () => {
    expect(TrialClassifier.isVisualTarget(true, true)).toBe(true);
  });

  test('should return false for no visual targets', () => {
    expect(TrialClassifier.isVisualTarget(false, false)).toBe(false);
  });
});

// =============================================================================
// isDualTarget() Tests
// =============================================================================

describe('TrialClassifier.isDualTarget()', () => {
  test('should return false for no targets', () => {
    expect(TrialClassifier.isDualTarget(false, false, false)).toBe(false);
  });

  test('should return false for single target', () => {
    expect(TrialClassifier.isDualTarget(true, false, false)).toBe(false);
    expect(TrialClassifier.isDualTarget(false, true, false)).toBe(false);
    expect(TrialClassifier.isDualTarget(false, false, true)).toBe(false);
  });

  test('should return true for two targets', () => {
    expect(TrialClassifier.isDualTarget(true, true, false)).toBe(true);
    expect(TrialClassifier.isDualTarget(true, false, true)).toBe(true);
    expect(TrialClassifier.isDualTarget(false, true, true)).toBe(true);
  });

  test('should return true for three targets', () => {
    expect(TrialClassifier.isDualTarget(true, true, true)).toBe(true);
  });
});
