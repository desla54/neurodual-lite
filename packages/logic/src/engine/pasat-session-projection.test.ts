import { describe, expect, it } from 'bun:test';
import { PasatSpec } from '../specs/pasat.spec';
import type { GameEvent } from './events';
import { projectPasatSessionFromEvents } from './pasat-session-projection';
import { projectSessionReportFromEvents } from './report-projection';
import { projectPasatSessionToSummaryInput } from './session-summary-input-projectors';
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

function createPasatEvents(sessionId = 'pasat-1'): GameEvent[] {
  return [
    makeEvent('PASAT_SESSION_STARTED', {
      seq: 0,
      timestamp: 1000,
      occurredAtMs: 1000,
      monotonicMs: 0,
      sessionId,
      userId: 'u1',
      playContext: 'free',
      config: { defaultIsiMs: 3000, maxConsecutiveFailures: 3 },
      device: {
        platform: 'web',
        screenWidth: 1920,
        screenHeight: 1080,
        userAgent: 'test',
        touchCapable: true,
      },
      context: { timeOfDay: 'morning', localHour: 9, dayOfWeek: 1, timezone: 'UTC' },
    }),
    makeEvent('PASAT_TRIAL_COMPLETED', {
      seq: 1,
      timestamp: 4000,
      occurredAtMs: 4000,
      monotonicMs: 3000,
      sessionId,
      trialIndex: 0,
      previousNumber: 3,
      currentNumber: 5,
      correctAnswer: 8,
      playerAnswer: 8,
      correct: true,
      responseTimeMs: 2500,
      isiMs: 3000,
    }),
    makeEvent('PASAT_TRIAL_COMPLETED', {
      seq: 2,
      timestamp: 7000,
      occurredAtMs: 7000,
      monotonicMs: 6000,
      sessionId,
      trialIndex: 1,
      previousNumber: 5,
      currentNumber: 7,
      correctAnswer: 12,
      playerAnswer: 11,
      correct: false,
      responseTimeMs: 2800,
      isiMs: 2500,
    }),
    makeEvent('PASAT_TRIAL_COMPLETED', {
      seq: 3,
      timestamp: 9500,
      occurredAtMs: 9500,
      monotonicMs: 8500,
      sessionId,
      trialIndex: 2,
      previousNumber: 7,
      currentNumber: 2,
      correctAnswer: 9,
      playerAnswer: 9,
      correct: true,
      responseTimeMs: 2200,
      isiMs: 2000,
    }),
    makeEvent('PASAT_SESSION_ENDED', {
      seq: 4,
      timestamp: 11000,
      occurredAtMs: 11000,
      monotonicMs: 10000,
      sessionId,
      reason: 'completed',
      totalTrials: 3,
      correctTrials: 2,
      accuracy: 66.67,
      fastestIsiMs: 2000,
      avgResponseTimeMs: 2500,
      score: 66.67,
      durationMs: 10000,
      playContext: 'free',
    }),
  ];
}

describe('projectPasatSessionFromEvents', () => {
  it('projects basic metrics from a completed session', () => {
    const p = projectPasatSessionFromEvents(createPasatEvents());
    expect(p).not.toBeNull();
    expect(p!.totalTrials).toBe(3);
    expect(p!.correctTrials).toBe(2);
    expect(p!.accuracyPercent).toBeCloseTo(66.67, 1);
    expect(p!.accuracyNormalized).toBeCloseTo(0.6667, 3);
    expect(p!.fastestIsiMs).toBe(2000);
    expect(p!.avgResponseTimeMs).toBe(2500); // (2500+2800+2200)/3 = 2500
    expect(p!.durationMs).toBe(10000);
    expect(p!.reason).toBe('completed');
  });

  it('returns null when no start or end event', () => {
    expect(projectPasatSessionFromEvents([])).toBeNull();
  });

  it('applies pass threshold from PasatSpec', () => {
    const p = projectPasatSessionFromEvents(createPasatEvents());
    expect(p!.passed).toBe(false); // 0.6667 < 0.8
    expect(PasatSpec.scoring.passThreshold).toBe(0.8);
  });

  it('marks as passed when accuracy >= threshold', () => {
    const events: GameEvent[] = [
      makeEvent('PASAT_SESSION_STARTED', {
        seq: 0,
        timestamp: 1000,
        sessionId: 's',
        userId: 'u',
        playContext: 'free',
        config: { defaultIsiMs: 3000, maxConsecutiveFailures: 3 },
        device: {
          platform: 'web',
          screenWidth: 1920,
          screenHeight: 1080,
          userAgent: 'test',
          touchCapable: true,
        },
        context: { timeOfDay: 'morning', localHour: 9, dayOfWeek: 1, timezone: 'UTC' },
      }),
      makeEvent('PASAT_TRIAL_COMPLETED', {
        seq: 1,
        timestamp: 2000,
        sessionId: 's',
        trialIndex: 0,
        previousNumber: 3,
        currentNumber: 5,
        correctAnswer: 8,
        playerAnswer: 8,
        correct: true,
        responseTimeMs: 800,
        isiMs: 3000,
      }),
      makeEvent('PASAT_SESSION_ENDED', {
        seq: 2,
        timestamp: 3000,
        sessionId: 's',
        reason: 'completed',
        totalTrials: 1,
        correctTrials: 1,
        accuracy: 100,
        fastestIsiMs: 3000,
        avgResponseTimeMs: 800,
        score: 100,
        durationMs: 2000,
        playContext: 'free',
      }),
    ];
    const p = projectPasatSessionFromEvents(events);
    expect(p!.passed).toBe(true);
  });

  it('handles abandoned session with no endEvent', () => {
    const events: GameEvent[] = [
      makeEvent('PASAT_SESSION_STARTED', {
        seq: 0,
        timestamp: 1000,
        sessionId: 's',
        userId: 'u',
        playContext: 'journey',
        config: { defaultIsiMs: 3000, maxConsecutiveFailures: 3 },
        device: {
          platform: 'web',
          screenWidth: 1920,
          screenHeight: 1080,
          userAgent: 'test',
          touchCapable: true,
        },
        context: { timeOfDay: 'morning', localHour: 9, dayOfWeek: 1, timezone: 'UTC' },
      }),
      makeEvent('PASAT_TRIAL_COMPLETED', {
        seq: 1,
        timestamp: 2000,
        sessionId: 's',
        trialIndex: 0,
        previousNumber: 1,
        currentNumber: 2,
        correctAnswer: 3,
        playerAnswer: 3,
        correct: true,
        responseTimeMs: 900,
        isiMs: 3000,
      }),
    ];
    const p = projectPasatSessionFromEvents(events);
    expect(p).not.toBeNull();
    expect(p!.reason).toBe('abandoned');
    expect(p!.durationMs).toBe(900); // activity duration
    expect(p!.playContext).toBe('journey');
  });

  it('handles session with only endEvent', () => {
    const events: GameEvent[] = [
      makeEvent('PASAT_SESSION_ENDED', {
        seq: 0,
        timestamp: 5000,
        sessionId: 's',
        reason: 'abandoned',
        totalTrials: 0,
        correctTrials: 0,
        accuracy: 0,
        fastestIsiMs: 0,
        avgResponseTimeMs: 0,
        score: 0,
        durationMs: 2000,
        playContext: 'free',
      }),
    ];
    const p = projectPasatSessionFromEvents(events);
    expect(p).not.toBeNull();
    expect(p!.totalTrials).toBe(0);
    expect(p!.durationMs).toBe(2000);
  });

  it('excludes skipped trials from avgResponseTimeMs', () => {
    const events: GameEvent[] = [
      makeEvent('PASAT_SESSION_STARTED', {
        seq: 0,
        timestamp: 1000,
        sessionId: 's',
        userId: 'u',
        playContext: 'free',
        config: { defaultIsiMs: 3000, maxConsecutiveFailures: 3 },
        device: {
          platform: 'web',
          screenWidth: 1920,
          screenHeight: 1080,
          userAgent: 'test',
          touchCapable: true,
        },
        context: { timeOfDay: 'morning', localHour: 9, dayOfWeek: 1, timezone: 'UTC' },
      }),
      makeEvent('PASAT_TRIAL_COMPLETED', {
        seq: 1,
        timestamp: 2000,
        sessionId: 's',
        trialIndex: 0,
        previousNumber: 3,
        currentNumber: 5,
        correctAnswer: 8,
        playerAnswer: 8,
        correct: true,
        responseTimeMs: 1000,
        isiMs: 3000,
      }),
      makeEvent('PASAT_TRIAL_COMPLETED', {
        seq: 2,
        timestamp: 5000,
        sessionId: 's',
        trialIndex: 1,
        previousNumber: 5,
        currentNumber: 7,
        correctAnswer: 12,
        playerAnswer: -1,
        correct: false,
        responseTimeMs: 3000,
        isiMs: 2500,
      }),
      makeEvent('PASAT_SESSION_ENDED', {
        seq: 3,
        timestamp: 6000,
        sessionId: 's',
        reason: 'completed',
        totalTrials: 2,
        correctTrials: 1,
        accuracy: 50,
        fastestIsiMs: 2500,
        avgResponseTimeMs: 1000,
        score: 50,
        durationMs: 5000,
        playContext: 'free',
      }),
    ];
    const p = projectPasatSessionFromEvents(events);
    // playerAnswer=-1 → skipped from avg response time
    expect(p!.avgResponseTimeMs).toBe(1000); // only the first trial counts
  });

  it('handles zero trials gracefully', () => {
    const events: GameEvent[] = [
      makeEvent('PASAT_SESSION_STARTED', {
        seq: 0,
        timestamp: 1000,
        sessionId: 's',
        userId: 'u',
        playContext: 'free',
        config: { defaultIsiMs: 3000, maxConsecutiveFailures: 3 },
        device: {
          platform: 'web',
          screenWidth: 1920,
          screenHeight: 1080,
          userAgent: 'test',
          touchCapable: true,
        },
        context: { timeOfDay: 'morning', localHour: 9, dayOfWeek: 1, timezone: 'UTC' },
      }),
      makeEvent('PASAT_SESSION_ENDED', {
        seq: 1,
        timestamp: 2000,
        sessionId: 's',
        reason: 'abandoned',
        totalTrials: 0,
        correctTrials: 0,
        accuracy: 0,
        fastestIsiMs: 0,
        avgResponseTimeMs: 0,
        score: 0,
        durationMs: 1000,
        playContext: 'free',
      }),
    ];
    const p = projectPasatSessionFromEvents(events);
    expect(p!.accuracyPercent).toBe(0);
    expect(p!.fastestIsiMs).toBe(0);
    expect(p!.avgResponseTimeMs).toBe(0);
    expect(p!.passed).toBe(false);
  });

  it('computes UPS score', () => {
    const p = projectPasatSessionFromEvents(createPasatEvents());
    expect(p!.ups).toBeDefined();
    expect(p!.ups.score).toBeGreaterThanOrEqual(0);
    expect(p!.ups.score).toBeLessThanOrEqual(100);
  });
});

describe('pasat projector alignment', () => {
  it('keeps summary, report and UPS projection consistent', () => {
    const events = createPasatEvents('pasat-align');
    const projection = projectPasatSessionFromEvents(events);
    const summary = projectPasatSessionToSummaryInput({
      sessionId: 'pasat-align',
      sessionEvents: events,
      userId: 'u1',
    });
    const report = projectSessionReportFromEvents({
      sessionId: 'pasat-align',
      events,
      modeHint: 'pasat',
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
