import { describe, expect, it } from 'bun:test';
import type { PersistencePort } from '@neurodual/logic';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { runHistoryBigBangCutover } from './history-bigbang';

function createPersistenceStub(options?: { onDrizzleRun?: (runIndex: number) => void }) {
  const sqlWrites: string[] = [];
  let runIndex = 0;
  const meta = new Map<string, string>();
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE session_summaries (
      session_id TEXT PRIMARY KEY,
      user_id TEXT,
      created_at TEXT,
      reason TEXT,
      n_level INTEGER,
      game_mode TEXT,
      play_context TEXT
    );
    CREATE TABLE events (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      session_id TEXT,
      type TEXT,
      deleted INTEGER,
      timestamp INTEGER
    );
  `);

  const drizzleDb = drizzle(sqlite);

  const persistence: any = {
    getDrizzleDb() {
      return {
        run: async (query: unknown): Promise<void> => {
          runIndex += 1;
          options?.onDrizzleRun?.(runIndex);
          await (drizzleDb as unknown as { run: (q: unknown) => Promise<void> }).run(query);
        },
        all: async <T>(query: unknown): Promise<T[]> =>
          (drizzleDb as unknown as { all: <R>(q: unknown) => Promise<R[]> }).all<T>(query),
      };
    },
    async execute(sql: string): Promise<void> {
      const normalized = sql.trim();
      sqlWrites.push(normalized);
      sqlite.query(normalized).run();
    },
    async writeTransaction(fn: any): Promise<any> {
      return fn({
        async execute(sql: string): Promise<void> {
          const normalized = sql.trim();
          sqlWrites.push(normalized);
          sqlite.query(normalized).run();
        },
      });
    },
    async getSyncMeta(key: string): Promise<string | null> {
      return meta.get(key) ?? null;
    },
    async setSyncMeta(key: string, value: string): Promise<void> {
      meta.set(key, value);
    },
  };

  return { persistence: persistence as PersistencePort, sqlWrites, meta };
}

describe('runHistoryBigBangCutover', () => {
  it('applies cutover once and persists marker', async () => {
    const { persistence, sqlWrites, meta } = createPersistenceStub();

    const report = await runHistoryBigBangCutover(persistence, 'user-1', {
      deps: {
        rebuildAllSummaries: async () => 12,
      },
    });

    expect(report.applied).toBe(true);
    expect(report.projectedSummaries).toBe(12);
    expect(report.rebuiltSnapshotsFromSessions).toBe(0);
    expect([...meta.keys()].some((key) => key.includes('history:big-bang-cutover:v1:user-1'))).toBe(
      true,
    );
    expect(sqlWrites.some((sql) => sql.includes('DELETE FROM session_summaries'))).toBe(true);
  });

  it('skips when marker exists and force is not set', async () => {
    const { persistence } = createPersistenceStub();

    await runHistoryBigBangCutover(persistence, 'user-1', {
      deps: {
        rebuildAllSummaries: async () => 1,
      },
    });

    const second = await runHistoryBigBangCutover(persistence, 'user-1', {
      deps: {
        rebuildAllSummaries: async () => 999,
      },
    });

    expect(second.applied).toBe(false);
    expect(second.projectedSummaries).toBe(0);
    expect(second.rebuiltSnapshotsFromSessions).toBe(0);
  });

  it('re-applies when force is true', async () => {
    const { persistence } = createPersistenceStub();

    await runHistoryBigBangCutover(persistence, 'user-1', {
      deps: {
        rebuildAllSummaries: async () => 1,
      },
    });

    const forced = await runHistoryBigBangCutover(persistence, 'user-1', {
      force: true,
      deps: {
        rebuildAllSummaries: async () => 7,
      },
    });

    expect(forced.applied).toBe(true);
    expect(forced.projectedSummaries).toBe(7);
    expect(forced.rebuiltSnapshotsFromSessions).toBe(0);
  });

  it('ignores non-fatal schema hotfix errors on PowerSync view-backed runtimes', async () => {
    const { persistence } = createPersistenceStub({
      onDrizzleRun: (index) => {
        if (index === 1) {
          throw new Error('Cannot add a column to a view');
        }
        if (index >= 2 && index <= 7) {
          throw new Error('Views may not be indexed');
        }
      },
    });

    const report = await runHistoryBigBangCutover(persistence, 'user-1', {
      deps: {
        rebuildAllSummaries: async () => 5,
      },
    });

    expect(report.applied).toBe(true);
    expect(report.projectedSummaries).toBe(5);
    expect(report.rebuiltSnapshotsFromSessions).toBe(0);
  });
});
