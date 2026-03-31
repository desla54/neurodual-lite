/**
 * Stale Assets Detector
 *
 * Handles chunk loading errors after new deployments using Vite's native
 * `vite:preloadError` event. This is the official recommended approach.
 *
 * @see https://vite.dev/guide/build#load-error-handling
 *
 * Also provides proactive detection when tab returns from background,
 * to catch stale assets before navigation errors occur.
 */

import { logger } from '../lib';
import { attemptAutoReload, canAttemptAutoReload } from './reload-recovery';

const PRELOAD_HANDLER_MARKER = '__ND_VITE_PRELOAD_ERROR_HANDLER__';
const PROACTIVE_DETECTOR_MARKER = '__ND_STALE_ASSETS_DETECTOR__';
const DEV_HMR_IMPORT_HANDLER_MARKER = '__ND_DEV_HMR_IMPORT_ERROR_HANDLER__';

// Minimum time in background before checking (5 minutes)
const MIN_BACKGROUND_TIME_MS = 5 * 60 * 1000;

// Track when tab was hidden
let hiddenAt: number | null = null;

// Asset URL to check (set during init)
let assetToCheck: string | null = null;

function isIOSWebKit(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent ?? '';
  const isIOS = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && /Mobile/i.test(ua));
  if (!isIOS) return false;
  // All browsers on iOS use WebKit, but keep Safari check for clarity.
  return /Safari\//i.test(ua);
}

function safeReload(reason: Parameters<typeof attemptAutoReload>[0]): void {
  if (!canAttemptAutoReload({ requireOnline: true })) {
    logger.warn('[StaleAssetsDetector] Reload blocked (guard/cooldown active)');
    return;
  }

  logger.debug('[StaleAssetsDetector] Reloading page...', { reason });
  attemptAutoReload(reason, { requireOnline: true });
}

function normalizeErrorMessage(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.message;
  if (value && typeof value === 'object' && 'message' in value) {
    const message = (value as { message?: unknown }).message;
    return typeof message === 'string' ? message : String(message ?? '');
  }
  return String(value ?? '');
}

function isDevHmrImportFailureMessage(message: string): boolean {
  if (!import.meta.env.DEV) return false;
  if (!message) return false;
  const lower = message.toLowerCase();
  if (
    !lower.includes('error loading dynamically imported module') &&
    !lower.includes('failed to fetch dynamically imported module')
  ) {
    return false;
  }
  return lower.includes('/src/') || lower.includes('/@fs/') || lower.includes('?t=');
}

function safeReloadAfterDevHmrImportFailure(): void {
  if (!canAttemptAutoReload({ requireOnline: false })) {
    logger.warn('[StaleAssetsDetector] Dev HMR reload blocked (guard/cooldown active)');
    return;
  }
  logger.warn('[StaleAssetsDetector] Reloading after dev HMR dynamic import failure');
  attemptAutoReload('chunk-load-error', {
    cacheBust: false,
    requireOnline: false,
  });
}

/**
 * Vite preload error event shape
 * @see https://vite.dev/guide/build#load-error-handling
 */
interface VitePreloadErrorEvent extends Event {
  payload: Error;
}

/**
 * Handle Vite's native preload error event
 * This is the official way to catch dynamic import failures
 */
function handleVitePreloadError(event: Event): void {
  const viteEvent = event as VitePreloadErrorEvent;
  logger.debug('[StaleAssetsDetector] vite:preloadError caught:', viteEvent.payload?.message);

  // Prevent the error from being thrown (we're handling it)
  event.preventDefault();

  safeReload('vite-preload-error');
}

/**
 * Initialize ONLY the preload error handler.
 * MUST be called IMMEDIATELY at app startup, BEFORE any dynamic imports.
 * This catches chunk loading errors that happen before DOM is fully ready.
 */
export function initPreloadErrorHandler(): void {
  if ((window as unknown as Record<string, unknown>)[PRELOAD_HANDLER_MARKER] === true) return;
  (window as unknown as Record<string, unknown>)[PRELOAD_HANDLER_MARKER] = true;
  window.addEventListener('vite:preloadError', handleVitePreloadError);

  let onError: ((event: ErrorEvent) => void) | null = null;
  let onUnhandledRejection: ((event: PromiseRejectionEvent) => void) | null = null;

  if (import.meta.env.DEV) {
    onError = (event: ErrorEvent) => {
      const message =
        normalizeErrorMessage(event.error) || normalizeErrorMessage(event.message) || '';
      if (!isDevHmrImportFailureMessage(message)) return;
      event.preventDefault();
      safeReloadAfterDevHmrImportFailure();
    };
    onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const message = normalizeErrorMessage(event.reason);
      if (!isDevHmrImportFailureMessage(message)) return;
      event.preventDefault();
      safeReloadAfterDevHmrImportFailure();
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);
    (window as unknown as Record<string, unknown>)[DEV_HMR_IMPORT_HANDLER_MARKER] = {
      onError,
      onUnhandledRejection,
    };
  }

  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      window.removeEventListener('vite:preloadError', handleVitePreloadError);
      const handlers = (window as unknown as Record<string, unknown>)[
        DEV_HMR_IMPORT_HANDLER_MARKER
      ] as
        | {
            onError?: (event: ErrorEvent) => void;
            onUnhandledRejection?: (event: PromiseRejectionEvent) => void;
          }
        | undefined;
      if (handlers?.onError) {
        window.removeEventListener('error', handlers.onError);
      }
      if (handlers?.onUnhandledRejection) {
        window.removeEventListener('unhandledrejection', handlers.onUnhandledRejection);
      }
      try {
        delete (window as unknown as Record<string, unknown>)[PRELOAD_HANDLER_MARKER];
        delete (window as unknown as Record<string, unknown>)[DEV_HMR_IMPORT_HANDLER_MARKER];
      } catch {
        // ignore
      }
    });
  }
}

/**
 * Initialize the full stale assets detector (proactive checking).
 * Call this after DOM is ready (script tags need to be parsed).
 * Safe to call with a delay - the critical handler is already active.
 */
export function initStaleAssetsDetector(): void {
  if ((window as unknown as Record<string, unknown>)[PROACTIVE_DETECTOR_MARKER] === true) return;
  (window as unknown as Record<string, unknown>)[PROACTIVE_DETECTOR_MARKER] = true;

  // On iOS WebKit, proactive "stale asset" checks can cause surprising reloads
  // after background/resume due to transient network / platform behavior.
  // We keep the critical `vite:preloadError` handler (registered in initPreloadErrorHandler)
  // but disable the visibility-change probe.
  const disableProactiveProbe = isIOSWebKit();

  // 1. Find a JS asset to use for proactive checking
  const scripts = document.querySelectorAll('script[src*="/assets/"]');
  for (const script of scripts) {
    const src = script.getAttribute('src');
    if (src?.includes('.js')) {
      assetToCheck = src;
      break;
    }
  }

  // Fallback: use a link tag (CSS)
  if (!assetToCheck) {
    const links = document.querySelectorAll('link[href*="/assets/"]');
    for (const link of links) {
      const href = link.getAttribute('href');
      if (href?.includes('.css')) {
        assetToCheck = href;
        break;
      }
    }
  }

  if (assetToCheck) {
    logger.debug('[StaleAssetsDetector] Monitoring asset:', assetToCheck);
  }

  // 3. Listen for visibility changes (proactive detection)
  if (!disableProactiveProbe) {
    document.addEventListener('visibilitychange', handleVisibilityChange);
  } else {
    logger.debug('[StaleAssetsDetector] Proactive probe disabled on iOS WebKit');
  }
}

/**
 * Stop the detector and cleanup.
 */
export function stopStaleAssetsDetector(): void {
  window.removeEventListener('vite:preloadError', handleVitePreloadError);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  hiddenAt = null;
  try {
    delete (window as unknown as Record<string, unknown>)[PRELOAD_HANDLER_MARKER];
    delete (window as unknown as Record<string, unknown>)[PROACTIVE_DETECTOR_MARKER];
  } catch {
    // ignore
  }
}

function handleVisibilityChange(): void {
  if (document.hidden) {
    // Tab is now hidden - record the time
    hiddenAt = Date.now();
  } else {
    // Tab is now visible - check if we were hidden long enough
    if (hiddenAt !== null) {
      const hiddenDuration = Date.now() - hiddenAt;
      hiddenAt = null;

      if (hiddenDuration >= MIN_BACKGROUND_TIME_MS) {
        logger.debug(
          `[StaleAssetsDetector] Tab was hidden for ${Math.round(hiddenDuration / 1000)}s, checking assets...`,
        );
        checkAndReloadIfStale();
      }
    }
  }
}

async function checkAndReloadIfStale(): Promise<void> {
  if (!assetToCheck) return;

  try {
    // Use HEAD request to avoid downloading the whole file
    const response = await fetch(assetToCheck, {
      method: 'HEAD',
      cache: 'no-store', // Bypass cache to get real server response
    });

    // Check if asset is stale:
    // 1. 404 status = file no longer exists
    // 2. Content-Type is HTML = SPA fallback returned index.html
    const contentType = response.headers.get('content-type') || '';
    // Be conservative: only reload on strong signals of a new deployment
    // (hashed asset missing, or SPA fallback served for an asset path).
    const isStale =
      response.status === 404 || (response.status === 200 && contentType.includes('text/html'));

    if (isStale) {
      logger.debug('[StaleAssetsDetector] Assets are stale, reloading...', {
        status: response.status,
        contentType,
      });
      safeReload('stale-asset');
    } else {
      logger.debug('[StaleAssetsDetector] Assets are still valid');
    }
  } catch (error) {
    // Network error - might be offline, don't reload
    logger.warn('[StaleAssetsDetector] Check failed (probably offline)', error);
  }
}
