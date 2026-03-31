import { describe, expect, it, beforeEach, mock } from 'bun:test';
import {
  registerDisposal,
  unregisterDisposal,
  disposeAll,
  getDisposalCount,
} from './disposal-registry';

// We need to reset the module state between tests
// Since disposal-registry uses module-level state, we'll work with it directly

describe('DisposalRegistry', () => {
  beforeEach(async () => {
    // Clear all registered disposals before each test
    await disposeAll();
  });

  describe('registerDisposal', () => {
    it('should register a disposal callback', () => {
      const callback = mock(() => {});
      registerDisposal('test', callback);
      expect(getDisposalCount()).toBe(1);
    });

    it('should allow registering multiple callbacks', () => {
      const callback1 = mock(() => {});
      const callback2 = mock(() => {});
      registerDisposal('test1', callback1);
      registerDisposal('test2', callback2);
      expect(getDisposalCount()).toBe(2);
    });

    it('should allow registering same name with different callbacks', () => {
      const callback1 = mock(() => {});
      const callback2 = mock(() => {});
      registerDisposal('test', callback1);
      registerDisposal('test', callback2);
      expect(getDisposalCount()).toBe(2);
    });
  });

  describe('unregisterDisposal', () => {
    it('should unregister a disposal callback', () => {
      const callback = mock(() => {});
      registerDisposal('test', callback);
      expect(getDisposalCount()).toBe(1);

      unregisterDisposal('test', callback);
      expect(getDisposalCount()).toBe(0);
    });

    it('should not throw when unregistering non-existent callback', () => {
      const callback = mock(() => {});
      expect(() => unregisterDisposal('test', callback)).not.toThrow();
    });

    it('should only unregister matching name and callback', () => {
      const callback1 = mock(() => {});
      const callback2 = mock(() => {});
      registerDisposal('test', callback1);
      registerDisposal('test', callback2);
      expect(getDisposalCount()).toBe(2);

      unregisterDisposal('test', callback1);
      expect(getDisposalCount()).toBe(1);
    });
  });

  describe('disposeAll', () => {
    it('should call all registered callbacks', async () => {
      const callback1 = mock(() => {});
      const callback2 = mock(() => {});
      registerDisposal('test1', callback1);
      registerDisposal('test2', callback2);

      await disposeAll();

      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });

    it('should clear all registrations after disposal', async () => {
      const callback = mock(() => {});
      registerDisposal('test', callback);
      expect(getDisposalCount()).toBe(1);

      await disposeAll();

      expect(getDisposalCount()).toBe(0);
    });

    it('should handle async callbacks', async () => {
      let resolved = false;
      const asyncCallback = mock(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        resolved = true;
      });
      registerDisposal('async-test', asyncCallback);

      await disposeAll();

      expect(resolved).toBe(true);
    });

    it('should continue even if a callback throws', async () => {
      const errorCallback = mock(() => {
        throw new Error('Test error');
      });
      const successCallback = mock(() => {});

      registerDisposal('error', errorCallback);
      registerDisposal('success', successCallback);

      // Should not throw
      await expect(disposeAll()).resolves.toBeUndefined();

      // Both callbacks should have been attempted
      expect(errorCallback).toHaveBeenCalled();
      expect(successCallback).toHaveBeenCalled();
    });
  });

  describe('getDisposalCount', () => {
    it('should return 0 when empty', () => {
      expect(getDisposalCount()).toBe(0);
    });

    it('should return correct count', () => {
      registerDisposal('a', () => {});
      registerDisposal('b', () => {});
      registerDisposal('c', () => {});
      expect(getDisposalCount()).toBe(3);
    });
  });
});
