/**
 * Tests for constraint factory
 */

import { describe, expect, it } from 'bun:test';
import {
  createDefaultConstraints,
  createDefaultSoftConstraints,
  instantiateConstraints,
  instantiateWeightedConstraints,
} from './factory';

// =============================================================================
// createDefaultConstraints
// =============================================================================

describe('createDefaultConstraints', () => {
  it('returns MaxConsecutive constraints only for nLevel=1 (no NoImmediateRepeat)', () => {
    const constraints = createDefaultConstraints(['position', 'audio'], 1);
    // Should have 2 MaxConsecutive (one per modality), no NoImmediateRepeat
    expect(constraints).toHaveLength(2);
    for (const c of constraints) {
      expect(c.type).toBe('hard');
      expect(c.id).toContain('max-consecutive');
    }
  });

  it('includes NoImmediateRepeat for nLevel=2', () => {
    const constraints = createDefaultConstraints(['position', 'audio'], 2);
    // 2 NoImmediateRepeat + 2 MaxConsecutive = 4
    expect(constraints).toHaveLength(4);
    const ids = constraints.map((c) => c.id);
    expect(ids.filter((id) => id.startsWith('no-immediate-repeat'))).toHaveLength(2);
    expect(ids.filter((id) => id.startsWith('max-consecutive'))).toHaveLength(2);
  });

  it('includes NoImmediateRepeat for nLevel=3', () => {
    const constraints = createDefaultConstraints(['position'], 3);
    // 1 NoImmediateRepeat + 1 MaxConsecutive = 2
    expect(constraints).toHaveLength(2);
    expect(constraints[0]!.id).toContain('no-immediate-repeat');
    expect(constraints[1]!.id).toContain('max-consecutive');
  });

  it('creates one constraint per modality for single modality at nLevel=1', () => {
    const constraints = createDefaultConstraints(['position'], 1);
    expect(constraints).toHaveLength(1);
    expect(constraints[0]!.id).toContain('max-consecutive');
  });

  it('handles empty modalities array', () => {
    const constraints = createDefaultConstraints([], 2);
    expect(constraints).toHaveLength(0);
  });

  it('handles three modalities', () => {
    const constraints = createDefaultConstraints(['position', 'audio', 'color'], 2);
    // 3 NoImmediateRepeat + 3 MaxConsecutive = 6
    expect(constraints).toHaveLength(6);
  });

  it('NoImmediateRepeat constraints reference correct modalities', () => {
    const constraints = createDefaultConstraints(['position', 'audio'], 2);
    const noRepeatIds = constraints
      .filter((c) => c.id.startsWith('no-immediate-repeat'))
      .map((c) => c.id);
    expect(noRepeatIds).toContain('no-immediate-repeat:position');
    expect(noRepeatIds).toContain('no-immediate-repeat:audio');
  });

  it('MaxConsecutive constraints reference correct modalities', () => {
    const constraints = createDefaultConstraints(['position', 'audio'], 1);
    const maxConsIds = constraints
      .filter((c) => c.id.startsWith('max-consecutive'))
      .map((c) => c.id);
    expect(maxConsIds).toContain('max-consecutive:audio:target:3');
    expect(maxConsIds).toContain('max-consecutive:position:target:3');
  });

  it('returns functional constraint objects', () => {
    const constraints = createDefaultConstraints(['position'], 2);
    for (const c of constraints) {
      expect(typeof c.isSatisfied).toBe('function');
      expect(typeof c.getForbiddenValues).toBe('function');
      expect(typeof c.getForbiddenIntentions).toBe('function');
    }
  });

  it('all constraints have type=hard', () => {
    const constraints = createDefaultConstraints(['position', 'audio'], 2);
    for (const c of constraints) {
      expect(c.type).toBe('hard');
    }
  });
});

// =============================================================================
// createDefaultSoftConstraints
// =============================================================================

describe('createDefaultSoftConstraints', () => {
  it('returns empty array for nLevel=1', () => {
    const soft = createDefaultSoftConstraints(['position', 'audio'], 1);
    expect(soft).toHaveLength(0);
  });

  it('returns empty array for nLevel=0', () => {
    const soft = createDefaultSoftConstraints(['position'], 0);
    expect(soft).toHaveLength(0);
  });

  it('returns empty array for negative nLevel', () => {
    const soft = createDefaultSoftConstraints(['position'], -1);
    expect(soft).toHaveLength(0);
  });

  it('returns PreferVariety constraints for nLevel=2', () => {
    const soft = createDefaultSoftConstraints(['position', 'audio'], 2);
    expect(soft).toHaveLength(2);
    for (const c of soft) {
      expect(c.type).toBe('soft');
      expect(c.id).toContain('prefer-variety');
      expect(typeof c.weight).toBe('number');
      expect(c.weight).toBeGreaterThan(0);
      expect(c.weight).toBeLessThanOrEqual(1);
    }
  });

  it('returns one constraint per modality for nLevel=3', () => {
    const soft = createDefaultSoftConstraints(['position', 'audio', 'color'], 3);
    expect(soft).toHaveLength(3);
  });

  it('handles empty modalities array', () => {
    const soft = createDefaultSoftConstraints([], 2);
    expect(soft).toHaveLength(0);
  });

  it('PreferVariety constraints reference correct modalities', () => {
    const soft = createDefaultSoftConstraints(['position', 'audio'], 2);
    const ids = soft.map((c) => c.id);
    expect(ids).toContain('prefer-variety:position');
    expect(ids).toContain('prefer-variety:audio');
  });

  it('returns functional weighted constraint objects with getSatisfactionScore', () => {
    const soft = createDefaultSoftConstraints(['position'], 2);
    expect(soft).toHaveLength(1);
    expect(typeof soft[0]!.getSatisfactionScore).toBe('function');
    expect(typeof soft[0]!.isSatisfied).toBe('function');
  });
});

// =============================================================================
// instantiateConstraints
// =============================================================================

describe('instantiateConstraints', () => {
  it('instantiates no-immediate-repeat constraint', () => {
    const specs = [{ type: 'no-immediate-repeat', params: { modalityId: 'position' } }] as const;
    const constraints = instantiateConstraints(specs);
    expect(constraints).toHaveLength(1);
    expect(constraints[0]!.id).toBe('no-immediate-repeat:position');
    expect(constraints[0]!.type).toBe('hard');
  });

  it('instantiates max-consecutive constraint', () => {
    const specs = [
      { type: 'max-consecutive', params: { modalityId: 'audio', intention: 'target', max: 3 } },
    ] as const;
    const constraints = instantiateConstraints(specs);
    expect(constraints).toHaveLength(1);
    expect(constraints[0]!.id).toContain('max-consecutive');
    expect(constraints[0]!.type).toBe('hard');
  });

  it('instantiates min-gap constraint', () => {
    const specs = [
      { type: 'min-gap', params: { modalityId: 'position', intention: 'target', minTrials: 2 } },
    ] as const;
    const constraints = instantiateConstraints(specs);
    expect(constraints).toHaveLength(1);
    expect(constraints[0]!.id).toContain('min-gap');
    expect(constraints[0]!.type).toBe('hard');
  });

  it('instantiates multiple constraints from mixed specs', () => {
    const specs = [
      { type: 'no-immediate-repeat', params: { modalityId: 'position' } },
      { type: 'max-consecutive', params: { modalityId: 'audio', intention: 'target', max: 3 } },
      { type: 'min-gap', params: { modalityId: 'position', intention: 'target', minTrials: 2 } },
    ] as const;
    const constraints = instantiateConstraints(specs);
    expect(constraints).toHaveLength(3);
    expect(constraints[0]!.id).toContain('no-immediate-repeat');
    expect(constraints[1]!.id).toContain('max-consecutive');
    expect(constraints[2]!.id).toContain('min-gap');
  });

  it('silently ignores unknown constraint types', () => {
    const specs = [
      { type: 'unknown-type', params: {} },
      { type: 'no-immediate-repeat', params: { modalityId: 'position' } },
    ];
    const constraints = instantiateConstraints(specs);
    expect(constraints).toHaveLength(1);
    expect(constraints[0]!.id).toContain('no-immediate-repeat');
  });

  it('ignores all specs when all types are unknown', () => {
    const specs = [
      { type: 'foo', params: {} },
      { type: 'bar', params: {} },
    ];
    const constraints = instantiateConstraints(specs);
    expect(constraints).toHaveLength(0);
  });

  it('returns empty array for empty specs', () => {
    const constraints = instantiateConstraints([]);
    expect(constraints).toHaveLength(0);
  });

  it('returns functional constraint objects', () => {
    const specs = [{ type: 'no-immediate-repeat', params: { modalityId: 'position' } }] as const;
    const constraints = instantiateConstraints(specs);
    expect(typeof constraints[0]!.isSatisfied).toBe('function');
    expect(typeof constraints[0]!.getForbiddenValues).toBe('function');
    expect(typeof constraints[0]!.getForbiddenIntentions).toBe('function');
  });
});

// =============================================================================
// instantiateWeightedConstraints
// =============================================================================

describe('instantiateWeightedConstraints', () => {
  it('instantiates prefer-variety constraint with weight', () => {
    const specs = [
      { type: 'prefer-variety', params: { modalityId: 'position' }, weight: 0.5 },
    ] as const;
    const constraints = instantiateWeightedConstraints(specs);
    expect(constraints).toHaveLength(1);
    expect(constraints[0]!.id).toBe('prefer-variety:position');
    expect(constraints[0]!.type).toBe('soft');
    expect(constraints[0]!.weight).toBe(0.5);
  });

  it('handles multiple modalities', () => {
    const specs = [
      { type: 'prefer-variety', params: { modalityId: 'position' }, weight: 0.3 },
      { type: 'prefer-variety', params: { modalityId: 'audio' }, weight: 0.7 },
    ] as const;
    const constraints = instantiateWeightedConstraints(specs);
    expect(constraints).toHaveLength(2);
    expect(constraints[0]!.weight).toBe(0.3);
    expect(constraints[1]!.weight).toBe(0.7);
    expect(constraints[0]!.id).toBe('prefer-variety:position');
    expect(constraints[1]!.id).toBe('prefer-variety:audio');
  });

  it('silently ignores unknown soft constraint types', () => {
    const specs = [
      { type: 'unknown-soft', params: { modalityId: 'position' }, weight: 0.5 },
      { type: 'prefer-variety', params: { modalityId: 'audio' }, weight: 0.4 },
    ];
    const constraints = instantiateWeightedConstraints(specs);
    expect(constraints).toHaveLength(1);
    expect(constraints[0]!.id).toBe('prefer-variety:audio');
  });

  it('skips prefer-variety when modalityId is missing', () => {
    const specs = [{ type: 'prefer-variety', params: {}, weight: 0.5 }];
    const constraints = instantiateWeightedConstraints(specs);
    expect(constraints).toHaveLength(0);
  });

  it('skips prefer-variety when modalityId is not a string', () => {
    const specs = [{ type: 'prefer-variety', params: { modalityId: 123 }, weight: 0.5 }];
    const constraints = instantiateWeightedConstraints(specs);
    expect(constraints).toHaveLength(0);
  });

  it('skips prefer-variety when modalityId is empty string', () => {
    const specs = [{ type: 'prefer-variety', params: { modalityId: '' }, weight: 0.5 }];
    const constraints = instantiateWeightedConstraints(specs);
    expect(constraints).toHaveLength(0);
  });

  it('returns empty array for empty specs', () => {
    const constraints = instantiateWeightedConstraints([]);
    expect(constraints).toHaveLength(0);
  });

  it('returns functional weighted constraint objects', () => {
    const specs = [
      { type: 'prefer-variety', params: { modalityId: 'position' }, weight: 0.5 },
    ] as const;
    const constraints = instantiateWeightedConstraints(specs);
    expect(typeof constraints[0]!.getSatisfactionScore).toBe('function');
    expect(typeof constraints[0]!.isSatisfied).toBe('function');
    expect(typeof constraints[0]!.weight).toBe('number');
  });
});
