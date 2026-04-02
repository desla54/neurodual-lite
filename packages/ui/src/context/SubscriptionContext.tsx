'use client';

/**
 * Subscription Context (Lite)
 *
 * Now backed by the premium activation system.
 * Premium = activated via code. Free = 30 min then level 3+ locked.
 */

import type { SubscriptionPort, SubscriptionState } from '@neurodual/logic';
import {
  getSubscriptionAdapter,
  useSubscriptionQuery as useSubscriptionQueryQuery,
} from '../queries';
import { useIsPremium, usePremiumState } from '../queries/premium';

/**
 * Hook to get the subscription adapter.
 */
export function useSubscriptionAdapter(): SubscriptionPort {
  return getSubscriptionAdapter();
}

/**
 * Hook to get current subscription state.
 */
export function useSubscriptionQuery(): SubscriptionState {
  const { data } = useSubscriptionQueryQuery();
  return (
    data ?? {
      subscription: null,
      hasPremiumAccess: true,
      hasCloudSync: false,
      isTrialing: false,
      daysRemaining: null,
    }
  );
}

/**
 * Hook to check if user has premium access.
 * Backed by the activation code system.
 */
export function useHasPremiumAccess(): boolean {
  const isPremium = useIsPremium();
  const { data } = usePremiumState();
  // Premium if activated OR free time not exhausted
  if (isPremium) return true;
  return !(data?.isFreeTimeExhausted ?? false);
}

/**
 * Hook to check if user can sync to cloud.
 * Always false in Lite mode.
 */
export function useHasCloudSync(): boolean {
  return false;
}

/**
 * Hook to check if a specific N-level is accessible.
 * Blocked at N3+ after 30min free time exhausted.
 */
export function useCanAccessNLevel(nLevel: number): boolean {
  const isPremium = useIsPremium();
  const { data } = usePremiumState();
  if (isPremium) return true;
  if (!data) return true;
  if (nLevel < 3) return true;
  return !data.isFreeTimeExhausted;
}

/**
 * Hook to check if user is in trial period.
 * Always false — we use free playtime instead.
 */
export function useIsTrialing(): boolean {
  return false;
}
