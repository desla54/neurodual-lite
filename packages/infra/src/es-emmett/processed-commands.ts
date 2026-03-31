/**
 * Processed Commands Table
 *
 * Tracks idempotence for commands - stores which commands have been processed
 * and their resulting stream position range.
 */

import type { AbstractPowerSyncDatabase } from '@powersync/web';
import type { PersistencePort } from '@neurodual/logic';

export type ProcessedCommandRow = {
  readonly command_id: string;
  readonly aggregate_id: string;
  readonly aggregate_type: string;
  readonly processed_at: string;
  readonly from_stream_position: string; // TEXT to preserve BIGINT precision
  readonly to_stream_position: string; // TEXT to preserve BIGINT precision
};

// =============================================================================
// PowerSync Direct API
// =============================================================================

/**
 * Check if a command has been processed using PowerSync directly.
 */
export async function getProcessedCommandFromPowerSync(
  db: AbstractPowerSyncDatabase,
  commandId: string,
): Promise<ProcessedCommandRow | null> {
  const result = await db.getOptional<ProcessedCommandRow>(
    `SELECT command_id, aggregate_id, aggregate_type, processed_at, from_stream_position, to_stream_position
     FROM processed_commands
     WHERE command_id = ?
     LIMIT 1`,
    [commandId],
  );
  return result ?? null;
}

/**
 * Record that a command has been processed using PowerSync directly.
 *
 * Positions should be passed as strings to preserve BIGINT precision.
 */
export async function putProcessedCommandToPowerSync(
  db: AbstractPowerSyncDatabase,
  row: Omit<ProcessedCommandRow, 'processed_at'> & { readonly processed_at?: string },
): Promise<void> {
  const processedAt = row.processed_at ?? new Date().toISOString();
  await db.execute(
    `INSERT INTO processed_commands
     (id, command_id, aggregate_id, aggregate_type, processed_at, from_stream_position, to_stream_position)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      row.command_id, // Use command_id as id (globally unique)
      row.command_id,
      row.aggregate_id,
      row.aggregate_type,
      processedAt,
      String(row.from_stream_position), // Ensure TEXT
      String(row.to_stream_position), // Ensure TEXT
    ],
  );
}

// =============================================================================
// PersistencePort API (for other consumers)
// =============================================================================

/**
 * Check if a command has been processed.
 * Returns the stored record if found, null otherwise.
 */
export async function getProcessedCommand(
  persistence: PersistencePort,
  commandId: string,
): Promise<ProcessedCommandRow | null> {
  const r = await persistence.query<ProcessedCommandRow>(
    `SELECT command_id, aggregate_id, aggregate_type, processed_at, from_stream_position, to_stream_position
     FROM processed_commands
     WHERE command_id = ?
     LIMIT 1`,
    [commandId],
  );
  return r.rows[0] ?? null;
}

/**
 * Record that a command has been processed with its resulting stream positions.
 */
export async function putProcessedCommand(
  persistence: PersistencePort,
  row: Omit<ProcessedCommandRow, 'processed_at'> & { readonly processed_at?: string },
): Promise<void> {
  const processedAt = row.processed_at ?? new Date().toISOString();
  await persistence.execute(
    `INSERT INTO processed_commands
     (id, command_id, aggregate_id, aggregate_type, processed_at, from_stream_position, to_stream_position)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      row.command_id, // Use command_id as id (globally unique)
      row.command_id,
      row.aggregate_id,
      row.aggregate_type,
      processedAt,
      row.from_stream_position,
      row.to_stream_position,
    ],
  );
}
