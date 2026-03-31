/**
 * DevLoggerPort
 *
 * Interface for development logging.
 * Optional - can be null in production.
 */

import type { GameEvent, SessionSummary } from '../engine/events';
import type { MemoSessionSummary } from '../types/memo';
import type { PlaceSessionSummary } from '../types/place';

/**
 * Union type for all session summary types.
 * Used by DevLoggerPort to accept any session type without casting.
 */
export type AnySessionSummary = SessionSummary | MemoSessionSummary | PlaceSessionSummary;

export interface SessionLogData {
  sessionId: string;
  events: GameEvent[];
  summary: AnySessionSummary | null;
}

export interface DevLoggerPort {
  /**
   * Log session data for debugging
   */
  logSession(data: SessionLogData): void;
}

// =============================================================================
// NullDevLogger - Null Object Pattern
// =============================================================================

/**
 * No-op implementation for production (Null Object Pattern).
 * Provides a safe default implementation that does nothing.
 */
export class NullDevLogger implements DevLoggerPort {
  logSession(_data: SessionLogData): void {
    // Intentionally empty - Null Object Pattern
  }
}

/**
 * Singleton instance for convenience.
 * @example
 * ```ts
 * const session = new GameSession(config, { devLogger: nullDevLogger });
 * ```
 */
export const nullDevLogger: DevLoggerPort = new NullDevLogger();
