import { describe, it, expect } from 'bun:test';
import {
  type AntisaccadeTrial,
  type AntisaccadeTrialResult,
  generateTrials,
  getTargetSide,
  isCorrectResponse,
  evaluateTrial,
  computeSummary,
} from './antisaccade';

// =============================================================================
// Helpers
// =============================================================================

function makeTrial(
  condition: 'pro' | 'anti',
  cueSide: 'left' | 'right' = 'left',
  arrowDir: 'left' | 'right' = 'right',
): AntisaccadeTrial {
  return { condition, cueSide, arrowDir };
}

function makeResult(
  condition: 'pro' | 'anti',
  correct: boolean,
  rt: number,
  opts: {
    cueSide?: 'left' | 'right';
    arrowDir?: 'left' | 'right';
    response?: 'left' | 'right' | null;
  } = {},
): AntisaccadeTrialResult {
  const cueSide = opts.cueSide ?? 'left';
  const arrowDir = opts.arrowDir ?? 'right';
  const targetSide = getTargetSide(condition, cueSide);
  const response = opts.response ?? (correct ? arrowDir : null);
  return {
    trialIndex: 0,
    condition,
    cueSide,
    targetSide,
    arrowDir,
    response,
    correct,
    responseTimeMs: rt,
  };
}

// =============================================================================
// 1. Trial generation
// =============================================================================

describe('Antisaccade — Trial generation', () => {
  it('generates the correct number of trials', () => {
    const trials = generateTrials(24);
    expect(trials).toHaveLength(24);
  });

  it('has 50% pro and 50% anti trials', () => {
    const trials = generateTrials(24);
    const proCount = trials.filter((t) => t.condition === 'pro').length;
    const antiCount = trials.filter((t) => t.condition === 'anti').length;
    expect(proCount).toBe(12);
    expect(antiCount).toBe(12);
  });

  it('handles odd trial counts (floor for pro)', () => {
    const trials = generateTrials(11);
    const proCount = trials.filter((t) => t.condition === 'pro').length;
    const antiCount = trials.filter((t) => t.condition === 'anti').length;
    expect(proCount).toBe(5);
    expect(antiCount).toBe(6);
  });

  it('trials are shuffled', () => {
    let foundMixed = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      const trials = generateTrials(24);
      const first6 = trials.slice(0, 6).map((t) => t.condition);
      if (first6.includes('pro') && first6.includes('anti')) {
        foundMixed = true;
        break;
      }
    }
    expect(foundMixed).toBe(true);
  });

  it('uses provided RNG for reproducibility', () => {
    let seed = 42;
    const rng = () => {
      seed = (seed * 16807 + 0) % 2147483647;
      return seed / 2147483647;
    };
    const a = generateTrials(10, rng);

    seed = 42;
    const b = generateTrials(10, rng);
    expect(a).toEqual(b);
  });

  it('each trial has a valid cueSide and arrowDir', () => {
    const trials = generateTrials(30);
    for (const t of trials) {
      expect(['left', 'right']).toContain(t.cueSide);
      expect(['left', 'right']).toContain(t.arrowDir);
    }
  });
});

// =============================================================================
// 2. Target side logic
// =============================================================================

describe('Antisaccade — getTargetSide', () => {
  it('pro-saccade: target on SAME side as cue', () => {
    expect(getTargetSide('pro', 'left')).toBe('left');
    expect(getTargetSide('pro', 'right')).toBe('right');
  });

  it('anti-saccade: target on OPPOSITE side of cue', () => {
    expect(getTargetSide('anti', 'left')).toBe('right');
    expect(getTargetSide('anti', 'right')).toBe('left');
  });
});

// =============================================================================
// 3. Response evaluation
// =============================================================================

describe('Antisaccade — isCorrectResponse', () => {
  it('correct when response matches arrow direction', () => {
    expect(isCorrectResponse('left', 'left')).toBe(true);
    expect(isCorrectResponse('right', 'right')).toBe(true);
  });

  it('incorrect when response does not match', () => {
    expect(isCorrectResponse('left', 'right')).toBe(false);
    expect(isCorrectResponse('right', 'left')).toBe(false);
  });

  it('null response (timeout) is always incorrect', () => {
    expect(isCorrectResponse('left', null)).toBe(false);
    expect(isCorrectResponse('right', null)).toBe(false);
  });
});

describe('Antisaccade — evaluateTrial', () => {
  it('builds correct result for a pro trial with correct response', () => {
    const trial = makeTrial('pro', 'left', 'right');
    const result = evaluateTrial(trial, 3, 'right', 350);
    expect(result.condition).toBe('pro');
    expect(result.targetSide).toBe('left'); // same as cue
    expect(result.correct).toBe(true);
    expect(result.responseTimeMs).toBe(350);
    expect(result.trialIndex).toBe(3);
  });

  it('builds correct result for an anti trial with wrong response', () => {
    const trial = makeTrial('anti', 'left', 'right');
    const result = evaluateTrial(trial, 0, 'left', 500);
    expect(result.condition).toBe('anti');
    expect(result.targetSide).toBe('right'); // opposite of cue
    expect(result.correct).toBe(false);
  });

  it('handles timeout (null response)', () => {
    const trial = makeTrial('anti', 'right', 'left');
    const result = evaluateTrial(trial, 5, null, 1500);
    expect(result.correct).toBe(false);
    expect(result.response).toBeNull();
  });
});

// =============================================================================
// 4. Summary computation
// =============================================================================

describe('Antisaccade — computeSummary', () => {
  it('returns correct accuracy for all-correct session', () => {
    const results: AntisaccadeTrialResult[] = [
      makeResult('pro', true, 300, { response: 'right' }),
      makeResult('pro', true, 320, { response: 'right' }),
      makeResult('anti', true, 450, { response: 'right' }),
      makeResult('anti', true, 480, { response: 'right' }),
    ];
    const summary = computeSummary(results);
    expect(summary.accuracy).toBe(100);
    expect(summary.correctTrials).toBe(4);
    expect(summary.proAccuracy).toBe(100);
    expect(summary.antiAccuracy).toBe(100);
  });

  it('computes antisaccade cost correctly', () => {
    const results: AntisaccadeTrialResult[] = [
      makeResult('pro', true, 300, { response: 'right' }),
      makeResult('pro', true, 400, { response: 'right' }),
      makeResult('anti', true, 500, { response: 'right' }),
      makeResult('anti', true, 600, { response: 'right' }),
    ];
    const summary = computeSummary(results);
    // meanProRt = 350, meanAntiRt = 550
    expect(summary.meanProRt).toBe(350);
    expect(summary.meanAntiRt).toBe(550);
    expect(summary.antisaccadeCost).toBe(200);
  });

  it('computes error rates', () => {
    const results: AntisaccadeTrialResult[] = [
      makeResult('pro', true, 300, { response: 'right' }),
      makeResult('pro', false, 400, { response: 'left' }),
      makeResult('anti', true, 500, { response: 'right' }),
      makeResult('anti', false, 600, { response: 'left' }),
      makeResult('anti', false, 700, { response: 'left' }),
    ];
    const summary = computeSummary(results);
    expect(summary.proErrorRate).toBe(50); // 1 of 2
    expect(summary.antiErrorRate).toBe(67); // 2 of 3
  });

  it('counts timeout trials', () => {
    const results: AntisaccadeTrialResult[] = [
      makeResult('pro', false, 1500, { response: null }),
      makeResult('anti', false, 1500, { response: null }),
      makeResult('pro', true, 300, { response: 'right' }),
    ];
    const summary = computeSummary(results);
    expect(summary.timeoutCount).toBe(2);
  });

  it('handles empty results', () => {
    const summary = computeSummary([]);
    expect(summary.accuracy).toBe(0);
    expect(summary.totalTrials).toBe(0);
    expect(summary.antisaccadeCost).toBe(0);
    expect(summary.meanProRt).toBe(0);
    expect(summary.meanAntiRt).toBe(0);
  });

  it('returns correct trial counts', () => {
    const results: AntisaccadeTrialResult[] = [
      makeResult('pro', true, 300, { response: 'right' }),
      makeResult('pro', true, 350, { response: 'right' }),
      makeResult('anti', true, 500, { response: 'right' }),
    ];
    const summary = computeSummary(results);
    expect(summary.proTrialCount).toBe(2);
    expect(summary.antiTrialCount).toBe(1);
  });

  it('only uses correct-trial RTs for mean calculation', () => {
    const results: AntisaccadeTrialResult[] = [
      makeResult('pro', true, 300, { response: 'right' }),
      makeResult('pro', false, 9999, { response: 'left' }), // wrong — excluded
      makeResult('anti', true, 500, { response: 'right' }),
      makeResult('anti', false, 8888, { response: 'left' }), // wrong — excluded
    ];
    const summary = computeSummary(results);
    expect(summary.meanProRt).toBe(300);
    expect(summary.meanAntiRt).toBe(500);
  });

  it('handles session with only pro trials', () => {
    const results: AntisaccadeTrialResult[] = [
      makeResult('pro', true, 300, { response: 'right' }),
      makeResult('pro', true, 400, { response: 'right' }),
    ];
    const summary = computeSummary(results);
    expect(summary.proAccuracy).toBe(100);
    expect(summary.antiAccuracy).toBe(0);
    expect(summary.antiTrialCount).toBe(0);
    expect(summary.antisaccadeCost).toBe(-350); // 0 - 350
  });

  it('handles session with only anti trials', () => {
    const results: AntisaccadeTrialResult[] = [
      makeResult('anti', true, 500, { response: 'right' }),
      makeResult('anti', true, 600, { response: 'right' }),
    ];
    const summary = computeSummary(results);
    expect(summary.antiAccuracy).toBe(100);
    expect(summary.proAccuracy).toBe(0);
    expect(summary.proTrialCount).toBe(0);
  });
});
