/**
 * Interference Arithmetic Generator
 *
 * Generates arithmetic CHAINS for cognitive interference in Dual Trace mode.
 * Unlike the arithmetic N-back generator (single operation), this creates
 * multi-operation expressions like "3 + 5 - 2 + 4 - 1 = ?".
 *
 * Purpose:
 * - Occupy the phonological loop (verbal working memory)
 * - Prevent chunking of N-back positions
 * - Force deeper spatial encoding
 *
 * Design principles:
 * - 4 operations minimum (forces sequential processing)
 * - Result constrained to 0-20 (easy to write, 1-2 digits, no negative)
 * - Only + and - (no multiplication/division - harder to chunk)
 * - Single digits only (0-9)
 * - Pure functions, no side effects
 */

// =============================================================================
// Types
// =============================================================================

export interface InterferenceArithmeticProblem {
  /** The expression to display, e.g. "3 + 5 - 2 + 4 - 1" */
  readonly expression: string;
  /** The correct answer */
  readonly answer: number;
  /** Number of operations in the formula */
  readonly operationCount: number;
  /** Individual terms for verification */
  readonly terms: readonly InterferenceArithmeticTerm[];
}

export interface InterferenceArithmeticTerm {
  /** null for first term, + or - for subsequent terms */
  readonly operator: '+' | '-' | null;
  /** The digit value (0-9) */
  readonly value: number;
}

export interface InterferenceArithmeticConfig {
  /** Minimum number of operations (default: 4) */
  readonly minOperations: number;
  /** Maximum number of operations (default: 4) */
  readonly maxOperations: number;
  /** Minimum result value (default: 0) */
  readonly minResult: number;
  /** Maximum result value (default: 20) */
  readonly maxResult: number;
  /** Maximum digit value (default: 9) */
  readonly maxDigit: number;
}

// =============================================================================
// Default Configuration (from thresholds.ts pattern)
// =============================================================================

export const DEFAULT_INTERFERENCE_ARITHMETIC_CONFIG: InterferenceArithmeticConfig = {
  minOperations: 4,
  maxOperations: 4,
  minResult: 0,
  maxResult: 20,
  maxDigit: 9,
};

// =============================================================================
// Generator Functions
// =============================================================================

/**
 * Generate a random arithmetic chain with constrained result.
 *
 * Uses a constructive approach:
 * 1. Pick random digits and operators
 * 2. Calculate the result
 * 3. If result is out of bounds, adjust the last term
 * 4. If adjustment fails, retry with new random values
 *
 * @param config Generator configuration
 * @param random Random number generator (Math.random by default)
 * @returns A valid arithmetic problem with result in [minResult, maxResult]
 */
export function generateInterferenceArithmetic(
  config: Partial<InterferenceArithmeticConfig> = {},
  random: () => number = Math.random,
): InterferenceArithmeticProblem {
  const cfg: InterferenceArithmeticConfig = {
    ...DEFAULT_INTERFERENCE_ARITHMETIC_CONFIG,
    ...config,
  };

  // Retry up to 100 times (should almost always succeed on first try)
  for (let attempt = 0; attempt < 100; attempt++) {
    const problem = tryGenerateProblem(cfg, random);
    if (problem) {
      return problem;
    }
  }

  // Fallback: generate a simple problem that always works
  return generateFallbackProblem(cfg);
}

/**
 * Same as generateInterferenceArithmetic(), but forces the first term.
 * Useful when the arithmetic chain must be linked to an external cue.
 */
export function generateInterferenceArithmeticFromSeed(
  firstValue: number,
  config: Partial<InterferenceArithmeticConfig> = {},
  random: () => number = Math.random,
): InterferenceArithmeticProblem {
  const cfg: InterferenceArithmeticConfig = {
    ...DEFAULT_INTERFERENCE_ARITHMETIC_CONFIG,
    ...config,
  };

  for (let attempt = 0; attempt < 150; attempt++) {
    const problem = tryGenerateProblem(cfg, random, firstValue);
    if (problem) return problem;
  }

  // Fallback: keep the provided first value, do a single safe adjustment.
  // Note: operationCount follows cfg.minOperations; this is only a last resort.
  const terms: InterferenceArithmeticTerm[] = [{ operator: null, value: firstValue }];
  let result = firstValue;
  for (let i = 0; i < cfg.minOperations; i++) {
    // Bias towards '+' to reduce negatives from arbitrary seeds.
    const operator: '+' | '-' = random() < 0.7 ? '+' : '-';
    const value = Math.floor(random() * (cfg.maxDigit + 1));
    terms.push({ operator, value });
    result = operator === '+' ? result + value : result - value;
  }

  // Clamp by adjusting last term if needed.
  if (result < cfg.minResult || result > cfg.maxResult) {
    const last = terms[terms.length - 1];
    if (last && last.operator !== null) {
      const withoutLast = last.operator === '+' ? result - last.value : result + last.value;
      const target = Math.min(cfg.maxResult, Math.max(cfg.minResult, withoutLast));
      const tryOp: '+' | '-' = target >= withoutLast ? '+' : '-';
      const tryVal = Math.min(cfg.maxDigit, Math.abs(target - withoutLast));
      terms[terms.length - 1] = { operator: tryOp, value: tryVal };
      result = tryOp === '+' ? withoutLast + tryVal : withoutLast - tryVal;
    }
  }

  return buildProblem(terms, result, cfg.minOperations);
}

/**
 * Try to generate a valid problem. Returns null if result is out of bounds.
 */
function tryGenerateProblem(
  cfg: InterferenceArithmeticConfig,
  random: () => number,
  firstValueOverride?: number,
): InterferenceArithmeticProblem | null {
  const operationCount =
    cfg.minOperations + Math.floor(random() * (cfg.maxOperations - cfg.minOperations + 1));

  const terms: InterferenceArithmeticTerm[] = [];

  // First term (no operator)
  const firstValue =
    typeof firstValueOverride === 'number'
      ? firstValueOverride
      : Math.floor(random() * (cfg.maxDigit + 1));
  terms.push({ operator: null, value: firstValue });

  let result = firstValue;

  // Generate remaining terms
  for (let i = 0; i < operationCount; i++) {
    const operator: '+' | '-' = random() < 0.5 ? '+' : '-';
    const value = Math.floor(random() * (cfg.maxDigit + 1));

    terms.push({ operator, value });
    result = operator === '+' ? result + value : result - value;
  }

  // Check if result is in bounds
  if (result < cfg.minResult || result > cfg.maxResult) {
    // Try to adjust the last term
    const lastTerm = terms[terms.length - 1];
    if (!lastTerm || lastTerm.operator === null) return null;

    // Calculate what we need
    const resultWithoutLast =
      lastTerm.operator === '+' ? result - lastTerm.value : result + lastTerm.value;

    // Try both operators to find a valid adjustment
    for (const tryOp of ['+', '-'] as const) {
      for (let tryVal = 0; tryVal <= cfg.maxDigit; tryVal++) {
        const tryResult = tryOp === '+' ? resultWithoutLast + tryVal : resultWithoutLast - tryVal;

        if (tryResult >= cfg.minResult && tryResult <= cfg.maxResult) {
          // Found a valid adjustment
          terms[terms.length - 1] = { operator: tryOp, value: tryVal };
          return buildProblem(terms, tryResult, operationCount);
        }
      }
    }

    // Couldn't adjust, return null to retry
    return null;
  }

  return buildProblem(terms, result, operationCount);
}

/**
 * Build the final problem object from terms.
 */
function buildProblem(
  terms: InterferenceArithmeticTerm[],
  answer: number,
  operationCount: number,
): InterferenceArithmeticProblem {
  // Build expression string
  const parts: string[] = [];
  for (const term of terms) {
    if (term.operator === null) {
      parts.push(String(term.value));
    } else {
      parts.push(term.operator);
      parts.push(String(term.value));
    }
  }

  return {
    expression: parts.join(' '),
    answer,
    operationCount,
    terms,
  };
}

/**
 * Generate a simple fallback problem that always works.
 * Used when random generation fails (shouldn't happen in practice).
 */
function generateFallbackProblem(cfg: InterferenceArithmeticConfig): InterferenceArithmeticProblem {
  // Simple: 5 + 3 - 2 + 1 - 0 = 7
  const terms: InterferenceArithmeticTerm[] = [
    { operator: null, value: 5 },
    { operator: '+', value: 3 },
    { operator: '-', value: 2 },
    { operator: '+', value: 1 },
    { operator: '-', value: 0 },
  ];

  return {
    expression: '5 + 3 - 2 + 1 - 0',
    answer: 7,
    operationCount: cfg.minOperations,
    terms,
  };
}

// =============================================================================
// Validation
// =============================================================================

/**
 * Check if a user answer matches the expected answer.
 */
export function checkInterferenceAnswer(
  problem: InterferenceArithmeticProblem,
  userAnswer: number,
): boolean {
  return userAnswer === problem.answer;
}

/**
 * Verify a problem's answer is correct (for testing).
 */
export function verifyInterferenceProblem(problem: InterferenceArithmeticProblem): boolean {
  let result = 0;

  for (const term of problem.terms) {
    if (term.operator === null) {
      result = term.value;
    } else if (term.operator === '+') {
      result += term.value;
    } else {
      result -= term.value;
    }
  }

  return result === problem.answer;
}

/**
 * Format a problem for display.
 * Returns "3 + 5 - 2 + 4 - 1 = ?" format.
 */
export function formatInterferenceProblem(problem: InterferenceArithmeticProblem): string {
  return `${problem.expression} = ?`;
}
