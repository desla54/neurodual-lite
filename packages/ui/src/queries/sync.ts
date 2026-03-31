/**
 * Sync Queries
 *
 * TanStack Query hooks for cloud synchronization.
 * Architecture:
 * - SyncPort: actual sync operations (PowerSync-backed)
 * - TanStack Query: cache layer for UI consumption
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
// Adapter References (injected via Provider)
// =============================================================================

let syncAdapter: SyncPort | null = null;

export function setSyncAdapter(adapter: SyncPort): void {
  syncAdapter = adapter;
}

export function getSyncAdapter(): SyncPort {
  if (!syncAdapter) {
    throw new Error('Sync adapter not initialized. Call setSyncAdapter first.');
  }
  return syncAdapter;
}

// =============================================================================
// Queries
// =============================================================================

/**
 * Default sync state for loading/placeholder.
 */
const DEFAULT_SYNC_STATE: SyncState = {
  status: 'idle',
  lastSyncAt: null,
  pendingCount: 0,
  errorMessage: null,
  isAvailable: false,
};

/**
 * Get current sync state.
 * Replaces useSyncState() from SyncContext.
 *
 * Uses placeholderData to ensure UI renders immediately while loading.
 *
 * Note: State is updated reactively via NeurodualQueryProvider subscription
 * to the sync adapter. No polling needed - the machine manages state transitions
 * and NeurodualQueryProvider calls setQueryData on changes.
 */
export function useSyncQuery(): UseQueryResult<SyncState> {
  return useQuery<SyncState>({
    queryKey: queryKeys.sync.state(),
    queryFn: () => Promise.resolve(getSyncAdapter().getState()),
    // State never becomes stale - machine handles updates reactively
    staleTime: Number.POSITIVE_INFINITY,
    // No polling - NeurodualQueryProvider handles updates via:
    // adapter.subscribe() -> queryClient.setQueryData()
    refetchInterval: false,
    // Provide default state while loading to prevent disabled buttons
    placeholderData: DEFAULT_SYNC_STATE,
  });
}

/**
 * Get unsynced events.
 */
export function useUnsyncedEvents(): UseQueryResult<GameEvent[]> {
  return useQuery({
    queryKey: queryKeys.sync.unsyncedEvents(),
    queryFn: () => getSyncAdapter().getUnsyncedEvents(),
    staleTime: 10000,
  });
}

// =============================================================================
// Mutations
// =============================================================================

/**
 * Trigger a manual sync operation.
 *
 * The mutation returns void since:
 * - Sync is triggered asynchronously via the adapter
 * - Results are observable via useSyncState()
 * - isPending tracks mutation state, not sync completion
 */
export function useSyncEvents(): UseMutationResult<void, Error, void> {
  return useMutation<void, Error, void>({
    mutationFn: async (): Promise<void> => {
      await getSyncAdapter().sync();
    },
    // Note: Query invalidation is handled by NeurodualQueryProvider
    // which subscribes to sync adapter state changes
  });
}

/**
 * Enable/disable auto sync.
 */
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
// Force Full Resync Mutation
// =============================================================================

/** Result type for force full resync */
export interface ForceResyncResult {
  success: boolean;
  error?: string;
}

/** Adapter for force full resync - injected at runtime */
let forceFullResyncFn: (() => Promise<ForceResyncResult>) | null = null;

export function setForceFullResyncFn(fn: () => Promise<ForceResyncResult>): void {
  forceFullResyncFn = fn;
}

/**
 * Force a full resync (reset cursor + full pull).
 * Troubleshooting tool that ensures all cloud data is fetched.
 */
export function useForceFullResync(): UseMutationResult<ForceResyncResult, Error, void> {
  const queryClient = useQueryClient();

  return useMutation<ForceResyncResult, Error, void>({
    mutationFn: async (): Promise<ForceResyncResult> => {
      if (!forceFullResyncFn) {
        throw new Error('forceFullResync not initialized. Call setForceFullResyncFn first.');
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
 * Check if sync is available (user has cloud access).
 */
export function useIsSyncAvailable(): boolean {
  const { data } = useSyncQuery();
  return data?.isAvailable ?? false;
}

/**
 * Check if currently syncing.
 */
export function useIsSyncing(): boolean {
  const { data } = useSyncQuery();
  return data?.status === 'syncing';
}

/**
 * Get pending events count.
 */
export function usePendingCount(): number {
  const { data } = useSyncQuery();
  return data?.pendingCount ?? 0;
}

// =============================================================================
// Cache Helpers (for Realtime integration)
// =============================================================================

/**
 * Invalidate sync state query.
 * Note: History/Profile/Progression/Journey use PowerSync watched queries.
 * They auto-update when SQLite changes - no manual invalidation needed.
 */
export function invalidateSyncQueries(queryClient: ReturnType<typeof useQueryClient>): void {
  queryClient.invalidateQueries({ queryKey: queryKeys.sync.all });
}
