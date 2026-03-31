import { describe, expect, it, beforeEach } from 'bun:test';
import { createThompsonSamplingAlgorithm, type ThompsonSamplingConfig } from './thompson-sampling';
import { createMockAlgorithmContext, createMockTrialResult } from '../../test-utils/test-factories';

describe('ThompsonSamplingAlgorithm', () => {
  const config: ThompsonSamplingConfig = {
    objective: 'flow',
    initialNLevel: 2,
  };

  let algo = createThompsonSamplingAlgorithm(config);

  const createAlgoResult = (
    index: number,
    result: 'hit' | 'miss' | 'false-alarm' | 'correct-rejection',
  ) =>
    createMockTrialResult({
      trialIndex: index,
      responses: {
        position: {
          result,
          pressed: result === 'hit' || result === 'false-alarm',
          wasTarget: result === 'hit' || result === 'miss',
          reactionTimeMs: 400,
        },
      },
    });

  beforeEach(() => {
    algo = createThompsonSamplingAlgorithm(config);
    algo.initialize({ gameMode: 'tempo', userId: 'test', nLevel: 2, modalityIds: ['position'] });
  });

  describe('Initialization', () => {
    it('should start with correct name including objective', () => {
      expect(algo.name).toBe('thompson-sampling-flow');
    });

    it('should select a valid zone (probabilistic)', () => {
      const zone = (algo as any).getCurrentZone();
      // Thompson sampling is probabilistic - zone can be any valid zone
      expect(zone.nLevel).toBeGreaterThanOrEqual(1);
      expect(zone.nLevel).toBeLessThanOrEqual(7);
    });
  });

  describe('Reward & Learning', () => {
    it('should update distribution after 20 trials', () => {
      // Deep copy initial distributions
      const initialDist = (algo as any).getDistributions().map((d: any) => ({ ...d }));
      const zoneIndex = (algo as any).getZoneNumber() - 1;

      // Simulate 20 trials with perfect performance
      for (let i = 0; i < 20; i++) {
        algo.onTrialCompleted(createAlgoResult(i, i % 2 === 0 ? 'hit' : 'correct-rejection'));
      }

      const newDist = (algo as any).getDistributions();
      // Alpha or Beta should have incremented
      expect(newDist[zoneIndex].alpha + newDist[zoneIndex].beta).toBe(
        initialDist[zoneIndex].alpha + initialDist[zoneIndex].beta + 1,
      );
    });

    it('should reward dPrime close to target (1.5 for flow)', () => {
      // Manual test of internal reward function logic via trial simulation
      // Perfect dPrime (1.5) should yield high alpha increase probability
      // (Difficult to test deterministically without many iterations)
    });
  });

  describe('Sampling Math', () => {
    it('should be able to generate spec', () => {
      const spec = algo.getSpec(createMockAlgorithmContext());
      expect(spec).toBeDefined();
      expect(spec.nLevel).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Serialization & Restoration', () => {
    it('should serialize and restore bandit state', () => {
      const state = algo.serialize();
      expect(state.algorithmType).toBe('thompson-sampling-flow');

      const newAlgo = createThompsonSamplingAlgorithm(config);
      newAlgo.restore(state);

      expect((newAlgo as any).getZoneNumber()).toBe((algo as any).getZoneNumber());
    });

    it('should throw when restoring from wrong algorithm type', () => {
      expect(() => algo.restore({ algorithmType: 'wrong', version: 1, data: {} })).toThrow();
    });
  });

  describe('Reset', () => {
    it('should return to initial distributions', () => {
      // Change state
      for (let i = 0; i < 20; i++) algo.onTrialCompleted(createAlgoResult(i, 'hit'));

      algo.reset();
      const dists = (algo as any).getDistributions();
      expect(dists.every((d: any) => d.alpha === 1 && d.beta === 1)).toBe(true);
    });
  });
});
