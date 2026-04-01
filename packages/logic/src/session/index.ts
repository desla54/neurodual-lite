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
