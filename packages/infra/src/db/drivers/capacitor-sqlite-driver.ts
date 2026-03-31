/**
 * Capacitor SQLite Driver
 *
 * Native SQLite implementation for iOS and Android via @capacitor-community/sqlite.
 *
 * Storage location:
 * - iOS: Library/LocalDatabase/ (exempt from iCloud backup, ITP exempt)
 * - Android: /data/data/[package]/databases/
 *
 * Advantages:
 * - Native performance
 * - No WebView memory limits
 * - ITP/storage exemption on iOS
 * - Background execution support
 */

import type {
  DriverInfo,
  ExecuteResult,
  QueryResult,
  SQLiteParams,
  TransactionCallback,
} from './sqlite-driver';
import { BaseSQLiteDriver } from './sqlite-driver';

/**
 * Type definitions for @capacitor-community/sqlite v7.x
 * Uses SQLiteConnection wrapper around CapacitorSQLite plugin
 */
interface SQLiteDBConnection {
  open(): Promise<void>;
  close(): Promise<void>;
  execute(
    statements: string,
    transaction?: boolean,
  ): Promise<{ changes?: { changes: number; lastId?: number } }>;
  query(statement: string, values?: unknown[]): Promise<{ values?: unknown[] }>;
  run(
    statement: string,
    values?: unknown[],
    transaction?: boolean,
  ): Promise<{ changes?: { changes: number; lastId?: number } }>;
  isDBOpen(): Promise<{ result?: boolean }>;
  // Native transaction API (available since v5.0.7)
  beginTransaction(): Promise<{ changes?: { changes: number } }>;
  commitTransaction(): Promise<{ changes?: { changes: number } }>;
  rollbackTransaction(): Promise<{ changes?: { changes: number } }>;
  isTransactionActive(): Promise<{ result?: boolean }>;
}

interface SQLiteConnectionType {
  createConnection(
    database: string,
    encrypted: boolean,
    mode: string,
    version: number,
    readonly: boolean,
  ): Promise<SQLiteDBConnection>;
  retrieveConnection(database: string, readonly: boolean): Promise<SQLiteDBConnection>;
  closeConnection(database: string, readonly: boolean): Promise<void>;
  isConnection(database: string, readonly: boolean): Promise<{ result?: boolean }>;
}

/**
 * Get the SQLite connection wrapper
 */
async function getSQLiteConnection(): Promise<SQLiteConnectionType> {
  // Dynamic import to avoid bundling on web
  const { CapacitorSQLite, SQLiteConnection } = await import('@capacitor-community/sqlite');
  return new SQLiteConnection(CapacitorSQLite) as unknown as SQLiteConnectionType;
}

/**
 * Capacitor SQLite Driver implementation using SQLiteConnection (v7.x API)
 */
export class CapacitorSQLiteDriver extends BaseSQLiteDriver {
  private sqlite: SQLiteConnectionType | null = null;
  private db: SQLiteDBConnection | null = null;
  private isOpen = false;

  async init(dbName = 'neurodual'): Promise<void> {
    if (this.state === 'ready') return;
    if (this.state === 'initializing') {
      throw new Error('SQLite initialization already in progress');
    }

    this.setState('initializing');
    this.dbName = dbName;

    try {
      this.sqlite = await getSQLiteConnection();

      // Check if connection already exists
      const connectionExists = await this.sqlite.isConnection(this.dbName, false);

      if (connectionExists.result) {
        // Retrieve existing connection
        this.db = await this.sqlite.retrieveConnection(this.dbName, false);
      } else {
        // Create new connection
        this.db = await this.sqlite.createConnection(
          this.dbName,
          false, // encrypted
          'no-encryption', // mode
          1, // version
          false, // readonly
        );
      }

      // Check if DB is open, if not open it
      const isOpen = await this.db.isDBOpen();
      if (!isOpen.result) {
        await this.db.open();
      }

      this.isOpen = true;
      this.setState('ready');
    } catch (error) {
      this.setState('error');
      const err = error instanceof Error ? error : new Error(String(error));
      this.notifyError(err);
      throw err;
    }
  }

  /**
   * Ensure the database connection is open.
   * iOS may close the connection when the app is backgrounded for extended periods.
   * This method checks and reopens if necessary.
   */
  private async ensureOpen(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const isOpen = await this.db.isDBOpen();
    if (!isOpen.result) {
      // Connection was closed unexpectedly (e.g., iOS backgrounding)
      await this.db.open();
      this.isOpen = true;
    }
  }

  async query<T>(sql: string, params: SQLiteParams = []): Promise<QueryResult<T>> {
    this.assertReady();
    await this.ensureOpen();

    try {
      // biome-ignore lint/style/noNonNullAssertion: db is guaranteed by assertReady + ensureOpen
      const result = await this.db!.query(sql, params);

      const rows = (result.values ?? []) as T[];
      return {
        rows,
        rowCount: rows.length,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.notifyError(err);
      throw err;
    }
  }

  async execute(sql: string, params: SQLiteParams = []): Promise<ExecuteResult> {
    this.assertReady();
    await this.ensureOpen();

    try {
      // biome-ignore lint/style/noNonNullAssertion: db is guaranteed by assertReady + ensureOpen
      const result = await this.db!.run(sql, params, false);

      return {
        rowsAffected: result.changes?.changes ?? 0,
        lastInsertRowId: result.changes?.lastId,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.notifyError(err);
      throw err;
    }
  }

  async executeScript(sql: string): Promise<void> {
    this.assertReady();
    await this.ensureOpen();

    try {
      // biome-ignore lint/style/noNonNullAssertion: db is guaranteed by assertReady + ensureOpen
      await this.db!.execute(sql, true);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.notifyError(err);
      throw err;
    }
  }

  async transaction<T>(callback: TransactionCallback<T>): Promise<T> {
    this.assertReady();
    await this.ensureOpen();

    // Use native Capacitor transaction API (available since v5.0.7)
    // biome-ignore lint/style/noNonNullAssertion: db is guaranteed by assertReady + ensureOpen
    await this.db!.beginTransaction();

    // Verify transaction started successfully
    // biome-ignore lint/style/noNonNullAssertion: db is guaranteed by assertReady + ensureOpen
    const isActive = await this.db!.isTransactionActive();
    if (!isActive.result) {
      throw new Error('Failed to start native transaction');
    }

    try {
      const result = await callback({
        query: <U>(sql: string, params?: SQLiteParams) => this.query<U>(sql, params),
        execute: (sql: string, params?: SQLiteParams) => this.execute(sql, params),
      });

      // biome-ignore lint/style/noNonNullAssertion: db is guaranteed by assertReady + ensureOpen
      await this.db!.commitTransaction();
      return result;
    } catch (error) {
      try {
        // biome-ignore lint/style/noNonNullAssertion: db is guaranteed by assertReady + ensureOpen
        await this.db!.rollbackTransaction();
      } catch {
        // Ignore rollback errors - connection may already be broken
      }
      throw error;
    }
  }

  async close(): Promise<void> {
    if (!this.isOpen || !this.db || !this.sqlite) return;

    try {
      await this.db.close();
      await this.sqlite.closeConnection(this.dbName, false);
      this.isOpen = false;
      this.setState('closed');
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.notifyError(err);
      throw err;
    }
  }

  getInfo(): DriverInfo {
    return {
      type: 'capacitor',
      storageBackend: 'native',
      dbPath: this.dbName,
      isSync: false, // Capacitor plugin is async
    };
  }
}
