/**
 * SequenceSpec - Spécification déclarative de séquence
 *
 * Décrit QUOI générer, pas COMMENT.
 * Immuable : l'algorithme crée une nouvelle spec, ne modifie jamais l'existante.
 */

import { GEN_TARGET_PROBABILITY_DEFAULT } from '../../specs/thresholds';

// =============================================================================
// Modalité
// =============================================================================

export type ModalityId = string;

/**
 * Définition d'une modalité (position, audio, color, etc.)
 */
export interface ModalitySpec {
  readonly id: ModalityId;
  /**
   * Valeurs possibles pour cette modalité.
   * - number : nombre de positions (ex: 9 pour grille 3x3)
   * - string[] : liste de valeurs (ex: ['C', 'H', 'K', ...] pour audio)
   */
  readonly values: number | readonly string[];
}

// =============================================================================
// Lures
// =============================================================================

/**
 * Type de leurre par rapport au N-back.
 * 'n-1' = répétition à N-1 (interférence proactive)
 * 'n+1' = répétition à N+1 (interférence rétroactive)
 */
export type LureType = 'n-1' | 'n+1';

/**
 * Spécification des probabilités de leurre par type.
 * Ex: { 'n-1': 0.10, 'n+1': 0.05 }
 */
export type LureSpec = Partial<Record<LureType, number>>;

// =============================================================================
// Corrélation
// =============================================================================

/**
 * Clé de corrélation entre deux modalités.
 * Format: "modalityA_modalityB" (ordre alphabétique)
 */
export type CorrelationKey = `${ModalityId}_${ModalityId}`;

/**
 * Matrice de corrélation entre modalités.
 * Valeurs entre -1 et 1.
 * - 0 = indépendance
 * - > 0 = corrélation positive (cibles ensemble)
 * - < 0 = corrélation négative (cibles alternées)
 */
export type CorrelationMatrix = Partial<Record<CorrelationKey, number>>;

// =============================================================================
// Budget
// =============================================================================

/**
 * Spécification du budget pour quotas exacts sur un bloc.
 */
export interface BudgetSpec {
  /** Taille du bloc en trials */
  readonly blockSize: number;
  /** Nombre exact de cibles par modalité (optionnel, sinon calculé depuis pTarget) */
  readonly exactTargets?: Partial<Record<ModalityId, number>>;
  /** Nombre exact de leurres par modalité et type (optionnel) */
  readonly exactLures?: Partial<Record<ModalityId, Partial<Record<LureType, number>>>>;
}

// =============================================================================
// Timing
// =============================================================================

/**
 * Spécification du timing (informatif, utilisé par la session).
 */
export interface TimingSpec {
  /** Inter-stimulus interval en millisecondes */
  readonly isiMs: number;
  /** Durée d'affichage du stimulus en millisecondes */
  readonly stimulusDurationMs: number;
}

// =============================================================================
// SequenceSpec
// =============================================================================

/**
 * Spécification complète d'une séquence.
 * Objet immuable décrivant ce qu'on veut générer.
 */
export interface SequenceSpec {
  // === Identité ===
  /** Niveau N-back */
  readonly nLevel: number;

  // === Modalités ===
  /** Liste des modalités actives */
  readonly modalities: readonly ModalitySpec[];

  // === Probabilités ===
  /** Probabilité de cible par modalité (0-1) */
  readonly targetProbabilities: Record<ModalityId, number>;
  /** Probabilité de leurre par modalité et type (0-1) */
  readonly lureProbabilities: Record<ModalityId, LureSpec>;

  // === Corrélation ===
  /** Corrélation inter-modalités (optionnel, défaut = indépendance) */
  readonly correlationMatrix?: CorrelationMatrix;

  // === Contraintes ===
  /** Contraintes dures (jamais violées) */
  readonly hardConstraints: readonly ConstraintSpec[];
  /** Contraintes souples (préférences avec poids) */
  readonly softConstraints: readonly WeightedConstraintSpec[];

  // === Budget ===
  /** Budget pour quotas exacts (optionnel) */
  readonly budget?: BudgetSpec;

  // === Timing ===
  /** Timing du stimulus (optionnel, informatif) */
  readonly timing?: TimingSpec;

  // === Seed ===
  /** Seed pour reproductibilité (optionnel) */
  readonly seed?: string;
}

// =============================================================================
// Constraint Specs (références, définies en détail dans constraints.ts)
// =============================================================================

/**
 * Spécification d'une contrainte (référence par type + params).
 */
export interface ConstraintSpec {
  readonly type: string;
  readonly params: Record<string, unknown>;
}

/**
 * Contrainte avec poids pour les soft constraints.
 */
export interface WeightedConstraintSpec extends ConstraintSpec {
  /** Poids de la contrainte (0-1) */
  readonly weight: number;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Crée une clé de corrélation normalisée (ordre alphabétique).
 */
export function makeCorrelationKey(a: ModalityId, b: ModalityId): CorrelationKey {
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}

/**
 * Récupère la corrélation entre deux modalités (défaut = 0).
 */
export function getCorrelation(
  matrix: CorrelationMatrix | undefined,
  a: ModalityId,
  b: ModalityId,
): number {
  if (!matrix) return 0;
  const key = makeCorrelationKey(a, b);
  return matrix[key] ?? 0;
}

/**
 * Crée une SequenceSpec avec des valeurs par défaut.
 */
export function createSequenceSpec(
  partial: Partial<SequenceSpec> & Pick<SequenceSpec, 'nLevel' | 'modalities'>,
): SequenceSpec {
  const modalityIds = partial.modalities.map((m) => m.id);

  // Defaults pour probabilités
  const defaultTargetProbs: Record<ModalityId, number> = {};
  const defaultLureProbs: Record<ModalityId, LureSpec> = {};
  for (const id of modalityIds) {
    defaultTargetProbs[id] = GEN_TARGET_PROBABILITY_DEFAULT;
    defaultLureProbs[id] = {}; // Pas de leurres par défaut
  }

  return {
    nLevel: partial.nLevel,
    modalities: partial.modalities,
    targetProbabilities: partial.targetProbabilities ?? defaultTargetProbs,
    lureProbabilities: partial.lureProbabilities ?? defaultLureProbs,
    correlationMatrix: partial.correlationMatrix,
    hardConstraints: partial.hardConstraints ?? [],
    softConstraints: partial.softConstraints ?? [],
    budget: partial.budget,
    timing: partial.timing,
    seed: partial.seed,
  };
}
