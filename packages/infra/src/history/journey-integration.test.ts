/**
 * Integration test: Full journey progression chain for Dual N-Back Classic.
 *
 * Exercises the exact production data flow:
 *   stored events → insertSessionSummaryFromEvent → session_summary → projectJourneyFromHistory
 *
 * This test exists to catch any regression in the chain that static analysis cannot detect.
 */
import { describe, expect, it, mock } from 'bun:test';
import type { PersistencePort, StoredEvent, SessionSummaryInput } from '@neurodual/logic';
import { projectJourneyFromHistory, type JourneyProjectionSession } from '@neurodual/logic';
import { insertSessionSummaryFromEvent } from './history-projection';

// =============================================================================
// Helpers
// =============================================================================

const SESSION_ID = 'test-session-001';
const USER_ID = 'user-123';
const JOURNEY_ID = 'dualnback-classic-journey';
const JOURNEY_STAGE_ID = 1;
const N_LEVEL = 2;

/** Create a StoredEvent from payload fields. */
function makeEvent(
  id: string,
  type: string,
  timestamp: number,
  payload: Record<string, unknown>,
): StoredEvent {
  return {
    id,
    user_id: USER_ID,
    session_id: SESSION_ID,
    type,
    timestamp,
    payload: { schemaVersion: 1, sessionId: SESSION_ID, ...payload },
    created_at: new Date(timestamp).toISOString(),
    updated_at: new Date(timestamp).toISOString(),
    deleted: false,
    synced: true,
  };
}

/** Create realistic StoredEvent[] for a completed dualnback-classic session */
function createDualnbackClassicStoredEvents(): StoredEvent[] {
  const now = Date.now();
  let t = now - 120_000;

  const sessionStarted = makeEvent('evt-start-1', 'SESSION_STARTED', t, {
    userId: USER_ID,
    nLevel: N_LEVEL,
    device: {
      platform: 'web',
      userAgent: 'test-agent',
      screenWidth: 1920,
      screenHeight: 1080,
      touchCapable: false,
    },
    context: {
      timeOfDay: 'afternoon',
      localHour: 14,
      dayOfWeek: 4,
      timezone: 'Europe/Paris',
    },
    config: {
      nLevel: N_LEVEL,
      activeModalities: ['position', 'audio'],
      trialsCount: 20,
      targetProbability: 0.3,
      lureProbability: 0,
      intervalSeconds: 3,
      stimulusDurationSeconds: 0.5,
      generator: 'DualnbackClassic',
    },
    gameMode: 'dualnback-classic',
    journeyStageId: JOURNEY_STAGE_ID,
    journeyId: JOURNEY_ID,
    journeyStartLevel: N_LEVEL,
    journeyTargetLevel: 5,
    journeyGameMode: 'dualnback-classic',
    trialsSeed: 'seed-abc',
    trialsHash: 'seed-seed-abc',
    playContext: 'journey',
  });
  t += 1000;

  // Create 20+N_LEVEL trials: first N_LEVEL are buffer, rest are real
  const trials: StoredEvent[] = [];
  const totalTrials = 20 + N_LEVEL;
  let evtIdx = 0;

  for (let i = 0; i < totalTrials; i++) {
    const isBuffer = i < N_LEVEL;
    t += 3000;

    // Deterministic target generation (simple pattern)
    const isPositionTarget = !isBuffer && i % 4 === 0;
    const isAudioTarget = !isBuffer && i % 5 === 0;

    // TRIAL_PRESENTED — legacy Trial format (used by DualnbackClassicStrategy)
    trials.push(
      makeEvent(`evt-tp-${evtIdx++}`, 'TRIAL_PRESENTED', t, {
        trial: {
          index: i,
          isBuffer,
          position: i % 9,
          sound: String.fromCharCode(65 + (i % 8)),
          color: 'ink-navy',
          image: 'circle',
          trialType: isBuffer
            ? 'buffer'
            : isPositionTarget || isAudioTarget
              ? 'target'
              : 'standard',
          isPositionTarget,
          isSoundTarget: isAudioTarget,
          isColorTarget: false,
          isImageTarget: false,
          isPositionLure: false,
          isSoundLure: false,
          isColorLure: false,
          isImageLure: false,
        },
        isiMs: 2500,
        stimulusDurationMs: 500,
      }),
    );

    // USER_RESPONDED — one event per modality, only when user presses
    // Good performance: respond to targets, don't respond to non-targets
    if (!isBuffer) {
      if (isPositionTarget) {
        trials.push(
          makeEvent(`evt-ur-${evtIdx++}`, 'USER_RESPONDED', t + 400, {
            trialIndex: i,
            modality: 'position',
            reactionTimeMs: 450,
            pressDurationMs: 120,
            responsePhase: 'during_stimulus',
            wasTarget: true,
            isCorrect: true,
            responseIndexInTrial: 0,
          }),
        );
      }
      if (isAudioTarget) {
        trials.push(
          makeEvent(`evt-ur-${evtIdx++}`, 'USER_RESPONDED', t + 420, {
            trialIndex: i,
            modality: 'audio',
            reactionTimeMs: 470,
            pressDurationMs: 100,
            responsePhase: 'during_stimulus',
            wasTarget: true,
            isCorrect: true,
            responseIndexInTrial: isPositionTarget ? 1 : 0,
          }),
        );
      }
      // Non-target trials: user does NOT respond (correctRejection inferred by projector)
    }
  }

  const sessionEnded = makeEvent('evt-end-1', 'SESSION_ENDED', now, {
    reason: 'completed',
    journeyStageId: JOURNEY_STAGE_ID,
    journeyId: JOURNEY_ID,
    playContext: 'journey',
  });

  return [sessionStarted, ...trials, sessionEnded];
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

// =============================================================================
// Tests
// =============================================================================

describe('Journey progression integration: Dual N-Back Classic', () => {
  it('should produce a session_summary with correct journey fields from stored events', async () => {
    const storedEvents = createDualnbackClassicStoredEvents();
    const persistence = createMockPersistence(storedEvents);

    let capturedSummary: SessionSummaryInput | null = null;
    const writer: any = {
      insert: async (summary: any) => {
        capturedSummary = summary;
      },
    };

    const sessionEndEvent = {
      type: 'SESSION_ENDED' as const,
      sessionId: SESSION_ID,
      reason: 'completed' as const,
      schemaVersion: 1,
      timestamp: Date.now(),
      id: 'evt-end-1',
      journeyStageId: JOURNEY_STAGE_ID,
      journeyId: JOURNEY_ID,
      playContext: 'journey',
    };

    await insertSessionSummaryFromEvent(persistence, sessionEndEvent as any, writer);

    // Verify session summary was created
    expect(capturedSummary).not.toBeNull();
    if (!capturedSummary) return;

    // Critical journey fields
    expect((capturedSummary as any).journeyStageId).toBe(String(JOURNEY_STAGE_ID));
    expect((capturedSummary as any).journeyId).toBe(JOURNEY_ID);
    expect((capturedSummary as any).gameMode).toBe('dualnback-classic');
    expect((capturedSummary as any).nLevel).toBe(N_LEVEL);
    expect((capturedSummary as any).reason).toBe('completed');

    // byModality must be populated (not empty)
    expect((capturedSummary as any).byModality).toBeDefined();
    const modalities = Object.keys((capturedSummary as any).byModality ?? {});
    expect(modalities.length).toBeGreaterThan(0);
    expect(modalities).toContain('position');
    expect(modalities).toContain('audio');

    // Each modality must have SDT fields
    for (const key of modalities) {
      const stats = ((capturedSummary as any).byModality as Record<string, any>)?.[key];
      expect(typeof stats.hits).toBe('number');
      expect(typeof stats.misses).toBe('number');
      expect(typeof stats.falseAlarms).toBe('number');
      expect(typeof stats.correctRejections).toBe('number');
    }
  });

  it('should advance journey when session has perfect performance', async () => {
    const storedEvents = createDualnbackClassicStoredEvents();
    const persistence = createMockPersistence(storedEvents);

    let capturedSummary: SessionSummaryInput | null = null;
    const writer: any = {
      insert: async (summary: any) => {
        capturedSummary = summary;
      },
    };

    const sessionEndEvent = {
      type: 'SESSION_ENDED' as const,
      sessionId: SESSION_ID,
      reason: 'completed' as const,
      schemaVersion: 1,
      timestamp: Date.now(),
      id: 'evt-end-1',
      journeyStageId: JOURNEY_STAGE_ID,
      journeyId: JOURNEY_ID,
      playContext: 'journey',
    };

    await insertSessionSummaryFromEvent(persistence, sessionEndEvent as any, writer);
    expect(capturedSummary).not.toBeNull();
    if (!capturedSummary) return;

    // Convert to JourneyProjectionSession (same as useJourneyRecordableSessionsQuery does)
    const byModality = (capturedSummary as any).byModality;
    const parsedByModality:
      | Record<
          string,
          { hits: number; misses: number; falseAlarms: number; correctRejections: number }
        >
      | undefined =
      byModality && Object.keys(byModality).length > 0
        ? Object.fromEntries(
            Object.entries(byModality).map(([key, data]) => [
              key,
              {
                hits: (data as any).hits ?? 0,
                misses: (data as any).misses ?? 0,
                falseAlarms: (data as any).falseAlarms ?? 0,
                correctRejections: (data as any).correctRejections ?? 0,
              },
            ]),
          )
        : undefined;

    const session: JourneyProjectionSession = {
      journeyStageId: Number((capturedSummary as any).journeyStageId),
      journeyId: (capturedSummary as any).journeyId,
      nLevel: (capturedSummary as any).nLevel,
      dPrime: (capturedSummary as any).globalDPrime ?? 0,
      gameMode: (capturedSummary as any).gameMode,
      upsScore: (capturedSummary as any).upsScore,
      timestamp: (capturedSummary as any).createdAt.getTime(),
      byModality: parsedByModality,
    };

    // Log for debugging
    console.log('[test] session.byModality:', JSON.stringify(session.byModality));
    console.log('[test] session.gameMode:', session.gameMode);
    console.log('[test] session.nLevel:', session.nLevel);
    console.log('[test] session.journeyStageId:', session.journeyStageId);
    console.log('[test] session.upsScore:', session.upsScore);

    // Check that modality errors are < 3 (which gives score 100 for journey)
    if (session.byModality) {
      for (const [mod, stats] of Object.entries(session.byModality)) {
        const errors = stats.misses + stats.falseAlarms;
        console.log(
          `[test] modality ${mod}: hits=${stats.hits}, misses=${stats.misses}, fa=${stats.falseAlarms}, cr=${stats.correctRejections}, errors=${errors}`,
        );
      }
    }

    // NOW: feed into journey projector
    const journeyState = projectJourneyFromHistory(
      [session],
      5, // targetLevel
      N_LEVEL, // startLevel (matches the session's nLevel)
      JOURNEY_ID,
      true, // isSimulator (dualnback-classic is a simulator journey)
      'dualnback-classic',
    );

    console.log('[test] Journey state:', {
      currentStage: journeyState.currentStage,
      stage0: journeyState.stages[0],
    });

    // If session has < 3 errors per modality → score 100 → UP → journey advances
    // currentStage should be 2 (stage 1 completed)
    expect(journeyState.currentStage).toBeGreaterThan(1);
    expect(journeyState.stages[0]?.status).toBe('completed');
  });

  it('should NOT advance journey when session has >= 3 errors per modality', async () => {
    // Create events, then remove ALL user responses → every target becomes a miss
    const storedEvents = createDualnbackClassicStoredEvents().filter(
      (e) => e.type !== 'USER_RESPONDED',
    );

    const persistence = createMockPersistence(storedEvents);

    let capturedSummary: SessionSummaryInput | null = null;
    const writer: any = {
      insert: async (summary: any) => {
        capturedSummary = summary;
      },
    };

    const sessionEndEvent = {
      type: 'SESSION_ENDED' as const,
      sessionId: SESSION_ID,
      reason: 'completed' as const,
      schemaVersion: 1,
      timestamp: Date.now(),
      id: 'evt-end-1',
      journeyStageId: JOURNEY_STAGE_ID,
      journeyId: JOURNEY_ID,
      playContext: 'journey',
    };

    await insertSessionSummaryFromEvent(persistence, sessionEndEvent as any, writer);
    expect(capturedSummary).not.toBeNull();
    if (!capturedSummary) return;

    const byModality = (capturedSummary as any).byModality;
    const parsedByModality =
      byModality && Object.keys(byModality).length > 0
        ? Object.fromEntries(
            Object.entries(byModality).map(([key, data]) => [
              key,
              {
                hits: (data as any).hits ?? 0,
                misses: (data as any).misses ?? 0,
                falseAlarms: (data as any).falseAlarms ?? 0,
                correctRejections: (data as any).correctRejections ?? 0,
              },
            ]),
          )
        : undefined;

    const session: JourneyProjectionSession = {
      journeyStageId: Number((capturedSummary as any).journeyStageId),
      journeyId: (capturedSummary as any).journeyId,
      nLevel: (capturedSummary as any).nLevel,
      dPrime: (capturedSummary as any).globalDPrime ?? 0,
      gameMode: (capturedSummary as any).gameMode,
      upsScore: (capturedSummary as any).upsScore,
      timestamp: (capturedSummary as any).createdAt.getTime(),
      byModality: parsedByModality,
    };

    const journeyState = projectJourneyFromHistory(
      [session],
      5,
      N_LEVEL,
      JOURNEY_ID,
      true,
      'dualnback-classic',
    );

    // With many errors, journey should NOT advance
    expect(journeyState.currentStage).toBe(1);
    expect(journeyState.stages[0]?.status).not.toBe('completed');
  });
});
