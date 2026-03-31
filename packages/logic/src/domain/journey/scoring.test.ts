/**
 * Tests for Journey Scoring
 */

import { describe, expect, test } from 'bun:test';
import {
  computeNativeJourneyScore,
  computeJourneyScoreFromStats,
  getThresholdForStrategy,
  computeBrainWorkshopScoreFromRaw,
  computeDualnbackClassicScoreFromRaw,
  computeBalancedScoreFromRaw,
  aggregateRawStats,
  computeJaeggiProgression,
  evaluateBrainWorkshopSession,
  isSessionPassing,
  hasSDTStats,
  createScoreResultFromPrecomputed,
  computeJourneyScoreForSession,
} from './scoring';
import {
  BW_SCORE_UP_PERCENT,
  JOURNEY_MIN_PASSING_SCORE,
  JAEGGI_MAX_ERRORS_PER_MODALITY,
  SCORE_MAX,
  SCORE_MIN,
} from '../../specs/thresholds';

describe('Journey Scoring', () => {
  const mockModalityStats = {
    hits: 8,
    correctRejections: 10,
    falseAlarms: 1,
    misses: 1,
    total: 20,
  } as any;

  const mockRunningStats = {
    byModality: {
      position: mockModalityStats,
      audio: mockModalityStats,
    },
  } as any;

  const mockSummary = {
    finalStats: {
      byModality: {
        position: mockModalityStats,
        audio: mockModalityStats,
      },
    },
  } as any;

  describe('computeNativeJourneyScore and computeJourneyScoreFromStats', () => {
    test('brainworkshop strategy', () => {
      const result = computeNativeJourneyScore(mockSummary, 'brainworkshop');
      expect(result.strategy).toBe('brainworkshop');
      expect(result.score).toBeGreaterThan(0);
      expect(result.passed).toBe(result.score >= BW_SCORE_UP_PERCENT);
    });

    test('dualnback-classic strategy', () => {
      const result = computeNativeJourneyScore(mockSummary, 'dualnback-classic');
      expect(result.strategy).toBe('dualnback-classic');
      expect(result.passed).toBe(true); // 2 errors per modality < 3
    });

    test('balanced strategy', () => {
      const result = computeNativeJourneyScore(mockSummary, 'balanced');
      expect(result.strategy).toBe('balanced');
      expect(result.passed).toBe(result.score >= JOURNEY_MIN_PASSING_SCORE);
    });

    test('should work with RunningStats input', () => {
      const result = computeJourneyScoreFromStats(mockRunningStats, 'balanced');
      expect(result.score).toBeDefined();
    });
  });

  describe('Raw Score Helpers', () => {
    const rawStats = { hits: 10, correctRejections: 10, falseAlarms: 0, misses: 0 };

    test('computeBrainWorkshopScoreFromRaw', () => {
      expect(computeBrainWorkshopScoreFromRaw(rawStats)).toBe(SCORE_MAX);
      expect(
        computeBrainWorkshopScoreFromRaw({
          hits: 5,
          correctRejections: 100,
          falseAlarms: 5,
          misses: 0,
        }),
      ).toBe(50);
      expect(
        computeBrainWorkshopScoreFromRaw({
          hits: 0,
          correctRejections: 0,
          falseAlarms: 0,
          misses: 0,
        }),
      ).toBe(0);
    });

    test('computeDualnbackClassicScoreFromRaw', () => {
      const byMod = { position: { hits: 10, correctRejections: 10, falseAlarms: 4, misses: 0 } };
      const result = computeDualnbackClassicScoreFromRaw(byMod);
      expect(result.passed).toBe(false); // 4 errors >= 3 threshold (Jaeggi 2008: "fewer than three")
      expect(result.score).toBeLessThan(SCORE_MAX);

      expect(computeDualnbackClassicScoreFromRaw({}).score).toBe(SCORE_MIN);

      const lotsOfErrors = {
        position: { hits: 0, correctRejections: 0, falseAlarms: 20, misses: 20 },
      };
      expect(computeDualnbackClassicScoreFromRaw(lotsOfErrors).score).toBe(SCORE_MIN);
    });

    test('computeBalancedScoreFromRaw', () => {
      expect(computeBalancedScoreFromRaw(rawStats)).toBe(SCORE_MAX);
      expect(
        computeBalancedScoreFromRaw({ hits: 0, misses: 0, falseAlarms: 0, correctRejections: 0 }),
      ).toBe(0);
      expect(
        computeBalancedScoreFromRaw({ hits: 0, misses: 1, falseAlarms: 0, correctRejections: 1 }),
      ).toBe(50); // Sens=0, Spec=1
      expect(
        computeBalancedScoreFromRaw({ hits: 1, misses: 0, falseAlarms: 1, correctRejections: 0 }),
      ).toBe(50); // Sens=1, Spec=0
    });

    test('aggregateRawStats', () => {
      const aggregated = aggregateRawStats({
        p: { hits: 1, misses: 1, falseAlarms: 1, correctRejections: 1 },
        a: { hits: 2, misses: 2, falseAlarms: 2, correctRejections: 2 },
      });
      expect(aggregated.hits).toBe(3);
      // @ts-expect-error test override
      expect(aggregated.total).toBeUndefined(); // It returns RawSDTStats
    });
  });

  describe('Binary Protocols', () => {
    test('computeJaeggiProgression', () => {
      expect(computeJaeggiProgression({}).progression).toBe('STAY');

      const up = { position: { misses: 1, falseAlarms: 1 } } as any; // 2 errors
      expect(computeJaeggiProgression(up).progression).toBe('UP');

      // Jaeggi 2008: "fewer than three" means < 3 to advance, 3 maintains
      const stayWith3Errors = { position: { misses: 2, falseAlarms: 1 } } as any; // 3 errors = STAY
      expect(computeJaeggiProgression(stayWith3Errors).progression).toBe('STAY');

      const stay = { position: { misses: 2, falseAlarms: 2 } } as any; // 4 errors = STAY
      expect(computeJaeggiProgression(stay).progression).toBe('STAY');

      const down = { position: { misses: 4, falseAlarms: 2 } } as any; // 6 errors
      expect(computeJaeggiProgression(down).progression).toBe('DOWN');
    });

    test('evaluateBrainWorkshopSession', () => {
      const up = { p: { hits: 10, correctRejections: 10, falseAlarms: 0, misses: 0 } } as any;
      expect(evaluateBrainWorkshopSession(up).result).toBe('UP');

      const strike = { p: { hits: 1, correctRejections: 1, falseAlarms: 5, misses: 5 } } as any;
      expect(evaluateBrainWorkshopSession(strike).result).toBe('STRIKE');

      const stay = { p: { hits: 5, correctRejections: 5, falseAlarms: 2, misses: 2 } } as any;
      expect(evaluateBrainWorkshopSession(stay).result).toBe('STAY');
    });
  });

  describe('Utilities', () => {
    test('computeNativeJourneyScore edge cases', () => {
      const emptySummary = {
        finalStats: {
          byModality: { p: { hits: 0, misses: 0, falseAlarms: 0, correctRejections: 0 } },
        },
      } as any;
      expect(computeNativeJourneyScore(emptySummary, 'brainworkshop').score).toBe(0);

      const jaeggiNoErrors = {
        finalStats: { byModality: {} },
      } as any;
      expect(computeNativeJourneyScore(jaeggiNoErrors, 'jaeggi').passed).toBe(true);
    });

    test('getThresholdForStrategy', () => {
      expect(getThresholdForStrategy('brainworkshop')).toBe(BW_SCORE_UP_PERCENT);
      expect(getThresholdForStrategy('jaeggi')).toBe(JAEGGI_MAX_ERRORS_PER_MODALITY);
      expect(getThresholdForStrategy('balanced')).toBe(JOURNEY_MIN_PASSING_SCORE);
    });

    test('isSessionPassing', () => {
      const stats = { p: { hits: 10, misses: 0, falseAlarms: 0, correctRejections: 10 } };
      expect(isSessionPassing(stats, 'classic', 2.0)).toBe(true);
    });

    test('hasSDTStats', () => {
      expect(hasSDTStats(mockSummary)).toBe(true);
      expect(hasSDTStats({ score: 80 } as any)).toBe(false);
    });

    test('createScoreResultFromPrecomputed', () => {
      const result = createScoreResultFromPrecomputed(85);
      expect(result.score).toBe(85);
      expect(result.passed).toBe(true);
    });

    test('computeJourneyScoreForSession', () => {
      expect(computeJourneyScoreForSession(mockSummary, 'balanced').strategy).toBe('balanced');
      expect(computeJourneyScoreForSession({ score: 90 } as any, 'balanced').passed).toBe(true);
    });
  });
});
