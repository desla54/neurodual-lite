import { describe, it, expect } from 'bun:test';
import {
  evolveSessionAggregate,
  rebuildSessionState,
  initialSessionAggregateState,
  type AppendEvent,
  type SessionAggregateState,
} from './session-aggregate';

// =============================================================================
// Helpers
// =============================================================================

function makeEvent(overrides: Partial<AppendEvent> & { type: string }): AppendEvent {
  return {
    eventId: crypto.randomUUID(),
    data: {},
    ...overrides,
  };
}

function makeStartedEvent(sessionId: string, timestamp?: number): AppendEvent {
  return makeEvent({
    type: 'SESSION_STARTED',
    data: { sessionId, timestamp: timestamp ?? Date.now() },
  });
}

function makeEndedEvent(timestamp?: number): AppendEvent {
  return makeEvent({
    type: 'SESSION_ENDED',
    data: { timestamp: timestamp ?? Date.now() },
  });
}

// =============================================================================
// Tests
// =============================================================================

describe('session-aggregate', () => {
  describe('initialSessionAggregateState', () => {
    it('returns idle state with zero eventCount', () => {
      const state = initialSessionAggregateState();
      expect(state.status).toBe('idle');
      expect(state.eventCount).toBe(0);
      expect(state.sessionId).toBe('');
      expect(state.startTime).toBeUndefined();
      expect(state.endTime).toBeUndefined();
      expect(state.startEventId).toBeUndefined();
      expect(state.endEventId).toBeUndefined();
    });

    it('returns a new object each call (no shared mutation)', () => {
      const a = initialSessionAggregateState();
      const b = initialSessionAggregateState();
      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    });
  });

  describe('evolveSessionAggregate', () => {
    // -----------------------------------------------------------------------
    // Session start events
    // -----------------------------------------------------------------------
    it('transitions to active on SESSION_STARTED', () => {
      const state = initialSessionAggregateState();
      const event = makeStartedEvent('sess-1', 1000);
      const next = evolveSessionAggregate(state, event);

      expect(next.status).toBe('active');
      expect(next.sessionId).toBe('sess-1');
      expect(next.startEventId).toBe(event.eventId);
      expect(next.eventCount).toBe(1);
      expect(next.startTime).toBeInstanceOf(Date);
    });

    it('transitions to active on any *_STARTED suffix (e.g. RECALL_SESSION_STARTED)', () => {
      const state = initialSessionAggregateState();
      const event = makeEvent({
        type: 'RECALL_SESSION_STARTED',
        data: { sessionId: 'memo-1', timestamp: 2000 },
      });
      const next = evolveSessionAggregate(state, event);
      expect(next.status).toBe('active');
      expect(next.sessionId).toBe('memo-1');
    });

    it('transitions to active on TRACE_SESSION_STARTED', () => {
      const state = initialSessionAggregateState();
      const event = makeEvent({
        type: 'TRACE_SESSION_STARTED',
        data: { sessionId: 'trace-1', timestamp: 3000 },
      });
      const next = evolveSessionAggregate(state, event);
      expect(next.status).toBe('active');
      expect(next.sessionId).toBe('trace-1');
    });

    it('keeps existing sessionId when event.data.sessionId is missing', () => {
      const state: SessionAggregateState = {
        ...initialSessionAggregateState(),
        sessionId: 'pre-existing',
      };
      const event = makeEvent({ type: 'SESSION_STARTED', data: {} });
      const next = evolveSessionAggregate(state, event);
      expect(next.sessionId).toBe('pre-existing');
    });

    // -----------------------------------------------------------------------
    // Session end events
    // -----------------------------------------------------------------------
    it('transitions to completed on SESSION_ENDED', () => {
      const state: SessionAggregateState = {
        ...initialSessionAggregateState(),
        status: 'active',
        eventCount: 5,
      };
      const event = makeEndedEvent(5000);
      const next = evolveSessionAggregate(state, event);

      expect(next.status).toBe('completed');
      expect(next.endEventId).toBe(event.eventId);
      expect(next.endTime).toBeInstanceOf(Date);
      expect(next.eventCount).toBe(6);
    });

    it('transitions to completed on any *_ENDED suffix', () => {
      const state: SessionAggregateState = {
        ...initialSessionAggregateState(),
        status: 'active',
      };
      const event = makeEvent({
        type: 'RECALL_SESSION_ENDED',
        data: { timestamp: 9000 },
      });
      const next = evolveSessionAggregate(state, event);
      expect(next.status).toBe('completed');
    });

    // -----------------------------------------------------------------------
    // Trial events
    // -----------------------------------------------------------------------
    it('increments count on TRIAL_PRESENTED', () => {
      const state: SessionAggregateState = {
        ...initialSessionAggregateState(),
        status: 'active',
        eventCount: 2,
      };
      const event = makeEvent({ type: 'TRIAL_PRESENTED', data: {} });
      const next = evolveSessionAggregate(state, event);
      expect(next.eventCount).toBe(3);
      expect(next.status).toBe('active');
    });

    it('increments count on FLOW_* events', () => {
      const state = initialSessionAggregateState();
      const event = makeEvent({ type: 'FLOW_SOMETHING', data: {} });
      const next = evolveSessionAggregate(state, event);
      expect(next.eventCount).toBe(1);
    });

    it('increments count on RECALL_* events (non-start/end)', () => {
      const state = initialSessionAggregateState();
      const event = makeEvent({ type: 'RECALL_PICKED', data: {} });
      const next = evolveSessionAggregate(state, event);
      expect(next.eventCount).toBe(1);
    });

    it('increments count on TRACE_* events (non-start/end)', () => {
      const state = initialSessionAggregateState();
      const event = makeEvent({ type: 'TRACE_RESPONDED', data: {} });
      // TRACE_RESPONDED doesn't end with _STARTED or _ENDED, so it should match the prefix branch
      const next = evolveSessionAggregate(state, event);
      expect(next.eventCount).toBe(1);
    });

    it('increments count on DUAL_PICK_* events', () => {
      const state = initialSessionAggregateState();
      const event = makeEvent({ type: 'DUAL_PICK_SOMETHING', data: {} });
      const next = evolveSessionAggregate(state, event);
      expect(next.eventCount).toBe(1);
    });

    // -----------------------------------------------------------------------
    // Response events
    // -----------------------------------------------------------------------
    it('increments count on USER_RESPONDED', () => {
      const state: SessionAggregateState = {
        ...initialSessionAggregateState(),
        eventCount: 3,
      };
      const event = makeEvent({ type: 'USER_RESPONDED', data: {} });
      const next = evolveSessionAggregate(state, event);
      expect(next.eventCount).toBe(4);
    });

    it('increments count on USER_RESPONSE (legacy contains RESPONSE)', () => {
      const state = initialSessionAggregateState();
      const event = makeEvent({ type: 'USER_RESPONSE', data: {} });
      const next = evolveSessionAggregate(state, event);
      expect(next.eventCount).toBe(1);
    });

    // -----------------------------------------------------------------------
    // Unknown / other events
    // -----------------------------------------------------------------------
    it('increments count for completely unknown event types', () => {
      const state: SessionAggregateState = {
        ...initialSessionAggregateState(),
        eventCount: 10,
      };
      const event = makeEvent({ type: 'SOME_UNKNOWN_EVENT', data: {} });
      const next = evolveSessionAggregate(state, event);
      expect(next.eventCount).toBe(11);
      // Status should remain whatever it was
      expect(next.status).toBe('idle');
    });

    // -----------------------------------------------------------------------
    // Immutability
    // -----------------------------------------------------------------------
    it('does not mutate the input state', () => {
      const state = initialSessionAggregateState();
      const frozen = Object.freeze({ ...state });
      const event = makeStartedEvent('s1');
      // Should not throw
      const next = evolveSessionAggregate(frozen, event);
      expect(next).not.toBe(frozen);
      expect(frozen.status).toBe('idle');
      expect(frozen.eventCount).toBe(0);
    });

    // -----------------------------------------------------------------------
    // Date handling
    // -----------------------------------------------------------------------
    it('uses Date.now fallback when no timestamp in event data', () => {
      const before = Date.now();
      const state = initialSessionAggregateState();
      const event = makeEvent({ type: 'SESSION_STARTED', data: { sessionId: 's' } });
      const next = evolveSessionAggregate(state, event);
      const after = Date.now();

      expect(next.startTime).toBeInstanceOf(Date);
      expect(next.startTime!.getTime()).toBeGreaterThanOrEqual(before);
      expect(next.startTime!.getTime()).toBeLessThanOrEqual(after);
    });
  });

  describe('rebuildSessionState', () => {
    it('returns initial state for empty events', () => {
      const state = rebuildSessionState([]);
      expect(state.status).toBe('idle');
      expect(state.eventCount).toBe(0);
      expect(state.sessionId).toBe('');
    });

    it('replays a full session lifecycle', () => {
      const events: AppendEvent[] = [
        makeStartedEvent('sess-42', 1000),
        makeEvent({ type: 'TRIAL_PRESENTED', data: {} }),
        makeEvent({ type: 'USER_RESPONDED', data: {} }),
        makeEvent({ type: 'TRIAL_PRESENTED', data: {} }),
        makeEvent({ type: 'USER_RESPONDED', data: {} }),
        makeEndedEvent(5000),
      ];

      const state = rebuildSessionState(events);
      expect(state.sessionId).toBe('sess-42');
      expect(state.status).toBe('completed');
      expect(state.eventCount).toBe(6);
      expect(state.startEventId).toBe(events[0]!.eventId);
      expect(state.endEventId).toBe(events[5]!.eventId);
    });

    it('stays active when session has no end event', () => {
      const events: AppendEvent[] = [
        makeStartedEvent('sess-no-end', 1000),
        makeEvent({ type: 'TRIAL_PRESENTED', data: {} }),
      ];
      const state = rebuildSessionState(events);
      expect(state.status).toBe('active');
      expect(state.endTime).toBeUndefined();
    });

    it('is idempotent: replaying twice gives same result', () => {
      const events: AppendEvent[] = [
        makeStartedEvent('idem', 1000),
        makeEvent({ type: 'TRIAL_PRESENTED', data: {} }),
        makeEndedEvent(2000),
      ];
      const state1 = rebuildSessionState(events);
      const state2 = rebuildSessionState(events);
      expect(state1).toEqual(state2);
    });

    it('handles single-event stream (start only)', () => {
      const events: AppendEvent[] = [makeStartedEvent('single', 500)];
      const state = rebuildSessionState(events);
      expect(state.status).toBe('active');
      expect(state.eventCount).toBe(1);
    });

    it('handles events with no recognized prefix (all fall through to default)', () => {
      const events: AppendEvent[] = [
        makeEvent({ type: 'BADGE_UNLOCKED', data: {} }),
        makeEvent({ type: 'XP_COMPUTED', data: {} }),
        makeEvent({ type: 'FOCUS_LOST', data: {} }),
      ];
      const state = rebuildSessionState(events);
      expect(state.status).toBe('idle');
      expect(state.eventCount).toBe(3);
    });

    it('handles memo session lifecycle', () => {
      const events: AppendEvent[] = [
        makeEvent({
          type: 'RECALL_SESSION_STARTED',
          data: { sessionId: 'memo-1', timestamp: 100 },
        }),
        makeEvent({ type: 'RECALL_STIMULUS_SHOWN', data: {} }),
        makeEvent({ type: 'RECALL_PICKED', data: {} }),
        makeEvent({ type: 'RECALL_WINDOW_COMMITTED', data: {} }),
        makeEvent({ type: 'RECALL_SESSION_ENDED', data: { timestamp: 500 } }),
      ];
      const state = rebuildSessionState(events);
      expect(state.sessionId).toBe('memo-1');
      expect(state.status).toBe('completed');
      expect(state.eventCount).toBe(5);
    });
  });
});
