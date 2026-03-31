import { describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';

import { SQLITE_SCHEMA } from '../db/sqlite-schema';
import { nLevelProjectionDefinition } from './n-level-projection';

// =============================================================================
// Test DB wrapper (matches session-summaries-projection.test.ts pattern)
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

  getNLevelRow(key: string) {
    return this.inner
      .query(
        `SELECT id, user_id, n_level, strikes_below_50, strikes_above_80, recommended_level, last_updated
         FROM n_level_projection WHERE id = ?`,
      )
      .get(key) as {
      id: string;
      user_id: string;
      n_level: number;
      strikes_below_50: number;
      strikes_above_80: number;
      recommended_level: number;
      last_updated: string;
    } | null;
  }

  countNLevelRows(): number {
    const row = this.inner.query('SELECT COUNT(*) as count FROM n_level_projection').get() as {
      count: number;
    };
    return row.count;
  }
}

// =============================================================================
// Event factory
// =============================================================================

function makeSessionEndedEvent(
  overrides: Record<string, unknown> = {},
  globalPosition = 1n,
  createdAt = new Date(2026, 2, 15, 10, 0, 0),
) {
  return {
    type: 'SESSION_ENDED',
    data: {
      userId: 'user-1',
      nLevel: 3,
      accuracy: 70,
      reason: 'completed',
      sessionId: 'session-1',
      ...overrides,
    },
    globalPosition,
    createdAt,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('n-level-projection', () => {
  describe('event filtering', () => {
    it('skips events without nLevel', async () => {
      const db = new TestPowerSyncDb();
      await nLevelProjectionDefinition.handle(
        [makeSessionEndedEvent({ nLevel: undefined })],
        db as any,
      );
      expect(db.countNLevelRows()).toBe(0);
    });

    it('skips events without accuracy', async () => {
      const db = new TestPowerSyncDb();
      await nLevelProjectionDefinition.handle(
        [makeSessionEndedEvent({ accuracy: undefined })],
        db as any,
      );
      expect(db.countNLevelRows()).toBe(0);
    });

    it('skips events without userId', async () => {
      const db = new TestPowerSyncDb();
      await nLevelProjectionDefinition.handle(
        [makeSessionEndedEvent({ userId: undefined })],
        db as any,
      );
      expect(db.countNLevelRows()).toBe(0);
    });

    it('canHandle excludes non-session-end events so they never reach handle()', () => {
      // The projection manager uses canHandle to filter events before calling handle().
      // TRIAL_PRESENTED and SESSION_STARTED are not in canHandle, so they are never passed.
      expect(nLevelProjectionDefinition.canHandle.has('TRIAL_PRESENTED' as any)).toBe(false);
      expect(nLevelProjectionDefinition.canHandle.has('SESSION_STARTED' as any)).toBe(false);
      expect(nLevelProjectionDefinition.canHandle.has('SESSION_ENDED' as any)).toBe(true);
    });

    it('skips abandoned sessions (reason !== completed)', async () => {
      const db = new TestPowerSyncDb();
      await nLevelProjectionDefinition.handle(
        [makeSessionEndedEvent({ reason: 'abandoned' })],
        db as any,
      );
      expect(db.countNLevelRows()).toBe(0);
    });

    it('skips sessions with reason "timeout"', async () => {
      const db = new TestPowerSyncDb();
      await nLevelProjectionDefinition.handle(
        [makeSessionEndedEvent({ reason: 'timeout' })],
        db as any,
      );
      expect(db.countNLevelRows()).toBe(0);
    });

    it('accepts events with no reason (undefined treated as valid)', async () => {
      const db = new TestPowerSyncDb();
      await nLevelProjectionDefinition.handle(
        [makeSessionEndedEvent({ reason: undefined })],
        db as any,
      );
      expect(db.countNLevelRows()).toBe(1);
    });
  });

  describe('strike accumulation', () => {
    it('increments strikesBelow50 when accuracy < 50', async () => {
      const db = new TestPowerSyncDb();
      await nLevelProjectionDefinition.handle(
        [makeSessionEndedEvent({ accuracy: 40, nLevel: 2 })],
        db as any,
      );

      const row = db.getNLevelRow('user-1:2');
      expect(row).not.toBeNull();
      expect(row!.strikes_below_50).toBe(1);
      expect(row!.strikes_above_80).toBe(0);
      expect(row!.recommended_level).toBe(2);
    });

    it('increments strikesAbove80 when accuracy > 80', async () => {
      const db = new TestPowerSyncDb();
      await nLevelProjectionDefinition.handle(
        [makeSessionEndedEvent({ accuracy: 85, nLevel: 2 })],
        db as any,
      );

      const row = db.getNLevelRow('user-1:2');
      expect(row).not.toBeNull();
      expect(row!.strikes_above_80).toBe(1);
      expect(row!.strikes_below_50).toBe(0);
      expect(row!.recommended_level).toBe(2);
    });

    it('resets both strikes when accuracy is between 50 and 80', async () => {
      const db = new TestPowerSyncDb();

      // First: accumulate a below-50 strike
      await nLevelProjectionDefinition.handle(
        [makeSessionEndedEvent({ accuracy: 40, nLevel: 2 }, 1n)],
        db as any,
      );
      expect(db.getNLevelRow('user-1:2')!.strikes_below_50).toBe(1);

      // Second: accuracy between 50-80 resets
      await nLevelProjectionDefinition.handle(
        [makeSessionEndedEvent({ accuracy: 65, nLevel: 2 }, 2n)],
        db as any,
      );
      const row = db.getNLevelRow('user-1:2');
      expect(row!.strikes_below_50).toBe(0);
      expect(row!.strikes_above_80).toBe(0);
    });

    it('accumulates multiple below-50 strikes across batches', async () => {
      const db = new TestPowerSyncDb();

      await nLevelProjectionDefinition.handle(
        [makeSessionEndedEvent({ accuracy: 30, nLevel: 3 }, 1n)],
        db as any,
      );
      await nLevelProjectionDefinition.handle(
        [makeSessionEndedEvent({ accuracy: 25, nLevel: 3 }, 2n)],
        db as any,
      );

      const row = db.getNLevelRow('user-1:3');
      expect(row!.strikes_below_50).toBe(2);
      expect(row!.recommended_level).toBe(3);
    });

    it('accumulates multiple above-80 strikes across batches', async () => {
      const db = new TestPowerSyncDb();

      await nLevelProjectionDefinition.handle(
        [makeSessionEndedEvent({ accuracy: 90, nLevel: 3 }, 1n)],
        db as any,
      );
      await nLevelProjectionDefinition.handle(
        [makeSessionEndedEvent({ accuracy: 95, nLevel: 3 }, 2n)],
        db as any,
      );

      const row = db.getNLevelRow('user-1:3');
      expect(row!.strikes_above_80).toBe(2);
      expect(row!.recommended_level).toBe(3);
    });

    it('accumulates strikes within a single batch of events', async () => {
      const db = new TestPowerSyncDb();
      const events = [
        makeSessionEndedEvent({ accuracy: 40, nLevel: 2 }, 1n),
        makeSessionEndedEvent({ accuracy: 30, nLevel: 2 }, 2n),
      ];
      await nLevelProjectionDefinition.handle(events, db as any);

      const row = db.getNLevelRow('user-1:2');
      expect(row!.strikes_below_50).toBe(2);
    });
  });

  describe('3-strike level transitions', () => {
    it('recommends level decrease after 3 strikes below 50%', async () => {
      const db = new TestPowerSyncDb();
      const events = [
        makeSessionEndedEvent({ accuracy: 40, nLevel: 3 }, 1n),
        makeSessionEndedEvent({ accuracy: 35, nLevel: 3 }, 2n),
        makeSessionEndedEvent({ accuracy: 45, nLevel: 3 }, 3n),
      ];
      await nLevelProjectionDefinition.handle(events, db as any);

      const row = db.getNLevelRow('user-1:3');
      expect(row!.strikes_below_50).toBe(3);
      expect(row!.recommended_level).toBe(2);
    });

    it('recommends level increase after 3 strikes above 80%', async () => {
      const db = new TestPowerSyncDb();
      const events = [
        makeSessionEndedEvent({ accuracy: 85, nLevel: 3 }, 1n),
        makeSessionEndedEvent({ accuracy: 90, nLevel: 3 }, 2n),
        makeSessionEndedEvent({ accuracy: 95, nLevel: 3 }, 3n),
      ];
      await nLevelProjectionDefinition.handle(events, db as any);

      const row = db.getNLevelRow('user-1:3');
      expect(row!.strikes_above_80).toBe(3);
      expect(row!.recommended_level).toBe(4);
    });

    it('does not decrease level below 1', async () => {
      const db = new TestPowerSyncDb();
      const events = [
        makeSessionEndedEvent({ accuracy: 20, nLevel: 1 }, 1n),
        makeSessionEndedEvent({ accuracy: 25, nLevel: 1 }, 2n),
        makeSessionEndedEvent({ accuracy: 30, nLevel: 1 }, 3n),
      ];
      await nLevelProjectionDefinition.handle(events, db as any);

      const row = db.getNLevelRow('user-1:1');
      expect(row!.strikes_below_50).toBe(3);
      expect(row!.recommended_level).toBe(1);
    });

    it('3 strikes across separate batches triggers transition', async () => {
      const db = new TestPowerSyncDb();

      await nLevelProjectionDefinition.handle(
        [
          makeSessionEndedEvent({ accuracy: 85, nLevel: 4 }, 1n),
          makeSessionEndedEvent({ accuracy: 90, nLevel: 4 }, 2n),
        ],
        db as any,
      );
      expect(db.getNLevelRow('user-1:4')!.recommended_level).toBe(4);

      await nLevelProjectionDefinition.handle(
        [makeSessionEndedEvent({ accuracy: 95, nLevel: 4 }, 3n)],
        db as any,
      );
      expect(db.getNLevelRow('user-1:4')!.recommended_level).toBe(5);
    });
  });

  describe('per-user, per-level isolation', () => {
    it('isolates different users at the same nLevel', async () => {
      const db = new TestPowerSyncDb();
      await nLevelProjectionDefinition.handle(
        [
          makeSessionEndedEvent({ userId: 'alice', accuracy: 40, nLevel: 2 }, 1n),
          makeSessionEndedEvent({ userId: 'bob', accuracy: 90, nLevel: 2 }, 2n),
        ],
        db as any,
      );

      const alice = db.getNLevelRow('alice:2');
      const bob = db.getNLevelRow('bob:2');
      expect(alice!.strikes_below_50).toBe(1);
      expect(alice!.strikes_above_80).toBe(0);
      expect(bob!.strikes_below_50).toBe(0);
      expect(bob!.strikes_above_80).toBe(1);
    });

    it('isolates different nLevels for the same user', async () => {
      const db = new TestPowerSyncDb();
      await nLevelProjectionDefinition.handle(
        [
          makeSessionEndedEvent({ userId: 'user-1', accuracy: 40, nLevel: 2 }, 1n),
          makeSessionEndedEvent({ userId: 'user-1', accuracy: 90, nLevel: 3 }, 2n),
        ],
        db as any,
      );

      const level2 = db.getNLevelRow('user-1:2');
      const level3 = db.getNLevelRow('user-1:3');
      expect(level2!.strikes_below_50).toBe(1);
      expect(level2!.strikes_above_80).toBe(0);
      expect(level3!.strikes_below_50).toBe(0);
      expect(level3!.strikes_above_80).toBe(1);
    });

    it('uses userId:nLevel as the row key', async () => {
      const db = new TestPowerSyncDb();
      await nLevelProjectionDefinition.handle(
        [makeSessionEndedEvent({ userId: 'test-user', nLevel: 5, accuracy: 70 })],
        db as any,
      );

      const row = db.getNLevelRow('test-user:5');
      expect(row).not.toBeNull();
      expect(row!.id).toBe('test-user:5');
      expect(row!.user_id).toBe('test-user');
      expect(row!.n_level).toBe(5);
    });
  });

  describe('metadata', () => {
    it('stores last_updated as ISO date from event createdAt', async () => {
      const db = new TestPowerSyncDb();
      const eventDate = new Date('2026-03-15T14:30:00.000Z');
      await nLevelProjectionDefinition.handle(
        [makeSessionEndedEvent({ nLevel: 2, accuracy: 70 }, 1n, eventDate)],
        db as any,
      );

      const row = db.getNLevelRow('user-1:2');
      expect(row!.last_updated).toBe('2026-03-15');
    });
  });

  describe('boundary values', () => {
    it('exactly 50% accuracy resets strikes (not below 50)', async () => {
      const db = new TestPowerSyncDb();

      // Accumulate a below-50 strike first
      await nLevelProjectionDefinition.handle(
        [makeSessionEndedEvent({ accuracy: 40, nLevel: 2 }, 1n)],
        db as any,
      );

      // Exactly 50% should reset
      await nLevelProjectionDefinition.handle(
        [makeSessionEndedEvent({ accuracy: 50, nLevel: 2 }, 2n)],
        db as any,
      );

      const row = db.getNLevelRow('user-1:2');
      expect(row!.strikes_below_50).toBe(0);
      expect(row!.strikes_above_80).toBe(0);
    });

    it('exactly 80% accuracy resets strikes (not above 80)', async () => {
      const db = new TestPowerSyncDb();

      // Accumulate an above-80 strike first
      await nLevelProjectionDefinition.handle(
        [makeSessionEndedEvent({ accuracy: 85, nLevel: 2 }, 1n)],
        db as any,
      );

      // Exactly 80% should reset
      await nLevelProjectionDefinition.handle(
        [makeSessionEndedEvent({ accuracy: 80, nLevel: 2 }, 2n)],
        db as any,
      );

      const row = db.getNLevelRow('user-1:2');
      expect(row!.strikes_below_50).toBe(0);
      expect(row!.strikes_above_80).toBe(0);
    });
  });

  describe('truncate', () => {
    it('clears all n_level_projection rows', async () => {
      const db = new TestPowerSyncDb();
      await nLevelProjectionDefinition.handle(
        [
          makeSessionEndedEvent({ userId: 'u1', nLevel: 2, accuracy: 85 }, 1n),
          makeSessionEndedEvent({ userId: 'u2', nLevel: 3, accuracy: 40 }, 2n),
        ],
        db as any,
      );
      expect(db.countNLevelRows()).toBe(2);

      await nLevelProjectionDefinition.truncate(db as any);
      expect(db.countNLevelRows()).toBe(0);
    });
  });

  describe('canHandle filter', () => {
    it('includes all SESSION_END_EVENT_TYPES', () => {
      expect(nLevelProjectionDefinition.canHandle.has('SESSION_ENDED' as any)).toBe(true);
      expect(nLevelProjectionDefinition.canHandle.has('SESSION_IMPORTED' as any)).toBe(true);
    });

    it('excludes non-session-end events', () => {
      expect(nLevelProjectionDefinition.canHandle.has('SESSION_STARTED' as any)).toBe(false);
      expect(nLevelProjectionDefinition.canHandle.has('TRIAL_PRESENTED' as any)).toBe(false);
      expect(nLevelProjectionDefinition.canHandle.has('TRIAL_RESPONDED' as any)).toBe(false);
    });
  });
});
