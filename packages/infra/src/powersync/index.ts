/**
 * PowerSync barrel export (NeuroDual Lite)
 */
export {
  getPowerSyncDatabase,
  isPowerSyncInitialized,
  setPowerSyncDatabase,
  closePowerSyncDatabase,
} from './database';

import { getPowerSyncDatabase } from './database';

/**
 * openPowerSyncDatabase - async accessor for the PowerSync DB.
 * In full NeuroDual this lazily initializes. In Lite, wraps getPowerSyncDatabase().
 */
export async function openPowerSyncDatabase() {
  return getPowerSyncDatabase();
}
