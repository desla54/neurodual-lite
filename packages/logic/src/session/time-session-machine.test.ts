import { describe, expect, it } from 'bun:test';
import {
  analyzeTimeSpeed,
  buildTimeSessionSummary,
  createInitialTimeSessionState,
  transitionTimeSessionMachine,
  type TimeSessionMachineConfig,
} from './time-session-machine';

const CONFIG: TimeSessionMachineConfig = {
  totalTrials: 2,
  targetDurationMs: 1_000,
  estimationEnabled: true,
  sliderShape: 'circle',
  sliderDirection: 'reverse',
  playContext: 'free',
};

describe('time-session-machine', () => {
  it('starts a session once and emits the start draft with config', () => {
    const initialState = createInitialTimeSessionState();
    const transition = transitionTimeSessionMachine(
      initialState,
      {
        type: 'BEGIN_TRIAL',
        timestamp: 1_000,
        userId: 'user-1',
        device: {
          platform: 'web',
          screenWidth: 100,
          screenHeight: 100,
          userAgent: 'test',
          touchCapable: true,
          volumeLevel: null,
          appVersion: 'test',
        },
        context: {
          timeOfDay: 'morning',
          localHour: 9,
          dayOfWeek: 1,
          timezone: 'Europe/Paris',
        },
      },
      CONFIG,
    );

    expect(transition.state.sessionStarted).toBe(true);
    expect(transition.state.startedAtMs).toBe(1_000);
    expect(transition.state.trialPhase).toBe('sliding');
    expect(transition.eventDrafts).toHaveLength(1);
    expect(transition.eventDrafts[0]).toMatchObject({
      type: 'TIME_SESSION_STARTED',
      userId: 'user-1',
      config: {
        trialsCount: 2,
        targetDurationMs: 1_000,
        estimationEnabled: true,
        sliderShape: 'circle',
        sliderDirection: 'reverse',
      },
    });

    const secondStart = transitionTimeSessionMachine(
      transition.state,
      {
        type: 'BEGIN_TRIAL',
        timestamp: 1_100,
        userId: 'user-1',
        device: {
          platform: 'web',
          screenWidth: 100,
          screenHeight: 100,
          userAgent: 'test',
          touchCapable: true,
          volumeLevel: null,
          appVersion: 'test',
        },
        context: {
          timeOfDay: 'morning',
          localHour: 9,
          dayOfWeek: 1,
          timezone: 'Europe/Paris',
        },
      },
      CONFIG,
    );

    expect(secondStart.eventDrafts).toHaveLength(0);
  });

  it('records a completed trial after estimation and finalizes the session on the last trial', () => {
    const started = transitionTimeSessionMachine(
      createInitialTimeSessionState(),
      {
        type: 'BEGIN_TRIAL',
        timestamp: 1_000,
        userId: 'user-1',
        device: {
          platform: 'web',
          screenWidth: 100,
          screenHeight: 100,
          userAgent: 'test',
          touchCapable: true,
          volumeLevel: null,
          appVersion: 'test',
        },
        context: {
          timeOfDay: 'morning',
          localHour: 9,
          dayOfWeek: 1,
          timezone: 'Europe/Paris',
        },
      },
      CONFIG,
    );
    const slideCompleted = transitionTimeSessionMachine(
      started.state,
      {
        type: 'COMPLETE_SLIDE',
        durationMs: 920,
        samples: [
          { position: 0, time: 0 },
          { position: 0.5, time: 480 },
          { position: 1, time: 920 },
        ],
      },
      CONFIG,
    );

    expect(slideCompleted.state.trialPhase).toBe('estimating');
    expect(slideCompleted.eventDrafts).toHaveLength(0);

    const estimated = transitionTimeSessionMachine(
      slideCompleted.state,
      {
        type: 'SUBMIT_ESTIMATION',
        estimatedMs: 980,
      },
      CONFIG,
    );

    expect(estimated.state.results).toHaveLength(1);
    expect(estimated.state.trialPhase).toBe('feedback');
    expect(estimated.eventDrafts).toHaveLength(1);
    expect(estimated.eventDrafts[0]).toMatchObject({
      type: 'TIME_TRIAL_COMPLETED',
      trialIndex: 0,
      estimatedMs: 980,
    });

    const secondTrial = transitionTimeSessionMachine(
      {
        ...estimated.state,
        trialIndex: 1,
        trialPhase: 'feedback',
        results: [
          ...estimated.state.results,
          {
            durationMs: 1_100,
            estimatedMs: null,
            segments: [],
            accuracyScore: 60,
            regularityScore: 55,
          },
        ],
      },
      {
        type: 'NEXT_TRIAL',
        timestamp: 6_000,
      },
      CONFIG,
    );

    expect(secondTrial.state.sessionPhase).toBe('finished');
    expect(secondTrial.state.sessionEndReason).toBe('completed');
    expect(secondTrial.eventDrafts).toHaveLength(1);
    expect(secondTrial.eventDrafts[0]).toMatchObject({
      type: 'TIME_SESSION_ENDED',
      reason: 'completed',
      totalTrials: 2,
      trialsCompleted: 2,
      durationMs: 5_000,
    });
    expect(secondTrial.completionDraft).toMatchObject({
      reason: 'completed',
      totalTrials: 2,
      trialsCompleted: 2,
      successfulTrials: 1,
      failedTrials: 1,
      durationMs: 5_000,
    });
  });

  it('does not emit a session end when abandoning before the session starts', () => {
    const transition = transitionTimeSessionMachine(
      createInitialTimeSessionState(),
      {
        type: 'ABANDON',
        timestamp: 1_500,
      },
      CONFIG,
    );

    expect(transition.state.sessionPhase).toBe('finished');
    expect(transition.state.sessionEndReason).toBe('abandoned');
    expect(transition.eventDrafts).toHaveLength(0);
    expect(transition.completionDraft).toBeUndefined();
  });
});

describe('analyzeTimeSpeed', () => {
  it('uses the target duration as the regularity reference', () => {
    const segments = analyzeTimeSpeed(
      [
        { position: 0, time: 0 },
        { position: 0.5, time: 500 },
        { position: 1, time: 1_500 },
      ],
      1_000,
    );

    const summary = buildTimeSessionSummary(
      [
        {
          durationMs: 1_500,
          estimatedMs: null,
          segments,
          accuracyScore: 50,
          regularityScore: 0,
        },
      ],
      1_000,
    );

    expect(segments.some((segment) => segment.category !== 0)).toBe(true);
    expect(summary.successfulTrials).toBe(0);
    expect(summary.failedTrials).toBe(1);
  });
});
