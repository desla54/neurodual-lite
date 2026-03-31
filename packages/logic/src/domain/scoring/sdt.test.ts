/**
 * Tests for sdt.ts (SDT Scoring Utilities)
 */

import { describe, expect, it } from 'bun:test';
import { evaluateProgression } from './sdt';

describe('evaluateProgression', () => {
  it('returns STAY for less than 3 sessions', () => {
    expect(evaluateProgression([])).toBe('STAY');
    expect(evaluateProgression([1.5])).toBe('STAY');
    expect(evaluateProgression([1.5, 1.6])).toBe('STAY');
  });

  it('returns UP when average >= 1.5', () => {
    expect(evaluateProgression([1.5, 1.5, 1.5])).toBe('UP');
    expect(evaluateProgression([1.4, 1.5, 1.6])).toBe('UP');
    expect(evaluateProgression([2.0, 2.0, 2.0])).toBe('UP');
  });

  it('returns DOWN when average < 0.8', () => {
    expect(evaluateProgression([0.5, 0.5, 0.5])).toBe('DOWN');
    expect(evaluateProgression([0.7, 0.7, 0.7])).toBe('DOWN');
    expect(evaluateProgression([0.5, 0.6, 0.7])).toBe('DOWN');
  });

  it('returns STAY when average is between 0.8 and 1.5', () => {
    expect(evaluateProgression([1.0, 1.0, 1.0])).toBe('STAY');
    expect(evaluateProgression([1.2, 1.3, 1.1])).toBe('STAY');
    expect(evaluateProgression([0.8, 0.9, 1.0])).toBe('STAY');
  });

  it('only considers last 3 dPrimes', () => {
    // Old bad scores followed by good recent scores
    expect(evaluateProgression([0.5, 0.5, 0.5, 1.5, 1.6, 1.7])).toBe('UP');
    // Old good scores followed by bad recent scores
    expect(evaluateProgression([2.0, 2.0, 2.0, 0.5, 0.5, 0.5])).toBe('DOWN');
  });

  it('handles boundary values', () => {
    // Exactly 0.8 average - should be STAY (not DOWN)
    expect(evaluateProgression([0.8, 0.8, 0.8])).toBe('STAY');
    // Just below 0.8
    expect(evaluateProgression([0.79, 0.79, 0.79])).toBe('DOWN');
  });
});
