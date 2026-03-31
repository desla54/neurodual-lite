import { describe, expect, it, mock } from 'bun:test';
import { createEventReader } from './event-reader';
import type { PersistencePort, StoredEvent } from '@neurodual/logic';

// =============================================================================
// Mock Helpers
// =============================================================================

let idCounter = 0;

function makeStoredEvent(overrides: Partial<StoredEvent> = {}): StoredEvent {
  idCounter += 1;
  return {
    id: `evt-${idCounter}`,
    user_id: 'user-1',
    session_id: 'session-1',
    type: 'TRIAL_COMPLETED',
    timestamp: 1000 + idCounter,
    payload: {},
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    deleted: false,
    synced: false,
    ...overrides,
  };
}

function createMockPersistence(
  sessions: Record<string, StoredEvent[]> = {},
  allEvents?: StoredEvent[],
): PersistencePort {
  return {
    getSession: mock(async (sessionId: string) => sessions[sessionId] ?? []),
    all: mock(async () => {
      if (allEvents) return allEvents;
      return Object.values(sessions).flat();
    }),
  } as unknown as PersistencePort;
}

describe('event-reader', () => {
  describe('getSessionEvents', () => {
    it('returns events for a given session', async () => {
      const events = [
        makeStoredEvent({
          id: 'e1',
          session_id: 'sess-A',
          type: 'SESSION_STARTED',
          timestamp: 100,
        }),
        makeStoredEvent({
          id: 'e2',
          session_id: 'sess-A',
          type: 'TRIAL_COMPLETED',
          timestamp: 200,
        }),
      ];
      const persistence = createMockPersistence({ 'sess-A': events });
      const reader = createEventReader(persistence);

      const result = await reader.getSessionEvents('sess-A');

      expect(result).toHaveLength(2);
      expect(result[0]!.sessionId).toBe('sess-A');
      expect(result[0]!.type).toBe('SESSION_STARTED');
      expect(result[1]!.type).toBe('TRIAL_COMPLETED' as any);
    });

    it('returns empty array for non-existent session', async () => {
      const persistence = createMockPersistence({});
      const reader = createEventReader(persistence);

      const result = await reader.getSessionEvents('no-such-session');

      expect(result).toEqual([]);
    });

    it('sorts events by timestamp', async () => {
      const events = [
        makeStoredEvent({ id: 'e2', session_id: 's1', timestamp: 300 }),
        makeStoredEvent({ id: 'e1', session_id: 's1', timestamp: 100 }),
        makeStoredEvent({ id: 'e3', session_id: 's1', timestamp: 200 }),
      ];
      const persistence = createMockPersistence({ s1: events });
      const reader = createEventReader(persistence);

      const result = await reader.getSessionEvents('s1');

      expect(result[0]!.timestamp).toBe(100);
      expect(result[1]!.timestamp).toBe(200);
      expect(result[2]!.timestamp).toBe(300);
    });
  });

  describe('queryEvents', () => {
    it('filters by sessionId', async () => {
      const eventsA = [makeStoredEvent({ id: 'a1', session_id: 'sess-A', timestamp: 100 })];
      const eventsB = [makeStoredEvent({ id: 'b1', session_id: 'sess-B', timestamp: 200 })];
      const persistence = createMockPersistence({
        'sess-A': eventsA,
        'sess-B': eventsB,
      });
      const reader = createEventReader(persistence);

      const result = await reader.queryEvents({ sessionId: 'sess-A' });

      expect(result).toHaveLength(1);
      expect(result[0]!.sessionId).toBe('sess-A');
    });

    it('filters by event type (single)', async () => {
      const events = [
        makeStoredEvent({ id: 'e1', session_id: 's1', type: 'SESSION_STARTED', timestamp: 100 }),
        makeStoredEvent({ id: 'e2', session_id: 's1', type: 'TRIAL_COMPLETED', timestamp: 200 }),
        makeStoredEvent({ id: 'e3', session_id: 's1', type: 'SESSION_ENDED', timestamp: 300 }),
      ];
      const persistence = createMockPersistence({}, events);
      const reader = createEventReader(persistence);

      const result = await reader.queryEvents({ type: 'TRIAL_COMPLETED' as never });

      expect(result).toHaveLength(1);
      expect(result[0]!.type).toBe('TRIAL_COMPLETED' as any);
    });

    it('filters by event type (array)', async () => {
      const events = [
        makeStoredEvent({ id: 'e1', session_id: 's1', type: 'SESSION_STARTED', timestamp: 100 }),
        makeStoredEvent({ id: 'e2', session_id: 's1', type: 'TRIAL_COMPLETED', timestamp: 200 }),
        makeStoredEvent({ id: 'e3', session_id: 's1', type: 'SESSION_ENDED', timestamp: 300 }),
      ];
      const persistence = createMockPersistence({}, events);
      const reader = createEventReader(persistence);

      const result = await reader.queryEvents({
        type: ['SESSION_STARTED', 'SESSION_ENDED'] as never,
      });

      expect(result).toHaveLength(2);
      expect(result[0]!.type).toBe('SESSION_STARTED');
      expect(result[1]!.type).toBe('SESSION_ENDED');
    });

    it('filters by after timestamp', async () => {
      const events = [
        makeStoredEvent({ id: 'e1', session_id: 's1', timestamp: 100 }),
        makeStoredEvent({ id: 'e2', session_id: 's1', timestamp: 200 }),
        makeStoredEvent({ id: 'e3', session_id: 's1', timestamp: 300 }),
      ];
      const persistence = createMockPersistence({}, events);
      const reader = createEventReader(persistence);

      const result = await reader.queryEvents({ after: 150 });

      expect(result).toHaveLength(2);
      expect(result[0]!.timestamp).toBe(200);
      expect(result[1]!.timestamp).toBe(300);
    });

    it('filters by before timestamp', async () => {
      const events = [
        makeStoredEvent({ id: 'e1', session_id: 's1', timestamp: 100 }),
        makeStoredEvent({ id: 'e2', session_id: 's1', timestamp: 200 }),
        makeStoredEvent({ id: 'e3', session_id: 's1', timestamp: 300 }),
      ];
      const persistence = createMockPersistence({}, events);
      const reader = createEventReader(persistence);

      const result = await reader.queryEvents({ before: 250 });

      expect(result).toHaveLength(2);
      expect(result[0]!.timestamp).toBe(100);
      expect(result[1]!.timestamp).toBe(200);
    });

    it('returns all events when no filters provided', async () => {
      const events = [
        makeStoredEvent({ id: 'e1', session_id: 's1', timestamp: 100 }),
        makeStoredEvent({ id: 'e2', session_id: 's1', timestamp: 200 }),
      ];
      const persistence = createMockPersistence({}, events);
      const reader = createEventReader(persistence);

      const result = await reader.queryEvents();

      expect(result).toHaveLength(2);
    });

    it('returns empty array when no events match filters', async () => {
      const events = [makeStoredEvent({ id: 'e1', session_id: 's1', timestamp: 100 })];
      const persistence = createMockPersistence({}, events);
      const reader = createEventReader(persistence);

      const result = await reader.queryEvents({ after: 500 });

      expect(result).toEqual([]);
    });
  });

  describe('event type conversion', () => {
    it('maps StoredEvent fields to GameEvent fields', async () => {
      const stored = makeStoredEvent({
        id: 'evt-42',
        session_id: 'sess-7',
        type: 'TRIAL_COMPLETED',
        timestamp: 12345,
        payload: { score: 100, level: 3 },
      });
      const persistence = createMockPersistence({ 'sess-7': [stored] });
      const reader = createEventReader(persistence);

      const result = await reader.getSessionEvents('sess-7');

      expect(result).toHaveLength(1);
      const event = result[0];
      expect(event!.id).toBe('evt-42');
      expect(event!.sessionId).toBe('sess-7');
      expect(event!.type).toBe('TRIAL_COMPLETED' as any);
      expect(event!.timestamp).toBe(12345);
      // Payload fields are spread onto the event (minus reserved keys)
      expect((event as Record<string, unknown>).score).toBe(100 as any);
      expect((event as Record<string, unknown>).level).toBe(3 as any);
    });

    it('does not leak reserved envelope keys from payload', async () => {
      const stored = makeStoredEvent({
        id: 'evt-1',
        session_id: 'sess-1',
        type: 'TRIAL_COMPLETED',
        timestamp: 1000,
        payload: {
          id: 'should-be-ignored',
          type: 'should-be-ignored',
          sessionId: 'ignored',
          timestamp: 9999,
          score: 42,
        },
      });
      const persistence = createMockPersistence({ 'sess-1': [stored] });
      const reader = createEventReader(persistence);

      const result = await reader.getSessionEvents('sess-1');

      const event = result[0];
      // Reserved keys come from the envelope, not the payload
      expect(event!.id).toBe('evt-1');
      expect(event!.type).toBe('TRIAL_COMPLETED' as any);
      expect(event!.sessionId).toBe('sess-1');
      expect(event!.timestamp).toBe(1000);
      // Non-reserved payload key is kept
      expect((event as Record<string, unknown>).score).toBe(42 as any);
    });
  });

  describe('getAllEvents', () => {
    it('returns all events sorted by timestamp', async () => {
      const events = [
        makeStoredEvent({ id: 'e3', session_id: 's2', timestamp: 300 }),
        makeStoredEvent({ id: 'e1', session_id: 's1', timestamp: 100 }),
        makeStoredEvent({ id: 'e2', session_id: 's1', timestamp: 200 }),
      ];
      const persistence = createMockPersistence({}, events);
      const reader = createEventReader(persistence);

      const result = await reader.getAllEvents();

      expect(result).toHaveLength(3);
      expect(result[0]!.timestamp).toBe(100);
      expect(result[1]!.timestamp).toBe(200);
      expect(result[2]!.timestamp).toBe(300);
    });
  });

  describe('getSessionProjectorEvents', () => {
    it('returns events without reserved envelope keys', async () => {
      const stored = makeStoredEvent({
        id: 'evt-1',
        session_id: 'sess-1',
        type: 'TRIAL_COMPLETED',
        timestamp: 1000,
        payload: { score: 42, level: 2 },
      });
      const persistence = createMockPersistence({ 'sess-1': [stored] });
      const reader = createEventReader(persistence);

      const result = await reader.getSessionProjectorEvents('sess-1');

      expect(result).toHaveLength(1);
      const projEvent = result[0] as Record<string, unknown>;
      expect(projEvent.type).toBe('TRIAL_COMPLETED' as any);
      expect(projEvent.score).toBe(42);
      expect(projEvent.level).toBe(2);
      // Reserved envelope keys stripped
      expect(projEvent.id).toBeUndefined();
      expect(projEvent.sessionId).toBeUndefined();
      expect(projEvent.timestamp).toBeUndefined();
    });
  });
});
