import { describe, it, expect } from 'vitest';
import { RULES } from './rules';
import type { RuleId } from './types';
import fixtures from './__fixtures__/raven-python-matrices.json';

interface FixtureBinding {
  ruleId: string;
  attributeId: string;
  step?: number;
  op?: string;
}

interface FixtureEntry {
  seed: number;
  config: string;
  ruleBindings: FixtureBinding[];
  grid: Record<string, number>[][];
  answer: Record<string, number>;
  answerRowValues: Record<string, number[] | undefined>;
  valid: boolean;
}

const fixtureData = fixtures as unknown as {
  version: string;
  totalFixtures: number;
  fixtures: FixtureEntry[];
};

describe('Python fixture cross-validation [LEGACY — not I-RAVEN oracle]', () => {
  it('fixtures file is loaded', () => {
    expect(fixtureData.fixtures.length).toBeGreaterThan(0);
  });

  it('all fixtures have valid flag true', () => {
    for (const f of fixtureData.fixtures) {
      expect(f.valid).toBe(true);
    }
  });

  describe('rule validation matches Python output', () => {
    for (const fixture of fixtureData.fixtures) {
      for (const binding of fixture.ruleBindings) {
        const rowValues = fixture.answerRowValues[binding.attributeId];
        if (!rowValues || rowValues.length !== 3) continue;

        it(`seed=${fixture.seed} rule=${binding.ruleId} attr=${binding.attributeId}`, () => {
          const rule = RULES[binding.ruleId as RuleId];
          const vals: [number, number, number] = [rowValues[0]!, rowValues[1]!, rowValues[2]!];
          const params = {
            ...(binding.step !== undefined ? { step: binding.step } : {}),
            ...(binding.op !== undefined ? { op: binding.op as 'add' | 'sub' } : {}),
          };

          const isValid = rule.validate(vals, params);
          expect(isValid).toBe(true);
        });
      }
    }
  });

  describe('answer matches grid[2][2]', () => {
    for (const fixture of fixtureData.fixtures) {
      it(`seed=${fixture.seed}`, () => {
        const gridAnswer = fixture.grid[2]?.[2];
        expect(gridAnswer).toBeDefined();
        if (gridAnswer) {
          expect(gridAnswer['shape']).toBe(fixture.answer['shape']);
          expect(gridAnswer['size']).toBe(fixture.answer['size']);
          expect(gridAnswer['color']).toBe(fixture.answer['color']);
          expect(gridAnswer['angle']).toBe(fixture.answer['angle']);
        }
      });
    }
  });

  describe('deriveThird matches for non-distribute_three rules', () => {
    for (const fixture of fixtureData.fixtures) {
      for (const binding of fixture.ruleBindings) {
        if (binding.ruleId === 'distribute_three') continue;
        const rowValues = fixture.answerRowValues[binding.attributeId];
        if (!rowValues || rowValues.length !== 3) continue;

        it(`seed=${fixture.seed} derive ${binding.ruleId}×${binding.attributeId}`, () => {
          const rule = RULES[binding.ruleId as RuleId];
          const params = {
            ...(binding.step !== undefined ? { step: binding.step } : {}),
            ...(binding.op !== undefined ? { op: binding.op as 'add' | 'sub' } : {}),
          };
          const derived = rule.deriveThird(rowValues[0]!, rowValues[1]!, params);
          expect(derived).toBe(rowValues[2]);
        });
      }
    }
  });
});
