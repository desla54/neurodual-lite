import { describe, expect, it } from 'bun:test';
import {
  createDefaultDualTrackPathProfile,
  evaluateDualTrackPathSession,
  getDualTrackTierCount,
  getDualTrackTierProfile,
  restoreDualTrackPathProfile,
  serializeDualTrackPathProfile,
  DUAL_TRACK_TIERS_PER_PHASE,
} from './dual-track-path';

describe('dual-track adaptive path', () => {
  it('starts at two targets, tier 0, 0%', () => {
    const profile = createDefaultDualTrackPathProfile();

    expect(profile.currentTargetCount).toBe(2);
    expect(profile.currentTierIndex).toBe(0);
    expect(profile.stageProgressPct).toBe(0);
    expect(profile.completed).toBe(false);
  });

  it('promotes tier and mastery on strong sessions', () => {
    const result = evaluateDualTrackPathSession(createDefaultDualTrackPathProfile(), {
      accuracyNormalized: 0.95,
      selectionQualityNormalized: 0.91,
      avgCrowdingEventsPerTrial: 2,
      minInterObjectDistancePx: 96,
    });

    expect(result.performanceBand).toBe('mastery');
    expect(result.next.currentTierIndex).toBe(1);
    expect(result.next.stageProgressPct).toBeGreaterThan(0);
    // Progress delta = tier-derived (1/14 ≈ 7% for medium default)
    expect(result.progressDeltaPct).toBeGreaterThan(0);
  });

  it('advances to the next target count after completing all tiers', () => {
    let profile = createDefaultDualTrackPathProfile();
    const tierCount = getDualTrackTierCount('medium');

    // Need tierCount mastery sessions to reach last tier and promote
    for (let i = 0; i < tierCount + 1; i++) {
      profile = evaluateDualTrackPathSession(
        profile,
        {
          accuracyNormalized: 0.95,
          selectionQualityNormalized: 0.9,
          avgCrowdingEventsPerTrial: 2,
          minInterObjectDistancePx: 90,
        },
        'medium',
      ).next;
    }

    expect(profile.highestCompletedTargetCount).toBeGreaterThanOrEqual(2);
    expect(profile.currentTargetCount).toBeGreaterThanOrEqual(3);
  });

  it('can reduce the active tier on struggling session', () => {
    const seeded = restoreDualTrackPathProfile({
      currentTargetCount: 2,
      currentTierIndex: 3,
      stageProgressPct: 21, // will be recomputed from tier
      stageProgressByTargetCount: { 2: 21, 3: 0, 4: 0, 5: 0 },
      highestCompletedTargetCount: 0,
      sessionsPlayed: 4,
      completed: false,
    });

    const result = evaluateDualTrackPathSession(seeded, {
      accuracyNormalized: 0.52,
      selectionQualityNormalized: 0.55,
      avgCrowdingEventsPerTrial: 6,
      minInterObjectDistancePx: 54,
    });

    expect(result.performanceBand).toBe('struggling');
    expect(result.next.currentTierIndex).toBe(2);
    // Progress derived from tier 2/14 ≈ 14%
    expect(result.next.stageProgressPct).toBeLessThan(seeded.stageProgressPct);
  });

  it('serializes and restores deterministically', () => {
    const profile = {
      ...createDefaultDualTrackPathProfile(),
      currentTierIndex: 2,
      stageProgressPct: 37,
      sessionsPlayed: 5,
    };

    const restored = restoreDualTrackPathProfile(serializeDualTrackPathProfile(profile));
    expect(restored).toEqual({
      ...profile,
      stageProgressByTargetCount: {
        '2': 37,
        '3': 0,
        '4': 0,
        '5': 0,
      },
    });
  });

  it('defaults to medium preset when no preset is specified', () => {
    const withPreset = getDualTrackTierProfile(3, 2, 'medium');
    const withoutPreset = getDualTrackTierProfile(3, 2);

    expect(withoutPreset).toEqual(withPreset);
  });

  describe('preset tier counts', () => {
    it('easy has 2 phases (10 tiers)', () => {
      expect(getDualTrackTierCount('easy')).toBe(10);
    });

    it('medium has 3 phases (15 tiers)', () => {
      expect(getDualTrackTierCount('medium')).toBe(15);
    });

    it('hard has 4 phases (20 tiers)', () => {
      expect(getDualTrackTierCount('hard')).toBe(20);
    });
  });

  describe('phase progression within a preset', () => {
    it('medium: first 5 tiers are classic, next 5 audio, next 5 color', () => {
      for (let i = 0; i < 5; i++) {
        expect(getDualTrackTierProfile(2, i, 'medium').identityMode).toBe('classic');
      }
      for (let i = 5; i < 10; i++) {
        expect(getDualTrackTierProfile(2, i, 'medium').identityMode).toBe('audio');
      }
      for (let i = 10; i < 15; i++) {
        expect(getDualTrackTierProfile(2, i, 'medium').identityMode).toBe('color');
      }
    });

    it('hard: last 5 tiers are audio-color combined', () => {
      for (let i = 15; i < 20; i++) {
        expect(getDualTrackTierProfile(2, i, 'hard').identityMode).toBe('audio-color');
      }
    });

    it('easy: only classic and audio phases', () => {
      for (let i = 0; i < 5; i++) {
        expect(getDualTrackTierProfile(2, i, 'easy').identityMode).toBe('classic');
      }
      for (let i = 5; i < 10; i++) {
        expect(getDualTrackTierProfile(2, i, 'easy').identityMode).toBe('audio');
      }
    });
  });

  describe('ramp resets at phase transitions', () => {
    for (const preset of ['easy', 'medium', 'hard'] as const) {
      it(`${preset}: each phase starts with few distractors`, () => {
        const tierCount = getDualTrackTierCount(preset);
        const phaseCount = tierCount / DUAL_TRACK_TIERS_PER_PHASE;

        for (let phase = 0; phase < phaseCount; phase++) {
          const firstTierOfPhase = getDualTrackTierProfile(2, phase * 5, preset);
          const lastTierOfPhase = getDualTrackTierProfile(2, phase * 5 + 4, preset);

          // First tier of each phase: few distractors
          expect(firstTierOfPhase.recommendedTotalObjects - 2).toBeLessThanOrEqual(2);
          // Last tier of each phase: more distractors
          expect(lastTierOfPhase.recommendedTotalObjects).toBeGreaterThan(
            firstTierOfPhase.recommendedTotalObjects,
          );
        }
      });

      it(`${preset}: each phase starts with smooth/low`, () => {
        const tierCount = getDualTrackTierCount(preset);
        const phaseCount = tierCount / DUAL_TRACK_TIERS_PER_PHASE;

        for (let phase = 0; phase < phaseCount; phase++) {
          const firstTier = getDualTrackTierProfile(3, phase * 5, preset);
          expect(firstTier.motionComplexity).toBe('smooth');
          expect(firstTier.crowdingMode).toBe('low');
        }
      });
    }
  });

  describe('distractors increase monotonically within each phase', () => {
    for (const preset of ['easy', 'medium', 'hard'] as const) {
      it(`${preset}: objects increase within each phase`, () => {
        const tierCount = getDualTrackTierCount(preset);
        const phaseCount = tierCount / DUAL_TRACK_TIERS_PER_PHASE;

        for (const targetCount of [2, 3, 4, 5]) {
          for (let phase = 0; phase < phaseCount; phase++) {
            let prevObjects = 0;
            for (let t = 0; t < 5; t++) {
              const tier = getDualTrackTierProfile(targetCount, phase * 5 + t, preset);
              expect(tier.recommendedTotalObjects).toBeGreaterThanOrEqual(prevObjects);
              prevObjects = tier.recommendedTotalObjects;
            }
          }
        }
      });
    }
  });

  describe('tier profile exposes phase metadata', () => {
    it('phaseIndex and tierInPhase are correct', () => {
      const tier7 = getDualTrackTierProfile(2, 7, 'medium');
      expect(tier7.phaseIndex).toBe(1); // second phase (audio)
      expect(tier7.tierInPhase).toBe(2); // 3rd tier within the phase
      expect(tier7.phaseIdentityMode).toBe('audio');
    });
  });
});
