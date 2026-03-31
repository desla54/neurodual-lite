// packages/logic/src/types/place.ts
/**
 * Place Types - Dual Place Mode
 *
 * Types for the place mode where users drag visible proposals
 * to correct timeline slots.
 */

import type { ModalityId, Sound } from './core';
import type { CompactTrajectory } from './trajectory';
import {
  DEFAULT_DISTRACTOR_COUNT,
  DEFAULT_N_LEVEL,
  DEFAULT_TRIALS_COUNT_FLOW,
  TIMING_STIMULUS_FLOW_MS,
} from '../specs/thresholds';

// =============================================================================
// Proposal Types
// =============================================================================

/**
 * A proposal card that the user must place.
 * Distractors have isDistractor=true and correctSlot=-1 (no valid target).
 */
export type PlaceProposal =
  | {
      readonly id: string;
      readonly type: 'position';
      readonly value: number;
      readonly correctSlot: number;
      readonly isDistractor?: boolean;
    }
  | {
      readonly id: string;
      readonly type: 'audio';
      readonly value: Sound;
      readonly correctSlot: number;
      readonly isDistractor?: boolean;
    }
  | {
      readonly id: string;
      readonly type: 'unified';
      readonly position: number;
      readonly sound: Sound;
      readonly correctSlot: number;
      readonly isDistractor?: boolean;
    };

/**
 * Result of a single drop attempt.
 */
export interface PlaceDropResult {
  readonly proposalId: string;
  readonly targetSlot: number;
  readonly correct: boolean;
  readonly timestamp: number;
}

// =============================================================================
// Trajectory Data (for confidence scoring)
// =============================================================================

/**
 * Raw slot entry during drag trajectory.
 * Matches PlaceSlotEnter in events.ts for event emission.
 */
export interface PlaceDragSlotEnter {
  readonly slot: number;
  readonly type: 'position' | 'audio' | 'unified';
  readonly mirror: boolean;
  readonly atMs: number; // monotonic timestamp
}

/**
 * Trajectory data collected during a drag operation.
 * Used to compute confidence score via projection.
 */
export interface PlaceDragTrajectory {
  /** Monotonic timestamp when drag started (performance.now) */
  readonly dragStartedAtMs: number;
  /** Total distance traveled during drag (pixels) */
  readonly totalDistancePx: number;
  /** Direct distance from start to end (pixels) */
  readonly directDistancePx: number;
  /** Slot entries during drag */
  readonly slotEnters: readonly PlaceDragSlotEnter[];
  /** Full XY trajectory (20Hz sampling, for replay) */
  readonly trajectory?: CompactTrajectory;
  /** Input method used for this drag (mouse or touch) */
  readonly inputMethod?: 'mouse' | 'touch';
}

// =============================================================================
// Guided Placement (Anti-chunking)
// =============================================================================

/**
 * Placement order mode for flow sessions.
 * - 'free': User can place any proposal in any slot (default)
 * - 'random': User must follow a random placement order (anti-chunking)
 * - 'oldestFirst': User must place from oldest to newest (N-2 → N-1 → N)
 * - 'newestFirst': User must place from newest to oldest (N → N-1 → N-2)
 */
export type PlacementOrderMode = 'free' | 'random' | 'oldestFirst' | 'newestFirst';

/**
 * Timeline mode for flow sessions.
 * - 'separated': Position and audio are separate proposals/slots (default)
 * - 'unified': Position and audio are combined in a single proposal/slot (binding mode)
 */
export type PlaceTimelineMode = 'separated' | 'unified';

/**
 * A single placement target in guided mode.
 * The user must place this specific proposal in this specific slot.
 */
export interface PlacementTarget {
  readonly proposalId: string;
  readonly targetSlot: number;
}

// =============================================================================
// Session Config
// =============================================================================

/** Distractor source type */
export type PlaceDistractorSource = 'random' | 'proactive';

/**
 * Configuration for a flow session.
 */
export interface PlaceSessionConfig {
  readonly nLevel: number;
  readonly activeModalities: readonly ModalityId[];
  readonly trialsCount: number;
  readonly stimulusDurationMs: number;
  /** Placement mode: 'free' (default), 'random', 'oldestFirst', or 'newestFirst' */
  readonly placementOrderMode: PlacementOrderMode;
  /** Timeline mode: 'separated' (default) or 'unified' (binding - position+audio together) */
  readonly timelineMode?: PlaceTimelineMode;
  /** Number of distractor cards (fake stimuli not in N-back window) */
  readonly distractorCount?: number;
  /** Distractor source: 'random' or 'proactive' (old stimuli outside window) */
  readonly distractorSource?: PlaceDistractorSource;
}

/** @see thresholds.ts SSOT for numeric values */
export const DEFAULT_PLACE_SESSION_CONFIG: PlaceSessionConfig = {
  nLevel: DEFAULT_N_LEVEL,
  activeModalities: ['position', 'audio'],
  trialsCount: DEFAULT_TRIALS_COUNT_FLOW,
  stimulusDurationMs: TIMING_STIMULUS_FLOW_MS,
  placementOrderMode: 'free',
  timelineMode: 'separated',
  distractorCount: DEFAULT_DISTRACTOR_COUNT,
  distractorSource: 'random',
};

// =============================================================================
// Running Stats
// =============================================================================

/**
 * Running stats during flow session.
 */
export interface PlaceRunningStats {
  readonly turnsCompleted: number;
  readonly totalDrops: number;
  readonly correctDrops: number;
  readonly errorCount: number;
  readonly accuracy: number;
}

export function createEmptyPlaceStats(): PlaceRunningStats {
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
 * Complete summary of a flow session.
 */
export interface PlaceSessionSummary {
  readonly sessionId: string;
  readonly nLevel: number;
  readonly totalTrials: number;
  readonly finalStats: PlaceRunningStats;
  readonly durationMs: number;
  readonly completed: boolean;
  /** Score 0-100 based on errors */
  readonly score: number;
}

// =============================================================================
// Phases
// =============================================================================

/**
 * Flow session phases.
 */
export type PlacePhase = 'idle' | 'stimulus' | 'placement' | 'awaitingAdvance' | 'finished';
