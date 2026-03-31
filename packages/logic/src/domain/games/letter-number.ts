/**
 * Letter-Number Sequencing — pure game logic.
 *
 * Gold et al. (1997):
 * - Present a mixed sequence of letters and numbers (e.g., G-3-A-7)
 * - Player must reorder: numbers ascending, then letters alphabetically (3-7-A-G)
 * - Span increases on success, stays on failure
 * - Ends after 2 consecutive failures at same span, span >= MAX_SPAN, or maxTrials
 * - Measures working memory manipulation capacity
 */

// =============================================================================
// Constants
// =============================================================================

export const DEFAULT_START_SPAN = 3;
export const MAX_SPAN = 9;
export const MAX_CONSECUTIVE_FAILURES = 2;
export const DEFAULT_MAX_TRIALS = 14;

/** Letters excluding I and O to avoid confusion with 1 and 0. */
export const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'.split('');
export const NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

// =============================================================================
// Types
// =============================================================================

export interface TrialResult {
  trialIndex: number;
  span: number;
  sequence: string[];
  correctAnswer: string[];
  playerInput: string[];
  correct: boolean;
  responseTimeMs: number;
}

export interface SpanState {
  currentSpan: number;
  consecutiveFailures: number;
  maxSpanReached: number;
  trialIndex: number;
  finished: boolean;
}

// =============================================================================
// Sequence Generation
// =============================================================================

/**
 * Generate a mixed sequence of letters and numbers of the given length.
 * Guarantees at least 1 letter and 1 number (when length >= 2).
 * No duplicate items in the sequence.
 */
export function generateMixedSequence(length: number, rng: () => number = Math.random): string[] {
  if (length <= 0) return [];

  const numLetters = Math.max(1, Math.floor(length / 2));
  const numNumbers = length - numLetters;

  // Pick unique letters
  const shuffledLetters = [...LETTERS].sort(() => rng() - 0.5).slice(0, numLetters);
  // Pick unique numbers
  const shuffledNumbers = [...NUMBERS]
    .sort(() => rng() - 0.5)
    .slice(0, numNumbers)
    .map(String);

  const combined = [...shuffledLetters, ...shuffledNumbers];

  // Fisher-Yates shuffle
  for (let i = combined.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [combined[i], combined[j]] = [combined[j] as string, combined[i] as string];
  }
  return combined;
}

// =============================================================================
// Correct Order
// =============================================================================

/**
 * Compute the correct reordering: numbers ascending, then letters alphabetically.
 */
export function getCorrectOrder(sequence: string[]): string[] {
  const numbers = sequence.filter((s) => /^\d$/.test(s)).sort((a, b) => Number(a) - Number(b));
  const letters = sequence.filter((s) => /^[A-Z]$/i.test(s)).sort();
  return [...numbers, ...letters];
}

// =============================================================================
// Recall Validation
// =============================================================================

/**
 * Validate player's reordering against the correct answer.
 */
export function validateRecall(sequence: string[], playerInput: string[]): boolean {
  const correct = getCorrectOrder(sequence);
  if (playerInput.length !== correct.length) return false;
  return playerInput.every((item, i) => item === correct[i]);
}

// =============================================================================
// Span State Machine
// =============================================================================

/**
 * Create the initial span state.
 */
export function createInitialState(startSpan: number = DEFAULT_START_SPAN): SpanState {
  return {
    currentSpan: Math.max(2, Math.min(MAX_SPAN, startSpan)),
    consecutiveFailures: 0,
    maxSpanReached: 0,
    trialIndex: 0,
    finished: false,
  };
}

/**
 * Advance the span state after a trial.
 * Returns a new state (immutable).
 *
 * Rules:
 * - On success: consecutiveFailures resets to 0, span increases by 1 (up to MAX_SPAN)
 * - On failure: consecutiveFailures increments, span stays
 * - Session ends when:
 *   - consecutiveFailures >= MAX_CONSECUTIVE_FAILURES
 *   - currentSpan >= MAX_SPAN (after a success at MAX_SPAN)
 *   - trialIndex >= maxTrials
 */
export function advanceState(
  state: SpanState,
  correct: boolean,
  maxTrials: number = DEFAULT_MAX_TRIALS,
): SpanState {
  if (state.finished) return state;

  const newTrialIndex = state.trialIndex + 1;
  const newConsecFailures = correct ? 0 : state.consecutiveFailures + 1;
  const newMaxSpan = correct
    ? Math.max(state.maxSpanReached, state.currentSpan)
    : state.maxSpanReached;

  // Check if session should end
  const sessionEnded =
    newConsecFailures >= MAX_CONSECUTIVE_FAILURES ||
    (correct && state.currentSpan >= MAX_SPAN) ||
    newTrialIndex >= maxTrials;

  if (sessionEnded) {
    return {
      currentSpan: state.currentSpan,
      consecutiveFailures: newConsecFailures,
      maxSpanReached: newMaxSpan,
      trialIndex: newTrialIndex,
      finished: true,
    };
  }

  const nextSpan = correct ? Math.min(state.currentSpan + 1, MAX_SPAN) : state.currentSpan;

  return {
    currentSpan: nextSpan,
    consecutiveFailures: newConsecFailures,
    maxSpanReached: newMaxSpan,
    trialIndex: newTrialIndex,
    finished: false,
  };
}

// =============================================================================
// Summary
// =============================================================================

export interface LetterNumberSummary {
  totalTrials: number;
  correctTrials: number;
  accuracy: number;
  maxSpan: number;
  meanRtMs: number;
}

/**
 * Compute a summary from trial results.
 */
export function computeSummary(results: TrialResult[]): LetterNumberSummary {
  const correct = results.filter((r) => r.correct).length;
  const total = results.length;
  const maxSpan = Math.max(0, ...results.filter((r) => r.correct).map((r) => r.span));
  const meanRtMs =
    total > 0 ? Math.round(results.reduce((sum, r) => sum + r.responseTimeMs, 0) / total) : 0;

  return {
    totalTrials: total,
    correctTrials: correct,
    accuracy: total > 0 ? Math.round((correct / total) * 100) : 0,
    maxSpan,
    meanRtMs,
  };
}
