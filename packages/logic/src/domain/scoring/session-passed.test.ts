/**
 * Tests for session-passed.ts
 */

import { describe, expect, it } from 'bun:test';
import {
  calculateBWScore,
  calculateBWScoreFromModalities,
  checkJaeggiErrorsBelow,
  getJaeggiErrorsByModality,
  calculateTempoSessionPassed,
  calculatePlaceSessionPassed,
  calculateMemoSessionPassed,
  calculateDualPickSessionPassed,
  calculateTraceSessionPassed,
  calculateSessionPassed,
  detectScoringStrategy,
  extractThresholdsFromSpec,
  type ModalitySDTCounts,
} from './session-passed';

// Helpers
const createCounts = (
  hits: number,
  misses: number,
  falseAlarms: number,
  correctRejections = 0,
): ModalitySDTCounts => ({
  hits,
  misses,
  falseAlarms,
  correctRejections,
});

describe('calculateBWScore', () => {
  it('returns 0 when denominator is 0', () => {
    const counts = createCounts(0, 0, 0, 10);
    expect(calculateBWScore(counts)).toBe(0);
  });

  it('calculates H/(H+M+FA) formula', () => {
    // 8 hits, 1 miss, 1 FA → 8/10 = 0.8
    const counts = createCounts(8, 1, 1, 10);
    expect(calculateBWScore(counts)).toBe(0.8);
  });

  it('ignores correct rejections', () => {
    // CR should NOT affect score
    const countsLowCR = createCounts(8, 1, 1, 0);
    const countsHighCR = createCounts(8, 1, 1, 100);
    expect(calculateBWScore(countsLowCR)).toBe(calculateBWScore(countsHighCR));
  });

  it('returns 1 for perfect hits', () => {
    const counts = createCounts(10, 0, 0, 5);
    expect(calculateBWScore(counts)).toBe(1);
  });

  it('returns 0 for all misses/FA', () => {
    const counts = createCounts(0, 5, 5, 5);
    expect(calculateBWScore(counts)).toBe(0);
  });
});

describe('calculateBWScoreFromModalities', () => {
  it('aggregates across modalities', () => {
    const byModality = {
      position: createCounts(4, 1, 0),
      audio: createCounts(4, 0, 1),
    };
    // Total: 8H, 1M, 1FA → 8/10 = 0.8
    expect(calculateBWScoreFromModalities(byModality)).toBe(0.8);
  });

  it('returns 0 for empty', () => {
    expect(calculateBWScoreFromModalities({})).toBe(0);
  });
});

describe('checkJaeggiErrorsBelow', () => {
  it('returns true when all modalities below threshold', () => {
    const byModality = {
      position: createCounts(8, 1, 1), // 2 errors
      audio: createCounts(9, 0, 1), // 1 error
    };
    expect(checkJaeggiErrorsBelow(byModality, 3)).toBe(true);
  });

  it('returns false when any modality at threshold (Jaeggi 2008: "fewer than three" = 3 fails)', () => {
    const byModality = {
      position: createCounts(7, 2, 1), // 3 errors = at threshold, fails
      audio: createCounts(9, 0, 0),
    };
    expect(checkJaeggiErrorsBelow(byModality, 3)).toBe(false);
  });

  it('returns false when any modality above threshold', () => {
    const byModality = {
      position: createCounts(6, 3, 1), // 4 errors = above threshold (>= 3), fails
      audio: createCounts(9, 0, 0),
    };
    expect(checkJaeggiErrorsBelow(byModality, 3)).toBe(false);
  });

  it('uses default threshold of 3', () => {
    const good = { m: createCounts(10, 1, 1) }; // 2 errors (< 3, passes)
    const atThreshold = { m: createCounts(10, 2, 1) }; // 3 errors = at threshold (>= 3, fails)
    const bad = { m: createCounts(10, 3, 1) }; // 4 errors = above threshold (>= 3, fails)
    expect(checkJaeggiErrorsBelow(good)).toBe(true);
    expect(checkJaeggiErrorsBelow(atThreshold)).toBe(false);
    expect(checkJaeggiErrorsBelow(bad)).toBe(false);
  });
});

describe('getJaeggiErrorsByModality', () => {
  it('sums misses and FA per modality', () => {
    const byModality = {
      position: createCounts(8, 2, 1),
      audio: createCounts(9, 0, 3),
    };
    const errors = getJaeggiErrorsByModality(byModality);
    expect(errors['position']).toBe(3);
    expect(errors['audio']).toBe(3);
  });
});

describe('detectScoringStrategy', () => {
  it('detects dualnback-classic from dualnback keywords', () => {
    expect(detectScoringStrategy('dualnback', '')).toBe('dualnback-classic');
    expect(detectScoringStrategy('', 'dualnback_classic')).toBe('dualnback-classic');
  });

  it('detects brainworkshop', () => {
    expect(detectScoringStrategy('brainworkshop', '')).toBe('brainworkshop');
    expect(detectScoringStrategy('', 'BrainWorkshop')).toBe('brainworkshop');
  });

  it('defaults to sdt', () => {
    expect(detectScoringStrategy()).toBe('sdt');
    expect(detectScoringStrategy('custom', 'custom')).toBe('sdt');
  });
});

describe('extractThresholdsFromSpec', () => {
  it('returns undefined for missing spec', () => {
    expect(extractThresholdsFromSpec(undefined)).toBeUndefined();
  });

  it('returns undefined for spec without scoring', () => {
    expect(extractThresholdsFromSpec({})).toBeUndefined();
  });

  it('extracts sdt thresholds', () => {
    const spec = { scoring: { strategy: 'sdt', passThreshold: 1.8 } };
    expect(extractThresholdsFromSpec(spec as any)).toEqual({ sdtDPrimePass: 1.8 });
  });

  it('extracts dualnback-classic thresholds', () => {
    const spec = { scoring: { strategy: 'dualnback-classic', passThreshold: 2 } };
    expect(extractThresholdsFromSpec(spec as any)).toEqual({ jaeggiMaxErrors: 2 });
  });

  it('extracts brainworkshop thresholds', () => {
    const spec = { scoring: { strategy: 'brainworkshop', passThreshold: 0.85 } };
    expect(extractThresholdsFromSpec(spec as any)).toEqual({ bwRawScorePass: 0.85 });
  });

  it('extracts accuracy thresholds', () => {
    const spec = { scoring: { strategy: 'accuracy', passThreshold: 0.7 } };
    expect(extractThresholdsFromSpec(spec as any)).toEqual({ accuracyPass: 0.7 });
  });
});

describe('calculateTempoSessionPassed', () => {
  const byModality = {
    position: createCounts(8, 1, 1),
    audio: createCounts(8, 1, 1),
  };

  it('uses SDT strategy by default', () => {
    expect(calculateTempoSessionPassed({ byModality, globalDPrime: 1.5 })).toBe(true);
    expect(calculateTempoSessionPassed({ byModality, globalDPrime: 1.4 })).toBe(false);
  });

  it('uses custom threshold when provided', () => {
    expect(
      calculateTempoSessionPassed({
        byModality,
        globalDPrime: 1.2,
        thresholds: { sdtDPrimePass: 1.0 },
      }),
    ).toBe(true);
  });

  it('uses dualnback-classic strategy when detected', () => {
    const lowErrors = {
      position: createCounts(10, 1, 1), // 2 errors
      audio: createCounts(10, 1, 1),
    };
    expect(
      calculateTempoSessionPassed({
        generator: 'dualnback',
        byModality: lowErrors,
        globalDPrime: 0, // ignored for dualnback-classic
      }),
    ).toBe(true);
  });

  it('uses brainworkshop strategy when detected', () => {
    const good = {
      position: createCounts(8, 1, 1), // 0.8 score
      audio: createCounts(8, 1, 1),
    };
    expect(
      calculateTempoSessionPassed({
        generator: 'brainworkshop',
        byModality: good,
        globalDPrime: 0,
      }),
    ).toBe(true);
  });
});

describe('calculatePlaceSessionPassed', () => {
  it('uses default threshold of 0.8', () => {
    expect(calculatePlaceSessionPassed(0.8)).toBe(true);
    expect(calculatePlaceSessionPassed(0.79)).toBe(false);
  });

  it('uses custom threshold', () => {
    expect(calculatePlaceSessionPassed(0.7, { accuracyPass: 0.7 })).toBe(true);
  });
});

describe('calculateMemoSessionPassed', () => {
  it('uses default threshold of 0.8', () => {
    expect(calculateMemoSessionPassed(0.8)).toBe(true);
    expect(calculateMemoSessionPassed(0.79)).toBe(false);
  });
});

describe('calculateDualPickSessionPassed', () => {
  it('uses default threshold of 0.8', () => {
    expect(calculateDualPickSessionPassed(0.8)).toBe(true);
    expect(calculateDualPickSessionPassed(0.79)).toBe(false);
  });
});

describe('calculateTraceSessionPassed', () => {
  it('uses lower default threshold of 0.7', () => {
    expect(calculateTraceSessionPassed(0.7)).toBe(true);
    expect(calculateTraceSessionPassed(0.69)).toBe(false);
  });

  it('uses custom threshold', () => {
    expect(calculateTraceSessionPassed(0.6, { accuracyPass: 0.6 })).toBe(true);
  });
});

describe('calculateSessionPassed', () => {
  it('routes to correct calculator for tempo', () => {
    const byModality = { position: createCounts(8, 1, 1) };
    expect(calculateSessionPassed('tempo', { byModality, globalDPrime: 1.5 })).toBe(true);
  });

  it('routes to correct calculator for flow', () => {
    expect(calculateSessionPassed('flow', { accuracy: 0.8 })).toBe(true);
  });

  it('routes to correct calculator for recall', () => {
    expect(calculateSessionPassed('recall', { accuracy: 0.8 })).toBe(true);
  });

  it('routes to correct calculator for dual-pick', () => {
    expect(calculateSessionPassed('dual-pick', { accuracy: 0.8 })).toBe(true);
  });

  it('routes to correct calculator for trace', () => {
    expect(calculateSessionPassed('trace', { accuracy: 0.7 })).toBe(true);
  });

  it('returns false for unknown session type', () => {
    expect(calculateSessionPassed('unknown' as 'tempo', { accuracy: 1 })).toBe(false);
  });
});
