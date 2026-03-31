/**
 * Sequence Module - Moteur de génération de séquences cognitives
 *
 * Architecture :
 * - types/ : Spécifications déclaratives et interfaces
 * - engine/ : Moteur de génération (budget, corrélation, contraintes)
 * - algorithm/ : Algorithmes adaptatifs (rules-based, ML, fixed)
 * - constraints/ : Implémentations des contraintes
 * - validation/ : Validation statistique
 * - adapter/ : Adaptateur vers TrialGenerator existant
 */

// Types
export * from './types';

// Engine
export * from './engine';

// Algorithm
export * from './algorithm';

// Constraints
export * from './constraints';

// Validation
export * from './validation';

// Adapter
export * from './adapter';
