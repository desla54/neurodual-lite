import {
  HYBRID_DNB_BLOCK_SIZE_DEFAULT,
  HYBRID_TRACK_BLOCK_SIZE_DEFAULT,
} from '../../specs/journey.spec';
import type {
  DualTrackJourneyPreset,
  JourneyStrategyConfig,
  HybridJourneyStrategyConfig,
} from '../../types/journey';

export const DEFAULT_DUAL_TRACK_JOURNEY_PRESET: DualTrackJourneyPreset = 'medium';

interface JourneyStrategyConfigInput {
  readonly gameMode?: string;
  readonly strategyConfig?: JourneyStrategyConfig;
  readonly hybridTrackSessionsPerBlock?: number;
  readonly hybridDnbSessionsPerBlock?: number;
}

export interface HybridJourneyTrackProfile {
  readonly trackingDurationMode: 'manual';
  readonly trackingDurationMs: number;
  readonly trackingSpeedMode: 'manual';
  readonly trackingSpeedPxPerSec: number;
  readonly crowdingMode: 'dense';
  readonly motionComplexity: 'agile';
}

function clampBlockSize(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.round(value));
}

function normalizeDualTrackJourneyPreset(value: unknown): DualTrackJourneyPreset {
  if (value === 'easy' || value === 'medium' || value === 'hard') return value;
  return DEFAULT_DUAL_TRACK_JOURNEY_PRESET;
}

export function resolveJourneyStrategyConfig(
  input: JourneyStrategyConfigInput,
): JourneyStrategyConfig | undefined {
  if (input.gameMode === 'dual-track') {
    return {
      ...(input.strategyConfig ?? {}),
      dualTrack: {
        preset: normalizeDualTrackJourneyPreset(input.strategyConfig?.dualTrack?.preset),
      },
    };
  }

  if (input.gameMode !== 'dual-track-dnb-hybrid') {
    return input.strategyConfig;
  }

  const hybrid = input.strategyConfig?.hybrid;
  return {
    hybrid: {
      trackSessionsPerBlock: clampBlockSize(
        hybrid?.trackSessionsPerBlock ?? input.hybridTrackSessionsPerBlock,
        HYBRID_TRACK_BLOCK_SIZE_DEFAULT,
      ),
      dnbSessionsPerBlock: clampBlockSize(
        hybrid?.dnbSessionsPerBlock ?? input.hybridDnbSessionsPerBlock,
        HYBRID_DNB_BLOCK_SIZE_DEFAULT,
      ),
    },
    ...(input.strategyConfig?.dualTrack
      ? {
          dualTrack: {
            preset: normalizeDualTrackJourneyPreset(input.strategyConfig.dualTrack.preset),
          },
        }
      : {}),
  };
}

export function resolveHybridJourneyStrategyConfig(
  input: JourneyStrategyConfigInput,
): HybridJourneyStrategyConfig {
  const strategy = resolveJourneyStrategyConfig(input);
  const hybrid = strategy?.hybrid;
  return {
    trackSessionsPerBlock: clampBlockSize(
      hybrid?.trackSessionsPerBlock,
      HYBRID_TRACK_BLOCK_SIZE_DEFAULT,
    ),
    dnbSessionsPerBlock: clampBlockSize(hybrid?.dnbSessionsPerBlock, HYBRID_DNB_BLOCK_SIZE_DEFAULT),
  };
}

export function createDefaultHybridJourneyStrategyConfig(): JourneyStrategyConfig {
  return {
    hybrid: {
      trackSessionsPerBlock: HYBRID_TRACK_BLOCK_SIZE_DEFAULT,
      dnbSessionsPerBlock: HYBRID_DNB_BLOCK_SIZE_DEFAULT,
    },
  };
}

export function resolveDualTrackJourneyPreset(
  input: Pick<JourneyStrategyConfigInput, 'gameMode' | 'strategyConfig'>,
): DualTrackJourneyPreset {
  if (input.gameMode !== 'dual-track' && input.gameMode !== 'dual-track-dnb-hybrid')
    return DEFAULT_DUAL_TRACK_JOURNEY_PRESET;
  return normalizeDualTrackJourneyPreset(input.strategyConfig?.dualTrack?.preset);
}

export function resolveHybridJourneyTrackProfile(targetCount: number): HybridJourneyTrackProfile {
  const safeTargetCount = Math.max(2, Math.min(5, Math.round(targetCount)));

  if (safeTargetCount === 2) {
    return {
      trackingDurationMode: 'manual',
      trackingDurationMs: 14_000,
      trackingSpeedMode: 'manual',
      trackingSpeedPxPerSec: 150,
      crowdingMode: 'dense',
      motionComplexity: 'agile',
    };
  }

  if (safeTargetCount === 3) {
    return {
      trackingDurationMode: 'manual',
      trackingDurationMs: 16_000,
      trackingSpeedMode: 'manual',
      trackingSpeedPxPerSec: 165,
      crowdingMode: 'dense',
      motionComplexity: 'agile',
    };
  }

  return {
    trackingDurationMode: 'manual',
    trackingDurationMs: 16_000 + (safeTargetCount - 4) * 2_000,
    trackingSpeedMode: 'manual',
    trackingSpeedPxPerSec: safeTargetCount >= 5 ? 140 : 150,
    crowdingMode: 'dense',
    motionComplexity: 'agile',
  };
}
