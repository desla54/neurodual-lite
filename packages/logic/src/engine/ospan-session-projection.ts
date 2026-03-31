import { UnifiedScoreCalculator } from '../domain/scoring/unified-score';
import { OspanSpec } from '../specs/ospan.spec';
import type { UnifiedPerformanceScore } from '../types/ups';
import type {
  GameEvent,
  SessionPlayContext,
  OspanSessionStartedEvent,
  OspanSetCompletedEvent,
  OspanSessionEndedEvent,
} from './events';

export interface OspanSessionProjection {
  readonly startEvent?: OspanSessionStartedEvent;
  readonly endEvent?: OspanSessionEndedEvent;
  readonly setEvents: readonly OspanSetCompletedEvent[];
  readonly createdAt: Date;
  readonly playContext: SessionPlayContext;
  readonly reason: 'completed' | 'abandoned';
  readonly totalSets: number;
  readonly correctSets: number;
  readonly maxSpan: number;
  readonly recallAccuracyPercent: number;
  readonly recallAccuracyNormalized: number;
  readonly processingAccuracyPercent: number;
  readonly durationMs: number;
  readonly passed: boolean;
  readonly ups: UnifiedPerformanceScore;
}

const OSPAN_PASS_THRESHOLD = OspanSpec.scoring.passThreshold;
const OSPAN_PROCESSING_THRESHOLD =
  (OspanSpec.extensions as { processingAccuracyThreshold?: number }).processingAccuracyThreshold ??
  85;

export function projectOspanSessionFromEvents(
  events: readonly GameEvent[],
  isGaming = false,
): OspanSessionProjection | null {
  const startEvent = events.find(
    (e): e is OspanSessionStartedEvent => e.type === 'OSPAN_SESSION_STARTED',
  );
  const endEvent = [...events]
    .reverse()
    .find((e): e is OspanSessionEndedEvent => e.type === 'OSPAN_SESSION_ENDED');

  if (!startEvent && !endEvent) return null;

  const setEvents = events.filter(
    (e): e is OspanSetCompletedEvent => e.type === 'OSPAN_SET_COMPLETED',
  );

  const totalSets = setEvents.length;
  const correctSets = setEvents.filter((e) => e.recallCorrect).length;
  const maxSpan = setEvents.reduce((max, e) => (e.recallCorrect && e.span > max ? e.span : max), 0);

  const recallAccuracyPercent = totalSets > 0 ? (correctSets / totalSets) * 100 : 0;
  const recallAccuracyNormalized = recallAccuracyPercent / 100;

  const processingAccuracyPercent =
    endEvent?.processingAccuracy ??
    (totalSets > 0 ? setEvents.reduce((sum, e) => sum + e.equationAccuracy, 0) / totalSets : 0);

  const explicitDurationMs = endEvent?.durationMs ?? 0;
  const timestampDurationMs =
    startEvent && endEvent ? Math.max(0, endEvent.timestamp - startEvent.timestamp) : 0;
  const activityDurationMs = setEvents.reduce((sum, e) => sum + e.responseTimeMs, 0);
  const durationMs = Math.max(explicitDurationMs, timestampDurationMs, activityDurationMs);

  const createdAtMs =
    startEvent?.timestamp ?? (endEvent ? Math.max(0, endEvent.timestamp - durationMs) : Date.now());

  return {
    startEvent,
    endEvent,
    setEvents,
    createdAt: new Date(createdAtMs),
    playContext: startEvent?.playContext ?? endEvent?.playContext ?? 'free',
    reason: endEvent?.reason ?? 'abandoned',
    totalSets,
    correctSets,
    maxSpan,
    recallAccuracyPercent,
    recallAccuracyNormalized,
    processingAccuracyPercent,
    durationMs,
    passed:
      recallAccuracyNormalized >= OSPAN_PASS_THRESHOLD &&
      processingAccuracyPercent >= OSPAN_PROCESSING_THRESHOLD,
    ups: UnifiedScoreCalculator.calculate(
      recallAccuracyPercent,
      totalSets > 0 ? (maxSpan / 7) * 100 : null,
      isGaming,
      OspanSpec.metadata.id,
    ),
  };
}
