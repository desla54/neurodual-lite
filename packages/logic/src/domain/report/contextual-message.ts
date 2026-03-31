/**
 * Contextual Message Generator (i18n-ready)
 *
 * Returns i18n keys + parameters instead of hardcoded strings.
 * UI layer resolves translations via t() function.
 */

import type {
  ContextualMessageData,
  TranslatableMessage,
  PerformanceLevel,
  SessionEndReportModel,
  UnifiedModalityStats,
} from '../../types/session-report';
import type { ModalityId } from '../../types/core';
import {
  REPORT_LEVEL_EXCELLENT_ACCURACY,
  REPORT_LEVEL_GOOD_ACCURACY,
  REPORT_LEVEL_AVERAGE_ACCURACY,
  REPORT_LEVEL_BELOW_AVERAGE_ACCURACY,
  REPORT_MISS_DOMINANT_RATIO,
  REPORT_FA_DOMINANT_RATIO,
  REPORT_MODALITY_ASYMMETRY_GAP,
  REPORT_HIGH_FA_RATE,
  REPORT_HIGH_MISS_RATE,
  REPORT_FAST_RT_INSIGHT_MS,
  REPORT_IMPULSIVE_FA_RATE,
  REPORT_IMPULSIVE_RT_MS,
  REPORT_MIN_TRIALS_RATIO,
  REPORT_MODALITY_STRONG_GAP,
} from '../../specs/thresholds';
import type { CognitiveProfile } from '../../engine/cognitive-profiler';

// =============================================================================
// Types
// =============================================================================

interface ModalityAnalysis {
  modality: ModalityId;
  accuracy: number;
  hits: number;
  misses: number;
  stats: UnifiedModalityStats;
}

type DominantErrorType = 'misses' | 'false-alarms' | 'balanced' | 'none';

interface SessionAnalysis {
  level: PerformanceLevel;
  accuracy: number;
  bestModality: ModalityAnalysis | null;
  worstModality: ModalityAnalysis | null;
  modalityGap: number;
  dominantErrorType: DominantErrorType;
  errorRate: number;
  isImproving: boolean;
  totalTargets: number;
  totalMisses: number;
  totalFA: number;
  totalHits: number;
  missRate: number;
  faRate: number;
  isAbandoned: boolean;
  hasNoResponses: boolean;
  isShortSession: boolean;
  isImpulsive: boolean;
  avgRT: number | null;
  rtConsistency: 'stable' | 'variable' | 'unknown';
  sessionDurationMin: number;
  hasConfidenceScore: boolean;
  confidenceScore: number | null;
  detectionRate: number;
  modalityRTDiff: number | null;
  nonTargets: number;
  faRateOnNonTargets: number;
  focusLostCount: number;
  focusLostTotalMs: number;
  // --- New Cognitive Features ---
  cognitiveProfile: CognitiveProfile | null;
  pesRatio: number | null;
  isFatigued: boolean;
  degradationPercent: number;
  rtCV: number | null;
  isDiesel: boolean;
  isSprinter: boolean;
  isSymmetrical: boolean;
}

export type ContextualMessageStyle = 'simple' | 'analyst';

export type ContextualMessageVariant = 'stable' | 'beta';

export interface ContextualMessageOptions {
  /** Default: 'simple' */
  readonly style?: ContextualMessageStyle;
  /**
   * Key schema / selector variant.
   * - 'stable': legacy keys matching current locale bundles
   * - 'beta': experimental deterministic archetypes (may evolve)
   *
   * Default: 'stable'
   */
  readonly variant?: ContextualMessageVariant;
  /** Optional pre-computed cognitive profile to avoid re-calculating from events */
  readonly cognitiveProfile?: CognitiveProfile;
}

// =============================================================================
// i18n Key Prefix
// =============================================================================

const PREFIX = 'stats.contextual';

// Volume thresholds for prudence rules (analyst subline archetypes)
const VOLUME_ENOUGH_TRIALS = 30;
const VOLUME_ENOUGH_NONTARGETS = 20;

// =============================================================================
// Random Selection Helper
// =============================================================================

function pickRandom<T>(items: readonly T[]): T {
  // biome-ignore lint/style/noNonNullAssertion: array is always non-empty
  return items[Math.floor(Math.random() * items.length)]!;
}

function formatDurationCompact(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0s';
  const totalSec = Math.round(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min <= 0) return `${sec}s`;
  const secPadded = String(sec).padStart(2, '0');
  return `${min}m${secPadded}s`;
}

function pctOrNull(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
  const pct = Math.round((numerator / denominator) * 100);
  return Number.isFinite(pct) ? pct : null;
}

function pickRandomDefined<T>(items: (T | undefined)[]): T | undefined {
  const defined = items.filter((item): item is T => item !== undefined);
  if (defined.length === 0) return undefined;
  return pickRandom(defined);
}

// =============================================================================
// Helpers
// =============================================================================

function getFalseAlarms(report: SessionEndReportModel): number {
  return report.totals.falseAlarms ?? 0;
}

function getCorrectRejections(report: SessionEndReportModel): number {
  return report.totals.correctRejections ?? 0;
}

function hasFalseAlarms(report: SessionEndReportModel): boolean {
  return report.totals.falseAlarms !== null;
}

function computeModalityAccuracy(stats: UnifiedModalityStats): number {
  const fa = stats.falseAlarms ?? 0;
  const cr = stats.correctRejections ?? 0;
  const total = stats.hits + stats.misses + fa + cr;
  if (total === 0) return 0;
  return (stats.hits + cr) / total;
}

function derivePerformanceLevelFromAccuracy(accuracy: number): PerformanceLevel {
  if (accuracy >= REPORT_LEVEL_EXCELLENT_ACCURACY) return 'excellent';
  if (accuracy >= REPORT_LEVEL_GOOD_ACCURACY) return 'good';
  if (accuracy >= REPORT_LEVEL_AVERAGE_ACCURACY) return 'average';
  if (accuracy >= REPORT_LEVEL_BELOW_AVERAGE_ACCURACY) return 'below-average';
  return 'struggling';
}

// =============================================================================
// Analysis
// =============================================================================

function analyzeSession(
  report: SessionEndReportModel,
  options: ContextualMessageOptions = {},
): SessionAnalysis {
  const level = derivePerformanceLevelFromAccuracy(report.unifiedAccuracy);

  const modalities = Object.entries(report.byModality) as [ModalityId, UnifiedModalityStats][];
  const modalityAnalyses: ModalityAnalysis[] = modalities.map(([modality, stats]) => ({
    modality,
    accuracy: computeModalityAccuracy(stats),
    hits: stats.hits,
    misses: stats.misses,
    stats,
  }));

  modalityAnalyses.sort((a, b) => b.accuracy - a.accuracy);

  const bestModality: ModalityAnalysis | null = modalityAnalyses[0] ?? null;
  const worstModality: ModalityAnalysis | null =
    modalityAnalyses.length > 1 ? (modalityAnalyses.at(-1) ?? null) : null;

  const modalityGap =
    bestModality && worstModality ? bestModality.accuracy - worstModality.accuracy : 0;

  const fa = getFalseAlarms(report);
  const totalErrors = report.totals.misses + fa;
  const totalTargets = report.totals.hits + report.totals.misses;
  const totalActions =
    report.totals.hits + report.totals.misses + fa + getCorrectRejections(report);

  let dominantErrorType: DominantErrorType = 'none';
  if (totalErrors > 0) {
    const missRatio = report.totals.misses / totalErrors;
    if (missRatio > REPORT_MISS_DOMINANT_RATIO) dominantErrorType = 'misses';
    else if (missRatio < REPORT_FA_DOMINANT_RATIO && hasFalseAlarms(report))
      dominantErrorType = 'false-alarms';
    else if (hasFalseAlarms(report)) dominantErrorType = 'balanced';
    else dominantErrorType = 'misses';
  }

  const missRate = totalTargets > 0 ? report.totals.misses / totalTargets : 0;
  const faRate = totalActions > 0 ? fa / totalActions : 0;
  const detectionRate = totalTargets > 0 ? report.totals.hits / totalTargets : 0;
  const nonTargets = fa + getCorrectRejections(report);
  const faRateOnNonTargets = nonTargets > 0 ? fa / nonTargets : 0;

  let avgRT: number | null = report.speedStats?.valueMs ?? null;
  if (avgRT === null && bestModality) {
    avgRT = bestModality.stats.avgRT;
  }

  let rtConsistency: 'stable' | 'variable' | 'unknown' = 'unknown';
  let rtCV: number | null = null;
  if (report.speedStats?.distribution) {
    const { min, median, max } = report.speedStats.distribution;
    const spread = max - min;
    rtCV = spread / (median || 1); // Approximation of CV using spread/median
    rtConsistency = rtCV < 0.5 ? 'stable' : 'variable';
  }

  let modalityRTDiff: number | null = null;
  if (bestModality?.stats.avgRT && worstModality?.stats.avgRT) {
    modalityRTDiff = Math.abs(bestModality.stats.avgRT - worstModality.stats.avgRT);
  }

  const isAbandoned = report.reason === 'abandoned';
  const totalResponses = report.totals.hits + fa;
  const hasNoResponses = totalResponses === 0 && totalTargets > 0;
  const expectedTrials = report.trialsCount;
  const actualTrials = totalActions;
  const isShortSession =
    expectedTrials > 0 && actualTrials / expectedTrials < REPORT_MIN_TRIALS_RATIO;

  const isImpulsive =
    hasFalseAlarms(report) &&
    faRate >= REPORT_IMPULSIVE_FA_RATE &&
    avgRT !== null &&
    avgRT < REPORT_IMPULSIVE_RT_MS;

  const sessionDurationMin = Math.round(report.durationMs / 60000);

  const focusLostCount = report.focusStats?.focusLostCount ?? 0;
  const focusLostTotalMs = report.focusStats?.focusLostTotalMs ?? 0;

  let confidenceScore: number | null = null;
  let pesRatio: number | null = null;
  if (report.modeDetails) {
    if ('confidenceScore' in report.modeDetails) {
      confidenceScore = report.modeDetails.confidenceScore ?? null;
    }
    // Extract PES from Tempo details if available
    if (report.modeDetails.kind === 'tempo' && report.modeDetails.confidenceDebug) {
      pesRatio = report.modeDetails.confidenceDebug.rawData.pesRatio ?? null;
    }
  }

  // Cognitive Profile extraction or computation
  const cognitiveProfile = options.cognitiveProfile ?? null;
  let isFatigued = false;
  let degradationPercent = 0;
  let isDiesel = false;
  let isSprinter = false;

  if (cognitiveProfile) {
    isFatigued = cognitiveProfile.fatigue.isFatigued;
    degradationPercent = cognitiveProfile.fatigue.degradationPercent;
    pesRatio = pesRatio ?? cognitiveProfile.resilience.avgSlowdownAfterError / (avgRT || 1) + 1; // Approx

    // Archetype: Diesel (Weak start < 60%, Strong end > 90%)
    isDiesel =
      cognitiveProfile.fatigue.earlyAccuracy < 0.6 && cognitiveProfile.fatigue.lateAccuracy > 0.9;

    // Archetype: Sprinter (Accuracy boost at the very end > 20% improvement)
    isSprinter =
      cognitiveProfile.fatigue.lateAccuracy > cognitiveProfile.fatigue.earlyAccuracy + 0.2;
  }

  // Archetype: Symmetrical (Perfect RT balance < 30ms between modalities)
  const isSymmetrical =
    (modalityRTDiff ?? 999) < 30 && report.activeModalities.length > 1 && (rtCV ?? 1) < 0.3;

  return {
    level,
    accuracy: report.unifiedAccuracy,
    bestModality,
    worstModality,
    modalityGap,
    dominantErrorType,
    errorRate: report.errorProfile.errorRate,
    isImproving: report.nextStep?.direction === 'up',
    totalTargets,
    totalMisses: report.totals.misses,
    totalFA: fa,
    totalHits: report.totals.hits,
    missRate,
    faRate,
    isAbandoned,
    hasNoResponses,
    isShortSession,
    isImpulsive,
    avgRT,
    rtConsistency,
    sessionDurationMin,
    hasConfidenceScore: confidenceScore !== null,
    confidenceScore,
    detectionRate,
    modalityRTDiff,
    nonTargets,
    faRateOnNonTargets,
    focusLostCount,
    focusLostTotalMs,
    cognitiveProfile,
    pesRatio,
    isFatigued,
    degradationPercent,
    rtCV,
    isDiesel,
    isSprinter,
    isSymmetrical,
  };
}

// =============================================================================
// i18n Key Builders
// =============================================================================

const HEADLINES = {
  abandoned: (): TranslatableMessage =>
    pickRandom([
      { key: `${PREFIX}.headlines.abandonedV1` },
      { key: `${PREFIX}.headlines.abandonedV2` },
      { key: `${PREFIX}.headlines.abandonedV3` },
    ]),
  noResponse: (): TranslatableMessage =>
    pickRandom([
      { key: `${PREFIX}.headlines.noResponseV1` },
      { key: `${PREFIX}.headlines.noResponseV2` },
      { key: `${PREFIX}.headlines.noResponseV3` },
    ]),
  accuracy: (pct: number): TranslatableMessage =>
    pickRandom([
      { key: `${PREFIX}.headlines.accuracyV1`, params: { pct } },
      { key: `${PREFIX}.headlines.accuracyV2`, params: { pct } },
      { key: `${PREFIX}.headlines.accuracyV3`, params: { pct } },
    ]),
};

const SUBLINES = {
  abandoned: (actual: number, total: number): TranslatableMessage =>
    (() => {
      const pct = pctOrNull(actual, total);
      const options: (TranslatableMessage | undefined)[] = [
        { key: `${PREFIX}.sublines.abandonedV1`, params: { actual, total } },
        { key: `${PREFIX}.sublines.abandonedV2`, params: { actual, total } },
        pct !== null
          ? { key: `${PREFIX}.sublines.abandonedV3`, params: { actual, total, pct } }
          : undefined,
      ];
      const defined = options.filter((v): v is TranslatableMessage => v !== undefined);
      return pickRandom(defined);
    })(),
  noResponse: (targets: number): TranslatableMessage =>
    pickRandom([
      { key: `${PREFIX}.sublines.noResponseV1`, params: { targets, count: targets } },
      { key: `${PREFIX}.sublines.noResponseV2`, params: { targets, count: targets } },
      { key: `${PREFIX}.sublines.noResponseV3`, params: { targets, count: targets } },
    ]),
  impulsiveWithRT: (fa: number, rt: number): TranslatableMessage =>
    pickRandom([
      { key: `${PREFIX}.sublines.impulsiveWithRTV1`, params: { fa, rt, count: fa } },
      { key: `${PREFIX}.sublines.impulsiveWithRTV2`, params: { fa, rt, count: fa } },
      { key: `${PREFIX}.sublines.impulsiveWithRTV3`, params: { fa, rt, count: fa } },
    ]),
  impulsive: (fa: number): TranslatableMessage =>
    pickRandom([
      { key: `${PREFIX}.sublines.impulsiveV1`, params: { fa, count: fa } },
      { key: `${PREFIX}.sublines.impulsiveV2`, params: { fa, count: fa } },
      { key: `${PREFIX}.sublines.impulsiveV3`, params: { fa, count: fa } },
    ]),
  levelUp: (level: number): TranslatableMessage =>
    pickRandom([
      { key: `${PREFIX}.sublines.levelUpV1`, params: { level } },
      { key: `${PREFIX}.sublines.levelUpV2`, params: { level } },
      { key: `${PREFIX}.sublines.levelUpV3`, params: { level } },
    ]),
  balanced: (): TranslatableMessage =>
    pickRandom([
      { key: `${PREFIX}.sublines.balancedV1` },
      { key: `${PREFIX}.sublines.balancedV2` },
      { key: `${PREFIX}.sublines.balancedV3` },
    ]),
  bestModality: (modality: string, acc: number): TranslatableMessage =>
    pickRandom([
      { key: `${PREFIX}.sublines.bestModalityV1`, params: { modality, acc } },
      { key: `${PREFIX}.sublines.bestModalityV2`, params: { modality, acc } },
      { key: `${PREFIX}.sublines.bestModalityV3`, params: { modality, acc } },
    ]),
  correctResponses: (hits: number): TranslatableMessage =>
    pickRandom([
      { key: `${PREFIX}.sublines.correctResponsesV1`, params: { hits, count: hits } },
      { key: `${PREFIX}.sublines.correctResponsesV2`, params: { hits, count: hits } },
      { key: `${PREFIX}.sublines.correctResponsesV3`, params: { hits, count: hits } },
    ]),
  modalityWeakness: (modality: string, hits: number, total: number): TranslatableMessage =>
    pickRandom([
      { key: `${PREFIX}.sublines.modalityWeaknessV1`, params: { modality, hits, total } },
      { key: `${PREFIX}.sublines.modalityWeaknessV2`, params: { modality, hits, total } },
      { key: `${PREFIX}.sublines.modalityWeaknessV3`, params: { modality, hits, total } },
    ]),
  correctAndErrors: (correct: number, errors: number): TranslatableMessage =>
    pickRandom([
      { key: `${PREFIX}.sublines.correctAndErrorsV1`, params: { correct, errors } },
      { key: `${PREFIX}.sublines.correctAndErrorsV2`, params: { correct, errors } },
      { key: `${PREFIX}.sublines.correctAndErrorsV3`, params: { correct, errors } },
    ]),
  missedTargets: (misses: number, total: number): TranslatableMessage =>
    (() => {
      const detected = total - misses;
      const pct = pctOrNull(detected, total);
      const options: (TranslatableMessage | undefined)[] = [
        { key: `${PREFIX}.sublines.missedTargetsV1`, params: { misses, total } },
        { key: `${PREFIX}.sublines.missedTargetsV2`, params: { misses, total } },
        pct !== null
          ? { key: `${PREFIX}.sublines.missedTargetsV3`, params: { misses, total, pct } }
          : undefined,
        {
          key: `${PREFIX}.sublines.missedTargetsV4`,
          params: { misses, total, detected, count: detected },
        },
      ];
      const defined = options.filter((v): v is TranslatableMessage => v !== undefined);
      return pickRandom(defined);
    })(),
  missedTargetsWithPct: (misses: number, total: number, pct: number): TranslatableMessage =>
    pickRandom<TranslatableMessage>([
      { key: `${PREFIX}.sublines.missedTargetsWithPctV1`, params: { misses, total, pct } },
      { key: `${PREFIX}.sublines.missedTargetsWithPctV2`, params: { pct } },
      { key: `${PREFIX}.sublines.missedTargetsWithPctV3`, params: { misses, total, pct } },
    ]),
  falseAlarms: (fa: number): TranslatableMessage =>
    pickRandom([
      { key: `${PREFIX}.sublines.falseAlarmsV1`, params: { fa, count: fa } },
      { key: `${PREFIX}.sublines.falseAlarmsV2`, params: { fa, count: fa } },
      { key: `${PREFIX}.sublines.falseAlarmsV3`, params: { fa, count: fa } },
    ]),
  falseAlarmsDetailed: (fa: number, nonTargets: number): TranslatableMessage =>
    (() => {
      const pct = pctOrNull(fa, nonTargets);
      const options: (TranslatableMessage | undefined)[] = [
        { key: `${PREFIX}.sublines.falseAlarmsDetailedV1`, params: { fa, nonTargets, count: fa } },
        {
          key: `${PREFIX}.sublines.falseAlarmsDetailedV2`,
          params: { fa, nonTargets, count: nonTargets },
        },
        pct !== null
          ? { key: `${PREFIX}.sublines.falseAlarmsDetailedV3`, params: { fa, nonTargets, pct } }
          : undefined,
      ];
      const defined = options.filter((v): v is TranslatableMessage => v !== undefined);
      return pickRandom(defined);
    })(),
  modalityScore: (modality: string, hits: number, total: number): TranslatableMessage =>
    (() => {
      const pct = pctOrNull(hits, total);
      const options: (TranslatableMessage | undefined)[] = [
        { key: `${PREFIX}.sublines.modalityScoreV1`, params: { modality, hits, total } },
        pct !== null
          ? { key: `${PREFIX}.sublines.modalityScoreV2`, params: { modality, hits, total, pct } }
          : undefined,
        { key: `${PREFIX}.sublines.modalityScoreV3`, params: { modality, hits, total } },
      ];
      const defined = options.filter((v): v is TranslatableMessage => v !== undefined);
      return pickRandom(defined);
    })(),
  errorsTotal: (errors: number, trials: number): TranslatableMessage =>
    (() => {
      const pct = pctOrNull(errors, trials);
      const options: (TranslatableMessage | undefined)[] = [
        { key: `${PREFIX}.sublines.errorsTotalV1`, params: { errors, trials } },
        {
          key: `${PREFIX}.sublines.errorsTotalV2`,
          params: { errors, trials, success: trials - errors },
        },
        pct !== null
          ? { key: `${PREFIX}.sublines.errorsTotalV3`, params: { errors, trials, pct } }
          : undefined,
      ];
      const defined = options.filter((v): v is TranslatableMessage => v !== undefined);
      return pickRandom(defined);
    })(),
  consolidate: (level: number): TranslatableMessage =>
    pickRandom([
      { key: `${PREFIX}.sublines.consolidateV1`, params: { level } },
      { key: `${PREFIX}.sublines.consolidateV2`, params: { level } },
      { key: `${PREFIX}.sublines.consolidateV3`, params: { level } },
    ]),
  modalityComparison: (
    best: string,
    bestScore: string,
    worst: string,
    worstScore: string,
  ): TranslatableMessage =>
    pickRandom([
      {
        key: `${PREFIX}.sublines.modalityComparisonV1`,
        params: { best, bestScore, worst, worstScore },
      },
      {
        key: `${PREFIX}.sublines.modalityComparisonV2`,
        params: { best, bestScore, worst, worstScore },
      },
      {
        key: `${PREFIX}.sublines.modalityComparisonV3`,
        params: { best, bestScore, worst, worstScore },
      },
    ]),
  detectionRate: (hits: number, total: number): TranslatableMessage =>
    pickRandom<TranslatableMessage>([
      { key: `${PREFIX}.sublines.detectionRateV1`, params: { hits, total, count: hits } },
      {
        key: `${PREFIX}.sublines.detectionRateV2`,
        params: { hits, total, pct: Math.round((hits / total) * 100) },
      },
      { key: `${PREFIX}.sublines.detectionRateV3`, params: { hits, total, count: hits } },
    ]),
  stableRT: (rt: number): TranslatableMessage =>
    pickRandom([
      { key: `${PREFIX}.sublines.stableRTV1`, params: { rt } },
      { key: `${PREFIX}.sublines.stableRTV2`, params: { rt } },
      { key: `${PREFIX}.sublines.stableRTV3`, params: { rt } },
    ]),
  variableRT: (): TranslatableMessage =>
    pickRandom([
      { key: `${PREFIX}.sublines.variableRTV1` },
      { key: `${PREFIX}.sublines.variableRTV2` },
      { key: `${PREFIX}.sublines.variableRTV3` },
    ]),
  confidenceHigh: (score: number): TranslatableMessage =>
    pickRandom([
      { key: `${PREFIX}.sublines.confidenceHighV1`, params: { score } },
      { key: `${PREFIX}.sublines.confidenceHighV2`, params: { score } },
      { key: `${PREFIX}.sublines.confidenceHighV3`, params: { score } },
    ]),
  confidenceLow: (score: number): TranslatableMessage =>
    pickRandom([
      { key: `${PREFIX}.sublines.confidenceLowV1`, params: { score } },
      { key: `${PREFIX}.sublines.confidenceLowV2`, params: { score } },
    ]),
};

const INSIGHTS = {
  modalityGap: (best: string, worst: string, gap: number): TranslatableMessage =>
    pickRandom([
      { key: `${PREFIX}.insights.modalityGapV1`, params: { best, worst, gap } },
      { key: `${PREFIX}.insights.modalityGapV2`, params: { best, worst, gap } },
      { key: `${PREFIX}.insights.modalityGapV3`, params: { best, worst, gap } },
    ]),
  faTendency: (): TranslatableMessage =>
    pickRandom([
      { key: `${PREFIX}.insights.faTendencyV1` },
      { key: `${PREFIX}.insights.faTendencyV2` },
      { key: `${PREFIX}.insights.faTendencyV3` },
    ]),
  missTendency: (): TranslatableMessage =>
    pickRandom([
      { key: `${PREFIX}.insights.missTendencyV1` },
      { key: `${PREFIX}.insights.missTendencyV2` },
      { key: `${PREFIX}.insights.missTendencyV3` },
    ]),
  fastRT: (rt: number): TranslatableMessage =>
    pickRandom([
      { key: `${PREFIX}.insights.fastRTV1`, params: { rt } },
      { key: `${PREFIX}.insights.fastRTV2`, params: { rt } },
      { key: `${PREFIX}.insights.fastRTV3`, params: { rt } },
    ]),
  modalityRTDiff: (faster: string, diff: number): TranslatableMessage =>
    pickRandom([
      { key: `${PREFIX}.insights.modalityRTDiffV1`, params: { faster, diff } },
      { key: `${PREFIX}.insights.modalityRTDiffV2`, params: { faster, diff } },
    ]),
  rtConsistencyStable: (): TranslatableMessage =>
    pickRandom([
      { key: `${PREFIX}.insights.rtConsistencyStableV1` },
      { key: `${PREFIX}.insights.rtConsistencyStableV2` },
      { key: `${PREFIX}.insights.rtConsistencyStableV3` },
    ]),
  rtConsistencyVariable: (): TranslatableMessage =>
    pickRandom([
      { key: `${PREFIX}.insights.rtConsistencyVariableV1` },
      { key: `${PREFIX}.insights.rtConsistencyVariableV2` },
      { key: `${PREFIX}.insights.rtConsistencyVariableV3` },
    ]),
};

// =============================================================================
// Deterministic Subline Selectors (priority-ordered, first match wins)
// =============================================================================

/**
 * Select the analyst subline by iterating an ordered list of predicates.
 * The first matching condition wins — no randomness, no scoring band.
 */
function selectAnalystSublineStable(
  analysis: SessionAnalysis,
  report: SessionEndReportModel,
): TranslatableMessage {
  const hasEnoughTrials = report.trialsCount >= VOLUME_ENOUGH_TRIALS;
  const hasEnoughNonTargets = analysis.nonTargets >= VOLUME_ENOUGH_NONTARGETS;

  // 1. FOCUS_LOST — highest priority: external disruption is always the primary signal
  if (analysis.focusLostCount > 0 && analysis.focusLostTotalMs > 0) {
    return {
      key: `${PREFIX}.sublines.analystFocusLost`,
      params: {
        count: analysis.focusLostCount,
        duration: formatDurationCompact(analysis.focusLostTotalMs),
      },
    };
  }

  // 2. MODALITY_GAP_STRONG — the bottleneck modality is the clearest actionable lever
  if (
    analysis.modalityGap >= REPORT_MODALITY_STRONG_GAP &&
    analysis.bestModality &&
    analysis.worstModality &&
    report.activeModalities.length > 1
  ) {
    const bestTotal = analysis.bestModality.hits + analysis.bestModality.misses;
    const worstTotal = analysis.worstModality.hits + analysis.worstModality.misses;
    return {
      key: `${PREFIX}.sublines.analystModalityGapStrong`,
      params: {
        best: analysis.bestModality.modality,
        bestScore: `${analysis.bestModality.hits}/${bestTotal}`,
        worst: analysis.worstModality.modality,
        worstScore: `${analysis.worstModality.hits}/${worstTotal}`,
      },
    };
  }

  // 3. MISS_STRONG — dominant omissions, sufficient sample → affirmative
  if (analysis.dominantErrorType === 'misses' && analysis.totalTargets > 0 && hasEnoughTrials) {
    const pct = Math.round(analysis.missRate * 100);
    return {
      key: `${PREFIX}.sublines.analystMissStrong`,
      params: { pct, misses: analysis.totalMisses, total: analysis.totalTargets },
    };
  }

  // 4. MISS_WEAK — dominant omissions, small sample → "peut indiquer"
  if (analysis.dominantErrorType === 'misses' && analysis.totalTargets > 0) {
    return {
      key: `${PREFIX}.sublines.analystMissWeak`,
      params: { misses: analysis.totalMisses, total: analysis.totalTargets },
    };
  }

  // 5. FA_STRONG — dominant false alarms, sufficient non-target sample → affirmative
  if (
    analysis.dominantErrorType === 'false-alarms' &&
    hasFalseAlarms(report) &&
    hasEnoughNonTargets
  ) {
    const pct = Math.round(analysis.faRateOnNonTargets * 100);
    return {
      key: `${PREFIX}.sublines.analystFaStrong`,
      params: { pct, fa: analysis.totalFA, nonTargets: analysis.nonTargets },
    };
  }

  // 6. FA_WEAK — dominant false alarms, small sample → "signal faible"
  if (analysis.dominantErrorType === 'false-alarms' && hasFalseAlarms(report)) {
    return {
      key: `${PREFIX}.sublines.analystFaWeak`,
      params: { fa: analysis.totalFA },
    };
  }

  // 7. MODALITY_GAP_SOFT — noticeable gap but below strong threshold
  if (
    analysis.modalityGap > REPORT_MODALITY_ASYMMETRY_GAP &&
    analysis.worstModality &&
    report.activeModalities.length > 1
  ) {
    const worstTotal = analysis.worstModality.hits + analysis.worstModality.misses;
    return {
      key: `${PREFIX}.sublines.analystModalityGapSoft`,
      params: {
        worst: analysis.worstModality.modality,
        hits: analysis.worstModality.hits,
        total: worstTotal,
      },
    };
  }

  // 8. VARIABLE_RT — timing instability is actionable
  if (analysis.rtConsistency === 'variable') {
    return { key: `${PREFIX}.sublines.analystVariableRt` };
  }

  // 9. STABLE_RT — positive signal: lever is decision quality, not speed
  if (analysis.rtConsistency === 'stable' && analysis.avgRT !== null) {
    return {
      key: `${PREFIX}.sublines.analystStableRt`,
      params: { rt: Math.round(analysis.avgRT) },
    };
  }

  // 10. LEVEL_UP — ready for next level
  if (analysis.level === 'excellent' && analysis.isImproving) {
    return {
      key: `${PREFIX}.sublines.analystLevelUp`,
      params: { level: report.nextStep?.nextLevel ?? report.nLevel + 1 },
    };
  }

  // 11. CONSOLIDATE — accuracy too low to push forward
  if (analysis.accuracy < 0.7) {
    return {
      key: `${PREFIX}.sublines.analystConsolidate`,
      params: { level: report.nLevel },
    };
  }

  // 12. FALLBACK — always matches
  const errors = analysis.totalMisses + analysis.totalFA;
  return {
    key: `${PREFIX}.sublines.analystFallback`,
    params: { correct: report.totals.hits, errors },
  };
}

/**
 * Experimental deterministic analyst selector.
 * Uses a richer archetype set and variant keys.
 */
function selectAnalystSublineBeta(
  analysis: SessionAnalysis,
  report: SessionEndReportModel,
): TranslatableMessage {
  // NOTE: This is intentionally kept separate from the stable selector so we can
  // iterate on key schemas without breaking production translations.
  //
  // Implementation: current (experimental) deterministic priority chain.
  const hasEnoughTrials = report.trialsCount >= VOLUME_ENOUGH_TRIALS;
  const hasEnoughNonTargets = analysis.nonTargets >= VOLUME_ENOUGH_NONTARGETS;

  if (analysis.focusLostCount > 0 && analysis.focusLostTotalMs > 0) {
    return pickRandom<TranslatableMessage>([
      {
        key: `${PREFIX}.sublines.analystFocusLostV1`,
        params: {
          count: analysis.focusLostCount,
          duration: formatDurationCompact(analysis.focusLostTotalMs),
        } satisfies Record<string, string | number>,
      },
      {
        key: `${PREFIX}.sublines.analystFocusLostV2`,
        params: { count: analysis.focusLostCount } satisfies Record<string, string | number>,
      },
    ]);
  }

  if (analysis.isDiesel) {
    return pickRandom([
      { key: `${PREFIX}.sublines.analystDieselV1` },
      { key: `${PREFIX}.sublines.analystDieselV2` },
      { key: `${PREFIX}.sublines.analystDieselV3` },
    ]);
  }

  if (analysis.isSprinter) {
    return pickRandom([
      { key: `${PREFIX}.sublines.analystSprinterV1` },
      { key: `${PREFIX}.sublines.analystSprinterV2` },
    ]);
  }

  if (analysis.pesRatio && analysis.totalMisses + analysis.totalFA >= 3) {
    if (analysis.pesRatio > 1.15) {
      return pickRandom([
        {
          key: `${PREFIX}.sublines.analystPesVigilantV1`,
          params: { ratio: Math.round(analysis.pesRatio * 100) },
        },
        { key: `${PREFIX}.sublines.analystPesVigilantV2` },
      ]);
    }
    if (analysis.pesRatio < 0.85) {
      return pickRandom([
        {
          key: `${PREFIX}.sublines.analystPesImpulsiveV1`,
          params: { ratio: Math.round(analysis.pesRatio * 100) },
        },
        { key: `${PREFIX}.sublines.analystPesImpulsiveV2` },
      ]);
    }
  }

  if (analysis.isSymmetrical) {
    return pickRandom([
      { key: `${PREFIX}.sublines.analystSymmetricalV1` },
      { key: `${PREFIX}.sublines.analystSymmetricalV2` },
    ]);
  }

  if (analysis.isFatigued && report.trialsCount >= 20) {
    return pickRandom([
      {
        key: `${PREFIX}.sublines.analystFatigueDetectedV1`,
        params: { pct: Math.round(analysis.degradationPercent) },
      },
      { key: `${PREFIX}.sublines.analystFatigueDetectedV2` },
    ]);
  }

  if (analysis.rtCV && analysis.rtCV < 0.25 && analysis.totalHits >= 10) {
    return pickRandom([
      {
        key: `${PREFIX}.sublines.analystStabilityExpertV1`,
        params: { rt: Math.round(analysis.avgRT ?? 0) },
      },
      { key: `${PREFIX}.sublines.analystStabilityExpertV2` },
    ]);
  }

  if (
    analysis.modalityGap >= REPORT_MODALITY_STRONG_GAP &&
    analysis.bestModality &&
    analysis.worstModality &&
    report.activeModalities.length > 1
  ) {
    const bestTotal = analysis.bestModality.hits + analysis.bestModality.misses;
    const worstTotal = analysis.worstModality.hits + analysis.worstModality.misses;
    return pickRandom<TranslatableMessage>([
      {
        key: `${PREFIX}.sublines.analystModalityGapStrongV1`,
        params: {
          best: analysis.bestModality.modality,
          bestScore: `${analysis.bestModality.hits}/${bestTotal}`,
          worst: analysis.worstModality.modality,
          worstScore: `${analysis.worstModality.hits}/${worstTotal}`,
        } satisfies Record<string, string | number>,
      },
      {
        key: `${PREFIX}.sublines.analystModalityGapStrongV2`,
        params: { worst: analysis.worstModality.modality } satisfies Record<
          string,
          string | number
        >,
      },
    ]);
  }

  if (analysis.dominantErrorType === 'misses' && analysis.totalTargets > 0 && hasEnoughTrials) {
    const pct = Math.round(analysis.missRate * 100);
    return pickRandom<TranslatableMessage>([
      {
        key: `${PREFIX}.sublines.analystMissStrongV1`,
        params: { pct, misses: analysis.totalMisses, total: analysis.totalTargets },
      },
      {
        key: `${PREFIX}.sublines.analystMissStrongV2`,
        params: { pct } satisfies Record<string, string | number>,
      },
    ]);
  }

  if (analysis.dominantErrorType === 'misses' && analysis.totalTargets > 0) {
    return pickRandom([
      {
        key: `${PREFIX}.sublines.analystMissWeakV1`,
        params: { misses: analysis.totalMisses, total: analysis.totalTargets },
      },
      { key: `${PREFIX}.sublines.analystMissWeakV2` },
    ]);
  }

  if (
    analysis.dominantErrorType === 'false-alarms' &&
    hasFalseAlarms(report) &&
    hasEnoughNonTargets
  ) {
    const pct = Math.round(analysis.faRateOnNonTargets * 100);
    return pickRandom<TranslatableMessage>([
      {
        key: `${PREFIX}.sublines.analystFaStrongV1`,
        params: { pct, fa: analysis.totalFA, nonTargets: analysis.nonTargets },
      },
      {
        key: `${PREFIX}.sublines.analystFaStrongV2`,
        params: { pct } satisfies Record<string, string | number>,
      },
    ]);
  }

  if (analysis.dominantErrorType === 'false-alarms' && hasFalseAlarms(report)) {
    return pickRandom([
      { key: `${PREFIX}.sublines.analystFaWeakV1`, params: { fa: analysis.totalFA } },
      { key: `${PREFIX}.sublines.analystFaWeakV2` },
    ]);
  }

  if (
    analysis.modalityGap > REPORT_MODALITY_ASYMMETRY_GAP &&
    analysis.worstModality &&
    report.activeModalities.length > 1
  ) {
    const worstTotal = analysis.worstModality.hits + analysis.worstModality.misses;
    return pickRandom([
      {
        key: `${PREFIX}.sublines.analystModalityGapSoftV1`,
        params: {
          worst: analysis.worstModality.modality,
          hits: analysis.worstModality.hits,
          total: worstTotal,
        },
      },
      { key: `${PREFIX}.sublines.analystModalityGapSoftV2` },
    ]);
  }

  if (analysis.rtConsistency === 'variable') {
    return pickRandom([
      { key: `${PREFIX}.sublines.analystVariableRtV1` },
      { key: `${PREFIX}.sublines.analystVariableRtV2` },
    ]);
  }

  if (analysis.rtConsistency === 'stable' && analysis.avgRT !== null) {
    return pickRandom([
      { key: `${PREFIX}.sublines.analystStableRtV1`, params: { rt: Math.round(analysis.avgRT) } },
      { key: `${PREFIX}.sublines.analystStableRtV2` },
    ]);
  }

  if (analysis.level === 'excellent' && analysis.isImproving) {
    return pickRandom([
      {
        key: `${PREFIX}.sublines.analystLevelUpV1`,
        params: { level: report.nextStep?.nextLevel ?? report.nLevel + 1 },
      },
      { key: `${PREFIX}.sublines.analystLevelUpV2` },
    ]);
  }

  if (analysis.accuracy < 0.7) {
    return pickRandom([
      { key: `${PREFIX}.sublines.analystConsolidateV1`, params: { level: report.nLevel } },
      { key: `${PREFIX}.sublines.analystConsolidateV2` },
    ]);
  }

  const errors = analysis.totalMisses + analysis.totalFA;
  return pickRandom([
    {
      key: `${PREFIX}.sublines.analystFallbackV1`,
      params: { correct: report.totals.hits, errors },
    },
    { key: `${PREFIX}.sublines.analystFallbackV2` },
  ]);
}

/**
 * Select the simple subline by iterating an ordered list of predicates.
 * First matching condition wins — no randomness.
 */
function selectSimpleSublineStable(
  analysis: SessionAnalysis,
  report: SessionEndReportModel,
): TranslatableMessage {
  const hasEnoughNonTargets = analysis.nonTargets >= VOLUME_ENOUGH_NONTARGETS;

  // 1. MODALITY_GAP — most actionable for multi-modality sessions
  if (
    analysis.modalityGap >= REPORT_MODALITY_STRONG_GAP &&
    analysis.bestModality &&
    analysis.worstModality &&
    report.activeModalities.length > 1
  ) {
    const gapPct = Math.round(analysis.modalityGap * 100);
    return {
      key: `${PREFIX}.sublines.simpleModalityGap`,
      params: {
        best: analysis.bestModality.modality,
        worst: analysis.worstModality.modality,
        gap: gapPct,
      },
    };
  }

  // 2. MISS — dominant omissions with enough targets to be meaningful
  if (analysis.dominantErrorType === 'misses' && analysis.totalTargets >= 10) {
    const pct = Math.round(analysis.missRate * 100);
    return {
      key: `${PREFIX}.sublines.simpleMiss`,
      params: { misses: analysis.totalMisses, total: analysis.totalTargets, pct },
    };
  }

  // 3. FA_RATE — dominant FA with enough non-targets for a reliable rate
  if (
    analysis.dominantErrorType === 'false-alarms' &&
    hasFalseAlarms(report) &&
    hasEnoughNonTargets
  ) {
    return {
      key: `${PREFIX}.sublines.simpleFaRate`,
      params: { fa: analysis.totalFA, nonTargets: analysis.nonTargets },
    };
  }

  // 4. FA — dominant FA, small non-target sample
  if (analysis.dominantErrorType === 'false-alarms' && hasFalseAlarms(report)) {
    return {
      key: `${PREFIX}.sublines.simpleFa`,
      params: { fa: analysis.totalFA },
    };
  }

  // 5. MODALITY_WEAK — point out weakest modality in multi-modality sessions
  if (analysis.worstModality && report.activeModalities.length > 1) {
    const worstAcc = analysis.worstModality.accuracy;
    const bestAcc = analysis.bestModality?.accuracy ?? worstAcc;
    const gap = bestAcc - worstAcc;
    const worstTotal = analysis.worstModality.hits + analysis.worstModality.misses;

    // Guardrails: never label a perfect (or near-perfect / tied) modality as a weakness.
    // This prevents nonsense like "Audio: 6/6 (point a renforcer)".
    const isPerfect = worstAcc >= 1.0;
    const isNearPerfectOrTied = worstAcc >= 0.9 && gap < 0.05;
    const isGapTooSmallToCallOut = gap < 0.1;
    const isTinySample = worstTotal < 6;

    if (!isPerfect && !isNearPerfectOrTied && !isGapTooSmallToCallOut && !isTinySample) {
      return {
        key: `${PREFIX}.sublines.simpleModalityWeak`,
        params: {
          modality: analysis.worstModality.modality,
          hits: analysis.worstModality.hits,
          total: worstTotal,
        },
      };
    }
  }

  // 6. VARIABLE_RT
  if (analysis.rtConsistency === 'variable') {
    return { key: `${PREFIX}.sublines.simpleVariableRt` };
  }

  // 7. AVG_RT — just report the average response time
  if (analysis.avgRT !== null && analysis.avgRT > 0) {
    return {
      key: `${PREFIX}.sublines.simpleAvgRt`,
      params: { rt: Math.round(analysis.avgRT) },
    };
  }

  // 8. LEVEL_UP
  if (analysis.isImproving) {
    return {
      key: `${PREFIX}.sublines.simpleLevelUp`,
      params: { level: report.nextStep?.nextLevel ?? report.nLevel + 1 },
    };
  }

  // 9. CONSOLIDATE
  if (analysis.accuracy < 0.7) {
    return {
      key: `${PREFIX}.sublines.simpleConsolidate`,
      params: { level: report.nLevel },
    };
  }

  // 10. DETECTION
  if (analysis.totalTargets > 0) {
    const pct = Math.round(analysis.detectionRate * 100);
    return {
      key: `${PREFIX}.sublines.simpleDetection`,
      params: { hits: analysis.totalHits, total: analysis.totalTargets, pct },
    };
  }

  // 11. FALLBACK
  const errors = analysis.totalMisses + analysis.totalFA;
  return {
    key: `${PREFIX}.sublines.simpleFallback`,
    params: { correct: report.totals.hits, errors },
  };
}

/** Experimental simple selector (beta variant). */
function selectSimpleSublineBeta(
  analysis: SessionAnalysis,
  report: SessionEndReportModel,
): TranslatableMessage {
  // Keep existing experimental behavior (variant keys).
  // 1. MODALITY_PERFECT — Reward absolute mastery of one stream
  const perfectModality = analysis.bestModality?.accuracy === 1.0 ? analysis.bestModality : null;
  if (perfectModality && report.activeModalities.length > 1 && analysis.accuracy < 1.0) {
    return pickRandom([
      {
        key: `${PREFIX}.sublines.simpleModalityPerfectV1`,
        params: { modality: perfectModality.modality },
      },
      {
        key: `${PREFIX}.sublines.simpleModalityPerfectV2`,
        params: { modality: perfectModality.modality },
      },
    ]);
  }

  // 2. MODALITY_GAP — most actionable for multi-modality sessions
  if (
    analysis.modalityGap >= REPORT_MODALITY_STRONG_GAP &&
    analysis.bestModality &&
    analysis.worstModality &&
    report.activeModalities.length > 1
  ) {
    const worstTotal = analysis.worstModality.hits + analysis.worstModality.misses;
    const bestTotal = analysis.bestModality.hits + analysis.bestModality.misses;

    // Guardrail: avoid calling out a "weak modality" on tiny samples.
    // Strong gaps on 1-2 targets are usually noise.
    if (worstTotal >= 6 && bestTotal >= 6) {
      return pickRandom<TranslatableMessage>([
        {
          key: `${PREFIX}.sublines.simpleModalityWeakV1`,
          params: {
            modality: analysis.worstModality.modality,
            hits: analysis.worstModality.hits,
            total: worstTotal,
          } satisfies Record<string, string | number>,
        },
        {
          key: `${PREFIX}.sublines.simpleModalityWeakV2`,
          params: { modality: analysis.worstModality.modality } satisfies Record<
            string,
            string | number
          >,
        },
      ]);
    }
  }

  // 3. BALANCED_PERFORMANCE — High accuracy on both (Symmetry)
  if (
    analysis.accuracy > 0.85 &&
    analysis.modalityGap < 0.1 &&
    report.activeModalities.length > 1
  ) {
    return pickRandom([
      { key: `${PREFIX}.sublines.simpleBalancedExpertV1` },
      { key: `${PREFIX}.sublines.simpleBalancedExpertV2` },
      { key: `${PREFIX}.sublines.simpleBalancedExpertV3` },
    ]);
  }

  // 4. RHYTHM_STABILITY — If accurate but variable, suggest stability
  if (analysis.accuracy > 0.8 && analysis.rtConsistency === 'variable') {
    return pickRandom([
      { key: `${PREFIX}.sublines.simpleSuggestStabilityV1` },
      { key: `${PREFIX}.sublines.simpleSuggestStabilityV2` },
    ]);
  }

  // 5. MISS — dominant omissions
  if (analysis.dominantErrorType === 'misses' && analysis.totalMisses >= 3) {
    return pickRandom([
      {
        key: `${PREFIX}.sublines.simpleMissFocusV1`,
        params: { misses: analysis.totalMisses },
      },
      { key: `${PREFIX}.sublines.simpleMissFocusV2` },
    ]);
  }

  // 6. FA — dominant false alarms
  if (analysis.dominantErrorType === 'false-alarms' && analysis.totalFA >= 3) {
    return pickRandom([
      {
        key: `${PREFIX}.sublines.simpleFaPatientV1`,
        params: { fa: analysis.totalFA },
      },
      { key: `${PREFIX}.sublines.simpleFaPatientV2` },
    ]);
  }

  // 7. AVG_RT — report the average response time if valid
  if (analysis.avgRT !== null && analysis.avgRT > 0) {
    const rt = Math.round(analysis.avgRT);
    return pickRandom([
      { key: `${PREFIX}.sublines.simpleAvgRtV1`, params: { rt } },
      { key: `${PREFIX}.sublines.simpleAvgRtV2`, params: { rt } },
    ]);
  }

  // 8. LEVEL_UP
  if (analysis.isImproving && analysis.accuracy >= 0.8) {
    return pickRandom([
      {
        key: `${PREFIX}.sublines.simpleLevelUpV1`,
        params: { level: report.nextStep?.nextLevel ?? report.nLevel + 1 },
      },
      { key: `${PREFIX}.sublines.simpleLevelUpV2` },
    ]);
  }

  // 9. CONSOLIDATE
  if (analysis.accuracy < 0.7) {
    return pickRandom([
      { key: `${PREFIX}.sublines.simpleConsolidateV1`, params: { level: report.nLevel } },
      { key: `${PREFIX}.sublines.simpleConsolidateV2` },
    ]);
  }

  // 10. FALLBACK
  const errors = analysis.totalMisses + analysis.totalFA;
  return pickRandom([
    {
      key: `${PREFIX}.sublines.simpleFallbackV1`,
      params: { correct: report.totals.hits, errors },
    },
    {
      key: `${PREFIX}.sublines.simpleFallbackV2`,
      params: { correct: report.totals.hits, errors },
    },
    {
      key: `${PREFIX}.sublines.simpleFallbackV3`,
      params: { correct: report.totals.hits, errors },
    },
  ]);
}

// =============================================================================
// Message Generation
// =============================================================================

/**
 * Generate contextual message data with i18n keys.
 * UI must resolve keys via t() function.
 */
export function generateContextualMessageData(
  report: SessionEndReportModel,
  options: ContextualMessageOptions = {},
): ContextualMessageData {
  const analysis = analyzeSession(report, options);
  const accuracyPct = Math.round(analysis.accuracy * 100);

  const style: ContextualMessageStyle = options.style ?? 'simple';
  const variant: ContextualMessageVariant = options.variant ?? 'stable';

  let headline: TranslatableMessage;
  let subline: TranslatableMessage;
  let insight: TranslatableMessage | undefined;

  // 1. Session abandoned early
  if (analysis.isAbandoned && analysis.isShortSession) {
    headline = HEADLINES.abandoned();
    const actualTrials =
      report.totals.hits +
      report.totals.misses +
      (report.totals.falseAlarms ?? 0) +
      (report.totals.correctRejections ?? 0);
    subline = SUBLINES.abandoned(actualTrials, report.trialsCount);
    return { level: analysis.level, headline, subline };
  }

  // 2. No responses at all
  if (analysis.hasNoResponses && analysis.totalTargets > 0) {
    headline = HEADLINES.noResponse();
    subline = SUBLINES.noResponse(analysis.totalMisses);
    return { level: 'struggling', headline, subline };
  }

  // 3. Impulsive behavior
  if (analysis.isImpulsive) {
    headline = HEADLINES.accuracy(accuracyPct);
    subline = analysis.avgRT
      ? SUBLINES.impulsiveWithRT(analysis.totalFA, Math.round(analysis.avgRT))
      : SUBLINES.impulsive(analysis.totalFA);
    insight = buildInsight(analysis, report);
    return { level: analysis.level, headline, subline, insight };
  }

  // Default: simple. Beta: analyst.
  headline = HEADLINES.accuracy(accuracyPct);
  subline =
    style === 'analyst'
      ? variant === 'beta'
        ? selectAnalystSublineBeta(analysis, report)
        : selectAnalystSublineStable(analysis, report)
      : variant === 'beta'
        ? selectSimpleSublineBeta(analysis, report)
        : selectSimpleSublineStable(analysis, report);

  insight = buildInsight(analysis, report);

  return { level: analysis.level, headline, subline, insight };
}

// =============================================================================
// Insight Builder
// =============================================================================

function buildInsight(
  analysis: SessionAnalysis,
  report: SessionEndReportModel,
): TranslatableMessage | undefined {
  const insights: (TranslatableMessage | undefined)[] = [];

  if (
    analysis.modalityGap > REPORT_MODALITY_ASYMMETRY_GAP &&
    analysis.bestModality &&
    analysis.worstModality
  ) {
    const gapPct = Math.round(analysis.modalityGap * 100);
    insights.push(
      INSIGHTS.modalityGap(analysis.bestModality.modality, analysis.worstModality.modality, gapPct),
    );
  }

  const fa = analysis.totalFA;
  const total = report.totals.hits + report.totals.misses + fa + getCorrectRejections(report);
  if (hasFalseAlarms(report) && total > 0 && fa / total > REPORT_HIGH_FA_RATE) {
    insights.push(INSIGHTS.faTendency());
  }

  if (analysis.totalTargets > 0 && analysis.missRate > REPORT_HIGH_MISS_RATE) {
    insights.push(INSIGHTS.missTendency());
  }

  if (
    report.speedStats &&
    report.speedStats.valueMs < REPORT_FAST_RT_INSIGHT_MS &&
    analysis.level === 'excellent'
  ) {
    insights.push(INSIGHTS.fastRT(Math.round(report.speedStats.valueMs)));
  }

  if (analysis.rtConsistency !== 'unknown' && analysis.level !== 'excellent') {
    insights.push(
      analysis.rtConsistency === 'stable'
        ? INSIGHTS.rtConsistencyStable()
        : INSIGHTS.rtConsistencyVariable(),
    );
  }

  if (analysis.modalityRTDiff && analysis.modalityRTDiff > 100 && analysis.bestModality) {
    const fasterModality =
      analysis.bestModality.stats.avgRT &&
      analysis.worstModality?.stats.avgRT &&
      analysis.bestModality.stats.avgRT < analysis.worstModality.stats.avgRT
        ? analysis.bestModality.modality
        : (analysis.worstModality?.modality ?? analysis.bestModality.modality);
    insights.push(INSIGHTS.modalityRTDiff(fasterModality, Math.round(analysis.modalityRTDiff)));
  }

  return pickRandomDefined(insights);
}

// =============================================================================
// Legacy exports (deprecated, for backward compatibility)
// =============================================================================

import type { ContextualMessage } from '../../types/session-report';

/**
 * @deprecated Use generateContextualMessageData() with UI translation instead.
 * This function is kept for backward compatibility during migration.
 */
export function generateContextualMessage(report: SessionEndReportModel): ContextualMessage {
  const data = generateContextualMessageData(report);
  // Return placeholder - UI should migrate to new API
  return {
    level: data.level,
    headline: data.headline.key,
    subline: data.subline.key,
    insight: data.insight?.key,
  };
}

/**
 * @deprecated Use generateContextualMessageData() with UI translation instead.
 */
export function generateContextualMessageEN(report: SessionEndReportModel): ContextualMessage {
  return generateContextualMessage(report);
}
