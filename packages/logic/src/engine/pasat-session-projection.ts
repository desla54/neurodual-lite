import { UnifiedScoreCalculator } from '../domain/scoring/unified-score';
import { PasatSpec } from '../specs/pasat.spec';
import type { UnifiedPerformanceScore } from '../types/ups';
import type {
  GameEvent,
  SessionPlayContext,
  PasatSessionStartedEvent,
  PasatTrialCompletedEvent,
  PasatSessionEndedEvent,
} from './events';

export interface PasatSessionProjection {
  readonly startEvent?: PasatSessionStartedEvent;
  readonly endEvent?: PasatSessionEndedEvent;
  readonly trialEvents: readonly PasatTrialCompletedEvent[];
  readonly createdAt: Date;
  readonly playContext: SessionPlayContext;
  readonly reason: 'completed' | 'abandoned';
  readonly totalTrials: number;
  readonly correctTrials: number;
  readonly accuracyPercent: number;
  readonly accuracyNormalized: number;
  readonly fastestIsiMs: number;
  readonly avgResponseTimeMs: number;
  readonly durationMs: number;
  readonly passed: boolean;
  readonly ups: UnifiedPerformanceScore;
}

const PASS_THRESHOLD = PasatSpec.scoring.passThreshold;

export function projectPasatSessionFromEvents(
  events: readonly GameEvent[],
  isGaming = false,
): PasatSessionProjection | null {
  const startEvent = events.find(
    (e): e is PasatSessionStartedEvent => e.type === 'PASAT_SESSION_STARTED',
  );
  const endEvent = [...events]
    .reverse()
    .find((e): e is PasatSessionEndedEvent => e.type === 'PASAT_SESSION_ENDED');

  if (!startEvent && !endEvent) return null;

  const trialEvents = events.filter(
    (e): e is PasatTrialCompletedEvent => e.type === 'PASAT_TRIAL_COMPLETED',
  );

  const totalTrials = trialEvents.length;
  const correctTrials = trialEvents.filter((e) => e.correct).length;
  const accuracyPercent = totalTrials > 0 ? (correctTrials / totalTrials) * 100 : 0;
  const accuracyNormalized = accuracyPercent / 100;

  const fastestIsiMs = trialEvents.length > 0 ? Math.min(...trialEvents.map((e) => e.isiMs)) : 0;

  const responseTimes = trialEvents.filter((e) => e.playerAnswer >= 0).map((e) => e.responseTimeMs);
  const avgResponseTimeMs =
    responseTimes.length > 0
      ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
      : 0;

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
    accuracyPercent,
    accuracyNormalized,
    fastestIsiMs,
    avgResponseTimeMs,
    durationMs,
    passed: accuracyNormalized >= PASS_THRESHOLD,
    ups: UnifiedScoreCalculator.calculate(accuracyPercent, null, isGaming, PasatSpec.metadata.id),
  };
}
