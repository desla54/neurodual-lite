import type { ValidatedSettingsData } from '../schemas';

export type SettingsData = ValidatedSettingsData;

export interface SettingsSyncResult {
  success: boolean;
  direction: 'pushed' | 'pulled' | 'none';
  errorMessage?: string;
}

export interface SettingsSyncPort {
  pushSettings(settings: SettingsData, localUpdatedAt: number): Promise<SettingsSyncResult>;
  pullSettings(
    localUpdatedAt: number,
  ): Promise<{ settings: SettingsData; cloudUpdatedAt: number } | null>;
}
