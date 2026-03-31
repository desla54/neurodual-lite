/**
 * Tests for journey/constants.ts
 */

import { describe, expect, it } from 'bun:test';
import {
  generateJourneyStages,
  getTotalStagesForTarget,
  getStageDefinition,
  isStageRequiresPremium,
} from './constants';

describe('generateJourneyStages', () => {
  describe('simulator journey (1 stage per level)', () => {
    it('generates one stage per level', () => {
      const stages = generateJourneyStages(5, 1, true);

      expect(stages.length).toBe(5);
      expect(stages.every((s) => s.mode === 'simulator')).toBe(true);
    });

    it('assigns correct nLevels', () => {
      const stages = generateJourneyStages(4, 2, true);

      expect(stages.map((s) => s.nLevel)).toEqual([2, 3, 4]);
    });

    it('generates standard stages when isSimulator=false', () => {
      // Standard journey is now supported again
      const stages = generateJourneyStages(3, 1, false);

      expect(stages.length).toBe(12); // 3 levels × 4 modes
      expect(stages.some((s) => s.mode === 'pick')).toBe(true);
      expect(stages.some((s) => s.mode === 'simulator')).toBe(false);
    });

    it('assigns sequential stageIds', () => {
      const stages = generateJourneyStages(2, 1, false);
      const ids = stages.map((s) => s.stageId);

      expect(ids).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    });

    it('respects startLevel', () => {
      const stages = generateJourneyStages(5, 3, true);

      expect(stages.length).toBe(3); // levels 3,4,5
      expect(stages[0]?.nLevel).toBe(3);
      expect(stages[stages.length - 1]?.nLevel).toBe(5);
    });
  });

  describe('edge cases', () => {
    it('clamps targetLevel to valid range', () => {
      const stages = generateJourneyStages(100, 1, true);
      const maxLevel = Math.max(...stages.map((s) => s.nLevel));

      expect(maxLevel).toBeLessThanOrEqual(10);
    });

    it('handles startLevel > targetLevel', () => {
      const stages = generateJourneyStages(3, 5, true);

      // startLevel is clamped to targetLevel
      expect(stages.length).toBe(1); // single level
    });

    it('handles invalid negative values', () => {
      const stages = generateJourneyStages(-1, -1);

      expect(stages.length).toBeGreaterThan(0);
      expect(stages[0]?.nLevel).toBeGreaterThanOrEqual(1);
    });
  });
});

describe('getTotalStagesForTarget', () => {
  it('calculates simulator journey stages', () => {
    expect(getTotalStagesForTarget(5, 1, true)).toBe(5);
    expect(getTotalStagesForTarget(10, 1, true)).toBe(10);
  });

  it('respects startLevel', () => {
    expect(getTotalStagesForTarget(5, 3, true)).toBe(3); // levels 3,4,5 × 1
  });
});

describe('getStageDefinition', () => {
  it('returns stage by ID for simulator journey', () => {
    const stage = getStageDefinition(3, 5, 1, true);

    expect(stage?.nLevel).toBe(3);
    expect(stage?.mode).toBe('simulator');
  });

  it('returns undefined for invalid ID', () => {
    expect(getStageDefinition(999, 5, 1, true)).toBeUndefined();
    expect(getStageDefinition(0, 5, 1, true)).toBeUndefined();
  });
});

describe('isStageRequiresPremium', () => {
  it('returns false for low levels', () => {
    expect(isStageRequiresPremium({ stageId: 1, nLevel: 1, mode: 'simulator' })).toBe(false);
    expect(isStageRequiresPremium({ stageId: 3, nLevel: 3, mode: 'simulator' })).toBe(false);
  });

  it('returns true for N >= 4 (premium threshold)', () => {
    expect(isStageRequiresPremium({ stageId: 4, nLevel: 4, mode: 'simulator' })).toBe(true);
    expect(isStageRequiresPremium({ stageId: 7, nLevel: 7, mode: 'simulator' })).toBe(true);
  });

  it('works with stage ID (legacy)', () => {
    expect(isStageRequiresPremium(1)).toBe(false);
    expect(isStageRequiresPremium(4)).toBe(true);
  });
});
