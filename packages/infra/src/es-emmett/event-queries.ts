// packages/infra/src/es-emmett/event-queries.ts
/**
 * Centralized SQL queries for emt_* tables.
 *
 * Golden Rule: This module (together with the rest of es-emmett/) is the ONLY
 * place where raw SQL referencing emt_messages, emt_streams, or emt_subscriptions
 * may appear. All other modules MUST use these functions.
 *
 * Organized by concern:
 * 1. SQL Fragments — reusable SELECT / WHERE / ORDER snippets
 * 2. Read Queries — full-event and end-event reads
 * 3. Count Queries — COUNT(*) helpers
 * 4. Mutation Queries — archive (soft-delete) and userId rewrite
 * 5. Metadata Queries — stream version, session IDs, event-by-id
 * 6. Signal Queries — lightweight queries for PowerSync watchers (zero json_extract)
 * 7. Diagnostic Queries — integrity checks, anomaly detection
 */

import type { AbstractPowerSyncDatabase } from '@powersync/web';

import { sessionStreamIdSql, sessionStreamFilterSql, sessionStreamEqualsSql } from './stream-id';
import { buildInClause } from '../db/sql-helpers';

// =============================================================================
// 0. Table Name Constants
// =============================================================================

/** Emmett messages table — the single source of truth for domain events. */
export const EMT_EVENTS_TABLE = 'emt_messages' as const;

/** Emmett streams table — tracks stream versions (optimistic concurrency). */
export const EMT_STREAMS_TABLE = 'emt_streams' as const;

/** Emmett subscriptions table — projection processor checkpoints. */
export const EMT_SUBSCRIPTIONS_TABLE = 'emt_subscriptions' as const;

// =============================================================================
// 1. SQL Fragments
// =============================================================================

/**
 * Standard SELECT columns for full event reads.
 * Returns the "legacy StoredEvent" shape expected by most consumers.
 */
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

/**
 * SELECT columns for end-event reads (projection/history use case).
 * Lighter than eventSelectColumns — no user_id, deleted, synced.
 */
export function eventEndSelectColumns(alias: string = ''): string {
  const p = alias ? `${alias}.` : '';
  return `${p}message_id as id,
    ${sessionStreamIdSql(`${p}stream_id`)} as session_id,
    ${p}message_type as type,
    CAST(json_extract(${p}message_data, '$.data.timestamp') AS INTEGER) as timestamp,
    json_extract(${p}message_data, '$.data') as payload`;
}

/**
 * SELECT columns for signal watches (zero json_extract for performance).
 * Used by PowerSync reactive watches.
 */
export function eventSignalSelectColumns(alias: string = 'em'): string {
  return `${alias}.message_id as id,
    ${sessionStreamIdSql(`${alias}.stream_id`)} as session_id,
    ${alias}.message_type as type,
    CAST(${alias}.global_position AS INTEGER) as timestamp,
    0 as deleted`;
}

/** Base WHERE clause for active (non-archived) events */
export function eventBaseWhere(alias: string = ''): string {
  const p = alias ? `${alias}.` : '';
  return `${p}message_kind = 'E' AND ${p}is_archived = 0`;
}

/** ORDER BY global_position ASC */
export function eventOrderAsc(alias: string = ''): string {
  const p = alias ? `${alias}.` : '';
  return `ORDER BY CAST(${p}global_position AS INTEGER) ASC`;
}

/** ORDER BY global_position DESC */
export function eventOrderDesc(alias: string = ''): string {
  const p = alias ? `${alias}.` : '';
  return `ORDER BY CAST(${p}global_position AS INTEGER) DESC`;
}

// =============================================================================
// 2. Read Queries
// =============================================================================

/** Result shape for full event reads */
export interface EventRow {
  readonly id: string;
  readonly user_id: string | null;
  readonly session_id: string | null;
  readonly type: string;
  readonly timestamp: number;
  readonly payload: string | Record<string, unknown>;
  readonly created_at: string;
  readonly updated_at: string;
  readonly deleted: 0;
  readonly synced: 1;
}

/** Result shape for end-event reads */
export interface EventEndRow {
  readonly id: string;
  readonly session_id: string;
  readonly type: string;
  readonly timestamp: number;
  readonly payload: string | Record<string, unknown>;
}

/** Result shape for end-event reads with global_position */
export interface EventEndRowWithPosition extends EventEndRow {
  readonly global_position: string;
}

/**
 * Get all events for a single session, ordered by global_position ASC.
 */
export async function getSessionEvents(
  db: AbstractPowerSyncDatabase,
  sessionId: string,
): Promise<EventRow[]> {
  return db.getAll<EventRow>(
    `SELECT ${eventSelectColumns()}
     FROM emt_messages
     WHERE ${eventBaseWhere()}
       AND ${sessionStreamEqualsSql('stream_id')}
     ${eventOrderAsc()}`,
    [sessionId, sessionId],
  );
}

/**
 * Get all session events across all sessions, ordered by global_position ASC.
 */
export async function getAllSessionEvents(db: AbstractPowerSyncDatabase): Promise<EventRow[]> {
  return db.getAll<EventRow>(
    `SELECT ${eventSelectColumns()}
     FROM emt_messages
     WHERE ${eventBaseWhere()}
       AND ${sessionStreamFilterSql('stream_id')}
     ${eventOrderAsc()}`,
  );
}

export interface QueryEventsOptions {
  readonly sessionId?: string;
  readonly types?: readonly string[];
  /** message_id of the event to start after (exclusive) */
  readonly afterEventId?: string;
  /** timestamp upper bound (exclusive) */
  readonly beforeTimestamp?: number;
}

/**
 * Query events with optional filters.
 * Replaces powersync-persistence-adapter.queryEvents().
 */
export async function querySessionEvents(
  db: AbstractPowerSyncDatabase,
  options: QueryEventsOptions,
): Promise<EventRow[]> {
  const conditions: string[] = [eventBaseWhere(), sessionStreamFilterSql('stream_id')];
  const params: unknown[] = [];

  if (options.sessionId) {
    conditions.push(sessionStreamEqualsSql('stream_id'));
    params.push(options.sessionId, options.sessionId);
  }

  if (options.types && options.types.length > 0) {
    const { sql, params: inParams } = buildInClause(Array.from(options.types));
    conditions.push(`message_type IN ${sql}`);
    params.push(...inParams);
  }

  if (options.afterEventId !== undefined) {
    conditions.push(
      `CAST(global_position AS INTEGER) > (
         SELECT CAST(global_position AS INTEGER)
         FROM emt_messages
         WHERE message_kind = 'E' AND is_archived = 0 AND message_id = ?
         LIMIT 1
       )`,
    );
    params.push(options.afterEventId);
  }

  if (options.beforeTimestamp !== undefined) {
    conditions.push(`CAST(json_extract(message_data, '$.data.timestamp') AS INTEGER) < ?`);
    params.push(options.beforeTimestamp);
  }

  return db.getAll<EventRow>(
    `SELECT ${eventSelectColumns()}
     FROM emt_messages
     WHERE ${conditions.join(' AND ')}
     ${eventOrderAsc()}`,
    params,
  );
}

/**
 * Get all session-end events, ordered by global_position ASC.
 *
 * @param endTypes - Set of event types that signal session end
 * @param userId - Optional userId filter (via json_extract)
 */
export async function getSessionEndEvents(
  db: AbstractPowerSyncDatabase,
  endTypes: readonly string[],
  userId?: string,
): Promise<EventEndRow[]> {
  const { sql: typesSql, params: typesParams } = buildInClause(Array.from(endTypes));
  const conditions = [
    eventBaseWhere(),
    sessionStreamFilterSql('stream_id'),
    `message_type IN ${typesSql}`,
  ];
  const params: unknown[] = [...typesParams];

  if (userId) {
    conditions.push(`json_extract(message_data, '$.data.userId') = ?`);
    params.push(userId);
  }

  return db.getAll<EventEndRow>(
    `SELECT ${eventEndSelectColumns()}
     FROM emt_messages
     WHERE ${conditions.join(' AND ')}
     ${eventOrderAsc()}`,
    params,
  );
}

/**
 * Get session-end events for specific session IDs (chunked for SQLite bind limits).
 */
export async function getSessionEndEventsForSessions(
  db: AbstractPowerSyncDatabase,
  sessionIds: readonly string[],
  endTypes: readonly string[],
): Promise<EventEndRow[]> {
  if (sessionIds.length === 0) return [];

  const { sql: typesSql, params: typesParams } = buildInClause(Array.from(endTypes));
  const MAX_BIND = 900;
  const allRows: EventEndRow[] = [];

  for (let i = 0; i < sessionIds.length; i += MAX_BIND) {
    const chunk = sessionIds.slice(i, i + MAX_BIND);
    const { sql: idsSql, params: idsParams } = buildInClause(Array.from(chunk));
    const rows = await db.getAll<EventEndRow>(
      `SELECT ${eventEndSelectColumns()}
       FROM emt_messages
       WHERE ${eventBaseWhere()}
         AND ${sessionStreamFilterSql('stream_id')}
         AND ${sessionStreamIdSql('stream_id')} IN ${idsSql}
         AND message_type IN ${typesSql}
       ${eventOrderAsc()}`,
      [...idsParams, ...typesParams],
    );
    allRows.push(...rows);
  }

  return allRows;
}

/**
 * Get session-end events with global_position, for catch-up after a checkpoint.
 */
export async function getSessionEndEventsAfterPosition(
  db: AbstractPowerSyncDatabase,
  endTypes: readonly string[],
  afterPosition: bigint | number,
  limit: number,
): Promise<EventEndRowWithPosition[]> {
  const { sql: typesSql, params: typesParams } = buildInClause(Array.from(endTypes));
  return db.getAll<EventEndRowWithPosition>(
    `SELECT global_position,
       ${eventEndSelectColumns()}
     FROM emt_messages
     WHERE ${eventBaseWhere()}
       AND ${sessionStreamFilterSql('stream_id')}
       AND message_type IN ${typesSql}
       AND CAST(global_position AS INTEGER) > CAST(? AS INTEGER)
     ${eventOrderAsc()}
     LIMIT ?`,
    [...typesParams, String(afterPosition), limit],
  );
}

/**
 * Get the latest session-end event for a specific session.
 */
export async function getLatestSessionEndEvent(
  db: AbstractPowerSyncDatabase,
  sessionId: string,
  endTypes: readonly string[],
): Promise<EventEndRow | null> {
  const { sql: typesSql, params: typesParams } = buildInClause(Array.from(endTypes));
  const row = await db.getOptional<EventEndRow>(
    `SELECT ${eventEndSelectColumns()}
     FROM emt_messages
     WHERE ${eventBaseWhere()}
       AND ${sessionStreamEqualsSql('stream_id')}
       AND message_type IN ${typesSql}
     ${eventOrderDesc()}
     LIMIT 1`,
    [sessionId, sessionId, ...typesParams],
  );
  return row ?? null;
}

/**
 * Get the latest end events for multiple sessions (one per session, max global_position).
 * Uses CTE for efficiency.
 */
export async function getLatestEndEventsForSessions(
  db: AbstractPowerSyncDatabase,
  streamIds: readonly string[],
  endTypes: readonly string[],
): Promise<EventEndRow[]> {
  if (streamIds.length === 0) return [];

  const { sql: streamsSql, params: streamsParams } = buildInClause(Array.from(streamIds));
  const { sql: typesSql, params: typesParams } = buildInClause(Array.from(endTypes));

  return db.getAll<EventEndRow>(
    `WITH latest AS (
       SELECT stream_id, MAX(CAST(global_position AS INTEGER)) as max_pos
       FROM emt_messages
       WHERE ${eventBaseWhere()}
         AND stream_id IN ${streamsSql}
         AND message_type IN ${typesSql}
       GROUP BY stream_id
     )
     SELECT
       m.message_id as id,
       ${sessionStreamIdSql('m.stream_id')} as session_id,
       m.message_type as type,
       CAST(json_extract(m.message_data, '$.data.timestamp') AS INTEGER) as timestamp,
       json_extract(m.message_data, '$.data') as payload
     FROM emt_messages m
     JOIN latest l ON l.stream_id = m.stream_id
       AND CAST(m.global_position AS INTEGER) = l.max_pos
     WHERE m.message_kind = 'E' AND m.is_archived = 0`,
    [...streamsParams, ...typesParams],
  );
}

/**
 * Get events by their PowerSync row IDs (for unsynced event reads).
 * Chunked to respect SQLite bind limits.
 */
export async function getEventsByRowIds(
  db: AbstractPowerSyncDatabase,
  rowIds: readonly string[],
): Promise<EventRow[]> {
  if (rowIds.length === 0) return [];

  const MAX_BIND = 900;
  const allRows: EventRow[] = [];

  for (let i = 0; i < rowIds.length; i += MAX_BIND) {
    const chunk = rowIds.slice(i, i + MAX_BIND);
    const { sql, params } = buildInClause(Array.from(chunk));
    const rows = await db.getAll<EventRow>(
      `SELECT ${eventSelectColumns()}
       FROM emt_messages
       WHERE id IN ${sql}
         AND ${eventBaseWhere()}
       ORDER BY CAST(json_extract(message_data, '$.data.timestamp') AS INTEGER)`,
      params,
    );
    allRows.push(...rows);
  }

  return allRows;
}

// =============================================================================
// 3. Count Queries
// =============================================================================

/** Count all active session events. */
export async function countAllSessionEvents(db: AbstractPowerSyncDatabase): Promise<number> {
  const row = await db.getOptional<{ count: number }>(
    `SELECT CAST(COUNT(*) AS INTEGER) as count
     FROM emt_messages
     WHERE ${eventBaseWhere()}
       AND ${sessionStreamFilterSql('stream_id')}`,
  );
  return row?.count ?? 0;
}

/** Count events for a specific session. */
export async function countSessionEvents(
  db: AbstractPowerSyncDatabase,
  sessionId: string,
): Promise<number> {
  const row = await db.getOptional<{ count: number }>(
    `SELECT COUNT(*) as count FROM emt_messages
     WHERE ${eventBaseWhere()}
       AND ${sessionStreamEqualsSql('stream_id')}`,
    [sessionId, sessionId],
  );
  return row?.count ?? 0;
}

/** Count events with local/null userId (for migration detection). */
export async function countLocalUserEvents(db: AbstractPowerSyncDatabase): Promise<number> {
  const row = await db.getOptional<{ count: number }>(
    `SELECT COUNT(*) as count FROM (
       SELECT 1 FROM emt_messages
       WHERE ${eventBaseWhere()}
         AND ${sessionStreamFilterSql('stream_id')}
         AND (
           json_extract(message_data, '$.data.userId') = 'local'
           OR json_extract(message_data, '$.data.userId') IS NULL
           OR json_extract(message_data, '$.data.userId') = ''
         )
       LIMIT 1
     )`,
  );
  return row?.count ?? 0;
}

/** Count events owned by 'local' userId (for auth transition migration). */
export async function countLocalOwnerEvents(db: AbstractPowerSyncDatabase): Promise<number> {
  const row = await db.getOptional<{ count: number }>(
    `SELECT COUNT(*) as count FROM emt_messages
     WHERE ${sessionStreamFilterSql('stream_id')}
       AND message_kind = 'E'
       AND (
         json_extract(message_data, '$.data.userId') = 'local'
         OR json_extract(message_data, '$.data.userId') IS NULL
         OR json_extract(message_data, '$.data.userId') = ''
       )
       AND is_archived = 0`,
  );
  return row?.count ?? 0;
}

// =============================================================================
// 4. Mutation Queries
// =============================================================================

/** Archive (soft-delete) all events for a session. */
export async function archiveSessionEvents(
  db: { execute(sql: string, params?: unknown[]): Promise<unknown> },
  sessionId: string,
): Promise<void> {
  await db.execute(
    `UPDATE emt_messages SET is_archived = 1
     WHERE message_kind = 'E' AND ${sessionStreamEqualsSql('stream_id')}`,
    [sessionId, sessionId],
  );
}

/** Archive all event messages. */
export async function archiveAllEvents(db: {
  execute(sql: string, params?: unknown[]): Promise<unknown>;
}): Promise<void> {
  await db.execute(`UPDATE emt_messages SET is_archived = 1 WHERE message_kind = 'E'`);
}

/** Archive events by their message_id (chunked). */
export async function archiveEventsByMessageIds(
  db: { execute(sql: string, params?: unknown[]): Promise<unknown> },
  messageIds: readonly string[],
): Promise<void> {
  if (messageIds.length === 0) return;
  const { sql, params } = buildInClause(Array.from(messageIds));
  await db.execute(`UPDATE emt_messages SET is_archived = 1 WHERE message_id IN ${sql}`, params);
}

/**
 * Rewrite userId in event message_data for local→authenticated migration.
 * Updates all events in a session stream that have local/null/empty userId.
 */
export async function rewriteSessionUserId(
  db: { execute(sql: string, params?: unknown[]): Promise<unknown> },
  sessionId: string,
  newUserId: string,
): Promise<void> {
  await db.execute(
    `UPDATE emt_messages
     SET message_data = json_set(message_data, '$.data.userId', ?)
     WHERE message_kind = 'E' AND is_archived = 0
       AND ${sessionStreamEqualsSql('stream_id')}
       AND (
         json_extract(message_data, '$.data.userId') = 'local'
         OR json_extract(message_data, '$.data.userId') IS NULL
         OR json_extract(message_data, '$.data.userId') = ''
       )`,
    [newUserId, sessionId, sessionId],
  );
}

// =============================================================================
// 5. Metadata Queries
// =============================================================================

/**
 * Get stream version (position) from emt_streams.
 * Returns null if stream not found.
 */
export async function getStreamVersion(
  db: AbstractPowerSyncDatabase,
  streamId: string,
  partition: string = 'global',
): Promise<bigint | null> {
  const row = await db.getOptional<{ stream_position: string | null }>(
    `SELECT stream_position FROM emt_streams
     WHERE stream_id = ? AND partition = ? AND is_archived = 0
     LIMIT 1`,
    [streamId, partition],
  );
  if (!row || row.stream_position === null) return null;
  return BigInt(row.stream_position);
}

/**
 * Get a single event by its message_id.
 * Returns the raw Emmett row (not the legacy shape).
 */
export interface RawEventRow {
  readonly message_id: string;
  readonly stream_id: string;
  readonly stream_position: string;
  readonly global_position: string;
  readonly message_type: string;
  readonly message_data: string;
  readonly created: string;
}

export async function getEventByMessageId(
  db: AbstractPowerSyncDatabase,
  messageId: string,
): Promise<RawEventRow | null> {
  const row = await db.getOptional<RawEventRow>(
    `SELECT message_id, stream_id, stream_position, global_position,
            message_type, message_data, created
     FROM emt_messages
     WHERE message_id = ? AND message_kind = 'E' AND is_archived = 0
     LIMIT 1`,
    [messageId],
  );
  return row ?? null;
}

/** Get all distinct session IDs from emt_messages. */
export async function getDistinctSessionIds(db: AbstractPowerSyncDatabase): Promise<string[]> {
  const rows = await db.getAll<{ session_id: string }>(
    `SELECT DISTINCT ${sessionStreamIdSql('stream_id')} as session_id
     FROM emt_messages
     WHERE ${eventBaseWhere()}
       AND ${sessionStreamFilterSql('stream_id')}
     ORDER BY session_id`,
  );
  return rows.map((r) => r.session_id).filter((id): id is string => id != null && id !== '');
}

/** Get userId for a session (first non-null userId found). */
export async function getSessionUserId(
  db: AbstractPowerSyncDatabase,
  sessionId: string,
): Promise<string | null> {
  const row = await db.getOptional<{ user_id: string | null }>(
    `SELECT json_extract(message_data, '$.data.userId') as user_id
     FROM emt_messages
     WHERE ${eventBaseWhere()}
       AND ${sessionStreamEqualsSql('stream_id')}
       AND json_extract(message_data, '$.data.userId') IS NOT NULL
     LIMIT 1`,
    [sessionId, sessionId],
  );
  return row?.user_id ?? null;
}

/**
 * Get distinct session IDs for sessions owned by local/null/empty userId.
 * Used by auth transition migration.
 */
export async function getLocalOwnerSessionIds(db: AbstractPowerSyncDatabase): Promise<string[]> {
  const rows = await db.getAll<{ session_id: string }>(
    `SELECT DISTINCT ${sessionStreamIdSql('stream_id')} as session_id
     FROM emt_messages
     WHERE ${sessionStreamFilterSql('stream_id')}
       AND message_kind = 'E' AND is_archived = 0
       AND (
         json_extract(message_data, '$.data.userId') = 'local'
         OR json_extract(message_data, '$.data.userId') IS NULL
         OR json_extract(message_data, '$.data.userId') = ''
       )`,
  );
  return rows.map((r) => r.session_id).filter((id): id is string => id != null && id !== '');
}

/**
 * Get distinct session IDs owned by a specific user.
 * Used by auth transition migration and diagnostics.
 */
export async function getUserSessionIds(
  db: AbstractPowerSyncDatabase,
  userId: string,
): Promise<string[]> {
  const rows = await db.getAll<{ session_id: string }>(
    `SELECT DISTINCT ${sessionStreamIdSql('stream_id')} as session_id
     FROM emt_messages
     WHERE ${sessionStreamFilterSql('stream_id')}
       AND message_kind = 'E' AND is_archived = 0
       AND json_extract(message_data, '$.data.userId') = ?`,
    [userId],
  );
  return rows.map((r) => r.session_id).filter((id): id is string => id != null && id !== '');
}

// =============================================================================
// 6. Signal Queries (for PowerSync reactive watchers)
// =============================================================================

/** Result shape for signal queries */
export interface EventSignalRow {
  readonly id: string;
  readonly session_id: string | null;
  readonly type: string;
  readonly timestamp: number;
  readonly deleted: 0;
}

/**
 * Build a signal query for watching events by type.
 * Returns SQL + params for use with PowerSync watch().
 * Zero json_extract for maximum performance.
 */
export function buildEventSignalQuery(
  types: readonly string[],
  limit: number = 500,
): { sql: string; params: unknown[] } {
  const { sql: typesSql, params: typesParams } = buildInClause(Array.from(types));
  return {
    sql: `SELECT ${eventSignalSelectColumns('em')}
     FROM emt_messages em
     WHERE em.message_kind = 'E'
       AND em.is_archived = 0
       AND ${sessionStreamFilterSql('em.stream_id')}
       AND em.message_type IN ${typesSql}
     ORDER BY em.global_position DESC, em.message_id DESC
     LIMIT ${Math.max(50, Math.min(5000, limit))}`,
    params: typesParams,
  };
}

/**
 * Build a query for watching/reading session events.
 * Returns SQL + params for use with PowerSync watch() or getAll().
 */
export function buildSessionEventsWatchQuery(sessionId: string): {
  sql: string;
  params: unknown[];
} {
  return {
    sql: `SELECT ${eventSelectColumns('em')}
     FROM emt_messages em
     WHERE ${sessionStreamEqualsSql('em.stream_id')}
       AND em.message_kind = 'E' AND em.is_archived = 0
     ORDER BY CAST(json_extract(em.message_data, '$.data.timestamp') AS INTEGER) ASC, em.message_id ASC`,
    params: [sessionId, sessionId],
  };
}

/**
 * Build a count query for event signal types.
 * Returns SQL + params for use with PowerSync watch().
 */
export function buildEventSignalCountQuery(types: readonly string[]): {
  sql: string;
  params: unknown[];
} {
  const { sql: typesSql, params: typesParams } = buildInClause(Array.from(types));
  return {
    sql: `SELECT COUNT(*) as count
     FROM emt_messages em
     WHERE em.message_kind = 'E'
       AND em.is_archived = 0
       AND ${sessionStreamFilterSql('em.stream_id')}
       AND em.message_type IN ${typesSql}`,
    params: typesParams,
  };
}

// =============================================================================
// 7. Diagnostic Queries
// =============================================================================

export interface EmtTableCounts {
  readonly emt_messages_count: number;
  readonly emt_streams_count: number;
  readonly emt_subscriptions_count: number;
}

/** Get row counts for all emt_* tables. */
export async function getEmtTableCounts(db: AbstractPowerSyncDatabase): Promise<EmtTableCounts> {
  const safeCount = async (table: string): Promise<number> => {
    try {
      const row = await db.getOptional<{ c: number }>(`SELECT COUNT(*) as c FROM ${table}`);
      return row?.c ?? 0;
    } catch {
      return -1;
    }
  };

  const [messages, streams, subscriptions] = await Promise.all([
    safeCount('emt_messages'),
    safeCount('emt_streams'),
    safeCount('emt_subscriptions'),
  ]);

  return {
    emt_messages_count: messages,
    emt_streams_count: streams,
    emt_subscriptions_count: subscriptions,
  };
}

export interface EmtMessageDetails {
  readonly emt_distinct_streams: number;
  readonly emt_oldest_created: string | null;
  readonly emt_newest_created: string | null;
  readonly emt_archived_count: number;
  readonly emt_message_types: Record<string, number>;
}

/** Get detailed emt_messages diagnostics. */
export async function getEmtMessageDetails(
  db: AbstractPowerSyncDatabase,
): Promise<EmtMessageDetails> {
  const safeScalar = async <T>(sql: string, fallback: T): Promise<T> => {
    try {
      const row = await db.getOptional<Record<string, unknown>>(sql);
      if (!row) return fallback;
      const val = Object.values(row)[0];
      return (val as T) ?? fallback;
    } catch {
      return fallback;
    }
  };

  const [distinctStreams, oldestCreated, newestCreated, archivedCount, typeRows] =
    await Promise.all([
      safeScalar<number>(`SELECT COUNT(DISTINCT stream_id) as c FROM emt_messages`, 0),
      safeScalar<string | null>(
        `SELECT created FROM emt_messages ORDER BY created ASC LIMIT 1`,
        null,
      ),
      safeScalar<string | null>(
        `SELECT created FROM emt_messages ORDER BY created DESC LIMIT 1`,
        null,
      ),
      safeScalar<number>(`SELECT COUNT(*) as c FROM emt_messages WHERE is_archived = 1`, 0),
      (async () => {
        try {
          return await db.getAll<{ t: string; c: number }>(
            `SELECT message_type as t, COUNT(*) as c
             FROM emt_messages GROUP BY message_type ORDER BY c DESC LIMIT 20`,
          );
        } catch {
          return [];
        }
      })(),
    ]);

  const messageTypes: Record<string, number> = {};
  for (const row of typeRows) {
    if (row.t) messageTypes[row.t] = row.c;
  }

  return {
    emt_distinct_streams: distinctStreams,
    emt_oldest_created: oldestCreated,
    emt_newest_created: newestCreated,
    emt_archived_count: archivedCount,
    emt_message_types: messageTypes,
  };
}

/**
 * Find session IDs that have end events but no session_summaries row.
 * Used by persistence-health-adapter and history-projection.
 */
export async function findMissingSessionSummaries(
  db: AbstractPowerSyncDatabase,
  endTypes: readonly string[],
  userId?: string,
): Promise<string[]> {
  const { sql: typesSql, params: typesParams } = buildInClause(Array.from(endTypes));
  const conditions = [
    eventBaseWhere(),
    sessionStreamFilterSql('stream_id'),
    `message_type IN ${typesSql}`,
  ];
  const params: unknown[] = [...typesParams];

  if (userId) {
    conditions.push(`json_extract(message_data, '$.data.userId') = ?`);
    params.push(userId);
  }

  const rows = await db.getAll<{ session_id: string }>(
    `WITH sessions AS (
       SELECT DISTINCT ${sessionStreamIdSql('stream_id')} as session_id
       FROM emt_messages
       WHERE ${conditions.join(' AND ')}
     )
     SELECT session_id FROM sessions
     WHERE session_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM session_summaries s
         WHERE s.session_id = sessions.session_id
       )`,
    params,
  );

  return rows.map((r) => r.session_id);
}

/**
 * Count ended sessions (distinct session IDs with end events).
 */
export async function countEndedSessions(
  db: AbstractPowerSyncDatabase,
  endTypes: readonly string[],
): Promise<number> {
  const { sql: typesSql, params: typesParams } = buildInClause(Array.from(endTypes));
  const row = await db.getOptional<{ count: number }>(
    `SELECT COUNT(*) as count FROM (
       SELECT DISTINCT ${sessionStreamIdSql('stream_id')} as session_id
       FROM emt_messages
       WHERE ${eventBaseWhere()}
         AND ${sessionStreamFilterSql('stream_id')}
         AND message_type IN ${typesSql}
     ) ending_sessions`,
    typesParams,
  );
  return row?.count ?? 0;
}

/**
 * Find session_summaries rows with no matching end event (orphans).
 */
export async function findOrphanSessionSummaries(
  db: AbstractPowerSyncDatabase,
  endTypes: readonly string[],
  userId: string,
): Promise<string[]> {
  const { sql: typesSql, params: typesParams } = buildInClause(Array.from(endTypes));
  const rows = await db.getAll<{ session_id: string }>(
    `SELECT s.session_id
     FROM session_summaries s
     WHERE s.user_id = ?
       AND NOT EXISTS (
         SELECT 1 FROM emt_messages em
         WHERE ${sessionStreamIdSql('em.stream_id')} = s.session_id
           AND em.message_kind = 'E'
           AND em.message_type IN ${typesSql}
           AND json_extract(em.message_data, '$.data.userId') = ?
           AND em.is_archived = 0
       )`,
    [userId, ...typesParams, userId],
  );
  return rows.map((r) => r.session_id);
}

/**
 * Find sessions with mixed owner (both 'local' and authenticated userId).
 */
export async function findMixedOwnerSessions(
  db: AbstractPowerSyncDatabase,
  userId: string,
): Promise<string[]> {
  const rows = await db.getAll<{ session_id: string }>(
    `SELECT ${sessionStreamIdSql('stream_id')} as session_id
     FROM emt_messages
     WHERE ${sessionStreamFilterSql('stream_id')}
       AND message_kind = 'E'
       AND json_extract(message_data, '$.data.userId') IN (?, 'local')
       AND is_archived = 0
     GROUP BY session_id
     HAVING COUNT(DISTINCT json_extract(message_data, '$.data.userId')) > 1`,
    [userId],
  );
  return rows.map((r) => r.session_id);
}

/**
 * Count local-only events for a specific user (for diagnostics).
 */
export async function countLocalEventsForUser(db: AbstractPowerSyncDatabase): Promise<number> {
  const row = await db.getOptional<{ count: number }>(
    `SELECT COUNT(*) as count
     FROM emt_messages
     WHERE ${sessionStreamFilterSql('stream_id')}
       AND message_kind = 'E'
       AND json_extract(message_data, '$.data.userId') = 'local'
       AND is_archived = 0`,
  );
  return row?.count ?? 0;
}

/**
 * Get all ended session IDs from emt_messages (used by sync adapter).
 */
export async function getEndedSessionIds(
  db: AbstractPowerSyncDatabase,
  endTypes: readonly string[],
): Promise<string[]> {
  const { sql: typesSql, params: typesParams } = buildInClause(Array.from(endTypes));
  const rows = await db.getAll<{ session_id: string }>(
    `SELECT DISTINCT ${sessionStreamIdSql('stream_id')} as session_id
     FROM emt_messages
     WHERE ${eventBaseWhere()}
       AND ${sessionStreamFilterSql('stream_id')}
       AND message_type IN ${typesSql}`,
    typesParams,
  );
  return rows.map((r) => r.session_id).filter((id): id is string => id != null);
}

/**
 * Query for badge unlock events (for progression/read-model adapters).
 */
export async function getBadgeUnlockEvents(
  db: AbstractPowerSyncDatabase,
  userId: string,
  authenticatedUserId?: string,
): Promise<EventRow[]> {
  const userIds = [userId];
  if (authenticatedUserId && authenticatedUserId !== userId) {
    userIds.push(authenticatedUserId);
  }
  const { sql: usersSql, params: usersParams } = buildInClause(userIds);
  const includeLegacyLocal = userIds.includes('local');
  const userClause = includeLegacyLocal
    ? `(json_extract(em.message_data, '$.data.userId') IN ${usersSql}
        OR json_extract(em.message_data, '$.data.userId') IS NULL
        OR json_extract(em.message_data, '$.data.userId') = '')`
    : `json_extract(em.message_data, '$.data.userId') IN ${usersSql}`;

  return db.getAll<EventRow>(
    `SELECT ${eventSelectColumns('em')}
     FROM emt_messages em
     WHERE em.message_kind = 'E'
       AND em.is_archived = 0
       AND em.message_type = 'BADGE_UNLOCKED'
       AND ${userClause}
     ${eventOrderAsc('em')}`,
    usersParams,
  );
}

/**
 * Get session events with payload for journey projection maintenance.
 * Extracts journey metadata from session start events.
 */
export async function getJourneyMetadataEvent(
  db: AbstractPowerSyncDatabase,
  journeyId: string,
): Promise<{ payload: string } | null> {
  const row = await db.getOptional<{ payload: string }>(
    `SELECT message_data as payload FROM emt_messages
     WHERE json_extract(message_data, '$.data.journeyId') = ?
       AND json_extract(message_data, '$.data.journeyStartLevel') IS NOT NULL
     ORDER BY CAST(global_position AS INTEGER) ASC LIMIT 1`,
    [journeyId],
  );
  return row ?? null;
}

// =============================================================================
// 8. Stats Queries (for detailed timing/modality analysis)
// =============================================================================

/**
 * Build a stats query that joins against a filtered_sessions CTE.
 * The CTE is provided by the stats-adapter; this function wraps the emt_messages portion.
 *
 * @param messageType - Event type to filter (e.g. 'USER_RESPONDED')
 * @param selectColumns - Custom SELECT columns for the specific stat
 * @param extraWhere - Optional additional WHERE clause
 */
export function buildStatsEventQuery(
  messageType: string,
  selectColumns: string,
  extraWhere: string = '',
): string {
  const extra = extraWhere ? ` AND ${extraWhere}` : '';
  return `SELECT ${selectColumns}
    FROM emt_messages em
    WHERE em.message_kind = 'E' AND em.is_archived = 0
      AND em.stream_id LIKE 'session:%'
      AND em.stream_id IN (SELECT 'session:' || session_id FROM filtered_sessions)
      AND em.message_type = '${messageType}'${extra}`;
}

/**
 * Build a stats query that JOINs filtered_session_ids.
 */
export function buildStatsEventJoinQuery(
  messageType: string,
  selectColumns: string,
  extraWhere: string = '',
): string {
  const extra = extraWhere ? ` AND ${extraWhere}` : '';
  return `SELECT ${selectColumns}
    FROM emt_messages em
    JOIN filtered_session_ids fs ON em.stream_id = 'session:' || fs.session_id
    WHERE em.message_kind = 'E' AND em.is_archived = 0
      AND em.stream_id LIKE 'session:%'
      AND em.message_type = '${messageType}'${extra}`;
}

// =============================================================================
// 9. PowerSync CRUD Queries
// =============================================================================

/** Table name filter for PowerSync CRUD queue */
export const EVENTS_CRUD_TABLE_FILTER = `table_name = 'emt_messages'`;

/** Get pending event IDs from PowerSync CRUD queue */
export async function getPendingCrudEventIds(db: AbstractPowerSyncDatabase): Promise<string[]> {
  try {
    const rows = await db.getAll<{ id: string }>(
      `SELECT id FROM ps_crud WHERE ${EVENTS_CRUD_TABLE_FILTER}`,
    );
    return rows.map((r) => r.id);
  } catch {
    return [];
  }
}

/** Check if there are pending events in the PowerSync CRUD queue */
export async function hasPendingCrudEvents(db: AbstractPowerSyncDatabase): Promise<boolean> {
  try {
    const row = await db.getOptional<{ count: number }>(
      `SELECT COUNT(*) as count FROM (
         SELECT 1 FROM ps_crud WHERE ${EVENTS_CRUD_TABLE_FILTER} LIMIT 1
       )`,
    );
    return Number(row?.count ?? 0) > 0;
  } catch {
    return false;
  }
}
