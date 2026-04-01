/**
 * Journey Types - Stub for backward compatibility
 */

import {
  JOURNEY_MAX_LEVEL as _JOURNEY_MAX_LEVEL,
  JOURNEY_DEFAULT_TARGET_LEVEL as _JOURNEY_DEFAULT_TARGET_LEVEL,
  JOURNEY_DEFAULT_START_LEVEL as _JOURNEY_DEFAULT_START_LEVEL,
  JOURNEY_MODES_PER_LEVEL as _JOURNEY_MODES_PER_LEVEL,
} from '../specs/thresholds';

export const JOURNEY_MAX_LEVEL = _JOURNEY_MAX_LEVEL;
export const JOURNEY_DEFAULT_TARGET_LEVEL = _JOURNEY_DEFAULT_TARGET_LEVEL;
export const JOURNEY_DEFAULT_START_LEVEL = _JOURNEY_DEFAULT_START_LEVEL;
export const JOURNEY_MODES_PER_LEVEL = _JOURNEY_MODES_PER_LEVEL;

export type JourneyModeType = 'pick' | 'place' | 'memo' | 'catch' | 'simulator';

export const JOURNEY_MODE_TO_GAME_MODE: Record<JourneyModeType, string> = {
  pick: 'dual-pick',
  place: 'dual-place',
  memo: 'dual-memo',
  catch: 'dual-catch',
  simulator: '__INVALID_USE_JOURNEY_GAMEMODE__',
} as const;

export interface HybridJourneyStrategyConfig {
  readonly trackSessionsPerBlock: number;
  readonly dnbSessionsPerBlock: number;
}

export type DualTrackJourneyPreset = 'easy' | 'medium' | 'hard';

export interface DualTrackJourneyStrategyConfig {
  readonly preset: DualTrackJourneyPreset;
}

export interface JourneyStrategyConfig {
  readonly hybrid?: Partial<HybridJourneyStrategyConfig>;
  readonly dualTrack?: Partial<DualTrackJourneyStrategyConfig>;
}

export interface JourneyConfig {
  journeyId: string;
  startLevel: number;
  targetLevel: number;
  gameMode?: string;
  strategyConfig?: JourneyStrategyConfig;
  hybridTrackSessionsPerBlock?: number;
  hybridDnbSessionsPerBlock?: number;
}

export interface JourneyMeta extends JourneyConfig {
  journeyName?: string;
}

export interface JourneyStageDefinition {
  readonly stageId: number;
  readonly nLevel: number;
  readonly mode: JourneyModeType;
  /** For multi-mode stages (e.g. NeuroDual mix): game modes that count toward this stage. */
  readonly gameModes?: readonly string[];
}

export type JourneyProtocol =
  | 'standard'
  | 'jaeggi'
  | 'brainworkshop'
  | 'dual-track-mastery'
  | 'hybrid-jaeggi';

export type JourneySessionRole = 'single-session' | 'track-half' | 'decision-half';

export type JourneyDecision = 'up' | 'stay' | 'down' | 'pending-pair';

export type HybridJourneyDecisionZone = 'clean' | 'stay' | 'down';

export interface HybridJourneyStageProgress {
  readonly loopPhase: 'track' | 'dnb';
  readonly trackSessionsCompleted: number;
  readonly trackSessionsRequired: number;
  readonly dnbSessionsCompleted: number;
  readonly dnbSessionsRequired: number;
  readonly decisionZone?: HybridJourneyDecisionZone;
  readonly decisionStreakCount?: number;
  readonly decisionStreakRequired?: number;
}

export type JourneyStageStatus = 'locked' | 'unlocked' | 'completed';

export interface JourneyStageProgress {
  stageId: number;
  status: JourneyStageStatus;
  validatingSessions: number;
  bestScore: number | null;
  progressPct?: number;
  hybridProgress?: HybridJourneyStageProgress;
}

export interface JourneyState {
  currentStage: number;
  stages: JourneyStageProgress[];
  isActive: boolean;
  startLevel: number;
  targetLevel: number;
  isSimulator?: boolean;
  consecutiveStrikes?: number;
  suggestedStartLevel?: number;
  acceptedSessionCount?: number;
  nextSessionGameMode?: string;
  nextSession?: {
    readonly stageId: number;
    readonly nLevel: number;
    readonly gameMode: string;
    readonly route: string;
  };
}

/** Game modes accepted for the NeuroDual mix journey. */
export const NEURODUAL_MIX_GAME_MODES = ['dualnback-classic', 'stroop-flex'] as const;

/**
 * Generate journey stages for a given target level.
 * In NeuroDual Lite, journeys are always simulator (1 stage per level).
 * For 'neurodual-mix', each stage covers both DNB Classic and Stroop Flex.
 */
export function generateJourneyStages(
  targetLevel: number,
  startLevel: number = JOURNEY_DEFAULT_START_LEVEL,
  isSimulator: boolean = true,
  gameMode?: string,
): JourneyStageDefinition[] {
  const validTarget = Math.max(1, Math.min(targetLevel, JOURNEY_MAX_LEVEL));
  const validStart = Math.max(1, Math.min(startLevel, validTarget));
  const stages: JourneyStageDefinition[] = [];
  let stageId = 1;

  if (gameMode === 'neurodual-mix') {
    for (let nLevel = validStart; nLevel <= validTarget; nLevel++) {
      stages.push({
        stageId,
        nLevel,
        mode: 'simulator',
        gameModes: NEURODUAL_MIX_GAME_MODES,
      });
      stageId++;
    }
    return stages;
  }

  const modes: JourneyModeType[] = isSimulator ? ['simulator'] : ['catch'];
  for (let nLevel = validStart; nLevel <= validTarget; nLevel++) {
    for (const mode of modes) {
      stages.push({ stageId, nLevel, mode });
      stageId++;
    }
  }
  return stages;
}
