import { describe, expect, it, mock } from 'bun:test';
import { Database } from 'bun:sqlite';

import { SQLITE_SCHEMA } from '../db/sqlite-schema';
import { createDailyActivityAdapter } from './daily-activity-adapter';

// =============================================================================
// In-memory DB helper (matches PowerSync API surface used by the adapter)
// =============================================================================

class TestPowerSyncDb {
  private readonly inner = new Database(':memory:');

  constructor() {
    this.inner.exec(SQLITE_SCHEMA);
  }

  async execute(
    sql: string,
    parameters?: readonly unknown[],
  ): Promise<{ rows: { _array: Record<string, unknown>[] }; rowsAffected: number }> {
    const normalized = sql.trim().toUpperCase();
    if (normalized.startsWith('SELECT')) {
      const rows = this.inner.query(sql).all(...((parameters ?? []) as any)) as Record<
        string,
        unknown
      >[];
      return { rows: { _array: rows }, rowsAffected: 0 };
    }
    const result = this.inner.query(sql).run(...((parameters ?? []) as any));
    return { rows: { _array: [] }, rowsAffected: result.changes };
  }

  async getOptional<T extends object>(
    sql: string,
    parameters?: readonly unknown[],
  ): Promise<T | null> {
    const rows = this.inner.query(sql).all(...((parameters ?? []) as any)) as T[];
    return rows[0] ?? null;
  }

  async getAll<T extends object>(sql: string, parameters?: readonly unknown[]): Promise<T[]> {
    return this.inner.query(sql).all(...((parameters ?? []) as any)) as T[];
  }

  /** Insert a row directly for test setup. */
  insertActivity(date: string, sessionsCount: number, totalDurationMs: number = 0): void {
    this.inner
      .query(
        `INSERT INTO daily_activity_projection (date, sessions_count, total_duration_ms) VALUES (?, ?, ?)`,
      )
      .run(...([date, sessionsCount, totalDurationMs] as any));
  }
}

// =============================================================================
// extractRows helper (exported indirectly, test via adapter behavior)
// =============================================================================

describe('extractRows via getDailyActivity', () => {
  it('handles PowerSync result format with rows._array', async () => {
    const db = new TestPowerSyncDb();
    db.insertActivity('2026-03-10', 3);

    // The TestPowerSyncDb.execute returns { rows: { _array: [...] } }
    // which matches the PowerSync format that extractRows handles.
    const adapter = createDailyActivityAdapter(db as any, 'user-1');
    const result = await adapter.getDailyActivity(30);

    const entry = result.find((r) => r.date === '2026-03-10');
    expect(entry).toBeDefined();
    expect(entry!.count).toBe(3);
  });

  it('handles result with rows as direct array', async () => {
    // Create a mock db that returns rows as a direct array (alternative PowerSync format)
    const mockDb = {
      execute: mock(async () => ({
        rows: [{ date: '2026-03-10', sessions_count: 5 }],
        rowsAffected: 0,
      })),
      getOptional: mock(async () => null),
    };

    const adapter = createDailyActivityAdapter(mockDb as any, 'user-1');
    const result = await adapter.getDailyActivity(30);

    const entry = result.find((r) => r.date === '2026-03-10');
    expect(entry).toBeDefined();
    expect(entry!.count).toBe(5);
  });
});

// =============================================================================
// getDailyActivity
// =============================================================================

describe('getDailyActivity', () => {
  it('returns empty array when table is empty', async () => {
    const db = new TestPowerSyncDb();
    const adapter = createDailyActivityAdapter(db as any, 'user-1');

    const result = await adapter.getDailyActivity(30);
    expect(result).toEqual([]);
  });

  it('returns entries within the date range', async () => {
    const db = new TestPowerSyncDb();
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    db.insertActivity(today, 2);
    db.insertActivity(yesterday, 1);

    const adapter = createDailyActivityAdapter(db as any, 'user-1');
    const result = await adapter.getDailyActivity(7);

    expect(result).toHaveLength(2);
    expect(result.map((r) => r.date).sort()).toEqual([yesterday, today].sort());
  });

  it('excludes entries outside the date range', async () => {
    const db = new TestPowerSyncDb();
    const today = new Date().toISOString().slice(0, 10);

    // Insert an old entry (100 days ago)
    const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    db.insertActivity(today, 1);
    db.insertActivity(oldDate, 5);

    const adapter = createDailyActivityAdapter(db as any, 'user-1');
    const result = await adapter.getDailyActivity(30);

    expect(result).toHaveLength(1);
    expect(result[0]!.date).toBe(today);
  });

  it('returns results ordered by date ascending', async () => {
    const db = new TestPowerSyncDb();
    const today = new Date().toISOString().slice(0, 10);
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    // Insert out of order
    db.insertActivity(today, 1);
    db.insertActivity(twoDaysAgo, 3);
    db.insertActivity(yesterday, 2);

    const adapter = createDailyActivityAdapter(db as any, 'user-1');
    const result = await adapter.getDailyActivity(7);

    expect(result).toHaveLength(3);
    expect(result[0]!.date).toBe(twoDaysAgo);
    expect(result[1]!.date).toBe(yesterday);
    expect(result[2]!.date).toBe(today);
  });

  it('maps sessions_count to count in returned objects', async () => {
    const db = new TestPowerSyncDb();
    const today = new Date().toISOString().slice(0, 10);
    db.insertActivity(today, 7);

    const adapter = createDailyActivityAdapter(db as any, 'user-1');
    const result = await adapter.getDailyActivity(7);

    expect(result[0]).toEqual({ date: today, count: 7 });
  });
});

// =============================================================================
// getActivityForDate
// =============================================================================

describe('getActivityForDate', () => {
  it('returns count for existing date', async () => {
    const db = new TestPowerSyncDb();
    db.insertActivity('2026-03-10', 4);

    const adapter = createDailyActivityAdapter(db as any, 'user-1');
    const count = await adapter.getActivityForDate('2026-03-10');

    expect(count).toBe(4);
  });

  it('returns 0 for missing date', async () => {
    const db = new TestPowerSyncDb();

    const adapter = createDailyActivityAdapter(db as any, 'user-1');
    const count = await adapter.getActivityForDate('2026-03-10');

    expect(count).toBe(0);
  });
});

// =============================================================================
// getTotalSessions
// =============================================================================

describe('getTotalSessions', () => {
  it('returns sum of all sessions_count values', async () => {
    const db = new TestPowerSyncDb();
    db.insertActivity('2026-03-08', 2);
    db.insertActivity('2026-03-09', 3);
    db.insertActivity('2026-03-10', 1);

    const adapter = createDailyActivityAdapter(db as any, 'user-1');
    const total = await adapter.getTotalSessions();

    expect(total).toBe(6);
  });

  it('returns 0 when table is empty', async () => {
    const db = new TestPowerSyncDb();

    const adapter = createDailyActivityAdapter(db as any, 'user-1');
    const total = await adapter.getTotalSessions();

    expect(total).toBe(0);
  });
});

// =============================================================================
// refresh and reset
// =============================================================================

describe('refresh', () => {
  it('is a no-op that resolves without error', async () => {
    const db = new TestPowerSyncDb();
    const adapter = createDailyActivityAdapter(db as any, 'user-1');

    // Should not throw
    await adapter.refresh();
  });
});
