export {
  // Watchdog core
  startFreezeWatchdog,
  stopFreezeWatchdog,
  isWatchdogRunning,
  // Context tracking
  setWatchdogContext,
  clearWatchdogContext,
  withWatchdogContext,
  withWatchdogContextAsync,
  // Events & history
  onFreeze,
  onLongTask,
  getFreezeHistory,
  // Long Tasks API
  enableLongTaskObserver,
  disableLongTaskObserver,
  // Types
  type FreezeEvent,
  type LongTaskEvent,
} from './freeze-watchdog';

export function installEventStoreFlushOnPageHide(_timeoutMs = 2000): () => void {
  return () => {};
}

export { collectDbDiagnostics, type DbDiagnostics } from './db-diagnostics';

// powersync-freeze-snapshot removed in Lite mode (cloud-sync diagnostic)
export interface PowerSyncFreezeSnapshot {
  readonly collectedAt: string;
  readonly pendingCrudCount: number | null;
  readonly pendingCrudByTable: readonly { tableName: string; count: number }[];
  readonly persistenceHealth: unknown;
  readonly readModelWatches: unknown;
}
export async function collectPowerSyncFreezeSnapshot(): Promise<PowerSyncFreezeSnapshot> {
  return {
    collectedAt: new Date().toISOString(),
    pendingCrudCount: null,
    pendingCrudByTable: [],
    persistenceHealth: null,
    readModelWatches: null,
  };
}
