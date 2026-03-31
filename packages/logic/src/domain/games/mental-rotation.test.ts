import { describe, it, expect } from 'bun:test';
import {
  type MentalRotationTrial,
  type MentalRotationTrialResult,
  generateTrial,
  evaluateResponse,
  computeRtByAngle,
  computeRtSlope,
  foldAngle,
  computeSummary,
  ROTATION_ANGLES,
} from './mental-rotation';

// =============================================================================
// Helpers
// =============================================================================

function makeTrial(
  rotationDeg: number,
  correctIdx = 0,
  candidateTypes: ('match' | 'mirror' | 'distractor')[] = [
    'match',
    'mirror',
    'distractor',
    'distractor',
  ],
): MentalRotationTrial {
  return {
    trialIndex: 0,
    shapeIdx: 0,
    rotationDeg,
    correctCandidateIdx: correctIdx,
    candidateTypes,
  };
}

function makeResult(
  rotationDeg: number,
  correct: boolean,
  rt: number,
  selectedType: 'match' | 'mirror' | 'distractor' | 'timeout' = correct ? 'match' : 'mirror',
): MentalRotationTrialResult {
  return {
    trialIndex: 0,
    rotationDeg,
    selectedType,
    correct,
    responseTimeMs: rt,
  };
}

// =============================================================================
// 1. Trial generation
// =============================================================================

describe('Mental Rotation — generateTrial', () => {
  it('generates a trial with correct structure', () => {
    const trial = generateTrial(0, 10);
    expect(trial.trialIndex).toBe(0);
    expect(trial.shapeIdx).toBeGreaterThanOrEqual(0);
    expect(trial.shapeIdx).toBeLessThan(10);
    expect(ROTATION_ANGLES).toContain(trial.rotationDeg as any);
    expect(trial.candidateTypes).toHaveLength(4);
  });

  it('candidates contain exactly one match and one mirror', () => {
    const trial = generateTrial(0, 10);
    const matchCount = trial.candidateTypes.filter((t) => t === 'match').length;
    const mirrorCount = trial.candidateTypes.filter((t) => t === 'mirror').length;
    const distractorCount = trial.candidateTypes.filter((t) => t === 'distractor').length;
    expect(matchCount).toBe(1);
    expect(mirrorCount).toBe(1);
    expect(distractorCount).toBe(2);
  });

  it('correctCandidateIdx points to match', () => {
    for (let i = 0; i < 10; i++) {
      const trial = generateTrial(i, 10);
      expect(trial.candidateTypes[trial.correctCandidateIdx]).toBe('match');
    }
  });

  it('candidates are shuffled (not always in the same order)', () => {
    const positions = new Set<number>();
    for (let i = 0; i < 20; i++) {
      const trial = generateTrial(i, 10);
      positions.add(trial.correctCandidateIdx);
    }
    expect(positions.size).toBeGreaterThan(1);
  });

  it('uses provided RNG for reproducibility', () => {
    let seed = 42;
    const rng = () => {
      seed = (seed * 16807 + 0) % 2147483647;
      return seed / 2147483647;
    };
    const a = generateTrial(0, 10, rng);

    seed = 42;
    const b = generateTrial(0, 10, rng);
    expect(a).toEqual(b);
  });

  it('supports custom candidate count', () => {
    const trial = generateTrial(0, 10, Math.random, 6);
    expect(trial.candidateTypes).toHaveLength(6);
    expect(trial.candidateTypes.filter((t) => t === 'match')).toHaveLength(1);
    expect(trial.candidateTypes.filter((t) => t === 'mirror')).toHaveLength(1);
    expect(trial.candidateTypes.filter((t) => t === 'distractor')).toHaveLength(4);
  });
});

// =============================================================================
// 2. Response evaluation
// =============================================================================

describe('Mental Rotation — evaluateResponse', () => {
  it('correct when selecting match candidate', () => {
    const trial = makeTrial(120, 2);
    const result = evaluateResponse(trial, 2, 2500);
    expect(result.correct).toBe(true);
    expect(result.selectedType).toBe('distractor'); // candidateTypes[2] = 'distractor' in default, but correctIdx=2
    // Actually let's build a proper trial:
    const trial2 = makeTrial(120, 0); // match is at index 0
    const result2 = evaluateResponse(trial2, 0, 2500);
    expect(result2.correct).toBe(true);
    expect(result2.selectedType).toBe('match');
  });

  it('incorrect when selecting mirror candidate', () => {
    const trial = makeTrial(60, 0); // match at 0
    const result = evaluateResponse(trial, 1, 3000); // mirror at index 1
    expect(result.correct).toBe(false);
    expect(result.selectedType).toBe('mirror');
  });

  it('incorrect when selecting distractor', () => {
    const trial = makeTrial(180, 0);
    const result = evaluateResponse(trial, 2, 4000); // distractor at index 2
    expect(result.correct).toBe(false);
    expect(result.selectedType).toBe('distractor');
  });

  it('timeout produces selectedType="timeout"', () => {
    const trial = makeTrial(120, 0);
    const result = evaluateResponse(trial, null, 8000);
    expect(result.correct).toBe(false);
    expect(result.selectedType).toBe('timeout');
  });

  it('preserves rotation degree in result', () => {
    const trial = makeTrial(240, 0);
    const result = evaluateResponse(trial, 0, 1500);
    expect(result.rotationDeg).toBe(240);
  });
});

// =============================================================================
// 3. Angle folding
// =============================================================================

describe('Mental Rotation — foldAngle', () => {
  it('0 stays 0', () => expect(foldAngle(0)).toBe(0));
  it('60 stays 60', () => expect(foldAngle(60)).toBe(60));
  it('120 stays 120', () => expect(foldAngle(120)).toBe(120));
  it('180 stays 180', () => expect(foldAngle(180)).toBe(180));
  it('240 folds to 120', () => expect(foldAngle(240)).toBe(120));
  it('300 folds to 60', () => expect(foldAngle(300)).toBe(60));
  it('360 folds to 0', () => expect(foldAngle(360)).toBe(0));
  it('negative angle handled', () => expect(foldAngle(-60)).toBe(60));
});

// =============================================================================
// 4. RT by angle
// =============================================================================

describe('Mental Rotation — computeRtByAngle', () => {
  it('groups RTs by angle and computes mean', () => {
    const results: MentalRotationTrialResult[] = [
      makeResult(60, true, 2000),
      makeResult(60, true, 3000),
      makeResult(120, true, 4000),
    ];
    const byAngle = computeRtByAngle(results);
    expect(byAngle).toHaveLength(2);
    expect(byAngle[0]?.angle).toBe(60);
    expect(byAngle[0]?.avgRt).toBe(2500);
    expect(byAngle[0]?.count).toBe(2);
    expect(byAngle[1]?.angle).toBe(120);
    expect(byAngle[1]?.avgRt).toBe(4000);
  });

  it('excludes timeout trials', () => {
    const results: MentalRotationTrialResult[] = [
      makeResult(60, true, 2000),
      makeResult(60, false, 8000, 'timeout'),
    ];
    const byAngle = computeRtByAngle(results);
    expect(byAngle).toHaveLength(1);
    expect(byAngle[0]?.count).toBe(1);
  });

  it('returns sorted by angle', () => {
    const results: MentalRotationTrialResult[] = [
      makeResult(180, true, 5000),
      makeResult(0, true, 1000),
      makeResult(120, true, 3000),
    ];
    const byAngle = computeRtByAngle(results);
    expect(byAngle.map((e) => e.angle)).toEqual([0, 120, 180]);
  });
});

// =============================================================================
// 5. RT slope
// =============================================================================

describe('Mental Rotation — computeRtSlope', () => {
  it('positive slope when RT increases with angle', () => {
    // Simulating linear relationship: RT = 1000 + 10*angle
    const results: MentalRotationTrialResult[] = [
      makeResult(0, true, 1000),
      makeResult(60, true, 1600),
      makeResult(120, true, 2200),
      makeResult(180, true, 2800),
    ];
    const slope = computeRtSlope(results);
    expect(slope).toBeGreaterThan(0);
    expect(slope).toBeCloseTo(10, 0);
  });

  it('returns 0 for insufficient data', () => {
    const results: MentalRotationTrialResult[] = [makeResult(60, true, 2000)];
    expect(computeRtSlope(results)).toBe(0);
  });

  it('returns 0 for empty results', () => {
    expect(computeRtSlope([])).toBe(0);
  });

  it('excludes incorrect and timeout trials', () => {
    const results: MentalRotationTrialResult[] = [
      makeResult(0, true, 1000),
      makeResult(60, false, 999, 'mirror'), // wrong — excluded
      makeResult(120, false, 8000, 'timeout'), // timeout — excluded
      makeResult(180, true, 2800),
    ];
    const slope = computeRtSlope(results);
    expect(slope).toBeGreaterThan(0);
  });

  it('folds angles past 180 (240->120, 300->60)', () => {
    // RT at folded angle 60 should be consistent
    const results: MentalRotationTrialResult[] = [
      makeResult(0, true, 1000),
      makeResult(300, true, 1600), // folded to 60
      makeResult(240, true, 2200), // folded to 120
      makeResult(180, true, 2800),
    ];
    const slope = computeRtSlope(results);
    expect(slope).toBeGreaterThan(0);
  });
});

// =============================================================================
// 6. Summary computation
// =============================================================================

describe('Mental Rotation — computeSummary', () => {
  it('perfect session', () => {
    const results: MentalRotationTrialResult[] = [
      makeResult(0, true, 1500),
      makeResult(60, true, 2000),
      makeResult(120, true, 2500),
      makeResult(180, true, 3000),
    ];
    const s = computeSummary(results);
    expect(s.accuracy).toBe(100);
    expect(s.correctCount).toBe(4);
    expect(s.totalTrials).toBe(4);
    expect(s.mirrorErrors).toBe(0);
    expect(s.distractorErrors).toBe(0);
    expect(s.timeouts).toBe(0);
  });

  it('tracks mirror errors separately from distractor errors', () => {
    const results: MentalRotationTrialResult[] = [
      makeResult(60, true, 2000),
      makeResult(120, false, 3000, 'mirror'),
      makeResult(180, false, 3500, 'distractor'),
      makeResult(0, false, 8000, 'timeout'),
    ];
    const s = computeSummary(results);
    expect(s.mirrorErrors).toBe(1);
    expect(s.distractorErrors).toBe(1);
    expect(s.timeouts).toBe(1);
    expect(s.correctCount).toBe(1);
    expect(s.accuracy).toBe(25);
  });

  it('computes meanRt excluding timeouts', () => {
    const results: MentalRotationTrialResult[] = [
      makeResult(60, true, 2000),
      makeResult(120, true, 4000),
      makeResult(180, false, 8000, 'timeout'),
    ];
    const s = computeSummary(results);
    expect(s.meanRt).toBe(3000); // (2000+4000)/2
  });

  it('handles empty results', () => {
    const s = computeSummary([]);
    expect(s.accuracy).toBe(0);
    expect(s.totalTrials).toBe(0);
    expect(s.meanRt).toBe(0);
    expect(s.rtSlope).toBe(0);
    expect(s.avgRtByAngle).toHaveLength(0);
  });

  it('includes RT slope in summary', () => {
    const results: MentalRotationTrialResult[] = [
      makeResult(0, true, 1000),
      makeResult(60, true, 1600),
      makeResult(120, true, 2200),
      makeResult(180, true, 2800),
    ];
    const s = computeSummary(results);
    expect(s.rtSlope).toBeGreaterThan(0);
  });

  it('includes avgRtByAngle in summary', () => {
    const results: MentalRotationTrialResult[] = [
      makeResult(0, true, 1000),
      makeResult(60, true, 2000),
      makeResult(120, false, 3000, 'mirror'),
    ];
    const s = computeSummary(results);
    expect(s.avgRtByAngle).toHaveLength(3);
    expect(s.avgRtByAngle[0]?.angle).toBe(0);
  });
});
