import { describe, it, expect } from 'bun:test';
import {
  generateNumber,
  computeCorrectAnswer,
  isAnswerCorrect,
  computeNextIsi,
  shouldContinue,
  computeLongestStreak,
  computeSummary,
  DEFAULT_CONFIG,
  MIN_DIGIT,
  MAX_DIGIT,
  type PasatTrialResult,
  type PasatConfig,
} from './pasat';

// =============================================================================
// Helpers
// =============================================================================

function makeTrialResult(overrides: Partial<PasatTrialResult> = {}): PasatTrialResult {
  return {
    previousNumber: 3,
    currentNumber: 5,
    correctAnswer: 8,
    playerAnswer: 8,
    correct: true,
    responseTimeMs: 1200,
    isiMs: 3000,
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
// 1. Number Generation
// =============================================================================

describe('PASAT — Number generation', () => {
  it('generates numbers between 1 and 9', () => {
    const rng = seededRng();
    for (let i = 0; i < 100; i++) {
      const n = generateNumber(rng);
      expect(n).toBeGreaterThanOrEqual(MIN_DIGIT);
      expect(n).toBeLessThanOrEqual(MAX_DIGIT);
    }
  });

  it('generates integers only', () => {
    const rng = seededRng();
    for (let i = 0; i < 50; i++) {
      const n = generateNumber(rng);
      expect(Number.isInteger(n)).toBe(true);
    }
  });

  it('deterministic with seeded rng', () => {
    const a = generateNumber(seededRng(99));
    const b = generateNumber(seededRng(99));
    expect(a).toBe(b);
  });
});

// =============================================================================
// 2. Correct Answer Computation
// =============================================================================

describe('PASAT — Correct answer', () => {
  it('computes sum of two numbers', () => {
    expect(computeCorrectAnswer(3, 5)).toBe(8);
    expect(computeCorrectAnswer(1, 1)).toBe(2);
    expect(computeCorrectAnswer(9, 9)).toBe(18);
  });

  it('minimum sum is 2 (1+1)', () => {
    expect(computeCorrectAnswer(1, 1)).toBe(2);
  });

  it('maximum sum is 18 (9+9)', () => {
    expect(computeCorrectAnswer(9, 9)).toBe(18);
  });
});

// =============================================================================
// 3. Response Validation
// =============================================================================

describe('PASAT — Response validation', () => {
  it('correct when answer matches sum', () => {
    expect(isAnswerCorrect(3, 5, 8)).toBe(true);
  });

  it('incorrect when answer does not match', () => {
    expect(isAnswerCorrect(3, 5, 7)).toBe(false);
    expect(isAnswerCorrect(3, 5, 9)).toBe(false);
  });

  it('handles edge cases', () => {
    expect(isAnswerCorrect(1, 1, 2)).toBe(true);
    expect(isAnswerCorrect(9, 9, 18)).toBe(true);
    expect(isAnswerCorrect(9, 9, 0)).toBe(false);
  });
});

// =============================================================================
// 4. ISI Adjustment
// =============================================================================

describe('PASAT — ISI adjustment', () => {
  it('does not change ISI on incorrect answer', () => {
    expect(computeNextIsi(3000, false, 2)).toBe(3000);
  });

  it('does not change ISI when streak is below threshold', () => {
    // consecutiveCorrect=1 + 1 = 2, not multiple of 3
    expect(computeNextIsi(3000, true, 1)).toBe(3000);
  });

  it('decreases ISI when streak hits speedup threshold', () => {
    // consecutiveCorrect=2 + 1 = 3, which is a multiple of 3
    expect(computeNextIsi(3000, true, 2)).toBe(2750);
  });

  it('clamps ISI to minIsiMs', () => {
    expect(computeNextIsi(1600, true, 2)).toBe(1500); // 1600 - 250 = 1350, clamped to 1500
  });

  it('does not go below minIsiMs', () => {
    expect(computeNextIsi(1500, true, 2)).toBe(1500);
  });

  it('works with custom config', () => {
    const config: PasatConfig = { ...DEFAULT_CONFIG, isiSpeedupStreak: 2, isiStepMs: 500 };
    // consecutiveCorrect=1 + 1 = 2, multiple of 2
    expect(computeNextIsi(3000, true, 1, config)).toBe(2500);
  });
});

// =============================================================================
// 5. Session Continuation
// =============================================================================

describe('PASAT — Session continuation', () => {
  it('continues when below limits', () => {
    expect(shouldContinue(5, 0)).toBe(true);
  });

  it('stops at max consecutive failures', () => {
    expect(shouldContinue(5, 3)).toBe(false);
  });

  it('stops at max trials', () => {
    expect(shouldContinue(59, 0)).toBe(false);
  });

  it('continues at max-1 trials', () => {
    expect(shouldContinue(58, 0)).toBe(true);
  });

  it('works with custom config', () => {
    const config: PasatConfig = { ...DEFAULT_CONFIG, maxConsecutiveFailures: 5, maxTrials: 10 };
    expect(shouldContinue(8, 3, config)).toBe(true);
    expect(shouldContinue(8, 5, config)).toBe(false);
    expect(shouldContinue(9, 0, config)).toBe(false);
  });
});

// =============================================================================
// 6. Longest Streak
// =============================================================================

describe('PASAT — Longest streak', () => {
  it('computes correct longest streak', () => {
    const results = [
      makeTrialResult({ correct: true }),
      makeTrialResult({ correct: true }),
      makeTrialResult({ correct: false }),
      makeTrialResult({ correct: true }),
      makeTrialResult({ correct: true }),
      makeTrialResult({ correct: true }),
      makeTrialResult({ correct: false }),
    ];
    expect(computeLongestStreak(results)).toBe(3);
  });

  it('returns 0 for all incorrect', () => {
    const results = [makeTrialResult({ correct: false }), makeTrialResult({ correct: false })];
    expect(computeLongestStreak(results)).toBe(0);
  });

  it('returns full length for all correct', () => {
    const results = [
      makeTrialResult({ correct: true }),
      makeTrialResult({ correct: true }),
      makeTrialResult({ correct: true }),
    ];
    expect(computeLongestStreak(results)).toBe(3);
  });

  it('returns 0 for empty', () => {
    expect(computeLongestStreak([])).toBe(0);
  });
});

// =============================================================================
// 7. Summary
// =============================================================================

describe('PASAT — Summary', () => {
  it('computes accuracy correctly', () => {
    const results = [
      makeTrialResult({ correct: true }),
      makeTrialResult({ correct: true }),
      makeTrialResult({ correct: false }),
      makeTrialResult({ correct: true }),
    ];
    const s = computeSummary(results);
    expect(s.accuracy).toBe(75);
    expect(s.correctTrials).toBe(3);
    expect(s.totalTrials).toBe(4);
  });

  it('computes fastest ISI', () => {
    const results = [
      makeTrialResult({ isiMs: 3000 }),
      makeTrialResult({ isiMs: 2500 }),
      makeTrialResult({ isiMs: 2750 }),
    ];
    const s = computeSummary(results);
    expect(s.fastestIsiMs).toBe(2500);
  });

  it('computes avg response time excluding timeouts', () => {
    const results = [
      makeTrialResult({ playerAnswer: 8, responseTimeMs: 1000 }),
      makeTrialResult({ playerAnswer: null, responseTimeMs: 3000 }), // timeout
      makeTrialResult({ playerAnswer: 5, responseTimeMs: 1500 }),
    ];
    const s = computeSummary(results);
    expect(s.avgResponseTimeMs).toBe(1250); // (1000 + 1500) / 2
  });

  it('avgResponseTimeMs is 0 when all timeouts', () => {
    const results = [
      makeTrialResult({ playerAnswer: null }),
      makeTrialResult({ playerAnswer: null }),
    ];
    expect(computeSummary(results).avgResponseTimeMs).toBe(0);
  });

  it('includes longest streak', () => {
    const results = [
      makeTrialResult({ correct: true }),
      makeTrialResult({ correct: true }),
      makeTrialResult({ correct: false }),
      makeTrialResult({ correct: true }),
    ];
    expect(computeSummary(results).longestStreak).toBe(2);
  });

  it('handles empty results', () => {
    const s = computeSummary([]);
    expect(s.totalTrials).toBe(0);
    expect(s.accuracy).toBe(0);
    expect(s.fastestIsiMs).toBe(0);
    expect(s.avgResponseTimeMs).toBe(0);
    expect(s.longestStreak).toBe(0);
  });
});
