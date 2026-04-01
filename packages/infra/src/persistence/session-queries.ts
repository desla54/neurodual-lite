/**
 * Session Queries — reads from session_events (JSON blob) and session_summaries.
 *
 * Replaces es-emmett/event-queries.ts after Emmett removal.
 */

import type { AbstractPowerSyncDatabase } from '@powersync/web';

// =============================================================================
// Types
// =============================================================================

export interface EventRow {
  id: string;
  user_id?: string | null;
  session_id: string;
  type: string;
  timestamp: number;
  payload: string | Record<string, unknown>;
  created_at?: string | null;
  updated_at?: string | null;
  deleted?: number;
  synced?: number;
  global_position?: string;
}

// =============================================================================
// Core Read: session_events
// =============================================================================

function parseSessionEventsJson(
  eventsJson: string,
  sessionId: string,
): EventRow[] {
  const rawEvents = JSON.parse(eventsJson) as Record<string, unknown>[];
  return rawEvents.map((e, i) => ({
    id: typeof e['id'] === 'string' ? (e['id'] as string) : `${sessionId}:${i}`,
    user_id: typeof e['userId'] === 'string' ? (e['userId'] as string) : null,
    session_id: sessionId,
    type: String(e['type'] ?? ''),
    timestamp: typeof e['timestamp'] === 'number' ? (e['timestamp'] as number) : 0,
    payload: e,
  }));
}

export async function getSessionEvents(
  db: AbstractPowerSyncDatabase,
  sessionId: string,
): Promise<EventRow[]> {
  try {
    const rows = await db.getAll<{ events_json: string }>(
      'SELECT events_json FROM session_events WHERE session_id = ? LIMIT 1',
      [sessionId],
    );
    if (rows.length > 0 && rows[0]?.events_json) {
      return parseSessionEventsJson(rows[0].events_json, sessionId);
    }
  } catch { /* empty */ }
  return [];
}

// =============================================================================
// Count / Metadata Queries
// =============================================================================

export async function countSessionEvents(
  db: AbstractPowerSyncDatabase,
  sessionId: string,
): Promise<number> {
  try {
    const rows = await db.getAll<{ events_json: string }>(
      'SELECT events_json FROM session_events WHERE session_id = ? LIMIT 1',
      [sessionId],
    );
    if (rows.length > 0 && rows[0]?.events_json) {
      return (JSON.parse(rows[0].events_json) as unknown[]).length;
    }
  } catch { /* empty */ }
  return 0;
}

export async function countAllSessionEvents(db: AbstractPowerSyncDatabase): Promise<number> {
  try {
    const rows = await db.getAll<{ c: number }>('SELECT COUNT(*) as c FROM session_events');
    return rows[0]?.c ?? 0;
  } catch { return 0; }
}

export async function getSessionUserId(
  db: AbstractPowerSyncDatabase,
  sessionId: string,
): Promise<string | null> {
  // Try session_summaries first (fastest)
  try {
    const rows = await db.getAll<{ user_id: string | null }>(
      'SELECT user_id FROM session_summaries WHERE session_id = ? LIMIT 1',
      [sessionId],
    );
    if (rows[0]?.user_id) return rows[0].user_id;
  } catch { /* fallback */ }

  // Try session_events
  const events = await getSessionEvents(db, sessionId);
  for (const e of events) {
    const payload = typeof e.payload === 'string' ? JSON.parse(e.payload) as Record<string, unknown> : e.payload;
    const uid = payload['userId'];
    if (typeof uid === 'string' && uid.trim().length > 0) return uid.trim();
  }
  return null;
}

export async function getDistinctSessionIds(db: AbstractPowerSyncDatabase): Promise<string[]> {
  try {
    const rows = await db.getAll<{ session_id: string }>('SELECT DISTINCT session_id FROM session_events');
    return rows.map((r) => r.session_id);
  } catch { return []; }
}

// =============================================================================
// Session End Events
// =============================================================================

export async function getSessionEndEvents(
  db: AbstractPowerSyncDatabase,
  sessionId: string,
): Promise<EventRow[]> {
  const all = await getSessionEvents(db, sessionId);
  return all.filter((e) => e.type.endsWith('_ENDED') || e.type === 'SESSION_IMPORTED');
}

export async function getLatestEndEventsForSessions(
  db: AbstractPowerSyncDatabase,
  sessionIds: readonly string[],
): Promise<EventRow[]> {
  const result: EventRow[] = [];
  for (const sid of sessionIds) {
    result.push(...(await getSessionEndEvents(db, sid)));
  }
  return result;
}

/**
 * Get all session-end events across all sessions matching the given end types.
 * Replaces es-emmett getSessionEndEvents(db, endTypes).
 */
export async function getAllSessionEndEvents(
  db: AbstractPowerSyncDatabase,
  endTypes: readonly string[],
): Promise<EventRow[]> {
  const sessionIds = await getDistinctSessionIds(db);
  const result: EventRow[] = [];
  for (const sid of sessionIds) {
    const events = await getSessionEvents(db, sid);
    result.push(...events.filter((e) => endTypes.includes(e.type)));
  }
  return result;
}

/**
 * Get end events for specific sessions matching the given end types.
 * Replaces es-emmett getSessionEndEventsForSessions(db, sessionIds, endTypes).
 */
export async function getSessionEndEventsForSessions(
  db: AbstractPowerSyncDatabase,
  sessionIds: readonly string[],
  endTypes: readonly string[],
): Promise<EventRow[]> {
  const result: EventRow[] = [];
  for (const sid of sessionIds) {
    const events = await getSessionEvents(db, sid);
    result.push(...events.filter((e) => endTypes.includes(e.type)));
  }
  return result;
}

/**
 * Find session IDs that have end events but no session_summaries row.
 * Replaces es-emmett findMissingSessionSummaries(db, endTypes, userId?).
 */
export async function findMissingSessionSummaries(
  db: AbstractPowerSyncDatabase,
  endTypes: readonly string[],
  _userId?: string,
): Promise<string[]> {
  const sessionIds = await getDistinctSessionIds(db);
  const missing: string[] = [];
  for (const sid of sessionIds) {
    const events = await getSessionEvents(db, sid);
    const hasEnd = events.some((e) => endTypes.includes(e.type));
    if (!hasEnd) continue;
    try {
      const row = await db.getOptional<{ c: number }>(
        'SELECT COUNT(*) as c FROM session_summaries WHERE session_id = ?',
        [sid],
      );
      if ((row?.c ?? 0) === 0) missing.push(sid);
    } catch { /* empty */ }
  }
  return missing;
}

/**
 * Get the latest session-end event for a specific session.
 * Replaces es-emmett getLatestSessionEndEvent(db, sessionId, endTypes).
 */
export async function getLatestSessionEndEvent(
  db: AbstractPowerSyncDatabase,
  sessionId: string,
  endTypes: readonly string[],
): Promise<EventRow | null> {
  const events = await getSessionEvents(db, sessionId);
  const endEvents = events.filter((e) => endTypes.includes(e.type));
  if (endEvents.length === 0) return null;
  // Return the one with the highest timestamp
  return endEvents.reduce((latest, e) =>
    e.timestamp > latest.timestamp ? e : latest,
  );
}

/**
 * Get session-end events after a given global position.
 * Replaces es-emmett getSessionEndEventsAfterPosition.
 *
 * Post-Emmett: session_events has no global_position column; we return all
 * end events whose timestamp (used as a proxy position) exceeds `afterPosition`.
 */
export async function getSessionEndEventsAfterPosition(
  db: AbstractPowerSyncDatabase,
  endTypes: readonly string[],
  afterPosition: bigint | number,
  limit: number,
): Promise<(EventRow & { global_position: string })[]> {
  const afterTs = Number(afterPosition);
  const allEnd = await getAllSessionEndEvents(db, endTypes);
  return allEnd
    .filter((e) => e.timestamp > afterTs)
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(0, limit)
    .map((e) => ({ ...e, global_position: String(e.timestamp) }));
}

/**
 * Build a lightweight count query for PowerSync reactive watches.
 * Replaces es-emmett buildEventSignalCountQuery.
 */
export function buildEventSignalCountQuery(_types: readonly string[]): {
  sql: string;
  params: unknown[];
} {
  return {
    sql: 'SELECT COUNT(*) as count FROM session_events',
    params: [],
  };
}

/**
 * Get the stream version for a session (proxy: event count).
 * Replaces es-emmett getStreamVersion.
 */
export async function getStreamVersion(
  db: AbstractPowerSyncDatabase,
  streamId: string,
): Promise<bigint> {
  // streamId format: "session:{sessionId}"
  const sessionId = streamId.startsWith('session:') ? streamId.slice(8) : streamId;
  const count = await countSessionEvents(db, sessionId);
  return BigInt(count);
}

// =============================================================================
// Mutations
// =============================================================================

export async function deleteSessionEventsById(
  // biome-ignore lint/suspicious/noExplicitAny: transaction type varies
  tx: any,
  sessionId: string,
): Promise<void> {
  try { await tx.execute('DELETE FROM session_events WHERE session_id = ?', [sessionId]); } catch { /* */ }
}

// =============================================================================
// Bulk reads
// =============================================================================

export async function getAllSessionEvents(db: AbstractPowerSyncDatabase): Promise<EventRow[]> {
  const sessionIds = await getDistinctSessionIds(db);
  const all: EventRow[] = [];
  for (const sid of sessionIds) {
    all.push(...(await getSessionEvents(db, sid)));
  }
  return all;
}

export async function querySessionEvents(
  db: AbstractPowerSyncDatabase,
  options: {
    sessionId?: string;
    types?: string[];
    afterEventId?: string;
    beforeTimestamp?: number;
  },
): Promise<EventRow[]> {
  if (options.sessionId) {
    return getSessionEvents(db, options.sessionId);
  }
  return getAllSessionEvents(db);
}
