/**
 * Tests for MinGap constraint
 */

import { describe, expect, it } from 'bun:test';
import type { GeneratedTrial } from '../types';
import { createMinGapConstraint } from './min-gap';

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

describe('MinGap – metadata', () => {
  it('has a deterministic id encoding modalityId, intention, and minTrials', () => {
    const c = createMinGapConstraint({ modalityId: 'audio', intention: 'lure-n-1', minTrials: 5 });
    expect(c.id).toBe('min-gap:audio:lure-n-1:5');
  });

  it('type is hard', () => {
    const c = createMinGapConstraint({ modalityId: 'position', intention: 'target', minTrials: 2 });
    expect(c.type).toBe('hard');
  });
});

// =============================================================================
// isSatisfied
// =============================================================================

describe('MinGap – isSatisfied', () => {
  const constraint = createMinGapConstraint({
    modalityId: 'position',
    intention: 'target',
    minTrials: 2,
  });

  it('allows the very first occurrence on empty history', () => {
    const candidate = t(0, { position: { value: 1, intention: 'target' } });
    expect(constraint.isSatisfied([], candidate)).toBe(true);
  });

  it('allows when there has never been a previous occurrence', () => {
    const history = [
      t(0, { position: { value: 0, intention: 'neutral' } }),
      t(1, { position: { value: 1, intention: 'neutral' } }),
    ];
    const candidate = t(2, { position: { value: 2, intention: 'target' } });
    expect(constraint.isSatisfied(history, candidate)).toBe(true);
  });

  it('blocks when gap is exactly 1 (immediately after)', () => {
    const history = [t(0, { position: { value: 0, intention: 'target' } })];
    const candidate = t(1, { position: { value: 1, intention: 'target' } });
    // gap = 1 - 0 = 1, need > 2 → blocked
    expect(constraint.isSatisfied(history, candidate)).toBe(false);
  });

  it('blocks when gap equals minTrials (needs strictly greater)', () => {
    const history = [
      t(0, { position: { value: 0, intention: 'target' } }),
      t(1, { position: { value: 1, intention: 'neutral' } }),
    ];
    const candidate = t(2, { position: { value: 2, intention: 'target' } });
    // gap = 2 - 0 = 2, need > 2 → blocked (gap not strictly greater)
    expect(constraint.isSatisfied(history, candidate)).toBe(false);
  });

  it('allows when gap exceeds minTrials', () => {
    const history = [
      t(0, { position: { value: 0, intention: 'target' } }),
      t(1, { position: { value: 1, intention: 'neutral' } }),
      t(2, { position: { value: 2, intention: 'neutral' } }),
    ];
    const candidate = t(3, { position: { value: 3, intention: 'target' } });
    // gap = 3 - 0 = 3 > 2 → allowed
    expect(constraint.isSatisfied(history, candidate)).toBe(true);
  });

  it('always allows a candidate with a different intention', () => {
    const history = [t(0, { position: { value: 0, intention: 'target' } })];
    const candidate = t(1, { position: { value: 1, intention: 'neutral' } });
    expect(constraint.isSatisfied(history, candidate)).toBe(true);
  });

  it('always allows when candidate has no matching modality', () => {
    const history = [t(0, { position: { value: 0, intention: 'target' } })];
    const candidate = t(1, { audio: { value: 'A', intention: 'target' } });
    expect(constraint.isSatisfied(history, candidate)).toBe(true);
  });

  it('uses the last occurrence, not the first', () => {
    const history = [
      t(0, { position: { value: 0, intention: 'target' } }),
      t(1, { position: { value: 1, intention: 'neutral' } }),
      t(2, { position: { value: 2, intention: 'neutral' } }),
      t(3, { position: { value: 3, intention: 'neutral' } }),
      t(4, { position: { value: 4, intention: 'target' } }), // last occurrence at index 4
    ];
    const candidate = t(5, { position: { value: 5, intention: 'target' } });
    // gap = 5 - 4 = 1, need > 2 → blocked
    expect(constraint.isSatisfied(history, candidate)).toBe(false);
  });

  it('works with minTrials=1', () => {
    const c = createMinGapConstraint({ modalityId: 'position', intention: 'target', minTrials: 1 });
    const history = [t(0, { position: { value: 0, intention: 'target' } })];
    // gap = 1, need > 1 → blocked
    expect(c.isSatisfied(history, t(1, { position: { value: 1, intention: 'target' } }))).toBe(
      false,
    );

    const history2 = [
      t(0, { position: { value: 0, intention: 'target' } }),
      t(1, { position: { value: 1, intention: 'neutral' } }),
    ];
    // gap = 2, need > 1 → allowed
    expect(c.isSatisfied(history2, t(2, { position: { value: 2, intention: 'target' } }))).toBe(
      true,
    );
  });

  it('works with large minTrials', () => {
    const c = createMinGapConstraint({ modalityId: 'position', intention: 'target', minTrials: 5 });
    const history: GeneratedTrial[] = [];
    history.push(t(0, { position: { value: 0, intention: 'target' } }));
    for (let i = 1; i <= 4; i++) {
      history.push(t(i, { position: { value: i, intention: 'neutral' } }));
    }
    // gap = 5 - 0 = 5, need > 5 → blocked
    expect(c.isSatisfied(history, t(5, { position: { value: 5, intention: 'target' } }))).toBe(
      false,
    );

    history.push(t(5, { position: { value: 5, intention: 'neutral' } }));
    // gap = 6 - 0 = 6 > 5 → allowed
    expect(c.isSatisfied(history, t(6, { position: { value: 6, intention: 'target' } }))).toBe(
      true,
    );
  });
});

// =============================================================================
// getForbiddenIntentions
// =============================================================================

describe('MinGap – getForbiddenIntentions', () => {
  const constraint = createMinGapConstraint({
    modalityId: 'position',
    intention: 'target',
    minTrials: 2,
  });

  it('forbids the intention when gap is insufficient', () => {
    const history = [t(0, { position: { value: 0, intention: 'target' } })];
    const forbidden = constraint.getForbiddenIntentions(history, 'position');
    expect(forbidden.has('target')).toBe(true);
    expect(forbidden.size).toBe(1);
  });

  it('returns empty set for a different modality', () => {
    const history = [t(0, { position: { value: 0, intention: 'target' } })];
    const forbidden = constraint.getForbiddenIntentions(history, 'audio');
    expect(forbidden.size).toBe(0);
  });

  it('returns empty set when gap exceeds minTrials', () => {
    const history = [
      t(0, { position: { value: 0, intention: 'target' } }),
      t(1, { position: { value: 1, intention: 'neutral' } }),
      t(2, { position: { value: 2, intention: 'neutral' } }),
    ];
    const forbidden = constraint.getForbiddenIntentions(history, 'position');
    expect(forbidden.size).toBe(0);
  });

  it('returns empty set when intention never appeared', () => {
    const history = [t(0, { position: { value: 0, intention: 'neutral' } })];
    const forbidden = constraint.getForbiddenIntentions(history, 'position');
    expect(forbidden.size).toBe(0);
  });

  it('returns empty set on empty history', () => {
    expect(constraint.getForbiddenIntentions([], 'position').size).toBe(0);
  });
});

// =============================================================================
// getForbiddenValues
// =============================================================================

describe('MinGap – getForbiddenValues', () => {
  it('always returns empty set (this constraint does not forbid specific values)', () => {
    const c = createMinGapConstraint({ modalityId: 'position', intention: 'target', minTrials: 2 });
    const history = [t(0, { position: { value: 5, intention: 'target' } })];
    expect(c.getForbiddenValues(history, 'position', 'target').size).toBe(0);
  });
});
