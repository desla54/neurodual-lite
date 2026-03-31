/**
 * Journey Types - Parcours d'Entraînement
 *
 * Types et interfaces pour le parcours.
 * Les constantes et types de base sont dans specs/journey.spec.ts (Single Source of Truth).
 */

// Import type locally for use in this file
import type { JourneyModeType as _JourneyModeType } from '../specs/journey.spec';

// Re-export des constantes et types depuis la spec (Single Source of Truth)
export {
  JOURNEY_MAX_LEVEL,
  JOURNEY_DEFAULT_TARGET_LEVEL,
  JOURNEY_DEFAULT_START_LEVEL,
  JOURNEY_MODES_PER_LEVEL,
  JOURNEY_MODE_TO_GAME_MODE,
  type JourneyModeType,
} from '../specs/journey.spec';

// Use the imported type for local declarations
type JourneyModeType = _JourneyModeType;

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

// =============================================================================
// Configuration Journey (passée à toutes les méthodes du port)
// =============================================================================

/**
 * Configuration minimale pour identifier un journey.
 * Utilisée par JourneyPort et JourneyProvider.
 */
export interface JourneyConfig {
  /** ID unique du journey (discriminant pour multi-journey) */
  journeyId: string;
  /** Niveau N de départ (1-10) */
  startLevel: number;
  /** Niveau N cible (objectif du parcours) */
  targetLevel: number;
  /**
   * Mode de jeu optionnel (pour parcours simulateur).
   * Ex: 'dualnback-classic', 'sim-brainworkshop'
   */
  gameMode?: string;
  /** Dedicated journey strategy settings (preferred over legacy mode-level storage). */
  strategyConfig?: JourneyStrategyConfig;
  /** Hybrid journey: number of Dual Track sessions in each loop block. */
  hybridTrackSessionsPerBlock?: number;
  /** Hybrid journey: number of Dual N-Back sessions in each loop block. */
  hybridDnbSessionsPerBlock?: number;
}

/**
 * Métadonnées Journey attachées à une session.
 * Utilisées par le pipeline pour reconstruire un JourneyContext stable.
 */
export interface JourneyMeta extends JourneyConfig {
  /** Nom affiché du parcours */
  journeyName?: string;
}

// JourneyModeType is re-exported from specs/journey.spec.ts above

// =============================================================================
// Définition des étapes
// =============================================================================

/**
 * Définition statique d'une étape du parcours
 */
export interface JourneyStageDefinition {
  /** ID unique de l'étape (1-30) */
  readonly stageId: number;
  /** Niveau N (1-10) */
  readonly nLevel: number;
  /** Type de mode */
  readonly mode: JourneyModeType;
}

/**
 * High-level journey protocol used to interpret a session inside a journey report.
 */
export type JourneyProtocol =
  | 'standard'
  | 'jaeggi'
  | 'brainworkshop'
  | 'dual-track-mastery'
  | 'hybrid-jaeggi';

/**
 * Role of the current session inside the journey protocol.
 */
export type JourneySessionRole = 'single-session' | 'track-half' | 'decision-half';

/**
 * Authoritative journey decision exposed to the report layer.
 */
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

// =============================================================================
// État de progression
// =============================================================================

/**
 * Statut d'une étape
 */
export type JourneyStageStatus = 'locked' | 'unlocked' | 'completed';

/**
 * Progression d'une étape individuelle
 */
export interface JourneyStageProgress {
  /** ID de l'étape (1-30) */
  stageId: number;
  /** Statut actuel */
  status: JourneyStageStatus;
  /** Nombre de sessions validantes (score >= 80%) */
  validatingSessions: number;
  /** Meilleur score obtenu (0-100) */
  bestScore: number | null;
  /**
   * Optional progressive fill (0-100).
   * Used by continuous progression journeys (e.g. Dual Catch).
   */
  progressPct?: number;
  /**
   * Exact hybrid loop state for alternating journeys.
   * Filled only for the current unlocked stage of `dual-track-dnb-hybrid`.
   */
  hybridProgress?: HybridJourneyStageProgress;
}

// Note: JOURNEY_DEFAULT_TARGET_LEVEL et JOURNEY_MAX_LEVEL
// sont exportés depuis specs/journey.spec.ts ci-dessus

/**
 * État complet du parcours pour un utilisateur
 */
export interface JourneyState {
  /** Étape courante (1-based, ou totalStages+1 si parcours terminé) */
  currentStage: number;
  /** Progression de chaque étape */
  stages: JourneyStageProgress[];
  /** Le parcours est-il actif? */
  isActive: boolean;
  /** Niveau N de départ (défaut: 1) */
  startLevel: number;
  /** Niveau N cible (objectif du parcours, défaut: 5) */
  targetLevel: number;
  /**
   * Parcours simulateur (1 stage par niveau vs 4 stages par niveau).
   * Les parcours simulateurs utilisent un seul game mode (ex: dualnback-classic, sim-brainworkshop).
   */
  isSimulator?: boolean;
  /**
   * Nombre de strikes (0-2) au niveau actuel.
   * Seulement pour BrainWorkshop binaire.
   * 3 strikes = DOWN (régression au niveau précédent).
   * Note BW: les strikes ne sont PAS reset sur STAY (score 50-79%).
   */
  consecutiveStrikes?: number;
  /**
   * Nouveau startLevel suggéré si le joueur a régressé en dessous du startLevel initial.
   * Seulement pour BrainWorkshop binaire.
   * Si défini et < startLevel, l'adapter doit mettre à jour le parcours sauvegardé.
   */
  suggestedStartLevel?: number;
  /** Total accepted sessions counted by the journey projector. */
  acceptedSessionCount?: number;
  /** Actual game mode to launch for the next journey session, when the journey alternates modes. */
  nextSessionGameMode?: string;
  /**
   * Authoritative "what to play next" derived by the workflow.
   * Persisted in the projection so consumers read it directly instead of re-deriving.
   */
  nextSession?: {
    readonly stageId: number;
    readonly nLevel: number;
    readonly gameMode: string;
    readonly route: string;
  };
}
