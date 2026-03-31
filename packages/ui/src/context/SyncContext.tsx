'use client';

/**
 * Sync Context
 *
 * Provides sync adapter access via module-level injection.
 * Uses TanStack Query for state caching.
 *
 * Architecture:
 * - Sync is triggered via SyncPort
 * - State is read from SyncPort
 * - TanStack Query provides caching and reactivity
 */

import type { SyncPort, SyncState } from '@neurodual/logic';
import {
  getSyncAdapter,
  useSyncQuery as useSyncQueryQuery,
  useSyncEvents,
  useIsSyncAvailable as useIsSyncAvailableQuery,
  useIsSyncing as useIsSyncingQuery,
  usePendingCount as usePendingCountQuery,
} from '../queries';

/**
 * Hook to get the sync adapter.
 * Adapter is injected via NeurodualQueryProvider.
 */
export function useSyncAdapter(): SyncPort {
  return getSyncAdapter();
}

/**
 * Hook to get current sync state with automatic updates.
 * Uses TanStack Query with automatic polling.
 */
export function useSyncQuery(): SyncState {
  const { data } = useSyncQueryQuery();
  // Return a default state if data is not yet loaded
  return (
    data ?? {
      status: 'idle',
      lastSyncAt: null,
      pendingCount: 0,
      errorMessage: null,
      isAvailable: false,
    }
  );
}

/**
 * Hook to check if cloud sync is available.
 */
export function useIsSyncAvailable(): boolean {
  return useIsSyncAvailableQuery();
}

/**
 * Hook to check if currently syncing.
 */
export function useIsSyncing(): boolean {
  return useIsSyncingQuery();
}

/**
 * Hook to get number of pending events.
 */
export function usePendingCount(): number {
  return usePendingCountQuery();
}

/**
 * Hook to trigger a manual sync.
 *
 * Sync is triggered via SyncPort.
 *
 * The returned function completes immediately after triggering.
 * Observe sync progress via useSyncQuery().
 */
export function useSync(): () => Promise<void> {
  const { mutateAsync } = useSyncEvents();
  return mutateAsync;
}
