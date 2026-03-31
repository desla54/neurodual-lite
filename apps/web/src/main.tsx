// WDYR must be the very first import (before React)
import './wdyr';

// CRITICAL: Set up chunk error handler IMMEDIATELY, before any dynamic imports
// This must be the very first thing that runs
import { initPreloadErrorHandler } from './services/stale-assets-detector';
import { stripReloadQueryParam } from './services/reload-recovery';
import { initExtensionErrorFilter } from './services/extension-error-filter';
initPreloadErrorHandler();
stripReloadQueryParam();
initExtensionErrorFilter();

// iOS live-reload can run over plain HTTP, where crypto.randomUUID may be unavailable.
// Provide a minimal RFC4122 v4 fallback so startup code using randomUUID does not crash.
function ensureCryptoRandomUUID(): void {
  const cryptoObj = globalThis.crypto;
  if (!cryptoObj || typeof cryptoObj.randomUUID === 'function') {
    return;
  }
  if (typeof cryptoObj.getRandomValues !== 'function') {
    return;
  }

  const bytes = new Uint8Array(16);
  const toHex = (value: number) => value.toString(16).padStart(2, '0');

  const fallbackRandomUUID = (): string => {
    cryptoObj.getRandomValues(bytes);
    const byte6 = bytes[6] ?? 0;
    const byte8 = bytes[8] ?? 0;
    bytes[6] = (byte6 & 0x0f) | 0x40;
    bytes[8] = (byte8 & 0x3f) | 0x80;

    const hex = Array.from(bytes, toHex).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  };

  Object.defineProperty(cryptoObj, 'randomUUID', {
    configurable: true,
    value: fallbackRandomUUID,
    writable: true,
  });
}

ensureCryptoRandomUUID();

// iOS Debug: Log startup milestones
declare global {
  interface Window {
    __neurodualBootLog?: {
      add: (level: string, phase: string, detail: unknown) => void;
    };
    __iosDebug?: {
      log: (msg: string, context?: string) => void;
      isEnabled: () => boolean;
    };
  }
}

function addBootLog(phase: string, detail: unknown, level = 'info'): void {
  try {
    window.__neurodualBootLog?.add(level, phase, detail);
  } catch {
    // Ignore diagnostics failures.
  }
}

addBootLog('main-entry', 'main.tsx started');
if (window.__iosDebug?.isEnabled()) {
  window.__iosDebug.log('main.tsx started', 'startup');
}

import './styles.css';

// Suppress browser context menu on long-press (backup for CSS -webkit-touch-callout).
// iOS Safari is intermittent with the CSS property, so this JS handler covers edge cases.
document.addEventListener('contextmenu', (e) => {
  // Allow context menu on inputs/textareas where text selection is expected
  const tag = (e.target as HTMLElement)?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  e.preventDefault();
});

import { Fragment, StrictMode, Suspense, lazy } from 'react';
import { createRoot, type Root } from 'react-dom/client';

// Prevent Vite from wrapping this dynamic import with `__vitePreload` (which can
// accidentally pull large shared chunks into the entry graph).
const AppRoot = lazy(() =>
  import(/* @vite-ignore */ './app-root')
    .then((module) => {
      addBootLog('app-root-import', 'resolved');
      return module;
    })
    .catch((error: unknown) => {
      addBootLog('app-root-import-failed', error, 'error');
      throw error;
    }),
);

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element not found');
}

// Store root reference for HMR to reuse
let root: Root;
if (import.meta.hot) {
  // Reuse existing root during HMR
  root = (import.meta.hot.data.root as Root) ?? createRoot(container);
  import.meta.hot.data.root = root;
} else {
  root = createRoot(container);
}

// Fade out the web loading overlay, then remove from DOM.
// This overlay is visually identical to the native splash (same bg + icon),
// so when the native splash hides instantly, the web overlay takes over
// and provides a smooth fade-out transition to the app content.
function hideLoadingScreen() {
  const el = document.getElementById('app-loading');
  if (!el) return;

  // pointer-events: none so the app is interactive during the fade
  el.style.pointerEvents = 'none';
  el.style.transition = 'opacity 0.4s ease-out';
  el.style.opacity = '0';

  // Remove from DOM after the transition
  setTimeout(() => el.remove(), 450);
}
(window as Window & { __hideLoadingScreen?: () => void }).__hideLoadingScreen = hideLoadingScreen;

// Fallback component shown while AppRoot chunk is loading (Suspense boundary).
// We intentionally do NOT hide the loading screen here — it stays visible until ready.
function AppFallback() {
  return null;
}

const RootModeWrapper =
  import.meta.env.DEV &&
  import.meta.env['VITE_REACT_STRICT_MODE'] !== '1' &&
  import.meta.env['VITE_REACT_STRICT_MODE'] !== 'true'
    ? Fragment
    : StrictMode;

if (window.__iosDebug?.isEnabled()) {
  window.__iosDebug.log('About to render React', 'startup');
}
addBootLog('react-render', 'about-to-render');

try {
  root.render(
    <RootModeWrapper>
      <Suspense fallback={<AppFallback />}>
        <AppRoot />
      </Suspense>
    </RootModeWrapper>,
  );
  addBootLog('react-render', 'render-called');
} catch (error: unknown) {
  addBootLog('react-render-failed', error, 'error');
  throw error;
}

if (window.__iosDebug?.isEnabled()) {
  window.__iosDebug.log('React render called', 'startup');
}
