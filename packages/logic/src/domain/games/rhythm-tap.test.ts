import { describe, it, expect } from 'bun:test';
import {
  type RhythmPattern,
  type TrialResult,
  generatePattern,
  generateAllTrials,
  intervalAccuracy,
  evaluateReproduction,
  computeSummary,
  TOLERANCE_MS,
  ALL_INTERVALS,
} from './rhythm-tap';

// =============================================================================
// 1. Pattern generation — correct number of beats with valid intervals
// =============================================================================

describe('Rhythm Tap — Pattern generation', () => {
  it('nLevel 1 generates 3-4 beats', () => {
    for (let i = 0; i < 50; i++) {
      const pattern = generatePattern(1);
      expect(pattern.beatCount).toBeGreaterThanOrEqual(3);
      expect(pattern.beatCount).toBeLessThanOrEqual(4);
    }
  });

  it('nLevel 2 generates 4-5 beats', () => {
    for (let i = 0; i < 50; i++) {
      const pattern = generatePattern(2);
      expect(pattern.beatCount).toBeGreaterThanOrEqual(4);
      expect(pattern.beatCount).toBeLessThanOrEqual(5);
    }
  });

  it('nLevel 3 generates 5-6 beats', () => {
    for (let i = 0; i < 50; i++) {
      const pattern = generatePattern(3);
      expect(pattern.beatCount).toBeGreaterThanOrEqual(5);
      expect(pattern.beatCount).toBeLessThanOrEqual(6);
    }
  });

  it('intervals count = beatCount - 1', () => {
    for (let nLevel = 1; nLevel <= 3; nLevel++) {
      for (let i = 0; i < 30; i++) {
        const pattern = generatePattern(nLevel);
        expect(pattern.intervals).toHaveLength(pattern.beatCount - 1);
      }
    }
  });

  it('all intervals come from ALL_INTERVALS', () => {
    const validIntervals = new Set(ALL_INTERVALS);
    for (let nLevel = 1; nLevel <= 3; nLevel++) {
      for (let i = 0; i < 30; i++) {
        const pattern = generatePattern(nLevel);
        for (const interval of pattern.intervals) {
          expect(validIntervals.has(interval as (typeof ALL_INTERVALS)[number])).toBe(true);
        }
      }
    }
  });

  it('nLevel 1 uses only 2 interval types per pattern', () => {
    for (let i = 0; i < 30; i++) {
      const pattern = generatePattern(1);
      const uniqueIntervals = new Set(pattern.intervals);
      expect(uniqueIntervals.size).toBeLessThanOrEqual(2);
    }
  });

  it('nLevel 2 uses up to 3 interval types per pattern', () => {
    for (let i = 0; i < 30; i++) {
      const pattern = generatePattern(2);
      const uniqueIntervals = new Set(pattern.intervals);
      expect(uniqueIntervals.size).toBeLessThanOrEqual(3);
    }
  });

  it('generateAllTrials produces the requested count', () => {
    const trials = generateAllTrials(12, 1);
    expect(trials).toHaveLength(12);
  });
});

// =============================================================================
// 2. Timing accuracy — tolerance check
// =============================================================================

describe('Rhythm Tap — Timing accuracy', () => {
  it('exact reproduction yields accuracy 100%', () => {
    expect(intervalAccuracy(600, 600)).toBeCloseTo(1.0, 2);
  });

  it('reproduction within tolerance yields high accuracy', () => {
    // 600ms target, 700ms reproduced -> diff=100, accuracy = 1 - 100/600 = 0.833
    expect(intervalAccuracy(600, 700)).toBeCloseTo(0.833, 2);
  });

  it('reproduction at exactly +-150ms tolerance', () => {
    // 600ms target, 750ms reproduced -> diff=150, accuracy = 1 - 150/600 = 0.75
    expect(intervalAccuracy(600, 750)).toBeCloseTo(0.75, 2);
  });

  it('reproduction far off yields 0 accuracy (clamped)', () => {
    // 300ms target, 700ms reproduced -> diff=400, accuracy = max(0, 1-400/300) = 0
    expect(intervalAccuracy(300, 700)).toBe(0);
  });

  it('accuracy is symmetric around target', () => {
    const acc1 = intervalAccuracy(600, 700); // +100ms
    const acc2 = intervalAccuracy(600, 500); // -100ms
    expect(acc1).toBeCloseTo(acc2, 2);
  });

  it('accuracy is never negative', () => {
    for (let diff = 0; diff <= 2000; diff += 50) {
      expect(intervalAccuracy(300, 300 + diff)).toBeGreaterThanOrEqual(0);
    }
  });
});

// =============================================================================
// 3. Accuracy calculation — overall rhythm reproduction
// =============================================================================

describe('Rhythm Tap — evaluateReproduction', () => {
  it('perfect reproduction is correct', () => {
    const pattern: RhythmPattern = { beatCount: 4, intervals: [500, 600, 400] };
    // Timestamps: 0, 500, 1100, 1500
    const taps = [0, 500, 1100, 1500];
    const result = evaluateReproduction(pattern, taps);
    expect(result.correct).toBe(true);
    expect(result.avgAccuracy).toBe(100);
  });

  it('within tolerance is correct', () => {
    const pattern: RhythmPattern = { beatCount: 3, intervals: [600, 600] };
    // Actual intervals: 650, 550 (both within 150ms)
    const taps = [0, 650, 1200];
    const result = evaluateReproduction(pattern, taps);
    expect(result.correct).toBe(true);
  });

  it('outside tolerance is incorrect', () => {
    const pattern: RhythmPattern = { beatCount: 3, intervals: [600, 600] };
    // Actual intervals: 900, 600 (first is 300ms off, outside 150ms tolerance)
    const taps = [0, 900, 1500];
    const result = evaluateReproduction(pattern, taps);
    expect(result.correct).toBe(false);
  });

  it('avgAccuracy is the mean of per-interval accuracies', () => {
    const pattern: RhythmPattern = { beatCount: 3, intervals: [1000, 1000] };
    // Actual intervals: 1100, 900 => accuracies: 90%, 90%
    const taps = [0, 1100, 2000];
    const result = evaluateReproduction(pattern, taps);
    expect(result.avgAccuracy).toBe(90);
    expect(result.intervalAccuracies).toEqual([90, 90]);
  });

  it('reproduced intervals are rounded', () => {
    const pattern: RhythmPattern = { beatCount: 3, intervals: [500, 500] };
    const taps = [0, 501.7, 1003.2];
    const result = evaluateReproduction(pattern, taps);
    expect(result.reproducedIntervals[0]).toBe(502);
    expect(result.reproducedIntervals[1]).toBe(502); // rounded
  });
});

// =============================================================================
// 4. Interval types — 5 different durations
// =============================================================================

describe('Rhythm Tap — Interval types', () => {
  it('ALL_INTERVALS has 5 different durations', () => {
    expect(ALL_INTERVALS).toHaveLength(5);
  });

  it('intervals are [300, 450, 600, 800, 1000]', () => {
    expect([...ALL_INTERVALS]).toEqual([300, 450, 600, 800, 1000]);
  });

  it('nLevel 3 can use all 5 interval types across multiple patterns', () => {
    const allUsed = new Set<number>();
    for (let i = 0; i < 100; i++) {
      const pattern = generatePattern(3);
      for (const interval of pattern.intervals) {
        allUsed.add(interval);
      }
    }
    expect(allUsed.size).toBe(ALL_INTERVALS.length);
  });
});

// =============================================================================
// 5. Listen / Reproduce phases — two-phase system
// =============================================================================

describe('Rhythm Tap — Two-phase system', () => {
  it('pattern defines the listen phase (beatCount beats, intervals between)', () => {
    const pattern = generatePattern(2);
    expect(pattern.beatCount).toBeGreaterThanOrEqual(4);
    // The listen phase plays beatCount beats with intervals between them
    expect(pattern.intervals.length).toBe(pattern.beatCount - 1);
  });

  it('reproduction requires exactly beatCount taps', () => {
    const pattern: RhythmPattern = { beatCount: 4, intervals: [500, 600, 400] };
    // 4 taps needed
    const taps = [0, 500, 1100, 1500];
    const result = evaluateReproduction(pattern, taps);
    expect(result.reproducedIntervals).toHaveLength(3); // beatCount - 1 intervals
  });

  it('fewer taps than beatCount produces fewer intervals to compare', () => {
    const pattern: RhythmPattern = { beatCount: 4, intervals: [500, 600, 400] };
    // Only 3 taps (missing last beat)
    const taps = [0, 500, 1100];
    const result = evaluateReproduction(pattern, taps);
    expect(result.reproducedIntervals).toHaveLength(2);
    // Should compare min(3, 2) = 2 intervals
    expect(result.intervalAccuracies).toHaveLength(2);
  });
});

// =============================================================================
// 6. Scoring — based on timing accuracy
// =============================================================================

describe('Rhythm Tap — Scoring (computeSummary)', () => {
  function makeResult(avgAccuracy: number, correct: boolean): TrialResult {
    return {
      pattern: { beatCount: 4, intervals: [500, 600, 400] },
      reproducedIntervals: [500, 600, 400],
      intervalAccuracies: [avgAccuracy, avgAccuracy, avgAccuracy],
      avgAccuracy,
      correct,
    };
  }

  it('computes accuracy as fraction of correct trials', () => {
    const results: TrialResult[] = [
      makeResult(95, true),
      makeResult(90, true),
      makeResult(40, false),
      makeResult(85, true),
    ];
    const summary = computeSummary(results);
    expect(summary.accuracy).toBeCloseTo(0.75, 2);
    expect(summary.correctTrials).toBe(3);
  });

  it('computes avgRhythmScore as mean of avgAccuracy across trials', () => {
    const results: TrialResult[] = [
      makeResult(80, true),
      makeResult(60, false),
      makeResult(100, true),
    ];
    const summary = computeSummary(results);
    expect(summary.avgRhythmScore).toBe(80); // (80+60+100)/3
  });

  it('finds best and worst trial', () => {
    const results: TrialResult[] = [
      makeResult(90, true),
      makeResult(50, false),
      makeResult(75, true),
    ];
    const summary = computeSummary(results);
    expect(summary.bestTrial).toBe(90);
    expect(summary.worstTrial).toBe(50);
  });

  it('handles empty results', () => {
    const summary = computeSummary([]);
    expect(summary.totalTrials).toBe(0);
    expect(summary.accuracy).toBe(0);
    expect(summary.avgRhythmScore).toBe(0);
  });

  it('handles single trial', () => {
    const summary = computeSummary([makeResult(85, true)]);
    expect(summary.totalTrials).toBe(1);
    expect(summary.correctTrials).toBe(1);
    expect(summary.bestTrial).toBe(85);
    expect(summary.worstTrial).toBe(85);
  });
});

// =============================================================================
// 7. Edge cases
// =============================================================================

describe('Rhythm Tap — Edge cases', () => {
  it('double taps (very short interval) produce low accuracy', () => {
    const pattern: RhythmPattern = { beatCount: 3, intervals: [600, 600] };
    // Double tap: second tap at 10ms instead of 600ms
    const taps = [0, 10, 620];
    const result = evaluateReproduction(pattern, taps);
    // First interval: 10ms vs 600ms target -> very low accuracy
    expect(result.intervalAccuracies[0]).toBeLessThan(10);
    expect(result.correct).toBe(false);
  });

  it('very late taps produce low accuracy', () => {
    const pattern: RhythmPattern = { beatCount: 3, intervals: [600, 600] };
    // Very late: 2000ms instead of 600ms
    const taps = [0, 2000, 4000];
    const result = evaluateReproduction(pattern, taps);
    expect(result.intervalAccuracies[0]).toBeLessThan(50);
  });

  it('no taps (empty array) produces empty intervals', () => {
    const pattern: RhythmPattern = { beatCount: 3, intervals: [600, 600] };
    const result = evaluateReproduction(pattern, []);
    expect(result.reproducedIntervals).toHaveLength(0);
    expect(result.avgAccuracy).toBe(0);
    // "correct" requires all target intervals within tolerance — with 0 reproduced,
    // the every() call on an empty reproduced array technically returns true for the
    // target intervals check, but we check reproduced[i] != null which fails
    expect(result.correct).toBe(false);
  });

  it('single tap produces 0 intervals', () => {
    const pattern: RhythmPattern = { beatCount: 3, intervals: [600, 600] };
    const result = evaluateReproduction(pattern, [0]);
    expect(result.reproducedIntervals).toHaveLength(0);
  });

  it('perfect score for exactly matching timestamps', () => {
    const pattern: RhythmPattern = {
      beatCount: 5,
      intervals: [300, 450, 600, 800],
    };
    const taps = [0, 300, 750, 1350, 2150];
    const result = evaluateReproduction(pattern, taps);
    expect(result.correct).toBe(true);
    expect(result.avgAccuracy).toBe(100);
    expect(result.intervalAccuracies).toEqual([100, 100, 100, 100]);
  });

  it('all intervals at boundary of tolerance (150ms)', () => {
    const pattern: RhythmPattern = { beatCount: 3, intervals: [600, 600] };
    // Each interval off by exactly 150ms
    const taps = [0, 750, 1200]; // intervals: 750, 450
    const result = evaluateReproduction(pattern, taps);
    // 750-600=150 (at boundary), 450-600=-150 (at boundary)
    expect(result.correct).toBe(true);
  });

  it('one interval just outside tolerance makes trial incorrect', () => {
    const pattern: RhythmPattern = { beatCount: 3, intervals: [600, 600] };
    // First interval off by 151ms (just outside tolerance)
    const taps = [0, 751, 1351];
    const result = evaluateReproduction(pattern, taps);
    expect(result.correct).toBe(false);
  });

  it('TOLERANCE_MS is 150', () => {
    expect(TOLERANCE_MS).toBe(150);
  });
});
