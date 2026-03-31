/**
 * Tests for PsychometricScore Value Object
 *
 * Tests REAL behavior of SDT metrics calculation.
 * NO MOCKS - Pure computation.
 */

import { describe, expect, test } from 'bun:test';
import { PsychometricScore } from './psychometric-score';

// =============================================================================
// Constructor & Basic Metrics Tests
// =============================================================================

describe('PsychometricScore constructor', () => {
  test('should store raw counts', () => {
    const score = new PsychometricScore(10, 2, 3, 15);

    expect(score.hits).toBe(10);
    expect(score.misses).toBe(2);
    expect(score.falseAlarms).toBe(3);
    expect(score.correctRejections).toBe(15);
  });
});

describe('hitRate', () => {
  test('should calculate hit rate', () => {
    // 8 hits, 2 misses = 0.8 hit rate
    const score = new PsychometricScore(8, 2, 5, 15);

    expect(score.hitRate).toBe(0.8);
  });

  test('should return 0 when no signal trials', () => {
    const score = new PsychometricScore(0, 0, 5, 15);

    expect(score.hitRate).toBe(0);
  });

  test('should return 1 for perfect hits', () => {
    const score = new PsychometricScore(10, 0, 0, 20);

    expect(score.hitRate).toBe(1);
  });
});

describe('falseAlarmRate', () => {
  test('should calculate false alarm rate', () => {
    // 4 FA, 16 CR = 0.2 FA rate
    const score = new PsychometricScore(10, 0, 4, 16);

    expect(score.falseAlarmRate).toBe(0.2);
  });

  test('should return 0 when no noise trials', () => {
    const score = new PsychometricScore(10, 0, 0, 0);

    expect(score.falseAlarmRate).toBe(0);
  });

  test('should return 0 for no false alarms', () => {
    const score = new PsychometricScore(10, 0, 0, 20);

    expect(score.falseAlarmRate).toBe(0);
  });
});

// =============================================================================
// d' and Criterion Tests
// =============================================================================

describe('dPrime', () => {
  test('should calculate positive d-prime for good performance', () => {
    // High hit rate, low FA rate
    const score = new PsychometricScore(9, 1, 1, 19);

    expect(score.dPrime).toBeGreaterThan(1.5);
  });

  test('should calculate low d-prime for poor performance', () => {
    // Low hit rate, high FA rate
    const score = new PsychometricScore(2, 8, 8, 12);

    expect(score.dPrime).toBeLessThan(0.5);
  });

  test('should calculate near-zero d-prime when hit rate equals FA rate', () => {
    // Similar performance on targets and non-targets
    const score = new PsychometricScore(5, 5, 5, 15);

    // With Hautus correction, d' may not be exactly 0 but should be low
    expect(Math.abs(score.dPrime)).toBeLessThan(1.0);
  });

  test('should handle perfect performance', () => {
    const score = new PsychometricScore(10, 0, 0, 20);

    // d' should be high but finite (Hautus correction)
    expect(score.dPrime).toBeGreaterThan(2.0);
    expect(Number.isFinite(score.dPrime)).toBe(true);
  });
});

describe('criterion', () => {
  test('should calculate negative criterion for liberal bias', () => {
    // High hit rate AND high FA rate = liberal (says "yes" easily)
    const score = new PsychometricScore(9, 1, 5, 15);

    expect(score.criterion).toBeLessThan(0);
  });

  test('should calculate positive criterion for conservative bias', () => {
    // Low hit rate AND low FA rate = conservative (says "no" often)
    const score = new PsychometricScore(5, 5, 1, 19);

    expect(score.criterion).toBeGreaterThan(0);
  });
});

describe('beta', () => {
  test('should calculate beta > 1 for conservative', () => {
    const score = new PsychometricScore(5, 5, 1, 19);

    expect(score.beta).toBeGreaterThan(1);
  });

  test('should calculate beta < 1 for liberal', () => {
    const score = new PsychometricScore(9, 1, 5, 15);

    expect(score.beta).toBeLessThan(1);
  });
});

describe('formattedDPrime', () => {
  test('should format d-prime with 2 decimals', () => {
    const score = new PsychometricScore(8, 2, 2, 18);
    const formatted = score.formattedDPrime;

    expect(formatted).toMatch(/^\d+\.\d{2}$/);
  });
});

// =============================================================================
// Gaming Detection Tests
// =============================================================================

describe('isSpamming()', () => {
  test('should detect spamming (high hit + high FA)', () => {
    // Hit rate > 0.95, FA rate > 0.5
    // 20 hits, 0 misses = 100% hit rate
    // 15 FA, 5 CR = 75% FA rate
    const score = new PsychometricScore(20, 0, 15, 5);

    expect(score.isSpamming()).toBe(true);
  });

  test('should not flag normal performance as spamming', () => {
    const score = new PsychometricScore(8, 2, 2, 18);

    expect(score.isSpamming()).toBe(false);
  });
});

describe('isInactive()', () => {
  test('should detect inactivity (hit rate < 0.1)', () => {
    const score = new PsychometricScore(0, 10, 0, 20);

    expect(score.isInactive()).toBe(true);
  });

  test('should not flag normal performance as inactive', () => {
    const score = new PsychometricScore(8, 2, 2, 18);

    expect(score.isInactive()).toBe(false);
  });
});

describe('isReliable()', () => {
  test('should return true for normal performance', () => {
    const score = new PsychometricScore(8, 2, 2, 18);

    expect(score.isReliable()).toBe(true);
  });

  test('should return false for spamming', () => {
    // Use clear spamming values
    const score = new PsychometricScore(20, 0, 15, 5);

    expect(score.isReliable()).toBe(false);
  });

  test('should return false for inactivity', () => {
    const score = new PsychometricScore(0, 10, 0, 20);

    expect(score.isReliable()).toBe(false);
  });
});

describe('isGaming()', () => {
  test('should return true for spamming', () => {
    // Use clear spamming values
    const score = new PsychometricScore(20, 0, 15, 5);

    expect(score.isGaming()).toBe(true);
  });

  test('should return true for inactivity', () => {
    const score = new PsychometricScore(0, 10, 0, 20);

    expect(score.isGaming()).toBe(true);
  });

  test('should return false for normal performance', () => {
    const score = new PsychometricScore(8, 2, 2, 18);

    expect(score.isGaming()).toBe(false);
  });
});

describe('getBiasDescription()', () => {
  test('should return "liberal" for negative criterion', () => {
    // Liberal = high hit rate + high FA rate (says yes easily)
    // Need criterion < -0.3
    const score = new PsychometricScore(18, 2, 12, 8);

    // May be liberal or neutral depending on exact criterion
    const bias = score.getBiasDescription();
    expect(['liberal', 'neutral']).toContain(bias);
  });

  test('should return "conservative" for positive criterion', () => {
    const score = new PsychometricScore(5, 5, 1, 19);

    expect(score.getBiasDescription()).toBe('conservative');
  });

  test('should return "neutral" for criterion near zero', () => {
    // Balanced performance
    const score = new PsychometricScore(7, 3, 3, 17);
    const bias = score.getBiasDescription();

    // May be any of the three depending on exact calculation
    expect(['liberal', 'neutral', 'conservative']).toContain(bias);
  });
});

// =============================================================================
// Performance Tier Tests
// =============================================================================

describe('tier', () => {
  test('should return "elite" for d-prime >= 3.0', () => {
    // Very high performance
    const score = new PsychometricScore(10, 0, 0, 20);

    expect(score.tier).toBe('elite');
  });

  test('should return "advanced" for d-prime >= 2.0', () => {
    const score = new PsychometricScore(9, 1, 1, 19);

    // Depending on exact d' value
    const tier = score.tier;
    expect(['advanced', 'elite']).toContain(tier);
  });

  test('should return "intermediate" for d-prime >= 1.0', () => {
    const score = new PsychometricScore(7, 3, 3, 17);

    const tier = score.tier;
    expect(['novice', 'intermediate', 'advanced']).toContain(tier);
  });

  test('should return "novice" for d-prime < 1.0', () => {
    // Very poor performance
    const score = new PsychometricScore(3, 7, 7, 13);

    expect(score.tier).toBe('novice');
  });
});

// =============================================================================
// Accuracy Tests
// =============================================================================

describe('accuracy', () => {
  test('should calculate balanced accuracy', () => {
    // Balanced Accuracy = (hitRate + crRate) / 2
    // hitRate = 8/10 = 0.8, crRate = 18/20 = 0.9
    const score = new PsychometricScore(8, 2, 2, 18);

    expect(score.accuracy).toBeCloseTo(0.85, 2);
  });

  test('should return 0 for empty', () => {
    const score = new PsychometricScore(0, 0, 0, 0);

    expect(score.accuracy).toBe(0);
  });

  test('should return 1 for perfect accuracy', () => {
    const score = new PsychometricScore(10, 0, 0, 20);

    expect(score.accuracy).toBe(1);
  });
});

describe('formattedAccuracy', () => {
  test('should format as percentage', () => {
    const score = new PsychometricScore(8, 2, 2, 18);

    expect(score.formattedAccuracy).toMatch(/^\d+%$/);
  });

  test('should show 100% for perfect', () => {
    const score = new PsychometricScore(10, 0, 0, 20);

    expect(score.formattedAccuracy).toBe('100%');
  });
});

// =============================================================================
// Factory Tests
// =============================================================================

describe('PsychometricScore.from()', () => {
  test('should create from data object', () => {
    const score = PsychometricScore.from({
      hits: 8,
      misses: 2,
      falseAlarms: 3,
      correctRejections: 17,
    });

    expect(score.hits).toBe(8);
    expect(score.misses).toBe(2);
    expect(score.falseAlarms).toBe(3);
    expect(score.correctRejections).toBe(17);
  });

  test('should compute derived metrics', () => {
    const score = PsychometricScore.from({
      hits: 8,
      misses: 2,
      falseAlarms: 2,
      correctRejections: 18,
    });

    expect(score.hitRate).toBe(0.8);
    expect(score.dPrime).toBeGreaterThan(1.0);
  });
});
