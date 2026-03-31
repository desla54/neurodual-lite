import { describe, expect, it } from 'bun:test';
import {
  classifyDnbZone,
  computeTotalErrors,
  estimateTotalErrorsFromScore,
  createInitialBlockState,
  stepHybridBlock,
  resolveBlockConfig,
  hybridProgressToBlockState,
  blockStateToHybridProgress,
  type HybridBlockConfig,
  type HybridBlockState,
} from './hybrid-block-machine';

const DEFAULT_CONFIG: HybridBlockConfig = { trackSessionsPerBlock: 1, dnbSessionsPerBlock: 3 };

describe('classifyDnbZone', () => {
  it('classifies ≤1 errors as clean', () => {
    expect(classifyDnbZone(0)).toBe('clean');
    expect(classifyDnbZone(1)).toBe('clean');
  });

  it('classifies 2-3 errors as stay', () => {
    expect(classifyDnbZone(2)).toBe('stay');
    expect(classifyDnbZone(3)).toBe('stay');
  });

  it('classifies >3 errors as down', () => {
    expect(classifyDnbZone(4)).toBe('down');
    expect(classifyDnbZone(10)).toBe('down');
  });
});

describe('computeTotalErrors', () => {
  it('returns null for undefined or empty', () => {
    expect(computeTotalErrors(undefined)).toBeNull();
    expect(computeTotalErrors(null)).toBeNull();
    expect(computeTotalErrors({})).toBeNull();
  });

  it('sums misses and falseAlarms across modalities', () => {
    expect(
      computeTotalErrors({
        position: { misses: 1, falseAlarms: 0 },
        audio: { misses: 0, falseAlarms: 1 },
      }),
    ).toBe(2);
  });
});

describe('estimateTotalErrorsFromScore', () => {
  it('maps score ranges to error estimates', () => {
    expect(estimateTotalErrorsFromScore(100)).toBe(0);
    expect(estimateTotalErrorsFromScore(85)).toBe(2);
    expect(estimateTotalErrorsFromScore(50)).toBe(4);
  });
});

describe('stepHybridBlock — track phase', () => {
  it('accepts a track session and stays in track phase if more needed', () => {
    const config: HybridBlockConfig = { trackSessionsPerBlock: 2, dnbSessionsPerBlock: 3 };
    const result = stepHybridBlock(createInitialBlockState(), 'dual-track', null, config);

    expect(result.accepted).toBe(true);
    expect(result.decision).toBeNull();
    expect(result.nextState.phase).toBe('track');
    expect(result.nextState.trackCount).toBe(1);
    expect(result.nextSessionGameMode).toBe('dual-track');
  });

  it('transitions to DNB phase when track block is complete', () => {
    const result = stepHybridBlock(createInitialBlockState(), 'dual-track', null, DEFAULT_CONFIG);

    expect(result.accepted).toBe(true);
    expect(result.decision).toBeNull();
    expect(result.nextState.phase).toBe('dnb');
    expect(result.nextSessionGameMode).toBe('dualnback-classic');
  });

  it('rejects a DNB session during track phase', () => {
    const result = stepHybridBlock(
      createInitialBlockState(),
      'dualnback-classic',
      'clean',
      DEFAULT_CONFIG,
    );

    expect(result.accepted).toBe(false);
    expect(result.nextSessionGameMode).toBe('dual-track');
  });
});

describe('stepHybridBlock — DNB phase', () => {
  const dnbPhaseState: HybridBlockState = {
    phase: 'dnb',
    trackCount: 1,
    dnbCount: 0,
    activeZone: null,
    activeZoneStreak: 0,
    lastZone: null,
  };

  it('rejects a track session during DNB phase', () => {
    const result = stepHybridBlock(dnbPhaseState, 'dual-track', 'clean', DEFAULT_CONFIG);

    expect(result.accepted).toBe(false);
    expect(result.nextSessionGameMode).toBe('dualnback-classic');
  });

  it('accepts a clean DNB session and starts a clean streak', () => {
    const result = stepHybridBlock(dnbPhaseState, 'dualnback-classic', 'clean', DEFAULT_CONFIG);

    expect(result.accepted).toBe(true);
    expect(result.decision).toBeNull();
    expect(result.nextState.activeZone).toBe('clean');
    expect(result.nextState.activeZoneStreak).toBe(1);
    expect(result.nextState.dnbCount).toBe(1);
  });

  it('triggers UP decision after 2 consecutive clean sessions', () => {
    const afterFirstClean: HybridBlockState = {
      ...dnbPhaseState,
      dnbCount: 1,
      activeZone: 'clean',
      activeZoneStreak: 1,
      lastZone: 'clean',
    };

    const result = stepHybridBlock(afterFirstClean, 'dualnback-classic', 'clean', DEFAULT_CONFIG);

    expect(result.accepted).toBe(true);
    expect(result.decision).toBe('clean');
    expect(result.nextSessionGameMode).toBe('dual-track');
  });

  it('triggers DOWN decision after 2 consecutive down sessions', () => {
    const afterFirstDown: HybridBlockState = {
      ...dnbPhaseState,
      dnbCount: 1,
      activeZone: 'down',
      activeZoneStreak: 1,
      lastZone: 'down',
    };

    const result = stepHybridBlock(afterFirstDown, 'dualnback-classic', 'down', DEFAULT_CONFIG);

    expect(result.decision).toBe('down');
  });

  it('stay zones do NOT build streaks — breaks active streak', () => {
    const afterFirstClean: HybridBlockState = {
      ...dnbPhaseState,
      dnbCount: 1,
      activeZone: 'clean',
      activeZoneStreak: 1,
      lastZone: 'clean',
    };

    const result = stepHybridBlock(afterFirstClean, 'dualnback-classic', 'stay', DEFAULT_CONFIG);

    expect(result.decision).toBeNull();
    expect(result.nextState.activeZone).toBeNull();
    expect(result.nextState.activeZoneStreak).toBe(0);
    expect(result.nextState.lastZone).toBe('stay');
  });

  it('two consecutive stay zones do NOT trigger an early decision', () => {
    const afterFirstStay: HybridBlockState = {
      ...dnbPhaseState,
      dnbCount: 1,
      activeZone: null,
      activeZoneStreak: 0,
      lastZone: 'stay',
    };

    const result = stepHybridBlock(afterFirstStay, 'dualnback-classic', 'stay', DEFAULT_CONFIG);

    expect(result.decision).toBeNull();
    expect(result.nextState.dnbCount).toBe(2);
  });

  it('forces stay decision when DNB block is exhausted without a streak', () => {
    const almostExhausted: HybridBlockState = {
      ...dnbPhaseState,
      dnbCount: 2,
      activeZone: null,
      activeZoneStreak: 0,
      lastZone: 'stay',
    };

    const result = stepHybridBlock(almostExhausted, 'dualnback-classic', 'stay', DEFAULT_CONFIG);

    expect(result.decision).toBe('stay');
    expect(result.nextSessionGameMode).toBe('dual-track');
  });

  it('mixed zones reset the streak counter', () => {
    const afterClean: HybridBlockState = {
      ...dnbPhaseState,
      dnbCount: 1,
      activeZone: 'clean',
      activeZoneStreak: 1,
      lastZone: 'clean',
    };

    const result = stepHybridBlock(afterClean, 'dualnback-classic', 'down', DEFAULT_CONFIG);

    expect(result.decision).toBeNull();
    expect(result.nextState.activeZone).toBe('down');
    expect(result.nextState.activeZoneStreak).toBe(1);
  });
});

describe('resolveBlockConfig', () => {
  it('returns defaults when no options', () => {
    const config = resolveBlockConfig();
    expect(config.trackSessionsPerBlock).toBe(1);
    expect(config.dnbSessionsPerBlock).toBe(3);
  });

  it('clamps non-finite values', () => {
    const config = resolveBlockConfig({
      trackSessionsPerBlock: NaN,
      dnbSessionsPerBlock: -5,
    });
    expect(config.trackSessionsPerBlock).toBe(1);
    expect(config.dnbSessionsPerBlock).toBe(1);
  });
});

describe('hybridProgressToBlockState / blockStateToHybridProgress roundtrip', () => {
  it('roundtrips track phase', () => {
    const progress = {
      loopPhase: 'track' as const,
      trackSessionsCompleted: 0,
      trackSessionsRequired: 1,
      dnbSessionsCompleted: 0,
      dnbSessionsRequired: 3,
    };

    const blockState = hybridProgressToBlockState(progress);
    expect(blockState.phase).toBe('track');
    expect(blockState.trackCount).toBe(0);

    const back = blockStateToHybridProgress(blockState, DEFAULT_CONFIG);
    expect(back.loopPhase).toBe('track');
    expect(back.trackSessionsCompleted).toBe(0);
  });

  it('roundtrips DNB phase with clean streak', () => {
    const progress = {
      loopPhase: 'dnb' as const,
      trackSessionsCompleted: 1,
      trackSessionsRequired: 1,
      dnbSessionsCompleted: 1,
      dnbSessionsRequired: 3,
      decisionZone: 'clean' as const,
      decisionStreakCount: 1,
      decisionStreakRequired: 2,
    };

    const blockState = hybridProgressToBlockState(progress);
    expect(blockState.activeZone).toBe('clean');
    expect(blockState.activeZoneStreak).toBe(1);

    const back = blockStateToHybridProgress(blockState, DEFAULT_CONFIG);
    expect(back.decisionZone).toBe('clean');
    expect(back.decisionStreakCount).toBe(1);
    expect(back.decisionStreakRequired).toBe(2);
  });

  it('roundtrips DNB phase with stay zone (no streak)', () => {
    const progress = {
      loopPhase: 'dnb' as const,
      trackSessionsCompleted: 1,
      trackSessionsRequired: 1,
      dnbSessionsCompleted: 1,
      dnbSessionsRequired: 3,
      decisionZone: 'stay' as const,
    };

    const blockState = hybridProgressToBlockState(progress);
    expect(blockState.activeZone).toBeNull();
    expect(blockState.activeZoneStreak).toBe(0);

    const back = blockStateToHybridProgress(blockState, DEFAULT_CONFIG);
    expect(back.decisionZone).toBe('stay');
  });
});
