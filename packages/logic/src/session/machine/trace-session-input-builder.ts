import type { TraceExtensions } from '../../specs/trace.spec';
import { calculateTraceTimingsFromIsi } from '../../specs/trace-timing-utils';
import type { AudioPort, ClockPort, PlatformInfoPort, RandomPort } from '../../ports';
import type { CommandBusPort } from '../../ports/command-bus-port';
import { createTimerForTrace } from '../../timing';
import type { GridMode, TraceModality, TraceRhythmMode, TraceTrial } from '../../types/trace';
import { getGridDimensions } from '../../types/trace';
import { generateTraceTrials } from '../trace-trial-generation';
import { createDefaultTracePlugins, type TimingSource } from './trace-session-plugins';
import type { TraceSessionInput, TraceSpec } from './trace-session-types';

export type TraceMirrorAxisSetting = 'horizontal' | 'vertical' | 'dynamic';

export interface TraceSelfPacedTimingSettings {
  readonly stimulusDurationMs: number;
  readonly feedbackDurationMs: number;
  readonly ruleDisplayMs: number;
  readonly intervalMs: number;
}

export interface TraceSessionTimings {
  readonly stimulusDurationMs: number;
  readonly responseWindowMs: number;
  readonly feedbackDurationMs: number;
  readonly ruleDisplayMs: number;
  readonly intervalMs: number;
  readonly warmupStimulusDurationMs: number;
}

export function deriveTraceSessionTimings(options: {
  readonly rhythmMode: TraceRhythmMode;
  readonly isiMs: number;
  readonly selfPacedTimings?: TraceSelfPacedTimingSettings;
}): TraceSessionTimings {
  const { rhythmMode, isiMs, selfPacedTimings } = options;
  const isiTimings = calculateTraceTimingsFromIsi(isiMs);

  if (rhythmMode === 'self-paced') {
    if (!selfPacedTimings) {
      throw new Error(
        '[deriveTraceSessionTimings] selfPacedTimings is required when rhythmMode="self-paced"',
      );
    }

    return {
      stimulusDurationMs: selfPacedTimings.stimulusDurationMs,
      // Self-paced has no timeout, but keep a positive value for consistency
      // (schema validation + reporting metadata).
      responseWindowMs: isiTimings.responseWindowMs,
      feedbackDurationMs: selfPacedTimings.feedbackDurationMs,
      ruleDisplayMs: selfPacedTimings.ruleDisplayMs,
      intervalMs: selfPacedTimings.intervalMs,
      warmupStimulusDurationMs: selfPacedTimings.stimulusDurationMs + 500,
    };
  }

  return {
    stimulusDurationMs: isiTimings.stimulusDurationMs,
    responseWindowMs: isiTimings.responseWindowMs,
    feedbackDurationMs: isiTimings.feedbackDurationMs,
    ruleDisplayMs: isiTimings.intervalMs * 0.6,
    intervalMs: isiTimings.intervalMs,
    warmupStimulusDurationMs: isiTimings.warmupStimulusDurationMs,
  };
}

export function createTimingSourceFromTraceSessionTimings(
  timings: TraceSessionTimings,
  soundEnabled: boolean,
): TimingSource {
  return {
    stimulusDurationMs: timings.stimulusDurationMs,
    warmupStimulusDurationMs: timings.warmupStimulusDurationMs,
    responseWindowMs: timings.responseWindowMs,
    feedbackDurationMs: timings.feedbackDurationMs,
    ruleDisplayMs: timings.ruleDisplayMs,
    intervalMs: timings.intervalMs,
    soundEnabled,
  };
}

export function resolveTraceGridMode(options: {
  readonly gridMode: GridMode;
  readonly mirrorSwipe: boolean;
  readonly mirrorAxis: TraceMirrorAxisSetting;
}): GridMode {
  const { gridMode, mirrorSwipe, mirrorAxis } = options;
  if (!mirrorSwipe) return gridMode;

  if (mirrorAxis === 'vertical') return '4x3';
  if (mirrorAxis === 'dynamic') return '4x4';
  return '3x4';
}

interface ModalityFlags {
  audioEnabled: boolean;
  colorEnabled: boolean;
  imageEnabled: boolean;
  digitsEnabled: boolean;
  emotionsEnabled: boolean;
  wordsEnabled: boolean;
  tonesEnabled: boolean;
  spatialEnabled: boolean;
  enabledModalities: readonly TraceModality[];
}

function buildEnabledModalitiesFromDefaults(
  defaultsActiveModalities: readonly string[] | undefined,
): ModalityFlags {
  const activeModalities = defaultsActiveModalities ?? ['position'];
  const audioEnabled = activeModalities.includes('audio');
  const colorEnabled = activeModalities.includes('color');
  const imageEnabled = activeModalities.includes('image');
  const digitsEnabled = activeModalities.includes('digits');
  const emotionsEnabled = activeModalities.includes('emotions');
  const wordsEnabled = activeModalities.includes('words');
  const tonesEnabled = activeModalities.includes('tones');
  const spatialEnabled = activeModalities.includes('spatial');
  const enabledModalities: TraceModality[] = ['position'];
  if (audioEnabled) enabledModalities.push('audio');
  if (colorEnabled) enabledModalities.push('color');
  if (imageEnabled) enabledModalities.push('image');
  if (digitsEnabled) enabledModalities.push('digits');
  if (emotionsEnabled) enabledModalities.push('emotions');
  if (wordsEnabled) enabledModalities.push('words');
  if (tonesEnabled) enabledModalities.push('tones');
  if (spatialEnabled) enabledModalities.push('spatial');
  return {
    audioEnabled,
    colorEnabled,
    imageEnabled,
    digitsEnabled,
    emotionsEnabled,
    wordsEnabled,
    tonesEnabled,
    spatialEnabled,
    enabledModalities,
  };
}

export interface BuildDualTraceSessionMachineInputArgs {
  // Identity
  readonly sessionId: string;
  readonly userId: string;

  /** Explicit play context for deterministic events/reports */
  readonly playMode: 'journey' | 'free';

  // Metadata (journey)
  readonly journeyStageId?: number;
  readonly journeyId?: string;
  readonly journeyStartLevel?: number;
  readonly journeyTargetLevel?: number;
  readonly journeyGameMode?: string;
  readonly journeyName?: string;

  // Services (injected)
  readonly audio: AudioPort;
  readonly clock: ClockPort;
  readonly random: RandomPort;

  /** Optional command bus for strict command-based event persistence. */
  readonly commandBus?: CommandBusPort;

  /** Optional platform info port for persisted session metadata. */
  readonly platformInfoPort?: PlatformInfoPort;

  // Spec-driven config
  readonly baseSpec: TraceSpec;
  readonly sessionTimings: TraceSessionTimings;

  /** Whether feedback sounds are enabled (user setting) */
  readonly soundEnabled: boolean;

  /** Whether adaptive timing is enabled (UI toggle) */
  readonly adaptiveTimingEnabled: boolean;

  /**
   * Stable getter for the mutable TimingSource.
   * Used by plugins to support hot-reload of timings.
   */
  readonly getTimingSource: () => TimingSource;

  /** Optional recovery state */
  readonly recoveryState?: TraceSessionInput['recoveryState'];
}

export interface DualTraceSessionBuildResult {
  readonly input: TraceSessionInput;
  readonly trials: readonly TraceTrial[];
  readonly enabledModalities: readonly TraceModality[];
  readonly gridMode: GridMode;
  readonly gridCols: number;
  readonly gridRows: number;
  readonly numPositions: number;
}

export function buildDualTraceSessionMachineInput(
  args: BuildDualTraceSessionMachineInputArgs,
): DualTraceSessionBuildResult {
  const {
    sessionId,
    userId,
    playMode,
    journeyStageId,
    journeyId,
    journeyStartLevel,
    journeyTargetLevel,
    journeyGameMode,
    journeyName,
    audio,
    clock,
    random,
    commandBus,
    platformInfoPort,
    baseSpec,
    sessionTimings,
    soundEnabled,
    adaptiveTimingEnabled,
    getTimingSource,
    recoveryState,
  } = args;

  const {
    audioEnabled,
    colorEnabled,
    imageEnabled,
    digitsEnabled,
    emotionsEnabled,
    wordsEnabled,
    tonesEnabled,
    spatialEnabled,
    enabledModalities,
  } = buildEnabledModalitiesFromDefaults(baseSpec.defaults.activeModalities);

  const dyslat = baseSpec.extensions.dyslatéralisation;
  const gridMode = resolveTraceGridMode({
    gridMode: dyslat.gridMode ?? '3x3',
    mirrorSwipe: dyslat.mirrorSwipe ?? false,
    mirrorAxis: (dyslat.mirrorAxis ?? 'horizontal') as TraceMirrorAxisSetting,
  });
  const { positions: numPositions, cols: gridCols, rows: gridRows } = getGridDimensions(gridMode);

  const trials = generateTraceTrials({
    trialsCount: baseSpec.defaults.trialsCount,
    enabledModalities,
    dynamicRules: baseSpec.extensions.dynamicRules,
    // Sequential trace defines a fixed sweep (T→T-1→...); dynamic direction would conflict.
    dynamicSwipeDirection:
      baseSpec.extensions.dynamicSwipeDirection && !baseSpec.extensions.sequentialTrace,
    random,
    numPositions,
    mirrorAxisSetting: dyslat.mirrorSwipe ? dyslat.mirrorAxis : undefined,
  });

  const effectiveSpec: TraceSpec = {
    ...baseSpec,
    timing: {
      ...baseSpec.timing,
      stimulusDurationMs: sessionTimings.stimulusDurationMs,
      responseWindowMs: sessionTimings.responseWindowMs,
      feedbackDurationMs: sessionTimings.feedbackDurationMs,
      intervalMs: sessionTimings.intervalMs,
      warmupStimulusDurationMs: sessionTimings.warmupStimulusDurationMs,
    },
    extensions: {
      ...baseSpec.extensions,
      // Sync extensions with spec.defaults.activeModalities (SSOT for UI settings)
      audioEnabled,
      colorEnabled,
      imageEnabled,
      digitsEnabled,
      emotionsEnabled,
      wordsEnabled,
      tonesEnabled,
      spatialEnabled,
      ruleDisplayMs: sessionTimings.ruleDisplayMs,
      soundEnabled,
      adaptiveTimingEnabled,
      writing: {
        ...baseSpec.extensions.writing,
        enabled:
          baseSpec.extensions.writing.enabled ||
          audioEnabled ||
          colorEnabled ||
          imageEnabled ||
          digitsEnabled ||
          emotionsEnabled ||
          wordsEnabled ||
          tonesEnabled ||
          spatialEnabled ||
          baseSpec.extensions.audioEnabled ||
          baseSpec.extensions.colorEnabled,
      },
      arithmeticInterference: baseSpec.extensions.arithmeticInterference,
      // Sequential trace defines a fixed sweep; disable the dynamic direction UX.
      dynamicSwipeDirection:
        baseSpec.extensions.dynamicSwipeDirection && !baseSpec.extensions.sequentialTrace,
      mindfulTiming: {
        ...baseSpec.extensions.mindfulTiming,
        enabled:
          baseSpec.extensions.mindfulTiming.enabled &&
          baseSpec.extensions.rhythmMode === 'self-paced' &&
          !baseSpec.extensions.sequentialTrace,
      },
      dyslatéralisation: {
        ...baseSpec.extensions.dyslatéralisation,
        gridMode,
      },
    } satisfies TraceExtensions,
  };

  const timer = createTimerForTrace(
    {
      rhythmMode: effectiveSpec.extensions.rhythmMode,
      intervalMs: sessionTimings.intervalMs,
      stimulusDurationMs: sessionTimings.stimulusDurationMs,
      responseWindowMs: sessionTimings.responseWindowMs,
      feedbackDurationMs: sessionTimings.feedbackDurationMs,
    },
    audio,
  );

  const plugins = createDefaultTracePlugins({
    spec: effectiveSpec,
    getTimingSource,
  });

  const initialTimingSource = createTimingSourceFromTraceSessionTimings(
    sessionTimings,
    soundEnabled,
  );

  const input: TraceSessionInput = {
    sessionId,
    userId,
    playMode,
    journeyStageId,
    journeyId,
    journeyStartLevel,
    journeyTargetLevel,
    journeyGameMode,
    journeyName,
    audio,
    clock,
    random,
    timer,
    commandBus,
    platformInfoPort,
    plugins,
    spec: effectiveSpec,
    trials,
    gameMode: baseSpec.metadata.id,
    initialTimingSource,
    recoveryState,
  };

  return {
    input,
    trials,
    enabledModalities,
    gridMode,
    gridCols,
    gridRows,
    numPositions,
  };
}
