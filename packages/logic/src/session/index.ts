/**
 * Session
 *
 * Game session orchestration.
 */

// GameSession types (shared between implementations)
export type {
  AlgorithmId,
  FeedbackConfig,
  GameSessionDeps,
  SessionListener,
  SessionPhase,
  SessionSnapshot,
} from './game-session-types';

// XState-based GameSession (primary implementation)
export { GameSessionXState } from './game-session-xstate';

// XState machine types (for useGameSessionMachine hook)
export { gameSessionMachine, tutorialSessionMachine } from './machine';
export type {
  GameSessionInput,
  GameSessionEvent,
  GameSessionSnapshot as XStateSnapshot,
  // Tutorial Session Machine types
  TutorialSessionInput,
  TutorialSessionEvent,
  TutorialSessionContext,
  TutorialSessionStateValue,
  TutorialSessionSnapshot,
  TutorialStimulus,
  TutorialUserResponse,
} from './machine';

// Memo Session XState Machine
export { memoSessionMachine, createDefaultMemoPlugins } from './machine';
export type {
  MemoSessionInput,
  MemoSessionEvent,
  MemoSessionSnapshot,
  MemoSessionPlugins,
} from './machine';

// Flow Session XState Machine
export { placeSessionMachine, createDefaultPlacePlugins } from './machine';
export type {
  PlaceSessionInput,
  PlaceSessionMachineEvent,
  PlaceSessionMachineSnapshot,
  PlaceSessionPlugins,
  PlaceSessionMachineStateValue,
} from './machine';

// Dual Label Session XState Machine
export { dualPickSessionMachine } from './machine';
export type {
  DualPickSessionInput,
  DualPickSessionEvent,
  DualPickSessionSnapshot as DualPickMachineSnapshot,
} from './machine';

// Trace Session XState Machine (BETA)
export {
  traceSessionMachine,
  getEnabledModalities,
  isWarmupTrial,
  getExpectedPosition,
  getExpectedSound,
  getExpectedColor,
} from './machine';
export type {
  TraceSessionInput,
  TraceSessionEvent,
  TraceSessionSnapshot,
  TracePhase,
  TraceSpec,
  TraceSessionMachine,
  TraceSessionActor,
} from './machine';

// Session event utilities (shared envelope creation)
export {
  createEventEnvelope,
  emitAndPersist,
  type EventEmitterContext,
  type SessionEventEnvelope,
} from './session-event-utils';

// Decider (Phase 0: shared contract for pure session state machines)
export type {
  SessionDecider,
  SessionEventDraft,
  SessionCompletionDraft,
  DeciderTransition,
} from './decider';
export { createEnvelopeFactory } from './decider';
export type {
  EnvelopeFactoryConfig,
  EventEnvelopeFactory,
  MaterializedEvent,
} from './decider';
export { givenDecider } from './decider';
export type { DeciderTestHarness } from './decider';

// Trace Session XState Wrapper Class (BETA)
export { TraceSessionXState } from './trace-session-xstate';
export type {
  TraceSessionSnapshot as TraceWrapperSnapshot,
  TraceSessionListener as TraceWrapperListener,
  TraceSessionPhase as TraceWrapperPhase,
  TraceSessionDeps as TraceWrapperDeps,
} from './trace-session-xstate';

// Dual Time session runtime (pure state machine)
export {
  analyzeTimeSpeed,
  buildTimeSessionSummary,
  buildTimeTrialResult,
  computeTimeAccuracyScore,
  computeTimeRegularityScore,
  createInitialTimeSessionState,
  transitionTimeSessionMachine,
} from './time-session-machine';
export type {
  SliderSample,
  SlideResult,
  SpeedSegment,
  TimeTrialResult,
  TimeTrialPhase,
  TimeSessionPhase,
  TimeSessionEndReason,
  TimeSliderShape,
  TimeSliderDirection,
  TimeSessionSummary,
  TimeSessionMachineConfig,
  TimeSessionMachineState,
  TimeSessionMachineAction,
  TimeSessionEventDraft,
  TimeCompletionDraft,
  TimeSessionMachineTransition,
} from './time-session-machine';

// Corsi Block session runtime (pure state machine)
export {
  createInitialCorsiSessionState,
  transitionCorsiSessionMachine,
  generateCorsiSequence,
  buildCorsiSessionSummary,
} from './corsi-session-machine';
export type {
  CorsiDirection,
  CorsiTrialPhase,
  CorsiSessionPhase,
  CorsiEndReason,
  CorsiTrialResult,
  CorsiSessionSummary,
  CorsiSessionMachineConfig,
  CorsiSessionMachineState,
  CorsiSessionMachineAction,
  CorsiSessionEventDraft,
  CorsiCompletionDraft,
  CorsiSessionMachineTransition,
} from './corsi-session-machine';

// OSPAN session runtime (pure state machine)
export {
  createInitialOspanSessionState,
  transitionOspanSessionMachine,
  generateOspanEquation,
  generateStandardOspanSequence,
  selectOspanLetters,
  buildOspanSessionSummary,
} from './ospan-session-machine';
export type {
  OspanTrialPhase,
  OspanSessionPhase,
  OspanEndReason,
  OspanEquationResult,
  OspanSetResult,
  OspanSessionSummary,
  OspanSessionMachineConfig,
  OspanSessionMachineState,
  OspanSessionMachineAction,
  OspanSessionEventDraft,
  OspanCompletionDraft,
  OspanSessionMachineTransition,
} from './ospan-session-machine';

// Running Span session runtime (pure state machine)
export {
  createInitialRunningSpanSessionState,
  transitionRunningSpanSessionMachine,
  generateRunningSpanStream,
  buildRunningSpanSessionSummary,
} from './running-span-session-machine';
export type {
  RunningSpanTrialPhase,
  RunningSpanSessionPhase,
  RunningSpanEndReason,
  RunningSpanTrialResult,
  RunningSpanSessionSummary,
  RunningSpanSessionMachineConfig,
  RunningSpanSessionMachineState,
  RunningSpanSessionMachineAction,
  RunningSpanSessionEventDraft,
  RunningSpanCompletionDraft,
  RunningSpanSessionMachineTransition,
} from './running-span-session-machine';

// PASAT session runtime (pure state machine)
export {
  createInitialPasatSessionState,
  transitionPasatSessionMachine,
  generatePasatNumber,
  buildPasatSessionSummary,
} from './pasat-session-machine';
export type {
  PasatTrialPhase,
  PasatSessionPhase,
  PasatEndReason,
  PasatTrialResult,
  PasatSessionSummary,
  PasatSessionMachineConfig,
  PasatSessionMachineState,
  PasatSessionMachineAction,
  PasatSessionEventDraft,
  PasatCompletionDraft,
  PasatSessionMachineTransition,
} from './pasat-session-machine';

// SWM session runtime (pure state machine)
export {
  createInitialSwmSessionState,
  transitionSwmSessionMachine,
  generateSwmTokenPosition,
  buildSwmSessionSummary,
} from './swm-session-machine';
export type {
  SwmRoundPhase,
  SwmSessionPhase,
  SwmEndReason,
  SwmRoundResult,
  SwmSessionSummary,
  SwmSessionMachineConfig,
  SwmSessionMachineState,
  SwmSessionMachineAction,
  SwmSessionEventDraft,
  SwmCompletionDraft,
  SwmSessionMachineTransition,
} from './swm-session-machine';
