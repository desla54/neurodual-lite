import { describe, it, expect } from 'bun:test';
import {
  buildStandardModalities,
  buildUniformTargetProbabilities,
  buildUniformLureProbabilities,
  buildNoImmediateRepeatConstraints,
} from './standard-spec';
import { POSITIONS, SOUNDS, COLORS } from '../../types/core';

// ---------------------------------------------------------------------------
// buildStandardModalities
// ---------------------------------------------------------------------------

describe('buildStandardModalities', () => {
  it('maps "position" to numeric values (POSITIONS.length)', () => {
    const result = buildStandardModalities(['position']);
    expect(result).toEqual([{ id: 'position', values: POSITIONS.length }]);
  });

  it('maps "audio" to SOUNDS array', () => {
    const result = buildStandardModalities(['audio']);
    expect(result).toEqual([{ id: 'audio', values: SOUNDS }]);
  });

  it('maps "color" to COLORS array', () => {
    const result = buildStandardModalities(['color']);
    expect(result).toEqual([{ id: 'color', values: COLORS }]);
  });

  it('builds dual modality (position + audio)', () => {
    const result = buildStandardModalities(['position', 'audio']);
    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe('position');
    expect(result[1]!.id).toBe('audio');
  });

  it('builds triple modality (position + audio + color)', () => {
    const result = buildStandardModalities(['position', 'audio', 'color']);
    expect(result).toHaveLength(3);
  });

  it('preserves input order', () => {
    const result = buildStandardModalities(['color', 'position', 'audio']);
    expect(result.map((m) => m.id)).toEqual(['color', 'position', 'audio']);
  });

  it('ignores unknown modality ids', () => {
    const result = buildStandardModalities(['position', 'smell', 'audio']);
    expect(result).toHaveLength(2);
    expect(result.map((m) => m.id)).toEqual(['position', 'audio']);
  });

  it('falls back to classic dual (position + audio) when empty', () => {
    const result = buildStandardModalities([]);
    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe('position');
    expect(result[0]!.values).toBe(POSITIONS.length);
    expect(result[1]!.id).toBe('audio');
    expect(result[1]!.values).toBe(SOUNDS);
  });

  it('falls back to classic dual when all ids are unknown', () => {
    const result = buildStandardModalities(['taste', 'smell']);
    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe('position');
    expect(result[1]!.id).toBe('audio');
  });

  it('returns position values as a number (length), not an array', () => {
    const result = buildStandardModalities(['position']);
    expect(typeof result[0]!.values).toBe('number');
  });

  it('returns audio and color values as arrays', () => {
    const result = buildStandardModalities(['audio', 'color']);
    expect(Array.isArray(result[0]!.values)).toBe(true);
    expect(Array.isArray(result[1]!.values)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildUniformTargetProbabilities
// ---------------------------------------------------------------------------

describe('buildUniformTargetProbabilities', () => {
  it('assigns same probability to every modality', () => {
    const result = buildUniformTargetProbabilities(['position', 'audio'], 0.3);
    expect(result).toEqual({ position: 0.3, audio: 0.3 });
  });

  it('works with a single modality', () => {
    const result = buildUniformTargetProbabilities(['color'], 0.5);
    expect(result).toEqual({ color: 0.5 });
  });

  it('returns empty object for empty modalities', () => {
    const result = buildUniformTargetProbabilities([], 0.3);
    expect(result).toEqual({});
  });

  it('handles zero probability', () => {
    const result = buildUniformTargetProbabilities(['position'], 0);
    expect(result).toEqual({ position: 0 });
  });

  it('handles probability of 1.0', () => {
    const result = buildUniformTargetProbabilities(['audio'], 1.0);
    expect(result).toEqual({ audio: 1.0 });
  });
});

// ---------------------------------------------------------------------------
// buildUniformLureProbabilities
// ---------------------------------------------------------------------------

describe('buildUniformLureProbabilities', () => {
  it('creates n-1 lure when pLureN1 > 0', () => {
    const result = buildUniformLureProbabilities(['position', 'audio'], 0.1);
    expect(result).toEqual({
      position: { 'n-1': 0.1 },
      audio: { 'n-1': 0.1 },
    });
  });

  it('creates both n-1 and n+1 lures when both > 0', () => {
    const result = buildUniformLureProbabilities(['position'], 0.1, 0.05);
    expect(result).toEqual({
      position: { 'n-1': 0.1, 'n+1': 0.05 },
    });
  });

  it('omits n-1 key when pLureN1 is 0', () => {
    const result = buildUniformLureProbabilities(['audio'], 0);
    expect(result.audio).toEqual({});
    expect(result.audio).not.toHaveProperty('n-1');
  });

  it('omits n+1 key when pLureN2 is 0 (default)', () => {
    const result = buildUniformLureProbabilities(['position'], 0.1);
    expect(result.position).not.toHaveProperty('n+1');
  });

  it('omits both keys when both probabilities are 0', () => {
    const result = buildUniformLureProbabilities(['color'], 0, 0);
    expect(result.color).toEqual({});
  });

  it('returns empty object for empty modalities', () => {
    const result = buildUniformLureProbabilities([], 0.1);
    expect(result).toEqual({});
  });

  it('assigns same lure probabilities to all modalities', () => {
    const ids = ['position', 'audio', 'color'];
    const result = buildUniformLureProbabilities(ids, 0.15, 0.08);

    for (const id of ids) {
      expect(result[id]).toEqual({ 'n-1': 0.15, 'n+1': 0.08 });
    }
  });
});

// ---------------------------------------------------------------------------
// buildNoImmediateRepeatConstraints
// ---------------------------------------------------------------------------

describe('buildNoImmediateRepeatConstraints', () => {
  it('creates one constraint per modality', () => {
    const result = buildNoImmediateRepeatConstraints(['position', 'audio']);
    expect(result).toHaveLength(2);
  });

  it('sets type to "no-immediate-repeat"', () => {
    const result = buildNoImmediateRepeatConstraints(['position']);
    expect(result[0]!.type).toBe('no-immediate-repeat');
  });

  it('includes modalityId in params', () => {
    const result = buildNoImmediateRepeatConstraints(['color']);
    expect(result[0]!.params).toEqual({ modalityId: 'color' });
  });

  it('preserves modality order', () => {
    const result = buildNoImmediateRepeatConstraints(['audio', 'position', 'color']);
    expect(result.map((c) => c.params.modalityId)).toEqual(['audio', 'position', 'color']);
  });

  it('returns empty array for empty input', () => {
    const result = buildNoImmediateRepeatConstraints([]);
    expect(result).toEqual([]);
  });

  it('all constraints have consistent shape', () => {
    const result = buildNoImmediateRepeatConstraints(['position', 'audio', 'color']);
    for (const constraint of result) {
      expect(constraint).toHaveProperty('type');
      expect(constraint).toHaveProperty('params');
      expect(constraint.params).toHaveProperty('modalityId');
    }
  });
});
