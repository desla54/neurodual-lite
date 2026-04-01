// packages/infra/src/projections/streak-projection.ts
/**
 * Streak Projection
 *
 * Computes user streak from session events.
 * Tracks current streak, best streak, and last active date.
 *
 * Projection maintained incrementally for O(1) streak queries.
 */

import type { GameEvent, StreakInfo } from '@neurodual/logic';
import { SESSION_END_EVENT_TYPES } from '@neurodual/logic';
import type { AbstractPowerSyncDatabase } from '@powersync/web';
import type { ProjectedEvent, ProjectionDefinition } from './projection-definition';

// =============================================================================
// Projection State
// =============================================================================

/**
 * Re-export StreakInfo from @neurodual/logic as the canonical type.
 *
 * This is the single source of truth for streak information across the entire
 * application. All external APIs should use this type.
 */
export type { StreakInfo };

/**
 * Internal projection state with DB column names (snake_case).
 *
 * This type is used ONLY for reading/writing from the streak_projection table.
 * The mapping to/from StreakInfo is handled by streakStateToInfo().
 *
 * @deprecated This type exists only for DB compatibility. External code should
 * always use StreakInfo from @neurodual/logic. The mapping is handled by
 * streakStateToInfo() which applies the "streak active" logic.
 */
export interface StreakState {
  /** DB column: current_streak - raw stored value (may be inactive) */
  currentStreak: number;
  /** DB column: best_streak - all-time best streak */
  bestStreak: number;
  /** DB column: last_active_date - ISO date string (YYYY-MM-DD) */
  lastActiveDate: string | null;
}

export interface StreakCheckpoint {
  position: number; // checkpoint position (legacy: global_position)
  state: StreakState;
}

// =============================================================================
// Constants
// =============================================================================

const STREAK_RESET_HOURS = 48; // Streak resets after 48 hours of inactivity

// =============================================================================
// Projection Logic
// =============================================================================

/**
 * Get current date in YYYY-MM-DD format (UTC).
 */
export function getCurrentDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Get date from timestamp in YYYY-MM-DD format (UTC).
 */
function getDateFromTimestamp(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

/**
 * Calculate hours difference between two dates.
 */
function hoursBetween(date1: string | null, date2: string): number {
  if (!date1) return 0;
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  return Math.abs(d2.getTime() - d1.getTime()) / (1000 * 60 * 60);
}

/**
 * Check if a date is consecutive to another date (within STREAK_RESET_HOURS).
 */
function isConsecutiveDate(lastDate: string | null, currentDate: string): boolean {
  if (!lastDate) return true;
  return hoursBetween(lastDate, currentDate) <= STREAK_RESET_HOURS;
}

/**
 * Create initial streak state.
 */
export function createInitialStreakState(): StreakState {
  return {
    currentStreak: 0,
    bestStreak: 0,
    lastActiveDate: null,
  };
}

/**
 * Evolve streak state with a new event.
 * Only SESSION_ENDED events with reason='completed' affect streak.
 */
export function evolveStreakState(state: StreakState, event: GameEvent): StreakState {
  // Only count completed sessions
  if (
    event.type !== 'SESSION_ENDED' &&
    event.type !== 'RECALL_SESSION_ENDED' &&
    event.type !== 'FLOW_SESSION_ENDED' &&
    event.type !== 'DUAL_PICK_SESSION_ENDED' &&
    event.type !== 'TRACE_SESSION_ENDED'
  ) {
    return state;
  }

  // Check if session was completed (not abandoned)
  const reason = (event as unknown as { reason?: string }).reason;
  if (reason !== 'completed' && reason !== undefined) {
    return state;
  }

  const currentDate = getDateFromTimestamp(event.timestamp);

  // Same day as last active - no change
  if (state.lastActiveDate === currentDate) {
    return state;
  }

  // Check if consecutive
  if (isConsecutiveDate(state.lastActiveDate, currentDate)) {
    const newCurrentStreak = state.currentStreak + 1;
    return {
      currentStreak: newCurrentStreak,
      bestStreak: Math.max(state.bestStreak, newCurrentStreak),
      lastActiveDate: currentDate,
    };
  }

  // Streak reset - start new streak
  return {
    currentStreak: 1,
    bestStreak: state.bestStreak, // Preserve best streak
    lastActiveDate: currentDate,
  };
}

/**
 * Evolve streak state from a stored event.
 * Reads event type and data from the projected event format.
 */
export function evolveStreakStateFromEmmett(
  state: StreakState,
  event: { type: string; data: Record<string, unknown>; createdAt: Date },
): StreakState {
  // Only count completed sessions
  if (
    event.type !== 'SESSION_ENDED' &&
    event.type !== 'RECALL_SESSION_ENDED' &&
    event.type !== 'FLOW_SESSION_ENDED' &&
    event.type !== 'DUAL_PICK_SESSION_ENDED' &&
    event.type !== 'TRACE_SESSION_ENDED'
  ) {
    return state;
  }

  // Check if session was completed (not abandoned)
  const reason = event.data['reason'] as string | undefined;
  if (reason !== 'completed' && reason !== undefined) {
    return state;
  }

  const currentDate = getDateFromTimestamp(event.createdAt.getTime());

  // Same day as last active - no change
  if (state.lastActiveDate === currentDate) {
    return state;
  }

  // Check if consecutive
  if (isConsecutiveDate(state.lastActiveDate, currentDate)) {
    const newCurrentStreak = state.currentStreak + 1;
    return {
      currentStreak: newCurrentStreak,
      bestStreak: Math.max(state.bestStreak, newCurrentStreak),
      lastActiveDate: currentDate,
    };
  }

  // Streak reset - start new streak
  return {
    currentStreak: 1,
    bestStreak: state.bestStreak, // Preserve best streak
    lastActiveDate: currentDate,
  };
}

// =============================================================================
// Query Helpers
// =============================================================================

/**
 * Convert streak state to StreakInfo format.
 */
export function streakStateToInfo(state: StreakState, today?: string): StreakInfo {
  const todayDate = today ?? getCurrentDate();
  const hoursSinceLastActive = hoursBetween(state.lastActiveDate, todayDate);
  const daysSinceLastActive = state.lastActiveDate ? Math.floor(hoursSinceLastActive / 24) : null;

  // If last active was more than STREAK_RESET_HOURS ago, streak is broken
  const isStreakActive =
    daysSinceLastActive !== null && daysSinceLastActive * 24 <= STREAK_RESET_HOURS;

  return {
    current: isStreakActive ? state.currentStreak : 0,
    best: state.bestStreak,
    lastActiveDate: state.lastActiveDate,
  };
}

// =============================================================================
// Projection Definition (for ProjectionProcessor framework)
// =============================================================================

function evolveStreakFromProjectedEvent(state: StreakState, event: ProjectedEvent): StreakState {
  const reason = event.data['reason'] as string | undefined;
  if (reason !== 'completed' && reason !== undefined) return state;

  const eventDate = getDateFromTimestamp(event.createdAt.getTime());

  if (state.lastActiveDate === eventDate) return state;

  if (isConsecutiveDate(state.lastActiveDate, eventDate)) {
    const newCurrentStreak = state.currentStreak + 1;
    return {
      currentStreak: newCurrentStreak,
      bestStreak: Math.max(state.bestStreak, newCurrentStreak),
      lastActiveDate: eventDate,
    };
  }

  return {
    currentStreak: 1,
    bestStreak: state.bestStreak,
    lastActiveDate: eventDate,
  };
}

export const streakProjectionDefinition: ProjectionDefinition = {
  id: 'streak',
  version: 2, // v2: added TRACE_SESSION_ENDED
  canHandle: SESSION_END_EVENT_TYPES,

  async handle(events: readonly ProjectedEvent[], db: AbstractPowerSyncDatabase): Promise<void> {
    // Load current state (empty after truncate, populated during incremental)
    const row = await db.getOptional<{
      current_streak: number;
      best_streak: number;
      last_active_date: string | null;
    }>(
      "SELECT current_streak, best_streak, last_active_date FROM streak_projection WHERE id = '1'",
    );

    let state: StreakState = row
      ? {
          currentStreak: row.current_streak ?? 0,
          bestStreak: row.best_streak ?? 0,
          lastActiveDate: row.last_active_date ?? null,
        }
      : createInitialStreakState();

    for (const event of events) {
      state = evolveStreakFromProjectedEvent(state, event);
    }

    // PowerSync tables are views; SQLite forbids UPSERT on views.
    await db.execute(
      `INSERT OR IGNORE INTO streak_projection (id, current_streak, best_streak, last_active_date)
       VALUES ('1', 0, 0, NULL)`,
    );
    await db.execute(
      `UPDATE streak_projection
       SET current_streak = ?, best_streak = ?, last_active_date = ?
       WHERE id = '1'`,
      [state.currentStreak, state.bestStreak, state.lastActiveDate],
    );
  },

  async truncate(db: AbstractPowerSyncDatabase): Promise<void> {
    await db.execute('DELETE FROM streak_projection');
  },
};
