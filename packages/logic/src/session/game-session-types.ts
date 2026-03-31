/**
 * GameSession Types
 *
 * Types shared between GameSession implementations.
 * The legacy GameSession (State Pattern) has been replaced by GameSessionXState (XState).
 */

import type { Trial, XPBreakdown } from '../domain';
import type { ModeSpec } from '../specs/types';
import type { JourneyStrategyConfig } from '../types/journey';
import type {
  SessionSummary,
  GameEvent,
  FeedbackConfig,
  SessionPlayContext,
  UserResponseEvent,
} from '../engine/events';
import type { AlgorithmStatePort } from '../ports/algorithm-state-port';
import type { AudioPort } from '../ports/audio-port';
import type { CursorPositionPort } from '../ports/cursor-position-port';
import type { DevLoggerPort } from '../ports/dev-logger-port';
import type { XPContextPort } from '../ports/xp-context-port';
import type { PlatformLifecycleSource } from '../ports/platform-lifecycle-port';
import type { PlatformInfoPort } from '../ports/platform-info-port';
import type { CommandBusPort } from '../ports/command-bus-port';

// Re-export FeedbackConfig for consumers importing from this file
export type { FeedbackConfig };

// =============================================================================
// Session Phase
// =============================================================================

/**
 * Session phases for GameSession.
 * Used by both legacy and XState implementations for API compatibility.
 */
export type SessionPhase =
  | 'idle'
  | 'starting'
  | 'countdown'
  | 'stimulus'
  | 'waiting'
  | 'paused'
  | 'finished';

// =============================================================================
// Session Snapshot
// =============================================================================

export interface SessionSnapshot {
  readonly phase: SessionPhase;
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
  /** Zone adaptative actuelle (1-20), null si non adaptatif */
  readonly adaptiveZone: number | null;
  /** XP breakdown computed at session end (null until finished) */
  readonly xpBreakdown: XPBreakdown | null;
  /**
   * Brain Workshop arithmetic typed-answer buffer (display-friendly).
   * Present when arithmetic is enabled; null otherwise.
   */
  readonly arithmeticInput: {
    readonly raw: string;
    readonly display: string;
    readonly negative: boolean;
    readonly decimal: boolean;
  } | null;
  /**
   * Audio-visual sync: true when audio callback has triggered visual display.
   * Use this instead of phase === 'stimulus' for precise audio-visual synchronization.
   */
  readonly stimulusVisible: boolean;

  /**
   * Optional timing diagnostics (performance.now, ms).
   * Present when the XState session machine is used.
   */
  readonly stimulusDurationMs?: number;
  readonly audioSyncCallbackAtMs?: number | null;
  readonly audioEndedCallbackAtMs?: number | null;
  readonly visualTriggerCallbackAtMs?: number | null;
  readonly visualHideCallbackAtMs?: number | null;
}

export type SessionListener = (snapshot: SessionSnapshot) => void;

// =============================================================================
// Algorithm Configuration
// =============================================================================

/** Type d'algorithme adaptatif */
export type AlgorithmId = 'adaptive' | 'meta-learning' | 'jitter-adaptive';

// FeedbackConfig is now imported and re-exported from '../types/events' (SSOT)

// =============================================================================
// GameSession Dependencies
// =============================================================================

export interface GameSessionDeps {
  audio: AudioPort;
  devLogger?: DevLoggerPort;
  /** Platform lifecycle source (background/foreground), used for focus tracking metrics */
  platformLifecycleSource?: PlatformLifecycleSource;
  /** Platform info port (device + display), used for SESSION_STARTED device context */
  platformInfoPort?: PlatformInfoPort;

  // ===========================================================================
  // Spec-based configuration (Single Source of Truth)
  // ===========================================================================

  /**
   * Mode specification - REQUIRED (Single Source of Truth).
   * Contains scoring thresholds, timing, generation, adaptivity config.
   * All game modes MUST provide a spec.
   */
  spec: ModeSpec;

  // ===========================================================================
  // Session context (not part of spec)
  // gameMode comes from spec.metadata.id - SSOT
  // ===========================================================================

  /** Explicit play context for deterministic reports/history */
  playMode?: SessionPlayContext;
  /** Journey stage ID si session du parcours (1-20) */
  journeyStageId?: number;
  /** Journey ID pour multi-parcours */
  journeyId?: string;
  /** Journey configuration snapshot (required for journey sessions) */
  journeyStartLevel?: number;
  journeyTargetLevel?: number;
  journeyGameMode?: string;
  journeyName?: string;
  journeyStrategyConfig?: JourneyStrategyConfig;
  /**
   * Initial strikes for Brain Workshop progression.
   * Calculate from session history using calculateBrainWorkshopStrikes().
   */
  initialStrikes?: number;
  /** d' initial pour le mode adaptatif (depuis la dernière session) */
  initialDPrime?: number;
  /** Algorithme adaptatif choisi par l'utilisateur */
  algorithmId?: AlgorithmId;
  /** Port for persisting algorithm state (meta-learning) */
  algorithmStatePort?: AlgorithmStatePort;
  /** Command bus for persisting events via Commands (strict ES mode). */
  commandBus?: CommandBusPort;
  /** Feedback configuration at session start (visual/audio feedback enabled) */
  feedbackConfig?: FeedbackConfig;
  /** XP context port for external XP calculation context (streak, daily count, badges) */
  xpContextPort?: XPContextPort;
  /**
   * Cursor position port for reading cursor position at stimulus time.
   * Used to capture cursor position for RT analysis (mouse input only).
   * If not provided, cursorPosition will be omitted from TRIAL_PRESENTED events.
   */
  cursorPositionPort?: CursorPositionPort;

  // ===========================================================================
  // Beta: Audio-driven visual sync
  // ===========================================================================

  /**
   * Enable audio-driven visual sync.
   * When true, visual hides when audio actually ends (onEnded callback).
   * When false (default), visual hides based on spec's stimulusDurationMs timer.
   *
   * Use this with any sync_* audio preset for perfect audio-visual sync.
   */
  useAudioDrivenVisualSync?: boolean;
  /**
   * Optional imperative hook called immediately when visual should become visible.
   * Can be used to drive ultra-low-latency DOM/canvas rendering outside React.
   */
  onVisualTriggerImmediate?: (firedAtMs: number) => void;
  /**
   * Optional imperative hook called immediately when visual should hide.
   * Can be used to drive ultra-low-latency DOM/canvas rendering outside React.
   */
  onVisualHideImmediate?: (firedAtMs: number) => void;
  /**
   * Optional imperative hook called immediately when audio playback ends.
   * Useful in audio-driven sync mode to hide visuals outside React.
   */
  onAudioEndedImmediate?: (firedAtMs: number) => void;

  // ===========================================================================
  // Recovery mode (for resuming interrupted sessions)
  // ===========================================================================

  /**
   * Recovery state if resuming an interrupted session.
   * Contains enough data to restore the session from where it left off.
   */
  recoveryState?: {
    readonly sessionId: string;
    readonly lastTrialIndex: number;
    readonly trialHistory: readonly Trial[];
    readonly responses: readonly UserResponseEvent[];
    readonly startTimestamp: number;
    /**
     * All events from the original session (loaded from SQLite).
     * Required for accurate session report at the end.
     */
    readonly existingEvents?: readonly GameEvent[];
    /**
     * Original trials seed from SESSION_STARTED.
     * CRITICAL: Must be preserved to regenerate the same sequence.
     */
    readonly trialsSeed?: string;
    /**
     * Current stream version from emt_streams table.
     * This is the authoritative source of truth for the stream version.
     * If not provided, falls back to existingEvents.length (may be inaccurate).
     */
    readonly streamVersion?: number;
  };
}
