import { describe, it, expect, mock, beforeEach } from 'bun:test';

// --- Mocks ---

let mockIsNative = false;
let mockPlatform = 'web';

const mockInitialize = mock(() => Promise.resolve());
const mockLogin = mock(() =>
  Promise.resolve({ result: { idToken: 'mock-id-token', identityToken: 'mock-identity-token' } }),
);
const mockLogout = mock(() => Promise.resolve());

mock.module('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => mockIsNative,
    getPlatform: () => mockPlatform,
  },
}));

mock.module('@capgo/capacitor-social-login', () => ({
  SocialLogin: {
    initialize: mockInitialize,
    login: mockLogin,
    logout: mockLogout,
  },
}));

mock.module('../logger', () => ({
  authLog: {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  },
}));

// Module has top-level state (initialized, initPromise, initializedProviders).
// State persists across tests within a single file. Tests are ordered as a
// progressive scenario: web → init on iOS with google+apple → login → logout.

import {
  initNativeSocialLogin,
  isNativeSocialLoginAvailable,
  isNativeSocialLoginProviderAvailable,
  nativeGoogleLogin,
  nativeAppleLogin,
  nativeSocialLogout,
} from './native-social-login';
import type {
  NativeLoginResult,
  NativeLoginError,
  NativeLoginResponse,
} from './native-social-login';

describe('native-social-login', () => {
  beforeEach(() => {
    mockInitialize.mockClear();
    mockLogin.mockClear();
    mockLogout.mockClear();
  });

  // ─── Phase 1: Before initialization ────────────────────────────────

  describe('before initialization', () => {
    it('isNativeSocialLoginAvailable returns false on non-native', () => {
      mockIsNative = false;
      expect(isNativeSocialLoginAvailable()).toBe(false);
    });

    it('isNativeSocialLoginAvailable returns false on native (not yet initialized)', () => {
      mockIsNative = true;
      expect(isNativeSocialLoginAvailable()).toBe(false);
    });

    it('isNativeSocialLoginProviderAvailable returns false for any provider', () => {
      mockIsNative = true;
      expect(isNativeSocialLoginProviderAvailable('google')).toBe(false);
      expect(isNativeSocialLoginProviderAvailable('apple')).toBe(false);
    });

    it('nativeGoogleLogin returns not available before init', async () => {
      mockIsNative = true;
      const result = await nativeGoogleLogin();
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('not available');
      }
    });

    it('nativeAppleLogin returns not available before init', async () => {
      mockIsNative = true;
      const result = await nativeAppleLogin();
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('not available');
      }
    });
  });

  // ─── Phase 2: Initialization ───────────────────────────────────────

  describe('initNativeSocialLogin', () => {
    it('skips init on non-native platform', async () => {
      mockIsNative = false;
      mockPlatform = 'web';
      await initNativeSocialLogin({ googleWebClientId: 'test-client-id' });
      expect(mockInitialize).not.toHaveBeenCalled();
    });

    it('initializes with google and apple config on iOS', async () => {
      mockIsNative = true;
      mockPlatform = 'ios';
      await initNativeSocialLogin({ googleWebClientId: 'test-client-id' });
      expect(mockInitialize).toHaveBeenCalledTimes(1);
      const config = (mockInitialize.mock.calls as any)[0][0] as {
        google?: { webClientId: string };
        apple?: { clientId: string };
      };
      expect(config.google).toEqual({ webClientId: 'test-client-id' });
      // On iOS, apple gets default clientId
      expect(config.apple).toBeDefined();
      expect(config.apple?.clientId).toBe('com.neurodual.app');
    });

    it('does not re-initialize once already initialized', async () => {
      mockIsNative = true;
      mockPlatform = 'ios';
      await initNativeSocialLogin({ googleWebClientId: 'second-call' });
      // Should not call initialize again since already initialized
      expect(mockInitialize).not.toHaveBeenCalled();
    });
  });

  // ─── Phase 3: After initialization ─────────────────────────────────

  describe('after successful initialization', () => {
    it('isNativeSocialLoginAvailable returns true on native', () => {
      mockIsNative = true;
      expect(isNativeSocialLoginAvailable()).toBe(true);
    });

    it('isNativeSocialLoginAvailable returns false on non-native even when initialized', () => {
      mockIsNative = false;
      expect(isNativeSocialLoginAvailable()).toBe(false);
    });

    it('isNativeSocialLoginProviderAvailable returns true for google', () => {
      mockIsNative = true;
      expect(isNativeSocialLoginProviderAvailable('google')).toBe(true);
    });

    it('isNativeSocialLoginProviderAvailable returns true for apple (initialized on iOS)', () => {
      mockIsNative = true;
      expect(isNativeSocialLoginProviderAvailable('apple')).toBe(true);
    });

    it('isNativeSocialLoginProviderAvailable returns false on non-native', () => {
      mockIsNative = false;
      expect(isNativeSocialLoginProviderAvailable('google')).toBe(false);
    });
  });

  // ─── Phase 4: Google login calls ───────────────────────────────────

  describe('nativeGoogleLogin (after init)', () => {
    it('returns success with idToken on successful login', async () => {
      mockIsNative = true;
      mockLogin.mockResolvedValueOnce({
        result: { idToken: 'google-token-123', identityToken: 'google-token-123' },
      });
      const result = await nativeGoogleLogin();
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.provider).toBe('google');
        expect(result.idToken).toBe('google-token-123');
      }
    });

    it('returns error when no idToken in response', async () => {
      mockIsNative = true;
      mockLogin.mockResolvedValueOnce({ result: {} as any });
      const result = await nativeGoogleLogin();
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('No ID token');
      }
    });

    it('returns error with cancelled flag on user cancellation', async () => {
      mockIsNative = true;
      mockLogin.mockRejectedValueOnce(new Error('user_cancelled'));
      const result = await nativeGoogleLogin();
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.cancelled).toBe(true);
        expect(result.error).toContain('user_cancelled');
      }
    });

    it('returns error on plugin failure', async () => {
      mockIsNative = true;
      mockLogin.mockRejectedValueOnce(new Error('Network error'));
      const result = await nativeGoogleLogin();
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Network error');
        expect(result.cancelled).toBe(false);
      }
    });

    it('returns not available when not on native platform', async () => {
      mockIsNative = false;
      const result = await nativeGoogleLogin();
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('not available');
      }
    });
  });

  // ─── Phase 5: Apple login calls ────────────────────────────────────

  describe('nativeAppleLogin (after init)', () => {
    it('returns success with identityToken on successful login', async () => {
      mockIsNative = true;
      mockLogin.mockResolvedValueOnce({
        result: { identityToken: 'apple-token-456', idToken: 'apple-token-456' },
      });
      const result = await nativeAppleLogin();
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.provider).toBe('apple');
        expect(result.idToken).toBe('apple-token-456');
      }
    });

    it('returns error when no identityToken in response', async () => {
      mockIsNative = true;
      mockLogin.mockResolvedValueOnce({ result: {} as any });
      const result = await nativeAppleLogin();
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('No identity token');
      }
    });

    it('returns error with cancelled flag on Cancel', async () => {
      mockIsNative = true;
      mockLogin.mockRejectedValueOnce(new Error('Cancel'));
      const result = await nativeAppleLogin();
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.cancelled).toBe(true);
      }
    });

    it('returns error on non-cancellation failure', async () => {
      mockIsNative = true;
      mockLogin.mockRejectedValueOnce(new Error('Server unavailable'));
      const result = await nativeAppleLogin();
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Server unavailable');
        expect(result.cancelled).toBe(false);
      }
    });
  });

  // ─── Phase 6: Logout ──────────────────────────────────────────────

  describe('nativeSocialLogout', () => {
    it('calls logout for both providers on native', async () => {
      mockIsNative = true;
      await nativeSocialLogout();
      expect(mockLogout).toHaveBeenCalledTimes(2);
      expect(mockLogout).toHaveBeenCalledWith({ provider: 'google' });
      expect(mockLogout).toHaveBeenCalledWith({ provider: 'apple' });
    });

    it('skips logout on non-native platform', async () => {
      mockIsNative = false;
      await nativeSocialLogout();
      expect(mockLogout).not.toHaveBeenCalled();
    });

    it('does not throw when logout fails', async () => {
      mockIsNative = true;
      mockLogout.mockRejectedValue(new Error('Logout failed'));
      await expect(nativeSocialLogout()).resolves.toBeUndefined();
    });
  });

  // ─── Type contracts ────────────────────────────────────────────────

  describe('type contracts', () => {
    it('NativeLoginResult has success=true, provider, and idToken', () => {
      const result: NativeLoginResult = {
        success: true,
        provider: 'google',
        idToken: 'token',
      };
      expect(result.success).toBe(true);
      expect(result.provider).toBe('google');
      expect(result.idToken).toBe('token');
    });

    it('NativeLoginError has success=false, error, and optional cancelled', () => {
      const result: NativeLoginError = {
        success: false,
        error: 'some error',
        cancelled: true,
      };
      expect(result.success).toBe(false);
      expect(result.error).toBe('some error');
      expect(result.cancelled).toBe(true);
    });

    it('NativeLoginResponse is a discriminated union', () => {
      const check = (r: NativeLoginResponse) => {
        if (r.success) {
          return r.idToken;
        }
        return r.error;
      };
      expect(check({ success: true, provider: 'apple', idToken: 'tok' })).toBe('tok');
      expect(check({ success: false, error: 'err' })).toBe('err');
    });
  });
});
