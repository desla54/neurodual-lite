/**
 * IntentHandler - Interface for processing game intentions
 *
 * Each session type implements this interface to handle user intentions.
 * This provides a unified API for all session types, regardless of their
 * internal implementation.
 *
 * The handler receives a GameIntention and decides whether to process it
 * based on the current session state and phase.
 */

import type { GameIntention } from './game-intention';

// =============================================================================
// Intent Result
// =============================================================================

/**
 * Result of processing an intention.
 */
export type IntentResult =
  | { readonly status: 'accepted' }
  | { readonly status: 'ignored'; readonly reason: string }
  | { readonly status: 'error'; readonly error: Error };

// =============================================================================
// Intent Handler Interface
// =============================================================================

/**
 * Interface for handling game intentions.
 *
 * Sessions that implement this interface can be controlled via
 * a unified intention-based API, making it easy to:
 * - Test sessions with deterministic inputs
 * - Support multiple input methods (keyboard, touch, gamepad)
 * - Add new input methods without modifying session code
 * - Replay sessions with recorded intentions
 */
export interface IntentHandler {
  /**
   * Handle a game intention.
   *
   * @param intention - The user's intention
   * @returns Result indicating whether the intention was processed
   */
  handleIntent(intention: GameIntention): IntentResult;

  /**
   * Check if an intention is valid for the current state.
   * Useful for UI to show/hide buttons based on valid actions.
   *
   * @param intention - The intention to check
   * @returns Whether the intention would be accepted
   */
  canHandleIntent(intention: GameIntention): boolean;

  /**
   * Get the list of intentions valid for the current state.
   * Useful for UI to show available actions.
   *
   * @returns Array of intention types that are currently valid
   */
  getValidIntentions(): readonly GameIntention['type'][];
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create an accepted result.
 */
export function accepted(): IntentResult {
  return { status: 'accepted' };
}

/**
 * Create an ignored result with reason.
 */
export function ignored(reason: string): IntentResult {
  return { status: 'ignored', reason };
}

/**
 * Create an error result.
 */
export function error(err: Error): IntentResult {
  return { status: 'error', error: err };
}
