import { describe, it, expect } from 'bun:test';
import {
  type Card,
  type TrialResult,
  type SortRule,
  generateCard,
  getAvailableRules,
  pickNewRule,
  getBinsForRule,
  getCorrectBin,
  nextSwitchCount,
  validateResponse,
  isPerseverativeError,
  computeSummary,
  COLORS,
  SHAPES,
  NUMBERS,
  RULE_SWITCH_MIN,
  RULE_SWITCH_MAX,
} from './speed-sort';

// =============================================================================
// 1. Card generation
// =============================================================================

describe('Speed Sort — Card generation', () => {
  it('generates cards with valid color, shape, and number', () => {
    for (let i = 0; i < 100; i++) {
      const card = generateCard();
      expect(COLORS).toContain(card.color);
      expect(SHAPES).toContain(card.shape);
      expect(NUMBERS).toContain(card.number);
    }
  });

  it('generates cards deterministically with seeded rng', () => {
    const rng = () => 0.5;
    const card = generateCard(rng);
    // floor(0.5 * 4) = 2 for all arrays
    expect(card.color).toBe(COLORS[2]); // 'green'
    expect(card.shape).toBe(SHAPES[2]); // 'triangle'
    expect(card.number).toBe(NUMBERS[2]); // 3
  });

  it('covers all possible colors with sufficient samples', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      seen.add(generateCard().color);
    }
    expect(seen.size).toBe(COLORS.length);
  });

  it('covers all possible shapes with sufficient samples', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      seen.add(generateCard().shape);
    }
    expect(seen.size).toBe(SHAPES.length);
  });

  it('covers all possible numbers with sufficient samples', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) {
      seen.add(generateCard().number);
    }
    expect(seen.size).toBe(NUMBERS.length);
  });
});

// =============================================================================
// 2. Rule matching — card matches target by current rule
// =============================================================================

describe('Speed Sort — Rule matching', () => {
  const card: Card = { color: 'blue', shape: 'triangle', number: 3 };

  it('correct bin for color rule = index of card.color in COLORS', () => {
    const bin = getCorrectBin(card, 'color');
    expect(bin).toBe(COLORS.indexOf('blue'));
  });

  it('correct bin for shape rule = index of card.shape in SHAPES', () => {
    const bin = getCorrectBin(card, 'shape');
    expect(bin).toBe(SHAPES.indexOf('triangle'));
  });

  it('correct bin for number rule = index of card.number in NUMBERS', () => {
    const bin = getCorrectBin(card, 'number');
    expect(bin).toBe(NUMBERS.indexOf(3));
  });

  it('validateResponse returns true for correct bin', () => {
    expect(validateResponse(card, 'color', COLORS.indexOf('blue'))).toBe(true);
    expect(validateResponse(card, 'shape', SHAPES.indexOf('triangle'))).toBe(true);
    expect(validateResponse(card, 'number', NUMBERS.indexOf(3))).toBe(true);
  });

  it('validateResponse returns false for wrong bin', () => {
    expect(validateResponse(card, 'color', 0)).toBe(card.color === COLORS[0]);
    // Pick a definitely wrong bin
    const wrongBin = (COLORS.indexOf(card.color) + 1) % COLORS.length;
    expect(validateResponse(card, 'color', wrongBin)).toBe(false);
  });

  it('bins for color rule match COLORS array', () => {
    expect(getBinsForRule('color')).toEqual([...COLORS]);
  });

  it('bins for shape rule match SHAPES array', () => {
    expect(getBinsForRule('shape')).toEqual([...SHAPES]);
  });

  it('bins for number rule match NUMBERS as strings', () => {
    expect(getBinsForRule('number')).toEqual(NUMBERS.map(String));
  });
});

// =============================================================================
// 3. Rule switching — rule changes after 5-8 correct sorts
// =============================================================================

describe('Speed Sort — Rule switching', () => {
  it('nextSwitchCount returns values in [5, 8] for nLevel 1-2', () => {
    for (let i = 0; i < 100; i++) {
      const count = nextSwitchCount(1);
      expect(count).toBeGreaterThanOrEqual(RULE_SWITCH_MIN);
      expect(count).toBeLessThanOrEqual(RULE_SWITCH_MAX);
    }
  });

  it('nextSwitchCount returns values in [3, 5] for nLevel 3', () => {
    for (let i = 0; i < 100; i++) {
      const count = nextSwitchCount(3);
      expect(count).toBeGreaterThanOrEqual(3);
      expect(count).toBeLessThanOrEqual(5);
    }
  });

  it('pickNewRule always returns a different rule', () => {
    const rules: SortRule[] = ['color', 'shape', 'number'];
    for (const current of rules) {
      for (let i = 0; i < 50; i++) {
        const newRule = pickNewRule(current, rules);
        expect(newRule).not.toBe(current);
      }
    }
  });

  it('pickNewRule with 2 available rules always returns the other one', () => {
    const rules: SortRule[] = ['color', 'shape'];
    expect(pickNewRule('color', rules)).toBe('shape');
    expect(pickNewRule('shape', rules)).toBe('color');
  });

  it('nLevel 1 only has color and shape rules', () => {
    expect(getAvailableRules(1)).toEqual(['color', 'shape']);
  });

  it('nLevel 2+ has color, shape, and number rules', () => {
    expect(getAvailableRules(2)).toEqual(['color', 'shape', 'number']);
    expect(getAvailableRules(3)).toEqual(['color', 'shape', 'number']);
  });
});

// =============================================================================
// 4. Perseverative error detection
// =============================================================================

describe('Speed Sort — Perseverative error detection', () => {
  it('detects perseverative error: response correct under old rule, wrong under new', () => {
    // Card: red circle 1. Old rule: color (bin=0), new rule: shape (bin=0 for circle)
    const card: Card = { color: 'red', shape: 'square', number: 2 };
    // Old rule = color => correct bin = 0 (red)
    // New rule = shape => correct bin = 1 (square)
    // Player picks bin 0 (red) — perseverative
    expect(isPerseverativeError(card, 'shape', 'color', 0)).toBe(true);
  });

  it('does not flag a regular error as perseverative', () => {
    const card: Card = { color: 'red', shape: 'square', number: 2 };
    // Old rule = color => correct bin = 0. New rule = shape => correct bin = 1.
    // Player picks bin 3 — wrong under both rules
    expect(isPerseverativeError(card, 'shape', 'color', 3)).toBe(false);
  });

  it('does not flag correct response as perseverative', () => {
    const card: Card = { color: 'red', shape: 'square', number: 2 };
    // New rule = shape => correct bin = 1
    // Player picks bin 1 — correct, not perseverative
    expect(isPerseverativeError(card, 'shape', 'color', 1)).toBe(false);
  });

  it('returns false when current and previous rule are the same', () => {
    const card: Card = { color: 'blue', shape: 'circle', number: 1 };
    expect(isPerseverativeError(card, 'color', 'color', 0)).toBe(false);
  });
});

// =============================================================================
// 5. Switch cost — RT increase after rule switch
// =============================================================================

describe('Speed Sort — Switch cost (computeSummary)', () => {
  function makeResult(
    idx: number,
    correct: boolean,
    rule: SortRule,
    rt: number,
    isRuleSwitch: boolean,
    timedOut = false,
  ): TrialResult {
    return {
      trialIndex: idx,
      card: { color: 'red', shape: 'circle', number: 1 },
      rule,
      correct,
      responseTimeMs: rt,
      timedOut,
      isRuleSwitch,
    };
  }

  it('computes positive switch cost when switch trials are slower', () => {
    const results: TrialResult[] = [
      makeResult(0, true, 'color', 500, false),
      makeResult(1, true, 'color', 520, false),
      makeResult(2, true, 'color', 480, false),
      makeResult(3, true, 'shape', 800, true), // switch: slower
      makeResult(4, true, 'shape', 750, true), // switch: slower
    ];
    const summary = computeSummary(results);
    expect(summary.switchCostMs).toBeGreaterThan(0);
  });

  it('switch cost is approximately switch_RT - nonswitch_RT', () => {
    const results: TrialResult[] = [
      makeResult(0, true, 'color', 400, false),
      makeResult(1, true, 'color', 400, false),
      makeResult(2, true, 'shape', 600, true),
      makeResult(3, true, 'shape', 600, true),
    ];
    const summary = computeSummary(results);
    // nonswitch mean = 400, switch mean = 600
    expect(summary.switchCostMs).toBeCloseTo(200, 0);
  });
});

// =============================================================================
// 6. Difficulty scaling — more properties at higher nLevel
// =============================================================================

describe('Speed Sort — Difficulty scaling', () => {
  it('nLevel 1 uses 2 rules, bins have 4 options each', () => {
    const rules = getAvailableRules(1);
    expect(rules).toHaveLength(2);
    for (const rule of rules) {
      expect(getBinsForRule(rule)).toHaveLength(4);
    }
  });

  it('nLevel 2+ uses 3 rules', () => {
    const rules = getAvailableRules(2);
    expect(rules).toHaveLength(3);
  });

  it('nLevel 3 has faster switches (3-5 vs 5-8)', () => {
    const counts1: number[] = [];
    const counts3: number[] = [];
    for (let i = 0; i < 200; i++) {
      counts1.push(nextSwitchCount(1));
      counts3.push(nextSwitchCount(3));
    }
    const avg1 = counts1.reduce((a, b) => a + b, 0) / counts1.length;
    const avg3 = counts3.reduce((a, b) => a + b, 0) / counts3.length;
    // nLevel 3 average should be lower (3-5 range vs 5-8 range)
    expect(avg3).toBeLessThan(avg1);
  });
});

// =============================================================================
// 7. Scoring — categories completed, perseverative vs non-perseverative errors
// =============================================================================

describe('Speed Sort — Scoring (computeSummary)', () => {
  function makeResult(
    idx: number,
    correct: boolean,
    rule: SortRule,
    rt: number,
    isRuleSwitch: boolean,
    timedOut = false,
  ): TrialResult {
    return {
      trialIndex: idx,
      card: { color: 'red', shape: 'circle', number: 1 },
      rule,
      correct,
      responseTimeMs: rt,
      timedOut,
      isRuleSwitch,
    };
  }

  it('computes accuracy correctly', () => {
    const results: TrialResult[] = [
      makeResult(0, true, 'color', 400, false),
      makeResult(1, false, 'color', 500, false),
      makeResult(2, true, 'shape', 600, true),
      makeResult(3, true, 'shape', 550, false),
    ];
    const summary = computeSummary(results);
    expect(summary.total).toBe(4);
    expect(summary.correctTrials).toBe(3);
    expect(summary.accuracy).toBeCloseTo(0.75, 2);
  });

  it('computes mean RT excluding timeouts', () => {
    const results: TrialResult[] = [
      makeResult(0, true, 'color', 400, false),
      makeResult(1, false, 'color', 3000, false, true), // timeout
      makeResult(2, true, 'shape', 600, true),
    ];
    const summary = computeSummary(results);
    expect(summary.meanRtMs).toBeCloseTo(500, 0);
  });

  it('computes switch accuracy', () => {
    const results: TrialResult[] = [
      makeResult(0, true, 'color', 400, false),
      makeResult(1, true, 'color', 450, false),
      makeResult(2, true, 'shape', 600, true),
      makeResult(3, false, 'shape', 700, true),
    ];
    const summary = computeSummary(results);
    expect(summary.switchTrials).toBe(2);
    expect(summary.switchCorrect).toBe(1);
    expect(summary.switchAccuracy).toBeCloseTo(0.5, 2);
  });

  it('counts timeouts', () => {
    const results: TrialResult[] = [
      makeResult(0, false, 'color', 3000, false, true),
      makeResult(1, false, 'color', 3000, false, true),
      makeResult(2, true, 'shape', 500, true),
    ];
    const summary = computeSummary(results);
    expect(summary.timeouts).toBe(2);
  });

  it('handles empty results', () => {
    const summary = computeSummary([]);
    expect(summary.total).toBe(0);
    expect(summary.accuracy).toBe(0);
    expect(summary.meanRtMs).toBe(0);
  });

  it('handles session with no switch trials', () => {
    const results: TrialResult[] = [
      makeResult(0, true, 'color', 400, false),
      makeResult(1, true, 'color', 450, false),
    ];
    const summary = computeSummary(results);
    expect(summary.switchTrials).toBe(0);
    expect(summary.switchAccuracy).toBe(0);
    expect(summary.switchCostMs).toBe(0);
  });
});
