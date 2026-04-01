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
    orphanSummariesCount: 0,
  };

  const getCount = (key: keyof typeof hits): number => {
    const hit = hits[key];
    hits[key] += 1;
    if (key === 'orphanSummariesCount') {
      return hit === 0 ? before.orphanSummaries : after.orphanSummaries;
    }
    return hit === 0 ? before[key as keyof Counts] : after[key as keyof Counts];
  };

  // Post-ES: diagnostics uses session_events and session_summaries tables directly.
  // findMixedOwnerSessions always returns 0 (no-op without Emmett per-event userId).
  const handleSql = (sql: string, _params?: unknown[]): { rows: Record<string, unknown>[] } => {
    // findOrphanSessionSummaries: session_summaries NOT EXISTS session_events
    // Must be checked before countAllSessionEvents since both contain session_events
    if (
      sql.includes('NOT EXISTS') &&
      sql.includes('FROM session_summaries') &&
      sql.includes('session_events')
    ) {
      return { rows: [{ c: getCount('orphanSummariesCount') }] };
    }

    // findMissingSessionSummaries check: SELECT COUNT(*) as c FROM session_summaries WHERE session_id = ?
    if (
      sql.includes('COUNT(*)') &&
      sql.includes('FROM session_summaries') &&
      sql.includes('session_id = ?')
    ) {
      // Return 0 so this session is counted as missing
      return { rows: [{ c: 0 }] };
    }

    // getSessionEvents (events_json): used by findMissingSessionSummaries to check for end events
    if (sql.includes('events_json') && sql.includes('FROM session_events')) {
      // Return a fake end event so the session counts as having end events
      return {
        rows: [{ events_json: JSON.stringify([{ type: 'SESSION_ENDED', timestamp: 1 }]) }],
      };
    }

    // getDistinctSessionIds: SELECT DISTINCT session_id FROM session_events
    if (
      sql.includes('SELECT DISTINCT') &&
      sql.includes('session_id') &&
      sql.includes('FROM session_events')
    ) {
      // Used by findMissingSessionSummaries iteration
      const count = getCount('missingSummaries');
      return { rows: Array.from({ length: count }, (_, i) => ({ session_id: `missing-${i}` })) };
    }

    // countAllSessionEvents: SELECT COUNT(*) as c FROM session_events
    if (sql.includes('COUNT(*)') && sql.includes('FROM session_events')) {
      return { rows: [{ c: getCount('localEventsPending') }] };
    }

    // getUserSessionIds: SELECT DISTINCT session_id FROM session_summaries WHERE user_id = ?
    if (
      sql.includes('SELECT DISTINCT') &&
      sql.includes('session_id') &&
      sql.includes('FROM session_summaries') &&
      sql.includes('user_id = ?')
    ) {
      // Return a dummy session ID so the localSummariesPending query gets executed
      return { rows: [{ session_id: 'dummy-session' }] };
    }

    // localSummariesPending: session_summaries with user_id='local' AND session_id IN (...)
    if (sql.includes('FROM session_summaries') && sql.includes("user_id = 'local'")) {
      return { rows: [{ count: getCount('localSummariesPending') }] };
    }

    console.log('[DIAGNOSTICS-MOCK] Unmatched SQL:', sql.substring(0, 120));
    return { rows: [] };
  };

  const query = mock(async (sql: string, params?: unknown[]) => {
    return handleSql(sql, params);
  });

  // Mock AbstractPowerSyncDatabase that routes through the same SQL handler
  const mockPowerSyncDb = {
    getAll: async (sql: string, params?: unknown[]) => handleSql(sql, params).rows,
    getOptional: async (sql: string, params?: unknown[]) => handleSql(sql, params).rows[0] ?? null,
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
