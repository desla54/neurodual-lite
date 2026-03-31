/**
 * Tests for Processed Commands (idempotence tracking)
 */

import { describe, expect, it } from 'bun:test';
import type { AbstractPowerSyncDatabase } from '@powersync/web';
import {
  getProcessedCommandFromPowerSync,
  putProcessedCommandToPowerSync,
  getProcessedCommand,
  putProcessedCommand,
  type ProcessedCommandRow,
} from './processed-commands';
import type { PersistencePort } from '@neurodual/logic';

describe('processed-commands', () => {
  describe('getProcessedCommandFromPowerSync', () => {
    it('should return null for non-existent command', async () => {
      const mockDb = {
        getOptional: async () => null,
      } as unknown as AbstractPowerSyncDatabase;

      const result = await getProcessedCommandFromPowerSync(mockDb, 'cmd-123');

      expect(result).toBeNull();
    });

    it('should return command row when found', async () => {
      const expectedRow: ProcessedCommandRow = {
        command_id: 'cmd-123',
        aggregate_id: 'session-abc',
        aggregate_type: 'session',
        processed_at: '2024-01-01T00:00:00.000Z',
        from_stream_position: '0',
        to_stream_position: '5',
      };

      const mockDb = {
        getOptional: async () => expectedRow,
      } as unknown as AbstractPowerSyncDatabase;

      const result = await getProcessedCommandFromPowerSync(mockDb, 'cmd-123');

      expect(result).toEqual(expectedRow);
    });
  });

  describe('putProcessedCommandToPowerSync', () => {
    it('should insert command record', async () => {
      let executedSql = '';
      let executedParams: (string | number)[] = [];

      const mockDb = {
        execute: async (sql: string, params: (string | number)[]) => {
          executedSql = sql;
          executedParams = params;
          return { rowsAffected: 1 };
        },
      } as unknown as AbstractPowerSyncDatabase;

      const row: ProcessedCommandRow = {
        command_id: 'cmd-123',
        aggregate_id: 'session-abc',
        aggregate_type: 'session',
        processed_at: '2024-01-01T00:00:00.000Z',
        from_stream_position: '0',
        to_stream_position: '5',
      };

      await putProcessedCommandToPowerSync(mockDb, row);

      expect(executedSql).toContain('INSERT INTO processed_commands');
      expect(executedParams[0]).toBe('cmd-123'); // id
      expect(executedParams[1]).toBe('cmd-123'); // command_id
      expect(executedParams[2]).toBe('session-abc'); // aggregate_id
      expect(executedParams[6]).toBe('5'); // to_stream_position
    });

    it('should default processed_at to current time', async () => {
      let capturedProcessedAt: string | undefined;

      const mockDb = {
        execute: async (_sql: string, params: (string | number)[]) => {
          capturedProcessedAt = params[4] as string;
          return { rowsAffected: 1 };
        },
      } as unknown as AbstractPowerSyncDatabase;

      const row: Omit<ProcessedCommandRow, 'processed_at'> = {
        command_id: 'cmd-123',
        aggregate_id: 'session-abc',
        aggregate_type: 'session',
        from_stream_position: '0',
        to_stream_position: '5',
      };

      await putProcessedCommandToPowerSync(mockDb, row);

      expect(capturedProcessedAt).toBeDefined();
      expect(capturedProcessedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO format
    });

    it('should convert positions to TEXT', async () => {
      let capturedFromPos: string | undefined;
      let capturedToPos: string | undefined;

      const mockDb = {
        execute: async (_sql: string, params: (string | number)[]) => {
          capturedFromPos = params[5] as string;
          capturedToPos = params[6] as string;
          return { rowsAffected: 1 };
        },
      } as unknown as AbstractPowerSyncDatabase;

      const row: Omit<ProcessedCommandRow, 'processed_at'> = {
        command_id: 'cmd-123',
        aggregate_id: 'session-abc',
        aggregate_type: 'session',
        // Pass bigint - should be converted to string
        from_stream_position: 123n as unknown as string,
        to_stream_position: 456n as unknown as string,
      };

      await putProcessedCommandToPowerSync(mockDb, row);

      expect(capturedFromPos).toBe('123');
      expect(capturedToPos).toBe('456');
    });
  });

  describe('getProcessedCommand (PersistencePort)', () => {
    it('should return null when no rows', async () => {
      const mockPersistence = {
        query: async () => ({ rows: [] }),
      } as unknown as PersistencePort;

      const result = await getProcessedCommand(mockPersistence, 'cmd-123');

      expect(result).toBeNull();
    });

    it('should return first row when multiple', async () => {
      const expectedRow: ProcessedCommandRow = {
        command_id: 'cmd-123',
        aggregate_id: 'session-abc',
        aggregate_type: 'session',
        processed_at: '2024-01-01T00:00:00.000Z',
        from_stream_position: '0',
        to_stream_position: '5',
      };

      const mockPersistence = {
        query: async () => ({ rows: [expectedRow, { ...expectedRow, command_id: 'other' }] }),
      } as unknown as PersistencePort;

      const result = await getProcessedCommand(mockPersistence, 'cmd-123');

      expect(result).toEqual(expectedRow);
    });
  });

  describe('putProcessedCommand (PersistencePort)', () => {
    it('should insert through persistence port', async () => {
      let capturedParams: (string | number)[] = [];

      const mockPersistence = {
        execute: async (_sql: string, params: (string | number)[]) => {
          capturedParams = params;
          return { rowsAffected: 1 };
        },
      } as unknown as PersistencePort;

      const row: ProcessedCommandRow = {
        command_id: 'cmd-123',
        aggregate_id: 'session-abc',
        aggregate_type: 'session',
        processed_at: '2024-01-01T00:00:00.000Z',
        from_stream_position: '0',
        to_stream_position: '5',
      };

      await putProcessedCommand(mockPersistence, row);

      expect(capturedParams[0]).toBe('cmd-123'); // id = command_id
      expect(capturedParams[1]).toBe('cmd-123'); // command_id
      expect(capturedParams[2]).toBe('session-abc'); // aggregate_id
    });
  });

  describe('ProcessedCommandRow type', () => {
    it('should have correct structure', () => {
      const row: ProcessedCommandRow = {
        command_id: 'cmd-123',
        aggregate_id: 'session-abc',
        aggregate_type: 'session',
        processed_at: '2024-01-01T00:00:00.000Z',
        from_stream_position: '0',
        to_stream_position: '999',
      };

      expect(row.command_id).toBe('cmd-123');
      expect(row.aggregate_id).toBe('session-abc');
      expect(row.aggregate_type).toBe('session');
      expect(row.processed_at).toBe('2024-01-01T00:00:00.000Z');
      expect(row.from_stream_position).toBe('0');
      expect(row.to_stream_position).toBe('999');
    });
  });

  describe('bigint handling', () => {
    it('should preserve bigint precision when stored as TEXT', () => {
      // This tests the core assumption: positions are stored as TEXT to preserve bigint
      const bigIntValue = 9007199254740991n; // Larger than Number.MAX_SAFE_INTEGER

      const row: ProcessedCommandRow = {
        command_id: 'cmd-123',
        aggregate_id: 'session-abc',
        aggregate_type: 'session',
        processed_at: '2024-01-01T00:00:00.000Z',
        from_stream_position: bigIntValue.toString(),
        to_stream_position: (bigIntValue + 1n).toString(),
      };

      expect(BigInt(row.from_stream_position)).toBe(bigIntValue);
      expect(BigInt(row.to_stream_position)).toBe(bigIntValue + 1n);
    });

    it('should handle zero position', () => {
      const row: ProcessedCommandRow = {
        command_id: 'cmd-123',
        aggregate_id: 'session-abc',
        aggregate_type: 'session',
        processed_at: '2024-01-01T00:00:00.000Z',
        from_stream_position: '0',
        to_stream_position: '0',
      };

      expect(BigInt(row.from_stream_position)).toBe(0n);
      expect(BigInt(row.to_stream_position)).toBe(0n);
    });
  });
});
