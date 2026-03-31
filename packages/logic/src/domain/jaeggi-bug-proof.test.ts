/**
 * Test verifying the Jaeggi protocol is correctly implemented per Jaeggi 2008
 *
 * Jaeggi 2008 paper says "fewer than three" mistakes per modality to advance.
 * This means: errors < 3 (strict) = advance. Exactly 3 errors = maintain.
 */
import { describe, it, expect } from 'bun:test';
import { evaluateJaeggiProgression, type SessionStats } from './n-level-evaluator';
import { JAEGGI_MAX_ERRORS_PER_MODALITY } from '../specs/thresholds';

describe('Jaeggi Protocol - Correct Implementation (Jaeggi 2008)', () => {
  /**
   * According to Jaeggi 2008 paper:
   * "fewer than three" mistakes per modality to advance.
   *
   * This means: errors < 3 should advance, errors = 3 should maintain.
   */

  it('3 errors maintains per Jaeggi 2008: "fewer than three"', () => {
    const stats: SessionStats = {
      byModality: new Map([
        ['position', { hits: 17, misses: 2, falseAlarms: 1, correctRejections: 10 }], // 3 errors
        ['audio', { hits: 18, misses: 1, falseAlarms: 1, correctRejections: 10 }], // 2 errors
      ]),
      currentNLevel: 2,
    };

    const result = evaluateJaeggiProgression(stats);

    // Jaeggi 2008: "fewer than three" = < 3 = 3 errors maintains
    expect(result.delta).toBe(0);
  });

  it('4 errors does NOT advance', () => {
    const stats: SessionStats = {
      byModality: new Map([
        ['position', { hits: 16, misses: 3, falseAlarms: 1, correctRejections: 10 }], // 4 errors
        ['audio', { hits: 18, misses: 1, falseAlarms: 1, correctRejections: 10 }], // 2 errors
      ]),
      currentNLevel: 2,
    };

    const result = evaluateJaeggiProgression(stats);

    // 4 errors >= 3, so should maintain (not advance)
    expect(result.delta).toBe(0);
  });

  it('2 errors in both modalities advances', () => {
    const stats: SessionStats = {
      byModality: new Map([
        ['position', { hits: 18, misses: 1, falseAlarms: 1, correctRejections: 10 }], // 2 errors
        ['audio', { hits: 18, misses: 1, falseAlarms: 1, correctRejections: 10 }], // 2 errors
      ]),
      currentNLevel: 2,
    };

    const result = evaluateJaeggiProgression(stats);
    expect(result.delta).toBe(1);
  });

  it('threshold constant is 3', () => {
    expect(JAEGGI_MAX_ERRORS_PER_MODALITY).toBe(3);
  });
});
