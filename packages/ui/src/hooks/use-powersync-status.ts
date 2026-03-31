/**
 * PowerSync Sync Status Hook
 *
 * Provides reactive access to PowerSync sync status.
 * Uses the app SyncPort (PowerSync-backed) state, not @powersync/react.
 */

import { useSyncQuery } from '../queries';

export interface PowerSyncStatusInfo {
  /** Whether connected to PowerSync service */
  isConnected: boolean;
  /** Whether currently connecting */
  isConnecting: boolean;
  /** Whether currently syncing (uploading or downloading) */
  isSyncing: boolean;
  /** Whether there's a sync error (download or upload) */
  hasSyncError: boolean;
  /** Error message if any */
  errorMessage: string | null;
  /** Last successful sync timestamp */
  lastSyncAt: Date | null;
  /** Whether at least one sync has completed */
  hasSynced: boolean;
  /** Whether currently uploading local changes */
  isUploading: boolean;
  /** Whether currently downloading remote changes */
  isDownloading: boolean;
}

/**
 * Hook to get PowerSync sync status.
 *
 * Uses the app's SyncPort state via TanStack Query (useSyncQuery hook).
 * Does NOT require PowerSyncContext.Provider - works anywhere in the app.
 *
 * @example
 * ```tsx
 * function SyncIndicator() {
 *   const status = usePowerSyncStatus();
 *
 *   if (status.isSyncing) return <Spinner />;
 *   if (status.hasSyncError) return <ErrorIcon title={status.errorMessage} />;
 *   if (status.isConnected) return <CloudIcon color="green" />;
 *   return <CloudOffIcon />;
 * }
 * ```
 */
export function usePowerSyncStatus(): PowerSyncStatusInfo {
  const syncQuery = useSyncQuery();
  const syncState = syncQuery.data ?? {
    status: 'idle' as const,
    lastSyncAt: null,
    pendingCount: 0,
    errorMessage: null,
    isAvailable: false,
  };

  const isAvailable = syncState.isAvailable === true;
  const isSyncing = syncState.status === 'syncing';
  const hasError = syncState.status === 'error';

  return {
    isConnected: isAvailable && syncState.status !== 'offline',
    isConnecting: false,
    isSyncing,
    hasSyncError: hasError,
    errorMessage: syncState.errorMessage,
    lastSyncAt: syncState.lastSyncAt ? new Date(syncState.lastSyncAt) : null,
    hasSynced: syncState.lastSyncAt != null,
    // The SyncPort API doesn't distinguish upload vs download; we only know "syncing".
    isUploading: isSyncing,
    isDownloading: isSyncing,
  };
}

/**
 * Hook to check if PowerSync is connected.
 */
export function usePowerSyncConnected(): boolean {
  const syncQuery = useSyncQuery();
  const syncState = syncQuery.data;
  if (!syncState) return false;
  return syncState.isAvailable === true && syncState.status !== 'offline';
}

/**
 * Hook to check if PowerSync is currently syncing.
 */
export function usePowerSyncSyncing(): boolean {
  const syncQuery = useSyncQuery();
  const syncState = syncQuery.data;
  return syncState?.status === 'syncing';
}
