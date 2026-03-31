/**
 * Tests for Trial Adapter
 *
 * Tests conversion from FlexibleTrial to Trial format.
 * NO MOCKS - Pure conversion functions.
 */

import { describe, expect, test } from 'bun:test';
import {
  toTrial,
  toTrials,
  isFlexibleTrial,
  getPosition,
  getSound,
  getColor,
} from './trial-adapter';
import { FlexibleTrialBuilder } from './flexible-trial';
import { createStimulus } from './modality';
import type { Trial } from '../types';

// =============================================================================
// Fixtures
// =============================================================================

const createLegacyTrial = (overrides: Partial<Trial> = {}): Trial => ({
  index: 0,
  isBuffer: false,
  position: 3,
  sound: 'K',
  color: 'ink-black',
  image: 'circle',
  trialType: 'Non-Cible',
  isPositionTarget: false,
  isSoundTarget: false,
  isColorTarget: false,
  isImageTarget: false,
  isPositionLure: false,
  isSoundLure: false,
  isColorLure: false,
  isImageLure: false,
  positionLureType: undefined,
  soundLureType: undefined,
  colorLureType: undefined,
  imageLureType: undefined,
  ...overrides,
});

const createFlexibleTrialViaBuilder = (
  config: {
    index?: number;
    isBuffer?: boolean;
    position?: { value: number; isTarget?: boolean; isLure?: boolean };
    audio?: { value: string; isTarget?: boolean; isLure?: boolean };
    color?: { value: string; isTarget?: boolean; isLure?: boolean };
  } = {},
) => {
  const builder = new FlexibleTrialBuilder();
  builder.setIndex(config.index ?? 0);
  builder.setBuffer(config.isBuffer ?? false);

  if (config.position) {
    builder.addStimulus(
      createStimulus(
        'position',
        config.position.value,
        config.position.isTarget ?? false,
        config.position.isLure ?? false,
      ),
    );
  }
  if (config.audio) {
    builder.addStimulus(
      createStimulus(
        'audio',
        config.audio.value,
        config.audio.isTarget ?? false,
        config.audio.isLure ?? false,
      ),
    );
  }
  if (config.color) {
    builder.addStimulus(
      createStimulus(
        'color',
        config.color.value,
        config.color.isTarget ?? false,
        config.color.isLure ?? false,
      ),
    );
  }

  return builder.build();
};

// =============================================================================
// toTrial Tests (FlexibleTrial → Legacy Trial)
// =============================================================================

describe('toTrial()', () => {
  test('should convert basic properties', () => {
    const flexible = createFlexibleTrialViaBuilder({
      index: 5,
      isBuffer: true,
    });

    const legacy = toTrial(flexible);

    expect(legacy.index).toBe(5);
    expect(legacy.isBuffer).toBe(true);
  });

  test('should convert position stimulus', () => {
    const flexible = createFlexibleTrialViaBuilder({
      position: { value: 7, isTarget: true, isLure: false },
    });

    const legacy = toTrial(flexible);

    expect(legacy.position).toBe(7);
    expect(legacy.isPositionTarget).toBe(true);
    expect(legacy.isPositionLure).toBe(false);
  });

  test('should convert audio stimulus', () => {
    const flexible = createFlexibleTrialViaBuilder({
      audio: { value: 'R', isTarget: false, isLure: true },
    });

    const legacy = toTrial(flexible);

    expect(legacy.sound).toBe('R');
    expect(legacy.isSoundTarget).toBe(false);
    expect(legacy.isSoundLure).toBe(true);
  });

  test('should convert color stimulus', () => {
    const flexible = createFlexibleTrialViaBuilder({
      color: { value: 'red', isTarget: true, isLure: false },
    });

    const legacy = toTrial(flexible);

    // @ts-expect-error test override
    expect(legacy.color).toBe('red');
    expect(legacy.isColorTarget).toBe(true);
    expect(legacy.isColorLure).toBe(false);
  });

  test('should use defaults for missing stimuli', () => {
    const flexible = new FlexibleTrialBuilder().build();

    const legacy = toTrial(flexible);

    expect(legacy.position).toBe(0);
    expect(legacy.sound).toBe('C');
    expect(legacy.color).toBe('ink-black');
    expect(legacy.image).toBe('circle');
    expect(legacy.isPositionTarget).toBe(false);
    expect(legacy.isSoundTarget).toBe(false);
    expect(legacy.isColorTarget).toBe(false);
    expect(legacy.isImageTarget).toBe(false);
  });

  test('should preserve trialType', () => {
    const flexible = createFlexibleTrialViaBuilder({
      position: { value: 1, isTarget: true },
      audio: { value: 'C', isTarget: true },
    });

    const legacy = toTrial(flexible);

    expect(legacy.trialType).toBe('Dual');
  });
});

describe('toTrials()', () => {
  test('should convert array of FlexibleTrial', () => {
    const flexibles = [
      createFlexibleTrialViaBuilder({ index: 0 }),
      createFlexibleTrialViaBuilder({ index: 1 }),
      createFlexibleTrialViaBuilder({ index: 2 }),
    ];

    const legacies = toTrials(flexibles);

    expect(legacies.length).toBe(3);
    expect(legacies[0]?.index).toBe(0);
    expect(legacies[1]?.index).toBe(1);
    expect(legacies[2]?.index).toBe(2);
  });

  test('should return empty array for empty input', () => {
    expect(toTrials([])).toEqual([]);
  });
});

// =============================================================================
// Type Guards Tests
// =============================================================================

describe('isFlexibleTrial()', () => {
  test('should return true for FlexibleTrial', () => {
    const flexible = createFlexibleTrialViaBuilder({ position: { value: 1 } });

    expect(isFlexibleTrial(flexible)).toBe(true);
  });

  test('should return false for Trial', () => {
    const trial = createLegacyTrial();

    expect(isFlexibleTrial(trial)).toBe(false);
  });
});

// =============================================================================
// Simplified Access Helpers Tests
// =============================================================================

describe('getPosition()', () => {
  test('should get position from legacy trial', () => {
    const legacy = createLegacyTrial({ position: 6 });

    expect(getPosition(legacy)).toBe(6);
  });

  test('should get position from FlexibleTrial', () => {
    const flexible = createFlexibleTrialViaBuilder({ position: { value: 4 } });

    expect(getPosition(flexible)).toBe(4);
  });

  test('should return default for FlexibleTrial without position', () => {
    const flexible = new FlexibleTrialBuilder().build();

    expect(getPosition(flexible)).toBe(0);
  });
});

describe('getSound()', () => {
  test('should get sound from legacy trial', () => {
    // @ts-expect-error test override
    const legacy = createLegacyTrial({ sound: 'P' });

    // @ts-expect-error test override
    expect(getSound(legacy)).toBe('P');
  });

  test('should get sound from FlexibleTrial', () => {
    const flexible = createFlexibleTrialViaBuilder({ audio: { value: 'L' } });

    expect(getSound(flexible)).toBe('L');
  });

  test('should return default for FlexibleTrial without audio', () => {
    const flexible = new FlexibleTrialBuilder().build();

    expect(getSound(flexible)).toBe('C');
  });
});

describe('getColor()', () => {
  test('should get color from legacy trial', () => {
    // @ts-expect-error test override
    const legacy = createLegacyTrial({ color: 'red' });

    // @ts-expect-error test override
    expect(getColor(legacy)).toBe('red');
  });

  test('should get color from FlexibleTrial', () => {
    const flexible = createFlexibleTrialViaBuilder({ color: { value: 'green' } });

    // @ts-expect-error test override
    expect(getColor(flexible)).toBe('green');
  });

  test('should return default for FlexibleTrial without color', () => {
    const flexible = new FlexibleTrialBuilder().build();

    expect(getColor(flexible)).toBe('ink-black');
  });
});
