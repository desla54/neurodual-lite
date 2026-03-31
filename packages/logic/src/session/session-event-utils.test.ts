/**
 * Session Event Utilities - Unit Tests
 *
 * Tests for createEventEnvelope and emitAndPersist.
 */

import { describe, it, expect, mock } from 'bun:test';
import {
  createEventEnvelope,
  emitAndPersist,
  type EventEmitterContext,
} from './session-event-utils';
import type { ClockPort } from '../ports/clock-port';
import type { RandomPort } from '../ports/random-port';

// =============================================================================
// Mock Factories
// =============================================================================

function createMockClock(dateNowValue = 1700000000000, nowValue = 12345.67): ClockPort {
  return {
    dateNow: () => dateNowValue,
    now: () => nowValue,
  };
}

function createMockRandom(idPrefix = 'test'): RandomPort & { _counter: number } {
  let counter = 0;
  return {
    random: () => 0.5,
    generateId: () => {
      counter++;
      return `${idPrefix}-${counter}`;
    },
    get _counter() {
      return counter;
    },
  };
}

function createContext(overrides?: Partial<EventEmitterContext>): EventEmitterContext {
  return {
    sessionId: 'session-abc',
    clock: createMockClock(),
    random: createMockRandom(),
    seq: 0,
    ...overrides,
  };
}

// =============================================================================
// createEventEnvelope
// =============================================================================

describe('createEventEnvelope', () => {
  it('should return an envelope with all required fields', () => {
    const ctx = createContext();
    const envelope = createEventEnvelope(ctx);

    expect(envelope.id).toBe('test-1');
    expect(envelope.eventId).toBe('test-1');
    expect(envelope.sessionId).toBe('session-abc');
    expect(envelope.timestamp).toBe(1700000000000);
    expect(envelope.occurredAtMs).toBe(1700000000000);
    expect(envelope.monotonicMs).toBe(12345.67);
    expect(envelope.schemaVersion).toBe(1);
    expect(envelope.seq).toBe(0);
  });

  it('should increment seq on each call', () => {
    const ctx = createContext({ seq: 0 });

    const e1 = createEventEnvelope(ctx);
    const e2 = createEventEnvelope(ctx);
    const e3 = createEventEnvelope(ctx);

    expect(e1.seq).toBe(0);
    expect(e2.seq).toBe(1);
    expect(e3.seq).toBe(2);
    expect(ctx.seq).toBe(3);
  });

  it('should start seq from a non-zero value', () => {
    const ctx = createContext({ seq: 10 });

    const e1 = createEventEnvelope(ctx);
    expect(e1.seq).toBe(10);
    expect(ctx.seq).toBe(11);
  });

  it('should generate unique IDs per call', () => {
    const ctx = createContext();

    const e1 = createEventEnvelope(ctx);
    const e2 = createEventEnvelope(ctx);

    expect(e1.id).not.toBe(e2.id);
    expect(e1.eventId).not.toBe(e2.eventId);
  });

  it('should use clock.dateNow for timestamp and occurredAtMs', () => {
    const clock = createMockClock(9999999, 111.222);
    const ctx = createContext({ clock });
    const envelope = createEventEnvelope(ctx);

    expect(envelope.timestamp).toBe(9999999);
    expect(envelope.occurredAtMs).toBe(9999999);
  });

  it('should use clock.now for monotonicMs', () => {
    const clock = createMockClock(0, 777.888);
    const ctx = createContext({ clock });
    const envelope = createEventEnvelope(ctx);

    expect(envelope.monotonicMs).toBe(777.888);
  });

  it('should always set schemaVersion to 1', () => {
    const ctx = createContext();
    const envelope = createEventEnvelope(ctx);

    expect(envelope.schemaVersion).toBe(1);
  });

  it('should set id and eventId to the same value', () => {
    const ctx = createContext();
    const envelope = createEventEnvelope(ctx);

    expect(envelope.id).toBe(envelope.eventId);
  });
});

// =============================================================================
// emitAndPersist
// =============================================================================

describe('emitAndPersist', () => {
  function createEmitContext(
    overrides?: Partial<EventEmitterContext & { sessionEvents: unknown[]; commandBus?: unknown }>,
  ) {
    return {
      sessionId: 'session-xyz',
      clock: createMockClock(),
      random: createMockRandom('emit'),
      seq: 0,
      sessionEvents: [] as unknown[],
      ...overrides,
    };
  }

  it('should push the full event (envelope + data) to sessionEvents', async () => {
    const ctx = createEmitContext();
    await emitAndPersist(ctx, { type: 'TEST_EVENT', payload: 42 });

    expect(ctx.sessionEvents).toHaveLength(1);
    const event = ctx.sessionEvents[0] as Record<string, unknown>;
    expect(event.type).toBe('TEST_EVENT');
    expect(event.payload).toBe(42);
    expect(event.sessionId).toBe('session-xyz');
    expect(event.schemaVersion).toBe(1);
    expect(event.seq).toBe(0);
  });

  it('should merge envelope fields with event data', async () => {
    const ctx = createEmitContext();
    await emitAndPersist(ctx, { type: 'MY_EVENT', foo: 'bar', baz: true });

    const event = ctx.sessionEvents[0] as Record<string, unknown>;
    expect(event.id).toBeDefined();
    expect(event.eventId).toBeDefined();
    expect(event.timestamp).toBe(1700000000000);
    expect(event.monotonicMs).toBe(12345.67);
    expect(event.foo).toBe('bar');
    expect(event.baz).toBe(true);
  });

  it('should increment seq across multiple calls', async () => {
    const ctx = createEmitContext();
    await emitAndPersist(ctx, { type: 'EVT_A' });
    await emitAndPersist(ctx, { type: 'EVT_B' });
    await emitAndPersist(ctx, { type: 'EVT_C' });

    expect(ctx.sessionEvents).toHaveLength(3);
    expect((ctx.sessionEvents[0] as Record<string, unknown>).seq).toBe(0);
    expect((ctx.sessionEvents[1] as Record<string, unknown>).seq).toBe(1);
    expect((ctx.sessionEvents[2] as Record<string, unknown>).seq).toBe(2);
  });

  it('should resolve immediately when no commandBus is provided', async () => {
    const ctx = createEmitContext();
    const result = emitAndPersist(ctx, { type: 'NO_BUS' });

    expect(result).toBeInstanceOf(Promise);
    await result; // should not throw
  });

  describe('with commandBus', () => {
    function createMockBus() {
      const calls: Array<{
        type: string;
        data: Record<string, unknown>;
        metadata: { commandId: string; timestamp: Date; correlationId?: string };
      }> = [];
      return {
        handle: mock(async (cmd: (typeof calls)[number]) => {
          calls.push(cmd);
        }),
        _calls: calls,
      };
    }

    it('should call commandBus.handle for each event', async () => {
      const bus = createMockBus();
      const ctx = createEmitContext({ commandBus: bus });

      await emitAndPersist(ctx, { type: 'TRIAL_RESPONSE', data: 1 });

      expect(bus.handle).toHaveBeenCalledTimes(1);
    });

    it('should map _STARTED events to SESSION/START command', async () => {
      const bus = createMockBus();
      const ctx = createEmitContext({ commandBus: bus });

      await emitAndPersist(ctx, { type: 'TRACE_SESSION_STARTED' });

      const call = bus.handle.mock.calls[0]![0] as { type: string };
      expect(call.type).toBe('SESSION/START');
    });

    it('should map _ENDED events to SESSION/END command', async () => {
      const bus = createMockBus();
      const ctx = createEmitContext({ commandBus: bus });

      await emitAndPersist(ctx, { type: 'TRACE_SESSION_ENDED' });

      const call = bus.handle.mock.calls[0]![0] as { type: string };
      expect(call.type).toBe('SESSION/END');
    });

    it('should map TRIAL_ events to SESSION/RECORD_TRIAL command', async () => {
      const bus = createMockBus();
      const ctx = createEmitContext({ commandBus: bus });

      await emitAndPersist(ctx, { type: 'TRIAL_COMPLETED' });

      const call = bus.handle.mock.calls[0]![0] as { type: string };
      expect(call.type).toBe('SESSION/RECORD_TRIAL');
    });

    it('should map FLOW_ events to SESSION/RECORD_TRIAL command', async () => {
      const bus = createMockBus();
      const ctx = createEmitContext({ commandBus: bus });

      await emitAndPersist(ctx, { type: 'FLOW_COMPLETED' });

      const call = bus.handle.mock.calls[0]![0] as { type: string };
      expect(call.type).toBe('SESSION/RECORD_TRIAL');
    });

    it('should map RECALL_ events to SESSION/RECORD_TRIAL command', async () => {
      const bus = createMockBus();
      const ctx = createEmitContext({ commandBus: bus });

      await emitAndPersist(ctx, { type: 'RECALL_COMPLETED' });

      const call = bus.handle.mock.calls[0]![0] as { type: string };
      expect(call.type).toBe('SESSION/RECORD_TRIAL');
    });

    it('should map DUAL_PICK_ events to SESSION/RECORD_TRIAL command', async () => {
      const bus = createMockBus();
      const ctx = createEmitContext({ commandBus: bus });

      await emitAndPersist(ctx, { type: 'DUAL_PICK_TRIAL' });

      const call = bus.handle.mock.calls[0]![0] as { type: string };
      expect(call.type).toBe('SESSION/RECORD_TRIAL');
    });

    it('should map RESPON-containing events to SESSION/RECORD_RESPONSE command', async () => {
      const bus = createMockBus();
      const ctx = createEmitContext({ commandBus: bus });

      await emitAndPersist(ctx, { type: 'USER_RESPONSE_SUBMITTED' });

      const call = bus.handle.mock.calls[0]![0] as { type: string };
      expect(call.type).toBe('SESSION/RECORD_RESPONSE');
    });

    it('should map unknown events to SESSION/RECORD_TELEMETRY command', async () => {
      const bus = createMockBus();
      const ctx = createEmitContext({ commandBus: bus });

      await emitAndPersist(ctx, { type: 'FOCUS_LOST' });

      const call = bus.handle.mock.calls[0]![0] as { type: string };
      expect(call.type).toBe('SESSION/RECORD_TELEMETRY');
    });

    it('should use end:<sessionId> as commandId for _ENDED events', async () => {
      const bus = createMockBus();
      const ctx = createEmitContext({ commandBus: bus, sessionId: 'ses-123' });

      await emitAndPersist(ctx, { type: 'PLACE_SESSION_ENDED' });

      const call = bus.handle.mock.calls[0]![0] as {
        metadata: { commandId: string };
      };
      expect(call.metadata.commandId).toBe('end:ses-123');
    });

    it('should use start:<sessionId> as commandId for _STARTED events', async () => {
      const bus = createMockBus();
      const ctx = createEmitContext({ commandBus: bus, sessionId: 'ses-456' });

      await emitAndPersist(ctx, { type: 'MEMO_SESSION_STARTED' });

      const call = bus.handle.mock.calls[0]![0] as {
        metadata: { commandId: string };
      };
      expect(call.metadata.commandId).toBe('start:ses-456');
    });

    it('should use evt:<eventId> as commandId for other events', async () => {
      const bus = createMockBus();
      const ctx = createEmitContext({ commandBus: bus });

      await emitAndPersist(ctx, { type: 'SOME_OTHER_EVENT' });

      const call = bus.handle.mock.calls[0]![0] as {
        metadata: { commandId: string };
      };
      expect(call.metadata.commandId).toMatch(/^evt:/);
    });

    it('should include correlationId in metadata when provided', async () => {
      const bus = createMockBus();
      const ctx = createEmitContext({
        commandBus: bus,
        correlationId: 'corr-999',
      });

      await emitAndPersist(ctx, { type: 'SOME_EVENT' });

      const call = bus.handle.mock.calls[0]![0] as {
        metadata: { correlationId?: string };
      };
      expect(call.metadata.correlationId).toBe('corr-999');
    });

    it('should include timestamp in metadata', async () => {
      const bus = createMockBus();
      const ctx = createEmitContext({ commandBus: bus });

      await emitAndPersist(ctx, { type: 'TEST' });

      const call = bus.handle.mock.calls[0]![0] as {
        metadata: { timestamp: Date };
      };
      expect(call.metadata.timestamp).toBeInstanceOf(Date);
    });

    it('should include sessionId and event in data', async () => {
      const bus = createMockBus();
      const ctx = createEmitContext({ commandBus: bus, sessionId: 'sid-1' });

      await emitAndPersist(ctx, { type: 'MY_EVT', value: 99 });

      // @ts-expect-error test override
      const call = bus.handle.mock.calls[0]![0] as {
        data: { sessionId: string; event: Record<string, unknown> };
      };
      expect(call.data.sessionId).toBe('sid-1');
      expect(call.data.event.type).toBe('MY_EVT');
      expect(call.data.event.value).toBe(99);
    });

    it('should still push event to sessionEvents even if commandBus.handle rejects', async () => {
      const bus = {
        handle: mock(async () => {
          throw new Error('persist failed');
        }),
      };
      const ctx = createEmitContext({ commandBus: bus });

      // Should not throw (error is caught internally)
      await emitAndPersist(ctx, { type: 'FAIL_EVENT' });

      expect(ctx.sessionEvents).toHaveLength(1);
      expect((ctx.sessionEvents[0] as Record<string, unknown>).type).toBe('FAIL_EVENT');
    });
  });
});
