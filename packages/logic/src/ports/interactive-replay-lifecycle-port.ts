/**
 * InteractiveReplayLifecyclePort
 *
 * Port defining the interactive replay state machine interface.
 * Allows UI to observe replay state and control playback.
 *
 * States:
 * - idle: No replay active
 * - loading: Creating replay run in DB
 * - ready: Run created, waiting for user to start playback
 * - playing: Replaying with tick updates, user can respond
 * - paused: Playback paused
 * - awaitingCompletion: Replay finished, waiting for user to complete/abandon
 * - finished: Run completed and persisted
 * - error: An error occurred
 */

import type { ModalityId } from '../types/core';
import type { GameEvent } from '../engine/events';
import type { ReplayRun } from '../types/replay-interactif';
import type { ReplayInteractifPort } from './replay-interactif-port';
import type { InteractiveReplayEvent, RunScoreDelta } from '../engine/interactive-replay-engine';

// =============================================================================
// Types
// =============================================================================

/**
 * Interactive replay lifecycle states
 */
export type InteractiveReplayLifecycleState =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'playing'
  | 'paused'
  | 'awaitingCompletion'
  | 'finished'
  | 'error';

/**
 * Speed options for interactive replay
 */
export type InteractiveReplaySpeed = 0.5 | 1 | 2;

/**
 * Machine input
 */
export interface InteractiveReplayInput {
  /** Replay persistence adapter */
  readonly adapter: ReplayInteractifPort;
  /** Session ID of the original session */
  readonly sessionId: string;
  /** Session type for mode-specific handling */
  readonly sessionType: 'tempo' | 'flow' | 'recall' | 'dual-pick' | 'track';
  /** Events from the parent run */
  readonly parentEvents: readonly GameEvent[];
  /** Active modalities for this session */
  readonly activeModalities: readonly ModalityId[];
  /** Parent run ID (null if deriving from Run 0) */
  readonly parentRunId: string | null;
  /** Total duration of the session in ms */
  readonly totalDurationMs: number;
}

/**
 * Machine context exposed to consumers
 */
export interface InteractiveReplayContext {
  /** Current replay run */
  readonly run: ReplayRun | null;
  /** Current playback time in ms */
  readonly currentTimeMs: number;
  /** Playback speed */
  readonly speed: InteractiveReplaySpeed;
  /** Emitted events during this run */
  readonly events: readonly InteractiveReplayEvent[];
  /** Final score (available in finished state) */
  readonly score: RunScoreDelta | null;
  /** Error if in error state */
  readonly error: Error | null;
  /** Current trial index */
  readonly currentTrialIndex: number;
}

/**
 * Events that can be sent to the machine
 */
export type InteractiveReplayMachineEvent =
  | { type: 'START' }
  | { type: 'PLAY' }
  | { type: 'PAUSE' }
  | { type: 'TICK'; deltaMs: number }
  | { type: 'RESPOND'; modality: ModalityId }
  | { type: 'SET_SPEED'; speed: InteractiveReplaySpeed }
  | { type: 'COMPLETE' }
  | { type: 'ABANDON' }
  | { type: 'RESET' };

/**
 * Listener for state changes
 */
export type InteractiveReplayStateListener = (state: InteractiveReplayLifecycleState) => void;

/**
 * Listener for context changes (more granular updates)
 */
export type InteractiveReplayContextListener = (context: InteractiveReplayContext) => void;

// =============================================================================
// Port Interface
// =============================================================================

/**
 * InteractiveReplayLifecyclePort
 *
 * Manages interactive replay sessions where users can correct their mistakes.
 * Orchestrates the InteractiveReplayEngine and ReplayInteractifPort.
 */
export interface InteractiveReplayLifecyclePort {
  // ===========================================================================
  // State Queries
  // ===========================================================================

  /**
   * Get current lifecycle state
   */
  getState(): InteractiveReplayLifecycleState;

  /**
   * Get current context
   */
  getContext(): InteractiveReplayContext;

  /**
   * Get progress (0-1)
   */
  getProgress(): number;

  /**
   * Check if a modality has been responded to for the current trial
   */
  hasRespondedForModality(modality: ModalityId): boolean;

  /**
   * Check if a modality was a false alarm in the parent run
   */
  wasParentFalseAlarm(modality: ModalityId): boolean;

  // ===========================================================================
  // Actions
  // ===========================================================================

  /**
   * Start a new replay run.
   * Transitions from 'idle' to 'loading' then 'ready'.
   */
  start(): void;

  /**
   * Start playback.
   * Transitions from 'ready' or 'paused' to 'playing'.
   */
  play(): void;

  /**
   * Pause playback.
   * Transitions from 'playing' to 'paused'.
   */
  pause(): void;

  /**
   * Toggle play/pause
   */
  togglePlayPause(): void;

  /**
   * Advance time by deltaMs.
   * Only valid in 'playing' state.
   * Called from external RAF loop for optimal performance.
   */
  tick(deltaMs: number): void;

  /**
   * Record a user response (correction attempt).
   * Only valid in 'playing' state.
   */
  respond(modality: ModalityId): void;

  /**
   * Set playback speed.
   */
  setSpeed(speed: InteractiveReplaySpeed): void;

  /**
   * Complete the replay run (persist and finalize).
   * Transitions from 'awaitingCompletion' to 'finished'.
   */
  complete(): void;

  /**
   * Abandon the replay run (delete from DB).
   * Transitions to 'idle'.
   */
  abandon(): void;

  /**
   * Reset to idle state (after finished or error).
   */
  reset(): void;

  // ===========================================================================
  // Mode-Specific Corrections
  // ===========================================================================

  /**
   * Record a Flow drop correction (proposal → slot placement).
   * Only valid for Place mode in 'playing' state.
   */
  flowDrop(
    proposalId: string,
    proposalType: 'position' | 'audio' | 'unified',
    proposalValue: number | string,
    targetSlot: number,
  ): void;

  /**
   * Record a Recall pick correction.
   * Only valid for Memo mode in 'playing' state.
   */
  recallPick(slotIndex: number, modality: 'position' | 'audio', value: number | string): void;

  /**
   * Record a DualPick drop correction (label → slot placement).
   * Only valid for DualPick mode in 'playing' state.
   */
  dualPickDrop(proposalId: string, label: string, targetSlot: number): void;

  // ===========================================================================
  // Subscriptions
  // ===========================================================================

  /**
   * Subscribe to state changes
   * @returns Unsubscribe function
   */
  subscribe(listener: InteractiveReplayStateListener): () => void;

  /**
   * Subscribe to context changes (includes currentTimeMs, events, etc.)
   * @returns Unsubscribe function
   */
  subscribeContext(listener: InteractiveReplayContextListener): () => void;

  // ===========================================================================
  // Lifecycle
  // ===========================================================================

  /**
   * Dispose the adapter and stop the actor.
   */
  dispose(): void;
}
