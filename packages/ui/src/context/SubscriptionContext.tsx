'use client';

/**
 * Subscription Context (Lite - Always Free)
 *
 * Simplified subscription context. All features unlocked.
 */

import type { SubscriptionPort, SubscriptionState } from '@neurodual/logic';
import {
  getSubscriptionAdapter,
  useSubscriptionQuery as useSubscriptionQueryQuery,
} from '../queries';

/**
 * Hook to get the subscription adapter.
 */
export function useSubscriptionAdapter(): SubscriptionPort {
  return getSubscriptionAdapter();
}

/**
 * Hook to get current subscription state.
 * Always returns full-access in Lite mode.
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
 * Always true in Lite mode.
 */
export function useHasPremiumAccess(): boolean {
  return true;
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
 * Always true in Lite mode - all levels unlocked.
 */
export function useCanAccessNLevel(_nLevel: number): boolean {
  return true;
}

/**
 * Hook to check if user is in trial period.
 * Always false in Lite mode.
 */
export function useIsTrialing(): boolean {
  return false;
}
