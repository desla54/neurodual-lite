/**
 * PowerSync Sync Status Hook (Lite - Stub)
 *
 * In Lite mode, there's no cloud sync. Returns offline/disconnected state.
 */

export interface PowerSyncStatusInfo {
  isConnected: boolean;
  isConnecting: boolean;
  isSyncing: boolean;
  hasSyncError: boolean;
  errorMessage: string | null;
  lastSyncAt: Date | null;
  hasSynced: boolean;
  isUploading: boolean;
  isDownloading: boolean;
}

const OFFLINE_STATUS: PowerSyncStatusInfo = {
  isConnected: false,
  isConnecting: false,
  isSyncing: false,
  hasSyncError: false,
  errorMessage: null,
  lastSyncAt: null,
  hasSynced: false,
  isUploading: false,
  isDownloading: false,
};

/**
 * Hook to get PowerSync sync status.
 * Always returns offline in Lite mode.
 */
export function usePowerSyncStatus(): PowerSyncStatusInfo {
  return OFFLINE_STATUS;
}

/**
 * Hook to check if PowerSync is connected.
 * Always false in Lite mode.
 */
export function usePowerSyncConnected(): boolean {
  return false;
}

/**
 * Hook to check if PowerSync is currently syncing.
 * Always false in Lite mode.
 */
export function usePowerSyncSyncing(): boolean {
  return false;
}
