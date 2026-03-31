/**
 * Tests for NoImmediateRepeat constraint
 */

import { describe, expect, it } from 'bun:test';
import type { GeneratedTrial } from '../types';
import { createNoImmediateRepeatConstraint } from './no-immediate-repeat';

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

describe('NoImmediateRepeat – metadata', () => {
  it('has id based on modalityId', () => {
    const c = createNoImmediateRepeatConstraint({ modalityId: 'audio' });
    expect(c.id).toBe('no-immediate-repeat:audio');
  });

  it('type is hard', () => {
    const c = createNoImmediateRepeatConstraint({ modalityId: 'position' });
    expect(c.type).toBe('hard');
  });
});

// =============================================================================
// isSatisfied
// =============================================================================

describe('NoImmediateRepeat – isSatisfied', () => {
  const constraint = createNoImmediateRepeatConstraint({ modalityId: 'position' });

  it('allows any candidate on empty history', () => {
    const candidate = t(0, { position: { value: 5, intention: 'neutral' } });
    expect(constraint.isSatisfied([], candidate)).toBe(true);
  });

  it('allows a different value after the last trial', () => {
    const history = [t(0, { position: { value: 5, intention: 'neutral' } })];
    const candidate = t(1, { position: { value: 3, intention: 'neutral' } });
    expect(constraint.isSatisfied(history, candidate)).toBe(true);
  });

  it('blocks the same value immediately repeated', () => {
    const history = [t(0, { position: { value: 5, intention: 'neutral' } })];
    const candidate = t(1, { position: { value: 5, intention: 'neutral' } });
    expect(constraint.isSatisfied(history, candidate)).toBe(false);
  });

  it('blocks same value regardless of intention', () => {
    const history = [t(0, { position: { value: 5, intention: 'target' } })];
    const candidate = t(1, { position: { value: 5, intention: 'neutral' } });
    expect(constraint.isSatisfied(history, candidate)).toBe(false);
  });

  it('only checks the very last trial, not older history', () => {
    const history = [
      t(0, { position: { value: 5, intention: 'neutral' } }),
      t(1, { position: { value: 3, intention: 'neutral' } }),
    ];
    // Value 5 appeared at index 0 but last trial has value 3
    const candidate = t(2, { position: { value: 5, intention: 'neutral' } });
    expect(constraint.isSatisfied(history, candidate)).toBe(true);
  });

  it('allows when last trial has no value for the modality', () => {
    const history = [t(0, { audio: { value: 'A', intention: 'neutral' } })];
    const candidate = t(1, { position: { value: 5, intention: 'neutral' } });
    // lastValue is undefined → satisfied
    expect(constraint.isSatisfied(history, candidate)).toBe(true);
  });

  it('allows when candidate has no value for the modality', () => {
    const history = [t(0, { position: { value: 5, intention: 'neutral' } })];
    const candidate = t(1, { audio: { value: 'A', intention: 'neutral' } });
    // candidateValue is undefined → satisfied
    expect(constraint.isSatisfied(history, candidate)).toBe(true);
  });

  it('allows when both last and candidate lack the modality', () => {
    const history = [t(0, { audio: { value: 'A', intention: 'neutral' } })];
    const candidate = t(1, { audio: { value: 'B', intention: 'neutral' } });
    // Both undefined → satisfied
    expect(constraint.isSatisfied(history, candidate)).toBe(true);
  });

  it('works with string values', () => {
    const c = createNoImmediateRepeatConstraint({ modalityId: 'audio' });
    const history = [t(0, { audio: { value: 'C', intention: 'neutral' } })];
    expect(c.isSatisfied(history, t(1, { audio: { value: 'C', intention: 'neutral' } }))).toBe(
      false,
    );
    expect(c.isSatisfied(history, t(1, { audio: { value: 'D', intention: 'neutral' } }))).toBe(
      true,
    );
  });

  it('only checks the configured modality, not others', () => {
    const c = createNoImmediateRepeatConstraint({ modalityId: 'position' });
    const history = [
      t(0, {
        position: { value: 5, intention: 'neutral' },
        audio: { value: 'A', intention: 'neutral' },
      }),
    ];
    // Same audio value, different position value → satisfied
    const candidate = t(1, {
      position: { value: 3, intention: 'neutral' },
      audio: { value: 'A', intention: 'neutral' },
    });
    expect(c.isSatisfied(history, candidate)).toBe(true);
  });
});

// =============================================================================
// getForbiddenIntentions
// =============================================================================

describe('NoImmediateRepeat – getForbiddenIntentions', () => {
  const constraint = createNoImmediateRepeatConstraint({ modalityId: 'position' });

  it('always returns empty set (this constraint does not forbid intentions)', () => {
    const history = [t(0, { position: { value: 5, intention: 'target' } })];
    expect(constraint.getForbiddenIntentions(history, 'position').size).toBe(0);
  });

  it('returns empty set on empty history', () => {
    expect(constraint.getForbiddenIntentions([], 'position').size).toBe(0);
  });
});

// =============================================================================
// getForbiddenValues
// =============================================================================

describe('NoImmediateRepeat – getForbiddenValues', () => {
  const constraint = createNoImmediateRepeatConstraint({ modalityId: 'position' });

  it('returns the last value for the matching modality', () => {
    const history = [t(0, { position: { value: 7, intention: 'neutral' } })];
    const forbidden = constraint.getForbiddenValues(history, 'position', 'neutral');
    expect(forbidden.has(7)).toBe(true);
    expect(forbidden.size).toBe(1);
  });

  it('returns empty set for a different modality', () => {
    const history = [t(0, { position: { value: 7, intention: 'neutral' } })];
    const forbidden = constraint.getForbiddenValues(history, 'audio', 'neutral');
    expect(forbidden.size).toBe(0);
  });

  it('returns empty set on empty history', () => {
    expect(constraint.getForbiddenValues([], 'position', 'neutral').size).toBe(0);
  });

  it('returns empty set when last trial has no value for the modality', () => {
    const history = [t(0, { audio: { value: 'A', intention: 'neutral' } })];
    const forbidden = constraint.getForbiddenValues(history, 'position', 'neutral');
    expect(forbidden.size).toBe(0);
  });

  it('returns the value regardless of intention parameter', () => {
    const history = [t(0, { position: { value: 3, intention: 'target' } })];
    // Asking for forbidden values for 'neutral' intention — constraint still returns the last value
    const forbidden = constraint.getForbiddenValues(history, 'position', 'neutral');
    expect(forbidden.has(3)).toBe(true);
  });

  it('works with string values', () => {
    const c = createNoImmediateRepeatConstraint({ modalityId: 'audio' });
    const history = [t(0, { audio: { value: 'Z', intention: 'neutral' } })];
    const forbidden = c.getForbiddenValues(history, 'audio', 'neutral');
    expect(forbidden.has('Z')).toBe(true);
    expect(forbidden.size).toBe(1);
  });

  it('only returns the value from the very last trial', () => {
    const history = [
      t(0, { position: { value: 1, intention: 'neutral' } }),
      t(1, { position: { value: 2, intention: 'neutral' } }),
      t(2, { position: { value: 3, intention: 'neutral' } }),
    ];
    const forbidden = constraint.getForbiddenValues(history, 'position', 'neutral');
    expect(forbidden.has(3)).toBe(true);
    expect(forbidden.has(1)).toBe(false);
    expect(forbidden.has(2)).toBe(false);
    expect(forbidden.size).toBe(1);
  });
});
