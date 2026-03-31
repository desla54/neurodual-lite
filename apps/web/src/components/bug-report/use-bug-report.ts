import { Capacitor } from '@capacitor/core';
import { APP_VERSION } from '@neurodual/logic';
import { useCallback, useState } from 'react';

type SubmitResult = { ok: true } | { ok: false; error: string };

export function useBugReport() {
  const [isPending, setIsPending] = useState(false);

  const submitBugReport = useCallback(async (message: string): Promise<SubmitResult> => {
    setIsPending(true);
    try {
      const bridge = (
        window as unknown as { __ND_SENTRY_BRIDGE__?: { captureFeedback?: (p: unknown) => void } }
      ).__ND_SENTRY_BRIDGE__;

      bridge?.captureFeedback?.({
        message,
        url: window.location.pathname,
        tags: {
          source: 'bug_report',
          app_version: APP_VERSION,
          platform: Capacitor.isNativePlatform() ? Capacitor.getPlatform() : 'web',
          user_agent: navigator.userAgent,
          route: window.location.pathname,
        },
      });

      return { ok: true };
    } catch {
      return { ok: false, error: 'unexpected' };
    } finally {
      setIsPending(false);
    }
  }, []);

  return { submitBugReport, isPending };
}
