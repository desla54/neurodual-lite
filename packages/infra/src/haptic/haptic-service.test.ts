import { describe, it, expect } from 'bun:test';
import { hapticAdapter } from './haptic-service';

describe('haptic-service', () => {
  describe('hapticAdapter', () => {
    it('exposes isAvailable method', () => {
      expect(typeof hapticAdapter.isAvailable).toBe('function');
    });

    it('isAvailable returns a boolean', () => {
      const result = hapticAdapter.isAvailable();
      expect(typeof result).toBe('boolean');
    });

    it('exposes vibrate method', () => {
      expect(typeof hapticAdapter.vibrate).toBe('function');
    });

    it('vibrate does not throw without arguments', () => {
      expect(() => hapticAdapter.vibrate()).not.toThrow();
    });

    it('vibrate does not throw with a duration', () => {
      expect(() => hapticAdapter.vibrate(100)).not.toThrow();
    });

    it('exposes impact method', () => {
      expect(typeof hapticAdapter.impact).toBe('function');
    });

    it('impact does not throw without arguments', () => {
      expect(() => hapticAdapter.impact()).not.toThrow();
    });

    it('impact does not throw with each style', () => {
      expect(() => hapticAdapter.impact('light')).not.toThrow();
      expect(() => hapticAdapter.impact('medium')).not.toThrow();
      expect(() => hapticAdapter.impact('heavy')).not.toThrow();
    });

    it('exposes notification method', () => {
      expect(typeof hapticAdapter.notification).toBe('function');
    });

    it('notification does not throw without arguments', () => {
      expect(() => hapticAdapter.notification()).not.toThrow();
    });

    it('notification does not throw with each type', () => {
      expect(() => hapticAdapter.notification('success')).not.toThrow();
      expect(() => hapticAdapter.notification('warning')).not.toThrow();
      expect(() => hapticAdapter.notification('error')).not.toThrow();
    });

    it('exposes selectionChanged method', () => {
      expect(typeof hapticAdapter.selectionChanged).toBe('function');
    });

    it('selectionChanged does not throw', () => {
      expect(() => hapticAdapter.selectionChanged()).not.toThrow();
    });

    it('isAvailable returns false in test environment without native or vibrate API', () => {
      // In bun test, Capacitor.isNativePlatform() returns false
      // and navigator.vibrate is not available
      expect(hapticAdapter.isAvailable()).toBe(false);
    });
  });
});
