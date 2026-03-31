/**
 * Type declarations for wa-sqlite
 *
 * wa-sqlite doesn't ship TypeScript definitions, so we declare the modules here.
 * These are minimal types for the parts we use.
 */

declare module 'wa-sqlite/dist/wa-sqlite-async.mjs' {
  interface SQLiteModuleConfig {
    locateFile?: (file: string, prefix: string) => string;
  }
  export default function SQLiteAsyncESMFactory(
    config?: SQLiteModuleConfig,
  ): Promise<EmscriptenModule>;

  // Raw Emscripten module (before Factory wrapping)
  interface EmscriptenModule {
    _getSqliteFree(): number;
    _malloc(size: number): number;
    _sqlite3_malloc(size: number): number;
    lengthBytesUTF8(str: string): number;
    stringToUTF8(str: string, outPtr: number, maxBytesToWrite: number): void;
    // ... other Emscripten internals
  }
}

declare module 'wa-sqlite/src/sqlite-api.js' {
  // Factory creates the SQLite API wrapper from Emscripten module
  export function Factory(module: unknown): SQLiteAPI;

  export class SQLiteError extends Error {
    code: number;
    constructor(message: string, code: number);
  }

  interface SQLiteAPI {
    // Core SQLite functions
    open_v2(filename: string, flags: number, zVfs: string | null): Promise<number>;
    close(db: number): Promise<number>;
    exec(db: number, sql: string, callback?: unknown): Promise<number>;
    prepare_v2(db: number, sql: string): Promise<{ stmt: number; sql: string }>;
    step(stmt: number): Promise<number>;
    column_count(stmt: number): number;
    column_name(stmt: number, index: number): string;
    column(stmt: number, index: number): unknown;
    finalize(stmt: number): Promise<number>;
    bind(stmt: number, index: number, value: unknown): number;
    changes(db: number): number;
    reset(stmt: number): Promise<number>;

    // Constants
    SQLITE_ROW: number;
    SQLITE_DONE: number;
    SQLITE_OPEN_CREATE: number;
    SQLITE_OPEN_READWRITE: number;
  }
}

declare module 'wa-sqlite/src/examples/OriginPrivateFileSystemVFS.js' {
  export class OriginPrivateFileSystemVFS {
    constructor(...args: unknown[]);
    name: string;
  }
}

declare module 'wa-sqlite/src/examples/IDBBatchAtomicVFS.js' {
  export class IDBBatchAtomicVFS {
    constructor(name?: string, options?: unknown);
    name: string;
  }
}

declare module 'wa-sqlite/src/examples/IDBMinimalVFS.js' {
  export class IDBMinimalVFS {
    constructor(name?: string, options?: unknown);
    name: string;
  }
}

declare module 'wa-sqlite/src/examples/MemoryAsyncVFS.js' {
  export class MemoryAsyncVFS {
    constructor(...args: unknown[]);
    name: string;
  }
}
