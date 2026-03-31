/**
 * Tests for Flexible Generator Strategy helpers
 *
 * Tests REAL behavior of flexible generation utilities.
 * NO MOCKS - Uses real SeededRandom and modality registry.
 */

import { describe, expect, test } from 'bun:test';
import { generateModalityStream, assembleFlexibleTrial } from './flexible-strategy';
import { LureDetector } from './helpers/lure-detector';
import { SeededRandom } from '../random';
import type { StimulusValue, ModalityId } from '../modality';

// =============================================================================
// generateModalityStream() Tests
// =============================================================================

describe('generateModalityStream()', () => {
  describe('inactive modality', () => {
    test('should return constant stream for inactive modality', () => {
      const rng = new SeededRandom('test');
      const stream = generateModalityStream(rng, 'position', 10, 2, false, 0.25, 0.15);

      expect(stream.length).toBe(10);
      const firstVal = stream[0];
      expect(stream.every((v) => v === firstVal)).toBe(true);
    });

    test('should use default value for color', () => {
      const rng = new SeededRandom('test');
      const stream = generateModalityStream(rng, 'color', 5, 2, false, 0.25, 0);

      expect(stream.every((v) => v === 'blue')).toBe(true);
    });
  });

  describe('active modality', () => {
    test('should return stream of correct length', () => {
      const rng = new SeededRandom('test');
      const stream = generateModalityStream(rng, 'position', 20, 2, true, 0.25, 0.15);

      expect(stream.length).toBe(20);
    });

    test('should produce values from pool', () => {
      const rng = new SeededRandom('test');
      const stream = generateModalityStream(rng, 'position', 30, 2, true, 0.25, 0.15);

      // All positions should be valid (0-7)
      expect(stream.every((v) => typeof v === 'number' && v >= 0 && v <= 7)).toBe(true);
    });

    test('should be reproducible with same seed', () => {
      const stream1 = generateModalityStream(
        new SeededRandom('fixed'),
        'position',
        20,
        2,
        true,
        0.25,
        0.15,
      );
      const stream2 = generateModalityStream(
        new SeededRandom('fixed'),
        'position',
        20,
        2,
        true,
        0.25,
        0.15,
      );

      expect(stream1).toEqual(stream2);
    });

    test('should produce targets with 100% probability', () => {
      const rng = new SeededRandom('target-test');
      const stream = generateModalityStream(rng, 'position', 10, 2, true, 1.0, 0);

      // After buffer, each value should equal n-back
      for (let i = 2; i < stream.length; i++) {
        expect(stream[i]).toBe(stream[i - 2]);
      }
    });

    test('should handle audio modality', () => {
      const rng = new SeededRandom('audio-test');
      const stream = generateModalityStream(rng, 'audio', 15, 2, true, 0.25, 0);

      expect(stream.length).toBe(15);
      // All should be valid sounds
      const validSounds = ['C', 'H', 'K', 'L', 'P', 'Q', 'R', 'T'];
      expect(stream.every((v) => validSounds.includes(v as string))).toBe(true);
    });

    test('should produce lures when lure probability is high', () => {
      const rng = new SeededRandom('lure-test');
      const stream = generateModalityStream(rng, 'position', 30, 2, true, 0, 0.8);

      // Count n-1 repetitions
      let lureCount = 0;
      for (let i = 2; i < stream.length; i++) {
        if (stream[i] === stream[i - 1]) {
          lureCount++;
        }
      }
      expect(lureCount).toBeGreaterThan(0);
    });
  });

  describe('edge cases', () => {
    test('should handle n=1', () => {
      const rng = new SeededRandom('1back');
      const stream = generateModalityStream(rng, 'position', 10, 1, true, 0.25, 0);

      expect(stream.length).toBe(10);
    });

    test('should handle n=4', () => {
      const rng = new SeededRandom('4back');
      const stream = generateModalityStream(rng, 'position', 15, 4, true, 0.25, 0);

      expect(stream.length).toBe(15);
    });
  });
});

// =============================================================================
// LureDetector.detect() Tests
// =============================================================================

describe('LureDetector.detect()', () => {
  test('should return null for targets', () => {
    const history = [1, 2, 1] as StimulusValue[];
    const result = LureDetector.detect(1, history, 2, 2, true);

    expect(result).toBeNull();
  });

  test('should detect n-1 lure', () => {
    const history = ['A', 'B', 'C'] as StimulusValue[];
    const result = LureDetector.detect('C', history, 3, 2, false);

    expect(result).toBe('n-1');
  });

  test('should detect n+1 lure', () => {
    const history = ['X', 'Y', 'Z', 'W'] as StimulusValue[];
    const result = LureDetector.detect('Y', history, 4, 2, false);

    expect(result).toBe('n+1');
  });

  test('should return null when no lure', () => {
    const history = ['A', 'B', 'C', 'D'] as StimulusValue[];
    const result = LureDetector.detect('E', history, 4, 2, false);

    expect(result).toBeNull();
  });
});

// =============================================================================
// assembleFlexibleTrial() Tests
// =============================================================================

describe('assembleFlexibleTrial()', () => {
  test('should create buffer trial', () => {
    const streams = new Map<ModalityId, StimulusValue[]>([
      ['position', [0, 1, 2, 3, 4]],
      ['audio', ['C', 'H', 'K', 'L', 'P']],
    ]);

    const trial = assembleFlexibleTrial(0, 2, ['position', 'audio'], streams);

    expect(trial.index).toBe(0);
    expect(trial.isBuffer).toBe(true);
    expect(trial.stimuli.size).toBe(2);
  });

  test('should create non-buffer trial', () => {
    const streams = new Map<ModalityId, StimulusValue[]>([
      ['position', [0, 1, 2, 3, 4]],
      ['audio', ['C', 'H', 'K', 'L', 'P']],
    ]);

    const trial = assembleFlexibleTrial(3, 2, ['position', 'audio'], streams);

    expect(trial.index).toBe(3);
    expect(trial.isBuffer).toBe(false);
  });

  test('should detect targets (n-back match)', () => {
    // Position at index 2 matches index 0 (n-back=2)
    const streams = new Map<ModalityId, StimulusValue[]>([
      ['position', [5, 3, 5]], // index 2 matches index 0
    ]);

    const trial = assembleFlexibleTrial(2, 2, ['position'], streams);

    const posStimulus = trial.stimuli.get('position');
    expect(posStimulus?.isTarget).toBe(true);
  });

  test('should detect non-targets', () => {
    // Position at index 2 does NOT match index 0
    const streams = new Map<ModalityId, StimulusValue[]>([
      ['position', [5, 3, 7]], // index 2 (7) != index 0 (5)
    ]);

    const trial = assembleFlexibleTrial(2, 2, ['position'], streams);

    const posStimulus = trial.stimuli.get('position');
    expect(posStimulus?.isTarget).toBe(false);
  });

  test('should handle missing streams gracefully', () => {
    const streams = new Map<ModalityId, StimulusValue[]>([
      ['position', [0, 1, 2]],
      // audio stream missing
    ]);

    const trial = assembleFlexibleTrial(1, 2, ['position', 'audio'], streams);

    expect(trial.stimuli.size).toBe(1);
    expect(trial.stimuli.has('position')).toBe(true);
    expect(trial.stimuli.has('audio')).toBe(false);
  });

  test('should include lure detection', () => {
    // Create a lure scenario: index 3 repeats index 2 (n-1 lure)
    const streams = new Map<ModalityId, StimulusValue[]>([
      ['position', [0, 1, 5, 5]], // index 3 = index 2 (n-1 lure)
    ]);

    // At index 3, n-back = index 1 (value 1), current value 5 != 1 (not target)
    // But 5 == index 2 (n-1), so it's a lure
    const trial = assembleFlexibleTrial(3, 2, ['position'], streams);

    const posStimulus = trial.stimuli.get('position');
    expect(posStimulus?.isLure).toBe(true);
    expect(posStimulus?.lureType).toBe('n-1');
  });

  test('should work with single modality', () => {
    const streams = new Map<ModalityId, StimulusValue[]>([['position', [0, 1, 2, 3]]]);

    const trial = assembleFlexibleTrial(2, 2, ['position'], streams);

    expect(trial.stimuli.size).toBe(1);
  });

  test('should work with multiple modalities', () => {
    const streams = new Map<ModalityId, StimulusValue[]>([
      ['position', [0, 1, 2, 3, 4]],
      ['audio', ['C', 'H', 'K', 'L', 'P']],
      ['color', ['red', 'blue', 'green', 'yellow', 'red']],
    ]);

    const trial = assembleFlexibleTrial(3, 2, ['position', 'audio', 'color'], streams);

    expect(trial.stimuli.size).toBe(3);
    expect(trial.stimuli.has('position')).toBe(true);
    expect(trial.stimuli.has('audio')).toBe(true);
    expect(trial.stimuli.has('color')).toBe(true);
  });
});
