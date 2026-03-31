export interface SqlWriteExecutor {
  execute(sql: string, params?: unknown[]): Promise<unknown>;
}

export interface BulkInsertOptions {
  /**
   * SQLite has a default bind limit of 999 variables.
   * We use a conservative default to keep headroom across backends.
   */
  maxBindVars?: number;
}

export interface BulkDeleteOptions {
  maxBindVars?: number;
}

function assertSafeIdentifier(identifier: string, kind: 'table' | 'column'): void {
  // Identifiers cannot be parameterized; validate to avoid accidental injection
  // when composing SQL dynamically for bulk inserts.
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) {
    throw new Error(`[SQL] Unsafe ${kind} identifier: ${identifier}`);
  }
}

function assertSafeIdentifiers(
  table: string,
  columns: readonly string[],
): { table: string; columns: readonly string[] } {
  assertSafeIdentifier(table, 'table');
  for (const column of columns) {
    assertSafeIdentifier(column, 'column');
  }
  return { table, columns };
}

/**
 * Bulk INSERT rows with bound parameters, chunked to stay under SQLite bind limits.
 *
 * This is the preferred way to write many rows:
 * - fewer execute() calls
 * - works well inside writeTransaction()
 */
export async function bulkInsert(
  executor: SqlWriteExecutor,
  table: string,
  columns: readonly string[],
  rows: readonly (readonly unknown[])[],
  options: BulkInsertOptions = {},
): Promise<void> {
  if (rows.length === 0) return;
  if (columns.length === 0) throw new Error('[SQL] bulkInsert: empty columns');

  const { table: safeTable, columns: safeColumns } = assertSafeIdentifiers(table, columns);

  for (const row of rows) {
    if (row.length !== safeColumns.length) {
      throw new Error(
        `[SQL] bulkInsert: row length ${row.length} does not match columns length ${safeColumns.length}`,
      );
    }
  }

  const maxBindVars = options.maxBindVars ?? 900;
  const valuesPerRow = safeColumns.length;
  const chunkSize = Math.max(1, Math.floor(maxBindVars / valuesPerRow));

  const columnsSql = safeColumns.join(', ');
  const placeholdersForRow = `(${new Array(valuesPerRow).fill('?').join(', ')})`;

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const valuesSql = new Array(chunk.length).fill(placeholdersForRow).join(', ');

    const params: unknown[] = [];
    for (const row of chunk) {
      params.push(...row);
    }

    await executor.execute(`INSERT INTO ${safeTable} (${columnsSql}) VALUES ${valuesSql}`, params);
  }
}

function buildPlaceholders(count: number): string {
  if (count <= 0) return '(NULL)';
  return `(${new Array(count).fill('?').join(', ')})`;
}

/**
 * Bulk DELETE by `WHERE column IN (...)`, chunked to stay under SQLite bind limits.
 */
export async function bulkDeleteWhereIn(
  executor: SqlWriteExecutor,
  table: string,
  column: string,
  values: readonly unknown[],
  options: BulkDeleteOptions = {},
): Promise<void> {
  if (values.length === 0) return;

  assertSafeIdentifier(table, 'table');
  assertSafeIdentifier(column, 'column');

  const maxBindVars = options.maxBindVars ?? 900;

  for (let i = 0; i < values.length; i += maxBindVars) {
    const chunk = values.slice(i, i + maxBindVars);
    await executor.execute(
      `DELETE FROM ${table} WHERE ${column} IN ${buildPlaceholders(chunk.length)}`,
      chunk,
    );
  }
}
