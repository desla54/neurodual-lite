import { describe, expect, it, mock } from 'bun:test';
import type {
  GameEvent,
  PersistencePort,
  SessionSummary,
  SessionSummaryInput,
  StoredEvent,
} from '@neurodual/logic';
import { SessionCompletionProjector } from '@neurodual/logic';
import { insertSessionSummaryFromEvent } from './history-projection';

const SESSION_ID = 'session-main';
const USER_ID = 'user-1';

function makeStoredEvent(params: {
  readonly id: string;
  readonly sessionId: string;
  readonly type: string;
  readonly timestamp: number;
  readonly payload: Record<string, unknown>;
}): StoredEvent {
  return {
    id: params.id,
    user_id: USER_ID,
    session_id: params.sessionId,
    type: params.type,
    timestamp: params.timestamp,
    payload: {
      schemaVersion: 1,
      sessionId: params.sessionId,
      ...params.payload,
    },
    created_at: new Date(params.timestamp).toISOString(),
    updated_at: new Date(params.timestamp).toISOString(),
    deleted: false,
    synced: true,
  };
}

function stripReservedGameEventKeys(payload: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (key === 'id' || key === 'type' || key === 'sessionId' || key === 'timestamp') continue;
    cleaned[key] = value;
  }
  return cleaned;
}

function toGameEvent(e: StoredEvent): GameEvent {
  const payload = stripReservedGameEventKeys(e.payload as Record<string, unknown>);
  return {
    id: e.id,
    type: e.type as GameEvent['type'],
    sessionId: e.session_id,
    timestamp: Number(e.timestamp),
    ...(payload as Record<string, unknown>),
  } as GameEvent;
}

function totalsFromSessionSummary(summary: SessionSummary): {
  readonly totalHits: number;
  readonly totalMisses: number;
  readonly totalFa: number;
  readonly totalCr: number;
} {
  let totalHits = 0;
  let totalMisses = 0;
  let totalFa = 0;
  let totalCr = 0;

  for (const stats of Object.values(summary.finalStats.byModality)) {
    totalHits += stats.hits;
    totalMisses += stats.misses;
    totalFa += stats.falseAlarms;
    totalCr += stats.correctRejections;
  }

  return { totalHits, totalMisses, totalFa, totalCr };
}

function createNoisyDualnbackClassicStoredEvents(): StoredEvent[] {
  const base = 1_700_000_000_000;
  const foreignSessionId = 'session-foreign';

  const mainEvents: StoredEvent[] = [
    makeStoredEvent({
      id: 'evt-start',
      sessionId: SESSION_ID,
      type: 'SESSION_STARTED',
      timestamp: base,
      payload: {
        userId: USER_ID,
        nLevel: 2,
        gameMode: 'dualnback-classic',
        playContext: 'free',
        device: {
          platform: 'web',
          userAgent: 'test',
          screenWidth: 1920,
          screenHeight: 1080,
          touchCapable: false,
        },
        context: { timeOfDay: 'morning', localHour: 10, dayOfWeek: 1, timezone: 'UTC' },
        config: {
          nLevel: 2,
          activeModalities: ['position', 'audio'],
          trialsCount: 2,
          targetProbability: 0.3,
          lureProbability: 0,
          intervalSeconds: 3,
          stimulusDurationSeconds: 0.5,
          generator: 'DualnbackClassic',
        },
      },
    }),
    makeStoredEvent({
      id: 'evt-trial-1',
      sessionId: SESSION_ID,
      type: 'TRIAL_PRESENTED',
      timestamp: base + 3_000,
      payload: {
        trial: {
          index: 0,
          isBuffer: false,
          position: 0,
          sound: 'C',
          color: 'ink-navy',
          image: 'circle',
          trialType: 'target',
          isPositionTarget: true,
          isSoundTarget: true,
          isColorTarget: false,
          isImageTarget: false,
          isPositionLure: false,
          isSoundLure: false,
          isColorLure: false,
          isImageLure: false,
        },
        isiMs: 2500,
        stimulusDurationMs: 500,
      },
    }),
    makeStoredEvent({
      id: 'evt-resp-pos',
      sessionId: SESSION_ID,
      type: 'USER_RESPONDED',
      timestamp: base + 3_400,
      payload: {
        trialIndex: 0,
        modality: 'position',
        reactionTimeMs: 400,
        pressDurationMs: 120,
        responsePhase: 'during_stimulus',
        wasTarget: true,
        isCorrect: true,
        responseIndexInTrial: 0,
      },
    }),
    makeStoredEvent({
      id: 'evt-resp-aud',
      sessionId: SESSION_ID,
      type: 'USER_RESPONDED',
      timestamp: base + 3_450,
      payload: {
        trialIndex: 0,
        modality: 'audio',
        reactionTimeMs: 450,
        pressDurationMs: 110,
        responsePhase: 'during_stimulus',
        wasTarget: true,
        isCorrect: true,
        responseIndexInTrial: 1,
      },
    }),
    makeStoredEvent({
      id: 'evt-end',
      sessionId: SESSION_ID,
      type: 'SESSION_ENDED',
      timestamp: base + 10_000,
      payload: {
        reason: 'completed',
        playContext: 'free',
      },
    }),
  ];

  // This event does NOT belong to SESSION_ID, but is otherwise valid.
  // If projection doesn't isolate by sessionId, it will corrupt summary totals.
  const foreignNoise: StoredEvent = makeStoredEvent({
    id: 'evt-foreign-trial',
    sessionId: foreignSessionId,
    type: 'TRIAL_PRESENTED',
    timestamp: base + 6_000,
    payload: {
      trial: {
        index: 999,
        isBuffer: false,
        position: 3,
        sound: 'K',
        color: 'ink-black',
        image: 'diamond',
        trialType: 'target',
        isPositionTarget: true,
        isSoundTarget: true,
        isColorTarget: false,
        isImageTarget: false,
        isPositionLure: false,
        isSoundLure: false,
        isColorLure: false,
        isImageLure: false,
      },
      isiMs: 2500,
      stimulusDurationMs: 500,
    },
  });

  return [...mainEvents, foreignNoise];
}

function createMockPersistence(events: StoredEvent[]): PersistencePort {
  return {
    getSession: mock(() => Promise.resolve(events)),
    insertSessionSummary: mock(() => Promise.resolve()),
    deleteSession: mock(() => Promise.resolve(0)),
    queueDeletion: mock(() => Promise.resolve()),
    query: mock(() => Promise.resolve({ rows: [] })),
    execute: mock(() => Promise.resolve()),
  } as unknown as PersistencePort;
}

describe('session completion consistency contract (dualnback-classic)', () => {
  it('history projection matches SessionCompletionProjector even with noisy stored events', async () => {
    const storedEvents = createNoisyDualnbackClassicStoredEvents();
    const persistence = createMockPersistence(storedEvents);

    let historySummary: SessionSummaryInput | null = null;
    const writer: { insert: (summary: SessionSummaryInput) => Promise<void> } = {
      insert: async (summary: SessionSummaryInput) => {
        historySummary = summary;
      },
    };

    await insertSessionSummaryFromEvent(
      persistence,
      {
        type: 'SESSION_ENDED',
        sessionId: SESSION_ID,
        timestamp: 1_700_000_010_000,
        id: 'evt-end',
        schemaVersion: 1,
        reason: 'completed',
        playContext: 'free',
      } as any,
      writer,
    );

    expect(historySummary).not.toBeNull();
    if (!historySummary) return;

    const liveEvents = storedEvents.map(toGameEvent);
    const live = SessionCompletionProjector.project({
      mode: 'tempo',
      sessionId: SESSION_ID,
      gameMode: 'dualnback-classic',
      gameModeLabel: 'Dual N-Back Classic',
      generator: 'DualnbackClassic',
      events: liveEvents,
      activeModalities: ['position', 'audio'],
    });

    expect(live).not.toBeNull();
    if (!live) return;

    // This contract test is about Tempo sessions only.
    expect(live.mode).toBe('tempo');
    const tempoSummary = live.summary as SessionSummary;

    const totals = totalsFromSessionSummary(tempoSummary);

    expect((historySummary as any).gameMode).toBe('dualnback-classic');
    expect((historySummary as any).totalHits).toBe(totals.totalHits);
    expect((historySummary as any).totalMisses).toBe(totals.totalMisses);
    expect((historySummary as any).totalFa).toBe(totals.totalFa);
    expect((historySummary as any).totalCr).toBe(totals.totalCr);
    expect((historySummary as any).globalDPrime).toBeCloseTo(
      tempoSummary.finalStats.globalDPrime,
      10,
    );
    expect((historySummary as any).passed).toBe(live.passed);
    expect((historySummary as any).upsScore ?? null).toBe(live.ups.score ?? null);
    expect((historySummary as any).upsAccuracy ?? null).toBe(live.ups.components.accuracy ?? null);
    expect((historySummary as any).upsConfidence ?? null).toBe(
      live.ups.components.confidence ?? null,
    );
  });
});
