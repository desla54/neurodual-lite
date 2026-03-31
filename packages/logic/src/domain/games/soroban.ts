/**
 * Soroban (Japanese Abacus) — pure game logic extracted from the training page.
 *
 * Recognition mode: player sets beads to match a target number.
 * - Each rod: 1 heaven bead (value 5) + 4 earth beads (value 1 each)
 * - nLevel maps to number of active rods (1 = 0-9, 2 = 0-99, …)
 * - Difficulty progression: more rods = larger number range
 * - Answer validation, scoring
 */

// =============================================================================
// Constants
// =============================================================================

/** Minimum number of rods allowed */
export const MIN_RODS = 1;
/** Maximum number of rods allowed */
export const MAX_RODS = 7;
/** Default number of rods */
export const DEFAULT_ROD_COUNT = 2;
/** Minimum number of trials allowed */
export const MIN_TRIALS = 5;
/** Maximum number of trials allowed */
export const MAX_TRIALS = 40;
/** Default number of trials per session */
export const DEFAULT_TOTAL_TRIALS = 20;

// =============================================================================
// Types
// =============================================================================

export interface SorobanBeads {
  /** Whether the heaven bead is active (worth 5) */
  heaven: boolean;
  /** Number of active earth beads (0-4, each worth 1) */
  earth: number;
}

export interface SorobanTrial {
  targetNumber: number;
  rodCount: number;
}

export interface SorobanTrialResult {
  trial: SorobanTrial;
  response: number;
  correct: boolean;
  rt: number;
}

export interface SorobanSummary {
  correctTrials: number;
  totalTrials: number;
  /** 0-100 */
  accuracy: number;
  /** Mean RT across all trials, in ms */
  avgRT: number;
  rodCount: number;
  /** Maximum value representable at this rod count */
  maxValue: number;
}

// =============================================================================
// Bead ↔ Digit Conversion
// =============================================================================

/**
 * Convert a single digit (0-9) to its bead representation.
 */
export function digitToBeads(digit: number): SorobanBeads {
  const clamped = Math.max(0, Math.min(9, Math.round(digit)));
  return { heaven: clamped >= 5, earth: clamped % 5 };
}

/**
 * Convert a bead state back to a digit (0-9).
 */
export function beadsToDigit(heaven: boolean, earth: number): number {
  return (heaven ? 5 : 0) + Math.min(4, Math.max(0, earth));
}

// =============================================================================
// Number ↔ Digits Conversion
// =============================================================================

/**
 * Break a number into an array of digits, padded to `rodCount` with leading zeros.
 * Values are clamped to [0, 10^rodCount - 1].
 */
export function numberToDigits(value: number, rodCount: number): number[] {
  const max = getMaxValue(rodCount);
  let remaining = Math.max(0, Math.min(value, max));
  const digits: number[] = [];
  for (let i = 0; i < rodCount; i++) {
    digits.unshift(remaining % 10);
    remaining = Math.floor(remaining / 10);
  }
  return digits;
}

/**
 * Convert an array of per-rod digits back to a single number.
 */
export function digitsToNumber(digits: number[]): number {
  return digits.reduce((acc, d) => acc * 10 + d, 0);
}

/**
 * Get the maximum representable value for a given rod count.
 */
export function getMaxValue(rodCount: number): number {
  return 10 ** rodCount - 1;
}

// =============================================================================
// Configuration Helpers
// =============================================================================

/**
 * Clamp rod count to valid range.
 */
export function clampRodCount(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_ROD_COUNT;
  return Math.max(MIN_RODS, Math.min(MAX_RODS, Math.round(n)));
}

/**
 * Clamp trials count to valid range.
 */
export function clampTrialsCount(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_TOTAL_TRIALS;
  return Math.max(MIN_TRIALS, Math.min(MAX_TRIALS, Math.round(n)));
}

// =============================================================================
// Trial Generation
// =============================================================================

/**
 * Generate random soroban trials.
 * Each trial gets a random target number in [0, 10^rodCount - 1].
 */
export function generateTrials(
  count: number,
  rodCount: number,
  rng: () => number = Math.random,
): SorobanTrial[] {
  const max = getMaxValue(rodCount);
  const trials: SorobanTrial[] = [];

  for (let i = 0; i < count; i++) {
    trials.push({
      targetNumber: Math.floor(rng() * (max + 1)),
      rodCount,
    });
  }

  // Fisher-Yates shuffle
  for (let i = trials.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const current = trials[i];
    const swapped = trials[j];
    if (!current || !swapped) continue;
    [trials[i], trials[j]] = [swapped, current];
  }

  return trials;
}

// =============================================================================
// Answer Validation
// =============================================================================

/**
 * Check if the player's bead values represent the target number.
 */
export function validateAnswer(beadValues: number[], targetNumber: number): boolean {
  const playerNumber = digitsToNumber(beadValues);
  return playerNumber === targetNumber;
}

// =============================================================================
// Summary
// =============================================================================

/**
 * Compute session summary from trial results.
 */
export function computeSummary(results: SorobanTrialResult[], rodCount: number): SorobanSummary {
  const correctTrials = results.filter((r) => r.correct).length;
  const accuracy = results.length > 0 ? Math.round((correctTrials / results.length) * 100) : 0;
  const rts = results.map((r) => r.rt);
  const avgRT = rts.length > 0 ? Math.round(rts.reduce((a, b) => a + b, 0) / rts.length) : 0;

  return {
    correctTrials,
    totalTrials: results.length,
    accuracy,
    avgRT,
    rodCount,
    maxValue: getMaxValue(rodCount),
  };
}
