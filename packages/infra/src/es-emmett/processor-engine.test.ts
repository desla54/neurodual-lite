/**
 * Tests for the ProcessorEngine — the core ES processor loop.
 *
 * Uses a mock event store + checkpointer to verify:
 * - Registration and ensureUpToDate
 * - Version-based replay
 * - Incremental catch-up
 * - Degraded processor tracking
 */

import { beforeEach, describe, expect, it, spyOn } from 'bun:test';
import type { AbstractPowerSyncDatabase } from '@powersync/web';
import {
  createProcessorEngine,
  type ProcessorDefinition,
  type ProcessorEvent,
} from './processor-engine';
import type { EmmettEventStore, StoredEvent, ReadAllResult } from './powersync-emmett-event-store';
import type { Checkpointer, CheckpointRow } from './checkpointer';
import {
  EMMETT_LAST_GLOBAL_POSITION_META_KEY,
  POWERSYNC_LAST_SYNCED_AT_META_KEY,
  PROJECTION_LAST_PROCESSED_SYNC_AT_META_KEY,
} from './startup-meta';

// =============================================================================
// Mock Event Store
// =============================================================================

function createMockStore(events: StoredEvent[] = []): EmmettEventStore {
  return {
    async appendToStream() {
      throw new Error('Not implemented in mock');
    },
    async readStream() {
      throw new Error('Not implemented in mock');
    },
    async aggregateStream() {
      throw new Error('Not implemented in mock');
    },
    registerInlineProjection() {},
    onEventsAppended() {
      return () => {};
    },
    async readAll(args: {
      after: bigint;
      batchSize?: number;
      eventTypes?: ReadonlySet<string>;
    }): Promise<ReadAllResult> {
      const limit = args.batchSize ?? 200;
      let filtered = events.filter((e) => e.globalPosition > args.after);
      if (args.eventTypes && args.eventTypes.size > 0) {
        filtered = filtered.filter((e) => args.eventTypes!.has(e.type));
      }
      filtered.sort((a, b) => (a.globalPosition < b.globalPosition ? -1 : 1));
      const batch = filtered.slice(0, limit);
      const lastPos = batch.length > 0 ? batch[batch.length - 1]!.globalPosition : args.after;
      return {
        events: batch,
        currentGlobalPosition: lastPos,
        hasMore: batch.length >= limit,
      };
    },
  };
}

// =============================================================================
// Mock Checkpointer
// =============================================================================

function createMockCheckpointer(): Checkpointer & { data: Map<string, CheckpointRow> } {
  const data = new Map<string, CheckpointRow>();
  return {
    data,
    async read(processorId: string): Promise<CheckpointRow | null> {
      return data.get(processorId) ?? null;
    },
    async readMany(processorIds: readonly string[]): Promise<Map<string, CheckpointRow>> {
      const rows = new Map<string, CheckpointRow>();
      for (const processorId of processorIds) {
        const row = data.get(processorId);
        if (row) rows.set(processorId, row);
      }
      return rows;
    },
    async write(processorId: string, version: number, position: bigint): Promise<void> {
      data.set(processorId, {
        id: processorId,
        subscription_id: processorId,
        version,
        partition: 'global',
        last_processed_position: String(position),
      });
    },
    async reset(processorId: string): Promise<void> {
      data.delete(processorId);
    },
  };
}

// =============================================================================
// Mock DB (minimal, just for handle calls)
// =============================================================================

function createMockDb(options?: {
  startupMeta?: Partial<Record<string, string>>;
}): AbstractPowerSyncDatabase & { executeCalls: string[] } {
  const startupMeta = new Map<string, string>(
    Object.entries(options?.startupMeta ?? {}) as [string, string][],
  );
  const executeCalls: string[] = [];
  return {
    async execute(sql: string, params?: unknown[]) {
      executeCalls.push(sql);
      if (sql.includes('DELETE FROM sync_meta')) {
        const key = String(params?.[0] ?? '');
        startupMeta.delete(key);
      }
      if (sql.includes('INSERT INTO sync_meta')) {
        const key = String(params?.[0] ?? '');
        const value = String(params?.[1] ?? '');
        startupMeta.set(key, value);
      }
      return { rowsAffected: 0 };
    },
    async getOptional<T>(sql: string) {
      return null;
    },
    async getAll<T>(sql: string, params?: unknown[]) {
      if (sql.includes('FROM sync_meta WHERE id IN')) {
        return (params ?? [])
          .map((key) => String(key))
          .filter((key) => startupMeta.has(key))
          .map((key) => ({ id: key, value: startupMeta.get(key) ?? null })) as T[];
      }
      return [] as T[];
    },
    executeCalls,
  } as unknown as AbstractPowerSyncDatabase & { executeCalls: string[] };
}

// =============================================================================
// Helper: create events
// =============================================================================

function makeEvent(type: string, pos: bigint, data: Record<string, unknown> = {}): StoredEvent {
  return {
    eventId: `evt-${pos}`,
    streamPosition: 1n,
    globalPosition: pos,
    type,
    data,
    metadata: {},
    createdAt: new Date(),
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('ProcessorEngine', () => {
  let db: AbstractPowerSyncDatabase;

  beforeEach(() => {
    db = createMockDb();
  });

  it('should process events for a registered processor', async () => {
    const events = [
      makeEvent('SESSION_ENDED', 1n, { sessionId: 's1' }),
      makeEvent('TRIAL_PRESENTED', 2n),
      makeEvent('SESSION_ENDED', 3n, { sessionId: 's2' }),
    ];
    const store = createMockStore(events);
    const checkpointer = createMockCheckpointer();

    const handled: ProcessorEvent[] = [];
    const def: ProcessorDefinition = {
      id: 'test-processor',
      version: 1,
      canHandle: new Set(['SESSION_ENDED']),
      handle: async (evts) => {
        handled.push(...evts);
      },
      truncate: async () => {},
    };

    const engine = createProcessorEngine(db, store, checkpointer);
    engine.register(def);
    const report = await engine.ensureUpToDate();

    expect(handled.length).toBe(2);
    expect(handled[0]!.type).toBe('SESSION_ENDED');
    expect(handled[1]!.type).toBe('SESSION_ENDED');
    expect(report.replayed).toContain('test-processor');
    expect(report.totalEventsProcessed).toBe(2);

    // Checkpoint should be written
    const cp = await checkpointer.read('test-processor');
    expect(cp).not.toBeNull();
    expect(cp!.version).toBe(1);
    expect(BigInt(cp!.last_processed_position)).toBe(3n);
  });

  it('should skip already-processed events (incremental)', async () => {
    const events = [
      makeEvent('SESSION_ENDED', 1n),
      makeEvent('SESSION_ENDED', 2n),
      makeEvent('SESSION_ENDED', 3n),
    ];
    const store = createMockStore(events);
    const checkpointer = createMockCheckpointer();

    // Pre-set checkpoint at position 2
    await checkpointer.write('test-processor', 1, 2n);

    const handled: ProcessorEvent[] = [];
    const def: ProcessorDefinition = {
      id: 'test-processor',
      version: 1,
      canHandle: new Set(['SESSION_ENDED']),
      handle: async (evts) => {
        handled.push(...evts);
      },
      truncate: async () => {},
    };

    const engine = createProcessorEngine(db, store, checkpointer);
    engine.register(def);
    const report = await engine.ensureUpToDate();

    expect(handled.length).toBe(1);
    expect(handled[0]!.globalPosition).toBe(3n);
    expect(report.caughtUp).toContain('test-processor');
    expect(report.replayed.length).toBe(0);
  });

  it('should replay on version mismatch', async () => {
    const events = [makeEvent('SESSION_ENDED', 1n), makeEvent('SESSION_ENDED', 2n)];
    const store = createMockStore(events);
    const checkpointer = createMockCheckpointer();

    // Checkpoint was written with version 1
    await checkpointer.write('test-processor', 1, 2n);

    let truncated = false;
    const handled: ProcessorEvent[] = [];
    const def: ProcessorDefinition = {
      id: 'test-processor',
      version: 2, // Bumped version!
      canHandle: new Set(['SESSION_ENDED']),
      handle: async (evts) => {
        handled.push(...evts);
      },
      truncate: async () => {
        truncated = true;
      },
    };

    const engine = createProcessorEngine(db, store, checkpointer);
    engine.register(def);
    const report = await engine.ensureUpToDate();

    expect(truncated).toBe(true);
    expect(handled.length).toBe(2); // All events replayed
    expect(report.replayed).toContain('test-processor');

    const cp = await checkpointer.read('test-processor');
    expect(cp!.version).toBe(2);
  });

  it('should short-circuit when cache is set', async () => {
    const events = [makeEvent('SESSION_ENDED', 1n)];
    const store = createMockStore(events);
    const checkpointer = createMockCheckpointer();

    const handled: ProcessorEvent[] = [];
    const def: ProcessorDefinition = {
      id: 'test-processor',
      version: 1,
      canHandle: new Set(['SESSION_ENDED']),
      handle: async (evts) => {
        handled.push(...evts);
      },
      truncate: async () => {},
    };

    const engine = createProcessorEngine(db, store, checkpointer);
    engine.register(def);

    // First call processes events
    await engine.ensureUpToDate();
    expect(handled.length).toBe(1);

    // Second call short-circuits (cache hit)
    const report2 = await engine.ensureUpToDate();
    expect(report2.totalEventsProcessed).toBe(0);
    expect(handled.length).toBe(1); // No new events handled

    // Invalidate cache → processes again (but no new events)
    engine.invalidateCache();
    const report3 = await engine.ensureUpToDate();
    expect(report3.totalEventsProcessed).toBe(0); // No new events in store
  });

  it('should track degraded processors on error', async () => {
    const events = [makeEvent('SESSION_ENDED', 1n)];
    const store = createMockStore(events);
    const checkpointer = createMockCheckpointer();

    const def: ProcessorDefinition = {
      id: 'failing-processor',
      version: 1,
      canHandle: new Set(['SESSION_ENDED']),
      handle: async () => {
        throw new Error('Intentional test error');
      },
      truncate: async () => {},
    };

    const engine = createProcessorEngine(db, store, checkpointer);
    engine.register(def);

    const degraded: string[][] = [];
    engine.onDegradedProcessors((ids) => degraded.push([...ids]));

    await engine.ensureUpToDate();

    expect(engine.getDegradedProcessors()).toContain('failing-processor');
    expect(degraded.length).toBe(1);
    expect(degraded[0]).toContain('failing-processor');
  });

  it('should handle multiple processors independently', async () => {
    const events = [
      makeEvent('SESSION_ENDED', 1n),
      makeEvent('BADGE_UNLOCKED', 2n),
      makeEvent('SESSION_ENDED', 3n),
    ];
    const store = createMockStore(events);
    const checkpointer = createMockCheckpointer();

    const sessionHandled: ProcessorEvent[] = [];
    const badgeHandled: ProcessorEvent[] = [];

    const sessionDef: ProcessorDefinition = {
      id: 'session-processor',
      version: 1,
      canHandle: new Set(['SESSION_ENDED']),
      handle: async (evts) => {
        sessionHandled.push(...evts);
      },
      truncate: async () => {},
    };

    const badgeDef: ProcessorDefinition = {
      id: 'badge-processor',
      version: 1,
      canHandle: new Set(['BADGE_UNLOCKED']),
      handle: async (evts) => {
        badgeHandled.push(...evts);
      },
      truncate: async () => {},
    };

    const engine = createProcessorEngine(db, store, checkpointer);
    engine.register(sessionDef);
    engine.register(badgeDef);
    await engine.ensureUpToDate();

    expect(sessionHandled.length).toBe(2);
    expect(badgeHandled.length).toBe(1);
    expect(badgeHandled[0]!.type).toBe('BADGE_UNLOCKED');
  });

  it('should call beginBatch/endBatch', async () => {
    const events = [makeEvent('SESSION_ENDED', 1n)];
    const store = createMockStore(events);
    const checkpointer = createMockCheckpointer();

    let batchStarted = false;
    let batchEnded = false;

    const def: ProcessorDefinition = {
      id: 'batch-processor',
      version: 1,
      canHandle: new Set(['SESSION_ENDED']),
      handle: async () => {},
      truncate: async () => {},
      beginBatch: () => {
        batchStarted = true;
      },
      endBatch: async () => {
        batchEnded = true;
      },
    };

    const engine = createProcessorEngine(db, store, checkpointer);
    engine.register(def);
    await engine.ensureUpToDate();

    expect(batchStarted).toBe(true);
    expect(batchEnded).toBe(true);
  });

  it('should advance sparse processor checkpoints to the scanned page end', async () => {
    const events = [
      makeEvent('SESSION_ENDED', 1n),
      makeEvent('SESSION_ENDED', 2n),
      makeEvent('SESSION_ENDED', 3n),
    ];
    const store = createMockStore(events);
    const checkpointer = createMockCheckpointer();

    const handled: ProcessorEvent[] = [];
    const denseDef: ProcessorDefinition = {
      id: 'dense-processor',
      version: 1,
      canHandle: new Set(['SESSION_ENDED']),
      handle: async (evts) => {
        handled.push(...evts);
      },
      truncate: async () => {},
    };
    const sparseDef: ProcessorDefinition = {
      id: 'sparse-processor',
      version: 1,
      canHandle: new Set(['BADGE_UNLOCKED']),
      handle: async () => {},
      truncate: async () => {},
    };

    const engine = createProcessorEngine(db, store, checkpointer);
    engine.register(denseDef);
    engine.register(sparseDef);
    await engine.ensureUpToDate();

    expect(handled.length).toBe(3);
    expect(BigInt((await checkpointer.read('dense-processor'))!.last_processed_position)).toBe(3n);
    expect(BigInt((await checkpointer.read('sparse-processor'))!.last_processed_position)).toBe(3n);

    const readAllCalls: bigint[] = [];
    const secondStore: EmmettEventStore = {
      ...createMockStore(events),
      async readAll(args) {
        readAllCalls.push(args.after);
        return createMockStore(events).readAll(args);
      },
    };

    const secondEngine = createProcessorEngine(db, secondStore, checkpointer);
    secondEngine.register(denseDef);
    secondEngine.register(sparseDef);
    const report = await secondEngine.ensureUpToDate();

    expect(report.totalEventsProcessed).toBe(0);
    expect(readAllCalls).toHaveLength(0);
  });

  it('should skip startup catch-up when checkpoints already cover the latest global position', async () => {
    const db = createMockDb({
      startupMeta: {
        [EMMETT_LAST_GLOBAL_POSITION_META_KEY]: '3',
        [POWERSYNC_LAST_SYNCED_AT_META_KEY]: '2026-03-15T10:00:00.000Z',
        [PROJECTION_LAST_PROCESSED_SYNC_AT_META_KEY]: '2026-03-15T10:00:00.000Z',
      },
    });
    const events = [
      makeEvent('SESSION_ENDED', 1n),
      makeEvent('SESSION_ENDED', 2n),
      makeEvent('SESSION_ENDED', 3n),
    ];
    const readAllCalls: bigint[] = [];
    const store: EmmettEventStore = {
      ...createMockStore(events),
      async readAll(args) {
        readAllCalls.push(args.after);
        return createMockStore(events).readAll(args);
      },
    };
    const checkpointer = createMockCheckpointer();
    await checkpointer.write('streak', 2, 3n);
    await checkpointer.write('daily-activity', 2, 3n);

    const streakDef: ProcessorDefinition = {
      id: 'streak',
      version: 2,
      canHandle: new Set(['SESSION_ENDED']),
      handle: async () => {},
      truncate: async () => {},
    };
    const dailyActivityDef: ProcessorDefinition = {
      id: 'daily-activity',
      version: 2,
      canHandle: new Set(['SESSION_ENDED']),
      handle: async () => {},
      truncate: async () => {},
    };

    const engine = createProcessorEngine(db, store, checkpointer);
    engine.register(streakDef);
    engine.register(dailyActivityDef);
    const report = await engine.ensureUpToDate();

    expect(report.totalEventsProcessed).toBe(0);
    expect(report.replayed).toHaveLength(0);
    expect(report.caughtUp).toHaveLength(0);
    expect(readAllCalls).toHaveLength(0);
  });

  it('should avoid rewriting unchanged global-position meta during an incremental no-op', async () => {
    const db = createMockDb({
      startupMeta: {
        [EMMETT_LAST_GLOBAL_POSITION_META_KEY]: '3',
        [POWERSYNC_LAST_SYNCED_AT_META_KEY]: '2026-03-15T10:00:00.000Z',
        [PROJECTION_LAST_PROCESSED_SYNC_AT_META_KEY]: '2026-03-15T09:59:00.000Z',
      },
    });
    const store = createMockStore([
      makeEvent('SESSION_ENDED', 1n),
      makeEvent('SESSION_ENDED', 2n),
      makeEvent('SESSION_ENDED', 3n),
    ]);
    const checkpointer = createMockCheckpointer();
    await checkpointer.write('streak', 2, 3n);

    const def: ProcessorDefinition = {
      id: 'streak',
      version: 2,
      canHandle: new Set(['SESSION_ENDED']),
      handle: async () => {},
      truncate: async () => {},
    };

    const engine = createProcessorEngine(db, store, checkpointer);
    engine.register(def);
    const report = await engine.ensureUpToDate();

    expect(report.totalEventsProcessed).toBe(0);
    expect(
      db.executeCalls.some((sql) =>
        sql.includes('sync_meta:delete:emmett:last-global-position:v1'),
      ),
    ).toBe(false);
    expect(
      db.executeCalls.some((sql) =>
        sql.includes('sync_meta:set:projection-engine:last-processed-sync-at:v1'),
      ),
    ).toBe(true);
  });

  it('should log why startup catch-up cannot be skipped', async () => {
    const infoSpy = spyOn(console, 'info').mockImplementation(() => {});
    const db = createMockDb({
      startupMeta: {
        [EMMETT_LAST_GLOBAL_POSITION_META_KEY]: '4',
        [POWERSYNC_LAST_SYNCED_AT_META_KEY]: '2026-03-15T10:00:00.000Z',
        [PROJECTION_LAST_PROCESSED_SYNC_AT_META_KEY]: '2026-03-15T10:00:00.000Z',
      },
    });
    const store = createMockStore([makeEvent('SESSION_ENDED', 4n)]);
    const checkpointer = createMockCheckpointer();
    await checkpointer.write('streak', 2, 3n);

    const def: ProcessorDefinition = {
      id: 'streak',
      version: 2,
      canHandle: new Set(['SESSION_ENDED']),
      handle: async () => {},
      truncate: async () => {},
    };

    const engine = createProcessorEngine(db, store, checkpointer);
    engine.register(def);
    await engine.ensureUpToDate();

    expect(infoSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'Startup catch-up required reasons=checkpoint-behind-latest replayCandidates=none laggingProcessorIds=streak observedGlobalPosition=4 minCheckpointCursor=3',
      ),
    );
  });

  it('should skip startup catch-up when sync stamp is temporarily unavailable but already processed', async () => {
    const db = createMockDb({
      startupMeta: {
        [EMMETT_LAST_GLOBAL_POSITION_META_KEY]: '3',
        [PROJECTION_LAST_PROCESSED_SYNC_AT_META_KEY]: '2026-03-15T10:00:00.000Z',
      },
    });
    const readAllCalls: bigint[] = [];
    const store: EmmettEventStore = {
      ...createMockStore([makeEvent('SESSION_ENDED', 3n)]),
      async readAll(args) {
        readAllCalls.push(args.after);
        return createMockStore([makeEvent('SESSION_ENDED', 3n)]).readAll(args);
      },
    };
    const checkpointer = createMockCheckpointer();
    await checkpointer.write('streak', 2, 3n);

    const def: ProcessorDefinition = {
      id: 'streak',
      version: 2,
      canHandle: new Set(['SESSION_ENDED']),
      handle: async () => {},
      truncate: async () => {},
    };

    const engine = createProcessorEngine(db, store, checkpointer);
    engine.register(def);
    const report = await engine.ensureUpToDate();

    expect(report.totalEventsProcessed).toBe(0);
    expect(readAllCalls).toHaveLength(0);
    expect(
      db.executeCalls.some((sql) =>
        sql.includes('sync_meta:delete:projection-engine:last-processed-sync-at:v1'),
      ),
    ).toBe(false);
  });

  it('should rebuild a specific processor', async () => {
    const events = [makeEvent('SESSION_ENDED', 1n), makeEvent('SESSION_ENDED', 2n)];
    const store = createMockStore(events);
    const checkpointer = createMockCheckpointer();

    // Already processed
    await checkpointer.write('test-processor', 1, 2n);

    let truncated = false;
    const handled: ProcessorEvent[] = [];
    const def: ProcessorDefinition = {
      id: 'test-processor',
      version: 1,
      canHandle: new Set(['SESSION_ENDED']),
      handle: async (evts) => {
        handled.push(...evts);
      },
      truncate: async () => {
        truncated = true;
      },
    };

    const engine = createProcessorEngine(db, store, checkpointer);
    engine.register(def);
    const count = await engine.rebuild('test-processor');

    expect(truncated).toBe(true);
    expect(count).toBe(2);
    expect(handled.length).toBe(2);
  });
});
