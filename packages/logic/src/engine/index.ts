/**
 * Engine (domain)
 *
 * Domain events + pure projectors for NeuroDual sessions.
 *
 * Persistence is handled outside of this module (in `@neurodual/infra` via Emmett +
 * PowerSync). This module should stay IO-free and deterministic.
 *
 * @example
 * ```ts
 * import { projectSessionReportFromEvents } from '@neurodual/logic';
 *
 * const report = projectSessionReportFromEvents({ sessionId, events });
 * ```
 */

// Cognitive Profiler (ML-ready features) - OOP class
export { CognitiveProfiler } from './cognitive-profiler';
export type {
  CognitiveModalityInsights,
  CognitiveModalityProfile,
  CognitiveProfile,
  FatigueMetrics,
  FlowMetrics,
  ResilienceMetrics,
  RhythmMetrics,
} from './cognitive-profiler';
// Events (minimal set)
export type {
  BaseEvent,
  // Supporting types
  DeviceInfo,
  FocusLostEvent,
  FocusRegainedEvent,
  GameEvent,
  GameEventType,
  InputMisfiredEvent,
  ModalityRunningStats,
  ModalityTrialOutcome,
  // Memo events
  MemoSessionStartedEvent,
  MemoSessionEndedEvent,
  MemoStimulusShownEvent,
  MemoEvent,
  // Place events
  PlaceSessionStartedEvent,
  PlaceSessionEndedEvent,
  PlaceStimulusShownEvent,
  PlacePlacementStartedEvent,
  PlaceDropAttemptedEvent,
  PlaceTurnCompletedEvent,
  PlaceDragCancelledEvent,
  PlaceSlotEnter,
  PlaceEvent,
  DualPickEvent,
  DualPickSessionStartedEvent,
  DualPickSessionEndedEvent,
  TraceEvent,
  TraceSessionStartedEvent,
  TraceSessionEndedEvent,
  TraceResponseEvent,
  MotEvent,
  MotSessionStartedEvent,
  MotTrialCompletedEvent,
  MotSessionEndedEvent,
  CorsiEvent,
  CorsiSessionStartedEvent,
  CorsiTrialCompletedEvent,
  CorsiSessionEndedEvent,
  OspanEvent,
  OspanSessionStartedEvent,
  OspanSetCompletedEvent,
  OspanSessionEndedEvent,
  RunningSpanEvent,
  RunningSpanSessionStartedEvent,
  RunningSpanTrialCompletedEvent,
  RunningSpanSessionEndedEvent,
  PasatEvent,
  PasatSessionStartedEvent,
  PasatTrialCompletedEvent,
  PasatSessionEndedEvent,
  SwmEvent,
  SwmSessionStartedEvent,
  SwmRoundCompletedEvent,
  SwmSessionEndedEvent,
  RunningStats,
  TemporalContext,
  SessionPlayContext,
  SessionEndedEvent,
  SessionImportedEvent,
  SessionPausedEvent,
  SessionResumedEvent,
  SessionStartedEvent,
  SessionSummary,
  TimingStats,
  TrialOutcome,
  TrialPresentedEvent,
  // Projection types (computed, not stored)
  TrialResult,
  UserResponseEvent,
  UserStateDeclaredEvent,
} from './events';
// Helper functions for modality stats access
export {
  getAllReactionTimes,
  getModalityStats,
  getTotalStats,
  getTrialModalityOutcome,
  // Zod schema for cloud event validation
  GameEventSchema,
} from './events';
export type { ValidatedGameEvent } from './events';
export {
  SESSION_END_EVENT_TYPES,
  SESSION_END_EVENT_TYPES_ARRAY,
  isSessionEndEventType,
  type SessionEndEventType,
} from './session-end-event-types';
export {
  SESSION_START_EVENT_TYPES,
  SESSION_START_EVENT_TYPES_ARRAY,
  isSessionStartEventType,
  type SessionStartEventType,
} from './session-start-event-types';
export type {
  ModalityProfile,
  PlayerProfile,
  ProgressionPoint,
} from './profile-projector';
// Profile Projector (user profile from history)
export {
  computeProfileFromEvents,
  createEmptyProfile,
  rebuildProfile,
  projectProfileFromSessions,
} from './profile-projector';
// Profile from SQL rows (reactive read model)
export { projectPlayerProfileFromRows } from './profile-from-rows';
// Session Projector (computes derived data from events) - OOP class
export { SessionProjector } from './session-projector';
// Memo Session Projector
export { MemoSessionProjector } from './memo-projector';
export type {
  PreparationStrategy,
  MemoWindowConfidenceMetrics,
  MemoExtendedSummary,
} from './memo-projector';
// Place Session Projector
export { PlaceSessionProjector } from './place-projector';
export type {
  PlaceDropConfidenceMetrics,
  PlaceModalityStats,
  PlaceTurnResult,
  PlaceTrend,
  PlaceExtendedStats,
  PlaceExtendedSummary,
} from './place-projector';
// Dual Label Session Projector
export { DualPickSessionProjector } from './dual-pick-projector';
export type {
  DualPickDropConfidenceMetrics,
  DualPickModalityStats,
  DualPickTurnResult,
  DualPickTrend,
  DualPickExtendedStats,
  DualPickExtendedSummary,
} from '../types/dual-pick';

// UPS Projector (Unified Performance Score)
export { UPSProjector } from './ups-projector';
export type { UPSProjectionResult } from './ups-projector';

// Replay Projector (for session replay)
export {
  parseTempoEvents,
  projectTempoSnapshot,
  getActiveResponsesAtTime,
  parsePlaceEvents,
  projectPlaceSnapshot,
  getPlaceDropsAtTime,
  getPlaceInFlightDragsAtTime,
  parseMemoEvents,
  projectMemoSnapshot,
  getMemoPicksAtTime,
  // DualPick replay
  parseDualPickEvents,
  projectDualPickSnapshot,
  getDualPickInFlightDragsAtTime,
  getDualPickDropsAtTime,
  parseTrackEvents,
  projectTrackSnapshot,
  // Interactive replay
  identifySkippableEvents,
} from './replay-projector';
export type {
  TempoReplayData,
  PlaceReplayData,
  PlaceDropData,
  InFlightDrag,
  MemoReplayData,
  MemoPickData,
  // DualPick replay types
  DualPickReplayData,
  DualPickDropData,
  TrackReplayData,
  TrackReplayTrialData,
  TrackReplayPlaybackSnapshot,
} from './replay-projector';
export { mapReplayEventsToGameEvents } from './replay-event-mapper';
// Interactive Replay Engine
export { InteractiveReplayEngine } from './interactive-replay-engine';
export type {
  InteractiveReplayEvent,
  RunScoreDelta,
} from './interactive-replay-engine';
// Journey Projector removed (deleted with journey system)
// Challenge projector (statistical daily challenge - local time)
export {
  createDefaultChallenge20Config,
  formatLocalDayKey,
  projectChallenge20FromDailyTotals,
} from './challenge-projector';
// Progression Projector (XP, sessions count from history)
export {
  createEmptyProgression,
  projectProgressionFromSessions,
} from './progression-projector';
// Session Completion Projector (Single Source of Truth for session completion)
export { SessionCompletionProjector } from './session-completion-projector';
export type {
  SessionCompletionInput,
  TempoCompletionInput,
  PlaceCompletionInput,
  MemoCompletionInput,
  DualPickCompletionInput,
  TraceCompletionInput,
  TimeCompletionInput,
  TrackCompletionInput,
  CorsiCompletionInput,
  OspanCompletionInput,
  RunningSpanCompletionInput,
  PasatCompletionInput,
  SwmCompletionInput,
  SessionCompletionResult,
  SessionCompletionWithXPResult,
  XPContextInput,
} from './session-completion-projector';
// Tempo entrypoint (shared stream selection)
export {
  projectTempoSessionEntrypoint,
  type TempoProjectionEntrypointResult,
} from './tempo-projection-entrypoint';
export {
  projectDualPickSessionToSummaryInput,
  projectFlowSessionToSummaryInput,
  projectImportedSessionToSummaryInput,
  projectRecallSessionToSummaryInput,
  projectTempoSessionToSummaryInput,
  projectTraceSessionToSummaryInput,
  projectOspanSessionToSummaryInput,
} from './session-summary-input-projectors';
export {
  projectSessionReportFromEvents,
  SESSION_REPORT_PROJECTION_VERSION,
} from './report-projection';
export type { ProjectSessionReportFromEventsInput } from './report-projection';
// Dual N-Back Classic ES model (commands/decider/evolve)
export {
  projectDualnbackClassicTempoWithHomeEs,
  type DualnbackClassicHomeEsProjection,
} from './dualnback-classic-home-es';
// Statistical Calculator - OOP class
export { StatisticalCalculator } from './statistical-calculator';
// NOTE: SnapshotStore supprime - SQLite est l'unique source de verite
export type { EventQuery } from './event-query';

// Turn Projectors (lazy-loaded turn-by-turn detail for reports)
export {
  projectTempoTurns,
  projectMemoTurns,
  projectPlaceTurns,
  projectTraceTurns,
  projectTrackTurns,
  projectCognitiveTaskTurns,
} from './turn-projectors';

// Recovery Projector (extract recoverable state from interrupted sessions)
export { RecoveryProjector } from './recovery-projector';
export type { RecoverableState } from './recovery-projector';

// Replay Recovery Projector (extract recoverable state from interrupted replays)
export { ReplayRecoveryProjector } from './replay-recovery-projector';

// Removed: PASAT, Track, SWM session projections (deleted game modes)
