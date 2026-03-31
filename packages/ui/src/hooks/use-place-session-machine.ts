/**
 * usePlaceSessionMachine
 *
 * React hook for the XState-based PlaceSession machine.
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
  placeSessionMachine,
  type PlaceSessionMachineInput,
  type PlaceSessionMachineEvent,
  type PlaceSessionMachineSnapshot,
  type PlaceSessionMachineStateValue,
  type PlacePhase,
} from '@neurodual/logic';
import {
  useActorPageCloseFinalizer,
  useActorUnmount,
  useRestartableActor,
} from './xstate-lifecycle';

// Re-export with simpler names for external use
export type PlaceMachineInput = PlaceSessionMachineInput;
export type PlaceMachineEvent = PlaceSessionMachineEvent;
export type PlaceMachineSnapshot = PlaceSessionMachineSnapshot;

// =============================================================================
// Types
// =============================================================================

export interface UsePlaceSessionMachineResult {
  /** Read-only session state */
  snapshot: PlaceSessionMachineSnapshot;
  /** Dispatch an event to the machine */
  send: (event: PlaceSessionMachineEvent) => void;
  /** The underlying XState actor reference */
  actorRef: ActorRefFrom<typeof placeSessionMachine>;
  /** Stop the session (convenience wrapper) */
  stop: () => void;
}

// =============================================================================
// State Value to Phase Mapping
// =============================================================================

/**
 * Map XState state value to PlacePhase.
 */
function mapStateToPhase(stateValue: PlaceSessionMachineStateValue): PlacePhase {
  switch (stateValue) {
    case 'idle':
      return 'idle';
    case 'stimulus':
      return 'stimulus';
    case 'placement':
      return 'placement';
    case 'awaitingAdvance':
      return 'awaitingAdvance';
    case 'finished':
      return 'finished';
    default:
      return 'idle';
  }
}

// =============================================================================
// Selector for snapshot transformation
// =============================================================================

/**
 * Transform XState machine state to PlaceSessionMachineSnapshot.
 * Provides all data needed for UI rendering.
 */
function selectSnapshot(
  state: ReturnType<ActorRefFrom<typeof placeSessionMachine>['getSnapshot']>,
): PlaceSessionMachineSnapshot {
  const { context, value } = state;

  // Extract phase from state value
  let phase: PlacePhase;
  if (typeof value === 'string') {
    phase = mapStateToPhase(value as PlaceSessionMachineStateValue);
  } else {
    phase = 'idle';
  }

  // Get current target from placement order
  let currentTarget = null;
  const mode = context.spec.extensions.placementOrderMode ?? 'free';
  if (mode !== 'free' && context.placementOrderIndex < context.placementOrder.length) {
    currentTarget = context.placementOrder[context.placementOrderIndex];
  }

  // Get nLevel from generator if available, otherwise from spec
  const nLevel =
    'getNLevel' in context.generator && typeof context.generator.getNLevel === 'function'
      ? (context.generator as { getNLevel(): number }).getNLevel()
      : context.spec.defaults.nLevel;

  return {
    phase,
    trialIndex: context.trialIndex,
    totalTrials: context.generator.getTotalTrials(),
    nLevel,
    stimulus: context.stimulus,
    proposals: context.proposals,
    placedProposals: context.placedProposals,
    currentTarget: currentTarget ?? null,
    stats: context.stats,
    history: context.history,
    summary: context.summary,
    adaptiveZone: context.generator.getZoneNumber() ?? null,
  };
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Hook for managing a PlaceSession using XState.
 *
 * @param input - Configuration for the flow session machine
 * @returns Object with snapshot, send, actorRef, stop
 *
 * @example
 * ```tsx
 * const { snapshot, send, stop } = usePlaceSessionMachine({
 *   sessionId,
 *   userId,
 *   spec: DualPlaceSpec,
 *   generator,
 *   audio: audioAdapter,
 *   clock: clockAdapter,
 *   random: randomAdapter,
 *   plugins: createDefaultPlacePlugins({ spec: DualPlaceSpec }),
 * });
 *
 * // Start the session
 * send({ type: 'START' });
 *
 * // User drops a proposal
 * send({
 *   type: 'DROP',
 *   proposalId: 'proposal-1',
 *   targetSlot: 0,
 *   trajectory: { ... },
 * });
 *
 * // Advance to next trial
 * send({ type: 'ADVANCE' });
 *
 * // Stop session
 * stop();
 * ```
 */
export function usePlaceSessionMachine(
  input: PlaceSessionMachineInput,
): UsePlaceSessionMachineResult {
  const actorRef = useRestartableActor({
    actorKey: { sessionId: input.sessionId, commandBus: input.commandBus },
    createActor: () => createActor(placeSessionMachine, { input }),
    debugLabel: 'usePlaceSessionMachine',
  });

  // Select the snapshot using the selector
  const snapshot = useSelector(actorRef, selectSnapshot);

  // Memoized send function
  const send = useCallback(
    (event: PlaceSessionMachineEvent) => {
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
    startedEventType: 'FLOW_SESSION_STARTED',
    endedEventType: 'FLOW_SESSION_ENDED',
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
