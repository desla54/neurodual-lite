import { describe, expect, it } from 'bun:test';
import {
  generateInterferenceArithmetic,
  checkInterferenceAnswer,
  verifyInterferenceProblem,
  formatInterferenceProblem,
  DEFAULT_INTERFERENCE_ARITHMETIC_CONFIG,
  type InterferenceArithmeticProblem,
} from './interference-arithmetic';

describe('interference-arithmetic', () => {
  // Deterministic random for testing
  function createDeterministicRandom(seed: number) {
    let state = seed;
    return () => {
      state = (state * 1103515245 + 12345) & 0x7fffffff;
      return state / 0x7fffffff;
    };
  }

  describe('generateInterferenceArithmetic', () => {
    it('should generate a valid problem with default config', () => {
      const problem = generateInterferenceArithmetic();

      expect(problem.expression).toBeTruthy();
      expect(problem.answer).toBeGreaterThanOrEqual(0);
      expect(problem.answer).toBeLessThanOrEqual(20);
      expect(problem.operationCount).toBe(4);
      expect(problem.terms.length).toBeGreaterThanOrEqual(5); // 1 initial + 4 operations
    });

    it('should produce deterministic results with seeded random', () => {
      const random = createDeterministicRandom(12345);
      const problem1 = generateInterferenceArithmetic({}, random);

      const random2 = createDeterministicRandom(12345);
      const problem2 = generateInterferenceArithmetic({}, random2);

      expect(problem1.expression).toBe(problem2.expression);
      expect(problem1.answer).toBe(problem2.answer);
    });

    it('should respect custom config', () => {
      const problem = generateInterferenceArithmetic({
        minOperations: 2,
        maxOperations: 2,
        minResult: 5,
        maxResult: 10,
        maxDigit: 5,
      });

      expect(problem.operationCount).toBe(2);
      expect(problem.answer).toBeGreaterThanOrEqual(5);
      expect(problem.answer).toBeLessThanOrEqual(10);
      // All values should be <= maxDigit
      for (const term of problem.terms) {
        expect(term.value).toBeLessThanOrEqual(5);
      }
    });

    it('should always produce a problem with answer in bounds', () => {
      // Generate many problems to test edge cases
      for (let i = 0; i < 50; i++) {
        const problem = generateInterferenceArithmetic();

        expect(problem.answer).toBeGreaterThanOrEqual(
          DEFAULT_INTERFERENCE_ARITHMETIC_CONFIG.minResult,
        );
        expect(problem.answer).toBeLessThanOrEqual(
          DEFAULT_INTERFERENCE_ARITHMETIC_CONFIG.maxResult,
        );
        expect(verifyInterferenceProblem(problem)).toBe(true);
      }
    });

    it('should have first term without operator', () => {
      const problem = generateInterferenceArithmetic();

      expect(problem.terms[0]?.operator).toBe(null);
    });

    it('should have subsequent terms with operators', () => {
      const problem = generateInterferenceArithmetic();

      for (let i = 1; i < problem.terms.length; i++) {
        const op = problem.terms[i]?.operator;
        expect(op === '+' || op === '-').toBe(true);
      }
    });
  });

  describe('checkInterferenceAnswer', () => {
    it('should return true for correct answer', () => {
      const problem: InterferenceArithmeticProblem = {
        expression: '5 + 3 - 2',
        answer: 6,
        operationCount: 2,
        terms: [
          { operator: null, value: 5 },
          { operator: '+', value: 3 },
          { operator: '-', value: 2 },
        ],
      };

      expect(checkInterferenceAnswer(problem, 6)).toBe(true);
    });

    it('should return false for incorrect answer', () => {
      const problem: InterferenceArithmeticProblem = {
        expression: '5 + 3 - 2',
        answer: 6,
        operationCount: 2,
        terms: [
          { operator: null, value: 5 },
          { operator: '+', value: 3 },
          { operator: '-', value: 2 },
        ],
      };

      expect(checkInterferenceAnswer(problem, 5)).toBe(false);
      expect(checkInterferenceAnswer(problem, 7)).toBe(false);
      expect(checkInterferenceAnswer(problem, 0)).toBe(false);
    });
  });

  describe('verifyInterferenceProblem', () => {
    it('should return true for valid problem', () => {
      const problem: InterferenceArithmeticProblem = {
        expression: '3 + 5 - 2 + 1',
        answer: 7,
        operationCount: 3,
        terms: [
          { operator: null, value: 3 },
          { operator: '+', value: 5 },
          { operator: '-', value: 2 },
          { operator: '+', value: 1 },
        ],
      };

      expect(verifyInterferenceProblem(problem)).toBe(true);
    });

    it('should return false for invalid problem', () => {
      const problem: InterferenceArithmeticProblem = {
        expression: '3 + 5 - 2 + 1',
        answer: 10, // Wrong! Should be 7
        operationCount: 3,
        terms: [
          { operator: null, value: 3 },
          { operator: '+', value: 5 },
          { operator: '-', value: 2 },
          { operator: '+', value: 1 },
        ],
      };

      expect(verifyInterferenceProblem(problem)).toBe(false);
    });

    it('should verify generated problems correctly', () => {
      // Test with multiple generated problems
      for (let i = 0; i < 20; i++) {
        const problem = generateInterferenceArithmetic();
        expect(verifyInterferenceProblem(problem)).toBe(true);
      }
    });
  });

  describe('formatInterferenceProblem', () => {
    it('should format problem with = ?', () => {
      const problem: InterferenceArithmeticProblem = {
        expression: '3 + 5 - 2',
        answer: 6,
        operationCount: 2,
        terms: [
          { operator: null, value: 3 },
          { operator: '+', value: 5 },
          { operator: '-', value: 2 },
        ],
      };

      expect(formatInterferenceProblem(problem)).toBe('3 + 5 - 2 = ?');
    });

    it('should format generated problems correctly', () => {
      const problem = generateInterferenceArithmetic();
      const formatted = formatInterferenceProblem(problem);

      expect(formatted).toEndWith(' = ?');
      expect(formatted).toContain(problem.expression);
    });
  });

  describe('DEFAULT_INTERFERENCE_ARITHMETIC_CONFIG', () => {
    it('should have expected default values', () => {
      expect(DEFAULT_INTERFERENCE_ARITHMETIC_CONFIG.minOperations).toBe(4);
      expect(DEFAULT_INTERFERENCE_ARITHMETIC_CONFIG.maxOperations).toBe(4);
      expect(DEFAULT_INTERFERENCE_ARITHMETIC_CONFIG.minResult).toBe(0);
      expect(DEFAULT_INTERFERENCE_ARITHMETIC_CONFIG.maxResult).toBe(20);
      expect(DEFAULT_INTERFERENCE_ARITHMETIC_CONFIG.maxDigit).toBe(9);
    });
  });
});
