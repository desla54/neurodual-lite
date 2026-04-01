/**
 * Logger centralisé
 *
 * Remplace les console.error dispersés par un point unique.
 * Permet d'afficher des toasts et de brancher Sentry plus tard.
 */

import { toast } from '@neurodual/ui';

type LogContext = Record<string, unknown> | Error | unknown;

interface ErrorOptions {
  /** Afficher un toast à l'utilisateur */
  toast?: boolean;
  /** Message user-friendly pour le toast */
  userMessage?: string;
}

function formatContext(context?: LogContext): string {
  if (!context) return '';
  if (context instanceof Error) return context.message;
  if (typeof context === 'object') {
    try {
      return JSON.stringify(context, null, 2);
    } catch {
      return String(context);
    }
  }
  return String(context);
}

const warnThrottle = new Map<string, { lastAt: number; count: number }>();
function shouldThrottleWarn(key: string): boolean {
  const now = Date.now();
  const entry = warnThrottle.get(key);
  if (!entry) {
    warnThrottle.set(key, { lastAt: now, count: 1 });
    return false;
  }
  const ageMs = now - entry.lastAt;
  if (ageMs > 60_000) {
    warnThrottle.set(key, { lastAt: now, count: 1 });
    return false;
  }
  entry.lastAt = now;
  entry.count += 1;
  return entry.count > 10;
}

export const logger = {
  /**
   * Debug log (dev only, verbose)
   */
  debug(message: string, context?: LogContext): void {
    if (import.meta.env.DEV) {
      console.log(`[DEBUG] ${message}`, context ?? '');
    }
  },

  /**
   * Log informatif (dev only)
   */
  info(message: string, context?: LogContext): void {
    if (import.meta.env.DEV) {
      console.info(`[INFO] ${message}`, context ?? '');
    }
  },

  /**
   * Warning (dev + prod)
   */
  warn(message: string, context?: LogContext): void {
    console.warn(`[WARN] ${message}`, context ?? '');

    // Prefer more signal than less: forward warnings to Sentry (queued if SDK isn't ready yet).
    // Uses the global bridge to avoid importing the SDK on every warn.
    try {
      if (
        import.meta.env.PROD &&
        import.meta.env['VITE_SENTRY_DSN'] &&
        typeof window !== 'undefined'
      ) {
        const throttleKey = `${message}:${formatContext(context)}`;
        if (shouldThrottleWarn(throttleKey)) return;
        const bridge = (window as unknown as { __ND_SENTRY_BRIDGE__?: unknown })
          .__ND_SENTRY_BRIDGE__;
        const captureMessage = (bridge as { captureMessage?: unknown } | undefined)?.captureMessage;
        if (typeof captureMessage === 'function') {
          (
            captureMessage as (
              message: string,
              options?: { level?: 'info' | 'warning' | 'error'; extra?: Record<string, unknown> },
            ) => void
          )(message, {
            level: 'warning',
            extra: { source: 'app.logger.warn', context: context ? formatContext(context) : null },
          });
        }
      }
    } catch {
      // ignore
    }
  },

  /**
   * Erreur (dev + prod, optionnellement toast)
   */
  error(message: string, context?: LogContext, options?: ErrorOptions): void {
    const contextStr = formatContext(context);
    console.error(`[ERROR] ${message}`, context ?? '');

    // Toast optionnel
    if (options?.toast) {
      const userMessage = options.userMessage ?? 'Une erreur est survenue';
      toast.error(userMessage, {
        description: import.meta.env.DEV ? contextStr : undefined,
      });
    }

    // Sentry removed in Lite — error logging is local-only
  },

  /**
   * Erreur avec toast automatique
   */
  userError(userMessage: string, technicalMessage?: string, context?: LogContext): void {
    console.error(`[ERROR] ${technicalMessage ?? userMessage}`, context ?? '');
    toast.error(userMessage);
  },
};

/**
 * Service-specific loggers for organized logging
 */
export const cloudSyncLog = {
  debug: (msg: string, ctx?: LogContext) => logger.debug(`[CloudSync] ${msg}`, ctx),
  info: (msg: string, ctx?: LogContext) => logger.info(`[CloudSync] ${msg}`, ctx),
  warn: (msg: string, ctx?: LogContext) => logger.warn(`[CloudSync] ${msg}`, ctx),
  error: (msg: string, ctx?: LogContext) => logger.error(`[CloudSync] ${msg}`, ctx),
};

export const bootstrapLog = {
  debug: (msg: string, ctx?: LogContext) => logger.debug(`[Bootstrap] ${msg}`, ctx),
  info: (msg: string, ctx?: LogContext) => logger.info(`[Bootstrap] ${msg}`, ctx),
  warn: (msg: string, ctx?: LogContext) => logger.warn(`[Bootstrap] ${msg}`, ctx),
  error: (msg: string, ctx?: LogContext) => logger.error(`[Bootstrap] ${msg}`, ctx),
};
