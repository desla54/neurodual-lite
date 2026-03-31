/**
 * Processor Definition — the shape of an ES processor/projection.
 *
 * Each processor defines a `handle` function that writes SQL directly.
 * The same handle code runs for both incremental processing and full replay,
 * ensuring zero divergence between the two paths.
 *
 * This is the ES-library equivalent of the old `ProjectionDefinition`.
 */

import type { AbstractPowerSyncDatabase } from '@powersync/web';

/**
 * Minimal event shape passed to handle functions.
 * Compatible with StoredEvent from the event store.
 */
export interface ProcessorEvent {
  readonly type: string;
  readonly data: Record<string, unknown>;
  readonly globalPosition: bigint;
  readonly createdAt: Date;
}

/**
 * Declarative processor definition.
 *
 * - `id` + `version`: changing version triggers automatic full replay
 * - `canHandle`: fast filter by event type (only matching events are passed)
 * - `handle`: single function that reads/writes SQL directly — same code for
 *   incremental processing and full replay (no divergence possible)
 * - `truncate`: clear projected data before full replay
 */
export interface ProcessorDefinition {
  /** Unique processor id (e.g. 'streak', 'daily-activity', 'n-level') */
  readonly id: string;
  /** Increment to trigger automatic full replay */
  readonly version: number;
  /** Event types this processor handles (fast filter) */
  readonly canHandle: ReadonlySet<string>;
  /**
   * Process events by writing directly to SQL.
   * Same function for incremental and replay — single code path.
   */
  readonly handle: (
    events: readonly ProcessorEvent[],
    db: AbstractPowerSyncDatabase,
  ) => Promise<void>;
  /** Clear all projected data (called before full replay) */
  readonly truncate: (db: AbstractPowerSyncDatabase) => Promise<void>;
  /** Enter batch mode: accumulate writes instead of flushing immediately */
  readonly beginBatch?: () => void;
  /** Flush all accumulated writes from batch mode */
  readonly endBatch?: (db: AbstractPowerSyncDatabase) => Promise<void>;
}
