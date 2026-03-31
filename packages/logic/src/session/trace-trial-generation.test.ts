import { describe, it, expect } from 'bun:test';
import {
  generateTraceActiveModalities,
  generateTraceTrials,
  type TraceTrialGenerationRandom,
} from './trace-trial-generation';
import type { TraceModality } from '../types/trace';
import { COLORS, SOUNDS } from '../domain';

function createMockRandom(values: number[]): TraceTrialGenerationRandom {
  let i = 0;
  return {
    random: () => {
      const v = values[i];
      i += 1;
      return v ?? 0;
    },
  };
}

describe('trace-trial-generation', () => {
  describe('generateTraceActiveModalities', () => {
    it('returns enabled modalities when dynamicRules=false', () => {
      const enabled: readonly TraceModality[] = ['position', 'audio'];
      const result = generateTraceActiveModalities(enabled, false, createMockRandom([0.5]));
      expect(result).toBe(enabled);
    });

    it('returns enabled modalities when <2 modalities', () => {
      const enabled: readonly TraceModality[] = ['position'];
      const result = generateTraceActiveModalities(enabled, true, createMockRandom([0.5]));
      expect(result).toBe(enabled);
    });

    it('2 modalities: roll <0.1 returns first only', () => {
      const enabled: readonly TraceModality[] = ['position', 'audio'];
      const result = generateTraceActiveModalities(enabled, true, createMockRandom([0.05]));
      expect(result).toEqual(['position']);
    });

    it('2 modalities: 0.1<=roll<0.2 returns second only', () => {
      const enabled: readonly TraceModality[] = ['position', 'audio'];
      const result = generateTraceActiveModalities(enabled, true, createMockRandom([0.15]));
      expect(result).toEqual(['audio']);
    });

    it('2 modalities: roll >=0.2 returns both', () => {
      const enabled: readonly TraceModality[] = ['position', 'audio'];
      const result = generateTraceActiveModalities(enabled, true, createMockRandom([0.5]));
      expect(result).toBe(enabled);
    });

    it('3 modalities: roll <0.1 returns all', () => {
      const enabled: readonly TraceModality[] = ['position', 'audio', 'color'];
      const result = generateTraceActiveModalities(enabled, true, createMockRandom([0.05]));
      expect(result).toBe(enabled);
    });

    it('3 modalities: 0.1<=roll<0.9 returns a pair', () => {
      const enabled: readonly TraceModality[] = ['position', 'audio', 'color'];
      const result = generateTraceActiveModalities(enabled, true, createMockRandom([0.5, 0.0]));
      expect(result).toEqual(['position', 'audio']);
    });

    it('3 modalities: roll >=0.9 returns a single', () => {
      const enabled: readonly TraceModality[] = ['position', 'audio', 'color'];
      const result = generateTraceActiveModalities(enabled, true, createMockRandom([0.95, 0.0]));
      expect(result).toEqual(['position']);
    });
  });

  describe('generateTraceTrials', () => {
    it('assigns swipeDirection when dynamicSwipeDirection=true', () => {
      const trials = generateTraceTrials({
        trialsCount: 1,
        enabledModalities: ['position'],
        dynamicRules: false,
        dynamicSwipeDirection: true,
        random: createMockRandom([
          0.1, // position
          0.1, // sound
          0.1, // color
          0.49, // swipe direction roll
        ]),
        numPositions: 8,
      });
      expect(trials).toHaveLength(1);
      expect(trials[0]?.swipeDirection).toBe('n-to-target');
    });

    it('does not assign swipeDirection when position is not the only active modality', () => {
      const trials = generateTraceTrials({
        trialsCount: 1,
        enabledModalities: ['position', 'audio'],
        dynamicRules: false,
        dynamicSwipeDirection: true,
        random: createMockRandom([
          0.1, // position
          0.1, // sound
          0.1, // color
          0.49, // unused (should not be consumed)
        ]),
        numPositions: 8,
      });
      expect(trials).toHaveLength(1);
      expect(trials[0]?.activeModalities).toEqual(['position', 'audio']);
      expect(trials[0]?.swipeDirection).toBeUndefined();
    });

    it('assigns swipeDirection only on position-only trials under dynamicRules', () => {
      const trials = generateTraceTrials({
        trialsCount: 1,
        enabledModalities: ['position', 'audio'],
        dynamicRules: true,
        dynamicSwipeDirection: true,
        random: createMockRandom([
          0.1, // position
          0.1, // sound
          0.1, // color
          0.05, // dynamic rules roll (2 modalities: <0.1 => first only => position)
          0.49, // swipe direction roll
        ]),
        numPositions: 8,
      });
      expect(trials).toHaveLength(1);
      expect(trials[0]?.activeModalities).toEqual(['position']);
      expect(trials[0]?.swipeDirection).toBe('n-to-target');
    });

    it('assigns mirrorAxis when mirrorAxisSetting="dynamic"', () => {
      const trials = generateTraceTrials({
        trialsCount: 1,
        enabledModalities: ['position'],
        dynamicRules: false,
        dynamicSwipeDirection: false,
        random: createMockRandom([
          0.1, // position
          0.1, // sound
          0.1, // color
          0.51, // mirror axis roll
        ]),
        numPositions: 8,
        mirrorAxisSetting: 'dynamic',
      });
      expect(trials).toHaveLength(1);
      expect(trials[0]?.mirrorAxis).toBe('vertical');
    });

    it('generates valid positions/sounds/colors', () => {
      const trials = generateTraceTrials({
        trialsCount: 10,
        enabledModalities: ['position', 'audio', 'color'],
        dynamicRules: false,
        dynamicSwipeDirection: false,
        random: createMockRandom(Array.from({ length: 100 }, () => 0.999)),
        numPositions: 8,
      });

      expect(trials).toHaveLength(10);
      for (const trial of trials) {
        expect(trial.position).toBeGreaterThanOrEqual(0);
        expect(trial.position).toBeLessThan(8);
        expect(SOUNDS.includes(trial.sound)).toBe(true);
        expect(COLORS.includes(trial.color)).toBe(true);
        expect(trial.activeModalities).toEqual(['position', 'audio', 'color']);
      }
    });
  });
});
