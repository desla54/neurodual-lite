import { describe, expect, it } from 'bun:test';
import { createMockEvent } from '../test-utils/test-factories';
import { projectSessionReportFromEvents } from './report-projection';
import { SessionCompletionProjector } from './session-completion-projector';
import { projectTrackSessionToSummaryInput } from './session-summary-input-projectors';
import { projectTrackSessionFromEvents } from './track-session-projection';
import type { GameEvent } from './events';
import { UPSProjector } from './ups-projector';

function createTrackSessionEvents(sessionId = 'track-session-1'): GameEvent[] {
  return [
    createMockEvent('MOT_SESSION_STARTED', {
      id: 'mot-start',
      eventId: 'mot-start',
      seq: 0,
      timestamp: 1_000,
      occurredAtMs: 1_000,
      monotonicMs: 0,
      sessionId,
      userId: 'user-1',
      gameMode: 'dual-track',
      playContext: 'free',
      config: {
        trialsCount: 4,
        totalObjects: 8,
        targetCount: 3,
        highlightDurationMs: 2_000,
        trackingDurationMs: 5_000,
        speedPxPerSec: 160,
        motionComplexity: 'standard',
        crowdingMode: 'standard',
        crowdingThresholdPx: 70,
        minSeparationPx: 52,
        arenaWidthPx: 820,
        arenaHeightPx: 560,
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
      adaptivePath: {
        targetCountStage: 2,
        difficultyTier: 1,
        tierCount: 5,
        stageProgressPct: 36,
        highestCompletedTargetCount: 0,
      },
    }),
    createMockEvent('MOT_TRIAL_DEFINED', {
      id: 'mot-trial-def-1',
      eventId: 'mot-trial-def-1',
      seq: 1,
      timestamp: 1_400,
      occurredAtMs: 1_400,
      monotonicMs: 400,
      sessionId,
      trialIndex: 0,
      trialSeed: 'track-seed-1',
      arenaWidthPx: 820,
      arenaHeightPx: 560,
      totalObjects: 8,
      targetCount: 3,
      initialObjects: [
        {
          x: 120,
          y: 140,
          speedPxPerSec: 150,
          headingRad: 0.25,
          turnRateRadPerSec: 0.12,
          turnJitterTimerMs: 900,
          minTurnIntervalMs: 800,
          maxTurnIntervalMs: 1500,
          maxTurnRateRadPerSec: 0.8,
          rngSeed: 'track-seed-1:ball:0',
        },
      ],
    }),
    createMockEvent('MOT_TRIAL_COMPLETED', {
      id: 'mot-trial-1',
      eventId: 'mot-trial-1',
      seq: 2,
      timestamp: 2_400,
      occurredAtMs: 2_400,
      monotonicMs: 1_400,
      sessionId,
      trialIndex: 0,
      targetIndices: [0, 3, 5],
      selectedIndices: [0, 3, 6],
      correctCount: 2,
      totalTargets: 3,
      accuracy: 2 / 3,
      responseTimeMs: 850,
      crowdingEvents: 3,
      minInterObjectDistancePx: 66,
      adaptivePath: {
        targetCountStage: 2,
        difficultyTier: 1,
        tierCount: 5,
        stageProgressPct: 36,
        highestCompletedTargetCount: 0,
      },
    }),
    createMockEvent('MOT_TRIAL_DEFINED', {
      id: 'mot-trial-def-2',
      eventId: 'mot-trial-def-2',
      seq: 3,
      timestamp: 3_000,
      occurredAtMs: 3_000,
      monotonicMs: 2_000,
      sessionId,
      trialIndex: 1,
      trialSeed: 'track-seed-2',
      arenaWidthPx: 820,
      arenaHeightPx: 560,
      totalObjects: 8,
      targetCount: 3,
      initialObjects: [
        {
          x: 220,
          y: 240,
          speedPxPerSec: 158,
          headingRad: 0.6,
          turnRateRadPerSec: 0.1,
          turnJitterTimerMs: 850,
          minTurnIntervalMs: 800,
          maxTurnIntervalMs: 1500,
          maxTurnRateRadPerSec: 0.8,
          rngSeed: 'track-seed-2:ball:0',
        },
      ],
    }),
    createMockEvent('MOT_TRIAL_COMPLETED', {
      id: 'mot-trial-2',
      eventId: 'mot-trial-2',
      seq: 4,
      timestamp: 4_100,
      occurredAtMs: 4_100,
      monotonicMs: 3_100,
      sessionId,
      trialIndex: 1,
      targetIndices: [1, 4, 7],
      selectedIndices: [1, 4, 7],
      correctCount: 3,
      totalTargets: 3,
      accuracy: 1,
      responseTimeMs: 620,
      crowdingEvents: 2,
      minInterObjectDistancePx: 72,
      adaptivePath: {
        targetCountStage: 2,
        difficultyTier: 1,
        tierCount: 5,
        stageProgressPct: 36,
        highestCompletedTargetCount: 0,
      },
    }),
    createMockEvent('MOT_SESSION_ENDED', {
      id: 'mot-end',
      eventId: 'mot-end',
      seq: 5,
      timestamp: 6_500,
      occurredAtMs: 6_500,
      monotonicMs: 5_500,
      sessionId,
      reason: 'completed',
      totalTrials: 4,
      correctTrials: 1,
      accuracy: 5 / 6,
      score: 83,
      durationMs: 4_800,
      playContext: 'free',
      adaptivePath: {
        targetCountStage: 2,
        difficultyTier: 2,
        tierCount: 5,
        stageProgressPct: 48,
        highestCompletedTargetCount: 0,
        nextTargetCountStage: 2,
        nextDifficultyTier: 2,
        progressDeltaPct: 12,
        promotedTargetCount: false,
        tierChanged: true,
        performanceBand: 'solid',
        completed: false,
      },
    }),
  ];
}

describe('projectTrackSessionFromEvents', () => {
  it('projects MOT totals with hits, misses and false alarms', () => {
    const projection = projectTrackSessionFromEvents(createTrackSessionEvents());

    expect(projection).not.toBeNull();
    expect(projection?.totalHits).toBe(5);
    expect(projection?.totalMisses).toBe(1);
    expect(projection?.totalFalseAlarms).toBe(1);
    expect(projection?.totalCorrectRejections).toBe(9);
    expect(projection?.accuracyPercent).toBeCloseTo(83.333333, 4);
    expect(projection?.passed).toBe(true);
    expect(projection?.masteryStageProgressPct).toBe(48);
    expect(projection?.masteryDifficultyTier).toBe(2);
  });

  it('does not count target-to-target swaps as false alarms in color identity mode', () => {
    const sessionId = 'track-identity-session';
    const events: GameEvent[] = [
      createMockEvent('MOT_SESSION_STARTED', {
        id: 'mot-start-identity',
        eventId: 'mot-start-identity',
        seq: 0,
        timestamp: 1_000,
        occurredAtMs: 1_000,
        monotonicMs: 0,
        sessionId,
        userId: 'user-1',
        gameMode: 'dual-track',
        playContext: 'free',
        config: {
          trialsCount: 1,
          totalObjects: 6,
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
      }),
      createMockEvent('MOT_TRIAL_COMPLETED', {
        id: 'mot-trial-identity',
        eventId: 'mot-trial-identity',
        seq: 1,
        timestamp: 2_400,
        occurredAtMs: 2_400,
        monotonicMs: 1_400,
        sessionId,
        trialIndex: 0,
        targetIndices: [1, 4],
        selectedIndices: [4, 1],
        correctCount: 0,
        totalTargets: 2,
        accuracy: 0,
        identityPromptColorIds: ['red', 'green'],
        responseTimeMs: 850,
        crowdingEvents: 0,
        minInterObjectDistancePx: 66,
      }),
      createMockEvent('MOT_SESSION_ENDED', {
        id: 'mot-end-identity',
        eventId: 'mot-end-identity',
        seq: 2,
        timestamp: 4_000,
        occurredAtMs: 4_000,
        monotonicMs: 3_000,
        sessionId,
        reason: 'completed',
        totalTrials: 1,
        correctTrials: 0,
        accuracy: 0,
        score: 0,
        durationMs: 3_000,
        playContext: 'free',
      }),
    ];

    const projection = projectTrackSessionFromEvents(events);
    const report = projectSessionReportFromEvents({
      sessionId,
      events,
      modeHint: 'track',
    });

    expect(projection?.totalHits).toBe(0);
    expect(projection?.totalMisses).toBe(2);
    expect(projection?.totalFalseAlarms).toBe(0);
    expect(report?.totals.falseAlarms).toBe(0);
    const detail = report?.turns?.[0]?.detail;
    expect(detail?.kind === 'track-trial' ? detail.falseAlarms : null).toBe(0);
  });

  it('does not count target-to-target swaps as false alarms in letter identity mode', () => {
    const sessionId = 'track-letter-identity-session';
    const events: GameEvent[] = [
      createMockEvent('MOT_SESSION_STARTED', {
        id: 'mot-start-letter-identity',
        eventId: 'mot-start-letter-identity',
        seq: 0,
        timestamp: 1_000,
        occurredAtMs: 1_000,
        monotonicMs: 0,
        sessionId,
        userId: 'user-1',
        gameMode: 'dual-track',
        playContext: 'free',
        config: {
          trialsCount: 1,
          totalObjects: 6,
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
      }),
      createMockEvent('MOT_TRIAL_COMPLETED', {
        id: 'mot-trial-letter-identity',
        eventId: 'mot-trial-letter-identity',
        seq: 1,
        timestamp: 2_400,
        occurredAtMs: 2_400,
        monotonicMs: 1_400,
        sessionId,
        trialIndex: 0,
        targetIndices: [1, 4],
        selectedIndices: [4, 1],
        correctCount: 0,
        totalTargets: 2,
        accuracy: 0,
        identityPromptLetters: ['C', 'H'],
        responseTimeMs: 850,
        crowdingEvents: 0,
        minInterObjectDistancePx: 66,
      }),
      createMockEvent('MOT_SESSION_ENDED', {
        id: 'mot-end-letter-identity',
        eventId: 'mot-end-letter-identity',
        seq: 2,
        timestamp: 4_000,
        occurredAtMs: 4_000,
        monotonicMs: 3_000,
        sessionId,
        reason: 'completed',
        totalTrials: 1,
        correctTrials: 0,
        accuracy: 0,
        score: 0,
        durationMs: 3_000,
        playContext: 'free',
      }),
    ];

    const projection = projectTrackSessionFromEvents(events);
    const report = projectSessionReportFromEvents({
      sessionId,
      events,
      modeHint: 'track',
    });

    expect(projection?.totalHits).toBe(0);
    expect(projection?.totalMisses).toBe(2);
    expect(projection?.totalFalseAlarms).toBe(0);
    expect(report?.totals.falseAlarms).toBe(0);
    const detail = report?.turns?.[0]?.detail;
    expect(detail?.kind === 'track-trial' ? detail.falseAlarms : null).toBe(0);
  });

  it('does not count target-to-target swaps as false alarms in tone identity mode', () => {
    const sessionId = 'track-tone-identity-session';
    const events: GameEvent[] = [
      createMockEvent('MOT_SESSION_STARTED', {
        id: 'mot-start-tone-identity',
        eventId: 'mot-start-tone-identity',
        seq: 0,
        timestamp: 1_000,
        occurredAtMs: 1_000,
        monotonicMs: 0,
        sessionId,
        userId: 'user-1',
        gameMode: 'dual-track',
        playContext: 'free',
        config: {
          trialsCount: 1,
          totalObjects: 6,
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
      }),
      createMockEvent('MOT_TRIAL_COMPLETED', {
        id: 'mot-trial-tone-identity',
        eventId: 'mot-trial-tone-identity',
        seq: 1,
        timestamp: 2_400,
        occurredAtMs: 2_400,
        monotonicMs: 1_400,
        sessionId,
        trialIndex: 0,
        targetIndices: [1, 4],
        selectedIndices: [4, 1],
        correctCount: 0,
        totalTargets: 2,
        accuracy: 0,
        identityPromptTones: ['C4', 'E4'],
        selectionPromptOrder: [0, 1],
        responseTimeMs: 850,
        crowdingEvents: 0,
        minInterObjectDistancePx: 66,
      }),
      createMockEvent('MOT_SESSION_ENDED', {
        id: 'mot-end-tone-identity',
        eventId: 'mot-end-tone-identity',
        seq: 2,
        timestamp: 4_000,
        occurredAtMs: 4_000,
        monotonicMs: 3_000,
        sessionId,
        reason: 'completed',
        totalTrials: 1,
        correctTrials: 0,
        accuracy: 0,
        score: 0,
        durationMs: 3_000,
        playContext: 'free',
      }),
    ];

    const projection = projectTrackSessionFromEvents(events);
    const report = projectSessionReportFromEvents({
      sessionId,
      events,
      modeHint: 'track',
    });

    expect(projection?.totalHits).toBe(0);
    expect(projection?.totalMisses).toBe(2);
    expect(projection?.totalFalseAlarms).toBe(0);
    expect(report?.totals.falseAlarms).toBe(0);
    const detail = report?.turns?.[0]?.detail;
    expect(detail?.kind === 'track-trial' ? detail.falseAlarms : null).toBe(0);
  });
});

describe('dual-track projector alignment', () => {
  it('credits calibration summaries to the configured calibration modality', () => {
    const sessionId = 'track-session-calibration-semantic';
    const events = createTrackSessionEvents(sessionId).map((event) => {
      if (event.type === 'MOT_SESSION_STARTED') {
        return {
          ...event,
          playContext: 'calibration',
          config: {
            ...event.config,
            sessionKind: 'calibration',
            calibrationModality: 'semantic',
          },
        } as GameEvent;
      }

      if (event.type === 'MOT_SESSION_ENDED') {
        return {
          ...event,
          playContext: 'calibration',
        } as GameEvent;
      }

      return event;
    });

    const summary = projectTrackSessionToSummaryInput({
      sessionId,
      sessionEvents: events,
      userId: 'user-1',
    });

    expect(summary?.playContext).toBe('calibration');
    expect(Object.keys(summary?.byModality ?? {})).toEqual(['words']);
    expect(summary?.byModality).toMatchObject({
      words: {
        hits: 5,
        misses: 1,
        falseAlarms: 1,
        correctRejections: 9,
      },
    });
  });

  it('keeps summary, report and UPS projection consistent', () => {
    const events = createTrackSessionEvents('track-session-consistent');
    const projection = projectTrackSessionFromEvents(events);
    const summary = projectTrackSessionToSummaryInput({
      sessionId: 'track-session-consistent',
      sessionEvents: events,
      userId: 'user-1',
    });
    const report = projectSessionReportFromEvents({
      sessionId: 'track-session-consistent',
      events,
      modeHint: 'track',
    });
    const ups = UPSProjector.project(events);

    expect(projection).not.toBeNull();
    expect(summary).not.toBeNull();
    expect(report).not.toBeNull();
    expect(ups).not.toBeNull();

    expect(summary?.passed).toBe(projection?.passed);
    expect(report?.passed).toBe(projection?.passed);
    expect(summary?.durationMs).toBe(projection?.durationMs);
    expect(report?.durationMs).toBe(projection?.durationMs);
    expect(summary?.upsScore).toBe(projection?.ups.score);
    expect(report?.ups.score).toBe(projection?.ups.score);
    // @ts-expect-error test override
    expect(summary?.adaptivePathProgressPct).toBe(projection?.masteryStageProgressPct);
    expect(ups?.ups.score).toBe(projection?.ups.score);
    expect(report?.totals.falseAlarms).toBe(1);
    expect(report?.gameMode).toBe('dual-track');
    const firstTurnDetail =
      report?.turns?.[0]?.detail?.kind === 'track-trial' ? report.turns[0].detail : null;
    expect(firstTurnDetail?.trialSeed).toBe('track-seed-1');
  });
});

describe('SessionCompletionProjector track mode', () => {
  it('uses the MOT event stream as SSOT for report and persistence', () => {
    const result = SessionCompletionProjector.project({
      mode: 'track',
      sessionId: 'track-session-completion',
      gameModeLabel: 'Dual Track',
      events: createTrackSessionEvents('track-session-completion'),
    });

    expect(result).not.toBeNull();
    expect(result?.passed).toBe(true);
    expect(result?.report.gameMode).toBe('dual-track');
    expect(result?.report.totals.hits).toBe(5);
    expect(result?.report.totals.falseAlarms).toBe(1);
    expect(result?.activeModalities).toEqual(['position']);
  });
});
