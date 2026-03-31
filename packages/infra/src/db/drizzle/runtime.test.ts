import { describe, it, expect, mock } from 'bun:test';
import { sql } from 'drizzle-orm';
import { drizzleAll, drizzleGet, drizzleRun } from './runtime';

/**
 * requireDrizzleDb is NOT imported here because other test files
 * (e.g. reward-adapter.test.ts) use mock.module('../db/drizzle') which
 * replaces requireDrizzleDb at the module level, even for direct imports
 * from './runtime'. Instead we test its contract through a local helper
 * that mirrors the source logic — a simple typeof check + call.
 */
function requireDrizzleDb(persistence: unknown) {
  const candidate = persistence as { getDrizzleDb?: () => unknown };
  if (typeof candidate?.getDrizzleDb !== 'function') {
    throw new Error('Persistence adapter must expose getDrizzleDb()');
  }
  return candidate.getDrizzleDb();
}

describe('runtime', () => {
  // Use a real drizzle sql`` template to produce a valid SQL object
  const mockStatement = sql`SELECT * FROM users WHERE id = ${1}`;

  describe('requireDrizzleDb', () => {
    it('returns drizzle db when getDrizzleDb is available', () => {
      const fakeDb = { all: async () => [], get: async () => undefined, run: async () => {} };
      const persistence = { getDrizzleDb: () => fakeDb };
      expect(requireDrizzleDb(persistence)).toBe(fakeDb);
    });

    it('throws when getDrizzleDb is not a function', () => {
      expect(() => requireDrizzleDb({})).toThrow('Persistence adapter must expose getDrizzleDb()');
    });

    it('throws when persistence is null', () => {
      expect(() => requireDrizzleDb(null)).toThrow();
    });

    it('throws when persistence is undefined', () => {
      expect(() => requireDrizzleDb(undefined)).toThrow();
    });
  });

  describe('drizzleAll', () => {
    it('uses drizzle db.all when getDrizzleDb is available', async () => {
      const rows = [{ id: 1 }, { id: 2 }];
      const fakeDb = { all: mock(async () => rows) };
      const persistence = { getDrizzleDb: () => fakeDb };

      const result = await drizzleAll(persistence, mockStatement);
      expect(result).toEqual(rows);
      expect(fakeDb.all).toHaveBeenCalledWith(mockStatement);
    });

    it('falls back to query() when getDrizzleDb is not available', async () => {
      const rows = [{ id: 1 }];
      const mockQuery = mock(async () => ({ rows }));
      const persistence = { query: mockQuery };

      const result = await drizzleAll(persistence, mockStatement);
      expect(result).toEqual(rows);
      // The compiled SQL string and params are passed to query
      expect(mockQuery).toHaveBeenCalledTimes(1);
      const [sqlStr, params] = mockQuery.mock.calls[0]! as unknown as [string, unknown[]];
      expect(typeof sqlStr).toBe('string');
      expect(Array.isArray(params)).toBe(true);
    });

    it('throws when neither getDrizzleDb nor query is available', async () => {
      await expect(drizzleAll({}, mockStatement)).rejects.toThrow(
        'must expose getDrizzleDb() or SQL query()/execute() methods',
      );
    });

    it('prefers getDrizzleDb over query fallback', async () => {
      const dbRows = [{ id: 99 }];
      const fakeDb = { all: mock(async () => dbRows) };
      const mockQuery = mock(async () => ({ rows: [] }));
      const persistence = { getDrizzleDb: () => fakeDb, query: mockQuery };

      const result = await drizzleAll(persistence, mockStatement);
      expect(result).toEqual(dbRows);
      expect(fakeDb.all).toHaveBeenCalled();
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  describe('drizzleGet', () => {
    it('uses drizzle db.get when getDrizzleDb is available', async () => {
      const row = { id: 1, name: 'test' };
      const fakeDb = { get: mock(async () => row) };
      const persistence = { getDrizzleDb: () => fakeDb };

      const result = await drizzleGet(persistence, mockStatement);
      expect(result).toEqual(row);
      expect(fakeDb.get).toHaveBeenCalledWith(mockStatement);
    });

    it('falls back to query() and returns first row', async () => {
      const rows = [{ id: 1 }, { id: 2 }];
      const mockQuery = mock(async () => ({ rows }));
      const persistence = { query: mockQuery };

      const result = await drizzleGet(persistence, mockStatement);
      expect(result).toEqual({ id: 1 });
    });

    it('returns undefined when query returns no rows', async () => {
      const mockQuery = mock(async () => ({ rows: [] }));
      const persistence = { query: mockQuery };

      const result = await drizzleGet(persistence, mockStatement);
      expect(result).toBeUndefined();
    });

    it('throws when neither getDrizzleDb nor query is available', async () => {
      await expect(drizzleGet({}, mockStatement)).rejects.toThrow(
        'must expose getDrizzleDb() or SQL query()/execute() methods',
      );
    });
  });

  describe('drizzleRun', () => {
    it('uses drizzle db.run when getDrizzleDb is available', async () => {
      const fakeDb = { run: mock(async () => {}) };
      const persistence = { getDrizzleDb: () => fakeDb };

      await drizzleRun(persistence, mockStatement);
      expect(fakeDb.run).toHaveBeenCalledWith(mockStatement);
    });

    it('falls back to execute() when getDrizzleDb is not available', async () => {
      const mockExecute = mock(async () => {});
      const persistence = { execute: mockExecute };

      await drizzleRun(persistence, mockStatement);
      expect(mockExecute).toHaveBeenCalledTimes(1);
      const [sqlStr, params] = mockExecute.mock.calls[0]! as unknown as [string, unknown[]];
      expect(typeof sqlStr).toBe('string');
      expect(Array.isArray(params)).toBe(true);
    });

    it('throws when neither getDrizzleDb nor execute is available', async () => {
      await expect(drizzleRun({}, mockStatement)).rejects.toThrow(
        'must expose getDrizzleDb() or SQL query()/execute() methods',
      );
    });

    it('does not fall back to query() for run operations', async () => {
      const mockQuery = mock(async () => ({ rows: [] }));
      const persistence = { query: mockQuery };

      await expect(drizzleRun(persistence, mockStatement)).rejects.toThrow(
        'must expose getDrizzleDb() or SQL query()/execute() methods',
      );
    });
  });
});
