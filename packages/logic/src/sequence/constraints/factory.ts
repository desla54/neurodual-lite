/**
 * Constraint Factory - Crée des contraintes par défaut et instancie depuis specs
 */

import type {
  Constraint,
  ConstraintSpec,
  WeightedConstraint,
  WeightedConstraintSpec,
  MaxConsecutiveParams,
  MinGapParams,
  NoImmediateRepeatParams,
} from '../types';
import { createMaxConsecutiveConstraint } from './max-consecutive';
import { createMinGapConstraint } from './min-gap';
import { createNoImmediateRepeatConstraint } from './no-immediate-repeat';
import { createPreferVarietyConstraint } from './prefer-variety';
import {
  CONSTRAINT_PREFER_VARIETY_WEIGHT_DEFAULT,
  CONSTRAINT_PREFER_VARIETY_LOOKBACK,
} from '../../specs/thresholds';

/**
 * Crée des contraintes par défaut pour un jeu Dual N-Back standard.
 */
export function createDefaultConstraints(
  modalityIds: readonly string[],
  nLevel: number,
): Constraint[] {
  const constraints: Constraint[] = [];

  // Pour chaque modalité, ajouter NoImmediateRepeat (UNIQUEMENT si nLevel > 1)
  // Car pour nLevel = 1, une répétition immédiate EST un target.
  if (nLevel > 1) {
    for (const modalityId of modalityIds) {
      constraints.push(createNoImmediateRepeatConstraint({ modalityId }));
    }
  }

  // Limiter les targets consécutifs à 3 par modalité
  for (const modalityId of modalityIds) {
    constraints.push(
      createMaxConsecutiveConstraint({
        modalityId,
        intention: 'target',
        max: 3,
      }),
    );
  }

  return constraints;
}

/**
 * Crée des soft constraints par défaut (préférences).
 *
 * NOTE: on évite PreferVariety pour nLevel=1 car une répétition immédiate est un target.
 */
export function createDefaultSoftConstraints(
  modalityIds: readonly string[],
  nLevel: number,
): WeightedConstraint[] {
  if (nLevel <= 1) return [];

  return modalityIds.map((modalityId) =>
    createPreferVarietyConstraint({
      modalityId,
      weight: CONSTRAINT_PREFER_VARIETY_WEIGHT_DEFAULT,
      lookbackWindow: CONSTRAINT_PREFER_VARIETY_LOOKBACK,
    }),
  );
}

/**
 * Instancie des contraintes depuis leurs spécifications déclaratives.
 * Utilisé par le moteur pour convertir spec.hardConstraints en objets Constraint.
 */
export function instantiateConstraints(specs: readonly ConstraintSpec[]): Constraint[] {
  const constraints: Constraint[] = [];

  for (const spec of specs) {
    switch (spec.type) {
      case 'no-immediate-repeat':
        constraints.push(
          createNoImmediateRepeatConstraint(spec.params as unknown as NoImmediateRepeatParams),
        );
        break;
      case 'max-consecutive':
        constraints.push(
          createMaxConsecutiveConstraint(spec.params as unknown as MaxConsecutiveParams),
        );
        break;
      case 'min-gap':
        constraints.push(createMinGapConstraint(spec.params as unknown as MinGapParams));
        break;
      // Autres types de contraintes peuvent être ajoutés ici
      default:
      // Unknown constraint type - silently ignored
    }
  }

  return constraints;
}

/**
 * Instancie des contraintes soft (pondérées) depuis leurs spécifications déclaratives.
 */
export function instantiateWeightedConstraints(
  specs: readonly WeightedConstraintSpec[],
): WeightedConstraint[] {
  const constraints: WeightedConstraint[] = [];

  for (const spec of specs) {
    switch (spec.type) {
      case 'prefer-variety': {
        const rawModalityId = spec.params['modalityId'];
        if (typeof rawModalityId !== 'string' || !rawModalityId) break;
        const modalityId = rawModalityId;
        constraints.push(
          createPreferVarietyConstraint({
            modalityId,
            weight: spec.weight,
          }),
        );
        break;
      }
      default:
      // Unknown soft constraint type - silently ignored
    }
  }

  return constraints;
}
