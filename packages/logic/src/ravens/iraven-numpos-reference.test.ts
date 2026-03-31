import { describe, expect, it } from 'vitest';

import referenceData from './__fixtures__/iraven-reference-numpos-matrices.json';

interface RefEntity {
  type: number;
  size: number;
  color: number;
  angle: number;
}

interface RefComponent {
  numEntities: number;
  entities: RefEntity[];
  positions: number[];
  uniformity: boolean;
}

interface RefRule {
  name: string;
  attr: string;
  param: number | null;
  componentIdx: number;
}

interface RefFixture {
  seed: number;
  tsConfig: string;
  rules: RefRule[][];
  grid: RefComponent[][][];
  answer: RefComponent[];
  options: RefComponent[][];
  numOptions: number;
}

interface RefData {
  focus: string;
  totalFixtures: number;
  configs: string[];
  fixtures: RefFixture[];
}

const data = referenceData as unknown as RefData;

function componentKey(comps: RefComponent[]): string {
  return comps
    .map((c) => {
      const entityParts = c.entities
        .map((e) => `${e.type}:${e.size}:${e.color}:${e.angle}`)
        .join('|');
      const posPart =
        c.positions
          ?.slice()
          .sort((a, b) => a - b)
          .join(',') ?? '';
      return `n${c.numEntities}[${entityParts}]@${posPart}:${c.uniformity ? 'u' : 'nu'}`;
    })
    .join('//');
}

function hasNonConstantNumPosRule(fixture: RefFixture): boolean {
  return fixture.rules.some((ruleGroup) => {
    const firstRule = ruleGroup[0];
    if (!firstRule) return false;
    return (
      ['Number', 'Position', 'Number/Position'].includes(firstRule.attr) &&
      firstRule.name !== 'Constant'
    );
  });
}

describe('Focused I-RAVEN Number/Position fixtures [REFERENCE]', () => {
  it('loads the focused fixture set', () => {
    expect(data.focus).toBe('numpos_nonconstant');
    expect(data.totalFixtures).toBeGreaterThan(0);
    expect(data.configs).toEqual(['grid4', 'grid9', 'out_in_grid']);
  });

  it('contains both Number and Position rule cases', () => {
    let hasNumberCase = false;
    let hasPositionCase = false;

    for (const fixture of data.fixtures) {
      for (const ruleGroup of fixture.rules) {
        const firstRule = ruleGroup[0];
        if (!firstRule || firstRule.name === 'Constant') continue;
        if (firstRule.attr === 'Number') hasNumberCase = true;
        if (firstRule.attr === 'Position') hasPositionCase = true;
      }
    }

    expect(hasNumberCase).toBe(true);
    expect(hasPositionCase).toBe(true);
  });

  // ─── Per-fixture structural validation ──────────────────────────────────
  for (const fixture of data.fixtures) {
    it(`[${fixture.tsConfig}] seed=${fixture.seed}: has a non-constant Number/Position-group rule`, () => {
      expect(hasNonConstantNumPosRule(fixture)).toBe(true);
    });

    it(`[${fixture.tsConfig}] seed=${fixture.seed}: answer is among options`, () => {
      const answerKey = componentKey(fixture.answer);
      const optionKeys = fixture.options.map(componentKey);
      expect(optionKeys).toContain(answerKey);
      expect(fixture.numOptions).toBe(8);
    });
  }

  // ─── Assertive Number rule validation (Slice 1 hardening) ──────────────
  describe('Number rule compliance across rows', () => {
    for (const fixture of data.fixtures) {
      if (!fixture.grid) continue;

      for (let compIdx = 0; compIdx < fixture.rules.length; compIdx++) {
        const firstRule = fixture.rules[compIdx]?.[0];
        if (!firstRule) continue;
        if (!['Number', 'Number/Position'].includes(firstRule.attr)) continue;
        if (firstRule.name === 'Constant') continue;

        for (let row = 0; row < 3; row++) {
          const label = `[${fixture.tsConfig}] seed=${fixture.seed} comp${compIdx} row${row} ${firstRule.name}×Number`;

          it(`${label}: entity counts follow ${firstRule.name} rule`, () => {
            const counts = [0, 1, 2].map((col) => fixture.grid[row]![col]![compIdx]!.numEntities);

            if (firstRule.name === 'Constant') {
              expect(counts[0]).toBe(counts[1]);
              expect(counts[1]).toBe(counts[2]);
            } else if (firstRule.name === 'Progression') {
              const step = counts[1]! - counts[0]!;
              expect(counts[2]! - counts[1]!).toBe(step);
            } else if (firstRule.name === 'Arithmetic') {
              if (firstRule.param === 1) {
                // add: c = a + b (I-RAVEN Number arithmetic has no offset)
                expect(counts[2]).toBe(counts[0]! + counts[1]!);
              } else {
                // sub: c = a - b
                expect(counts[2]).toBe(counts[0]! - counts[1]!);
              }
            } else if (firstRule.name === 'Distribute_Three') {
              // All 3 counts should be distinct
              expect(new Set(counts).size).toBe(3);
            }
          });
        }
      }
    }
  });

  // ─── Position consistency within rows ──────────────────────────────────
  describe('Position indices are coherent within rows', () => {
    for (const fixture of data.fixtures) {
      if (!fixture.grid) continue;

      for (let compIdx = 0; compIdx < fixture.rules.length; compIdx++) {
        for (let row = 0; row < 3; row++) {
          const panels = [0, 1, 2].map((col) => fixture.grid[row]![col]![compIdx]!);
          const allSameCount = panels.every((p) => p.numEntities === panels[0]!.numEntities);
          if (!allSameCount) continue; // skip variable-count rows for position check

          if (panels[0]!.numEntities <= 1) continue;

          const label = `[${fixture.tsConfig}] seed=${fixture.seed} comp${compIdx} row${row}`;

          it(`${label}: positions have correct length per entity count`, () => {
            for (const panel of panels) {
              expect(panel.positions.length).toBe(panel.numEntities);
            }
          });
        }
      }
    }
  });
});
