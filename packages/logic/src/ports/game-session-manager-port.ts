/**
 * Game Session Manager Port
 *
 * Interface for managing game sessions across all modes.
 * Ensures only one session runs at a time and coordinates with AppLifecycle.
 */

import type { GameModeId } from '../coach/game-mode';

// =============================================================================
// Types
// =============================================================================

/**
 * Session mode types that the manager can spawn.
 */
export type SessionMode = 'tempo' | 'flow' | 'recall' | 'pick' | 'trace';

/**
 * Common session lifecycle states.
 */
export type SessionLifecycleState =
  | 'idle' // No session active
  | 'starting' // Session being created
  | 'active' // Session running
  | 'paused' // Session paused (user action or backgrounded)
  | 'finishing' // Session ending, cleanup in progress
  | 'finished'; // Session complete

/**
 * Options for spawning a new session.
 */
export interface SpawnSessionOptions {
  /** Game mode ID (e.g., 'dual-catch', 'dual-place', 'dual-memo') */
  gameMode: GameModeId;

  /** User ID for the session */
  userId: string;

  /** Optional journey context */
  journeyId?: string;
  journeyStageId?: number;

  /** Mode-specific settings overrides */
  settings?: Record<string, unknown>;
}

/**
 * Session info exposed by the manager.
 */
export interface ManagedSessionInfo {
  /** Unique session ID */
  sessionId: string;

  /** Session mode type */
  mode: SessionMode;

  /** Game mode ID */
  gameMode: GameModeId;

  /** Current lifecycle state */
  state: SessionLifecycleState;

  /** When the session started */
  startedAt: number;

  /** Journey context if applicable */
  journeyId?: string;
  journeyStageId?: number;
}

/**
 * Events emitted by the session manager.
 */
export type GameSessionManagerEvent =
  | { type: 'SESSION_SPAWNED'; info: ManagedSessionInfo }
  | { type: 'SESSION_STARTED'; sessionId: string }
  | { type: 'SESSION_PAUSED'; sessionId: string; reason: 'user' | 'backgrounded' }
  | { type: 'SESSION_RESUMED'; sessionId: string }
  | { type: 'SESSION_FINISHED'; sessionId: string }
  | { type: 'SESSION_STOPPED'; sessionId: string; reason: 'user' | 'error' };

/**
 * Listener for session manager events.
 */
export type GameSessionManagerListener = (event: GameSessionManagerEvent) => void;

// =============================================================================
// Port Interface
// =============================================================================

/**
 * Port for managing game sessions.
 *
 * Responsibilities:
 * - Spawn the correct session type based on mode
 * - Ensure only one session runs at a time
 * - Coordinate with AppLifecycle (ENTER_SESSION/EXIT_SESSION)
 * - Forward BACKGROUNDED events to pause active session
 * - Emit events for session lifecycle changes
 */
export interface GameSessionManagerPort {
  // ===========================================================================
  // Session Lifecycle
  // ===========================================================================

  /**
   * Check if a session is currently active.
   */
  hasActiveSession(): boolean;

  /**
   * Get info about the active session, if any.
   */
  getActiveSession(): ManagedSessionInfo | null;

  /**
   * Get the current lifecycle state.
   */
  getState(): SessionLifecycleState;

  /**
   * Spawn a new session.
   * Throws if a session is already active.
   *
   * @param options - Session configuration
   * @returns The session info
   */
  spawn(options: SpawnSessionOptions): Promise<ManagedSessionInfo>;

  /**
   * Pause the active session.
   * No-op if no session is active or already paused.
   *
   * @param reason - Why the session is being paused
   */
  pause(reason: 'user' | 'backgrounded'): void;

  /**
   * Resume the active session.
   * No-op if no session is active or not paused.
   */
  resume(): void;

  /**
   * Stop the active session.
   * This will trigger session cleanup and emit SESSION_STOPPED.
   *
   * @param reason - Why the session is being stopped
   */
  stop(reason: 'user' | 'error'): void;

  // ===========================================================================
  // Subscriptions
  // ===========================================================================

  /**
   * Subscribe to session manager events.
   *
   * @param listener - Event listener
   * @returns Unsubscribe function
   */
  subscribe(listener: GameSessionManagerListener): () => void;

  // ===========================================================================
  // Cleanup
  // ===========================================================================

  /**
   * Dispose the manager and any active session.
   */
  dispose(): void;
}
