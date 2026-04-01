import type { ModalityId, Trial, Sound, Color } from '../types/core';
import { normalizeModeId } from '../utils/mode-normalizer';
import { SessionCompletionProjector } from './session-completion-projector';
import { convertTraceSession } from '../domain/report/converters';
// Removed: journeyTransitionRecordToContext import (domain/journey deleted)
import type { GameEvent } from './events';
import type { SessionEndReportModel } from '../types/session-report';
import type { JourneyContext } from '../types/session-report';
import type { TraceSessionSummary, TraceResponse, TraceWritingResult } from '../types/trace';
import {
  TRACE_ACCURACY_PASS_NORMALIZED,
  BW_SCORE_UP_PERCENT,
  BW_SCORE_DOWN_PERCENT,
  BW_STRIKES_TO_DOWN,
} from '../specs/thresholds';
import { UPSProjector } from './ups-projector';
import { projectOspanTurns } from './turn-projectors';
import { projectOspanSessionFromEvents } from './ospan-session-projection';
import { SOUNDS } from '../types/core';

const VALID_MODALITIES = new Set<ModalityId>([
  'position',
  'audio',
  'color',
  'image',
  'arithmetic',
  // Brain Workshop multi-stimulus / combo modes
  'visvis',
  'visaudio',
  'audiovis',
]);
const DEFAULT_MODALITIES: readonly ModalityId[] = ['position', 'audio'];

/**
 * Projection version for SessionEndReportModel computed from events.
 *
 * Increment this whenever report/scoring semantics change, so cached history
 * reports are transparently recomputed from the event stream.
 *
 * IMPORTANT:
 * - Bump this for any user-visible meaning change in the report, not only for shape changes.
 * - Typical examples: progression headline/tone, journey CTA target, strikes wording,
 *   suggestedStartLevel handling, or any protocol threshold interpretation.
 * - If this is forgotten, historical report caches can stay "technically valid" but
 *   show stale business logic in Stats/History.
 */
export const SESSION_REPORT_PROJECTION_VERSION = 8;

type ProjectableMode =
  | 'tempo'
  | 'flow'
  | 'recall'
  | 'dual-pick'
  | 'trace'
  | 'ospan'
  | 'cognitive-task';

export interface ProjectSessionReportFromEventsInput {
  readonly sessionId: string;
  readonly events: readonly GameEvent[];
  readonly modeHint?: ProjectableMode;
  readonly gameMode?: string;
  readonly gameModeLabel?: string;
  readonly gameModeLabelResolver?: (gameMode: string) => string;
  readonly activeModalities?: readonly ModalityId[];
  readonly generator?: string;
  /**
   * Fallback journey context when JOURNEY_TRANSITION_DECIDED is absent from events
   * (post-refactoring: the event is no longer persisted).
   */
  readonly journeyContextFallback?: JourneyContext;
}

function inferTempoGameModeFromGenerator(generator: string | undefined): string {
  if (generator === 'DualnbackClassic') return 'dualnback-classic';
  if (generator === 'BrainWorkshop') return 'sim-brainworkshop';
  if (generator === 'Aleatoire') return 'custom';
  return 'dual-catch';
}

function isModalityId(value: string): value is ModalityId {
  if (VALID_MODALITIES.has(value as ModalityId)) return true;
  // Brain Workshop multi-stimulus modalities
  if (/^position\d+$/.test(value)) return true;
  if (/^audio\d+$/.test(value)) return true;
  if (/^vis\d+$/.test(value)) return true;
  return false;
}

function normalizeModalities(modalities: readonly string[] | undefined): readonly ModalityId[] {
  if (!modalities || modalities.length === 0) return DEFAULT_MODALITIES;
  const filtered = modalities.filter(isModalityId);
  return filtered.length > 0 ? filtered : DEFAULT_MODALITIES;
}

function resolveGameModeLabel(
  gameMode: string,
  input: ProjectSessionReportFromEventsInput,
): string {
  if (typeof input.gameModeLabel === 'string' && input.gameModeLabel.length > 0) {
    return input.gameModeLabel;
  }
  if (typeof input.gameModeLabelResolver === 'function') {
    return input.gameModeLabelResolver(gameMode);
  }
  return gameMode;
}

/**
 * Derive BrainWorkshop strikes (before/after) from the JOURNEY_CONTEXT_COMPUTED event
 * for historical report reconstruction. The `consecutiveStrikes` in the journeyContext
 * is the strikesAfter value. We derive strikesBefore using the BW scoring rules:
 *
 * - UP (score >= 80%): strikesAfter = 0, strikesBefore = strikesAfter (0) since UP resets
 * - STAY (50% <= score < 80%): strikesAfter = strikesBefore, so strikesBefore = strikesAfter
 * - STRIKE (score < 50%):
 *   - If strikesAfter > 0: strikesBefore = strikesAfter - 1
 *   - If strikesAfter = 0: DOWN happened (3rd strike reset), strikesBefore = BW_STRIKES_TO_DOWN - 1
 */
function deriveBrainWorkshopStrikes(
  report: SessionEndReportModel,
  journeyContext: JourneyContext,
): SessionEndReportModel['brainWorkshop'] | undefined {
  const strikesAfter = journeyContext.consecutiveStrikes;
  if (typeof strikesAfter !== 'number') return undefined;

  // Calculate BW score% from the report's byModality counts
  let totalHits = 0;
  let totalMisses = 0;
  let totalFA = 0;
  for (const stats of Object.values(report.byModality)) {
    totalHits += stats.hits ?? 0;
    totalMisses += stats.misses ?? 0;
    totalFA += stats.falseAlarms ?? 0;
  }
  const denom = totalHits + totalMisses + totalFA;
  const scorePercent = denom > 0 ? Math.floor((totalHits * 100) / denom) : 0;

  let strikesBefore: number;
  if (scorePercent >= BW_SCORE_UP_PERCENT) {
    // UP: strikesAfter resets to 0. strikesBefore could be anything, but
    // since the UP overwhelms strikes, set strikesBefore = 0 (display: "reset")
    strikesBefore = strikesAfter; // Both are 0 on UP
  } else if (scorePercent < BW_SCORE_DOWN_PERCENT) {
    // STRIKE: strikesAfter = strikesBefore + 1, unless 3rd strike caused DOWN (reset to 0)
    if (strikesAfter === 0) {
      // 3rd strike caused DOWN, strikesAfter was reset to 0
      strikesBefore = BW_STRIKES_TO_DOWN - 1; // = 2
    } else {
      strikesBefore = strikesAfter - 1;
    }
  } else {
    // STAY: strikes unchanged
    strikesBefore = strikesAfter;
  }

  return {
    strikesBefore: Math.max(0, Math.min(strikesBefore, BW_STRIKES_TO_DOWN - 1)),
    strikesAfter: Math.max(0, Math.min(strikesAfter, BW_STRIKES_TO_DOWN - 1)),
    strikesToDown: BW_STRIKES_TO_DOWN,
  };
}

export function projectSessionReportFromEvents(
  input: ProjectSessionReportFromEventsInput,
): SessionEndReportModel | null {
  if (input.events.length === 0) return null;

  const events = [...input.events].sort((a, b) => {
    const byTimestamp = a.timestamp - b.timestamp;
    if (byTimestamp !== 0) return byTimestamp;
    const aId = typeof a.id === 'string' ? a.id : '';
    const bId = typeof b.id === 'string' ? b.id : '';
    return aId.localeCompare(bId);
  });
  const detectedMode = input.modeHint ?? SessionCompletionProjector.detectMode(events);
  const journeyContext: JourneyContext | undefined = input.journeyContextFallback;
  const journeyIdFromEvents: string | undefined = (() => {
    for (let i = events.length - 1; i >= 0; i--) {
      const journeyId = (events[i] as unknown as { journeyId?: unknown })?.journeyId;
      if (typeof journeyId === 'string' && journeyId.trim().length > 0) return journeyId;
    }
    return undefined;
  })();
  const journeyStageIdFromEvents: number | undefined = (() => {
    for (let i = events.length - 1; i >= 0; i--) {
      const journeyStageId = (events[i] as unknown as { journeyStageId?: unknown })?.journeyStageId;
      if (typeof journeyStageId !== 'number' || !Number.isFinite(journeyStageId)) continue;
      const rounded = Math.round(journeyStageId);
      if (rounded > 0) return rounded;
    }
    return undefined;
  })();
  const enrichedJourneyContext =
    journeyContext && !journeyContext.journeyId && journeyIdFromEvents
      ? { ...journeyContext, journeyId: journeyIdFromEvents }
      : journeyContext;

  if (detectedMode === 'tempo') {
    const startEvent = events.find((event) => event.type === 'SESSION_STARTED') as
      | (GameEvent & {
          gameMode?: string;
          config?: { activeModalities?: readonly ModalityId[]; generator?: string };
          currentStrikes?: number;
        })
      | undefined;

    const gameMode = normalizeModeId(
      input.gameMode ??
        startEvent?.gameMode ??
        inferTempoGameModeFromGenerator(input.generator ?? startEvent?.config?.generator),
    );
    const activeModalities = normalizeModalities(
      input.activeModalities ?? startEvent?.config?.activeModalities,
    );

    const projected =
      SessionCompletionProjector.project({
        mode: 'tempo',
        sessionId: input.sessionId,
        events,
        gameMode,
        gameModeLabel: resolveGameModeLabel(gameMode, input),
        activeModalities,
        generator: input.generator ?? startEvent?.config?.generator,
        currentStrikes: gameMode === 'sim-brainworkshop' ? startEvent?.currentStrikes : undefined,
        journeyContext: enrichedJourneyContext,
      })?.report ?? null;
    if (!projected) return null;

    // JourneyContext is authoritative for strikes in journey mode.
    // For free mode (no journey context), strikes are computed from currentStrikes when available,
    // otherwise default to 0 (canonical fallback used by the app).
    const brainWorkshop =
      gameMode === 'sim-brainworkshop' && enrichedJourneyContext
        ? (deriveBrainWorkshopStrikes(projected, enrichedJourneyContext) ?? projected.brainWorkshop)
        : projected.brainWorkshop;

    return {
      ...projected,
      journeyId: projected.journeyId ?? projected.journeyContext?.journeyId ?? journeyIdFromEvents,
      journeyStageId:
        projected.journeyStageId ?? projected.journeyContext?.stageId ?? journeyStageIdFromEvents,
      ...(brainWorkshop ? { brainWorkshop } : {}),
    };
  }

  if (detectedMode === 'flow') {
    const startEvent = events.find((event) => event.type === 'FLOW_SESSION_STARTED') as
      | (GameEvent & { config?: { activeModalities?: readonly ModalityId[] } })
      | undefined;
    const gameMode = normalizeModeId(input.gameMode ?? 'dual-place');
    const activeModalities = normalizeModalities(
      input.activeModalities ?? startEvent?.config?.activeModalities,
    );

    const projected =
      SessionCompletionProjector.project({
        mode: 'flow',
        sessionId: input.sessionId,
        events,
        gameModeLabel: resolveGameModeLabel(gameMode, input),
        activeModalities,
        journeyContext: enrichedJourneyContext,
      })?.report ?? null;
    if (!projected) return null;
    return {
      ...projected,
      journeyId: projected.journeyId ?? projected.journeyContext?.journeyId ?? journeyIdFromEvents,
      journeyStageId:
        projected.journeyStageId ?? projected.journeyContext?.stageId ?? journeyStageIdFromEvents,
    };
  }

  if (detectedMode === 'recall') {
    const startEvent = events.find((event) => event.type === 'RECALL_SESSION_STARTED') as
      | (GameEvent & { config?: { activeModalities?: readonly ModalityId[] } })
      | undefined;
    const gameMode = normalizeModeId(input.gameMode ?? 'dual-memo');
    const activeModalities = normalizeModalities(
      input.activeModalities ?? startEvent?.config?.activeModalities,
    );
    const trials = events
      .filter((event) => event.type === 'RECALL_STIMULUS_SHOWN' || event.type === 'TRIAL_PRESENTED')
      .map((event) => (event as unknown as { trial?: Trial }).trial)
      .filter((trial): trial is Trial => trial != null);

    if (trials.length === 0) return null;

    const projected =
      SessionCompletionProjector.project({
        mode: 'recall',
        sessionId: input.sessionId,
        events,
        trials,
        gameModeLabel: resolveGameModeLabel(gameMode, input),
        activeModalities,
        journeyContext: enrichedJourneyContext,
      })?.report ?? null;
    if (!projected) return null;
    return {
      ...projected,
      journeyId: projected.journeyId ?? projected.journeyContext?.journeyId ?? journeyIdFromEvents,
      journeyStageId:
        projected.journeyStageId ?? projected.journeyContext?.stageId ?? journeyStageIdFromEvents,
    };
  }

  if (detectedMode === 'dual-pick') {
    const startEvent = events.find((event) => event.type === 'DUAL_PICK_SESSION_STARTED') as
      | (GameEvent & { config?: { activeModalities?: readonly ModalityId[] } })
      | undefined;
    const gameMode = normalizeModeId(input.gameMode ?? 'dual-pick');
    const activeModalities = normalizeModalities(
      input.activeModalities ?? startEvent?.config?.activeModalities,
    );

    const projected =
      SessionCompletionProjector.project({
        mode: 'dual-pick',
        sessionId: input.sessionId,
        events,
        gameModeLabel: resolveGameModeLabel(gameMode, input),
        activeModalities,
        journeyContext: enrichedJourneyContext,
      })?.report ?? null;
    if (!projected) return null;
    return {
      ...projected,
      journeyId: projected.journeyId ?? projected.journeyContext?.journeyId ?? journeyIdFromEvents,
      journeyStageId:
        projected.journeyStageId ?? projected.journeyContext?.stageId ?? journeyStageIdFromEvents,
    };
  }

  if (detectedMode === 'trace') {
    const startEvent = events.find((event) => event.type === 'TRACE_SESSION_STARTED') as
      | (GameEvent & {
          gameMode?: string;
          config?: {
            nLevel: number;
            trialsCount: number;
            rhythmMode: 'self-paced' | 'timed';
          };
        })
      | undefined;
    const endEvent = events.find((event) => event.type === 'TRACE_SESSION_ENDED') as
      | (GameEvent & {
          reason: 'completed' | 'abandoned';
          totalTrials: number;
          score: number;
          durationMs: number;
        })
      | undefined;

    if (!startEvent?.config) return null;

    const gameMode = normalizeModeId(input.gameMode ?? startEvent.gameMode ?? 'dual-trace');
    const hasWriting = events.some(
      (e) =>
        e.type === 'TRACE_WRITING_STARTED' ||
        e.type === 'TRACE_WRITING_COMPLETED' ||
        e.type === 'TRACE_WRITING_TIMEOUT',
    );
    const hasColor = events.some(
      (e) =>
        e.type === 'TRACE_WRITING_COMPLETED' &&
        (e as unknown as { expectedColor?: string | null }).expectedColor != null,
    );
    const activeModalities: readonly ModalityId[] = hasColor
      ? (['position', 'audio', 'color'] as const)
      : hasWriting
        ? (['position', 'audio'] as const)
        : (['position'] as const);

    type TraceTrialAggregate = {
      isWarmup?: boolean;
      stimulusPosition?: number;
      response?: GameEvent & {
        type: 'TRACE_RESPONDED';
        responseType: 'swipe' | 'double-tap' | 'hold' | 'skip' | 'reject';
        position: number | null;
        expectedPosition: number | null;
        isCorrect: boolean;
        isWarmup: boolean;
        responseTimeMs: number;
        monotonicMs?: number;
        occurredAtMs?: number;
      };
      timeout?: GameEvent & { type: 'TRACE_TIMED_OUT'; expectedPosition: number | null };
      writing?: {
        expectedLetter: string | null;
        recognizedLetter?: string | null;
        isCorrect?: boolean;
        confidence?: number;
        writingTimeMs?: number;
        timedOut?: boolean;
        selectedColor?: string | null;
        expectedColor?: string | null;
        colorCorrect?: boolean | null;
      };
    };

    const byTrial = new Map<number, TraceTrialAggregate>();

    const getTrial = (trialIndex: number): TraceTrialAggregate => {
      const existing = byTrial.get(trialIndex);
      if (existing) return existing;
      const next: TraceTrialAggregate = {};
      byTrial.set(trialIndex, next);
      return next;
    };

    for (const e of events) {
      if (e.type === 'TRACE_STIMULUS_SHOWN') {
        const t = getTrial((e as unknown as { trialIndex: number }).trialIndex);
        t.isWarmup = (e as unknown as { isWarmup: boolean }).isWarmup;
        t.stimulusPosition = (e as unknown as { position: number }).position;
      }
      if (e.type === 'TRACE_RESPONDED') {
        const trialIndex = (e as unknown as { trialIndex?: unknown }).trialIndex;
        if (typeof trialIndex === 'number') {
          getTrial(trialIndex).response = e as unknown as TraceTrialAggregate['response'];
        }
      }
      if (e.type === 'TRACE_TIMED_OUT') {
        const trialIndex = (e as unknown as { trialIndex?: unknown }).trialIndex;
        if (typeof trialIndex === 'number') {
          getTrial(trialIndex).timeout = e as unknown as TraceTrialAggregate['timeout'];
        }
      }
      if (e.type === 'TRACE_WRITING_STARTED') {
        const t = getTrial((e as unknown as { trialIndex: number }).trialIndex);
        t.writing = t.writing ?? { expectedLetter: null };
        t.writing.expectedLetter = (
          e as unknown as { expectedLetter: string | null }
        ).expectedLetter;
      }
      if (e.type === 'TRACE_WRITING_COMPLETED') {
        const t = getTrial((e as unknown as { trialIndex: number }).trialIndex);
        const evt = e as unknown as {
          expectedLetter: string | null;
          recognizedLetter: string | null;
          isCorrect: boolean;
          confidence: number;
          writingTimeMs: number;
          selectedColor?: string | null;
          expectedColor?: string | null;
          colorCorrect?: boolean | null;
        };
        t.writing = {
          expectedLetter: evt.expectedLetter,
          recognizedLetter: evt.recognizedLetter,
          isCorrect: evt.isCorrect,
          confidence: evt.confidence,
          writingTimeMs: evt.writingTimeMs,
          timedOut: false,
          selectedColor: evt.selectedColor ?? null,
          expectedColor: evt.expectedColor ?? null,
          colorCorrect: evt.colorCorrect ?? null,
        };
      }
      if (e.type === 'TRACE_WRITING_TIMEOUT') {
        const t = getTrial((e as unknown as { trialIndex: number }).trialIndex);
        t.writing = {
          expectedLetter: t.writing?.expectedLetter ?? null,
          recognizedLetter: null,
          isCorrect: false,
          confidence: 0,
          writingTimeMs: (e as unknown as { writingTimeMs: number }).writingTimeMs,
          timedOut: true,
        };
      }
    }

    const isSound = (value: string | null | undefined): value is Sound => {
      if (!value) return false;
      return (SOUNDS as readonly string[]).includes(value);
    };

    // Rebuild responses + stats (mirror the state machine's updateStats)
    let trialsCompleted = 0;
    let warmupTrials = 0;
    let correctResponses = 0;
    let incorrectResponses = 0;
    let timeouts = 0;

    const indices = [...byTrial.keys()].sort((a, b) => a - b);
    const responses: TraceResponse[] = [];

    for (const trialIndex of indices) {
      const t = byTrial.get(trialIndex);
      if (!t) continue;
      const isWarmup = t.response?.isWarmup ?? t.isWarmup ?? false;
      const timeoutEvent = t.timeout;
      const responseEvent = t.response;

      const responseType: TraceResponse['responseType'] = timeoutEvent
        ? 'timeout'
        : (responseEvent?.responseType ?? 'skip');

      const isTimeout = responseType === 'timeout';
      const isCorrect = responseEvent?.isCorrect ?? false;

      if (isWarmup) {
        warmupTrials += 1;
      } else {
        trialsCompleted += 1;
        if (isCorrect) correctResponses += 1;
        if (!isCorrect && !isTimeout) incorrectResponses += 1;
        if (isTimeout) timeouts += 1;
      }

      const writing = t.writing;
      const writingResult: TraceWritingResult | undefined = hasWriting
        ? {
            recognizedLetter: writing?.recognizedLetter ?? null,
            expectedLetter: writing?.expectedLetter ?? null,
            isCorrect: writing?.isCorrect ?? false,
            confidence: writing?.confidence ?? 0,
            writingTimeMs: writing?.writingTimeMs ?? 0,
            timedOut: writing?.timedOut ?? false,
            selectedColor: (writing?.selectedColor as Color | null) ?? null,
            expectedColor: (writing?.expectedColor as Color | null) ?? null,
            colorCorrect: writing?.colorCorrect ?? null,
          }
        : undefined;

      responses.push({
        trialIndex,
        responseType,
        position: responseEvent?.position ?? null,
        expectedPosition: responseEvent?.expectedPosition ?? timeoutEvent?.expectedPosition ?? null,
        expectedSound: isSound(writing?.expectedLetter) ? writing.expectedLetter : null,
        expectedColor: (writing?.expectedColor as Color | null) ?? null,
        colorResponse: (writing?.selectedColor as Color | null) ?? null,
        isCorrect,
        isWarmup,
        responseTimeMs: responseEvent?.responseTimeMs ?? null,
        responseAtMs: responseEvent?.monotonicMs ?? responseEvent?.occurredAtMs ?? null,
        writingResult,
      });
    }

    const finalStats = {
      trialsCompleted,
      warmupTrials,
      correctResponses,
      incorrectResponses,
      timeouts,
      accuracy: trialsCompleted > 0 ? correctResponses / trialsCompleted : 0,
    };

    const summary: TraceSessionSummary = {
      sessionId: input.sessionId,
      nLevel: startEvent.config.nLevel,
      totalTrials: endEvent?.totalTrials ?? startEvent.config.trialsCount,
      rhythmMode: startEvent.config.rhythmMode,
      finalStats,
      durationMs: endEvent?.durationMs ?? 0,
      completed: endEvent?.reason === 'completed',
      score: endEvent?.score ?? Math.round(finalStats.accuracy * 100),
      responses,
    };

    const upsProjection = UPSProjector.project(events);
    const ups = upsProjection?.ups;
    const confidenceScore = ups?.components.confidence ?? undefined;
    const passed = finalStats.accuracy >= TRACE_ACCURACY_PASS_NORMALIZED;

    const projected = convertTraceSession({
      sessionId: input.sessionId,
      createdAt: new Date(events[0]?.timestamp ?? Date.now()).toISOString(),
      summary,
      activeModalities,
      gameModeLabel: resolveGameModeLabel(gameMode, input),
      passed,
      nextLevel: summary.nLevel,
      journeyContext: enrichedJourneyContext,
      ups: ups ?? undefined,
      confidenceScore,
    });
    return {
      ...projected,
      journeyId: projected.journeyId ?? projected.journeyContext?.journeyId ?? journeyIdFromEvents,
      journeyStageId:
        projected.journeyStageId ?? projected.journeyContext?.stageId ?? journeyStageIdFromEvents,
    };
  }

  // Removed: time, track, corsi mode blocks (deleted game modes)

  if (detectedMode === 'ospan') {
    const projection = projectOspanSessionFromEvents(events);
    if (!projection?.startEvent && !projection?.endEvent) return null;

    const absoluteScore = projection.setEvents
      .filter((e) => e.recallCorrect)
      .reduce((sum, e) => sum + e.span, 0);

    const report: SessionEndReportModel = {
      sessionId: input.sessionId,
      createdAt: projection.createdAt.toISOString(),
      reason: projection.reason,
      gameMode: 'ospan',
      gameModeLabel: resolveGameModeLabel('ospan', input),
      nLevel: projection.maxSpan,
      activeModalities: [],
      trialsCount: projection.totalSets,
      durationMs: projection.durationMs,
      ups: projection.ups,
      unifiedAccuracy: projection.recallAccuracyNormalized,
      modeScore: {
        labelKey: 'report.modeScore.ospanScore',
        value: absoluteScore,
        unit: 'score',
        tooltipKey: 'report.modeScore.ospanScoreTooltip',
      },
      passed: projection.passed,
      totals: {
        hits: projection.correctSets,
        misses: Math.max(0, projection.totalSets - projection.correctSets),
        falseAlarms: 0,
        correctRejections: 0,
      },
      byModality: {},
      errorProfile: {
        errorRate: 1 - projection.recallAccuracyNormalized,
        missShare: 1,
        faShare: 0,
      },
      turns: projectOspanTurns(events),
      modeDetails: {
        kind: 'ospan' as const,
        absoluteScore,
        maxSpan: projection.maxSpan,
        processingAccuracy: projection.processingAccuracyPercent,
        recallAccuracy: projection.recallAccuracyPercent,
        isValidMeasure: projection.passed,
      },
      taskMetrics: {
        processingAccuracy: projection.processingAccuracyPercent,
        absoluteScore,
        maxSpan: projection.maxSpan,
      },
      playContext: projection.playContext,
    };
    return report;
  }

  // Removed: running-span, pasat, swm mode blocks (deleted game modes)

  if (detectedMode === 'cognitive-task') {
    const startEvent = events.find((e) => e.type === 'COGNITIVE_TASK_SESSION_STARTED') as
      | (GameEvent & { taskType?: string; gameModeLabel?: string })
      | undefined;
    const endEvent = events.find((e) => e.type === 'COGNITIVE_TASK_SESSION_ENDED') as
      | (GameEvent & {
          taskType?: string;
          reason?: string;
          accuracy?: number;
          correctTrials?: number;
          totalTrials?: number;
          durationMs?: number;
          meanRtMs?: number;
        })
      | undefined;

    if (!endEvent) return null;

    const taskType = startEvent?.taskType ?? endEvent?.taskType ?? 'unknown';
    const gameModeLabel =
      input.gameModeLabel ?? startEvent?.gameModeLabel ?? resolveGameModeLabel(taskType, input);

    const projected = SessionCompletionProjector.project({
      mode: 'cognitive-task',
      sessionId: input.sessionId,
      events,
      taskType,
      gameModeLabel,
      reason: (endEvent.reason as 'completed' | 'abandoned') ?? 'completed',
      accuracy:
        typeof endEvent.accuracy === 'number'
          ? endEvent.accuracy <= 1
            ? endEvent.accuracy * 100
            : endEvent.accuracy
          : 0,
      correctTrials: endEvent.correctTrials ?? 0,
      totalTrials: endEvent.totalTrials ?? 0,
      durationMs: endEvent.durationMs ?? 0,
      meanRtMs: endEvent.meanRtMs,
    });

    return projected?.report ?? null;
  }

  return null;
}
