/**
 * SQLite Utility Functions
 *
 * - percentile() - Statistical percentile calculation (replaces PERCENTILE_CONT)
 * - stddev() - Sample standard deviation (replaces STDDEV_SAMP)
 * - buildPlaceholders() / buildInClause() - SQLite IN clause helpers
 * - safeJsonParse() - Safe JSON parsing from TEXT columns
 * - parseSqlDate() / parseSqlDateToMs() - Safe SQLite date coercion
 * - toFiniteNumber() - Safe numeric coercion
 */

/**
 * Calculate percentile using linear interpolation
 * Replaces PostgreSQL PERCENTILE_CONT
 *
 * @param arr Array of numbers
 * @param p Percentile (0-1), e.g., 0.5 for median, 0.25 for Q1
 * @returns The percentile value, or null if array is empty
 */
export function percentile(arr: number[], p: number): number | null {
  if (arr.length === 0) return null;
  if (arr.length === 1) return arr[0] ?? null;

  const sorted = [...arr].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * p;
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);

  const lowerVal = sorted[lower];
  const upperVal = sorted[upper];

  if (lowerVal === undefined || upperVal === undefined) return null;

  if (lower === upper) {
    return lowerVal;
  }

  const weight = idx - lower;
  return lowerVal * (1 - weight) + upperVal * weight;
}

/**
 * Calculate sample standard deviation
 * Replaces PostgreSQL STDDEV_SAMP
 *
 * Uses Bessel's correction (n-1) for sample standard deviation
 *
 * @param arr Array of numbers
 * @returns The sample standard deviation, or null if less than 2 elements
 */
export function stddev(arr: number[]): number | null {
  const n = arr.length;
  if (n < 2) return null;

  const mean = arr.reduce((a, b) => a + b, 0) / n;
  const variance = arr.reduce((sum, val) => sum + (val - mean) ** 2, 0) / (n - 1);
  return Math.sqrt(variance);
}

/**
 * Build SQL IN clause placeholders
 * Replaces PostgreSQL ANY($1::text[]) syntax
 *
 * @param count Number of placeholders needed
 * @returns String like "?, ?, ?" for SQLite prepared statements
 *
 * @example
 * const ids = ['a', 'b', 'c'];
 * const sql = `SELECT * FROM session_events WHERE id IN (${buildPlaceholders(ids.length)})`;
 * // Result: "SELECT * FROM session_events WHERE id IN (?, ?, ?)"
 */
export function buildPlaceholders(count: number): string {
  if (count <= 0) return '';
  return Array(count).fill('?').join(', ');
}

/**
 * Build SQL IN clause with values
 * Returns both the SQL fragment and flattened params
 *
 * @param values Array of values
 * @returns Object with sql fragment and params array
 *
 * @example
 * const { sql, params } = buildInClause(['a', 'b', 'c']);
 * // sql: "(?, ?, ?)"
 * // params: ['a', 'b', 'c']
 */
export function buildInClause<T>(values: T[]): { sql: string; params: T[] } {
  if (values.length === 0) {
    // Return impossible condition for empty arrays
    return { sql: '(NULL)', params: [] };
  }
  return {
    sql: `(${buildPlaceholders(values.length)})`,
    params: values,
  };
}

/**
 * Parse JSON safely with fallback
 * For handling TEXT columns that store JSON in SQLite
 *
 * @param jsonString The JSON string to parse
 * @param fallback Fallback value if parsing fails
 * @returns Parsed object or fallback
 */
export function safeJsonParse<T>(jsonString: string | null, fallback: T): T {
  if (!jsonString) return fallback;
  try {
    return JSON.parse(jsonString) as T;
  } catch {
    return fallback;
  }
}

function normalizeSqlDateString(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    const numeric = Number(trimmed);
    if (!Number.isFinite(numeric)) return null;
    const date = new Date(numeric);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  }
  return /(?:[zZ]|[+-]\d{2}:\d{2})$/.test(trimmed) ? trimmed : `${trimmed}Z`;
}

export function parseSqlDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  }
  if (typeof value !== 'string') return null;
  const normalized = normalizeSqlDateString(value);
  if (!normalized) return null;
  const timestamp = Date.parse(normalized);
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp);
}

export function parseSqlDateToMs(value: unknown): number | null {
  return parseSqlDate(value)?.getTime() ?? null;
}

export function toFiniteNumber(value: unknown, fallback: number = 0): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : fallback;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}
