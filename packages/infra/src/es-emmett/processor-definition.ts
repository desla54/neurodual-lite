/**
 * Stub — processor/projection definition types for backward compatibility.
 */

import type { AbstractPowerSyncDatabase } from '@powersync/web';

export interface ProcessorEvent {
  type: string;
  data: Record<string, unknown>;
  globalPosition: bigint;
  createdAt: Date;
}

export interface ProcessorDefinition {
  id: string;
  version: number;
  canHandle: ReadonlySet<string>;
  handle(events: readonly ProcessorEvent[], db: AbstractPowerSyncDatabase): Promise<void>;
  truncate(db: AbstractPowerSyncDatabase): Promise<void>;
  beginBatch?(): void;
  endBatch?(db: AbstractPowerSyncDatabase): Promise<void>;
}
