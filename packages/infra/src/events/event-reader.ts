import type { EventQuery, GameEvent, PersistencePort, StoredEvent } from '@neurodual/logic';

const RESERVED_ENVELOPE_KEYS = new Set(['id', 'type', 'sessionId', 'timestamp']);

function toProjectorEvent(event: GameEvent): Record<string, unknown> {
  const payload: Record<string, unknown> = { type: event.type };
  for (const [key, value] of Object.entries(event as unknown as Record<string, unknown>)) {
    if (RESERVED_ENVELOPE_KEYS.has(key)) continue;
    payload[key] = value;
  }
  return payload;
}

function storedEventToGameEvent(row: StoredEvent): GameEvent {
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row.payload ?? {})) {
    if (RESERVED_ENVELOPE_KEYS.has(key)) continue;
    payload[key] = value;
  }

  return {
    ...payload,
    id: row.id,
    type: row.type as GameEvent['type'],
    sessionId: row.session_id,
    timestamp: Number(row.timestamp),
  } as GameEvent;
}

function applyEventQueryFilters(events: GameEvent[], q: EventQuery): GameEvent[] {
  const allowedTypes = q.type ? (Array.isArray(q.type) ? q.type : [q.type]) : null;
  return events
    .filter((event) => {
      if (q.sessionId && event.sessionId !== q.sessionId) return false;
      if (q.after !== undefined && event.timestamp <= q.after) return false;
      if (q.before !== undefined && event.timestamp >= q.before) return false;
      if (allowedTypes && !allowedTypes.includes(event.type)) return false;
      return true;
    })
    .sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));
}

export interface EventReader {
  getSessionEvents(sessionId: string): Promise<GameEvent[]>;
  queryEvents(query?: EventQuery): Promise<GameEvent[]>;
  getAllEvents(): Promise<GameEvent[]>;
  getSessionProjectorEvents(sessionId: string): Promise<unknown[]>;
}

/**
 * Centralized event read path backed by PersistencePort (Emmett canonical store).
 * Keeps read access unified across features (history/admin/replay/etc.).
 */
export function createEventReader(persistence: PersistencePort): EventReader {
  return {
    async getSessionEvents(sessionId: string): Promise<GameEvent[]> {
      const stored = await persistence.getSession(sessionId);
      return applyEventQueryFilters(stored.map(storedEventToGameEvent), { sessionId });
    },

    async queryEvents(query: EventQuery = {}): Promise<GameEvent[]> {
      if (query.sessionId) {
        const stored = await persistence.getSession(query.sessionId);
        return applyEventQueryFilters(stored.map(storedEventToGameEvent), query);
      }

      const stored = await persistence.all();
      return applyEventQueryFilters(stored.map(storedEventToGameEvent), query);
    },

    async getAllEvents(): Promise<GameEvent[]> {
      const stored = await persistence.all();
      return applyEventQueryFilters(stored.map(storedEventToGameEvent), {});
    },

    async getSessionProjectorEvents(sessionId: string): Promise<unknown[]> {
      const stored = await persistence.getSession(sessionId);
      const events = applyEventQueryFilters(stored.map(storedEventToGameEvent), { sessionId });
      return events.map(toProjectorEvent);
    },
  };
}
