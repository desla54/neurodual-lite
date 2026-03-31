import { describe, it, expect } from 'vitest';
import {
  adaptDifficulty,
  createAdaptiveState,
  createProfileAdaptiveState,
  isConverged,
  getCeilingEstimate,
  computeMeasureResult,
  type TrialRecord,
} from './adaptive';

// ---------------------------------------------------------------------------
// createAdaptiveState
// ---------------------------------------------------------------------------

describe('createAdaptiveState', () => {
  it('creates state with defaults', () => {
    const state = createAdaptiveState();
    expect(state.level).toBe(1);
    expect(state.consecutiveCorrect).toBe(0);
    expect(state.minLevel).toBe(1);
    expect(state.maxLevel).toBe(10);
    expect(state.trialCount).toBe(0);
    expect(state.reversals).toBe(0);
    expect(state.peakLevel).toBe(1);
    expect(state.lastDirection).toBeNull();
    expect(state.reversalLevels).toEqual([]);
  });

  it('clamps start level to bounds', () => {
    expect(createAdaptiveState(0, 1, 10).level).toBe(1);
    expect(createAdaptiveState(15, 1, 10).level).toBe(10);
    expect(createAdaptiveState(5, 1, 10).level).toBe(5);
  });

  it('sets peakLevel to clamped start level', () => {
    expect(createAdaptiveState(7, 1, 30).peakLevel).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// createProfileAdaptiveState
// ---------------------------------------------------------------------------

describe('createProfileAdaptiveState', () => {
  it('uses iraven maxLevel=10', () => {
    const state = createProfileAdaptiveState('iraven');
    expect(state.maxLevel).toBe(10);
  });

  it('uses neurodual maxLevel=30', () => {
    const state = createProfileAdaptiveState('neurodual');
    expect(state.maxLevel).toBe(30);
  });

  it('accepts custom maxTrials', () => {
    const state = createProfileAdaptiveState('neurodual', 1, 25);
    expect(state.maxTrials).toBe(25);
  });
});

// ---------------------------------------------------------------------------
// adaptDifficulty — basic behavior
// ---------------------------------------------------------------------------

describe('adaptDifficulty', () => {
  it('increments consecutive correct on correct answer', () => {
    const state = createAdaptiveState(3);
    const next = adaptDifficulty(state, true);
    expect(next.consecutiveCorrect).toBe(1);
    expect(next.level).toBe(3);
  });

  it('levels up after 2 consecutive correct (step=4 at 0 reversals)', () => {
    let state = createAdaptiveState(3, 1, 30);
    state = adaptDifficulty(state, true);
    state = adaptDifficulty(state, true);
    expect(state.level).toBe(7); // 3 + 4
    expect(state.consecutiveCorrect).toBe(0);
  });

  it('levels down on incorrect (step=4 at 0 reversals)', () => {
    const state = createAdaptiveState(10, 1, 30);
    const next = adaptDifficulty(state, false);
    expect(next.level).toBe(6); // 10 - 4
    expect(next.consecutiveCorrect).toBe(0);
  });

  it('resets consecutive correct on incorrect', () => {
    let state = createAdaptiveState(10, 1, 30);
    state = adaptDifficulty(state, true); // 1 correct
    state = adaptDifficulty(state, false); // incorrect resets
    expect(state.consecutiveCorrect).toBe(0);
    expect(state.level).toBe(6); // 10 - 4
  });

  it('does not go below minLevel', () => {
    const state = createAdaptiveState(1, 1, 10);
    const next = adaptDifficulty(state, false);
    expect(next.level).toBe(1);
  });

  it('does not go above maxLevel', () => {
    let state = createAdaptiveState(28, 1, 30);
    state = adaptDifficulty(state, true);
    state = adaptDifficulty(state, true);
    expect(state.level).toBe(30); // capped, not 32
  });

  it('step reduces after reversals', () => {
    let state = createAdaptiveState(10, 1, 30);
    // Go up (step=4, 0 reversals): 10 → 14
    state = adaptDifficulty(state, true);
    state = adaptDifficulty(state, true);
    expect(state.level).toBe(14);
    // Go down (step=4, 0 reversals): 14 → 10, reversal #1 recorded
    state = adaptDifficulty(state, false);
    expect(state.level).toBe(10);
    expect(state.reversals).toBe(1);
    // Now step=2 (1 reversal): go up 10 → 12, reversal #2 (down→up)
    state = adaptDifficulty(state, true);
    state = adaptDifficulty(state, true);
    expect(state.level).toBe(12);
    expect(state.reversals).toBe(2);
    // Now step=1 (2 reversals): go down 12 → 11
    state = adaptDifficulty(state, false);
    expect(state.level).toBe(11);
    expect(state.reversals).toBe(3); // reversal #3 (up→down)
    // Step stays 1: go up 11 → 12
    state = adaptDifficulty(state, true);
    state = adaptDifficulty(state, true);
    expect(state.level).toBe(12);
  });
});

// ---------------------------------------------------------------------------
// adaptDifficulty — extended tracking
// ---------------------------------------------------------------------------

describe('adaptDifficulty — extended tracking', () => {
  it('increments trialCount on each call', () => {
    let state = createAdaptiveState(3);
    state = adaptDifficulty(state, true);
    expect(state.trialCount).toBe(1);
    state = adaptDifficulty(state, false);
    expect(state.trialCount).toBe(2);
  });

  it('tracks peakLevel', () => {
    let state = createAdaptiveState(3, 1, 30);
    // Go up: 3 → 7 (step=4)
    state = adaptDifficulty(state, true);
    state = adaptDifficulty(state, true);
    expect(state.peakLevel).toBe(7);
    // Go down
    state = adaptDifficulty(state, false);
    expect(state.peakLevel).toBe(7); // stays
  });

  it('detects reversals (up→down)', () => {
    let state = createAdaptiveState(10, 1, 30);
    // Go up: 10 → 14
    state = adaptDifficulty(state, true);
    state = adaptDifficulty(state, true);
    expect(state.lastDirection).toBe('up');
    expect(state.reversals).toBe(0);
    // Go down: 14 → 10 (reversal!)
    state = adaptDifficulty(state, false);
    expect(state.lastDirection).toBe('down');
    expect(state.reversals).toBe(1);
    expect(state.reversalLevels).toEqual([14]);
  });

  it('no reversal on same direction', () => {
    let state = createAdaptiveState(3, 1, 30);
    // Up twice in a row
    state = adaptDifficulty(state, true);
    state = adaptDifficulty(state, true); // 3→7
    state = adaptDifficulty(state, true);
    state = adaptDifficulty(state, true); // 7→11
    expect(state.reversals).toBe(0);
  });

  it('no reversal when level stays at boundary', () => {
    let state = createAdaptiveState(1, 1, 10);
    state = adaptDifficulty(state, false);
    expect(state.lastDirection).toBeNull(); // no movement = no direction
    expect(state.reversals).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// isConverged
// ---------------------------------------------------------------------------

describe('isConverged', () => {
  it('returns false initially', () => {
    expect(isConverged(createAdaptiveState())).toBe(false);
  });

  it('returns true when reversals >= 6', () => {
    const state = { ...createAdaptiveState(), reversals: 6 };
    expect(isConverged(state)).toBe(true);
  });

  it('returns true when trialCount >= maxTrials', () => {
    const state = { ...createAdaptiveState(), trialCount: 30, maxTrials: 30 };
    expect(isConverged(state)).toBe(true);
  });

  it('returns false just below thresholds', () => {
    const state = { ...createAdaptiveState(), reversals: 5, trialCount: 29, maxTrials: 30 };
    expect(isConverged(state)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getCeilingEstimate
// ---------------------------------------------------------------------------

describe('getCeilingEstimate', () => {
  it('returns peakLevel when no reversals', () => {
    const state = { ...createAdaptiveState(7, 1, 30), peakLevel: 7 };
    expect(getCeilingEstimate(state)).toBe(7);
  });

  it('averages last 4 reversal levels', () => {
    const state = {
      ...createAdaptiveState(),
      reversalLevels: [5, 6, 7, 8, 9, 10],
      peakLevel: 12,
    };
    expect(getCeilingEstimate(state)).toBe(9); // mean(7,8,9,10) = 8.5 → 9
  });

  it('uses all reversal levels when fewer than 4', () => {
    const state = {
      ...createAdaptiveState(),
      reversalLevels: [5, 7],
      peakLevel: 10,
    };
    expect(getCeilingEstimate(state)).toBe(6); // mean(5,7) = 6
  });

  it('rounds to nearest integer', () => {
    const state = {
      ...createAdaptiveState(),
      reversalLevels: [10, 11, 10, 12],
      peakLevel: 12,
    };
    expect(getCeilingEstimate(state)).toBe(11); // mean = 10.75 → 11
  });
});

// ---------------------------------------------------------------------------
// computeMeasureResult
// ---------------------------------------------------------------------------

describe('computeMeasureResult', () => {
  it('computes accuracy and RT at ceiling', () => {
    const state = {
      ...createAdaptiveState(1, 1, 30),
      trialCount: 20,
      reversals: 6,
      peakLevel: 12,
      reversalLevels: [10, 11, 10, 11, 10, 11],
    };
    const trials: TrialRecord[] = [
      { level: 10, correct: true, rt: 2000 },
      { level: 11, correct: true, rt: 3000 },
      { level: 11, correct: false, rt: 4000 },
      { level: 12, correct: true, rt: 5000 },
      { level: 5, correct: true, rt: 1000 },
    ];

    const result = computeMeasureResult(state, trials);
    expect(result.ceilingLevel).toBe(11);
    expect(result.accuracyAtCeiling).toBeCloseTo(0.75);
    expect(result.meanRtAtCeiling).toBeCloseTo(3500);
    expect(result.totalTrials).toBe(20);
    expect(result.reversals).toBe(6);
    expect(result.peakLevel).toBe(12);
  });

  it('returns zeros when no trials near ceiling', () => {
    const state = {
      ...createAdaptiveState(),
      peakLevel: 20,
      reversalLevels: [18, 19, 20, 19],
    };
    const trials: TrialRecord[] = [{ level: 1, correct: true, rt: 1000 }];
    const result = computeMeasureResult(state, trials);
    expect(result.accuracyAtCeiling).toBe(0);
    expect(result.meanRtAtCeiling).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Accelerated staircase — reachability
// ---------------------------------------------------------------------------

describe('accelerated staircase — reachability', () => {
  it('can reach level 30 from level 1 within 30 trials (all correct)', () => {
    let state = createAdaptiveState(1, 1, 30);
    for (let i = 0; i < 30; i++) {
      state = adaptDifficulty(state, true);
    }
    // With step=4: 15 pairs of correct = 15 level-ups × 4 = +60
    // Actually capped at 30
    expect(state.peakLevel).toBe(30);
  });

  it('reaches high levels fast then refines', () => {
    let state = createAdaptiveState(1, 1, 30);
    const levels: number[] = [1];
    // 6 correct → 3 level-ups × step 4 = +12 → level 13
    for (let i = 0; i < 6; i++) {
      state = adaptDifficulty(state, true);
      levels.push(state.level);
    }
    expect(state.level).toBe(13);
    // 1 incorrect → down by 4 → level 9, reversal #1
    state = adaptDifficulty(state, false);
    expect(state.level).toBe(9);
    expect(state.reversals).toBe(1);
    // Step=2 (1 reversal): 2 correct → up by 2 → level 11, reversal #2 (down→up)
    state = adaptDifficulty(state, true);
    state = adaptDifficulty(state, true);
    expect(state.level).toBe(11);
    expect(state.reversals).toBe(2);
    // Step=1 (2 reversals): incorrect → down by 1 → level 10, reversal #3
    state = adaptDifficulty(state, false);
    expect(state.level).toBe(10);
    expect(state.reversals).toBe(3);
    // Step=1: 2 correct → up by 1 → level 11, reversal #4
    state = adaptDifficulty(state, true);
    state = adaptDifficulty(state, true);
    expect(state.level).toBe(11);
  });
});

// ---------------------------------------------------------------------------
// Integration: convergence simulation
// ---------------------------------------------------------------------------

describe('convergence simulation', () => {
  it('converges within maxTrials on neurodual profile', () => {
    let state = createProfileAdaptiveState('neurodual', 1, 30);
    const trials: TrialRecord[] = [];

    while (!isConverged(state)) {
      const accuracy = Math.max(0.3, 1.0 - (state.level - 1) * 0.03);
      const correct = Math.random() < accuracy;
      trials.push({ level: state.level, correct, rt: 2000 + Math.random() * 3000 });
      state = adaptDifficulty(state, correct);
    }

    expect(state.trialCount).toBeLessThanOrEqual(30);
    const ceiling = getCeilingEstimate(state);
    expect(ceiling).toBeGreaterThanOrEqual(1);
    expect(ceiling).toBeLessThanOrEqual(30);

    const result = computeMeasureResult(state, trials);
    expect(result.ceilingLevel).toBe(ceiling);
    expect(result.totalTrials).toBe(state.trialCount);
  });
});
