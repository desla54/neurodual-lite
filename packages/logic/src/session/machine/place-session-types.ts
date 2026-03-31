/**
 * PlaceSession XState Machine Types
 *
 * Type definitions for the XState-based flow session machine.
 */
import type { PlaceExtendedSummary } from '../../engine/place-projector';
import type { AudioPort } from '../../ports/audio-port';
import type { ClockPort } from '../../ports/clock-port';
import type { RandomPort } from '../../ports/random-port';
import type { AlgorithmStatePort } from '../../ports/algorithm-state-port';
import type { TrialGenerator } from '../../coach/trial-generator';
import type {
  PlaceProposal,
  PlacementTarget,
  PlaceRunningStats,
  PlacePhase,
  PlaceDragTrajectory,
} from '../../types/place';
import type { PlaceSpec } from '../../specs';
import type { PlaceSessionPlugins } from './place-session-plugins';

// =============================================================================
// Input (for machine creation)
// =============================================================================

export interface PlaceSessionInput {
  // Identity
  readonly sessionId: string;
  readonly userId: string;

  // Spec (SSOT - replaces config)
  readonly spec: PlaceSpec;

  // Services (injected)
  readonly audio: AudioPort;
  readonly clock: ClockPort;
  readonly random: RandomPort;
  readonly generator: TrialGenerator;

  // Plugins (data in / data out)
  readonly plugins: PlaceSessionPlugins;

  // Session metadata
  readonly playMode?: 'journey' | 'free';
  readonly journeyStageId?: number;
  readonly journeyId?: string;
  /** Journey configuration snapshot (required for journey sessions) */
  readonly journeyStartLevel?: number;
  readonly journeyTargetLevel?: number;
  readonly journeyGameMode?: string;
  readonly journeyName?: string;

  // Optional
  readonly algorithmStatePort?: AlgorithmStatePort;

  /** Optional command bus for strict command-based event persistence. */
  readonly commandBus?: import('../../ports/command-bus-port').CommandBusPort;

  // Recovery mode
  /** If provided, session will resume from this recovered state */
  readonly recoveryState?: {
    readonly sessionId: string;
    readonly lastTrialIndex: number;
    readonly startTimestamp: number;
  };
}

// =============================================================================
// Context (Extended State)
// =============================================================================

export interface PlaceSessionMachineContext extends PlaceSessionInput {
  // Trial state
  trialIndex: number;
  history: Array<{ position: number; sound: string }>;
  stimulus: { position: number; sound: string } | null;

  // Placement state
  proposals: PlaceProposal[];
  placedProposals: Map<string, number>;
  placementOrder: PlacementTarget[];
  placementOrderIndex: number;

  // Turn tracking (for placement phase)
  turnErrorCount: number;
  turnDropOrder: number;
  turnStartTime: number;

  // Stats
  stats: PlaceRunningStats;

  // Timing
  startTime: number;
  stimulusTimerId: number | null;

  // Event sequencing
  seq: number;

  // Results
  summary: PlaceExtendedSummary | null;
  // Use loose event type for flexibility - will be cast to GameEvent[] for projector
  sessionEvents: Array<Record<string, unknown> & { type: string }>;

  // Pending persistence operations (for critical events like STARTED/ENDED)
  pendingPersistence: Promise<void>[];
}

// =============================================================================
// Events
// =============================================================================

export type PlaceSessionMachineEvent =
  | { type: 'START' }
  | { type: 'STOP' }
  | { type: 'STIMULUS_COMPLETE' }
  | {
      type: 'DROP';
      proposalId: string;
      targetSlot: number;
      trajectory?: PlaceDragTrajectory;
    }
  | {
      type: 'DRAG_CANCELLED';
      proposalId: string;
      trajectory?: {
        dragDurationMs: number;
        totalDistancePx?: number;
        slotEnters?: readonly {
          slot: number;
          type: 'position' | 'audio';
          mirror?: boolean;
          atMs: number;
        }[];
        releasedOnSlot?: number | null;
        invalidDrop?: boolean;
        inputMethod?: 'mouse' | 'touch';
      };
    }
  | { type: 'ADVANCE' };

// =============================================================================
// State Value Types
// =============================================================================

export type PlaceSessionMachineStateValue =
  | 'idle'
  | 'stimulus'
  | 'placement'
  | 'awaitingAdvance'
  | 'finished';

// =============================================================================
// Snapshot Type (for UI subscription)
// =============================================================================

export interface PlaceSessionMachineSnapshot {
  readonly phase: PlacePhase;
  readonly trialIndex: number;
  readonly totalTrials: number;
  readonly nLevel: number;
  readonly stimulus: { position: number; sound: string } | null;
  readonly proposals: readonly PlaceProposal[];
  readonly placedProposals: ReadonlyMap<string, number>;
  readonly currentTarget: PlacementTarget | null;
  readonly stats: PlaceRunningStats;
  readonly history: readonly { position: number; sound: string }[];
  readonly summary: PlaceExtendedSummary | null;
  readonly adaptiveZone: number | null;
}
