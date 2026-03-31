import { describe, expect, it } from 'bun:test';
import {
  INITIAL_DISPLAY_MS,
  MIN_DISPLAY_MS,
  STEP_MS,
  computeSummary,
  createStaircase,
  generateTrial,
  updateStaircase,
  type InspectionTrialResult,
} from './inspection-time';

// =============================================================================
// Staircase
// =============================================================================

describe('createStaircase', () => {
  it('starts at the given display time', () => {
    const s = createStaircase(200);
    expect(s.displayMs).toBe(200);
    expect(s.consecutiveCorrect).toBe(0);
  });

  it('defaults to INITIAL_DISPLAY_MS', () => {
    const s = createStaircase();
    expect(s.displayMs).toBe(INITIAL_DISPLAY_MS);
  });
});

describe('updateStaircase', () => {
  it('increments consecutive correct on first correct', () => {
    const s = updateStaircase(createStaircase(200), true);
    expect(s.displayMs).toBe(200);
    expect(s.consecutiveCorrect).toBe(1);
  });

  it('decreases display time after 2 consecutive correct (2-down rule)', () => {
    let s = createStaircase(200);
    s = updateStaircase(s, true); // consecutive = 1
    s = updateStaircase(s, true); // consecutive = 2 → step down
    expect(s.displayMs).toBe(200 - STEP_MS);
    expect(s.consecutiveCorrect).toBe(0);
  });

  it('increases display time after 1 wrong (1-up rule)', () => {
    const s = updateStaircase(createStaircase(200), false);
    expect(s.displayMs).toBe(200 + STEP_MS);
    expect(s.consecutiveCorrect).toBe(0);
  });

  it('resets consecutive correct on wrong', () => {
    let s = createStaircase(200);
    s = updateStaircase(s, true); // consecutive = 1
    s = updateStaircase(s, false); // wrong → reset
    expect(s.consecutiveCorrect).toBe(0);
  });

  it('does not go below MIN_DISPLAY_MS', () => {
    const s = updateStaircase({ displayMs: MIN_DISPLAY_MS, consecutiveCorrect: 1 }, true);
    expect(s.displayMs).toBe(MIN_DISPLAY_MS);
  });

  it('does not go above max', () => {
    const maxMs = INITIAL_DISPLAY_MS * 2;
    const s = updateStaircase({ displayMs: maxMs, consecutiveCorrect: 0 }, false);
    expect(s.displayMs).toBe(maxMs);
  });

  it('converges towards threshold with mixed results', () => {
    let s = createStaircase(200);
    // Simulate: correct, correct, wrong pattern
    for (let i = 0; i < 10; i++) {
      s = updateStaircase(s, true);
      s = updateStaircase(s, true);
      s = updateStaircase(s, false);
    }
    // After cycling, display time should remain stable-ish (each cycle: -1 step then +1 step)
    // Effectively no net change after each 3-trial cycle
    expect(s.displayMs).toBe(200);
  });
});

// =============================================================================
// generateTrial
// =============================================================================

describe('generateTrial', () => {
  it('generates trial with correct display time', () => {
    const trial = generateTrial(150);
    expect(trial.displayMs).toBe(150);
    expect(['left', 'right']).toContain(trial.longerSide);
  });

  it('uses rng for side selection', () => {
    expect(generateTrial(100, () => 0.1).longerSide).toBe('left');
    expect(generateTrial(100, () => 0.9).longerSide).toBe('right');
  });
});

// =============================================================================
// computeSummary
// =============================================================================

describe('computeSummary', () => {
  const makeResult = (
    correct: boolean,
    displayMs: number,
    timedOut = false,
  ): InspectionTrialResult => ({
    trial: { longerSide: 'left', displayMs },
    response: correct ? 'left' : 'right',
    correct,
    displayMs,
    timedOut,
  });

  it('computes accuracy', () => {
    const results = [
      makeResult(true, 200),
      makeResult(true, 183),
      makeResult(false, 166),
      makeResult(true, 183),
    ];
    const s = computeSummary(results, 183, 30_000);
    expect(s.accuracy).toBe(75);
    expect(s.correctTrials).toBe(3);
    expect(s.totalTrials).toBe(4);
  });

  it('computes threshold from last N trials', () => {
    // 20 trials, last 10 all at 100ms → threshold = 100
    const results = [
      ...Array.from({ length: 10 }, () => makeResult(true, 200)),
      ...Array.from({ length: 10 }, () => makeResult(true, 100)),
    ];
    const s = computeSummary(results, 100, 30_000, 10);
    expect(s.thresholdMs).toBe(100);
  });

  it('computes minCorrectMs', () => {
    const results = [
      makeResult(true, 200),
      makeResult(true, 50),
      makeResult(false, 30), // wrong, should not count
      makeResult(true, 80),
    ];
    const s = computeSummary(results, 80, 30_000);
    expect(s.minCorrectMs).toBe(50);
  });

  it('handles all wrong results', () => {
    const results = [makeResult(false, 200), makeResult(false, 183)];
    const s = computeSummary(results, 200, 30_000);
    expect(s.accuracy).toBe(0);
    expect(s.minCorrectMs).toBe(0);
  });

  it('handles empty results', () => {
    const s = computeSummary([], 200, 30_000);
    expect(s.accuracy).toBe(0);
    expect(s.totalTrials).toBe(0);
    expect(s.thresholdMs).toBe(200); // falls back to finalDisplayMs
    expect(s.minCorrectMs).toBe(0);
  });

  it('preserves durationMs and finalDisplayMs', () => {
    const s = computeSummary([makeResult(true, 100)], 100, 42_000);
    expect(s.durationMs).toBe(42_000);
    expect(s.finalDisplayMs).toBe(100);
  });
});
