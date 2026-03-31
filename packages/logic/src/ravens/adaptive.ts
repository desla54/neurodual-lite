/**
 * Adaptive difficulty for Raven's Matrices.
 *
 * Accelerated 2-up/1-down staircase procedure (Levitt 1971):
 * - 2 consecutive correct → level up by `stepSize`
 * - 1 incorrect → level down by `stepSize`
 * - Converges to ~70.7% accuracy (standard psychophysics)
 *
 * Step size schedule (accelerated staircase):
 * - 0 reversals: step = 4 (coarse search phase)
 * - 1 reversal:  step = 2 (narrowing phase)
 * - 2+ reversals: step = 1 (fine precision phase)
 *
 * This allows the protocol to reach level 30 from level 1 in ~15 trials
 * during the coarse phase, then refine with single-level precision.
 *
 * Convergence: reversals >= 6 OR trialCount >= maxTrials
 * Ceiling estimate: mean of levels at last 4 reversals (fine phase only)
 */

import type { ReferenceProfile } from './types';
import { PROFILE_MAX_LEVELS } from './types';

// ---------------------------------------------------------------------------
// Direction tracking for reversal detection
// ---------------------------------------------------------------------------

type Direction = 'up' | 'down' | null;

// ---------------------------------------------------------------------------
// Step size schedule
// ---------------------------------------------------------------------------

const STEP_SCHEDULE: readonly number[] = [4, 2, 1];

/** Get step size based on number of reversals so far. */
function getStepSize(reversals: number): number {
  if (reversals >= STEP_SCHEDULE.length) return STEP_SCHEDULE[STEP_SCHEDULE.length - 1]!;
  return STEP_SCHEDULE[reversals]!;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface AdaptiveState {
  /** Current difficulty level */
  level: number;
  /** Consecutive correct count at current level */
  consecutiveCorrect: number;
  /** Minimum level */
  minLevel: number;
  /** Maximum level */
  maxLevel: number;
  /** Number of completed trials */
  trialCount: number;
  /** Number of direction reversals (up→down or down→up) */
  reversals: number;
  /** Highest level reached during the run */
  peakLevel: number;
  /** Maximum number of trials before forced stop */
  maxTrials: number;
  /** Last direction of level change (null = no change yet) */
  lastDirection: Direction;
  /** Levels at which reversals occurred (for ceiling estimate) */
  reversalLevels: number[];
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_MAX_TRIALS = 30;
const REVERSALS_FOR_CONVERGENCE = 6;
const REVERSAL_WINDOW = 4; // last N reversal levels used for ceiling estimate

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createAdaptiveState(startLevel = 1, minLevel = 1, maxLevel = 10): AdaptiveState {
  const level = Math.max(minLevel, Math.min(maxLevel, startLevel));
  return {
    level,
    consecutiveCorrect: 0,
    minLevel,
    maxLevel,
    trialCount: 0,
    reversals: 0,
    peakLevel: level,
    maxTrials: DEFAULT_MAX_TRIALS,
    lastDirection: null,
    reversalLevels: [],
  };
}

/** Profile-aware factory: sets maxLevel from PROFILE_MAX_LEVELS. */
export function createProfileAdaptiveState(
  profile: ReferenceProfile,
  startLevel = 1,
  maxTrials = DEFAULT_MAX_TRIALS,
): AdaptiveState {
  const maxLevel = PROFILE_MAX_LEVELS[profile];
  return { ...createAdaptiveState(startLevel, 1, maxLevel), maxTrials };
}

// ---------------------------------------------------------------------------
// Core step
// ---------------------------------------------------------------------------

/**
 * Pure function: returns the next adaptive state after a trial result.
 * Uses accelerated step sizes: large steps early, fine steps after reversals.
 */
export function adaptDifficulty(state: AdaptiveState, correct: boolean): AdaptiveState {
  const trialCount = state.trialCount + 1;
  const step = getStepSize(state.reversals);
  let level = state.level;
  let consecutiveCorrect = state.consecutiveCorrect;
  let direction: Direction = null;

  if (correct) {
    consecutiveCorrect += 1;
    if (consecutiveCorrect >= 2) {
      const newLevel = Math.min(state.maxLevel, level + step);
      if (newLevel !== level) direction = 'up';
      level = newLevel;
      consecutiveCorrect = 0;
    }
  } else {
    const newLevel = Math.max(state.minLevel, level - step);
    if (newLevel !== level) direction = 'down';
    level = newLevel;
    consecutiveCorrect = 0;
  }

  // Reversal detection
  let { reversals, reversalLevels, lastDirection } = state;
  if (direction !== null && lastDirection !== null && direction !== lastDirection) {
    reversals += 1;
    reversalLevels = [...reversalLevels, state.level];
  }
  if (direction !== null) lastDirection = direction;

  return {
    ...state,
    level,
    consecutiveCorrect,
    trialCount,
    reversals,
    peakLevel: Math.max(state.peakLevel, level),
    lastDirection,
    reversalLevels,
  };
}

// ---------------------------------------------------------------------------
// Convergence & ceiling
// ---------------------------------------------------------------------------

/** Whether the adaptive run should stop. */
export function isConverged(state: AdaptiveState): boolean {
  return state.reversals >= REVERSALS_FOR_CONVERGENCE || state.trialCount >= state.maxTrials;
}

/**
 * Estimate the ceiling level from reversal history.
 * Uses the mean of the last REVERSAL_WINDOW reversal levels,
 * falling back to peakLevel if insufficient reversals.
 */
export function getCeilingEstimate(state: AdaptiveState): number {
  if (state.reversalLevels.length === 0) return state.peakLevel;
  const window = state.reversalLevels.slice(-REVERSAL_WINDOW);
  const mean = window.reduce((a, b) => a + b, 0) / window.length;
  return Math.round(mean);
}

// ---------------------------------------------------------------------------
// Measure result (composite scoring)
// ---------------------------------------------------------------------------

export interface MeasureResult {
  /** Estimated ceiling level (1-30) */
  ceilingLevel: number;
  /** Accuracy at levels near ceiling (±1) */
  accuracyAtCeiling: number;
  /** Mean RT (ms) at levels near ceiling (±1) */
  meanRtAtCeiling: number;
  /** Total trials completed */
  totalTrials: number;
  /** Number of reversals */
  reversals: number;
  /** Peak level reached */
  peakLevel: number;
}

export interface TrialRecord {
  level: number;
  correct: boolean;
  rt: number;
}

/**
 * Compute composite measure result from a completed adaptive run.
 */
export function computeMeasureResult(state: AdaptiveState, trials: TrialRecord[]): MeasureResult {
  const ceilingLevel = getCeilingEstimate(state);

  // Filter trials near ceiling (±1 level)
  const nearCeiling = trials.filter(
    (t) => t.level >= ceilingLevel - 1 && t.level <= ceilingLevel + 1,
  );

  const accuracyAtCeiling =
    nearCeiling.length > 0 ? nearCeiling.filter((t) => t.correct).length / nearCeiling.length : 0;

  const meanRtAtCeiling =
    nearCeiling.length > 0 ? nearCeiling.reduce((sum, t) => sum + t.rt, 0) / nearCeiling.length : 0;

  return {
    ceilingLevel,
    accuracyAtCeiling,
    meanRtAtCeiling,
    totalTrials: state.trialCount,
    reversals: state.reversals,
    peakLevel: state.peakLevel,
  };
}
