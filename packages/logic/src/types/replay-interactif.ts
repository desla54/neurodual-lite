/**
 * Types for Interactive Replay (Correction Mode)
 *
 * Le replay interactif permet de rejouer une partie en corrigeant ses erreurs.
 * Chaque "run" est une tentative de correction dérivée d'un parent.
 *
 * @see docs/specs/domain-replay-interactif.md
 */

// =============================================================================
// Run Types
// =============================================================================

/**
 * Représente un run de replay interactif.
 *
 * - Run 0 (depth=0) : Partie originale, stockée dans events principal
 * - Run 1-3 : Corrections dérivées, stockées dans replay_runs/replay_events
 */
export interface ReplayRun {
  readonly id: string;
  readonly sessionId: string;
  readonly parentRunId: string | null; // null = dérivé de Run 0 (session originale)
  readonly depth: 0 | 1 | 2 | 3;
  readonly status: ReplayRunStatus;
  readonly createdAt: number; // timestamp ms
}

export type ReplayRunStatus = 'in_progress' | 'completed';

// =============================================================================
// Event Types
// =============================================================================

/**
 * Événement dans un run de replay interactif.
 */
export interface ReplayEvent {
  readonly id: string;
  readonly runId: string;
  readonly type: string;
  readonly timestamp: number; // tMs relatif au début du run
  readonly payload: Record<string, unknown>;
  readonly actor: ReplayEventActor;
  readonly originEventId: string | null; // lien vers event parent si auto
  readonly skipped: boolean;
  readonly skipReason: SkipReason | null;
}

/**
 * Qui a émis l'événement.
 * - auto: rejoué depuis le parent
 * - user: action de l'utilisateur pendant le replay
 */
export type ReplayEventActor = 'auto' | 'user';

/**
 * Raison pour laquelle un événement auto a été skippé.
 * - false_alarm: réponse incorrecte du parent (faux positif) - Tempo
 * - error: drop/pick incorrect - Flow, Recall, DualPick
 * - state_invalid: action non applicable dans l'état courant
 */
export type SkipReason = 'false_alarm' | 'error' | 'state_invalid';

// =============================================================================
// Skippable Events
// =============================================================================

/**
 * Types d'événements qui peuvent être skippés (réponses utilisateur).
 * Les événements de structure (SESSION_STARTED, TRIAL_PRESENTED, etc.) ne sont jamais skippés.
 */
export type SkippableEventType =
  | 'USER_RESPONDED' // Tempo
  | 'FLOW_CARD_DROPPED' // Flow
  | 'RECALL_PICK'; // Recall

/**
 * Types d'événements de structure (jamais skippés).
 */
export type StructureEventType =
  | 'SESSION_STARTED'
  | 'SESSION_ENDED'
  | 'TRIAL_PRESENTED'
  | 'FLOW_SESSION_STARTED'
  | 'FLOW_SESSION_ENDED'
  | 'FLOW_STIMULUS_SHOWN'
  | 'FLOW_PLACEMENT_STARTED'
  | 'FLOW_TURN_COMPLETED'
  | 'RECALL_SESSION_STARTED'
  | 'RECALL_SESSION_ENDED'
  | 'RECALL_STIMULUS_SHOWN'
  | 'RECALL_STIMULUS_HIDDEN'
  | 'RECALL_WINDOW_OPENED'
  | 'RECALL_WINDOW_COMMITTED';

// =============================================================================
// Score Types
// =============================================================================

/**
 * Score d'un run avec delta par rapport au parent.
 */
export interface RunScore {
  readonly dPrime: number;
  readonly hits: number;
  readonly misses: number;
  readonly falseAlarms: number;
  readonly correctRejections: number;

  // Delta vs parent
  readonly deltaVsParent: {
    readonly dPrime: number;
    readonly hits: number;
    readonly misses: number;
    readonly falseAlarms: number;
  } | null;

  // Delta vs Run 0 (session originale)
  readonly deltaVsOriginal: {
    readonly dPrime: number;
    readonly hits: number;
    readonly misses: number;
    readonly falseAlarms: number;
  } | null;
}

// =============================================================================
// Input Types (for adapter)
// =============================================================================

export type ReplayRunInput = Omit<ReplayRun, 'id'>;
export type ReplayEventInput = Omit<ReplayEvent, 'id'>;
