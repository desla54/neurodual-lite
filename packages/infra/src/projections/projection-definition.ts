// packages/infra/src/projections/projection-definition.ts
/**
 * Projection type definitions.
 *
 * Previously re-exported from es-emmett/processor-definition.
 * Now defined inline after ES removal.
 */

import type { AbstractPowerSyncDatabase } from '@powersync/web';

/** A stored event as seen by projection handlers. */
export interface ProjectedEvent {
  readonly type: string;
  readonly data: Record<string, unknown>;
  readonly globalPosition: bigint;
  readonly createdAt: Date;
}

/** Definition for a projection that handles batches of events. */
export interface ProjectionDefinition {
  readonly id: string;
  readonly version: number;
  readonly canHandle: Set<string>;
  handle(events: readonly ProjectedEvent[], db: AbstractPowerSyncDatabase): Promise<void>;
  truncate(db: AbstractPowerSyncDatabase): Promise<void>;
}

export const DEFAULT_PARTITION = 'global';
