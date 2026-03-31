import type { SQL } from 'drizzle-orm';
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core';
import type { NeuroDualDrizzleDatabase } from './client';

interface DrizzleBackedPersistence {
  getDrizzleDb(): NeuroDualDrizzleDatabase;
}

interface QueryBackedPersistence {
  query<T extends object>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

interface ExecuteBackedPersistence {
  execute(sql: string, params?: unknown[]): Promise<void>;
}

const sqliteDialect = new SQLiteSyncDialect();

const DRIZZLE_REQUIRED_ERROR =
  '[Drizzle] Persistence adapter must expose getDrizzleDb(). Use PowerSyncPersistenceAdapter.';
const DRIZZLE_OR_SQL_REQUIRED_ERROR =
  '[Drizzle] Persistence adapter must expose getDrizzleDb() or SQL query()/execute() methods.';

function compileSql(statement: SQL): { sql: string; params: unknown[] } {
  const compiled = sqliteDialect.sqlToQuery(statement);
  return {
    sql: compiled.sql,
    params: [...compiled.params],
  };
}

function getQueryBackedPersistence(persistence: unknown): QueryBackedPersistence | null {
  const candidate = persistence as Partial<QueryBackedPersistence>;
  return typeof candidate.query === 'function' ? (candidate as QueryBackedPersistence) : null;
}

function getExecuteBackedPersistence(persistence: unknown): ExecuteBackedPersistence | null {
  const candidate = persistence as Partial<ExecuteBackedPersistence>;
  return typeof candidate.execute === 'function' ? (candidate as ExecuteBackedPersistence) : null;
}

export function requireDrizzleDb(persistence: unknown): NeuroDualDrizzleDatabase {
  const candidate = persistence as unknown as Partial<DrizzleBackedPersistence>;
  if (typeof candidate.getDrizzleDb !== 'function') {
    throw new Error(DRIZZLE_REQUIRED_ERROR);
  }
  return candidate.getDrizzleDb();
}

export async function drizzleAll<T extends object>(
  persistence: unknown,
  statement: SQL,
): Promise<readonly T[]> {
  const drizzleDb = (persistence as Partial<DrizzleBackedPersistence>).getDrizzleDb?.();
  if (drizzleDb) {
    return drizzleDb.all<T>(statement);
  }

  const queryBacked = getQueryBackedPersistence(persistence);
  if (!queryBacked) {
    throw new Error(DRIZZLE_OR_SQL_REQUIRED_ERROR);
  }

  const compiled = compileSql(statement);
  const result = await queryBacked.query<T>(compiled.sql, compiled.params);
  return result.rows;
}

export async function drizzleGet<T extends object>(
  persistence: unknown,
  statement: SQL,
): Promise<T | undefined> {
  const drizzleDb = (persistence as Partial<DrizzleBackedPersistence>).getDrizzleDb?.();
  if (drizzleDb) {
    return drizzleDb.get<T>(statement);
  }

  const queryBacked = getQueryBackedPersistence(persistence);
  if (!queryBacked) {
    throw new Error(DRIZZLE_OR_SQL_REQUIRED_ERROR);
  }

  const compiled = compileSql(statement);
  const result = await queryBacked.query<T>(compiled.sql, compiled.params);
  return result.rows[0];
}

export async function drizzleRun(persistence: unknown, statement: SQL): Promise<void> {
  const drizzleDb = (persistence as Partial<DrizzleBackedPersistence>).getDrizzleDb?.();
  if (drizzleDb) {
    await drizzleDb.run(statement);
    return;
  }

  const executeBacked = getExecuteBackedPersistence(persistence);
  if (!executeBacked) {
    throw new Error(DRIZZLE_OR_SQL_REQUIRED_ERROR);
  }

  const compiled = compileSql(statement);
  await executeBacked.execute(compiled.sql, compiled.params);
}
