import type {
  AttributeId,
  RuleBinding,
  RavensMatrix,
  DifficultyConfig,
  ComponentBinding,
  ConfigId,
  RuleId,
  ReferenceProfile,
  StructuredCell,
  StructuredComponent,
  StructuredEntity,
  StructuredRavensMatrix,
} from './types';
import { PROFILE_MAX_LEVELS } from './types';
import { SeededRandom, choiceN } from './prng';
import { ATTRIBUTE_DOMAINS } from './attributes';
import { CONFIGURATIONS } from './configurations';
import { RULES, pruneConstraints } from './rules';
import { generateDistractors, generateReferenceDistractors } from './distractors';
import { flattenMatrix, flattenCell } from './flatten';
import { sampleMeshBindings, generateMeshGrid } from './mesh';
import { getPerceptualComplexity } from './perceptual';

// =============================================================================
// Difficulty Configs
// =============================================================================

const DIFFICULTY_CONFIGS: Record<number, DifficultyConfig> = {
  1: {
    minRules: 1,
    maxRules: 1,
    minVaryingAttrs: 1,
    maxVaryingAttrs: 1,
    allowedConfigs: ['center'],
    optionCount: 6,
  },
  2: {
    minRules: 1,
    maxRules: 1,
    minVaryingAttrs: 1,
    maxVaryingAttrs: 2,
    allowedConfigs: ['center', 'grid4'],
    optionCount: 6,
  },
  3: {
    minRules: 1,
    maxRules: 2,
    minVaryingAttrs: 2,
    maxVaryingAttrs: 2,
    allowedConfigs: ['center', 'grid4', 'left_right'],
    optionCount: 6,
  },
  4: {
    minRules: 2,
    maxRules: 2,
    minVaryingAttrs: 2,
    maxVaryingAttrs: 3,
    allowedConfigs: ['center', 'grid4', 'left_right', 'up_down'],
    optionCount: 6,
  },
  5: {
    minRules: 2,
    maxRules: 2,
    minVaryingAttrs: 3,
    maxVaryingAttrs: 3,
    allowedConfigs: ['center', 'grid4', 'grid5', 'grid9'],
    optionCount: 8,
  },
  6: {
    minRules: 2,
    maxRules: 3,
    minVaryingAttrs: 3,
    maxVaryingAttrs: 3,
    allowedConfigs: [
      'center',
      'grid4',
      'grid5',
      'grid9',
      'left_right',
      'up_down',
      'out_in_center',
      'out_in_grid',
    ],
    optionCount: 8,
  },
  7: {
    minRules: 3,
    maxRules: 3,
    minVaryingAttrs: 3,
    maxVaryingAttrs: 3,
    allowedConfigs: [
      'center',
      'grid4',
      'grid5',
      'grid9',
      'left_right',
      'up_down',
      'out_in_center',
      'out_in_grid',
    ],
    optionCount: 8,
  },
  8: {
    minRules: 3,
    maxRules: 3,
    minVaryingAttrs: 3,
    maxVaryingAttrs: 3,
    allowedConfigs: ['left_right', 'up_down', 'out_in_center', 'out_in_grid'],
    optionCount: 8,
  },
  9: {
    minRules: 3,
    maxRules: 3,
    minVaryingAttrs: 3,
    maxVaryingAttrs: 3,
    allowedConfigs: ['left_right', 'up_down', 'out_in_center', 'out_in_grid'],
    optionCount: 8,
  },
  10: {
    minRules: 3,
    maxRules: 3,
    minVaryingAttrs: 3,
    maxVaryingAttrs: 3,
    allowedConfigs: [
      'center',
      'grid4',
      'grid5',
      'grid9',
      'left_right',
      'up_down',
      'out_in_center',
      'out_in_grid',
    ],
    optionCount: 8,
  },
};

// =============================================================================
// Neurodual Difficulty Configs (S1→S8 cumulative)
// =============================================================================

const MULTI_COMPONENT_CONFIGS: ConfigId[] = [
  'left_right',
  'up_down',
  'out_in_center',
  'out_in_grid',
];

const ALL_CONFIGS: ConfigId[] = [
  'center',
  'grid4',
  'grid5',
  'grid9',
  'left_right',
  'up_down',
  'out_in_center',
  'out_in_grid',
];

const DENSE_CONFIGS: ConfigId[] = ['grid9', 'out_in_grid'];

const NEURODUAL_CONFIGS: Record<number, DifficultyConfig> = {
  // Levels 1-6: identical to iraven baseline
  1: {
    minRules: 1,
    maxRules: 1,
    minVaryingAttrs: 1,
    maxVaryingAttrs: 1,
    allowedConfigs: ['center'],
    optionCount: 6,
  },
  2: {
    minRules: 1,
    maxRules: 1,
    minVaryingAttrs: 1,
    maxVaryingAttrs: 2,
    allowedConfigs: ['center', 'grid4'],
    optionCount: 6,
  },
  3: {
    minRules: 1,
    maxRules: 2,
    minVaryingAttrs: 2,
    maxVaryingAttrs: 2,
    allowedConfigs: ['center', 'grid4', 'left_right'],
    optionCount: 6,
  },
  4: {
    minRules: 2,
    maxRules: 2,
    minVaryingAttrs: 2,
    maxVaryingAttrs: 3,
    allowedConfigs: ['center', 'grid4', 'left_right', 'up_down'],
    optionCount: 6,
  },
  5: {
    minRules: 2,
    maxRules: 2,
    minVaryingAttrs: 3,
    maxVaryingAttrs: 3,
    allowedConfigs: ['center', 'grid4', 'grid5', 'grid9'],
    optionCount: 8,
  },
  6: {
    minRules: 2,
    maxRules: 3,
    minVaryingAttrs: 3,
    maxVaryingAttrs: 3,
    allowedConfigs: ALL_CONFIGS,
    optionCount: 8,
  },
  // Level 7: 3 rules, mono-component only (isolate rule difficulty)
  7: {
    minRules: 3,
    maxRules: 3,
    minVaryingAttrs: 3,
    maxVaryingAttrs: 3,
    allowedConfigs: ['center', 'grid4', 'grid5', 'grid9'],
    optionCount: 8,
  },
  // Level 8: 3 rules, multi-component only
  8: {
    minRules: 3,
    maxRules: 3,
    minVaryingAttrs: 3,
    maxVaryingAttrs: 3,
    allowedConfigs: MULTI_COMPONENT_CONFIGS,
    optionCount: 8,
  },
  // Level 9: 3 rules, densest configs only (grid9 + out_in_grid)
  9: {
    minRules: 3,
    maxRules: 3,
    minVaryingAttrs: 3,
    maxVaryingAttrs: 3,
    allowedConfigs: DENSE_CONFIGS,
    optionCount: 8,
  },
  // Level 10: 3 rules, multi-component, 10 options
  10: {
    minRules: 3,
    maxRules: 3,
    minVaryingAttrs: 3,
    maxVaryingAttrs: 3,
    allowedConfigs: MULTI_COMPONENT_CONFIGS,
    optionCount: 10,
  },
  // Level 11: 3 rules, force distribute_three heavy, 10 options
  11: {
    minRules: 3,
    maxRules: 3,
    minVaryingAttrs: 3,
    maxVaryingAttrs: 3,
    allowedConfigs: ALL_CONFIGS,
    optionCount: 10,
  },
  // Level 12: 3 rules, force arithmetic + distribute_three, densest configs, 10 options
  12: {
    minRules: 3,
    maxRules: 3,
    minVaryingAttrs: 3,
    maxVaryingAttrs: 3,
    allowedConfigs: DENSE_CONFIGS,
    optionCount: 10,
  },
  // S2: Levels 13-14 — angle rule-governed, maxRules=4
  13: {
    minRules: 3,
    maxRules: 4,
    minVaryingAttrs: 3,
    maxVaryingAttrs: 4,
    allowedConfigs: ALL_CONFIGS,
    optionCount: 10,
    useExtendedAttrs: true,
  },
  14: {
    minRules: 4,
    maxRules: 4,
    minVaryingAttrs: 4,
    maxVaryingAttrs: 4,
    allowedConfigs: MULTI_COMPONENT_CONFIGS,
    optionCount: 10,
    useExtendedAttrs: true,
  },
  // S3: Levels 15-16 — per-component difficulty profiles
  15: {
    minRules: 3,
    maxRules: 4,
    minVaryingAttrs: 3,
    maxVaryingAttrs: 4,
    allowedConfigs: MULTI_COMPONENT_CONFIGS,
    optionCount: 10,
    useExtendedAttrs: true,
    componentProfiles: [
      { minRules: 4, maxRules: 4, forcedRules: { color: 'distribute_three' } },
      { minRules: 3, maxRules: 3 },
    ],
  },
  16: {
    minRules: 4,
    maxRules: 4,
    minVaryingAttrs: 4,
    maxVaryingAttrs: 4,
    allowedConfigs: MULTI_COMPONENT_CONFIGS,
    optionCount: 10,
    useExtendedAttrs: true,
    componentProfiles: [
      { minRules: 4, maxRules: 4, forcedRules: { shape: 'distribute_three' } },
      { minRules: 4, maxRules: 4, forcedRules: { color: 'arithmetic' } },
    ],
  },
  // S4: Levels 17-20 — XOR/AND/OR logic rules
  17: {
    minRules: 4,
    maxRules: 4,
    minVaryingAttrs: 4,
    maxVaryingAttrs: 4,
    allowedConfigs: ALL_CONFIGS,
    optionCount: 10,
    useExtendedAttrs: true,
    // xor/and/or are in the allowed pool but not forced
  },
  18: {
    minRules: 4,
    maxRules: 4,
    minVaryingAttrs: 4,
    maxVaryingAttrs: 4,
    allowedConfigs: MULTI_COMPONENT_CONFIGS,
    optionCount: 10,
    useExtendedAttrs: true,
    minLogicRules: 1,
    componentProfiles: [
      { minRules: 4, maxRules: 4, forcedRules: { shape: 'xor' } },
      { minRules: 4, maxRules: 4 },
    ],
  },
  19: {
    minRules: 4,
    maxRules: 4,
    minVaryingAttrs: 4,
    maxVaryingAttrs: 4,
    allowedConfigs: MULTI_COMPONENT_CONFIGS,
    optionCount: 10,
    useExtendedAttrs: true,
    componentProfiles: [
      { minRules: 4, maxRules: 4, forcedRules: { shape: 'xor' } },
      { minRules: 4, maxRules: 4, forcedRules: { color: 'and' } },
    ],
  },
  20: {
    minRules: 4,
    maxRules: 4,
    minVaryingAttrs: 4,
    maxVaryingAttrs: 4,
    allowedConfigs: ['out_in_grid'],
    optionCount: 10,
    useExtendedAttrs: true,
    componentProfiles: [
      { minRules: 4, maxRules: 4, forcedRules: { shape: 'xor', color: 'or' } },
      { minRules: 4, maxRules: 4, forcedRules: { shape: 'and', color: 'xor' } },
    ],
  },
  // S5: Levels 21-25 — mesh overlay
  21: {
    minRules: 4,
    maxRules: 4,
    minVaryingAttrs: 4,
    maxVaryingAttrs: 4,
    allowedConfigs: ALL_CONFIGS,
    optionCount: 10,
    useExtendedAttrs: true,
    hasMesh: true, // mesh with 0 varying attrs (constant — visual complexity only)
  },
  22: {
    minRules: 4,
    maxRules: 4,
    minVaryingAttrs: 4,
    maxVaryingAttrs: 4,
    allowedConfigs: ALL_CONFIGS,
    optionCount: 10,
    useExtendedAttrs: true,
    hasMesh: true, // mesh with 1 varying attr
  },
  23: {
    minRules: 4,
    maxRules: 4,
    minVaryingAttrs: 4,
    maxVaryingAttrs: 4,
    allowedConfigs: MULTI_COMPONENT_CONFIGS,
    optionCount: 10,
    useExtendedAttrs: true,
    hasMesh: true, // mesh with 2 varying attrs
  },
  24: {
    minRules: 4,
    maxRules: 4,
    minVaryingAttrs: 4,
    maxVaryingAttrs: 4,
    allowedConfigs: MULTI_COMPONENT_CONFIGS,
    optionCount: 10,
    useExtendedAttrs: true,
    hasMesh: true, // mesh with 3 varying attrs
    componentProfiles: [
      { minRules: 4, maxRules: 4, forcedRules: { shape: 'xor' } },
      { minRules: 4, maxRules: 4, forcedRules: { color: 'and' } },
    ],
  },
  25: {
    minRules: 4,
    maxRules: 4,
    minVaryingAttrs: 4,
    maxVaryingAttrs: 4,
    allowedConfigs: ['out_in_grid'],
    optionCount: 10,
    useExtendedAttrs: true,
    hasMesh: true, // mesh with 3 varying attrs + all entity rules maxed
    componentProfiles: [
      { minRules: 4, maxRules: 4, forcedRules: { shape: 'xor', color: 'or' } },
      { minRules: 4, maxRules: 4, forcedRules: { shape: 'and', color: 'xor' } },
    ],
  },
  // S7: Levels 26-28 — Embretson perceptual complexity
  26: {
    minRules: 4,
    maxRules: 4,
    minVaryingAttrs: 4,
    maxVaryingAttrs: 4,
    allowedConfigs: ALL_CONFIGS,
    optionCount: 10,
    useExtendedAttrs: true,
    hasMesh: true,
    // perceptual: overlay=true (set via getPerceptualComplexity)
  },
  27: {
    minRules: 4,
    maxRules: 4,
    minVaryingAttrs: 4,
    maxVaryingAttrs: 4,
    allowedConfigs: MULTI_COMPONENT_CONFIGS,
    optionCount: 10,
    useExtendedAttrs: true,
    hasMesh: true,
    // perceptual: overlay + fusion
  },
  28: {
    minRules: 4,
    maxRules: 4,
    minVaryingAttrs: 4,
    maxVaryingAttrs: 4,
    allowedConfigs: DENSE_CONFIGS,
    optionCount: 10,
    useExtendedAttrs: true,
    hasMesh: true,
    componentProfiles: [
      { minRules: 4, maxRules: 4, forcedRules: { shape: 'xor', color: 'or' } },
      { minRules: 4, maxRules: 4, forcedRules: { shape: 'and', color: 'xor' } },
    ],
    // perceptual: overlay + fusion + distortion
  },
  // S8: Levels 29-30 — interactive/meta-rules (ultimate ceiling)
  29: {
    minRules: 4,
    maxRules: 4,
    minVaryingAttrs: 4,
    maxVaryingAttrs: 4,
    allowedConfigs: DENSE_CONFIGS,
    optionCount: 10,
    useExtendedAttrs: true,
    hasMesh: true,
    componentProfiles: [
      { minRules: 4, maxRules: 4, forcedRules: { color: 'cross_attribute' } },
      { minRules: 4, maxRules: 4, forcedRules: { shape: 'xor' } },
    ],
  },
  30: {
    minRules: 4,
    maxRules: 4,
    minVaryingAttrs: 4,
    maxVaryingAttrs: 4,
    allowedConfigs: ['out_in_grid'],
    optionCount: 10,
    useExtendedAttrs: true,
    hasMesh: true,
    componentProfiles: [
      { minRules: 4, maxRules: 4, forcedRules: { shape: 'meta_cycle', color: 'cross_attribute' } },
      { minRules: 4, maxRules: 4, forcedRules: { shape: 'xor', color: 'and' } },
    ],
  },
};

/**
 * Profile-aware difficulty config resolution.
 * iraven: frozen at levels 1-10. neurodual: levels 1-30.
 */
function getDifficultyConfig(level: number, profile: ReferenceProfile): DifficultyConfig {
  const maxLevel = PROFILE_MAX_LEVELS[profile];
  const clamped = Math.max(1, Math.min(maxLevel, Math.round(level)));
  if (profile === 'iraven') {
    return DIFFICULTY_CONFIGS[clamped]!;
  }
  return NEURODUAL_CONFIGS[clamped]!;
}

// I-RAVEN canonical configs (no grid5)
const IRAVEN_CONFIGS: ConfigId[] = [
  'center',
  'grid4',
  'grid9',
  'left_right',
  'up_down',
  'out_in_center',
  'out_in_grid',
];

// Per I-RAVEN: Angle is never rule-governed (sampled randomly).
// Rules only apply to shape (Type), size, and color.
const RULE_ATTRIBUTES: AttributeId[] = ['shape', 'size', 'color'];

// S2: Neurodual adds angle as a rule-governed attribute.
const NEURODUAL_RULE_ATTRIBUTES: AttributeId[] = ['shape', 'size', 'color', 'angle'];

// Shape domain for rule sampling: exclude "none" (index 0).
// I-RAVEN uses Type min=1 for rule-governed shapes.
const SHAPE_RULE_DOMAIN = { min: 1, max: 5 };

// Per I-RAVEN: Arithmetic is NOT valid on Type (shape).
// Map each attribute to its allowed non-constant rules.
const ALLOWED_RULES: Record<string, RuleId[]> = {
  shape: ['progression', 'distribute_three'],
  size: ['progression', 'arithmetic', 'distribute_three'],
  color: ['progression', 'arithmetic', 'distribute_three'],
};

// S2: Extended allowed rules for neurodual (angle = no arithmetic, wrapping is confusing)
// S4: XOR/AND/OR on discrete attrs (shape, color) only — not size/angle (continuous)
// S8: cross_attribute on color (derives from shape), meta_cycle on shape
const NEURODUAL_ALLOWED_RULES: Record<string, RuleId[]> = {
  shape: ['progression', 'distribute_three', 'xor', 'and', 'or', 'meta_cycle'],
  size: ['progression', 'arithmetic', 'distribute_three'],
  color: ['progression', 'arithmetic', 'distribute_three', 'xor', 'and', 'or', 'cross_attribute'],
  angle: ['progression', 'distribute_three'],
};

// Number rules for configs with hasPositionAttr (grid4, grid5, grid9, out_in_grid)
const NUMBER_RULES: RuleId[] = ['constant', 'progression', 'arithmetic', 'distribute_three'];

// =============================================================================
// Number/Position Rule — entity count AND position indices per cell (Slice 3)
// =============================================================================

interface NumberPositionResult {
  /** 3 rows × 3 cols of entity counts */
  numberGrid: number[][];
  /** 3 rows × 3 cols of position index arrays */
  positionGrid: number[][][];
  numberRuleBinding: RuleBinding;
}

/**
 * Generate Number rule rows: entity counts follow the rule across columns.
 *
 * Per I-RAVEN, the Number/Position rule governs BOTH how many entities
 * appear AND which positions are occupied. Position indices follow a
 * consistent pattern across each row (Slice 3 alignment).
 */
function generateNumberPositionGrid(
  rng: SeededRandom,
  maxSlots: number,
  ruleId: RuleId,
): NumberPositionResult {
  const minN = 1;
  const maxN = maxSlots;
  const params: RuleBinding['params'] = {};
  const numberGrid: number[][] = [];

  if (ruleId === 'constant') {
    const n = rng.int(minN, maxN + 1);
    for (let row = 0; row < 3; row++) {
      numberGrid.push([n, n, n]);
    }
  } else if (ruleId === 'progression') {
    const step = rng.choice([1, -1]);
    params.step = step;
    for (let row = 0; row < 3; row++) {
      const lo = step > 0 ? minN : minN + 2 * Math.abs(step);
      const hi = step > 0 ? maxN - 2 * step : maxN;
      if (lo > hi) {
        const n = rng.int(minN, maxN + 1);
        numberGrid.push([n, n, n]);
      } else {
        const v = rng.int(lo, hi + 1);
        numberGrid.push([v, v + step, v + 2 * step]);
      }
    }
  } else if (ruleId === 'arithmetic') {
    const op = rng.choice(['add', 'sub'] as const);
    params.op = op;
    params.offset = 1;
    for (let row = 0; row < 3; row++) {
      let found = false;
      for (let attempt = 0; attempt < 20; attempt++) {
        const a = rng.int(minN, maxN + 1);
        const b = rng.int(minN, maxN + 1);
        const c = op === 'add' ? a + b + 1 : a - b - 1;
        if (c >= minN && c <= maxN) {
          numberGrid.push([a, b, c]);
          found = true;
          break;
        }
      }
      if (!found) {
        const n = rng.int(minN, maxN + 1);
        numberGrid.push([n, n, n]);
      }
    }
  } else {
    // distribute_three
    const range = maxN - minN + 1;
    const pool: number[] = [];
    for (let i = minN; i <= maxN; i++) pool.push(i);
    const picked = range >= 3 ? choiceN(rng, pool, 3) : [minN, Math.min(minN + 1, maxN), maxN];
    const allPerms = permutationsOf3(picked);
    const shuffled = rng.shuffle([...allPerms]);
    for (let row = 0; row < 3; row++) {
      numberGrid.push([...(shuffled[row % shuffled.length] as number[])]);
    }
  }

  // Position rule: positions follow a consistent pattern within each row.
  // Per I-RAVEN, when entity count changes across columns, positions are
  // assigned coherently (not random per cell). We generate a base position
  // set per row and derive subsets for each column's entity count.
  const allSlots = Array.from({ length: maxSlots }, (_, i) => i);
  const positionGrid: number[][][] = [];

  for (let row = 0; row < 3; row++) {
    // Generate a shuffled base ordering for this row
    const baseOrder = rng.shuffle([...allSlots]);
    const rowPositions: number[][] = [];

    for (let col = 0; col < 3; col++) {
      const n = numberGrid[row]![col]!;
      if (n >= maxSlots) {
        rowPositions.push([...allSlots]);
      } else {
        // Take first N from the base order — consistent within the row
        rowPositions.push(baseOrder.slice(0, n).sort((a, b) => a - b));
      }
    }
    positionGrid.push(rowPositions);
  }

  return {
    numberGrid,
    positionGrid,
    numberRuleBinding: { ruleId, attributeId: 'number', params },
  };
}

// =============================================================================
// Helpers
// =============================================================================

/** Return all 6 permutations of a 3-element array. */
function permutationsOf3(vals: number[]): number[][] {
  if (vals.length < 3) return [vals];
  const [a, b, c] = [vals[0]!, vals[1]!, vals[2]!];
  return [
    [a, b, c],
    [a, c, b],
    [b, a, c],
    [b, c, a],
    [c, a, b],
    [c, b, a],
  ];
}

/**
 * S8: Generate params for meta/cross rules.
 */
function generateRuleParams(
  rng: SeededRandom,
  ruleId: RuleId,
  attr: AttributeId,
): RuleBinding['params'] {
  const params: RuleBinding['params'] = {};
  if (ruleId === 'progression') {
    params.step = rng.choice([-2, -1, 1, 2]);
  } else if (ruleId === 'arithmetic') {
    params.op = rng.choice(['add', 'sub'] as const);
    if (attr === 'size') params.offset = 1;
  } else if (ruleId === 'cross_attribute') {
    // Source attribute: shape→color cross-mapping
    params.sourceAttribute = attr === 'color' ? 'shape' : 'color';
    params.offset = rng.int(1, 5); // 1-4 offset
  } else if (ruleId === 'meta_cycle') {
    // Pick 3 sub-rules that cycle across rows
    const subRules: RuleId[] = ['constant', 'progression', 'distribute_three'];
    params.ruleSequence = [rng.choice(subRules), rng.choice(subRules), rng.choice(subRules)] as [
      RuleId,
      RuleId,
      RuleId,
    ];
    // Ensure not all the same (that's just a constant)
    if (
      params.ruleSequence[0] === params.ruleSequence[1] &&
      params.ruleSequence[1] === params.ruleSequence[2]
    ) {
      params.ruleSequence[2] =
        params.ruleSequence[0] === 'progression' ? 'distribute_three' : 'progression';
    }
  }
  return params;
}

/**
 * Sample rule bindings for a component — one binding per attribute.
 *
 * @param ruleAttrs - which attributes to bind (default: shape/size/color for iraven)
 * @param allowedRulesMap - per-attr allowed non-constant rules (default: ALLOWED_RULES)
 */
function sampleRuleBindings(
  rng: SeededRandom,
  config: DifficultyConfig,
  ruleAttrs: AttributeId[] = RULE_ATTRIBUTES,
  allowedRulesMap: Record<string, RuleId[]> = ALLOWED_RULES,
): RuleBinding[] {
  const numRules = rng.int(config.minRules, config.maxRules + 1);
  const shuffled = rng.shuffle([...ruleAttrs]);
  const bindings: RuleBinding[] = [];

  for (let i = 0; i < shuffled.length; i++) {
    const attr = shuffled[i]!;
    if (i < numRules) {
      const allowedForAttr = allowedRulesMap[attr] ?? [
        'progression',
        'arithmetic',
        'distribute_three',
      ];
      const ruleId = rng.choice(allowedForAttr);
      const params = generateRuleParams(rng, ruleId, attr);
      bindings.push({ ruleId, attributeId: attr, params });
    } else {
      bindings.push({ ruleId: 'constant', attributeId: attr });
    }
  }

  return bindings;
}

/**
 * S3: Sample rule bindings with per-component profile overrides.
 * Uses forcedRules to guarantee specific rule types on specific attributes.
 */
function sampleRuleBindingsWithProfile(
  rng: SeededRandom,
  compProfile: import('./types').ComponentDifficultyProfile,
  ruleAttrs: AttributeId[],
  allowedRulesMap: Record<string, RuleId[]>,
): RuleBinding[] {
  const numRules = rng.int(compProfile.minRules, compProfile.maxRules + 1);
  const shuffled = rng.shuffle([...ruleAttrs]);
  const bindings: RuleBinding[] = [];

  for (let i = 0; i < shuffled.length; i++) {
    const attr = shuffled[i]!;
    const forced = compProfile.forcedRules?.[attr];
    if (i < numRules) {
      const ruleId =
        forced ?? rng.choice(allowedRulesMap[attr] ?? ['progression', 'distribute_three']);
      const params = generateRuleParams(rng, ruleId, attr);
      bindings.push({ ruleId, attributeId: attr, params });
    } else {
      bindings.push({ ruleId: 'constant', attributeId: attr });
    }
  }

  return bindings;
}

/**
 * Pre-generate attribute rows for a single component.
 * Returns map of attribute → 3 rows of [col0, col1, col2].
 */
function generateComponentRows(
  rng: SeededRandom,
  bindings: RuleBinding[],
): Map<AttributeId, [number, number, number][]> {
  const attrRows = new Map<AttributeId, [number, number, number][]>();

  for (const binding of bindings) {
    const rawDomain = ATTRIBUTE_DOMAINS[binding.attributeId];
    const domain =
      binding.attributeId === 'shape'
        ? { ...rawDomain, min: SHAPE_RULE_DOMAIN.min, max: SHAPE_RULE_DOMAIN.max }
        : rawDomain;
    const rule = RULES[binding.ruleId];

    if (binding.ruleId === 'distribute_three') {
      const range = domain.max - domain.min + 1;
      const pool: number[] = [];
      for (let i = domain.min; i <= domain.max; i++) pool.push(i);
      const picked = choiceN(rng, pool, Math.min(3, range));

      const allPerms = permutationsOf3(picked);
      const shuffledPerms = rng.shuffle([...allPerms]);
      const rows: [number, number, number][] = shuffledPerms.slice(0, 3) as [
        number,
        number,
        number,
      ][];
      attrRows.set(binding.attributeId, rows);
    } else {
      const row0 = rule.generateRow(domain, rng, binding.params);
      const row1 = rule.generateRow(domain, rng, binding.params);
      const row2 = rule.generateRow(domain, rng, binding.params);
      attrRows.set(binding.attributeId, [row0, row1, row2]);
    }
  }

  return attrRows;
}

interface PrecomputedComponent {
  attrRows: Map<AttributeId, [number, number, number][]>;
  unboundDefaults: Map<AttributeId, number>;
}

function precomputeComponents(
  rng: SeededRandom,
  allBindings: ComponentBinding[],
  ruleAttrs: AttributeId[] = RULE_ATTRIBUTES,
): PrecomputedComponent[] {
  return allBindings.map((comp) => {
    const attrRows = generateComponentRows(rng, comp.ruleBindings);
    const unboundDefaults = new Map<AttributeId, number>();
    const boundAttrs = new Set(comp.ruleBindings.map((b) => b.attributeId));
    for (const attrId of ruleAttrs) {
      if (!boundAttrs.has(attrId)) {
        const dMin = attrId === 'shape' ? SHAPE_RULE_DOMAIN.min : ATTRIBUTE_DOMAINS[attrId].min;
        const dMax = attrId === 'shape' ? SHAPE_RULE_DOMAIN.max : ATTRIBUTE_DOMAINS[attrId].max;
        unboundDefaults.set(attrId, rng.int(dMin, dMax + 1));
      }
    }
    return { attrRows, unboundDefaults };
  });
}

function cellValuesFromComponent(
  comp: PrecomputedComponent,
  bindings: RuleBinding[],
  row: number,
  col: number,
): Map<AttributeId, number> {
  const vals = new Map<AttributeId, number>();
  for (const binding of bindings) {
    const rows = comp.attrRows.get(binding.attributeId);
    if (rows) {
      vals.set(binding.attributeId, rows[row]![col]!);
    }
  }
  for (const [attr, val] of comp.unboundDefaults) {
    vals.set(attr, val);
  }
  return vals;
}

/**
 * Build a StructuredComponent from attribute values.
 * Supports non-uniform entities (Slice 4): when uniform=false, unbound
 * attributes are re-sampled per entity after the first.
 */
function buildStructuredComponent(
  attrValues: Map<AttributeId, number>,
  numEntities: number,
  slotPositions: number[],
  options: {
    uniform: boolean;
    rng: SeededRandom;
    boundAttrs: Set<AttributeId>;
    ruleAttrs: AttributeId[];
  },
): StructuredComponent {
  const shape = attrValues.get('shape') ?? 1;
  const size = attrValues.get('size') ?? 3;
  const color = attrValues.get('color') ?? 5;
  const angle = attrValues.get('angle') ?? 3;

  const entities: StructuredEntity[] = [];
  for (let i = 0; i < numEntities; i++) {
    if (i === 0 || options.uniform) {
      entities.push({ shape, size, color, angle });
    } else {
      // Non-uniform: re-sample unbound attributes for entities after the first
      const e: StructuredEntity = { shape, size, color, angle };
      for (const attrId of options.ruleAttrs) {
        if (!options.boundAttrs.has(attrId)) {
          const dMin = attrId === 'shape' ? SHAPE_RULE_DOMAIN.min : ATTRIBUTE_DOMAINS[attrId].min;
          const dMax = attrId === 'shape' ? SHAPE_RULE_DOMAIN.max : ATTRIBUTE_DOMAINS[attrId].max;
          (e as unknown as Record<string, number>)[attrId] = options.rng.int(dMin, dMax + 1);
        }
      }
      // Only randomize angle for non-uniform entities when angle is NOT rule-governed
      if (!options.boundAttrs.has('angle')) {
        e.angle = options.rng.int(ATTRIBUTE_DOMAINS.angle.min, ATTRIBUTE_DOMAINS.angle.max + 1);
      }
      entities.push(e);
    }
  }

  return {
    numEntities,
    positions: slotPositions,
    entities,
    uniform: options.uniform || numEntities <= 1,
  };
}

// =============================================================================
// Main Generator
// =============================================================================

/**
 * Generate a Ravens matrix.
 *
 * @param seed - Deterministic seed
 * @param difficulty - 1-10
 * @param profile - 'neurodual' (default, product mode) or 'iraven' (strict I-RAVEN baseline)
 */
export function generateMatrix(
  seed: string,
  difficulty: number,
  profile: ReferenceProfile = 'neurodual',
): RavensMatrix {
  const structured = generateStructuredMatrix(seed, difficulty, profile);
  return flattenMatrix(structured);
}

/**
 * Generate the structured internal matrix (exposed for testing and advanced use).
 */
export function generateStructuredMatrix(
  seed: string,
  difficulty: number,
  profile: ReferenceProfile = 'neurodual',
): StructuredRavensMatrix {
  const maxLevel = PROFILE_MAX_LEVELS[profile];
  const level = Math.max(1, Math.min(maxLevel, Math.round(difficulty)));
  const diffConfig = getDifficultyConfig(level, profile);
  const rng = new SeededRandom(seed);

  // Filter configs by reference profile
  let allowedConfigs = diffConfig.allowedConfigs;
  if (profile === 'iraven') {
    allowedConfigs = allowedConfigs.filter((c) => IRAVEN_CONFIGS.includes(c as ConfigId));
    if (allowedConfigs.length === 0) allowedConfigs = ['center'];
  }

  const configId = rng.choice(allowedConfigs) as ConfigId;
  const config = CONFIGURATIONS[configId];

  // S2: resolve rule attributes and allowed rules based on profile + config
  const ruleAttrs =
    profile === 'neurodual' && diffConfig.useExtendedAttrs
      ? NEURODUAL_RULE_ATTRIBUTES
      : RULE_ATTRIBUTES;
  const allowedRulesMap =
    profile === 'neurodual' && diffConfig.useExtendedAttrs
      ? NEURODUAL_ALLOWED_RULES
      : ALLOWED_RULES;

  for (let attempt = 0; attempt < 20; attempt++) {
    // S3: sample bindings per component using profiles if available
    const compProfiles = diffConfig.componentProfiles;

    const sampleForComponent = (compIdx: number) => {
      if (compProfiles && compProfiles[compIdx]) {
        return sampleRuleBindingsWithProfile(
          rng,
          compProfiles[compIdx],
          ruleAttrs,
          allowedRulesMap,
        );
      }
      return sampleRuleBindings(rng, diffConfig, ruleAttrs, allowedRulesMap);
    };

    const bindings = sampleForComponent(0);
    const pruned = pruneConstraints(bindings, configId);
    if (!pruned) continue;

    // Build component bindings
    const allBindings: ComponentBinding[] = [];
    if (config.componentCount > 1) {
      allBindings.push({ ruleBindings: bindings });
      for (let c = 1; c < config.componentCount; c++) {
        allBindings.push({ ruleBindings: sampleForComponent(c) });
      }
    } else {
      allBindings.push({ ruleBindings: bindings });
    }

    // Pre-compute all component rows
    const components = precomputeComponents(rng, allBindings, ruleAttrs);

    // Generate Number/Position results per component
    const numPosResults: (NumberPositionResult | null)[] = [];
    const numberBindings: (RuleBinding | null)[] = [];

    for (let c = 0; c < config.componentCount; c++) {
      const slots = config.slotsPerComponent[c]!;
      if (slots > 1 && config.hasPositionAttr) {
        const numberRuleId = rng.choice(NUMBER_RULES);
        const result = generateNumberPositionGrid(rng, slots, numberRuleId);
        numPosResults.push(result);
        numberBindings.push(result.numberRuleBinding);
      } else {
        numPosResults.push(null);
        numberBindings.push(null);
      }
    }

    // Determine uniformity: in iraven profile, allow non-uniform when numEntities > 1
    // In neurodual profile, also allow non-uniform (Slice 4)
    const allowNonUniform = true;

    // Build 3×3 structured grid
    const grid: StructuredCell[][] = [];

    for (let row = 0; row < 3; row++) {
      const rowCells: StructuredCell[] = [];
      for (let col = 0; col < 3; col++) {
        const cellComponents: StructuredComponent[] = [];

        for (let c = 0; c < config.componentCount; c++) {
          const comp = components[c]!;
          const compBindings = allBindings[c]!.ruleBindings;
          const vals = cellValuesFromComponent(comp, compBindings, row, col);
          const boundAttrs = new Set(compBindings.map((b) => b.attributeId));

          const npResult = numPosResults[c];
          const numEntities = npResult ? npResult.numberGrid[row]![col]! : 1;
          const positions = npResult
            ? npResult.positionGrid[row]![col]!
            : Array.from({ length: numEntities }, (_, i) => i);

          // Non-uniform only when multiple entities AND we allow it
          const uniform = !allowNonUniform || numEntities <= 1;

          cellComponents.push(
            buildStructuredComponent(vals, numEntities, positions, {
              uniform,
              rng,
              boundAttrs,
              ruleAttrs,
            }),
          );
        }

        rowCells.push({ components: cellComponents });
      }
      grid.push(rowCells);
    }

    // S5: Generate mesh overlay if enabled
    let meshBindings: RuleBinding[] | undefined;
    if (diffConfig.hasMesh) {
      // Determine how many mesh attrs are rule-governed based on level
      const meshRuleCount = Math.min(3, Math.max(0, level - 21));
      meshBindings = sampleMeshBindings(rng, meshRuleCount);
      const meshGrid = generateMeshGrid(rng, meshBindings);
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
          grid[row]![col]!.mesh = meshGrid[row]![col]!;
        }
      }
    }

    const answer = grid[2]![2]!;

    // Generate distractors
    let distractors: StructuredCell[];
    if (profile === 'iraven') {
      distractors = generateReferenceDistractors(
        rng,
        answer,
        allBindings,
        numberBindings,
        grid,
        diffConfig.optionCount - 1,
        configId,
      );
    } else {
      // Product mode: use existing ABT distractor logic via flat cells
      const flatAnswer = flattenCell(answer);
      const flatGrid = grid.map((r) => r.map(flattenCell));
      const allRuleBindings =
        config.componentCount > 1 ? allBindings.flatMap((cb) => cb.ruleBindings) : bindings;
      const flatDistractors = generateDistractors(
        rng,
        flatAnswer,
        allRuleBindings,
        flatGrid,
        diffConfig.optionCount - 1,
      );
      // Wrap flat distractors as single-component structured cells for consistency
      distractors = flatDistractors.map((fd) => ({
        components: [
          {
            numEntities: fd.entities.length,
            positions: fd.positions,
            entities: fd.entities.map((e) => ({ ...e })),
            uniform: fd.entities.length <= 1,
          },
        ],
        // S5: propagate answer mesh to distractors (mesh is the same for all options)
        mesh: answer.mesh ? { ...answer.mesh } : undefined,
      }));
    }

    return {
      configId,
      grid,
      answer,
      distractors,
      componentBindings: allBindings,
      numberBindings,
      meshBindings,
      perceptual: profile === 'neurodual' ? getPerceptualComplexity(level) : undefined,
      difficulty: level,
      seed,
      optionCount: diffConfig.optionCount,
      referenceProfile: profile,
    };
  }

  return generateFallbackStructuredMatrix(seed, level, configId, diffConfig.optionCount, profile);
}

function generateFallbackStructuredMatrix(
  seed: string,
  difficulty: number,
  configId: ConfigId,
  optionCount: number,
  profile: ReferenceProfile,
): StructuredRavensMatrix {
  const rng = new SeededRandom(`${seed}_fallback`);
  const shape = rng.int(1, 6);
  const size = rng.int(0, 6);
  const color = rng.int(0, 10);
  const angle = 3;

  const entity: StructuredEntity = { shape, size, color, angle };
  const makeComp = (): StructuredComponent => ({
    numEntities: 1,
    positions: [0],
    entities: [{ ...entity }],
    uniform: true,
  });
  const makeCell = (): StructuredCell => ({ components: [makeComp()] });

  const grid: StructuredCell[][] = Array.from({ length: 3 }, () =>
    Array.from({ length: 3 }, makeCell),
  );

  const answer = grid[2]![2]!;
  const bindings: RuleBinding[] = [{ ruleId: 'constant', attributeId: 'shape' }];

  const distractors: StructuredCell[] = [];
  const usedKeys = new Set<string>();
  usedKeys.add(`${shape}:${size}:${color}:${angle}`);
  const attrs: ('shape' | 'size' | 'color')[] = ['shape', 'size', 'color'];
  const domainSizes = { shape: 5, size: 6, color: 10 };

  for (let d = 0; distractors.length < optionCount - 1 && d < 100; d++) {
    const attr = attrs[d % attrs.length]!;
    const base = attr === 'shape' ? shape : attr === 'size' ? size : color;
    const domainMin = attr === 'shape' ? 1 : 0;
    const range = domainSizes[attr];
    const newVal = domainMin + ((base - domainMin + Math.floor(d / attrs.length) + 1) % range);
    const e = { shape, size, color, angle };
    e[attr] = newVal;
    const key = `${e.shape}:${e.size}:${e.color}:${e.angle}`;
    if (!usedKeys.has(key)) {
      usedKeys.add(key);
      distractors.push({
        components: [
          {
            numEntities: 1,
            positions: [0],
            entities: [e],
            uniform: true,
          },
        ],
      });
    }
  }

  return {
    configId,
    grid,
    answer,
    distractors,
    componentBindings: [{ ruleBindings: bindings }],
    numberBindings: [null],
    difficulty,
    seed,
    optionCount,
    referenceProfile: profile,
  };
}
