/**
 * Stroop Task — pure game logic extracted from the training page.
 *
 * Classic Stroop (1935):
 * - Color words displayed in different ink colors
 * - Congruent: word "RED" in red ink
 * - Incongruent: word "RED" in blue ink
 * - Player must respond to INK COLOR (not word meaning) under "ink" rule
 * - Stroop interference = RT(incongruent) - RT(congruent)
 * - Word trap: responding with the word meaning instead of ink color
 *
 * Stroop-Flex variant:
 * - Rule alternates between "ink" (respond to ink color) and "word" (respond to word meaning)
 */

// =============================================================================
// Constants
// =============================================================================

export const DEFAULT_TOTAL_TRIALS = 24;
export const STIMULUS_TIMEOUT_MS = 2500;
export const COLORS = ['red', 'blue', 'green', 'yellow'] as const;

// =============================================================================
// Types
// =============================================================================

export type ColorId = 'red' | 'blue' | 'green' | 'yellow';
export type StroopRule = 'ink' | 'word';
export type StroopModeId = 'stroop' | 'stroop-flex';

export interface StroopTrial {
  /** The text displayed (e.g. "RED") */
  word: string;
  /** The ink color of the text */
  inkColor: ColorId;
  /** The color that the word spells */
  wordColor: ColorId;
  /** Whether word and ink match */
  congruent: boolean;
  /** Which dimension to respond to */
  rule: StroopRule;
}

export interface TrialResult {
  trial: StroopTrial;
  response: ColorId | null;
  correct: boolean;
  rt: number;
  timedOut: boolean;
}

// =============================================================================
// Trial Generation
// =============================================================================

/**
 * Generate a balanced set of Stroop trials.
 * - First half: congruent trials (word and ink match)
 * - Second half: incongruent trials (word and ink differ)
 * - Shuffled via Fisher-Yates
 * - For stroop-flex: every 4th trial uses "word" rule; rest use "ink"
 */
export function generateTrials(
  count: number,
  colorWords: { id: ColorId; word: string }[],
  variant: StroopModeId = 'stroop',
  rng: () => number = Math.random,
): StroopTrial[] {
  const baseTrials: Omit<StroopTrial, 'rule'>[] = [];
  const half = Math.floor(count / 2);

  // Congruent trials
  for (let i = 0; i < half; i++) {
    const idx = i % colorWords.length;
    const c = colorWords[idx];
    if (!c) continue;
    baseTrials.push({ word: c.word, inkColor: c.id, wordColor: c.id, congruent: true });
  }

  // Incongruent trials
  for (let i = 0; i < count - half; i++) {
    const wordIdx = i % colorWords.length;
    let inkIdx = (wordIdx + 1 + (i % (colorWords.length - 1))) % colorWords.length;
    if (inkIdx === wordIdx) inkIdx = (inkIdx + 1) % colorWords.length;
    const wordC = colorWords[wordIdx];
    const inkC = colorWords[inkIdx];
    if (!wordC || !inkC) continue;
    baseTrials.push({
      word: wordC.word,
      inkColor: inkC.id,
      wordColor: wordC.id,
      congruent: false,
    });
  }

  // Fisher-Yates shuffle
  for (let i = baseTrials.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = baseTrials[i];
    const b = baseTrials[j];
    if (!a || !b) continue;
    [baseTrials[i], baseTrials[j]] = [b, a];
  }

  return baseTrials.map((trial, index) => ({
    ...trial,
    rule: variant === 'stroop-flex' && index % 4 === 0 ? 'word' : 'ink',
  }));
}

// =============================================================================
// Response Validation
// =============================================================================

/**
 * Get the expected (correct) response color for a trial.
 * Under "ink" rule: respond with ink color.
 * Under "word" rule: respond with word color.
 */
export function getExpectedResponse(trial: StroopTrial): ColorId {
  return trial.rule === 'ink' ? trial.inkColor : trial.wordColor;
}

/**
 * Check if a response is correct.
 */
export function isResponseCorrect(trial: StroopTrial, response: ColorId | null): boolean {
  if (response === null) return false;
  return response === getExpectedResponse(trial);
}

// =============================================================================
// Word Trap Detection
// =============================================================================

/**
 * Detect if a response is a "word trap" — the player responded with the word
 * meaning instead of the ink color on an incongruent ink-rule trial.
 */
export function isWordTrap(trial: StroopTrial, response: ColorId | null): boolean {
  if (response === null) return false;
  if (trial.congruent) return false;
  if (trial.rule !== 'ink') return false;
  return response === trial.wordColor;
}

// =============================================================================
// Stroop Interference
// =============================================================================

/**
 * Compute Stroop interference effect.
 * = mean RT of correct incongruent trials - mean RT of correct congruent trials.
 *
 * For stroop-flex, only ink-rule trials are included in the congruency calculation.
 * Returns 0 if either pool is empty.
 */
export function computeInterference(
  results: TrialResult[],
  variant: StroopModeId = 'stroop',
): number {
  const pool = variant === 'stroop-flex' ? results.filter((r) => r.trial.rule === 'ink') : results;

  const congruentRTs = pool
    .filter((r) => r.trial.congruent && !r.timedOut && r.correct)
    .map((r) => r.rt);
  const incongruentRTs = pool
    .filter((r) => !r.trial.congruent && !r.timedOut && r.correct)
    .map((r) => r.rt);

  if (congruentRTs.length === 0 || incongruentRTs.length === 0) return 0;

  const meanCongruent = congruentRTs.reduce((a, b) => a + b, 0) / congruentRTs.length;
  const meanIncongruent = incongruentRTs.reduce((a, b) => a + b, 0) / incongruentRTs.length;

  return Math.round(meanIncongruent - meanCongruent);
}

// =============================================================================
// Summary
// =============================================================================

export interface StroopSummary {
  totalTrials: number;
  correctTrials: number;
  accuracy: number;
  avgRT: number;
  congruencyEffect: number;
  wordTraps: number;
}

/**
 * Compute a full session summary.
 */
export function computeSummary(
  results: TrialResult[],
  variant: StroopModeId = 'stroop',
): StroopSummary {
  const correctTrials = results.filter((r) => r.correct).length;
  const accuracy = results.length > 0 ? Math.round((correctTrials / results.length) * 100) : 0;

  const respondedRTs = results.filter((r) => !r.timedOut).map((r) => r.rt);
  const avgRT =
    respondedRTs.length > 0
      ? Math.round(respondedRTs.reduce((a, b) => a + b, 0) / respondedRTs.length)
      : 0;

  const congruencyEffect = computeInterference(results, variant);

  const wordTraps = results.filter((r) => isWordTrap(r.trial, r.response)).length;

  return {
    totalTrials: results.length,
    correctTrials,
    accuracy,
    avgRT,
    congruencyEffect,
    wordTraps,
  };
}
