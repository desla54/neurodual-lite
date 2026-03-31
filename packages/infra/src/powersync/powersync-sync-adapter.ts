/**
 * PowerSync sync adapter stub (NeuroDual Lite - no cloud sync)
 */

export interface SyncState {
  status: 'disabled';
  lastSyncedAt: null;
  lastSyncAt: null;
  pendingCount: number;
  errorMessage: null;
  error: null;
  isAvailable: boolean;
}

type SyncListener = (state: SyncState) => void;

const DISABLED_STATE: SyncState = {
  status: 'disabled',
  lastSyncedAt: null,
  lastSyncAt: null,
  pendingCount: 0,
  errorMessage: null,
  error: null,
  isAvailable: false,
};

export const powerSyncSyncAdapter = {
  getState(): SyncState {
    return DISABLED_STATE;
  },
  subscribe(_listener: SyncListener): () => void {
    return () => {};
  },
};
