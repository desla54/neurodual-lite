/**
 * Game Session Manager
 *
 * Coordinator for game sessions across all modes.
 * Ensures only one session runs at a time and coordinates with AppLifecycle.
 */

import type {
  AppLifecyclePort,
  GameModeId,
  GameSessionManagerEvent,
  GameSessionManagerListener,
  GameSessionManagerPort,
  ManagedSessionInfo,
  PlatformLifecycleSource,
  SessionLifecycleState,
  SessionMode,
  SpawnSessionOptions,
} from '@neurodual/logic';
import { sessionManagerLog } from '../logger';

// =============================================================================
// Types
// =============================================================================

/**
 * Common interface for pausable sessions.
 * All session types (GameSession, PlaceSession, etc.) implement these methods.
 */
export interface PausableSession {
  readonly sessionId: string;
  pause?(): void;
  resume?(): void;
  stop(): void;
  subscribe(listener: (snapshot: unknown) => void): () => void;
}

/**
 * Session factory function type.
 * Allows pages to provide session creation logic.
 */
export type SessionFactory<T extends PausableSession> = () => T;

/**
 * Configuration for the session manager.
 */
export interface GameSessionManagerConfig {
  /** App lifecycle adapter for ENTER_SESSION/EXIT_SESSION */
  appLifecycle?: AppLifecyclePort;

  /** Platform lifecycle source for BACKGROUNDED/FOREGROUNDED */
  platformLifecycle?: PlatformLifecycleSource;
}

// =============================================================================
// Implementation
// =============================================================================

/**
 * GameSessionManager
 *
 * Coordinates game sessions:
 * - Ensures only one session runs at a time
 * - Integrates with AppLifecycle (ENTER_SESSION/EXIT_SESSION)
 * - Forwards BACKGROUNDED → pause session
 * - Emits events for session lifecycle changes
 */
export class GameSessionManager implements GameSessionManagerPort {
  private state: SessionLifecycleState = 'idle';
  private activeSession: PausableSession | null = null;
  private activeSessionInfo: ManagedSessionInfo | null = null;
  private listeners = new Set<GameSessionManagerListener>();

  // Subscriptions
  private sessionUnsubscribe: (() => void) | null = null;
  private platformUnsubscribe: (() => void) | null = null;

  // Dependencies
  private readonly appLifecycle?: AppLifecyclePort;
  private readonly platformLifecycle?: PlatformLifecycleSource;

  constructor(config: GameSessionManagerConfig = {}) {
    this.appLifecycle = config.appLifecycle;
    this.platformLifecycle = config.platformLifecycle;

    // Subscribe to platform lifecycle for background/foreground
    if (this.platformLifecycle) {
      this.platformUnsubscribe = this.platformLifecycle.subscribe((event) => {
        if (event === 'BACKGROUNDED') {
          this.pause('backgrounded');
        } else if (event === 'FOREGROUNDED') {
          this.resume();
        }
      });
    }

    sessionManagerLog.info('[SessionManager] Initialized');
  }

  // ===========================================================================
  // GameSessionManagerPort Implementation
  // ===========================================================================

  hasActiveSession(): boolean {
    return this.activeSession !== null;
  }

  getActiveSession(): ManagedSessionInfo | null {
    return this.activeSessionInfo;
  }

  getState(): SessionLifecycleState {
    return this.state;
  }

  async spawn(options: SpawnSessionOptions): Promise<ManagedSessionInfo> {
    // Ensure no session is already active
    if (this.activeSession) {
      throw new Error(
        `[SessionManager] Cannot spawn session: another session is already active (${this.activeSessionInfo?.sessionId})`,
      );
    }

    this.setState('starting');
    sessionManagerLog.info(`[SessionManager] Spawning session for mode: ${options.gameMode}`);

    // Note: Actual session creation is delegated to the caller via registerSession()
    // This spawn() method sets up the context and returns a placeholder
    // The actual session is registered via registerSession()

    const info: ManagedSessionInfo = {
      sessionId: `pending-${Date.now()}`,
      mode: this.gameModeToSessionMode(options.gameMode),
      gameMode: options.gameMode,
      state: 'starting',
      startedAt: Date.now(),
      journeyId: options.journeyId,
      journeyStageId: options.journeyStageId,
    };

    this.activeSessionInfo = info;

    // Notify AppLifecycle that we're entering a session
    this.appLifecycle?.enterSession();

    this.emit({ type: 'SESSION_SPAWNED', info });

    return info;
  }

  /**
   * Register an already-created session with the manager.
   * This allows pages to create sessions with their specific dependencies
   * while still benefiting from centralized lifecycle management.
   *
   * @param session - The session instance
   * @param mode - The session mode
   * @param gameMode - The game mode ID
   * @param journeyId - Optional journey ID
   * @param journeyStageId - Optional journey stage ID
   */
  registerSession(
    session: PausableSession,
    mode: SessionMode,
    gameMode: GameModeId,
    journeyId?: string,
    journeyStageId?: number,
  ): ManagedSessionInfo {
    // If there's already a session, stop it first
    if (this.activeSession) {
      sessionManagerLog.warn('[SessionManager] Replacing existing session');
      this.stopInternal('user');
    }

    this.activeSession = session;
    this.activeSessionInfo = {
      sessionId: session.sessionId,
      mode,
      gameMode,
      state: 'active',
      startedAt: Date.now(),
      journeyId,
      journeyStageId,
    };

    this.setState('active');

    // Notify AppLifecycle
    this.appLifecycle?.enterSession();

    // Subscribe to session updates (to detect when it finishes)
    this.sessionUnsubscribe = session.subscribe((snapshot: unknown) => {
      this.handleSessionUpdate(snapshot);
    });

    sessionManagerLog.info(`[SessionManager] Session registered: ${session.sessionId}`);
    this.emit({ type: 'SESSION_STARTED', sessionId: session.sessionId });

    return this.activeSessionInfo;
  }

  pause(reason: 'user' | 'backgrounded'): void {
    if (!this.activeSession || this.state !== 'active') {
      return;
    }

    if (this.activeSession.pause) {
      this.activeSession.pause();
      this.setState('paused');
      this.emit({ type: 'SESSION_PAUSED', sessionId: this.activeSession.sessionId, reason });
      sessionManagerLog.info(`[SessionManager] Session paused (${reason})`);
    }
  }

  resume(): void {
    if (!this.activeSession || this.state !== 'paused') {
      return;
    }

    if (this.activeSession.resume) {
      this.activeSession.resume();
      this.setState('active');
      this.emit({ type: 'SESSION_RESUMED', sessionId: this.activeSession.sessionId });
      sessionManagerLog.info('[SessionManager] Session resumed');
    }
  }

  stop(reason: 'user' | 'error'): void {
    this.stopInternal(reason);
  }

  subscribe(listener: GameSessionManagerListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    // Stop active session if any
    if (this.activeSession) {
      this.stopInternal('user');
    }

    // Unsubscribe from platform lifecycle
    if (this.platformUnsubscribe) {
      this.platformUnsubscribe();
      this.platformUnsubscribe = null;
    }

    this.listeners.clear();
    sessionManagerLog.info('[SessionManager] Disposed');
  }

  // ===========================================================================
  // Internal Methods
  // ===========================================================================

  private stopInternal(reason: 'user' | 'error'): void {
    if (!this.activeSession) {
      return;
    }

    const sessionId = this.activeSession.sessionId;

    // Unsubscribe from session
    if (this.sessionUnsubscribe) {
      this.sessionUnsubscribe();
      this.sessionUnsubscribe = null;
    }

    // Stop the session
    try {
      this.activeSession.stop();
    } catch (e) {
      sessionManagerLog.error('[SessionManager] Error stopping session:', e);
    }

    // Clear references
    this.activeSession = null;
    this.activeSessionInfo = null;

    // Notify AppLifecycle
    this.appLifecycle?.exitSession();

    this.setState('idle');
    this.emit({ type: 'SESSION_STOPPED', sessionId, reason });
    sessionManagerLog.info(`[SessionManager] Session stopped (${reason})`);
  }

  private handleSessionUpdate(snapshot: unknown): void {
    // Check if session has finished
    // Different session types have different snapshot structures
    // We check for common patterns
    const snapshotObj = snapshot as Record<string, unknown>;

    const isFinished =
      snapshotObj['phase'] === 'finished' ||
      snapshotObj['phase'] === 'ended' ||
      snapshotObj['state'] === 'finished' ||
      (snapshotObj['value'] && (snapshotObj['value'] as string) === 'finished');

    if (isFinished && this.activeSession && this.state === 'active') {
      const sessionId = this.activeSession.sessionId;

      this.setState('finished');
      this.emit({ type: 'SESSION_FINISHED', sessionId });
      sessionManagerLog.info(`[SessionManager] Session finished: ${sessionId}`);

      // Clean up
      if (this.sessionUnsubscribe) {
        this.sessionUnsubscribe();
        this.sessionUnsubscribe = null;
      }

      this.activeSession = null;
      this.activeSessionInfo = null;

      // Notify AppLifecycle
      this.appLifecycle?.exitSession();

      this.setState('idle');
    }
  }

  private setState(state: SessionLifecycleState): void {
    this.state = state;
    if (this.activeSessionInfo) {
      this.activeSessionInfo = { ...this.activeSessionInfo, state };
    }
  }

  private emit(event: GameSessionManagerEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (e) {
        sessionManagerLog.error('[SessionManager] Listener error:', e);
      }
    }
  }

  private gameModeToSessionMode(gameMode: GameModeId): SessionMode {
    // Map game mode IDs to session modes
    switch (gameMode) {
      case 'dualnback-classic':
      case 'sim-brainworkshop':
      case 'custom':
        return 'tempo';
      case 'dual-place':
        return 'flow';
      case 'dual-memo':
        return 'recall';
      case 'dual-pick':
        return 'pick';
      case 'dual-trace':
        return 'trace';
      default:
        return 'tempo';
    }
  }
}

// =============================================================================
// Factory
// =============================================================================

let managerInstance: GameSessionManager | null = null;

/**
 * Create or get the singleton GameSessionManager instance.
 */
export function getSessionManager(config?: GameSessionManagerConfig): GameSessionManager {
  if (!managerInstance) {
    managerInstance = new GameSessionManager(config);
  }
  return managerInstance;
}

/**
 * Reset the singleton instance (for testing).
 */
export function resetSessionManager(): void {
  if (managerInstance) {
    managerInstance.dispose();
    managerInstance = null;
  }
}
