/**
 * Play Intent
 *
 * Explicit contract carried in router state to disambiguate how a game
 * session must start:
 * - `journey`: stage-driven progression context
 * - `free`: user-selected free training mode
 */

import type { CalibrationPlayConfig, JourneyStrategyConfig } from '@neurodual/logic';

// Stub for removed NextJourneySession
type NextJourneySession = {
  stageId: number;
  journeyId: string;
  gameMode: string;
  startLevel: number;
  targetLevel: number;
  journeyGameMode?: string;
  strategyConfig?: JourneyStrategyConfig;
  nLevel: number;
};

export type { CalibrationPlayConfig } from '@neurodual/logic';

export type PlayMode = 'journey' | 'free' | 'synergy' | 'calibration' | 'profile';

export interface PlayIntentState {
  readonly playMode?: PlayMode;
  readonly journeyStageId?: number;
  readonly journeyId?: string;
  /** Explicit game mode to run (needed for shared routes like /nback). */
  readonly gameModeId?: string;
  /** Optional journey config snapshot for deterministic routing. */
  readonly journeyStartLevel?: number;
  readonly journeyTargetLevel?: number;
  readonly journeyGameModeId?: string;
  readonly journeyStrategyConfig?: JourneyStrategyConfig;
  /**
   * Authoritative N-level for the session. When present, the game page uses
   * this directly instead of re-deriving from stageId + startLevel (which can
   * be inconsistent after a journey startLevel expansion).
   */
  readonly journeyNLevel?: number;
  /** Dual Track internal adaptive-path override carried from a report continuation action. */
  readonly dualTrackJourneyTargetCount?: number;
  readonly dualTrackJourneyTierIndex?: number;
  /** Synergy loop context — present when playMode='synergy'. */
  readonly synergyLoopIndex?: number;
  readonly synergyTotalLoops?: number;
  readonly synergyStepIndex?: number;
  /** Profile calibration config — present when playMode='calibration'. */
  readonly calibration?: CalibrationPlayConfig;
  /** Profile training config — present when playMode='profile'. */
  readonly profileTraining?: CalibrationPlayConfig;
}

export interface ResolvedPlayIntent {
  readonly playMode: PlayMode;
  readonly journeyStageId?: number;
  readonly journeyId?: string;
  readonly gameModeId?: string;
  readonly journeyStartLevel?: number;
  readonly journeyTargetLevel?: number;
  readonly journeyGameModeId?: string;
  readonly journeyStrategyConfig?: JourneyStrategyConfig;
  readonly journeyNLevel?: number;
  readonly dualTrackJourneyTargetCount?: number;
  readonly dualTrackJourneyTierIndex?: number;
  readonly hasJourneyRouteState: boolean;
  readonly synergyLoopIndex?: number;
  readonly synergyTotalLoops?: number;
  readonly synergyStepIndex?: number;
}

interface ResolveSessionJourneyIdInput {
  readonly playMode: PlayMode;
  readonly recoveredJourneyId?: string | null;
  readonly routeJourneyId?: string | null;
  readonly activeJourneyId?: string | null;
  readonly configJourneyId?: string | null;
}

export function createFreePlayIntent(gameModeId?: string): PlayIntentState {
  return { playMode: 'free', gameModeId };
}

export function createCalibrationPlayIntent(config: CalibrationPlayConfig): PlayIntentState {
  return { playMode: 'calibration', calibration: config };
}

export function createProfileTrainingPlayIntent(config: CalibrationPlayConfig): PlayIntentState {
  return { playMode: 'profile', profileTraining: config };
}

export function createSynergyPlayIntent(
  gameModeId: string,
  opts: {
    loopIndex: number;
    totalLoops: number;
    stepIndex: number;
  },
): PlayIntentState {
  return {
    playMode: 'synergy',
    gameModeId,
    synergyLoopIndex: opts.loopIndex,
    synergyTotalLoops: opts.totalLoops,
    synergyStepIndex: opts.stepIndex,
  };
}

/**
 * Converts a NextJourneySession from the read model into a PlayIntentState.
 *
 * Single point of conversion — replaces the scattered createJourneyPlayIntent()
 * + getStageDefinition() + getRouteForGameMode() calls in game pages.
 */
export function nextSessionToPlayIntent(session: NextJourneySession): PlayIntentState {
  return {
    playMode: 'journey',
    journeyStageId: session.stageId,
    journeyId: session.journeyId,
    gameModeId: session.gameMode,
    journeyStartLevel: session.startLevel,
    journeyTargetLevel: session.targetLevel,
    journeyGameModeId: session.journeyGameMode,
    journeyStrategyConfig: session.strategyConfig,
    journeyNLevel: session.nLevel,
  };
}

export function createJourneyPlayIntent(
  journeyStageId: number,
  journeyId?: string,
  opts?: {
    gameModeId?: string;
    journeyStartLevel?: number;
    journeyTargetLevel?: number;
    journeyGameModeId?: string;
    journeyStrategyConfig?: JourneyStrategyConfig;
    journeyNLevel?: number;
    dualTrackJourneyTargetCount?: number;
    dualTrackJourneyTierIndex?: number;
  },
): PlayIntentState {
  return {
    playMode: 'journey',
    journeyStageId,
    journeyId,
    gameModeId: opts?.gameModeId,
    journeyStartLevel: opts?.journeyStartLevel,
    journeyTargetLevel: opts?.journeyTargetLevel,
    journeyGameModeId: opts?.journeyGameModeId,
    journeyStrategyConfig: opts?.journeyStrategyConfig,
    journeyNLevel: opts?.journeyNLevel,
    dualTrackJourneyTargetCount: opts?.dualTrackJourneyTargetCount,
    dualTrackJourneyTierIndex: opts?.dualTrackJourneyTierIndex,
  };
}

function toNonEmptyJourneyId(value: string | null | undefined): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Resolve a stable journeyId for session creation/persistence.
 *
 * Priority:
 * 1) recovered snapshot (resume interrupted journey session)
 * 2) explicit router state
 * 3) active journey in settings
 * 4) journey config fallback
 */
export function resolveSessionJourneyId(input: ResolveSessionJourneyIdInput): string | undefined {
  if (input.playMode !== 'journey') return undefined;
  return (
    toNonEmptyJourneyId(input.recoveredJourneyId) ??
    toNonEmptyJourneyId(input.routeJourneyId) ??
    toNonEmptyJourneyId(input.activeJourneyId) ??
    toNonEmptyJourneyId(input.configJourneyId)
  );
}

/**
 * Resolve the concrete play mode to persist on a session.
 *
 * Calibration and synergy are explicit contexts and must never be collapsed to
 * free mode. Journey snapshots still force journey mode when the caller only
 * requested free mode but a journey continuation is already in-flight.
 */
export function resolveSessionPlayMode(input: {
  readonly requestedPlayMode: PlayMode;
  readonly hasJourneySnapshot: boolean;
}): PlayMode {
  if (
    input.requestedPlayMode === 'calibration' ||
    input.requestedPlayMode === 'synergy' ||
    input.requestedPlayMode === 'profile'
  ) {
    return input.requestedPlayMode;
  }

  if (input.requestedPlayMode === 'journey' || input.hasJourneySnapshot) {
    return 'journey';
  }

  return 'free';
}

/**
 * Resolve route state into a deterministic play intent.
 */
export function resolvePlayIntent(state: unknown): ResolvedPlayIntent {
  const candidate =
    state && typeof state === 'object' ? (state as Record<string, unknown>) : undefined;

  const playMode = candidate?.['playMode'];
  const journeyStageId = candidate?.['journeyStageId'];
  const journeyId = candidate?.['journeyId'];
  const gameModeId = candidate?.['gameModeId'];
  const journeyStartLevel = candidate?.['journeyStartLevel'];
  const journeyTargetLevel = candidate?.['journeyTargetLevel'];
  const journeyGameModeId = candidate?.['journeyGameModeId'];
  const journeyStrategyConfig = candidate?.['journeyStrategyConfig'];
  const journeyNLevel = candidate?.['journeyNLevel'];
  const dualTrackJourneyTargetCount = candidate?.['dualTrackJourneyTargetCount'];
  const dualTrackJourneyTierIndex = candidate?.['dualTrackJourneyTierIndex'];

  const hasJourneyRouteState = typeof journeyStageId === 'number' || typeof journeyId === 'string';

  if (playMode === 'synergy') {
    const synergyLoopIndex = candidate?.['synergyLoopIndex'];
    const synergyTotalLoops = candidate?.['synergyTotalLoops'];
    const synergyStepIndex = candidate?.['synergyStepIndex'];
    return {
      playMode: 'synergy',
      gameModeId: typeof gameModeId === 'string' ? gameModeId : undefined,
      hasJourneyRouteState: false,
      synergyLoopIndex: typeof synergyLoopIndex === 'number' ? synergyLoopIndex : undefined,
      synergyTotalLoops: typeof synergyTotalLoops === 'number' ? synergyTotalLoops : undefined,
      synergyStepIndex: typeof synergyStepIndex === 'number' ? synergyStepIndex : undefined,
    };
  }

  if (playMode === 'profile') {
    if (hasJourneyRouteState) {
      throw new Error('[PlayIntent] Journey route state requires playMode="journey"');
    }
    return {
      playMode: 'profile',
      gameModeId: typeof gameModeId === 'string' ? gameModeId : undefined,
      hasJourneyRouteState: false,
    };
  }

  if (playMode === 'free') {
    if (hasJourneyRouteState) {
      throw new Error('[PlayIntent] Journey route state requires playMode="journey"');
    }
    return {
      playMode: 'free',
      gameModeId: typeof gameModeId === 'string' ? gameModeId : undefined,
      hasJourneyRouteState: false,
    };
  }

  if (playMode !== 'journey') {
    if (hasJourneyRouteState) {
      throw new Error('[PlayIntent] Missing playMode in journey route state');
    }
    return {
      playMode: 'free',
      gameModeId: typeof gameModeId === 'string' ? gameModeId : undefined,
      hasJourneyRouteState: false,
    };
  }

  if (typeof journeyStageId !== 'number') {
    throw new Error('[PlayIntent] journeyStageId is required when playMode="journey"');
  }

  return {
    playMode: 'journey',
    journeyStageId,
    journeyId: typeof journeyId === 'string' ? journeyId : undefined,
    gameModeId: typeof gameModeId === 'string' ? gameModeId : undefined,
    journeyStartLevel: typeof journeyStartLevel === 'number' ? journeyStartLevel : undefined,
    journeyTargetLevel: typeof journeyTargetLevel === 'number' ? journeyTargetLevel : undefined,
    journeyGameModeId: typeof journeyGameModeId === 'string' ? journeyGameModeId : undefined,
    journeyStrategyConfig:
      journeyStrategyConfig && typeof journeyStrategyConfig === 'object'
        ? (journeyStrategyConfig as JourneyStrategyConfig)
        : undefined,
    journeyNLevel: typeof journeyNLevel === 'number' ? journeyNLevel : undefined,
    dualTrackJourneyTargetCount:
      typeof dualTrackJourneyTargetCount === 'number' ? dualTrackJourneyTargetCount : undefined,
    dualTrackJourneyTierIndex:
      typeof dualTrackJourneyTierIndex === 'number' ? dualTrackJourneyTierIndex : undefined,
    hasJourneyRouteState: true,
  };
}
