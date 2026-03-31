import { describe, expect, it } from 'vitest';
import { createEnvelopeFactory } from './event-envelope-factory';
import type { ClockPort } from '../../ports/clock-port';
import type { RandomPort } from '../../ports/random-port';

function createTestClock(wallMs = 1000, monoMs = 500): ClockPort {
  let wall = wallMs;
  let mono = monoMs;
  return {
    dateNow: () => wall++,
    now: () => mono++,
  };
}

function createTestRandom(): RandomPort {
  let counter = 0;
  return {
    random: () => 0.5,
    generateId: () => `id-${++counter}`,
  };
}

describe('createEnvelopeFactory', () => {
  it('materializes a draft with all envelope fields', () => {
    const factory = createEnvelopeFactory({
      sessionId: 'sess-1',
      userId: 'user-1',
      clock: createTestClock(1000, 500),
      random: createTestRandom(),
    });

    const result = factory.materialize({ type: 'TEST_STARTED', foo: 42 });

    expect(result.type).toBe('TEST_STARTED');
    expect(result.foo).toBe(42);
    expect(result.id).toBe('id-1');
    expect(result.eventId).toBe('id-1');
    expect(result.sessionId).toBe('sess-1');
    expect(result.userId).toBe('user-1');
    expect(result.seq).toBe(0);
    expect(result.schemaVersion).toBe(1);
    expect(result.timestamp).toBe(1000);
    expect(result.occurredAtMs).toBe(1000);
    expect(result.monotonicMs).toBe(500);
  });

  it('auto-increments seq on successive calls', () => {
    const factory = createEnvelopeFactory({
      sessionId: 'sess-1',
      userId: 'user-1',
      clock: createTestClock(),
      random: createTestRandom(),
    });

    const e0 = factory.materialize({ type: 'A' });
    const e1 = factory.materialize({ type: 'B' });
    const e2 = factory.materialize({ type: 'C' });

    expect(e0.seq).toBe(0);
    expect(e1.seq).toBe(1);
    expect(e2.seq).toBe(2);
    expect(factory.seq).toBe(3);
  });

  it('generates unique ids for each event', () => {
    const factory = createEnvelopeFactory({
      sessionId: 'sess-1',
      userId: 'user-1',
      clock: createTestClock(),
      random: createTestRandom(),
    });

    const e0 = factory.materialize({ type: 'A' });
    const e1 = factory.materialize({ type: 'B' });

    expect(e0.id).toBe('id-1');
    expect(e1.id).toBe('id-2');
    expect(e0.id).not.toBe(e1.id);
  });

  it('exposes sessionId and userId', () => {
    const factory = createEnvelopeFactory({
      sessionId: 'sess-42',
      userId: 'user-99',
      clock: createTestClock(),
      random: createTestRandom(),
    });

    expect(factory.sessionId).toBe('sess-42');
    expect(factory.userId).toBe('user-99');
  });

  it('preserves all draft fields in the materialized event', () => {
    const factory = createEnvelopeFactory({
      sessionId: 'sess-1',
      userId: 'user-1',
      clock: createTestClock(),
      random: createTestRandom(),
    });

    const result = factory.materialize({
      type: 'TRIAL_COMPLETED',
      trialIndex: 3,
      correct: true,
      responseTimeMs: 450,
    });

    expect(result.trialIndex).toBe(3);
    expect(result.correct).toBe(true);
    expect(result.responseTimeMs).toBe(450);
  });
});
