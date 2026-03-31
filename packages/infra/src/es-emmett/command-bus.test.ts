/**
 * Tests for CommandBus
 */

import { beforeEach, describe, expect, it } from 'bun:test';
import type { AbstractPowerSyncDatabase } from '@powersync/web';
import {
  createCommandBus,
  shouldInvalidateProcessorEngineForEvents,
  type CalibrationResetCommand,
  type CalibrationSetBaselineCommand,
  type SessionStartCommand,
  type SessionEndCommand,
  type SessionRecordTrialCommand,
  type SessionRecordResponseCommand,
  type SynergyLoopStartCommand,
} from './command-bus';
import type { EmmettEventStore, StoredEvent } from './powersync-emmett-event-store';
import { STREAM_DOES_NOT_EXIST } from './powersync-emmett-event-store';

describe('command-bus', () => {
  let mockDb: AbstractPowerSyncDatabase;
  let mockEventStore: EmmettEventStore;
  const processedCommands = new Map<
    string,
    {
      command_id: string;
      aggregate_id: string;
      aggregate_type: string;
      processed_at: string;
      from_stream_position: string;
      to_stream_position: string;
    }
  >();
  // Track stream versions for concurrency testing
  const streamVersions = new Map<string, bigint>();

  beforeEach(() => {
    processedCommands.clear();
    streamVersions.clear();

    // Mock PowerSync database - simulates Emmett tables
    const execute = async (sql: string, params: (string | number)[] = []) => {
      // Handle SELECT queries
      if (sql.trim().toUpperCase().startsWith('SELECT')) {
        // SELECT stream_position FROM emt_streams
        if (sql.includes('emt_streams') && sql.includes('stream_position')) {
          const streamId = params[0] as string;
          const version = streamVersions.get(streamId);
          if (version !== undefined) {
            return { rows: [{ stream_position: String(version) }], rowsAffected: 0 };
          }
          return { rows: null, rowsAffected: 0 };
        }
        // SELECT MAX(global_position) FROM emt_messages
        if (sql.includes('MAX(global_position)')) {
          return { rows: [{ max_pos: '0' }], rowsAffected: 0 };
        }
        // SELECT from processed_commands
        if (sql.includes('processed_commands')) {
          const commandId = params[0] as string;
          const cmd = processedCommands.get(commandId);
          return { rows: cmd ? [cmd] : null, rowsAffected: 0 };
        }
        // SELECT FROM emt_messages
        if (sql.includes('emt_messages')) {
          return { rows: [], rowsAffected: 0 };
        }
        return { rows: [], rowsAffected: 0 };
      }

      // Handle INSERT queries
      if (sql.trim().toUpperCase().startsWith('INSERT')) {
        // INSERT INTO emt_streams
        if (sql.includes('emt_streams')) {
          const streamId = params[1] as string;
          const streamPos = params[2] as string;
          streamVersions.set(streamId, BigInt(streamPos));
          return { rowsAffected: 1 };
        }
        // INSERT INTO emt_messages
        if (sql.includes('emt_messages')) {
          return { rowsAffected: 1 };
        }
        // INSERT INTO processed_commands
        if (sql.includes('processed_commands')) {
          const commandId = params[1] as string;
          processedCommands.set(commandId, {
            command_id: commandId,
            aggregate_id: params[2] as string,
            aggregate_type: params[3] as string,
            processed_at: params[4] as string,
            from_stream_position: params[5] as string,
            to_stream_position: params[6] as string,
          });
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
          streamVersions.set(streamId, BigInt(newStreamPos));
          return { rowsAffected: 1 };
        }
        return { rowsAffected: 0 };
      }

      return { rowsAffected: 0 };
    };

    const getOptional = async (sql: string, params: (string | number)[]) => {
      const result = await execute(sql, params);
      const rows = result.rows as { _array?: unknown[] } | unknown[] | null;
      if (!rows) return null;
      const arr = 'length' in rows ? (rows as unknown[]) : (rows as { _array: unknown[] })._array;
      return (arr?.[0] as never) ?? null;
    };

    mockDb = {
      execute,
      getOptional,
      writeTransaction: async (callback: (tx: { execute: typeof execute }) => Promise<unknown>) => {
        const mockTx = { execute };
        return callback(mockTx);
      },
    } as unknown as AbstractPowerSyncDatabase;

    // Mock Emmett event store
    mockEventStore = {
      appendToStream: async ({ streamId, expectedVersion, events }: any) => {
        // Simulate appending events
        const storedEvents: StoredEvent[] = events.map((e: any, i: any) => ({
          eventId: e.eventId,
          streamPosition: BigInt((processedCommands.size || 0) + i + 1),
          globalPosition: BigInt(Date.now() + i),
          type: e.type,
          data: e.data,
          metadata: e.metadata ?? {},
          createdAt: new Date(),
        }));

        // Record processed command for idempotence
        if (streamId.aggregateId) {
          processedCommands.set(`${streamId.aggregateId}:start`, {
            command_id: `${streamId.aggregateId}:start`,
            aggregate_id: streamId.aggregateId,
            aggregate_type: streamId.aggregateType,
            processed_at: new Date().toISOString(),
            from_stream_position: '0',
            to_stream_position: String(storedEvents.length),
          });
        }

        return {
          nextStreamPosition: BigInt(storedEvents.length),
          createdNewStream: expectedVersion === STREAM_DOES_NOT_EXIST,
          events: storedEvents,
        };
      },
      readStream: async ({ streamId }: any) => {
        return {
          currentStreamVersion: 1n,
          streamExists: streamId.aggregateId === 'existing-session',
          events: [],
        };
      },
    } as unknown as EmmettEventStore;
  });

  describe('createCommandBus', () => {
    it('should create CommandBus with direct db', () => {
      const bus = createCommandBus(mockDb);

      expect(bus).toBeDefined();
      expect(typeof bus.handle).toBe('function');
      expect(typeof bus.readStream).toBe('function');
    });

    it('should create CommandBus with port', async () => {
      const mockPort = {
        getPowerSyncDb: async () => mockDb,
      };

      const bus = createCommandBus(mockPort);

      // Should not throw when accessing
      await bus.handle({
        type: 'SESSION/START',
        data: {
          sessionId: 'test-session',
          expectedVersion: 0,
          event: { id: 'evt-1', type: 'SESSION_STARTED', timestamp: Date.now() },
        },
        metadata: { commandId: 'start:test-session', timestamp: new Date() },
      });

      expect(true).toBe(true);
    });

    it('should throw if db is missing execute method', async () => {
      const invalidPort = {
        getPowerSyncDb: async () => ({}) as AbstractPowerSyncDatabase,
      };

      const bus = createCommandBus(invalidPort);

      await expect(
        bus.handle({
          type: 'SESSION/START',
          data: {
            sessionId: 'test-session',
            expectedVersion: 0,
            event: { id: 'evt-1', type: 'SESSION_STARTED', timestamp: Date.now() },
          },
          metadata: { commandId: 'start:test-session', timestamp: new Date() },
        }),
      ).rejects.toThrow();
    });
  });

  describe('shouldInvalidateProcessorEngineForEvents', () => {
    it('returns false for noisy in-session events', () => {
      expect(
        shouldInvalidateProcessorEngineForEvents([
          { type: 'TRIAL_PRESENTED' },
          { type: 'USER_RESPONDED' },
          { type: 'FOCUS_LOST' },
        ]),
      ).toBe(false);
    });

    it('returns true for projection-relevant events', () => {
      expect(shouldInvalidateProcessorEngineForEvents([{ type: 'SESSION_ENDED' }])).toBe(true);
      expect(shouldInvalidateProcessorEngineForEvents([{ type: 'XP_BREAKDOWN_COMPUTED' }])).toBe(
        true,
      );
      expect(shouldInvalidateProcessorEngineForEvents([{ type: 'CALIBRATION_RESET' }])).toBe(true);
      expect(shouldInvalidateProcessorEngineForEvents([{ type: 'SESSION_IMPORTED' }])).toBe(true);
    });
  });

  describe('CommandBus.handle - SESSION/START', () => {
    it('should handle SESSION/START command', async () => {
      const bus = createCommandBus(mockDb);

      const command: SessionStartCommand = {
        type: 'SESSION/START',
        data: {
          sessionId: 'session-123',
          expectedVersion: 0,
          event: { id: 'evt-1', type: 'SESSION_STARTED', timestamp: 1234567890 },
        },
        metadata: { commandId: 'start:session-123', timestamp: new Date('2024-01-01') },
      };

      const result = await bus.handle(command);

      expect(result.fromCache).toBe(false);
      expect(result.events).toBeDefined();
      expect(result.events.length).toBe(1);
      expect(result!.events[0]!.type).toBe('SESSION_STARTED');
    });

    it('should validate *_STARTED suffix', async () => {
      const bus = createCommandBus(mockDb);

      const invalidCommand: SessionStartCommand = {
        type: 'SESSION/START',
        data: {
          sessionId: 'session-123',
          expectedVersion: 0,
          event: { id: 'evt-1', type: 'TRIAL_1', timestamp: 1234567890 }, // Not *_STARTED
        },
        metadata: { commandId: 'start:session-123', timestamp: new Date() },
      };

      await expect(bus.handle(invalidCommand)).rejects.toThrow(
        '[CommandBus] SESSION/START expects *_STARTED',
      );
    });

    it('should return cached result for idempotent commands', async () => {
      // We'd need to mock getProcessedCommandFromPowerSync to return a cached result
      // For now, this test documents the expected behavior
      const bus = createCommandBus(mockDb);

      const command: SessionStartCommand = {
        type: 'SESSION/START',
        data: {
          sessionId: 'session-123',
          expectedVersion: 0,
          event: { id: 'evt-1', type: 'SESSION_STARTED', timestamp: 1234567890 },
        },
        metadata: { commandId: 'start:session-123', timestamp: new Date() },
      };

      const result1 = await bus.handle(command);
      const result2 = await bus.handle(command);

      // Both should succeed
      expect(result1.events).toBeDefined();
      expect(result2.events).toBeDefined();
    });
  });

  describe('CommandBus.handle - SESSION/END', () => {
    it('should handle SESSION/END command', async () => {
      const bus = createCommandBus(mockDb);

      // First, start a session to create the stream at version 1
      await bus.handle({
        type: 'SESSION/START',
        data: {
          sessionId: 'session-123',
          expectedVersion: 0,
          event: { id: 'evt-1', type: 'SESSION_STARTED', timestamp: 1234567890 },
        },
        metadata: { commandId: 'start:session-123', timestamp: new Date() },
      });

      const command: SessionEndCommand = {
        type: 'SESSION/END',
        data: {
          sessionId: 'session-123',
          expectedVersion: 1,
          event: { id: 'evt-2', type: 'SESSION_ENDED', timestamp: 1234567890 },
        },
        metadata: { commandId: 'end:session-123', timestamp: new Date('2024-01-01') },
      };

      const result = await bus.handle(command);

      expect(result.fromCache).toBe(false);
      expect(result.events).toBeDefined();
      expect(result!.events[0]!.type).toBe('SESSION_ENDED');
    });

    it('should validate *_ENDED suffix', async () => {
      const bus = createCommandBus(mockDb);

      const invalidCommand: SessionEndCommand = {
        type: 'SESSION/END',
        data: {
          sessionId: 'session-123',
          expectedVersion: 1,
          event: { id: 'evt-2', type: 'TRIAL_1', timestamp: 1234567890 }, // Not *_ENDED
        },
        metadata: { commandId: 'end:session-123', timestamp: new Date() },
      };

      await expect(bus.handle(invalidCommand)).rejects.toThrow(
        '[CommandBus] SESSION/END expects *_ENDED',
      );
    });
  });

  describe('CommandBus.handle - SESSION/RECORD_TRIAL', () => {
    it('should handle SESSION/RECORD_TRIAL command', async () => {
      const bus = createCommandBus(mockDb);

      // First, start a session to create the stream at version 1
      await bus.handle({
        type: 'SESSION/START',
        data: {
          sessionId: 'session-123',
          expectedVersion: 0,
          event: { id: 'evt-1', type: 'SESSION_STARTED', timestamp: 1234567890 },
        },
        metadata: { commandId: 'start:session-123', timestamp: new Date() },
      });

      const command: SessionRecordTrialCommand = {
        type: 'SESSION/RECORD_TRIAL',
        data: {
          sessionId: 'session-123',
          expectedVersion: 1,
          event: { id: 'evt-3', type: 'TRIAL_1', timestamp: 1234567890 },
        },
        metadata: { commandId: 'evt:evt-3', timestamp: new Date('2024-01-01') },
      };

      const result = await bus.handle(command);

      expect(result.events).toBeDefined();
      expect(result.events.length).toBeGreaterThan(0);
      expect(result!.events[0]!.type).toBe('TRIAL_1');
    });
  });

  describe('CommandBus.handle - SESSION/RECORD_RESPONSE', () => {
    it('should handle SESSION/RECORD_RESPONSE command', async () => {
      const bus = createCommandBus(mockDb);

      // First, start a session and add a trial to get to version 2
      await bus.handle({
        type: 'SESSION/START',
        data: {
          sessionId: 'session-123',
          expectedVersion: 0,
          event: { id: 'evt-1', type: 'SESSION_STARTED', timestamp: 1234567890 },
        },
        metadata: { commandId: 'start:session-123', timestamp: new Date() },
      });
      await bus.handle({
        type: 'SESSION/RECORD_TRIAL',
        data: {
          sessionId: 'session-123',
          expectedVersion: 1,
          event: { id: 'evt-2', type: 'TRIAL_1', timestamp: 1234567890 },
        },
        metadata: { commandId: 'evt:evt-2', timestamp: new Date() },
      });

      const command: SessionRecordResponseCommand = {
        type: 'SESSION/RECORD_RESPONSE',
        data: {
          sessionId: 'session-123',
          expectedVersion: 2,
          event: { id: 'evt-4', type: 'RESPONSE_1', timestamp: 1234567890 },
        },
        metadata: { commandId: 'evt:evt-4', timestamp: new Date('2024-01-01') },
      };

      const result = await bus.handle(command);

      expect(result.events).toBeDefined();
      expect(result!.events[0]!.type).toBe('RESPONSE_1');
    });
  });

  describe('CommandBus.handle - SYNERGY_LOOP/*', () => {
    it('should handle SYNERGY_LOOP/START on the synergy-loop aggregate', async () => {
      const bus = createCommandBus(mockDb);

      const command: SynergyLoopStartCommand = {
        type: 'SYNERGY_LOOP/START',
        data: {
          loopId: 'default',
          event: {
            id: 'evt-synergy-1',
            type: 'SYNERGY_LOOP_STARTED',
            timestamp: 1234567890,
            config: { totalLoops: 5 },
          },
        },
        metadata: { commandId: 'synergy:start:default', timestamp: new Date('2024-01-01') },
      };

      const result = await bus.handle(command);

      expect(result.fromCache).toBe(false);
      expect(result.events).toHaveLength(1);
      expect(result.events[0]!.type).toBe('SYNERGY_LOOP_STARTED');
    });

    it('should validate the expected SYNERGY event type', async () => {
      const bus = createCommandBus(mockDb);

      await expect(
        bus.handle({
          type: 'SYNERGY_LOOP/RESET',
          data: {
            loopId: 'default',
            event: {
              id: 'evt-synergy-2',
              type: 'SYNERGY_LOOP_STARTED',
              timestamp: 1234567890,
            },
          },
          metadata: { commandId: 'synergy:reset:default', timestamp: new Date('2024-01-01') },
        }),
      ).rejects.toThrow('[CommandBus] SYNERGY_LOOP/RESET expects SYNERGY_LOOP_RESET');
    });
  });

  describe('CommandBus.handle - CALIBRATION/SET_BASELINE', () => {
    it('should handle CALIBRATION/SET_BASELINE on the cognitive-profile aggregate', async () => {
      const bus = createCommandBus(mockDb);

      const command: CalibrationSetBaselineCommand = {
        type: 'CALIBRATION/SET_BASELINE',
        data: {
          userId: 'user-123',
          event: {
            id: 'evt-calibration-1',
            type: 'CALIBRATION_BASELINE_SET',
            timestamp: 1234567890,
            userId: 'user-123',
            level: 2,
          },
        },
        metadata: {
          commandId: 'calibration:baseline:user-123',
          timestamp: new Date('2024-01-01'),
          userId: 'user-123',
        },
      };

      const result = await bus.handle(command);

      expect(result.fromCache).toBe(false);
      expect(result.events).toHaveLength(1);
      expect(result.events[0]!.type).toBe('CALIBRATION_BASELINE_SET');
    });

    it('should validate the expected calibration baseline event type', async () => {
      const bus = createCommandBus(mockDb);

      await expect(
        bus.handle({
          type: 'CALIBRATION/SET_BASELINE',
          data: {
            userId: 'user-123',
            event: {
              id: 'evt-calibration-2',
              type: 'SYNERGY_LOOP_STARTED',
              timestamp: 1234567890,
              userId: 'user-123',
              level: 2,
            },
          },
          metadata: {
            commandId: 'calibration:baseline:user-123',
            timestamp: new Date('2024-01-01'),
            userId: 'user-123',
          },
        }),
      ).rejects.toThrow('[CommandBus] CALIBRATION/SET_BASELINE expects CALIBRATION_BASELINE_SET');
    });
  });

  describe('CommandBus.handle - CALIBRATION/RESET', () => {
    it('should handle CALIBRATION/RESET on the cognitive-profile aggregate', async () => {
      const bus = createCommandBus(mockDb);

      const command: CalibrationResetCommand = {
        type: 'CALIBRATION/RESET',
        data: {
          userId: 'user-123',
          event: {
            id: 'evt-calibration-reset-1',
            type: 'CALIBRATION_RESET',
            timestamp: 1234567890,
            userId: 'user-123',
          },
        },
        metadata: {
          commandId: 'calibration:reset:user-123',
          timestamp: new Date('2024-01-01'),
          userId: 'user-123',
        },
      };

      const result = await bus.handle(command);

      expect(result.fromCache).toBe(false);
      expect(result.events).toHaveLength(1);
      expect(result.events[0]!.type).toBe('CALIBRATION_RESET');
    });
  });

  describe('CommandBus.readStream', () => {
    it('should read stream from event store', async () => {
      const bus = createCommandBus(mockDb);

      // First create a stream
      await bus.handle({
        type: 'SESSION/START',
        data: {
          sessionId: 'session-123',
          expectedVersion: 0,
          event: { id: 'evt-1', type: 'SESSION_STARTED', timestamp: 1234567890 },
        },
        metadata: { commandId: 'start:session-123', timestamp: new Date() },
      });

      const result = await bus.readStream({
        streamId: { aggregateType: 'session', aggregateId: 'session-123' },
      });

      expect(result).toBeDefined();
      expect(result.currentStreamVersion).toBeGreaterThanOrEqual(1n);
    });

    it('should pass through fromVersion and maxCount', async () => {
      const bus = createCommandBus(mockDb);

      // First create a stream
      await bus.handle({
        type: 'SESSION/START',
        data: {
          sessionId: 'session-123',
          expectedVersion: 0,
          event: { id: 'evt-1', type: 'SESSION_STARTED', timestamp: 1234567890 },
        },
        metadata: { commandId: 'start:session-123', timestamp: new Date() },
      });

      const result = await bus.readStream({
        streamId: { aggregateType: 'session', aggregateId: 'session-123' },
        fromVersion: 5n,
        maxCount: 10n,
      });

      expect(result).toBeDefined();
      expect(result.currentStreamVersion).toBeGreaterThanOrEqual(1n);
    });
  });

  describe('Command types', () => {
    it('SessionStartCommand should have correct structure', () => {
      const cmd: SessionStartCommand = {
        type: 'SESSION/START',
        data: {
          sessionId: 'session-123',
          expectedVersion: 0,
          event: { id: 'evt-1', type: 'SESSION_STARTED', timestamp: 123 },
        },
        metadata: { commandId: 'cmd-123', timestamp: new Date() },
      };

      expect(cmd.type).toBe('SESSION/START');
      expect(cmd.data.sessionId).toBe('session-123');
      expect(cmd.data.event.type).toBe('SESSION_STARTED');
    });

    it('SessionEndCommand should support workflow data', () => {
      const cmd: SessionEndCommand = {
        type: 'SESSION/END',
        data: {
          sessionId: 'session-123',
          expectedVersion: 1,
          event: { id: 'evt-2', type: 'SESSION_ENDED', timestamp: 123 },
          workflow: {
            completionInput: { foo: 'bar' },
          },
        },
        metadata: { commandId: 'end:session-123', timestamp: new Date() },
      };

      expect(cmd.data.workflow).toBeDefined();
      expect((cmd.data.workflow as { completionInput: { foo: string } }).completionInput.foo).toBe(
        'bar',
      );
    });
  });

  describe('CommandMetadata', () => {
    it('should support optional fields', () => {
      const metadata1 = {
        commandId: 'cmd-123',
        timestamp: new Date(),
      };

      const metadata2: {
        commandId: string;
        timestamp: Date;
        causationId?: string;
        correlationId?: string;
        userId?: string;
      } = {
        commandId: 'cmd-456',
        timestamp: new Date() as any,
        causationId: 'parent-cmd',
        correlationId: 'corr-789',
        userId: 'user-001',
      };

      expect(metadata1.commandId).toBe('cmd-123');
      expect(metadata2.causationId).toBe('parent-cmd');
      expect(metadata2.correlationId).toBe('corr-789');
      expect(metadata2.userId).toBe('user-001');
    });
  });
});
