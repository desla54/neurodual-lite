import { describe, expect, it, beforeEach } from 'bun:test';
import type { SQL } from 'drizzle-orm';
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core';
import * as replayRecoveryModule from './replay-recovery';
import type { PersistencePort, ReplayRecoverySnapshot } from '@neurodual/logic';
import type { NeuroDualDrizzleDatabase } from '../db/drizzle';

// Shared storage for localStorage mock
const mockStorage: { data: Record<string, string> } = { data: {} };

// Reassign localStorage directly on globalThis
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (key: string): string | null => mockStorage.data[key] ?? null,
  setItem: (key: string, value: string): void => {
    mockStorage.data[key] = value;
  },
  removeItem: (key: string): void => {
    delete mockStorage.data[key];
  },
  clear: (): void => {
    mockStorage.data = {};
  },
  length: 0,
  key: (): null => null,
};

const sqliteDialect = new SQLiteSyncDialect();

function withDrizzleDb<
  T extends {
    query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
    execute: (sql: string, params?: unknown[]) => Promise<void>;
  },
>(persistence: T): T & { getDrizzleDb: () => NeuroDualDrizzleDatabase } {
  const drizzleDb = {
    all: async <R extends object>(statement: SQL): Promise<readonly R[]> => {
      const compiled = sqliteDialect.sqlToQuery(statement);
      const result = await persistence.query(compiled.sql, [...compiled.params]);
      return result.rows as readonly R[];
    },
    get: async <R extends object>(statement: SQL): Promise<R | undefined> => {
      const compiled = sqliteDialect.sqlToQuery(statement);
      const result = await persistence.query(compiled.sql, [...compiled.params]);
      return result.rows[0] as R | undefined;
    },
    run: async (statement: SQL): Promise<void> => {
      const compiled = sqliteDialect.sqlToQuery(statement);
      await persistence.execute(compiled.sql, [...compiled.params]);
    },
  } as unknown as NeuroDualDrizzleDatabase;

  return {
    ...persistence,
    getDrizzleDb: () => drizzleDb,
  };
}

describe('replay-recovery', () => {
  const {
    saveReplayRecoverySnapshot,
    loadReplayRecoverySnapshot,
    clearReplayRecoverySnapshot,
    checkForRecoverableReplay,
    hasReplayRecoverySnapshot,
    createReplayRecoverySnapshot,
  } = replayRecoveryModule;

  const createValidSnapshot = (
    overrides: Partial<ReplayRecoverySnapshot> = {},
  ): ReplayRecoverySnapshot => ({
    runId: 'run-123',
    sessionId: 'session-456',
    sessionType: 'tempo',
    parentRunId: null,
    currentTimeMs: 5000,
    currentTrialIndex: 3,
    speed: 1,
    timestamp: Date.now(),
    ...overrides,
  });

  beforeEach(() => {
    // Clear storage before each test
    mockStorage.data = {};
  });

  describe('saveReplayRecoverySnapshot', () => {
    it('should save snapshot to localStorage', () => {
      const snapshot = createValidSnapshot();
      saveReplayRecoverySnapshot(snapshot);

      expect(mockStorage.data['nd_replay_recovery']).toBeDefined();
      const stored = JSON.parse(mockStorage.data['nd_replay_recovery']!);
      expect(stored.runId).toBe('run-123');
      expect(stored.sessionId).toBe('session-456');
    });
  });

  describe('loadReplayRecoverySnapshot', () => {
    it('should return null when no snapshot exists', () => {
      const result = loadReplayRecoverySnapshot();
      expect(result).toBeNull();
    });

    it('should load valid snapshot', () => {
      const snapshot = createValidSnapshot();
      mockStorage.data['nd_replay_recovery'] = JSON.stringify(snapshot);

      const result = loadReplayRecoverySnapshot();

      expect(result).not.toBeNull();
      expect(result?.runId).toBe('run-123');
      expect(result?.sessionType).toBe('tempo');
    });

    it('should return null for invalid JSON', () => {
      mockStorage.data['nd_replay_recovery'] = 'invalid-json';

      const result = loadReplayRecoverySnapshot();
      expect(result).toBeNull();
    });

    it('should return null and clear snapshot without runId', () => {
      mockStorage.data['nd_replay_recovery'] = JSON.stringify({
        sessionId: 'session-456',
        sessionType: 'tempo',
      });

      const result = loadReplayRecoverySnapshot();

      expect(result).toBeNull();
      expect(mockStorage.data['nd_replay_recovery']).toBeUndefined();
    });

    it('should return null and clear snapshot without sessionId', () => {
      mockStorage.data['nd_replay_recovery'] = JSON.stringify({
        runId: 'run-123',
        sessionType: 'tempo',
      });

      const result = loadReplayRecoverySnapshot();

      expect(result).toBeNull();
      expect(mockStorage.data['nd_replay_recovery']).toBeUndefined();
    });

    it('should return null and clear snapshot without sessionType', () => {
      mockStorage.data['nd_replay_recovery'] = JSON.stringify({
        runId: 'run-123',
        sessionId: 'session-456',
      });

      const result = loadReplayRecoverySnapshot();

      expect(result).toBeNull();
    });
  });

  describe('clearReplayRecoverySnapshot', () => {
    it('should remove snapshot from localStorage', () => {
      mockStorage.data['nd_replay_recovery'] = 'some-data';

      clearReplayRecoverySnapshot();

      expect(mockStorage.data['nd_replay_recovery']).toBeUndefined();
    });
  });

  describe('checkForRecoverableReplay', () => {
    it('should return hasSession: false when no snapshot', () => {
      const result = checkForRecoverableReplay();

      expect(result.hasSession).toBe(false);
      expect(result.snapshot).toBeNull();
      expect(result.isStale).toBe(false);
    });

    it('should return hasSession: true for fresh snapshot', () => {
      const snapshot = createValidSnapshot({ timestamp: Date.now() });
      mockStorage.data['nd_replay_recovery'] = JSON.stringify(snapshot);

      const result = checkForRecoverableReplay();

      expect(result.hasSession).toBe(true);
      expect(result.snapshot).not.toBeNull();
      expect(result.isStale).toBe(false);
    });

    it('should return isStale: true for snapshot older than 30 minutes', () => {
      const thirtyOneMinutesAgo = Date.now() - 31 * 60 * 1000;
      const snapshot = createValidSnapshot({ timestamp: thirtyOneMinutesAgo });
      mockStorage.data['nd_replay_recovery'] = JSON.stringify(snapshot);

      const result = checkForRecoverableReplay();

      expect(result.hasSession).toBe(true);
      expect(result.isStale).toBe(true);
    });

    it('should auto-clear expired snapshot (older than 2 hours)', () => {
      const threeHoursAgo = Date.now() - 3 * 60 * 60 * 1000;
      const snapshot = createValidSnapshot({ timestamp: threeHoursAgo });
      mockStorage.data['nd_replay_recovery'] = JSON.stringify(snapshot);

      const result = checkForRecoverableReplay();

      expect(result.hasSession).toBe(false);
      expect(mockStorage.data['nd_replay_recovery']).toBeUndefined();
    });
  });

  describe('hasReplayRecoverySnapshot', () => {
    it('should return false when no snapshot exists', () => {
      expect(hasReplayRecoverySnapshot()).toBe(false);
    });

    it('should return true when snapshot exists', () => {
      mockStorage.data['nd_replay_recovery'] = 'some-data';
      expect(hasReplayRecoverySnapshot()).toBe(true);
    });
  });

  describe('createReplayRecoverySnapshot', () => {
    it('should create snapshot with required fields', () => {
      const snapshot = createReplayRecoverySnapshot({
        runId: 'run-789',
        sessionId: 'session-101',
        sessionType: 'recall',
        parentRunId: null,
        currentTimeMs: 10000,
        currentTrialIndex: 5,
        speed: 1,
      });

      expect(snapshot.runId).toBe('run-789');
      expect(snapshot.sessionId).toBe('session-101');
      expect(snapshot.sessionType).toBe('recall');
      expect(snapshot.currentTimeMs).toBe(10000);
      expect(snapshot.currentTrialIndex).toBe(5);
      expect(snapshot.speed).toBe(1);
      expect(snapshot.timestamp).toBeLessThanOrEqual(Date.now());
    });

    it('should create snapshot with parent run ID', () => {
      const snapshot = createReplayRecoverySnapshot({
        runId: 'run-child',
        sessionId: 'session-101',
        sessionType: 'tempo',
        parentRunId: 'run-parent',
        currentTimeMs: 5000,
        currentTrialIndex: 2,
        speed: 2,
      });

      expect(snapshot.parentRunId).toBe('run-parent');
      expect(snapshot.speed).toBe(2);
    });

    it('should create snapshot with different speeds', () => {
      const halfSpeed = createReplayRecoverySnapshot({
        runId: 'run-1',
        sessionId: 'session-1',
        sessionType: 'flow',
        parentRunId: null,
        currentTimeMs: 0,
        currentTrialIndex: 0,
        speed: 0.5,
      });

      const doubleSpeed = createReplayRecoverySnapshot({
        runId: 'run-2',
        sessionId: 'session-2',
        sessionType: 'dual-pick',
        parentRunId: null,
        currentTimeMs: 0,
        currentTrialIndex: 0,
        speed: 2,
      });

      expect(halfSpeed.speed).toBe(0.5);
      expect(doubleSpeed.speed).toBe(2);
    });
  });

  describe('cleanupOrphanedRuns', () => {
    it('should delete orphaned runs in small SQL batches', async () => {
      const selectedBatches: string[][] = [];
      const executes: Array<{ sql: string; params: unknown[] }> = [];

      let batchIndex = 0;
      const drizzleDb = {
        select: () => ({
          from: () => ({
            where: () => ({
              orderBy: () => ({
                limit: async (_batchSize: number) => {
                  batchIndex += 1;
                  if (batchIndex === 1) {
                    selectedBatches.push(['r1', 'r2']);
                    return [{ id: 'r1' }, { id: 'r2' }];
                  }
                  if (batchIndex === 2) {
                    selectedBatches.push(['r3']);
                    return [{ id: 'r3' }];
                  }
                  selectedBatches.push([]);
                  return [];
                },
              }),
            }),
          }),
        }),
        run: async (statement: SQL) => {
          const compiled = sqliteDialect.sqlToQuery(statement);
          const sql = compiled.sql;
          const params = [...compiled.params];
          executes.push({ sql, params });
        },
      } as unknown as NeuroDualDrizzleDatabase;

      const persistence = {
        getDrizzleDb: () => drizzleDb,
      } as unknown as PersistencePort;

      const result = await replayRecoveryModule.cleanupOrphanedRuns(persistence, 60 * 60 * 1000);

      expect(result.deletedCount).toBe(3);
      expect(selectedBatches).toEqual([['r1', 'r2'], ['r3'], []]);
      expect(executes.length).toBe(6);
      expect(
        executes
          .filter((entry) => entry.sql.toLowerCase().includes('replay_events'))
          .map((e) => e.params[0]),
      ).toEqual(['r1', 'r2', 'r3']);
      expect(
        executes
          .filter((entry) => entry.sql.toLowerCase().includes('replay_runs'))
          .map((e) => e.params[0]),
      ).toEqual(['r1', 'r2', 'r3']);
    });
  });
});
