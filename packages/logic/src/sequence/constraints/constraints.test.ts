/**
 * Tests pour les contraintes
 */

import { describe, expect, it } from 'bun:test';
import type { GeneratedTrial } from '../types';
import { createMaxConsecutiveConstraint } from './max-consecutive';
import { createMinGapConstraint } from './min-gap';
import { createNoImmediateRepeatConstraint } from './no-immediate-repeat';
import { createPreferVarietyConstraint } from './prefer-variety';
import {
  createDefaultConstraints,
  createDefaultSoftConstraints,
  instantiateConstraints,
  instantiateWeightedConstraints,
} from './factory';

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

describe('NoImmediateRepeatConstraint', () => {
  const constraint = createNoImmediateRepeatConstraint({ modalityId: 'position' });

  it('permet le premier trial', () => {
    const candidate = createTrial(0, { position: { value: 5, intention: 'neutral' } });
    expect(constraint.isSatisfied([], candidate)).toBe(true);
  });

  it('permet une valeur différente', () => {
    const history = [createTrial(0, { position: { value: 5, intention: 'neutral' } })];
    const candidate = createTrial(1, { position: { value: 3, intention: 'neutral' } });
    expect(constraint.isSatisfied(history, candidate)).toBe(true);
  });

  it('interdit la même valeur deux fois de suite', () => {
    const history = [createTrial(0, { position: { value: 5, intention: 'neutral' } })];
    const candidate = createTrial(1, { position: { value: 5, intention: 'neutral' } });
    expect(constraint.isSatisfied(history, candidate)).toBe(false);
  });

  it('retourne les valeurs interdites', () => {
    const history = [createTrial(0, { position: { value: 5, intention: 'neutral' } })];
    const forbidden = constraint.getForbiddenValues(history, 'position', 'neutral');
    expect(forbidden.has(5)).toBe(true);
    expect(forbidden.size).toBe(1);
  });

  it('ignore les autres modalités', () => {
    const history = [createTrial(0, { position: { value: 5, intention: 'neutral' } })];
    const forbidden = constraint.getForbiddenValues(history, 'audio', 'neutral');
    expect(forbidden.size).toBe(0);
  });
});

describe('MaxConsecutiveConstraint', () => {
  const constraint = createMaxConsecutiveConstraint({
    modalityId: 'position',
    intention: 'target',
    max: 3,
  });

  it("permet jusqu'à max targets consécutifs", () => {
    const history = [
      createTrial(0, { position: { value: 0, intention: 'target' } }),
      createTrial(1, { position: { value: 1, intention: 'target' } }),
    ];
    const candidate = createTrial(2, { position: { value: 2, intention: 'target' } });
    expect(constraint.isSatisfied(history, candidate)).toBe(true);
  });

  it('interdit plus de max targets consécutifs', () => {
    const history = [
      createTrial(0, { position: { value: 0, intention: 'target' } }),
      createTrial(1, { position: { value: 1, intention: 'target' } }),
      createTrial(2, { position: { value: 2, intention: 'target' } }),
    ];
    const candidate = createTrial(3, { position: { value: 3, intention: 'target' } });
    expect(constraint.isSatisfied(history, candidate)).toBe(false);
  });

  it('permet un neutral après max targets', () => {
    const history = [
      createTrial(0, { position: { value: 0, intention: 'target' } }),
      createTrial(1, { position: { value: 1, intention: 'target' } }),
      createTrial(2, { position: { value: 2, intention: 'target' } }),
    ];
    const candidate = createTrial(3, { position: { value: 3, intention: 'neutral' } });
    expect(constraint.isSatisfied(history, candidate)).toBe(true);
  });

  it('retourne les intentions interdites quand max atteint', () => {
    const history = [
      createTrial(0, { position: { value: 0, intention: 'target' } }),
      createTrial(1, { position: { value: 1, intention: 'target' } }),
      createTrial(2, { position: { value: 2, intention: 'target' } }),
    ];
    const forbidden = constraint.getForbiddenIntentions(history, 'position');
    expect(forbidden.has('target')).toBe(true);
  });

  it('réinitialise le compteur après un neutral', () => {
    const history = [
      createTrial(0, { position: { value: 0, intention: 'target' } }),
      createTrial(1, { position: { value: 1, intention: 'target' } }),
      createTrial(2, { position: { value: 2, intention: 'neutral' } }),
    ];
    const candidate = createTrial(3, { position: { value: 3, intention: 'target' } });
    expect(constraint.isSatisfied(history, candidate)).toBe(true);
  });
});

describe('MinGapConstraint', () => {
  const constraint = createMinGapConstraint({
    modalityId: 'position',
    intention: 'target',
    minTrials: 2,
  });

  it('permet le premier target', () => {
    const candidate = createTrial(0, { position: { value: 0, intention: 'target' } });
    expect(constraint.isSatisfied([], candidate)).toBe(true);
  });

  it('interdit un target trop proche', () => {
    const history = [
      createTrial(0, { position: { value: 0, intention: 'target' } }),
      createTrial(1, { position: { value: 1, intention: 'neutral' } }),
    ];
    const candidate = createTrial(2, { position: { value: 2, intention: 'target' } });
    expect(constraint.isSatisfied(history, candidate)).toBe(false);
  });

  it("permet un target après l'espacement minimum", () => {
    const history = [
      createTrial(0, { position: { value: 0, intention: 'target' } }),
      createTrial(1, { position: { value: 1, intention: 'neutral' } }),
      createTrial(2, { position: { value: 2, intention: 'neutral' } }),
    ];
    const candidate = createTrial(3, { position: { value: 3, intention: 'target' } });
    expect(constraint.isSatisfied(history, candidate)).toBe(true);
  });

  it('retourne les intentions interdites quand trop proche', () => {
    const history = [createTrial(0, { position: { value: 0, intention: 'target' } })];
    const forbidden = constraint.getForbiddenIntentions(history, 'position');
    expect(forbidden.has('target')).toBe(true);
  });
});

describe('PreferVarietyConstraint', () => {
  const constraint = createPreferVarietyConstraint({
    modalityId: 'position',
    weight: 0.5,
    lookbackWindow: 3,
  });

  it('est toujours satisfait (soft constraint)', () => {
    const history = [createTrial(0, { position: { value: 5, intention: 'neutral' } })];
    const candidate = createTrial(1, { position: { value: 5, intention: 'neutral' } });
    expect(constraint.isSatisfied(history, candidate)).toBe(true);
  });

  it('donne un score faible pour répétition immédiate', () => {
    const history = [createTrial(0, { position: { value: 5, intention: 'neutral' } })];
    const candidate = createTrial(1, { position: { value: 5, intention: 'neutral' } });
    const score = constraint.getSatisfactionScore(history, candidate);
    expect(score).toBeLessThan(0.5);
  });

  it('donne un score élevé pour une nouvelle valeur', () => {
    const history = [
      createTrial(0, { position: { value: 1, intention: 'neutral' } }),
      createTrial(1, { position: { value: 2, intention: 'neutral' } }),
      createTrial(2, { position: { value: 3, intention: 'neutral' } }),
    ];
    const candidate = createTrial(3, { position: { value: 5, intention: 'neutral' } });
    const score = constraint.getSatisfactionScore(history, candidate);
    expect(score).toBe(1);
  });

  it('ne bloque pas de valeurs (soft)', () => {
    const history = [createTrial(0, { position: { value: 5, intention: 'neutral' } })];
    const forbidden = constraint.getForbiddenValues(history, 'position', 'neutral');
    expect(forbidden.size).toBe(0);
  });
});

describe('createDefaultConstraints', () => {
  it('crée des contraintes par défaut pour les modalités', () => {
    const constraints = createDefaultConstraints(['position', 'audio'], 2);

    // 2 modalités × 2 contraintes par défaut (NoImmediateRepeat + MaxConsecutive)
    expect(constraints.length).toBe(4);
  });

  it('les contraintes sont de type hard', () => {
    const constraints = createDefaultConstraints(['position'], 2);
    expect(constraints.every((c) => c.type === 'hard')).toBe(true);
  });
});

describe('createDefaultSoftConstraints', () => {
  it('crée des soft constraints pour nLevel > 1', () => {
    const constraints = createDefaultSoftConstraints(['position', 'audio'], 2);

    expect(constraints.length).toBe(2);
    expect(constraints.every((c) => c.type === 'soft')).toBe(true);
    expect(constraints.every((c) => c.id.startsWith('prefer-variety'))).toBe(true);
  });

  it('retourne vide pour nLevel=1', () => {
    const constraints = createDefaultSoftConstraints(['position'], 1);
    expect(constraints.length).toBe(0);
  });

  it('chaque contrainte a un poids', () => {
    const constraints = createDefaultSoftConstraints(['position'], 3);
    expect(constraints[0]?.weight).toBeGreaterThan(0);
    expect(constraints[0]?.weight).toBeLessThanOrEqual(1);
  });
});

describe('instantiateConstraints', () => {
  it('instancie des contraintes no-immediate-repeat', () => {
    const specs = [{ type: 'no-immediate-repeat' as const, params: { modalityId: 'position' } }];
    const constraints = instantiateConstraints(specs);

    expect(constraints.length).toBe(1);
    expect(constraints[0]?.id).toBe('no-immediate-repeat:position');
  });

  it('instancie des contraintes max-consecutive', () => {
    const specs = [
      {
        type: 'max-consecutive' as const,
        params: { modalityId: 'audio', intention: 'target', max: 2 },
      },
    ];
    const constraints = instantiateConstraints(specs);

    expect(constraints.length).toBe(1);
    expect(constraints[0]?.id).toBe('max-consecutive:audio:target:2');
  });

  it('instancie des contraintes min-gap', () => {
    const specs = [
      {
        type: 'min-gap' as const,
        params: { modalityId: 'position', intention: 'lure-n-1', minTrials: 3 },
      },
    ];
    const constraints = instantiateConstraints(specs);

    expect(constraints.length).toBe(1);
    expect(constraints[0]?.id).toBe('min-gap:position:lure-n-1:3');
  });

  it('ignore les types inconnus', () => {
    const specs = [{ type: 'unknown-type' as 'no-immediate-repeat', params: {} }];
    const constraints = instantiateConstraints(specs);

    expect(constraints.length).toBe(0);
  });

  it('instancie plusieurs contraintes', () => {
    const specs = [
      { type: 'no-immediate-repeat' as const, params: { modalityId: 'position' } },
      {
        type: 'max-consecutive' as const,
        params: { modalityId: 'audio', intention: 'target', max: 3 },
      },
    ];
    const constraints = instantiateConstraints(specs);

    expect(constraints.length).toBe(2);
  });
});

describe('instantiateWeightedConstraints', () => {
  it('instancie des contraintes prefer-variety', () => {
    const specs = [
      {
        type: 'prefer-variety' as const,
        weight: 0.7,
        params: { modalityId: 'position' },
      },
    ];
    const constraints = instantiateWeightedConstraints(specs);

    expect(constraints.length).toBe(1);
    expect(constraints[0]?.id).toBe('prefer-variety:position');
    expect(constraints[0]?.weight).toBe(0.7);
  });

  it('ignore les types inconnus', () => {
    const specs = [{ type: 'unknown' as 'prefer-variety', weight: 0.5, params: {} }];
    const constraints = instantiateWeightedConstraints(specs);

    expect(constraints.length).toBe(0);
  });

  it('ignore les specs avec modalityId invalide', () => {
    const specs = [{ type: 'prefer-variety' as const, weight: 0.5, params: { modalityId: 123 } }];
    const constraints = instantiateWeightedConstraints(specs);

    expect(constraints.length).toBe(0);
  });
});

describe('createDefaultConstraints edge cases', () => {
  it('ne crée pas NoImmediateRepeat pour nLevel=1', () => {
    // Pour nLevel=1, une répétition immédiate EST un target
    const constraints = createDefaultConstraints(['position', 'audio'], 1);

    // Seulement MaxConsecutive (2 modalités × 1)
    expect(constraints.length).toBe(2);
    expect(constraints.every((c) => c.id.startsWith('max-consecutive'))).toBe(true);
  });
});

describe('MaxConsecutiveConstraint with wildcard', () => {
  const constraint = createMaxConsecutiveConstraint({
    modalityId: '*',
    intention: 'target',
    max: 2,
  });

  it("compte les targets de n'importe quelle modalité", () => {
    const history = [
      createTrial(0, {
        position: { value: 0, intention: 'target' },
        audio: { value: 'A', intention: 'neutral' },
      }),
      createTrial(1, {
        position: { value: 1, intention: 'neutral' },
        audio: { value: 'B', intention: 'target' },
      }),
    ];
    // Deux trials avec au moins un target → count = 2
    const candidate = createTrial(2, {
      position: { value: 2, intention: 'target' },
      audio: { value: 'C', intention: 'neutral' },
    });
    expect(constraint.isSatisfied(history, candidate)).toBe(false);
  });

  it('permet un neutral après les targets', () => {
    const history = [
      createTrial(0, { position: { value: 0, intention: 'target' } }),
      createTrial(1, { position: { value: 1, intention: 'target' } }),
    ];
    const candidate = createTrial(2, { position: { value: 2, intention: 'neutral' } });
    expect(constraint.isSatisfied(history, candidate)).toBe(true);
  });
});
