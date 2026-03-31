export type PowerSyncPlatform = 'capacitor-native' | 'web';

/**
 * Web VFS options for PowerSync
 *
 * - opfs: OPFSCoopSyncVFS (recommended default when available)
 * - opfs-pool: AccessHandlePoolVFS (OPFS fallback with different trade-offs)
 * - idb: IDBBatchAtomicVFS (universal fallback)
 */
export type WebPowerSyncVfs = 'opfs' | 'opfs-pool' | 'idb';
