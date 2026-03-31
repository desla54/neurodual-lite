import type { PersistencePort } from '@neurodual/logic';
import type { AbstractPowerSyncDatabase } from '@powersync/web';

export interface SqlInstrumentationOptions {
  /** Only instrument these methods (default: query/execute/writeTransaction). */
  only?: ReadonlySet<string>;
  /** Log if duration exceeds this threshold (ms). Default: 50. */
  slowMs?: number;
  /** Keep last N slow operations in memory. Default: 50. */
  maxHistory?: number;
  /** Log all instrumented calls instead of only slow ones. */
  mode?: 'slow' | 'all';
  /** Prefix in console output to distinguish wrapper layers. */
  label?: string;
}

export interface SqlInstrumentationEvent {
  name: string;
  durationMs: number;
  timestamp: number;
  sqlPreview?: string;
}

export interface SqlInstrumentationState {
  totalCalls: number;
  totalMs: number;
  slow: SqlInstrumentationEvent[];
}

type SqlDebugValue = '0' | '1' | 'slow' | 'all' | 'true' | 'false' | null;

const INSTRUMENTED_DB_CACHE = new WeakMap<object, object>();

function nowMs(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function toSqlPreview(args: unknown[]): string | undefined {
  const first = args[0];
  if (typeof first !== 'string') return undefined;
  const oneLine = first.replace(/\s+/g, ' ').trim();
  return oneLine.length > 200 ? `${oneLine.slice(0, 200)}…` : oneLine;
}

function toCallPreview(name: string, args: unknown[]): string | undefined {
  if (name === 'writeTransaction') {
    const callback = args[0] as { name?: string; __sqlLabel?: string } | undefined;
    const label = callback?.__sqlLabel ?? callback?.name;
    if (typeof label === 'string' && label.trim().length > 0) {
      return `[tx:${label.trim()}]`;
    }
    const stack = new Error().stack;
    const caller = stack
      ?.split('\n')
      .map((line) => line.trim())
      .find(
        (line) =>
          line.length > 0 &&
          !line.includes('instrumented-persistence.ts') &&
          !line.includes('toCallPreview') &&
          !line.includes('withSqlTiming'),
      );
    if (caller) {
      return `[tx:anonymous ${caller.replace(/^at\s+/, '')}]`;
    }
  }
  return toSqlPreview(args);
}

function getGlobal(): typeof globalThis & {
  __NEURODUAL_SQL_INSTRUMENTATION__?: SqlInstrumentationState;
} {
  return globalThis as typeof globalThis & {
    __NEURODUAL_SQL_INSTRUMENTATION__?: SqlInstrumentationState;
  };
}

function getOrCreateState(): SqlInstrumentationState {
  const g = getGlobal();
  g.__NEURODUAL_SQL_INSTRUMENTATION__ ??= { totalCalls: 0, totalMs: 0, slow: [] };
  return g.__NEURODUAL_SQL_INSTRUMENTATION__;
}

function shouldLogCall(
  durationMs: number,
  options: Required<Pick<SqlInstrumentationOptions, 'slowMs' | 'mode'>>,
): boolean {
  return options.mode === 'all' || durationMs >= options.slowMs;
}

function recordEvent(
  state: SqlInstrumentationState,
  name: string,
  durationMs: number,
  sqlPreview: string | undefined,
  options: Required<Pick<SqlInstrumentationOptions, 'slowMs' | 'maxHistory' | 'mode' | 'label'>>,
): void {
  state.totalCalls++;
  state.totalMs += durationMs;

  if (durationMs >= options.slowMs) {
    state.slow.push({
      name,
      durationMs,
      timestamp: Date.now(),
      sqlPreview,
    });
    if (state.slow.length > options.maxHistory) {
      state.slow.splice(0, state.slow.length - options.maxHistory);
    }
  }

  if (!shouldLogCall(durationMs, options)) return;

  console.debug(`[${options.label}] ${name}: ${durationMs.toFixed(0)}ms`, sqlPreview);
}

function isPromiseLike(value: unknown): value is Promise<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'then' in value &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}

function withSqlTiming<T>(
  state: SqlInstrumentationState,
  name: string,
  args: unknown[],
  options: Required<Pick<SqlInstrumentationOptions, 'slowMs' | 'maxHistory' | 'mode' | 'label'>>,
  run: () => T,
): T {
  const t0 = nowMs();
  try {
    const res = run();
    if (isPromiseLike(res)) {
      return res.finally(() => {
        recordEvent(state, name, nowMs() - t0, toCallPreview(name, args), options);
      }) as T;
    }

    recordEvent(state, name, nowMs() - t0, toCallPreview(name, args), options);
    return res;
  } catch (err) {
    state.totalCalls++;
    state.totalMs += nowMs() - t0;
    throw err;
  }
}

export function instrumentPersistencePort(
  port: PersistencePort,
  options: SqlInstrumentationOptions = {},
): PersistencePort {
  const only = options.only ?? new Set(['query', 'execute', 'writeTransaction']);
  const state = getOrCreateState();
  const resolved = {
    slowMs: options.slowMs ?? 50,
    maxHistory: options.maxHistory ?? 50,
    mode: options.mode ?? 'slow',
    label: options.label ?? 'SQL:port',
  } as const;

  // Expose a stable state object for devtools inspection.
  getGlobal().__NEURODUAL_SQL_INSTRUMENTATION__ = state;

  return new Proxy(port, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver) as unknown;
      if (typeof prop !== 'string' || typeof value !== 'function' || !only.has(prop)) {
        return value;
      }

      return (...args: unknown[]) =>
        withSqlTiming(state, prop, args, resolved, () =>
          (value as (...a: unknown[]) => unknown).apply(target, args),
        );
    },
  });
}

function instrumentTx<T extends object>(
  tx: T,
  state: SqlInstrumentationState,
  options: Required<Pick<SqlInstrumentationOptions, 'slowMs' | 'maxHistory' | 'mode' | 'label'>>,
): T {
  return new Proxy(tx, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver) as unknown;
      if (
        typeof prop !== 'string' ||
        typeof value !== 'function' ||
        !new Set(['execute', 'getAll', 'getOptional']).has(prop)
      ) {
        return value;
      }

      return (...args: unknown[]) =>
        withSqlTiming(state, `tx.${prop}`, args, options, () =>
          (value as (...a: unknown[]) => unknown).apply(target, args),
        );
    },
  });
}

export function instrumentPowerSyncDb<T extends AbstractPowerSyncDatabase>(
  db: T,
  options: SqlInstrumentationOptions = {},
): T {
  const cached = INSTRUMENTED_DB_CACHE.get(db);
  if (cached) return cached as T;

  const state = getOrCreateState();
  const resolved = {
    slowMs: options.slowMs ?? 50,
    maxHistory: options.maxHistory ?? 50,
    mode: options.mode ?? 'slow',
    label: options.label ?? 'SQL:db',
  } as const;
  const methods = new Set(['execute', 'getAll', 'getOptional', 'writeTransaction']);

  const wrapped = new Proxy(db, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver) as unknown;
      if (typeof prop !== 'string' || typeof value !== 'function' || !methods.has(prop)) {
        return value;
      }

      if (prop === 'writeTransaction') {
        return (callback: (tx: unknown) => unknown) =>
          withSqlTiming(state, prop, [callback], resolved, () =>
            (value as (cb: (tx: unknown) => unknown) => unknown).call(target, (tx: unknown) =>
              callback(instrumentTx(tx as object, state, resolved)),
            ),
          );
      }

      return (...args: unknown[]) =>
        withSqlTiming(state, prop, args, resolved, () =>
          (value as (...a: unknown[]) => unknown).apply(target, args),
        );
    },
  });

  INSTRUMENTED_DB_CACHE.set(db, wrapped);
  return wrapped as T;
}

export function getSqlInstrumentationMode(): 'slow' | 'all' | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem('nd_sql_debug') as SqlDebugValue;
    const isDev =
      typeof import.meta !== 'undefined' &&
      // @ts-expect-error - Vite specific
      import.meta.env?.DEV === true;

    if (raw === 'all') return 'all';
    if (raw === '0' || raw === 'false') return null;
    if (raw === '1' || raw === 'true' || raw === 'slow') return 'slow';
    if (isDev) return 'slow';
    return null;
  } catch {
    return null;
  }
}

export function shouldInstrumentSql(): boolean {
  return getSqlInstrumentationMode() !== null;
}
