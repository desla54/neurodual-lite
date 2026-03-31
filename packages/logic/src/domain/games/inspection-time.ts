/**
 * Inspection Time — pure game logic.
 *
 * Psychophysical speed task (Vickers et al., 1972):
 * - Two vertical lines of different lengths shown briefly, then masked
 * - Player identifies which line is longer
 * - Adaptive staircase: 2-down/1-up targeting ~70.7% threshold
 * - Display time starts at 200ms, step = 17ms, min = 17ms
 * - Measures inspection time (IT) — speed of early visual processing
 */

// =============================================================================
// Constants
// =============================================================================

export const DEFAULT_TOTAL_TRIALS = 40;
export const INITIAL_DISPLAY_MS = 200;
export const STEP_MS = 17;
export const MIN_DISPLAY_MS = 17;

// =============================================================================
// Types
// =============================================================================

export interface InspectionTrial {
  longerSide: 'left' | 'right';
  displayMs: number;
}

export interface InspectionTrialResult {
  trial: InspectionTrial;
  response: 'left' | 'right' | null;
  correct: boolean;
  displayMs: number;
  timedOut: boolean;
}

export interface InspectionTimeSummary {
  correctTrials: number;
  totalTrials: number;
  /** 0-100 */
  accuracy: number;
  /** Average display time of last N trials — convergence zone estimate */
  thresholdMs: number;
  /** Minimum display time that got a correct response */
  minCorrectMs: number;
  /** Final staircase display time */
  finalDisplayMs: number;
  durationMs: number;
}

// =============================================================================
// Staircase
// =============================================================================

export interface StaircaseState {
  displayMs: number;
  consecutiveCorrect: number;
}

/**
 * Create a fresh staircase state.
 */
export function createStaircase(initialDisplayMs = INITIAL_DISPLAY_MS): StaircaseState {
  return { displayMs: initialDisplayMs, consecutiveCorrect: 0 };
}

/**
 * Update staircase after a trial result.
 * 2-down / 1-up rule: decrease after 2 consecutive correct, increase after 1 wrong.
 */
export function updateStaircase(
  state: StaircaseState,
  correct: boolean,
  stepMs = STEP_MS,
  minMs = MIN_DISPLAY_MS,
  maxMs = INITIAL_DISPLAY_MS * 2,
): StaircaseState {
  if (correct) {
    const newConsecutive = state.consecutiveCorrect + 1;
    if (newConsecutive >= 2) {
      return {
        displayMs: Math.max(minMs, state.displayMs - stepMs),
        consecutiveCorrect: 0,
      };
    }
    return { displayMs: state.displayMs, consecutiveCorrect: newConsecutive };
  }
  // Wrong: 1-up
  return {
    displayMs: Math.min(maxMs, state.displayMs + stepMs),
    consecutiveCorrect: 0,
  };
}

// =============================================================================
// Trial Generation
// =============================================================================

/**
 * Generate a single trial with the current display time.
 */
export function generateTrial(displayMs: number, rng: () => number = Math.random): InspectionTrial {
  return {
    longerSide: rng() < 0.5 ? 'left' : 'right',
    displayMs,
  };
}

// =============================================================================
// Summary
// =============================================================================

/**
 * Compute session summary from trial results.
 * @param convergenceWindow Number of final trials for threshold estimate (default: 10)
 */
export function computeSummary(
  results: InspectionTrialResult[],
  finalDisplayMs: number,
  durationMs: number,
  convergenceWindow = 10,
): InspectionTimeSummary {
  const correctTrials = results.filter((r) => r.correct).length;
  const accuracy = results.length > 0 ? Math.round((correctTrials / results.length) * 100) : 0;

  const lastN = results.slice(-convergenceWindow);
  const thresholdMs =
    lastN.length > 0
      ? Math.round(lastN.reduce((sum, r) => sum + r.displayMs, 0) / lastN.length)
      : finalDisplayMs;

  const correctResults = results.filter((r) => r.correct);
  const minCorrectMs =
    correctResults.length > 0
      ? correctResults.reduce((min, r) => Math.min(min, r.displayMs), Number.POSITIVE_INFINITY)
      : 0;

  return {
    correctTrials,
    totalTrials: results.length,
    accuracy,
    thresholdMs,
    minCorrectMs: minCorrectMs === Number.POSITIVE_INFINITY ? 0 : minCorrectMs,
    finalDisplayMs,
    durationMs,
  };
}
