import { describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import type { AbstractPowerSyncDatabase } from '@powersync/web';
import { resultKey } from '@neurodual/logic';
import { SQLITE_SCHEMA } from '../db/sqlite-schema';
import { createCommandBus } from '../es-emmett/command-bus';
import { toProjectedEvent } from './projection-processor';
import {
  applyProfileSessionDirectly,
  cognitiveProfileProjectionDefinition,
  rebuildCalibrationProfile,
} from './cognitive-profile-projection';

class TestPowerSyncDb implements AbstractPowerSyncDatabase {
  private readonly inner = new Database(':memory:');

  constructor() {
    this.inner.exec(SQLITE_SCHEMA);
  }

  async execute(
    sql: string,
    parameters?: readonly unknown[],
  ): Promise<{ rows: { _array: Record<string, unknown>[] }; rowsAffected: number }> {
    const normalized = sql.trim().toUpperCase();
    if (normalized.startsWith('SELECT') || normalized.startsWith('WITH')) {
      const rows = this.inner.query(sql).all(...((parameters ?? []) as object[])) as Record<
        string,
        unknown
      >[];
      return { rows: { _array: rows }, rowsAffected: 0 };
    }

    const result = this.inner.query(sql).run(...((parameters ?? []) as object[]));
    return { rows: { _array: [] }, rowsAffected: result.changes };
  }

  async getAll<T extends object>(sql: string, parameters?: readonly unknown[]): Promise<T[]> {
    return this.inner.query(sql).all(...((parameters ?? []) as object[])) as T[];
  }

  async getOptional<T extends object>(
    sql: string,
    parameters?: readonly unknown[],
  ): Promise<T | null> {
    const rows = this.inner.query(sql).all(...((parameters ?? []) as object[])) as T[];
    return rows[0] ?? null;
  }

  async writeTransaction<T>(
    callback: (tx: { execute: typeof this.execute }) => Promise<T>,
  ): Promise<T> {
    return callback({ execute: this.execute.bind(this) });
  }

  insertEmmettRow(input: {
    id: string;
    streamId: string;
    streamPosition: string;
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
          input.streamPosition,
          input.messageData,
          input.messageType,
          input.id,
          input.globalPosition,
          input.created,
        ] as object[]),
      );
  }
}

function makeProjectedEvent(
  type: string,
  data: Record<string, unknown>,
  globalPosition: bigint,
  createdAt = new Date(Number(globalPosition)),
) {
  return { type, data, globalPosition, createdAt };
}

function insertProjectedEvents(
  db: TestPowerSyncDb,
  sessionId: string,
  events: readonly ReturnType<typeof makeProjectedEvent>[],
): void {
  const streamId = `session:${sessionId}`;
  for (let index = 0; index < events.length; index++) {
    const event = events[index];
    db.insertEmmettRow({
      id: `${sessionId}:${event.type}:${index}`,
      streamId,
      streamPosition: String(index),
      messageType: event.type,
      messageData: JSON.stringify({ data: event.data }),
      globalPosition: event.globalPosition.toString(),
      created: event.createdAt.toISOString(),
    });
  }
}

function makeImportedCalibrationEvent(
  sessionId: string,
  options: {
    userId: string;
    playContext: 'calibration' | 'profile';
    timestamp: number;
    gameMode: 'dualnback-classic' | 'dual-track';
    nLevel?: number;
    accuracy?: number;
    dPrime?: number;
    byModality: Record<string, Record<string, number>>;
  },
) {
  const byModality = Object.fromEntries(
    Object.entries(options.byModality).map(([modality, stats]) => [
      modality,
      {
        hits: stats.hits ?? 0,
        misses: stats.misses ?? 0,
        falseAlarms: stats.falseAlarms ?? 0,
        correctRejections: stats.correctRejections ?? 0,
        avgRT: stats.avgRT ?? 400,
        dPrime: stats.dPrime ?? 0,
      },
    ]),
  );

  return makeProjectedEvent(
    'SESSION_IMPORTED',
    {
      id: `${sessionId}:imported`,
      type: 'SESSION_IMPORTED',
      sessionId,
      userId: options.userId,
      timestamp: options.timestamp,
      originalCreatedAt: new Date(options.timestamp).toISOString(),
      nLevel: options.nLevel ?? 2,
      durationMs: 2_000,
      trialsCount: 20,
      generator: 'BrainWorkshop',
      gameMode: options.gameMode,
      playContext: options.playContext,
      dPrime: options.dPrime ?? 0,
      accuracy: options.accuracy ?? 0,
      activeModalities: Object.keys(byModality),
      byModality,
      passed: true,
      reason: 'completed',
    },
    BigInt(options.timestamp),
    new Date(options.timestamp),
  );
}

describe('cognitive-profile-projection', () => {
  it('applies baseline and session events incrementally via handle()', async () => {
    const db = new TestPowerSyncDb();
    const bus = createCommandBus(db);
    const userId = 'user-1';

    // Step 1: Apply baseline via incremental handle
    const baselineResult = await bus.handle({
      type: 'CALIBRATION/SET_BASELINE',
      data: {
        userId,
        event: {
          id: 'baseline-evt-1',
          type: 'CALIBRATION_BASELINE_SET',
          timestamp: Date.UTC(2026, 2, 19, 10, 0, 0),
          userId,
          level: 2,
        },
      },
      metadata: {
        commandId: 'cmd-baseline-1',
        timestamp: new Date('2026-03-19T10:00:00.000Z'),
        userId,
      },
    });

    await cognitiveProfileProjectionDefinition.handle(
      baselineResult.events.map(toProjectedEvent),
      db,
    );

    const initialRow = await db.getOptional<{
      phase: string;
      results_json: string;
      recent_step_keys_json: string;
      baseline_level: number | null;
      modality_sources_json: string;
      next_recommended_session_json: string | null;
    }>(
      `SELECT phase, results_json, recent_step_keys_json, baseline_level,
              modality_sources_json, next_recommended_session_json
       FROM cognitive_profile_projection
       WHERE user_id = ?`,
      [userId],
    );

    expect(initialRow?.phase).toBe('complete');
    expect(initialRow?.recent_step_keys_json).toBe('[]');
    expect(initialRow?.baseline_level).toBe(2);
    expect(initialRow?.next_recommended_session_json).not.toBeNull();

    // Step 2: Apply a calibration session incrementally (no corruption)
    const importedEvent = makeImportedCalibrationEvent('session-1', {
      userId,
      playContext: 'calibration',
      timestamp: Date.UTC(2026, 2, 19, 10, 5, 0),
      gameMode: 'dual-track',
      accuracy: 1,
      byModality: {
        position: {
          hits: 10,
          misses: 0,
          falseAlarms: 0,
          correctRejections: 10,
          dPrime: 0,
        },
      },
    });
    insertProjectedEvents(db, 'session-1', [importedEvent]);

    await cognitiveProfileProjectionDefinition.handle([importedEvent], db);

    const updatedRow = await db.getOptional<{
      phase: string;
      results_json: string;
      recent_step_keys_json: string;
      baseline_level: number | null;
      modality_sources_json: string;
      next_recommended_session_json: string | null;
    }>(
      `SELECT phase, results_json, recent_step_keys_json, baseline_level,
              modality_sources_json, next_recommended_session_json
       FROM cognitive_profile_projection
       WHERE user_id = ?`,
      [userId],
    );

    expect(updatedRow?.phase).toBe('complete');
    expect(updatedRow?.recent_step_keys_json).toBe('["position:dual-track"]');
    expect(updatedRow?.baseline_level).toBe(2);

    const results = JSON.parse(updatedRow?.results_json ?? '{}') as Record<
      string,
      { masteredLevel: number | null; progressToNext: number }
    >;
    const modalitySources = JSON.parse(updatedRow?.modality_sources_json ?? '{}') as Record<
      string,
      { source: string; baselineLevel: number | null }
    >;
    const key = resultKey('position', 'dual-track');
    expect(results[key]?.masteredLevel).toBe(2);
    expect(results[key]?.progressToNext).toBe(22);
    expect(modalitySources[key]).toEqual({ source: 'session', baselineLevel: 2 });
    expect(updatedRow?.next_recommended_session_json).not.toBeNull();
  });

  it('applies a profile session directly for immediate UI refresh', async () => {
    const db = new TestPowerSyncDb();
    const timestamp = Date.UTC(2026, 2, 19, 10, 0, 0);
    const sessionId = 'profile-session-1';
    const userId = 'user-1';

    const applied = await applyProfileSessionDirectly(db, {
      sessionId,
      sessionEvents: [
        {
          id: `${sessionId}:imported`,
          type: 'SESSION_IMPORTED',
          sessionId,
          userId,
          timestamp,
          originalCreatedAt: new Date(timestamp).toISOString(),
          nLevel: 3,
          durationMs: 2_000,
          trialsCount: 20,
          generator: 'BrainWorkshop',
          gameMode: 'dualnback-classic',
          playContext: 'profile',
          dPrime: 1.7,
          accuracy: 0.82,
          activeModalities: ['position'],
          byModality: {
            position: {
              hits: 15,
              misses: 5,
              falseAlarms: 2,
              correctRejections: 8,
              avgRT: 420,
              dPrime: 1.7,
            },
          },
          passed: true,
          reason: 'completed',
        } as unknown as GameEvent,
      ],
      fallbackUserId: userId,
    });

    expect(applied).toBe(true);

    const row = await db.getOptional<{
      results_json: string;
      recent_step_keys_json: string;
      updated_at: string | null;
    }>(
      `SELECT results_json, recent_step_keys_json, updated_at
       FROM cognitive_profile_projection
       WHERE user_id = ?`,
      [userId],
    );

    expect(row).not.toBeNull();
    expect(row?.updated_at).not.toBeNull();

    const results = JSON.parse(row?.results_json ?? '{}') as Record<
      string,
      { masteredLevel?: number | null }
    >;
    expect(results[resultKey('position', 'nback')]?.masteredLevel).toBeNull();
    expect(row?.recent_step_keys_json).toContain(resultKey('position', 'nback'));
  });

  it('recovers from corrupted state via rebuildCalibrationProfile()', async () => {
    const db = new TestPowerSyncDb();
    const bus = createCommandBus(db);
    const userId = 'user-corrupt-1';

    // Setup: baseline + session via command bus (events in emt_messages)
    await bus.handle({
      type: 'CALIBRATION/SET_BASELINE',
      data: {
        userId,
        event: {
          id: 'baseline-corrupt-1',
          type: 'CALIBRATION_BASELINE_SET',
          timestamp: Date.UTC(2026, 2, 19, 10, 0, 0),
          userId,
          level: 2,
        },
      },
      metadata: {
        commandId: 'cmd-baseline-corrupt-1',
        timestamp: new Date('2026-03-19T10:00:00.000Z'),
        userId,
      },
    });
    insertProjectedEvents(db, 'session-corrupt-1', [
      makeImportedCalibrationEvent('session-corrupt-1', {
        userId,
        playContext: 'calibration',
        timestamp: Date.UTC(2026, 2, 19, 10, 5, 0),
        gameMode: 'dual-track',
        accuracy: 1,
        byModality: {
          position: {
            hits: 10,
            misses: 0,
            falseAlarms: 0,
            correctRejections: 10,
            dPrime: 0,
          },
        },
      }),
    ]);

    // Corrupt the projection
    await db.execute(
      `INSERT INTO cognitive_profile_projection
         (id, user_id, phase, current_step_index, results_json, recent_step_keys_json,
          baseline_level, modality_sources_json, updated_at)
       VALUES (?, ?, 'running', 0, '{"corrupted":true}', '["fake:step"]', NULL,
               '{"fake:step":{"source":"session","baselineLevel":5}}', datetime('now'))`,
      [userId, userId],
    );

    // Full rebuild recovers from corruption
    const state = await rebuildCalibrationProfile(db, userId);

    expect(state.phase).toBe('complete');
    const key = resultKey('position', 'dual-track');
    expect(state.results[key]?.masteredLevel).toBe(2);

    const row = await db.getOptional<{
      results_json: string;
      baseline_level: number | null;
    }>(`SELECT results_json, baseline_level FROM cognitive_profile_projection WHERE user_id = ?`, [
      userId,
    ]);
    const rebuiltResults = JSON.parse(row?.results_json ?? '{}') as Record<string, unknown>;
    expect(rebuiltResults['corrupted']).toBeUndefined();
    expect(row?.baseline_level).toBe(2);
  });

  it('maps spatial calibration sessions to the spatial modality', async () => {
    const db = new TestPowerSyncDb();
    const userId = 'user-2';
    insertProjectedEvents(db, 'session-spatial-1', [
      makeImportedCalibrationEvent('session-spatial-1', {
        userId,
        playContext: 'calibration',
        timestamp: Date.UTC(2026, 2, 19, 10, 5, 0),
        gameMode: 'dual-track',
        accuracy: 0.9,
        byModality: {
          spatial: {
            hits: 9,
            misses: 1,
            falseAlarms: 0,
            correctRejections: 10,
            dPrime: 0,
          },
        },
      }),
    ]);

    const state = await rebuildCalibrationProfile(db, userId);

    expect(state.results[resultKey('spatial', 'dual-track')]?.currentLevel).toBe(3);
  });

  it('uses profile sessions as post-baseline progression facts', async () => {
    const db = new TestPowerSyncDb();
    const bus = createCommandBus(db);
    const userId = 'user-profile-1';

    const baselineResult = await bus.handle({
      type: 'CALIBRATION/SET_BASELINE',
      data: {
        userId,
        event: {
          id: 'baseline-profile-evt-1',
          type: 'CALIBRATION_BASELINE_SET',
          timestamp: Date.UTC(2026, 2, 19, 10, 0, 0),
          userId,
          level: 2,
        },
      },
      metadata: {
        commandId: 'cmd-baseline-profile-1',
        timestamp: new Date('2026-03-19T10:00:00.000Z'),
        userId,
      },
    });

    await cognitiveProfileProjectionDefinition.handle(
      baselineResult.events.map(toProjectedEvent),
      db,
    );
    insertProjectedEvents(db, 'session-profile-1', [
      makeImportedCalibrationEvent('session-profile-1', {
        userId,
        playContext: 'profile',
        timestamp: Date.UTC(2026, 2, 19, 10, 5, 0),
        gameMode: 'dual-track',
        accuracy: 1,
        byModality: {
          position: {
            hits: 10,
            misses: 0,
            falseAlarms: 0,
            correctRejections: 10,
            dPrime: 0,
          },
        },
      }),
    ]);

    const state = await rebuildCalibrationProfile(db, userId);

    expect(state.phase).toBe('complete');
    expect(state.results[resultKey('position', 'dual-track')]?.masteredLevel).toBe(2);

    const row = await db.getOptional<{
      recent_step_keys_json: string | null;
      baseline_level: number | null;
      modality_sources_json: string | null;
    }>(
      `SELECT recent_step_keys_json, baseline_level, modality_sources_json
       FROM cognitive_profile_projection
       WHERE user_id = ?`,
      [userId],
    );
    expect(row?.recent_step_keys_json).toBe('["position:dual-track"]');
    expect(row?.baseline_level).toBe(2);
    expect(
      JSON.parse(row?.modality_sources_json ?? '{}')[resultKey('position', 'dual-track')],
    ).toEqual({
      source: 'session',
      baselineLevel: 2,
    });
  });

  it('prefers by_modality over ambiguous active_modalities_csv for n-back calibration sessions', async () => {
    const db = new TestPowerSyncDb();
    const userId = 'user-ambiguous';
    insertProjectedEvents(db, 'session-ambiguous-1', [
      makeImportedCalibrationEvent('session-ambiguous-1', {
        userId,
        playContext: 'calibration',
        timestamp: Date.UTC(2026, 2, 19, 10, 5, 0),
        gameMode: 'dualnback-classic',
        accuracy: 0.9,
        dPrime: 1.1,
        byModality: {
          position: {
            hits: 10,
            misses: 0,
            falseAlarms: 0,
            correctRejections: 10,
            dPrime: 3.2,
          },
        },
      }),
    ]);

    const state = await rebuildCalibrationProfile(db, userId);

    expect(state.results[resultKey('position', 'nback')]?.currentLevel).toBe(3);
    expect(state.results[resultKey('letters', 'nback')]).toBeUndefined();
  });

  it('rebuilds an empty profile after a calibration reset event', async () => {
    const db = new TestPowerSyncDb();
    const bus = createCommandBus(db);
    const userId = 'user-3';
    insertProjectedEvents(db, 'session-reset-1', [
      makeImportedCalibrationEvent('session-reset-1', {
        userId,
        playContext: 'calibration',
        timestamp: Date.UTC(2026, 2, 19, 10, 0, 0),
        gameMode: 'dual-track',
        accuracy: 1,
        byModality: {
          position: {
            hits: 10,
            misses: 0,
            falseAlarms: 0,
            correctRejections: 10,
            dPrime: 0,
          },
        },
      }),
    ]);

    await bus.handle({
      type: 'CALIBRATION/RESET',
      data: {
        userId,
        event: {
          id: 'reset-evt-1',
          type: 'CALIBRATION_RESET',
          timestamp: Date.UTC(2026, 2, 19, 10, 5, 0),
          userId,
        },
      },
      metadata: {
        commandId: 'cmd-reset-1',
        timestamp: new Date('2026-03-19T10:05:00.000Z'),
        userId,
      },
    });

    await cognitiveProfileProjectionDefinition.handle(
      [
        toProjectedEvent({
          id: 'reset-evt-1',
          stream_id: `cognitive-profile:${userId}`,
          stream_position: '1',
          global_position: '1',
          type: 'CALIBRATION_RESET',
          data: {
            id: 'reset-evt-1',
            type: 'CALIBRATION_RESET',
            timestamp: Date.UTC(2026, 2, 19, 10, 5, 0),
            userId,
          },
          metadata: {},
          created: '2026-03-19T10:05:00.000Z',
        }),
      ],
      db,
    );

    const row = await db.getOptional<{
      phase: string;
      results_json: string;
      recent_step_keys_json: string;
      baseline_level: number | null;
      modality_sources_json: string;
      next_recommended_session_json: string | null;
      global_score: number;
    }>(
      `SELECT phase, results_json, recent_step_keys_json, baseline_level,
              modality_sources_json, next_recommended_session_json, global_score
       FROM cognitive_profile_projection
       WHERE user_id = ?`,
      [userId],
    );

    expect(row?.phase).toBe('idle');
    expect(row?.results_json).toBe('{}');
    expect(row?.recent_step_keys_json).toBe('[]');
    expect(row?.baseline_level).toBeNull();
    expect(
      Object.values(
        JSON.parse(row?.modality_sources_json ?? '{}') as Record<
          string,
          { source: string; baselineLevel: number | null }
        >,
      ).every((entry) => entry.source === 'none' && entry.baselineLevel === null),
    ).toBe(true);
    expect(row?.next_recommended_session_json).not.toBeNull();
    expect(row?.global_score).toBe(0);
  });
});
