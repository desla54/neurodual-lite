import { UnifiedScoreCalculator } from '../domain/scoring/unified-score';
import { DualTimeSpec } from '../specs/time.spec';
import type { UnifiedPerformanceScore } from '../types/ups';
import type {
  GameEvent,
  SessionPlayContext,
  TimeSessionEndedEvent,
  TimeSessionStartedEvent,
  TimeTrialCompletedEvent,
} from './events';

export interface TimeSessionProjection {
  readonly startEvent?: TimeSessionStartedEvent;
  readonly endEvent?: TimeSessionEndedEvent;
  readonly trialEvents: readonly TimeTrialCompletedEvent[];
  readonly createdAt: Date;
  readonly playContext: SessionPlayContext;
  readonly reason: 'completed' | 'abandoned';
  readonly totalTrials: number;
  readonly completedTrials: number;
  readonly successfulTrials: number;
  readonly failedTrials: number;
  readonly accuracyPercent: number;
  readonly accuracyNormalized: number;
  readonly regularityPercent: number;
  readonly regularityNormalized: number;
  readonly durationMs: number;
  readonly passed: boolean;
  readonly ups: UnifiedPerformanceScore;
}

const TIME_PASS_THRESHOLD = DualTimeSpec.scoring.passThreshold;

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

export function projectTimeSessionFromEvents(
  events: readonly GameEvent[],
  isGaming = false,
): TimeSessionProjection | null {
  const startEvent = events.find((event): event is TimeSessionStartedEvent => {
    return event.type === 'TIME_SESSION_STARTED';
  });
  const endEvent = [...events]
    .reverse()
    .find((event): event is TimeSessionEndedEvent => event.type === 'TIME_SESSION_ENDED');

  if (!startEvent && !endEvent) return null;

  const trialEvents = events.filter((event): event is TimeTrialCompletedEvent => {
    return event.type === 'TIME_TRIAL_COMPLETED' && !event.skipped;
  });
  const completedTrials = trialEvents.length;
  const accuracyPercent =
    completedTrials > 0
      ? sum(trialEvents.map((event) => event.accuracyScore)) / completedTrials
      : 0;
  const regularityPercent =
    completedTrials > 0
      ? sum(trialEvents.map((event) => event.regularityScore)) / completedTrials
      : 0;
  const accuracyNormalized = accuracyPercent / 100;
  const regularityNormalized = regularityPercent / 100;
  const successfulTrials = trialEvents.filter((event) => {
    return event.accuracyScore / 100 >= TIME_PASS_THRESHOLD;
  }).length;
  const failedTrials = Math.max(0, completedTrials - successfulTrials);

  const totalTrials = endEvent?.totalTrials ?? startEvent?.config.trialsCount ?? completedTrials;
  const explicitDurationMs = endEvent?.durationMs ?? 0;
  const timestampDurationMs =
    startEvent && endEvent ? Math.max(0, endEvent.timestamp - startEvent.timestamp) : 0;
  const activityDurationMs = sum(trialEvents.map((event) => event.durationMs));
  const durationMs = Math.max(explicitDurationMs, timestampDurationMs, activityDurationMs);
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
    successfulTrials,
    failedTrials,
    accuracyPercent,
    accuracyNormalized,
    regularityPercent,
    regularityNormalized,
    durationMs,
    passed: accuracyNormalized >= TIME_PASS_THRESHOLD,
    ups: UnifiedScoreCalculator.calculate(
      accuracyPercent,
      completedTrials > 0 ? regularityPercent : null,
      isGaming,
      DualTimeSpec.metadata.id,
    ),
  };
}
