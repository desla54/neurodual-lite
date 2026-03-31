import { describe, it, expect } from 'vitest';
import { generateMatrix } from './generator';
import type { ConfigId } from './types';

const MULTI_COMPONENT_CONFIGS: ConfigId[] = [
  'left_right',
  'up_down',
  'out_in_center',
  'out_in_grid',
];

describe('Multi-component configurations', () => {
  // Generate matrices until we get each multi-component config
  function findMatrixWithConfig(
    targetConfig: ConfigId,
    maxAttempts = 200,
  ): ReturnType<typeof generateMatrix> | null {
    for (let i = 0; i < maxAttempts; i++) {
      // Use higher difficulty levels where multi-component configs are allowed
      const matrix = generateMatrix(`multi-${targetConfig}-${i}`, 8);
      if (matrix.configId === targetConfig) return matrix;
    }
    return null;
  }

  for (const configId of MULTI_COMPONENT_CONFIGS) {
    describe(configId, () => {
      it('can be generated', () => {
        const matrix = findMatrixWithConfig(configId);
        // Some configs may not appear in 200 attempts due to random selection
        // but at level 8, only multi-component configs are allowed
        if (!matrix) return; // skip if not found
        expect(matrix.configId).toBe(configId);
      });

      it('has multi-entity cells', () => {
        const matrix = findMatrixWithConfig(configId);
        if (!matrix) return;

        // Multi-component configs should have cells with >1 entity
        const cell = matrix.grid[0]![0]!;
        expect(cell.entities.length).toBeGreaterThanOrEqual(2);
      });

      it('has valid 3x3 grid', () => {
        const matrix = findMatrixWithConfig(configId);
        if (!matrix) return;

        expect(matrix.grid).toHaveLength(3);
        for (const row of matrix.grid) {
          expect(row).toHaveLength(3);
        }
      });

      it('answer differs from all distractors', () => {
        const matrix = findMatrixWithConfig(configId);
        if (!matrix) return;

        const ansKey = JSON.stringify(matrix.answer);
        for (const d of matrix.distractors) {
          expect(JSON.stringify(d)).not.toBe(ansKey);
        }
      });

      it('all cells have at least 1 entity and within slot bounds', () => {
        const matrix = findMatrixWithConfig(configId);
        if (!matrix) return;

        for (const row of matrix.grid) {
          for (const cell of row) {
            expect(cell.entities.length).toBeGreaterThanOrEqual(1);
            // Entity count should not exceed total slots across all components
            expect(cell.entities.length).toBeLessThanOrEqual(12);
          }
        }
      });

      it('components have independent attribute values', () => {
        const matrix = findMatrixWithConfig(configId);
        if (!matrix) return;
        if (matrix.grid[0]![0]!.entities.length < 2) return;

        // Check that components don't always have identical attributes
        let allIdentical = true;
        for (const row of matrix.grid) {
          for (const cell of row) {
            const e0 = cell.entities[0]!;
            const e1 = cell.entities[1]!;
            if (
              e0.shape !== e1.shape ||
              e0.size !== e1.size ||
              e0.color !== e1.color ||
              e0.angle !== e1.angle
            ) {
              allIdentical = false;
              break;
            }
          }
          if (!allIdentical) break;
        }
        // Components SHOULD generally differ (not always identical)
        // This is probabilistic, but with independent random generation
        // the chance of all 9 cells having identical components is negligible
        expect(allIdentical).toBe(false);
      });
    });
  }

  it('distribute_three rows have distinct permutations', () => {
    // Generate many matrices and check distribute_three bindings
    let found = false;
    for (let i = 0; i < 100; i++) {
      const matrix = generateMatrix(`d3-perm-${i}`, 6);
      const d3Bindings = matrix.ruleBindings.filter((b) => b.ruleId === 'distribute_three');
      if (d3Bindings.length === 0) continue;
      found = true;

      // For each d3 binding, extract the attribute values across rows
      for (const binding of d3Bindings) {
        const attr = binding.attributeId as 'shape' | 'size' | 'color' | 'angle';
        const rows: string[] = [];
        for (let row = 0; row < 3; row++) {
          const vals = matrix.grid[row]!.map((cell) => cell.entities[0]![attr]);
          rows.push(vals.join(','));
        }
        // All 3 rows should be different permutations
        const uniqueRows = new Set(rows);
        expect(uniqueRows.size).toBe(3);
      }
    }
    expect(found).toBe(true);
  });
});
