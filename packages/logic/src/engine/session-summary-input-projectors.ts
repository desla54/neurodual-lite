import { ACCURACY_PASS_NORMALIZED, TRACE_ACCURACY_PASS_NORMALIZED } from '../specs/thresholds';
import type { SessionSummaryInput } from '../ports/persistence-port';
import { normalizeModeId } from '../utils/mode-normalizer';
import { calculateTempoSessionPassed } from '../domain/scoring/session-passed';
import { UnifiedScoreCalculator } from '../domain/scoring/unified-score';
import type {
  DualPickSessionEndedEvent,
  DualPickSessionStartedEvent,
  GameEvent,
  MemoSessionEndedEvent,
  MemoSessionStartedEvent,
  MemoStimulusShownEvent,
  PlaceSessionEndedEvent,
  PlaceSessionStartedEvent,
  SessionEndedEvent,
  SessionImportedEvent,
  SessionStartedEvent,
  TraceResponseEvent,
  TraceSessionEndedEvent,
  TraceSessionStartedEvent,
  UserResponseEvent,
} from './events';
import type { Trial } from '../types/core';
import { projectTempoSessionEntrypoint } from './tempo-projection-entrypoint';
import { MemoSessionProjector } from './memo-projector';
import { PlaceSessionProjector } from './place-projector';
import { DualPickSessionProjector } from './dual-pick-projector';
import { projectOspanSessionFromEvents } from './ospan-session-projection';
import { UPSProjector } from './ups-projector';

interface TimingMetrics {
  avgResponseTimeMs: number | undefined;
  medianResponseTimeMs: number | undefined;
  responseTimeStdDev: number | undefined;
  avgPressDurationMs: number | undefined;
  pressDurationStdDev: number | undefined;
  responsesDuringStimulus: number;
  responsesAfterStimulus: number;
}

interface FocusMetrics {
  focusLostCount: number;
  focusLostTotalMs: number;
}

function extractFocusMetrics(events: readonly GameEvent[]): FocusMetrics {
  const focusLostEvents = events.filter((e) => e.type === 'FOCUS_LOST');
  const focusRegainedEvents = events.filter(
    (e): e is GameEvent & { lostDurationMs: number } => e.type === 'FOCUS_REGAINED',
  );

  const focusLostTotalMs = Math.round(
    focusRegainedEvents.reduce((sum, e) => sum + e.lostDurationMs, 0),
  );

  return {
    focusLostCount: focusLostEvents.length,
    focusLostTotalMs,
  };
}

function computeMean(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function computeMedian(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 !== 0) {
    return sorted[mid];
  }
  const left = sorted[mid - 1];
  const right = sorted[mid];
  if (left === undefined || right === undefined) return undefined;
  return (left + right) / 2;
}

function computeStdDev(values: readonly number[], mean: number | undefined): number | undefined {
  if (values.length < 2 || mean === undefined) return undefined;
  const squaredDiffs = values.map((v) => (v - mean) ** 2);
  const variance = squaredDiffs.reduce((sum, v) => sum + v, 0) / values.length;
  return Math.sqrt(variance);
}

function extractTimingMetrics(events: readonly GameEvent[]): TimingMetrics {
  const responses = events.filter((e): e is UserResponseEvent => e.type === 'USER_RESPONDED');

  const reactionTimes = responses.map((r) => r.reactionTimeMs);
  const pressDurations = responses.map((r) => r.pressDurationMs);

  const avgRT = computeMean(reactionTimes);
  const medianRT = computeMedian(reactionTimes);
  const rtStdDev = computeStdDev(reactionTimes, avgRT);

  const avgPress = computeMean(pressDurations);
  const pressStdDev = computeStdDev(pressDurations, avgPress);

  const responsesDuring = responses.filter((r) => r.responsePhase === 'during_stimulus').length;
  const responsesAfter = responses.filter((r) => r.responsePhase === 'after_stimulus').length;

  return {
    avgResponseTimeMs: avgRT,
    medianResponseTimeMs: medianRT,
    responseTimeStdDev: rtStdDev,
    avgPressDurationMs: avgPress,
    pressDurationStdDev: pressStdDev,
    responsesDuringStimulus: responsesDuring,
    responsesAfterStimulus: responsesAfter,
  };
}

function extractInputMethods(events: readonly GameEvent[]): string | undefined {
  const methods = new Set<string>();
  for (const e of events) {
    const method = (e as unknown as { inputMethod?: string }).inputMethod;
    if (typeof method === 'string' && method !== '') {
      methods.add(method);
    }
  }
  if (methods.size === 0) return undefined;
  return [...methods].sort().join(',');
}

function computeWorstModalityErrorRate(
  byModality: Record<string, unknown> | undefined,
): number | undefined {
  if (!byModality) return undefined;

  const errorRates: number[] = [];

  for (const data of Object.values(byModality)) {
    if (typeof data !== 'object' || data === null) continue;
    const d = data as Record<string, unknown>;

    const hits = Number(d['hits']) || Number(d['correct']) || 0;
    const misses = Number(d['misses']) || Number(d['incorrect']) || 0;
    const fa = Number(d['falseAlarms']) || 0;
    const total = hits + misses + fa;

    if (total > 0) {
      const errorRate = ((misses + fa) / total) * 100;
      errorRates.push(errorRate);
    }
  }

  return errorRates.length > 0 ? Math.max(...errorRates) : undefined;
}

function calculateTempoSessionPassedLocal(
  generator: string | undefined,
  gameMode: string | undefined,
  byModality: Record<
    string,
    { hits: number; misses: number; falseAlarms: number; correctRejections: number }
  >,
  globalDPrime: number,
): boolean {
  return calculateTempoSessionPassed({ generator, gameMode, byModality, globalDPrime });
}

function deriveImportedSessionType(
  gameMode: string | undefined,
): SessionSummaryInput['sessionType'] {
  const normalizedGameMode = normalizeModeId(gameMode ?? '');
  if (normalizedGameMode === 'dual-memo') return 'recall';
  if (normalizedGameMode === 'dual-place') return 'flow';
  if (normalizedGameMode === 'dual-pick') return 'dual-pick';
  if (normalizedGameMode === 'dual-trace') return 'trace';
  if (
    normalizedGameMode === 'dual-catch' ||
    normalizedGameMode === 'dualnback-classic' ||
    normalizedGameMode === 'sim-brainworkshop'
  ) {
    return 'tempo';
  }
  return 'imported';
}

function computeImportedTotals(byModality: SessionImportedEvent['byModality']): {
  totalHits: number;
  totalMisses: number;
  totalFa: number;
  totalCr: number;
  accuracy: number;
} {
  let totalHits = 0;
  let totalMisses = 0;
  let totalFa = 0;
  let totalCr = 0;

  for (const stats of Object.values(byModality)) {
    totalHits += stats.hits ?? 0;
    totalMisses += stats.misses ?? 0;
    totalFa += stats.falseAlarms ?? 0;
    totalCr += stats.correctRejections ?? 0;
  }

  const total = totalHits + totalMisses + totalFa + totalCr;
  const accuracy = total > 0 ? (totalHits + totalCr) / total : 0;
  return { totalHits, totalMisses, totalFa, totalCr, accuracy };
}

function calculateImportedUpsFallback(
  byModality: SessionImportedEvent['byModality'],
  gameMode?: string,
): number | undefined {
  let totalHits = 0;
  let totalMisses = 0;
  let totalFa = 0;
  let totalCr = 0;

  for (const stats of Object.values(byModality)) {
    totalHits += stats.hits ?? 0;
    totalMisses += stats.misses ?? 0;
    totalFa += stats.falseAlarms ?? 0;
    totalCr += stats.correctRejections ?? 0;
  }

  const total = totalHits + totalMisses + totalFa + totalCr;
  if (total === 0) return undefined;

  return UnifiedScoreCalculator.calculateTempoAccuracy(
    {
      hits: totalHits,
      misses: totalMisses,
      falseAlarms: totalFa,
      correctRejections: totalCr,
    },
    normalizeModeId(gameMode ?? 'dual-catch'),
  );
}

function parseFlexibleDate(value: unknown, fallbackTimestamp?: number): Date {
  if (value instanceof Date) return value;

  if (typeof value === 'number') {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }

  if (typeof value === 'string') {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }

  if (fallbackTimestamp !== undefined) {
    return new Date(fallbackTimestamp);
  }

  throw new Error(`Invalid date value: ${String(value)}`);
}

// Removed: Track calibration modality helpers (deleted game mode)

export function projectImportedSessionToSummaryInput(
  event: SessionImportedEvent,
  userId: string,
): SessionSummaryInput {
  const importedGameMode = event.gameMode ? normalizeModeId(event.gameMode) : undefined;
  const { totalHits, totalMisses, totalFa, totalCr, accuracy } = computeImportedTotals(
    event.byModality,
  );
  const sessionType = deriveImportedSessionType(importedGameMode);

  return {
    sessionId: event.sessionId,
    userId,
    sessionType,
    createdAt: parseFlexibleDate(event.originalCreatedAt, event.timestamp),
    nLevel: event.nLevel,
    durationMs: event.durationMs,
    trialsCount: event.trialsCount,
    totalHits,
    totalMisses,
    totalFa,
    totalCr,
    globalDPrime: event.dPrime,
    accuracy,
    passed: event.passed,
    generator: event.generator,
    gameMode: importedGameMode,
    reason: event.reason ?? 'completed',
    journeyStageId: event.journeyStageId?.toString(),
    journeyId: event.journeyId,
    playContext: event.playContext,
    byModality: event.byModality,
    flowConfidenceScore: event.flowConfidenceScore,
    flowDirectnessRatio: event.flowDirectnessRatio,
    flowWrongSlotDwellMs: event.flowWrongSlotDwellMs,
    recallConfidenceScore: event.recallConfidenceScore,
    recallFluencyScore: event.recallFluencyScore,
    recallCorrectionsCount: event.recallCorrectionsCount,
    upsScore: event.upsScore ?? calculateImportedUpsFallback(event.byModality, importedGameMode),
    upsAccuracy: event.upsAccuracy,
    upsConfidence: event.upsConfidence,
    avgResponseTimeMs: event.avgResponseTimeMs,
    medianResponseTimeMs: event.medianResponseTimeMs,
    responseTimeStdDev: event.responseTimeStdDev,
    avgPressDurationMs: event.avgPressDurationMs,
    pressDurationStdDev: event.pressDurationStdDev,
    responsesDuringStimulus: event.responsesDuringStimulus,
    responsesAfterStimulus: event.responsesAfterStimulus,
    focusLostCount: event.focusLostCount,
    focusLostTotalMs: event.focusLostTotalMs,
    worstModalityErrorRate: computeWorstModalityErrorRate(event.byModality),
  };
}

export function projectTempoSessionToSummaryInput(input: {
  sessionId: string;
  sessionEvents: readonly GameEvent[];
  userId: string;
}): SessionSummaryInput | null {
  const startEventCandidate = input.sessionEvents.find(
    (e): e is SessionStartedEvent =>
      e.type === 'SESSION_STARTED' && e.sessionId === input.sessionId,
  );

  const gameMode = startEventCandidate?.gameMode
    ? normalizeModeId(startEventCandidate.gameMode)
    : 'dual-catch';

  const tempoProjection = projectTempoSessionEntrypoint({
    sessionId: input.sessionId,
    gameMode,
    events: [...input.sessionEvents],
  });
  if (!tempoProjection) return null;

  const summary = tempoProjection.summary;
  const eventsForProjection: GameEvent[] = [...tempoProjection.eventsForProjection];

  const startEvent = eventsForProjection.find((e) => e.type === 'SESSION_STARTED') as
    | SessionStartedEvent
    | undefined;
  const sessionEndEvent = eventsForProjection.find((e) => e.type === 'SESSION_ENDED') as
    | SessionEndedEvent
    | undefined;

  const stats = summary.finalStats;

  const byModality: Record<string, unknown> = {};
  let totalHits = 0;
  let totalMisses = 0;
  let totalFa = 0;
  let totalCr = 0;
  for (const [modalityId, modalityStats] of Object.entries(stats.byModality)) {
    byModality[modalityId] = {
      hits: modalityStats.hits,
      misses: modalityStats.misses,
      falseAlarms: modalityStats.falseAlarms,
      correctRejections: modalityStats.correctRejections,
      avgRT: modalityStats.avgRT,
      dPrime: modalityStats.dPrime,
    };
    totalHits += modalityStats.hits;
    totalMisses += modalityStats.misses;
    totalFa += modalityStats.falseAlarms;
    totalCr += modalityStats.correctRejections;
  }

  const generator = startEvent?.config?.generator ?? 'BrainWorkshop';

  const upsResult = UPSProjector.project(eventsForProjection);
  const upsScore = upsResult?.ups.score ?? null;
  const upsAccuracy = upsResult?.ups.components.accuracy ?? null;
  const upsConfidence = upsResult?.ups.components.confidence ?? null;

  const timing = extractTimingMetrics(eventsForProjection);
  const focus = extractFocusMetrics(eventsForProjection);
  const inputMethods = extractInputMethods(eventsForProjection);

  const nLevel = summary.nLevel ?? startEvent?.config?.nLevel ?? startEvent?.nLevel ?? 2;

  const journeyStageId = (
    startEvent?.journeyStageId ?? sessionEndEvent?.journeyStageId
  )?.toString();
  const journeyId = startEvent?.journeyId ?? sessionEndEvent?.journeyId;

  return {
    sessionId: input.sessionId,
    userId: input.userId,
    sessionType: 'tempo',
    createdAt: startEvent ? new Date(startEvent.timestamp) : new Date(),
    nLevel,
    durationMs: summary.durationMs,
    trialsCount: summary.totalTrials,
    totalHits,
    totalMisses,
    totalFa,
    totalCr,
    globalDPrime: stats.globalDPrime,
    passed: calculateTempoSessionPassedLocal(
      generator,
      gameMode,
      byModality as unknown as Record<
        string,
        { hits: number; misses: number; falseAlarms: number; correctRejections: number }
      >,
      stats.globalDPrime,
    ),
    generator,
    gameMode,
    reason: sessionEndEvent?.reason ?? 'completed',
    journeyStageId,
    journeyId,
    playContext: startEvent?.playContext ?? sessionEndEvent?.playContext ?? 'free',
    byModality,
    upsScore: upsScore ?? undefined,
    avgResponseTimeMs: timing.avgResponseTimeMs,
    medianResponseTimeMs: timing.medianResponseTimeMs,
    responseTimeStdDev: timing.responseTimeStdDev,
    avgPressDurationMs: timing.avgPressDurationMs,
    pressDurationStdDev: timing.pressDurationStdDev,
    responsesDuringStimulus: timing.responsesDuringStimulus,
    responsesAfterStimulus: timing.responsesAfterStimulus,
    focusLostCount: focus.focusLostCount > 0 ? focus.focusLostCount : undefined,
    focusLostTotalMs: focus.focusLostTotalMs > 0 ? focus.focusLostTotalMs : undefined,
    upsAccuracy: upsAccuracy ?? undefined,
    upsConfidence: upsConfidence ?? undefined,
    worstModalityErrorRate: computeWorstModalityErrorRate(byModality),
    xpBreakdown: sessionEndEvent?.xpBreakdown as Record<string, unknown> | undefined,
    inputMethods,
  };
}

export function projectRecallSessionToSummaryInput(input: {
  sessionId: string;
  sessionEvents: readonly GameEvent[];
  userId: string;
}): SessionSummaryInput | null {
  const recallStartEvent = input.sessionEvents.find((e) => e.type === 'RECALL_SESSION_STARTED') as
    | MemoSessionStartedEvent
    | undefined;
  if (!recallStartEvent) return null;

  const trials: Trial[] = input.sessionEvents
    .filter((e): e is MemoStimulusShownEvent => e.type === 'RECALL_STIMULUS_SHOWN')
    .map((e) => e.trial);

  const recallSummary = MemoSessionProjector.projectExtended([...input.sessionEvents], trials);
  if (!recallSummary) return null;

  const recallEndEvent = input.sessionEvents.find((e) => e.type === 'RECALL_SESSION_ENDED') as
    | MemoSessionEndedEvent
    | undefined;
  const stats = recallSummary.finalStats;

  const correctionsTotal = recallSummary.windowConfidence.reduce(
    (sum, w) => sum + w.correctionCount,
    0,
  );

  const upsResult = UPSProjector.project([...input.sessionEvents], trials);
  const upsScore = upsResult?.ups.score ?? null;
  const upsAccuracy = upsResult?.ups.components.accuracy ?? null;
  const upsConfidence = upsResult?.ups.components.confidence ?? null;

  const recallTotalHits = stats.correctPicks;
  const recallTotalMisses = stats.totalPicks - stats.correctPicks;

  const recallNLevel = recallSummary.nLevel ?? recallStartEvent.config?.nLevel ?? 2;

  const journeyStageId = recallStartEvent.journeyStageId?.toString();
  const journeyId = recallStartEvent.journeyId;

  return {
    sessionId: input.sessionId,
    userId: input.userId,
    sessionType: 'recall',
    createdAt: new Date(recallStartEvent.timestamp),
    nLevel: recallNLevel,
    durationMs: recallSummary.durationMs,
    trialsCount: recallSummary.totalTrials,
    totalHits: recallTotalHits,
    totalMisses: recallTotalMisses,
    totalFa: 0,
    totalCr: 0,
    accuracy: stats.accuracy,
    globalDPrime: stats.accuracy * 3,
    passed: stats.accuracy >= ACCURACY_PASS_NORMALIZED,
    generator: 'dual-memo',
    gameMode: 'dual-memo',
    reason: recallEndEvent?.reason ?? 'completed',
    journeyStageId,
    journeyId,
    playContext: recallStartEvent.playContext ?? recallEndEvent?.playContext ?? 'free',
    byModality: stats.byModality,
    recallConfidenceScore: recallSummary.avgConfidenceScore ?? undefined,
    recallFluencyScore: recallSummary.fluencyScore,
    recallCorrectionsCount: correctionsTotal,
    upsScore: upsScore ?? undefined,
    upsAccuracy: upsAccuracy ?? undefined,
    upsConfidence: upsConfidence ?? undefined,
    worstModalityErrorRate: computeWorstModalityErrorRate(
      stats.byModality as unknown as Record<string, unknown>,
    ),
    inputMethods: extractInputMethods(input.sessionEvents),
  };
}

export function projectFlowSessionToSummaryInput(input: {
  sessionId: string;
  sessionEvents: readonly GameEvent[];
  userId: string;
}): SessionSummaryInput | null {
  const flowStartEvent = input.sessionEvents.find((e) => e.type === 'FLOW_SESSION_STARTED') as
    | PlaceSessionStartedEvent
    | undefined;
  if (!flowStartEvent) return null;

  const placeSummary = PlaceSessionProjector.project([...input.sessionEvents]);
  if (!placeSummary) return null;

  const flowEndEvent = input.sessionEvents.find((e) => e.type === 'FLOW_SESSION_ENDED') as
    | PlaceSessionEndedEvent
    | undefined;
  const stats = placeSummary.extendedStats;

  const correctDropMetrics = placeSummary.dropConfidenceMetrics.filter((m) => m.correct);
  const directnessRatioAvg =
    correctDropMetrics.length > 0
      ? correctDropMetrics.reduce((sum, m) => sum + m.directnessRatio, 0) /
        correctDropMetrics.length
      : null;
  const wrongSlotDwellMsTotal = placeSummary.dropConfidenceMetrics.reduce(
    (sum, m) => sum + m.wrongSlotDwellMs,
    0,
  );

  const upsResult = UPSProjector.project([...input.sessionEvents]);
  const upsScore = upsResult?.ups.score ?? null;
  const upsAccuracy = upsResult?.ups.components.accuracy ?? null;
  const upsConfidence = upsResult?.ups.components.confidence ?? null;

  const flowTotalHits = stats.correctDrops;
  const flowTotalMisses = stats.errorCount;

  const flowNLevel = placeSummary.nLevel ?? flowStartEvent.config?.nLevel ?? 2;

  const journeyStageId = flowStartEvent.journeyStageId?.toString();
  const journeyId = flowStartEvent.journeyId;

  return {
    sessionId: input.sessionId,
    userId: input.userId,
    sessionType: 'flow',
    createdAt: new Date(flowStartEvent.timestamp),
    nLevel: flowNLevel,
    durationMs: placeSummary.durationMs,
    trialsCount: placeSummary.totalTrials,
    totalHits: flowTotalHits,
    totalMisses: flowTotalMisses,
    totalFa: 0,
    totalCr: 0,
    accuracy: stats.accuracy,
    globalDPrime: stats.accuracy * 3,
    passed: stats.accuracy >= ACCURACY_PASS_NORMALIZED,
    generator: 'dual-place',
    gameMode: 'dual-place',
    reason: flowEndEvent?.reason ?? 'completed',
    journeyStageId,
    journeyId,
    playContext: flowStartEvent.playContext ?? flowEndEvent?.playContext ?? 'free',
    byModality: stats.byModality,
    flowConfidenceScore: placeSummary.confidenceScore ?? undefined,
    flowDirectnessRatio: directnessRatioAvg ?? undefined,
    flowWrongSlotDwellMs: wrongSlotDwellMsTotal,
    upsScore: upsScore ?? undefined,
    upsAccuracy: upsAccuracy ?? undefined,
    upsConfidence: upsConfidence ?? undefined,
    worstModalityErrorRate: computeWorstModalityErrorRate(
      stats.byModality as unknown as Record<string, unknown>,
    ),
    inputMethods: extractInputMethods(input.sessionEvents),
  };
}

export function projectDualPickSessionToSummaryInput(input: {
  sessionId: string;
  sessionEvents: readonly GameEvent[];
  userId: string;
}): SessionSummaryInput | null {
  const dualPickStartEvent = input.sessionEvents.find(
    (e) => e.type === 'DUAL_PICK_SESSION_STARTED',
  ) as DualPickSessionStartedEvent | undefined;
  if (!dualPickStartEvent) return null;

  const dualPickSummary = DualPickSessionProjector.project([...input.sessionEvents]);
  if (!dualPickSummary) return null;

  const dualPickEndEvent = input.sessionEvents.find((e) => e.type === 'DUAL_PICK_SESSION_ENDED') as
    | DualPickSessionEndedEvent
    | undefined;
  const stats = dualPickSummary.extendedStats;

  const correctDropMetrics = dualPickSummary.dropConfidenceMetrics.filter((m) => m.correct);
  const directnessRatioAvg =
    correctDropMetrics.length > 0
      ? correctDropMetrics.reduce((sum, m) => sum + m.directnessRatio, 0) /
        correctDropMetrics.length
      : null;
  const wrongSlotDwellMsTotal = dualPickSummary.dropConfidenceMetrics.reduce(
    (sum, m) => sum + m.wrongSlotDwellMs,
    0,
  );

  const upsResult = UPSProjector.project([...input.sessionEvents]);
  const upsScore = upsResult?.ups.score ?? null;
  const upsAccuracy = upsResult?.ups.components.accuracy ?? null;
  const upsConfidence = upsResult?.ups.components.confidence ?? null;

  const totalHits = stats.correctDrops;
  const totalMisses = stats.errorCount;

  const dualPickNLevel = dualPickSummary.nLevel ?? dualPickStartEvent.config?.nLevel ?? 2;

  const journeyStageId = dualPickStartEvent.journeyStageId?.toString();
  const journeyId = dualPickStartEvent.journeyId;

  return {
    sessionId: input.sessionId,
    userId: input.userId,
    sessionType: 'dual-pick',
    createdAt: new Date(dualPickStartEvent.timestamp),
    nLevel: dualPickNLevel,
    durationMs: dualPickSummary.durationMs,
    trialsCount: dualPickSummary.totalTrials,
    totalHits,
    totalMisses,
    totalFa: 0,
    totalCr: 0,
    accuracy: stats.accuracy,
    globalDPrime: stats.accuracy * 3,
    passed: stats.accuracy >= ACCURACY_PASS_NORMALIZED,
    generator: 'dual-pick',
    gameMode: 'dual-pick',
    reason: dualPickEndEvent?.reason ?? 'completed',
    journeyStageId,
    journeyId,
    playContext: dualPickStartEvent.playContext ?? dualPickEndEvent?.playContext ?? 'free',
    byModality: stats.byModality,
    flowConfidenceScore: dualPickSummary.confidenceScore,
    flowDirectnessRatio: directnessRatioAvg ?? undefined,
    flowWrongSlotDwellMs: wrongSlotDwellMsTotal,
    upsScore: upsScore ?? undefined,
    upsAccuracy: upsAccuracy ?? undefined,
    upsConfidence: upsConfidence ?? undefined,
    worstModalityErrorRate: computeWorstModalityErrorRate(
      stats.byModality as unknown as Record<string, unknown>,
    ),
    inputMethods: extractInputMethods(input.sessionEvents),
  };
}

export function projectTraceSessionToSummaryInput(input: {
  sessionId: string;
  sessionEvents: readonly GameEvent[];
  userId: string;
}): SessionSummaryInput | null {
  const traceStartEvent = input.sessionEvents.find((e) => e.type === 'TRACE_SESSION_STARTED') as
    | TraceSessionStartedEvent
    | undefined;
  const traceEndEvent = input.sessionEvents.find((e) => e.type === 'TRACE_SESSION_ENDED') as
    | TraceSessionEndedEvent
    | undefined;
  if (!traceEndEvent) return null;

  const responseEvents = input.sessionEvents.filter(
    (e): e is TraceResponseEvent => e.type === 'TRACE_RESPONDED' && !e.isWarmup,
  );
  const correctResponses = responseEvents.filter((e) => e.isCorrect).length;
  const totalResponses = responseEvents.length;

  const accuracy =
    totalResponses > 0
      ? correctResponses / totalResponses
      : typeof traceEndEvent.score === 'number'
        ? Math.max(0, Math.min(1, traceEndEvent.score / 100))
        : 0;

  const upsResult = UPSProjector.project([...input.sessionEvents]);
  const upsScore = upsResult?.ups.score ?? null;
  const upsAccuracy = upsResult?.ups.components.accuracy ?? null;
  const upsConfidence = upsResult?.ups.components.confidence ?? null;

  const traceNLevel = traceStartEvent?.config?.nLevel ?? 2;

  const createdAtMs =
    (traceStartEvent?.timestamp ?? null) !== null
      ? (traceStartEvent?.timestamp as number)
      : typeof traceEndEvent.durationMs === 'number'
        ? traceEndEvent.timestamp - traceEndEvent.durationMs
        : traceEndEvent.timestamp;

  const journeyStageId = traceStartEvent?.journeyStageId?.toString();
  const journeyId = traceStartEvent?.journeyId;

  return {
    sessionId: input.sessionId,
    userId: input.userId,
    sessionType: 'trace',
    createdAt: new Date(createdAtMs),
    nLevel: traceNLevel,
    durationMs: traceEndEvent.durationMs,
    trialsCount: traceEndEvent.totalTrials,
    totalHits: correctResponses,
    totalMisses: totalResponses - correctResponses,
    totalFa: 0,
    totalCr: 0,
    accuracy,
    globalDPrime: accuracy * 3,
    passed: accuracy >= TRACE_ACCURACY_PASS_NORMALIZED,
    generator: 'dual-trace',
    gameMode: 'dual-trace',
    reason: traceEndEvent.reason,
    journeyStageId,
    journeyId,
    playContext: traceStartEvent?.playContext ?? traceEndEvent?.playContext ?? 'free',
    byModality: {},
    upsScore: upsScore ?? undefined,
    upsAccuracy: upsAccuracy ?? undefined,
    upsConfidence: upsConfidence ?? undefined,
    worstModalityErrorRate: undefined,
    inputMethods: extractInputMethods(input.sessionEvents),
  };
}

// Removed: projectTimeSessionToSummaryInput (deleted game mode)

// Removed: projectTrackSessionToSummaryInput (deleted game mode)

// Removed: projectCorsiSessionToSummaryInput (deleted game mode)

// =============================================================================
// OSPAN (Operation Span) Projector
// =============================================================================

export function projectOspanSessionToSummaryInput(input: {
  sessionId: string;
  sessionEvents: readonly GameEvent[];
  userId: string;
}): SessionSummaryInput | null {
  const projection = projectOspanSessionFromEvents(input.sessionEvents);
  if (!projection?.endEvent) return null;

  return {
    sessionId: input.sessionId,
    userId: input.userId,
    sessionType: 'ospan',
    createdAt: projection.createdAt,
    nLevel: projection.maxSpan,
    durationMs: projection.durationMs,
    trialsCount: projection.totalSets,
    totalHits: projection.correctSets,
    totalMisses: Math.max(0, projection.totalSets - projection.correctSets),
    totalFa: 0,
    totalCr: 0,
    accuracy: projection.recallAccuracyNormalized,
    // Store processing accuracy (0-100) in globalDPrime for OSpan (no dedicated column)
    globalDPrime: projection.processingAccuracyPercent,
    passed: projection.passed,
    generator: 'ospan',
    gameMode: 'ospan',
    reason: projection.reason,
    playContext: projection.playContext,
    byModality: {},
    upsScore: projection.ups.score,
    absoluteScore: projection.setEvents
      .filter((e) => e.recallCorrect)
      .reduce((sum, e) => sum + e.span, 0),
    upsAccuracy: projection.ups.components.accuracy,
    upsConfidence: projection.ups.components.confidence ?? undefined,
    inputMethods: extractInputMethods(input.sessionEvents),
  };
}

// Removed: projectRunningSpanSessionToSummaryInput, projectPasatSessionToSummaryInput,
// projectSwmSessionToSummaryInput (deleted game modes)
