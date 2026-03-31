import { UnifiedScoreCalculator } from '../domain/scoring/unified-score';
import { SwmSpec } from '../specs/swm.spec';
import type { UnifiedPerformanceScore } from '../types/ups';
import type {
  GameEvent,
  SessionPlayContext,
  SwmSessionStartedEvent,
  SwmRoundCompletedEvent,
  SwmSessionEndedEvent,
} from './events';

export interface SwmSessionProjection {
  readonly startEvent?: SwmSessionStartedEvent;
  readonly endEvent?: SwmSessionEndedEvent;
  readonly roundEvents: readonly SwmRoundCompletedEvent[];
  readonly createdAt: Date;
  readonly playContext: SessionPlayContext;
  readonly reason: 'completed' | 'abandoned';
  readonly totalRounds: number;
  readonly correctRounds: number;
  readonly accuracyPercent: number;
  readonly accuracyNormalized: number;
  readonly maxSpanReached: number;
  readonly totalWithinErrors: number;
  readonly totalBetweenErrors: number;
  readonly totalErrors: number;
  readonly avgRoundTimeMs: number;
  readonly durationMs: number;
  readonly passed: boolean;
  readonly ups: UnifiedPerformanceScore;
}

const PASS_THRESHOLD = SwmSpec.scoring.passThreshold;

export function projectSwmSessionFromEvents(
  events: readonly GameEvent[],
  isGaming = false,
): SwmSessionProjection | null {
  const startEvent = events.find(
    (e): e is SwmSessionStartedEvent => e.type === 'SWM_SESSION_STARTED',
  );
  const endEvent = [...events]
    .reverse()
    .find((e): e is SwmSessionEndedEvent => e.type === 'SWM_SESSION_ENDED');

  if (!startEvent && !endEvent) return null;

  const roundEvents = events.filter(
    (e): e is SwmRoundCompletedEvent => e.type === 'SWM_ROUND_COMPLETED',
  );

  const totalRounds = roundEvents.length;
  const correctRounds = roundEvents.filter((e) => e.correct).length;
  const accuracyPercent = totalRounds > 0 ? (correctRounds / totalRounds) * 100 : 0;
  const accuracyNormalized = accuracyPercent / 100;

  const maxSpanReached =
    roundEvents.length > 0
      ? Math.max(...roundEvents.filter((e) => e.correct).map((e) => e.span), 0)
      : 0;

  const totalWithinErrors = roundEvents.reduce((s, e) => s + e.withinSearchErrors, 0);
  const totalBetweenErrors = roundEvents.reduce((s, e) => s + e.betweenSearchErrors, 0);
  const totalErrors = totalWithinErrors + totalBetweenErrors;

  const roundTimes = roundEvents.map((e) => e.roundTimeMs).filter((t) => t > 0);
  const avgRoundTimeMs =
    roundTimes.length > 0
      ? Math.round(roundTimes.reduce((a, b) => a + b, 0) / roundTimes.length)
      : 0;

  const explicitDurationMs = endEvent?.durationMs ?? 0;
  const timestampDurationMs =
    startEvent && endEvent ? Math.max(0, endEvent.timestamp - startEvent.timestamp) : 0;
  const activityDurationMs = roundEvents.reduce((sum, e) => sum + e.roundTimeMs, 0);
  const durationMs = Math.max(explicitDurationMs, timestampDurationMs, activityDurationMs);

  const createdAtMs =
    startEvent?.timestamp ?? (endEvent ? Math.max(0, endEvent.timestamp - durationMs) : Date.now());

  return {
    startEvent,
    endEvent,
    roundEvents,
    createdAt: new Date(createdAtMs),
    playContext: startEvent?.playContext ?? endEvent?.playContext ?? 'free',
    reason: endEvent?.reason ?? 'abandoned',
    totalRounds,
    correctRounds,
    accuracyPercent,
    accuracyNormalized,
    maxSpanReached,
    totalWithinErrors,
    totalBetweenErrors,
    totalErrors,
    avgRoundTimeMs,
    durationMs,
    passed: accuracyNormalized >= PASS_THRESHOLD,
    ups: UnifiedScoreCalculator.calculate(accuracyPercent, null, isGaming, SwmSpec.metadata.id),
  };
}
