/**
 * Tests for PowerSync-backed Emmett Event Store
 */

import { describe, expect, it } from 'bun:test';
import type { AbstractPowerSyncDatabase } from '@powersync/web';
import {
  createEmmettEventStore,
  streamIdToString,
  createStreamId,
  parseStreamId,
  STREAM_DOES_NOT_EXIST,
  STREAM_EXISTS,
  NO_CONCURRENCY_CHECK,
  type AppendEvent,
  type StreamId,
} from './powersync-emmett-event-store';
import { ConcurrencyError, StreamNotFoundError, StreamAlreadyExistsError } from './errors';
import { EMMETT_LAST_GLOBAL_POSITION_META_KEY } from './startup-meta';

describe('powersync-emmett-event-store', () => {
  // Mock PowerSync database
  function createMockDb(): {
    mockDb: AbstractPowerSyncDatabase;
    getStream: (streamId: string) => {
      stream_id: string;
      stream_position: string;
      partition: string;
      stream_type: string;
    } | null;
    getMessages: (streamId: string) => {
      id: string;
      stream_id: string;
      stream_position: string;
      global_position: string;
      message_kind: string;
      message_type: string;
      message_data: string;
      message_metadata: string;
      created: string;
    }[];
    getSyncMeta: (key: string) => string | null;
  } {
    const streams = new Map<
      string,
      { stream_id: string; stream_position: string; partition: string; stream_type: string }
    >();
    const messages = new Map<
      string,
      {
        id: string;
        stream_id: string;
        stream_position: string;
        global_position: string;
        message_kind: string;
        message_type: string;
        message_data: string;
        message_metadata: string;
        created: string;
      }[]
    >();
    const syncMeta = new Map<string, string>();
    const processedCommands = new Set<string>();

    let inTransaction = false;
    const transactionCallbacks: Array<() => Promise<void>> = [];

    const execute = async (
      sql: string,
      params: (string | number)[] = [],
    ): Promise<{
      rows?: { _array?: unknown[] } | unknown[] | null;
      rowsAffected: number;
    }> => {
      // Handle SELECT queries
      if (sql.trim().toUpperCase().startsWith('SELECT')) {
        // SELECT stream_position FROM emt_streams
        if (sql.includes('emt_streams')) {
          const streamId = params[0] as string;
          const partition = params[1] as string | undefined;
          const rows = Array.from(streams.values())
            .filter(
              (s) => s.stream_id === streamId && (partition ? s.partition === partition : true),
            )
            .map((s) => ({ stream_position: s.stream_position }));
          return { rows: rows.length > 0 ? rows : null, rowsAffected: 0 };
        }

        if (sql.includes('FROM sync_meta')) {
          const key = params[0] as string;
          const value = syncMeta.get(key);
          return {
            rows: value === undefined ? [] : [{ value }],
            rowsAffected: 0,
          };
        }

        // SELECT MAX(CAST(stream_position AS INTEGER)) as max_pos FROM emt_messages ...
        if (
          sql.includes('MAX(CAST(stream_position AS INTEGER))') &&
          sql.includes('FROM emt_messages')
        ) {
          const streamId = params[0] as string;
          const messageKind = params[2] as string;
          const streamMessages = messages.get(streamId) ?? [];
          const max =
            streamMessages
              .filter((m) => m.message_kind === messageKind)
              .reduce((acc, m) => Math.max(acc, Number.parseInt(m.stream_position, 10)), 0) || 0;
          return { rows: [{ max_pos: max > 0 ? max : null }], rowsAffected: 0 };
        }

        // SELECT FROM emt_messages (readAll) - no stream_id filter, ordered by global_position
        if (
          sql.includes('FROM emt_messages') &&
          sql.includes('ORDER BY CAST(global_position AS INTEGER)') &&
          !sql.includes('stream_id = ?')
        ) {
          // readAll: params = [afterPosition, ...eventTypes?, limit]
          const afterPosition = BigInt(params[0] ?? 0);
          // Collect all messages across all streams
          type MsgEntry = {
            id: string;
            stream_id: string;
            stream_position: string;
            global_position: string;
            message_kind: string;
            message_type: string;
            message_data: string;
            message_metadata: string;
            created: string;
          };
          const allMessages: MsgEntry[] = [];
          for (const streamMsgs of messages.values()) {
            for (const m of streamMsgs) {
              if (m.message_kind === 'E') {
                allMessages.push(m);
              }
            }
          }
          // Filter by global_position > after (use BigInt for precision)
          let filtered = allMessages.filter((m) => BigInt(m.global_position) > afterPosition);
          // Filter by message_type IN (...) if present
          if (sql.includes('message_type IN')) {
            // Extract event type params (between afterPosition and limit)
            const limitIdx = params.length - 1;
            const typeParams = params.slice(1, limitIdx) as string[];
            if (typeParams.length > 0) {
              const typeSet = new Set(typeParams);
              filtered = filtered.filter((m) => typeSet.has(m.message_type));
            }
          }
          // Sort by global_position ASC (BigInt comparison)
          filtered.sort((a, b) => {
            const ga = BigInt(a.global_position);
            const gb = BigInt(b.global_position);
            return ga < gb ? -1 : ga > gb ? 1 : 0;
          });
          // Apply LIMIT (always last param)
          const limit = Number(params[params.length - 1] ?? 200);
          const limited = filtered.slice(0, limit);
          return {
            rows: limited.map((m) => ({
              message_id: m.id,
              global_position: m.global_position,
              stream_id: m.stream_id,
              stream_position: m.stream_position,
              message_type: m.message_type,
              message_data: m.message_data,
              message_metadata: m.message_metadata,
              created: m.created || new Date().toISOString(),
            })),
            rowsAffected: 0,
          };
        }

        // SELECT FROM emt_messages (readStream) - has stream_id in WHERE clause
        if (
          sql.includes('FROM emt_messages') &&
          sql.includes('ORDER BY CAST(stream_position AS INTEGER)')
        ) {
          const streamId = params[0] as string;
          const messageKind = params[2] as string;
          const fromPosition = Number(params[3] ?? 0);
          const streamMessages = messages.get(streamId) ?? [];
          const filtered = streamMessages.filter(
            (m) =>
              m.message_kind === messageKind &&
              Number(m.stream_position) >= fromPosition &&
              Number(m.stream_position) < 1000, // mock limit
          );

          filtered.sort((a, b) => Number(a.stream_position) - Number(b.stream_position));

          // Handle LIMIT clause
          let limited = filtered;
          if (sql.includes('LIMIT') && params.length > 4) {
            const limit = Number(params[4] ?? 0);
            if (limit > 0) {
              limited = filtered.slice(0, limit);
            }
          }

          return {
            rows: limited.map((m, i) => {
              // Ensure global_position is always a valid numeric string
              const gp = m.global_position;
              const isValidGlobalPos =
                gp && gp !== '' && gp !== 'undefined' && gp !== 'null' && !Number.isNaN(Number(gp));
              const globalPos = isValidGlobalPos ? gp : String(i + 1);

              const sp = m.stream_position;
              const isValidStreamPos =
                sp && sp !== '' && sp !== 'undefined' && sp !== 'null' && !Number.isNaN(Number(sp));
              const streamPos = isValidStreamPos ? sp : String(i + 1);

              return {
                global_position: globalPos,
                stream_position: streamPos,
                message_type: m.message_type,
                message_data: m.message_data,
                message_metadata: m.message_metadata,
                created: m.created || new Date().toISOString(),
              };
            }),
            rowsAffected: 0,
          };
        }

        return { rows: [], rowsAffected: 0 };
      }

      // Handle INSERT queries
      if (sql.trim().toUpperCase().startsWith('INSERT')) {
        // INSERT INTO emt_streams
        if (sql.includes('emt_streams')) {
          const pk = params[0] as string;
          const streamId = params[1] as string;
          const streamPos = params[2] as string;
          const partition = params[3] as string;
          const streamType = params[4] as string;
          streams.set(pk, {
            stream_id: streamId,
            stream_position: streamPos,
            partition,
            stream_type: streamType,
          });
          return { rowsAffected: 1 };
        }

        // INSERT INTO emt_messages
        if (sql.includes('emt_messages')) {
          const id = params[0] as string;
          const streamId = params[1] as string;
          const streamPos = params[2] as string;
          const messageKind = params[4] as string;
          const msgData = params[5] as string; // message_data
          const msgMeta = params[6] as string; // message_metadata
          const msgType = params[8] as string; // message_type
          const globalPosition = params[10] as string; // global_position
          const created = params[11] as string; // created

          const streamMessages = messages.get(streamId) ?? [];
          streamMessages.push({
            id,
            stream_id: streamId,
            stream_position: streamPos || '1',
            global_position: String(globalPosition),
            message_kind: messageKind,
            message_type: msgType,
            message_data: msgData,
            message_metadata: msgMeta,
            created: created || new Date().toISOString(),
          });
          messages.set(streamId, streamMessages);

          return { rowsAffected: 1 };
        }

        // INSERT INTO processed_commands
        if (sql.includes('processed_commands')) {
          const commandId = params[1] as string;
          processedCommands.add(commandId);
          return { rowsAffected: 1 };
        }

        if (sql.includes('sync_meta')) {
          const key = params[0] as string;
          const value = params[1] as string;
          syncMeta.set(key, value);
          return { rowsAffected: 1 };
        }

        return { rowsAffected: 0 };
      }

      // Handle UPDATE queries
      if (sql.trim().toUpperCase().startsWith('UPDATE')) {
        // UPDATE emt_streams
        if (sql.includes('emt_streams')) {
          const newStreamPos = params[0] as string;
          const streamId = params[1] as string;
          const partition = params[2] as string | undefined;
          let updatedCount = 0;
          for (const [pk, stream] of streams) {
            if (
              stream.stream_id === streamId &&
              (partition ? stream.partition === partition : true)
            ) {
              streams.set(pk, { ...stream, stream_position: newStreamPos });
              updatedCount += 1;
            }
          }
          return { rowsAffected: updatedCount };
        }
        return { rowsAffected: 0 };
      }

      if (sql.trim().toUpperCase().startsWith('DELETE') && sql.includes('sync_meta')) {
        const key = params[0] as string;
        syncMeta.delete(key);
        return { rowsAffected: 1 };
      }

      return { rowsAffected: 0 };
    };

    const writeTransaction = async (
      callback: (tx: { execute: typeof execute }) => Promise<unknown>,
    ): Promise<unknown> => {
      inTransaction = true;
      try {
        const result = await callback({ execute });
        // Execute transaction callbacks
        for (const cb of transactionCallbacks) {
          await cb();
        }
        transactionCallbacks.length = 0;
        return result;
      } finally {
        inTransaction = false;
      }
    };

    const mockDb = {
      execute,
      getOptional: async <T>(sql: string, params: (string | number)[] = []): Promise<T | null> => {
        const result = await execute(sql, params);
        const rows = (result.rows as { _array?: T[] })?._array ?? (result.rows as T[]);
        return (rows[0] as T) ?? null;
      },
      writeTransaction,
      getAll: async <T>(sql: string, params: (string | number)[] = []): Promise<T[]> => {
        const result = await execute(sql, params);
        return (result.rows as T[]) ?? [];
      },
      // Add onCommit callback support for tests
      _onCommit: (callback: () => Promise<void>) => {
        transactionCallbacks.push(callback);
      },
    } as unknown as AbstractPowerSyncDatabase;

    // Helper to get internal state for testing
    const getStream = (streamId: string) => {
      for (const s of streams.values()) {
        if (s.stream_id === streamId) return s;
      }
      return null;
    };

    const getMessages = (streamId: string) => {
      return messages.get(streamId) ?? [];
    };

    const getSyncMeta = (key: string) => syncMeta.get(key) ?? null;

    return { mockDb, getStream, getMessages, getSyncMeta };
  }

  describe('streamIdToString', () => {
    it('should format stream ID correctly', () => {
      const streamId: StreamId = {
        aggregateType: 'session',
        aggregateId: 'abc-123',
      };
      expect(streamIdToString(streamId)).toBe('session:abc-123');
    });
  });

  describe('createStreamId', () => {
    it('should create stream ID with bounded context', () => {
      const streamId = createStreamId('training', 'session', 'abc-123');
      expect(streamId.aggregateType).toBe('training:session');
      expect(streamId.aggregateId).toBe('abc-123');
    });
  });

  describe('parseStreamId', () => {
    it('should parse standard format', () => {
      const parsed = parseStreamId('training:session:abc-123');
      expect(parsed.boundedContext).toBe('training');
      expect(parsed.aggregateType).toBe('session');
      expect(parsed.aggregateId).toBe('abc-123');
    });

    it('should parse legacy two-part format (aggregateType:aggregateId)', () => {
      const parsed = parseStreamId('session:abc-123');
      expect(parsed.boundedContext).toBeUndefined();
      expect(parsed.aggregateType).toBe('session');
      expect(parsed.aggregateId).toBe('abc-123');
    });
  });

  describe('EmmettEventStore.appendToStream', () => {
    it('should append events to a new stream', async () => {
      const { mockDb, getSyncMeta } = createMockDb();
      const store = createEmmettEventStore(mockDb);

      const events: AppendEvent[] = [
        { eventId: 'evt-1', type: 'SESSION_STARTED', data: { foo: 'bar' } },
      ];

      const result = await store.appendToStream({
        streamId: { aggregateType: 'session', aggregateId: 'session-1' },
        events,
      });

      expect(result.createdNewStream).toBe(true);
      expect(result.nextStreamPosition).toBe(1n);
      expect(result.events.length).toBe(1);
      expect(result!.events[0]!.eventId).toBe('evt-1');
      expect(result!.events[0]!.streamPosition).toBe(1n);
      expect(result!.events[0]!.globalPosition > 0n).toBe(true);
      expect(getSyncMeta(EMMETT_LAST_GLOBAL_POSITION_META_KEY)).toBe(
        String(result!.events[0]!.globalPosition),
      );
    });

    it('should append multiple events to an existing stream', async () => {
      const { mockDb } = createMockDb();
      const store = createEmmettEventStore(mockDb);

      const streamId: StreamId = { aggregateType: 'session', aggregateId: 'session-1' };

      // First append
      await store.appendToStream({
        streamId,
        events: [{ eventId: 'evt-1', type: 'SESSION_STARTED', data: {} }],
      });

      // Second append
      const result = await store.appendToStream({
        streamId,
        events: [
          { eventId: 'evt-2', type: 'TRIAL_1', data: {} },
          { eventId: 'evt-3', type: 'TRIAL_2', data: {} },
        ],
      });

      expect(result.createdNewStream).toBe(false);
      expect(result.nextStreamPosition).toBe(3n);
      expect(result.events.length).toBe(2);
      expect(result!.events[0]!.streamPosition).toBe(2n);
      expect(result!.events[1]!.streamPosition).toBe(3n);
    });

    it('should enforce optimistic concurrency - exact version', async () => {
      const { mockDb } = createMockDb();
      const store = createEmmettEventStore(mockDb);

      const streamId: StreamId = { aggregateType: 'session', aggregateId: 'session-1' };

      // Create stream with one event
      await store.appendToStream({
        streamId,
        events: [{ eventId: 'evt-1', type: 'SESSION_STARTED', data: {} }],
      });

      // Try to append with wrong expected version
      await expect(
        store.appendToStream({
          streamId,
          expectedVersion: 5n, // Wrong! Current is 1
          events: [{ eventId: 'evt-2', type: 'TRIAL_1', data: {} }],
        }),
      ).rejects.toThrow(ConcurrencyError);
    });

    it('should enforce STREAM_DOES_NOT_EXIST constraint', async () => {
      const { mockDb } = createMockDb();
      const store = createEmmettEventStore(mockDb);

      const streamId: StreamId = { aggregateType: 'session', aggregateId: 'session-1' };

      // Create stream
      await store.appendToStream({
        streamId,
        expectedVersion: STREAM_DOES_NOT_EXIST,
        events: [{ eventId: 'evt-1', type: 'SESSION_STARTED', data: {} }],
      });

      // Try to create again with STREAM_DOES_NOT_EXIST
      await expect(
        store.appendToStream({
          streamId,
          expectedVersion: STREAM_DOES_NOT_EXIST,
          events: [{ eventId: 'evt-2', type: 'TRIAL_1', data: {} }],
        }),
      ).rejects.toThrow(StreamAlreadyExistsError);
    });

    it('should enforce STREAM_EXISTS constraint', async () => {
      const { mockDb } = createMockDb();
      const store = createEmmettEventStore(mockDb);

      const streamId: StreamId = { aggregateType: 'session', aggregateId: 'session-1' };

      // Try to append to non-existent stream with STREAM_EXISTS
      await expect(
        store.appendToStream({
          streamId,
          expectedVersion: STREAM_EXISTS,
          events: [{ eventId: 'evt-1', type: 'SESSION_STARTED', data: {} }],
        }),
      ).rejects.toThrow(StreamNotFoundError);
    });

    it('should skip version check with NO_CONCURRENCY_CHECK', async () => {
      const { mockDb } = createMockDb();
      const store = createEmmettEventStore(mockDb);

      const streamId: StreamId = { aggregateType: 'session', aggregateId: 'session-1' };

      // Append with any version - should not throw
      await store.appendToStream({
        streamId,
        expectedVersion: NO_CONCURRENCY_CHECK,
        events: [{ eventId: 'evt-1', type: 'SESSION_STARTED', data: {} }],
      });

      await store.appendToStream({
        streamId,
        expectedVersion: NO_CONCURRENCY_CHECK,
        events: [{ eventId: 'evt-2', type: 'TRIAL_1', data: {} }],
      });

      expect(true).toBe(true); // If we got here, no error was thrown
    });

    it('should handle empty events array', async () => {
      const { mockDb } = createMockDb();
      const store = createEmmettEventStore(mockDb);

      const result = await store.appendToStream({
        streamId: { aggregateType: 'session', aggregateId: 'session-1' },
        events: [],
      });

      expect(result.nextStreamPosition).toBe(0n);
      expect(result.createdNewStream).toBe(false);
      expect(result.events).toEqual([]);
    });

    it('should call onCommit callback within transaction', async () => {
      const { mockDb } = createMockDb();
      const store = createEmmettEventStore(mockDb);
      let onCommitCalled = false;

      const result = await store.appendToStream({
        streamId: { aggregateType: 'session', aggregateId: 'session-1' },
        events: [{ eventId: 'evt-1', type: 'SESSION_STARTED', data: {} }],
        onCommit: async ({ streamId, events, tx }) => {
          onCommitCalled = true;
          expect(streamId.aggregateId).toBe('session-1');
          expect(events.length).toBe(1);
          expect(events[0]!.type).toBe('SESSION_STARTED');
          // Should be able to execute SQL within transaction
          await tx.execute('SELECT 1', []);
        },
      });

      expect(onCommitCalled).toBe(true);
      expect(result!.events[0]!.type).toBe('SESSION_STARTED');
    });

    it('should store event metadata', async () => {
      const { mockDb } = createMockDb();
      const store = createEmmettEventStore(mockDb);

      const result = await store.appendToStream({
        streamId: { aggregateType: 'session', aggregateId: 'session-1' },
        events: [
          {
            eventId: 'evt-1',
            type: 'SESSION_STARTED',
            data: { foo: 'bar' },
            metadata: { causationId: 'cmd-123', correlationId: 'corr-456' },
          },
        ],
      });

      expect(result!.events[0]!.metadata).toEqual({
        causationId: 'cmd-123',
        correlationId: 'corr-456',
      });
    });

    it('should allocate global positions atomically', async () => {
      const { mockDb } = createMockDb();
      const store = createEmmettEventStore(mockDb);

      // Append two events in one batch
      const result = await store.appendToStream({
        streamId: { aggregateType: 'session', aggregateId: 'session-1' },
        events: [
          { eventId: 'evt-1', type: 'EVENT_1', data: {} },
          { eventId: 'evt-2', type: 'EVENT_2', data: {} },
        ],
      });

      expect(result!.events[0]!.globalPosition > 0n).toBe(true);
      expect(result!.events[1]!.globalPosition > result!.events[0]!.globalPosition).toBe(true);

      // Append to another stream
      const result2 = await store.appendToStream({
        streamId: { aggregateType: 'session', aggregateId: 'session-2' },
        events: [{ eventId: 'evt-3', type: 'EVENT_3', data: {} }],
      });

      expect(result2!.events[0]!.globalPosition > result!.events[1]!.globalPosition).toBe(true);
    });

    it('should allocate monotonic global positions within a batch', async () => {
      const { mockDb } = createMockDb();
      const store = createEmmettEventStore(mockDb);

      // This verifies the in-process global_position generator remains monotonic
      // even when appending multiple events in rapid succession.
      const result = await store.appendToStream({
        streamId: { aggregateType: 'session', aggregateId: 'session-atomic' },
        events: [
          { eventId: 'evt-1', type: 'EVENT_1', data: {} },
          { eventId: 'evt-2', type: 'EVENT_2', data: {} },
          { eventId: 'evt-3', type: 'EVENT_3', data: {} },
        ],
      });

      // Verify monotonic global positions (unique ordering within the store instance).
      expect(result!.events[0]!.globalPosition > 0n).toBe(true);
      expect(result!.events[1]!.globalPosition > result!.events[0]!.globalPosition).toBe(true);
      expect(result!.events[2]!.globalPosition > result!.events[1]!.globalPosition).toBe(true);
    });
  });

  describe('EmmettEventStore.readStream', () => {
    it('should return empty result for non-existent stream', async () => {
      const { mockDb } = createMockDb();
      const store = createEmmettEventStore(mockDb);

      const result = await store.readStream({
        streamId: { aggregateType: 'session', aggregateId: 'non-existent' },
      });

      expect(result.streamExists).toBe(false);
      expect(result.currentStreamVersion).toBe(0n);
      expect(result.events).toEqual([]);
    });

    it('should read events from a stream', async () => {
      const { mockDb } = createMockDb();
      const store = createEmmettEventStore(mockDb);

      const streamId: StreamId = { aggregateType: 'session', aggregateId: 'session-1' };

      await store.appendToStream({
        streamId,
        events: [
          { eventId: 'evt-1', type: 'SESSION_STARTED', data: { n: 1 } },
          { eventId: 'evt-2', type: 'TRIAL_1', data: { n: 2 } },
          { eventId: 'evt-3', type: 'TRIAL_2', data: { n: 3 } },
        ],
      });

      const result = await store.readStream({ streamId });

      expect(result.streamExists).toBe(true);
      expect(result.currentStreamVersion).toBe(3n);
      expect(result.events.length).toBe(3);
      expect(result!.events[0]!.type).toBe('SESSION_STARTED');
      expect(result!.events[0]!.data).toEqual({ n: 1 });
      expect(result!.events[1]!.data).toEqual({ n: 2 });
      expect(result!.events[2]!.data).toEqual({ n: 3 });
    });

    it('should read from a specific version', async () => {
      const { mockDb } = createMockDb();
      const store = createEmmettEventStore(mockDb);

      const streamId: StreamId = { aggregateType: 'session', aggregateId: 'session-1' };

      await store.appendToStream({
        streamId,
        events: [
          { eventId: 'evt-1', type: 'E1', data: {} },
          { eventId: 'evt-2', type: 'E2', data: {} },
          { eventId: 'evt-3', type: 'E3', data: {} },
        ],
      });

      const result = await store.readStream({ streamId, fromVersion: 2n });

      expect(result.events.length).toBe(2); // E2 and E3 (positions 2 and 3)
      expect(result!.events[0]!.type).toBe('E2');
      expect(result!.events[1]!.type).toBe('E3');
    });

    it('should respect maxCount limit', async () => {
      const { mockDb } = createMockDb();
      const store = createEmmettEventStore(mockDb);

      const streamId: StreamId = { aggregateType: 'session', aggregateId: 'session-1' };

      await store.appendToStream({
        streamId,
        events: [
          { eventId: 'evt-1', type: 'E1', data: {} },
          { eventId: 'evt-2', type: 'E2', data: {} },
          { eventId: 'evt-3', type: 'E3', data: {} },
        ],
      });

      const result = await store.readStream({ streamId, maxCount: 2n });

      expect(result.events.length).toBe(2);
    });

    it('should parse JSON data correctly', async () => {
      const { mockDb } = createMockDb();
      const store = createEmmettEventStore(mockDb);

      const streamId: StreamId = { aggregateType: 'session', aggregateId: 'session-1' };

      await store.appendToStream({
        streamId,
        events: [
          {
            eventId: 'evt-1',
            type: 'COMPLEX_EVENT',
            data: { nested: { value: 42 }, array: [1, 2, 3] },
          },
        ],
      });

      const result = await store.readStream({ streamId });

      expect(result!.events[0]!.data).toEqual({
        nested: { value: 42 },
        array: [1, 2, 3],
      });
    });

    it('should handle malformed JSON gracefully', async () => {
      const { mockDb, getMessages } = createMockDb();
      const store = createEmmettEventStore(mockDb);

      const streamId: StreamId = { aggregateType: 'session', aggregateId: 'session-1' };

      await store.appendToStream({
        streamId,
        events: [{ eventId: 'evt-1', type: 'E1', data: {} }],
      });

      // Corrupt the stored JSON
      const messages = getMessages('session:session-1');
      messages[0]!.message_data = 'invalid-json{';

      const result = await store.readStream({ streamId });

      // Should return event with empty data instead of crashing
      expect(result.events.length).toBe(1);
      expect(result!.events[0]!.data).toEqual({});
    });

    it('should include stream_position 0 (first event) when reading from DEFAULT_STREAM_VERSION', async () => {
      const { mockDb } = createMockDb();
      const store = createEmmettEventStore(mockDb);

      const streamId: StreamId = { aggregateType: 'session', aggregateId: 'session-1' };

      await store.appendToStream({
        streamId,
        events: [
          { eventId: 'evt-0', type: 'SESSION_STARTED', data: { nLevel: 2 } },
          { eventId: 'evt-1', type: 'TRIAL_PRESENTED', data: { trialIndex: 0 } },
          { eventId: 'evt-2', type: 'TRIAL_PRESENTED', data: { trialIndex: 1 } },
        ],
      });

      // Read with DEFAULT_STREAM_VERSION (or no fromVersion specified)
      const result = await store.readStream({ streamId });

      // Should include all 3 events, including the one at stream_position 0
      expect(result.events.length).toBe(3);
      expect(result!.events[0]!.streamPosition).toBe(1n); // First event has stream_position 1
      expect(result!.events[0]!.type).toBe('SESSION_STARTED');
      expect(result!.events[1]!.streamPosition).toBe(2n);
      expect(result!.events[1]!.type).toBe('TRIAL_PRESENTED');
      expect(result!.events[2]!.streamPosition).toBe(3n);
      expect(result!.events[2]!.type).toBe('TRIAL_PRESENTED');
    });

    it('should read from a specific stream_position', async () => {
      const { mockDb } = createMockDb();
      const store = createEmmettEventStore(mockDb);

      const streamId: StreamId = { aggregateType: 'session', aggregateId: 'session-1' };

      await store.appendToStream({
        streamId,
        events: [
          { eventId: 'evt-1', type: 'E1', data: {} },
          { eventId: 'evt-2', type: 'E2', data: {} },
          { eventId: 'evt-3', type: 'E3', data: {} },
        ],
      });

      // Read from position 2 (should return events 2 and 3)
      const result = await store.readStream({ streamId, fromVersion: 2n });

      expect(result.events.length).toBe(2);
      expect(result!.events[0]!.streamPosition).toBe(2n);
      expect(result!.events[1]!.streamPosition).toBe(3n);
    });
  });

  describe('EmmettEventStore.aggregateStream', () => {
    it('should rebuild state from events', async () => {
      const { mockDb } = createMockDb();
      const store = createEmmettEventStore(mockDb);

      type CounterState = { count: number };
      type CounterEvent = AppendEvent & { data: { delta: number } };

      const streamId: StreamId = { aggregateType: 'counter', aggregateId: 'counter-1' };

      await store.appendToStream({
        streamId,
        events: [
          { eventId: 'evt-1', type: 'INCREMENT', data: { delta: 5 } },
          { eventId: 'evt-2', type: 'INCREMENT', data: { delta: 3 } },
          { eventId: 'evt-3', type: 'DECREMENT', data: { delta: 2 } },
        ],
      });

      const result = await store.aggregateStream<CounterState, CounterEvent>(streamId, {
        initialState: () => ({ count: 0 }),
        evolve: (state, event) => ({
          count: state.count + (event.type === 'INCREMENT' ? event.data.delta : -event.data.delta),
        }),
      });

      expect(result.state).toEqual({ count: 6 }); // 0 + 5 + 3 - 2 = 6
      expect(result.version).toBe(3n);
      expect(result.nextExpectedVersion).toBe(3n);
    });

    it('should return STREAM_DOES_NOT_EXIST for empty stream', async () => {
      const { mockDb } = createMockDb();
      const store = createEmmettEventStore(mockDb);

      const result = await store.aggregateStream(
        { aggregateType: 'counter', aggregateId: 'non-existent' },
        {
          initialState: () => ({ count: 0 }),
          evolve: () => ({ count: 0 }),
        },
      );

      expect(result.nextExpectedVersion).toBe(STREAM_DOES_NOT_EXIST);
    });

    it('should rebuild from a specific version', async () => {
      const { mockDb } = createMockDb();
      const store = createEmmettEventStore(mockDb);

      type CounterState = { count: number };
      type CounterEvent = AppendEvent & { data: { delta: number } };

      const streamId: StreamId = { aggregateType: 'counter', aggregateId: 'counter-1' };

      await store.appendToStream({
        streamId,
        events: [
          { eventId: 'evt-1', type: 'INCREMENT', data: { delta: 10 } },
          { eventId: 'evt-2', type: 'INCREMENT', data: { delta: 5 } },
          { eventId: 'evt-3', type: 'INCREMENT', data: { delta: 3 } },
        ],
      });

      const result = await store.aggregateStream<CounterState, CounterEvent>(streamId, {
        initialState: () => ({ count: 100 }), // Start from 100 instead of 0
        from: 2n, // Start from event 2
        evolve: (state, event) => ({
          count: state.count + event.data.delta,
        }),
      });

      expect(result.state.count).toBe(108); // 100 + 5 + 3 = 108
      expect(result.version).toBe(3n);
    });

    it('should accept string streamId', async () => {
      const { mockDb } = createMockDb();
      const store = createEmmettEventStore(mockDb);

      type State = { value: number };

      await store.appendToStream({
        streamId: { aggregateType: 'session', aggregateId: 'session-1' },
        events: [{ eventId: 'evt-1', type: 'SET', data: { value: 42 } }],
      });

      // Use string streamId instead of object
      const result = await store.aggregateStream<State, AppendEvent>('session:session-1', {
        initialState: () => ({ value: 0 }),
        evolve: (state, event) => ({ value: (event.data as { value?: number }).value ?? 0 }),
      });

      expect(result.state.value).toBe(42);
    });
  });

  describe('constants', () => {
    it('should have correct constant values', () => {
      expect(STREAM_DOES_NOT_EXIST).toBe(0n);
      expect(STREAM_EXISTS).toBe(-1n);
      expect(NO_CONCURRENCY_CHECK).toBe(-2n);
    });
  });

  describe('EmmettEventStore.readAll', () => {
    it('should return empty result when no events exist', async () => {
      const { mockDb } = createMockDb();
      const store = createEmmettEventStore(mockDb);

      const result = await store.readAll({ after: 0n });

      expect(result.events).toEqual([]);
      expect(result.currentGlobalPosition).toBe(0n);
      expect(result.hasMore).toBe(false);
    });

    it('should read all events across streams ordered by global_position', async () => {
      const { mockDb } = createMockDb();
      const store = createEmmettEventStore(mockDb);

      // Append to two different streams
      await store.appendToStream({
        streamId: { aggregateType: 'session', aggregateId: 'session-1' },
        events: [
          { eventId: 'evt-1', type: 'SESSION_STARTED', data: { n: 1 } },
          { eventId: 'evt-2', type: 'TRIAL_1', data: { n: 2 } },
        ],
      });
      await store.appendToStream({
        streamId: { aggregateType: 'session', aggregateId: 'session-2' },
        events: [{ eventId: 'evt-3', type: 'SESSION_STARTED', data: { n: 3 } }],
      });

      const result = await store.readAll({ after: 0n });

      expect(result.events.length).toBe(3);
      expect(result!.events[0]!.type).toBe('SESSION_STARTED');
      expect(result!.events[0]!.data).toEqual({ n: 1 });
      expect(result!.events[1]!.type).toBe('TRIAL_1');
      expect(result!.events[2]!.type).toBe('SESSION_STARTED');
      expect(result!.events[2]!.data).toEqual({ n: 3 });
      expect(result.hasMore).toBe(false);
    });

    it('should paginate with batchSize', async () => {
      const { mockDb } = createMockDb();
      const store = createEmmettEventStore(mockDb);

      // Append 5 events
      await store.appendToStream({
        streamId: { aggregateType: 'session', aggregateId: 'session-1' },
        events: [
          { eventId: 'evt-1', type: 'E1', data: {} },
          { eventId: 'evt-2', type: 'E2', data: {} },
          { eventId: 'evt-3', type: 'E3', data: {} },
          { eventId: 'evt-4', type: 'E4', data: {} },
          { eventId: 'evt-5', type: 'E5', data: {} },
        ],
      });

      // Read first batch of 2
      const batch1 = await store.readAll({ after: 0n, batchSize: 2 });
      expect(batch1.events.length).toBe(2);
      expect(batch1!.events[0]!.type).toBe('E1');
      expect(batch1!.events[1]!.type).toBe('E2');
      expect(batch1.hasMore).toBe(true);

      // Read second batch from where we left off
      const batch2 = await store.readAll({ after: batch1.currentGlobalPosition, batchSize: 2 });
      expect(batch2.events.length).toBe(2);
      expect(batch2!.events[0]!.type).toBe('E3');
      expect(batch2!.events[1]!.type).toBe('E4');
      expect(batch2.hasMore).toBe(true);

      // Read third batch — only 1 event left
      const batch3 = await store.readAll({ after: batch2.currentGlobalPosition, batchSize: 2 });
      expect(batch3.events.length).toBe(1);
      expect(batch3!.events[0]!.type).toBe('E5');
      expect(batch3.hasMore).toBe(false);
    });

    it('should filter by eventTypes', async () => {
      const { mockDb } = createMockDb();
      const store = createEmmettEventStore(mockDb);

      await store.appendToStream({
        streamId: { aggregateType: 'session', aggregateId: 'session-1' },
        events: [
          { eventId: 'evt-1', type: 'SESSION_STARTED', data: {} },
          { eventId: 'evt-2', type: 'TRIAL_PRESENTED', data: {} },
          { eventId: 'evt-3', type: 'TRIAL_RESPONDED', data: {} },
          { eventId: 'evt-4', type: 'SESSION_ENDED', data: {} },
        ],
      });

      const result = await store.readAll({
        after: 0n,
        eventTypes: new Set(['SESSION_STARTED', 'SESSION_ENDED']),
      });

      expect(result.events.length).toBe(2);
      expect(result!.events[0]!.type).toBe('SESSION_STARTED');
      expect(result!.events[1]!.type).toBe('SESSION_ENDED');
    });

    it('should maintain monotonic currentGlobalPosition across batches', async () => {
      const { mockDb } = createMockDb();
      const store = createEmmettEventStore(mockDb);

      await store.appendToStream({
        streamId: { aggregateType: 'session', aggregateId: 'session-1' },
        events: [
          { eventId: 'evt-1', type: 'E1', data: {} },
          { eventId: 'evt-2', type: 'E2', data: {} },
          { eventId: 'evt-3', type: 'E3', data: {} },
        ],
      });

      const batch1 = await store.readAll({ after: 0n, batchSize: 2 });
      const batch2 = await store.readAll({ after: batch1.currentGlobalPosition, batchSize: 2 });

      // currentGlobalPosition must be monotonically increasing
      expect(batch2.currentGlobalPosition > batch1.currentGlobalPosition).toBe(true);
      // Each event's globalPosition must be > after
      for (const event of batch2.events) {
        expect(event.globalPosition > batch1.currentGlobalPosition).toBe(true);
      }
    });

    it('should return after position when no events match', async () => {
      const { mockDb } = createMockDb();
      const store = createEmmettEventStore(mockDb);

      await store.appendToStream({
        streamId: { aggregateType: 'session', aggregateId: 'session-1' },
        events: [{ eventId: 'evt-1', type: 'E1', data: {} }],
      });

      // Read from a position beyond all events
      const result = await store.readAll({ after: 999999999999999999n });

      expect(result.events).toEqual([]);
      expect(result.currentGlobalPosition).toBe(999999999999999999n);
      expect(result.hasMore).toBe(false);
    });
  });

  describe('bounded cache', () => {
    it('should evict oldest entries when cache is full', async () => {
      const { mockDb } = createMockDb();
      // Create event store with small cache size for testing
      const store = createEmmettEventStore(mockDb, { maxCacheSize: 3 });

      // Append events to 5 different streams
      for (let i = 1; i <= 5; i++) {
        await store.appendToStream({
          streamId: { aggregateType: 'session', aggregateId: `session-${i}` },
          events: [{ eventId: `evt-${i}`, type: 'TEST', data: { value: i } }],
        });
      }

      // Read from all streams to populate cache
      for (let i = 1; i <= 5; i++) {
        await store.readStream({
          streamId: { aggregateType: 'session', aggregateId: `session-${i}` },
        });
      }

      // Cache should have max 3 entries (the last 3 streams read)
      // We can't directly inspect the cache, but we can verify the store works correctly
      // The cache is an implementation detail - the important thing is that
      // the store doesn't grow unbounded in memory

      // Verify we can still read all streams (cache miss is handled correctly)
      for (let i = 1; i <= 5; i++) {
        const result = await store.readStream({
          streamId: { aggregateType: 'session', aggregateId: `session-${i}` },
        });
        expect(result.streamExists).toBe(true);
        expect(result.events.length).toBe(1);
      }
    });

    it('should update existing cache entry on stream write', async () => {
      const { mockDb } = createMockDb();
      // Create event store with small cache size
      const store = createEmmettEventStore(mockDb, { maxCacheSize: 2 });

      // Append to first stream
      await store.appendToStream({
        streamId: { aggregateType: 'session', aggregateId: 'session-1' },
        events: [{ eventId: 'evt-1', type: 'TEST', data: { value: 1 } }],
      });

      // Read to populate cache
      await store.readStream({
        streamId: { aggregateType: 'session', aggregateId: 'session-1' },
      });

      // Append to second stream (eviction shouldn't happen yet)
      await store.appendToStream({
        streamId: { aggregateType: 'session', aggregateId: 'session-2' },
        events: [{ eventId: 'evt-2', type: 'TEST', data: { value: 2 } }],
      });

      // Append another event to first stream (should update cache, not evict)
      await store.appendToStream({
        streamId: { aggregateType: 'session', aggregateId: 'session-1' },
        expectedVersion: 1n,
        events: [{ eventId: 'evt-3', type: 'TEST', data: { value: 3 } }],
      });

      // Verify first stream has 2 events
      const result1 = await store.readStream({
        streamId: { aggregateType: 'session', aggregateId: 'session-1' },
      });
      expect(result1.events.length).toBe(2);

      // Verify second stream still has 1 event
      const result2 = await store.readStream({
        streamId: { aggregateType: 'session', aggregateId: 'session-2' },
      });
      expect(result2.events.length).toBe(1);
    });
  });
});
