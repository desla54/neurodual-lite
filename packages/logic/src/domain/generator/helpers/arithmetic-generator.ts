/**
 * Arithmetic Problem Generator
 *
 * Generates valid arithmetic problems for the arithmetic N-back modality.
 * The user tracks the ANSWER (0-12), not the problem expression.
 *
 * Key design principles:
 * - Answers are in the 0-12 range (BW original uses up to 12)
 * - Problems can be generated for specific answers (for N-back target matching)
 * - Difficulty levels control which operators are available
 * - Multiple problems can yield the same answer for variety
 * - Division only uses clean divisors (no remainders)
 *
 * IMPORTANT: The UI should display only "A op B = ?" (no answer shown).
 * This ensures active mental calculation, not pattern recognition.
 */

import type { SeededRandom } from '../../random';
import {
  ARITHMETIC_ANSWERS,
  ARITHMETIC_OPERATORS_BY_DIFFICULTY,
  type ArithmeticAnswer,
  type ArithmeticDifficulty,
  type ArithmeticOperator,
  type ArithmeticProblem,
} from '../../types';

/**
 * Generates an arithmetic problem with a specific target answer.
 * Used when we need a target/lure match in N-back.
 *
 * @param targetAnswer The answer we want the problem to have (0-9)
 * @param difficulty Difficulty level (1-3) determining operators
 * @param rng Seeded random generator
 * @returns An arithmetic problem with the specified answer
 */
export function generateProblemForAnswer(
  targetAnswer: ArithmeticAnswer,
  difficulty: ArithmeticDifficulty,
  rng: SeededRandom,
): ArithmeticProblem {
  const operators = ARITHMETIC_OPERATORS_BY_DIFFICULTY[difficulty];
  const operator = operators[rng.int(0, operators.length)] as ArithmeticOperator;

  // Generate operands that result in the target answer
  switch (operator) {
    case '+': {
      // a + b = target, where a,b >= 0 and a + b = target
      // Max operand is 12, so we pick a random a from 0 to min(target, 12)
      const maxA = Math.min(targetAnswer, 12);
      const operand1 = rng.int(0, maxA + 1);
      const operand2 = targetAnswer - operand1;
      return { operand1, operator: '+', operand2, answer: targetAnswer };
    }

    case '-': {
      // a - b = target, where a >= b, a <= 24 (max subtraction), b <= 12
      // Constraints: a - b = target, 0 <= b <= 12, b <= a
      // So: a = target + b, where 0 <= b <= min(12, 24 - target)
      const maxB = Math.min(12, 24 - targetAnswer);
      const operand2 = rng.int(0, maxB + 1);
      const operand1 = targetAnswer + operand2;
      return { operand1, operator: '-', operand2, answer: targetAnswer };
    }

    case '*': {
      // a * b = target, find factor pairs
      const factorPairs = getFactorPairs(targetAnswer, 12);
      if (factorPairs.length === 0) {
        // This should only happen for target = 0, which has factors (0, any)
        // But we handle it by using 0 * random
        return { operand1: 0, operator: '*', operand2: rng.int(0, 13), answer: targetAnswer };
      }
      const [operand1, operand2] = factorPairs[rng.int(0, factorPairs.length)] as [number, number];
      // Randomly swap order for variety
      if (rng.next() < 0.5) {
        return { operand1, operator: '*', operand2, answer: targetAnswer };
      }
      return { operand1: operand2, operator: '*', operand2: operand1, answer: targetAnswer };
    }

    case '/': {
      // a / b = target, where a = target * b, b > 0
      // BW original uses clean division only (no remainders)
      // Find valid divisors: b such that target * b <= 144 (12 * 12) and b <= 12
      const divisorPairs = getDivisorPairs(targetAnswer, 12);
      if (divisorPairs.length === 0) {
        // Fallback: target / 1 = target
        return { operand1: targetAnswer, operator: '/', operand2: 1, answer: targetAnswer };
      }
      const [dividend, divisor] = divisorPairs[rng.int(0, divisorPairs.length)] as [number, number];
      return { operand1: dividend, operator: '/', operand2: divisor, answer: targetAnswer };
    }

    default:
      // Fallback to addition
      return generateProblemForAnswer(targetAnswer, 1, rng);
  }
}

/**
 * Generates a random arithmetic problem.
 *
 * @param difficulty Difficulty level (1-3) determining operators
 * @param rng Seeded random generator
 * @returns A random arithmetic problem with answer in 0-9
 */
export function generateRandomProblem(
  difficulty: ArithmeticDifficulty,
  rng: SeededRandom,
): ArithmeticProblem {
  const operators = ARITHMETIC_OPERATORS_BY_DIFFICULTY[difficulty];
  const operator = operators[rng.int(0, operators.length)] as ArithmeticOperator;

  switch (operator) {
    case '+': {
      // Generate random a, b such that a + b is in 0-12
      // Pick sum first, then split
      const sum = ARITHMETIC_ANSWERS[rng.int(0, ARITHMETIC_ANSWERS.length)] as ArithmeticAnswer;
      const operand1 = rng.int(0, Math.min(sum, 12) + 1);
      const operand2 = sum - operand1;
      return { operand1, operator: '+', operand2, answer: sum };
    }

    case '-': {
      // Generate a - b where result is in 0-12
      const answer = ARITHMETIC_ANSWERS[rng.int(0, ARITHMETIC_ANSWERS.length)] as ArithmeticAnswer;
      const maxB = Math.min(12, 24 - answer);
      const operand2 = rng.int(0, maxB + 1);
      const operand1 = answer + operand2;
      return { operand1, operator: '-', operand2, answer };
    }

    case '*': {
      // Generate a * b where result is in 0-12
      // Exclude 0 most of the time as it's trivial (anything * 0 = 0)
      const validAnswers =
        rng.next() < 0.1
          ? [0 as ArithmeticAnswer]
          : ([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as ArithmeticAnswer[]);
      const answer = validAnswers[rng.int(0, validAnswers.length)] as ArithmeticAnswer;
      return generateProblemForAnswer(answer, difficulty, rng);
    }

    case '/': {
      // Generate a / b where result is in 0-12
      // Only use answers that have clean divisors
      const answer = ARITHMETIC_ANSWERS[rng.int(0, ARITHMETIC_ANSWERS.length)] as ArithmeticAnswer;
      return generateProblemForAnswer(answer, difficulty, rng);
    }

    default:
      return generateRandomProblem(1, rng);
  }
}

/**
 * Gets all valid factor pairs for a number (both factors <= maxOperand).
 * For N-back multiplication, we need pairs where both operands are reasonable.
 *
 * @param n The product to factor
 * @param maxOperand Maximum value for each operand (default 12 for BW)
 */
function getFactorPairs(n: number, maxOperand: number = 12): [number, number][] {
  if (n === 0) return [[0, 0]]; // Special case for 0

  const pairs: [number, number][] = [];

  // Check all possible factors up to sqrt(n)
  for (let i = 1; i <= Math.min(maxOperand, Math.sqrt(n)); i++) {
    if (n % i === 0) {
      const j = n / i;
      if (j <= maxOperand) {
        pairs.push([i, j]);
      }
    }
  }

  return pairs;
}

/**
 * Gets all valid (dividend, divisor) pairs for a target quotient.
 * For N-back division, we need clean division (no remainders).
 *
 * Example: target=3, maxOperand=12 → [(3,1), (6,2), (9,3), (12,4)]
 *
 * @param quotient The target answer (result of division)
 * @param maxOperand Maximum value for dividend and divisor
 */
function getDivisorPairs(quotient: number, maxOperand: number = 12): [number, number][] {
  const pairs: [number, number][] = [];

  // Special case: 0 / anything = 0 (but divisor can't be 0)
  if (quotient === 0) {
    for (let divisor = 1; divisor <= maxOperand; divisor++) {
      pairs.push([0, divisor]);
    }
    return pairs;
  }

  // Find all valid divisors: dividend = quotient * divisor
  // Constraints: divisor >= 1, divisor <= maxOperand, dividend <= maxOperand * maxOperand
  const maxDividend = maxOperand * maxOperand; // 144 for maxOperand=12

  for (let divisor = 1; divisor <= maxOperand; divisor++) {
    const dividend = quotient * divisor;
    if (dividend <= maxDividend && dividend <= maxOperand * maxOperand) {
      pairs.push([dividend, divisor]);
    }
  }

  return pairs;
}

/**
 * Gets all possible answers that can be generated for a given difficulty.
 * Used to verify answer pool availability.
 */
export function getAnswerPoolSize(_difficulty: ArithmeticDifficulty): number {
  // All difficulty levels can produce answers 0-12 (BW original)
  return ARITHMETIC_ANSWERS.length;
}

/**
 * Validates that an arithmetic problem is well-formed.
 * Used for testing and debugging.
 */
export function isValidProblem(problem: ArithmeticProblem): boolean {
  const { operand1, operator, operand2, answer } = problem;

  // Check answer is in valid range
  if (!ARITHMETIC_ANSWERS.includes(answer)) return false;

  // Check operands are non-negative integers
  if (operand1 < 0 || operand2 < 0) return false;
  if (!Number.isInteger(operand1) || !Number.isInteger(operand2)) return false;

  // Division: divisor must be > 0
  if (operator === '/' && operand2 === 0) return false;

  // Verify the math is correct
  switch (operator) {
    case '+':
      return operand1 + operand2 === answer;
    case '-':
      return operand1 - operand2 === answer;
    case '*':
      return operand1 * operand2 === answer;
    case '/':
      // Must be clean division (no remainder)
      return operand2 !== 0 && operand1 % operand2 === 0 && operand1 / operand2 === answer;
    default:
      return false;
  }
}

/**
 * Formats an arithmetic problem for display WITHOUT showing the answer.
 * This ensures active mental calculation, not pattern recognition.
 *
 * IMPORTANT: The UI must use this to display "A op B = ?" format.
 *
 * @param problem The arithmetic problem to display
 * @returns Display string like "5 + 3 = ?"
 */
export function formatProblemForDisplay(problem: ArithmeticProblem): string {
  const { operand1, operator, operand2 } = problem;
  return `${operand1} ${operator} ${operand2} = ?`;
}
