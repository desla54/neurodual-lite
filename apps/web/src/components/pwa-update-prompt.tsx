/**
 * PWA Silent Update Handler
 *
 * Registers the service worker for silent background updates.
 * With registerType: 'autoUpdate', updates happen automatically without user prompts.
 * This component only handles registration and periodic update checks.
 *
 * IMPORTANT: On native platforms (Capacitor), the SW is NOT registered because:
 * - Assets are already bundled locally in the APK/IPA
 * - The SW cache would conflict with app updates (serve stale cached assets)
 * - Offline capability is already provided by the native shell
 */

import { Capacitor } from '@capacitor/core';
import { toast, useMountEffect } from '@neurodual/ui';
import { useRegisterSW } from 'virtual:pwa-register/react';
import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { useBetaEnabled } from '../hooks/use-beta-features';

// Check interval: 1 hour
const CHECK_INTERVAL_MS = 60 * 60 * 1000;
// Delay before first check after startup (let app initialize, avoid disrupting first paint)
const STARTUP_CHECK_DELAY_MS = 60 * 1000;

async function checkForUpdate(
  swUrl: string,
  registration: ServiceWorkerRegistration,
): Promise<void> {
  // Skip if SW is installing or we're offline
  if (registration.installing) return;
  if ('connection' in navigator && !navigator.onLine) return;

  try {
    // Fetch SW to check for updates
    const resp = await fetch(swUrl, {
      cache: 'no-store',
      headers: { 'cache-control': 'no-cache' },
    });

    if (resp.status === 200) {
      await registration.update();
    }
  } catch {
    // Network error, ignore
  }
}

/**
 * Unregister all service workers and clear their caches.
 * Called on native platforms to clean up any previously registered SWs.
 */
async function unregisterAllServiceWorkers(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;

  try {
    // Unregister all SW registrations
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((reg) => reg.unregister()));

    // Clear all caches to remove stale assets
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((name) => caches.delete(name)));
    }
  } catch {
    // Ignore errors - not critical
  }
}

export function PWAUpdatePrompt(): ReactNode {
  const betaEnabled = useBetaEnabled();
  // Skip SW registration entirely on native platforms
  // Assets are bundled in APK/IPA, SW cache would cause stale content issues
  const isNative = Capacitor.isNativePlatform();

  const registrationRef = useRef<{
    swUrl: string;
    registration: ServiceWorkerRegistration;
  } | null>(null);
  const startupTimeoutRef = useRef<number | null>(null);
  const updateIntervalRef = useRef<number | null>(null);
  const updateToastShownRef = useRef(false);

  const updateServiceWorkerRef = useRef<((reloadPage?: boolean) => Promise<void>) | null>(null);

  // On native: unregister any existing SW and clear caches on mount
  useEffect(() => {
    if (isNative) {
      unregisterAllServiceWorkers();
    }
  }, [isNative]);

  // Register SW (web only). In this repo the PWA is configured as `registerType: 'prompt'`:
  // when a new version is ready, we show a toast instead of hard-refreshing the page.
  const sw = useRegisterSW({
    // Only register immediately on web, not on native
    immediate: !isNative,
    onRegisteredSW(swUrl, registration) {
      // Skip all SW logic on native platforms
      if (isNative || !registration) return;

      registrationRef.current = { swUrl, registration };

      if (startupTimeoutRef.current !== null) {
        clearTimeout(startupTimeoutRef.current);
      }
      if (updateIntervalRef.current !== null) {
        clearInterval(updateIntervalRef.current);
      }

      // Check shortly after startup (in case app was closed during an update)
      startupTimeoutRef.current = window.setTimeout(() => {
        checkForUpdate(swUrl, registration);
      }, STARTUP_CHECK_DELAY_MS);

      // Check for updates every hour (silently in background)
      updateIntervalRef.current = window.setInterval(() => {
        checkForUpdate(swUrl, registration);
      }, CHECK_INTERVAL_MS);
    },
    onNeedRefresh() {
      if (isNative) return;
      // Keep update prompting in beta only until the UX is stabilized.
      if (!betaEnabled) return;
      if (updateToastShownRef.current) return;
      updateToastShownRef.current = true;

      toast('Nouvelle version disponible', {
        description: 'Recharge la page pour appliquer la mise a jour.',
        duration: Infinity,
        action: {
          label: 'Recharger',
          onClick: () => {
            void updateServiceWorkerRef.current?.(true);
          },
        },
      });
    },
    onRegisterError(error) {
      // Don't log errors on native (expected when SW is disabled)
      if (!isNative) {
        console.error('[PWA] Registration error:', error);
      }
    },
  });

  // Keep a stable ref for toast action callbacks.
  if (!isNative) {
    updateServiceWorkerRef.current = sw.updateServiceWorker;
  }

  // Check when app returns from background (web only)
  useEffect(() => {
    if (isNative) return;

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible' && registrationRef.current) {
        const { swUrl, registration } = registrationRef.current;
        checkForUpdate(swUrl, registration);
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isNative]);

  useMountEffect(() => {
    return () => {
      if (startupTimeoutRef.current !== null) {
        clearTimeout(startupTimeoutRef.current);
      }
      if (updateIntervalRef.current !== null) {
        clearInterval(updateIntervalRef.current);
      }
    };
  });

  // No permanent UI.
  return null;
}
