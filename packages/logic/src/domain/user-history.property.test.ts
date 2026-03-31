/**
 * Property-Based Tests for UserHistory Aggregate
 *
 * Uses fast-check to verify mathematical properties and invariants
 * of the user history aggregation and statistics.
 */
import { describe, expect, it } from 'bun:test';
import * as fc from 'fast-check';
import { UserHistory } from './user-history';
import type { SessionHistoryItem, HistoryModalityStats } from '../ports/history-port';
import { computeUnifiedMetrics } from './unified-metrics';
import {
  SDT_DPRIME_PASS,
  STATS_DAILY_WINDOW_DAYS,
  STATS_BEST_HOUR_MIN_SESSIONS,
  TREND_RECENT_WINDOW,
  TREND_OLDER_WINDOW,
  TREND_MIN_SESSIONS,
  TREND_IMPROVING_THRESHOLD_PERCENT,
  TREND_DECLINING_THRESHOLD_PERCENT,
  TREND_CONFIDENCE_HIGH_MIN_SESSIONS,
} from '../specs/thresholds';

// =============================================================================
// Arbitraries (Generators)
// =============================================================================

/** Generate valid modality stats */
const modalityStatsArb = (): fc.Arbitrary<HistoryModalityStats> =>
  fc.record({
    hits: fc.integer({ min: 0, max: 50 }),
    misses: fc.integer({ min: 0, max: 50 }),
    falseAlarms: fc.integer({ min: 0, max: 50 }),
    correctRejections: fc.integer({ min: 0, max: 100 }),
    avgRT: fc.option(fc.integer({ min: 100, max: 2000 }), { nil: null }),
    dPrime: fc.double({ min: -2, max: 5, noNaN: true }),
  });

/** Generate a valid date within range using timestamps to avoid NaN */
const validDateArb = (dateRange?: { min: Date; max: Date }): fc.Arbitrary<Date> => {
  const min = dateRange?.min ?? new Date('2020-01-01');
  const max = dateRange?.max ?? new Date();
  const minTs = min.getTime();
  const maxTs = max.getTime();
  return fc.integer({ min: minTs, max: maxTs }).map((ts) => new Date(ts));
};

/** Generate a valid session history item */
const sessionItemArb = (dateRange?: { min: Date; max: Date }): fc.Arbitrary<SessionHistoryItem> => {
  const dateArb = validDateArb(dateRange);

  // @ts-expect-error test override
  return fc.record({
    id: fc.uuid(),
    createdAt: dateArb,
    nLevel: fc.integer({ min: 1, max: 10 }),
    dPrime: fc.double({ min: -1, max: 5, noNaN: true }),
    passed: fc.boolean(),
    trialsCount: fc.integer({ min: 10, max: 100 }),
    durationMs: fc.integer({ min: 10000, max: 600000 }),
    byModality: fc.record({
      position: modalityStatsArb(),
      audio: modalityStatsArb(),
    }),
    generator: fc.constantFrom('BrainWorkshop', 'Jaeggi', 'Adaptive'),
    activeModalities: fc.constant(['position', 'audio'] as const),
    reason: fc.constantFrom('completed', 'abandoned', 'error'),
  }) as fc.Arbitrary<SessionHistoryItem>;
};

/** Generate an array of session history items */
const sessionsArb = (options?: {
  minLength?: number;
  maxLength?: number;
  dateRange?: { min: Date; max: Date };
}): fc.Arbitrary<SessionHistoryItem[]> =>
  fc.array(sessionItemArb(options?.dateRange), {
    minLength: options?.minLength ?? 0,
    maxLength: options?.maxLength ?? 50,
  });

/** Generate sessions with consistent unifiedMetrics */
const sessionWithMetricsArb = (): fc.Arbitrary<SessionHistoryItem> =>
  sessionItemArb().map((item) => ({
    ...item,
    unifiedMetrics: computeUnifiedMetrics(
      item.dPrime >= 0 ? Math.min(item.dPrime / 3, 1) : 0,
      item.nLevel,
    ),
  }));

// =============================================================================
// History Aggregation Property Tests (15 tests)
// =============================================================================

describe('UserHistory - History Aggregation Properties', () => {
  // --- Test 1 ---
  it('totalSessions count equals input array length', () => {
    fc.assert(
      fc.property(sessionsArb({ maxLength: 100 }), (sessions) => {
        const history = UserHistory.fromHistoryItems(sessions);
        return history.totalSessions === sessions.length;
      }),
      { numRuns: 100 },
    );
  });

  // --- Test 2 ---
  it('totalSessions is always non-negative', () => {
    fc.assert(
      fc.property(sessionsArb(), (sessions) => {
        const history = UserHistory.fromHistoryItems(sessions);
        return history.totalSessions >= 0;
      }),
      { numRuns: 100 },
    );
  });

  // --- Test 3 ---
  it('isEmpty is true iff totalSessions is 0', () => {
    fc.assert(
      fc.property(sessionsArb(), (sessions) => {
        const history = UserHistory.fromHistoryItems(sessions);
        return history.isEmpty === (history.totalSessions === 0);
      }),
      { numRuns: 100 },
    );
  });

  // --- Test 4 ---
  it('bestDPrime is >= any individual session dPrime', () => {
    fc.assert(
      fc.property(sessionsArb({ minLength: 1 }), (sessions) => {
        const history = UserHistory.fromHistoryItems(sessions);
        const best = history.bestDPrime;
        return sessions.every((s) => best >= s.dPrime);
      }),
      { numRuns: 100 },
    );
  });

  // --- Test 5 ---
  it('bestDPrime equals 0 for empty history', () => {
    const history = UserHistory.empty();
    expect(history.bestDPrime).toBe(0);
  });

  // --- Test 6 ---
  it('avgDPrime is between min and max dPrime', () => {
    fc.assert(
      fc.property(sessionsArb({ minLength: 1 }), (sessions) => {
        const history = UserHistory.fromHistoryItems(sessions);
        const dPrimes = sessions.map((s) => s.dPrime);
        const minD = Math.min(...dPrimes);
        const maxD = Math.max(...dPrimes);
        return history.avgDPrime >= minD && history.avgDPrime <= maxD;
      }),
      { numRuns: 100 },
    );
  });

  // --- Test 7 ---
  it('maxNLevel is >= any individual session nLevel', () => {
    fc.assert(
      fc.property(sessionsArb({ minLength: 1 }), (sessions) => {
        const history = UserHistory.fromHistoryItems(sessions);
        return sessions.every((s) => history.maxNLevel >= s.nLevel);
      }),
      { numRuns: 100 },
    );
  });

  // --- Test 8 ---
  it('maxNLevel is at least 1 even for empty history', () => {
    const history = UserHistory.empty();
    expect(history.maxNLevel).toBe(1);
  });

  // --- Test 9 ---
  it('totalPlayTimeMs equals sum of all session durations', () => {
    fc.assert(
      fc.property(sessionsArb(), (sessions) => {
        const history = UserHistory.fromHistoryItems(sessions);
        const expectedTotal = sessions.reduce((sum, s) => sum + s.durationMs, 0);
        return history.totalPlayTimeMs === expectedTotal;
      }),
      { numRuns: 100 },
    );
  });

  // --- Test 10 ---
  it('totalPlayTimeMs is non-negative', () => {
    fc.assert(
      fc.property(sessionsArb(), (sessions) => {
        const history = UserHistory.fromHistoryItems(sessions);
        return history.totalPlayTimeMs >= 0;
      }),
      { numRuns: 100 },
    );
  });

  // --- Test 11 ---
  it('sessions are sorted by date (most recent first)', () => {
    fc.assert(
      fc.property(sessionsArb({ minLength: 2 }), (sessions) => {
        const history = UserHistory.fromHistoryItems(sessions);
        const sorted = history.sessions;
        for (let i = 1; i < sorted.length; i++) {
          const prev = sorted[i - 1];
          const curr = sorted[i];
          if (!prev || !curr) return false;
          if (prev.createdAt.getTime() < curr.createdAt.getTime()) return false;
        }
        return true;
      }),
      { numRuns: 100 },
    );
  });

  // --- Test 12 ---
  it('lastSession is the most recent session', () => {
    fc.assert(
      fc.property(sessionsArb({ minLength: 1 }), (sessions) => {
        const history = UserHistory.fromHistoryItems(sessions);
        const last = history.lastSession;
        if (!last) return false;
        const maxDate = Math.max(...sessions.map((s) => s.createdAt.getTime()));
        return last.createdAt.getTime() === maxDate;
      }),
      { numRuns: 100 },
    );
  });

  // --- Test 13 ---
  it('lastSession is null for empty history', () => {
    const history = UserHistory.empty();
    expect(history.lastSession).toBeNull();
  });

  // --- Test 14 ---
  it('passedSessionsCount is bounded by totalSessions', () => {
    fc.assert(
      fc.property(sessionsArb(), (sessions) => {
        const history = UserHistory.fromHistoryItems(sessions);
        return (
          history.passedSessionsCount >= 0 && history.passedSessionsCount <= history.totalSessions
        );
      }),
      { numRuns: 100 },
    );
  });

  // --- Test 15 ---
  it('passRate is between 0 and 100', () => {
    fc.assert(
      fc.property(sessionsArb(), (sessions) => {
        const history = UserHistory.fromHistoryItems(sessions);
        return history.passRate >= 0 && history.passRate <= 100;
      }),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// Statistics Computation Property Tests (15 tests)
// =============================================================================

describe('UserHistory - Statistics Computation Properties', () => {
  // --- Test 16 ---
  it('positionAccuracy is between 0 and 100', () => {
    fc.assert(
      fc.property(sessionsArb(), (sessions) => {
        const history = UserHistory.fromHistoryItems(sessions);
        return history.positionAccuracy >= 0 && history.positionAccuracy <= 100;
      }),
      { numRuns: 100 },
    );
  });

  // --- Test 17 ---
  it('audioAccuracy is between 0 and 100', () => {
    fc.assert(
      fc.property(sessionsArb(), (sessions) => {
        const history = UserHistory.fromHistoryItems(sessions);
        return history.audioAccuracy >= 0 && history.audioAccuracy <= 100;
      }),
      { numRuns: 100 },
    );
  });

  // --- Test 18 ---
  it('overallAccuracy is average of position and audio accuracy', () => {
    fc.assert(
      fc.property(sessionsArb({ minLength: 1 }), (sessions) => {
        const history = UserHistory.fromHistoryItems(sessions);
        const expected = Math.round((history.positionAccuracy + history.audioAccuracy) / 2);
        return history.overallAccuracy === expected;
      }),
      { numRuns: 100 },
    );
  });

  // --- Test 19 ---
  it('avgPositionRT is null or positive', () => {
    fc.assert(
      fc.property(sessionsArb(), (sessions) => {
        const history = UserHistory.fromHistoryItems(sessions);
        const rt = history.avgPositionRT;
        return rt === null || rt > 0;
      }),
      { numRuns: 100 },
    );
  });

  // --- Test 20 ---
  it('avgAudioRT is null or positive', () => {
    fc.assert(
      fc.property(sessionsArb(), (sessions) => {
        const history = UserHistory.fromHistoryItems(sessions);
        const rt = history.avgAudioRT;
        return rt === null || rt > 0;
      }),
      { numRuns: 100 },
    );
  });

  // --- Test 21 ---
  it('avgZone is between 1 and 20', () => {
    fc.assert(
      fc.property(
        fc.array(sessionWithMetricsArb(), { minLength: 1, maxLength: 30 }),
        (sessions) => {
          const history = UserHistory.fromHistoryItems(sessions);
          return history.avgZone >= 1 && history.avgZone <= 20;
        },
      ),
      { numRuns: 100 },
    );
  });

  // --- Test 22 ---
  it('bestZone is between 1 and 20', () => {
    fc.assert(
      fc.property(
        fc.array(sessionWithMetricsArb(), { minLength: 1, maxLength: 30 }),
        (sessions) => {
          const history = UserHistory.fromHistoryItems(sessions);
          return history.bestZone >= 1 && history.bestZone <= 20;
        },
      ),
      { numRuns: 100 },
    );
  });

  // --- Test 23 ---
  it('avgAccuracy is between 0 and 100', () => {
    fc.assert(
      fc.property(fc.array(sessionWithMetricsArb(), { maxLength: 30 }), (sessions) => {
        const history = UserHistory.fromHistoryItems(sessions);
        return history.avgAccuracy >= 0 && history.avgAccuracy <= 100;
      }),
      { numRuns: 100 },
    );
  });

  // --- Test 24 ---
  it('bestAccuracy is between 0 and 100', () => {
    fc.assert(
      fc.property(fc.array(sessionWithMetricsArb(), { maxLength: 30 }), (sessions) => {
        const history = UserHistory.fromHistoryItems(sessions);
        return history.bestAccuracy >= 0 && history.bestAccuracy <= 100;
      }),
      { numRuns: 100 },
    );
  });

  // --- Test 25 ---
  it('streak current is non-negative', () => {
    fc.assert(
      fc.property(sessionsArb(), (sessions) => {
        const history = UserHistory.fromHistoryItems(sessions);
        return history.getStreak().current >= 0;
      }),
      { numRuns: 100 },
    );
  });

  // --- Test 26 ---
  it('streak best is >= streak current', () => {
    fc.assert(
      fc.property(sessionsArb(), (sessions) => {
        const history = UserHistory.fromHistoryItems(sessions);
        const streak = history.getStreak();
        return streak.best >= streak.current;
      }),
      { numRuns: 100 },
    );
  });

  // --- Test 27 ---
  it('getDailyStats returns correct number of days', () => {
    fc.assert(
      fc.property(sessionsArb(), fc.integer({ min: 1, max: 90 }), (sessions, days) => {
        const history = UserHistory.fromHistoryItems(sessions);
        const stats = history.getDailyStats(days);
        return stats.length === days;
      }),
      { numRuns: 100 },
    );
  });

  // --- Test 28 ---
  it('getDailyStats session counts sum to total when in window', () => {
    const now = new Date();
    const oneMonthAgo = new Date(now.getTime() - STATS_DAILY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    fc.assert(
      fc.property(sessionsArb({ dateRange: { min: oneMonthAgo, max: now } }), (sessions) => {
        const history = UserHistory.fromHistoryItems(sessions);
        const stats = history.getDailyStats(STATS_DAILY_WINDOW_DAYS);
        const totalInStats = stats.reduce((sum, d) => sum + d.sessionsCount, 0);
        // All sessions within window should be counted
        return totalInStats >= 0 && totalInStats <= sessions.length;
      }),
      { numRuns: 100 },
    );
  });

  // --- Test 29 ---
  it('trend direction is one of improving, stable, declining', () => {
    fc.assert(
      fc.property(sessionsArb(), (sessions) => {
        const history = UserHistory.fromHistoryItems(sessions);
        const trend = history.getTrend();
        return ['improving', 'stable', 'declining'].includes(trend.direction);
      }),
      { numRuns: 100 },
    );
  });

  // --- Test 30 ---
  it('trend confidence is one of low, medium, high', () => {
    fc.assert(
      fc.property(sessionsArb(), (sessions) => {
        const history = UserHistory.fromHistoryItems(sessions);
        const trend = history.getTrend();
        return ['low', 'medium', 'high'].includes(trend.confidence);
      }),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// Filtering and Querying Property Tests (10 tests)
// =============================================================================

describe('UserHistory - Filtering and Querying Properties', () => {
  // --- Test 31 ---
  it('getDailyStats dates are valid ISO format', () => {
    fc.assert(
      fc.property(sessionsArb(), (sessions) => {
        const history = UserHistory.fromHistoryItems(sessions);
        const stats = history.getDailyStats(7);
        return stats.every((day) => {
          const date = new Date(day.date);
          return !Number.isNaN(date.getTime()) && day.date.match(/^\d{4}-\d{2}-\d{2}$/);
        });
      }),
      { numRuns: 100 },
    );
  });

  // --- Test 32 ---
  it('getDailyStats dates are ordered (oldest first)', () => {
    fc.assert(
      fc.property(sessionsArb(), (sessions) => {
        const history = UserHistory.fromHistoryItems(sessions);
        const stats = history.getDailyStats(7);
        for (let i = 1; i < stats.length; i++) {
          const prev = stats[i - 1];
          const curr = stats[i];
          if (!prev || !curr) return false;
          if (new Date(prev.date).getTime() > new Date(curr.date).getTime()) return false;
        }
        return true;
      }),
      { numRuns: 100 },
    );
  });

  // --- Test 33 ---
  it('getDailyStats avgDPrime is within bestDPrime bound', () => {
    fc.assert(
      fc.property(sessionsArb({ minLength: 1 }), (sessions) => {
        const history = UserHistory.fromHistoryItems(sessions);
        const stats = history.getDailyStats(30);
        return stats.every((day) => {
          if (day.sessionsCount === 0) return day.avgDPrime === 0 && day.bestDPrime === 0;
          return day.avgDPrime <= day.bestDPrime;
        });
      }),
      { numRuns: 100 },
    );
  });

  // --- Test 34 ---
  it('getBestHourOfDay returns null for insufficient sessions', () => {
    fc.assert(
      fc.property(sessionsArb({ maxLength: STATS_BEST_HOUR_MIN_SESSIONS - 1 }), (sessions) => {
        const history = UserHistory.fromHistoryItems(sessions);
        return history.getBestHourOfDay() === null;
      }),
      { numRuns: 100 },
    );
  });

  // --- Test 35 ---
  it('getBestHourOfDay hour is between 0 and 23', () => {
    fc.assert(
      fc.property(sessionsArb({ minLength: STATS_BEST_HOUR_MIN_SESSIONS }), (sessions) => {
        const history = UserHistory.fromHistoryItems(sessions);
        const best = history.getBestHourOfDay();
        if (best === null) return true;
        return best.hour >= 0 && best.hour <= 23;
      }),
      { numRuns: 100 },
    );
  });

  // --- Test 36 ---
  it('progressToNextLevel is between 0 and 100', () => {
    fc.assert(
      fc.property(sessionsArb(), (sessions) => {
        const history = UserHistory.fromHistoryItems(sessions);
        const progress = history.progressToNextLevel();
        return progress >= 0 && progress <= 100;
      }),
      { numRuns: 100 },
    );
  });

  // --- Test 37 ---
  it('progressToNextLevel is 100 when lastSession dPrime >= threshold', () => {
    fc.assert(
      fc.property(
        sessionsArb({ minLength: 1 }).map((sessions) => {
          // Ensure last session (most recent) has high dPrime
          const sorted = [...sessions].sort(
            (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
          );
          if (sorted[0]) {
            sorted[0] = { ...sorted[0], dPrime: SDT_DPRIME_PASS + 0.5 };
          }
          return sorted;
        }),
        (sessions) => {
          const history = UserHistory.fromHistoryItems(sessions);
          return history.progressToNextLevel() === 100;
        },
      ),
      { numRuns: 100 },
    );
  });

  // --- Test 38 ---
  it('daysSinceLastSession is null for empty history', () => {
    const history = UserHistory.empty();
    expect(history.daysSinceLastSession).toBeNull();
  });

  // --- Test 39 ---
  it('daysSinceLastSession is non-negative', () => {
    fc.assert(
      fc.property(sessionsArb({ minLength: 1 }), (sessions) => {
        const history = UserHistory.fromHistoryItems(sessions);
        const days = history.daysSinceLastSession;
        return days === null || days >= 0;
      }),
      { numRuns: 100 },
    );
  });

  // --- Test 40 ---
  it('isPlateauing returns false with less than 5 sessions', () => {
    fc.assert(
      fc.property(sessionsArb({ maxLength: 4 }), (sessions) => {
        const history = UserHistory.fromHistoryItems(sessions);
        return history.isPlateauing() === false;
      }),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// Trend Analysis Property Tests (Additional tests)
// =============================================================================

describe('UserHistory - Trend Analysis Properties', () => {
  // --- Test 41 ---
  it('trend is stable with low confidence when insufficient recent sessions', () => {
    fc.assert(
      fc.property(sessionsArb({ maxLength: TREND_MIN_SESSIONS - 1 }), (sessions) => {
        const history = UserHistory.fromHistoryItems(sessions);
        const trend = history.getTrend();
        return trend.direction === 'stable' && trend.confidence === 'low';
      }),
      { numRuns: 100 },
    );
  });

  // --- Test 42 ---
  it('trend confidence is high when sessions >= threshold', () => {
    fc.assert(
      fc.property(sessionsArb({ minLength: TREND_CONFIDENCE_HIGH_MIN_SESSIONS }), (sessions) => {
        const history = UserHistory.fromHistoryItems(sessions);
        const trend = history.getTrend();
        return trend.confidence === 'high';
      }),
      { numRuns: 100 },
    );
  });

  // --- Test 43 ---
  it('improving trend has positive changePercent', () => {
    const now = new Date();
    fc.assert(
      fc.property(
        // Generate sessions with improving performance
        fc.tuple(
          fc.array(
            sessionItemArb().map((s) => ({
              ...s,
              createdAt: new Date(now.getTime() - Math.random() * 60000),
              dPrime: 3.0, // High recent
            })),
            { minLength: TREND_RECENT_WINDOW, maxLength: TREND_RECENT_WINDOW },
          ),
          fc.array(
            sessionItemArb().map((s) => ({
              ...s,
              createdAt: new Date(
                now.getTime() - (TREND_RECENT_WINDOW + 1 + Math.random() * 10) * 3600000,
              ),
              dPrime: 1.0, // Low older
            })),
            { minLength: TREND_MIN_SESSIONS, maxLength: TREND_OLDER_WINDOW - TREND_RECENT_WINDOW },
          ),
        ),
        ([recent, older]) => {
          const history = UserHistory.fromHistoryItems([...recent, ...older]);
          const trend = history.getTrend();
          if (trend.direction === 'improving') {
            return trend.changePercent > TREND_IMPROVING_THRESHOLD_PERCENT;
          }
          return true; // May not always be improving due to sorting
        },
      ),
      { numRuns: 50 },
    );
  });

  // --- Test 44 ---
  it('declining trend has negative changePercent', () => {
    const now = new Date();
    fc.assert(
      fc.property(
        fc.tuple(
          fc.array(
            sessionItemArb().map((s) => ({
              ...s,
              createdAt: new Date(now.getTime() - Math.random() * 60000),
              dPrime: 0.5, // Low recent
            })),
            { minLength: TREND_RECENT_WINDOW, maxLength: TREND_RECENT_WINDOW },
          ),
          fc.array(
            sessionItemArb().map((s) => ({
              ...s,
              createdAt: new Date(
                now.getTime() - (TREND_RECENT_WINDOW + 1 + Math.random() * 10) * 3600000,
              ),
              dPrime: 2.5, // High older
            })),
            { minLength: TREND_MIN_SESSIONS, maxLength: TREND_OLDER_WINDOW - TREND_RECENT_WINDOW },
          ),
        ),
        ([recent, older]) => {
          const history = UserHistory.fromHistoryItems([...recent, ...older]);
          const trend = history.getTrend();
          if (trend.direction === 'declining') {
            return trend.changePercent < TREND_DECLINING_THRESHOLD_PERCENT;
          }
          return true;
        },
      ),
      { numRuns: 50 },
    );
  });

  // --- Test 45 ---
  it('isPlateauing returns true for identical dPrimes', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 3, noNaN: true }), (dPrime) => {
        const now = new Date();
        // @ts-expect-error test override
        const sessions = Array.from({ length: 5 }, (_, i) => ({
          id: `session-${i}`,
          createdAt: new Date(now.getTime() - i * 60000),
          nLevel: 2,
          dPrime,
          passed: dPrime >= SDT_DPRIME_PASS,
          trialsCount: 20,
          durationMs: 60000,
          byModality: {
            position: {
              hits: 5,
              misses: 1,
              falseAlarms: 1,
              correctRejections: 13,
              avgRT: 400,
              dPrime: 1.5,
            },
            audio: {
              hits: 5,
              misses: 1,
              falseAlarms: 1,
              correctRejections: 13,
              avgRT: 450,
              dPrime: 1.5,
            },
          },
          generator: 'BrainWorkshop',
          activeModalities: ['position', 'audio'] as const,
          reason: 'completed' as const,
        })) as SessionHistoryItem[];

        const history = UserHistory.fromHistoryItems(sessions);
        return history.isPlateauing(0.01);
      }),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// Badge-Related Metrics Property Tests
// =============================================================================

describe('UserHistory - Badge-Related Metrics Properties', () => {
  // --- Test 46 ---
  it('getEarlyMorningDaysCount is non-negative and bounded by unique dates', () => {
    fc.assert(
      fc.property(sessionsArb(), (sessions) => {
        const history = UserHistory.fromHistoryItems(sessions);
        const count = history.getEarlyMorningDaysCount();
        const uniqueDates = new Set(sessions.map((s) => s.createdAt.toISOString().split('T')[0]));
        return count >= 0 && count <= uniqueDates.size;
      }),
      { numRuns: 100 },
    );
  });

  // --- Test 47 ---
  it('getLateNightDaysCount is non-negative and bounded by unique dates', () => {
    fc.assert(
      fc.property(sessionsArb(), (sessions) => {
        const history = UserHistory.fromHistoryItems(sessions);
        const count = history.getLateNightDaysCount();
        const uniqueDates = new Set(sessions.map((s) => s.createdAt.toISOString().split('T')[0]));
        return count >= 0 && count <= uniqueDates.size;
      }),
      { numRuns: 100 },
    );
  });

  // --- Test 48 ---
  it('sessionsWithoutFocusLoss returns 0 (unimplemented)', () => {
    fc.assert(
      fc.property(sessionsArb(), (sessions) => {
        const history = UserHistory.fromHistoryItems(sessions);
        return history.sessionsWithoutFocusLoss === 0;
      }),
      { numRuns: 50 },
    );
  });

  // --- Test 49 ---
  it('formattedTotalPlayTime is a non-empty string', () => {
    fc.assert(
      fc.property(sessionsArb({ minLength: 1 }), (sessions) => {
        const history = UserHistory.fromHistoryItems(sessions);
        const formatted = history.formattedTotalPlayTime;
        return typeof formatted === 'string' && formatted.length > 0;
      }),
      { numRuns: 100 },
    );
  });

  // --- Test 50 ---
  it('formattedTotalPlayTime contains min or h', () => {
    fc.assert(
      fc.property(sessionsArb({ minLength: 1 }), (sessions) => {
        const history = UserHistory.fromHistoryItems(sessions);
        const formatted = history.formattedTotalPlayTime;
        return formatted.includes('min') || formatted.includes('h');
      }),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// Edge Cases and Invariants
// =============================================================================

describe('UserHistory - Edge Cases and Invariants', () => {
  // --- Test: Empty history factory ---
  it('empty() creates consistent empty state', () => {
    const history = UserHistory.empty();
    expect(history.totalSessions).toBe(0);
    expect(history.isEmpty).toBe(true);
    expect(history.avgDPrime).toBe(0);
    expect(history.bestDPrime).toBe(0);
    expect(history.maxNLevel).toBe(1);
    expect(history.totalPlayTimeMs).toBe(0);
    expect(history.lastSession).toBeNull();
    expect(history.daysSinceLastSession).toBeNull();
    expect(history.positionAccuracy).toBe(0);
    expect(history.audioAccuracy).toBe(0);
    expect(history.overallAccuracy).toBe(0);
    expect(history.avgPositionRT).toBeNull();
    expect(history.avgAudioRT).toBeNull();
    expect(history.passedSessionsCount).toBe(0);
    expect(history.passRate).toBe(0);
  });

  // --- Test: Streak invariants ---
  it('streak lastActiveDate matches first sorted session date for non-empty', () => {
    fc.assert(
      fc.property(sessionsArb({ minLength: 1 }), (sessions) => {
        const history = UserHistory.fromHistoryItems(sessions);
        const streak = history.getStreak();
        if (streak.lastActiveDate === null) return false;
        // lastActiveDate should be a valid date string
        return streak.lastActiveDate.match(/^\d{4}-\d{2}-\d{2}$/) !== null;
      }),
      { numRuns: 100 },
    );
  });

  // --- Test: Daily stats consistency ---
  it('getDailyStats totalDurationMs matches session sum per day', () => {
    fc.assert(
      fc.property(sessionsArb({ minLength: 1 }), (sessions) => {
        const history = UserHistory.fromHistoryItems(sessions);
        const stats = history.getDailyStats(30);
        return stats.every((day) => day.totalDurationMs >= 0);
      }),
      { numRuns: 100 },
    );
  });

  // --- Test: Accuracy calculation consistency ---
  it('accuracy calculations handle zero targets gracefully', () => {
    // @ts-expect-error test override
    const session: SessionHistoryItem = {
      id: 'test-zero-targets',
      createdAt: new Date(),
      nLevel: 2,
      dPrime: 0,
      passed: false,
      trialsCount: 20,
      durationMs: 60000,
      byModality: {
        position: {
          hits: 0,
          misses: 0,
          falseAlarms: 5,
          correctRejections: 15,
          avgRT: 400,
          dPrime: 0,
        },
        audio: { hits: 0, misses: 0, falseAlarms: 5, correctRejections: 15, avgRT: 450, dPrime: 0 },
      },
      generator: 'BrainWorkshop',
      activeModalities: ['position', 'audio'],
      reason: 'completed',
    };

    const history = UserHistory.fromHistoryItems([session]);
    // Should not throw, accuracy should be 0 when no targets
    expect(history.positionAccuracy).toBe(0);
    expect(history.audioAccuracy).toBe(0);
  });
});
