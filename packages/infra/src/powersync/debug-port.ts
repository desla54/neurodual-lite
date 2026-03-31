import type { AbstractPowerSyncDatabase } from '@powersync/web';
import {
  getPowerSyncDatabase,
  getPowerSyncRuntimeState,
  isPowerSyncInitialized,
  samplePowerSyncRuntimeMemory,
} from './database';

export interface PowerSyncDebugPort {
  /**
   * Execute a READ-only SQL statement against the PowerSync database.
   * This is intended for DEV debugging only.
   */
  readonly query: (sql: string, parameters?: unknown[]) => Promise<unknown>;
  /** Convenience helper for ps_crud backlog. */
  readonly pendingCrudCount: () => Promise<number>;
  /** Snapshot of the persisted runtime diagnostics. */
  readonly runtimeState: () => ReturnType<typeof getPowerSyncRuntimeState>;
  /** Force a fresh runtime memory sample. */
  readonly sampleMemory: (reason?: string) => Promise<ReturnType<typeof getPowerSyncRuntimeState>>;
}

function isReadOnlySql(sql: string): boolean {
  const normalized = sql
    .trim()
    // strip leading block comments
    .replace(/^\/\*[\s\S]*?\*\//, '')
    // strip leading line comments
    .replace(/^(--[^\n]*\n)+/g, '')
    .trim()
    .toLowerCase();

  // Allow common read-only statements.
  const startsReadOnly = normalized.startsWith('select') || normalized.startsWith('with');
  const startsPragma = normalized.startsWith('pragma');
  if (!startsReadOnly && !startsPragma) return false;

  // Extra guardrail: block obvious write/ddl keywords anywhere in the string.
  return !/\b(insert|update|delete|drop|alter|create|replace|vacuum|attach|detach|begin|commit|rollback)\b/i.test(
    normalized,
  );
}

function requireDb(): AbstractPowerSyncDatabase {
  if (!isPowerSyncInitialized()) {
    throw new Error('PowerSync not initialized.');
  }
  return getPowerSyncDatabase();
}

export function getPowerSyncDebugPort(): PowerSyncDebugPort | null {
  if (!isPowerSyncInitialized()) return null;

  return {
    query: async (sql: string, parameters: unknown[] = []) => {
      if (!isReadOnlySql(sql)) {
        throw new Error('Only read-only SQL is allowed via PowerSyncDebugPort.');
      }
      const db = requireDb();
      return db.execute(sql, parameters);
    },
    pendingCrudCount: async () => {
      const db = requireDb();
      const result = await db.execute(`SELECT COUNT(*) as count FROM ps_crud`);
      return (result.rows?._array?.[0] as { count?: number } | undefined)?.count ?? 0;
    },
    runtimeState: () => getPowerSyncRuntimeState(),
    sampleMemory: async (reason = 'debug-port') => {
      await samplePowerSyncRuntimeMemory(reason, { force: true });
      return getPowerSyncRuntimeState();
    },
  };
}
