import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';

import type { SQLQueryPort, StatsFilters } from '@neurodual/logic';
import { SQLITE_SCHEMA } from '../db/sqlite-schema';
import { createStatsAdapter } from './stats-adapter';

class TestSqlitePersistence implements SQLQueryPort {
  readonly db: Database;
  private globalPosition = 0n;
  private streamPositions = new Map<string, bigint>();

  constructor() {
    this.db = new Database(':memory:');
    this.db.exec(SQLITE_SCHEMA);
  }

  nextPositions(streamId: string): { streamPosition: bigint; globalPosition: bigint } {
    const nextStreamPosition = (this.streamPositions.get(streamId) ?? 0n) + 1n;
    this.streamPositions.set(streamId, nextStreamPosition);
    this.globalPosition += 1n;
    return { streamPosition: nextStreamPosition, globalPosition: this.globalPosition };
  }

  async query<T extends object>(sql: string, params?: unknown[]): Promise<{ rows: T[] }> {
    const stmt = this.db.prepare(sql);
    const rows = (params ? stmt.all(...(params as any[])) : stmt.all()) as T[];
    return { rows };
  }

  async execute(sql: string, params?: unknown[]): Promise<void> {
    if (!params || params.length === 0) {
      this.db.exec(sql);
      return;
    }
    const stmt = this.db.prepare(sql);
    stmt.run(...(params as any[]));
  }

  async writeTransaction(fn: any): Promise<any> {
    this.db.exec('BEGIN');
    try {
      const result = await fn({ execute: (sql: any, params: any) => this.execute(sql, params) });
      this.db.exec('COMMIT');
      return result;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  close(): void {
    this.db.close();
  }
}

function insertSessionSummary(
  p: TestSqlitePersistence,
  args: {
    sessionId: string;
    gameMode: string;
    timing?: {
      avgResponseTimeMs: number;
      medianResponseTimeMs: number;
      responsesDuringStimulus: number;
      responsesAfterStimulus: number;
    };
  },
): void {
  // Keep it minimal: only NOT NULL columns + columns used by filters.
  const nowIso = new Date('2026-02-19T12:00:00.000Z').toISOString();
  const timing = args.timing ?? null;
  p.db
    .prepare(
      `
      INSERT INTO session_summaries (
        id,
        session_id,
        user_id,
        session_type,
        created_at,
        n_level,
        duration_ms,
        trials_count,
        game_mode,
        reason,
        play_context,
        avg_response_time_ms,
        median_response_time_ms,
        responses_during_stimulus,
        responses_after_stimulus
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    )
    .run(
      args.sessionId,
      args.sessionId,
      'local',
      'tempo',
      nowIso,
      2,
      60_000,
      30,
      args.gameMode,
      'completed',
      'free',
      timing?.avgResponseTimeMs ?? null,
      timing?.medianResponseTimeMs ?? null,
      timing?.responsesDuringStimulus ?? null,
      timing?.responsesAfterStimulus ?? null,
    );
}

function insertEventLocal(
  p: TestSqlitePersistence,
  args: { sessionId: string; type: string; payload: Record<string, unknown> },
): void {
  const streamId = `session:${args.sessionId}`;
  const { streamPosition, globalPosition } = p.nextPositions(streamId);

  const envelope = {
    id: crypto.randomUUID(),
    type: args.type,
    data: args.payload,
  };
  p.db
    .prepare(
      `
      INSERT INTO emt_messages (
        id,
        stream_id,
        stream_position,
        partition,
        message_kind,
        message_data,
        message_metadata,
        message_schema_version,
        message_type,
        message_id,
        is_archived,
        global_position,
        created
      ) VALUES (?, ?, ?, ?, 'E', ?, ?, ?, ?, ?, 0, ?, ?)
    `,
    )
    .run(
      `${streamId}:${streamPosition.toString()}`,
      streamId,
      streamPosition.toString(),
      'global',
      JSON.stringify(envelope),
      '{}',
      '1',
      args.type,
      envelope.id,
      globalPosition.toString(),
      new Date().toISOString(),
    );
}

function baseFilters(overrides: Partial<StatsFilters> = {}): StatsFilters {
  return {
    mode: 'DualnbackClassic',
    journeyId: null,
    modalities: new Set(),
    startDate: null,
    endDate: null,
    nLevels: [],
    ...overrides,
  } as StatsFilters;
}

describe('stats-adapter (timing) inputMethod filtering', () => {
  let persistence: TestSqlitePersistence;

  beforeEach(() => {
    persistence = new TestSqlitePersistence();
  });

  afterEach(() => {
    persistence.close();
  });

  it('getModalityTimingStats: treats missing inputMethod as keyboard', async () => {
    const sessionId = 's1';
    insertSessionSummary(persistence, { sessionId, gameMode: 'dualnback-classic' });

    // missing inputMethod -> should be included for keyboard
    insertEventLocal(persistence, {
      sessionId,
      type: 'USER_RESPONDED',
      payload: { modality: 'position', reactionTimeMs: 500 },
    });
    // explicit keyboard
    insertEventLocal(persistence, {
      sessionId,
      type: 'USER_RESPONDED',
      payload: { modality: 'position', reactionTimeMs: 400, inputMethod: 'keyboard' },
    });
    // touch -> excluded under keyboard filter
    insertEventLocal(persistence, {
      sessionId,
      type: 'USER_RESPONDED',
      payload: { modality: 'position', reactionTimeMs: 600, inputMethod: 'touch' },
    });

    const adapter = createStatsAdapter(persistence as any);
    const rows = await adapter.getModalityTimingStats(baseFilters({ inputMethod: 'keyboard' }));

    expect(rows.length).toBe(1);
    expect(rows[0]?.modality).toBe('position');
    expect(rows[0]?.count).toBe(2);
    expect(Math.round(rows[0]?.avgResponseTimeMs ?? 0)).toBe(450);
    expect(Math.round(rows[0]?.medianResponseTimeMs ?? 0)).toBe(450);
  });

  it('getTimingStats: keyboard filter includes missing inputMethod; null phase is not counted as after', async () => {
    const sessionId = 's2';
    insertSessionSummary(persistence, { sessionId, gameMode: 'dualnback-classic' });

    // during
    insertEventLocal(persistence, {
      sessionId,
      type: 'USER_RESPONDED',
      payload: { modality: 'position', reactionTimeMs: 300, responsePhase: 'during_stimulus' },
    });
    // after, explicit keyboard
    insertEventLocal(persistence, {
      sessionId,
      type: 'USER_RESPONDED',
      payload: {
        modality: 'position',
        reactionTimeMs: 700,
        responsePhase: 'after_stimulus',
        inputMethod: 'keyboard',
      },
    });
    // missing responsePhase (null) but keyboard-classified -> included in responseCount
    insertEventLocal(persistence, {
      sessionId,
      type: 'USER_RESPONDED',
      payload: { modality: 'position', reactionTimeMs: 500 },
    });
    // touch -> excluded
    insertEventLocal(persistence, {
      sessionId,
      type: 'USER_RESPONDED',
      payload: {
        modality: 'position',
        reactionTimeMs: 999,
        responsePhase: 'during_stimulus',
        inputMethod: 'touch',
      },
    });

    const adapter = createStatsAdapter(persistence as any);
    const timing = await adapter.getTimingStats(baseFilters({ inputMethod: 'keyboard' }));

    expect(timing.responseCount).toBe(3);
    expect(timing.responsesDuringStimulus).toBe(1);
    expect(timing.responsesAfterStimulus).toBe(1);
    expect(Math.round(timing.medianResponseTimeMs ?? 0)).toBe(500);
    expect(Math.round(timing.medianResponseTimeDuringStimulusMs ?? 0)).toBe(300);
    expect(Math.round(timing.medianResponseTimeAfterStimulusMs ?? 0)).toBe(700);
    expect(Math.round(timing.medianResponseTimeAfterStimulusOffsetMs ?? 0)).toBe(700);
  });

  it('getTimingStats: prefers capturedAtMs - stimulusShownAtMs when available (and recomputes phase)', async () => {
    const sessionId = 's2b';
    insertSessionSummary(persistence, { sessionId, gameMode: 'dualnback-classic' });

    // Legacy rt says "999", but captured - shown yields 500 (should be used).
    // Legacy phase says "after", but captured <= hidden implies "during".
    insertEventLocal(persistence, {
      sessionId,
      type: 'USER_RESPONDED',
      payload: {
        modality: 'position',
        reactionTimeMs: 999,
        responsePhase: 'after_stimulus',
        capturedAtMs: 2000,
        stimulusShownAtMs: 1500,
        stimulusHiddenAtMs: 2100,
      },
    });

    const adapter = createStatsAdapter(persistence as any);
    const timing = await adapter.getTimingStats(baseFilters({ inputMethod: 'keyboard' }));

    expect(Math.round(timing.medianResponseTimeMs ?? 0)).toBe(500);
    expect(timing.responsesDuringStimulus).toBe(1);
    expect(timing.responsesAfterStimulus).toBe(0);
    expect(Math.round(timing.medianResponseTimeDuringStimulusMs ?? 0)).toBe(500);
    expect(timing.medianResponseTimeAfterStimulusMs).toBeNull();
  });

  it('getTimingStats: computes median after-stimulus offset RT when timestamps are available', async () => {
    const sessionId = 's2d';
    insertSessionSummary(persistence, { sessionId, gameMode: 'dualnback-classic' });

    insertEventLocal(persistence, {
      sessionId,
      type: 'USER_RESPONDED',
      payload: {
        modality: 'position',
        reactionTimeMs: 999, // legacy is irrelevant here
        responsePhase: 'after_stimulus',
        capturedAtMs: 2500,
        stimulusShownAtMs: 1500, // onset = 1000
        stimulusHiddenAtMs: 2000, // offset = 500
      },
    });

    const adapter = createStatsAdapter(persistence as any);
    const timing = await adapter.getTimingStats(baseFilters({ inputMethod: 'keyboard' }));

    expect(Math.round(timing.medianResponseTimeAfterStimulusMs ?? 0)).toBe(1000);
    expect(Math.round(timing.medianResponseTimeAfterStimulusOffsetMs ?? 0)).toBe(500);
  });

  it('getTimingStats: with inputMethod and no matching events does not fall back to summaries', async () => {
    const sessionId = 's2c';
    insertSessionSummary(persistence, {
      sessionId,
      gameMode: 'dualnback-classic',
      timing: {
        avgResponseTimeMs: 500,
        medianResponseTimeMs: 500,
        responsesDuringStimulus: 2,
        responsesAfterStimulus: 1,
      },
    });

    const adapter = createStatsAdapter(persistence as any);
    const timing = await adapter.getTimingStats(baseFilters({ inputMethod: 'mouse' }));

    expect(timing.responseCount).toBe(0);
    expect(timing.avgResponseTimeMs).toBeNull();
    expect(timing.medianResponseTimeMs).toBeNull();
  });

  it('getTimingStats: missing inputMethod + buttonPosition is treated as mouse (not keyboard)', async () => {
    const sessionId = 's2e';
    insertSessionSummary(persistence, { sessionId, gameMode: 'dualnback-classic' });

    insertEventLocal(persistence, {
      sessionId,
      type: 'USER_RESPONDED',
      payload: {
        modality: 'position',
        reactionTimeMs: 400,
        // No inputMethod provided: should be inferred as mouse thanks to buttonPosition.
        buttonPosition: { x: 123, y: 456 },
      },
    });

    const adapter = createStatsAdapter(persistence as any);
    const mouse = await adapter.getTimingStats(baseFilters({ inputMethod: 'mouse' }));
    expect(mouse.responseCount).toBe(1);
    expect(Math.round(mouse.medianResponseTimeMs ?? 0)).toBe(400);

    const keyboard = await adapter.getTimingStats(baseFilters({ inputMethod: 'keyboard' }));
    expect(keyboard.responseCount).toBe(0);
    expect(keyboard.medianResponseTimeMs).toBeNull();
  });

  it('getPostErrorSlowingStats: keyboard includes missing inputMethod; mouse excludes it', async () => {
    const sessionId = 's3';
    insertSessionSummary(persistence, { sessionId, gameMode: 'dualnback-classic' });

    // trial 0: target (position), no response => miss
    insertEventLocal(persistence, {
      sessionId,
      type: 'TRIAL_PRESENTED',
      payload: { trial: { index: 0, isPositionTarget: 1, isSoundTarget: 0 } },
    });

    // trial 1: target, response => hit; previous is miss => post-error trial
    insertEventLocal(persistence, {
      sessionId,
      type: 'TRIAL_PRESENTED',
      payload: { trial: { index: 1, isPositionTarget: 1, isSoundTarget: 0 } },
    });
    insertEventLocal(persistence, {
      sessionId,
      type: 'USER_RESPONDED',
      payload: { trialIndex: 1, modality: 'position', reactionTimeMs: 500 },
    });

    const adapter = createStatsAdapter(persistence as any);

    const keyboardRows = await adapter.getPostErrorSlowingStats(
      baseFilters({ inputMethod: 'keyboard' }),
    );
    expect(keyboardRows.length).toBe(1);
    expect(keyboardRows[0]?.modality).toBe('position');
    expect(Math.round(keyboardRows[0]?.avgRtOnHitsMs ?? 0)).toBe(500);
    expect(keyboardRows[0]?.hitTrialCount).toBe(1);
    expect(keyboardRows[0]?.postErrorTrialCount).toBe(1);

    const mouseRows = await adapter.getPostErrorSlowingStats(baseFilters({ inputMethod: 'mouse' }));
    expect(mouseRows.length).toBe(0);
  });

  it('getPostErrorSlowingStats: uses lookahead and post-error hits (not immediate post-error responses)', async () => {
    const sessionId = 's4';
    insertSessionSummary(persistence, { sessionId, gameMode: 'dualnback-classic' });

    // trial 0: target (position), no response => miss (error)
    insertEventLocal(persistence, {
      sessionId,
      type: 'TRIAL_PRESENTED',
      payload: { trial: { index: 0, isPositionTarget: 1, isSoundTarget: 0 } },
    });

    // trial 1: not a target, response => false alarm (error)
    insertEventLocal(persistence, {
      sessionId,
      type: 'TRIAL_PRESENTED',
      payload: { trial: { index: 1, isPositionTarget: 0, isSoundTarget: 0 } },
    });
    insertEventLocal(persistence, {
      sessionId,
      type: 'USER_RESPONDED',
      payload: { trialIndex: 1, modality: 'position', reactionTimeMs: 300 },
    });

    // trial 2: target, response => hit (should be used as the post-error hit for both errors)
    insertEventLocal(persistence, {
      sessionId,
      type: 'TRIAL_PRESENTED',
      payload: { trial: { index: 2, isPositionTarget: 1, isSoundTarget: 0 } },
    });
    insertEventLocal(persistence, {
      sessionId,
      type: 'USER_RESPONDED',
      payload: { trialIndex: 2, modality: 'position', reactionTimeMs: 600 },
    });

    const adapter = createStatsAdapter(persistence as any);
    const rows = await adapter.getPostErrorSlowingStats(baseFilters({ inputMethod: 'keyboard' }));

    expect(rows.length).toBe(1);
    expect(rows[0]?.modality).toBe('position');
    expect(rows[0]?.hitTrialCount).toBe(1);
    expect(Math.round(rows[0]?.avgRtOnHitsMs ?? 0)).toBe(600);

    // Two errors (miss + false alarm) => two post-error pairs; both map to the same lookahead hit (trial 2).
    expect(rows[0]?.postErrorTrialCount).toBe(2);
    expect(Math.round(rows[0]?.avgRtAfterErrorMs ?? 0)).toBe(600);

    // Not enough pairs for a stable PES ratio (minPairs = 3).
    expect(rows[0]?.pesRatio).toBeNull();
  });
});
