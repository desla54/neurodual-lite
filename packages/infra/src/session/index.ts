/**
 * Session Module
 *
 * Services for game session management:
 * - GameSessionManager (coordinator for all session types)
 */

export {
  GameSessionManager,
  getSessionManager,
  resetSessionManager,
  type GameSessionManagerConfig,
  type PausableSession,
  type SessionFactory,
} from './game-session-manager';
