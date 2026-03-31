import { describe, it, expect } from 'bun:test';
import {
  type Trial,
  type TrialResult,
  getAvailableColors,
  generateTrial,
  getStimulusTimeout,
  validateResponse,
  computeSummary,
  INITIAL_STIMULUS_TIMEOUT_MS,
  MIN_STIMULUS_TIMEOUT_MS,
  TIMEOUT_DECREASE_MS,
  TIMEOUT_DECREASE_EVERY,
  CONGRUENT_RATIO,
  ALL_COLORS,
} from './color-rush';

// =============================================================================
// Deterministic RNG for reproducible tests
// =============================================================================

// =============================================================================
// 1. Trial generation — Congruent / Incongruent ratio
// =============================================================================

describe('Color Rush — Trial generation', () => {
  it('produces approximately 30% congruent / 70% incongruent trials over many samples', () => {
    const colors = getAvailableColors(2);
    const N = 1000;
    let congruent = 0;
    for (let i = 0; i < N; i++) {
      const trial = generateTrial(colors, 2);
      if (trial.congruent) congruent++;
    }
    const ratio = congruent / N;
    // Allow ± 5% tolerance for randomness
    expect(ratio).toBeGreaterThan(CONGRUENT_RATIO - 0.05);
    expect(ratio).toBeLessThan(CONGRUENT_RATIO + 0.05);
  });

  it('generates congruent trial when rng returns < 0.3', () => {
    const colors = getAvailableColors(2);
    // rng returns 0.1 first (< 0.3 => congruent), then 0.5 for ink color pick
    const trial = generateTrial(colors, 2, () => 0.1);
    expect(trial.congruent).toBe(true);
    expect(trial.inkColor).toBe(trial.wordColor);
  });

  it('generates incongruent trial when rng returns >= 0.3', () => {
    const colors = getAvailableColors(2);
    // Force incongruent: first call returns 0.5 (>= 0.3)
    let callCount = 0;
    const trial = generateTrial(colors, 2, () => {
      callCount++;
      if (callCount === 1) return 0.5; // isCongruent check -> false
      return 0.5; // pick colors
    });
    expect(trial.congruent).toBe(false);
    expect(trial.inkColor).not.toBe(trial.wordColor);
  });

  it('every trial has valid colorId fields', () => {
    const colors = getAvailableColors(2);
    const validIds = ALL_COLORS.map((c) => c.id);
    for (let i = 0; i < 100; i++) {
      const trial = generateTrial(colors, 2);
      expect(validIds).toContain(trial.inkColor);
      expect(validIds).toContain(trial.wordColor);
    }
  });
});

// =============================================================================
// 2. Stroop interference — incongruent trials
// =============================================================================

describe('Color Rush — Stroop interference', () => {
  it('word color differs from ink color in incongruent trials', () => {
    const colors = getAvailableColors(2);
    for (let i = 0; i < 200; i++) {
      const trial = generateTrial(colors, 2);
      if (!trial.congruent) {
        expect(trial.inkColor).not.toBe(trial.wordColor);
      }
    }
  });

  it('word matches ink in congruent trials', () => {
    const colors = getAvailableColors(2);
    for (let i = 0; i < 200; i++) {
      const trial = generateTrial(colors, 2);
      if (trial.congruent) {
        expect(trial.inkColor).toBe(trial.wordColor);
      }
    }
  });

  it('word text corresponds to wordColor', () => {
    const colorWordMap: Record<string, string> = {
      red: 'ROUGE',
      blue: 'BLEU',
      green: 'VERT',
      yellow: 'JAUNE',
    };
    const colors = getAvailableColors(2);
    for (let i = 0; i < 100; i++) {
      const trial = generateTrial(colors, 2);
      expect(trial.word).toBe((colorWordMap as Record<string, string>)[trial.wordColor]);
    }
  });
});

// =============================================================================
// 3. Response validation — correct answer = ink color
// =============================================================================

describe('Color Rush — Response validation', () => {
  it('correct when response matches ink color', () => {
    const trial: Trial = {
      word: 'BLEU',
      inkColor: 'red',
      wordColor: 'blue',
      congruent: false,
      distractors: null,
    };
    expect(validateResponse(trial, 'red')).toBe(true);
  });

  it('incorrect when response matches word (not ink)', () => {
    const trial: Trial = {
      word: 'BLEU',
      inkColor: 'red',
      wordColor: 'blue',
      congruent: false,
      distractors: null,
    };
    expect(validateResponse(trial, 'blue')).toBe(false);
  });

  it('correct for congruent trial when matching both', () => {
    const trial: Trial = {
      word: 'ROUGE',
      inkColor: 'red',
      wordColor: 'red',
      congruent: true,
      distractors: null,
    };
    expect(validateResponse(trial, 'red')).toBe(true);
  });

  it('incorrect for any non-ink color', () => {
    const trial: Trial = {
      word: 'VERT',
      inkColor: 'yellow',
      wordColor: 'green',
      congruent: false,
      distractors: null,
    };
    expect(validateResponse(trial, 'green')).toBe(false);
    expect(validateResponse(trial, 'red')).toBe(false);
    expect(validateResponse(trial, 'blue')).toBe(false);
    expect(validateResponse(trial, 'yellow')).toBe(true);
  });
});

// =============================================================================
// 4. Speed pressure — stimulus timeout decreases
// =============================================================================

describe('Color Rush — Speed pressure', () => {
  it('starts at INITIAL_STIMULUS_TIMEOUT_MS', () => {
    expect(getStimulusTimeout(0)).toBe(INITIAL_STIMULUS_TIMEOUT_MS);
  });

  it('stays the same for trials 0-4 (first block)', () => {
    for (let i = 0; i < TIMEOUT_DECREASE_EVERY; i++) {
      expect(getStimulusTimeout(i)).toBe(INITIAL_STIMULUS_TIMEOUT_MS);
    }
  });

  it('decreases by TIMEOUT_DECREASE_MS after every block', () => {
    expect(getStimulusTimeout(5)).toBe(INITIAL_STIMULUS_TIMEOUT_MS - TIMEOUT_DECREASE_MS);
    expect(getStimulusTimeout(10)).toBe(INITIAL_STIMULUS_TIMEOUT_MS - 2 * TIMEOUT_DECREASE_MS);
  });

  it('never goes below MIN_STIMULUS_TIMEOUT_MS', () => {
    // At trial 500, the timeout should be clamped
    expect(getStimulusTimeout(500)).toBe(MIN_STIMULUS_TIMEOUT_MS);
  });

  it('monotonically decreases or stays the same', () => {
    let prev = getStimulusTimeout(0);
    for (let i = 1; i < 100; i++) {
      const curr = getStimulusTimeout(i);
      expect(curr).toBeLessThanOrEqual(prev);
      prev = curr;
    }
  });

  it('reaches minimum at the expected trial index', () => {
    // (INITIAL - MIN) / DECREASE = number of decreases needed
    const stepsNeeded = Math.ceil(
      (INITIAL_STIMULUS_TIMEOUT_MS - MIN_STIMULUS_TIMEOUT_MS) / TIMEOUT_DECREASE_MS,
    );
    const trialAtMin = stepsNeeded * TIMEOUT_DECREASE_EVERY;
    expect(getStimulusTimeout(trialAtMin)).toBe(MIN_STIMULUS_TIMEOUT_MS);
    // One block before should still be above min
    expect(getStimulusTimeout(trialAtMin - TIMEOUT_DECREASE_EVERY)).toBeGreaterThan(
      MIN_STIMULUS_TIMEOUT_MS,
    );
  });
});

// =============================================================================
// 5. Color pool scaling — more colors at higher nLevel
// =============================================================================

describe('Color Rush — Color pool scaling', () => {
  it('nLevel 1 has 3 colors', () => {
    expect(getAvailableColors(1)).toHaveLength(3);
  });

  it('nLevel 2 has 4 colors', () => {
    expect(getAvailableColors(2)).toHaveLength(4);
  });

  it('nLevel 3 has 4 colors (same as 2)', () => {
    expect(getAvailableColors(3)).toHaveLength(4);
  });

  it('nLevel 0 (edge case) has 3 colors', () => {
    expect(getAvailableColors(0)).toHaveLength(3);
  });

  it('nLevel 1 colors are a subset of nLevel 2 colors', () => {
    const n1 = getAvailableColors(1).map((c) => c.id);
    const n2 = getAvailableColors(2).map((c) => c.id);
    for (const id of n1) {
      expect(n2).toContain(id);
    }
  });

  it('nLevel 3 generates distractors', () => {
    const colors = getAvailableColors(3);
    let hasDistractors = false;
    for (let i = 0; i < 20; i++) {
      const trial = generateTrial(colors, 3);
      if (trial.distractors !== null) {
        hasDistractors = true;
        expect(trial.distractors.length).toBeGreaterThanOrEqual(2);
        expect(trial.distractors.length).toBeLessThanOrEqual(4);
      }
    }
    expect(hasDistractors).toBe(true);
  });

  it('nLevel 1 and 2 produce no distractors', () => {
    for (const nLevel of [1, 2]) {
      const colors = getAvailableColors(nLevel);
      for (let i = 0; i < 20; i++) {
        const trial = generateTrial(colors, nLevel);
        expect(trial.distractors).toBeNull();
      }
    }
  });
});

// =============================================================================
// 6. Scoring — accuracy and RT-based
// =============================================================================

describe('Color Rush — Scoring (computeSummary)', () => {
  function makeTrial(congruent: boolean): Trial {
    return {
      word: congruent ? 'ROUGE' : 'BLEU',
      inkColor: 'red',
      wordColor: congruent ? 'red' : 'blue',
      congruent,
      distractors: null,
    };
  }

  function makeResult(
    idx: number,
    correct: boolean,
    congruent: boolean,
    rt: number,
    timedOut = false,
  ): TrialResult {
    return {
      trialIndex: idx,
      trial: makeTrial(congruent),
      response: correct ? 'red' : 'blue',
      correct,
      responseTimeMs: rt,
      timedOut,
      congruent,
    };
  }

  it('computes accuracy correctly', () => {
    const results: TrialResult[] = [
      makeResult(0, true, true, 400),
      makeResult(1, true, false, 500),
      makeResult(2, false, false, 600),
      makeResult(3, true, true, 350),
    ];
    const summary = computeSummary(results);
    expect(summary.total).toBe(4);
    expect(summary.correctTrials).toBe(3);
    expect(summary.accuracy).toBeCloseTo(0.75, 2);
  });

  it('computes mean RT excluding timeouts', () => {
    const results: TrialResult[] = [
      makeResult(0, true, true, 400),
      makeResult(1, false, false, 2500, true), // timeout
      makeResult(2, true, false, 600),
    ];
    const summary = computeSummary(results);
    // meanRtMs = (400 + 600) / 2 = 500
    expect(summary.meanRtMs).toBeCloseTo(500, 0);
  });

  it('computes congruent vs incongruent accuracy separately', () => {
    const results: TrialResult[] = [
      makeResult(0, true, true, 300),
      makeResult(1, true, true, 350),
      makeResult(2, true, false, 500),
      makeResult(3, false, false, 600),
      makeResult(4, false, false, 700),
    ];
    const summary = computeSummary(results);
    expect(summary.congruentAcc).toBeCloseTo(1.0, 2); // 2/2
    expect(summary.incongruentAcc).toBeCloseTo(1 / 3, 2); // 1/3
  });

  it('computes congruency effect (Stroop effect in RT)', () => {
    const results: TrialResult[] = [
      makeResult(0, true, true, 300), // congruent, correct
      makeResult(1, true, true, 350), // congruent, correct
      makeResult(2, true, false, 500), // incongruent, correct
      makeResult(3, true, false, 600), // incongruent, correct
    ];
    const summary = computeSummary(results);
    // mean congruent RT = 325, mean incongruent RT = 550
    expect(summary.congruencyEffectMs).toBeCloseTo(225, 0);
  });

  it('counts timeouts', () => {
    const results: TrialResult[] = [
      makeResult(0, true, true, 400),
      makeResult(1, false, false, 2500, true),
      makeResult(2, false, true, 2500, true),
    ];
    const summary = computeSummary(results);
    expect(summary.timeouts).toBe(2);
  });

  it('handles empty results', () => {
    const summary = computeSummary([]);
    expect(summary.total).toBe(0);
    expect(summary.accuracy).toBe(0);
    expect(summary.meanRtMs).toBe(0);
  });
});

// =============================================================================
// 7. Edge cases
// =============================================================================

describe('Color Rush — Edge cases', () => {
  it('timeout trial has null response and correct=false', () => {
    const trial = makeTrial(false);
    const result: TrialResult = {
      trialIndex: 0,
      trial,
      response: null,
      correct: false,
      responseTimeMs: 2500,
      timedOut: true,
      congruent: false,
    };
    expect(result.response).toBeNull();
    expect(result.correct).toBe(false);
    expect(result.timedOut).toBe(true);
  });

  it('very fast response (< 100ms) is still valid', () => {
    const trial: Trial = {
      word: 'ROUGE',
      inkColor: 'red',
      wordColor: 'red',
      congruent: true,
      distractors: null,
    };
    // Game logic does not reject fast responses; that is a UI concern
    expect(validateResponse(trial, 'red')).toBe(true);
  });

  it('all correct trials yield accuracy 1.0', () => {
    const results: TrialResult[] = Array.from({ length: 10 }, (_, i) => ({
      trialIndex: i,
      trial: makeTrial(i % 2 === 0),
      response: 'red' as const,
      correct: true,
      responseTimeMs: 300 + i * 10,
      timedOut: false,
      congruent: i % 2 === 0,
    }));
    const summary = computeSummary(results);
    expect(summary.accuracy).toBe(1);
  });

  it('all timed-out trials yield accuracy 0', () => {
    const results: TrialResult[] = Array.from({ length: 5 }, (_, i) => ({
      trialIndex: i,
      trial: makeTrial(false),
      response: null,
      correct: false,
      responseTimeMs: 2500,
      timedOut: true,
      congruent: false,
    }));
    const summary = computeSummary(results);
    expect(summary.accuracy).toBe(0);
    expect(summary.timeouts).toBe(5);
    expect(summary.meanRtMs).toBe(0); // no valid RTs
  });
});

// Helper used in edge cases section
function makeTrial(congruent: boolean): Trial {
  return {
    word: congruent ? 'ROUGE' : 'BLEU',
    inkColor: 'red',
    wordColor: congruent ? 'red' : 'blue',
    congruent,
    distractors: null,
  };
}
