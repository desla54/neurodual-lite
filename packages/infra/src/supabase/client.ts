/**
 * Supabase client stubs (NeuroDual Lite - cloud sync removed)
 *
 * isSupabaseConfigured() always returns false.
 * getSupabase() throws — should never be called when isSupabaseConfigured() is false.
 */

export function isSupabaseConfigured(): boolean {
  return false;
}

export function getSupabase(): { functions: { invoke: <T = unknown>(...args: unknown[]) => Promise<{ data: T | null; error: { message: string } | null }> } } {
  throw new Error('[NeuroDual Lite] Supabase is not available in Lite mode');
}
