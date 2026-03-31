/**
 * PowerSync Supabase Connector
 *
 * Handles authentication and data upload to the PowerSync server.
 * Uses Supabase JWT for authentication.
 */

import {
  type AbstractPowerSyncDatabase,
  type CrudEntry,
  type PowerSyncBackendConnector,
  UpdateType,
} from '@powersync/web';
import { getSupabase, isSupabaseConfigured } from '../supabase/client';
import { powerSyncLog } from '../logger';

/**
 * PostgreSQL error codes that indicate fatal errors (non-retryable).
 * These errors mean the data itself is invalid and retrying won't help.
 * See: https://www.postgresql.org/docs/current/errcodes-appendix.html
 */
const FATAL_RESPONSE_CODES = [
  /^22.../, // Data exception (invalid input, out of range, etc.)
  /^23.../, // Integrity constraint violation (FK, unique, check, etc.)
  /^42.../, // Syntax error or access rule violation
];

/**
 * Maximum number of operations merged into a single API request.
 * Larger batches = faster sync, but watch for payload size limits.
 */
const MERGE_BATCH_LIMIT = 100;
let deletedSessionsUploadDisabledReason: string | null = null;

function normalizeSmallInt01(value: unknown): 0 | 1 | undefined | null {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (value === true || value === 'true') return 1;
  if (value === false || value === 'false') return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value ? 1 : 0;
  return undefined;
}

function normalizeUserScopedRowForSupabase(
  row: Record<string, unknown>,
  authUserId: string,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row };
  // Always enforce auth.uid() on upload; this prevents RLS failures when local rows
  // were created before login and still have user_id='local'/NULL/garbage.
  out['user_id'] = authUserId;
  return out;
}

function normalizeEmtMessageRowForSupabase(
  row: Record<string, unknown>,
  authUserId: string,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row };

  // Some Supabase deployments still have a NOT NULL user_id column on emt_messages.
  // Always enforce auth.uid() on upload to avoid 23502 constraint failures.
  out['user_id'] = authUserId;

  const isArchived = normalizeSmallInt01(out['is_archived']);
  if (isArchived !== undefined) out['is_archived'] = isArchived;

  // Enforce auth uid in message_data JSON (RLS typically checks $.data.userId).
  const rawMessageData = out['message_data'];
  const rewriteToString = (value: unknown): string | null => {
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object') return JSON.stringify(value);
    return null;
  };
  const messageDataStr = rewriteToString(rawMessageData);
  if (messageDataStr) {
    try {
      const parsed = JSON.parse(messageDataStr) as unknown;
      if (parsed && typeof parsed === 'object') {
        const obj = parsed as Record<string, unknown>;
        const data = obj['data'];
        if (data && typeof data === 'object') {
          (data as Record<string, unknown>)['userId'] = authUserId;
          obj['data'] = data;
          out['message_data'] = JSON.stringify(obj);
        } else {
          out['message_data'] = messageDataStr;
        }
      } else {
        out['message_data'] = messageDataStr;
      }
    } catch {
      // Keep the original string if it's not JSON (shouldn't happen, but don't brick sync).
      out['message_data'] = messageDataStr;
    }
  }

  return out;
}

/**
 * Check if a Supabase/PostgreSQL error is fatal (non-retryable).
 * Fatal errors mean the data itself is invalid - retrying won't help.
 */
function isFatalError(error: { code?: string; message?: string } | null): boolean {
  const code = error?.code;
  if (!code) return false;
  return FATAL_RESPONSE_CODES.some((pattern) => pattern.test(code));
}

function isDeletedSessionsLegacyEventsFatalError(
  table: CrudTable,
  error: { code?: string; message?: string } | null,
): boolean {
  return (
    table === 'deleted_sessions' &&
    error?.code === '42P01' &&
    typeof error.message === 'string' &&
    error.message.includes('relation "public.events" does not exist')
  );
}

/**
 * Split an array into chunks of specified size.
 */
function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

type CrudTable = 'emt_messages' | 'deleted_sessions' | 'user_resets';

function isCrudTable(value: string): value is CrudTable {
  return value === 'emt_messages' || value === 'deleted_sessions' || value === 'user_resets';
}

function isDevRuntime(): boolean {
  const viteEnv =
    typeof import.meta !== 'undefined'
      ? ((import.meta as unknown as { env?: Record<string, unknown> }).env ?? undefined)
      : undefined;
  if (typeof viteEnv?.['DEV'] === 'boolean') return viteEnv['DEV'] as boolean;
  return typeof process !== 'undefined' ? process.env?.['NODE_ENV'] !== 'production' : false;
}

/**
 * PowerSync server endpoint (self-hosted on Hetzner)
 */
function getPowerSyncUrl(): string {
  const viteEnv =
    typeof import.meta !== 'undefined'
      ? ((import.meta as { env?: Record<string, unknown> }).env ?? undefined)
      : undefined;

  const url =
    (typeof viteEnv?.['VITE_POWERSYNC_URL'] === 'string'
      ? (viteEnv['VITE_POWERSYNC_URL'] as string)
      : undefined) ||
    (typeof process !== 'undefined' ? process.env?.['VITE_POWERSYNC_URL'] : undefined);

  const allowInsecureHttp =
    (typeof viteEnv?.['VITE_POWERSYNC_ALLOW_INSECURE_HTTP'] === 'string'
      ? viteEnv['VITE_POWERSYNC_ALLOW_INSECURE_HTTP'] === '1' ||
        viteEnv['VITE_POWERSYNC_ALLOW_INSECURE_HTTP'] === 'true'
      : false) ||
    (typeof process !== 'undefined'
      ? process.env?.['VITE_POWERSYNC_ALLOW_INSECURE_HTTP'] === '1' ||
        process.env?.['VITE_POWERSYNC_ALLOW_INSECURE_HTTP'] === 'true'
      : false);

  const isProd =
    (typeof viteEnv?.['PROD'] === 'boolean' ? (viteEnv['PROD'] as boolean) : undefined) ??
    (typeof process !== 'undefined' ? process.env?.['NODE_ENV'] === 'production' : false);

  const isDev =
    (typeof viteEnv?.['DEV'] === 'boolean' ? (viteEnv['DEV'] as boolean) : undefined) ??
    (typeof process !== 'undefined' ? process.env?.['NODE_ENV'] !== 'production' : true);

  if (!url) {
    if (isDev) return 'http://localhost:8080';
    throw new Error('VITE_POWERSYNC_URL is required in production.');
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid VITE_POWERSYNC_URL: ${url}`);
  }

  const isLocalhost =
    parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '::1';

  if (parsed.protocol !== 'https:' && !(isDev && (isLocalhost || allowInsecureHttp))) {
    const suggestion = isProd
      ? 'Use an HTTPS endpoint.'
      : 'Use HTTPS (or localhost for dev, or set VITE_POWERSYNC_ALLOW_INSECURE_HTTP=true).';
    throw new Error(`Insecure PowerSync URL (${url}). ${suggestion}`);
  }

  // Normalize (avoid accidental trailing slash differences).
  const normalizedUrl = url.replace(/\/+$/, '');
  powerSyncLog.info('Using endpoint URL:', normalizedUrl);
  return normalizedUrl;
}

/**
 * Connector for PowerSync that integrates with Supabase authentication
 * and handles uploads for PowerSync CRUD tables.
 */
export class SupabasePowerSyncConnector implements PowerSyncBackendConnector {
  /**
   * Fetch credentials for PowerSync authentication.
   * Returns the PowerSync endpoint and Supabase JWT token.
   */
  async fetchCredentials(): Promise<{
    endpoint: string;
    token: string;
    expiresAt?: Date;
  }> {
    if (!isSupabaseConfigured()) {
      throw new Error('Supabase is not configured. Cannot authenticate with PowerSync.');
    }

    const supabase = getSupabase();
    const { data, error } = await supabase.auth.getSession();

    if (error) {
      throw new Error(`Failed to get Supabase session: ${error.message}`);
    }

    if (!data.session) {
      throw new Error('No active Supabase session. User must be authenticated.');
    }

    let session = data.session;

    // Best-effort refresh when the token is close to expiry.
    // PowerSync keeps the token for the duration of a sync connection.
    let expiresAtMs =
      typeof (session as unknown as { expires_at?: unknown }).expires_at === 'number'
        ? ((session as unknown as { expires_at: number }).expires_at as number) * 1000
        : null;
    if (expiresAtMs && expiresAtMs - Date.now() < 30_000) {
      try {
        const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError) {
          throw refreshError;
        }
        if (refreshed.session) {
          session = refreshed.session;
          expiresAtMs =
            typeof (session as unknown as { expires_at?: unknown }).expires_at === 'number'
              ? ((session as unknown as { expires_at: number }).expires_at as number) * 1000
              : null;
        }
      } catch (refreshError) {
        // If the token is already expired and refresh failed, fail fast instead of
        // opening PowerSync with a guaranteed-invalid JWT.
        if (expiresAtMs !== null && expiresAtMs <= Date.now()) {
          const message =
            refreshError instanceof Error ? refreshError.message : String(refreshError);
          throw new Error(`Failed to refresh expiring Supabase session: ${message}`);
        }
      }
    }

    if (expiresAtMs && expiresAtMs <= Date.now()) {
      throw new Error('Supabase session is expired. User must re-authenticate.');
    }

    return {
      endpoint: getPowerSyncUrl(),
      token: session.access_token,
      ...(expiresAtMs ? { expiresAt: new Date(expiresAtMs) } : {}),
    };
  }

  /**
   * Upload local changes to Supabase.
   * Called by PowerSync when there are pending local changes.
   *
   * Strategy:
   * - PUT: Batch upsert to Supabase (chunked by MERGE_BATCH_LIMIT)
   * - PATCH: Individual updates (each has different data)
   * - DELETE: Table-specific semantics (archive or hard delete)
   *
   * Error handling:
   * - Fatal errors (data invalid): Complete transaction to unblock queue
   * - Retryable errors (network, etc.): Throw to let PowerSync retry
   */
  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    if (!isSupabaseConfigured()) {
      console.warn('[PowerSync] Supabase not configured, skipping upload');
      return;
    }

    const supabase = getSupabase();
    const transaction = await database.getNextCrudTransaction();

    if (!transaction) {
      if (isDevRuntime()) {
        try {
          const rs = await database.execute(`SELECT COUNT(*) as count FROM ps_crud`);
          const count = (rs.rows?._array?.[0] as { count?: number } | undefined)?.count ?? 0;
          if (count > 0) {
            console.warn('[PowerSync] No CRUD transaction returned, but ps_crud has rows:', count);
          }
        } catch {
          // Ignore - purely diagnostic
        }
      }
      return;
    }

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      throw new Error(
        `Failed to get Supabase session for PowerSync upload: ${sessionError.message}`,
      );
    }
    const authUserId = sessionData.session?.user?.id;
    if (!authUserId) {
      throw new Error('No active Supabase session for PowerSync upload');
    }

    const opsByTable = new Map<
      CrudTable,
      { put: Record<string, unknown>[]; patch: CrudEntry[]; del: CrudEntry[] }
    >();
    const ensureBuckets = (table: CrudTable) => {
      const existing = opsByTable.get(table);
      if (existing) return existing;
      const created = { put: [], patch: [], del: [] };
      opsByTable.set(table, created);
      return created;
    };

    for (const op of transaction.crud) {
      if (!isCrudTable(op.table)) {
        // Do not silently drop ops: this would permanently lose writes.
        throw new Error(`[PowerSync] Unsupported CRUD table: ${op.table}`);
      }

      const buckets = ensureBuckets(op.table);
      switch (op.op) {
        case UpdateType.PUT: {
          buckets.put.push({
            ...(op.opData as Record<string, unknown>),
            id: op.id,
          });
          break;
        }
        case UpdateType.PATCH: {
          buckets.patch.push(op);
          break;
        }
        case UpdateType.DELETE: {
          buckets.del.push(op);
          break;
        }
        default: {
          throw new Error(`[PowerSync] Unknown operation type: ${String(op.op)}`);
        }
      }
    }

    const debug: Record<string, unknown> = {
      txId: (transaction as unknown as { tx_id?: unknown }).tx_id,
    };
    for (const [table, buckets] of opsByTable) {
      debug[`${table}.put`] = buckets.put.length;
      debug[`${table}.patch`] = buckets.patch.length;
      debug[`${table}.del`] = buckets.del.length;
    }
    powerSyncLog.debug('CRUD batch:', debug);

    let hasFatalError = false;
    let lastError: Error | null = null;

    try {
      const normalizeRow = (
        table: CrudTable,
        row: Record<string, unknown>,
      ): Record<string, unknown> => {
        switch (table) {
          case 'emt_messages':
            return normalizeEmtMessageRowForSupabase(row, authUserId);
          case 'deleted_sessions':
          case 'user_resets':
            return normalizeUserScopedRowForSupabase(row, authUserId);
          default:
            return row;
        }
      };

      const processPut = async (
        table: CrudTable,
        putRows: Record<string, unknown>[],
      ): Promise<void> => {
        if (putRows.length === 0) return;
        if (table === 'deleted_sessions' && deletedSessionsUploadDisabledReason) {
          hasFatalError = true;
          return;
        }
        const batches = chunk(putRows, MERGE_BATCH_LIMIT);
        for (const batch of batches) {
          const normalizedBatch = batch.map((r) => normalizeRow(table, r));
          const { error } = await supabase
            .from(table)
            // biome-ignore lint/suspicious/noExplicitAny: Dynamic CRUD data from PowerSync
            .upsert(normalizedBatch as any, { onConflict: 'id' });
          if (!error) continue;

          if (!isFatalError(error)) {
            throw new Error(`Failed to batch upsert ${table}: ${error.message}`);
          }

          if (isDeletedSessionsLegacyEventsFatalError(table, error)) {
            deletedSessionsUploadDisabledReason =
              'Supabase deleted_sessions trigger still references public.events';
            console.error(
              `[PowerSync] Disabling deleted_sessions uploads for this session: ${deletedSessionsUploadDisabledReason}`,
              error,
            );
            hasFatalError = true;
            return;
          }

          console.warn(
            `[PowerSync] Batch fatal upsert error on ${table}, falling back to singles:`,
            error,
          );
          for (const record of normalizedBatch) {
            const { error: singleError } = await supabase
              .from(table)
              // biome-ignore lint/suspicious/noExplicitAny: Dynamic CRUD data from PowerSync
              .upsert(record as any, { onConflict: 'id' });
            if (!singleError) continue;
            if (isDeletedSessionsLegacyEventsFatalError(table, singleError)) {
              deletedSessionsUploadDisabledReason =
                'Supabase deleted_sessions trigger still references public.events';
              console.error(
                `[PowerSync] Disabling deleted_sessions uploads for this session: ${deletedSessionsUploadDisabledReason}`,
                singleError,
              );
              hasFatalError = true;
              return;
            }
            if (isFatalError(singleError)) {
              console.error(`[PowerSync] Fatal upsert error on ${table} (skipping):`, singleError);
              hasFatalError = true;
              continue;
            }
            throw new Error(`Failed to upsert ${table}: ${singleError.message}`);
          }
        }
      };

      const processPatch = async (table: CrudTable, patchOps: CrudEntry[]): Promise<void> => {
        if (table === 'deleted_sessions' && deletedSessionsUploadDisabledReason) {
          hasFatalError = true;
          return;
        }
        for (const op of patchOps) {
          const normalized = normalizeRow(table, op.opData as unknown as Record<string, unknown>);
          const { error } = await supabase
            .from(table)
            // biome-ignore lint/suspicious/noExplicitAny: Dynamic CRUD data from PowerSync
            .update(normalized as any)
            .eq('id', op.id);
          if (!error) continue;
          if (isDeletedSessionsLegacyEventsFatalError(table, error)) {
            deletedSessionsUploadDisabledReason =
              'Supabase deleted_sessions trigger still references public.events';
            console.error(
              `[PowerSync] Disabling deleted_sessions uploads for this session: ${deletedSessionsUploadDisabledReason}`,
              error,
            );
            hasFatalError = true;
            return;
          }
          if (isFatalError(error)) {
            console.error(
              `[PowerSync] Fatal patch error on ${table} for ${op.id} (skipping):`,
              error,
            );
            hasFatalError = true;
            continue;
          }
          throw new Error(`Failed to patch ${table} ${op.id}: ${error.message}`);
        }
      };

      const processDelete = async (table: CrudTable, delOps: CrudEntry[]): Promise<void> => {
        if (delOps.length === 0) return;
        if (table === 'deleted_sessions' && deletedSessionsUploadDisabledReason) {
          hasFatalError = true;
          return;
        }

        const ids = delOps.map((op) => op.id);

        if (table === 'emt_messages') {
          const batches = chunk(ids, MERGE_BATCH_LIMIT);
          for (const batch of batches) {
            const { error } = await supabase
              .from('emt_messages')
              // biome-ignore lint/suspicious/noExplicitAny: Supabase schema uses smallint flags (0/1) instead of boolean
              .update({ is_archived: 1 } as any)
              .in('id', batch);
            if (!error) continue;
            if (isFatalError(error)) {
              console.error('[PowerSync] Fatal archive error on emt_messages (skipping):', error);
              hasFatalError = true;
              continue;
            }
            throw new Error(`Failed to archive emt_messages: ${error.message}`);
          }
          return;
        }

        // deleted_sessions/user_resets: hard delete
        const batches = chunk(ids, MERGE_BATCH_LIMIT);
        for (const batch of batches) {
          const { error } = await supabase.from(table).delete().in('id', batch);
          if (!error) continue;
          if (isDeletedSessionsLegacyEventsFatalError(table, error)) {
            deletedSessionsUploadDisabledReason =
              'Supabase deleted_sessions trigger still references public.events';
            console.error(
              `[PowerSync] Disabling deleted_sessions uploads for this session: ${deletedSessionsUploadDisabledReason}`,
              error,
            );
            hasFatalError = true;
            return;
          }
          if (isFatalError(error)) {
            console.error(`[PowerSync] Fatal delete error on ${table} (skipping):`, error);
            hasFatalError = true;
            continue;
          }
          throw new Error(`Failed to delete ${table}: ${error.message}`);
        }
      };

      // Process in deterministic order for easier debugging.
      const order: readonly CrudTable[] = ['emt_messages', 'deleted_sessions', 'user_resets'];
      for (const table of order) {
        const buckets = opsByTable.get(table);
        if (!buckets) continue;
        await processPut(table, buckets.put);
        await processPatch(table, buckets.patch);
        await processDelete(table, buckets.del);
      }

      // Complete transaction - even if some fatal errors occurred
      // This prevents the queue from being blocked by invalid data
      await transaction.complete();

      if (hasFatalError) {
        console.warn('[PowerSync] Transaction completed with fatal errors (some ops skipped)');
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error('[PowerSync] Upload failed:', lastError);

      // Don't complete transaction for retryable errors - PowerSync will retry
      throw lastError;
    }
  }
}

/**
 * Singleton instance of the connector
 */
let connectorInstance: SupabasePowerSyncConnector | null = null;

/**
 * Get the PowerSync connector instance (singleton)
 */
export function getPowerSyncConnector(): SupabasePowerSyncConnector {
  if (!connectorInstance) {
    connectorInstance = new SupabasePowerSyncConnector();
  }
  return connectorInstance;
}

/**
 * Reset the connector (useful for testing or logout)
 */
export function resetPowerSyncConnector(): void {
  connectorInstance = null;
  deletedSessionsUploadDisabledReason = null;
}
