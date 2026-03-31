/**
 * Processor Engine — central engine for ES processors/projections.
 *
 * Manages the lifecycle of processors:
 * - Incremental processing: read new events via `readAll`, filter, handle, checkpoint
 * - Full replay (version change): truncate → readAll → handle
 * - Checkpoint tracking via the Checkpointer
 *
 * This replaces the scattered projection-processor.ts logic, using
 * the event store's `readAll()` instead of direct SQL.
 */

import type { AbstractPowerSyncDatabase } from '@powersync/web';
import type { EmmettEventStore, StoredEvent } from './powersync-emmett-event-store';
import type { Checkpointer } from './checkpointer';
import type { ProcessorDefinition, ProcessorEvent } from './processor-definition';
import { recordProcessorError } from './processor-errors';
import {
  EMMETT_LAST_GLOBAL_POSITION_META_KEY,
  POWERSYNC_LAST_SYNCED_AT_META_KEY,
  PROJECTION_LAST_PROCESSED_SYNC_AT_META_KEY,
  toSyncMetaSqlLabel,
} from './startup-meta';

export type { ProcessorDefinition, ProcessorEvent } from './processor-definition';

// Browser catch-up runs on the UI thread. Smaller chunks to avoid freezes.
const DEFAULT_HANDLE_CHUNK_SIZE = typeof window === 'undefined' ? 500 : 50;
const DEFAULT_READ_BATCH_SIZE = typeof window === 'undefined' ? 500 : 200;

export interface CatchUpReport {
  readonly replayed: readonly string[];
  readonly caughtUp: readonly string[];
  readonly totalEventsProcessed: number;
}

export interface ProcessorEngine {
  register(definition: ProcessorDefinition): void;
  ensureUpToDate(): Promise<CatchUpReport>;
  /** Invalidate the position cache so the next ensureUpToDate does real work. */
  invalidateCache(): void;
  rebuild(processorId: string): Promise<number>;
  rebuildAll(): Promise<number>;
  onDegradedProcessors(callback: (ids: readonly string[]) => void): () => void;
  getDegradedProcessors(): readonly string[];
}

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function storedToProcessorEvent(e: StoredEvent): ProcessorEvent {
  return {
    type: e.type,
    data: e.data,
    globalPosition: e.globalPosition,
    createdAt: e.createdAt,
  };
}

type StartupMetaSnapshot = {
  observedGlobalPosition: bigint | null;
  lastSyncedAt: string | null;
  processedSyncAt: string | null;
};

type StartupCatchUpDiagnostics = {
  readonly reasons: readonly string[];
  readonly replayCandidates: readonly string[];
  readonly laggingProcessorIds: readonly string[];
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
        `SELECT id, value FROM sync_meta WHERE id IN (${placeholders}) /* sync_meta:get-many:${toSyncMetaSqlLabel('projection-engine:startup')} */`,
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
  definitions: readonly ProcessorDefinition[],
  checkpointsByProcessorId: ReadonlyMap<
    string,
    { version: number; last_processed_position: string }
  >,
  startupMeta: StartupMetaSnapshot | null,
): StartupCatchUpDiagnostics {
  const observedGlobalPosition = startupMeta?.observedGlobalPosition ?? null;
  const replayCandidates = definitions
    .filter((def) => {
      const checkpoint = checkpointsByProcessorId.get(def.id);
      return !checkpoint || checkpoint.version !== def.version;
    })
    .map((def) => def.id);

  const minCheckpointCursor = definitions.reduce<bigint | null>((min, def) => {
    const checkpoint = checkpointsByProcessorId.get(def.id);
    if (!checkpoint || checkpoint.version !== def.version) return min;
    const cursor = BigInt(checkpoint.last_processed_position);
    if (min === null || cursor < min) return cursor;
    return min;
  }, null);

  const laggingProcessorIds =
    observedGlobalPosition !== null
      ? definitions
          .filter((def) => {
            const checkpoint = checkpointsByProcessorId.get(def.id);
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
    laggingProcessorIds,
    minCheckpointCursor,
  };
}

export function createProcessorEngine(
  db: AbstractPowerSyncDatabase,
  store: EmmettEventStore,
  checkpointer: Checkpointer,
): ProcessorEngine {
  const registry = new Map<string, ProcessorDefinition>();

  // Degraded processor tracking
  let degradedIds: readonly string[] = [];
  const degradedListeners = new Set<(ids: readonly string[]) => void>();

  function notifyDegraded(ids: readonly string[]): void {
    const changed = ids.length !== degradedIds.length || ids.some((id, i) => id !== degradedIds[i]);
    if (!changed) return;
    degradedIds = ids;
    for (const cb of degradedListeners) {
      try {
        cb(ids);
      } catch {
        // listener errors are non-fatal
      }
    }
  }

  // Cache: short-circuit ensureUpToDate when nothing changed
  let lastKnownMaxPosition: bigint | null = null;

  // Async mutex
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

  function register(definition: ProcessorDefinition): void {
    registry.set(definition.id, definition);
  }

  async function ensureUpToDate(): Promise<CatchUpReport> {
    // Fast path: skip if nothing changed
    if (lastKnownMaxPosition !== null) {
      return { replayed: [], caughtUp: [], totalEventsProcessed: 0 };
    }

    const replayed: string[] = [];
    const caughtUp: string[] = [];
    let totalEventsProcessed = 0;

    type State = {
      readonly def: ProcessorDefinition;
      readonly initialCursor: bigint;
      cursor: bigint;
      readonly wasReplayed: boolean;
      isBlocked: boolean;
      processed: number;
    };

    const states: State[] = [];
    const unionTypes = new Set<string>();
    const definitions = Array.from(registry.values());
    const checkpointsByProcessorId = await checkpointer.readMany(definitions.map((def) => def.id));
    const startupMeta = await tryReadStartupMeta(db);

    const allCheckpointsCurrent =
      definitions.length > 0 &&
      definitions.every((def) => {
        const checkpoint = checkpointsByProcessorId.get(def.id);
        return checkpoint && checkpoint.version === def.version;
      });

    if (allCheckpointsCurrent) {
      const minCheckpointCursor = definitions.reduce<bigint | null>((min, def) => {
        const checkpoint = checkpointsByProcessorId.get(def.id);
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
      checkpointsByProcessorId,
      startupMeta,
    );
    if (startupCatchUpDiagnostics.reasons.length > 0) {
      const reasonsText = startupCatchUpDiagnostics.reasons.join(',');
      const replayCandidatesText =
        startupCatchUpDiagnostics.replayCandidates.length > 0
          ? startupCatchUpDiagnostics.replayCandidates.join(',')
          : 'none';
      const laggingProcessorIdsText =
        startupCatchUpDiagnostics.laggingProcessorIds.length > 0
          ? startupCatchUpDiagnostics.laggingProcessorIds.join(',')
          : 'none';
      const observedGlobalPositionText = startupMeta?.observedGlobalPosition?.toString() ?? 'null';
      const minCheckpointCursorText =
        startupCatchUpDiagnostics.minCheckpointCursor?.toString() ?? 'null';
      const lastSyncedAtText = startupMeta?.lastSyncedAt ?? 'null';
      const processedSyncAtText = startupMeta?.processedSyncAt ?? 'null';
      console.info(
        `[ProcessorEngine] Startup catch-up required reasons=${reasonsText} replayCandidates=${replayCandidatesText} laggingProcessorIds=${laggingProcessorIdsText} observedGlobalPosition=${observedGlobalPositionText} minCheckpointCursor=${minCheckpointCursorText} lastSyncedAt=${lastSyncedAtText} processedSyncAt=${processedSyncAtText}`,
      );
    }

    // Phase 1: Read checkpoints, determine replay vs incremental
    for (const def of definitions) {
      try {
        const checkpoint = checkpointsByProcessorId.get(def.id) ?? null;

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
        console.error(`[ProcessorEngine] ensureUpToDate init failed for ${def.id}:`, error);
      }
    }

    const minCursor = states.reduce<bigint | null>((min, s) => {
      if (s.isBlocked) return min;
      if (min === null) return s.cursor;
      return s.cursor < min ? s.cursor : min;
    }, null);

    if (unionTypes.size > 0 && minCursor !== null) {
      // Enter batch mode
      for (const state of states) {
        state.def.beginBatch?.();
      }

      let scanCursor = minCursor;

      // Phase 2: Read events via store.readAll, dispatch to processors
      while (true) {
        const {
          events: rawEvents,
          currentGlobalPosition,
          hasMore,
        } = await store.readAll({
          after: scanCursor,
          batchSize: DEFAULT_READ_BATCH_SIZE,
          eventTypes: unionTypes,
        });
        if (rawEvents.length === 0) break;

        scanCursor = currentGlobalPosition;

        for (const state of states) {
          if (state.isBlocked) continue;

          try {
            const events: ProcessorEvent[] = [];
            let maxRelevant: bigint | null = null;

            for (const raw of rawEvents) {
              if (raw.globalPosition <= state.cursor) continue;
              if (!state.def.canHandle.has(raw.type)) continue;

              maxRelevant = raw.globalPosition;
              events.push(storedToProcessorEvent(raw));

              // Chunk to avoid UI freezes
              if (events.length >= DEFAULT_HANDLE_CHUNK_SIZE) {
                await state.def.handle(events, db);
                state.processed += events.length;
                totalEventsProcessed += events.length;
                state.cursor = maxRelevant;
                events.length = 0;
                maxRelevant = null;
                await yieldToMain();
              }
            }

            // Flush remaining events
            if (events.length > 0 && maxRelevant !== null) {
              await state.def.handle(events, db);
              state.processed += events.length;
              totalEventsProcessed += events.length;
              state.cursor = maxRelevant;
            }

            // Even if this processor had no matching events in the page, it has still
            // observed and skipped all events up to scanCursor via the union scan.
            // Advancing sparse processors prevents re-scanning from 0 on every reload.
            if (scanCursor > state.cursor) {
              state.cursor = scanCursor;
            }
          } catch (error) {
            state.isBlocked = true;
            console.error(`[ProcessorEngine] Error processing ${state.def.id}:`, error);
            await recordProcessorError(db, {
              processorName: state.def.id,
              error,
            });
            continue;
          }

          await yieldToMain();
        }

        if (!hasMore) break;
        await yieldToMain();
      }

      // Phase 3: Flush batch mode
      for (const state of states) {
        if (state.isBlocked) continue;
        try {
          await state.def.endBatch?.(db);
        } catch (error) {
          console.error(`[ProcessorEngine] endBatch failed for ${state.def.id}:`, error);
          await recordProcessorError(db, { processorName: state.def.id, error });
        }
      }
    }

    // Persist checkpoints once per successful run.
    for (const state of states) {
      if (!state.isBlocked && (state.wasReplayed || state.cursor !== state.initialCursor)) {
        try {
          await checkpointer.write(state.def.id, state.def.version, state.cursor);
        } catch (error) {
          console.error(`[ProcessorEngine] Failed to write checkpoint for ${state.def.id}`, error);
        }
      }
      if (!state.wasReplayed && state.processed > 0) {
        caughtUp.push(state.def.id);
      }
    }

    // Cache and persist the last successfully processed global position / sync stamp.
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

    notifyDegraded(states.filter((s) => s.isBlocked).map((s) => s.def.id));

    return { replayed, caughtUp, totalEventsProcessed };
  }

  async function replayProcessor(def: ProcessorDefinition): Promise<number> {
    const previousCheckpoint = await checkpointer.read(def.id);

    try {
      await def.truncate(db);
      def.beginBatch?.();

      let cursor = 0n;
      let processed = 0;

      while (true) {
        const { events: rawEvents, hasMore } = await store.readAll({
          after: cursor,
          batchSize: DEFAULT_READ_BATCH_SIZE,
          eventTypes: def.canHandle,
        });
        if (rawEvents.length === 0) break;

        const events = rawEvents
          .filter((e) => def.canHandle.has(e.type))
          .map(storedToProcessorEvent);

        if (events.length > 0) {
          await def.handle(events, db);
          processed += events.length;
        }

        const lastEvent = rawEvents[rawEvents.length - 1];
        if (lastEvent) cursor = lastEvent.globalPosition;

        await checkpointer.write(def.id, def.version, cursor);

        if (!hasMore) break;
        await yieldToMain();
      }

      await def.endBatch?.(db);

      if (processed === 0) {
        await checkpointer.write(def.id, def.version, 0n);
      }

      return processed;
    } catch (error) {
      console.error(
        `[ProcessorEngine] Replay failed for ${def.id} after truncation. Processor is degraded.`,
        error,
      );
      await recordProcessorError(db, { processorName: def.id, error });
      if (previousCheckpoint) {
        await checkpointer.write(def.id, def.version, 0n);
      }
      throw error;
    }
  }

  async function rebuild(processorId: string): Promise<number> {
    const def = registry.get(processorId);
    if (!def) throw new Error(`[ProcessorEngine] Unknown processor: ${processorId}`);
    return replayProcessor(def);
  }

  async function rebuildAll(): Promise<number> {
    let total = 0;
    const failed: string[] = [];
    for (const [, def] of registry) {
      try {
        total += await replayProcessor(def);
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
    ensureUpToDate: () => withMutex(() => ensureUpToDate()),
    invalidateCache() {
      lastKnownMaxPosition = null;
    },
    rebuild: (processorId: string) => withMutex(() => rebuild(processorId)),
    rebuildAll: () => withMutex(() => rebuildAll()),
    onDegradedProcessors(callback: (ids: readonly string[]) => void): () => void {
      degradedListeners.add(callback);
      return () => {
        degradedListeners.delete(callback);
      };
    },
    getDegradedProcessors(): readonly string[] {
      return degradedIds;
    },
  };
}

// =============================================================================
// Singleton (survives Vite HMR)
// =============================================================================

const ENGINE_GLOBAL_KEY = '__neuroDualProcessorEngine__';

type EngineEntry = {
  instance: ProcessorEngine;
  db: AbstractPowerSyncDatabase;
};

function getEngineEntry(): EngineEntry | null {
  const g = globalThis as Record<string, unknown>;
  return (g[ENGINE_GLOBAL_KEY] as EngineEntry | null) ?? null;
}

function setEngineEntry(entry: EngineEntry | null): void {
  const g = globalThis as Record<string, unknown>;
  g[ENGINE_GLOBAL_KEY] = entry;
}

/**
 * Get (or create) the singleton ProcessorEngine.
 */
export function getProcessorEngine(
  db: AbstractPowerSyncDatabase,
  store: EmmettEventStore,
  checkpointer: Checkpointer,
): ProcessorEngine {
  const entry = getEngineEntry();

  if (entry && entry.db === db) {
    return entry.instance;
  }

  const engine = createProcessorEngine(db, store, checkpointer);
  setEngineEntry({ instance: engine, db });
  return engine;
}

export function resetProcessorEngine(): void {
  setEngineEntry(null);
}

/**
 * Invalidate the processor engine cache if the singleton exists.
 * Safe to call even if no engine has been created yet.
 * This ensures the next ensureUpToDate() call does real work.
 */
export function invalidateProcessorEngineCache(): void {
  getEngineEntry()?.instance.invalidateCache();
}
