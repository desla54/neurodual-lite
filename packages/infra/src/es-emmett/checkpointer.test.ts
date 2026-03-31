/**
 * Tests for the Checkpointer — checkpoint read/write for ES processors.
 */

import { describe, expect, it, mock } from 'bun:test';
import type { AbstractPowerSyncDatabase } from '@powersync/web';
import { createCheckpointer } from './checkpointer';

// =============================================================================
// Mock DB for emt_subscriptions
// =============================================================================

function createMockDb() {
  const subscriptions = new Map<
    string,
    {
      id: string;
      subscription_id: string;
      version: number;
      partition: string;
      last_processed_position: string;
    }
  >();

  const execute = async (
    sql: string,
    params: (string | number | null)[] = [],
  ): Promise<{ rowsAffected: number }> => {
    const upperSql = sql.trim().toUpperCase();

    if (upperSql.startsWith('UPDATE') && sql.includes('emt_subscriptions')) {
      const version = params[0] as number;
      const position = params[1] as string;
      const id = params[2] as string;
      const existing = subscriptions.get(id);
      if (existing) {
        subscriptions.set(id, { ...existing, version, last_processed_position: position });
        return { rowsAffected: 1 };
      }
      return { rowsAffected: 0 };
    }

    if (upperSql.startsWith('INSERT') && sql.includes('emt_subscriptions')) {
      const id = params[0] as string;
      if (!subscriptions.has(id)) {
        subscriptions.set(id, {
          id,
          subscription_id: params[1] as string,
          version: params[2] as number,
          partition: params[3] as string,
          last_processed_position: params[4] as string,
        });
      }
      return { rowsAffected: 1 };
    }

    if (upperSql.startsWith('DELETE') && sql.includes('emt_subscriptions')) {
      const id = params[0] as string;
      subscriptions.delete(id);
      return { rowsAffected: 1 };
    }

    return { rowsAffected: 0 };
  };

  const getOptional = async <T>(
    sql: string,
    params: (string | number)[] = [],
  ): Promise<T | null> => {
    if (sql.includes('emt_subscriptions')) {
      const id = params[0] as string;
      const row = subscriptions.get(id);
      return (row as T) ?? null;
    }
    return null;
  };

  const mockDb = { execute, getOptional } as unknown as AbstractPowerSyncDatabase;
  return { mockDb, subscriptions };
}

// =============================================================================
// Tests
// =============================================================================

describe('checkpointer', () => {
  it('should return null for non-existent processor', async () => {
    const { mockDb } = createMockDb();
    const checkpointer = createCheckpointer(mockDb);

    const result = await checkpointer.read('non-existent');
    expect(result).toBeNull();
  });

  it('should write and read a checkpoint', async () => {
    const { mockDb } = createMockDb();
    const checkpointer = createCheckpointer(mockDb);

    await checkpointer.write('streak', 3, 12345n);
    const result = await checkpointer.read('streak');

    expect(result).not.toBeNull();
    expect(result!.id).toBe('streak');
    expect(result!.version).toBe(3);
    expect(result!.last_processed_position).toBe('12345');
  });

  it('should update existing checkpoint', async () => {
    const { mockDb } = createMockDb();
    const checkpointer = createCheckpointer(mockDb);

    await checkpointer.write('streak', 1, 100n);
    await checkpointer.write('streak', 2, 200n);

    const result = await checkpointer.read('streak');
    expect(result!.version).toBe(2);
    expect(result!.last_processed_position).toBe('200');
  });

  it('should reset a checkpoint', async () => {
    const { mockDb } = createMockDb();
    const checkpointer = createCheckpointer(mockDb);

    await checkpointer.write('streak', 1, 100n);
    await checkpointer.reset('streak');

    const result = await checkpointer.read('streak');
    expect(result).toBeNull();
  });

  it('should manage multiple processors independently', async () => {
    const { mockDb } = createMockDb();
    const checkpointer = createCheckpointer(mockDb);

    await checkpointer.write('streak', 1, 100n);
    await checkpointer.write('daily-activity', 2, 200n);
    await checkpointer.write('n-level', 1, 150n);

    expect((await checkpointer.read('streak'))!.last_processed_position).toBe('100');
    expect((await checkpointer.read('daily-activity'))!.last_processed_position).toBe('200');
    expect((await checkpointer.read('n-level'))!.last_processed_position).toBe('150');

    // Reset one doesn't affect others
    await checkpointer.reset('streak');
    expect(await checkpointer.read('streak')).toBeNull();
    expect((await checkpointer.read('daily-activity'))!.version).toBe(2);
  });

  it('should detect version mismatch', async () => {
    const { mockDb } = createMockDb();
    const checkpointer = createCheckpointer(mockDb);

    await checkpointer.write('streak', 1, 100n);
    const cp = await checkpointer.read('streak');

    // Processor definition bumps version to 2 — checkpoint still has 1
    expect(cp!.version).toBe(1);
    expect(cp!.version !== 2).toBe(true); // mismatch → caller triggers replay
  });

  it('should avoid repeated INSERT OR IGNORE when rowsAffected is unavailable', async () => {
    const subscriptions = new Map<
      string,
      {
        id: string;
        subscription_id: string;
        version: number;
        partition: string;
        last_processed_position: string;
      }
    >();

    const execute = mock(async (sql: string, params: (string | number | null)[] = []) => {
      const upperSql = sql.trim().toUpperCase();

      if (upperSql.startsWith('UPDATE') && sql.includes('emt_subscriptions')) {
        const id = params[2] as string;
        const existing = subscriptions.get(id);
        if (existing) {
          subscriptions.set(id, {
            ...existing,
            version: params[0] as number,
            last_processed_position: params[1] as string,
          });
        }
        // Simulate PowerSync runtime where rowsAffected is not reliable.
        return {};
      }

      if (upperSql.startsWith('INSERT') && sql.includes('emt_subscriptions')) {
        const id = params[0] as string;
        subscriptions.set(id, {
          id,
          subscription_id: params[1] as string,
          version: params[2] as number,
          partition: params[3] as string,
          last_processed_position: params[4] as string,
        });
        return {};
      }

      return {};
    });

    const getOptional = async <T>(
      sql: string,
      params: (string | number)[] = [],
    ): Promise<T | null> => {
      if (!sql.includes('emt_subscriptions')) return null;
      const row = subscriptions.get(params[0] as string);
      return (row as T) ?? null;
    };

    const checkpointer = createCheckpointer({
      execute,
      getOptional,
    } as unknown as AbstractPowerSyncDatabase);

    await checkpointer.write('streak', 1, 100n);
    await checkpointer.write('streak', 1, 200n);
    await checkpointer.write('streak', 1, 300n);

    const insertCalls = execute.mock.calls.filter(([sql]) =>
      (sql as string).includes('INSERT OR IGNORE INTO emt_subscriptions'),
    );
    expect(insertCalls).toHaveLength(1);
    expect((await checkpointer.read('streak'))!.last_processed_position).toBe('300');
  });

  it('should batch checkpoint reads with a single getAll query when available', async () => {
    const subscriptions = new Map<string, any>([
      [
        'streak',
        {
          id: 'streak',
          subscription_id: 'streak',
          version: 2,
          partition: 'global',
          last_processed_position: '100',
        },
      ],
      [
        'daily-activity',
        {
          id: 'daily-activity',
          subscription_id: 'daily-activity',
          version: 2,
          partition: 'global',
          last_processed_position: '90',
        },
      ],
    ]);

    const getAll = mock(async <T>(sql: string, params: unknown[] = []): Promise<T[]> => {
      expect(sql).toContain('cp:read-many:3');
      const rows = (params as string[])
        .map((id) => subscriptions.get(id))
        .filter((row): row is any => Boolean(row));
      return rows as T[];
    });

    const getOptional = mock(async <T>(): Promise<T | null> => null);
    const checkpointer = createCheckpointer({
      getAll,
      getOptional,
      execute: async () => ({ rowsAffected: 0 }),
    } as unknown as AbstractPowerSyncDatabase);

    const rows = await checkpointer.readMany(['streak', 'daily-activity', 'n-level']);
    expect(rows.size).toBe(2);
    expect(rows.get('streak')?.last_processed_position).toBe('100');
    expect(rows.get('daily-activity')?.last_processed_position).toBe('90');
    expect(getAll).toHaveBeenCalledTimes(1);
    expect(getOptional).toHaveBeenCalledTimes(0);
  });

  it('should preserve db binding when using getAll for batch reads', async () => {
    const subscriptions = new Map<string, any>([
      [
        'streak',
        {
          id: 'streak',
          subscription_id: 'streak',
          version: 2,
          partition: 'global',
          last_processed_position: '100',
        },
      ],
    ]);

    const mockDb = {
      waitForReady: async () => {},
      async execute() {
        return { rowsAffected: 0 };
      },
      async getOptional<T>(): Promise<T | null> {
        return null;
      },
      async getAll<T>(
        this: { waitForReady?: () => Promise<void> },
        _sql: string,
        params: unknown[] = [],
      ): Promise<T[]> {
        await this.waitForReady?.();
        return (params as string[])
          .map((id) => subscriptions.get(id))
          .filter((row): row is any => Boolean(row) as any) as T[];
      },
    } as unknown as AbstractPowerSyncDatabase;

    const checkpointer = createCheckpointer(mockDb);
    const rows = await checkpointer.readMany(['streak']);

    expect(rows.get('streak')?.last_processed_position).toBe('100');
  });
});
