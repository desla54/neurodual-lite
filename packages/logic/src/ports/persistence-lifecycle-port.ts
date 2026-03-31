/**
 * Persistence Lifecycle Port
 *
 * Interface for SQLite WebWorker lifecycle management.
 * Tracks initialization, crash recovery, and restart attempts.
 */

// =============================================================================
// Types
// =============================================================================

/**
 * States of the persistence (SQLite worker) lifecycle.
 */
export type PersistenceLifecycleState =
  | 'idle' // Not yet initialized
  | 'starting' // Worker initialization in progress
  | 'ready' // Worker is operational
  | 'degraded' // Worker crashed, waiting for auto-retry
  | 'restarting' // Restart attempt in progress
  | 'error' // Max retries exceeded, manual intervention needed
  | 'terminated'; // Worker shut down

// =============================================================================
// Port Interface
// =============================================================================

/**
 * Port for persistence (SQLite worker) lifecycle management.
 * Implemented by the XState adapter in infra.
 */
export interface PersistenceLifecyclePort {
  /** Current lifecycle state */
  getState(): PersistenceLifecycleState;

  /** Error details (during degraded/error states) */
  getError(): Error | null;

  /** Number of restart attempts since last success */
  getRetryCount(): number;

  /** Whether the worker is operational */
  isReady(): boolean;

  /** Whether the worker is in a degraded state (crashed, restarting, or error) */
  isDegraded(): boolean;

  // ===========================================================================
  // Actions
  // ===========================================================================

  /** Start worker initialization */
  init(): void;

  /** Manually retry after error */
  retry(): void;

  /** Report a worker error (called by bridge on crash) */
  reportError(error: Error): void;

  /** Shutdown the worker */
  shutdown(): Promise<void>;

  // ===========================================================================
  // Subscriptions
  // ===========================================================================

  /** Subscribe to state changes */
  subscribe(listener: (state: PersistenceLifecycleState) => void): () => void;

  /** Wait for the worker to be ready (rejects on error state) */
  waitForReady(): Promise<void>;
}
