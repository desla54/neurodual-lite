/**
 * Adaptive Types
 *
 * Types pour les systèmes adaptatifs.
 * RÈGLE: Zéro import interne sauf depuis types/
 */

import type { ModalityId } from './core';

// =============================================================================
// Trial Feedback
// =============================================================================

/**
 * Feedback par modalité pour le système adaptatif.
 */
export interface ModalityFeedback {
  /** Est-ce que cette modalité était une cible ? */
  readonly wasTarget: boolean;
  /** Est-ce que la réponse pour cette modalité était correcte ? */
  readonly isCorrect: boolean;
  /** Temps de réaction en ms (optionnel) */
  readonly reactionTime?: number;
}

/**
 * Feedback après un trial pour le système adaptatif.
 */
export interface TrialFeedback {
  /** Est-ce que ce trial était une cible (any modality) ? */
  readonly isTarget: boolean;
  /** Est-ce que la réponse était globalement correcte ? */
  readonly isCorrect: boolean;
  /** Temps de réaction en ms (optionnel) */
  readonly reactionTime?: number;
  /** Feedback par modalité (pour adaptation fine) */
  readonly byModality?: Partial<Record<ModalityId, ModalityFeedback>>;
}

// =============================================================================
// Game Parameters (output de l'engine)
// =============================================================================

/**
 * Paramètres physiques du jeu calculés par l'engine adaptatif.
 */
export interface GameParams {
  /** Inter-Stimulus Interval en secondes */
  readonly isi: number;
  /** Durée d'affichage du stimulus en secondes */
  readonly stimulusDuration: number;
  /** Probabilité de leurre (0-1) */
  readonly pLure: number;
  /** Probabilité de cible (0-1) */
  readonly pTarget: number;
  /** Indice de difficulté globale (0-100) */
  readonly difficulty: number;
}

// =============================================================================
// Performance Context
// =============================================================================

/**
 * Contexte de performance du joueur.
 * Alimenté par le PerformanceMonitor.
 */
export interface PerformanceContext {
  /** d' actuel (sensibilité) */
  readonly dPrime: number;
  /** Taux de hits (0-1) */
  readonly hitRate: number;
  /** Taux de fausses alarmes (0-1) */
  readonly faRate: number;
  /** Nombre d'erreurs consécutives */
  readonly errorStreak: number;
  /** Nombre de succès consécutifs */
  readonly successStreak: number;
  /** Nombre total de trials joués */
  readonly trialCount: number;
  /** Temps de réaction moyen (ms), null si pas assez de données */
  readonly avgReactionTime: number | null;
}
