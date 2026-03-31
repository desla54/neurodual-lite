/**
 * Sentry Early Capture
 *
 * Installs lightweight global listeners BEFORE the full Sentry SDK is initialized.
 * This prevents losing critical startup errors/unhandled rejections and also provides
 * a global bridge that other packages (e.g. @neurodual/infra) can call without taking
 * a direct dependency on apps/web.
 *
 * The actual SDK is initialized later in `services/sentry.ts` (lazy-loaded).
 */

type EarlyItem =
  | {
      readonly kind: 'exception';
      readonly error: Error;
      readonly context?: Record<string, unknown>;
    }
  | {
      readonly kind: 'message';
      readonly message: string;
      readonly options?: { level?: 'info' | 'warning' | 'error'; extra?: Record<string, unknown> };
    }
  | { readonly kind: 'set_user'; readonly user: { readonly id?: string | null } | null }
  | { readonly kind: 'set_tag'; readonly key: string; readonly value: string }
  | { readonly kind: 'set_context'; readonly key: string; readonly value: Record<string, unknown> }
  | { readonly kind: 'breadcrumb'; readonly breadcrumb: { message: string; category?: string } }
  | {
      readonly kind: 'log';
      readonly level: 'warning' | 'error';
      readonly service: string;
      readonly args: readonly unknown[];
    };

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
    __ND_SENTRY_EARLY__?: unknown[];
    __ND_SENTRY_BRIDGE__?: unknown;
  }
}

const MAX_EARLY = 100;

function enqueue(item: EarlyItem): void {
  let q = window.__ND_SENTRY_EARLY__;
  if (!q) {
    q = [];
    window.__ND_SENTRY_EARLY__ = q;
  }
  (q as EarlyItem[]).push(item);
  if (q.length > MAX_EARLY) {
    q.splice(0, q.length - MAX_EARLY);
  }
}

function ensureBridgeInstalled(): void {
  if (window.__ND_SENTRY_BRIDGE__) return;
  const bridge: SentryBridge = {
    captureException: (error, context) => enqueue({ kind: 'exception', error, context }),
    captureMessage: (message, options) => enqueue({ kind: 'message', message, options }),
    captureFeedback: () => {}, // no-op: feedback only makes sense when SDK is loaded
    captureLog: (level, service, args) => enqueue({ kind: 'log', level, service, args }),
    setUser: (user) => enqueue({ kind: 'set_user', user }),
    setTag: (key, value) => enqueue({ kind: 'set_tag', key, value }),
    setContext: (key, value) => enqueue({ kind: 'set_context', key, value }),
    addBreadcrumb: (breadcrumb) => enqueue({ kind: 'breadcrumb', breadcrumb }),
  };
  window.__ND_SENTRY_BRIDGE__ = bridge;
}

export function initSentryEarlyCapture(): void {
  if (typeof window === 'undefined') return;

  ensureBridgeInstalled();

  // Avoid double-install in HMR or multi-entry cases.
  const marker = '__ND_SENTRY_EARLY_INSTALLED__';
  if ((window as unknown as Record<string, unknown>)[marker] === true) return;
  (window as unknown as Record<string, unknown>)[marker] = true;

  // IMPORTANT: use capture=true so we also catch resource loading errors
  // (script/css chunk failures often produce a "black screen" with no thrown exception).
  window.addEventListener(
    'error',
    (event: Event) => {
      try {
        // Runtime errors bubble as ErrorEvent. Resource errors (script/link/img) are plain Events.
        if (event instanceof ErrorEvent) {
          const error =
            event.error instanceof Error ? event.error : new Error(event.message || 'Window error');
          enqueue({
            kind: 'exception',
            error,
            context: {
              source: 'window.error',
              filename: event.filename,
              lineno: event.lineno,
              colno: event.colno,
            },
          });
          return;
        }

        const target = event.target;
        if (target instanceof HTMLScriptElement) {
          enqueue({
            kind: 'exception',
            error: new Error('Resource load failed: <script>'),
            context: { source: 'resource.error', tag: 'script', src: target.src || null },
          });
          return;
        }
        if (target instanceof HTMLLinkElement) {
          enqueue({
            kind: 'exception',
            error: new Error('Resource load failed: <link>'),
            context: { source: 'resource.error', tag: 'link', href: target.href || null },
          });
          return;
        }
        if (target instanceof HTMLImageElement) {
          enqueue({
            kind: 'exception',
            error: new Error('Resource load failed: <img>'),
            context: { source: 'resource.error', tag: 'img', src: target.src || null },
          });
          return;
        }

        enqueue({
          kind: 'exception',
          error: new Error('Unhandled window error event'),
          context: { source: 'window.error', eventType: event.type },
        });
      } catch {
        // ignore
      }
    },
    { capture: true },
  );

  window.addEventListener('securitypolicyviolation', (event) => {
    try {
      const v = event as SecurityPolicyViolationEvent;
      enqueue({
        kind: 'message',
        message: 'CSP violation',
        options: {
          level: 'error',
          extra: {
            source: 'securitypolicyviolation',
            blockedURI: v.blockedURI,
            effectiveDirective: v.effectiveDirective,
            violatedDirective: v.violatedDirective,
            originalPolicy: v.originalPolicy,
            disposition: v.disposition,
          },
        },
      });
    } catch {
      // ignore
    }
  });

  window.addEventListener('unhandledrejection', (event) => {
    try {
      const reason = (event as PromiseRejectionEvent).reason;
      const error =
        reason instanceof Error
          ? reason
          : new Error(typeof reason === 'string' ? reason : 'Unhandled promise rejection');
      enqueue({
        kind: 'exception',
        error,
        context: {
          source: 'window.unhandledrejection',
          reasonType: typeof reason,
        },
      });
    } catch {
      // ignore
    }
  });
}
