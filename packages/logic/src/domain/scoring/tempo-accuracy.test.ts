/**
 * Tests for tempo-accuracy.ts
 */

import { describe, expect, it } from 'bun:test';
import { computeSpecDrivenTempoAccuracy } from './tempo-accuracy';

describe('computeSpecDrivenTempoAccuracy', () => {
  describe('SDT strategy (default)', () => {
    it('computes geometric mean of hit rate and CR rate', () => {
      const accuracy = computeSpecDrivenTempoAccuracy('dual-catch', 8, 2, 2, 8);
      expect(accuracy).toBeGreaterThan(0);
    });

    it('returns 0 when hit rate is 0', () => {
      const accuracy = computeSpecDrivenTempoAccuracy('dual-catch', 0, 10, 0, 10);
      expect(accuracy).toBe(0);
    });

    it('returns 0 when CR rate is 0', () => {
      const accuracy = computeSpecDrivenTempoAccuracy('dual-catch', 10, 0, 10, 0);
      expect(accuracy).toBe(0);
    });

    it('returns 0 for empty counts', () => {
      expect(computeSpecDrivenTempoAccuracy('dual-catch', 0, 0, 0, 0)).toBe(0);
    });
  });

  describe('consistency', () => {
    it('produces consistent results for same inputs', () => {
      const acc1 = computeSpecDrivenTempoAccuracy('unknown', 5, 2, 3, 5);
      const acc2 = computeSpecDrivenTempoAccuracy('unknown', 5, 2, 3, 5);
      expect(acc1).toBe(acc2);
    });

    it('returns value between 0 and 1', () => {
      const accuracy = computeSpecDrivenTempoAccuracy('dual-catch', 8, 2, 2, 8);
      expect(accuracy).toBeGreaterThanOrEqual(0);
      expect(accuracy).toBeLessThanOrEqual(1);
    });
  });

  describe('edge cases', () => {
    it('handles signal-only scenarios', () => {
      const accuracy = computeSpecDrivenTempoAccuracy('dual-catch', 10, 0, 0, 0);
      expect(accuracy).toBe(0);
    });

    it('handles noise-only scenarios', () => {
      const accuracy = computeSpecDrivenTempoAccuracy('dual-catch', 0, 0, 0, 10);
      expect(accuracy).toBe(0);
    });

    it('handles zero hits', () => {
      const accuracy = computeSpecDrivenTempoAccuracy('unknown', 0, 5, 5, 10);
      expect(accuracy).toBe(0);
    });
  });
});
