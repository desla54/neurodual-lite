import type { PersistencePort } from '@neurodual/logic';
import { sql } from 'drizzle-orm';
import { requireDrizzleDb } from '../db/drizzle';

/**
 * Abandoned sessions are considered non-exploitable and must not pollute the local DB.
 *
 * This module centralizes the cleanup policy:
 * - delete the session (events + summary + replay)
 * - rely on the persistence delete path to create synced tombstones when applicable
 */

export async function cleanupAbandonedSessionById(
  persistence: PersistencePort,
  sessionId: string,
): Promise<void> {
  await persistence.deleteSession(sessionId);
}

export async function cleanupLegacyAbandonedSummaries(
  persistence: PersistencePort,
): Promise<{ cleaned: number }> {
  const db = requireDrizzleDb(persistence);
  const res = await db.all<{
    session_id: string;
  }>(sql`SELECT session_id FROM session_summaries WHERE reason = 'abandoned'`);

  let cleaned = 0;
  for (const row of res) {
    const sessionId = row.session_id;
    if (!sessionId) continue;
    await cleanupAbandonedSessionById(persistence, sessionId);
    cleaned++;
  }
  return { cleaned };
}
