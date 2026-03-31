/**
 * OAuthCallbackPort
 *
 * Handles OAuth redirect callbacks that require exchanging a PKCE code
 * for a session (eg. Supabase auth.exchangeCodeForSession).
 */

export type OAuthCodeExchangeResult =
  | { success: true }
  | {
      success: false;
      errorMessage: string;
    };

export interface OAuthCallbackPort {
  exchangeCodeForSession(code: string): Promise<OAuthCodeExchangeResult>;
}
