/**
 * DualPickSession XState Types
 *
 * Type definitions for the DualPickSession XState machine.
 */

import type {
  DualPickProposal,
  DualPickTimelineCard,
  DualPickPlacementTarget,
  DualPickRunningStats,
  DualPickExtendedSummary,
  DualPickDragTrajectory,
  DualPickSnapshot,
} from '../../types/dual-pick';

// Re-export DualPickSnapshot as DualPickSessionSnapshot for backward compatibility
export type { DualPickSnapshot as DualPickSessionSnapshot };
import type { AudioPort } from '../../ports/audio-port';
import type { ClockPort } from '../../ports/clock-port';
import type { RandomPort } from '../../ports/random-port';
import type { TrialGenerator } from '../../coach/trial-generator';
import type { GameEvent } from '../../engine/events';
import type { PickSpec } from '../../specs';
import { TIMING_INTER_TRIAL_LABEL_MS } from '../../specs/thresholds';
import type { DualPickSessionPlugins } from './dual-pick-session-plugins';

// =============================================================================
// Input (Dependencies)
// =============================================================================

// =============================================================================
// Recovery State (for resuming interrupted sessions)
// =============================================================================

/**
 * Recovery state for resuming an interrupted DualPick session.
 */
export interface DualPickRecoveryState {
  /** The session ID to resume */
  readonly sessionId: string;
  /** Last trial index that was presented */
  readonly lastTrialIndex: number;
  /** Original session start timestamp */
  readonly startTimestamp: number;
}

/**
 * Dependencies required to create a DualPickSession machine.
 */
export interface DualPickSessionInput {
  // Identity
  readonly sessionId: string;
  readonly userId: string;

  /** Explicit play context for deterministic events/reports */
  readonly playMode: 'journey' | 'free';

  // Spec (SSOT - replaces config)
  readonly spec: PickSpec;

  // Services (injected)
  readonly generator: TrialGenerator;
  readonly audio: AudioPort;
  readonly clock: ClockPort;
  readonly random: RandomPort;

  // Plugins (data in / data out)
  readonly plugins: DualPickSessionPlugins;

  // Journey integration
  readonly journeyStageId?: number;
  readonly journeyId?: string;
  /** Journey configuration snapshot (required for journey sessions) */
  readonly journeyStartLevel?: number;
  readonly journeyTargetLevel?: number;
  readonly journeyGameMode?: string;
  readonly journeyName?: string;

  // Recovery mode
  /** If provided, session will resume from this recovered state */
  readonly recoveryState?: DualPickRecoveryState;

  /** Optional command bus for strict command-based event persistence. */
  readonly commandBus?: import('../../ports/command-bus-port').CommandBusPort;
}

// =============================================================================
// Context (Extended State)
// =============================================================================

/**
 * Extended state maintained by the XState machine.
 */
export interface DualPickSessionContext extends DualPickSessionInput {
  // Trial state
  trialIndex: number;
  stimulus: { position: number; sound: string } | null;
  history: Array<{ position: number; sound: string }>;

  // Placement state
  proposals: DualPickProposal[];
  timelineCards: DualPickTimelineCard[];
  placementOrder: DualPickPlacementTarget[];
  placementOrderIndex: number;

  // Stats
  stats: DualPickRunningStats;
  summary: DualPickExtendedSummary | null;

  // Timing
  startTime: number;
  /** Timestamp when the current turn (placement phase) started */
  turnStartedAtMs: number;

  // Event sourcing
  sessionEvents: GameEvent[];
  seq: number;

  // Pending persistence operations (for critical events like STARTED/ENDED)
  pendingPersistence: Promise<void>[];

  // Session outcome
  isCompleted: boolean;
}

// =============================================================================
// Events
// =============================================================================

/**
 * XState events for DualPickSession.
 */
export type DualPickSessionEvent =
  | { type: 'START' }
  | { type: 'STOP' }
  | {
      type: 'DROP_LABEL';
      proposalId: string;
      targetSlot: number;
      targetType: 'position' | 'audio' | 'unified';
      trajectory?: DualPickDragTrajectory;
    };

// =============================================================================
// Actor Inputs
// =============================================================================

export interface DualPickStimulusTimerInput {
  readonly context: DualPickSessionContext;
}

export interface DualPickInterTrialTimerInput {
  readonly context: DualPickSessionContext;
}

// =============================================================================
// Session Proxy Interface
// =============================================================================

/**
 * Interface for DualPickSession proxy used by UI hooks.
 *
 * This interface is implemented by the session proxy created in dual-pick-training.tsx.
 * It provides a simplified API for the drag hook to interact with the XState machine.
 */
export interface DualPickSession {
  /**
   * Drop a label onto a target slot.
   * @param proposalId - The proposal being dropped
   * @param targetSlot - The target slot index
   * @param targetType - The type of target (position, audio, or unified)
   * @param trajectory - Optional drag trajectory data
   * @returns Promise resolving to true if the drop was valid
   */
  dropLabel(
    proposalId: string,
    targetSlot: number,
    targetType: 'position' | 'audio' | 'unified',
    trajectory?: DualPickDragTrajectory,
  ): Promise<boolean>;

  /** Optional config for placement order mode */
  config?: {
    placementOrderMode?: 'free' | 'strict' | 'hint';
  };
}

// =============================================================================
// Constants
// =============================================================================

/** Inter-trial delay in milliseconds @see thresholds.ts (SSOT) */
export const INTER_TRIAL_DELAY_MS = TIMING_INTER_TRIAL_LABEL_MS;
