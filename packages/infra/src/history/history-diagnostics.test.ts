import { beforeEach, describe, expect, it, mock } from 'bun:test';
import type { PersistencePort } from '@neurodual/logic';
import { createHistoryIntegrityDiagnosticsRunner } from './history-diagnostics';

interface Counts {
  localEventsPending: number;
  localSummariesPending: number;
  missingSummaries: number;
  orphanSummaries: number;
  mixedOwnerSessions: number;
}

function createMockPersistence(before: Counts, after: Counts): PersistencePort {
  const hits = {
    localEventsPending: 0,
    localSummariesPending: 0,
    missingSummaries: 0,
    orphanSummaries: 0,
    mixedOwnerSessions: 0,
  };

  const getCount = (key: keyof Counts): number => {
    const hit = hits[key];
    hits[key] += 1;
    return hit === 0 ? before[key] : after[key];
  };

  // event-queries functions use db.getAll()/db.getOptional() via AbstractPowerSyncDatabase.
  // The diagnostics module now calls these functions instead of drizzle-backed SQL.
  // Route all queries through this single handler.
  const handleSql = (sql: string): { rows: Record<string, unknown>[] } => {
    // countLocalEventsForUser: COUNT local userId events
    if (
      sql.includes('FROM emt_messages') &&
      sql.includes("json_extract(message_data, '$.data.userId') = 'local'") &&
      sql.includes('COUNT')
    ) {
      return { rows: [{ count: getCount('localEventsPending') }] };
    }
    // getUserSessionIds: returns session_id rows (used for localSummariesPending subquery)
    // Exclude CTE queries (findMissingSessionSummaries) which also contain SELECT DISTINCT + session_id
    if (
      sql.includes('SELECT DISTINCT') &&
      sql.includes('session_id') &&
      sql.includes("json_extract(message_data, '$.data.userId') = ?") &&
      !sql.includes('WITH sessions AS')
    ) {
      // Return a dummy session ID so the localSummariesPending query gets executed
      return { rows: [{ session_id: 'dummy-session' }] };
    }
    // localSummariesPending: session_summaries with user_id='local' AND session_id IN (...)
    if (sql.includes('FROM session_summaries') && sql.includes("user_id = 'local'")) {
      return { rows: [{ count: getCount('localSummariesPending') }] };
    }
    // findMissingSessionSummaries: CTE with NOT EXISTS on session_summaries
    if (
      sql.includes('WITH sessions AS') ||
      (sql.includes('NOT EXISTS') &&
        sql.includes('session_summaries s') &&
        sql.includes('sessions.session_id'))
    ) {
      const count = getCount('missingSummaries');
      return { rows: Array.from({ length: count }, (_, i) => ({ session_id: `missing-${i}` })) };
    }
    // findOrphanSessionSummaries: session_summaries NOT EXISTS emt_messages
    if (
      sql.includes('NOT EXISTS') &&
      sql.includes('FROM session_summaries s') &&
      sql.includes('em.stream_id')
    ) {
      const count = getCount('orphanSummaries');
      return { rows: Array.from({ length: count }, (_, i) => ({ session_id: `orphan-${i}` })) };
    }
    // findMixedOwnerSessions: GROUP BY session_id HAVING COUNT(DISTINCT userId) > 1
    if (sql.includes('HAVING') && sql.includes('COUNT(DISTINCT')) {
      const count = getCount('mixedOwnerSessions');
      return { rows: Array.from({ length: count }, (_, i) => ({ session_id: `mixed-${i}` })) };
    }
    console.log('[DIAGNOSTICS-MOCK] Unmatched SQL:', sql.substring(0, 120));
    return { rows: [] };
  };

  const query = mock(async (sql: string) => {
    return handleSql(sql);
  });

  // Mock AbstractPowerSyncDatabase that routes through the same SQL handler
  const mockPowerSyncDb = {
    getAll: async (sql: string, _params?: unknown[]) => handleSql(sql).rows,
    getOptional: async (sql: string, _params?: unknown[]) => handleSql(sql).rows[0] ?? null,
  };

  const syncMeta = new Map<string, string>();
  const getSyncMeta = mock(async (key: string) => syncMeta.get(key) ?? null);
  const setSyncMeta = mock(async (key: string, value: string) => {
    syncMeta.set(key, value);
  });

  return {
    query,
    getSyncMeta,
    setSyncMeta,
    getPowerSyncDb: async () => mockPowerSyncDb,
  } as unknown as PersistencePort;
}

describe('history diagnostics', () => {
  const runAuthTransitionHistoryMigrationMock = mock(() =>
    Promise.resolve({
      userId: 'user-1',
      localEventsPending: 0,
      localSummariesPending: 0,
      eventsMigrated: 0,
      sessionsMigrated: 0,
      summariesMigrated: 0,
      wasNoop: true,
    }),
  );
  const rebuildMissingSessionSummariesMock = mock(() => Promise.resolve(0));
  const repairDriftedSessionSummariesMock = mock(() =>
    Promise.resolve({
      checked: 0,
      repaired: 0,
      drifted: 0,
      skipped: 0,
      errors: 0,
    }),
  );

  let runHistoryIntegrityDiagnostics: ReturnType<typeof createHistoryIntegrityDiagnosticsRunner>;

  beforeEach(() => {
    runAuthTransitionHistoryMigrationMock.mockClear();
    rebuildMissingSessionSummariesMock.mockClear();
    repairDriftedSessionSummariesMock.mockClear();

    runAuthTransitionHistoryMigrationMock.mockImplementation(() =>
      Promise.resolve({
        userId: 'user-1',
        localEventsPending: 0,
        localSummariesPending: 0,
        eventsMigrated: 0,
        sessionsMigrated: 0,
        summariesMigrated: 0,
        wasNoop: true,
      }),
    );
    rebuildMissingSessionSummariesMock.mockImplementation(() => Promise.resolve(0));
    repairDriftedSessionSummariesMock.mockImplementation(() =>
      Promise.resolve({
        checked: 0,
        repaired: 0,
        drifted: 0,
        skipped: 0,
        errors: 0,
      }),
    );

    runHistoryIntegrityDiagnostics = createHistoryIntegrityDiagnosticsRunner({
      runAuthTransitionHistoryMigration: runAuthTransitionHistoryMigrationMock as any,
      rebuildMissingSessionSummaries: rebuildMissingSessionSummariesMock as unknown as (
        ...args: unknown[]
      ) => Promise<number>,
      repairDriftedSessionSummaries: repairDriftedSessionSummariesMock as unknown as (
        ...args: unknown[]
      ) => Promise<{
        checked: number;
        repaired: number;
        drifted: number;
        skipped: number;
        errors: number;
      }>,
    });
  });

  it('skips run when throttled by recent persisted report', async () => {
    const persistence = createMockPersistence(
      {
        localEventsPending: 0,
        localSummariesPending: 0,
        missingSummaries: 0,
        orphanSummaries: 0,
        mixedOwnerSessions: 0,
      },
      {
        localEventsPending: 0,
        localSummariesPending: 0,
        missingSummaries: 0,
        orphanSummaries: 0,
        mixedOwnerSessions: 0,
      },
    );

    await persistence.setSyncMeta(
      'history:integrity-diagnostics:v1:user-1',
      JSON.stringify({ finishedAt: new Date().toISOString() }),
    );

    const report = await runHistoryIntegrityDiagnostics(persistence, 'user-1');

    expect(report.status).toBe('skipped');
    expect(report.skipped).toBe(true);
    expect(report.skipReason).toBe('throttled');
    expect(report.queryErrors).toEqual([]);
    expect(runAuthTransitionHistoryMigrationMock).toHaveBeenCalledTimes(0);
    expect(rebuildMissingSessionSummariesMock).toHaveBeenCalledTimes(0);
    expect(repairDriftedSessionSummariesMock).toHaveBeenCalledTimes(0);
  });

  it('runs diagnostics, applies repairs, and persists report', async () => {
    const persistence = createMockPersistence(
      {
        localEventsPending: 2,
        localSummariesPending: 1,
        missingSummaries: 3,
        orphanSummaries: 1,
        mixedOwnerSessions: 1,
      },
      {
        localEventsPending: 0,
        localSummariesPending: 0,
        missingSummaries: 0,
        orphanSummaries: 1,
        mixedOwnerSessions: 0,
      },
    );

    runAuthTransitionHistoryMigrationMock.mockImplementation(() =>
      Promise.resolve({
        userId: 'user-1',
        localEventsPending: 2,
        localSummariesPending: 1,
        eventsMigrated: 2,
        sessionsMigrated: 1,
        summariesMigrated: 1,
        wasNoop: false,
      }),
    );
    rebuildMissingSessionSummariesMock.mockImplementation(() => Promise.resolve(3));
    repairDriftedSessionSummariesMock.mockImplementation(() =>
      Promise.resolve({
        checked: 10,
        repaired: 2,
        drifted: 2,
        skipped: 0,
        errors: 0,
      }),
    );

    const report = await runHistoryIntegrityDiagnostics(persistence, 'user-1', { force: true });

    expect(report.status).toBe('degraded');
    expect(report.skipped).toBe(false);
    expect(report.queryErrors).toEqual([]);
    expect(report.anomaliesBefore.missingSummaries).toBe(3);
    expect(report.anomaliesAfter.missingSummaries).toBe(0);
    expect(report.repairs.authMigrationEvents).toBe(2);
    expect(report.repairs.authMigrationSummaries).toBe(1);
    expect(report.repairs.missingSummariesProjected).toBe(3);
    expect(report.repairs.driftedSummariesRepaired).toBe(2);
    expect(report.repairs.totalApplied).toBe(8);
    expect(runAuthTransitionHistoryMigrationMock).toHaveBeenCalledTimes(1);
    expect(rebuildMissingSessionSummariesMock).toHaveBeenCalledTimes(1);
    expect(repairDriftedSessionSummariesMock).toHaveBeenCalledTimes(1);
    expect((persistence.setSyncMeta as unknown as ReturnType<typeof mock>).mock.calls.length).toBe(
      1,
    );
  });

  it('serializes concurrent runs for same user', async () => {
    const persistence = createMockPersistence(
      {
        localEventsPending: 1,
        localSummariesPending: 1,
        missingSummaries: 1,
        orphanSummaries: 0,
        mixedOwnerSessions: 0,
      },
      {
        localEventsPending: 0,
        localSummariesPending: 0,
        missingSummaries: 0,
        orphanSummaries: 0,
        mixedOwnerSessions: 0,
      },
    );

    const first = runHistoryIntegrityDiagnostics(persistence, 'user-1', { force: true });
    const second = runHistoryIntegrityDiagnostics(persistence, 'user-1', { force: true });

    const [reportA, reportB] = await Promise.all([first, second]);
    expect(reportA).toEqual(reportB);
    expect(reportA.status).toBe('ok');
    expect(reportA.queryErrors).toEqual([]);
    expect(runAuthTransitionHistoryMigrationMock).toHaveBeenCalledTimes(1);
    expect(rebuildMissingSessionSummariesMock).toHaveBeenCalledTimes(1);
    expect(repairDriftedSessionSummariesMock).toHaveBeenCalledTimes(1);
  });
});
