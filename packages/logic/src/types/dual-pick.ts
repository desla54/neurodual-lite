/**
 * Dual Label Types - Dual Label Mode (BETA)
 *
 * Inverse of Place mode:
 * - Stimuli auto-fill the timeline (unlabeled)
 * - User drags label cards (N, N-1, N-2) onto the correct stimuli
 */

import type { ModalityId } from './core';
import type { CompactTrajectory } from './trajectory';
import {
  DEFAULT_DISTRACTOR_COUNT,
  DEFAULT_N_LEVEL,
  DEFAULT_TRIALS_COUNT_FLOW,
  TIMING_STIMULUS_FLOW_MS,
} from '../specs/thresholds';

// =============================================================================
// Label Types
// =============================================================================

/**
 * Label identifiers for N-back positions.
 */
export type DualPickId = 'N' | 'N-1' | 'N-2';

/**
 * A label card that the user must place on the correct stimulus.
 */
export interface DualPickProposal {
  readonly id: string;
  readonly label: DualPickId;
  /** The modality this label is for: 'position', 'audio', or 'unified' (binding mode) */
  readonly type: 'position' | 'audio' | 'unified';
  /** The slot index where this label should be placed (0 = N, 1 = N-1, 2 = N-2) */
  readonly correctSlot: number;
}

/**
 * A stimulus card in the timeline (filled automatically).
 * Can be separated by modality or unified (binding mode).
 */
export interface DualPickTimelineCard {
  readonly slot: number;
  /** Modality type of this card: 'position', 'audio', or 'unified' (binding mode) */
  readonly type: 'position' | 'audio' | 'unified';
  /** Position value (for position or unified type) */
  readonly position?: number;
  /** Sound value (for audio or unified type) */
  readonly sound?: string;
  /** Label placed on this card, null if not yet labeled */
  readonly placedLabel: DualPickId | null;
  /** True if this is a distractor card (fake stimulus not in the N-back window) */
  readonly isDistractor?: boolean;
  /** Unique ID for distractor cards (for tracking purposes) */
  readonly distractorId?: string;
}

// =============================================================================
// Trajectory Data (for confidence scoring)
// =============================================================================

/**
 * Slot entry during drag trajectory.
 */
export interface DualPickSlotEnter {
  readonly slot: number;
  readonly type: 'position' | 'audio' | 'unified';
  readonly atMs: number;
}

/**
 * Trajectory data collected during a label drag.
 */
export interface DualPickDragTrajectory {
  readonly dragStartedAtMs: number;
  readonly totalDistancePx: number;
  readonly directDistancePx: number;
  readonly slotEnters: readonly DualPickSlotEnter[];
  readonly trajectory?: CompactTrajectory;
  /** Input method used for this drag (mouse or touch) */
  readonly inputMethod?: 'mouse' | 'touch';
}

// =============================================================================
// Session Config
// =============================================================================

/**
 * Placement order mode for dual label sessions.
 * - 'free': User can place labels in any order
 * - 'random': User must follow a random placement order (anti-chunking)
 * - 'oldestFirst': User must place from oldest to newest (N-2 → N-1 → N)
 * - 'newestFirst': User must place from newest to oldest (N → N-1 → N-2)
 */
export type DualPickPlacementOrderMode = 'free' | 'random' | 'oldestFirst' | 'newestFirst';

/**
 * Timeline mode for dual label sessions.
 * - 'separated': Position and audio are separate cards (default)
 * - 'unified': Position and audio are combined in a single card (binding mode)
 */
export type DualPickTimelineMode = 'separated' | 'unified';

/**
 * Distractor source for dual label sessions.
 * - 'random': Distractors are random values never seen (default)
 * - 'proactive': Distractors are old stimuli outside the N-back window (proactive interference)
 */
export type DualPickDistractorSource = 'random' | 'proactive';

/**
 * A placement target in guided mode.
 * The user must place this specific proposal.
 */
export interface DualPickPlacementTarget {
  readonly proposalId: string;
  readonly proposalType: 'position' | 'audio' | 'unified';
}

/**
 * Configuration for a dual label session.
 */
export interface DualPickSessionConfig {
  readonly nLevel: number;
  readonly activeModalities: readonly ModalityId[];
  readonly trialsCount: number;
  readonly stimulusDurationMs: number;
  /** Placement mode: 'free' (default), 'random', 'oldestFirst', or 'newestFirst' */
  readonly placementOrderMode: DualPickPlacementOrderMode;
  /** Number of distractor cards to add (0-4). Distractors are fake stimuli not in the N-back window. */
  readonly distractorCount: number;
  /** Timeline mode: 'separated' (default) or 'unified' (binding - position+audio together) */
  readonly timelineMode?: DualPickTimelineMode;
  /** Distractor source: 'random' (default) or 'proactive' (old stimuli outside window) */
  readonly distractorSource?: DualPickDistractorSource;
}

/** @see thresholds.ts SSOT for numeric values */
export const DEFAULT_DUAL_PICK_SESSION_CONFIG: DualPickSessionConfig = {
  nLevel: DEFAULT_N_LEVEL,
  activeModalities: ['position', 'audio'],
  trialsCount: DEFAULT_TRIALS_COUNT_FLOW,
  stimulusDurationMs: TIMING_STIMULUS_FLOW_MS,
  placementOrderMode: 'free',
  distractorCount: DEFAULT_DISTRACTOR_COUNT,
  timelineMode: 'separated',
  distractorSource: 'random',
};

// =============================================================================
// Running Stats
// =============================================================================

/**
 * Running stats during dual label session.
 */
export interface DualPickRunningStats {
  readonly turnsCompleted: number;
  readonly totalDrops: number;
  readonly correctDrops: number;
  readonly errorCount: number;
  readonly accuracy: number;
}

export function createEmptyDualPickStats(): DualPickRunningStats {
  return {
    turnsCompleted: 0,
    totalDrops: 0,
    correctDrops: 0,
    errorCount: 0,
    accuracy: 0,
  };
}

// =============================================================================
// Session Summary
// =============================================================================

/**
 * Complete summary of a dual label session.
 */
/**
 * Stats for a specific modality in Dual Label.
 */
export interface DualPickModalityStats {
  readonly totalDrops: number;
  readonly correctDrops: number;
  readonly errorCount: number;
  readonly accuracy: number;
  readonly avgPlacementTimeMs: number;
}

/**
 * Result of a complete turn.
 */
export interface DualPickTurnResult {
  readonly trialIndex: number;
  readonly totalDrops: number;
  readonly correctDrops: number;
  readonly errorCount: number;
  readonly accuracy: number;
  readonly turnDurationMs: number;
  // readonly drops: readonly DualPickDropAttemptedEvent[]; // Circular dependency if imported from events
  // We'll keep it simple for now, projector will handle the drops linkage
}

/**
 * Trend direction based on recent turns.
 */
export type DualPickTrend = 'improving' | 'stable' | 'declining';

/**
 * Extended stats with modality details and trend.
 */
export interface DualPickExtendedStats extends DualPickRunningStats {
  readonly byModality: Record<ModalityId, DualPickModalityStats>;
  readonly trend: DualPickTrend;
  readonly avgTurnDurationMs: number;
  readonly avgPlacementTimeMs: number;
}

/**
 * Confidence metrics for a single drop.
 * Calculated from trajectory data.
 */
export interface DualPickDropConfidenceMetrics {
  readonly proposalId: string;
  readonly trialIndex: number;
  readonly correct: boolean;
  /** Ratio between direct distance and total distance (1.0 = perfect) */
  readonly directnessRatio: number;
  /** Number of slots visited other than target */
  readonly hesitationCount: number;
  /** Total time spent on wrong slots (ms) */
  readonly wrongSlotDwellMs: number;
  /** Drag duration (ms) */
  readonly dragDurationMs: number;
  /** Confidence score for this drop (0-100), null for last slot (excluded from average) */
  readonly confidenceScore: number | null;
  /** Trajectory data availabilty */
  readonly hasTrajectoryData: boolean;
}

/**
 * Complete summary of a dual label session (extended).
 */
export interface DualPickSessionSummary {
  readonly sessionId: string;
  readonly nLevel: number;
  readonly totalTrials: number;
  readonly finalStats: DualPickRunningStats;
  readonly durationMs: number;
  readonly completed: boolean;
  readonly score: number;
}

/**
 * Extended summary with turn results.
 */
export interface DualPickExtendedSummary extends DualPickSessionSummary {
  readonly turnResults: readonly DualPickTurnResult[];
  readonly extendedStats: DualPickExtendedStats;
  /** Adaptive zone (1-20), null if not adaptive */
  readonly finalAdaptiveZone: number | null;
  /** Confidence score based on trajectories (0-100) */
  readonly confidenceScore: number;
  /** Confidence metrics per drop */
  readonly dropConfidenceMetrics: readonly DualPickDropConfidenceMetrics[];
}

// =============================================================================
// Phases
// =============================================================================

/**
 * Dual Label session phases.
 */
export type DualPickPhase = 'idle' | 'stimulus' | 'placement' | 'finished';

// =============================================================================
// Snapshot
// =============================================================================

export interface DualPickSnapshot {
  readonly phase: DualPickPhase;
  readonly trialIndex: number;
  readonly totalTrials: number;
  readonly stimulus: { position: number; sound: string } | null;
  readonly proposals: readonly DualPickProposal[];
  readonly timelineCards: readonly DualPickTimelineCard[];
  readonly stats: DualPickRunningStats;
  readonly nLevel: number;
  readonly summary: DualPickExtendedSummary | null;
  readonly history: readonly { position: number; sound: string }[];
  readonly activeModalities: readonly ('position' | 'audio')[];
  readonly currentTarget: DualPickPlacementTarget | null;
}
