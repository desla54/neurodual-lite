import { describe, expect, it, mock } from 'bun:test';
import type { PersistencePort } from '@neurodual/logic';

import {
  clearAuthTransitionMigrationMeta,
  migrateLocalAlgorithmStates,
  migrateLocalEventsToAuthenticatedUser,
  migrateLocalNLevelProjection,
  migrateLocalUserIdSummaries,
  runAuthTransitionHistoryMigration,
} from './history-migration';
import { parseSessionIdFromStreamId } from '../es-emmett/stream-id';

interface EmtMessageRow {
  stream_id: string;
  message_kind: 'E' | 'L';
  is_archived: 0 | 1;
  message_data: string;
}

interface SummaryRow {
  session_id: string;
  user_id: string;
}

interface AlgorithmStateRow {
  id: string;
  user_id: string;
}

interface NLevelProjectionRow {
  id: string;
  user_id: string;
}

interface MockState {
  emtMessages: EmtMessageRow[];
  summaries: SummaryRow[];
  algorithmStates: AlgorithmStateRow[];
  nLevelProjections: NLevelProjectionRow[];
}

function isLocalUserId(value: string | null): boolean {
  return value === 'local' || value === '' || value === null;
}

function getSessionIdFromStreamId(streamId: string): string | null {
  return parseSessionIdFromStreamId(streamId);
}

function getUserIdFromMessageData(messageData: string): string | null {
  try {
    const parsed = JSON.parse(messageData) as { data?: { userId?: unknown } } | null;
    const userId = parsed?.data?.userId;
    if (userId === undefined || userId === null) return null;
    return String(userId);
  } catch {
    return null;
  }
}

function isLocalEventMessage(row: EmtMessageRow): boolean {
  if (row.message_kind !== 'E') return false;
  if (row.is_archived !== 0) return false;
  if (!parseSessionIdFromStreamId(row.stream_id)) return false;
  return isLocalUserId(getUserIdFromMessageData(row.message_data));
}

function isAuthenticatedEventMessage(row: EmtMessageRow, authenticatedUserId: string): boolean {
  if (row.message_kind !== 'E') return false;
  if (row.is_archived !== 0) return false;
  if (!parseSessionIdFromStreamId(row.stream_id)) return false;
  return getUserIdFromMessageData(row.message_data) === authenticatedUserId;
}

function createMessage(args: {
  sessionId: string;
  userId: string | null;
  isArchived?: 0 | 1;
  kind?: 'E' | 'L';
  id?: string;
  type?: string;
}): EmtMessageRow {
  const envelope = {
    id: args.id ?? crypto.randomUUID(),
    type: args.type ?? 'SESSION_ENDED',
    data: {
      userId: args.userId,
    },
  };

  return {
    stream_id: `session:${args.sessionId}`,
    message_kind: args.kind ?? 'E',
    is_archived: args.isArchived ?? 0,
    message_data: JSON.stringify(envelope),
  };
}

function patchMessageUserId(messageData: string, newUserId: string): string {
  const parsed = JSON.parse(messageData) as { data?: Record<string, unknown> };
  const data = parsed.data ?? {};
  data['userId'] = newUserId;
  parsed.data = data;
  return JSON.stringify(parsed);
}

function createMockPersistence(state: MockState): PersistencePort {
  const syncMeta = new Map<string, string>();

  const query = mock(async <T extends object>(sql: string, params: unknown[] = []) => {
    // getLocalOwnerSessionIds: SELECT DISTINCT ... session_id ... FROM emt_messages ... local
    if (
      sql.includes('SELECT DISTINCT') &&
      sql.includes('session_id') &&
      sql.includes('FROM emt_messages') &&
      sql.includes("json_extract(message_data, '$.data.userId') = 'local'")
    ) {
      const sessionIds = Array.from(
        new Set(
          state.emtMessages
            .filter(isLocalEventMessage)
            .map((row) => getSessionIdFromStreamId(row.stream_id))
            .filter((sessionId): sessionId is string => Boolean(sessionId)),
        ),
      );
      return { rows: sessionIds.map((session_id) => ({ session_id })) as T[] };
    }

    // getUserSessionIds: SELECT DISTINCT ... session_id ... FROM emt_messages ... userId = ?
    if (
      sql.includes('SELECT DISTINCT') &&
      sql.includes('session_id') &&
      sql.includes('FROM emt_messages') &&
      sql.includes("json_extract(message_data, '$.data.userId') = ?")
    ) {
      const authenticatedUserId = String(params[0] ?? '');
      const sessionIds = Array.from(
        new Set(
          state.emtMessages
            .filter((row) => isAuthenticatedEventMessage(row, authenticatedUserId))
            .map((row) => getSessionIdFromStreamId(row.stream_id))
            .filter((sessionId): sessionId is string => Boolean(sessionId)),
        ),
      );
      return { rows: sessionIds.map((session_id) => ({ session_id })) as T[] };
    }

    // countLocalOwnerEvents: COUNT(*) FROM emt_messages ... local/null/empty
    if (
      sql.includes('COUNT(*)') &&
      sql.includes('FROM emt_messages') &&
      sql.includes("json_extract(message_data, '$.data.userId') = 'local'")
    ) {
      const count = state.emtMessages.filter(isLocalEventMessage).length;
      return { rows: [{ count }] as T[] };
    }

    // localSummariesPending: COUNT(*) FROM session_summaries WHERE user_id = 'local' AND session_id IN (...)
    if (
      sql.includes('COUNT(*)') &&
      sql.includes('FROM session_summaries') &&
      sql.includes("user_id = 'local'")
    ) {
      // params are the session_id values from the IN clause
      const sessionIdSet = new Set(params.map(String));
      const count = state.summaries.filter(
        (summary) => summary.user_id === 'local' && sessionIdSet.has(summary.session_id),
      ).length;
      return { rows: [{ count }] as T[] };
    }

    // algorithm_states count
    if (
      sql.includes('COUNT(*)') &&
      sql.includes('FROM algorithm_states') &&
      sql.includes("user_id = 'local'")
    ) {
      const count = state.algorithmStates.filter((r) => r.user_id === 'local').length;
      return { rows: [{ count }] as T[] };
    }

    // n_level_projection count
    if (
      sql.includes('COUNT(*)') &&
      sql.includes('FROM n_level_projection') &&
      sql.includes("user_id = 'local'")
    ) {
      const count = state.nLevelProjections.filter((r) => r.user_id === 'local').length;
      return { rows: [{ count }] as T[] };
    }

    throw new Error(`Unexpected query in test mock: ${sql}`);
  });

  const execute: PersistencePort['execute'] = async (sql: string, params: unknown[] = []) => {
    if (
      sql.includes('UPDATE session_summaries') &&
      sql.includes("WHERE user_id = 'local'") &&
      sql.includes('FROM emt_messages')
    ) {
      const newUserId = String(params[0] ?? '');
      const authenticatedUserId = String(params[1] ?? newUserId);

      const sessionIds = new Set(
        state.emtMessages
          .filter((row) => isAuthenticatedEventMessage(row, authenticatedUserId))
          .map((row) => getSessionIdFromStreamId(row.stream_id))
          .filter((sessionId): sessionId is string => Boolean(sessionId)),
      );

      for (const summary of state.summaries) {
        if (summary.user_id === 'local' && sessionIds.has(summary.session_id)) {
          summary.user_id = newUserId;
        }
      }
      return;
    }

    if (
      sql.includes('INSERT OR REPLACE INTO algorithm_states') &&
      sql.includes('FROM algorithm_states') &&
      sql.includes("WHERE user_id = 'local'")
    ) {
      const newUserId = String(params[0] ?? '');
      const migrated = state.algorithmStates
        .filter((row) => row.user_id === 'local')
        .map((row) => ({
          ...row,
          id: newUserId + row.id.slice('local'.length),
          user_id: newUserId,
        }));
      const migratedIds = new Set(migrated.map((row) => row.id));
      state.algorithmStates = [
        ...state.algorithmStates.filter(
          (row) => row.user_id === 'local' || !migratedIds.has(row.id),
        ),
        ...migrated,
      ];
      return;
    }

    if (sql.includes('DELETE FROM algorithm_states') && sql.includes("WHERE user_id = 'local'")) {
      state.algorithmStates = state.algorithmStates.filter((row) => row.user_id !== 'local');
      return;
    }

    if (
      sql.includes('INSERT OR REPLACE INTO n_level_projection') &&
      sql.includes('FROM n_level_projection') &&
      sql.includes("WHERE user_id = 'local'")
    ) {
      const newUserId = String(params[0] ?? '');
      const migrated = state.nLevelProjections
        .filter((row) => row.user_id === 'local')
        .map((row) => ({
          ...row,
          id: newUserId + row.id.slice('local'.length),
          user_id: newUserId,
        }));
      const migratedIds = new Set(migrated.map((row) => row.id));
      state.nLevelProjections = [
        ...state.nLevelProjections.filter(
          (row) => row.user_id === 'local' || !migratedIds.has(row.id),
        ),
        ...migrated,
      ];
      return;
    }

    if (sql.includes('DELETE FROM n_level_projection') && sql.includes("WHERE user_id = 'local'")) {
      state.nLevelProjections = state.nLevelProjections.filter((row) => row.user_id !== 'local');
      return;
    }

    throw new Error(`Unexpected execute in test mock: ${sql}`);
  };

  const writeTransaction: PersistencePort['writeTransaction'] = async (fn: any) =>
    fn({
      execute: async (sql: string, params: unknown[] = []) => {
        if (
          sql.includes('UPDATE emt_messages') &&
          sql.includes("json_set(message_data, '$.data.userId'") &&
          sql.includes("WHERE message_kind = 'E'")
        ) {
          const authenticatedUserId = String(params[0] ?? '');
          const sessionId = String(params[1] ?? '');
          const targetStreamId = `session:${sessionId}`;

          state.emtMessages = state.emtMessages.map((row) => {
            if (row.stream_id !== targetStreamId) return row;
            if (!isLocalEventMessage(row)) return row;
            return {
              ...row,
              message_data: patchMessageUserId(row.message_data, authenticatedUserId),
            };
          });
          return;
        }

        if (
          sql.includes('UPDATE session_summaries') &&
          sql.includes('SET user_id = ?') &&
          sql.includes("WHERE user_id = 'local' AND session_id = ?")
        ) {
          const authenticatedUserId = String(params[0] ?? '');
          const sessionId = String(params[1] ?? '');
          for (const summary of state.summaries) {
            if (summary.user_id === 'local' && summary.session_id === sessionId) {
              summary.user_id = authenticatedUserId;
            }
          }
          return;
        }

        throw new Error(`Unexpected transaction execute in test mock: ${sql}`);
      },
    });

  // Mock AbstractPowerSyncDatabase that routes through the same query/execute handlers
  const mockPowerSyncDb = {
    getAll: async (sql: string, params?: unknown[]) => {
      const result = await query(sql, params);
      return result.rows;
    },
    getOptional: async (sql: string, params?: unknown[]) => {
      const result = await query(sql, params);
      return result.rows[0] ?? null;
    },
  };

  return {
    query,
    execute,
    writeTransaction,
    getPowerSyncDb: async () => mockPowerSyncDb,
    getSyncMeta: mock(async (key: string) => syncMeta.get(key) ?? null),
    setSyncMeta: mock(async (key: string, value: string) => {
      syncMeta.set(key, value);
    }),
  } as unknown as PersistencePort;
}

describe('history migration', () => {
  it('migrates local events repeatedly (not one-shot)', async () => {
    const userId = '11111111-1111-1111-1111-111111111111';
    const state: MockState = {
      emtMessages: [
        createMessage({
          id: 'local-e1',
          sessionId: 'session-a',
          userId: 'local',
          type: 'SESSION_STARTED',
        }),
        createMessage({
          id: 'local-e2',
          sessionId: 'session-a',
          userId: 'local',
          type: 'SESSION_ENDED',
        }),
        createMessage({
          id: 'local-e3',
          sessionId: 'session-b',
          userId: 'local',
          type: 'SESSION_ENDED',
        }),
      ],
      summaries: [
        { session_id: 'session-a', user_id: 'local' },
        { session_id: 'session-b', user_id: 'local' },
      ],
      algorithmStates: [],
      nLevelProjections: [],
    };
    const persistence = createMockPersistence(state);

    const first = await migrateLocalEventsToAuthenticatedUser(persistence, userId);
    expect(first.eventsMigrated).toBe(3);
    expect(first.sessionsMigrated).toBe(2);
    expect(first.alreadyMigrated).toBe(false);
    expect(state.emtMessages.filter(isLocalEventMessage)).toHaveLength(0);
    expect(
      state.emtMessages.every((row) => getUserIdFromMessageData(row.message_data) === userId),
    ).toBe(true);
    expect(state.summaries.every((summary) => summary.user_id === userId)).toBe(true);

    // Later, user creates another local session while logged out.
    state.emtMessages.push(
      createMessage({
        id: 'local-e4',
        sessionId: 'session-c',
        userId: 'local',
        type: 'SESSION_ENDED',
      }),
    );
    state.summaries.push({ session_id: 'session-c', user_id: 'local' });

    const second = await migrateLocalEventsToAuthenticatedUser(persistence, userId);
    expect(second.eventsMigrated).toBe(1);
    expect(second.sessionsMigrated).toBe(1);
    expect(state.emtMessages.filter(isLocalEventMessage)).toHaveLength(0);
    expect(
      state.emtMessages.some(
        (row) =>
          row.stream_id === 'session:session-c' &&
          getUserIdFromMessageData(row.message_data) === userId,
      ),
    ).toBe(true);
    expect(state.summaries.find((summary) => summary.session_id === 'session-c')?.user_id).toBe(
      userId,
    );
  });

  it('migrates only matching local summaries for the authenticated user', async () => {
    const userId = '11111111-1111-1111-1111-111111111111';
    const state: MockState = {
      emtMessages: [
        createMessage({ id: 'event-1', sessionId: 'session-a', userId, type: 'SESSION_ENDED' }),
        // Archived (deleted) session should not count.
        createMessage({
          id: 'event-2',
          sessionId: 'session-b',
          userId,
          type: 'SESSION_ENDED',
          isArchived: 1,
        }),
        createMessage({
          id: 'event-3',
          sessionId: 'session-c',
          userId: 'another-user',
          type: 'SESSION_ENDED',
        }),
      ],
      summaries: [
        { session_id: 'session-a', user_id: 'local' },
        { session_id: 'session-b', user_id: 'local' },
        { session_id: 'session-c', user_id: 'local' },
      ],
      algorithmStates: [],
      nLevelProjections: [],
    };
    const persistence = createMockPersistence(state);

    const migrated = await migrateLocalUserIdSummaries(persistence, userId);
    expect(migrated).toBe(1);
    expect(state.summaries.find((summary) => summary.session_id === 'session-a')?.user_id).toBe(
      userId,
    );
    expect(state.summaries.find((summary) => summary.session_id === 'session-b')?.user_id).toBe(
      'local',
    );
    expect(state.summaries.find((summary) => summary.session_id === 'session-c')?.user_id).toBe(
      'local',
    );
  });

  it('coordinates auth-transition migration and writes marker', async () => {
    const userId = '11111111-1111-1111-1111-111111111111';
    const state: MockState = {
      emtMessages: [createMessage({ id: 'local-e1', sessionId: 'session-a', userId: 'local' })],
      summaries: [{ session_id: 'session-a', user_id: 'local' }],
      algorithmStates: [],
      nLevelProjections: [],
    };
    const persistence = createMockPersistence(state);
    const setSyncMetaSpy = persistence.setSyncMeta as unknown as ReturnType<typeof mock>;

    const result = await runAuthTransitionHistoryMigration(persistence, userId);

    expect(result.wasNoop).toBe(false);
    expect(result.localEventsPending).toBe(1);
    expect(result.localSummariesPending).toBe(0);
    expect(result.eventsMigrated).toBe(1);
    expect(result.sessionsMigrated).toBe(1);
    expect(result.summariesMigrated).toBe(0);
    expect(setSyncMetaSpy).toHaveBeenCalledTimes(1);
    expect((setSyncMetaSpy.mock.calls[0]?.[0] as string) ?? '').toContain(
      'history:auth-transition-migration:v1:',
    );

    expect(state.emtMessages.filter(isLocalEventMessage)).toHaveLength(0);
    expect(state.summaries).toHaveLength(1);
    expect(state.summaries[0]?.user_id).toBe(userId);
  });

  it('serializes concurrent auth-transition runs for the same user', async () => {
    const userId = '11111111-1111-1111-1111-111111111111';
    const state: MockState = {
      emtMessages: [createMessage({ id: 'local-e1', sessionId: 'session-a', userId: 'local' })],
      summaries: [{ session_id: 'session-a', user_id: 'local' }],
      algorithmStates: [],
      nLevelProjections: [],
    };
    const persistence = createMockPersistence(state);
    const setSyncMetaSpy = persistence.setSyncMeta as unknown as ReturnType<typeof mock>;

    const first = runAuthTransitionHistoryMigration(persistence, userId);
    const second = runAuthTransitionHistoryMigration(persistence, userId);

    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(firstResult).toEqual(secondResult);
    expect(setSyncMetaSpy).toHaveBeenCalledTimes(1);

    expect(state.emtMessages.filter(isLocalEventMessage)).toHaveLength(0);
    expect(state.summaries[0]?.user_id).toBe(userId);
  });

  it('skips auth-transition re-scan when a success marker already exists, until logout clears it', async () => {
    const userId = '11111111-1111-1111-1111-111111111111';
    const state: MockState = {
      emtMessages: [createMessage({ id: 'local-e1', sessionId: 'session-a', userId: 'local' })],
      summaries: [{ session_id: 'session-a', user_id: 'local' }],
      algorithmStates: [],
      nLevelProjections: [],
    };
    const persistence = createMockPersistence(state);
    const querySpy = persistence.query as unknown as ReturnType<typeof mock>;

    const first = await runAuthTransitionHistoryMigration(persistence, userId);
    expect(first.eventsMigrated).toBe(1);
    const queryCallsAfterFirstRun = querySpy.mock.calls.length;

    const second = await runAuthTransitionHistoryMigration(persistence, userId);
    expect(second).toEqual(first);
    expect(querySpy.mock.calls.length).toBe(queryCallsAfterFirstRun);

    await clearAuthTransitionMigrationMeta(persistence, userId);

    state.emtMessages.push(
      createMessage({ id: 'local-e2', sessionId: 'session-b', userId: 'local' }),
    );
    state.summaries.push({ session_id: 'session-b', user_id: 'local' });

    const third = await runAuthTransitionHistoryMigration(persistence, userId);
    expect(third.eventsMigrated).toBe(1);
    expect(state.emtMessages.filter(isLocalEventMessage)).toHaveLength(0);
    expect(state.summaries.every((summary) => summary.user_id === userId)).toBe(true);
  });

  it('migrates local algorithm_states rows', async () => {
    const userId = '11111111-1111-1111-1111-111111111111';
    const state: MockState = {
      emtMessages: [],
      summaries: [],
      algorithmStates: [
        { id: 'local:adaptive', user_id: 'local' },
        { id: 'local:staircase', user_id: 'local' },
        { id: `${userId}:adaptive`, user_id: userId },
      ],
      nLevelProjections: [],
    };
    const persistence = createMockPersistence(state);

    const migrated = await migrateLocalAlgorithmStates(persistence, userId);
    expect(migrated).toBe(2);
    expect(state.algorithmStates.filter((r) => r.user_id === 'local')).toHaveLength(0);
    expect(
      state.algorithmStates.find((r) => r.id === `${userId}:adaptive` && r.user_id === userId),
    ).toBeTruthy();
    expect(
      state.algorithmStates.find((r) => r.id === `${userId}:staircase` && r.user_id === userId),
    ).toBeTruthy();
  });

  it('skips algorithm_states migration when none are local', async () => {
    const userId = '11111111-1111-1111-1111-111111111111';
    const state: MockState = {
      emtMessages: [],
      summaries: [],
      algorithmStates: [{ id: `${userId}:adaptive`, user_id: userId }],
      nLevelProjections: [],
    };
    const persistence = createMockPersistence(state);

    const migrated = await migrateLocalAlgorithmStates(persistence, userId);
    expect(migrated).toBe(0);
  });

  it('migrates local n_level_projection rows', async () => {
    const userId = '11111111-1111-1111-1111-111111111111';
    const state: MockState = {
      emtMessages: [],
      summaries: [],
      algorithmStates: [],
      nLevelProjections: [
        { id: 'local:2', user_id: 'local' },
        { id: 'local:3', user_id: 'local' },
        { id: `${userId}:2`, user_id: userId },
      ],
    };
    const persistence = createMockPersistence(state);

    const migrated = await migrateLocalNLevelProjection(persistence, userId);
    expect(migrated).toBe(2);
    expect(state.nLevelProjections.filter((r) => r.user_id === 'local')).toHaveLength(0);
    expect(
      state.nLevelProjections.find((r) => r.id === `${userId}:2` && r.user_id === userId),
    ).toBeTruthy();
    expect(
      state.nLevelProjections.find((r) => r.id === `${userId}:3` && r.user_id === userId),
    ).toBeTruthy();
  });

  it('skips n_level_projection migration when none are local', async () => {
    const userId = '11111111-1111-1111-1111-111111111111';
    const state: MockState = {
      emtMessages: [],
      summaries: [],
      algorithmStates: [],
      nLevelProjections: [{ id: `${userId}:2`, user_id: userId }],
    };
    const persistence = createMockPersistence(state);

    const migrated = await migrateLocalNLevelProjection(persistence, userId);
    expect(migrated).toBe(0);
  });

  it('auth-transition migration includes algorithm_states and n_level_projection', async () => {
    const userId = '11111111-1111-1111-1111-111111111111';
    const state: MockState = {
      emtMessages: [],
      summaries: [],
      algorithmStates: [{ id: 'local:adaptive', user_id: 'local' }],
      nLevelProjections: [{ id: 'local:2', user_id: 'local' }],
    };
    const persistence = createMockPersistence(state);

    const result = await runAuthTransitionHistoryMigration(persistence, userId);
    expect(result.algorithmStatesMigrated).toBe(1);
    expect(result.nLevelProjectionsMigrated).toBe(1);
    expect(result.wasNoop).toBe(false);
    expect(state.algorithmStates[0]?.user_id).toBe(userId);
    expect(state.algorithmStates[0]?.id).toBe(`${userId}:adaptive`);
    expect(state.nLevelProjections[0]?.user_id).toBe(userId);
    expect(state.nLevelProjections[0]?.id).toBe(`${userId}:2`);
  });
});
