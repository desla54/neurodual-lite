/**
 * Production-safe Logger
 *
 * - Silent in production (tree-shakeable)
 * - Tagged output [ServiceName]
 * - Performance timers with `time()`/`timeEnd()`
 *
 * @example
 * const log = createLogger('SyncService');
 * log.debug('Starting sync...');
 * log.info('Synced', { count: 10 });
 * log.warn('Retry needed');
 * log.error('Failed', error);
 *
 * log.time('operation');
 * // ... do work
 * log.timeEnd('operation'); // [SyncService] ⏱️ operation: 123ms
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const IS_PROD =
  typeof import.meta !== 'undefined' &&
  // @ts-expect-error - Vite specific
  import.meta.env?.PROD === true;

// For perf timers
const timers = new Map<string, number>();

interface Logger {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  time: (label: string) => void;
  timeEnd: (label: string) => void;
}

// No-op logger for production
const noopLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  time: () => {},
  timeEnd: () => {},
};

function forwardToSentry(
  level: 'warning' | 'error',
  service: string,
  args: readonly unknown[],
): void {
  try {
    const bridge = (globalThis as unknown as { __ND_SENTRY_BRIDGE__?: unknown })
      .__ND_SENTRY_BRIDGE__;
    if (!bridge || typeof bridge !== 'object') return;
    const captureLog = (bridge as { captureLog?: unknown }).captureLog;
    if (typeof captureLog !== 'function') return;
    (captureLog as (level: 'warning' | 'error', service: string, args: readonly unknown[]) => void)(
      level,
      service,
      args,
    );
  } catch {
    // ignore
  }
}

/**
 * Create a tagged logger for a service.
 * In production, returns a no-op logger (tree-shakeable).
 *
 * @param service - Service name (e.g., 'SyncService', 'AuthAdapter')
 * @param options - Logger options
 * @param options.level - Minimum log level (default: 'debug')
 * @param options.forceEnable - Force enable even in production (for critical errors)
 */
export function createLogger(
  service: string,
  options: { level?: LogLevel; forceEnable?: boolean } = {},
): Logger {
  // In production, keep console silent but forward warn/error to Sentry if available.
  if (IS_PROD && !options.forceEnable) {
    return {
      ...noopLogger,
      warn: (...args) => forwardToSentry('warning', service, args),
      error: (...args) => forwardToSentry('error', service, args),
    };
  }

  const minLevel = options.level ?? 'debug';
  const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
  const minLevelIndex = levels.indexOf(minLevel);

  const shouldLog = (level: LogLevel): boolean => {
    return levels.indexOf(level) >= minLevelIndex;
  };

  const tag = `[${service}]`;

  return {
    debug: (...args) => {
      if (shouldLog('debug')) {
        console.log(tag, ...args);
      }
    },
    info: (...args) => {
      if (shouldLog('info')) {
        console.log(tag, ...args);
      }
    },
    warn: (...args) => {
      if (shouldLog('warn')) {
        console.warn(tag, ...args);
      }
    },
    error: (...args) => {
      if (shouldLog('error')) {
        console.error(tag, ...args);
      }
    },
    time: (label) => {
      timers.set(`${service}:${label}`, performance.now());
    },
    timeEnd: (label) => {
      const key = `${service}:${label}`;
      const start = timers.get(key);
      if (start !== undefined) {
        const duration = performance.now() - start;
        console.log(tag, `⏱️ ${label}: ${duration.toFixed(0)}ms`);
        timers.delete(key);
      }
    },
  };
}

// Pre-configured loggers for common services
export const dbLog = createLogger('SQLiteStore');
export const syncLog = createLogger('SyncService');
export const authLog = createLogger('AuthAdapter');
export const audioLog = createLogger('AudioService');
export const progressionLog = createLogger('ProgressionAdapter');
export const historyLog = createLogger('HistoryAdapter');
export const persistenceLog = createLogger('Persistence');
export const subscriptionLog = createLogger('SubscriptionAdapter');
export const settingsSyncLog = createLogger('SettingsSync');
export const lifecycleLog = createLogger('AppLifecycle');
export const pipelineLog = createLogger('Pipeline');
export const sessionManagerLog = createLogger('SessionManager');
export const replayLog = createLogger('InteractiveReplay');
export const projectionLog = createLogger('HistoryProjection');
export const powerSyncLog = createLogger('PowerSync');
export const sessionRecoveryLog = createLogger('SessionRecovery');
export const disposalLog = createLogger('DisposalRegistry');
export const freezeWatchdogLog = createLogger('FreezeWatchdog');
