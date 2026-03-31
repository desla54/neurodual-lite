import { describe, expect, it } from 'bun:test';
import {
  CALIBRATION_MAX_LEVEL,
  CALIBRATION_MIN_LEVEL,
  CALIBRATION_SEQUENCE,
  DEFAULT_STAIRCASE_STATE,
  STAIRCASE_MAX_ROUNDS,
  applyCalibrationEvent,
  applyStaircaseRound,
  computeGlobalScore,
  projectCalibrationProfileFromFacts,
  resultKey,
  type StaircaseState,
  DEFAULT_CALIBRATION_STATE,
} from './calibration-algorithm';

describe('calibration-algorithm projection', () => {
  it('treats skip baseline as a fact and applies later sessions as post-calibration training', () => {
    const state = projectCalibrationProfileFromFacts({
      baselines: [{ level: 2, timestamp: 100 }],
      sessions: [{ modality: 'position', gameMode: 'dual-track', score: 1, timestamp: 200 }],
    });

    const result = state.results[resultKey('position', 'dual-track')];

    expect(state.phase).toBe('complete');
    expect(state.currentStepIndex).toBe(CALIBRATION_SEQUENCE.length);
    expect(result?.masteredLevel).toBe(2);
    expect(result?.progressToNext).toBe(22);
    expect(result?.rollingScores).toEqual([1]);
  });

  it('uses d-prime thresholds for n-back calibration sessions', () => {
    const state = projectCalibrationProfileFromFacts({
      sessions: [{ modality: 'letters', gameMode: 'nback', score: 3.2, timestamp: 100 }],
    });

    const result = state.results[resultKey('letters', 'nback')];

    expect(state.phase).toBe('running');
    expect(result?.currentLevel).toBe(3);
    expect(result?.masteredLevel).toBeNull();
    expect(result?.lastBlockAccuracy).toBe(3.2);
  });

  it('applies the skip baseline chronologically without overwriting already mastered steps', () => {
    const state = projectCalibrationProfileFromFacts({
      sessions: [
        { modality: 'position', gameMode: 'dual-track', score: 0.9, timestamp: 100 },
        { modality: 'position', gameMode: 'dual-track', score: 0.7, timestamp: 200 },
        { modality: 'position', gameMode: 'dual-track', score: 0.7, timestamp: 300 },
      ],
      baselines: [{ level: 2, timestamp: 400 }],
    });

    expect(state.phase).toBe('complete');
    expect(state.currentStepIndex).toBe(CALIBRATION_SEQUENCE.length);
    expect(state.results[resultKey('position', 'dual-track')]?.masteredLevel).toBe(3);
    expect(state.results[resultKey('letters', 'nback')]?.masteredLevel).toBe(2);
    expect(state.completedAt).toBe(400);
  });

  it('keeps position first and spatial fifth in the calibration sequence', () => {
    const dualTrackModalities = CALIBRATION_SEQUENCE.filter(
      (step) => step.gameMode === 'dual-track',
    ).map((step) => step.modality);

    expect(dualTrackModalities).toEqual([
      'position',
      'letters',
      'color',
      'shape',
      'spatial',
      'numbers',
      'emotions',
      'semantic',
      'tones',
    ]);
  });

  it('computes global score across the full calibration sequence', () => {
    const state = projectCalibrationProfileFromFacts({
      sessions: [
        { modality: 'position', gameMode: 'dual-track', score: 0.7, timestamp: 100 },
        { modality: 'position', gameMode: 'dual-track', score: 0.7, timestamp: 200 },
        { modality: 'position', gameMode: 'nback', score: 2.5, timestamp: 300 },
        { modality: 'position', gameMode: 'nback', score: 2.5, timestamp: 400 },
      ],
    });

    expect(computeGlobalScore(state.results)).toBe(2);
  });
});

// =============================================================================
// Staircase calibration (intra-session)
// =============================================================================

describe('applyStaircaseRound', () => {
  it('levels up on perfect round', () => {
    const s1 = applyStaircaseRound(DEFAULT_STAIRCASE_STATE, true);
    expect(s1.currentLevel).toBe(3);
    expect(s1.masteredLevel).toBeNull();
    expect(s1.roundsPlayed).toBe(1);
  });

  it('locks max level when passing at max', () => {
    let state: StaircaseState = { ...DEFAULT_STAIRCASE_STATE, currentLevel: CALIBRATION_MAX_LEVEL };
    state = applyStaircaseRound(state, true);
    expect(state.masteredLevel).toBe(CALIBRATION_MAX_LEVEL);
  });

  it('locks min level when failing at min', () => {
    let state: StaircaseState = { ...DEFAULT_STAIRCASE_STATE, currentLevel: CALIBRATION_MIN_LEVEL };
    state = applyStaircaseRound(state, false);
    expect(state.masteredLevel).toBe(CALIBRATION_MIN_LEVEL);
  });

  it('drops a level on first failure', () => {
    let state: StaircaseState = { ...DEFAULT_STAIRCASE_STATE, currentLevel: 4 };
    state = applyStaircaseRound(state, false);
    expect(state.currentLevel).toBe(3);
    expect(state.masteredLevel).toBeNull();
    expect(state.failCounts[4]).toBe(1);
  });

  it('detects yo-yo: 2 failures at same level locks level below', () => {
    // Simulate: pass 2 → 3, pass 3 → 4, fail 4 → 3, pass 3 → 4, fail 4 → lock 3
    let state = DEFAULT_STAIRCASE_STATE;
    state = applyStaircaseRound(state, true); // 2→3
    state = applyStaircaseRound(state, true); // 3→4
    state = applyStaircaseRound(state, false); // fail@4, drop→3
    expect(state.currentLevel).toBe(3);
    expect(state.masteredLevel).toBeNull();

    state = applyStaircaseRound(state, true); // 3→4
    state = applyStaircaseRound(state, false); // fail@4 (2nd) → lock 3
    expect(state.masteredLevel).toBe(3);
    expect(state.roundsPlayed).toBe(5);
  });

  it('force-locks after max rounds', () => {
    let state: StaircaseState = {
      ...DEFAULT_STAIRCASE_STATE,
      roundsPlayed: STAIRCASE_MAX_ROUNDS - 1,
      currentLevel: 3,
    };
    state = applyStaircaseRound(state, true);
    expect(state.masteredLevel).toBe(3);
    expect(state.roundsPlayed).toBe(STAIRCASE_MAX_ROUNDS);
  });

  it('does not mutate state once mastered', () => {
    const locked: StaircaseState = { ...DEFAULT_STAIRCASE_STATE, masteredLevel: 3 };
    const next = applyStaircaseRound(locked, true);
    expect(next).toBe(locked); // same reference, no mutation
  });

  it('full run: player at level 4 converges in ~6 rounds', () => {
    // pass 2→3, pass 3→4, pass 4→5, fail 5→4, pass 4→5, fail 5 → lock 4
    let state = DEFAULT_STAIRCASE_STATE;
    state = applyStaircaseRound(state, true); // 2→3
    state = applyStaircaseRound(state, true); // 3→4
    state = applyStaircaseRound(state, true); // 4→5
    state = applyStaircaseRound(state, false); // fail@5 → 4
    state = applyStaircaseRound(state, true); // 4→5
    state = applyStaircaseRound(state, false); // fail@5 → lock 4
    expect(state.masteredLevel).toBe(4);
    expect(state.roundsPlayed).toBe(6);
  });
});

describe('CALIBRATION_MODALITY_DETERMINED event', () => {
  it('directly sets mastered level for a specific modality+gameMode', () => {
    const state = applyCalibrationEvent(
      { ...DEFAULT_CALIBRATION_STATE },
      {
        type: 'CALIBRATION_MODALITY_DETERMINED',
        timestamp: 1000,
        modality: 'position',
        gameMode: 'dual-track',
        masteredLevel: 4,
      },
    );

    const result = state.results[resultKey('position', 'dual-track')];
    expect(result?.masteredLevel).toBe(4);
    expect(result?.currentLevel).toBe(4);
    expect(state.phase).toBe('running');
  });

  it('completes calibration when all steps are determined', () => {
    let state = { ...DEFAULT_CALIBRATION_STATE };
    for (const step of CALIBRATION_SEQUENCE) {
      state = applyCalibrationEvent(state, {
        type: 'CALIBRATION_MODALITY_DETERMINED',
        timestamp: 1000,
        modality: step.modality,
        gameMode: step.gameMode,
        masteredLevel: 3,
      });
    }

    expect(state.phase).toBe('complete');
    expect(state.completedAt).toBe(1000);
  });
});
