import { describe, expect, it } from 'bun:test';

import {
  DEFAULT_TEST_MODE,
  DEFAULT_TRAINING_MODE,
  GAME_MODES,
  MODE_CATEGORIES,
  TEST_GAME_MODES,
  TRAINING_GAME_MODES,
  getGameModeSection,
  isTestGameMode,
  isTrainingGameMode,
} from './game-modes';

describe('game mode sectioning', () => {
  it('classifies every mode exactly once', () => {
    const allClassifiedModes = [...TRAINING_GAME_MODES, ...TEST_GAME_MODES];

    expect(allClassifiedModes).toHaveLength(GAME_MODES.length);
    expect(new Set(allClassifiedModes).size).toBe(GAME_MODES.length);
  });

  it('keeps category sections aligned with per-mode classification', () => {
    for (const category of MODE_CATEGORIES) {
      for (const mode of category.modes) {
        expect(getGameModeSection(mode)).toBe(category.section);
      }
    }
  });

  it('keeps representative modes in the expected family', () => {
    expect(isTrainingGameMode('dualnback-classic')).toBe(true);
    expect(isTrainingGameMode('dual-track')).toBe(true);
    expect(isTestGameMode('ant')).toBe(true);
    expect(isTestGameMode('eyes-test')).toBe(true);
    expect(getGameModeSection(DEFAULT_TRAINING_MODE)).toBe('training');
    expect(getGameModeSection(DEFAULT_TEST_MODE)).toBe('test');
  });
});
