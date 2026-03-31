/**
 * Network Lifecycle Port
 *
 * Interface for network connectivity state management.
 * Detects online/offline status and notifies subscribers.
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Network connectivity states.
 */
export type NetworkState = 'online' | 'offline' | 'unknown';

/**
 * Network quality levels (for future use with Network Information API).
 */
export type NetworkQuality = 'excellent' | 'good' | 'fair' | 'poor' | 'unknown';

/**
 * Network info snapshot.
 */
export interface NetworkInfo {
  /** Current connectivity state */
  state: NetworkState;

  /** Network quality (if available) */
  quality: NetworkQuality;

  /** Effective connection type (4g, 3g, 2g, slow-2g) */
  effectiveType?: string;

  /** Estimated downlink speed in Mbps */
  downlink?: number;

  /** Estimated round-trip time in ms */
  rtt?: number;

  /** Whether data saver is enabled */
  saveData?: boolean;

  /** Last time state was updated */
  lastUpdated: number;
}

/**
 * Events emitted by the network lifecycle.
 */
export type NetworkLifecycleEvent =
  | { type: 'ONLINE' }
  | { type: 'OFFLINE' }
  | { type: 'QUALITY_CHANGED'; quality: NetworkQuality };

/**
 * Listener for network state changes.
 */
export type NetworkStateListener = (info: NetworkInfo) => void;

// =============================================================================
// Port Interface
// =============================================================================

/**
 * Port for network lifecycle management.
 *
 * Responsibilities:
 * - Detect network connectivity (online/offline)
 * - Monitor network quality when available
 * - Notify subscribers of state changes
 */
export interface NetworkLifecyclePort {
  // ===========================================================================
  // State
  // ===========================================================================

  /**
   * Get current network state.
   */
  getState(): NetworkState;

  /**
   * Get full network info.
   */
  getInfo(): NetworkInfo;

  /**
   * Check if currently online.
   */
  isOnline(): boolean;

  // ===========================================================================
  // Subscriptions
  // ===========================================================================

  /**
   * Subscribe to network state changes.
   *
   * @param listener - Called when network state changes
   * @returns Unsubscribe function
   */
  subscribe(listener: NetworkStateListener): () => void;

  // ===========================================================================
  // Lifecycle
  // ===========================================================================

  /**
   * Dispose the adapter and cleanup event listeners.
   */
  dispose(): void;
}
