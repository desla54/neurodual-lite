/**
 * S5: Mesh overlay generation.
 *
 * Generates a line-based mesh component for each cell in the 3×3 grid.
 * Each mesh attribute (lineCount, lineOrientation, lineSpacing) can be
 * independently rule-governed, creating a 3rd visual layer.
 */

import type { RuleBinding, RuleId, MeshComponent } from './types';
import type { SeededRandom } from '../domain/random';
import { MESH_DOMAINS } from './attributes';
import { RULES } from './rules';

type MeshAttr = 'lineCount' | 'lineOrientation' | 'lineSpacing';

const MESH_ATTRS: MeshAttr[] = ['lineCount', 'lineOrientation', 'lineSpacing'];

// Allowed non-constant rules per mesh attribute
const MESH_ALLOWED_RULES: Record<MeshAttr, RuleId[]> = {
  lineCount: ['progression', 'distribute_three'],
  lineOrientation: ['progression', 'distribute_three'],
  lineSpacing: ['progression', 'distribute_three'],
};

/**
 * Sample mesh rule bindings. Each mesh attribute gets a binding.
 * @param numRules How many attrs should be non-constant (0 = all constant)
 */
export function sampleMeshBindings(rng: SeededRandom, numRules: number): RuleBinding[] {
  const shuffled = rng.shuffle([...MESH_ATTRS]);
  const bindings: RuleBinding[] = [];

  for (let i = 0; i < shuffled.length; i++) {
    const attr = shuffled[i]!;
    if (i < numRules) {
      const ruleId = rng.choice(MESH_ALLOWED_RULES[attr]);
      const params: RuleBinding['params'] = {};
      if (ruleId === 'progression') {
        params.step = rng.choice([-1, 1]);
      }
      // Map mesh attr name to a pseudo AttributeId for the binding
      bindings.push({ ruleId, attributeId: attr as unknown as RuleBinding['attributeId'], params });
    } else {
      bindings.push({
        ruleId: 'constant',
        attributeId: attr as unknown as RuleBinding['attributeId'],
      });
    }
  }

  return bindings;
}

/**
 * Generate mesh component values for the 3×3 grid.
 * Returns 3 rows × 3 cols of MeshComponent.
 */
export function generateMeshGrid(rng: SeededRandom, bindings: RuleBinding[]): MeshComponent[][] {
  // Generate attribute rows (3 rows of [col0, col1, col2])
  const attrRows = new Map<string, [number, number, number][]>();

  for (const binding of bindings) {
    const attrName = binding.attributeId as string as MeshAttr;
    const domain = MESH_DOMAINS[attrName];
    if (!domain) continue;

    const rule = RULES[binding.ruleId];

    if (binding.ruleId === 'distribute_three') {
      const pool: number[] = [];
      for (let i = domain.min; i <= domain.max; i++) pool.push(i);
      const picked: number[] = [];
      const available = [...pool];
      for (let j = 0; j < 3 && available.length > 0; j++) {
        const idx = rng.int(0, available.length);
        picked.push(available[idx]!);
        available.splice(idx, 1);
      }
      // Generate 3 distinct permutations
      const perms = [
        [picked[0]!, picked[1]!, picked[2]!],
        [picked[1]!, picked[2]!, picked[0]!],
        [picked[2]!, picked[0]!, picked[1]!],
      ] as [number, number, number][];
      const shuffledPerms = rng.shuffle([...perms]);
      attrRows.set(attrName, shuffledPerms.slice(0, 3) as [number, number, number][]);
    } else {
      const rows: [number, number, number][] = [];
      for (let row = 0; row < 3; row++) {
        rows.push(rule.generateRow(domain, rng, binding.params));
      }
      attrRows.set(attrName, rows);
    }
  }

  // Build 3×3 mesh grid
  const grid: MeshComponent[][] = [];
  for (let row = 0; row < 3; row++) {
    const rowMeshes: MeshComponent[] = [];
    for (let col = 0; col < 3; col++) {
      const lc = attrRows.get('lineCount')?.[row]?.[col] ?? 2;
      const lo = attrRows.get('lineOrientation')?.[row]?.[col] ?? 3;
      const ls = attrRows.get('lineSpacing')?.[row]?.[col] ?? 1;
      rowMeshes.push({ lineCount: lc, lineOrientation: lo, lineSpacing: ls });
    }
    grid.push(rowMeshes);
  }

  return grid;
}
