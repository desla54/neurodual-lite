import { afterEach, describe, expect, it, mock } from 'bun:test';
import { Database } from 'bun:sqlite';
import * as actualLogic from '@neurodual/logic';

import { SQLITE_SCHEMA } from '../db/sqlite-schema';

let validationMode:
  | 'passthrough'
  | 'throw'
  | 'abandoned'
  | 'cognitive-fallback'
  | 'finalize-throw' = 'passthrough';
let fakeNow = 0;

mock.module('@neurodual/logic', () => {
  return {
    ...actualLogic,
    migrateAndValidateEventBatch: (...args: unknown[]) => {
      if (validationMode === 'passthrough') {
        return actualLogic.migrateAndValidateEventBatch(
          ...(args as Parameters<typeof actualLogic.migrateAndValidateEventBatch>),
        );
      }
      if (validationMode === 'throw') {
        throw new Error('forced validation failure');
      }
      if (validationMode === 'abandoned') {
        return {
          events: [{ type: 'SESSION_ENDED', reason: 'abandoned' }],
          errorCount: 0,
        };
      }
      if (validationMode === 'finalize-throw') {
        return {
          events: [
            {
              type: 'SESSION_STARTED',
              sessionId: 'edge-finalize-throw',
              playContext: 'free',
              userId: 'local',
              nLevel: 2,
              device: {
                platform: 'web',
                screenWidth: 1,
                screenHeight: 1,
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
                activeModalities: ['position'],
                trialsCount: 1,
                targetProbability: 0.3,
                lureProbability: 0,
                intervalSeconds: 3,
                stimulusDurationSeconds: 0.5,
                generator: 'BrainWorkshop',
              },
            },
            {
              type: 'SESSION_ENDED',
              sessionId: 'edge-finalize-throw',
              reason: 'completed',
              playContext: 'free',
            },
          ],
          errorCount: 0,
        };
      }
      return {
        events: [
          {
            type: 'COGNITIVE_TASK_SESSION_STARTED',
            sessionId: 'edge-cog',
            taskType: 'stroop',
            playContext: 'journey',
            config: {},
          },
          {
            type: 'COGNITIVE_TASK_SESSION_ENDED',
            sessionId: 'edge-cog',
            taskType: 'stroop',
            reason: 'completed',
            totalTrials: 10,
            correctTrials: 5,
            accuracy: 0.5,
            durationMs: 5000,
            metrics: {},
          },
        ],
        errorCount: 0,
      };
    },
    projectTempoSessionToSummaryInput: (...args: unknown[]) => {
      if (validationMode === 'finalize-throw') {
        throw new Error('forced projector failure');
      }
      return actualLogic.projectTempoSessionToSummaryInput(
        ...(args as Parameters<typeof actualLogic.projectTempoSessionToSummaryInput>),
      );
    },
  };
});

mock.module('../utils/yield-to-main', () => ({
  nowMs: () => {
    fakeNow += 10;
    return fakeNow;
  },
  yieldIfOverBudget: async () => {},
  yieldToMain: async () => {},
}));

const { createSessionSummariesProjectionDefinition } = await import(
  './session-summaries-projection'
);
validationMode = 'passthrough';

class EdgeDb {
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

  insertInProgressRow(sessionId: string): void {
    this.inner
      .query(
        `INSERT INTO session_in_progress_events (id, session_id, event_type, event_data, global_position, created_at)
         VALUES (?, ?, 'SESSION_STARTED', '{}', '10', 1000)`,
      )
      .run(...([`${sessionId}:10`, sessionId] as any));
  }

  countSummaries(sessionId: string): number {
    const row = this.inner
      .query(`SELECT COUNT(*) as count FROM session_summaries WHERE session_id = ?`)
      .get(sessionId) as { count: number } | null;
    return row?.count ?? 0;
  }
}

describe('session-summaries-projection (edge paths via mocked validator)', () => {
  afterEach(() => {
    validationMode = 'passthrough';
    fakeNow = 0;
  });

  it('swallows validator exceptions and skips finalization', async () => {
    validationMode = 'throw';
    const db = new EdgeDb();
    db.insertInProgressRow('edge-throw');
    const persistence = {
      writeTransaction: db.writeTransaction.bind(db),
      deleteSession: mock(async () => 1),
      queueDeletion: mock(async () => {}),
    } as never;
    const projection = createSessionSummariesProjectionDefinition(persistence);

    await projection.handle(
      [
        {
          type: 'SESSION_ENDED',
          data: { sessionId: 'edge-throw', reason: 'completed', playContext: 'free' },
          globalPosition: 11n,
          createdAt: new Date(),
        },
      ],
      db as any,
    );

    expect(db.countSummaries('edge-throw')).toBe(0);
  });

  it('swallows cleanup errors in the post-validation abandoned path', async () => {
    validationMode = 'abandoned';
    const db = new EdgeDb();
    db.insertInProgressRow('edge-abandoned');
    const persistence = {
      writeTransaction: db.writeTransaction.bind(db),
      deleteSession: mock(async () => {
        throw new Error('cleanup failed');
      }),
      queueDeletion: mock(async () => {}),
    } as never;
    const projection = createSessionSummariesProjectionDefinition(persistence);

    await projection.handle(
      [
        {
          type: 'SESSION_ENDED',
          data: { sessionId: 'edge-abandoned', reason: 'completed', playContext: 'free' },
          globalPosition: 11n,
          createdAt: new Date(),
        },
      ],
      db as any,
    );

    expect(db.countSummaries('edge-abandoned')).toBe(0);
  });

  it('falls back to the start-event playContext in cognitive-task summaries', async () => {
    validationMode = 'cognitive-fallback';
    fakeNow = 0;
    const db = new EdgeDb();
    db.insertInProgressRow('edge-cog');
    const persistence = {
      writeTransaction: db.writeTransaction.bind(db),
      deleteSession: mock(async () => 1),
      queueDeletion: mock(async () => {}),
    } as never;
    const projection = createSessionSummariesProjectionDefinition(persistence);

    await projection.handle(
      [
        {
          type: 'COGNITIVE_TASK_SESSION_ENDED',
          data: { sessionId: 'edge-cog', reason: 'completed', playContext: 'free' },
          globalPosition: 11n,
          createdAt: new Date(),
        },
      ],
      db as any,
    );

    const row = await db.getOptional<{ play_context: string | null; n_level: number | null }>(
      `SELECT play_context, n_level FROM session_summaries WHERE session_id = ?`,
      ['edge-cog'],
    );
    expect(row).toEqual({ play_context: 'journey', n_level: 1 });
  });

  it('swallows projector exceptions in the outer finalization catch', async () => {
    validationMode = 'finalize-throw';
    fakeNow = 0;
    const db = new EdgeDb();
    db.insertInProgressRow('edge-finalize-throw');
    const persistence = {
      writeTransaction: db.writeTransaction.bind(db),
      deleteSession: mock(async () => 1),
      queueDeletion: mock(async () => {}),
    } as never;
    const projection = createSessionSummariesProjectionDefinition(persistence);

    await projection.handle(
      [
        {
          type: 'SESSION_ENDED',
          data: { sessionId: 'edge-finalize-throw', reason: 'completed', playContext: 'free' },
          globalPosition: 11n,
          createdAt: new Date(),
        },
      ],
      db as any,
    );

    expect(db.countSummaries('edge-finalize-throw')).toBe(0);
  });
});
