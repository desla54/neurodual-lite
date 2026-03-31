import { describe, it, expect } from 'bun:test';
import {
  randomForeperiod,
  isFalseStart,
  isLapse,
  createTrialResult,
  createFalseStartResult,
  computeMedian,
  computeMean,
  computeSummary,
  FOREPERIOD_MIN_MS,
  FOREPERIOD_MAX_MS,
  type PvtTrialResult,
} from './pvt';

// =============================================================================
// Foreperiod Generation
// =============================================================================

describe('randomForeperiod', () => {
  it('generates value within bounds [2000, 10000]', () => {
    for (let i = 0; i < 100; i++) {
      const fp = randomForeperiod();
      expect(fp).toBeGreaterThanOrEqual(FOREPERIOD_MIN_MS);
      expect(fp).toBeLessThanOrEqual(FOREPERIOD_MAX_MS);
    }
  });

  it('returns minimum when rng returns 0', () => {
    expect(randomForeperiod(() => 0)).toBe(FOREPERIOD_MIN_MS);
  });

  it('returns maximum when rng returns 1', () => {
    expect(randomForeperiod(() => 1)).toBe(FOREPERIOD_MAX_MS);
  });

  it('returns midpoint when rng returns 0.5', () => {
    const midpoint = (FOREPERIOD_MIN_MS + FOREPERIOD_MAX_MS) / 2;
    expect(randomForeperiod(() => 0.5)).toBe(midpoint);
  });

  it('uses custom rng for deterministic output', () => {
    const rng = () => 0.25;
    const expected = FOREPERIOD_MIN_MS + 0.25 * (FOREPERIOD_MAX_MS - FOREPERIOD_MIN_MS);
    expect(randomForeperiod(rng)).toBe(expected);
  });
});

// =============================================================================
// False Start Detection
// =============================================================================

describe('isFalseStart', () => {
  it('returns true when responded during wait', () => {
    expect(isFalseStart(true)).toBe(true);
  });

  it('returns false when responded after stimulus', () => {
    expect(isFalseStart(false)).toBe(false);
  });
});

// =============================================================================
// Lapse Classification
// =============================================================================

describe('isLapse', () => {
  it('classifies RT = 499ms as NOT a lapse', () => {
    expect(isLapse(499)).toBe(false);
  });

  it('classifies RT = 500ms as NOT a lapse (threshold is >500, not >=)', () => {
    expect(isLapse(500)).toBe(false);
  });

  it('classifies RT = 501ms as a lapse', () => {
    expect(isLapse(501)).toBe(true);
  });

  it('classifies RT = 200ms as NOT a lapse', () => {
    expect(isLapse(200)).toBe(false);
  });

  it('classifies RT = 1000ms as a lapse', () => {
    expect(isLapse(1000)).toBe(true);
  });

  it('classifies RT = 0ms as NOT a lapse', () => {
    expect(isLapse(0)).toBe(false);
  });
});

// =============================================================================
// Trial Result Creation
// =============================================================================

describe('createTrialResult', () => {
  it('creates a valid trial result with lapse detection', () => {
    const result = createTrialResult(3, 600);
    expect(result.trialIndex).toBe(3);
    expect(result.responseTimeMs).toBe(600);
    expect(result.falseStart).toBe(false);
    expect(result.lapse).toBe(true);
  });

  it('creates a non-lapse result for fast RT', () => {
    const result = createTrialResult(0, 250);
    expect(result.lapse).toBe(false);
    expect(result.falseStart).toBe(false);
  });
});

describe('createFalseStartResult', () => {
  it('creates a false start result with zero RT', () => {
    const result = createFalseStartResult(2);
    expect(result.trialIndex).toBe(2);
    expect(result.responseTimeMs).toBe(0);
    expect(result.falseStart).toBe(true);
    expect(result.lapse).toBe(false);
  });
});

// =============================================================================
// Median Calculation
// =============================================================================

describe('computeMedian', () => {
  it('returns 0 for empty array', () => {
    expect(computeMedian([])).toBe(0);
  });

  it('returns the single value for array of one', () => {
    expect(computeMedian([250])).toBe(250);
  });

  it('returns middle value for odd-length array', () => {
    expect(computeMedian([200, 300, 400])).toBe(300);
  });

  it('returns average of two middle values for even-length array', () => {
    expect(computeMedian([200, 300, 400, 500])).toBe(350);
  });

  it('rounds to nearest integer', () => {
    expect(computeMedian([201, 300])).toBe(251); // (201+300)/2 = 250.5 -> 251
  });

  it('works with already sorted input', () => {
    expect(computeMedian([100, 200, 250, 300, 500])).toBe(250);
  });
});

// =============================================================================
// Mean Calculation
// =============================================================================

describe('computeMean', () => {
  it('returns 0 for empty array', () => {
    expect(computeMean([])).toBe(0);
  });

  it('returns the single value for array of one', () => {
    expect(computeMean([300])).toBe(300);
  });

  it('computes correct mean', () => {
    expect(computeMean([200, 300, 400])).toBe(300);
  });

  it('rounds to nearest integer', () => {
    expect(computeMean([100, 200, 300, 401])).toBe(250); // 1001/4 = 250.25
  });
});

// =============================================================================
// Summary Computation
// =============================================================================

describe('computeSummary', () => {
  it('computes correct summary for mixed results', () => {
    const results: PvtTrialResult[] = [
      { trialIndex: 0, responseTimeMs: 250, falseStart: false, lapse: false },
      { trialIndex: 1, responseTimeMs: 350, falseStart: false, lapse: false },
      { trialIndex: 2, responseTimeMs: 600, falseStart: false, lapse: true },
      { trialIndex: 3, responseTimeMs: 0, falseStart: true, lapse: false },
      { trialIndex: 4, responseTimeMs: 300, falseStart: false, lapse: false },
    ];
    const summary = computeSummary(results);
    expect(summary.totalTrials).toBe(5);
    expect(summary.validTrials).toBe(4); // excluding false start
    expect(summary.falseStartCount).toBe(1);
    expect(summary.lapseCount).toBe(1);
    expect(summary.fastestRtMs).toBe(250);
    expect(summary.slowestRtMs).toBe(600);
    // Valid RTs sorted: [250, 300, 350, 600]
    // Median of even: (300+350)/2 = 325
    expect(summary.medianRtMs).toBe(325);
    // Mean: (250+300+350+600)/4 = 375
    expect(summary.meanRtMs).toBe(375);
  });

  it('handles all lapses', () => {
    const results: PvtTrialResult[] = [
      { trialIndex: 0, responseTimeMs: 600, falseStart: false, lapse: true },
      { trialIndex: 1, responseTimeMs: 800, falseStart: false, lapse: true },
      { trialIndex: 2, responseTimeMs: 1000, falseStart: false, lapse: true },
    ];
    const summary = computeSummary(results);
    expect(summary.lapseCount).toBe(3);
    expect(summary.validTrials).toBe(3);
    expect(summary.fastestRtMs).toBe(600);
    expect(summary.slowestRtMs).toBe(1000);
  });

  it('handles no lapses', () => {
    const results: PvtTrialResult[] = [
      { trialIndex: 0, responseTimeMs: 200, falseStart: false, lapse: false },
      { trialIndex: 1, responseTimeMs: 250, falseStart: false, lapse: false },
      { trialIndex: 2, responseTimeMs: 300, falseStart: false, lapse: false },
    ];
    const summary = computeSummary(results);
    expect(summary.lapseCount).toBe(0);
    expect(summary.medianRtMs).toBe(250);
    expect(summary.meanRtMs).toBe(250);
  });

  it('handles single trial', () => {
    const results: PvtTrialResult[] = [
      { trialIndex: 0, responseTimeMs: 280, falseStart: false, lapse: false },
    ];
    const summary = computeSummary(results);
    expect(summary.validTrials).toBe(1);
    expect(summary.medianRtMs).toBe(280);
    expect(summary.meanRtMs).toBe(280);
    expect(summary.fastestRtMs).toBe(280);
    expect(summary.slowestRtMs).toBe(280);
  });

  it('handles empty results', () => {
    const summary = computeSummary([]);
    expect(summary.totalTrials).toBe(0);
    expect(summary.validTrials).toBe(0);
    expect(summary.medianRtMs).toBe(0);
    expect(summary.meanRtMs).toBe(0);
    expect(summary.fastestRtMs).toBe(0);
    expect(summary.slowestRtMs).toBe(0);
    expect(summary.lapseCount).toBe(0);
    expect(summary.falseStartCount).toBe(0);
  });

  it('handles all false starts', () => {
    const results: PvtTrialResult[] = [
      { trialIndex: 0, responseTimeMs: 0, falseStart: true, lapse: false },
      { trialIndex: 1, responseTimeMs: 0, falseStart: true, lapse: false },
    ];
    const summary = computeSummary(results);
    expect(summary.totalTrials).toBe(2);
    expect(summary.validTrials).toBe(0);
    expect(summary.falseStartCount).toBe(2);
    expect(summary.medianRtMs).toBe(0);
    expect(summary.meanRtMs).toBe(0);
    expect(summary.fastestRtMs).toBe(0);
    expect(summary.slowestRtMs).toBe(0);
  });
});
