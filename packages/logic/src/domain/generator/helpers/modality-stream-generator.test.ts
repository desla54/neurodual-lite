/**
 * Tests for ModalityStreamGenerator
 *
 * Tests REAL behavior of stream generation.
 * NO MOCKS - Uses real SeededRandom for reproducibility.
 */

import { describe, expect, test, beforeEach } from 'bun:test';
import { ModalityStreamGenerator } from './modality-stream-generator';
import { SeededRandom } from '../../random';

// =============================================================================
// Fixtures
// =============================================================================

const POSITIONS = [0, 1, 2, 3, 4, 5, 6, 7] as const;
const SOUNDS = ['C', 'H', 'K', 'L', 'Q', 'R', 'S', 'T'] as const;
const COLORS = ['red', 'blue', 'green', 'yellow'] as const;

// =============================================================================
// generateStream() Tests
// =============================================================================

describe('ModalityStreamGenerator.generateStream()', () => {
  let generator: ModalityStreamGenerator;

  beforeEach(() => {
    generator = new ModalityStreamGenerator(new SeededRandom('test-seed'));
  });

  describe('inactive modality', () => {
    test('should return constant stream for inactive modality', () => {
      const stream = generator.generateStream(
        POSITIONS,
        10,
        2,
        false, // inactive
        0.25,
        0.15,
        'exclusive',
      );

      expect(stream.length).toBe(10);
      // All values should be the same (first pool element)
      const firstValue = stream[0];
      expect(stream.every((v) => v === firstValue)).toBe(true);
    });

    test('should use default value when provided', () => {
      const stream = generator.generateStream(
        COLORS,
        5,
        2,
        false,
        0.25,
        0,
        'exclusive',
        'blue', // default value
      );

      expect(stream.every((v) => v === 'blue')).toBe(true);
    });

    test('should use first pool element when no default', () => {
      const stream = generator.generateStream(POSITIONS, 5, 2, false, 0.25, 0, 'exclusive');

      expect(stream.every((v) => v === 0)).toBe(true);
    });

    test('should throw for empty pool without default', () => {
      expect(() => generator.generateStream([], 5, 2, false, 0.25, 0, 'exclusive')).toThrow(
        'Empty pool and no default value',
      );
    });
  });

  describe('active modality - basic properties', () => {
    test('should return stream of correct length', () => {
      const stream = generator.generateStream(POSITIONS, 20, 2, true, 0.25, 0.15, 'exclusive');

      expect(stream.length).toBe(20);
    });

    test('should contain only values from pool', () => {
      const stream = generator.generateStream(SOUNDS, 50, 2, true, 0.25, 0.15, 'exclusive');

      expect(stream.every((v) => SOUNDS.includes(v as (typeof SOUNDS)[number]))).toBe(true);
    });

    test('should be reproducible with same seed', () => {
      const gen1 = new ModalityStreamGenerator(new SeededRandom('fixed'));
      const gen2 = new ModalityStreamGenerator(new SeededRandom('fixed'));

      const stream1 = gen1.generateStream(POSITIONS, 20, 2, true, 0.25, 0.15, 'exclusive');
      const stream2 = gen2.generateStream(POSITIONS, 20, 2, true, 0.25, 0.15, 'exclusive');

      expect(stream1).toEqual(stream2);
    });

    test('should produce different streams with different seeds', () => {
      const gen1 = new ModalityStreamGenerator(new SeededRandom('seed-a'));
      const gen2 = new ModalityStreamGenerator(new SeededRandom('seed-b'));

      const stream1 = gen1.generateStream(POSITIONS, 20, 2, true, 0.25, 0.15, 'exclusive');
      const stream2 = gen2.generateStream(POSITIONS, 20, 2, true, 0.25, 0.15, 'exclusive');

      // Very unlikely to be identical with different seeds
      expect(stream1).not.toEqual(stream2);
    });
  });

  describe('buffer trials', () => {
    test('should generate random values for buffer positions', () => {
      const stream = generator.generateStream(
        POSITIONS,
        10,
        2, // first 2 are buffer
        true,
        0.25,
        0,
        'exclusive',
      );

      // Buffer values are random, just check they exist
      expect(stream[0]).toBeDefined();
      expect(stream[1]).toBeDefined();
    });
  });

  describe('exclusive mode', () => {
    test('should generate targets (value equals n-back value)', () => {
      // Use 100% target probability to guarantee targets
      const gen = new ModalityStreamGenerator(new SeededRandom('exclusive-target'));
      const stream = gen.generateStream(
        POSITIONS,
        10,
        2, // 2-back
        true,
        1.0, // 100% target probability
        0,
        'exclusive',
      );

      // After buffer, each value should equal n-back
      for (let i = 2; i < stream.length; i++) {
        expect(stream[i]).toBe(stream[i - 2]);
      }
    });

    test('should generate non-targets different from n-back with 0% target prob', () => {
      const gen = new ModalityStreamGenerator(new SeededRandom('exclusive-non-target'));
      const stream = gen.generateStream(
        POSITIONS,
        20,
        2,
        true,
        0, // 0% target probability
        0, // 0% lure probability
        'exclusive',
      );

      // After buffer, values should generally differ from n-back
      // (not guaranteed 100% due to randomness, but mostly different)
      let differentCount = 0;
      for (let i = 2; i < stream.length; i++) {
        if (stream[i] !== stream[i - 2]) {
          differentCount++;
        }
      }
      // Most should be different
      expect(differentCount).toBeGreaterThan(stream.length / 2);
    });
  });

  describe('independent mode', () => {
    test('should generate targets when target prob is 100%', () => {
      const gen = new ModalityStreamGenerator(new SeededRandom('independent-target'));
      const stream = gen.generateStream(
        SOUNDS,
        10,
        2,
        true,
        1.0, // 100% target
        0,
        'independent',
      );

      // After buffer, each value should equal n-back
      for (let i = 2; i < stream.length; i++) {
        expect(stream[i]).toBe(stream[i - 2]);
      }
    });

    test('should allow lure even when it equals n-back value', () => {
      // This is the key difference between independent and exclusive modes
      // In independent mode, lure can be generated even if it matches n-back
      const gen = new ModalityStreamGenerator(new SeededRandom('independent-lure'));
      const stream = gen.generateStream(
        ['A', 'B'] as const, // Small pool to increase collision
        20,
        2,
        true,
        0, // 0% target
        1.0, // 100% lure
        'independent',
      );

      // Values should often repeat the n-1 value
      let lureCount = 0;
      for (let i = 2; i < stream.length; i++) {
        if (stream[i] === stream[i - 1]) {
          lureCount++;
        }
      }
      // Most should be lures (n-1 repetitions)
      expect(lureCount).toBeGreaterThan(0);
    });
  });

  describe('lure generation (n-1)', () => {
    test('should generate lures in exclusive mode when lure prob is high', () => {
      const gen = new ModalityStreamGenerator(new SeededRandom('lure-test'));
      const stream = gen.generateStream(
        POSITIONS,
        30,
        2,
        true,
        0, // 0% target
        0.8, // 80% lure
        'exclusive',
      );

      // Count n-1 repetitions (lures)
      let lureCount = 0;
      for (let i = 2; i < stream.length; i++) {
        if (stream[i] === stream[i - 1]) {
          lureCount++;
        }
      }
      // Should have some lures
      expect(lureCount).toBeGreaterThan(0);
    });
  });

  describe('edge cases', () => {
    test('should handle n=1 (1-back)', () => {
      const stream = generator.generateStream(
        POSITIONS,
        10,
        1, // 1-back
        true,
        0.5,
        0,
        'exclusive',
      );

      expect(stream.length).toBe(10);
    });

    test('should handle n=3 (3-back)', () => {
      const stream = generator.generateStream(
        SOUNDS,
        15,
        3, // 3-back
        true,
        0.5,
        0,
        'exclusive',
      );

      expect(stream.length).toBe(15);
    });

    test('should handle single element pool', () => {
      const stream = generator.generateStream(['X'] as const, 10, 2, true, 0.5, 0.5, 'exclusive');

      expect(stream.every((v) => v === 'X')).toBe(true);
    });

    test('should handle length equal to nLevel (all buffer)', () => {
      const stream = generator.generateStream(
        POSITIONS,
        2, // length = nLevel
        2,
        true,
        0.5,
        0,
        'exclusive',
      );

      expect(stream.length).toBe(2);
      // All values are buffer (random)
    });

    test('should handle zero length', () => {
      const stream = generator.generateStream(POSITIONS, 0, 2, true, 0.5, 0, 'exclusive');

      expect(stream.length).toBe(0);
    });
  });

  describe('mode parameter', () => {
    test('should default to exclusive mode', () => {
      const gen1 = new ModalityStreamGenerator(new SeededRandom('mode-test'));
      const gen2 = new ModalityStreamGenerator(new SeededRandom('mode-test'));

      // Without mode parameter
      const stream1 = gen1.generateStream(POSITIONS, 20, 2, true, 0.25, 0.15);

      // With explicit exclusive mode
      const stream2 = gen2.generateStream(POSITIONS, 20, 2, true, 0.25, 0.15, 'exclusive');

      expect(stream1).toEqual(stream2);
    });
  });
});

// =============================================================================
// Statistical Properties Tests
// =============================================================================

describe('ModalityStreamGenerator statistical properties', () => {
  test('should produce targets at approximately the target rate', () => {
    const gen = new ModalityStreamGenerator(new SeededRandom('stat-target'));
    const stream = gen.generateStream(
      POSITIONS,
      102, // 100 non-buffer trials + 2 buffer
      2,
      true,
      0.25, // 25% target rate
      0,
      'exclusive',
    );

    // Count targets (matches n-back)
    let targetCount = 0;
    for (let i = 2; i < stream.length; i++) {
      if (stream[i] === stream[i - 2]) {
        targetCount++;
      }
    }

    const actualRate = targetCount / 100;
    // Should be roughly around 25% (allowing variance)
    expect(actualRate).toBeGreaterThan(0.1);
    expect(actualRate).toBeLessThan(0.5);
  });

  test('should use all pool values over many trials', () => {
    const gen = new ModalityStreamGenerator(new SeededRandom('stat-coverage'));
    const stream = gen.generateStream(
      POSITIONS, // 8 positions
      200,
      2,
      true,
      0.25,
      0.15,
      'exclusive',
    );

    const usedPositions = new Set(stream);
    // Should use most or all positions over 200 trials
    expect(usedPositions.size).toBeGreaterThanOrEqual(6);
  });
});
