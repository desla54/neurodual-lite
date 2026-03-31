/**
 * Test Event Store Utilities
 *
 * Mock helpers for testing Emmett-based event sourcing.
 * Replaces direct SQL queries on events_all VIEW in tests.
 */

import type {
  StreamId,
  StoredEvent,
  ReadStreamResult,
} from '../es-emmett/powersync-emmett-event-store';

// =============================================================================
// Mock Types
// =============================================================================

export type MockEvent = {
  id: string;
  sessionId: string;
  type: string;
  timestamp: number;
  payload: Record<string, unknown>;
  deleted?: boolean;
  updated_at?: string;
};

export type MockStoredEvent = StoredEvent & {
  data: Record<string, unknown> & { sessionId?: string };
};

// =============================================================================
// Mock Event Store
// =============================================================================

export class MockEmmettEventStore {
  private events = new Map<string, MockStoredEvent[]>();
  private globalPosition = 0n;

  constructor(initialEvents?: MockEvent[]) {
    if (initialEvents) {
      for (const event of initialEvents) {
        this.addEvent(event);
      }
    }
  }

  private getStreamKey(streamId: StreamId): string {
    return `${streamId.aggregateType}:${streamId.aggregateId}`;
  }

  addEvent(event: MockEvent): void {
    const streamId: StreamId = { aggregateType: 'session', aggregateId: event.sessionId };
    const streamKey = this.getStreamKey(streamId);

    let streamEvents = this.events.get(streamKey);
    if (!streamEvents) {
      streamEvents = [];
      this.events.set(streamKey, streamEvents);
    }
    const streamPosition = BigInt(streamEvents.length + 1);
    this.globalPosition += 1n;

    const storedEvent: MockStoredEvent = {
      eventId: event.id,
      streamPosition,
      globalPosition: this.globalPosition,
      type: event.type,
      data: {
        ...event.payload,
        sessionId: event.sessionId,
      },
      metadata: {},
      createdAt: new Date(event.timestamp),
    };

    streamEvents.push(storedEvent);
  }

  setEvents(sessionId: string, events: MockEvent[]): void {
    const streamId: StreamId = { aggregateType: 'session', aggregateId: sessionId };
    const streamKey = this.getStreamKey(streamId);

    // Clear existing events for this stream
    this.events.delete(streamKey);

    // Add all new events
    for (const event of events) {
      this.addEvent(event);
    }
  }

  async readStream(args: {
    streamId: StreamId;
    fromVersion?: bigint;
    maxCount?: bigint;
  }): Promise<ReadStreamResult> {
    const streamKey = this.getStreamKey(args.streamId);
    const streamEvents = this.events.get(streamKey);

    if (!streamEvents || streamEvents.length === 0) {
      return {
        currentStreamVersion: 0n,
        streamExists: false,
        events: [],
      };
    }

    const fromIndex = args.fromVersion ? Number(args.fromVersion) - 1 : 0;
    const toIndex =
      args.maxCount !== undefined
        ? Math.min(fromIndex + Number(args.maxCount), streamEvents.length)
        : streamEvents.length;

    const events = streamEvents.slice(fromIndex, toIndex);

    return {
      currentStreamVersion: BigInt(streamEvents.length),
      streamExists: true,
      events,
    };
  }

  clear(): void {
    this.events.clear();
    this.globalPosition = 0n;
  }
}

// =============================================================================
// Mock Factories
// =============================================================================

/**
 * Create a mock Emmett event store from an array of events.
 */
export function createMockEmmettEventStore(events?: MockEvent[]): MockEmmettEventStore {
  return new MockEmmettEventStore(events);
}

/**
 * Create a mock CommandBus with readStream capability.
 */
export function createMockCommandBus(events?: MockEvent[]): {
  readStream: (args: {
    streamId: { aggregateType: string; aggregateId: string };
    fromVersion?: bigint;
    maxCount?: bigint;
  }) => Promise<{
    currentStreamVersion: bigint;
    streamExists: boolean;
    events: readonly unknown[];
  }>;
} {
  const eventStore = createMockEmmettEventStore(events);

  return {
    readStream: eventStore.readStream.bind(eventStore),
  };
}

// =============================================================================
// Test Event Builders
// =============================================================================

/**
 * Create a mock session event with minimal required fields.
 */
export function createMockEvent(overrides: Partial<MockEvent> = {}): MockEvent {
  return {
    id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    sessionId: overrides.sessionId ?? `session_${Math.random().toString(36).substring(2, 9)}`,
    type: 'SESSION_STARTED',
    timestamp: Date.now(),
    payload: {},
    ...overrides,
  };
}

/**
 * Create a sequence of mock events for a session.
 */
export function createMockSessionEvents(sessionId: string, eventTypes: string[]): MockEvent[] {
  const baseTimestamp = Date.now() - eventTypes.length * 1000;

  return eventTypes.map((type, index) =>
    createMockEvent({
      sessionId,
      type,
      timestamp: baseTimestamp + index * 1000,
      payload: { step: index },
    }),
  );
}

/**
 * Create a complete mock session with start and end events.
 */
export function createMockSession(
  sessionId: string,
  overrides: Partial<MockEvent> = {},
): MockEvent[] {
  const baseTimestamp = Date.now();

  return [
    createMockEvent({
      sessionId,
      type: 'SESSION_STARTED',
      timestamp: baseTimestamp,
      payload: { mode: 'dual-n-back', n: 2 },
      ...overrides,
    }),
    createMockEvent({
      sessionId,
      type: 'TRIAL_PRESENTED',
      timestamp: baseTimestamp + 1000,
      payload: { trial: 1 },
    }),
    createMockEvent({
      sessionId,
      type: 'TRIAL_RESULT',
      timestamp: baseTimestamp + 2000,
      payload: { trial: 1, correct: true },
    }),
    createMockEvent({
      sessionId,
      type: 'SESSION_ENDED',
      timestamp: baseTimestamp + 3000,
      payload: { trials: 1, correct: 1 },
    }),
  ];
}
