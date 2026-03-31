import { describe, expect, it } from 'bun:test';
import {
  evaluateJaeggiProgression,
  evaluateBrainWorkshopProgression,
  getProgressionEvaluator,
} from './n-level-evaluator';

describe('n-level-evaluator', () => {
  describe('evaluateJaeggiProgression', () => {
    it('should promote to N+1 when errors in all modalities are < 3 (Jaeggi 2008)', () => {
      const stats = {
        currentNLevel: 1,
        byModality: new Map([
          ['position', { hits: 10, misses: 1, falseAlarms: 1, correctRejections: 18 }],
          ['audio', { hits: 11, misses: 0, falseAlarms: 2, correctRejections: 17 }],
        ]),
      };
      // Position errors = 1+1 = 2 (< 3)
      // Audio errors = 0+2 = 2 (< 3)
      const result = evaluateJaeggiProgression(stats);
      expect(result.delta).toBe(1);
      expect(result.reasoning).toContain('N+1');
    });

    it('should maintain when errors in all modalities are exactly 3 (Jaeggi 2008: "fewer than three")', () => {
      const stats = {
        currentNLevel: 1,
        byModality: new Map([
          ['position', { hits: 10, misses: 2, falseAlarms: 1, correctRejections: 17 }],
          ['audio', { hits: 10, misses: 1, falseAlarms: 2, correctRejections: 17 }],
        ]),
      };
      // Position errors = 2+1 = 3 (>= 3)
      // Audio errors = 1+2 = 3 (>= 3)
      // Jaeggi 2008: "fewer than three" means < 3 to promote, exactly 3 maintains
      const result = evaluateJaeggiProgression(stats);
      expect(result.delta).toBe(0);
      expect(result.reasoning).toContain('maintain');
    });

    it('should demote to N-1 when any modality has > 5 errors and N > 1', () => {
      const stats = {
        currentNLevel: 2,
        byModality: new Map([
          ['position', { hits: 10, misses: 1, falseAlarms: 1, correctRejections: 18 }],
          ['audio', { hits: 5, misses: 6, falseAlarms: 0, correctRejections: 19 }],
        ]),
      };
      // Position errors = 2
      // Audio errors = 6 (> 5)
      const result = evaluateJaeggiProgression(stats);
      expect(result.delta).toBe(-1);
      expect(result.reasoning).toContain('N-1');
    });

    it('should maintain level when any modality has >= 3 errors but none > 5', () => {
      const stats = {
        currentNLevel: 2,
        byModality: new Map([
          ['position', { hits: 10, misses: 2, falseAlarms: 2, correctRejections: 16 }],
          ['audio', { hits: 10, misses: 2, falseAlarms: 2, correctRejections: 16 }],
        ]),
      };
      // Position errors = 4 (>= 3, so no promote; <= 5, so no demote)
      // Audio errors = 4
      // Jaeggi 2008: >= 3 errors = maintain, > 5 errors = demote
      const result = evaluateJaeggiProgression(stats);
      expect(result.delta).toBe(0);
      expect(result.reasoning).toContain('maintain');
    });

    it('should maintain level when exactly 5 errors in one modality', () => {
      const stats = {
        currentNLevel: 2,
        byModality: new Map([
          ['position', { hits: 10, misses: 3, falseAlarms: 2, correctRejections: 15 }],
        ]),
      };
      // Position errors = 5 (exactly JAEGGI_ERROR_DOWN)
      const result = evaluateJaeggiProgression(stats);
      expect(result.delta).toBe(0);
      expect(result.reasoning).toContain('maintain');
    });

    it('should mention the worst modality in reasoning when demoting', () => {
      const stats = {
        currentNLevel: 2,
        byModality: new Map([
          ['position', { hits: 10, misses: 6, falseAlarms: 0, correctRejections: 14 }], // 6 errors
          ['audio', { hits: 10, misses: 10, falseAlarms: 0, correctRejections: 10 }], // 10 errors (worst)
        ]),
      };
      const result = evaluateJaeggiProgression(stats);
      expect(result.delta).toBe(-1);
      expect(result.reasoning).toContain('audio=10');
      expect(result.reasoning).toContain('>');
    });

    it('should correctly identify the worst modality even if it is the first one', () => {
      const stats = {
        currentNLevel: 2,
        byModality: new Map([
          ['position', { hits: 10, misses: 10, falseAlarms: 0, correctRejections: 10 }], // 10 errors (worst)
          ['audio', { hits: 10, misses: 6, falseAlarms: 0, correctRejections: 14 }], // 6 errors
        ]),
      };
      const result = evaluateJaeggiProgression(stats);
      expect(result.delta).toBe(-1);
      expect(result.reasoning).toContain('position=10');
    });

    it('should maintain level even with many errors if current N is 1', () => {
      const stats = {
        currentNLevel: 1,
        byModality: new Map([
          ['position', { hits: 0, misses: 10, falseAlarms: 10, correctRejections: 0 }],
        ]),
      };
      const result = evaluateJaeggiProgression(stats);
      expect(result.delta).toBe(0);
      expect(result.reasoning).toContain('maintain N=1');
    });

    it('should handle empty modalities gracefully (NLEVEL-1 fix)', () => {
      const stats = {
        currentNLevel: 2,
        byModality: new Map(),
      };
      const result = evaluateJaeggiProgression(stats);
      // NLEVEL-1 fix: empty modalities = maintain (no data to evaluate)
      expect(result.delta).toBe(0);
      expect(result.reasoning).toContain('no modality data');
    });
  });

  describe('evaluateBrainWorkshopProgression', () => {
    it('should promote to N+1 when score is >= 80%', () => {
      const stats = {
        currentNLevel: 1,
        byModality: new Map([
          ['position', { hits: 10, misses: 0, falseAlarms: 0, correctRejections: 10 }],
        ]),
      };
      // Score% = H / (H + M + FA) * 100 = 10 / 10 * 100 = 100%
      const result = evaluateBrainWorkshopProgression(stats);
      expect(result.delta).toBe(1);
      expect(result.reasoning).toContain('score=100%');
    });

    it('should promote to N+1 when score is exactly 80%', () => {
      const stats = {
        currentNLevel: 1,
        byModality: new Map([
          ['position', { hits: 8, misses: 1, falseAlarms: 1, correctRejections: 100 }],
        ]),
      };
      // Score% = 8 / (8 + 1 + 1) * 100 = 80%
      const result = evaluateBrainWorkshopProgression(stats);
      expect(result.delta).toBe(1);
      expect(result.reasoning).toContain('score=80% >= 80%');
    });

    it('should maintain level when score is exactly 50%', () => {
      const stats = {
        currentNLevel: 2,
        byModality: new Map([
          ['position', { hits: 5, misses: 5, falseAlarms: 0, correctRejections: 100 }],
        ]),
      };
      // Score% = 5 / (5 + 5 + 0) * 100 = 50%
      const result = evaluateBrainWorkshopProgression(stats);
      expect(result.delta).toBe(0);
      expect(result.reasoning).toContain('score=50%');
    });

    it('should add strike when score is < 50% without prior strikes', () => {
      const stats = {
        currentNLevel: 2,
        byModality: new Map([
          ['position', { hits: 0, misses: 10, falseAlarms: 10, correctRejections: 0 }],
        ]),
      };
      // Hits=0, CR=0, FA=10, Misses=10, Total=20
      // Score = (((0+0-10-10)/20 + 1) / 2) * 100 = ((-1+1)/2)*100 = 0%
      // Without prior strikes, this adds 1 strike but doesn't demote
      const result = evaluateBrainWorkshopProgression(stats);
      expect(result.delta).toBe(0);
      expect(result.reasoning).toContain('strike 1/3');
    });

    it('should demote to N-1 when 3rd strike happens', () => {
      const stats = {
        currentNLevel: 2,
        byModality: new Map([
          ['position', { hits: 0, misses: 10, falseAlarms: 10, correctRejections: 0 }],
        ]),
      };
      // With 2 prior strikes, this 3rd strike causes demotion
      const result = evaluateBrainWorkshopProgression(stats, { currentStrikes: 2 });
      expect(result.delta).toBe(-1);
      expect(result.reasoning).toContain('3 strikes');
    });

    it('should maintain level when score is between 50% and 80%', () => {
      const stats = {
        currentNLevel: 2,
        byModality: new Map([
          ['position', { hits: 7, misses: 2, falseAlarms: 1, correctRejections: 0 }],
        ]),
      };
      // Score% = 7 / (7 + 2 + 1) * 100 = 70%
      const result = evaluateBrainWorkshopProgression(stats);
      expect(result.delta).toBe(0);
      expect(result.reasoning).toContain('score=70%');
    });

    it('should not add strikes at N=1 (cannot fallback)', () => {
      const stats = {
        currentNLevel: 1,
        byModality: new Map([
          ['position', { hits: 0, misses: 10, falseAlarms: 10, correctRejections: 0 }],
        ]),
      };
      const result = evaluateBrainWorkshopProgression(stats);
      expect(result.delta).toBe(0);
      expect(result.reasoning).toContain('maintain N=1');
    });

    it('should not demote below N=1 even with 3 strikes', () => {
      const stats = {
        currentNLevel: 1,
        byModality: new Map([
          ['position', { hits: 0, misses: 10, falseAlarms: 10, correctRejections: 0 }],
        ]),
      };
      // Even with 2 prior strikes, cannot go below N=1
      const result = evaluateBrainWorkshopProgression(stats, { currentStrikes: 2 });
      expect(result.delta).toBe(0);
      expect(result.reasoning).toContain('maintain N=1');
    });

    it('should handle zero total trials', () => {
      const stats = {
        currentNLevel: 2,
        byModality: new Map([
          ['position', { hits: 0, misses: 0, falseAlarms: 0, correctRejections: 0 }],
        ]),
      };
      const result = evaluateBrainWorkshopProgression(stats);
      expect(result.delta).toBe(0);
      expect(result.reasoning).toContain('strike 1/3');
    });
  });

  describe('getProgressionEvaluator', () => {
    it('should return jaeggi evaluator', () => {
      const evaluator = getProgressionEvaluator('jaeggi');
      expect(evaluator).toBe(evaluateJaeggiProgression);
    });

    it('should return brainworkshop evaluator', () => {
      const evaluator = getProgressionEvaluator('brainworkshop');
      expect(evaluator).toBe(evaluateBrainWorkshopProgression);
    });

    it('should return undefined for unknown name', () => {
      const evaluator = getProgressionEvaluator('unknown');
      expect(evaluator).toBeUndefined();
    });
  });
});
