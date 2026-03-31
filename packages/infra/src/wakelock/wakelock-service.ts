/**
 * Wake Lock Service
 *
 * Prevents the screen from dimming/sleeping during training sessions:
 * - Capacitor native (iOS/Android): Uses @capacitor-community/keep-awake
 * - Web: Uses Screen Wake Lock API (where supported)
 */

import { KeepAwake } from '@capacitor-community/keep-awake';
import { Capacitor } from '@capacitor/core';
import type { WakeLockPort } from '@neurodual/logic';

/**
 * Check if we're running in a native Capacitor context
 */
function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Check if Screen Wake Lock API is available (modern browsers)
 */
function hasWakeLockAPI(): boolean {
  return typeof navigator !== 'undefined' && 'wakeLock' in navigator;
}

// Web Wake Lock reference (for release)
let webWakeLock: WakeLockSentinel | null = null;
// Track whether the app *wants* a wake lock on web.
// Note: Web wake locks are automatically released when the page is hidden.
let webKeepRequested = false;
let visibilityHandlerAttached = false;
const handleWebVisibilityChange = () => {
  if (!webKeepRequested) return;
  if (typeof document === 'undefined' || document.visibilityState !== 'visible') return;
  void requestWebWakeLock();
};

async function requestWebWakeLock(): Promise<void> {
  if (!hasWakeLockAPI()) return;
  if (webWakeLock) return;
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;

  try {
    webWakeLock = await navigator.wakeLock.request('screen');
    webWakeLock.addEventListener('release', () => {
      webWakeLock = null;
    });
  } catch {
    // Wake lock request failed (e.g., page not visible, permission denied)
    // Silently fail - wake lock is not critical
  }
}

function ensureWebVisibilityHandler(): void {
  if (visibilityHandlerAttached) return;
  if (typeof document === 'undefined') return;

  visibilityHandlerAttached = true;
  document.addEventListener('visibilitychange', handleWebVisibilityChange);
}

function teardownWebVisibilityHandler(): void {
  if (!visibilityHandlerAttached) return;
  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', handleWebVisibilityChange);
  }
  visibilityHandlerAttached = false;
}

/**
 * Wake Lock adapter implementing WakeLockPort
 */
export const wakeLockAdapter: WakeLockPort = {
  isSupported(): boolean {
    return isNative() || hasWakeLockAPI();
  },

  async keepAwake(): Promise<void> {
    if (isNative()) {
      await KeepAwake.keepAwake();
    } else if (hasWakeLockAPI()) {
      webKeepRequested = true;
      ensureWebVisibilityHandler();
      await requestWebWakeLock();
    }
  },

  async allowSleep(): Promise<void> {
    if (isNative()) {
      await KeepAwake.allowSleep();
    } else {
      webKeepRequested = false;
      const sentinel = webWakeLock;
      webWakeLock = null;
      if (sentinel) {
        await sentinel.release();
      }
    }
    teardownWebVisibilityHandler();
  },

  async isKeptAwake(): Promise<boolean> {
    if (isNative()) {
      const result = await KeepAwake.isKeptAwake();
      return result.isKeptAwake;
    }
    return webWakeLock !== null;
  },
};

const hot = (import.meta as unknown as { hot?: { dispose: (cb: () => void) => void } }).hot;
if (hot) {
  hot.dispose(() => {
    webKeepRequested = false;
    teardownWebVisibilityHandler();
    const sentinel = webWakeLock;
    webWakeLock = null;
    void sentinel?.release().catch(() => {});
  });
}
