import { describe, it, expect } from 'bun:test';
import {
  type ProMemTrial,
  type TrialResult,
  type Response,
  generateTrials,
  evaluateResponse,
  computeSummary,
  LIVING_WORDS,
  NON_LIVING_WORDS,
} from './promem';

// =============================================================================
// Helpers
// =============================================================================

function mkTrial(overrides: Partial<ProMemTrial> = {}): ProMemTrial {
  return {
    word: 'tiger',
    isLiving: true,
    isProspective: false,
    displayColor: 'white',
    ...overrides,
  };
}

function mkResult(
  trial: ProMemTrial,
  response: Response,
  rt: number,
  timedOut = false,
): TrialResult {
  return {
    trial,
    response,
    correct: evaluateResponse(trial, response),
    rt,
    timedOut,
  };
}

// =============================================================================
// 1. Trial Generation
// =============================================================================

describe('ProMem — Trial generation', () => {
  it('generates the correct number of trials', () => {
    expect(generateTrials(40)).toHaveLength(40);
    expect(generateTrials(20)).toHaveLength(20);
  });

  it('contains the correct number of PM targets', () => {
    const trials = generateTrials(40, 6);
    const pmCount = trials.filter((t) => t.isProspective).length;
    expect(pmCount).toBe(6);
  });

  it('PM targets are not in the first 3 trials', () => {
    for (let attempt = 0; attempt < 20; attempt++) {
      const trials = generateTrials(40, 6);
      for (let i = 0; i < 3; i++) {
        expect(trials[i]!.isProspective).toBe(false);
      }
    }
  });

  it('PM targets are not in the last 2 trials', () => {
    for (let attempt = 0; attempt < 20; attempt++) {
      const trials = generateTrials(40, 6);
      expect(trials[38]!.isProspective).toBe(false);
      expect(trials[39]!.isProspective).toBe(false);
    }
  });

  it('PM trials have displayColor red', () => {
    const trials = generateTrials(40, 6);
    for (const t of trials) {
      if (t.isProspective) expect(t.displayColor).toBe('red');
      else expect(t.displayColor).toBe('white');
    }
  });

  it('all words come from valid pools', () => {
    const validWords = new Set([...LIVING_WORDS, ...NON_LIVING_WORDS]);
    const trials = generateTrials(40);
    for (const t of trials) {
      expect(validWords.has(t.word as any)).toBe(true);
    }
  });

  it('uses deterministic rng', () => {
    let seed = 0.7;
    const makeRng = () => {
      seed = 0.7;
      return () => {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
      };
    };
    const a = generateTrials(20, 4, makeRng());
    const b = generateTrials(20, 4, makeRng());
    expect(a).toEqual(b);
  });

  it('generates empty array for count 0', () => {
    expect(generateTrials(0, 0)).toHaveLength(0);
  });
});

// =============================================================================
// 2. Response Evaluation — Ongoing Trials
// =============================================================================

describe('ProMem — Ongoing trial evaluation', () => {
  it('living word + "living" response = correct', () => {
    const trial = mkTrial({ isLiving: true, isProspective: false });
    expect(evaluateResponse(trial, 'living')).toBe(true);
  });

  it('living word + "non-living" response = incorrect', () => {
    const trial = mkTrial({ isLiving: true, isProspective: false });
    expect(evaluateResponse(trial, 'non-living')).toBe(false);
  });

  it('non-living word + "non-living" response = correct', () => {
    const trial = mkTrial({ word: 'hammer', isLiving: false, isProspective: false });
    expect(evaluateResponse(trial, 'non-living')).toBe(true);
  });

  it('non-living word + "living" response = incorrect', () => {
    const trial = mkTrial({ word: 'hammer', isLiving: false, isProspective: false });
    expect(evaluateResponse(trial, 'living')).toBe(false);
  });

  it('ongoing trial + "star" response = incorrect', () => {
    const trial = mkTrial({ isProspective: false });
    expect(evaluateResponse(trial, 'star')).toBe(false);
  });

  it('null response (timeout) = incorrect', () => {
    const trial = mkTrial({ isProspective: false });
    expect(evaluateResponse(trial, null)).toBe(false);
  });
});

// =============================================================================
// 3. Response Evaluation — Prospective Trials
// =============================================================================

describe('ProMem — Prospective trial evaluation', () => {
  it('PM trial + "star" = correct', () => {
    const trial = mkTrial({ isProspective: true, displayColor: 'red' });
    expect(evaluateResponse(trial, 'star')).toBe(true);
  });

  it('PM trial + "living" = incorrect (missed PM cue)', () => {
    const trial = mkTrial({ isProspective: true, isLiving: true, displayColor: 'red' });
    expect(evaluateResponse(trial, 'living')).toBe(false);
  });

  it('PM trial + "non-living" = incorrect', () => {
    const trial = mkTrial({ isProspective: true, isLiving: false, displayColor: 'red' });
    expect(evaluateResponse(trial, 'non-living')).toBe(false);
  });

  it('PM trial + null = incorrect', () => {
    const trial = mkTrial({ isProspective: true, displayColor: 'red' });
    expect(evaluateResponse(trial, null)).toBe(false);
  });
});

// =============================================================================
// 4. Summary — Basic Metrics
// =============================================================================

describe('ProMem — Summary basic metrics', () => {
  it('computes overall accuracy', () => {
    const results = [
      mkResult(mkTrial({ isLiving: true }), 'living', 500),
      mkResult(mkTrial({ isLiving: false }), 'non-living', 600),
      mkResult(mkTrial({ isLiving: true }), 'non-living', 700), // wrong
    ];
    const s = computeSummary(results);
    expect(s.accuracy).toBe(67);
    expect(s.correctTrials).toBe(2);
    expect(s.totalTrials).toBe(3);
  });

  it('computes mean RT excluding timeouts', () => {
    const results = [
      mkResult(mkTrial(), 'living', 400),
      mkResult(mkTrial(), 'living', 600),
      mkResult(mkTrial(), null, 2500, true), // timed out
    ];
    const s = computeSummary(results);
    expect(s.meanRt).toBe(500); // (400+600)/2, timeout excluded
  });

  it('counts timed out trials', () => {
    const results = [
      mkResult(mkTrial(), null, 2500, true),
      mkResult(mkTrial(), null, 2500, true),
      mkResult(mkTrial(), 'living', 500),
    ];
    expect(computeSummary(results).timedOut).toBe(2);
  });

  it('handles empty results', () => {
    const s = computeSummary([]);
    expect(s.totalTrials).toBe(0);
    expect(s.accuracy).toBe(0);
    expect(s.meanRt).toBe(0);
    expect(s.pmHitRate).toBe(0);
    expect(s.ongoingAccuracy).toBe(0);
  });
});

// =============================================================================
// 5. Summary — Ongoing Task Metrics
// =============================================================================

describe('ProMem — Summary ongoing task metrics', () => {
  it('computes ongoing accuracy excluding PM trials', () => {
    const results = [
      mkResult(mkTrial({ isLiving: true }), 'living', 500),
      mkResult(mkTrial({ isLiving: false }), 'living', 600), // wrong
      mkResult(mkTrial({ isProspective: true, displayColor: 'red' }), 'star', 400), // PM trial, excluded from ongoing
    ];
    const s = computeSummary(results);
    expect(s.ongoingTotal).toBe(2);
    expect(s.ongoingCorrect).toBe(1);
    expect(s.ongoingAccuracy).toBe(50);
  });

  it('computes ongoing mean RT', () => {
    const results = [
      mkResult(mkTrial({ isLiving: true }), 'living', 400),
      mkResult(mkTrial({ isLiving: false }), 'non-living', 800),
    ];
    expect(computeSummary(results).ongoingMeanRt).toBe(600);
  });
});

// =============================================================================
// 6. Summary — Prospective Memory Metrics
// =============================================================================

describe('ProMem — Summary PM metrics', () => {
  it('computes PM hit rate', () => {
    const pmTrial = mkTrial({ isProspective: true, displayColor: 'red' });
    const results = [
      mkResult(pmTrial, 'star', 500), // hit
      mkResult(pmTrial, 'living', 600), // miss
      mkResult(pmTrial, 'star', 700), // hit
    ];
    const s = computeSummary(results);
    expect(s.pmTotal).toBe(3);
    expect(s.pmHits).toBe(2);
    expect(s.pmMisses).toBe(1);
    expect(s.pmHitRate).toBe(67);
  });

  it('computes PM mean RT from star responses only', () => {
    const pmTrial = mkTrial({ isProspective: true, displayColor: 'red' });
    const results = [
      mkResult(pmTrial, 'star', 400),
      mkResult(pmTrial, 'star', 800),
      mkResult(pmTrial, 'living', 500), // miss, excluded from PM RT
    ];
    expect(computeSummary(results).pmMeanRt).toBe(600);
  });

  it('PM hit rate is 0 when no PM trials exist', () => {
    const results = [mkResult(mkTrial(), 'living', 500)];
    expect(computeSummary(results).pmHitRate).toBe(0);
    expect(computeSummary(results).pmTotal).toBe(0);
  });

  it('PM hit rate is 100 when all PM trials hit', () => {
    const pmTrial = mkTrial({ isProspective: true, displayColor: 'red' });
    const results = [mkResult(pmTrial, 'star', 500), mkResult(pmTrial, 'star', 600)];
    expect(computeSummary(results).pmHitRate).toBe(100);
  });

  it('PM hit rate is 0 when all PM trials missed', () => {
    const pmTrial = mkTrial({ isProspective: true, isLiving: true, displayColor: 'red' });
    const results = [mkResult(pmTrial, 'living', 500), mkResult(pmTrial, 'non-living', 600)];
    expect(computeSummary(results).pmHitRate).toBe(0);
    expect(computeSummary(results).pmMisses).toBe(2);
  });
});

// =============================================================================
// 7. Summary — PM Cost
// =============================================================================

describe('ProMem — Summary PM cost', () => {
  it('computes PM cost as RT difference (PM - ongoing)', () => {
    const ongoingTrial = mkTrial({ isLiving: true });
    const pmTrial = mkTrial({ isProspective: true, displayColor: 'red' });
    const results = [
      mkResult(ongoingTrial, 'living', 400),
      mkResult(ongoingTrial, 'living', 600), // ongoing mean = 500
      mkResult(pmTrial, 'star', 700),
      mkResult(pmTrial, 'star', 900), // PM mean = 800
    ];
    const s = computeSummary(results);
    expect(s.pmCostMs).toBe(300); // 800 - 500
  });

  it('PM cost is 0 when no PM RT available', () => {
    const results = [mkResult(mkTrial(), 'living', 500)];
    expect(computeSummary(results).pmCostMs).toBe(0);
  });

  it('PM cost can be negative (PM faster than ongoing)', () => {
    const ongoingTrial = mkTrial({ isLiving: true });
    const pmTrial = mkTrial({ isProspective: true, displayColor: 'red' });
    const results = [mkResult(ongoingTrial, 'living', 800), mkResult(pmTrial, 'star', 400)];
    expect(computeSummary(results).pmCostMs).toBe(-400);
  });
});

// =============================================================================
// 8. Edge Cases
// =============================================================================

describe('ProMem — Edge cases', () => {
  it('all trials timed out', () => {
    const results = [mkResult(mkTrial(), null, 2500, true), mkResult(mkTrial(), null, 2500, true)];
    const s = computeSummary(results);
    expect(s.accuracy).toBe(0);
    expect(s.timedOut).toBe(2);
    expect(s.meanRt).toBe(0); // no valid RTs
  });

  it('all trials correct with mixed ongoing and PM', () => {
    const results = [
      mkResult(mkTrial({ isLiving: true }), 'living', 500),
      mkResult(mkTrial({ isLiving: false }), 'non-living', 600),
      mkResult(mkTrial({ isProspective: true, displayColor: 'red' }), 'star', 700),
    ];
    const s = computeSummary(results);
    expect(s.accuracy).toBe(100);
    expect(s.ongoingAccuracy).toBe(100);
    expect(s.pmHitRate).toBe(100);
  });

  it('star on ongoing trial counts as error', () => {
    const trial = mkTrial({ isLiving: true, isProspective: false });
    const result = mkResult(trial, 'star', 500);
    expect(result.correct).toBe(false);
    const s = computeSummary([result]);
    expect(s.ongoingCorrect).toBe(0);
  });
});
