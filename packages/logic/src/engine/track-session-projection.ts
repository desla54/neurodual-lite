import { UnifiedScoreCalculator } from '../domain/scoring/unified-score';
import { DualTrackSpec } from '../specs/track.spec';
import {
  MOT_DEFAULT_TARGET_COUNT,
  MOT_DEFAULT_TOTAL_OBJECTS,
  MOT_TRACKING_DURATION_MS,
  MOT_SPEED_PX_PER_SEC,
} from '../specs/thresholds';
import type { UnifiedPerformanceScore } from '../types/ups';
import type {
  GameEvent,
  MotSessionEndedEvent,
  MotSessionStartedEvent,
  MotTrialCompletedEvent,
  SessionPlayContext,
} from './events';

export interface TrackModalityStats {
  readonly hits: number;
  readonly misses: number;
  readonly trialsWithModality: number;
}

export interface TrackSessionProjection {
  readonly startEvent?: MotSessionStartedEvent;
  readonly endEvent?: MotSessionEndedEvent;
  readonly trialEvents: readonly MotTrialCompletedEvent[];
  readonly createdAt: Date;
  readonly playContext: SessionPlayContext;
  readonly reason: 'completed' | 'abandoned';
  readonly totalTrials: number;
  readonly completedTrials: number;
  readonly totalObjects: number;
  readonly targetCount: number;
  readonly totalTargetsPresented: number;
  readonly totalHits: number;
  readonly totalMisses: number;
  readonly totalFalseAlarms: number;
  readonly totalCorrectRejections: number;
  readonly accuracyNormalized: number;
  readonly accuracyPercent: number;
  readonly selectionPrecisionNormalized: number;
  readonly selectionPrecisionPercent: number;
  readonly selectionQualityNormalized: number;
  readonly selectionQualityPercent: number;
  readonly perfectTrials: number;
  readonly avgResponseTimeMs: number | null;
  readonly medianResponseTimeMs: number | null;
  readonly responseTimeStdDev: number | null;
  readonly trackingDurationMs: number;
  readonly speedPxPerSec: number;
  readonly motionComplexity: 'smooth' | 'standard' | 'agile';
  readonly crowdingThresholdPx: number;
  readonly minSeparationPx: number;
  readonly totalCrowdingEvents: number;
  readonly avgCrowdingEventsPerTrial: number | null;
  readonly minInterObjectDistancePx: number | null;
  readonly masteryTargetCountStage: number | null;
  readonly masteryDifficultyTier: number | null;
  readonly masteryTierCount: number | null;
  readonly masteryStageProgressPct: number | null;
  readonly masteryPhaseIndex: number | null;
  readonly masteryPhaseIdentityMode: 'classic' | 'audio' | 'color' | 'audio-color' | null;
  readonly highestCompletedTargetCount: number | null;
  readonly promotedTargetCount: boolean;
  readonly performanceBand: 'mastery' | 'solid' | 'building' | 'struggling' | null;
  readonly nextTargetCountStage: number | null;
  readonly nextDifficultyTier: number | null;
  readonly durationMs: number;
  readonly passed: boolean;
  readonly ups: UnifiedPerformanceScore;
  /** Per-modality breakdown — available when identity prompts are used. */
  readonly hasColorIdentity: boolean;
  readonly hasAudioIdentity: boolean;
  readonly colorBindingStats: TrackModalityStats | null;
  readonly audioBindingStats: TrackModalityStats | null;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function average(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return sum(values) / values.length;
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 !== 0) {
    return sorted[mid] ?? null;
  }
  const left = sorted[mid - 1];
  const right = sorted[mid];
  if (left === undefined || right === undefined) return null;
  return (left + right) / 2;
}

function stdDev(values: readonly number[], mean: number | null): number | null {
  if (values.length === 0 || mean === null) return null;
  const variance = values.reduce((acc, value) => acc + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Compute per-prompt identity binding accuracy from a trial with selectionPromptOrder.
 *
 * For each prompt i:
 * - expected = targetIndices[selectionPromptOrder[i]]
 * - actual = selectedIndices[i]
 * - hit if expected === actual, miss otherwise
 */
function computeIdentityBindingForTrial(event: MotTrialCompletedEvent): {
  hits: number;
  misses: number;
} | null {
  const order = event.selectionPromptOrder;
  if (!order || order.length === 0) return null;

  let hits = 0;
  let misses = 0;
  for (let i = 0; i < order.length; i++) {
    const promptIdx = order[i];
    if (promptIdx === undefined) continue;
    const expected = event.targetIndices[promptIdx];
    const actual = event.selectedIndices[i];
    if (expected === undefined) continue;
    if (actual === expected) hits++;
    else misses++;
  }
  return { hits, misses };
}

function countTrackFalseAlarms(event: MotTrialCompletedEvent): number {
  const hasIdentityPrompts =
    (event.identityPromptColorIds?.length ?? 0) > 0 ||
    (event.identityPromptLetters?.length ?? 0) > 0 ||
    (event.identityPromptTones?.length ?? 0) > 0;

  if (!hasIdentityPrompts) {
    return Math.max(0, event.selectedIndices.length - event.correctCount);
  }

  const targetSet = new Set(event.targetIndices);
  return event.selectedIndices.filter((index) => !targetSet.has(index)).length;
}

export function projectTrackSessionFromEvents(
  events: readonly GameEvent[],
  isGaming = false,
): TrackSessionProjection | null {
  const startEvent = events.find((event): event is MotSessionStartedEvent => {
    return event.type === 'MOT_SESSION_STARTED';
  });
  const endEvent = [...events]
    .reverse()
    .find((event): event is MotSessionEndedEvent => event.type === 'MOT_SESSION_ENDED');

  if (!startEvent && !endEvent) return null;

  const trialEvents = events.filter((event): event is MotTrialCompletedEvent => {
    return event.type === 'MOT_TRIAL_COMPLETED';
  });

  const totalObjects = startEvent?.config.totalObjects ?? MOT_DEFAULT_TOTAL_OBJECTS;
  const targetCount = startEvent?.config.targetCount ?? MOT_DEFAULT_TARGET_COUNT;
  const totalTrials = endEvent?.totalTrials ?? startEvent?.config.trialsCount ?? trialEvents.length;
  const completedTrials = trialEvents.length;

  const totalTargetsPresented = sum(trialEvents.map((event) => event.totalTargets));
  const totalHits = sum(trialEvents.map((event) => event.correctCount));
  const totalSelections = sum(trialEvents.map((event) => event.selectedIndices.length));
  const totalFalseAlarms = sum(trialEvents.map(countTrackFalseAlarms));
  const totalDistractorsPresented = sum(
    trialEvents.map((event) => Math.max(0, totalObjects - event.totalTargets)),
  );
  const totalMisses = Math.max(0, totalTargetsPresented - totalHits);
  const totalCorrectRejections = Math.max(0, totalDistractorsPresented - totalFalseAlarms);
  const selectionPrecisionNormalized = totalSelections > 0 ? totalHits / totalSelections : 0;
  const selectionQualityNormalized =
    2 * totalHits + totalFalseAlarms + totalMisses > 0
      ? (2 * totalHits) / (2 * totalHits + totalFalseAlarms + totalMisses)
      : 0;
  const perfectTrials = trialEvents.filter(
    (event) =>
      event.correctCount === event.totalTargets &&
      event.selectedIndices.length === event.totalTargets,
  ).length;

  const accuracyNormalized = totalTargetsPresented > 0 ? totalHits / totalTargetsPresented : 0;
  const accuracyPercent = accuracyNormalized * 100;
  const selectionPrecisionPercent = selectionPrecisionNormalized * 100;
  const selectionQualityPercent = selectionQualityNormalized * 100;

  const responseTimes = trialEvents
    .map((event) => event.responseTimeMs)
    .filter((value) => Number.isFinite(value) && value >= 0);
  const avgResponseTimeMs = average(responseTimes);
  const medianResponseTimeMs = median(responseTimes);
  const responseTimeStdDev = stdDev(responseTimes, avgResponseTimeMs);
  const totalCrowdingEvents = sum(trialEvents.map((event) => event.crowdingEvents));
  const avgCrowdingEventsPerTrial =
    completedTrials > 0 ? totalCrowdingEvents / completedTrials : null;
  const minInterObjectDistancePx =
    trialEvents.length > 0
      ? Math.min(...trialEvents.map((event) => event.minInterObjectDistancePx))
      : null;
  const adaptivePath = endEvent?.adaptivePath ?? startEvent?.adaptivePath;

  // Per-modality identity binding stats
  const colorTrials = trialEvents.filter(
    (e) => (e.identityPromptColorIds?.length ?? 0) > 0 && (e.selectionPromptOrder?.length ?? 0) > 0,
  );
  const audioTrials = trialEvents.filter(
    (e) =>
      ((e.identityPromptLetters?.length ?? 0) > 0 || (e.identityPromptTones?.length ?? 0) > 0) &&
      (e.selectionPromptOrder?.length ?? 0) > 0,
  );
  const hasColorIdentity = colorTrials.length > 0;
  const hasAudioIdentity = audioTrials.length > 0;

  const colorBindingStats: TrackModalityStats | null = hasColorIdentity
    ? colorTrials.reduce(
        (acc, trial) => {
          const result = computeIdentityBindingForTrial(trial);
          if (!result) return acc;
          return {
            hits: acc.hits + result.hits,
            misses: acc.misses + result.misses,
            trialsWithModality: acc.trialsWithModality + 1,
          };
        },
        { hits: 0, misses: 0, trialsWithModality: 0 } as TrackModalityStats,
      )
    : null;

  const audioBindingStats: TrackModalityStats | null = hasAudioIdentity
    ? audioTrials.reduce(
        (acc, trial) => {
          const result = computeIdentityBindingForTrial(trial);
          if (!result) return acc;
          return {
            hits: acc.hits + result.hits,
            misses: acc.misses + result.misses,
            trialsWithModality: acc.trialsWithModality + 1,
          };
        },
        { hits: 0, misses: 0, trialsWithModality: 0 } as TrackModalityStats,
      )
    : null;

  const explicitDurationMs = endEvent?.durationMs ?? 0;
  const timestampDurationMs =
    startEvent && endEvent ? Math.max(0, endEvent.timestamp - startEvent.timestamp) : 0;
  const durationMs = Math.max(explicitDurationMs, timestampDurationMs);
  const createdAtMs =
    startEvent?.timestamp ?? (endEvent ? Math.max(0, endEvent.timestamp - durationMs) : Date.now());

  return {
    startEvent,
    endEvent,
    trialEvents,
    createdAt: new Date(createdAtMs),
    playContext: startEvent?.playContext ?? endEvent?.playContext ?? 'free',
    reason: endEvent?.reason ?? 'abandoned',
    totalTrials,
    completedTrials,
    totalObjects,
    targetCount,
    totalTargetsPresented,
    totalHits,
    totalMisses,
    totalFalseAlarms,
    totalCorrectRejections,
    accuracyNormalized,
    accuracyPercent,
    selectionPrecisionNormalized,
    selectionPrecisionPercent,
    selectionQualityNormalized,
    selectionQualityPercent,
    perfectTrials,
    avgResponseTimeMs,
    medianResponseTimeMs,
    responseTimeStdDev,
    trackingDurationMs: startEvent?.config.trackingDurationMs ?? MOT_TRACKING_DURATION_MS,
    speedPxPerSec: startEvent?.config.speedPxPerSec ?? MOT_SPEED_PX_PER_SEC,
    motionComplexity: startEvent?.config.motionComplexity ?? 'standard',
    crowdingThresholdPx: startEvent?.config.crowdingThresholdPx ?? 0,
    minSeparationPx: startEvent?.config.minSeparationPx ?? 0,
    totalCrowdingEvents,
    avgCrowdingEventsPerTrial,
    minInterObjectDistancePx,
    masteryTargetCountStage: adaptivePath?.targetCountStage ?? null,
    masteryDifficultyTier: adaptivePath?.difficultyTier ?? null,
    masteryTierCount: adaptivePath?.tierCount ?? null,
    masteryStageProgressPct: adaptivePath?.stageProgressPct ?? null,
    masteryPhaseIndex: adaptivePath?.phaseIndex ?? null,
    masteryPhaseIdentityMode: adaptivePath?.phaseIdentityMode ?? null,
    highestCompletedTargetCount: adaptivePath?.highestCompletedTargetCount ?? null,
    promotedTargetCount: adaptivePath?.promotedTargetCount ?? false,
    performanceBand: adaptivePath?.performanceBand ?? null,
    nextTargetCountStage: adaptivePath?.nextTargetCountStage ?? null,
    nextDifficultyTier: adaptivePath?.nextDifficultyTier ?? null,
    durationMs,
    passed: accuracyNormalized >= DualTrackSpec.scoring.passThreshold,
    ups: UnifiedScoreCalculator.calculate(
      accuracyPercent,
      selectionQualityPercent,
      isGaming,
      DualTrackSpec.metadata.id,
    ),
    hasColorIdentity,
    hasAudioIdentity,
    colorBindingStats,
    audioBindingStats,
  };
}
