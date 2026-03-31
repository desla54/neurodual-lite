import { describe, it, expect } from 'bun:test';
import {
  type SwmRoundResult,
  generateTokenPosition,
  classifyBoxOpen,
  evaluateRound,
  computeStrategyScore,
  computeNextSpan,
  computeSummary,
  shouldEndSession,
} from './swm';

// =============================================================================
// Helpers
// =============================================================================

function makeRound(
  span: number,
  withinErrors: number,
  betweenErrors: number,
  searchesUsed: number,
  roundTimeMs: number,
): SwmRoundResult {
  return evaluateRound(span, withinErrors, betweenErrors, searchesUsed, roundTimeMs);
}

// =============================================================================
// 1. Token Position Generation
// =============================================================================

describe('SWM — Token position generation', () => {
  it('generates a position within valid range', () => {
    for (let i = 0; i < 50; i++) {
      const pos = generateTokenPosition(6, []);
      expect(pos).toBeGreaterThanOrEqual(0);
      expect(pos).toBeLessThan(6);
    }
  });

  it('never places token on a found position', () => {
    const found = [0, 1, 2, 3];
    for (let i = 0; i < 50; i++) {
      const pos = generateTokenPosition(6, found);
      expect(found.includes(pos)).toBe(false);
    }
  });

  it('returns the only available position when one remains', () => {
    const pos = generateTokenPosition(4, [0, 1, 3]);
    expect(pos).toBe(2);
  });

  it('returns 0 when all positions are found (edge case)', () => {
    const pos = generateTokenPosition(3, [0, 1, 2]);
    expect(pos).toBe(0);
  });

  it('uses provided RNG for reproducibility', () => {
    let seed = 42;
    const rng = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const pos1 = generateTokenPosition(8, [], rng);

    seed = 42;
    const pos2 = generateTokenPosition(8, [], rng);
    expect(pos1).toBe(pos2);
  });
});

// =============================================================================
// 2. Error Classification
// =============================================================================

describe('SWM — Error classification', () => {
  it('returns "ok" for a fresh box', () => {
    expect(classifyBoxOpen(3, [], [])).toBe('ok');
  });

  it('returns "within" for a box already opened this round', () => {
    expect(classifyBoxOpen(2, [0, 1, 2], [])).toBe('within');
  });

  it('returns "between" for a box where a token was previously found', () => {
    expect(classifyBoxOpen(1, [], [1, 3])).toBe('between');
  });

  it('between takes priority when box is both found and opened', () => {
    // A found box should be classified as between-error even if also opened this round
    expect(classifyBoxOpen(1, [1], [1])).toBe('between');
  });

  it('returns "ok" for a box not in either list', () => {
    expect(classifyBoxOpen(5, [0, 1, 2], [3, 4])).toBe('ok');
  });
});

// =============================================================================
// 3. Round Evaluation
// =============================================================================

describe('SWM — Round evaluation', () => {
  it('round with zero errors is correct', () => {
    const result = evaluateRound(6, 0, 0, 3, 2000);
    expect(result.correct).toBe(true);
    expect(result.totalErrors).toBe(0);
    expect(result.searchesUsed).toBe(3);
    expect(result.roundTimeMs).toBe(2000);
  });

  it('round with within errors is incorrect', () => {
    const result = evaluateRound(6, 2, 0, 5, 3000);
    expect(result.correct).toBe(false);
    expect(result.totalErrors).toBe(2);
    expect(result.withinSearchErrors).toBe(2);
  });

  it('round with between errors is incorrect', () => {
    const result = evaluateRound(6, 0, 1, 4, 2500);
    expect(result.correct).toBe(false);
    expect(result.totalErrors).toBe(1);
    expect(result.betweenSearchErrors).toBe(1);
  });

  it('round with both error types sums them', () => {
    const result = evaluateRound(8, 2, 3, 10, 5000);
    expect(result.correct).toBe(false);
    expect(result.totalErrors).toBe(5);
    expect(result.withinSearchErrors).toBe(2);
    expect(result.betweenSearchErrors).toBe(3);
  });

  it('preserves span in result', () => {
    const result = evaluateRound(10, 0, 0, 1, 500);
    expect(result.span).toBe(10);
  });
});

// =============================================================================
// 4. Strategy Score
// =============================================================================

describe('SWM — Strategy score', () => {
  it('returns 0 for empty input', () => {
    expect(computeStrategyScore([])).toBe(0);
  });

  it('returns 0 for a single round', () => {
    expect(computeStrategyScore([3])).toBe(0);
  });

  it('returns 0 when all rounds start from the same box (perfectly systematic)', () => {
    expect(computeStrategyScore([0, 0, 0, 0, 0])).toBe(0);
  });

  it('returns rounds-1 when every round starts from a different box', () => {
    expect(computeStrategyScore([0, 1, 2, 3, 4])).toBe(4);
  });

  it('returns correct count for mixed pattern', () => {
    // [0, 0, 1, 1, 0] => changes at index 2 and 4 => score = 2
    expect(computeStrategyScore([0, 0, 1, 1, 0])).toBe(2);
  });

  it('handles alternating pattern', () => {
    expect(computeStrategyScore([0, 1, 0, 1])).toBe(3);
  });
});

// =============================================================================
// 5. Span Progression
// =============================================================================

describe('SWM — Span progression', () => {
  it('does not increase span on failure', () => {
    expect(computeNextSpan(4, 10, 1, false)).toBe(4);
  });

  it('does not increase span before reaching required consecutive correct', () => {
    expect(computeNextSpan(4, 10, 0, true, 2)).toBe(4);
  });

  it('increases span after required consecutive correct rounds', () => {
    expect(computeNextSpan(4, 10, 1, true, 2)).toBe(5);
  });

  it('does not exceed max span', () => {
    expect(computeNextSpan(10, 10, 1, true, 2)).toBe(10);
  });

  it('works with custom required consecutive count', () => {
    expect(computeNextSpan(4, 12, 2, true, 3)).toBe(5);
    expect(computeNextSpan(4, 12, 1, true, 3)).toBe(4);
  });
});

// =============================================================================
// 6. Session Summary
// =============================================================================

describe('SWM — Summary computation', () => {
  it('computes accuracy correctly', () => {
    const results = [
      makeRound(4, 0, 0, 2, 1000), // correct
      makeRound(4, 1, 0, 3, 1200), // incorrect
      makeRound(4, 0, 0, 1, 800), // correct
      makeRound(5, 0, 1, 4, 2000), // incorrect
    ];
    const summary = computeSummary(results);
    expect(summary.accuracy).toBe(50); // 2/4
    expect(summary.correctRounds).toBe(2);
    expect(summary.totalRounds).toBe(4);
  });

  it('computes 100% accuracy when all correct', () => {
    const results = [makeRound(4, 0, 0, 1, 500), makeRound(4, 0, 0, 2, 600)];
    const summary = computeSummary(results);
    expect(summary.accuracy).toBe(100);
  });

  it('computes 0% accuracy when all incorrect', () => {
    const results = [makeRound(4, 2, 0, 5, 2000), makeRound(4, 0, 1, 3, 1500)];
    const summary = computeSummary(results);
    expect(summary.accuracy).toBe(0);
  });

  it('computes maxSpanReached from correct rounds only', () => {
    const results = [
      makeRound(4, 0, 0, 1, 500), // correct, span 4
      makeRound(5, 2, 0, 5, 3000), // incorrect, span 5 (not counted)
      makeRound(6, 0, 0, 2, 700), // correct, span 6
    ];
    const summary = computeSummary(results);
    expect(summary.maxSpanReached).toBe(6);
  });

  it('maxSpanReached is 0 when no correct rounds', () => {
    const results = [makeRound(4, 1, 0, 3, 1000)];
    const summary = computeSummary(results);
    expect(summary.maxSpanReached).toBe(0);
  });

  it('aggregates error counts', () => {
    const results = [makeRound(4, 1, 2, 5, 2000), makeRound(5, 3, 0, 6, 2500)];
    const summary = computeSummary(results);
    expect(summary.totalWithinErrors).toBe(4);
    expect(summary.totalBetweenErrors).toBe(2);
    expect(summary.totalErrors).toBe(6);
  });

  it('computes average round time (excludes zero-time rounds)', () => {
    const results = [
      makeRound(4, 0, 0, 1, 1000),
      makeRound(4, 0, 0, 2, 2000),
      makeRound(4, 0, 0, 1, 0), // zero time (excluded from avg)
    ];
    const summary = computeSummary(results);
    expect(summary.avgRoundTimeMs).toBe(1500);
  });

  it('includes strategy score', () => {
    const results = [
      makeRound(4, 0, 0, 1, 500),
      makeRound(4, 0, 0, 1, 600),
      makeRound(4, 0, 0, 1, 700),
    ];
    const firstBoxes = [0, 0, 1]; // score = 1
    const summary = computeSummary(results, firstBoxes);
    expect(summary.strategyScore).toBe(1);
  });

  it('handles empty results', () => {
    const summary = computeSummary([]);
    expect(summary.accuracy).toBe(0);
    expect(summary.totalRounds).toBe(0);
    expect(summary.maxSpanReached).toBe(0);
    expect(summary.totalErrors).toBe(0);
    expect(summary.avgRoundTimeMs).toBe(0);
    expect(summary.strategyScore).toBe(0);
  });
});

// =============================================================================
// 7. Session Termination
// =============================================================================

describe('SWM — Session termination', () => {
  it('ends when max trials reached', () => {
    expect(shouldEndSession(11, 12, 0, 3)).toBe(true);
  });

  it('ends when consecutive failures reached', () => {
    expect(shouldEndSession(5, 12, 3, 3)).toBe(true);
  });

  it('does not end when neither condition met', () => {
    expect(shouldEndSession(5, 12, 1, 3)).toBe(false);
  });

  it('does not end on first trial', () => {
    expect(shouldEndSession(0, 12, 0, 3)).toBe(false);
  });
});
