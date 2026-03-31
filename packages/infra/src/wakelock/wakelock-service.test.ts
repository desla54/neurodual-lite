import { describe, it, expect } from 'bun:test';
import { wakeLockAdapter } from './wakelock-service';

describe('wakelock-service', () => {
  describe('wakeLockAdapter', () => {
    it('exposes isSupported method', () => {
      expect(typeof wakeLockAdapter.isSupported).toBe('function');
    });

    it('isSupported returns a boolean', () => {
      const result = wakeLockAdapter.isSupported();
      expect(typeof result).toBe('boolean');
    });

    it('isSupported returns false in test environment without native or wake lock API', () => {
      // In bun test, Capacitor.isNativePlatform() returns false
      // and navigator.wakeLock is not available
      expect(wakeLockAdapter.isSupported()).toBe(false);
    });

    it('exposes keepAwake method', () => {
      expect(typeof wakeLockAdapter.keepAwake).toBe('function');
    });

    it('keepAwake resolves without throwing when APIs are unavailable', async () => {
      // When neither native nor web wake lock is available, keepAwake is a no-op
      await expect(wakeLockAdapter.keepAwake()).resolves.toBeUndefined();
    });

    it('exposes allowSleep method', () => {
      expect(typeof wakeLockAdapter.allowSleep).toBe('function');
    });

    it('allowSleep resolves without throwing when APIs are unavailable', async () => {
      await expect(wakeLockAdapter.allowSleep()).resolves.toBeUndefined();
    });

    it('exposes isKeptAwake method', () => {
      expect(typeof wakeLockAdapter.isKeptAwake).toBe('function');
    });

    it('isKeptAwake returns false when no lock is held', async () => {
      const result = await wakeLockAdapter.isKeptAwake();
      expect(result).toBe(false);
    });
  });
});
