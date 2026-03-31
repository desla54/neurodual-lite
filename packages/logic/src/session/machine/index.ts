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
export * from './place-session-types';
export * from './place-session-machine';
export * from './tutorial-session-types';
export * from './tutorial-session-machine';
export * from './trace-session-types';
export * from './trace-session-input-builder';
export * from './trace-session-machine';
export * from './memo-session-types';
export * from './memo-session-machine';
export * from './dual-pick-session-types';
export * from './dual-pick-session-machine';

// Plugin factories and container types (no conflicts)
export { createDefaultGamePlugins, type GameSessionPlugins } from './game-session-plugins';
export { createDefaultTracePlugins, type TraceSessionPlugins } from './trace-session-plugins';
export { createDefaultMemoPlugins, type MemoSessionPlugins } from './memo-session-plugins';
export {
  createDefaultDualPickPlugins,
  type DualPickSessionPlugins,
} from './dual-pick-session-plugins';
export { createDefaultPlacePlugins, type PlaceSessionPlugins } from './place-session-plugins';
