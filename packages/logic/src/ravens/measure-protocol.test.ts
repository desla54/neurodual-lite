import { describe, it, expect } from 'vitest';
import {
  startProtocol,
  nextTrial,
  nextStep,
  submitResponse,
  dismissTutorial,
  getResult,
  type MeasureProtocolState,
  type StandardResult,
} from './measure-protocol';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Run through the full protocol, always selecting answer index 0 (correct). */
function runAllCorrect(state: MeasureProtocolState): MeasureProtocolState {
  let s = state;
  while (!s.finished) {
    const trial = nextTrial(s);
    if (!trial) break;
    const { state: next } = submitResponse(s, 0, 2000);
    s = next;
  }
  return s;
}

/** Run through the full protocol, always selecting index 1 (incorrect). */
function runAllIncorrect(state: MeasureProtocolState): MeasureProtocolState {
  let s = state;
  while (!s.finished) {
    const trial = nextTrial(s);
    if (!trial) break;
    const { state: next } = submitResponse(s, 1, 2000);
    s = next;
  }
  return s;
}

// ---------------------------------------------------------------------------
// startProtocol
// ---------------------------------------------------------------------------

describe('startProtocol', () => {
  it('creates standard protocol with neurodual profile', () => {
    const state = startProtocol({ mode: 'standard', sessionId: 'test-std' });
    expect(state.profile).toBe('neurodual');
    expect(state.adaptive.maxTrials).toBe(30);
    expect(state.trialIndex).toBe(0);
    expect(state.finished).toBe(false);
  });

  it('creates adaptive protocol with neurodual profile', () => {
    const state = startProtocol({ mode: 'adaptive', sessionId: 'test-adp' });
    expect(state.profile).toBe('neurodual');
    expect(state.adaptive.maxLevel).toBe(30);
  });

  it('creates SPM protocol with iraven profile', () => {
    const state = startProtocol({ mode: 'spm', sessionId: 'test-spm' });
    expect(state.profile).toBe('iraven');
    expect(state.adaptive.maxLevel).toBe(10);
    expect(state.adaptive.maxTrials).toBe(60);
  });
});

// ---------------------------------------------------------------------------
// Standard mode — fixed sequence 1→30
// ---------------------------------------------------------------------------

describe('standard mode', () => {
  it('presents levels 1 through 30 in order', () => {
    let state = startProtocol({ mode: 'standard', sessionId: 'std-levels' });
    const levels: number[] = [];
    for (let i = 0; i < 30; i++) {
      const trial = nextTrial(state);
      levels.push(trial!.level);
      ({ state } = submitResponse(state, 0, 1000));
    }

    expect(levels).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
  });

  it('runs exactly 30 items', () => {
    const state = startProtocol({ mode: 'standard', sessionId: 'std-count' });
    const final = runAllCorrect(state);
    expect(final.finished).toBe(true);
    expect(final.trialIndex).toBe(30);
    expect(final.trials.length).toBe(30);
  });

  it('produces correct StandardResult with all correct', () => {
    const state = startProtocol({ mode: 'standard', sessionId: 'std-perfect' });
    const final = runAllCorrect(state);
    const { mode, result } = getResult(final);
    expect(mode).toBe('standard');
    if (mode === 'standard') {
      expect(result.rawScore).toBe(30);
      expect(result.totalItems).toBe(30);
      expect(result.accuracy).toBe(1);
      expect(result.highestCorrectLevel).toBe(30);
      expect(result.meanRt).toBe(2000);
      expect(result.tierBreakdown.length).toBe(7);
      // Beginner tier: levels 1-6 → 6 correct
      expect(result.tierBreakdown[0]!.correct).toBe(6);
      expect(result.tierBreakdown[0]!.total).toBe(6);
      expect(result.tierBreakdown[0]!.tierId).toBe('beginner');
    }
  });

  it('produces correct StandardResult with all incorrect', () => {
    const state = startProtocol({ mode: 'standard', sessionId: 'std-zero' });
    const final = runAllIncorrect(state);
    const { mode, result } = getResult(final);
    if (mode === 'standard') {
      expect(result.rawScore).toBe(0);
      expect(result.accuracy).toBe(0);
      expect(result.highestCorrectLevel).toBe(0);
    }
  });

  it('tier breakdown sums to 30', () => {
    const state = startProtocol({ mode: 'standard', sessionId: 'std-tiers' });
    const final = runAllCorrect(state);
    const { result } = getResult(final) as { mode: 'standard'; result: StandardResult };
    const totalFromTiers = result.tierBreakdown.reduce((sum, t) => sum + t.total, 0);
    expect(totalFromTiers).toBe(30);
  });

  it('score is comparable across sessions (same difficulty distribution)', () => {
    // Two sessions with same answers should produce same score
    const s1 = runAllCorrect(startProtocol({ mode: 'standard', sessionId: 'cmp-1' }));
    const s2 = runAllCorrect(startProtocol({ mode: 'standard', sessionId: 'cmp-2' }));
    const r1 = getResult(s1) as { mode: 'standard'; result: StandardResult };
    const r2 = getResult(s2) as { mode: 'standard'; result: StandardResult };
    expect(r1.result.rawScore).toBe(r2.result.rawScore);
    expect(r1.result.accuracy).toBe(r2.result.accuracy);
  });
});

// ---------------------------------------------------------------------------
// nextTrial
// ---------------------------------------------------------------------------

describe('nextTrial', () => {
  it('returns a trial with matrix and metadata', () => {
    const state = startProtocol({ mode: 'standard', sessionId: 'test-nt' });
    const trial = nextTrial(state);
    expect(trial).not.toBeNull();
    expect(trial!.index).toBe(0);
    expect(trial!.level).toBe(1); // standard: first level is 1
    expect(trial!.matrix).toBeDefined();
    expect(trial!.seed).toBe('test-nt-m0');
  });

  it('returns null when protocol is finished', () => {
    const state = startProtocol({ mode: 'standard', sessionId: 'test-fin' });
    const finished = { ...state, finished: true };
    expect(nextTrial(finished)).toBeNull();
  });

  it('generates deterministic matrices from seed', () => {
    const state = startProtocol({ mode: 'standard', sessionId: 'det-test' });
    const trial1 = nextTrial(state);
    const trial2 = nextTrial(state);
    expect(trial1!.seed).toBe(trial2!.seed);
  });
});

// ---------------------------------------------------------------------------
// submitResponse
// ---------------------------------------------------------------------------

describe('submitResponse', () => {
  it('records a correct response', () => {
    const state = startProtocol({ mode: 'standard', sessionId: 'test-sr' });
    const { state: next, outcome } = submitResponse(state, 0, 1500);
    expect(outcome.correct).toBe(true);
    expect(outcome.finished).toBe(false);
    expect(next.trialIndex).toBe(1);
    expect(next.trials).toHaveLength(1);
  });

  it('records an incorrect response', () => {
    const state = startProtocol({ mode: 'standard', sessionId: 'test-sr2' });
    const { outcome } = submitResponse(state, 1, 2000);
    expect(outcome.correct).toBe(false);
  });

  it('does not mutate the input state', () => {
    const state = startProtocol({ mode: 'standard', sessionId: 'test-imm' });
    submitResponse(state, 0, 1000);
    expect(state.trials.length).toBe(0);
    expect(state.trialIndex).toBe(0);
  });

  it('standard mode does not use adaptive staircase', () => {
    let state = startProtocol({ mode: 'standard', sessionId: 'test-no-adapt' });
    ({ state } = submitResponse(state, 0, 1000));
    ({ state } = submitResponse(state, 0, 1000));
    // Level should be 3 (fixed sequence), not affected by consecutive correct
    const trial = nextTrial(state);
    expect(trial!.level).toBe(3);
  });

  it('adaptive mode uses staircase (step=4 initially)', () => {
    let state = startProtocol({ mode: 'adaptive', sessionId: 'test-adapt' });
    ({ state } = submitResponse(state, 0, 1000));
    ({ state } = submitResponse(state, 0, 1000));
    expect(state.adaptive.level).toBe(5); // 1 + 4
  });
});

// ---------------------------------------------------------------------------
// Adaptive protocol — convergence
// ---------------------------------------------------------------------------

describe('adaptive protocol — full run', () => {
  it('finishes within maxTrials', () => {
    const state = startProtocol({ mode: 'adaptive', sessionId: 'full-run', maxTrials: 30 });
    const final = runAllCorrect(state);
    expect(final.finished).toBe(true);
    expect(final.trialIndex).toBeLessThanOrEqual(30);
  });
});

// ---------------------------------------------------------------------------
// SPM protocol
// ---------------------------------------------------------------------------

describe('SPM protocol — full run', () => {
  it('runs exactly 60 items', () => {
    const state = startProtocol({ mode: 'spm', sessionId: 'spm-full' });
    const final = runAllCorrect(state);
    expect(final.finished).toBe(true);
    expect(final.trialIndex).toBe(60);
  });

  it('produces correct SpmResult with all correct', () => {
    const state = startProtocol({ mode: 'spm', sessionId: 'spm-score' });
    const final = runAllCorrect(state);
    const { mode, result } = getResult(final);
    expect(mode).toBe('spm');
    if (mode === 'spm') {
      expect(result.rawScore).toBe(60);
      expect(result.accuracy).toBe(1);
      expect(result.seriesScores).toEqual([12, 12, 12, 12, 12]);
    }
  });

  it('SPM series levels follow A(1-2) B(3-4) C(5-6) D(7-8) E(9-10)', () => {
    let state = startProtocol({ mode: 'spm', sessionId: 'spm-series' });
    const levels: number[] = [];
    for (let i = 0; i < 60; i++) {
      const trial = nextTrial(state);
      levels.push(trial!.level);
      ({ state } = submitResponse(state, 0, 1000));
    }

    expect(levels.slice(0, 6).every((l) => l === 1)).toBe(true);
    expect(levels.slice(6, 12).every((l) => l === 2)).toBe(true);
    expect(levels.slice(48, 54).every((l) => l === 9)).toBe(true);
    expect(levels.slice(54, 60).every((l) => l === 10)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tutorial integration
// ---------------------------------------------------------------------------

describe('nextStep — tutorial gates', () => {
  it('returns trial at low levels (no tutorial needed)', () => {
    const state = startProtocol({ mode: 'standard', sessionId: 'tut-low' });
    const step = nextStep(state);
    expect(step.kind).toBe('trial');
  });

  it('returns tutorial at level 17 in standard mode', () => {
    let state = startProtocol({ mode: 'standard', sessionId: 'tut-17' });
    // Advance to trial 16 (level 17)
    for (let i = 0; i < 16; i++) {
      ({ state } = submitResponse(state, 0, 1000));
    }
    const step = nextStep(state);
    expect(step.kind).toBe('tutorial');
    if (step.kind === 'tutorial') {
      expect(step.gate.id).toBe('logic-rules');
    }
  });

  it('returns trial after tutorial is dismissed', () => {
    let state = startProtocol({ mode: 'standard', sessionId: 'tut-dismiss' });
    for (let i = 0; i < 16; i++) {
      ({ state } = submitResponse(state, 0, 1000));
    }
    state = dismissTutorial(state, 'logic-rules');
    const step = nextStep(state);
    expect(step.kind).toBe('trial');
  });

  it('skips tutorials already seen in config', () => {
    let state = startProtocol({
      mode: 'standard',
      sessionId: 'tut-pre-seen',
      seenTutorials: ['logic-rules'],
    });
    for (let i = 0; i < 16; i++) {
      ({ state } = submitResponse(state, 0, 1000));
    }
    const step = nextStep(state);
    expect(step.kind).toBe('trial');
  });

  it('no tutorials in SPM mode', () => {
    const state = startProtocol({ mode: 'spm', sessionId: 'tut-spm' });
    const step = nextStep(state);
    expect(step.kind).toBe('trial');
  });

  it('dismissTutorial is immutable', () => {
    let state = startProtocol({ mode: 'standard', sessionId: 'tut-imm' });
    for (let i = 0; i < 16; i++) {
      ({ state } = submitResponse(state, 0, 1000));
    }
    const original = state;
    const updated = dismissTutorial(state, 'logic-rules');
    expect(original.seenTutorials.has('logic-rules')).toBe(false);
    expect(updated.seenTutorials.has('logic-rules')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('edge cases', () => {
  it('different sessionIds produce different matrices', () => {
    const s1 = startProtocol({ mode: 'standard', sessionId: 'a' });
    const s2 = startProtocol({ mode: 'standard', sessionId: 'b' });
    const t1 = nextTrial(s1);
    const t2 = nextTrial(s2);
    expect(t1!.seed).not.toBe(t2!.seed);
  });

  it('protocol state is fully immutable across submissions', () => {
    const s0 = startProtocol({ mode: 'standard', sessionId: 'imm' });
    const { state: s1 } = submitResponse(s0, 0, 1000);
    const { state: s2 } = submitResponse(s1, 0, 1000);
    expect(s0.trialIndex).toBe(0);
    expect(s1.trialIndex).toBe(1);
    expect(s2.trialIndex).toBe(2);
  });
});
