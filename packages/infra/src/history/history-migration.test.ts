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

interface SessionEventRow {
  session_id: string;
}

interface MockState {
  sessionEvents: SessionEventRow[];
  summaries: SummaryRow[];
  algorithmStates: AlgorithmStateRow[];
  nLevelProjections: NLevelProjectionRow[];
}

function createMockPersistence(state: MockState): PersistencePort {
  const syncMeta = new Map<string, string>();

  const handleSql = (sql: string, params: unknown[] = []): { rows: Record<string, unknown>[] } => {
    // countAllSessionEvents: SELECT COUNT(*) as c FROM session_events
    if (sql.includes('COUNT(*)') && sql.includes('FROM session_events')) {
      return { rows: [{ c: state.sessionEvents.length }] };
    }

    // getLocalOwnerSessionIds: SELECT DISTINCT session_id FROM session_summaries WHERE user_id = 'local'
    if (
      sql.includes('SELECT DISTINCT') &&
      sql.includes('session_id') &&
      sql.includes('FROM session_summaries') &&
      sql.includes("user_id = 'local'") &&
      !sql.includes('COUNT')
    ) {
      const sessionIds = Array.from(
        new Set(state.summaries.filter((s) => s.user_id === 'local').map((s) => s.session_id)),
      );
      return { rows: sessionIds.map((session_id) => ({ session_id })) };
    }

    // getUserSessionIds: SELECT DISTINCT session_id FROM session_summaries WHERE user_id = ?
    if (
      sql.includes('SELECT DISTINCT') &&
      sql.includes('session_id') &&
      sql.includes('FROM session_summaries') &&
      sql.includes('user_id = ?')
    ) {
      const userId = String(params[0] ?? '');
      const sessionIds = Array.from(
        new Set(state.summaries.filter((s) => s.user_id === userId).map((s) => s.session_id)),
      );
      return { rows: sessionIds.map((session_id) => ({ session_id })) };
    }

    // localSummariesPending: COUNT(*) FROM session_summaries WHERE user_id = 'local' AND session_id IN (...)
    if (
      sql.includes('COUNT(*)') &&
      sql.includes('FROM session_summaries') &&
      sql.includes("user_id = 'local'")
    ) {
      const sessionIdSet = new Set(params.map(String));
      const count = state.summaries.filter(
        (summary) => summary.user_id === 'local' && sessionIdSet.has(summary.session_id),
      ).length;
      return { rows: [{ count }] };
    }

    // algorithm_states count
    if (
      sql.includes('COUNT(*)') &&
      sql.includes('FROM algorithm_states') &&
      sql.includes("user_id = 'local'")
    ) {
      const count = state.algorithmStates.filter((r) => r.user_id === 'local').length;
      return { rows: [{ count }] };
    }

    // n_level_projection count
    if (
      sql.includes('COUNT(*)') &&
      sql.includes('FROM n_level_projection') &&
      sql.includes("user_id = 'local'")
    ) {
      const count = state.nLevelProjections.filter((r) => r.user_id === 'local').length;
      return { rows: [{ count }] };
    }

    // getDistinctSessionIds: SELECT DISTINCT session_id FROM session_events
    if (
      sql.includes('SELECT DISTINCT') &&
      sql.includes('session_id') &&
      sql.includes('FROM session_events')
    ) {
      const sessionIds = Array.from(new Set(state.sessionEvents.map((e) => e.session_id)));
      return { rows: sessionIds.map((session_id) => ({ session_id })) };
    }

    throw new Error(`Unexpected query in test mock: ${sql}`);
  };

  const query = mock(async <T extends object>(sql: string, params: unknown[] = []) => {
    return handleSql(sql, params) as { rows: T[] };
  });

  const execute: PersistencePort['execute'] = async (sql: string, params: unknown[] = []) => {
    // UPDATE session_summaries SET user_id = ? WHERE user_id = 'local' AND session_id IN (SELECT DISTINCT session_id FROM session_summaries WHERE user_id = ?)
    if (
      sql.includes('UPDATE session_summaries') &&
      sql.includes("WHERE user_id = 'local'") &&
      sql.includes('FROM session_summaries')
    ) {
      const newUserId = String(params[0] ?? '');
      const authenticatedUserId = String(params[1] ?? newUserId);

      const sessionIds = new Set(
        state.summaries.filter((s) => s.user_id === authenticatedUserId).map((s) => s.session_id),
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

  // Mock AbstractPowerSyncDatabase that routes through the same SQL handler
  const mockPowerSyncDb = {
    getAll: async (sql: string, params?: unknown[]) => {
      return handleSql(sql, params ?? []).rows;
    },
    getOptional: async (sql: string, params?: unknown[]) => {
      return handleSql(sql, params ?? []).rows[0] ?? null;
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
      sessionEvents: [
        { session_id: 'session-a' },
        { session_id: 'session-a' },
        { session_id: 'session-b' },
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
    // eventsMigrated is now the total count of session_events rows (used as proxy)
    expect(first.eventsMigrated).toBe(3);
    expect(first.sessionsMigrated).toBe(2);
    expect(first.alreadyMigrated).toBe(false);
    // After migration, local summaries should be updated to authenticated user
    expect(state.summaries.every((summary) => summary.user_id === userId)).toBe(true);

    // Later, user creates another local session while logged out.
    state.sessionEvents.push({ session_id: 'session-c' });
    state.summaries.push({ session_id: 'session-c', user_id: 'local' });

    const second = await migrateLocalEventsToAuthenticatedUser(persistence, userId);
    expect(second.eventsMigrated).toBe(4);
    expect(second.sessionsMigrated).toBe(1);
    expect(state.summaries.find((summary) => summary.session_id === 'session-c')?.user_id).toBe(
      userId,
    );
  });

  it('migrates only matching local summaries for the authenticated user', async () => {
    const userId = '11111111-1111-1111-1111-111111111111';
    const state: MockState = {
      sessionEvents: [],
      summaries: [
        // session-a has a summary owned by the authenticated user (will be matched)
        { session_id: 'session-a', user_id: userId },
        { session_id: 'session-a', user_id: 'local' },
        // session-b only has a local summary (no authenticated user ownership)
        { session_id: 'session-b', user_id: 'local' },
        // session-c only has a local summary (no authenticated user ownership)
        { session_id: 'session-c', user_id: 'local' },
      ],
      algorithmStates: [],
      nLevelProjections: [],
    };
    const persistence = createMockPersistence(state);

    const migrated = await migrateLocalUserIdSummaries(persistence, userId);
    expect(migrated).toBe(1);
    // session-a's local summary should be migrated (it has a matching userId summary)
    const sessionASummaries = state.summaries.filter((s) => s.session_id === 'session-a');
    expect(sessionASummaries.every((s) => s.user_id === userId)).toBe(true);
    // session-b and session-c should remain local
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
      sessionEvents: [{ session_id: 'session-a' }],
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

    expect(state.summaries).toHaveLength(1);
    expect(state.summaries[0]?.user_id).toBe(userId);
  });

  it('serializes concurrent auth-transition runs for the same user', async () => {
    const userId = '11111111-1111-1111-1111-111111111111';
    const state: MockState = {
      sessionEvents: [{ session_id: 'session-a' }],
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

    expect(state.summaries[0]?.user_id).toBe(userId);
  });

  it('skips auth-transition re-scan when a success marker already exists, until logout clears it', async () => {
    const userId = '11111111-1111-1111-1111-111111111111';
    const state: MockState = {
      sessionEvents: [{ session_id: 'session-a' }],
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

    state.sessionEvents.push({ session_id: 'session-b' });
    state.summaries.push({ session_id: 'session-b', user_id: 'local' });

    const third = await runAuthTransitionHistoryMigration(persistence, userId);
    expect(third.eventsMigrated).toBe(2);
    expect(state.summaries.every((summary) => summary.user_id === userId)).toBe(true);
  });

  it('migrates local algorithm_states rows', async () => {
    const userId = '11111111-1111-1111-1111-111111111111';
    const state: MockState = {
      sessionEvents: [],
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
      sessionEvents: [],
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
      sessionEvents: [],
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
      sessionEvents: [],
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
      sessionEvents: [],
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
