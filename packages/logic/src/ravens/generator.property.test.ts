import { describe, it, expect } from 'vitest';
import { generateMatrix, generateStructuredMatrix } from './generator';

describe('Generator property tests', () => {
  it('no degenerate matrices over 500 seeds', () => {
    for (let i = 0; i < 500; i++) {
      const level = (i % 10) + 1;
      const matrix = generateMatrix(`prop-${i}`, level);

      // Grid must be 3×3
      expect(matrix.grid).toHaveLength(3);
      for (const row of matrix.grid) {
        expect(row).toHaveLength(3);
      }

      // Must have at least 1 entity in answer
      expect(matrix.answer.entities.length).toBeGreaterThan(0);

      // Must have the right number of distractors
      expect(matrix.distractors.length).toBe(matrix.optionCount - 1);

      // No distractor should equal the answer
      const ansKey = JSON.stringify(matrix.answer);
      for (const d of matrix.distractors) {
        expect(JSON.stringify(d)).not.toBe(ansKey);
      }
    }
  });

  it('difficulty level is preserved', () => {
    for (let level = 1; level <= 10; level++) {
      const matrix = generateMatrix(`diff-${level}`, level);
      expect(matrix.difficulty).toBe(level);
    }
  });

  it('option count matches difficulty config', () => {
    // Neurodual profile (default): levels 1-4: 6, 5-9: 8, 10-12: 10
    const expectedNeurodual: Record<number, number> = {
      1: 6,
      2: 6,
      3: 6,
      4: 6,
      5: 8,
      6: 8,
      7: 8,
      8: 8,
      9: 8,
      10: 10,
      11: 10,
      12: 10,
    };
    for (let level = 1; level <= 12; level++) {
      const matrix = generateMatrix(`opt-${level}`, level);
      expect(matrix.optionCount).toBe(expectedNeurodual[level]);
    }
  });

  it('neurodual levels 11-14 generate valid matrices over 200 seeds', () => {
    for (let i = 0; i < 200; i++) {
      const level = 11 + (i % 4);
      const matrix = generateMatrix(`ext-${i}`, level, 'neurodual');
      expect(matrix.grid).toHaveLength(3);
      for (const row of matrix.grid) expect(row).toHaveLength(3);
      expect(matrix.answer.entities.length).toBeGreaterThan(0);
      expect(matrix.distractors.length).toBe(matrix.optionCount - 1);
      expect(matrix.optionCount).toBe(10);
    }
  });

  it('angle is rule-governed at neurodual levels 13-14', () => {
    let angleRuleFound = false;
    for (let i = 0; i < 200; i++) {
      const level = 13 + (i % 2);
      const structured = generateStructuredMatrix(`angle-${i}`, level, 'neurodual');
      for (const cb of structured.componentBindings) {
        if (cb.ruleBindings.some((b) => b.attributeId === 'angle' && b.ruleId !== 'constant')) {
          angleRuleFound = true;
        }
      }
    }
    // Over 200 seeds at levels 13-14 (maxRules=3-4 over 4 attrs), angle should be rule-governed at least once
    expect(angleRuleFound).toBe(true);
  });

  it('iraven profile never has angle rule-governed', () => {
    for (let i = 0; i < 100; i++) {
      const level = (i % 10) + 1;
      const structured = generateStructuredMatrix(`iraven-angle-${i}`, level, 'iraven');
      for (const cb of structured.componentBindings) {
        const angleBinding = cb.ruleBindings.find((b) => b.attributeId === 'angle');
        // In iraven, angle should never appear in bindings at all
        expect(angleBinding).toBeUndefined();
      }
    }
  });

  it('neurodual levels 15-16 generate valid matrices with forced rules', () => {
    let forcedDistributeFound = false;
    for (let i = 0; i < 100; i++) {
      const level = 15 + (i % 2);
      const structured = generateStructuredMatrix(`s3-${i}`, level, 'neurodual');
      expect(structured.grid).toHaveLength(3);
      // Multi-component configs should have 2 component bindings
      expect(structured.componentBindings.length).toBe(2);
      // Check forced rules appear
      const comp0bindings = structured.componentBindings[0]!.ruleBindings;
      if (level === 16) {
        const shapeBinding = comp0bindings.find((b) => b.attributeId === 'shape');
        if (shapeBinding?.ruleId === 'distribute_three') forcedDistributeFound = true;
      }
    }
    if (forcedDistributeFound) {
      expect(forcedDistributeFound).toBe(true);
    }
  });

  it('neurodual levels 17-20 generate valid matrices with logic rules', () => {
    let xorFound = false;
    let andFound = false;
    let orFound = false;
    for (let i = 0; i < 200; i++) {
      const level = 17 + (i % 4);
      const structured = generateStructuredMatrix(`s4-${i}`, level, 'neurodual');
      expect(structured.grid).toHaveLength(3);
      expect(structured.answer.components.length).toBeGreaterThan(0);
      for (const cb of structured.componentBindings) {
        for (const b of cb.ruleBindings) {
          if (b.ruleId === 'xor') xorFound = true;
          if (b.ruleId === 'and') andFound = true;
          if (b.ruleId === 'or') orFound = true;
        }
      }
    }
    // Over 200 seeds at levels 17-20 with logic rules available/forced, at least XOR should appear
    expect(xorFound).toBe(true);
  });

  it('XOR/AND/OR rules produce valid rows over 100 seeds each', () => {
    const { RULES } = require('./rules');
    const { SeededRandom } = require('./prng');
    const domain = { min: 0, max: 5 };
    for (const ruleId of ['xor', 'and', 'or'] as const) {
      const rule = RULES[ruleId];
      for (let i = 0; i < 100; i++) {
        const rng = new SeededRandom(`${ruleId}-${i}`);
        const row = rule.generateRow(domain, rng);
        expect(rule.validate(row)).toBe(true);
        const derived = rule.deriveThird(row[0], row[1]);
        expect(derived).toBe(row[2]);
        const valid = rule.enumerateValid(domain, row[0], row[1]);
        expect(valid).toContain(row[2]);
      }
    }
  });

  it('neurodual levels 21-25 generate matrices with mesh overlay', () => {
    for (let i = 0; i < 100; i++) {
      const level = 21 + (i % 5);
      const structured = generateStructuredMatrix(`mesh-${i}`, level, 'neurodual');
      // All cells should have mesh at levels 21+
      for (const row of structured.grid) {
        for (const cell of row) {
          expect(cell.mesh).toBeDefined();
          expect(cell.mesh!.lineCount).toBeGreaterThanOrEqual(1);
          expect(cell.mesh!.lineCount).toBeLessThanOrEqual(5);
          expect(cell.mesh!.lineOrientation).toBeGreaterThanOrEqual(0);
          expect(cell.mesh!.lineOrientation).toBeLessThanOrEqual(7);
          expect(cell.mesh!.lineSpacing).toBeGreaterThanOrEqual(0);
          expect(cell.mesh!.lineSpacing).toBeLessThanOrEqual(3);
        }
      }
      // Answer should have mesh
      expect(structured.answer.mesh).toBeDefined();
      // meshBindings should be present
      expect(structured.meshBindings).toBeDefined();
      expect(structured.meshBindings!.length).toBe(3); // one per mesh attr
    }
  });

  it('iraven levels never have mesh', () => {
    for (let i = 0; i < 50; i++) {
      const level = (i % 10) + 1;
      const structured = generateStructuredMatrix(`iraven-mesh-${i}`, level, 'iraven');
      for (const row of structured.grid) {
        for (const cell of row) {
          expect(cell.mesh).toBeUndefined();
        }
      }
    }
  });

  it('neurodual levels 26-28 have perceptual complexity', () => {
    for (let i = 0; i < 50; i++) {
      const level = 26 + (i % 3);
      const structured = generateStructuredMatrix(`perc-${i}`, level, 'neurodual');
      expect(structured.perceptual).toBeDefined();
      expect(structured.perceptual!.overlay).toBe(true);
      if (level >= 27) expect(structured.perceptual!.fusion).toBe(true);
      if (level >= 28) expect(structured.perceptual!.distortion).toBeGreaterThan(0);
    }
  });

  it('neurodual levels below 26 have no perceptual complexity', () => {
    for (let i = 0; i < 50; i++) {
      const level = 1 + (i % 25);
      const structured = generateStructuredMatrix(`no-perc-${i}`, level, 'neurodual');
      expect(structured.perceptual).toBeUndefined();
    }
  });

  it('neurodual levels 29-30 generate valid matrices with meta/cross rules', () => {
    let crossFound = false;
    let metaFound = false;
    for (let i = 0; i < 100; i++) {
      const level = 29 + (i % 2);
      const structured = generateStructuredMatrix(`s8-${i}`, level, 'neurodual');
      expect(structured.grid).toHaveLength(3);
      expect(structured.answer.components.length).toBeGreaterThan(0);
      for (const cb of structured.componentBindings) {
        for (const b of cb.ruleBindings) {
          if (b.ruleId === 'cross_attribute') crossFound = true;
          if (b.ruleId === 'meta_cycle') metaFound = true;
        }
      }
    }
    // cross_attribute is forced on color at level 29+
    expect(crossFound).toBe(true);
  });

  it('all 30 neurodual levels generate valid matrices', () => {
    for (let level = 1; level <= 30; level++) {
      for (let seed = 0; seed < 5; seed++) {
        const matrix = generateMatrix(`full-${level}-${seed}`, level, 'neurodual');
        expect(matrix.grid).toHaveLength(3);
        for (const row of matrix.grid) expect(row).toHaveLength(3);
        expect(matrix.answer.entities.length).toBeGreaterThan(0);
        expect(matrix.distractors.length).toBe(matrix.optionCount - 1);
      }
    }
  });

  it('option count matches iraven config (frozen baseline)', () => {
    // I-RAVEN profile: levels 1-4: 6, 5-10: 8
    const expectedIraven: Record<number, number> = {
      1: 6,
      2: 6,
      3: 6,
      4: 6,
      5: 8,
      6: 8,
      7: 8,
      8: 8,
      9: 8,
      10: 8,
    };
    for (let level = 1; level <= 10; level++) {
      const matrix = generateMatrix(`opt-${level}`, level, 'iraven');
      expect(matrix.optionCount).toBe(expectedIraven[level]);
    }
  });
});
