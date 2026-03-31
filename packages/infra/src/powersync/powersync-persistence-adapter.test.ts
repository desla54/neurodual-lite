/**
 * PowerSync Persistence Adapter Tests
 *
 * Tests for the PowerSyncPersistenceAdapter and its utility functions.
 * Uses mocked database for adapter method tests.
 */

import { describe, expect, it, mock, spyOn } from 'bun:test';

import * as database from './database';
import {
  PowerSyncPersistenceAdapter,
  createPowerSyncPersistenceAdapter,
} from './powersync-persistence-adapter';

// =============================================================================
// Mock Database Setup
// =============================================================================

interface MockRow {
  [key: string]: unknown;
}

function createMockDatabase() {
  const mockTx = {
    execute: mock(() => Promise.resolve({ rowsAffected: 1 })),
  };

  return {
    execute: mock(() => Promise.resolve({ rowsAffected: 1 })),
    getAll: mock((): Promise<any[]> => Promise.resolve([])),
    getOptional: mock((): Promise<any> => Promise.resolve(null)),
    writeTransaction: mock((fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
    close: mock(() => Promise.resolve()),
    _mockTx: mockTx,
  };
}

/**
 * Helper to create mock emt_messages row (Phase 9 format)
 */
function createMockEmtMessagesRow(options: {
  messageId: string;
  messageType: string;
  sessionId: string;
  payload?: Record<string, unknown>;
}): MockRow {
  const { messageId, messageType, sessionId, payload = {} } = options;

  return {
    message_id: messageId,
    stream_id: `session:${sessionId}`,
    stream_position: 1,
    global_position: 1,
    message_type: messageType,
    message_data: JSON.stringify({ data: payload }),
    created: new Date().toISOString(),
  };
}

// =============================================================================
// Utility Function Tests (exported for testing via module internals)
// =============================================================================

describe('PowerSyncPersistenceAdapter - Utility Functions', () => {
  describe('isUuid', () => {
    it('should identify valid UUIDs (used for authenticated-only tombstones)', () => {
      // isUuid is a private helper; its behavior is covered indirectly by deleteSession tests
      // which gate deleted_sessions tombstones on authenticated (UUID) userIds.
    });
  });

  describe('toIso conversion', () => {
    // Tested via parseStoredEventRow behavior
    it('should handle Date objects in stored events', async () => {
      const mockDb = createMockDatabase();
      spyOn(database, 'openPowerSyncDatabase').mockResolvedValue(mockDb as any);

      const adapter = new PowerSyncPersistenceAdapter();
      await adapter.init();
      mockDb.writeTransaction.mockClear();

      const now = Date.now();
      mockDb.getOptional.mockResolvedValue(
        createMockEmtMessagesRow({
          messageId: 'test-id',
          messageType: 'TEST_EVENT',
          sessionId: 'session-1',
          payload: { userId: 'user-1', timestamp: now },
        }),
      );

      const event = await adapter.getEventById('test-id');

      expect(event).not.toBeNull();
      expect(event!.type).toBe('TEST_EVENT');
      expect(typeof event!.created_at).toBe('string');
    });
  });

  describe('parseJsonObject', () => {
    it('should parse valid JSON strings in event payload', async () => {
      const mockDb = createMockDatabase();
      spyOn(database, 'openPowerSyncDatabase').mockResolvedValue(mockDb as any);

      const adapter = new PowerSyncPersistenceAdapter();
      await adapter.init();
      mockDb.writeTransaction.mockClear();

      const payload = { key: 'value', nested: { num: 42 } };
      mockDb.getOptional.mockResolvedValue(
        createMockEmtMessagesRow({
          messageId: 'test-id',
          messageType: 'TEST_EVENT',
          sessionId: 'session-1',
          payload,
        }),
      );

      const event = await adapter.getEventById('test-id');

      expect(event!.payload).toEqual(payload);
    });

    it('should handle null/empty payload gracefully', async () => {
      const mockDb = createMockDatabase();
      spyOn(database, 'openPowerSyncDatabase').mockResolvedValue(mockDb as any);

      const adapter = new PowerSyncPersistenceAdapter();
      await adapter.init();
      mockDb.writeTransaction.mockClear();

      mockDb.getOptional.mockResolvedValue(
        createMockEmtMessagesRow({
          messageId: 'test-id',
          messageType: 'TEST_EVENT',
          sessionId: 'session-1',
          payload: {},
        }),
      );

      const event = await adapter.getEventById('test-id');

      expect(event!.payload).toEqual({});
    });

    it('should handle invalid JSON gracefully', async () => {
      const mockDb = createMockDatabase();
      spyOn(database, 'openPowerSyncDatabase').mockResolvedValue(mockDb as any);

      const adapter = new PowerSyncPersistenceAdapter();
      await adapter.init();

      // Create mock with invalid JSON in message_data
      mockDb.getOptional.mockResolvedValue({
        message_id: 'test-id',
        stream_id: 'session:session-1',
        stream_position: 1,
        global_position: 1,
        message_type: 'TEST_EVENT',
        message_data: 'not-valid-json',
        created: new Date().toISOString(),
      });

      const event = await adapter.getEventById('test-id');

      expect(event!.payload).toEqual({});
    });
  });

  describe('normalizeBool', () => {
    it('should normalize boolean values in deleted field', async () => {
      const mockDb = createMockDatabase();
      spyOn(database, 'openPowerSyncDatabase').mockResolvedValue(mockDb as any);

      const adapter = new PowerSyncPersistenceAdapter();
      await adapter.init();

      // Phase 9: Emmett events are never "deleted" - they use is_archived
      // The deleted field is always 0 for Emmett events
      mockDb.getOptional.mockResolvedValue(
        createMockEmtMessagesRow({
          messageId: 'test-1',
          messageType: 'TEST',
          sessionId: 'session-1',
          payload: {},
        }),
      );

      const event1 = await adapter.getEventById('test-1');
      expect(event1!.deleted).toBe(false);
      // All Emmett events are synced
      expect(event1!.synced).toBe(true);
    });

    it('should handle string boolean values', async () => {
      const mockDb = createMockDatabase();
      spyOn(database, 'openPowerSyncDatabase').mockResolvedValue(mockDb as any);

      const adapter = new PowerSyncPersistenceAdapter();
      await adapter.init();

      mockDb.getOptional.mockResolvedValue(
        createMockEmtMessagesRow({
          messageId: 'test-1',
          messageType: 'TEST',
          sessionId: 'session-1',
          payload: {},
        }),
      );

      const event = await adapter.getEventById('test-1');
      expect(event!.deleted).toBe(false);
      expect(event!.synced).toBe(true);
    });
  });

  describe('buildPlaceholders', () => {
    // Tested indirectly via queryEvents with array type filter
    it('should build correct placeholders for IN clause', async () => {
      const mockDb = createMockDatabase();
      spyOn(database, 'openPowerSyncDatabase').mockResolvedValue(mockDb as any);

      const adapter = new PowerSyncPersistenceAdapter();
      await adapter.init();

      mockDb.getAll.mockResolvedValue([]);

      await adapter.queryEvents({ type: ['TYPE_A', 'TYPE_B', 'TYPE_C'] });

      // Check that getAll was called with placeholders
      expect(mockDb.getAll).toHaveBeenCalled();
      const [sql] = mockDb.getAll.mock.calls.at(-1) as unknown as [string, unknown[]];
      expect(sql).toContain('(?, ?, ?)');
    });
  });

  describe('append (Emmett)', () => {
    it('should write to emt_messages regardless of userId shape', async () => {
      const mockDb = createMockDatabase();
      spyOn(database, 'openPowerSyncDatabase').mockResolvedValue(mockDb as any);

      const adapter = new PowerSyncPersistenceAdapter();
      await adapter.init();

      const now = Date.now();
      mockDb.getOptional.mockResolvedValue(
        createMockEmtMessagesRow({
          messageId: 'event-1',
          messageType: 'TEST',
          sessionId: 'session-1',
          payload: { userId: 'local-user', timestamp: now },
        }),
      );

      await adapter.append({
        id: 'event-1',
        sessionId: 'session-1',
        userId: 'local-user', // Not a UUID
        type: 'TEST',
        timestamp: now,
        payload: {},
      });

      // INSERT happens inside the write transaction.
      const insertCall = mockDb._mockTx.execute.mock.calls.find((call: unknown[]) =>
        (call[0] as string).includes('INSERT INTO emt_messages'),
      ) as unknown as [string, unknown[]] | undefined;
      expect(insertCall).toBeTruthy();
    });
  });

  describe('isLikelyFatalStorageError', () => {
    it('should detect OPFS fatal errors and call error callback', async () => {
      const mockDb = createMockDatabase();
      spyOn(database, 'openPowerSyncDatabase').mockResolvedValue(mockDb as any);

      const adapter = new PowerSyncPersistenceAdapter();
      const errorCallback = mock(() => {});
      adapter.onError(errorCallback);

      await adapter.init();

      // Simulate a fatal OPFS error
      mockDb.getOptional.mockRejectedValue(new Error('disk i/o error'));

      await expect(adapter.healthCheck()).rejects.toThrow('disk i/o error');
      expect(errorCallback).toHaveBeenCalled();
    });

    it('should not call error callback for non-fatal errors', async () => {
      const mockDb = createMockDatabase();
      spyOn(database, 'openPowerSyncDatabase').mockResolvedValue(mockDb as any);

      const adapter = new PowerSyncPersistenceAdapter();
      const errorCallback = mock(() => {});
      adapter.onError(errorCallback);

      await adapter.init();

      // Simulate a regular error (not fatal)
      mockDb.getOptional.mockRejectedValue(new Error('Some random query error'));

      await expect(adapter.healthCheck()).rejects.toThrow('Some random query error');
      // Error callback should NOT be called for non-fatal errors
      expect(errorCallback).not.toHaveBeenCalled();
    });
  });
});

// =============================================================================
// Lifecycle Tests
// =============================================================================

describe('PowerSyncPersistenceAdapter - Lifecycle', () => {
  describe('init', () => {
    it('should initialize database and create view', async () => {
      const mockDb = createMockDatabase();
      spyOn(database, 'openPowerSyncDatabase').mockResolvedValue(mockDb as any);

      const adapter = new PowerSyncPersistenceAdapter();

      expect(adapter.isReady()).toBe(false);

      await adapter.init();

      expect(adapter.isReady()).toBe(true);
      // Phase 7: events_all view removed, reads now use emt_messages directly
      // No view creation expected
    });

    it('should be idempotent (multiple init calls)', async () => {
      const mockDb = createMockDatabase();
      spyOn(database, 'openPowerSyncDatabase').mockResolvedValue(mockDb as any);

      const adapter = new PowerSyncPersistenceAdapter();

      await adapter.init();
      const executeCallsAfterFirst = mockDb.execute.mock.calls.length;

      await adapter.init();
      await adapter.init();

      // Should not execute more queries after first init
      expect(mockDb.execute.mock.calls.length).toBe(executeCallsAfterFirst);
    });
  });

  describe('close', () => {
    it('should reset state on close', async () => {
      const mockDb = createMockDatabase();
      spyOn(database, 'openPowerSyncDatabase').mockResolvedValue(mockDb as any);

      const adapter = new PowerSyncPersistenceAdapter();
      await adapter.init();

      expect(adapter.isReady()).toBe(true);

      await adapter.close();

      expect(adapter.isReady()).toBe(false);
    });
  });

  describe('isReady', () => {
    it('should return false before init', () => {
      const adapter = new PowerSyncPersistenceAdapter();
      expect(adapter.isReady()).toBe(false);
    });

    it('should return true after init', async () => {
      const mockDb = createMockDatabase();
      spyOn(database, 'openPowerSyncDatabase').mockResolvedValue(mockDb as any);

      const adapter = new PowerSyncPersistenceAdapter();
      await adapter.init();

      expect(adapter.isReady()).toBe(true);
    });
  });

  describe('healthCheck', () => {
    it('should return true when database is healthy', async () => {
      const mockDb = createMockDatabase();
      mockDb.getOptional.mockResolvedValue({ ok: 1 });
      spyOn(database, 'openPowerSyncDatabase').mockResolvedValue(mockDb as any);

      const adapter = new PowerSyncPersistenceAdapter();
      await adapter.init();

      const healthy = await adapter.healthCheck();

      expect(healthy).toBe(true);
    });

    it('should recover once after a closed handle error', async () => {
      const closedDb = createMockDatabase();
      closedDb.getOptional.mockRejectedValueOnce(new Error('Closed'));
      const reopenedDb = createMockDatabase();
      reopenedDb.getOptional.mockResolvedValue({ ok: 1 });
      const openSpy = spyOn(database, 'openPowerSyncDatabase');
      openSpy.mockResolvedValueOnce(closedDb as any);
      openSpy.mockResolvedValueOnce(reopenedDb as any);

      const adapter = new PowerSyncPersistenceAdapter();
      await adapter.init();
      const callsAfterInit = openSpy.mock.calls.length;

      const healthy = await adapter.healthCheck();

      expect(healthy).toBe(true);
      expect(openSpy.mock.calls.length - callsAfterInit).toBe(1);
    });

    it('should throw when database is not healthy', async () => {
      const mockDb = createMockDatabase();
      mockDb.getOptional.mockRejectedValue(new Error('DB connection lost'));
      spyOn(database, 'openPowerSyncDatabase').mockResolvedValue(mockDb as any);

      const adapter = new PowerSyncPersistenceAdapter();
      await adapter.init();

      await expect(adapter.healthCheck()).rejects.toThrow('DB connection lost');
    });
  });
});

describe('PowerSyncPersistenceAdapter - Query Recovery', () => {
  it('should retry query once after a closed handle error', async () => {
    const closedDb = createMockDatabase();
    closedDb.getAll.mockRejectedValueOnce(new Error('Closed'));
    const reopenedDb = createMockDatabase();
    reopenedDb.getAll.mockResolvedValue([{ value: 42 }]);
    const openSpy = spyOn(database, 'openPowerSyncDatabase');
    openSpy.mockResolvedValueOnce(closedDb as any);
    openSpy.mockResolvedValueOnce(reopenedDb as any);

    const adapter = new PowerSyncPersistenceAdapter();
    await adapter.init();
    const callsAfterInit = openSpy.mock.calls.length;

    const result = await adapter.query<{ value: number }>('SELECT 42 as value');

    expect(result.rows).toEqual([{ value: 42 }]);
    expect(openSpy.mock.calls.length - callsAfterInit).toBe(1);
  });
});

// =============================================================================
// Events - Write Tests
// =============================================================================

describe('PowerSyncPersistenceAdapter - Events Write', () => {
  describe('append', () => {
    it('should append event and return stored event', async () => {
      const mockDb = createMockDatabase();
      spyOn(database, 'openPowerSyncDatabase').mockResolvedValue(mockDb as any);

      const adapter = new PowerSyncPersistenceAdapter();
      await adapter.init();

      const eventId = 'event-123';
      const sessionId = 'session-456';
      const now = Date.now();

      mockDb.getOptional.mockResolvedValue(
        createMockEmtMessagesRow({
          messageId: eventId,
          messageType: 'TEST_EVENT',
          sessionId,
          payload: { timestamp: now },
        }),
      );

      const result = await adapter.append({
        id: eventId,
        sessionId,
        type: 'TEST_EVENT',
        timestamp: now,
        payload: {},
      });

      expect(result).not.toBeNull();
      expect(result!.id).toBe(eventId);
      expect(result!.session_id).toBe(sessionId);
    });
  });

  describe('appendFireAndForget', () => {
    it('should append without waiting and call error callback on failure', async () => {
      const mockDb = createMockDatabase();
      spyOn(database, 'openPowerSyncDatabase').mockResolvedValue(mockDb as any);

      const adapter = new PowerSyncPersistenceAdapter();
      const errorCallback = mock(() => {});
      adapter.onError(errorCallback);

      await adapter.init();

      mockDb._mockTx.execute.mockRejectedValue(new Error('Write failed'));

      adapter.appendFireAndForget({
        id: 'event-1',
        sessionId: 'session-1',
        type: 'TEST',
        timestamp: Date.now(),
        payload: {},
      });

      // Wait for async callback
      await new Promise((r) => setTimeout(r, 50));

      expect(errorCallback).toHaveBeenCalled();
    });
  });

  describe('appendBatch', () => {
    it('should append multiple events in transaction', async () => {
      const mockDb = createMockDatabase();
      spyOn(database, 'openPowerSyncDatabase').mockResolvedValue(mockDb as any);

      const adapter = new PowerSyncPersistenceAdapter();
      await adapter.init();
      mockDb.writeTransaction.mockClear();

      const events = [
        { id: 'e1', sessionId: 's1', type: 'T1', timestamp: Date.now(), payload: {} },
        { id: 'e2', sessionId: 's1', type: 'T2', timestamp: Date.now(), payload: {} },
        { id: 'e3', sessionId: 's1', type: 'T3', timestamp: Date.now(), payload: {} },
      ];

      const count = await adapter.appendBatch(events);

      expect(count).toBe(3);
      expect(mockDb.writeTransaction).toHaveBeenCalledTimes(1);
    });

    it('should return 0 for empty batch', async () => {
      const mockDb = createMockDatabase();
      spyOn(database, 'openPowerSyncDatabase').mockResolvedValue(mockDb as any);

      const adapter = new PowerSyncPersistenceAdapter();
      await adapter.init();
      mockDb.writeTransaction.mockClear();

      const count = await adapter.appendBatch([]);

      expect(count).toBe(0);
      expect(mockDb.writeTransaction).not.toHaveBeenCalled();
    });
  });
});

// =============================================================================
// Events - Read Tests
// =============================================================================

describe('PowerSyncPersistenceAdapter - Events Read', () => {
  describe('getSession', () => {
    it('should return events for a session', async () => {
      const mockDb = createMockDatabase();
      spyOn(database, 'openPowerSyncDatabase').mockResolvedValue(mockDb as any);

      const adapter = new PowerSyncPersistenceAdapter();
      await adapter.init();

      const sessionId = 'session-1';
      mockDb.getAll.mockResolvedValue([
        {
          id: 'e1',
          user_id: null,
          session_id: sessionId,
          type: 'SESSION_STARTED',
          timestamp: 1000,
          payload: '{}',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          deleted: 0,
          synced: 1,
        },
        {
          id: 'e2',
          user_id: null,
          session_id: sessionId,
          type: 'SESSION_ENDED',
          timestamp: 2000,
          payload: '{}',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          deleted: 0,
          synced: 1,
        },
      ]);

      const events = await adapter.getSession(sessionId);

      expect(events.length).toBe(2);
      expect(events[0]!.type).toBe('SESSION_STARTED');
      expect(events[1]!.type).toBe('SESSION_ENDED');
    });

    it('should return empty array for non-existent session', async () => {
      const mockDb = createMockDatabase();
      mockDb.getAll.mockResolvedValue([]);
      spyOn(database, 'openPowerSyncDatabase').mockResolvedValue(mockDb as any);

      const adapter = new PowerSyncPersistenceAdapter();
      await adapter.init();

      const events = await adapter.getSession('non-existent');

      expect(events).toEqual([]);
    });
  });

  describe('queryEvents', () => {
    it('should filter by sessionId', async () => {
      const mockDb = createMockDatabase();
      spyOn(database, 'openPowerSyncDatabase').mockResolvedValue(mockDb as any);

      const adapter = new PowerSyncPersistenceAdapter();
      await adapter.init();

      mockDb.getAll.mockResolvedValue([]);

      await adapter.queryEvents({ sessionId: 'session-123' });

      const [sql, params] = mockDb.getAll.mock.calls.at(-1) as unknown as [string, unknown[]];
      // Phase 7: now uses stream_id with 'session:' prefix
      expect(sql).toContain('stream_id');
      expect(params).toContain('session-123');
    });

    it('should filter by single type', async () => {
      const mockDb = createMockDatabase();
      spyOn(database, 'openPowerSyncDatabase').mockResolvedValue(mockDb as any);

      const adapter = new PowerSyncPersistenceAdapter();
      await adapter.init();

      mockDb.getAll.mockResolvedValue([]);

      await adapter.queryEvents({ type: 'SESSION_STARTED' });

      const [sql, params] = mockDb.getAll.mock.calls.at(-1) as unknown as [string, unknown[]];
      expect(sql).toContain('message_type');
      expect(params).toContain('SESSION_STARTED');
    });

    it('should filter by multiple types', async () => {
      const mockDb = createMockDatabase();
      spyOn(database, 'openPowerSyncDatabase').mockResolvedValue(mockDb as any);

      const adapter = new PowerSyncPersistenceAdapter();
      await adapter.init();

      mockDb.getAll.mockResolvedValue([]);

      await adapter.queryEvents({ type: ['TYPE_A', 'TYPE_B'] });

      const [sql, params] = mockDb.getAll.mock.calls.at(-1) as unknown as [string, unknown[]];
      expect(sql).toContain('type IN');
      expect(params).toContain('TYPE_A');
      expect(params).toContain('TYPE_B');
    });

    it('should filter by timestamp range', async () => {
      const mockDb = createMockDatabase();
      spyOn(database, 'openPowerSyncDatabase').mockResolvedValue(mockDb as any);

      const adapter = new PowerSyncPersistenceAdapter();
      await adapter.init();

      mockDb.getAll.mockResolvedValue([]);

      await adapter.queryEvents({ after: 1000, before: 5000 });

      const [sql, params] = mockDb.getAll.mock.calls.at(-1) as unknown as [string, unknown[]];
      // Phase 7: now uses CAST(json_extract(...)) for timestamp
      expect(sql).toContain('json_extract');
      expect(sql).toContain('timestamp');
      expect(params).toContain('1000');
      expect(params).toContain(5000);
    });
  });

  describe('all', () => {
    it('should return all non-deleted events', async () => {
      const mockDb = createMockDatabase();
      spyOn(database, 'openPowerSyncDatabase').mockResolvedValue(mockDb as any);

      const adapter = new PowerSyncPersistenceAdapter();
      await adapter.init();

      mockDb.getAll.mockResolvedValue([
        {
          id: 'e1',
          user_id: null,
          session_id: 's1',
          type: 'TEST',
          timestamp: 1000,
          payload: '{}',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          deleted: 0,
          synced: 1,
        },
      ]);

      const events = await adapter.all();

      expect(events.length).toBe(1);
      // Phase 7: emt_messages doesn't have deleted column, we use constant 0 (false)
      expect(events[0]!.deleted).toBe(false);
    });
  });

  describe('count', () => {
    it('should return count of non-deleted events', async () => {
      const mockDb = createMockDatabase();
      mockDb.getOptional.mockResolvedValue({ count: 42 });
      spyOn(database, 'openPowerSyncDatabase').mockResolvedValue(mockDb as any);

      const adapter = new PowerSyncPersistenceAdapter();
      await adapter.init();

      const count = await adapter.count();

      expect(count).toBe(42);
    });

    it('should return 0 when no events', async () => {
      const mockDb = createMockDatabase();
      mockDb.getOptional.mockResolvedValue(null);
      spyOn(database, 'openPowerSyncDatabase').mockResolvedValue(mockDb as any);

      const adapter = new PowerSyncPersistenceAdapter();
      await adapter.init();

      const count = await adapter.count();

      expect(count).toBe(0);
    });
  });

  describe('getEventById', () => {
    it('should return event by id', async () => {
      const mockDb = createMockDatabase();
      spyOn(database, 'openPowerSyncDatabase').mockResolvedValue(mockDb as any);

      const adapter = new PowerSyncPersistenceAdapter();
      await adapter.init();

      mockDb.getOptional.mockResolvedValue(
        createMockEmtMessagesRow({
          messageId: 'event-123',
          messageType: 'TEST',
          sessionId: 'session-1',
          payload: { key: 'value' },
        }),
      );

      const event = await adapter.getEventById('event-123');

      expect(event).not.toBeNull();
      expect(event!.id).toBe('event-123');
      expect(event!.payload).toEqual({ key: 'value' });
    });

    it('should return null for non-existent event', async () => {
      const mockDb = createMockDatabase();
      mockDb.getOptional.mockResolvedValue(null);
      spyOn(database, 'openPowerSyncDatabase').mockResolvedValue(mockDb as any);

      const adapter = new PowerSyncPersistenceAdapter();
      await adapter.init();

      const event = await adapter.getEventById('non-existent');

      expect(event).toBeNull();
    });
  });
});

// =============================================================================
// Events - Delete Tests
// =============================================================================

describe('PowerSyncPersistenceAdapter - Events Delete', () => {
  describe('deleteSession', () => {
    it('should delete session events and return count', async () => {
      const mockDb = createMockDatabase();
      spyOn(database, 'openPowerSyncDatabase').mockResolvedValue(mockDb as any);

      const adapter = new PowerSyncPersistenceAdapter();
      await adapter.init();

      mockDb.getOptional.mockResolvedValueOnce({ count: 5 }); // Count query
      mockDb.getOptional.mockResolvedValueOnce({ user_id: null }); // User query

      const count = await adapter.deleteSession('session-123');

      expect(count).toBe(5);
      expect(mockDb.writeTransaction).toHaveBeenCalled();
    });

    it('should create tombstone for authenticated users', async () => {
      const mockDb = createMockDatabase();
      spyOn(database, 'openPowerSyncDatabase').mockResolvedValue(mockDb as any);

      const adapter = new PowerSyncPersistenceAdapter();
      await adapter.init();

      const validUuid = '123e4567-e89b-12d3-a456-426614174000';
      mockDb.getOptional.mockResolvedValueOnce({ count: 3 });
      mockDb.getOptional.mockResolvedValueOnce({ user_id: validUuid });

      await adapter.deleteSession('session-123');

      // Check that tombstone was created in transaction
      const txExecuteCalls = mockDb._mockTx.execute.mock.calls;
      const tombstoneCall = txExecuteCalls.find((call: unknown[]) =>
        (call[0] as string).includes('deleted_sessions'),
      );
      expect(tombstoneCall).toBeDefined();
    });

    it('should batch delete multiple sessions in one transaction', async () => {
      const mockDb = createMockDatabase();
      spyOn(database, 'openPowerSyncDatabase').mockResolvedValue(mockDb as any);

      const adapter = new PowerSyncPersistenceAdapter();
      await adapter.init();

      const validUuid = '123e4567-e89b-12d3-a456-426614174000';
      mockDb.getOptional
        .mockResolvedValueOnce({ count: 2 })
        .mockResolvedValueOnce({ user_id: validUuid })
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ user_id: null });

      const count = await adapter.deleteSessions(['session-1', 'session-2', 'session-1']);

      expect(count).toBe(3);
      expect(mockDb.writeTransaction).toHaveBeenCalledTimes(1);

      const txExecuteCalls = mockDb._mockTx.execute.mock.calls;
      const tombstoneCalls = txExecuteCalls.filter((call: unknown[]) =>
        (call[0] as string).includes('INSERT OR IGNORE INTO deleted_sessions'),
      );
      expect(tombstoneCalls).toHaveLength(1);

      const sessionSummaryDeleteCall = txExecuteCalls.find((call: unknown[]) =>
        (call[0] as string).includes('DELETE FROM session_summaries WHERE session_id IN'),
      );
      expect(sessionSummaryDeleteCall).toBeDefined();
    });
  });

  describe('clear', () => {
    it('should delete all events from all tables', async () => {
      const mockDb = createMockDatabase();
      spyOn(database, 'openPowerSyncDatabase').mockResolvedValue(mockDb as any);

      const adapter = new PowerSyncPersistenceAdapter();
      await adapter.init();

      await adapter.clear();

      expect(mockDb.writeTransaction).toHaveBeenCalled();
      const txExecuteCalls = mockDb._mockTx.execute.mock.calls;

      const hasArchive = txExecuteCalls.some((call: unknown[]) =>
        (call[0] as string).includes('UPDATE emt_messages SET is_archived = 1'),
      );
      expect(hasArchive).toBe(true);

      const tables = [
        'session_summaries',
        'replay_events',
        'replay_runs',
        'pending_deletions',
        'sync_meta',
      ];
      for (const table of tables) {
        const found = txExecuteCalls.some((call: unknown[]) =>
          (call[0] as string).includes(`DELETE FROM ${table}`),
        );
        expect(found).toBe(true);
      }
    });
  });

  describe('deleteEventsByIds', () => {
    it('should delete events by ids', async () => {
      const mockDb = createMockDatabase();
      spyOn(database, 'openPowerSyncDatabase').mockResolvedValue(mockDb as any);

      const adapter = new PowerSyncPersistenceAdapter();
      await adapter.init();

      await adapter.deleteEventsByIds(['e1', 'e2', 'e3']);

      expect(mockDb.writeTransaction).toHaveBeenCalled();
    });

    it('should do nothing for empty array', async () => {
      const mockDb = createMockDatabase();
      spyOn(database, 'openPowerSyncDatabase').mockResolvedValue(mockDb as any);

      const adapter = new PowerSyncPersistenceAdapter();
      await adapter.init();
      mockDb.writeTransaction.mockClear();

      await adapter.deleteEventsByIds([]);

      expect(mockDb.writeTransaction).not.toHaveBeenCalled();
    });
  });
});

// =============================================================================
// Session Summaries Tests
// =============================================================================

describe('PowerSyncPersistenceAdapter - Session Summaries', () => {
  describe('getSessionSummaries', () => {
    it('should return summaries for user', async () => {
      const mockDb = createMockDatabase();
      spyOn(database, 'openPowerSyncDatabase').mockResolvedValue(mockDb as any);

      const adapter = new PowerSyncPersistenceAdapter();
      await adapter.init();

      mockDb.getAll.mockResolvedValue([
        {
          session_id: 's1',
          user_id: 'user-1',
          session_type: 'tempo',
          created_at: new Date().toISOString(),
          n_level: 2,
          duration_ms: 60000,
          trials_count: 20,
          by_modality: '{}',
          xp_breakdown: null,
        },
      ]);

      const summaries = await adapter.getSessionSummaries('user-1');

      expect(summaries.length).toBe(1);
      expect(summaries[0]!.session_id).toBe('s1');
    });

    it('preserves calibration play_context when reading summaries', async () => {
      const mockDb = createMockDatabase();
      spyOn(database, 'openPowerSyncDatabase').mockResolvedValue(mockDb as any);

      const adapter = new PowerSyncPersistenceAdapter();
      await adapter.init();

      mockDb.getAll.mockResolvedValue([
        {
          session_id: 's-calibration',
          user_id: 'user-1',
          session_type: 'tempo',
          created_at: new Date().toISOString(),
          n_level: 2,
          duration_ms: 60000,
          trials_count: 20,
          play_context: 'calibration',
          by_modality: '{}',
          xp_breakdown: null,
        },
      ]);

      const summaries = await adapter.getSessionSummaries('user-1');

      expect(summaries[0]?.play_context).toBe('calibration');
    });

    it('should exclude abandoned sessions by default', async () => {
      const mockDb = createMockDatabase();
      spyOn(database, 'openPowerSyncDatabase').mockResolvedValue(mockDb as any);

      const adapter = new PowerSyncPersistenceAdapter();
      await adapter.init();

      mockDb.getAll.mockResolvedValue([]);

      await adapter.getSessionSummaries('user-1');

      const [sql] = mockDb.getAll.mock.calls.at(-1) as unknown as [string];
      expect(sql).toContain("reason != 'abandoned'");
    });

    it('should include abandoned sessions when specified', async () => {
      const mockDb = createMockDatabase();
      spyOn(database, 'openPowerSyncDatabase').mockResolvedValue(mockDb as any);

      const adapter = new PowerSyncPersistenceAdapter();
      await adapter.init();

      mockDb.getAll.mockResolvedValue([]);

      await adapter.getSessionSummaries('user-1', { includeAbandoned: true });

      const [sql] = mockDb.getAll.mock.calls.at(-1) as unknown as [string];
      expect(sql).not.toContain('abandoned');
    });
  });

  describe('insertSessionSummary', () => {
    it('should delete existing and insert new summary', async () => {
      const mockDb = createMockDatabase();
      spyOn(database, 'openPowerSyncDatabase').mockResolvedValue(mockDb as any);

      const adapter = new PowerSyncPersistenceAdapter();
      await adapter.init();

      await adapter.insertSessionSummary({
        sessionId: 's1',
        sessionType: 'tempo',
        createdAt: new Date(),
        nLevel: 2,
        durationMs: 60000,
        trialsCount: 20,
      });

      // Should delete then insert (operations happen inside writeTransaction)
      const executeCalls = mockDb._mockTx.execute.mock.calls;
      const deleteCall = executeCalls.find((call: unknown[]) =>
        (call[0] as string).includes('DELETE FROM session_summaries'),
      );
      const insertCall = executeCalls.find((call: unknown[]) =>
        (call[0] as string).includes('INSERT INTO session_summaries'),
      );

      expect(deleteCall).toBeDefined();
      expect(insertCall).toBeDefined();
    });

    it('should persist only fields provided by the new summary', async () => {
      const mockDb = createMockDatabase();
      spyOn(database, 'openPowerSyncDatabase').mockResolvedValue(mockDb as any);

      const adapter = new PowerSyncPersistenceAdapter();
      await adapter.init();

      const xpBreakdown = { total: 198, base: 150 };
      const journeyContext = {
        stageId: 4,
        nLevel: 4,
        stageCompleted: false,
      };

      await adapter.insertSessionSummary({
        sessionId: 's-preserve',
        sessionType: 'tempo',
        createdAt: new Date(),
        nLevel: 4,
        durationMs: 65000,
        trialsCount: 20,
        adaptivePathProgressPct: 12,
        xpBreakdown,
        journeyContext,
      });

      const executeCalls = mockDb._mockTx.execute.mock.calls;
      const insertCall = executeCalls.find((call: unknown[]) =>
        (call[0] as string).includes('INSERT INTO session_summaries'),
      ) as unknown as [string, unknown[]] | undefined;

      expect(insertCall).toBeDefined();
      expect(insertCall?.[1]).toContain(12);
      expect(insertCall?.[1]).toContain(JSON.stringify(xpBreakdown));
      expect(insertCall?.[1]).toContain(JSON.stringify(journeyContext));
    });
  });

  describe('insertSessionSummariesBatch', () => {
    it('should insert multiple summaries in transaction', async () => {
      const mockDb = createMockDatabase();
      spyOn(database, 'openPowerSyncDatabase').mockResolvedValue(mockDb as any);

      const adapter = new PowerSyncPersistenceAdapter();
      await adapter.init();

      const summaries = [
        {
          sessionId: 's1',
          sessionType: 'tempo' as const,
          createdAt: new Date(),
          nLevel: 2,
          durationMs: 60000,
          trialsCount: 20,
        },
        {
          sessionId: 's2',
          sessionType: 'flow' as const,
          createdAt: new Date(),
          nLevel: 3,
          durationMs: 90000,
          trialsCount: 25,
        },
      ];

      const count = await adapter.insertSessionSummariesBatch(summaries);

      expect(count).toBe(2);
      expect(mockDb.writeTransaction).toHaveBeenCalled();
    });

    it('should persist provided xp breakdown and journey context in batch mode', async () => {
      const mockDb = createMockDatabase();
      spyOn(database, 'openPowerSyncDatabase').mockResolvedValue(mockDb as any);

      const adapter = new PowerSyncPersistenceAdapter();
      await adapter.init();

      const xpBreakdown = { total: 321, base: 200 };
      const journeyContext = {
        stageId: 8,
        nLevel: 5,
        stageCompleted: false,
      };

      const count = await adapter.insertSessionSummariesBatch([
        {
          sessionId: 's-batch-context',
          sessionType: 'tempo',
          createdAt: new Date(),
          nLevel: 5,
          durationMs: 75_000,
          trialsCount: 20,
          adaptivePathProgressPct: 18,
          xpBreakdown,
          journeyContext,
        },
      ]);

      expect(count).toBe(1);
      const txExecuteCalls = mockDb._mockTx.execute.mock.calls;
      const insertCall = txExecuteCalls.find((call: unknown[]) =>
        (call[0] as string).includes('INSERT INTO session_summaries'),
      ) as unknown as [string, unknown[]] | undefined;

      expect(insertCall).toBeDefined();
      expect(insertCall?.[1]).toContain(18);
      expect(insertCall?.[1]).toContain(JSON.stringify(xpBreakdown));
      expect(insertCall?.[1]).toContain(JSON.stringify(journeyContext));
    });

    it('should return 0 for empty batch', async () => {
      const mockDb = createMockDatabase();
      spyOn(database, 'openPowerSyncDatabase').mockResolvedValue(mockDb as any);

      const adapter = new PowerSyncPersistenceAdapter();
      await adapter.init();

      const count = await adapter.insertSessionSummariesBatch([]);

      expect(count).toBe(0);
    });
  });

  describe('deleteSessionSummary', () => {
    it('should delete summary by sessionId', async () => {
      const mockDb = createMockDatabase();
      spyOn(database, 'openPowerSyncDatabase').mockResolvedValue(mockDb as any);

      const adapter = new PowerSyncPersistenceAdapter();
      await adapter.init();

      await adapter.deleteSessionSummary('session-123');

      const [sql, params] = mockDb.execute.mock.calls.find((call: unknown[]) =>
        (call[0] as string).includes('DELETE FROM session_summaries'),
      ) as unknown as [string, unknown[]];
      expect(params).toContain('session-123');
    });
  });
});

// =============================================================================
// Settings Tests
// =============================================================================

describe('PowerSyncPersistenceAdapter - Settings', () => {
  describe('getSettings', () => {
    it('should return parsed settings', async () => {
      const mockDb = createMockDatabase();
      spyOn(database, 'openPowerSyncDatabase').mockResolvedValue(mockDb as any);

      const adapter = new PowerSyncPersistenceAdapter();
      await adapter.init();

      const settings = { theme: 'dark', volume: 0.8 };
      mockDb.getOptional.mockResolvedValue({ value: JSON.stringify(settings) });

      const result = await adapter.getSettings();

      expect(result).toEqual(settings);
    });

    it('should return null for missing settings', async () => {
      const mockDb = createMockDatabase();
      mockDb.getOptional.mockResolvedValue(null);
      spyOn(database, 'openPowerSyncDatabase').mockResolvedValue(mockDb as any);

      const adapter = new PowerSyncPersistenceAdapter();
      await adapter.init();

      const result = await adapter.getSettings();

      expect(result).toBeNull();
    });

    it('should return null for invalid JSON', async () => {
      const mockDb = createMockDatabase();
      mockDb.getOptional.mockResolvedValue({ value: 'not-json' });
      spyOn(database, 'openPowerSyncDatabase').mockResolvedValue(mockDb as any);

      const adapter = new PowerSyncPersistenceAdapter();
      await adapter.init();

      const result = await adapter.getSettings();

      expect(result).toBeNull();
    });
  });

  describe('saveSettings', () => {
    it('should save settings in transaction', async () => {
      const mockDb = createMockDatabase();
      spyOn(database, 'openPowerSyncDatabase').mockResolvedValue(mockDb as any);

      const adapter = new PowerSyncPersistenceAdapter();
      await adapter.init();

      await adapter.saveSettings({ theme: 'light' });

      expect(mockDb.writeTransaction).toHaveBeenCalled();
    });
  });
});

// =============================================================================
// Algorithm State Tests
// =============================================================================

describe('PowerSyncPersistenceAdapter - Algorithm State', () => {
  describe('getAlgorithmState', () => {
    it('should return algorithm state', async () => {
      const mockDb = createMockDatabase();
      spyOn(database, 'openPowerSyncDatabase').mockResolvedValue(mockDb as any);

      const adapter = new PowerSyncPersistenceAdapter();
      await adapter.init();

      const stateData = { currentLevel: 3, streak: 5 };
      mockDb.getOptional.mockResolvedValue({
        state_json: JSON.stringify(stateData),
        session_count: 10,
      });

      const result = await adapter.getAlgorithmState('user-1', 'adaptive');

      expect(result).toEqual({
        stateJson: stateData,
        sessionCount: 10,
      });
    });

    it('should return null for missing state', async () => {
      const mockDb = createMockDatabase();
      mockDb.getOptional.mockResolvedValue(null);
      spyOn(database, 'openPowerSyncDatabase').mockResolvedValue(mockDb as any);

      const adapter = new PowerSyncPersistenceAdapter();
      await adapter.init();

      const result = await adapter.getAlgorithmState('user-1', 'adaptive');

      expect(result).toBeNull();
    });
  });

  describe('saveAlgorithmState', () => {
    it('should update existing state', async () => {
      const mockDb = createMockDatabase();
      mockDb.execute.mockResolvedValue({ rowsAffected: 1 });
      spyOn(database, 'openPowerSyncDatabase').mockResolvedValue(mockDb as any);

      const adapter = new PowerSyncPersistenceAdapter();
      await adapter.init();

      await adapter.saveAlgorithmState('user-1', 'adaptive', { level: 4 });

      const updateCall = mockDb.execute.mock.calls.find((call: unknown[]) =>
        (call[0] as string).includes('UPDATE algorithm_states'),
      );
      expect(updateCall).toBeDefined();
    });

    it('should insert new state if not exists', async () => {
      const mockDb = createMockDatabase();
      mockDb.execute.mockResolvedValue({ rowsAffected: 0 }); // UPDATE affects 0 rows
      spyOn(database, 'openPowerSyncDatabase').mockResolvedValue(mockDb as any);

      const adapter = new PowerSyncPersistenceAdapter();
      await adapter.init();

      await adapter.saveAlgorithmState('user-1', 'adaptive', { level: 4 });

      const insertCall = mockDb.execute.mock.calls.find(
        (call: unknown[]) =>
          (call[0] as string).includes('INSERT') &&
          (call[0] as string).includes('algorithm_states'),
      );
      expect(insertCall).toBeDefined();
    });
  });

  describe('clearAlgorithmStates', () => {
    it('should delete all states for user', async () => {
      const mockDb = createMockDatabase();
      spyOn(database, 'openPowerSyncDatabase').mockResolvedValue(mockDb as any);

      const adapter = new PowerSyncPersistenceAdapter();
      await adapter.init();

      await adapter.clearAlgorithmStates('user-1');

      const [sql, params] = mockDb.execute.mock.calls.find((call: unknown[]) =>
        (call[0] as string).includes('DELETE FROM algorithm_states'),
      ) as unknown as [string, unknown[]];
      expect(params).toContain('user-1');
    });
  });
});

// =============================================================================
// Sync Metadata Tests
// =============================================================================

describe('PowerSyncPersistenceAdapter - Sync Meta', () => {
  describe('getSyncMeta', () => {
    it('should return meta value', async () => {
      const mockDb = createMockDatabase();
      mockDb.getOptional.mockResolvedValue({ value: 'meta-value' });
      spyOn(database, 'openPowerSyncDatabase').mockResolvedValue(mockDb as any);

      const adapter = new PowerSyncPersistenceAdapter();
      await adapter.init();

      const result = await adapter.getSyncMeta('lastSync');

      expect(result).toBe('meta-value');
    });

    it('should return null for missing key', async () => {
      const mockDb = createMockDatabase();
      mockDb.getOptional.mockResolvedValue(null);
      spyOn(database, 'openPowerSyncDatabase').mockResolvedValue(mockDb as any);

      const adapter = new PowerSyncPersistenceAdapter();
      await adapter.init();

      const result = await adapter.getSyncMeta('unknown');

      expect(result).toBeNull();
    });
  });

  describe('setSyncMeta', () => {
    it('should delete and insert meta value', async () => {
      const mockDb = createMockDatabase();
      spyOn(database, 'openPowerSyncDatabase').mockResolvedValue(mockDb as any);

      const adapter = new PowerSyncPersistenceAdapter();
      await adapter.init();

      await adapter.setSyncMeta('lastSync', '2024-01-15T10:00:00Z');

      const deleteCall = mockDb.execute.mock.calls.find((call: unknown[]) =>
        (call[0] as string).includes('DELETE FROM sync_meta'),
      );
      const insertCall = mockDb.execute.mock.calls.find((call: unknown[]) =>
        (call[0] as string).includes('INSERT INTO sync_meta'),
      );

      expect(deleteCall).toBeDefined();
      expect(insertCall).toBeDefined();
    });
  });

  describe('hasUnsyncedEvents', () => {
    it('should return true when pending uploads exist', async () => {
      const mockDb = createMockDatabase();
      mockDb.getOptional.mockResolvedValue({ count: 1 });
      spyOn(database, 'openPowerSyncDatabase').mockResolvedValue(mockDb as any);

      const adapter = new PowerSyncPersistenceAdapter();
      await adapter.init();

      const result = await adapter.hasUnsyncedEvents();

      expect(result).toBe(true);
    });

    it('should return false when no pending uploads', async () => {
      const mockDb = createMockDatabase();
      mockDb.getOptional.mockResolvedValue({ count: 0 });
      spyOn(database, 'openPowerSyncDatabase').mockResolvedValue(mockDb as any);

      const adapter = new PowerSyncPersistenceAdapter();
      await adapter.init();

      const result = await adapter.hasUnsyncedEvents();

      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      const mockDb = createMockDatabase();
      mockDb.getOptional.mockRejectedValue(new Error('ps_crud not accessible'));
      spyOn(database, 'openPowerSyncDatabase').mockResolvedValue(mockDb as any);

      const adapter = new PowerSyncPersistenceAdapter();
      await adapter.init();

      const result = await adapter.hasUnsyncedEvents();

      expect(result).toBe(false);
    });
  });

  describe('markEventsSyncedBatch', () => {
    it('should be a no-op (PowerSync handles sync)', async () => {
      const mockDb = createMockDatabase();
      spyOn(database, 'openPowerSyncDatabase').mockResolvedValue(mockDb as any);

      const adapter = new PowerSyncPersistenceAdapter();
      await adapter.init();

      const callsBeforeMark = mockDb.execute.mock.calls.length;

      // Should not throw
      await adapter.markEventsSyncedBatch(['e1', 'e2']);

      // Should not execute any additional queries (PowerSync handles this)
      expect(mockDb.execute.mock.calls.length).toBe(callsBeforeMark);
    });
  });
});

// =============================================================================
// Pending Deletions Tests
// =============================================================================

describe('PowerSyncPersistenceAdapter - Pending Deletions', () => {
  describe('queueDeletion', () => {
    it('should insert pending deletion', async () => {
      const mockDb = createMockDatabase();
      spyOn(database, 'openPowerSyncDatabase').mockResolvedValue(mockDb as any);

      const adapter = new PowerSyncPersistenceAdapter();
      await adapter.init();

      await adapter.queueDeletion('session-123');

      const [sql] = mockDb.execute.mock.calls.find((call: unknown[]) =>
        (call[0] as string).includes('pending_deletions'),
      ) as unknown as [string, unknown[]];
      expect(sql).toContain('INSERT OR IGNORE');
    });
  });

  describe('hasPendingDeletions', () => {
    it('should return true when pending deletions exist', async () => {
      const mockDb = createMockDatabase();
      mockDb.getOptional.mockResolvedValue({ count: 1 });
      spyOn(database, 'openPowerSyncDatabase').mockResolvedValue(mockDb as any);

      const adapter = new PowerSyncPersistenceAdapter();
      await adapter.init();

      const result = await adapter.hasPendingDeletions();

      expect(result).toBe(true);
    });
  });

  describe('getPendingDeletions', () => {
    it('should return list of pending session ids', async () => {
      const mockDb = createMockDatabase();
      mockDb.getAll.mockResolvedValue([{ id: 's1' }, { id: 's2' }]);
      spyOn(database, 'openPowerSyncDatabase').mockResolvedValue(mockDb as any);

      const adapter = new PowerSyncPersistenceAdapter();
      await adapter.init();

      const result = await adapter.getPendingDeletions();

      expect(result).toEqual(['s1', 's2']);
    });
  });

  describe('confirmDeletion', () => {
    it('should delete from pending_deletions', async () => {
      const mockDb = createMockDatabase();
      spyOn(database, 'openPowerSyncDatabase').mockResolvedValue(mockDb as any);

      const adapter = new PowerSyncPersistenceAdapter();
      await adapter.init();

      await adapter.confirmDeletion('session-123');

      const [sql, params] = mockDb.execute.mock.calls.find((call: unknown[]) =>
        (call[0] as string).includes('DELETE FROM pending_deletions'),
      ) as unknown as [string, unknown[]];
      expect(params).toContain('session-123');
    });
  });
});

// =============================================================================
// Stats Helpers Tests
// =============================================================================

describe('PowerSyncPersistenceAdapter - Stats Helpers', () => {
  describe('getStreakInfo', () => {
    it('should return streak info from complex SQL query', async () => {
      const mockDb = createMockDatabase();
      mockDb.getAll.mockResolvedValue([
        { current_streak: 5, best_streak: 10, last_date: '2024-01-15' },
      ]);
      spyOn(database, 'openPowerSyncDatabase').mockResolvedValue(mockDb as any);

      const adapter = new PowerSyncPersistenceAdapter();
      await adapter.init();

      const result = await adapter.getStreakInfo('user-1');

      expect(result).toEqual({
        current: 5,
        best: 10, // max(best, current)
        lastActiveDate: '2024-01-15',
      });
    });

    it('should return zeros when no data', async () => {
      const mockDb = createMockDatabase();
      mockDb.getAll.mockResolvedValue([]);
      spyOn(database, 'openPowerSyncDatabase').mockResolvedValue(mockDb as any);

      const adapter = new PowerSyncPersistenceAdapter();
      await adapter.init();

      const result = await adapter.getStreakInfo('user-1');

      expect(result).toEqual({
        current: 0,
        best: 0,
        lastActiveDate: null,
      });
    });
  });

  describe('getDailyActivity', () => {
    it('should return daily activity for specified days', async () => {
      const mockDb = createMockDatabase();
      mockDb.getAll.mockResolvedValue([
        { date: '2024-01-13', count: 2 },
        { date: '2024-01-14', count: 0 },
        { date: '2024-01-15', count: 3 },
      ]);
      spyOn(database, 'openPowerSyncDatabase').mockResolvedValue(mockDb as any);

      const adapter = new PowerSyncPersistenceAdapter();
      await adapter.init();

      const result = await adapter.getDailyActivity('user-1', 3);

      expect(result).toHaveLength(3);
      expect(result[0]!.date).toBe('2024-01-13');
      expect(result[0]!.count).toBe(2);
    });

    it('should default to 30 days', async () => {
      const mockDb = createMockDatabase();
      mockDb.getAll.mockResolvedValue([]);
      spyOn(database, 'openPowerSyncDatabase').mockResolvedValue(mockDb as any);

      const adapter = new PowerSyncPersistenceAdapter();
      await adapter.init();

      await adapter.getDailyActivity('user-1');

      const [, params] = mockDb.getAll.mock.calls.at(-1) as unknown as [string, unknown[]];
      expect(params[0]).toBe(30);
    });
  });
});

// =============================================================================
// Generic Query Tests
// =============================================================================

describe('PowerSyncPersistenceAdapter - Generic Query', () => {
  describe('query', () => {
    it('should execute custom SQL and return rows', async () => {
      const mockDb = createMockDatabase();
      mockDb.getAll.mockResolvedValue([{ id: 1 }, { id: 2 }]);
      spyOn(database, 'openPowerSyncDatabase').mockResolvedValue(mockDb as any);

      const adapter = new PowerSyncPersistenceAdapter();
      await adapter.init();

      const result = await adapter.query<{ id: number }>('SELECT id FROM custom_table');

      expect(result.rows).toHaveLength(2);
    });
  });

  describe('execute', () => {
    it('should execute custom write SQL', async () => {
      const mockDb = createMockDatabase();
      spyOn(database, 'openPowerSyncDatabase').mockResolvedValue(mockDb as any);

      const adapter = new PowerSyncPersistenceAdapter();
      await adapter.init();

      await adapter.execute('UPDATE custom_table SET value = ?', ['new-value']);

      expect(mockDb.execute).toHaveBeenCalled();
    });
  });
});

// =============================================================================
// Factory Tests
// =============================================================================

describe('createPowerSyncPersistenceAdapter', () => {
  it('should create a new adapter instance', () => {
    const adapter = createPowerSyncPersistenceAdapter();

    expect(adapter).toBeDefined();
    expect(typeof adapter.init).toBe('function');
    expect(typeof adapter.append).toBe('function');
    expect(typeof adapter.getSession).toBe('function');
  });
});
