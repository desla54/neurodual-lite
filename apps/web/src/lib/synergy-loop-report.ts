import { deriveTier, type ModalityId, type SessionEndReportModel } from '@neurodual/logic';
import type { SynergyConfig, SynergySessionResult } from '../stores/synergy-store';

type RoundChartPoint = {
  round: string;
  track?: number;
  nback?: number;
};

type SynergyLoopStepSummary = {
  key: string;
  mode: 'dual-track' | 'sim-brainworkshop';
  modeLabel: string;
  nLevel: number;
  score: number;
  createdAt?: string;
  sessionId?: string;
};

export interface SynergyLoopViewModel {
  report: SessionEndReportModel | null;
  roundChartData: RoundChartPoint[];
  completedLoops: number;
  avgTrackScore: number;
  avgNbackScore: number;
  totalXp: number;
  stepSummaries: SynergyLoopStepSummary[];
}

type AggregatedModalityAccumulator = {
  hits: number;
  misses: number;
  falseAlarms: number | null;
  correctRejections: number | null;
  avgRTWeightedSum: number;
  avgRTWeight: number;
  dPrimeWeightedSum: number;
  dPrimeWeight: number;
};

const MODALITY_ORDER: readonly ModalityId[] = [
  'position',
  'audio',
  'color',
  'arithmetic',
  'image',
  'shape',
  'vis',
  'visvis',
  'visaudio',
  'audiovis',
];

function clampPercent(value: number): number {
  return Math.round(Math.max(0, Math.min(100, value)));
}

function buildRoundChartData(
  sessionResults: readonly SynergySessionResult[],
  totalLoops: number,
): RoundChartPoint[] {
  const data: RoundChartPoint[] = [];

  for (let i = 0; i + 1 < sessionResults.length; i += 2) {
    const track = sessionResults[i];
    const nback = sessionResults[i + 1];
    if (track && nback) {
      data.push({
        round: `${data.length + 1}`,
        track: clampPercent(track.score),
        nback: clampPercent(nback.score),
      });
    }
  }

  if (sessionResults.length % 2 === 1) {
    const track = sessionResults[sessionResults.length - 1];
    if (track) {
      data.push({
        round: `${data.length + 1}`,
        track: clampPercent(track.score),
      });
    }
  }

  for (let round = data.length + 1; round <= totalLoops; round += 1) {
    data.push({ round: `${round}` });
  }

  return data;
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getModeLabel(
  report: SessionEndReportModel | undefined,
  mode: SynergySessionResult['mode'],
): string {
  if (report?.gameModeLabel) return report.gameModeLabel;
  return mode === 'dual-track' ? 'Dual Track' : 'N-Back';
}

export function buildSynergyLoopViewModel(
  sessionResults: readonly SynergySessionResult[],
  config: SynergyConfig,
): SynergyLoopViewModel {
  const reports = sessionResults
    .map((result) => result.report)
    .filter((report): report is SessionEndReportModel => report !== undefined);
  const trackScores = sessionResults
    .filter((result) => result.mode === 'dual-track')
    .map((result) => result.score);
  const nbackScores = sessionResults
    .filter((result) => result.mode !== 'dual-track')
    .map((result) => result.score);
  const totalXp = sessionResults.reduce((sum, result) => sum + (result.xpBreakdown?.total ?? 0), 0);
  const roundChartData = buildRoundChartData(sessionResults, config.totalLoops);
  const completedLoops = Math.floor(sessionResults.length / 2);
  const stepSummaries = sessionResults.map((result, index) => ({
    key: result.sessionId ?? `${result.mode}-${index}`,
    mode: (result.mode === 'dual-track' ? 'dual-track' : 'sim-brainworkshop') as
      | 'dual-track'
      | 'sim-brainworkshop',
    modeLabel: getModeLabel(result.report, result.mode),
    nLevel: result.nLevel,
    score: clampPercent(result.score),
    createdAt: result.report?.createdAt,
    sessionId: result.sessionId,
  }));

  if (reports.length === 0) {
    return {
      report: null,
      roundChartData,
      completedLoops,
      avgTrackScore: clampPercent(average(trackScores)),
      avgNbackScore: clampPercent(average(nbackScores)),
      totalXp,
      stepSummaries,
    };
  }

  const activeModalitySet = new Set<ModalityId>();
  const modalityAccumulators = new Map<ModalityId, AggregatedModalityAccumulator>();

  let hits = 0;
  let misses = 0;
  let falseAlarms = 0;
  let correctRejections = 0;
  let hasFalseAlarms = false;
  let hasCorrectRejections = false;
  let totalTrialsCount = 0;
  let totalDurationMs = 0;
  let createdAt = reports[0]?.createdAt ?? new Date().toISOString();
  let latestReport = reports[0] ?? null;

  let upsWeightedSum = 0;
  let accuracyWeightedSum = 0;
  let confidenceWeightedSum = 0;
  let confidenceWeight = 0;
  let scoreWeight = 0;

  for (const report of reports) {
    const weight = Math.max(1, report.trialsCount);
    totalTrialsCount += report.trialsCount;
    totalDurationMs += report.durationMs;
    createdAt = report.createdAt > createdAt ? report.createdAt : createdAt;
    latestReport =
      latestReport && latestReport.createdAt > report.createdAt ? latestReport : report;

    hits += report.totals.hits;
    misses += report.totals.misses;
    if (report.totals.falseAlarms !== null) {
      falseAlarms += report.totals.falseAlarms;
      hasFalseAlarms = true;
    }
    if (report.totals.correctRejections !== null) {
      correctRejections += report.totals.correctRejections;
      hasCorrectRejections = true;
    }

    upsWeightedSum += report.ups.score * weight;
    accuracyWeightedSum += report.ups.components.accuracy * weight;
    if (typeof report.ups.components.confidence === 'number') {
      confidenceWeightedSum += report.ups.components.confidence * weight;
      confidenceWeight += weight;
    }
    scoreWeight += weight;

    for (const modality of report.activeModalities) {
      activeModalitySet.add(modality);
      const stats = report.byModality[modality];
      if (!stats) continue;

      const totalCount =
        stats.hits + stats.misses + (stats.falseAlarms ?? 0) + (stats.correctRejections ?? 0);
      const accumulator = modalityAccumulators.get(modality) ?? {
        hits: 0,
        misses: 0,
        falseAlarms: null,
        correctRejections: null,
        avgRTWeightedSum: 0,
        avgRTWeight: 0,
        dPrimeWeightedSum: 0,
        dPrimeWeight: 0,
      };

      accumulator.hits += stats.hits;
      accumulator.misses += stats.misses;
      if (stats.falseAlarms !== null) {
        accumulator.falseAlarms = (accumulator.falseAlarms ?? 0) + stats.falseAlarms;
      }
      if (stats.correctRejections !== null) {
        accumulator.correctRejections =
          (accumulator.correctRejections ?? 0) + stats.correctRejections;
      }
      if (stats.avgRT !== null) {
        accumulator.avgRTWeightedSum += stats.avgRT * Math.max(1, totalCount);
        accumulator.avgRTWeight += Math.max(1, totalCount);
      }
      if (stats.dPrime !== null) {
        accumulator.dPrimeWeightedSum += stats.dPrime * Math.max(1, totalCount);
        accumulator.dPrimeWeight += Math.max(1, totalCount);
      }

      modalityAccumulators.set(modality, accumulator);
    }
  }

  const activeModalities = MODALITY_ORDER.filter((modality) => activeModalitySet.has(modality));
  const byModality = Object.fromEntries(
    activeModalities.map((modality) => {
      const stats = modalityAccumulators.get(modality);
      return [
        modality,
        {
          hits: stats?.hits ?? 0,
          misses: stats?.misses ?? 0,
          falseAlarms: stats?.falseAlarms ?? null,
          correctRejections: stats?.correctRejections ?? null,
          avgRT:
            stats && stats.avgRTWeight > 0
              ? Math.round(stats.avgRTWeightedSum / stats.avgRTWeight)
              : null,
          dPrime:
            stats && stats.dPrimeWeight > 0 ? stats.dPrimeWeightedSum / stats.dPrimeWeight : null,
        },
      ];
    }),
  ) as SessionEndReportModel['byModality'];

  const totalActions =
    hits +
    misses +
    (hasFalseAlarms ? falseAlarms : 0) +
    (hasCorrectRejections ? correctRejections : 0);
  const totalErrors = misses + (hasFalseAlarms ? falseAlarms : 0);
  const unifiedAccuracy =
    totalActions > 0 ? (hits + (hasCorrectRejections ? correctRejections : 0)) / totalActions : 0;
  const overallScore = scoreWeight > 0 ? clampPercent(upsWeightedSum / scoreWeight) : 0;
  const accuracyScore = scoreWeight > 0 ? clampPercent(accuracyWeightedSum / scoreWeight) : 0;
  const confidenceScore =
    confidenceWeight > 0 ? clampPercent(confidenceWeightedSum / confidenceWeight) : null;

  const report: SessionEndReportModel = {
    sessionId: latestReport?.sessionId ?? 'synergy-loop',
    createdAt,
    userId: latestReport?.userId,
    reason: 'completed',
    gameMode: 'custom',
    gameModeLabel: 'Synergy',
    playContext: 'synergy',
    nLevel: config.totalLoops,
    activeModalities,
    trialsCount: totalTrialsCount,
    durationMs: totalDurationMs,
    ups: {
      score: overallScore,
      components: {
        accuracy: accuracyScore,
        confidence: confidenceScore,
      },
      journeyEligible: overallScore >= 70,
      tier: deriveTier(overallScore),
    },
    unifiedAccuracy,
    modeScore: {
      labelKey: 'home.synergy.loopScore',
      value: overallScore,
      unit: '%',
      tooltipKey: 'home.synergy.loopScoreTooltip',
    },
    passed: overallScore >= 70,
    totals: {
      hits,
      misses,
      falseAlarms: hasFalseAlarms ? falseAlarms : null,
      correctRejections: hasCorrectRejections ? correctRejections : null,
    },
    byModality,
    errorProfile: {
      errorRate: totalActions > 0 ? totalErrors / totalActions : 0,
      missShare: totalErrors > 0 ? misses / totalErrors : 0,
      faShare: hasFalseAlarms ? (totalErrors > 0 ? falseAlarms / totalErrors : 0) : null,
    },
    xpBreakdown:
      totalXp > 0
        ? {
            base: 0,
            performance: 0,
            accuracy: 0,
            badgeBonus: 0,
            streakBonus: 0,
            dailyBonus: 0,
            flowBonus: 0,
            confidenceMultiplier: 1,
            subtotalBeforeConfidence: totalXp,
            total: totalXp,
            dailyCapReached: false,
          }
        : undefined,
  };

  return {
    report,
    roundChartData,
    completedLoops,
    avgTrackScore: clampPercent(average(trackScores)),
    avgNbackScore: clampPercent(average(nbackScores)),
    totalXp,
    stepSummaries,
  };
}
