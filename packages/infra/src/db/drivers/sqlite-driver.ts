/**
 * SQLite Driver Interface
 *
 * Common interface for all SQLite driver implementations:
 * - CapacitorSQLiteDriver: Native iOS/Android via @capacitor-community/sqlite
 * - WaSQLiteOPFSDriver: Web desktop via wa-sqlite + OPFS
 * - WaSQLiteIDBDriver: Web mobile via wa-sqlite + IndexedDB
 *
 * This interface abstracts the differences between the underlying implementations,
 * allowing the rest of the codebase to work with a single API.
 */

/**
 * Query result from a SELECT statement
 */
export interface QueryResult<T = unknown> {
  /** Array of rows returned by the query */
  rows: T[];
  /** Number of rows returned */
  rowCount: number;
}

/**
 * Execute result from INSERT/UPDATE/DELETE statements
 */
export interface ExecuteResult {
  /** Number of rows affected */
  rowsAffected: number;
  /** Last inserted row ID (for INSERT with AUTOINCREMENT) */
  lastInsertRowId?: number;
}

/**
 * Transaction callback type
 */
export type TransactionCallback<T> = (tx: SQLiteTransaction) => Promise<T>;

/**
 * Transaction interface for batch operations
 */
export interface SQLiteTransaction {
  /** Execute a query within the transaction */
  query<T>(sql: string, params?: SQLiteParams): Promise<QueryResult<T>>;
  /** Execute a statement within the transaction */
  execute(sql: string, params?: SQLiteParams): Promise<ExecuteResult>;
}

/**
 * SQLite parameter types
 * SQLite supports: NULL, INTEGER, REAL, TEXT, BLOB
 */
export type SQLiteValue = null | number | string | Uint8Array;
export type SQLiteParams = SQLiteValue[];

/**
 * Driver state for lifecycle management
 */
export type DriverState = 'uninitialized' | 'initializing' | 'ready' | 'closed' | 'error';

/**
 * Error callback type
 */
export type DriverErrorCallback = (error: Error) => void;

/**
 * SQLite Driver Interface
 *
 * All driver implementations must implement this interface.
 */
export interface SQLiteDriver {
  /**
   * Initialize the driver and open the database
   * Must be called before any other operations.
   *
   * @param dbName Database name (without extension)
   * @throws Error if initialization fails
   */
  init(dbName?: string): Promise<void>;

  /**
   * Execute a SELECT query and return results
   *
   * @param sql SQL query string with ? placeholders
   * @param params Array of parameter values
   * @returns Query result with rows
   */
  query<T>(sql: string, params?: SQLiteParams): Promise<QueryResult<T>>;

  /**
   * Execute an INSERT/UPDATE/DELETE statement
   *
   * @param sql SQL statement with ? placeholders
   * @param params Array of parameter values
   * @returns Execute result with affected rows
   */
  execute(sql: string, params?: SQLiteParams): Promise<ExecuteResult>;

  /**
   * Execute multiple statements (for schema creation)
   *
   * @param sql SQL script with multiple statements
   */
  executeScript(sql: string): Promise<void>;

  /**
   * Execute operations within a transaction
   *
   * @param callback Async function that receives a transaction object
   * @returns Result from the callback
   */
  transaction<T>(callback: TransactionCallback<T>): Promise<T>;

  /**
   * Close the database connection
   */
  close(): Promise<void>;

  /**
   * Get the current driver state
   */
  getState(): DriverState;

  /**
   * Register an error callback
   *
   * @param callback Function to call when an error occurs
   * @returns Unsubscribe function
   */
  onError(callback: DriverErrorCallback): () => void;

  /**
   * Get driver metadata
   */
  getInfo(): DriverInfo;
}

/**
 * Driver metadata
 */
export interface DriverInfo {
  /** Driver type identifier */
  type: 'capacitor' | 'wa-sqlite-opfs' | 'wa-sqlite-idb';
  /** SQLite version string */
  sqliteVersion?: string;
  /** Storage backend used */
  storageBackend: 'native' | 'opfs' | 'indexeddb';
  /** Database file path/name */
  dbPath: string;
  /** Whether the driver supports synchronous operations */
  isSync: boolean;
}

/**
 * Base class for SQLite drivers with common functionality
 */
export abstract class BaseSQLiteDriver implements SQLiteDriver {
  protected state: DriverState = 'uninitialized';
  protected errorCallbacks = new Set<DriverErrorCallback>();
  protected dbName = 'neurodual';

  abstract init(dbName?: string): Promise<void>;
  abstract query<T>(sql: string, params?: SQLiteParams): Promise<QueryResult<T>>;
  abstract execute(sql: string, params?: SQLiteParams): Promise<ExecuteResult>;
  abstract executeScript(sql: string): Promise<void>;
  abstract transaction<T>(callback: TransactionCallback<T>): Promise<T>;
  abstract close(): Promise<void>;
  abstract getInfo(): DriverInfo;

  getState(): DriverState {
    return this.state;
  }

  onError(callback: DriverErrorCallback): () => void {
    this.errorCallbacks.add(callback);
    return () => this.errorCallbacks.delete(callback);
  }

  protected notifyError(error: Error): void {
    for (const callback of this.errorCallbacks) {
      try {
        callback(error);
      } catch {
        // Ignore callback errors
      }
    }
  }

  protected setState(newState: DriverState): void {
    this.state = newState;
  }

  protected assertReady(): void {
    if (this.state !== 'ready') {
      throw new Error(`SQLite driver not ready (state: ${this.state})`);
    }
  }
}
