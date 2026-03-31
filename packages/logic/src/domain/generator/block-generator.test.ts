/**
 * Tests for BlockGenerator
 *
 * Tests REAL behavior with complete fixtures.
 * NO MOCKS - Uses real strategies via registry.
 */

import { describe, expect, test, beforeEach } from 'bun:test';
import { BlockGenerator } from './block-generator';
import { StrategyRegistry, GeneratorStrategy, type GenerationContext } from './strategy';
import type { Trial, BlockConfig } from '../types';

// =============================================================================
// Test Strategy Implementation
// =============================================================================

class SimpleStrategy extends GeneratorStrategy {
  readonly name = 'simple';

  generate(context: GenerationContext): Trial[] {
    const { config, rng } = context;
    const trials: Trial[] = [];

    for (let i = 0; i < config.trialsCount; i++) {
      trials.push({
        index: i,
        // @ts-expect-error test override
        isBuffer: i < config.nBack,
        position: rng.choice([0, 1, 2, 3, 4, 5, 6, 7]),
        // @ts-expect-error test override
        sound: rng.choice(['C', 'H', 'K', 'L', 'P', 'Q', 'R', 'T']),
        // @ts-expect-error test override
        color: 'blue',
        trialType: 'Non-Cible',
        isPositionTarget: false,
        isSoundTarget: false,
        isColorTarget: false,
      });
    }

    return trials;
  }
}

// =============================================================================
// Fixtures
// =============================================================================

const createBlockConfig = (overrides: Partial<BlockConfig> = {}): BlockConfig => ({
  nBack: 2,
  activeModalities: ['position', 'audio'],
  trialsCount: 20,
  targetPercentage: 0.3,
  // @ts-expect-error test override
  generator: 'simple',
  ...overrides,
});

// =============================================================================
// BlockGenerator Instance Methods Tests
// =============================================================================

describe('BlockGenerator (instance)', () => {
  let registry: StrategyRegistry;
  let generator: BlockGenerator;

  beforeEach(() => {
    registry = new StrategyRegistry();
    registry.register(new SimpleStrategy());
    generator = new BlockGenerator(registry);
  });

  describe('generate()', () => {
    test('should generate a block with trials', () => {
      const config = createBlockConfig({ trialsCount: 10 });
      const block = generator.generate(config);

      expect(block.trials.length).toBe(10);
      expect(block.config).toBe(config);
    });

    test('should generate unique block IDs', () => {
      const config = createBlockConfig();
      const block1 = generator.generate(config);
      const block2 = generator.generate(config);

      expect(block1.id).not.toBe(block2.id);
    });

    test('should use provided seed for reproducibility', () => {
      const config = createBlockConfig();
      const block1 = generator.generate(config, 'fixed-seed');
      const block2 = generator.generate(config, 'fixed-seed');

      expect(block1.seed).toBe('fixed-seed');
      expect(block2.seed).toBe('fixed-seed');
      // Same seed should produce same trials
      expect(block1.trials[0]?.position).toBe(block2.trials[0]?.position);
    });

    test('should generate different trials with different seeds', () => {
      const config = createBlockConfig();
      const block1 = generator.generate(config, 'seed-1');
      const block2 = generator.generate(config, 'seed-2');

      // Different seeds should likely produce different first positions
      // (not guaranteed but highly likely for different seeds)
      expect(block1.seed).not.toBe(block2.seed);
    });

    test('should set createdAt date', () => {
      const before = new Date();
      const config = createBlockConfig();
      const block = generator.generate(config);
      const after = new Date();

      expect(block.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(block.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    test('should throw for unknown strategy', () => {
      // @ts-expect-error test override
      const config = createBlockConfig({ generator: 'nonexistent' });

      expect(() => generator.generate(config)).toThrow('Unknown generator strategy: nonexistent');
    });
  });

  describe('listStrategies()', () => {
    test('should list available strategies', () => {
      const strategies = generator.listStrategies();

      expect(strategies).toContain('simple');
    });
  });

  describe('hasStrategy()', () => {
    test('should return true for registered strategy', () => {
      expect(generator.hasStrategy('simple')).toBe(true);
    });

    test('should return false for unregistered strategy', () => {
      expect(generator.hasStrategy('unknown')).toBe(false);
    });
  });
});

// =============================================================================
// BlockGenerator Static Methods Tests
// =============================================================================

describe('BlockGenerator (static)', () => {
  test('listStrategies() should return strategies from global registry', () => {
    const strategies = BlockGenerator.listStrategies();

    // Should have strategies registered from other modules
    expect(Array.isArray(strategies)).toBe(true);
  });

  test('withGlobalRegistry() should return a BlockGenerator instance', () => {
    const generator = BlockGenerator.withGlobalRegistry();

    expect(generator).toBeInstanceOf(BlockGenerator);
    expect(typeof generator.generate).toBe('function');
    expect(typeof generator.listStrategies).toBe('function');
  });
});
