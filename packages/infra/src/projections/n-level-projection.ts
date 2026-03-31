// packages/infra/src/projections/n-level-projection.ts
/**
 * N-Level Projection (Emmett-inspired: handle + truncate)
 *
 * Tracks Brain Workshop N-level recommendations per user.
 * Uses the 3-strike system: 3 sessions < 50% → decrease, 3 > 80% → increase.
 *
 * Only processes brainworkshop (SESSION_ENDED with nLevel/accuracy data).
 */

import { SESSION_END_EVENT_TYPES } from '@neurodual/logic';
import type { ProjectionDefinition } from './projection-definition';
import { computeNLevel } from './projection-manager';

// =============================================================================
// Types (for external queries on n_level_projection table)
// =============================================================================

export interface NLevelEntry {
  userId: string;
  nLevel: number;
  strikesBelow50: number;
  strikesAbove80: number;
  recommendedLevel: number;
  lastUpdated: string;
}

export interface NLevelState {
  /** Map key: `${userId}:${nLevel}` */
  readonly entries: ReadonlyMap<string, NLevelEntry>;
}

// =============================================================================
// Helpers
// =============================================================================

function getDateFromTimestamp(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

// =============================================================================
// Projection Definition
// =============================================================================

export const nLevelProjectionDefinition: ProjectionDefinition = {
  id: 'n-level',
  version: 1,
  canHandle: SESSION_END_EVENT_TYPES,

  async handle(events, db) {
    type RowState = {
      strikes_below_50: number;
      strikes_above_80: number;
      recommended_level: number;
    };

    const stateByKey = new Map<string, RowState>();
    const metadataByKey = new Map<
      string,
      { userId: string; nLevel: number; lastUpdated: string }
    >();

    for (const event of events) {
      const userId = event.data['userId'] as string | undefined;
      const nLevel = event.data['nLevel'] as number | undefined;
      const accuracy = event.data['accuracy'] as number | undefined;

      // Only brainworkshop sessions have nLevel/accuracy
      if (!userId || nLevel === undefined || accuracy === undefined) continue;

      const reason = event.data['reason'] as string | undefined;
      if (reason !== 'completed' && reason !== undefined) continue;

      const key = `${userId}:${nLevel}`;
      const eventDate = getDateFromTimestamp(event.createdAt.getTime());

      let current = stateByKey.get(key);
      if (!current) {
        const row = await db.getOptional<RowState>(
          'SELECT strikes_below_50, strikes_above_80, recommended_level FROM n_level_projection WHERE id = ?',
          [key],
        );
        current = row ?? { strikes_below_50: 0, strikes_above_80: 0, recommended_level: nLevel };
      }

      const next = computeNLevel(current, accuracy, nLevel);
      stateByKey.set(key, next);
      metadataByKey.set(key, { userId, nLevel, lastUpdated: eventDate });
    }

    // PowerSync tables are views; SQLite forbids UPSERT on views.
    for (const [key, state] of stateByKey) {
      const meta = metadataByKey.get(key);
      if (!meta) continue;

      await db.execute(
        `INSERT OR IGNORE INTO n_level_projection (id, user_id, n_level, strikes_below_50, strikes_above_80, recommended_level, last_updated)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          key,
          meta.userId,
          meta.nLevel,
          state.strikes_below_50,
          state.strikes_above_80,
          state.recommended_level,
          meta.lastUpdated,
        ],
      );
      await db.execute(
        `UPDATE n_level_projection
         SET user_id = ?, n_level = ?, strikes_below_50 = ?, strikes_above_80 = ?, recommended_level = ?, last_updated = ?
         WHERE id = ?`,
        [
          meta.userId,
          meta.nLevel,
          state.strikes_below_50,
          state.strikes_above_80,
          state.recommended_level,
          meta.lastUpdated,
          key,
        ],
      );
    }
  },

  async truncate(db) {
    await db.execute('DELETE FROM n_level_projection');
  },
};
