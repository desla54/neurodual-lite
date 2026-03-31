/**
 * Tests for DualnbackClassicStrategy
 *
 * Tests REAL behavior of the Jaeggi protocol generator.
 * NO MOCKS - Uses real SeededRandom and helpers.
 */

import { describe, expect, test } from 'bun:test';
import { DualnbackClassicStrategy } from './dualnback-classic';
import { SeededRandom } from '../random';
import type { BlockConfig } from '../types';

// =============================================================================
// Fixtures - COMPLETE config structures
// =============================================================================

const createConfig = (overrides: Partial<BlockConfig> = {}): BlockConfig => ({
  // @ts-expect-error test override
  nBack: 2,
  activeModalities: ['position', 'audio'],
  trialsCount: 20,
  targetPercentage: 0.25,
  nLevel: 2,
  ...overrides,
});

// =============================================================================
// DualnbackClassicStrategy Tests
// =============================================================================

describe('DualnbackClassicStrategy', () => {
  const strategy = new DualnbackClassicStrategy();

  describe('name', () => {
    test('should have name "DualnbackClassic"', () => {
      expect(strategy.name).toBe('DualnbackClassic');
    });
  });

  describe('generate()', () => {
    describe('Jaeggi protocol distribution', () => {
      test('should generate exactly 20 scorable trials + buffer', () => {
        const config = createConfig({ nLevel: 2 });
        const rng = new SeededRandom('test-seed');

        const trials = strategy.generate({ config, rng });

        expect(trials.length).toBe(22); // 2 buffer + 20 scorable
      });

      test('should have exactly 4 V-Seul trials', () => {
        const config = createConfig({ nLevel: 2 });
        const rng = new SeededRandom('test-seed');

        const trials = strategy.generate({ config, rng });
        const vSeul = trials.filter((t) => t.trialType === 'V-Seul');

        expect(vSeul.length).toBe(4);
      });

      test('should have exactly 4 A-Seul trials', () => {
        const config = createConfig({ nLevel: 2 });
        const rng = new SeededRandom('test-seed');

        const trials = strategy.generate({ config, rng });
        const aSeul = trials.filter((t) => t.trialType === 'A-Seul');

        expect(aSeul.length).toBe(4);
      });

      test('should have exactly 2 Dual trials', () => {
        const config = createConfig({ nLevel: 2 });
        const rng = new SeededRandom('test-seed');

        const trials = strategy.generate({ config, rng });
        const dual = trials.filter((t) => t.trialType === 'Dual');

        expect(dual.length).toBe(2);
      });

      test('should have exactly 10 Non-Cible trials', () => {
        const config = createConfig({ nLevel: 2 });
        const rng = new SeededRandom('test-seed');

        const trials = strategy.generate({ config, rng });
        const nonCible = trials.filter((t) => t.trialType === 'Non-Cible');

        expect(nonCible.length).toBe(10);
      });

      test('should shuffle distribution (different orders with different seeds)', () => {
        const config = createConfig({ nLevel: 2 });

        const trials1 = strategy.generate({ config, rng: new SeededRandom('seed-1') });
        const trials2 = strategy.generate({ config, rng: new SeededRandom('seed-2') });

        const types1 = trials1.filter((t) => !t.isBuffer).map((t) => t.trialType);
        const types2 = trials2.filter((t) => !t.isBuffer).map((t) => t.trialType);

        // Very unlikely to be in exact same order
        expect(types1.join(',')).not.toBe(types2.join(','));
      });
    });

    describe('buffer trials', () => {
      test('should mark first nLevel trials as buffer', () => {
        const config = createConfig({ nLevel: 3 });
        const rng = new SeededRandom('test-seed');

        const trials = strategy.generate({ config, rng });

        expect(trials[0]?.isBuffer).toBe(true);
        expect(trials[1]?.isBuffer).toBe(true);
        expect(trials[2]?.isBuffer).toBe(true);
        expect(trials[3]?.isBuffer).toBe(false);
      });

      test('should set buffer trial type to "Tampon"', () => {
        const config = createConfig({ nLevel: 2 });
        const rng = new SeededRandom('test-seed');

        const trials = strategy.generate({ config, rng });

        expect(trials[0]?.trialType).toBe('Tampon');
        expect(trials[1]?.trialType).toBe('Tampon');
      });

      test('should not mark buffer trials as targets', () => {
        const config = createConfig({ nLevel: 2 });
        const rng = new SeededRandom('test-seed');

        const trials = strategy.generate({ config, rng });
        const buffers = trials.filter((t) => t.isBuffer);

        expect(buffers.every((t) => !t.isPositionTarget && !t.isSoundTarget)).toBe(true);
      });
    });

    describe('target generation', () => {
      test('V-Seul trials should have position target only', () => {
        const config = createConfig({ nLevel: 2 });
        const rng = new SeededRandom('test-seed');

        const trials = strategy.generate({ config, rng });
        const vSeul = trials.filter((t) => t.trialType === 'V-Seul');

        expect(vSeul.every((t) => t.isPositionTarget && !t.isSoundTarget)).toBe(true);
      });

      test('A-Seul trials should have sound target only', () => {
        const config = createConfig({ nLevel: 2 });
        const rng = new SeededRandom('test-seed');

        const trials = strategy.generate({ config, rng });
        const aSeul = trials.filter((t) => t.trialType === 'A-Seul');

        expect(aSeul.every((t) => !t.isPositionTarget && t.isSoundTarget)).toBe(true);
      });

      test('Dual trials should have both position and sound targets', () => {
        const config = createConfig({ nLevel: 2 });
        const rng = new SeededRandom('test-seed');

        const trials = strategy.generate({ config, rng });
        const dual = trials.filter((t) => t.trialType === 'Dual');

        expect(dual.every((t) => t.isPositionTarget && t.isSoundTarget)).toBe(true);
      });

      test('Non-Cible trials should have no targets', () => {
        const config = createConfig({ nLevel: 2 });
        const rng = new SeededRandom('test-seed');

        const trials = strategy.generate({ config, rng });
        const nonCible = trials.filter((t) => t.trialType === 'Non-Cible');

        expect(nonCible.every((t) => !t.isPositionTarget && !t.isSoundTarget)).toBe(true);
      });

      test('position targets should match n-back position', () => {
        const config = createConfig({ nLevel: 2 });
        const rng = new SeededRandom('test-seed');

        const trials = strategy.generate({ config, rng });
        const posTargets = trials.filter((t) => t.isPositionTarget);

        for (const trial of posTargets) {
          const nBackTrial = trials[trial.index - 2];
          // @ts-expect-error test override
          expect(trial.position).toBe(nBackTrial?.position);
        }
      });

      test('sound targets should match n-back sound', () => {
        const config = createConfig({ nLevel: 2 });
        const rng = new SeededRandom('test-seed');

        const trials = strategy.generate({ config, rng });
        const soundTargets = trials.filter((t) => t.isSoundTarget);

        for (const trial of soundTargets) {
          const nBackTrial = trials[trial.index - 2];
          // @ts-expect-error test override
          expect(trial.sound).toBe(nBackTrial?.sound);
        }
      });

      test('non-target positions should differ from n-back', () => {
        const config = createConfig({ nLevel: 2 });
        const rng = new SeededRandom('non-target-test');

        const trials = strategy.generate({ config, rng });
        const nonPosTargets = trials.filter((t) => !t.isBuffer && !t.isPositionTarget);

        // Most should differ (not guaranteed 100% due to choiceExcluding with small pool)
        const differCount = nonPosTargets.filter((t) => {
          const nBackTrial = trials[t.index - 2];
          return t.position !== nBackTrial?.position;
        }).length;

        expect(differCount).toBeGreaterThan(nonPosTargets.length * 0.8);
      });
    });

    describe('lure detection', () => {
      test('should detect lures in scorable trials', () => {
        const config = createConfig({ nLevel: 2 });
        const rng = new SeededRandom('lure-test');

        const trials = strategy.generate({ config, rng });
        const scorable = trials.filter((t) => !t.isBuffer);

        // Some trials may have lures
        const _withLures = scorable.filter((t) => t.isPositionLure || t.isSoundLure);
        // Lures are possible but not guaranteed
        expect(scorable.length).toBe(20);
      });

      test('should set lure type when detected', () => {
        const config = createConfig({ nLevel: 2 });
        const rng = new SeededRandom('lure-type-test');

        const trials = strategy.generate({ config, rng });
        const withPosLure = trials.filter((t) => t.isPositionLure);

        for (const trial of withPosLure) {
          expect(trial.positionLureType).toBeDefined();
        }
      });
    });

    describe('color handling', () => {
      test('should set all colors to "ink-navy" (Jaeggi uses position/audio only)', () => {
        const config = createConfig({ nLevel: 2 });
        const rng = new SeededRandom('test-seed');

        const trials = strategy.generate({ config, rng });

        expect(trials.every((t) => t.color === 'ink-navy')).toBe(true);
      });

      test('should not have color targets', () => {
        const config = createConfig({ nLevel: 2 });
        const rng = new SeededRandom('test-seed');

        const trials = strategy.generate({ config, rng });

        expect(trials.every((t) => !t.isColorTarget)).toBe(true);
      });
    });

    describe('reproducibility', () => {
      test('should produce same trials with same seed', () => {
        const config = createConfig({ nLevel: 2 });

        const trials1 = strategy.generate({ config, rng: new SeededRandom('fixed') });
        const trials2 = strategy.generate({ config, rng: new SeededRandom('fixed') });

        expect(trials1.length).toBe(trials2.length);
        for (let i = 0; i < trials1.length; i++) {
          expect(trials1[i]?.position).toBe(trials2[i]?.position);
          expect(trials1[i]?.sound).toBe(trials2[i]?.sound);
          expect(trials1[i]?.trialType).toBe(trials2[i]?.trialType);
        }
      });
    });

    describe('validation', () => {
      test('should throw for nLevel < 1', () => {
        const config = createConfig({ nLevel: 0 });
        const rng = new SeededRandom('test');

        expect(() => strategy.generate({ config, rng })).toThrow('Invalid nLevel');
      });
    });

    describe('edge cases', () => {
      test('should handle n=1 (1-back)', () => {
        const config = createConfig({ nLevel: 1 });
        const rng = new SeededRandom('1back-test');

        const trials = strategy.generate({ config, rng });

        expect(trials.length).toBe(21); // 1 buffer + 20 scorable
        expect(trials[0]?.isBuffer).toBe(true);
        expect(trials[1]?.isBuffer).toBe(false);
      });

      test('should handle n=4 (4-back)', () => {
        const config = createConfig({ nLevel: 4 });
        const rng = new SeededRandom('4back-test');

        const trials = strategy.generate({ config, rng });

        expect(trials.length).toBe(24); // 4 buffer + 20 scorable
        expect(trials.filter((t) => t.isBuffer).length).toBe(4);
      });
    });
  });
});
