/**
 * DSST (Digit Symbol Substitution Test) — pure game logic.
 *
 * Processing speed task (Wechsler, 1955):
 * - A fixed key maps 9 digits to 9 symbols
 * - A digit is displayed, player selects the matching symbol
 * - 60-second timed session, score = total correct
 * - Measures processing speed and associative learning
 */

// =============================================================================
// Constants
// =============================================================================

export const SESSION_DURATION_MS = 60_000;
export const SYMBOLS = ['▲', '○', '□', '◇', '★', '⬡', '◈', '⊕', '⊗'] as const;
export const DIGIT_SYMBOL_KEY: readonly { digit: number; symbol: string }[] = SYMBOLS.map(
  (s, i) => ({
    digit: i + 1,
    symbol: s,
  }),
);

// =============================================================================
// Types
// =============================================================================

export interface DsstTrialResult {
  digit: number;
  correctSymbol: string;
  response: string | null;
  correct: boolean;
  rt: number;
}

export interface DsstSummary {
  correctTrials: number;
  totalAttempts: number;
  /** 0-100 */
  accuracy: number;
  /** Mean RT for correct responses, in ms */
  avgRT: number;
  /** Projected correct items per minute */
  itemsPerMinute: number;
  durationMs: number;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Pick a random digit 1-9, optionally excluding one value (to avoid consecutive repeats).
 */
export function pickRandomDigit(exclude?: number, rng: () => number = Math.random): number {
  let d: number;
  do {
    d = Math.floor(rng() * 9) + 1;
  } while (d === exclude);
  return d;
}

/**
 * Look up the correct symbol for a digit (1-based).
 */
export function correctSymbolForDigit(digit: number): string {
  return (DIGIT_SYMBOL_KEY[digit - 1] as (typeof DIGIT_SYMBOL_KEY)[number]).symbol;
}

/**
 * Classify a single response.
 */
export function classifyResponse(digit: number, response: string): boolean {
  return response === correctSymbolForDigit(digit);
}

// =============================================================================
// Summary
// =============================================================================

/**
 * Compute session summary from trial results.
 */
export function computeSummary(results: DsstTrialResult[], durationMs: number): DsstSummary {
  const correctTrials = results.filter((r) => r.correct).length;
  const accuracy = results.length > 0 ? Math.round((correctTrials / results.length) * 100) : 0;
  const correctRts = results.filter((r) => r.correct).map((r) => r.rt);
  const avgRT =
    correctRts.length > 0
      ? Math.round(correctRts.reduce((a, b) => a + b, 0) / correctRts.length)
      : 0;
  const itemsPerMinute = Math.round(correctTrials * (60_000 / SESSION_DURATION_MS));

  return {
    correctTrials,
    totalAttempts: results.length,
    accuracy,
    avgRT,
    itemsPerMinute,
    durationMs,
  };
}
