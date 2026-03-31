/**
 * TrialGenerator - Interface pour les stratégies de génération
 *
 * Polymorphisme pour remplacer les if/else isAdaptiveMode dans Coach.
 *
 * Implémentations:
 * - PreGeneratedTrialGenerator: trials générés à l'avance (BrainWorkshop, Jaeggi, Libre)
 * - SequenceTrialGenerator: trials générés trial-par-trial (Dual Tempo/Memo/Flow)
 */

import type { GameParams, PerformanceContext, TrialFeedback } from '../types/adaptive';
import type { Trial } from '../domain';

/**
 * Interface commune pour la génération de trials.
 * Permet au Coach d'utiliser le même code quel que soit le mode de génération.
 */
export interface TrialGenerator {
  /**
   * Génère le prochain trial.
   *
   * @param feedback - Résultat du trial précédent (pour le mode adaptatif)
   * @returns Le prochain trial à présenter
   */
  generateNext(feedback?: TrialFeedback): Trial;

  /**
   * Vérifie s'il reste des trials à générer.
   */
  hasMore(): boolean;

  /**
   * Retourne le nombre total de trials (buffers + scorables).
   */
  getTotalTrials(): number;

  /**
   * Retourne l'index du prochain trial à générer.
   */
  getNextIndex(): number;

  /**
   * Retourne tous les trials générés jusqu'ici.
   */
  getGeneratedTrials(): Trial[];

  // ==========================================================================
  // Méthodes pour le mode adaptatif (retournent null si non applicable)
  // ==========================================================================

  /**
   * Paramètres de jeu actuels (mode adaptatif uniquement)
   */
  getGameParameters(): GameParams | null;

  /**
   * Niveau de difficulté global 0-100 (mode adaptatif uniquement)
   */
  getDifficulty(): number | null;

  /**
   * Probabilité de leurre actuelle (mode adaptatif uniquement)
   */
  getLureProbability(): number | null;

  /**
   * Probabilité de cible actuelle (mode adaptatif uniquement)
   */
  getTargetProbability(): number | null;

  /**
   * ISI actuel en secondes (mode adaptatif uniquement)
   */
  getISI(): number | null;

  /**
   * Contexte de performance (mode adaptatif uniquement)
   */
  getPerformanceContext(): PerformanceContext | null;

  /**
   * Numéro de zone actuel 1-20 (mode adaptatif uniquement)
   */
  getZoneNumber(): number | null;

  /**
   * Traite un feedback sans générer de trial.
   * Utile pour envoyer plusieurs feedbacks d'un coup (ex: Place mode).
   */
  processFeedback(feedback: TrialFeedback): void;

  /**
   * Vérifie si le générateur est en mode adaptatif
   */
  isAdaptive(): boolean;

  /**
   * Avance le générateur à un index donné (pour la reprise de session).
   * Pour les générateurs pré-générés : avance simplement l'index.
   * Pour les générateurs adaptatifs : peut rejouer les feedbacks si fournis.
   *
   * @param index - L'index à atteindre
   * @param history - Les trials déjà générés (optionnel, pour vérification)
   * @param feedbacks - Les feedbacks des trials passés (pour les adaptatifs)
   */
  skipTo(index: number, history?: readonly Trial[], feedbacks?: readonly TrialFeedback[]): void;
}
