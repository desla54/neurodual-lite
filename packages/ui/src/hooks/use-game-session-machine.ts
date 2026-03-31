/**
 * useGameSessionMachine
 *
 * React hook for the XState-based GameSession machine.
 * Replaces the old useGameSession hook that used the manual State Pattern.
 *
 * Features:
 * - Creates and manages the XState machine actor
 * - Provides a snapshot that matches the old SessionSnapshot interface
 * - Provides a send function to dispatch events
 * - Automatically cleans up on unmount
 */

import { useMemo, useCallback } from 'react';
import { useActorRef, useSelector } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
import {
  gameSessionMachine,
  type GameSessionInput,
  type GameSessionEvent,
  type GameSessionSnapshot,
} from '@neurodual/logic';
import { useActorUnmount, useActorVisibilityPause } from './xstate-lifecycle';

const DEFAULT_PREP_DELAY_MS = 4000;

// =============================================================================
// Types
// =============================================================================

export interface UseGameSessionMachineResult {
  /** Read-only session state (matches old SessionSnapshot) */
  snapshot: GameSessionSnapshot;
  /** Dispatch an event to the machine */
  send: (event: GameSessionEvent) => void;
  /** The underlying XState actor reference */
  actorRef: ActorRefFrom<typeof gameSessionMachine>;
  /** Stop the session (convenience wrapper) */
  stop: () => void;
}

// =============================================================================
// Selector for snapshot transformation
// =============================================================================

/**
 * Transform XState machine state to GameSessionSnapshot.
 * This maintains API compatibility with the old GameSession class.
 */
function selectSnapshot(
  state: ReturnType<ActorRefFrom<typeof gameSessionMachine>['getSnapshot']>,
): GameSessionSnapshot {
  const { context, value } = state;

  // Extract phase from state value
  let phase: GameSessionSnapshot['phase'];
  if (typeof value === 'string') {
    // Map 'computing' to 'finished' for UI (computing is internal)
    if (value === 'computing') {
      phase = 'finished';
    } else {
      phase = value as 'idle' | 'starting' | 'countdown' | 'paused' | 'finished';
    }
  } else if (typeof value === 'object' && 'active' in value) {
    phase = value.active as 'stimulus' | 'waiting';
  } else {
    phase = 'idle';
  }

  return {
    phase,
    trial: context.currentTrial,
    trialIndex: context.trialIndex,
    totalTrials: context.config.trialsCount,
    isi: context.isi,
    prepDelayMs: context.spec.timing.prepDelayMs ?? DEFAULT_PREP_DELAY_MS, // Default: 4s countdown
    message: null, // Messages handled by UI layer
    dPrime: context.statsCalculator.calculate().currentDPrime,
    summary: context.finalSummary,
    trialHistory: context.trialHistory,
    nLevel: context.config.nLevel,
    adaptiveZone: context.generator.getZoneNumber(),
    xpBreakdown: context.xpBreakdown,
  };
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Hook for managing a GameSession using XState.
 *
 * @param input - Configuration for the game session machine
 * @returns Object with snapshot, send, actorRef, and stop
 *
 * @example
 * ```tsx
 * const { snapshot, send, stop } = useGameSessionMachine({
 *   sessionId,
 *   userId,
 *   config: gameConfig,
 *   audio: audioAdapter,
 *   timer: timerAdapter,
 *   generator: trialGenerator,
 *   statsCalculator: runningStats,
 *   judge: trialJudge,
 *   trialsSeed: seed,
 * });
 *
 * // Start the session
 * send({ type: 'START' });
 *
 * // Handle user response
 * send({ type: 'RESPOND', modalityId: 'position', inputMethod: 'keyboard' });
 *
 * // Pause/Resume
 * send({ type: 'PAUSE' });
 * send({ type: 'RESUME' });
 *
 * // Stop (cleanup)
 * stop();
 * ```
 */
export function useGameSessionMachine(input: GameSessionInput): UseGameSessionMachineResult {
  // Create the actor with the input
  const actorRef = useActorRef(gameSessionMachine, {
    input,
  });

  // Select the snapshot using the selector
  const snapshot = useSelector(actorRef, selectSnapshot);

  // Memoized send function
  const send = useCallback(
    (event: GameSessionEvent) => {
      actorRef.send(event);
    },
    [actorRef],
  );

  // Convenience stop function
  const stop = useCallback(() => {
    actorRef.send({ type: 'STOP' });
  }, [actorRef]);

  const finalizeActor = useCallback((actor: typeof actorRef) => {
    const state = actor.getSnapshot();
    if (state.status !== 'done') {
      actor.send({ type: 'STOP' });
    }
  }, []);

  useActorUnmount({
    actorRef,
    finalizeActor,
  });

  useActorVisibilityPause(actorRef);

  return useMemo(
    () => ({
      snapshot,
      send,
      actorRef,
      stop,
    }),
    [snapshot, send, actorRef, stop],
  );
}

// Re-export types for convenience
export type { GameSessionInput, GameSessionEvent, GameSessionSnapshot };
