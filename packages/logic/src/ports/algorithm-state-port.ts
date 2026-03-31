/**
 * AlgorithmStatePort
 *
 * Interface for persisting adaptive algorithm state across sessions.
 * Enables meta-learning algorithms to remember user characteristics.
 *
 * The state is stored per user, allowing personalized adaptation.
 * Implemented by infra (SQLite), consumed by GameSession/MemoSession.
 */

import type { AlgorithmState } from '../sequence/types/algorithm';

// =============================================================================
// Types
// =============================================================================

/**
 * Supported algorithm types for state persistence.
 */
export type AlgorithmType = 'adaptive-controller' | 'meta-learning';

/**
 * Stored algorithm state with metadata.
 */
export interface StoredAlgorithmState {
  /** The serialized algorithm state */
  readonly state: AlgorithmState;
  /** When the state was last updated */
  readonly updatedAt: Date;
  /**
   * Number of times this state has been saved.
   * Note: This increments on every saveState() call, not once per session.
   * Multiple saves can occur per session (e.g., auto-save + finish).
   */
  readonly saveCount: number;
}

// =============================================================================
// Port
// =============================================================================

export interface AlgorithmStatePort {
  /**
   * Load the persisted state for an algorithm.
   *
   * @param userId - The user's ID
   * @param algorithmType - The type of algorithm
   * @returns The stored state, or null if none exists
   */
  loadState(userId: string, algorithmType: AlgorithmType): Promise<StoredAlgorithmState | null>;

  /**
   * Save the algorithm state.
   *
   * @param userId - The user's ID
   * @param algorithmType - The type of algorithm
   * @param state - The serialized algorithm state
   */
  saveState(userId: string, algorithmType: AlgorithmType, state: AlgorithmState): Promise<void>;

  /**
   * Clear all algorithm states for a user.
   * Used when user wants to "reset" their adaptive profile.
   *
   * @param userId - The user's ID
   */
  clearStates(userId: string): Promise<void>;
}
