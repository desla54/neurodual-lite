/**
 * Hook for handling hardware back button on Android (Capacitor).
 *
 * On Android, the hardware back button doesn't automatically navigate
 * through browser history in a WebView. This hook bridges that gap.
 *
 * Behavior:
 * - Game pages: blocked (user must use in-app quit button)
 * - Other pages: navigate back in history
 * - Root with no history: exit the app
 */

import { useEffectEvent } from 'react';
import { useMountEffect } from '@neurodual/ui';
import { useNavigate, useLocation } from 'react-router';

/**
 * Pages where back button is blocked (active game sessions).
 * Users must use the in-app quit button to exit these pages.
 */
const BLOCKED_PATHS = ['/nback', '/dual-memo', '/dual-place', '/dual-trace', '/dual-pick'];

/**
 * Check if the current path should block back navigation.
 */
function isBackBlocked(pathname: string): boolean {
  // Exact match for game pages
  if (BLOCKED_PATHS.includes(pathname)) {
    return true;
  }
  // Active tutorial (not the hub /tutorial, but /tutorial/:specId)
  if (pathname.startsWith('/tutorial/') && pathname !== '/tutorial/') {
    return true;
  }
  return false;
}

/**
 * Enable hardware back button navigation on native platforms.
 * Should be called once in MainLayout.
 */
export function useBackButton(): void {
  const navigate = useNavigate();
  const location = useLocation();
  const handleBackButton = useEffectEvent(
    (
      canGoBack: boolean,
      app: {
        exitApp: () => Promise<void>;
      },
    ) => {
      const pathname = location.pathname;

      // Block back button on game pages
      if (isBackBlocked(pathname)) {
        // Do nothing - user must use in-app quit button
        return;
      }

      // At root path with no history -> exit app
      if (pathname === '/' && !canGoBack) {
        void app.exitApp();
        return;
      }

      // Can go back in history -> navigate back
      if (canGoBack || window.history.length > 1) {
        navigate(-1);
        return;
      }

      // Fallback: not at root but no history -> go to home
      if (pathname !== '/') {
        navigate('/', { replace: true });
        return;
      }

      // Last resort: exit app
      void app.exitApp();
    },
  );

  useMountEffect(() => {
    let listenerHandle: { remove: () => Promise<void> } | null = null;
    let cancelled = false;

    const setupListener = async () => {
      const [{ Capacitor }, { App }] = await Promise.all([
        import('@capacitor/core'),
        import('@capacitor/app'),
      ]);

      // Only run on native platforms (Android/iOS)
      if (!Capacitor.isNativePlatform() || cancelled) {
        return;
      }

      listenerHandle = await App.addListener('backButton', ({ canGoBack }) => {
        handleBackButton(canGoBack, App);
      });
    };

    setupListener().catch((error) => {
      // Silently ignore if App plugin is not available
      // This happens on web or if native plugin is not registered
      console.debug('[BackButton] Plugin not available:', error?.message);
    });

    return () => {
      cancelled = true;
      void listenerHandle?.remove();
    };
  });
}
