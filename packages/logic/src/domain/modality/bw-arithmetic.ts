/**
 * Brain Workshop - Arithmetic helpers (faithful).
 *
 * BW arithmetic differs from classic "match" modalities:
 * - The stimulus is a NUMBER shown visually each trial.
 * - The OPERATION is an audio cue (add/subtract/multiply/divide).
 * - The user types the RESULT of: n-back NUMBER (left operand) OP current NUMBER.
 * - Correctness is evaluated at trial end (no dedicated "match" key).
 */

import type { BWArithmeticOperation } from '../types';

export const BW_ARITHMETIC_DEFAULT_MAX_NUMBER = 12;
export const BW_ARITHMETIC_DEFAULT_USE_NEGATIVES = false;
export const BW_ARITHMETIC_DEFAULT_ACCEPTABLE_DECIMALS = [
  '0.1',
  '0.2',
  '0.3',
  '0.4',
  '0.5',
  '0.6',
  '0.7',
  '0.8',
  '0.9',
  '0.125',
  '0.25',
  '0.375',
  '0.625',
  '0.75',
  '0.875',
  '0.15',
  '0.35',
  '0.45',
  '0.55',
  '0.65',
  '0.85',
  '0.95',
] as const;

export function getBWArithmeticOperationsFromDifficulty(
  difficulty: 1 | 2 | 3 | 4,
): readonly BWArithmeticOperation[] {
  switch (difficulty) {
    case 1:
      return ['add'];
    case 2:
      return ['add', 'subtract'];
    case 3:
      return ['add', 'subtract', 'multiply'];
    default:
      return ['add', 'subtract', 'multiply', 'divide'];
  }
}

export interface Rational {
  readonly numerator: bigint;
  readonly denominator: bigint; // always > 0
}

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

function normalizeRational(numerator: bigint, denominator: bigint): Rational {
  if (denominator === 0n) {
    throw new Error('Invalid rational: denominator is 0');
  }
  if (numerator === 0n) {
    return { numerator: 0n, denominator: 1n };
  }
  const sign = denominator < 0n ? -1n : 1n;
  const den = denominator < 0n ? -denominator : denominator;
  const num = numerator * sign;
  const g = gcd(num, den);
  return { numerator: num / g, denominator: den / g };
}

function pow10(exp: number): bigint {
  let result = 1n;
  for (let i = 0; i < exp; i++) result *= 10n;
  return result;
}

export function parseDecimalToRational(input: string): Rational {
  const trimmed = input.trim();
  if (trimmed === '' || trimmed === '.') return { numerator: 0n, denominator: 1n };

  const negative = trimmed.startsWith('-');
  const raw = negative ? trimmed.slice(1) : trimmed;

  const [intPartRaw, fracPartRaw] = raw.split('.', 2);
  const intPart = intPartRaw === '' ? '0' : intPartRaw;
  const fracPart = fracPartRaw ?? '';

  const digits = `${intPart}${fracPart}`.replace(/^0+(?=\d)/, '');
  const numeratorAbs = digits === '' ? 0n : BigInt(digits);
  const denominator = fracPart.length > 0 ? pow10(fracPart.length) : 1n;

  const numerator = negative ? -numeratorAbs : numeratorAbs;
  return normalizeRational(numerator, denominator);
}

export function parseBWArithmeticAnswer(chars: string, isNegative: boolean): Rational {
  const core = chars === '' || chars === '.' ? '0' : chars;
  const parsed = parseDecimalToRational(core);
  if (!isNegative) return parsed;
  return normalizeRational(0n - parsed.numerator, parsed.denominator);
}

export function rationalEquals(a: Rational, b: Rational): boolean {
  return a.numerator === b.numerator && a.denominator === b.denominator;
}

export function computeBWArithmeticCorrectAnswer(
  operation: BWArithmeticOperation,
  nBackNumber: number,
  currentNumber: number,
): Rational {
  const a = BigInt(nBackNumber);
  const b = BigInt(currentNumber);

  switch (operation) {
    case 'add':
      return normalizeRational(a + b, 1n);
    case 'subtract':
      return normalizeRational(a - b, 1n);
    case 'multiply':
      return normalizeRational(a * b, 1n);
    case 'divide':
      return normalizeRational(a, b);
  }
}

function absInt(n: number): number {
  return n < 0 ? -n : n;
}

export function isBWAcceptableDivideStimulus({
  numberNBack,
  candidate,
  acceptableDecimals,
}: {
  numberNBack: number;
  candidate: number;
  acceptableDecimals: readonly string[];
}): boolean {
  if (candidate === 0) return false;

  // BW: divisible ⇒ always allowed
  if (numberNBack % candidate === 0) return true;

  const numerator = absInt(numberNBack);
  const denominator = absInt(candidate);
  if (denominator === 0) return false;

  const remainder = numerator % denominator;
  const frac = normalizeRational(BigInt(remainder), BigInt(denominator));

  for (const dec of acceptableDecimals) {
    const allowed = parseDecimalToRational(dec);
    if (rationalEquals(frac, allowed)) return true;
  }

  return false;
}
