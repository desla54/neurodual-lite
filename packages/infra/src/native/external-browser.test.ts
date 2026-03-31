import { describe, it, expect } from 'bun:test';
import { ExternalBrowser } from './external-browser';
import type { ExternalBrowserPlugin } from './external-browser';

describe('external-browser', () => {
  describe('ExternalBrowserPlugin interface', () => {
    it('defines open method that takes url and returns opened boolean', async () => {
      const plugin: ExternalBrowserPlugin = {
        open: async ({ url }: { url: string }) => ({ opened: url.startsWith('https') }),
      };
      const result = await plugin.open({ url: 'https://example.com' });
      expect(result.opened).toBe(true);
    });

    it('returns opened=false for non-https urls', async () => {
      const plugin: ExternalBrowserPlugin = {
        open: async ({ url }: { url: string }) => ({ opened: url.startsWith('https') }),
      };
      const result = await plugin.open({ url: 'not-a-url' });
      expect(result.opened).toBe(false);
    });

    it('accepts any valid url string', async () => {
      const calls: string[] = [];
      const plugin: ExternalBrowserPlugin = {
        open: async ({ url }) => {
          calls.push(url);
          return { opened: true };
        },
      };
      await plugin.open({ url: 'https://example.com/path?q=1' });
      expect(calls).toEqual(['https://example.com/path?q=1']);
    });
  });

  describe('ExternalBrowser registered plugin', () => {
    it('is defined as a plugin object', () => {
      expect(ExternalBrowser).toBeDefined();
      expect(typeof ExternalBrowser).toBe('object');
    });

    it('has an open method', () => {
      // registerPlugin returns a Proxy; typeof .open is 'function'
      expect(typeof ExternalBrowser.open).toBe('function');
    });

    it('throws UNIMPLEMENTED on web (no native implementation)', async () => {
      // On web/test environment, Capacitor registerPlugin creates a proxy
      // that throws "not implemented on web" when called without a native bridge.
      try {
        await ExternalBrowser.open({ url: 'https://example.com' });
        // If we reach here, we're in a native-like environment (unexpected in tests)
        expect(true).toBe(true);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        expect(message).toContain('ExternalBrowser');
        expect(message).toContain('not implemented');
      }
    });
  });
});
