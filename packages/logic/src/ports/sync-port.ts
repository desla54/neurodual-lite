/**
 * SyncPort
 *
 * Interface for cloud synchronization operations.
 * Implemented by infra (Supabase), consumed by ui via Context.
 */

import type { GameEvent } from '../engine/events';

// =============================================================================
// Types
// =============================================================================

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error' | 'offline' | 'disabled';

export interface SyncState {
  /** Current sync status */
  readonly status: SyncStatus;
  /** Last successful sync timestamp */
  readonly lastSyncAt: number | null;
  /** Number of events pending sync */
  readonly pendingCount: number;
  /** Error message if status is 'error' */
  readonly errorMessage: string | null;
  /** Whether sync is available (user has cloud sync access) */
  readonly isAvailable: boolean;
}

export interface SyncResult {
  /** Whether sync completed successfully */
  readonly success: boolean;
  /** Number of events pushed to cloud */
  readonly pushedCount: number;
  /** Number of events pulled from cloud */
  readonly pulledCount: number;
  /** Error message if sync failed */
  readonly errorMessage?: string;
}

export type SyncStateListener = (state: SyncState) => void;

// =============================================================================
// Port
// =============================================================================

export interface SyncPort {
  /** Get current sync state */
  getState(): SyncState;

  /** Subscribe to sync state changes. Returns unsubscribe function. */
  subscribe(listener: SyncStateListener): () => void;

  /**
   * Trigger a manual sync.
   * Pushes local unsynced events to cloud, then pulls new events from cloud.
   */
  sync(): Promise<SyncResult>;

  /**
   * Enable/disable automatic background sync.
   * When enabled, syncs on:
   * - App startup (if online)
   * - Network reconnection
   * - Periodically every N minutes
   */
  setAutoSync(enabled: boolean): void;

  /**
   * Check if auto sync is enabled.
   */
  isAutoSyncEnabled(): boolean;

  /**
   * Get unsynced local events (for debugging/UI).
   */
  getUnsyncedEvents(): Promise<GameEvent[]>;

  /**
   * Force refresh the pending count.
   */
  refreshPendingCount(): Promise<void>;
}
