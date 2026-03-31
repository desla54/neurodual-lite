/**
 * CorrelationResolver - Gestion de la corrélation inter-modalités
 *
 * Permet de contrôler si les cibles tombent ensemble ou séparément.
 *
 * Paramètre ρ (rho) :
 * - ρ = 0 → Indépendance (par défaut)
 * - ρ > 0 → Corrélation positive (cibles ensemble plus souvent)
 * - ρ < 0 → Corrélation négative (cibles alternées)
 *
 * Implémentation :
 * - N = 2 modalités : Table de probabilités jointes (exact)
 * - N > 2 modalités : Gaussian Copulas avec décomposition de Cholesky (exact)
 */

import type { ModalityId, SequenceSpec } from '../types';
import { getCorrelation } from '../types';
import type { PRNG } from './prng';
import type { EffectiveProbabilities } from './budget-manager';
import { SEQUENCE_PROBABILITY_TOLERANCE } from '../../specs/thresholds';

// =============================================================================
// Types
// =============================================================================

/**
 * Table de probabilités jointes pour deux modalités.
 */
export interface JointProbabilityTable {
  /** P(A=target ET B=target) */
  readonly bothTarget: number;
  /** P(A=target ET B=non-target) */
  readonly onlyFirst: number;
  /** P(A=non-target ET B=target) */
  readonly onlySecond: number;
  /** P(A=non-target ET B=non-target) */
  readonly neither: number;
}

/**
 * Résultat du tirage corrélé des intentions.
 */
export interface CorrelatedIntentions {
  /** Map modalityId → isTarget pour ce trial */
  readonly isTarget: Record<ModalityId, boolean>;
  /** Cache de la décomposition de Cholesky (pour éviter recalcul) */
  readonly choleskyCache?: readonly (readonly number[])[];
}

// =============================================================================
// Joint Probability Calculation
// =============================================================================

/**
 * Construit la table de probabilités jointes pour deux modalités.
 *
 * @param p1 - Probabilité de cible pour la première modalité
 * @param p2 - Probabilité de cible pour la seconde modalité
 * @param rho - Corrélation (-1 à 1)
 * @returns Table de probabilités jointes
 */
export function buildJointProbabilityTable(
  p1: number,
  p2: number,
  rho: number,
): JointProbabilityTable {
  // Clamp rho entre -1 et 1
  const clampedRho = Math.max(-1, Math.min(1, rho));

  // q = P(les deux sont target)
  // Indépendance : q = p1 * p2
  const qIndep = p1 * p2;

  // Bornes de q
  const qMax = Math.min(p1, p2);
  const qMin = Math.max(0, p1 + p2 - 1);

  // Calcul de q selon rho
  let q: number;
  if (clampedRho >= 0) {
    // Corrélation positive : q augmente vers qMax
    q = qIndep + clampedRho * (qMax - qIndep);
  } else {
    // Corrélation négative : q diminue vers qMin
    q = qIndep + clampedRho * (qIndep - qMin);
  }

  // S'assurer que q est valide
  q = Math.max(qMin, Math.min(qMax, q));

  // Construire les 4 probabilités
  const bothTarget = q;
  const onlyFirst = Math.max(0, p1 - q);
  const onlySecond = Math.max(0, p2 - q);
  const neither = Math.max(0, 1 - p1 - p2 + q);

  // Normaliser pour s'assurer que la somme = 1 (erreurs d'arrondi)
  const total = bothTarget + onlyFirst + onlySecond + neither;
  if (Math.abs(total - 1) > SEQUENCE_PROBABILITY_TOLERANCE) {
    const scale = 1 / total;
    return {
      bothTarget: bothTarget * scale,
      onlyFirst: onlyFirst * scale,
      onlySecond: onlySecond * scale,
      neither: neither * scale,
    };
  }

  return { bothTarget, onlyFirst, onlySecond, neither };
}

/**
 * Tire les intentions (target/non-target) pour deux modalités corrélées.
 */
export function drawCorrelatedPair(
  table: JointProbabilityTable,
  rng: PRNG,
): { first: boolean; second: boolean } {
  const roll = rng.random();

  if (roll < table.bothTarget) {
    return { first: true, second: true };
  }

  if (roll < table.bothTarget + table.onlyFirst) {
    return { first: true, second: false };
  }

  if (roll < table.bothTarget + table.onlyFirst + table.onlySecond) {
    return { first: false, second: true };
  }

  return { first: false, second: false };
}

// =============================================================================
// Gaussian Copula Implementation
// =============================================================================

/**
 * Décomposition de Cholesky d'une matrice symétrique définie positive.
 * Retourne la matrice triangulaire inférieure L telle que Σ = L × Lᵀ.
 *
 * @param matrix - Matrice de corrélation NxN
 * @returns Matrice triangulaire inférieure L, ou null si non définie positive
 */
export function choleskyDecomposition(matrix: number[][]): number[][] | null {
  const n = matrix.length;
  const L: number[][] = Array(n)
    .fill(null)
    .map(() => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = 0;
      const Li = L[i];
      const Lj = L[j];
      if (!Li || !Lj) return null;

      if (j === i) {
        // Élément diagonal
        for (let k = 0; k < j; k++) {
          const ljk = Lj[k] ?? 0;
          sum += ljk * ljk;
        }
        const diag = (matrix[i]?.[i] ?? 0) - sum;
        if (diag <= 0) {
          // Matrice non définie positive
          return null;
        }
        Li[j] = Math.sqrt(diag);
      } else {
        // Élément hors diagonale
        for (let k = 0; k < j; k++) {
          sum += (Li[k] ?? 0) * (Lj[k] ?? 0);
        }
        const ljj = Lj[j] ?? 0;
        if (ljj === 0) return null;
        Li[j] = ((matrix[i]?.[j] ?? 0) - sum) / ljj;
      }
    }
  }

  return L;
}

/**
 * Fonction de répartition de la loi normale standard (Φ).
 * Approximation de Abramowitz & Stegun (erreur < 7.5×10⁻⁸).
 */
export function standardNormalCDF(z: number): number {
  // Constantes de l'approximation
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = z < 0 ? -1 : 1;
  const absZ = Math.abs(z);

  const t = 1 / (1 + p * absZ);
  const t2 = t * t;
  const t3 = t2 * t;
  const t4 = t3 * t;
  const t5 = t4 * t;

  const y = 1 - (a5 * t5 + a4 * t4 + a3 * t3 + a2 * t2 + a1 * t) * Math.exp((-absZ * absZ) / 2);

  return 0.5 * (1 + sign * y);
}

/**
 * Génère une variable aléatoire normale standard N(0,1).
 * Utilise la méthode de Box-Muller.
 */
export function generateStandardNormal(rng: PRNG): number {
  // Box-Muller transform
  const u1 = rng.random();
  const u2 = rng.random();

  // Éviter log(0)
  const safeU1 = Math.max(1e-10, u1);

  return Math.sqrt(-2 * Math.log(safeU1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Construit la matrice de corrélation NxN à partir de la spec.
 */
function buildCorrelationMatrix(
  modalityIds: readonly ModalityId[],
  correlationMatrix: Partial<Record<string, number>> | undefined,
): number[][] {
  const n = modalityIds.length;
  const matrix: number[][] = Array(n)
    .fill(null)
    .map(() => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const row = matrix[i];
      if (!row) continue;
      if (i === j) {
        row[j] = 1; // Diagonale = 1
      } else {
        const mid1 = modalityIds[i];
        const mid2 = modalityIds[j];
        if (mid1 && mid2) {
          row[j] = getCorrelation(correlationMatrix, mid1, mid2);
        }
      }
    }
  }

  return matrix;
}

/**
 * Résultat du tirage Gaussian Copula avec cache.
 */
interface GaussianCopulaResult {
  readonly isTarget: Record<ModalityId, boolean>;
  readonly choleskyL: readonly (readonly number[])[] | null;
}

/**
 * Tire les intentions via Gaussian Copula pour N modalités.
 *
 * Algorithme :
 * 1. Construire la matrice de corrélation Σ (ou utiliser le cache)
 * 2. Décomposition de Cholesky : Σ = L × Lᵀ (ou utiliser le cache)
 * 3. Générer Z = [Z₁, ..., Zₙ] variables normales standard indépendantes
 * 4. Calculer Y = L × Z (normales corrélées)
 * 5. Transformer en uniformes : U = Φ(Y)
 * 6. Décision : isTarget[i] = (U[i] < P[i])
 *
 * @param cachedL - Cache de la décomposition de Cholesky (évite recalcul O(N³))
 */
function drawWithGaussianCopula(
  modalityIds: readonly ModalityId[],
  probabilities: Record<ModalityId, number>,
  correlationMatrix: Partial<Record<string, number>> | undefined,
  rng: PRNG,
  cachedL?: readonly (readonly number[])[] | null,
): GaussianCopulaResult {
  const n = modalityIds.length;
  const isTarget: Record<ModalityId, boolean> = {};

  // 1-2. Utiliser le cache ou calculer la décomposition de Cholesky
  let L: readonly (readonly number[])[] | null;
  if (cachedL !== undefined) {
    L = cachedL;
  } else {
    const sigma = buildCorrelationMatrix(modalityIds, correlationMatrix);
    L = choleskyDecomposition(sigma);
  }

  if (!L) {
    // Fallback : tirage indépendant si la matrice n'est pas définie positive
    for (const mid of modalityIds) {
      const p = probabilities[mid] ?? 0;
      isTarget[mid] = rng.random() < p;
    }
    return { isTarget, choleskyL: null };
  }

  // 3. Générer les normales standard indépendantes
  const Z: number[] = [];
  for (let i = 0; i < n; i++) {
    Z.push(generateStandardNormal(rng));
  }

  // 4. Calculer Y = L × Z (normales corrélées)
  const Y: number[] = [];
  for (let i = 0; i < n; i++) {
    let yi = 0;
    const Li = L[i];
    for (let j = 0; j <= i; j++) {
      yi += (Li?.[j] ?? 0) * (Z[j] ?? 0);
    }
    Y.push(yi);
  }

  // 5. Transformer en uniformes via Φ (CDF normale standard)
  const U: number[] = Y.map((y) => standardNormalCDF(y));

  // 6. Décision : isTarget[i] = (U[i] < P[i])
  for (let i = 0; i < n; i++) {
    const mid = modalityIds[i];
    if (!mid) continue;
    const p = probabilities[mid] ?? 0;
    isTarget[mid] = (U[i] ?? 0) < p;
  }

  return { isTarget, choleskyL: L };
}

// =============================================================================
// Multi-Modality Correlation
// =============================================================================

/**
 * Tire les intentions pour toutes les modalités en respectant les corrélations.
 *
 * Implémentation exacte pour N modalités via Gaussian Copulas :
 * - N = 1 : Tirage simple
 * - N = 2 : Table de probabilités jointes (plus efficace)
 * - N > 2 : Gaussian Copula avec décomposition de Cholesky
 *
 * @param choleskyCache - Cache de Cholesky (évite recalcul O(N³) à chaque trial)
 */
export function drawCorrelatedIntentions(
  spec: SequenceSpec,
  effectiveProbs: EffectiveProbabilities,
  rng: PRNG,
  choleskyCache?: readonly (readonly number[])[] | null,
): CorrelatedIntentions {
  const modalityIds = spec.modalities.map((m) => m.id);
  const isTarget: Record<ModalityId, boolean> = {};

  if (modalityIds.length === 0) {
    return { isTarget };
  }

  // Cas simple : une seule modalité
  if (modalityIds.length === 1) {
    const mid = modalityIds[0];
    if (!mid) return { isTarget };
    const p = effectiveProbs.targetProbabilities[mid] ?? 0;
    isTarget[mid] = rng.random() < p;
    return { isTarget };
  }

  // Cas de deux modalités : utiliser la table de probabilités jointes (plus efficace)
  if (modalityIds.length === 2) {
    const [mid1, mid2] = modalityIds as [ModalityId, ModalityId];
    const p1 = effectiveProbs.targetProbabilities[mid1] ?? 0;
    const p2 = effectiveProbs.targetProbabilities[mid2] ?? 0;
    const rho = getCorrelation(spec.correlationMatrix, mid1, mid2);

    const table = buildJointProbabilityTable(p1, p2, rho);
    const result = drawCorrelatedPair(table, rng);

    isTarget[mid1] = result.first;
    isTarget[mid2] = result.second;
    return { isTarget };
  }

  // Cas général : N > 2 modalités → Gaussian Copula (exact)
  const copulaResult = drawWithGaussianCopula(
    modalityIds,
    effectiveProbs.targetProbabilities,
    spec.correlationMatrix,
    rng,
    choleskyCache,
  );

  for (const mid of modalityIds) {
    isTarget[mid] = copulaResult.isTarget[mid] ?? false;
  }

  return { isTarget, choleskyCache: copulaResult.choleskyL ?? undefined };
}

// =============================================================================
// Validation
// =============================================================================

/**
 * Vérifie qu'une matrice de corrélation est valide.
 */
export function isValidCorrelationMatrix(matrix: Record<string, number> | undefined): boolean {
  if (!matrix) return true;

  for (const value of Object.values(matrix)) {
    if (typeof value !== 'number' || value < -1 || value > 1) {
      return false;
    }
  }

  return true;
}
