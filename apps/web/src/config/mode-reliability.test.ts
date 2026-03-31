import { describe, expect, it } from 'bun:test';

import {
  ALPHA_GAME_MODES,
  ALL_GAME_MODES,
  BETA_GAME_MODES,
  STABLE_GAME_MODES,
  getReliabilityForGameMode,
  isGameModeVisibleForAccess,
} from './mode-reliability';

describe('mode reliability', () => {
  it('keeps the reliability buckets disjoint', () => {
    expect(new Set(ALL_GAME_MODES).size).toBe(ALL_GAME_MODES.length);
  });

  it('keeps the curated lists in sync with reality', () => {
    expect(STABLE_GAME_MODES.length).toBeGreaterThanOrEqual(9);
    expect(BETA_GAME_MODES.length).toBeGreaterThanOrEqual(1);
    // Spot-check: alpha modes stay alpha
    expect(ALPHA_GAME_MODES).toContain('dual-memo');
    expect(ALPHA_GAME_MODES).toContain('maze');
    // Spot-check: beta modes
    expect(BETA_GAME_MODES).toContain('soroban');
    expect(BETA_GAME_MODES).not.toContain('dual-memo');
  });

  it('uses stable as the implicit default tier', () => {
    expect(getReliabilityForGameMode('dual-track')).toBe('stable');
    expect(getReliabilityForGameMode('soroban')).toBe('beta');
    expect(getReliabilityForGameMode('dual-memo')).toBe('alpha');
  });

  it('blocks alpha routes unless alpha access is enabled', () => {
    expect(
      isGameModeVisibleForAccess('dual-memo', {
        alphaEnabled: false,
        betaEnabled: true,
        prototypesEnabled: false,
      }),
    ).toBe(false);
    expect(
      isGameModeVisibleForAccess('soroban', {
        alphaEnabled: false,
        betaEnabled: false,
        prototypesEnabled: false,
      }),
    ).toBe(false);
    expect(
      isGameModeVisibleForAccess('soroban', {
        alphaEnabled: false,
        betaEnabled: true,
        prototypesEnabled: false,
      }),
    ).toBe(true);
  });
});
