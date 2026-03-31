/**
 * Constraint Types - Interfaces pour les contraintes
 *
 * Les contraintes sont des objets qui savent :
 * - Se vérifier (isSatisfied)
 * - Influencer la génération (getForbiddenValues, adjustProbability)
 */

import type { ModalityId } from './spec';
import type { GeneratedTrial, TrialIntention } from './state';

// =============================================================================
// Constraint Interface
// =============================================================================

/**
 * Interface de base pour toutes les contraintes.
 */
export interface Constraint {
  /** Identifiant unique de la contrainte */
  readonly id: string;

  /** Type : hard (jamais violée) ou soft (préférence) */
  readonly type: 'hard' | 'soft';

  /**
   * Vérifie si ajouter ce candidat violerait la contrainte.
   *
   * @param history - Historique des trials générés
   * @param candidate - Trial candidat à vérifier
   * @returns true si la contrainte est satisfaite
   */
  isSatisfied(history: readonly GeneratedTrial[], candidate: GeneratedTrial): boolean;

  /**
   * Retourne les intentions interdites pour une modalité.
   * Utilisé par le moteur pour filtrer AVANT de tirer.
   *
   * @param history - Historique des trials générés
   * @param modalityId - Modalité concernée
   * @returns Set d'intentions interdites
   */
  getForbiddenIntentions(
    history: readonly GeneratedTrial[],
    modalityId: ModalityId,
  ): Set<TrialIntention>;

  /**
   * Retourne les valeurs interdites pour une modalité et intention.
   * Utilisé pour filtrer les valeurs possibles.
   *
   * @param history - Historique des trials générés
   * @param modalityId - Modalité concernée
   * @param intention - Intention choisie
   * @returns Set de valeurs interdites
   */
  getForbiddenValues(
    history: readonly GeneratedTrial[],
    modalityId: ModalityId,
    intention: TrialIntention,
  ): Set<number | string>;
}

/**
 * Contrainte avec poids (pour soft constraints).
 */
export interface WeightedConstraint extends Constraint {
  /** Poids de la contrainte (0-1), influence l'importance relative */
  readonly weight: number;

  /**
   * Calcule un score de satisfaction (0-1).
   * 1 = parfaitement satisfait, 0 = complètement violé.
   *
   * @param history - Historique des trials générés
   * @param candidate - Trial candidat
   * @returns Score entre 0 et 1
   */
  getSatisfactionScore(history: readonly GeneratedTrial[], candidate: GeneratedTrial): number;
}

// =============================================================================
// Constraint Factory
// =============================================================================

/**
 * Paramètres pour MaxConsecutive.
 */
export interface MaxConsecutiveParams {
  /** Modalité concernée (ou '*' pour toutes) */
  readonly modalityId: ModalityId | '*';
  /** Intention concernée */
  readonly intention: TrialIntention;
  /** Nombre maximum consécutif autorisé */
  readonly max: number;
}

/**
 * Paramètres pour MinGap.
 */
export interface MinGapParams {
  /** Modalité concernée */
  readonly modalityId: ModalityId;
  /** Intention concernée */
  readonly intention: TrialIntention;
  /** Nombre minimum de trials entre deux occurrences */
  readonly minTrials: number;
}

/**
 * Paramètres pour NoImmediateRepeat.
 */
export interface NoImmediateRepeatParams {
  /** Modalité concernée */
  readonly modalityId: ModalityId;
}

/**
 * Types de contraintes disponibles.
 */
export type ConstraintType =
  | 'max-consecutive'
  | 'min-gap'
  | 'no-immediate-repeat'
  | 'exact-budget'
  | 'prefer-variety'
  | 'avoid-patterns';

/**
 * Map des types de paramètres par type de contrainte.
 */
export interface ConstraintParamsMap {
  'max-consecutive': MaxConsecutiveParams;
  'min-gap': MinGapParams;
  'no-immediate-repeat': NoImmediateRepeatParams;
  'exact-budget': Record<string, never>; // Pas de params, utilise le budget de la spec
  'prefer-variety': { modalityId: ModalityId };
  'avoid-patterns': { modalityId: ModalityId; patterns: readonly string[] };
}

// =============================================================================
// Constraint Registry
// =============================================================================
