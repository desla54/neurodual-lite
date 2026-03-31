import { describe, expect, it } from 'bun:test';
import { bulkDeleteWhereIn, bulkInsert } from './sql-executor';

describe('sql-executor', () => {
  describe('bulkInsert', () => {
    it('should generate single insert for small rows', async () => {
      const calls: Array<{ sql: string; params?: unknown[] }> = [];
      const executor = {
        execute: async (sql: string, params?: unknown[]) => {
          calls.push({ sql, params: params as unknown[] | undefined });
          return undefined;
        },
      };

      await bulkInsert(
        executor,
        't',
        ['a', 'b', 'c'],
        [
          [1, 2, 3],
          [4, 5, 6],
        ],
      );

      expect(calls.length).toBe(1);
      expect(calls[0]?.sql).toContain('INSERT INTO t (a, b, c) VALUES');
      expect(calls[0]?.params).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it('should chunk inserts to respect maxBindVars', async () => {
      const calls: Array<{ sql: string; params?: unknown[] }> = [];
      const executor = {
        execute: async (sql: string, params?: unknown[]) => {
          calls.push({ sql, params: params as unknown[] | undefined });
          return undefined;
        },
      };

      // 3 columns, maxBindVars=5 => chunkSize=1
      await bulkInsert(
        executor,
        't',
        ['a', 'b', 'c'],
        [
          [1, 2, 3],
          [4, 5, 6],
          [7, 8, 9],
        ],
        { maxBindVars: 5 },
      );

      expect(calls.length).toBe(3);
      expect(calls[0]?.params).toEqual([1, 2, 3]);
      expect(calls[1]?.params).toEqual([4, 5, 6]);
      expect(calls[2]?.params).toEqual([7, 8, 9]);
    });

    it('should reject unsafe identifiers', async () => {
      const executor = { execute: async () => undefined };
      await expect(bulkInsert(executor, 't;DROP', ['a'], [[1]])).rejects.toThrow(
        /Unsafe table identifier/,
      );
      await expect(bulkInsert(executor, 't', ['a;DROP'], [[1]])).rejects.toThrow(
        /Unsafe column identifier/,
      );
    });
  });

  describe('bulkDeleteWhereIn', () => {
    it('should chunk deletes to respect maxBindVars', async () => {
      const calls: Array<{ sql: string; params?: unknown[] }> = [];
      const executor = {
        execute: async (sql: string, params?: unknown[]) => {
          calls.push({ sql, params: params as unknown[] | undefined });
          return undefined;
        },
      };

      const values = Array.from({ length: 1001 }, (_, i) => `id-${i}`);
      await bulkDeleteWhereIn(executor, 't', 'id', values, { maxBindVars: 900 });

      expect(calls.length).toBe(2);
      expect(calls[0]?.sql.startsWith('DELETE FROM t WHERE id IN (')).toBe(true);
      expect(calls[0]?.params?.length).toBe(900);
      expect(calls[1]?.params?.length).toBe(101);
    });

    it('should reject unsafe identifiers', async () => {
      const executor = { execute: async () => undefined };
      await expect(bulkDeleteWhereIn(executor, 't;DROP', 'id', ['a'])).rejects.toThrow(
        /Unsafe table identifier/,
      );
      await expect(bulkDeleteWhereIn(executor, 't', 'id;DROP', ['a'])).rejects.toThrow(
        /Unsafe column identifier/,
      );
    });
  });
});
