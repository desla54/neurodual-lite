/**
 * Supabase stubs (NeuroDual Lite - cloud sync removed)
 *
 * These stubs provide no-op implementations so that existing code
 * referencing Supabase auth/subscription adapters continues to compile.
 * All auth calls return 'unauthenticated' / null.
 */

export interface AuthState {
  status: 'authenticated' | 'unauthenticated';
  session: { user: { id: string } } | null;
}

export interface SubscriptionState {
  tier: string;
  hasCloudSync: boolean;
}

export const supabaseAuthAdapter = {
  getState(): AuthState {
    return { status: 'unauthenticated', session: null };
  },
};

export const supabaseSubscriptionAdapter = {
  getState(): SubscriptionState {
    return { tier: 'free', hasCloudSync: false };
  },
};
