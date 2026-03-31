/**
 * useGameSession
 *
 * Hook React pour Unidirectional Data Flow.
 * Subscribe à GameSession et re-render quand l'état change.
 * ZERO logique de jeu - seulement dispatch d'intentions via handleIntent.
 */

import type {
  SessionSnapshot,
  SessionListener,
  GameIntention,
  IntentResult,
  IntentHandler,
} from '@neurodual/logic';
import { useCallback, useSyncExternalStore } from 'react';

// =============================================================================
// Session Interface (shared by GameSession and GameSessionXState)
// =============================================================================

/**
 * Minimal interface for a game session that can be used with useGameSession hook.
 * Both GameSession and GameSessionXState implement this interface.
 */
export interface GameSessionLike extends IntentHandler {
  subscribe(listener: SessionListener): () => void;
  getSnapshot(): SessionSnapshot;
}

// =============================================================================
// Types
// =============================================================================

export interface UseGameSessionResult {
  /** Read-only session state */
  snapshot: SessionSnapshot;
  /** Dispatch a game intention to the session */
  dispatch: (intention: GameIntention) => IntentResult;
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Hook for interacting with GameSession using Unidirectional Data Flow.
 *
 * @param session - A GameSession or GameSessionXState instance to connect to
 * @returns Object with snapshot (read-only state) and dispatch (intent handler)
 *
 * @example
 * ```tsx
 * const { snapshot, dispatch } = useGameSession(session);
 *
 * // Read state
 * const { phase, trial, trialIndex } = snapshot;
 *
 * // Dispatch intentions (never call session methods directly)
 * dispatch({ type: 'START' });
 * dispatch({ type: 'CLAIM_MATCH', modality: 'position', inputMethod: 'keyboard' });
 * dispatch({ type: 'PAUSE' });
 * ```
 */
export function useGameSession(session: GameSessionLike): UseGameSessionResult {
  // Subscribe to session state changes
  const snapshot = useSyncExternalStore(
    (callback) => session.subscribe(callback),
    () => session.getSnapshot(),
    () => session.getSnapshot(),
  );

  // Dispatch function that delegates to session.handleIntent()
  const dispatch = useCallback(
    (intention: GameIntention): IntentResult => {
      return session.handleIntent(intention);
    },
    [session],
  );

  return { snapshot, dispatch };
}
