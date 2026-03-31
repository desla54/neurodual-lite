/**
 * Analytics Service — type-safe PostHog event tracking
 *
 * - No-op in dev/test (guard on `import.meta.env.PROD && hasPostHog`)
 * - Dynamic import of `./posthog` (same pattern as posthog-router-sync)
 * - Enriches every event with `platform` (web | ios | android)
 * - Fire-and-forget, never blocks the main thread
 */

import { Capacitor } from '@capacitor/core';
import type { AnalyticsEventMap } from './analytics-events';
import { hasPostHog } from '../env';

// Compute platform once (synchronous — Capacitor is statically imported)
let _platform: string | null = null;
function getPlatform(): string {
  if (_platform) return _platform;
  try {
    _platform = Capacitor.getPlatform() || 'web';
  } catch {
    _platform = 'web';
  }
  return _platform;
}

/**
 * Track a custom analytics event (type-safe).
 *
 * No-op in non-prod environments or when PostHog is disabled.
 */
export function trackEvent<E extends keyof AnalyticsEventMap>(
  event: E,
  properties: AnalyticsEventMap[E],
): void {
  if (!import.meta.env.PROD || !hasPostHog) return;

  void import('./posthog')
    .then(({ postHogCapture }) => {
      postHogCapture(event, {
        ...(properties as Record<string, unknown>),
        platform: getPlatform(),
      });
    })
    .catch(() => {
      // Swallow — analytics must never break the app
    });
}
