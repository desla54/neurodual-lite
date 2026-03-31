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

export { installEventStoreFlushOnPageHide } from './event-store-flush';

export { collectDbDiagnostics, type DbDiagnostics } from './db-diagnostics';
export {
  collectPowerSyncFreezeSnapshot,
  type PowerSyncFreezeSnapshot,
} from './powersync-freeze-snapshot';
