import type { RecoveredSessionState } from '@neurodual/logic';
import type { JourneyStrategyConfig } from '@neurodual/logic';
import type { PlayMode } from './play-intent';
import { resolveSessionJourneyId } from './play-intent';
import type { ResolvedNbackLaunch } from './resolve-nback-launch';
import type {
  NbackJourneyConfigSnapshot,
  NbackActiveJourneySnapshot,
} from './resolve-nback-launch';

interface NbackRuntimeJourneyConfigSnapshot extends NbackJourneyConfigSnapshot {
  readonly strategyConfig?: JourneyStrategyConfig;
}

interface NbackRuntimeActiveJourneySnapshot extends NbackActiveJourneySnapshot {
  readonly name?: string;
  readonly nameKey?: string;
  readonly strategyConfig?: JourneyStrategyConfig;
}

type RecoveredRuntimeSnapshot = Pick<
  RecoveredSessionState,
  'playMode' | 'journeyStageId' | 'journeyId' | 'gameMode' | 'nLevel' | 'config'
>;

export interface ResolvedNbackRuntimeContext {
  readonly effectivePlayMode: PlayMode;
  readonly journeyStageId?: number;
  readonly activeJourneyId: string | null;
  readonly resolvedJourneyIdForSession?: string;
  readonly journeyGameMode?: string;
  readonly journeyStartLevel: number;
  readonly journeyTargetLevel: number;
  readonly journeyNLevel?: number;
  readonly effectiveMode: string;
  readonly shouldUseJourneySettings: boolean;
  readonly journeyStrategyConfig?: JourneyStrategyConfig;
}

export function resolveNbackRuntimeContext(params: {
  readonly requestedPlayMode: PlayMode;
  readonly requestedLaunch: ResolvedNbackLaunch;
  readonly requestedJourneyStrategyConfig?: JourneyStrategyConfig;
  readonly recoveredState?: RecoveredRuntimeSnapshot | null;
  readonly journeyConfig?: NbackRuntimeJourneyConfigSnapshot | null;
  readonly activeJourney?: NbackRuntimeActiveJourneySnapshot;
  readonly activeJourneyIdFromStore?: string | null;
}): ResolvedNbackRuntimeContext {
  const effectivePlayMode = params.recoveredState?.playMode ?? params.requestedPlayMode;
  const shouldUseJourneyContext = effectivePlayMode === 'journey';
  const journeyStageId =
    params.recoveredState?.journeyStageId ?? params.requestedLaunch.journeyStageId;
  const routeJourneyId = params.requestedLaunch.journeyId;
  const activeJourneyId = shouldUseJourneyContext
    ? (routeJourneyId ?? params.journeyConfig?.journeyId ?? params.activeJourneyIdFromStore ?? null)
    : null;

  const resolvedJourneyIdForSession = resolveSessionJourneyId({
    playMode: effectivePlayMode,
    recoveredJourneyId: params.recoveredState?.journeyId,
    routeJourneyId,
    activeJourneyId: activeJourneyId ?? params.activeJourneyIdFromStore,
    configJourneyId: params.journeyConfig?.journeyId,
  });

  if (effectivePlayMode === 'journey' && typeof resolvedJourneyIdForSession !== 'string') {
    throw new Error('[NbackTrainingPage] journeyId is required when playMode="journey"');
  }

  const journeyGameMode = shouldUseJourneyContext
    ? (params.requestedLaunch.journeyGameMode ??
      params.activeJourney?.gameMode ??
      params.journeyConfig?.gameMode)
    : undefined;
  const journeyStartLevel = shouldUseJourneyContext
    ? (params.requestedLaunch.journeyStartLevel ??
      params.activeJourney?.startLevel ??
      params.journeyConfig?.startLevel ??
      1)
    : 1;
  const journeyTargetLevel = shouldUseJourneyContext
    ? (params.requestedLaunch.journeyTargetLevel ??
      params.activeJourney?.targetLevel ??
      params.journeyConfig?.targetLevel ??
      5)
    : 5;
  const recoveredEffectiveMode =
    typeof params.recoveredState?.gameMode === 'string' && params.recoveredState.gameMode.length > 0
      ? params.recoveredState.gameMode
      : undefined;
  const recoveredJourneyNLevel =
    typeof params.recoveredState?.nLevel === 'number' &&
    Number.isFinite(params.recoveredState.nLevel)
      ? params.recoveredState.nLevel
      : undefined;
  const shouldUseJourneySettings =
    effectivePlayMode === 'journey' &&
    !!journeyGameMode &&
    typeof resolvedJourneyIdForSession === 'string';

  return {
    effectivePlayMode,
    journeyStageId,
    activeJourneyId: shouldUseJourneyContext
      ? (resolvedJourneyIdForSession ?? activeJourneyId ?? null)
      : null,
    resolvedJourneyIdForSession,
    journeyGameMode,
    journeyStartLevel,
    journeyTargetLevel,
    journeyNLevel: recoveredJourneyNLevel ?? params.requestedLaunch.journeyNLevel,
    effectiveMode: recoveredEffectiveMode ?? params.requestedLaunch.effectiveMode,
    shouldUseJourneySettings,
    journeyStrategyConfig: shouldUseJourneyContext
      ? (params.requestedJourneyStrategyConfig ??
        params.journeyConfig?.strategyConfig ??
        params.activeJourney?.strategyConfig)
      : undefined,
  };
}
