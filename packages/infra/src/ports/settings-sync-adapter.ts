import type { SettingsSyncPort } from '@neurodual/logic';
import { pullSettings, pushSettings } from '../supabase/settings-sync-service';

export const settingsSyncAdapter: SettingsSyncPort = {
  pullSettings: async (localUpdatedAt: number) => pullSettings(localUpdatedAt),
  pushSettings: async (settings, localUpdatedAt: number) => pushSettings(settings, localUpdatedAt),
};
