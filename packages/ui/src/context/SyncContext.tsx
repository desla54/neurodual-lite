'use client';

/**
 * Sync Context (Lite - Noop)
 *
 * Simplified sync context. No cloud sync - all data stays local.
 */

import type { SyncPort, SyncState } from '@neurodual/logic';
import { getSyncAdapter, useSyncQuery as useSyncQueryQuery } from '../queries';

/**
 * Hook to get the sync adapter.
 */
export function useSyncAdapter(): SyncPort {
  return getSyncAdapter();
}

/**
 * Hook to get current sync state.
 * Always returns idle/unavailable in Lite mode.
 */
export function useSyncQuery(): SyncState {
  const { data } = useSyncQueryQuery();
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
 * Always false in Lite mode.
 */
export function useIsSyncAvailable(): boolean {
  return false;
}

/**
 * Hook to check if currently syncing.
 * Always false in Lite mode.
 */
export function useIsSyncing(): boolean {
  return false;
}

/**
 * Hook to get number of pending events.
 * Always 0 in Lite mode.
 */
export function usePendingCount(): number {
  return 0;
}

/**
 * Hook to trigger a manual sync.
 * Noop in Lite mode.
 */
export function useSync(): () => Promise<void> {
  return async () => {};
}
