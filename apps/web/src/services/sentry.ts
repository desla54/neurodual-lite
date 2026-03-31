/**
 * Sentry Configuration (Lazy Loaded)
 *
 * Error monitoring and performance tracking.
 * Uses @sentry/capacitor for native crash support on iOS/Android.
 * Loaded after first render to not block initial paint.
 */

import { Capacitor } from '@capacitor/core';
import { APP_VERSION } from '@neurodual/logic';
import { env } from '../env';
// Sentry module references (loaded lazily)
let SentryCapacitor: typeof import('@sentry/capacitor') | null = null;
let SentryReact: typeof import('@sentry/react') | null = null;
let initPromise: Promise<void> | null = null;

type PendingSentryItem =
  | {
      readonly kind: 'exception';
      readonly error: Error;
      readonly context?: Record<string, unknown>;
    }
  | {
      readonly kind: 'message';
      readonly message: string;
      readonly options?: { level?: 'info' | 'warning' | 'error'; extra?: Record<string, unknown> };
    };

const pending: PendingSentryItem[] = [];
const MAX_PENDING = 50;
const MAX_BREADCRUMBS = 80;

type SentryBridge = {
  captureException: (error: Error, context?: Record<string, unknown>) => void;
  captureMessage: (
    message: string,
    options?: { level?: 'info' | 'warning' | 'error'; extra?: Record<string, unknown> },
  ) => void;
  captureFeedback: (params: {
    message: string;
    url?: string;
    tags?: Record<string, string>;
  }) => void;
  captureLog: (level: 'warning' | 'error', service: string, args: readonly unknown[]) => void;
  setUser: (user: { id?: string | null } | null) => void;
  setTag: (key: string, value: string) => void;
  setContext: (key: string, value: Record<string, unknown>) => void;
  addBreadcrumb: (breadcrumb: { message: string; category?: string }) => void;
};

declare global {
  interface Window {
    __ND_SENTRY_BRIDGE__?: unknown;
    __ND_SENTRY_EARLY__?: unknown[];
    __NEURODUAL_PERSISTENCE_STAGE__?: unknown;
  }
}

function enqueue(item: PendingSentryItem): void {
  pending.push(item);
  if (pending.length > MAX_PENDING) {
    pending.splice(0, pending.length - MAX_PENDING);
  }
}

type PendingUser = { id?: string | null } | null;
let pendingUser: PendingUser = null;
const pendingTags: Record<string, string> = {};
const pendingContexts: Record<string, Record<string, unknown>> = {};
const pendingBreadcrumbs: Array<{ message: string; category?: string }> = [];

function enqueueBreadcrumb(breadcrumb: { message: string; category?: string }): void {
  pendingBreadcrumbs.push(breadcrumb);
  if (pendingBreadcrumbs.length > MAX_BREADCRUMBS) {
    pendingBreadcrumbs.splice(0, pendingBreadcrumbs.length - MAX_BREADCRUMBS);
  }
}

function applyScopeToEvent(event: Record<string, unknown>): void {
  const e = event as {
    user?: unknown;
    tags?: Record<string, unknown>;
    contexts?: Record<string, unknown>;
    extra?: Record<string, unknown>;
    breadcrumbs?: unknown;
  };

  if (pendingUser && e.user === undefined) {
    e.user = pendingUser;
  }

  e.tags = { ...(e.tags ?? {}), ...pendingTags } as Record<string, unknown>;
  e.contexts = { ...(e.contexts ?? {}), ...pendingContexts } as Record<string, unknown>;

  if (pendingBreadcrumbs.length > 0) {
    const existing = Array.isArray(e.breadcrumbs) ? (e.breadcrumbs as unknown[]) : [];
    const merged = [
      ...existing,
      ...pendingBreadcrumbs.map((b) => ({ message: b.message, category: b.category })),
    ];
    e.breadcrumbs = merged.slice(-MAX_BREADCRUMBS);
  }
}

function safeStringify(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.message;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

const logThrottle = new Map<string, { lastAt: number; count: number }>();
function shouldThrottle(key: string): boolean {
  const now = Date.now();
  const entry = logThrottle.get(key);
  if (!entry) {
    logThrottle.set(key, { lastAt: now, count: 1 });
    return false;
  }

  const ageMs = now - entry.lastAt;
  if (ageMs > 60_000) {
    logThrottle.set(key, { lastAt: now, count: 1 });
    return false;
  }

  entry.lastAt = now;
  entry.count += 1;
  return entry.count > 8;
}

function enqueueLog(level: 'warning' | 'error', service: string, args: readonly unknown[]): void {
  const head = args[0];
  const message =
    typeof head === 'string'
      ? `${service}: ${head}`
      : `${service}: ${args.map((a) => safeStringify(a)).join(' ')}`.slice(0, 500);

  const key = `${level}:${service}:${message}`;
  if (shouldThrottle(key)) return;

  const maybeError = args.find((a) => a instanceof Error);
  if (level === 'error' && maybeError instanceof Error) {
    enqueue({
      kind: 'exception',
      error: maybeError,
      context: {
        source: 'infra.logger',
        service,
        args: args.map((a) => safeStringify(a)).slice(0, 10),
      },
    });
    return;
  }

  enqueue({
    kind: 'message',
    message,
    options: {
      level,
      extra: {
        source: 'infra.logger',
        service,
        args: args.map((a) => safeStringify(a)).slice(0, 10),
      },
    },
  });
}

function drainEarlyQueueIntoPending(): void {
  if (typeof window === 'undefined') return;
  const items = window.__ND_SENTRY_EARLY__ ?? [];
  if (!Array.isArray(items) || items.length === 0) return;

  window.__ND_SENTRY_EARLY__ = [];
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    if (item['kind'] === 'exception' && item['error'] instanceof Error) {
      enqueue({
        kind: 'exception',
        error: item['error'],
        context: item['context'] as Record<string, unknown>,
      });
      continue;
    }
    if (item['kind'] === 'message' && typeof item['message'] === 'string') {
      enqueue({
        kind: 'message',
        message: item['message'],
        options: item['options'] as {
          level?: 'info' | 'warning' | 'error';
          extra?: Record<string, unknown>;
        },
      });
      continue;
    }
    if (item['kind'] === 'set_user') {
      pendingUser = (item['user'] as PendingUser) ?? null;
      continue;
    }
    if (
      item['kind'] === 'set_tag' &&
      typeof item['key'] === 'string' &&
      typeof item['value'] === 'string'
    ) {
      pendingTags[item['key']] = item['value'];
      continue;
    }
    if (
      item['kind'] === 'set_context' &&
      typeof item['key'] === 'string' &&
      item['value'] &&
      typeof item['value'] === 'object'
    ) {
      pendingContexts[item['key']] = item['value'] as Record<string, unknown>;
      continue;
    }
    if (
      item['kind'] === 'breadcrumb' &&
      item['breadcrumb'] &&
      typeof item['breadcrumb'] === 'object'
    ) {
      const b = item['breadcrumb'] as Record<string, unknown>;
      if (typeof b['message'] === 'string') {
        enqueueBreadcrumb({
          message: b['message'],
          category: typeof b['category'] === 'string' ? (b['category'] as string) : undefined,
        });
      }
      continue;
    }
    if (
      item['kind'] === 'log' &&
      (item['level'] === 'warning' || item['level'] === 'error') &&
      typeof item['service'] === 'string' &&
      Array.isArray(item['args'])
    ) {
      enqueueLog(item['level'], item['service'], item['args']);
    }
  }
}

function flushPending(): void {
  if (!SentryCapacitor) return;
  // Apply scope if SDK supports it. This is best-effort; we also merge on each event in beforeSend.
  try {
    const api = SentryCapacitor as unknown as {
      setUser?: (user: PendingUser) => void;
      setTag?: (key: string, value: string) => void;
      setContext?: (key: string, value: Record<string, unknown>) => void;
      addBreadcrumb?: (crumb: { message: string; category?: string }) => void;
    };
    if (api.setUser) api.setUser(pendingUser);
    for (const [k, v] of Object.entries(pendingTags)) api.setTag?.(k, v);
    for (const [k, v] of Object.entries(pendingContexts)) api.setContext?.(k, v);
    for (const crumb of pendingBreadcrumbs) api.addBreadcrumb?.(crumb);
  } catch {
    // ignore
  }

  const items = pending.splice(0, pending.length);
  for (const item of items) {
    try {
      if (item.kind === 'exception') {
        SentryCapacitor.captureException(item.error, { extra: item.context });
        continue;
      }
      SentryCapacitor.captureMessage(item.message, {
        level: item.options?.level ?? 'info',
        extra: item.options?.extra,
      });
    } catch {
      // If capture fails, drop the item (avoid infinite loops / requeue).
    }
  }
}

function installBridge(): void {
  if (typeof window === 'undefined') return;
  const bridge: SentryBridge = {
    captureException: (error, context) => reportError(error, context),
    captureMessage: (message, options) => captureMessage(message, options),
    captureFeedback: (params) => captureFeedback(params),
    captureLog: (level, service, args) => enqueueLog(level, service, args),
    setUser: (user) => setUser(user),
    setTag: (key, value) => setTag(key, value),
    setContext: (key, value) => setContext(key, value),
    addBreadcrumb: (breadcrumb) => addBreadcrumb(breadcrumb),
  };
  window.__ND_SENTRY_BRIDGE__ = bridge;
}

/**
 * Initialize Sentry SDK lazily.
 * Call this after the app has rendered to not block initial paint.
 */
export async function initSentry(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    installBridge();
    drainEarlyQueueIntoPending();

    const dsn = env.VITE_SENTRY_DSN;

    // Skip if no DSN configured
    if (!dsn) {
      console.warn('[Sentry] No DSN configured, error reporting disabled');
      return;
    }

    // Skip in development
    if (!import.meta.env.PROD) {
      if (import.meta.env.DEV) console.log('[DEBUG] [Sentry] Disabled in development mode');
      return;
    }

    // Lazy load Sentry modules
    const [capacitorModule, reactModule] = await Promise.all([
      import('@sentry/capacitor'),
      import('@sentry/react'),
    ]);
    SentryCapacitor = capacitorModule;
    SentryReact = reactModule;

    // Detect platform
    const platform = Capacitor.isNativePlatform() ? Capacitor.getPlatform() : 'web';

    // Feature flag for Replay (can cause 3-5s freezes on complex pages like stats)
    // Set VITE_SENTRY_REPLAY=1 to enable, disabled by default in prod
    const replayEnabled = env.VITE_SENTRY_REPLAY === true;

    const tracesSampleRate = env.VITE_SENTRY_TRACES_SAMPLE_RATE ?? 0.1;
    const replaysSessionSampleRate =
      env.VITE_SENTRY_REPLAYS_SESSION_SAMPLE_RATE ?? (replayEnabled ? 0.01 : 0);
    const replaysOnErrorSampleRate =
      env.VITE_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE ?? (replayEnabled ? 0.1 : 0);

    // Initialize with Capacitor wrapper for native crash support
    // Second parameter passes the React SDK init function
    SentryCapacitor.init(
      {
        dsn,
        environment: import.meta.env.MODE,
        enabled: true,

        // Release tracking - links errors to sourcemaps
        release: `neurodual@${APP_VERSION}`,
        dist: platform,

        // Performance monitoring
        tracesSampleRate,

        // Session replay rates (only used if replayEnabled)
        // 1% normal sessions, 10% after errors (was 100% causing 3-5s freezes)
        replaysSessionSampleRate,
        replaysOnErrorSampleRate,

        // Distributed tracing: propagate trace headers to these targets.
        // IMPORTANT: Do NOT include the PowerSync server (sync.neurodual.fr) here.
        // PowerSync's CORS policy only allows Authorization, Content-Type, x-user-agent.
        // Adding sentry-trace/baggage headers causes CORS preflight failures → sync breaks.
        tracePropagationTargets: [
          'localhost',
          /^https:\/\/.*\.supabase\.co/,
          /^https:\/\/(?!sync\.).*\.neurodual\.fr/,
        ],

        integrations: [
          SentryReact.browserTracingIntegration(),
          ...(replayEnabled
            ? [
                SentryReact.replayIntegration({
                  maskAllText: true,
                  blockAllMedia: true,
                }),
              ]
            : []),
        ],

        initialScope: {
          tags: {
            platform,
            mode: import.meta.env.MODE,
            premium: String(env.VITE_PREMIUM_MODE === true),
            native: String(env.VITE_NATIVE_MODE === true),
          },
        },

        beforeSend(event) {
          const message = event.exception?.values?.[0]?.value ?? '';

          if (message.includes('ResizeObserver')) return null;
          if (message.includes('extension')) return null;
          if (message.includes('.then()" is not implemented on android')) return null;

          try {
            applyScopeToEvent(event as unknown as Record<string, unknown>);
          } catch {
            // ignore
          }

          try {
            if (typeof window !== 'undefined') {
              event.extra = {
                ...(event.extra ?? {}),
                persistenceStage: window.__NEURODUAL_PERSISTENCE_STAGE__ ?? null,
              };
              try {
                const diag = (window as unknown as { __ND_REPORT_CARD_DIAG__?: unknown })
                  .__ND_REPORT_CARD_DIAG__;
                if (Array.isArray(diag)) {
                  event.extra = {
                    ...(event.extra ?? {}),
                    reportCardDiagnostics: diag.slice(-60),
                  };
                }
              } catch {
                // ignore
              }
              event.tags = {
                ...(event.tags ?? {}),
                route: window.location?.pathname ?? 'unknown',
              };

              const ps = window as unknown as {
                __NEURODUAL_POWERSYNC_RUNTIME__?: unknown;
                __NEURODUAL_POWERSYNC_DB__?: unknown;
              };
              const db = ps.__NEURODUAL_POWERSYNC_DB__ as
                | { connected?: unknown; connecting?: unknown }
                | undefined;
              if (db) {
                event.tags = {
                  ...(event.tags ?? {}),
                  powersync_connected: String(db.connected === true),
                  powersync_connecting: String(db.connecting === true),
                };
              }
              const rt = ps.__NEURODUAL_POWERSYNC_RUNTIME__ as
                | { selectedVfs?: unknown; platform?: unknown }
                | undefined;
              if (rt) {
                event.tags = {
                  ...(event.tags ?? {}),
                  powersync_vfs: typeof rt.selectedVfs === 'string' ? rt.selectedVfs : 'unknown',
                  powersync_platform: typeof rt.platform === 'string' ? rt.platform : 'unknown',
                };
              }
            }
          } catch {
            // ignore
          }

          return event;
        },

        sendDefaultPii: false,
      },
      SentryReact.init,
    );

    if (import.meta.env.DEV)
      console.log(
        `[DEBUG] [Sentry] Initialized for ${platform} (release: neurodual@${APP_VERSION}, replay: ${replayEnabled ? 'enabled' : 'disabled'})`,
      );

    flushPending();
  })();

  try {
    await initPromise;
  } catch (error) {
    initPromise = null;
    throw error;
  }
}

/**
 * Report an error to Sentry manually.
 */
export function reportError(error: Error, context?: Record<string, unknown>): void {
  installBridge();

  if (SentryCapacitor) {
    SentryCapacitor.captureException(error, { extra: context });
  } else {
    enqueue({ kind: 'exception', error, context });
    console.error('[Sentry] Not initialized, queued error:', error);
  }
}

/**
 * Capture a message to Sentry (for non-error events like freeze detection).
 */
export function captureMessage(
  message: string,
  options?: { level?: 'info' | 'warning' | 'error'; extra?: Record<string, unknown> },
): void {
  installBridge();

  if (SentryCapacitor) {
    SentryCapacitor.captureMessage(message, {
      level: options?.level ?? 'info',
      extra: options?.extra,
    });
  } else {
    enqueue({ kind: 'message', message, options });
    console.warn('[Sentry] Not initialized, queued message:', message);
  }
}

/**
 * Capture user feedback via Sentry.
 * Best-effort: no-op if SDK is not yet initialized.
 */
function captureFeedback(params: {
  message: string;
  url?: string;
  tags?: Record<string, string>;
}): void {
  if (!SentryReact) return;
  try {
    SentryReact.captureFeedback({
      message: params.message,
      url: params.url,
      tags: params.tags,
    });
  } catch {
    // ignore
  }
}

function setUser(user: PendingUser): void {
  pendingUser = user;
  try {
    (SentryCapacitor as unknown as { setUser?: (user: PendingUser) => void } | null)?.setUser?.(
      user,
    );
  } catch {
    // ignore
  }
}

function setTag(key: string, value: string): void {
  pendingTags[key] = value;
  try {
    (
      SentryCapacitor as unknown as { setTag?: (key: string, value: string) => void } | null
    )?.setTag?.(key, value);
  } catch {
    // ignore
  }
}

function setContext(key: string, value: Record<string, unknown>): void {
  pendingContexts[key] = value;
  try {
    (
      SentryCapacitor as unknown as {
        setContext?: (key: string, value: Record<string, unknown>) => void;
      } | null
    )?.setContext?.(key, value);
  } catch {
    // ignore
  }
}

function addBreadcrumb(breadcrumb: { message: string; category?: string }): void {
  enqueueBreadcrumb(breadcrumb);
  try {
    (
      SentryCapacitor as unknown as {
        addBreadcrumb?: (b: { message: string; category?: string }) => void;
      } | null
    )?.addBreadcrumb?.(breadcrumb);
  } catch {
    // ignore
  }
}

// Expose the bridge as early as possible (even before initSentry()).
installBridge();
