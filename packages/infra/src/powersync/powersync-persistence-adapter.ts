import type {
  AlgorithmStateResult,
  BadgeHistorySnapshot,
  EventInput,
  EventQueryOptions,
  PersistenceWriteTransaction,
  PersistencePort,
  SessionSummariesOptions,
  SessionSummaryInput,
  SessionSummaryRow,
  StoredEvent,
  StreakInfo,
} from '@neurodual/logic';
import type { AbstractPowerSyncDatabase } from '@powersync/web';

import { persistenceLog } from '../logger';
import { createDrizzleClient, type NeuroDualDrizzleDatabase } from '../db/drizzle';
import { bulkDeleteWhereIn, bulkInsert } from '../db/sql-executor';
import {
  getSqlInstrumentationMode,
  instrumentPowerSyncDb,
} from '../persistence/instrumented-persistence';
import { openPowerSyncDatabase } from './database';
import { isLikelyClosedPowerSyncError, isLikelyFatalPowerSyncStorageError } from './runtime-policy';
import type { EmmettEventStore } from '../es-emmett/powersync-emmett-event-store';
import { createEmmettEventStore } from '../es-emmett/powersync-emmett-event-store';
import { parseSessionIdFromStreamId } from '../es-emmett/stream-id';
import {
  getSessionEvents,
  querySessionEvents,
  getAllSessionEvents,
  countAllSessionEvents,
  countSessionEvents,
  getSessionUserId,
  archiveSessionEvents,
  archiveAllEvents,
  archiveEventsByMessageIds,
  getPendingCrudEventIds,
  getEventsByRowIds,
  hasPendingCrudEvents,
  getEventByMessageId,
  getDistinctSessionIds,
} from '../es-emmett/event-queries';
import { rebuildStatsProjectionsForUser } from '../projections/session-summaries-projection';
import {
  SESSION_SUMMARY_INSERT_COLUMNS,
  sessionSummaryInsertValues,
} from './session-summary-schema';
import {
  buildProjectionScopeClause,
  buildSessionSummaryScopeClause,
  effectiveUserIdsWithLocal,
} from '../user/user-scope';

// Avoid confusion with similarly-named domain types (e.g. types/progression.DailyActivity).
type DailyActivity = { date: string; count: number };

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number') return new Date(value).toISOString();
  if (typeof value === 'string') {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return new Date().toISOString();
}

function computeDaysSince(dateString: string | null | undefined): number | null {
  if (!dateString) return null;
  const parsed = Date.parse(dateString);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.floor((Date.now() - parsed) / 86400000));
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function normalizeBool(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return value === '1' || value.toLowerCase() === 'true';
  return false;
}

function parseStoredEventRow(row: Record<string, unknown>): StoredEvent {
  const rawSessionId = row['session_id'];
  const sessionId = typeof rawSessionId === 'string' ? rawSessionId : '';
  return {
    id: String(row['id']),
    user_id:
      row['user_id'] === null || row['user_id'] === undefined ? null : String(row['user_id']),
    session_id: sessionId,
    type: String(row['type']),
    timestamp: Number(row['timestamp']),
    payload: parseJsonObject(row['payload']),
    created_at:
      typeof row['created_at'] === 'string'
        ? (row['created_at'] as string)
        : toIso(row['created_at']),
    updated_at:
      typeof row['updated_at'] === 'string'
        ? (row['updated_at'] as string)
        : toIso(row['updated_at']),
    deleted: normalizeBool(row['deleted']),
    // synced is always true for events from PowerSync (ps_crud handles pending uploads)
    // For events_local, we read from the column if present
    synced: row['synced'] !== undefined ? normalizeBool(row['synced']) : true,
  };
}

function parseSessionSummaryRow(row: Record<string, unknown>): SessionSummaryRow {
  const byModality = parseJsonObject(row['by_modality']);
  const xpBreakdown =
    row['xp_breakdown'] == null ? null : (parseJsonObject(row['xp_breakdown']) as unknown);
  const playContext =
    row['play_context'] === 'journey' ||
    row['play_context'] === 'free' ||
    row['play_context'] === 'synergy' ||
    row['play_context'] === 'calibration' ||
    row['play_context'] === 'profile'
      ? row['play_context']
      : null;

  return {
    ...(row as unknown as Omit<SessionSummaryRow, 'by_modality' | 'xp_breakdown'>),
    play_context: playContext,
    by_modality: byModality,
    xp_breakdown: xpBreakdown as Record<string, unknown> | null,
  };
}

export {
  SESSION_SUMMARY_INSERT_COLUMNS,
  sessionSummaryInsertValues,
} from './session-summary-schema';

function toSqlCommentLabel(value: string): string {
  return value.replace(/[^a-zA-Z0-9:_-]/g, '_');
}

/**
 * Emmett note: `emt_messages.message_data` stores an envelope `{ id, type, data }`.
 * All SQL read paths assume `data.userId` and `data.timestamp` exist.
 */
function toEmmettMessageData(event: EventInput): Record<string, unknown> {
  const payload =
    event.payload && typeof event.payload === 'object'
      ? (event.payload as Record<string, unknown>)
      : {};

  return {
    ...payload,
    id: event.id,
    type: event.type,
    sessionId: event.sessionId,
    timestamp: event.timestamp,
    ...(typeof event.userId === 'string' ? { userId: event.userId } : {}),
  };
}

export class PowerSyncPersistenceAdapter implements PersistencePort {
  private db: AbstractPowerSyncDatabase | null = null;
  private drizzleDb: NeuroDualDrizzleDatabase | null = null;
  private emmettEventStore: EmmettEventStore | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private onErrorCallback: ((error: Error) => void) | null = null;

  private reportFatal(error: unknown): void {
    if (!this.onErrorCallback) return;
    if (!isLikelyFatalPowerSyncStorageError(error)) return;
    const err = error instanceof Error ? error : new Error(String(error));
    this.onErrorCallback(err);
  }

  private resetConnectionState(): void {
    this.db = null;
    this.drizzleDb = null;
    this.emmettEventStore = null;
    this.initialized = false;
    this.initPromise = null;
  }

  private async withRecoveredDb<T>(
    operation: (db: AbstractPowerSyncDatabase) => Promise<T>,
  ): Promise<T> {
    let recovered = false;

    while (true) {
      const db = await this.ensureReady();
      try {
        return await operation(db);
      } catch (error) {
        if (recovered || !isLikelyClosedPowerSyncError(error)) {
          throw error;
        }
        this.resetConnectionState();
        recovered = true;
      }
    }
  }

  private async ensureReady(): Promise<AbstractPowerSyncDatabase> {
    if (this.initialized && this.db && this.drizzleDb) return this.db;
    await this.init();
    if (!this.db) {
      throw new Error('[PowerSyncPersistence] Database not available after init');
    }
    return this.db;
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    this.initPromise ??= (async () => {
      const totalStart = performance.now();

      // 1. Open PowerSync database
      const openStart = performance.now();
      const rawDb = await openPowerSyncDatabase();
      const sqlInstrumentationMode = getSqlInstrumentationMode();
      const db =
        sqlInstrumentationMode !== null
          ? instrumentPowerSyncDb(rawDb, { mode: sqlInstrumentationMode })
          : rawDb;
      const openDuration = performance.now() - openStart;
      if (openDuration > 500) {
        console.warn(
          `[PowerSyncAdapter] ⚠️ openPowerSyncDatabase took ${openDuration.toFixed(0)}ms`,
        );
      }
      this.db = db;
      this.drizzleDb = createDrizzleClient(db);

      // Phase 7: events_all VIEW creation removed - all reads now use emt_messages directly
      this.initialized = true;

      const totalDuration = performance.now() - totalStart;
      if (totalDuration > 1000) {
        console.warn(`[PowerSyncAdapter] ⚠️ Total init time: ${totalDuration.toFixed(0)}ms`);
      }
    })();
    await this.initPromise;
  }

  async close(): Promise<void> {
    // The app owns the global PowerSync DB lifecycle (pagehide/unmount).
    // PersistencePort.close is therefore best-effort.
    this.resetConnectionState();
  }

  getDrizzleDb(): NeuroDualDrizzleDatabase {
    if (!this.drizzleDb) {
      throw new Error('[PowerSyncPersistence] Drizzle database not available');
    }
    return this.drizzleDb;
  }

  /**
   * Get the raw PowerSync database instance.
   * Used for Emmett event store which requires direct PowerSync API access.
   */
  async getPowerSyncDb(): Promise<AbstractPowerSyncDatabase> {
    return this.ensureReady();
  }

  /**
   * Get the Emmett event store for indexed event reads.
   * Returns null if the database is not yet initialized.
   */
  async getEventStore(): Promise<EmmettEventStore | null> {
    if (!this.initialized || !this.db) {
      return null;
    }
    if (!this.emmettEventStore) {
      this.emmettEventStore = createEmmettEventStore(this.db);
    }
    return this.emmettEventStore;
  }

  isReady(): boolean {
    return this.initialized;
  }

  onError(callback: (error: Error) => void): void {
    this.onErrorCallback = callback;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const row = await this.withRecoveredDb((db) =>
        db.getOptional<{ ok: number }>('SELECT 1 as ok'),
      );
      return row?.ok === 1;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      persistenceLog.error('[PowerSyncPersistence] Health check failed:', err);
      this.reportFatal(err);
      throw err;
    }
  }

  // ===========================================================================
  // Events - Write (DEPRECATED - Phase 7)
  // ===========================================================================
  // All write operations should now go through CommandBus:
  // - Use createCommandBus() and handle() with SessionStartCommand/SessionEndCommand
  // - CommandBus writes to emt_messages via EmmettEventStore.appendToStream()
  // - These legacy methods are kept for tests and compatibility only

  /**
   * @deprecated Use CommandBus with SessionStartCommand/SessionEndCommand instead.
   * Compatibility method that writes to emt_messages.
   * Will be removed in Phase 8 after full migration to CommandBus.
   */
  async append(event: EventInput): Promise<StoredEvent | null> {
    try {
      await this.ensureReady();
      const store = await this.getEventStore();
      if (!store) {
        throw new Error('[PowerSyncPersistence] Emmett event store not available');
      }

      await store.appendToStream({
        streamId: { aggregateType: 'session', aggregateId: event.sessionId },
        events: [
          {
            eventId: event.id,
            type: event.type,
            data: toEmmettMessageData(event),
          },
        ],
      });
      return this.getEventById(event.id);
    } catch (error) {
      this.reportFatal(error);
      throw error;
    }
  }

  /**
   * @deprecated Use CommandBus with SessionStartCommand/SessionEndCommand instead.
   * Compatibility method that writes to emt_messages.
   * Will be removed in Phase 8 after full migration to CommandBus.
   */
  appendFireAndForget(event: EventInput): void {
    this.append(event).catch((error) => {
      const err = error instanceof Error ? error : new Error(String(error));
      this.onErrorCallback?.(err);
    });
  }

  /**
   * @deprecated Use CommandBus with SessionStartCommand/SessionEndCommand instead.
   * Compatibility method that writes to emt_messages.
   * Will be removed in Phase 8 after full migration to CommandBus.
   */
  async appendBatch(events: EventInput[]): Promise<number> {
    if (events.length === 0) return 0;
    try {
      await this.ensureReady();
      const store = await this.getEventStore();
      if (!store) {
        throw new Error('[PowerSyncPersistence] Emmett event store not available');
      }

      const bySession = new Map<string, EventInput[]>();
      for (const event of events) {
        const existing = bySession.get(event.sessionId) ?? [];
        existing.push(event);
        bySession.set(event.sessionId, existing);
      }

      let affected = 0;
      for (const [sessionId, sessionEvents] of bySession) {
        await store.appendToStream({
          streamId: { aggregateType: 'session', aggregateId: sessionId },
          events: sessionEvents.map((event) => ({
            eventId: event.id,
            type: event.type,
            data: toEmmettMessageData(event),
          })),
        });
        affected += sessionEvents.length;
      }

      return affected;
    } catch (error) {
      this.reportFatal(error);
      throw error;
    }
  }

  // ===========================================================================
  // Events - Read
  // ===========================================================================

  async getSession(sessionId: string): Promise<StoredEvent[]> {
    const db = await this.ensureReady();
    const rows = await getSessionEvents(db, sessionId);
    return rows.map((r) => parseStoredEventRow(r as unknown as Record<string, unknown>));
  }

  async queryEvents(options: EventQueryOptions): Promise<StoredEvent[]> {
    const db = await this.ensureReady();

    const types: string[] | undefined = options.type
      ? Array.isArray(options.type)
        ? options.type
        : [options.type]
      : undefined;

    const rows = await querySessionEvents(db, {
      sessionId: options.sessionId,
      types,
      afterEventId: options.after !== undefined ? String(options.after) : undefined,
      beforeTimestamp: options.before,
    });

    return rows.map((r) => parseStoredEventRow(r as unknown as Record<string, unknown>));
  }

  async all(): Promise<StoredEvent[]> {
    const db = await this.ensureReady();
    const rows = await getAllSessionEvents(db);
    return rows.map((r) => parseStoredEventRow(r as unknown as Record<string, unknown>));
  }

  async count(): Promise<number> {
    const db = await this.ensureReady();
    return countAllSessionEvents(db);
  }

  // ===========================================================================
  // Events - Delete
  // ===========================================================================

  async deleteSession(sessionId: string): Promise<number> {
    const db = await this.ensureReady();

    const count = await countSessionEvents(db, sessionId);

    const userId = await getSessionUserId(db, sessionId);
    const isAuthenticatedUser = userId && isUuid(userId);

    await db.writeTransaction(async function deleteSessionTx(tx) {
      // For authenticated users: insert tombstone in deleted_sessions (synced table)
      // This propagates the deletion to Supabase and other devices via PowerSync
      if (isAuthenticatedUser) {
        const tombstoneId = `${userId}:${sessionId}`;
        await tx.execute(
          `INSERT OR IGNORE INTO deleted_sessions (id, session_id, user_id, created_at)
           VALUES (?, ?, ?, ?)`,
          [tombstoneId, sessionId, userId, new Date().toISOString()],
        );
        persistenceLog.debug(`[deleteSession] Created tombstone for session ${sessionId}`);
      }

      // Archive Emmett messages instead of deleting (for potential replay/debugging)
      await archiveSessionEvents(tx, sessionId);

      // Cleanup related tables
      await tx.execute(`DELETE FROM session_summaries WHERE session_id = ?`, [sessionId]);
      await tx.execute(
        `DELETE FROM replay_events
         WHERE run_id IN (SELECT id FROM replay_runs WHERE session_id = ?)`,
        [sessionId],
      );
      await tx.execute(`DELETE FROM replay_runs WHERE session_id = ?`, [sessionId]);
      await tx.execute(`DELETE FROM pending_deletions WHERE id = ?`, [sessionId]);
    });

    // Rebuild stats projections from remaining session_summaries (outside tx for perf).
    // Best-effort — the stats adapter has a slow-path fallback when projections are missing.
    try {
      await rebuildStatsProjectionsForUser(db, userId ?? 'local');
    } catch {
      // Non-fatal: slow-path SQL will be used until next rebuild
    }

    return count;
  }

  async deleteSessions(sessionIds: readonly string[]): Promise<number> {
    const uniqueSessionIds = Array.from(
      new Set(sessionIds.map((sessionId) => sessionId.trim()).filter((sessionId) => sessionId)),
    );
    if (uniqueSessionIds.length === 0) return 0;

    const db = await this.ensureReady();
    const sessionMetadata = await Promise.all(
      uniqueSessionIds.map(async (sessionId) => {
        const [count, userId] = await Promise.all([
          countSessionEvents(db, sessionId),
          getSessionUserId(db, sessionId),
        ]);
        return {
          sessionId,
          count,
          userId,
          isAuthenticatedUser: Boolean(userId && isUuid(userId)),
        };
      }),
    );

    await db.writeTransaction(async function deleteSessionsBatchTx(tx) {
      for (const { sessionId, userId, isAuthenticatedUser } of sessionMetadata) {
        if (isAuthenticatedUser && userId) {
          const tombstoneId = `${userId}:${sessionId}`;
          await tx.execute(
            `INSERT OR IGNORE INTO deleted_sessions (id, session_id, user_id, created_at)
             VALUES (?, ?, ?, ?)`,
            [tombstoneId, sessionId, userId, new Date().toISOString()],
          );
        }
      }

      for (const { sessionId } of sessionMetadata) {
        await archiveSessionEvents(tx, sessionId);
      }

      await bulkDeleteWhereIn(tx, 'session_summaries', 'session_id', uniqueSessionIds);
      await bulkDeleteWhereIn(tx, 'pending_deletions', 'id', uniqueSessionIds);

      for (const { sessionId } of sessionMetadata) {
        await tx.execute(
          `DELETE FROM replay_events
           WHERE run_id IN (SELECT id FROM replay_runs WHERE session_id = ?)`,
          [sessionId],
        );
      }
      await bulkDeleteWhereIn(tx, 'replay_runs', 'session_id', uniqueSessionIds);
    });

    const affectedUserIds = new Set<string>();
    for (const { userId } of sessionMetadata) {
      affectedUserIds.add(userId ?? 'local');
    }

    for (const userId of affectedUserIds) {
      try {
        await rebuildStatsProjectionsForUser(db, userId);
      } catch {
        // Non-fatal: slow-path SQL will be used until next rebuild
      }
    }

    return sessionMetadata.reduce((sum, entry) => sum + entry.count, 0);
  }

  async clear(): Promise<void> {
    const db = await this.ensureReady();
    await db.writeTransaction(async function clearPersistenceTx(tx) {
      // Archive all Emmett event messages instead of hard delete
      await archiveAllEvents(tx);

      await tx.execute(`DELETE FROM session_summaries`);
      await tx.execute(`DELETE FROM user_stats_projection`);
      await tx.execute(`DELETE FROM user_modality_stats_projection`);
      await tx.execute(`DELETE FROM journey_state_projection`);
      await tx.execute(`DELETE FROM session_in_progress`);
      await tx.execute(`DELETE FROM replay_events`);
      await tx.execute(`DELETE FROM replay_runs`);
      await tx.execute(`DELETE FROM pending_deletions`);
      await tx.execute(`DELETE FROM sync_meta`);
    });
  }

  // ===========================================================================
  // Session Summaries
  // ===========================================================================

  async getSessionSummaries(
    userId: string | null,
    options?: SessionSummariesOptions,
  ): Promise<SessionSummaryRow[]> {
    const db = await this.ensureReady();

    const params: unknown[] = [];
    let where = `WHERE 1=1`;
    if (!options?.includeAbandoned) {
      where += ` AND reason != 'abandoned'`;
    }
    if (userId) {
      where += ' AND user_id = ?';
      params.push(userId);
    }

    const rows = await db.getAll<Record<string, unknown>>(
      `SELECT * FROM session_summaries ${where} ORDER BY created_at DESC`,
      params,
    );
    return rows.map(parseSessionSummaryRow);
  }

  async insertSessionSummary(summary: SessionSummaryInput): Promise<void> {
    const db = await this.ensureReady();

    await db.writeTransaction(async function insertSessionSummaryTx(tx) {
      // PowerSync local-only tables are views - cannot use INSERT OR REPLACE.
      // Delete first, then insert to handle upsert semantics.
      await tx.execute(`DELETE FROM session_summaries WHERE session_id = ?`, [summary.sessionId]);
      await bulkInsert(tx, 'session_summaries', SESSION_SUMMARY_INSERT_COLUMNS, [
        sessionSummaryInsertValues(summary),
      ]);
    });
  }

  insertSessionSummaryFireAndForget(summary: SessionSummaryInput): void {
    this.insertSessionSummary(summary).catch((error) => {
      const err = error instanceof Error ? error : new Error(String(error));
      this.onErrorCallback?.(err);
    });
  }

  async deleteSessionSummary(sessionId: string): Promise<void> {
    const db = await this.ensureReady();
    await db.execute(`DELETE FROM session_summaries WHERE session_id = ?`, [sessionId]);
  }

  async insertSessionSummariesBatch(summaries: SessionSummaryInput[]): Promise<number> {
    if (summaries.length === 0) return 0;
    const db = await this.ensureReady();
    const uniqueBySessionId = new Map<string, SessionSummaryInput>();
    for (const summary of summaries) {
      uniqueBySessionId.set(summary.sessionId, summary);
    }
    const uniqueSummaries = [...uniqueBySessionId.values()];
    const sessionIds = uniqueSummaries.map((summary) => summary.sessionId);

    await db.writeTransaction(async function insertSessionSummariesBatchTx(tx) {
      await bulkDeleteWhereIn(tx, 'session_summaries', 'session_id', sessionIds);
      await bulkInsert(
        tx,
        'session_summaries',
        SESSION_SUMMARY_INSERT_COLUMNS,
        uniqueSummaries.map((summary) => sessionSummaryInsertValues(summary)),
      );
    });

    return uniqueSummaries.length;
  }

  // ===========================================================================
  // Settings
  // ===========================================================================

  async getSettings(): Promise<Record<string, unknown> | null> {
    try {
      const row = await this.withRecoveredDb((db) =>
        db.getOptional<{ value: string }>(`SELECT value FROM settings WHERE id = 'local_config'`),
      );
      if (!row?.value) return null;
      try {
        return JSON.parse(row.value) as Record<string, unknown>;
      } catch {
        return null;
      }
    } catch (error) {
      this.reportFatal(error);
      throw error;
    }
  }

  async saveSettings(config: Record<string, unknown>): Promise<void> {
    try {
      await this.withRecoveredDb(async (db) => {
        // PowerSync local-only tables are views - cannot use INSERT OR REPLACE.
        // Use writeTransaction for atomicity to prevent race conditions on HMR/double-mount.
        await db.writeTransaction(async function saveSettingsTx(tx) {
          await tx.execute(`DELETE FROM settings WHERE id = 'local_config'`);
          await tx.execute(
            `INSERT INTO settings (id, value, updated_at)
             VALUES ('local_config', ?, datetime('now'))`,
            [JSON.stringify(config)],
          );
        });
      });
    } catch (error) {
      this.reportFatal(error);
      throw error;
    }
  }

  // ===========================================================================
  // Algorithm State
  // ===========================================================================

  async getAlgorithmState(
    userId: string,
    algorithmType: string,
  ): Promise<AlgorithmStateResult | null> {
    try {
      const db = await this.ensureReady();
      const row = await db.getOptional<{ state_json: string; session_count: number }>(
        `SELECT state_json, session_count
         FROM algorithm_states
         WHERE user_id = ? AND algorithm_type = ?`,
        [userId, algorithmType],
      );
      if (!row) return null;

      let stateJson: unknown = null;
      try {
        stateJson = JSON.parse(row.state_json);
      } catch {
        stateJson = null;
      }

      return { stateJson, sessionCount: row.session_count };
    } catch (error) {
      this.reportFatal(error);
      throw error;
    }
  }

  async saveAlgorithmState(
    userId: string,
    algorithmType: string,
    stateJson: unknown,
  ): Promise<void> {
    try {
      const db = await this.ensureReady();
      const id = `${userId}:${algorithmType}`;
      const stateJsonStr = JSON.stringify(stateJson);
      // PowerSync tables are views backed by `ps_data_local__*`; `rowsAffected` can be 0 even when
      // the INSTEAD OF trigger performs the update. Avoid relying on `rowsAffected` for upserts.
      await db.execute(
        `UPDATE algorithm_states
         SET state_json = ?, session_count = session_count + 1, updated_at = datetime('now')
         WHERE user_id = ? AND algorithm_type = ?`,
        [stateJsonStr, userId, algorithmType],
      );

      await db.execute(
        `INSERT OR IGNORE INTO algorithm_states (id, user_id, algorithm_type, state_json, session_count, updated_at)
         VALUES (?, ?, ?, ?, 1, datetime('now'))`,
        [id, userId, algorithmType, stateJsonStr],
      );
    } catch (error) {
      this.reportFatal(error);
      throw error;
    }
  }

  async clearAlgorithmStates(userId: string): Promise<void> {
    try {
      const db = await this.ensureReady();
      await db.execute(`DELETE FROM algorithm_states WHERE user_id = ?`, [userId]);
    } catch (error) {
      this.reportFatal(error);
      throw error;
    }
  }

  // ===========================================================================
  // Sync (legacy interface, kept for compatibility)
  // ===========================================================================

  async getUnsyncedEvents(): Promise<StoredEvent[]> {
    // With PowerSync, unsynced events are tracked in ps_crud table.
    const db = await this.ensureReady();
    try {
      const ids = await getPendingCrudEventIds(db);
      if (ids.length === 0) return [];

      const rows = await getEventsByRowIds(db, ids);
      return rows.map((r) => parseStoredEventRow(r as unknown as Record<string, unknown>));
    } catch {
      // ps_crud might not exist or be accessible in some edge cases
      return [];
    }
  }

  async hasUnsyncedEvents(): Promise<boolean> {
    // With PowerSync, check ps_crud table for pending uploads
    const db = await this.ensureReady();
    return hasPendingCrudEvents(db);
  }

  async markEventsSyncedBatch(_eventIds: string[]): Promise<void> {
    // With PowerSync, sync state is managed automatically via ps_crud.
    // This method is a no-op - PowerSync handles marking items as synced
    // after successful upload via the connector's uploadData().
    // Kept for interface compatibility.
  }

  async getSyncMeta(key: string): Promise<string | null> {
    const db = await this.ensureReady();
    const label = toSqlCommentLabel(key);
    const row = await db.getOptional<{ value: string }>(
      `SELECT value FROM sync_meta WHERE id = ? /* sync_meta:get:${label} */`,
      [key],
    );
    return row?.value ?? null;
  }

  async setSyncMeta(key: string, value: string): Promise<void> {
    const db = await this.ensureReady();
    const label = toSqlCommentLabel(key);
    // PowerSync local-only tables are views - cannot use INSERT OR REPLACE.
    await db.execute(`DELETE FROM sync_meta WHERE id = ? /* sync_meta:delete:${label} */`, [key]);
    await db.execute(
      `INSERT INTO sync_meta (id, value, updated_at) VALUES (?, ?, datetime('now')) /* sync_meta:set:${label} */`,
      [key, value],
    );
  }

  async upsertEvent(event: EventInput): Promise<void> {
    await this.append(event);
  }

  async upsertEventsBatch(events: EventInput[]): Promise<void> {
    await this.appendBatch(events);
  }

  async deleteEventsByIds(eventIds: string[]): Promise<void> {
    if (eventIds.length === 0) return;
    const db = await this.ensureReady();
    await db.writeTransaction(async function deleteEventsByIdsTx(tx) {
      await archiveEventsByMessageIds(tx, eventIds);
    });
  }

  async getEventById(eventId: string): Promise<StoredEvent | null> {
    const db = await this.ensureReady();
    const row = await getEventByMessageId(db, eventId);

    if (!row) {
      return null;
    }

    // Parse Emmett event format
    let data: Record<string, unknown>;
    try {
      const parsed = JSON.parse(row.message_data);
      data = (parsed.data as Record<string, unknown>) ?? parsed;
    } catch {
      data = {};
    }

    // Extract sessionId from stream_id (format: "session:sessionId")
    const sessionId = parseSessionIdFromStreamId(row.stream_id) ?? row.stream_id;

    const payload = data;

    return {
      id: row.message_id,
      user_id: (payload['userId'] as string | undefined) ?? null,
      session_id: sessionId,
      type: row.message_type,
      timestamp: (payload['timestamp'] as number) ?? Date.now(),
      payload,
      created_at: row.created,
      updated_at: row.created,
      deleted: false,
      synced: true,
    };
  }

  async getAllSessionIds(): Promise<string[]> {
    const db = await this.ensureReady();
    return getDistinctSessionIds(db);
  }

  // ===========================================================================
  // Pending Deletions (legacy interface, kept for compatibility)
  // ===========================================================================

  async queueDeletion(sessionId: string): Promise<void> {
    const db = await this.ensureReady();
    await db.execute(`INSERT OR IGNORE INTO pending_deletions (id, requested_at) VALUES (?, ?)`, [
      sessionId,
      Date.now(),
    ]);
  }

  async hasPendingDeletions(): Promise<boolean> {
    const db = await this.ensureReady();
    const row = await db.getOptional<{ count: number }>(
      `SELECT COUNT(*) as count
         FROM (
           SELECT 1 FROM pending_deletions LIMIT 1
         )`,
    );
    return Number(row?.count ?? 0) > 0;
  }

  async getPendingDeletions(): Promise<string[]> {
    const db = await this.ensureReady();
    const rows = await db.getAll<{ id: string }>(
      `SELECT id FROM pending_deletions ORDER BY requested_at ASC`,
    );
    return rows.map((r) => r.id);
  }

  async confirmDeletion(sessionId: string): Promise<void> {
    const db = await this.ensureReady();
    await db.execute(`DELETE FROM pending_deletions WHERE id = ?`, [sessionId]);
  }

  // ===========================================================================
  // Generic Query (for SQL custom in adapters)
  // ===========================================================================

  async query<T extends object>(sql: string, params: unknown[] = []): Promise<{ rows: T[] }> {
    try {
      const rows = await this.withRecoveredDb((db) =>
        // biome-ignore lint/suspicious/noExplicitAny: PowerSync getAll requires specific binding types incompatible with unknown[]
        db.getAll<T>(sql, params as any[]),
      );
      return { rows };
    } catch (error) {
      this.reportFatal(error);
      throw error;
    }
  }

  async execute(sql: string, params: unknown[] = []): Promise<void> {
    try {
      await this.withRecoveredDb((db) => db.execute(sql, params));
    } catch (error) {
      this.reportFatal(error);
      throw error;
    }
  }

  async writeTransaction<T>(fn: (tx: PersistenceWriteTransaction) => Promise<T>): Promise<T> {
    try {
      return await this.withRecoveredDb((db) => {
        const label =
          (fn as { __sqlLabel?: string }).__sqlLabel ??
          (typeof fn.name === 'string' && fn.name.length > 0 ? fn.name : 'persistenceWrite');
        const runPersistenceWriteTransaction = Object.assign(
          async (tx: {
            execute(sql: string, params?: unknown[]): Promise<unknown>;
            getAll<TQuery extends object>(sql: string, params?: unknown[]): Promise<TQuery[]>;
          }) => {
            return fn({
              execute: async (sql: string, params: unknown[] = []) => {
                // biome-ignore lint/suspicious/noExplicitAny: PowerSync execute param typing is incompatible with unknown[]
                await tx.execute(sql, params as any[]);
              },
              query: async <TQuery extends object>(sql: string, params: unknown[] = []) => {
                // biome-ignore lint/suspicious/noExplicitAny: PowerSync getAll param typing is incompatible with unknown[]
                const rows = await tx.getAll<TQuery>(sql, params as any[]);
                return { rows };
              },
            });
          },
          { __sqlLabel: label },
        );

        return db.writeTransaction(runPersistenceWriteTransaction);
      });
    } catch (error) {
      this.reportFatal(error);
      throw error;
    }
  }

  // ===========================================================================
  // Stats Helpers
  // ===========================================================================

  async getStreakInfo(userId: string): Promise<StreakInfo> {
    const db = await this.ensureReady();
    const sessionScope = buildSessionSummaryScopeClause(
      'user_id',
      effectiveUserIdsWithLocal(userId),
    );
    const rows = await db.getAll<{
      current_streak: number;
      best_streak: number;
      last_date: string | null;
    }>(
      `WITH dates AS (
        SELECT DISTINCT created_date as day
        FROM session_summaries
        WHERE ${sessionScope.clause}
          AND created_date IS NOT NULL
          AND reason != 'abandoned'
      ),
      with_row AS (
        SELECT day, ROW_NUMBER() OVER (ORDER BY day) as rn FROM dates
      ),
      with_islands AS (
        SELECT day, date(day, '-' || rn || ' days') as island_id FROM with_row
      ),
      streaks AS (
        SELECT
          island_id,
          MAX(day) as end_day,
          COUNT(*) as streak_length
        FROM with_islands
        GROUP BY island_id
      )
      SELECT
        COALESCE(
          (SELECT streak_length FROM streaks WHERE end_day >= date('now', '-1 day')),
          0
        ) as current_streak,
        COALESCE((SELECT MAX(streak_length) FROM streaks), 0) as best_streak,
        (SELECT MAX(day) FROM dates) as last_date`,
      sessionScope.params,
    );

    const row = rows[0];
    if (!row) {
      return { current: 0, best: 0, lastActiveDate: null };
    }

    const current = row.current_streak;
    const best = row.best_streak;
    return { current, best: Math.max(best, current), lastActiveDate: row.last_date };
  }

  async getBadgeHistorySnapshot(userId: string): Promise<BadgeHistorySnapshot> {
    const db = await this.ensureReady();
    const effectiveUserIds = effectiveUserIdsWithLocal(userId);
    const sessionScope = buildSessionSummaryScopeClause('user_id', effectiveUserIds);
    const projectionScope = buildProjectionScopeClause('id', effectiveUserIds);

    // All queries in parallel — streak from O(1) projection, rest are lightweight
    const [streakRows, todayCountRows, bestDPrimeRows, summaryRows] = await Promise.all([
      // O(1) read from streak_projection instead of CTE scan
      db.getAll<{ current_streak: number; best_streak: number; last_active_date: string | null }>(
        'SELECT current_streak, best_streak, last_active_date FROM streak_projection WHERE id = ?',
        [userId],
      ),
      db.getAll<{ sessions_today: number }>(
        `SELECT COUNT(*) as sessions_today
         FROM session_summaries
         WHERE ${sessionScope.clause}
           AND reason = 'completed'
           AND created_date = date('now')`,
        sessionScope.params,
      ),
      db.getAll<{ best_dprime: number | null }>(
        `SELECT COALESCE((
           SELECT global_d_prime
           FROM session_summaries
           WHERE ${sessionScope.clause}
             AND reason = 'completed'
             AND global_d_prime IS NOT NULL
           ORDER BY global_d_prime DESC
           LIMIT 1
         ), 0) as best_dprime`,
        sessionScope.params,
      ),
      // O(1) read from user_stats_projection
      db.getAll<{
        max_n_level: number | null;
        early_morning_days: number | null;
        late_night_days: number | null;
        last_session_at: string | null;
      }>(
        `SELECT
           CAST(COALESCE(MAX(max_n_level), 0) AS INTEGER) as max_n_level,
           CAST(COALESCE(SUM(early_morning_sessions), 0) AS INTEGER) as early_morning_days,
           CAST(COALESCE(SUM(late_night_sessions), 0) AS INTEGER) as late_night_days,
           MAX(last_created_at) as last_session_at
         FROM user_stats_projection
         WHERE ${projectionScope.clause}`,
        projectionScope.params,
      ),
    ]);

    const streak = streakRows[0];
    const row = summaryRows[0];
    const currentStreak = Number(streak?.current_streak ?? 0);
    const bestStreak = Math.max(Number(streak?.best_streak ?? 0), currentStreak);

    return {
      currentStreak,
      bestStreak,
      sessionsToday: Number(todayCountRows[0]?.sessions_today ?? 0),
      earlyMorningDays: Number(row?.early_morning_days ?? 0),
      lateNightDays: Number(row?.late_night_days ?? 0),
      maxNLevel: Number(row?.max_n_level ?? 0),
      bestDPrime: Number(bestDPrimeRows[0]?.best_dprime ?? 0),
      daysSinceLastSession: computeDaysSince(row?.last_session_at ?? null),
    };
  }

  async getDailyActivity(userId: string, days: number = 30): Promise<DailyActivity[]> {
    const db = await this.ensureReady();
    // Use session_summaries instead of events_all VIEW to avoid UNION ALL scan.
    // Each completed session has one row in session_summaries with created_at.
    const rows = await db.getAll<{ date: string; count: number }>(
      `WITH RECURSIVE date_range(d) AS (
        SELECT date('now', '-' || (? - 1) || ' days')
        UNION ALL
        SELECT date(d, '+1 day') FROM date_range WHERE d < date('now')
      )
      SELECT
        dr.d as date,
        COUNT(s.session_id) as count
      FROM date_range dr
      LEFT JOIN session_summaries s ON
        s.created_date = dr.d
        AND s.user_id = ?
        AND s.reason != 'abandoned'
      GROUP BY dr.d
      ORDER BY dr.d ASC`,
      [days, userId],
    );

    return rows.map((r) => ({ date: r.date, count: r.count }));
  }
}

// =============================================================================
// Factory (singleton-friendly)
// =============================================================================

export function createPowerSyncPersistenceAdapter(): PersistencePort {
  return new PowerSyncPersistenceAdapter();
}
