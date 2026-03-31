// packages/infra/src/history/emmett-session-reader.ts
/**
 * Emmett Session Reader
 *
 * Helper functions for reading session events from Emmett event store.
 * Replaces direct SQL queries on events_all VIEW.
 *
 * Phase 3 Migration: Use readStream() for O(log n) indexed reads instead of full table scan.
 */

import type { StoredEvent as EmmettStoredEvent } from '../es-emmett/powersync-emmett-event-store';

// =============================================================================
// Types
// =============================================================================

export interface SessionRevision {
  count: number;
  maxTs: number;
  maxUpdatedAt: string;
}

export interface EventStreamReader {
  readStream(args: {
    streamId: { aggregateType: string; aggregateId: string };
    fromVersion?: bigint;
    maxCount?: bigint;
  }): Promise<{
    currentStreamVersion: bigint;
    streamExists: boolean;
    events: readonly unknown[];
  }>;
}

// =============================================================================
// Session Reader Functions
// =============================================================================

/**
 * Get session revision (count, max timestamp, max updated_at) from event stream.
 * This replaces the SQL query on events_all VIEW.
 *
 * @param sessionId - Session ID to read
 * @param eventReader - Event reader (CommandBus or EmmettEventStore)
 * @returns Session revision string for cache invalidation
 */
export async function getSessionRevisionFromEmmett(
  sessionId: string,
  eventReader: EventStreamReader,
): Promise<string> {
  try {
    const result = await eventReader.readStream({
      streamId: { aggregateType: 'session', aggregateId: sessionId },
    });

    if (!result.streamExists || result.events.length === 0) {
      return '0:0';
    }

    const count = result.events.length;

    // Get max timestamp from events
    let maxTs = 0;
    for (const event of result.events) {
      const stored = event as EmmettStoredEvent;
      const ts = stored.createdAt?.getTime() ?? 0;
      if (ts > maxTs) maxTs = ts;
    }

    // For updated_at, use the max timestamp as a proxy
    // (Emmett doesn't track updated_at separately for events)
    const maxUpdatedAt = maxTs > 0 ? new Date(maxTs).toISOString() : '';

    return `events:${count}:${maxTs}:${maxUpdatedAt}`;
  } catch (error) {
    console.error('[EmmettSessionReader] Failed to get session revision:', {
      sessionId,
      error: error instanceof Error ? error.message : String(error),
    });
    return '0:0';
  }
}

/**
 * Find the latest session end event from the event stream.
 * This replaces the SQL query on events_all VIEW for repairing summaries.
 *
 * @param sessionId - Session ID to read
 * @param eventReader - Event reader (CommandBus or EmmettEventStore)
 * @param endEventTypes - Event types that indicate session end
 * @returns The latest end event or null
 */
export async function findLatestSessionEndEvent(
  sessionId: string,
  eventReader: EventStreamReader,
  endEventTypes: ReadonlySet<string>,
): Promise<EmmettStoredEvent | null> {
  try {
    // Read all events for the session (we need to find the end event)
    // TODO: Add pagination or cursor-based query for sessions with many events
    const result = await eventReader.readStream({
      streamId: { aggregateType: 'session', aggregateId: sessionId },
    });

    if (!result.streamExists) {
      return null;
    }

    // Find the latest event that matches an end type
    // Events are ordered by stream_position (ascending), so we iterate backwards
    for (let i = result.events.length - 1; i >= 0; i--) {
      const event = result.events[i] as EmmettStoredEvent;
      if (endEventTypes.has(event.type)) {
        return event;
      }
    }

    return null;
  } catch (error) {
    console.error('[EmmettSessionReader] Failed to find latest session end event:', {
      sessionId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Convert Emmett StoredEvent to RawVersionedEvent format.
 * This maintains compatibility with the existing migration pipeline.
 */
export function emmettEventToRawVersionedEvent(
  storedEvent: EmmettStoredEvent,
  sessionId: string,
): {
  id: string;
  sessionId: string;
  type: string;
  timestamp: number;
  schemaVersion: number;
  [key: string]: unknown;
} {
  return {
    id: storedEvent.eventId,
    sessionId,
    type: storedEvent.type,
    timestamp: storedEvent.createdAt.getTime(),
    schemaVersion: (storedEvent.data['schemaVersion'] as number) ?? 1,
    ...storedEvent.data,
  };
}

/**
 * Get all events for a session from Emmett event store.
 * This replaces persistence.getSession() for sessions in Emmett.
 *
 * @param sessionId - Session ID to read
 * @param eventReader - Event reader (CommandBus or EmmettEventStore)
 * @returns Array of raw versioned events
 */
export async function getSessionEventsFromEmmett(
  sessionId: string,
  eventReader: EventStreamReader,
): Promise<
  {
    id: string;
    sessionId: string;
    type: string;
    timestamp: number;
    schemaVersion: number;
    [key: string]: unknown;
  }[]
> {
  try {
    const result = await eventReader.readStream({
      streamId: { aggregateType: 'session', aggregateId: sessionId },
    });

    if (!result.streamExists) {
      return [];
    }

    return result.events.map((event) =>
      emmettEventToRawVersionedEvent(event as EmmettStoredEvent, sessionId),
    );
  } catch (error) {
    console.error('[EmmettSessionReader] Failed to get session events:', {
      sessionId,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}
