import {
  resolveDualTrackJourneyPreset as resolveDualTrackJourneyPresetFromLogic,
  resolveHybridJourneyTrackProfile,
  type JourneyStrategyConfig,
  type ModeSettings,
} from '@neurodual/logic';
import type { SynergyConfig } from '../stores/synergy-store';

export type DualTrackIdentityMode =
  | 'classic'
  | 'color'
  | 'position'
  | 'image'
  | 'spatial'
  | 'digits'
  | 'emotions'
  | 'words';
export type DualTrackPlayMode = 'free' | 'journey' | 'synergy' | 'calibration' | 'profile';
export type DualTrackJourneyPreset = 'easy' | 'medium' | 'hard';
export type DualTrackAdaptiveIdentityPhase = 'classic' | 'audio' | 'color' | 'color-audio';
export type DualTrackMotionComplexity = 'smooth' | 'standard' | 'agile';
export type DualTrackCrowdingMode = 'low' | 'standard' | 'dense';
export type DualTrackResolvedIdentityMode = DualTrackIdentityMode | 'letter';

export const DUAL_TRACK_COLOR_PROGRESS_THRESHOLD_PCT = 65;
export const DUAL_TRACK_AUDIO_PROGRESS_THRESHOLD_PCT = 85;

export interface DualTrackResolvedExtensions {
  readonly totalObjects?: number | null;
  readonly targetCount?: number | null;
  readonly highlightDurationMs?: number | null;
  readonly trackingDurationMs?: number | null;
  readonly speedPxPerSec?: number | null;
  readonly trackingIdentityMode?: DualTrackResolvedIdentityMode | null;
  readonly trackingLetterAudioEnabled?: boolean | null;
  readonly trackingTonesEnabled?: boolean | null;
  readonly motionComplexity?: DualTrackMotionComplexity | null;
  readonly crowdingMode?: DualTrackCrowdingMode | null;
  readonly focusCrossEnabled?: boolean | null;
  readonly highlightSpacingMs?: number | null;
}

export interface NormalizedDualTrackResolvedSettings {
  readonly totalObjects?: number;
  readonly targetCount?: number;
  readonly highlightDurationMs?: number;
  readonly trackingDurationMs?: number;
  readonly speedPxPerSec?: number;
  readonly trackingIdentityMode: DualTrackIdentityMode;
  readonly trackingLetterAudioEnabled: boolean;
  readonly trackingTonesEnabled: boolean;
  readonly motionComplexity: DualTrackMotionComplexity;
  readonly crowdingMode: DualTrackCrowdingMode;
  readonly focusCrossEnabled: boolean;
  readonly highlightSpacingMs?: number;
}

function normalizeOptionalNumber(value: number | null | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return value;
}

const VALID_IDENTITY_MODES: ReadonlySet<string> = new Set<DualTrackIdentityMode>([
  'classic',
  'color',
  'position',
  'image',
  'spatial',
  'digits',
  'emotions',
  'words',
]);

function normalizeTrackingIdentityMode(
  mode: DualTrackResolvedIdentityMode | null | undefined,
): DualTrackIdentityMode {
  if (mode && VALID_IDENTITY_MODES.has(mode)) return mode as DualTrackIdentityMode;
  return 'classic';
}

export function normalizeDualTrackResolvedSettings(
  input: DualTrackResolvedExtensions,
): NormalizedDualTrackResolvedSettings {
  return {
    totalObjects: normalizeOptionalNumber(input.totalObjects),
    targetCount: normalizeOptionalNumber(input.targetCount),
    highlightDurationMs: normalizeOptionalNumber(input.highlightDurationMs),
    trackingDurationMs: normalizeOptionalNumber(input.trackingDurationMs),
    speedPxPerSec: normalizeOptionalNumber(input.speedPxPerSec),
    trackingIdentityMode: normalizeTrackingIdentityMode(input.trackingIdentityMode),
    trackingLetterAudioEnabled:
      input.trackingLetterAudioEnabled === true || input.trackingIdentityMode === 'letter',
    trackingTonesEnabled: input.trackingTonesEnabled === true,
    motionComplexity: input.motionComplexity ?? 'standard',
    crowdingMode: input.crowdingMode ?? 'standard',
    focusCrossEnabled: input.focusCrossEnabled === true,
    highlightSpacingMs: normalizeOptionalNumber(input.highlightSpacingMs),
  };
}

export function resolveEffectiveDualTrackIdentityMode({
  manualMode,
  playMode: _playMode,
  calibrationPending: _calibrationPending,
}: {
  manualMode: DualTrackIdentityMode;
  playMode: DualTrackPlayMode;
  calibrationPending: boolean;
}): DualTrackIdentityMode {
  return manualMode;
}

export function resolveDualTrackJourneyPreset(input: {
  readonly playMode: DualTrackPlayMode;
  readonly journeyGameMode?: string;
  readonly journeyStrategyConfig?: JourneyStrategyConfig;
  readonly calibratedPreset?: DualTrackJourneyPreset;
}): DualTrackJourneyPreset | null {
  if (input.playMode !== 'journey' || input.journeyGameMode !== 'dual-track') return null;
  if (input.calibratedPreset) return input.calibratedPreset;
  return resolveDualTrackJourneyPresetFromLogic({
    gameMode: input.journeyGameMode,
    strategyConfig: input.journeyStrategyConfig,
  });
}

function normalizeProgressPct(progressPct: number | null | undefined): number | null {
  if (typeof progressPct !== 'number' || !Number.isFinite(progressPct)) return null;
  return Math.max(0, Math.min(100, Math.round(progressPct)));
}

export function resolveAdaptiveDualTrackIdentitySettings(input: {
  readonly preset?: DualTrackJourneyPreset | null;
  readonly manualMode: DualTrackIdentityMode;
  readonly manualLetterAudioEnabled: boolean;
  readonly progressPct?: number | null;
  readonly calibrationPending: boolean;
}): {
  readonly trackingIdentityMode: DualTrackIdentityMode;
  readonly trackingLetterAudioEnabled: boolean;
  readonly autoPhase: DualTrackAdaptiveIdentityPhase;
} {
  const progressPct = normalizeProgressPct(input.progressPct);
  const automationEnabled = !input.calibrationPending && progressPct !== null;
  const preset = input.preset ?? null;
  const autoColorEnabled =
    automationEnabled && progressPct >= DUAL_TRACK_COLOR_PROGRESS_THRESHOLD_PCT;
  const autoAudioEnabled =
    automationEnabled && progressPct >= DUAL_TRACK_AUDIO_PROGRESS_THRESHOLD_PCT;

  if (preset === 'easy') {
    return {
      trackingIdentityMode: 'classic',
      trackingLetterAudioEnabled: false,
      autoPhase: 'classic',
    };
  }

  if (preset === 'medium') {
    const mediumAudioEnabled =
      automationEnabled && progressPct >= DUAL_TRACK_COLOR_PROGRESS_THRESHOLD_PCT;
    return {
      trackingIdentityMode: 'classic',
      trackingLetterAudioEnabled: mediumAudioEnabled,
      autoPhase: mediumAudioEnabled ? 'audio' : 'classic',
    };
  }

  if (preset === 'hard') {
    return {
      trackingIdentityMode: autoColorEnabled ? 'color' : 'classic',
      trackingLetterAudioEnabled: autoAudioEnabled,
      autoPhase: autoAudioEnabled ? 'color-audio' : autoColorEnabled ? 'color' : 'classic',
    };
  }

  return {
    trackingIdentityMode: input.manualMode === 'color' || autoColorEnabled ? 'color' : 'classic',
    trackingLetterAudioEnabled: input.manualLetterAudioEnabled || autoAudioEnabled,
    autoPhase: autoAudioEnabled ? 'color-audio' : autoColorEnabled ? 'color' : 'classic',
  };
}

export function relaxDualTrackCrowdingForIdentityLoad(
  crowdingMode: DualTrackCrowdingMode,
  input: {
    readonly trackingIdentityMode: DualTrackIdentityMode;
    readonly trackingLetterAudioEnabled: boolean;
  },
): DualTrackCrowdingMode {
  const hasCombinedIdentityLoad =
    input.trackingIdentityMode !== 'classic' && input.trackingLetterAudioEnabled;

  if (!hasCombinedIdentityLoad) return crowdingMode;
  if (crowdingMode === 'dense') return 'standard';
  if (crowdingMode === 'standard') return 'low';
  return 'low';
}

export interface CalibrationDualTrackConfig {
  readonly identityMode: string;
  readonly targets: number;
  readonly distractors: number;
  readonly trackingMs: number;
  readonly blockSize: number;
  readonly level: number;
}

export function resolveDualTrackModeSettings(input: {
  readonly playMode: DualTrackPlayMode;
  readonly journeyGameMode?: string;
  readonly journeyNLevel?: number;
  readonly synergyConfig?: SynergyConfig;
  readonly freeModeSettings?: ModeSettings;
  readonly journeyModeSettings?: ModeSettings;
  readonly calibrationConfig?: CalibrationDualTrackConfig;
}): ModeSettings {
  if (
    (input.playMode === 'calibration' || input.playMode === 'profile') &&
    input.calibrationConfig
  ) {
    const cal = input.calibrationConfig;
    return {
      nLevel: cal.level,
      trialsCount: cal.blockSize,
      trackingDurationMode: 'manual',
      trackingDurationMs: cal.trackingMs,
      trackingSpeedMode: 'manual',
      trackingSpeedPxPerSec: 160,
      trackingIdentityMode: cal.identityMode,
      trackingLetterAudioEnabled: cal.identityMode === 'letter',
      trackingTonesEnabled: cal.identityMode === 'tones',
      motionComplexity: 'standard',
      crowdingMode: 'low',
      totalObjectsMode: 'manual',
      totalObjects: cal.targets + cal.distractors,
      targetCount: cal.targets,
      trackingFocusCrossEnabled: true,
    } as ModeSettings;
  }

  if (input.playMode === 'synergy') {
    if (!input.synergyConfig) {
      return input.freeModeSettings ?? {};
    }

    return {
      ...(input.freeModeSettings ?? {}),
      nLevel: input.synergyConfig.dualTrackNLevel,
      trialsCount: input.synergyConfig.dualTrackTrialsCount,
      trackingDurationMode: 'manual',
      trackingDurationMs: input.synergyConfig.dualTrackTrackingDurationMs,
      trackingSpeedMode: 'manual',
      trackingSpeedPxPerSec: input.synergyConfig.dualTrackTrackingSpeedPxPerSec,
      trackingIdentityMode: input.synergyConfig.dualTrackIdentityMode ?? 'classic',
      trackingLetterAudioEnabled: input.synergyConfig.dualTrackIdentityMode === 'letter',
      motionComplexity: input.synergyConfig.dualTrackMotionComplexity,
      crowdingMode: input.synergyConfig.dualTrackCrowdingMode,
      ballsOffset: input.synergyConfig.dualTrackBallsOffset ?? 0,
      ...(input.synergyConfig.dualTrackTotalObjects != null
        ? {
            totalObjectsMode: 'manual' as const,
            totalObjects: input.synergyConfig.dualTrackTotalObjects,
          }
        : { totalObjectsMode: 'auto' as const }),
    };
  }

  if (input.playMode !== 'journey') {
    return input.freeModeSettings ?? {};
  }

  if (
    input.journeyGameMode === 'dual-track-dnb-hybrid' &&
    typeof input.journeyNLevel === 'number' &&
    Number.isFinite(input.journeyNLevel)
  ) {
    return {
      ...resolveHybridJourneyTrackProfile(input.journeyNLevel),
      ...(input.journeyModeSettings ?? {}),
    };
  }

  return input.journeyModeSettings ?? {};
}
