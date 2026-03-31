import { describe, it, expect } from 'bun:test';
import {
  generateTrials,
  getFlankerString,
  isResponseCorrect,
  meanRtByCue,
  meanRtByFlanker,
  computeNetworkScores,
  computeSummary,
  CUE_CONDITIONS,
  FLANKER_CONDITIONS,
  type AntTrial,
  type AntTrialResult,
} from './ant';

// =============================================================================
// Helpers
// =============================================================================

function makeTrial(overrides: Partial<AntTrial> = {}): AntTrial {
  return {
    cue: 'none',
    flanker: 'congruent',
    targetLocation: 'top',
    targetDirection: 'right',
    ...overrides,
  };
}

function makeResult(
  overrides: Omit<Partial<AntTrialResult>, 'trial'> & { trial?: Partial<AntTrial> } = {},
): AntTrialResult {
  const { trial: trialOverrides, ...rest } = overrides;
  const base: AntTrialResult = {
    trial: makeTrial(trialOverrides),
    correct: true,
    responseTimeMs: 500,
    responded: true,
  };
  return Object.assign(base, rest);
}

function seededRng(seed = 42): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return s / 2147483647;
  };
}

// =============================================================================
// 1. Trial Generation
// =============================================================================

describe('ANT — Trial generation', () => {
  it('generates the correct number of trials', () => {
    const trials = generateTrials(24);
    expect(trials).toHaveLength(24);
  });

  it('covers all 4 cue conditions', () => {
    const trials = generateTrials(24);
    for (const cue of CUE_CONDITIONS) {
      expect(trials.some((t) => t.cue === cue)).toBe(true);
    }
  });

  it('covers all 3 flanker conditions', () => {
    const trials = generateTrials(24);
    for (const flanker of FLANKER_CONDITIONS) {
      expect(trials.some((t) => t.flanker === flanker)).toBe(true);
    }
  });

  it('trials are shuffled', () => {
    let foundShuffled = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      const trials = generateTrials(24);
      const first4Cues = trials.slice(0, 4).map((t) => t.cue);
      if (JSON.stringify(first4Cues) !== JSON.stringify(['none', 'center', 'double', 'spatial'])) {
        foundShuffled = true;
        break;
      }
    }
    expect(foundShuffled).toBe(true);
  });

  it('deterministic with seeded rng', () => {
    const a = generateTrials(24, seededRng(123));
    const b = generateTrials(24, seededRng(123));
    expect(a.map((t) => t.cue)).toEqual(b.map((t) => t.cue));
    expect(a.map((t) => t.flanker)).toEqual(b.map((t) => t.flanker));
  });

  it('handles count of 1', () => {
    const trials = generateTrials(1);
    expect(trials).toHaveLength(1);
  });
});

// =============================================================================
// 2. Flanker Display
// =============================================================================

describe('ANT — Flanker display', () => {
  it('congruent left: all arrows point left', () => {
    const s = getFlankerString('congruent', 'left');
    expect(s).toBe('\u2190 \u2190 \u2190 \u2190 \u2190');
  });

  it('congruent right: all arrows point right', () => {
    const s = getFlankerString('congruent', 'right');
    expect(s).toBe('\u2192 \u2192 \u2192 \u2192 \u2192');
  });

  it('incongruent left: flankers point right, center left', () => {
    const s = getFlankerString('incongruent', 'left');
    expect(s).toBe('\u2192 \u2192 \u2190 \u2192 \u2192');
  });

  it('incongruent right: flankers point left, center right', () => {
    const s = getFlankerString('incongruent', 'right');
    expect(s).toBe('\u2190 \u2190 \u2192 \u2190 \u2190');
  });

  it('neutral left: dashes around left arrow', () => {
    const s = getFlankerString('neutral', 'left');
    expect(s).toBe('\u2014 \u2014 \u2190 \u2014 \u2014');
  });

  it('neutral right: dashes around right arrow', () => {
    const s = getFlankerString('neutral', 'right');
    expect(s).toBe('\u2014 \u2014 \u2192 \u2014 \u2014');
  });
});

// =============================================================================
// 3. Response Validation
// =============================================================================

describe('ANT — Response validation', () => {
  it('correct when response matches target direction', () => {
    const trial = makeTrial({ targetDirection: 'left' });
    expect(isResponseCorrect(trial, 'left')).toBe(true);
  });

  it('incorrect when response does not match', () => {
    const trial = makeTrial({ targetDirection: 'left' });
    expect(isResponseCorrect(trial, 'right')).toBe(false);
  });

  it('correct for right target with right response', () => {
    const trial = makeTrial({ targetDirection: 'right' });
    expect(isResponseCorrect(trial, 'right')).toBe(true);
  });
});

// =============================================================================
// 4. Mean RT by Cue
// =============================================================================

describe('ANT — Mean RT by cue', () => {
  it('computes mean RT for a specific cue condition', () => {
    const results = [
      makeResult({ trial: { cue: 'none' }, responseTimeMs: 400 }),
      makeResult({ trial: { cue: 'none' }, responseTimeMs: 600 }),
      makeResult({ trial: { cue: 'double' }, responseTimeMs: 300 }),
    ];
    expect(meanRtByCue(results, 'none')).toBe(500);
    expect(meanRtByCue(results, 'double')).toBe(300);
  });

  it('ignores non-responded trials', () => {
    const results = [
      makeResult({ trial: { cue: 'none' }, responseTimeMs: 400 }),
      makeResult({ trial: { cue: 'none' }, responseTimeMs: 1700, responded: false }),
    ];
    expect(meanRtByCue(results, 'none')).toBe(400);
  });

  it('ignores incorrect trials', () => {
    const results = [
      makeResult({ trial: { cue: 'none' }, responseTimeMs: 400 }),
      makeResult({ trial: { cue: 'none' }, responseTimeMs: 9999, correct: false }),
    ];
    expect(meanRtByCue(results, 'none')).toBe(400);
  });

  it('returns 0 for missing cue condition', () => {
    const results = [makeResult({ trial: { cue: 'none' }, responseTimeMs: 400 })];
    expect(meanRtByCue(results, 'spatial')).toBe(0);
  });
});

// =============================================================================
// 5. Mean RT by Flanker
// =============================================================================

describe('ANT — Mean RT by flanker', () => {
  it('computes mean RT for a specific flanker condition', () => {
    const results = [
      makeResult({ trial: { flanker: 'congruent' }, responseTimeMs: 400 }),
      makeResult({ trial: { flanker: 'congruent' }, responseTimeMs: 500 }),
      makeResult({ trial: { flanker: 'incongruent' }, responseTimeMs: 600 }),
    ];
    expect(meanRtByFlanker(results, 'congruent')).toBe(450);
    expect(meanRtByFlanker(results, 'incongruent')).toBe(600);
  });

  it('returns 0 for no matching trials', () => {
    expect(meanRtByFlanker([], 'neutral')).toBe(0);
  });
});

// =============================================================================
// 6. Network Scores
// =============================================================================

describe('ANT — Network scores', () => {
  it('alerting = RT(no cue) - RT(double cue)', () => {
    const results = [
      makeResult({ trial: { cue: 'none' }, responseTimeMs: 500 }),
      makeResult({ trial: { cue: 'double' }, responseTimeMs: 400 }),
    ];
    const scores = computeNetworkScores(results);
    expect(scores.alerting).toBe(100);
  });

  it('orienting = RT(center) - RT(spatial)', () => {
    const results = [
      makeResult({ trial: { cue: 'center' }, responseTimeMs: 450 }),
      makeResult({ trial: { cue: 'spatial' }, responseTimeMs: 380 }),
    ];
    const scores = computeNetworkScores(results);
    expect(scores.orienting).toBe(70);
  });

  it('executive = RT(incongruent) - RT(congruent)', () => {
    const results = [
      makeResult({ trial: { flanker: 'incongruent' }, responseTimeMs: 550 }),
      makeResult({ trial: { flanker: 'congruent' }, responseTimeMs: 420 }),
    ];
    const scores = computeNetworkScores(results);
    expect(scores.executive).toBe(130);
  });

  it('can produce negative scores (unusual but valid)', () => {
    const results = [
      makeResult({ trial: { cue: 'none' }, responseTimeMs: 300 }),
      makeResult({ trial: { cue: 'double' }, responseTimeMs: 400 }),
    ];
    const scores = computeNetworkScores(results);
    expect(scores.alerting).toBe(-100);
  });

  it('returns 0 for all scores when no valid trials', () => {
    const scores = computeNetworkScores([]);
    expect(scores.alerting).toBe(0);
    expect(scores.orienting).toBe(0);
    expect(scores.executive).toBe(0);
  });
});

// =============================================================================
// 7. Summary
// =============================================================================

describe('ANT — Summary', () => {
  it('computes accuracy correctly', () => {
    const results = [
      makeResult({ correct: true }),
      makeResult({ correct: true }),
      makeResult({ correct: false }),
      makeResult({ correct: true }),
    ];
    const s = computeSummary(results);
    expect(s.accuracy).toBe(75);
    expect(s.correctTrials).toBe(3);
    expect(s.totalTrials).toBe(4);
  });

  it('computes mean RT from responded correct trials only', () => {
    const results = [
      makeResult({ correct: true, responded: true, responseTimeMs: 400 }),
      makeResult({ correct: false, responded: true, responseTimeMs: 9999 }), // incorrect
      makeResult({ correct: true, responded: false, responseTimeMs: 1700 }), // not responded
      makeResult({ correct: true, responded: true, responseTimeMs: 600 }),
    ];
    const s = computeSummary(results);
    expect(s.meanRtMs).toBe(500); // (400 + 600) / 2
  });

  it('includes network scores', () => {
    const results = [
      makeResult({ trial: { cue: 'none', flanker: 'congruent' }, responseTimeMs: 500 }),
      makeResult({ trial: { cue: 'double', flanker: 'incongruent' }, responseTimeMs: 400 }),
    ];
    const s = computeSummary(results);
    expect(s.networks.alerting).toBe(100);
  });

  it('handles empty results', () => {
    const s = computeSummary([]);
    expect(s.totalTrials).toBe(0);
    expect(s.accuracy).toBe(0);
    expect(s.meanRtMs).toBe(0);
    expect(s.networks.alerting).toBe(0);
    expect(s.networks.orienting).toBe(0);
    expect(s.networks.executive).toBe(0);
  });

  it('100% accuracy when all correct', () => {
    const results = [makeResult({ correct: true }), makeResult({ correct: true })];
    expect(computeSummary(results).accuracy).toBe(100);
  });

  it('0% accuracy when all wrong', () => {
    const results = [makeResult({ correct: false }), makeResult({ correct: false })];
    expect(computeSummary(results).accuracy).toBe(0);
  });
});
