import { describe, expect, it, beforeEach } from 'bun:test';
import { PreGeneratedTrialGenerator } from './pre-generated-trial-generator';
import { GameConfig, SeededRandom, type Trial } from '../domain';

describe('PreGeneratedTrialGenerator', () => {
  const createMockTrial = (index: number): Trial => ({
    index,
    isBuffer: false,
    position: (index % 8) as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7,
    sound: 'C',
    color: 'ink-black',
    image: 'circle',
    trialType: 'Non-Cible',
    isPositionTarget: false,
    isSoundTarget: false,
    isColorTarget: false,
    isImageTarget: false,
    isPositionLure: undefined,
    isSoundLure: undefined,
    isColorLure: undefined,
    isImageLure: undefined,
    positionLureType: undefined,
    soundLureType: undefined,
    colorLureType: undefined,
    imageLureType: undefined,
  });

  const trials = [createMockTrial(0), createMockTrial(1), createMockTrial(2)];

  describe('Construction', () => {
    it('should initialize with config and registry', () => {
      const config = new GameConfig({
        generator: 'BrainWorkshop',
        nLevel: 2,
        trialsCount: 10, // Note: BrainWorkshop uses dynamic calculation (20 + n²)
      });
      const rng = new SeededRandom('test');
      const generator = new PreGeneratedTrialGenerator(config, rng);

      // BrainWorkshop: 20 + 2² = 24 total (buffer INCLUDED, not added separately)
      expect(generator.getTotalTrials()).toBe(24);
      expect(generator.isAdaptive()).toBe(false);
    });

    it('should create from existing trials using fromTrials', () => {
      const generator = PreGeneratedTrialGenerator.fromTrials(trials);
      expect(generator.getTotalTrials()).toBe(3);
      expect(generator.getNextIndex()).toBe(0);
    });
  });

  describe('Trial Generation', () => {
    let generator: PreGeneratedTrialGenerator;

    beforeEach(() => {
      generator = PreGeneratedTrialGenerator.fromTrials(trials);
    });

    it('should generate trials in sequence', () => {
      expect(generator.generateNext().index).toBe(0);
      expect(generator.generateNext().index).toBe(1);
      expect(generator.hasMore()).toBe(true);
      expect(generator.generateNext().index).toBe(2);
      expect(generator.hasMore()).toBe(false);
    });

    it('should throw error when no more trials', () => {
      generator.generateNext();
      generator.generateNext();
      generator.generateNext();
      expect(() => generator.generateNext()).toThrow(/No more trials/);
    });

    it('should return generated trials', () => {
      generator.generateNext();
      const generated = generator.getGeneratedTrials();
      expect(generated).toHaveLength(1);
      expect(generated[0]!.index).toBe(0);
    });
  });

  describe('Non-Adaptive Methods', () => {
    let generator: PreGeneratedTrialGenerator;

    beforeEach(() => {
      generator = PreGeneratedTrialGenerator.fromTrials(trials);
    });

    it('should return null for adaptive parameters', () => {
      expect(generator.getGameParameters()).toBeNull();
      expect(generator.getDifficulty()).toBeNull();
      expect(generator.getLureProbability()).toBeNull();
      expect(generator.getTargetProbability()).toBeNull();
      expect(generator.getISI()).toBeNull();
      expect(generator.getPerformanceContext()).toBeNull();
      expect(generator.getZoneNumber()).toBeNull();
    });

    it('should do nothing on processFeedback', () => {
      expect(() => generator.processFeedback()).not.toThrow();
    });
  });
});
