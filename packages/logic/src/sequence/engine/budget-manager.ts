/**
 * BudgetManager - Gestion des quotas par budget hypergéométrique
 *
 * Garantit le nombre exact de cibles/leurres sur un bloc.
 * P(target) = targets_restants / trials_restants
 *
 * Plus naturel qu'un deck fixe, pas de pattern détectable.
 */

import { GEN_TARGET_PROBABILITY_DEFAULT } from '../../specs/thresholds';
import type { BudgetUsed, LureType, ModalityId, SequenceSpec } from '../types';

// =============================================================================
// Types
// =============================================================================

/**
 * Probabilités effectives calculées pour un trial.
 */
export interface EffectiveProbabilities {
  readonly targetProbabilities: Record<ModalityId, number>;
  readonly lureProbabilities: Record<ModalityId, Partial<Record<LureType, number>>>;
}

// =============================================================================
// Budget Calculations
// =============================================================================

/**
 * Calcule le nombre de cibles attendues pour une modalité.
 */
export function calculateExpectedTargets(spec: SequenceSpec, modalityId: ModalityId): number {
  const budget = spec.budget;
  if (!budget) {
    // Sans budget, pas de quota exact
    return -1;
  }

  // Si exactTargets est défini, l'utiliser
  const exactTarget = budget.exactTargets?.[modalityId];
  if (exactTarget !== undefined) {
    return exactTarget;
  }

  // Sinon calculer depuis la probabilité
  const pTarget = spec.targetProbabilities[modalityId] ?? GEN_TARGET_PROBABILITY_DEFAULT;
  return Math.round(budget.blockSize * pTarget);
}

/**
 * Calcule le nombre de leurres attendus pour une modalité et un type.
 */
export function calculateExpectedLures(
  spec: SequenceSpec,
  modalityId: ModalityId,
  lureType: LureType,
): number {
  const budget = spec.budget;
  if (!budget) {
    return -1;
  }

  // Si exactLures est défini, l'utiliser
  const exactLure = budget.exactLures?.[modalityId]?.[lureType];
  if (exactLure !== undefined) {
    return exactLure;
  }

  // Sinon calculer depuis la probabilité
  const lureSpec = spec.lureProbabilities[modalityId];
  const pLure = lureSpec?.[lureType] ?? 0;
  return Math.round(budget.blockSize * pLure);
}

/**
 * Calcule les probabilités effectives en utilisant le budget hypergéométrique.
 *
 * P(target) = targets_restants / trials_restants
 */
export function calculateEffectiveProbabilities(
  spec: SequenceSpec,
  budgetUsed: BudgetUsed,
): EffectiveProbabilities {
  const budget = spec.budget;
  const modalityIds = spec.modalities.map((m) => m.id);

  const targetProbabilities: Record<ModalityId, number> = {};
  const lureProbabilities: Record<ModalityId, Partial<Record<LureType, number>>> = {};

  // Trials restants dans le bloc
  const trialsRemaining = budget
    ? Math.max(0, budget.blockSize - budgetUsed.trialsGenerated)
    : Number.POSITIVE_INFINITY;

  for (const modalityId of modalityIds) {
    // === Probabilité de cible ===
    if (budget && trialsRemaining > 0) {
      const expectedTargets = calculateExpectedTargets(spec, modalityId);
      const targetsUsed = budgetUsed.targetsUsed[modalityId] ?? 0;
      const targetsRemaining = Math.max(0, expectedTargets - targetsUsed);

      // Budget hypergéométrique
      targetProbabilities[modalityId] = targetsRemaining / trialsRemaining;
    } else {
      // Sans budget ou fin de bloc, utiliser la probabilité de la spec
      targetProbabilities[modalityId] =
        spec.targetProbabilities[modalityId] ?? GEN_TARGET_PROBABILITY_DEFAULT;
    }

    // === Probabilités de leurres ===
    lureProbabilities[modalityId] = {};
    const lureSpec = spec.lureProbabilities[modalityId] ?? {};

    for (const lureType of ['n-1', 'n+1'] as const) {
      // modalityLures is guaranteed to exist (initialized just above at line 111)
      const modalityLures = lureProbabilities[modalityId] as Record<'n-1' | 'n+1', number>;

      if (budget && trialsRemaining > 0) {
        const expectedLures = calculateExpectedLures(spec, modalityId, lureType);
        const luresUsed = budgetUsed.luresUsed[modalityId]?.[lureType] ?? 0;
        const luresRemaining = Math.max(0, expectedLures - luresUsed);

        modalityLures[lureType] = luresRemaining / trialsRemaining;
      } else {
        modalityLures[lureType] = lureSpec[lureType] ?? 0;
      }
    }
  }

  return { targetProbabilities, lureProbabilities };
}

/**
 * Met à jour les compteurs de cibles/leurres pour une modalité.
 * N'incrémente PAS trialsGenerated (appelé par modalité).
 */
export function updateModalityBudget(
  budgetUsed: BudgetUsed,
  modalityId: ModalityId,
  intention: 'target' | 'lure-n-1' | 'lure-n+1' | 'neutral',
): BudgetUsed {
  const newTargetsUsed = { ...budgetUsed.targetsUsed };
  const newLuresUsed: Record<ModalityId, Record<string, number>> = {};

  // Deep copy luresUsed
  for (const [mid, lures] of Object.entries(budgetUsed.luresUsed)) {
    newLuresUsed[mid] = { ...lures };
  }

  // Update based on intention
  if (intention === 'target') {
    newTargetsUsed[modalityId] = (newTargetsUsed[modalityId] ?? 0) + 1;
  } else if (intention === 'lure-n-1') {
    const lures = newLuresUsed[modalityId] ?? {};
    lures['n-1'] = (lures['n-1'] ?? 0) + 1;
    newLuresUsed[modalityId] = lures;
  } else if (intention === 'lure-n+1') {
    const lures = newLuresUsed[modalityId] ?? {};
    lures['n+1'] = (lures['n+1'] ?? 0) + 1;
    newLuresUsed[modalityId] = lures;
  }

  return {
    trialsGenerated: budgetUsed.trialsGenerated, // Ne pas incrémenter ici
    targetsUsed: newTargetsUsed,
    luresUsed: newLuresUsed,
  };
}

/**
 * Incrémente le compteur de trials générés.
 * Appelé UNE SEULE FOIS par trial, après toutes les modalités.
 */
export function incrementTrialCount(budgetUsed: BudgetUsed): BudgetUsed {
  return {
    ...budgetUsed,
    trialsGenerated: budgetUsed.trialsGenerated + 1,
  };
}

/**
 * Vérifie si le budget est épuisé (bloc terminé).
 */
export function isBudgetExhausted(spec: SequenceSpec, budgetUsed: BudgetUsed): boolean {
  if (!spec.budget) return false;
  return budgetUsed.trialsGenerated >= spec.budget.blockSize;
}

/**
 * Réinitialise le budget pour un nouveau bloc.
 */
export function resetBudget(modalityIds: readonly ModalityId[]): BudgetUsed {
  const targetsUsed: Record<ModalityId, number> = {};
  const luresUsed: Record<ModalityId, Record<string, number>> = {};

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
