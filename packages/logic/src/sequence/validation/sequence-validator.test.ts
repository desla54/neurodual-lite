/**
 * Tests pour le SequenceValidator
 */

import { describe, expect, it } from 'bun:test';
import type { GeneratedTrial, SequenceSpec } from '../types';
import { createSequenceSpec } from '../types';
import { createNoImmediateRepeatConstraint } from '../constraints';
import { validateSequence, formatValidationReport } from './sequence-validator';

// Helper pour créer des trials de test
function createTrial(
  index: number,
  values: Record<
    string,
    { value: number | string; intention: 'target' | 'lure-n-1' | 'lure-n+1' | 'neutral' }
  >,
): GeneratedTrial {
  const trialValues: GeneratedTrial['values'] = {};
  for (const [modalityId, v] of Object.entries(values)) {
    trialValues[modalityId] = {
      modalityId,
      value: v.value,
      intention: v.intention,
    };
  }
  return { index, values: trialValues };
}

describe('SequenceValidator', () => {
  const baseSpec: SequenceSpec = createSequenceSpec({
    nLevel: 2,
    modalities: [
      { id: 'position', values: 9 },
      { id: 'audio', values: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] },
    ],
    targetProbabilities: { position: 0.3, audio: 0.3 },
    lureProbabilities: { position: {}, audio: {} },
  });

  describe('validateSequence', () => {
    it('valide une séquence vide', () => {
      const result = validateSequence([], baseSpec);
      // Une séquence vide est valide (pas d'erreurs, juste des warnings possibles)
      expect(result.isValid).toBe(true);
      // Pas d'erreurs (seulement des warnings pour taux = 0%)
      const errors = result.issues.filter((i) => i.severity === 'error');
      expect(errors).toHaveLength(0);
    });

    it('calcule les statistiques correctement', () => {
      const history: GeneratedTrial[] = [
        createTrial(0, { position: { value: 0, intention: 'neutral' } }),
        createTrial(1, { position: { value: 1, intention: 'neutral' } }),
        createTrial(2, { position: { value: 2, intention: 'target' } }),
        createTrial(3, { position: { value: 3, intention: 'target' } }),
        createTrial(4, { position: { value: 4, intention: 'target' } }),
        createTrial(5, { position: { value: 5, intention: 'neutral' } }),
        createTrial(6, { position: { value: 6, intention: 'neutral' } }),
        createTrial(7, { position: { value: 7, intention: 'neutral' } }),
        createTrial(8, { position: { value: 8, intention: 'neutral' } }),
        createTrial(9, { position: { value: 0, intention: 'neutral' } }),
      ];

      const result = validateSequence(history, baseSpec);

      expect(result.stats.position).toBeDefined();
      expect(result.stats.position!.totalTrials).toBe(10);
      expect(result.stats.position!.targetCount).toBe(3);
      expect(result.stats.position!.targetRate).toBe(0.3);
      expect(result.stats.position!.uniqueValues).toBe(9);
    });

    it('détecte un taux de targets trop bas', () => {
      // 10 trials avec seulement 1 target = 10% (attendu 30%)
      const history: GeneratedTrial[] = [
        createTrial(0, { position: { value: 0, intention: 'neutral' } }),
        createTrial(1, { position: { value: 1, intention: 'neutral' } }),
        createTrial(2, { position: { value: 2, intention: 'target' } }),
        createTrial(3, { position: { value: 3, intention: 'neutral' } }),
        createTrial(4, { position: { value: 4, intention: 'neutral' } }),
        createTrial(5, { position: { value: 5, intention: 'neutral' } }),
        createTrial(6, { position: { value: 6, intention: 'neutral' } }),
        createTrial(7, { position: { value: 7, intention: 'neutral' } }),
        createTrial(8, { position: { value: 8, intention: 'neutral' } }),
        createTrial(9, { position: { value: 0, intention: 'neutral' } }),
      ];

      const result = validateSequence(history, baseSpec);

      const targetLowIssue = result.issues.find((i) => i.type === 'target-rate-too-low');
      expect(targetLowIssue).toBeDefined();
      expect(targetLowIssue?.modalityId).toBe('position');
    });

    it('détecte un taux de targets trop haut', () => {
      // 10 trials avec 6 targets = 60% (attendu 30%)
      const history: GeneratedTrial[] = [];
      for (let i = 0; i < 10; i++) {
        history.push(
          createTrial(i, {
            position: { value: i % 9, intention: i < 6 ? 'target' : 'neutral' },
          }),
        );
      }

      const result = validateSequence(history, baseSpec);

      const targetHighIssue = result.issues.find((i) => i.type === 'target-rate-too-high');
      expect(targetHighIssue).toBeDefined();
    });

    it('détecte les violations de contraintes', () => {
      const constraint = createNoImmediateRepeatConstraint({ modalityId: 'position' });

      const history: GeneratedTrial[] = [
        createTrial(0, { position: { value: 5, intention: 'neutral' } }),
        createTrial(1, { position: { value: 5, intention: 'neutral' } }), // Violation !
        createTrial(2, { position: { value: 3, intention: 'neutral' } }),
      ];

      const result = validateSequence(history, baseSpec, [constraint]);

      expect(result.isValid).toBe(false);
      const violation = result.issues.find((i) => i.type === 'constraint-violation');
      expect(violation).toBeDefined();
      expect(violation?.severity).toBe('error');
    });

    it('détecte les targets consécutifs excessifs', () => {
      const history: GeneratedTrial[] = [];
      for (let i = 0; i < 10; i++) {
        history.push(
          createTrial(i, {
            position: { value: i, intention: i < 5 ? 'target' : 'neutral' },
          }),
        );
      }

      const result = validateSequence(history, baseSpec, [], { maxConsecutiveTargets: 3 });

      const issue = result.issues.find((i) => i.type === 'consecutive-targets');
      expect(issue).toBeDefined();
    });

    it('respecte les options de tolérance', () => {
      // Spec avec une seule modalité pour simplifier
      const singleModalitySpec = createSequenceSpec({
        nLevel: 2,
        modalities: [{ id: 'position', values: 9 }],
        targetProbabilities: { position: 0.3 },
        lureProbabilities: { position: {} },
      });

      // 10 trials avec 2 targets = 20% (attendu 30%)
      const history: GeneratedTrial[] = [];
      for (let i = 0; i < 10; i++) {
        history.push(
          createTrial(i, {
            position: { value: i % 9, intention: i < 2 ? 'target' : 'neutral' },
          }),
        );
      }

      // Avec tolérance de 5%, c'est un problème (20% < 30% - 5% = 25%)
      const strictResult = validateSequence(history, singleModalitySpec, [], { tolerance: 0.05 });
      const strictIssues = strictResult.issues.filter(
        (i) => i.type === 'target-rate-too-low' || i.type === 'target-rate-too-high',
      );
      expect(strictIssues.length).toBeGreaterThan(0);

      // Avec tolérance de 20%, c'est OK (20% >= 30% - 20% = 10%)
      const lenientResult = validateSequence(history, singleModalitySpec, [], { tolerance: 0.2 });
      const targetIssues = lenientResult.issues.filter(
        (i) => i.type === 'target-rate-too-low' || i.type === 'target-rate-too-high',
      );
      expect(targetIssues.length).toBe(0);
    });
  });

  describe('formatValidationReport', () => {
    it('génère un rapport lisible', () => {
      const history: GeneratedTrial[] = [
        createTrial(0, { position: { value: 0, intention: 'neutral' } }),
        createTrial(1, { position: { value: 1, intention: 'target' } }),
        createTrial(2, { position: { value: 2, intention: 'neutral' } }),
      ];

      const result = validateSequence(history, baseSpec);
      const report = formatValidationReport(result);

      expect(report).toContain('Sequence Validation Report');
      expect(report).toContain('position');
      expect(report).toContain('Trials');
      expect(report).toContain('Targets');
    });

    it('affiche les problèmes', () => {
      const constraint = createNoImmediateRepeatConstraint({ modalityId: 'position' });
      const history: GeneratedTrial[] = [
        createTrial(0, { position: { value: 5, intention: 'neutral' } }),
        createTrial(1, { position: { value: 5, intention: 'neutral' } }),
      ];

      const result = validateSequence(history, baseSpec, [constraint]);
      const report = formatValidationReport(result);

      expect(report).toContain('Issues');
      expect(report).toContain('ERROR');
    });
  });
});
