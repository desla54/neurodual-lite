import { describe, it, expect, beforeEach } from 'bun:test';

// tone-loader uses module-level state (toneModule / tonePromise).
// We re-import fresh for each test group by testing the public API.

describe('tone-loader', () => {
  // We need to test the module fresh, but bun caches imports.
  // Instead, test the exported functions from the cached module.
  let loadTone: typeof import('./tone-loader').loadTone;
  let getToneSync: typeof import('./tone-loader').getToneSync;

  beforeEach(async () => {
    const mod = await import('./tone-loader');
    loadTone = mod.loadTone;
    getToneSync = mod.getToneSync;
  });

  describe('loadTone', () => {
    it('is a function', () => {
      expect(typeof loadTone).toBe('function');
    });

    it('returns a promise', () => {
      const result = loadTone();
      expect(result).toBeInstanceOf(Promise);
    });

    it('resolves to the tone module', async () => {
      const mod = await loadTone();
      expect(mod).toBeDefined();
      expect(typeof mod).toBe('object');
    });

    it('resolves to the same module on subsequent calls (caching)', async () => {
      const m1 = await loadTone();
      const m2 = await loadTone();
      // Both should resolve to the exact same module reference
      expect(m1).toBe(m2);
    });
  });

  describe('getToneSync', () => {
    it('is a function', () => {
      expect(typeof getToneSync).toBe('function');
    });

    it('returns the module after loadTone has resolved', async () => {
      const loaded = await loadTone();
      const sync = getToneSync();
      expect(sync).toBe(loaded);
    });
  });
});
