/**
 * Analytics Service — NeuroDual Lite (noop)
 *
 * PostHog removed in Lite. All tracking calls are no-ops.
 */

import type { AnalyticsEventMap } from './analytics-events';

/**
 * Track a custom analytics event (type-safe).
 * No-op in Lite — PostHog is removed.
 */
export function trackEvent<E extends keyof AnalyticsEventMap>(
  _event: E,
  _properties: AnalyticsEventMap[E],
): void {
  // noop — analytics removed in NeuroDual Lite
}
