import { useCallback, useMemo } from 'react';
import { useActorRef, useSelector } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
import {
  tutorialSessionMachine,
  type TutorialSessionInput,
  type TutorialSessionEvent,
} from '@neurodual/logic';

export interface UseTutorialSessionReturn {
  readonly state: string;
  readonly context: ReturnType<typeof tutorialSessionMachine.getInitialSnapshot>['context'];
  readonly send: (event: TutorialSessionEvent) => void;

  readonly isWelcome: boolean;
  readonly isWaiting: boolean;
  readonly isStarting: boolean;
  readonly isIdle: boolean;
  readonly isStimulus: boolean;
  readonly isTraveling: boolean;
  readonly isComparing: boolean;
  readonly isResponse: boolean;
  readonly isFeedbackDelay: boolean;
  readonly isReorganizing: boolean;
  readonly isPaused: boolean;
  readonly isFinished: boolean;

  readonly stepIndex: number;
  readonly totalSteps: number;
  readonly nLevel: number;
  readonly isDualPick: boolean;
  readonly isTrace: boolean;
  readonly isPlace: boolean;
  readonly isMemo: boolean;
  readonly awaitingResponse: boolean;
  readonly feedbackActive: boolean;
}

interface TutorialSnapshot {
  state: string;
  context: ReturnType<typeof tutorialSessionMachine.getInitialSnapshot>['context'];
  isWaiting: boolean;
  isStarting: boolean;
  isIdle: boolean;
  isStimulus: boolean;
  isTraveling: boolean;
  isComparing: boolean;
  isResponse: boolean;
  isFeedbackDelay: boolean;
  isReorganizing: boolean;
  isPaused: boolean;
  isFinished: boolean;
  stepIndex: number;
  awaitingResponse: boolean;
  feedbackActive: boolean;
}

// =============================================================================
// PERFORMANCE: Comparateur custom pour éviter les re-renders inutiles
// @see https://stately.ai/docs/xstate-react (useSelector avec compare function)
// =============================================================================

function snapshotEqual(a: TutorialSnapshot, b: TutorialSnapshot): boolean {
  // Comparaison des primitives uniquement - rapide et évite les re-renders
  // quand seule la référence de context change mais pas les valeurs utiles
  return (
    a.state === b.state &&
    a.stepIndex === b.stepIndex &&
    a.awaitingResponse === b.awaitingResponse &&
    a.feedbackActive === b.feedbackActive &&
    a.isWaiting === b.isWaiting &&
    a.isStarting === b.isStarting &&
    a.isIdle === b.isIdle &&
    a.isStimulus === b.isStimulus &&
    a.isTraveling === b.isTraveling &&
    a.isComparing === b.isComparing &&
    a.isResponse === b.isResponse &&
    a.isFeedbackDelay === b.isFeedbackDelay &&
    a.isReorganizing === b.isReorganizing &&
    a.isPaused === b.isPaused &&
    a.isFinished === b.isFinished &&
    // Comparer les champs context utilisés par l'UI
    a.context.currentStimulus?.id === b.context.currentStimulus?.id &&
    a.context.userResponse?.match?.position === b.context.userResponse?.match?.position &&
    a.context.userResponse?.match?.audio === b.context.userResponse?.match?.audio
  );
}

function selectSnapshot(
  machineState: ReturnType<ActorRefFrom<typeof tutorialSessionMachine>['getSnapshot']>,
): TutorialSnapshot {
  return {
    state: machineState.value as string,
    context: machineState.context,
    isWaiting: machineState.matches('waiting'),
    isStarting: machineState.matches('starting'),
    isIdle: machineState.matches('idle'),
    isStimulus: machineState.matches('stimulus'),
    isTraveling: machineState.matches('traveling'),
    isComparing: machineState.matches('comparing'),
    isResponse: machineState.matches('response'),
    isFeedbackDelay: machineState.matches('feedbackDelay'),
    isReorganizing: machineState.matches('reorganizing'),
    isPaused: machineState.matches('paused'),
    isFinished: machineState.matches('finished'),
    stepIndex: machineState.context.stepIndex,
    awaitingResponse: machineState.context.awaitingResponse,
    feedbackActive: machineState.context.feedbackActive,
  };
}

export function useTutorialSession(input: TutorialSessionInput): UseTutorialSessionReturn {
  const actorRef = useActorRef(tutorialSessionMachine, { input });

  // PERFORMANCE: Utilise snapshotEqual pour éviter les re-renders inutiles
  const snapshot = useSelector(actorRef, selectSnapshot, snapshotEqual);

  const send = useCallback(
    (event: TutorialSessionEvent) => {
      actorRef.send(event);
    },
    [actorRef],
  );

  const totalSteps = input.spec.steps.length;
  const nLevel = input.spec.nLevel;
  const isDualPick = input.spec.controlLayout === 'dual-pick';
  const isTrace = input.spec.controlLayout === 'trace';
  const isPlace = input.spec.controlLayout === 'place';
  const isMemo = input.spec.controlLayout === 'memo';

  return useMemo(
    () => ({
      state: snapshot.state,
      context: snapshot.context,
      send,

      isWelcome: false,
      isWaiting: snapshot.isWaiting,
      isStarting: snapshot.isStarting,
      isIdle: snapshot.isIdle,
      isStimulus: snapshot.isStimulus,
      isTraveling: snapshot.isTraveling,
      isComparing: snapshot.isComparing,
      isResponse: snapshot.isResponse,
      isFeedbackDelay: snapshot.isFeedbackDelay,
      isReorganizing: snapshot.isReorganizing,
      isPaused: snapshot.isPaused,
      isFinished: snapshot.isFinished,

      stepIndex: snapshot.stepIndex,
      totalSteps,
      nLevel,
      isDualPick,
      isTrace,
      isPlace,
      isMemo,
      awaitingResponse: snapshot.awaitingResponse,
      feedbackActive: snapshot.feedbackActive,
    }),
    [snapshot, send, totalSteps, nLevel, isDualPick, isTrace, isPlace, isMemo],
  );
}
