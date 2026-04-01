/**
 * XState Machines
 *
 * Exports for the XState-based game sessions.
 *
 * Note: Plugin modules have overlapping type names (AudioPolicy, ResponseProcessor, etc.)
 * so we export plugin factories explicitly and container types only.
 * For specific plugin types, import directly from the plugin module.
 */

export * from './types';
export * from './game-session-machine';
export * from './tutorial-session-types';
export * from './tutorial-session-machine';

// Plugin factories and container types (no conflicts)
export { createDefaultGamePlugins, type GameSessionPlugins } from './game-session-plugins';
