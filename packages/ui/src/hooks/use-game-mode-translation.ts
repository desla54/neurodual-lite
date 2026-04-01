/**
 * useGameModeTranslation Hook
 *
 * Provides translation functions for game mode names and descriptions.
 * Maps GameModeId to i18n keys from stats.mode namespace.
 * Falls back to spec.displayName if no translation found.
 *
 * Uses canonical mode IDs.
 */

import { useTranslation } from 'react-i18next';
import { normalizeModeId, type GameModeId } from '@neurodual/logic';

/**
 * Maps canonical GameModeId to i18n key prefix in stats.mode.
 */
const GAME_MODE_KEYS: Record<string, string> = {
  // Current IDs → i18n keys
  'dualnback-classic': 'dualnbackClassic',
  'sim-brainworkshop': 'brainWorkshop',
  custom: 'libre',
  // Special modes
  journey: 'journey',
  tutorial: 'tutorial',
  stats: 'stats',
};

export function useGameModeTranslation() {
  const { t } = useTranslation();

  return {
    /**
     * Get the translated game mode name
     * Falls back to the provided displayName if no translation exists.
     */
    getModeName: (mode: GameModeId, fallbackDisplayName?: string): string => {
      const normalizedMode = normalizeModeId(mode);
      const key = GAME_MODE_KEYS[normalizedMode];
      if (!key) return fallbackDisplayName ?? mode;
      return t(`stats.mode.${key}`, { defaultValue: fallbackDisplayName ?? mode });
    },

    /**
     * Get the translated game mode description
     * Falls back to the provided description if no translation exists.
     */
    getModeDescription: (mode: GameModeId, fallbackDescription?: string): string => {
      const normalizedMode = normalizeModeId(mode);
      const key = GAME_MODE_KEYS[normalizedMode];
      if (!key) return fallbackDescription ?? '';
      return t(`stats.mode.${key}Desc`, { defaultValue: fallbackDescription ?? '' });
    },
  };
}
