/**
 * MemoSession XState Machine Types
 *
 * Type definitions for the XState-based memo session machine.
 * Migrated from manual State Pattern implementation with 100% functional equivalence.
 */
import type { Trial } from '../../types/core';
import type {
  FillCell,
  ModalityPick,
  MemoRunningStats,
  SlotPicks,
  WindowPicks,
} from '../../types/memo';
import type { AudioPort } from '../../ports/audio-port';
import type { AlgorithmStatePort } from '../../ports/algorithm-state-port';
import type { ClockPort } from '../../ports/clock-port';
import type { DevLoggerPort } from '../../ports/dev-logger-port';
import type { RandomPort } from '../../ports/random-port';
import type { TrialGenerator } from '../../coach/trial-generator';
import type { MemoSpec } from '../../specs';
import type { MemoExtendedSummary } from '../../engine/memo-projector';
import type { GameEvent } from '../../engine/events';
import type { MemoSessionPlugins } from './memo-session-plugins';
import {
  RECALL_MAX_CORRECTIONS_PER_CELL,
  AUDIO_END_BUFFER_MS as AUDIO_END_BUFFER_MS_THRESHOLD,
} from '../../specs/thresholds';

// =============================================================================
// Input (for machine creation)
// =============================================================================

export interface MemoSessionInput {
  // Identity
  readonly sessionId: string;
  readonly userId: string;

  // Spec (SSOT - replaces config)
  readonly spec: MemoSpec;

  // Services (injected)
  readonly audio: AudioPort;
  readonly clock: ClockPort;
  readonly random: RandomPort;
  readonly generator: TrialGenerator;
  readonly devLogger?: DevLoggerPort;

  // Journey integration
  readonly playMode?: 'journey' | 'free';
  readonly journeyStageId?: number;
  readonly journeyId?: string;
  /** Journey configuration snapshot (required for journey sessions) */
  readonly journeyStartLevel?: number;
  readonly journeyTargetLevel?: number;
  readonly journeyGameMode?: string;
  readonly journeyName?: string;

  // Algorithm state persistence
  readonly algorithmStatePort?: AlgorithmStatePort;

  /** Optional command bus for strict command-based event persistence. */
  readonly commandBus?: import('../../ports/command-bus-port').CommandBusPort;

  // Plugins (data in / data out)
  readonly plugins: MemoSessionPlugins;
}

// =============================================================================
// Context (Extended State)
// =============================================================================

export interface MemoSessionContext extends MemoSessionInput {
  // Trial state
  currentTrial: Trial | null;
  trialIndex: number;
  trials: Trial[];

  // Timing
  stimulusStartTime: number;
  recallStartTime: number;
  phaseEnteredAt: number;

  // Picks and fill order
  currentPicks: Map<number, SlotPicks>;
  correctionCounts: Map<string, number>;
  fillOrder: FillCell[];
  fillOrderIndex: number;

  // Adaptive params
  effectiveWindowDepth: number;
  effectiveLureProbability: number;
  effectiveTargetProbability: number;

  // Message for UI
  message: string | null;

  // Final summary
  finalSummary: MemoExtendedSummary | null;

  // Session events
  sessionEvents: GameEvent[];
  seq: number;

  // Pending persistence operations (for critical events like STARTED/ENDED)
  pendingPersistence: Promise<void>[];
}

// =============================================================================
// Events
// =============================================================================

export type MemoSessionEvent =
  | { type: 'START' }
  | { type: 'STOP' }
  | { type: 'PICK'; slotIndex: number; pick: ModalityPick; inputMethod?: 'mouse' | 'touch' }
  | { type: 'COMMIT' };

// =============================================================================
// State Value Types
// =============================================================================

export type MemoPhase = 'idle' | 'stimulus' | 'recall' | 'feedback' | 'finished';

// =============================================================================
// Snapshot Type (for UI subscription)
// =============================================================================

export interface MemoSessionSnapshot {
  // Phase actuelle
  readonly phase: MemoPhase;
  readonly phaseEnteredAt: number;

  // Trial courant
  readonly trialIndex: number;
  readonly totalTrials: number;

  // Stimulus (null si phase !== 'stimulus')
  readonly stimulus: {
    readonly position: number;
    readonly sound: string;
    readonly color: string;
  } | null;

  // Fenêtre recall
  readonly recallPrompt: {
    readonly requiredWindowDepth: number;
    readonly currentPicks: WindowPicks;
    readonly isComplete: boolean;
    readonly fillOrder: readonly FillCell[];
    readonly activeCell: FillCell | null;
    /** Correction counts per cell (key: "slot:modality", value: count). Max 3 per cell. */
    readonly correctionCounts: ReadonlyMap<string, number>;
  } | null;

  // Stats globales
  readonly stats: MemoRunningStats;

  // Config pour UI
  readonly nLevel: number;
  readonly activeModalities: readonly string[];

  // Message (instructions, etc.)
  readonly message: string | null;

  // Summary final (si finished, includes confidence metrics)
  readonly summary: MemoExtendedSummary | null;

  /** Zone adaptative actuelle (1-20), null si non adaptatif */
  readonly adaptiveZone: number | null;
}

// =============================================================================
// Timer Service Input Types
// =============================================================================

export interface StimulusTimerInput {
  context: MemoSessionContext;
  isAudioOnly: boolean;
}

export interface FeedbackTimerInput {
  context: MemoSessionContext;
}

// =============================================================================
// Constants
// =============================================================================

/** Maximum corrections allowed per cell (slot × modality) @see thresholds.ts (SSOT) */
export const MAX_CORRECTIONS_PER_CELL = RECALL_MAX_CORRECTIONS_PER_CELL;

/** Small buffer after audio ends before transitioning (ms) @see thresholds.ts (SSOT) */
export const AUDIO_END_BUFFER_MS = AUDIO_END_BUFFER_MS_THRESHOLD;
