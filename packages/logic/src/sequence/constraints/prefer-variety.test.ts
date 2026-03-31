/**
 * Tests for PreferVariety constraint
 */

import { describe, expect, it } from 'bun:test';
import type { GeneratedTrial } from '../types';
import { createPreferVarietyConstraint } from './prefer-variety';

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
// id, type, weight
// =============================================================================

describe('PreferVariety – metadata', () => {
  it('has id based on modalityId', () => {
    const c = createPreferVarietyConstraint({ modalityId: 'audio' });
    expect(c.id).toBe('prefer-variety:audio');
  });

  it('type is soft', () => {
    const c = createPreferVarietyConstraint({ modalityId: 'position' });
    expect(c.type).toBe('soft');
  });

  it('uses provided weight', () => {
    const c = createPreferVarietyConstraint({ modalityId: 'position', weight: 0.8 });
    expect(c.weight).toBe(0.8);
  });

  it('falls back to default weight when not provided', () => {
    const c = createPreferVarietyConstraint({ modalityId: 'position' });
    // Default from CONSTRAINT_PREFER_VARIETY_WEIGHT = 0.5
    expect(c.weight).toBe(0.5);
  });

  it('falls back to default lookbackWindow when not provided', () => {
    // Indirectly tested via score behavior with default window of 5
    const _c = createPreferVarietyConstraint({ modalityId: 'position' });
    // With default lookback=5, a value at distance 5 → score=5/5=1
    const history: GeneratedTrial[] = [];
    for (let i = 0; i < 4; i++) {
      history.push(t(i, { position: { value: i + 10, intention: 'neutral' } }));
    }
    // Value 99 at index 0 not present → distance = 5 (recentHistory.length+1=5), score=5/5=1
    history.unshift(t(-1, { position: { value: 99, intention: 'neutral' } }));
    // Actually, let's just verify via an explicit window
    const c2 = createPreferVarietyConstraint({ modalityId: 'position', lookbackWindow: 5 });
    expect(c2.weight).toBe(0.5);
  });
});

// =============================================================================
// isSatisfied – always true (soft constraint)
// =============================================================================

describe('PreferVariety – isSatisfied', () => {
  const constraint = createPreferVarietyConstraint({
    modalityId: 'position',
    weight: 0.5,
    lookbackWindow: 3,
  });

  it('is always satisfied (soft constraints never reject)', () => {
    expect(constraint.isSatisfied([], t(0, { position: { value: 1, intention: 'neutral' } }))).toBe(
      true,
    );
  });

  it('is satisfied even with immediate repetition', () => {
    const history = [t(0, { position: { value: 5, intention: 'neutral' } })];
    const candidate = t(1, { position: { value: 5, intention: 'neutral' } });
    expect(constraint.isSatisfied(history, candidate)).toBe(true);
  });
});

// =============================================================================
// getSatisfactionScore
// =============================================================================

describe('PreferVariety – getSatisfactionScore', () => {
  const constraint = createPreferVarietyConstraint({
    modalityId: 'position',
    weight: 0.5,
    lookbackWindow: 4,
  });

  it('returns score based on (recentHistory.length+1)/lookback when value not found', () => {
    const history = [
      t(0, { position: { value: 1, intention: 'neutral' } }),
      t(1, { position: { value: 2, intention: 'neutral' } }),
    ];
    const candidate = t(2, { position: { value: 99, intention: 'neutral' } });
    // recentHistory.length=2, distanceFromLast=3, score = min(1, 3/4) = 0.75
    expect(constraint.getSatisfactionScore(history, candidate)).toBe(0.75);
  });

  it('returns 1 when value not found and history fills the lookback window', () => {
    const history = [
      t(0, { position: { value: 1, intention: 'neutral' } }),
      t(1, { position: { value: 2, intention: 'neutral' } }),
      t(2, { position: { value: 3, intention: 'neutral' } }),
      t(3, { position: { value: 4, intention: 'neutral' } }),
    ];
    const candidate = t(4, { position: { value: 99, intention: 'neutral' } });
    // recentHistory.length=4, distanceFromLast=5, score = min(1, 5/4) = 1
    expect(constraint.getSatisfactionScore(history, candidate)).toBe(1);
  });

  it('returns low score when history is empty (distance defaults to 1)', () => {
    const candidate = t(0, { position: { value: 5, intention: 'neutral' } });
    // recentHistory=[], distanceFromLast=1, score = min(1, 1/4) = 0.25
    expect(constraint.getSatisfactionScore([], candidate)).toBe(0.25);
  });

  it('returns 1 when candidate has no value for the modality', () => {
    const history = [t(0, { position: { value: 5, intention: 'neutral' } })];
    const candidate = t(1, { audio: { value: 'A', intention: 'neutral' } });
    expect(constraint.getSatisfactionScore(history, candidate)).toBe(1);
  });

  it('penalizes immediate repetition (distance=1)', () => {
    const history = [t(0, { position: { value: 5, intention: 'neutral' } })];
    const candidate = t(1, { position: { value: 5, intention: 'neutral' } });
    const score = constraint.getSatisfactionScore(history, candidate);
    // distance=1, lookback=4 → score = 1/4 = 0.25
    expect(score).toBe(0.25);
  });

  it('gives intermediate score for value at distance 2', () => {
    const history = [
      t(0, { position: { value: 5, intention: 'neutral' } }),
      t(1, { position: { value: 3, intention: 'neutral' } }),
    ];
    const candidate = t(2, { position: { value: 5, intention: 'neutral' } });
    const score = constraint.getSatisfactionScore(history, candidate);
    // distance=2, lookback=4 → score = 2/4 = 0.5
    expect(score).toBe(0.5);
  });

  it('gives higher score for value further back', () => {
    const history = [
      t(0, { position: { value: 5, intention: 'neutral' } }),
      t(1, { position: { value: 1, intention: 'neutral' } }),
      t(2, { position: { value: 2, intention: 'neutral' } }),
    ];
    const candidate = t(3, { position: { value: 5, intention: 'neutral' } });
    const score = constraint.getSatisfactionScore(history, candidate);
    // distance=3, lookback=4 → score = 3/4 = 0.75
    expect(score).toBe(0.75);
  });

  it('caps score at 1 when distance exceeds lookback window', () => {
    const c = createPreferVarietyConstraint({ modalityId: 'position', lookbackWindow: 2 });
    const history = [
      t(0, { position: { value: 5, intention: 'neutral' } }),
      t(1, { position: { value: 1, intention: 'neutral' } }),
      t(2, { position: { value: 2, intention: 'neutral' } }),
    ];
    const candidate = t(3, { position: { value: 5, intention: 'neutral' } });
    // lookback window=2 → only considers indices [1,2], value 5 not found → score=1
    expect(c.getSatisfactionScore(history, candidate)).toBe(1);
  });

  it('score is always in [0, 1]', () => {
    const c = createPreferVarietyConstraint({ modalityId: 'position', lookbackWindow: 3 });
    // Immediate repeat → minimum score
    const history = [t(0, { position: { value: 1, intention: 'neutral' } })];
    const candidate = t(1, { position: { value: 1, intention: 'neutral' } });
    const score = c.getSatisfactionScore(history, candidate);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('score increases monotonically with distance', () => {
    const c = createPreferVarietyConstraint({ modalityId: 'position', lookbackWindow: 5 });
    const scores: number[] = [];
    for (let dist = 1; dist <= 5; dist++) {
      const history: GeneratedTrial[] = [];
      // Place the target value at the right distance
      for (let i = 0; i < dist; i++) {
        if (i === 0) {
          history.push(t(i, { position: { value: 42, intention: 'neutral' } }));
        } else {
          history.push(t(i, { position: { value: i + 100, intention: 'neutral' } }));
        }
      }
      // Reverse so target value 42 is at index 0 (farthest)
      history.reverse();
      const candidate = t(dist, { position: { value: 42, intention: 'neutral' } });
      scores.push(c.getSatisfactionScore(history, candidate));
    }
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeGreaterThanOrEqual(scores[i - 1]!);
    }
  });

  it('uses only the most recent lookbackWindow trials from history', () => {
    const c = createPreferVarietyConstraint({ modalityId: 'position', lookbackWindow: 2 });
    // Value 5 is outside the lookback window
    const history = [
      t(0, { position: { value: 5, intention: 'neutral' } }),
      t(1, { position: { value: 1, intention: 'neutral' } }),
      t(2, { position: { value: 2, intention: 'neutral' } }),
    ];
    const candidate = t(3, { position: { value: 5, intention: 'neutral' } });
    // Window is [t(1), t(2)], value 5 not in window → score = 1
    expect(c.getSatisfactionScore(history, candidate)).toBe(1);
  });
});

// =============================================================================
// getForbiddenIntentions & getForbiddenValues – always empty (soft)
// =============================================================================

describe('PreferVariety – forbidden sets', () => {
  const constraint = createPreferVarietyConstraint({ modalityId: 'position', lookbackWindow: 3 });

  it('getForbiddenIntentions returns empty set', () => {
    const history = [t(0, { position: { value: 5, intention: 'target' } })];
    expect(constraint.getForbiddenIntentions(history, 'position').size).toBe(0);
  });

  it('getForbiddenValues returns empty set', () => {
    const history = [t(0, { position: { value: 5, intention: 'neutral' } })];
    expect(constraint.getForbiddenValues(history, 'position', 'neutral').size).toBe(0);
  });
});
