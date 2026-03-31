/**
 * Types Index - Dual N-Back
 *
 * Point d'entrée unique pour tous les types.
 * RÈGLE: Cette couche est la fondation. Aucune logique, que des types.
 */

// Core types (Trial, Block, Position, Sound, etc.)
export * from './core';

// Event types (GameEvent, SessionSummary, etc.)
export * from './events';

// Adaptive pipeline types
export * from './adaptive';

// Coach types
export * from './coach';

// Progression types (XP, badges, profile)
export * from './progression';

// Memo types (active training mode)
export * from './memo';

// Flow types (intermediate placement mode)
export * from './place';

// Journey types (training path)
export * from './journey';

// Session report types (unified end-of-game reports)
export * from './session-report';

// Unified Performance Score types
export * from './ups';

// Trajectory types (for session replay)
export * from './trajectory';

// Dual Label types (BETA)
export * from './dual-pick';

// Trace types (BETA)
export * from './trace';

// Interactive Replay types (Correction Mode)
export * from './replay-interactif';

// Session Recovery types (page refresh resilience)
export * from './recovery';
