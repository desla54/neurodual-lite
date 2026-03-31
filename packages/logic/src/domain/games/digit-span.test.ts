import { describe, it, expect } from 'bun:test';
import {
  type TrialResult,
  type SpanState,
  generateDigitSequence,
  validateForwardRecall,
  validateBackwardRecall,
  validateRecall,
  createInitialState,
  advanceState,
  computeSummary,
  DEFAULT_START_SPAN,
  MAX_SPAN,
  DIGITS,
} from './digit-span';

// =============================================================================
// 1. Sequence Generation
// =============================================================================

describe('Digit Span — Sequence generation', () => {
  it('generates a sequence of the correct length', () => {
    expect(generateDigitSequence(3)).toHaveLength(3);
    expect(generateDigitSequence(7)).toHaveLength(7);
    expect(generateDigitSequence(1)).toHaveLength(1);
  });

  it('all digits are in range 0-9', () => {
    const seq = generateDigitSequence(100);
    for (const d of seq) {
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(9);
    }
  });

  it('no two consecutive digits are the same', () => {
    // Run multiple times to increase coverage
    for (let attempt = 0; attempt < 10; attempt++) {
      const seq = generateDigitSequence(20);
      for (let i = 1; i < seq.length; i++) {
        expect(seq[i]).not.toBe(seq[i - 1]);
      }
    }
  });

  it('uses all digits over many sequences', () => {
    const seen = new Set<number>();
    for (let attempt = 0; attempt < 50; attempt++) {
      for (const d of generateDigitSequence(10)) {
        seen.add(d);
      }
    }
    expect(seen.size).toBe(DIGITS.length);
  });

  it('empty sequence for length 0', () => {
    expect(generateDigitSequence(0)).toHaveLength(0);
  });

  it('uses deterministic rng when provided', () => {
    let seed = 0.5;
    const rng = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    const a = generateDigitSequence(6, rng);
    seed = 0.5;
    const b = generateDigitSequence(6, rng);
    expect(a).toEqual(b);
  });
});

// =============================================================================
// 2. Forward Recall Validation
// =============================================================================

describe('Digit Span — Forward recall validation', () => {
  it('exact match is correct', () => {
    expect(validateForwardRecall([3, 7, 2], [3, 7, 2])).toBe(true);
  });

  it('wrong order is incorrect', () => {
    expect(validateForwardRecall([3, 7, 2], [7, 3, 2])).toBe(false);
  });

  it('missing digits is incorrect', () => {
    expect(validateForwardRecall([3, 7, 2], [3, 7])).toBe(false);
  });

  it('extra digits is incorrect', () => {
    expect(validateForwardRecall([3, 7, 2], [3, 7, 2, 5])).toBe(false);
  });

  it('completely wrong digits is incorrect', () => {
    expect(validateForwardRecall([3, 7, 2], [1, 4, 9])).toBe(false);
  });

  it('empty input for non-empty sequence is incorrect', () => {
    expect(validateForwardRecall([3, 7, 2], [])).toBe(false);
  });

  it('single digit match', () => {
    expect(validateForwardRecall([5], [5])).toBe(true);
    expect(validateForwardRecall([5], [3])).toBe(false);
  });
});

// =============================================================================
// 3. Backward Recall Validation
// =============================================================================

describe('Digit Span — Backward recall validation', () => {
  it('reversed input is correct', () => {
    expect(validateBackwardRecall([3, 7, 2], [2, 7, 3])).toBe(true);
  });

  it('forward input is incorrect for backward', () => {
    expect(validateBackwardRecall([3, 7, 2], [3, 7, 2])).toBe(false);
  });

  it('partially reversed is incorrect', () => {
    expect(validateBackwardRecall([3, 7, 2], [2, 3, 7])).toBe(false);
  });

  it('single digit backward is same as forward', () => {
    expect(validateBackwardRecall([5], [5])).toBe(true);
  });

  it('two digits reversed', () => {
    expect(validateBackwardRecall([3, 8], [8, 3])).toBe(true);
    expect(validateBackwardRecall([3, 8], [3, 8])).toBe(false);
  });
});

// =============================================================================
// 4. validateRecall dispatches correctly
// =============================================================================

describe('Digit Span — validateRecall dispatch', () => {
  it('forward phase uses forward validation', () => {
    expect(validateRecall('forward', [1, 2, 3], [1, 2, 3])).toBe(true);
    expect(validateRecall('forward', [1, 2, 3], [3, 2, 1])).toBe(false);
  });

  it('backward phase uses backward validation', () => {
    expect(validateRecall('backward', [1, 2, 3], [3, 2, 1])).toBe(true);
    expect(validateRecall('backward', [1, 2, 3], [1, 2, 3])).toBe(false);
  });
});

// =============================================================================
// 5. Span State Machine — Initial State
// =============================================================================

describe('Digit Span — Initial state', () => {
  it('defaults to forward phase with start span 3', () => {
    const s = createInitialState();
    expect(s.phase).toBe('forward');
    expect(s.currentSpan).toBe(DEFAULT_START_SPAN);
    expect(s.consecutiveFailures).toBe(0);
    expect(s.finished).toBe(false);
  });

  it('clamps start span to [2, MAX_SPAN]', () => {
    expect(createInitialState(1).currentSpan).toBe(2);
    expect(createInitialState(0).currentSpan).toBe(2);
    expect(createInitialState(15).currentSpan).toBe(MAX_SPAN);
  });
});

// =============================================================================
// 6. Span Progression Staircase
// =============================================================================

describe('Digit Span — Span progression', () => {
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

  it('span does not exceed MAX_SPAN', () => {
    const s0: SpanState = {
      ...createInitialState(MAX_SPAN),
      currentSpan: MAX_SPAN,
    };
    const s1 = advanceState(s0, true);
    // Phase should end because currentSpan >= MAX_SPAN
    expect(s1.phase).toBe('backward');
  });

  it('consecutive failures reset on success', () => {
    let s = createInitialState(3);
    s = advanceState(s, false); // fail 1
    expect(s.consecutiveFailures).toBe(1);
    s = advanceState(s, true); // success resets
    expect(s.consecutiveFailures).toBe(0);
  });
});

// =============================================================================
// 7. Two-Failure Stopping Rule
// =============================================================================

describe('Digit Span — 2-failure stopping rule', () => {
  it('phase ends after 2 consecutive failures', () => {
    let s = createInitialState(3);
    s = advanceState(s, false); // fail 1
    expect(s.phase).toBe('forward');
    expect(s.finished).toBe(false);
    s = advanceState(s, false); // fail 2 => transition
    expect(s.phase).toBe('backward'); // moved to backward
  });

  it('non-consecutive failures do not end the phase', () => {
    let s = createInitialState(3);
    s = advanceState(s, false); // fail 1
    s = advanceState(s, true); // success (resets)
    s = advanceState(s, false); // fail 1 again (not consecutive with previous fail)
    expect(s.phase).toBe('forward');
    expect(s.consecutiveFailures).toBe(1);
  });

  it('backward phase ends (finished) after 2 consecutive failures', () => {
    // Get to backward phase
    let s = createInitialState(3);
    s = advanceState(s, false);
    s = advanceState(s, false); // -> backward
    expect(s.phase).toBe('backward');
    // Now fail twice in backward
    s = advanceState(s, false);
    s = advanceState(s, false);
    expect(s.finished).toBe(true);
  });
});

// =============================================================================
// 8. Phase Transitions
// =============================================================================

describe('Digit Span — Phase transitions', () => {
  it('transitions from forward to backward after forward phase ends', () => {
    let s = createInitialState(3);
    s = advanceState(s, false);
    s = advanceState(s, false);
    expect(s.phase).toBe('backward');
    expect(s.consecutiveFailures).toBe(0); // reset on transition
  });

  it('backward phase resets span to startSpan', () => {
    let s = createInitialState(3);
    // Advance span to 5
    s = advanceState(s, true); // span 4
    s = advanceState(s, true); // span 5
    s = advanceState(s, false); // fail at 5
    s = advanceState(s, false); // fail at 5 => backward
    expect(s.phase).toBe('backward');
    expect(s.currentSpan).toBe(DEFAULT_START_SPAN); // back to 3
  });

  it('session finishes after backward phase ends', () => {
    let s = createInitialState(3);
    // End forward
    s = advanceState(s, false);
    s = advanceState(s, false);
    // End backward
    s = advanceState(s, false);
    s = advanceState(s, false);
    expect(s.finished).toBe(true);
  });

  it('advancing a finished state returns the same state', () => {
    let s = createInitialState(3);
    s = advanceState(s, false);
    s = advanceState(s, false);
    s = advanceState(s, false);
    s = advanceState(s, false);
    expect(s.finished).toBe(true);
    const s2 = advanceState(s, true);
    expect(s2).toBe(s); // identity
  });
});

// =============================================================================
// 9. Max Span Tracking
// =============================================================================

describe('Digit Span — Max span tracking', () => {
  it('tracks max forward span on success', () => {
    let s = createInitialState(3);
    s = advanceState(s, true); // correct at span 3
    expect(s.maxForwardSpan).toBe(3);
    s = advanceState(s, true); // correct at span 4
    expect(s.maxForwardSpan).toBe(4);
  });

  it('does not update max span on failure', () => {
    let s = createInitialState(3);
    s = advanceState(s, true); // correct at span 3 -> maxFw = 3
    s = advanceState(s, false); // fail at span 4 -> maxFw still 3
    expect(s.maxForwardSpan).toBe(3);
  });

  it('tracks max backward span separately', () => {
    let s = createInitialState(3);
    // End forward quickly
    s = advanceState(s, false);
    s = advanceState(s, false);
    // Now in backward
    s = advanceState(s, true); // correct at span 3
    expect(s.maxBackwardSpan).toBe(3);
    expect(s.maxForwardSpan).toBe(0); // no forward successes
  });
});

// =============================================================================
// 10. Max Trials Limit
// =============================================================================

describe('Digit Span — Max trials limit', () => {
  it('finishes when maxTrials is reached', () => {
    let s = createInitialState(3);
    s = advanceState(s, true, DEFAULT_START_SPAN, 2);
    s = advanceState(s, true, DEFAULT_START_SPAN, 2);
    expect(s.finished).toBe(true);
    expect(s.trialIndex).toBe(2);
  });
});

// =============================================================================
// 11. Edge Cases
// =============================================================================

describe('Digit Span — Edge cases', () => {
  it('span 1 works (clamped to 2)', () => {
    const s = createInitialState(1);
    expect(s.currentSpan).toBe(2);
  });

  it('all correct run reaches max span then transitions', () => {
    let s = createInitialState(2);
    // Forward: succeed 2->3->4->5->6->7->8->9, then at 9 phase ends
    for (let span = 2; span < MAX_SPAN; span++) {
      s = advanceState(s, true);
    }
    // At span 9 with a success, should transition because currentSpan >= MAX_SPAN
    s = advanceState(s, true);
    expect(s.phase).toBe('backward');
  });

  it('all wrong in forward transitions to backward after 2 failures', () => {
    let s = createInitialState(3);
    s = advanceState(s, false);
    s = advanceState(s, false);
    expect(s.phase).toBe('backward');
    expect(s.maxForwardSpan).toBe(0);
  });
});

// =============================================================================
// 12. Summary Computation
// =============================================================================

describe('Digit Span — Summary', () => {
  it('computes accuracy correctly', () => {
    const results: TrialResult[] = [
      {
        trialIndex: 0,
        phase: 'forward',
        span: 3,
        correct: true,
        responseTimeMs: 1000,
        sequence: [1, 2, 3],
        playerInput: [1, 2, 3],
      },
      {
        trialIndex: 1,
        phase: 'forward',
        span: 4,
        correct: false,
        responseTimeMs: 2000,
        sequence: [1, 2, 3, 4],
        playerInput: [1, 2, 4, 3],
      },
      {
        trialIndex: 2,
        phase: 'backward',
        span: 3,
        correct: true,
        responseTimeMs: 1500,
        sequence: [5, 6, 7],
        playerInput: [7, 6, 5],
      },
    ];
    const summary = computeSummary(results);
    expect(summary.accuracy).toBe(67); // 2/3 = 66.67 -> 67
  });

  it('computes max forward and backward spans', () => {
    const results: TrialResult[] = [
      {
        trialIndex: 0,
        phase: 'forward',
        span: 3,
        correct: true,
        responseTimeMs: 1000,
        sequence: [],
        playerInput: [],
      },
      {
        trialIndex: 1,
        phase: 'forward',
        span: 4,
        correct: true,
        responseTimeMs: 1000,
        sequence: [],
        playerInput: [],
      },
      {
        trialIndex: 2,
        phase: 'forward',
        span: 5,
        correct: false,
        responseTimeMs: 1000,
        sequence: [],
        playerInput: [],
      },
      {
        trialIndex: 3,
        phase: 'backward',
        span: 3,
        correct: true,
        responseTimeMs: 1000,
        sequence: [],
        playerInput: [],
      },
      {
        trialIndex: 4,
        phase: 'backward',
        span: 4,
        correct: false,
        responseTimeMs: 1000,
        sequence: [],
        playerInput: [],
      },
    ];
    const summary = computeSummary(results);
    expect(summary.maxForwardSpan).toBe(4);
    expect(summary.maxBackwardSpan).toBe(3);
  });

  it('handles empty results', () => {
    const summary = computeSummary([]);
    expect(summary.totalTrials).toBe(0);
    expect(summary.accuracy).toBe(0);
    expect(summary.maxForwardSpan).toBe(0);
    expect(summary.maxBackwardSpan).toBe(0);
  });

  it('handles all correct', () => {
    const results: TrialResult[] = [
      {
        trialIndex: 0,
        phase: 'forward',
        span: 3,
        correct: true,
        responseTimeMs: 1000,
        sequence: [],
        playerInput: [],
      },
      {
        trialIndex: 1,
        phase: 'forward',
        span: 4,
        correct: true,
        responseTimeMs: 1000,
        sequence: [],
        playerInput: [],
      },
    ];
    const summary = computeSummary(results);
    expect(summary.accuracy).toBe(100);
  });

  it('handles all wrong', () => {
    const results: TrialResult[] = [
      {
        trialIndex: 0,
        phase: 'forward',
        span: 3,
        correct: false,
        responseTimeMs: 1000,
        sequence: [],
        playerInput: [],
      },
      {
        trialIndex: 1,
        phase: 'forward',
        span: 3,
        correct: false,
        responseTimeMs: 1000,
        sequence: [],
        playerInput: [],
      },
    ];
    const summary = computeSummary(results);
    expect(summary.accuracy).toBe(0);
    expect(summary.maxForwardSpan).toBe(0);
  });
});
