import { useEffect } from 'react';
import { useIsOnline, useAppPorts, useOptionalAppState } from '../providers';
import { hasPostHog } from '../env';

function safeUserId(value: string): string {
  return value.trim().length > 0 ? value : 'unknown';
}

export function PostHogContextSync(): null {
  const { auth, subscription, hasSupabase } = useAppPorts();
  const isOnline = useIsOnline();
  const appState = useOptionalAppState();

  useEffect(() => {
    if (!import.meta.env.PROD || !hasPostHog) return;

    const syncOnce = () => {
      const authState = auth.getState();
      const subscriptionState = subscription.getState();

      const isAuthed = authState.status === 'authenticated';
      const userId = isAuthed ? safeUserId(authState.session.user.id) : null;

      void import('../services/posthog')
        .then(({ postHogIdentify, postHogRegister, postHogReset }) => {
          const planType = subscriptionState.subscription?.planType ?? 'free';
          const hasPremium = subscriptionState.hasPremiumAccess === true;
          const hasCloudSync = subscriptionState.hasCloudSync === true;

          if (userId) {
            const email = isAuthed ? authState.session.user.email : undefined;
            postHogIdentify(userId, {
              ...(email ? { email } : {}),
              plan_type: planType,
              has_premium: hasPremium,
              has_cloud_sync: hasCloudSync,
              has_supabase: hasSupabase,
            });
          } else {
            postHogReset();
          }

          postHogRegister({
            online: isOnline,
            app_state: appState ?? 'unknown',
            has_supabase: hasSupabase,
            has_cloud_sync: hasCloudSync,
            has_premium: hasPremium,
            plan_type: planType,
          });
        })
        .catch(() => {});
    };

    syncOnce();

    const unsubs: Array<() => void> = [];
    if (typeof auth.subscribe === 'function') {
      unsubs.push(auth.subscribe(() => syncOnce()));
    }
    if (typeof subscription.subscribe === 'function') {
      unsubs.push(subscription.subscribe(() => syncOnce()));
    }

    return () => {
      for (const u of unsubs) u();
    };
  }, [appState, auth, hasSupabase, isOnline, subscription]);

  return null;
}
