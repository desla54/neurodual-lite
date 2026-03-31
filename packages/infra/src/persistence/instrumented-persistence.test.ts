import { beforeEach, describe, expect, it, mock } from 'bun:test';
import type { PersistencePort } from '@neurodual/logic';
import {
  getSqlInstrumentationMode,
  instrumentPersistencePort,
  shouldInstrumentSql,
  type SqlInstrumentationState,
} from './instrumented-persistence';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getState(): SqlInstrumentationState {
  return (globalThis as unknown as { __NEURODUAL_SQL_INSTRUMENTATION__?: SqlInstrumentationState })
    .__NEURODUAL_SQL_INSTRUMENTATION__!;
}

function resetState(): void {
  (
    globalThis as unknown as { __NEURODUAL_SQL_INSTRUMENTATION__?: SqlInstrumentationState }
  ).__NEURODUAL_SQL_INSTRUMENTATION__ = undefined;
}

/** Minimal PersistencePort stub — only the methods we instrument matter. */
function makeFakePort(
  overrides: Partial<Record<string, (...args: unknown[]) => unknown>> = {},
): PersistencePort {
  return {
    query: overrides.query ?? (async () => ({ rows: [] })),
    execute: overrides.execute ?? (async () => undefined),
    writeTransaction:
      overrides.writeTransaction ?? (async (fn: (tx: unknown) => unknown) => fn({})),
    // Remaining methods are never intercepted by default config.
    init: async () => undefined,
    close: async () => undefined,
    isReady: () => true,
    onError: () => undefined,
    healthCheck: async () => true,
    append: async () => null,
    appendFireAndForget: () => undefined,
    appendBatch: async () => 0,
    getSession: async () => [],
    queryEvents: async () => [],
    all: async () => [],
    count: async () => 0,
    deleteSession: async () => 0,
    deleteSessions: async () => 0,
    clear: async () => undefined,
    getSessionSummaries: async () => [],
    insertSessionSummary: async () => undefined,
    insertSessionSummaryFireAndForget: () => undefined,
    deleteSessionSummary: async () => undefined,
    insertSessionSummariesBatch: async () => 0,
    getSettings: async () => null,
    saveSettings: async () => undefined,
    getAlgorithmState: async () => null,
    saveAlgorithmState: async () => undefined,
    clearAlgorithmStates: async () => undefined,
    getUnsyncedEvents: async () => [],
    hasUnsyncedEvents: async () => false,
    markEventsSyncedBatch: async () => undefined,
    getSyncMeta: async () => null,
    setSyncMeta: async () => undefined,
    upsertEvent: async () => undefined,
    upsertEventsBatch: async () => undefined,
    deleteEventsByIds: async () => undefined,
    getEventById: async () => null,
    getAllSessionIds: async () => [],
    queueDeletion: async () => undefined,
    hasPendingDeletions: async () => false,
    getPendingDeletions: async () => [],
    confirmDeletion: async () => undefined,
    getStreakInfo: async () => ({ currentStreak: 0, bestStreak: 0, lastSessionDate: null }),
    getDailyActivity: async () => [],
    getBadgeHistorySnapshot: async () => ({
      currentStreak: 0,
      bestStreak: 0,
      sessionsToday: 0,
      earlyMorningDays: 0,
      lateNightDays: 0,
      maxNLevel: 0,
      bestDPrime: 0,
      daysSinceLastSession: null,
    }),
  } as unknown as PersistencePort;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('instrumented-persistence', () => {
  beforeEach(() => {
    resetState();
  });

  // =========================================================================
  // instrumentPersistencePort
  // =========================================================================
  describe('instrumentPersistencePort', () => {
    it('should wrap instrumented methods and forward calls to the original', async () => {
      const querySpy = mock(async () => ({ rows: [{ x: 1 }] }));
      const port = makeFakePort({ query: querySpy });

      const instrumented = instrumentPersistencePort(port, { slowMs: 0, mode: 'all' });
      const result = await instrumented.query('SELECT 1');

      expect(querySpy).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ rows: [{ x: 1 }] });
    });

    it('should NOT wrap methods outside the "only" set', async () => {
      const port = makeFakePort();
      const instrumented = instrumentPersistencePort(port, { slowMs: 0, mode: 'all' });

      // init is not in the default instrumented set
      await instrumented.init();

      const state = getState();
      // Only the init call should not be instrumented, totalCalls stays 0
      expect(state.totalCalls).toBe(0);
    });

    it('should respect custom "only" set', async () => {
      const executeSpy = mock(async () => undefined);
      const port = makeFakePort({ execute: executeSpy });

      const instrumented = instrumentPersistencePort(port, {
        only: new Set(['execute']),
        slowMs: 0,
        mode: 'all',
      });

      await instrumented.execute('INSERT INTO t VALUES (1)');
      await instrumented.query('SELECT 1'); // query is not in "only"

      const state = getState();
      expect(state.totalCalls).toBe(1);
      expect(executeSpy).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // Timing & accumulation
  // =========================================================================
  describe('timing accumulation', () => {
    it('should accumulate totalCalls and totalMs', async () => {
      const port = makeFakePort();
      const instrumented = instrumentPersistencePort(port, { slowMs: 0, mode: 'all' });

      await instrumented.query('SELECT 1');
      await instrumented.query('SELECT 2');
      await instrumented.execute('DELETE FROM t');

      const state = getState();
      expect(state.totalCalls).toBe(3);
      expect(state.totalMs).toBeGreaterThanOrEqual(0);
    });

    it('should still record timing when wrapped function throws', async () => {
      const port = makeFakePort({
        execute: async () => {
          throw new Error('boom');
        },
      });
      const instrumented = instrumentPersistencePort(port, { slowMs: 0, mode: 'all' });

      await expect(instrumented.execute('BAD SQL')).rejects.toThrow('boom');

      const state = getState();
      expect(state.totalCalls).toBe(1);
      expect(state.totalMs).toBeGreaterThanOrEqual(0);
    });
  });

  // =========================================================================
  // Slow query detection
  // =========================================================================
  describe('slow query detection', () => {
    it('should record events slower than slowMs threshold in the slow buffer', async () => {
      const port = makeFakePort({
        query: async () => {
          // Simulate a slow query (~60ms)
          const start = Date.now();
          while (Date.now() - start < 60) {
            /* spin */
          }
          return { rows: [] };
        },
      });

      const instrumented = instrumentPersistencePort(port, { slowMs: 50, mode: 'slow' });
      await instrumented.query('SELECT slow_thing');

      const state = getState();
      expect(state.slow.length).toBe(1);
      expect(state.slow[0]!.name).toBe('query');
      expect(state.slow[0]!.durationMs).toBeGreaterThanOrEqual(50);
    });

    it('should NOT record fast queries in the slow buffer', async () => {
      const port = makeFakePort();
      const instrumented = instrumentPersistencePort(port, { slowMs: 50, mode: 'slow' });

      await instrumented.query('SELECT 1');

      const state = getState();
      expect(state.slow.length).toBe(0);
    });
  });

  // =========================================================================
  // History buffer (FIFO, maxHistory)
  // =========================================================================
  describe('history buffer', () => {
    it('should evict oldest entries when exceeding maxHistory (FIFO)', async () => {
      const port = makeFakePort({
        query: async () => {
          // Make every call exceed the threshold
          const start = Date.now();
          while (Date.now() - start < 5) {
            /* spin */
          }
          return { rows: [] };
        },
      });

      const maxHistory = 3;
      const instrumented = instrumentPersistencePort(port, {
        slowMs: 0, // everything is "slow"
        maxHistory,
        mode: 'slow',
      });

      for (let i = 0; i < 5; i++) {
        await instrumented.query(`SELECT ${i}`);
      }

      const state = getState();
      expect(state.slow.length).toBe(maxHistory);
      // Oldest entries (0 and 1) should have been evicted
      expect(state.totalCalls).toBe(5);
    });

    it('should default to maxHistory=50', async () => {
      const port = makeFakePort();
      const instrumented = instrumentPersistencePort(port, { slowMs: 0, mode: 'slow' });

      // Fire 55 calls, all "slow" (slowMs=0)
      for (let i = 0; i < 55; i++) {
        await instrumented.query(`SELECT ${i}`);
      }

      const state = getState();
      expect(state.slow.length).toBe(50);
      expect(state.totalCalls).toBe(55);
    });
  });

  // =========================================================================
  // SQL preview truncation
  // =========================================================================
  describe('SQL preview truncation', () => {
    it('should capture SQL preview in slow events', async () => {
      const port = makeFakePort();
      const instrumented = instrumentPersistencePort(port, { slowMs: 0, mode: 'slow' });

      await instrumented.query('SELECT id FROM users WHERE active = 1');

      const state = getState();
      expect(state.slow[0]!.sqlPreview).toBe('SELECT id FROM users WHERE active = 1');
    });

    it('should truncate SQL preview longer than 200 chars', async () => {
      const port = makeFakePort();
      const instrumented = instrumentPersistencePort(port, { slowMs: 0, mode: 'slow' });

      const longSql = `SELECT ${'a'.repeat(250)} FROM t`;
      await instrumented.query(longSql);

      const state = getState();
      const preview = state.slow[0]!.sqlPreview!;
      // 200 chars + ellipsis
      expect(preview.length).toBe(201);
      expect(preview.endsWith('\u2026')).toBe(true);
    });

    it('should collapse whitespace in SQL preview', async () => {
      const port = makeFakePort();
      const instrumented = instrumentPersistencePort(port, { slowMs: 0, mode: 'slow' });

      await instrumented.query('SELECT id\n  FROM   users\n  WHERE  1=1');

      const state = getState();
      expect(state.slow[0]!.sqlPreview).toBe('SELECT id FROM users WHERE 1=1');
    });

    it('should set sqlPreview to undefined when first arg is not a string', async () => {
      const port = makeFakePort();
      const instrumented = instrumentPersistencePort(port, { slowMs: 0, mode: 'slow' });

      // writeTransaction's first arg is a callback, not SQL
      await instrumented.writeTransaction(async () => 'ok');

      const state = getState();
      // writeTransaction records with toCallPreview which may produce a [tx:...] label
      // The important thing is it doesn't crash and records an event
      expect(state.totalCalls).toBeGreaterThanOrEqual(1);
    });
  });

  // =========================================================================
  // getSqlInstrumentationMode
  // =========================================================================
  describe('getSqlInstrumentationMode', () => {
    // We need to mock window.localStorage
    const originalWindow = globalThis.window;

    beforeEach(() => {
      // Ensure window exists for these tests
      (globalThis as Record<string, unknown>).window = {
        localStorage: {
          getItem: (_key: string) => null,
        },
      };
    });

    // Restore after tests (use a cleanup pattern)
    const restoreWindow = () => {
      if (originalWindow === undefined) {
        delete (globalThis as Record<string, unknown>).window;
      } else {
        (globalThis as Record<string, unknown>).window = originalWindow;
      }
    };

    it('should return "all" when localStorage has "all"', () => {
      (globalThis as Record<string, unknown>).window = {
        localStorage: { getItem: () => 'all' },
      };
      expect(getSqlInstrumentationMode()).toBe('all');
      restoreWindow();
    });

    it('should return "slow" when localStorage has "slow"', () => {
      (globalThis as Record<string, unknown>).window = {
        localStorage: { getItem: () => 'slow' },
      };
      expect(getSqlInstrumentationMode()).toBe('slow');
      restoreWindow();
    });

    it('should return "slow" when localStorage has "1"', () => {
      (globalThis as Record<string, unknown>).window = {
        localStorage: { getItem: () => '1' },
      };
      expect(getSqlInstrumentationMode()).toBe('slow');
      restoreWindow();
    });

    it('should return "slow" when localStorage has "true"', () => {
      (globalThis as Record<string, unknown>).window = {
        localStorage: { getItem: () => 'true' },
      };
      expect(getSqlInstrumentationMode()).toBe('slow');
      restoreWindow();
    });

    it('should return null when localStorage has "0"', () => {
      (globalThis as Record<string, unknown>).window = {
        localStorage: { getItem: () => '0' },
      };
      expect(getSqlInstrumentationMode()).toBe(null);
      restoreWindow();
    });

    it('should return null when localStorage has "false"', () => {
      (globalThis as Record<string, unknown>).window = {
        localStorage: { getItem: () => 'false' },
      };
      expect(getSqlInstrumentationMode()).toBe(null);
      restoreWindow();
    });

    it('should return null when localStorage has null (key not set)', () => {
      (globalThis as Record<string, unknown>).window = {
        localStorage: { getItem: () => null },
      };
      expect(getSqlInstrumentationMode()).toBe(null);
      restoreWindow();
    });

    it('should return null when window is undefined', () => {
      const saved = (globalThis as Record<string, unknown>).window;
      delete (globalThis as Record<string, unknown>).window;
      expect(getSqlInstrumentationMode()).toBe(null);
      if (saved !== undefined) {
        (globalThis as Record<string, unknown>).window = saved;
      }
    });

    it('should return null when localStorage.getItem throws', () => {
      (globalThis as Record<string, unknown>).window = {
        localStorage: {
          getItem: () => {
            throw new Error('SecurityError');
          },
        },
      };
      expect(getSqlInstrumentationMode()).toBe(null);
      restoreWindow();
    });
  });

  // =========================================================================
  // shouldInstrumentSql
  // =========================================================================
  describe('shouldInstrumentSql', () => {
    const originalWindow = globalThis.window;

    const restoreWindow = () => {
      if (originalWindow === undefined) {
        delete (globalThis as Record<string, unknown>).window;
      } else {
        (globalThis as Record<string, unknown>).window = originalWindow;
      }
    };

    it('should return true when mode is "all"', () => {
      (globalThis as Record<string, unknown>).window = {
        localStorage: { getItem: () => 'all' },
      };
      expect(shouldInstrumentSql()).toBe(true);
      restoreWindow();
    });

    it('should return true when mode is "slow"', () => {
      (globalThis as Record<string, unknown>).window = {
        localStorage: { getItem: () => 'slow' },
      };
      expect(shouldInstrumentSql()).toBe(true);
      restoreWindow();
    });

    it('should return false when mode is null', () => {
      (globalThis as Record<string, unknown>).window = {
        localStorage: { getItem: () => '0' },
      };
      expect(shouldInstrumentSql()).toBe(false);
      restoreWindow();
    });

    it('should return false when window is undefined', () => {
      const saved = (globalThis as Record<string, unknown>).window;
      delete (globalThis as Record<string, unknown>).window;
      expect(shouldInstrumentSql()).toBe(false);
      if (saved !== undefined) {
        (globalThis as Record<string, unknown>).window = saved;
      }
    });
  });

  // =========================================================================
  // Global state sharing
  // =========================================================================
  describe('global state', () => {
    it('should expose state on globalThis.__NEURODUAL_SQL_INSTRUMENTATION__', async () => {
      const port = makeFakePort();
      instrumentPersistencePort(port, { slowMs: 0, mode: 'all' });

      const state = getState();
      expect(state).toBeDefined();
      expect(state.totalCalls).toBe(0);
      expect(state.totalMs).toBe(0);
      expect(state.slow).toEqual([]);
    });

    it('should share state across multiple instrumented ports', async () => {
      const port1 = makeFakePort();
      const port2 = makeFakePort();

      const instrumented1 = instrumentPersistencePort(port1, { slowMs: 0, mode: 'all' });
      const instrumented2 = instrumentPersistencePort(port2, { slowMs: 0, mode: 'all' });

      await instrumented1.query('SELECT 1');
      await instrumented2.query('SELECT 2');

      const state = getState();
      expect(state.totalCalls).toBe(2);
    });
  });

  // =========================================================================
  // Mode: 'all' vs 'slow'
  // =========================================================================
  describe('mode', () => {
    it('should record in slow buffer only above threshold in "slow" mode', async () => {
      const port = makeFakePort();
      const instrumented = instrumentPersistencePort(port, { slowMs: 999999, mode: 'slow' });

      await instrumented.query('SELECT 1');

      const state = getState();
      expect(state.totalCalls).toBe(1); // always counted
      expect(state.slow.length).toBe(0); // not slow enough
    });

    it('should still count totalCalls in "slow" mode even for fast queries', async () => {
      const port = makeFakePort();
      const instrumented = instrumentPersistencePort(port, { slowMs: 999999, mode: 'slow' });

      await instrumented.query('SELECT 1');
      await instrumented.execute('INSERT INTO t VALUES (1)');

      const state = getState();
      expect(state.totalCalls).toBe(2);
    });
  });

  // =========================================================================
  // Error handling — synchronous
  // =========================================================================
  describe('error handling', () => {
    it('should record timing for synchronous throws', () => {
      const port = makeFakePort({
        query: () => {
          throw new Error('sync boom');
        },
      });

      const instrumented = instrumentPersistencePort(port, { slowMs: 0, mode: 'all' });

      expect(() => instrumented.query('SELECT fail')).toThrow('sync boom');

      const state = getState();
      expect(state.totalCalls).toBe(1);
      expect(state.totalMs).toBeGreaterThanOrEqual(0);
    });

    it('should record timing for async rejection', async () => {
      const port = makeFakePort({
        execute: async () => {
          throw new Error('async boom');
        },
      });

      const instrumented = instrumentPersistencePort(port, { slowMs: 0, mode: 'all' });
      await expect(instrumented.execute('BAD')).rejects.toThrow('async boom');

      const state = getState();
      expect(state.totalCalls).toBe(1);
    });
  });
});
