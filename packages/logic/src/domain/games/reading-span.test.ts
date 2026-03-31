import { describe, it, expect } from 'bun:test';
import {
  isSentenceJudgmentCorrect,
  isRecallCorrect,
  countCorrectPositions,
  pickRandom,
  nextSpan,
  computeAbsoluteScore,
  computePartialCreditScore,
  computeSentenceAccuracy,
  computeSummary,
  type ReadingSpanSentence,
  type ReadingSpanSetResult,
} from './reading-span';

// =============================================================================
// Helpers
// =============================================================================

function makeSetResult(overrides: Partial<ReadingSpanSetResult> = {}): ReadingSpanSetResult {
  return {
    setIndex: 0,
    span: 3,
    sentenceCorrect: [true, true, true],
    targetWords: ['chat', 'vent', 'lune'],
    recalledWords: ['chat', 'vent', 'lune'],
    recallCorrect: true,
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
// 1. Sentence Judgment
// =============================================================================

describe('Reading Span — Sentence judgment', () => {
  it('correct when player says true and sentence IS true', () => {
    const sentence: ReadingSpanSentence = { text: 'Le soleil est une etoile', correct: true };
    expect(isSentenceJudgmentCorrect(sentence, true)).toBe(true);
  });

  it('incorrect when player says true but sentence is false', () => {
    const sentence: ReadingSpanSentence = { text: 'Les poissons volent', correct: false };
    expect(isSentenceJudgmentCorrect(sentence, true)).toBe(false);
  });

  it('correct when player says false and sentence IS false', () => {
    const sentence: ReadingSpanSentence = { text: 'Les poissons volent', correct: false };
    expect(isSentenceJudgmentCorrect(sentence, false)).toBe(true);
  });

  it('incorrect when player says false but sentence is true', () => {
    const sentence: ReadingSpanSentence = { text: 'Le soleil est une etoile', correct: true };
    expect(isSentenceJudgmentCorrect(sentence, false)).toBe(false);
  });
});

// =============================================================================
// 2. Word Recall
// =============================================================================

describe('Reading Span — Recall scoring', () => {
  it('perfect recall is correct', () => {
    expect(isRecallCorrect(['chat', 'vent', 'lune'], ['chat', 'vent', 'lune'])).toBe(true);
  });

  it('wrong order is incorrect', () => {
    expect(isRecallCorrect(['chat', 'vent', 'lune'], ['vent', 'chat', 'lune'])).toBe(false);
  });

  it('missing words is incorrect', () => {
    expect(isRecallCorrect(['chat', 'vent', 'lune'], ['chat', 'vent'])).toBe(false);
  });

  it('extra words is incorrect', () => {
    expect(isRecallCorrect(['chat', 'vent'], ['chat', 'vent', 'lune'])).toBe(false);
  });

  it('empty both is correct', () => {
    expect(isRecallCorrect([], [])).toBe(true);
  });

  it('countCorrectPositions handles partial matches', () => {
    expect(countCorrectPositions(['chat', 'vent', 'lune'], ['chat', 'vent', 'lune'])).toBe(3);
    expect(countCorrectPositions(['chat', 'vent', 'lune'], ['chat', 'lune', 'vent'])).toBe(1);
    expect(countCorrectPositions(['chat', 'vent', 'lune'], ['X', 'Y', 'Z'])).toBe(0);
    expect(countCorrectPositions(['chat', 'vent', 'lune'], ['chat'])).toBe(1);
  });
});

// =============================================================================
// 3. pickRandom
// =============================================================================

describe('Reading Span — pickRandom', () => {
  const pool = ['a', 'b', 'c', 'd', 'e', 'f'];

  it('picks the correct number of items', () => {
    expect(pickRandom(pool, 3)).toHaveLength(3);
  });

  it('respects exclusions', () => {
    const picked = pickRandom(pool, 4, ['a', 'b']);
    expect(picked).not.toContain('a');
    expect(picked).not.toContain('b');
    expect(picked).toHaveLength(4);
  });

  it('picks unique items', () => {
    const picked = pickRandom(pool, 5);
    expect(new Set(picked).size).toBe(5);
  });

  it('deterministic with seeded rng', () => {
    const a = pickRandom(pool, 3, [], seededRng(99));
    const b = pickRandom(pool, 3, [], seededRng(99));
    expect(a).toEqual(b);
  });

  it('returns empty if pool is exhausted by exclusions', () => {
    const picked = pickRandom(['a', 'b'], 3, ['a', 'b']);
    expect(picked).toHaveLength(0);
  });
});

// =============================================================================
// 4. Span Progression
// =============================================================================

describe('Reading Span — Span progression', () => {
  it('increases span on success', () => {
    expect(nextSpan(2, true, 0, 0)).toBe(3);
  });

  it('keeps span on failure', () => {
    expect(nextSpan(3, false, 0, 0)).toBe(3);
  });

  it('returns null after max consecutive failures', () => {
    expect(nextSpan(3, false, 1, 0, 7, 2)).toBeNull();
  });

  it('returns null when at maxSpan', () => {
    expect(nextSpan(7, true, 0, 0, 7)).toBeNull();
  });

  it('returns null when maxTrials reached', () => {
    expect(nextSpan(3, true, 0, 13, 7, 2, 14)).toBeNull();
  });

  it('resets consecutive failures on success', () => {
    expect(nextSpan(3, true, 1, 0)).toBe(4);
  });
});

// =============================================================================
// 5. Absolute Score
// =============================================================================

describe('Reading Span — Absolute score', () => {
  it('sums span of perfectly recalled sets', () => {
    const results = [
      makeSetResult({ span: 2, recallCorrect: true }),
      makeSetResult({ span: 3, recallCorrect: false }),
      makeSetResult({ span: 3, recallCorrect: true }),
    ];
    expect(computeAbsoluteScore(results)).toBe(5);
  });

  it('returns 0 when all sets failed', () => {
    const results = [
      makeSetResult({ recallCorrect: false }),
      makeSetResult({ recallCorrect: false }),
    ];
    expect(computeAbsoluteScore(results)).toBe(0);
  });

  it('returns 0 for empty results', () => {
    expect(computeAbsoluteScore([])).toBe(0);
  });
});

// =============================================================================
// 6. Partial Credit Score
// =============================================================================

describe('Reading Span — Partial credit score', () => {
  it('returns 1.0 for all perfect sets', () => {
    const results = [
      makeSetResult({ span: 3, targetWords: ['a', 'b', 'c'], recalledWords: ['a', 'b', 'c'] }),
    ];
    expect(computePartialCreditScore(results)).toBe(1.0);
  });

  it('gives proportional credit for partial recall', () => {
    const results = [
      makeSetResult({
        span: 4,
        targetWords: ['a', 'b', 'c', 'd'],
        recalledWords: ['a', 'b', 'x', 'y'],
      }),
    ];
    expect(computePartialCreditScore(results)).toBe(0.5);
  });

  it('returns 0 for all wrong', () => {
    const results = [
      makeSetResult({
        span: 2,
        targetWords: ['a', 'b'],
        recalledWords: ['x', 'y'],
      }),
    ];
    expect(computePartialCreditScore(results)).toBe(0);
  });

  it('returns 0 for empty', () => {
    expect(computePartialCreditScore([])).toBe(0);
  });
});

// =============================================================================
// 7. Sentence Accuracy
// =============================================================================

describe('Reading Span — Sentence accuracy', () => {
  it('100% when all judgments correct', () => {
    const results = [
      makeSetResult({ sentenceCorrect: [true, true] }),
      makeSetResult({ sentenceCorrect: [true, true, true] }),
    ];
    expect(computeSentenceAccuracy(results)).toBe(100);
  });

  it('0% when all judgments wrong', () => {
    const results = [makeSetResult({ sentenceCorrect: [false, false] })];
    expect(computeSentenceAccuracy(results)).toBe(0);
  });

  it('computes mixed accuracy correctly', () => {
    const results = [
      makeSetResult({ sentenceCorrect: [true, false, true] }), // 2/3
      makeSetResult({ sentenceCorrect: [false] }), // 0/1
    ];
    // 2 correct out of 4 total = 50%
    expect(computeSentenceAccuracy(results)).toBe(50);
  });

  it('returns 0 for empty results', () => {
    expect(computeSentenceAccuracy([])).toBe(0);
  });
});

// =============================================================================
// 8. Summary
// =============================================================================

describe('Reading Span — Summary', () => {
  it('computes all fields correctly', () => {
    const results = [
      makeSetResult({ span: 2, recallCorrect: true, sentenceCorrect: [true, true] }),
      makeSetResult({ span: 3, recallCorrect: true, sentenceCorrect: [true, false, true] }),
      makeSetResult({ span: 4, recallCorrect: false, sentenceCorrect: [true, true, false, false] }),
    ];
    const s = computeSummary(results);
    expect(s.totalSets).toBe(3);
    expect(s.correctSets).toBe(2);
    expect(s.accuracy).toBe(67); // Math.round(2/3*100)
    expect(s.maxSpanReached).toBe(3); // span=4 was failed
    expect(s.absoluteScore).toBe(5); // 2 + 3
    expect(s.sentenceAccuracy).toBe(67); // 6 correct out of 9
  });

  it('handles empty results', () => {
    const s = computeSummary([]);
    expect(s.totalSets).toBe(0);
    expect(s.accuracy).toBe(0);
    expect(s.maxSpanReached).toBe(0);
    expect(s.absoluteScore).toBe(0);
    expect(s.sentenceAccuracy).toBe(0);
    expect(s.partialCreditScore).toBe(0);
  });
});
