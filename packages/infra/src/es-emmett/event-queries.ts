/**
 * Event Queries — lightweight replacement for the Emmett event store queries.
 *
 * Reads from session_events (JSON blob) instead of emt_messages.
 * Legacy emt_messages queries are kept as best-effort fallbacks.
 */

import type { AbstractPowerSyncDatabase } from '@powersync/web';
import { sessionStreamIdSql, sessionStreamFilterSql } from './stream-id';

// =============================================================================
// Table Name Constants (kept for backward compat)
// =============================================================================

export const EMT_EVENTS_TABLE = 'emt_messages' as const;
export const EMT_STREAMS_TABLE = 'emt_streams' as const;
export const EMT_SUBSCRIPTIONS_TABLE = 'emt_subscriptions' as const;

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
  // Legacy emt_messages column compat (used by powersync-persistence-adapter)
  message_id?: string;
  message_data?: string;
  message_type?: string;
  stream_id?: string;
  created?: string | null;
}

// =============================================================================
// SQL Fragments
// =============================================================================

export function eventSelectColumns(alias: string = ''): string {
  const p = alias ? `${alias}.` : '';
  return `${p}message_id as id,
    json_extract(${p}message_data, '$.data.userId') as user_id,
    ${sessionStreamIdSql(`${p}stream_id`)} as session_id,
    ${p}message_type as type,
    CAST(json_extract(${p}message_data, '$.data.timestamp') AS INTEGER) as timestamp,
    json_extract(${p}message_data, '$.data') as payload,
    ${p}created as created_at,
    ${p}created as updated_at,
    0 as deleted,
    1 as synced`;
}

export function eventEndSelectColumns(alias: string = ''): string {
  const p = alias ? `${alias}.` : '';
  return `${p}message_id as id,
    ${sessionStreamIdSql(`${p}stream_id`)} as session_id,
    ${p}message_type as type,
    CAST(json_extract(${p}message_data, '$.data.timestamp') AS INTEGER) as timestamp,
    json_extract(${p}message_data, '$.data') as payload`;
}

export function eventSignalSelectColumns(alias: string = 'em'): string {
  return `${alias}.message_id as id,
    ${sessionStreamIdSql(`${alias}.stream_id`)} as session_id,
    ${alias}.message_type as type,
    CAST(${alias}.global_position AS INTEGER) as timestamp,
    0 as deleted`;
}

export function eventBaseWhere(alias: string = ''): string {
  const p = alias ? `${alias}.` : '';
  return `${p}message_kind = 'E' AND ${p}is_archived = 0`;
}

export function eventOrderAsc(alias: string = ''): string {
  const p = alias ? `${alias}.` : '';
  return `ORDER BY CAST(${p}global_position AS INTEGER) ASC`;
}

export function eventOrderDesc(alias: string = ''): string {
  const p = alias ? `${alias}.` : '';
  return `ORDER BY CAST(${p}global_position AS INTEGER) DESC`;
}

export function buildEventSignalCountQuery(..._args: unknown[]): { sql: string; params: unknown[] } {
  return { sql: `SELECT COUNT(*) as c FROM ${EMT_EVENTS_TABLE} WHERE ${eventBaseWhere()}`, params: [] };
}

// =============================================================================
// Core Read: session_events first, emt_messages fallback
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
  // Try session_events first
  try {
    const rows = await db.getAll<{ events_json: string }>(
      'SELECT events_json FROM session_events WHERE session_id = ? LIMIT 1',
      [sessionId],
    );
    if (rows.length > 0 && rows[0]?.events_json) {
      return parseSessionEventsJson(rows[0].events_json, sessionId);
    }
  } catch { /* fallback */ }

  // Fallback: emt_messages (legacy)
  try {
    const rows = await db.getAll<{
      message_id: string;
      message_type: string;
      message_data: string;
      global_position: string;
      created: string;
    }>(
      `SELECT message_id, message_type, message_data, global_position, created
       FROM ${EMT_EVENTS_TABLE}
       WHERE ${sessionStreamFilterSql('stream_id')}
         AND ${eventBaseWhere()}
         AND (stream_id = 'session:' || ? OR stream_id = 'training:session:' || ?)
       ${eventOrderAsc()}`,
      [sessionId, sessionId],
    );
    return rows.map((row) => {
      let parsed: Record<string, unknown> = {};
      try {
        const envelope = JSON.parse(row.message_data) as Record<string, unknown>;
        parsed = (envelope['data'] as Record<string, unknown>) ?? envelope;
      } catch { /* skip */ }
      return {
        id: row.message_id ?? `${sessionId}:${row.global_position}`,
        session_id: sessionId,
        type: row.message_type,
        timestamp: typeof parsed['timestamp'] === 'number' ? (parsed['timestamp'] as number) : 0,
        payload: parsed,
        global_position: row.global_position,
        created_at: row.created,
      };
    });
  } catch { return []; }
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
  } catch { /* fallback */ }
  return 0;
}

export async function countAllSessionEvents(db: AbstractPowerSyncDatabase): Promise<number> {
  try {
    const rows = await db.getAll<{ c: number }>('SELECT COUNT(*) as c FROM session_events');
    return rows[0]?.c ?? 0;
  } catch { return 0; }
}

export async function countLocalUserEvents(_db: AbstractPowerSyncDatabase): Promise<number> {
  return 0;
}

export async function countLocalEventsForUser(_db: AbstractPowerSyncDatabase): Promise<number> {
  return 0;
}

export async function countLocalOwnerEvents(_db: AbstractPowerSyncDatabase): Promise<number> {
  return 0;
}

export async function countEndedSessions(
  db: AbstractPowerSyncDatabase,
  ..._args: unknown[]
): Promise<number> {
  try {
    const rows = await db.getAll<{ c: number }>(
      "SELECT COUNT(*) as c FROM session_summaries WHERE reason = 'completed'",
    );
    return rows[0]?.c ?? 0;
  } catch { return 0; }
}

export async function getStreamVersion(
  _db: AbstractPowerSyncDatabase,
  _streamId: string,
): Promise<bigint | null> {
  return null;
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

export async function getUserSessionIds(
  db: AbstractPowerSyncDatabase,
  ..._args: unknown[]
): Promise<string[]> {
  return getDistinctSessionIds(db);
}

export async function getLocalOwnerSessionIds(db: AbstractPowerSyncDatabase): Promise<string[]> {
  return getDistinctSessionIds(db);
}

// =============================================================================
// Session End Events
// =============================================================================

export async function getSessionEndEvents(
  db: AbstractPowerSyncDatabase,
  sessionIdOrTypes: string | readonly string[] | ReadonlySet<string>,
  ..._rest: unknown[]
): Promise<EventRow[]> {
  // If called with a types array/set (legacy usage from history-projection), return empty.
  // The history-projection should not be active anymore (DirectCommandBus writes directly).
  if (typeof sessionIdOrTypes !== 'string') {
    return [];
  }
  const all = await getSessionEvents(db, sessionIdOrTypes);
  return all.filter((e) => e.type.endsWith('_ENDED') || e.type === 'SESSION_IMPORTED');
}

export async function getSessionEndEventsForSessions(
  db: AbstractPowerSyncDatabase,
  sessionIds: readonly string[],
  ..._rest: unknown[]
): Promise<EventRow[]> {
  const result: EventRow[] = [];
  for (const sid of sessionIds) {
    result.push(...(await getSessionEndEvents(db, sid)));
  }
  return result;
}

export async function getLatestSessionEndEvent(
  db: AbstractPowerSyncDatabase,
  sessionId: string,
  ..._rest: unknown[]
): Promise<EventRow | null> {
  const ends = await getSessionEndEvents(db, sessionId);
  return ends.length > 0 ? ends[ends.length - 1]! : null;
}

export async function getSessionEndEventsAfterPosition(
  _db: AbstractPowerSyncDatabase,
  ..._args: unknown[]
): Promise<EventRow[]> {
  return [];
}

export async function getLatestEndEventsForSessions(
  db: AbstractPowerSyncDatabase,
  sessionIds: readonly string[],
  ..._rest: unknown[]
): Promise<EventRow[]> {
  return getSessionEndEventsForSessions(db, sessionIds);
}

// =============================================================================
// Badge Events — read from session_summaries.xp_breakdown
// =============================================================================

export async function getBadgeUnlockEvents(
  _db: AbstractPowerSyncDatabase,
  ..._userIds: unknown[]
): Promise<EventRow[]> {
  // Badges are no longer stored as events in emt_messages.
  // Read from session_summaries.xp_breakdown which contains badge data.
  // For now return empty — badges will be populated by DirectCommandBus.
  return [];
}

// =============================================================================
// Mutations
// =============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function archiveSessionEvents(
  tx: any,
  sessionId: string,
): Promise<void> {
  try { await tx.execute('DELETE FROM session_events WHERE session_id = ?', [sessionId]); } catch { /* */ }
  try {
    await tx.execute(
      `UPDATE ${EMT_EVENTS_TABLE} SET is_archived = 1
       WHERE (stream_id = 'session:' || ? OR stream_id = 'training:session:' || ?) AND is_archived = 0`,
      [sessionId, sessionId],
    );
  } catch { /* */ }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function archiveAllEvents(_db: any): Promise<void> { /* no-op */ }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function archiveEventsByMessageIds(_db: any, _ids: readonly string[]): Promise<void> { /* no-op */ }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function rewriteSessionUserId(_db: any, ..._args: unknown[]): Promise<void> { /* no-op */ }

// =============================================================================
// Diagnostic / Sync Queries (stubs)
// =============================================================================

export async function getPendingCrudEventIds(_db: AbstractPowerSyncDatabase): Promise<string[]> { return []; }
export async function hasPendingCrudEvents(_db: AbstractPowerSyncDatabase): Promise<boolean> { return false; }
export async function getEventsByRowIds(_db: AbstractPowerSyncDatabase, _ids: readonly string[]): Promise<EventRow[]> { return []; }
export async function getEventByMessageId(_db: AbstractPowerSyncDatabase, _messageId: string): Promise<EventRow | null> { return null; }
export async function findMissingSessionSummaries(_db: AbstractPowerSyncDatabase, ..._args: unknown[]): Promise<string[]> { return []; }
export async function findOrphanSessionSummaries(_db: AbstractPowerSyncDatabase, ..._args: unknown[]): Promise<string[]> { return []; }
export async function findMixedOwnerSessions(_db: AbstractPowerSyncDatabase, ..._args: unknown[]): Promise<string[]> { return []; }
export async function getEmtTableCounts(_db: AbstractPowerSyncDatabase): Promise<Record<string, number>> { return {}; }
export async function getEmtMessageDetails(_db: AbstractPowerSyncDatabase): Promise<{
  emt_distinct_streams: number;
  emt_oldest_created: null;
  emt_newest_created: null;
  emt_archived_count: number;
  emt_message_types: Record<string, number>;
}> {
  return { emt_distinct_streams: 0, emt_oldest_created: null, emt_newest_created: null, emt_archived_count: 0, emt_message_types: {} };
}

// =============================================================================
// Stats Queries — return SQL fragments for backward compat
// =============================================================================

export function buildStatsEventQuery(..._args: unknown[]): { sql: string; params: unknown[] } {
  return { sql: 'SELECT 1 WHERE 0', params: [] };
}

export function buildStatsEventJoinQuery(..._args: unknown[]): { sql: string; params: unknown[] } {
  return { sql: 'SELECT 1 WHERE 0', params: [] };
}

// =============================================================================
// Bulk reads (for getAllSessionEvents / querySessionEvents)
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
