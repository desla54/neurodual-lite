import { describe, expect, it, mock } from 'bun:test';
import type { SQL } from 'drizzle-orm';
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core';
import type { PersistencePort, SessionSummaryInput, StoredEvent } from '@neurodual/logic';
import type { NeuroDualDrizzleDatabase } from '../db/drizzle';
import {
  insertSessionSummaryFromEvent,
  rebuildMissingSessionSummaries,
  repairDriftedSessionSummaries,
} from './history-projection';

const sqliteDialect = new SQLiteSyncDialect();

function withDrizzleDb<
  T extends Record<string, unknown> & {
    query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
    execute: (sql: string, params?: unknown[]) => Promise<void>;
  },
>(
  persistence: T,
): T & { getDrizzleDb: () => NeuroDualDrizzleDatabase; getPowerSyncDb: () => Promise<unknown> } {
  const drizzleDb = {
    all: async <R extends object>(statement: SQL): Promise<readonly R[]> => {
      const compiled = sqliteDialect.sqlToQuery(statement);
      const result = await persistence.query(compiled.sql, [...compiled.params]);
      return result.rows as readonly R[];
    },
    get: async <R extends object>(statement: SQL): Promise<R | undefined> => {
      const compiled = sqliteDialect.sqlToQuery(statement);
      const result = await persistence.query(compiled.sql, [...compiled.params]);
      return result.rows[0] as R | undefined;
    },
    run: async (statement: SQL): Promise<void> => {
      const compiled = sqliteDialect.sqlToQuery(statement);
      await persistence.execute(compiled.sql, [...compiled.params]);
    },
  } as unknown as NeuroDualDrizzleDatabase;

  // Mock AbstractPowerSyncDatabase that delegates to persistence.query()
  const mockPowerSyncDb = {
    getAll: async (sqlStr: string, params?: unknown[]) => {
      const result = await persistence.query(sqlStr, params);
      return result.rows;
    },
    getOptional: async (sqlStr: string, params?: unknown[]) => {
      const result = await persistence.query(sqlStr, params);
      return result.rows[0] ?? null;
    },
  };

  return {
    ...persistence,
    getDrizzleDb: () => drizzleDb,
    getPowerSyncDb: async () => mockPowerSyncDb,
  };
}

function createMockPersistence(): PersistencePort {
  return withDrizzleDb({
    // Abandoned cleanup uses these
    deleteSession: mock(() => Promise.resolve(0)),
    queueDeletion: mock(() => Promise.resolve()),
    // Snapshot cleanup may query session_summaries for day/user (we return none here)
    query: mock(() => Promise.resolve({ rows: [] })),
    execute: mock(() => Promise.resolve()),
    // Not used in the abandoned fast path, but required by type
    getSession: mock(() => Promise.resolve([])),
  }) as unknown as PersistencePort;
}

describe('history-projection (abandoned cleanup)', () => {
  it("should delete abandoned sessions when event.reason === 'abandoned' (fast path)", async () => {
    const persistence = createMockPersistence();

    // Minimal event shape: `reason` exists and is checked before any DB reads.
    const event = {
      type: 'TRACE_SESSION_ENDED',
      sessionId: 's-abandon-1',
      reason: 'abandoned',
    } as any;

    await insertSessionSummaryFromEvent(persistence, event);

    expect(persistence.deleteSession).toHaveBeenCalledWith('s-abandon-1');
    expect(persistence.queueDeletion).not.toHaveBeenCalled();
  });

  it('should delete abandoned sessions when stored raw events contain an abandoned end event', async () => {
    const persistence = createMockPersistence();
    persistence.getSession = mock(
      async () =>
        [
          {
            id: 'evt-end',
            user_id: 'local',
            session_id: 's-abandon-raw-1',
            type: 'CORSI_SESSION_ENDED',
            timestamp: Date.now(),
            payload: {
              schemaVersion: 1,
              reason: 'abandoned',
              totalTrials: 0,
              correctTrials: 0,
              maxSpan: 0,
              score: 0,
              durationMs: 0,
              playContext: 'free',
            },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            deleted: false,
            synced: true,
          },
        ] as unknown as StoredEvent[],
    );

    await insertSessionSummaryFromEvent(persistence, {
      type: 'CORSI_SESSION_STARTED',
      sessionId: 's-abandon-raw-1',
    } as any);

    expect(persistence.deleteSession).toHaveBeenCalledWith('s-abandon-raw-1');
    expect(persistence.queueDeletion).not.toHaveBeenCalled();
  });
});

describe('history-projection (journey context timing)', () => {
  it('reprojects after JOURNEY_TRANSITION_DECIDED is persisted (flat record)', async () => {
    const sessionId = 's-journey-race-1';
    const userId = 'user-123';
    const now = Date.now();

    const journeyTransitionFields = {
      journeyId: 'journey-1',
      journeyStartLevel: 2,
      journeyTargetLevel: 5,
      stageId: 1,
      stageMode: 'catch',
      nLevel: 2,
      journeyName: 'Test Journey',
      journeyGameMode: 'dual-catch',
      upsThreshold: 50,
      isValidating: false,
      validatingSessions: 0,
      sessionsRequired: 3,
      stageCompleted: false,
      nextStageUnlocked: null,
      nextPlayableStage: null,
    } as const;

    const baseEvents: StoredEvent[] = [
      {
        id: 'evt-start',
        user_id: userId,
        session_id: sessionId,
        type: 'SESSION_STARTED',
        timestamp: now - 1000,
        payload: {
          schemaVersion: 1,
          sessionId,
          userId,
          nLevel: 2,
          device: {
            platform: 'web',
            screenWidth: 1920,
            screenHeight: 1080,
            userAgent: 'test-agent',
            touchCapable: false,
          },
          context: {
            timeOfDay: 'afternoon',
            localHour: 14,
            dayOfWeek: 4,
            timezone: 'Europe/Paris',
          },
          config: {
            nLevel: 2,
            activeModalities: ['position'],
            trialsCount: 20,
            targetProbability: 0.3,
            lureProbability: 0,
            intervalSeconds: 3,
            stimulusDurationSeconds: 0.5,
            generator: 'BrainWorkshop',
          },
          playContext: 'journey',
          journeyStageId: 1,
          journeyId: 'journey-1',
          journeyStartLevel: 2,
          journeyTargetLevel: 5,
        },
        created_at: new Date(now - 1000).toISOString(),
        updated_at: new Date(now - 1000).toISOString(),
        deleted: false,
        synced: true,
      },
      {
        id: 'evt-end',
        user_id: userId,
        session_id: sessionId,
        type: 'SESSION_ENDED',
        timestamp: now,
        payload: {
          schemaVersion: 1,
          sessionId,
          reason: 'completed',
          playContext: 'journey',
          journeyStageId: 1,
          journeyId: 'journey-1',
        },
        created_at: new Date(now).toISOString(),
        updated_at: new Date(now).toISOString(),
        deleted: false,
        synced: true,
      },
    ];

    const enrichedEvents: StoredEvent[] = [
      ...baseEvents,
      {
        id: 'evt-ctx',
        user_id: userId,
        session_id: sessionId,
        type: 'JOURNEY_TRANSITION_DECIDED',
        timestamp: now + 10,
        payload: {
          schemaVersion: 1,
          sessionId,
          ...journeyTransitionFields,
        },
        created_at: new Date(now + 10).toISOString(),
        updated_at: new Date(now + 10).toISOString(),
        deleted: false,
        synced: true,
      },
    ];

    let phase: 'base' | 'enriched' = 'base';
    const persistence = withDrizzleDb({
      query: mock(async () => ({ rows: [] })),
      execute: mock(async () => {}),
      deleteSession: mock(async () => 0),
      queueDeletion: mock(async () => {}),
      getSession: mock(async () => (phase === 'base' ? baseEvents : enrichedEvents)),
    }) as unknown as PersistencePort;

    const inserted: SessionSummaryInput[] = [];
    const writer = {
      insert: async (summary: SessionSummaryInput) => {
        inserted.push(summary);
      },
    };

    await insertSessionSummaryFromEvent(
      persistence,
      { type: 'SESSION_ENDED', sessionId } as any,
      writer,
    );
    expect(inserted.length).toBe(1);
    expect(inserted[0]?.journeyContext).toBeUndefined();

    phase = 'enriched';
    await insertSessionSummaryFromEvent(
      persistence,
      { type: 'JOURNEY_TRANSITION_DECIDED', sessionId } as any,
      writer,
    );
    expect(inserted.length).toBe(2);
    // journeyContext is no longer written to session_summaries —
    // journey state is rebuilt from facts by the journey-state-projection.
    expect(inserted[1]?.journeyContext).toBeUndefined();
  });

  it('reprojects after JOURNEY_TRANSITION_DECIDED is persisted', async () => {
    const sessionId = 's-journey-transition-race-1';
    const userId = 'user-123';
    const now = Date.now();

    const baseEvents: StoredEvent[] = [
      {
        id: 'evt-start',
        user_id: userId,
        session_id: sessionId,
        type: 'SESSION_STARTED',
        timestamp: now - 1000,
        payload: {
          schemaVersion: 1,
          sessionId,
          userId,
          nLevel: 2,
          device: {
            platform: 'web',
            screenWidth: 1920,
            screenHeight: 1080,
            userAgent: 'test-agent',
            touchCapable: false,
          },
          context: {
            timeOfDay: 'afternoon',
            localHour: 14,
            dayOfWeek: 4,
            timezone: 'Europe/Paris',
          },
          config: {
            nLevel: 2,
            activeModalities: ['position'],
            trialsCount: 20,
            targetProbability: 0.3,
            lureProbability: 0,
            intervalSeconds: 3,
            stimulusDurationSeconds: 0.5,
            generator: 'BrainWorkshop',
          },
          playContext: 'journey',
          journeyStageId: 1,
          journeyId: 'journey-1',
          journeyStartLevel: 2,
          journeyTargetLevel: 5,
        },
        created_at: new Date(now - 1000).toISOString(),
        updated_at: new Date(now - 1000).toISOString(),
        deleted: false,
        synced: true,
      },
      {
        id: 'evt-end',
        user_id: userId,
        session_id: sessionId,
        type: 'SESSION_ENDED',
        timestamp: now,
        payload: {
          schemaVersion: 1,
          sessionId,
          reason: 'completed',
          playContext: 'journey',
          journeyStageId: 1,
          journeyId: 'journey-1',
        },
        created_at: new Date(now).toISOString(),
        updated_at: new Date(now).toISOString(),
        deleted: false,
        synced: true,
      },
    ];

    const enrichedEvents: StoredEvent[] = [
      ...baseEvents,
      {
        id: 'evt-transition',
        user_id: userId,
        session_id: sessionId,
        type: 'JOURNEY_TRANSITION_DECIDED',
        timestamp: now + 10,
        payload: {
          schemaVersion: 1,
          sessionId,
          journeyId: 'journey-1',
          journeyStartLevel: 2,
          journeyTargetLevel: 5,
          journeyGameMode: 'dual-track-dnb-hybrid',
          stageId: 1,
          stageMode: 'simulator',
          nLevel: 2,
          journeyName: 'Hybrid',
          journeyNameShort: 'Hybride DNB + Track',
          upsThreshold: 50,
          isValidating: false,
          validatingSessions: 0,
          sessionsRequired: 1,
          stageCompleted: false,
          nextStageUnlocked: null,
          nextPlayableStage: 1,
          nextSessionGameMode: 'dual-track',
          journeyProtocol: 'hybrid-jaeggi',
          sessionRole: 'track-half',
          journeyDecision: 'pending-pair',
          hybridProgress: {
            loopPhase: 'track',
            trackSessionsCompleted: 1,
            trackSessionsRequired: 2,
            dnbSessionsCompleted: 0,
            dnbSessionsRequired: 2,
          },
        },
        created_at: new Date(now + 10).toISOString(),
        updated_at: new Date(now + 10).toISOString(),
        deleted: false,
        synced: true,
      },
    ];

    let phase: 'base' | 'enriched' = 'base';
    const persistence = withDrizzleDb({
      query: mock(async () => ({ rows: [] })),
      execute: mock(async () => {}),
      deleteSession: mock(async () => 0),
      queueDeletion: mock(async () => {}),
      getSession: mock(async () => (phase === 'base' ? baseEvents : enrichedEvents)),
    }) as unknown as PersistencePort;

    const inserted: SessionSummaryInput[] = [];
    const writer = {
      insert: async (summary: SessionSummaryInput) => {
        inserted.push(summary);
      },
    };

    await insertSessionSummaryFromEvent(
      persistence,
      { type: 'SESSION_ENDED', sessionId } as any,
      writer,
    );
    expect(inserted[0]?.journeyContext).toBeUndefined();

    phase = 'enriched';
    await insertSessionSummaryFromEvent(
      persistence,
      { type: 'JOURNEY_TRANSITION_DECIDED', sessionId } as any,
      writer,
    );

    // journeyContext is no longer written to session_summaries —
    // journey state is rebuilt from facts by the journey-state-projection.
    expect(inserted[1]?.journeyContext).toBeUndefined();
  });
});

describe('history-projection (xp breakdown timing)', () => {
  it('reprojects after XP_BREAKDOWN_COMPUTED is persisted', async () => {
    const sessionId = 's-xp-race-1';
    const userId = 'user-123';
    const now = Date.now();

    const xpBreakdown = {
      base: 100,
      performance: 0,
      accuracy: 0,
      badgeBonus: 0,
      streakBonus: 0,
      dailyBonus: 0,
      flowBonus: 0,
      confidenceMultiplier: 1,
      subtotalBeforeConfidence: 100,
      total: 100,
      dailyCapReached: false,
    } as const;

    const baseEvents: StoredEvent[] = [
      {
        id: 'evt-start',
        user_id: userId,
        session_id: sessionId,
        type: 'SESSION_STARTED',
        timestamp: now - 1000,
        payload: {
          schemaVersion: 1,
          sessionId,
          userId,
          nLevel: 2,
          device: {
            platform: 'web',
            screenWidth: 1920,
            screenHeight: 1080,
            userAgent: 'test-agent',
            touchCapable: false,
          },
          context: {
            timeOfDay: 'afternoon',
            localHour: 14,
            dayOfWeek: 4,
            timezone: 'Europe/Paris',
          },
          config: {
            nLevel: 2,
            activeModalities: ['position'],
            trialsCount: 20,
            targetProbability: 0.3,
            lureProbability: 0,
            intervalSeconds: 3,
            stimulusDurationSeconds: 0.5,
            generator: 'BrainWorkshop',
          },
          playContext: 'free',
        },
        created_at: new Date(now - 1000).toISOString(),
        updated_at: new Date(now - 1000).toISOString(),
        deleted: false,
        synced: true,
      },
      {
        id: 'evt-end',
        user_id: userId,
        session_id: sessionId,
        type: 'SESSION_ENDED',
        timestamp: now,
        payload: {
          schemaVersion: 1,
          sessionId,
          reason: 'completed',
          playContext: 'free',
        },
        created_at: new Date(now).toISOString(),
        updated_at: new Date(now).toISOString(),
        deleted: false,
        synced: true,
      },
    ];

    const enrichedEvents: StoredEvent[] = [
      ...baseEvents,
      {
        id: 'evt-xp',
        user_id: userId,
        session_id: sessionId,
        type: 'XP_BREAKDOWN_COMPUTED',
        timestamp: now + 10,
        payload: {
          schemaVersion: 1,
          sessionId,
          xpBreakdown,
        },
        created_at: new Date(now + 10).toISOString(),
        updated_at: new Date(now + 10).toISOString(),
        deleted: false,
        synced: true,
      },
    ];

    let phase: 'base' | 'enriched' = 'base';
    const persistence = withDrizzleDb({
      query: mock(async () => ({ rows: [] })),
      execute: mock(async () => {}),
      deleteSession: mock(async () => 0),
      queueDeletion: mock(async () => {}),
      getSession: mock(async () => (phase === 'base' ? baseEvents : enrichedEvents)),
    }) as unknown as PersistencePort;

    const inserted: SessionSummaryInput[] = [];
    const writer = {
      insert: async (summary: SessionSummaryInput) => {
        inserted.push(summary);
      },
    };

    await insertSessionSummaryFromEvent(
      persistence,
      { type: 'SESSION_ENDED', sessionId } as any,
      writer,
    );
    expect(inserted.length).toBe(1);
    expect(inserted[0]?.xpBreakdown).toBeUndefined();

    phase = 'enriched';
    await insertSessionSummaryFromEvent(
      persistence,
      { type: 'XP_BREAKDOWN_COMPUTED', sessionId } as any,
      writer,
    );
    expect(inserted.length).toBe(2);
    expect(inserted[1]?.xpBreakdown).toEqual(xpBreakdown);
  });
});

describe('history-projection (missing summaries)', () => {
  it('should chunk session_id IN queries under SQLite bind limits', async () => {
    const sessionCount = 905;
    const sessionIds = Array.from({ length: sessionCount }, (_, index) => `s-${index}`);

    const queries: Array<{ sql: string; params?: unknown[] }> = [];

    const persistence = withDrizzleDb({
      query: mock(async (sql: string, params?: unknown[]) => {
        queries.push({ sql, params });

        // Phase 7/8: Handle emt_messages query for session IDs
        if (
          sql.includes('SELECT DISTINCT CASE') &&
          sql.includes('FROM emt_messages') &&
          sql.includes("stream_id LIKE 'training:session:%'")
        ) {
          return { rows: sessionIds.map((session_id) => ({ session_id })) };
        }

        if (sql.includes('SELECT session_id FROM session_summaries')) {
          return { rows: [] };
        }

        // Phase 7: Handle emt_messages query with IN clause
        if (sql.includes('SELECT') && sql.includes('message_id') && sql.includes('IN')) {
          return { rows: [] };
        }

        return { rows: [] };
      }),
      execute: mock(async () => {}),
      // Not used by this test but required by type at call sites
      deleteSession: mock(async () => 0),
      queueDeletion: mock(async () => {}),
      getSession: mock(async () => []),
    }) as unknown as PersistencePort;

    const projected = await rebuildMissingSessionSummaries(persistence);
    expect(projected).toBe(0);

    const inQueries = queries.filter(
      (q) =>
        q.sql.includes('message_id') &&
        q.sql.includes("stream_id LIKE 'training:session:%'") &&
        q.sql.includes('IN'),
    );
    expect(inQueries.length).toBeGreaterThan(1);

    // event-queries chunks session IDs to MAX_BIND=900 + type params (~6-7),
    // staying well under the SQLite bind limit of 999.
    for (const q of inQueries) {
      expect(q.params?.length ?? 0).toBeLessThanOrEqual(999);
    }
  });
});

describe('history-projection (drift repair)', () => {
  it('repairs a drifted summary when projected values differ', async () => {
    const sessionId = 's-drift-1';
    const endEventPayload = {
      nLevel: 3,
      dPrime: 2.2,
      passed: true,
      trialsCount: 20,
      durationMs: 60000,
      generator: 'BrainWorkshop',
      activeModalities: ['position'],
      byModality: {
        position: {
          hits: 10,
          misses: 0,
          falseAlarms: 0,
          correctRejections: 10,
          avgRT: 400,
          dPrime: 3,
        },
      },
      originalCreatedAt: '2025-01-01T00:00:00.000Z',
      gameMode: 'dualnback-classic',
      playContext: 'free',
    };

    const insertSessionSummary = mock(async () => {});

    const persistence = withDrizzleDb({
      query: mock(async (sql: string) => {
        // Phase 7/8: Handle emt_messages queries (replaces main.events_all)
        if (sql.includes('FROM emt_messages') && sql.includes('message_type IN')) {
          return {
            rows: [
              {
                id: 'event-1',
                session_id: sessionId, // substr(stream_id, 9) returns session_id
                type: 'SESSION_IMPORTED',
                timestamp: '1735689600000',
                payload: JSON.stringify(endEventPayload),
              },
            ],
          };
        }

        if (sql.includes('FROM session_summaries')) {
          return {
            rows: [
              {
                session_id: sessionId,
                session_type: 'imported',
                created_at: '2025-01-01T00:00:00.000Z',
                n_level: 2, // drift (expected=3)
                duration_ms: 60000,
                trials_count: 20,
                total_hits: null,
                total_misses: null,
                total_fa: null,
                total_cr: null,
                global_d_prime: 2.2,
                accuracy: null,
                generator: 'BrainWorkshop',
                game_mode: 'dualnback-classic',
                passed: 1,
                reason: 'completed',
                journey_stage_id: null,
                journey_id: null,
                play_context: 'free',
                by_modality: endEventPayload.byModality,
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
                worst_modality_error_rate: 0,
                input_methods: null,
              },
            ],
          };
        }

        if (sql.includes('SELECT id, session_id, type, timestamp, payload')) {
          return {
            rows: [
              {
                id: 'event-1',
                session_id: sessionId,
                type: 'SESSION_IMPORTED',
                timestamp: '1735689600000',
                payload: endEventPayload,
              },
            ],
          };
        }

        return { rows: [] };
      }),
      getSession: mock(async () => [{ user_id: 'u1' }]),
      insertSessionSummary,
      deleteSession: mock(async () => 0),
      queueDeletion: mock(async () => {}),
      execute: mock(async () => {}),
    }) as unknown as PersistencePort;

    const result = await repairDriftedSessionSummaries(persistence, {
      gameMode: 'dualnback-classic',
    });

    expect(result.checked).toBe(1);
    expect(result.drifted).toBe(1);
    expect(result.repaired).toBe(1);
    expect(insertSessionSummary).toHaveBeenCalledTimes(1);
  });

  it('does not rewrite when cache already matches projection', async () => {
    const sessionId = 's-drift-2';
    const endEventPayload = {
      nLevel: 3,
      dPrime: 2.2,
      passed: true,
      trialsCount: 20,
      durationMs: 60000,
      generator: 'BrainWorkshop',
      activeModalities: ['position'],
      byModality: {
        position: {
          hits: 10,
          misses: 0,
          falseAlarms: 0,
          correctRejections: 10,
          avgRT: 400,
          dPrime: 3,
        },
      },
      originalCreatedAt: '2025-01-01T00:00:00.000Z',
      gameMode: 'dualnback-classic',
      playContext: 'free',
    };

    const insertSessionSummary = mock(async () => {});

    const persistence = withDrizzleDb({
      query: mock(async (sql: string) => {
        // Phase 7/8: Handle emt_messages queries (replaces main.events_all)
        if (sql.includes('FROM emt_messages') && sql.includes('message_type IN')) {
          return {
            rows: [
              {
                id: 'event-2',
                session_id: sessionId, // substr(stream_id, 9) returns session_id
                type: 'SESSION_IMPORTED',
                timestamp: '1735689600000',
                payload: JSON.stringify(endEventPayload),
              },
            ],
          };
        }

        if (sql.includes('FROM session_summaries')) {
          return {
            rows: [
              {
                session_id: sessionId,
                session_type: 'tempo',
                created_at: '2025-01-01T00:00:00.000Z',
                n_level: 3, // matches expected
                duration_ms: 60000,
                trials_count: 20,
                total_hits: 10,
                total_misses: 0,
                total_fa: 0,
                total_cr: 10,
                global_d_prime: 2.2,
                accuracy: 1,
                generator: 'BrainWorkshop',
                game_mode: 'dualnback-classic',
                passed: 1,
                reason: 'completed',
                journey_stage_id: null,
                journey_id: null,
                play_context: 'free',
                by_modality: endEventPayload.byModality,
                flow_confidence_score: null,
                flow_directness_ratio: null,
                flow_wrong_slot_dwell_ms: null,
                recall_confidence_score: null,
                recall_fluency_score: null,
                recall_corrections_count: null,
                ups_score: 100,
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
                worst_modality_error_rate: 0,
                input_methods: null,
              },
            ],
          };
        }

        // Phase 7: Handle emt_messages queries for repairDriftedSessionSummaries
        if (sql.includes('FROM emt_messages') && sql.includes('stream_id =')) {
          return {
            rows: [
              {
                id: 'event-2',
                session_id: sessionId, // substr(stream_id, 9) returns session_id
                type: 'SESSION_IMPORTED',
                timestamp: '1735689600000',
                payload: JSON.stringify(endEventPayload),
              },
            ],
          };
        }

        // Legacy query support (for backwards compatibility during migration)
        if (sql.includes('SELECT id, session_id, type, timestamp, payload')) {
          return {
            rows: [
              {
                id: 'event-2',
                session_id: sessionId,
                type: 'SESSION_IMPORTED',
                timestamp: '1735689600000',
                payload: endEventPayload,
              },
            ],
          };
        }

        return { rows: [] };
      }),
      getSession: mock(async () => [{ user_id: 'u1' }]),
      insertSessionSummary,
      deleteSession: mock(async () => 0),
      queueDeletion: mock(async () => {}),
      execute: mock(async () => {}),
    }) as unknown as PersistencePort;

    const result = await repairDriftedSessionSummaries(persistence, {
      gameMode: 'dualnback-classic',
    });

    expect(result.checked).toBe(1);
    expect(result.drifted).toBe(0);
    expect(result.repaired).toBe(0);
    expect(insertSessionSummary).not.toHaveBeenCalled();
  });
});
