import { describe, expect, it, beforeEach } from 'bun:test';
import { createMetaLearningAlgorithm, type MetaLearningConfig } from './meta-learning';
import { createMockTrialResult } from '../../test-utils/test-factories';

type TestMetaLearningAlgo = ReturnType<typeof createMetaLearningAlgorithm> & {
  getCurrentParams(): any;
  getUserProfile(): any;
};

describe('MetaLearningAlgorithm', () => {
  const config: MetaLearningConfig = {
    targetDPrime: 1.5,
    initialNLevel: 2,
    mode: 'tempo',
  };

  let algo = createMetaLearningAlgorithm(config) as TestMetaLearningAlgo;

  const createAlgoResult = (index: number, result: string, modality = 'position') =>
    createMockTrialResult({
      trialIndex: index,
      responses: {
        [modality]: {
          result: result as any,
          pressed: result === 'hit' || result === 'false-alarm',
          wasTarget: result === 'hit' || result === 'miss',
          reactionTimeMs: 400,
        },
      },
    });

  beforeEach(() => {
    // @ts-expect-error test override
    algo = createMetaLearningAlgorithm(config);
    algo.initialize({ gameMode: 'tempo', userId: 'test', nLevel: 2, modalityIds: ['position'] });
  });

  describe('Layer 3: Real-Time Controller', () => {
    it('should adjust pTarget correctly', () => {
      // Very good performance (Hit=100%, FA=0%) -> dPrime high -> error > 0 -> pTarget should increase
      for (let i = 0; i < 20; i++) {
        algo.onTrialCompleted(createAlgoResult(i, i % 2 === 0 ? 'hit' : 'correct-rejection'));
      }
      expect(algo.getCurrentParams().pTarget).toBeGreaterThan(0.28);

      // Very bad performance (Hit=0%, FA=100%) -> dPrime low -> error < 0 -> pTarget should decrease
      // @ts-expect-error test override
      algo = createMetaLearningAlgorithm(config);
      algo.initialize({ gameMode: 'tempo', userId: 'test', nLevel: 2, modalityIds: ['position'] });
      for (let i = 0; i < 20; i++) {
        algo.onTrialCompleted(createAlgoResult(i, i % 2 === 0 ? 'miss' : 'false-alarm'));
      }
      expect(algo.getCurrentParams().pTarget).toBeLessThan(0.28);
    });

    it('should adjust pLure correctly', () => {
      for (let i = 0; i < 20; i++) {
        algo.onTrialCompleted(createAlgoResult(i, i % 2 === 0 ? 'hit' : 'correct-rejection'));
      }
      expect(algo.getCurrentParams().pLure).toBeGreaterThan(0.15);
    });

    it('should adjust stimulusDurationMs correctly', () => {
      for (let i = 0; i < 20; i++) {
        algo.onTrialCompleted(createAlgoResult(i, i % 2 === 0 ? 'hit' : 'correct-rejection'));
      }
      expect(algo.getCurrentParams().stimulusDurationMs).toBeLessThan(500);
    });

    it('should adjust isiMs ONLY in tempo mode', () => {
      // Tempo mode
      for (let i = 0; i < 20; i++) {
        algo.onTrialCompleted(createAlgoResult(i, i % 2 === 0 ? 'hit' : 'correct-rejection'));
      }
      expect(algo.getCurrentParams().isiMs).toBeLessThan(3000);

      // Memo mode
      const memoAlgo = createMetaLearningAlgorithm({ ...config, mode: 'memo' });
      memoAlgo.initialize({
        gameMode: 'memo',
        userId: 'test',
        nLevel: 2,
        modalityIds: ['position'],
      });
      for (let i = 0; i < 20; i++) {
        memoAlgo.onTrialCompleted(createAlgoResult(i, i % 2 === 0 ? 'hit' : 'correct-rejection'));
      }
      expect((memoAlgo as TestMetaLearningAlgo).getCurrentParams().isiMs).toBe(3000);
    });
  });

  describe('Layer 1: User Model (Bayesian)', () => {
    it('should update modality strengths', () => {
      // 20 trials with mixed outcomes
      for (let i = 0; i < 20; i++) {
        algo.onTrialCompleted(
          createMockTrialResult({
            trialIndex: i,
            responses: {
              position: {
                result: i % 2 === 0 ? 'hit' : 'correct-rejection',
                pressed: i % 2 === 0,
                wasTarget: i % 2 === 0,
                reactionTimeMs: 400,
              },
              audio: {
                result: i % 2 === 0 ? 'miss' : 'correct-rejection',
                pressed: false,
                wasTarget: i % 2 === 0,
                reactionTimeMs: 400,
              },
            },
          }),
        );
      }
      // Trigger learning at end of session (persist step in real app)
      algo.serialize();

      const profile = algo.getUserProfile();
      expect(profile.positionStrength).toBeGreaterThan(profile.audioStrength);
    });

    it('should track fatigue rate from performance decline', () => {
      // First 20 trials: Perfect
      for (let i = 0; i < 20; i++) {
        algo.onTrialCompleted(createAlgoResult(i, i % 2 === 0 ? 'hit' : 'correct-rejection'));
      }
      // Next 20 trials: All miss (fatigue)
      for (let i = 20; i < 40; i++) {
        algo.onTrialCompleted(createAlgoResult(i, 'miss'));
      }

      // Trigger learning at end of session (persist step in real app)
      algo.serialize();
      const profile = algo.getUserProfile();
      expect(profile.fatigueRate).toBeGreaterThan(0.001);
    });
  });

  describe('Layer 2: Adaptation Policy - Gain Evolution', () => {
    it('should increase gains when adjustments are effective', () => {
      // @ts-expect-error test override
      const initialGains = algo.getPolicyGains();

      // We want to simulate a scenario where dPrime is consistently improving
      // after each trial, making the adjustments seem "effective".
      for (let s = 0; s < 5; s++) {
        algo.initialize({
          gameMode: 'tempo',
          userId: 'test',
          nLevel: 2,
          modalityIds: ['position'],
        });
        for (let i = 0; i < 40; i++) {
          // Mixed results but slightly better over time to simulate positive dPrime change
          const result =
            i < 20
              ? i % 4 === 0
                ? 'hit'
                : 'correct-rejection'
              : i % 2 === 0
                ? 'hit'
                : 'correct-rejection';

          algo.onTrialCompleted(createAlgoResult(i, result));
        }
        // Close session so layer 1/2 learn from the session adjustments
        algo.serialize();
      }

      // @ts-expect-error test override
      const newGains = algo.getPolicyGains();
      // Since adjustments generally led to "better" dPrime (1.5 base -> higher),
      // some gains should have increased.
      expect(newGains.kTarget).not.toBe(initialGains.kTarget);
    });
  });

  describe('Internal Math Helpers', () => {
    it('should calculate dPrime correctly via window outcomes', () => {
      // Accessing internal calculateDPrimeFromWindow via onTrialCompleted and getEstimatedDPrime
      // 8 trials window. 4 targets, 4 noise.
      // Perfect performance: 4 hits, 4 CR.
      for (let i = 0; i < 8; i++) {
        algo.onTrialCompleted(createAlgoResult(i, i < 4 ? 'hit' : 'correct-rejection'));
      }
      // @ts-expect-error test override
      const dPrime = algo.getEstimatedDPrime();
      expect(dPrime).toBeGreaterThan(2.0); // Perfect performance gives high dPrime
    });

    it('should handle zero signal or noise trials by returning 1.5', () => {
      // @ts-expect-error test override
      algo = createMetaLearningAlgorithm(config);
      algo.initialize({ gameMode: 'tempo', userId: 'test', nLevel: 2, modalityIds: ['position'] });
      // 8 hits, 0 correct rejection
      for (let i = 0; i < 8; i++) {
        algo.onTrialCompleted(createAlgoResult(i, 'hit'));
      }
      // @ts-expect-error test override
      expect(algo.getEstimatedDPrime()).toBe(1.5);
    });
  });

  describe('History Initialization', () => {
    it('should initialize layers from historical data', () => {
      const historicalConfig: MetaLearningConfig = {
        ...config,
        historicalData: [
          {
            averageDPrime: 2.0,
            params: { nLevel: 2, pTarget: 0.3, pLure: 0.1, isiMs: 3000 },
            trials: [
              { modality: 'position', trialType: 'target', result: 'hit' },
              { modality: 'position', trialType: 'lure', result: 'correct-rejection' },
            ],
          },
        ],
      };

      const algoWithHistory = createMetaLearningAlgorithm(historicalConfig);
      const profile = (algoWithHistory as TestMetaLearningAlgo).getUserProfile();
      expect(profile.confidence).toBeGreaterThan(0);
    });
  });

  describe('Serialization & Restoration', () => {
    it('should serialize and restore all layers', () => {
      const state = algo.serialize();
      expect(state.algorithmType).toBe('meta-learning');

      const newAlgo = createMetaLearningAlgorithm(config);
      newAlgo.restore(state);

      expect((newAlgo as TestMetaLearningAlgo).getUserProfile().confidence).toBe(
        (algo as TestMetaLearningAlgo).getUserProfile().confidence,
      );
    });

    it('should throw for wrong type or version', () => {
      expect(() => algo.restore({ algorithmType: 'wrong', version: 1, data: {} })).toThrow();
      expect(() =>
        algo.restore({ algorithmType: 'meta-learning', version: 99, data: {} }),
      ).toThrow();
    });
  });

  describe('Reset', () => {
    it('should return to initial state', () => {
      for (let i = 0; i < 10; i++) algo.onTrialCompleted(createAlgoResult(i, 'hit'));
      algo.initialize({ gameMode: 'tempo', userId: 'test', nLevel: 2, modalityIds: ['position'] }); // Learn once

      algo.reset();
      expect((algo as TestMetaLearningAlgo).getUserProfile().confidence).toBe(0);
    });
  });
});
