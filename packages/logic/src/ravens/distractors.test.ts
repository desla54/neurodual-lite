import { describe, it, expect } from 'vitest';
import { generateDistractors } from './distractors';
import { generateMatrix, generateStructuredMatrix } from './generator';
import { SeededRandom } from '../domain/random';

describe('generateDistractors', () => {
  it('generates the requested number of distractors', () => {
    const matrix = generateMatrix('dist-test-1', 3);
    const rng = new SeededRandom('dist-rng');
    const distractors = generateDistractors(
      rng,
      matrix.answer,
      matrix.ruleBindings,
      matrix.grid,
      5,
    );
    expect(distractors).toHaveLength(5);
  });

  it('no distractor equals the answer', () => {
    for (let i = 0; i < 30; i++) {
      const matrix = generateMatrix(`dist-no-eq-${i}`, 5);
      const ansKey = JSON.stringify(matrix.answer);
      for (const d of matrix.distractors) {
        expect(JSON.stringify(d)).not.toBe(ansKey);
      }
    }
  });

  it('no duplicate distractors', () => {
    for (let i = 0; i < 30; i++) {
      const matrix = generateMatrix(`dist-no-dup-${i}`, 7);
      const keys = matrix.distractors.map((d) => JSON.stringify(d));
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('distractors differ from answer on at least one entity attribute', () => {
    for (let i = 0; i < 30; i++) {
      const matrix = generateMatrix(`dist-diff-${i}`, 4);
      for (const d of matrix.distractors) {
        // At least one entity across all components must differ
        let anyDiffers = false;
        for (let ei = 0; ei < matrix.answer.entities.length; ei++) {
          const ansEntity = matrix.answer.entities[ei]!;
          const dEntity = d.entities[ei];
          if (!dEntity) {
            anyDiffers = true;
            break;
          }
          if (
            ansEntity.shape !== dEntity.shape ||
            ansEntity.size !== dEntity.size ||
            ansEntity.color !== dEntity.color ||
            ansEntity.angle !== dEntity.angle
          ) {
            anyDiffers = true;
            break;
          }
        }
        expect(anyDiffers).toBe(true);
      }
    }
  });

  it('reference distractors can vary position independently of number', () => {
    const matrix = generateStructuredMatrix('seed-32', 10, 'iraven');

    expect(matrix.configId).toBe('out_in_grid');
    expect(matrix.distractors).toHaveLength(7);

    const answerInner = matrix.answer.components[1]!;
    const positionOnlyDistractor = matrix.distractors.find((distractor) => {
      const inner = distractor.components[1];
      const outer = distractor.components[0];
      const answerOuter = matrix.answer.components[0];
      if (!inner || !outer || !answerOuter) return false;

      return (
        inner.numEntities === answerInner.numEntities &&
        inner.positions.join(',') !== answerInner.positions.join(',') &&
        JSON.stringify(inner.entities) === JSON.stringify(answerInner.entities) &&
        JSON.stringify(outer) === JSON.stringify(answerOuter)
      );
    });

    expect(positionOnlyDistractor).toBeDefined();
    expect(positionOnlyDistractor?.components[1]?.positions).toEqual([3]);
  });
});
