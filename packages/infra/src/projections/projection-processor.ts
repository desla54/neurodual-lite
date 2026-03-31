// packages/infra/src/projections/projection-processor.ts
/**
 * Projection Processor (Emmett-inspired)
 *
 * Central engine that manages projection lifecycle:
 * - Incremental processing (post-commit): handle(newEvents)
 * - Full replay (version change): truncate → handle(allEvents)
 * - Checkpoint tracking via emt_subscriptions table
 *
 * The same handle function runs for both paths — zero divergence.
 */

import type { AbstractPowerSyncDatabase } from '@powersync/web';
import { nowMs, yieldIfOverBudget, yieldToMain } from '../utils/yield-to-main';
import { withWatchdogStepAsync } from '../diagnostics/freeze-watchdog';
import type { ProjectedEvent, ProjectionDefinition } from './projection-definition';
import { createCheckpointer } from '../es-emmett/checkpointer';
import { EMT_EVENTS_TABLE, eventBaseWhere, eventOrderAsc } from '../es-emmett/event-queries';
import { recordProcessorError } from '../es-emmett/processor-errors';
import {
  EMMETT_LAST_GLOBAL_POSITION_META_KEY,
  POWERSYNC_LAST_SYNCED_AT_META_KEY,
  PROJECTION_LAST_PROCESSED_SYNC_AT_META_KEY,
  toSyncMetaSqlLabel,
} from '../es-emmett/startup-meta';
import { streakProjectionDefinition } from './streak-projection';
import { dailyActivityProjectionDefinition } from './daily-activity-projection';
import { nLevelProjectionDefinition } from './n-level-projection';
import { journeyStateProjectionDefinition } from './journey-state-projection';
import type { PersistencePort } from '@neurodual/logic';
import { createSessionSummariesProjectionDefinition } from './session-summaries-projection';
import { parseSqlDate, safeJsonParse } from '../db/sql-helpers';

// Re-export for convenience
export type { ProjectedEvent };

// Browser catch-up runs on the UI thread. Smaller pages/chunks trade a few more
// SQLite round-trips for dramatically lower freeze risk during background sync.
const DEFAULT_READ_BATCH_SIZE = typeof window === 'undefined' ? 500 : 120;
const DEFAULT_HANDLE_CHUNK_SIZE = typeof window === 'undefined' ? DEFAULT_READ_BATCH_SIZE : 20;
const WATCHDOG_WARN_AFTER_MS = 100;

type EmtMessageRow = {
  message_id: string;
  global_position: string;
  stream_id: string;
  stream_position: string;
  message_type: string;
  message_data: string;
  created: string;
};

export interface ProjectionCatchUpReport {
  /** Projections that were replayed from scratch due to version mismatch */
  readonly replayed: readonly string[];
  /** Projections that were caught up incrementally */
  readonly caughtUp: readonly string[];
  /** Total events processed across all projections */
  readonly totalEventsProcessed: number;
}

export interface ProjectionProcessor {
  register(def: ProjectionDefinition): void;
  processEvents(events: readonly ProjectedEvent[]): Promise<void>;
  ensureUpToDate(): Promise<ProjectionCatchUpReport>;
  /** Invalidate the position cache so the next ensureUpToDate does real work. */
  invalidateCache(): void;
  rebuild(projectionId: string): Promise<number>;
  rebuildAll(): Promise<number>;
  /**
   * Subscribe to the list of projections currently blocked due to errors.
   * The callback is invoked after each `ensureUpToDate` or `processEvents`
   * cycle with the IDs of projections that failed to process.
   * Returns an unsubscribe function.
   */
  onDegradedProjections(callback: (projectionIds: readonly string[]) => void): () => void;
  /** Snapshot of currently blocked projection IDs. */
  getDegradedProjections(): readonly string[];
}

// =============================================================================
// Event Reading
// =============================================================================

function parseEmtRow(row: EmtMessageRow): ProjectedEvent | null {
  const parsed = safeJsonParse<Record<string, unknown> | null>(row.message_data, null);
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  return {
    type: row.message_type,
    data: (parsed['data'] as Record<string, unknown>) ?? parsed,
    globalPosition: BigInt(row.global_position),
    createdAt: parseSqlDate(row.created) ?? new Date(0),
  };
}

function extractRows<T>(result: unknown): T[] {
  if (typeof result !== 'object' || result === null) return [];
  const rowsValue = (result as Record<string, unknown>)['rows'];
  if (Array.isArray(rowsValue)) return rowsValue as T[];
  if (typeof rowsValue !== 'object' || rowsValue === null) return [];
  const arr = (rowsValue as Record<string, unknown>)['_array'];
  return Array.isArray(arr) ? (arr as T[]) : [];
}

type StartupMetaSnapshot = {
  observedGlobalPosition: bigint | null;
  lastSyncedAt: string | null;
  processedSyncAt: string | null;
};

type StartupCatchUpDiagnostics = {
  readonly reasons: readonly string[];
  readonly replayCandidates: readonly string[];
  readonly laggingProjectionIds: readonly string[];
  readonly minCheckpointCursor: bigint | null;
};

function hasUsableStartupSyncStamp(startupMeta: StartupMetaSnapshot | null): boolean {
  if (startupMeta === null) return false;
  if (startupMeta.lastSyncedAt === null) {
    return true;
  }
  return startupMeta.lastSyncedAt === startupMeta.processedSyncAt;
}

async function tryReadStartupMeta(
  db: AbstractPowerSyncDatabase,
): Promise<StartupMetaSnapshot | null> {
  const keys = [
    EMMETT_LAST_GLOBAL_POSITION_META_KEY,
    POWERSYNC_LAST_SYNCED_AT_META_KEY,
    PROJECTION_LAST_PROCESSED_SYNC_AT_META_KEY,
  ] as const;
  const getAll = (db as { getAll?: <T>(sql: string, params?: unknown[]) => Promise<T[]> }).getAll;
  const getOptional = (
    db as {
      getOptional?: <T>(sql: string, params?: unknown[]) => Promise<T | null>;
    }
  ).getOptional;

  const parseBigIntOrNull = (value: string | null | undefined): bigint | null => {
    if (!value) return null;
    try {
      return BigInt(value);
    } catch {
      return null;
    }
  };

  try {
    const values = new Map<string, string | null>();

    if (typeof getAll === 'function') {
      const placeholders = keys.map(() => '?').join(', ');
      const rows = await getAll.call(
        db,
        `SELECT id, value FROM sync_meta WHERE id IN (${placeholders}) /* sync_meta:get-many:${toSyncMetaSqlLabel('projection-processor:startup')} */`,
        [...keys],
      );
      for (const row of rows as { id: string; value: string | null }[]) {
        values.set(row.id, row.value);
      }
    } else if (typeof getOptional === 'function') {
      for (const key of keys) {
        const label = toSyncMetaSqlLabel(key);
        const row = await getOptional.call(
          db,
          `SELECT value FROM sync_meta WHERE id = ? /* sync_meta:get:${label} */`,
          [key],
        );
        values.set(key, (row as { value: string | null } | null)?.value ?? null);
      }
    } else {
      return null;
    }

    return {
      observedGlobalPosition: parseBigIntOrNull(values.get(EMMETT_LAST_GLOBAL_POSITION_META_KEY)),
      lastSyncedAt: values.get(POWERSYNC_LAST_SYNCED_AT_META_KEY) ?? null,
      processedSyncAt: values.get(PROJECTION_LAST_PROCESSED_SYNC_AT_META_KEY) ?? null,
    };
  } catch {
    return null;
  }
}

async function setSyncMetaBestEffort(
  db: AbstractPowerSyncDatabase,
  key: string,
  value: string | null,
): Promise<void> {
  const label = toSyncMetaSqlLabel(key);
  try {
    await db.execute(`DELETE FROM sync_meta WHERE id = ? /* sync_meta:delete:${label} */`, [key]);
    if (value !== null && value !== '') {
      await db.execute(
        `INSERT INTO sync_meta (id, value, updated_at) VALUES (?, ?, datetime('now')) /* sync_meta:set:${label} */`,
        [key, value],
      );
    }
  } catch {
    // Best-effort only.
  }
}

function collectStartupCatchUpDiagnostics(
  definitions: readonly ProjectionDefinition[],
  checkpointsByProjectionId: ReadonlyMap<
    string,
    { version: number; last_processed_position: string }
  >,
  startupMeta: StartupMetaSnapshot | null,
): StartupCatchUpDiagnostics {
  const observedGlobalPosition = startupMeta?.observedGlobalPosition ?? null;
  const replayCandidates = definitions
    .filter((def) => {
      const checkpoint = checkpointsByProjectionId.get(def.id);
      return !checkpoint || checkpoint.version !== def.version;
    })
    .map((def) => def.id);

  const minCheckpointCursor = definitions.reduce<bigint | null>((min, def) => {
    const checkpoint = checkpointsByProjectionId.get(def.id);
    if (!checkpoint || checkpoint.version !== def.version) return min;
    const cursor = BigInt(checkpoint.last_processed_position);
    if (min === null || cursor < min) return cursor;
    return min;
  }, null);

  const laggingProjectionIds =
    observedGlobalPosition !== null
      ? definitions
          .filter((def) => {
            const checkpoint = checkpointsByProjectionId.get(def.id);
            return (
              checkpoint &&
              checkpoint.version === def.version &&
              BigInt(checkpoint.last_processed_position) < observedGlobalPosition
            );
          })
          .map((def) => def.id)
      : [];

  const reasons: string[] = [];
  if (replayCandidates.length > 0) {
    reasons.push('checkpoint-missing-or-version-mismatch');
  }
  if (startupMeta === null) {
    reasons.push('startup-meta-unavailable');
  } else {
    if (startupMeta.observedGlobalPosition === null) {
      reasons.push('observed-global-position-missing');
    }
    if (
      startupMeta.lastSyncedAt !== null &&
      startupMeta.lastSyncedAt !== startupMeta.processedSyncAt
    ) {
      reasons.push('sync-stamp-mismatch');
    }
    if (minCheckpointCursor === null) {
      reasons.push('checkpoint-cursor-missing');
    } else if (observedGlobalPosition !== null && observedGlobalPosition > minCheckpointCursor) {
      reasons.push('checkpoint-behind-latest');
    }
  }

  return {
    reasons,
    replayCandidates,
    laggingProjectionIds,
    minCheckpointCursor,
  };
}

// =============================================================================
// Core Processor
// =============================================================================

function createProjectionProcessor(db: AbstractPowerSyncDatabase): ProjectionProcessor {
  const checkpointer = createCheckpointer(db);
  const registry = new Map<string, ProjectionDefinition>();

  // Degraded projection tracking
  let degradedProjectionIds: readonly string[] = [];
  const degradedListeners = new Set<(ids: readonly string[]) => void>();

  function notifyDegraded(ids: readonly string[]): void {
    const changed =
      ids.length !== degradedProjectionIds.length ||
      ids.some((id, i) => id !== degradedProjectionIds[i]);
    if (!changed) return;
    degradedProjectionIds = ids;
    for (const cb of degradedListeners) {
      try {
        cb(ids);
      } catch {
        // listener errors are non-fatal
      }
    }
  }

  // Cache the last known max global_position to short-circuit ensureUpToDate
  // when nothing has changed. Avoids 5 SQL round-trips (~300ms) every 30s.
  let lastKnownMaxPosition: bigint | null = null;

  // Async mutex: serializes processEvents / ensureUpToDate / rebuild to prevent
  // the race where both read the same checkpoint and double-process events.
  let processingMutex = Promise.resolve();
  function withMutex<T>(fn: () => Promise<T>): Promise<T> {
    let release: () => void;
    const next = new Promise<void>((r) => {
      release = r;
    });
    const prev = processingMutex;
    processingMutex = next;
    return prev.then(async () => {
      try {
        return await fn();
      } finally {
        release();
      }
    });
  }

  function register(def: ProjectionDefinition): void {
    registry.set(def.id, def);
  }

  const readBatchSize = DEFAULT_READ_BATCH_SIZE;
  const handleChunkSize = DEFAULT_HANDLE_CHUNK_SIZE;

  type ProjectionProgressState = {
    def: ProjectionDefinition;
    cursor: bigint;
    processed: number;
  };

  async function applyProjectionChunk(
    state: ProjectionProgressState,
    events: readonly ProjectedEvent[],
    maxRelevant: bigint | null,
    totals?: { totalEventsProcessed: number },
    skipCheckpoint?: boolean,
  ): Promise<void> {
    if (maxRelevant === null) return;

    if (events.length > 0) {
      await withWatchdogStepAsync(
        `ProjectionProcessor.${state.def.id}.handle(${events.length})`,
        () => state.def.handle(events, db),
        { warnAfterMs: WATCHDOG_WARN_AFTER_MS },
      );
      state.processed += events.length;
      if (totals) {
        totals.totalEventsProcessed += events.length;
      }
    }

    state.cursor = maxRelevant;
    if (!skipCheckpoint) {
      await checkpointer.write(state.def.id, state.def.version, state.cursor);
    }
  }

  const readMessageRowsPage = async (
    messageTypes: ReadonlySet<string>,
    fromPosition: bigint,
  ): Promise<{ rows: EmtMessageRow[]; maxPosition: bigint | null }> => {
    const types = Array.from(messageTypes);
    if (types.length === 0) return { rows: [], maxPosition: null };

    const placeholders = types.map(() => '?').join(', ');
    const result = await db.execute(
      `SELECT message_id, global_position, stream_id, stream_position, message_type, message_data, created
       FROM ${EMT_EVENTS_TABLE}
       WHERE ${eventBaseWhere()}
         AND message_type IN (${placeholders})
         AND CAST(global_position AS INTEGER) > ?
       ${eventOrderAsc()}
       LIMIT ?`,
      [...types, String(fromPosition), readBatchSize],
    );

    const rows = extractRows<EmtMessageRow>(result);
    let maxPosition: bigint | null = null;
    for (const row of rows) {
      try {
        const pos = BigInt(row.global_position);
        if (maxPosition === null || pos > maxPosition) {
          maxPosition = pos;
        }
      } catch {
        // ignore invalid positions; we will not advance the cursor based on this row
      }
    }

    return { rows, maxPosition };
  };

  /**
   * Incremental processing: called after CommandBus commit.
   * Filters events per projection, then calls handle (same code as replay).
   */
  async function processEvents(events: readonly ProjectedEvent[]): Promise<void> {
    if (events.length === 0) return;
    // Invalidate the cache so ensureUpToDate picks up the new events.
    lastKnownMaxPosition = null;

    for (const [, def] of registry) {
      // Read the current checkpoint so we skip events already processed by
      // ensureUpToDate (race: watch trigger can fire before this post-commit task).
      const checkpoint = await checkpointer.read(def.id);
      const cursor =
        checkpoint && checkpoint.version === def.version
          ? BigInt(checkpoint.last_processed_position)
          : 0n;

      const matching = events.filter((e) => def.canHandle.has(e.type) && e.globalPosition > cursor);
      if (matching.length === 0) continue;

      try {
        await def.handle(matching, db);

        const maxPosition = matching.reduce(
          (max, e) => (e.globalPosition > max ? e.globalPosition : max),
          0n,
        );
        if (maxPosition > cursor) {
          await checkpointer.write(def.id, def.version, maxPosition);
        }
      } catch (error) {
        console.error(`[ProjectionProcessor] Error processing ${def.id}:`, error);
        await recordProcessorError(db, { processorName: def.id, event: matching[0], error });
      }
    }
  }

  async function runProjectionInBatches(
    def: ProjectionDefinition,
    fromPosition: bigint,
    options?: { truncateFirst?: boolean },
  ): Promise<number> {
    if (options?.truncateFirst) {
      await def.truncate(db);
    }

    def.beginBatch?.();

    const state: ProjectionProgressState = {
      def,
      cursor: fromPosition,
      processed: 0,
    };

    while (true) {
      const { rows, maxPosition } = await withWatchdogStepAsync(
        `ProjectionProcessor.${def.id}.readPage`,
        () => readMessageRowsPage(def.canHandle, state.cursor),
        { warnAfterMs: WATCHDOG_WARN_AFTER_MS },
      );
      if (rows.length === 0 || maxPosition === null) break;

      const events: ProjectedEvent[] = [];
      let maxRelevant: bigint | null = null;
      const budget = { lastYieldMs: nowMs() };
      for (const row of rows) {
        let pos: bigint;
        try {
          pos = BigInt(row.global_position);
        } catch {
          continue;
        }

        maxRelevant = pos;
        const event = parseEmtRow(row);
        if (event) events.push(event);

        if (events.length >= handleChunkSize) {
          await applyProjectionChunk(state, events, maxRelevant, undefined, true);
          events.length = 0;
          maxRelevant = null;
          await yieldToMain();
        }

        await yieldIfOverBudget(budget);
      }

      try {
        await applyProjectionChunk(state, events, maxRelevant);
      } catch (error) {
        console.error(`[ProjectionProcessor] Error processing ${def.id}:`, error);
        break;
      }

      await yieldToMain();
    }

    try {
      await def.endBatch?.(db);
    } catch (error) {
      console.error(`[ProjectionProcessor] endBatch failed for ${def.id}:`, error);
    }

    if (options?.truncateFirst && state.processed === 0) {
      await checkpointer.write(def.id, def.version, 0n);
    }

    return state.processed;
  }

  /**
   * Full replay: truncate → handle all events.
   * Uses the SAME handle function as incremental — zero divergence.
   *
   * Safety: if replay fails after truncation, the error is recorded and the
   * projection is left empty (degraded). The next `ensureUpToDate` cycle will
   * detect the missing checkpoint and retry.
   */
  async function replayProjection(def: ProjectionDefinition): Promise<number> {
    // Save pre-truncate checkpoint so we can detect failed replays
    const previousCheckpoint = await checkpointer.read(def.id);

    try {
      const processed = await runProjectionInBatches(def, 0n, { truncateFirst: true });
      return processed;
    } catch (error) {
      console.error(
        `[ProjectionProcessor] Replay failed for ${def.id} after truncation. Projection is degraded.`,
        error,
      );
      await recordProcessorError(db, { processorName: def.id, error });

      // Write a zero checkpoint so the next ensureUpToDate retries the replay
      // rather than treating the projection as "up to date" at the old position.
      if (previousCheckpoint) {
        await checkpointer.write(def.id, def.version, 0n);
      }
      throw error;
    }
  }

  /**
   * Ensure all projections are up to date.
   * - Version mismatch → full replay (truncate + handle)
   * - No checkpoint → full replay
   * - Checkpoint exists with matching version → incremental catch-up (handle)
   */
  async function ensureUpToDate(): Promise<ProjectionCatchUpReport> {
    // Fast path: if the max global_position hasn't moved since last successful run,
    // skip entirely with ZERO SQL queries. The cache is invalidated by:
    // - processEvents() (local commits)
    // - PowerSync watchers (event_signals / emt_count_trigger) which call us with cache=null
    // So the periodic_catchup safety net can skip completely when cache is set.
    if (lastKnownMaxPosition !== null) {
      return { replayed: [], caughtUp: [], totalEventsProcessed: 0 };
    }

    const ensureStartMs = nowMs();
    const replayed: string[] = [];
    const caughtUp: string[] = [];
    const totals = { totalEventsProcessed: 0 };
    const timings = new Map<string, { handleMs: number; endBatchMs: number }>();

    const states: Array<{
      readonly def: ProjectionDefinition;
      readonly initialCursor: bigint;
      cursor: bigint;
      readonly wasReplayed: boolean;
      isBlocked: boolean;
      processed: number;
    }> = [];
    const unionTypes = new Set<string>();
    const definitions = Array.from(registry.values());
    const checkpointsByProjectionId = await checkpointer.readMany(definitions.map((def) => def.id));
    const startupMeta = await tryReadStartupMeta(db);

    const allCheckpointsCurrent =
      definitions.length > 0 &&
      definitions.every((def) => {
        const checkpoint = checkpointsByProjectionId.get(def.id);
        return checkpoint && checkpoint.version === def.version;
      });

    if (allCheckpointsCurrent) {
      const minCheckpointCursor = definitions.reduce<bigint | null>((min, def) => {
        const checkpoint = checkpointsByProjectionId.get(def.id);
        if (!checkpoint) return min;
        const cursor = BigInt(checkpoint.last_processed_position);
        if (min === null || cursor < min) return cursor;
        return min;
      }, null);

      if (
        startupMeta !== null &&
        startupMeta?.observedGlobalPosition !== null &&
        minCheckpointCursor !== null &&
        startupMeta.observedGlobalPosition <= minCheckpointCursor
      ) {
        if (
          startupMeta.lastSyncedAt !== null &&
          startupMeta.processedSyncAt !== startupMeta.lastSyncedAt
        ) {
          lastKnownMaxPosition = startupMeta.observedGlobalPosition;
          await setSyncMetaBestEffort(
            db,
            PROJECTION_LAST_PROCESSED_SYNC_AT_META_KEY,
            startupMeta.lastSyncedAt,
          );
          return { replayed: [], caughtUp: [], totalEventsProcessed: 0 };
        }
        if (!hasUsableStartupSyncStamp(startupMeta)) {
          // Fall through to the diagnostic path below.
        } else {
          lastKnownMaxPosition = startupMeta.observedGlobalPosition;
          return { replayed: [], caughtUp: [], totalEventsProcessed: 0 };
        }
      }
    }

    const startupCatchUpDiagnostics = collectStartupCatchUpDiagnostics(
      definitions,
      checkpointsByProjectionId,
      startupMeta,
    );
    if (startupCatchUpDiagnostics.reasons.length > 0) {
      const reasonsText = startupCatchUpDiagnostics.reasons.join(',');
      const replayCandidatesText =
        startupCatchUpDiagnostics.replayCandidates.length > 0
          ? startupCatchUpDiagnostics.replayCandidates.join(',')
          : 'none';
      const laggingProjectionIdsText =
        startupCatchUpDiagnostics.laggingProjectionIds.length > 0
          ? startupCatchUpDiagnostics.laggingProjectionIds.join(',')
          : 'none';
      const observedGlobalPositionText = startupMeta?.observedGlobalPosition?.toString() ?? 'null';
      const minCheckpointCursorText =
        startupCatchUpDiagnostics.minCheckpointCursor?.toString() ?? 'null';
      const lastSyncedAtText = startupMeta?.lastSyncedAt ?? 'null';
      const processedSyncAtText = startupMeta?.processedSyncAt ?? 'null';
      console.info(
        `[ProjectionProcessor] Startup catch-up required reasons=${reasonsText} replayCandidates=${replayCandidatesText} laggingProjectionIds=${laggingProjectionIdsText} observedGlobalPosition=${observedGlobalPositionText} minCheckpointCursor=${minCheckpointCursorText} lastSyncedAt=${lastSyncedAtText} processedSyncAt=${processedSyncAtText}`,
      );
    }

    for (const def of definitions) {
      try {
        const checkpoint = checkpointsByProjectionId.get(def.id) ?? null;

        if (!checkpoint || checkpoint.version !== def.version) {
          await def.truncate(db);
          replayed.push(def.id);
          states.push({
            def,
            initialCursor: 0n,
            cursor: 0n,
            wasReplayed: true,
            isBlocked: false,
            processed: 0,
          });
        } else {
          const checkpointCursor = BigInt(checkpoint.last_processed_position);
          states.push({
            def,
            initialCursor: checkpointCursor,
            cursor: checkpointCursor,
            wasReplayed: false,
            isBlocked: false,
            processed: 0,
          });
        }

        for (const t of def.canHandle) {
          unionTypes.add(t);
        }
      } catch (error) {
        console.error(`[ProjectionProcessor] ensureUpToDate failed for ${def.id}:`, error);
      }
    }

    const minCursor = states.reduce<bigint | null>((min, s) => {
      if (s.isBlocked) return min;
      if (min === null) return s.cursor;
      return s.cursor < min ? s.cursor : min;
    }, null);

    if (unionTypes.size > 0 && minCursor !== null) {
      // Enter batch mode: projections accumulate writes in memory instead of
      // flushing to SQL after each handle() call. This prevents watcher
      // notification cascades that cause continuous React re-renders during sync.
      for (const state of states) {
        state.def.beginBatch?.();
      }

      let scanCursor = minCursor;

      while (true) {
        const { rows, maxPosition } = await withWatchdogStepAsync(
          'ProjectionProcessor.ensureUpToDate.readPage',
          () => readMessageRowsPage(unionTypes, scanCursor),
          { warnAfterMs: WATCHDOG_WARN_AFTER_MS },
        );
        if (rows.length === 0 || maxPosition === null) break;

        scanCursor = maxPosition;

        for (const state of states) {
          if (state.isBlocked) continue;
          let lastEvent: ProjectedEvent | undefined;

          try {
            const events: ProjectedEvent[] = [];
            let maxRelevant: bigint | null = null;
            const budget = { lastYieldMs: nowMs() };

            for (const row of rows) {
              let pos: bigint;
              try {
                pos = BigInt(row.global_position);
              } catch {
                continue;
              }
              if (pos <= state.cursor) continue;
              if (!state.def.canHandle.has(row.message_type)) continue;

              maxRelevant = pos;

              const event = parseEmtRow(row);
              if (event) {
                events.push(event);
                lastEvent = event;
              }

              if (events.length >= handleChunkSize) {
                await applyProjectionChunk(state, events, maxRelevant, totals, true);
                events.length = 0;
                maxRelevant = null;
                await yieldToMain();
              }

              await yieldIfOverBudget(budget);
            }

            // Write checkpoint once per page per projection (not per chunk)
            const handleStart = nowMs();
            await applyProjectionChunk(state, events, maxRelevant, totals);
            const handleElapsed = nowMs() - handleStart;
            const t = timings.get(state.def.id) ?? { handleMs: 0, endBatchMs: 0 };
            t.handleMs += handleElapsed;
            timings.set(state.def.id, t);

            // Even if a projection had no matching events in this page, it has still
            // observed and skipped everything up to scanCursor via the union scan.
            // Advancing sparse projections prevents re-scanning from 0 on every reload.
            if (scanCursor > state.cursor) {
              state.cursor = scanCursor;
            }
          } catch (error) {
            state.isBlocked = true;
            console.error(`[ProjectionProcessor] Error processing ${state.def.id}:`, error);
            await recordProcessorError(db, {
              processorName: state.def.id,
              event: lastEvent,
              error,
            });
            continue;
          }

          await yieldToMain();
        }

        await yieldToMain();
      }

      // Flush all accumulated writes at once — single watcher notification per projection.
      for (const state of states) {
        if (state.isBlocked) continue;
        try {
          const batchStart = nowMs();
          await state.def.endBatch?.(db);
          const batchElapsed = nowMs() - batchStart;
          const t = timings.get(state.def.id) ?? { handleMs: 0, endBatchMs: 0 };
          t.endBatchMs += batchElapsed;
          timings.set(state.def.id, t);
        } catch (error) {
          console.error(`[ProjectionProcessor] endBatch failed for ${state.def.id}:`, error);
          await recordProcessorError(db, {
            processorName: state.def.id,
            error,
          });
        }
      }
    }

    for (const state of states) {
      if (!state.isBlocked && (state.wasReplayed || state.cursor !== state.initialCursor)) {
        try {
          await checkpointer.write(state.def.id, state.def.version, state.cursor);
        } catch (error) {
          console.error(
            `[ProjectionProcessor] Failed to write checkpoint for ${state.def.id}`,
            error,
          );
        }
      }
      if (!state.wasReplayed && state.processed > 0) {
        caughtUp.push(state.def.id);
      }
    }

    // Cache the max cursor so periodic catchup short-circuits (1 query vs 5+).
    const maxCursor = states.reduce<bigint>((max, s) => (s.cursor > max ? s.cursor : max), 0n);
    lastKnownMaxPosition = maxCursor;
    if (startupMeta?.observedGlobalPosition !== maxCursor) {
      await setSyncMetaBestEffort(db, EMMETT_LAST_GLOBAL_POSITION_META_KEY, String(maxCursor));
    }
    const stableLastSyncedAt = startupMeta?.lastSyncedAt ?? null;
    if (stableLastSyncedAt !== null && startupMeta?.processedSyncAt !== stableLastSyncedAt) {
      await setSyncMetaBestEffort(
        db,
        PROJECTION_LAST_PROCESSED_SYNC_AT_META_KEY,
        stableLastSyncedAt,
      );
    }

    // Notify subscribers of degraded (blocked) projections
    const blocked = states.filter((s) => s.isBlocked).map((s) => s.def.id);
    notifyDegraded(blocked);

    // Instrumentation: log timing breakdown when work was done
    const totalMs = nowMs() - ensureStartMs;
    if (totals.totalEventsProcessed > 0 || totalMs > 100) {
      const breakdown = [...timings.entries()]
        .map(([id, t]) => {
          const s = states.find((st) => st.def.id === id);
          return `${id}: handle=${Math.round(t.handleMs)}ms endBatch=${Math.round(t.endBatchMs)}ms events=${s?.processed ?? 0}`;
        })
        .join(' | ');
      console.info(
        `[ProjectionProcessor] ensureUpToDate total=${Math.round(totalMs)}ms events=${totals.totalEventsProcessed} ${breakdown}`,
      );
    }

    return { replayed, caughtUp, totalEventsProcessed: totals.totalEventsProcessed };
  }

  async function rebuild(projectionId: string): Promise<number> {
    const def = registry.get(projectionId);
    if (!def) throw new Error(`[ProjectionProcessor] Unknown projection: ${projectionId}`);
    return replayProjection(def);
  }

  async function rebuildAll(): Promise<number> {
    let total = 0;
    const failed: string[] = [];
    for (const [, def] of registry) {
      try {
        total += await replayProjection(def);
      } catch {
        failed.push(def.id);
      }
    }
    if (failed.length > 0) {
      notifyDegraded(failed);
    }
    return total;
  }

  return {
    register,
    processEvents: (events: readonly ProjectedEvent[]) => withMutex(() => processEvents(events)),
    ensureUpToDate: () => withMutex(() => ensureUpToDate()),
    invalidateCache() {
      lastKnownMaxPosition = null;
    },
    rebuild: (projectionId: string) => withMutex(() => rebuild(projectionId)),
    rebuildAll: () => withMutex(() => rebuildAll()),
    onDegradedProjections(callback: (ids: readonly string[]) => void): () => void {
      degradedListeners.add(callback);
      return () => {
        degradedListeners.delete(callback);
      };
    },
    getDegradedProjections(): readonly string[] {
      return degradedProjectionIds;
    },
  };
}

// =============================================================================
// Singleton Factory
// =============================================================================

// =============================================================================
// Singleton storage on globalThis (survives Vite HMR module replacement)
// =============================================================================

const PROCESSOR_GLOBAL_KEY = '__neurodual_projection_processor__';

type ProcessorEntry = {
  instance: ProjectionProcessor;
  db: AbstractPowerSyncDatabase;
};

function getProcessorEntry(): ProcessorEntry | null {
  const g = globalThis as Record<string, unknown>;
  return (g[PROCESSOR_GLOBAL_KEY] as ProcessorEntry | null) ?? null;
}

function setProcessorEntry(entry: ProcessorEntry | null): void {
  const g = globalThis as Record<string, unknown>;
  g[PROCESSOR_GLOBAL_KEY] = entry;
}

/**
 * Get (or create) the singleton ProjectionProcessor.
 * Pre-registers all built-in projection definitions.
 *
 * Stored on globalThis (not as a module-level variable) so the same instance
 * is reused across Vite HMR module replacements. Without this, every file save
 * would reset the singleton to null, causing ensureUpToDate() to reprocess
 * already-handled events and freeze the UI for several seconds.
 */
export function getProjectionProcessor(
  db: AbstractPowerSyncDatabase,
  options?: { persistence?: PersistencePort },
): ProjectionProcessor {
  const persistence = options?.persistence;
  const entry = getProcessorEntry();

  if (entry && entry.db === db) {
    if (persistence) {
      entry.instance.register(createSessionSummariesProjectionDefinition(persistence));
    }
    return entry.instance;
  }

  const processor = createProjectionProcessor(db);
  processor.register(streakProjectionDefinition);
  processor.register(dailyActivityProjectionDefinition);
  processor.register(nLevelProjectionDefinition);
  processor.register(journeyStateProjectionDefinition);
  if (persistence) {
    processor.register(createSessionSummariesProjectionDefinition(persistence));
  }

  setProcessorEntry({ instance: processor, db });
  return processor;
}

export function resetProjectionProcessor(): void {
  setProcessorEntry(null);
}

/**
 * Convert a StoredEvent (from CommandBus commit) to a ProjectedEvent.
 */
export function toProjectedEvent(event: {
  type: string;
  data: Record<string, unknown>;
  globalPosition: bigint;
  createdAt: Date;
}): ProjectedEvent {
  return {
    type: event.type,
    data: event.data,
    globalPosition: event.globalPosition,
    createdAt: event.createdAt,
  };
}
