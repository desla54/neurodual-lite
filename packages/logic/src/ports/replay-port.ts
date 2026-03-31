// packages/logic/src/ports/replay-port.ts
/**
 * Replay Port
 *
 * Interface for loading session data for replay.
 * Implemented by infra layer (SQLiteStore).
 */

import type { GameEvent } from '../engine/events';
import type { BlockConfig } from '../domain';
import type { MemoSessionConfig } from '../types/memo';
import type { PlaceSessionConfig } from '../types/place';
import type { DualPickSessionConfig } from '../types/dual-pick';
import type { ModeSpec } from '../specs/types';

// =============================================================================
// Session Types for Replay
// =============================================================================

/**
 * Session type identifier for replay routing.
 */
export type ReplaySessionType = 'tempo' | 'flow' | 'recall' | 'dual-pick' | 'track';

/**
 * Base session data for replay.
 */
export interface ReplaySessionBase {
  readonly sessionId: string;
  readonly sessionType: ReplaySessionType;
  readonly nLevel: number;
  readonly createdAt: Date;
  readonly events: readonly GameEvent[];
  readonly totalDurationMs: number;
  readonly activeModalities: readonly string[];
  /** Whether trajectory data is available for this session */
  readonly hasTrajectoryData: boolean;
  /**
   * Mode specification archived at session start.
   * Contains scoring thresholds, timing config for faithful replay.
   * Undefined for sessions created before spec archiving was implemented.
   */
  readonly spec?: ModeSpec;
}

/**
 * Tempo session for replay.
 */
export interface ReplayTempoSession extends ReplaySessionBase {
  readonly sessionType: 'tempo';
  readonly config: BlockConfig;
}

/**
 * Flow session for replay.
 */
export interface ReplayPlaceSession extends ReplaySessionBase {
  readonly sessionType: 'flow';
  readonly config: PlaceSessionConfig;
}

/**
 * Recall (Memo) session for replay.
 */
export interface ReplayMemoSession extends ReplaySessionBase {
  readonly sessionType: 'recall';
  readonly config: MemoSessionConfig;
}

/**
 * DualPick (dual-pick) session for replay.
 */
export interface ReplayDualPickSession extends ReplaySessionBase {
  readonly sessionType: 'dual-pick';
  readonly config: DualPickSessionConfig;
}

/**
 * Dual Track session for replay.
 */
export interface ReplayTrackSession extends ReplaySessionBase {
  readonly sessionType: 'track';
  readonly config: {
    readonly targetCount: number;
    readonly totalObjects: number;
    readonly highlightDurationMs: number;
    readonly trackingDurationMs: number;
    readonly speedPxPerSec: number;
    readonly motionComplexity: 'smooth' | 'standard' | 'agile';
    readonly crowdingThresholdPx: number;
    readonly minSeparationPx: number;
  };
}

/**
 * Union of all replay session types.
 */
export type ReplaySession =
  | ReplayTempoSession
  | ReplayPlaceSession
  | ReplayMemoSession
  | ReplayDualPickSession
  | ReplayTrackSession;

// =============================================================================
// Port Interface
// =============================================================================

/**
 * Port for loading session data for replay.
 */
export interface ReplayPort {
  /**
   * Load a session for replay by ID.
   * Returns null if session not found or events unavailable.
   */
  getSessionForReplay(sessionId: string): Promise<ReplaySession | null>;

  /**
   * Check if a session has trajectory data available for replay.
   */
  hasReplayData(sessionId: string): Promise<boolean>;
}
