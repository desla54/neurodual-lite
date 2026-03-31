import { describe, it, expect } from 'bun:test';
import {
  generateTestCard,
  matchesByRule,
  getMatchingRules,
  getNextRule,
  createInitialState,
  processCardSelection,
  computeSummary,
  REFERENCE_CARDS,
  ALL_SHAPES,
  ALL_COLORS,
  RULES,
  DEFAULT_RULE_CHANGE_THRESHOLD,
  type WcstCard,
  type WcstRule,
} from './wcst';

// =============================================================================
// Card Generation
// =============================================================================

describe('generateTestCard', () => {
  it('generates a card with valid shape, color, and count', () => {
    const card = generateTestCard();
    expect(ALL_SHAPES).toContain(card.shape);
    expect(ALL_COLORS).toContain(card.color);
    expect(card.count).toBeGreaterThanOrEqual(1);
    expect(card.count).toBeLessThanOrEqual(4);
  });

  it('uses custom rng to produce deterministic cards', () => {
    let callIndex = 0;
    // shape index = 0 (circle), color index = 0 (red), count = 0*4+1 = 1
    const rng = () => {
      callIndex++;
      return 0;
    };
    const card = generateTestCard(rng);
    expect(card.shape).toBe('circle');
    expect(card.color).toBe('red');
    expect(card.count).toBe(1);
  });

  it('generates all counts 1-4 with appropriate rng values', () => {
    for (let c = 1; c <= 4; c++) {
      // rng returns (c-1)/4 to get count = floor((c-1)/4 * 4) + 1 = c
      const card = generateTestCard(() => (c - 1) / 4);
      expect(card.count).toBe(c);
    }
  });
});

// =============================================================================
// Rule Matching
// =============================================================================

describe('matchesByRule', () => {
  const ref0 = REFERENCE_CARDS[0] as WcstCard; // circle, red, 1
  const ref1 = REFERENCE_CARDS[1] as WcstCard; // star, green, 2
  const ref2 = REFERENCE_CARDS[2] as WcstCard; // triangle, yellow, 3
  const ref3 = REFERENCE_CARDS[3] as WcstCard; // cross, blue, 4

  it('matches by color correctly', () => {
    const testCard: WcstCard = { shape: 'star', color: 'red', count: 3 };
    expect(matchesByRule(testCard, ref0, 'color')).toBe(true); // red == red
    expect(matchesByRule(testCard, ref1, 'color')).toBe(false); // red != green
  });

  it('matches by shape correctly', () => {
    const testCard: WcstCard = { shape: 'star', color: 'red', count: 3 };
    expect(matchesByRule(testCard, ref1, 'shape')).toBe(true); // star == star
    expect(matchesByRule(testCard, ref0, 'shape')).toBe(false); // star != circle
  });

  it('matches by number correctly', () => {
    const testCard: WcstCard = { shape: 'star', color: 'red', count: 3 };
    expect(matchesByRule(testCard, ref2, 'number')).toBe(true); // 3 == 3
    expect(matchesByRule(testCard, ref0, 'number')).toBe(false); // 3 != 1
  });

  it('returns false when no dimension matches for a given rule', () => {
    const testCard: WcstCard = { shape: 'cross', color: 'yellow', count: 2 };
    // Color: yellow matches ref2 (yellow), not ref0 (red)
    expect(matchesByRule(testCard, ref0, 'color')).toBe(false);
    // Shape: cross matches ref3, not ref0
    expect(matchesByRule(testCard, ref0, 'shape')).toBe(false);
    // Number: 2 matches ref1, not ref0
    expect(matchesByRule(testCard, ref0, 'number')).toBe(false);
  });
});

describe('getMatchingRules', () => {
  it('returns all rules when card matches on every dimension', () => {
    // A card identical to ref0 matches on all three
    const testCard: WcstCard = { shape: 'circle', color: 'red', count: 1 };
    const rules = getMatchingRules(testCard, REFERENCE_CARDS[0] as WcstCard);
    expect(rules).toEqual(['color', 'shape', 'number']);
  });

  it('returns only matching rules for ambiguous cards', () => {
    // Matches ref0 on color (red) and ref1 on shape (star)
    const testCard: WcstCard = { shape: 'star', color: 'red', count: 4 };
    const rulesRef0 = getMatchingRules(testCard, REFERENCE_CARDS[0] as WcstCard);
    expect(rulesRef0).toEqual(['color']); // only color matches ref0

    const rulesRef1 = getMatchingRules(testCard, REFERENCE_CARDS[1] as WcstCard);
    expect(rulesRef1).toEqual(['shape']); // only shape matches ref1

    const rulesRef3 = getMatchingRules(testCard, REFERENCE_CARDS[3] as WcstCard);
    expect(rulesRef3).toEqual(['number']); // count=4 matches ref3
  });

  it('returns empty array when no dimension matches', () => {
    // blue triangle 2 vs ref0 (red circle 1): nothing matches
    const testCard: WcstCard = { shape: 'triangle', color: 'blue', count: 2 };
    // Actually triangle matches ref2 shape, blue matches ref3 color, 2 matches ref1 number
    // But against ref0: triangle!=circle, blue!=red, 2!=1
    const rules = getMatchingRules(testCard, REFERENCE_CARDS[0] as WcstCard);
    expect(rules).toEqual([]);
  });

  it('detects ambiguous cards matching on two dimensions', () => {
    // red circle 3: matches ref0 on color+shape but not number
    const testCard: WcstCard = { shape: 'circle', color: 'red', count: 3 };
    const rules = getMatchingRules(testCard, REFERENCE_CARDS[0] as WcstCard);
    expect(rules).toEqual(['color', 'shape']);
    expect(rules).not.toContain('number');
  });
});

// =============================================================================
// Rule Switching
// =============================================================================

describe('getNextRule', () => {
  it('cycles color -> shape -> number -> color', () => {
    expect(getNextRule('color')).toBe('shape');
    expect(getNextRule('shape')).toBe('number');
    expect(getNextRule('number')).toBe('color');
  });
});

describe('processCardSelection — rule switching', () => {
  it('switches rule after reaching threshold of consecutive correct', () => {
    let state = createInitialState();
    expect(state.currentRule).toBe('color');

    // Make 6 consecutive correct answers (matching by color)
    for (let i = 0; i < DEFAULT_RULE_CHANGE_THRESHOLD; i++) {
      const testCard: WcstCard = { shape: 'star', color: 'red', count: 3 };
      state = processCardSelection(state, testCard, 0, 500); // ref0 is red
    }

    expect(state.currentRule).toBe('shape'); // switched!
    expect(state.previousRule).toBe('color');
    expect(state.categoriesCompleted).toBe(1);
    expect(state.consecutiveCorrect).toBe(0);
  });

  it('resets consecutive count on incorrect answer', () => {
    let state = createInitialState();
    // 4 correct
    for (let i = 0; i < 4; i++) {
      const testCard: WcstCard = { shape: 'star', color: 'red', count: 3 };
      state = processCardSelection(state, testCard, 0, 500);
    }
    expect(state.consecutiveCorrect).toBe(4);

    // 1 incorrect (green card, pick ref0 which is red — wrong color match)
    const wrongCard: WcstCard = { shape: 'star', color: 'green', count: 3 };
    state = processCardSelection(state, wrongCard, 0, 500);
    expect(state.consecutiveCorrect).toBe(0);
    expect(state.currentRule).toBe('color'); // no switch
    expect(state.categoriesCompleted).toBe(0);
  });

  it('supports configurable threshold', () => {
    let state = createInitialState();
    const threshold = 3;

    for (let i = 0; i < threshold; i++) {
      const testCard: WcstCard = { shape: 'star', color: 'red', count: 3 };
      state = processCardSelection(state, testCard, 0, 500, threshold);
    }

    expect(state.currentRule).toBe('shape');
    expect(state.categoriesCompleted).toBe(1);
  });

  it('tracks multiple category completions', () => {
    let state = createInitialState();

    // Category 1: 6 correct by color
    for (let i = 0; i < 6; i++) {
      const testCard: WcstCard = { shape: 'star', color: 'red', count: 3 };
      state = processCardSelection(state, testCard, 0, 500);
    }
    expect(state.categoriesCompleted).toBe(1);
    expect(state.currentRule).toBe('shape');

    // Category 2: 6 correct by shape (star -> ref1)
    for (let i = 0; i < 6; i++) {
      const testCard: WcstCard = { shape: 'star', color: 'blue', count: 4 };
      state = processCardSelection(state, testCard, 1, 500); // ref1 is star
    }
    expect(state.categoriesCompleted).toBe(2);
    expect(state.currentRule).toBe('number');
  });
});

// =============================================================================
// Perseverative Errors
// =============================================================================

describe('processCardSelection — perseverative errors', () => {
  it('detects perseverative error when using previous rule after switch', () => {
    let state = createInitialState();

    // Complete first category (color)
    for (let i = 0; i < 6; i++) {
      const testCard: WcstCard = { shape: 'star', color: 'red', count: 3 };
      state = processCardSelection(state, testCard, 0, 500);
    }
    // Now rule is 'shape', previousRule is 'color'
    expect(state.currentRule).toBe('shape');
    expect(state.previousRule).toBe('color');

    // Perseverative error: card is red, player picks ref0 (red) — matching by old color rule
    // But current rule is shape, and star != circle (ref0), so this is wrong
    // AND it matches by previous rule (color: red == red)
    const testCard: WcstCard = { shape: 'cross', color: 'red', count: 2 };
    state = processCardSelection(state, testCard, 0, 500);

    const lastResult = state.results[state.results.length - 1];
    expect(lastResult?.correct).toBe(false);
    expect(lastResult?.perseverativeError).toBe(true);
  });

  it('does not flag perseverative error when there is no previous rule', () => {
    let state = createInitialState();
    expect(state.previousRule).toBeNull();

    // Wrong answer but no previous rule yet
    const testCard: WcstCard = { shape: 'star', color: 'green', count: 3 };
    state = processCardSelection(state, testCard, 0, 500); // ref0 is red, card is green => wrong color
    const lastResult = state.results[state.results.length - 1];
    expect(lastResult?.correct).toBe(false);
    expect(lastResult?.perseverativeError).toBe(false);
  });

  it('does not flag perseverative error when wrong but not matching previous rule', () => {
    let state = createInitialState();

    // Complete first category
    for (let i = 0; i < 6; i++) {
      const testCard: WcstCard = { shape: 'star', color: 'red', count: 3 };
      state = processCardSelection(state, testCard, 0, 500);
    }
    // Rule is shape, previous is color

    // Wrong answer that doesn't match by previous rule either
    // Card: green triangle 2, pick ref3 (blue cross 4)
    // Shape: triangle != cross => wrong (current rule)
    // Color: green != blue => also wrong by previous rule
    const testCard: WcstCard = { shape: 'triangle', color: 'green', count: 2 };
    state = processCardSelection(state, testCard, 3, 500);

    const lastResult = state.results[state.results.length - 1];
    expect(lastResult?.correct).toBe(false);
    expect(lastResult?.perseverativeError).toBe(false);
  });
});

// =============================================================================
// Summary
// =============================================================================

describe('computeSummary', () => {
  it('computes correct accuracy percentage', () => {
    const results = [
      {
        trialIndex: 0,
        testCard: { shape: 'circle' as const, color: 'red' as const, count: 1 },
        chosenRef: 0,
        correct: true,
        rule: 'color' as WcstRule,
        perseverativeError: false,
        responseTimeMs: 400,
      },
      {
        trialIndex: 1,
        testCard: { shape: 'circle' as const, color: 'red' as const, count: 1 },
        chosenRef: 0,
        correct: true,
        rule: 'color' as WcstRule,
        perseverativeError: false,
        responseTimeMs: 600,
      },
      {
        trialIndex: 2,
        testCard: { shape: 'circle' as const, color: 'red' as const, count: 1 },
        chosenRef: 1,
        correct: false,
        rule: 'color' as WcstRule,
        perseverativeError: false,
        responseTimeMs: 500,
      },
      {
        trialIndex: 3,
        testCard: { shape: 'circle' as const, color: 'red' as const, count: 1 },
        chosenRef: 0,
        correct: true,
        rule: 'color' as WcstRule,
        perseverativeError: false,
        responseTimeMs: 300,
      },
    ];
    const summary = computeSummary(results, 0);
    expect(summary.correctTrials).toBe(3);
    expect(summary.totalTrials).toBe(4);
    expect(summary.accuracy).toBe(75);
    expect(summary.totalErrors).toBe(1);
    expect(summary.meanRtMs).toBe(450);
  });

  it('returns zero accuracy for empty results', () => {
    const summary = computeSummary([], 0);
    expect(summary.accuracy).toBe(0);
    expect(summary.meanRtMs).toBe(0);
    expect(summary.totalTrials).toBe(0);
  });

  it('counts perseverative errors correctly', () => {
    const results = [
      {
        trialIndex: 0,
        testCard: { shape: 'circle' as const, color: 'red' as const, count: 1 },
        chosenRef: 0,
        correct: false,
        rule: 'shape' as WcstRule,
        perseverativeError: true,
        responseTimeMs: 500,
      },
      {
        trialIndex: 1,
        testCard: { shape: 'circle' as const, color: 'red' as const, count: 1 },
        chosenRef: 0,
        correct: false,
        rule: 'shape' as WcstRule,
        perseverativeError: true,
        responseTimeMs: 500,
      },
      {
        trialIndex: 2,
        testCard: { shape: 'circle' as const, color: 'red' as const, count: 1 },
        chosenRef: 0,
        correct: false,
        rule: 'shape' as WcstRule,
        perseverativeError: false,
        responseTimeMs: 500,
      },
    ];
    const summary = computeSummary(results, 1);
    expect(summary.perseverativeErrors).toBe(2);
    expect(summary.totalErrors).toBe(3);
    expect(summary.categoriesCompleted).toBe(1);
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe('edge cases', () => {
  it('reference cards have unique values on all dimensions', () => {
    const shapes = REFERENCE_CARDS.map((c) => c.shape);
    const colors = REFERENCE_CARDS.map((c) => c.color);
    const counts = REFERENCE_CARDS.map((c) => c.count);
    expect(new Set(shapes).size).toBe(4);
    expect(new Set(colors).size).toBe(4);
    expect(new Set(counts).size).toBe(4);
  });

  it('every test card matches exactly one reference card per rule', () => {
    // For any test card, for any given rule, exactly one reference card matches
    const testCard: WcstCard = { shape: 'star', color: 'yellow', count: 4 };
    for (const rule of RULES) {
      const matches = REFERENCE_CARDS.filter((ref) => matchesByRule(testCard, ref, rule));
      expect(matches.length).toBe(1);
    }
  });

  it('handles full 64-trial session with multiple rule switches', () => {
    let state = createInitialState();
    // Simulate always picking the correct reference card
    for (let i = 0; i < 64; i++) {
      // Find which ref matches by current rule
      const testCard: WcstCard = { shape: 'star', color: 'red', count: 3 };
      const correctRef = REFERENCE_CARDS.findIndex((ref) =>
        matchesByRule(testCard, ref, state.currentRule),
      );
      state = processCardSelection(state, testCard, correctRef, 400);
    }
    // 64 trials, 6 per category = 10 full categories (with 4 trials remaining in the 11th)
    expect(state.categoriesCompleted).toBe(10);
    expect(state.results.length).toBe(64);
  });
});
