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
  recordPowerSyncSyncGate,
  samplePowerSyncRuntimeMemory,
  type PowerSyncRuntimeState,
} from './database';

export { createPowerSyncPersistenceAdapter, PowerSyncPersistenceAdapter } from './powersync-persistence-adapter';
export { PowerSyncAppSchema as AppSchema } from './schema';
export { isLikelyFatalPowerSyncStorageError, isLikelyClosedPowerSyncError } from './runtime-policy';
export type { WebPowerSyncVfs } from './types';
