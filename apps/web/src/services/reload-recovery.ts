export type ReloadReason =
  | 'vite-preload-error'
  | 'stale-asset'
  | 'chunk-load-error'
  | 'react-error'
  | 'route-chunk-load-error'
  | 'persistence-io';

const RELOAD_QUERY_PARAM = '_reload';
const STORAGE_KEY = 'neurodual_reload_guard_v2';
const IOS_DEBUG_KEY = 'neurodual_ios_debug';

// Reduced from 30s to 10s - 30s was too long for UX when recovery is needed
const DEFAULT_WINDOW_MS = 10_000;
// 2 attempts in 10s window - prevents infinite reload loops while allowing recovery
const DEFAULT_MAX_ATTEMPTS = 2;

interface ReloadGuardState {
  windowStart: number;
  attemptCount: number;
  lastAttemptAt: number;
  lastReason?: ReloadReason;
}

function isAutoReloadDebugDisabled(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('ios_debug') === '1' || params.get('no_autoreload') === '1') {
      return true;
    }
    if (params.get('ios_debug') === '0') {
      return false;
    }
    return localStorage.getItem(IOS_DEBUG_KEY) === '1';
  } catch {
    return false;
  }
}

function readState(): ReloadGuardState | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ReloadGuardState>;
    if (
      typeof parsed.windowStart !== 'number' ||
      typeof parsed.attemptCount !== 'number' ||
      typeof parsed.lastAttemptAt !== 'number'
    ) {
      return null;
    }
    return parsed as ReloadGuardState;
  } catch {
    return null;
  }
}

function writeState(state: ReloadGuardState): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore storage issues (private mode, quota, etc.)
  }
}

/**
 * Clear all caches AND unregister the Service Worker.
 * This MUST complete before reload, otherwise the old SW intercepts
 * the reload and serves stale cached files → "reload doesn't change anything".
 */
async function clearCachesAndUnregisterSW(): Promise<void> {
  const promises: Promise<unknown>[] = [];

  // 1. Clear all Cache API caches
  if ('caches' in window) {
    promises.push(
      caches.keys().then((names) => Promise.all(names.map((name) => caches.delete(name)))),
    );
  }

  // 2. Unregister Service Worker (critical - old SW intercepts reloads!)
  if ('serviceWorker' in navigator) {
    promises.push(
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => Promise.all(regs.map((reg) => reg.unregister()))),
    );
  }

  try {
    await Promise.all(promises);
  } catch {
    // Ignore errors - we'll reload anyway
  }
}

// Exported for native shells: when an APK update is installed, the WebView can
// keep running an old JS context (or be controlled by an old SW). We use this
// to force a clean reload without requiring users to manually kill the app.
export { clearCachesAndUnregisterSW };

export function canAttemptAutoReload(options?: {
  now?: number;
  windowMs?: number;
  maxAttempts?: number;
  requireOnline?: boolean;
}): boolean {
  if (isAutoReloadDebugDisabled()) return false;

  const now = options?.now ?? Date.now();
  const windowMs = options?.windowMs ?? DEFAULT_WINDOW_MS;
  const maxAttempts = options?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;

  if (options?.requireOnline && navigator.onLine === false) return false;

  const prev = readState();
  if (!prev) return true;

  if (now - prev.windowStart > windowMs) return true;

  return prev.attemptCount < maxAttempts;
}

export function attemptAutoReload(
  reason: ReloadReason,
  options?: {
    cacheBust?: boolean;
    now?: number;
    windowMs?: number;
    maxAttempts?: number;
    requireOnline?: boolean;
  },
): boolean {
  if (isAutoReloadDebugDisabled()) {
    return false;
  }

  const now = options?.now ?? Date.now();
  const windowMs = options?.windowMs ?? DEFAULT_WINDOW_MS;
  const maxAttempts = options?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const cacheBust = options?.cacheBust ?? true;

  if (
    !canAttemptAutoReload({ now, windowMs, maxAttempts, requireOnline: options?.requireOnline })
  ) {
    return false;
  }

  const prev = readState();
  const shouldResetWindow = !prev || now - prev.windowStart > windowMs;
  const next: ReloadGuardState = shouldResetWindow
    ? { windowStart: now, attemptCount: 1, lastAttemptAt: now, lastReason: reason }
    : {
        windowStart: prev.windowStart,
        attemptCount: prev.attemptCount + 1,
        lastAttemptAt: now,
        lastReason: reason,
      };

  writeState(next);

  // Persist a breadcrumb for iOS debug (survives reload via localStorage).
  try {
    (
      window as Window & {
        __neurodualBootLog?: { add: (level: string, phase: string, detail: unknown) => void };
      }
    ).__neurodualBootLog?.add('warn', 'auto-reload', {
      reason,
      href: window.location.href,
      cacheBust: options?.cacheBust ?? true,
      requireOnline: options?.requireOnline ?? false,
      at: new Date().toISOString(),
    });
  } catch {
    // ignore diagnostics failures
  }

  // Build the reload URL
  const url = new URL(window.location.href);
  if (cacheBust) {
    url.searchParams.set(RELOAD_QUERY_PARAM, now.toString());
  }

  // CRITICAL: Clear caches and unregister SW BEFORE reload
  // Otherwise the old SW intercepts the reload and serves stale files
  clearCachesAndUnregisterSW()
    .then(() => {
      window.location.replace(url.toString());
    })
    .catch(() => {
      // Fallback: reload anyway
      window.location.replace(url.toString());
    });

  return true;
}

export function stripReloadQueryParam(): void {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(RELOAD_QUERY_PARAM)) return;
    url.searchParams.delete(RELOAD_QUERY_PARAM);

    // Use replaceState with retry - some browsers need a slight delay
    const tryReplace = () => {
      try {
        window.history.replaceState(null, '', url.toString());
      } catch {
        // Fallback: try again after DOM ready
        if (document.readyState !== 'complete') {
          document.addEventListener(
            'DOMContentLoaded',
            () => {
              try {
                window.history.replaceState(null, '', url.toString());
              } catch {
                // Give up silently
              }
            },
            { once: true },
          );
        }
      }
    };

    tryReplace();
  } catch {
    // ignore URL parsing errors
  }
}

/**
 * Clear the reload guard state from sessionStorage.
 * Call this when the app has successfully loaded to reset the error counter.
 * Also clears the module-error-handler counters and signals that the app
 * reload-recovery system is now active.
 */
export function clearReloadGuardOnSuccess(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
    // Clear module-error-handler state as well
    sessionStorage.removeItem('neurodual_module_reload_v2');
    sessionStorage.removeItem('neurodual_module_reload_count');
    // Signal that the app's reload-recovery is now handling errors
    // This tells module-error-handler.js to defer to us
    (
      window as Window & { __neurodualReloadRecoveryActive?: boolean }
    ).__neurodualReloadRecoveryActive = true;
  } catch {
    // Ignore storage errors
  }
}
