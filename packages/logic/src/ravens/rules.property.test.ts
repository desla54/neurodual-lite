import { describe, it, expect } from 'vitest';
import { RULES } from './rules';
import { ATTRIBUTE_DOMAINS } from './attributes';
import { SeededRandom } from '../domain/random';
import type { RuleId, AttributeId } from './types';

const RULE_IDS: RuleId[] = ['constant', 'progression', 'arithmetic', 'distribute_three'];
const ATTR_IDS: AttributeId[] = ['shape', 'size', 'color', 'angle'];
const SEED_COUNT = 200;

describe('Rule property: generateRow produces valid rows', () => {
  for (const ruleId of RULE_IDS) {
    for (const attrId of ATTR_IDS) {
      it(`${ruleId} × ${attrId}: valid for ${SEED_COUNT} seeds`, () => {
        const rule = RULES[ruleId];
        const domain = ATTRIBUTE_DOMAINS[attrId];
        const params = ruleId === 'arithmetic' ? { op: 'add' as const } : undefined;

        for (let i = 0; i < SEED_COUNT; i++) {
          const rng = new SeededRandom(`prop-${ruleId}-${attrId}-${i}`);
          const row = rule.generateRow(domain, rng, params);

          // Values must be within domain
          for (const v of row) {
            expect(v).toBeGreaterThanOrEqual(domain.min);
            expect(v).toBeLessThanOrEqual(domain.max);
          }

          // Row must validate
          expect(rule.validate(row, params)).toBe(true);
        }
      });
    }
  }
});

describe('Rule property: deriveThird matches generateRow[2]', () => {
  for (const ruleId of ['constant', 'progression', 'arithmetic'] as RuleId[]) {
    for (const attrId of ATTR_IDS) {
      it(`${ruleId} × ${attrId}`, () => {
        const rule = RULES[ruleId];
        const domain = ATTRIBUTE_DOMAINS[attrId];
        const params = ruleId === 'arithmetic' ? { op: 'add' as const } : undefined;

        for (let i = 0; i < 50; i++) {
          const rng = new SeededRandom(`derive-${ruleId}-${attrId}-${i}`);
          const row = rule.generateRow(domain, rng, params);
          const derived = rule.deriveThird(row[0], row[1], params);
          expect(derived).toBe(row[2]);
        }
      });
    }
  }
});

describe('Rule property: enumerateValid includes the correct answer', () => {
  for (const ruleId of ['constant', 'progression', 'arithmetic'] as RuleId[]) {
    for (const attrId of ATTR_IDS) {
      it(`${ruleId} × ${attrId}`, () => {
        const rule = RULES[ruleId];
        const domain = ATTRIBUTE_DOMAINS[attrId];
        const params = ruleId === 'arithmetic' ? { op: 'add' as const } : undefined;

        for (let i = 0; i < 50; i++) {
          const rng = new SeededRandom(`enum-${ruleId}-${attrId}-${i}`);
          const row = rule.generateRow(domain, rng, params);
          const valid = rule.enumerateValid(domain, row[0], row[1], params);
          expect(valid).toContain(row[2]);
        }
      });
    }
  }
});
