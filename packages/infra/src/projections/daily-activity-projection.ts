// packages/infra/src/projections/daily-activity-projection.ts
/**
 * Daily Activity Projection
 *
 * Counts completed sessions per day.
 * Used for activity charts and streak calculation.
 *
 * Phase 3 Migration: New projection using Emmett for O(1) daily activity queries
 * instead of CTE SQL on session_summaries.
 */

import type { GameEvent } from '@neurodual/logic';
import { SESSION_END_EVENT_TYPES } from '@neurodual/logic';
import type { ProjectionDefinition } from './projection-definition';

// =============================================================================
// Types
// =============================================================================

export interface DailyActivity {
  date: string; // YYYY-MM-DD
  count: number;
}

// =============================================================================
// Projection State
// =============================================================================

export interface DailyActivityState {
  readonly byDate: ReadonlyMap<string, number>; // "YYYY-MM-DD" -> count
}

export interface DailyActivityCheckpoint {
  position: number; // global_position from emt_messages
  state: DailyActivityState;
}

// =============================================================================
// Projection Logic
// =============================================================================

/**
 * Get current date in YYYY-MM-DD format (UTC).
 */
function getCurrentDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Get date from timestamp in YYYY-MM-DD format (UTC).
 */
function getDateFromTimestamp(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

/**
 * Create initial daily activity state.
 */
export function createInitialDailyActivityState(): DailyActivityState {
  return {
    byDate: new Map<string, number>(),
  };
}

/**
 * Evolve daily activity state with a new event.
 * Only SESSION_ENDED events with reason='completed' affect activity.
 */
export function evolveDailyActivityState(
  state: DailyActivityState,
  event: GameEvent,
): DailyActivityState {
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

  const date = getDateFromTimestamp(event.timestamp);
  const currentCount = state.byDate.get(date) ?? 0;

  const newByDate = new Map(state.byDate);
  newByDate.set(date, currentCount + 1);

  return {
    byDate: newByDate,
  };
}

/**
 * Evolve daily activity state from Emmett stored event.
 * Optimized version that reads directly from emt_messages format.
 */
export function evolveDailyActivityStateFromEmmett(
  state: DailyActivityState,
  event: { type: string; data: Record<string, unknown>; createdAt: Date },
): DailyActivityState {
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

  const date = getDateFromTimestamp(event.createdAt.getTime());
  const currentCount = state.byDate.get(date) ?? 0;

  const newByDate = new Map(state.byDate);
  newByDate.set(date, currentCount + 1);

  return {
    byDate: newByDate,
  };
}

// =============================================================================
// Query Helpers
// =============================================================================

/**
 * Get activity for the last N days from state.
 */
export function getRecentActivity(state: DailyActivityState, days: number = 30): DailyActivity[] {
  const result: DailyActivity[] = [];
  const today = getCurrentDate();

  for (let i = 0; i < days; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().slice(0, 10);

    result.push({
      date: dateStr,
      count: state.byDate.get(dateStr) ?? 0,
    });
  }

  return result;
}

/**
 * Get activity for a single date.
 */
export function getActivityForDate(state: DailyActivityState, date: string): number {
  return state.byDate.get(date) ?? 0;
}

/**
 * Get total sessions count from state.
 */
export function getTotalSessions(state: DailyActivityState): number {
  let total = 0;
  for (const count of state.byDate.values()) {
    total += count;
  }
  return total;
}

// =============================================================================
// Projection Definition (Emmett-inspired: handle + truncate)
// =============================================================================

export const dailyActivityProjectionDefinition: ProjectionDefinition = {
  id: 'daily-activity',
  version: 2, // v2: added TRACE_SESSION_ENDED + totalDurationMs
  canHandle: SESSION_END_EVENT_TYPES,

  async handle(events, db) {
    const aggregates = new Map<string, { count: number; durationMs: number }>();

    for (const event of events) {
      const reason = event.data['reason'] as string | undefined;
      if (reason !== 'completed' && reason !== undefined) continue;

      const date = getDateFromTimestamp(event.createdAt.getTime());
      const duration = (event.data['durationMs'] as number) || 0;

      const current = aggregates.get(date) ?? { count: 0, durationMs: 0 };
      aggregates.set(date, {
        count: current.count + 1,
        durationMs: current.durationMs + duration,
      });
    }

    // PowerSync tables are views; SQLite forbids UPSERT on views.
    for (const [date, agg] of aggregates) {
      await db.execute(
        `INSERT OR IGNORE INTO daily_activity_projection (date, sessions_count, total_duration_ms)
         VALUES (?, 0, 0)`,
        [date],
      );
      await db.execute(
        `UPDATE daily_activity_projection
         SET sessions_count = COALESCE(sessions_count, 0) + ?,
             total_duration_ms = COALESCE(total_duration_ms, 0) + ?
         WHERE date = ?`,
        [agg.count, agg.durationMs, date],
      );
    }
  },

  async truncate(db) {
    await db.execute('DELETE FROM daily_activity_projection');
  },
};
