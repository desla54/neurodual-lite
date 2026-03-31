/**
 * useAnalytics — React hook for type-safe event tracking
 *
 * Returns a stable `track` function that never causes re-renders.
 * Lazy-imports the analytics service on first call.
 */

import { useRef, useCallback } from 'react';
import type { AnalyticsEventMap } from '../services/analytics-events';

type TrackFn = <E extends keyof AnalyticsEventMap>(
  event: E,
  properties: AnalyticsEventMap[E],
) => void;

export function useAnalytics(): { track: TrackFn } {
  const trackEventRef = useRef<typeof import('../services/analytics').trackEvent | null>(null);

  const track: TrackFn = useCallback((event, properties) => {
    if (trackEventRef.current) {
      trackEventRef.current(event, properties);
      return;
    }

    // Lazy import on first call
    void import('../services/analytics')
      .then(({ trackEvent }) => {
        trackEventRef.current = trackEvent;
        trackEvent(event, properties);
      })
      .catch(() => {
        // Swallow — analytics must never break the app
      });
  }, []);

  return { track };
}
