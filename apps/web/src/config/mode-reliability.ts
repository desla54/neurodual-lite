/**
 * Mode reliability and access gating.
 *
 * Single source of truth for which game modes are stable/beta/alpha.
 * UI can still render placeholders for locked modes, but playability must
 * always be derived from this file + the current access flags.
 */

export type ReliabilityLevel = 'stable' | 'beta' | 'alpha' | 'prototype';

export interface FeatureAccessFlags {
  betaEnabled: boolean;
  alphaEnabled: boolean;
  prototypesEnabled: boolean;
}

const TUTORIAL_ONLY_MODE_IDS = new Set<string>();

// Keep ordering intentional (stable -> beta -> alpha)
export const STABLE_GAME_MODES = [
  'dualnback-classic',
  'sim-brainworkshop',
  'stroop',
  'stroop-flex',
] as const;
export const BETA_GAME_MODES = [] as const;
export const ALPHA_GAME_MODES = [] as const;

export const PROTOTYPE_GAME_MODES = [
  // Add prototype-only game modes here (dev only, never shipped)
] as const;

export const ALL_GAME_MODES = [
  ...STABLE_GAME_MODES,
  ...BETA_GAME_MODES,
  ...ALPHA_GAME_MODES,
  ...PROTOTYPE_GAME_MODES,
] as const;

/**
 * Map modeId -> reliability.
 * Stable modes are intentionally omitted and treated as the default.
 */
export const MODE_RELIABILITY: Readonly<Record<string, ReliabilityLevel>> = Object.freeze(
  Object.fromEntries([
    ...BETA_GAME_MODES.map((mode) => [mode, 'beta'] as const),
    ...ALPHA_GAME_MODES.map((mode) => [mode, 'alpha'] as const),
    ...PROTOTYPE_GAME_MODES.map((mode) => [mode, 'prototype'] as const),
  ]),
);

export function getReliabilityForGameMode(gameMode?: string): ReliabilityLevel {
  if (!gameMode) return 'stable';
  return MODE_RELIABILITY[gameMode] ?? 'stable';
}

export function isReliabilityVisible(
  reliability: ReliabilityLevel,
  access: FeatureAccessFlags,
): boolean {
  if (reliability === 'prototype') return access.prototypesEnabled;
  if (reliability === 'alpha') return access.alphaEnabled;
  if (reliability === 'beta') return access.betaEnabled;
  return true;
}

/**
 * True when the mode is allowed to be used (playable/selectable) for the current access.
 */
export function isGameModeVisibleForAccess(
  gameMode: string | undefined,
  access: FeatureAccessFlags,
): boolean {
  if (!gameMode) return true;
  if (TUTORIAL_ONLY_MODE_IDS.has(gameMode)) return false;
  return isReliabilityVisible(getReliabilityForGameMode(gameMode), access);
}
