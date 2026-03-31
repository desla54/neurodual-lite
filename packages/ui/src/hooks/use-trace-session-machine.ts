/**
 * useTraceSessionMachine
 *
 * React hook for the XState-based TraceSession machine.
 *
 * Features:
 * - Creates and manages the XState machine actor
 * - Provides a snapshot for UI consumption
 * - Provides a send function to dispatch events
 * - Focus tracking (auto-pause on tab blur)
 * - Automatically cleans up on unmount
 */

import { useMemo, useCallback } from 'react';
import { useSelector } from '@xstate/react';
import { createActor, type ActorRefFrom } from 'xstate';
import {
  traceSessionMachine,
  type TraceSessionMachineInput,
  type TraceSessionMachineEvent,
  type TraceSessionMachineSnapshot,
  type TraceSessionMachinePhase,
  getEnabledModalities,
  isWarmupTrial,
  getExpectedPosition,
  getExpectedSound,
  getExpectedWritingSound,
  getExpectedColor,
  getExpectedWritingColor,
  getExpectedImage,
  getExpectedDigit,
  getExpectedEmotion,
  getExpectedWord,
  getExpectedTone,
  getExpectedSpatialDirection,
  getNBackActiveModalities,
} from '@neurodual/logic';
import {
  useActorPageCloseFinalizer,
  useActorUnmount,
  useActorVisibilityPause,
  useRestartableActor,
} from './xstate-lifecycle';

// Re-export with simpler names for external use
export type TraceSessionInput = TraceSessionMachineInput;
export type TraceSessionEvent = TraceSessionMachineEvent;
export type TraceSessionSnapshot = TraceSessionMachineSnapshot;
export type TracePhase = TraceSessionMachinePhase;

// =============================================================================
// Types
// =============================================================================

export interface UseTraceSessionMachineResult {
  /** Read-only session state */
  snapshot: TraceSessionMachineSnapshot;
  /** Dispatch an event to the machine */
  send: (event: TraceSessionMachineEvent) => void;
  /** The underlying XState actor reference */
  actorRef: ActorRefFrom<typeof traceSessionMachine>;
  /** Stop the session (convenience wrapper) */
  stop: () => void;
  /** Pause the session (convenience wrapper) */
  pause: () => void;
  /** Resume the session (convenience wrapper) */
  resume: () => void;
}

// =============================================================================
// Selector for snapshot transformation
// =============================================================================

/**
 * Transform XState machine state to TraceSessionMachineSnapshot.
 * Provides all data needed for UI rendering.
 */
function selectSnapshot(
  state: ReturnType<ActorRefFrom<typeof traceSessionMachine>['getSnapshot']>,
): TraceSessionMachineSnapshot {
  const { context, value } = state;

  // Extract phase from state value
  let phase: TraceSessionMachinePhase;
  if (typeof value === 'string') {
    // Top-level states
    if (value === 'computing') {
      phase = 'computing';
    } else {
      phase = value as TraceSessionMachinePhase;
    }
  } else if (typeof value === 'object' && 'active' in value) {
    // Nested active state
    const activeValue = value.active;
    if (typeof activeValue === 'string') {
      // Handle resume states - map to their base phase
      if (activeValue.endsWith('Resume')) {
        const basePhase = activeValue.replace('Resume', '');
        phase = basePhase as TraceSessionMachinePhase;
      } else if (activeValue === 'writingStepFeedback') {
        // Sequential per-step feedback: treated as writingFeedback for UI purposes
        phase = 'writingFeedback';
      } else {
        phase = activeValue as TraceSessionMachinePhase;
      }
    } else {
      phase = 'stimulus';
    }
  } else {
    phase = 'idle';
  }

  // Get enabled modalities from spec extensions
  const enabledModalities = getEnabledModalities(context.spec.extensions);

  // Get active modalities from current trial
  const activeModalities = context.currentTrial?.activeModalities ?? null;

  // Get last modality results if available
  const lastResponse = context.responses[context.responses.length - 1];
  const lastModalityResults = lastResponse?.modalityResults ?? null;

  return {
    phase,
    prepDelayMs: (context.spec.timing.prepDelayMs ?? 4000) as number,
    trialIndex: context.trialIndex,
    totalTrials: context.trials.length,
    stimulus: context.currentTrial,
    feedbackPosition: context.feedbackPosition,
    feedbackType: context.feedbackType,
    feedbackFromUserAction: context.feedbackFromUserAction,
    stats: context.stats,
    nLevel: context.spec.defaults.nLevel,
    rhythmMode: context.spec.extensions.rhythmMode,
    isWarmup: isWarmupTrial(context),
    expectedPosition: getExpectedPosition(context),
    expectedSound: getExpectedSound(context),
    expectedColor: getExpectedColor(context),
    expectedWritingSound: getExpectedWritingSound(context),
    expectedWritingColor: getExpectedWritingColor(context),
    expectedImage: getExpectedImage(context),
    expectedDigit: getExpectedDigit(context),
    expectedEmotion: getExpectedEmotion(context),
    expectedWord: getExpectedWord(context),
    expectedTone: getExpectedTone(context),
    expectedSpatialDirection: getExpectedSpatialDirection(context),
    nBackActiveModalities: getNBackActiveModalities(context),
    isPaused: phase === 'paused',
    // Keep overlay visible during writingFeedback as well.
    isWriting: phase === 'writing' || phase === 'writingFeedback',
    writingResult: context.writingResult,
    isArithmetic: phase === 'arithmetic',
    arithmeticProblem: context.arithmeticProblem,
    arithmeticResult: context.arithmeticResult,
    summary: context.summary,
    dynamicRules: context.spec.extensions.dynamicRules,
    activeModalities,
    enabledModalities,
    lastModalityResults,
    ruleVisible: context.ruleVisible,
    stimulusVisible: context.stimulusVisible,
    isSequentialTrace:
      Boolean(context.spec.extensions.sequentialTrace) && !context.plugins.rhythm.isTimed(),
    sequentialStepIndex: context.sequentialStepIndex,
    sequentialStepCount: context.spec.defaults.nLevel,
    sequentialStepResults: context.sequentialStepResults,
    writingStepIndex: context.writingStepIndex,
  };
}

function equalModalityLists(
  a: readonly TraceSessionMachineSnapshot['enabledModalities'][number][] | null,
  b: readonly TraceSessionMachineSnapshot['enabledModalities'][number][] | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function areTraceSnapshotsEqual(
  a: TraceSessionMachineSnapshot,
  b: TraceSessionMachineSnapshot,
): boolean {
  return (
    a.phase === b.phase &&
    a.trialIndex === b.trialIndex &&
    a.totalTrials === b.totalTrials &&
    a.stimulus === b.stimulus &&
    a.feedbackPosition === b.feedbackPosition &&
    a.feedbackType === b.feedbackType &&
    a.feedbackFromUserAction === b.feedbackFromUserAction &&
    a.stats === b.stats &&
    a.nLevel === b.nLevel &&
    a.rhythmMode === b.rhythmMode &&
    a.isWarmup === b.isWarmup &&
    a.expectedPosition === b.expectedPosition &&
    a.expectedSound === b.expectedSound &&
    a.expectedColor === b.expectedColor &&
    a.expectedWritingSound === b.expectedWritingSound &&
    a.expectedWritingColor === b.expectedWritingColor &&
    a.isPaused === b.isPaused &&
    a.isWriting === b.isWriting &&
    a.writingResult === b.writingResult &&
    a.isArithmetic === b.isArithmetic &&
    a.arithmeticProblem === b.arithmeticProblem &&
    a.arithmeticResult === b.arithmeticResult &&
    a.summary === b.summary &&
    a.dynamicRules === b.dynamicRules &&
    a.lastModalityResults === b.lastModalityResults &&
    a.ruleVisible === b.ruleVisible &&
    a.stimulusVisible === b.stimulusVisible &&
    equalModalityLists(a.activeModalities, b.activeModalities) &&
    equalModalityLists(a.enabledModalities, b.enabledModalities) &&
    // Sequential trace: must compare by reference (new array on each step)
    a.sequentialStepResults === b.sequentialStepResults &&
    a.sequentialStepIndex === b.sequentialStepIndex &&
    a.writingStepIndex === b.writingStepIndex
  );
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Hook for managing a TraceSession using XState.
 *
 * @param input - Configuration for the trace session machine
 * @returns Object with snapshot, send, actorRef, stop, pause, resume
 *
 * @example
 * ```tsx
 * const { snapshot, send, stop, pause, resume } = useTraceSessionMachine({
 *   sessionId,
 *   userId,
 *   config,
 *   audio: audioAdapter,
 *   clock: clockAdapter,
 *   random: randomAdapter,
 *   timer: timerAdapter,
 *   spec: DualTraceSpec,
 *   trials,
 * });
 *
 * // Start the session
 * send({ type: 'START' });
 *
 * // User swipe response
 * send({ type: 'SWIPE', fromPosition: 4, toPosition: 2 });
 *
 * // User double-tap (match)
 * send({ type: 'DOUBLE_TAP', position: 4 });
 *
 * // User reject (center tap)
 * send({ type: 'CENTER_TAP' });
 *
 * // Writing complete
 * send({ type: 'WRITING_COMPLETE', result: writingResult });
 *
 * // Pause/Resume
 * pause();
 * resume();
 * ```
 */
export function useTraceSessionMachine(
  input: TraceSessionMachineInput,
): UseTraceSessionMachineResult {
  const actorRef = useRestartableActor({
    actorKey: { sessionId: input.sessionId, commandBus: input.commandBus },
    createActor: () => createActor(traceSessionMachine, { input }),
    debugLabel: 'useTraceSessionMachine',
  });

  // Select the snapshot using the selector
  const snapshot = useSelector(actorRef, selectSnapshot, areTraceSnapshotsEqual);

  // Memoized send function
  const send = useCallback(
    (event: TraceSessionMachineEvent) => {
      actorRef.send(event);
    },
    [actorRef],
  );

  const finalizeActor = useCallback((actor: typeof actorRef) => {
    const snapshot = actor.getSnapshot();
    if (snapshot.status !== 'active') {
      return;
    }
    actor.send({ type: 'STOP' });
    if (typeof queueMicrotask === 'function') {
      queueMicrotask(() => actor.stop());
    } else {
      setTimeout(() => actor.stop(), 0);
    }
  }, []);

  // Convenience stop function
  const stop = useCallback(() => {
    finalizeActor(actorRef);
  }, [actorRef, finalizeActor]);

  // Convenience pause function
  const pause = useCallback(() => {
    actorRef.send({ type: 'PAUSE' });
  }, [actorRef]);

  // Convenience resume function
  const resume = useCallback(() => {
    actorRef.send({ type: 'RESUME' });
  }, [actorRef]);

  useActorUnmount({
    actorRef,
    finalizeActor,
  });

  useActorPageCloseFinalizer({
    actorRef,
    startedEventType: 'TRACE_SESSION_STARTED',
    endedEventType: 'TRACE_SESSION_ENDED',
    finalizeActor,
  });

  useActorVisibilityPause(actorRef);

  return useMemo(
    () => ({
      snapshot,
      send,
      actorRef,
      stop,
      pause,
      resume,
    }),
    [snapshot, send, actorRef, stop, pause, resume],
  );
}
