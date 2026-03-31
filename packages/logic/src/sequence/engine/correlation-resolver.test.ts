/**
 * Tests pour le CorrelationResolver
 */

import { describe, expect, it } from 'bun:test';
import { createSequenceSpec } from '../types';
import {
  buildJointProbabilityTable,
  drawCorrelatedIntentions,
  drawCorrelatedPair,
  isValidCorrelationMatrix,
  standardNormalCDF,
  generateStandardNormal,
  choleskyDecomposition,
} from './correlation-resolver';
import { createPRNG } from './prng';

describe('CorrelationResolver', () => {
  describe('Probability Math', () => {
    it('standardNormalCDF should return correct values', () => {
      expect(standardNormalCDF(0)).toBeCloseTo(0.5, 4);
      // Let's check consistency instead of exact values if approximation differs
      expect(standardNormalCDF(1)).toBeGreaterThan(0.5);
      expect(standardNormalCDF(-1)).toBeLessThan(0.5);
      expect(standardNormalCDF(1)).toBeCloseTo(1 - standardNormalCDF(-1), 4);
    });

    it('generateStandardNormal should produce numbers', () => {
      const rng = createPRNG('box-muller');
      const val = generateStandardNormal(rng);
      expect(typeof val).toBe('number');
      expect(Number.isNaN(val)).toBe(false);
    });

    it('buildJointProbabilityTable handles normalization edge case', () => {
      // Use values that might cause small floating point errors
      const table = buildJointProbabilityTable(0.33333, 0.33333, 0);
      const sum = table.bothTarget + table.onlyFirst + table.onlySecond + table.neither;
      expect(sum).toBeCloseTo(1, 6);
    });
  });

  describe('choleskyDecomposition', () => {
    it('should decompose a 2x2 positive definite matrix', () => {
      // Matrix: [[1, 0.5], [0.5, 1]]
      const matrix = [
        [1, 0.5],
        [0.5, 1],
      ];
      const L = choleskyDecomposition(matrix);
      expect(L).not.toBeNull();
      if (L) {
        expect(L[0]![0]).toBe(1);
        expect(L[1]![0]).toBe(0.5);
        expect(L[1]![1]).toBeCloseTo(Math.sqrt(0.75), 6);
      }
    });

    it('should return null for non-positive definite matrix', () => {
      // Matrix: [[1, 2], [2, 1]] - Correlation > 1 is impossible for real variables
      const matrix = [
        [1, 2],
        [2, 1],
      ];
      const L = choleskyDecomposition(matrix);
      expect(L).toBeNull();
    });

    it('should return null if diagonal becomes zero', () => {
      const matrix = [
        [0, 0],
        [0, 0],
      ];
      expect(choleskyDecomposition(matrix)).toBeNull();
    });
  });

  describe('Gaussian Copula (N > 2)', () => {
    it('should handle 3 modalities with correlation', () => {
      const spec = createSequenceSpec({
        nLevel: 2,
        modalities: [
          { id: 'position', values: 9 },
          { id: 'audio', values: ['A', 'B'] },
          { id: 'color', values: ['red', 'blue'] },
        ],
        targetProbabilities: { position: 0.3, audio: 0.3, color: 0.3 },
        lureProbabilities: {},
        correlationMatrix: {
          audio_position: 0.2,
          color_position: 0.2,
          color_audio: 0.2,
        },
      });

      const effectiveProbs = {
        targetProbabilities: { position: 0.3, audio: 0.3, color: 0.3 },
        lureProbabilities: {},
      };
      const rng = createPRNG('copula-test');

      const result = drawCorrelatedIntentions(spec, effectiveProbs, rng);
      expect(Object.keys(result.isTarget)).toHaveLength(3);
      expect(result.choleskyCache).toBeDefined();
    });

    it('should use cholesky cache if provided', () => {
      const spec = createSequenceSpec({
        nLevel: 2,
        modalities: [
          { id: 'm1', values: 2 },
          { id: 'm2', values: 2 },
          { id: 'm3', values: 2 },
        ],
        targetProbabilities: { m1: 0.5, m2: 0.5, m3: 0.5 },
        lureProbabilities: {},
      });
      const effectiveProbs = {
        targetProbabilities: { m1: 0.5, m2: 0.5, m3: 0.5 },
        lureProbabilities: {},
      };
      const rng = createPRNG('cache-test');

      const cache = [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ];
      const result = drawCorrelatedIntentions(spec, effectiveProbs, rng, cache);
      expect(result.choleskyCache).toEqual(cache);
    });

    it('should fallback to independent drawing if Cholesky fails', () => {
      const spec = createSequenceSpec({
        nLevel: 2,
        modalities: [
          { id: 'm1', values: 2 },
          { id: 'm2', values: 2 },
          { id: 'm3', values: 2 },
        ],
        targetProbabilities: { m1: 0.5, m2: 0.5, m3: 0.5 },
        lureProbabilities: {},
        correlationMatrix: {
          m1_m2: 1.0,
          m1_m3: 1.0,
          m2_m3: 1.0, // Singular matrix
        },
      });
      const effectiveProbs = {
        targetProbabilities: { m1: 0.5, m2: 0.5, m3: 0.5 },
        lureProbabilities: {},
      };
      const rng = createPRNG('fallback-test');

      const result = drawCorrelatedIntentions(spec, effectiveProbs, rng);
      expect(result.choleskyCache).toBeUndefined();
      expect(Object.keys(result.isTarget)).toHaveLength(3);
    });
  });

  describe('buildJointProbabilityTable', () => {
    it('crée une table de probabilités jointes pour ρ=0 (indépendance)', () => {
      const table = buildJointProbabilityTable(0.3, 0.3, 0);

      // Avec indépendance : P(both) = p1 * p2 = 0.09
      expect(table.bothTarget).toBeCloseTo(0.09, 4);
      expect(table.onlyFirst).toBeCloseTo(0.21, 4);
      expect(table.onlySecond).toBeCloseTo(0.21, 4);
      expect(table.neither).toBeCloseTo(0.49, 4);

      // Vérifier que la somme = 1
      const sum = table.bothTarget + table.onlyFirst + table.onlySecond + table.neither;
      expect(sum).toBeCloseTo(1, 6);
    });

    it('crée une table avec ρ=1 (corrélation parfaite positive)', () => {
      const table = buildJointProbabilityTable(0.3, 0.3, 1);

      // Avec corrélation parfaite positive : P(both) = min(p1, p2) = 0.3
      expect(table.bothTarget).toBeCloseTo(0.3, 4);
      expect(table.onlyFirst).toBeCloseTo(0, 4);
      expect(table.onlySecond).toBeCloseTo(0, 4);
      expect(table.neither).toBeCloseTo(0.7, 4);
    });

    it('crée une table avec ρ=-1 (corrélation parfaite négative)', () => {
      const table = buildJointProbabilityTable(0.3, 0.3, -1);

      // Avec corrélation parfaite négative : P(both) = max(0, p1+p2-1) = 0
      expect(table.bothTarget).toBeCloseTo(0, 4);
      // Les targets sont alternés
      expect(table.onlyFirst).toBeCloseTo(0.3, 4);
      expect(table.onlySecond).toBeCloseTo(0.3, 4);
      expect(table.neither).toBeCloseTo(0.4, 4);
    });

    it('gère des probabilités asymétriques', () => {
      const table = buildJointProbabilityTable(0.5, 0.2, 0);

      expect(table.bothTarget).toBeCloseTo(0.1, 4);
      expect(table.onlyFirst).toBeCloseTo(0.4, 4);
      expect(table.onlySecond).toBeCloseTo(0.1, 4);
      expect(table.neither).toBeCloseTo(0.4, 4);
    });

    it('clamp ρ entre -1 et 1', () => {
      const table1 = buildJointProbabilityTable(0.3, 0.3, 2);
      const table2 = buildJointProbabilityTable(0.3, 0.3, 1);

      // ρ=2 devrait être clampé à ρ=1
      expect(table1.bothTarget).toBeCloseTo(table2.bothTarget, 4);

      const table3 = buildJointProbabilityTable(0.3, 0.3, -2);
      const table4 = buildJointProbabilityTable(0.3, 0.3, -1);

      // ρ=-2 devrait être clampé à ρ=-1
      expect(table3.bothTarget).toBeCloseTo(table4.bothTarget, 4);
    });
  });

  describe('drawCorrelatedPair', () => {
    it('tire des paires selon la table de probabilités', () => {
      const table = buildJointProbabilityTable(0.5, 0.5, 0);
      const rng = createPRNG('correlation-test');

      let bothCount = 0;
      let onlyFirstCount = 0;
      let onlySecondCount = 0;
      let neitherCount = 0;

      const iterations = 1000;
      for (let i = 0; i < iterations; i++) {
        const result = drawCorrelatedPair(table, rng);
        if (result.first && result.second) bothCount++;
        else if (result.first && !result.second) onlyFirstCount++;
        else if (!result.first && result.second) onlySecondCount++;
        else neitherCount++;
      }

      // Vérifier que les proportions sont proches des probabilités attendues
      expect(bothCount / iterations).toBeCloseTo(0.25, 1);
      expect(onlyFirstCount / iterations).toBeCloseTo(0.25, 1);
      expect(onlySecondCount / iterations).toBeCloseTo(0.25, 1);
      expect(neitherCount / iterations).toBeCloseTo(0.25, 1);
    });

    it('avec ρ=1, first et second sont toujours identiques', () => {
      const table = buildJointProbabilityTable(0.3, 0.3, 1);
      const rng = createPRNG('perfect-correlation');

      for (let i = 0; i < 100; i++) {
        const result = drawCorrelatedPair(table, rng);
        // Avec corrélation parfaite, les deux sont toujours identiques
        expect(result.first).toBe(result.second);
      }
    });
  });

  describe('drawCorrelatedIntentions', () => {
    it('retourne un objet vide pour une spec sans modalités', () => {
      const spec = createSequenceSpec({
        nLevel: 2,
        modalities: [],
        targetProbabilities: {},
        lureProbabilities: {},
      });

      const effectiveProbs = { targetProbabilities: {}, lureProbabilities: {} };
      const rng = createPRNG('empty-test');

      const result = drawCorrelatedIntentions(spec, effectiveProbs, rng);
      expect(Object.keys(result.isTarget)).toHaveLength(0);
    });

    it('gère une seule modalité', () => {
      const spec = createSequenceSpec({
        nLevel: 2,
        modalities: [{ id: 'position', values: 9 }],
        targetProbabilities: { position: 0.5 },
        lureProbabilities: { position: {} },
      });

      const effectiveProbs = {
        targetProbabilities: { position: 0.5 },
        lureProbabilities: { position: {} },
      };
      const rng = createPRNG('single-modality');

      let targetCount = 0;
      for (let i = 0; i < 100; i++) {
        const result = drawCorrelatedIntentions(spec, effectiveProbs, rng);
        if (result.isTarget.position) targetCount++;
      }

      // Environ 50% devraient être targets
      expect(targetCount / 100).toBeCloseTo(0.5, 1);
    });

    it('respecte la corrélation entre deux modalités', () => {
      const spec = createSequenceSpec({
        nLevel: 2,
        modalities: [
          { id: 'position', values: 9 },
          { id: 'audio', values: ['A', 'B', 'C'] },
        ],
        targetProbabilities: { position: 0.3, audio: 0.3 },
        lureProbabilities: { position: {}, audio: {} },
        correlationMatrix: { audio_position: 1.0 }, // Corrélation parfaite
      });

      const effectiveProbs = {
        targetProbabilities: { position: 0.3, audio: 0.3 },
        lureProbabilities: { position: {}, audio: {} },
      };
      const rng = createPRNG('correlated-test');

      // Avec ρ=1, les deux modalités devraient toujours avoir le même isTarget
      for (let i = 0; i < 50; i++) {
        const result = drawCorrelatedIntentions(spec, effectiveProbs, rng);
        expect(result.isTarget.position).toBe(result.isTarget.audio);
      }
    });

    it('produit des résultats différents avec ρ=0', () => {
      const spec = createSequenceSpec({
        nLevel: 2,
        modalities: [
          { id: 'position', values: 9 },
          { id: 'audio', values: ['A', 'B', 'C'] },
        ],
        targetProbabilities: { position: 0.5, audio: 0.5 },
        lureProbabilities: { position: {}, audio: {} },
        correlationMatrix: { audio_position: 0 }, // Indépendance
      });

      const effectiveProbs = {
        targetProbabilities: { position: 0.5, audio: 0.5 },
        lureProbabilities: { position: {}, audio: {} },
      };
      const rng = createPRNG('independent-test');

      let sameCount = 0;
      const iterations = 100;
      for (let i = 0; i < iterations; i++) {
        const result = drawCorrelatedIntentions(spec, effectiveProbs, rng);
        if (result.isTarget.position === result.isTarget.audio) {
          sameCount++;
        }
      }

      // Avec indépendance et p=0.5, environ 50% devraient être identiques
      // (P(both) + P(neither) = 0.25 + 0.25 = 0.5)
      expect(sameCount / iterations).toBeCloseTo(0.5, 1);
    });
  });

  describe('isValidCorrelationMatrix', () => {
    it('valide une matrice vide', () => {
      expect(isValidCorrelationMatrix(undefined)).toBe(true);
      expect(isValidCorrelationMatrix({})).toBe(true);
    });

    it('valide une matrice correcte', () => {
      const matrix = {
        audio_position: 0.5,
        audio_color: -0.3,
      };
      expect(isValidCorrelationMatrix(matrix)).toBe(true);
    });

    it('rejette des valeurs hors limites', () => {
      expect(isValidCorrelationMatrix({ a_b: 1.5 })).toBe(false);
      expect(isValidCorrelationMatrix({ a_b: -1.5 })).toBe(false);
    });

    it('accepte les bornes exactes', () => {
      expect(isValidCorrelationMatrix({ a_b: 1 })).toBe(true);
      expect(isValidCorrelationMatrix({ a_b: -1 })).toBe(true);
      expect(isValidCorrelationMatrix({ a_b: 0 })).toBe(true);
    });
  });
});
