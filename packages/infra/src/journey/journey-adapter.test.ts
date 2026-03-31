import { describe, expect, it, mock } from 'bun:test';
import type { HistoryPort, JourneyConfig } from '@neurodual/logic';
import { createJourneyAdapter } from './journey-adapter';

const TEST_CONFIG: JourneyConfig = {
  journeyId: 'journey-test',
  startLevel: 1,
  targetLevel: 5,
  gameMode: 'dualnback-classic',
};

function makeSession(params: {
  id: string;
  stageId: number;
  journeyId: string;
  reason?: 'completed' | 'abandoned' | 'error';
  createdAtMs: number;
  byModality?: Record<
    string,
    { hits: number; misses: number; falseAlarms: number; correctRejections: number }
  >;
}): any {
  return {
    id: params.id,
    createdAt: new Date(params.createdAtMs),
    nLevel: 1,
    dPrime: 0,
    passed: true,
    trialsCount: 20,
    durationMs: 60000,
    byModality: params.byModality ?? {
      // Default: < 3 errors per modality → UP in Jaeggi protocol
      position: { hits: 9, misses: 1, falseAlarms: 0, correctRejections: 10 },
      audio: { hits: 9, misses: 1, falseAlarms: 0, correctRejections: 10 },
    },
    generator: 'dualnback-classic',
    gameMode: 'dualnback-classic',
    activeModalities: ['position', 'audio'],
    reason: params.reason ?? 'completed',
    journeyStageId: params.stageId,
    journeyId: params.journeyId,
    upsScore: 100,
    unifiedMetrics: {},
  };
}

function createMockHistoryPort(sessions: any[]): HistoryPort {
  return {
    getSessions: mock(async () => sessions),
  } as unknown as HistoryPort;
}

describe('JourneyAdapter', () => {
  it('does not double-count current session when already persisted', async () => {
    const sessions = [
      makeSession({
        id: 'session-prev',
        stageId: 1,
        journeyId: TEST_CONFIG.journeyId,
        createdAtMs: 1000,
      }),
      makeSession({
        id: 'session-current',
        stageId: 1,
        journeyId: TEST_CONFIG.journeyId,
        createdAtMs: 2000,
      }),
    ];

    const adapter = createJourneyAdapter(createMockHistoryPort(sessions));
    const result = await adapter.recordAttempt(TEST_CONFIG, 1, {
      sessionId: 'session-current',
      score: 100,
    });

    // Both sessions have < 3 errors per modality → both are validating
    expect(result.totalValidatingSessions).toBe(2);
    // In Jaeggi binary mode, first session with < 3 errors = UP → stage completed
    expect(result.stageCompleted).toBe(true);
    expect(result.nextStageUnlocked).toBe(2);
  });

  it('ignores non-completed sessions in journey projection', async () => {
    const sessions = [
      makeSession({
        id: 'session-completed',
        stageId: 1,
        journeyId: TEST_CONFIG.journeyId,
        reason: 'completed',
        createdAtMs: 1000,
      }),
      makeSession({
        id: 'session-error',
        stageId: 1,
        journeyId: TEST_CONFIG.journeyId,
        reason: 'error',
        createdAtMs: 2000,
      }),
    ];

    const adapter = createJourneyAdapter(createMockHistoryPort(sessions));
    const state = await adapter.getJourneyState(TEST_CONFIG);
    const stage1 = state.stages.find((s) => s.stageId === 1);

    // Only the completed session counts (< 3 errors → validating)
    expect(stage1?.validatingSessions).toBe(1);
    // Jaeggi binary: first session with < 3 errors = UP → completed immediately
    expect(stage1?.status).toBe('completed');
    expect(state.currentStage).toBe(2);
  });

  it('ignores sessions from other modes for simulator journeys', async () => {
    const sessions = [
      makeSession({
        id: 'session-classic',
        stageId: 1,
        journeyId: TEST_CONFIG.journeyId,
        createdAtMs: 1000,
      }),
      {
        ...makeSession({
          id: 'session-other-mode',
          stageId: 1,
          journeyId: TEST_CONFIG.journeyId,
          createdAtMs: 2000,
        }),
        gameMode: 'dual-place',
      },
    ];

    const adapter = createJourneyAdapter(createMockHistoryPort(sessions));
    const state = await adapter.getJourneyState(TEST_CONFIG);
    const stage1 = state.stages.find((s) => s.stageId === 1);

    expect(stage1?.validatingSessions).toBe(1);
    expect(state.currentStage).toBe(2);
  });

  it('projects the current hybrid dual n-back half with its real gameMode when history lags', async () => {
    const hybridConfig: JourneyConfig = {
      journeyId: 'dual-track-dnb-journey',
      startLevel: 2,
      targetLevel: 5,
      gameMode: 'dual-track-dnb-hybrid',
    };
    const sessions = [
      {
        ...makeSession({
          id: 'track-half',
          stageId: 1,
          journeyId: hybridConfig.journeyId,
          createdAtMs: 1000,
        }),
        nLevel: 2,
        gameMode: 'dual-track',
        byModality: undefined,
        upsScore: 88,
      },
      {
        ...makeSession({
          id: 'dnb-half-prev',
          stageId: 1,
          journeyId: hybridConfig.journeyId,
          createdAtMs: 2000,
        }),
        nLevel: 2,
        gameMode: 'dualnback-classic',
        byModality: {
          position: { hits: 6, misses: 0, falseAlarms: 0, correctRejections: 6 },
          audio: { hits: 4, misses: 1, falseAlarms: 0, correctRejections: 6 },
        },
        upsScore: 100,
      },
    ];

    const adapter = createJourneyAdapter(createMockHistoryPort(sessions));
    const result = await adapter.recordAttempt(hybridConfig, 1, {
      sessionId: 'dnb-half-current',
      score: 100,
      gameMode: 'dualnback-classic',
    });

    expect(result.stageCompleted).toBe(true);
    expect(result.nextStageUnlocked).toBe(2);
    expect(result.nextPlayableStage).toBe(2);
  });

  it('does not require full history reload for hybrid handoff decisions', async () => {
    const hybridConfig: JourneyConfig = {
      journeyId: 'dual-track-dnb-journey',
      startLevel: 2,
      targetLevel: 5,
      gameMode: 'dual-track-dnb-hybrid',
    };
    const historyPort = {
      getSessions: mock(async () => {
        throw new Error('full history should not be needed for hybrid handoff');
      }),
      getJourneySessions: mock(async () => [
        {
          ...makeSession({
            id: 'track-half',
            stageId: 1,
            journeyId: hybridConfig.journeyId,
            createdAtMs: 1000,
          }),
          nLevel: 2,
          gameMode: 'dual-track',
          byModality: undefined,
          upsScore: 88,
        },
      ]),
    } as unknown as HistoryPort;

    const adapter = createJourneyAdapter(historyPort);
    const trackHalf = await adapter.recordAttempt(hybridConfig, 1, {
      sessionId: 'track-half-current',
      score: 88,
      gameMode: 'dual-track',
    });
    expect(trackHalf.progressPct).toBe(25);
    expect(trackHalf.nextPlayableStage).toBe(1);

    const dnbHalf = await adapter.recordAttempt(hybridConfig, 1, {
      sessionId: 'dnb-half-current',
      score: 100,
      gameMode: 'dualnback-classic',
    });
    expect(dnbHalf.stageCompleted).toBe(false);
    expect(dnbHalf.nextPlayableStage).toBe(1);
  });

  it('prefers injected projected journey state over historical replay for reads', async () => {
    const historyPort = {
      getSessions: mock(async () => {
        throw new Error('historical replay should not be used when projected state is injected');
      }),
    } as unknown as HistoryPort;

    const adapter = createJourneyAdapter(historyPort, {
      getProjectedState: async () => ({
        currentStage: 3,
        stages: [
          { stageId: 1, status: 'completed', validatingSessions: 1, bestScore: 100 },
          { stageId: 2, status: 'completed', validatingSessions: 1, bestScore: 100 },
          { stageId: 3, status: 'unlocked', validatingSessions: 0, bestScore: null },
          { stageId: 4, status: 'locked', validatingSessions: 0, bestScore: null },
          { stageId: 5, status: 'locked', validatingSessions: 0, bestScore: null },
        ],
        isActive: true,
        startLevel: 1,
        targetLevel: 5,
        isSimulator: true,
      }),
    });

    const state = await adapter.getJourneyState(TEST_CONFIG);

    expect(state.currentStage).toBe(3);
    expect(state.stages[2]?.status).toBe('unlocked');
  });

  it('prefers injected projected journey state over historical replay for recordAttempt', async () => {
    const historyPort = {
      getSessions: mock(async () => {
        throw new Error('historical replay should not be used when projected state is injected');
      }),
      getJourneySessions: mock(async () => {
        throw new Error('journey history should not be used when projected state is injected');
      }),
    } as unknown as HistoryPort;

    const adapter = createJourneyAdapter(historyPort, {
      getProjectedState: async () => ({
        currentStage: 3,
        stages: [
          { stageId: 1, status: 'completed', validatingSessions: 1, bestScore: 100 },
          { stageId: 2, status: 'completed', validatingSessions: 1, bestScore: 100 },
          { stageId: 3, status: 'unlocked', validatingSessions: 0, bestScore: null },
          { stageId: 4, status: 'locked', validatingSessions: 0, bestScore: null },
          { stageId: 5, status: 'locked', validatingSessions: 0, bestScore: null },
        ],
        isActive: true,
        startLevel: 1,
        targetLevel: 5,
        isSimulator: true,
      }),
    });

    const result = await adapter.recordAttempt(TEST_CONFIG, 3, {
      sessionId: 'session-current',
      score: 100,
    });

    expect(result.stageCompleted).toBe(true);
    expect(result.nextPlayableStage).toBe(4);
  });
});
