import { describe, expect, it, mock } from 'bun:test';
import { Database } from 'bun:sqlite';

import type { PersistencePort } from '@neurodual/logic';
import { cognitiveProfileProjectionDefinition } from './cognitive-profile-projection';
import { createSessionSummariesProjectionDefinition } from './session-summaries-projection';
import { SQLITE_SCHEMA } from '../db/sqlite-schema';
/** Inline mock event factory to avoid cross-package import of test-factories */
function createMockEvent(
  type: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: 'test-event-id',
    timestamp: Date.now(),
    sessionId: 'test-session-id',
    schemaVersion: 1,
    type,
    ...overrides,
  };
}

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

  async writeTransaction<T>(
    fn: (tx: {
      execute: any;
      query: <TRow extends object>(
        sql: string,
        parameters?: unknown[],
      ) => Promise<{ rows: TRow[] }>;
    }) => Promise<T>,
  ): Promise<T> {
    return fn({
      execute: this.execute.bind(this),
      query: async <TRow extends object>(sql: string, parameters: unknown[] = []) => ({
        rows: this.inner.query(sql).all(...(parameters as any)) as TRow[],
      }),
    });
  }

  insertEmptySummary(sessionId: string): void {
    this.inner
      .query(`INSERT INTO session_summaries (id, session_id) VALUES (?, ?)`)
      .run(...([sessionId, sessionId] as any));
  }

  countInProgressEvents(sessionId: string): number {
    const row = this.inner
      .query(`SELECT COUNT(*) as count FROM session_in_progress_events WHERE session_id = ?`)
      .get(sessionId) as { count: number } | null;
    return row?.count ?? 0;
  }

  countSessionSummaries(sessionId: string): number {
    const row = this.inner
      .query(`SELECT COUNT(*) as count FROM session_summaries WHERE session_id = ?`)
      .get(sessionId) as { count: number } | null;
    return row?.count ?? 0;
  }

  getUserStatsRow(userId: string): Record<string, unknown> | null {
    return (
      (this.inner.query(`SELECT * FROM user_stats_projection WHERE id = ?`).get(userId) as Record<
        string,
        unknown
      > | null) ?? null
    );
  }

  insertInProgressRow(input: {
    id: string;
    sessionId: string;
    eventType: string;
    eventData: string;
    globalPosition: string;
    createdAt: number;
  }): void {
    this.inner
      .query(
        `INSERT INTO session_in_progress_events (id, session_id, event_type, event_data, global_position, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        ...([
          input.id,
          input.sessionId,
          input.eventType,
          input.eventData,
          input.globalPosition,
          input.createdAt,
        ] as any),
      );
  }

  insertEmmettRow(input: {
    id: string;
    streamId: string;
    messageType: string;
    messageData: string;
    globalPosition: string;
    created: string;
  }): void {
    this.inner
      .query(
        `INSERT INTO emt_messages (
          id, stream_id, stream_position, partition, message_kind, message_data, message_metadata,
          message_schema_version, message_type, message_id, is_archived, global_position, created
        ) VALUES (?, ?, ?, 'default', 'E', ?, '{}', '1', ?, ?, 0, ?, ?)`,
      )
      .run(
        ...([
          input.id,
          input.streamId,
          input.globalPosition,
          input.messageData,
          input.messageType,
          input.id,
          input.globalPosition,
          input.created,
        ] as any),
      );
  }
}

function createPersistence(
  db: TestPowerSyncDb,
  overrides: Partial<PersistencePort> = {},
): PersistencePort {
  return {
    writeTransaction: db.writeTransaction.bind(db),
    deleteSession: mock(async () => 1),
    queueDeletion: mock(async () => {}),
    getSession: mock(async () => []),
    ...overrides,
  } as unknown as PersistencePort;
}

function makeTempoStart(sessionId: string, overrides: Record<string, unknown> = {}) {
  return {
    id: `${sessionId}:start`,
    type: 'SESSION_STARTED',
    sessionId,
    timestamp: 1000,
    schemaVersion: 1,
    userId: 'local',
    nLevel: 2,
    gameMode: 'dualnback-classic',
    playContext: 'free',
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
      activeModalities: ['position', 'audio'],
      trialsCount: 20,
      targetProbability: 0.3,
      lureProbability: 0,
      intervalSeconds: 3,
      stimulusDurationSeconds: 0.5,
      generator: 'DualnbackClassic',
    },
    ...overrides,
  };
}

function makeTempoEnd(sessionId: string, overrides: Record<string, unknown> = {}) {
  return {
    id: `${sessionId}:end`,
    type: 'SESSION_ENDED',
    sessionId,
    timestamp: 2000,
    schemaVersion: 1,
    reason: 'completed',
    playContext: 'free',
    ...overrides,
  };
}

function toProjectedEvent(
  type: string,
  data: Record<string, unknown>,
  globalPosition: bigint,
  createdAt = new Date(Number(globalPosition) * 1000),
) {
  return { type, data, globalPosition, createdAt };
}

function insertCalibrationBaseline(db: TestPowerSyncDb, userId: string, timestampMs: number): void {
  db.insertEmmettRow({
    id: `baseline:${userId}:${timestampMs}`,
    streamId: `calibration:${userId}`,
    messageType: 'CALIBRATION_BASELINE_SET',
    messageData: JSON.stringify({
      data: {
        id: `baseline:${userId}:${timestampMs}`,
        type: 'CALIBRATION_BASELINE_SET',
        userId,
        level: 2,
        timestamp: timestampMs,
      },
    }),
    globalPosition: String(timestampMs),
    created: new Date(timestampMs).toISOString(),
  });
}

function insertProjectedEventsIntoEmmett(
  db: TestPowerSyncDb,
  events: readonly ReturnType<typeof toProjectedEvent>[],
): void {
  for (const event of events) {
    const sessionId = event.data['sessionId'];
    if (typeof sessionId !== 'string' || sessionId.trim().length === 0) continue;
    db.insertEmmettRow({
      id: `${sessionId}:${event.globalPosition.toString()}`,
      streamId: `session:${sessionId}`,
      messageType: event.type,
      messageData: JSON.stringify({ data: event.data }),
      globalPosition: event.globalPosition.toString(),
      created: event.createdAt.toISOString(),
    });
  }
}

function makeTrackCalibrationEvents(
  sessionId: string,
  userId = 'local',
  startTimestamp = Date.UTC(2026, 2, 19, 10, 5, 0),
  calibrationModality = 'position',
) {
  return [
    toProjectedEvent(
      'MOT_SESSION_STARTED',
      {
        id: `${sessionId}:start`,
        type: 'MOT_SESSION_STARTED',
        eventId: `${sessionId}:start`,
        seq: 0,
        timestamp: startTimestamp,
        occurredAtMs: startTimestamp,
        monotonicMs: 0,
        sessionId,
        userId,
        gameMode: 'dual-track',
        playContext: 'calibration',
        config: {
          calibrationModality,
          trialsCount: 1,
          totalObjects: 5,
          targetCount: 2,
          highlightDurationMs: 2_000,
          trackingDurationMs: 5_000,
          speedPxPerSec: 160,
          motionComplexity: 'standard',
          crowdingMode: 'standard',
          crowdingThresholdPx: 70,
          minSeparationPx: 52,
          arenaWidthPx: 820,
          arenaHeightPx: 560,
          sessionKind: 'calibration',
        },
        device: {
          platform: 'web',
          screenWidth: 1920,
          screenHeight: 1080,
          userAgent: 'test',
          touchCapable: true,
        },
        context: {
          timeOfDay: 'morning',
          localHour: 9,
          dayOfWeek: 1,
          timezone: 'Europe/Paris',
        },
      },
      200n,
    ),
    toProjectedEvent(
      'MOT_TRIAL_COMPLETED',
      {
        id: `${sessionId}:trial-1`,
        type: 'MOT_TRIAL_COMPLETED',
        eventId: `${sessionId}:trial-1`,
        seq: 1,
        timestamp: startTimestamp + 1_000,
        occurredAtMs: startTimestamp + 1_000,
        monotonicMs: 1_000,
        sessionId,
        trialIndex: 0,
        targetIndices: [0, 3],
        selectedIndices: [0, 3],
        correctCount: 2,
        totalTargets: 2,
        accuracy: 1,
        responseTimeMs: 620,
        crowdingEvents: 0,
        minInterObjectDistancePx: 72,
      },
      201n,
    ),
    toProjectedEvent(
      'MOT_SESSION_ENDED',
      {
        id: `${sessionId}:end`,
        type: 'MOT_SESSION_ENDED',
        eventId: `${sessionId}:end`,
        seq: 2,
        timestamp: startTimestamp + 2_000,
        occurredAtMs: startTimestamp + 2_000,
        monotonicMs: 2_000,
        sessionId,
        reason: 'completed',
        totalTrials: 1,
        correctTrials: 1,
        accuracy: 1,
        score: 100,
        durationMs: 2_000,
        playContext: 'calibration',
      },
      202n,
    ),
  ];
}

describe('session-summaries-projection (derived events patching)', () => {
  it('stores intermediate session events as append-only rows', async () => {
    const sessionId = 's-proj-append-1';
    const db = new TestPowerSyncDb();
    const persistence = {
      getSession: mock(() => {
        throw new Error('getSession should not be called for intermediate events');
      }),
      insertSessionSummariesBatch: mock(async () => 0),
    } as unknown as PersistencePort;

    const projection = createSessionSummariesProjectionDefinition(persistence);

    await projection.handle(
      [
        {
          type: 'SESSION_STARTED',
          data: { schemaVersion: 1, sessionId, timestamp: Date.now(), userId: 'local' },
          globalPosition: 10n,
          createdAt: new Date(),
        },
        {
          type: 'TRIAL_PRESENTED',
          data: { schemaVersion: 1, sessionId, timestamp: Date.now(), trialIndex: 0 },
          globalPosition: 11n,
          createdAt: new Date(),
        },
      ],
      db as any,
    );

    expect(db.countInProgressEvents(sessionId)).toBe(2);
  });

  it('patches xp_breakdown but not journey_context from derived events', async () => {
    const sessionId = 's-proj-1';
    const db = new TestPowerSyncDb();
    db.insertEmptySummary(sessionId);

    const getSession = mock(() => {
      throw new Error('getSession should not be called for derived-only patch');
    });
    const insertSessionSummariesBatch = mock(async () => 0);

    const persistence = {
      getSession,
      insertSessionSummariesBatch,
    } as unknown as PersistencePort;

    const projection = createSessionSummariesProjectionDefinition(persistence);

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

    await projection.handle(
      [
        {
          type: 'JOURNEY_TRANSITION_DECIDED',
          data: {
            schemaVersion: 1,
            sessionId,
            journeyId: 'journey-1',
            journeyStartLevel: 1,
            journeyTargetLevel: 5,
            stageId: 1,
            stageMode: 'catch',
            nLevel: 2,
            journeyName: 'Test Journey',
            upsThreshold: 50,
            isValidating: false,
            validatingSessions: 0,
            sessionsRequired: 3,
            stageCompleted: false,
            nextStageUnlocked: null,
            timestamp: Date.now(),
          },
          globalPosition: 10n,
          createdAt: new Date(),
        },
        {
          type: 'XP_BREAKDOWN_COMPUTED',
          data: { schemaVersion: 1, sessionId, xpBreakdown, timestamp: Date.now() },
          globalPosition: 11n,
          createdAt: new Date(),
        },
      ],
      db as any,
    );

    const row = await db.getOptional<{
      journey_context: string | null;
      xp_breakdown: string | null;
    }>(`SELECT journey_context, xp_breakdown FROM session_summaries WHERE session_id = ?`, [
      sessionId,
    ]);
    expect(row).not.toBeNull();
    // JOURNEY_TRANSITION_DECIDED no longer patches journey_context
    expect(row?.journey_context).toBeNull();
    expect(row?.xp_breakdown ? JSON.parse(row.xp_breakdown) : null).toEqual(xpBreakdown);

    expect(getSession).not.toHaveBeenCalled();
    expect(insertSessionSummariesBatch).not.toHaveBeenCalled();
  });

  it('no longer writes journey_context from JOURNEY_TRANSITION_DECIDED (fact-driven projection)', async () => {
    const sessionId = 's-proj-transition-1';
    const db = new TestPowerSyncDb();
    db.insertEmptySummary(sessionId);

    const persistence = {
      getSession: mock(() => {
        throw new Error('getSession should not be called for derived-only patch');
      }),
      insertSessionSummariesBatch: mock(async () => 0),
    } as unknown as PersistencePort;

    const projection = createSessionSummariesProjectionDefinition(persistence);

    await projection.handle(
      [
        {
          type: 'JOURNEY_TRANSITION_DECIDED',
          data: {
            id: 'journey-transition:s-proj-transition-1',
            schemaVersion: 1,
            sessionId,
            timestamp: Date.now(),
            userId: 'local',
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
          globalPosition: 12n,
          createdAt: new Date(),
        },
      ],
      db as any,
    );

    const row = await db.getOptional<{ journey_context: string | null }>(
      `SELECT journey_context FROM session_summaries WHERE session_id = ?`,
      [sessionId],
    );

    // JOURNEY_TRANSITION_DECIDED no longer patches journey_context —
    // journey state is rebuilt from session_summaries by the fact-driven projection.
    expect(row?.journey_context).toBeNull();
  });

  it('finalizes a standard tempo session and updates stats atomically', async () => {
    const sessionId = 's-proj-finalize-1';
    const db = new TestPowerSyncDb();
    const persistence = createPersistence(db);
    const projection = createSessionSummariesProjectionDefinition(persistence);

    await projection.handle(
      [
        toProjectedEvent('SESSION_STARTED', makeTempoStart(sessionId), 10n),
        toProjectedEvent('SESSION_ENDED', makeTempoEnd(sessionId), 11n),
      ],
      db as any,
    );

    expect(db.countSessionSummaries(sessionId)).toBe(1);
    expect(db.countInProgressEvents(sessionId)).toBe(0);
    const stats = db.getUserStatsRow('local');
    expect(stats?.sessions_count).toBe(1);
  });

  it('does not double-count stats when the same finalized session is replayed', async () => {
    const sessionId = 's-proj-finalize-dup';
    const db = new TestPowerSyncDb();
    const persistence = createPersistence(db);
    const projection = createSessionSummariesProjectionDefinition(persistence);
    const events = [
      toProjectedEvent('SESSION_STARTED', makeTempoStart(sessionId), 10n),
      toProjectedEvent('SESSION_ENDED', makeTempoEnd(sessionId), 11n),
    ];

    await projection.handle(events, db as any);
    await projection.handle(events, db as any);

    const stats = db.getUserStatsRow('local');
    expect(stats?.sessions_count).toBe(1);
  });

  it('falls back to emt_messages when in-progress rows are missing the session start', async () => {
    const sessionId = 's-proj-fallback-1';
    const db = new TestPowerSyncDb();
    const persistence = createPersistence(db);
    const projection = createSessionSummariesProjectionDefinition(persistence);

    db.insertInProgressRow({
      id: `${sessionId}:11`,
      sessionId,
      eventType: 'TRIAL_PRESENTED',
      eventData: '{"not":"valid-trial"}',
      globalPosition: '11',
      createdAt: 11000,
    });
    db.insertEmmettRow({
      id: `${sessionId}:10`,
      streamId: `session:${sessionId}`,
      messageType: 'SESSION_STARTED',
      messageData: JSON.stringify({ data: makeTempoStart(sessionId) }),
      globalPosition: '10',
      created: new Date(10000).toISOString(),
    });
    db.insertEmmettRow({
      id: `${sessionId}:12`,
      streamId: `session:${sessionId}`,
      messageType: 'TRIAL_PRESENTED',
      messageData: '{bad-json',
      globalPosition: '12',
      created: new Date(12000).toISOString(),
    });

    await projection.handle(
      [toProjectedEvent('SESSION_ENDED', makeTempoEnd(sessionId), 13n)],
      db as any,
    );

    expect(db.countSessionSummaries(sessionId)).toBe(1);
  });

  it('cleans up abandoned sessions during finalization', async () => {
    const sessionId = 's-proj-abandoned';
    const db = new TestPowerSyncDb();
    const persistence = createPersistence(db);
    const projection = createSessionSummariesProjectionDefinition(persistence);

    await projection.handle(
      [
        toProjectedEvent('SESSION_STARTED', makeTempoStart(sessionId), 10n),
        toProjectedEvent('SESSION_ENDED', makeTempoEnd(sessionId, { reason: 'abandoned' }), 11n),
      ],
      db as any,
    );

    expect((persistence.deleteSession as ReturnType<typeof mock>).mock.calls.length).toBe(1);
    expect(db.countSessionSummaries(sessionId)).toBe(0);
  });

  it('appends derived journey events to in-progress state when the session is not finalized yet', async () => {
    const sessionId = 's-proj-derived-in-progress';
    const db = new TestPowerSyncDb();
    const persistence = createPersistence(db);
    const projection = createSessionSummariesProjectionDefinition(persistence);

    db.insertInProgressRow({
      id: `${sessionId}:10`,
      sessionId,
      eventType: 'SESSION_STARTED',
      eventData: JSON.stringify(makeTempoStart(sessionId)),
      globalPosition: '10',
      createdAt: 10000,
    });

    await projection.handle(
      [
        toProjectedEvent(
          'JOURNEY_TRANSITION_DECIDED',
          {
            id: `${sessionId}:11`,
            sessionId,
            timestamp: Date.now(),
            schemaVersion: 1,
            journeyId: 'journey-1',
            journeyStartLevel: 2,
            journeyTargetLevel: 5,
            stageId: 1,
            stageMode: 'simulator',
            nLevel: 2,
            journeyName: 'Hybrid',
            upsThreshold: 50,
            isValidating: false,
            validatingSessions: 0,
            sessionsRequired: 1,
            stageCompleted: false,
            nextStageUnlocked: null,
          },
          11n,
        ),
      ],
      db as any,
    );

    expect(db.countInProgressEvents(sessionId)).toBe(2);
    expect(db.countSessionSummaries(sessionId)).toBe(0);
  });

  it('projects cognitive-task session summaries from generic task events', async () => {
    const sessionId = 's-proj-cog-1';
    const db = new TestPowerSyncDb();
    const persistence = createPersistence(db);
    const projection = createSessionSummariesProjectionDefinition(persistence);

    await projection.handle(
      [
        toProjectedEvent(
          'COGNITIVE_TASK_SESSION_STARTED',
          {
            id: `${sessionId}:start`,
            type: 'COGNITIVE_TASK_SESSION_STARTED',
            eventId: `${sessionId}:start`,
            seq: 0,
            occurredAtMs: 1000,
            monotonicMs: 1000,
            sessionId,
            timestamp: 1000,
            schemaVersion: 1,
            taskType: 'stroop',
            userId: 'local',
            config: {},
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
            playContext: 'free',
            gameMode: 'cognitive-task',
          },
          20n,
        ),
        toProjectedEvent(
          'COGNITIVE_TASK_SESSION_ENDED',
          {
            id: `${sessionId}:end`,
            type: 'COGNITIVE_TASK_SESSION_ENDED',
            eventId: `${sessionId}:end`,
            seq: 1,
            occurredAtMs: 2000,
            monotonicMs: 2000,
            sessionId,
            timestamp: 2000,
            schemaVersion: 1,
            taskType: 'stroop',
            reason: 'completed',
            totalTrials: 10,
            correctTrials: 7,
            accuracy: 0.7,
            meanRtMs: 321,
            durationMs: 5000,
            playContext: 'free',
            metrics: { maxLevel: 3, hits: 7, misses: 3, falseAlarms: 1, correctRejections: 9 },
          },
          21n,
        ),
      ],
      db as any,
    );

    const row = await db.getOptional<{
      session_type: string | null;
      game_mode: string | null;
      n_level: number | null;
      avg_response_time_ms: number | null;
    }>(
      `SELECT session_type, game_mode, n_level, avg_response_time_ms FROM session_summaries WHERE session_id = ?`,
      [sessionId],
    );

    expect(row).toMatchObject({
      session_type: 'cognitive-task',
      game_mode: 'stroop',
      n_level: 3,
      avg_response_time_ms: 321,
    });
  });

  it('prefers reportedLevel over maxLevel for cognitive-task session summaries', async () => {
    const sessionId = 's-proj-cog-reported-level';
    const db = new TestPowerSyncDb();
    const persistence = createPersistence(db);
    const projection = createSessionSummariesProjectionDefinition(persistence);

    await projection.handle(
      [
        toProjectedEvent(
          'COGNITIVE_TASK_SESSION_STARTED',
          {
            id: `${sessionId}:start`,
            type: 'COGNITIVE_TASK_SESSION_STARTED',
            eventId: `${sessionId}:start`,
            seq: 0,
            occurredAtMs: 1000,
            monotonicMs: 1000,
            sessionId,
            timestamp: 1000,
            schemaVersion: 1,
            taskType: 'ravens',
            userId: 'local',
            config: {},
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
            playContext: 'free',
            gameMode: 'cognitive-task',
          },
          22n,
        ),
        toProjectedEvent(
          'COGNITIVE_TASK_SESSION_ENDED',
          {
            id: `${sessionId}:end`,
            type: 'COGNITIVE_TASK_SESSION_ENDED',
            eventId: `${sessionId}:end`,
            seq: 1,
            occurredAtMs: 2000,
            monotonicMs: 2000,
            sessionId,
            timestamp: 2000,
            schemaVersion: 1,
            taskType: 'ravens',
            reason: 'completed',
            totalTrials: 12,
            correctTrials: 8,
            accuracy: 0.67,
            durationMs: 5000,
            playContext: 'free',
            metrics: { reportedLevel: 6, maxLevel: 10 },
          },
          23n,
        ),
      ],
      db as any,
    );

    const row = await db.getOptional<{ n_level: number | null }>(
      `SELECT n_level FROM session_summaries WHERE session_id = ?`,
      [sessionId],
    );

    expect(row?.n_level).toBe(6);
  });

  it('defaults cognitive-task nLevel to 1 when no span/level metric is available', async () => {
    const sessionId = 's-proj-cog-default-level';
    const db = new TestPowerSyncDb();
    const persistence = createPersistence(db);
    const projection = createSessionSummariesProjectionDefinition(persistence);

    await projection.handle(
      [
        toProjectedEvent(
          'COGNITIVE_TASK_SESSION_STARTED',
          {
            id: `${sessionId}:start`,
            type: 'COGNITIVE_TASK_SESSION_STARTED',
            eventId: `${sessionId}:start`,
            seq: 0,
            occurredAtMs: 1000,
            monotonicMs: 1000,
            sessionId,
            timestamp: 1000,
            schemaVersion: 1,
            taskType: 'stroop',
            userId: 'local',
            config: {},
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
            playContext: 'free',
            gameMode: 'cognitive-task',
          },
          22n,
        ),
        toProjectedEvent(
          'COGNITIVE_TASK_SESSION_ENDED',
          {
            id: `${sessionId}:end`,
            type: 'COGNITIVE_TASK_SESSION_ENDED',
            eventId: `${sessionId}:end`,
            seq: 1,
            occurredAtMs: 2000,
            monotonicMs: 2000,
            sessionId,
            timestamp: 2000,
            schemaVersion: 1,
            taskType: 'stroop',
            reason: 'completed',
            totalTrials: 10,
            correctTrials: 5,
            accuracy: 0.5,
            durationMs: 5000,
            playContext: 'free',
            metrics: {},
          },
          23n,
        ),
      ],
      db as any,
    );

    const row = await db.getOptional<{ n_level: number | null }>(
      `SELECT n_level FROM session_summaries WHERE session_id = ?`,
      [sessionId],
    );
    expect(row?.n_level).toBe(1);
  });

  it('preserves calibration playContext for generic cognitive-task summaries', async () => {
    const sessionId = 's-proj-cog-calibration';
    const db = new TestPowerSyncDb();
    const persistence = createPersistence(db);
    const projection = createSessionSummariesProjectionDefinition(persistence);

    await projection.handle(
      [
        toProjectedEvent(
          'COGNITIVE_TASK_SESSION_STARTED',
          {
            id: `${sessionId}:start`,
            type: 'COGNITIVE_TASK_SESSION_STARTED',
            eventId: `${sessionId}:start`,
            seq: 0,
            occurredAtMs: 1000,
            monotonicMs: 1000,
            sessionId,
            timestamp: 1000,
            schemaVersion: 1,
            taskType: 'stroop',
            userId: 'local',
            config: {},
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
            playContext: 'calibration',
            gameMode: 'cognitive-task',
          },
          24n,
        ),
        toProjectedEvent(
          'COGNITIVE_TASK_SESSION_ENDED',
          {
            id: `${sessionId}:end`,
            type: 'COGNITIVE_TASK_SESSION_ENDED',
            eventId: `${sessionId}:end`,
            seq: 1,
            occurredAtMs: 2000,
            monotonicMs: 2000,
            sessionId,
            timestamp: 2000,
            schemaVersion: 1,
            taskType: 'stroop',
            reason: 'completed',
            totalTrials: 10,
            correctTrials: 9,
            accuracy: 0.9,
            durationMs: 5000,
            playContext: 'calibration',
            metrics: { maxLevel: 3 },
          },
          25n,
        ),
      ],
      db as any,
    );

    const row = await db.getOptional<{ play_context: string | null }>(
      `SELECT play_context FROM session_summaries WHERE session_id = ?`,
      [sessionId],
    );

    expect(row?.play_context).toBe('calibration');
  });

  it('finalizes imported sessions and updates xp + modality stats', async () => {
    const sessionId = 's-proj-imported-1';
    const db = new TestPowerSyncDb();
    const persistence = createPersistence(db);
    const projection = createSessionSummariesProjectionDefinition(persistence);

    await projection.handle(
      [
        toProjectedEvent(
          'SESSION_IMPORTED',
          {
            id: `${sessionId}:import`,
            type: 'SESSION_IMPORTED',
            sessionId,
            timestamp: 1_000,
            schemaVersion: 1,
            nLevel: 3,
            dPrime: 2.2,
            passed: true,
            trialsCount: 20,
            durationMs: 60_000,
            generator: 'BrainWorkshop',
            activeModalities: ['position', 'audio'],
            byModality: {
              position: {
                hits: 5,
                misses: 1,
                falseAlarms: 0,
                correctRejections: 6,
                avgRT: 400,
                dPrime: 2,
              },
              audio: {
                hits: 4,
                misses: 1,
                falseAlarms: 1,
                correctRejections: 6,
                avgRT: 450,
                dPrime: 1.7,
              },
            },
            originalCreatedAt: '2026-03-01T06:30:00.000Z',
            playContext: 'free',
            gameMode: 'dualnback-classic',
            upsScore: 91,
            upsAccuracy: 0.9,
            upsConfidence: 0.8,
          },
          30n,
        ),
        toProjectedEvent(
          'SESSION_ENDED',
          makeTempoEnd(sessionId, {
            id: `${sessionId}:end`,
            timestamp: 2_000,
          }),
          31n,
        ),
        toProjectedEvent(
          'XP_BREAKDOWN_COMPUTED',
          {
            id: `${sessionId}:xp`,
            type: 'XP_BREAKDOWN_COMPUTED',
            sessionId,
            timestamp: 2_100,
            schemaVersion: 1,
            xpBreakdown: {
              base: 100,
              performance: 10,
              accuracy: 5,
              badgeBonus: 0,
              streakBonus: 0,
              dailyBonus: 0,
              flowBonus: 0,
              confidenceMultiplier: 1,
              subtotalBeforeConfidence: 115,
              total: 115,
              dailyCapReached: false,
            },
          },
          32n,
        ),
      ],
      db as any,
    );

    const summary = await db.getOptional<{
      xp_breakdown: string | null;
      by_modality: string | null;
    }>(`SELECT xp_breakdown, by_modality FROM session_summaries WHERE session_id = ?`, [sessionId]);
    expect(summary?.xp_breakdown ? JSON.parse(summary.xp_breakdown) : null).toMatchObject({
      total: 115,
    });

    const stats = db.getUserStatsRow('local');
    expect(stats?.sessions_count).toBe(1);
    expect(stats?.total_xp).toBe(115);
    expect(stats?.early_morning_sessions).toBe(1);

    const modalityRow = await db.getOptional<{ hits_sum: number; rt_count: number }>(
      `SELECT hits_sum, rt_count FROM user_modality_stats_projection WHERE id = ?`,
      ['local:position'],
    );
    expect(modalityRow).toMatchObject({ hits_sum: 5, rt_count: 5 });
  });

  it('does not attach journey_context from JOURNEY_TRANSITION_DECIDED during finalization', async () => {
    const sessionId = 's-proj-finalize-transition';
    const db = new TestPowerSyncDb();
    const persistence = createPersistence(db);
    const projection = createSessionSummariesProjectionDefinition(persistence);

    await projection.handle(
      [
        toProjectedEvent(
          'SESSION_STARTED',
          makeTempoStart(sessionId, {
            playContext: 'journey',
            journeyStageId: 1,
            journeyId: 'journey-1',
            journeyStartLevel: 2,
            journeyTargetLevel: 5,
          }),
          60n,
        ),
        toProjectedEvent(
          'SESSION_ENDED',
          makeTempoEnd(sessionId, {
            playContext: 'journey',
            journeyStageId: 1,
            journeyId: 'journey-1',
          }),
          61n,
        ),
        toProjectedEvent(
          'JOURNEY_TRANSITION_DECIDED',
          {
            id: `${sessionId}:transition`,
            sessionId,
            timestamp: Date.now(),
            schemaVersion: 1,
            journeyId: 'journey-1',
            journeyStartLevel: 2,
            journeyTargetLevel: 5,
            journeyGameMode: 'dual-track-dnb-hybrid',
            stageId: 1,
            stageMode: 'simulator',
            nLevel: 2,
            journeyName: 'Hybrid',
            upsThreshold: 50,
            isValidating: false,
            validatingSessions: 0,
            sessionsRequired: 1,
            stageCompleted: false,
            nextStageUnlocked: null,
            nextPlayableStage: 1,
            nextSessionGameMode: 'dual-track',
            journeyDecision: 'pending-pair',
          },
          62n,
        ),
      ],
      db as any,
    );

    const row = await db.getOptional<{ journey_context: string | null }>(
      `SELECT journey_context FROM session_summaries WHERE session_id = ?`,
      [sessionId],
    );
    // JOURNEY_TRANSITION_DECIDED no longer patches journey_context
    expect(row?.journey_context).toBeNull();
  });

  it('does not attach journey_context via JOURNEY_TRANSITION_DECIDED during finalization', async () => {
    const sessionId = 's-proj-finalize-legacy-context';
    const db = new TestPowerSyncDb();
    const persistence = createPersistence(db);
    const projection = createSessionSummariesProjectionDefinition(persistence);

    await projection.handle(
      [
        toProjectedEvent('SESSION_STARTED', makeTempoStart(sessionId), 70n),
        toProjectedEvent('SESSION_ENDED', makeTempoEnd(sessionId), 71n),
        toProjectedEvent(
          'JOURNEY_TRANSITION_DECIDED',
          {
            id: `${sessionId}:ctx`,
            sessionId,
            timestamp: Date.now(),
            schemaVersion: 1,
            journeyId: 'journey-legacy',
            journeyStartLevel: 1,
            journeyTargetLevel: 5,
            stageId: 1,
            stageMode: 'simulator',
            nLevel: 2,
            journeyName: 'Legacy',
            upsThreshold: 50,
            isValidating: false,
            validatingSessions: 0,
            sessionsRequired: 1,
            stageCompleted: false,
            nextStageUnlocked: null,
          },
          72n,
        ),
      ],
      db as any,
    );

    const row = await db.getOptional<{ journey_context: string | null }>(
      `SELECT journey_context FROM session_summaries WHERE session_id = ?`,
      [sessionId],
    );
    expect(row?.journey_context).toBeNull();
  });

  it('defers writes in batch mode until endBatch is called', async () => {
    const sessionId = 's-proj-batch-1';
    const db = new TestPowerSyncDb();
    const persistence = createPersistence(db);
    const projection = createSessionSummariesProjectionDefinition(persistence);

    projection.beginBatch?.();
    await projection.handle(
      [
        toProjectedEvent('SESSION_STARTED', makeTempoStart(sessionId), 40n),
        toProjectedEvent('SESSION_ENDED', makeTempoEnd(sessionId), 41n),
      ],
      db as any,
    );

    expect(db.countSessionSummaries(sessionId)).toBe(0);
    await projection.endBatch?.(db as any);
    expect(db.countSessionSummaries(sessionId)).toBe(1);
  });

  it('rebuilds the cognitive profile from imported calibration summaries even without a start event', async () => {
    const sessionId = 's-proj-calibration-imported';
    const userId = 'user-calibration-imported';
    const db = new TestPowerSyncDb();
    const persistence = createPersistence(db);
    const projection = createSessionSummariesProjectionDefinition(persistence);
    const events = [
      toProjectedEvent(
        'SESSION_IMPORTED',
        {
          id: `${sessionId}:import`,
          type: 'SESSION_IMPORTED',
          sessionId,
          timestamp: Date.UTC(2026, 2, 19, 10, 5, 0),
          schemaVersion: 1,
          userId,
          nLevel: 2,
          dPrime: 3,
          passed: true,
          trialsCount: 10,
          durationMs: 30_000,
          generator: 'BrainWorkshop',
          activeModalities: ['position'],
          playContext: 'calibration',
          gameMode: 'dual-track',
          originalCreatedAt: '2026-03-19T10:05:00.000Z',
          byModality: {
            position: {
              hits: 5,
              misses: 0,
              falseAlarms: 0,
              correctRejections: 5,
              avgRT: 400,
              dPrime: 0,
            },
          },
        },
        300n,
      ),
    ] as const;

    const baselineTimestamp = Date.UTC(2026, 2, 19, 10, 0, 0);
    insertCalibrationBaseline(db, userId, baselineTimestamp);
    insertProjectedEventsIntoEmmett(db, events);

    // Process baseline through the cognitive profile handler first (as the ProcessorEngine would)
    const baselineEvent = toProjectedEvent(
      'CALIBRATION_BASELINE_SET',
      { userId, level: 2, timestamp: baselineTimestamp },
      BigInt(baselineTimestamp),
    );
    await cognitiveProfileProjectionDefinition.handle([baselineEvent], db as any);

    await projection.handle(events, db as any);
    await cognitiveProfileProjectionDefinition.handle(events, db as any);

    const row = await db.getOptional<{
      phase: string | null;
      recent_step_keys_json: string | null;
      results_json: string | null;
    }>(
      `SELECT phase, recent_step_keys_json, results_json
       FROM cognitive_profile_projection
       WHERE user_id = ?`,
      [userId],
    );

    expect(row?.phase).toBe('complete');
    expect(row?.recent_step_keys_json).toBe('["position:dual-track"]');
    const results = JSON.parse(row?.results_json ?? '{}') as Record<
      string,
      { masteredLevel: number | null; progressToNext: number }
    >;
    expect(results['position:dual-track']).toMatchObject({
      masteredLevel: 2,
      progressToNext: 22,
    });
  });

  it('rebuilds the cognitive profile at endBatch after calibration summaries are actually persisted', async () => {
    const sessionId = 's-proj-calibration-batch';
    const userId = 'user-calibration-batch';
    const db = new TestPowerSyncDb();
    const persistence = createPersistence(db);
    const projection = createSessionSummariesProjectionDefinition(persistence);
    const events = makeTrackCalibrationEvents(sessionId, userId);

    const baselineTimestamp = Date.UTC(2026, 2, 19, 10, 0, 0);
    insertCalibrationBaseline(db, userId, baselineTimestamp);
    insertProjectedEventsIntoEmmett(db, events);

    // Process baseline through the cognitive profile handler first
    const baselineEvent = toProjectedEvent(
      'CALIBRATION_BASELINE_SET',
      { userId, level: 2, timestamp: baselineTimestamp },
      BigInt(baselineTimestamp),
    );
    await cognitiveProfileProjectionDefinition.handle([baselineEvent], db as any);

    projection.beginBatch?.();
    await projection.handle(events, db as any);

    const beforeFlush = await db.getOptional<{ phase: string | null }>(
      `SELECT phase FROM cognitive_profile_projection WHERE user_id = ?`,
      [userId],
    );
    // Baseline was already handled so row exists with 'complete' phase
    expect(beforeFlush?.phase).toBe('complete');

    await projection.endBatch?.(db as any);
    await cognitiveProfileProjectionDefinition.handle(events, db as any);

    const row = await db.getOptional<{
      phase: string | null;
      recent_step_keys_json: string | null;
      results_json: string | null;
    }>(
      `SELECT phase, recent_step_keys_json, results_json
       FROM cognitive_profile_projection
       WHERE user_id = ?`,
      [userId],
    );

    expect(row?.phase).toBe('complete');
    expect(row?.recent_step_keys_json).toBe('["position:dual-track"]');
    const results = JSON.parse(row?.results_json ?? '{}') as Record<
      string,
      { masteredLevel: number | null; progressToNext: number }
    >;
    expect(results['position:dual-track']).toMatchObject({
      masteredLevel: 2,
      progressToNext: 22,
    });
  });

  it('credits the configured dual-track calibration modality in the cognitive profile', async () => {
    const sessionId = 's-proj-track-semantic-calibration';
    const userId = 'semantic-user';
    const db = new TestPowerSyncDb();
    const baselineTimestamp = Date.UTC(2026, 2, 19, 10, 0, 0);
    insertCalibrationBaseline(db, userId, baselineTimestamp);
    const persistence = createPersistence(db);
    const projection = createSessionSummariesProjectionDefinition(persistence);
    const events = makeTrackCalibrationEvents(
      sessionId,
      userId,
      Date.UTC(2026, 2, 19, 10, 5, 0),
      'semantic',
    );
    insertProjectedEventsIntoEmmett(db, events);

    // Process baseline through the cognitive profile handler first
    const baselineEvent = toProjectedEvent(
      'CALIBRATION_BASELINE_SET',
      { userId, level: 2, timestamp: baselineTimestamp },
      BigInt(baselineTimestamp),
    );
    await cognitiveProfileProjectionDefinition.handle([baselineEvent], db as any);

    await projection.handle(events, db as any);
    await cognitiveProfileProjectionDefinition.handle(events, db as any);

    const row = await db.getOptional<{
      play_context: string | null;
      active_modalities_csv: string | null;
      by_modality: string | null;
    }>(
      `SELECT play_context, active_modalities_csv, by_modality
       FROM session_summaries
       WHERE session_id = ?`,
      [sessionId],
    );

    expect(row?.play_context).toBe('calibration');
    expect(row?.active_modalities_csv).toBe('words');
    expect(row?.by_modality).toContain('"words"');

    const profileRow = await db.getOptional<{
      recent_step_keys_json: string | null;
      results_json: string | null;
    }>(
      `SELECT recent_step_keys_json, results_json
       FROM cognitive_profile_projection
       WHERE user_id = ?`,
      [userId],
    );

    expect(profileRow?.recent_step_keys_json).toBe('["semantic:dual-track"]');
    const results = JSON.parse(profileRow?.results_json ?? '{}') as Record<
      string,
      { masteredLevel: number | null; progressToNext: number }
    >;
    expect(results['semantic:dual-track']).toMatchObject({
      masteredLevel: 2,
      progressToNext: 22,
    });
  });

  it('ignores malformed derived json payloads instead of patching summaries', async () => {
    const sessionId = 's-proj-malformed-derived';
    const db = new TestPowerSyncDb();
    db.insertEmptySummary(sessionId);
    const persistence = createPersistence(db);
    const projection = createSessionSummariesProjectionDefinition(persistence);

    const circular: Record<string, unknown> = {};
    circular['self'] = circular;

    const circularJourney: Record<string, unknown> = { stageId: 1 };
    circularJourney['hybridProgress'] = circularJourney;

    await projection.handle(
      [
        toProjectedEvent(
          'JOURNEY_TRANSITION_DECIDED',
          {
            id: `${sessionId}:ctx`,
            schemaVersion: 1,
            sessionId,
            timestamp: Date.now(),
            ...circularJourney,
          },
          50n,
        ),
        toProjectedEvent(
          'XP_BREAKDOWN_COMPUTED',
          {
            id: `${sessionId}:xp`,
            schemaVersion: 1,
            sessionId,
            timestamp: Date.now(),
            xpBreakdown: circular,
          },
          51n,
        ),
      ],
      db as any,
    );

    const row = await db.getOptional<{
      journey_context: string | null;
      xp_breakdown: string | null;
    }>(`SELECT journey_context, xp_breakdown FROM session_summaries WHERE session_id = ?`, [
      sessionId,
    ]);
    expect(row).toEqual({
      journey_context: null,
      xp_breakdown: null,
    });
  });

  it('survives emt_messages fallback read failures and skips invalid finalization cleanly', async () => {
    const sessionId = 's-proj-fallback-error';
    class FailingFallbackDb extends TestPowerSyncDb {
      override async getAll<T extends object>(
        sql: string,
        parameters?: readonly unknown[],
      ): Promise<T[]> {
        if (sql.includes('FROM emt_messages')) {
          throw new Error('boom');
        }
        return super.getAll(sql, parameters);
      }
    }

    const db = new FailingFallbackDb();
    const persistence = createPersistence(db);
    const projection = createSessionSummariesProjectionDefinition(persistence);

    db.insertInProgressRow({
      id: `${sessionId}:11`,
      sessionId,
      eventType: 'TRIAL_PRESENTED',
      eventData: '{}',
      globalPosition: '11',
      createdAt: 11000,
    });

    await projection.handle(
      [toProjectedEvent('SESSION_ENDED', makeTempoEnd(sessionId), 12n)],
      db as any,
    );

    expect(db.countSessionSummaries(sessionId)).toBe(0);
    expect(db.countInProgressEvents(sessionId)).toBe(0);
  });

  it('loads and sorts in-progress rows using stored positions and tolerates invalid JSON payloads', async () => {
    const sessionId = 's-proj-inprogress-sort';
    const db = new TestPowerSyncDb();
    const persistence = createPersistence(db);
    const projection = createSessionSummariesProjectionDefinition(persistence);

    db.insertInProgressRow({
      id: `${sessionId}:20`,
      sessionId,
      eventType: 'TRIAL_PRESENTED',
      eventData: '{bad-json',
      globalPosition: '20',
      createdAt: 20_000,
    });
    db.insertInProgressRow({
      id: `${sessionId}:10`,
      sessionId,
      eventType: 'SESSION_STARTED',
      eventData: JSON.stringify(makeTempoStart(sessionId)),
      globalPosition: '10',
      createdAt: 10_000,
    });

    await projection.handle(
      [toProjectedEvent('SESSION_ENDED', makeTempoEnd(sessionId), 21n)],
      db as any,
    );

    expect(db.countSessionSummaries(sessionId)).toBe(1);
  });

  it('swallows cleanup errors on abandoned sessions as best-effort cleanup', async () => {
    const sessionId = 's-proj-abandoned-best-effort';
    const db = new TestPowerSyncDb();
    const persistence = createPersistence(db, {
      deleteSession: mock(async () => {
        throw new Error('cleanup failed');
      }),
      queueDeletion: mock(async () => {}),
    });
    const projection = createSessionSummariesProjectionDefinition(persistence);

    await projection.handle(
      [
        toProjectedEvent('SESSION_STARTED', makeTempoStart(sessionId), 10n),
        toProjectedEvent('SESSION_ENDED', makeTempoEnd(sessionId, { reason: 'abandoned' }), 11n),
      ],
      db as any,
    );

    expect(db.countSessionSummaries(sessionId)).toBe(0);
  });

  it('uses direct batched writes when writeTransaction is unavailable on the db', async () => {
    const sessionId = 's-proj-no-tx-db';
    const db = new TestPowerSyncDb();
    const persistence = createPersistence(db);
    const projection = createSessionSummariesProjectionDefinition(persistence);
    const dbWithoutWriteTransaction = {
      execute: db.execute.bind(db),
      getAll: db.getAll.bind(db),
      getOptional: db.getOptional.bind(db),
    };

    await projection.handle(
      [
        toProjectedEvent('SESSION_STARTED', makeTempoStart(sessionId), 10n),
        toProjectedEvent(
          'JOURNEY_TRANSITION_DECIDED',
          {
            id: `${sessionId}:transition`,
            sessionId,
            timestamp: Date.now(),
            schemaVersion: 1,
            journeyId: 'journey-1',
            journeyStartLevel: 2,
            journeyTargetLevel: 5,
            stageId: 1,
            stageMode: 'simulator',
            nLevel: 2,
            journeyName: 'Hybrid',
            upsThreshold: 50,
            isValidating: false,
            validatingSessions: 0,
            sessionsRequired: 1,
            stageCompleted: false,
            nextStageUnlocked: null,
          },
          11n,
        ),
      ],
      dbWithoutWriteTransaction as any,
    );

    expect(db.countInProgressEvents(sessionId)).toBe(2);
  });

  it('truncate clears in-progress rows and stats projections', async () => {
    const db = new TestPowerSyncDb();
    const persistence = createPersistence(db);
    const projection = createSessionSummariesProjectionDefinition(persistence);

    db.insertInProgressRow({
      id: 'cleanup:1',
      sessionId: 'cleanup-session',
      eventType: 'SESSION_STARTED',
      eventData: JSON.stringify(makeTempoStart('cleanup-session')),
      globalPosition: '1',
      createdAt: 1000,
    });
    await db.execute(
      `INSERT INTO user_stats_projection (id, user_id, sessions_count, total_duration_ms, active_days, max_n_level, last_n_level, last_created_at, ups_sum, ups_trial_count, total_hits, total_misses, total_fa, total_cr, abandoned_sessions, total_trials, total_xp, first_session_at, early_morning_sessions, late_night_sessions)
       VALUES ('local','local',1,1,1,1,1,'2026-01-01',1,1,1,1,1,1,0,1,0,'2026-01-01',0,0)`,
    );
    await db.execute(
      `INSERT INTO user_modality_stats_projection (id, user_id, modality, hits_sum, misses_sum, fa_sum, cr_sum, rt_sum, rt_count)
       VALUES ('local:position','local','position',1,1,1,1,1,1)`,
    );
    await db.execute(
      `INSERT INTO projection_effects (id, projection_id, effect_key, applied_at)
       VALUES ('user-stats-v1:test','user-stats-v1','test','2026-01-01')`,
    );

    await projection.truncate?.(db as any);

    expect(db.countInProgressEvents('cleanup-session')).toBe(0);
    expect(db.getUserStatsRow('local')).toBeNull();
    const modalityRow = await db.getOptional<{ id: string }>(
      `SELECT id FROM user_modality_stats_projection WHERE id = ?`,
      ['local:position'],
    );
    expect(modalityRow).toBeNull();
  });

  it('dispatches all mode-specific *_SESSION_ENDED branches without crashing', async () => {
    const db = new TestPowerSyncDb();
    const persistence = createPersistence(db);
    const projection = createSessionSummariesProjectionDefinition(persistence);

    const modeCases = [
      createMockEvent('RECALL_SESSION_ENDED', {
        sessionId: 'mode-recall',
        totalTrials: 1,
        reason: 'completed',
      }),
      createMockEvent('FLOW_SESSION_ENDED', {
        sessionId: 'mode-flow',
        totalTrials: 1,
        reason: 'completed',
      }),
      createMockEvent('DUAL_PICK_SESSION_ENDED', {
        sessionId: 'mode-pick',
        totalTrials: 1,
        reason: 'completed',
      }),
      createMockEvent('TRACE_SESSION_ENDED', {
        sessionId: 'mode-trace',
        totalTrials: 1,
        trialsCompleted: 1,
        score: 80,
        durationMs: 1000,
        reason: 'completed',
      }),
      createMockEvent('TIME_SESSION_ENDED', {
        sessionId: 'mode-time',
        totalTrials: 1,
        trialsCompleted: 1,
        score: 80,
        durationMs: 1000,
        reason: 'completed',
      }),
      createMockEvent('MOT_SESSION_ENDED', {
        sessionId: 'mode-mot',
        totalTrials: 1,
        correctTrials: 1,
        accuracy: 1,
        score: 100,
        durationMs: 1000,
        reason: 'completed',
      }),
      createMockEvent('CORSI_SESSION_ENDED', {
        sessionId: 'mode-corsi',
        eventId: 'mode-corsi:e',
        seq: 1,
        occurredAtMs: 1,
        monotonicMs: 1,
        totalTrials: 1,
        correctTrials: 1,
        maxSpan: 2,
        score: 100,
        durationMs: 1000,
        reason: 'completed',
      }),
      createMockEvent('OSPAN_SESSION_ENDED', {
        sessionId: 'mode-ospan',
        eventId: 'mode-ospan:e',
        seq: 1,
        occurredAtMs: 1,
        monotonicMs: 1,
        totalSets: 1,
        correctSets: 1,
        maxSpan: 2,
        recallAccuracy: 100,
        processingAccuracy: 100,
        score: 100,
        durationMs: 1000,
        reason: 'completed',
      }),
      createMockEvent('RUNNING_SPAN_SESSION_ENDED', {
        sessionId: 'mode-running',
        eventId: 'mode-running:e',
        seq: 1,
        occurredAtMs: 1,
        monotonicMs: 1,
        totalTrials: 1,
        correctTrials: 1,
        maxSpan: 2,
        accuracy: 100,
        score: 100,
        durationMs: 1000,
        reason: 'completed',
      }),
      createMockEvent('PASAT_SESSION_ENDED', {
        sessionId: 'mode-pasat',
        eventId: 'mode-pasat:e',
        seq: 1,
        occurredAtMs: 1,
        monotonicMs: 1,
        totalTrials: 1,
        correctTrials: 1,
        accuracy: 100,
        fastestIsiMs: 500,
        avgResponseTimeMs: 400,
        score: 100,
        durationMs: 1000,
        reason: 'completed',
      }),
      createMockEvent('SWM_SESSION_ENDED', {
        sessionId: 'mode-swm',
        eventId: 'mode-swm:e',
        seq: 1,
        occurredAtMs: 1,
        monotonicMs: 1,
        totalRounds: 1,
        correctRounds: 1,
        accuracy: 100,
        maxSpanReached: 2,
        totalWithinErrors: 0,
        totalBetweenErrors: 0,
        totalErrors: 0,
        score: 100,
        durationMs: 1000,
        reason: 'completed',
      }),
    ];

    await projection.handle(
      modeCases.map((event, index) =>
        toProjectedEvent(
          event.type as string,
          event as unknown as Record<string, unknown>,
          BigInt(200 + index),
        ),
      ),
      db as any,
    );

    expect(true).toBe(true);
  });
});
