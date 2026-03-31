import { describe, it, expect } from 'bun:test';
import {
  type ShapeItem,
  type BindingTrial,
  type BindingTrialResult,
  type BindingResponse,
  SHAPES,
  COLORS,
  shuffle,
  generateStudyItems,
  applyBindingChange,
  generateTrials,
  isCorrectResponse,
  computeCowansK,
  computeSummary,
} from './binding';

// =============================================================================
// Helpers
// =============================================================================

function makeSameTrial(): BindingTrial {
  const items: ShapeItem[] = [
    { shape: 'circle', color: '#EF4444' },
    { shape: 'square', color: '#3B82F6' },
    { shape: 'triangle', color: '#22C55E' },
  ];
  return {
    studyItems: items,
    testItems: items.map((i) => ({ ...i })),
    isChanged: false,
  };
}

function makeChangedTrial(): BindingTrial {
  const study: ShapeItem[] = [
    { shape: 'circle', color: '#EF4444' },
    { shape: 'square', color: '#3B82F6' },
    { shape: 'triangle', color: '#22C55E' },
  ];
  const test: ShapeItem[] = [
    { shape: 'circle', color: '#3B82F6' }, // swapped
    { shape: 'square', color: '#EF4444' }, // swapped
    { shape: 'triangle', color: '#22C55E' },
  ];
  return { studyItems: study, testItems: test, isChanged: true };
}

function makeResult(trial: BindingTrial, response: BindingResponse, rt = 500): BindingTrialResult {
  const correct = isCorrectResponse(trial, response);
  return { trial, response, correct, rt };
}

// =============================================================================
// 1. Shuffle
// =============================================================================

describe('Binding — shuffle', () => {
  it('returns array of same length', () => {
    const arr = [1, 2, 3, 4, 5];
    expect(shuffle(arr)).toHaveLength(5);
  });

  it('contains all original elements', () => {
    const arr = [1, 2, 3, 4, 5];
    const shuffled = shuffle(arr);
    expect(shuffled.sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it('does not mutate original array', () => {
    const arr = [1, 2, 3];
    const copy = [...arr];
    shuffle(arr);
    expect(arr).toEqual(copy);
  });

  it('uses provided RNG for reproducibility', () => {
    const makeRng = () => {
      let s = 42;
      return () => {
        s = (s * 16807 + 0) % 2147483647;
        return s / 2147483647;
      };
    };
    const a = shuffle([1, 2, 3, 4, 5], makeRng());
    const b = shuffle([1, 2, 3, 4, 5], makeRng());
    expect(a).toEqual(b);
  });
});

// =============================================================================
// 2. Study Item Generation
// =============================================================================

describe('Binding — generateStudyItems', () => {
  it('generates the requested number of items', () => {
    const items = generateStudyItems(3);
    expect(items).toHaveLength(3);
  });

  it('each item has a valid shape', () => {
    const items = generateStudyItems(3);
    for (const item of items) {
      expect(SHAPES).toContain(item.shape);
    }
  });

  it('each item has a valid color', () => {
    const items = generateStudyItems(3);
    for (const item of items) {
      expect(COLORS).toContain(item.color);
    }
  });

  it('all colors are unique within a set', () => {
    const items = generateStudyItems(3);
    const colors = items.map((i) => i.color);
    expect(new Set(colors).size).toBe(3);
  });

  it('uses provided RNG for reproducibility', () => {
    const makeRng = () => {
      let s = 42;
      return () => {
        s = (s * 16807 + 0) % 2147483647;
        return s / 2147483647;
      };
    };
    const a = generateStudyItems(3, makeRng());
    const b = generateStudyItems(3, makeRng());
    expect(a).toEqual(b);
  });
});

// =============================================================================
// 3. Binding Change
// =============================================================================

describe('Binding — applyBindingChange', () => {
  it('returns same number of items', () => {
    const study: ShapeItem[] = [
      { shape: 'circle', color: '#EF4444' },
      { shape: 'square', color: '#3B82F6' },
      { shape: 'triangle', color: '#22C55E' },
    ];
    const test = applyBindingChange(study);
    expect(test).toHaveLength(3);
  });

  it('preserves the same set of colors (just swapped)', () => {
    const study: ShapeItem[] = [
      { shape: 'circle', color: '#EF4444' },
      { shape: 'square', color: '#3B82F6' },
      { shape: 'triangle', color: '#22C55E' },
    ];
    const test = applyBindingChange(study);
    const studyColors = study.map((i) => i.color).sort();
    const testColors = test.map((i) => i.color).sort();
    expect(testColors).toEqual(studyColors);
  });

  it('preserves the same set of shapes', () => {
    const study: ShapeItem[] = [
      { shape: 'circle', color: '#EF4444' },
      { shape: 'square', color: '#3B82F6' },
      { shape: 'triangle', color: '#22C55E' },
    ];
    const test = applyBindingChange(study);
    const studyShapes = study.map((i) => i.shape).sort();
    const testShapes = test.map((i) => i.shape).sort();
    expect(testShapes).toEqual(studyShapes);
  });

  it('at least one item has a different color binding', () => {
    const study: ShapeItem[] = [
      { shape: 'circle', color: '#EF4444' },
      { shape: 'square', color: '#3B82F6' },
      { shape: 'triangle', color: '#22C55E' },
    ];
    const test = applyBindingChange(study);
    const changed = test.some((item, i) => item.color !== study[i]!.color);
    expect(changed).toBe(true);
  });

  it('does not mutate the original study items', () => {
    const study: ShapeItem[] = [
      { shape: 'circle', color: '#EF4444' },
      { shape: 'square', color: '#3B82F6' },
    ];
    const original = JSON.stringify(study);
    applyBindingChange(study);
    expect(JSON.stringify(study)).toBe(original);
  });

  it('handles single-item array gracefully (no swap possible)', () => {
    const study: ShapeItem[] = [{ shape: 'circle', color: '#EF4444' }];
    const test = applyBindingChange(study);
    expect(test).toHaveLength(1);
    expect(test[0]!.color).toBe('#EF4444');
  });
});

// =============================================================================
// 4. Trial Generation
// =============================================================================

describe('Binding — generateTrials', () => {
  it('generates the correct number of trials', () => {
    const trials = generateTrials(24);
    expect(trials).toHaveLength(24);
  });

  it('has approximately half same and half changed', () => {
    const trials = generateTrials(24);
    const sameCount = trials.filter((t) => !t.isChanged).length;
    const changedCount = trials.filter((t) => t.isChanged).length;
    expect(sameCount).toBe(12);
    expect(changedCount).toBe(12);
  });

  it('same trials have identical study and test items', () => {
    const trials = generateTrials(20);
    for (const t of trials) {
      if (!t.isChanged) {
        for (let i = 0; i < t.studyItems.length; i++) {
          expect(t.testItems[i]!.shape).toBe(t.studyItems[i]!.shape);
          expect(t.testItems[i]!.color).toBe(t.studyItems[i]!.color);
        }
      }
    }
  });

  it('changed trials have at least one color swap', () => {
    const trials = generateTrials(20);
    for (const t of trials) {
      if (t.isChanged) {
        const hasSwap = t.testItems.some((item, i) => item.color !== t.studyItems[i]!.color);
        expect(hasSwap).toBe(true);
      }
    }
  });

  it('trials are shuffled (not all same first)', () => {
    let foundMixed = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      const trials = generateTrials(24);
      const first12 = trials.slice(0, 12);
      const hasSame = first12.some((t) => !t.isChanged);
      const hasChanged = first12.some((t) => t.isChanged);
      if (hasSame && hasChanged) {
        foundMixed = true;
        break;
      }
    }
    expect(foundMixed).toBe(true);
  });
});

// =============================================================================
// 5. Response Validation
// =============================================================================

describe('Binding — isCorrectResponse', () => {
  it('"same" is correct for unchanged trial', () => {
    expect(isCorrectResponse(makeSameTrial(), 'same')).toBe(true);
  });

  it('"different" is wrong for unchanged trial', () => {
    expect(isCorrectResponse(makeSameTrial(), 'different')).toBe(false);
  });

  it('"different" is correct for changed trial', () => {
    expect(isCorrectResponse(makeChangedTrial(), 'different')).toBe(true);
  });

  it('"same" is wrong for changed trial', () => {
    expect(isCorrectResponse(makeChangedTrial(), 'same')).toBe(false);
  });
});

// =============================================================================
// 6. Cowan's K
// =============================================================================

describe('Binding — computeCowansK', () => {
  it('returns setSize for perfect performance', () => {
    // hitRate=1, faRate=0 => K = setSize * (1 - 0) = setSize
    expect(computeCowansK(1, 0, 3)).toBe(3);
  });

  it('returns 0 for chance performance', () => {
    // hitRate=faRate => K = setSize * 0 = 0
    expect(computeCowansK(0.5, 0.5, 3)).toBe(0);
  });

  it('returns 0 for worse-than-chance (clamped)', () => {
    // hitRate < faRate => negative, clamped to 0
    expect(computeCowansK(0.2, 0.8, 3)).toBe(0);
  });

  it('clamps to setSize maximum', () => {
    // Theoretically impossible but handles edge case
    expect(computeCowansK(1, 0, 3)).toBe(3);
    expect(computeCowansK(1, 0, 5)).toBe(5);
  });

  it('computes partial K correctly', () => {
    // hitRate=0.8, faRate=0.2 => K = 3 * 0.6 = 1.8
    expect(computeCowansK(0.8, 0.2, 3)).toBeCloseTo(1.8, 2);
  });
});

// =============================================================================
// 7. Summary
// =============================================================================

describe('Binding — computeSummary', () => {
  it('computes correct summary for perfect performance', () => {
    const results: BindingTrialResult[] = [
      makeResult(makeSameTrial(), 'same', 400),
      makeResult(makeSameTrial(), 'same', 500),
      makeResult(makeChangedTrial(), 'different', 600),
      makeResult(makeChangedTrial(), 'different', 700),
    ];
    const s = computeSummary(results);
    expect(s.accuracy).toBe(100);
    expect(s.bindingAccuracy).toBe(100);
    expect(s.sameAccuracy).toBe(100);
    expect(s.cowansK).toBe(3); // perfect => K = setSize
    expect(s.avgRT).toBe(550);
  });

  it('computes correct summary with errors', () => {
    const results: BindingTrialResult[] = [
      makeResult(makeSameTrial(), 'same', 400), // correct
      makeResult(makeSameTrial(), 'different', 500), // wrong
      makeResult(makeChangedTrial(), 'different', 600), // correct
      makeResult(makeChangedTrial(), 'same', 700), // wrong
    ];
    const s = computeSummary(results);
    expect(s.accuracy).toBe(50);
    expect(s.bindingAccuracy).toBe(50);
    expect(s.sameAccuracy).toBe(50);
    expect(s.changedCorrect).toBe(1);
    expect(s.sameCorrect).toBe(1);
  });

  it('handles empty results', () => {
    const s = computeSummary([]);
    expect(s.accuracy).toBe(0);
    expect(s.avgRT).toBe(0);
    expect(s.totalTrials).toBe(0);
    expect(s.cowansK).toBe(0);
  });

  it('counts changed vs same trials correctly', () => {
    const results: BindingTrialResult[] = [
      makeResult(makeSameTrial(), 'same'),
      makeResult(makeSameTrial(), 'same'),
      makeResult(makeSameTrial(), 'same'),
      makeResult(makeChangedTrial(), 'different'),
    ];
    const s = computeSummary(results);
    expect(s.sameCount).toBe(3);
    expect(s.changedCount).toBe(1);
  });

  it('Cowan K reflects partial accuracy', () => {
    // 2 changed correct out of 4, 3 same correct out of 4
    const results: BindingTrialResult[] = [
      makeResult(makeChangedTrial(), 'different'), // correct
      makeResult(makeChangedTrial(), 'different'), // correct
      makeResult(makeChangedTrial(), 'same'), // wrong
      makeResult(makeChangedTrial(), 'same'), // wrong
      makeResult(makeSameTrial(), 'same'), // correct
      makeResult(makeSameTrial(), 'same'), // correct
      makeResult(makeSameTrial(), 'same'), // correct
      makeResult(makeSameTrial(), 'different'), // wrong (FA)
    ];
    const s = computeSummary(results);
    // hitRate = 2/4 = 0.5, faRate = 1/4 = 0.25
    // K = 3 * (0.5 - 0.25) = 0.75
    expect(s.cowansK).toBe(0.75);
  });

  it('respects custom setSize parameter', () => {
    const results: BindingTrialResult[] = [
      makeResult(makeChangedTrial(), 'different'),
      makeResult(makeSameTrial(), 'same'),
    ];
    const s = computeSummary(results, 5);
    // Perfect: K = 5 * (1 - 0) = 5
    expect(s.cowansK).toBe(5);
  });
});
