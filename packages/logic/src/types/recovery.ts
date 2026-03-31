/**
 * Session Recovery Types
 *
 * Types for persisting session state during page refresh/close.
 * Used with localStorage for synchronous access on page load.
 *
 * The actual events are stored in SQLite - this is just metadata
 * to know IF there's a session to recover and how to rebuild it.
 */

import type { SessionPlayContext } from '../engine/events';
import type { BlockConfig } from './core';

/**
 * Mode IDs for session recovery.
 * These correspond to route names in apps/web.
 */
export type RecoveryModeId =
  | 'game'
  | 'active-training'
  | 'place-training'
  | 'dual-pick-training'
  | 'trace-training';

/**
 * Lightweight snapshot saved to localStorage for session recovery.
 * Contains enough metadata to rebuild session from SQLite events.
 */
export interface SessionRecoverySnapshot {
  /** Session ID - used to fetch events from SQLite */
  readonly sessionId: string;

  /** Mode being played (for routing/UI) */
  readonly modeId: RecoveryModeId;

  /** The config used to create the session */
  readonly config: BlockConfig;

  /** Current trial index when paused/interrupted */
  readonly trialIndex: number;

  /** Total trials expected */
  readonly totalTrials: number;

  /** Unix timestamp when snapshot was created */
  readonly timestamp: number;

  /** Optional: N-level for adaptive modes */
  readonly nLevel?: number;

  /** Optional: energy level declaration */
  readonly declaredEnergyLevel?: number;

  /** Optional: explicit play mode for deterministic routing on resume */
  readonly playMode?: SessionPlayContext;

  /** Optional: journey stage ID when the interrupted session was a journey run */
  readonly journeyStageId?: number;

  /** Optional: journey ID when the interrupted session was a journey run */
  readonly journeyId?: string;
}

/**
 * Result of checking for recoverable session
 */
export interface RecoveryCheckResult {
  /** Whether a recoverable session exists */
  readonly hasSession: boolean;

  /** The snapshot if available */
  readonly snapshot: SessionRecoverySnapshot | null;

  /** Whether the snapshot is stale (>30 min old) */
  readonly isStale: boolean;
}

/**
 * Full recovered session state combining snapshot + projected events.
 * Used to rebuild a session after recovery.
 */
export interface RecoveredSessionState {
  /** Session ID */
  readonly sessionId: string;

  /** Mode being played */
  readonly modeId: RecoveryModeId;

  /** Explicit play mode when it could be recovered deterministically */
  readonly playMode?: SessionPlayContext;

  /** The config used to create the session */
  readonly config: BlockConfig;

  /** Last trial index that was presented */
  readonly lastTrialIndex: number;

  /** Trial history from events */
  readonly trialHistory: readonly import('./core').Trial[];

  /** User responses from events */
  readonly responses: readonly import('../engine/events').UserResponseEvent[];

  /** Original session start timestamp */
  readonly startTimestamp: number;

  /** N-level for the session */
  readonly nLevel?: number;

  /** Journey stage ID if applicable */
  readonly journeyStageId?: number;

  /** Journey ID if applicable */
  readonly journeyId?: string;

  /** Game mode string */
  readonly gameMode?: string;

  /** Whether the snapshot was stale */
  readonly isStale: boolean;

  /** Declared energy level */
  readonly declaredEnergyLevel?: 1 | 2 | 3;

  /**
   * All events from the original session (loaded from SQLite).
   * Required for accurate session report at the end.
   * Without this, only post-recovery events would be counted.
   */
  readonly existingEvents: readonly import('../engine/events').GameEvent[];

  /**
   * Original trials seed from SESSION_STARTED.
   * CRITICAL: Must be preserved to regenerate the same sequence.
   * Without this, the generator produces different trials after recovery.
   */
  readonly trialsSeed?: string;

  /**
   * Current stream version from emt_streams table.
   * This is the authoritative source of truth for the stream version.
   * Used to initialize currentStreamVersion in GameSessionXState during recovery.
   */
  readonly streamVersion?: number;
}

// =============================================================================
// Tutorial Recovery Types
// =============================================================================

/**
 * Lightweight snapshot for tutorial session recovery.
 * Much simpler than game session recovery - just need to know which step.
 */
export interface TutorialRecoverySnapshot {
  /** Tutorial ID (e.g., 'basics', 'advanced') */
  readonly tutorialId: string;

  /** Current step index when interrupted */
  readonly stepIndex: number;

  /** Unix timestamp when snapshot was created */
  readonly timestamp: number;
}

/**
 * Result of checking for recoverable tutorial
 */
export interface TutorialRecoveryCheckResult {
  /** Whether a recoverable tutorial exists */
  readonly hasSession: boolean;

  /** The snapshot if available */
  readonly snapshot: TutorialRecoverySnapshot | null;

  /** Whether the snapshot is stale (>30 min old) */
  readonly isStale: boolean;
}

// =============================================================================
// Replay Recovery Types (Interactive Correction)
// =============================================================================

/**
 * Session types that support interactive replay.
 */
export type ReplaySessionType = 'tempo' | 'flow' | 'recall' | 'dual-pick' | 'track';

/**
 * Lightweight snapshot for interactive replay recovery.
 * Saved to localStorage for quick detection on page load.
 *
 * The actual replay events are stored in SQLite (replay_events table).
 */
export interface ReplayRecoverySnapshot {
  /** Run ID in replay_runs table */
  readonly runId: string;

  /** Original session ID being corrected */
  readonly sessionId: string;

  /** Type of session being replayed */
  readonly sessionType: ReplaySessionType;

  /** Parent run ID if correcting a correction (null = correcting original) */
  readonly parentRunId: string | null;

  /** Current playback position in milliseconds */
  readonly currentTimeMs: number;

  /** Current trial index (for display/progress) */
  readonly currentTrialIndex: number;

  /** Playback speed at time of interruption */
  readonly speed: 0.5 | 1 | 2;

  /** Unix timestamp when snapshot was created */
  readonly timestamp: number;
}

/**
 * Result of checking for recoverable replay
 */
export interface ReplayRecoveryCheckResult {
  /** Whether a recoverable replay exists */
  readonly hasSession: boolean;

  /** The snapshot if available */
  readonly snapshot: ReplayRecoverySnapshot | null;

  /** Whether the snapshot is stale (>30 min old) */
  readonly isStale: boolean;
}

/**
 * Recovered replay state from events + snapshot.
 * Contains everything needed to resume the replay.
 */
export interface RecoveredReplayState {
  /** The run being recovered */
  readonly run: import('./replay-interactif').ReplayRun;

  /** Events already emitted in this run */
  readonly emittedEvents: readonly import('./replay-interactif').ReplayEvent[];

  /** Last playback position in milliseconds */
  readonly lastTimeMs: number;

  /** Last trial index that was reached */
  readonly lastTrialIndex: number;

  /** Whether the snapshot was stale */
  readonly isStale: boolean;
}
