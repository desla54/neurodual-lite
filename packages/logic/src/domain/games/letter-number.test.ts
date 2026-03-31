import { describe, it, expect } from 'bun:test';
import {
  type TrialResult,
  generateMixedSequence,
  getCorrectOrder,
  validateRecall,
  createInitialState,
  advanceState,
  computeSummary,
  DEFAULT_START_SPAN,
  MAX_SPAN,
  LETTERS,
  NUMBERS,
} from './letter-number';

// =============================================================================
// 1. Sequence Generation
// =============================================================================

describe('Letter-Number — Sequence generation', () => {
  it('generates a sequence of the correct length', () => {
    expect(generateMixedSequence(3)).toHaveLength(3);
    expect(generateMixedSequence(7)).toHaveLength(7);
    expect(generateMixedSequence(1)).toHaveLength(1);
  });

  it('returns empty for length 0', () => {
    expect(generateMixedSequence(0)).toHaveLength(0);
  });

  it('contains at least 1 letter and 1 number when length >= 2', () => {
    for (let attempt = 0; attempt < 20; attempt++) {
      const seq = generateMixedSequence(4);
      const hasLetter = seq.some((s) => /^[A-Z]$/.test(s));
      const hasNumber = seq.some((s) => /^\d$/.test(s));
      expect(hasLetter).toBe(true);
      expect(hasNumber).toBe(true);
    }
  });

  it('all items are valid letters or numbers', () => {
    const seq = generateMixedSequence(9);
    for (const item of seq) {
      const isValidLetter = LETTERS.includes(item);
      const isValidNumber = NUMBERS.includes(Number(item) as (typeof NUMBERS)[number]);
      expect(isValidLetter || isValidNumber).toBe(true);
    }
  });

  it('excludes confusing characters I and O', () => {
    for (let attempt = 0; attempt < 50; attempt++) {
      const seq = generateMixedSequence(9);
      expect(seq).not.toContain('I');
      expect(seq).not.toContain('O');
    }
  });

  it('does not contain digit 0 (only 1-9)', () => {
    for (let attempt = 0; attempt < 20; attempt++) {
      const seq = generateMixedSequence(9);
      expect(seq).not.toContain('0');
    }
  });

  it('uses deterministic rng when provided', () => {
    let seed = 0.42;
    const makeRng = () => {
      seed = 0.42;
      return () => {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
      };
    };
    const a = generateMixedSequence(5, makeRng());
    const b = generateMixedSequence(5, makeRng());
    expect(a).toEqual(b);
  });
});

// =============================================================================
// 2. Correct Order
// =============================================================================

describe('Letter-Number — Correct order', () => {
  it('numbers ascending then letters alphabetical', () => {
    expect(getCorrectOrder(['G', '3', 'A', '7'])).toEqual(['3', '7', 'A', 'G']);
  });

  it('single number', () => {
    expect(getCorrectOrder(['5'])).toEqual(['5']);
  });

  it('single letter', () => {
    expect(getCorrectOrder(['B'])).toEqual(['B']);
  });

  it('all numbers sorted ascending', () => {
    expect(getCorrectOrder(['9', '1', '5'])).toEqual(['1', '5', '9']);
  });

  it('all letters sorted alphabetically', () => {
    expect(getCorrectOrder(['Z', 'A', 'M'])).toEqual(['A', 'M', 'Z']);
  });

  it('mixed case preserves uppercase', () => {
    expect(getCorrectOrder(['B', '2', 'A', '1'])).toEqual(['1', '2', 'A', 'B']);
  });

  it('empty sequence returns empty', () => {
    expect(getCorrectOrder([])).toEqual([]);
  });
});

// =============================================================================
// 3. Recall Validation
// =============================================================================

describe('Letter-Number — Recall validation', () => {
  it('correct reordering passes', () => {
    expect(validateRecall(['G', '3', 'A', '7'], ['3', '7', 'A', 'G'])).toBe(true);
  });

  it('wrong order fails', () => {
    expect(validateRecall(['G', '3', 'A', '7'], ['A', 'G', '3', '7'])).toBe(false);
  });

  it('missing items fails', () => {
    expect(validateRecall(['G', '3', 'A', '7'], ['3', '7', 'A'])).toBe(false);
  });

  it('extra items fails', () => {
    expect(validateRecall(['G', '3', 'A', '7'], ['3', '7', 'A', 'G', 'B'])).toBe(false);
  });

  it('original order fails when not the correct reorder', () => {
    expect(validateRecall(['G', '3', 'A', '7'], ['G', '3', 'A', '7'])).toBe(false);
  });

  it('single item is always correct', () => {
    expect(validateRecall(['5'], ['5'])).toBe(true);
    expect(validateRecall(['B'], ['B'])).toBe(true);
  });
});

// =============================================================================
// 4. Initial State
// =============================================================================

describe('Letter-Number — Initial state', () => {
  it('defaults to span 3', () => {
    const s = createInitialState();
    expect(s.currentSpan).toBe(DEFAULT_START_SPAN);
    expect(s.consecutiveFailures).toBe(0);
    expect(s.finished).toBe(false);
    expect(s.trialIndex).toBe(0);
    expect(s.maxSpanReached).toBe(0);
  });

  it('clamps start span to [2, MAX_SPAN]', () => {
    expect(createInitialState(1).currentSpan).toBe(2);
    expect(createInitialState(0).currentSpan).toBe(2);
    expect(createInitialState(15).currentSpan).toBe(MAX_SPAN);
  });
});

// =============================================================================
// 5. Span Progression
// =============================================================================

describe('Letter-Number — Span progression', () => {
  it('span increases by 1 on success', () => {
    const s0 = createInitialState(3);
    const s1 = advanceState(s0, true);
    expect(s1.currentSpan).toBe(4);
  });

  it('span stays on failure', () => {
    const s0 = createInitialState(3);
    const s1 = advanceState(s0, false);
    expect(s1.currentSpan).toBe(3);
  });

  it('consecutive failures reset on success', () => {
    let s = createInitialState(3);
    s = advanceState(s, false); // fail 1
    expect(s.consecutiveFailures).toBe(1);
    s = advanceState(s, true); // success resets
    expect(s.consecutiveFailures).toBe(0);
  });

  it('tracks max span reached on correct trials', () => {
    let s = createInitialState(3);
    s = advanceState(s, true); // correct at span 3
    expect(s.maxSpanReached).toBe(3);
    s = advanceState(s, true); // correct at span 4
    expect(s.maxSpanReached).toBe(4);
    s = advanceState(s, false); // fail at span 5
    expect(s.maxSpanReached).toBe(4); // unchanged
  });
});

// =============================================================================
// 6. Two-Failure Stopping Rule
// =============================================================================

describe('Letter-Number — 2-failure stopping rule', () => {
  it('finishes after 2 consecutive failures', () => {
    let s = createInitialState(3);
    s = advanceState(s, false); // fail 1
    expect(s.finished).toBe(false);
    s = advanceState(s, false); // fail 2
    expect(s.finished).toBe(true);
  });

  it('non-consecutive failures do not end the session', () => {
    let s = createInitialState(3);
    s = advanceState(s, false); // fail
    s = advanceState(s, true); // success resets
    s = advanceState(s, false); // fail again (not consecutive)
    expect(s.finished).toBe(false);
    expect(s.consecutiveFailures).toBe(1);
  });
});

// =============================================================================
// 7. Max Span Ceiling
// =============================================================================

describe('Letter-Number — Max span ceiling', () => {
  it('finishes when correct at MAX_SPAN', () => {
    let s = createInitialState(2);
    // Advance to MAX_SPAN
    for (let span = 2; span < MAX_SPAN; span++) {
      s = advanceState(s, true);
      expect(s.finished).toBe(false);
    }
    // Correct at MAX_SPAN finishes
    s = advanceState(s, true);
    expect(s.finished).toBe(true);
    expect(s.maxSpanReached).toBe(MAX_SPAN);
  });
});

// =============================================================================
// 8. Max Trials Limit
// =============================================================================

describe('Letter-Number — Max trials limit', () => {
  it('finishes when maxTrials is reached', () => {
    let s = createInitialState(3);
    s = advanceState(s, true, 2);
    expect(s.finished).toBe(false);
    s = advanceState(s, true, 2);
    expect(s.finished).toBe(true);
    expect(s.trialIndex).toBe(2);
  });

  it('finishes even with alternating success/failure', () => {
    let s = createInitialState(3);
    for (let i = 0; i < 3; i++) {
      s = advanceState(s, true, 4);
      s = advanceState(s, false, 4);
    }
    // After 4 trials, should be finished
    expect(s.trialIndex).toBeGreaterThanOrEqual(4);
    expect(s.finished).toBe(true);
  });
});

// =============================================================================
// 9. Finished State is Terminal
// =============================================================================

describe('Letter-Number — Terminal state', () => {
  it('advancing a finished state returns the same state', () => {
    let s = createInitialState(3);
    s = advanceState(s, false);
    s = advanceState(s, false);
    expect(s.finished).toBe(true);
    const s2 = advanceState(s, true);
    expect(s2).toBe(s); // identity
  });
});

// =============================================================================
// 10. Summary Computation
// =============================================================================

describe('Letter-Number — Summary', () => {
  const mkResult = (
    trialIndex: number,
    span: number,
    correct: boolean,
    responseTimeMs: number,
  ): TrialResult => ({
    trialIndex,
    span,
    sequence: [],
    correctAnswer: [],
    playerInput: [],
    correct,
    responseTimeMs,
  });

  it('computes accuracy correctly', () => {
    const results = [
      mkResult(0, 3, true, 1000),
      mkResult(1, 4, false, 2000),
      mkResult(2, 4, true, 1500),
    ];
    const s = computeSummary(results);
    expect(s.accuracy).toBe(67); // 2/3 = 66.67 -> 67
    expect(s.correctTrials).toBe(2);
    expect(s.totalTrials).toBe(3);
  });

  it('computes max span from correct trials only', () => {
    const results = [
      mkResult(0, 3, true, 1000),
      mkResult(1, 4, true, 1000),
      mkResult(2, 5, false, 1000),
    ];
    expect(computeSummary(results).maxSpan).toBe(4);
  });

  it('handles empty results', () => {
    const s = computeSummary([]);
    expect(s.totalTrials).toBe(0);
    expect(s.accuracy).toBe(0);
    expect(s.maxSpan).toBe(0);
    expect(s.meanRtMs).toBe(0);
  });

  it('computes mean RT', () => {
    const results = [mkResult(0, 3, true, 1000), mkResult(1, 4, true, 2000)];
    expect(computeSummary(results).meanRtMs).toBe(1500);
  });

  it('handles all correct', () => {
    const results = [mkResult(0, 3, true, 500), mkResult(1, 4, true, 600)];
    expect(computeSummary(results).accuracy).toBe(100);
  });

  it('handles all wrong', () => {
    const results = [mkResult(0, 3, false, 500), mkResult(1, 3, false, 600)];
    const s = computeSummary(results);
    expect(s.accuracy).toBe(0);
    expect(s.maxSpan).toBe(0);
  });
});
