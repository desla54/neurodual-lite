/**
 * Recall Types - Active Training Mode
 *
 * Types for the recall/active training mode where users reconstruct
 * their memory window (N, N-1, N-2, etc.) before advancing.
 *
 * RULE: Zero internal imports except from core.ts and thresholds.ts
 */

import type { Color, ModalityId, Sound } from './core';
import {
  TREND_WINDOW_SIZE as _TREND_WINDOW_SIZE,
  TREND_THRESHOLD as _TREND_THRESHOLD,
  DEFAULT_N_LEVEL,
  DEFAULT_TRIALS_COUNT_FLOW,
  GEN_TARGET_PROBABILITY_DEFAULT,
  GEN_LURE_PROBABILITY_NONE,
  TIMING_STIMULUS_RECALL_MS,
  TIMING_FEEDBACK_MS,
  RECALL_PROGRESSIVE_INITIAL_DEPTH,
  RECALL_PROGRESSIVE_EXPANSION_THRESHOLD,
  RECALL_PROGRESSIVE_CONTRACTION_THRESHOLD,
  RECALL_PROGRESSIVE_OBSERVATION_WINDOWS,
  RECALL_PROGRESSIVE_COOLDOWN_WINDOWS,
} from '../specs/thresholds';

// =============================================================================
// Picks with Discriminated Union (type-safe per modality)
// =============================================================================

/**
 * A single pick for one modality.
 * Discriminated union ensures type safety per modality.
 */
export type ModalityPick =
  | { readonly modality: 'position'; readonly value: number }
  | { readonly modality: 'audio'; readonly value: Sound }
  | { readonly modality: 'color'; readonly value: Color };

/**
 * Picks for a single slot (one distance back).
 * Optional per modality - undefined means not yet picked.
 */
export interface SlotPicks {
  readonly position?: number;
  readonly audio?: Sound;
  readonly color?: Color;
}

/**
 * Complete window state: picks indexed by slotIndex.
 * slotIndex 1 = current trial (N)
 * slotIndex 2 = previous trial (N-1)
 * slotIndex 3 = two trials back (N-2)
 * etc.
 */
export type WindowPicks = ReadonlyMap<number, SlotPicks>;

// =============================================================================
// Evaluated Picks
// =============================================================================

/**
 * Result of evaluating a single pick against expected value.
 * Computed by projector, not stored in events.
 */
export interface EvaluatedPick {
  readonly slotIndex: number;
  readonly modality: ModalityId;
  readonly picked: ModalityPick;
  readonly expected: ModalityPick;
  readonly correct: boolean;
}

// =============================================================================
// Window Result
// =============================================================================

/**
 * Result of committing a window.
 * Computed by projector from raw events.
 */
export interface WindowResult {
  readonly trialIndex: number;
  readonly windowDepth: number;
  readonly picks: readonly EvaluatedPick[];
  readonly correctCount: number;
  readonly totalCount: number;
  readonly accuracy: number;
  readonly recallDurationMs: number;
}

// =============================================================================
// Running Stats
// =============================================================================

/**
 * Stats for a single modality.
 */
export interface MemoModalityStats {
  readonly totalPicks: number;
  readonly correctPicks: number;
  readonly accuracy: number;
}

/**
 * Stats for a single slot index (distance back).
 */
export interface MemoSlotStats {
  readonly totalPicks: number;
  readonly correctPicks: number;
  readonly accuracy: number;
}

/**
 * Trend calculated from recent windows.
 * Deterministic: slope over TREND_WINDOW_SIZE windows.
 */
export type MemoTrend = 'improving' | 'stable' | 'declining';

/** @see thresholds.ts (SSOT) */
export const TREND_WINDOW_SIZE = _TREND_WINDOW_SIZE;
/** @see thresholds.ts (SSOT) */
export const TREND_THRESHOLD = _TREND_THRESHOLD;

/**
 * Running stats for recall mode.
 * Replaces d-prime based stats from classic mode.
 */
export interface MemoRunningStats {
  readonly windowsCompleted: number;
  readonly totalPicks: number;
  readonly correctPicks: number;
  readonly accuracy: number; // correctPicks / totalPicks
  readonly byModality: Record<ModalityId, MemoModalityStats>;
  readonly bySlotIndex: Record<number, MemoSlotStats>;
  readonly trend: MemoTrend;
  readonly recentAccuracies: readonly number[]; // Last N windows
}

/**
 * Create initial empty stats.
 */
export function createEmptyMemoStats(): MemoRunningStats {
  return {
    windowsCompleted: 0,
    totalPicks: 0,
    correctPicks: 0,
    accuracy: 0,
    byModality: {},
    bySlotIndex: {},
    trend: 'stable',
    recentAccuracies: [],
  };
}

// =============================================================================
// Progressive Window Config
// =============================================================================

/**
 * Configuration for progressive window expansion.
 * Start with depth 1 (N only), unlock N-1, N-2... based on performance.
 */
export interface ProgressiveWindowConfig {
  readonly enabled: boolean;
  readonly initialDepth: number; // 1 if progressive
  readonly expansionThreshold: number; // 0.80 accuracy to unlock next depth
  readonly contractionThreshold: number; // 0.50 accuracy to reduce depth
  readonly observationWindows: number; // 3-5 windows before decision
  readonly cooldownWindows: number; // 2 windows after change
}

/** @see thresholds.ts SSOT for numeric values */
export const DEFAULT_PROGRESSIVE_CONFIG: ProgressiveWindowConfig = {
  enabled: true,
  initialDepth: RECALL_PROGRESSIVE_INITIAL_DEPTH,
  expansionThreshold: RECALL_PROGRESSIVE_EXPANSION_THRESHOLD,
  contractionThreshold: RECALL_PROGRESSIVE_CONTRACTION_THRESHOLD,
  observationWindows: RECALL_PROGRESSIVE_OBSERVATION_WINDOWS,
  cooldownWindows: RECALL_PROGRESSIVE_COOLDOWN_WINDOWS,
};

// =============================================================================
// Session Config
// =============================================================================

/**
 * Feedback mode for recall.
 * - 'none': No session-level feedback (RecallFeedbackState skipped).
 *   When using 'none', the UI handles immediate feedback (e.g. slot coloring
 *   on pick) without interrupting the game flow. This is the recommended mode
 *   for a fluid user experience.
 * - 'on-commit': Show corrections via RecallFeedbackState after validating window.
 *   Pauses the game to display correct answers for feedbackDurationMs.
 */
export type MemoFeedbackMode = 'none' | 'on-commit';

/**
 * Fill order mode for recall slots.
 * - 'sequential': Fixed order from oldest (N-n) to newest (N).
 *   User fills N-2, then N-1, then N.
 * - 'random': Random order at CELL level (slot × modality).
 *   Forces true working memory - no chunking strategy possible.
 *   Example: (N, position) → (N-1, audio) → (N-2, position) → (N, audio) → etc.
 *   Anti-cheat measure: user must have complete random-access to all cells.
 */
export type MemoFillOrderMode = 'sequential' | 'random';

/**
 * A single cell in the recall grid (slot × modality).
 * Used for cell-level fill order in random mode.
 */
export interface FillCell {
  readonly slot: number;
  readonly modality: ModalityId;
}

/**
 * Configuration for a recall session.
 */
export interface MemoSessionConfig {
  readonly nLevel: number;
  readonly activeModalities: readonly ModalityId[];
  readonly trialsCount: number;
  readonly stimulusDurationSeconds: number;
  readonly feedbackMode: MemoFeedbackMode;
  readonly feedbackDurationMs: number; // 1500ms default
  readonly progressiveWindow: ProgressiveWindowConfig;
  readonly scoringVersion: string; // For reproducibility
  readonly targetProbability: number;
  readonly lureProbability: number;
  readonly fillOrderMode: MemoFillOrderMode;
  /**
   * Disable window depth adaptation (expansion/contraction based on performance).
   * Use this for Journey mode where difficulty must stay fixed.
   */
  readonly disableWindowAdaptation?: boolean;
  /**
   * Initial lure probability for the AdaptiveTrialGenerator.
   * Higher values = more lures = harder session.
   * Used in Journey mode to increase difficulty after a good first session.
   * @default 0.15
   */
  readonly initialLureProbability?: number;
}

/** @see thresholds.ts SSOT for numeric values, aligns with DualMemoSpec */
export const DEFAULT_RECALL_SESSION_CONFIG: Omit<MemoSessionConfig, 'scoringVersion'> = {
  nLevel: DEFAULT_N_LEVEL,
  activeModalities: ['position', 'audio'],
  trialsCount: DEFAULT_TRIALS_COUNT_FLOW,
  stimulusDurationSeconds: TIMING_STIMULUS_RECALL_MS / 1000,
  feedbackMode: 'on-commit',
  feedbackDurationMs: TIMING_FEEDBACK_MS,
  progressiveWindow: DEFAULT_PROGRESSIVE_CONFIG,
  targetProbability: GEN_TARGET_PROBABILITY_DEFAULT,
  lureProbability: GEN_LURE_PROBABILITY_NONE,
  fillOrderMode: 'sequential',
};

// =============================================================================
// Session Summary
// =============================================================================

/**
 * Complete summary of a recall session.
 * Projected from events.
 */
export interface MemoSessionSummary {
  readonly sessionId: string;
  readonly nLevel: number;
  readonly totalTrials: number;
  readonly windowResults: readonly WindowResult[];
  readonly finalStats: MemoRunningStats;
  readonly durationMs: number;
  readonly avgRecallTimeMs: number;
  readonly completed: boolean;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get required window depth for a given trial index.
 * Shared logic for session, projector, and UI.
 *
 * @param trialIndex Current trial index (0-based)
 * @param effectiveDepth Current effective depth (from progressive or nLevel)
 * @returns Number of slots to fill (1..effectiveDepth)
 */
export function getWindowDepthForTrial(trialIndex: number, effectiveDepth: number): number {
  // Can't recall more trials than we've seen
  // trialIndex 0 → depth 1 (only current)
  // trialIndex 1 → depth min(2, effective)
  // etc.
  return Math.min(trialIndex + 1, effectiveDepth);
}

/**
 * Get required cells for a window.
 * Returns array of [slotIndex, modality] tuples.
 */
export function getRequiredCells(
  trialIndex: number,
  windowDepth: number,
  modalities: readonly ModalityId[],
): readonly [number, ModalityId][] {
  const cells: [number, ModalityId][] = [];
  const actualDepth = getWindowDepthForTrial(trialIndex, windowDepth);

  for (let slot = 1; slot <= actualDepth; slot++) {
    for (const modality of modalities) {
      cells.push([slot, modality]);
    }
  }

  return cells;
}

/**
 * Check if window is complete (all required cells filled).
 */
export function isWindowComplete(
  picks: WindowPicks | Map<number, SlotPicks>,
  trialIndex: number,
  windowDepth: number,
  modalities: readonly ModalityId[],
): boolean {
  const requiredCells = getRequiredCells(trialIndex, windowDepth, modalities);

  for (const [slotIndex, modality] of requiredCells) {
    const slotPicks = picks.get(slotIndex);
    if (!slotPicks) return false;

    const value = slotPicks[modality as keyof SlotPicks];
    if (value === undefined) return false;
  }

  return true;
}
