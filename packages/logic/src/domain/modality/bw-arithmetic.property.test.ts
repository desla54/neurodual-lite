/**
 * Property-Based Tests for BW Arithmetic Module
 *
 * Uses fast-check to verify mathematical properties of:
 * - Rational number operations (normalization, equality)
 * - Decimal parsing to rational conversion
 * - BW arithmetic answer computation
 * - Division acceptability checking
 */
import { describe, expect, it } from 'bun:test';
import * as fc from 'fast-check';
import {
  BW_ARITHMETIC_DEFAULT_ACCEPTABLE_DECIMALS,
  computeBWArithmeticCorrectAnswer,
  isBWAcceptableDivideStimulus,
  parseBWArithmeticAnswer,
  parseDecimalToRational,
  type Rational,
  rationalEquals,
} from './bw-arithmetic';

// =============================================================================
// Helpers for property tests
// =============================================================================

/**
 * Computes expected result as a JavaScript number for validation.
 */
function computeExpectedNumber(
  operation: 'add' | 'subtract' | 'multiply' | 'divide',
  a: number,
  b: number,
): number {
  switch (operation) {
    case 'add':
      return a + b;
    case 'subtract':
      return a - b;
    case 'multiply':
      return a * b;
    case 'divide':
      return a / b;
  }
}

/**
 * Converts a Rational to a JavaScript number for approximate comparison.
 */
function rationalToNumber(r: Rational): number {
  return Number(r.numerator) / Number(r.denominator);
}

/**
 * Checks if a rational represents an integer.
 */
function isRationalInteger(r: Rational): boolean {
  return r.denominator === 1n;
}

// =============================================================================
// 1. ARITHMETIC COMPUTATION (15 tests)
// =============================================================================

describe('Arithmetic Computation - Property Tests', () => {
  // Arbitrary for BW valid operand range (1-12 for most tests)
  const operandArb = fc.integer({ min: 1, max: 12 });
  const operandWithZeroArb = fc.integer({ min: 0, max: 12 });
  const operationArb = fc.constantFrom('add', 'subtract', 'multiply', 'divide') as fc.Arbitrary<
    'add' | 'subtract' | 'multiply' | 'divide'
  >;

  it('1. addition produces correct sum', () => {
    fc.assert(
      fc.property(operandWithZeroArb, operandWithZeroArb, (a, b) => {
        const result = computeBWArithmeticCorrectAnswer('add', a, b);
        const expected = a + b;
        return rationalToNumber(result) === expected;
      }),
      { numRuns: 200 },
    );
  });

  it('2. subtraction produces correct difference', () => {
    fc.assert(
      fc.property(operandWithZeroArb, operandWithZeroArb, (a, b) => {
        const result = computeBWArithmeticCorrectAnswer('subtract', a, b);
        const expected = a - b;
        return rationalToNumber(result) === expected;
      }),
      { numRuns: 200 },
    );
  });

  it('3. multiplication produces correct product', () => {
    fc.assert(
      fc.property(operandWithZeroArb, operandWithZeroArb, (a, b) => {
        const result = computeBWArithmeticCorrectAnswer('multiply', a, b);
        const expected = a * b;
        return rationalToNumber(result) === expected;
      }),
      { numRuns: 200 },
    );
  });

  it('4. division produces correct quotient for non-zero divisor', () => {
    fc.assert(
      fc.property(operandWithZeroArb, operandArb, (a, b) => {
        const result = computeBWArithmeticCorrectAnswer('divide', a, b);
        const expected = a / b;
        return Math.abs(rationalToNumber(result) - expected) < 1e-10;
      }),
      { numRuns: 200 },
    );
  });

  it('5. addition results are always integers (denominator = 1)', () => {
    fc.assert(
      fc.property(operandWithZeroArb, operandWithZeroArb, (a, b) => {
        const result = computeBWArithmeticCorrectAnswer('add', a, b);
        return isRationalInteger(result);
      }),
      { numRuns: 100 },
    );
  });

  it('6. subtraction results are always integers (denominator = 1)', () => {
    fc.assert(
      fc.property(operandWithZeroArb, operandWithZeroArb, (a, b) => {
        const result = computeBWArithmeticCorrectAnswer('subtract', a, b);
        return isRationalInteger(result);
      }),
      { numRuns: 100 },
    );
  });

  it('7. multiplication results are always integers (denominator = 1)', () => {
    fc.assert(
      fc.property(operandWithZeroArb, operandWithZeroArb, (a, b) => {
        const result = computeBWArithmeticCorrectAnswer('multiply', a, b);
        return isRationalInteger(result);
      }),
      { numRuns: 100 },
    );
  });

  it('8. addition is commutative: a + b = b + a', () => {
    fc.assert(
      fc.property(operandWithZeroArb, operandWithZeroArb, (a, b) => {
        const r1 = computeBWArithmeticCorrectAnswer('add', a, b);
        const r2 = computeBWArithmeticCorrectAnswer('add', b, a);
        return rationalEquals(r1, r2);
      }),
      { numRuns: 100 },
    );
  });

  it('9. multiplication is commutative: a * b = b * a', () => {
    fc.assert(
      fc.property(operandWithZeroArb, operandWithZeroArb, (a, b) => {
        const r1 = computeBWArithmeticCorrectAnswer('multiply', a, b);
        const r2 = computeBWArithmeticCorrectAnswer('multiply', b, a);
        return rationalEquals(r1, r2);
      }),
      { numRuns: 100 },
    );
  });

  it('10. subtraction identity: a - 0 = a', () => {
    fc.assert(
      fc.property(operandWithZeroArb, (a) => {
        const result = computeBWArithmeticCorrectAnswer('subtract', a, 0);
        return rationalToNumber(result) === a;
      }),
      { numRuns: 50 },
    );
  });

  it('11. addition identity: a + 0 = a', () => {
    fc.assert(
      fc.property(operandWithZeroArb, (a) => {
        const result = computeBWArithmeticCorrectAnswer('add', a, 0);
        return rationalToNumber(result) === a;
      }),
      { numRuns: 50 },
    );
  });

  it('12. multiplication identity: a * 1 = a', () => {
    fc.assert(
      fc.property(operandWithZeroArb, (a) => {
        const result = computeBWArithmeticCorrectAnswer('multiply', a, 1);
        return rationalToNumber(result) === a;
      }),
      { numRuns: 50 },
    );
  });

  it('13. division identity: a / 1 = a', () => {
    fc.assert(
      fc.property(operandWithZeroArb, (a) => {
        const result = computeBWArithmeticCorrectAnswer('divide', a, 1);
        return rationalToNumber(result) === a;
      }),
      { numRuns: 50 },
    );
  });

  it('14. multiplication by zero: a * 0 = 0', () => {
    fc.assert(
      fc.property(operandWithZeroArb, (a) => {
        const result = computeBWArithmeticCorrectAnswer('multiply', a, 0);
        return rationalToNumber(result) === 0;
      }),
      { numRuns: 50 },
    );
  });

  it('15. parse and compute are consistent: parse(computed.toString()) equals computed', () => {
    fc.assert(
      fc.property(operandArb, operandArb, (a, b) => {
        const computed = computeBWArithmeticCorrectAnswer('add', a, b);
        const asString = String(computed.numerator);
        const parsed = parseDecimalToRational(asString);
        return rationalEquals(computed, parsed);
      }),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// 2. ANSWER PARSING (15 tests)
// =============================================================================

describe('Answer Parsing - Property Tests', () => {
  // Arbitrary for valid integer strings
  const integerStringArb = fc.integer({ min: -999, max: 999 }).map((n) => String(n));

  // Arbitrary for positive integers as strings
  const positiveIntStringArb = fc.integer({ min: 0, max: 999 }).map((n) => String(n));

  // Arbitrary for valid decimal strings
  const decimalStringArb = fc
    .tuple(fc.integer({ min: 0, max: 999 }), fc.integer({ min: 0, max: 9999 }))
    .map(([int, frac]) => `${int}.${String(frac).padStart(1, '0')}`);

  it('1. valid positive integers are parsed correctly', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 999 }), (n) => {
        const input = String(n);
        const result = parseDecimalToRational(input);
        return rationalToNumber(result) === n;
      }),
      { numRuns: 200 },
    );
  });

  it('2. valid negative integers are parsed correctly', () => {
    fc.assert(
      fc.property(fc.integer({ min: -999, max: -1 }), (n) => {
        const input = String(n);
        const result = parseDecimalToRational(input);
        return rationalToNumber(result) === n;
      }),
      { numRuns: 200 },
    );
  });

  it('3. zero is parsed correctly', () => {
    const inputs = ['0', '00', '000', '0.0', '0.00', '.0', '-0', '-0.0'];
    for (const input of inputs) {
      const result = parseDecimalToRational(input);
      expect(rationalToNumber(result)).toBe(0);
    }
  });

  it('4. empty string and lone dot parse to zero', () => {
    expect(rationalToNumber(parseDecimalToRational(''))).toBe(0);
    expect(rationalToNumber(parseDecimalToRational('.'))).toBe(0);
    expect(rationalToNumber(parseDecimalToRational('  '))).toBe(0);
  });

  it('5. decimal fractions are parsed correctly (0.5 = 1/2)', () => {
    const result = parseDecimalToRational('0.5');
    expect(result.numerator).toBe(1n);
    expect(result.denominator).toBe(2n);
  });

  it('6. decimal fractions are parsed correctly (0.25 = 1/4)', () => {
    const result = parseDecimalToRational('0.25');
    expect(result.numerator).toBe(1n);
    expect(result.denominator).toBe(4n);
  });

  it('7. decimal fractions are parsed correctly (0.125 = 1/8)', () => {
    const result = parseDecimalToRational('0.125');
    expect(result.numerator).toBe(1n);
    expect(result.denominator).toBe(8n);
  });

  it('8. negative decimals are parsed correctly', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 99 }), (n) => {
        const input = `-${n}.5`;
        const result = parseDecimalToRational(input);
        const expected = -(n + 0.5);
        return Math.abs(rationalToNumber(result) - expected) < 1e-10;
      }),
      { numRuns: 100 },
    );
  });

  it('9. parseBWArithmeticAnswer handles isNegative flag correctly', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 99 }), (n) => {
        const chars = String(n);
        const positiveResult = parseBWArithmeticAnswer(chars, false);
        const negativeResult = parseBWArithmeticAnswer(chars, true);
        return rationalToNumber(positiveResult) === n && rationalToNumber(negativeResult) === -n;
      }),
      { numRuns: 100 },
    );
  });

  it('10. parseBWArithmeticAnswer handles empty string', () => {
    const result = parseBWArithmeticAnswer('', false);
    expect(rationalToNumber(result)).toBe(0);
  });

  it('11. parseBWArithmeticAnswer handles lone dot', () => {
    const result = parseBWArithmeticAnswer('.', false);
    expect(rationalToNumber(result)).toBe(0);
  });

  it('12. whitespace is trimmed from input', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 99 }), (n) => {
        const withSpaces = `  ${n}  `;
        const result = parseDecimalToRational(withSpaces);
        return rationalToNumber(result) === n;
      }),
      { numRuns: 50 },
    );
  });

  it('13. leading zeros are handled correctly', () => {
    const inputs = [
      { input: '007', expected: 7 },
      { input: '00123', expected: 123 },
      { input: '0.5', expected: 0.5 },
      { input: '00.5', expected: 0.5 },
    ];
    for (const { input, expected } of inputs) {
      const result = parseDecimalToRational(input);
      expect(rationalToNumber(result)).toBeCloseTo(expected, 10);
    }
  });

  it('14. fractional parts are normalized correctly (0.50 = 0.5)', () => {
    const r1 = parseDecimalToRational('0.50');
    const r2 = parseDecimalToRational('0.5');
    expect(rationalEquals(r1, r2)).toBe(true);
  });

  it('15. mixed number decimals are parsed correctly', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 99 }),
        fc.integer({ min: 1, max: 9 }),
        (intPart, fracDigit) => {
          const input = `${intPart}.${fracDigit}`;
          const result = parseDecimalToRational(input);
          const expected = intPart + fracDigit / 10;
          return Math.abs(rationalToNumber(result) - expected) < 1e-10;
        },
      ),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// 3. EQUALITY CHECKING (10 tests)
// =============================================================================

describe('Rational Equality - Property Tests', () => {
  // Arbitrary for creating rationals via parsing
  const rationalViaParseArb = fc.oneof(
    fc.integer({ min: -100, max: 100 }).map((n) => parseDecimalToRational(String(n))),
    fc
      .tuple(fc.integer({ min: -100, max: 100 }), fc.integer({ min: 1, max: 9 }))
      .map(([i, f]) => parseDecimalToRational(`${i}.${f}`)),
  );

  it('1. rationalEquals is reflexive: a = a', () => {
    fc.assert(
      fc.property(rationalViaParseArb, (a) => {
        return rationalEquals(a, a);
      }),
      { numRuns: 100 },
    );
  });

  it('2. rationalEquals is symmetric: (a = b) implies (b = a)', () => {
    fc.assert(
      fc.property(rationalViaParseArb, rationalViaParseArb, (a, b) => {
        const aEqualsB = rationalEquals(a, b);
        const bEqualsA = rationalEquals(b, a);
        return aEqualsB === bEqualsA;
      }),
      { numRuns: 100 },
    );
  });

  it('3. rationalEquals is transitive: (a = b) and (b = c) implies (a = c)', () => {
    fc.assert(
      fc.property(fc.integer({ min: -50, max: 50 }), (n) => {
        // Create three equivalent representations of the same number
        const a = parseDecimalToRational(String(n));
        const b = parseDecimalToRational(` ${n} `); // with whitespace
        const c = parseDecimalToRational(`${String(n)}.0`); // with decimal

        const aEqB = rationalEquals(a, b);
        const bEqC = rationalEquals(b, c);
        const aEqC = rationalEquals(a, c);

        // If a=b and b=c, then a=c must hold
        if (aEqB && bEqC) {
          return aEqC;
        }
        return true;
      }),
      { numRuns: 100 },
    );
  });

  it('4. zero equals zero regardless of representation', () => {
    const zeroRepresentations = [
      parseDecimalToRational('0'),
      parseDecimalToRational('-0'),
      parseDecimalToRational('0.0'),
      parseDecimalToRational('0.00'),
      parseDecimalToRational('.0'),
      parseBWArithmeticAnswer('', false),
      parseBWArithmeticAnswer('.', true),
    ];

    for (let i = 0; i < zeroRepresentations.length; i++) {
      for (let j = i; j < zeroRepresentations.length; j++) {
        expect(rationalEquals(zeroRepresentations[i]!, zeroRepresentations[j]!)).toBe(true);
      }
    }
  });

  it('5. negative zero equals positive zero', () => {
    const posZero = parseDecimalToRational('0');
    const negZero = parseDecimalToRational('-0');
    expect(rationalEquals(posZero, negZero)).toBe(true);
  });

  it('6. different integers are not equal', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -100, max: 100 }),
        fc.integer({ min: -100, max: 100 }),
        (a, b) => {
          fc.pre(a !== b); // Skip if equal
          const ra = parseDecimalToRational(String(a));
          const rb = parseDecimalToRational(String(b));
          return !rationalEquals(ra, rb);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('7. positive and negative of same magnitude are not equal (except zero)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100 }), (n) => {
        const positive = parseDecimalToRational(String(n));
        const negative = parseDecimalToRational(String(-n));
        return !rationalEquals(positive, negative);
      }),
      { numRuns: 100 },
    );
  });

  it('8. equivalent fractions are equal (2/4 = 1/2)', () => {
    // 0.5 should be normalized to 1/2
    const r1 = parseDecimalToRational('0.5');
    const r2 = parseDecimalToRational('0.50');
    const r3 = parseDecimalToRational('0.500');
    expect(rationalEquals(r1, r2)).toBe(true);
    expect(rationalEquals(r2, r3)).toBe(true);
  });

  it('9. computed result equals parsed result for integer operations', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 50 }), fc.integer({ min: 0, max: 50 }), (a, b) => {
        const computed = computeBWArithmeticCorrectAnswer('add', a, b);
        const parsed = parseDecimalToRational(String(a + b));
        return rationalEquals(computed, parsed);
      }),
      { numRuns: 100 },
    );
  });

  it('10. rationals with different denominators can be equal (normalization)', () => {
    // Test that 6/8 normalizes to 3/4 (via 0.75)
    const r1 = parseDecimalToRational('0.75');
    expect(r1.numerator).toBe(3n);
    expect(r1.denominator).toBe(4n);

    // And 0.750 should be the same
    const r2 = parseDecimalToRational('0.750');
    expect(rationalEquals(r1, r2)).toBe(true);
  });
});

// =============================================================================
// 4. DIVISION ACCEPTABILITY (additional tests)
// =============================================================================

describe('Division Acceptability - Property Tests', () => {
  it('1. division by zero is never acceptable', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 12 }), (n) => {
        return !isBWAcceptableDivideStimulus({
          numberNBack: n,
          candidate: 0,
          acceptableDecimals: BW_ARITHMETIC_DEFAULT_ACCEPTABLE_DECIMALS,
        });
      }),
      { numRuns: 50 },
    );
  });

  it('2. clean division is always acceptable', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 12 }),
        (factor, multiplier) => {
          const dividend = factor * multiplier;
          return isBWAcceptableDivideStimulus({
            numberNBack: dividend,
            candidate: factor,
            acceptableDecimals: BW_ARITHMETIC_DEFAULT_ACCEPTABLE_DECIMALS,
          });
        },
      ),
      { numRuns: 100 },
    );
  });

  it('3. zero divided by anything (non-zero) is acceptable', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 12 }), (divisor) => {
        return isBWAcceptableDivideStimulus({
          numberNBack: 0,
          candidate: divisor,
          acceptableDecimals: BW_ARITHMETIC_DEFAULT_ACCEPTABLE_DECIMALS,
        });
      }),
      { numRuns: 50 },
    );
  });

  it('4. acceptable decimals from the default list are allowed', () => {
    // Test some known acceptable fractions
    // 1/8 = 0.125, 1/4 = 0.25, 1/2 = 0.5, 3/4 = 0.75
    const testCases = [
      { numberNBack: 1, candidate: 8, expected: true }, // 1/8 = 0.125
      { numberNBack: 1, candidate: 4, expected: true }, // 1/4 = 0.25
      { numberNBack: 1, candidate: 2, expected: true }, // 1/2 = 0.5
      { numberNBack: 3, candidate: 4, expected: true }, // 3/4 = 0.75
      { numberNBack: 5, candidate: 8, expected: true }, // 5/8 = 0.625
    ];

    for (const { numberNBack, candidate, expected } of testCases) {
      expect(
        isBWAcceptableDivideStimulus({
          numberNBack,
          candidate,
          acceptableDecimals: BW_ARITHMETIC_DEFAULT_ACCEPTABLE_DECIMALS,
        }),
      ).toBe(expected);
    }
  });

  it('5. non-acceptable remainders are rejected', () => {
    // 1/3 = 0.333... is not in acceptable decimals
    expect(
      isBWAcceptableDivideStimulus({
        numberNBack: 1,
        candidate: 3,
        acceptableDecimals: BW_ARITHMETIC_DEFAULT_ACCEPTABLE_DECIMALS,
      }),
    ).toBe(false);

    // 1/7 = 0.142857... is not in acceptable decimals
    expect(
      isBWAcceptableDivideStimulus({
        numberNBack: 1,
        candidate: 7,
        acceptableDecimals: BW_ARITHMETIC_DEFAULT_ACCEPTABLE_DECIMALS,
      }),
    ).toBe(false);
  });
});

// =============================================================================
// 5. OPERATIONS BY DIFFICULTY (additional tests)
// =============================================================================

describe('Operations By Difficulty - Property Tests', () => {
  // Import the function
  const { getBWArithmeticOperationsFromDifficulty } = require('./bw-arithmetic');

  it('1. difficulty 1 only includes add', () => {
    const ops = getBWArithmeticOperationsFromDifficulty(1);
    expect(ops).toEqual(['add']);
  });

  it('2. difficulty 2 includes add and subtract', () => {
    const ops = getBWArithmeticOperationsFromDifficulty(2);
    expect(ops).toEqual(['add', 'subtract']);
  });

  it('3. difficulty 3 includes add, subtract, and multiply', () => {
    const ops = getBWArithmeticOperationsFromDifficulty(3);
    expect(ops).toEqual(['add', 'subtract', 'multiply']);
  });

  it('4. difficulty 4 includes all four operations', () => {
    const ops = getBWArithmeticOperationsFromDifficulty(4);
    expect(ops).toEqual(['add', 'subtract', 'multiply', 'divide']);
  });

  it('5. higher difficulties are supersets of lower difficulties', () => {
    const d1 = getBWArithmeticOperationsFromDifficulty(1);
    const d2 = getBWArithmeticOperationsFromDifficulty(2);
    const d3 = getBWArithmeticOperationsFromDifficulty(3);
    const d4 = getBWArithmeticOperationsFromDifficulty(4);

    // d1 subset of d2
    expect(d1.every((op: string) => d2.includes(op))).toBe(true);
    // d2 subset of d3
    expect(d2.every((op: string) => d3.includes(op))).toBe(true);
    // d3 subset of d4
    expect(d3.every((op: string) => d4.includes(op))).toBe(true);
  });
});

// =============================================================================
// 6. EDGE CASES AND STRESS TESTS
// =============================================================================

describe('Edge Cases and Stress - Property Tests', () => {
  it('1. large number parsing does not overflow', () => {
    const largeNum = '999999999999999999';
    const result = parseDecimalToRational(largeNum);
    expect(result.numerator).toBe(BigInt(largeNum));
    expect(result.denominator).toBe(1n);
  });

  it('2. very precise decimals are handled', () => {
    const precise = '0.123456789';
    const result = parseDecimalToRational(precise);
    expect(result.denominator > 1n).toBe(true);
    // Should normalize to lowest terms
    expect(Number.isFinite(rationalToNumber(result))).toBe(true);
  });

  it('3. many decimal places are handled correctly', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 9 }),
        fc.integer({ min: 1, max: 6 }),
        (digit, places) => {
          const fracPart = String(digit).repeat(places);
          const input = `0.${fracPart}`;
          const result = parseDecimalToRational(input);
          return Number.isFinite(rationalToNumber(result));
        },
      ),
      { numRuns: 50 },
    );
  });

  it('4. stress test: 1000 random computations produce valid rationals', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 12 }),
        fc.integer({ min: 1, max: 12 }),
        fc.constantFrom('add', 'subtract', 'multiply', 'divide') as fc.Arbitrary<
          'add' | 'subtract' | 'multiply' | 'divide'
        >,
        (a, b, op) => {
          const result = computeBWArithmeticCorrectAnswer(op, a, b);
          return (
            typeof result.numerator === 'bigint' &&
            typeof result.denominator === 'bigint' &&
            result.denominator > 0n &&
            Number.isFinite(rationalToNumber(result))
          );
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('5. stress test: 1000 random parsings produce valid rationals', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.integer({ min: -1000, max: 1000 }).map(String),
          fc
            .tuple(fc.integer({ min: 0, max: 100 }), fc.integer({ min: 0, max: 999 }))
            .map(([i, f]) => `${i}.${f}`),
          fc
            .tuple(fc.integer({ min: -100, max: -1 }), fc.integer({ min: 0, max: 99 }))
            .map(([i, f]) => `${i}.${f}`),
        ),
        (input) => {
          const result = parseDecimalToRational(input);
          return (
            typeof result.numerator === 'bigint' &&
            typeof result.denominator === 'bigint' &&
            result.denominator > 0n
          );
        },
      ),
      { numRuns: 1000 },
    );
  });
});
