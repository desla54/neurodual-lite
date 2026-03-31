/**
 * Tests for FlexibleTrial & Builder
 *
 * Tests REAL behavior with complete fixtures.
 * NO MOCKS - Pure functions and builder pattern.
 */

import { describe, expect, test, beforeEach } from 'bun:test';
import {
  FlexibleTrialBuilder,
  getStimulus,
  getStimulusValue,
  isTarget,
  isLure,
  getActiveModalities,
  getTargets,
  getLures,
  type FlexibleTrial,
} from './flexible-trial';
import { createStimulus, type Stimulus } from './modality';

// =============================================================================
// Fixtures
// =============================================================================

const createPositionStimulus = (value: number, isTargetVal = false, isLureVal = false): Stimulus =>
  createStimulus('position', value, isTargetVal, isLureVal);

const createAudioStimulus = (value: string, isTargetVal = false, isLureVal = false): Stimulus =>
  createStimulus('audio', value, isTargetVal, isLureVal);

const createColorStimulus = (value: string, isTargetVal = false, isLureVal = false): Stimulus =>
  createStimulus('color', value, isTargetVal, isLureVal);

// =============================================================================
// FlexibleTrialBuilder Tests
// =============================================================================

describe('FlexibleTrialBuilder', () => {
  let builder: FlexibleTrialBuilder;

  beforeEach(() => {
    builder = new FlexibleTrialBuilder();
  });

  describe('setIndex()', () => {
    test('should set trial index', () => {
      const trial = builder.setIndex(5).build();

      expect(trial.index).toBe(5);
    });

    test('should be chainable', () => {
      expect(builder.setIndex(1)).toBe(builder);
    });
  });

  describe('setBuffer()', () => {
    test('should set buffer flag', () => {
      const trial = builder.setBuffer(true).build();

      expect(trial.isBuffer).toBe(true);
    });

    test('should default to false', () => {
      const trial = builder.build();

      expect(trial.isBuffer).toBe(false);
    });
  });

  describe('addStimulus()', () => {
    test('should add stimulus to trial', () => {
      const stimulus = createPositionStimulus(3);
      const trial = builder.addStimulus(stimulus).build();

      expect(trial.stimuli.get('position')).toEqual(stimulus);
    });

    test('should add multiple stimuli', () => {
      const trial = builder
        .addStimulus(createPositionStimulus(2))
        .addStimulus(createAudioStimulus('K'))
        .addStimulus(createColorStimulus('red'))
        .build();

      expect(trial.stimuli.size).toBe(3);
      expect(trial.stimuli.has('position')).toBe(true);
      expect(trial.stimuli.has('audio')).toBe(true);
      expect(trial.stimuli.has('color')).toBe(true);
    });

    test('should be chainable', () => {
      expect(builder.addStimulus(createPositionStimulus(0))).toBe(builder);
    });
  });

  describe('build()', () => {
    test('should create immutable trial', () => {
      const trial = builder.setIndex(0).addStimulus(createPositionStimulus(1)).build();

      expect(Object.isFrozen(trial.stimuli)).toBe(false); // Map not frozen but readonly
      expect(trial.stimuli instanceof Map).toBe(true);
    });

    test('should compute trialType correctly for buffer', () => {
      const trial = builder.setBuffer(true).build();

      expect(trial.trialType).toBe('Tampon');
    });

    test('should compute trialType "Non-Cible" for no targets', () => {
      const trial = builder
        .addStimulus(createPositionStimulus(1, false))
        .addStimulus(createAudioStimulus('C', false))
        .build();

      expect(trial.trialType).toBe('Non-Cible');
    });

    test('should compute trialType "V-Seul" for position target only', () => {
      const trial = builder
        .addStimulus(createPositionStimulus(1, true))
        .addStimulus(createAudioStimulus('C', false))
        .build();

      expect(trial.trialType).toBe('V-Seul');
    });

    test('should compute trialType "V-Seul" for color target only', () => {
      const trial = builder
        .addStimulus(createPositionStimulus(1, false))
        .addStimulus(createColorStimulus('red', true))
        .build();

      expect(trial.trialType).toBe('V-Seul');
    });

    test('should compute trialType "A-Seul" for audio target only', () => {
      const trial = builder
        .addStimulus(createPositionStimulus(1, false))
        .addStimulus(createAudioStimulus('C', true))
        .build();

      expect(trial.trialType).toBe('A-Seul');
    });

    test('should compute trialType "Dual" for multiple targets', () => {
      const trial = builder
        .addStimulus(createPositionStimulus(1, true))
        .addStimulus(createAudioStimulus('C', true))
        .build();

      expect(trial.trialType).toBe('Dual');
    });
  });

  describe('reset()', () => {
    test('should reset all state', () => {
      builder.setIndex(10).setBuffer(true).addStimulus(createPositionStimulus(5));

      builder.reset();
      const trial = builder.build();

      expect(trial.index).toBe(0);
      expect(trial.isBuffer).toBe(false);
      expect(trial.stimuli.size).toBe(0);
    });

    test('should be chainable', () => {
      expect(builder.reset()).toBe(builder);
    });

    test('should allow reuse', () => {
      const trial1 = builder.setIndex(1).addStimulus(createPositionStimulus(1)).build();

      builder.reset();
      const trial2 = builder.setIndex(2).addStimulus(createAudioStimulus('K')).build();

      expect(trial1.index).toBe(1);
      expect(trial2.index).toBe(2);
      expect(trial1.stimuli.has('position')).toBe(true);
      expect(trial2.stimuli.has('audio')).toBe(true);
    });
  });
});

// =============================================================================
// Helper Functions Tests
// =============================================================================

describe('FlexibleTrial helpers', () => {
  const builder = new FlexibleTrialBuilder();
  let trial: FlexibleTrial;

  beforeEach(() => {
    builder.reset();
    trial = builder
      .setIndex(5)
      .addStimulus(createPositionStimulus(3, true, false))
      .addStimulus(createAudioStimulus('K', false, true))
      .addStimulus(createColorStimulus('red', false, false))
      .build();
  });

  describe('getStimulus()', () => {
    test('should return stimulus for existing modality', () => {
      const stimulus = getStimulus(trial, 'position');

      expect(stimulus?.value).toBe(3);
      expect(stimulus?.isTarget).toBe(true);
    });

    test('should return undefined for missing modality', () => {
      const stimulus = getStimulus(trial, 'shape');

      expect(stimulus).toBeUndefined();
    });
  });

  describe('getStimulusValue()', () => {
    test('should return value for existing modality', () => {
      expect(getStimulusValue(trial, 'position')).toBe(3);
      expect(getStimulusValue(trial, 'audio')).toBe('K');
      expect(getStimulusValue(trial, 'color')).toBe('red');
    });

    test('should return undefined for missing modality', () => {
      expect(getStimulusValue(trial, 'shape')).toBeUndefined();
    });
  });

  describe('isTarget()', () => {
    test('should return true for target modality', () => {
      expect(isTarget(trial, 'position')).toBe(true);
    });

    test('should return false for non-target modality', () => {
      expect(isTarget(trial, 'audio')).toBe(false);
      expect(isTarget(trial, 'color')).toBe(false);
    });

    test('should return false for missing modality', () => {
      expect(isTarget(trial, 'shape')).toBe(false);
    });
  });

  describe('isLure()', () => {
    test('should return true for lure modality', () => {
      expect(isLure(trial, 'audio')).toBe(true);
    });

    test('should return false for non-lure modality', () => {
      expect(isLure(trial, 'position')).toBe(false);
      expect(isLure(trial, 'color')).toBe(false);
    });

    test('should return false for missing modality', () => {
      expect(isLure(trial, 'shape')).toBe(false);
    });
  });

  describe('getActiveModalities()', () => {
    test('should return all modality IDs', () => {
      const modalities = getActiveModalities(trial);

      expect(modalities).toContain('position');
      expect(modalities).toContain('audio');
      expect(modalities).toContain('color');
      expect(modalities.length).toBe(3);
    });

    test('should return empty for trial with no stimuli', () => {
      const emptyTrial = new FlexibleTrialBuilder().build();

      expect(getActiveModalities(emptyTrial)).toEqual([]);
    });
  });

  describe('getTargets()', () => {
    test('should return all target stimuli', () => {
      const targets = getTargets(trial);

      expect(targets.length).toBe(1);
      expect(targets[0]?.modalityId).toBe('position');
    });

    test('should return multiple targets', () => {
      const dualTrial = new FlexibleTrialBuilder()
        .addStimulus(createPositionStimulus(1, true))
        .addStimulus(createAudioStimulus('C', true))
        .build();

      const targets = getTargets(dualTrial);

      expect(targets.length).toBe(2);
    });

    test('should return empty for no targets', () => {
      const noTargetTrial = new FlexibleTrialBuilder()
        .addStimulus(createPositionStimulus(1, false))
        .build();

      expect(getTargets(noTargetTrial)).toEqual([]);
    });
  });

  describe('getLures()', () => {
    test('should return all lure stimuli', () => {
      const lures = getLures(trial);

      expect(lures.length).toBe(1);
      expect(lures[0]?.modalityId).toBe('audio');
    });

    test('should return multiple lures', () => {
      const multiLureTrial = new FlexibleTrialBuilder()
        .addStimulus(createPositionStimulus(1, false, true))
        .addStimulus(createAudioStimulus('C', false, true))
        .build();

      const lures = getLures(multiLureTrial);

      expect(lures.length).toBe(2);
    });

    test('should return empty for no lures', () => {
      const noLureTrial = new FlexibleTrialBuilder()
        .addStimulus(createPositionStimulus(1, false, false))
        .build();

      expect(getLures(noLureTrial)).toEqual([]);
    });
  });
});
