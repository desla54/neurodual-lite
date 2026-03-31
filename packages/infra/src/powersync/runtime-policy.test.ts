import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import {
  buildWebVfsCandidateOrder,
  classifyPowerSyncStorageError,
  clearPowerSyncVfsPreference,
  getPowerSyncBrowserContext,
  isLikelyFatalPowerSyncStorageError,
  readPowerSyncVfsPreference,
  readPowerSyncVfsPreferenceEntry,
  resolvePowerSyncFlags,
  shouldPreferIdbFirstForCooldown,
  shouldTryFallbackVfs,
  writePowerSyncVfsPreference,
} from './runtime-policy';

describe('powersync/runtime-policy', () => {
  const originalNavigator = globalThis.navigator;
  const originalSharedWorker = (globalThis as unknown as { SharedWorker?: unknown }).SharedWorker;
  const originalLocalStorage = globalThis.localStorage;

  beforeEach(() => {
    const storage = new Map<string, string>();
    const mockLocalStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
      key: (index: number) => [...storage.keys()][index] ?? null,
      get length() {
        return storage.size;
      },
    };
    (globalThis as Record<string, unknown>).localStorage = mockLocalStorage;
    localStorage.clear();
  });

  afterEach(() => {
    clearPowerSyncVfsPreference();
    (globalThis as Record<string, unknown>).navigator = originalNavigator;
    (globalThis as Record<string, unknown>).SharedWorker = originalSharedWorker;
    (globalThis as Record<string, unknown>).localStorage = originalLocalStorage;
  });

  it('stores and reads VFS preference with ttl', () => {
    writePowerSyncVfsPreference({ vfs: 'idb', at: 1_000 });
    expect(readPowerSyncVfsPreference(1_000)).toBe('idb');
    expect(readPowerSyncVfsPreference(1_000 + 24 * 60 * 60 * 1000 + 1)).toBeNull();
  });

  it('treats a fresh idb preference as a cooldown', () => {
    const entry = { vfs: 'idb' as const, at: 1_000 };
    writePowerSyncVfsPreference(entry);
    expect(shouldPreferIdbFirstForCooldown(readPowerSyncVfsPreferenceEntry(1_000), 1_000)).toBe(
      true,
    );
    expect(
      shouldPreferIdbFirstForCooldown(readPowerSyncVfsPreferenceEntry(1_000), 1_000 + 11 * 60_000),
    ).toBe(false);
  });

  it('builds candidate order with preferred vfs first', () => {
    expect(
      buildWebVfsCandidateOrder({
        preferredVfs: 'idb',
        detectedDefaultVfs: 'opfs',
        allowOpfsPoolFallback: true,
      }),
    ).toEqual(['idb', 'opfs', 'opfs-pool']);
  });

  it('keeps idb fallback at the end when no preference exists', () => {
    expect(
      buildWebVfsCandidateOrder({
        preferredVfs: null,
        detectedDefaultVfs: 'opfs',
        allowOpfsPoolFallback: true,
      }),
    ).toEqual(['opfs', 'opfs-pool', 'idb']);
  });

  it('does not retry opfs-coop when detector selected opfs-pool', () => {
    expect(
      buildWebVfsCandidateOrder({
        preferredVfs: null,
        detectedDefaultVfs: 'opfs-pool',
        allowOpfsPoolFallback: true,
      }),
    ).toEqual(['opfs-pool', 'idb']);
  });

  it('disables multi-tab on firefox even with SharedWorker', () => {
    (globalThis as Record<string, unknown>).navigator = { userAgent: 'Firefox/141.0' };
    (globalThis as Record<string, unknown>).SharedWorker = class FakeSharedWorker {};

    const ctx = getPowerSyncBrowserContext();
    const flags = resolvePowerSyncFlags('opfs', ctx);

    expect(ctx.browser).toBe('firefox');
    expect(flags.enableMultiTabs).toBe(false);
    expect(flags.useWebWorker).toBe(true);
  });

  it('enables multi-tab on desktop chromium with OPFS', () => {
    (globalThis as Record<string, unknown>).navigator = {
      userAgent: 'Mozilla/5.0 Chrome/145.0.0.0 Safari/537.36',
    };
    (globalThis as Record<string, unknown>).SharedWorker = class FakeSharedWorker {};

    const ctx = getPowerSyncBrowserContext();
    const flags = resolvePowerSyncFlags('opfs', ctx);

    expect(ctx.browser).toBe('chromium');
    expect(ctx.isMobileBrowser).toBe(false);
    expect(flags.enableMultiTabs).toBe(true);
  });

  it('never retries fallback from idb backend', () => {
    const err = new Error('disk I/O error');
    expect(shouldTryFallbackVfs('idb', err)).toBe(false);
  });

  it('classifies known OPFS errors as fatal', () => {
    const err = new Error('FileSystemSyncAccessHandle failed: disk I/O error');
    expect(isLikelyFatalPowerSyncStorageError(err)).toBe(true);
    expect(shouldTryFallbackVfs('opfs', err)).toBe(true);
  });

  it('falls back when Safari raises NoModificationAllowedError during OPFS open', () => {
    const err = new Error('The object can not be modified in this context.');
    err.name = 'NoModificationAllowedError';
    expect(classifyPowerSyncStorageError(err)).toBe('opfs-io');
    expect(shouldTryFallbackVfs('opfs', err)).toBe(true);
  });

  it('does not fallback to idb on lock contention timeout', () => {
    const err = new Error(
      'Database initialization timed out. Another browser tab may be holding a lock.',
    );
    expect(classifyPowerSyncStorageError(err)).toBe('lock');
    expect(isLikelyFatalPowerSyncStorageError(err)).toBe(false);
    expect(shouldTryFallbackVfs('opfs', err)).toBe(false);
  });

  it('allows lock-timeout fallback on mobile Safari', () => {
    const err = new Error(
      'Database initialization timed out. Another browser tab may be holding a lock.',
    );
    expect(
      shouldTryFallbackVfs('opfs', err, {
        browser: 'safari',
        isMobileBrowser: true,
        hasSharedWorker: false,
      }),
    ).toBe(true);
  });

  it('keeps lock-timeout fallback disabled on desktop Safari', () => {
    const err = new Error(
      'Database initialization timed out. Another browser tab may be holding a lock.',
    );
    expect(
      shouldTryFallbackVfs('opfs', err, {
        browser: 'safari',
        isMobileBrowser: false,
        hasSharedWorker: true,
      }),
    ).toBe(false);
  });
});
