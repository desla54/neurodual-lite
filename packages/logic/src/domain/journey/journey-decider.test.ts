import { describe, expect, it } from 'bun:test';

import { createEmptyJourneyState } from '../../engine/journey-projector';
import type { JourneyConfig, JourneyState } from '../../types/journey';
import { decideJourneyAttempt } from './journey-decider';

describe('decideJourneyAttempt', () => {
  it('maps dual-track score bands to the expected progress deltas', () => {
    const config: JourneyConfig = {
      journeyId: 'dual-track-journey',
      startLevel: 2,
      targetLevel: 5,
      gameMode: 'dual-track',
    };
    const cases = [
      { score: 99, expected: 24 },
      { score: 95, expected: 16 },
      { score: 90, expected: 10 },
      { score: 80, expected: 6 },
      { score: 70, expected: 4 },
      { score: 60, expected: 1 },
      { score: 50, expected: -3 },
      { score: 10, expected: -6 },
    ];

    for (const testCase of cases) {
      const currentState: JourneyState = {
        ...createEmptyJourneyState(5, 2, true),
        currentStage: 1,
        stages: [
          {
            stageId: 1,
            status: 'unlocked',
            validatingSessions: 0,
            bestScore: null,
            progressPct: 50,
          },
          ...createEmptyJourneyState(5, 2, true).stages.slice(1),
        ],
      };

      const attempt = decideJourneyAttempt({
        config,
        currentState,
        stageId: 1,
        session: {
          sessionId: `track-band-${testCase.score}`,
          score: testCase.score,
          gameMode: 'dual-track',
        },
      });

      expect(attempt.progressPct).toBe(Math.max(0, Math.min(100, 50 + testCase.expected)));
    }
  });

  it('advances Jaeggi simulator stages from the current state without replaying history', () => {
    const config: JourneyConfig = {
      journeyId: 'classic-journey',
      startLevel: 2,
      targetLevel: 5,
      gameMode: 'dualnback-classic',
    };
    const currentState = createEmptyJourneyState(5, 2, true);

    const attempt = decideJourneyAttempt({
      config,
      currentState,
      stageId: 1,
      session: {
        sessionId: 's-1',
        nLevel: 2,
        gameMode: 'dualnback-classic',
        finalStats: {
          globalDPrime: 2.5,
          byModality: {
            // @ts-expect-error test override
            position: { hits: 8, misses: 1, falseAlarms: 0, correctRejections: 9 },
            // @ts-expect-error test override
            audio: { hits: 8, misses: 1, falseAlarms: 0, correctRejections: 9 },
          },
        },
      },
    });

    expect(attempt.stageCompleted).toBe(true);
    expect(attempt.nextPlayableStage).toBe(2);
    expect(attempt.nextStageUnlocked).toBe(2);
    expect(attempt.journeyDecision).toBe('up');
  });

  it('keeps hybrid journeys in the track phase until the calibration block is complete', () => {
    const config: JourneyConfig = {
      journeyId: 'hybrid-journey',
      startLevel: 2,
      targetLevel: 5,
      gameMode: 'dual-track-dnb-hybrid',
    };
    const currentState = createEmptyJourneyState(5, 2, true);

    const attempt = decideJourneyAttempt({
      config,
      currentState,
      stageId: 1,
      session: {
        sessionId: 'track-1',
        score: 88,
        gameMode: 'dual-track',
      },
    });

    expect(attempt.nextPlayableStage).toBe(1);
    expect(attempt.nextSessionGameMode).toBe('dualnback-classic');
    expect(attempt.journeyDecision).toBe('pending-pair');
    expect(attempt.hybridProgress).toEqual({
      loopPhase: 'dnb',
      trackSessionsCompleted: 1,
      trackSessionsRequired: 1,
      dnbSessionsCompleted: 0,
      dnbSessionsRequired: 3,
    });
  });

  it('updates continuous dual-track progress from the current stage state', () => {
    const config: JourneyConfig = {
      journeyId: 'dual-track-journey',
      startLevel: 2,
      targetLevel: 5,
      gameMode: 'dual-track',
    };
    const currentState: JourneyState = {
      ...createEmptyJourneyState(5, 2, true),
      currentStage: 1,
      stages: [
        {
          stageId: 1,
          status: 'unlocked',
          validatingSessions: 1,
          bestScore: 82,
          progressPct: 94,
        },
        ...createEmptyJourneyState(5, 2, true).stages.slice(1),
      ],
    };

    const attempt = decideJourneyAttempt({
      config,
      currentState,
      stageId: 1,
      session: {
        sessionId: 'track-finish',
        score: 95,
        gameMode: 'dual-track',
      },
    });

    expect(attempt.stageCompleted).toBe(true);
    expect(attempt.nextPlayableStage).toBe(2);
    expect(attempt.nextStageUnlocked).toBe(2);
    expect(attempt.progressPct).toBe(100);
    expect(attempt.totalValidatingSessions).toBe(2);
  });

  it('updates dual-catch progress from d-prime sessions', () => {
    const config: JourneyConfig = {
      journeyId: 'dual-catch-journey',
      startLevel: 2,
      targetLevel: 5,
      gameMode: 'dual-catch',
    };
    const currentState = createEmptyJourneyState(5, 2, true);

    const attempt = decideJourneyAttempt({
      config,
      currentState,
      stageId: 1,
      session: {
        sessionId: 'catch-1',
        nLevel: 2,
        gameMode: 'dual-catch',
        finalStats: {
          globalDPrime: 2.5,
          byModality: {
            // @ts-expect-error test override
            position: { hits: 9, misses: 0, falseAlarms: 0, correctRejections: 11 },
          },
        },
      },
    });

    expect(attempt.score).toBeGreaterThanOrEqual(90);
    expect(attempt.isValidating).toBe(true);
    expect(attempt.progressPct).toBe(10);
  });

  it('maps dual-catch d-prime bands to the expected progress gains', () => {
    const config: JourneyConfig = {
      journeyId: 'dual-catch-journey',
      startLevel: 2,
      targetLevel: 5,
      gameMode: 'dual-catch',
    };
    const cases = [
      { dPrime: 2.0, expected: 8 },
      { dPrime: 1.5, expected: 7 },
      { dPrime: 1.0, expected: 4 },
      { dPrime: 0.2, expected: 1 },
    ];

    for (const testCase of cases) {
      const attempt = decideJourneyAttempt({
        config,
        currentState: createEmptyJourneyState(5, 2, true),
        stageId: 1,
        session: {
          sessionId: `catch-${testCase.dPrime}`,
          nLevel: 2,
          gameMode: 'dual-catch',
          finalStats: {
            globalDPrime: testCase.dPrime,
            byModality: {
              // @ts-expect-error test override
              position: { hits: 5, misses: 0, falseAlarms: 0, correctRejections: 5 },
            },
          },
        },
      });

      expect(attempt.progressPct).toBe(testCase.expected);
    }
  });

  it('resets hybrid loops to track after a stay decision', () => {
    const config: JourneyConfig = {
      journeyId: 'hybrid-journey',
      startLevel: 2,
      targetLevel: 5,
      gameMode: 'dual-track-dnb-hybrid',
    };
    const currentState: JourneyState = {
      ...createEmptyJourneyState(5, 2, true),
      currentStage: 1,
      nextSessionGameMode: 'dualnback-classic',
      stages: [
        {
          stageId: 1,
          status: 'unlocked',
          validatingSessions: 0,
          bestScore: 100,
          progressPct: 75,
          hybridProgress: {
            loopPhase: 'dnb',
            trackSessionsCompleted: 1,
            trackSessionsRequired: 1,
            dnbSessionsCompleted: 2,
            dnbSessionsRequired: 3,
            decisionZone: 'stay',
          },
        },
        ...createEmptyJourneyState(5, 2, true).stages.slice(1),
      ],
    };

    const attempt = decideJourneyAttempt({
      config,
      currentState,
      stageId: 1,
      session: {
        sessionId: 'dnb-stay-3',
        score: 75,
        gameMode: 'dualnback-classic',
      },
    });

    expect(attempt.stageCompleted).toBe(false);
    expect(attempt.nextPlayableStage).toBe(1);
    expect(attempt.nextSessionGameMode).toBe('dual-track');
    expect(attempt.journeyDecision).toBe('stay');
  });

  it('keeps hybrid journeys in DNB while a clean validation streak is still incomplete', () => {
    const config: JourneyConfig = {
      journeyId: 'hybrid-journey',
      startLevel: 2,
      targetLevel: 5,
      gameMode: 'dual-track-dnb-hybrid',
    };
    const currentState: JourneyState = {
      ...createEmptyJourneyState(5, 2, true),
      currentStage: 1,
      nextSessionGameMode: 'dualnback-classic',
      stages: [
        {
          stageId: 1,
          status: 'unlocked',
          validatingSessions: 0,
          bestScore: null,
          progressPct: 25,
          hybridProgress: {
            loopPhase: 'dnb',
            trackSessionsCompleted: 1,
            trackSessionsRequired: 1,
            dnbSessionsCompleted: 0,
            dnbSessionsRequired: 3,
          },
        },
        ...createEmptyJourneyState(5, 2, true).stages.slice(1),
      ],
    };

    const attempt = decideJourneyAttempt({
      config,
      currentState,
      stageId: 1,
      session: {
        sessionId: 'dnb-clean-1',
        nLevel: 2,
        gameMode: 'dualnback-classic',
        finalStats: {
          globalDPrime: 2.5,
          byModality: {
            // @ts-expect-error test override
            position: { hits: 6, misses: 0, falseAlarms: 0, correctRejections: 6 },
            // @ts-expect-error test override
            audio: { hits: 5, misses: 0, falseAlarms: 1, correctRejections: 6 },
          },
        },
      },
    });

    expect(attempt.stageCompleted).toBe(false);
    expect(attempt.nextSessionGameMode).toBe('dualnback-classic');
    expect(attempt.hybridProgress).toMatchObject({
      loopPhase: 'dnb',
      decisionZone: 'clean',
      decisionStreakCount: 1,
    });
  });

  it('classifies hybrid DNB medium-error sessions as stay zone', () => {
    const config: JourneyConfig = {
      journeyId: 'hybrid-journey',
      startLevel: 2,
      targetLevel: 5,
      gameMode: 'dual-track-dnb-hybrid',
    };
    const currentState: JourneyState = {
      ...createEmptyJourneyState(5, 2, true),
      currentStage: 1,
      nextSessionGameMode: 'dualnback-classic',
      stages: [
        {
          stageId: 1,
          status: 'unlocked',
          validatingSessions: 0,
          bestScore: null,
          progressPct: 25,
          hybridProgress: {
            loopPhase: 'dnb',
            trackSessionsCompleted: 1,
            trackSessionsRequired: 1,
            dnbSessionsCompleted: 0,
            dnbSessionsRequired: 3,
          },
        },
        ...createEmptyJourneyState(5, 2, true).stages.slice(1),
      ],
    };

    const attempt = decideJourneyAttempt({
      config,
      currentState,
      stageId: 1,
      session: {
        sessionId: 'dnb-stay-zone',
        nLevel: 2,
        gameMode: 'dualnback-classic',
        finalStats: {
          globalDPrime: 0.5,
          byModality: {
            // @ts-expect-error test override
            position: { hits: 5, misses: 1, falseAlarms: 1, correctRejections: 5 },
            // @ts-expect-error test override
            audio: { hits: 5, misses: 1, falseAlarms: 0, correctRejections: 5 },
          },
        },
      },
    });

    expect(attempt.hybridProgress).toMatchObject({
      decisionZone: 'stay',
    });
    expect(attempt.journeyDecision).toBe('pending-pair');
  });

  it('moves hybrid journeys down after a confirmed failure streak', () => {
    const config: JourneyConfig = {
      journeyId: 'hybrid-journey',
      startLevel: 2,
      targetLevel: 5,
      gameMode: 'dual-track-dnb-hybrid',
    };
    const currentState: JourneyState = {
      ...createEmptyJourneyState(5, 2, true),
      currentStage: 2,
      nextSessionGameMode: 'dualnback-classic',
      stages: [
        {
          stageId: 1,
          status: 'completed',
          validatingSessions: 1,
          bestScore: 100,
          progressPct: 100,
        },
        {
          stageId: 2,
          status: 'unlocked',
          validatingSessions: 0,
          bestScore: null,
          progressPct: 75,
          hybridProgress: {
            loopPhase: 'dnb',
            trackSessionsCompleted: 1,
            trackSessionsRequired: 1,
            dnbSessionsCompleted: 1,
            dnbSessionsRequired: 3,
            decisionZone: 'down',
            decisionStreakCount: 1,
            decisionStreakRequired: 2,
          },
        },
        ...createEmptyJourneyState(5, 2, true).stages.slice(2),
      ],
    };

    const attempt = decideJourneyAttempt({
      config,
      currentState,
      stageId: 2,
      session: {
        sessionId: 'dnb-down-2',
        nLevel: 3,
        gameMode: 'dualnback-classic',
        finalStats: {
          globalDPrime: 0,
          byModality: {
            // @ts-expect-error test override
            position: { hits: 1, misses: 4, falseAlarms: 2, correctRejections: 5 },
            // @ts-expect-error test override
            audio: { hits: 1, misses: 4, falseAlarms: 2, correctRejections: 5 },
          },
        },
      },
    });

    expect(attempt.nextPlayableStage).toBe(1);
    expect(attempt.nextSessionGameMode).toBe('dual-track');
    expect(attempt.journeyDecision).toBe('down');
  });

  it('completes the last hybrid stage with nextPlayableStage = null', () => {
    const config: JourneyConfig = {
      journeyId: 'hybrid-journey',
      startLevel: 2,
      targetLevel: 2,
      gameMode: 'dual-track-dnb-hybrid',
    };
    const currentState: JourneyState = {
      ...createEmptyJourneyState(2, 2, true),
      currentStage: 1,
      nextSessionGameMode: 'dualnback-classic',
      stages: [
        {
          stageId: 1,
          status: 'unlocked',
          validatingSessions: 0,
          bestScore: null,
          progressPct: 75,
          hybridProgress: {
            loopPhase: 'dnb',
            trackSessionsCompleted: 1,
            trackSessionsRequired: 1,
            dnbSessionsCompleted: 1,
            dnbSessionsRequired: 3,
            decisionZone: 'clean',
            decisionStreakCount: 1,
            decisionStreakRequired: 2,
          },
        },
      ],
      isActive: true,
      startLevel: 2,
      targetLevel: 2,
      isSimulator: true,
    };

    const attempt = decideJourneyAttempt({
      config,
      currentState,
      stageId: 1,
      session: {
        sessionId: 'dnb-last-up',
        nLevel: 2,
        gameMode: 'dualnback-classic',
        finalStats: {
          globalDPrime: 2.5,
          byModality: {
            // @ts-expect-error test override
            position: { hits: 6, misses: 0, falseAlarms: 0, correctRejections: 6 },
            // @ts-expect-error test override
            audio: { hits: 6, misses: 0, falseAlarms: 0, correctRejections: 6 },
          },
        },
      },
    });

    expect(attempt.stageCompleted).toBe(true);
    expect(attempt.nextPlayableStage).toBeNull();
    expect(attempt.nextStageUnlocked).toBeNull();
  });

  it('handles passive Jaeggi sessions with zero hits as stay unless errors are strictly down', () => {
    const config: JourneyConfig = {
      journeyId: 'classic-journey',
      startLevel: 2,
      targetLevel: 5,
      gameMode: 'dualnback-classic',
    };
    const currentState = createEmptyJourneyState(5, 2, true);

    const stayAttempt = decideJourneyAttempt({
      config,
      currentState,
      stageId: 1,
      session: {
        sessionId: 'passive-stay',
        nLevel: 2,
        gameMode: 'dualnback-classic',
        finalStats: {
          globalDPrime: 0,
          byModality: {
            // @ts-expect-error test override
            position: { hits: 0, misses: 2, falseAlarms: 0, correctRejections: 6 },
            // @ts-expect-error test override
            audio: { hits: 0, misses: 2, falseAlarms: 0, correctRejections: 6 },
          },
        },
      },
    });
    const downAttempt = decideJourneyAttempt({
      config,
      currentState,
      stageId: 1,
      session: {
        sessionId: 'passive-down',
        nLevel: 2,
        gameMode: 'dualnback-classic',
        finalStats: {
          globalDPrime: 0,
          byModality: {
            // @ts-expect-error test override
            position: { hits: 0, misses: 6, falseAlarms: 0, correctRejections: 6 },
            // @ts-expect-error test override
            audio: { hits: 0, misses: 6, falseAlarms: 0, correctRejections: 6 },
          },
        },
      },
    });

    expect(stayAttempt.journeyDecision).toBe('stay');
    expect(downAttempt.journeyDecision).toBe('down');
  });

  it('keeps Jaeggi stages on stay when errors are between 3 and 5 with real hits', () => {
    const config: JourneyConfig = {
      journeyId: 'classic-journey',
      startLevel: 2,
      targetLevel: 5,
      gameMode: 'dualnback-classic',
    };

    const attempt = decideJourneyAttempt({
      config,
      currentState: createEmptyJourneyState(5, 2, true),
      stageId: 1,
      session: {
        sessionId: 'jaeggi-stay',
        nLevel: 2,
        gameMode: 'dualnback-classic',
        finalStats: {
          globalDPrime: 1,
          byModality: {
            // @ts-expect-error test override
            position: { hits: 5, misses: 2, falseAlarms: 1, correctRejections: 6 },
            // @ts-expect-error test override
            audio: { hits: 5, misses: 2, falseAlarms: 1, correctRejections: 6 },
          },
        },
      },
    });

    expect(attempt.journeyDecision).toBe('stay');
    expect(attempt.stageCompleted).toBe(false);
  });

  it('suggests lower start level on BrainWorkshop floor regression', () => {
    const config: JourneyConfig = {
      journeyId: 'bw-journey',
      startLevel: 2,
      targetLevel: 5,
      gameMode: 'sim-brainworkshop',
    };
    const currentState: JourneyState = {
      ...createEmptyJourneyState(5, 2, true),
      currentStage: 1,
      consecutiveStrikes: 2,
    };

    const attempt = decideJourneyAttempt({
      config,
      currentState,
      stageId: 1,
      session: {
        sessionId: 'bw-down',
        nLevel: 2,
        gameMode: 'sim-brainworkshop',
        finalStats: {
          globalDPrime: 0,
          byModality: {
            // @ts-expect-error test override
            position: { hits: 1, misses: 5, falseAlarms: 2, correctRejections: 2 },
            // @ts-expect-error test override
            audio: { hits: 1, misses: 5, falseAlarms: 2, correctRejections: 2 },
          },
        },
      },
    });

    expect(attempt.nextPlayableStage).toBe(1);
    expect(attempt.suggestedStartLevel).toBe(1);
    expect(attempt.consecutiveStrikes).toBe(0);
  });

  it('advances BrainWorkshop stages and resets strikes on up scores', () => {
    const config: JourneyConfig = {
      journeyId: 'bw-journey',
      startLevel: 2,
      targetLevel: 5,
      gameMode: 'sim-brainworkshop',
    };
    const currentState: JourneyState = {
      ...createEmptyJourneyState(5, 2, true),
      currentStage: 1,
      consecutiveStrikes: 2,
    };

    const attempt = decideJourneyAttempt({
      config,
      currentState,
      stageId: 1,
      session: {
        sessionId: 'bw-up',
        nLevel: 2,
        gameMode: 'sim-brainworkshop',
        finalStats: {
          globalDPrime: 2.5,
          byModality: {
            // @ts-expect-error test override
            position: { hits: 8, misses: 0, falseAlarms: 0, correctRejections: 8 },
            // @ts-expect-error test override
            audio: { hits: 8, misses: 0, falseAlarms: 0, correctRejections: 8 },
          },
        },
      },
    });

    expect(attempt.stageCompleted).toBe(true);
    expect(attempt.nextPlayableStage).toBe(2);
    expect(attempt.consecutiveStrikes).toBe(0);
  });

  it('regresses BrainWorkshop to the previous stage when not at the floor', () => {
    const config: JourneyConfig = {
      journeyId: 'bw-journey',
      startLevel: 2,
      targetLevel: 5,
      gameMode: 'sim-brainworkshop',
    };
    const currentState: JourneyState = {
      ...createEmptyJourneyState(5, 2, true),
      currentStage: 2,
      consecutiveStrikes: 2,
      stages: [
        { stageId: 1, status: 'completed', validatingSessions: 1, bestScore: 100 },
        { stageId: 2, status: 'unlocked', validatingSessions: 0, bestScore: null },
        ...createEmptyJourneyState(5, 2, true).stages.slice(2),
      ],
    };

    const attempt = decideJourneyAttempt({
      config,
      currentState,
      stageId: 2,
      session: {
        sessionId: 'bw-down-prev-stage',
        nLevel: 3,
        gameMode: 'sim-brainworkshop',
        finalStats: {
          globalDPrime: 0,
          byModality: {
            // @ts-expect-error test override
            position: { hits: 1, misses: 5, falseAlarms: 2, correctRejections: 2 },
            // @ts-expect-error test override
            audio: { hits: 1, misses: 5, falseAlarms: 2, correctRejections: 2 },
          },
        },
      },
    });

    expect(attempt.nextPlayableStage).toBe(1);
    expect(attempt.suggestedStartLevel).toBeUndefined();
    expect(attempt.consecutiveStrikes).toBe(0);
  });

  it('keeps BrainWorkshop strikes unchanged on stay scores', () => {
    const config: JourneyConfig = {
      journeyId: 'bw-journey',
      startLevel: 2,
      targetLevel: 5,
      gameMode: 'sim-brainworkshop',
    };
    const currentState: JourneyState = {
      ...createEmptyJourneyState(5, 2, true),
      currentStage: 1,
      consecutiveStrikes: 1,
    };

    const attempt = decideJourneyAttempt({
      config,
      currentState,
      stageId: 1,
      session: {
        sessionId: 'bw-stay',
        nLevel: 2,
        gameMode: 'sim-brainworkshop',
        finalStats: {
          globalDPrime: 1.2,
          byModality: {
            // @ts-expect-error test override
            position: { hits: 6, misses: 2, falseAlarms: 2, correctRejections: 5 },
            // @ts-expect-error test override
            audio: { hits: 6, misses: 2, falseAlarms: 2, correctRejections: 5 },
          },
        },
      },
    });

    expect(attempt.nextPlayableStage).toBe(1);
    expect(attempt.consecutiveStrikes).toBe(1);
    expect(attempt.stageCompleted).toBe(false);
  });

  it('falls back to score-only Jaeggi decisions for precomputed sessions', () => {
    const config: JourneyConfig = {
      journeyId: 'classic-journey',
      startLevel: 2,
      targetLevel: 5,
      gameMode: 'dualnback-classic',
    };
    const currentState = createEmptyJourneyState(5, 2, true);

    const stayAttempt = decideJourneyAttempt({
      config,
      currentState,
      stageId: 1,
      session: {
        sessionId: 'score-only-stay',
        score: 70,
        gameMode: 'dualnback-classic',
      },
    });
    const downAttempt = decideJourneyAttempt({
      config,
      currentState,
      stageId: 1,
      session: {
        sessionId: 'score-only-down',
        score: 40,
        gameMode: 'dualnback-classic',
      },
    });

    expect(stayAttempt.journeyDecision).toBe('stay');
    expect(downAttempt.journeyDecision).toBe('down');
  });
});
