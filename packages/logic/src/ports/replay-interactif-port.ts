/**
 * Replay Interactif Port
 *
 * Interface for managing interactive replay runs and events.
 * Implemented by infra layer (SQLiteStore).
 *
 * @see docs/specs/domain-replay-interactif.md
 */

import type { ReplayRun, ReplayEvent, ReplayEventInput } from '../types/replay-interactif';

// =============================================================================
// Port Interface
// =============================================================================

/**
 * Port for managing interactive replay runs.
 *
 * Un "run" représente une tentative de correction d'une session.
 * - Run 0 (depth=0) : session originale (dans events principal)
 * - Run 1-3 : corrections (dans replay_runs/replay_events)
 */
export interface ReplayInteractifPort {
  // ===========================================================================
  // Run Operations
  // ===========================================================================

  /**
   * Créer un nouveau run de replay interactif.
   *
   * @param sessionId - ID de la session originale (Run 0)
   * @param parentRunId - ID du run parent (null = dérivé de Run 0)
   * @returns Le run créé
   * @throws Si la profondeur max (3) est dépassée
   */
  createRun(sessionId: string, parentRunId: string | null): Promise<ReplayRun>;

  /**
   * Récupérer un run par son ID.
   */
  getRun(runId: string): Promise<ReplayRun | null>;

  /**
   * Récupérer tous les runs d'une session (incluant Run 0 virtuel).
   * Ordonnés par depth puis createdAt.
   */
  getRunsForSession(sessionId: string): Promise<ReplayRun[]>;

  /**
   * Marquer un run comme terminé.
   */
  completeRun(runId: string): Promise<void>;

  /**
   * Supprimer un run et tous ses événements.
   * Utilisé pour les runs abandonnés.
   */
  deleteRun(runId: string): Promise<void>;

  /**
   * Vérifier si une session peut accepter un nouveau run.
   * (max 3 niveaux de profondeur)
   */
  canCreateRun(sessionId: string, parentRunId: string | null): Promise<boolean>;

  /**
   * Calculer la profondeur du prochain run.
   * Utilisé pour afficher la profondeur avant la création effective du run.
   */
  getNextDepth(sessionId: string, parentRunId: string | null): Promise<0 | 1 | 2 | 3>;

  /**
   * Récupérer un run en cours pour une session.
   * Utilisé pour la reprise après rafraîchissement.
   *
   * @returns Le run in_progress ou null s'il n'y en a pas
   */
  getInProgressRun(sessionId: string): Promise<ReplayRun | null>;

  // ===========================================================================
  // Event Operations
  // ===========================================================================

  /**
   * Ajouter un événement à un run.
   */
  appendEvent(event: ReplayEventInput): Promise<ReplayEvent>;

  /**
   * Ajouter plusieurs événements en batch.
   */
  appendEventsBatch(events: ReplayEventInput[]): Promise<number>;

  /**
   * Récupérer tous les événements d'un run.
   * Ordonnés par timestamp.
   */
  getEventsForRun(runId: string): Promise<ReplayEvent[]>;

  /**
   * Récupérer les événements non-skipped d'un run.
   * Utile pour le calcul du score.
   */
  getActiveEventsForRun(runId: string): Promise<ReplayEvent[]>;

  // ===========================================================================
  // Cleanup Operations
  // ===========================================================================

  /**
   * Récupérer les runs orphelins (in_progress depuis trop longtemps).
   * Utilisé pour le nettoyage automatique.
   *
   * @param olderThanMs - Seuil en millisecondes (ex: 2h = 7_200_000)
   * @returns Runs in_progress créés avant le seuil
   */
  getOrphanedRuns(olderThanMs: number): Promise<ReplayRun[]>;
}
