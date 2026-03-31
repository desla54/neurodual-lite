import { UnifiedScoreCalculator } from '../domain/scoring/unified-score';
import { RunningSpanSpec } from '../specs/running-span.spec';
import type { UnifiedPerformanceScore } from '../types/ups';
import type {
  GameEvent,
  SessionPlayContext,
  RunningSpanSessionStartedEvent,
  RunningSpanTrialCompletedEvent,
  RunningSpanSessionEndedEvent,
} from './events';

export interface RunningSpanSessionProjection {
  readonly startEvent?: RunningSpanSessionStartedEvent;
  readonly endEvent?: RunningSpanSessionEndedEvent;
  readonly trialEvents: readonly RunningSpanTrialCompletedEvent[];
  readonly createdAt: Date;
  readonly playContext: SessionPlayContext;
  readonly reason: 'completed' | 'abandoned';
  readonly totalTrials: number;
  readonly correctTrials: number;
  readonly maxSpan: number;
  readonly accuracyPercent: number;
  readonly accuracyNormalized: number;
  readonly durationMs: number;
  readonly passed: boolean;
  readonly ups: UnifiedPerformanceScore;
}

const PASS_THRESHOLD = RunningSpanSpec.scoring.passThreshold;

export function projectRunningSpanSessionFromEvents(
  events: readonly GameEvent[],
  isGaming = false,
): RunningSpanSessionProjection | null {
  const startEvent = events.find(
    (e): e is RunningSpanSessionStartedEvent => e.type === 'RUNNING_SPAN_SESSION_STARTED',
  );
  const endEvent = [...events]
    .reverse()
    .find((e): e is RunningSpanSessionEndedEvent => e.type === 'RUNNING_SPAN_SESSION_ENDED');

  if (!startEvent && !endEvent) return null;

  const trialEvents = events.filter(
    (e): e is RunningSpanTrialCompletedEvent => e.type === 'RUNNING_SPAN_TRIAL_COMPLETED',
  );

  const totalTrials = trialEvents.length;
  const correctTrials = trialEvents.filter((e) => e.correct).length;
  const maxSpan = trialEvents.reduce((max, e) => (e.correct && e.span > max ? e.span : max), 0);

  const accuracyPercent = totalTrials > 0 ? (correctTrials / totalTrials) * 100 : 0;
  const accuracyNormalized = accuracyPercent / 100;

  const explicitDurationMs = endEvent?.durationMs ?? 0;
  const timestampDurationMs =
    startEvent && endEvent ? Math.max(0, endEvent.timestamp - startEvent.timestamp) : 0;
  const activityDurationMs = trialEvents.reduce((sum, e) => sum + e.responseTimeMs, 0);
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
    correctTrials,
    maxSpan,
    accuracyPercent,
    accuracyNormalized,
    durationMs,
    passed: accuracyNormalized >= PASS_THRESHOLD,
    ups: UnifiedScoreCalculator.calculate(
      accuracyPercent,
      totalTrials > 0 ? (maxSpan / 9) * 100 : null,
      isGaming,
      RunningSpanSpec.metadata.id,
    ),
  };
}
