import { describe, it, expect } from 'bun:test';
import {
  type TrialResult,
  generateTrialSequence,
  classifyOutcome,
  isCorrect,
  adaptSsd,
  computeSSRT,
  computeSummary,
  GO_PROBABILITY,
  INITIAL_SSD_MS,
  SSD_MIN_MS,
  SSD_MAX_MS,
} from './stop-signal';

// =============================================================================
// Helpers
// =============================================================================

function makeResult(overrides: Partial<TrialResult> & Pick<TrialResult, 'trialType'>): TrialResult {
  return {
    trialIndex: 0,
    direction: 'right',
    responded: false,
    responseDirection: null,
    correct: false,
    responseTimeMs: 0,
    ssd: null,
    ...overrides,
  };
}

// =============================================================================
// 1. Trial Generation
// =============================================================================

describe('Stop-Signal — Trial generation', () => {
  it('generates the correct number of trials', () => {
    const trials = generateTrialSequence(32);
    expect(trials).toHaveLength(32);
  });

  it('has ~75% go and ~25% stop trials', () => {
    const trials = generateTrialSequence(32);
    const goCount = trials.filter((t) => t.trialType === 'go').length;
    const stopCount = trials.filter((t) => t.trialType === 'stop').length;
    expect(goCount).toBe(Math.round(32 * GO_PROBABILITY)); // 24
    expect(stopCount).toBe(32 - Math.round(32 * GO_PROBABILITY)); // 8
  });

  it('has correct ratio for different trial counts', () => {
    for (const count of [10, 20, 40, 60]) {
      const trials = generateTrialSequence(count);
      const goCount = trials.filter((t) => t.trialType === 'go').length;
      expect(goCount).toBe(Math.round(count * GO_PROBABILITY));
    }
  });

  it('produces both left and right directions', () => {
    // With 100 trials, extremely unlikely to get all one direction
    const trials = generateTrialSequence(100);
    const lefts = trials.filter((t) => t.direction === 'left').length;
    const rights = trials.filter((t) => t.direction === 'right').length;
    expect(lefts).toBeGreaterThan(0);
    expect(rights).toBeGreaterThan(0);
  });

  it('starts with GO-only lead-in before stop trials appear', () => {
    const trials = generateTrialSequence(32);
    expect(trials.slice(0, 8).every((t) => t.trialType === 'go')).toBe(true);
  });

  it('avoids consecutive stop trials (max stop streak = 1)', () => {
    const trials = generateTrialSequence(120);
    let streak = 0;
    let maxStreak = 0;
    for (const trial of trials) {
      if (trial.trialType === 'stop') {
        streak += 1;
        maxStreak = Math.max(maxStreak, streak);
      } else {
        streak = 0;
      }
    }
    expect(maxStreak).toBeLessThanOrEqual(1);
  });

  it('uses deterministic rng when provided', () => {
    let seed = 0.42;
    const rng = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    const a = generateTrialSequence(16, rng);

    // Reset seed
    seed = 0.42;
    const b = generateTrialSequence(16, rng);
    expect(a).toEqual(b);
  });

  it('balances directions within each trial type', () => {
    const trials = generateTrialSequence(96);
    const goTrials = trials.filter((t) => t.trialType === 'go');
    const stopTrials = trials.filter((t) => t.trialType === 'stop');
    const goLeft = goTrials.filter((t) => t.direction === 'left').length;
    const goRight = goTrials.filter((t) => t.direction === 'right').length;
    const stopLeft = stopTrials.filter((t) => t.direction === 'left').length;
    const stopRight = stopTrials.filter((t) => t.direction === 'right').length;

    expect(Math.abs(goLeft - goRight)).toBeLessThanOrEqual(1);
    expect(Math.abs(stopLeft - stopRight)).toBeLessThanOrEqual(1);
  });

  it('supports tiny all-go sessions when stop count rounds to 0', () => {
    const trials = generateTrialSequence(1);
    expect(trials).toHaveLength(1);
    expect(trials[0]!.trialType).toBe('go');
  });

  it('uses fallback allocator when lead-in consumes most go trials', () => {
    const trials = generateTrialSequence(12, () => 1);
    expect(trials).toHaveLength(12);

    const types = trials.map((t) => t.trialType);
    expect(types.slice(0, 9)).toEqual(['go', 'go', 'go', 'go', 'go', 'go', 'go', 'go', 'go']);
    expect(types.slice(9)).toEqual(['stop', 'stop', 'stop']);

    const goCount = trials.filter((t) => t.trialType === 'go').length;
    const stopCount = trials.filter((t) => t.trialType === 'stop').length;
    expect(goCount).toBe(Math.round(12 * GO_PROBABILITY));
    expect(stopCount).toBe(12 - Math.round(12 * GO_PROBABILITY));
  });
});

// =============================================================================
// 2. Outcome Classification
// =============================================================================

describe('Stop-Signal — Outcome classification', () => {
  it('go trial + correct response = correct_go', () => {
    expect(classifyOutcome('go', true, 'right', 'right')).toBe('correct_go');
  });

  it('go trial + wrong direction = incorrect_go', () => {
    expect(classifyOutcome('go', true, 'left', 'right')).toBe('incorrect_go');
  });

  it('go trial + no response = miss', () => {
    expect(classifyOutcome('go', false, null, 'right')).toBe('miss');
  });

  it('stop trial + no response = successful_stop', () => {
    expect(classifyOutcome('stop', false, null, 'left')).toBe('successful_stop');
  });

  it('stop trial + responded = failed_stop (regardless of direction)', () => {
    expect(classifyOutcome('stop', true, 'left', 'left')).toBe('failed_stop');
    expect(classifyOutcome('stop', true, 'right', 'left')).toBe('failed_stop');
  });

  it('isCorrect returns true only for correct_go and successful_stop', () => {
    expect(isCorrect('correct_go')).toBe(true);
    expect(isCorrect('successful_stop')).toBe(true);
    expect(isCorrect('incorrect_go')).toBe(false);
    expect(isCorrect('miss')).toBe(false);
    expect(isCorrect('failed_stop')).toBe(false);
  });
});

// =============================================================================
// 3. SSD Staircase Adaptation
// =============================================================================

describe('Stop-Signal — SSD staircase', () => {
  it('starts at 250ms (INITIAL_SSD_MS)', () => {
    expect(INITIAL_SSD_MS).toBe(250);
  });

  it('increases by 50ms on successful stop', () => {
    expect(adaptSsd(250, true)).toBe(300);
  });

  it('decreases by 50ms on failed stop', () => {
    expect(adaptSsd(250, false)).toBe(200);
  });

  it('respects upper bound (900ms)', () => {
    expect(adaptSsd(SSD_MAX_MS, true)).toBe(SSD_MAX_MS);
    expect(adaptSsd(880, true)).toBe(SSD_MAX_MS); // 880 + 50 = 930 -> clamped to 900
  });

  it('respects lower bound (50ms)', () => {
    expect(adaptSsd(SSD_MIN_MS, false)).toBe(SSD_MIN_MS);
    expect(adaptSsd(80, false)).toBe(SSD_MIN_MS); // 80 - 50 = 30 -> clamped to 50
  });

  it('walks up correctly over multiple successful stops', () => {
    let ssd = INITIAL_SSD_MS; // 250
    ssd = adaptSsd(ssd, true); // 300
    ssd = adaptSsd(ssd, true); // 350
    ssd = adaptSsd(ssd, true); // 400
    expect(ssd).toBe(400);
  });

  it('walks down correctly over multiple failed stops', () => {
    let ssd = INITIAL_SSD_MS; // 250
    ssd = adaptSsd(ssd, false); // 200
    ssd = adaptSsd(ssd, false); // 150
    ssd = adaptSsd(ssd, false); // 100
    expect(ssd).toBe(100);
  });

  it('converges on alternating success/failure', () => {
    let ssd = INITIAL_SSD_MS;
    ssd = adaptSsd(ssd, true); // 300
    ssd = adaptSsd(ssd, false); // 250
    expect(ssd).toBe(INITIAL_SSD_MS);
  });

  it('accepts custom step and bounds', () => {
    expect(adaptSsd(200, true, 100, 50, 500)).toBe(300);
    expect(adaptSsd(200, false, 100, 150, 500)).toBe(150);
  });
});

// =============================================================================
// 4. SSRT Calculation
// =============================================================================

describe('Stop-Signal — SSRT calculation', () => {
  it('computes SSRT = meanGoRT - meanSSD with known values', () => {
    const results: TrialResult[] = [
      // 3 correct go trials with RTs: 400, 500, 600 -> mean = 500
      makeResult({
        trialType: 'go',
        responded: true,
        responseDirection: 'right',
        correct: true,
        responseTimeMs: 400,
      }),
      makeResult({
        trialType: 'go',
        responded: true,
        responseDirection: 'left',
        correct: true,
        responseTimeMs: 500,
        direction: 'left',
      }),
      makeResult({
        trialType: 'go',
        responded: true,
        responseDirection: 'right',
        correct: true,
        responseTimeMs: 600,
      }),
      // 2 successful stops with SSDs: 200, 300 -> mean = 250
      makeResult({ trialType: 'stop', responded: false, correct: true, ssd: 200 }),
      makeResult({ trialType: 'stop', responded: false, correct: true, ssd: 300 }),
    ];
    // SSRT = 500 - 250 = 250
    expect(computeSSRT(results)).toBe(250);
  });

  it('returns 0 when there are no successful stops', () => {
    const results: TrialResult[] = [
      makeResult({ trialType: 'go', responded: true, correct: true, responseTimeMs: 400 }),
      makeResult({ trialType: 'stop', responded: true, correct: false, ssd: 200 }),
    ];
    expect(computeSSRT(results)).toBe(0);
  });

  it('returns 0 when there are no correct go trials', () => {
    const results: TrialResult[] = [
      makeResult({ trialType: 'go', responded: false, correct: false, responseTimeMs: 1000 }),
      makeResult({ trialType: 'stop', responded: false, correct: true, ssd: 200 }),
    ];
    expect(computeSSRT(results)).toBe(0);
  });

  it('returns 0 when SSRT would be negative (meanSSD > meanGoRT)', () => {
    const results: TrialResult[] = [
      makeResult({ trialType: 'go', responded: true, correct: true, responseTimeMs: 200 }),
      makeResult({ trialType: 'stop', responded: false, correct: true, ssd: 800 }),
    ];
    // 200 - 800 = -600 -> clamped to 0
    expect(computeSSRT(results)).toBe(0);
  });

  it('returns 0 with empty results', () => {
    expect(computeSSRT([])).toBe(0);
  });

  it('only uses correct go trials for mean RT', () => {
    const results: TrialResult[] = [
      // Correct go: RT 400
      makeResult({
        trialType: 'go',
        responded: true,
        responseDirection: 'right',
        correct: true,
        responseTimeMs: 400,
      }),
      // Incorrect go (wrong direction): RT 100 — should be excluded
      makeResult({
        trialType: 'go',
        responded: true,
        responseDirection: 'left',
        correct: false,
        responseTimeMs: 100,
      }),
      // Successful stop: SSD 200
      makeResult({ trialType: 'stop', responded: false, correct: true, ssd: 200 }),
    ];
    // SSRT = 400 - 200 = 200
    expect(computeSSRT(results)).toBe(200);
  });
});

// =============================================================================
// 5. Summary Computation
// =============================================================================

describe('Stop-Signal — Summary', () => {
  it('computes accuracy correctly', () => {
    const results: TrialResult[] = [
      makeResult({ trialType: 'go', responded: true, correct: true, responseTimeMs: 400 }),
      makeResult({ trialType: 'go', responded: true, correct: true, responseTimeMs: 500 }),
      makeResult({ trialType: 'go', responded: false, correct: false, responseTimeMs: 1000 }),
      makeResult({ trialType: 'stop', responded: false, correct: true, ssd: 250 }),
    ];
    const summary = computeSummary(results);
    expect(summary.accuracy).toBe(75); // 3/4 = 75%
  });

  it('computes go and stop accuracy separately', () => {
    const results: TrialResult[] = [
      makeResult({ trialType: 'go', responded: true, correct: true, responseTimeMs: 400 }),
      makeResult({ trialType: 'go', responded: false, correct: false, responseTimeMs: 1000 }),
      makeResult({ trialType: 'stop', responded: false, correct: true, ssd: 250 }),
      makeResult({ trialType: 'stop', responded: true, correct: false, ssd: 200 }),
    ];
    const summary = computeSummary(results);
    expect(summary.goAccuracy).toBe(50); // 1/2
    expect(summary.stopAccuracy).toBe(50); // 1/2
  });

  it('computes mean go RT from correct go trials only', () => {
    const results: TrialResult[] = [
      makeResult({ trialType: 'go', responded: true, correct: true, responseTimeMs: 300 }),
      makeResult({ trialType: 'go', responded: true, correct: true, responseTimeMs: 500 }),
      makeResult({ trialType: 'go', responded: false, correct: false, responseTimeMs: 1000 }),
    ];
    const summary = computeSummary(results);
    expect(summary.meanGoRt).toBe(400); // (300+500)/2
  });

  it('handles empty results', () => {
    const summary = computeSummary([]);
    expect(summary.totalTrials).toBe(0);
    expect(summary.accuracy).toBe(0);
    expect(summary.ssrt).toBe(0);
    expect(summary.meanGoRt).toBe(0);
    expect(summary.meanSsd).toBe(0);
  });

  it('handles all go trials (no stops)', () => {
    const results: TrialResult[] = [
      makeResult({ trialType: 'go', responded: true, correct: true, responseTimeMs: 400 }),
      makeResult({ trialType: 'go', responded: true, correct: true, responseTimeMs: 600 }),
    ];
    const summary = computeSummary(results);
    expect(summary.goTrials).toBe(2);
    expect(summary.stopTrials).toBe(0);
    expect(summary.stopAccuracy).toBe(0);
    expect(summary.ssrt).toBe(0); // no stops => can't compute SSRT
  });

  it('handles all stop trials (no go)', () => {
    const results: TrialResult[] = [
      makeResult({ trialType: 'stop', responded: false, correct: true, ssd: 250 }),
      makeResult({ trialType: 'stop', responded: false, correct: true, ssd: 300 }),
    ];
    const summary = computeSummary(results);
    expect(summary.goTrials).toBe(0);
    expect(summary.stopTrials).toBe(2);
    expect(summary.ssrt).toBe(0); // no go => can't compute SSRT
  });
});
