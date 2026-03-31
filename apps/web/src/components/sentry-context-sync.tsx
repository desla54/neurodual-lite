import { useEffect, useMemo } from 'react';
import { useIsOnline, useAppPorts, useOptionalAppState } from '../providers';

function fnv1a32(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function getOrCreateAnonId(): string {
  const key = 'nd_sentry_anon_id_v1';
  try {
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const next =
      (crypto as unknown as { randomUUID?: () => string }).randomUUID?.() ??
      `${Date.now()}-${Math.random()}`;
    localStorage.setItem(key, next);
    return next;
  } catch {
    return 'anon';
  }
}

function getBridge(): unknown {
  try {
    if (typeof window === 'undefined') return null;
    return (window as unknown as { __ND_SENTRY_BRIDGE__?: unknown }).__ND_SENTRY_BRIDGE__ ?? null;
  } catch {
    return null;
  }
}

function bridgeCall(method: string, ...args: unknown[]): void {
  const bridge = getBridge() as Record<string, unknown> | null;
  if (!bridge) return;
  const fn = bridge[method];
  if (typeof fn !== 'function') return;
  (fn as (...a: unknown[]) => void)(...args);
}

export function SentryContextSync(): null {
  const { auth, subscription, hasSupabase } = useAppPorts();
  const isOnline = useIsOnline();
  const appState = useOptionalAppState();

  const anonId = useMemo(() => getOrCreateAnonId(), []);

  useEffect(() => {
    const syncOnce = () => {
      const authState = auth.getState();
      const subscriptionState = subscription.getState();

      const isAuthed = authState.status === 'authenticated';
      const rawUserId = isAuthed ? authState.session.user.id : null;
      const userId = rawUserId ? `u_${fnv1a32(rawUserId)}` : `a_${fnv1a32(anonId)}`;

      bridgeCall('setUser', { id: userId });
      bridgeCall('setTag', 'auth', isAuthed ? 'authenticated' : authState.status);
      bridgeCall('setTag', 'online', String(isOnline));
      bridgeCall('setTag', 'app_state', appState ?? 'unknown');
      bridgeCall('setTag', 'has_supabase', String(hasSupabase));
      bridgeCall('setTag', 'has_cloud_sync', String(subscriptionState.hasCloudSync === true));
      bridgeCall('setTag', 'has_premium', String(subscriptionState.hasPremiumAccess === true));
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
  }, [anonId, appState, auth, hasSupabase, isOnline, subscription]);

  useEffect(() => {
    bridgeCall('addBreadcrumb', { message: `app_state:${appState ?? 'unknown'}`, category: 'app' });
  }, [appState]);

  return null;
}
