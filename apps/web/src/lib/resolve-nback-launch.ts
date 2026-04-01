import type { ResolvedPlayIntent } from './play-intent';
import {
  DUAL_TRACK_DNB_HYBRID_MODE_ID,
} from '@neurodual/logic';

export interface NbackJourneyConfigSnapshot {
  readonly journeyId?: string;
  readonly startLevel?: number;
  readonly targetLevel?: number;
  readonly gameMode?: string;
}

export interface NbackActiveJourneySnapshot {
  readonly id?: string;
  readonly gameMode?: string;
  readonly startLevel?: number;
  readonly targetLevel?: number;
}

export interface ResolvedNbackLaunch {
  readonly journeyStageId?: number;
  readonly journeyId?: string;
  readonly journeyStartLevel: number;
  readonly journeyTargetLevel: number;
  readonly journeyGameMode?: string;
  readonly isSimulatorJourney: boolean;
  readonly journeyNLevel?: number;
  readonly effectiveMode: string;
}

export function resolveNbackLaunch(params: {
  readonly playIntent: ResolvedPlayIntent;
  readonly journeyStateCurrentStage?: number;
  readonly journeyStateNextSessionGameMode?: string;
  readonly journeyConfig?: NbackJourneyConfigSnapshot;
  readonly activeJourney?: NbackActiveJourneySnapshot;
  readonly settingsMode: string;
}): ResolvedNbackLaunch {
  const shouldUseJourneyContext = params.playIntent.playMode === 'journey';

  const journeyGameMode = shouldUseJourneyContext
    ? (params.playIntent.journeyGameModeId ??
      params.activeJourney?.gameMode ??
      params.journeyConfig?.gameMode)
    : undefined;

  const isSimulatorJourney = !!journeyGameMode;
  const explicitJourneySessionMode =
    params.playIntent.playMode === 'journey' && typeof params.playIntent.gameModeId === 'string'
      ? params.playIntent.gameModeId
      : undefined;
  const isHybridJourney = journeyGameMode === DUAL_TRACK_DNB_HYBRID_MODE_ID;

  let journeyStageId =
    params.playIntent.journeyStageId ??
    (shouldUseJourneyContext ? params.journeyStateCurrentStage : undefined);

  const journeyId =
    params.playIntent.journeyId ??
    (shouldUseJourneyContext
      ? (params.activeJourney?.id ?? params.journeyConfig?.journeyId)
      : undefined);

  const journeyTargetLevel = shouldUseJourneyContext
    ? (params.playIntent.journeyTargetLevel ??
      params.activeJourney?.targetLevel ??
      params.journeyConfig?.targetLevel ??
      5)
    : 5;

  const journeyStartLevel = shouldUseJourneyContext
    ? (params.playIntent.journeyStartLevel ??
      params.activeJourney?.startLevel ??
      params.journeyConfig?.startLevel ??
      1)
    : 1;

  let effectiveMode =
    typeof params.playIntent.gameModeId === 'string'
      ? params.playIntent.gameModeId
      : params.settingsMode;

  // Authoritative N-level from the play intent (set by the action that triggered
  // navigation). When present, this takes priority over re-deriving from
  // stageId + startLevel, which can be inconsistent after startLevel expansion.
  let journeyNLevel: number | undefined =
    typeof params.playIntent.journeyNLevel === 'number' &&
    Number.isFinite(params.playIntent.journeyNLevel)
      ? params.playIntent.journeyNLevel
      : undefined;

  if (
    shouldUseJourneyContext &&
    isSimulatorJourney &&
    journeyGameMode &&
    !explicitJourneySessionMode
  ) {
    effectiveMode =
      params.journeyStateNextSessionGameMode ??
      (!isHybridJourney ? journeyGameMode : undefined) ??
      effectiveMode;
  }

  return {
    journeyStageId,
    journeyId,
    journeyStartLevel,
    journeyTargetLevel,
    journeyGameMode,
    isSimulatorJourney,
    journeyNLevel,
    effectiveMode,
  };
}
