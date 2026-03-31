/**
 * GameSession XState Machine Types
 *
 * Type definitions for the XState-based game session machine.
 * Replaces the manual State Pattern implementation.
 */
import type { ModalityId, Trial, GameConfig, ResponseRecord, PendingKeyRecord } from '../../domain';
import type { SessionSummary, GameEvent } from '../../engine';
import type {
  AudioPort,
  AlgorithmStatePort,
  CursorPositionPort,
  PlatformInfoPort,
  XPContextPort,
} from '../../ports';
import type { TrialGenerator } from '../../coach/trial-generator';
import type { RunningStatsCalculator } from '../../coach/running-stats';
import type { TrialJudge } from '../../judge';
import type { ModeSpec } from '../../specs/types';
import type { JourneyStrategyConfig } from '../../types/journey';
import type { TimerPort } from '../../timing';
import type {
  SessionHealthMetrics,
  SessionPlayContext,
  UserResponseEvent,
} from '../../engine/events';
import type { XPBreakdown } from '../../types';
import type { GameSessionPlugins } from './game-session-plugins';

// =============================================================================
// Recovery State (for resuming interrupted sessions)
// =============================================================================

export interface RecoveryState {
  /** Last trial index that was presented */
  readonly lastTrialIndex: number;
  /** Trials that were already presented */
  readonly trialHistory: readonly Trial[];
  /** Responses that were already recorded */
  readonly responses: readonly UserResponseEvent[];
  /** Original session start timestamp */
  readonly startTimestamp: number;
  /**
   * All events from the original session (loaded from SQLite).
   * Required for accurate session report at the end.
   * Without this, only post-recovery events would be counted.
   */
  readonly existingEvents?: readonly GameEvent[];
  /**
   * Original trials seed from SESSION_STARTED.
   * CRITICAL: Must be preserved to regenerate the same sequence.
   * Without this, the generator produces different trials after recovery.
   */
  readonly trialsSeed?: string;
  /**
   * Current stream version from emt_streams table.
   * This is the authoritative source of truth for the stream version.
   * If not provided, falls back to existingEvents.length (may be inaccurate).
   */
  readonly streamVersion?: number;
}

// =============================================================================
// Input (for machine creation)
// =============================================================================

export interface GameSessionInput {
  // Identity
  readonly sessionId: string;
  readonly userId: string;
  readonly config: GameConfig;

  // Services (injected)
  readonly audio: AudioPort;
  readonly timer: TimerPort;
  readonly generator: TrialGenerator;
  readonly statsCalculator: RunningStatsCalculator;
  readonly judge: TrialJudge | null;

  /**
   * Mode specification - REQUIRED.
   * The spec is the Single Source of Truth for timing, scoring, and generation.
   * All game modes MUST provide a spec.
   */
  readonly spec: ModeSpec;

  // Session metadata (gameMode comes from spec.metadata.id - SSOT)
  readonly playMode?: SessionPlayContext;
  /**
   * Brain Workshop only: strikes already accumulated at this N-level when the session starts.
   * Stored in SESSION_STARTED so history projections can reproduce strike-driven progression.
   */
  readonly initialStrikes?: number;
  readonly journeyStageId?: number;
  readonly journeyId?: string;
  /** Journey configuration snapshot (required for journey sessions) */
  readonly journeyStartLevel?: number;
  readonly journeyTargetLevel?: number;
  readonly journeyGameMode?: string;
  readonly journeyName?: string;
  readonly journeyStrategyConfig?: JourneyStrategyConfig;
  readonly trialsSeed: string;

  // Optional
  readonly algorithmStatePort?: AlgorithmStatePort;
  readonly feedbackConfig?: { visualFeedback: boolean; audioFeedback: boolean };

  // XP calculation (injected for end-of-session XP computation)
  readonly xpContextPort?: XPContextPort;

  /**
   * Cursor position port for reading cursor position at stimulus time.
   * Used to capture cursor position for accurate RT analysis (mouse input only).
   */
  readonly cursorPositionPort?: CursorPositionPort;

  /**
   * Platform info port (device + display).
   * Used for SESSION_STARTED device context without accessing browser APIs in logic.
   */
  readonly platformInfoPort?: PlatformInfoPort;

  // Recovery mode
  /** If provided, session will resume from this recovered state */
  readonly recoveryState?: RecoveryState;

  /**
   * Plugin container - REQUIRED.
   * Created once via createDefaultPlugins(), readonly during session.
   * Contains all business logic plugins (response, trialEnd, audio, rhythm, etc.)
   */
  readonly plugins: GameSessionPlugins;

  /**
   * Callback to trigger visual display from audio callback.
   * Set by GameSessionXState to send VISUAL_TRIGGER event to the actor.
   * This bridges the gap between AudioService callbacks and XState events.
   */
  readonly onVisualTrigger?: () => void;

  /**
   * Callback to trigger visual HIDE from the audio clock.
   * Set by GameSessionXState to send VISUAL_HIDE_TRIGGER event to the actor.
   * Used to pre-hide the stimulus (hideOffset) to compensate render latency.
   */
  readonly onVisualHideTrigger?: () => void;

  /**
   * Callback fired at the audio sync time (audio starts).
   * Set by GameSessionXState to send AUDIO_SYNC event to the actor.
   * Useful for in-game A/V sync diagnostics (start alignment).
   */
  readonly onAudioSync?: () => void;

  /**
   * Callback when audio playback ends.
   * Set by GameSessionXState to send AUDIO_ENDED event to the actor.
   * Enables perfect audio-visual sync: visual hides when sound actually ends.
   */
  readonly onAudioEnded?: () => void;

  /**
   * BETA: Enable audio-driven visual sync.
   * When true, scheduleAudioVisualSync uses onEnded callback to hide visual.
   * When false (default), visual hides based on timer.
   */
  readonly useAudioDrivenVisualSync?: boolean;
}

// =============================================================================
// Context (Extended State)
// =============================================================================

export interface GameSessionContext extends GameSessionInput {
  // Trial state
  currentTrial: Trial | null;
  trialIndex: number;
  trialHistory: Trial[];

  // Timing
  isi: number;
  stimulusDuration: number;
  stimulusStartTime: number;
  sessionStartTime: number;
  nextTrialTargetTime: number;
  currentPhase: 'stimulus' | 'waiting' | null;

  // Responses
  responses: Map<ModalityId, ResponseRecord>;
  pendingKeys: Map<ModalityId, PendingKeyRecord>;

  // Brain Workshop arithmetic (typed-answer buffer)
  arithmeticInput: {
    chars: string[];
    negative: boolean;
    decimal: boolean;
    lastInputMethod: 'keyboard' | 'mouse' | 'touch' | 'gamepad' | 'bot' | null;
  };

  // Pause state
  pauseElapsedTime: number;
  pauseStartedAtAudioTime: number | null;
  pausedInState: 'stimulus' | 'waiting' | null;

  // Focus tracking
  focusLostTime: number | null;

  // Results
  finalSummary: SessionSummary | null;
  sessionEvents: GameEvent[];
  lastTrialPresentedIndex: number | null;
  currentTrialResponseCount: number;
  xpBreakdown: XPBreakdown | null;

  // Energy level (declared at start)
  declaredEnergyLevel: 1 | 2 | 3 | null;

  // Session health tracking (for psychometric data quality)
  freezeCount: number;
  longTaskCount: number;
  healthMetrics: SessionHealthMetrics | null;

  // Audio-visual sync: true when audio callback triggers visual display
  stimulusVisible: boolean;

  // Audio/visual callback timestamps (performance.now, ms) for diagnostics
  visualTriggerCallbackAtMs: number | null;
  visualHideCallbackAtMs: number | null;
  audioSyncCallbackAtMs: number | null;
  audioEndedCallbackAtMs: number | null;
}

// =============================================================================
// Events
// =============================================================================

export type GameSessionEvent =
  | { type: 'START' }
  | { type: 'RECOVER' }
  | { type: 'STOP' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | {
      type: 'RESPOND';
      modalityId: ModalityId;
      inputMethod?: 'keyboard' | 'mouse' | 'touch' | 'gamepad' | 'bot';
      /** performance.now() captured at keydown/touchstart for lag measurement */
      capturedAtMs?: number;
      /** Correlation ID for UI pipeline telemetry */
      telemetryId?: string;
      /** performance.now() captured just after dispatch() returns (UI-level) */
      dispatchCompletedAtMs?: number;
      /** Button position when clicked (mouse input only) */
      buttonPosition?: { x: number; y: number };
    }
  | { type: 'RELEASE'; modalityId: ModalityId; pressDurationMs: number }
  | {
      type: 'ARITHMETIC_INPUT';
      key: 'digit' | 'minus' | 'decimal' | 'reset';
      digit?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
      inputMethod?: 'keyboard' | 'mouse' | 'touch' | 'gamepad' | 'bot';
    }
  | { type: 'FOCUS_LOST' }
  | { type: 'FOCUS_REGAINED'; lostDurationMs: number }
  | { type: 'ADVANCE' } // Self-paced mode: user advances to next trial
  | {
      type: 'HEALTH_EVENT';
      eventKind: 'freeze' | 'longTask';
    } // Session health: freeze or long task detected
  | {
      type: 'VISUAL_TRIGGER';
      /** performance.now() when audio callback fired (for drift measurement) */
      firedAtMs?: number;
    } // Audio callback triggers visual display
  | {
      type: 'VISUAL_HIDE_TRIGGER';
      /** performance.now() when audio callback fired (for drift measurement) */
      firedAtMs?: number;
    } // Audio callback triggers visual hide
  | {
      type: 'AUDIO_SYNC';
      /** performance.now() when audio sync callback fired */
      firedAtMs?: number;
    }
  | {
      type: 'AUDIO_ENDED';
      /** performance.now() when audio ended callback fired */
      firedAtMs?: number;
    } // BETA: Audio playback ended (for audio-driven visual sync)
  | {
      /**
       * Telemetry event emitted by the UI to measure input→dispatch→paint latency.
       * Persisted as INPUT_PIPELINE_LATENCY in the session event stream.
       */
      type: 'REPORT_INPUT_PIPELINE_LATENCY';
      telemetryId: string;
      trialIndex: number;
      modalityId: ModalityId;
      inputMethod: 'keyboard' | 'mouse' | 'touch' | 'gamepad';
      phase: 'stimulus' | 'waiting';
      capturedAtMs: number;
      dispatchCompletedAtMs?: number;
      commitAtMs: number;
      paintAtMs: number;
    };

// =============================================================================
// State Value Types
// =============================================================================

export type GameSessionStateValue =
  | 'idle'
  | 'starting'
  | 'countdown'
  | { active: 'stimulus' | 'waiting' }
  | 'paused'
  | 'finished';

// =============================================================================
// Snapshot Type (for UI subscription)
// =============================================================================

export interface GameSessionSnapshot {
  readonly phase:
    | 'idle'
    | 'starting'
    | 'countdown'
    | 'stimulus'
    | 'waiting'
    | 'paused'
    | 'finished';
  readonly trial: Trial | null;
  readonly trialIndex: number;
  readonly totalTrials: number;
  readonly isi: number;
  /** Preparation delay before first trial in ms (for countdown UI) */
  readonly prepDelayMs: number;
  readonly message: string | null;
  readonly dPrime: number;
  readonly summary: SessionSummary | null;
  readonly trialHistory: Trial[];
  readonly nLevel: number;
  readonly adaptiveZone: number | null;
  /** XP breakdown computed at session end (available in 'finished' phase) */
  readonly xpBreakdown: XPBreakdown | null;
}
