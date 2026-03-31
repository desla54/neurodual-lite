/**
 * Settings Adapter
 *
 * Implements SettingsPort using SQLite.
 * This adapter replaces localStorage persistence with SQLite.
 *
 * Benefits:
 * - Settings now syncable with Supabase (same schema)
 * - Consistent with other data (events, sessions)
 * - Works identically on web, Android, iOS
 */

import type { SettingsStorePort, SettingsPort, UserSettings } from '@neurodual/logic';
import { isLikelyClosedPowerSyncError } from '../powersync/runtime-policy';

// =============================================================================
// Factory (Injection-based)
// =============================================================================

/**
 * Create a SettingsPort with explicit persistence injection.
 */
export function createSettingsAdapter(persistence: SettingsStorePort): SettingsPort {
  return {
    async getSettings(_userId = 'local'): Promise<UserSettings | null> {
      let config: Record<string, unknown> | null = null;
      try {
        config = await persistence.getSettings();
      } catch (err) {
        // In some environments (dev/HMR, background restore), persistence can temporarily
        // reject calls with a closed/invalid state. Treat as "no settings" and let
        // the app proceed with defaults.
        if (isLikelyClosedPowerSyncError(err)) {
          return null;
        }
        throw err;
      }

      if (!config) {
        return null;
      }

      return config as unknown as UserSettings;
    },

    async saveSettings(settings: UserSettings, _userId = 'local'): Promise<void> {
      try {
        await persistence.saveSettings(settings as unknown as Record<string, unknown>);
      } catch (err) {
        if (isLikelyClosedPowerSyncError(err)) {
          return;
        }
        throw err;
      }
    },
  };
}
