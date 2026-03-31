// packages/infra/src/projections/streak-adapter.ts
/**
 * Streak Adapter
 *
 * Implements StreakPort via direct SQL on streak_projection table.
 * The table is maintained by ProjectionProcessor (incremental + version replay).
 */

import type { AbstractPowerSyncDatabase } from '@powersync/web';
import type { StreakInfo } from '@neurodual/logic';
import { streakStateToInfo, type StreakState } from './streak-projection';
import { getConfiguredProcessorEngine } from './configured-engine';

// =============================================================================
// Streak Adapter
// =============================================================================

export interface StreakAdapterOptions {
  readonly autoRefresh?: boolean;
}

/**
 * Create a streak adapter that reads from the projection table.
 *
 * @param db - PowerSync database
 * @param _userId - User ID (for API compatibility, single global streak)
 */
export function createStreakAdapter(
  db: AbstractPowerSyncDatabase,
  _userId: string,
  _options?: StreakAdapterOptions,
) {
  async function getStreakInfo(): Promise<StreakInfo> {
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

  async function refresh(): Promise<StreakInfo> {
    return getStreakInfo();
  }

  async function reset(): Promise<void> {
    const engine = getConfiguredProcessorEngine(db);
    await engine.rebuild('streak');
  }

  return {
    getStreakInfo,
    refresh,
    reset,
  };
}

export type StreakAdapter = ReturnType<typeof createStreakAdapter>;
