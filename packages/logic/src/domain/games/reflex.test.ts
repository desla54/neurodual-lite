import { describe, it, expect } from 'bun:test';
import {
  type TrialResult,
  type Outcome,
  generateTrials,
  getOutcome,
  getStimulusDuration,
  computeDPrime,
  computeSummary,
  TARGET_PROBABILITY,
  INITIAL_STIMULUS_MS,
  MIN_STIMULUS_MS,
  TOTAL_CELLS,
} from './reflex';

// =============================================================================
// 1. Trial generation — 70% target, 30% lure ratio
// =============================================================================

describe('Reflex — Trial generation', () => {
  it('generates the correct number of trials', () => {
    const trials = generateTrials(30);
    expect(trials).toHaveLength(30);
  });

  it('has 70% targets and 30% lures (exact rounding)', () => {
    const trials = generateTrials(30);
    const targets = trials.filter((t) => t.stimulusType === 'target').length;
    const lures = trials.filter((t) => t.stimulusType === 'lure').length;
    expect(targets).toBe(Math.round(30 * TARGET_PROBABILITY)); // 21
    expect(lures).toBe(30 - Math.round(30 * TARGET_PROBABILITY)); // 9
  });

  it('has correct ratio for different trial counts', () => {
    for (const count of [10, 20, 40, 50]) {
      const trials = generateTrials(count);
      const targets = trials.filter((t) => t.stimulusType === 'target').length;
      expect(targets).toBe(Math.round(count * TARGET_PROBABILITY));
    }
  });

  it('grid positions are within valid range 0..8', () => {
    const trials = generateTrials(100);
    for (const trial of trials) {
      expect(trial.gridPosition).toBeGreaterThanOrEqual(0);
      expect(trial.gridPosition).toBeLessThan(TOTAL_CELLS);
    }
  });

  it('trials are shuffled (not all targets first, then all lures)', () => {
    // Run multiple times to avoid false positive from rare perfect shuffle
    let foundMixed = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      const trials = generateTrials(30);
      // Check first 10 trials: should contain a mix
      const first10Types = trials.slice(0, 10).map((t) => t.stimulusType);
      const hasTarget = first10Types.includes('target');
      const hasLure = first10Types.includes('lure');
      if (hasTarget && hasLure) {
        foundMixed = true;
        break;
      }
    }
    expect(foundMixed).toBe(true);
  });
});

// =============================================================================
// 2. Hit / Miss / FA / CR classification
// =============================================================================

describe('Reflex — Outcome classification (SDT)', () => {
  it('target + responded = hit', () => {
    expect(getOutcome('target', true)).toBe('hit');
  });

  it('target + not responded = miss', () => {
    expect(getOutcome('target', false)).toBe('miss');
  });

  it('lure + responded = false_alarm', () => {
    expect(getOutcome('lure', true)).toBe('false_alarm');
  });

  it('lure + not responded = correct_rejection', () => {
    expect(getOutcome('lure', false)).toBe('correct_rejection');
  });

  it('hit and correct_rejection are the two correct outcomes', () => {
    const correctOutcomes: Outcome[] = ['hit', 'correct_rejection'];
    expect(correctOutcomes).toContain(getOutcome('target', true));
    expect(correctOutcomes).toContain(getOutcome('lure', false));
  });

  it('miss and false_alarm are the two incorrect outcomes', () => {
    const incorrectOutcomes: Outcome[] = ['miss', 'false_alarm'];
    expect(incorrectOutcomes).toContain(getOutcome('target', false));
    expect(incorrectOutcomes).toContain(getOutcome('lure', true));
  });
});

// =============================================================================
// 3. Response window — stimulus duration adapts
// =============================================================================

describe('Reflex — Stimulus duration adaptation', () => {
  it('returns INITIAL_STIMULUS_MS when fewer than 3 trials responded', () => {
    expect(getStimulusDuration(0, 0)).toBe(INITIAL_STIMULUS_MS);
    expect(getStimulusDuration(1, 1)).toBe(INITIAL_STIMULUS_MS);
    expect(getStimulusDuration(2, 2)).toBe(INITIAL_STIMULUS_MS);
  });

  it('returns INITIAL_STIMULUS_MS at 50% accuracy', () => {
    // 50% accuracy => t=0 => full duration
    expect(getStimulusDuration(5, 10)).toBe(INITIAL_STIMULUS_MS);
  });

  it('returns MIN_STIMULUS_MS at 100% accuracy', () => {
    // 100% accuracy => t=1 => minimum duration
    expect(getStimulusDuration(10, 10)).toBe(MIN_STIMULUS_MS);
  });

  it('interpolates between INITIAL and MIN for intermediate accuracy', () => {
    // 75% accuracy => t = (0.75-0.5)*2 = 0.5
    const duration = getStimulusDuration(15, 20);
    const expected = Math.round(
      INITIAL_STIMULUS_MS - 0.5 * (INITIAL_STIMULUS_MS - MIN_STIMULUS_MS),
    );
    expect(duration).toBe(expected);
  });

  it('clamps at INITIAL_STIMULUS_MS for accuracy below 50%', () => {
    // 30% accuracy => t clamped to 0
    expect(getStimulusDuration(3, 10)).toBe(INITIAL_STIMULUS_MS);
  });

  it('is monotonically decreasing with increasing accuracy', () => {
    let prev = getStimulusDuration(3, 10); // 30% acc
    for (let hits = 4; hits <= 10; hits++) {
      const curr = getStimulusDuration(hits, 10);
      expect(curr).toBeLessThanOrEqual(prev);
      prev = curr;
    }
  });
});

// =============================================================================
// 4. d-prime calculation
// =============================================================================

describe('Reflex — d-prime calculation', () => {
  it('returns 0 when no signal trials', () => {
    expect(computeDPrime(0, 0, 5, 5)).toBe(0);
  });

  it('returns 0 when no noise trials', () => {
    expect(computeDPrime(5, 5, 0, 0)).toBe(0);
  });

  it('returns positive d-prime for good performance', () => {
    // High hit rate, low FA rate
    const dp = computeDPrime(18, 2, 1, 9);
    expect(dp).toBeGreaterThan(1);
  });

  it('returns near-zero d-prime for random performance', () => {
    // Equal hit rate and FA rate
    const dp = computeDPrime(5, 5, 5, 5);
    expect(Math.abs(dp)).toBeLessThan(0.5);
  });

  it('returns negative d-prime for worse-than-chance performance', () => {
    // Low hit rate, high FA rate
    const dp = computeDPrime(1, 9, 8, 2);
    expect(dp).toBeLessThan(0);
  });

  it('handles perfect performance with log-linear correction', () => {
    // 100% hits, 0% FA — should not be Infinity
    const dp = computeDPrime(20, 0, 0, 10);
    expect(Number.isFinite(dp)).toBe(true);
    expect(dp).toBeGreaterThan(2);
  });

  it('handles zero performance with log-linear correction', () => {
    // 0% hits, 100% FA — should not be -Infinity
    const dp = computeDPrime(0, 20, 10, 0);
    expect(Number.isFinite(dp)).toBe(true);
    expect(dp).toBeLessThan(-2);
  });
});

// =============================================================================
// 5. Progressive difficulty
// =============================================================================

describe('Reflex — Progressive difficulty', () => {
  it('stimulus gets shorter as accuracy improves during a session', () => {
    // Simulate improving performance
    const dur1 = getStimulusDuration(0, 0); // start
    const dur2 = getStimulusDuration(5, 8); // 62.5% accuracy
    const dur3 = getStimulusDuration(8, 9); // 88.9% accuracy
    const dur4 = getStimulusDuration(10, 10); // 100% accuracy

    expect(dur1).toBeGreaterThanOrEqual(dur2);
    expect(dur2).toBeGreaterThanOrEqual(dur3);
    expect(dur3).toBeGreaterThanOrEqual(dur4);
    expect(dur4).toBe(MIN_STIMULUS_MS);
  });
});

// =============================================================================
// 6. Scoring — RT-based for hits, penalty for false alarms
// =============================================================================

describe('Reflex — Scoring (computeSummary)', () => {
  function makeResult(
    stimulusType: 'target' | 'lure',
    responded: boolean,
    rt: number | null,
  ): TrialResult {
    const outcome = getOutcome(stimulusType, responded);
    return {
      trial: { stimulusType, gridPosition: 0 },
      responded,
      rt,
      outcome,
    };
  }

  it('computes accuracy correctly', () => {
    const results: TrialResult[] = [
      makeResult('target', true, 300), // hit
      makeResult('target', false, null), // miss
      makeResult('lure', false, null), // CR
      makeResult('lure', true, 200), // FA
    ];
    const summary = computeSummary(results);
    // correct = hit(1) + CR(1) = 2 out of 4
    expect(summary.accuracy).toBeCloseTo(0.5, 2);
    expect(summary.hits).toBe(1);
    expect(summary.misses).toBe(1);
    expect(summary.falseAlarms).toBe(1);
    expect(summary.correctRejections).toBe(1);
  });

  it('avgRT only considers hits', () => {
    const results: TrialResult[] = [
      makeResult('target', true, 250), // hit
      makeResult('target', true, 350), // hit
      makeResult('lure', true, 200), // FA (not counted)
      makeResult('target', false, null), // miss (not counted)
    ];
    const summary = computeSummary(results);
    expect(summary.avgRT).toBeCloseTo(300, 0);
  });

  it('handles all-miss session', () => {
    const results: TrialResult[] = [
      makeResult('target', false, null),
      makeResult('target', false, null),
      makeResult('target', false, null),
    ];
    const summary = computeSummary(results);
    expect(summary.hits).toBe(0);
    expect(summary.misses).toBe(3);
    expect(summary.accuracy).toBeCloseTo(0, 2);
    expect(summary.avgRT).toBe(0);
  });

  it('computes d-prime in summary', () => {
    const results: TrialResult[] = [
      makeResult('target', true, 250),
      makeResult('target', true, 300),
      makeResult('target', true, 350),
      makeResult('target', false, null),
      makeResult('lure', false, null),
      makeResult('lure', false, null),
      makeResult('lure', true, 200),
    ];
    const summary = computeSummary(results);
    expect(summary.dPrime).toBeGreaterThan(0);
  });

  it('handles empty results', () => {
    const summary = computeSummary([]);
    expect(summary.totalTrials).toBe(0);
    expect(summary.accuracy).toBe(0);
    expect(summary.avgRT).toBe(0);
    expect(summary.dPrime).toBe(0);
  });
});

// =============================================================================
// 7. Edge cases
// =============================================================================

describe('Reflex — Edge cases', () => {
  it('very fast responses (< 150ms) are still recorded', () => {
    // The logic layer does not reject anticipatory responses; that is a UI concern
    const result: TrialResult = {
      trial: { stimulusType: 'target', gridPosition: 4 },
      responded: true,
      rt: 50, // very fast
      outcome: 'hit',
    };
    expect(result.rt).toBe(50);
    expect(result.outcome).toBe('hit');
  });

  it('perfect session has d-prime > 0', () => {
    const results: TrialResult[] = [];
    for (let i = 0; i < 21; i++) {
      results.push({
        trial: { stimulusType: 'target', gridPosition: i % 9 },
        responded: true,
        rt: 250,
        outcome: 'hit',
      });
    }
    for (let i = 0; i < 9; i++) {
      results.push({
        trial: { stimulusType: 'lure', gridPosition: i },
        responded: false,
        rt: null,
        outcome: 'correct_rejection',
      });
    }
    const summary = computeSummary(results);
    expect(summary.accuracy).toBe(1);
    expect(summary.dPrime).toBeGreaterThan(2);
  });

  it('worst-case session (all wrong) has negative d-prime', () => {
    const results: TrialResult[] = [];
    for (let i = 0; i < 10; i++) {
      results.push({
        trial: { stimulusType: 'target', gridPosition: i % 9 },
        responded: false,
        rt: null,
        outcome: 'miss',
      });
    }
    for (let i = 0; i < 5; i++) {
      results.push({
        trial: { stimulusType: 'lure', gridPosition: i },
        responded: true,
        rt: 200,
        outcome: 'false_alarm',
      });
    }
    const summary = computeSummary(results);
    expect(summary.accuracy).toBe(0);
    expect(summary.dPrime).toBeLessThan(-1);
  });

  it('single trial session works', () => {
    const results: TrialResult[] = [
      {
        trial: { stimulusType: 'target', gridPosition: 0 },
        responded: true,
        rt: 300,
        outcome: 'hit',
      },
    ];
    const summary = computeSummary(results);
    expect(summary.totalTrials).toBe(1);
    expect(summary.hits).toBe(1);
    expect(summary.accuracy).toBe(1);
  });
});
