// packages/infra/src/projections/daily-activity-adapter.ts
/**
 * Daily Activity Adapter
 *
 * Implements DailyActivityPort via direct SQL on daily_activity_projection table.
 * The table is maintained by ProjectionProcessor (incremental + version replay).
 */

import type { AbstractPowerSyncDatabase } from '@powersync/web';
import type { DailyActivity } from './daily-activity-projection';
// =============================================================================
// Daily Activity Adapter
// =============================================================================

export interface DailyActivityAdapterOptions {
  readonly autoRefresh?: boolean;
}

/**
 * Create a daily activity adapter that reads from the projection table.
 *
 * @param db - PowerSync database
 * @param _userId - User ID (for API compatibility, global activity)
 * @param _options - Options (for API compatibility)
 */
export function createDailyActivityAdapter(
  db: AbstractPowerSyncDatabase,
  _userId: string,
  _options?: DailyActivityAdapterOptions,
) {
  async function getDailyActivity(days: number = 30): Promise<DailyActivity[]> {
    const endDate = new Date().toISOString().slice(0, 10);
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const result = await db.execute(
      `SELECT date, sessions_count FROM daily_activity_projection
       WHERE date >= ? AND date <= ?
       ORDER BY date ASC`,
      [startDate, endDate],
    );

    const rows = extractRows<{ date: string; sessions_count: number }>(result);
    return rows.map((r) => ({ date: r.date, count: r.sessions_count }));
  }

  async function getActivityForDate(date: string): Promise<number> {
    const row = await db.getOptional<{ sessions_count: number }>(
      'SELECT sessions_count FROM daily_activity_projection WHERE date = ?',
      [date],
    );
    return row?.sessions_count ?? 0;
  }

  async function getTotalSessions(): Promise<number> {
    const row = await db.getOptional<{ total: number }>(
      'SELECT COALESCE(SUM(sessions_count), 0) as total FROM daily_activity_projection',
    );
    return row?.total ?? 0;
  }

  async function refresh(): Promise<void> {
    // No-op: projections are updated on each session end
  }

  async function reset(): Promise<void> {
    // No-op: processor engine removed (ES removal)
  }

  return {
    getDailyActivity,
    getActivityForDate,
    getTotalSessions,
    refresh,
    reset,
  };
}

export type DailyActivityAdapter = ReturnType<typeof createDailyActivityAdapter>;

function extractRows<T>(result: unknown): T[] {
  if (typeof result !== 'object' || result === null) return [];
  const rowsValue = (result as Record<string, unknown>)['rows'];
  if (Array.isArray(rowsValue)) return rowsValue as T[];
  if (typeof rowsValue !== 'object' || rowsValue === null) return [];
  const arr = (rowsValue as Record<string, unknown>)['_array'];
  return Array.isArray(arr) ? (arr as T[]) : [];
}
