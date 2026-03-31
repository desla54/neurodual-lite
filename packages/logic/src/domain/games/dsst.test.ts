import { describe, expect, it } from 'bun:test';
import {
  DIGIT_SYMBOL_KEY,
  SYMBOLS,
  classifyResponse,
  computeSummary,
  correctSymbolForDigit,
  pickRandomDigit,
  type DsstTrialResult,
} from './dsst';

// =============================================================================
// pickRandomDigit
// =============================================================================

describe('pickRandomDigit', () => {
  it('returns a digit between 1 and 9', () => {
    for (let i = 0; i < 100; i++) {
      const d = pickRandomDigit();
      expect(d).toBeGreaterThanOrEqual(1);
      expect(d).toBeLessThanOrEqual(9);
    }
  });

  it('never returns the excluded digit', () => {
    let call = 0;
    const rng = () => (call++ === 0 ? 0 : 0.5); // First call yields 1 (excluded), second yields 5
    const d = pickRandomDigit(1, rng);
    expect(d).not.toBe(1);
    expect(d).toBe(5);
  });

  it('uses custom rng', () => {
    // rng returning 0.5 → floor(0.5*9)+1 = 5
    const d = pickRandomDigit(undefined, () => 0.5);
    expect(d).toBe(5);
  });
});

// =============================================================================
// DIGIT_SYMBOL_KEY
// =============================================================================

describe('DIGIT_SYMBOL_KEY', () => {
  it('maps 9 digits to 9 unique symbols', () => {
    expect(DIGIT_SYMBOL_KEY).toHaveLength(9);
    const symbols = DIGIT_SYMBOL_KEY.map((k) => k.symbol);
    expect(new Set(symbols).size).toBe(9);
  });

  it('digits are 1-9 in order', () => {
    for (let i = 0; i < DIGIT_SYMBOL_KEY.length; i++) {
      expect(DIGIT_SYMBOL_KEY[i]?.digit).toBe(i + 1);
    }
  });
});

// =============================================================================
// correctSymbolForDigit / classifyResponse
// =============================================================================

describe('correctSymbolForDigit', () => {
  it('returns the correct symbol for each digit', () => {
    for (let d = 1; d <= 9; d++) {
      // @ts-expect-error test override
      expect(correctSymbolForDigit(d)).toBe(SYMBOLS[d - 1]);
    }
  });
});

describe('classifyResponse', () => {
  it('returns true for correct match', () => {
    expect(classifyResponse(1, SYMBOLS[0] as string)).toBe(true);
  });

  it('returns false for wrong symbol', () => {
    expect(classifyResponse(1, SYMBOLS[1] as string)).toBe(false);
  });
});

// =============================================================================
// computeSummary
// =============================================================================

describe('computeSummary', () => {
  const makeResult = (digit: number, correct: boolean, rt: number): DsstTrialResult => ({
    digit,
    correctSymbol: correctSymbolForDigit(digit),
    response: correct ? correctSymbolForDigit(digit) : '?',
    correct,
    rt,
  });

  it('computes accuracy', () => {
    const results = [
      makeResult(1, true, 500),
      makeResult(2, true, 600),
      makeResult(3, false, 700),
      makeResult(4, true, 400),
    ];
    const s = computeSummary(results, 60_000);
    expect(s.accuracy).toBe(75);
    expect(s.correctTrials).toBe(3);
    expect(s.totalAttempts).toBe(4);
  });

  it('computes avgRT from correct trials only', () => {
    const results = [
      makeResult(1, true, 500),
      makeResult(2, false, 9000), // should be excluded
      makeResult(3, true, 700),
    ];
    const s = computeSummary(results, 60_000);
    expect(s.avgRT).toBe(600); // (500+700)/2
  });

  it('computes items per minute', () => {
    const results = Array.from({ length: 30 }, (_, i) => makeResult((i % 9) + 1, true, 500));
    const s = computeSummary(results, 60_000);
    expect(s.itemsPerMinute).toBe(30);
  });

  it('handles empty results', () => {
    const s = computeSummary([], 60_000);
    expect(s.accuracy).toBe(0);
    expect(s.avgRT).toBe(0);
    expect(s.correctTrials).toBe(0);
    expect(s.totalAttempts).toBe(0);
  });

  it('handles all wrong', () => {
    const results = [makeResult(1, false, 500), makeResult(2, false, 600)];
    const s = computeSummary(results, 60_000);
    expect(s.accuracy).toBe(0);
    expect(s.avgRT).toBe(0);
    expect(s.correctTrials).toBe(0);
  });
});
