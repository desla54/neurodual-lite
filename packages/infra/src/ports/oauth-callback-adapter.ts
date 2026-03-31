import type { OAuthCallbackPort, OAuthCodeExchangeResult } from '@neurodual/logic';
import { getSupabase, isSupabaseConfigured } from '../supabase/client';

export const oauthCallbackAdapter: OAuthCallbackPort = {
  async exchangeCodeForSession(code: string): Promise<OAuthCodeExchangeResult> {
    if (!isSupabaseConfigured()) {
      return { success: false, errorMessage: 'Supabase not configured' };
    }

    try {
      const supabase = getSupabase();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        // On web, detectSessionInUrl (enabled in client.ts) may have already
        // consumed this code. If a session exists regardless, treat as success.
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session) {
          return { success: true };
        }
        return { success: false, errorMessage: error.message };
      }
      return { success: true };
    } catch (error) {
      return {
        success: false,
        errorMessage: error instanceof Error ? error.message : String(error),
      };
    }
  },
};
