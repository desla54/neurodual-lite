/**
 * useDualPickSessionMachine
 *
 * React hook for the XState-based DualPickSession machine.
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
  dualPickSessionMachine,
  type DualPickMachineInput,
  type DualPickMachineEvent,
  type DualPickMachineSnapshot,
  type DualPickMachinePhase,
} from '@neurodual/logic';
import {
  useActorPageCloseFinalizer,
  useActorUnmount,
  useRestartableActor,
} from './xstate-lifecycle';

// Re-export with simpler names for external use
export type DualPickSessionInput = DualPickMachineInput;
export type DualPickSessionEvent = DualPickMachineEvent;
export type DualPickSessionSnapshot = DualPickMachineSnapshot;

// =============================================================================
// Types
// =============================================================================

export interface UseDualPickSessionMachineResult {
  /** Read-only session state */
  snapshot: DualPickMachineSnapshot;
  /** Dispatch an event to the machine */
  send: (event: DualPickMachineEvent) => void;
  /** The underlying XState actor reference */
  actorRef: ActorRefFrom<typeof dualPickSessionMachine>;
  /** Stop the session (convenience wrapper) */
  stop: () => void;
}

// =============================================================================
// Selector for snapshot transformation
// =============================================================================

/**
 * Transform XState machine state to DualPickMachineSnapshot.
 * Provides all data needed for UI rendering.
 */
function selectSnapshot(
  state: ReturnType<ActorRefFrom<typeof dualPickSessionMachine>['getSnapshot']>,
): DualPickMachineSnapshot {
  const { context, value } = state;

  // Extract phase from state value
  let phase: DualPickMachinePhase;
  if (typeof value === 'string') {
    phase = value as DualPickMachinePhase;
  } else {
    phase = 'idle';
  }

  // Get current target from placement order
  let currentTarget = null;
  const mode = context.spec.extensions.placementOrderMode ?? 'free';
  if (mode !== 'free' && context.placementOrderIndex < context.placementOrder.length) {
    currentTarget = context.placementOrder[context.placementOrderIndex];
  }

  return {
    phase,
    trialIndex: context.trialIndex,
    totalTrials: context.generator.getTotalTrials(),
    stimulus: context.stimulus,
    proposals: context.proposals,
    timelineCards: context.timelineCards,
    stats: context.stats,
    nLevel: context.spec.defaults.nLevel,
    summary: context.summary,
    history: context.history,
    activeModalities: context.spec.defaults.activeModalities as readonly ('position' | 'audio')[],
    currentTarget: currentTarget ?? null,
  };
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Hook for managing a DualPickSession using XState.
 *
 * @param input - Configuration for the dual label session machine
 * @returns Object with snapshot, send, actorRef, stop
 *
 * @example
 * ```tsx
 * const { snapshot, send, stop } = useDualPickSessionMachine({
 *   sessionId,
 *   userId,
 *   spec: DualPickSpec,
 *   generator,
 *   audio: audioAdapter,
 *   clock: clockAdapter,
 *   random: randomAdapter,
 *   plugins: createDefaultDualPickPlugins(),
 * });
 *
 * // Start the session
 * send({ type: 'START' });
 *
 * // User drops a label
 * send({
 *   type: 'DROP_LABEL',
 *   proposalId: 'proposal-1',
 *   targetSlot: 0,
 *   targetType: 'position',
 *   trajectory: { ... },
 * });
 *
 * // Stop session
 * stop();
 * ```
 */
export function useDualPickSessionMachine(
  input: DualPickMachineInput,
): UseDualPickSessionMachineResult {
  const actorRef = useRestartableActor({
    actorKey: { sessionId: input.sessionId, commandBus: input.commandBus },
    createActor: () => createActor(dualPickSessionMachine, { input }),
    debugLabel: 'useDualPickSessionMachine',
  });

  // Select the snapshot using the selector
  const snapshot = useSelector(actorRef, selectSnapshot);

  // Memoized send function
  const send = useCallback(
    (event: DualPickMachineEvent) => {
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
    startedEventType: 'DUAL_PICK_SESSION_STARTED',
    endedEventType: 'DUAL_PICK_SESSION_ENDED',
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
