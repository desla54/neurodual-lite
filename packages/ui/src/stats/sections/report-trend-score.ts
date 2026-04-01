import {
  aggregateRawStats,
  computeBrainWorkshopScoreFromRaw,
  getModeScoringStrategy,
  normalizeModeId,
  type SessionEndReportModel,
  type SessionHistoryItem,
} from '@neurodual/logic';

export type TrendDirection = 'improving' | 'stable' | 'declining';
export type TrendMetricUnit = '%' | "d'" | 'score';
export type TrendScoringStrategy = ReturnType<typeof getModeScoringStrategy>;

export interface TrendMetricContext {
  readonly score: number;
  readonly unit: TrendMetricUnit;
  readonly strategy: TrendScoringStrategy;
  readonly lowerIsBetter: boolean;
  readonly stableDeltaThreshold: number;
}

const STABLE_DELTA_THRESHOLD_PERCENT = 2;
const STABLE_DELTA_THRESHOLD_DPRIME = 0.2;

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function resolveAccuracyPercent(
  session: Pick<SessionHistoryItem, 'upsAccuracy' | 'unifiedMetrics'>,
): number | null {
  if (typeof session.upsAccuracy === 'number' && Number.isFinite(session.upsAccuracy)) {
    return clampPercent(session.upsAccuracy);
  }
  const unifiedAccuracy = session.unifiedMetrics.accuracy;
  if (Number.isFinite(unifiedAccuracy)) {
    return clampPercent(unifiedAccuracy * 100);
  }
  return null;
}

/**
 * Dual N-Back Classic native metric:
 * error rate = (misses + false alarms) / (hits + misses + false alarms)
 * CR is intentionally excluded.
 */
export function computeDualnbackClassicErrorRatePercent(
  session: Pick<SessionHistoryItem, 'byModality' | 'upsAccuracy' | 'unifiedMetrics'>,
): number {
  let hits = 0;
  let misses = 0;
  let falseAlarms = 0;

  for (const modalityStats of Object.values(session.byModality)) {
    hits += modalityStats.hits;
    misses += modalityStats.misses;
    falseAlarms += modalityStats.falseAlarms ?? 0;
  }

  const totalRelevant = hits + misses + falseAlarms;
  if (totalRelevant > 0) {
    return Math.round(((misses + falseAlarms) / totalRelevant) * 100);
  }

  const accuracyPercent = resolveAccuracyPercent(session);
  if (accuracyPercent !== null) {
    return Math.round(100 - accuracyPercent);
  }
  return 0;
}

export function resolveTrendMetricContext(
  report: Pick<SessionEndReportModel, 'gameMode' | 'modeScore'>,
): TrendMetricContext {
  const normalizedMode = normalizeModeId(report.gameMode);
  const strategy = getModeScoringStrategy(normalizedMode);
  const lowerIsBetter = strategy === 'dualnback-classic';
  const stableDeltaThreshold =
    report.modeScore.unit === "d'" ? STABLE_DELTA_THRESHOLD_DPRIME : STABLE_DELTA_THRESHOLD_PERCENT;

  return {
    score: report.modeScore.value,
    unit: report.modeScore.unit,
    strategy,
    lowerIsBetter,
    stableDeltaThreshold,
  };
}

export function getHistoryTrendScore(
  session: Pick<
    SessionHistoryItem,
    'byModality' | 'upsAccuracy' | 'upsScore' | 'unifiedMetrics' | 'dPrime'
  >,
  strategy: TrendScoringStrategy,
): number | null {
  switch (strategy) {
    case 'sdt':
      return Number.isFinite(session.dPrime) ? session.dPrime : null;

    case 'dualnback-classic':
      return computeDualnbackClassicErrorRatePercent(session);

    case 'brainworkshop': {
      if (Object.keys(session.byModality).length > 0) {
        const aggregated = aggregateRawStats(session.byModality);
        return Math.round(
          computeBrainWorkshopScoreFromRaw(
            aggregated.hits,
            aggregated.correctRejections,
            aggregated.falseAlarms,
            aggregated.misses,
          ),
        );
      }
      if (typeof session.upsScore === 'number' && Number.isFinite(session.upsScore)) {
        return session.upsScore;
      }
      return resolveAccuracyPercent(session);
    }

    case 'accuracy':
      return resolveAccuracyPercent(session);
  }

  return resolveAccuracyPercent(session);
}

export function getTrendDirection(
  currentScore: number,
  previousAverage: number,
  lowerIsBetter: boolean,
  stableDeltaThreshold: number,
): TrendDirection {
  const directionalDelta = lowerIsBetter
    ? previousAverage - currentScore
    : currentScore - previousAverage;

  if (directionalDelta > stableDeltaThreshold) return 'improving';
  if (directionalDelta < -stableDeltaThreshold) return 'declining';
  return 'stable';
}

export function formatTrendScore(value: number, unit: TrendMetricUnit): string {
  if (unit === '%') return `${Math.round(value)}%`;
  if (unit === "d'") return value.toFixed(1);
  return `${Math.round(value)}`;
}
