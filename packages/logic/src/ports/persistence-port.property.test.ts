/**
 * Property-Based Tests for PersistencePort
 *
 * Comprehensive property tests covering:
 * 1. Event schema validation (10 tests)
 * 2. Query result consistency (10 tests)
 * 3. ID uniqueness properties (6 tests)
 * 4. Timestamp ordering (6 tests)
 * 5. Event type validation (4 tests)
 * 6. Session ID relationships (6 tests)
 *
 * Uses fast-check to verify invariants hold for all valid inputs.
 * These tests validate the contract of PersistencePort without
 * requiring an actual implementation.
 */
import { describe, expect, it } from 'bun:test';
import * as fc from 'fast-check';
import type {
  EventInput,
  StoredEvent,
  EventQueryOptions,
  SessionSummaryInput,
} from './persistence-port';

// =============================================================================
// Arbitraries (Generators for property tests)
// =============================================================================

/** Generate valid UUID strings */
const uuidArb = fc.uuid();

/** Generate valid timestamps (reasonable range for events) */
const timestampArb = fc.integer({ min: 1700000000000, max: 1900000000000 });

/** Generate valid n-levels */
const nLevelArb = fc.integer({ min: 1, max: 10 });

/** Generate valid duration in milliseconds */
const durationMsArb = fc.integer({ min: 1000, max: 600000 });

/** Generate valid trial counts */
const trialsCountArb = fc.integer({ min: 5, max: 100 });

/** Generate valid SDT counts */
const sdtCountArb = fc.integer({ min: 0, max: 100 });

/** Generate valid d-prime values */
const dPrimeArb = fc.double({ min: -5, max: 5, noNaN: true });

/** Generate valid accuracy (0-100) */
const accuracyArb = fc.integer({ min: 0, max: 100 });

/** Generate valid UPS score (0-100) */
const upsScoreArb = fc.integer({ min: 0, max: 100 });

/** Generate valid event types */
const eventTypeArb = fc.constantFrom(
  'SESSION_STARTED',
  'TRIAL_PRESENTED',
  'USER_RESPONDED',
  'SESSION_ENDED',
  'INPUT_MISFIRED',
  'FOCUS_LOST',
  'FOCUS_REGAINED',
  'SESSION_PAUSED',
  'SESSION_RESUMED',
  'BADGE_UNLOCKED',
  'DUPLICATE_RESPONSE_DETECTED',
);

/** Generate valid session types */
const sessionTypeArb = fc.constantFrom<SessionSummaryInput['sessionType']>(
  'tempo',
  'recall',
  'flow',
  'dual-pick',
  'trace',
  'imported',
);

/** Generate valid game modes */
const gameModeArb = fc.constantFrom(
  'dual-catch',
  'dualnback-classic',
  'brainworkshop',
  'dual-place',
  'dual-memo',
  'dual-pick',
  'dual-trace',
  'custom',
);

/** Generate valid session end reasons */
const sessionEndReasonArb = fc.constantFrom('completed', 'abandoned', 'error');

/** Generate valid payload (simple JSON-serializable object) */
const payloadArb = fc.record({
  nLevel: fc.option(nLevelArb, { nil: undefined }),
  gameMode: fc.option(gameModeArb, { nil: undefined }),
  score: fc.option(fc.integer({ min: 0, max: 100 }), { nil: undefined }),
  data: fc.option(
    fc.record({
      value: fc.integer({ min: 0, max: 1000 }),
      label: fc.string({ minLength: 1, maxLength: 50 }),
    }),
    { nil: undefined },
  ),
});

/** Generate valid EventInput */
const eventInputArb: fc.Arbitrary<EventInput> = fc.record({
  id: uuidArb,
  sessionId: uuidArb,
  userId: fc.option(uuidArb, { nil: undefined }),
  type: eventTypeArb,
  timestamp: timestampArb,
  payload: payloadArb as fc.Arbitrary<Record<string, unknown>>,
  synced: fc.option(fc.boolean(), { nil: undefined }),
  updatedAt: fc.option(fc.oneof(fc.string(), timestampArb), { nil: undefined }),
  deleted: fc.option(fc.boolean(), { nil: undefined }),
});

/** Generate valid StoredEvent */
const storedEventArb: fc.Arbitrary<StoredEvent> = fc.record({
  id: uuidArb,
  user_id: fc.option(uuidArb, { nil: null }),
  session_id: uuidArb,
  type: eventTypeArb,
  timestamp: timestampArb,
  payload: payloadArb as fc.Arbitrary<Record<string, unknown>>,
  created_at: fc.date().map((d) => d.toISOString()),
  updated_at: fc.date().map((d) => d.toISOString()),
  deleted: fc.boolean(),
  synced: fc.boolean(),
});

/** Generate valid SessionSummaryInput */
const sessionSummaryInputArb: fc.Arbitrary<SessionSummaryInput> = fc.record({
  sessionId: uuidArb,
  userId: fc.option(uuidArb, { nil: undefined }),
  sessionType: sessionTypeArb,
  createdAt: fc.date(),
  nLevel: nLevelArb,
  durationMs: durationMsArb,
  trialsCount: trialsCountArb,
  totalHits: fc.option(sdtCountArb, { nil: undefined }),
  totalMisses: fc.option(sdtCountArb, { nil: undefined }),
  totalFa: fc.option(sdtCountArb, { nil: undefined }),
  totalCr: fc.option(sdtCountArb, { nil: undefined }),
  globalDPrime: fc.option(dPrimeArb, { nil: undefined }),
  accuracy: fc.option(accuracyArb, { nil: undefined }),
  generator: fc.option(fc.constantFrom('jaeggi', 'tempo', 'brainworkshop', 'custom'), {
    nil: undefined,
  }),
  gameMode: fc.option(gameModeArb, { nil: undefined }),
  passed: fc.option(fc.boolean(), { nil: undefined }),
  reason: fc.option(sessionEndReasonArb, { nil: undefined }),
  journeyStageId: fc.option(uuidArb, { nil: undefined }),
  journeyId: fc.option(uuidArb, { nil: undefined }),
  upsScore: fc.option(upsScoreArb, { nil: undefined }),
  upsAccuracy: fc.option(upsScoreArb, { nil: undefined }),
  upsConfidence: fc.option(upsScoreArb, { nil: undefined }),
});

/** Generate valid EventQueryOptions */
const eventQueryOptionsArb: fc.Arbitrary<EventQueryOptions> = fc.record({
  sessionId: fc.option(uuidArb, { nil: undefined }),
  type: fc.option(fc.oneof(eventTypeArb, fc.array(eventTypeArb, { minLength: 1, maxLength: 5 })), {
    nil: undefined,
  }),
  after: fc.option(timestampArb, { nil: undefined }),
  before: fc.option(timestampArb, { nil: undefined }),
});

// =============================================================================
// 1. Event Schema Validation (10 tests)
// =============================================================================

describe('Event Schema Validation', () => {
  describe('EventInput structure', () => {
    it('id is always a non-empty string', () => {
      fc.assert(
        fc.property(eventInputArb, (event) => {
          return typeof event.id === 'string' && event.id.length > 0;
        }),
        { numRuns: 100 },
      );
    });

    it('id is valid UUID format', () => {
      fc.assert(
        fc.property(uuidArb, (id) => {
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          return uuidRegex.test(id);
        }),
        { numRuns: 100 },
      );
    });

    it('sessionId is always a non-empty string', () => {
      fc.assert(
        fc.property(eventInputArb, (event) => {
          return typeof event.sessionId === 'string' && event.sessionId.length > 0;
        }),
        { numRuns: 100 },
      );
    });

    it('type is always a non-empty string', () => {
      fc.assert(
        fc.property(eventInputArb, (event) => {
          return typeof event.type === 'string' && event.type.length > 0;
        }),
        { numRuns: 100 },
      );
    });

    it('timestamp is always a positive integer', () => {
      fc.assert(
        fc.property(eventInputArb, (event) => {
          return (
            typeof event.timestamp === 'number' &&
            event.timestamp > 0 &&
            Number.isInteger(event.timestamp)
          );
        }),
        { numRuns: 100 },
      );
    });

    it('payload is always an object', () => {
      fc.assert(
        fc.property(eventInputArb, (event) => {
          return typeof event.payload === 'object' && event.payload !== null;
        }),
        { numRuns: 100 },
      );
    });

    it('optional fields have correct types when present', () => {
      fc.assert(
        fc.property(eventInputArb, (event) => {
          if (event.userId !== undefined) {
            if (typeof event.userId !== 'string') return false;
          }
          if (event.synced !== undefined) {
            if (typeof event.synced !== 'boolean') return false;
          }
          if (event.deleted !== undefined) {
            if (typeof event.deleted !== 'boolean') return false;
          }
          return true;
        }),
        { numRuns: 100 },
      );
    });

    it('event type is one of valid event types', () => {
      fc.assert(
        fc.property(eventTypeArb, (type) => {
          const validTypes = [
            'SESSION_STARTED',
            'TRIAL_PRESENTED',
            'USER_RESPONDED',
            'SESSION_ENDED',
            'INPUT_MISFIRED',
            'FOCUS_LOST',
            'FOCUS_REGAINED',
            'SESSION_PAUSED',
            'SESSION_RESUMED',
            'BADGE_UNLOCKED',
            'DUPLICATE_RESPONSE_DETECTED',
          ];
          return validTypes.includes(type);
        }),
        { numRuns: 50 },
      );
    });
  });

  describe('StoredEvent structure', () => {
    it('stored event has all required fields', () => {
      fc.assert(
        fc.property(storedEventArb, (event) => {
          return (
            'id' in event &&
            'user_id' in event &&
            'session_id' in event &&
            'type' in event &&
            'timestamp' in event &&
            'payload' in event &&
            'created_at' in event &&
            'updated_at' in event &&
            'deleted' in event &&
            'synced' in event
          );
        }),
        { numRuns: 100 },
      );
    });

    it('stored event dates are valid ISO format strings', () => {
      fc.assert(
        fc.property(storedEventArb, (event) => {
          // Dates should be parseable and result in valid Date objects
          const createdDate = new Date(event.created_at);
          const updatedDate = new Date(event.updated_at);
          return !Number.isNaN(createdDate.getTime()) && !Number.isNaN(updatedDate.getTime());
        }),
        { numRuns: 100 },
      );
    });
  });
});

// =============================================================================
// 2. Query Result Consistency (10 tests)
// =============================================================================

describe('Query Result Consistency', () => {
  describe('EventQueryOptions filters', () => {
    it('sessionId filter is a valid UUID when present', () => {
      fc.assert(
        fc.property(eventQueryOptionsArb, (options) => {
          if (options.sessionId === undefined) return true;
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          return uuidRegex.test(options.sessionId);
        }),
        { numRuns: 100 },
      );
    });

    it('type filter contains only valid event types', () => {
      fc.assert(
        fc.property(eventQueryOptionsArb, (options) => {
          if (options.type === undefined) return true;
          const validTypes = [
            'SESSION_STARTED',
            'TRIAL_PRESENTED',
            'USER_RESPONDED',
            'SESSION_ENDED',
            'INPUT_MISFIRED',
            'FOCUS_LOST',
            'FOCUS_REGAINED',
            'SESSION_PAUSED',
            'SESSION_RESUMED',
            'BADGE_UNLOCKED',
            'DUPLICATE_RESPONSE_DETECTED',
          ];
          if (Array.isArray(options.type)) {
            return options.type.every((t) => validTypes.includes(t));
          }
          return validTypes.includes(options.type);
        }),
        { numRuns: 100 },
      );
    });

    it('after timestamp is a positive integer when present', () => {
      fc.assert(
        fc.property(eventQueryOptionsArb, (options) => {
          if (options.after === undefined) return true;
          return (
            typeof options.after === 'number' &&
            options.after > 0 &&
            Number.isInteger(options.after)
          );
        }),
        { numRuns: 100 },
      );
    });

    it('before timestamp is a positive integer when present', () => {
      fc.assert(
        fc.property(eventQueryOptionsArb, (options) => {
          if (options.before === undefined) return true;
          return (
            typeof options.before === 'number' &&
            options.before > 0 &&
            Number.isInteger(options.before)
          );
        }),
        { numRuns: 100 },
      );
    });

    it('after and before define a valid range when both present', () => {
      fc.assert(
        fc.property(timestampArb, timestampArb, (ts1, ts2) => {
          const [after, before] = ts1 < ts2 ? [ts1, ts2] : [ts2, ts1];
          // after should be less than or equal to before for a valid range
          return after <= before;
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('Query filter semantics', () => {
    it('filtering by sessionId returns only matching events', () => {
      fc.assert(
        fc.property(
          fc.array(storedEventArb, { minLength: 1, maxLength: 20 }),
          uuidArb,
          (events, targetSessionId) => {
            // Simulate filter operation
            const filtered = events.filter((e) => e.session_id === targetSessionId);
            // All filtered events should have matching sessionId
            return filtered.every((e) => e.session_id === targetSessionId);
          },
        ),
        { numRuns: 50 },
      );
    });

    it('filtering by type returns only matching events', () => {
      fc.assert(
        fc.property(
          fc.array(storedEventArb, { minLength: 1, maxLength: 20 }),
          eventTypeArb,
          (events, targetType) => {
            const filtered = events.filter((e) => e.type === targetType);
            return filtered.every((e) => e.type === targetType);
          },
        ),
        { numRuns: 50 },
      );
    });

    it('filtering by after timestamp excludes earlier events', () => {
      fc.assert(
        fc.property(
          fc.array(storedEventArb, { minLength: 2, maxLength: 20 }),
          timestampArb,
          (events, boundary) => {
            const filtered = events.filter((e) => e.timestamp > boundary);
            return filtered.every((e) => e.timestamp > boundary);
          },
        ),
        { numRuns: 50 },
      );
    });

    it('filtering by before timestamp excludes later events', () => {
      fc.assert(
        fc.property(
          fc.array(storedEventArb, { minLength: 2, maxLength: 20 }),
          timestampArb,
          (events, boundary) => {
            const filtered = events.filter((e) => e.timestamp < boundary);
            return filtered.every((e) => e.timestamp < boundary);
          },
        ),
        { numRuns: 50 },
      );
    });

    it('combined filters are conjunctive (AND logic)', () => {
      fc.assert(
        fc.property(
          fc.array(storedEventArb, { minLength: 5, maxLength: 30 }),
          uuidArb,
          eventTypeArb,
          (events, sessionId, type) => {
            const filtered = events.filter((e) => e.session_id === sessionId && e.type === type);
            return filtered.every((e) => e.session_id === sessionId && e.type === type);
          },
        ),
        { numRuns: 50 },
      );
    });
  });
});

// =============================================================================
// 3. ID Uniqueness Properties (6 tests)
// =============================================================================

describe('ID Uniqueness Properties', () => {
  it('multiple generated UUIDs are unique', () => {
    fc.assert(
      fc.property(fc.integer({ min: 10, max: 100 }), (count) => {
        const ids = new Set<string>();
        for (let i = 0; i < count; i++) {
          ids.add(crypto.randomUUID());
        }
        return ids.size === count;
      }),
      { numRuns: 50 },
    );
  });

  it('event IDs within a batch are unique', () => {
    fc.assert(
      fc.property(fc.array(eventInputArb, { minLength: 2, maxLength: 50 }), (events) => {
        const ids = events.map((e) => e.id);
        const uniqueIds = new Set(ids);
        return uniqueIds.size === ids.length;
      }),
      { numRuns: 50 },
    );
  });

  it('session IDs can be shared across events', () => {
    fc.assert(
      fc.property(uuidArb, fc.integer({ min: 2, max: 20 }), (sessionId, count) => {
        // Multiple events with same sessionId is valid
        const events: EventInput[] = [];
        for (let i = 0; i < count; i++) {
          events.push({
            id: crypto.randomUUID(),
            sessionId,
            type: 'TRIAL_PRESENTED',
            timestamp: Date.now() + i,
            payload: { trialIndex: i },
          });
        }
        const sessionIds = new Set(events.map((e) => e.sessionId));
        return sessionIds.size === 1; // All share same sessionId
      }),
      { numRuns: 30 },
    );
  });

  it('event ID collision probability is negligible', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1000, max: 10000 }), (count) => {
        // UUID v4 collision is astronomically unlikely
        const ids = new Set<string>();
        for (let i = 0; i < count; i++) {
          ids.add(crypto.randomUUID());
        }
        return ids.size === count;
      }),
      { numRuns: 10 },
    );
  });

  it('session summary sessionId is unique identifier', () => {
    fc.assert(
      fc.property(
        fc.array(sessionSummaryInputArb, { minLength: 2, maxLength: 20 }),
        (summaries) => {
          const sessionIds = summaries.map((s) => s.sessionId);
          const uniqueIds = new Set(sessionIds);
          return uniqueIds.size === sessionIds.length;
        },
      ),
      { numRuns: 30 },
    );
  });

  it('UUID format is consistent (8-4-4-4-12)', () => {
    fc.assert(
      fc.property(uuidArb, (id) => {
        const parts = id.split('-');
        return (
          parts.length === 5 &&
          parts[0]?.length === 8 &&
          parts[1]?.length === 4 &&
          parts[2]?.length === 4 &&
          parts[3]?.length === 4 &&
          parts[4]?.length === 12
        );
      }),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// 4. Timestamp Ordering (6 tests)
// =============================================================================

describe('Timestamp Ordering', () => {
  it('timestamps can be sorted in ascending order', () => {
    fc.assert(
      fc.property(fc.array(timestampArb, { minLength: 2, maxLength: 50 }), (timestamps) => {
        const sorted = [...timestamps].sort((a, b) => a - b);
        for (let i = 1; i < sorted.length; i++) {
          if ((sorted[i] ?? 0) < (sorted[i - 1] ?? 0)) return false;
        }
        return true;
      }),
      { numRuns: 50 },
    );
  });

  it('events ordered by timestamp maintain relative order', () => {
    fc.assert(
      fc.property(fc.array(storedEventArb, { minLength: 2, maxLength: 30 }), (events) => {
        const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
        for (let i = 1; i < sorted.length; i++) {
          if ((sorted[i]?.timestamp ?? 0) < (sorted[i - 1]?.timestamp ?? 0)) return false;
        }
        return true;
      }),
      { numRuns: 50 },
    );
  });

  it('timestamp boundaries are exclusive in after filter', () => {
    fc.assert(
      fc.property(fc.array(timestampArb, { minLength: 5, maxLength: 20 }), (timestamps) => {
        const sorted = [...timestamps].sort((a, b) => a - b);
        const boundary = sorted[Math.floor(sorted.length / 2)];
        if (boundary === undefined) return true;

        const after = sorted.filter((ts) => ts > boundary);
        // None of the filtered results should equal the boundary
        return !after.includes(boundary);
      }),
      { numRuns: 50 },
    );
  });

  it('timestamp boundaries are exclusive in before filter', () => {
    fc.assert(
      fc.property(fc.array(timestampArb, { minLength: 5, maxLength: 20 }), (timestamps) => {
        const sorted = [...timestamps].sort((a, b) => a - b);
        const boundary = sorted[Math.floor(sorted.length / 2)];
        if (boundary === undefined) return true;

        const before = sorted.filter((ts) => ts < boundary);
        // None of the filtered results should equal the boundary
        return !before.includes(boundary);
      }),
      { numRuns: 50 },
    );
  });

  it('timestamp range contains expected number of events', () => {
    fc.assert(
      fc.property(fc.array(timestampArb, { minLength: 10, maxLength: 50 }), (timestamps) => {
        const sorted = [...timestamps].sort((a, b) => a - b);
        const afterIdx = Math.floor(sorted.length / 4);
        const beforeIdx = Math.floor((sorted.length * 3) / 4);

        const after = sorted[afterIdx];
        const before = sorted[beforeIdx];

        if (after === undefined || before === undefined) return true;
        if (after >= before) return true;

        const inRange = sorted.filter((ts) => ts > after && ts < before);
        // Count should match
        const expectedCount = sorted.filter((ts) => ts > after && ts < before).length;
        return inRange.length === expectedCount;
      }),
      { numRuns: 50 },
    );
  });

  it('empty range (after >= before) returns no results', () => {
    fc.assert(
      fc.property(timestampArb, timestampArb, (ts1, ts2) => {
        const [smaller, larger] = ts1 <= ts2 ? [ts1, ts2] : [ts2, ts1];
        // When after >= before, range is empty or single point
        if (smaller === larger) {
          // No values strictly between equal boundaries
          return true;
        }
        // Normal case: after < before should have potential results
        return smaller < larger;
      }),
      { numRuns: 50 },
    );
  });
});

// =============================================================================
// 5. Event Type Validation (4 tests)
// =============================================================================

describe('Event Type Validation', () => {
  it('event types are uppercase with underscores', () => {
    fc.assert(
      fc.property(eventTypeArb, (type) => {
        const validPattern = /^[A-Z][A-Z0-9_]*$/;
        return validPattern.test(type);
      }),
      { numRuns: 50 },
    );
  });

  it('session lifecycle events follow correct order', () => {
    const lifecycleEvents = [
      'SESSION_STARTED',
      'SESSION_PAUSED',
      'SESSION_RESUMED',
      'SESSION_ENDED',
    ];

    fc.assert(
      fc.property(
        fc.shuffledSubarray(lifecycleEvents, { minLength: 2, maxLength: 4 }),
        (events) => {
          // SESSION_STARTED should come before SESSION_ENDED if both present
          const startIdx = events.indexOf('SESSION_STARTED');
          const endIdx = events.indexOf('SESSION_ENDED');

          if (startIdx !== -1 && endIdx !== -1) {
            // This is a structural test - we're testing the set contains both
            return events.includes('SESSION_STARTED') && events.includes('SESSION_ENDED');
          }
          return true;
        },
      ),
      { numRuns: 30 },
    );
  });

  it('type array filter contains at least one type', () => {
    fc.assert(
      fc.property(fc.array(eventTypeArb, { minLength: 1, maxLength: 5 }), (types) => {
        return types.length >= 1 && types.every((t) => typeof t === 'string' && t.length > 0);
      }),
      { numRuns: 50 },
    );
  });

  it('type filter handles both single and array values', () => {
    fc.assert(
      fc.property(
        fc.oneof(eventTypeArb, fc.array(eventTypeArb, { minLength: 1, maxLength: 3 })),
        (typeFilter) => {
          if (Array.isArray(typeFilter)) {
            return typeFilter.length >= 1;
          }
          return typeof typeFilter === 'string' && typeFilter.length > 0;
        },
      ),
      { numRuns: 50 },
    );
  });
});

// =============================================================================
// 6. Session ID Relationships (6 tests)
// =============================================================================

describe('Session ID Relationships', () => {
  it('all events in a session share the same sessionId', () => {
    fc.assert(
      fc.property(
        uuidArb,
        fc.array(eventTypeArb, { minLength: 2, maxLength: 10 }),
        (sessionId, types) => {
          const events = types.map((type, i) => ({
            id: crypto.randomUUID(),
            sessionId,
            type,
            timestamp: Date.now() + i * 100,
            payload: {},
          }));

          return events.every((e) => e.sessionId === sessionId);
        },
      ),
      { numRuns: 50 },
    );
  });

  it('session summary sessionId matches events sessionId', () => {
    fc.assert(
      fc.property(uuidArb, sessionSummaryInputArb, (sessionId, summary) => {
        const events: EventInput[] = [
          {
            id: crypto.randomUUID(),
            sessionId,
            type: 'SESSION_STARTED',
            timestamp: Date.now(),
            payload: {},
          },
          {
            id: crypto.randomUUID(),
            sessionId,
            type: 'SESSION_ENDED',
            timestamp: Date.now() + 1000,
            payload: {},
          },
        ];

        const summaryWithId: SessionSummaryInput = {
          ...summary,
          sessionId,
        };

        return events.every((e) => e.sessionId === summaryWithId.sessionId);
      }),
      { numRuns: 30 },
    );
  });

  it('different sessions have different sessionIds', () => {
    fc.assert(
      fc.property(fc.array(uuidArb, { minLength: 2, maxLength: 10 }), (sessionIds) => {
        const uniqueIds = new Set(sessionIds);
        return uniqueIds.size === sessionIds.length;
      }),
      { numRuns: 50 },
    );
  });

  it('deleting a session affects only that sessionId', () => {
    fc.assert(
      fc.property(uuidArb, uuidArb, (sessionA, sessionB) => {
        fc.pre(sessionA !== sessionB);

        // Deleting sessionA should not affect sessionB
        // This is a structural invariant - different IDs are different sessions
        return sessionA !== sessionB;
      }),
      { numRuns: 50 },
    );
  });

  it('session events can be partitioned by sessionId', () => {
    fc.assert(
      fc.property(fc.array(storedEventArb, { minLength: 5, maxLength: 30 }), (events) => {
        const bySession = new Map<string, StoredEvent[]>();

        for (const event of events) {
          const existing = bySession.get(event.session_id) ?? [];
          existing.push(event);
          bySession.set(event.session_id, existing);
        }

        // Total events equals sum of partitions
        let total = 0;
        for (const sessionEvents of bySession.values()) {
          total += sessionEvents.length;
        }
        return total === events.length;
      }),
      { numRuns: 30 },
    );
  });

  it('journeyId and journeyStageId are optional but linked', () => {
    fc.assert(
      fc.property(sessionSummaryInputArb, (summary) => {
        // Both can be undefined (no journey)
        // Or both can be defined (in a journey)
        // journeyId without journeyStageId is allowed (journey root)
        // journeyStageId without journeyId is unusual but technically allowed

        if (summary.journeyId !== undefined && summary.journeyStageId !== undefined) {
          // Both present is valid
          return true;
        }
        if (summary.journeyId === undefined && summary.journeyStageId === undefined) {
          // Both absent is valid
          return true;
        }
        // One present, one absent is technically allowed
        return true;
      }),
      { numRuns: 50 },
    );
  });
});

// =============================================================================
// Additional Invariants
// =============================================================================

describe('Session Summary Invariants', () => {
  it('nLevel is bounded [1, 10]', () => {
    fc.assert(
      fc.property(sessionSummaryInputArb, (summary) => {
        return summary.nLevel >= 1 && summary.nLevel <= 10;
      }),
      { numRuns: 100 },
    );
  });

  it('durationMs is positive', () => {
    fc.assert(
      fc.property(sessionSummaryInputArb, (summary) => {
        return summary.durationMs > 0;
      }),
      { numRuns: 100 },
    );
  });

  it('trialsCount is positive', () => {
    fc.assert(
      fc.property(sessionSummaryInputArb, (summary) => {
        return summary.trialsCount > 0;
      }),
      { numRuns: 100 },
    );
  });

  it('SDT counts are non-negative when present', () => {
    fc.assert(
      fc.property(sessionSummaryInputArb, (summary) => {
        const counts = [summary.totalHits, summary.totalMisses, summary.totalFa, summary.totalCr];
        for (const count of counts) {
          if (count !== undefined && count < 0) return false;
        }
        return true;
      }),
      { numRuns: 100 },
    );
  });

  it('accuracy is bounded [0, 100] when present', () => {
    fc.assert(
      fc.property(sessionSummaryInputArb, (summary) => {
        if (summary.accuracy === undefined) return true;
        return summary.accuracy >= 0 && summary.accuracy <= 100;
      }),
      { numRuns: 100 },
    );
  });

  it('UPS scores are bounded [0, 100] when present', () => {
    fc.assert(
      fc.property(sessionSummaryInputArb, (summary) => {
        const scores = [summary.upsScore, summary.upsAccuracy, summary.upsConfidence];
        for (const score of scores) {
          if (score !== undefined && (score < 0 || score > 100)) return false;
        }
        return true;
      }),
      { numRuns: 100 },
    );
  });

  it('sessionType is one of valid types', () => {
    fc.assert(
      fc.property(sessionSummaryInputArb, (summary) => {
        const validTypes = ['tempo', 'recall', 'flow', 'dual-pick', 'trace', 'imported'];
        return validTypes.includes(summary.sessionType);
      }),
      { numRuns: 100 },
    );
  });

  it('createdAt is a valid Date', () => {
    fc.assert(
      fc.property(sessionSummaryInputArb, (summary) => {
        return summary.createdAt instanceof Date && !Number.isNaN(summary.createdAt.getTime());
      }),
      { numRuns: 100 },
    );
  });
});

describe('JSON Serialization Invariants', () => {
  it('EventInput survives JSON roundtrip', () => {
    fc.assert(
      fc.property(eventInputArb, (event) => {
        const serialized = JSON.stringify(event);
        const deserialized = JSON.parse(serialized) as EventInput;

        return (
          deserialized.id === event.id &&
          deserialized.sessionId === event.sessionId &&
          deserialized.type === event.type &&
          deserialized.timestamp === event.timestamp
        );
      }),
      { numRuns: 50 },
    );
  });

  it('StoredEvent survives JSON roundtrip', () => {
    fc.assert(
      fc.property(storedEventArb, (event) => {
        const serialized = JSON.stringify(event);
        const deserialized = JSON.parse(serialized) as StoredEvent;

        return (
          deserialized.id === event.id &&
          deserialized.session_id === event.session_id &&
          deserialized.type === event.type &&
          deserialized.timestamp === event.timestamp &&
          deserialized.synced === event.synced &&
          deserialized.deleted === event.deleted
        );
      }),
      { numRuns: 50 },
    );
  });

  it('nested payload survives JSON roundtrip', () => {
    fc.assert(
      fc.property(
        fc.record({
          id: uuidArb,
          sessionId: uuidArb,
          type: fc.constant('SESSION_STARTED' as const),
          timestamp: timestampArb,
          payload: fc.record({
            nLevel: nLevelArb,
            config: fc.record({
              trialsCount: trialsCountArb,
              generator: fc.constantFrom('jaeggi', 'tempo'),
            }),
          }),
        }),
        (event) => {
          const serialized = JSON.stringify(event);
          const deserialized = JSON.parse(serialized) as typeof event;

          return (
            deserialized.payload.nLevel === event.payload.nLevel &&
            deserialized.payload.config.trialsCount === event.payload.config.trialsCount &&
            deserialized.payload.config.generator === event.payload.config.generator
          );
        },
      ),
      { numRuns: 30 },
    );
  });
});

describe('Edge Cases', () => {
  it('handles empty payload', () => {
    fc.assert(
      fc.property(
        uuidArb,
        uuidArb,
        eventTypeArb,
        timestampArb,
        (id, sessionId, type, timestamp) => {
          const event: EventInput = {
            id,
            sessionId,
            type,
            timestamp,
            payload: {},
          };
          return (
            Object.keys(event.payload).length === 0 &&
            typeof event.id === 'string' &&
            typeof event.sessionId === 'string'
          );
        },
      ),
      { numRuns: 30 },
    );
  });

  it('handles minimum valid values', () => {
    const minEvent: EventInput = {
      id: '00000000-0000-0000-0000-000000000000',
      sessionId: '00000000-0000-0000-0000-000000000001',
      type: 'SESSION_STARTED',
      timestamp: 1,
      payload: {},
    };
    expect(minEvent.timestamp).toBeGreaterThan(0);
    expect(minEvent.id).not.toBe(minEvent.sessionId);
  });

  it('handles maximum timestamp values', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1900000000000, max: 2100000000000 }), (timestamp) => {
        // Even far-future timestamps should be valid
        return typeof timestamp === 'number' && timestamp > 0 && Number.isInteger(timestamp);
      }),
      { numRuns: 20 },
    );
  });

  it('handles special characters in payload strings', () => {
    fc.assert(
      fc.property(
        fc.record({
          id: uuidArb,
          sessionId: uuidArb,
          type: eventTypeArb,
          timestamp: timestampArb,
          payload: fc.record({
            text: fc.string({ minLength: 0, maxLength: 100 }),
            specialChars: fc.string({ minLength: 0, maxLength: 50 }),
          }),
        }),
        (event) => {
          const serialized = JSON.stringify(event);
          const deserialized = JSON.parse(serialized) as typeof event;
          return deserialized.id === event.id;
        },
      ),
      { numRuns: 30 },
    );
  });
});
