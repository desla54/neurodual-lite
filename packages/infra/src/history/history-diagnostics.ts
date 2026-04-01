import type { PersistencePort } from '@neurodual/logic';
import { SESSION_END_EVENT_TYPES_ARRAY } from '@neurodual/logic';
import type { AbstractPowerSyncDatabase } from '@powersync/web';
import { historyLog } from '../logger';
import {
  countAllSessionEvents,
  getDistinctSessionIds,
  getSessionEndEvents,
} from '../persistence/session-queries';

// ---------------------------------------------------------------------------
// Inline stubs replacing es-emmett/event-queries helpers
// ---------------------------------------------------------------------------

async function countLocalEventsForUser(db: AbstractPowerSyncDatabase): Promise<number> {
  return countAllSessionEvents(db);
}

async function getUserSessionIds(db: AbstractPowerSyncDatabase, userId: string): Promise<string[]> {
  try {
    const rows = await db.getAll<{ session_id: string }>(
      `SELECT DISTINCT session_id FROM session_summaries WHERE user_id = ?`,
      [userId],
    );
    return rows.map((r) => r.session_id);
  } catch {
    return [];
  }
}

async function findMissingSessionSummaries(
  db: AbstractPowerSyncDatabase,
  _endTypes: readonly string[],
  _userId?: string,
): Promise<string[]> {
  try {
    const allIds = await getDistinctSessionIds(db);
    if (allIds.length === 0) return [];
    const missing: string[] = [];
    for (const sid of allIds) {
      const endEvents = await getSessionEndEvents(db, sid);
      if (endEvents.length === 0) continue;
      const row = await db.getOptional<{ c: number }>(
        'SELECT COUNT(*) as c FROM session_summaries WHERE session_id = ?',
        [sid],
      );
      if ((row?.c ?? 0) === 0) missing.push(sid);
    }
    return missing;
  } catch {
    return [];
  }
}

async function findOrphanSessionSummaries(
  db: AbstractPowerSyncDatabase,
  _endTypes: readonly string[],
  _userId?: string,
): Promise<number> {
  try {
    const row = await db.getOptional<{ c: number }>(
      `SELECT COUNT(*) as c FROM session_summaries ss
       WHERE NOT EXISTS (
         SELECT 1 FROM session_events se WHERE se.session_id = ss.session_id
       )`,
    );
    return row?.c ?? 0;
  } catch {
    return 0;
  }
}

async function findMixedOwnerSessions(
  _db: AbstractPowerSyncDatabase,
  _userId: string,
): Promise<number> {
  // Without Emmett's per-event userId, mixed-owner detection is not applicable.
  return 0;
}
import { runAuthTransitionHistoryMigration } from './history-migration';
import {
  repairDriftedSessionSummaries,
  rebuildMissingSessionSummaries,
} from './history-projection';

const HISTORY_DIAGNOSTICS_META_PREFIX = 'history:integrity-diagnostics:v1:';
const DEFAULT_MIN_INTERVAL_MS = 2 * 60 * 1000;
const DEFAULT_MAX_DRIFT_REPAIR_SESSIONS = 40;

const SESSION_END_TYPES = SESSION_END_EVENT_TYPES_ARRAY;

function requirePowerSyncDb(persistence: PersistencePort): Promise<AbstractPowerSyncDatabase> {
  const candidate = persistence as unknown as {
    getPowerSyncDb?: () => Promise<AbstractPowerSyncDatabase>;
  };
  if (typeof candidate.getPowerSyncDb !== 'function') {
    throw new Error('[HistoryDiagnostics] PersistencePort must expose getPowerSyncDb()');
  }
  return candidate.getPowerSyncDb();
}

interface HasSyncMeta {
  getSyncMeta(key: string): Promise<string | null>;
  setSyncMeta(key: string, value: string): Promise<void>;
}

function hasSyncMeta(persistence: PersistencePort): persistence is PersistencePort & HasSyncMeta {
  return (
    typeof (persistence as unknown as { getSyncMeta?: unknown }).getSyncMeta === 'function' &&
    typeof (persistence as unknown as { setSyncMeta?: unknown }).setSyncMeta === 'function'
  );
}

function diagnosticsMetaKey(userId: string): string {
  return `${HISTORY_DIAGNOSTICS_META_PREFIX}${userId}`;
}

interface DiagnosticsAnomalies {
  localEventsPending: number;
  localSummariesPending: number;
  missingSummaries: number;
  orphanSummaries: number;
  mixedOwnerSessions: number;
}

interface DiagnosticsRepairs {
  authMigrationEvents: number;
  authMigrationSummaries: number;
  missingSummariesProjected: number;
  driftedSummariesRepaired: number;
  totalApplied: number;
}

export interface HistoryIntegrityDiagnosticsOptions {
  force?: boolean;
  minIntervalMs?: number;
  maxDriftRepairSessions?: number;
}

export interface HistoryIntegrityDiagnosticsReport {
  userId: string;
  startedAt: string;
  finishedAt: string;
  status: 'skipped' | 'ok' | 'degraded' | 'error';
  skipped: boolean;
  skipReason?: 'throttled';
  queryErrors: readonly string[];
  anomaliesBefore: DiagnosticsAnomalies;
  anomaliesAfter: DiagnosticsAnomalies;
  repairs: DiagnosticsRepairs;
  drift: {
    checked: number;
    drifted: number;
    repaired: number;
    skipped: number;
    errors: number;
  };
}

interface HistoryDiagnosticsDeps {
  runAuthTransitionHistoryMigration: typeof runAuthTransitionHistoryMigration;
  rebuildMissingSessionSummaries: typeof rebuildMissingSessionSummaries;
  repairDriftedSessionSummaries: typeof repairDriftedSessionSummaries;
}

const defaultHistoryDiagnosticsDeps: HistoryDiagnosticsDeps = {
  runAuthTransitionHistoryMigration,
  rebuildMissingSessionSummaries,
  repairDriftedSessionSummaries,
};

function emptyAnomalies(): DiagnosticsAnomalies {
  return {
    localEventsPending: 0,
    localSummariesPending: 0,
    missingSummaries: 0,
    orphanSummaries: 0,
    mixedOwnerSessions: 0,
  };
}

function emptyRepairs(): DiagnosticsRepairs {
  return {
    authMigrationEvents: 0,
    authMigrationSummaries: 0,
    missingSummariesProjected: 0,
    driftedSummariesRepaired: 0,
    totalApplied: 0,
  };
}

function buildSkippedReport(
  userId: string,
  startedAt: string,
  skipReason: 'throttled',
): HistoryIntegrityDiagnosticsReport {
  return {
    userId,
    startedAt,
    finishedAt: startedAt,
    status: 'skipped',
    skipped: true,
    skipReason,
    queryErrors: [],
    anomaliesBefore: emptyAnomalies(),
    anomaliesAfter: emptyAnomalies(),
    repairs: emptyRepairs(),
    drift: {
      checked: 0,
      drifted: 0,
      repaired: 0,
      skipped: 0,
      errors: 0,
    },
  };
}

async function readLastRunAtFromMeta(
  persistence: PersistencePort,
  userId: string,
): Promise<number | null> {
  if (!hasSyncMeta(persistence)) return null;
  try {
    const raw = await persistence.getSyncMeta(diagnosticsMetaKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { finishedAt?: unknown };
    if (typeof parsed.finishedAt !== 'string') return null;
    const atMs = Date.parse(parsed.finishedAt);
    return Number.isFinite(atMs) ? atMs : null;
  } catch {
    return null;
  }
}

async function writeDiagnosticsMeta(
  persistence: PersistencePort,
  report: HistoryIntegrityDiagnosticsReport,
): Promise<void> {
  if (!hasSyncMeta(persistence)) return;
  try {
    await persistence.setSyncMeta(diagnosticsMetaKey(report.userId), JSON.stringify(report));
  } catch (error) {
    historyLog.warn('[HistoryDiagnostics] Failed to persist diagnostics report:', error);
  }
}

type CountResult = {
  value: number;
  error: string | null;
};

async function tryCountFn(
  fn: () => Promise<number | string[]>,
  queryName: string,
): Promise<CountResult> {
  try {
    const result = await fn();
    const value = typeof result === 'number' ? result : result.length;
    return { value, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    historyLog.warn(`[HistoryDiagnostics] Count query failed (${queryName}):`, error);
    return { value: 0, error: `${queryName}: ${message}` };
  }
}

async function collectAnomalies(
  persistence: PersistencePort,
  userId: string,
): Promise<{ anomalies: DiagnosticsAnomalies; queryErrors: string[] }> {
  const db = await requirePowerSyncDb(persistence);

  const localEventsPending = await tryCountFn(
    () => countLocalEventsForUser(db),
    'local-events-pending',
  );

  // Local summaries pending: session_summaries with user_id='local' whose events
  // already belong to the authenticated userId (cross-device sync case).
  const localSummariesPending = await tryCountFn(async () => {
    const userSessionIds = await getUserSessionIds(db, userId);
    if (userSessionIds.length === 0) return 0;
    const placeholders = userSessionIds.map(() => '?').join(', ');
    const row = await db.getOptional<{ count: number }>(
      `SELECT COUNT(*) as count FROM session_summaries
         WHERE user_id = 'local'
           AND session_id IN (${placeholders})`,
      userSessionIds,
    );
    return row?.count ?? 0;
  }, 'local-summaries-pending');

  const missingSummaries = await tryCountFn(
    async () => (await findMissingSessionSummaries(db, SESSION_END_TYPES, userId)).length,
    'missing-summaries',
  );

  const orphanSummaries = await tryCountFn(
    () => findOrphanSessionSummaries(db, SESSION_END_TYPES, userId),
    'orphan-summaries',
  );

  const mixedOwnerSessions = await tryCountFn(
    () => findMixedOwnerSessions(db, userId),
    'mixed-owner-sessions',
  );

  const queryErrors = [
    localEventsPending.error,
    localSummariesPending.error,
    missingSummaries.error,
    orphanSummaries.error,
    mixedOwnerSessions.error,
  ].filter((error): error is string => Boolean(error));

  return {
    anomalies: {
      localEventsPending: localEventsPending.value,
      localSummariesPending: localSummariesPending.value,
      missingSummaries: missingSummaries.value,
      orphanSummaries: orphanSummaries.value,
      mixedOwnerSessions: mixedOwnerSessions.value,
    },
    queryErrors,
  };
}

function shouldThrottleRun(args: {
  force: boolean;
  nowMs: number;
  minIntervalMs: number;
  memoryLastRunAt: number | null;
  persistedLastRunAt: number | null;
}): boolean {
  if (args.force) return false;
  if (args.memoryLastRunAt !== null && args.nowMs - args.memoryLastRunAt < args.minIntervalMs) {
    return true;
  }
  if (
    args.persistedLastRunAt !== null &&
    args.nowMs - args.persistedLastRunAt < args.minIntervalMs
  ) {
    return true;
  }
  return false;
}

export function createHistoryIntegrityDiagnosticsRunner(
  customDeps: Partial<HistoryDiagnosticsDeps> = {},
): (
  persistence: PersistencePort,
  userId: string,
  options?: HistoryIntegrityDiagnosticsOptions,
) => Promise<HistoryIntegrityDiagnosticsReport> {
  const deps: HistoryDiagnosticsDeps = {
    ...defaultHistoryDiagnosticsDeps,
    ...customDeps,
  };
  const runningDiagnosticsByUser = new Map<string, Promise<HistoryIntegrityDiagnosticsReport>>();
  const lastRunAtByUser = new Map<string, number>();

  return async function runHistoryIntegrityDiagnostics(
    persistence: PersistencePort,
    userId: string,
    options: HistoryIntegrityDiagnosticsOptions = {},
  ): Promise<HistoryIntegrityDiagnosticsReport> {
    const activeRun = runningDiagnosticsByUser.get(userId);
    if (activeRun) return activeRun;

    const runPromise = (async () => {
      const startedAt = new Date().toISOString();
      const nowMs = Date.now();
      const minIntervalMs =
        typeof options.minIntervalMs === 'number' && options.minIntervalMs >= 0
          ? options.minIntervalMs
          : DEFAULT_MIN_INTERVAL_MS;
      const maxDriftRepairSessions =
        typeof options.maxDriftRepairSessions === 'number' && options.maxDriftRepairSessions > 0
          ? Math.floor(options.maxDriftRepairSessions)
          : DEFAULT_MAX_DRIFT_REPAIR_SESSIONS;
      const force = options.force === true;

      const memoryLastRunAt = lastRunAtByUser.get(userId) ?? null;
      const persistedLastRunAt = await readLastRunAtFromMeta(persistence, userId);
      if (
        shouldThrottleRun({
          force,
          nowMs,
          minIntervalMs,
          memoryLastRunAt,
          persistedLastRunAt,
        })
      ) {
        return buildSkippedReport(userId, startedAt, 'throttled');
      }

      const before = await collectAnomalies(persistence, userId);
      if (before.queryErrors.length > 0) {
        const report: HistoryIntegrityDiagnosticsReport = {
          userId,
          startedAt,
          finishedAt: new Date().toISOString(),
          status: 'error',
          skipped: false,
          queryErrors: before.queryErrors,
          anomaliesBefore: before.anomalies,
          anomaliesAfter: before.anomalies,
          repairs: emptyRepairs(),
          drift: {
            checked: 0,
            drifted: 0,
            repaired: 0,
            skipped: 0,
            errors: 0,
          },
        };
        await writeDiagnosticsMeta(persistence, report);
        lastRunAtByUser.set(userId, Date.now());
        return report;
      }

      const anomaliesBefore = before.anomalies;
      const migration = await deps.runAuthTransitionHistoryMigration(persistence, userId);
      const missingSummariesProjected =
        anomaliesBefore.missingSummaries > 0
          ? await deps.rebuildMissingSessionSummaries(persistence)
          : 0;
      const drift = await deps.repairDriftedSessionSummaries(persistence, {
        maxSessions: maxDriftRepairSessions,
      });
      const after = await collectAnomalies(persistence, userId);
      const anomaliesAfter = after.anomalies;

      const repairs: DiagnosticsRepairs = {
        authMigrationEvents: migration.eventsMigrated,
        authMigrationSummaries: migration.summariesMigrated,
        missingSummariesProjected,
        driftedSummariesRepaired: drift.repaired,
        totalApplied:
          migration.eventsMigrated +
          migration.summariesMigrated +
          missingSummariesProjected +
          drift.repaired,
      };

      const report: HistoryIntegrityDiagnosticsReport = {
        userId,
        startedAt,
        finishedAt: new Date().toISOString(),
        status:
          after.queryErrors.length > 0
            ? 'error'
            : anomaliesAfter.missingSummaries > 0 ||
                anomaliesAfter.orphanSummaries > 0 ||
                anomaliesAfter.mixedOwnerSessions > 0 ||
                anomaliesAfter.localEventsPending > 0 ||
                anomaliesAfter.localSummariesPending > 0
              ? 'degraded'
              : 'ok',
        skipped: false,
        queryErrors: after.queryErrors,
        anomaliesBefore,
        anomaliesAfter,
        repairs,
        drift: {
          checked: drift.checked,
          drifted: drift.drifted,
          repaired: drift.repaired,
          skipped: drift.skipped,
          errors: drift.errors,
        },
      };

      await writeDiagnosticsMeta(persistence, report);
      lastRunAtByUser.set(userId, Date.now());

      if (report.repairs.totalApplied > 0) {
        historyLog.info('[HistoryDiagnostics] Repairs applied:', {
          userId,
          repairs: report.repairs,
          anomaliesBefore: report.anomaliesBefore,
          anomaliesAfter: report.anomaliesAfter,
        });
      }

      return report;
    })().finally(() => {
      runningDiagnosticsByUser.delete(userId);
    });

    runningDiagnosticsByUser.set(userId, runPromise);
    return runPromise;
  };
}

export const runHistoryIntegrityDiagnostics = createHistoryIntegrityDiagnosticsRunner();
