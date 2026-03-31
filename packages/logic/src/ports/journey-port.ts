/**
 * JourneyPort
 *
 * Interface for training journey (parcours d'entraînement) access.
 * The journey state is a projection computed from session history (SQLite).
 * Implemented by infra (journeyAdapter), consumed by ui via JourneyProvider.
 *
 * Reactivity is handled by PowerSync watched queries in the UI layer.
 * This port only exposes imperative methods (mutations + synchronous lookups).
 *
 * IMPORTANT: All methods take JourneyConfig as first parameter for multi-journey isolation.
 */

import type { SessionSummary } from '../engine/events';
import type {
  HybridJourneyStageProgress,
  JourneyConfig,
  JourneyDecision,
  JourneyProtocol,
  JourneySessionRole,
  JourneyStageDefinition,
  JourneyState,
} from '../types/journey';
import type { JourneyScoringStrategy, PrecomputedScoreSession } from '../domain/journey/scoring';

/**
 * Type union pour les sessions pouvant être enregistrées dans un journey.
 * - SessionSummary: N-Back sessions avec stats SDT
 * - PrecomputedScoreSession: Flow, DualPick, etc. avec score pré-calculé
 */
export type JourneyRecordableSession = SessionSummary | PrecomputedScoreSession;

// =============================================================================
// Types
// =============================================================================

/**
 * Résultat de l'enregistrement d'une tentative
 */
export interface AttemptResult {
  /** La tentative était-elle validante? */
  isValidating: boolean;
  /** Score calculé (0-100) */
  score: number;
  /** Stratégie de scoring utilisée */
  strategy: JourneyScoringStrategy;
  /** Nombre de sessions validantes accumulées pour cette étape */
  totalValidatingSessions: number;
  /** Nombre de sessions encore nécessaires */
  sessionsRemaining: number;
  /**
   * Optional progressive fill (0-100).
   * Used by continuous progression journeys (e.g. Dual Catch).
   */
  progressPct?: number;
  /** L'étape a-t-elle été complétée avec cette tentative? */
  stageCompleted: boolean;
  /** Si complétée, l'étape suivante débloquée */
  nextStageUnlocked: number | null;
  /**
   * Stage à jouer ensuite selon la décision parcours projetée.
   * - Peut être inférieur au stage courant en cas de régression.
   * - Null si le parcours est terminé.
   */
  nextPlayableStage: number | null;
  /** Concrete game mode to launch for the next session in alternating journeys. */
  nextSessionGameMode?: string;
  /**
   * Consecutive strikes at current level (0-2).
   * Only for BrainWorkshop binary progression.
   * 3 strikes = DOWN.
   */
  consecutiveStrikes?: number;

  /**
   * Suggested new startLevel when the player regressed below the configured startLevel.
   * Used to dynamically expand journeys downward (mainly simulator journeys).
   */
  suggestedStartLevel?: number;
  /** Optional protocol descriptor for report guidance cards. */
  journeyProtocol?: JourneyProtocol;
  /** Role of the current session inside the journey protocol. */
  sessionRole?: JourneySessionRole;
  /** Authoritative journey decision for the current report. */
  journeyDecision?: JourneyDecision;
  /** Optional short display name for compact report cards. */
  journeyNameShort?: string;
  /** Optional best score retained for the current stage projection. */
  bestScore?: number | null;
  /** Exact hybrid loop state for alternating journeys. */
  hybridProgress?: HybridJourneyStageProgress;
}

// =============================================================================
// Port
// =============================================================================

export interface JourneyPort {
  /**
   * Get the journey state for a specific journey.
   *
   * @param config - Journey configuration (includes journeyId for filtering)
   * @returns Journey state with stage progression
   */
  getJourneyState(config: JourneyConfig): Promise<JourneyState>;

  /**
   * Record an attempt on a stage.
   *
   * Uses the scoring strategy appropriate for the journey's game mode:
   * - dualnback-classic → 'jaeggi' (error-based)
   * - sim-brainworkshop → 'brainworkshop' (penalty score)
   * - other → 'balanced' (balanced accuracy)
   *
   * For sessions with pre-computed scores (Flow, DualPick), the score is used directly.
   * For N-Back sessions (SessionSummary), the score is computed using the appropriate strategy.
   *
   * @param config - Journey configuration
   * @param stageId - Stage number (1-based)
   * @param session - Session summary (N-Back) or pre-computed score session (Flow, DualPick)
   * @returns Result of the attempt
   */
  recordAttempt(
    config: JourneyConfig,
    stageId: number,
    session: JourneyRecordableSession,
  ): Promise<AttemptResult>;

  /**
   * Get the definition of a stage.
   *
   * @param stageId - Stage number (1-based)
   * @param config - Journey configuration (for stage generation params)
   * @returns Stage definition or undefined if not found
   */
  getStageDefinition(stageId: number, config: JourneyConfig): JourneyStageDefinition | undefined;

  /**
   * Get the definition of the current stage.
   *
   * @param config - Journey configuration
   * @returns Current stage definition or null if journey complete
   */
  getCurrentStageDefinition(config: JourneyConfig): Promise<JourneyStageDefinition | null>;
}
