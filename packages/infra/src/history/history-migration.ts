/**
 * History Migration
 *
 * Handles migration of local events to authenticated user when user logs in.
 *
 * Problem: Users can play sessions locally (data.userId = 'local'/NULL/'')
 * before signing in. After login, these sessions become invisible because
 * queries filter by the authenticated user id.
 *
 * Solution (Emmett): On login, rewrite `emt_messages.message_data.$.data.userId`
 * from 'local'/NULL/'' to the authenticated user id, then update session_summaries.
 */

import type { PersistencePort } from '@neurodual/logic';
import { sql } from 'drizzle-orm';
import { drizzleAll, drizzleRun } from '../db/drizzle';
import { historyLog } from '../logger';
import type { AbstractPowerSyncDatabase } from '@powersync/web';
import {
  countAllSessionEvents,
  getDistinctSessionIds,
} from '../persistence/session-queries';

// ---------------------------------------------------------------------------
// Inline stubs replacing es-emmett helpers
// ---------------------------------------------------------------------------

async function countLocalOwnerEvents(db: AbstractPowerSyncDatabase): Promise<number> {
  return countAllSessionEvents(db);
}

async function getLocalOwnerSessionIds(db: AbstractPowerSyncDatabase): Promise<string[]> {
  try {
    const rows = await db.getAll<{ session_id: string }>(
      `SELECT DISTINCT session_id FROM session_summaries WHERE user_id = 'local'`,
    );
    return rows.map((r) => r.session_id);
  } catch {
    return getDistinctSessionIds(db);
  }
}

async function getUserSessionIds(
  db: AbstractPowerSyncDatabase,
  userId: string,
): Promise<string[]> {
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

async function rewriteSessionUserId(
  // biome-ignore lint/suspicious/noExplicitAny: transaction type varies
  _tx: any,
  _sessionId: string,
  _authenticatedUserId: string,
): Promise<void> {
  // No-op: Emmett emt_messages table no longer exists.
  // Session userId is tracked in session_summaries only.
}

// =============================================================================
// Types
// =============================================================================

export interface MigrationResult {
  eventsMigrated: number;
  sessionsMigrated: number;
  alreadyMigrated: boolean;
}

export interface AuthTransitionMigrationResult {
  userId: string;
  localEventsPending: number;
  localSummariesPending: number;
  eventsMigrated: number;
  sessionsMigrated: number;
  summariesMigrated: number;
  algorithmStatesMigrated: number;
  nLevelProjectionsMigrated: number;
  projectionsRebuilt: boolean;
  wasNoop: boolean;
}

interface AuthTransitionMigrationMeta {
  version: number;
  userId: string;
  at: string;
  localEventsPending: number;
  localSummariesPending: number;
  eventsMigrated: number;
  sessionsMigrated: number;
  summariesMigrated: number;
  algorithmStatesMigrated: number;
  nLevelProjectionsMigrated: number;
  projectionsRebuilt: boolean;
  wasNoop: boolean;
}

interface PendingMigrationWork {
  localEvents: number;
  localSummaries: number;
}

const AUTH_TRANSITION_MIGRATION_META_PREFIX = 'history:auth-transition-migration:v1:';
const runningAuthTransitionMigrations = new Map<string, Promise<AuthTransitionMigrationResult>>();

function getAuthTransitionMigrationMetaKey(userId: string): string {
  return `${AUTH_TRANSITION_MIGRATION_META_PREFIX}${userId}`;
}

function hasSyncMeta(persistence: PersistencePort): persistence is PersistencePort & {
  getSyncMeta: (key: string) => Promise<string | null>;
  setSyncMeta: (key: string, value: string) => Promise<void>;
} {
  return (
    typeof (persistence as unknown as { getSyncMeta?: unknown }).getSyncMeta === 'function' &&
    typeof (persistence as unknown as { setSyncMeta?: unknown }).setSyncMeta === 'function'
  );
}

function requirePowerSyncDb(persistence: PersistencePort): Promise<AbstractPowerSyncDatabase> {
  const candidate = persistence as unknown as {
    getPowerSyncDb?: () => Promise<AbstractPowerSyncDatabase>;
  };
  if (typeof candidate.getPowerSyncDb !== 'function') {
    throw new Error('[HistoryMigration] PersistencePort must expose getPowerSyncDb()');
  }
  return candidate.getPowerSyncDb();
}

function isAuthTransitionMigrationMeta(
  value: unknown,
  userId: string,
): value is AuthTransitionMigrationMeta {
  if (typeof value !== 'object' || value === null) return false;

  const candidate = value as Partial<AuthTransitionMigrationMeta>;
  return (
    typeof candidate.version === 'number' &&
    candidate.version >= 2 &&
    candidate.userId === userId &&
    typeof candidate.at === 'string' &&
    typeof candidate.localEventsPending === 'number' &&
    typeof candidate.localSummariesPending === 'number' &&
    typeof candidate.eventsMigrated === 'number' &&
    typeof candidate.sessionsMigrated === 'number' &&
    typeof candidate.summariesMigrated === 'number' &&
    typeof candidate.algorithmStatesMigrated === 'number' &&
    typeof candidate.nLevelProjectionsMigrated === 'number' &&
    typeof candidate.projectionsRebuilt === 'boolean' &&
    typeof candidate.wasNoop === 'boolean'
  );
}

function toAuthTransitionMigrationResult(
  meta: AuthTransitionMigrationMeta,
): AuthTransitionMigrationResult {
  return {
    userId: meta.userId,
    localEventsPending: meta.localEventsPending,
    localSummariesPending: meta.localSummariesPending,
    eventsMigrated: meta.eventsMigrated,
    sessionsMigrated: meta.sessionsMigrated,
    summariesMigrated: meta.summariesMigrated,
    algorithmStatesMigrated: meta.algorithmStatesMigrated,
    nLevelProjectionsMigrated: meta.nLevelProjectionsMigrated,
    projectionsRebuilt: meta.projectionsRebuilt,
    wasNoop: meta.wasNoop,
  };
}

async function readAuthTransitionMigrationMeta(
  persistence: PersistencePort,
  userId: string,
): Promise<AuthTransitionMigrationMeta | null> {
  if (!hasSyncMeta(persistence)) return null;

  try {
    const raw = await persistence.getSyncMeta(getAuthTransitionMigrationMetaKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isAuthTransitionMigrationMeta(parsed, userId) ? parsed : null;
  } catch {
    return null;
  }
}

async function writeAuthTransitionMigrationMeta(
  persistence: PersistencePort,
  result: AuthTransitionMigrationResult,
): Promise<void> {
  if (!hasSyncMeta(persistence)) return;

  const payload: AuthTransitionMigrationMeta = {
    version: 2,
    userId: result.userId,
    at: new Date().toISOString(),
    localEventsPending: result.localEventsPending,
    localSummariesPending: result.localSummariesPending,
    eventsMigrated: result.eventsMigrated,
    sessionsMigrated: result.sessionsMigrated,
    summariesMigrated: result.summariesMigrated,
    algorithmStatesMigrated: result.algorithmStatesMigrated,
    nLevelProjectionsMigrated: result.nLevelProjectionsMigrated,
    projectionsRebuilt: result.projectionsRebuilt,
    wasNoop: result.wasNoop,
  };

  try {
    await persistence.setSyncMeta(
      getAuthTransitionMigrationMetaKey(result.userId),
      JSON.stringify(payload),
    );
  } catch (error) {
    historyLog.warn('[Migration] Failed to write auth-transition migration marker:', error);
  }
}

export async function clearAuthTransitionMigrationMeta(
  persistence: PersistencePort,
  userId: string,
): Promise<void> {
  if (!hasSyncMeta(persistence)) return;
  try {
    await persistence.setSyncMeta(getAuthTransitionMigrationMetaKey(userId), '');
  } catch (error) {
    historyLog.warn('[Migration] Failed to clear auth-transition migration marker:', error);
  }
}

async function getPendingAuthTransitionWork(
  persistence: PersistencePort,
  authenticatedUserId: string,
): Promise<PendingMigrationWork> {
  const db = await requirePowerSyncDb(persistence);

  const localEvents = await countLocalOwnerEvents(db);

  // Local summaries pending: session_summaries with user_id='local' whose events
  // already belong to the authenticated userId (cross-device sync case).
  const userSessionIds = await getUserSessionIds(db, authenticatedUserId);
  let localSummaries = 0;
  if (userSessionIds.length > 0) {
    const placeholders = userSessionIds.map(() => '?').join(', ');
    const row = await db.getOptional<{ count: number }>(
      `SELECT COUNT(*) as count FROM session_summaries
       WHERE user_id = 'local'
         AND session_id IN (${placeholders})`,
      userSessionIds,
    );
    localSummaries = row?.count ?? 0;
  }

  return { localEvents, localSummaries };
}

// =============================================================================
// Migration Functions
// =============================================================================

/**
 * Migrate local events to the authenticated user.
 *
 * This function:
 * 1. Finds all session streams in emt_messages with userId='local'/NULL/''
 * 2. Rewrites `emt_messages.message_data.$.data.userId` to authenticatedUserId
 * 3. Updates session_summaries to use the authenticated user_id
 *
 * The function is idempotent - safe to call multiple times.
 *
 * @param persistence - PersistencePort for DB operations
 * @param authenticatedUserId - The authenticated user's UUID
 * @returns Migration result with counts
 */
export async function migrateLocalEventsToAuthenticatedUser(
  persistence: PersistencePort,
  authenticatedUserId: string,
): Promise<MigrationResult> {
  const yieldToMain = async (): Promise<void> => {
    if (typeof MessageChannel !== 'undefined') {
      await new Promise<void>((resolve) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = () => resolve();
        channel.port2.postMessage(null);
      });
      return;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  };

  historyLog.info('[Migration] Starting local events migration for user:', authenticatedUserId);

  try {
    const db = await requirePowerSyncDb(persistence);

    // Step 1: Find all local session IDs in Emmett store (bounded work, no payload parsing).
    const sessionIds = await getLocalOwnerSessionIds(db);

    if (sessionIds.length === 0) {
      historyLog.debug('[Migration] No local events to migrate');
      return { eventsMigrated: 0, sessionsMigrated: 0, alreadyMigrated: false };
    }

    const eventsMigrated = await countLocalOwnerEvents(db);

    historyLog.info(
      '[Migration] Migrating',
      eventsMigrated,
      'events from',
      sessionIds.length,
      'sessions',
    );

    // Step 2: Migrate per-session to keep each write bounded and allow yielding.
    for (const sessionId of sessionIds) {
      await persistence.writeTransaction(async (tx) => {
        // Rewrite userId inside emt_messages JSON envelope.
        // This unblocks RLS-protected sync for rows created pre-login.
        await rewriteSessionUserId(tx, sessionId, authenticatedUserId);

        // Update summary row if already projected.
        await tx.execute(
          `UPDATE session_summaries
           SET user_id = ?
           WHERE user_id = 'local' AND session_id = ?`,
          [authenticatedUserId, sessionId],
        );
      });

      // Yield between sessions to prevent freezes on large histories.
      await yieldToMain();
    }

    historyLog.info('[Migration] Completed successfully:', {
      eventsMigrated,
      sessionsMigrated: sessionIds.length,
    });

    return { eventsMigrated, sessionsMigrated: sessionIds.length, alreadyMigrated: false };
  } catch (error) {
    historyLog.error('[Migration] Failed:', error);
    throw error;
  }
}

/**
 * Migrate session summaries that have user_id='local' but their events
 * already have the authenticated user_id (cross-device sync case).
 *
 * This handles the case where events were synced from another device
 * but session_summaries were created locally with 'local' user_id.
 */
export async function migrateLocalUserIdSummaries(
  persistence: PersistencePort,
  authenticatedUserId: string,
): Promise<number> {
  try {
    const db = await requirePowerSyncDb(persistence);

    // Find session IDs owned by the authenticated user
    const userSessionIds = await getUserSessionIds(db, authenticatedUserId);
    if (userSessionIds.length === 0) return 0;

    // Count session_summaries with user_id='local' that belong to this user
    const placeholders = userSessionIds.map(() => '?').join(', ');
    const countRow = await db.getOptional<{ count: number }>(
      `SELECT COUNT(*) as count FROM session_summaries
       WHERE user_id = 'local'
         AND session_id IN (${placeholders})`,
      userSessionIds,
    );

    const toMigrateCount = countRow?.count ?? 0;
    if (toMigrateCount === 0) return 0;

    // Update all matching session_summaries to use the correct user_id.
    // (Post-Emmett: we already have the user's session IDs from session_summaries.)
    await drizzleRun(
      persistence,
      sql`UPDATE session_summaries
          SET user_id = ${authenticatedUserId}
          WHERE user_id = 'local'
            AND session_id IN (
              SELECT DISTINCT session_id FROM session_summaries
              WHERE user_id = ${authenticatedUserId}
            )`,
    );

    return toMigrateCount;
  } catch (error) {
    historyLog.warn('[Migration] Failed to migrate local user_id summaries:', error);
    return 0;
  }
}

/**
 * Migrate algorithm_states rows from user_id='local' to authenticated user.
 *
 * The algorithm_states table stores adaptive difficulty state with:
 * - id = `${userId}:${algorithmType}`
 * - user_id = userId
 *
 * After auth, queries use the real UUID -> old 'local' rows are invisible.
 */
export async function migrateLocalAlgorithmStates(
  persistence: PersistencePort,
  authenticatedUserId: string,
): Promise<number> {
  try {
    const countRows = await drizzleAll<{ count: number }>(
      persistence,
      sql`SELECT COUNT(*) as count FROM algorithm_states WHERE user_id = 'local'`,
    );
    const toMigrate = countRows[0]?.count ?? 0;
    if (toMigrate === 0) return 0;

    // SQLite/PowerSync rejects primary-key mutation via UPDATE. Reinsert under the
    // authenticated composite id, then remove the local rows.
    await drizzleRun(
      persistence,
      sql`INSERT OR REPLACE INTO algorithm_states (
            id,
            user_id,
            algorithm_type,
            state_json,
            session_count,
            updated_at
          )
          SELECT
            ${authenticatedUserId} || substr(id, length('local') + 1),
            ${authenticatedUserId},
            algorithm_type,
            state_json,
            session_count,
            updated_at
          FROM algorithm_states
          WHERE user_id = 'local'`,
    );
    await drizzleRun(persistence, sql`DELETE FROM algorithm_states WHERE user_id = 'local'`);

    historyLog.info('[Migration] Migrated algorithm_states:', toMigrate);
    return toMigrate;
  } catch (error) {
    historyLog.warn('[Migration] Failed to migrate algorithm_states:', error);
    return 0;
  }
}

/**
 * Migrate n_level_projection rows from user_id='local' to authenticated user.
 *
 * The n_level_projection table stores Brain Workshop strike counts with:
 * - id = `${userId}:${nLevel}`
 * - user_id = userId
 *
 * After auth, queries use the real UUID -> old 'local' rows are invisible.
 */
export async function migrateLocalNLevelProjection(
  persistence: PersistencePort,
  authenticatedUserId: string,
): Promise<number> {
  try {
    const countRows = await drizzleAll<{ count: number }>(
      persistence,
      sql`SELECT COUNT(*) as count FROM n_level_projection WHERE user_id = 'local'`,
    );
    const toMigrate = countRows[0]?.count ?? 0;
    if (toMigrate === 0) return 0;

    // SQLite/PowerSync rejects primary-key mutation via UPDATE. Reinsert under the
    // authenticated composite id, then remove the local rows.
    await drizzleRun(
      persistence,
      sql`INSERT OR REPLACE INTO n_level_projection (
            id,
            user_id,
            n_level,
            strikes_below_50,
            strikes_above_80,
            recommended_level,
            last_updated
          )
          SELECT
            ${authenticatedUserId} || substr(id, length('local') + 1),
            ${authenticatedUserId},
            n_level,
            strikes_below_50,
            strikes_above_80,
            recommended_level,
            last_updated
          FROM n_level_projection
          WHERE user_id = 'local'`,
    );
    await drizzleRun(persistence, sql`DELETE FROM n_level_projection WHERE user_id = 'local'`);

    historyLog.info('[Migration] Migrated n_level_projection:', toMigrate);
    return toMigrate;
  } catch (error) {
    historyLog.warn('[Migration] Failed to migrate n_level_projection:', error);
    return 0;
  }
}

/**
 * Run local -> authenticated migration after login in a single coordinated flow.
 *
 * Why:
 * - Login/auth callbacks can fire multiple times (initial state + refresh)
 * - Multiple consumers (provider/watch) can race each other
 *
 * This function serializes work per userId and writes a sync_meta marker
 * to make transitions observable and easier to audit.
 */
export async function runAuthTransitionHistoryMigration(
  persistence: PersistencePort,
  authenticatedUserId: string,
): Promise<AuthTransitionMigrationResult> {
  const existingRun = runningAuthTransitionMigrations.get(authenticatedUserId);
  if (existingRun) return existingRun;

  const runPromise = (async () => {
    const previousResult = await readAuthTransitionMigrationMeta(persistence, authenticatedUserId);
    if (previousResult) {
      historyLog.debug(
        '[Migration] Auth-transition migration already completed, skipping startup re-scan for user:',
        authenticatedUserId,
      );
      return toAuthTransitionMigrationResult(previousResult);
    }

    const pending = await getPendingAuthTransitionWork(persistence, authenticatedUserId);

    let eventsMigrated = 0;
    let sessionsMigrated = 0;
    if (pending.localEvents > 0) {
      const migrationResult = await migrateLocalEventsToAuthenticatedUser(
        persistence,
        authenticatedUserId,
      );
      eventsMigrated = migrationResult.eventsMigrated;
      sessionsMigrated = migrationResult.sessionsMigrated;
    }

    const summariesMigrated = await migrateLocalUserIdSummaries(persistence, authenticatedUserId);
    const algorithmStatesMigrated = await migrateLocalAlgorithmStates(
      persistence,
      authenticatedUserId,
    );
    const nLevelProjectionsMigrated = await migrateLocalNLevelProjection(
      persistence,
      authenticatedUserId,
    );

    const result: AuthTransitionMigrationResult = {
      userId: authenticatedUserId,
      localEventsPending: pending.localEvents,
      localSummariesPending: pending.localSummaries,
      eventsMigrated,
      sessionsMigrated,
      summariesMigrated,
      algorithmStatesMigrated,
      nLevelProjectionsMigrated,
      projectionsRebuilt: false, // Caller is responsible for triggering rebuild
      wasNoop:
        eventsMigrated === 0 &&
        summariesMigrated === 0 &&
        algorithmStatesMigrated === 0 &&
        nLevelProjectionsMigrated === 0,
    };

    await writeAuthTransitionMigrationMeta(persistence, result);
    return result;
  })().finally(() => {
    runningAuthTransitionMigrations.delete(authenticatedUserId);
  });

  runningAuthTransitionMigrations.set(authenticatedUserId, runPromise);
  return runPromise;
}
