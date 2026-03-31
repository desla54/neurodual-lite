import { describe, expect, it } from 'bun:test';
import { DefaultFillOrderGenerator } from './fill-order-generator';
import type { FillOrderInput } from './types';

describe('DefaultFillOrderGenerator', () => {
  const generator = new DefaultFillOrderGenerator();

  // Deterministic RNG for testing
  function createDeterministicRng(seed: number): () => number {
    let current = seed;
    return () => {
      // Simple LCG for reproducibility
      current = (current * 1103515245 + 12345) & 0x7fffffff;
      return current / 0x7fffffff;
    };
  }

  describe('generate', () => {
    it('should generate sequential order for single modality', () => {
      const input: FillOrderInput = {
        windowDepth: 3,
        activeModalities: ['position'],
        fillOrderMode: 'sequential',
      };

      const result = generator.generate(input, Math.random);

      // Should be: slot 3 (oldest), slot 2, slot 1 (newest)
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ slot: 3, modality: 'position' });
      expect(result[1]).toEqual({ slot: 2, modality: 'position' });
      expect(result[2]).toEqual({ slot: 1, modality: 'position' });
    });

    it('should generate sequential order for multiple modalities', () => {
      const input: FillOrderInput = {
        windowDepth: 2,
        activeModalities: ['position', 'audio'],
        fillOrderMode: 'sequential',
      };

      const result = generator.generate(input, Math.random);

      // Should be: (slot 2, position), (slot 2, audio), (slot 1, position), (slot 1, audio)
      expect(result).toHaveLength(4);
      expect(result[0]).toEqual({ slot: 2, modality: 'position' });
      expect(result[1]).toEqual({ slot: 2, modality: 'audio' });
      expect(result[2]).toEqual({ slot: 1, modality: 'position' });
      expect(result[3]).toEqual({ slot: 1, modality: 'audio' });
    });

    it('should generate sequential order for three modalities', () => {
      const input: FillOrderInput = {
        windowDepth: 2,
        activeModalities: ['position', 'audio', 'color'],
        fillOrderMode: 'sequential',
      };

      const result = generator.generate(input, Math.random);

      expect(result).toHaveLength(6); // 2 slots * 3 modalities
      // Slot 2 first (oldest)
      expect(result[0]).toEqual({ slot: 2, modality: 'position' });
      expect(result[1]).toEqual({ slot: 2, modality: 'audio' });
      expect(result[2]).toEqual({ slot: 2, modality: 'color' });
      // Then slot 1 (newest)
      expect(result[3]).toEqual({ slot: 1, modality: 'position' });
      expect(result[4]).toEqual({ slot: 1, modality: 'audio' });
      expect(result[5]).toEqual({ slot: 1, modality: 'color' });
    });

    it('should shuffle cells in random mode', () => {
      const input: FillOrderInput = {
        windowDepth: 3,
        activeModalities: ['position', 'audio'],
        fillOrderMode: 'random',
      };

      const rng = createDeterministicRng(12345);
      const result = generator.generate(input, rng);

      // Should have all 6 cells (3 slots * 2 modalities)
      expect(result).toHaveLength(6);

      // Verify all expected cells are present
      const cells = new Set(result.map((c) => `${c.slot}-${c.modality}`));
      expect(cells.has('1-position')).toBe(true);
      expect(cells.has('1-audio')).toBe(true);
      expect(cells.has('2-position')).toBe(true);
      expect(cells.has('2-audio')).toBe(true);
      expect(cells.has('3-position')).toBe(true);
      expect(cells.has('3-audio')).toBe(true);
    });

    it('should produce deterministic results with same seed in random mode', () => {
      const input: FillOrderInput = {
        windowDepth: 3,
        activeModalities: ['position', 'audio'],
        fillOrderMode: 'random',
      };

      const result1 = generator.generate(input, createDeterministicRng(42));
      const result2 = generator.generate(input, createDeterministicRng(42));

      expect(result1).toEqual(result2);
    });

    it('should produce different results with different seeds in random mode', () => {
      const input: FillOrderInput = {
        windowDepth: 3,
        activeModalities: ['position', 'audio'],
        fillOrderMode: 'random',
      };

      const result1 = generator.generate(input, createDeterministicRng(42));
      const result2 = generator.generate(input, createDeterministicRng(999));

      // Very unlikely to be equal with different seeds
      const str1 = JSON.stringify(result1);
      const str2 = JSON.stringify(result2);
      expect(str1).not.toEqual(str2);
    });

    it('should respect windowDepth of 1', () => {
      const input: FillOrderInput = {
        windowDepth: 1,
        activeModalities: ['position', 'audio'],
        fillOrderMode: 'sequential',
      };

      const result = generator.generate(input, Math.random);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ slot: 1, modality: 'position' });
      expect(result[1]).toEqual({ slot: 1, modality: 'audio' });
    });

    it('should handle large windowDepth', () => {
      const input: FillOrderInput = {
        windowDepth: 5,
        activeModalities: ['position'],
        fillOrderMode: 'sequential',
      };

      const result = generator.generate(input, Math.random);

      expect(result).toHaveLength(5);
      // Verify order: oldest (5) to newest (1)
      expect(result[0]?.slot).toBe(5);
      expect(result[4]?.slot).toBe(1);
    });
  });
});
