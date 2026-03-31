import { describe, expect, it } from 'bun:test';
import { RunningSpanSpec } from '../specs/running-span.spec';
import type { GameEvent } from './events';
import { projectRunningSpanSessionFromEvents } from './running-span-session-projection';
import { projectSessionReportFromEvents } from './report-projection';
import { projectRunningSpanSessionToSummaryInput } from './session-summary-input-projectors';
import { UPSProjector } from './ups-projector';

function makeEvent<T extends string>(type: T, fields: Record<string, unknown>): GameEvent {
  return {
    type,
    id: `${type}-${fields.trialIndex ?? fields.seq ?? 0}`,
    eventId: `${type}-${fields.trialIndex ?? fields.seq ?? 0}`,
    seq: 0,
    monotonicMs: 0,
    occurredAtMs: 0,
    ...fields,
  } as unknown as GameEvent;
}

function createRunningSpanEvents(sessionId = 'rs-1'): GameEvent[] {
  return [
    makeEvent('RUNNING_SPAN_SESSION_STARTED', {
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
    makeEvent('RUNNING_SPAN_TRIAL_COMPLETED', {
      seq: 1,
      timestamp: 3000,
      occurredAtMs: 3000,
      monotonicMs: 2000,
      sessionId,
      trialIndex: 0,
      span: 3,
      streamLength: 5,
      targetLetters: ['C', 'D', 'E'],
      recalled: ['C', 'D', 'E'],
      correct: true,
      responseTimeMs: 1500,
    }),
    makeEvent('RUNNING_SPAN_TRIAL_COMPLETED', {
      seq: 2,
      timestamp: 5000,
      occurredAtMs: 5000,
      monotonicMs: 4000,
      sessionId,
      trialIndex: 1,
      span: 4,
      streamLength: 7,
      targetLetters: ['D', 'E', 'F', 'G'],
      recalled: ['D', 'E', 'X', 'G'],
      correct: false,
      responseTimeMs: 1800,
    }),
    makeEvent('RUNNING_SPAN_TRIAL_COMPLETED', {
      seq: 3,
      timestamp: 7000,
      occurredAtMs: 7000,
      monotonicMs: 6000,
      sessionId,
      trialIndex: 2,
      span: 5,
      streamLength: 8,
      targetLetters: ['D', 'E', 'F', 'G', 'H'],
      recalled: ['D', 'E', 'F', 'G', 'H'],
      correct: true,
      responseTimeMs: 2200,
    }),
    makeEvent('RUNNING_SPAN_SESSION_ENDED', {
      seq: 4,
      timestamp: 8000,
      occurredAtMs: 8000,
      monotonicMs: 7000,
      sessionId,
      reason: 'completed',
      totalTrials: 3,
      correctTrials: 2,
      maxSpan: 5,
      accuracy: 66.67,
      score: 66.67,
      durationMs: 7000,
      playContext: 'free',
    }),
  ];
}

describe('projectRunningSpanSessionFromEvents', () => {
  it('projects basic metrics from a completed session', () => {
    const p = projectRunningSpanSessionFromEvents(createRunningSpanEvents());
    expect(p).not.toBeNull();
    expect(p!.totalTrials).toBe(3);
    expect(p!.correctTrials).toBe(2);
    expect(p!.maxSpan).toBe(5);
    expect(p!.accuracyPercent).toBeCloseTo(66.67, 1);
    expect(p!.accuracyNormalized).toBeCloseTo(0.6667, 3);
    expect(p!.durationMs).toBe(7000);
    expect(p!.reason).toBe('completed');
  });

  it('returns null when no start or end event', () => {
    expect(projectRunningSpanSessionFromEvents([])).toBeNull();
  });

  it('applies pass threshold from RunningSpanSpec', () => {
    const p = projectRunningSpanSessionFromEvents(createRunningSpanEvents());
    expect(p!.passed).toBe(false);
    expect(RunningSpanSpec.scoring.passThreshold).toBe(0.8);
  });

  it('marks as passed when accuracy >= threshold', () => {
    const events: GameEvent[] = [
      makeEvent('RUNNING_SPAN_SESSION_STARTED', {
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
      makeEvent('RUNNING_SPAN_TRIAL_COMPLETED', {
        seq: 1,
        timestamp: 2000,
        sessionId: 's',
        trialIndex: 0,
        span: 3,
        streamLength: 5,
        targetLetters: ['A', 'B', 'C'],
        recalled: ['A', 'B', 'C'],
        correct: true,
        responseTimeMs: 800,
      }),
      makeEvent('RUNNING_SPAN_SESSION_ENDED', {
        seq: 2,
        timestamp: 3000,
        sessionId: 's',
        reason: 'completed',
        totalTrials: 1,
        correctTrials: 1,
        maxSpan: 3,
        accuracy: 100,
        score: 100,
        durationMs: 2000,
        playContext: 'free',
      }),
    ];
    const p = projectRunningSpanSessionFromEvents(events);
    expect(p!.passed).toBe(true);
  });

  it('maxSpan only counts correct trials', () => {
    const events: GameEvent[] = [
      makeEvent('RUNNING_SPAN_SESSION_STARTED', {
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
      makeEvent('RUNNING_SPAN_TRIAL_COMPLETED', {
        seq: 1,
        timestamp: 2000,
        sessionId: 's',
        trialIndex: 0,
        span: 7,
        streamLength: 10,
        targetLetters: ['A'],
        recalled: ['X'],
        correct: false,
        responseTimeMs: 500,
      }),
      makeEvent('RUNNING_SPAN_TRIAL_COMPLETED', {
        seq: 2,
        timestamp: 3000,
        sessionId: 's',
        trialIndex: 1,
        span: 3,
        streamLength: 5,
        targetLetters: ['B'],
        recalled: ['B'],
        correct: true,
        responseTimeMs: 500,
      }),
      makeEvent('RUNNING_SPAN_SESSION_ENDED', {
        seq: 3,
        timestamp: 4000,
        sessionId: 's',
        reason: 'completed',
        totalTrials: 2,
        correctTrials: 1,
        maxSpan: 3,
        accuracy: 50,
        score: 50,
        durationMs: 3000,
        playContext: 'free',
      }),
    ];
    const p = projectRunningSpanSessionFromEvents(events);
    expect(p!.maxSpan).toBe(3);
  });

  it('handles abandoned session with no endEvent', () => {
    const events: GameEvent[] = [
      makeEvent('RUNNING_SPAN_SESSION_STARTED', {
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
      makeEvent('RUNNING_SPAN_TRIAL_COMPLETED', {
        seq: 1,
        timestamp: 2000,
        sessionId: 's',
        trialIndex: 0,
        span: 3,
        streamLength: 5,
        targetLetters: ['A', 'B', 'C'],
        recalled: ['A', 'B', 'C'],
        correct: true,
        responseTimeMs: 900,
      }),
    ];
    const p = projectRunningSpanSessionFromEvents(events);
    expect(p).not.toBeNull();
    expect(p!.reason).toBe('abandoned');
    expect(p!.durationMs).toBe(900);
  });

  it('handles zero trials gracefully', () => {
    const events: GameEvent[] = [
      makeEvent('RUNNING_SPAN_SESSION_STARTED', {
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
      makeEvent('RUNNING_SPAN_SESSION_ENDED', {
        seq: 1,
        timestamp: 2000,
        sessionId: 's',
        reason: 'abandoned',
        totalTrials: 0,
        correctTrials: 0,
        maxSpan: 0,
        accuracy: 0,
        score: 0,
        durationMs: 1000,
        playContext: 'free',
      }),
    ];
    const p = projectRunningSpanSessionFromEvents(events);
    expect(p!.accuracyPercent).toBe(0);
    expect(p!.maxSpan).toBe(0);
    expect(p!.passed).toBe(false);
  });

  it('computes UPS score', () => {
    const p = projectRunningSpanSessionFromEvents(createRunningSpanEvents());
    expect(p!.ups).toBeDefined();
    expect(p!.ups.score).toBeGreaterThanOrEqual(0);
    expect(p!.ups.score).toBeLessThanOrEqual(100);
  });
});

describe('running-span projector alignment', () => {
  it('keeps summary, report and UPS projection consistent', () => {
    const events = createRunningSpanEvents('rs-align');
    const projection = projectRunningSpanSessionFromEvents(events);
    const summary = projectRunningSpanSessionToSummaryInput({
      sessionId: 'rs-align',
      sessionEvents: events,
      userId: 'u1',
    });
    const report = projectSessionReportFromEvents({
      sessionId: 'rs-align',
      events,
      modeHint: 'running-span',
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
