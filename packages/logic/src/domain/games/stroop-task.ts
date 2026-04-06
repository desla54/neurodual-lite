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
 *
 * - 50% congruent / 50% incongruent
 * - Classic stroop: all ink-rule
 * - Stroop-flex: 50% ink-rule, 50% word-rule (shuffled)
 * - Shuffled via Fisher-Yates
 */
export function generateTrials(
  count: number,
  colorWords: { id: ColorId; word: string }[],
  variant: StroopModeId = 'stroop',
  rng: () => number = Math.random,
): StroopTrial[] {
  const isFlex = variant === 'stroop-flex';
  if (colorWords.length === 0) return [];

  // Assign rules: 50/50 ink/word for flex, all ink for classic
  const rules: StroopRule[] = [];
  if (isFlex) {
    const halfWord = Math.floor(count / 2);
    for (let i = 0; i < halfWord; i++) rules.push('word');
    for (let i = halfWord; i < count; i++) rules.push('ink');
    for (let i = rules.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const currentRule = rules[i];
      const swapRule = rules[j];
      if (!currentRule || !swapRule) {
        continue;
      }
      [rules[i], rules[j]] = [swapRule, currentRule];
    }
  }

  const trials: StroopTrial[] = [];
  const half = Math.floor(count / 2);
  let congruentCount = 0;

  for (let i = 0; i < count; i++) {
    const rule = isFlex ? rules[i] : 'ink';
    if (!rule) {
      continue;
    }

    if (congruentCount < half) {
      const c = colorWords[i % colorWords.length];
      if (!c) {
        continue;
      }
      trials.push({ word: c.word, inkColor: c.id, wordColor: c.id, congruent: true, rule });
      congruentCount++;
    } else {
      const wordIdx = i % colorWords.length;
      let inkIdx = (wordIdx + 1 + Math.floor(rng() * (colorWords.length - 1))) % colorWords.length;
      if (inkIdx === wordIdx) inkIdx = (inkIdx + 1) % colorWords.length;
      const wordC = colorWords[wordIdx];
      const inkC = colorWords[inkIdx];
      if (!wordC || !inkC) {
        continue;
      }
      trials.push({
        word: wordC.word,
        inkColor: inkC.id,
        wordColor: wordC.id,
        congruent: false,
        rule,
      });
    }
  }

  // Fisher-Yates shuffle
  for (let i = trials.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const currentTrial = trials[i];
    const swapTrial = trials[j];
    if (!currentTrial || !swapTrial) {
      continue;
    }
    [trials[i], trials[j]] = [swapTrial, currentTrial];
  }

  return trials;
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
