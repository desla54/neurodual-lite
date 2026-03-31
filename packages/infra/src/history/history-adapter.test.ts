/**
 * History Adapter Tests
 *
 * Tests for the history adapter using mocked PersistencePort.
 * Covers: getSessions, deleteSession, getReport, data parsing.
 */

import { describe, expect, it, mock } from 'bun:test';
import type { SQL } from 'drizzle-orm';
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core';

// Mock the persistence helper that uses global state
mock.module('../persistence/setup-persistence', () => ({
  deleteSessionEvents: mock(() => Promise.resolve()),
}));

import { createHistoryAdapter } from './history-adapter';
import { ensureSummaryProjectedForSession } from './history-projection';
import type { PersistencePort, SessionSummaryRow, StoredEvent } from '@neurodual/logic';
import type { NeuroDualDrizzleDatabase } from '../db/drizzle';

// =============================================================================
// Mock Fixtures
// =============================================================================

function createMockSessionRow(overrides: Partial<SessionSummaryRow> = {}): SessionSummaryRow {
  return {
    session_id: 'test-session-1',
    user_id: 'local',
    session_type: 'tempo',
    created_at: '2024-01-15T10:00:00.000Z',
    n_level: 2,
    duration_ms: 120000,
    trials_count: 20,
    total_hits: null,
    total_misses: null,
    total_fa: null,
    total_cr: null,
    global_d_prime: 2.5,
    accuracy: null,
    passed: true,
    by_modality: {
      position: {
        hits: 8,
        misses: 2,
        falseAlarms: 1,
        correctRejections: 9,
        avgRT: 450,
        dPrime: 2.3,
      },
      audio: { hits: 7, misses: 3, falseAlarms: 2, correctRejections: 8, avgRT: 520, dPrime: 1.8 },
    },
    generator: 'BrainWorkshop',
    game_mode: 'dual-catch',
    reason: 'completed',
    journey_stage_id: null,
    journey_id: null,
    play_context: 'free',
    flow_confidence_score: null,
    flow_directness_ratio: null,
    flow_wrong_slot_dwell_ms: null,
    recall_confidence_score: null,
    recall_fluency_score: null,
    recall_corrections_count: null,
    ups_score: null,
    ups_accuracy: null,
    ups_confidence: null,
    avg_response_time_ms: null,
    median_response_time_ms: null,
    response_time_std_dev: null,
    avg_press_duration_ms: null,
    press_duration_std_dev: null,
    responses_during_stimulus: null,
    responses_after_stimulus: null,
    focus_lost_count: null,
    focus_lost_total_ms: null,
    xp_breakdown: null,
    worst_modality_error_rate: null,
    journey_context: null,
    input_methods: null,
    ...overrides,
  } as SessionSummaryRow;
}

function createMockPersistence(
  sessions: SessionSummaryRow[] = [],
  sessionEvents: Record<string, StoredEvent[]> = {},
): PersistencePort {
  const query = mock(() => Promise.resolve({ rows: [] as Record<string, unknown>[] }));
  const execute = mock(() => Promise.resolve());
  const writeTransaction = mock(
    async (fn: (tx: { execute: typeof execute }) => Promise<unknown>) => {
      return await fn({ execute });
    },
  );
  const getSession = mock((sessionId: string) => Promise.resolve(sessionEvents[sessionId] ?? []));
  const queryEvents = mock((options: { sessionId?: string; type?: string | string[] }) => {
    const allRows = Object.values(sessionEvents).flat();
    return Promise.resolve(
      allRows.filter((row) => {
        if (options.sessionId && row.session_id !== options.sessionId) return false;
        if (!options.type) return true;
        if (Array.isArray(options.type)) {
          return options.type.includes(row.type);
        }
        return row.type === options.type;
      }),
    );
  });
  const all = mock(() => Promise.resolve(Object.values(sessionEvents).flat()));
  const sqliteDialect = new SQLiteSyncDialect();
  const drizzleDb = {
    all: async <T extends object>(querySql: SQL): Promise<readonly T[]> => {
      const compiled = sqliteDialect.sqlToQuery(querySql);
      const result = await (query as any)(compiled.sql, [...compiled.params]);
      return result.rows as readonly T[];
    },
    run: async (querySql: SQL): Promise<void> => {
      const compiled = sqliteDialect.sqlToQuery(querySql);
      await (execute as any)(compiled.sql, [...compiled.params]);
    },
  } as unknown as NeuroDualDrizzleDatabase;

  return {
    getSessionSummaries: mock((userId?: string) => {
      if (!userId) return Promise.resolve(sessions);
      return Promise.resolve(sessions.filter((s) => (s.user_id ?? 'local') === userId));
    }),
    queueDeletion: mock(() => Promise.resolve()),
    deleteSession: mock(() => Promise.resolve()),
    getSession,
    queryEvents,
    all,
    // `query()` returns { rows } in the real PersistencePort
    query,
    execute,
    writeTransaction,
    getDrizzleDb: mock(() => drizzleDb),
  } as unknown as PersistencePort;
}

// =============================================================================
// Tests
// =============================================================================

describe('HistoryAdapter', () => {
  describe('createHistoryAdapter', () => {
    it('should create adapter with empty sessions', async () => {
      const persistence = createMockPersistence([]);
      const adapter = createHistoryAdapter(persistence);

      const sessions = await adapter.getSessions();

      expect(sessions).toEqual([]);
      expect(persistence.getSessionSummaries).toHaveBeenCalled();
    });

    it('should return sessions from persistence', async () => {
      const mockRow = createMockSessionRow();
      const persistence = createMockPersistence([mockRow]);
      const adapter = createHistoryAdapter(persistence);

      const sessions = await adapter.getSessions();

      expect(sessions.length).toBe(1);
      expect(sessions[0]!.id).toBe('test-session-1');
      expect(sessions[0]!.nLevel).toBe(2);
      expect(sessions[0]!.passed).toBe(true);
    });

    it('should convert SessionSummaryRow to SessionHistoryItem correctly', async () => {
      const mockRow = createMockSessionRow({
        global_d_prime: 3.2,
        trials_count: 25,
        duration_ms: 180000,
        game_mode: 'flow',
      });
      const persistence = createMockPersistence([mockRow]);
      const adapter = createHistoryAdapter(persistence);

      const sessions = await adapter.getSessions();
      const session = sessions[0];

      expect(session!.dPrime).toBe(3.2);
      expect(session!.trialsCount).toBe(25);
      expect(session!.durationMs).toBe(180000);
      expect(session!.gameMode).toBe('flow');
    });
  });

  describe('getSessions (no cache)', () => {
    it('should query SQL on every call (no manual cache)', async () => {
      const mockRow = createMockSessionRow();
      const persistence = createMockPersistence([mockRow]);
      const adapter = createHistoryAdapter(persistence);

      const initialCalls = (persistence.getSessionSummaries as any).mock.calls.length;
      await adapter.getSessions();
      const afterFirstCall = (persistence.getSessionSummaries as any).mock.calls.length;
      await adapter.getSessions();
      const afterSecondCall = (persistence.getSessionSummaries as any).mock.calls.length;

      // Some bootstrap flows may query as well; we only assert that each explicit call
      // causes an additional query (no manual cache in adapter).
      expect(afterFirstCall).toBeGreaterThan(initialCalls);
      expect(afterSecondCall).toBeGreaterThan(afterFirstCall);
    });
  });

  describe('deleteSession', () => {
    it('should delete locally without queuing legacy pending deletions', async () => {
      const mockRow = createMockSessionRow();
      const persistence = createMockPersistence([mockRow]);
      const adapter = createHistoryAdapter(persistence);

      await adapter.deleteSession('test-session-1');

      expect(persistence.queueDeletion).not.toHaveBeenCalled();
    });
  });

  describe('getReport', () => {
    it('should return null for unknown session', async () => {
      const persistence = createMockPersistence([]);
      const adapter = createHistoryAdapter(persistence);

      const retrieved = await adapter.getReport('unknown-session');

      expect(retrieved).toBeNull();
    });

    it('should project report from persisted events when cache is empty', async () => {
      const sessionId = 'projected-session';
      const events: StoredEvent[] = [
        {
          id: 'evt-1',
          user_id: 'local',
          session_id: sessionId,
          type: 'SESSION_STARTED',
          timestamp: 1_000,
          payload: {
            schemaVersion: 1,
            gameMode: 'dual-catch',
            userId: 'local',
            nLevel: 2,
            device: {
              platform: 'web',
              screenWidth: 1920,
              screenHeight: 1080,
              userAgent: 'test',
              touchCapable: false,
            },
            context: {
              timeOfDay: 'morning',
              localHour: 10,
              dayOfWeek: 1,
              timezone: 'UTC',
            },
            config: {
              nLevel: 2,
              generator: 'BrainWorkshop',
              activeModalities: ['position', 'audio'],
              trialsCount: 1,
              targetProbability: 0.3,
              lureProbability: 0,
              intervalSeconds: 3,
              stimulusDurationSeconds: 0.5,
            },
            playContext: 'free',
          },
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
          deleted: false,
          synced: true,
        },
        {
          id: 'evt-2',
          user_id: 'local',
          session_id: sessionId,
          type: 'TRIAL_PRESENTED',
          timestamp: 2_000,
          payload: {
            schemaVersion: 1,
            trial: { index: 0, isPositionTarget: true, isSoundTarget: true, isBuffer: false },
            isiMs: 2500,
            stimulusDurationMs: 500,
          },
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
          deleted: false,
          synced: true,
        },
        {
          id: 'evt-3',
          user_id: 'local',
          session_id: sessionId,
          type: 'USER_RESPONDED',
          timestamp: 2_400,
          payload: {
            schemaVersion: 1,
            trialIndex: 0,
            modality: 'position',
            reactionTimeMs: 400,
            pressDurationMs: 120,
            responsePhase: 'during_stimulus',
          },
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
          deleted: false,
          synced: true,
        },
        {
          id: 'evt-4',
          user_id: 'local',
          session_id: sessionId,
          type: 'USER_RESPONDED',
          timestamp: 2_500,
          payload: {
            schemaVersion: 1,
            trialIndex: 0,
            modality: 'audio',
            reactionTimeMs: 450,
            pressDurationMs: 130,
            responsePhase: 'during_stimulus',
          },
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
          deleted: false,
          synced: true,
        },
        {
          id: 'evt-5',
          user_id: 'local',
          session_id: sessionId,
          type: 'SESSION_ENDED',
          timestamp: 3_000,
          payload: { schemaVersion: 1, reason: 'completed', playContext: 'free' },
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
          deleted: false,
          synced: true,
        },
      ];

      const persistence = createMockPersistence([], { [sessionId]: events });
      const adapter = createHistoryAdapter(persistence);
      const retrieved = await adapter.getReport(sessionId);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.sessionId).toBe(sessionId);
      expect(retrieved?.gameMode).toBe('dual-catch');
    });
  });

  describe('byModality parsing', () => {
    it('should parse byModality stats correctly', async () => {
      const mockRow = createMockSessionRow({
        by_modality: {
          position: {
            hits: 5,
            misses: 3,
            falseAlarms: 2,
            correctRejections: 10,
            avgRT: 400,
            dPrime: 1.5,
          },
        },
      });
      const persistence = createMockPersistence([mockRow]);
      const adapter = createHistoryAdapter(persistence);

      const sessions = await adapter.getSessions();
      const posStats = sessions[0]!.byModality.position;

      expect(posStats!.hits).toBe(5);
      expect(posStats!.misses).toBe(3);
      expect(posStats!.falseAlarms).toBe(2);
      expect(posStats!.correctRejections).toBe(10);
      expect(posStats!.avgRT).toBe(400);
      expect(posStats!.dPrime).toBe(1.5);
    });

    it('should handle empty byModality', async () => {
      const mockRow = createMockSessionRow({ by_modality: {} });
      const persistence = createMockPersistence([mockRow]);
      const adapter = createHistoryAdapter(persistence);

      const sessions = await adapter.getSessions();

      expect(sessions[0]!.activeModalities).toContain('position');
      expect(sessions[0]!.activeModalities).toContain('audio');
    });
  });

  describe('date parsing', () => {
    it('should parse Date object correctly', async () => {
      const date = new Date('2024-06-15T14:30:00Z');
      const mockRow = createMockSessionRow({ created_at: date as any });
      const persistence = createMockPersistence([mockRow]);
      const adapter = createHistoryAdapter(persistence);

      const sessions = await adapter.getSessions();

      expect(sessions[0]!.createdAt.getTime()).toBe(date.getTime());
    });

    it('should parse ISO string without Z suffix', async () => {
      const mockRow = createMockSessionRow({
        created_at: '2024-06-15T14:30:00' as any,
      });
      const persistence = createMockPersistence([mockRow]);
      const adapter = createHistoryAdapter(persistence);

      const sessions = await adapter.getSessions();

      // Should add Z suffix for UTC interpretation
      expect(sessions[0]!.createdAt.getUTCHours()).toBe(14);
    });
  });
});

// =============================================================================
// ensureSummaryProjectedForSession Tests
// =============================================================================

describe('ensureSummaryProjectedForSession', () => {
  it('should no-op when summary already exists', async () => {
    const sessionId = 'existing-session';
    const query = mock(async (sql: string, _params?: unknown[]) => {
      if (sql.includes('sqlite_master')) {
        return { rows: [{ count: 1 }] };
      }
      if (sql.includes('FROM session_summaries')) {
        return { rows: [{ session_id: sessionId }] };
      }
      return { rows: [] };
    });

    const mockPowerSyncDb = {
      getAll: async (sql: string, params?: unknown[]) => (await query(sql, params)).rows,
      getOptional: async (sql: string, params?: unknown[]) =>
        (await query(sql, params)).rows[0] ?? null,
    };
    const persistence = {
      query,
      getSession: mock(async () => []),
      execute: mock(async () => {}),
      writeTransaction: mock(async (fn: (tx: { execute: typeof Function }) => Promise<unknown>) => {
        return await fn({ execute: mock(async () => {}) } as any);
      }),
      getDrizzleDb: mock(() => ({ all: async () => [], run: async () => {} }) as any),
      getPowerSyncDb: async () => mockPowerSyncDb,
    } as unknown as PersistencePort;

    await ensureSummaryProjectedForSession(persistence, sessionId);

    // Should have checked table existence + queried session_summaries, not events
    expect(query).toHaveBeenCalledTimes(2);
    expect(query!.mock.calls[0]![0]).toContain('sqlite_master');
    expect(query!.mock.calls[1]![0]).toContain('session_summaries');
  });

  it('should no-op when no session-end event exists', async () => {
    const sessionId = 'no-end-event-session';
    const query = mock(async (sql: string, _params?: unknown[]) => {
      if (sql.includes('sqlite_master')) {
        return { rows: [{ count: 1 }] };
      }
      // No summary exists
      if (sql.includes('FROM session_summaries')) {
        return { rows: [] };
      }
      // No end event found in emt_messages
      if (sql.includes('FROM emt_messages')) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    const mockPowerSyncDb = {
      getAll: async (sql: string, params?: unknown[]) => (await query(sql, params)).rows,
      getOptional: async (sql: string, params?: unknown[]) =>
        (await query(sql, params)).rows[0] ?? null,
    };
    const persistence = {
      query,
      getSession: mock(async () => []),
      execute: mock(async () => {}),
      writeTransaction: mock(async (fn: (tx: { execute: typeof Function }) => Promise<unknown>) => {
        return await fn({ execute: mock(async () => {}) } as any);
      }),
      getDrizzleDb: mock(() => ({ all: async () => [], run: async () => {} }) as any),
      getPowerSyncDb: async () => mockPowerSyncDb,
    } as unknown as PersistencePort;

    await ensureSummaryProjectedForSession(persistence, sessionId);

    // Should have checked summaries then queried emt_messages for end events
    expect(query.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
