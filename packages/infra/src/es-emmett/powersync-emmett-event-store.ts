/**
 * PowerSync-backed Emmett Event Store
 *
 * Implements the Emmett SQLite event store contract using PowerSync.
 * Follows the official Emmett schema structure with:
 * - emt_streams: stream state and version tracking
 * - emt_messages: event storage with global_position (monotonic) and stream_position (per-stream version)
 *
 * Based on: upstream Emmett SQLite schema v0.42.0
 *
 * Note: PowerSync's writeTransaction tx only has execute() method, not get().
 * SELECT queries inside transactions use execute() and parse results.
 */

import type { AbstractPowerSyncDatabase } from '@powersync/web';

import { ConcurrencyError, StreamNotFoundError, StreamAlreadyExistsError } from './errors';
import { EVENT_SCHEMA_VERSION, DEFAULT_MAX_CACHE_SIZE } from './config';
import type { StoredEvent } from './event-store-types';
import type { InlineProjectionDefinition } from './inline-projection';
import { EMMETT_LAST_GLOBAL_POSITION_META_KEY, toSyncMetaSqlLabel } from './startup-meta';
import { parseSqlDate, safeJsonParse } from '../db/sql-helpers';

// =============================================================================
// Emmett Constants
// =============================================================================

export const STREAM_DOES_NOT_EXIST = 0n;
export const STREAM_EXISTS = -1n;
export const NO_CONCURRENCY_CHECK = -2n;

export const DEFAULT_PARTITION = 'global';
export const MESSAGE_KIND_EVENT = 'E';

// =============================================================================
// Global Position Generation (multi-device safe)
// =============================================================================

// Emmett's SQLite schema uses BIGINT global_position. In a multi-device replicated
// setup (PowerSync + Supabase), MAX()+1 allocation will collide across devices.
//
// We generate a Snowflake-like 63-bit integer:
// - 41 bits: milliseconds since epoch
// - 16 bits: node id (stable per device when possible)
// - 6 bits: per-millisecond sequence (0..63)
//
// This gives globally unique, roughly time-ordered positions without coordination.
const GLOBAL_POS_EPOCH_MS = Date.UTC(2020, 0, 1);
const GLOBAL_POS_NODE_BITS = 16n;
const GLOBAL_POS_SEQ_BITS = 6n;
const GLOBAL_POS_SEQ_MAX = (1n << GLOBAL_POS_SEQ_BITS) - 1n; // 63
const GLOBAL_POS_NODE_MAX = (1n << GLOBAL_POS_NODE_BITS) - 1n; // 65535
const GLOBAL_POS_NODE_SHIFT = GLOBAL_POS_SEQ_BITS;
const GLOBAL_POS_TS_SHIFT = GLOBAL_POS_NODE_BITS + GLOBAL_POS_SEQ_BITS;
const GLOBAL_POS_NODE_META_KEY = 'emmett:global-position-node-id:v1';

function randomInt(maxExclusive: number): number {
  if (!(maxExclusive > 0)) return 0;
  const g = globalThis as unknown as { crypto?: { getRandomValues?: (arr: Uint32Array) => void } };
  if (g.crypto?.getRandomValues) {
    const buf = new Uint32Array(1);
    g.crypto.getRandomValues(buf);
    return (buf[0] ?? 0) % maxExclusive;
  }
  return Math.floor(Math.random() * maxExclusive);
}

// =============================================================================
// Type Definitions
// =============================================================================

export type ExpectedStreamVersion =
  | typeof STREAM_DOES_NOT_EXIST
  | typeof STREAM_EXISTS
  | typeof NO_CONCURRENCY_CHECK
  | bigint;

export type StreamId = {
  aggregateId: string;
  aggregateType: string;
};

export type AppendEvent = {
  eventId: string;
  type: string;
  data: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

export type { StoredEvent } from './event-store-types';

export type ReadStreamResult = {
  currentStreamVersion: bigint;
  streamExists: boolean;
  events: StoredEvent[];
};

export type ReadAllResult = {
  events: StoredEvent[];
  currentGlobalPosition: bigint;
  hasMore: boolean;
};

export type OnCommitCallback = (result: {
  streamId: StreamId;
  events: StoredEvent[];
  tx: Parameters<Parameters<AbstractPowerSyncDatabase['writeTransaction']>[0]>[0];
}) => Promise<void> | void;

export type AppendResult = {
  nextStreamPosition: bigint;
  createdNewStream: boolean;
  events: StoredEvent[];
};

export interface EmmettEventStore {
  appendToStream(args: {
    streamId: StreamId;
    expectedVersion?: ExpectedStreamVersion;
    events: readonly AppendEvent[];
    onCommit?: OnCommitCallback;
  }): Promise<AppendResult>;

  readStream(args: {
    streamId: StreamId;
    fromVersion?: bigint;
    maxCount?: bigint;
  }): Promise<ReadStreamResult>;

  /**
   * Reconstruit l'état d'un agrégat à partir de ses événements.
   * Utilise une fonction evolve pour appliquer chaque événement à l'état.
   */
  aggregateStream<TState, TEvent extends AppendEvent>(
    streamId: StreamId | string,
    options: {
      evolve: (state: TState, event: TEvent) => TState;
      initialState: () => TState;
      from?: bigint; // Position de départ (pour snapshot)
    },
  ): Promise<{
    state: TState;
    version: bigint;
    nextExpectedVersion: ExpectedStreamVersion;
  }>;

  /**
   * Read events from the global log ordered by global_position.
   * This is the primitive that projections/processors use to catch up.
   * Equivalent to Emmett's readMessagesBatch().
   */
  readAll(args: {
    after: bigint;
    batchSize?: number;
    eventTypes?: ReadonlySet<string>;
  }): Promise<ReadAllResult>;

  /**
   * Register an inline projection that runs atomically within appendToStream.
   * Follows Emmett's onBeforeCommit pattern.
   */
  registerInlineProjection(definition: InlineProjectionDefinition): void;

  /**
   * Register a callback invoked after events are successfully appended.
   * Runs OUTSIDE the transaction (post-commit).
   * Used by watchers/processors to trigger catch-up without polling.
   */
  onEventsAppended(callback: (events: StoredEvent[]) => void): () => void;
}

// =============================================================================
// Internal Helpers
// =============================================================================

const DEFAULT_STREAM_VERSION = 0n;

/**
 * Format standard: `{boundedContext}:{aggregateType}:{aggregateId}`
 * Exemple: "training:session:abc-123"
 *
 * Pour rétrocompatibilité, si aggregateType contient déjà ':', on le suppose formaté.
 */
export function streamIdToString(streamId: StreamId): string {
  return `${streamId.aggregateType}:${streamId.aggregateId}`;
}

/**
 * Crée un StreamID typé avec bounded context.
 *
 * @param boundedContext - Contexte délimité (ex: "training")
 * @param aggregateType - Type d'agrégat (ex: "session")
 * @param aggregateId - ID de l'agrégat
 */
export function createStreamId(
  boundedContext: string,
  aggregateType: string,
  aggregateId: string,
): StreamId {
  return {
    aggregateType: `${boundedContext}:${aggregateType}`,
    aggregateId,
  };
}

/**
 * Parse un stream ID string en ses composants.
 * Utile pour lire les stream IDs depuis la base de données.
 */
export function parseStreamId(streamId: string): {
  boundedContext?: string;
  aggregateType: string;
  aggregateId: string;
} {
  const parts = streamId.split(':');
  if (parts.length === 1) {
    return {
      aggregateType: parts[0] ?? '',
      aggregateId: streamId,
    };
  }

  if (parts.length === 2) {
    // Legacy format: "aggregateType:aggregateId"
    return {
      aggregateType: parts[0] ?? '',
      aggregateId: parts[1] ?? '',
    };
  }

  // Standard format: "boundedContext:aggregateType:aggregateId"
  return {
    boundedContext: parts[0],
    aggregateType: parts[1] ?? '',
    aggregateId: parts.slice(2).join(':'),
  };
}

function validateExpectedVersion(
  streamId: string,
  currentVersion: bigint,
  expectedVersion: ExpectedStreamVersion | undefined,
): void {
  if (expectedVersion === undefined || expectedVersion === NO_CONCURRENCY_CHECK) {
    return;
  }

  if (expectedVersion === STREAM_DOES_NOT_EXIST) {
    if (currentVersion !== DEFAULT_STREAM_VERSION) {
      throw new StreamAlreadyExistsError(streamId);
    }
    return;
  }

  if (expectedVersion === STREAM_EXISTS) {
    if (currentVersion === DEFAULT_STREAM_VERSION) {
      throw new StreamNotFoundError(streamId);
    }
    return;
  }

  if (typeof expectedVersion === 'bigint') {
    if (currentVersion !== expectedVersion) {
      throw new ConcurrencyError(streamId, expectedVersion, currentVersion);
    }
  }
}

// =============================================================================
// Stream Version Cache
// =============================================================================

/**
 * Bounded LRU cache for stream versions.
 * Prevents unbounded memory growth in long-running sessions.
 *
 * Uses a simple eviction strategy: removes the oldest entry when capacity is reached.
 * For a true LRU, we'd track access order, but FIFO eviction is sufficient for
 * the typical access pattern (read-modify-write on same stream).
 */
class BoundedStreamVersionCache {
  private cache = new Map<string, bigint>();
  private maxSize: number;

  constructor(maxSize = DEFAULT_MAX_CACHE_SIZE) {
    this.maxSize = maxSize;
  }

  get(streamId: StreamId): bigint | undefined {
    return this.cache.get(streamIdToString(streamId));
  }

  set(streamId: StreamId, version: bigint): void {
    const key = streamIdToString(streamId);

    // If at capacity and this is a new key, evict oldest (FIFO via iterator order)
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, version);
  }

  clear(): void {
    this.cache.clear();
  }

  /** Get current cache size (useful for monitoring) */
  get size(): number {
    return this.cache.size;
  }
}

// =============================================================================
// Event Store Implementation
// =============================================================================

export function createEmmettEventStore(
  db: AbstractPowerSyncDatabase,
  options?: { maxCacheSize?: number },
): EmmettEventStore {
  const versionCache = new BoundedStreamVersionCache(options?.maxCacheSize);
  const inlineProjections: InlineProjectionDefinition[] = [];
  const appendListeners = new Set<(events: StoredEvent[]) => void>();
  let nodeIdPromise: Promise<bigint> | null = null;
  let lastTs = 0n;
  let lastSeq = 0n;

  const setSyncMetaBestEffort = async (
    executor: {
      execute: (sql: string, params?: (string | number)[]) => Promise<unknown>;
    },
    key: string,
    value: string | null,
  ): Promise<void> => {
    const label = toSyncMetaSqlLabel(key);
    try {
      await executor.execute(`DELETE FROM sync_meta WHERE id = ? /* sync_meta:delete:${label} */`, [
        key,
      ]);
      if (value !== null && value !== '') {
        await executor.execute(
          `INSERT INTO sync_meta (id, value, updated_at) VALUES (?, ?, datetime('now')) /* sync_meta:set:${label} */`,
          [key, value],
        );
      }
    } catch {
      // Best-effort only: sync_meta may be unavailable in some runtimes/tests.
    }
  };

  const getOrCreateNodeId = async (): Promise<bigint> => {
    nodeIdPromise ??= (async () => {
      const nodeMetaLabel = toSyncMetaSqlLabel(GLOBAL_POS_NODE_META_KEY);
      try {
        const existing = await db.execute(
          `SELECT value FROM sync_meta WHERE id = ? LIMIT 1 /* sync_meta:get:${nodeMetaLabel} */`,
          [GLOBAL_POS_NODE_META_KEY],
        );
        const existingRows = getRows<{ value: unknown }>(existing);
        const raw = existingRows[0]?.value;
        const n = typeof raw === 'string' || typeof raw === 'number' ? BigInt(raw) : null;
        if (n !== null && n >= 0n && n <= GLOBAL_POS_NODE_MAX) {
          return n;
        }
      } catch {
        // Best-effort: sync_meta may be unavailable in some runtimes/tests.
      }

      const generated = BigInt(randomInt(Number(GLOBAL_POS_NODE_MAX) + 1));
      await setSyncMetaBestEffort(db, GLOBAL_POS_NODE_META_KEY, String(generated));
      return generated;
    })();

    return nodeIdPromise;
  };

  const nextGlobalPosition = async (): Promise<bigint> => {
    const nodeId = await getOrCreateNodeId();
    // Milliseconds since epoch (clamped to 0 for safety on mis-set clocks).
    let ts = BigInt(Math.max(0, Date.now() - GLOBAL_POS_EPOCH_MS));

    // Ensure monotonicity within this runtime instance.
    if (ts < lastTs) ts = lastTs;
    if (ts === lastTs) {
      if (lastSeq >= GLOBAL_POS_SEQ_MAX) {
        ts = lastTs + 1n;
        lastSeq = 0n;
      } else {
        lastSeq += 1n;
      }
    } else {
      lastSeq = 0n;
    }
    lastTs = ts;

    return (ts << GLOBAL_POS_TS_SHIFT) | (nodeId << GLOBAL_POS_NODE_SHIFT) | lastSeq;
  };

  /**
   * Helper to get rows from PowerSync QueryResult.
   */
  function getRows<T>(result: { rows?: { _array?: T[] } | T[] | null }): T[] {
    if (!result.rows) return [];
    if (Array.isArray(result.rows)) return result.rows as T[];
    if (result.rows._array) return result.rows._array;
    return [];
  }

  /**
   * Append events to a stream with optimistic concurrency control.
   *
   * Uses atomic global_position allocation via INSERT with subquery.
   * Accepts an optional onCommit callback that runs within the transaction
   * after all events are written, enabling atomic idempotence tracking.
   */
  async function appendToStream({
    streamId,
    expectedVersion,
    events,
    onCommit,
  }: {
    streamId: StreamId;
    expectedVersion?: ExpectedStreamVersion;
    events: readonly AppendEvent[];
    onCommit?: OnCommitCallback;
  }): Promise<AppendResult> {
    if (events.length === 0) {
      return {
        nextStreamPosition: DEFAULT_STREAM_VERSION,
        createdNewStream: false,
        events: [],
      };
    }

    const streamIdStr = streamIdToString(streamId);
    const streamType = streamId.aggregateType;

    // Resolve node id outside the write transaction (best-effort cached).
    // This avoids doing sync_meta reads inside the hot transaction loop.
    await getOrCreateNodeId();

    // Read version cache outside the transaction. Safe because emt_streams is
    // localOnly (no cloud sync) and writes are serialized per-stream by the
    // command bus's enqueueByStream.
    const cachedVersion = versionCache.get(streamId);

    const result = (await db.writeTransaction(async (tx) => {
      let currentVersion: bigint;

      if (cachedVersion !== undefined) {
        // Cache hit: skip SELECT emt_streams (populated by previous append or readStream)
        currentVersion = cachedVersion;
      } else {
        // Cache miss (first write of session or after restart): fall back to SQL
        const currentResultRows = await tx.execute(
          `SELECT stream_position FROM emt_streams
           WHERE stream_id = ? AND partition = ? AND is_archived = 0
           LIMIT 1`,
          [streamIdStr, DEFAULT_PARTITION],
        );
        const rows = getRows<{ stream_position: string | null }>(currentResultRows);
        const currentResult = rows[0];

        const fromStreams =
          currentResult && currentResult.stream_position !== null
            ? BigInt(currentResult.stream_position)
            : null;

        if (fromStreams !== null) {
          currentVersion = fromStreams;
        } else {
          const maxResult = await tx.execute(
            `SELECT MAX(CAST(stream_position AS INTEGER)) as max_pos
             FROM emt_messages
             WHERE stream_id = ? AND partition = ? AND message_kind = ? AND is_archived = 0`,
            [streamIdStr, DEFAULT_PARTITION, MESSAGE_KIND_EVENT],
          );
          const maxRows = getRows<{ max_pos: unknown }>(maxResult);
          const maxPos = maxRows[0]?.max_pos;
          currentVersion =
            typeof maxPos === 'number' || typeof maxPos === 'string' ? BigInt(maxPos) : 0n;
        }
      }

      const createdNewStream = currentVersion === DEFAULT_STREAM_VERSION;
      validateExpectedVersion(streamIdStr, currentVersion, expectedVersion);

      let nextStreamPosition = currentVersion;
      const storedEvents: StoredEvent[] = [];
      const now = new Date().toISOString();

      for (let i = 0; i < events.length; i++) {
        const event = events[i];
        if (!event) continue;

        nextStreamPosition += 1n;

        const messageData = JSON.stringify({
          id: event.eventId,
          type: event.type,
          data: event.data,
        });

        // Emmett envelope: store causationId, correlationId, timestamp in message_metadata
        const envelope = event.metadata ?? {};
        const envelopeData = {
          causationId: envelope['causationId'],
          correlationId: envelope['correlationId'],
          timestamp: envelope['timestamp'] ?? new Date().toISOString(),
        };
        const messageMetadata = JSON.stringify(envelopeData);

        const messageId = `${streamIdStr}:${nextStreamPosition}`;
        const globalPosition = await nextGlobalPosition();
        await tx.execute(
          `INSERT INTO emt_messages (
            id, stream_id, stream_position, partition, message_kind,
            message_data, message_metadata, message_schema_version,
            message_type, message_id, is_archived, global_position, created
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
          [
            messageId,
            streamIdStr,
            String(nextStreamPosition), // TEXT column
            DEFAULT_PARTITION,
            MESSAGE_KIND_EVENT,
            messageData,
            messageMetadata,
            EVENT_SCHEMA_VERSION,
            event.type,
            event.eventId,
            String(globalPosition), // TEXT column (BIGINT-as-string)
            now,
          ],
        );

        storedEvents.push({
          eventId: event.eventId,
          streamPosition: nextStreamPosition,
          globalPosition,
          type: event.type,
          data: event.data,
          metadata: event.metadata ?? {},
          createdAt: new Date(now),
        });
      }

      // Update or create stream entry
      const streamPk = `${streamIdStr}:${DEFAULT_PARTITION}`;
      // PowerSync exposes tables as views (backed by `ps_data_local__*`), so `rowsAffected`
      // can be 0 even when the INSTEAD OF trigger updates the underlying table.
      // Do not use `rowsAffected` to decide whether the row exists.
      await tx.execute(
        `UPDATE emt_streams
         SET stream_position = ?
         WHERE id = ?`,
        [String(nextStreamPosition), streamPk],
      );
      await tx.execute(
        `INSERT OR IGNORE INTO emt_streams (
           id, stream_id, stream_position, partition, stream_type, stream_metadata, is_archived
         ) VALUES (?, ?, ?, ?, ?, ?, 0)`,
        [streamPk, streamIdStr, String(nextStreamPosition), DEFAULT_PARTITION, streamType, '{}'],
      );

      versionCache.set(streamId, nextStreamPosition);

      // Execute inline projections within the transaction (onBeforeCommit pattern).
      // These run atomically with the event append — either both succeed or neither.
      if (inlineProjections.length > 0 && storedEvents.length > 0) {
        for (const proj of inlineProjections) {
          const matching = storedEvents.filter((e) => proj.canHandle.has(e.type));
          if (matching.length > 0) {
            await proj.handle(matching, tx);
          }
        }
      }

      // Execute onCommit callback within the transaction, before commit
      // This enables atomic idempotence: processed_commands is written
      // in the same transaction as the events, preventing duplicates on crash.
      if (onCommit) {
        await onCommit({ streamId, events: storedEvents, tx });
      }

      const latestGlobalPosition = storedEvents[storedEvents.length - 1]?.globalPosition ?? null;
      await setSyncMetaBestEffort(
        tx,
        EMMETT_LAST_GLOBAL_POSITION_META_KEY,
        latestGlobalPosition === null ? null : String(latestGlobalPosition),
      );

      return {
        nextStreamPosition,
        createdNewStream,
        events: storedEvents,
      };
    })) as AppendResult;

    // Notify listeners after transaction commit (outside the transaction)
    if (result.events.length > 0 && appendListeners.size > 0) {
      for (const listener of appendListeners) {
        try {
          listener(result.events);
        } catch {
          // listener errors are non-fatal
        }
      }
    }

    return result;
  }

  /**
   * Read events from a stream.
   */
  async function readStream({
    streamId,
    fromVersion = DEFAULT_STREAM_VERSION,
    maxCount,
  }: {
    streamId: StreamId;
    fromVersion?: bigint;
    maxCount?: bigint;
  }): Promise<ReadStreamResult> {
    const streamIdStr = streamIdToString(streamId);

    // Get stream state
    const streamResult = await db.execute(
      `SELECT stream_position FROM emt_streams
       WHERE stream_id = ? AND partition = ? AND is_archived = 0
       LIMIT 1`,
      [streamIdStr, DEFAULT_PARTITION],
    );
    const streamRows = getRows<{ stream_position: string | null }>(streamResult);
    const streamResultRow = streamRows[0];

    let currentStreamVersion =
      streamResultRow && streamResultRow.stream_position !== null
        ? BigInt(streamResultRow.stream_position)
        : null;

    if (currentStreamVersion === null) {
      // Stream row missing: compute from messages (works for synced streams).
      const maxResult = await db.execute(
        `SELECT MAX(CAST(stream_position AS INTEGER)) as max_pos
         FROM emt_messages
         WHERE stream_id = ? AND partition = ? AND message_kind = ? AND is_archived = 0`,
        [streamIdStr, DEFAULT_PARTITION, MESSAGE_KIND_EVENT],
      );
      const maxRows = getRows<{ max_pos: unknown }>(maxResult);
      const maxPos = maxRows[0]?.max_pos;
      currentStreamVersion =
        typeof maxPos === 'number' || typeof maxPos === 'string' ? BigInt(maxPos) : 0n;
    }

    if (currentStreamVersion === DEFAULT_STREAM_VERSION) {
      return {
        currentStreamVersion: DEFAULT_STREAM_VERSION,
        streamExists: false,
        events: [],
      };
    }

    versionCache.set(streamId, currentStreamVersion);

    const fromPosition =
      fromVersion === DEFAULT_STREAM_VERSION ? String(DEFAULT_STREAM_VERSION) : String(fromVersion);

    let limitClause = '';
    const params: (string | number)[] = [
      streamIdStr,
      DEFAULT_PARTITION,
      MESSAGE_KIND_EVENT,
      fromPosition,
    ];

    if (maxCount !== undefined && maxCount > 0n) {
      limitClause = ' LIMIT ?';
      params.push(String(maxCount));
    }

    const messagesResult = await db.execute(
      `SELECT global_position, stream_position, message_type, message_data, message_metadata, created
       FROM emt_messages
       WHERE stream_id = ? AND partition = ? AND message_kind = ?
         AND CAST(stream_position AS INTEGER) >= ? AND is_archived = 0
       ORDER BY CAST(stream_position AS INTEGER) ASC${limitClause}`,
      params,
    );

    const messageRows = getRows<{
      global_position: string;
      stream_position: string;
      message_type: string;
      message_data: string;
      message_metadata: string;
      created: string;
    }>(messagesResult);

    const events: StoredEvent[] = messageRows.map((row) => {
      let parsedData = safeJsonParse<{
        id?: string;
        type?: string;
        data?: Record<string, unknown>;
      }>(row.message_data, {});
      if (!parsedData || typeof parsedData !== 'object') {
        // Log corrupted event data for debugging - don't silently ignore
        console.error('[Emmett] Failed to parse message_data:', {
          globalPosition: row.global_position,
          streamPosition: row.stream_position,
          messageType: row.message_type,
          rawDataLength: row.message_data.length,
        });
        parsedData = {}; // Explicit fallback
      }

      let parsedMetadata = safeJsonParse<Record<string, unknown>>(row.message_metadata, {});
      if (!parsedMetadata || typeof parsedMetadata !== 'object') {
        // Log corrupted metadata for debugging
        console.error('[Emmett] Failed to parse message_metadata:', {
          globalPosition: row.global_position,
          streamPosition: row.stream_position,
          messageType: row.message_type,
          rawMetadataLength: row.message_metadata.length,
        });
        parsedMetadata = {}; // Explicit fallback
      }

      // Extract envelope fields from message_data if present (legacy compatibility)
      // and merge with metadata for a complete envelope
      const envelopeMetadata = {
        ...parsedMetadata,
      };

      return {
        eventId: parsedData?.id ?? '',
        streamPosition: BigInt(row.stream_position), // TEXT to BigInt
        globalPosition: BigInt(row.global_position), // TEXT to BigInt
        type: row.message_type,
        data: parsedData?.data ?? {},
        metadata: envelopeMetadata,
        createdAt: parseSqlDate(row.created) ?? new Date(0),
      };
    });

    return {
      currentStreamVersion,
      streamExists: true,
      events,
    };
  }

  /**
   * Reconstruit l'état d'un agrégat à partir de ses événements.
   * Applique chaque événement à l'état initial via la fonction evolve.
   */
  async function aggregateStream<TState, TEvent extends AppendEvent>(
    streamId: StreamId | string,
    options: {
      evolve: (state: TState, event: TEvent) => TState;
      initialState: () => TState;
      from?: bigint;
    },
  ): Promise<{
    state: TState;
    version: bigint;
    nextExpectedVersion: ExpectedStreamVersion;
  }> {
    // Normalize streamId to StreamId object if string is passed
    const normalizedStreamId: StreamId =
      typeof streamId === 'string'
        ? (() => {
            const parsed = parseStreamId(streamId);
            const aggregateType = parsed.boundedContext
              ? `${parsed.boundedContext}:${parsed.aggregateType}`
              : parsed.aggregateType;
            return {
              aggregateType,
              aggregateId: parsed.aggregateId,
            };
          })()
        : streamId;

    const result = await readStream({
      streamId: normalizedStreamId,
      fromVersion: options.from,
    });

    let state = options.initialState();
    let version = 0n;

    for (const event of result.events) {
      state = options.evolve(state, event as unknown as TEvent);
      version = event.streamPosition;
    }

    return {
      state,
      version,
      nextExpectedVersion: version === 0n ? STREAM_DOES_NOT_EXIST : version,
    };
  }

  // Default batch sizes: smaller in browser (UI thread) to avoid freezes.
  const DEFAULT_BATCH_SIZE = typeof window === 'undefined' ? 500 : 200;

  /**
   * Read events from the global log ordered by global_position.
   * Equivalent to Emmett's readMessagesBatch().
   *
   * Returns events with global_position strictly greater than `after`.
   * Used by processors/projections to catch up from a checkpoint.
   */
  async function readAll({
    after,
    batchSize,
    eventTypes,
  }: {
    after: bigint;
    batchSize?: number;
    eventTypes?: ReadonlySet<string>;
  }): Promise<ReadAllResult> {
    const limit = batchSize ?? DEFAULT_BATCH_SIZE;

    let whereClause = `message_kind = '${MESSAGE_KIND_EVENT}' AND is_archived = 0 AND CAST(global_position AS INTEGER) > ?`;
    const params: (string | number)[] = [String(after)];

    if (eventTypes && eventTypes.size > 0) {
      const types = Array.from(eventTypes);
      const placeholders = types.map(() => '?').join(', ');
      whereClause += ` AND message_type IN (${placeholders})`;
      params.push(...types);
    }

    params.push(limit);

    const result = await db.execute(
      `SELECT message_id, global_position, stream_id, stream_position,
              message_type, message_data, message_metadata, created
       FROM emt_messages
       WHERE ${whereClause}
       ORDER BY CAST(global_position AS INTEGER) ASC
       LIMIT ?`,
      params,
    );

    const rows = getRows<{
      message_id: string;
      global_position: string;
      stream_id: string;
      stream_position: string;
      message_type: string;
      message_data: string;
      message_metadata: string;
      created: string;
    }>(result);

    let currentGlobalPosition = after;
    const events: StoredEvent[] = [];

    for (const row of rows) {
      const parsedData = safeJsonParse<{
        id?: string;
        type?: string;
        data?: Record<string, unknown>;
      } | null>(row.message_data, null);
      if (!parsedData || typeof parsedData !== 'object') {
        continue; // Skip corrupted events
      }

      const parsedMetadata = safeJsonParse<Record<string, unknown>>(row.message_metadata, {});

      const globalPos = BigInt(row.global_position);
      if (globalPos > currentGlobalPosition) {
        currentGlobalPosition = globalPos;
      }

      events.push({
        eventId: parsedData?.id ?? row.message_id ?? '',
        streamPosition: BigInt(row.stream_position),
        globalPosition: globalPos,
        type: row.message_type,
        data: parsedData?.data ?? {},
        metadata: parsedMetadata,
        createdAt: parseSqlDate(row.created) ?? new Date(0),
      });
    }

    return {
      events,
      currentGlobalPosition,
      hasMore: rows.length >= limit,
    };
  }

  function registerInlineProjection(definition: InlineProjectionDefinition): void {
    inlineProjections.push(definition);
  }

  function onEventsAppended(callback: (events: StoredEvent[]) => void): () => void {
    appendListeners.add(callback);
    return () => {
      appendListeners.delete(callback);
    };
  }

  return {
    appendToStream,
    readStream,
    aggregateStream,
    readAll,
    registerInlineProjection,
    onEventsAppended,
  };
}
