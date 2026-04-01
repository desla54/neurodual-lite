import { describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';

import type { GameEvent } from '@neurodual/logic';
type EmmettStoredEvent = {
  eventId: string;
  streamPosition: bigint;
  globalPosition: bigint;
  type: string;
  data: Record<string, unknown>;
  metadata: Record<string, unknown>;
  createdAt: Date;
};
import { SQLITE_SCHEMA } from '../db/sqlite-schema';
import {
  createInitialStreakState,
  evolveStreakState,
  evolveStreakStateFromEmmett,
  streakStateToInfo,
  streakProjectionDefinition,
  type StreakState,
} from './streak-projection';

// =============================================================================
// Helpers
// =============================================================================

/** Create a minimal GameEvent for streak testing. */
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

/** Create a minimal EmmettStoredEvent for streak testing. */
function makeEmmettEvent(
  type: string,
  createdAt: Date,
  overrides: Record<string, unknown> = {},
): EmmettStoredEvent {
  return {
    eventId: `evt-${createdAt.getTime()}`,
    streamPosition: 1n,
    globalPosition: 1n,
    type,
    data: { reason: 'completed', ...overrides },
    metadata: {},
    createdAt,
  };
}

/** Millisecond timestamp for a given UTC date string (YYYY-MM-DD). */
function dateMs(dateStr: string): number {
  return new Date(`${dateStr}T12:00:00.000Z`).getTime();
}

/** Date object for a given UTC date string. */
function dateObj(dateStr: string): Date {
  return new Date(`${dateStr}T12:00:00.000Z`);
}

// =============================================================================
// TestPowerSyncDb (same pattern as session-summaries-projection.test.ts)
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

  getStreakRow(): {
    current_streak: number;
    best_streak: number;
    last_active_date: string | null;
  } | null {
    return this.inner
      .query(
        `SELECT current_streak, best_streak, last_active_date FROM streak_projection WHERE id = '1'`,
      )
      .get() as {
      current_streak: number;
      best_streak: number;
      last_active_date: string | null;
    } | null;
  }
}

// =============================================================================
// createInitialStreakState
// =============================================================================

describe('createInitialStreakState', () => {
  it('returns zeroed state', () => {
    const state = createInitialStreakState();
    expect(state).toEqual({
      currentStreak: 0,
      bestStreak: 0,
      lastActiveDate: null,
    });
  });
});

// =============================================================================
// evolveStreakState
// =============================================================================

describe('evolveStreakState', () => {
  it('ignores non-session-end events', () => {
    const state = createInitialStreakState();
    const event = makeGameEvent('TRIAL_PRESENTED', dateMs('2026-01-01'));
    const next = evolveStreakState(state, event);
    expect(next).toEqual(state);
  });

  it('increments streak on first SESSION_ENDED', () => {
    const state = createInitialStreakState();
    const event = makeGameEvent('SESSION_ENDED', dateMs('2026-01-01'));
    const next = evolveStreakState(state, event);
    expect(next).toEqual({
      currentStreak: 1,
      bestStreak: 1,
      lastActiveDate: '2026-01-01',
    });
  });

  it('does not change streak for same-day session', () => {
    const state: StreakState = {
      currentStreak: 1,
      bestStreak: 1,
      lastActiveDate: '2026-01-01',
    };
    const event = makeGameEvent('SESSION_ENDED', dateMs('2026-01-01'));
    const next = evolveStreakState(state, event);
    expect(next).toEqual(state);
  });

  it('increments streak on consecutive day (next day)', () => {
    const state: StreakState = {
      currentStreak: 1,
      bestStreak: 1,
      lastActiveDate: '2026-01-01',
    };
    const event = makeGameEvent('SESSION_ENDED', dateMs('2026-01-02'));
    const next = evolveStreakState(state, event);
    expect(next).toEqual({
      currentStreak: 2,
      bestStreak: 2,
      lastActiveDate: '2026-01-02',
    });
  });

  it('increments streak when gap is exactly 48 hours (within threshold)', () => {
    const state: StreakState = {
      currentStreak: 3,
      bestStreak: 3,
      lastActiveDate: '2026-01-01',
    };
    // 48h from noon Jan 1 = noon Jan 3
    const event = makeGameEvent('SESSION_ENDED', dateMs('2026-01-03'));
    const next = evolveStreakState(state, event);
    // hoursBetween('2026-01-01', '2026-01-03') = 48, isConsecutiveDate returns true (<=48)
    expect(next).toEqual({
      currentStreak: 4,
      bestStreak: 4,
      lastActiveDate: '2026-01-03',
    });
  });

  it('resets streak when gap exceeds 48 hours', () => {
    const state: StreakState = {
      currentStreak: 5,
      bestStreak: 5,
      lastActiveDate: '2026-01-01',
    };
    // 4 days gap = 96 hours > 48
    const event = makeGameEvent('SESSION_ENDED', dateMs('2026-01-05'));
    const next = evolveStreakState(state, event);
    expect(next).toEqual({
      currentStreak: 1,
      bestStreak: 5, // best preserved
      lastActiveDate: '2026-01-05',
    });
  });

  it('preserves best streak after reset and new accumulation', () => {
    let state: StreakState = {
      currentStreak: 3,
      bestStreak: 3,
      lastActiveDate: '2026-01-03',
    };
    // Reset streak (gap > 48h)
    state = evolveStreakState(state, makeGameEvent('SESSION_ENDED', dateMs('2026-01-10')));
    expect(state.currentStreak).toBe(1);
    expect(state.bestStreak).toBe(3);

    // Build up again
    state = evolveStreakState(state, makeGameEvent('SESSION_ENDED', dateMs('2026-01-11')));
    expect(state.currentStreak).toBe(2);
    expect(state.bestStreak).toBe(3);

    state = evolveStreakState(state, makeGameEvent('SESSION_ENDED', dateMs('2026-01-12')));
    expect(state.currentStreak).toBe(3);
    expect(state.bestStreak).toBe(3);

    state = evolveStreakState(state, makeGameEvent('SESSION_ENDED', dateMs('2026-01-13')));
    expect(state.currentStreak).toBe(4);
    expect(state.bestStreak).toBe(4); // new best
  });

  it('skips abandoned sessions (reason !== completed)', () => {
    const state = createInitialStreakState();
    const event = makeGameEvent('SESSION_ENDED', dateMs('2026-01-01'), { reason: 'abandoned' });
    const next = evolveStreakState(state, event);
    expect(next).toEqual(state);
  });

  it('skips sessions with reason "timeout"', () => {
    const state = createInitialStreakState();
    const event = makeGameEvent('SESSION_ENDED', dateMs('2026-01-01'), { reason: 'timeout' });
    const next = evolveStreakState(state, event);
    expect(next).toEqual(state);
  });

  it('counts sessions with undefined reason (treated as completed)', () => {
    const state = createInitialStreakState();
    const event = makeGameEvent('SESSION_ENDED', dateMs('2026-01-01'), { reason: undefined });
    // Delete reason so it's truly undefined on the cast
    delete (event as Record<string, unknown>).reason;
    const next = evolveStreakState(state, event);
    expect(next.currentStreak).toBe(1);
  });

  it('handles RECALL_SESSION_ENDED', () => {
    const state = createInitialStreakState();
    const event = makeGameEvent('RECALL_SESSION_ENDED', dateMs('2026-02-01'));
    const next = evolveStreakState(state, event);
    expect(next.currentStreak).toBe(1);
  });

  it('handles FLOW_SESSION_ENDED', () => {
    const state = createInitialStreakState();
    const event = makeGameEvent('FLOW_SESSION_ENDED', dateMs('2026-02-01'));
    const next = evolveStreakState(state, event);
    expect(next.currentStreak).toBe(1);
  });

  it('handles DUAL_PICK_SESSION_ENDED', () => {
    const state = createInitialStreakState();
    const event = makeGameEvent('DUAL_PICK_SESSION_ENDED', dateMs('2026-02-01'));
    const next = evolveStreakState(state, event);
    expect(next.currentStreak).toBe(1);
  });

  it('handles TRACE_SESSION_ENDED', () => {
    const state = createInitialStreakState();
    const event = makeGameEvent('TRACE_SESSION_ENDED', dateMs('2026-02-01'));
    const next = evolveStreakState(state, event);
    expect(next.currentStreak).toBe(1);
  });
});

// =============================================================================
// evolveStreakStateFromEmmett
// =============================================================================

describe('evolveStreakStateFromEmmett', () => {
  it('ignores non-session-end events', () => {
    const state = createInitialStreakState();
    const event = makeEmmettEvent('TRIAL_PRESENTED', dateObj('2026-01-01'));
    const next = evolveStreakStateFromEmmett(state, event);
    expect(next).toEqual(state);
  });

  it('increments streak on first event', () => {
    const state = createInitialStreakState();
    const event = makeEmmettEvent('SESSION_ENDED', dateObj('2026-01-01'));
    const next = evolveStreakStateFromEmmett(state, event);
    expect(next).toEqual({
      currentStreak: 1,
      bestStreak: 1,
      lastActiveDate: '2026-01-01',
    });
  });

  it('skips abandoned sessions', () => {
    const state = createInitialStreakState();
    const event = makeEmmettEvent('SESSION_ENDED', dateObj('2026-01-01'), { reason: 'abandoned' });
    const next = evolveStreakStateFromEmmett(state, event);
    expect(next).toEqual(state);
  });

  it('counts sessions with undefined reason', () => {
    const state = createInitialStreakState();
    const event: EmmettStoredEvent = {
      eventId: 'evt-1',
      streamPosition: 1n,
      globalPosition: 1n,
      type: 'SESSION_ENDED',
      data: {}, // no reason field
      metadata: {},
      createdAt: dateObj('2026-01-01'),
    };
    const next = evolveStreakStateFromEmmett(state, event);
    expect(next.currentStreak).toBe(1);
  });

  it('resets streak when gap > 48h', () => {
    const state: StreakState = {
      currentStreak: 3,
      bestStreak: 3,
      lastActiveDate: '2026-01-01',
    };
    const event = makeEmmettEvent('SESSION_ENDED', dateObj('2026-01-05'));
    const next = evolveStreakStateFromEmmett(state, event);
    expect(next).toEqual({
      currentStreak: 1,
      bestStreak: 3,
      lastActiveDate: '2026-01-05',
    });
  });
});

// =============================================================================
// evolveStreakState vs evolveStreakStateFromEmmett parity
// =============================================================================

describe('evolveStreakState and evolveStreakStateFromEmmett parity', () => {
  const scenarios: Array<{
    name: string;
    events: Array<{ type: string; date: string; reason?: string }>;
  }> = [
    {
      name: 'single completed session',
      events: [{ type: 'SESSION_ENDED', date: '2026-01-01' }],
    },
    {
      name: 'consecutive days',
      events: [
        { type: 'SESSION_ENDED', date: '2026-01-01' },
        { type: 'SESSION_ENDED', date: '2026-01-02' },
        { type: 'SESSION_ENDED', date: '2026-01-03' },
      ],
    },
    {
      name: 'gap resets streak',
      events: [
        { type: 'SESSION_ENDED', date: '2026-01-01' },
        { type: 'SESSION_ENDED', date: '2026-01-02' },
        { type: 'SESSION_ENDED', date: '2026-01-10' },
      ],
    },
    {
      name: 'abandoned sessions skipped',
      events: [
        { type: 'SESSION_ENDED', date: '2026-01-01' },
        { type: 'SESSION_ENDED', date: '2026-01-02', reason: 'abandoned' },
        { type: 'SESSION_ENDED', date: '2026-01-03' },
      ],
    },
    {
      name: 'mixed event types',
      events: [
        { type: 'SESSION_ENDED', date: '2026-01-01' },
        { type: 'RECALL_SESSION_ENDED', date: '2026-01-02' },
        { type: 'FLOW_SESSION_ENDED', date: '2026-01-03' },
        { type: 'DUAL_PICK_SESSION_ENDED', date: '2026-01-04' },
      ],
    },
  ];

  for (const scenario of scenarios) {
    it(`produces same results for: ${scenario.name}`, () => {
      let stateA = createInitialStreakState();
      let stateB = createInitialStreakState();

      for (const evt of scenario.events) {
        const ts = dateMs(evt.date);
        const gameEvent = makeGameEvent(evt.type, ts, evt.reason ? { reason: evt.reason } : {});
        const emmettEvent = makeEmmettEvent(
          evt.type,
          dateObj(evt.date),
          evt.reason ? { reason: evt.reason } : {},
        );

        stateA = evolveStreakState(stateA, gameEvent);
        stateB = evolveStreakStateFromEmmett(stateB, emmettEvent);
      }

      expect(stateA).toEqual(stateB);
    });
  }
});

// =============================================================================
// streakStateToInfo
// =============================================================================

describe('streakStateToInfo', () => {
  it('returns zero current when lastActiveDate is null', () => {
    const state: StreakState = { currentStreak: 0, bestStreak: 0, lastActiveDate: null };
    const info = streakStateToInfo(state, '2026-01-15');
    expect(info).toEqual({ current: 0, best: 0, lastActiveDate: null });
  });

  it('returns active streak when last active is today', () => {
    const state: StreakState = { currentStreak: 5, bestStreak: 5, lastActiveDate: '2026-01-15' };
    const info = streakStateToInfo(state, '2026-01-15');
    expect(info).toEqual({ current: 5, best: 5, lastActiveDate: '2026-01-15' });
  });

  it('returns active streak when last active was yesterday (within 48h)', () => {
    const state: StreakState = { currentStreak: 3, bestStreak: 3, lastActiveDate: '2026-01-14' };
    const info = streakStateToInfo(state, '2026-01-15');
    expect(info).toEqual({ current: 3, best: 3, lastActiveDate: '2026-01-14' });
  });

  it('returns active streak when last active was 2 days ago (within 48h boundary)', () => {
    const state: StreakState = { currentStreak: 3, bestStreak: 3, lastActiveDate: '2026-01-13' };
    const info = streakStateToInfo(state, '2026-01-15');
    // daysSinceLastActive = floor(48/24) = 2, 2*24 = 48 <= 48 => active
    expect(info).toEqual({ current: 3, best: 3, lastActiveDate: '2026-01-13' });
  });

  it('returns zero current when streak is inactive (gap > 48h)', () => {
    const state: StreakState = { currentStreak: 5, bestStreak: 5, lastActiveDate: '2026-01-10' };
    const info = streakStateToInfo(state, '2026-01-15');
    // 5 days = 120 hours > 48
    expect(info).toEqual({ current: 0, best: 5, lastActiveDate: '2026-01-10' });
  });

  it('preserves best even when current is zeroed', () => {
    const state: StreakState = { currentStreak: 10, bestStreak: 10, lastActiveDate: '2026-01-01' };
    const info = streakStateToInfo(state, '2026-03-01');
    expect(info.current).toBe(0);
    expect(info.best).toBe(10);
  });
});

// =============================================================================
// streakProjectionDefinition.handle (integration with DB)
// =============================================================================

describe('streakProjectionDefinition', () => {
  it('handles a single completed session event', async () => {
    const db = new TestPowerSyncDb();
    await streakProjectionDefinition.handle(
      [
        {
          type: 'SESSION_ENDED',
          data: { reason: 'completed' },
          globalPosition: 1n,
          createdAt: dateObj('2026-01-01'),
        },
      ],
      db as any,
    );

    const row = db.getStreakRow();
    expect(row).toEqual({
      current_streak: 1,
      best_streak: 1,
      last_active_date: '2026-01-01',
    });
  });

  it('accumulates consecutive days across multiple handle calls', async () => {
    const db = new TestPowerSyncDb();

    await streakProjectionDefinition.handle(
      [
        {
          type: 'SESSION_ENDED',
          data: { reason: 'completed' },
          globalPosition: 1n,
          createdAt: dateObj('2026-01-01'),
        },
      ],
      db as any,
    );

    await streakProjectionDefinition.handle(
      [
        {
          type: 'SESSION_ENDED',
          data: { reason: 'completed' },
          globalPosition: 2n,
          createdAt: dateObj('2026-01-02'),
        },
      ],
      db as any,
    );

    const row = db.getStreakRow();
    expect(row).toEqual({
      current_streak: 2,
      best_streak: 2,
      last_active_date: '2026-01-02',
    });
  });

  it('skips abandoned sessions in handle', async () => {
    const db = new TestPowerSyncDb();

    await streakProjectionDefinition.handle(
      [
        {
          type: 'SESSION_ENDED',
          data: { reason: 'abandoned' },
          globalPosition: 1n,
          createdAt: dateObj('2026-01-01'),
        },
      ],
      db as any,
    );

    const row = db.getStreakRow();
    expect(row).toEqual({
      current_streak: 0,
      best_streak: 0,
      last_active_date: null,
    });
  });

  it('truncate clears the streak_projection table', async () => {
    const db = new TestPowerSyncDb();

    // First add a streak
    await streakProjectionDefinition.handle(
      [
        {
          type: 'SESSION_ENDED',
          data: { reason: 'completed' },
          globalPosition: 1n,
          createdAt: dateObj('2026-01-01'),
        },
      ],
      db as any,
    );

    await streakProjectionDefinition.truncate(db as any);

    const row = db.getStreakRow();
    expect(row).toBeNull();
  });
});
