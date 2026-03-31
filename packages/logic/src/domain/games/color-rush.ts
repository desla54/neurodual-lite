/**
 * Color Rush — pure game logic extracted from the training page.
 *
 * Fast-paced Stroop-like color sorting game testing inhibition and speed:
 * - A colored word appears (e.g., the word "BLEU" written in red ink)
 * - Player must identify the INK COLOR (not the word)
 * - Congruent trials (30%): word matches ink -> easier
 * - Incongruent trials (70%): word differs from ink -> harder (Stroop interference)
 * - Speed pressure: stimulus timeout decreases over trials
 */

// =============================================================================
// Constants
// =============================================================================

export const INITIAL_STIMULUS_TIMEOUT_MS = 2500;
export const MIN_STIMULUS_TIMEOUT_MS = 1000;
export const TIMEOUT_DECREASE_MS = 50;
export const TIMEOUT_DECREASE_EVERY = 5;
export const CONGRUENT_RATIO = 0.3;
export const DEFAULT_TOTAL_TRIALS = 40;

// =============================================================================
// Types
// =============================================================================

export type ColorId = 'red' | 'blue' | 'green' | 'yellow';

export interface ColorDef {
  id: ColorId;
  word: string;
}

export const ALL_COLORS: ColorDef[] = [
  { id: 'red', word: 'ROUGE' },
  { id: 'blue', word: 'BLEU' },
  { id: 'green', word: 'VERT' },
  { id: 'yellow', word: 'JAUNE' },
];

export interface Trial {
  word: string;
  inkColor: ColorId;
  wordColor: ColorId;
  congruent: boolean;
  distractors: string[] | null;
}

export interface TrialResult {
  trialIndex: number;
  trial: Trial;
  response: ColorId | null;
  correct: boolean;
  responseTimeMs: number;
  timedOut: boolean;
  congruent: boolean;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Get the available colors based on nLevel.
 * nLevel 1: 3 colors (red, blue, green)
 * nLevel 2+: 4 colors (red, blue, green, yellow)
 */
export function getAvailableColors(nLevel: number): ColorDef[] {
  if (nLevel <= 1) return ALL_COLORS.slice(0, 3);
  return ALL_COLORS;
}

/**
 * Generate a single trial.
 * @param colors - available color definitions
 * @param nLevel - difficulty level (3 = shape distractors)
 * @param rng - optional random function for testing (defaults to Math.random)
 */
export function generateTrial(
  colors: ColorDef[],
  nLevel: number,
  rng: () => number = Math.random,
): Trial {
  const isCongruent = rng() < CONGRUENT_RATIO;
  const inkColorDef = colors[Math.floor(rng() * colors.length)] as ColorDef;

  let wordColorDef: ColorDef;
  if (isCongruent) {
    wordColorDef = inkColorDef;
  } else {
    const others = colors.filter((c) => c.id !== inkColorDef.id);
    wordColorDef = others[Math.floor(rng() * others.length)] as ColorDef;
  }

  let distractors: string[] | null = null;
  if (nLevel >= 3) {
    const DISTRACTOR_SHAPES = ['●', '■', '▲', '◆'] as const;
    const count = 2 + Math.floor(rng() * 3);
    distractors = Array.from(
      { length: count },
      () => DISTRACTOR_SHAPES[Math.floor(rng() * DISTRACTOR_SHAPES.length)] as string,
    );
  }

  return {
    word: wordColorDef.word,
    inkColor: inkColorDef.id,
    wordColor: wordColorDef.id,
    congruent: isCongruent,
    distractors,
  };
}

/**
 * Get stimulus timeout for a given trial index.
 * Starts at INITIAL_STIMULUS_TIMEOUT_MS, decreases by TIMEOUT_DECREASE_MS
 * every TIMEOUT_DECREASE_EVERY trials, down to MIN_STIMULUS_TIMEOUT_MS.
 */
export function getStimulusTimeout(trialIndex: number): number {
  const decreases = Math.floor(trialIndex / TIMEOUT_DECREASE_EVERY);
  return Math.max(
    MIN_STIMULUS_TIMEOUT_MS,
    INITIAL_STIMULUS_TIMEOUT_MS - decreases * TIMEOUT_DECREASE_MS,
  );
}

/**
 * Validate a response: correct answer is the ink color.
 */
export function validateResponse(trial: Trial, response: ColorId): boolean {
  return response === trial.inkColor;
}

/**
 * Compute session summary from trial results.
 */
export function computeSummary(results: TrialResult[]) {
  const total = results.length;
  const correctTrials = results.filter((r) => r.correct).length;
  const accuracy = total > 0 ? correctTrials / total : 0;

  const validRts = results.filter((r) => !r.timedOut);
  const meanRtMs =
    validRts.length > 0 ? validRts.reduce((s, r) => s + r.responseTimeMs, 0) / validRts.length : 0;

  const congruent = results.filter((r) => r.congruent);
  const incongruent = results.filter((r) => !r.congruent);

  const congruentAcc =
    congruent.length > 0 ? congruent.filter((r) => r.correct).length / congruent.length : 0;
  const incongruentAcc =
    incongruent.length > 0 ? incongruent.filter((r) => r.correct).length / incongruent.length : 0;

  const congruentRts = congruent.filter((r) => !r.timedOut && r.correct);
  const incongruentRts = incongruent.filter((r) => !r.timedOut && r.correct);

  const meanCongruentRt =
    congruentRts.length > 0
      ? congruentRts.reduce((s, r) => s + r.responseTimeMs, 0) / congruentRts.length
      : 0;
  const meanIncongruentRt =
    incongruentRts.length > 0
      ? incongruentRts.reduce((s, r) => s + r.responseTimeMs, 0) / incongruentRts.length
      : 0;

  const congruencyEffectMs = meanIncongruentRt - meanCongruentRt;
  const timeouts = results.filter((r) => r.timedOut).length;

  return {
    total,
    correctTrials,
    accuracy,
    meanRtMs,
    congruentAcc,
    incongruentAcc,
    congruencyEffectMs,
    timeouts,
    congruentTrials: congruent.length,
    incongruentTrials: incongruent.length,
  };
}
