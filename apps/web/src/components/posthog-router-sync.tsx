import { hasPostHog } from '../env';
import { router } from '../router';
import { useMountEffect } from '@neurodual/ui';

function capturePageview(): void {
  if (!import.meta.env.PROD || !hasPostHog) return;
  void import('../services/posthog')
    .then(({ postHogCapture }) => {
      postHogCapture('$pageview', {
        $current_url: window.location.href,
        $pathname: window.location.pathname,
        $search: window.location.search,
        $hash: window.location.hash,
      });
    })
    .catch(() => {});
}

export function PostHogRouterSync(): null {
  useMountEffect(() => {
    if (!import.meta.env.PROD || !hasPostHog) return;

    // Initial capture
    capturePageview();

    // Capture on router navigations (works even for routes outside MainLayout).
    const unsubscribe = (
      router as unknown as { subscribe?: (fn: () => void) => () => void }
    ).subscribe?.(() => capturePageview());

    return () => {
      unsubscribe?.();
    };
  });

  return null;
}
