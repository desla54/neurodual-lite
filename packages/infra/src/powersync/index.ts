/**
 * PowerSync Module Exports
 *
 * Public API for PowerSync integration.
 */

// Schema
export { PowerSyncAppSchema } from './schema';
export type { PowerSyncDatabase, PowerSyncEventRow, PowerSyncEventSignalRow } from './schema';
export type { PowerSyncPlatform, WebPowerSyncVfs } from './types';

// Database lifecycle
export {
  openPowerSyncDatabase,
  initPowerSyncDatabase,
  connectPowerSyncDatabase,
  getPowerSyncDatabase,
  getPowerSyncRuntimeState,
  isPowerSyncInitialized,
  closePowerSyncDatabase,
  disconnectPowerSync,
  reconnectPowerSync,
  recordPowerSyncLifecycleSignal,
  recordPowerSyncReconnectStart,
  recordPowerSyncReconnectResult,
  recordPowerSyncSyncGate,
  samplePowerSyncRuntimeMemory,
} from './database';

// Connector (mostly internal, but exported for testing)
export {
  getPowerSyncConnector,
  resetPowerSyncConnector,
  SupabasePowerSyncConnector,
} from './supabase-connector';

// Event watchers
export {
  watchUserEvents,
  watchUserEventsByTypes,
  watchUserEventSignalsByTypes,
  watchSessionEvents,
  watchSessionEnded,
  getUserEvents,
  getSessionEvents,
} from './event-watcher';
export type { EventWatchCallback, EventSignalWatchCallback } from './event-watcher';

// Sync adapter (implements SyncPort)
export {
  powerSyncSyncAdapter,
  getPowerSyncSyncAdapter,
  resetPowerSyncSyncAdapter,
  startPowerSyncStatusWatcher,
  stopPowerSyncStatusWatcher,
} from './powersync-sync-adapter';

// Debug (DEV-only usage; never expose the raw DB outside infra)
export { getPowerSyncDebugPort, type PowerSyncDebugPort } from './debug-port';

// Runtime policy helpers
export {
  isLikelyFatalPowerSyncStorageError,
  markPowerSyncFallbackToIdb,
  readPowerSyncVfsPreference,
  writePowerSyncVfsPreference,
  clearPowerSyncVfsPreference,
} from './runtime-policy';
