/**
 * Tests for MaxConsecutive constraint
 */

import { describe, expect, it } from 'bun:test';
import type { GeneratedTrial } from '../types';
import { createMaxConsecutiveConstraint } from './max-consecutive';

// Helper to create test trials
function t(
  index: number,
  values: Record<
    string,
    { value: number | string; intention: 'target' | 'lure-n-1' | 'lure-n+1' | 'neutral' }
  >,
): GeneratedTrial {
  const trialValues: GeneratedTrial['values'] = {};
  for (const [modalityId, v] of Object.entries(values)) {
    trialValues[modalityId] = { modalityId, value: v.value, intention: v.intention };
  }
  return { index, values: trialValues };
}

// =============================================================================
// id & type
// =============================================================================

describe('MaxConsecutive – metadata', () => {
  it('has a deterministic id encoding modalityId, intention, and max', () => {
    const c = createMaxConsecutiveConstraint({ modalityId: 'audio', intention: 'target', max: 4 });
    expect(c.id).toBe('max-consecutive:audio:target:4');
  });

  it('uses wildcard in id when modalityId is *', () => {
    const c = createMaxConsecutiveConstraint({ modalityId: '*', intention: 'neutral', max: 2 });
    expect(c.id).toBe('max-consecutive:*:neutral:2');
  });

  it('type is hard', () => {
    const c = createMaxConsecutiveConstraint({
      modalityId: 'position',
      intention: 'target',
      max: 3,
    });
    expect(c.type).toBe('hard');
  });
});

// =============================================================================
// isSatisfied – specific modality
// =============================================================================

describe('MaxConsecutive – isSatisfied (specific modality)', () => {
  const constraint = createMaxConsecutiveConstraint({
    modalityId: 'position',
    intention: 'target',
    max: 3,
  });

  it('allows first trial as target on empty history', () => {
    const candidate = t(0, { position: { value: 1, intention: 'target' } });
    expect(constraint.isSatisfied([], candidate)).toBe(true);
  });

  it('allows up to max consecutive targets', () => {
    const history = [
      t(0, { position: { value: 0, intention: 'target' } }),
      t(1, { position: { value: 1, intention: 'target' } }),
    ];
    const candidate = t(2, { position: { value: 2, intention: 'target' } });
    // 2 in history + 1 candidate = 3 = max → allowed
    expect(constraint.isSatisfied(history, candidate)).toBe(true);
  });

  it('blocks the (max+1)-th consecutive target', () => {
    const history = [
      t(0, { position: { value: 0, intention: 'target' } }),
      t(1, { position: { value: 1, intention: 'target' } }),
      t(2, { position: { value: 2, intention: 'target' } }),
    ];
    const candidate = t(3, { position: { value: 3, intention: 'target' } });
    // 3 + 1 = 4 > max → blocked
    expect(constraint.isSatisfied(history, candidate)).toBe(false);
  });

  it('always allows a candidate with a different intention', () => {
    const history = [
      t(0, { position: { value: 0, intention: 'target' } }),
      t(1, { position: { value: 1, intention: 'target' } }),
      t(2, { position: { value: 2, intention: 'target' } }),
    ];
    const candidate = t(3, { position: { value: 3, intention: 'neutral' } });
    expect(constraint.isSatisfied(history, candidate)).toBe(true);
  });

  it('resets the count after a non-matching intention break', () => {
    const history = [
      t(0, { position: { value: 0, intention: 'target' } }),
      t(1, { position: { value: 1, intention: 'target' } }),
      t(2, { position: { value: 2, intention: 'neutral' } }), // break
    ];
    const candidate = t(3, { position: { value: 3, intention: 'target' } });
    // Only 0 consecutive targets at end + 1 candidate = 1 ≤ 3 → allowed
    expect(constraint.isSatisfied(history, candidate)).toBe(true);
  });

  it('ignores other modalities in history', () => {
    const history = [
      t(0, {
        position: { value: 0, intention: 'target' },
        audio: { value: 'A', intention: 'neutral' },
      }),
      t(1, {
        position: { value: 1, intention: 'target' },
        audio: { value: 'B', intention: 'target' },
      }),
      t(2, {
        position: { value: 2, intention: 'target' },
        audio: { value: 'C', intention: 'target' },
      }),
    ];
    // position has 3 consecutive targets → next target blocked
    const candidate = t(3, { position: { value: 3, intention: 'target' } });
    expect(constraint.isSatisfied(history, candidate)).toBe(false);
  });

  it('does not count when candidate modality is absent', () => {
    const history = [
      t(0, { position: { value: 0, intention: 'target' } }),
      t(1, { position: { value: 1, intention: 'target' } }),
      t(2, { position: { value: 2, intention: 'target' } }),
    ];
    // candidate has no position modality
    const candidate = t(3, { audio: { value: 'X', intention: 'target' } });
    expect(constraint.isSatisfied(history, candidate)).toBe(true);
  });

  it('works with max=1 (no consecutive allowed)', () => {
    const c = createMaxConsecutiveConstraint({
      modalityId: 'position',
      intention: 'target',
      max: 1,
    });
    const history = [t(0, { position: { value: 0, intention: 'target' } })];
    const candidate = t(1, { position: { value: 1, intention: 'target' } });
    expect(c.isSatisfied(history, candidate)).toBe(false);
  });

  it('works with lure-n-1 intention', () => {
    const c = createMaxConsecutiveConstraint({
      modalityId: 'position',
      intention: 'lure-n-1',
      max: 2,
    });
    const history = [
      t(0, { position: { value: 0, intention: 'lure-n-1' } }),
      t(1, { position: { value: 1, intention: 'lure-n-1' } }),
    ];
    const candidate = t(2, { position: { value: 2, intention: 'lure-n-1' } });
    expect(c.isSatisfied(history, candidate)).toBe(false);
  });
});

// =============================================================================
// isSatisfied – wildcard modality (*)
// =============================================================================

describe('MaxConsecutive – isSatisfied (wildcard *)', () => {
  const constraint = createMaxConsecutiveConstraint({
    modalityId: '*',
    intention: 'target',
    max: 2,
  });

  it('counts any trial where at least one modality has the intention', () => {
    const history = [
      t(0, {
        position: { value: 0, intention: 'target' },
        audio: { value: 'A', intention: 'neutral' },
      }),
      t(1, {
        position: { value: 1, intention: 'neutral' },
        audio: { value: 'B', intention: 'target' },
      }),
    ];
    // Both trials have at least one target → count=2
    const candidate = t(2, { position: { value: 2, intention: 'target' } });
    // 2+1=3 > 2 → blocked
    expect(constraint.isSatisfied(history, candidate)).toBe(false);
  });

  it('allows a fully-neutral candidate even after max consecutive', () => {
    const history = [
      t(0, { position: { value: 0, intention: 'target' } }),
      t(1, { position: { value: 1, intention: 'target' } }),
    ];
    const candidate = t(2, { position: { value: 2, intention: 'neutral' } });
    expect(constraint.isSatisfied(history, candidate)).toBe(true);
  });

  it('stops counting at the first trial without the intention', () => {
    const history = [
      t(0, { position: { value: 0, intention: 'target' } }),
      t(1, { position: { value: 1, intention: 'neutral' } }), // break
      t(2, { position: { value: 2, intention: 'target' } }),
    ];
    // Only the last trial is consecutive → count=1
    const candidate = t(3, { position: { value: 3, intention: 'target' } });
    // 1+1=2 = max → allowed
    expect(constraint.isSatisfied(history, candidate)).toBe(true);
  });
});

// =============================================================================
// getForbiddenIntentions
// =============================================================================

describe('MaxConsecutive – getForbiddenIntentions', () => {
  it('returns the intention when max is reached', () => {
    const c = createMaxConsecutiveConstraint({
      modalityId: 'position',
      intention: 'target',
      max: 2,
    });
    const history = [
      t(0, { position: { value: 0, intention: 'target' } }),
      t(1, { position: { value: 1, intention: 'target' } }),
    ];
    const forbidden = c.getForbiddenIntentions(history, 'position');
    expect(forbidden.has('target')).toBe(true);
    expect(forbidden.size).toBe(1);
  });

  it('returns empty set when count is below max', () => {
    const c = createMaxConsecutiveConstraint({
      modalityId: 'position',
      intention: 'target',
      max: 3,
    });
    const history = [t(0, { position: { value: 0, intention: 'target' } })];
    const forbidden = c.getForbiddenIntentions(history, 'position');
    expect(forbidden.size).toBe(0);
  });

  it('returns empty set for unrelated modality', () => {
    const c = createMaxConsecutiveConstraint({
      modalityId: 'position',
      intention: 'target',
      max: 1,
    });
    const history = [t(0, { position: { value: 0, intention: 'target' } })];
    const forbidden = c.getForbiddenIntentions(history, 'audio');
    expect(forbidden.size).toBe(0);
  });

  it('returns intention for any modality when wildcard and max reached', () => {
    const c = createMaxConsecutiveConstraint({ modalityId: '*', intention: 'target', max: 1 });
    const history = [t(0, { position: { value: 0, intention: 'target' } })];
    const forbidden = c.getForbiddenIntentions(history, 'audio');
    expect(forbidden.has('target')).toBe(true);
  });

  it('returns empty set on empty history', () => {
    const c = createMaxConsecutiveConstraint({
      modalityId: 'position',
      intention: 'target',
      max: 1,
    });
    expect(c.getForbiddenIntentions([], 'position').size).toBe(0);
  });
});

// =============================================================================
// getForbiddenValues
// =============================================================================

describe('MaxConsecutive – getForbiddenValues', () => {
  it('always returns empty set (this constraint does not forbid specific values)', () => {
    const c = createMaxConsecutiveConstraint({
      modalityId: 'position',
      intention: 'target',
      max: 1,
    });
    const history = [t(0, { position: { value: 5, intention: 'target' } })];
    expect(c.getForbiddenValues(history, 'position', 'target').size).toBe(0);
  });
});
