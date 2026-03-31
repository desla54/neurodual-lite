import type { RuleEngine, RuleId, RuleBinding, AttributeId, ConfigId } from './types';
import { ATTRIBUTE_DOMAINS } from './attributes';

// =============================================================================
// Constant Rule
// =============================================================================

const constantRule: RuleEngine = {
  generateRow(domain, rng) {
    const v = rng.int(domain.min, domain.max + 1);
    return [v, v, v];
  },

  validate(values) {
    return values[0] === values[1] && values[1] === values[2];
  },

  deriveThird(a, _b) {
    return a;
  },

  enumerateValid(_domain, a, _b) {
    return [a];
  },
};

// =============================================================================
// Progression Rule
// =============================================================================

const progressionRule: RuleEngine = {
  generateRow(domain, rng, params) {
    const steps = [-2, -1, 1, 2];
    const step = params?.step ?? rng.choice(steps);
    // We need v, v+step, v+2*step all within [min, max]
    const lo = domain.min;
    const hi = domain.max;
    // v must satisfy: lo <= v <= hi, lo <= v+step <= hi, lo <= v+2*step <= hi
    const vMin = Math.max(lo, lo - Math.min(0, 2 * step));
    const vMax = Math.min(hi, hi - Math.max(0, 2 * step));
    if (vMin > vMax) {
      // fallback: use step=1
      const fMin = lo;
      const fMax = hi - 2;
      if (fMin > fMax) return [lo, lo, lo]; // degenerate
      const v = rng.int(fMin, fMax + 1);
      return [v, v + 1, v + 2];
    }
    const v = rng.int(vMin, vMax + 1);
    return [v, v + step, v + 2 * step];
  },

  validate(values) {
    return values[2] - values[1] === values[1] - values[0];
  },

  deriveThird(a, b) {
    return 2 * b - a;
  },

  enumerateValid(domain, a, b) {
    const c = 2 * b - a;
    if (c >= domain.min && c <= domain.max) return [c];
    return [];
  },
};

// =============================================================================
// Arithmetic Rule
// =============================================================================

const arithmeticRule: RuleEngine = {
  generateRow(domain, rng, params) {
    const op = params?.op ?? (rng.next() < 0.5 ? 'add' : 'sub');
    // I-RAVEN offset: Size uses c = a + b + 1 (add) / c = a - b - 1 (sub)
    const off = params?.offset ?? 0;
    if (op === 'add') {
      // c = a + b + offset, all in [min, max]
      for (let attempt = 0; attempt < 20; attempt++) {
        const a = rng.int(domain.min, domain.max + 1);
        const bMax = domain.max - a - off;
        if (bMax < domain.min) continue;
        const b = rng.int(domain.min, Math.min(domain.max, bMax) + 1);
        const c = a + b + off;
        if (c >= domain.min && c <= domain.max) return [a, b, c];
      }
      const a = domain.min;
      const b = domain.min;
      const c = Math.min(domain.max, a + b + off);
      return [a, b, c];
    }
    // sub: c = a - b - offset, all in [min, max]
    for (let attempt = 0; attempt < 20; attempt++) {
      const a = rng.int(domain.min, domain.max + 1);
      const bMax = a - domain.min - off;
      if (bMax < domain.min) continue;
      const b = rng.int(domain.min, Math.min(domain.max, bMax) + 1);
      const c = a - b - off;
      if (c >= domain.min && c <= domain.max) return [a, b, c];
    }
    const a = domain.max;
    const b = domain.min;
    const c = Math.max(domain.min, a - b - off);
    return [a, b, Math.min(domain.max, c)];
  },

  validate(values, params) {
    const op = params?.op ?? 'add';
    const off = params?.offset ?? 0;
    if (op === 'add') return values[2] === values[0] + values[1] + off;
    return values[2] === values[0] - values[1] - off;
  },

  deriveThird(a, b, params) {
    const op = params?.op ?? 'add';
    const off = params?.offset ?? 0;
    return op === 'add' ? a + b + off : a - b - off;
  },

  enumerateValid(domain, a, b, params) {
    const op = params?.op ?? 'add';
    const off = params?.offset ?? 0;
    const c = op === 'add' ? a + b + off : a - b - off;
    if (c >= domain.min && c <= domain.max) return [c];
    return [];
  },
};

// =============================================================================
// Distribute Three Rule
// =============================================================================

const distributeThreeRule: RuleEngine = {
  generateRow(domain, rng) {
    // Pick 3 distinct values from the domain
    const range = domain.max - domain.min + 1;
    if (range < 3) {
      // Not enough values — fallback
      return [
        domain.min,
        Math.min(domain.min + 1, domain.max),
        Math.min(domain.min + 2, domain.max),
      ];
    }
    const pool: number[] = [];
    for (let i = domain.min; i <= domain.max; i++) pool.push(i);
    // Pick 3 distinct
    const picked: number[] = [];
    for (let i = 0; i < 3; i++) {
      const idx = rng.int(0, pool.length);
      picked.push(pool[idx]!);
      pool.splice(idx, 1);
    }
    // Shuffle them as a permutation for this row
    return rng.shuffle(picked) as [number, number, number];
  },

  validate(values) {
    // All 3 must be distinct
    return values[0] !== values[1] && values[1] !== values[2] && values[0] !== values[2];
  },

  deriveThird(a, b) {
    // Return the smallest non-negative value different from a and b.
    // For proper derivation with a known value set, use deriveThirdFromSet().
    for (let v = 0; v <= 20; v++) {
      if (v !== a && v !== b) return v;
    }
    return -1;
  },

  enumerateValid(domain, a, b) {
    // Without the value set, return all values different from a and b
    const result: number[] = [];
    for (let v = domain.min; v <= domain.max; v++) {
      if (v !== a && v !== b) result.push(v);
    }
    return result;
  },
};

// =============================================================================
// XOR Rule (S4)
// =============================================================================

/**
 * XOR: if col0 === col1 → col2 = 0 (none/cancel). If one is 0, col2 = the other.
 * If both different and non-zero → col2 = 0.
 *
 * Pattern: tracks parity — same values cancel, different values produce the non-zero one.
 * ~40% adult accuracy (Sandia Matrices).
 */
const xorRule: RuleEngine = {
  generateRow(domain, rng) {
    // Three valid patterns: (a, a, 0), (a, 0, a), (0, a, a), (a, b, 0) where a≠b≠0
    const patterns = ['cancel', 'left_zero', 'right_zero', 'both_diff'] as const;
    const pattern = rng.choice([...patterns]);
    const nonZero = () => {
      const lo = Math.max(domain.min + 1, 1); // avoid 0
      return lo > domain.max ? domain.min : rng.int(lo, domain.max + 1);
    };

    switch (pattern) {
      case 'cancel': {
        const a = nonZero();
        return [a, a, domain.min]; // same → cancel to min (0)
      }
      case 'left_zero': {
        const a = nonZero();
        return [domain.min, a, a]; // 0 XOR a = a
      }
      case 'right_zero': {
        const a = nonZero();
        return [a, domain.min, a]; // a XOR 0 = a
      }
      case 'both_diff': {
        const a = nonZero();
        let b = nonZero();
        let attempts = 0;
        while (b === a && attempts < 20) {
          b = nonZero();
          attempts++;
        }
        return [a, b, domain.min]; // different non-zero → cancel
      }
    }
  },

  validate(values) {
    return values[2] === this.deriveThird(values[0], values[1]);
  },

  deriveThird(a, b) {
    if (a === b) return 0; // same → cancel
    if (a === 0) return b;
    if (b === 0) return a;
    return 0; // both different non-zero → cancel
  },

  enumerateValid(domain, a, b) {
    const c = this.deriveThird(a, b);
    if (c >= domain.min && c <= domain.max) return [c];
    return [];
  },
};

// =============================================================================
// AND Rule (S4)
// =============================================================================

/**
 * AND (intersection): col2 = col0 if col0 === col1, else 0.
 * Both must "agree" for the value to pass through.
 */
const andRule: RuleEngine = {
  generateRow(domain, rng) {
    const coin = rng.next();
    if (coin < 0.5) {
      // Agree: a, a, a
      const a = rng.int(domain.min, domain.max + 1);
      return [a, a, a];
    }
    // Disagree: a, b, 0
    const a = rng.int(domain.min, domain.max + 1);
    let b = rng.int(domain.min, domain.max + 1);
    let attempts = 0;
    while (b === a && attempts < 20) {
      b = rng.int(domain.min, domain.max + 1);
      attempts++;
    }
    return [a, b, domain.min];
  },

  validate(values) {
    return values[2] === this.deriveThird(values[0], values[1]);
  },

  deriveThird(a, b) {
    return a === b ? a : 0;
  },

  enumerateValid(domain, a, b) {
    const c = this.deriveThird(a, b);
    if (c >= domain.min && c <= domain.max) return [c];
    return [];
  },
};

// =============================================================================
// OR Rule (S4)
// =============================================================================

/**
 * OR (union): col2 = col0 if col0 ≠ 0, else col1.
 * At least one non-zero value passes through (left-priority).
 */
const orRule: RuleEngine = {
  generateRow(domain, rng) {
    const a = rng.int(domain.min, domain.max + 1);
    const b = rng.int(domain.min, domain.max + 1);
    const c = a !== 0 ? a : b;
    return [a, b, c];
  },

  validate(values) {
    return values[2] === this.deriveThird(values[0], values[1]);
  },

  deriveThird(a, b) {
    return a !== 0 ? a : b;
  },

  enumerateValid(domain, a, b) {
    const c = this.deriveThird(a, b);
    if (c >= domain.min && c <= domain.max) return [c];
    return [];
  },
};

// =============================================================================
// Cross-Attribute Rule (S8)
// =============================================================================

/**
 * Cross-attribute: col2 value is derived from ANOTHER attribute's value in the same cell.
 * Mapping: targetValue = (sourceValue + offset) % domainSize.
 *
 * Requires `context.sourceValues` to be provided during generation/validation.
 * This creates inter-attribute dependencies — the ultimate difficulty lever.
 */
const crossAttributeRule: RuleEngine = {
  generateRow(domain, rng, params, context) {
    const offset = params?.offset ?? 1;
    const domainSize = domain.max - domain.min + 1;
    if (context?.sourceValues) {
      const [s0, s1, s2] = context.sourceValues;
      return [
        domain.min + ((s0 + offset) % domainSize),
        domain.min + ((s1 + offset) % domainSize),
        domain.min + ((s2 + offset) % domainSize),
      ];
    }
    // Fallback without source: generate progression-like
    const v = rng.int(domain.min, domain.max + 1);
    return [
      v,
      domain.min + ((v + offset) % domainSize),
      domain.min + ((v + 2 * offset) % domainSize),
    ];
  },

  validate(values, params, context) {
    if (!context?.sourceValues) return false;
    return values[2] === this.deriveThird(values[0], values[1], params, context);
  },

  deriveThird(_a, _b, params, context) {
    if (!context?.sourceValues) return 0;
    const offset = params?.offset ?? 1;
    // Derive from the source attribute's col2 value
    return (context.sourceValues[2] + offset) % 10;
  },

  enumerateValid(domain, _a, _b, params, context) {
    const c = this.deriveThird(_a, _b, params, context);
    if (c >= domain.min && c <= domain.max) return [c];
    return [];
  },
};

// =============================================================================
// Meta-Cycle Rule (S8)
// =============================================================================

/**
 * Meta-cycle: the rule TYPE changes per row.
 * params.ruleSequence = [ruleForRow0, ruleForRow1, ruleForRow2]
 *
 * Row 0 uses ruleSequence[0], row 1 uses ruleSequence[1], row 2 uses ruleSequence[2].
 * The player must deduce which sub-rule applies to each row AND what the pattern is.
 */
const metaCycleRule: RuleEngine = {
  generateRow(domain, rng, params, context) {
    const rowIndex = context?.rowIndex ?? 0;
    const sequence =
      params?.ruleSequence ??
      (['constant', 'progression', 'arithmetic'] as [RuleId, RuleId, RuleId]);
    const subRuleId = sequence[rowIndex] ?? 'constant';
    const subRule = RULES_WITHOUT_META[subRuleId] ?? constantRule;
    return subRule.generateRow(domain, rng, params);
  },

  validate(values, params, context) {
    const rowIndex = context?.rowIndex ?? 0;
    const sequence =
      params?.ruleSequence ??
      (['constant', 'progression', 'arithmetic'] as [RuleId, RuleId, RuleId]);
    const subRuleId = sequence[rowIndex] ?? 'constant';
    const subRule = RULES_WITHOUT_META[subRuleId] ?? constantRule;
    return subRule.validate(values, params);
  },

  deriveThird(a, b, params, context) {
    const rowIndex = context?.rowIndex ?? 2; // default to row 2 (the answer row)
    const sequence =
      params?.ruleSequence ??
      (['constant', 'progression', 'arithmetic'] as [RuleId, RuleId, RuleId]);
    const subRuleId = sequence[rowIndex] ?? 'constant';
    const subRule = RULES_WITHOUT_META[subRuleId] ?? constantRule;
    return subRule.deriveThird(a, b, params);
  },

  enumerateValid(domain, a, b, params, context) {
    const rowIndex = context?.rowIndex ?? 2;
    const sequence =
      params?.ruleSequence ??
      (['constant', 'progression', 'arithmetic'] as [RuleId, RuleId, RuleId]);
    const subRuleId = sequence[rowIndex] ?? 'constant';
    const subRule = RULES_WITHOUT_META[subRuleId] ?? constantRule;
    return subRule.enumerateValid(domain, a, b, params);
  },
};

// Base rules without meta-rules (to avoid circular references)
const RULES_WITHOUT_META: Record<string, RuleEngine> = {
  constant: constantRule,
  progression: progressionRule,
  arithmetic: arithmeticRule,
  distribute_three: distributeThreeRule,
  xor: xorRule,
  and: andRule,
  or: orRule,
};

// =============================================================================
// Rule Registry
// =============================================================================

export const RULES: Record<RuleId, RuleEngine> = {
  constant: constantRule,
  progression: progressionRule,
  arithmetic: arithmeticRule,
  distribute_three: distributeThreeRule,
  xor: xorRule,
  and: andRule,
  or: orRule,
  cross_attribute: crossAttributeRule,
  meta_cycle: metaCycleRule,
};

/**
 * For distribute_three: derive the missing value from a known set.
 */
export function deriveThirdFromSet(a: number, b: number, valueSet: number[]): number {
  for (const v of valueSet) {
    if (v !== a && v !== b) return v;
  }
  return -1;
}

/**
 * For distribute_three: enumerate valid completions given the value set.
 */
export function enumerateValidFromSet(a: number, b: number, valueSet: number[]): number[] {
  return valueSet.filter((v) => v !== a && v !== b);
}

// =============================================================================
// Constraint Pruning
// =============================================================================

export interface PrunedConstraints {
  /** Per-attribute min/max after applying rule constraints */
  bounds: Record<AttributeId, { min: number; max: number }>;
}

/**
 * Prune attribute domains based on rule bindings to ensure all rules are satisfiable.
 * Returns null if constraints are unsatisfiable.
 */
export function pruneConstraints(
  ruleBindings: RuleBinding[],
  _configId: ConfigId,
): PrunedConstraints | null {
  const bounds: Record<string, { min: number; max: number }> = {};

  // Initialize from attribute domains
  for (const [attrId, domain] of Object.entries(ATTRIBUTE_DOMAINS)) {
    bounds[attrId] = { min: domain.min, max: domain.max };
  }

  // Apply rule-specific constraints
  for (const binding of ruleBindings) {
    const attr = bounds[binding.attributeId];
    if (!attr) continue;

    switch (binding.ruleId) {
      case 'progression': {
        // Need at least 3 values for a progression with step >= 1
        const step = binding.params?.step ?? 1;
        const absStep = Math.abs(step);
        // v + 2*step must be in range
        if (step > 0) {
          attr.max = Math.min(attr.max, ATTRIBUTE_DOMAINS[binding.attributeId].max);
          // Ensure range has room for progression
          if (attr.max - attr.min < 2 * absStep) return null;
        } else {
          if (attr.max - attr.min < 2 * absStep) return null;
        }
        break;
      }
      case 'arithmetic': {
        // For add: c = a + b, need c <= max → a + b <= max
        // For sub: c = a - b, need c >= min → a - b >= min
        // Minimum domain size is 2 for arithmetic
        if (attr.max - attr.min < 1) return null;
        break;
      }
      case 'distribute_three': {
        // Need at least 3 distinct values
        if (attr.max - attr.min < 2) return null;
        break;
      }
      case 'xor':
      case 'and':
      case 'or': {
        // Need at least 2 distinct values (one must be 0/min for cancel semantics)
        if (attr.max - attr.min < 1) return null;
        break;
      }
      case 'cross_attribute':
      case 'meta_cycle': {
        // Need at least 2 distinct values
        if (attr.max - attr.min < 1) return null;
        break;
      }
      // constant: no additional constraints
    }
  }

  return { bounds: bounds as Record<AttributeId, { min: number; max: number }> };
}
