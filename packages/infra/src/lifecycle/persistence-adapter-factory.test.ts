import { describe, expect, it, beforeEach } from 'bun:test';
import { mock } from 'bun:test';

// Mock the persistence lifecycle machine before importing
mock.module('./persistence-lifecycle-machine', () => {
  class MockPersistenceLifecycleAdapter {
    private _shutdown = false;

    async shutdown(): Promise<void> {
      this._shutdown = true;
    }

    isShutdown(): boolean {
      return this._shutdown;
    }
  }

  return {
    PersistenceLifecycleAdapter: MockPersistenceLifecycleAdapter,
  };
});

mock.module('../logger', () => ({
  lifecycleLog: {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  },
}));

import {
  createPersistenceAdapter,
  getPersistenceAdapter,
  resetPersistenceAdapter,
} from './persistence-adapter-factory';

describe('persistence-adapter-factory', () => {
  beforeEach(async () => {
    // Reset the singleton between tests
    await resetPersistenceAdapter();
  });

  // ===========================================================================
  // singleton pattern
  // ===========================================================================

  describe('singleton pattern', () => {
    it('createPersistenceAdapter should return the same instance on repeated calls', () => {
      const a = createPersistenceAdapter();
      const b = createPersistenceAdapter();
      expect(a).toBe(b);
    });
  });

  // ===========================================================================
  // getPersistenceAdapter throws before create
  // ===========================================================================

  describe('getPersistenceAdapter', () => {
    it('should throw when called before createPersistenceAdapter', () => {
      expect(() => getPersistenceAdapter()).toThrow(
        'Adapter not created. Call createPersistenceAdapter() first.',
      );
    });

    it('should return the adapter after createPersistenceAdapter is called', () => {
      createPersistenceAdapter();
      const adapter = getPersistenceAdapter();
      expect(adapter).toBeDefined();
    });

    it('should return the same instance as createPersistenceAdapter', () => {
      const created = createPersistenceAdapter();
      const got = getPersistenceAdapter();
      expect(created).toBe(got);
    });
  });

  // ===========================================================================
  // resetPersistenceAdapter
  // ===========================================================================

  describe('resetPersistenceAdapter', () => {
    it('should clear the singleton so getPersistenceAdapter throws again', async () => {
      createPersistenceAdapter();
      // Should not throw
      expect(() => getPersistenceAdapter()).not.toThrow();

      await resetPersistenceAdapter();

      // Should throw after reset
      expect(() => getPersistenceAdapter()).toThrow();
    });

    it('should allow creating a new adapter after reset', async () => {
      const first = createPersistenceAdapter();
      await resetPersistenceAdapter();
      const second = createPersistenceAdapter();

      // They should be different instances
      expect(first).not.toBe(second);
    });

    it('should be safe to call when no adapter exists', async () => {
      // Should not throw
      await expect(resetPersistenceAdapter()).resolves.toBeUndefined();
    });
  });
});
