import { describe, expect, it } from 'bun:test';
import {
  type StaircaseState,
  type UfovTrial,
  type UfovTrialResult,
  DURATION_LEVELS,
  advanceStaircase,
  getDurationMs,
  findClosestDurationIndex,
  generateTrials,
  evaluateResponse,
  normalizeThresholdToScore,
  computeBlockSummary,
  getSubtasksForVariant,
  getTrialsPerBlock,
} from './ufov';

// =============================================================================
// Staircase
// =============================================================================

describe('advanceStaircase', () => {
  it('does not move on first correct (streak = 0 → 1)', () => {
    const state: StaircaseState = { durationIndex: 5, correctStreak: 0 };
    const next = advanceStaircase(state, true);
    expect(next.durationIndex).toBe(5);
    expect(next.correctStreak).toBe(1);
  });

  it('steps down (harder) after 2 consecutive correct', () => {
    const state: StaircaseState = { durationIndex: 5, correctStreak: 1 };
    const next = advanceStaircase(state, true);
    expect(next.durationIndex).toBe(4);
    expect(next.correctStreak).toBe(0);
  });

  it('steps up (easier) on incorrect and resets streak', () => {
    const state: StaircaseState = { durationIndex: 5, correctStreak: 1 };
    const next = advanceStaircase(state, false);
    expect(next.durationIndex).toBe(6);
    expect(next.correctStreak).toBe(0);
  });

  it('clamps at minimum index (0) on step-down', () => {
    const state: StaircaseState = { durationIndex: 0, correctStreak: 1 };
    const next = advanceStaircase(state, true);
    expect(next.durationIndex).toBe(0);
  });

  it('clamps at maximum index on step-up', () => {
    const maxIdx = DURATION_LEVELS.length - 1;
    const state: StaircaseState = { durationIndex: maxIdx, correctStreak: 0 };
    const next = advanceStaircase(state, false);
    expect(next.durationIndex).toBe(maxIdx);
  });

  it('full staircase sequence: correct-correct-incorrect', () => {
    let state: StaircaseState = { durationIndex: 5, correctStreak: 0 };
    state = advanceStaircase(state, true); // streak=1, idx=5
    state = advanceStaircase(state, true); // streak=0, idx=4 (step down)
    state = advanceStaircase(state, false); // streak=0, idx=5 (step up)
    expect(state.durationIndex).toBe(5);
    expect(state.correctStreak).toBe(0);
  });
});

// =============================================================================
// getDurationMs / findClosestDurationIndex
// =============================================================================

describe('getDurationMs', () => {
  it('returns known values for valid indices', () => {
    expect(getDurationMs(0)).toBe(500);
    expect(getDurationMs(5)).toBe(160);
    expect(getDurationMs(13)).toBe(17);
  });

  it('clamps out-of-range indices', () => {
    expect(getDurationMs(-1)).toBe(500); // clamps to 0
    expect(getDurationMs(100)).toBe(17); // clamps to max
  });
});

describe('findClosestDurationIndex', () => {
  it('returns exact index for known durations', () => {
    expect(findClosestDurationIndex(500)).toBe(0);
    expect(findClosestDurationIndex(17)).toBe(DURATION_LEVELS.length - 1);
  });

  it('returns closest index for intermediate values', () => {
    // 450 is equidistant between 500 and 400 → picks 500 (index 0) since checked first
    expect(findClosestDurationIndex(450)).toBe(0);
    // 440 is closer to 400 (index 1)
    expect(findClosestDurationIndex(440)).toBe(1);
    // 280 is closer to 250 (index 3) than 320 (index 2)
    expect(findClosestDurationIndex(280)).toBe(3);
  });
});

// =============================================================================
// generateTrials
// =============================================================================

describe('generateTrials', () => {
  it('generates the requested number of trials', () => {
    const trials = generateTrials('central', 12, 250);
    expect(trials).toHaveLength(12);
  });

  it('central subtask has null targetPosition', () => {
    const trials = generateTrials('central', 10, 250);
    for (const trial of trials) {
      expect(trial.targetPosition).toBeNull();
      expect(trial.distractorPositions).toEqual([]);
    }
  });

  it('divided subtask has non-null targetPosition and no distractors', () => {
    const trials = generateTrials('divided', 10, 250);
    for (const trial of trials) {
      expect(trial.targetPosition).not.toBeNull();
      expect(trial.targetPosition).toBeGreaterThanOrEqual(0);
      expect(trial.targetPosition).toBeLessThan(8);
      expect(trial.distractorPositions).toEqual([]);
    }
  });

  it('selective subtask has distractors that exclude target position', () => {
    const trials = generateTrials('selective', 20, 250, 4);
    for (const trial of trials) {
      expect(trial.targetPosition).not.toBeNull();
      expect(trial.distractorPositions.length).toBeGreaterThan(0);
      expect(trial.distractorPositions).not.toContain(trial.targetPosition);
    }
  });

  it('all trials have both car and truck vehicles', () => {
    const trials = generateTrials('central', 100, 250);
    const cars = trials.filter((t) => t.vehicle === 'car');
    const trucks = trials.filter((t) => t.vehicle === 'truck');
    expect(cars.length).toBeGreaterThan(0);
    expect(trucks.length).toBeGreaterThan(0);
  });

  it('display duration is set to the provided value', () => {
    const trials = generateTrials('central', 5, 320);
    for (const trial of trials) {
      expect(trial.displayMs).toBe(320);
    }
  });
});

// =============================================================================
// evaluateResponse
// =============================================================================

describe('evaluateResponse', () => {
  it('central subtask: correct vehicle → correct', () => {
    const trial: UfovTrial = {
      subtask: 'central',
      vehicle: 'car',
      targetPosition: null,
      distractorPositions: [],
      displayMs: 250,
    };
    const result = evaluateResponse(trial, 'car', null);
    expect(result.vehicleCorrect).toBe(true);
    expect(result.correct).toBe(true);
  });

  it('central subtask: wrong vehicle → incorrect', () => {
    const trial: UfovTrial = {
      subtask: 'central',
      vehicle: 'car',
      targetPosition: null,
      distractorPositions: [],
      displayMs: 250,
    };
    const result = evaluateResponse(trial, 'truck', null);
    expect(result.vehicleCorrect).toBe(false);
    expect(result.correct).toBe(false);
  });

  it('divided subtask: both correct → correct', () => {
    const trial: UfovTrial = {
      subtask: 'divided',
      vehicle: 'truck',
      targetPosition: 3,
      distractorPositions: [],
      displayMs: 200,
    };
    const result = evaluateResponse(trial, 'truck', 3);
    expect(result.vehicleCorrect).toBe(true);
    expect(result.positionCorrect).toBe(true);
    expect(result.correct).toBe(true);
  });

  it('divided subtask: vehicle correct but position wrong → incorrect', () => {
    const trial: UfovTrial = {
      subtask: 'divided',
      vehicle: 'truck',
      targetPosition: 3,
      distractorPositions: [],
      displayMs: 200,
    };
    const result = evaluateResponse(trial, 'truck', 5);
    expect(result.vehicleCorrect).toBe(true);
    expect(result.positionCorrect).toBe(false);
    expect(result.correct).toBe(false);
  });

  it('selective subtask: vehicle wrong → incorrect regardless of position', () => {
    const trial: UfovTrial = {
      subtask: 'selective',
      vehicle: 'car',
      targetPosition: 7,
      distractorPositions: [1, 3, 5],
      displayMs: 120,
    };
    const result = evaluateResponse(trial, 'truck', 7);
    expect(result.vehicleCorrect).toBe(false);
    expect(result.positionCorrect).toBe(true);
    expect(result.correct).toBe(false);
  });

  it('null vehicle response → incorrect', () => {
    const trial: UfovTrial = {
      subtask: 'central',
      vehicle: 'car',
      targetPosition: null,
      distractorPositions: [],
      displayMs: 250,
    };
    const result = evaluateResponse(trial, null, null);
    expect(result.vehicleCorrect).toBe(false);
    expect(result.correct).toBe(false);
  });
});

// =============================================================================
// normalizeThresholdToScore
// =============================================================================

describe('normalizeThresholdToScore', () => {
  it('500ms → 0 (worst)', () => {
    expect(normalizeThresholdToScore(500)).toBe(0);
  });

  it('17ms → 100 (best)', () => {
    expect(normalizeThresholdToScore(17)).toBe(100);
  });

  it('midpoint gives ~50', () => {
    const mid = (500 + 17) / 2; // ~258.5
    const score = normalizeThresholdToScore(mid);
    expect(score).toBeGreaterThan(45);
    expect(score).toBeLessThan(55);
  });

  it('clamps below 0 and above 100', () => {
    expect(normalizeThresholdToScore(600)).toBe(0);
    expect(normalizeThresholdToScore(0)).toBe(100);
  });
});

// =============================================================================
// computeBlockSummary
// =============================================================================

describe('computeBlockSummary', () => {
  function makeCentralResult(vehicleCorrect: boolean, displayMs: number): UfovTrialResult {
    const trial: UfovTrial = {
      subtask: 'central',
      vehicle: 'car',
      targetPosition: null,
      distractorPositions: [],
      displayMs,
    };
    return {
      trial,
      vehicleResponse: vehicleCorrect ? 'car' : 'truck',
      positionResponse: null,
      vehicleCorrect,
      positionCorrect: true,
      correct: vehicleCorrect,
    };
  }

  it('computes accuracy for a central block', () => {
    const results = [
      makeCentralResult(true, 250),
      makeCentralResult(true, 200),
      makeCentralResult(false, 200),
      makeCentralResult(true, 160),
    ];
    const summary = computeBlockSummary('central', results, 3);
    expect(summary.accuracy).toBe(75);
    expect(summary.centralAccuracy).toBe(75);
    expect(summary.positionAccuracy).toBeNull();
  });

  it('computes position accuracy for divided block', () => {
    const trial: UfovTrial = {
      subtask: 'divided',
      vehicle: 'car',
      targetPosition: 2,
      distractorPositions: [],
      displayMs: 200,
    };
    const results: UfovTrialResult[] = [
      {
        trial,
        vehicleResponse: 'car',
        positionResponse: 2,
        vehicleCorrect: true,
        positionCorrect: true,
        correct: true,
      },
      {
        trial,
        vehicleResponse: 'car',
        positionResponse: 5,
        vehicleCorrect: true,
        positionCorrect: false,
        correct: false,
      },
    ];
    const summary = computeBlockSummary('divided', results, 4);
    expect(summary.positionAccuracy).toBe(50);
  });

  it('threshold comes from final duration index', () => {
    const results = [makeCentralResult(true, 250)];
    const summary = computeBlockSummary('central', results, 0);
    expect(summary.thresholdMs).toBe(500); // index 0 = 500ms
  });

  it('minDisplayMs is the minimum across all trials', () => {
    const results = [
      makeCentralResult(true, 320),
      makeCentralResult(true, 200),
      makeCentralResult(true, 250),
    ];
    const summary = computeBlockSummary('central', results, 4);
    expect(summary.minDisplayMs).toBe(200);
  });
});

// =============================================================================
// Variant helpers
// =============================================================================

describe('getSubtasksForVariant', () => {
  it('full → all three subtasks', () => {
    expect(getSubtasksForVariant('full')).toEqual(['central', 'divided', 'selective']);
  });

  it('single variant → single subtask', () => {
    expect(getSubtasksForVariant('central')).toEqual(['central']);
    expect(getSubtasksForVariant('divided')).toEqual(['divided']);
    expect(getSubtasksForVariant('selective')).toEqual(['selective']);
  });
});

describe('getTrialsPerBlock', () => {
  it('full variant: divides total by 3', () => {
    expect(getTrialsPerBlock('full', 36)).toBe(12);
  });

  it('single variant: returns total (clamped)', () => {
    expect(getTrialsPerBlock('central', 24)).toBe(24);
  });

  it('clamps minimum at 12 for single / 6 for full', () => {
    expect(getTrialsPerBlock('central', 2)).toBe(12);
    expect(getTrialsPerBlock('full', 6)).toBe(6);
  });

  it('clamps maximum at 36 for single / 24 for full', () => {
    expect(getTrialsPerBlock('central', 100)).toBe(36);
    expect(getTrialsPerBlock('full', 100)).toBe(24);
  });
});
