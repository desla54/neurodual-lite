import type { PersistencePort } from '@neurodual/logic';
import { sql } from 'drizzle-orm';
import { requireDrizzleDb } from '../db/drizzle';
import { historyLog } from '../logger';
import { rebuildAllSummaries } from './history-projection';

const HISTORY_BIG_BANG_META_PREFIX = 'history:big-bang-cutover:v1:';
const HISTORY_BIG_BANG_LOCK_PREFIX = 'history:big-bang-cutover:lock:v1:';
const CUTOVER_LOCK_STALE_MS = 5 * 60 * 1000;
const inFlightCutovers = new Map<string, Promise<HistoryBigBangCutoverReport>>();

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

function markerKey(userId: string): string {
  return `${HISTORY_BIG_BANG_META_PREFIX}${userId}`;
}

function lockKey(userId: string): string {
  return `${HISTORY_BIG_BANG_LOCK_PREFIX}${userId}`;
}

export interface HistoryBigBangCutoverReport {
  userId: string;
  applied: boolean;
  startedAt: string;
  finishedAt: string;
  projectedSummaries: number;
  rebuiltSnapshotsFromSessions: number;
}

interface HistoryBigBangDeps {
  rebuildAllSummaries: (persistence: PersistencePort) => Promise<number>;
}

const defaultDeps: HistoryBigBangDeps = {
  rebuildAllSummaries,
};

function isIgnorableHotfixErrorMessage(message: string): boolean {
  if (!message) return false;
  const normalized = message.toLowerCase();
  return (
    normalized.includes('duplicate column') ||
    normalized.includes('already exists') ||
    normalized.includes('duplicate') ||
    normalized.includes('cannot add a column to a view') ||
    (normalized.includes('cannot add') &&
      normalized.includes('column') &&
      normalized.includes('view')) ||
    normalized.includes('views may not be indexed') ||
    normalized.includes('may not be indexed') ||
    (normalized.includes('cannot modify') && normalized.includes('view'))
  );
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error && typeof error.message === 'string') {
    const withCause = error as Error & { cause?: unknown };
    if (withCause.cause) {
      const causeMessage = extractErrorMessage(withCause.cause);
      if (causeMessage.length > 0) {
        return `${error.message} ${causeMessage}`;
      }
    }
    return error.message;
  }
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && error !== null) {
    const withMessage = error as { message?: unknown; cause?: unknown };
    if (typeof withMessage.message === 'string') {
      if (withMessage.cause) {
        const causeMessage = extractErrorMessage(withMessage.cause);
        if (causeMessage.length > 0) {
          return `${withMessage.message} ${causeMessage}`;
        }
      }
      return withMessage.message;
    }
    if (withMessage.cause) {
      const causeMessage = extractErrorMessage(withMessage.cause);
      if (causeMessage) return causeMessage;
    }
  }
  return String(error ?? '');
}

function parseLockStartedAtMs(value: string | null): number | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as { startedAt?: unknown };
    if (typeof parsed.startedAt !== 'string') return null;
    const startedAtMs = Date.parse(parsed.startedAt);
    return Number.isFinite(startedAtMs) ? startedAtMs : null;
  } catch {
    return null;
  }
}

async function tryAcquireCutoverLock(
  persistence: PersistencePort,
  userId: string,
  startedAt: string,
): Promise<boolean> {
  if (!hasSyncMeta(persistence)) return true;

  try {
    const existing = await persistence.getSyncMeta(lockKey(userId));
    const existingStartedAtMs = parseLockStartedAtMs(existing);
    const isFresh =
      existingStartedAtMs !== null && Date.now() - existingStartedAtMs < CUTOVER_LOCK_STALE_MS;
    if (isFresh) {
      historyLog.debug('[HistoryBigBang] Existing cutover lock detected, skipping duplicate run');
      return false;
    }
    await persistence.setSyncMeta(
      lockKey(userId),
      JSON.stringify({
        userId,
        startedAt,
      }),
    );
    return true;
  } catch (error) {
    historyLog.warn('[HistoryBigBang] Failed to acquire lock, continuing without it:', error);
    return true;
  }
}

async function releaseCutoverLock(persistence: PersistencePort, userId: string): Promise<void> {
  if (!hasSyncMeta(persistence)) return;
  try {
    await persistence.setSyncMeta(lockKey(userId), '');
  } catch (error) {
    historyLog.warn('[HistoryBigBang] Failed to release cutover lock:', error);
  }
}

async function getSessionSummariesObjectType(
  persistence: PersistencePort,
): Promise<'table' | 'view' | null> {
  const db = requireDrizzleDb(persistence);

  try {
    const rows = await db.all<{ type: string }>(
      sql`SELECT type
          FROM (
            SELECT type FROM sqlite_master WHERE name = 'session_summaries'
            UNION ALL
            SELECT type FROM sqlite_temp_master WHERE name = 'session_summaries'
          )
          LIMIT 1`,
    );
    const type = rows[0]?.type;
    return type === 'table' || type === 'view' ? type : null;
  } catch {
    return null;
  }
}

async function ensureHistorySchemaHotfixes(persistence: PersistencePort): Promise<void> {
  const db = requireDrizzleDb(persistence);
  const objectType = await getSessionSummariesObjectType(persistence);
  if (objectType === 'view') {
    historyLog.debug(
      '[HistoryBigBang] session_summaries is a view on this runtime, skipping schema DDL hotfixes',
    );
    return;
  }

  const ddlStatements = [
    sql`ALTER TABLE session_summaries ADD COLUMN active_modalities_csv TEXT`,
    sql`CREATE INDEX IF NOT EXISTS session_summaries_user_created_session_idx
        ON session_summaries(user_id, created_at DESC, session_id DESC)`,
    sql`CREATE INDEX IF NOT EXISTS session_summaries_user_mode_created_idx
        ON session_summaries(user_id, game_mode, created_at DESC)`,
    sql`CREATE INDEX IF NOT EXISTS session_summaries_user_reason_mode_created_idx
        ON session_summaries(user_id, reason, game_mode, created_at DESC)`,
    sql`CREATE INDEX IF NOT EXISTS session_summaries_user_play_context_created_idx
        ON session_summaries(user_id, play_context, created_at DESC)`,
    sql`CREATE INDEX IF NOT EXISTS session_summaries_user_modalities_created_idx
        ON session_summaries(user_id, active_modalities_csv, created_at DESC)`,
    sql`CREATE INDEX IF NOT EXISTS session_summaries_user_reason_n_level_created_idx
        ON session_summaries(user_id, reason, n_level, created_at DESC)`,
    sql`CREATE INDEX IF NOT EXISTS events_session_type_deleted_ts_idx
        ON events(session_id, type, deleted, timestamp)`,
    sql`CREATE INDEX IF NOT EXISTS events_user_type_deleted_ts_idx
        ON events(user_id, type, deleted, timestamp)`,
  ];

  for (const ddl of ddlStatements) {
    try {
      await db.run(ddl);
    } catch (error) {
      const message = extractErrorMessage(error);
      if (isIgnorableHotfixErrorMessage(message)) {
        continue;
      }
      throw error;
    }
  }
}

async function clearDerivedReadModels(persistence: PersistencePort): Promise<void> {
  await persistence.writeTransaction(async (tx) => {
    await tx.execute(`DELETE FROM session_summaries`);
  });
}

export async function runHistoryBigBangCutover(
  persistence: PersistencePort,
  userId: string,
  options?: { force?: boolean; deps?: HistoryBigBangDeps },
): Promise<HistoryBigBangCutoverReport> {
  const inFlightKey = markerKey(userId);
  const existingInFlight = inFlightCutovers.get(inFlightKey);
  if (existingInFlight) {
    return existingInFlight;
  }

  const runPromise = (async (): Promise<HistoryBigBangCutoverReport> => {
    const deps = options?.deps ?? defaultDeps;
    const startedAt = new Date().toISOString();

    if (!options?.force && hasSyncMeta(persistence)) {
      try {
        const existing = await persistence.getSyncMeta(markerKey(userId));
        if (existing) {
          return {
            userId,
            applied: false,
            startedAt,
            finishedAt: startedAt,
            projectedSummaries: 0,
            rebuiltSnapshotsFromSessions: 0,
          };
        }
      } catch {
        // Ignore marker read failures; continue with cutover.
      }
    }

    const lockAcquired = await tryAcquireCutoverLock(persistence, userId, startedAt);
    if (!lockAcquired) {
      return {
        userId,
        applied: false,
        startedAt,
        finishedAt: startedAt,
        projectedSummaries: 0,
        rebuiltSnapshotsFromSessions: 0,
      };
    }

    historyLog.info('[HistoryBigBang] Starting cutover for user', userId);

    try {
      await ensureHistorySchemaHotfixes(persistence);
      await clearDerivedReadModels(persistence);

      const projectedSummaries = await deps.rebuildAllSummaries(persistence);
      const rebuiltSnapshotsFromSessions = 0;

      const finishedAt = new Date().toISOString();

      if (hasSyncMeta(persistence)) {
        try {
          await persistence.setSyncMeta(
            markerKey(userId),
            JSON.stringify({
              version: 1,
              userId,
              startedAt,
              finishedAt,
              projectedSummaries,
              rebuiltSnapshotsFromSessions,
            }),
          );
        } catch (error) {
          historyLog.warn('[HistoryBigBang] Failed to persist cutover marker:', error);
        }
      }

      historyLog.info('[HistoryBigBang] Completed cutover', {
        userId,
        projectedSummaries,
        rebuiltSnapshotsFromSessions,
      });

      return {
        userId,
        applied: true,
        startedAt,
        finishedAt,
        projectedSummaries,
        rebuiltSnapshotsFromSessions,
      };
    } finally {
      await releaseCutoverLock(persistence, userId);
    }
  })();

  inFlightCutovers.set(inFlightKey, runPromise);
  try {
    return await runPromise;
  } finally {
    inFlightCutovers.delete(inFlightKey);
  }
}
