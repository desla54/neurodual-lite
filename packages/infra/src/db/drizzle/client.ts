import { wrapPowerSyncWithDrizzle, type PowerSyncSQLiteDatabase } from '@powersync/drizzle-driver';
import type { AbstractPowerSyncDatabase } from '@powersync/web';
import { drizzleSchema } from './schema';

export type NeuroDualDrizzleDatabase = PowerSyncSQLiteDatabase<typeof drizzleSchema>;

export function createDrizzleClient(db: AbstractPowerSyncDatabase): NeuroDualDrizzleDatabase {
  return wrapPowerSyncWithDrizzle(db, { schema: drizzleSchema });
}
