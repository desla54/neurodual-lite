import { describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';

import { SQLITE_SCHEMA } from '../db/sqlite-schema';
import { streakStateToInfo, type StreakState } from './streak-projection';

// =============================================================================
// TestPowerSyncDb (minimal mock for adapter testing)
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

  async getAll<T extends object>(sql: string, parameters?: readonly unknown[]): Promise<T[]> {
    return this.inner.query(sql).all(...((parameters ?? []) as any)) as T[];
  }

  async getOptional<T extends object>(
    sql: string,
    parameters?: readonly unknown[],
  ): Promise<T | null> {
    const rows = this.inner.query(sql).all(...((parameters ?? []) as any)) as T[];
    return rows[0] ?? null;
  }

  setStreak(current: number, best: number, lastActiveDate: string | null): void {
    this.inner
      .query(
        `UPDATE streak_projection SET current_streak = ?, best_streak = ?, last_active_date = ? WHERE id = '1'`,
      )
      .run(...([current, best, lastActiveDate] as any));
  }

  clearStreak(): void {
    this.inner.query(`DELETE FROM streak_projection`).run();
  }
}

// =============================================================================
// Adapter logic extracted (avoid importing createStreakAdapter which depends on
// getConfiguredProcessorEngine — we test the core getStreakInfo logic directly)
// =============================================================================

/**
 * Replicate the adapter's getStreakInfo logic to avoid importing
 * createStreakAdapter which pulls in getConfiguredProcessorEngine
 * and other runtime dependencies.
 */
async function getStreakInfo(
  db: TestPowerSyncDb,
): Promise<{ current: number; best: number; lastActiveDate: string | null }> {
  const row = await db.getOptional<{
    current_streak: number;
    best_streak: number;
    last_active_date: string | null;
  }>('SELECT current_streak, best_streak, last_active_date FROM streak_projection WHERE id = 1');

  if (!row) return { current: 0, best: 0, lastActiveDate: null };

  const state: StreakState = {
    currentStreak: row.current_streak ?? 0,
    bestStreak: row.best_streak ?? 0,
    lastActiveDate: row.last_active_date ?? null,
  };
  return streakStateToInfo(state);
}

// =============================================================================
// Tests
// =============================================================================

describe('streak-adapter getStreakInfo', () => {
  it('returns defaults when streak_projection row exists with zeroed values', async () => {
    const db = new TestPowerSyncDb();
    // SQLITE_SCHEMA inserts the default row with id='1', current=0, best=0, null date
    const info = await getStreakInfo(db);
    expect(info).toEqual({ current: 0, best: 0, lastActiveDate: null });
  });

  it('returns defaults when streak_projection table is empty', async () => {
    const db = new TestPowerSyncDb();
    db.clearStreak();
    const info = await getStreakInfo(db);
    expect(info).toEqual({ current: 0, best: 0, lastActiveDate: null });
  });

  it('returns correct StreakInfo when row has values and streak is active', async () => {
    const db = new TestPowerSyncDb();
    // Set a recent last_active_date (today-like)
    const today = new Date().toISOString().slice(0, 10);
    db.setStreak(7, 12, today);

    const info = await getStreakInfo(db);
    expect(info).toEqual({ current: 7, best: 12, lastActiveDate: today });
  });

  it('returns zero current when streak is expired (old lastActiveDate)', async () => {
    const db = new TestPowerSyncDb();
    db.setStreak(5, 10, '2020-01-01');

    const info = await getStreakInfo(db);
    expect(info.current).toBe(0);
    expect(info.best).toBe(10);
    expect(info.lastActiveDate).toBe('2020-01-01');
  });

  it('returns active streak when last active was yesterday', async () => {
    const db = new TestPowerSyncDb();
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    db.setStreak(3, 5, yesterday);

    const info = await getStreakInfo(db);
    expect(info.current).toBe(3);
    expect(info.best).toBe(5);
  });

  it('applies streakStateToInfo transform correctly on DB values', async () => {
    const db = new TestPowerSyncDb();
    // Set streak with a date 3 days ago (72h > 48h threshold)
    const threeDaysAgo = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString().slice(0, 10);
    db.setStreak(8, 15, threeDaysAgo);

    const info = await getStreakInfo(db);
    // 3 days ago = 72h > 48h => streak is broken
    expect(info.current).toBe(0);
    expect(info.best).toBe(15);
    expect(info.lastActiveDate).toBe(threeDaysAgo);
  });

  it('handles null values in DB columns gracefully', async () => {
    const db = new TestPowerSyncDb();
    // The default row has null last_active_date - verify it works
    const info = await getStreakInfo(db);
    expect(info.lastActiveDate).toBeNull();
    expect(info.current).toBe(0);
    expect(info.best).toBe(0);
  });
});
