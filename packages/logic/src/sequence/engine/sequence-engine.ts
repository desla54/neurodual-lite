/**
 * SequenceEngine - Moteur de génération de séquences
 *
 * Le MUSCLE : reçoit une SequenceSpec et produit un Trial.
 * Ne sait rien de l'adaptation, il exécute.
 *
 * Étapes :
 * 1. Calcul des probabilités effectives (budget hypergéométrique)
 * 2. Tirage des intentions par modalité (target/lure/neutral)
 * 3. Résolution des valeurs concrètes
 * 4. Validation des contraintes
 * 5. Retour du trial généré
 */

import type {
  Constraint,
  EngineState,
  GeneratedTrial,
  GenerationMetadata,
  GenerationResult,
  ModalityId,
  ModalityValue,
  SequenceSpec,
  TrialIntention,
  WeightedConstraint,
} from '../types';
import { createEmptyBudgetUsed } from '../types';
import { SEQUENCE_MIN_PROBABILITY_MULTIPLIER } from '../../specs/thresholds';
import { instantiateConstraints, instantiateWeightedConstraints } from '../constraints';
import { calculateEffectiveProbabilities } from './budget-manager';
import { drawCorrelatedIntentions } from './correlation-resolver';
import { createPRNG } from './prng';
import { type CandidateOption, enumerateValidOptions, pickOption } from './value-resolver';

// =============================================================================
// Types
// =============================================================================

export interface SequenceEngineConfig {
  /** Nombre max de tentatives avant échec */
  readonly maxAttempts?: number;
}

// =============================================================================
// Filter-Then-Pick Helpers
// =============================================================================

/**
 * Filtre les options par contraintes additionnelles.
 * Applique les contraintes hard qui n'ont pas encore été considérées.
 */
function filterOptionsByConstraints(
  options: readonly CandidateOption[],
  constraints: readonly Constraint[],
  history: readonly GeneratedTrial[],
  modalityId: ModalityId,
): CandidateOption[] {
  if (constraints.length === 0) {
    return [...options];
  }

  return options.filter((option) => {
    for (const constraint of constraints) {
      if (constraint.type !== 'hard') continue;

      // Vérifier si cette valeur est interdite
      const forbiddenValues = constraint.getForbiddenValues(history, modalityId, option.intention);
      if (forbiddenValues.has(option.value)) {
        return false;
      }
    }
    return true;
  });
}

function isWeightedConstraint(constraint: Constraint): constraint is WeightedConstraint {
  return constraint.type === 'soft' && 'getSatisfactionScore' in constraint;
}

function applySoftConstraintsToOptions(
  options: readonly CandidateOption[],
  softConstraints: readonly WeightedConstraint[],
  history: readonly GeneratedTrial[],
  modalityId: ModalityId,
  trialIndex: number,
): CandidateOption[] {
  if (softConstraints.length === 0) {
    return [...options];
  }

  return options.map((option) => {
    // Build a minimal candidate trial containing only this modality
    const candidate: GeneratedTrial = {
      index: trialIndex,
      values: {
        [modalityId]: {
          modalityId,
          value: option.value,
          intention: option.intention,
        } as ModalityValue,
      },
    };

    let multiplier = 1;
    for (const constraint of softConstraints) {
      const weight = Number.isFinite(constraint.weight)
        ? Math.max(0, Math.min(1, constraint.weight))
        : 0;
      if (weight <= 0) continue;

      const scoreRaw = constraint.getSatisfactionScore(history, candidate);
      const score = Number.isFinite(scoreRaw) ? Math.max(0, Math.min(1, scoreRaw)) : 1;

      // Linear blend: weight=0 => no effect, weight=1 => probability *= score
      const m = 1 - weight + weight * score;
      multiplier *= Math.max(SEQUENCE_MIN_PROBABILITY_MULTIPLIER, m);
    }

    return {
      ...option,
      probability: option.probability * multiplier,
    };
  });
}

// =============================================================================
// Sequence Engine
// =============================================================================

/**
 * Crée un moteur de génération de séquences.
 *
 * Utilise Filter-Then-Pick : énumère d'abord toutes les options valides,
 * filtre par contraintes, puis sélectionne. Pas de boucle de retry.
 */
export function createSequenceEngine(_config: SequenceEngineConfig = {}) {
  /**
   * Génère le prochain trial avec Filter-Then-Pick.
   *
   * Algorithme :
   * 1. Calculer les probabilités effectives (budget hypergéométrique)
   * 2. Collecter les intentions interdites par contraintes hard
   * 3. Tirer les intentions corrélées (target/non-target) via Gaussian Copula
   * 4. Pour chaque modalité :
   *    a. Énumérer toutes les options (intention, value) valides
   *    b. Filtrer par contraintes
   *    c. Sélectionner selon les probabilités
   * 5. Construire le trial
   * 6. Vérification finale des contraintes inter-modalités
   */
  function generateNext(
    spec: SequenceSpec,
    state: EngineState,
    additionalConstraints: readonly Constraint[] = [],
  ): GenerationResult {
    const startTime = performance.now();

    // Créer le PRNG depuis l'état
    const rng = createPRNG(state.rng.seed, state.rng);

    // Instancier les contraintes depuis la spec et les fusionner avec les contraintes additionnelles
    const specConstraints = instantiateConstraints(spec.hardConstraints);
    const specSoftConstraints = instantiateWeightedConstraints(spec.softConstraints);
    const constraints = [...specConstraints, ...specSoftConstraints, ...additionalConstraints];
    const softConstraints = constraints.filter(isWeightedConstraint);

    // 1. Calculer les probabilités effectives
    const effectiveProbs = calculateEffectiveProbabilities(spec, state.budgetUsed);

    // 2. Collecter les intentions et valeurs interdites par contraintes hard
    const forbiddenIntentionsByModality = new Map<ModalityId, Set<TrialIntention>>();
    // Map<ModalityId, Map<TrialIntention, Set<value>>> - évite le collateral damage
    const forbiddenValuesByModalityAndIntention = new Map<
      ModalityId,
      Map<TrialIntention, Set<number | string>>
    >();

    for (const modalitySpec of spec.modalities) {
      const forbiddenIntentions = new Set<TrialIntention>();
      const forbiddenValuesByIntention = new Map<TrialIntention, Set<number | string>>();

      // Initialiser les Sets pour chaque intention
      for (const intention of ['target', 'lure-n-1', 'lure-n+1', 'neutral'] as TrialIntention[]) {
        forbiddenValuesByIntention.set(intention, new Set());
      }

      for (const constraint of constraints) {
        if (constraint.type === 'hard') {
          // Intentions interdites
          const constraintForbiddenIntentions = constraint.getForbiddenIntentions(
            state.history,
            modalitySpec.id,
          );
          for (const intention of constraintForbiddenIntentions) {
            forbiddenIntentions.add(intention);
          }

          // Valeurs interdites PAR INTENTION (pas de collateral damage)
          for (const intention of [
            'target',
            'lure-n-1',
            'lure-n+1',
            'neutral',
          ] as TrialIntention[]) {
            const constraintForbiddenValues = constraint.getForbiddenValues(
              state.history,
              modalitySpec.id,
              intention,
            );
            const intentionSet = forbiddenValuesByIntention.get(intention);
            if (intentionSet) {
              for (const value of constraintForbiddenValues) {
                intentionSet.add(value);
              }
            }
          }
        }
      }

      forbiddenIntentionsByModality.set(modalitySpec.id, forbiddenIntentions);
      forbiddenValuesByModalityAndIntention.set(modalitySpec.id, forbiddenValuesByIntention);
    }

    // 3. Tirer les intentions corrélées (target/non-target)
    // Utilise le cache Cholesky si disponible (évite recalcul O(N³) par trial)
    const correlatedIntentions =
      spec.correlationMatrix && spec.modalities.length > 1
        ? drawCorrelatedIntentions(spec, effectiveProbs, rng, state.choleskyCache)
        : undefined;

    // 4. Pour chaque modalité : Filter-Then-Pick
    const values: Record<ModalityId, ModalityValue> = {};
    const conflictDetails: string[] = [];

    for (const modalitySpec of spec.modalities) {
      const modalityId = modalitySpec.id;
      const forbiddenIntentions = forbiddenIntentionsByModality.get(modalityId) ?? new Set();
      const forbiddenValuesByIntention =
        forbiddenValuesByModalityAndIntention.get(modalityId) ?? new Map();

      // Probabilités pour cette modalité
      const probabilities = {
        pTarget: effectiveProbs.targetProbabilities[modalityId] ?? 0,
        pLureN1: effectiveProbs.lureProbabilities[modalityId]?.['n-1'] ?? 0,
        pLureNPlus1: effectiveProbs.lureProbabilities[modalityId]?.['n+1'] ?? 0,
      };

      // Décision corrélée (si présente)
      const correlatedIsTarget = correlatedIntentions?.isTarget[modalityId];

      // 4a. Énumérer toutes les options valides
      const allOptions = enumerateValidOptions(
        spec,
        state.history,
        modalityId,
        probabilities,
        forbiddenIntentions,
        forbiddenValuesByIntention,
        correlatedIsTarget,
      );

      // 4b. Filtrer par contraintes additionnelles
      const filteredOptions = filterOptionsByConstraints(
        allOptions,
        constraints,
        state.history,
        modalityId,
      );

      // 4c. Sélectionner
      const weightedOptions = applySoftConstraintsToOptions(
        filteredOptions,
        softConstraints,
        state.history,
        modalityId,
        state.nextIndex,
      );
      const selected = pickOption(weightedOptions, rng);

      if (!selected) {
        // Aucune option valide pour cette modalité
        const forbiddenValuesStr = [...forbiddenValuesByIntention.entries()]
          .map(([intent, vals]) => `${intent}:[${[...vals].join(',')}]`)
          .join(', ');
        conflictDetails.push(
          `Modality '${modalityId}': No valid options after filtering. ` +
            `Forbidden intentions: [${[...forbiddenIntentions].join(', ')}], ` +
            `Forbidden values by intention: {${forbiddenValuesStr}}, ` +
            `Correlated target: ${correlatedIsTarget}`,
        );
        continue;
      }

      values[modalityId] = {
        modalityId,
        value: selected.value,
        intention: selected.intention,
      };
    }

    // Vérifier si toutes les modalités ont une valeur
    if (Object.keys(values).length !== spec.modalities.length) {
      throw new Error(
        `Failed to generate trial: constraint conflict detected.\n` +
          `Details:\n${conflictDetails.join('\n')}\n` +
          `Trial index: ${state.nextIndex}, History length: ${state.history.length}`,
      );
    }

    // 5. Construire le trial
    const trial: GeneratedTrial = {
      index: state.nextIndex,
      values,
    };

    // 6. Vérification finale des contraintes inter-modalités
    // (les contraintes qui dépendent de plusieurs modalités ensemble)
    for (const constraint of constraints) {
      if (constraint.type === 'hard' && !constraint.isSatisfied(state.history, trial)) {
        throw new Error(
          `Failed to generate trial: inter-modality constraint '${constraint.id}' violated.\n` +
            `This indicates a constraint that cannot be satisfied with Filter-Then-Pick per-modality.\n` +
            `Consider decomposing the constraint or using a different approach.`,
        );
      }
    }

    // Mettre à jour le budget
    // IMPORTANT: Increment trialsGenerated only ONCE per trial, not per modality
    // This fixes the budget exhaustion bug in multi-modality sessions
    let newBudgetUsed = {
      ...state.budgetUsed,
      trialsGenerated: state.budgetUsed.trialsGenerated + 1, // ✅ Once per trial
    };

    // Update per-modality stats (targets/lures)
    for (const [modalityId, modalityValue] of Object.entries(values)) {
      // Update only targets/lures counters, NOT trialsGenerated
      const intention = modalityValue.intention;
      if (intention === 'target') {
        newBudgetUsed = {
          ...newBudgetUsed,
          targetsUsed: {
            ...newBudgetUsed.targetsUsed,
            [modalityId]: (newBudgetUsed.targetsUsed[modalityId] ?? 0) + 1,
          },
        };
      } else if (intention === 'lure-n-1') {
        newBudgetUsed = {
          ...newBudgetUsed,
          luresUsed: {
            ...newBudgetUsed.luresUsed,
            [modalityId]: {
              ...newBudgetUsed.luresUsed[modalityId],
              'n-1': (newBudgetUsed.luresUsed[modalityId]?.['n-1'] ?? 0) + 1,
            },
          },
        };
      } else if (intention === 'lure-n+1') {
        newBudgetUsed = {
          ...newBudgetUsed,
          luresUsed: {
            ...newBudgetUsed.luresUsed,
            [modalityId]: {
              ...newBudgetUsed.luresUsed[modalityId],
              'n+1': (newBudgetUsed.luresUsed[modalityId]?.['n+1'] ?? 0) + 1,
            },
          },
        };
      }
    }

    // Préserver ou mettre à jour le cache Cholesky
    const newCholeskyCache = correlatedIntentions?.choleskyCache ?? state.choleskyCache;

    const newState: EngineState = {
      history: [...state.history, trial],
      budgetUsed: newBudgetUsed,
      rng: rng.getState(),
      nextIndex: state.nextIndex + 1,
      choleskyCache: newCholeskyCache,
    };

    const metadata: GenerationMetadata = {
      effectiveProbabilities: effectiveProbs.targetProbabilities,
      constraintsApplied: constraints.map((c) => c.id),
      attempts: 1, // Filter-Then-Pick = toujours 1 tentative
      generationTimeMs: performance.now() - startTime,
    };

    return {
      trial,
      newState,
      metadata,
    };
  }

  /**
   * Crée un état initial pour le moteur.
   */
  function createInitialState(spec: SequenceSpec): EngineState {
    const modalityIds = spec.modalities.map((m) => m.id);
    const seed = spec.seed ?? crypto.randomUUID();

    return {
      history: [],
      budgetUsed: createEmptyBudgetUsed(modalityIds),
      rng: { seed, callCount: 0 },
      nextIndex: 0,
    };
  }

  return {
    generateNext,
    createInitialState,
  };
}
