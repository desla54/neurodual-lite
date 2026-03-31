import { describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';

import type { GameEvent } from '@neurodual/logic';
import type { StoredEvent as EmmettStoredEvent } from '../es-emmett/powersync-emmett-event-store';
import { SQLITE_SCHEMA } from '../db/sqlite-schema';
import {
  createInitialDailyActivityState,
  evolveDailyActivityState,
  evolveDailyActivityStateFromEmmett,
  getRecentActivity,
  getActivityForDate,
  getTotalSessions,
  dailyActivityProjectionDefinition,
  type DailyActivityState,
} from './daily-activity-projection';

// =============================================================================
// Helpers
// =============================================================================

function makeGameEvent(
  type: string,
  timestamp: number,
  overrides: Record<string, unknown> = {},
): GameEvent {
  return {
    id: `evt-${timestamp}`,
    type,
    sessionId: `session-${timestamp}`,
    timestamp,
    schemaVersion: 1,
    reason: 'completed',
    ...overrides,
  } as unknown as GameEvent;
}

function makeEmmettEvent(
  type: string,
  createdAt: Date,
  data: Record<string, unknown> = {},
): EmmettStoredEvent {
  return {
    eventId: `evt-${createdAt.getTime()}`,
    streamPosition: 1n,
    globalPosition: BigInt(createdAt.getTime()),
    type,
    data: { reason: 'completed', ...data },
    metadata: {},
    createdAt,
  };
}

/** Produce a UTC timestamp for a given YYYY-MM-DD date at noon. */
function dateToTimestamp(dateStr: string): number {
  return new Date(`${dateStr}T12:00:00.000Z`).getTime();
}

// =============================================================================
// In-memory DB helper (reuses the same pattern as session-summaries test)
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
}

// =============================================================================
// createInitialDailyActivityState
// =============================================================================

describe('createInitialDailyActivityState', () => {
  it('returns empty state', () => {
    const state = createInitialDailyActivityState();
    expect(state.byDate).toBeInstanceOf(Map);
    expect(state.byDate.size).toBe(0);
  });
});

// =============================================================================
// evolveDailyActivityState (GameEvent)
// =============================================================================

describe('evolveDailyActivityState', () => {
  it('increments count for same day', () => {
    const ts1 = dateToTimestamp('2026-03-10');
    const ts2 = ts1 + 60_000; // 1 minute later, same day

    let state = createInitialDailyActivityState();
    state = evolveDailyActivityState(state, makeGameEvent('SESSION_ENDED', ts1));
    state = evolveDailyActivityState(state, makeGameEvent('SESSION_ENDED', ts2));

    expect(state.byDate.get('2026-03-10')).toBe(2);
    expect(state.byDate.size).toBe(1);
  });

  it('creates new entry for a different day', () => {
    const ts1 = dateToTimestamp('2026-03-10');
    const ts2 = dateToTimestamp('2026-03-11');

    let state = createInitialDailyActivityState();
    state = evolveDailyActivityState(state, makeGameEvent('SESSION_ENDED', ts1));
    state = evolveDailyActivityState(state, makeGameEvent('SESSION_ENDED', ts2));

    expect(state.byDate.get('2026-03-10')).toBe(1);
    expect(state.byDate.get('2026-03-11')).toBe(1);
    expect(state.byDate.size).toBe(2);
  });

  it('skips abandoned sessions (reason !== completed)', () => {
    const ts = dateToTimestamp('2026-03-10');
    let state = createInitialDailyActivityState();
    state = evolveDailyActivityState(
      state,
      makeGameEvent('SESSION_ENDED', ts, { reason: 'abandoned' }),
    );

    expect(state.byDate.size).toBe(0);
  });

  it('skips timed-out sessions', () => {
    const ts = dateToTimestamp('2026-03-10');
    let state = createInitialDailyActivityState();
    state = evolveDailyActivityState(
      state,
      makeGameEvent('SESSION_ENDED', ts, { reason: 'timeout' }),
    );

    expect(state.byDate.size).toBe(0);
  });

  it('accepts sessions with undefined reason (treated as completed)', () => {
    const ts = dateToTimestamp('2026-03-10');
    let state = createInitialDailyActivityState();
    state = evolveDailyActivityState(
      state,
      makeGameEvent('SESSION_ENDED', ts, { reason: undefined }),
    );

    expect(state.byDate.get('2026-03-10')).toBe(1);
  });

  it('ignores non-session-ended events', () => {
    const ts = dateToTimestamp('2026-03-10');
    let state = createInitialDailyActivityState();

    state = evolveDailyActivityState(state, makeGameEvent('SESSION_STARTED', ts));
    state = evolveDailyActivityState(state, makeGameEvent('TRIAL_PRESENTED', ts));
    state = evolveDailyActivityState(state, makeGameEvent('TRIAL_RESPONDED', ts));

    expect(state.byDate.size).toBe(0);
  });

  it('handles all mode-specific SESSION_ENDED variants', () => {
    const variants = [
      'SESSION_ENDED',
      'RECALL_SESSION_ENDED',
      'FLOW_SESSION_ENDED',
      'DUAL_PICK_SESSION_ENDED',
      'TRACE_SESSION_ENDED',
    ];

    let state = createInitialDailyActivityState();
    for (const type of variants) {
      state = evolveDailyActivityState(state, makeGameEvent(type, dateToTimestamp('2026-03-10')));
    }

    expect(state.byDate.get('2026-03-10')).toBe(variants.length);
  });

  it('returns the same reference when event is irrelevant', () => {
    const state = createInitialDailyActivityState();
    const next = evolveDailyActivityState(
      state,
      makeGameEvent('SESSION_STARTED', dateToTimestamp('2026-03-10')),
    );

    expect(next).toBe(state);
  });

  it('returns the same reference when session is abandoned', () => {
    const state = createInitialDailyActivityState();
    const next = evolveDailyActivityState(
      state,
      makeGameEvent('SESSION_ENDED', dateToTimestamp('2026-03-10'), { reason: 'abandoned' }),
    );

    expect(next).toBe(state);
  });
});

// =============================================================================
// evolveDailyActivityStateFromEmmett
// =============================================================================

describe('evolveDailyActivityStateFromEmmett', () => {
  it('increments count for same day', () => {
    const date = new Date('2026-03-10T12:00:00.000Z');
    const date2 = new Date('2026-03-10T13:00:00.000Z');

    let state = createInitialDailyActivityState();
    state = evolveDailyActivityStateFromEmmett(state, makeEmmettEvent('SESSION_ENDED', date));
    state = evolveDailyActivityStateFromEmmett(state, makeEmmettEvent('SESSION_ENDED', date2));

    expect(state.byDate.get('2026-03-10')).toBe(2);
  });

  it('creates new entry for a different day', () => {
    const date1 = new Date('2026-03-10T12:00:00.000Z');
    const date2 = new Date('2026-03-11T12:00:00.000Z');

    let state = createInitialDailyActivityState();
    state = evolveDailyActivityStateFromEmmett(state, makeEmmettEvent('SESSION_ENDED', date1));
    state = evolveDailyActivityStateFromEmmett(state, makeEmmettEvent('SESSION_ENDED', date2));

    expect(state.byDate.get('2026-03-10')).toBe(1);
    expect(state.byDate.get('2026-03-11')).toBe(1);
  });

  it('skips abandoned sessions', () => {
    const date = new Date('2026-03-10T12:00:00.000Z');
    let state = createInitialDailyActivityState();
    state = evolveDailyActivityStateFromEmmett(
      state,
      makeEmmettEvent('SESSION_ENDED', date, { reason: 'abandoned' }),
    );

    expect(state.byDate.size).toBe(0);
  });

  it('ignores non-session-ended events', () => {
    const date = new Date('2026-03-10T12:00:00.000Z');
    let state = createInitialDailyActivityState();
    state = evolveDailyActivityStateFromEmmett(state, makeEmmettEvent('SESSION_STARTED', date));

    expect(state.byDate.size).toBe(0);
  });

  it('handles all mode-specific SESSION_ENDED variants', () => {
    const variants = [
      'SESSION_ENDED',
      'RECALL_SESSION_ENDED',
      'FLOW_SESSION_ENDED',
      'DUAL_PICK_SESSION_ENDED',
      'TRACE_SESSION_ENDED',
    ];

    const date = new Date('2026-03-10T12:00:00.000Z');
    let state = createInitialDailyActivityState();
    for (const type of variants) {
      state = evolveDailyActivityStateFromEmmett(state, makeEmmettEvent(type, date));
    }

    expect(state.byDate.get('2026-03-10')).toBe(variants.length);
  });
});

// =============================================================================
// Both evolve functions produce the same results
// =============================================================================

describe('GameEvent vs EmmettStoredEvent parity', () => {
  it('both functions produce the same daily counts for equivalent events', () => {
    const timestamps = [
      dateToTimestamp('2026-03-10'),
      dateToTimestamp('2026-03-10'),
      dateToTimestamp('2026-03-11'),
    ];

    let gameState = createInitialDailyActivityState();
    let emmettState = createInitialDailyActivityState();

    for (const ts of timestamps) {
      gameState = evolveDailyActivityState(gameState, makeGameEvent('SESSION_ENDED', ts));
      emmettState = evolveDailyActivityStateFromEmmett(
        emmettState,
        makeEmmettEvent('SESSION_ENDED', new Date(ts)),
      );
    }

    expect(gameState.byDate.size).toBe(emmettState.byDate.size);
    for (const [date, count] of gameState.byDate) {
      expect(emmettState.byDate.get(date)).toBe(count);
    }
  });

  it('both functions skip abandoned sessions the same way', () => {
    const ts = dateToTimestamp('2026-03-10');

    let gameState = createInitialDailyActivityState();
    let emmettState = createInitialDailyActivityState();

    gameState = evolveDailyActivityState(
      gameState,
      makeGameEvent('SESSION_ENDED', ts, { reason: 'abandoned' }),
    );
    emmettState = evolveDailyActivityStateFromEmmett(
      emmettState,
      makeEmmettEvent('SESSION_ENDED', new Date(ts), { reason: 'abandoned' }),
    );

    expect(gameState.byDate.size).toBe(0);
    expect(emmettState.byDate.size).toBe(0);
  });
});

// =============================================================================
// Query helpers
// =============================================================================

describe('getRecentActivity', () => {
  it('returns last N days with correct counts', () => {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const byDate = new Map<string, number>();
    byDate.set(today, 3);
    byDate.set(yesterday, 1);
    const state: DailyActivityState = { byDate };

    const result = getRecentActivity(state, 3);

    expect(result).toHaveLength(3);
    // First entry is today (most recent)
    expect(result[0]!.date).toBe(today);
    expect(result[0]!.count).toBe(3);
    // Second entry is yesterday
    expect(result[1]!.date).toBe(yesterday);
    expect(result[1]!.count).toBe(1);
    // Third entry is two days ago — no activity
    expect(result[2]!.count).toBe(0);
  });

  it('returns 0 counts for days with no activity', () => {
    const state = createInitialDailyActivityState();
    const result = getRecentActivity(state, 7);

    expect(result).toHaveLength(7);
    for (const entry of result) {
      expect(entry.count).toBe(0);
    }
  });

  it('defaults to 30 days', () => {
    const state = createInitialDailyActivityState();
    const result = getRecentActivity(state);

    expect(result).toHaveLength(30);
  });
});

describe('getActivityForDate', () => {
  it('returns count for existing date', () => {
    const byDate = new Map<string, number>();
    byDate.set('2026-03-10', 5);
    const state: DailyActivityState = { byDate };

    expect(getActivityForDate(state, '2026-03-10')).toBe(5);
  });

  it('returns 0 for missing date', () => {
    const state = createInitialDailyActivityState();
    expect(getActivityForDate(state, '2026-03-10')).toBe(0);
  });
});

describe('getTotalSessions', () => {
  it('sums all counts', () => {
    const byDate = new Map<string, number>();
    byDate.set('2026-03-08', 2);
    byDate.set('2026-03-09', 3);
    byDate.set('2026-03-10', 1);
    const state: DailyActivityState = { byDate };

    expect(getTotalSessions(state)).toBe(6);
  });

  it('returns 0 for empty state', () => {
    const state = createInitialDailyActivityState();
    expect(getTotalSessions(state)).toBe(0);
  });
});

// =============================================================================
// Projection Definition (handle + truncate via in-memory DB)
// =============================================================================

function toProjectedEvent(
  type: string,
  data: Record<string, unknown>,
  globalPosition: bigint,
  createdAt = new Date(Number(globalPosition) * 1000),
) {
  return { type, data, globalPosition, createdAt };
}

describe('dailyActivityProjectionDefinition', () => {
  it('has correct id and version', () => {
    expect(dailyActivityProjectionDefinition.id).toBe('daily-activity');
    expect(dailyActivityProjectionDefinition.version).toBe(2);
  });

  it('handle() inserts rows into daily_activity_projection', async () => {
    const db = new TestPowerSyncDb();

    await dailyActivityProjectionDefinition.handle(
      [
        toProjectedEvent(
          'SESSION_ENDED',
          { reason: 'completed', durationMs: 60_000 },
          100n,
          new Date('2026-03-10T12:00:00.000Z'),
        ),
      ],
      db as any,
    );

    const row = await db.getOptional<{
      date: string;
      sessions_count: number;
      total_duration_ms: number;
    }>(
      'SELECT date, sessions_count, total_duration_ms FROM daily_activity_projection WHERE date = ?',
      ['2026-03-10'],
    );

    expect(row).toMatchObject({
      date: '2026-03-10',
      sessions_count: 1,
      total_duration_ms: 60_000,
    });
  });

  it('handle() increments existing rows', async () => {
    const db = new TestPowerSyncDb();

    await dailyActivityProjectionDefinition.handle(
      [
        toProjectedEvent(
          'SESSION_ENDED',
          { reason: 'completed', durationMs: 30_000 },
          100n,
          new Date('2026-03-10T10:00:00.000Z'),
        ),
      ],
      db as any,
    );

    await dailyActivityProjectionDefinition.handle(
      [
        toProjectedEvent(
          'SESSION_ENDED',
          { reason: 'completed', durationMs: 20_000 },
          101n,
          new Date('2026-03-10T14:00:00.000Z'),
        ),
      ],
      db as any,
    );

    const row = await db.getOptional<{ sessions_count: number; total_duration_ms: number }>(
      'SELECT sessions_count, total_duration_ms FROM daily_activity_projection WHERE date = ?',
      ['2026-03-10'],
    );

    expect(row).toMatchObject({
      sessions_count: 2,
      total_duration_ms: 50_000,
    });
  });

  it('handle() skips abandoned sessions', async () => {
    const db = new TestPowerSyncDb();

    await dailyActivityProjectionDefinition.handle(
      [
        toProjectedEvent(
          'SESSION_ENDED',
          { reason: 'abandoned', durationMs: 10_000 },
          100n,
          new Date('2026-03-10T12:00:00.000Z'),
        ),
      ],
      db as any,
    );

    const row = await db.getOptional<{ sessions_count: number }>(
      'SELECT sessions_count FROM daily_activity_projection WHERE date = ?',
      ['2026-03-10'],
    );

    expect(row).toBeNull();
  });

  it('handle() processes multiple days in a single batch', async () => {
    const db = new TestPowerSyncDb();

    await dailyActivityProjectionDefinition.handle(
      [
        toProjectedEvent(
          'SESSION_ENDED',
          { reason: 'completed', durationMs: 10_000 },
          100n,
          new Date('2026-03-10T12:00:00.000Z'),
        ),
        toProjectedEvent(
          'SESSION_ENDED',
          { reason: 'completed', durationMs: 20_000 },
          101n,
          new Date('2026-03-10T13:00:00.000Z'),
        ),
        toProjectedEvent(
          'SESSION_ENDED',
          { reason: 'completed', durationMs: 30_000 },
          102n,
          new Date('2026-03-11T12:00:00.000Z'),
        ),
      ],
      db as any,
    );

    const day10 = await db.getOptional<{ sessions_count: number; total_duration_ms: number }>(
      'SELECT sessions_count, total_duration_ms FROM daily_activity_projection WHERE date = ?',
      ['2026-03-10'],
    );
    const day11 = await db.getOptional<{ sessions_count: number; total_duration_ms: number }>(
      'SELECT sessions_count, total_duration_ms FROM daily_activity_projection WHERE date = ?',
      ['2026-03-11'],
    );

    expect(day10).toMatchObject({ sessions_count: 2, total_duration_ms: 30_000 });
    expect(day11).toMatchObject({ sessions_count: 1, total_duration_ms: 30_000 });
  });

  it('truncate() clears all rows', async () => {
    const db = new TestPowerSyncDb();

    await dailyActivityProjectionDefinition.handle(
      [
        toProjectedEvent(
          'SESSION_ENDED',
          { reason: 'completed', durationMs: 10_000 },
          100n,
          new Date('2026-03-10T12:00:00.000Z'),
        ),
      ],
      db as any,
    );

    await dailyActivityProjectionDefinition.truncate!(db as any);

    const row = await db.getOptional<{ sessions_count: number }>(
      'SELECT sessions_count FROM daily_activity_projection WHERE date = ?',
      ['2026-03-10'],
    );

    expect(row).toBeNull();
  });

  it('handle() treats undefined reason as completed', async () => {
    const db = new TestPowerSyncDb();

    await dailyActivityProjectionDefinition.handle(
      [
        toProjectedEvent(
          'SESSION_ENDED',
          { durationMs: 5_000 },
          100n,
          new Date('2026-03-10T12:00:00.000Z'),
        ),
      ],
      db as any,
    );

    const row = await db.getOptional<{ sessions_count: number }>(
      'SELECT sessions_count FROM daily_activity_projection WHERE date = ?',
      ['2026-03-10'],
    );

    expect(row).toMatchObject({ sessions_count: 1 });
  });

  it('handle() defaults durationMs to 0 when missing', async () => {
    const db = new TestPowerSyncDb();

    await dailyActivityProjectionDefinition.handle(
      [
        toProjectedEvent(
          'SESSION_ENDED',
          { reason: 'completed' },
          100n,
          new Date('2026-03-10T12:00:00.000Z'),
        ),
      ],
      db as any,
    );

    const row = await db.getOptional<{ total_duration_ms: number }>(
      'SELECT total_duration_ms FROM daily_activity_projection WHERE date = ?',
      ['2026-03-10'],
    );

    expect(row?.total_duration_ms).toBe(0);
  });
});
