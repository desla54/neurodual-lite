/**
 * Session Report Converters
 *
 * Functions to convert existing session summaries into the unified SessionEndReportModel.
 * Each mode has its own converter that handles the mode-specific details and normalizes
 * the data into the unified format.
 */

import type { ModalityId } from '../../types/core';
import type { SessionPlayContext, SessionSummary } from '../../engine/events';
import type { MemoSessionSummary } from '../../types/memo';
import type { PlaceSessionSummary } from '../../types/place';
import type { DualPickSessionSummary } from '../../types/dual-pick';
import type { TraceSessionSummary } from '../../types/trace';
import type { XPBreakdown } from '../../types/xp';
import { computeSpecDrivenTempoAccuracy } from '../unified-metrics';
import { JOURNEY_MIN_UPS } from '../../specs/thresholds';
import { getModeDisplaySpec } from '../../specs';
import type {
  SessionEndReportModel,
  ReportGameMode,
  ModeScore,
  UnifiedModalityStats,
  UnifiedTotals,
  ErrorProfile,
  SpeedStats,
  FocusStats,
  NextStepRecommendation,
  JourneyContext,
  TempoDetails,
  TempoConfidenceDebug,
  MemoDetails,
  PlaceDetails,
  DualPickDetails,
  TraceDetails,
  ModeSpecificDetails,
  TurnSummary,
  TempoTrialDetail,
  TurnVerdict,
} from '../../types/session-report';
import type { UnifiedPerformanceScore } from '../../types/ups';
import { deriveTier } from '../../types/ups';

// =============================================================================
// Helpers
// =============================================================================

function computeErrorProfile(totals: UnifiedTotals): ErrorProfile {
  // For Flow/Memo, FA and CR are null (not applicable)
  const fa = totals.falseAlarms ?? 0;
  const hasFalseAlarms = totals.falseAlarms !== null;

  const totalErrors = totals.misses + fa;
  if (totalErrors === 0) {
    return { errorRate: 0, missShare: 0, faShare: hasFalseAlarms ? 0 : null };
  }

  // Error rate = errors / relevant trials (excluding CR)
  // CR are "doing nothing when nothing expected" - not relevant for error rate
  const totalRelevant = totals.hits + totals.misses + fa;
  return {
    errorRate: totalRelevant > 0 ? totalErrors / totalRelevant : 0,
    missShare: totals.misses / totalErrors,
    // faShare is null for Flow/Memo (FA not applicable)
    faShare: hasFalseAlarms ? fa / totalErrors : null,
  };
}

/**
 * Creates a fallback UPS from accuracy when full calculation isn't available.
 * Used for backward compatibility with existing data.
 *
 * Fallback formula: UPS = round(AccuracyScore)
 * where AccuracyScore is 0-100.
 */
function createFallbackUPS(accuracy: number, isGaming = false): UnifiedPerformanceScore {
  // Fallback: accuracy only (no confidence penalty per spec)
  const accuracyScore = Math.round(accuracy * 100);
  const score = accuracyScore;
  return {
    score,
    components: {
      accuracy: accuracyScore,
      confidence: null,
    },
    journeyEligible: !isGaming && score >= JOURNEY_MIN_UPS,
    tier: deriveTier(score),
  };
}

// =============================================================================
// Tempo Session Converter
// =============================================================================

export interface TempoSessionInput {
  sessionId: string;
  createdAt: string;
  summary: SessionSummary;
  gameMode: ReportGameMode;
  gameModeLabel: string;
  activeModalities: readonly ModalityId[];
  passed: boolean;
  nextLevel: number;
  journeyContext?: JourneyContext;
  /** Pre-computed UPS (from UPSProjector), or will be calculated as fallback */
  ups?: UnifiedPerformanceScore;
  /** Focus metrics (from FOCUS_LOST/FOCUS_REGAINED events) */
  focusStats?: FocusStats;
  /** Debug data for confidence algorithm (for development/analysis) */
  confidenceDebug?: TempoConfidenceDebug;
  /** BrainWorkshop only: strikes already accumulated at this N-level before this session. */
  brainWorkshopStrikesBefore?: number;
  /** BrainWorkshop only: strikes after applying this session outcome. */
  brainWorkshopStrikesAfter?: number;
}

export function convertTempoSession(input: TempoSessionInput): SessionEndReportModel {
  const {
    summary,
    gameMode,
    gameModeLabel,
    activeModalities,
    passed,
    nextLevel,
    journeyContext,
    ups: inputUps,
    focusStats: inputFocusStats,
    confidenceDebug,
    brainWorkshopStrikesBefore,
    brainWorkshopStrikesAfter,
  } = input;
  const stats = summary.finalStats;

  // Build unified modality stats for Tempo-like modes
  // FA/CR are applicable (SDT paradigm with targets and lures)
  const byModality: Record<ModalityId, UnifiedModalityStats> = {};
  for (const modality of activeModalities) {
    const modStats = stats.byModality[modality];
    if (modStats) {
      byModality[modality] = {
        hits: modStats.hits,
        misses: modStats.misses,
        falseAlarms: modStats.falseAlarms,
        correctRejections: modStats.correctRejections,
        avgRT: modStats.avgRT,
        dPrime: modStats.dPrime,
      };
    }
  }

  // Compute totals (FA/CR are numbers for Tempo-like modes)
  const totals: UnifiedTotals = {
    hits: Object.values(byModality).reduce((sum, m) => sum + m.hits, 0),
    misses: Object.values(byModality).reduce((sum, m) => sum + m.misses, 0),
    falseAlarms: Object.values(byModality).reduce((sum, m) => sum + (m.falseAlarms ?? 0), 0),
    correctRejections: Object.values(byModality).reduce(
      (sum, m) => sum + (m.correctRejections ?? 0),
      0,
    ),
  };

  // Unified accuracy - spec-driven calculation based on mode's scoring strategy
  const fa = totals.falseAlarms ?? 0;
  const cr = totals.correctRejections ?? 0;
  const unifiedAccuracy = computeSpecDrivenTempoAccuracy(
    gameMode,
    totals.hits,
    totals.misses,
    fa,
    cr,
  );

  // Mode score - spec-driven labels
  const displaySpec = getModeDisplaySpec(gameMode);
  const isBrainWorkshop = gameMode === 'sim-brainworkshop';
  const isJaeggi = gameMode === 'dualnback-classic';

  // Jaeggi mode: show error rate as percentage (lower is better)
  // Error rate = errors / relevant trials (excluding CR)
  let modeScoreValue: number;
  let modeScoreUnit: '%' | "d'" | 'score';
  if (isJaeggi) {
    const errorProfile = computeErrorProfile(totals);
    modeScoreValue = Math.round(errorProfile.errorRate * 100);
    modeScoreUnit = '%';
  } else if (isBrainWorkshop) {
    // BrainWorkshop mode: show the native BW score (percent),
    // NOT the d'-like compatibility value stored in globalDPrime.
    // BW v5 semantics use integer truncation, not rounding.
    modeScoreValue = Math.floor(unifiedAccuracy * 100);
    modeScoreUnit = '%';
  } else {
    modeScoreValue = stats.globalDPrime;
    modeScoreUnit = "d'";
  }

  const modeScore: ModeScore = {
    labelKey: displaySpec.modeScoreKey,
    value: modeScoreValue,
    unit: modeScoreUnit,
    tooltipKey: displaySpec.modeScoreTooltipKey,
  };

  // Speed stats (avg RT)
  const allRTs = Object.values(byModality)
    .map((m) => m.avgRT)
    .filter((rt): rt is number => rt !== null);
  const avgRT = allRTs.length > 0 ? allRTs.reduce((a, b) => a + b, 0) / allRTs.length : null;
  const speedStats: SpeedStats | undefined = avgRT
    ? {
        labelKey: displaySpec.speedStatKey,
        valueMs: avgRT,
      }
    : undefined;

  // Next step
  const direction =
    nextLevel > summary.nLevel ? 'up' : nextLevel < summary.nLevel ? 'down' : 'same';
  // In Journey mode, progression is handled by stages, not by generic next-level recommendation.
  const nextStep: NextStepRecommendation | undefined = journeyContext
    ? undefined
    : { nextLevel, direction };

  // Mode-specific details
  const tempoDetails: TempoDetails = {
    kind: 'tempo',
    avgIsiMs: summary.isiStats.avg,
    avgStimulusDurationMs: summary.stimulusDurationStats.avg,
    confidenceDebug,
  };

  // Use provided UPS or create fallback
  const ups = inputUps ?? createFallbackUPS(unifiedAccuracy);

  // Focus stats (only include if there was focus loss)
  const focusStats: FocusStats | undefined =
    inputFocusStats && inputFocusStats.focusLostCount > 0 ? inputFocusStats : undefined;

  return {
    sessionId: input.sessionId,
    createdAt: input.createdAt,
    reason: 'completed',
    gameMode,
    gameModeLabel,
    journeyContext,
    nLevel: summary.nLevel,
    activeModalities,
    trialsCount: summary.totalTrials,
    durationMs: summary.durationMs,
    ups,
    unifiedAccuracy,
    modeScore,
    passed,
    totals,
    byModality,
    errorProfile: computeErrorProfile(totals),
    speedStats,
    focusStats,
    nextStep,
    modeDetails: tempoDetails,
    ...(isBrainWorkshop &&
    typeof brainWorkshopStrikesBefore === 'number' &&
    typeof brainWorkshopStrikesAfter === 'number'
      ? {
          brainWorkshop: {
            strikesBefore: brainWorkshopStrikesBefore,
            strikesAfter: brainWorkshopStrikesAfter,
            strikesToDown: 3,
          },
        }
      : {}),
  };
}

// =============================================================================
// Recall (Dual Memo) Session Converter
// =============================================================================

export interface MemoSessionInput {
  sessionId: string;
  createdAt: string;
  summary: MemoSessionSummary;
  activeModalities: readonly ModalityId[];
  gameModeLabel: string;
  passed: boolean;
  nextLevel: number;
  journeyContext?: JourneyContext;
  /** Pre-computed UPS (from UPSProjector), or will be calculated as fallback */
  ups?: UnifiedPerformanceScore;
  // Mode Insights (spec §Cbis)
  /** Confidence score (0-100): recall quality */
  confidenceScore?: number;
  /** Fluency score (0-100): regularity and corrections */
  fluencyScore?: number;
  /** Number of corrections made */
  correctionsCount?: number;
}

export function convertMemoSession(input: MemoSessionInput): SessionEndReportModel {
  const {
    summary,
    activeModalities,
    gameModeLabel,
    passed,
    nextLevel,
    journeyContext,
    ups: inputUps,
    confidenceScore,
    fluencyScore,
    correctionsCount,
  } = input;
  const stats = summary.finalStats;

  // Build unified modality stats for Recall
  // FA/CR are null (not applicable in recall - no lures/distractors)
  const byModality: Record<ModalityId, UnifiedModalityStats> = {};
  for (const modality of activeModalities) {
    const modStats = stats.byModality[modality];
    if (modStats) {
      byModality[modality] = {
        hits: modStats.correctPicks,
        misses: modStats.totalPicks - modStats.correctPicks,
        falseAlarms: null, // Not applicable in recall
        correctRejections: null, // Not applicable in recall
        avgRT: null,
        dPrime: null,
      };
    }
  }

  // Compute totals (FA/CR null for recall)
  const totals: UnifiedTotals = {
    hits: Object.values(byModality).reduce((sum, m) => sum + m.hits, 0),
    misses: Object.values(byModality).reduce((sum, m) => sum + m.misses, 0),
    falseAlarms: null,
    correctRejections: null,
  };

  // Unified accuracy
  const totalPicks = totals.hits + totals.misses;
  const unifiedAccuracy = totalPicks > 0 ? totals.hits / totalPicks : 0;

  // Mode score - spec-driven labels
  const displaySpec = getModeDisplaySpec('dual-memo');
  const modeScore: ModeScore = {
    labelKey: displaySpec.modeScoreKey,
    value: Math.round(stats.accuracy * 100),
    unit: '%',
    tooltipKey: displaySpec.modeScoreTooltipKey,
  };

  // Speed stats (avg recall time)
  const speedStats: SpeedStats | undefined = summary.avgRecallTimeMs
    ? {
        labelKey: displaySpec.speedStatKey,
        valueMs: summary.avgRecallTimeMs,
      }
    : undefined;

  // Next step
  const nLevel = summary.nLevel;
  const direction = nextLevel > nLevel ? 'up' : nextLevel < nLevel ? 'down' : 'same';
  const nextStep: NextStepRecommendation | undefined = journeyContext
    ? undefined
    : { nextLevel, direction };

  // Mode-specific details
  // Convert bySlotIndex from MemoSlotStats to MemoDetails format
  const bySlotIndex: Record<number, { accuracy: number; count: number }> = {};
  for (const [slotIndex, slotStats] of Object.entries(stats.bySlotIndex)) {
    bySlotIndex[Number(slotIndex)] = {
      accuracy: slotStats.accuracy,
      count: slotStats.totalPicks,
    };
  }

  // Mode-specific details (Mode Insights per spec §Cbis)
  const memoDetails: MemoDetails = {
    kind: 'memo',
    bySlotIndex: Object.keys(bySlotIndex).length > 0 ? bySlotIndex : undefined,
    avgRecallTimeMs: summary.avgRecallTimeMs,
    trend: stats.trend,
    recentAccuracies: [...stats.recentAccuracies],
    confidenceScore,
    fluencyScore,
    correctionsCount,
  };

  // Use provided UPS or create fallback
  const ups = inputUps ?? createFallbackUPS(unifiedAccuracy);

  return {
    sessionId: input.sessionId,
    createdAt: input.createdAt,
    reason: 'completed',
    gameMode: 'dual-memo',
    gameModeLabel,
    journeyContext,
    nLevel,
    activeModalities,
    trialsCount: summary.totalTrials,
    durationMs: summary.durationMs,
    ups,
    unifiedAccuracy,
    modeScore,
    passed,
    totals,
    byModality,
    errorProfile: computeErrorProfile(totals),
    speedStats,
    nextStep,
    modeDetails: memoDetails,
  };
}

// =============================================================================
// Flow (Dual Flow) Session Converter
// =============================================================================

/** Modality stats for Flow (matches FlowModalityStats from place-projector) */
export interface PlaceModalityStatsInput {
  readonly totalDrops: number;
  readonly correctDrops: number;
  readonly errorCount: number;
  readonly accuracy: number;
  readonly avgPlacementTimeMs: number;
}

export interface PlaceSessionInput {
  sessionId: string;
  createdAt: string;
  summary: PlaceSessionSummary;
  activeModalities: readonly ModalityId[];
  /** Extended stats with byModality (from FlowExtendedSummary.extendedStats) */
  byModalityStats?: Record<ModalityId, PlaceModalityStatsInput>;
  /** Avg placement time (from extendedStats) */
  avgPlacementTimeMs?: number;
  /** Confidence score (from FlowExtendedSummary) */
  confidenceScore?: number | null;
  /** Directness ratio (0-1): straight line vs zigzag */
  directnessRatio?: number;
  /** Time spent on wrong slots (ms) */
  wrongSlotDwellMs?: number;
  gameModeLabel: string;
  passed: boolean;
  nextLevel: number;
  journeyContext?: JourneyContext;
  /** Pre-computed UPS (from UPSProjector), or will be calculated as fallback */
  ups?: UnifiedPerformanceScore;
}

export function convertPlaceSession(input: PlaceSessionInput): SessionEndReportModel {
  const {
    summary,
    activeModalities,
    byModalityStats,
    avgPlacementTimeMs,
    confidenceScore,
    directnessRatio,
    wrongSlotDwellMs,
    gameModeLabel,
    passed,
    nextLevel,
    journeyContext,
    ups: inputUps,
  } = input;
  const stats = summary.finalStats;

  // Build unified modality stats for Flow
  // FA/CR are null (not applicable in flow - no lures/distractors)
  const byModality: Record<ModalityId, UnifiedModalityStats> = {};
  if (byModalityStats) {
    // Use extended stats if available
    for (const modality of activeModalities) {
      const modStats = byModalityStats[modality];
      if (modStats) {
        byModality[modality] = {
          hits: modStats.correctDrops,
          misses: modStats.errorCount,
          falseAlarms: null, // Not applicable in flow
          correctRejections: null, // Not applicable in flow
          avgRT: modStats.avgPlacementTimeMs,
          dPrime: null,
        };
      }
    }
  } else {
    // Fallback: split evenly across modalities (rough estimate)
    const perModality = activeModalities.length > 0 ? 1 / activeModalities.length : 1;
    for (const modality of activeModalities) {
      byModality[modality] = {
        hits: Math.round(stats.correctDrops * perModality),
        misses: Math.round(stats.errorCount * perModality),
        falseAlarms: null,
        correctRejections: null,
        avgRT: avgPlacementTimeMs ?? null,
        dPrime: null,
      };
    }
  }

  // Compute totals (FA/CR null for flow)
  const totals: UnifiedTotals = {
    hits: stats.correctDrops,
    misses: stats.errorCount,
    falseAlarms: null,
    correctRejections: null,
  };

  // Unified accuracy
  const totalDrops = stats.totalDrops;
  const unifiedAccuracy = totalDrops > 0 ? stats.correctDrops / totalDrops : 0;

  // Mode score - spec-driven labels
  const displaySpec = getModeDisplaySpec('dual-place');
  const modeScore: ModeScore = {
    labelKey: displaySpec.modeScoreKey,
    value: Math.round(stats.accuracy * 100),
    unit: '%',
    tooltipKey: displaySpec.modeScoreTooltipKey,
  };

  // Speed stats (avg placement time)
  const speedStats: SpeedStats | undefined = avgPlacementTimeMs
    ? {
        labelKey: displaySpec.speedStatKey,
        valueMs: avgPlacementTimeMs,
      }
    : undefined;

  // Next step
  const nLevel = summary.nLevel;
  const direction = nextLevel > nLevel ? 'up' : nextLevel < nLevel ? 'down' : 'same';
  const nextStep: NextStepRecommendation | undefined = journeyContext
    ? undefined
    : { nextLevel, direction };

  // Mode-specific details (Mode Insights per spec §Cbis)
  const placeDetails: PlaceDetails = {
    kind: 'flow',
    correctDrops: stats.correctDrops,
    errorCount: stats.errorCount,
    confidenceScore: confidenceScore ?? undefined,
    avgPlacementTimeMs,
    directnessRatio,
    wrongSlotDwellMs,
  };

  // Use provided UPS or create fallback
  const ups = inputUps ?? createFallbackUPS(unifiedAccuracy);

  return {
    sessionId: input.sessionId,
    createdAt: input.createdAt,
    reason: 'completed',
    gameMode: 'dual-place',
    gameModeLabel,
    journeyContext,
    nLevel,
    activeModalities,
    trialsCount: summary.totalTrials,
    durationMs: summary.durationMs,
    ups,
    unifiedAccuracy,
    modeScore,
    passed,
    totals,
    byModality,
    errorProfile: computeErrorProfile(totals),
    speedStats,
    nextStep,
    modeDetails: placeDetails,
  };
}

// =============================================================================
// Generic Converter (for history/stats page)
// =============================================================================

export interface GenericSessionInput {
  sessionId: string;
  createdAt: string;
  gameMode: ReportGameMode;
  gameModeLabel: string;
  nLevel: number;
  activeModalities: readonly ModalityId[];
  trialsCount: number;
  durationMs: number;
  // Unified counts
  totals: UnifiedTotals;
  byModality: Record<ModalityId, UnifiedModalityStats>;
  // Scores
  unifiedAccuracy: number;
  modeScoreValue: number;
  /** i18n key for mode score label (spec-driven) */
  modeScoreLabelKey: string;
  modeScoreUnit: '%' | "d'" | 'score';
  /** i18n key for mode score tooltip (spec-driven) */
  modeScoreTooltipKey?: string;
  // Other
  passed?: boolean;
  nextLevel?: number;
  avgRT?: number;
  /** i18n key for speed stats label (spec-driven) */
  speedLabelKey?: string;
  journeyContext?: JourneyContext;
  playContext?: SessionPlayContext;
  /** Pre-computed UPS (from UPSProjector), or will be calculated as fallback */
  ups?: UnifiedPerformanceScore;
  /** Mode-specific details (for Mode Insights section) */
  modeDetails?: ModeSpecificDetails;
  /** XP breakdown for this session (for historical display) */
  xpBreakdown?: XPBreakdown;
}

export function convertGenericSession(input: GenericSessionInput): SessionEndReportModel {
  const {
    sessionId,
    createdAt,
    gameMode,
    gameModeLabel,
    nLevel,
    activeModalities,
    trialsCount,
    durationMs,
    totals,
    byModality,
    unifiedAccuracy,
    modeScoreValue,
    modeScoreLabelKey,
    modeScoreUnit,
    modeScoreTooltipKey,
    passed,
    nextLevel,
    avgRT,
    speedLabelKey,
    journeyContext,
    playContext,
    ups: inputUps,
    modeDetails,
    xpBreakdown,
  } = input;

  const modeScore: ModeScore = {
    labelKey: modeScoreLabelKey,
    value: modeScoreValue,
    unit: modeScoreUnit,
    tooltipKey: modeScoreTooltipKey,
  };

  // Use mode-specific speed label key or fallback based on gameMode (spec-driven)
  const defaultSpeedLabelKey = getModeDisplaySpec(gameMode).speedStatKey;

  const speedStats: SpeedStats | undefined = avgRT
    ? { labelKey: speedLabelKey ?? defaultSpeedLabelKey, valueMs: avgRT }
    : undefined;

  const isJourneySession =
    playContext === 'journey' || (playContext !== 'free' && journeyContext !== undefined);

  const nextStep: NextStepRecommendation | undefined = nextLevel
    ? isJourneySession
      ? undefined
      : {
          nextLevel,
          direction: nextLevel > nLevel ? 'up' : nextLevel < nLevel ? 'down' : 'same',
        }
    : undefined;

  // Use provided UPS or create fallback
  const ups = inputUps ?? createFallbackUPS(unifiedAccuracy);

  return {
    sessionId,
    createdAt,
    reason: 'completed',
    gameMode,
    gameModeLabel,
    journeyContext,
    playContext,
    nLevel,
    activeModalities,
    trialsCount,
    durationMs,
    ups,
    unifiedAccuracy,
    modeScore,
    passed,
    totals,
    byModality,
    errorProfile: computeErrorProfile(totals),
    speedStats,
    nextStep,
    modeDetails,
    xpBreakdown,
  };
}

// =============================================================================
// Dual Label Session Converter
// =============================================================================

export interface DualPickSessionInput {
  sessionId: string;
  createdAt: string;
  summary: DualPickSessionSummary;
  activeModalities: readonly ModalityId[];
  /** Avg placement time (from extendedStats) */
  avgPlacementTimeMs?: number;
  /** Confidence score (from DualPickExtendedSummary) */
  confidenceScore?: number;
  /** Directness ratio (0-1): straight line vs zigzag */
  directnessRatio?: number;
  /** Time spent on wrong slots (ms) */
  wrongSlotDwellMs?: number;
  gameModeLabel: string;
  passed: boolean;
  nextLevel: number;
  journeyContext?: JourneyContext;
  /** Pre-computed UPS (from UPSProjector), or will be calculated as fallback */
  ups?: UnifiedPerformanceScore;
}

export function convertDualPickSession(input: DualPickSessionInput): SessionEndReportModel {
  const {
    summary,
    activeModalities,
    avgPlacementTimeMs,
    confidenceScore,
    directnessRatio,
    wrongSlotDwellMs,
    gameModeLabel,
    passed,
    nextLevel,
    journeyContext,
    ups: inputUps,
  } = input;
  const stats = summary.finalStats;

  // Build unified modality stats for Dual Label
  // FA/CR are null (not applicable - similar to Flow)
  // But wait, Dual Label has implicit "slots" but not SDT targets per se?
  // Actually, Dual Label is "Placement". Correct drop vs Error.
  // We can treat it like Flow.

  const byModality: Record<ModalityId, UnifiedModalityStats> = {};

  // Fallback: split evenly across modalities (rough estimate) or use if available
  // summary.finalStats is DualPickRunningStats which has totalDrops, correctDrops, etc.
  // It does NOT have byModality breakdown in the current interface.
  // So we split evenly or assign to first.

  const perModality = activeModalities.length > 0 ? 1 / activeModalities.length : 1;
  for (const modality of activeModalities) {
    byModality[modality] = {
      hits: Math.round(stats.correctDrops * perModality),
      misses: Math.round(stats.errorCount * perModality),
      falseAlarms: null,
      correctRejections: null,
      avgRT: null, // Placement time not tracked in global stats yet?
      dPrime: null,
    };
  }

  // Compute totals
  const totals: UnifiedTotals = {
    hits: stats.correctDrops,
    misses: stats.errorCount,
    falseAlarms: null,
    correctRejections: null,
  };

  // Unified accuracy
  const totalDrops = stats.totalDrops;
  const unifiedAccuracy = totalDrops > 0 ? stats.correctDrops / totalDrops : 0;

  // Mode score - spec-driven labels
  const displaySpec = getModeDisplaySpec('dual-pick');
  const modeScore: ModeScore = {
    labelKey: displaySpec.modeScoreKey,
    value: Math.round(stats.accuracy * 100),
    unit: '%',
    tooltipKey: displaySpec.modeScoreTooltipKey,
  };

  // Speed stats
  const speedStats: SpeedStats | undefined = avgPlacementTimeMs
    ? { labelKey: displaySpec.speedStatKey, valueMs: avgPlacementTimeMs }
    : undefined;

  // Next step
  const nLevel = summary.nLevel;
  const direction = nextLevel > nLevel ? 'up' : nextLevel < nLevel ? 'down' : 'same';
  const nextStep: NextStepRecommendation | undefined = journeyContext
    ? undefined
    : { nextLevel, direction };

  // Mode-specific details (Mode Insights per spec §Cbis)
  const dualPickDetails: DualPickDetails = {
    kind: 'dual-pick',
    correctDrops: stats.correctDrops,
    errorCount: stats.errorCount,
    confidenceScore,
    avgPlacementTimeMs,
    directnessRatio,
    wrongSlotDwellMs,
  };

  // Use provided UPS or create fallback
  const ups = inputUps ?? createFallbackUPS(unifiedAccuracy);

  return {
    sessionId: input.sessionId,
    createdAt: input.createdAt,
    reason: 'completed',
    gameMode: 'dual-pick', // This needs to be added to ReportGameMode type!
    gameModeLabel,
    journeyContext,
    nLevel,
    activeModalities,
    trialsCount: summary.totalTrials,
    durationMs: summary.durationMs,
    ups,
    unifiedAccuracy,
    modeScore,
    passed,
    totals,
    byModality,
    errorProfile: computeErrorProfile(totals),
    speedStats,
    nextStep,
    modeDetails: dualPickDetails,
  };
}

// =============================================================================
// Trace (Dual Trace) Session Converter
// =============================================================================

export interface TraceSessionInput {
  sessionId: string;
  createdAt: string;
  summary: TraceSessionSummary;
  /** Active modalities enabled for this session */
  activeModalities: readonly ModalityId[];
  gameModeLabel: string;
  passed: boolean;
  nextLevel: number;
  journeyContext?: JourneyContext;
  /** Pre-computed UPS (from UPSProjector), or will be calculated as fallback */
  ups?: UnifiedPerformanceScore;
  /** Confidence score (based on response time stability) */
  confidenceScore?: number;
}

export function convertTraceSession(input: TraceSessionInput): SessionEndReportModel {
  const {
    summary,
    activeModalities,
    gameModeLabel,
    passed,
    nextLevel,
    journeyContext,
    ups: inputUps,
    confidenceScore,
  } = input;
  const stats = summary.finalStats;
  const responses = summary.responses;

  // Calculate position metrics from responses
  const nonWarmupResponses = responses.filter((r) => !r.isWarmup);
  const positionResponses = nonWarmupResponses.filter((r) => r.responseType !== 'skip');

  // Calculate average response time for position
  const responseTimes = positionResponses
    .filter((r) => r.responseTimeMs !== null)
    .map((r) => r.responseTimeMs as number);
  const avgResponseTimeMs =
    responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : undefined;

  // Trace "audio" modality is represented by the writing phase.
  const writingEnabled = activeModalities.includes('audio');

  let writingAccuracy: number | undefined;
  let correctWritings: number | undefined;
  let totalWritings: number | undefined;
  let avgWritingTimeMs: number | undefined;

  if (writingEnabled) {
    const audioTrials = nonWarmupResponses.filter((r) => r.expectedSound !== null);
    const correctWritingResponses = audioTrials.filter((r) => r.writingResult?.isCorrect);
    correctWritings = correctWritingResponses.length;
    totalWritings = audioTrials.length;
    writingAccuracy = totalWritings > 0 ? correctWritings / totalWritings : 0;

    const writingTimes = audioTrials
      .filter((r) => r.writingResult?.writingTimeMs !== undefined)
      .map((r) => r.writingResult?.writingTimeMs ?? 0);
    avgWritingTimeMs =
      writingTimes.length > 0
        ? writingTimes.reduce((a, b) => a + b, 0) / writingTimes.length
        : undefined;
  }

  // Build unified modality stats
  // For Trace: position is always present, audio (writing) is optional
  // FA/CR are null (not applicable - no lures/distractors in trace mode)
  const byModality: Record<ModalityId, UnifiedModalityStats> = {
    position: {
      hits: stats.correctResponses,
      misses: stats.incorrectResponses + stats.timeouts,
      falseAlarms: null,
      correctRejections: null,
      avgRT: avgResponseTimeMs ?? null,
      dPrime: null,
    },
  };

  // Add audio modality if enabled
  if (writingEnabled) {
    byModality['audio'] = {
      hits: correctWritings ?? 0,
      misses: (totalWritings ?? 0) - (correctWritings ?? 0),
      falseAlarms: null,
      correctRejections: null,
      avgRT: avgWritingTimeMs ?? null,
      dPrime: null,
    };
  }

  // Add color modality if enabled
  const colorEnabled = activeModalities.includes('color');
  let colorAccuracy: number | undefined;
  let correctColors: number | undefined;
  let totalColors: number | undefined;

  if (colorEnabled) {
    const colorTrials = nonWarmupResponses.filter((r) => r.expectedColor !== null);
    correctColors = colorTrials.filter(
      (r) =>
        r.writingResult?.colorCorrect === true ||
        (!!r.expectedColor && !!r.colorResponse && r.expectedColor === r.colorResponse),
    ).length;
    totalColors = colorTrials.length;
    colorAccuracy = totalColors > 0 ? correctColors / totalColors : 0;

    byModality['color'] = {
      hits: correctColors,
      misses: totalColors - correctColors,
      falseAlarms: null,
      correctRejections: null,
      avgRT: null,
      dPrime: null,
    };
  }

  // Build per-turn timeline (used by ReportDetails without needing event loading)
  // We map Trace trials into a tempo-like detail format for unified rendering.
  const turns: TurnSummary[] = nonWarmupResponses.map((r) => {
    const targets = (r.activeModalities ?? activeModalities) as readonly ModalityId[];

    const detailResponses: TempoTrialDetail['responses'] = {
      position: {
        pressed: r.responseType !== 'timeout' && r.responseType !== 'skip',
        reactionTimeMs: r.responseTimeMs ?? undefined,
        phase: 'after_stimulus',
        result: r.isCorrect ? 'hit' : 'miss',
      },
    };

    if (activeModalities.includes('audio')) {
      const audioCorrect = r.writingResult?.isCorrect === true;
      detailResponses['audio'] = {
        pressed: r.writingResult ? !r.writingResult.timedOut : false,
        reactionTimeMs: r.writingResult?.writingTimeMs,
        phase: 'after_stimulus',
        result: audioCorrect ? 'hit' : 'miss',
      };
    }

    if (activeModalities.includes('color')) {
      const colorCorrect =
        r.writingResult?.colorCorrect === true ||
        (!!r.expectedColor && !!r.colorResponse && r.expectedColor === r.colorResponse);
      detailResponses['color'] = {
        pressed: r.colorResponse !== null,
        reactionTimeMs: r.writingResult?.writingTimeMs,
        phase: 'after_stimulus',
        result: colorCorrect ? 'hit' : 'miss',
      };
    }

    // If dynamic rules are available, prefer the per-modality SDT results.
    if (r.modalityResults) {
      for (const [modality, result] of Object.entries(r.modalityResults) as [
        ModalityId,
        'hit' | 'miss' | 'falseAlarm' | 'correctRejection',
      ][]) {
        const mapped =
          result === 'falseAlarm'
            ? 'false-alarm'
            : result === 'correctRejection'
              ? 'correct-rejection'
              : result;
        const existing = detailResponses[modality];
        if (existing) {
          detailResponses[modality] = { ...existing, result: mapped };
        }
      }
    }

    const responseValues = Object.values(detailResponses) as Array<{
      result: 'hit' | 'miss' | 'false-alarm' | 'correct-rejection';
    }>;
    const verdict: TurnVerdict = responseValues.every(
      (x) => x.result === 'hit' || x.result === 'correct-rejection',
    )
      ? 'correct'
      : 'incorrect';

    const headline = `#${r.trialIndex + 1} [${targets.join('+').toUpperCase()}]`;
    const subline = r.responseTimeMs !== null ? `RT: ${Math.round(r.responseTimeMs)}ms` : undefined;

    return {
      index: r.trialIndex + 1,
      kind: 'trace-trial',
      headline,
      subline,
      verdict,
      detail: {
        kind: 'tempo-trial',
        stimulus: {
          position: r.expectedPosition ?? null,
          audio: r.writingResult?.expectedLetter ?? null,
          color: r.expectedColor ? String(r.expectedColor) : null,
        },
        targets: targets,
        responses: detailResponses,
      },
    };
  });

  // Compute totals
  const totals: UnifiedTotals = {
    hits: Object.values(byModality).reduce((sum, m) => sum + m.hits, 0),
    misses: Object.values(byModality).reduce((sum, m) => sum + m.misses, 0),
    falseAlarms: null,
    correctRejections: null,
  };

  // Unified accuracy (combined position + writing if applicable)
  const totalActions = totals.hits + totals.misses;
  const unifiedAccuracy = totalActions > 0 ? totals.hits / totalActions : 0;

  // Mode score - spec-driven labels
  const displaySpec = getModeDisplaySpec('dual-trace');
  const modeScore: ModeScore = {
    labelKey: displaySpec.modeScoreKey,
    value: summary.score,
    unit: '%',
    tooltipKey: displaySpec.modeScoreTooltipKey,
  };

  // Speed stats - spec-driven labels
  const speedStats: SpeedStats | undefined = avgResponseTimeMs
    ? {
        labelKey: displaySpec.speedStatKey,
        valueMs: avgResponseTimeMs,
        secondary: avgWritingTimeMs
          ? [{ labelKey: 'report.speed.writingTime', valueMs: avgWritingTimeMs }]
          : undefined,
      }
    : undefined;

  // Next step
  const nLevel = summary.nLevel;
  const direction = nextLevel > nLevel ? 'up' : nextLevel < nLevel ? 'down' : 'same';
  const nextStep: NextStepRecommendation | undefined = journeyContext
    ? undefined
    : { nextLevel, direction };

  // Mode-specific details
  const traceDetails: TraceDetails = {
    kind: 'trace',
    correctPositions: stats.correctResponses,
    incorrectPositions: stats.incorrectResponses,
    timeouts: stats.timeouts,
    rhythmMode: summary.rhythmMode,
    avgResponseTimeMs,
    writingEnabled,
    writingAccuracy,
    correctWritings,
    totalWritings,
    avgWritingTimeMs,
    colorEnabled,
    colorAccuracy,
    correctColors,
    totalColors,
    confidenceScore,
  };

  // Use provided UPS or create fallback
  const ups = inputUps ?? createFallbackUPS(unifiedAccuracy);

  return {
    sessionId: input.sessionId,
    createdAt: input.createdAt,
    reason: summary.completed ? 'completed' : 'abandoned',
    gameMode: 'dual-trace',
    gameModeLabel,
    journeyContext,
    nLevel,
    activeModalities,
    trialsCount: summary.totalTrials,
    durationMs: summary.durationMs,
    ups,
    unifiedAccuracy,
    modeScore,
    passed,
    totals,
    byModality,
    errorProfile: computeErrorProfile(totals),
    speedStats,
    nextStep,
    modeDetails: traceDetails,
    turns,
  };
}
