import { describe, expect, it } from 'bun:test';
import {
  type PosnerTrial,
  type PosnerTrialResult,
  TARGET_TIMEOUT_MS,
  deriveTargetSide,
  generateTrials,
  evaluateResponse,
  computeSummary,
} from './posner-cueing';

// =============================================================================
// deriveTargetSide
// =============================================================================

describe('deriveTargetSide', () => {
  it('returns cued side for valid trials', () => {
    expect(deriveTargetSide('left', 'valid')).toBe('left');
    expect(deriveTargetSide('right', 'valid')).toBe('right');
  });

  it('returns opposite side for invalid trials', () => {
    expect(deriveTargetSide('left', 'invalid')).toBe('right');
    expect(deriveTargetSide('right', 'invalid')).toBe('left');
  });
});

// =============================================================================
// generateTrials
// =============================================================================

describe('generateTrials', () => {
  it('generates the requested number of trials', () => {
    const trials = generateTrials(30);
    expect(trials).toHaveLength(30);
  });

  it('respects valid probability of 0.8 approximately', () => {
    // Use a large sample for statistical stability
    const trials = generateTrials(1000);
    const validCount = trials.filter((t) => t.validity === 'valid').length;
    // Should be roughly 80% +/- 5%
    expect(validCount).toBeGreaterThan(700);
    expect(validCount).toBeLessThan(900);
  });

  it('with deterministic rng produces consistent output', () => {
    let i = 0;
    const values = [0.3, 0.2, 0.7, 0.9, 0.1, 0.5]; // cueSide, validity pairs
    const rng = () => values[i++ % values.length]!;
    const trials = generateTrials(3, 0.8, rng);

    // First trial: rng()=0.3 < 0.5 → left, rng()=0.2 < 0.8 → valid → target=left
    expect(trials[0]).toEqual({
      cueSide: 'left',
      validity: 'valid',
      targetSide: 'left',
    });
    // Second trial: rng()=0.7 >= 0.5 → right, rng()=0.9 >= 0.8 → invalid → target=left
    expect(trials[1]).toEqual({
      cueSide: 'right',
      validity: 'invalid',
      targetSide: 'left',
    });
  });

  it('generates both left and right cue sides', () => {
    const trials = generateTrials(100);
    const leftCues = trials.filter((t) => t.cueSide === 'left');
    const rightCues = trials.filter((t) => t.cueSide === 'right');
    expect(leftCues.length).toBeGreaterThan(0);
    expect(rightCues.length).toBeGreaterThan(0);
  });

  it('valid probability of 1.0 produces all valid trials', () => {
    const trials = generateTrials(20, 1.0);
    expect(trials.every((t) => t.validity === 'valid')).toBe(true);
  });

  it('valid probability of 0.0 produces all invalid trials', () => {
    const trials = generateTrials(20, 0.0);
    expect(trials.every((t) => t.validity === 'invalid')).toBe(true);
  });

  it('target side is always consistent with cue side and validity', () => {
    const trials = generateTrials(100);
    for (const trial of trials) {
      if (trial.validity === 'valid') {
        expect(trial.targetSide).toBe(trial.cueSide);
      } else {
        expect(trial.targetSide).not.toBe(trial.cueSide);
      }
    }
  });
});

// =============================================================================
// evaluateResponse
// =============================================================================

describe('evaluateResponse', () => {
  const validLeftTrial: PosnerTrial = {
    cueSide: 'left',
    validity: 'valid',
    targetSide: 'left',
  };
  const invalidLeftTrial: PosnerTrial = {
    cueSide: 'right',
    validity: 'invalid',
    targetSide: 'left',
  };

  it('marks correct response as correct', () => {
    const result = evaluateResponse(validLeftTrial, 'left', 350);
    expect(result.correct).toBe(true);
    expect(result.rt).toBe(350);
    expect(result.timedOut).toBe(false);
  });

  it('marks wrong response as incorrect', () => {
    const result = evaluateResponse(validLeftTrial, 'right', 400);
    expect(result.correct).toBe(false);
    expect(result.timedOut).toBe(false);
  });

  it('marks timeout (null response) as incorrect', () => {
    const result = evaluateResponse(validLeftTrial, null, 0);
    expect(result.correct).toBe(false);
    expect(result.timedOut).toBe(true);
    expect(result.rt).toBe(TARGET_TIMEOUT_MS);
  });

  it('handles invalid trial correctly — target is on opposite side', () => {
    // invalidLeftTrial has targetSide=left (cue was right, but invalid)
    const result = evaluateResponse(invalidLeftTrial, 'left', 420);
    expect(result.correct).toBe(true);
  });

  it('preserves trial reference in result', () => {
    const result = evaluateResponse(validLeftTrial, 'left', 300);
    expect(result.trial).toBe(validLeftTrial);
  });
});

// =============================================================================
// computeSummary
// =============================================================================

describe('computeSummary', () => {
  function makeResult(
    validity: 'valid' | 'invalid',
    correct: boolean,
    rt: number,
  ): PosnerTrialResult {
    const cueSide = 'left' as const;
    const trial: PosnerTrial = {
      cueSide,
      validity,
      targetSide: validity === 'valid' ? cueSide : 'right',
    };
    return {
      trial,
      response: correct ? trial.targetSide : trial.targetSide === 'left' ? 'right' : 'left',
      correct,
      rt,
      timedOut: false,
    };
  }

  it('computes cueing effect as meanInvalidRt - meanValidRt', () => {
    const results: PosnerTrialResult[] = [
      makeResult('valid', true, 300),
      makeResult('valid', true, 320),
      makeResult('invalid', true, 400),
      makeResult('invalid', true, 420),
    ];
    const summary = computeSummary(results);
    // meanValid = 310, meanInvalid = 410
    expect(summary.cueingEffect).toBe(100);
  });

  it('computes accuracy as percentage', () => {
    const results: PosnerTrialResult[] = [
      makeResult('valid', true, 300),
      makeResult('valid', true, 310),
      makeResult('valid', false, 800),
      makeResult('invalid', true, 400),
    ];
    const summary = computeSummary(results);
    expect(summary.accuracy).toBe(75); // 3/4
  });

  it('computes per-condition accuracy', () => {
    const results: PosnerTrialResult[] = [
      makeResult('valid', true, 300),
      makeResult('valid', false, 800),
      makeResult('invalid', true, 400),
      makeResult('invalid', true, 420),
    ];
    const summary = computeSummary(results);
    expect(summary.validAccuracy).toBe(50);
    expect(summary.invalidAccuracy).toBe(100);
  });

  it('counts valid and invalid trials', () => {
    const results: PosnerTrialResult[] = [
      makeResult('valid', true, 300),
      makeResult('valid', true, 310),
      makeResult('valid', true, 320),
      makeResult('invalid', true, 400),
    ];
    const summary = computeSummary(results);
    expect(summary.validTrials).toBe(3);
    expect(summary.invalidTrials).toBe(1);
  });

  it('handles empty results', () => {
    const summary = computeSummary([]);
    expect(summary.totalTrials).toBe(0);
    expect(summary.accuracy).toBe(0);
    expect(summary.cueingEffect).toBe(0);
    expect(summary.meanValidRt).toBe(0);
    expect(summary.meanInvalidRt).toBe(0);
  });

  it('excludes incorrect trials from RT averages', () => {
    const results: PosnerTrialResult[] = [
      makeResult('valid', true, 300),
      makeResult('valid', false, 9999), // should not contribute to valid RT
      makeResult('invalid', true, 400),
    ];
    const summary = computeSummary(results);
    expect(summary.meanValidRt).toBe(300); // only the correct trial
  });

  it('excludes timed-out trials from RT averages', () => {
    const validTrial: PosnerTrial = {
      cueSide: 'left',
      validity: 'valid',
      targetSide: 'left',
    };
    const results: PosnerTrialResult[] = [
      makeResult('valid', true, 300),
      {
        trial: validTrial,
        response: null,
        correct: false,
        rt: TARGET_TIMEOUT_MS,
        timedOut: true,
      },
    ];
    const summary = computeSummary(results);
    expect(summary.meanValidRt).toBe(300);
  });

  it('typical Posner result shows positive cueing effect', () => {
    // Build a realistic session: valid faster, invalid slower
    const results: PosnerTrialResult[] = [];
    for (let i = 0; i < 24; i++) {
      results.push(makeResult('valid', true, 280 + (i % 5) * 10));
    }
    for (let i = 0; i < 6; i++) {
      results.push(makeResult('invalid', true, 380 + (i % 3) * 10));
    }
    const summary = computeSummary(results);
    expect(summary.cueingEffect).toBeGreaterThan(0);
    expect(summary.totalTrials).toBe(30);
  });
});
