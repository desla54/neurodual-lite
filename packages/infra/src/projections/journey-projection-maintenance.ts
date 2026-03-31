/**
 * Journey Projection Maintenance
 *
 * Auto-rebuilds journey_state_projection rows when JOURNEY_RULES_VERSION
 * is bumped, and creates missing projections for journeys that were
 * summarized before the fact-driven projection was introduced.
 * Runs once at startup after migrations.
 */
import type { AbstractPowerSyncDatabase } from '@powersync/web';
import { JOURNEY_RULES_VERSION } from './journey-rules-version';
import { rebuildJourneyProjection } from './journey-state-projection';
import { getJourneyMetadataEvent } from '../es-emmett/event-queries';
import { toSyncMetaSqlLabel } from '../es-emmett/startup-meta';
import { safeJsonParse, toFiniteNumber } from '../db/sql-helpers';

const JOURNEY_MAINTENANCE_META_KEY = `journey-projection-maintenance:v1:${JOURNEY_RULES_VERSION}`;

interface StaleRow {
  id: string;
  user_id: string;
  journey_id: string;
  journey_game_mode: string | null;
  state_json: string;
}

interface MissingJourneyRow {
  user_id: string;
  journey_id: string;
  game_mode: string | null;
}

/**
 * Rebuild stale projections + create missing ones.
 * Performance: < 50ms for a typical user (1-3 journeys, 50-200 sessions).
 */
export async function rebuildStaleJourneyProjections(
  db: AbstractPowerSyncDatabase,
): Promise<number> {
  const metaLabel = toSyncMetaSqlLabel(JOURNEY_MAINTENANCE_META_KEY);
  const existingMarker = await db.getOptional<{ value: string | null }>(
    `SELECT value FROM sync_meta WHERE id = ? /* sync_meta:get:${metaLabel} */`,
    [JOURNEY_MAINTENANCE_META_KEY],
  );
  if (existingMarker?.value) {
    return 0;
  }

  let rebuilt = 0;
  let hadFailures = false;

  // 1. Rebuild existing rows with outdated rules_version
  const staleRows = await db.getAll<StaleRow>(
    `SELECT id, user_id, journey_id, journey_game_mode, state_json
     FROM journey_state_projection
     WHERE rules_version IS NULL OR rules_version < ?`,
    [JOURNEY_RULES_VERSION],
  );

  for (const row of staleRows) {
    const state = safeJsonParse<Record<string, unknown>>(row.state_json, {});
    const startLevel = toFiniteNumber(state['startLevel'], 1);
    const targetLevel = toFiniteNumber(state['targetLevel'], 5);

    try {
      await rebuildJourneyProjection(db, {
        journeyId: row.journey_id,
        userId: row.user_id,
        startLevel,
        targetLevel,
        gameMode: row.journey_game_mode ?? undefined,
      });
      rebuilt++;
    } catch (err) {
      hadFailures = true;
      console.warn(`[journey-maintenance] Failed to rebuild projection for ${row.journey_id}`, err);
    }
  }

  // 2. Create projections for journeys that exist in session_summaries but not in projection
  const missingRows = await db.getAll<MissingJourneyRow>(
    `SELECT DISTINCT ss.user_id, ss.journey_id, ss.game_mode
     FROM session_summaries ss
     WHERE ss.play_context = 'journey'
       AND ss.journey_id IS NOT NULL
       AND ss.journey_id != ''
       AND NOT EXISTS (
         SELECT 1 FROM journey_state_projection jsp
         WHERE jsp.journey_id = ss.journey_id
       )
     GROUP BY ss.user_id, ss.journey_id`,
  );

  for (const row of missingRows) {
    try {
      const levels = await extractJourneyLevelsFromEvents(db, row.journey_id);

      await rebuildJourneyProjection(db, {
        journeyId: row.journey_id,
        userId: row.user_id ?? 'local',
        startLevel: levels.startLevel,
        targetLevel: levels.targetLevel,
        gameMode: row.game_mode ?? undefined,
      });
      rebuilt++;
    } catch (err) {
      hadFailures = true;
      console.warn(`[journey-maintenance] Failed to create projection for ${row.journey_id}`, err);
    }
  }

  if (!hadFailures) {
    await db.execute(`DELETE FROM sync_meta WHERE id = ? /* sync_meta:delete:${metaLabel} */`, [
      JOURNEY_MAINTENANCE_META_KEY,
    ]);
    await db.execute(
      `INSERT INTO sync_meta (id, value, updated_at) VALUES (?, ?, datetime('now')) /* sync_meta:set:${metaLabel} */`,
      [JOURNEY_MAINTENANCE_META_KEY, 'done'],
    );
  }

  return rebuilt;
}

/**
 * Extract startLevel/targetLevel from stored session events (emt_messages).
 * Reads the first session-start event that has journeyStartLevel/journeyTargetLevel.
 */
async function extractJourneyLevelsFromEvents(
  db: AbstractPowerSyncDatabase,
  journeyId: string,
): Promise<{ startLevel: number; targetLevel: number }> {
  // Try Emmett event store — look for session start events with journey metadata
  try {
    const row = await getJourneyMetadataEvent(db, journeyId);
    if (row?.payload) {
      const payload = safeJsonParse<Record<string, unknown>>(row.payload, {});
      const startLevel = toFiniteNumber(payload['journeyStartLevel'], NaN);
      const targetLevel = toFiniteNumber(payload['journeyTargetLevel'], NaN);
      if (Number.isFinite(startLevel) && Number.isFinite(targetLevel)) {
        return {
          startLevel,
          targetLevel,
        };
      }
    }
  } catch {
    // emt_messages might not exist in older schemas
  }

  // Fallback: derive from n_level range in session_summaries
  const range = await db.getOptional<{ min_level: number; max_level: number }>(
    `SELECT MIN(CAST(n_level AS INTEGER)) as min_level, MAX(CAST(n_level AS INTEGER)) as max_level
     FROM session_summaries
     WHERE play_context = 'journey' AND journey_id = ?`,
    [journeyId],
  );

  return {
    startLevel: range?.min_level ?? 1,
    targetLevel: Math.max(range?.max_level ?? 5, 5),
  };
}
