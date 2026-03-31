import { describe, expect, it, mock } from 'bun:test';
import { createUiCache } from './ui-cache';
import type { SQLQueryPort } from '@neurodual/logic';

// =============================================================================
// Mock Helpers
// =============================================================================

type CacheRow = {
  cache_key: string;
  revision: string;
  version: number;
  payload_json: string;
};

function createMockSQLPort(rows: CacheRow[] = []): SQLQueryPort {
  const store = new Map<string, CacheRow>();
  for (const row of rows) {
    store.set(row.cache_key, row);
  }

  const txExecute = mock(async (sql: string, params?: unknown[]) => {
    if (sql.includes('INSERT INTO ui_cache')) {
      const [cacheKey, , , revision, version, , payload] = params as unknown[];
      store.set(cacheKey as string, {
        cache_key: cacheKey as string,
        revision: revision as string,
        version: version as number,
        payload_json: payload as string,
      });
    }
    if (sql.includes('DELETE FROM ui_cache')) {
      // No-op for tests
    }
  });

  return {
    query: mock(async <T extends object>(sql: string, params?: unknown[]) => {
      if (sql.includes('FROM ui_cache WHERE cache_key = ?')) {
        const key = (params as string[])[0];
        const row = store.get(key!);
        return { rows: row ? [row] : [] } as { rows: T[] };
      }
      return { rows: [] as T[] };
    }),
    execute: mock(async () => {}),
    writeTransaction: mock(async <T>(fn: (tx: { execute: typeof txExecute }) => Promise<T>) => {
      return fn({ execute: txExecute });
    }),
  } as unknown as SQLQueryPort;
}

describe('ui-cache', () => {
  describe('getOrCompute', () => {
    it('calls compute on cache miss and returns result', async () => {
      const persistence = createMockSQLPort();
      const cache = createUiCache(persistence);
      const compute = mock(async () => ({ total: 42 }));

      const result = await cache.getOrCompute({
        userId: 'user-1',
        kind: 'stats',
        key: 'overview',
        revision: 'rev-1',
        version: 1,
        compute,
      });

      expect(result).toEqual({ total: 42 });
      expect(compute).toHaveBeenCalledTimes(1);
    });

    it('returns cached value from memory on second call (same revision/version)', async () => {
      const persistence = createMockSQLPort();
      const cache = createUiCache(persistence);
      let callCount = 0;
      const compute = mock(async () => {
        callCount += 1;
        return { count: callCount };
      });

      const input = {
        userId: 'user-1',
        kind: 'stats',
        key: 'overview',
        revision: 'rev-1',
        version: 1,
        compute,
      };

      const first = await cache.getOrCompute(input);
      const second = await cache.getOrCompute(input);

      expect(first).toEqual({ count: 1 });
      expect(second).toEqual({ count: 1 });
      expect(compute).toHaveBeenCalledTimes(1);
    });

    it('recomputes when revision changes', async () => {
      const persistence = createMockSQLPort();
      const cache = createUiCache(persistence);
      let callCount = 0;

      const first = await cache.getOrCompute({
        userId: 'user-1',
        kind: 'stats',
        key: 'overview',
        revision: 'rev-1',
        version: 1,
        compute: async () => {
          callCount += 1;
          return { count: callCount };
        },
      });

      const second = await cache.getOrCompute({
        userId: 'user-1',
        kind: 'stats',
        key: 'overview',
        revision: 'rev-2',
        version: 1,
        compute: async () => {
          callCount += 1;
          return { count: callCount };
        },
      });

      expect(first).toEqual({ count: 1 });
      expect(second).toEqual({ count: 2 });
    });

    it('recomputes when version changes', async () => {
      const persistence = createMockSQLPort();
      const cache = createUiCache(persistence);
      let callCount = 0;

      const first = await cache.getOrCompute({
        userId: 'user-1',
        kind: 'stats',
        key: 'overview',
        revision: 'rev-1',
        version: 1,
        compute: async () => {
          callCount += 1;
          return { count: callCount };
        },
      });

      const second = await cache.getOrCompute({
        userId: 'user-1',
        kind: 'stats',
        key: 'overview',
        revision: 'rev-1',
        version: 2,
        compute: async () => {
          callCount += 1;
          return { count: callCount };
        },
      });

      expect(first).toEqual({ count: 1 });
      expect(second).toEqual({ count: 2 });
    });

    it('returns DB-cached value without recomputing', async () => {
      const storedPayload = JSON.stringify({ cached: true });
      const persistence = createMockSQLPort([
        {
          cache_key: 'ui:user-1:stats:overview',
          revision: 'rev-1',
          version: 1,
          payload_json: storedPayload,
        },
      ]);
      const cache = createUiCache(persistence);
      const compute = mock(async () => ({ cached: false }));

      const result = await cache.getOrCompute({
        userId: 'user-1',
        kind: 'stats',
        key: 'overview',
        revision: 'rev-1',
        version: 1,
        compute,
      });

      expect(result).toEqual({ cached: true });
      expect(compute).not.toHaveBeenCalled();
    });

    it('does not persist payloads exceeding maxPersistBytes', async () => {
      const persistence = createMockSQLPort();
      const cache = createUiCache(persistence, { maxPersistBytes: 10 });

      await cache.getOrCompute({
        userId: 'user-1',
        kind: 'stats',
        key: 'big',
        revision: 'rev-1',
        version: 1,
        compute: async () => ({ data: 'x'.repeat(100) }),
      });

      // writeTransaction is called but the INSERT should be skipped due to size
      // The value should still be in memory cache
      const result = await cache.getOrCompute({
        userId: 'user-1',
        kind: 'stats',
        key: 'big',
        revision: 'rev-1',
        version: 1,
        compute: async () => ({ data: 'should-not-recompute' }),
      });

      expect((result as { data: string }).data).toBe('x'.repeat(100));
    });

    it('deduplicates concurrent requests for the same key', async () => {
      const persistence = createMockSQLPort();
      const cache = createUiCache(persistence);
      let callCount = 0;
      const compute = async () => {
        callCount += 1;
        // Simulate async work
        await new Promise((r) => setTimeout(r, 10));
        return { count: callCount };
      };

      const input = {
        userId: 'user-1',
        kind: 'stats',
        key: 'overview',
        revision: 'rev-1',
        version: 1,
        compute,
      };

      const [r1, r2] = await Promise.all([cache.getOrCompute(input), cache.getOrCompute(input)]);

      expect(r1).toEqual(r2);
      expect(callCount).toBe(1);
    });

    it('survives DB query errors gracefully (treats as cache miss)', async () => {
      const persistence = {
        query: mock(async () => {
          throw new Error('DB corrupt');
        }),
        execute: mock(async () => {}),
        writeTransaction: mock(
          async <T>(fn: (tx: { execute: () => Promise<void> }) => Promise<T>) => {
            return fn({ execute: async () => {} });
          },
        ),
      } as unknown as SQLQueryPort;

      const cache = createUiCache(persistence);
      const compute = mock(async () => ({ fallback: true }));

      const result = await cache.getOrCompute({
        userId: 'user-1',
        kind: 'stats',
        key: 'overview',
        revision: 'rev-1',
        version: 1,
        compute,
      });

      expect(result).toEqual({ fallback: true });
      expect(compute).toHaveBeenCalledTimes(1);
    });
  });
});
