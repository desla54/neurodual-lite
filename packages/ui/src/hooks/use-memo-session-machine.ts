/**
 * useMemoSessionMachine
 *
 * React hook for the XState-based MemoSession machine.
 *
 * Features:
 * - Creates and manages the XState machine actor
 * - Provides a snapshot for UI consumption
 * - Provides a send function to dispatch events
 * - Automatically cleans up on unmount
 */

import { useMemo, useCallback } from 'react';
import { useSelector } from '@xstate/react';
import { createActor, type ActorRefFrom } from 'xstate';
import {
  memoSessionMachine,
  type MemoSessionMachineInput,
  type MemoSessionEvent,
  type MemoSessionSnapshot,
  type MemoPhase,
} from '@neurodual/logic';
import {
  useActorPageCloseFinalizer,
  useActorUnmount,
  useRestartableActor,
} from './xstate-lifecycle';

// Re-export types for external use
export type { MemoSessionMachineInput, MemoSessionEvent, MemoSessionSnapshot };

// =============================================================================
// Types
// =============================================================================

export interface UseMemoSessionMachineResult {
  /** Read-only session state */
  snapshot: MemoSessionSnapshot;
  /** Dispatch an event to the machine */
  send: (event: MemoSessionEvent) => void;
  /** The underlying XState actor reference */
  actorRef: ActorRefFrom<typeof memoSessionMachine>;
  /** Stop the session (convenience wrapper) */
  stop: () => void;
}

// =============================================================================
// Selector for snapshot transformation
// =============================================================================

/**
 * Transform XState machine state to MemoSessionSnapshot.
 * Provides all data needed for UI rendering.
 */
function selectSnapshot(
  state: ReturnType<ActorRefFrom<typeof memoSessionMachine>['getSnapshot']>,
): MemoSessionSnapshot {
  const { context, value } = state;

  // Extract phase from state value
  let phase: MemoPhase;
  if (typeof value === 'string') {
    phase = value as MemoPhase;
  } else {
    phase = 'idle';
  }

  // Use the snapshot builder plugin to build UI snapshot
  const snapshot = context.plugins.snapshot.build({
    phase,
    phaseEnteredAt: context.phaseEnteredAt,
    trialIndex: context.trialIndex,
    currentTrial: context.currentTrial,
    currentPicks: context.currentPicks,
    correctionCounts: context.correctionCounts,
    fillOrder: context.fillOrder,
    fillOrderIndex: context.fillOrderIndex,
    effectiveWindowDepth: context.effectiveWindowDepth,
    sessionEvents: context.sessionEvents,
    trials: context.trials,
    generator: context.generator,
    spec: context.spec,
    message: context.message,
    finalSummary: context.finalSummary,
  });

  return snapshot;
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Hook for managing a MemoSession using XState.
 *
 * @param input - Configuration for the memo session machine
 * @returns Object with snapshot, send, actorRef, stop
 *
 * @example
 * ```tsx
 * const { snapshot, send, stop } = useMemoSessionMachine({
 *   sessionId,
 *   userId,
 *   spec: DualMemoSpec,
 *   generator,
 *   audio: audioAdapter,
 *   clock: clockAdapter,
 *   random: randomAdapter,
 *   plugins: createDefaultMemoPlugins({ spec }),
 * });
 *
 * // Start the session
 * send({ type: 'START' });
 *
 * // User picks a value
 * send({
 *   type: 'PICK',
 *   slotIndex: 0,
 *   pick: { modality: 'position', value: 5 },
 *   inputMethod: 'touch',
 * });
 *
 * // User commits the window
 * send({ type: 'COMMIT' });
 *
 * // Stop session
 * stop();
 * ```
 */
export function useMemoSessionMachine(input: MemoSessionMachineInput): UseMemoSessionMachineResult {
  const actorRef = useRestartableActor({
    actorKey: { sessionId: input.sessionId, commandBus: input.commandBus },
    createActor: () => createActor(memoSessionMachine, { input }),
    debugLabel: 'useMemoSessionMachine',
  });

  // Select the snapshot using the selector
  const snapshot = useSelector(actorRef, selectSnapshot);

  // Memoized send function
  const send = useCallback(
    (event: MemoSessionEvent) => {
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

  useActorPageCloseFinalizer({
    actorRef,
    startedEventType: 'RECALL_SESSION_STARTED',
    endedEventType: 'RECALL_SESSION_ENDED',
    finalizeActor,
  });

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
