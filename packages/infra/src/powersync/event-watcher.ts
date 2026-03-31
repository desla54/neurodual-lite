/**
 * PowerSync Event Watcher
 *
 * Provides reactive queries for events using PowerSync WatchedQuery API.
 * Prefer WatchedQuery (`db.query().watch()`) over legacy `db.watch()`.
 */

import type { AbstractPowerSyncDatabase, QueryParam } from '@powersync/web';

import type {
  PowerSyncDeletedSessionRow,
  PowerSyncEventRow,
  PowerSyncEventSignalRow,
  PowerSyncUserResetRow,
} from './schema';
import { powerSyncLog } from '../logger';
import { buildInClause } from '../db/sql-helpers';
import { sessionStreamIdSql } from '../es-emmett/stream-id';
import {
  EMT_EVENTS_TABLE,
  eventBaseWhere,
  eventSelectColumns,
  buildEventSignalQuery,
  buildSessionEventsWatchQuery,
} from '../es-emmett/event-queries';

function userScopeClauseForEvents(
  userId: string,
  userIdColumn: string = 'user_id',
): { clause: string; params: string[] } {
  // Legacy local rows may have NULL/empty user_id. Include them in local scope
  // so projections still run after migrations and on old datasets.
  if (userId === 'local') {
    return {
      clause: `(${userIdColumn} = ? OR ${userIdColumn} IS NULL OR ${userIdColumn} = '')`,
      params: [userId],
    };
  }
  // Keep authenticated scope aligned with UI SQL scope (`effectiveUserIdsWithLocal`):
  // include local/legacy rows so projections can hydrate summaries consistently.
  return {
    clause: `(${userIdColumn} = ? OR ${userIdColumn} = 'local' OR ${userIdColumn} IS NULL OR ${userIdColumn} = '')`,
    params: [userId],
  };
}

function buildUserEventsQuery(options: {
  userId: string;
  selectSql: string;
  orderBySql?: string;
  whereExtraSql?: string;
  extraParams?: unknown[];
  limit?: number;
}): { query: string; params: unknown[] } {
  const { userId, selectSql, orderBySql, whereExtraSql = '', extraParams = [], limit } = options;
  const emettScope = userScopeClauseForEvents(
    userId,
    "json_extract(em.message_data, '$.data.userId')",
  );
  const extraWhere = whereExtraSql ? ` AND (${whereExtraSql})` : '';
  const limitSql = typeof limit === 'number' ? ` LIMIT ${limit}` : '';
  const orderSql = orderBySql ? ` ${orderBySql}` : '';
  const selectExpr = selectSql.replace(/^\s*SELECT\s+/i, '').trim();
  const isCountQuery = /^COUNT\(\*\)\s+as\s+count$/i.test(selectExpr);

  // Maps event column names to emett_messages column expressions
  // Used to dynamically build the emett SELECT based on requested columns
  function mapEmettColumns(selectClause: string): string {
    // If it's a simple SELECT *, use the canonical mapping from event-queries
    if (selectClause === '*') {
      return eventSelectColumns('em');
    }

    // Parse individual column names and map them
    const columnMap: Record<string, string> = {
      id: 'em.message_id as id',
      user_id: "json_extract(em.message_data, '$.data.userId') as user_id",
      session_id: `${sessionStreamIdSql('em.stream_id')} as session_id`,
      type: 'em.message_type as type',
      timestamp: "CAST(json_extract(em.message_data, '$.data.timestamp') AS INTEGER) as timestamp",
      payload: "json_extract(em.message_data, '$.data') as payload",
      created_at: 'em.created as created_at',
      updated_at: 'em.created as updated_at',
      deleted: '0 as deleted',
      synced: '1 as synced',
    };

    // Extract column names from select clause (handle table prefixes like e.id, l.timestamp)
    const columns = selectClause.split(',').map((col) => {
      const trimmed = col.trim();
      // Handle table prefix (e.id -> id)
      const match = trimmed.match(/^[\w.]+\s+as\s+([\w_]+)|^([\w.]+)(?:\s+as\s+[\w_]+)?$/i);
      if (match) {
        const alias = match[1] || match[2];
        if (alias) {
          // Remove table prefix if present
          const colName = alias.includes('.') ? alias.split('.')[1] || alias : alias;
          return columnMap[colName] ?? trimmed;
        }
      }
      return trimmed;
    });

    return columns.join(', ');
  }

  // Transforms WHERE clause column references from event schema to emett_messages schema
  function mapEmettWhereClause(whereClause: string): string {
    if (!whereClause) return '';
    // Map column names in WHERE clause to emett_messages equivalents
    // session_id -> compatible extraction for `session:` and `training:session:`
    // type -> em.message_type
    // user_id -> json_extract(em.message_data, '$.data.userId')
    // deleted -> 0 (emett events are never deleted)
    return whereClause
      .replace(/\bsession_id\b/g, sessionStreamIdSql('em.stream_id'))
      .replace(/\btype\b/g, 'em.message_type')
      .replace(/\buser_id\b/g, "json_extract(em.message_data, '$.data.userId')")
      .replace(/\bdeleted\b/g, '0');
  }

  // Phase 9: Using only emt_messages (all data synced from Supabase)
  // Legacy events/events_local tables removed - no longer needed
  const emettSelect = mapEmettColumns(selectExpr);
  const emettExtraWhere = mapEmettWhereClause(extraWhere);

  if (isCountQuery) {
    return {
      query: `
        SELECT COUNT(*) as count
        FROM ${EMT_EVENTS_TABLE} em
        WHERE ${eventBaseWhere('em')}
          AND ${emettScope.clause}${emettExtraWhere}
      `,
      params: [...emettScope.params, ...extraParams],
    };
  }

  return {
    query: `
      SELECT ${emettSelect}
      FROM ${EMT_EVENTS_TABLE} em
      WHERE ${eventBaseWhere('em')}
        AND ${emettScope.clause}${emettExtraWhere}
      ${orderSql}
      ${limitSql}
    `,
    params: [...emettScope.params, ...extraParams],
  };
}

type ComparableEventRow = Pick<PowerSyncEventRow, 'id' | 'timestamp' | 'deleted'>;

function normalizeId(value: unknown): string {
  if (value == null) return '';
  return String(value);
}

function normalizeTimestamp(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeDeleted(value: unknown): 0 | 1 {
  if (value === true) return 1;
  const n = typeof value === 'number' ? value : Number(value);
  return n === 1 ? 1 : 0;
}

function normalizeCount(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function extractRows<Row>(value: unknown): Row[] {
  if (Array.isArray(value)) return value as Row[];
  // PowerSync WatchedQuery has returned different shapes across SDK/runtime versions.
  // Support both the "rows array" and the legacy execute-like { rows: { _array } } shape.
  const nested = (value as { rows?: { _array?: unknown } } | null | undefined)?.rows?._array;
  return Array.isArray(nested) ? (nested as Row[]) : [];
}

function isUnknownWatchedQueryPayload(value: unknown): boolean {
  if (value == null) return false;
  if (Array.isArray(value)) return false;
  const nested = (value as { rows?: { _array?: unknown } } | null | undefined)?.rows?._array;
  if (Array.isArray(nested)) return false;
  return true;
}

const areEventRowsEqual = (current: unknown, previous: unknown): boolean => {
  const currentRows = extractRows<ComparableEventRow>(current);
  const previousRows = extractRows<ComparableEventRow>(previous);

  if (currentRows.length !== previousRows.length) {
    return false;
  }

  for (let index = 0; index < currentRows.length; index += 1) {
    const currentRow = currentRows[index];
    const previousRow = previousRows[index];

    if (!currentRow || !previousRow) {
      return false;
    }

    if (normalizeId(currentRow.id) !== normalizeId(previousRow.id)) {
      return false;
    }

    // PowerSync/SQLite drivers can return the same column with different JS types
    // across ticks (e.g. number vs string, 0 vs false). Normalize to keep the
    // comparator stable; otherwise WatchedQuery can re-emit continuously.
    if (normalizeTimestamp(currentRow.timestamp) !== normalizeTimestamp(previousRow.timestamp)) {
      return false;
    }
    if (normalizeDeleted(currentRow.deleted) !== normalizeDeleted(previousRow.deleted)) {
      return false;
    }
  }

  return true;
};

const areCountsEqual = (current: unknown, previous: unknown): boolean => {
  const currentCount = normalizeCount(extractRows<{ count: unknown }>(current)[0]?.count);
  const previousCount = normalizeCount(extractRows<{ count: unknown }>(previous)[0]?.count);
  return currentCount === previousCount;
};

let activeWatchSubscriptions = 0;

function trackWatchSubscription(name: string): () => void {
  let closed = false;
  activeWatchSubscriptions += 1;
  powerSyncLog.debug(`[PowerSyncWatch] +1 ${name} (active=${activeWatchSubscriptions})`);

  return () => {
    if (closed) return;
    closed = true;
    activeWatchSubscriptions = Math.max(0, activeWatchSubscriptions - 1);
    powerSyncLog.debug(`[PowerSyncWatch] -1 ${name} (active=${activeWatchSubscriptions})`);
  };
}

export function getActivePowerSyncWatchSubscriptions(): number {
  return activeWatchSubscriptions;
}

/**
 * Callback for event changes
 */
export type EventWatchCallback = (events: PowerSyncEventRow[]) => void;
export type EventSignalWatchCallback = (events: PowerSyncEventSignalRow[]) => void;
export type EventSignalCountWatchCallback = (count: number) => void;

export type DeletedSessionWatchCallback = (rows: PowerSyncDeletedSessionRow[]) => void;
export type UserResetWatchCallback = (rows: PowerSyncUserResetRow[]) => void;

function watchQueryRows<Row>(options: {
  name: string;
  db: AbstractPowerSyncDatabase;
  sql: string;
  params: readonly unknown[];
  comparator?: (current: unknown, previous: unknown) => boolean;
  onRows: (rows: Row[]) => void;
}): () => void {
  const release = trackWatchSubscription(options.name);

  const watchedQuery = options.db
    .query({
      sql: options.sql,
      parameters: options.params as unknown as readonly QueryParam[],
    })
    .watch(
      options.comparator
        ? {
            comparator: {
              checkEquality: options.comparator,
            },
          }
        : undefined,
    );

  const dispose = watchedQuery.registerListener({
    onData: (rows: unknown) => {
      if (isUnknownWatchedQueryPayload(rows)) {
        console.error(
          `[PowerSync] WatchedQuery returned unexpected payload shape (${options.name}). ` +
            'Treating as error to avoid silent empty results.',
          rows,
        );
        return;
      }
      options.onRows(extractRows<Row>(rows));
    },
    onError: (error: unknown) => {
      console.error(`[PowerSync] WatchedQuery error (${options.name}):`, error);
    },
  });

  return () => {
    dispose();
    release();
  };
}

const extractDeletedSessionRows = (value: unknown): PowerSyncDeletedSessionRow[] => {
  return extractRows<PowerSyncDeletedSessionRow>(value);
};

const areDeletedSessionRowsEqual = (current: unknown, previous: unknown): boolean => {
  const currentRows = extractDeletedSessionRows(current);
  const previousRows = extractDeletedSessionRows(previous);

  return (
    currentRows.length === previousRows.length &&
    currentRows.every((curr, idx) => {
      const prev = previousRows[idx];
      if (!prev) return false;
      return (
        normalizeId(curr.id) === normalizeId(prev.id) &&
        String(curr.created_at ?? '') === String(prev.created_at ?? '')
      );
    })
  );
};

const extractUserResetRows = (value: unknown): PowerSyncUserResetRow[] => {
  return extractRows<PowerSyncUserResetRow>(value);
};

const areUserResetRowsEqual = (current: unknown, previous: unknown): boolean => {
  const currentRows = extractUserResetRows(current);
  const previousRows = extractUserResetRows(previous);

  if (currentRows.length !== previousRows.length) {
    return false;
  }

  for (let index = 0; index < currentRows.length; index += 1) {
    const currentRow = currentRows[index];
    const previousRow = previousRows[index];

    if (!currentRow || !previousRow) {
      return false;
    }

    if (
      normalizeId(currentRow.id) !== normalizeId(previousRow.id) ||
      String(currentRow.reset_at ?? '') !== String(previousRow.reset_at ?? '')
    ) {
      return false;
    }
  }

  return true;
};

/**
 * Watch session tombstones for a user.
 * The callback is called immediately with current data, then on every change.
 */
export function watchUserDeletedSessions(
  db: AbstractPowerSyncDatabase,
  userId: string,
  callback: DeletedSessionWatchCallback,
): () => void {
  const query = `
    SELECT * FROM deleted_sessions
    WHERE user_id = ?
    ORDER BY created_at DESC, id DESC
  `;

  return watchQueryRows<PowerSyncDeletedSessionRow>({
    name: 'watchUserDeletedSessions',
    db,
    sql: query,
    params: [userId],
    comparator: areDeletedSessionRowsEqual,
    onRows: (rows) => {
      powerSyncLog.debug('deleted_sessions watch emitted:', rows.length, 'rows');
      callback(rows);
    },
  });
}

/**
 * Watch reset markers for a user.
 *
 * Typically used to trigger a full local wipe after a cross-device reset action.
 */
export function watchUserResets(
  db: AbstractPowerSyncDatabase,
  userId: string,
  callback: UserResetWatchCallback,
): () => void {
  const query = `
    SELECT * FROM user_resets
    WHERE user_id = ?
    ORDER BY reset_at DESC, id DESC
  `;

  return watchQueryRows<PowerSyncUserResetRow>({
    name: 'watchUserResets',
    db,
    sql: query,
    params: [userId],
    comparator: areUserResetRowsEqual,
    onRows: (rows) => callback(rows),
  });
}

/**
 * Watch session events for a user.
 * The callback is called immediately with current data, then on every change.
 *
 * Uses a comparator to prevent callbacks when data hasn't changed.
 *
 * @param db - PowerSync database instance
 * @param userId - User ID to filter events
 * @param callback - Callback when events change
 * @returns Unsubscribe function
 */
export function watchUserEvents(
  db: AbstractPowerSyncDatabase,
  userId: string,
  callback: EventWatchCallback,
): () => void {
  const { query, params } = buildUserEventsQuery({
    userId,
    selectSql: 'SELECT *',
    // Secondary order is critical: without it, rows with same timestamp can reorder
    // across ticks, causing WatchedQuery comparator thrash + repeated callbacks.
    orderBySql: 'ORDER BY timestamp DESC, id DESC',
  });

  return watchQueryRows<PowerSyncEventRow>({
    name: 'watchUserEvents',
    db,
    sql: query,
    params,
    comparator: areEventRowsEqual,
    onRows: (rows) => callback(rows),
  });
}

/**
 * Watch events for a user filtered by event types.
 * Useful to watch only "session-end" events to keep payloads small and avoid heavy processing.
 *
 * Uses a comparator to prevent callbacks when data hasn't changed (PowerSync fires
 * watch callbacks on every sync tick by default).
 */
export function watchUserEventsByTypes(
  db: AbstractPowerSyncDatabase,
  userId: string,
  types: readonly string[],
  callback: EventWatchCallback,
): () => void {
  if (types.length === 0) {
    callback([]);
    return () => {};
  }

  const { sql: typesSql, params: typesParams } = buildInClause(Array.from(types));
  const { query, params } = buildUserEventsQuery({
    userId,
    selectSql: 'SELECT *',
    whereExtraSql: `type IN ${typesSql}`,
    extraParams: typesParams,
    orderBySql: 'ORDER BY timestamp DESC, id DESC',
  });

  return watchQueryRows<PowerSyncEventRow>({
    name: 'watchUserEventsByTypes',
    db,
    sql: query,
    params,
    comparator: areEventRowsEqual,
    onRows: (rows) => callback(rows),
  });
}

/**
 * Watch events for a user filtered by event types, without pulling payloads.
 *
 * This is production-critical for large histories: PowerSync watch streams can re-emit frequently,
 * and selecting the full `payload` for every row scales poorly (memory + GC + SQLite decode).
 *
 * Consumers that need payloads should fetch them on-demand for the changed row IDs.
 */
export function watchUserEventSignalsByTypes(
  db: AbstractPowerSyncDatabase,
  _userId: string,
  types: readonly string[],
  options: { limit?: number } | undefined,
  callback: EventSignalWatchCallback,
): () => void {
  if (types.length === 0) {
    callback([]);
    return () => {};
  }

  // Performance-critical: this query is re-evaluated by PowerSync on EVERY write
  // to emt_messages. Zero json_extract — only direct/indexed columns.
  // User scoping is unnecessary: PowerSync sync rules already filter by user,
  // so all local emt_messages belong to the current user.
  const { sql: signalSql, params: signalParams } = buildEventSignalQuery(
    types,
    options?.limit ?? 500,
  );

  return watchQueryRows<PowerSyncEventSignalRow>({
    name: 'watchUserEventSignalsByTypes',
    db,
    sql: signalSql,
    params: signalParams,
    comparator: areEventRowsEqual,
    onRows: (rows) => callback(rows),
  });
}

/**
 * Watch the COUNT(*) of event signals for selected types.
 *
 * This is used as a robust trigger path when row-level signal streams are limited
 * (e.g. top-N query): count changes still fire even if the changed rows are outside
 * the limited window.
 */
export function watchUserEventSignalCountByTypes(
  db: AbstractPowerSyncDatabase,
  userId: string,
  types: readonly string[],
  callback: EventSignalCountWatchCallback,
): () => void {
  if (types.length === 0) {
    callback(0);
    return () => {};
  }

  const { sql: typesSql, params: typesParams } = buildInClause(Array.from(types));
  const { query, params } = buildUserEventsQuery({
    userId,
    selectSql: 'SELECT COUNT(*) as count',
    whereExtraSql: `session_id IS NOT NULL AND session_id != '' AND type IN ${typesSql} AND (deleted IS NULL OR deleted = 0)`,
    extraParams: typesParams,
  });

  return watchQueryRows<{ count: number }>({
    name: 'watchUserEventSignalCountByTypes',
    db,
    sql: query,
    params,
    comparator: areCountsEqual,
    onRows: (rows) => callback(Number(rows[0]?.count ?? 0)),
  });
}

/**
 * Watch events for a specific session.
 *
 * Uses a comparator to prevent callbacks when data hasn't changed.
 *
 * @param db - PowerSync database instance
 * @param sessionId - Session ID to filter events
 * @param callback - Callback when events change
 * @returns Unsubscribe function
 */
export function watchSessionEvents(
  db: AbstractPowerSyncDatabase,
  sessionId: string,
  callback: EventWatchCallback,
): () => void {
  // Phase 9: Emmett store is the single source of truth for events.
  const { sql: sessionSql, params: sessionParams } = buildSessionEventsWatchQuery(sessionId);

  return watchQueryRows<PowerSyncEventRow>({
    name: 'watchSessionEvents',
    db,
    sql: sessionSql,
    params: sessionParams,
    comparator: areEventRowsEqual,
    onRows: (rows) => callback(rows),
  });
}

/**
 * Watch for new SESSION_ENDED events (for triggering cascade updates).
 * This is the replacement for eventStore.onPersisted('SESSION_ENDED', ...).
 *
 * Uses a comparator to prevent callbacks when count hasn't changed.
 *
 * @param db - PowerSync database instance
 * @param userId - User ID to filter events
 * @param callback - Callback when SESSION_ENDED events change
 * @returns Unsubscribe function
 */
export function watchSessionEnded(
  db: AbstractPowerSyncDatabase,
  userId: string,
  callback: (count: number) => void,
): () => void {
  const { query, params } = buildUserEventsQuery({
    userId,
    selectSql: 'SELECT COUNT(*) as count',
    whereExtraSql: `type = 'SESSION_ENDED'
      AND session_id IS NOT NULL
      AND session_id != ''
      AND (deleted IS NULL OR deleted = 0)`,
  });

  let lastCount: number | null = null;

  return watchQueryRows<{ count: number }>({
    name: 'watchSessionEnded',
    db,
    sql: query,
    params,
    comparator: areCountsEqual,
    onRows: (rows) => {
      const count = Number(rows[0]?.count ?? 0);
      if (lastCount !== null && count !== lastCount) {
        callback(count);
      }
      lastCount = count;
    },
  });
}

/**
 * Get events for a user (one-time query, not reactive).
 *
 * @param db - PowerSync database instance
 * @param userId - User ID to filter events
 * @returns Array of events
 */
export async function getUserEvents(
  db: AbstractPowerSyncDatabase,
  userId: string,
): Promise<PowerSyncEventRow[]> {
  const { query, params } = buildUserEventsQuery({
    userId,
    selectSql: 'SELECT *',
    whereExtraSql: `session_id IS NOT NULL AND session_id != '' AND (deleted IS NULL OR deleted = 0)`,
    orderBySql: 'ORDER BY timestamp DESC',
  });
  const result = await db.execute(query, params);

  return (result.rows?._array ?? []) as PowerSyncEventRow[];
}

/**
 * Get events for a specific session (one-time query).
 *
 * @param db - PowerSync database instance
 * @param sessionId - Session ID to filter events
 * @returns Array of events
 */
export async function getSessionEvents(
  db: AbstractPowerSyncDatabase,
  sessionId: string,
): Promise<PowerSyncEventRow[]> {
  const { sql: sessionSql, params: sessionParams } = buildSessionEventsWatchQuery(sessionId);
  const result = await db.execute(sessionSql, sessionParams);

  return (result.rows?._array ?? []) as PowerSyncEventRow[];
}
