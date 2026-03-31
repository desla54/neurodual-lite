/**
 * Journey Specification - Single Source of Truth
 *
 * Configuration du parcours d'entraînement.
 *
 * Seuls les modes simulateur (dualnback-classic, sim-brainworkshop) utilisent
 * la progression journey. Les autres modes sont jouables en standalone uniquement.
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
/** Virtual game mode ID for the hybrid DNB + Track alternating journey. */
export const DUAL_TRACK_DNB_HYBRID_MODE_ID = 'dual-track-dnb-hybrid';

// =============================================================================
// Types
// =============================================================================

/**
 * Types de mode dans le parcours.
 * Seul 'simulator' est utilisé en production (dualnback-classic, sim-brainworkshop).
 * Les autres types sont conservés pour compatibilité avec les pages training existantes.
 */
export type JourneyModeType = 'pick' | 'place' | 'memo' | 'catch' | 'simulator';

// =============================================================================
// Projection & Indicator types (Phase 2 — spec = single source of truth)
// =============================================================================

/** How the journey projector advances stages. */
export type JourneyProjectionKind =
  | 'binary' // 1 session = immediate UP/STAY/DOWN (Jaeggi, BW, Trace)
  | 'continuous-dprime' // d'-based % fill (Dual Catch)
  | 'continuous-score' // score-based % fill (Dual Track)
  | 'alternating'; // hybrid block machine (DNB + Track)

/** Progression indicator configuration derived from the spec. */
export interface IndicatorConfig {
  /** Lookup key into RULESET_REGISTRY (protocol-configs.ts). */
  readonly rulesetId: 'jaeggi' | 'brainworkshop' | 'accuracy' | 'trace-accuracy';
  /** Which explanation builder to use. */
  readonly explanationKind: 'jaeggi' | 'brainworkshop' | 'accuracy';
  /** Message kinds per scope/zone. */
  readonly messageKindMap: {
    readonly free?: Partial<Record<'up' | 'stay' | 'down', string>>;
    readonly journey?: Partial<Record<'up' | 'stay' | 'down', string>>;
    readonly strikes?: Record<number, string>;
    readonly completed?: string;
  };
  /** Optional post-processor ID. */
  readonly postProcessorId?: 'hybrid-jaeggi' | 'dual-track';
}

/**
 * Configuration d'un parcours simulateur.
 */
export interface SimulatorJourneySpec {
  /** ID du game mode */
  readonly gameMode: string;
  /** Route de navigation */
  readonly route:
    | '/nback'
    | '/dual-place'
    | '/dual-memo'
    | '/dual-pick'
    | '/dual-trace'
    | '/dual-track';
  /** Stratégie de scoring */
  readonly scoringStrategy: 'brainworkshop' | 'dualnback-classic' | 'balanced' | 'dprime';
  /**
   * Progression binaire (protocole Jaeggi 2008).
   * Si true: une session = décision immédiate (UP/STAY/DOWN).
   */
  readonly binaryProgression: boolean;
  /** How the journey projector advances stages. */
  readonly projectionKind: JourneyProjectionKind;
  /** Indicator pipeline config. Undefined = no indicator (e.g. dual-catch). */
  readonly indicator?: IndicatorConfig;
}

export const ALTERNATING_JOURNEY_FIRST_MODE = 'dual-track';
export const ALTERNATING_JOURNEY_SECOND_MODE = 'dualnback-classic';
export const HYBRID_TRACK_BLOCK_SIZE_DEFAULT = 1;
export const HYBRID_DNB_BLOCK_SIZE_DEFAULT = 3;

// =============================================================================
// CONSTANTES GÉNÉRALES (re-exported from thresholds.ts for backwards compat)
// =============================================================================

/** @see thresholds.ts (SSOT) */
export const JOURNEY_MAX_LEVEL = _JOURNEY_MAX_LEVEL;
/** @see thresholds.ts (SSOT) */
export const JOURNEY_DEFAULT_TARGET_LEVEL = _JOURNEY_DEFAULT_TARGET_LEVEL;
/** @see thresholds.ts (SSOT) */
export const JOURNEY_DEFAULT_START_LEVEL = _JOURNEY_DEFAULT_START_LEVEL;
/** Seuil de niveau N pour le premium (N >= 4 = premium). @see thresholds.ts (SSOT) */
export const JOURNEY_PREMIUM_N_THRESHOLD = PREMIUM_N_THRESHOLD;
/** Nombre de modes par niveau (hors simulateur). @see thresholds.ts (SSOT) */
export const JOURNEY_MODES_PER_LEVEL = _JOURNEY_MODES_PER_LEVEL;

// =============================================================================
// SIMULATOR SPECS (seuls modes avec progression journey)
// =============================================================================

/**
 * Configurations des parcours simulateur.
 * Ce sont les seuls modes qui utilisent la progression journey.
 */
export const SimulatorSpecs: Record<string, SimulatorJourneySpec> = {
  // Dual Catch: progression continue (non-binaire), pas d'indicateur
  'dual-catch': {
    gameMode: 'dual-catch',
    route: '/nback',
    scoringStrategy: 'dprime',
    binaryProgression: false,
    projectionKind: 'continuous-dprime',
    // No indicator — dual-catch uses d' progression without protocol indicator
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
  'dual-trace': {
    gameMode: 'dual-trace',
    route: '/dual-trace',
    scoringStrategy: 'brainworkshop',
    binaryProgression: true,
    projectionKind: 'binary',
    indicator: {
      rulesetId: 'trace-accuracy',
      explanationKind: 'accuracy',
      messageKindMap: {
        free: { up: 'free-up', stay: 'free-stay', down: 'free-down' },
        journey: { up: 'trace-up', stay: 'trace-stay' },
        completed: 'journey-completed',
      },
    },
  },
  'dual-track': {
    gameMode: 'dual-track',
    route: '/dual-track',
    scoringStrategy: 'balanced',
    binaryProgression: false,
    projectionKind: 'continuous-score',
    indicator: {
      rulesetId: 'accuracy',
      explanationKind: 'accuracy',
      postProcessorId: 'dual-track',
      messageKindMap: {
        free: { up: 'free-up', stay: 'free-stay', down: 'free-down' },
        journey: { up: 'track-up', stay: 'track-stay', down: 'track-down' },
        completed: 'journey-completed',
      },
    },
  },
  [DUAL_TRACK_DNB_HYBRID_MODE_ID]: {
    gameMode: DUAL_TRACK_DNB_HYBRID_MODE_ID,
    route: '/nback',
    scoringStrategy: 'dualnback-classic',
    binaryProgression: true,
    projectionKind: 'alternating',
    indicator: {
      rulesetId: 'jaeggi',
      explanationKind: 'jaeggi',
      messageKindMap: {
        journey: {
          up: 'hybrid-up-decision',
          stay: 'hybrid-stay-decision',
          down: 'hybrid-down-decision',
        },
        completed: 'journey-completed',
      },
      postProcessorId: 'hybrid-jaeggi',
    },
  },
} as const;

// =============================================================================
// SEUILS DE SCORING (re-exported from thresholds.ts)
// =============================================================================

// Re-export for backwards compatibility
export { JOURNEY_MIN_PASSING_SCORE } from './thresholds';

/**
 * Seuils de score pour déterminer le nombre de sessions nécessaires.
 * Valeurs importées de thresholds.ts (SSOT).
 */
export const JOURNEY_SCORE_THRESHOLDS = {
  EXCELLENT: JOURNEY_SCORE_EXCELLENT,
  GOOD: JOURNEY_SCORE_GOOD,
  PASSING: JOURNEY_SCORE_PASSING,
} as const;

/**
 * Mapping score → sessions requises.
 */
export const JOURNEY_SESSIONS_BY_SCORE = {
  EXCELLENT: JOURNEY_SESSIONS_EXCELLENT,
  GOOD: JOURNEY_SESSIONS_GOOD,
  PASSING: JOURNEY_SESSIONS_PASSING,
} as const;

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Retourne le nombre de sessions requises selon le score.
 */
export function getSessionsRequired(score: number): number {
  if (score >= JOURNEY_SCORE_THRESHOLDS.EXCELLENT) return JOURNEY_SESSIONS_BY_SCORE.EXCELLENT;
  if (score >= JOURNEY_SCORE_THRESHOLDS.GOOD) return JOURNEY_SESSIONS_BY_SCORE.GOOD;
  if (score >= JOURNEY_SCORE_THRESHOLDS.PASSING) return JOURNEY_SESSIONS_BY_SCORE.PASSING;
  return Infinity; // Score insuffisant
}

/**
 * Retourne la stratégie de scoring pour un game mode.
 */
export function getScoringStrategyForGameMode(
  gameMode: string | undefined,
): 'brainworkshop' | 'dualnback-classic' | 'balanced' | 'dprime' {
  if (!gameMode) return 'balanced';

  const simulatorSpec = SimulatorSpecs[gameMode];
  if (simulatorSpec) {
    return simulatorSpec.scoringStrategy;
  }

  const lowerMode = gameMode.toLowerCase();
  if (lowerMode.includes('dualnback')) return 'dualnback-classic';
  if (lowerMode.includes('brainworkshop')) return 'brainworkshop';
  return 'balanced';
}

/**
 * Vérifie si un mode de jeu est un mode simulateur.
 */
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

/**
 * Vérifie si un mode de jeu utilise la progression binaire.
 */
export function usesBinaryProgression(gameMode: string | undefined): boolean {
  if (!gameMode) return false;
  const simulatorSpec = SimulatorSpecs[gameMode];
  return simulatorSpec?.binaryProgression ?? false;
}

/**
 * Vérifie si un niveau N nécessite le premium.
 */
export function isNLevelPremium(nLevel: number): boolean {
  return nLevel >= JOURNEY_PREMIUM_N_THRESHOLD;
}

/**
 * Calcule la première étape premium pour un parcours.
 */
export function getFirstPremiumStage(startLevel: number = 1): number {
  if (startLevel >= JOURNEY_PREMIUM_N_THRESHOLD) return 1;
  const levelsBeforePremium = JOURNEY_PREMIUM_N_THRESHOLD - startLevel;
  return levelsBeforePremium * JOURNEY_MODES_PER_LEVEL + 1;
}

/**
 * Calcule le nombre total d'étapes pour un parcours.
 */
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

// =============================================================================
// BACKWARDS COMPATIBILITY EXPORTS (used by training pages)
// =============================================================================

/**
 * Mapping mode → game mode.
 * LEGACY: conservé pour les pages training qui l'utilisent en fallback
 * quand stageDef.mode !== 'simulator'. Ce chemin est mort en production
 * (seuls les simulateurs ont des journeys actifs).
 */
export const JOURNEY_MODE_TO_GAME_MODE: Record<JourneyModeType, string> = {
  pick: 'dual-pick',
  place: 'dual-place',
  memo: 'dual-memo',
  catch: 'dual-catch',
  simulator: '__INVALID_USE_JOURNEY_GAMEMODE__',
} as const;

/**
 * Mapping game mode → route.
 */
export const GAME_MODE_TO_ROUTE: Record<
  string,
  | '/nback'
  | '/dual-place'
  | '/dual-memo'
  | '/dual-pick'
  | '/dual-trace'
  | '/dual-track'
  | '/dual-time'
  | '/corsi-block'
  | '/ospan'
  | '/running-span'
  | '/pasat'
  | '/swm'
> = {
  'dualnback-classic': '/nback',
  'sim-brainworkshop': '/nback',
  'dual-catch': '/nback',
  'dual-place': '/dual-place',
  'dual-pick': '/dual-pick',
  'dual-memo': '/dual-memo',
  'dual-trace': '/dual-trace',
  'dual-track': '/dual-track',
  'dual-time': '/dual-time',
  'corsi-block': '/corsi-block',
  ospan: '/ospan',
  'running-span': '/running-span',
  pasat: '/pasat',
  swm: '/swm',
  custom: '/nback',
} as const;
