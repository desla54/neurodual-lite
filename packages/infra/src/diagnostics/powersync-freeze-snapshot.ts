import { getReadModelWatchDebugSnapshot } from '../read-models/powersync-read-model-adapter';
import { getPowerSyncDebugPort } from '../powersync/debug-port';
import { collectPersistenceHealthSnapshot } from '../ports/persistence-health-adapter';

export interface PowerSyncFreezeSnapshot {
  readonly collectedAt: string;
  readonly pendingCrudCount: number | null;
  readonly pendingCrudByTable: readonly { tableName: string; count: number }[];
  readonly persistenceHealth: Awaited<ReturnType<typeof collectPersistenceHealthSnapshot>>;
  readonly readModelWatches: ReturnType<typeof getReadModelWatchDebugSnapshot>;
}

export async function collectPowerSyncFreezeSnapshot(): Promise<PowerSyncFreezeSnapshot> {
  const debugPort = getPowerSyncDebugPort();
  const [persistenceHealth, pendingCrudCount, pendingCrudByTableRaw] = await Promise.all([
    collectPersistenceHealthSnapshot(),
    debugPort?.pendingCrudCount().catch(() => null) ?? Promise.resolve(null),
    debugPort
      ?.query(
        `SELECT table_name as table_name, COUNT(*) as count
         FROM ps_crud
         GROUP BY table_name
         ORDER BY COUNT(*) DESC, table_name ASC`,
      )
      .catch(() => []),
  ]);

  const pendingCrudByTable = Array.isArray(
    (pendingCrudByTableRaw as { rows?: { _array?: unknown } } | null | undefined)?.rows?._array,
  )
    ? (
        ((pendingCrudByTableRaw as { rows: { _array: unknown[] } }).rows._array ?? []) as Array<{
          table_name?: unknown;
          count?: unknown;
        }>
      )
        .map((row) => ({
          tableName: typeof row.table_name === 'string' ? row.table_name : 'unknown',
          count: Number(row.count ?? 0),
        }))
        .filter((row) => Number.isFinite(row.count) && row.count > 0)
    : [];

  return {
    collectedAt: new Date().toISOString(),
    pendingCrudCount,
    pendingCrudByTable,
    persistenceHealth,
    readModelWatches: getReadModelWatchDebugSnapshot(),
  };
}
