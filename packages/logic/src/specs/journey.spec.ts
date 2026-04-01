/**
 * Journey Specification - Stub for backward compatibility
 */

import {
  JOURNEY_SCORE_EXCELLENT,
  JOURNEY_SCORE_GOOD,
  JOURNEY_SCORE_PASSING,
  JOURNEY_SESSIONS_EXCELLENT,
  JOURNEY_SESSIONS_GOOD,
  JOURNEY_SESSIONS_PASSING,
  JOURNEY_MAX_LEVEL as _JOURNEY_MAX_LEVEL,
  JOURNEY_DEFAULT_TARGET_LEVEL as _JOURNEY_DEFAULT_TARGET_LEVEL,
  JOURNEY_DEFAULT_START_LEVEL as _JOURNEY_DEFAULT_START_LEVEL,
  JOURNEY_MODES_PER_LEVEL as _JOURNEY_MODES_PER_LEVEL,
  PREMIUM_N_THRESHOLD,
} from './thresholds';

export const DUAL_TRACK_DNB_HYBRID_MODE_ID = 'dual-track-dnb-hybrid';

export type JourneyModeType = 'pick' | 'place' | 'memo' | 'catch' | 'simulator';

export type JourneyProjectionKind =
  | 'binary'
  | 'continuous-dprime'
  | 'continuous-score'
  | 'alternating';

export interface IndicatorConfig {
  readonly rulesetId: 'jaeggi' | 'brainworkshop' | 'accuracy' | 'trace-accuracy';
  readonly explanationKind: 'jaeggi' | 'brainworkshop' | 'accuracy';
  readonly messageKindMap: {
    readonly free?: Partial<Record<'up' | 'stay' | 'down', string>>;
    readonly journey?: Partial<Record<'up' | 'stay' | 'down', string>>;
    readonly strikes?: Record<number, string>;
    readonly completed?: string;
  };
  readonly postProcessorId?: 'hybrid-jaeggi' | 'dual-track';
}

export interface SimulatorJourneySpec {
  readonly gameMode: string;
  readonly route: string;
  readonly scoringStrategy: 'brainworkshop' | 'dualnback-classic' | 'balanced' | 'dprime';
  readonly binaryProgression: boolean;
  readonly projectionKind: JourneyProjectionKind;
  readonly indicator?: IndicatorConfig;
}

export const ALTERNATING_JOURNEY_FIRST_MODE = 'dual-track';
export const ALTERNATING_JOURNEY_SECOND_MODE = 'dualnback-classic';
export const HYBRID_TRACK_BLOCK_SIZE_DEFAULT = 1;
export const HYBRID_DNB_BLOCK_SIZE_DEFAULT = 3;

export const JOURNEY_MAX_LEVEL = _JOURNEY_MAX_LEVEL;
export const JOURNEY_DEFAULT_TARGET_LEVEL = _JOURNEY_DEFAULT_TARGET_LEVEL;
export const JOURNEY_DEFAULT_START_LEVEL = _JOURNEY_DEFAULT_START_LEVEL;
export const JOURNEY_PREMIUM_N_THRESHOLD = PREMIUM_N_THRESHOLD;
export const JOURNEY_MODES_PER_LEVEL = _JOURNEY_MODES_PER_LEVEL;

export const SimulatorSpecs: Record<string, SimulatorJourneySpec> = {
  'dual-catch': {
    gameMode: 'dual-catch',
    route: '/nback',
    scoringStrategy: 'dprime',
    binaryProgression: false,
    projectionKind: 'continuous-dprime',
  },
  'dualnback-classic': {
    gameMode: 'dualnback-classic',
    route: '/nback',
    scoringStrategy: 'dualnback-classic',
    binaryProgression: true,
    projectionKind: 'binary',
    indicator: {
      rulesetId: 'jaeggi',
      explanationKind: 'jaeggi',
      messageKindMap: {
        free: { up: 'free-up', stay: 'free-stay', down: 'free-down' },
        journey: { up: 'jaeggi-up', stay: 'jaeggi-stay', down: 'jaeggi-down' },
        completed: 'journey-completed',
      },
    },
  },
  'sim-brainworkshop': {
    gameMode: 'sim-brainworkshop',
    route: '/nback',
    scoringStrategy: 'brainworkshop',
    binaryProgression: true,
    projectionKind: 'binary',
    indicator: {
      rulesetId: 'brainworkshop',
      explanationKind: 'brainworkshop',
      messageKindMap: {
        free: { up: 'bw-up', stay: 'bw-stay', down: 'bw-down' },
        journey: { up: 'bw-up', stay: 'bw-stay', down: 'bw-down' },
        strikes: { 1: 'bw-strike-1', 2: 'bw-strike-2' },
        completed: 'journey-completed',
      },
    },
  },
} as const;

export { JOURNEY_MIN_PASSING_SCORE } from './thresholds';

export const JOURNEY_SCORE_THRESHOLDS = {
  EXCELLENT: JOURNEY_SCORE_EXCELLENT,
  GOOD: JOURNEY_SCORE_GOOD,
  PASSING: JOURNEY_SCORE_PASSING,
} as const;

export const JOURNEY_SESSIONS_BY_SCORE = {
  EXCELLENT: JOURNEY_SESSIONS_EXCELLENT,
  GOOD: JOURNEY_SESSIONS_GOOD,
  PASSING: JOURNEY_SESSIONS_PASSING,
} as const;

export function getSessionsRequired(score: number): number {
  if (score >= JOURNEY_SCORE_THRESHOLDS.EXCELLENT) return JOURNEY_SESSIONS_BY_SCORE.EXCELLENT;
  if (score >= JOURNEY_SCORE_THRESHOLDS.GOOD) return JOURNEY_SESSIONS_BY_SCORE.GOOD;
  if (score >= JOURNEY_SCORE_THRESHOLDS.PASSING) return JOURNEY_SESSIONS_BY_SCORE.PASSING;
  return Infinity;
}

export function getScoringStrategyForGameMode(
  gameMode: string | undefined,
): 'brainworkshop' | 'dualnback-classic' | 'balanced' | 'dprime' {
  if (!gameMode) return 'balanced';
  const simulatorSpec = SimulatorSpecs[gameMode];
  if (simulatorSpec) return simulatorSpec.scoringStrategy;
  const lowerMode = gameMode.toLowerCase();
  if (lowerMode.includes('dualnback')) return 'dualnback-classic';
  if (lowerMode.includes('brainworkshop')) return 'brainworkshop';
  return 'balanced';
}

export function isSimulatorMode(gameMode: string | undefined): boolean {
  if (!gameMode) return false;
  return gameMode in SimulatorSpecs;
}

export function isAlternatingJourneyMode(gameMode: string | undefined): boolean {
  return gameMode === DUAL_TRACK_DNB_HYBRID_MODE_ID;
}

export function getAcceptedGameModesForJourney(
  gameMode: string | undefined,
): readonly string[] | null {
  if (!gameMode) return null;
  if (isAlternatingJourneyMode(gameMode)) {
    return [ALTERNATING_JOURNEY_FIRST_MODE, ALTERNATING_JOURNEY_SECOND_MODE];
  }
  return [gameMode];
}

export function usesBinaryProgression(gameMode: string | undefined): boolean {
  if (!gameMode) return false;
  const simulatorSpec = SimulatorSpecs[gameMode];
  return simulatorSpec?.binaryProgression ?? false;
}

export function isNLevelPremium(nLevel: number): boolean {
  return nLevel >= JOURNEY_PREMIUM_N_THRESHOLD;
}

export function getFirstPremiumStage(startLevel: number = 1): number {
  if (startLevel >= JOURNEY_PREMIUM_N_THRESHOLD) return 1;
  const levelsBeforePremium = JOURNEY_PREMIUM_N_THRESHOLD - startLevel;
  return levelsBeforePremium * JOURNEY_MODES_PER_LEVEL + 1;
}

export function getTotalStages(
  targetLevel: number,
  startLevel: number = 1,
  isSimulator: boolean = false,
): number {
  const validTarget = Math.max(1, Math.min(targetLevel, JOURNEY_MAX_LEVEL));
  const validStart = Math.max(1, Math.min(startLevel, validTarget));
  const stagesPerLevel = isSimulator ? 1 : JOURNEY_MODES_PER_LEVEL;
  return (validTarget - validStart + 1) * stagesPerLevel;
}

export const JOURNEY_MODE_TO_GAME_MODE: Record<JourneyModeType, string> = {
  pick: 'dual-pick',
  place: 'dual-place',
  memo: 'dual-memo',
  catch: 'dual-catch',
  simulator: '__INVALID_USE_JOURNEY_GAMEMODE__',
} as const;

export const GAME_MODE_TO_ROUTE: Record<string, string> = {
  'dualnback-classic': '/nback',
  'sim-brainworkshop': '/nback',
  'dual-catch': '/nback',
  custom: '/nback',
  ospan: '/ospan',
  stroop: '/stroop',
} as const;
