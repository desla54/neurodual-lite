/**
 * Tests for GameConfig Value Object
 *
 * Tests REAL behavior of configuration validation.
 * NO MOCKS - Pure validation logic.
 */

import { describe, expect, test } from 'bun:test';
import { GameConfig } from './game-config';
import type { BlockConfig } from './types';

// =============================================================================
// Fixtures
// =============================================================================

const createValidConfig = (overrides: Partial<BlockConfig> = {}): Partial<BlockConfig> => ({
  nLevel: 2,
  generator: 'BrainWorkshop',
  activeModalities: ['position', 'audio'],
  trialsCount: 20,
  targetProbability: 0.25,
  lureProbability: 0.15,
  intervalSeconds: 3,
  stimulusDurationSeconds: 0.5,
  ...overrides,
});

// =============================================================================
// Constructor Tests
// =============================================================================

describe('GameConfig constructor', () => {
  test('should create config with valid values', () => {
    const config = new GameConfig(createValidConfig());

    expect(config.nLevel).toBe(2);
    expect(config.generator).toBe('BrainWorkshop');
    expect(config.activeModalities).toEqual(['position', 'audio']);
    expect(config.trialsCount).toBe(20);
    expect(config.targetProbability).toBe(0.25);
    expect(config.lureProbability).toBe(0.15);
    expect(config.intervalSeconds).toBe(3);
    expect(config.stimulusDurationSeconds).toBe(0.5);
  });

  test('should use defaults for missing values', () => {
    const config = new GameConfig({});

    expect(config.nLevel).toBeDefined();
    expect(config.generator).toBeDefined();
    expect(config.activeModalities.length).toBeGreaterThan(0);
  });

  test('should create defensive copy of activeModalities', () => {
    const modalities = ['position', 'audio'];
    const config = new GameConfig({ activeModalities: modalities });

    modalities.push('color');
    expect(config.activeModalities).toEqual(['position', 'audio']);
  });
});

// =============================================================================
// nLevel Validation Tests
// =============================================================================

describe('GameConfig nLevel validation', () => {
  test('should accept nLevel = 1', () => {
    const config = new GameConfig(createValidConfig({ nLevel: 1 }));
    expect(config.nLevel).toBe(1);
  });

  test('should accept nLevel = 5', () => {
    const config = new GameConfig(createValidConfig({ nLevel: 5 }));
    expect(config.nLevel).toBe(5);
  });

  test('should reject nLevel = 0', () => {
    expect(() => new GameConfig(createValidConfig({ nLevel: 0 }))).toThrow('Invalid nLevel');
  });

  test('should reject negative nLevel', () => {
    expect(() => new GameConfig(createValidConfig({ nLevel: -1 }))).toThrow('Invalid nLevel');
  });

  test('should reject non-integer nLevel', () => {
    expect(() => new GameConfig(createValidConfig({ nLevel: 2.5 }))).toThrow('Invalid nLevel');
  });
});

// =============================================================================
// trialsCount Validation Tests
// =============================================================================

describe('GameConfig trialsCount validation', () => {
  test('should accept trialsCount = 1', () => {
    const config = new GameConfig(createValidConfig({ trialsCount: 1 }));
    expect(config.trialsCount).toBe(1);
  });

  test('should accept trialsCount = 100', () => {
    const config = new GameConfig(createValidConfig({ trialsCount: 100 }));
    expect(config.trialsCount).toBe(100);
  });

  test('should reject trialsCount = 0', () => {
    expect(() => new GameConfig(createValidConfig({ trialsCount: 0 }))).toThrow(
      'Invalid trialsCount',
    );
  });

  test('should reject negative trialsCount', () => {
    expect(() => new GameConfig(createValidConfig({ trialsCount: -5 }))).toThrow(
      'Invalid trialsCount',
    );
  });

  test('should reject non-integer trialsCount', () => {
    expect(() => new GameConfig(createValidConfig({ trialsCount: 10.5 }))).toThrow(
      'Invalid trialsCount',
    );
  });
});

// =============================================================================
// Probability Validation Tests
// =============================================================================

describe('GameConfig probability validation', () => {
  test('should accept targetProbability = 0', () => {
    const config = new GameConfig(createValidConfig({ targetProbability: 0 }));
    expect(config.targetProbability).toBe(0);
  });

  test('should accept targetProbability = 1', () => {
    const config = new GameConfig(createValidConfig({ targetProbability: 1, lureProbability: 0 }));
    expect(config.targetProbability).toBe(1);
  });

  test('should reject targetProbability < 0', () => {
    expect(() => new GameConfig(createValidConfig({ targetProbability: -0.1 }))).toThrow(
      'Invalid targetProbability',
    );
  });

  test('should reject targetProbability > 1', () => {
    expect(() => new GameConfig(createValidConfig({ targetProbability: 1.5 }))).toThrow(
      'Invalid targetProbability',
    );
  });

  test('should accept lureProbability = 0', () => {
    const config = new GameConfig(createValidConfig({ lureProbability: 0 }));
    expect(config.lureProbability).toBe(0);
  });

  test('should reject lureProbability < 0', () => {
    expect(() => new GameConfig(createValidConfig({ lureProbability: -0.1 }))).toThrow(
      'Invalid lureProbability',
    );
  });

  test('should reject lureProbability > 1', () => {
    expect(() => new GameConfig(createValidConfig({ lureProbability: 1.5 }))).toThrow(
      'Invalid lureProbability',
    );
  });

  test('should reject target + lure > 1 for BrainWorkshop', () => {
    expect(
      () =>
        new GameConfig(
          createValidConfig({
            generator: 'BrainWorkshop',
            targetProbability: 0.6,
            lureProbability: 0.6,
          }),
        ),
    ).toThrow('Invalid probabilities');
  });

  test('should accept target + lure > 1 for Aleatoire (Libre)', () => {
    const config = new GameConfig(
      createValidConfig({
        generator: 'Aleatoire',
        targetProbability: 0.7,
        lureProbability: 0.7,
      }),
    );
    expect(config.targetProbability).toBe(0.7);
    expect(config.lureProbability).toBe(0.7);
  });

  test('should accept target + lure > 1 for Jaeggi', () => {
    const config = new GameConfig(
      createValidConfig({
        generator: 'DualnbackClassic',
        targetProbability: 0.8,
        lureProbability: 0.5,
      }),
    );
    expect(config.generator).toBe('DualnbackClassic');
  });
});

// =============================================================================
// Timing Validation Tests
// =============================================================================

describe('GameConfig timing validation', () => {
  test('should accept intervalSeconds = 0.5', () => {
    const config = new GameConfig(
      createValidConfig({ intervalSeconds: 0.5, stimulusDurationSeconds: 0.4 }),
    );
    expect(config.intervalSeconds).toBe(0.5);
  });

  test('should reject intervalSeconds < 0.5', () => {
    expect(() => new GameConfig(createValidConfig({ intervalSeconds: 0.4 }))).toThrow(
      'Invalid intervalSeconds',
    );
  });

  test('should reject stimulusDurationSeconds <= 0', () => {
    expect(() => new GameConfig(createValidConfig({ stimulusDurationSeconds: 0 }))).toThrow(
      'Invalid stimulusDurationSeconds',
    );
  });

  test('should reject negative stimulusDurationSeconds', () => {
    expect(() => new GameConfig(createValidConfig({ stimulusDurationSeconds: -0.1 }))).toThrow(
      'Invalid stimulusDurationSeconds',
    );
  });

  test('should reject stimulus >= interval for non-BrainWorkshop modes', () => {
    // Non-BW modes require stimulus < interval for visual transition
    expect(
      () =>
        new GameConfig(
          createValidConfig({
            generator: 'DualnbackClassic',
            intervalSeconds: 2,
            stimulusDurationSeconds: 2,
          }),
        ),
    ).toThrow('Stimulus duration');
  });

  test('should allow stimulus === interval for BrainWorkshop (continuous display)', () => {
    // BrainWorkshop keeps stimulus visible for entire interval (no gap)
    const config = new GameConfig(
      createValidConfig({
        generator: 'BrainWorkshop',
        intervalSeconds: 3,
        stimulusDurationSeconds: 3,
      }),
    );
    expect(config.stimulusDurationSeconds).toBe(3);
  });

  test('should reject stimulus > interval for all modes', () => {
    // No mode should allow stimulus longer than interval
    expect(
      () =>
        new GameConfig(
          createValidConfig({
            generator: 'BrainWorkshop',
            intervalSeconds: 2,
            stimulusDurationSeconds: 3,
          }),
        ),
    ).toThrow('Stimulus duration');

    expect(
      () =>
        new GameConfig(
          createValidConfig({
            generator: 'DualnbackClassic',
            intervalSeconds: 2,
            stimulusDurationSeconds: 3,
          }),
        ),
    ).toThrow('Stimulus duration');
  });

  test('should accept stimulus < interval', () => {
    const config = new GameConfig(
      createValidConfig({ intervalSeconds: 3, stimulusDurationSeconds: 0.5 }),
    );
    expect(config.stimulusDurationSeconds).toBe(0.5);
  });
});

// =============================================================================
// Modalities Validation Tests
// =============================================================================

describe('GameConfig modalities validation', () => {
  test('should accept single modality', () => {
    const config = new GameConfig(createValidConfig({ activeModalities: ['position'] }));
    expect(config.activeModalities).toEqual(['position']);
  });

  test('should accept multiple modalities', () => {
    const config = new GameConfig(
      createValidConfig({ activeModalities: ['position', 'audio', 'color'] }),
    );
    expect(config.activeModalities).toEqual(['position', 'audio', 'color']);
  });

  test('should reject empty modalities array', () => {
    expect(() => new GameConfig(createValidConfig({ activeModalities: [] }))).toThrow(
      'activeModalities must be a non-empty array',
    );
  });
});

// =============================================================================
// Factory Method Tests
// =============================================================================

describe('GameConfig.from()', () => {
  test('should create config from partial object', () => {
    const config = GameConfig.from({ nLevel: 3 });

    expect(config).toBeInstanceOf(GameConfig);
    expect(config.nLevel).toBe(3);
  });

  test('should throw for invalid config', () => {
    expect(() => GameConfig.from({ nLevel: 0 })).toThrow('Invalid nLevel');
  });
});

// =============================================================================
// toDTO() Tests
// =============================================================================

describe('GameConfig.toDTO()', () => {
  test('should return plain object with all properties', () => {
    const config = new GameConfig(createValidConfig());
    const dto = config.toDTO();

    expect(dto.nLevel).toBe(2);
    expect(dto.generator).toBe('BrainWorkshop');
    expect(dto.activeModalities).toEqual(['position', 'audio']);
    expect(dto.trialsCount).toBe(20);
    expect(dto.targetProbability).toBe(0.25);
    expect(dto.lureProbability).toBe(0.15);
    expect(dto.intervalSeconds).toBe(3);
    expect(dto.stimulusDurationSeconds).toBe(0.5);
  });

  test('should return defensive copy of activeModalities', () => {
    const config = new GameConfig(createValidConfig());
    const dto = config.toDTO();

    // @ts-expect-error test override
    dto.activeModalities.push('color');
    expect(config.activeModalities).toEqual(['position', 'audio']);
  });
});
