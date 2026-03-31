import { describe, expect, it } from 'bun:test';
import { SwmSpec } from '../specs/swm.spec';
import type { GameEvent } from './events';
import { projectSwmSessionFromEvents } from './swm-session-projection';
import { projectSessionReportFromEvents } from './report-projection';
import { projectSwmSessionToSummaryInput } from './session-summary-input-projectors';
import { UPSProjector } from './ups-projector';

function makeEvent<T extends string>(type: T, fields: Record<string, unknown>): GameEvent {
  return {
    type,
    id: `${type}-${fields.roundIndex ?? fields.seq ?? 0}`,
    eventId: `${type}-${fields.roundIndex ?? fields.seq ?? 0}`,
    seq: 0,
    monotonicMs: 0,
    occurredAtMs: 0,
    ...fields,
  } as unknown as GameEvent;
}

function createSwmEvents(sessionId = 'swm-1'): GameEvent[] {
  return [
    makeEvent('SWM_SESSION_STARTED', {
      seq: 0,
      timestamp: 1000,
      occurredAtMs: 1000,
      monotonicMs: 0,
      sessionId,
      userId: 'u1',
      playContext: 'free',
      config: { startBoxes: 4, maxBoxes: 8, maxConsecutiveFailures: 3 },
      device: {
        platform: 'web',
        screenWidth: 1920,
        screenHeight: 1080,
        userAgent: 'test',
        touchCapable: true,
      },
      context: { timeOfDay: 'morning', localHour: 9, dayOfWeek: 1, timezone: 'UTC' },
    }),
    makeEvent('SWM_ROUND_COMPLETED', {
      seq: 1,
      timestamp: 4000,
      occurredAtMs: 4000,
      monotonicMs: 3000,
      sessionId,
      roundIndex: 0,
      span: 4,
      tokenPosition: 2,
      withinSearchErrors: 0,
      betweenSearchErrors: 0,
      totalErrors: 0,
      searchesUsed: 4,
      correct: true,
      roundTimeMs: 2500,
    }),
    makeEvent('SWM_ROUND_COMPLETED', {
      seq: 2,
      timestamp: 7000,
      occurredAtMs: 7000,
      monotonicMs: 6000,
      sessionId,
      roundIndex: 1,
      span: 5,
      tokenPosition: 3,
      withinSearchErrors: 1,
      betweenSearchErrors: 2,
      totalErrors: 3,
      searchesUsed: 7,
      correct: false,
      roundTimeMs: 2800,
    }),
    makeEvent('SWM_ROUND_COMPLETED', {
      seq: 3,
      timestamp: 10000,
      occurredAtMs: 10000,
      monotonicMs: 9000,
      sessionId,
      roundIndex: 2,
      span: 5,
      tokenPosition: 1,
      withinSearchErrors: 0,
      betweenSearchErrors: 1,
      totalErrors: 1,
      searchesUsed: 5,
      correct: true,
      roundTimeMs: 2200,
    }),
    makeEvent('SWM_SESSION_ENDED', {
      seq: 4,
      timestamp: 11000,
      occurredAtMs: 11000,
      monotonicMs: 10000,
      sessionId,
      reason: 'completed',
      totalRounds: 3,
      correctRounds: 2,
      accuracy: 66.67,
      maxSpanReached: 5,
      totalWithinErrors: 1,
      totalBetweenErrors: 3,
      totalErrors: 4,
      score: 66.67,
      durationMs: 10000,
      playContext: 'free',
    }),
  ];
}

describe('projectSwmSessionFromEvents', () => {
  it('projects basic metrics from a completed session', () => {
    const p = projectSwmSessionFromEvents(createSwmEvents());
    expect(p).not.toBeNull();
    expect(p!.totalRounds).toBe(3);
    expect(p!.correctRounds).toBe(2);
    expect(p!.accuracyPercent).toBeCloseTo(66.67, 1);
    expect(p!.accuracyNormalized).toBeCloseTo(0.6667, 3);
    expect(p!.maxSpanReached).toBe(5);
    expect(p!.totalWithinErrors).toBe(1);
    expect(p!.totalBetweenErrors).toBe(3);
    expect(p!.totalErrors).toBe(4);
    expect(p!.durationMs).toBe(10000);
    expect(p!.reason).toBe('completed');
  });

  it('returns null when no start or end event', () => {
    expect(projectSwmSessionFromEvents([])).toBeNull();
  });

  it('applies pass threshold from SwmSpec', () => {
    const p = projectSwmSessionFromEvents(createSwmEvents());
    expect(p!.passed).toBe(false);
    expect(SwmSpec.scoring.passThreshold).toBe(0.8);
  });

  it('marks as passed when accuracy >= threshold', () => {
    const events: GameEvent[] = [
      makeEvent('SWM_SESSION_STARTED', {
        seq: 0,
        timestamp: 1000,
        sessionId: 's',
        userId: 'u',
        playContext: 'free',
        config: { startBoxes: 4, maxBoxes: 8, maxConsecutiveFailures: 3 },
        device: {
          platform: 'web',
          screenWidth: 1920,
          screenHeight: 1080,
          userAgent: 'test',
          touchCapable: true,
        },
        context: { timeOfDay: 'morning', localHour: 9, dayOfWeek: 1, timezone: 'UTC' },
      }),
      makeEvent('SWM_ROUND_COMPLETED', {
        seq: 1,
        timestamp: 2000,
        sessionId: 's',
        roundIndex: 0,
        span: 4,
        tokenPosition: 0,
        withinSearchErrors: 0,
        betweenSearchErrors: 0,
        totalErrors: 0,
        searchesUsed: 4,
        correct: true,
        roundTimeMs: 800,
      }),
      makeEvent('SWM_SESSION_ENDED', {
        seq: 2,
        timestamp: 3000,
        sessionId: 's',
        reason: 'completed',
        totalRounds: 1,
        correctRounds: 1,
        accuracy: 100,
        maxSpanReached: 4,
        totalWithinErrors: 0,
        totalBetweenErrors: 0,
        totalErrors: 0,
        score: 100,
        durationMs: 2000,
        playContext: 'free',
      }),
    ];
    const p = projectSwmSessionFromEvents(events);
    expect(p!.passed).toBe(true);
  });

  it('maxSpanReached only counts correct rounds', () => {
    const events: GameEvent[] = [
      makeEvent('SWM_SESSION_STARTED', {
        seq: 0,
        timestamp: 1000,
        sessionId: 's',
        userId: 'u',
        playContext: 'free',
        config: { startBoxes: 4, maxBoxes: 8, maxConsecutiveFailures: 3 },
        device: {
          platform: 'web',
          screenWidth: 1920,
          screenHeight: 1080,
          userAgent: 'test',
          touchCapable: true,
        },
        context: { timeOfDay: 'morning', localHour: 9, dayOfWeek: 1, timezone: 'UTC' },
      }),
      makeEvent('SWM_ROUND_COMPLETED', {
        seq: 1,
        timestamp: 2000,
        sessionId: 's',
        roundIndex: 0,
        span: 8,
        tokenPosition: 0,
        withinSearchErrors: 3,
        betweenSearchErrors: 2,
        totalErrors: 5,
        searchesUsed: 10,
        correct: false,
        roundTimeMs: 500,
      }),
      makeEvent('SWM_ROUND_COMPLETED', {
        seq: 2,
        timestamp: 3000,
        sessionId: 's',
        roundIndex: 1,
        span: 4,
        tokenPosition: 1,
        withinSearchErrors: 0,
        betweenSearchErrors: 0,
        totalErrors: 0,
        searchesUsed: 4,
        correct: true,
        roundTimeMs: 600,
      }),
      makeEvent('SWM_SESSION_ENDED', {
        seq: 3,
        timestamp: 4000,
        sessionId: 's',
        reason: 'completed',
        totalRounds: 2,
        correctRounds: 1,
        accuracy: 50,
        maxSpanReached: 4,
        totalWithinErrors: 3,
        totalBetweenErrors: 2,
        totalErrors: 5,
        score: 50,
        durationMs: 3000,
        playContext: 'free',
      }),
    ];
    const p = projectSwmSessionFromEvents(events);
    expect(p!.maxSpanReached).toBe(4);
  });

  it('computes avgRoundTimeMs excluding zero-time rounds', () => {
    const events: GameEvent[] = [
      makeEvent('SWM_SESSION_STARTED', {
        seq: 0,
        timestamp: 1000,
        sessionId: 's',
        userId: 'u',
        playContext: 'free',
        config: { startBoxes: 4, maxBoxes: 8, maxConsecutiveFailures: 3 },
        device: {
          platform: 'web',
          screenWidth: 1920,
          screenHeight: 1080,
          userAgent: 'test',
          touchCapable: true,
        },
        context: { timeOfDay: 'morning', localHour: 9, dayOfWeek: 1, timezone: 'UTC' },
      }),
      makeEvent('SWM_ROUND_COMPLETED', {
        seq: 1,
        timestamp: 2000,
        sessionId: 's',
        roundIndex: 0,
        span: 4,
        tokenPosition: 0,
        withinSearchErrors: 0,
        betweenSearchErrors: 0,
        totalErrors: 0,
        searchesUsed: 4,
        correct: true,
        roundTimeMs: 1000,
      }),
      makeEvent('SWM_ROUND_COMPLETED', {
        seq: 2,
        timestamp: 3000,
        sessionId: 's',
        roundIndex: 1,
        span: 4,
        tokenPosition: 1,
        withinSearchErrors: 0,
        betweenSearchErrors: 0,
        totalErrors: 0,
        searchesUsed: 4,
        correct: true,
        roundTimeMs: 0, // zero-time round
      }),
      makeEvent('SWM_ROUND_COMPLETED', {
        seq: 3,
        timestamp: 4000,
        sessionId: 's',
        roundIndex: 2,
        span: 5,
        tokenPosition: 2,
        withinSearchErrors: 0,
        betweenSearchErrors: 0,
        totalErrors: 0,
        searchesUsed: 5,
        correct: true,
        roundTimeMs: 2000,
      }),
      makeEvent('SWM_SESSION_ENDED', {
        seq: 4,
        timestamp: 5000,
        sessionId: 's',
        reason: 'completed',
        totalRounds: 3,
        correctRounds: 3,
        accuracy: 100,
        maxSpanReached: 5,
        totalWithinErrors: 0,
        totalBetweenErrors: 0,
        totalErrors: 0,
        score: 100,
        durationMs: 4000,
        playContext: 'free',
      }),
    ];
    const p = projectSwmSessionFromEvents(events);
    // (1000 + 2000) / 2 = 1500, zero-time excluded
    expect(p!.avgRoundTimeMs).toBe(1500);
  });

  it('handles abandoned session with no endEvent', () => {
    const events: GameEvent[] = [
      makeEvent('SWM_SESSION_STARTED', {
        seq: 0,
        timestamp: 1000,
        sessionId: 's',
        userId: 'u',
        playContext: 'journey',
        config: { startBoxes: 4, maxBoxes: 8, maxConsecutiveFailures: 3 },
        device: {
          platform: 'web',
          screenWidth: 1920,
          screenHeight: 1080,
          userAgent: 'test',
          touchCapable: true,
        },
        context: { timeOfDay: 'morning', localHour: 9, dayOfWeek: 1, timezone: 'UTC' },
      }),
      makeEvent('SWM_ROUND_COMPLETED', {
        seq: 1,
        timestamp: 2000,
        sessionId: 's',
        roundIndex: 0,
        span: 4,
        tokenPosition: 0,
        withinSearchErrors: 0,
        betweenSearchErrors: 0,
        totalErrors: 0,
        searchesUsed: 4,
        correct: true,
        roundTimeMs: 900,
      }),
    ];
    const p = projectSwmSessionFromEvents(events);
    expect(p).not.toBeNull();
    expect(p!.reason).toBe('abandoned');
    expect(p!.durationMs).toBe(900);
    expect(p!.playContext).toBe('journey');
  });

  it('handles zero rounds gracefully', () => {
    const events: GameEvent[] = [
      makeEvent('SWM_SESSION_STARTED', {
        seq: 0,
        timestamp: 1000,
        sessionId: 's',
        userId: 'u',
        playContext: 'free',
        config: { startBoxes: 4, maxBoxes: 8, maxConsecutiveFailures: 3 },
        device: {
          platform: 'web',
          screenWidth: 1920,
          screenHeight: 1080,
          userAgent: 'test',
          touchCapable: true,
        },
        context: { timeOfDay: 'morning', localHour: 9, dayOfWeek: 1, timezone: 'UTC' },
      }),
      makeEvent('SWM_SESSION_ENDED', {
        seq: 1,
        timestamp: 2000,
        sessionId: 's',
        reason: 'abandoned',
        totalRounds: 0,
        correctRounds: 0,
        accuracy: 0,
        maxSpanReached: 0,
        totalWithinErrors: 0,
        totalBetweenErrors: 0,
        totalErrors: 0,
        score: 0,
        durationMs: 1000,
        playContext: 'free',
      }),
    ];
    const p = projectSwmSessionFromEvents(events);
    expect(p!.accuracyPercent).toBe(0);
    expect(p!.maxSpanReached).toBe(0);
    expect(p!.avgRoundTimeMs).toBe(0);
    expect(p!.totalErrors).toBe(0);
    expect(p!.passed).toBe(false);
  });

  it('computes UPS score', () => {
    const p = projectSwmSessionFromEvents(createSwmEvents());
    expect(p!.ups).toBeDefined();
    expect(p!.ups.score).toBeGreaterThanOrEqual(0);
    expect(p!.ups.score).toBeLessThanOrEqual(100);
  });
});

describe('swm projector alignment', () => {
  it('keeps summary, report and UPS projection consistent', () => {
    const events = createSwmEvents('swm-align');
    const projection = projectSwmSessionFromEvents(events);
    const summary = projectSwmSessionToSummaryInput({
      sessionId: 'swm-align',
      sessionEvents: events,
      userId: 'u1',
    });
    const report = projectSessionReportFromEvents({
      sessionId: 'swm-align',
      events,
      modeHint: 'swm',
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
  });
});
