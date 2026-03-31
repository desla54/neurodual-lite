/**
 * Turn Projectors - Transform events into tour-by-tour summaries
 *
 * These projectors convert raw session events into readable TurnSummary[]
 * for the detailed report view. This allows users to see exactly what happened
 * on each trial and understand their errors.
 *
 * Principles:
 * - Pure functions, no side effects
 * - O(events) complexity per session
 * - Robust to legacy/imported sessions (graceful degradation)
 */

import type { ModalityId, Trial } from '../types/core';
import { DEFAULT_N_LEVEL } from '../specs/thresholds';
import { getIsTarget } from '../domain/modality/trial-adapter';
import type {
  GameEvent,
  SessionStartedEvent,
  TrialPresentedEvent,
  UserResponseEvent,
  MemoEvent,
  RecallWindowOpenedEvent,
  RecallPickedEvent,
  RecallWindowCommittedEvent,
  PlaceEvent,
  PlaceStimulusShownEvent,
  PlacePlacementStartedEvent,
  PlaceDropAttemptedEvent,
  PlaceTurnCompletedEvent,
  TraceEvent,
  TraceStimulusShownEvent,
  TraceResponseEvent,
  TraceTimeoutEvent,
  TraceWritingStartedEvent,
  TraceWritingCompletedEvent,
  TraceWritingTimeoutEvent,
  MotEvent,
  MotSessionStartedEvent,
  MotTrialDefinedEvent,
  CorsiTrialCompletedEvent,
  CognitiveTaskTrialCompletedEvent,
  OspanSetCompletedEvent,
} from './events';
import type {
  TurnSummary,
  TurnKind,
  TurnVerdict,
  TurnErrorTag,
  TempoTrialDetail,
  MemoWindowDetail,
  PlaceTurnDetail,
  TrackTurnDetail,
  CorsiTurnDetail,
  CognitiveTaskTrialDetail,
  OspanSetDetail,
} from '../types/session-report';

// =============================================================================
// Track Projector
// =============================================================================

function countTrackFalseAlarms(event: Extract<MotEvent, { type: 'MOT_TRIAL_COMPLETED' }>): number {
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

/**
 * Project Dual Track / MOT session events into TurnSummary[].
 */
export function projectTrackTurns(events: readonly MotEvent[]): TurnSummary[] {
  const startEvent = events.find((event): event is MotSessionStartedEvent => {
    return event.type === 'MOT_SESSION_STARTED';
  });
  const totalObjects = startEvent?.config.totalObjects ?? 0;
  const definitions = new Map<number, MotTrialDefinedEvent>();
  const turns: TurnSummary[] = [];

  for (const event of events) {
    if (event.type === 'MOT_TRIAL_DEFINED') {
      definitions.set(event.trialIndex, event);
      continue;
    }
    if (event.type !== 'MOT_TRIAL_COMPLETED') continue;

    const definition = definitions.get(event.trialIndex);

    const misses = Math.max(0, event.totalTargets - event.correctCount);
    const falseAlarms = countTrackFalseAlarms(event);
    const verdict: TurnVerdict =
      misses === 0 && falseAlarms === 0
        ? 'correct'
        : event.correctCount === 0
          ? 'incorrect'
          : 'partial';

    const errorTags: TurnErrorTag[] = [];
    if (misses > 0) errorTags.push('miss');
    if (falseAlarms > 0) errorTags.push('false-alarm');

    const detail: TrackTurnDetail = {
      kind: 'track-trial',
      totalObjects,
      targetCount: event.totalTargets,
      targetIndices: event.targetIndices,
      selectedIndices: event.selectedIndices,
      correctCount: event.correctCount,
      misses,
      falseAlarms,
      responseTimeMs: event.responseTimeMs,
      crowdingEvents: event.crowdingEvents,
      minInterObjectDistancePx: event.minInterObjectDistancePx,
      trialSeed: definition?.trialSeed,
      arenaWidthPx: definition?.arenaWidthPx,
      arenaHeightPx: definition?.arenaHeightPx,
      initialObjects: definition?.initialObjects,
    };

    turns.push({
      index: event.trialIndex + 1,
      kind: 'track-trial',
      startedAt: event.timestamp,
      durationMs: event.responseTimeMs,
      headline: `#${event.trialIndex + 1} [${event.correctCount}/${event.totalTargets}]`,
      subline:
        falseAlarms > 0
          ? `RT: ${Math.round(event.responseTimeMs)}ms · +${falseAlarms} FA`
          : `RT: ${Math.round(event.responseTimeMs)}ms`,
      verdict,
      errorTags: errorTags.length > 0 ? errorTags : undefined,
      detail,
    });
  }

  return turns;
}

// =============================================================================
// Corsi Projector
// =============================================================================

function getFirstCorsiErrorIndex(
  sequence: readonly number[],
  recalled: readonly number[],
): number | undefined {
  const comparedLength = Math.min(sequence.length, recalled.length);

  for (let index = 0; index < comparedLength; index++) {
    if (sequence[index] !== recalled[index]) return index;
  }

  if (sequence.length !== recalled.length) return comparedLength;
  return undefined;
}

/**
 * Project Corsi Block events into TurnSummary[].
 */
export function projectCorsiTurns(
  events: readonly { type: string; [key: string]: unknown }[],
): TurnSummary[] {
  const turns: TurnSummary[] = [];

  for (const event of events) {
    if (event.type !== 'CORSI_TRIAL_COMPLETED') continue;

    const trial = event as unknown as CorsiTrialCompletedEvent;
    const firstErrorIndex = getFirstCorsiErrorIndex(trial.sequence, trial.recalled);
    const detail: CorsiTurnDetail = {
      kind: 'corsi-trial',
      span: trial.span,
      sequence: trial.sequence,
      recalled: trial.recalled,
      correct: trial.correct,
      responseTimeMs: trial.responseTimeMs,
      firstErrorIndex,
    };

    turns.push({
      index: trial.trialIndex + 1,
      kind: 'corsi-trial',
      startedAt: trial.timestamp,
      durationMs: trial.responseTimeMs,
      headline: `#${trial.trialIndex + 1} Span ${trial.span}`,
      subline: `RT: ${Math.round(trial.responseTimeMs)}ms`,
      verdict: trial.correct ? 'correct' : 'incorrect',
      errorTags: trial.correct ? undefined : ['order-error'],
      detail,
    });
  }

  return turns;
}

// =============================================================================
// Trace Projector
// =============================================================================

type TraceTrialData = {
  stimulus?: TraceStimulusShownEvent;
  response?: TraceResponseEvent;
  timeout?: TraceTimeoutEvent;
  writingStarted?: TraceWritingStartedEvent;
  writingCompleted?: TraceWritingCompletedEvent;
  writingTimeout?: TraceWritingTimeoutEvent;
};

/**
 * Project Dual Trace session events into TurnSummary[].
 *
 * For UI reuse, we map each trace trial into a tempo-like TurnDetail payload.
 * This enables the unified detailed timeline (ReportDetails).
 */
export function projectTraceTurns(events: readonly TraceEvent[]): TurnSummary[] {
  const trials: Map<number, TraceTrialData> = new Map();

  const get = (trialIndex: number): TraceTrialData => {
    const existing = trials.get(trialIndex);
    if (existing) return existing;
    const next: TraceTrialData = {};
    trials.set(trialIndex, next);
    return next;
  };

  let hasAnyWriting = false;

  for (const e of events) {
    if (e.type === 'TRACE_STIMULUS_SHOWN') {
      get(e.trialIndex).stimulus = e;
    } else if (e.type === 'TRACE_RESPONDED') {
      get(e.trialIndex).response = e;
    } else if (e.type === 'TRACE_TIMED_OUT') {
      get(e.trialIndex).timeout = e;
    } else if (e.type === 'TRACE_WRITING_STARTED') {
      hasAnyWriting = true;
      get(e.trialIndex).writingStarted = e;
    } else if (e.type === 'TRACE_WRITING_COMPLETED') {
      hasAnyWriting = true;
      get(e.trialIndex).writingCompleted = e;
    } else if (e.type === 'TRACE_WRITING_TIMEOUT') {
      hasAnyWriting = true;
      get(e.trialIndex).writingTimeout = e;
    }
  }

  const indices = [...trials.keys()].sort((a, b) => a - b);
  const turns: TurnSummary[] = [];

  for (const trialIndex of indices) {
    const data = trials.get(trialIndex);
    if (!data) continue;

    const expectedPosition =
      data.response?.expectedPosition ?? data.timeout?.expectedPosition ?? null;
    const isWarmup = data.stimulus?.isWarmup ?? data.response?.isWarmup ?? false;
    const hadPositionTarget = !isWarmup && expectedPosition !== null;
    const positionCorrect = data.response?.isCorrect === true;
    const positionResult: 'hit' | 'miss' | 'correct-rejection' = hadPositionTarget
      ? positionCorrect
        ? 'hit'
        : 'miss'
      : 'correct-rejection';

    const expectedLetter =
      data.writingCompleted?.expectedLetter ?? data.writingStarted?.expectedLetter ?? null;
    const hadAudioTarget = !isWarmup && expectedLetter !== null;
    const audioCorrect = data.writingCompleted?.isCorrect === true;
    const audioResult: 'hit' | 'miss' | 'correct-rejection' = hasAnyWriting
      ? hadAudioTarget
        ? audioCorrect
          ? 'hit'
          : 'miss'
        : 'correct-rejection'
      : 'correct-rejection';

    const expectedColor = data.writingCompleted?.expectedColor ?? null;
    const hadColorTarget = !isWarmup && expectedColor !== null;
    const colorCorrect = data.writingCompleted?.colorCorrect === true;
    const colorResult: 'hit' | 'miss' | 'correct-rejection' = hadColorTarget
      ? colorCorrect
        ? 'hit'
        : 'miss'
      : 'correct-rejection';

    const targets: ModalityId[] = [];
    if (hadPositionTarget) targets.push('position');
    if (hasAnyWriting && hadAudioTarget) targets.push('audio');
    if (hadColorTarget) targets.push('color');

    const responses: TempoTrialDetail['responses'] = {
      position: {
        pressed: !!data.response && data.response.responseType !== 'skip',
        reactionTimeMs: data.response?.responseTimeMs,
        phase: 'after_stimulus',
        result: positionResult,
      },
    };

    if (hasAnyWriting) {
      responses['audio'] = {
        pressed: !!data.writingCompleted,
        reactionTimeMs: data.writingCompleted?.writingTimeMs ?? data.writingTimeout?.writingTimeMs,
        phase: 'after_stimulus',
        result: audioResult,
      };
    }

    if (hadColorTarget) {
      responses['color'] = {
        pressed: data.writingCompleted?.selectedColor != null,
        reactionTimeMs: data.writingCompleted?.writingTimeMs ?? data.writingTimeout?.writingTimeMs,
        phase: 'after_stimulus',
        result: colorResult,
      };
    }

    const responseValues = Object.values(responses) as Array<{
      result: 'hit' | 'miss' | 'false-alarm' | 'correct-rejection';
    }>;
    const verdict: TurnVerdict = responseValues.every(
      (x) => x.result === 'hit' || x.result === 'correct-rejection',
    )
      ? 'correct'
      : 'incorrect';

    const errorTags: TurnErrorTag[] = [];
    if (positionResult === 'miss') errorTags.push('miss');
    if (hasAnyWriting && audioResult === 'miss') errorTags.push('miss');
    if (hadColorTarget && colorResult === 'miss') errorTags.push('miss');

    const headline = `#${trialIndex + 1} [TRACE]`;
    const subline = data.response?.responseTimeMs
      ? `RT: ${Math.round(data.response.responseTimeMs)}ms`
      : undefined;

    turns.push({
      index: trialIndex + 1,
      kind: 'trace-trial',
      startedAt: data.stimulus?.timestamp ?? data.response?.timestamp,
      headline,
      subline,
      verdict,
      errorTags: errorTags.length > 0 ? errorTags : undefined,
      detail: {
        kind: 'tempo-trial',
        stimulus: {
          position: data.stimulus?.position ?? null,
          audio: expectedLetter,
          color: expectedColor ?? null,
        },
        targets,
        responses,
      },
    });
  }

  return turns;
}

// =============================================================================
// Tempo Projector
// =============================================================================

interface TempoTrialData {
  trialIndex: number;
  trial: Trial;
  timestamp: number;
  isiMs: number;
  stimulusDurationMs: number;
  responses: Map<
    ModalityId,
    {
      pressed: boolean;
      reactionTimeMs: number;
      responsePhase: 'during_stimulus' | 'after_stimulus';
    }
  >;
}

/**
 * Get target flag for a trial and modality.
 */
function isTargetForModality(trial: Trial, modality: ModalityId): boolean {
  return getIsTarget(trial, modality);
}

/**
 * Get stimulus value for a trial and modality.
 */
function getStimulusValue(trial: Trial, modality: ModalityId): number | string | null {
  switch (modality) {
    case 'position':
      return trial.position;
    case 'audio':
      return trial.sound;
    case 'color':
      return trial.color;
    default:
      return null;
  }
}

/**
 * Project Tempo session events into TurnSummary[].
 *
 * @param events - All events for the session (filtered to game events)
 * @returns Array of TurnSummary for each trial
 */
export function projectTempoTurns(events: readonly GameEvent[]): TurnSummary[] {
  const trials: Map<number, TempoTrialData> = new Map();
  const turns: TurnSummary[] = [];
  let nLevel = DEFAULT_N_LEVEL; // Default (@see thresholds.ts), will be updated from SESSION_STARTED
  let activeModalitiesFromConfig: readonly ModalityId[] | null = null;

  // First pass: collect all trial data
  for (const event of events) {
    if (event.type === 'SESSION_STARTED') {
      const e = event as SessionStartedEvent;
      nLevel = e.nLevel;
      const modalities = (e as unknown as { config?: { activeModalities?: readonly unknown[] } })
        .config?.activeModalities;
      if (Array.isArray(modalities) && modalities.length > 0) {
        activeModalitiesFromConfig = modalities.filter(
          (m): m is ModalityId => typeof m === 'string' && m.trim().length > 0,
        );
      }
    } else if (event.type === 'TRIAL_PRESENTED') {
      const e = event as TrialPresentedEvent;
      trials.set(e.trial.index, {
        trialIndex: e.trial.index,
        trial: e.trial,
        timestamp: e.timestamp,
        isiMs: e.isiMs,
        stimulusDurationMs: e.stimulusDurationMs,
        responses: new Map(),
      });
    } else if (event.type === 'USER_RESPONDED') {
      const e = event as UserResponseEvent;
      const trialData = trials.get(e.trialIndex);
      if (trialData) {
        trialData.responses.set(e.modality, {
          pressed: true,
          reactionTimeMs: e.reactionTimeMs,
          responsePhase: e.responsePhase,
        });
      }
    }
  }

  // Second pass: build TurnSummary for each trial
  const modalities: readonly ModalityId[] =
    activeModalitiesFromConfig && activeModalitiesFromConfig.length > 0
      ? activeModalitiesFromConfig
      : ['position', 'audio'];
  for (const [trialIndex, data] of trials) {
    // Skip N-back warmup trials (index < nLevel)
    if (trialIndex < nLevel) continue;

    const turn = buildTempoTurn(trialIndex, data, modalities);
    turns.push(turn);
  }

  // Sort by index
  turns.sort((a, b) => a.index - b.index);

  return turns;
}

function buildTempoTurn(
  trialIndex: number,
  data: TempoTrialData,
  modalities: readonly ModalityId[],
): TurnSummary {
  const trial = data.trial;

  // Build responses record
  const responses: TempoTrialDetail['responses'] = {};
  const errorTags: TurnErrorTag[] = [];
  let correctCount = 0;
  let totalCount = 0;
  let avgRT = 0;
  let rtCount = 0;

  for (const modality of modalities) {
    const isTarget = isTargetForModality(trial, modality);
    const response = data.responses.get(modality);
    const pressed = response?.pressed ?? false;

    let result: 'hit' | 'miss' | 'false-alarm' | 'correct-rejection';
    if (isTarget && pressed) {
      result = 'hit';
      correctCount++;
    } else if (isTarget && !pressed) {
      result = 'miss';
      errorTags.push('miss');
    } else if (!isTarget && pressed) {
      result = 'false-alarm';
      errorTags.push('false-alarm');
    } else {
      result = 'correct-rejection';
      correctCount++;
    }

    totalCount++;

    responses[modality] = {
      pressed,
      reactionTimeMs: response?.reactionTimeMs,
      phase: response?.responsePhase,
      result,
    };

    if (response?.reactionTimeMs) {
      avgRT += response.reactionTimeMs;
      rtCount++;
    }
  }

  // Compute verdict
  let verdict: TurnVerdict;
  if (correctCount === totalCount) {
    verdict = 'correct';
  } else if (correctCount === 0) {
    verdict = 'incorrect';
  } else {
    verdict = 'partial';
  }

  // Build headline
  const modalityResults = modalities.map((m) => {
    const r = responses[m];
    const symbol = r?.result === 'hit' || r?.result === 'correct-rejection' ? '✓' : '✗';
    return `${m.toUpperCase().slice(0, 3)}${symbol}`;
  });
  const headline = `#${trialIndex + 1} [${modalityResults.join(' ')}]`;

  // Build subline
  let subline: string | undefined;
  if (rtCount > 0) {
    subline = `RT: ${Math.round(avgRT / rtCount)}ms`;
  }

  // Build detail - get targets from trial flags
  const targets: ModalityId[] = modalities.filter((m) => isTargetForModality(trial, m));

  const detail: TempoTrialDetail = {
    kind: 'tempo-trial',
    stimulus: {
      position: trial.position ?? null,
      audio: trial.sound ?? null,
      color: trial.color ?? null,
    },
    targets,
    responses,
  };

  return {
    index: trialIndex + 1, // 1-based for display
    kind: 'tempo-trial',
    startedAt: data.timestamp,
    durationMs: data.stimulusDurationMs + data.isiMs,
    headline,
    subline,
    verdict,
    errorTags: errorTags.length > 0 ? errorTags : undefined,
    detail,
  };
}

// =============================================================================
// Recall Projector
// =============================================================================

interface RecallWindowData {
  trialIndex: number;
  windowDepth: number;
  openedAt: number;
  committedAt?: number;
  recallDurationMs?: number;
  picks: Map<
    string,
    { slotIndex: number; modality: ModalityId; picked: number | string; correct: boolean }
  >;
  // From trials data
  required: Map<string, { slotIndex: number; modality: ModalityId; expected: number | string }>;
}

/**
 * Project Recall session events into TurnSummary[].
 *
 * @param events - All events for the session
 * @param trials - Trial data (needed to know expected values)
 * @returns Array of TurnSummary for each recall window
 */
export function projectMemoTurns(
  events: readonly MemoEvent[],
  trials: readonly Trial[],
): TurnSummary[] {
  const windows: Map<number, RecallWindowData> = new Map();
  const turns: TurnSummary[] = [];

  // Build trial lookup for expected values
  const trialLookup = new Map(trials.map((t) => [t.index, t]));

  // First pass: collect window data
  for (const event of events) {
    if (event.type === 'RECALL_WINDOW_OPENED') {
      const e = event as RecallWindowOpenedEvent;
      const windowData: RecallWindowData = {
        trialIndex: e.trialIndex,
        windowDepth: e.requiredWindowDepth,
        openedAt: e.timestamp,
        picks: new Map(),
        required: new Map(),
      };

      // Build required from trial history
      // For Memo mode, use position and audio modalities
      const modalities: ModalityId[] = ['position', 'audio'];
      for (let depth = 0; depth < e.requiredWindowDepth; depth++) {
        const pastIndex = e.trialIndex - depth;
        const pastTrial = trialLookup.get(pastIndex);
        if (pastTrial) {
          for (const modality of modalities) {
            const key = `${modality}-${depth}`;
            const expected = getStimulusValue(pastTrial, modality);
            if (expected !== null) {
              windowData.required.set(key, {
                slotIndex: depth,
                modality,
                expected,
              });
            }
          }
        }
      }

      windows.set(e.trialIndex, windowData);
    } else if (event.type === 'RECALL_PICKED') {
      const e = event as RecallPickedEvent;
      const windowData = windows.get(e.trialIndex);
      if (windowData) {
        const key = `${e.pick.modality}-${e.slotIndex}`;
        // Compute correctness by comparing with expected value
        const requiredData = windowData.required.get(key);
        const isCorrect = requiredData ? e.pick.value === requiredData.expected : false;
        windowData.picks.set(key, {
          slotIndex: e.slotIndex,
          modality: e.pick.modality,
          picked: e.pick.value,
          correct: isCorrect,
        });
      }
    } else if (event.type === 'RECALL_WINDOW_COMMITTED') {
      const e = event as RecallWindowCommittedEvent;
      const windowData = windows.get(e.trialIndex);
      if (windowData) {
        windowData.committedAt = e.timestamp;
        windowData.recallDurationMs = e.recallDurationMs;
      }
    }
  }

  // Second pass: build TurnSummary for each window
  for (const [trialIndex, data] of windows) {
    const turn = buildRecallTurn(trialIndex, data);
    turns.push(turn);
  }

  // Sort by index
  turns.sort((a, b) => a.index - b.index);

  return turns;
}

function buildRecallTurn(trialIndex: number, data: RecallWindowData): TurnSummary {
  const errorTags: TurnErrorTag[] = [];

  // Build required and picks by modality
  const required: MemoWindowDetail['required'] = {};
  const picks: MemoWindowDetail['picks'] = {};

  for (const [, req] of data.required) {
    const arr = required[req.modality] ?? [];
    arr.push({ slotIndex: req.slotIndex, expected: req.expected });
    required[req.modality] = arr;
  }

  let correctCount = 0;
  let totalCount = 0;

  for (const [, pick] of data.picks) {
    const arr = picks[pick.modality] ?? [];
    arr.push({
      slotIndex: pick.slotIndex,
      picked: pick.picked,
      correct: pick.correct,
    });
    picks[pick.modality] = arr;

    totalCount++;
    if (pick.correct) {
      correctCount++;
    } else {
      errorTags.push('wrong-pick');
    }
  }

  // Compute verdict
  let verdict: TurnVerdict;
  if (totalCount === 0) {
    verdict = 'no-action';
  } else if (correctCount === totalCount) {
    verdict = 'correct';
  } else if (correctCount === 0) {
    verdict = 'incorrect';
  } else {
    verdict = 'partial';
  }

  // Build headline
  const headline = `#${trialIndex + 1} [${correctCount}/${totalCount}]`;

  // Build subline
  let subline: string | undefined;
  if (data.recallDurationMs) {
    subline = `${Math.round(data.recallDurationMs / 1000)}s`;
  }

  // Build detail
  const detail: MemoWindowDetail = {
    kind: 'recall-window',
    windowDepth: data.windowDepth,
    required,
    picks,
    correctCount,
    totalCount,
    recallDurationMs: data.recallDurationMs,
  };

  return {
    index: trialIndex + 1, // 1-based for display
    kind: 'recall-window',
    startedAt: data.openedAt,
    endedAt: data.committedAt,
    durationMs: data.recallDurationMs,
    headline,
    subline,
    verdict,
    errorTags: errorTags.length > 0 ? errorTags : undefined,
    detail,
  };
}

// =============================================================================
// Flow Projector
// =============================================================================

interface PlaceTurnData {
  trialIndex: number;
  placementStartedAt: number;
  completedAt?: number;
  turnDurationMs?: number;
  proposals: { id: string; type: 'position' | 'audio'; value: number | string }[];
  drops: { proposalId: string; targetSlot: number; correct: boolean; placementTimeMs?: number }[];
}

/**
 * Project Flow session events into TurnSummary[].
 *
 * @param events - All events for the session
 * @returns Array of TurnSummary for each flow turn
 */
export function projectPlaceTurns(events: readonly PlaceEvent[]): TurnSummary[] {
  const placeTurns: Map<number, PlaceTurnData> = new Map();
  const stimuli: Map<number, { position: number; sound: string }> = new Map();
  const turns: TurnSummary[] = [];

  // First pass: collect turn data
  for (const event of events) {
    if (event.type === 'FLOW_STIMULUS_SHOWN') {
      const e = event as PlaceStimulusShownEvent;
      stimuli.set(e.trialIndex, { position: e.position, sound: e.sound });
    } else if (event.type === 'FLOW_PLACEMENT_STARTED') {
      const e = event as PlacePlacementStartedEvent;
      // Build proposals from proposalIds and stimulus data
      const proposals: PlaceTurnData['proposals'] = [];

      // We need to reconstruct proposals from the stimulus history
      // proposalIds are like "pos-0", "audio-1" etc.
      for (const id of e.proposalIds) {
        const parts = id.split('-');
        const type = parts[0];
        const indexStr = parts[1] ?? '0';
        const slotIndex = parseInt(indexStr, 10);
        const targetTrialIndex = e.trialIndex - slotIndex;
        const stimulus = stimuli.get(targetTrialIndex);

        if (stimulus) {
          if (type === 'pos' || type === 'position') {
            proposals.push({ id, type: 'position', value: stimulus.position });
          } else if (type === 'audio') {
            proposals.push({ id, type: 'audio', value: stimulus.sound });
          }
        }
      }

      placeTurns.set(e.trialIndex, {
        trialIndex: e.trialIndex,
        placementStartedAt: e.timestamp,
        proposals,
        drops: [],
      });
    } else if (event.type === 'FLOW_DROP_ATTEMPTED') {
      const e = event as PlaceDropAttemptedEvent;
      const turnData = placeTurns.get(e.trialIndex);
      if (turnData) {
        turnData.drops.push({
          proposalId: e.proposalId,
          targetSlot: e.targetSlot,
          correct: e.correct,
          placementTimeMs: e.placementTimeMs,
        });
      }
    } else if (event.type === 'FLOW_TURN_COMPLETED') {
      const e = event as PlaceTurnCompletedEvent;
      const turnData = placeTurns.get(e.trialIndex);
      if (turnData) {
        turnData.completedAt = e.timestamp;
        turnData.turnDurationMs = e.turnDurationMs;
      }
    }
  }

  // Second pass: build TurnSummary for each turn
  for (const [trialIndex, data] of placeTurns) {
    const turn = buildPlaceTurn(trialIndex, data);
    turns.push(turn);
  }

  // Sort by index
  turns.sort((a, b) => a.index - b.index);

  return turns;
}

function buildPlaceTurn(trialIndex: number, data: PlaceTurnData): TurnSummary {
  const errorTags: TurnErrorTag[] = [];

  let correctCount = 0;
  const totalCount = data.drops.length;

  for (const drop of data.drops) {
    if (drop.correct) {
      correctCount++;
    } else {
      errorTags.push('order-error');
    }
  }

  // Compute verdict
  let verdict: TurnVerdict;
  if (totalCount === 0) {
    verdict = 'no-action';
  } else if (correctCount === totalCount) {
    verdict = 'correct';
  } else if (correctCount === 0) {
    verdict = 'incorrect';
  } else {
    verdict = 'partial';
  }

  // Build headline
  const headline = `#${trialIndex + 1} [${correctCount}/${totalCount}]`;

  // Build subline
  let subline: string | undefined;
  if (data.turnDurationMs) {
    subline = `${(data.turnDurationMs / 1000).toFixed(1)}s`;
  }

  // Build detail
  const detail: PlaceTurnDetail = {
    kind: 'flow-turn',
    proposals: data.proposals,
    drops: data.drops,
    turnDurationMs: data.turnDurationMs,
  };

  return {
    index: trialIndex + 1, // 1-based for display
    kind: 'flow-turn',
    startedAt: data.placementStartedAt,
    endedAt: data.completedAt,
    durationMs: data.turnDurationMs,
    headline,
    subline,
    verdict,
    errorTags: errorTags.length > 0 ? errorTags : undefined,
    detail,
  };
}

// =============================================================================
// Cognitive Task Projector
// =============================================================================

/**
 * Project generic cognitive task events into TurnSummary[].
 *
 * Works for all 22 cognitive task modes (flanker, go-nogo, stroop, etc.)
 * that emit COGNITIVE_TASK_TRIAL_COMPLETED events.
 */
export function projectCognitiveTaskTurns(
  events: readonly { type: string; [key: string]: unknown }[],
): TurnSummary[] {
  const turns: TurnSummary[] = [];

  for (const event of events) {
    if (event.type !== 'COGNITIVE_TASK_TRIAL_COMPLETED') continue;

    const e = event as unknown as CognitiveTaskTrialCompletedEvent;

    const verdict: TurnVerdict = e.correct ? 'correct' : 'incorrect';
    const errorTags: TurnErrorTag[] = e.correct ? [] : ['miss'];

    const detail: CognitiveTaskTrialDetail = {
      kind: 'cognitive-task-trial',
      taskType: e.taskType,
      correct: e.correct,
      responseTimeMs: e.responseTimeMs,
      condition: e.condition,
      trialData: e.trialData,
    };

    turns.push({
      index: e.trialIndex + 1,
      kind: 'cognitive-task-trial',
      startedAt: e.timestamp,
      durationMs: e.responseTimeMs,
      headline: `#${e.trialIndex + 1} ${e.correct ? '\u2713' : '\u2717'}`,
      subline: `RT: ${Math.round(e.responseTimeMs)}ms`,
      verdict,
      errorTags: errorTags.length > 0 ? errorTags : undefined,
      detail,
    });
  }

  return turns;
}

// =============================================================================
// OSpan Projector
// =============================================================================

/**
 * Project OSpan session events into TurnSummary[].
 *
 * Each OSPAN_SET_COMPLETED event maps to one TurnSummary representing
 * a single set (letter sequence + equation processing).
 */
export function projectOspanTurns(events: readonly GameEvent[]): TurnSummary[] {
  const setEvents = events.filter(
    (e): e is OspanSetCompletedEvent => e.type === 'OSPAN_SET_COMPLETED',
  );

  return setEvents.map((e, i) => ({
    index: i + 1,
    kind: 'trial' as TurnKind,
    durationMs: e.responseTimeMs,
    headline: `Set ${i + 1} · Empan ${e.span}`,
    subline: `${e.letters.join(' ')} → ${e.recalled.join(' ')}`,
    verdict: e.recallCorrect ? ('correct' as TurnVerdict) : ('miss' as TurnVerdict),
    errorTags: e.recallCorrect ? [] : (['miss'] as TurnErrorTag[]),
    detail: {
      kind: 'ospan-set' as const,
      setIndex: e.setIndex,
      span: e.span,
      letters: e.letters,
      recalled: e.recalled,
      recallCorrect: e.recallCorrect,
      equationAccuracy: e.equationAccuracy,
      responseTimeMs: e.responseTimeMs,
    } satisfies OspanSetDetail,
  }));
}
