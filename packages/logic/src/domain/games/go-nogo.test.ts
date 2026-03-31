import { describe, it, expect } from 'bun:test';
import {
  type GoNoGoTrial,
  type GoNoGoTrialResult,
  generateTrials,
  getOutcome,
  isCorrectOutcome,
  computeDPrime,
  computeSummary,
  GO_PROBABILITY,
} from './go-nogo';

// =============================================================================
// Helpers
// =============================================================================

function makeTrial(type: 'go' | 'nogo'): GoNoGoTrial {
  return { trialType: type };
}

function makeResult(
  type: 'go' | 'nogo',
  responded: boolean,
  rt: number | null = null,
): GoNoGoTrialResult {
  const trial = makeTrial(type);
  const outcome = getOutcome(type, responded);
  return { trial, responded, rt, outcome };
}

// =============================================================================
// 1. Trial generation — 75% go, 25% no-go
// =============================================================================

describe('Go/No-Go — Trial generation', () => {
  it('generates the correct number of trials', () => {
    const trials = generateTrials(30);
    expect(trials).toHaveLength(30);
  });

  it('has 75% go and 25% no-go (exact rounding for 30 trials)', () => {
    const trials = generateTrials(30);
    const goCount = trials.filter((t) => t.trialType === 'go').length;
    const nogoCount = trials.filter((t) => t.trialType === 'nogo').length;
    expect(goCount).toBe(Math.round(30 * GO_PROBABILITY)); // 23
    expect(nogoCount).toBe(30 - Math.round(30 * GO_PROBABILITY)); // 7
  });

  it('has correct ratio for different trial counts', () => {
    for (const count of [10, 20, 40, 60]) {
      const trials = generateTrials(count);
      const goCount = trials.filter((t) => t.trialType === 'go').length;
      expect(goCount).toBe(Math.round(count * GO_PROBABILITY));
    }
  });

  it('starts with a short GO lead-in to build prepotent response', () => {
    const trials = generateTrials(30);
    expect(trials.slice(0, 4).every((t) => t.trialType === 'go')).toBe(true);
  });

  it('limits no-go streaks to preserve Go prepotency', () => {
    const trials = generateTrials(120);
    let streak = 0;
    let maxStreak = 0;
    for (const trial of trials) {
      if (trial.trialType === 'nogo') {
        streak += 1;
        maxStreak = Math.max(maxStreak, streak);
      } else {
        streak = 0;
      }
    }
    expect(maxStreak).toBeLessThanOrEqual(2);
  });

  it('uses the provided RNG for reproducibility', () => {
    let seed = 42;
    const rng = () => {
      seed = (seed * 16807 + 0) % 2147483647;
      return seed / 2147483647;
    };
    const a = generateTrials(30, rng);

    seed = 42;
    const b = generateTrials(30, rng);

    expect(a.map((t) => t.trialType)).toEqual(b.map((t) => t.trialType));
  });

  it('generates 0 nogo trials for very small count with high go probability', () => {
    // count=1 -> goCount = round(0.75) = 1, nogoCount = 0
    const trials = generateTrials(1);
    expect(trials).toHaveLength(1);
    expect(trials[0]!.trialType).toBe('go');
  });
});

// =============================================================================
// 2. SDT outcome classification
// =============================================================================

describe('Go/No-Go — Outcome classification (SDT)', () => {
  it('go + responded = hit', () => {
    expect(getOutcome('go', true)).toBe('hit');
  });

  it('go + not responded = miss', () => {
    expect(getOutcome('go', false)).toBe('miss');
  });

  it('nogo + responded = false_alarm', () => {
    expect(getOutcome('nogo', true)).toBe('false_alarm');
  });

  it('nogo + not responded = correct_rejection', () => {
    expect(getOutcome('nogo', false)).toBe('correct_rejection');
  });
});

// =============================================================================
// 3. isCorrectOutcome
// =============================================================================

describe('Go/No-Go — isCorrectOutcome', () => {
  it('hit is correct', () => {
    expect(isCorrectOutcome('hit')).toBe(true);
  });

  it('correct_rejection is correct', () => {
    expect(isCorrectOutcome('correct_rejection')).toBe(true);
  });

  it('miss is incorrect', () => {
    expect(isCorrectOutcome('miss')).toBe(false);
  });

  it('false_alarm is incorrect', () => {
    expect(isCorrectOutcome('false_alarm')).toBe(false);
  });
});

// =============================================================================
// 4. d-prime calculation
// =============================================================================

describe('Go/No-Go — d-prime calculation', () => {
  it('returns 0 when no signal trials exist', () => {
    expect(computeDPrime(0, 0, 5, 5)).toBe(0);
  });

  it('returns 0 when no noise trials exist', () => {
    expect(computeDPrime(5, 5, 0, 0)).toBe(0);
  });

  it('high d-prime for perfect-ish performance', () => {
    // 20 hits, 0 misses, 0 false alarms, 10 correct rejections
    const dp = computeDPrime(20, 0, 0, 10);
    expect(dp).toBeGreaterThan(2.5);
  });

  it('near-zero d-prime for chance performance', () => {
    // Equal hit and FA rates
    const dp = computeDPrime(10, 10, 10, 10);
    expect(Math.abs(dp)).toBeLessThan(0.5);
  });

  it('negative d-prime when FA rate > hit rate', () => {
    // 2 hits out of 20 signal trials, 18 false alarms out of 20 noise trials
    const dp = computeDPrime(2, 18, 18, 2);
    expect(dp).toBeLessThan(0);
  });

  it('positive d-prime for typical good performance', () => {
    // 18 hits, 2 misses, 2 false alarms, 8 correct rejections
    const dp = computeDPrime(18, 2, 2, 8);
    expect(dp).toBeGreaterThan(1.5);
  });

  it('handles extreme hit rate (all hits, no misses) via log-linear correction', () => {
    const dp = computeDPrime(20, 0, 5, 5);
    expect(Number.isFinite(dp)).toBe(true);
    expect(dp).toBeGreaterThan(0);
  });

  it('handles zero false alarm rate via log-linear correction', () => {
    const dp = computeDPrime(15, 5, 0, 10);
    expect(Number.isFinite(dp)).toBe(true);
    expect(dp).toBeGreaterThan(0);
  });

  it('handles 100% FA rate via log-linear correction', () => {
    const dp = computeDPrime(15, 5, 10, 0);
    expect(Number.isFinite(dp)).toBe(true);
  });

  it('handles deep tail probabilities without infinities (very high sensitivity)', () => {
    const dp = computeDPrime(1000, 0, 0, 1000);
    expect(Number.isFinite(dp)).toBe(true);
    expect(dp).toBeGreaterThan(4);
  });

  it('handles deep tail probabilities without infinities (very low sensitivity)', () => {
    const dp = computeDPrime(0, 1000, 1000, 0);
    expect(Number.isFinite(dp)).toBe(true);
    expect(dp).toBeLessThan(-4);
  });
});

// =============================================================================
// 5. Summary computation
// =============================================================================

describe('Go/No-Go — Summary computation', () => {
  it('computes accuracy correctly', () => {
    const results: GoNoGoTrialResult[] = [
      makeResult('go', true, 400), // hit
      makeResult('go', true, 420), // hit
      makeResult('go', false), // miss
      makeResult('nogo', false), // correct rejection
      makeResult('nogo', true, 300), // false alarm
    ];
    const summary = computeSummary(results);
    // correct = 2 hits + 1 CR = 3 out of 5
    expect(summary.accuracy).toBe(60);
    expect(summary.correctTrials).toBe(3);
    expect(summary.totalTrials).toBe(5);
  });

  it('counts SDT categories correctly', () => {
    const results: GoNoGoTrialResult[] = [
      makeResult('go', true, 400),
      makeResult('go', true, 420),
      makeResult('go', false),
      makeResult('nogo', false),
      makeResult('nogo', true, 300),
    ];
    const summary = computeSummary(results);
    expect(summary.hits).toBe(2);
    expect(summary.misses).toBe(1);
    expect(summary.falseAlarms).toBe(1);
    expect(summary.correctRejections).toBe(1);
  });

  it('computes hitRate and falseAlarmRate as percentages', () => {
    const results: GoNoGoTrialResult[] = [
      makeResult('go', true, 400), // hit
      makeResult('go', false), // miss
      makeResult('nogo', true, 300), // FA
      makeResult('nogo', false), // CR
    ];
    const summary = computeSummary(results);
    expect(summary.hitRate).toBe(50); // 1/2
    expect(summary.falseAlarmRate).toBe(50); // 1/2
  });

  it('computes avgRT from hit trials only', () => {
    const results: GoNoGoTrialResult[] = [
      makeResult('go', true, 400), // hit
      makeResult('go', true, 600), // hit
      makeResult('nogo', true, 200), // FA — not included in avgRT
      makeResult('go', false), // miss — no RT
    ];
    const summary = computeSummary(results);
    expect(summary.avgRT).toBe(500); // (400 + 600) / 2
  });

  it('avgRT is 0 when no hits', () => {
    const results: GoNoGoTrialResult[] = [makeResult('go', false), makeResult('nogo', false)];
    expect(computeSummary(results).avgRT).toBe(0);
  });

  it('100% accuracy: all hits + all correct rejections', () => {
    const results: GoNoGoTrialResult[] = [
      makeResult('go', true, 400),
      makeResult('go', true, 420),
      makeResult('go', true, 430),
      makeResult('nogo', false),
    ];
    const summary = computeSummary(results);
    expect(summary.accuracy).toBe(100);
    expect(summary.hitRate).toBe(100);
    expect(summary.falseAlarmRate).toBe(0);
  });

  it('0% accuracy: all misses + all false alarms', () => {
    const results: GoNoGoTrialResult[] = [
      makeResult('go', false),
      makeResult('go', false),
      makeResult('nogo', true, 300),
    ];
    const summary = computeSummary(results);
    expect(summary.accuracy).toBe(0);
    expect(summary.hitRate).toBe(0);
    expect(summary.falseAlarmRate).toBe(100);
  });

  it('counts go and nogo trial totals', () => {
    const results: GoNoGoTrialResult[] = [
      makeResult('go', true, 400),
      makeResult('go', true, 420),
      makeResult('go', false),
      makeResult('nogo', false),
      makeResult('nogo', true, 300),
    ];
    const summary = computeSummary(results);
    expect(summary.goCount).toBe(3);
    expect(summary.nogoCount).toBe(2);
  });

  it('handles empty results', () => {
    const summary = computeSummary([]);
    expect(summary.accuracy).toBe(0);
    expect(summary.avgRT).toBe(0);
    expect(summary.totalTrials).toBe(0);
    expect(summary.hits).toBe(0);
    expect(summary.dPrime).toBe(0);
  });

  it('includes d-prime in summary', () => {
    const results: GoNoGoTrialResult[] = [
      makeResult('go', true, 400),
      makeResult('go', true, 420),
      makeResult('go', true, 430),
      makeResult('go', false),
      makeResult('nogo', false),
      makeResult('nogo', false),
      makeResult('nogo', true, 300),
    ];
    const summary = computeSummary(results);
    expect(Number.isFinite(summary.dPrime)).toBe(true);
    expect(summary.dPrime).toBeGreaterThan(0);
  });

  it('all-go session: no nogo trials means falseAlarmRate = 0', () => {
    const results: GoNoGoTrialResult[] = [
      makeResult('go', true, 400),
      makeResult('go', true, 420),
      makeResult('go', false),
    ];
    const summary = computeSummary(results);
    expect(summary.falseAlarmRate).toBe(0);
    expect(summary.nogoCount).toBe(0);
  });

  it('all-nogo session: no go trials means hitRate = 0', () => {
    const results: GoNoGoTrialResult[] = [makeResult('nogo', false), makeResult('nogo', true, 300)];
    const summary = computeSummary(results);
    expect(summary.hitRate).toBe(0);
    expect(summary.goCount).toBe(0);
  });
});
