import { describe, it, expect } from 'bun:test';
import {
  type StroopTrial,
  type TrialResult,
  type ColorId,
  generateTrials,
  getExpectedResponse,
  isResponseCorrect,
  isWordTrap,
  computeInterference,
  computeSummary,
  COLORS,
} from './stroop-task';

// =============================================================================
// Helpers
// =============================================================================

const COLOR_WORDS: { id: ColorId; word: string }[] = [
  { id: 'red', word: 'RED' },
  { id: 'blue', word: 'BLUE' },
  { id: 'green', word: 'GREEN' },
  { id: 'yellow', word: 'YELLOW' },
];

function makeTrial(overrides: Partial<StroopTrial> = {}): StroopTrial {
  return {
    word: 'RED',
    inkColor: 'red',
    wordColor: 'red',
    congruent: true,
    rule: 'ink',
    ...overrides,
  };
}

function makeResult(
  trial: StroopTrial,
  overrides: Partial<Omit<TrialResult, 'trial'>> = {},
): TrialResult {
  const response = overrides.response ?? null;
  return {
    trial,
    response,
    correct: overrides.correct ?? (response !== null && response === getExpectedResponse(trial)),
    rt: overrides.rt ?? 500,
    timedOut: overrides.timedOut ?? false,
    ...overrides,
  };
}

// =============================================================================
// 1. Trial Generation
// =============================================================================

describe('Stroop — Trial generation', () => {
  it('generates the correct number of trials', () => {
    const trials = generateTrials(24, COLOR_WORDS);
    expect(trials).toHaveLength(24);
  });

  it('has roughly 50/50 congruent/incongruent split', () => {
    const trials = generateTrials(24, COLOR_WORDS);
    const congruent = trials.filter((t) => t.congruent).length;
    const incongruent = trials.filter((t) => !t.congruent).length;
    expect(congruent).toBe(12); // floor(24/2)
    expect(incongruent).toBe(12);
  });

  it('congruent trials have matching word and ink', () => {
    const trials = generateTrials(24, COLOR_WORDS);
    for (const t of trials.filter((t) => t.congruent)) {
      expect(t.inkColor).toBe(t.wordColor);
    }
  });

  it('incongruent trials have different word and ink', () => {
    const trials = generateTrials(24, COLOR_WORDS);
    for (const t of trials.filter((t) => !t.congruent)) {
      expect(t.inkColor).not.toBe(t.wordColor);
    }
  });

  it('uses all 4 colors', () => {
    const trials = generateTrials(24, COLOR_WORDS);
    const inkColors = new Set(trials.map((t) => t.inkColor));
    const wordColors = new Set(trials.map((t) => t.wordColor));
    for (const c of COLORS) {
      expect(inkColors.has(c)).toBe(true);
      expect(wordColors.has(c)).toBe(true);
    }
  });

  it('classic stroop uses "ink" rule for all trials', () => {
    const trials = generateTrials(24, COLOR_WORDS, 'stroop');
    for (const t of trials) {
      expect(t.rule).toBe('ink');
    }
  });

  it('stroop-flex assigns "word" rule to every 4th trial', () => {
    const trials = generateTrials(24, COLOR_WORDS, 'stroop-flex');
    for (let i = 0; i < trials.length; i++) {
      const expected = i % 4 === 0 ? 'word' : 'ink';
      expect(trials[i]!.rule).toBe(expected);
    }
  });

  it('handles odd trial counts', () => {
    const trials = generateTrials(13, COLOR_WORDS);
    expect(trials).toHaveLength(13);
    const congruent = trials.filter((t) => t.congruent).length;
    const incongruent = trials.filter((t) => !t.congruent).length;
    expect(congruent).toBe(6); // floor(13/2)
    expect(incongruent).toBe(7);
  });
});

// =============================================================================
// 2. Response Validation — Congruent Trials
// =============================================================================

describe('Stroop — Congruent trial response', () => {
  it('word "RED" in red ink → correct = red', () => {
    const trial = makeTrial({ word: 'RED', inkColor: 'red', wordColor: 'red', congruent: true });
    expect(getExpectedResponse(trial)).toBe('red');
    expect(isResponseCorrect(trial, 'red')).toBe(true);
  });

  it('word "BLUE" in blue ink → correct = blue', () => {
    const trial = makeTrial({ word: 'BLUE', inkColor: 'blue', wordColor: 'blue', congruent: true });
    expect(isResponseCorrect(trial, 'blue')).toBe(true);
    expect(isResponseCorrect(trial, 'red')).toBe(false);
  });

  it('null response is always incorrect', () => {
    const trial = makeTrial();
    expect(isResponseCorrect(trial, null)).toBe(false);
  });
});

// =============================================================================
// 3. Response Validation — Incongruent Trials
// =============================================================================

describe('Stroop — Incongruent trial response', () => {
  it('word "RED" in blue ink → correct = blue (ink rule)', () => {
    const trial = makeTrial({
      word: 'RED',
      inkColor: 'blue',
      wordColor: 'red',
      congruent: false,
      rule: 'ink',
    });
    expect(getExpectedResponse(trial)).toBe('blue');
    expect(isResponseCorrect(trial, 'blue')).toBe(true);
    expect(isResponseCorrect(trial, 'red')).toBe(false);
  });

  it('word "GREEN" in yellow ink → correct = yellow (ink rule)', () => {
    const trial = makeTrial({
      word: 'GREEN',
      inkColor: 'yellow',
      wordColor: 'green',
      congruent: false,
      rule: 'ink',
    });
    expect(isResponseCorrect(trial, 'yellow')).toBe(true);
    expect(isResponseCorrect(trial, 'green')).toBe(false);
  });

  it('word rule: word "RED" in blue ink → correct = red', () => {
    const trial = makeTrial({
      word: 'RED',
      inkColor: 'blue',
      wordColor: 'red',
      congruent: false,
      rule: 'word',
    });
    expect(getExpectedResponse(trial)).toBe('red');
    expect(isResponseCorrect(trial, 'red')).toBe(true);
    expect(isResponseCorrect(trial, 'blue')).toBe(false);
  });
});

// =============================================================================
// 4. Word Trap Detection
// =============================================================================

describe('Stroop — Word trap detection', () => {
  it('detects word trap: incongruent ink-rule, responded with word color', () => {
    const trial = makeTrial({
      inkColor: 'blue',
      wordColor: 'red',
      congruent: false,
      rule: 'ink',
    });
    expect(isWordTrap(trial, 'red')).toBe(true);
  });

  it('not a word trap on congruent trial', () => {
    const trial = makeTrial({ congruent: true, rule: 'ink' });
    expect(isWordTrap(trial, 'red')).toBe(false);
  });

  it('not a word trap with null response', () => {
    const trial = makeTrial({ congruent: false, rule: 'ink' });
    expect(isWordTrap(trial, null)).toBe(false);
  });

  it('not a word trap on word-rule trial', () => {
    const trial = makeTrial({
      inkColor: 'blue',
      wordColor: 'red',
      congruent: false,
      rule: 'word',
    });
    // responding with wordColor on word-rule trial is correct, not a trap
    expect(isWordTrap(trial, 'red')).toBe(false);
  });

  it('not a word trap when response is a random wrong color', () => {
    const trial = makeTrial({
      inkColor: 'blue',
      wordColor: 'red',
      congruent: false,
      rule: 'ink',
    });
    // responding 'green' is wrong but not a word trap
    expect(isWordTrap(trial, 'green')).toBe(false);
  });
});

// =============================================================================
// 5. Stroop Interference Calculation
// =============================================================================

describe('Stroop — Interference effect', () => {
  it('computes interference = mean incongruent RT - mean congruent RT', () => {
    const results: TrialResult[] = [
      // Congruent correct: RT 400, 500 -> mean = 450
      makeResult(makeTrial({ congruent: true }), { correct: true, rt: 400, response: 'red' }),
      makeResult(makeTrial({ congruent: true }), { correct: true, rt: 500, response: 'red' }),
      // Incongruent correct: RT 600, 700 -> mean = 650
      makeResult(makeTrial({ congruent: false, inkColor: 'blue', wordColor: 'red' }), {
        correct: true,
        rt: 600,
        response: 'blue',
      }),
      makeResult(makeTrial({ congruent: false, inkColor: 'green', wordColor: 'blue' }), {
        correct: true,
        rt: 700,
        response: 'green',
      }),
    ];
    // Interference = 650 - 450 = 200
    expect(computeInterference(results)).toBe(200);
  });

  it('returns 0 with no congruent trials', () => {
    const results: TrialResult[] = [
      makeResult(makeTrial({ congruent: false, inkColor: 'blue', wordColor: 'red' }), {
        correct: true,
        rt: 600,
        response: 'blue',
      }),
    ];
    expect(computeInterference(results)).toBe(0);
  });

  it('returns 0 with no incongruent trials', () => {
    const results: TrialResult[] = [
      makeResult(makeTrial({ congruent: true }), { correct: true, rt: 400, response: 'red' }),
    ];
    expect(computeInterference(results)).toBe(0);
  });

  it('excludes timed-out trials', () => {
    const results: TrialResult[] = [
      makeResult(makeTrial({ congruent: true }), { correct: true, rt: 400, response: 'red' }),
      makeResult(makeTrial({ congruent: true }), { correct: false, rt: 2500, timedOut: true }),
      makeResult(makeTrial({ congruent: false, inkColor: 'blue', wordColor: 'red' }), {
        correct: true,
        rt: 600,
        response: 'blue',
      }),
    ];
    // Only non-timed-out correct: congruent [400], incongruent [600]
    expect(computeInterference(results)).toBe(200);
  });

  it('excludes incorrect trials from interference calc', () => {
    const results: TrialResult[] = [
      makeResult(makeTrial({ congruent: true }), { correct: true, rt: 400, response: 'red' }),
      makeResult(makeTrial({ congruent: true }), { correct: false, rt: 200, response: 'blue' }),
      makeResult(makeTrial({ congruent: false, inkColor: 'blue', wordColor: 'red' }), {
        correct: true,
        rt: 600,
        response: 'blue',
      }),
    ];
    // Correct only: congruent [400], incongruent [600]
    expect(computeInterference(results)).toBe(200);
  });

  it('stroop-flex only includes ink-rule trials for interference', () => {
    const results: TrialResult[] = [
      // ink-rule congruent: RT 400
      makeResult(makeTrial({ congruent: true, rule: 'ink' }), {
        correct: true,
        rt: 400,
        response: 'red',
      }),
      // word-rule congruent: RT 100 (should be excluded)
      makeResult(makeTrial({ congruent: true, rule: 'word' }), {
        correct: true,
        rt: 100,
        response: 'red',
      }),
      // ink-rule incongruent: RT 600
      makeResult(makeTrial({ congruent: false, inkColor: 'blue', wordColor: 'red', rule: 'ink' }), {
        correct: true,
        rt: 600,
        response: 'blue',
      }),
    ];
    expect(computeInterference(results, 'stroop-flex')).toBe(200);
  });

  it('negative interference (faster incongruent) is possible', () => {
    const results: TrialResult[] = [
      makeResult(makeTrial({ congruent: true }), { correct: true, rt: 600, response: 'red' }),
      makeResult(makeTrial({ congruent: false, inkColor: 'blue', wordColor: 'red' }), {
        correct: true,
        rt: 400,
        response: 'blue',
      }),
    ];
    expect(computeInterference(results)).toBe(-200);
  });
});

// =============================================================================
// 6. Summary Computation
// =============================================================================

describe('Stroop — Summary', () => {
  it('computes accuracy correctly', () => {
    const results: TrialResult[] = [
      makeResult(makeTrial(), { correct: true, rt: 400, response: 'red' }),
      makeResult(makeTrial(), { correct: true, rt: 500, response: 'red' }),
      makeResult(makeTrial(), { correct: false, rt: 600, response: 'blue' }),
    ];
    const summary = computeSummary(results);
    expect(summary.accuracy).toBe(67); // 2/3
  });

  it('computes average RT excluding timed-out trials', () => {
    const results: TrialResult[] = [
      makeResult(makeTrial(), { correct: true, rt: 400, response: 'red' }),
      makeResult(makeTrial(), { correct: true, rt: 600, response: 'red' }),
      makeResult(makeTrial(), { correct: false, rt: 2500, timedOut: true }),
    ];
    const summary = computeSummary(results);
    expect(summary.avgRT).toBe(500); // (400+600)/2
  });

  it('counts word traps', () => {
    const incongruent = makeTrial({
      inkColor: 'blue',
      wordColor: 'red',
      congruent: false,
      rule: 'ink',
    });
    const results: TrialResult[] = [
      // Word trap: responded with word color
      makeResult(incongruent, { correct: false, rt: 400, response: 'red' }),
      // Not a word trap: responded with random color
      makeResult(incongruent, { correct: false, rt: 500, response: 'green' }),
      // Correct
      makeResult(incongruent, { correct: true, rt: 300, response: 'blue' }),
    ];
    const summary = computeSummary(results);
    expect(summary.wordTraps).toBe(1);
  });

  it('handles empty results', () => {
    const summary = computeSummary([]);
    expect(summary.totalTrials).toBe(0);
    expect(summary.accuracy).toBe(0);
    expect(summary.avgRT).toBe(0);
    expect(summary.congruencyEffect).toBe(0);
    expect(summary.wordTraps).toBe(0);
  });

  it('handles all congruent (no interference computable)', () => {
    const results: TrialResult[] = [
      makeResult(makeTrial({ congruent: true }), { correct: true, rt: 400, response: 'red' }),
      makeResult(makeTrial({ congruent: true }), { correct: true, rt: 500, response: 'red' }),
    ];
    const summary = computeSummary(results);
    expect(summary.congruencyEffect).toBe(0);
    expect(summary.accuracy).toBe(100);
  });

  it('handles all incongruent (no interference computable)', () => {
    const trial = makeTrial({ congruent: false, inkColor: 'blue', wordColor: 'red' });
    const results: TrialResult[] = [
      makeResult(trial, { correct: true, rt: 600, response: 'blue' }),
      makeResult(trial, { correct: true, rt: 700, response: 'blue' }),
    ];
    const summary = computeSummary(results);
    expect(summary.congruencyEffect).toBe(0);
  });

  it('handles all timed out', () => {
    const results: TrialResult[] = [
      makeResult(makeTrial(), { correct: false, rt: 2500, timedOut: true }),
      makeResult(makeTrial(), { correct: false, rt: 2500, timedOut: true }),
    ];
    const summary = computeSummary(results);
    expect(summary.accuracy).toBe(0);
    expect(summary.avgRT).toBe(0); // no non-timed-out trials
  });
});
