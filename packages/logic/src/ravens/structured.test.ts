import { describe, it, expect } from 'vitest';
import { generateMatrix, generateStructuredMatrix } from './generator';
import { flattenCell, flattenMatrix } from './flatten';

describe('Structured model (Slice 2)', () => {
  describe('generateStructuredMatrix', () => {
    it('returns a valid structured matrix', () => {
      const m = generateStructuredMatrix('struct-test-1', 5);
      expect(m.grid).toHaveLength(3);
      for (const row of m.grid) {
        expect(row).toHaveLength(3);
        for (const cell of row) {
          expect(cell.components.length).toBeGreaterThanOrEqual(1);
          for (const comp of cell.components) {
            expect(comp.entities.length).toBe(comp.numEntities);
            expect(comp.positions.length).toBe(comp.numEntities);
          }
        }
      }
    });

    it('answer matches grid[2][2]', () => {
      const m = generateStructuredMatrix('struct-test-2', 5);
      expect(m.answer).toBe(m.grid[2]![2]!);
    });

    it('has componentBindings for all components', () => {
      const m = generateStructuredMatrix('struct-test-3', 8);
      const numComponents = m.grid[0]![0]!.components.length;
      expect(m.componentBindings).toHaveLength(numComponents);
    });
  });

  describe('flattenCell', () => {
    it('flattens single-component cell', () => {
      const flat = flattenCell({
        components: [
          {
            numEntities: 2,
            positions: [0, 2],
            entities: [
              { shape: 1, size: 2, color: 3, angle: 4 },
              { shape: 5, size: 0, color: 1, angle: 2 },
            ],
            uniform: false,
          },
        ],
      });
      expect(flat.entities).toHaveLength(2);
      expect(flat.positions).toEqual([0, 2]);
      expect(flat.entities[0]!.shape).toBe(1);
      expect(flat.entities[1]!.shape).toBe(5);
    });

    it('flattens multi-component cell with position offsets', () => {
      const flat = flattenCell({
        components: [
          {
            numEntities: 1,
            positions: [0],
            entities: [{ shape: 1, size: 2, color: 3, angle: 4 }],
            uniform: true,
          },
          {
            numEntities: 2,
            positions: [0, 1],
            entities: [
              { shape: 2, size: 3, color: 4, angle: 5 },
              { shape: 3, size: 4, color: 5, angle: 6 },
            ],
            uniform: false,
          },
        ],
      });
      expect(flat.entities).toHaveLength(3);
      // Component 0 positions: 0*10 + pos
      expect(flat.positions[0]).toBe(0);
      // Component 1 positions: 1*10 + pos
      expect(flat.positions[1]).toBe(10);
      expect(flat.positions[2]).toBe(11);
    });
  });

  describe('flattenMatrix round-trip', () => {
    it('flattenMatrix output matches generateMatrix output', () => {
      for (let i = 0; i < 20; i++) {
        const seed = `roundtrip-${i}`;
        const diff = ((i % 10) + 1) as number;
        const flat = generateMatrix(seed, diff);
        const structured = generateStructuredMatrix(seed, diff);
        const roundTripped = flattenMatrix(structured);

        expect(roundTripped.configId).toBe(flat.configId);
        expect(roundTripped.difficulty).toBe(flat.difficulty);
        expect(roundTripped.seed).toBe(flat.seed);
        expect(roundTripped.optionCount).toBe(flat.optionCount);
        expect(roundTripped.grid).toEqual(flat.grid);
        expect(roundTripped.answer).toEqual(flat.answer);
        expect(roundTripped.ruleBindings).toEqual(flat.ruleBindings);
      }
    });
  });

  describe('reference profile', () => {
    it('iraven profile excludes grid5', () => {
      let sawGrid5 = false;
      for (let i = 0; i < 200; i++) {
        const m = generateMatrix(`iraven-${i}`, 5, 'iraven');
        if (m.configId === 'grid5') {
          sawGrid5 = true;
          break;
        }
      }
      expect(sawGrid5).toBe(false);
    });

    it('neurodual profile allows grid5', () => {
      let sawGrid5 = false;
      for (let i = 0; i < 200; i++) {
        const m = generateMatrix(`neurodual-${i}`, 5, 'neurodual');
        if (m.configId === 'grid5') {
          sawGrid5 = true;
          break;
        }
      }
      expect(sawGrid5).toBe(true);
    });

    it('iraven profile only uses canonical configs', () => {
      const canonical = new Set([
        'center',
        'grid4',
        'grid9',
        'left_right',
        'up_down',
        'out_in_center',
        'out_in_grid',
      ]);
      for (let i = 0; i < 100; i++) {
        const diff = ((i % 10) + 1) as number;
        const m = generateMatrix(`iraven-check-${i}`, diff, 'iraven');
        expect(canonical.has(m.configId)).toBe(true);
      }
    });

    it('default profile is neurodual', () => {
      const m1 = generateMatrix('default-test', 5);
      const m2 = generateMatrix('default-test', 5, 'neurodual');
      expect(m1).toEqual(m2);
    });
  });

  describe('non-uniform entities (Slice 4)', () => {
    it('multi-entity cells can have non-uniform entities', () => {
      let foundNonUniform = false;
      for (let i = 0; i < 100; i++) {
        const m = generateStructuredMatrix(`nonuniform-${i}`, 5);
        for (const row of m.grid) {
          for (const cell of row) {
            for (const comp of cell.components) {
              if (comp.numEntities > 1 && !comp.uniform) {
                // Verify entities actually differ
                const e0 = comp.entities[0]!;
                const e1 = comp.entities[1]!;
                if (
                  e0.shape !== e1.shape ||
                  e0.size !== e1.size ||
                  e0.color !== e1.color ||
                  e0.angle !== e1.angle
                ) {
                  foundNonUniform = true;
                }
              }
            }
          }
        }
        if (foundNonUniform) break;
      }
      expect(foundNonUniform).toBe(true);
    });
  });

  describe('Number/Position rules (Slice 3)', () => {
    it('number bindings are populated for grid configs', () => {
      let found = false;
      for (let i = 0; i < 50; i++) {
        const m = generateStructuredMatrix(`numpos-${i}`, 5);
        if (['grid4', 'grid5', 'grid9'].includes(m.configId)) {
          expect(m.numberBindings[0]).not.toBeNull();
          found = true;
        }
      }
      expect(found).toBe(true);
    });

    it('entity counts follow number rule within rows', () => {
      for (let i = 0; i < 50; i++) {
        const m = generateStructuredMatrix(`numrule-${i}`, 5);
        const nb = m.numberBindings[0];
        if (!nb) continue;
        if (nb.ruleId === 'constant') {
          // All cells should have same entity count
          const firstCount = m.grid[0]![0]!.components[0]!.numEntities;
          for (const row of m.grid) {
            for (const cell of row) {
              expect(cell.components[0]!.numEntities).toBe(firstCount);
            }
          }
        } else if (nb.ruleId === 'progression') {
          // Within each row, counts should progress
          for (const row of m.grid) {
            const counts = row.map((c) => c.components[0]!.numEntities);
            const step = counts[1]! - counts[0]!;
            expect(counts[2]! - counts[1]!).toBe(step);
          }
        }
      }
    });
  });
});
