import { describe, expect, it, beforeEach, mock, spyOn } from 'bun:test';
import { Capacitor } from '@capacitor/core';
import * as clientModule from './client';
import { supabaseAuthAdapter, __resetAuthAdapter } from './auth-adapter';

// Save original setTimeout
const originalSetTimeout = setTimeout;

// Mock window for OAuth tests
if (typeof (globalThis as Record<string, unknown>).window === 'undefined') {
  (globalThis as Record<string, unknown>).window = {
    location: { origin: 'http://localhost:3000' },
  };
}

// Valid UUIDs for Zod (v4 compliant)
const U1 = '11111111-1111-4111-8111-111111111111';
const P1 = '22222222-2222-4222-8222-222222222222';

// Mock Supabase Client
let authCallback: ((event: string, session: unknown) => void) | null = null;
const createSupabaseMock = () => {
  const mockUser = {
    id: U1,
    email: 't@t.com',
    created_at: '2023-01-01',
    app_metadata: { provider: 'email' },
    user_metadata: { username: 'testuser' },
    email_confirmed_at: '2023-01-01',
  };
  const m: Record<string, unknown> = {
    auth: {
      getUser: mock(() => Promise.resolve({ data: { user: mockUser } })),
      getSession: mock(() =>
        Promise.resolve({
          data: { session: { access_token: 'tk', refresh_token: 'rt', user: mockUser } },
          error: null,
        }),
      ),
      setSession: mock(() =>
        Promise.resolve({
          data: { session: { access_token: 'tk', refresh_token: 'rt', user: mockUser } },
          error: null,
        }),
      ),
      signUp: mock(() =>
        Promise.resolve({
          data: { user: mockUser, session: { access_token: 'tk', user: mockUser } },
          error: null,
        }),
      ),
      signInWithPassword: mock(() =>
        Promise.resolve({ data: { session: { access_token: 'tk', user: mockUser } }, error: null }),
      ),
      signInWithOAuth: mock(() =>
        Promise.resolve({ data: { url: 'https://example.com/oauth' }, error: null }),
      ),
      signOut: mock(() => Promise.resolve({ error: null })),
      updateUser: mock(() => Promise.resolve({ error: null })),
      resetPasswordForEmail: mock(() => Promise.resolve({ error: null })),
      refreshSession: mock(() =>
        Promise.resolve({
          data: { session: { access_token: 'new-tk', user: mockUser } },
          error: null,
        }),
      ),
      onAuthStateChange: mock((cb: (event: string, session: unknown) => void) => {
        authCallback = cb;
        return { data: { subscription: { unsubscribe: () => {} } } };
      }),
    },
    from: mock(() => m),
    select: mock(() => m),
    eq: mock(() => m),
    update: mock(() => m),
    single: mock(() =>
      Promise.resolve({
        data: { id: P1, auth_user_id: U1, username: 'testuser', avatar_id: 'a1' },
        error: null,
      }),
    ),
  };
  return m;
};

describe('AuthAdapter', () => {
  let supabaseMock: any;
  const isNativePlatformSpy = spyOn(Capacitor, 'isNativePlatform');

  beforeEach(() => {
    isNativePlatformSpy.mockReturnValue(false);
    __resetAuthAdapter();
    authCallback = null;
    supabaseMock = createSupabaseMock();
    spyOn(clientModule, 'getSupabase').mockReturnValue(supabaseMock as any);
    // Note: sync-service mock removed - auth-adapter uses callback pattern (setAuthSignOutCallback)
    // and is decoupled from sync implementation

    // Default mock behavior
    supabaseMock.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });

    // Mock localStorage
    const storage: Record<string, string> = {};
    global.localStorage = {
      getItem: mock((key: string) => storage[key] || null),
      setItem: mock((key: string, val: string) => {
        storage[key] = val;
      }),
      removeItem: mock((key: string) => {
        delete storage[key];
      }),
    } as any;
  });

  const wait = (ms: number) => new Promise((resolve) => originalSetTimeout(resolve, ms));
  const waitFor = async (predicate: () => boolean, timeoutMs = 1500, intervalMs = 10) => {
    const start = Date.now();
    while (!predicate()) {
      if (Date.now() - start > timeoutMs) {
        throw new Error('Timed out waiting for condition');
      }
      await wait(intervalMs);
    }
  };

  describe('Registration & Login', () => {
    it('should sign up successfully', async () => {
      const result = await supabaseAuthAdapter.signUp({
        email: 't@t.com',
        password: 'password',
        username: 'u',
      });
      expect(result.success).toBe(true);
      expect(supabaseMock.auth.signUp).toHaveBeenCalled();
    });

    it('should handle OAuth sign in', async () => {
      const result = await supabaseAuthAdapter.signInWithGoogle();
      expect(result.success).toBe(false); // Redirects
      expect(supabaseMock.auth.signInWithOAuth).toHaveBeenCalledWith({
        provider: 'google',
        options: expect.any(Object),
      });

      const redirectTo = supabaseMock.auth.signInWithOAuth.mock.calls[0][0].options.redirectTo;
      expect(redirectTo).toContain('/auth/callback');
      expect(redirectTo.startsWith('neurodual://')).toBe(false);
    });

    it('should use https redirect for OAuth fallback on native', async () => {
      isNativePlatformSpy.mockReturnValue(true);

      const result = await supabaseAuthAdapter.signInWithGoogle();
      expect(result.success).toBe(false); // Redirects

      const redirectTo = supabaseMock.auth.signInWithOAuth.mock.calls[0][0].options.redirectTo;
      expect(redirectTo).toBe('https://neurodual.com/auth/callback?lang=en&nd_native=1');
    });

    it('should map various errors', async () => {
      supabaseMock.auth.signInWithPassword.mockResolvedValue({
        error: { message: 'Invalid login credentials' },
      });
      const res1 = await supabaseAuthAdapter.signIn({ email: 't@t.com', password: 'p' });
      expect((res1 as any).error?.code).toBe('invalid_credentials');

      supabaseMock.auth.signInWithPassword.mockResolvedValue({
        error: { message: 'weak password' },
      });
      const res2 = await supabaseAuthAdapter.signIn({ email: 't@t.com', password: 'p' });
      expect((res2 as any).error?.code).toBe('weak_password');
    });
  });

  describe('Session Initialization', () => {
    it('should initialize and load profile on restored session', async () => {
      const mockUser = { id: U1, email: 't@t.com', created_at: '2023-01-01' };
      supabaseMock.auth.getSession.mockResolvedValue({
        data: { session: { access_token: 'tk', user: mockUser } },
        error: null,
      });
      supabaseMock.single.mockResolvedValue({
        data: { id: P1, auth_user_id: U1, username: 'test', avatar_id: 'a1' },
        error: null,
      });

      const state = supabaseAuthAdapter.getState();
      expect(state.status).toBe('loading');

      // Wait for async initialization (includes internal delays/retries)
      await waitFor(() => supabaseAuthAdapter.getState().status === 'authenticated');

      expect(supabaseAuthAdapter.getState().status).toBe('authenticated');
    });

    it('should keep session and show error if profile not found (repairable)', async () => {
      const mockUser = { id: U1, email: 't@t.com', created_at: '2023-01-01' };
      supabaseMock.auth.getSession.mockResolvedValue({
        data: { session: { access_token: 'tk', user: mockUser } },
        error: null,
      });
      supabaseMock.single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'Not found' },
      });

      supabaseAuthAdapter.getState();
      await waitFor(() => supabaseAuthAdapter.getState().status === 'error');
      expect(supabaseAuthAdapter.getState().status).toBe('error');
      expect(supabaseMock.auth.signOut).not.toHaveBeenCalled();
      expect(supabaseAuthAdapter.getState()).toMatchObject({
        status: 'error',
        error: 'auth.errors.profileMissing',
      });
    });

    it('should handle profile fetch errors and retries', async () => {
      const mockUser = { id: U1, email: 't@t.com', created_at: '2023-01-01' };
      supabaseMock.auth.getSession.mockResolvedValue({
        data: { session: { access_token: 'tk', user: mockUser } },
        error: null,
      });

      // Force error on profile fetch
      supabaseMock.single.mockResolvedValue({
        data: null,
        error: { message: 'Network error' },
      });

      supabaseAuthAdapter.getState();
      // Wait for multiple retries (1ms + 2ms + 3ms) + initial 50ms delay
      await waitFor(() => supabaseAuthAdapter.getState().status === 'error');

      // First error - status becomes 'error' but no signOut yet
      expect(supabaseAuthAdapter.getState().status).toBe('error');
      expect(supabaseMock.auth.signOut).not.toHaveBeenCalled();

      // Trigger second error to force signOut
      const session = { access_token: 'tk', user: mockUser };
      if (!authCallback) throw new Error('authCallback not captured');
      await authCallback('SIGNED_IN', session);
      await waitFor(() => supabaseMock.auth.signOut.mock.calls.length > 0);

      expect(supabaseMock.auth.signOut).toHaveBeenCalled();
      expect(supabaseAuthAdapter.getState().status).toBe('error');
    });
  });

  describe('Auth Events', () => {
    it('should handle SIGNED_IN event', async () => {
      supabaseAuthAdapter.getState(); // Starts init
      await waitFor(() => authCallback !== null); // Wait for onAuthStateChange to be installed

      if (!authCallback) throw new Error('Auth callback not captured');

      const mockUser = { id: U1, email: 't@t.com', created_at: '2023-01-01' };
      const session = { access_token: 'tk2', user: mockUser };

      // Reset mocks for the next call
      supabaseMock.single.mockResolvedValue({
        data: { id: P1, auth_user_id: U1, username: 'test', avatar_id: 'a1' },
        error: null,
      });

      await authCallback('SIGNED_IN', session);
      await waitFor(() => supabaseAuthAdapter.getState().status === 'authenticated');

      expect(supabaseAuthAdapter.getState().status).toBe('authenticated');
    });
  });

  describe('Profile & Account', () => {
    it('should update profile and local state', async () => {
      const mockUser = { id: U1, email: 't@t.com', created_at: '2023-01-01' };
      supabaseMock.auth.getUser.mockResolvedValue({ data: { user: mockUser } });

      // Initialize as authenticated
      supabaseMock.auth.getSession.mockResolvedValue({
        data: { session: { access_token: 'tk', user: mockUser } },
        error: null,
      });
      supabaseAuthAdapter.getState();
      await waitFor(() => supabaseAuthAdapter.getState().status === 'authenticated');

      const newProfile = { id: P1, auth_user_id: U1, username: 'newname', avatar_id: 'a1' };
      supabaseMock.single.mockResolvedValue({ data: newProfile, error: null });
      supabaseMock.update.mockReturnValue(supabaseMock);
      supabaseMock.eq.mockReturnValue(supabaseMock);
      supabaseMock.select.mockReturnValue(supabaseMock);
      supabaseMock.single.mockResolvedValue({ data: newProfile, error: null });

      const result = await supabaseAuthAdapter.updateProfile({ username: 'newname' });
      expect(result.success).toBe(true);
      const state = supabaseAuthAdapter.getState();
      if (state.status !== 'authenticated') throw new Error('State should be authenticated');
      expect(state.profile.username).toBe('newname');
    });
  });
});
