import { describe, expect, it } from 'bun:test';

import {
  emmettEventToRawVersionedEvent,
  findLatestSessionEndEvent,
  getSessionEventsFromEmmett,
  getSessionRevisionFromEmmett,
  type EventStreamReader,
} from './emmett-session-reader';

function createReader(events: readonly unknown[], streamExists = true): EventStreamReader {
  return {
    readStream: async () => ({
      currentStreamVersion: BigInt(events.length),
      streamExists,
      events,
    }),
  };
}

describe('emmett-session-reader', () => {
  it('returns 0:0 revision when the session stream does not exist', async () => {
    const revision = await getSessionRevisionFromEmmett('session-1', createReader([], false));
    expect(revision).toBe('0:0');
  });

  it('returns 0:0 revision when the stream reader throws', async () => {
    const revision = await getSessionRevisionFromEmmett('session-1', {
      readStream: async () => {
        throw new Error('boom');
      },
    });

    expect(revision).toBe('0:0');
  });

  it('builds a stable revision from stream event timestamps', async () => {
    const revision = await getSessionRevisionFromEmmett(
      'session-1',
      createReader([
        {
          eventId: 'evt-1',
          type: 'SESSION_STARTED',
          createdAt: new Date('2026-03-01T10:00:00.000Z'),
          data: {},
        },
        {
          eventId: 'evt-2',
          type: 'SESSION_ENDED',
          createdAt: new Date('2026-03-01T10:01:00.000Z'),
          data: {},
        },
      ]),
    );

    expect(revision).toContain('events:2:');
    expect(revision).toContain('2026-03-01T10:01:00.000Z');
  });

  it('finds the latest session end event by iterating backwards', async () => {
    const latest = await findLatestSessionEndEvent(
      'session-1',
      createReader([
        { eventId: 'evt-1', type: 'SESSION_STARTED', createdAt: new Date(), data: {} },
        { eventId: 'evt-2', type: 'SESSION_ENDED', createdAt: new Date(), data: {} },
        { eventId: 'evt-3', type: 'XP_BREAKDOWN_COMPUTED', createdAt: new Date(), data: {} },
      ]),
      new Set(['SESSION_ENDED']),
    );

    expect(latest?.eventId).toBe('evt-2');
  });

  it('returns null when no matching end event exists', async () => {
    const latest = await findLatestSessionEndEvent(
      'session-1',
      createReader([
        { eventId: 'evt-1', type: 'SESSION_STARTED', createdAt: new Date(), data: {} },
      ]),
      new Set(['SESSION_ENDED']),
    );

    expect(latest).toBeNull();
  });

  it('returns null when latest end event lookup throws', async () => {
    const latest = await findLatestSessionEndEvent(
      'session-1',
      {
        readStream: async () => {
          throw new Error('boom');
        },
      },
      new Set(['SESSION_ENDED']),
    );

    expect(latest).toBeNull();
  });

  it('converts stored Emmett events into RawVersionedEvent format', () => {
    const raw = emmettEventToRawVersionedEvent(
      {
        eventId: 'evt-1',
        type: 'SESSION_ENDED',
        createdAt: new Date('2026-03-01T10:00:00.000Z'),
        data: {
          schemaVersion: 3,
          reason: 'completed',
        },
      } as never,
      'session-1',
    );

    expect(raw).toEqual({
      id: 'evt-1',
      sessionId: 'session-1',
      type: 'SESSION_ENDED',
      timestamp: new Date('2026-03-01T10:00:00.000Z').getTime(),
      schemaVersion: 3,
      reason: 'completed',
    });
  });

  it('returns all session events in raw format and handles read errors', async () => {
    const events = await getSessionEventsFromEmmett(
      'session-1',
      createReader([
        {
          eventId: 'evt-1',
          type: 'SESSION_STARTED',
          createdAt: new Date('2026-03-01T10:00:00.000Z'),
          data: {},
        },
      ]),
    );

    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('SESSION_STARTED');

    const failingReader: EventStreamReader = {
      readStream: async () => {
        throw new Error('boom');
      },
    };

    await expect(getSessionEventsFromEmmett('session-1', failingReader)).resolves.toEqual([]);
  });
});
