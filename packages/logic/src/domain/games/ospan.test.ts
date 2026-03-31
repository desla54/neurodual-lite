import { describe, it, expect } from 'bun:test';
import {
  generateEquation,
  isEquationAnswerCorrect,
  selectLetters,
  isRecallCorrect,
  countCorrectPositions,
  computeAbsoluteScore,
  computePartialCreditScore,
  nextSpan,
  computeSummary,
  LETTER_POOL,
  type OspanEquation,
  type OspanSetResult,
} from './ospan';

// =============================================================================
// Helpers
// =============================================================================

function makeSetResult(overrides: Partial<OspanSetResult> = {}): OspanSetResult {
  return {
    span: 3,
    targetLetters: ['F', 'H', 'J'],
    recalledLetters: ['F', 'H', 'J'],
    recallCorrect: true,
    equationAccuracy: 100,
    responseTimeMs: 2000,
    ...overrides,
  };
}

function seededRng(seed = 42): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return s / 2147483647;
  };
}

// =============================================================================
// 1. Equation Generation
// =============================================================================

describe('OSPAN — Equation generation', () => {
  it('generates an equation with operands 1-10', () => {
    const rng = seededRng();
    const eq = generateEquation(rng);
    expect(eq.equation).toMatch(/^\d+ [+-] \d+$/);
  });

  it('generates correct equations (display matches)', () => {
    // Force: rng returns high values to get specific paths
    let calls = 0;
    const rng = () => {
      calls++;
      // a=10, b=10, isAdd=true (0.99>=0.5 false => subtract), showWrong=false (0.99>=0.5 true => showWrong)
      // Let's just use seeded rng
      return 0.99;
    };
    const eq = generateEquation(rng);
    expect(eq.display).toContain('=');
  });

  it('can generate equations where displayed answer is wrong', () => {
    // Use rng that forces showWrong=true (rng < 0.5 for 4th call)
    let callIdx = 0;
    const values = [0.5, 0.5, 0.6, 0.3, 0.7]; // a=6, b=6, isAdd=true(0.6>=0.5 no->subtract), showWrong=true(0.3<0.5), offset=+1(0.7>=0.5)
    const rng = () => values[callIdx++] ?? 0.5;
    const eq = generateEquation(rng);
    expect(eq.correctAnswer).toBe(false);
  });

  it('can generate equations where displayed answer is correct', () => {
    let callIdx = 0;
    const values = [0.5, 0.5, 0.3, 0.7]; // a=6, b=6, isAdd=true(0.3<0.5), showWrong=false(0.7>=0.5)
    const rng = () => values[callIdx++] ?? 0.5;
    const eq = generateEquation(rng);
    expect(eq.correctAnswer).toBe(true);
  });

  it('equation string does not include the answer', () => {
    const rng = seededRng();
    const eq = generateEquation(rng);
    expect(eq.equation).not.toContain('=');
  });
});

// =============================================================================
// 2. Equation Answer Checking
// =============================================================================

describe('OSPAN — Equation answer checking', () => {
  it('correct when player says true and equation IS correct', () => {
    const eq: OspanEquation = { equation: '3 + 5', display: '3 + 5 = 8', correctAnswer: true };
    expect(isEquationAnswerCorrect(eq, true)).toBe(true);
  });

  it('incorrect when player says true but equation is wrong', () => {
    const eq: OspanEquation = { equation: '3 + 5', display: '3 + 5 = 9', correctAnswer: false };
    expect(isEquationAnswerCorrect(eq, true)).toBe(false);
  });

  it('correct when player says false and equation IS wrong', () => {
    const eq: OspanEquation = { equation: '3 + 5', display: '3 + 5 = 9', correctAnswer: false };
    expect(isEquationAnswerCorrect(eq, false)).toBe(true);
  });

  it('incorrect when player says false but equation is correct', () => {
    const eq: OspanEquation = { equation: '3 + 5', display: '3 + 5 = 8', correctAnswer: true };
    expect(isEquationAnswerCorrect(eq, false)).toBe(false);
  });
});

// =============================================================================
// 3. Letter Selection
// =============================================================================

describe('OSPAN — Letter selection', () => {
  it('selects the correct number of letters', () => {
    const letters = selectLetters(4);
    expect(letters).toHaveLength(4);
  });

  it('selects unique letters', () => {
    const letters = selectLetters(8);
    const unique = new Set(letters);
    expect(unique.size).toBe(8);
  });

  it('all letters come from the pool', () => {
    const letters = selectLetters(6);
    for (const l of letters) {
      expect(LETTER_POOL).toContain(l as any);
    }
  });

  it('produces deterministic results with seeded rng', () => {
    const a = selectLetters(5, LETTER_POOL, seededRng(123));
    const b = selectLetters(5, LETTER_POOL, seededRng(123));
    expect(a).toEqual(b);
  });

  it('cannot select more letters than the pool size', () => {
    const letters = selectLetters(LETTER_POOL.length);
    expect(letters).toHaveLength(LETTER_POOL.length);
    expect(new Set(letters).size).toBe(LETTER_POOL.length);
  });
});

// =============================================================================
// 4. Recall Scoring
// =============================================================================

describe('OSPAN — Recall scoring', () => {
  it('perfect recall is correct', () => {
    expect(isRecallCorrect(['F', 'H', 'J'], ['F', 'H', 'J'])).toBe(true);
  });

  it('wrong order is incorrect', () => {
    expect(isRecallCorrect(['F', 'H', 'J'], ['H', 'F', 'J'])).toBe(false);
  });

  it('missing letters is incorrect', () => {
    expect(isRecallCorrect(['F', 'H', 'J'], ['F', 'H'])).toBe(false);
  });

  it('extra letters is incorrect', () => {
    expect(isRecallCorrect(['F', 'H'], ['F', 'H', 'J'])).toBe(false);
  });

  it('empty recall vs non-empty target is incorrect', () => {
    expect(isRecallCorrect(['F'], [])).toBe(false);
  });

  it('both empty is correct', () => {
    expect(isRecallCorrect([], [])).toBe(true);
  });

  it('countCorrectPositions counts position matches', () => {
    expect(countCorrectPositions(['F', 'H', 'J'], ['F', 'H', 'J'])).toBe(3);
    expect(countCorrectPositions(['F', 'H', 'J'], ['F', 'J', 'H'])).toBe(1);
    expect(countCorrectPositions(['F', 'H', 'J'], ['X', 'Y', 'Z'])).toBe(0);
    expect(countCorrectPositions(['F', 'H', 'J'], ['F'])).toBe(1);
    expect(countCorrectPositions([], [])).toBe(0);
  });
});

// =============================================================================
// 5. OSPAN Absolute Score
// =============================================================================

describe('OSPAN — Absolute score', () => {
  it('sums span of perfectly recalled sets only', () => {
    const results = [
      makeSetResult({ span: 3, recallCorrect: true }),
      makeSetResult({ span: 4, recallCorrect: false }),
      makeSetResult({ span: 4, recallCorrect: true }),
    ];
    expect(computeAbsoluteScore(results)).toBe(7); // 3 + 4
  });

  it('returns 0 when no sets are correct', () => {
    const results = [
      makeSetResult({ span: 3, recallCorrect: false }),
      makeSetResult({ span: 4, recallCorrect: false }),
    ];
    expect(computeAbsoluteScore(results)).toBe(0);
  });

  it('returns 0 for empty results', () => {
    expect(computeAbsoluteScore([])).toBe(0);
  });
});

// =============================================================================
// 6. OSPAN Partial Credit Score
// =============================================================================

describe('OSPAN — Partial credit score', () => {
  it('returns total items when all sets are perfect', () => {
    const results = [
      makeSetResult({ span: 3, targetLetters: ['F', 'H', 'J'], recalledLetters: ['F', 'H', 'J'] }),
      makeSetResult({ span: 2, targetLetters: ['K', 'L'], recalledLetters: ['K', 'L'] }),
    ];
    // 3 + 2 = 5 items all in correct position
    expect(computePartialCreditScore(results)).toBe(5);
  });

  it('gives partial credit for partially correct recall', () => {
    const results = [
      makeSetResult({
        span: 4,
        targetLetters: ['F', 'H', 'J', 'K'],
        recalledLetters: ['F', 'H', 'X', 'Y'], // 2/4 correct positions
      }),
    ];
    expect(computePartialCreditScore(results)).toBe(2);
  });

  it('returns 0 when all positions are wrong', () => {
    const results = [
      makeSetResult({
        span: 3,
        targetLetters: ['F', 'H', 'J'],
        recalledLetters: ['X', 'Y', 'Z'],
      }),
    ];
    expect(computePartialCreditScore(results)).toBe(0);
  });

  it('returns 0 for empty results', () => {
    expect(computePartialCreditScore([])).toBe(0);
  });
});

// =============================================================================
// 7. Span Progression
// =============================================================================

describe('OSPAN — Span progression', () => {
  it('increases span on success', () => {
    expect(nextSpan(3, true, 0)).toBe(4);
  });

  it('keeps span on failure', () => {
    expect(nextSpan(3, false, 0)).toBe(3);
  });

  it('returns null after max consecutive failures', () => {
    expect(nextSpan(3, false, 1, 7, 2)).toBeNull();
  });

  it('returns null when next span exceeds maxSpan', () => {
    expect(nextSpan(7, true, 0, 7)).toBeNull();
  });

  it('resets consecutive failures on success', () => {
    // After 1 failure, a success should allow continuing
    expect(nextSpan(3, true, 1)).toBe(4);
  });
});

// =============================================================================
// 8. Summary
// =============================================================================

describe('OSPAN — Summary', () => {
  it('computes accuracy as percent of correct sets', () => {
    const results = [
      makeSetResult({ recallCorrect: true }),
      makeSetResult({ recallCorrect: false }),
      makeSetResult({ recallCorrect: true }),
      makeSetResult({ recallCorrect: true }),
    ];
    const s = computeSummary(results);
    expect(s.accuracy).toBe(75);
    expect(s.correctSets).toBe(3);
    expect(s.totalSets).toBe(4);
  });

  it('finds maxSpanReached from correct sets only', () => {
    const results = [
      makeSetResult({ span: 3, recallCorrect: true }),
      makeSetResult({ span: 5, recallCorrect: false }),
      makeSetResult({ span: 4, recallCorrect: true }),
    ];
    const s = computeSummary(results);
    expect(s.maxSpanReached).toBe(4); // span=5 was failed
  });

  it('includes absolute and partial credit scores', () => {
    const results = [
      makeSetResult({
        span: 3,
        targetLetters: ['F', 'H', 'J'],
        recalledLetters: ['F', 'H', 'J'],
        recallCorrect: true,
      }),
      makeSetResult({
        span: 4,
        targetLetters: ['K', 'L', 'N', 'P'],
        recalledLetters: ['K', 'L', 'X', 'Y'],
        recallCorrect: false,
      }),
    ];
    const s = computeSummary(results);
    expect(s.absoluteScore).toBe(3); // only the span=3 set
    // partial credit = 3 (all correct from set 1) + 2 (2/4 correct from set 2) = 5
    expect(s.partialCreditScore).toBe(5);
  });

  it('handles empty results', () => {
    const s = computeSummary([]);
    expect(s.totalSets).toBe(0);
    expect(s.accuracy).toBe(0);
    expect(s.absoluteScore).toBe(0);
    expect(s.partialCreditScore).toBe(0);
    expect(s.maxSpanReached).toBe(0);
  });
});
