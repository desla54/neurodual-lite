import { describe, expect, it } from 'bun:test';
import {
  evaluateProgression,
  checkThreshold,
  type SessionMetricsInput,
  type EngineProgressionState,
} from './progression-engine';
import { JAEGGI_RULESET, BW_RULESET } from './rulesets';

// =============================================================================
// Helpers
// =============================================================================

function jaeggiMetrics(posErrors: number, audErrors: number): SessionMetricsInput {
  return {
    activeModalities: ['position', 'audio'],
    byModality: {
      position: { hits: 10, misses: posErrors, falseAlarms: 0 },
      audio: { hits: 10, misses: 0, falseAlarms: audErrors },
    },
  };
}

function bwMetrics(hits: number, misses: number, falseAlarms: number): SessionMetricsInput {
  return {
    activeModalities: ['position', 'audio'],
    byModality: {
      position: {
        hits: Math.floor(hits / 2),
        misses: Math.floor(misses / 2),
        falseAlarms: Math.floor(falseAlarms / 2),
      },
      audio: {
        hits: Math.ceil(hits / 2),
        misses: Math.ceil(misses / 2),
        falseAlarms: Math.ceil(falseAlarms / 2),
      },
    },
  };
}

// =============================================================================
// checkThreshold
// =============================================================================

describe('checkThreshold', () => {
  it('below', () => {
    expect(checkThreshold(2, { op: 'below', value: 3 })).toBe(true);
    expect(checkThreshold(3, { op: 'below', value: 3 })).toBe(false);
    expect(checkThreshold(4, { op: 'below', value: 3 })).toBe(false);
  });

  it('above', () => {
    expect(checkThreshold(6, { op: 'above', value: 5 })).toBe(true);
    expect(checkThreshold(5, { op: 'above', value: 5 })).toBe(false);
    expect(checkThreshold(4, { op: 'above', value: 5 })).toBe(false);
  });

  it('atOrAbove', () => {
    expect(checkThreshold(80, { op: 'atOrAbove', value: 80 })).toBe(true);
    expect(checkThreshold(81, { op: 'atOrAbove', value: 80 })).toBe(true);
    expect(checkThreshold(79, { op: 'atOrAbove', value: 80 })).toBe(false);
  });

  it('atOrBelow', () => {
    expect(checkThreshold(3, { op: 'atOrBelow', value: 3 })).toBe(true);
    expect(checkThreshold(2, { op: 'atOrBelow', value: 3 })).toBe(true);
    expect(checkThreshold(4, { op: 'atOrBelow', value: 3 })).toBe(false);
  });
});

// =============================================================================
// Jaeggi ruleset
// =============================================================================

describe('evaluateProgression — Jaeggi', () => {
  it('0 errors on both → up', () => {
    const result = evaluateProgression(jaeggiMetrics(0, 0), JAEGGI_RULESET);
    expect(result.zone).toBe('up');
    expect(result.metricValue).toBe(0);
    expect(result.perModality).not.toBeNull();
    expect(result.perModality!.every((m) => m.zone === 'up')).toBe(true);
    expect(result.strikes).toBeNull();
  });

  it('2 errors on worst modality → up (below threshold of 3)', () => {
    const result = evaluateProgression(jaeggiMetrics(2, 1), JAEGGI_RULESET);
    expect(result.zone).toBe('up');
    expect(result.metricValue).toBe(2);
  });

  it('3 errors on worst modality → stay (not below 3)', () => {
    const result = evaluateProgression(jaeggiMetrics(3, 0), JAEGGI_RULESET);
    expect(result.zone).toBe('stay');
    expect(result.metricValue).toBe(3);
  });

  it('5 errors on worst modality → stay (not above 5)', () => {
    const result = evaluateProgression(jaeggiMetrics(5, 0), JAEGGI_RULESET);
    expect(result.zone).toBe('stay');
    expect(result.metricValue).toBe(5);
  });

  it('6 errors on worst modality → down (above 5)', () => {
    const result = evaluateProgression(jaeggiMetrics(6, 0), JAEGGI_RULESET);
    expect(result.zone).toBe('down');
    expect(result.metricValue).toBe(6);
  });

  it('per-modality breakdown classifies each modality independently', () => {
    const result = evaluateProgression(jaeggiMetrics(6, 1), JAEGGI_RULESET);
    expect(result.zone).toBe('down');
    const pos = result.perModality!.find((m) => m.modalityId === 'position')!;
    const aud = result.perModality!.find((m) => m.modalityId === 'audio')!;
    expect(pos.zone).toBe('down');
    expect(aud.zone).toBe('up');
  });

  it('no modalities → metricValue 0, zone up', () => {
    const result = evaluateProgression({ activeModalities: [], byModality: {} }, JAEGGI_RULESET);
    expect(result.zone).toBe('up');
    expect(result.metricValue).toBe(0);
  });
});

// =============================================================================
// Brain Workshop ruleset — stateless (no prior strikes)
// =============================================================================

describe('evaluateProgression — BW stateless', () => {
  it('score 80% → up', () => {
    // 16 hits, 2 misses, 2 FA → 16/20 = 80%
    const result = evaluateProgression(bwMetrics(16, 2, 2), BW_RULESET);
    expect(result.zone).toBe('up');
    expect(result.metricValue).toBe(80);
    expect(result.strikes).not.toBeNull();
    expect(result.strikes!.current).toBe(0);
  });

  it('score 79% → stay', () => {
    // Approximation: 79 hits out of 100 denominator
    const result = evaluateProgression(bwMetrics(79, 11, 10), BW_RULESET);
    expect(result.zone).toBe('stay');
  });

  it('score 50% → stay (boundary, not below)', () => {
    const result = evaluateProgression(bwMetrics(10, 5, 5), BW_RULESET);
    expect(result.zone).toBe('stay');
    expect(result.metricValue).toBe(50);
  });

  it('score 49% → stay with strike 1 (first strike, demoted from down)', () => {
    // 49 hits out of 100
    const result = evaluateProgression(bwMetrics(49, 26, 25), BW_RULESET);
    expect(result.zone).toBe('stay');
    expect(result.strikes!.current).toBe(1);
    expect(result.strikes!.triggered).toBe(false);
  });

  it('score 0% → stay with strike 1', () => {
    const result = evaluateProgression(bwMetrics(0, 5, 5), BW_RULESET);
    expect(result.zone).toBe('stay');
    expect(result.strikes!.current).toBe(1);
  });
});

// =============================================================================
// Brain Workshop ruleset — stateful (strike accumulation)
// =============================================================================

describe('evaluateProgression — BW strikes', () => {
  it('2nd consecutive strike → stay with 2 strikes', () => {
    const state: EngineProgressionState = { consecutiveStrikes: 1 };
    const result = evaluateProgression(bwMetrics(0, 5, 5), BW_RULESET, state);
    expect(result.zone).toBe('stay');
    expect(result.strikes!.current).toBe(2);
    expect(result.strikes!.triggered).toBe(false);
  });

  it('3rd consecutive strike → forced down, strikes reset', () => {
    const state: EngineProgressionState = { consecutiveStrikes: 2 };
    const result = evaluateProgression(bwMetrics(0, 5, 5), BW_RULESET, state);
    expect(result.zone).toBe('down');
    expect(result.strikes!.current).toBe(0);
    expect(result.strikes!.triggered).toBe(true);
    expect(result.newState.consecutiveStrikes).toBe(0);
  });

  it('up after strikes → strikes reset (level change)', () => {
    const state: EngineProgressionState = { consecutiveStrikes: 2 };
    const result = evaluateProgression(bwMetrics(16, 2, 2), BW_RULESET, state);
    expect(result.zone).toBe('up');
    expect(result.strikes!.current).toBe(0);
    expect(result.newState.consecutiveStrikes).toBe(0);
  });

  it('stay (50-79%) does NOT reset strikes (BW original)', () => {
    const state: EngineProgressionState = { consecutiveStrikes: 2 };
    // 60% score → stay zone
    const result = evaluateProgression(bwMetrics(12, 4, 4), BW_RULESET, state);
    expect(result.zone).toBe('stay');
    // strikes preserved — BW original behavior
    expect(result.strikes!.current).toBe(2);
    expect(result.newState.consecutiveStrikes).toBe(2);
  });

  it('BW failure → stay → failure sequence: strikes=1, 1, 2', () => {
    // Simulates: Fail(40%) -> Stay(60%) -> Fail(40%)
    // BW original: strikes don't reset on stay, so it's 1 → 1 → 2
    let state: EngineProgressionState = { consecutiveStrikes: 0 };

    // Session 1: Fail (40%)
    const r1 = evaluateProgression(bwMetrics(4, 3, 3), BW_RULESET, state);
    expect(r1.strikes!.current).toBe(1);
    state = r1.newState;

    // Session 2: Stay (60%)
    const r2 = evaluateProgression(bwMetrics(12, 4, 4), BW_RULESET, state);
    expect(r2.strikes!.current).toBe(1); // NOT reset
    state = r2.newState;

    // Session 3: Fail (40%)
    const r3 = evaluateProgression(bwMetrics(4, 3, 3), BW_RULESET, state);
    expect(r3.strikes!.current).toBe(2);
    expect(r3.zone).toBe('stay');
  });
});

// =============================================================================
// Custom ruleset — clean reset
// =============================================================================

describe('evaluateProgression — custom ruleset with clean reset', () => {
  const CUSTOM_RULESET = {
    ...BW_RULESET,
    id: 'custom-bw-clean-reset',
    strikes: {
      ...BW_RULESET.strikes!,
      resetOn: 'clean' as const,
    },
  };

  it('stay (50-79%) DOES reset strikes with clean reset', () => {
    const state: EngineProgressionState = { consecutiveStrikes: 2 };
    const result = evaluateProgression(bwMetrics(12, 4, 4), CUSTOM_RULESET, state);
    expect(result.zone).toBe('stay');
    expect(result.strikes!.current).toBe(0); // reset!
  });
});

// =============================================================================
// Edge cases
// =============================================================================

describe('evaluateProgression — edge cases', () => {
  it('empty modality data → score 0%', () => {
    const result = evaluateProgression({ activeModalities: [], byModality: {} }, BW_RULESET);
    expect(result.metricValue).toBe(0);
  });

  it('all nulls in modality → treated as 0', () => {
    const result = evaluateProgression(
      {
        activeModalities: ['position'],
        byModality: {
          position: { hits: null, misses: null, falseAlarms: null },
        },
      },
      JAEGGI_RULESET,
    );
    expect(result.zone).toBe('up');
    expect(result.metricValue).toBe(0);
  });
});
