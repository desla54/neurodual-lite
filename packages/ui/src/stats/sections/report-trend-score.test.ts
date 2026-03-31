import { describe, expect, it } from 'bun:test';
import type { SessionHistoryItem } from '@neurodual/logic';
import {
  computeDualnbackClassicErrorRatePercent,
  getHistoryTrendScore,
  getTrendDirection,
  resolveTrendMetricContext,
} from './report-trend-score';

type MinimalHistorySession = Pick<
  SessionHistoryItem,
  'byModality' | 'upsAccuracy' | 'unifiedMetrics' | 'dPrime'
>;

function createHistorySession(
  overrides: Partial<MinimalHistorySession> = {},
): MinimalHistorySession {
  return {
    byModality: {
      position: {
        hits: 5,
        misses: 1,
        falseAlarms: 1,
        correctRejections: 4,
        avgRT: 800,
        dPrime: 1.2,
      },
      audio: {
        hits: 5,
        misses: 1,
        falseAlarms: 0,
        correctRejections: 5,
        avgRT: 850,
        dPrime: 1.1,
      },
    },
    unifiedMetrics: {
      accuracy: 0.9,
      nLevel: 3,
      zone: 1,
      zoneProgress: 0,
    },
    dPrime: 1.8,
    ...overrides,
  };
}

describe('report-trend native scoring', () => {
  it('computes dualnback-classic error rate from byModality (CR excluded)', () => {
    const session = createHistorySession({
      byModality: {
        position: {
          hits: 1,
          misses: 3,
          falseAlarms: 1,
          correctRejections: 99,
          avgRT: 700,
          dPrime: 0.3,
        },
      },
      unifiedMetrics: {
        accuracy: 0.98,
        nLevel: 3,
        zone: 1,
        zoneProgress: 0,
      },
    });

    expect(computeDualnbackClassicErrorRatePercent(session)).toBe(80);
  });

  it('falls back to UPS accuracy when byModality is unavailable', () => {
    const session = createHistorySession({
      byModality: {},
      upsAccuracy: 73,
      unifiedMetrics: {
        accuracy: 0.95,
        nLevel: 3,
        zone: 1,
        zoneProgress: 0,
      },
    });

    expect(computeDualnbackClassicErrorRatePercent(session)).toBe(27);
  });

  it('uses lower-is-better direction for dualnback-classic', () => {
    const context = resolveTrendMetricContext({
      gameMode: 'dualnback-classic',
      modeScore: {
        labelKey: 'report.modeScore.jaeggiErrors',
        value: 18,
        unit: '%',
      },
    });

    expect(context.lowerIsBetter).toBe(true);
    expect(getTrendDirection(15, 20, context.lowerIsBetter, context.stableDeltaThreshold)).toBe(
      'improving',
    );
    expect(getTrendDirection(26, 20, context.lowerIsBetter, context.stableDeltaThreshold)).toBe(
      'declining',
    );
  });

  it('uses d-prime value for SDT trend history', () => {
    const session = createHistorySession({ dPrime: 2.3 });
    const score = getHistoryTrendScore(session, 'sdt');
    expect(score).toBe(2.3);
  });
});
