/**
 * Tests pour le SequenceEngine
 */

import { describe, expect, it } from 'bun:test';
import { createSequenceSpec, type SequenceSpec } from '../types';
import { createSequenceEngine } from './sequence-engine';
import {
  createMockConstraint,
  createMockWeightedConstraint,
} from '../../test-utils/test-factories';
import type { GeneratedTrial } from '../types';

describe('SequenceEngine', () => {
  const engine = createSequenceEngine();

  // Spec de base pour les tests
  const baseSpec: SequenceSpec = createSequenceSpec({
    nLevel: 2,
    modalities: [
      { id: 'position', values: 9 },
      { id: 'audio', values: ['C', 'H', 'K', 'L', 'Q', 'R', 'S', 'T'] },
    ],
    targetProbabilities: { position: 0.3, audio: 0.3 },
    lureProbabilities: { position: {}, audio: {} },
    seed: 'test-seed-123',
  });

  describe('createInitialState', () => {
    it('crée un état initial vide', () => {
      const state = engine.createInitialState(baseSpec);

      expect(state.history).toHaveLength(0);
      expect(state.nextIndex).toBe(0);
      expect(state.budgetUsed.trialsGenerated).toBe(0);
      expect(state.rng.seed).toBe('test-seed-123');
    });
  });

  describe('generateNext', () => {
    it('génère un trial avec des valeurs valides', () => {
      const state = engine.createInitialState(baseSpec);
      const result = engine.generateNext(baseSpec, state);

      expect(result.trial.index).toBe(0);
      expect(result.trial.values.position).toBeDefined();
      expect(result.trial.values.audio).toBeDefined();

      // Position doit être entre 0 et 8
      const posValue = result.trial.values.position!.value as number;
      expect(posValue).toBeGreaterThanOrEqual(0);
      expect(posValue).toBeLessThan(9);

      // Audio doit être une des lettres valides
      const audioValue = result.trial.values.audio!.value as string;
      expect(['C', 'H', 'K', 'L', 'Q', 'R', 'S', 'T']).toContain(audioValue);
    });

    it("génère des trials neutres pour les premiers trials (pas assez d'historique)", () => {
      const state = engine.createInitialState(baseSpec);

      // Les 2 premiers trials (N=2) ne peuvent pas être des targets
      const result1 = engine.generateNext(baseSpec, state);
      expect(result1.trial.values.position!.intention).toBe('neutral');
      expect(result1.trial.values.audio!.intention).toBe('neutral');

      const result2 = engine.generateNext(baseSpec, result1.newState);
      expect(result2.trial.values.position!.intention).toBe('neutral');
      expect(result2.trial.values.audio!.intention).toBe('neutral');
    });

    it("met à jour l'état correctement", () => {
      const state = engine.createInitialState(baseSpec);
      const result = engine.generateNext(baseSpec, state);

      expect(result.newState.history).toHaveLength(1);
      expect(result.newState.nextIndex).toBe(1);
      expect(result.newState.rng.callCount).toBeGreaterThan(state.rng.callCount);
    });

    it('est reproductible avec la même seed', () => {
      const state1 = engine.createInitialState(baseSpec);
      const state2 = engine.createInitialState(baseSpec);

      const result1 = engine.generateNext(baseSpec, state1);
      const result2 = engine.generateNext(baseSpec, state2);

      expect(result1.trial.values.position!.value).toBe(result2.trial.values.position!.value);
      expect(result1.trial.values.audio!.value).toBe(result2.trial.values.audio!.value);
    });

    it('génère différentes valeurs avec différentes seeds', () => {
      const spec1 = { ...baseSpec, seed: 'seed-A' };
      const spec2 = { ...baseSpec, seed: 'seed-B' };

      const state1 = engine.createInitialState(spec1);
      const state2 = engine.createInitialState(spec2);

      // Générer plusieurs trials et vérifier qu'au moins un diffère
      let foundDifference = false;
      let s1 = state1;
      let s2 = state2;

      for (let i = 0; i < 10; i++) {
        const r1 = engine.generateNext(spec1, s1);
        const r2 = engine.generateNext(spec2, s2);

        if (
          r1.trial.values.position!.value !== r2.trial.values.position!.value ||
          r1.trial.values.audio!.value !== r2.trial.values.audio!.value
        ) {
          foundDifference = true;
          break;
        }

        s1 = r1.newState;
        s2 = r2.newState;
      }

      expect(foundDifference).toBe(true);
    });
  });

  describe('génération avec budget', () => {
    it('respecte les quotas de cibles sur un bloc', () => {
      const specWithBudget = createSequenceSpec({
        nLevel: 2,
        modalities: [{ id: 'position', values: 9 }],
        targetProbabilities: { position: 0.3 },
        lureProbabilities: { position: {} },
        budget: { blockSize: 20 },
        seed: 'budget-test',
      });

      let state = engine.createInitialState(specWithBudget);
      let targetCount = 0;

      for (let i = 0; i < 20; i++) {
        const result = engine.generateNext(specWithBudget, state);
        if (result.trial.values.position!.intention === 'target') {
          targetCount++;
        }
        state = result.newState;
      }

      // Avec 30% sur 20 trials = 6 cibles (±1 pour l'arrondi)
      expect(targetCount).toBeGreaterThanOrEqual(4);
      expect(targetCount).toBeLessThanOrEqual(8);
    });
  });

  describe('génération de séquence longue', () => {
    it('génère 100 trials sans erreur', () => {
      let state = engine.createInitialState(baseSpec);

      for (let i = 0; i < 100; i++) {
        const result = engine.generateNext(baseSpec, state);
        expect(result.trial.index).toBe(i);
        state = result.newState;
      }

      expect(state.history).toHaveLength(100);
    });

    it('produit des targets après N trials', () => {
      let state = engine.createInitialState(baseSpec);
      let foundTarget = false;

      // Générer 50 trials, on devrait avoir des targets
      for (let i = 0; i < 50; i++) {
        const result = engine.generateNext(baseSpec, state);
        if (result.trial.values.position!.intention === 'target') {
          foundTarget = true;
          break;
        }
        state = result.newState;
      }

      expect(foundTarget).toBe(true);
    });
  });

  describe('metadata', () => {
    it('contient les informations de génération', () => {
      const state = engine.createInitialState(baseSpec);
      const result = engine.generateNext(baseSpec, state);

      expect(result.metadata.attempts).toBeGreaterThanOrEqual(1);
      expect(result.metadata.generationTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.metadata.effectiveProbabilities).toBeDefined();
    });

    it('liste les contraintes appliquées', () => {
      const c1 = createMockConstraint({ id: 'c1' });
      const c2 = createMockWeightedConstraint({ id: 'c2' });

      const state = engine.createInitialState(baseSpec);
      const result = engine.generateNext(baseSpec, state, [c1, c2]);

      expect(result.metadata.constraintsApplied).toContain('c1');
      expect(result.metadata.constraintsApplied).toContain('c2');
    });
  });

  describe('Contraintes & Cas avancés', () => {
    it('ignore les contraintes soft lors du filtrage initial', () => {
      // Contrainte soft qui prétend tout interdire
      const softConstraint = createMockWeightedConstraint({
        id: 'soft-forbid',
        getForbiddenIntentions: () => new Set(['target', 'neutral', 'lure-n-1']),
        getForbiddenValues: () => new Set([0, 1, 2, 3, 4, 5, 6, 7, 8]),
      });

      const state = engine.createInitialState(baseSpec);
      // Ne devrait pas lever d'erreur car c'est soft
      const result = engine.generateNext(baseSpec, state, [softConstraint]);
      expect(result.trial).toBeDefined();
    });

    it('interdit les intentions spécifiées par les contraintes hard', () => {
      const forbidTarget = createMockConstraint({
        id: 'no-target',
        getForbiddenIntentions: () => new Set(['target']),
      });

      const state = engine.createInitialState(baseSpec);
      // Forcer beaucoup de trials pour être sûr de normalement avoir des targets
      for (let i = 0; i < 20; i++) {
        const result = engine.generateNext(baseSpec, state, [forbidTarget]);
        expect(result.trial.values.position!.intention).not.toBe('target');
      }
    });

    it("fournit des détails lors d'un conflit de contraintes", () => {
      const impossibleSpec = createSequenceSpec({
        nLevel: 1,
        modalities: [{ id: 'pos', values: 1 }],
        targetProbabilities: { pos: 1.0 },
      });

      const forbidZeroConstraint = createMockConstraint({
        id: 'no-zero',
        getForbiddenValues: () => new Set([0]),
      });

      const state = engine.createInitialState(impossibleSpec);
      // @ts-expect-error test override
      state.history = [
        { index: 0, values: { pos: { value: 0, intention: 'neutral' } } },
      ] as GeneratedTrial[];
      // @ts-expect-error test override
      state.nextIndex = 1;

      try {
        engine.generateNext(impossibleSpec, state, [forbidZeroConstraint]);
        expect(false).toBe(true); // Should not reach here
      } catch (e: unknown) {
        const err = e as Error;
        expect(err.message).toContain('constraint conflict');
        expect(err.message).toContain('Forbidden values by intention');
        expect(err.message).toContain('target:[0]');
      }
    });

    it('met à jour les leurres dans le budget précisément', () => {
      const lureSpec = createSequenceSpec({
        nLevel: 2,
        modalities: [{ id: 'pos', values: 9 }],
        targetProbabilities: { pos: 0 },
        lureProbabilities: { pos: { 'n-1': 1.0 } },
      });

      const state = engine.createInitialState(lureSpec);
      // @ts-expect-error test override
      state.history = [
        { index: 0, values: { pos: { value: 5, intention: 'neutral' } } },
        { index: 1, values: { pos: { value: 6, intention: 'neutral' } } },
      ] as GeneratedTrial[];
      // @ts-expect-error test override
      state.nextIndex = 2;

      const result = engine.generateNext(lureSpec, state);
      expect(result.newState.budgetUsed.luresUsed.pos?.['n-1']).toBe(1);
    });

    it('vérifie que les contraintes filtrent réellement les options', () => {
      const spec = createSequenceSpec({
        nLevel: 1,
        modalities: [{ id: 'pos', values: 3 }], // 0, 1, 2
        targetProbabilities: { pos: 0.0 }, // Désactiver les targets pour simplifier
      });
      const state = engine.createInitialState(spec);
      // @ts-expect-error test override
      state.history = [
        { index: 0, values: { pos: { value: 0, intention: 'neutral' } } },
      ] as GeneratedTrial[];
      // @ts-expect-error test override
      state.nextIndex = 1;

      // Contrainte qui interdit 0 et 2 pour neutral
      const strictConstraint = createMockConstraint({
        id: 'strict',
        getForbiddenValues: () => new Set([0, 2]),
      });

      const resFiltered = engine.generateNext(spec, state, [strictConstraint]);
      // Seul '1' devrait être possible
      expect(resFiltered.trial.values.pos!.value).toBe(1);
    });

    it('lève une erreur en cas de violation de contrainte inter-modalité', () => {
      const interModalityConstraint = createMockConstraint({
        id: 'fail-all',
        isSatisfied: () => false, // Interdit TOUT
      });

      const state = engine.createInitialState(baseSpec);
      expect(() => engine.generateNext(baseSpec, state, [interModalityConstraint])).toThrow(
        /inter-modality constraint 'fail-all' violated/,
      );
    });
  });
});
