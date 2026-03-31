/**
 * App Lifecycle Port
 *
 * Interface for global application lifecycle management.
 * Tracks initialization, background/foreground transitions, and shutdown.
 */

// =============================================================================
// Types
// =============================================================================

/**
 * States of the application lifecycle.
 */
export type AppLifecycleState =
  | 'cold_start' // First launch, nothing initialized
  | 'initializing' // Init in progress (SQLite, settings, i18n)
  | 'ready' // Everything ready, waiting for user action
  | 'active' // Game session in progress
  | 'backgrounded' // App in background (mobile)
  | 'resuming' // Returning from background
  | 'error' // Recoverable error
  | 'shutdown'; // Cleanup in progress

/**
 * Progress during initialization phase.
 */
export interface InitializationProgress {
  step: 'sqlite' | 'settings' | 'i18n' | 'done';
  detail?: string;
}

// =============================================================================
// Port Interface
// =============================================================================

/**
 * Port for app lifecycle management.
 * Implemented by the XState adapter in infra.
 */
export interface AppLifecyclePort {
  /** Current lifecycle state */
  getState(): AppLifecycleState;

  /** Initialization progress (only during 'initializing' state) */
  getProgress(): InitializationProgress | null;

  /** Error details (only during 'error' state) */
  getError(): Error | null;

  /** Whether the app is ready for user interaction */
  isReady(): boolean;

  // ===========================================================================
  // Actions
  // ===========================================================================

  /** Retry initialization after an error */
  retry(): void;

  /** Notify that a game session has started */
  enterSession(): void;

  /** Notify that a game session has ended */
  exitSession(): void;

  /** Start shutdown process (logout, app close) */
  shutdown(): Promise<void>;

  // ===========================================================================
  // Subscriptions
  // ===========================================================================

  /** Subscribe to state changes */
  subscribe(listener: (state: AppLifecycleState) => void): () => void;

  /** Subscribe to initialization progress */
  subscribeProgress(listener: (progress: InitializationProgress) => void): () => void;
}
