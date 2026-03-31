/**
 * Deep Link Handler for Capacitor Mobile Apps
 *
 * Handles incoming URLs from:
 * - OAuth callbacks (Google, Apple) → /auth/callback
 * - Password reset links → /auth/reset-password
 * - Universal links / App Links
 *
 * This is critical for mobile authentication flows where the external browser
 * redirects back to the app via a custom URL scheme or universal link.
 */

import { Capacitor } from '@capacitor/core';
import { lifecycleLog } from '../logger';

// Types for App plugin (dynamic import to avoid bundling on web)
interface AppUrlOpen {
  url: string;
}

type NavigateCallback = (path: string) => void;

/**
 * Parse a deep link URL and extract the route path.
 *
 * Handles:
 * - neurodual://auth/callback?code=xxx → /auth/callback?code=xxx
 * - https://neurodual.com/auth/reset-password?token=xxx → /auth/reset-password?token=xxx
 * - capacitor://localhost/auth/callback → /auth/callback
 */
function parseDeepLinkUrl(url: string): string | null {
  try {
    const parsed = new URL(url);

    // Extract pathname and search params
    let path = parsed.pathname;

    // Handle capacitor://localhost URLs (pathname includes the route)
    if (parsed.protocol === 'capacitor:') {
      // pathname is already the route, e.g., /auth/callback
      path = parsed.pathname;
    }
    // Handle custom scheme like neurodual://
    else if (parsed.protocol === 'neurodual:') {
      // For neurodual://auth/callback, host is 'auth', pathname is '/callback'
      path = `/${parsed.host}${parsed.pathname}`;
    }
    // Handle https:// universal links
    else if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      path = parsed.pathname;
    }

    // Append search params if present
    if (parsed.search) {
      path += parsed.search;
    }

    // Append hash if present (for Supabase auth tokens)
    if (parsed.hash) {
      path += parsed.hash;
    }

    lifecycleLog.debug('[DeepLink] Parsed URL:', { original: url, path });
    return path;
  } catch (error) {
    lifecycleLog.error('[DeepLink] Failed to parse URL:', url, error);
    return null;
  }
}

/**
 * Check if the URL is a valid route we should handle.
 */
function isValidRoute(path: string): boolean {
  const validPrefixes = [
    '/auth/callback',
    '/auth/reset-password',
    '/nback',
    '/dual-place',
    '/dual-memo',
    '/dual-pick',
    '/dual-trace',
    '/stats',
    '/settings',
    '/tutorial',
    '/replay',
  ];

  return validPrefixes.some((prefix) => path.startsWith(prefix));
}

/**
 * Deep Link Handler class.
 *
 * Usage:
 * ```typescript
 * const handler = new DeepLinkHandler((path) => router.navigate(path));
 * await handler.init();
 *
 * // On app shutdown:
 * handler.dispose();
 * ```
 */
export class DeepLinkHandler {
  private navigate: NavigateCallback;
  private removeListener: (() => void) | null = null;
  private initialized = false;

  constructor(navigate: NavigateCallback) {
    this.navigate = navigate;
  }

  /**
   * Initialize the deep link handler.
   * - Checks for launch URL (app opened via deep link)
   * - Sets up listener for incoming deep links while app is running
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    // Only run on mobile
    if (!Capacitor.isNativePlatform()) {
      lifecycleLog.debug('[DeepLink] Skipping init on web platform');
      return;
    }

    try {
      // Dynamic import to avoid bundling on web
      const { App } = await import('@capacitor/app');

      // Step 1: Check if app was launched via deep link
      const launchUrl = await App.getLaunchUrl();
      if (launchUrl?.url) {
        lifecycleLog.info('[DeepLink] App launched via deep link:', launchUrl.url);
        this.handleUrl(launchUrl.url);
      }

      // Step 2: Listen for deep links while app is running
      const handle = await App.addListener('appUrlOpen', (event: AppUrlOpen) => {
        lifecycleLog.info('[DeepLink] Received deep link:', event.url);
        this.handleUrl(event.url);
      });

      this.removeListener = () => handle.remove();
      this.initialized = true;
      lifecycleLog.debug('[DeepLink] Handler initialized');
    } catch (error) {
      lifecycleLog.error('[DeepLink] Failed to initialize:', error);
    }
  }

  /**
   * Handle an incoming deep link URL.
   */
  private handleUrl(url: string): void {
    const path = parseDeepLinkUrl(url);

    if (!path) {
      lifecycleLog.warn('[DeepLink] Could not parse URL:', url);
      return;
    }

    if (!isValidRoute(path)) {
      lifecycleLog.warn('[DeepLink] Unknown route, navigating to home:', path);
      this.navigate('/');
      return;
    }

    lifecycleLog.info('[DeepLink] Navigating to:', path);
    this.navigate(path);
  }

  /**
   * Clean up listeners.
   */
  dispose(): void {
    if (this.removeListener) {
      this.removeListener();
      this.removeListener = null;
    }
    this.initialized = false;
    lifecycleLog.debug('[DeepLink] Handler disposed');
  }
}

/**
 * Create and initialize a deep link handler.
 * Convenience function for use in React components.
 */
export async function setupDeepLinkHandler(navigate: NavigateCallback): Promise<DeepLinkHandler> {
  const handler = new DeepLinkHandler(navigate);
  await handler.init();
  return handler;
}
