import { describe, expect, it } from 'bun:test';
import { createMockEvent } from '../test-utils/test-factories';
import { projectSessionReportFromEvents } from './report-projection';
import { SessionCompletionProjector } from './session-completion-projector';
import { projectTimeSessionToSummaryInput } from './session-summary-input-projectors';
import { projectTimeSessionFromEvents } from './time-session-projection';
import type { GameEvent } from './events';
import { UPSProjector } from './ups-projector';

function createTimeSessionEvents(sessionId = 'time-session-1'): GameEvent[] {
  return [
    createMockEvent('TIME_SESSION_STARTED', {
      id: 'time-start',
      eventId: 'time-start',
      seq: 0,
      timestamp: 1_000,
      occurredAtMs: 1_000,
      monotonicMs: 0,
      sessionId,
      userId: 'user-1',
      gameMode: 'dual-time',
      playContext: 'free',
      config: {
        trialsCount: 4,
        targetDurationMs: 1_000,
        estimationEnabled: true,
        sliderShape: 'circle',
        sliderDirection: 'reverse',
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
    createMockEvent('TIME_TRIAL_COMPLETED', {
      id: 'time-trial-1',
      eventId: 'time-trial-1',
      seq: 1,
      timestamp: 2_100,
      occurredAtMs: 2_100,
      monotonicMs: 1_100,
      sessionId,
      trialIndex: 0,
      durationMs: 900,
      estimatedMs: 950,
      accuracyScore: 90,
      regularityScore: 80,
      skipped: false,
    }),
    createMockEvent('TIME_TRIAL_COMPLETED', {
      id: 'time-trial-2',
      eventId: 'time-trial-2',
      seq: 2,
      timestamp: 3_800,
      occurredAtMs: 3_800,
      monotonicMs: 2_800,
      sessionId,
      trialIndex: 1,
      durationMs: 1_200,
      estimatedMs: 1_050,
      accuracyScore: 60,
      regularityScore: 40,
      skipped: false,
    }),
    createMockEvent('TIME_SESSION_ENDED', {
      id: 'time-end',
      eventId: 'time-end',
      seq: 3,
      timestamp: 6_000,
      occurredAtMs: 6_000,
      monotonicMs: 5_000,
      sessionId,
      reason: 'abandoned',
      totalTrials: 4,
      trialsCompleted: 2,
      score: 75,
      // Simulate legacy undercounted duration: projector must recover wall-clock duration.
      durationMs: 2_100,
      playContext: 'free',
    }),
  ];
}

describe('projectTimeSessionFromEvents', () => {
  it('recovers wall-clock duration and applies the spec pass threshold', () => {
    const projection = projectTimeSessionFromEvents(createTimeSessionEvents());

    expect(projection).not.toBeNull();
    expect(projection?.durationMs).toBe(5_000);
    expect(projection?.accuracyPercent).toBe(75);
    expect(projection?.regularityPercent).toBe(60);
    expect(projection?.passed).toBe(false);
    expect(projection?.successfulTrials).toBe(1);
    expect(projection?.failedTrials).toBe(1);
    expect(projection?.reason).toBe('abandoned');
  });
});

describe('dual-time projector alignment', () => {
  it('keeps summary, report and UPS projection consistent', () => {
    const events = createTimeSessionEvents('time-session-consistent');
    const projection = projectTimeSessionFromEvents(events);
    const summary = projectTimeSessionToSummaryInput({
      sessionId: 'time-session-consistent',
      sessionEvents: events,
      userId: 'user-1',
    });
    const report = projectSessionReportFromEvents({
      sessionId: 'time-session-consistent',
      events,
      modeHint: 'time',
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
    expect(ups?.ups.score).toBe(projection?.ups.score);
    // @ts-expect-error test override
    expect(summary?.upsConfidence).toBe(projection?.ups.components.confidence);
    expect(report?.reason).toBe('abandoned');
  });
});

describe('SessionCompletionProjector time mode', () => {
  it('uses the same pass threshold and preserves abandon semantics', () => {
    const result = SessionCompletionProjector.project({
      mode: 'time',
      sessionId: 'time-session-completion',
      gameModeLabel: 'Dual Time',
      events: createTimeSessionEvents('time-session-completion'),
      reason: 'abandoned',
      accuracy: 75,
      regularity: 60,
      trialsCompleted: 2,
      totalTrials: 4,
      successfulTrials: 1,
      failedTrials: 1,
      durationMs: 5_000,
      avgDurationMs: 1_050,
      avgErrorMs: 150,
    });

    expect(result).not.toBeNull();
    expect(result?.passed).toBe(false);
    expect(result?.report.reason).toBe('abandoned');
    expect(result?.report.totals.hits).toBe(1);
    expect(result?.report.totals.misses).toBe(1);
    expect(result?.ups.components.confidence).toBe(60);
  });
});
