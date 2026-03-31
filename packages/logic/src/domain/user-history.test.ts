/**
 * Tests for UserHistory Aggregate
 *
 * Tests REAL behavior with complete fixtures.
 * NO MOCKS - UserHistory is pure computation over sessions.
 */

import { describe, expect, test, afterEach, beforeEach, setSystemTime } from 'bun:test';
import { UserHistory } from './user-history';
// ... rest of imports

describe('UserHistory temporal edge cases with mocked date', () => {
  // Use a fixed timestamp for all date-related operations
  const MOCK_DATE = new Date('2024-06-15T12:00:00Z');

  beforeEach(() => {
    setSystemTime(MOCK_DATE);
  });

  afterEach(() => {
    setSystemTime(); // Reset to real time
  });

  test('getStreak should return 0 when last session was before yesterday', () => {
    const threeDaysAgo = new Date(MOCK_DATE.getTime() - 3 * 24 * 60 * 60 * 1000);
    const history = UserHistory.fromHistoryItems([createSessionOnDate(threeDaysAgo)]);

    expect(history.getStreak().current).toBe(0);
  });

  test('getStreak should handle exactly yesterday and today', () => {
    const today = new Date(MOCK_DATE);
    const yesterday = new Date(MOCK_DATE.getTime() - 24 * 60 * 60 * 1000);
    const history = UserHistory.fromHistoryItems([
      createSessionOnDate(today),
      createSessionOnDate(yesterday),
    ]);

    expect(history.getStreak().current).toBe(2);
  });

  test('getTrend should handle boundary counts (5 recent, 3 older)', () => {
    const now = new Date(MOCK_DATE);
    // Trend logic needs 3+ in recent (slice 0-5) AND 3+ in older (slice 5-15)
    const recent = Array.from({ length: 5 }, (_, i) =>
      createSessionHistoryItem({ createdAt: new Date(now.getTime() - i * 1000), dPrime: 2.0 }),
    );
    const older = Array.from({ length: 3 }, (_, i) =>
      createSessionHistoryItem({
        createdAt: new Date(now.getTime() - (i + 10) * 3600000),
        dPrime: 1.0,
      }),
    );

    const history = UserHistory.fromHistoryItems([...recent, ...older]);
    const trend = history.getTrend();
    expect(trend.direction).toBe('improving');
    expect(trend.confidence).toBe('low'); // < 10 total sessions (8 here)
  });

  test('isPlateauing should return true for identical dPrimes', () => {
    const items = Array.from({ length: 5 }, () => createSessionHistoryItem({ dPrime: 2.0 }));
    const history = UserHistory.fromHistoryItems(items);
    expect(history.isPlateauing(0.01)).toBe(true);
  });
});
import type {
  SessionSummary,
  RunningStats,
  TrialOutcome,
  TimingStats,
  ModalityRunningStats,
  TrialResult,
} from '../engine/events';
import type { SessionHistoryItem, HistoryModalityStats } from '../ports/history-port';

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

let testIdCounter = 0;
function nextTestId(prefix: string): string {
  testIdCounter += 1;
  return `${prefix}-${testIdCounter}`;
}

// @ts-expect-error test override
const createSessionSummary = (overrides: Partial<SessionSummary> = {}): SessionSummary => ({
  sessionId: nextTestId('session'),
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
  ...overrides,
});

const createHistoryModalityStats = (
  overrides: Partial<HistoryModalityStats> = {},
  // @ts-expect-error test override
): HistoryModalityStats => ({
  hits: 5,
  misses: 1,
  falseAlarms: 1,
  correctRejections: 13,
  avgRT: 400,
  ...overrides,
});

const createSessionHistoryItem = (
  overrides: Partial<SessionHistoryItem> = {},
  // @ts-expect-error test override
): SessionHistoryItem => ({
  id: nextTestId('history'),
  createdAt: new Date(),
  nLevel: 2,
  dPrime: 1.5,
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

/** Helper to create sessions on specific dates */
const createSessionOnDate = (date: Date, dPrime = 1.5): SessionHistoryItem =>
  createSessionHistoryItem({
    createdAt: date,
    dPrime,
  });

/** Helper to create multiple sessions */
const createSessions = (count: number, dPrime = 1.5): SessionSummary[] =>
  Array.from({ length: count }, () =>
    createSessionSummary({
      finalStats: createRunningStats({}, {}, dPrime),
    }),
  );

// =============================================================================
// Factory Tests
// =============================================================================

describe('UserHistory factory methods', () => {
  describe('empty()', () => {
    test('should create empty history', () => {
      const history = UserHistory.empty();

      expect(history.totalSessions).toBe(0);
      expect(history.isEmpty).toBe(true);
    });
  });

  describe('from()', () => {
    test('should create history from SessionSummary array', () => {
      const summaries = createSessions(3);
      const history = UserHistory.from(summaries);

      expect(history.totalSessions).toBe(3);
      expect(history.isEmpty).toBe(false);
    });
  });

  describe('fromHistoryItems()', () => {
    test('should create history from SessionHistoryItem array', () => {
      const items = [createSessionHistoryItem(), createSessionHistoryItem()];
      const history = UserHistory.fromHistoryItems(items);

      expect(history.totalSessions).toBe(2);
    });
  });
});

// =============================================================================
// Basic Accessor Tests
// =============================================================================

describe('Basic accessors', () => {
  describe('sessions', () => {
    test('should return sessions sorted by date (most recent first)', () => {
      const now = new Date();
      const items = [
        createSessionOnDate(new Date(now.getTime() - 3600000), 1.0), // 1 hour ago
        createSessionOnDate(new Date(now.getTime() - 7200000), 2.0), // 2 hours ago
        createSessionOnDate(now, 3.0), // now
      ];
      const history = UserHistory.fromHistoryItems(items);

      const sessions = history.sessions;
      expect(sessions[0]?.globalDPrime).toBe(3.0); // Most recent first
      expect(sessions[2]?.globalDPrime).toBe(2.0); // Oldest last
    });
  });

  describe('lastSession', () => {
    test('should return null for empty history', () => {
      const history = UserHistory.empty();

      expect(history.lastSession).toBeNull();
    });

    test('should return most recent session', () => {
      const now = new Date();
      const items = [
        createSessionOnDate(new Date(now.getTime() - 3600000), 1.0),
        createSessionOnDate(now, 2.5),
      ];
      const history = UserHistory.fromHistoryItems(items);

      expect(history.lastSession?.globalDPrime).toBe(2.5);
    });
  });
});

// =============================================================================
// Global Metrics Tests
// =============================================================================

describe('Global metrics', () => {
  describe('avgDPrime', () => {
    test('should return 0 for empty history', () => {
      expect(UserHistory.empty().avgDPrime).toBe(0);
    });

    test('should calculate average d-prime', () => {
      const items = [
        createSessionHistoryItem({ dPrime: 1.0 }),
        createSessionHistoryItem({ dPrime: 2.0 }),
        createSessionHistoryItem({ dPrime: 3.0 }),
      ];
      const history = UserHistory.fromHistoryItems(items);

      expect(history.avgDPrime).toBe(2.0);
    });
  });

  describe('bestDPrime', () => {
    test('should return 0 for empty history', () => {
      expect(UserHistory.empty().bestDPrime).toBe(0);
    });

    test('should return maximum d-prime', () => {
      const items = [
        createSessionHistoryItem({ dPrime: 1.5 }),
        createSessionHistoryItem({ dPrime: 2.8 }),
        createSessionHistoryItem({ dPrime: 2.0 }),
      ];
      const history = UserHistory.fromHistoryItems(items);

      expect(history.bestDPrime).toBe(2.8);
    });
  });

  describe('maxNLevel', () => {
    test('should return 1 for empty history', () => {
      expect(UserHistory.empty().maxNLevel).toBe(1);
    });

    test('should return highest N level', () => {
      const items = [
        createSessionHistoryItem({ nLevel: 2 }),
        createSessionHistoryItem({ nLevel: 5 }),
        createSessionHistoryItem({ nLevel: 3 }),
      ];
      const history = UserHistory.fromHistoryItems(items);

      expect(history.maxNLevel).toBe(5);
    });
  });

  describe('Unified Metrics (Zones & Accuracy)', () => {
    test('avgZone and bestZone should return correct values', () => {
      // Zone is calculated from nLevel and dPrime.
      // Level 2, dPrime 1.5 -> Base Zone 4. Default accuracy 0.9 -> Bonus 3. Total Zone 7.
      // Level 3, dPrime 1.5 -> Base Zone 7. Default accuracy 0.9 -> Bonus 3. Total Zone 10.
      const items = [
        createSessionHistoryItem({ nLevel: 2, dPrime: 1.5 }), // Zone 7
        createSessionHistoryItem({ nLevel: 3, dPrime: 1.5 }), // Zone 10
      ];
      const history = UserHistory.fromHistoryItems(items);
      expect(history.avgZone).toBe(9); // (7 + 10) / 2 = 8.5 -> 9
      expect(history.bestZone).toBe(10);
    });

    test('avgAccuracy and bestAccuracy should return correct percentages', () => {
      // Accuracy uses Balanced Accuracy = (hitRate + crRate) / 2
      const items = [
        createSessionHistoryItem({
          byModality: {
            position: createHistoryModalityStats({ hits: 8, misses: 2 }),
            audio: createHistoryModalityStats({ hits: 8, misses: 2 }),
          },
        }), // Balanced: hitRate=16/20=0.8, crRate=26/28=0.929 -> 0.864
        createSessionHistoryItem({
          byModality: {
            position: createHistoryModalityStats({ hits: 10, misses: 0 }),
            audio: createHistoryModalityStats({ hits: 10, misses: 0 }),
          },
        }), // Balanced: hitRate=20/20=1.0, crRate=26/28=0.929 -> 0.964
      ];
      // Avg = (0.864 + 0.964) / 2 = 0.914 -> 91%
      const history = UserHistory.fromHistoryItems(items);
      expect(history.avgAccuracy).toBe(91);
      expect(history.bestAccuracy).toBe(96); // 0.964 -> 96%
    });

    test('should return defaults for empty history', () => {
      const history = UserHistory.empty();
      expect(history.avgZone).toBe(1);
      expect(history.bestZone).toBe(1);
      expect(history.avgAccuracy).toBe(0);
      expect(history.bestAccuracy).toBe(0);
    });
  });

  describe('totalPlayTimeMs', () => {
    test('should return 0 for empty history', () => {
      expect(UserHistory.empty().totalPlayTimeMs).toBe(0);
    });

    test('should sum all session durations', () => {
      const items = [
        createSessionHistoryItem({ durationMs: 60000 }),
        createSessionHistoryItem({ durationMs: 90000 }),
        createSessionHistoryItem({ durationMs: 30000 }),
      ];
      const history = UserHistory.fromHistoryItems(items);

      expect(history.totalPlayTimeMs).toBe(180000);
    });
  });

  describe('formattedTotalPlayTime', () => {
    test('should format as minutes only', () => {
      const items = [createSessionHistoryItem({ durationMs: 45 * 60000 })]; // 45 min
      const history = UserHistory.fromHistoryItems(items);

      expect(history.formattedTotalPlayTime).toBe('45min');
    });

    test('should format as hours and minutes', () => {
      const items = [createSessionHistoryItem({ durationMs: 90 * 60000 })]; // 90 min
      const history = UserHistory.fromHistoryItems(items);

      expect(history.formattedTotalPlayTime).toBe('1h 30min');
    });
  });
});

// =============================================================================
// Temporal Analysis Tests
// =============================================================================

describe('Temporal analysis', () => {
  describe('daysSinceLastSession', () => {
    test('should return null for empty history', () => {
      expect(UserHistory.empty().daysSinceLastSession).toBeNull();
    });

    test('should return 0 for session today', () => {
      const items = [createSessionOnDate(new Date())];
      const history = UserHistory.fromHistoryItems(items);

      expect(history.daysSinceLastSession).toBe(0);
    });

    test('should calculate days since last session', () => {
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      const items = [createSessionOnDate(twoDaysAgo)];
      const history = UserHistory.fromHistoryItems(items);

      expect(history.daysSinceLastSession).toBe(2);
    });
  });

  describe('getStreak()', () => {
    test('should return 0 streak for empty history', () => {
      const streak = UserHistory.empty().getStreak();

      expect(streak.current).toBe(0);
      expect(streak.best).toBe(0);
      expect(streak.lastActiveDate).toBeNull();
    });

    test('should return 1 for single session today', () => {
      const items = [createSessionOnDate(new Date())];
      const history = UserHistory.fromHistoryItems(items);
      const streak = history.getStreak();

      expect(streak.current).toBe(1);
    });

    test('should count consecutive days', () => {
      const today = new Date();
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

      const items = [
        createSessionOnDate(today),
        createSessionOnDate(yesterday),
        createSessionOnDate(twoDaysAgo),
      ];
      const history = UserHistory.fromHistoryItems(items);
      const streak = history.getStreak();

      expect(streak.current).toBe(3);
    });

    test('should break streak on gap', () => {
      const today = new Date();
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

      const items = [
        createSessionOnDate(today),
        createSessionOnDate(threeDaysAgo), // Gap of 2 days
      ];
      const history = UserHistory.fromHistoryItems(items);
      const streak = history.getStreak();

      expect(streak.current).toBe(1);
    });

    test('should track best streak', () => {
      const today = new Date();
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      // 10-day gap
      const elevenDaysAgo = new Date(Date.now() - 11 * 24 * 60 * 60 * 1000);
      const twelveDaysAgo = new Date(Date.now() - 12 * 24 * 60 * 60 * 1000);
      const thirteenDaysAgo = new Date(Date.now() - 13 * 24 * 60 * 60 * 1000);
      const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

      const items = [
        createSessionOnDate(today),
        createSessionOnDate(yesterday),
        // Gap
        createSessionOnDate(elevenDaysAgo),
        createSessionOnDate(twelveDaysAgo),
        createSessionOnDate(thirteenDaysAgo),
        createSessionOnDate(fourteenDaysAgo),
      ];
      const history = UserHistory.fromHistoryItems(items);
      const streak = history.getStreak();

      expect(streak.current).toBe(2);
      expect(streak.best).toBe(4);
    });
  });

  describe('getDailyStats()', () => {
    test('should return stats for specified days', () => {
      const history = UserHistory.empty();
      const stats = history.getDailyStats(7);

      expect(stats.length).toBe(7);
    });

    test('should group sessions by date', () => {
      const today = new Date();
      const items = [
        createSessionOnDate(today, 1.0),
        createSessionOnDate(today, 2.0),
        createSessionOnDate(today, 3.0),
      ];
      const history = UserHistory.fromHistoryItems(items);
      const stats = history.getDailyStats(1);

      const todayStats = stats[0];
      expect(todayStats?.sessionsCount).toBe(3);
      expect(todayStats?.avgDPrime).toBe(2.0);
      expect(todayStats?.bestDPrime).toBe(3.0);
    });

    test('should return 0 for days without sessions', () => {
      const history = UserHistory.empty();
      const stats = history.getDailyStats(7);

      for (const day of stats) {
        expect(day.sessionsCount).toBe(0);
        expect(day.avgDPrime).toBe(0);
        expect(day.bestDPrime).toBe(0);
      }
    });
  });
});

// =============================================================================
// Trend Analysis Tests
// =============================================================================

describe('Trend analysis', () => {
  describe('getTrend()', () => {
    test('should return stable with low confidence for few sessions', () => {
      const items = [
        createSessionHistoryItem({ dPrime: 1.5 }),
        createSessionHistoryItem({ dPrime: 1.6 }),
      ];
      const history = UserHistory.fromHistoryItems(items);
      const trend = history.getTrend();

      expect(trend.direction).toBe('stable');
      expect(trend.confidence).toBe('low');
    });

    test('should detect improving trend', () => {
      const now = new Date();
      // Recent sessions (better performance)
      const recentSessions = Array.from({ length: 5 }, (_, i) =>
        createSessionHistoryItem({
          createdAt: new Date(now.getTime() - i * 60000),
          dPrime: 2.5,
        }),
      );
      // Older sessions (worse performance)
      const olderSessions = Array.from({ length: 10 }, (_, i) =>
        createSessionHistoryItem({
          createdAt: new Date(now.getTime() - (i + 10) * 3600000),
          dPrime: 1.5,
        }),
      );

      const history = UserHistory.fromHistoryItems([...recentSessions, ...olderSessions]);
      const trend = history.getTrend();

      expect(trend.direction).toBe('improving');
      expect(trend.changePercent).toBeGreaterThan(10);
    });

    test('should detect declining trend', () => {
      const now = new Date();
      // Recent sessions (worse performance)
      const recentSessions = Array.from({ length: 5 }, (_, i) =>
        createSessionHistoryItem({
          createdAt: new Date(now.getTime() - i * 60000),
          dPrime: 1.0,
        }),
      );
      // Older sessions (better performance)
      const olderSessions = Array.from({ length: 10 }, (_, i) =>
        createSessionHistoryItem({
          createdAt: new Date(now.getTime() - (i + 10) * 3600000),
          dPrime: 2.0,
        }),
      );

      const history = UserHistory.fromHistoryItems([...recentSessions, ...olderSessions]);
      const trend = history.getTrend();

      expect(trend.direction).toBe('declining');
      expect(trend.changePercent).toBeLessThan(-10);
    });

    test('should have high confidence with 20+ sessions', () => {
      const sessions = Array.from({ length: 25 }, (_, i) =>
        createSessionHistoryItem({
          createdAt: new Date(Date.now() - i * 3600000),
          dPrime: 1.5,
        }),
      );
      const history = UserHistory.fromHistoryItems(sessions);
      const trend = history.getTrend();

      expect(trend.confidence).toBe('high');
    });
  });

  describe('isPlateauing()', () => {
    test('should return false with less than 5 sessions', () => {
      const items = [
        createSessionHistoryItem({ dPrime: 1.5 }),
        createSessionHistoryItem({ dPrime: 1.5 }),
      ];
      const history = UserHistory.fromHistoryItems(items);

      expect(history.isPlateauing()).toBe(false);
    });

    test('should return true when d-prime variance is low', () => {
      const now = new Date();
      const items = Array.from({ length: 5 }, (_, i) =>
        createSessionHistoryItem({
          createdAt: new Date(now.getTime() - i * 60000),
          dPrime: 1.5 + (i % 2 === 0 ? 0.005 : -0.005), // Very small deterministic variance
        }),
      );
      const history = UserHistory.fromHistoryItems(items);

      expect(history.isPlateauing(0.1)).toBe(true);
    });

    test('should return false when d-prime varies significantly', () => {
      const now = new Date();
      const items = [
        createSessionHistoryItem({ createdAt: new Date(now.getTime()), dPrime: 1.0 }),
        createSessionHistoryItem({ createdAt: new Date(now.getTime() - 60000), dPrime: 2.0 }),
        createSessionHistoryItem({ createdAt: new Date(now.getTime() - 120000), dPrime: 1.5 }),
        createSessionHistoryItem({ createdAt: new Date(now.getTime() - 180000), dPrime: 2.5 }),
        createSessionHistoryItem({ createdAt: new Date(now.getTime() - 240000), dPrime: 1.0 }),
      ];
      const history = UserHistory.fromHistoryItems(items);

      expect(history.isPlateauing()).toBe(false);
    });
  });
});

// =============================================================================
// Accuracy Metrics Tests
// =============================================================================

describe('Accuracy metrics', () => {
  describe('positionAccuracy', () => {
    test('should return 0 for empty history', () => {
      expect(UserHistory.empty().positionAccuracy).toBe(0);
    });

    test('should calculate average position accuracy', () => {
      const items = [
        createSessionHistoryItem({
          byModality: {
            position: createHistoryModalityStats({ hits: 8, misses: 2 }), // 80%
            audio: createHistoryModalityStats(),
          },
        }),
        createSessionHistoryItem({
          byModality: {
            position: createHistoryModalityStats({ hits: 6, misses: 4 }), // 60%
            audio: createHistoryModalityStats(),
          },
        }),
      ];
      const history = UserHistory.fromHistoryItems(items);

      expect(history.positionAccuracy).toBe(70); // Average of 80% and 60%
    });
  });

  describe('audioAccuracy', () => {
    test('should return 0 for empty history', () => {
      expect(UserHistory.empty().audioAccuracy).toBe(0);
    });

    test('should calculate average audio accuracy', () => {
      const items = [
        createSessionHistoryItem({
          byModality: {
            position: createHistoryModalityStats(),
            audio: createHistoryModalityStats({ hits: 9, misses: 1 }), // 90%
          },
        }),
        createSessionHistoryItem({
          byModality: {
            position: createHistoryModalityStats(),
            audio: createHistoryModalityStats({ hits: 7, misses: 3 }), // 70%
          },
        }),
      ];
      const history = UserHistory.fromHistoryItems(items);

      expect(history.audioAccuracy).toBe(80);
    });
  });

  describe('overallAccuracy', () => {
    test('should return 0 for empty history', () => {
      expect(UserHistory.empty().overallAccuracy).toBe(0);
    });

    test('should average position and audio accuracy', () => {
      const items = [
        createSessionHistoryItem({
          byModality: {
            position: createHistoryModalityStats({ hits: 8, misses: 2 }), // 80%
            audio: createHistoryModalityStats({ hits: 6, misses: 4 }), // 60%
          },
        }),
      ];
      const history = UserHistory.fromHistoryItems(items);

      expect(history.overallAccuracy).toBe(70);
    });
  });

  describe('avgPositionRT', () => {
    test('should return null for empty history', () => {
      expect(UserHistory.empty().avgPositionRT).toBeNull();
    });

    test('should calculate average reaction time', () => {
      const items = [
        createSessionHistoryItem({
          byModality: {
            position: createHistoryModalityStats({ avgRT: 300 }),
            audio: createHistoryModalityStats(),
          },
        }),
        createSessionHistoryItem({
          byModality: {
            position: createHistoryModalityStats({ avgRT: 400 }),
            audio: createHistoryModalityStats(),
          },
        }),
      ];
      const history = UserHistory.fromHistoryItems(items);

      expect(history.avgPositionRT).toBe(350);
    });

    test('should filter out null RTs', () => {
      const items = [
        createSessionHistoryItem({
          byModality: {
            position: createHistoryModalityStats({ avgRT: 300 }),
            audio: createHistoryModalityStats(),
          },
        }),
        createSessionHistoryItem({
          byModality: {
            position: createHistoryModalityStats({ avgRT: null }),
            audio: createHistoryModalityStats(),
          },
        }),
      ];
      const history = UserHistory.fromHistoryItems(items);

      expect(history.avgPositionRT).toBe(300);
    });
  });

  describe('avgAudioRT', () => {
    test('should return null for empty history', () => {
      expect(UserHistory.empty().avgAudioRT).toBeNull();
    });

    test('should calculate average audio reaction time', () => {
      const items = [
        createSessionHistoryItem({
          byModality: {
            position: createHistoryModalityStats(),
            audio: createHistoryModalityStats({ avgRT: 350 }),
          },
        }),
        createSessionHistoryItem({
          byModality: {
            position: createHistoryModalityStats(),
            audio: createHistoryModalityStats({ avgRT: 450 }),
          },
        }),
      ];
      const history = UserHistory.fromHistoryItems(items);

      expect(history.avgAudioRT).toBe(400);
    });
  });
});

// =============================================================================
// Advanced Analysis Tests
// =============================================================================

describe('Advanced analysis', () => {
  describe('getBestHourOfDay()', () => {
    test('should return null with few sessions', () => {
      const items = [createSessionHistoryItem()];
      const history = UserHistory.fromHistoryItems(items);

      expect(history.getBestHourOfDay()).toBeNull();
    });

    test('should find best performing hour', () => {
      // Sessions at 10am performing well
      const morning = Array.from({ length: 3 }, () =>
        createSessionHistoryItem({
          createdAt: new Date('2024-06-15T10:00:00'),
          dPrime: 2.5,
        }),
      );
      // Sessions at 2pm performing worse
      const afternoon = Array.from({ length: 3 }, () =>
        createSessionHistoryItem({
          createdAt: new Date('2024-06-15T14:00:00'),
          dPrime: 1.5,
        }),
      );

      const history = UserHistory.fromHistoryItems([...morning, ...afternoon]);
      const best = history.getBestHourOfDay();

      expect(best?.hour).toBe(10);
      expect(best?.avgDPrime).toBe(2.5);
    });

    test('should require at least 2 sessions at an hour', () => {
      const items = [
        createSessionHistoryItem({
          createdAt: new Date('2024-06-15T10:00:00'),
          dPrime: 3.0, // High but only 1 session
        }),
        createSessionHistoryItem({
          createdAt: new Date('2024-06-15T14:00:00'),
          dPrime: 2.0,
        }),
        createSessionHistoryItem({
          createdAt: new Date('2024-06-16T14:00:00'),
          dPrime: 2.0,
        }),
        createSessionHistoryItem({
          createdAt: new Date('2024-06-17T14:00:00'),
          dPrime: 2.0,
        }),
        createSessionHistoryItem({
          createdAt: new Date('2024-06-18T14:00:00'),
          dPrime: 2.0,
        }),
      ];
      const history = UserHistory.fromHistoryItems(items);
      const best = history.getBestHourOfDay();

      expect(best?.hour).toBe(14); // 2pm has more sessions
    });
  });

  describe('progressToNextLevel()', () => {
    test('should return 0 for empty history', () => {
      expect(UserHistory.empty().progressToNextLevel()).toBe(0);
    });

    test('should return 100 when d-prime >= 1.5', () => {
      const items = [createSessionHistoryItem({ dPrime: 2.0 })];
      const history = UserHistory.fromHistoryItems(items);

      expect(history.progressToNextLevel()).toBe(100);
    });

    test('should calculate percentage for d-prime < 1.5', () => {
      const items = [createSessionHistoryItem({ dPrime: 0.75 })];
      const history = UserHistory.fromHistoryItems(items);

      expect(history.progressToNextLevel()).toBe(50); // 0.75 / 1.5 = 50%
    });

    test('should return 0 for negative d-prime', () => {
      const items = [createSessionHistoryItem({ dPrime: -0.5 })];
      const history = UserHistory.fromHistoryItems(items);

      expect(history.progressToNextLevel()).toBe(0);
    });
  });

  describe('passedSessionsCount', () => {
    test('should count sessions with d-prime >= 1.5', () => {
      const items = [
        createSessionHistoryItem({ dPrime: 2.0, passed: true }),
        createSessionHistoryItem({ dPrime: 1.0, passed: false }),
        createSessionHistoryItem({ dPrime: 1.8, passed: true }),
      ];
      const history = UserHistory.fromHistoryItems(items);

      expect(history.passedSessionsCount).toBe(2);
    });
  });

  describe('passRate', () => {
    test('should return 0 for empty history', () => {
      expect(UserHistory.empty().passRate).toBe(0);
    });

    test('should calculate pass percentage', () => {
      const items = [
        createSessionHistoryItem({ dPrime: 2.0, passed: true }),
        createSessionHistoryItem({ dPrime: 1.0, passed: false }),
        createSessionHistoryItem({ dPrime: 1.8, passed: true }),
        createSessionHistoryItem({ dPrime: 0.5, passed: false }),
      ];
      const history = UserHistory.fromHistoryItems(items);

      expect(history.passRate).toBe(50);
    });
  });
});
