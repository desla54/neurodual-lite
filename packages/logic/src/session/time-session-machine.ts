import type {
  DeviceInfo,
  SessionPlayContext,
  TemporalContext,
  TimeSessionEndedEvent,
  TimeSessionStartedEvent,
  TimeTrialCompletedEvent,
} from '../engine/events';
import type { TimeCompletionInput } from '../engine/session-completion-projector';
import { AllSpecs } from '../specs';

export interface SliderSample {
  readonly position: number;
  readonly time: number;
}

export interface SlideResult {
  readonly durationMs: number;
  readonly samples: readonly SliderSample[];
}

export interface SpeedSegment {
  readonly from: number;
  readonly to: number;
  readonly category: -1 | 0 | 1;
  readonly deviation: number;
}

export interface TimeTrialResult {
  readonly durationMs: number;
  readonly estimatedMs: number | null;
  readonly segments: readonly SpeedSegment[];
  readonly accuracyScore: number;
  readonly regularityScore: number;
}

export type TimeTrialPhase = 'ready' | 'sliding' | 'estimating' | 'feedback';
export type TimeSessionPhase = 'playing' | 'finished';
export type TimeSessionEndReason = 'completed' | 'abandoned';
export type TimeSliderShape = 'line' | 'circle';
export type TimeSliderDirection = 'normal' | 'reverse';

export interface TimeSessionSummary {
  readonly results: readonly TimeTrialResult[];
  readonly avgDuration: number;
  readonly avgError: number;
  readonly avgAccuracy: number;
  readonly avgRegularity: number;
  readonly avgEstimationError: number | null;
  readonly completedTrials: number;
  readonly successfulTrials: number;
  readonly failedTrials: number;
}

export interface TimeSessionMachineConfig {
  readonly totalTrials: number;
  readonly targetDurationMs: number;
  readonly estimationEnabled: boolean;
  readonly sliderShape: TimeSliderShape;
  readonly sliderDirection: TimeSliderDirection;
  readonly playContext: SessionPlayContext;
}

export interface TimeSessionMachineState {
  readonly sessionPhase: TimeSessionPhase;
  readonly trialPhase: TimeTrialPhase;
  readonly trialIndex: number;
  readonly isPaused: boolean;
  readonly sessionStarted: boolean;
  readonly sessionEndReason: TimeSessionEndReason | null;
  readonly startedAtMs: number | null;
  readonly slideResult: SlideResult | null;
  readonly segments: readonly SpeedSegment[];
  readonly estimatedMs: number | null;
  readonly results: readonly TimeTrialResult[];
  readonly userId: string | null;
}

interface TimeSessionActionBase {
  readonly type: string;
}

export interface BeginTimeTrialAction extends TimeSessionActionBase {
  readonly type: 'BEGIN_TRIAL';
  readonly timestamp: number;
  readonly userId: string;
  readonly device: DeviceInfo;
  readonly context: TemporalContext;
}

export interface CompleteTimeSlideAction extends TimeSessionActionBase {
  readonly type: 'COMPLETE_SLIDE';
  readonly durationMs: number;
  readonly samples: readonly SliderSample[];
}

export interface CancelTimeSlideAction extends TimeSessionActionBase {
  readonly type: 'CANCEL_SLIDE';
}

export interface SubmitTimeEstimationAction extends TimeSessionActionBase {
  readonly type: 'SUBMIT_ESTIMATION';
  readonly estimatedMs: number;
}

export interface AdvanceTimeTrialAction extends TimeSessionActionBase {
  readonly type: 'NEXT_TRIAL';
  readonly timestamp: number;
}

export interface ToggleTimePauseAction extends TimeSessionActionBase {
  readonly type: 'TOGGLE_PAUSE';
}

export interface AbandonTimeSessionAction extends TimeSessionActionBase {
  readonly type: 'ABANDON';
  readonly timestamp: number;
}

export interface RestartTimeSessionAction extends TimeSessionActionBase {
  readonly type: 'RESTART';
}

export type TimeSessionMachineAction =
  | BeginTimeTrialAction
  | CompleteTimeSlideAction
  | CancelTimeSlideAction
  | SubmitTimeEstimationAction
  | AdvanceTimeTrialAction
  | ToggleTimePauseAction
  | AbandonTimeSessionAction
  | RestartTimeSessionAction;

type TimeStartEventDraft = Omit<
  TimeSessionStartedEvent,
  | 'id'
  | 'timestamp'
  | 'sessionId'
  | 'eventId'
  | 'seq'
  | 'schemaVersion'
  | 'occurredAtMs'
  | 'monotonicMs'
>;

type TimeTrialEventDraft = Omit<
  TimeTrialCompletedEvent,
  | 'id'
  | 'timestamp'
  | 'sessionId'
  | 'eventId'
  | 'seq'
  | 'schemaVersion'
  | 'occurredAtMs'
  | 'monotonicMs'
>;

type TimeEndEventDraft = Omit<
  TimeSessionEndedEvent,
  | 'id'
  | 'timestamp'
  | 'sessionId'
  | 'eventId'
  | 'seq'
  | 'schemaVersion'
  | 'occurredAtMs'
  | 'monotonicMs'
>;

export type TimeSessionEventDraft = TimeStartEventDraft | TimeTrialEventDraft | TimeEndEventDraft;

export type TimeCompletionDraft = Omit<
  TimeCompletionInput,
  'mode' | 'sessionId' | 'events' | 'gameModeLabel'
>;

export interface TimeSessionMachineTransition {
  readonly state: TimeSessionMachineState;
  readonly eventDrafts: readonly TimeSessionEventDraft[];
  readonly completionDraft?: TimeCompletionDraft;
}

const HEATMAP_SEGMENTS = 24;
const SPEED_TOLERANCE = 0.3;
const TIME_PASS_THRESHOLD = AllSpecs['dual-time'].scoring.passThreshold;

function emptySummary(results: readonly TimeTrialResult[]): TimeSessionSummary {
  return {
    results,
    avgDuration: 0,
    avgError: 0,
    avgAccuracy: 0,
    avgRegularity: 0,
    avgEstimationError: null,
    completedTrials: 0,
    successfulTrials: 0,
    failedTrials: 0,
  };
}

export function createInitialTimeSessionState(): TimeSessionMachineState {
  return {
    sessionPhase: 'playing',
    trialPhase: 'ready',
    trialIndex: 0,
    isPaused: false,
    sessionStarted: false,
    sessionEndReason: null,
    startedAtMs: null,
    slideResult: null,
    segments: [],
    estimatedMs: null,
    results: [],
    userId: null,
  };
}

export function computeTimeAccuracyScore(durationMs: number, targetMs: number): number {
  const error = Math.abs(durationMs - targetMs);
  return Math.max(0, Math.round((1 - error / targetMs) * 100));
}

export function computeTimeRegularityScore(segments: readonly SpeedSegment[]): number {
  if (segments.length === 0) return 0;
  const regularCount = segments.filter((segment) => segment.category === 0).length;
  return Math.round((regularCount / segments.length) * 100);
}

export function analyzeTimeSpeed(
  samples: readonly SliderSample[],
  targetDurationMs?: number,
): SpeedSegment[] {
  if (samples.length < 2) return [];

  const first = samples[0];
  const last = samples[samples.length - 1];
  if (!first || !last) return [];
  const firstSample = first;
  const lastSample = last;

  const totalDuration = lastSample.time - firstSample.time;
  if (totalDuration <= 0) return [];

  const referenceDuration =
    targetDurationMs && targetDurationMs > 0 ? targetDurationMs : totalDuration;

  function timeAtPosition(position: number): number {
    if (position <= firstSample.position) return firstSample.time;
    if (position >= lastSample.position) return lastSample.time;

    for (let index = 1; index < samples.length; index++) {
      const previous = samples[index - 1];
      const current = samples[index];
      if (!previous || !current) continue;
      if (position < previous.position || position > current.position) continue;

      const interpolation =
        current.position === previous.position
          ? 0
          : (position - previous.position) / (current.position - previous.position);
      return previous.time + interpolation * (current.time - previous.time);
    }

    return lastSample.time;
  }

  const segments: SpeedSegment[] = [];
  const sliceSize = 1 / HEATMAP_SEGMENTS;

  for (let index = 0; index < HEATMAP_SEGMENTS; index++) {
    const from = index * sliceSize;
    const to = (index + 1) * sliceSize;
    const actualTime = timeAtPosition(to) - timeAtPosition(from);
    const idealTime = sliceSize * referenceDuration;
    const deviation = idealTime > 0 ? (actualTime - idealTime) / idealTime : 0;

    let category: -1 | 0 | 1;
    if (deviation > SPEED_TOLERANCE) category = -1;
    else if (deviation < -SPEED_TOLERANCE) category = 1;
    else category = 0;

    segments.push({ from, to, category, deviation });
  }

  return segments;
}

export function buildTimeTrialResult(
  durationMs: number,
  estimatedMs: number | null,
  segments: readonly SpeedSegment[],
  targetDurationMs: number,
): TimeTrialResult {
  return {
    durationMs,
    estimatedMs,
    segments,
    accuracyScore: computeTimeAccuracyScore(durationMs, targetDurationMs),
    regularityScore: computeTimeRegularityScore(segments),
  };
}

export function buildTimeSessionSummary(
  results: readonly TimeTrialResult[],
  targetDurationMs: number,
): TimeSessionSummary {
  if (results.length === 0) return emptySummary(results);

  const avgDuration = results.reduce((sum, result) => sum + result.durationMs, 0) / results.length;
  const avgError =
    results.reduce((sum, result) => {
      return sum + Math.abs(result.durationMs - targetDurationMs);
    }, 0) / results.length;
  const avgAccuracy = Math.round(
    results.reduce((sum, result) => sum + result.accuracyScore, 0) / results.length,
  );
  const avgRegularity = Math.round(
    results.reduce((sum, result) => sum + result.regularityScore, 0) / results.length,
  );
  const estimations = results.filter((result) => result.estimatedMs != null);
  const avgEstimationError =
    estimations.length > 0
      ? estimations.reduce((sum, result) => {
          return sum + Math.abs((result.estimatedMs ?? 0) - result.durationMs);
        }, 0) / estimations.length
      : null;
  const successfulTrials = results.filter((result) => {
    return result.accuracyScore / 100 >= TIME_PASS_THRESHOLD;
  }).length;

  return {
    results,
    avgDuration,
    avgError,
    avgAccuracy,
    avgRegularity,
    avgEstimationError,
    completedTrials: results.length,
    successfulTrials,
    failedTrials: Math.max(0, results.length - successfulTrials),
  };
}

function recordCompletedTrial(
  state: TimeSessionMachineState,
  config: TimeSessionMachineConfig,
  estimatedMs: number | null,
): TimeSessionMachineTransition {
  const slideResult = state.slideResult;
  if (!slideResult) {
    return { state, eventDrafts: [] };
  }

  const trialResult = buildTimeTrialResult(
    slideResult.durationMs,
    estimatedMs,
    state.segments,
    config.targetDurationMs,
  );
  const results = [...state.results, trialResult];

  return {
    state: {
      ...state,
      results,
      estimatedMs,
      trialPhase: 'feedback',
    },
    eventDrafts: [
      {
        type: 'TIME_TRIAL_COMPLETED',
        trialIndex: state.trialIndex,
        durationMs: trialResult.durationMs,
        estimatedMs,
        accuracyScore: trialResult.accuracyScore,
        regularityScore: trialResult.regularityScore,
        skipped: false,
      },
    ],
  };
}

function finalizeTimeSession(
  state: TimeSessionMachineState,
  config: TimeSessionMachineConfig,
  reason: TimeSessionEndReason,
  timestamp: number,
): TimeSessionMachineTransition {
  const finishedState: TimeSessionMachineState = {
    ...state,
    sessionPhase: 'finished',
    isPaused: false,
    sessionEndReason: reason,
  };

  if (!state.sessionStarted) {
    return {
      state: finishedState,
      eventDrafts: [],
    };
  }

  const summary = buildTimeSessionSummary(state.results, config.targetDurationMs);
  const durationMs = Math.max(0, timestamp - (state.startedAtMs ?? timestamp));

  return {
    state: finishedState,
    eventDrafts: [
      {
        type: 'TIME_SESSION_ENDED',
        userId: state.userId ?? undefined,
        reason,
        totalTrials: config.totalTrials,
        trialsCompleted: summary.completedTrials,
        score: summary.avgAccuracy,
        durationMs,
        playContext: config.playContext,
      },
    ],
    completionDraft: {
      reason,
      accuracy: summary.avgAccuracy,
      regularity: summary.avgRegularity,
      trialsCompleted: summary.completedTrials,
      totalTrials: config.totalTrials,
      successfulTrials: summary.successfulTrials,
      failedTrials: summary.failedTrials,
      durationMs,
      avgDurationMs: summary.avgDuration,
      avgErrorMs: summary.avgError,
    },
  };
}

export function transitionTimeSessionMachine(
  state: TimeSessionMachineState,
  action: TimeSessionMachineAction,
  config: TimeSessionMachineConfig,
): TimeSessionMachineTransition {
  switch (action.type) {
    case 'BEGIN_TRIAL': {
      if (state.sessionPhase === 'finished' || state.isPaused) return { state, eventDrafts: [] };
      if (state.trialPhase !== 'ready' && state.trialPhase !== 'sliding') {
        return { state, eventDrafts: [] };
      }

      const eventDrafts: TimeSessionEventDraft[] = [];
      if (!state.sessionStarted) {
        eventDrafts.push({
          type: 'TIME_SESSION_STARTED',
          userId: action.userId,
          config: {
            trialsCount: config.totalTrials,
            targetDurationMs: config.targetDurationMs,
            estimationEnabled: config.estimationEnabled,
            sliderShape: config.sliderShape,
            sliderDirection: config.sliderDirection,
          },
          device: action.device,
          context: action.context,
          playContext: config.playContext,
          gameMode: 'dual-time',
        });
      }

      return {
        state: {
          ...state,
          sessionStarted: true,
          startedAtMs: state.startedAtMs ?? action.timestamp,
          trialPhase: 'sliding',
          userId: state.userId ?? action.userId,
        },
        eventDrafts,
      };
    }

    case 'COMPLETE_SLIDE': {
      if (
        state.sessionPhase === 'finished' ||
        state.isPaused ||
        !state.sessionStarted ||
        (state.trialPhase !== 'ready' && state.trialPhase !== 'sliding')
      ) {
        return { state, eventDrafts: [] };
      }

      const slideResult: SlideResult = {
        durationMs: action.durationMs,
        samples: action.samples,
      };
      const segments = analyzeTimeSpeed(action.samples, config.targetDurationMs);
      const nextState: TimeSessionMachineState = {
        ...state,
        slideResult,
        segments,
        estimatedMs: null,
      };

      if (config.estimationEnabled) {
        return {
          state: {
            ...nextState,
            trialPhase: 'estimating',
          },
          eventDrafts: [],
        };
      }

      return recordCompletedTrial(nextState, config, null);
    }

    case 'CANCEL_SLIDE':
      if (state.sessionPhase === 'finished') return { state, eventDrafts: [] };
      return {
        state: {
          ...state,
          trialPhase: 'ready',
          slideResult: null,
          segments: [],
          estimatedMs: null,
        },
        eventDrafts: [],
      };

    case 'SUBMIT_ESTIMATION': {
      if (
        state.sessionPhase === 'finished' ||
        state.isPaused ||
        state.trialPhase !== 'estimating'
      ) {
        return { state, eventDrafts: [] };
      }

      return recordCompletedTrial(state, config, action.estimatedMs);
    }

    case 'NEXT_TRIAL': {
      if (state.sessionPhase === 'finished' || state.trialPhase !== 'feedback') {
        return { state, eventDrafts: [] };
      }

      const nextTrialIndex = state.trialIndex + 1;
      if (nextTrialIndex >= config.totalTrials) {
        return finalizeTimeSession(state, config, 'completed', action.timestamp);
      }

      return {
        state: {
          ...state,
          trialIndex: nextTrialIndex,
          trialPhase: 'ready',
          isPaused: false,
          slideResult: null,
          segments: [],
          estimatedMs: null,
        },
        eventDrafts: [],
      };
    }

    case 'TOGGLE_PAUSE': {
      if (state.sessionPhase === 'finished' || state.trialPhase !== 'ready') {
        return { state, eventDrafts: [] };
      }

      return {
        state: {
          ...state,
          isPaused: !state.isPaused,
        },
        eventDrafts: [],
      };
    }

    case 'ABANDON':
      return finalizeTimeSession(state, config, 'abandoned', action.timestamp);

    case 'RESTART':
      return {
        state: createInitialTimeSessionState(),
        eventDrafts: [],
      };

    default:
      return { state, eventDrafts: [] };
  }
}
