import { describe, expect, it } from 'bun:test';

import { buildDualTrackJourneyDisplay } from './dual-track-journey-display';

describe('buildDualTrackJourneyDisplay', () => {
  it('derives tier-in-phase and upward direction from mastery details', () => {
    // @ts-expect-error test override
    const display = buildDualTrackJourneyDisplay({
      kind: 'track',
      selectionPrecision: 82,
      selectionQuality: 80,
      targetCount: 3,
      totalObjects: 8,
      trackingDurationMs: 9000,
      speedPxPerSec: 180,
      avgResponseTimeMs: 1200,
      perfectRounds: 4,
      totalCrowdingEvents: 7,
      minInterObjectDistancePx: 42,
      crowdingThresholdPx: 48,
      masteryTargetCountStage: 3,
      masteryDifficultyTier: 7,
      masteryTierCount: 15,
      masteryStageProgressPct: 46,
      masteryPhaseIndex: 1,
      masteryPhaseIdentityMode: 'audio',
      highestCompletedTargetCount: 2,
      promotedTargetCount: false,
      performanceBand: 'solid',
      nextTargetCountStage: 3,
      nextDifficultyTier: 8,
    });

    expect(display).toEqual({
      phaseIdentityMode: 'audio',
      tierInPhase: 2,
      tiersPerPhase: 5,
      stageProgressPct: 46,
      performanceBand: 'solid',
      promotedTargetCount: false,
      tierDirection: 'up',
    });
  });

  it('returns null when track details are missing', () => {
    expect(buildDualTrackJourneyDisplay(null)).toBeNull();
  });
});
