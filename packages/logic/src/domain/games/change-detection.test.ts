import { describe, it, expect } from 'bun:test';
import {
  type ChangeDetectionTrial,
  type ChangeDetectionTrialResult,
  AVAILABLE_COLORS,
  pickColors,
  generateGridPositions,
  generateTrial,
  generateTrials,
  isCorrectResponse,
  computeK,
  computeRatesForSetSize,
  computeKBySetSize,
  computeDPrime,
  computeSummary,
} from './change-detection';

// =============================================================================
// Helpers
// =============================================================================

function makeTrial(setSize: number, changed: boolean): ChangeDetectionTrial {
  return generateTrial(setSize, changed, () => 0.5);
}

function makeResult(
  trial: ChangeDetectionTrial,
  answer: 'same' | 'different' | null,
  rt: number,
  responded = true,
): ChangeDetectionTrialResult {
  return {
    trial,
    answer,
    correct: answer !== null ? isCorrectResponse(trial, answer) : false,
    responseTimeMs: rt,
    responded,
  };
}

// =============================================================================
// 1. Color Picking
// =============================================================================

describe('Change Detection — Color picking', () => {
  it('picks the requested number of colors', () => {
    const colors = pickColors(4);
    expect(colors).toHaveLength(4);
  });

  it('all colors come from the available palette', () => {
    const colors = pickColors(8);
    for (const c of colors) {
      expect(AVAILABLE_COLORS).toContain(c);
    }
  });

  it('picks unique colors (no duplicates)', () => {
    const colors = pickColors(6);
    expect(new Set(colors).size).toBe(6);
  });

  it('returns empty array for count 0', () => {
    expect(pickColors(0)).toHaveLength(0);
  });
});

// =============================================================================
// 2. Grid Position Generation
// =============================================================================

describe('Change Detection — Grid positions', () => {
  it('generates the requested number of positions', () => {
    const positions = generateGridPositions(6);
    expect(positions).toHaveLength(6);
  });

  it('all positions are within 4x3 grid', () => {
    const positions = generateGridPositions(8);
    for (const [x, y] of positions) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(4);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThan(3);
    }
  });

  it('positions are unique', () => {
    const positions = generateGridPositions(10);
    const keys = positions.map(([x, y]) => `${x},${y}`);
    expect(new Set(keys).size).toBe(10);
  });
});

// =============================================================================
// 3. Trial Generation
// =============================================================================

describe('Change Detection — Trial generation', () => {
  it('generates a same trial with identical displays', () => {
    const trial = generateTrial(4, false);
    expect(trial.changed).toBe(false);
    expect(trial.changedIndex).toBeNull();
    expect(trial.display1).toHaveLength(4);
    expect(trial.display2).toHaveLength(4);
    for (let i = 0; i < 4; i++) {
      expect(trial.display2[i]!.color).toBe(trial.display1[i]!.color);
    }
  });

  it('generates a change trial with exactly one different square', () => {
    const trial = generateTrial(6, true);
    expect(trial.changed).toBe(true);
    expect(trial.changedIndex).not.toBeNull();
    let differences = 0;
    for (let i = 0; i < 6; i++) {
      if (trial.display1[i]!.color !== trial.display2[i]!.color) {
        differences++;
        expect(i).toBe(trial.changedIndex as any);
      }
    }
    expect(differences).toBe(1);
  });

  it('changed color is different from original', () => {
    for (let attempt = 0; attempt < 20; attempt++) {
      const trial = generateTrial(4, true);
      const idx = trial.changedIndex!;
      expect(trial.display2[idx]!.color).not.toBe(trial.display1[idx]!.color);
    }
  });

  it('generates balanced trials with alternating change/same', () => {
    const trials = generateTrials(12);
    expect(trials).toHaveLength(12);
    // Before shuffle, even indices are change, odd are same
    // After shuffle, just check counts are balanced
    const changeCount = trials.filter((t) => t.changed).length;
    const sameCount = trials.filter((t) => !t.changed).length;
    expect(changeCount).toBe(6);
    expect(sameCount).toBe(6);
  });

  it('generates trials across all set sizes', () => {
    const trials = generateTrials(12, [4, 6, 8]);
    const sizes = new Set(trials.map((t) => t.setSize));
    expect(sizes.has(4)).toBe(true);
    expect(sizes.has(6)).toBe(true);
    expect(sizes.has(8)).toBe(true);
  });
});

// =============================================================================
// 4. Response Validation
// =============================================================================

describe('Change Detection — Response validation', () => {
  it('"different" is correct when trial changed', () => {
    const trial = makeTrial(4, true);
    expect(isCorrectResponse(trial, 'different')).toBe(true);
    expect(isCorrectResponse(trial, 'same')).toBe(false);
  });

  it('"same" is correct when trial did not change', () => {
    const trial = makeTrial(4, false);
    expect(isCorrectResponse(trial, 'same')).toBe(true);
    expect(isCorrectResponse(trial, 'different')).toBe(false);
  });
});

// =============================================================================
// 5. Cowan's K
// =============================================================================

describe('Change Detection — Cowan K', () => {
  it('K = set_size when perfect performance (hit=1, fa=0)', () => {
    expect(computeK(4, 1.0, 0.0)).toBe(4.0);
    expect(computeK(6, 1.0, 0.0)).toBe(6.0);
  });

  it('K = 0 when hit rate equals false alarm rate', () => {
    expect(computeK(4, 0.5, 0.5)).toBe(0);
  });

  it('K = 0 when false alarm rate exceeds hit rate (clamped)', () => {
    expect(computeK(4, 0.3, 0.7)).toBe(0);
  });

  it('K is proportional to set size', () => {
    const k4 = computeK(4, 0.8, 0.2);
    const k8 = computeK(8, 0.8, 0.2);
    expect(k8).toBe(k4 * 2);
  });

  it('K example: set_size=6, hit=0.75, fa=0.25 => K=3.0', () => {
    expect(computeK(6, 0.75, 0.25)).toBe(3.0);
  });

  it('K is clamped to set_size maximum', () => {
    // This can happen with hit=1, fa=0 (already tested), but verify clamping logic
    expect(computeK(4, 1.0, 0.0)).toBeLessThanOrEqual(4);
  });
});

// =============================================================================
// 6. Hit Rate and False Alarm Rate
// =============================================================================

describe('Change Detection — Rates computation', () => {
  it('computes hit rate from change trials', () => {
    const results: ChangeDetectionTrialResult[] = [
      makeResult(makeTrial(4, true), 'different', 500), // hit
      makeResult(makeTrial(4, true), 'same', 600), // miss
      makeResult(makeTrial(4, false), 'same', 550), // correct rejection
    ];
    const { hitRate } = computeRatesForSetSize(results, 4);
    expect(hitRate).toBe(0.5); // 1/2 change trials correct
  });

  it('computes false alarm rate from same trials', () => {
    const results: ChangeDetectionTrialResult[] = [
      makeResult(makeTrial(4, false), 'different', 500), // false alarm
      makeResult(makeTrial(4, false), 'same', 600), // correct rejection
      makeResult(makeTrial(4, true), 'different', 550), // hit
    ];
    const { falseAlarmRate } = computeRatesForSetSize(results, 4);
    expect(falseAlarmRate).toBe(0.5); // 1/2 same trials incorrect
  });

  it('returns 0 rates when no trials for set size', () => {
    const { hitRate, falseAlarmRate } = computeRatesForSetSize([], 4);
    expect(hitRate).toBe(0);
    expect(falseAlarmRate).toBe(0);
  });

  it('filters by set size', () => {
    const results: ChangeDetectionTrialResult[] = [
      makeResult(makeTrial(4, true), 'different', 500), // hit for size 4
      makeResult(makeTrial(6, true), 'same', 600), // miss for size 6
    ];
    const rates4 = computeRatesForSetSize(results, 4);
    const rates6 = computeRatesForSetSize(results, 6);
    expect(rates4.hitRate).toBe(1.0);
    expect(rates6.hitRate).toBe(0.0);
  });
});

// =============================================================================
// 7. K by Set Size
// =============================================================================

describe('Change Detection — K by set size', () => {
  it('computes K for each set size', () => {
    const results: ChangeDetectionTrialResult[] = [
      // Set size 4: 1 hit out of 1 change, 0 FA out of 1 same => K=4
      makeResult(makeTrial(4, true), 'different', 500),
      makeResult(makeTrial(4, false), 'same', 550),
      // Set size 6: 1 hit out of 1, 1 FA out of 1 => K=0
      makeResult(makeTrial(6, true), 'different', 500),
      makeResult(makeTrial(6, false), 'different', 550),
    ];
    const kMap = computeKBySetSize(results, [4, 6]);
    expect(kMap['4']).toBe(4.0);
    expect(kMap['6']).toBe(0);
  });
});

// =============================================================================
// 8. d-prime
// =============================================================================

describe('Change Detection — d-prime', () => {
  it('is positive for above-chance performance', () => {
    const dp = computeDPrime(0.8, 0.2);
    expect(dp).toBeGreaterThan(0);
  });

  it('is approximately 0 for chance performance (hit ~= fa)', () => {
    const dp = computeDPrime(0.5, 0.5);
    expect(Math.abs(dp)).toBeLessThan(0.1);
  });

  it('is negative when false alarm rate exceeds hit rate', () => {
    const dp = computeDPrime(0.2, 0.8);
    expect(dp).toBeLessThan(0);
  });

  it('handles extreme hit rate (clamped to avoid infinity)', () => {
    const dp = computeDPrime(1.0, 0.0);
    expect(Number.isFinite(dp)).toBe(true);
    expect(dp).toBeGreaterThan(0);
  });
});

// =============================================================================
// 9. Summary Computation
// =============================================================================

describe('Change Detection — Summary computation', () => {
  it('computes accuracy correctly', () => {
    const results: ChangeDetectionTrialResult[] = [
      makeResult(makeTrial(4, true), 'different', 500), // correct
      makeResult(makeTrial(4, false), 'same', 550), // correct
      makeResult(makeTrial(4, true), 'same', 600), // wrong
      makeResult(makeTrial(4, false), 'different', 450), // wrong
    ];
    const summary = computeSummary(results, [4]);
    expect(summary.accuracy).toBe(50);
    expect(summary.correctTrials).toBe(2);
    expect(summary.totalTrials).toBe(4);
  });

  it('computes meanRt from responded trials only', () => {
    const results: ChangeDetectionTrialResult[] = [
      makeResult(makeTrial(4, true), 'different', 400),
      makeResult(makeTrial(4, false), null, 5000, false), // timeout
      makeResult(makeTrial(4, true), 'different', 600),
    ];
    const summary = computeSummary(results, [4]);
    expect(summary.meanRtMs).toBe(500); // (400+600)/2
  });

  it('counts timeouts', () => {
    const results: ChangeDetectionTrialResult[] = [
      makeResult(makeTrial(4, true), 'different', 400),
      makeResult(makeTrial(4, false), null, 5000, false),
      makeResult(makeTrial(4, false), null, 5000, false),
    ];
    const summary = computeSummary(results, [4]);
    expect(summary.timeouts).toBe(2);
  });

  it('computes overall K as average of per-set-size K values', () => {
    const results: ChangeDetectionTrialResult[] = [
      // Size 4: perfect => K=4
      makeResult(makeTrial(4, true), 'different', 500),
      makeResult(makeTrial(4, false), 'same', 550),
      // Size 6: perfect => K=6
      makeResult(makeTrial(6, true), 'different', 500),
      makeResult(makeTrial(6, false), 'same', 550),
    ];
    const summary = computeSummary(results, [4, 6]);
    expect(summary.overallK).toBe(5.0); // (4+6)/2
  });

  it('computes hit rate and false alarm rate', () => {
    const results: ChangeDetectionTrialResult[] = [
      makeResult(makeTrial(4, true), 'different', 500), // hit
      makeResult(makeTrial(4, true), 'same', 600), // miss
      makeResult(makeTrial(4, false), 'different', 500), // false alarm
      makeResult(makeTrial(4, false), 'same', 550), // correct rejection
    ];
    const summary = computeSummary(results, [4]);
    expect(summary.hitRate).toBe(0.5);
    expect(summary.falseAlarmRate).toBe(0.5);
  });

  it('includes d-prime', () => {
    const results: ChangeDetectionTrialResult[] = [
      makeResult(makeTrial(4, true), 'different', 500),
      makeResult(makeTrial(4, false), 'same', 550),
    ];
    const summary = computeSummary(results, [4]);
    expect(Number.isFinite(summary.dPrime)).toBe(true);
    expect(summary.dPrime).toBeGreaterThan(0); // Perfect performance
  });

  it('handles empty results', () => {
    const summary = computeSummary([]);
    expect(summary.accuracy).toBe(0);
    expect(summary.totalTrials).toBe(0);
    expect(summary.meanRtMs).toBe(0);
    expect(summary.overallK).toBe(0);
    expect(summary.timeouts).toBe(0);
  });
});
