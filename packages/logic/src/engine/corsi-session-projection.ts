import { UnifiedScoreCalculator } from '../domain/scoring/unified-score';
import { CorsiBlockSpec } from '../specs/corsi.spec';
import type { UnifiedPerformanceScore } from '../types/ups';
import type {
  GameEvent,
  SessionPlayContext,
  CorsiSessionStartedEvent,
  CorsiTrialCompletedEvent,
  CorsiSessionEndedEvent,
} from './events';

export interface CorsiSessionProjection {
  readonly startEvent?: CorsiSessionStartedEvent;
  readonly endEvent?: CorsiSessionEndedEvent;
  readonly trialEvents: readonly CorsiTrialCompletedEvent[];
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

const CORSI_PASS_THRESHOLD = CorsiBlockSpec.scoring.passThreshold;

export function projectCorsiSessionFromEvents(
  events: readonly GameEvent[],
  isGaming = false,
): CorsiSessionProjection | null {
  const startEvent = events.find(
    (e): e is CorsiSessionStartedEvent => e.type === 'CORSI_SESSION_STARTED',
  );
  const endEvent = [...events]
    .reverse()
    .find((e): e is CorsiSessionEndedEvent => e.type === 'CORSI_SESSION_ENDED');

  if (!startEvent && !endEvent) return null;

  const trialEvents = events.filter(
    (e): e is CorsiTrialCompletedEvent => e.type === 'CORSI_TRIAL_COMPLETED',
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
    passed: accuracyNormalized >= CORSI_PASS_THRESHOLD,
    ups: UnifiedScoreCalculator.calculate(
      accuracyPercent,
      totalTrials > 0 ? (maxSpan / 9) * 100 : null,
      isGaming,
      CorsiBlockSpec.metadata.id,
    ),
  };
}
