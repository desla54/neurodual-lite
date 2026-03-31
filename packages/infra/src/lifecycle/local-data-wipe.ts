/**
 * Local data wipe utilities
 *
 * Used for:
 * - "Reset my data" (wipe local caches + DB after cloud reset)
 * - Logout / invalid session (prevent cross-account leakage)
 * - Remote reset propagation (wipe on other devices)
 */

import { isCapacitorNative } from '../db/platform-detector';
import { clearAllRecoveryData } from './session-recovery';
import { closePowerSyncDatabase, isPowerSyncInitialized } from '../powersync/database';

const POWERSYNC_DB_FILENAME = 'neurodual-powersync.db';

async function deleteIndexedDb(name: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  await new Promise<void>((resolve) => {
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const settle = () => {
      if (settled) return;
      settled = true;
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      resolve();
    };

    // Some test environments / browsers may never fire events; don't hang forever.
    timeoutId = setTimeout(settle, 1000);

    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = settle;
    request.onerror = settle;
    request.onblocked = settle;
  });
}

/**
 * Wipe ALL local persistence for this device (PowerSync + legacy storage).
 *
 * This is intentionally aggressive: it deletes the underlying database storage
 * so it also clears PowerSync's internal tables (ps_crud, checkpoints, etc).
 *
 * Callers typically reload the app afterwards to re-initialize cleanly.
 */
export async function wipeLocalDeviceData(): Promise<{ success: boolean; error?: string }> {
  try {
    const isTest = typeof process !== 'undefined' && process.env?.['NODE_ENV'] === 'test';

    // Stop / close DB first to avoid file locks.
    if (isPowerSyncInitialized()) {
      await closePowerSyncDatabase();
    }

    // Clear lightweight recovery data (localStorage keys).
    clearAllRecoveryData();

    // Avoid interacting with browser storage APIs in unit tests (can hang in jsdom/fakes).
    if (isTest) {
      return { success: true };
    }

    if (isCapacitorNative()) {
      // Native (iOS/Android) via @capacitor-community/sqlite
      try {
        const { CapacitorSQLite } = await import('@capacitor-community/sqlite');
        await CapacitorSQLite.deleteDatabase({ database: POWERSYNC_DB_FILENAME, readonly: false });
      } catch (err) {
        // Best-effort (web build, plugin missing, or db not present)
        console.warn('[wipeLocalDeviceData] Native deleteDatabase failed (ignored):', err);
      }
      return { success: true };
    }

    // Web (OPFS) storage
    if (typeof navigator?.storage?.getDirectory === 'function') {
      try {
        const root = await navigator.storage.getDirectory();
        await root.removeEntry(POWERSYNC_DB_FILENAME);
      } catch (err) {
        // Non-fatal - may be unsupported or already deleted.
        console.warn('[wipeLocalDeviceData] OPFS delete failed (ignored):', err);
      }
    }

    // Web (IndexedDB) storage
    await deleteIndexedDb('powersync');
    await deleteIndexedDb('idb-batch-atomic');

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}
