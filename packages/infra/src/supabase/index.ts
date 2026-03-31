/**
 * Supabase Module
 *
 * Exports Supabase client and adapters.
 */

export { getSupabase, initSupabase, isSupabaseConfigured } from './client';
export { noopAuthAdapter, noopSubscriptionAdapter, noopSyncAdapter } from './noop-adapters';
export { supabaseAuthAdapter, setAuthSignOutCallback } from './auth-adapter';
export { supabaseSubscriptionAdapter } from './subscription-adapter';
export { freeSubscriptionAdapter } from './free-subscription-adapter';
// Admin functions (direct Supabase operations, not PowerSync)
export {
  deleteAllUserData,
  cleanupOrphanSessions,
  forceFullResync,
} from './supabase-admin';
export {
  pullSettings,
  pushSettings,
  syncSettings,
  type SettingsData,
  type SettingsSyncResult,
} from './settings-sync-service';
export type { Database, Tables, TablesInsert, TablesUpdate } from './types';
