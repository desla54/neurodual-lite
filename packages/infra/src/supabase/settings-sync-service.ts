/**
 * Settings Sync Service
 *
 * Syncs user settings (mode preferences, UI settings) to Supabase.
 * Only available for Pro+Cloud subscribers.
 *
 * Strategy: Last-Write-Wins based on client_updated_at timestamp.
 */

import { safeParseWithLog, SettingsDataSchema, type ValidatedSettingsData } from '@neurodual/logic';
import { getSupabase } from './client';
import { supabaseSubscriptionAdapter } from './subscription-adapter';
import { settingsSyncLog } from '../logger';
import type { Json } from './types';

// =============================================================================
// Types
// =============================================================================

/**
 * Settings data type - re-exported from logic for backwards compatibility.
 * Uses Zod schema as Single Source of Truth.
 */
export type SettingsData = ValidatedSettingsData;

// =============================================================================
// Cloud Settings Validation
// =============================================================================

/**
 * Default UI settings for missing fields.
 */
const DEFAULT_UI_SETTINGS: Record<string, unknown> = {
  stimulusStyle: 'full',
  stimulusColor: 'black',
  customImageUrl: null,
  stringArtPoints: 10,
  buttonSoundsEnabled: true,
  soundEnabled: false,
  voiceId: 1,
  audioLanguage: 'auto',
  audioSyncPreset: 'default',
  pinkNoiseLevel: 0.15,
  binauralCarrierHz: 200,
  usingBluetoothHeadphones: false,
  hasSeenPinkNoiseToast: false,
  hapticEnabled: true,
  hapticIntensity: 'medium',
  trainingRemindersEnabled: false,
  trainingReminderTime: '20:00',
  trainingReminderWeekdays: [2, 3, 4, 5, 6],
  language: 'fr',
  tutorialCompleted: false,
  journeyActive: true,
  homeTab: 'journey',
  challengeTotalDays: 20,
  challengeTargetMinutesPerDay: 15,
  challengeStartedAtDay: null,
  challengeHasProgress: false,
  journeyStartLevel: 1,
  journeyTargetLevel: 5,
  betaEnabled: false,
  alphaEnabled: false,
  adminEnabled: false,
  activeJourneyId: 'dualnback-classic-journey',
  darkMode: false,
  accentPreset: 'theme',
  textScalePercent: 100,
  showThemeToggleInGame: true,
  reducedMotion: false,
  sessionRecoveryEnabled: false,
  traceIsiMs: 2500,
  traceStimulusDurationMs: 1000,
  traceFeedbackDurationMs: 1000,
  traceRuleDisplayMs: 1000,
  traceIntervalMs: 500,
  traceAdaptiveTimingEnabled: false,
  traceWritingInputMethod: 'auto',
  shareAnonymousStats: true,
  completedTutorials: [],
  sidebarPinned: false,
  freeTrainingPresetsByMode: {},
  freeTrainingActivePresetIdByMode: {},
  freeTrainingDefaultPresetIdByMode: {},
  journeyPresetsByJourneyId: {},
  journeyActivePresetIdByJourneyId: {},
  journeyDefaultPresetIdByJourneyId: {},
  journeyModeSettingsByJourneyId: {},
  gridScale: 1.0,
  controlsScale: 1.0,
  tempoGridStyle: 'classic',
  gameLayoutOrder: ['header', 'game', 'controls'],
  gameButtonOrder: null,
  gameZoneHeights: null,
  gameZoneLayouts: null,
  gameButtonLayouts: null,
  statsMode: 'all',
  statsNLevels: [],
  statsModalities: [],
  statsDateOption: 'all',
  statsTab: 'history',
  statsJourneyFilter: 'all',
  statsFreeModeFilter: 'all',
  binauralMuteShownCount: 0,
  favoriteModes: ['dualnback-classic', 'sim-brainworkshop', 'dual-track', 'dual-trace'],
};

/**
 * Validate and normalize cloud settings.
 *
 * Note: Old mode IDs (adaptive, libre, etc.) are migrated server-side via SQL migration.
 * This function only handles missing fields and invalid structures.
 *
 * @param rawData - Raw data from cloud (unknown structure)
 * @returns Validated SettingsData or null if validation impossible
 */
export function migrateCloudSettings(rawData: unknown): SettingsData | null {
  if (!rawData || typeof rawData !== 'object') {
    settingsSyncLog.warn('Cloud settings is not an object, returning null');
    return null;
  }

  const data = rawData as Record<string, unknown>;

  const savedJourneys = Array.isArray(data['savedJourneys']) ? data['savedJourneys'] : [];

  // Valid format: has modes, ui, and currentMode
  if ('modes' in data && 'ui' in data && 'currentMode' in data) {
    return {
      currentMode: (data['currentMode'] as string) ?? 'dual-catch',
      savedJourneys: savedJourneys as SettingsData['savedJourneys'],
      modes: (data['modes'] as Record<string, Record<string, unknown>>) ?? {},
      ui: { ...DEFAULT_UI_SETTINGS, ...((data['ui'] as Record<string, unknown>) ?? {}) },
    };
  }

  // Partial format: has currentMode but missing modes/ui
  if ('currentMode' in data) {
    settingsSyncLog.info('Normalizing partial cloud settings format');
    return {
      currentMode: (data['currentMode'] as string) ?? 'dual-catch',
      savedJourneys: savedJourneys as SettingsData['savedJourneys'],
      modes: (data['modes'] as Record<string, Record<string, unknown>>) ?? {},
      ui: { ...DEFAULT_UI_SETTINGS, ...((data['ui'] as Record<string, unknown>) ?? {}) },
    };
  }

  settingsSyncLog.warn('Unknown cloud settings format, returning defaults');
  return {
    currentMode: 'dual-catch',
    savedJourneys: [],
    modes: {},
    ui: { ...DEFAULT_UI_SETTINGS },
  };
}

export interface SettingsSyncResult {
  success: boolean;
  direction: 'pushed' | 'pulled' | 'none';
  errorMessage?: string;
}

// =============================================================================
// Settings Sync Service
// =============================================================================

/**
 * Push local settings to cloud.
 * Uses atomic upsert that only updates if local is newer than cloud.
 *
 * This avoids the TOCTOU (Time-Of-Check-To-Time-Of-Use) race condition
 * that would occur with a separate SELECT + UPSERT pattern.
 */
export async function pushSettings(
  settings: SettingsData,
  localUpdatedAt: number,
): Promise<SettingsSyncResult> {
  // Check if cloud sync is available
  const subscriptionState = supabaseSubscriptionAdapter.getState();
  if (!subscriptionState.hasCloudSync) {
    return {
      success: false,
      direction: 'none',
      errorMessage: 'Cloud sync not available for your plan',
    };
  }

  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      success: false,
      direction: 'none',
      errorMessage: 'Not authenticated',
    };
  }

  try {
    // Atomic upsert: only updates if local timestamp is newer than cloud
    // This is done in a single PostgreSQL function call to prevent race conditions
    const { data: wasUpdated, error } = await supabase.rpc('upsert_settings_if_newer', {
      p_user_id: user.id,
      p_config: settings as unknown as Json,
      p_client_updated_at: localUpdatedAt,
    });

    if (error) {
      settingsSyncLog.error('Push failed:', error);
      return {
        success: false,
        direction: 'none',
        errorMessage: error.message,
      };
    }

    if (wasUpdated) {
      settingsSyncLog.info('Settings pushed to cloud');
      return { success: true, direction: 'pushed' };
    }

    // Cloud was newer, no update performed
    settingsSyncLog.debug('Cloud settings are newer, skipped push');
    return { success: true, direction: 'none' };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Push failed';
    return { success: false, direction: 'none', errorMessage };
  }
}

/**
 * Pull settings from cloud.
 * Returns null if no cloud settings or local is newer.
 */
export async function pullSettings(
  localUpdatedAt: number,
): Promise<{ settings: SettingsData; cloudUpdatedAt: number } | null> {
  // Check if cloud sync is available
  const subscriptionState = supabaseSubscriptionAdapter.getState();
  if (!subscriptionState.hasCloudSync) {
    return null;
  }

  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('settings')
      .select('config, client_updated_at')
      .eq('user_id', user.id)
      .single();

    if (error || !data) {
      // No settings in cloud yet
      return null;
    }

    const cloudUpdatedAt = data.client_updated_at ?? 0;

    // If local is newer or equal, don't pull
    if (localUpdatedAt >= cloudUpdatedAt) {
      return null;
    }

    // Step 1: Migrate cloud data to current format (handles old schemas)
    const migratedSettings = migrateCloudSettings(data.config);
    if (!migratedSettings) {
      settingsSyncLog.error('Failed to migrate cloud settings, ignoring');
      return null;
    }

    // Step 2: Validate migrated data with Zod (should always pass after migration)
    const parseResult = safeParseWithLog(SettingsDataSchema, migratedSettings, 'pullSettings');
    if (!parseResult.success) {
      settingsSyncLog.error('Migrated settings still invalid, ignoring');
      return null;
    }

    settingsSyncLog.info('Settings pulled and migrated from cloud');
    return {
      settings: parseResult.data,
      cloudUpdatedAt,
    };
  } catch (err) {
    settingsSyncLog.error('Pull failed:', err);
    return null;
  }
}

/**
 * Bidirectional sync: pull if cloud is newer, push if local is newer.
 */
export async function syncSettings(
  localSettings: SettingsData,
  localUpdatedAt: number,
  onPull: (settings: SettingsData) => void,
): Promise<SettingsSyncResult> {
  // Try to pull first
  const pulled = await pullSettings(localUpdatedAt);

  if (pulled) {
    // Cloud is newer, apply it locally
    onPull(pulled.settings);
    return { success: true, direction: 'pulled' };
  }

  // Local is newer or no cloud data, push
  return pushSettings(localSettings, localUpdatedAt);
}
