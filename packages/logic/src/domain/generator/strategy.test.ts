/**
 * Tests for Generator Strategy Registry
 *
 * Tests REAL behavior with complete fixtures.
 * NO MOCKS - Pure strategy pattern.
 */

import { describe, expect, test, beforeEach } from 'bun:test';
import {
  GeneratorStrategy,
  StrategyRegistry,
  strategyRegistry,
  type GenerationContext,
} from './strategy';
import type { Trial, BlockConfig } from '../types';

// =============================================================================
// Test Strategy Implementation
// =============================================================================

class TestStrategy extends GeneratorStrategy {
  readonly name: string;

  constructor(name: string) {
    super();
    this.name = name;
  }

  generate(_context: GenerationContext): Trial[] {
    return [];
  }
}

// =============================================================================
// StrategyRegistry Tests
// =============================================================================

describe('StrategyRegistry', () => {
  let registry: StrategyRegistry;

  beforeEach(() => {
    registry = new StrategyRegistry();
  });

  describe('register()', () => {
    test('should register a strategy', () => {
      const strategy = new TestStrategy('test');
      registry.register(strategy);

      expect(registry.has('test')).toBe(true);
    });

    test('should be chainable', () => {
      const result = registry.register(new TestStrategy('a')).register(new TestStrategy('b'));

      expect(result).toBe(registry);
      expect(registry.list().length).toBe(2);
    });
  });

  describe('get()', () => {
    test('should return registered strategy', () => {
      const strategy = new TestStrategy('myStrategy');
      registry.register(strategy);

      const retrieved = registry.get('myStrategy');

      expect(retrieved).toBe(strategy);
      expect(retrieved.name).toBe('myStrategy');
    });

    test('should throw for unknown strategy', () => {
      expect(() => registry.get('unknown')).toThrow('Unknown generator strategy: unknown');
    });
  });

  describe('has()', () => {
    test('should return true for registered strategy', () => {
      registry.register(new TestStrategy('exists'));

      expect(registry.has('exists')).toBe(true);
    });

    test('should return false for unregistered strategy', () => {
      expect(registry.has('nonexistent')).toBe(false);
    });
  });

  describe('list()', () => {
    test('should return empty array for empty registry', () => {
      expect(registry.list()).toEqual([]);
    });

    test('should return all strategy names', () => {
      registry.register(new TestStrategy('alpha'));
      registry.register(new TestStrategy('beta'));
      registry.register(new TestStrategy('gamma'));

      const list = registry.list();

      expect(list).toContain('alpha');
      expect(list).toContain('beta');
      expect(list).toContain('gamma');
      expect(list.length).toBe(3);
    });
  });
});

// =============================================================================
// Global strategyRegistry Tests
// =============================================================================

describe('strategyRegistry (global)', () => {
  test('should be a StrategyRegistry instance', () => {
    expect(strategyRegistry).toBeInstanceOf(StrategyRegistry);
  });

  test('should have methods available', () => {
    expect(typeof strategyRegistry.register).toBe('function');
    expect(typeof strategyRegistry.get).toBe('function');
    expect(typeof strategyRegistry.has).toBe('function');
    expect(typeof strategyRegistry.list).toBe('function');
  });
});

// =============================================================================
// GeneratorStrategy Abstract Class Tests
// =============================================================================

describe('GeneratorStrategy', () => {
  test('should be extendable', () => {
    const strategy = new TestStrategy('custom');

    expect(strategy.name).toBe('custom');
    expect(strategy.generate).toBeDefined();
  });

  test('extended class should implement generate()', () => {
    class CountingStrategy extends GeneratorStrategy {
      readonly name = 'counting';

      generate(_context: GenerationContext): Trial[] {
        // Return empty for this test
        return [];
      }
    }

    const strategy = new CountingStrategy();
    const result = strategy.generate({
      config: {} as BlockConfig,
      rng: {} as never,
    });

    expect(Array.isArray(result)).toBe(true);
  });
});
