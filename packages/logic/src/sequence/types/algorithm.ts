/**
 * Algorithm Types - Interface pour les algorithmes adaptatifs
 *
 * L'algorithme est le CERVEAU qui décide de la spec à utiliser.
 * Le moteur est le MUSCLE qui exécute.
 */

import type { SequenceSpec } from './spec';
import type { GeneratedTrial } from './state';

// =============================================================================
// Session Config
// =============================================================================

/**
 * Configuration de session passée à l'algorithme.
 */
export interface SessionConfig {
  /** Niveau N-back initial */
  readonly nLevel: number;
  /** IDs des modalités actives */
  readonly modalityIds: readonly string[];
  /** Nombre de trials prévu (optionnel) */
  readonly totalTrials?: number;
  /** Configuration spécifique au mode de jeu */
  readonly gameMode: 'tempo' | 'memo' | 'flow';
  /** ID utilisateur (pour personnalisation) */
  readonly userId?: string;
}

// =============================================================================
// Algorithm Context
// =============================================================================

/**
 * Contexte fourni à l'algorithme pour décider de la spec.
 */
export interface AlgorithmContext {
  /** Index du prochain trial à générer */
  readonly trialIndex: number;
  /** Historique des trials générés */
  readonly history: readonly GeneratedTrial[];
  /** Résultats des trials précédents (si disponibles) */
  readonly results?: readonly TrialResult[];
  /** Métriques de performance calculées */
  readonly performance?: PerformanceMetrics;
}

/**
 * Résultat d'un trial (feedback utilisateur).
 */
export interface TrialResult {
  readonly trialIndex: number;
  /** Par modalité : l'utilisateur a-t-il répondu correctement ? */
  readonly responses: Record<string, ModalityResponse>;
  /** Temps de réaction global en ms */
  readonly reactionTimeMs?: number;
}

/**
 * Réponse utilisateur pour une modalité.
 */
export interface ModalityResponse {
  /** L'utilisateur a-t-il appuyé pour cette modalité ? */
  readonly pressed: boolean;
  /** Était-ce une cible ? */
  readonly wasTarget: boolean;
  /** Résultat : hit, miss, false alarm, correct rejection */
  readonly result: 'hit' | 'miss' | 'false-alarm' | 'correct-rejection';
  /** Temps de réaction en ms (si pressed) */
  readonly reactionTimeMs?: number;
}

/**
 * Métriques de performance calculées.
 */
export interface PerformanceMetrics {
  /** d' global (signal detection) */
  readonly dPrime: number;
  /** d' par modalité */
  readonly dPrimeByModality: Record<string, number>;
  /** Taux de hits */
  readonly hitRate: number;
  /** Taux de false alarms */
  readonly falseAlarmRate: number;
  /** Temps de réaction moyen en ms */
  readonly avgReactionTimeMs: number | null;
  /** Nombre de trials évalués */
  readonly trialsEvaluated: number;
}

// =============================================================================
// Algorithm State (pour persistence)
// =============================================================================

/**
 * État sérialisable de l'algorithme.
 */
export interface AlgorithmState {
  /** Type d'algorithme */
  readonly algorithmType: string;
  /** Version du format de sérialisation */
  readonly version: number;
  /** Données spécifiques à l'algorithme */
  readonly data: unknown;
}

// =============================================================================
// Adaptive Algorithm Interface
// =============================================================================

/**
 * Interface pour les algorithmes adaptatifs.
 *
 * Implémentations :
 * - RulesBasedAlgorithm : règles fixes (zones 1-20, EMA du d')
 * - MLAlgorithm : modèle ML qui prédit la spec optimale
 * - FixedAlgorithm : spec constante (tests, debug)
 * - ReplayAlgorithm : rejoue une séquence de specs enregistrée
 */
export interface AdaptiveAlgorithm {
  /** Nom de l'algorithme (pour logs/debug) */
  readonly name: string;

  /**
   * Initialise l'algorithme avec la config de session.
   * Appelé une fois au démarrage.
   */
  initialize(config: SessionConfig): void;

  /**
   * Retourne la spec pour le prochain trial.
   * Le moteur appelle cette méthode avant chaque génération.
   *
   * @param context - État actuel (historique, performance, trial index)
   * @returns La spec à utiliser pour générer le prochain trial
   */
  getSpec(context: AlgorithmContext): SequenceSpec;

  /**
   * Notifie l'algorithme du résultat d'un trial.
   * Permet de mettre à jour l'état interne (EMA, compteurs, etc.)
   *
   * @param result - Résultat du trial
   */
  onTrialCompleted(result: TrialResult): void;

  /**
   * Sérialise l'état pour persistence/reprise.
   */
  serialize(): AlgorithmState;

  /**
   * Restaure depuis un état sérialisé.
   */
  restore(state: AlgorithmState): void;

  /**
   * Réinitialise l'algorithme à son état initial.
   */
  reset(): void;
}
