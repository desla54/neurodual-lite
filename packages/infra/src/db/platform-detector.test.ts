import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
  detectSQLitePlatform,
  getPlatformInfo,
  getOpfsSupportDiagnostics,
  isCapacitorNative,
  isCapacitorPluginAvailable,
  isIndexedDBAvailable,
} from './platform-detector';

describe('platform-detector', () => {
  let originalWindow: typeof globalThis.window;
  let originalNavigator: typeof globalThis.navigator;
  let originalFileSystemFileHandle: unknown;

  beforeEach(() => {
    originalWindow = globalThis.window;
    originalNavigator = globalThis.navigator;
    originalFileSystemFileHandle = (globalThis as unknown as { FileSystemFileHandle?: unknown })
      .FileSystemFileHandle;
  });

  afterEach(() => {
    (globalThis as Record<string, unknown>).window = originalWindow;
    (globalThis as Record<string, unknown>).navigator = originalNavigator;
    (globalThis as Record<string, unknown>).FileSystemFileHandle = originalFileSystemFileHandle;
  });

  describe('isCapacitorNative', () => {
    it('returns false when window is undefined', () => {
      (globalThis as Record<string, unknown>).window = undefined;
      expect(isCapacitorNative()).toBe(false);
    });

    it('returns false when Capacitor is not present', () => {
      (globalThis as Record<string, unknown>).window = {};
      expect(isCapacitorNative()).toBe(false);
    });

    it('returns true when Capacitor.isNativePlatform returns true', () => {
      (globalThis as Record<string, unknown>).window = {
        Capacitor: {
          isNativePlatform: () => true,
        },
      };
      expect(isCapacitorNative()).toBe(true);
    });

    it('returns true when Capacitor.getPlatform returns ios', () => {
      (globalThis as Record<string, unknown>).window = {
        Capacitor: {
          isNativePlatform: () => false,
          getPlatform: () => 'ios',
        },
      };
      expect(isCapacitorNative()).toBe(true);
    });

    it('returns true when Capacitor.getPlatform returns android', () => {
      (globalThis as Record<string, unknown>).window = {
        Capacitor: {
          isNativePlatform: () => false,
          getPlatform: () => 'android',
        },
      };
      expect(isCapacitorNative()).toBe(true);
    });

    it('returns false when Capacitor.getPlatform returns web', () => {
      (globalThis as Record<string, unknown>).window = {
        Capacitor: {
          isNativePlatform: () => false,
          getPlatform: () => 'web',
        },
      };
      expect(isCapacitorNative()).toBe(false);
    });
  });

  describe('isCapacitorPluginAvailable', () => {
    it('returns false when window is undefined', () => {
      (globalThis as Record<string, unknown>).window = undefined;
      expect(isCapacitorPluginAvailable('SQLite')).toBe(false);
    });

    it('returns false when Capacitor is not present', () => {
      (globalThis as Record<string, unknown>).window = {};
      expect(isCapacitorPluginAvailable('SQLite')).toBe(false);
    });

    it('returns plugin availability from Capacitor', () => {
      (globalThis as Record<string, unknown>).window = {
        Capacitor: {
          isPluginAvailable: (name: string) => name === 'SQLite',
        },
      };
      expect(isCapacitorPluginAvailable('SQLite')).toBe(true);
      expect(isCapacitorPluginAvailable('Other')).toBe(false);
    });
  });

  describe('detectSQLitePlatform', () => {
    it('returns wa-sqlite-idb as fallback', () => {
      // With minimal mocks (no OPFS, no Capacitor), should fall back to IDB
      (globalThis as Record<string, unknown>).window = { self: globalThis.window };
      (globalThis as Record<string, unknown>).navigator = {};
      expect(detectSQLitePlatform()).toBe('wa-sqlite-idb');
    });

    it('returns capacitor-native when on native platform', () => {
      (globalThis as Record<string, unknown>).window = {
        self: globalThis.window,
        Capacitor: {
          isNativePlatform: () => true,
        },
      };
      expect(detectSQLitePlatform()).toBe('capacitor-native');
    });
  });

  describe('getPlatformInfo', () => {
    it('returns correct info for wa-sqlite-idb', () => {
      (globalThis as Record<string, unknown>).window = { self: globalThis.window };
      (globalThis as Record<string, unknown>).navigator = {};

      const info = getPlatformInfo();
      expect(info.platform).toBe('wa-sqlite-idb');
      expect(info.isNative).toBe(false);
      expect(info.storageType).toBe('indexeddb');
      expect(info.description).toContain('IndexedDB');
    });

    it('returns correct info for capacitor-native', () => {
      (globalThis as Record<string, unknown>).window = {
        self: globalThis.window,
        Capacitor: {
          isNativePlatform: () => true,
        },
      };

      const info = getPlatformInfo();
      expect(info.platform).toBe('capacitor-native');
      expect(info.isNative).toBe(true);
      expect(info.storageType).toBe('native');
      expect(info.description).toContain('Capacitor');
    });
  });

  describe('isIndexedDBAvailable', () => {
    it('returns false when indexedDB is undefined', () => {
      const original = globalThis.indexedDB;
      (globalThis as Record<string, unknown>).indexedDB = undefined;
      expect(isIndexedDBAvailable()).toBe(false);
      (globalThis as Record<string, unknown>).indexedDB = original;
    });

    it('returns true when indexedDB.open works', () => {
      // With the mock from test-preload, this should work
      const original = globalThis.indexedDB;
      (globalThis as Record<string, unknown>).indexedDB = {
        open: () => ({
          onerror: null,
          onsuccess: null,
          result: { close: () => {} },
        }),
        deleteDatabase: () => {},
      };
      expect(isIndexedDBAvailable()).toBe(true);
      (globalThis as Record<string, unknown>).indexedDB = original;
    });

    it('returns false when indexedDB.open throws', () => {
      const original = globalThis.indexedDB;
      (globalThis as Record<string, unknown>).indexedDB = {
        open: () => {
          throw new Error('Not allowed');
        },
      };
      expect(isIndexedDBAvailable()).toBe(false);
      (globalThis as Record<string, unknown>).indexedDB = original;
    });
  });

  describe('OPFS detection', () => {
    it('reports detailed OPFS diagnostics', () => {
      const mockWindow = { self: null as unknown };
      mockWindow.self = mockWindow;

      (globalThis as Record<string, unknown>).window = mockWindow;
      (globalThis as Record<string, unknown>).navigator = {
        userAgent: 'Mozilla/5.0 Chrome/135.0.0.0 Mobile Safari/537.36',
        storage: {
          getDirectory: () => Promise.resolve({}),
        },
        locks: {
          request: () => Promise.resolve(),
        },
      };
      function FakeFileSystemFileHandle() {
        // no-op constructor for tests
      }
      (
        FakeFileSystemFileHandle as unknown as {
          prototype: { createSyncAccessHandle: () => object };
        }
      ).prototype.createSyncAccessHandle = () => ({});
      (globalThis as Record<string, unknown>).FileSystemFileHandle = FakeFileSystemFileHandle;

      const diagnostics = getOpfsSupportDiagnostics();
      expect(diagnostics.hasOPFS).toBe(true);
      expect(diagnostics.hasWebLocks).toBe(true);
      expect(diagnostics.hasSyncAccessHandle).toBe(true);
      expect(diagnostics.isChromium).toBe(true);
      expect(typeof diagnostics.isWindow).toBe('boolean');
      expect(typeof diagnostics.supported).toBe('boolean');
    });

    it('returns wa-sqlite-idb on iOS web even when OPFS APIs exist', () => {
      const mockWindow = { self: null as unknown };
      mockWindow.self = mockWindow;

      (globalThis as Record<string, unknown>).window = mockWindow;
      (globalThis as Record<string, unknown>).navigator = {
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
        storage: {
          getDirectory: () => Promise.resolve({}),
        },
        locks: {
          request: () => Promise.resolve(),
        },
      };
      function FakeFileSystemFileHandle() {
        // no-op constructor for tests
      }
      (
        FakeFileSystemFileHandle as unknown as {
          prototype: { createSyncAccessHandle: () => object };
        }
      ).prototype.createSyncAccessHandle = () => ({});
      (globalThis as Record<string, unknown>).FileSystemFileHandle = FakeFileSystemFileHandle;

      expect(detectSQLitePlatform()).toBe('wa-sqlite-idb');
    });

    it('returns wa-sqlite-idb when in Tauri environment', () => {
      const mockWindow = {
        self: null as unknown,
        __TAURI__: {},
      };
      mockWindow.self = mockWindow;

      (globalThis as Record<string, unknown>).window = mockWindow;
      (globalThis as Record<string, unknown>).navigator = {
        storage: {
          getDirectory: () => Promise.resolve({}),
        },
      };

      expect(detectSQLitePlatform()).toBe('wa-sqlite-idb');
    });

    it('returns wa-sqlite-idb when navigator is minimal', () => {
      const mockWindow = { self: null as unknown };
      mockWindow.self = mockWindow;

      (globalThis as Record<string, unknown>).window = mockWindow;
      (globalThis as Record<string, unknown>).navigator = {
        userAgent: 'Test',
      };

      expect(detectSQLitePlatform()).toBe('wa-sqlite-idb');
    });
  });
});
