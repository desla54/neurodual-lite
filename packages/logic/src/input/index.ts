/**
 * Input System Exports
 *
 * Provides unified input abstraction for all game modes.
 */

// Game Intention Types
export type {
  GameIntention,
  InputMethod,
  ArithmeticInputKey,
  DragTrajectory,
  TrajectoryPoint,
  // Session control
  StartIntention,
  StopIntention,
  PauseIntention,
  ResumeIntention,
  // Tempo mode
  ClaimMatchIntention,
  ReleaseClaimIntention,
  ArithmeticInputIntention,
  // Coaching
  MisfiredInputIntention,
  DeclareEnergyIntention,
  // Place/Pick mode
  DropItemIntention,
  CancelDragIntention,
  AdvanceIntention,
  // Memo mode
  SelectValueIntention,
  ConfirmSelectionIntention,
  // Trace mode
  SwipeIntention,
  TapIntention,
  SkipIntention,
  WritingCompleteIntention,
} from './game-intention';

// Type Guards
export {
  isSessionControlIntention,
  isTempoIntention,
  isArithmeticInputIntention,
  isCoachingIntention,
  isPlaceIntention,
  isMemoIntention,
  isTraceIntention,
} from './game-intention';

// Intent Builders
export { Intents } from './game-intention';

// Intent Handler
export type { IntentHandler, IntentResult } from './intent-handler';
export { accepted, ignored, error } from './intent-handler';
