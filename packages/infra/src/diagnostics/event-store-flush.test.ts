import { describe, it, expect } from 'bun:test';
import { installEventStoreFlushOnPageHide } from './event-store-flush';

describe('event-store-flush', () => {
  describe('installEventStoreFlushOnPageHide', () => {
    it('is a function', () => {
      expect(typeof installEventStoreFlushOnPageHide).toBe('function');
    });

    it('does not throw when called without arguments', () => {
      expect(() => installEventStoreFlushOnPageHide()).not.toThrow();
    });

    it('does not throw when called with a custom timeout', () => {
      expect(() => installEventStoreFlushOnPageHide(5000)).not.toThrow();
    });

    it('returns a cleanup function', () => {
      const cleanup = installEventStoreFlushOnPageHide();
      expect(typeof cleanup).toBe('function');
    });

    it('cleanup function does not throw', () => {
      const cleanup = installEventStoreFlushOnPageHide();
      expect(() => cleanup()).not.toThrow();
    });
  });
});
