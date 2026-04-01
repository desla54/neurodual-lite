/**
 * Sync Queries (Lite - Noop)
 *
 * Simplified sync queries for local-only mode.
 * No cloud sync - all data stays local.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { GameEvent, SyncPort, SyncState } from '@neurodual/logic';
import { queryKeys } from './keys';

// =============================================================================
// Adapter References (noop - no sync in Lite)
// =============================================================================

const DEFAULT_SYNC_STATE: SyncState = {
  status: 'idle',
  lastSyncAt: null,
  pendingCount: 0,
  errorMessage: null,
  isAvailable: false,
};

const noopSyncAdapter: SyncPort = {
  getState: () => DEFAULT_SYNC_STATE,
  subscribe: () => () => {},
  sync: async () => ({ success: true, pushedCount: 0, pulledCount: 0 }),
  getUnsyncedEvents: async () => [],
  setAutoSync: () => {},
  isAutoSyncEnabled: () => false,
  refreshPendingCount: async () => {},
};

let syncAdapter: SyncPort = noopSyncAdapter;

export function setSyncAdapter(adapter: SyncPort): void {
  syncAdapter = adapter;
}

export function getSyncAdapter(): SyncPort {
  return syncAdapter;
}

// =============================================================================
// Queries
// =============================================================================

/**
 * Get current sync state.
 * Always returns idle/unavailable in Lite mode.
 */
export function useSyncQuery(): UseQueryResult<SyncState> {
  return useQuery<SyncState>({
    queryKey: queryKeys.sync.state(),
    queryFn: () => Promise.resolve(getSyncAdapter().getState()),
    staleTime: Number.POSITIVE_INFINITY,
    refetchInterval: false,
    placeholderData: DEFAULT_SYNC_STATE,
  });
}

/**
 * Get unsynced events.
 * Always empty in Lite mode.
 */
export function useUnsyncedEvents(): UseQueryResult<GameEvent[]> {
  return useQuery({
    queryKey: queryKeys.sync.unsyncedEvents(),
    queryFn: () => getSyncAdapter().getUnsyncedEvents(),
    staleTime: 10000,
  });
}

// =============================================================================
// Mutations (noop in Lite)
// =============================================================================

export function useSyncEvents(): UseMutationResult<void, Error, void> {
  return useMutation<void, Error, void>({
    mutationFn: async (): Promise<void> => {
      await getSyncAdapter().sync();
    },
  });
}

export function useSetAutoSync(): UseMutationResult<void, Error, boolean> {
  const queryClient = useQueryClient();
  return useMutation<void, Error, boolean>({
    mutationFn: async (enabled: boolean): Promise<void> => {
      getSyncAdapter().setAutoSync(enabled);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sync.state() });
    },
  });
}

// =============================================================================
// Force Full Resync (noop in Lite)
// =============================================================================

export interface ForceResyncResult {
  success: boolean;
  error?: string;
}

let forceFullResyncFn: (() => Promise<ForceResyncResult>) | null = null;

export function setForceFullResyncFn(fn: () => Promise<ForceResyncResult>): void {
  forceFullResyncFn = fn;
}

export function useForceFullResync(): UseMutationResult<ForceResyncResult, Error, void> {
  const queryClient = useQueryClient();
  return useMutation<ForceResyncResult, Error, void>({
    mutationFn: async (): Promise<ForceResyncResult> => {
      if (!forceFullResyncFn) {
        return { success: false, error: 'Sync not available in Lite mode' };
      }
      return forceFullResyncFn();
    },
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: queryKeys.sync.all });
      }
    },
  });
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Check if sync is available.
 * Always false in Lite mode.
 */
export function useIsSyncAvailable(): boolean {
  return false;
}

/**
 * Check if currently syncing.
 * Always false in Lite mode.
 */
export function useIsSyncing(): boolean {
  return false;
}

/**
 * Get pending events count.
 * Always 0 in Lite mode.
 */
export function usePendingCount(): number {
  return 0;
}

// =============================================================================
// Cache Helpers
// =============================================================================

export function invalidateSyncQueries(queryClient: ReturnType<typeof useQueryClient>): void {
  queryClient.invalidateQueries({ queryKey: queryKeys.sync.all });
}
