/**
 * Tests for Arithmetic Problem Generator
 *
 * Validates that arithmetic problems are correctly generated
 * with valid answers in the 0-12 range (BW original).
 */

import { describe, expect, test } from 'bun:test';
import { SeededRandom } from '../../random';
import type { ArithmeticAnswer, ArithmeticDifficulty } from '../../types';
import {
  formatProblemForDisplay,
  generateProblemForAnswer,
  generateRandomProblem,
  getAnswerPoolSize,
  isValidProblem,
} from './arithmetic-generator';

// =============================================================================
// Test Helpers
// =============================================================================

function createRng(seed = 'test-seed'): SeededRandom {
  return new SeededRandom(seed);
}

// =============================================================================
// generateProblemForAnswer Tests
// =============================================================================

describe('generateProblemForAnswer()', () => {
  describe('addition (difficulty 1)', () => {
    test('should generate addition problem for answer 0', () => {
      const rng = createRng();
      const problem = generateProblemForAnswer(0, 1, rng);

      expect(isValidProblem(problem)).toBe(true);
      expect(problem.answer).toBe(0);
      expect(problem.operator).toBe('+');
      expect(problem.operand1 + problem.operand2).toBe(0);
    });

    test('should generate addition problem for answer 5', () => {
      const rng = createRng();
      const problem = generateProblemForAnswer(5, 1, rng);

      expect(isValidProblem(problem)).toBe(true);
      expect(problem.answer).toBe(5);
      expect(problem.operator).toBe('+');
    });

    test('should generate addition problem for answer 9', () => {
      const rng = createRng();
      const problem = generateProblemForAnswer(9, 1, rng);

      expect(isValidProblem(problem)).toBe(true);
      expect(problem.answer).toBe(9);
      expect(problem.operator).toBe('+');
    });

    test('should generate varied problems for same answer', () => {
      const problems = new Set<string>();

      for (let seed = 0; seed < 50; seed++) {
        const rng = createRng(`seed-${seed}`);
        const problem = generateProblemForAnswer(5, 1, rng);
        problems.add(`${problem.operand1}+${problem.operand2}`);
      }

      // Should have multiple distinct problems for the same answer
      expect(problems.size).toBeGreaterThan(1);
    });
  });

  describe('subtraction (difficulty 2)', () => {
    test('should generate subtraction problem for answer 0', () => {
      const rng = createRng('sub-0');
      const problem = generateProblemForAnswer(0, 2, rng);

      expect(isValidProblem(problem)).toBe(true);
      expect(problem.answer).toBe(0);
    });

    test('should generate subtraction problem for answer 5', () => {
      const rng = createRng('sub-5');
      const problem = generateProblemForAnswer(5, 2, rng);

      expect(isValidProblem(problem)).toBe(true);
      expect(problem.answer).toBe(5);
    });

    test('should generate subtraction problem for answer 9', () => {
      const rng = createRng('sub-9');
      const problem = generateProblemForAnswer(9, 2, rng);

      expect(isValidProblem(problem)).toBe(true);
      expect(problem.answer).toBe(9);
    });
  });

  describe('multiplication (difficulty 3)', () => {
    test('should generate multiplication problem for answer 0', () => {
      const rng = createRng('mul-0');
      const problem = generateProblemForAnswer(0, 3, rng);

      expect(isValidProblem(problem)).toBe(true);
      expect(problem.answer).toBe(0);
    });

    test('should generate multiplication problem for answer 6', () => {
      const rng = createRng('mul-6');
      const problem = generateProblemForAnswer(6, 3, rng);

      expect(isValidProblem(problem)).toBe(true);
      expect(problem.answer).toBe(6);
      // 6 = 1*6, 2*3, 3*2, 6*1
    });

    test('should generate multiplication problem for answer 9', () => {
      const rng = createRng('mul-9');
      const problem = generateProblemForAnswer(9, 3, rng);

      expect(isValidProblem(problem)).toBe(true);
      expect(problem.answer).toBe(9);
      // 9 = 1*9, 3*3, 9*1
    });

    test('should handle prime answers', () => {
      const rng = createRng('mul-7');
      const problem = generateProblemForAnswer(7, 3, rng);

      expect(isValidProblem(problem)).toBe(true);
      expect(problem.answer).toBe(7);
      // 7 = 1*7, 7*1 only
    });
  });

  describe('division (difficulty 3)', () => {
    test('should generate division problem for answer 0', () => {
      const rng = createRng('div-0');
      const problem = generateProblemForAnswer(0, 3, rng);

      expect(isValidProblem(problem)).toBe(true);
      expect(problem.answer).toBe(0);
    });

    test('should generate division problem for answer 6', () => {
      const rng = createRng('div-6');
      const problem = generateProblemForAnswer(6, 3, rng);

      expect(isValidProblem(problem)).toBe(true);
      expect(problem.answer).toBe(6);
      // 6 = 6/1, 12/2, 18/3, 24/4, 30/5, 36/6, etc.
    });

    test('should generate division problem for answer 12', () => {
      const rng = createRng('div-12');
      const problem = generateProblemForAnswer(12, 3, rng);

      expect(isValidProblem(problem)).toBe(true);
      expect(problem.answer).toBe(12);
    });

    test('should only use clean division (no remainders)', () => {
      const rng = createRng('div-clean');

      for (let i = 0; i < 100; i++) {
        const answer = (i % 13) as ArithmeticAnswer;
        const problem = generateProblemForAnswer(answer, 3, rng);

        if (problem.operator === '/') {
          expect(problem.operand1 % problem.operand2).toBe(0);
          expect(problem.operand1 / problem.operand2).toBe(problem.answer);
        }
      }
    });
  });

  describe('all answers (0-12)', () => {
    test.each([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ] as ArithmeticAnswer[])('should generate valid problem for answer %i', (answer) => {
      const difficulties: ArithmeticDifficulty[] = [1, 2, 3];
      for (const difficulty of difficulties) {
        const rng = createRng(`ans-${answer}-diff-${difficulty}`);
        const problem = generateProblemForAnswer(answer, difficulty, rng);

        expect(isValidProblem(problem)).toBe(true);
        expect(problem.answer).toBe(answer);
      }
    });
  });
});

// =============================================================================
// generateRandomProblem Tests
// =============================================================================

describe('generateRandomProblem()', () => {
  test('should generate valid problems at difficulty 1 (addition)', () => {
    const rng = createRng();

    for (let i = 0; i < 100; i++) {
      const problem = generateRandomProblem(1, rng);
      expect(isValidProblem(problem)).toBe(true);
      expect(problem.operator).toBe('+');
      expect(problem.answer).toBeGreaterThanOrEqual(0);
      expect(problem.answer).toBeLessThanOrEqual(12);
    }
  });

  test('should generate valid problems at difficulty 2 (addition + subtraction)', () => {
    const rng = createRng();
    const operators = new Set<string>();

    for (let i = 0; i < 100; i++) {
      const problem = generateRandomProblem(2, rng);
      expect(isValidProblem(problem)).toBe(true);
      operators.add(problem.operator);
      expect(problem.answer).toBeGreaterThanOrEqual(0);
      expect(problem.answer).toBeLessThanOrEqual(12);
    }

    // Should use both + and -
    expect(operators.has('+')).toBe(true);
    expect(operators.has('-')).toBe(true);
  });

  test('should generate valid problems at difficulty 3 (all operators)', () => {
    const rng = createRng('diff3');
    const operators = new Set<string>();

    for (let i = 0; i < 200; i++) {
      const problem = generateRandomProblem(3, rng);
      expect(isValidProblem(problem)).toBe(true);
      operators.add(problem.operator);
      expect(problem.answer).toBeGreaterThanOrEqual(0);
      expect(problem.answer).toBeLessThanOrEqual(12);
    }

    // Level 3 uses + - × (no division)
    expect(operators.has('+')).toBe(true);
    expect(operators.has('-')).toBe(true);
    expect(operators.has('*')).toBe(true);
    expect(operators.has('/')).toBe(false); // Division is level 4 only
  });

  test('should generate valid problems at difficulty 4 (all operators including division)', () => {
    const rng = createRng('diff4');
    const operators = new Set<string>();

    for (let i = 0; i < 200; i++) {
      const problem = generateRandomProblem(4, rng);
      expect(isValidProblem(problem)).toBe(true);
      operators.add(problem.operator);
      expect(problem.answer).toBeGreaterThanOrEqual(0);
      expect(problem.answer).toBeLessThanOrEqual(12);
    }

    // Level 4 uses all four operators (+ - × ÷)
    expect(operators.has('+')).toBe(true);
    expect(operators.has('-')).toBe(true);
    expect(operators.has('*')).toBe(true);
    expect(operators.has('/')).toBe(true);
  });

  test('should produce all answers (0-12) over many iterations', () => {
    const rng = createRng('all-answers');
    const answers = new Set<number>();

    for (let i = 0; i < 500; i++) {
      const problem = generateRandomProblem(4, rng); // Use level 4 for all operators
      answers.add(problem.answer);
    }

    // Should produce all answers 0-12 (13 possible values)
    expect(answers.size).toBe(13);
  });
});

// =============================================================================
// isValidProblem Tests
// =============================================================================

describe('isValidProblem()', () => {
  test('should validate correct addition', () => {
    expect(isValidProblem({ operand1: 3, operator: '+', operand2: 4, answer: 7 })).toBe(true);
    expect(isValidProblem({ operand1: 0, operator: '+', operand2: 0, answer: 0 })).toBe(true);
    expect(isValidProblem({ operand1: 5, operator: '+', operand2: 4, answer: 9 })).toBe(true);
  });

  test('should validate correct subtraction', () => {
    expect(isValidProblem({ operand1: 7, operator: '-', operand2: 4, answer: 3 })).toBe(true);
    expect(isValidProblem({ operand1: 9, operator: '-', operand2: 0, answer: 9 })).toBe(true);
    expect(isValidProblem({ operand1: 5, operator: '-', operand2: 5, answer: 0 })).toBe(true);
  });

  test('should validate correct multiplication', () => {
    expect(isValidProblem({ operand1: 3, operator: '*', operand2: 3, answer: 9 })).toBe(true);
    expect(isValidProblem({ operand1: 0, operator: '*', operand2: 5, answer: 0 })).toBe(true);
    expect(isValidProblem({ operand1: 2, operator: '*', operand2: 4, answer: 8 })).toBe(true);
    expect(isValidProblem({ operand1: 3, operator: '*', operand2: 4, answer: 12 })).toBe(true);
  });

  test('should validate correct division', () => {
    expect(isValidProblem({ operand1: 12, operator: '/', operand2: 3, answer: 4 })).toBe(true);
    expect(isValidProblem({ operand1: 0, operator: '/', operand2: 5, answer: 0 })).toBe(true);
    expect(isValidProblem({ operand1: 12, operator: '/', operand2: 1, answer: 12 })).toBe(true);
    expect(isValidProblem({ operand1: 24, operator: '/', operand2: 2, answer: 12 })).toBe(true);
  });

  test('should reject division by zero', () => {
    expect(isValidProblem({ operand1: 6, operator: '/', operand2: 0, answer: 0 })).toBe(false);
  });

  test('should reject division with remainder', () => {
    // 7 / 2 = 3.5, not a valid answer
    expect(isValidProblem({ operand1: 7, operator: '/', operand2: 2, answer: 3 })).toBe(false);
  });

  test('should reject incorrect math', () => {
    expect(isValidProblem({ operand1: 3, operator: '+', operand2: 4, answer: 6 })).toBe(false);
    expect(isValidProblem({ operand1: 5, operator: '-', operand2: 3, answer: 3 })).toBe(false);
    expect(isValidProblem({ operand1: 2, operator: '*', operand2: 3, answer: 7 })).toBe(false);
    expect(isValidProblem({ operand1: 12, operator: '/', operand2: 3, answer: 3 })).toBe(false);
  });

  test('should reject answers outside 0-12 range', () => {
    expect(isValidProblem({ operand1: 7, operator: '+', operand2: 6, answer: 13 as never })).toBe(
      false,
    );
    expect(isValidProblem({ operand1: 3, operator: '-', operand2: 5, answer: -2 as never })).toBe(
      false,
    );
  });

  test('should reject negative operands', () => {
    expect(isValidProblem({ operand1: -1, operator: '+', operand2: 5, answer: 4 })).toBe(false);
    expect(isValidProblem({ operand1: 5, operator: '-', operand2: -1, answer: 6 })).toBe(false);
  });
});

// =============================================================================
// getAnswerPoolSize Tests
// =============================================================================

describe('getAnswerPoolSize()', () => {
  test('should return 13 for all difficulties (answers 0-12)', () => {
    expect(getAnswerPoolSize(1)).toBe(13);
    expect(getAnswerPoolSize(2)).toBe(13);
    expect(getAnswerPoolSize(3)).toBe(13);
  });
});

// =============================================================================
// Edge Cases and Stress Tests
// =============================================================================

describe('Edge Cases', () => {
  test('should be deterministic with same seed', () => {
    const rng1 = createRng('deterministic');
    const rng2 = createRng('deterministic');

    const problems1 = [];
    const problems2 = [];

    for (let i = 0; i < 10; i++) {
      problems1.push(generateRandomProblem(3, rng1));
      problems2.push(generateRandomProblem(3, rng2));
    }

    expect(problems1).toEqual(problems2);
  });

  test('should handle 1000 generations without error', () => {
    const rng = createRng('stress');

    for (let i = 0; i < 1000; i++) {
      const difficulty = ((i % 3) + 1) as ArithmeticDifficulty;
      const problem = generateRandomProblem(difficulty, rng);
      expect(isValidProblem(problem)).toBe(true);
    }
  });

  test('should generate same answer problems correctly for N-back', () => {
    const rng = createRng('nback');
    const targetAnswer = 5 as ArithmeticAnswer;

    // Simulate N-back: generate 10 problems that must match the same answer
    const problems = [];
    for (let i = 0; i < 10; i++) {
      const problem = generateProblemForAnswer(targetAnswer, 3, rng);
      problems.push(problem);
      expect(problem.answer).toBe(targetAnswer);
      expect(isValidProblem(problem)).toBe(true);
    }

    // Should have variety in the expressions
    const expressions = new Set(problems.map((p) => `${p.operand1}${p.operator}${p.operand2}`));
    expect(expressions.size).toBeGreaterThan(1);
  });
});

// =============================================================================
// formatProblemForDisplay Tests
// =============================================================================

describe('formatProblemForDisplay()', () => {
  test('should format addition problem without answer', () => {
    const display = formatProblemForDisplay({ operand1: 5, operator: '+', operand2: 3, answer: 8 });
    expect(display).toBe('5 + 3 = ?');
  });

  test('should format subtraction problem without answer', () => {
    const display = formatProblemForDisplay({ operand1: 9, operator: '-', operand2: 4, answer: 5 });
    expect(display).toBe('9 - 4 = ?');
  });

  test('should format multiplication problem without answer', () => {
    const display = formatProblemForDisplay({
      operand1: 3,
      operator: '*',
      operand2: 4,
      answer: 12,
    });
    expect(display).toBe('3 * 4 = ?');
  });

  test('should format division problem without answer', () => {
    const display = formatProblemForDisplay({
      operand1: 12,
      operator: '/',
      operand2: 3,
      answer: 4,
    });
    expect(display).toBe('12 / 3 = ?');
  });

  test('should never show the answer (active mental calculation)', () => {
    // This is critical for N-back: user must calculate, not pattern-match
    const rng = createRng('no-answer');

    for (let i = 0; i < 50; i++) {
      const problem = generateRandomProblem(3, rng);
      const display = formatProblemForDisplay(problem);

      // Display should end with "= ?" and NOT contain the actual answer after "="
      expect(display).toMatch(/= \?$/);
      expect(display).not.toContain(`= ${problem.answer}`);
    }
  });
});
