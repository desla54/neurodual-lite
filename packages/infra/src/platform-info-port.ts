import { Capacitor } from '@capacitor/core';
import type { PlatformInfo, PlatformInfoPort } from '@neurodual/logic';

function detectPlatform(): PlatformInfo['platform'] {
  try {
    if (Capacitor.isNativePlatform()) {
      const platform = Capacitor.getPlatform();
      if (platform === 'android' || platform === 'ios') return platform;
    }
  } catch {
    // ignore
  }
  return 'web';
}

function getUserAgent(): string {
  if (typeof navigator === 'undefined') return 'unknown';
  return typeof navigator.userAgent === 'string' ? navigator.userAgent : 'unknown';
}

function getScreenSize(): { width: number; height: number } {
  if (typeof window === 'undefined') return { width: 0, height: 0 };

  const width =
    typeof window.innerWidth === 'number' ? window.innerWidth : (window.screen?.width ?? 0);
  const height =
    typeof window.innerHeight === 'number' ? window.innerHeight : (window.screen?.height ?? 0);

  return { width, height };
}

function isTouchCapable(): boolean {
  if (typeof window === 'undefined') return false;

  // Basic detection that works across browsers and Capacitor WebView.
  const hasTouchEvent = 'ontouchstart' in window;
  const maxTouchPoints =
    typeof navigator !== 'undefined' && typeof navigator.maxTouchPoints === 'number'
      ? navigator.maxTouchPoints
      : 0;
  return hasTouchEvent || maxTouchPoints > 0;
}

export function createPlatformInfoPort(): PlatformInfoPort {
  return {
    getPlatformInfo(): PlatformInfo {
      const { width, height } = getScreenSize();
      return {
        platform: detectPlatform(),
        screenWidth: width,
        screenHeight: height,
        userAgent: getUserAgent(),
        touchCapable: isTouchCapable(),
      };
    },
  };
}
