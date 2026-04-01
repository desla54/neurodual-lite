/**
 * UnifiedScoreCalculator Tests
 *
 * Tests for the Unified Performance Score calculation.
 */

import { describe, expect, test } from 'bun:test';
import { UnifiedScoreCalculator } from './unified-score';
import type {
  PlaceAccuracyData,
  MemoAccuracyData,
  TempoAccuracyData,
  TempoResponseData,
} from '../../types/ups';

// =============================================================================
// Helpers
// =============================================================================

function createTempoAccuracy(overrides?: Partial<TempoAccuracyData>): TempoAccuracyData {
  return {
    hits: 10,
    misses: 2,
    falseAlarms: 1,
    correctRejections: 7,
    ...overrides,
  };
}

function createTempoResponse(
  overrides: Partial<TempoResponseData> & { trialIndex: number },
): TempoResponseData {
  return {
    reactionTimeMs: 400,
    pressDurationMs: 150,
    responsePhase: 'during_stimulus',
    result: 'hit',
    modality: 'position',
    ...overrides,
  };
}

function createTempoResponses(count: number): TempoResponseData[] {
  return Array.from({ length: count }, (_, i) => createTempoResponse({ trialIndex: i }));
}

function createPlaceAccuracy(overrides?: Partial<PlaceAccuracyData>): PlaceAccuracyData {
  return {
    correctDrops: 15,
    totalDrops: 20,
    confidenceScore: 80,
    ...overrides,
  };
}

function createRecallAccuracy(overrides?: Partial<MemoAccuracyData>): MemoAccuracyData {
  return {
    correctPicks: 12,
    totalPicks: 15,
    avgConfidenceScore: 75,
    windowsCompleted: 5,
    ...overrides,
  };
}

// =============================================================================
// Core UPS Formula Tests
// =============================================================================

describe('UnifiedScoreCalculator', () => {
  describe('UPS Formula', () => {
    test('perfect accuracy and confidence yields 100', () => {
      const result = UnifiedScoreCalculator.calculate(100, 100);
      expect(result.score).toBe(100);
    });

    test('zero accuracy yields 0 regardless of confidence', () => {
      const result = UnifiedScoreCalculator.calculate(0, 100);
      expect(result.score).toBe(0);
    });

    test('zero confidence yields 0 regardless of accuracy', () => {
      const result = UnifiedScoreCalculator.calculate(100, 0);
      expect(result.score).toBe(0);
    });

    test('multiplicative formula prevents compensation', () => {
      // High accuracy, low confidence should not reach high scores
      const highAccLowConf = UnifiedScoreCalculator.calculate(100, 30);
      // Low accuracy, high confidence should not reach high scores
      const lowAccHighConf = UnifiedScoreCalculator.calculate(30, 100);

      // Both should be well below 100
      expect(highAccLowConf.score).toBeLessThan(75);
      expect(lowAccHighConf.score).toBeLessThan(60);
    });

    test('balanced scores yield reasonable UPS', () => {
      const result = UnifiedScoreCalculator.calculate(80, 80);
      // 100 * (0.8^0.6) * (0.8^0.4) ≈ 80
      expect(result.score).toBe(80);
    });

    test('fallback when confidence is null', () => {
      const result = UnifiedScoreCalculator.calculate(100, null);
      // Fallback: accuracy only (no penalty)
      expect(result.score).toBe(100);
    });

    test('scores are clamped to 0-100', () => {
      const lowResult = UnifiedScoreCalculator.calculate(-10, 50);
      const highResult = UnifiedScoreCalculator.calculate(150, 150);

      expect(lowResult.score).toBeGreaterThanOrEqual(0);
      expect(highResult.score).toBeLessThanOrEqual(100);
    });
  });

  describe('Tier Assignment', () => {
    test('score >= 90 is elite', () => {
      const result = UnifiedScoreCalculator.calculate(95, 95);
      expect(result.tier).toBe('elite');
    });

    test('score >= 80 is advanced', () => {
      const result = UnifiedScoreCalculator.calculate(85, 85);
      expect(result.tier).toBe('advanced');
    });

    test('score >= 70 is intermediate', () => {
      const result = UnifiedScoreCalculator.calculate(75, 75);
      expect(result.tier).toBe('intermediate');
    });

    test('score < 70 is novice', () => {
      const result = UnifiedScoreCalculator.calculate(50, 50);
      expect(result.tier).toBe('novice');
    });
  });

  describe('Journey Eligibility', () => {
    test('eligible when UPS >= 70 and not gaming', () => {
      const result = UnifiedScoreCalculator.calculate(85, 85, false);
      expect(result.journeyEligible).toBe(true);
    });

    test('not eligible when UPS < 70', () => {
      const result = UnifiedScoreCalculator.calculate(50, 50, false);
      expect(result.journeyEligible).toBe(false);
    });

    test('not eligible when gaming detected', () => {
      const result = UnifiedScoreCalculator.calculate(95, 95, true);
      expect(result.journeyEligible).toBe(false);
    });
  });
});

// =============================================================================
// Tempo Mode Tests
// =============================================================================

describe('Tempo Mode UPS', () => {
  test('calculates spec-driven accuracy for SDT mode (dualnback-classic)', () => {
    // 10/12 hits = 83.3%, 7/8 CR = 87.5%
    // Geometric Mean (SDT) = sqrt(0.833 * 0.875) ≈ 0.854 → 85%
    const accuracy = createTempoAccuracy({
      hits: 10,
      misses: 2,
      falseAlarms: 1,
      correctRejections: 7,
    });
    const responses = createTempoResponses(15);

    const result = UnifiedScoreCalculator.calculateTempo('dualnback-classic', accuracy, responses);

    expect(result.components.accuracy).toBe(85);
  });

  test('calculates spec-driven accuracy for Jaeggi mode', () => {
    // hits=10, misses=2, FA=1, CR=7
    // Jaeggi: 1 - (errors / totalRelevant) = 1 - (2+1) / (10+2+1) = 1 - 3/13 ≈ 0.769 → 77%
    const accuracy = createTempoAccuracy({
      hits: 10,
      misses: 2,
      falseAlarms: 1,
      correctRejections: 7,
    });
    const responses = createTempoResponses(15);

    const result = UnifiedScoreCalculator.calculateTempo('dualnback-classic', accuracy, responses);

    expect(result.components.accuracy).toBe(77);
  });

  test('calculates spec-driven accuracy for BrainWorkshop mode', () => {
    // hits=10, misses=2, FA=1, CR=7
    // BrainWorkshop: H / (H + M + FA) = 10 / (10+2+1) = 10/13 ≈ 0.769 → 77%
    const accuracy = createTempoAccuracy({
      hits: 10,
      misses: 2,
      falseAlarms: 1,
      correctRejections: 7,
    });
    const responses = createTempoResponses(15);

    const result = UnifiedScoreCalculator.calculateTempo('sim-brainworkshop', accuracy, responses);

    expect(result.components.accuracy).toBe(77);
  });

  test('returns confidence when enough data', () => {
    const accuracy = createTempoAccuracy();
    const responses = createTempoResponses(15); // >= 10 trials

    const result = UnifiedScoreCalculator.calculateTempo('dualnback-classic', accuracy, responses);

    expect(result.components.confidence).not.toBeNull();
  });

  test('returns null confidence when no valid responses', () => {
    const accuracy = createTempoAccuracy();
    const responses: TempoResponseData[] = []; // Empty = no data

    const result = UnifiedScoreCalculator.calculateTempo('dualnback-classic', accuracy, responses);

    expect(result.components.confidence).toBeNull();
  });

  test('handles all hits (100% accuracy) for SDT mode', () => {
    const accuracy = createTempoAccuracy({
      hits: 10,
      misses: 0,
      falseAlarms: 0,
      correctRejections: 10,
    });
    const responses = createTempoResponses(20);

    const result = UnifiedScoreCalculator.calculateTempo('dualnback-classic', accuracy, responses);

    expect(result.components.accuracy).toBe(100);
  });

  test('handles no signals (edge case)', () => {
    const accuracy = createTempoAccuracy({
      hits: 0,
      misses: 0,
      falseAlarms: 0,
      correctRejections: 0,
    });
    const responses: TempoResponseData[] = [];

    const result = UnifiedScoreCalculator.calculateTempo('dualnback-classic', accuracy, responses);

    expect(result.components.accuracy).toBe(0);
  });
});

// =============================================================================
// Flow Mode Tests
// =============================================================================

describe('Flow Mode UPS', () => {
  test('calculates accuracy correctly', () => {
    const data = createPlaceAccuracy({
      correctDrops: 15,
      totalDrops: 20,
      confidenceScore: 80,
    });

    const result = UnifiedScoreCalculator.calculatePlace(data);

    expect(result.components.accuracy).toBe(75); // 15/20 = 75%
    expect(result.components.confidence).toBe(80);
  });

  test('handles null confidence', () => {
    const data = createPlaceAccuracy({
      correctDrops: 15,
      totalDrops: 20,
      confidenceScore: null,
    });

    const result = UnifiedScoreCalculator.calculatePlace(data);

    // Fallback: accuracy only (no penalty) = 75
    expect(result.score).toBe(75);
  });

  test('handles zero drops', () => {
    const data = createPlaceAccuracy({
      correctDrops: 0,
      totalDrops: 0,
      confidenceScore: 80,
    });

    const result = UnifiedScoreCalculator.calculatePlace(data);

    expect(result.components.accuracy).toBe(0);
  });

  test('perfect score with high confidence', () => {
    const data = createPlaceAccuracy({
      correctDrops: 20,
      totalDrops: 20,
      confidenceScore: 100,
    });

    const result = UnifiedScoreCalculator.calculatePlace(data);

    expect(result.score).toBe(100);
  });
});

// =============================================================================
// Recall Mode Tests
// =============================================================================

describe('Recall Mode UPS', () => {
  test('calculates accuracy correctly', () => {
    const data = createRecallAccuracy({
      correctPicks: 12,
      totalPicks: 15,
      avgConfidenceScore: 75,
    });

    const result = UnifiedScoreCalculator.calculateRecall(data);

    expect(result.components.accuracy).toBe(80); // 12/15 = 80%
    expect(result.components.confidence).toBe(75);
  });

  test('handles null confidence', () => {
    const data = createRecallAccuracy({
      correctPicks: 12,
      totalPicks: 15,
      avgConfidenceScore: null,
    });

    const result = UnifiedScoreCalculator.calculateRecall(data);

    // Fallback: accuracy only (no penalty) = 80
    expect(result.score).toBe(80);
  });

  test('handles zero picks', () => {
    const data = createRecallAccuracy({
      correctPicks: 0,
      totalPicks: 0,
      avgConfidenceScore: 75,
    });

    const result = UnifiedScoreCalculator.calculateRecall(data);

    expect(result.components.accuracy).toBe(0);
  });

  test('perfect score with high confidence', () => {
    const data = createRecallAccuracy({
      correctPicks: 15,
      totalPicks: 15,
      avgConfidenceScore: 100,
    });

    const result = UnifiedScoreCalculator.calculateRecall(data);

    expect(result.score).toBe(100);
  });
});

// =============================================================================
// Edge Cases and Invariants
// =============================================================================

describe('Edge Cases', () => {
  test('UPS is always within 0-100', () => {
    const testCases = [
      { acc: 0, conf: 0 },
      { acc: 100, conf: 100 },
      { acc: 50, conf: 50 },
      { acc: 100, conf: null },
      { acc: 0, conf: null },
    ];

    for (const { acc, conf } of testCases) {
      const result = UnifiedScoreCalculator.calculate(acc, conf);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    }
  });

  test('higher accuracy always yields higher or equal UPS (fixed confidence)', () => {
    const conf = 80;
    let prevScore = 0;

    for (let acc = 0; acc <= 100; acc += 10) {
      const result = UnifiedScoreCalculator.calculate(acc, conf);
      expect(result.score).toBeGreaterThanOrEqual(prevScore);
      prevScore = result.score;
    }
  });

  test('higher confidence always yields higher or equal UPS (fixed accuracy)', () => {
    const acc = 80;
    let prevScore = 0;

    for (let conf = 0; conf <= 100; conf += 10) {
      const result = UnifiedScoreCalculator.calculate(acc, conf);
      expect(result.score).toBeGreaterThanOrEqual(prevScore);
      prevScore = result.score;
    }
  });

  test('getScore helper returns same as full calculation', () => {
    const acc = 80;
    const conf = 75;

    const fullResult = UnifiedScoreCalculator.calculate(acc, conf);
    const score = UnifiedScoreCalculator.getScore(acc, conf);

    expect(score).toBe(fullResult.score);
  });
});
