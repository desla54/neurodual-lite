/**
 * State Types - État du moteur de génération
 *
 * Structures de données pour tracker l'état pendant la génération.
 */

import type { LureType, ModalityId } from './spec';

// =============================================================================
// Trial (ce que le moteur génère)
// =============================================================================

/**
 * Intention pour une modalité dans un trial.
 */
export type TrialIntention = 'target' | 'lure-n-1' | 'lure-n+1' | 'neutral';

/**
 * Valeur générée pour une modalité.
 */
export interface ModalityValue {
  readonly modalityId: ModalityId;
  readonly value: number | string;
  readonly intention: TrialIntention;
}

/**
 * Trial généré par le moteur.
 */
export interface GeneratedTrial {
  readonly index: number;
  readonly values: Record<ModalityId, ModalityValue>;
}

// =============================================================================
// Budget Tracking
// =============================================================================

/**
 * Compteur de leurres par type.
 */
export type LureCount = Partial<Record<LureType, number>>;

/**
 * État du budget utilisé.
 */
export interface BudgetUsed {
  /** Nombre de trials générés dans le bloc courant */
  readonly trialsGenerated: number;
  /** Nombre de cibles générées par modalité */
  readonly targetsUsed: Record<ModalityId, number>;
  /** Nombre de leurres générés par modalité et type */
  readonly luresUsed: Record<ModalityId, LureCount>;
}

/**
 * Crée un BudgetUsed vide.
 */
export function createEmptyBudgetUsed(modalityIds: readonly ModalityId[]): BudgetUsed {
  const targetsUsed: Record<ModalityId, number> = {};
  const luresUsed: Record<ModalityId, LureCount> = {};

  for (const id of modalityIds) {
    targetsUsed[id] = 0;
    luresUsed[id] = {};
  }

  return {
    trialsGenerated: 0,
    targetsUsed,
    luresUsed,
  };
}

// =============================================================================
// Random State (pour reproductibilité)
// =============================================================================

/**
 * État du générateur aléatoire.
 * Permet de sauvegarder/restaurer pour reproductibilité.
 */
export interface RandomState {
  readonly seed: string;
  readonly callCount: number;
}

// =============================================================================
// Engine State
// =============================================================================

/**
 * État complet du moteur de génération.
 */
export interface EngineState {
  /** Historique des N derniers trials (pour N-back) */
  readonly history: readonly GeneratedTrial[];
  /** Budget utilisé dans le bloc courant */
  readonly budgetUsed: BudgetUsed;
  /** État du générateur aléatoire */
  readonly rng: RandomState;
  /** Index du prochain trial à générer */
  readonly nextIndex: number;
  /** Cache de la décomposition de Cholesky (pour corrélations, évite recalcul O(N³)) */
  readonly choleskyCache?: readonly (readonly number[])[];
}

// =============================================================================
// Generation Result
// =============================================================================

/**
 * Métadonnées de génération (pour debug/analyse).
 */
export interface GenerationMetadata {
  /** Probabilités effectives utilisées pour ce trial */
  readonly effectiveProbabilities: Record<ModalityId, number>;
  /** Contraintes qui ont influencé la génération */
  readonly constraintsApplied: readonly string[];
  /** Nombre de tentatives (>1 si backtracking) */
  readonly attempts: number;
  /** Temps de génération en ms */
  readonly generationTimeMs: number;
}

/**
 * Résultat d'une génération.
 */
export interface GenerationResult {
  readonly trial: GeneratedTrial;
  readonly newState: EngineState;
  readonly metadata: GenerationMetadata;
}
