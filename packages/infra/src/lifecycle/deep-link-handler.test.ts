import { describe, expect, it, beforeEach, mock } from 'bun:test';

// Mock Capacitor before importing the module
mock.module('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => false,
  },
}));

mock.module('../logger', () => ({
  lifecycleLog: {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  },
}));

// We need to test the private parseDeepLinkUrl and isValidRoute functions.
// Since they are not exported, we test them indirectly through DeepLinkHandler.
// However, for thorough unit testing we re-import and access via the class.
// Let's test what we can through the public API and the handler behavior.

import { DeepLinkHandler } from './deep-link-handler';

// =============================================================================
// Since parseDeepLinkUrl and isValidRoute are private, we extract them
// by creating a handler and observing navigation calls.
// =============================================================================

describe('DeepLinkHandler', () => {
  describe('parseDeepLinkUrl (via handleUrl)', () => {
    let navigatedPath: string | null;
    let handler: DeepLinkHandler;

    beforeEach(() => {
      navigatedPath = null;
      handler = new DeepLinkHandler((path) => {
        navigatedPath = path;
      });
    });

    // We access the private handleUrl method for testing
    const callHandleUrl = (handler: DeepLinkHandler, url: string) => {
      (handler as unknown as { handleUrl(url: string): void }).handleUrl(url);
    };

    it('should parse neurodual:// custom scheme URLs', () => {
      callHandleUrl(handler, 'neurodual://auth/callback?code=abc123');
      expect(navigatedPath).toBe('/auth/callback?code=abc123');
    });

    it('should parse https:// universal link URLs', () => {
      callHandleUrl(handler, 'https://neurodual.com/auth/reset-password?token=xyz');
      expect(navigatedPath).toBe('/auth/reset-password?token=xyz');
    });

    it('should parse capacitor://localhost URLs', () => {
      callHandleUrl(handler, 'capacitor://localhost/auth/callback');
      expect(navigatedPath).toBe('/auth/callback');
    });

    it('should preserve query strings', () => {
      callHandleUrl(handler, 'neurodual://auth/callback?code=abc&state=def');
      expect(navigatedPath).toBe('/auth/callback?code=abc&state=def');
    });

    it('should preserve hash fragments (for Supabase auth)', () => {
      callHandleUrl(handler, 'https://neurodual.com/auth/callback#access_token=xyz&type=recovery');
      expect(navigatedPath).toBe('/auth/callback#access_token=xyz&type=recovery');
    });

    it('should navigate to / for unknown routes', () => {
      callHandleUrl(handler, 'neurodual://unknown/page');
      expect(navigatedPath).toBe('/');
    });

    it('should navigate to / for completely invalid URL parts', () => {
      callHandleUrl(handler, 'https://neurodual.com/some-random-page');
      expect(navigatedPath).toBe('/');
    });
  });

  describe('isValidRoute (via handleUrl)', () => {
    let navigatedPath: string | null;
    let handler: DeepLinkHandler;

    const callHandleUrl = (handler: DeepLinkHandler, url: string) => {
      (handler as unknown as { handleUrl(url: string): void }).handleUrl(url);
    };

    beforeEach(() => {
      navigatedPath = null;
      handler = new DeepLinkHandler((path) => {
        navigatedPath = path;
      });
    });

    const validRoutes = [
      '/auth/callback',
      '/auth/reset-password',
      '/nback',
      '/dual-place',
      '/dual-memo',
      '/dual-pick',
      '/dual-trace',
      '/stats',
      '/settings',
      '/tutorial',
      '/replay',
    ];

    for (const route of validRoutes) {
      it(`should accept valid route: ${route}`, () => {
        callHandleUrl(handler, `https://neurodual.com${route}`);
        expect(navigatedPath).toBe(route);
      });
    }

    it('should accept routes with subpaths', () => {
      callHandleUrl(handler, 'https://neurodual.com/settings/account');
      expect(navigatedPath).toBe('/settings/account');
    });

    it('should reject unknown routes and navigate to /', () => {
      callHandleUrl(handler, 'https://neurodual.com/admin/panel');
      expect(navigatedPath).toBe('/');
    });

    it('should reject root path and navigate to /', () => {
      callHandleUrl(handler, 'https://neurodual.com/');
      expect(navigatedPath).toBe('/');
    });
  });

  describe('dispose', () => {
    it('can be called multiple times safely', () => {
      const handler = new DeepLinkHandler(() => {});
      handler.dispose();
      handler.dispose();
      // No error
      expect(true).toBe(true);
    });
  });

  describe('init on web platform', () => {
    it('should skip initialization on web platform', async () => {
      const navigateFn = mock(() => {});
      const handler = new DeepLinkHandler(navigateFn);
      await handler.init();
      // On web, init is a no-op, so navigate should never be called
      expect(navigateFn).not.toHaveBeenCalled();
      handler.dispose();
    });
  });
});
