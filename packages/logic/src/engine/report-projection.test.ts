import { describe, expect, test } from 'bun:test';
import { projectSessionReportFromEvents } from './report-projection';
import { createMockEvent } from '../test-utils/test-factories';
import type { GameEvent } from './events';

function createBwTempoTrial(index: number, isTarget: boolean): Record<string, unknown> {
  return {
    index,
    isBuffer: false,
    position: index % 9,
    sound: 'C',
    color: 'ink-black',
    image: 'diamond',
    trialType: isTarget ? 'Dual' : 'Non-Cible',
    isPositionTarget: isTarget,
    isSoundTarget: false,
    isColorTarget: false,
    isImageTarget: false,
    isPositionLure: false,
    isSoundLure: false,
    isColorLure: false,
    isImageLure: false,
    positionLureType: undefined,
    soundLureType: undefined,
    colorLureType: undefined,
    imageLureType: undefined,
  };
}

function createBwTempoEvents(sessionId: string): GameEvent[] {
  return [
    createMockEvent('SESSION_STARTED', {
      sessionId,
      userId: 'local',
      timestamp: 1000,
      nLevel: 2,
      gameMode: 'sim-brainworkshop',
      device: {
        platform: 'web',
        screenWidth: 1920,
        screenHeight: 1080,
        userAgent: 'test',
        touchCapable: false,
      },
      context: { timeOfDay: 'morning', localHour: 10, dayOfWeek: 1, timezone: 'UTC' },
      config: {
        nLevel: 2,
        activeModalities: ['position'],
        trialsCount: 3,
        targetProbability: 0.3,
        lureProbability: 0.1,
        intervalSeconds: 3,
        stimulusDurationSeconds: 0.5,
        generator: 'BrainWorkshop',
      },
    }),
    // trial 0: target + response -> hit
    createMockEvent('TRIAL_PRESENTED', {
      sessionId,
      timestamp: 2000,
      trial: createBwTempoTrial(0, true) as any,
      isiMs: 3000,
      stimulusDurationMs: 500,
    }),
    createMockEvent('USER_RESPONDED', {
      sessionId,
      timestamp: 2400,
      trialIndex: 0,
      modality: 'position',
      reactionTimeMs: 400,
      pressDurationMs: 120,
      responsePhase: 'during_stimulus',
    }),
    // trial 1: non-target + response -> false alarm
    createMockEvent('TRIAL_PRESENTED', {
      sessionId,
      timestamp: 5000,
      trial: createBwTempoTrial(1, false) as any,
      isiMs: 3000,
      stimulusDurationMs: 500,
    }),
    createMockEvent('USER_RESPONDED', {
      sessionId,
      timestamp: 5400,
      trialIndex: 1,
      modality: 'position',
      reactionTimeMs: 400,
      pressDurationMs: 120,
      responsePhase: 'during_stimulus',
    }),
    // trial 2: target + no response -> miss
    createMockEvent('TRIAL_PRESENTED', {
      sessionId,
      timestamp: 8000,
      trial: createBwTempoTrial(2, true) as any,
      isiMs: 3000,
      stimulusDurationMs: 500,
    }),
    createMockEvent('SESSION_ENDED', {
      sessionId,
      timestamp: 9000,
      reason: 'completed',
    }),
  ];
}

function createDualClassicTempoTrial(index: number, isTarget = true): Record<string, unknown> {
  return {
    index,
    isBuffer: false,
    position: index % 9,
    sound: 'C',
    color: 'ink-black',
    image: 'diamond',
    trialType: isTarget ? 'Dual' : 'Non-Cible',
    isPositionTarget: isTarget,
    isSoundTarget: isTarget,
    isColorTarget: false,
    isImageTarget: false,
    isPositionLure: false,
    isSoundLure: false,
    isColorLure: false,
    isImageLure: false,
    positionLureType: undefined,
    soundLureType: undefined,
    colorLureType: undefined,
    imageLureType: undefined,
  };
}

function createDualClassicJourneyFloorRegressionEvents(sessionId: string): GameEvent[] {
  return [
    createMockEvent('SESSION_STARTED', {
      sessionId,
      userId: 'local',
      timestamp: 1000,
      nLevel: 2,
      gameMode: 'dualnback-classic',
      playContext: 'journey',
      journeyId: 'dualnback-classic-journey',
      journeyStageId: 1,
      journeyStartLevel: 2,
      journeyTargetLevel: 5,
      journeyGameMode: 'dualnback-classic',
      device: {
        platform: 'web',
        screenWidth: 1920,
        screenHeight: 1080,
        userAgent: 'test',
        touchCapable: false,
      },
      context: { timeOfDay: 'morning', localHour: 10, dayOfWeek: 1, timezone: 'UTC' },
      config: {
        nLevel: 2,
        activeModalities: ['position', 'audio'],
        trialsCount: 6,
        targetProbability: 0.3,
        lureProbability: 0,
        intervalSeconds: 3,
        stimulusDurationSeconds: 0.5,
        generator: 'DualnbackClassic',
      },
    }),
    createMockEvent('TRIAL_PRESENTED', {
      sessionId,
      timestamp: 2000,
      trial: createDualClassicTempoTrial(0) as any,
      isiMs: 3000,
      stimulusDurationMs: 500,
    }),
    createMockEvent('TRIAL_PRESENTED', {
      sessionId,
      timestamp: 5000,
      trial: createDualClassicTempoTrial(1) as any,
      isiMs: 3000,
      stimulusDurationMs: 500,
    }),
    createMockEvent('TRIAL_PRESENTED', {
      sessionId,
      timestamp: 8000,
      trial: createDualClassicTempoTrial(2) as any,
      isiMs: 3000,
      stimulusDurationMs: 500,
    }),
    createMockEvent('TRIAL_PRESENTED', {
      sessionId,
      timestamp: 11000,
      trial: createDualClassicTempoTrial(3) as any,
      isiMs: 3000,
      stimulusDurationMs: 500,
    }),
    createMockEvent('TRIAL_PRESENTED', {
      sessionId,
      timestamp: 14000,
      trial: createDualClassicTempoTrial(4) as any,
      isiMs: 3000,
      stimulusDurationMs: 500,
    }),
    createMockEvent('TRIAL_PRESENTED', {
      sessionId,
      timestamp: 17000,
      trial: createDualClassicTempoTrial(5) as any,
      isiMs: 3000,
      stimulusDurationMs: 500,
    }),
    createMockEvent('SESSION_ENDED', {
      sessionId,
      timestamp: 20000,
      reason: 'completed',
      playContext: 'journey',
      journeyId: 'dualnback-classic-journey',
      journeyStageId: 1,
    }),
    createMockEvent('JOURNEY_TRANSITION_DECIDED', {
      sessionId,
      timestamp: 20100,
      journeyId: 'dualnback-classic-journey',
      journeyStartLevel: 1,
      journeyTargetLevel: 5,
      stageId: 1,
      stageMode: 'simulator',
      nLevel: 2,
      journeyName: 'Dual Classic',
      journeyGameMode: 'dualnback-classic',
      upsThreshold: 80,
      isValidating: false,
      validatingSessions: 0,
      sessionsRequired: 1,
      stageCompleted: false,
      nextStageUnlocked: null,
      nextPlayableStage: 1,
      suggestedStartLevel: 1,
    }),
  ];
}

describe('projectSessionReportFromEvents (Brain Workshop strikes)', () => {
  test('free mode projects brainWorkshop strikes with default strikesBefore=0', () => {
    const sessionId = 'bw-free-1';
    const events = createBwTempoEvents(sessionId);

    const report = projectSessionReportFromEvents({ sessionId, events, modeHint: 'tempo' });
    expect(report?.gameMode).toBe('sim-brainworkshop');
    expect(report?.brainWorkshop).toEqual({
      strikesBefore: 0,
      strikesAfter: 1,
      strikesToDown: 3,
    });
  });

  test('free mode counts strikes at N=1 (no downward level, but strikes still accumulate)', () => {
    const sessionId = 'bw-free-n1-1';
    const events = createBwTempoEvents(sessionId).map((e) =>
      e.type === 'SESSION_STARTED'
        ? ({
            ...e,
            nLevel: 1,
            config: { ...e.config, nLevel: 1 },
          } as GameEvent)
        : e,
    );

    const report = projectSessionReportFromEvents({ sessionId, events, modeHint: 'tempo' });
    expect(report?.gameMode).toBe('sim-brainworkshop');
    expect(report?.brainWorkshop).toEqual({
      strikesBefore: 0,
      strikesAfter: 1,
      strikesToDown: 3,
    });
  });

  test('journey mode derives strikes from journeyContext (authoritative)', () => {
    const sessionId = 'bw-journey-1';
    const events = [
      ...createBwTempoEvents(sessionId).map((e) =>
        e.type === 'SESSION_STARTED' ? ({ ...e, playContext: 'journey' as const } as GameEvent) : e,
      ),
      createMockEvent('JOURNEY_TRANSITION_DECIDED', {
        sessionId,
        timestamp: 9100,
        journeyStartLevel: 2,
        journeyTargetLevel: 5,
        stageId: 2,
        stageMode: 'simulator',
        nLevel: 2,
        journeyName: 'Brain Workshop',
        upsThreshold: 80,
        isValidating: false,
        validatingSessions: 0,
        sessionsRequired: 1,
        stageCompleted: false,
        nextStageUnlocked: null,
        nextPlayableStage: 2,
        consecutiveStrikes: 2,
      }),
    ] satisfies GameEvent[];

    const report = projectSessionReportFromEvents({ sessionId, events, modeHint: 'tempo' });
    expect(report?.gameMode).toBe('sim-brainworkshop');
    expect(report?.brainWorkshop).toEqual({
      strikesBefore: 1,
      strikesAfter: 2,
      strikesToDown: 3,
    });
  });

  test('journey mode derives strikesBefore at N=1 from journeyContext (authoritative)', () => {
    const sessionId = 'bw-journey-n1-1';
    const events = [
      ...createBwTempoEvents(sessionId).map((e) =>
        e.type === 'SESSION_STARTED'
          ? ({
              ...e,
              playContext: 'journey' as const,
              nLevel: 1,
              config: { ...e.config, nLevel: 1 },
            } as GameEvent)
          : e,
      ),
      createMockEvent('JOURNEY_TRANSITION_DECIDED', {
        sessionId,
        timestamp: 9100,
        journeyStartLevel: 1,
        journeyTargetLevel: 5,
        stageId: 1,
        stageMode: 'simulator',
        nLevel: 1,
        journeyName: 'Brain Workshop',
        upsThreshold: 80,
        isValidating: false,
        validatingSessions: 0,
        sessionsRequired: 1,
        stageCompleted: false,
        nextStageUnlocked: null,
        nextPlayableStage: 1,
        consecutiveStrikes: 1,
      }),
    ] satisfies GameEvent[];

    const report = projectSessionReportFromEvents({ sessionId, events, modeHint: 'tempo' });
    expect(report?.gameMode).toBe('sim-brainworkshop');
    expect(report?.brainWorkshop).toEqual({
      strikesBefore: 0,
      strikesAfter: 1,
      strikesToDown: 3,
    });
  });
});

describe('projectSessionReportFromEvents (Dual Classic journey floor regression)', () => {
  test('keeps suggestedStartLevel in journeyContext when N=1 expansion is required', () => {
    const sessionId = 'dualclassic-journey-floor-1';
    const events = createDualClassicJourneyFloorRegressionEvents(sessionId);

    const report = projectSessionReportFromEvents({ sessionId, events, modeHint: 'tempo' });
    expect(report?.gameMode).toBe('dualnback-classic');
    expect(report?.journeyId).toBe('dualnback-classic-journey');
    expect(report?.journeyStageId).toBe(1);
    expect(report?.journeyContext).toMatchObject({
      journeyId: 'dualnback-classic-journey',
      stageId: 1,
      nLevel: 2,
      nextPlayableStage: 1,
      suggestedStartLevel: 1,
    });
  });
});

describe('projectSessionReportFromEvents (Corsi)', () => {
  test('includes detailed turns for Corsi session reports', () => {
    const sessionId = 'corsi-report-1';
    const events = [
      createMockEvent('CORSI_SESSION_STARTED', {
        sessionId,
        timestamp: 1000,
        userId: 'local',
        config: {
          startSpan: 2,
          maxConsecutiveFailures: 2,
          direction: 'forward',
        },
        device: {
          platform: 'web',
          screenWidth: 1440,
          screenHeight: 900,
          userAgent: 'test',
          touchCapable: true,
        },
        context: {
          timeOfDay: 'morning',
          localHour: 9,
          dayOfWeek: 1,
          timezone: 'Europe/Paris',
        },
      }),
      createMockEvent('CORSI_TRIAL_COMPLETED', {
        sessionId,
        timestamp: 2000,
        trialIndex: 0,
        span: 2,
        sequence: [0, 4],
        recalled: [0, 4],
        correct: true,
        responseTimeMs: 900,
      }),
      createMockEvent('CORSI_TRIAL_COMPLETED', {
        sessionId,
        timestamp: 4000,
        trialIndex: 1,
        span: 3,
        sequence: [1, 4, 8],
        recalled: [1, 5, 8],
        correct: false,
        responseTimeMs: 1200,
      }),
      createMockEvent('CORSI_SESSION_ENDED', {
        sessionId,
        timestamp: 5000,
        reason: 'completed',
        totalTrials: 2,
        correctTrials: 1,
        maxSpan: 2,
        score: 50,
        durationMs: 4000,
      }),
    ] satisfies GameEvent[];

    // @ts-expect-error test override
    const report = projectSessionReportFromEvents({ sessionId, events, modeHint: 'corsi' });

    expect(report?.gameMode).toBe('corsi-block');
    expect(report?.turns).toHaveLength(2);
    expect(report?.turns?.[0]?.detail.kind).toBe('corsi-trial');
    expect(report?.turns?.[1]?.errorTags).toContain('order-error');
  });
});

describe('projectSessionReportFromEvents (Journey transition event)', () => {
  test('prefers JOURNEY_TRANSITION_DECIDED when reconstructing journey context', () => {
    const sessionId = 'tempo-journey-transition-1';
    const events = [
      ...createDualClassicJourneyFloorRegressionEvents(sessionId),
      createMockEvent('JOURNEY_TRANSITION_DECIDED', {
        sessionId,
        timestamp: 20200,
        journeyId: 'dual-track-dnb-journey',
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
      }) as GameEvent,
    ];

    const report = projectSessionReportFromEvents({
      sessionId,
      events,
      gameMode: 'dualnback-classic',
      gameModeLabelResolver: (mode) => mode,
    });

    expect(report?.journeyContext).toMatchObject({
      journeyId: 'dual-track-dnb-journey',
      journeyGameMode: 'dual-track-dnb-hybrid',
      nextSessionGameMode: 'dual-track',
      journeyDecision: 'pending-pair',
      journeyProtocol: 'hybrid-jaeggi',
    });
  });
});
