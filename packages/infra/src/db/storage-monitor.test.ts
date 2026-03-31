import { describe, expect, it, beforeEach, afterEach, spyOn, mock } from 'bun:test';
import { formatBytes, getStorageQuotaInfo, checkStorageAndWarn } from './storage-monitor';

describe('storage-monitor', () => {
  describe('formatBytes', () => {
    it('should format bytes as B', () => {
      expect(formatBytes(0)).toBe('0 B');
      expect(formatBytes(100)).toBe('100 B');
      expect(formatBytes(1023)).toBe('1023 B');
    });

    it('should format kilobytes as KB', () => {
      expect(formatBytes(1024)).toBe('1.0 KB');
      expect(formatBytes(1536)).toBe('1.5 KB');
      expect(formatBytes(10240)).toBe('10.0 KB');
      expect(formatBytes(1048575)).toBe('1024.0 KB');
    });

    it('should format megabytes as MB', () => {
      expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
      expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.5 MB');
      expect(formatBytes(100 * 1024 * 1024)).toBe('100.0 MB');
      expect(formatBytes(1024 * 1024 * 1024 - 1)).toBe('1024.0 MB');
    });

    it('should format gigabytes as GB', () => {
      expect(formatBytes(1024 * 1024 * 1024)).toBe('1.00 GB');
      expect(formatBytes(1.5 * 1024 * 1024 * 1024)).toBe('1.50 GB');
      expect(formatBytes(10 * 1024 * 1024 * 1024)).toBe('10.00 GB');
    });
  });

  describe('getStorageQuotaInfo', () => {
    let originalNavigator: typeof navigator;

    beforeEach(() => {
      originalNavigator = globalThis.navigator;
    });

    afterEach(() => {
      (globalThis as Record<string, unknown>).navigator = originalNavigator;
    });

    it('should return null when navigator is undefined', async () => {
      (globalThis as Record<string, unknown>).navigator = undefined;
      const result = await getStorageQuotaInfo();
      expect(result).toBeNull();
    });

    it('should return null when storage.estimate is not available', async () => {
      (globalThis as Record<string, unknown>).navigator = { storage: {} };
      const result = await getStorageQuotaInfo();
      expect(result).toBeNull();
    });

    it('should return null when quota is 0', async () => {
      (globalThis as Record<string, unknown>).navigator = {
        storage: {
          estimate: mock(() => Promise.resolve({ usage: 100, quota: 0 })),
        },
      };
      const result = await getStorageQuotaInfo();
      expect(result).toBeNull();
    });

    it('should return storage info with correct calculations', async () => {
      (globalThis as Record<string, unknown>).navigator = {
        storage: {
          estimate: mock(() =>
            Promise.resolve({ usage: 50 * 1024 * 1024, quota: 100 * 1024 * 1024 }),
          ),
        },
      };

      const result = await getStorageQuotaInfo();

      expect(result).not.toBeNull();
      expect(result?.usage).toBe(50 * 1024 * 1024);
      expect(result?.quota).toBe(100 * 1024 * 1024);
      expect(result?.usagePercent).toBe(50);
      expect(result?.isWarning).toBe(false);
      expect(result?.isCritical).toBe(false);
    });

    it('should set isWarning when usage exceeds 80%', async () => {
      (globalThis as Record<string, unknown>).navigator = {
        storage: {
          estimate: mock(() =>
            Promise.resolve({ usage: 85 * 1024 * 1024, quota: 100 * 1024 * 1024 }),
          ),
        },
      };

      const result = await getStorageQuotaInfo();

      expect(result?.isWarning).toBe(true);
      expect(result?.isCritical).toBe(false);
    });

    it('should set isCritical when usage exceeds 95%', async () => {
      (globalThis as Record<string, unknown>).navigator = {
        storage: {
          estimate: mock(() =>
            Promise.resolve({ usage: 96 * 1024 * 1024, quota: 100 * 1024 * 1024 }),
          ),
        },
      };

      const result = await getStorageQuotaInfo();

      expect(result?.isWarning).toBe(true);
      expect(result?.isCritical).toBe(true);
    });

    it('should return null when estimate throws error', async () => {
      const consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});

      (globalThis as Record<string, unknown>).navigator = {
        storage: {
          estimate: mock(() => Promise.reject(new Error('API error'))),
        },
      };

      const result = await getStorageQuotaInfo();
      expect(result).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[StorageMonitor] Failed to get storage estimate:',
        expect.any(Error),
      );

      consoleErrorSpy.mockRestore();
    });

    it('should handle undefined usage and quota', async () => {
      (globalThis as Record<string, unknown>).navigator = {
        storage: {
          estimate: mock(() => Promise.resolve({})),
        },
      };

      const result = await getStorageQuotaInfo();
      // quota is 0 when undefined, so should return null
      expect(result).toBeNull();
    });
  });

  describe('checkStorageAndWarn', () => {
    let originalNavigator: typeof navigator;
    let consoleSpy: { warn: ReturnType<typeof spyOn>; error: ReturnType<typeof spyOn> };

    beforeEach(() => {
      originalNavigator = globalThis.navigator;
      consoleSpy = {
        warn: spyOn(console, 'warn').mockImplementation(() => {}),
        error: spyOn(console, 'error').mockImplementation(() => {}),
      };
    });

    afterEach(() => {
      (globalThis as Record<string, unknown>).navigator = originalNavigator;
      consoleSpy.warn.mockRestore();
      consoleSpy.error.mockRestore();
    });

    it('should not log when storage info is unavailable', async () => {
      (globalThis as Record<string, unknown>).navigator = undefined;

      await checkStorageAndWarn();

      // Only the warning about unavailable API, not the storage warning
      expect(consoleSpy.error).not.toHaveBeenCalled();
    });

    it('should not log when usage is below warning threshold', async () => {
      (globalThis as Record<string, unknown>).navigator = {
        storage: {
          estimate: mock(() =>
            Promise.resolve({ usage: 50 * 1024 * 1024, quota: 100 * 1024 * 1024 }),
          ),
        },
      };

      await checkStorageAndWarn();

      expect(consoleSpy.warn).not.toHaveBeenCalledWith(
        expect.stringContaining('[StorageMonitor] WARNING'),
      );
      expect(consoleSpy.error).not.toHaveBeenCalled();
    });

    it('should log warning when usage exceeds warning threshold', async () => {
      (globalThis as Record<string, unknown>).navigator = {
        storage: {
          estimate: mock(() =>
            Promise.resolve({ usage: 85 * 1024 * 1024, quota: 100 * 1024 * 1024 }),
          ),
        },
      };

      await checkStorageAndWarn();

      expect(consoleSpy.warn).toHaveBeenCalledWith(
        expect.stringContaining('[StorageMonitor] WARNING'),
      );
    });

    it('should log error when usage exceeds critical threshold', async () => {
      (globalThis as Record<string, unknown>).navigator = {
        storage: {
          estimate: mock(() =>
            Promise.resolve({ usage: 96 * 1024 * 1024, quota: 100 * 1024 * 1024 }),
          ),
        },
      };

      await checkStorageAndWarn();

      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining('[StorageMonitor] CRITICAL'),
      );
    });
  });
});
