import type { PersistenceWriteTransaction } from '@neurodual/logic';
import type { AbstractPowerSyncDatabase } from '@powersync/web';
import { bulkInsert } from '../db/sql-executor';

export interface ProjectionSqlExecutor {
  execute(sql: string, params?: unknown[]): Promise<unknown>;
  getAll?<T extends object>(sql: string, params?: readonly unknown[]): Promise<T[]>;
  query?<T extends object>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

type QueryableExecutor =
  | ProjectionSqlExecutor
  | PersistenceWriteTransaction
  | AbstractPowerSyncDatabase;

function extractRows<T>(result: unknown): T[] {
  if (typeof result !== 'object' || result === null) return [];
  const rowsValue = (result as Record<string, unknown>)['rows'];
  if (Array.isArray(rowsValue)) return rowsValue as T[];
  if (typeof rowsValue !== 'object' || rowsValue === null) return [];
  const arr = (rowsValue as Record<string, unknown>)['_array'];
  return Array.isArray(arr) ? (arr as T[]) : [];
}

export async function queryRows<T extends object>(
  executor: QueryableExecutor,
  sql: string,
  params: readonly unknown[] = [],
): Promise<T[]> {
  if ('getAll' in executor && typeof executor.getAll === 'function') {
    const getAll = executor.getAll as unknown as (
      this: QueryableExecutor,
      querySql: string,
      queryParams?: readonly unknown[],
    ) => Promise<T[]>;
    return getAll.call(executor, sql, params);
  }

  if ('query' in executor && typeof executor.query === 'function') {
    const query = executor.query as unknown as (
      this: QueryableExecutor,
      querySql: string,
      queryParams?: unknown[],
    ) => Promise<{ rows: T[] }>;
    const result = await query.call(executor, sql, [...params]);
    return result.rows;
  }

  const result = await executor.execute(sql, [...params]);
  return extractRows<T>(result);
}

export async function loadAppliedProjectionEffectKeys(
  executor: QueryableExecutor,
  projectionId: string,
  effectKeys: readonly string[],
): Promise<Set<string>> {
  if (effectKeys.length === 0) return new Set();

  const placeholders = effectKeys.map(() => '?').join(', ');
  const rows = await queryRows<{ effect_key: string }>(
    executor,
    `SELECT effect_key
       FROM projection_effects
      WHERE projection_id = ?
        AND effect_key IN (${placeholders})`,
    [projectionId, ...effectKeys],
  );

  return new Set(rows.map((row) => row.effect_key));
}

export async function storeProjectionEffects(
  executor: { execute(sql: string, params?: unknown[]): Promise<unknown> },
  projectionId: string,
  effectKeys: readonly string[],
): Promise<void> {
  if (effectKeys.length === 0) return;

  await bulkInsert(
    executor,
    'projection_effects',
    ['id', 'projection_id', 'effect_key', 'applied_at'],
    effectKeys.map((effectKey) => [
      `${projectionId}:${effectKey}`,
      projectionId,
      effectKey,
      new Date().toISOString(),
    ]),
  );
}

export async function clearProjectionEffects(
  executor: { execute(sql: string, params?: unknown[]): Promise<unknown> },
  projectionId: string,
): Promise<void> {
  await executor.execute(`DELETE FROM projection_effects WHERE projection_id = ?`, [projectionId]);
}
