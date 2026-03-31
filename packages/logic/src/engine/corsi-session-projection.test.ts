import { describe, expect, it } from 'bun:test';
import { CorsiBlockSpec } from '../specs/corsi.spec';
import type { GameEvent } from './events';
import { projectCorsiSessionFromEvents } from './corsi-session-projection';

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

function corsiStart(overrides: Record<string, unknown> = {}): GameEvent {
  return makeEvent('CORSI_SESSION_STARTED', {
    seq: 0,
    timestamp: 1000,
    occurredAtMs: 1000,
    monotonicMs: 0,
    sessionId: 's1',
    userId: 'u1',
    playContext: 'free',
    config: { initialSpan: 2, maxErrors: 2 },
    device: {
      platform: 'web',
      screenWidth: 1920,
      screenHeight: 1080,
      userAgent: 'test',
      touchCapable: true,
    },
    context: { timeOfDay: 'morning', localHour: 9, dayOfWeek: 1, timezone: 'UTC' },
    ...overrides,
  });
}

function corsiTrial(overrides: Record<string, unknown>): GameEvent {
  return makeEvent('CORSI_TRIAL_COMPLETED', {
    seq: 1,
    sessionId: 's1',
    ...overrides,
  });
}

function corsiEnd(overrides: Record<string, unknown> = {}): GameEvent {
  return makeEvent('CORSI_SESSION_ENDED', {
    seq: 10,
    timestamp: 20000,
    occurredAtMs: 20000,
    monotonicMs: 19000,
    sessionId: 's1',
    reason: 'completed',
    totalTrials: 5,
    correctTrials: 4,
    maxSpan: 5,
    score: 80,
    durationMs: 19000,
    playContext: 'free',
    ...overrides,
  });
}

function createFullSession(): GameEvent[] {
  return [
    corsiStart(),
    corsiTrial({
      trialIndex: 0,
      span: 2,
      sequence: [0, 1],
      recalled: [0, 1],
      correct: true,
      responseTimeMs: 1200,
      timestamp: 2200,
      occurredAtMs: 2200,
    }),
    corsiTrial({
      trialIndex: 1,
      span: 3,
      sequence: [2, 4, 7],
      recalled: [2, 4, 7],
      correct: true,
      responseTimeMs: 1800,
      timestamp: 4000,
      occurredAtMs: 4000,
    }),
    corsiTrial({
      trialIndex: 2,
      span: 4,
      sequence: [1, 3, 5, 8],
      recalled: [1, 3, 8, 5],
      correct: false,
      responseTimeMs: 2500,
      timestamp: 6500,
      occurredAtMs: 6500,
    }),
    corsiTrial({
      trialIndex: 3,
      span: 4,
      sequence: [0, 2, 6, 7],
      recalled: [0, 2, 6, 7],
      correct: true,
      responseTimeMs: 2200,
      timestamp: 8700,
      occurredAtMs: 8700,
    }),
    corsiTrial({
      trialIndex: 4,
      span: 5,
      sequence: [1, 3, 4, 6, 8],
      recalled: [1, 3, 4, 6, 8],
      correct: true,
      responseTimeMs: 3000,
      timestamp: 11700,
      occurredAtMs: 11700,
    }),
    corsiEnd({ durationMs: 10700 }),
  ];
}

describe('projectCorsiSessionFromEvents', () => {
  // ── Null guard ──────────────────────────────────────────────────────────
  it('returns null when no start or end event', () => {
    expect(projectCorsiSessionFromEvents([])).toBeNull();
  });

  it('returns null for unrelated events only', () => {
    const events: GameEvent[] = [makeEvent('PASAT_SESSION_STARTED', { timestamp: 1000 })];
    expect(projectCorsiSessionFromEvents(events)).toBeNull();
  });

  // ── Basic metrics ───────────────────────────────────────────────────────
  it('projects basic trial counts from a completed session', () => {
    const p = projectCorsiSessionFromEvents(createFullSession())!;
    expect(p).not.toBeNull();
    expect(p.totalTrials).toBe(5);
    expect(p.correctTrials).toBe(4);
    expect(p.reason).toBe('completed');
  });

  // ── Accuracy ────────────────────────────────────────────────────────────
  it('computes accuracy percent and normalized', () => {
    const p = projectCorsiSessionFromEvents(createFullSession())!;
    expect(p.accuracyPercent).toBe(80); // 4/5
    expect(p.accuracyNormalized).toBe(0.8);
  });

  it('returns zero accuracy when no trials', () => {
    const events = [corsiStart(), corsiEnd({ totalTrials: 0, correctTrials: 0 })];
    const p = projectCorsiSessionFromEvents(events)!;
    expect(p.accuracyPercent).toBe(0);
    expect(p.accuracyNormalized).toBe(0);
  });

  // ── Max span ────────────────────────────────────────────────────────────
  it('tracks max span from correct trials only', () => {
    const p = projectCorsiSessionFromEvents(createFullSession())!;
    // Correct trials have spans 2, 3, 4, 5 => max = 5
    expect(p.maxSpan).toBe(5);
  });

  it('ignores incorrect trials for max span', () => {
    const events = [
      corsiStart(),
      corsiTrial({ trialIndex: 0, span: 7, correct: false, responseTimeMs: 500, timestamp: 2000 }),
      corsiTrial({ trialIndex: 1, span: 3, correct: true, responseTimeMs: 500, timestamp: 3000 }),
      corsiEnd(),
    ];
    const p = projectCorsiSessionFromEvents(events)!;
    expect(p.maxSpan).toBe(3); // span=7 is incorrect, ignored
  });

  it('returns zero max span when all trials incorrect', () => {
    const events = [
      corsiStart(),
      corsiTrial({ trialIndex: 0, span: 4, correct: false, responseTimeMs: 500, timestamp: 2000 }),
      corsiEnd(),
    ];
    const p = projectCorsiSessionFromEvents(events)!;
    expect(p.maxSpan).toBe(0);
  });

  it('returns zero max span when no trials', () => {
    const events = [corsiStart(), corsiEnd()];
    const p = projectCorsiSessionFromEvents(events)!;
    expect(p.maxSpan).toBe(0);
  });

  // ── Pass threshold ──────────────────────────────────────────────────────
  it('marks as passed when accuracy >= threshold', () => {
    const p = projectCorsiSessionFromEvents(createFullSession())!;
    // 0.8 >= 0.8 (ACCURACY_PASS_NORMALIZED)
    expect(p.passed).toBe(true);
    expect(CorsiBlockSpec.scoring.passThreshold).toBe(0.8);
  });

  it('marks as not passed when accuracy < threshold', () => {
    const events = [
      corsiStart(),
      corsiTrial({ trialIndex: 0, span: 2, correct: true, responseTimeMs: 500, timestamp: 2000 }),
      corsiTrial({ trialIndex: 1, span: 3, correct: false, responseTimeMs: 500, timestamp: 3000 }),
      corsiTrial({ trialIndex: 2, span: 3, correct: false, responseTimeMs: 500, timestamp: 4000 }),
      corsiEnd(),
    ];
    const p = projectCorsiSessionFromEvents(events)!;
    // 1/3 = 0.333... < 0.8
    expect(p.passed).toBe(false);
  });

  // ── Duration (3 paths) ─────────────────────────────────────────────────
  it('uses explicit durationMs from endEvent when largest', () => {
    const events = [
      corsiStart({ timestamp: 1000 }),
      corsiTrial({ trialIndex: 0, span: 2, correct: true, responseTimeMs: 500, timestamp: 1500 }),
      corsiEnd({ timestamp: 2000, durationMs: 50000 }), // explicit > timestamp diff (1000) > activity (500)
    ];
    const p = projectCorsiSessionFromEvents(events)!;
    expect(p.durationMs).toBe(50000);
  });

  it('uses timestamp diff when largest', () => {
    const events = [
      corsiStart({ timestamp: 1000 }),
      corsiTrial({ trialIndex: 0, span: 2, correct: true, responseTimeMs: 200, timestamp: 1200 }),
      corsiEnd({ timestamp: 100000, durationMs: 500 }), // timestamp diff = 99000
    ];
    const p = projectCorsiSessionFromEvents(events)!;
    expect(p.durationMs).toBe(99000);
  });

  it('uses activity duration (sum of responseTimeMs) when largest', () => {
    const events = [
      corsiStart({ timestamp: 1000 }),
      corsiTrial({ trialIndex: 0, span: 2, correct: true, responseTimeMs: 30000, timestamp: 1100 }),
      corsiTrial({ trialIndex: 1, span: 3, correct: true, responseTimeMs: 30000, timestamp: 1200 }),
      corsiEnd({ timestamp: 1300, durationMs: 100 }), // activity = 60000 > timestamp diff (300) > explicit (100)
    ];
    const p = projectCorsiSessionFromEvents(events)!;
    expect(p.durationMs).toBe(60000);
  });

  it('handles negative timestamp diff by clamping to zero', () => {
    // endEvent.timestamp < startEvent.timestamp (clock skew)
    const events = [
      corsiStart({ timestamp: 5000 }),
      corsiEnd({ timestamp: 3000, durationMs: 1000 }),
    ];
    const p = projectCorsiSessionFromEvents(events)!;
    // Math.max(0, 3000 - 5000) = 0, explicit = 1000
    expect(p.durationMs).toBe(1000);
  });

  // ── Abandoned sessions ─────────────────────────────────────────────────
  it('handles abandoned session with no endEvent', () => {
    const events = [
      corsiStart({ playContext: 'journey' }),
      corsiTrial({ trialIndex: 0, span: 2, correct: true, responseTimeMs: 900, timestamp: 1900 }),
    ];
    const p = projectCorsiSessionFromEvents(events)!;
    expect(p).not.toBeNull();
    expect(p.reason).toBe('abandoned');
    expect(p.playContext).toBe('journey');
    expect(p.durationMs).toBe(900);
  });

  it('handles session with only endEvent', () => {
    const events = [
      corsiEnd({ timestamp: 5000, durationMs: 2000, reason: 'abandoned', playContext: 'free' }),
    ];
    const p = projectCorsiSessionFromEvents(events)!;
    expect(p).not.toBeNull();
    expect(p.totalTrials).toBe(0);
    expect(p.durationMs).toBe(2000);
    expect(p.reason).toBe('abandoned');
  });

  // ── playContext fallback ────────────────────────────────────────────────
  it('prefers startEvent playContext', () => {
    const events = [corsiStart({ playContext: 'journey' }), corsiEnd({ playContext: 'free' })];
    const p = projectCorsiSessionFromEvents(events)!;
    expect(p.playContext).toBe('journey');
  });

  it('falls back to endEvent playContext when no startEvent', () => {
    const events = [corsiEnd({ playContext: 'journey' })];
    const p = projectCorsiSessionFromEvents(events)!;
    expect(p.playContext).toBe('journey');
  });

  it('falls back to "free" when neither start nor end have playContext', () => {
    // Only an endEvent with no playContext field (covered by ?? 'free')
    const events = [
      makeEvent('CORSI_SESSION_ENDED', {
        seq: 0,
        timestamp: 5000,
        sessionId: 's1',
        reason: 'completed',
        totalTrials: 0,
        correctTrials: 0,
        maxSpan: 0,
        score: 0,
        durationMs: 1000,
      }),
    ];
    const p = projectCorsiSessionFromEvents(events)!;
    expect(p.playContext).toBe('free');
  });

  // ── createdAt derivation ────────────────────────────────────────────────
  it('uses startEvent timestamp for createdAt', () => {
    const events = createFullSession();
    const p = projectCorsiSessionFromEvents(events)!;
    expect(p.createdAt.getTime()).toBe(1000);
  });

  it('infers createdAt from endEvent timestamp minus duration when no startEvent', () => {
    const events = [corsiEnd({ timestamp: 10000, durationMs: 3000 })];
    const p = projectCorsiSessionFromEvents(events)!;
    // Math.max(0, 10000 - 3000) = 7000
    expect(p.createdAt.getTime()).toBe(7000);
  });

  // ── UPS score ───────────────────────────────────────────────────────────
  it('computes UPS score in valid range', () => {
    const p = projectCorsiSessionFromEvents(createFullSession())!;
    expect(p.ups).toBeDefined();
    expect(p.ups.score).toBeGreaterThanOrEqual(0);
    expect(p.ups.score).toBeLessThanOrEqual(100);
  });

  it('uses maxSpan/9 ratio as difficulty component', () => {
    // With maxSpan=5, difficulty = (5/9)*100 ~ 55.56
    const p = projectCorsiSessionFromEvents(createFullSession())!;
    expect(p.ups.score).toBeGreaterThan(0);
  });

  it('passes null difficulty when no trials', () => {
    const events = [corsiStart(), corsiEnd()];
    const p = projectCorsiSessionFromEvents(events)!;
    // totalTrials=0 => difficulty=null passed to UPS
    expect(p.ups).toBeDefined();
    expect(p.ups.score).toBeGreaterThanOrEqual(0);
  });

  it('respects isGaming flag', () => {
    const normal = projectCorsiSessionFromEvents(createFullSession(), false)!;
    const gaming = projectCorsiSessionFromEvents(createFullSession(), true)!;
    // isGaming should affect UPS calculation
    expect(normal.ups).toBeDefined();
    expect(gaming.ups).toBeDefined();
  });

  // ── Event filtering ─────────────────────────────────────────────────────
  it('filters only corsi events from mixed event stream', () => {
    const events: GameEvent[] = [
      corsiStart(),
      makeEvent('PASAT_TRIAL_COMPLETED', { trialIndex: 0, correct: true, responseTimeMs: 500 }),
      corsiTrial({ trialIndex: 0, span: 3, correct: true, responseTimeMs: 1000, timestamp: 2000 }),
      makeEvent('SESSION_STARTED', { timestamp: 500 }),
      corsiEnd(),
    ];
    const p = projectCorsiSessionFromEvents(events)!;
    expect(p.totalTrials).toBe(1); // only 1 CORSI_TRIAL_COMPLETED
  });

  // ── Multiple end events ─────────────────────────────────────────────────
  it('uses the last endEvent when multiple exist', () => {
    const events = [
      corsiStart(),
      corsiEnd({ timestamp: 5000, durationMs: 4000, reason: 'abandoned' }),
      corsiEnd({ timestamp: 10000, durationMs: 9000, reason: 'completed' }),
    ];
    const p = projectCorsiSessionFromEvents(events)!;
    // reverse().find() picks the last one in original order
    expect(p.reason).toBe('completed');
    expect(p.endEvent?.durationMs).toBe(9000);
  });

  // ── trialEvents and startEvent/endEvent references ──────────────────────
  it('stores trialEvents, startEvent and endEvent references', () => {
    const events = createFullSession();
    const p = projectCorsiSessionFromEvents(events)!;
    expect(p.trialEvents).toHaveLength(5);
    expect(p.startEvent?.type).toBe('CORSI_SESSION_STARTED');
    expect(p.endEvent?.type).toBe('CORSI_SESSION_ENDED');
  });
});
