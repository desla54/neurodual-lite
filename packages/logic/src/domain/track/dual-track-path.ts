import type { AlgorithmState } from '../../sequence/types/algorithm';
import type { DualTrackJourneyPreset } from '../../types/journey';

export const DUAL_TRACK_PATH_ALGORITHM_TYPE = 'dual-track-path';
export const DUAL_TRACK_PATH_VERSION = 2;
export const DUAL_TRACK_MIN_TARGET_COUNT = 2;
export const DUAL_TRACK_MAX_TARGET_COUNT = 5;
export const DUAL_TRACK_TIERS_PER_PHASE = 5;
export const DUAL_TRACK_DEFAULT_PRESET: DualTrackJourneyPreset = 'medium';

export type DualTrackMotionComplexity = 'smooth' | 'standard' | 'agile';
export type DualTrackCrowdingMode = 'low' | 'standard' | 'dense';
export type DualTrackIdentityMode = 'classic' | 'audio' | 'color' | 'audio-color';
export type DualTrackPerformanceBand = 'mastery' | 'solid' | 'building' | 'struggling';

/** Number of phases per preset. */
const PRESET_PHASES: Record<DualTrackJourneyPreset, readonly DualTrackIdentityMode[]> = {
  easy: ['classic', 'audio'],
  medium: ['classic', 'audio', 'color'],
  hard: ['classic', 'audio', 'color', 'audio-color'],
};

/** Total tier count for a preset. */
export function getDualTrackTierCount(
  preset: DualTrackJourneyPreset = DUAL_TRACK_DEFAULT_PRESET,
): number {
  return (PRESET_PHASES[preset]?.length ?? 3) * DUAL_TRACK_TIERS_PER_PHASE;
}

/** @deprecated Use getDualTrackTierCount(preset) instead. */
export const DUAL_TRACK_TIER_COUNT = 5;

export interface DualTrackPathProfile {
  readonly currentTargetCount: number;
  readonly currentTierIndex: number;
  readonly stageProgressPct: number;
  readonly stageProgressByTargetCount: Readonly<Record<string, number>>;
  readonly highestCompletedTargetCount: number;
  readonly sessionsPlayed: number;
  readonly completed: boolean;
}

export interface DualTrackTierProfile {
  readonly tierIndex: number;
  readonly tierCount: number;
  readonly phaseIndex: number;
  readonly phaseIdentityMode: DualTrackIdentityMode;
  readonly tierInPhase: number;
  readonly recommendedTotalObjects: number;
  readonly trackingDurationMs: number;
  readonly speedPxPerSec: number;
  readonly motionComplexity: DualTrackMotionComplexity;
  readonly crowdingMode: DualTrackCrowdingMode;
  readonly identityMode: DualTrackIdentityMode;
}

export interface DualTrackPathSessionMetrics {
  readonly accuracyNormalized: number;
  readonly selectionQualityNormalized: number;
  readonly avgCrowdingEventsPerTrial: number | null;
  readonly minInterObjectDistancePx: number | null;
}

export interface DualTrackPathEvaluation {
  readonly previous: DualTrackPathProfile;
  readonly next: DualTrackPathProfile;
  readonly performanceBand: DualTrackPerformanceBand;
  readonly progressDeltaPct: number;
  readonly promotedTargetCount: boolean;
  readonly tierChanged: boolean;
}

// ---------------------------------------------------------------------------
// Phase ramp: 5 tiers of increasing difficulty per phase, per target count.
// Each phase transition resets to low distractors/speed for adaptation.
// ---------------------------------------------------------------------------

interface PhaseRampRow {
  readonly distractorOffset: number; // added to targetCount for recommendedTotalObjects
  readonly trackingDurationMs: number;
  readonly speedPxPerSec: number;
  readonly motionComplexity: DualTrackMotionComplexity;
  readonly crowdingMode: DualTrackCrowdingMode;
}

/**
 * Base ramp per target count. Each phase repeats this 5-tier ramp pattern.
 * Speed values are scaled per target count (higher N = slower base).
 */
const BASE_RAMPS: Record<number, readonly PhaseRampRow[]> = {
  2: [
    {
      distractorOffset: 1,
      trackingDurationMs: 10_000,
      speedPxPerSec: 100,
      motionComplexity: 'smooth',
      crowdingMode: 'low',
    },
    {
      distractorOffset: 3,
      trackingDurationMs: 12_000,
      speedPxPerSec: 120,
      motionComplexity: 'smooth',
      crowdingMode: 'low',
    },
    {
      distractorOffset: 4,
      trackingDurationMs: 14_000,
      speedPxPerSec: 136,
      motionComplexity: 'standard',
      crowdingMode: 'standard',
    },
    {
      distractorOffset: 5,
      trackingDurationMs: 16_000,
      speedPxPerSec: 150,
      motionComplexity: 'standard',
      crowdingMode: 'dense',
    },
    {
      distractorOffset: 6,
      trackingDurationMs: 18_000,
      speedPxPerSec: 162,
      motionComplexity: 'agile',
      crowdingMode: 'dense',
    },
  ],
  3: [
    {
      distractorOffset: 1,
      trackingDurationMs: 10_000,
      speedPxPerSec: 90,
      motionComplexity: 'smooth',
      crowdingMode: 'low',
    },
    {
      distractorOffset: 3,
      trackingDurationMs: 12_000,
      speedPxPerSec: 108,
      motionComplexity: 'smooth',
      crowdingMode: 'low',
    },
    {
      distractorOffset: 4,
      trackingDurationMs: 14_000,
      speedPxPerSec: 124,
      motionComplexity: 'standard',
      crowdingMode: 'standard',
    },
    {
      distractorOffset: 5,
      trackingDurationMs: 16_000,
      speedPxPerSec: 138,
      motionComplexity: 'standard',
      crowdingMode: 'dense',
    },
    {
      distractorOffset: 6,
      trackingDurationMs: 18_000,
      speedPxPerSec: 150,
      motionComplexity: 'agile',
      crowdingMode: 'dense',
    },
  ],
  4: [
    {
      distractorOffset: 1,
      trackingDurationMs: 10_000,
      speedPxPerSec: 82,
      motionComplexity: 'smooth',
      crowdingMode: 'low',
    },
    {
      distractorOffset: 2,
      trackingDurationMs: 12_000,
      speedPxPerSec: 98,
      motionComplexity: 'smooth',
      crowdingMode: 'low',
    },
    {
      distractorOffset: 4,
      trackingDurationMs: 14_000,
      speedPxPerSec: 112,
      motionComplexity: 'standard',
      crowdingMode: 'standard',
    },
    {
      distractorOffset: 5,
      trackingDurationMs: 16_000,
      speedPxPerSec: 128,
      motionComplexity: 'standard',
      crowdingMode: 'dense',
    },
    {
      distractorOffset: 6,
      trackingDurationMs: 18_000,
      speedPxPerSec: 140,
      motionComplexity: 'agile',
      crowdingMode: 'dense',
    },
  ],
  5: [
    {
      distractorOffset: 1,
      trackingDurationMs: 10_000,
      speedPxPerSec: 76,
      motionComplexity: 'smooth',
      crowdingMode: 'low',
    },
    {
      distractorOffset: 2,
      trackingDurationMs: 12_000,
      speedPxPerSec: 90,
      motionComplexity: 'smooth',
      crowdingMode: 'low',
    },
    {
      distractorOffset: 3,
      trackingDurationMs: 14_000,
      speedPxPerSec: 104,
      motionComplexity: 'standard',
      crowdingMode: 'standard',
    },
    {
      distractorOffset: 4,
      trackingDurationMs: 16_000,
      speedPxPerSec: 118,
      motionComplexity: 'standard',
      crowdingMode: 'dense',
    },
    {
      distractorOffset: 5,
      trackingDurationMs: 18_000,
      speedPxPerSec: 128,
      motionComplexity: 'agile',
      crowdingMode: 'dense',
    },
  ],
};

type FullTierRow = Omit<DualTrackTierProfile, 'tierIndex' | 'tierCount'>;

/** Build the full tier list for a given target count and preset. */
function buildTiersForTargetCount(
  targetCount: number,
  preset: DualTrackJourneyPreset,
): readonly FullTierRow[] {
  const phases = PRESET_PHASES[preset];
  // biome-ignore lint/style/noNonNullAssertion: fallback key always exists
  const baseRamp = BASE_RAMPS[targetCount] ?? BASE_RAMPS[DUAL_TRACK_MIN_TARGET_COUNT]!;
  const tiers: FullTierRow[] = [];

  for (let phaseIdx = 0; phaseIdx < phases.length; phaseIdx++) {
    // biome-ignore lint/style/noNonNullAssertion: loop bounded by phases.length
    const identityMode = phases[phaseIdx]!;
    for (let tierInPhase = 0; tierInPhase < DUAL_TRACK_TIERS_PER_PHASE; tierInPhase++) {
      // biome-ignore lint/style/noNonNullAssertion: loop bounded by DUAL_TRACK_TIERS_PER_PHASE
      const ramp = baseRamp[tierInPhase]!;
      tiers.push({
        phaseIndex: phaseIdx,
        phaseIdentityMode: identityMode,
        tierInPhase,
        recommendedTotalObjects: targetCount + ramp.distractorOffset,
        trackingDurationMs: ramp.trackingDurationMs,
        speedPxPerSec: ramp.speedPxPerSec,
        motionComplexity: ramp.motionComplexity,
        crowdingMode: ramp.crowdingMode,
        identityMode,
      });
    }
  }

  return tiers;
}

function clampTargetCount(value: number): number {
  return Math.max(DUAL_TRACK_MIN_TARGET_COUNT, Math.min(DUAL_TRACK_MAX_TARGET_COUNT, value));
}

function clampTierIndex(value: number, maxTier: number): number {
  return Math.max(0, Math.min(maxTier - 1, value));
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function createStageProgressRecord(): Record<string, number> {
  const progress: Record<string, number> = {};
  for (
    let targetCount = DUAL_TRACK_MIN_TARGET_COUNT;
    targetCount <= DUAL_TRACK_MAX_TARGET_COUNT;
    targetCount++
  ) {
    progress[String(targetCount)] = 0;
  }
  return progress;
}

function normalizeStageProgressByTargetCount(
  input: unknown,
  currentTargetCount: number,
  stageProgressPct: number,
): Record<string, number> {
  const fallback = createStageProgressRecord();
  if (typeof input !== 'object' || input === null) {
    fallback[String(currentTargetCount)] = stageProgressPct;
    return fallback;
  }

  const output = createStageProgressRecord();
  for (
    let targetCount = DUAL_TRACK_MIN_TARGET_COUNT;
    targetCount <= DUAL_TRACK_MAX_TARGET_COUNT;
    targetCount++
  ) {
    const raw = (input as Record<string, unknown>)[String(targetCount)];
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      output[String(targetCount)] = clampPercent(raw);
    }
  }
  output[String(currentTargetCount)] = Math.max(
    output[String(currentTargetCount)] ?? 0,
    stageProgressPct,
  );
  return output;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function derivePerformanceBand(metrics: DualTrackPathSessionMetrics): DualTrackPerformanceBand {
  const accuracy = metrics.accuracyNormalized;
  const quality = metrics.selectionQualityNormalized;
  const crowding = metrics.avgCrowdingEventsPerTrial ?? 0;

  if (accuracy >= 0.9 && quality >= 0.86 && crowding <= 3.5) return 'mastery';
  if (accuracy >= 0.78 && quality >= 0.74) return 'solid';
  if (accuracy >= 0.66 && quality >= 0.64) return 'building';
  return 'struggling';
}

export function createDefaultDualTrackPathProfile(): DualTrackPathProfile {
  return {
    currentTargetCount: DUAL_TRACK_MIN_TARGET_COUNT,
    currentTierIndex: 0,
    stageProgressPct: 0,
    stageProgressByTargetCount: createStageProgressRecord(),
    highestCompletedTargetCount: 0,
    sessionsPlayed: 0,
    completed: false,
  };
}

export function restoreDualTrackPathProfile(state: unknown): DualTrackPathProfile {
  if (!isRecord(state)) return createDefaultDualTrackPathProfile();

  const maybeWrappedData = state['data'];
  const rawData = isRecord(maybeWrappedData) ? maybeWrappedData : state;
  const data = isRecord(rawData) ? rawData : createDefaultDualTrackPathProfile();

  const currentTargetCount =
    typeof data.currentTargetCount === 'number' && Number.isFinite(data.currentTargetCount)
      ? clampTargetCount(Math.round(data.currentTargetCount))
      : DUAL_TRACK_MIN_TARGET_COUNT;
  // Use hard preset max (20 tiers) for restoration — the actual clamping
  // happens at getDualTrackTierProfile time when the preset is known.
  const maxTierForRestore = getDualTrackTierCount('hard');
  const currentTierIndex =
    typeof data.currentTierIndex === 'number' && Number.isFinite(data.currentTierIndex)
      ? clampTierIndex(Math.round(data.currentTierIndex), maxTierForRestore)
      : 0;
  const stageProgressPct =
    typeof data.stageProgressPct === 'number' && Number.isFinite(data.stageProgressPct)
      ? clampPercent(data.stageProgressPct)
      : 0;
  const highestCompletedTargetCount =
    typeof data.highestCompletedTargetCount === 'number' &&
    Number.isFinite(data.highestCompletedTargetCount)
      ? Math.max(
          0,
          Math.min(DUAL_TRACK_MAX_TARGET_COUNT, Math.round(data.highestCompletedTargetCount)),
        )
      : 0;
  const sessionsPlayed =
    typeof data.sessionsPlayed === 'number' && Number.isFinite(data.sessionsPlayed)
      ? Math.max(0, Math.round(data.sessionsPlayed))
      : 0;
  const completed =
    typeof data.completed === 'boolean'
      ? data.completed
      : highestCompletedTargetCount >= DUAL_TRACK_MAX_TARGET_COUNT && stageProgressPct >= 100;

  return {
    currentTargetCount,
    currentTierIndex,
    stageProgressPct,
    stageProgressByTargetCount: normalizeStageProgressByTargetCount(
      data.stageProgressByTargetCount,
      currentTargetCount,
      stageProgressPct,
    ),
    highestCompletedTargetCount,
    sessionsPlayed,
    completed,
  };
}

export function serializeDualTrackPathProfile(profile: DualTrackPathProfile): AlgorithmState {
  return {
    algorithmType: DUAL_TRACK_PATH_ALGORITHM_TYPE,
    version: DUAL_TRACK_PATH_VERSION,
    data: {
      currentTargetCount: clampTargetCount(profile.currentTargetCount),
      currentTierIndex: clampTierIndex(profile.currentTierIndex, getDualTrackTierCount('hard')),
      stageProgressPct: clampPercent(profile.stageProgressPct),
      stageProgressByTargetCount: normalizeStageProgressByTargetCount(
        profile.stageProgressByTargetCount,
        profile.currentTargetCount,
        profile.stageProgressPct,
      ),
      highestCompletedTargetCount: Math.max(
        0,
        Math.min(DUAL_TRACK_MAX_TARGET_COUNT, Math.round(profile.highestCompletedTargetCount)),
      ),
      sessionsPlayed: Math.max(0, Math.round(profile.sessionsPlayed)),
      completed: profile.completed,
    },
  };
}

/**
 * Adjusts a profile's tier index to be within the preset bounds
 * and re-derives stageProgressPct accordingly.
 */
export function adjustDualTrackPathProfileToPreset(
  profile: DualTrackPathProfile,
  preset: DualTrackJourneyPreset,
): { adjusted: DualTrackPathProfile; needsUpdate: boolean } {
  const maxTier = getDualTrackTierCount(preset);
  const safeTier = profile.currentTierIndex >= maxTier ? 0 : profile.currentTierIndex;
  const derivedPct = maxTier > 1 ? Math.round((safeTier / (maxTier - 1)) * 100) : 0;
  const needsUpdate =
    safeTier !== profile.currentTierIndex || derivedPct !== profile.stageProgressPct;
  return {
    adjusted: { ...profile, currentTierIndex: safeTier, stageProgressPct: derivedPct },
    needsUpdate,
  };
}

export function getDualTrackTierProfile(
  targetCount: number,
  tierIndex: number,
  preset: DualTrackJourneyPreset = DUAL_TRACK_DEFAULT_PRESET,
): DualTrackTierProfile {
  const safeTargetCount = clampTargetCount(Math.round(targetCount));
  const tierCount = getDualTrackTierCount(preset);
  const safeTierIndex = clampTierIndex(Math.round(tierIndex), tierCount);
  const tiers = buildTiersForTargetCount(safeTargetCount, preset);
  const tier = tiers[safeTierIndex] ?? tiers[0];

  if (!tier) {
    // Absolute fallback (should never happen)
    return {
      tierIndex: 0,
      tierCount,
      phaseIndex: 0,
      phaseIdentityMode: 'classic',
      tierInPhase: 0,
      recommendedTotalObjects: safeTargetCount + 4,
      trackingDurationMs: 12_000,
      speedPxPerSec: 100,
      motionComplexity: 'smooth',
      crowdingMode: 'low',
      identityMode: 'classic',
    };
  }

  return {
    tierIndex: safeTierIndex,
    tierCount,
    ...tier,
  };
}

export function evaluateDualTrackPathSession(
  profile: DualTrackPathProfile,
  metrics: DualTrackPathSessionMetrics,
  preset: DualTrackJourneyPreset = DUAL_TRACK_DEFAULT_PRESET,
): DualTrackPathEvaluation {
  const previous = restoreDualTrackPathProfile(profile);
  const performanceBand = derivePerformanceBand(metrics);
  const tierCount = getDualTrackTierCount(preset);

  let currentTargetCount = previous.currentTargetCount;
  let currentTierIndex = previous.currentTierIndex;
  let highestCompletedTargetCount = previous.highestCompletedTargetCount;
  let promotedTargetCount = false;

  // Tier advancement is the ONLY progression mechanism.
  // Stage progress % is derived from tier position.
  if (performanceBand === 'mastery') {
    currentTierIndex = clampTierIndex(currentTierIndex + 1, tierCount);
  } else if (performanceBand === 'solid' && metrics.accuracyNormalized >= 0.84) {
    currentTierIndex = clampTierIndex(currentTierIndex + 1, tierCount);
  } else if (performanceBand === 'struggling') {
    currentTierIndex = clampTierIndex(currentTierIndex - 1, tierCount);
  }

  // Stage progress = tier position as percentage (last tier = 100%)
  let stageProgressPct = clampPercent(
    tierCount > 1 ? Math.round((currentTierIndex / (tierCount - 1)) * 100) : 100,
  );
  const progressDeltaPct = stageProgressPct - previous.stageProgressPct;

  const stageProgressByTargetCount = normalizeStageProgressByTargetCount(
    previous.stageProgressByTargetCount,
    currentTargetCount,
    stageProgressPct,
  );
  stageProgressByTargetCount[String(currentTargetCount)] = Math.max(
    stageProgressByTargetCount[String(currentTargetCount)] ?? 0,
    stageProgressPct,
  );

  // Advance to next target count when all tiers are completed
  if (currentTierIndex >= tierCount - 1 && performanceBand !== 'struggling') {
    stageProgressByTargetCount[String(currentTargetCount)] = 100;
    highestCompletedTargetCount = Math.max(highestCompletedTargetCount, currentTargetCount);

    if (currentTargetCount < DUAL_TRACK_MAX_TARGET_COUNT) {
      promotedTargetCount = true;
      currentTargetCount += 1;
      currentTierIndex = 0;
      stageProgressPct = stageProgressByTargetCount[String(currentTargetCount)] ?? 0;
    } else {
      stageProgressPct = 100;
    }
  }

  const next: DualTrackPathProfile = {
    currentTargetCount,
    currentTierIndex,
    stageProgressPct,
    stageProgressByTargetCount,
    highestCompletedTargetCount,
    sessionsPlayed: previous.sessionsPlayed + 1,
    completed:
      highestCompletedTargetCount >= DUAL_TRACK_MAX_TARGET_COUNT && stageProgressPct >= 100,
  };

  return {
    previous,
    next,
    performanceBand,
    progressDeltaPct,
    promotedTargetCount,
    tierChanged: next.currentTierIndex !== previous.currentTierIndex,
  };
}
