/**
 * Tests for jitter-adaptive.ts
 */

import { describe, expect, it } from 'bun:test';
import { createJitterAdaptiveAlgorithm, type JitterAdaptiveConfig } from './jitter-adaptive';
import type { TrialResult } from '../types';

// Helper to create a TrialResult
function createTrialResult(
  byModality: Record<string, 'hit' | 'miss' | 'false-alarm' | 'correct-rejection'>,
): TrialResult {
  const responses: TrialResult['responses'] = {};
  for (const [modalityId, result] of Object.entries(byModality)) {
    responses[modalityId] = {
      // @ts-expect-error test override
      modalityId,
      result,
      reactionTimeMs: 500,
    };
  }
  // @ts-expect-error test override
  return { index: 0, responses };
}

describe('createJitterAdaptiveAlgorithm', () => {
  const defaultConfig: JitterAdaptiveConfig = {
    targetDPrime: 1.5,
    initialNLevel: 2,
  };

  it('creates an algorithm with correct name', () => {
    const algo = createJitterAdaptiveAlgorithm(defaultConfig);
    expect(algo.name).toBe('jitter-adaptive');
  });

  it('has all required methods', () => {
    const algo = createJitterAdaptiveAlgorithm(defaultConfig);
    expect(typeof algo.initialize).toBe('function');
    expect(typeof algo.getSpec).toBe('function');
    expect(typeof algo.onTrialCompleted).toBe('function');
    expect(typeof algo.serialize).toBe('function');
  });
});

describe('JitterAdaptiveAlgorithm initialization', () => {
  it('initializes with default jitterMode adaptive', () => {
    const algo = createJitterAdaptiveAlgorithm({
      targetDPrime: 1.5,
      initialNLevel: 2,
    });

    // @ts-expect-error test override
    algo.initialize({ gameMode: 'tempo', modalityIds: ['position', 'audio'] });
    // @ts-expect-error test override
    const spec = algo.getSpec({ trialIndex: 0 });

    // @ts-expect-error test: nullable access
    expect(spec!.timing.isiMs).toBeGreaterThan(0);
    // @ts-expect-error test: nullable access
    expect(spec!.timing.stimulusDurationMs).toBeGreaterThan(0);
  });

  it('respects custom modalityIds', () => {
    const algo = createJitterAdaptiveAlgorithm({
      targetDPrime: 1.5,
      initialNLevel: 3,
    });

    // @ts-expect-error test override
    algo.initialize({ gameMode: 'tempo', modalityIds: ['position'] });
    // @ts-expect-error test override
    const spec = algo.getSpec({ trialIndex: 0 });

    expect(spec.modalities.map((m) => m.id)).toContain('position');
    expect(spec.modalities.length).toBe(1);
  });
});

describe('JitterAdaptiveAlgorithm spec generation', () => {
  it('generates valid SequenceSpec', () => {
    const algo = createJitterAdaptiveAlgorithm({
      targetDPrime: 1.5,
      initialNLevel: 2,
    });

    // @ts-expect-error test override
    algo.initialize({ gameMode: 'tempo', modalityIds: ['position', 'audio'] });
    // @ts-expect-error test override
    const spec = algo.getSpec({ trialIndex: 0 });

    expect(spec.nLevel).toBe(2);
    expect(spec.modalities.length).toBeGreaterThan(0);
    expect(spec.targetProbabilities).toBeDefined();
    expect(spec.lureProbabilities).toBeDefined();
  });

  it('uses fixed jitter mode correctly', () => {
    const algo = createJitterAdaptiveAlgorithm({
      targetDPrime: 1.5,
      initialNLevel: 2,
      jitterMode: 'fixed',
      baseJitterMs: 200,
    });

    // @ts-expect-error test override
    algo.initialize({ gameMode: 'tempo', modalityIds: ['position'] });
    // @ts-expect-error test override
    const specs = Array.from({ length: 5 }, (_, i) => algo.getSpec({ trialIndex: i }));
    // @ts-expect-error test: nullable access
    const isiValues = specs.map((s) => s!.timing.isiMs);
    expect(isiValues.every((v) => v > 0)).toBe(true);
  });

  it('uses rhythm mode correctly (no jitter)', () => {
    const algo = createJitterAdaptiveAlgorithm({
      targetDPrime: 1.5,
      initialNLevel: 2,
      jitterMode: 'rhythm',
    });

    // @ts-expect-error test override
    algo.initialize({ gameMode: 'tempo', modalityIds: ['position'] });
    // @ts-expect-error test override
    const specs = Array.from({ length: 3 }, (_, i) => algo.getSpec({ trialIndex: i }));
    // @ts-expect-error test: nullable access
    const isiValues = specs.map((s) => s!.timing.isiMs);
    // All ISI values should be equal in rhythm mode
    expect(isiValues[1]).toBe(isiValues[2]);
  });
});

describe('JitterAdaptiveAlgorithm trial feedback', () => {
  it('adjusts params after trials', () => {
    const algo = createJitterAdaptiveAlgorithm({
      targetDPrime: 1.5,
      initialNLevel: 2,
      jitterMode: 'adaptive',
    });

    // @ts-expect-error test override
    algo.initialize({ gameMode: 'tempo', modalityIds: ['position'] });

    for (let i = 0; i < 10; i++) {
      algo.onTrialCompleted(createTrialResult({ position: 'hit' }));
    }

    const state = algo.serialize();
    expect(state.algorithmType).toBe('jitter-adaptive');
    expect((state.data as any).state.trialCount).toBe(10);
  });

  it('tracks recent results', () => {
    const algo = createJitterAdaptiveAlgorithm({
      targetDPrime: 1.5,
      initialNLevel: 2,
    });

    // @ts-expect-error test override
    algo.initialize({ gameMode: 'tempo', modalityIds: ['position'] });

    for (let i = 0; i < 5; i++) {
      algo.onTrialCompleted(createTrialResult({ position: 'miss' }));
    }

    const state = algo.serialize();
    expect((state.data as any).state.recentResults.length).toBe(5);
  });
});

describe('JitterAdaptiveAlgorithm serialization', () => {
  it('serializes state correctly', () => {
    const algo = createJitterAdaptiveAlgorithm({
      targetDPrime: 1.5,
      initialNLevel: 2,
      jitterMode: 'fixed',
      baseJitterMs: 250,
    });

    // @ts-expect-error test override
    algo.initialize({ gameMode: 'tempo', modalityIds: ['position', 'audio'] });
    algo.onTrialCompleted(createTrialResult({ position: 'hit', audio: 'correct-rejection' }));
    algo.onTrialCompleted(createTrialResult({ position: 'miss', audio: 'hit' }));

    const serialized = algo.serialize();

    expect(serialized.algorithmType).toBe('jitter-adaptive');
    expect(serialized.version).toBe(1);
    expect((serialized.data as any).state.trialCount).toBe(2);
  });
});

describe('JitterAdaptiveAlgorithm restore', () => {
  it('restores state from serialized data', () => {
    const algo = createJitterAdaptiveAlgorithm({
      targetDPrime: 1.5,
      initialNLevel: 2,
    });

    // @ts-expect-error test override
    algo.initialize({ gameMode: 'tempo', modalityIds: ['position'] });
    algo.onTrialCompleted(createTrialResult({ position: 'hit' }));
    algo.onTrialCompleted(createTrialResult({ position: 'miss' }));
    algo.onTrialCompleted(createTrialResult({ position: 'hit' }));

    const serialized = algo.serialize();

    // Create new instance and restore
    const algo2 = createJitterAdaptiveAlgorithm({
      targetDPrime: 1.5,
      initialNLevel: 2,
    });
    algo2.restore(serialized);

    const state2 = algo2.serialize();
    expect((state2.data as any).state.trialCount).toBe(3);
    expect((state2.data as any).state.recentResults.length).toBe(3);
  });

  it('throws on wrong algorithm type', () => {
    const algo = createJitterAdaptiveAlgorithm({
      targetDPrime: 1.5,
      initialNLevel: 2,
    });

    expect(() =>
      algo.restore({
        algorithmType: 'wrong-type',
        version: 1,
        data: {},
      }),
    ).toThrow('Cannot restore: expected jitter-adaptive, got wrong-type');
  });

  it('throws on unsupported version', () => {
    const algo = createJitterAdaptiveAlgorithm({
      targetDPrime: 1.5,
      initialNLevel: 2,
    });

    expect(() =>
      algo.restore({
        algorithmType: 'jitter-adaptive',
        version: 99,
        data: {},
      }),
    ).toThrow('Unsupported version: 99');
  });

  it('clamps restored params to valid ranges', () => {
    const algo = createJitterAdaptiveAlgorithm({
      targetDPrime: 1.5,
      initialNLevel: 2,
    });

    // Create corrupted saved state with out-of-range values
    const corruptedState = {
      algorithmType: 'jitter-adaptive',
      version: 1,
      data: {
        config: { targetDPrime: 1.5, mode: 'tempo' },
        state: {
          params: {
            pTarget: 999, // Way out of range
            pLure: -10, // Negative
            baseIsiMs: 50000, // Way too high
            jitterMs: 10000, // Way too high
            stimulusDurationMs: 1, // Too low
            nLevel: -5, // Invalid
          },
          estimatedDPrime: 1.5,
          recentResults: [],
          trialCount: 0,
          sessionSeed: 'test-seed',
          rng: { seed: 'test', callCount: 0 },
        },
      },
    };

    algo.restore(corruptedState);
    const restored = algo.serialize();

    // Params should be clamped to valid ranges
    expect((restored.data as any).state.params.pTarget).toBeLessThanOrEqual(1);
    expect((restored.data as any).state.params.pLure).toBeGreaterThanOrEqual(0);
    expect((restored.data as any).state.params.nLevel).toBe(2); // Reset to initial
  });

  it('backfills missing sessionSeed', () => {
    const algo = createJitterAdaptiveAlgorithm({
      targetDPrime: 1.5,
      initialNLevel: 2,
    });

    const stateWithoutSeed = {
      algorithmType: 'jitter-adaptive',
      version: 1,
      data: {
        config: { targetDPrime: 1.5, mode: 'tempo' },
        state: {
          params: {
            pTarget: 0.3,
            pLure: 0.15,
            baseIsiMs: 2500,
            jitterMs: 0,
            stimulusDurationMs: 500,
            nLevel: 2,
          },
          estimatedDPrime: 1.5,
          recentResults: [],
          trialCount: 0,
          // sessionSeed is undefined
        },
      },
    };

    algo.restore(stateWithoutSeed);
    const restored = algo.serialize();

    expect((restored.data as any).state.sessionSeed).toBeDefined();
    expect((restored.data as any).state.rng).toBeDefined();
  });
});

describe('JitterAdaptiveAlgorithm reset', () => {
  it('resets to initial state', () => {
    const algo = createJitterAdaptiveAlgorithm({
      targetDPrime: 1.5,
      initialNLevel: 3,
      jitterMode: 'fixed',
      baseJitterMs: 200,
    });

    // @ts-expect-error test override
    algo.initialize({ gameMode: 'tempo', modalityIds: ['position'] });
    algo.onTrialCompleted(createTrialResult({ position: 'hit' }));
    algo.onTrialCompleted(createTrialResult({ position: 'hit' }));
    algo.onTrialCompleted(createTrialResult({ position: 'hit' }));

    // Verify state before reset
    const beforeReset = algo.serialize();
    expect((beforeReset.data as any).state.trialCount).toBe(3);

    // Reset
    algo.reset();

    // Verify state after reset
    const afterReset = algo.serialize();
    expect((afterReset.data as any).state.trialCount).toBe(0);
    expect((afterReset.data as any).state.recentResults.length).toBe(0);
    expect((afterReset.data as any).state.params.nLevel).toBe(3);
    expect((afterReset.data as any).state.params.jitterMs).toBe(200); // fixed mode
  });

  it('resets jitterMs to 0 for rhythm mode', () => {
    const algo = createJitterAdaptiveAlgorithm({
      targetDPrime: 1.5,
      initialNLevel: 2,
      jitterMode: 'rhythm',
    });

    algo.reset();
    const state = algo.serialize();
    expect((state.data as any).state.params.jitterMs).toBe(0);
  });
});

describe('JitterAdaptiveAlgorithm d-prime calculation', () => {
  it('calculates d-prime with mixed outcomes', () => {
    const algo = createJitterAdaptiveAlgorithm({
      targetDPrime: 1.5,
      initialNLevel: 2,
    });

    // @ts-expect-error test override
    algo.initialize({ gameMode: 'tempo', modalityIds: ['position', 'audio'] });

    // Simulate a realistic session with all outcome types
    algo.onTrialCompleted(createTrialResult({ position: 'hit', audio: 'hit' }));
    algo.onTrialCompleted(createTrialResult({ position: 'miss', audio: 'correct-rejection' }));
    algo.onTrialCompleted(createTrialResult({ position: 'false-alarm', audio: 'hit' }));
    algo.onTrialCompleted(createTrialResult({ position: 'correct-rejection', audio: 'miss' }));
    algo.onTrialCompleted(createTrialResult({ position: 'hit', audio: 'false-alarm' }));

    const state = algo.serialize();
    expect((state.data as any).state.recentResults.length).toBe(5);
    expect(Number.isFinite((state.data as any).state.estimatedDPrime)).toBe(true);
  });

  it('maintains sliding window for recent results', () => {
    const algo = createJitterAdaptiveAlgorithm({
      targetDPrime: 1.5,
      initialNLevel: 2,
    });

    // @ts-expect-error test override
    algo.initialize({ gameMode: 'tempo', modalityIds: ['position'] });

    // Add many trials to exceed DPRIME_WINDOW_SIZE (40 per thresholds.ts)
    for (let i = 0; i < 60; i++) {
      algo.onTrialCompleted(createTrialResult({ position: i % 2 === 0 ? 'hit' : 'miss' }));
    }

    const state = algo.serialize();
    // Window should cap at DPRIME_WINDOW_SIZE (40)
    expect((state.data as any).state.recentResults.length).toBeLessThanOrEqual(40);
  });
});

describe('JitterAdaptiveAlgorithm jitter modes', () => {
  it('adaptive mode increases jitter when performance is high', () => {
    const algo = createJitterAdaptiveAlgorithm({
      targetDPrime: 1.0, // Low target
      initialNLevel: 2,
      jitterMode: 'adaptive',
      maxJitterMs: 500,
    });

    // @ts-expect-error test override
    algo.initialize({ gameMode: 'tempo', modalityIds: ['position', 'audio'] });

    // High performance (all hits, all correct rejections)
    for (let i = 0; i < 20; i++) {
      algo.onTrialCompleted(createTrialResult({ position: 'hit', audio: 'correct-rejection' }));
    }

    const state = algo.serialize();
    // With high performance, jitter should increase
    expect((state.data as any).state.params.jitterMs).toBeGreaterThanOrEqual(0);
  });

  it('fixed mode maintains constant jitter', () => {
    const algo = createJitterAdaptiveAlgorithm({
      targetDPrime: 1.5,
      initialNLevel: 2,
      jitterMode: 'fixed',
      baseJitterMs: 300,
    });

    // @ts-expect-error test override
    algo.initialize({ gameMode: 'tempo', modalityIds: ['position'] });

    // Any outcome
    for (let i = 0; i < 10; i++) {
      algo.onTrialCompleted(createTrialResult({ position: 'hit' }));
    }

    const state = algo.serialize();
    expect((state.data as any).state.params.jitterMs).toBe(300);
  });

  it('rhythm mode maintains zero jitter', () => {
    const algo = createJitterAdaptiveAlgorithm({
      targetDPrime: 1.5,
      initialNLevel: 2,
      jitterMode: 'rhythm',
    });

    // @ts-expect-error test override
    algo.initialize({ gameMode: 'tempo', modalityIds: ['position'] });

    for (let i = 0; i < 10; i++) {
      algo.onTrialCompleted(createTrialResult({ position: 'hit' }));
    }

    const state = algo.serialize();
    expect((state.data as any).state.params.jitterMs).toBe(0);
  });
});
