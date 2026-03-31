// packages/infra/src/projections/projection-processor.test.ts
/**
 * Projection Processor Tests
 *
 * Integration tests for the ProjectionProcessor framework.
 * Tests incremental processing, version-based replay, and checkpoint management.
 *
 * Key design invariant: handle() is the SAME function for incremental and replay.
 * The processor calls truncate + handle(allEvents) for replay, or handle(newEvents)
 * for incremental — no divergence possible.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
  getProjectionProcessor,
  resetProjectionProcessor,
  toProjectedEvent,
  type ProjectionProcessor,
  type ProjectedEvent,
} from './projection-processor';

// =============================================================================
// Mock Database
// =============================================================================

type MockRow = Record<string, unknown>;

class MockPowerSyncDatabase {
  tables: Map<string, MockRow[]> = new Map();

  constructor() {
    this.tables.set('streak_projection', []);
    this.tables.set('daily_activity_projection', []);
    this.tables.set('n_level_projection', []);
    this.tables.set('journey_state_projection', []);
    this.tables.set('projection_effects', []);
    this.tables.set('es_projection_errors', []);
    this.tables.set('emt_subscriptions', []);
    this.tables.set('emt_messages', []);
  }

  async execute(
    sql: string,
    parameters?: readonly unknown[],
  ): Promise<{ rows: { _array: MockRow[] }; rowsAffected: number }> {
    const upperSql = sql.trim().toUpperCase();

    // ---- SELECT ----
    if (upperSql.startsWith('SELECT')) {
      if (sql.includes('emt_subscriptions')) {
        const id = parameters?.[0] as string;
        const rows = (this.tables.get('emt_subscriptions') ?? []).filter((r) => r['id'] === id);
        return { rows: { _array: rows }, rowsAffected: 0 };
      }

      if (sql.includes('emt_messages') && upperSql.includes('MAX(')) {
        const table = this.tables.get('emt_messages') ?? [];
        const positions = table
          .filter((r) => r['message_kind'] === 'E' && Number(r['is_archived'] ?? 0) === 0)
          .map((r) => Number(r['global_position']));
        const mp = positions.length > 0 ? String(Math.max(...positions)) : null;
        return { rows: { _array: [{ mp }] }, rowsAffected: 0 };
      }

      if (sql.includes('emt_messages')) {
        const table = this.tables.get('emt_messages') ?? [];
        const params = parameters ? [...parameters] : [];
        const limitParam = params.pop();
        const fromPosStr = params.pop() as string;
        const fromPos = Number(fromPosStr ?? '0');
        const limit = typeof limitParam === 'number' ? limitParam : Number(limitParam ?? 500);
        const types = params as string[];

        const filtered = table
          .filter(
            (r) =>
              types.includes(r['message_type'] as string) &&
              r['message_kind'] === 'E' &&
              Number(r['is_archived'] ?? 0) === 0 &&
              Number(r['global_position']) > fromPos,
          )
          .sort((a, b) => Number(a['global_position']) - Number(b['global_position']));

        return { rows: { _array: filtered.slice(0, limit) }, rowsAffected: 0 };
      }

      if (sql.includes('streak_projection')) {
        return { rows: { _array: this.tables.get('streak_projection') ?? [] }, rowsAffected: 0 };
      }

      if (sql.includes('daily_activity_projection')) {
        return {
          rows: { _array: this.tables.get('daily_activity_projection') ?? [] },
          rowsAffected: 0,
        };
      }

      if (sql.includes('n_level_projection')) {
        const table = this.tables.get('n_level_projection') ?? [];
        // Filter by id if parameter provided
        if (parameters && parameters.length > 0) {
          const id = parameters[0] as string;
          const filtered = table.filter((r) => r['id'] === id);
          return { rows: { _array: filtered }, rowsAffected: 0 };
        }
        return { rows: { _array: table }, rowsAffected: 0 };
      }

      if (sql.includes('journey_state_projection')) {
        const table = this.tables.get('journey_state_projection') ?? [];
        if (parameters && parameters.length > 0) {
          const id = parameters[0] as string;
          const filtered = table.filter((r) => r['id'] === id);
          return { rows: { _array: filtered }, rowsAffected: 0 };
        }
        return { rows: { _array: table }, rowsAffected: 0 };
      }

      if (sql.includes('projection_effects')) {
        const table = this.tables.get('projection_effects') ?? [];
        const params = parameters ? [...parameters] : [];
        const projectionId = params.shift() as string;
        const effectKeys = params as string[];
        const filtered = table.filter(
          (row) =>
            row['projection_id'] === projectionId &&
            (effectKeys.length === 0 || effectKeys.includes(String(row['effect_key']))),
        );
        return { rows: { _array: filtered }, rowsAffected: 0 };
      }

      return { rows: { _array: [] }, rowsAffected: 0 };
    }

    // ---- UPDATE ----
    if (upperSql.startsWith('UPDATE')) {
      if (sql.includes('emt_subscriptions')) {
        const params = parameters ? [...parameters] : [];
        const version = params[0] as number;
        const position = params[1] as string;
        const id = params[2] as string;

        const table = this.tables.get('emt_subscriptions') ?? [];
        const existing = table.findIndex((r) => r['id'] === id);
        if (existing < 0) return { rows: { _array: [] }, rowsAffected: 0 };

        table[existing] = {
          ...table[existing],
          version,
          last_processed_position: position,
        };
        return { rows: { _array: [] }, rowsAffected: 1 };
      }

      if (sql.includes('streak_projection')) {
        const params = parameters ? [...parameters] : [];
        const table = this.tables.get('streak_projection') ?? [];
        const existing = table.findIndex((r) => String(r['id']) === '1');
        if (existing < 0) return { rows: { _array: [] }, rowsAffected: 0 };

        table[existing] = {
          id: '1',
          current_streak: params[0] as number,
          best_streak: params[1] as number,
          last_active_date: (params[2] as string | null) ?? null,
        };
        return { rows: { _array: [] }, rowsAffected: 1 };
      }

      if (sql.includes('daily_activity_projection')) {
        const params = parameters ? [...parameters] : [];
        const count = params[0] as number;
        const durationMs = params[1] as number;
        const date = params[2] as string;

        const table = this.tables.get('daily_activity_projection') ?? [];
        const existing = table.findIndex((r) => r['date'] === date);
        if (existing < 0) return { rows: { _array: [] }, rowsAffected: 0 };

        const existingRow = table[existing]!;
        table[existing] = {
          date,
          sessions_count: Number(existingRow['sessions_count'] ?? 0) + count,
          total_duration_ms: Number(existingRow['total_duration_ms'] ?? 0) + durationMs,
        };
        return { rows: { _array: [] }, rowsAffected: 1 };
      }

      if (sql.includes('n_level_projection')) {
        const params = parameters ? [...parameters] : [];
        const userId = params[0] as string;
        const nLevel = params[1] as number;
        const strikesBelow50 = params[2] as number;
        const strikesAbove80 = params[3] as number;
        const recommendedLevel = params[4] as number;
        const lastUpdated = params[5] as string;
        const id = params[6] as string;

        const table = this.tables.get('n_level_projection') ?? [];
        const existing = table.findIndex((r) => r['id'] === id);
        if (existing < 0) return { rows: { _array: [] }, rowsAffected: 0 };

        table[existing] = {
          id,
          user_id: userId,
          n_level: nLevel,
          strikes_below_50: strikesBelow50,
          strikes_above_80: strikesAbove80,
          recommended_level: recommendedLevel,
          last_updated: lastUpdated,
        };
        return { rows: { _array: [] }, rowsAffected: 1 };
      }

      if (sql.includes('journey_state_projection')) {
        const params = parameters ? [...parameters] : [];
        const table = this.tables.get('journey_state_projection') ?? [];
        const existing = table.findIndex((r) => r['id'] === params[5]);
        if (existing < 0) return { rows: { _array: [] }, rowsAffected: 0 };
        table[existing] = {
          id: params[5] as string,
          user_id: params[0] as string,
          journey_id: params[1] as string,
          journey_game_mode: (params[2] as string | null) ?? null,
          state_json: params[3] as string,
          updated_at: params[4] as string,
        };
        return { rows: { _array: [] }, rowsAffected: 1 };
      }

      return { rows: { _array: [] }, rowsAffected: 0 };
    }

    // ---- INSERT/UPSERT ----
    if (upperSql.includes('INSERT')) {
      if (sql.includes('emt_subscriptions')) {
        const params = parameters ? [...parameters] : [];
        const id = params[0] as string;
        const table = this.tables.get('emt_subscriptions') ?? [];
        const existing = table.findIndex((r) => r['id'] === id);
        const row: MockRow = {
          id: params[0] as string,
          subscription_id: params[1] as string,
          version: params[2] as number,
          partition: params[3] as string,
          last_processed_position: params[4] as string,
        };
        if (existing < 0) {
          table.push(row);
          return { rows: { _array: [] }, rowsAffected: 1 };
        }
        // INSERT OR IGNORE semantics: no-op when row exists
        return { rows: { _array: [] }, rowsAffected: 0 };
      }

      if (sql.includes('streak_projection')) {
        const table = this.tables.get('streak_projection') ?? [];
        const existing = table.findIndex((r) => String(r['id']) === '1');
        if (existing >= 0) {
          // INSERT OR IGNORE semantics: no-op when row exists
          return { rows: { _array: [] }, rowsAffected: 0 };
        }
        table.push({ id: '1', current_streak: 0, best_streak: 0, last_active_date: null });
        return { rows: { _array: [] }, rowsAffected: 1 };
      }

      if (sql.includes('daily_activity_projection')) {
        const params = parameters ? [...parameters] : [];
        const date = params[0] as string;
        const table = this.tables.get('daily_activity_projection') ?? [];
        const existing = table.findIndex((r) => r['date'] === date);

        if (existing < 0) {
          table.push({ date, sessions_count: 0, total_duration_ms: 0 });
          return { rows: { _array: [] }, rowsAffected: 1 };
        }
        // INSERT OR IGNORE semantics: no-op when row exists
        return { rows: { _array: [] }, rowsAffected: 0 };
      }

      if (sql.includes('n_level_projection')) {
        const params = parameters ? [...parameters] : [];
        const id = params[0] as string;
        const table = this.tables.get('n_level_projection') ?? [];
        const existing = table.findIndex((r) => r['id'] === id);
        const row: MockRow = {
          id,
          user_id: params[1] as string,
          n_level: params[2] as number,
          strikes_below_50: params[3] as number,
          strikes_above_80: params[4] as number,
          recommended_level: params[5] as number,
          last_updated: params[6] as string,
        };
        if (existing < 0) {
          table.push(row);
          return { rows: { _array: [] }, rowsAffected: 1 };
        }
        // INSERT OR IGNORE semantics: no-op when row exists
        return { rows: { _array: [] }, rowsAffected: 0 };
      }

      if (sql.includes('journey_state_projection')) {
        const params = parameters ? [...parameters] : [];
        const id = params[0] as string;
        const table = this.tables.get('journey_state_projection') ?? [];
        const existing = table.findIndex((r) => r['id'] === id);
        const row: MockRow = {
          id,
          user_id: params[1] as string,
          journey_id: params[2] as string,
          journey_game_mode: (params[3] as string | null) ?? null,
          state_json: params[4] as string,
          updated_at: params[5] as string,
        };
        if (existing < 0) {
          table.push(row);
          return { rows: { _array: [] }, rowsAffected: 1 };
        }
        return { rows: { _array: [] }, rowsAffected: 0 };
      }

      if (sql.includes('projection_effects')) {
        const params = parameters ? [...parameters] : [];
        const table = this.tables.get('projection_effects') ?? [];
        const valuesPerRow = 4;
        for (let i = 0; i < params.length; i += valuesPerRow) {
          const id = params[i] as string;
          if (table.some((row) => row['id'] === id)) continue;
          table.push({
            id,
            projection_id: params[i + 1] as string,
            effect_key: params[i + 2] as string,
            applied_at: params[i + 3] as string,
          });
        }
        return { rows: { _array: [] }, rowsAffected: 1 };
      }

      if (sql.includes('es_projection_errors')) {
        const params = parameters ? [...parameters] : [];
        const table = this.tables.get('es_projection_errors') ?? [];
        const existing = table.findIndex((row) => row['id'] === params[0]);
        const row = {
          id: params[0] as string,
          projector_name: params[1] as string,
          event_global_position: params[2] as string,
          event_stream_id: params[3] as string,
          event_type: params[4] as string,
          error_message: params[5] as string,
          error_stack: params[6] as string | null,
          failed_at: params[7] as string,
          retry_count: params[8] as number,
          last_retry_at: params[9] as string,
        };
        if (existing >= 0) {
          table[existing] = row;
        } else {
          table.push(row);
        }
        return { rows: { _array: [] }, rowsAffected: 1 };
      }

      return { rows: { _array: [] }, rowsAffected: 0 };
    }

    // ---- DELETE ----
    if (upperSql.includes('DELETE')) {
      if (sql.includes('streak_projection')) {
        this.tables.set('streak_projection', []);
      } else if (sql.includes('daily_activity_projection')) {
        this.tables.set('daily_activity_projection', []);
      } else if (sql.includes('n_level_projection')) {
        this.tables.set('n_level_projection', []);
      } else if (sql.includes('journey_state_projection')) {
        this.tables.set('journey_state_projection', []);
      } else if (sql.includes('projection_effects')) {
        this.tables.set('projection_effects', []);
      }
      return { rows: { _array: [] }, rowsAffected: 1 };
    }

    return { rows: { _array: [] }, rowsAffected: 0 };
  }

  async getOptional<T>(sql: string, parameters?: readonly unknown[]): Promise<T | null> {
    const result = await this.execute(sql, parameters);
    return (result.rows._array[0] as T) ?? null;
  }

  /** Helper: add a fake event to emt_messages */
  addEvent(opts: {
    type: string;
    globalPosition: number;
    data: Record<string, unknown>;
    createdAt?: string;
  }): void {
    const table = this.tables.get('emt_messages') ?? [];
    table.push({
      message_id: `evt-${opts.globalPosition}`,
      global_position: String(opts.globalPosition),
      stream_id: 'session:test',
      stream_position: String(opts.globalPosition),
      message_type: opts.type,
      message_data: JSON.stringify({ data: opts.data }),
      message_kind: 'E',
      is_archived: 0,
      created:
        opts.createdAt ??
        new Date(`2026-03-0${Math.min(opts.globalPosition, 9)}T10:00:00Z`).toISOString(),
    });
  }
}

// =============================================================================
// Helper
// =============================================================================

function makeProjectedEvent(opts: {
  type: string;
  data: Record<string, unknown>;
  globalPosition: number;
  createdAt?: Date;
}): ProjectedEvent {
  return {
    type: opts.type,
    data: opts.data,
    globalPosition: BigInt(opts.globalPosition),
    createdAt: opts.createdAt ?? new Date('2026-03-01T10:00:00Z'),
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('ProjectionProcessor', () => {
  let mockDb: MockPowerSyncDatabase;
  let processor: ProjectionProcessor;

  beforeEach(() => {
    resetProjectionProcessor();
    mockDb = new MockPowerSyncDatabase();
    processor = getProjectionProcessor(
      mockDb as unknown as import('@powersync/web').AbstractPowerSyncDatabase,
    );
  });

  afterEach(() => {
    resetProjectionProcessor();
  });

  describe('processEvents (incremental — same handle as replay)', () => {
    it('should update streak projection for a completed session', async () => {
      const event = makeProjectedEvent({
        type: 'SESSION_ENDED',
        data: { reason: 'completed', durationMs: 300000 },
        globalPosition: 100,
        createdAt: new Date('2026-03-01T10:00:00Z'),
      });

      await processor.processEvents([event]);

      const streakTable = mockDb.tables.get('streak_projection')!;
      expect(streakTable).toHaveLength(1);
      expect(streakTable[0]!['current_streak']).toBe(1);
      expect(streakTable[0]!['best_streak']).toBe(1);
      expect(streakTable[0]!['last_active_date']).toBe('2026-03-01');
    });

    it('should update daily activity projection with direct SQL', async () => {
      const event = makeProjectedEvent({
        type: 'SESSION_ENDED',
        data: { reason: 'completed', durationMs: 300000 },
        globalPosition: 100,
      });

      await processor.processEvents([event]);

      const activityTable = mockDb.tables.get('daily_activity_projection')!;
      expect(activityTable).toHaveLength(1);
      expect(activityTable[0]!['sessions_count']).toBe(1);
      expect(activityTable[0]!['total_duration_ms']).toBe(300000);
    });

    it('should ignore abandoned sessions', async () => {
      const event = makeProjectedEvent({
        type: 'SESSION_ENDED',
        data: { reason: 'abandoned', durationMs: 10000 },
        globalPosition: 100,
      });

      await processor.processEvents([event]);

      // Streak handle writes initial state (abandoned events don't evolve)
      const streakTable = mockDb.tables.get('streak_projection')!;
      expect(streakTable[0]!['current_streak']).toBe(0);
      expect(streakTable[0]!['last_active_date']).toBeNull();

      // Daily activity handle skips abandoned — no row written
      const activityTable = mockDb.tables.get('daily_activity_projection')!;
      expect(activityTable).toHaveLength(0);
    });

    it('should process TRACE_SESSION_ENDED events', async () => {
      const event = makeProjectedEvent({
        type: 'TRACE_SESSION_ENDED',
        data: { reason: 'completed', durationMs: 200000 },
        globalPosition: 100,
        createdAt: new Date('2026-03-01T10:00:00Z'),
      });

      await processor.processEvents([event]);

      const streakTable = mockDb.tables.get('streak_projection')!;
      expect(streakTable).toHaveLength(1);
      expect(streakTable[0]!['current_streak']).toBe(1);
    });

    it('should write checkpoint after processing', async () => {
      const event = makeProjectedEvent({
        type: 'SESSION_ENDED',
        data: { reason: 'completed', durationMs: 300000 },
        globalPosition: 42,
      });

      await processor.processEvents([event]);

      const checkpoints = mockDb.tables.get('emt_subscriptions')!;
      const streakCheckpoint = checkpoints.find((r) => r['id'] === 'streak');
      expect(streakCheckpoint).toBeDefined();
      expect(streakCheckpoint!['version']).toBe(2);
      expect(streakCheckpoint!['last_processed_position']).toBe('42');
    });

    it('should update n-level projection for brainworkshop sessions', async () => {
      const event = makeProjectedEvent({
        type: 'SESSION_ENDED',
        data: { reason: 'completed', userId: 'user-1', nLevel: 3, accuracy: 45 },
        globalPosition: 100,
        createdAt: new Date('2026-03-01T10:00:00Z'),
      });

      await processor.processEvents([event]);

      const nLevelTable = mockDb.tables.get('n_level_projection')!;
      expect(nLevelTable).toHaveLength(1);
      expect(nLevelTable[0]!['id']).toBe('user-1:3');
      expect(nLevelTable[0]!['strikes_below_50']).toBe(1);
    });

    it('should ignore unknown event types (no matching canHandle)', async () => {
      const event = makeProjectedEvent({
        type: 'SOME_UNKNOWN_EVENT',
        data: {
          userId: 'user-1',
        },
        globalPosition: 110,
        createdAt: new Date('2026-03-01T10:00:00Z'),
      });

      await processor.processEvents([event]);

      const journeyTable = mockDb.tables.get('journey_state_projection')!;
      expect(journeyTable).toHaveLength(0);
    });

    it('should no-op on JOURNEY_TRANSITION_DECIDED (journey state rebuilt from session_summaries)', async () => {
      const event = makeProjectedEvent({
        type: 'JOURNEY_TRANSITION_DECIDED',
        data: {
          id: 'journey-transition:s-1',
          userId: 'user-1',
          journeyId: 'journey-1',
          journeyStartLevel: 2,
          journeyTargetLevel: 5,
          journeyGameMode: 'dual-track-dnb-hybrid',
          stageId: 1,
        },
        globalPosition: 111,
        createdAt: new Date('2026-03-01T10:00:00Z'),
      });

      await processor.processEvents([event]);
      await processor.processEvents([event]);

      // Handler is now a no-op — journey state is rebuilt from session_summaries
      const journeyTable = mockDb.tables.get('journey_state_projection')!;
      expect(journeyTable).toHaveLength(0);
    });

    it('should increment daily activity count for same date', async () => {
      const event1 = makeProjectedEvent({
        type: 'SESSION_ENDED',
        data: { reason: 'completed', durationMs: 100000 },
        globalPosition: 1,
        createdAt: new Date('2026-03-01T10:00:00Z'),
      });
      const event2 = makeProjectedEvent({
        type: 'SESSION_ENDED',
        data: { reason: 'completed', durationMs: 200000 },
        globalPosition: 2,
        createdAt: new Date('2026-03-01T14:00:00Z'),
      });

      await processor.processEvents([event1, event2]);

      const activityTable = mockDb.tables.get('daily_activity_projection')!;
      expect(activityTable).toHaveLength(1);
      expect(activityTable[0]!['sessions_count']).toBe(2);
      expect(activityTable[0]!['total_duration_ms']).toBe(300000);
    });
  });

  describe('ensureUpToDate', () => {
    it('should replay projections when no checkpoint exists', async () => {
      mockDb.addEvent({
        type: 'SESSION_ENDED',
        globalPosition: 10,
        data: { reason: 'completed', durationMs: 300000 },
        createdAt: '2026-03-01T10:00:00Z',
      });

      const report = await processor.ensureUpToDate();

      expect(report.replayed).toContain('streak');
      expect(report.replayed).toContain('daily-activity');
      expect(report.replayed).toContain('n-level');
      expect(report.totalEventsProcessed).toBeGreaterThan(0);

      const streakTable = mockDb.tables.get('streak_projection')!;
      expect(streakTable).toHaveLength(1);
      expect(streakTable[0]!['current_streak']).toBe(1);
    });

    it('should replay on version mismatch', async () => {
      mockDb.tables.get('emt_subscriptions')!.push({
        id: 'streak',
        subscription_id: 'streak',
        version: 1, // Old version (current is 2)
        partition: 'global',
        last_processed_position: '100',
      });

      mockDb.addEvent({
        type: 'SESSION_ENDED',
        globalPosition: 10,
        data: { reason: 'completed', durationMs: 300000 },
        createdAt: '2026-03-01T10:00:00Z',
      });

      const report = await processor.ensureUpToDate();

      expect(report.replayed).toContain('streak');
    });

    it('should do incremental catch-up when version matches', async () => {
      mockDb.tables.get('emt_subscriptions')!.push({
        id: 'streak',
        subscription_id: 'streak',
        version: 2,
        partition: 'global',
        last_processed_position: '5',
      });

      // Pre-populate streak state (as if events 1-5 were already processed)
      mockDb.tables.get('streak_projection')!.push({
        id: 1,
        current_streak: 1,
        best_streak: 1,
        last_active_date: '2026-03-01',
      });

      // Add a new event at position 10
      mockDb.addEvent({
        type: 'SESSION_ENDED',
        globalPosition: 10,
        data: { reason: 'completed', durationMs: 300000 },
        createdAt: '2026-03-02T10:00:00Z',
      });

      const report = await processor.ensureUpToDate();

      expect(report.replayed).not.toContain('streak');
      expect(report.caughtUp).toContain('streak');

      // Streak should be incremented (same handle as replay)
      const streakTable = mockDb.tables.get('streak_projection')!;
      expect(streakTable[0]!['current_streak']).toBe(2);
    });

    it('should not catch up when already at latest position', async () => {
      mockDb.tables.get('emt_subscriptions')!.push({
        id: 'streak',
        subscription_id: 'streak',
        version: 2,
        partition: 'global',
        last_processed_position: '100',
      });

      const report = await processor.ensureUpToDate();

      expect(report.replayed).not.toContain('streak');
      expect(report.caughtUp).not.toContain('streak');
    });
  });

  describe('rebuild (truncate + handle = same path as replay)', () => {
    it('should clear and replay a single projection', async () => {
      // Pre-populate streak
      mockDb.tables.get('streak_projection')!.push({
        id: 1,
        current_streak: 5,
        best_streak: 10,
        last_active_date: '2026-02-28',
      });

      mockDb.addEvent({
        type: 'SESSION_ENDED',
        globalPosition: 10,
        data: { reason: 'completed', durationMs: 300000 },
        createdAt: '2026-03-01T10:00:00Z',
      });

      const count = await processor.rebuild('streak');

      expect(count).toBe(1);
      const streakTable = mockDb.tables.get('streak_projection')!;
      expect(streakTable[0]!['current_streak']).toBe(1); // Rebuilt from scratch
    });

    it('should throw for unknown projection', async () => {
      await expect(processor.rebuild('nonexistent')).rejects.toThrow('Unknown projection');
    });
  });

  describe('rebuildAll', () => {
    it('should rebuild all projections', async () => {
      mockDb.addEvent({
        type: 'SESSION_ENDED',
        globalPosition: 10,
        data: { reason: 'completed', durationMs: 300000 },
        createdAt: '2026-03-01T10:00:00Z',
      });

      const total = await processor.rebuildAll();

      expect(total).toBeGreaterThan(0);
      expect(mockDb.tables.get('streak_projection')).toHaveLength(1);
      expect(mockDb.tables.get('daily_activity_projection')).toHaveLength(1);
    });
  });

  describe('toProjectedEvent', () => {
    it('should convert StoredEvent to ProjectedEvent', () => {
      const storedEvent = {
        eventId: 'evt-1',
        streamPosition: 1n,
        globalPosition: 42n,
        type: 'SESSION_ENDED',
        data: { reason: 'completed' },
        metadata: {},
        createdAt: new Date('2026-03-01T10:00:00Z'),
      };

      const projected = toProjectedEvent(storedEvent);

      expect(projected.type).toBe('SESSION_ENDED');
      expect(projected.globalPosition).toBe(42n);
      expect(projected.data).toEqual({ reason: 'completed' });
    });
  });
});
