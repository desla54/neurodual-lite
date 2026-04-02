import type { ResolvedPlayIntent } from './play-intent';
import { DUAL_TRACK_DNB_HYBRID_MODE_ID, generateJourneyStages } from '@neurodual/logic';

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

function resolveJourneyStageId(input: {
  readonly requestedStageId?: number;
  readonly projectedStageId?: number;
  readonly startLevel: number;
  readonly targetLevel: number;
  readonly gameMode?: string;
}): number | undefined {
  const stageDefinitions = generateJourneyStages(
    input.targetLevel,
    input.startLevel,
    true,
    input.gameMode,
  );
  if (stageDefinitions.length === 0) return undefined;

  const rawStageId = input.requestedStageId ?? input.projectedStageId;
  if (typeof rawStageId !== 'number' || !Number.isFinite(rawStageId)) {
    return undefined;
  }

  const clampedIndex = Math.min(
    stageDefinitions.length - 1,
    Math.max(0, Math.trunc(rawStageId) - 1),
  );
  return stageDefinitions[clampedIndex]?.stageId;
}

function resolveJourneyStageNLevel(input: {
  readonly explicitJourneyNLevel?: number;
  readonly journeyStageId?: number;
  readonly startLevel: number;
  readonly targetLevel: number;
  readonly gameMode?: string;
}): number | undefined {
  if (
    typeof input.explicitJourneyNLevel === 'number' &&
    Number.isFinite(input.explicitJourneyNLevel)
  ) {
    return input.explicitJourneyNLevel;
  }

  if (typeof input.journeyStageId !== 'number' || !Number.isFinite(input.journeyStageId)) {
    return undefined;
  }

  const stageDefinitions = generateJourneyStages(
    input.targetLevel,
    input.startLevel,
    true,
    input.gameMode,
  );
  return stageDefinitions.find((stage) => stage.stageId === input.journeyStageId)?.nLevel;
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
  const isCompositeJourney = journeyGameMode === 'neurodual-mix';

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

  const journeyStageId = shouldUseJourneyContext
    ? resolveJourneyStageId({
        requestedStageId: params.playIntent.journeyStageId,
        projectedStageId: params.journeyStateCurrentStage,
        startLevel: journeyStartLevel,
        targetLevel: journeyTargetLevel,
        gameMode: journeyGameMode,
      })
    : undefined;

  const journeyId =
    params.playIntent.journeyId ??
    (shouldUseJourneyContext
      ? (params.activeJourney?.id ?? params.journeyConfig?.journeyId)
      : undefined);

  let effectiveMode =
    typeof params.playIntent.gameModeId === 'string'
      ? params.playIntent.gameModeId
      : params.settingsMode;

  const journeyNLevel = shouldUseJourneyContext
    ? resolveJourneyStageNLevel({
        explicitJourneyNLevel: params.playIntent.journeyNLevel,
        journeyStageId,
        startLevel: journeyStartLevel,
        targetLevel: journeyTargetLevel,
        gameMode: journeyGameMode,
      })
    : undefined;

  if (
    shouldUseJourneyContext &&
    isSimulatorJourney &&
    journeyGameMode &&
    !explicitJourneySessionMode
  ) {
    effectiveMode =
      params.journeyStateNextSessionGameMode ??
      (isCompositeJourney ? 'dualnback-classic' : undefined) ??
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
