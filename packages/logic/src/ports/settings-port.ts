/**
 * SettingsPort
 *
 * Interface for user settings persistence.
 * Implemented by infra (SQLite), consumed by apps/web.
 *
 * Settings are stored in SQLite as JSON, making them:
 * - Syncable with Supabase (same schema)
 * - Persistent across sessions
 * - Available on all platforms (web, Android, iOS)
 */

// =============================================================================
// Types
// =============================================================================

/**
 * User settings data structure.
 * This is the raw JSON stored in SQLite.
 */
export interface UserSettings {
  readonly currentMode: string;
  readonly freeTraining?: {
    readonly selectedModeId: string;
  };
  readonly journeyUi?: {
    readonly selectedJourneyId: string;
  };
  readonly savedJourneys: readonly SavedJourney[];
  readonly modes: Record<string, Record<string, unknown>>;
  readonly ui: UISettings;
}

export interface SavedJourney {
  readonly id: string;
  readonly name: string;
  readonly startLevel: number;
  readonly targetLevel: number;
  readonly isDefault: boolean;
  readonly createdAt: number;
  readonly gameMode?: string;
  readonly strategyConfig?: {
    readonly hybrid?: {
      readonly trackSessionsPerBlock?: number;
      readonly dnbSessionsPerBlock?: number;
    };
  };
}

export interface UISettings {
  readonly stimulusStyle: 'full' | 'dots' | 'stringart' | 'custom';
  readonly stimulusColor: string;
  readonly customImageUrl: string | null;
  readonly stringArtPoints: number;
  readonly soundEnabled: boolean;
  readonly voiceId: number;
  readonly audioLanguage: string;
  readonly hapticEnabled: boolean;
  readonly language: string;
  readonly tutorialCompleted: boolean;
  readonly journeyActive: boolean;
  readonly journeyStartLevel: number;
  readonly journeyTargetLevel: number;
  readonly alphaEnabled: boolean;
  readonly activeJourneyId: string;
  /** List of completed tutorial spec IDs */
  readonly completedTutorials: readonly string[];
}

// =============================================================================
// Port
// =============================================================================

export interface SettingsPort {
  /**
   * Get current settings for a user.
   * Returns null if no settings exist (first launch).
   */
  getSettings(userId?: string): Promise<UserSettings | null>;

  /**
   * Save settings for a user.
   * Uses UPSERT (insert or update).
   */
  saveSettings(settings: UserSettings, userId?: string): Promise<void>;
}
