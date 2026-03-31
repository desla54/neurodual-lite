/**
 * Checkpointer — checkpoint read/write for ES processors.
 *
 * Manages the `emt_subscriptions` table which tracks each processor's
 * last processed global_position and schema version.
 *
 * This is a library concern — no code outside `es-emmett/` should
 * reference `emt_subscriptions` directly.
 */

import type { AbstractPowerSyncDatabase } from '@powersync/web';

const DEFAULT_PARTITION = 'global';

function toSqlCommentLabel(value: string): string {
  return value.replace(/[^a-zA-Z0-9:_-]/g, '_');
}

export type CheckpointRow = {
  id: string;
  subscription_id: string;
  version: number;
  partition: string;
  last_processed_position: string;
};

export interface Checkpointer {
  read(processorId: string): Promise<CheckpointRow | null>;
  readMany(processorIds: readonly string[]): Promise<Map<string, CheckpointRow>>;
  write(processorId: string, version: number, position: bigint): Promise<void>;
  reset(processorId: string): Promise<void>;
}

export function createCheckpointer(db: AbstractPowerSyncDatabase): Checkpointer {
  const knownExistingProcessorIds = new Set<string>();
  const lastWritten = new Map<string, { version: number; position: string }>();

  async function read(processorId: string): Promise<CheckpointRow | null> {
    const label = toSqlCommentLabel(processorId);
    const row = await db.getOptional<CheckpointRow>(
      `SELECT id, subscription_id, version, partition, last_processed_position
       FROM emt_subscriptions
       WHERE id = ? /* cp:read:${label} */`,
      [processorId],
    );
    if (row) {
      knownExistingProcessorIds.add(processorId);
      lastWritten.set(processorId, {
        version: row.version,
        position: row.last_processed_position,
      });
    }
    return row ?? null;
  }

  async function readMany(processorIds: readonly string[]): Promise<Map<string, CheckpointRow>> {
    const result = new Map<string, CheckpointRow>();
    if (processorIds.length === 0) return result;

    const uniqueProcessorIds = Array.from(new Set(processorIds));
    const getAll = (db as { getAll?: <T>(sql: string, params?: unknown[]) => Promise<T[]> }).getAll;
    if (typeof getAll !== 'function') {
      for (const processorId of uniqueProcessorIds) {
        const row = await read(processorId);
        if (row) result.set(processorId, row);
      }
      return result;
    }

    const placeholders = uniqueProcessorIds.map(() => '?').join(', ');
    const rows = await getAll.call(
      db,
      `SELECT id, subscription_id, version, partition, last_processed_position
       FROM emt_subscriptions
       WHERE id IN (${placeholders}) /* cp:read-many:${uniqueProcessorIds.length} */`,
      uniqueProcessorIds,
    );

    for (const row of rows as CheckpointRow[]) {
      knownExistingProcessorIds.add(row.id);
      lastWritten.set(row.id, {
        version: row.version,
        position: row.last_processed_position,
      });
      result.set(row.id, row);
    }

    return result;
  }

  async function write(processorId: string, version: number, position: bigint): Promise<void> {
    const positionString = String(position);
    const label = toSqlCommentLabel(processorId);
    const previous = lastWritten.get(processorId);
    if (previous && previous.version === version && previous.position === positionString) {
      return;
    }

    // PowerSync exposes app tables as views with triggers; SQLite does not allow
    // UPSERT (`ON CONFLICT DO UPDATE`) against views.
    // Use UPDATE first, then INSERT OR IGNORE when missing (view-safe, 1 query on steady state).
    if (knownExistingProcessorIds.has(processorId)) {
      await db.execute(
        `UPDATE emt_subscriptions
         SET version = ?, last_processed_position = ?
         WHERE id = ? /* cp:update:${label} */`,
        [version, positionString, processorId],
      );
      lastWritten.set(processorId, { version, position: positionString });
      return;
    }

    const updateResult = await db.execute(
      `UPDATE emt_subscriptions
       SET version = ?, last_processed_position = ?
       WHERE id = ? /* cp:update:${label} */`,
      [version, positionString, processorId],
    );
    const rowsAffected = (updateResult as { rowsAffected?: unknown }).rowsAffected;
    if (typeof rowsAffected === 'number' && rowsAffected > 0) {
      knownExistingProcessorIds.add(processorId);
      lastWritten.set(processorId, { version, position: positionString });
      return;
    }

    await db.execute(
      `INSERT OR IGNORE INTO emt_subscriptions (id, subscription_id, version, partition, last_processed_position)
       VALUES (?, ?, ?, ?, ?) /* cp:insert:${label} */`,
      [processorId, processorId, version, DEFAULT_PARTITION, positionString],
    );
    knownExistingProcessorIds.add(processorId);
    lastWritten.set(processorId, { version, position: positionString });
  }

  async function reset(processorId: string): Promise<void> {
    const label = toSqlCommentLabel(processorId);
    await db.execute(`DELETE FROM emt_subscriptions WHERE id = ? /* cp:reset:${label} */`, [
      processorId,
    ]);
    knownExistingProcessorIds.delete(processorId);
    lastWritten.delete(processorId);
  }

  return { read, readMany, write, reset };
}
