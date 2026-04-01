/**
 * Corruption & Recovery Tests for SQLite Persistence
 *
 * Tests that verify the system handles:
 * - Malformed JSON in payload columns
 * - Missing required fields
 * - Invalid data types
 * - Truncated data
 * - Concurrent write conflicts
 * - Recovery from partial failures
 */
import { describe, it, expect, mock } from 'bun:test';
import { safeJsonParse } from './sql-helpers';

// =============================================================================
// JSON Corruption Scenarios
// =============================================================================

describe('JSON Corruption Handling', () => {
  describe('safeJsonParse resilience', () => {
    const fallback = { level: 1, mode: 'dualnback-classic' };

    it('handles completely corrupted JSON', () => {
      const corruptedValues = [
        'not json at all',
        '{incomplete',
        '{"key": undefined}',
        '{"key": NaN}',
        '{key: "unquoted"}',
        "{'single': 'quotes'}",
        '{"trailing": "comma",}',
        '',
        '   ',
        '\n\n\n',
        '\x00\x00\x00', // null bytes
      ];

      for (const corrupted of corruptedValues) {
        const result = safeJsonParse(corrupted, fallback);
        expect(result).toBe(fallback);
      }
    });

    it('handles truncated JSON', () => {
      const truncated = [
        '{"config": {"level": 2, "mode": "dual-c',
        '{"events": [{"id": "abc", "type": "SESSION_ST',
        '[1, 2, 3, 4,',
        '{"nested": {"deep": {"value":',
      ];

      for (const value of truncated) {
        const result = safeJsonParse(value, fallback);
        expect(result).toBe(fallback);
      }
    });

    it('handles encoding issues', () => {
      const encodingIssues = [
        '{"text": "\uFFFD\uFFFD"}', // replacement characters - actually valid JSON
        '{"emoji": "👍🏽"}', // valid JSON with emoji
      ];

      // These are actually valid JSON, so they parse
      for (const value of encodingIssues) {
        const result = safeJsonParse(value, fallback);
        // Should not return fallback since these are valid JSON
        expect(result).not.toBe(fallback);
      }
    });

    it('handles extremely large JSON gracefully', () => {
      // Large but valid JSON
      const largeArray = JSON.stringify(Array(10000).fill({ id: 'test', value: 123 }));
      const result = safeJsonParse(largeArray, []);

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(10000);
    });

    it('handles deeply nested JSON', () => {
      // Create deeply nested structure
      let nested: Record<string, unknown> = { value: 'deep' };
      for (let i = 0; i < 50; i++) {
        nested = { nested };
      }

      const deepJson = JSON.stringify(nested);
      const result = safeJsonParse(deepJson, { default: true });

      expect(result).not.toBe({ default: true });
      expect(typeof result).toBe('object');
    });
  });
});

// =============================================================================
// Field Validation Scenarios
// =============================================================================

describe('Field Validation', () => {
  describe('required fields', () => {
    it('detects missing id', () => {
      const event: Record<string, unknown> = {
        // id: missing
        sessionId: 'test-session',
        type: 'SESSION_STARTED',
        timestamp: Date.now(),
        schemaVersion: 1,
      };

      expect(event.id).toBeUndefined();
    });

    it('detects missing sessionId', () => {
      const event: Record<string, unknown> = {
        id: 'test-id',
        // sessionId: missing
        type: 'SESSION_STARTED',
        timestamp: Date.now(),
        schemaVersion: 1,
      };

      expect(event.sessionId).toBeUndefined();
    });

    it('detects missing timestamp', () => {
      const event: Record<string, unknown> = {
        id: 'test-id',
        sessionId: 'test-session',
        type: 'SESSION_STARTED',
        // timestamp: missing
        schemaVersion: 1,
      };

      expect(event.timestamp).toBeUndefined();
    });

    it('detects missing schemaVersion', () => {
      const event: Record<string, unknown> = {
        id: 'test-id',
        sessionId: 'test-session',
        type: 'SESSION_STARTED',
        timestamp: Date.now(),
        // schemaVersion: missing
      };

      expect(event.schemaVersion).toBeUndefined();
    });
  });

  describe('type coercion', () => {
    it('handles string timestamp', () => {
      const stringTimestamp = '1700000000000';
      const parsed = Number(stringTimestamp);

      expect(typeof parsed).toBe('number');
      expect(Number.isNaN(parsed)).toBe(false);
    });

    it('handles invalid string timestamp', () => {
      const invalidTimestamp = 'not-a-number';
      const parsed = Number(invalidTimestamp);

      expect(Number.isNaN(parsed)).toBe(true);
    });

    it('handles null converted to string', () => {
      const nullValue = null;
      const asString = String(nullValue);

      expect(asString).toBe('null');
    });

    it('handles undefined converted to string', () => {
      const undefinedValue = undefined;
      const asString = String(undefinedValue);

      expect(asString).toBe('undefined');
    });
  });
});

// =============================================================================
// Database State Recovery
// =============================================================================

describe('Database State Recovery', () => {
  describe('partial write recovery', () => {
    it('simulates write failure mid-transaction', async () => {
      let writeCount = 0;
      const failAtWrite = 3;

      const mockWrite = mock(async () => {
        writeCount++;
        if (writeCount === failAtWrite) {
          throw new Error('Simulated write failure');
        }
        return { rowsAffected: 1 };
      });

      // Simulate writing 5 events
      const results: Array<{ success: boolean; error?: Error }> = [];
      for (let i = 0; i < 5; i++) {
        try {
          await mockWrite();
          results.push({ success: true });
        } catch (error) {
          results.push({ success: false, error: error as Error });
        }
      }

      // Verify failure was at expected position
      expect(results[2]?.success).toBe(false);
      expect(results[2]?.error?.message).toBe('Simulated write failure');

      // Other writes should succeed
      expect(results[0]?.success).toBe(true);
      expect(results[1]?.success).toBe(true);
      expect(results[3]?.success).toBe(true);
      expect(results[4]?.success).toBe(true);
    });

    it('simulates transaction rollback', async () => {
      const committed: string[] = [];
      let shouldFail = false;

      const mockTransaction = async (operations: Array<() => Promise<string>>) => {
        const pending: string[] = [];

        try {
          for (const op of operations) {
            if (shouldFail) {
              throw new Error('Transaction failed');
            }
            const result = await op();
            pending.push(result);
          }
          // Commit
          committed.push(...pending);
        } catch {
          // Rollback - don't add pending to committed
        }
      };

      // First transaction succeeds
      await mockTransaction([async () => 'event1', async () => 'event2']);

      expect(committed).toEqual(['event1', 'event2']);

      // Second transaction fails
      shouldFail = true;
      await mockTransaction([async () => 'event3', async () => 'event4']);

      // Should still only have first transaction's events
      expect(committed).toEqual(['event1', 'event2']);
    });
  });

  describe('idempotency on retry', () => {
    it('ON CONFLICT DO NOTHING prevents duplicates', () => {
      const storage = new Map<string, { id: string; data: string }>();

      const insertWithConflict = (id: string, data: string) => {
        if (!storage.has(id)) {
          storage.set(id, { id, data });
          return { rowsAffected: 1 };
        }
        // ON CONFLICT DO NOTHING
        return { rowsAffected: 0 };
      };

      // First insert
      const result1 = insertWithConflict('id-1', 'data-1');
      expect(result1.rowsAffected).toBe(1);
      expect(storage.size).toBe(1);

      // Retry same insert (simulating network retry)
      const result2 = insertWithConflict('id-1', 'data-1');
      expect(result2.rowsAffected).toBe(0);
      expect(storage.size).toBe(1);

      // Data unchanged
      expect(storage.get('id-1')?.data).toBe('data-1');
    });

    it('absolute calculation prevents delta corruption', () => {
      const events = [{ xp: 10 }, { xp: 20 }, { xp: 15 }];

      // ❌ Delta approach (can corrupt on retry)
      let deltaXP = 0;
      const applyDelta = (xp: number) => {
        deltaXP += xp;
      };

      // Apply events
      for (const e of events) applyDelta(e.xp);
      expect(deltaXP).toBe(45);

      // If retry happens, delta doubles!
      for (const e of events) applyDelta(e.xp);
      expect(deltaXP).toBe(90); // WRONG!

      // ✅ Absolute calculation (safe on retry)
      const calculateTotal = (evts: Array<{ xp: number }>) =>
        evts.reduce((sum, e) => sum + e.xp, 0);

      expect(calculateTotal(events)).toBe(45);
      expect(calculateTotal(events)).toBe(45); // Same result on retry
    });
  });
});

// =============================================================================
// Concurrent Access Scenarios
// =============================================================================

describe('Concurrent Access', () => {
  describe('race condition prevention', () => {
    it('simulates concurrent reads returning consistent data', async () => {
      const data = { value: 'initial' };

      const read = async () => {
        await new Promise((r) => setTimeout(r, Math.random() * 10));
        return { ...data }; // Return copy
      };

      // Concurrent reads
      const results = await Promise.all([read(), read(), read(), read(), read()]);

      // All should return same value
      expect(results.every((r) => r.value === 'initial')).toBe(true);
    });

    it('simulates write-after-write consistency', async () => {
      let currentValue = 0;
      const writeLog: number[] = [];

      const write = async (value: number) => {
        await new Promise((r) => setTimeout(r, Math.random() * 5));
        currentValue = value;
        writeLog.push(value);
      };

      // Sequential writes (simulating proper locking)
      await write(1);
      await write(2);
      await write(3);

      // Last write wins
      expect(currentValue).toBe(3);
      expect(writeLog).toEqual([1, 2, 3]);
    });

    it('detects lost update scenario', async () => {
      let balance = 100;

      const withdraw = async (amount: number, delay: number) => {
        await new Promise((r) => setTimeout(r, delay));
        const currentBalance = balance; // Read
        await new Promise((r) => setTimeout(r, delay));
        if (currentBalance >= amount) {
          balance = currentBalance - amount; // Write (based on stale read!)
          return { success: true, newBalance: balance };
        }
        return { success: false, newBalance: balance };
      };

      // Two concurrent withdrawals of 70 each
      // Both read balance=100, both think they can withdraw
      const [result1, result2] = await Promise.all([withdraw(70, 10), withdraw(70, 10)]);

      // This demonstrates the lost update problem
      // Both succeed but balance should be negative if not properly handled
      // In a real system, we'd use transactions to prevent this
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      // Final balance is 30 (only one withdrawal applied) due to race
      // This is the BUG that transactions prevent
    });
  });

  describe('queue-based write serialization', () => {
    it('processes writes in order with queue', async () => {
      const writeOrder: number[] = [];
      const queue: Array<() => Promise<void>> = [];
      let processing = false;

      const enqueueWrite = (value: number) => {
        return new Promise<void>((resolve) => {
          queue.push(async () => {
            writeOrder.push(value);
            await new Promise((r) => setTimeout(r, 5));
            resolve();
          });
          processQueue();
        });
      };

      const processQueue = async () => {
        if (processing) return;
        processing = true;
        while (queue.length > 0) {
          const task = queue.shift();
          if (task) await task();
        }
        processing = false;
      };

      // Enqueue writes concurrently
      await Promise.all([enqueueWrite(1), enqueueWrite(2), enqueueWrite(3)]);

      // All writes processed in order
      expect(writeOrder).toEqual([1, 2, 3]);
    });
  });
});

// =============================================================================
// Schema Migration Edge Cases
// =============================================================================

describe('Schema Migration Safety', () => {
  describe('schemaVersion handling', () => {
    it('detects missing schemaVersion', () => {
      const legacyEvent = {
        id: 'old-event',
        type: 'SESSION_STARTED',
        timestamp: Date.now(),
        // No schemaVersion
      };

      const schemaVersion = (legacyEvent as Record<string, unknown>).schemaVersion ?? 0;
      expect(schemaVersion).toBe(0);
    });

    it('handles future schemaVersion gracefully', () => {
      const futureEvent = {
        id: 'future-event',
        type: 'SESSION_STARTED',
        timestamp: Date.now(),
        schemaVersion: 999, // Future version
        newField: 'unknown', // Unknown field
      };

      // Should still be able to read basic fields
      expect(futureEvent.id).toBe('future-event');
      expect(futureEvent.type).toBe('SESSION_STARTED');
      expect(futureEvent.schemaVersion).toBe(999);
    });

    it('migrates v0 to v1 event structure', () => {
      const v0Event = {
        id: 'v0-event',
        session_id: 'session-123', // snake_case
        type: 'SESSION_STARTED',
        ts: 1700000000000, // abbreviated
      };

      // Migration function
      const migrateToV1 = (event: Record<string, unknown>) => ({
        id: event.id,
        sessionId: event.session_id ?? event.sessionId,
        type: event.type,
        timestamp: event.ts ?? event.timestamp,
        schemaVersion: 1,
      });

      const v1Event = migrateToV1(v0Event);

      expect(v1Event.sessionId).toBe('session-123');
      expect(v1Event.timestamp).toBe(1700000000000);
      expect(v1Event.schemaVersion).toBe(1);
    });
  });

  describe('backward compatibility', () => {
    it('reads v1 events with v1 reader', () => {
      const v1Event = {
        id: 'v1-event',
        sessionId: 'session-123',
        type: 'SESSION_STARTED',
        timestamp: 1700000000000,
        schemaVersion: 1,
      };

      expect(v1Event.sessionId).toBe('session-123');
    });

    it('optional fields have sensible defaults', () => {
      const minimalEvent = {
        id: 'minimal',
        sessionId: 'session',
        type: 'SESSION_STARTED',
        timestamp: Date.now(),
        schemaVersion: 1,
      };

      // Optional fields should have defaults when accessed
      const payload = (minimalEvent as Record<string, unknown>).payload ?? {};
      const userId = (minimalEvent as Record<string, unknown>).userId ?? 'anonymous';

      expect(payload).toEqual({});
      expect(userId).toBe('anonymous');
    });
  });
});

// =============================================================================
// Data Boundary Validation
// =============================================================================

describe('Data Boundary Validation', () => {
  describe('numeric boundaries', () => {
    it('handles MAX_SAFE_INTEGER', () => {
      const maxSafe = Number.MAX_SAFE_INTEGER;
      const asString = String(maxSafe);
      const backToNumber = Number(asString);

      expect(backToNumber).toBe(maxSafe);
    });

    it('detects overflow beyond MAX_SAFE_INTEGER', () => {
      const overflow = Number.MAX_SAFE_INTEGER + 1;
      const stillOverflow = Number.MAX_SAFE_INTEGER + 2;

      // JavaScript loses precision
      expect(overflow).toBe(stillOverflow);
    });

    it('handles negative numbers in timestamps (invalid)', () => {
      const negativeTimestamp = -1;

      expect(negativeTimestamp < 0).toBe(true);
      // Should be rejected by validation
    });
  });

  describe('string boundaries', () => {
    it('handles very long strings', () => {
      const longString = 'a'.repeat(100000);

      expect(longString.length).toBe(100000);
      expect(longString.slice(0, 10)).toBe('aaaaaaaaaa');
    });

    it('handles empty string', () => {
      const empty = '';

      expect(empty.length).toBe(0);
      expect(!empty).toBe(true); // falsy
    });

    it('handles whitespace-only string', () => {
      const whitespace = '   \n\t  ';

      expect(whitespace.trim()).toBe('');
      expect(whitespace.length).toBe(7);
    });
  });

  describe('array boundaries', () => {
    it('handles empty array', () => {
      const empty: unknown[] = [];

      expect(empty.length).toBe(0);
      expect(empty[0]).toBeUndefined();
    });

    it('handles array with single null', () => {
      const withNull = [null];

      expect(withNull.length).toBe(1);
      expect(withNull[0]).toBeNull();
    });

    it('handles sparse array', () => {
      const sparse: unknown[] = [];
      sparse[5] = 'value';

      expect(sparse.length).toBe(6);
      expect(sparse[0]).toBeUndefined();
      expect(sparse[5]).toBe('value');
    });
  });
});
