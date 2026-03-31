import { describe, expect, it } from 'bun:test';
import type { AbstractPowerSyncDatabase } from '@powersync/web';
import { createCommandBus } from './command-bus';

type ProcessedCommandRow = {
  command_id: string;
  aggregate_id: string;
  aggregate_type: string;
  processed_at: string;
  from_stream_position: string;
  to_stream_position: string;
};

type StreamRow = {
  id: string;
  stream_id: string;
  stream_position: string;
  partition: string;
  stream_type: string | null;
  stream_metadata: string | null;
  is_archived: number;
};

type MessageRow = {
  id: string;
  stream_id: string;
  stream_position: string;
  partition: string;
  message_kind: string;
  message_type: string;
  message_data: string;
  message_metadata: string;
  is_archived: number;
  global_position: string;
  created: string;
};

function createMockDb(): AbstractPowerSyncDatabase {
  const syncMeta = new Map<string, string>();
  const streams = new Map<string, StreamRow>();
  const messagesByStream = new Map<string, MessageRow[]>();
  const processedCommands = new Map<string, ProcessedCommandRow>();

  const execute = async (sql: string, params: (string | number)[] = []) => {
    const normalized = sql.trim().toUpperCase();

    if (normalized.startsWith('SELECT')) {
      if (sql.includes('FROM sync_meta')) {
        const id = String(params[0] ?? '');
        const value = syncMeta.get(id);
        return { rows: value ? [{ value }] : null, rowsAffected: 0 };
      }

      if (sql.includes('FROM processed_commands')) {
        const commandId = String(params[0] ?? '');
        const row = processedCommands.get(commandId);
        return { rows: row ? [row] : null, rowsAffected: 0 };
      }

      if (sql.includes('FROM emt_streams')) {
        const streamId = String(params[0] ?? '');
        const partition = String(params[1] ?? '');
        const row = Array.from(streams.values()).find(
          (s) => s.stream_id === streamId && s.partition === partition && s.is_archived === 0,
        );
        return { rows: row ? [{ stream_position: row.stream_position }] : null, rowsAffected: 0 };
      }

      if (
        sql.includes('MAX(CAST(stream_position AS INTEGER))') &&
        sql.includes('FROM emt_messages')
      ) {
        const streamId = String(params[0] ?? '');
        const partition = String(params[1] ?? '');
        const messageKind = String(params[2] ?? '');
        const streamMessages = messagesByStream.get(streamId) ?? [];
        let max = 0n;
        for (const row of streamMessages) {
          if (row.partition !== partition) continue;
          if (row.message_kind !== messageKind) continue;
          if (row.is_archived !== 0) continue;
          try {
            const pos = BigInt(row.stream_position);
            if (pos > max) max = pos;
          } catch {
            // ignore
          }
        }
        return { rows: [{ max_pos: max > 0n ? String(max) : null }], rowsAffected: 0 };
      }

      if (
        sql.includes('FROM emt_messages') &&
        sql.includes('ORDER BY CAST(stream_position AS INTEGER)')
      ) {
        const streamId = String(params[0] ?? '');
        const partition = String(params[1] ?? '');
        const messageKind = String(params[2] ?? '');
        const fromPositionRaw = params[3] ?? '0';
        const fromPosition = BigInt(String(fromPositionRaw));

        const streamMessages = messagesByStream.get(streamId) ?? [];
        const filtered = streamMessages.filter((row) => {
          if (row.partition !== partition) return false;
          if (row.message_kind !== messageKind) return false;
          if (row.is_archived !== 0) return false;
          try {
            return BigInt(row.stream_position) >= fromPosition;
          } catch {
            return false;
          }
        });

        filtered.sort((a, b) => {
          const aa = BigInt(a.stream_position);
          const bb = BigInt(b.stream_position);
          return aa === bb ? 0 : aa < bb ? -1 : 1;
        });

        let limited = filtered;
        if (sql.includes('LIMIT') && params.length >= 5) {
          const rawLimit = params[4];
          const limit = Number(rawLimit);
          if (Number.isFinite(limit) && limit > 0) {
            limited = filtered.slice(0, limit);
          }
        }

        return {
          rows: limited.map((row) => ({
            global_position: row.global_position,
            stream_position: row.stream_position,
            message_type: row.message_type,
            message_data: row.message_data,
            message_metadata: row.message_metadata,
            created: row.created,
          })),
          rowsAffected: 0,
        };
      }

      return { rows: [], rowsAffected: 0 };
    }

    if (normalized.startsWith('DELETE')) {
      if (sql.includes('FROM sync_meta')) {
        const id = String(params[0] ?? '');
        syncMeta.delete(id);
        return { rowsAffected: 1 };
      }
      return { rowsAffected: 0 };
    }

    if (normalized.startsWith('INSERT')) {
      if (sql.includes('INTO sync_meta')) {
        const id = String(params[0] ?? '');
        const value = String(params[1] ?? '');
        syncMeta.set(id, value);
        return { rowsAffected: 1 };
      }

      if (sql.includes('INTO processed_commands')) {
        processedCommands.set(String(params[1] ?? ''), {
          command_id: String(params[1] ?? ''),
          aggregate_id: String(params[2] ?? ''),
          aggregate_type: String(params[3] ?? ''),
          processed_at: String(params[4] ?? ''),
          from_stream_position: String(params[5] ?? ''),
          to_stream_position: String(params[6] ?? ''),
        });
        return { rowsAffected: 1 };
      }

      if (sql.includes('INTO emt_messages')) {
        const row: MessageRow = {
          id: String(params[0] ?? ''),
          stream_id: String(params[1] ?? ''),
          stream_position: String(params[2] ?? ''),
          partition: String(params[3] ?? ''),
          message_kind: String(params[4] ?? ''),
          message_data: String(params[5] ?? ''),
          message_metadata: String(params[6] ?? ''),
          message_type: String(params[8] ?? ''),
          is_archived: 0,
          global_position: String(params[10] ?? ''),
          created: String(params[11] ?? ''),
        };
        const arr = messagesByStream.get(row.stream_id) ?? [];
        arr.push(row);
        messagesByStream.set(row.stream_id, arr);
        return { rowsAffected: 1 };
      }

      if (sql.includes('INTO emt_streams')) {
        const row: StreamRow = {
          id: String(params[0] ?? ''),
          stream_id: String(params[1] ?? ''),
          stream_position: String(params[2] ?? ''),
          partition: String(params[3] ?? ''),
          stream_type: (params[4] ?? null) as string | null,
          stream_metadata: (params[5] ?? null) as string | null,
          is_archived: 0,
        };
        if (!streams.has(row.id)) {
          streams.set(row.id, row);
          return { rowsAffected: 1 };
        }
        return { rowsAffected: 0 };
      }

      return { rowsAffected: 0 };
    }

    if (normalized.startsWith('UPDATE')) {
      if (sql.includes('UPDATE emt_streams')) {
        const newPos = String(params[0] ?? '');
        const id = String(params[1] ?? '');
        const prev = streams.get(id);
        if (!prev) return { rowsAffected: 0 };
        streams.set(id, { ...prev, stream_position: newPos });
        return { rowsAffected: 1 };
      }
      return { rowsAffected: 0 };
    }

    return { rowsAffected: 0 };
  };

  const getOptional = async <T>(
    sql: string,
    params: (string | number)[] = [],
  ): Promise<T | null> => {
    const result = await execute(sql, params);
    const rows = (result as { rows?: unknown }).rows as unknown;
    if (!rows) return null;
    if (Array.isArray(rows)) return (rows[0] as T) ?? null;
    const arr = (rows as { _array?: unknown[] })._array;
    return (arr?.[0] as T) ?? null;
  };

  const writeTransaction = async (
    callback: (tx: { execute: typeof execute }) => Promise<unknown>,
  ) => {
    return callback({ execute });
  };

  return { execute, getOptional, writeTransaction } as unknown as AbstractPowerSyncDatabase;
}

describe('command-bus idempotence cache', () => {
  it('should return the exact appended events when command is cached', async () => {
    const db = createMockDb();
    const bus = createCommandBus(db);

    await bus.handle({
      type: 'SESSION/START',
      data: {
        sessionId: 'session-123',
        expectedVersion: 0,
        event: { id: 'evt-1', type: 'SESSION_STARTED', timestamp: 1 },
      },
      metadata: { commandId: 'start:session-123', timestamp: new Date() },
    });

    const cmd = {
      type: 'SESSION/RECORD_TRIAL',
      data: {
        sessionId: 'session-123',
        expectedVersion: 1,
        event: { id: 'evt-2', type: 'TRIAL_1', timestamp: 2 },
      },
      metadata: { commandId: 'evt:evt-2', timestamp: new Date() },
    } as const;

    const result1 = await bus.handle(cmd);
    expect(result1.fromCache).toBe(false);
    expect(result1.events.map((e) => e.type)).toEqual(['TRIAL_1']);

    const result2 = await bus.handle(cmd);
    expect(result2.fromCache).toBe(true);
    expect(result2.events.map((e) => e.type)).toEqual(['TRIAL_1']);
  });
});
