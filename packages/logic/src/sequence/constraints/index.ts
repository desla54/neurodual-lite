/**
 * Constraints Module - Implémentations des contraintes
 *
 * Hard Constraints (jamais violées) :
 * - NoImmediateRepeat : pas de répétition immédiate
 * - MaxConsecutive : limite les intentions consécutives
 * - MinGap : impose un espacement minimum
 *
 * Soft Constraints (préférences avec poids) :
 * - PreferVariety : préfère la diversité des valeurs
 */

// Hard Constraints
export { createNoImmediateRepeatConstraint } from './no-immediate-repeat';
export { createMaxConsecutiveConstraint } from './max-consecutive';
export { createMinGapConstraint } from './min-gap';

// Soft Constraints
export { createPreferVarietyConstraint, type PreferVarietyParams } from './prefer-variety';

// Factory pour créer des contraintes depuis une spec
export {
  createDefaultConstraints,
  createDefaultSoftConstraints,
  instantiateConstraints,
  instantiateWeightedConstraints,
} from './factory';
