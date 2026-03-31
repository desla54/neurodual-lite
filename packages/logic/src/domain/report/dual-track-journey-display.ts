import type { TrackDetails } from '../../types/session-report';
import type { DualTrackJourneyDisplay } from './progression-types';
import { DUAL_TRACK_TIERS_PER_PHASE } from '../track/dual-track-path';

export function buildDualTrackJourneyDisplay(
  trackDetails: TrackDetails | null | undefined,
): DualTrackJourneyDisplay | null {
  if (!trackDetails) return null;

  const tier = trackDetails.masteryDifficultyTier ?? 0;
  const phaseIdentityMode = trackDetails.masteryPhaseIdentityMode ?? 'classic';
  const performanceBand = trackDetails.performanceBand;
  const promotedTargetCount = trackDetails.promotedTargetCount ?? false;
  const tierDirection: 'up' | 'down' | 'stay' =
    performanceBand === 'mastery' || performanceBand === 'solid'
      ? 'up'
      : performanceBand === 'struggling'
        ? 'down'
        : 'stay';
  const phaseIndex =
    trackDetails.masteryPhaseIndex ?? Math.floor(tier / DUAL_TRACK_TIERS_PER_PHASE);

  return {
    phaseIdentityMode,
    tierInPhase: tier - phaseIndex * DUAL_TRACK_TIERS_PER_PHASE,
    tiersPerPhase: DUAL_TRACK_TIERS_PER_PHASE,
    stageProgressPct: trackDetails.masteryStageProgressPct ?? 0,
    performanceBand,
    promotedTargetCount,
    tierDirection,
  };
}
