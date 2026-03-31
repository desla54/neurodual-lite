/**
 * Lightweight Web Vitals tracker — no external dependency.
 *
 * Collects LCP, FID, CLS and TTFB via PerformanceObserver,
 * then sends a single `web_vitals` event to PostHog after the page
 * has settled (5s after load or on first visibilitychange to hidden).
 */

import { hasPostHog } from '../env';

interface Vitals {
  lcp_ms?: number;
  fid_ms?: number;
  cls?: number;
  ttfb_ms?: number;
}

export function initWebVitals(): void {
  if (!import.meta.env.PROD || !hasPostHog) return;
  if (typeof PerformanceObserver === 'undefined') return;

  const vitals: Vitals = {};
  const observers: PerformanceObserver[] = [];
  let sent = false;

  const send = () => {
    if (sent) return;
    if (vitals.lcp_ms == null && vitals.cls == null && vitals.ttfb_ms == null) return;
    sent = true;
    for (const o of observers) o.disconnect();
    void import('./analytics')
      .then(({ trackEvent }) => trackEvent('web_vitals', vitals))
      .catch(() => {});
  };

  const supported = PerformanceObserver.supportedEntryTypes ?? [];

  // LCP
  if (supported.includes('largest-contentful-paint')) {
    try {
      const o = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const last = entries[entries.length - 1];
        if (last) vitals.lcp_ms = Math.round(last.startTime);
      });
      o.observe({ type: 'largest-contentful-paint', buffered: true });
      observers.push(o);
    } catch {
      /* unsupported */
    }
  }

  // FID
  if (supported.includes('first-input')) {
    try {
      const o = new PerformanceObserver((list) => {
        const entry = list.getEntries()[0] as PerformanceEventTiming | undefined;
        if (entry) vitals.fid_ms = Math.round(entry.processingStart - entry.startTime);
      });
      o.observe({ type: 'first-input', buffered: true });
      observers.push(o);
    } catch {
      /* unsupported */
    }
  }

  // CLS
  if (supported.includes('layout-shift')) {
    try {
      let clsValue = 0;
      const o = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!(entry as PerformanceEntry & { hadRecentInput?: boolean }).hadRecentInput) {
            clsValue += (entry as PerformanceEntry & { value: number }).value;
          }
        }
        vitals.cls = Math.round(clsValue * 1000) / 1000;
      });
      o.observe({ type: 'layout-shift', buffered: true });
      observers.push(o);
    } catch {
      /* unsupported */
    }
  }

  // TTFB
  if (supported.includes('navigation')) {
    try {
      const o = new PerformanceObserver((list) => {
        const nav = list.getEntries()[0] as PerformanceNavigationTiming | undefined;
        if (nav) vitals.ttfb_ms = Math.round(nav.responseStart - nav.requestStart);
      });
      o.observe({ type: 'navigation', buffered: true });
      observers.push(o);
    } catch {
      /* unsupported */
    }
  }

  // Send after 5s or on page hide (whichever comes first)
  setTimeout(send, 5000);
  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.visibilityState === 'hidden') send();
    },
    { once: true },
  );
}
