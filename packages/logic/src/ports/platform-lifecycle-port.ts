/**
 * Platform Lifecycle Port
 *
 * Abstraction for platform-specific lifecycle events.
 * Allows AppLifecycleMachine to receive BACKGROUNDED/FOREGROUNDED events
 * from both web (visibilitychange) and mobile (Capacitor appStateChange).
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Platform lifecycle events.
 * These map directly to AppLifecycleMachine events.
 */
export type PlatformLifecycleEvent = 'BACKGROUNDED' | 'FOREGROUNDED';

/**
 * Listener for platform lifecycle events.
 */
export type PlatformLifecycleListener = (event: PlatformLifecycleEvent) => void;

// =============================================================================
// Port Interface
// =============================================================================

/**
 * Source of platform lifecycle events.
 *
 * Implementations:
 * - Web: document.visibilitychange
 * - Mobile: @capacitor/app appStateChange
 */
export interface PlatformLifecycleSource {
  /**
   * Subscribe to lifecycle events.
   * @param listener Called when the app goes to background or foreground
   * @returns Unsubscribe function
   */
  subscribe(listener: PlatformLifecycleListener): () => void;

  /**
   * Check if the app is currently in background.
   * Useful for initial state determination.
   */
  isBackgrounded(): boolean;

  /**
   * Cleanup resources (remove event listeners).
   */
  dispose(): void;
}
