import { describe, expect, it } from 'bun:test';
import { OspanSpec } from '../specs/ospan.spec';
import type { GameEvent } from './events';
import { projectOspanSessionFromEvents } from './ospan-session-projection';
import { projectSessionReportFromEvents } from './report-projection';
import { projectOspanSessionToSummaryInput } from './session-summary-input-projectors';
import { UPSProjector } from './ups-projector';

function makeEvent<T extends string>(type: T, fields: Record<string, unknown>): GameEvent {
  return {
    type,
    id: `${type}-${fields.setIndex ?? fields.seq ?? 0}`,
    eventId: `${type}-${fields.setIndex ?? fields.seq ?? 0}`,
    seq: 0,
    monotonicMs: 0,
    occurredAtMs: 0,
    ...fields,
  } as unknown as GameEvent;
}

function createOspanEvents(sessionId = 'ospan-1'): GameEvent[] {
  return [
    makeEvent('OSPAN_SESSION_STARTED', {
      seq: 0,
      timestamp: 1000,
      occurredAtMs: 1000,
      monotonicMs: 0,
      sessionId,
      userId: 'u1',
      playContext: 'free',
      config: { startSpan: 3, maxConsecutiveFailures: 3 },
      device: {
        platform: 'web',
        screenWidth: 1920,
        screenHeight: 1080,
        userAgent: 'test',
        touchCapable: true,
      },
      context: { timeOfDay: 'morning', localHour: 9, dayOfWeek: 1, timezone: 'UTC' },
    }),
    makeEvent('OSPAN_SET_COMPLETED', {
      seq: 1,
      timestamp: 3000,
      occurredAtMs: 3000,
      monotonicMs: 2000,
      sessionId,
      setIndex: 0,
      span: 3,
      letters: ['A', 'B', 'C'],
      recalled: ['A', 'B', 'C'],
      recallCorrect: true,
      equationAccuracy: 90,
      responseTimeMs: 1500,
    }),
    makeEvent('OSPAN_SET_COMPLETED', {
      seq: 2,
      timestamp: 5000,
      occurredAtMs: 5000,
      monotonicMs: 4000,
      sessionId,
      setIndex: 1,
      span: 4,
      letters: ['D', 'E', 'F', 'G'],
      recalled: ['D', 'E', 'X', 'G'],
      recallCorrect: false,
      equationAccuracy: 80,
      responseTimeMs: 1800,
    }),
    makeEvent('OSPAN_SET_COMPLETED', {
      seq: 3,
      timestamp: 7000,
      occurredAtMs: 7000,
      monotonicMs: 6000,
      sessionId,
      setIndex: 2,
      span: 5,
      letters: ['H', 'I', 'J', 'K', 'L'],
      recalled: ['H', 'I', 'J', 'K', 'L'],
      recallCorrect: true,
      equationAccuracy: 100,
      responseTimeMs: 2200,
    }),
    makeEvent('OSPAN_SESSION_ENDED', {
      seq: 4,
      timestamp: 8000,
      occurredAtMs: 8000,
      monotonicMs: 7000,
      sessionId,
      reason: 'completed',
      totalSets: 3,
      correctSets: 2,
      maxSpan: 5,
      recallAccuracy: 66.67,
      processingAccuracy: 90,
      score: 66.67,
      durationMs: 7000,
      playContext: 'free',
    }),
  ];
}

describe('projectOspanSessionFromEvents', () => {
  it('projects basic metrics from a completed session', () => {
    const p = projectOspanSessionFromEvents(createOspanEvents());
    expect(p).not.toBeNull();
    expect(p!.totalSets).toBe(3);
    expect(p!.correctSets).toBe(2);
    expect(p!.maxSpan).toBe(5);
    expect(p!.recallAccuracyPercent).toBeCloseTo(66.67, 1);
    expect(p!.recallAccuracyNormalized).toBeCloseTo(0.6667, 3);
    expect(p!.processingAccuracyPercent).toBe(90);
    expect(p!.durationMs).toBe(7000);
    expect(p!.reason).toBe('completed');
    expect(p!.playContext).toBe('free');
  });

  it('returns null when no start or end event', () => {
    expect(projectOspanSessionFromEvents([])).toBeNull();
    expect(
      projectOspanSessionFromEvents([
        makeEvent('OSPAN_SET_COMPLETED', {
          seq: 0,
          timestamp: 1000,
          sessionId: 's',
          setIndex: 0,
          span: 3,
          letters: ['A'],
          recalled: ['A'],
          recallCorrect: true,
          equationAccuracy: 100,
          responseTimeMs: 500,
        }),
      ]),
    ).toBeNull();
  });

  it('applies pass threshold from OspanSpec', () => {
    const events = createOspanEvents();
    const p = projectOspanSessionFromEvents(events);
    // 66.67% accuracy → normalized 0.6667 < 0.8 threshold → fail
    expect(p!.passed).toBe(false);
    expect(OspanSpec.scoring.passThreshold).toBe(0.8);
  });

  it('marks as passed when accuracy >= threshold', () => {
    // All sets correct → 100% accuracy
    const events: GameEvent[] = [
      makeEvent('OSPAN_SESSION_STARTED', {
        seq: 0,
        timestamp: 1000,
        sessionId: 's',
        userId: 'u',
        playContext: 'free',
        config: { startSpan: 3, maxConsecutiveFailures: 3 },
        device: {
          platform: 'web',
          screenWidth: 1920,
          screenHeight: 1080,
          userAgent: 'test',
          touchCapable: true,
        },
        context: { timeOfDay: 'morning', localHour: 9, dayOfWeek: 1, timezone: 'UTC' },
      }),
      makeEvent('OSPAN_SET_COMPLETED', {
        seq: 1,
        timestamp: 2000,
        sessionId: 's',
        setIndex: 0,
        span: 3,
        letters: ['A', 'B', 'C'],
        recalled: ['A', 'B', 'C'],
        recallCorrect: true,
        equationAccuracy: 100,
        responseTimeMs: 800,
      }),
      makeEvent('OSPAN_SESSION_ENDED', {
        seq: 2,
        timestamp: 3000,
        sessionId: 's',
        reason: 'completed',
        totalSets: 1,
        correctSets: 1,
        maxSpan: 3,
        recallAccuracy: 100,
        processingAccuracy: 100,
        score: 100,
        durationMs: 2000,
        playContext: 'free',
      }),
    ];
    const p = projectOspanSessionFromEvents(events);
    expect(p!.passed).toBe(true);
  });

  it('falls back to calculated processingAccuracy when endEvent is absent', () => {
    const events: GameEvent[] = [
      makeEvent('OSPAN_SESSION_STARTED', {
        seq: 0,
        timestamp: 1000,
        sessionId: 's',
        userId: 'u',
        playContext: 'free',
        config: { startSpan: 3, maxConsecutiveFailures: 3 },
        device: {
          platform: 'web',
          screenWidth: 1920,
          screenHeight: 1080,
          userAgent: 'test',
          touchCapable: true,
        },
        context: { timeOfDay: 'morning', localHour: 9, dayOfWeek: 1, timezone: 'UTC' },
      }),
      makeEvent('OSPAN_SET_COMPLETED', {
        seq: 1,
        timestamp: 2000,
        sessionId: 's',
        setIndex: 0,
        span: 3,
        letters: ['A', 'B', 'C'],
        recalled: ['A', 'B', 'C'],
        recallCorrect: true,
        equationAccuracy: 80,
        responseTimeMs: 800,
      }),
      makeEvent('OSPAN_SET_COMPLETED', {
        seq: 2,
        timestamp: 3000,
        sessionId: 's',
        setIndex: 1,
        span: 4,
        letters: ['D', 'E', 'F', 'G'],
        recalled: ['D', 'E', 'F', 'G'],
        recallCorrect: true,
        equationAccuracy: 60,
        responseTimeMs: 1000,
      }),
    ];
    const p = projectOspanSessionFromEvents(events);
    expect(p).not.toBeNull();
    // No endEvent → average of equationAccuracy: (80+60)/2 = 70
    expect(p!.processingAccuracyPercent).toBe(70);
    expect(p!.reason).toBe('abandoned');
    // Duration from activity: 800 + 1000 = 1800
    expect(p!.durationMs).toBe(1800);
  });

  it('handles session with only endEvent (no start)', () => {
    const events: GameEvent[] = [
      makeEvent('OSPAN_SESSION_ENDED', {
        seq: 0,
        timestamp: 5000,
        sessionId: 's',
        reason: 'abandoned',
        totalSets: 0,
        correctSets: 0,
        maxSpan: 0,
        recallAccuracy: 0,
        processingAccuracy: 0,
        score: 0,
        durationMs: 3000,
        playContext: 'journey',
      }),
    ];
    const p = projectOspanSessionFromEvents(events);
    expect(p).not.toBeNull();
    expect(p!.totalSets).toBe(0);
    expect(p!.durationMs).toBe(3000);
    expect(p!.playContext).toBe('journey');
    expect(p!.createdAt).toBeInstanceOf(Date);
  });

  it('computes UPS score', () => {
    const p = projectOspanSessionFromEvents(createOspanEvents());
    expect(p!.ups).toBeDefined();
    expect(p!.ups.score).toBeGreaterThanOrEqual(0);
    expect(p!.ups.score).toBeLessThanOrEqual(100);
    expect(p!.ups.components).toBeDefined();
  });

  it('maxSpan only counts correct sets', () => {
    const events: GameEvent[] = [
      makeEvent('OSPAN_SESSION_STARTED', {
        seq: 0,
        timestamp: 1000,
        sessionId: 's',
        userId: 'u',
        playContext: 'free',
        config: { startSpan: 3, maxConsecutiveFailures: 3 },
        device: {
          platform: 'web',
          screenWidth: 1920,
          screenHeight: 1080,
          userAgent: 'test',
          touchCapable: true,
        },
        context: { timeOfDay: 'morning', localHour: 9, dayOfWeek: 1, timezone: 'UTC' },
      }),
      makeEvent('OSPAN_SET_COMPLETED', {
        seq: 1,
        timestamp: 2000,
        sessionId: 's',
        setIndex: 0,
        span: 7,
        letters: ['A'],
        recalled: ['X'],
        recallCorrect: false,
        equationAccuracy: 50,
        responseTimeMs: 500,
      }),
      makeEvent('OSPAN_SET_COMPLETED', {
        seq: 2,
        timestamp: 3000,
        sessionId: 's',
        setIndex: 1,
        span: 3,
        letters: ['B'],
        recalled: ['B'],
        recallCorrect: true,
        equationAccuracy: 100,
        responseTimeMs: 500,
      }),
      makeEvent('OSPAN_SESSION_ENDED', {
        seq: 3,
        timestamp: 4000,
        sessionId: 's',
        reason: 'completed',
        totalSets: 2,
        correctSets: 1,
        maxSpan: 3,
        recallAccuracy: 50,
        processingAccuracy: 75,
        score: 50,
        durationMs: 3000,
        playContext: 'free',
      }),
    ];
    const p = projectOspanSessionFromEvents(events);
    // span=7 is incorrect, span=3 is correct → maxSpan=3
    expect(p!.maxSpan).toBe(3);
  });

  it('handles zero sets gracefully', () => {
    const events: GameEvent[] = [
      makeEvent('OSPAN_SESSION_STARTED', {
        seq: 0,
        timestamp: 1000,
        sessionId: 's',
        userId: 'u',
        playContext: 'free',
        config: { startSpan: 3, maxConsecutiveFailures: 3 },
        device: {
          platform: 'web',
          screenWidth: 1920,
          screenHeight: 1080,
          userAgent: 'test',
          touchCapable: true,
        },
        context: { timeOfDay: 'morning', localHour: 9, dayOfWeek: 1, timezone: 'UTC' },
      }),
      makeEvent('OSPAN_SESSION_ENDED', {
        seq: 1,
        timestamp: 2000,
        sessionId: 's',
        reason: 'abandoned',
        totalSets: 0,
        correctSets: 0,
        maxSpan: 0,
        recallAccuracy: 0,
        processingAccuracy: 0,
        score: 0,
        durationMs: 1000,
        playContext: 'free',
      }),
    ];
    const p = projectOspanSessionFromEvents(events);
    expect(p!.totalSets).toBe(0);
    expect(p!.recallAccuracyPercent).toBe(0);
    expect(p!.maxSpan).toBe(0);
    expect(p!.processingAccuracyPercent).toBe(0);
    expect(p!.passed).toBe(false);
  });
});

describe('ospan projector alignment', () => {
  it('keeps summary, report and UPS projection consistent', () => {
    const events = createOspanEvents('ospan-align');
    const projection = projectOspanSessionFromEvents(events);
    const summary = projectOspanSessionToSummaryInput({
      sessionId: 'ospan-align',
      sessionEvents: events,
      userId: 'u1',
    });
    const report = projectSessionReportFromEvents({
      sessionId: 'ospan-align',
      events,
      modeHint: 'ospan',
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
