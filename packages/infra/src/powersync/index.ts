/**
 * PowerSync barrel export (NeuroDual Lite)
 */
export {
  openPowerSyncDatabase,
  getPowerSyncDatabase,
  isPowerSyncInitialized,
  closePowerSyncDatabase,
  connectPowerSyncDatabase,
  initPowerSyncDatabase,
  disconnectPowerSync,
  reconnectPowerSync,
  // Runtime state
  getPowerSyncRuntimeState,
  setPowerSyncRuntimeState,
  recordPowerSyncSyncGate,
  samplePowerSyncRuntimeMemory,
  appendPowerSyncRuntimeEvent,
  type PowerSyncRuntimeState,
  type PowerSyncRuntimeEvent,
  type VfsType,
  type OpfsDiagnostics,
  type LifecycleDiagnostics,
  type ReconnectDiagnostics,
  type SyncGateDiagnostics,
  type MemoryDiagnostics,
  type PowerSyncRuntimeHealth,
} from './database';

export { createPowerSyncPersistenceAdapter, PowerSyncPersistenceAdapter } from './powersync-persistence-adapter';
export { AppSchema } from './schema';
export { isLikelyFatalPowerSyncStorageError, isLikelyClosedPowerSyncError } from './runtime-policy';
export type { WebPowerSyncVfs } from './types';
