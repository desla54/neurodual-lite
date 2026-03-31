import { describe, it, expect, beforeEach } from 'bun:test';
import {
  BaseSQLiteDriver,
  type SQLiteDriver,
  type QueryResult,
  type ExecuteResult,
  type DriverInfo,
  type DriverState,
  type SQLiteTransaction,
  type TransactionCallback,
  type SQLiteValue,
  type SQLiteParams,
} from './sqlite-driver';

/**
 * Concrete test implementation of BaseSQLiteDriver
 * to verify the abstract class's shared behavior.
 */
class TestSQLiteDriver extends BaseSQLiteDriver {
  public initCalled = false;
  public closeCalled = false;

  async init(dbName?: string): Promise<void> {
    this.dbName = dbName ?? 'test-db';
    this.setState('ready');
    this.initCalled = true;
  }

  async query<T>(_sql: string, _params?: SQLiteParams): Promise<QueryResult<T>> {
    this.assertReady();
    return { rows: [], rowCount: 0 };
  }

  async execute(_sql: string, _params?: SQLiteParams): Promise<ExecuteResult> {
    this.assertReady();
    return { rowsAffected: 0 };
  }

  async executeScript(_sql: string): Promise<void> {
    this.assertReady();
  }

  async transaction<T>(callback: TransactionCallback<T>): Promise<T> {
    this.assertReady();
    const tx: SQLiteTransaction = {
      query: async <U>(sql: string, params?: SQLiteParams) => this.query<U>(sql, params),
      execute: async (sql: string, params?: SQLiteParams) => this.execute(sql, params),
    };
    return callback(tx);
  }

  async close(): Promise<void> {
    this.setState('closed');
    this.closeCalled = true;
  }

  getInfo(): DriverInfo {
    return {
      type: 'wa-sqlite-idb',
      storageBackend: 'indexeddb',
      dbPath: this.dbName,
      isSync: false,
    };
  }

  // Expose protected methods for testing
  public testNotifyError(error: Error): void {
    this.notifyError(error);
  }

  public testSetState(state: DriverState): void {
    this.setState(state);
  }

  public testAssertReady(): void {
    this.assertReady();
  }
}

describe('sqlite-driver', () => {
  let driver: TestSQLiteDriver;

  beforeEach(() => {
    driver = new TestSQLiteDriver();
  });

  describe('BaseSQLiteDriver initial state', () => {
    it('starts in uninitialized state', () => {
      expect(driver.getState()).toBe('uninitialized');
    });

    it('has default dbName of neurodual', () => {
      const info = driver.getInfo();
      expect(info.dbPath).toBe('neurodual');
    });
  });

  describe('getState / setState', () => {
    it('transitions through lifecycle states', async () => {
      expect(driver.getState()).toBe('uninitialized');
      await driver.init('my-db');
      expect(driver.getState()).toBe('ready');
      await driver.close();
      expect(driver.getState()).toBe('closed');
    });

    it('can be set to error state', () => {
      driver.testSetState('error');
      expect(driver.getState()).toBe('error');
    });

    it('can be set to initializing state', () => {
      driver.testSetState('initializing');
      expect(driver.getState()).toBe('initializing');
    });
  });

  describe('assertReady', () => {
    it('throws when not ready', () => {
      expect(() => driver.testAssertReady()).toThrow(
        'SQLite driver not ready (state: uninitialized)',
      );
    });

    it('throws with current state in message', () => {
      driver.testSetState('closed');
      expect(() => driver.testAssertReady()).toThrow('SQLite driver not ready (state: closed)');
    });

    it('does not throw when ready', async () => {
      await driver.init();
      expect(() => driver.testAssertReady()).not.toThrow();
    });
  });

  describe('onError / notifyError', () => {
    it('registers and calls error callback', () => {
      const errors: Error[] = [];
      driver.onError((err) => errors.push(err));

      const testError = new Error('test error');
      driver.testNotifyError(testError);

      expect(errors).toHaveLength(1);
      expect(errors[0]).toBe(testError);
    });

    it('supports multiple error callbacks', () => {
      let count = 0;
      driver.onError(() => count++);
      driver.onError(() => count++);

      driver.testNotifyError(new Error('test'));
      expect(count).toBe(2);
    });

    it('returns unsubscribe function', () => {
      const errors: Error[] = [];
      const unsub = driver.onError((err) => errors.push(err));

      driver.testNotifyError(new Error('first'));
      expect(errors).toHaveLength(1);

      unsub();
      driver.testNotifyError(new Error('second'));
      expect(errors).toHaveLength(1);
    });

    it('ignores errors thrown by callbacks', () => {
      const errors: Error[] = [];
      driver.onError(() => {
        throw new Error('callback error');
      });
      driver.onError((err) => errors.push(err));

      driver.testNotifyError(new Error('test'));
      // Second callback still receives the error
      expect(errors).toHaveLength(1);
    });
  });

  describe('query / execute / transaction', () => {
    it('query throws when not initialized', async () => {
      await expect(driver.query('SELECT 1')).rejects.toThrow('not ready');
    });

    it('execute throws when not initialized', async () => {
      await expect(driver.execute('INSERT INTO x VALUES (1)')).rejects.toThrow('not ready');
    });

    it('query returns empty result when ready', async () => {
      await driver.init();
      const result = await driver.query('SELECT 1');
      expect(result.rows).toEqual([]);
      expect(result.rowCount).toBe(0);
    });

    it('execute returns zero affected rows when ready', async () => {
      await driver.init();
      const result = await driver.execute('DELETE FROM x');
      expect(result.rowsAffected).toBe(0);
    });

    it('transaction provides tx with query and execute', async () => {
      await driver.init();
      const result = await driver.transaction(async (tx) => {
        const q = await tx.query('SELECT 1');
        const e = await tx.execute('INSERT INTO x VALUES (1)');
        return { queryResult: q, executeResult: e };
      });
      expect(result.queryResult.rows).toEqual([]);
      expect(result.executeResult.rowsAffected).toBe(0);
    });
  });

  describe('getInfo', () => {
    it('returns driver metadata', () => {
      const info = driver.getInfo();
      expect(info.type).toBe('wa-sqlite-idb');
      expect(info.storageBackend).toBe('indexeddb');
      expect(info.isSync).toBe(false);
    });

    it('reflects dbName after init', async () => {
      await driver.init('custom-db');
      const info = driver.getInfo();
      expect(info.dbPath).toBe('custom-db');
    });
  });

  describe('type exports', () => {
    it('QueryResult has rows and rowCount', () => {
      const result: QueryResult<{ id: number }> = { rows: [{ id: 1 }], rowCount: 1 };
      expect(result.rows).toHaveLength(1);
      expect(result.rowCount).toBe(1);
    });

    it('ExecuteResult has rowsAffected and optional lastInsertRowId', () => {
      const result: ExecuteResult = { rowsAffected: 1, lastInsertRowId: 42 };
      expect(result.rowsAffected).toBe(1);
      expect(result.lastInsertRowId).toBe(42);
    });

    it('SQLiteValue covers null, number, string, Uint8Array', () => {
      const values: SQLiteValue[] = [null, 42, 'hello', new Uint8Array([1, 2, 3])];
      expect(values).toHaveLength(4);
    });

    it('DriverState union covers all states', () => {
      const states: DriverState[] = ['uninitialized', 'initializing', 'ready', 'closed', 'error'];
      expect(states).toHaveLength(5);
    });

    it('DriverInfo type field is a union of known types', () => {
      const infos: DriverInfo['type'][] = ['capacitor', 'wa-sqlite-opfs', 'wa-sqlite-idb'];
      expect(infos).toHaveLength(3);
    });
  });

  describe('SQLiteDriver interface contract', () => {
    it('TestSQLiteDriver satisfies SQLiteDriver interface', () => {
      const asInterface: SQLiteDriver = driver;
      expect(typeof asInterface.init).toBe('function');
      expect(typeof asInterface.query).toBe('function');
      expect(typeof asInterface.execute).toBe('function');
      expect(typeof asInterface.executeScript).toBe('function');
      expect(typeof asInterface.transaction).toBe('function');
      expect(typeof asInterface.close).toBe('function');
      expect(typeof asInterface.getState).toBe('function');
      expect(typeof asInterface.onError).toBe('function');
      expect(typeof asInterface.getInfo).toBe('function');
    });
  });
});
