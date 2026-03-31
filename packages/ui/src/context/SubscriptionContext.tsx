'use client';

/**
 * Subscription Context
 *
 * Provides subscription adapter access via module-level injection.
 * Uses TanStack Query for state caching.
 */

import type { SubscriptionPort, SubscriptionState } from '@neurodual/logic';
import { useCallback, useSyncExternalStore } from 'react';
import {
  getSubscriptionAdapter,
  useSubscriptionQuery as useSubscriptionQueryQuery,
  useHasPremiumAccess as useHasPremiumAccessQuery,
  useHasCloudSync as useHasCloudSyncQuery,
  useCanAccessNLevel as useCanAccessNLevelQuery,
  useIsTrialing as useIsTrialingQuery,
} from '../queries';

/**
 * Hook to get the subscription adapter.
 * Adapter is injected via NeurodualQueryProvider.
 */
export function useSubscriptionAdapter(): SubscriptionPort {
  return getSubscriptionAdapter();
}

/**
 * Hook to get current subscription state with automatic updates.
 * Uses TanStack Query + adapter subscription for immediate updates.
 */
export function useSubscriptionQuery(): SubscriptionState {
  const adapter = useSubscriptionAdapter();
  // Query hook ensures TanStack Query is initialized for this data
  useSubscriptionQueryQuery();

  // Subscribe to adapter for immediate subscription state changes
  return useSyncExternalStore(
    useCallback((cb) => adapter.subscribe(() => cb()), [adapter]),
    () => adapter.getState(),
  );
}

/**
 * Hook to check if user has premium access (N4+).
 */
export function useHasPremiumAccess(): boolean {
  return useHasPremiumAccessQuery();
}

/**
 * Hook to check if user can sync to cloud.
 */
export function useHasCloudSync(): boolean {
  return useHasCloudSyncQuery();
}

/**
 * Hook to check if a specific N-level is accessible.
 */
export function useCanAccessNLevel(nLevel: number): boolean {
  return useCanAccessNLevelQuery(nLevel);
}

/**
 * Hook to check if user is in trial period.
 */
export function useIsTrialing(): boolean {
  return useIsTrialingQuery();
}
