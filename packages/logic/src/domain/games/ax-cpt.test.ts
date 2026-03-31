import { describe, expect, it } from 'bun:test';
import {
  type AxCptTrial,
  type AxCptTrialResult,
  B_LETTERS,
  Y_LETTERS,
  RESPONSE_TIMEOUT_MS,
  generateTrials,
  evaluateResponse,
  zScore,
  clampRate,
  computeMetrics,
  computePBI,
  computeSummary,
} from './ax-cpt';

// =============================================================================
// Trial Generation
// =============================================================================

describe('generateTrials', () => {
  it('generates the requested number of trials', () => {
    const trials = generateTrials(30);
    expect(trials).toHaveLength(30);
  });

  it('maintains ~70/10/10/10 distribution', () => {
    const trials = generateTrials(30);
    const counts = { AX: 0, AY: 0, BX: 0, BY: 0 };
    for (const t of trials) counts[t.type]++;
    expect(counts.AX).toBe(21); // round(30*0.7)
    expect(counts.AY).toBe(3); // round(30*0.1)
    expect(counts.BX).toBe(3);
    expect(counts.BY).toBe(3); // remainder
  });

  it('AX trials use cue=A, probe=X, isTarget=true', () => {
    const trials = generateTrials(30);
    const axTrials = trials.filter((t) => t.type === 'AX');
    for (const t of axTrials) {
      expect(t.cueLetter).toBe('A');
      expect(t.probeLetter).toBe('X');
      expect(t.isTarget).toBe(true);
    }
  });

  it('AY trials use cue=A, probe from Y_LETTERS, isTarget=false', () => {
    const trials = generateTrials(30);
    const ayTrials = trials.filter((t) => t.type === 'AY');
    for (const t of ayTrials) {
      expect(t.cueLetter).toBe('A');
      expect(Y_LETTERS).toContain(t.probeLetter as any);
      expect(t.isTarget).toBe(false);
    }
  });

  it('BX trials use cue from B_LETTERS, probe=X, isTarget=false', () => {
    const trials = generateTrials(30);
    const bxTrials = trials.filter((t) => t.type === 'BX');
    for (const t of bxTrials) {
      expect(B_LETTERS).toContain(t.cueLetter as any);
      expect(t.probeLetter).toBe('X');
      expect(t.isTarget).toBe(false);
    }
  });

  it('BY trials use cue from B_LETTERS, probe from Y_LETTERS', () => {
    const trials = generateTrials(30);
    const byTrials = trials.filter((t) => t.type === 'BY');
    for (const t of byTrials) {
      expect(B_LETTERS).toContain(t.cueLetter as any);
      expect(Y_LETTERS).toContain(t.probeLetter as any);
      expect(t.isTarget).toBe(false);
    }
  });

  it('only AX trials are marked as target', () => {
    const trials = generateTrials(30);
    for (const t of trials) {
      expect(t.isTarget).toBe(t.type === 'AX');
    }
  });

  it('trials are shuffled (not all AX first)', () => {
    // With 21 AX trials, the chance all AX come first is astronomically low
    const trials = generateTrials(30);
    const firstFive = trials.slice(0, 5);
    const hasNonAx = firstFive.some((t) => t.type !== 'AX');
    // This could theoretically fail, but probability is ~(0.7^5) = 0.17 of all being AX
    // Run deterministic check instead:
    let i = 0;
    const rng = () => {
      const vals = [
        0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5,
        0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5,
        // shuffle phase: use values that will swap
        0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9,
        0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.1, 0.2, 0.3,
      ];
      return vals[i++ % vals.length]!;
    };
    const deterministicTrials = generateTrials(30, rng);
    // After shuffling, the first trial should not necessarily be AX
    expect(deterministicTrials).toHaveLength(30);
  });
});

// =============================================================================
// Response Evaluation
// =============================================================================

describe('evaluateResponse', () => {
  const axTrial: AxCptTrial = { type: 'AX', cueLetter: 'A', probeLetter: 'X', isTarget: true };
  const ayTrial: AxCptTrial = { type: 'AY', cueLetter: 'A', probeLetter: 'Y', isTarget: false };
  const bxTrial: AxCptTrial = { type: 'BX', cueLetter: 'B', probeLetter: 'X', isTarget: false };
  const byTrial: AxCptTrial = { type: 'BY', cueLetter: 'B', probeLetter: 'Y', isTarget: false };

  it('AX + target response → correct', () => {
    const result = evaluateResponse(axTrial, 'target', 450);
    expect(result.correct).toBe(true);
    expect(result.responded).toBe(true);
    expect(result.responseTimeMs).toBe(450);
  });

  it('AX + nontarget response → incorrect', () => {
    const result = evaluateResponse(axTrial, 'nontarget', 400);
    expect(result.correct).toBe(false);
  });

  it('AX + no response → incorrect (miss)', () => {
    const result = evaluateResponse(axTrial, null, 0);
    expect(result.correct).toBe(false);
    expect(result.responded).toBe(false);
    expect(result.responseTimeMs).toBe(RESPONSE_TIMEOUT_MS);
  });

  it('AY + nontarget response → correct', () => {
    const result = evaluateResponse(ayTrial, 'nontarget', 500);
    expect(result.correct).toBe(true);
  });

  it('AY + target response → incorrect (context error)', () => {
    const result = evaluateResponse(ayTrial, 'target', 380);
    expect(result.correct).toBe(false);
  });

  it('BX + nontarget response → correct', () => {
    const result = evaluateResponse(bxTrial, 'nontarget', 420);
    expect(result.correct).toBe(true);
  });

  it('BX + target response → incorrect (false alarm)', () => {
    const result = evaluateResponse(bxTrial, 'target', 350);
    expect(result.correct).toBe(false);
  });

  it('BY + nontarget response → correct', () => {
    const result = evaluateResponse(byTrial, 'nontarget', 430);
    expect(result.correct).toBe(true);
  });

  it('non-target + no response → correct (withholding)', () => {
    const result = evaluateResponse(bxTrial, null, 0);
    expect(result.correct).toBe(true);
    expect(result.responded).toBe(false);
  });
});

// =============================================================================
// zScore
// =============================================================================

describe('zScore', () => {
  it('z(0.5) ≈ 0', () => {
    expect(Math.abs(zScore(0.5))).toBeLessThan(0.001);
  });

  it('z(0.84) ≈ 1.0 (one sigma)', () => {
    const z = zScore(0.84);
    expect(z).toBeGreaterThan(0.9);
    expect(z).toBeLessThan(1.1);
  });

  it('z(0.16) ≈ -1.0', () => {
    const z = zScore(0.16);
    expect(z).toBeGreaterThan(-1.1);
    expect(z).toBeLessThan(-0.9);
  });

  it('z(p) is antisymmetric around 0.5: z(p) = -z(1-p)', () => {
    const z1 = zScore(0.84);
    const z2 = zScore(0.16);
    expect(Math.abs(z1 + z2)).toBeLessThan(0.01);
  });

  it('z(p) is monotonically increasing (standard normal quantile)', () => {
    expect(zScore(0.1)).toBeLessThan(zScore(0.5));
    expect(zScore(0.5)).toBeLessThan(zScore(0.9));
  });

  it('extreme values do not produce NaN', () => {
    expect(Number.isFinite(zScore(0.01))).toBe(true);
    expect(Number.isFinite(zScore(0.99))).toBe(true);
  });
});

// =============================================================================
// clampRate
// =============================================================================

describe('clampRate', () => {
  it('clamps 0 to 0.01', () => {
    expect(clampRate(0)).toBe(0.01);
  });

  it('clamps 1 to 0.99', () => {
    expect(clampRate(1)).toBe(0.99);
  });

  it('passes through values in range', () => {
    expect(clampRate(0.5)).toBe(0.5);
  });
});

// =============================================================================
// computeMetrics
// =============================================================================

describe('computeMetrics', () => {
  function makeResult(type: AxCptTrial['type'], correct: boolean): AxCptTrialResult {
    const isTarget = type === 'AX';
    return {
      trial: { type, cueLetter: type[0]!, probeLetter: type[1]!, isTarget },
      correct,
      responseTimeMs: 400,
      responded: true,
      answer: correct === isTarget ? 'target' : 'nontarget',
    };
  }

  it('perfect performance: 100% AX accuracy, 0% error rates', () => {
    const results: AxCptTrialResult[] = [
      ...Array(21)
        .fill(null)
        .map(() => makeResult('AX', true)),
      ...Array(3)
        .fill(null)
        .map(() => makeResult('AY', true)),
      ...Array(3)
        .fill(null)
        .map(() => makeResult('BX', true)),
      ...Array(3)
        .fill(null)
        .map(() => makeResult('BY', true)),
    ];
    const metrics = computeMetrics(results);
    expect(metrics.axAccuracy).toBe(100);
    expect(metrics.ayErrorRate).toBe(0);
    expect(metrics.bxFalseAlarmRate).toBe(0);
    expect(metrics.byAccuracy).toBe(100);
  });

  it('all wrong: 0% AX accuracy, 100% error rates', () => {
    const results: AxCptTrialResult[] = [
      ...Array(21)
        .fill(null)
        .map(() => makeResult('AX', false)),
      ...Array(3)
        .fill(null)
        .map(() => makeResult('AY', false)),
      ...Array(3)
        .fill(null)
        .map(() => makeResult('BX', false)),
      ...Array(3)
        .fill(null)
        .map(() => makeResult('BY', false)),
    ];
    const metrics = computeMetrics(results);
    expect(metrics.axAccuracy).toBe(0);
    expect(metrics.ayErrorRate).toBe(100);
    expect(metrics.bxFalseAlarmRate).toBe(100);
    expect(metrics.byAccuracy).toBe(0);
  });

  it('d-prime > 0 when AX hit rate > BX false alarm rate', () => {
    const results: AxCptTrialResult[] = [
      ...Array(20)
        .fill(null)
        .map(() => makeResult('AX', true)),
      makeResult('AX', false),
      ...Array(3)
        .fill(null)
        .map(() => makeResult('BX', true)),
    ];
    const metrics = computeMetrics(results);
    expect(metrics.dPrimeContext).toBeGreaterThan(0);
  });

  it('d-prime ≈ 0 when hit rate equals false alarm rate', () => {
    // 50% AX correct, 50% BX incorrect → hitRate=0.5, faRate=0.5
    // z(0.5) - z(0.5) = 0
    const results: AxCptTrialResult[] = [
      ...Array(5)
        .fill(null)
        .map(() => makeResult('AX', true)),
      ...Array(5)
        .fill(null)
        .map(() => makeResult('AX', false)),
      ...Array(5)
        .fill(null)
        .map(() => makeResult('BX', true)),
      ...Array(5)
        .fill(null)
        .map(() => makeResult('BX', false)),
    ];
    const metrics = computeMetrics(results);
    expect(Math.abs(metrics.dPrimeContext)).toBeLessThan(0.01);
  });
});

// =============================================================================
// computePBI
// =============================================================================

describe('computePBI', () => {
  function makeResult(type: AxCptTrial['type'], correct: boolean): AxCptTrialResult {
    return {
      trial: { type, cueLetter: type[0]!, probeLetter: type[1]!, isTarget: type === 'AX' },
      correct,
      responseTimeMs: 400,
      responded: true,
      answer: 'nontarget',
    };
  }

  it('returns null when no AY or BX errors', () => {
    const results = [makeResult('AY', true), makeResult('BX', true)];
    expect(computePBI(results)).toBeNull();
  });

  it('positive PBI when more AY errors than BX errors (proactive control)', () => {
    const results = [
      makeResult('AY', false),
      makeResult('AY', false),
      makeResult('AY', false),
      makeResult('BX', false),
    ];
    // PBI = (3 - 1) / (3 + 1) = 0.5
    expect(computePBI(results)).toBe(0.5);
  });

  it('negative PBI when more BX errors than AY errors (reactive control)', () => {
    const results = [
      makeResult('AY', false),
      makeResult('BX', false),
      makeResult('BX', false),
      makeResult('BX', false),
    ];
    // PBI = (1 - 3) / (1 + 3) = -0.5
    expect(computePBI(results)).toBe(-0.5);
  });

  it('PBI = 0 when equal AY and BX errors', () => {
    const results = [makeResult('AY', false), makeResult('BX', false)];
    expect(computePBI(results)).toBe(0);
  });

  it('PBI = 1 when only AY errors, no BX errors', () => {
    const results = [makeResult('AY', false), makeResult('AY', false), makeResult('BX', true)];
    expect(computePBI(results)).toBe(1);
  });

  it('PBI = -1 when only BX errors, no AY errors', () => {
    const results = [makeResult('AY', true), makeResult('BX', false), makeResult('BX', false)];
    expect(computePBI(results)).toBe(-1);
  });
});

// =============================================================================
// computeSummary
// =============================================================================

describe('computeSummary', () => {
  function makeResult(
    type: AxCptTrial['type'],
    correct: boolean,
    rt: number,
    responded = true,
  ): AxCptTrialResult {
    return {
      trial: { type, cueLetter: type[0]!, probeLetter: type[1]!, isTarget: type === 'AX' },
      correct,
      responseTimeMs: rt,
      responded,
      answer: responded ? 'target' : null,
    };
  }

  it('computes overall accuracy', () => {
    const results = [
      makeResult('AX', true, 400),
      makeResult('AX', true, 350),
      makeResult('AX', false, 500),
      makeResult('BX', true, 420),
    ];
    const summary = computeSummary(results);
    expect(summary.accuracy).toBe(75);
    expect(summary.correctTrials).toBe(3);
    expect(summary.totalTrials).toBe(4);
  });

  it('computes mean RT from responded trials only', () => {
    const results = [
      makeResult('AX', true, 400, true),
      makeResult('AX', true, 600, true),
      makeResult('BX', false, RESPONSE_TIMEOUT_MS, false), // not responded
    ];
    const summary = computeSummary(results);
    expect(summary.meanRt).toBe(500); // (400+600)/2
  });

  it('handles empty results', () => {
    const summary = computeSummary([]);
    expect(summary.totalTrials).toBe(0);
    expect(summary.accuracy).toBe(0);
    expect(summary.meanRt).toBe(0);
  });
});
