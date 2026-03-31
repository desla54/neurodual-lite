/**
 * Tests for SessionStats & ModalityStatsVO Value Objects
 *
 * Tests REAL behavior with complete fixtures.
 * NO MOCKS - Value objects are pure functions.
 */

import { describe, expect, test } from 'bun:test';
import { ModalityStatsVO, SessionStats } from './session-stats';
import type {
  RunningStats,
  SessionSummary,
  TrialOutcome,
  TimingStats,
  ModalityRunningStats,
  TrialResult,
} from '../engine/events';
import type { SessionHistoryItem, HistoryModalityStats } from '../ports/history-port';
import type { ModalityId } from './types';

// =============================================================================
// Complete Fixtures (Anti-pattern #4: No partial mocks)
// =============================================================================

const createModalityStats = (
  overrides: Partial<ModalityRunningStats> = {},
): ModalityRunningStats => ({
  hits: 5,
  misses: 1,
  falseAlarms: 1,
  correctRejections: 13,
  avgRT: 400,
  dPrime: 1.5,
  ...overrides,
});

const createRunningStats = (
  posOverrides: Partial<ModalityRunningStats> = {},
  audOverrides: Partial<ModalityRunningStats> = {},
  globalDPrime = 1.5,
): RunningStats => ({
  trialsCompleted: 20,
  globalDPrime,
  byModality: {
    position: createModalityStats(posOverrides),
    audio: createModalityStats({ avgRT: 450, ...audOverrides }),
  },
});

const createTimingStats = (values: number[] = [3000]): TimingStats => ({
  min: Math.min(...values),
  max: Math.max(...values),
  avg: values.reduce((a, b) => a + b, 0) / values.length,
  values,
});

const createTrialOutcome = (
  index: number,
  posResult: TrialResult = 'correctRejection',
  audResult: TrialResult = 'correctRejection',
  posRT: number | null = null,
  audRT: number | null = null,
  posLure = false,
  audLure = false,
): TrialOutcome => ({
  trialIndex: index,
  byModality: {
    position: { result: posResult, reactionTime: posRT, wasLure: posLure },
    audio: { result: audResult, reactionTime: audRT, wasLure: audLure },
  },
});

// @ts-expect-error test override
const createSessionSummary = (overrides: Partial<SessionSummary> = {}): SessionSummary => ({
  sessionId: 'test-session-id',
  nLevel: 2,
  totalTrials: 20,
  outcomes: Array.from({ length: 20 }, (_, i) => createTrialOutcome(i)),
  finalStats: createRunningStats(),
  durationMs: 60000,
  focusLostCount: 0,
  totalFocusLostMs: 0,
  isiStats: createTimingStats([3000, 3000, 3000]),
  stimulusDurationStats: createTimingStats([500, 500, 500]),
  luresCount: { position: 2, audio: 2 },
  tempoConfidence: null,
  ...overrides,
});

const createHistoryModalityStats = (
  overrides: Partial<HistoryModalityStats> = {},
): HistoryModalityStats => ({
  hits: 5,
  misses: 1,
  falseAlarms: 1,
  correctRejections: 13,
  avgRT: 400,
  dPrime: 1.5,
  ...overrides,
});

const createSessionHistoryItem = (
  overrides: Partial<SessionHistoryItem> = {},
  // @ts-expect-error test override
): SessionHistoryItem => ({
  id: 'history-session-id',
  createdAt: new Date('2024-06-15T10:30:00'),
  nLevel: 2,
  dPrime: 1.8,
  passed: true,
  trialsCount: 20,
  durationMs: 60000,
  byModality: {
    position: createHistoryModalityStats(),
    audio: createHistoryModalityStats({ avgRT: 450 }),
  },
  generator: 'BrainWorkshop',
  activeModalities: ['position', 'audio'],
  reason: 'completed',
  ...overrides,
});

// =============================================================================
// ModalityStatsVO Tests
// =============================================================================

describe('ModalityStatsVO', () => {
  describe('constructor', () => {
    test('should store all values', () => {
      const stats = new ModalityStatsVO(5, 1, 2, 12, 350);

      expect(stats.hits).toBe(5);
      expect(stats.misses).toBe(1);
      expect(stats.falseAlarms).toBe(2);
      expect(stats.correctRejections).toBe(12);
      expect(stats.avgReactionTime).toBe(350);
    });

    test('should handle null reaction time', () => {
      const stats = new ModalityStatsVO(0, 0, 0, 20, null);

      expect(stats.avgReactionTime).toBeNull();
    });
  });

  describe('totalTrials', () => {
    test('should sum all trial outcomes', () => {
      const stats = new ModalityStatsVO(5, 2, 3, 10, 400);

      expect(stats.totalTrials).toBe(20);
    });

    test('should return 0 when all counts are 0', () => {
      const stats = new ModalityStatsVO(0, 0, 0, 0, null);

      expect(stats.totalTrials).toBe(0);
    });
  });

  describe('accuracy', () => {
    test('should calculate percentage of hits on targets', () => {
      // 8 hits, 2 misses = 80% accuracy
      const stats = new ModalityStatsVO(8, 2, 5, 5, 400);

      expect(stats.accuracy).toBe(80);
    });

    test('should return 0 when no targets', () => {
      const stats = new ModalityStatsVO(0, 0, 5, 15, 400);

      expect(stats.accuracy).toBe(0);
    });

    test('should round to integer', () => {
      // 7/9 = 77.77% → 78%
      const stats = new ModalityStatsVO(7, 2, 5, 6, 400);

      expect(stats.accuracy).toBe(78);
    });

    test('should handle 100% accuracy', () => {
      const stats = new ModalityStatsVO(10, 0, 0, 10, 400);

      expect(stats.accuracy).toBe(100);
    });
  });

  describe('overallAccuracy', () => {
    test('should calculate global correct ratio', () => {
      // (8 hits + 7 CR) / 20 trials = 15/20 = 75%
      const stats = new ModalityStatsVO(8, 2, 3, 7, 400);
      expect(stats.overallAccuracy).toBe(75);
    });

    test('should return 0 when no trials', () => {
      const stats = new ModalityStatsVO(0, 0, 0, 0, null);
      expect(stats.overallAccuracy).toBe(0);
    });
  });

  describe('hitRate', () => {
    test('should return raw hit rate (0-1)', () => {
      // 8 hits / 10 targets = 0.8
      const stats = new ModalityStatsVO(8, 2, 5, 5, 400);

      expect(stats.hitRate).toBe(0.8);
    });

    test('should return 0 when no targets', () => {
      const stats = new ModalityStatsVO(0, 0, 5, 15, 400);

      expect(stats.hitRate).toBe(0);
    });

    test('should return 1 for perfect hit rate', () => {
      const stats = new ModalityStatsVO(10, 0, 0, 10, 400);

      expect(stats.hitRate).toBe(1);
    });
  });

  describe('falseAlarmRate', () => {
    test('should return raw false alarm rate (0-1)', () => {
      // 2 false alarms / 10 non-targets = 0.2
      const stats = new ModalityStatsVO(5, 5, 2, 8, 400);

      expect(stats.falseAlarmRate).toBe(0.2);
    });

    test('should return 0 when no non-targets', () => {
      const stats = new ModalityStatsVO(10, 10, 0, 0, 400);

      expect(stats.falseAlarmRate).toBe(0);
    });

    test('should return 0 when no false alarms', () => {
      const stats = new ModalityStatsVO(5, 5, 0, 10, 400);

      expect(stats.falseAlarmRate).toBe(0);
    });
  });

  describe('formattedRT', () => {
    test('should format reaction time in milliseconds', () => {
      const stats = new ModalityStatsVO(5, 1, 1, 13, 342.7);

      expect(stats.formattedRT).toBe('343ms');
    });

    test('should return null when no reaction time', () => {
      const stats = new ModalityStatsVO(0, 0, 0, 20, null);

      expect(stats.formattedRT).toBeNull();
    });

    test('should round to nearest integer', () => {
      const stats = new ModalityStatsVO(5, 1, 1, 13, 399.4);

      expect(stats.formattedRT).toBe('399ms');
    });
  });
});

// =============================================================================
// SessionStats Tests
// =============================================================================

describe('SessionStats', () => {
  describe('constructor', () => {
    test('should create stats from RunningStats', () => {
      const runningStats = createRunningStats();
      const stats = new SessionStats('session-1', 2, 20, 60000, 1.5, new Date(), runningStats);

      expect(stats.sessionId).toBe('session-1');
      expect(stats.nLevel).toBe(2);
      expect(stats.totalTrials).toBe(20);
      expect(stats.durationMs).toBe(60000);
      expect(stats.globalDPrime).toBe(1.5);
    });

    test('should create position modality stats', () => {
      const runningStats = createRunningStats({
        hits: 8,
        misses: 2,
        falseAlarms: 3,
        correctRejections: 7,
        avgRT: 350,
      });
      const stats = new SessionStats('s1', 2, 20, 60000, 1.5, new Date(), runningStats);

      expect(stats.position.hits).toBe(8);
      expect(stats.position.misses).toBe(2);
      expect(stats.position.falseAlarms).toBe(3);
      expect(stats.position.correctRejections).toBe(7);
      expect(stats.position.avgReactionTime).toBe(350);
    });

    test('should create audio modality stats', () => {
      const runningStats = createRunningStats(
        {}, // position defaults
        { hits: 6, misses: 4, falseAlarms: 2, correctRejections: 8, avgRT: 420 },
      );
      const stats = new SessionStats('s1', 2, 20, 60000, 1.5, new Date(), runningStats);

      expect(stats.audio.hits).toBe(6);
      expect(stats.audio.misses).toBe(4);
      expect(stats.audio.falseAlarms).toBe(2);
      expect(stats.audio.correctRejections).toBe(8);
      expect(stats.audio.avgReactionTime).toBe(420);
    });

    test('should use provided unifiedMetrics', () => {
      const runningStats = createRunningStats();
      const customMetrics = { accuracy: 0.95, nLevel: 2, zone: 12, zoneProgress: 50 };
      const stats = new SessionStats(
        's1',
        2,
        20,
        60000,
        1.5,
        new Date(),
        runningStats,
        customMetrics,
      );

      expect(stats.unifiedMetrics).toEqual(customMetrics);
    });

    test('should compute unifiedMetrics if not provided', () => {
      const runningStats = createRunningStats();
      // Balanced Accuracy: (hitRate + crRate) / 2
      // hitRate = 10/12 = 0.833, crRate = 26/28 = 0.929
      // Expected: (0.833 + 0.929) / 2 ≈ 0.881
      const stats = new SessionStats('s1', 2, 20, 60000, 1.5, new Date(), runningStats);

      expect(stats.unifiedMetrics.accuracy).toBeCloseTo(0.881, 2);
      expect(stats.unifiedMetrics.zone).toBe(7); // Base 4 + Bonus 3
    });

    test('should list activeModalities', () => {
      const runningStats = createRunningStats();
      const stats = new SessionStats('s1', 2, 20, 60000, 1.5, new Date(), runningStats);

      expect(stats.activeModalities).toContain('position');
      expect(stats.activeModalities).toContain('audio');
    });
  });

  describe('getModality()', () => {
    test('should return position stats', () => {
      const stats = new SessionStats(
        's1',
        2,
        20,
        60000,
        1.5,
        new Date(),
        createRunningStats({ hits: 10 }),
      );

      expect(stats.getModality('position').hits).toBe(10);
    });

    test('should return audio stats', () => {
      const stats = new SessionStats(
        's1',
        2,
        20,
        60000,
        1.5,
        new Date(),
        createRunningStats({}, { hits: 7 }),
      );

      expect(stats.getModality('audio').hits).toBe(7);
    });

    test('should return empty stats for unknown modality', () => {
      const stats = new SessionStats('s1', 2, 20, 60000, 1.5, new Date(), createRunningStats());
      const unknown = stats.getModality('unknown' as ModalityId);
      expect(unknown.totalTrials).toBe(0);
    });

    test('byModality should return the full map', () => {
      const stats = new SessionStats('s1', 2, 20, 60000, 1.5, new Date(), createRunningStats());
      expect(stats.byModality.size).toBe(2);
      expect(stats.byModality.has('position')).toBe(true);
    });
  });

  describe('passed', () => {
    test('should return true when d-prime >= 1.5', () => {
      const stats = new SessionStats('s1', 2, 20, 60000, 1.5, new Date(), createRunningStats());

      expect(stats.passed).toBe(true);
    });

    test('should return true when d-prime > 1.5', () => {
      const stats = new SessionStats('s1', 2, 20, 60000, 2.3, new Date(), createRunningStats());

      expect(stats.passed).toBe(true);
    });

    test('should return false when d-prime < 1.5', () => {
      const stats = new SessionStats('s1', 2, 20, 60000, 1.2, new Date(), createRunningStats());

      expect(stats.passed).toBe(false);
    });
  });

  describe('isShortSession', () => {
    test('should return true when trials < 20', () => {
      const stats = new SessionStats('s1', 2, 15, 40000, 1.5, new Date(), createRunningStats());

      expect(stats.isShortSession).toBe(true);
    });

    test('should return false when trials >= 20', () => {
      const stats = new SessionStats('s1', 2, 20, 60000, 1.5, new Date(), createRunningStats());

      expect(stats.isShortSession).toBe(false);
    });

    test('should return false when trials > 20', () => {
      const stats = new SessionStats('s1', 2, 25, 75000, 1.5, new Date(), createRunningStats());

      expect(stats.isShortSession).toBe(false);
    });
  });

  describe('formattedDuration', () => {
    test('should format as seconds only when < 1 minute', () => {
      const stats = new SessionStats('s1', 2, 20, 45000, 1.5, new Date(), createRunningStats());

      expect(stats.formattedDuration).toBe('45s');
    });

    test('should format as minutes and seconds', () => {
      const stats = new SessionStats('s1', 2, 20, 150000, 1.5, new Date(), createRunningStats());

      expect(stats.formattedDuration).toBe('2min 30s');
    });

    test('should handle exact minutes', () => {
      const stats = new SessionStats('s1', 2, 20, 120000, 1.5, new Date(), createRunningStats());

      expect(stats.formattedDuration).toBe('2min 0s');
    });
  });

  describe('formattedDPrime', () => {
    test('should format d-prime with one decimal', () => {
      const stats = new SessionStats('s1', 2, 20, 60000, 2.34567, new Date(), createRunningStats());

      expect(stats.formattedDPrime).toBe('2.3');
    });

    test('should handle negative d-prime', () => {
      const stats = new SessionStats('s1', 2, 20, 60000, -0.5, new Date(), createRunningStats());

      expect(stats.formattedDPrime).toBe('-0.5');
    });
  });

  describe('shouldLevelUp()', () => {
    test('should return true when d-prime >= 1.5', () => {
      const stats = new SessionStats('s1', 2, 20, 60000, 1.5, new Date(), createRunningStats());

      expect(stats.shouldLevelUp()).toBe(true);
    });

    test('should return false when d-prime < 1.5', () => {
      const stats = new SessionStats('s1', 2, 20, 60000, 1.4, new Date(), createRunningStats());

      expect(stats.shouldLevelUp()).toBe(false);
    });
  });

  describe('shouldLevelDown()', () => {
    test('should return true when d-prime < 0.8 and nLevel > 1', () => {
      const stats = new SessionStats('s1', 3, 20, 60000, 0.5, new Date(), createRunningStats());

      expect(stats.shouldLevelDown()).toBe(true);
    });

    test('should return false when d-prime >= 0.8', () => {
      const stats = new SessionStats('s1', 3, 20, 60000, 0.8, new Date(), createRunningStats());

      expect(stats.shouldLevelDown()).toBe(false);
    });

    test('should return false when nLevel is 1', () => {
      const stats = new SessionStats('s1', 1, 20, 60000, 0.5, new Date(), createRunningStats());

      expect(stats.shouldLevelDown()).toBe(false);
    });
  });

  describe('getNextLevel()', () => {
    test('should return nLevel + 1 when should level up', () => {
      const stats = new SessionStats('s1', 2, 20, 60000, 2.0, new Date(), createRunningStats());

      expect(stats.getNextLevel()).toBe(3);
    });

    test('should return nLevel - 1 when should level down', () => {
      const stats = new SessionStats('s1', 3, 20, 60000, 0.5, new Date(), createRunningStats());

      expect(stats.getNextLevel()).toBe(2);
    });

    test('should return same nLevel when neither up nor down', () => {
      const stats = new SessionStats('s1', 2, 20, 60000, 1.0, new Date(), createRunningStats());

      expect(stats.getNextLevel()).toBe(2);
    });

    test('should not go below level 1', () => {
      const stats = new SessionStats('s1', 1, 20, 60000, 0.3, new Date(), createRunningStats());

      expect(stats.getNextLevel()).toBe(1);
    });
  });

  describe('fromSummary()', () => {
    test('should create stats from SessionSummary', () => {
      const summary = createSessionSummary({
        sessionId: 'summary-session',
        nLevel: 3,
        totalTrials: 25,
        durationMs: 90000,
        finalStats: createRunningStats({}, {}, 2.1),
      });

      const stats = SessionStats.fromSummary(summary);

      expect(stats.sessionId).toBe('summary-session');
      expect(stats.nLevel).toBe(3);
      expect(stats.totalTrials).toBe(25);
      expect(stats.durationMs).toBe(90000);
      expect(stats.globalDPrime).toBe(2.1);
    });

    test('should transfer modality stats', () => {
      const summary = createSessionSummary({
        finalStats: createRunningStats(
          { hits: 8 }, // position
          { misses: 3 }, // audio
        ),
      });

      const stats = SessionStats.fromSummary(summary);

      expect(stats.position.hits).toBe(8);
      expect(stats.audio.misses).toBe(3);
    });

    test('should set createdAt to current time', () => {
      const before = new Date();
      const summary = createSessionSummary();
      const stats = SessionStats.fromSummary(summary);
      const after = new Date();

      expect(stats.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(stats.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('fromHistoryItem()', () => {
    test('should create stats from SessionHistoryItem', () => {
      const historyItem = createSessionHistoryItem({
        id: 'history-1',
        nLevel: 4,
        trialsCount: 30,
        durationMs: 120000,
        dPrime: 2.5,
      });

      const stats = SessionStats.fromHistoryItem(historyItem);

      expect(stats.sessionId).toBe('history-1');
      expect(stats.nLevel).toBe(4);
      expect(stats.totalTrials).toBe(30);
      expect(stats.durationMs).toBe(120000);
      expect(stats.globalDPrime).toBe(2.5);
    });

    test('should preserve createdAt from history', () => {
      const historyDate = new Date('2024-01-15T14:30:00');
      const historyItem = createSessionHistoryItem({ createdAt: historyDate });

      const stats = SessionStats.fromHistoryItem(historyItem);

      expect(stats.createdAt).toEqual(historyDate);
    });

    test('should transfer position stats', () => {
      const historyItem = createSessionHistoryItem({
        byModality: {
          position: createHistoryModalityStats({
            hits: 9,
            misses: 1,
            falseAlarms: 2,
            correctRejections: 8,
            avgRT: 320,
          }),
          audio: createHistoryModalityStats(),
        },
      });

      const stats = SessionStats.fromHistoryItem(historyItem);

      expect(stats.position.hits).toBe(9);
      expect(stats.position.misses).toBe(1);
      expect(stats.position.falseAlarms).toBe(2);
      expect(stats.position.correctRejections).toBe(8);
      expect(stats.position.avgReactionTime).toBe(320);
    });

    test('should transfer audio stats', () => {
      const historyItem = createSessionHistoryItem({
        byModality: {
          position: createHistoryModalityStats(),
          audio: createHistoryModalityStats({
            hits: 7,
            misses: 3,
            falseAlarms: 1,
            correctRejections: 9,
            avgRT: 380,
          }),
        },
      });

      const stats = SessionStats.fromHistoryItem(historyItem);

      expect(stats.audio.hits).toBe(7);
      expect(stats.audio.misses).toBe(3);
      expect(stats.audio.falseAlarms).toBe(1);
      expect(stats.audio.correctRejections).toBe(9);
      expect(stats.audio.avgReactionTime).toBe(380);
    });

    test('should handle null reaction times', () => {
      const historyItem = createSessionHistoryItem({
        byModality: {
          position: createHistoryModalityStats({ avgRT: null }),
          audio: createHistoryModalityStats({ avgRT: null }),
        },
      });

      const stats = SessionStats.fromHistoryItem(historyItem);

      expect(stats.position.avgReactionTime).toBeNull();
      expect(stats.audio.avgReactionTime).toBeNull();
    });
  });
});
