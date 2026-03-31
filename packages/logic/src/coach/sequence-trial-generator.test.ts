import { describe, expect, it, beforeEach, mock, type Mock } from 'bun:test';
import { SequenceTrialGenerator } from './sequence-trial-generator';
import type { AdaptiveAlgorithm } from '../sequence';

describe('SequenceTrialGenerator', () => {
  const mockAlgorithm: AdaptiveAlgorithm = {
    name: 'test-algo',
    initialize: mock(() => {}),
    getSpec: mock(() => ({
      nLevel: 2,
      modalities: [
        { id: 'position', values: 8 },
        { id: 'audio', values: 8 },
      ],
      targetProbabilities: { position: 0.3, audio: 0.3 },
      lureProbabilities: { position: { 'n-1': 0.1 }, audio: { 'n-1': 0.1 } },
      hardConstraints: [],
      softConstraints: [],
      timing: { isiMs: 3000, stimulusDurationMs: 500 },
    })),
    onTrialCompleted: mock(() => {}),
    serialize: mock(() => ({ algorithmType: 'test-algo', version: 1, data: {} })),
    restore: mock(() => {}),
    reset: mock(() => {}),
  };

  const blockConfig = {
    nLevel: 2,
    activeModalities: ['position', 'audio'],
    trialsCount: 10,
    targetProbability: 0.3,
    lureProbability: 0.1,
    intervalSeconds: 3,
    stimulusDurationSeconds: 0.5,
  };

  const config = {
    blockConfig,
    algorithm: mockAlgorithm,
    totalTrials: 10,
    gameMode: 'tempo' as const,
  };

  let generator: SequenceTrialGenerator;

  beforeEach(() => {
    // Reset mocks
    (mockAlgorithm.initialize as Mock<any>).mockClear();
    (mockAlgorithm.getSpec as Mock<any>).mockClear();
    (mockAlgorithm.onTrialCompleted as Mock<any>).mockClear();

    generator = new SequenceTrialGenerator(config as any);
  });

  describe('Initialization', () => {
    it('should initialize the algorithm', () => {
      expect(mockAlgorithm.initialize).toHaveBeenCalled();
      // totalTrials includes N-level buffer trials
      expect(generator.getTotalTrials()).toBe(12);
      expect(generator.getNextIndex()).toBe(0);
    });
  });

  describe('Trial Generation', () => {
    it('should generate a trial and update state', () => {
      const trial = generator.generateNext();
      expect(trial.index).toBe(0);
      expect(generator.getNextIndex()).toBe(1);
      expect(generator.hasMore()).toBe(true);
      expect(mockAlgorithm.getSpec).toHaveBeenCalled();
    });

    it('should handle end of sequence', () => {
      for (let i = 0; i < generator.getTotalTrials(); i++) {
        generator.generateNext();
      }
      expect(generator.hasMore()).toBe(false);
    });

    it('should return all generated trials', () => {
      generator.generateNext();
      generator.generateNext();
      expect(generator.getGeneratedTrials()).toHaveLength(2);
    });
  });

  describe('Feedback & Performance', () => {
    it('should process correct target feedback', () => {
      // Generate buffer trials first (ignored for perf/adaptation)
      generator.generateNext(); // trial 0 (buffer)
      generator.generateNext(); // trial 1 (buffer)
      const scorableTrial = generator.generateNext(); // trial 2 (first scorable)

      // Feedback for trial 2 provided during generation of trial 3
      generator.generateNext({
        isTarget: true,
        isCorrect: true,
        reactionTime: 400,
      });

      const context = generator.getPerformanceContext();
      expect(context).not.toBeNull();
      expect(context?.trialCount).toBe(1);
      expect(context?.successStreak).toBe(1);
      expect(context?.errorStreak).toBe(0);
      expect(context?.avgReactionTime).toBe(400);

      const expectedHitRate =
        Number(scorableTrial.isPositionTarget) + Number(scorableTrial.isSoundTarget) > 0 ? 1 : 0;
      expect(context?.hitRate).toBe(expectedHitRate);
      expect(mockAlgorithm.onTrialCompleted).toHaveBeenCalled();
    });

    it('should process incorrect feedback', () => {
      generator.generateNext(); // trial 0 (buffer)
      generator.generateNext(); // trial 1 (buffer)
      generator.generateNext(); // trial 2 (first scorable)
      generator.generateNext({
        isTarget: true,
        isCorrect: false,
      });

      const context = generator.getPerformanceContext();
      expect(context?.hitRate).toBe(0);
      expect(context?.errorStreak).toBe(1);
    });

    it('should calculate dPrime correctly', () => {
      // Generate the full sequence and mark everything "correct" for simplicity.
      generator.generateNext(); // first trial, no feedback yet
      for (let i = 1; i < generator.getTotalTrials(); i++) {
        generator.generateNext({ isTarget: true, isCorrect: true });
      }
      // Process feedback for the final trial (no subsequent generateNext call)
      generator.processFeedback({ isTarget: true, isCorrect: true });

      const context = generator.getPerformanceContext();
      expect(context?.dPrime).toBeDefined();
      expect(typeof context?.dPrime).toBe('number');
    });
  });

  describe('Game Parameters & Zone', () => {
    it('should return game parameters in seconds', () => {
      const params = generator.getGameParameters();
      expect(params?.isi).toBe(3.0);
      expect(params?.stimulusDuration).toBe(0.5);
      expect(params?.pTarget).toBe(0.3);
    });

    it('should calculate difficulty and zone', () => {
      const difficulty = generator.getDifficulty();
      expect(difficulty).toBeGreaterThan(0);

      const zone = generator.getZoneNumber();
      expect(zone).toBeGreaterThanOrEqual(1);
      expect(zone).toBeLessThanOrEqual(20);
    });

    it('should return current N level', () => {
      expect(generator.getNLevel()).toBe(2);
    });

    it('should return current ISI', () => {
      expect(generator.getISI()).toBe(3.0);
    });
  });

  describe('Algorithm State', () => {
    it('should serialize and restore algorithm state', () => {
      const state = generator.serializeAlgorithmState();
      expect(state?.algorithmType).toBe('test-algo');

      generator.restoreAlgorithmState(state!);
      expect(mockAlgorithm.restore).toHaveBeenCalledWith(state!);
    });

    it('should return algorithm type', () => {
      expect(generator.getAlgorithmType()).toBe('test-algo');
    });
  });
});
