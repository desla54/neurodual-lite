import {
  getDualTrackTierCount,
  getDualTrackTierProfile,
  IMAGE_MODALITY_SHAPES,
  SPATIAL_DIRECTIONS,
  DIGIT_VALUES,
  EMOTION_VALUES,
  WORD_VALUES,
  POSITIONS,
  TONE_VALUES,
  SeededRandom,
  SOUNDS,
  type CommandBusPort,
  type DualTrackJourneyPreset,
  type DualTrackPathEvaluation,
  type DualTrackPathProfile,
  type GameEvent,
  type PlatformInfoPort,
  type ImageShape,
  type Position,
  type SpatialDirection,
  type DigitValue,
  type EmotionValue,
  type WordValue,
  type ToneValue,
  type Sound,
} from '@neurodual/logic';
import gsap from 'gsap';

// =============================================================================
// Constants
// =============================================================================

const BALL_RADIUS = 22;
const BALL_DIAMETER = BALL_RADIUS * 2;
const DEFAULT_TOTAL_OBJECTS = 8;
const DEFAULT_TARGET_COUNT = 3;
const HIGHLIGHT_MS = 2500;
const TRACKING_MS = 5000;
const FEEDBACK_MS = 1800;
const DEFAULT_TOTAL_ROUNDS = 10;
const COUNTDOWN_SECONDS = 3;
const INSET = BALL_RADIUS + 8;
const MIN_BALL_GAP = BALL_DIAMETER + 14;
const MAX_POSITION_ATTEMPTS = 80;
const TRACKING_SPEED_PX_PER_SEC = 160;
const MAX_RENDERED_OBJECTS = 14;
const FLOATING_CONTROL_PADDING = 12;
const FINAL_SELECTION_MIN_SEPARATION_PX = BALL_DIAMETER * 0.72;
const FINAL_SELECTION_SETTLE_MS = 180;
const BALL_IDS = Array.from({ length: MAX_RENDERED_OBJECTS }, (_, i) => i);
const DUAL_TRACK_PATH_STORAGE_KEY = 'dual-track-path';
const DUAL_TRACK_TIERS_PER_PHASE = 5;
const TRACK_IDENTITY_PROMPT_COLORS = [
  'red',
  'green',
  'blue',
  'yellow',
  'purple',
  'orange',
] as const;
const TRACK_IDENTITY_LETTER_SPACING_MS = 1500;

// --- 2.5D depth constants ---
const DEPTH_NEAR_SCALE = 1.08;
const DEPTH_FAR_SCALE = 0.92;
const TRACK_IDENTITY_LETTER_TAIL_MS = 850;

type TrackingIdentityMode =
  | 'classic'
  | 'color'
  | 'letter'
  | 'position'
  | 'image'
  | 'spatial'
  | 'digits'
  | 'emotions'
  | 'words';
type TrackIdentityColorId = (typeof TRACK_IDENTITY_PROMPT_COLORS)[number];
type TrackIdentityVisualColorId = TrackIdentityColorId;

interface TrackIdentityColor {
  readonly id: TrackIdentityVisualColorId;
  readonly fill: string;
  readonly border: string;
  readonly glow: string;
  readonly text: string;
}

interface TrackFeedbackState {
  readonly correctIndices: readonly number[];
  readonly wrongIdentityIndices: readonly number[];
  readonly wrongDistractorIndices: readonly number[];
  readonly missedIndices: readonly number[];
}

/** Text color that contrasts well with each base hue (used for labels on colored balls). */
const TRACK_IDENTITY_TEXT_COLOR: Record<TrackIdentityVisualColorId, string> = {
  red: '#fff7f7',
  green: '#062b12',
  blue: '#f8fbff',
  yellow: '#422006',
  purple: '#fff7ff',
  orange: '#fffaf3',
};

/**
 * Build a TrackIdentityColor from a live CSS variable.
 * Reads the resolved HSL triplet from the document root so it follows
 * the active woven / vivid theme automatically.
 */
function buildTrackIdentityColorFromCssVar(
  id: TrackIdentityVisualColorId,
  cssVarName: string,
): TrackIdentityColor {
  let h = 0;
  let s = 50;
  let l = 50;
  if (typeof document !== 'undefined') {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(cssVarName).trim();
    const parts = raw.split(/\s+/);
    if (parts.length >= 3) {
      h = Number.parseFloat(parts[0] as string) || 0;
      s = Number.parseFloat(parts[1] as string) || 50;
      l = Number.parseFloat(parts[2] as string) || 50;
    }
  }
  return {
    id,
    fill: `hsla(${h}, ${s}%, ${l}%, 0.94)`,
    border: `hsla(${h}, ${Math.max(0, s - 10)}%, ${Math.min(95, l + 30)}%, 0.96)`,
    glow: `hsla(${h}, ${s}%, ${l}%, 0.48)`,
    text: TRACK_IDENTITY_TEXT_COLOR[id],
  };
}

/**
 * CSS variable names for each color, per theme.
 * 'woven' reads --woven-incorrect (red), --woven-correct (green), etc.
 * 'vivid' reads --vivid-red, --vivid-green, etc.
 */
const TRACK_COLOR_CSS_VARS: Record<
  'woven' | 'vivid',
  Record<TrackIdentityVisualColorId, string>
> = {
  woven: {
    red: '--woven-incorrect',
    green: '--woven-correct',
    blue: '--woven-blue',
    yellow: '--woven-yellow',
    purple: '--woven-purple',
    orange: '--woven-orange',
  },
  vivid: {
    red: '--vivid-red',
    green: '--vivid-green',
    blue: '--vivid-blue',
    yellow: '--vivid-yellow',
    purple: '--vivid-purple',
    orange: '--vivid-orange',
  },
};

/** Current theme for track identity colors. Set by the training page from settings. */
let _trackColorTheme: 'woven' | 'vivid' = 'vivid';

function setTrackColorTheme(theme: 'woven' | 'vivid'): void {
  _trackColorTheme = theme;
}

/** Cache busted whenever theme changes. */
let _trackColorCache: Record<string, TrackIdentityColor> = {};
let _trackColorCacheTheme: 'woven' | 'vivid' | null = null;

function createEmptyTrackFeedbackState(): TrackFeedbackState {
  return {
    correctIndices: [],
    wrongIdentityIndices: [],
    wrongDistractorIndices: [],
    missedIndices: [],
  };
}

function getTrackIdentityColor(colorId: TrackIdentityVisualColorId): TrackIdentityColor {
  if (_trackColorCacheTheme !== _trackColorTheme) {
    _trackColorCache = {};
    _trackColorCacheTheme = _trackColorTheme;
  }
  const cached = _trackColorCache[colorId];
  if (cached) return cached;
  const cssVar = TRACK_COLOR_CSS_VARS[_trackColorTheme][colorId];
  const color = buildTrackIdentityColorFromCssVar(colorId, cssVar);
  _trackColorCache[colorId] = color;
  return color;
}

function getSequentialTrackHighlightColor(colorId?: TrackIdentityColorId): TrackIdentityColor {
  if (colorId) return getTrackIdentityColor(colorId);
  return getTrackIdentityColor('green');
}

function getTrackIdentityPromptColors(targetCount: number, seed?: string): TrackIdentityColorId[] {
  const pool = [...TRACK_IDENTITY_PROMPT_COLORS];
  if (seed) {
    // Fisher-Yates shuffle with seeded RNG
    const rng = new SeededRandom(seed);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = rng.int(0, i + 1);
      [pool[i], pool[j]] = [pool[j] as TrackIdentityColorId, pool[i] as TrackIdentityColorId];
    }
  }
  return pool.slice(0, Math.max(0, targetCount));
}

function getTrackIdentityPromptLetters(targetCount: number, seed: string): Sound[] {
  const rng = new SeededRandom(seed);
  const pool: Sound[] = [...SOUNDS];
  const letters: Sound[] = [];

  while (letters.length < targetCount && pool.length > 0) {
    const index = rng.int(0, pool.length);
    letters.push(pool.splice(index, 1)[0] ?? SOUNDS[0]);
  }

  return letters;
}

function getTrackIdentityPromptPositions(targetCount: number, seed: string): Position[] {
  const rng = new SeededRandom(seed);
  const pool: Position[] = [...POSITIONS];
  const positions: Position[] = [];

  while (positions.length < targetCount && pool.length > 0) {
    const index = rng.int(0, pool.length);
    positions.push(pool.splice(index, 1)[0] ?? POSITIONS[0]);
  }

  return positions;
}

function getTrackIdentityPromptShapes(targetCount: number, seed: string): ImageShape[] {
  const rng = new SeededRandom(seed);
  const pool: ImageShape[] = [...IMAGE_MODALITY_SHAPES];
  const shapes: ImageShape[] = [];

  while (shapes.length < targetCount && pool.length > 0) {
    const index = rng.int(0, pool.length);
    shapes.push(pool.splice(index, 1)[0] ?? IMAGE_MODALITY_SHAPES[0]);
  }

  return shapes;
}

function getTrackIdentityPromptDirections(targetCount: number, seed: string): SpatialDirection[] {
  const rng = new SeededRandom(seed);
  const pool: SpatialDirection[] = [...SPATIAL_DIRECTIONS];
  const result: SpatialDirection[] = [];
  while (result.length < targetCount && pool.length > 0) {
    const index = rng.int(0, pool.length);
    result.push(pool.splice(index, 1)[0] ?? SPATIAL_DIRECTIONS[0]);
  }
  return result;
}

function getTrackIdentityPromptDigits(targetCount: number, seed: string): DigitValue[] {
  const rng = new SeededRandom(seed);
  const pool: DigitValue[] = [...DIGIT_VALUES];
  const result: DigitValue[] = [];
  while (result.length < targetCount && pool.length > 0) {
    const index = rng.int(0, pool.length);
    result.push(pool.splice(index, 1)[0] ?? DIGIT_VALUES[0]);
  }
  return result;
}

function getTrackIdentityPromptEmotions(targetCount: number, seed: string): EmotionValue[] {
  const rng = new SeededRandom(seed);
  const pool: EmotionValue[] = [...EMOTION_VALUES];
  const result: EmotionValue[] = [];
  while (result.length < targetCount && pool.length > 0) {
    const index = rng.int(0, pool.length);
    result.push(pool.splice(index, 1)[0] ?? EMOTION_VALUES[0]);
  }
  return result;
}

function getTrackIdentityPromptWords(targetCount: number, seed: string): WordValue[] {
  const rng = new SeededRandom(seed);
  const pool: WordValue[] = [...WORD_VALUES];
  const result: WordValue[] = [];
  while (result.length < targetCount && pool.length > 0) {
    const index = rng.int(0, pool.length);
    result.push(pool.splice(index, 1)[0] ?? WORD_VALUES[0]);
  }
  return result;
}

function getTrackIdentityPromptTones(targetCount: number, seed: string): ToneValue[] {
  const rng = new SeededRandom(seed);
  const pool: ToneValue[] = [...TONE_VALUES];
  const result: ToneValue[] = [];
  while (result.length < targetCount && pool.length > 0) {
    const index = rng.int(0, pool.length);
    result.push(pool.splice(index, 1)[0] ?? TONE_VALUES[0]);
  }
  return result;
}

function getSelectionPromptOrder(targetCount: number, seed: string, shuffle: boolean): number[] {
  const order = Array.from({ length: targetCount }, (_, index) => index);
  if (!shuffle || targetCount < 2) return order;

  const rng = new SeededRandom(seed);
  const shuffled = rng.shuffle([...order]);

  if (shuffled.every((value, index) => value === order[index])) {
    shuffled.push(...shuffled.splice(0, 1));
  }

  return shuffled;
}

function getTemporalContext() {
  const now = new Date();
  const hour = now.getHours();
  const timeOfDay =
    hour < 6
      ? 'night'
      : hour < 12
        ? 'morning'
        : hour < 18
          ? 'afternoon'
          : hour < 22
            ? 'evening'
            : 'night';
  return {
    timeOfDay: timeOfDay as 'morning' | 'afternoon' | 'evening' | 'night',
    localHour: hour,
    dayOfWeek: now.getDay(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

function getDeviceInfo(platformInfo: PlatformInfoPort) {
  const info = platformInfo.getPlatformInfo();
  return {
    platform: info.platform,
    screenWidth: info.screenWidth,
    screenHeight: info.screenHeight,
    userAgent: info.userAgent,
    touchCapable: info.touchCapable,
  };
}

function isWebglSupported(): boolean {
  if (typeof document === 'undefined') return false;

  try {
    const canvas = document.createElement('canvas');
    return Boolean(
      canvas.getContext('webgl2') ||
        canvas.getContext('webgl') ||
        canvas.getContext('experimental-webgl'),
    );
  } catch {
    return false;
  }
}

function createEnvelope(emitter: EventEmitter) {
  const now = Date.now();
  const id = crypto.randomUUID();
  return {
    id,
    timestamp: now,
    sessionId: emitter.sessionId,
    eventId: id,
    seq: emitter.seq++,
    schemaVersion: 1 as const,
    occurredAtMs: now,
    monotonicMs: performance.now(),
  };
}

function persistEvent(emitter: EventEmitter, event: Record<string, unknown>): Promise<void> {
  const bus = emitter.commandBus;
  const id = String(event['id'] ?? '');
  if (!bus || id.length === 0) return Promise.resolve();

  const type = String(event['type'] ?? '');
  const commandType = type.endsWith('_STARTED')
    ? 'SESSION/START'
    : type.endsWith('_ENDED')
      ? 'SESSION/END'
      : 'SESSION/RECORD_TRIAL';
  const commandId = type.endsWith('_ENDED')
    ? `end:${emitter.sessionId}`
    : type.endsWith('_STARTED')
      ? `start:${emitter.sessionId}`
      : `evt:${id}`;

  return bus.handle({
    type: commandType,
    data: { sessionId: emitter.sessionId, event },
    metadata: { commandId, timestamp: new Date() },
  }) as Promise<void>;
}

function materializeMotEvent(emitter: EventEmitter, draft: MotEventDraft): GameEvent {
  return {
    ...createEnvelope(emitter),
    ...draft,
  } as unknown as GameEvent;
}

// =============================================================================
// Types
// =============================================================================

type Phase =
  | 'idle'
  | 'countdown'
  | 'highlight'
  | 'tracking'
  | 'selection'
  | 'feedback'
  | 'finished';

interface RoundResult {
  correctCount: number;
  totalTargets: number;
  accuracy: number;
}

interface MovingBallState {
  x: number;
  y: number;
  speedPxPerSec: number;
  headingRad: number;
  turnRateRadPerSec: number;
  turnJitterTimerMs: number;
  minTurnIntervalMs: number;
  maxTurnIntervalMs: number;
  maxTurnRateRadPerSec: number;
}

interface SerializableMovingBallState extends MovingBallState {
  rngSeed: string;
}

interface RuntimeMovingBallState extends MovingBallState {
  rngSeed: string;
  rng: SeededRandom;
}

type MotionComplexity = 'smooth' | 'standard' | 'agile';
type CrowdingMode = 'low' | 'standard' | 'dense';
type DepthMode = 'flat' | '2.5d';
type TrackRenderMode = 'dom' | 'webgl' | 'webgl3d';

interface MotionProfile {
  minTurnIntervalMs: number;
  maxTurnIntervalMs: number;
  maxTurnRateRadPerSec: number;
}

type SelectionControlId = 'instruction' | 'confirm';

interface SelectionControlOffset {
  x: number;
  y: number;
}

interface SelectionControlDragState {
  controlId: SelectionControlId;
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

interface EventEmitter {
  sessionId: string;
  userId: string;
  seq: number;
  events: GameEvent[];
  commandBus: CommandBusPort | null;
}

type SessionPlayContext = 'free' | 'journey' | 'synergy' | 'calibration' | 'profile';

interface JourneyRouterState {
  playMode?: SessionPlayContext;
  journeyStageId?: number;
  journeyId?: string;
  journeyStrategyConfig?: import('@neurodual/logic').JourneyStrategyConfig;
  journeyNLevel?: number;
  dualTrackJourneyTargetCount?: number;
  dualTrackJourneyTierIndex?: number;
}

interface TrackSessionRuntime {
  emitter: EventEmitter;
  playContext: SessionPlayContext;
  startedAtMs: number;
  ended: boolean;
  config: TrackSessionPlayConfig;
}

interface TrackSessionPlayConfig {
  totalObjects: number;
  targetCount: number;
  highlightDurationMs: number;
  trackingDurationMs: number;
  speedPxPerSec: number;
  trackingIdentityMode?: TrackingIdentityMode;
  trackingLetterAudioEnabled?: boolean;
  trackingTonesEnabled?: boolean;
  focusCrossEnabled?: boolean;
  highlightSpacingMs?: number;
  motionComplexity: MotionComplexity;
  crowdingMode: CrowdingMode;
  crowdingThresholdPx: number;
  minSeparationPx: number;
  arenaWidthPx: number;
  arenaHeightPx: number;
}

interface TrackRoundRuntimeMetrics {
  crowdingEvents: number;
  minInterObjectDistancePx: number;
  activeCrowdingPairs: Set<string>;
}

interface AdaptivePathSnapshot {
  targetCountStage: number;
  difficultyTier: number;
  tierCount: number;
  stageProgressPct: number;
  phaseIndex?: number;
  phaseIdentityMode?: 'classic' | 'audio' | 'color' | 'audio-color';
  highestCompletedTargetCount: number;
  nextTargetCountStage?: number;
  nextDifficultyTier?: number;
  progressDeltaPct?: number;
  promotedTargetCount?: boolean;
  tierChanged?: boolean;
  performanceBand?: 'mastery' | 'solid' | 'building' | 'struggling';
  completed?: boolean;
}

type CalibrationIdentityMode = 'classic' | 'audio' | 'color' | 'audio-color';
type CalibrationBloc = 'tracking' | 'audio' | 'color' | 'combined';

interface CalibrationRoundPlan {
  targetCount: number;
  tierIndex: number;
  bloc: CalibrationBloc;
  identityMode: CalibrationIdentityMode;
  totalObjectsMode?: 'auto' | 'manual';
  recommendedTotalObjects: number;
  highlightDurationMs: number;
  trackingDurationMs: number;
  speedPxPerSec: number;
  motionComplexity: MotionComplexity;
  crowdingMode: CrowdingMode;
}

type MotEventDraft =
  | {
      type: 'MOT_SESSION_STARTED';
      userId: string;
      config: {
        sessionKind?: 'standard' | 'calibration';
        calibrationModality?: string;
        trialsCount: number;
        totalObjects: number;
        targetCount: number;
        highlightDurationMs: number;
        trackingDurationMs: number;
        speedPxPerSec: number;
        motionComplexity: MotionComplexity;
        crowdingMode: CrowdingMode;
        crowdingThresholdPx: number;
        minSeparationPx: number;
        arenaWidthPx: number;
        arenaHeightPx: number;
      };
      device: ReturnType<typeof getDeviceInfo>;
      context: ReturnType<typeof getTemporalContext>;
      playContext: SessionPlayContext;
      gameMode: 'dual-track';
      adaptivePath?: AdaptivePathSnapshot;
      journeyStageId?: number;
      journeyId?: string;
      journeyStartLevel?: number;
      journeyTargetLevel?: number;
      journeyGameMode?: string;
      journeyName?: string;
      journeyStrategyConfig?: import('@neurodual/logic').JourneyStrategyConfig;
    }
  | {
      type: 'MOT_TRIAL_COMPLETED';
      trialIndex: number;
      targetIndices: number[];
      selectedIndices: number[];
      correctCount: number;
      totalTargets: number;
      accuracy: number;
      identityPromptColorIds?: TrackIdentityColorId[];
      identityPromptLetters?: Sound[];
      identityPromptTones?: ToneValue[];
      selectionPromptOrder?: number[];
      colorPassSelections?: number[];
      colorSelectionPromptOrder?: number[];
      responseTimeMs: number;
      crowdingEvents: number;
      minInterObjectDistancePx: number;
      adaptivePath?: AdaptivePathSnapshot;
    }
  | {
      type: 'MOT_TRIAL_DEFINED';
      trialIndex: number;
      trialSeed: string;
      arenaWidthPx: number;
      arenaHeightPx: number;
      totalObjects: number;
      targetCount: number;
      initialObjects: SerializableMovingBallState[];
      adaptivePath?: AdaptivePathSnapshot;
    }
  | {
      type: 'MOT_SESSION_ENDED';
      reason: 'completed' | 'abandoned';
      totalTrials: number;
      correctTrials: number;
      accuracy: number;
      score: number;
      durationMs: number;
      playContext: SessionPlayContext;
      adaptivePath?: AdaptivePathSnapshot;
      journeyStageId?: number;
      journeyId?: string;
    };

// TrackHUD — replaced by shared GameHUD from @neurodual/ui

// =============================================================================
// Pure helpers
// =============================================================================

function buildAdaptivePathSnapshot(
  profile: DualTrackPathProfile,
  preset: DualTrackJourneyPreset = 'medium',
): AdaptivePathSnapshot {
  const tierCount = getDualTrackTierCount(preset);
  const tier = getDualTrackTierProfile(
    profile.currentTargetCount,
    profile.currentTierIndex,
    preset,
  );
  return {
    targetCountStage: profile.currentTargetCount,
    difficultyTier: profile.currentTierIndex,
    tierCount,
    stageProgressPct: profile.stageProgressPct,
    phaseIndex: tier.phaseIndex,
    phaseIdentityMode: tier.phaseIdentityMode,
    highestCompletedTargetCount: profile.highestCompletedTargetCount,
    completed: profile.completed,
  };
}

function buildAdaptivePathSnapshotFromEvaluation(
  evaluation: DualTrackPathEvaluation,
  preset: DualTrackJourneyPreset = 'medium',
): AdaptivePathSnapshot {
  const tierCount = getDualTrackTierCount(preset);
  const tier = getDualTrackTierProfile(
    evaluation.next.currentTargetCount,
    evaluation.next.currentTierIndex,
    preset,
  );
  return {
    targetCountStage: evaluation.next.currentTargetCount,
    difficultyTier: evaluation.next.currentTierIndex,
    tierCount,
    stageProgressPct: evaluation.next.stageProgressPct,
    phaseIndex: tier.phaseIndex,
    phaseIdentityMode: tier.phaseIdentityMode,
    highestCompletedTargetCount: evaluation.next.highestCompletedTargetCount,
    nextTargetCountStage: evaluation.next.currentTargetCount,
    nextDifficultyTier: evaluation.next.currentTierIndex,
    progressDeltaPct: evaluation.progressDeltaPct,
    promotedTargetCount: evaluation.promotedTargetCount,
    tierChanged: evaluation.tierChanged,
    performanceBand: evaluation.performanceBand,
    completed: evaluation.next.completed,
  };
}

function createAdaptiveSessionPlan(input: {
  profile: DualTrackPathProfile;
  preset?: 'easy' | 'medium' | 'hard' | null;
  manualTrialsCount: number;
  manualHighlightMs: number;
}): {
  targetCount: number;
  recommendedTotalObjects: number;
  trackingDurationMs: number;
  speedPxPerSec: number;
  motionComplexity: MotionComplexity;
  crowdingMode: CrowdingMode;
  identityMode: 'classic' | 'audio' | 'color' | 'audio-color';
  trialsCount: number;
  highlightDurationMs: number;
} {
  const { profile, preset, manualTrialsCount, manualHighlightMs } = input;
  const tier = getDualTrackTierProfile(
    profile.currentTargetCount,
    profile.currentTierIndex,
    preset ?? undefined,
  );
  const stageTargetCount = profile.currentTargetCount;
  const recommendedTotalObjects = Math.min(
    MAX_RENDERED_OBJECTS,
    Math.max(stageTargetCount + 1, tier.recommendedTotalObjects),
  );

  return {
    targetCount: stageTargetCount,
    recommendedTotalObjects,
    trackingDurationMs: tier.trackingDurationMs,
    speedPxPerSec: tier.speedPxPerSec,
    motionComplexity: tier.motionComplexity,
    crowdingMode: tier.crowdingMode,
    identityMode: tier.identityMode,
    trialsCount: Math.max(6, Math.min(12, manualTrialsCount)),
    highlightDurationMs: Math.max(500, manualHighlightMs),
  };
}

/**
 * Calibration plan — 20 rounds across 4 blocs:
 *
 * Bloc 1 (tracking, 8 rounds): N=2 tiers 0-3, N=3 tiers 0-3 → determines N-level
 * Bloc 2 (audio, 4 rounds):    at calibrated N, tiers 0-3   → tests audio binding
 * Bloc 3 (color, 4 rounds):    at calibrated N, tiers 0-3   → tests color binding
 * Bloc 4 (combined, 4 rounds): at calibrated N, tiers 0-3   → tests audio+color
 *
 * Blocs 2-4 use N=2 as default (actual N determined at estimation time).
 */
function createDualTrackCalibrationPlan(highlightDurationMs: number): CalibrationRoundPlan[] {
  const safeHighlight = Math.max(500, highlightDurationMs);

  function buildRound(
    targetCount: number,
    tierIndex: number,
    bloc: CalibrationBloc,
    identityMode: CalibrationIdentityMode,
  ): CalibrationRoundPlan {
    const tier = getDualTrackTierProfile(targetCount, tierIndex, 'medium');
    return {
      targetCount,
      tierIndex,
      bloc,
      identityMode,
      recommendedTotalObjects: Math.min(
        MAX_RENDERED_OBJECTS,
        Math.max(targetCount + 1, tier.recommendedTotalObjects),
      ),
      highlightDurationMs: safeHighlight,
      trackingDurationMs: Math.max(10_000, tier.trackingDurationMs),
      speedPxPerSec: Math.max(80, tier.speedPxPerSec),
      motionComplexity: tier.motionComplexity,
      crowdingMode: tier.crowdingMode,
    };
  }

  return [
    // Bloc 1: Tracking (8 rounds) — N=2 tiers 0-3, N=3 tiers 0-3
    buildRound(2, 0, 'tracking', 'classic'),
    buildRound(2, 1, 'tracking', 'classic'),
    buildRound(2, 2, 'tracking', 'classic'),
    buildRound(2, 3, 'tracking', 'classic'),
    buildRound(3, 0, 'tracking', 'classic'),
    buildRound(3, 1, 'tracking', 'classic'),
    buildRound(3, 2, 'tracking', 'classic'),
    buildRound(3, 3, 'tracking', 'classic'),
    // Bloc 2: Audio (4 rounds) — at N=2, tiers 0-3
    buildRound(2, 0, 'audio', 'audio'),
    buildRound(2, 1, 'audio', 'audio'),
    buildRound(2, 2, 'audio', 'audio'),
    buildRound(2, 3, 'audio', 'audio'),
    // Bloc 3: Color (4 rounds) — at N=2, tiers 0-3
    buildRound(2, 0, 'color', 'color'),
    buildRound(2, 1, 'color', 'color'),
    buildRound(2, 2, 'color', 'color'),
    buildRound(2, 3, 'color', 'color'),
    // Bloc 4: Combined (4 rounds) — at N=2, tiers 0-3
    buildRound(2, 0, 'combined', 'audio-color'),
    buildRound(2, 1, 'combined', 'audio-color'),
    buildRound(2, 2, 'combined', 'audio-color'),
    buildRound(2, 3, 'combined', 'audio-color'),
  ];
}

function resolveTrackRoundConfig(
  plan: CalibrationRoundPlan,
  arenaWidthPx: number,
  arenaHeightPx: number,
): TrackSessionPlayConfig {
  const totalObjects =
    plan.totalObjectsMode === 'manual'
      ? plan.recommendedTotalObjects
      : arenaWidthPx >= 100 && arenaHeightPx >= 100
        ? resolvePlayableTotalObjects({
            targetCount: plan.targetCount,
            recommendedTotalObjects: plan.recommendedTotalObjects,
            crowdingMode: plan.crowdingMode,
            width: arenaWidthPx,
            height: arenaHeightPx,
          })
        : plan.recommendedTotalObjects;
  const speedPxPerSec =
    arenaWidthPx >= 100 && arenaHeightPx >= 100
      ? resolvePlayableSpeedPxPerSec({
          speedPxPerSec: plan.speedPxPerSec,
          targetCount: plan.targetCount,
          width: arenaWidthPx,
          height: arenaHeightPx,
        })
      : plan.speedPxPerSec;
  const crowdingThresholdPx =
    arenaWidthPx >= 100 && arenaHeightPx >= 100
      ? resolveCrowdingThresholdPx({
          targetCount: plan.targetCount,
          totalObjects,
          crowdingMode: plan.crowdingMode,
          complexity: plan.motionComplexity,
          width: arenaWidthPx,
          height: arenaHeightPx,
        })
      : BALL_DIAMETER * 1.6;

  return {
    totalObjects,
    targetCount: plan.targetCount,
    highlightDurationMs: plan.highlightDurationMs,
    trackingDurationMs: plan.trackingDurationMs,
    speedPxPerSec,
    motionComplexity: plan.motionComplexity,
    crowdingMode: plan.crowdingMode,
    crowdingThresholdPx,
    minSeparationPx: resolveMinSeparationPx(crowdingThresholdPx),
    arenaWidthPx,
    arenaHeightPx,
  };
}

function resolveTrackIdentityPreviewDurationMs(input: {
  trackingIdentityMode: TrackingIdentityMode;
  trackingLetterAudioEnabled: boolean;
  trackingTonesEnabled?: boolean;
  targetCount: number;
  highlightDurationMs: number;
  highlightSpacingMs?: number;
}): number {
  const {
    trackingIdentityMode,
    trackingLetterAudioEnabled,
    trackingTonesEnabled,
    targetCount,
    highlightDurationMs,
  } = input;

  const VISUAL_TRAVELER_MODES: ReadonlySet<string> = new Set([
    'position',
    'image',
    'spatial',
    'digits',
    'emotions',
    'words',
  ]);
  const hasVisualTraveler = VISUAL_TRAVELER_MODES.has(trackingIdentityMode);

  if (
    !trackingLetterAudioEnabled &&
    trackingIdentityMode !== 'letter' &&
    !trackingTonesEnabled &&
    !hasVisualTraveler
  )
    return highlightDurationMs;

  const defaultSpacingMs = hasVisualTraveler ? 1800 : TRACK_IDENTITY_LETTER_SPACING_MS;
  const spacingMs = input.highlightSpacingMs ?? defaultSpacingMs;
  // The tail must be long enough for the last target's full animation to complete.
  // Visual traveler modes need the full spacing duration; letter/audio only needs TAIL_MS.
  const tailMs = hasVisualTraveler ? spacingMs : TRACK_IDENTITY_LETTER_TAIL_MS;
  const minimumDurationMs = Math.max(0, targetCount - 1) * spacingMs + tailMs;

  return Math.max(highlightDurationMs, minimumDurationMs);
}

function applyTrackingIdentityFeatures(
  config: TrackSessionPlayConfig,
  options: {
    trackingIdentityMode: TrackingIdentityMode;
    trackingLetterAudioEnabled: boolean;
    trackingTonesEnabled?: boolean;
  },
): TrackSessionPlayConfig {
  const normalizedTrackingIdentityMode =
    options.trackingIdentityMode === 'color' ||
    options.trackingIdentityMode === 'position' ||
    options.trackingIdentityMode === 'image' ||
    options.trackingIdentityMode === 'spatial' ||
    options.trackingIdentityMode === 'digits' ||
    options.trackingIdentityMode === 'emotions' ||
    options.trackingIdentityMode === 'words'
      ? options.trackingIdentityMode
      : 'classic';
  const trackingLetterAudioEnabled =
    options.trackingLetterAudioEnabled || options.trackingIdentityMode === 'letter';

  return {
    ...config,
    highlightDurationMs: resolveTrackIdentityPreviewDurationMs({
      trackingIdentityMode: normalizedTrackingIdentityMode,
      trackingLetterAudioEnabled,
      trackingTonesEnabled: options.trackingTonesEnabled,
      targetCount: config.targetCount,
      highlightDurationMs: config.highlightDurationMs,
      highlightSpacingMs: config.highlightSpacingMs,
    }),
    trackingIdentityMode: normalizedTrackingIdentityMode,
    trackingLetterAudioEnabled,
    trackingTonesEnabled: options.trackingTonesEnabled === true,
  };
}

function countTrackFalseAlarms(input: {
  readonly targetIndices: readonly number[];
  readonly selectedIndices: readonly number[];
  readonly correctCount: number;
  readonly identityPromptColorIds?: readonly TrackIdentityColorId[];
  readonly identityPromptLetters?: readonly Sound[];
  readonly identityPromptTones?: readonly ToneValue[];
}): number {
  const hasIdentityPrompts =
    (input.identityPromptColorIds?.length ?? 0) > 0 ||
    (input.identityPromptLetters?.length ?? 0) > 0 ||
    (input.identityPromptTones?.length ?? 0) > 0;

  if (!hasIdentityPrompts) {
    return Math.max(0, input.selectedIndices.length - input.correctCount);
  }

  const targetSet = new Set(input.targetIndices);
  return input.selectedIndices.filter((index) => !targetSet.has(index)).length;
}

interface CalibrationEstimate {
  readonly startLevel: number;
  readonly startTierIndex: number;
  readonly preset: 'easy' | 'medium' | 'hard';
}

const ACCURACY_PASS = 0.72;

/**
 * Estimate the starting position from the 20-round calibration.
 *
 * The calibration plan has a fixed structure:
 *   Rounds 0-3:  Bloc tracking, N=2, tiers 0-3
 *   Rounds 4-7:  Bloc tracking, N=3, tiers 0-3
 *   Rounds 8-11: Bloc audio, N=2, tiers 0-3
 *   Rounds 12-15: Bloc color, N=2, tiers 0-3
 *   Rounds 16-19: Bloc combined, N=2, tiers 0-3
 *
 * Returns the N-level, starting tier, and preset.
 */
function estimateCalibrationResult(
  trialEvents: ReadonlyArray<{ totalTargets: number; accuracy: number }>,
  plan: readonly CalibrationRoundPlan[],
): CalibrationEstimate {
  // Tag each trial with its plan info
  const tagged = trialEvents.map((trial, i) => ({
    ...trial,
    plan: plan[i],
  }));

  // --- Bloc 1: Tracking — determine N-level and last passing tier ---
  const trackingTrials = tagged.filter((t) => t.plan?.bloc === 'tracking');

  // Find highest N-level where the player passes
  let estimatedLevel = 2;
  for (const targetCount of [2, 3] as const) {
    const trials = trackingTrials.filter((t) => t.totalTargets === targetCount);
    if (trials.length === 0) continue;
    const avgAcc = trials.reduce((sum, t) => sum + t.accuracy, 0) / trials.length;
    if (avgAcc >= ACCURACY_PASS) {
      estimatedLevel = targetCount;
    } else {
      break;
    }
  }

  // Find highest passing tier at the estimated level (tracking phase)
  const levelTrackingTrials = trackingTrials.filter((t) => t.totalTargets === estimatedLevel);
  let lastPassingTrackingTier = 0;
  for (const trial of levelTrackingTrials) {
    if (trial.accuracy >= ACCURACY_PASS && trial.plan) {
      lastPassingTrackingTier = Math.max(lastPassingTrackingTier, trial.plan.tierIndex);
    }
  }

  // --- Bloc 2: Audio — did the player manage audio binding? ---
  const audioTrials = tagged.filter((t) => t.plan?.bloc === 'audio');
  const audioAvg =
    audioTrials.length > 0
      ? audioTrials.reduce((sum, t) => sum + t.accuracy, 0) / audioTrials.length
      : 0;
  const audioPass = audioAvg >= ACCURACY_PASS;
  let lastPassingAudioTier = -1;
  if (audioPass) {
    for (const trial of audioTrials) {
      if (trial.accuracy >= ACCURACY_PASS && trial.plan) {
        lastPassingAudioTier = Math.max(lastPassingAudioTier, trial.plan.tierIndex);
      }
    }
  }

  // --- Bloc 3: Color — did the player manage color binding? ---
  const colorTrials = tagged.filter((t) => t.plan?.bloc === 'color');
  const colorAvg =
    colorTrials.length > 0
      ? colorTrials.reduce((sum, t) => sum + t.accuracy, 0) / colorTrials.length
      : 0;
  const colorPass = colorAvg >= ACCURACY_PASS;
  let lastPassingColorTier = -1;
  if (colorPass) {
    for (const trial of colorTrials) {
      if (trial.accuracy >= ACCURACY_PASS && trial.plan) {
        lastPassingColorTier = Math.max(lastPassingColorTier, trial.plan.tierIndex);
      }
    }
  }

  // --- Bloc 4: Combined — did the player manage audio+color? ---
  const combinedTrials = tagged.filter((t) => t.plan?.bloc === 'combined');
  const combinedAvg =
    combinedTrials.length > 0
      ? combinedTrials.reduce((sum, t) => sum + t.accuracy, 0) / combinedTrials.length
      : 0;
  const combinedPass = combinedAvg >= ACCURACY_PASS && audioPass && colorPass;
  let lastPassingCombinedTier = -1;
  if (combinedPass) {
    for (const trial of combinedTrials) {
      if (trial.accuracy >= ACCURACY_PASS && trial.plan) {
        lastPassingCombinedTier = Math.max(lastPassingCombinedTier, trial.plan.tierIndex);
      }
    }
  }

  // --- Derive preset from how far the player got ---
  let preset: 'easy' | 'medium' | 'hard';
  if (combinedPass) {
    preset = 'hard';
  } else if (audioPass && colorPass) {
    preset = 'medium';
  } else if (audioPass) {
    preset = 'easy';
  } else {
    preset = 'easy';
  }

  // --- Derive starting tier in the preset's grid ---
  // Each phase has 5 tiers (DUAL_TRACK_TIERS_PER_PHASE).
  // The calibration tested tiers 0-3, so max passing tier is 3.
  const TIERS_PER_PHASE = 5; // matches DUAL_TRACK_TIERS_PER_PHASE

  let startTierIndex: number;
  if (combinedPass) {
    // Place in combined phase (phase 3, offset 15)
    startTierIndex = 3 * TIERS_PER_PHASE + Math.min(lastPassingCombinedTier, TIERS_PER_PHASE - 1);
  } else if (colorPass) {
    // Place in color phase (phase 2, offset 10)
    startTierIndex = 2 * TIERS_PER_PHASE + Math.min(lastPassingColorTier, TIERS_PER_PHASE - 1);
  } else if (audioPass) {
    // Place in audio phase (phase 1, offset 5)
    startTierIndex = 1 * TIERS_PER_PHASE + Math.min(lastPassingAudioTier, TIERS_PER_PHASE - 1);
  } else {
    // Place in tracking phase (phase 0)
    startTierIndex = Math.min(lastPassingTrackingTier, TIERS_PER_PHASE - 1);
  }

  // Clamp to preset's tier count
  const tierCount = getDualTrackTierCount(preset);
  startTierIndex = Math.min(startTierIndex, tierCount - 1);

  return { startLevel: estimatedLevel, startTierIndex, preset };
}

function serializeMovingBalls(
  balls: readonly RuntimeMovingBallState[],
): SerializableMovingBallState[] {
  return balls.map(({ rng: _rng, ...ball }) => ball);
}

function pickTargets(count: number, total: number, rng: SeededRandom): Set<number> {
  const pool = Array.from({ length: total }, (_, i) => i);
  const out = new Set<number>();
  while (out.size < count && pool.length > 0) {
    const idx = rng.int(0, pool.length);
    out.add(pool[idx] as number);
    pool.splice(idx, 1);
  }
  return out;
}

function randomPositions(
  total: number,
  w: number,
  h: number,
  rng: SeededRandom,
): { x: number; y: number }[] {
  const positions: { x: number; y: number }[] = [];

  for (let i = 0; i < total; i++) {
    let candidate = {
      x: INSET + rng.next() * Math.max(0, w - 2 * INSET),
      y: INSET + rng.next() * Math.max(0, h - 2 * INSET),
    };

    for (let attempt = 0; attempt < MAX_POSITION_ATTEMPTS; attempt++) {
      const overlaps = positions.some(
        (pos) => Math.hypot(pos.x - candidate.x, pos.y - candidate.y) < MIN_BALL_GAP,
      );
      if (!overlaps) break;

      candidate = {
        x: INSET + rng.next() * Math.max(0, w - 2 * INSET),
        y: INSET + rng.next() * Math.max(0, h - 2 * INSET),
      };
    }

    positions.push(candidate);
  }

  return positions;
}

function reflectAxis(
  position: number,
  velocity: number,
  deltaSeconds: number,
  min: number,
  max: number,
): { position: number; velocity: number } {
  let next = position + velocity * deltaSeconds;
  let nextVelocity = velocity;

  while (next < min || next > max) {
    if (next < min) {
      next = min + (min - next);
      nextVelocity = Math.abs(nextVelocity);
      continue;
    }

    next = max - (next - max);
    nextVelocity = -Math.abs(nextVelocity);
  }

  return { position: next, velocity: nextVelocity };
}

function randomRange(min: number, max: number, rng: SeededRandom): number {
  return min + rng.next() * (max - min);
}

function getMotionProfile(complexity: MotionComplexity): MotionProfile {
  switch (complexity) {
    case 'smooth':
      return {
        minTurnIntervalMs: 1400,
        maxTurnIntervalMs: 2200,
        maxTurnRateRadPerSec: 0.45,
      };
    case 'agile':
      return {
        minTurnIntervalMs: 450,
        maxTurnIntervalMs: 900,
        maxTurnRateRadPerSec: 1.2,
      };
    default:
      return {
        minTurnIntervalMs: 800,
        maxTurnIntervalMs: 1500,
        maxTurnRateRadPerSec: 0.8,
      };
  }
}

function advanceBall(
  ball: RuntimeMovingBallState,
  deltaSeconds: number,
  width: number,
  height: number,
  bounds?: { minX: number; maxX: number; minY: number; maxY: number },
): RuntimeMovingBallState {
  let headingRad = ball.headingRad + ball.turnRateRadPerSec * deltaSeconds;
  let turnRateRadPerSec = ball.turnRateRadPerSec;
  let turnJitterTimerMs = ball.turnJitterTimerMs - deltaSeconds * 1000;

  while (turnJitterTimerMs <= 0) {
    turnRateRadPerSec = randomRange(
      -ball.maxTurnRateRadPerSec,
      ball.maxTurnRateRadPerSec,
      ball.rng,
    );
    turnJitterTimerMs += randomRange(ball.minTurnIntervalMs, ball.maxTurnIntervalMs, ball.rng);
  }

  const vx = Math.cos(headingRad) * ball.speedPxPerSec;
  const vy = Math.sin(headingRad) * ball.speedPxPerSec;
  const bMinX = bounds ? bounds.minX : INSET;
  const bMaxX = bounds ? bounds.maxX : width - INSET;
  const bMinY = bounds ? bounds.minY : INSET;
  const bMaxY = bounds ? bounds.maxY : height - INSET;
  const nextX = reflectAxis(ball.x, vx, deltaSeconds, bMinX, bMaxX);
  const nextY = reflectAxis(ball.y, vy, deltaSeconds, bMinY, bMaxY);
  headingRad = Math.atan2(nextY.velocity, nextX.velocity);

  return {
    x: nextX.position,
    y: nextY.position,
    speedPxPerSec: ball.speedPxPerSec,
    headingRad,
    turnRateRadPerSec,
    turnJitterTimerMs,
    minTurnIntervalMs: ball.minTurnIntervalMs,
    maxTurnIntervalMs: ball.maxTurnIntervalMs,
    maxTurnRateRadPerSec: ball.maxTurnRateRadPerSec,
    rngSeed: ball.rngSeed,
    rng: ball.rng,
  };
}

// --- Soft repulsion (steering avoidance) ---

/**
 * Zone within which balls start steering away from each other.
 * Expressed as a multiple of BALL_RADIUS — at 6× radius (~132px),
 * balls gently curve away. The force increases as they get closer.
 */
const REPULSION_RANGE = BALL_RADIUS * 6;

/**
 * Max heading deflection per second from repulsion (radians).
 * 1.5 rad/s ≈ 86°/s — strong enough to curve away but not jittery.
 */
const REPULSION_STRENGTH_RAD_PER_SEC = 1.5;

/**
 * Apply soft repulsion steering to all balls.
 * Each ball's heading is gently deflected away from nearby balls.
 * This runs BEFORE advanceBall so the heading change is applied
 * during the next position update.
 */
function applySoftRepulsion(balls: RuntimeMovingBallState[], deltaSeconds: number): void {
  for (let i = 0; i < balls.length; i++) {
    const self = balls[i];
    if (!self) continue;

    // Accumulate repulsion as a heading offset
    let steerAngle = 0;

    for (let j = 0; j < balls.length; j++) {
      if (i === j) continue;
      const other = balls[j];
      if (!other) continue;

      const dx = other.x - self.x;
      const dy = other.y - self.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist >= REPULSION_RANGE || dist < 0.001) continue;

      // How close are we? 1.0 = touching, 0.0 = at range limit
      const proximity = 1 - dist / REPULSION_RANGE;
      // Quadratic falloff — gentle at distance, strong when close
      const strength = proximity * proximity * REPULSION_STRENGTH_RAD_PER_SEC * deltaSeconds;

      // Angle FROM other TO self (away direction)
      const awayAngle = Math.atan2(-dy, -dx);
      // Signed delta between away direction and current heading
      let delta = awayAngle - self.headingRad;
      // Normalize to [-PI, PI]
      while (delta > Math.PI) delta -= 2 * Math.PI;
      while (delta < -Math.PI) delta += 2 * Math.PI;

      // Steer toward the "away" direction
      steerAngle += Math.sign(delta) * Math.min(Math.abs(delta), strength);
    }

    if (steerAngle !== 0) {
      balls[i] = { ...self, headingRad: self.headingRad + steerAngle };
    }
  }
}

// --- Ball-to-ball collision resolution ---

/**
 * Resolve elastic circle-circle collisions between all balls.
 * After individual advanceBall() calls, this pass ensures no two balls overlap.
 * Uses elastic collision: balls exchange velocity components along the collision axis.
 * O(n²) but n ≤ 10, so negligible.
 */
function resolveCollisions(balls: RuntimeMovingBallState[], radius: number): void {
  const minDist = radius * 2;
  const minDistSq = minDist * minDist;

  for (let i = 0; i < balls.length; i++) {
    for (let j = i + 1; j < balls.length; j++) {
      const a = balls[i];
      const b = balls[j];
      if (!a || !b) continue;

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distSq = dx * dx + dy * dy;

      if (distSq >= minDistSq || distSq < 0.0001) continue;

      const dist = Math.sqrt(distSq);
      // Normalize collision axis
      const nx = dx / dist;
      const ny = dy / dist;

      // Push balls apart (half overlap each)
      const overlap = minDist - dist;
      const pushX = nx * (overlap / 2);
      const pushY = ny * (overlap / 2);

      // Compute velocities from heading + speed
      const vax = Math.cos(a.headingRad) * a.speedPxPerSec;
      const vay = Math.sin(a.headingRad) * a.speedPxPerSec;
      const vbx = Math.cos(b.headingRad) * b.speedPxPerSec;
      const vby = Math.sin(b.headingRad) * b.speedPxPerSec;

      // Relative velocity along collision normal
      const dvn = (vax - vbx) * nx + (vay - vby) * ny;

      // Only resolve if balls are moving toward each other
      if (dvn <= 0) {
        // Still separate overlapping balls even if moving apart
        balls[i] = { ...a, x: a.x - pushX, y: a.y - pushY };
        balls[j] = { ...b, x: b.x + pushX, y: b.y + pushY };
        continue;
      }

      // Elastic collision (equal mass): exchange normal velocity components
      const newVax = vax - dvn * nx;
      const newVay = vay - dvn * ny;
      const newVbx = vbx + dvn * nx;
      const newVby = vby + dvn * ny;

      balls[i] = {
        ...a,
        x: a.x - pushX,
        y: a.y - pushY,
        headingRad: Math.atan2(newVay, newVax),
      };
      balls[j] = {
        ...b,
        x: b.x + pushX,
        y: b.y + pushY,
        headingRad: Math.atan2(newVby, newVbx),
      };
    }
  }
}

// --- 2.5D depth helpers ---

function getBallDepthRatio(y: number, arenaHeight: number): number {
  if (arenaHeight <= 0) return 0.5;
  return Math.max(0, Math.min(1, y / arenaHeight));
}

function applyBall3dLook(
  el: HTMLDivElement,
  y: number,
  arenaHeight: number,
  scaleSetter?: ((value: number) => void) | null,
): void {
  const depthRatio = getBallDepthRatio(y, arenaHeight);
  const shadowY = 4 + depthRatio * 10;
  const shadowBlur = 10 + depthRatio * 18;
  const shadowOpacity = 0.18 + depthRatio * 0.16;
  const rimOpacity = 0.14 + depthRatio * 0.12;
  const highlightOpacity = 0.16 + depthRatio * 0.2;
  const secondaryHighlightOpacity = 0.06 + depthRatio * 0.1;
  const brightness = 1 + depthRatio * 0.08;
  const saturate = 1 + depthRatio * 0.12;
  const scale = DEPTH_FAR_SCALE + (DEPTH_NEAR_SCALE - DEPTH_FAR_SCALE) * depthRatio;

  el.style.backgroundImage = [
    `radial-gradient(circle at 30% 28%, rgba(255,255,255,${highlightOpacity}) 0%, rgba(255,255,255,${highlightOpacity * 0.45}) 18%, transparent 54%)`,
    `radial-gradient(circle at 68% 72%, rgba(255,255,255,${secondaryHighlightOpacity}) 0%, transparent 56%)`,
  ].join(', ');
  el.style.filter = `brightness(${brightness.toFixed(3)}) saturate(${saturate.toFixed(3)})`;
  el.style.boxShadow = `0 ${shadowY.toFixed(1)}px ${shadowBlur.toFixed(1)}px rgba(15,23,42,${shadowOpacity.toFixed(3)}), inset 0 1px 0 rgba(255,255,255,${rimOpacity.toFixed(3)})`;
  if (scaleSetter) {
    scaleSetter(scale);
  } else {
    gsap.set(el, { scale });
  }
}

function clearBall3dLook(el: HTMLDivElement): void {
  el.style.boxShadow = '';
  el.style.backgroundImage = '';
  el.style.filter = '';
}

/** Update z-order and depth cues from Y position (lower = in front). */
function updateBallDepthPresentation(
  ballEls: (HTMLDivElement | null)[],
  movingBalls: { y: number }[],
  count: number,
  arenaHeight: number,
  scaleSetters?: readonly (((value: number) => void) | null)[],
): void {
  for (let i = 0; i < count; i++) {
    const el = ballEls[i];
    const ball = movingBalls[i];
    if (!el || !ball) continue;
    // Y ranges from 0 (top) to arenaHeight (bottom). Higher Y = closer = higher zIndex.
    el.style.zIndex = String(Math.round(ball.y));
    applyBall3dLook(el, ball.y, arenaHeight, scaleSetters?.[i]);
  }
}

function createMovingBalls(
  positions: { x: number; y: number }[],
  speedPxPerSec: number,
  complexity: MotionComplexity,
  trialSeed: string,
): RuntimeMovingBallState[] {
  const motionProfile = getMotionProfile(complexity);
  return positions.map((position) => {
    const rngSeed = `${trialSeed}:ball:${position.x.toFixed(3)}:${position.y.toFixed(3)}`;
    const rng = new SeededRandom(rngSeed);
    const headingRad = rng.next() * Math.PI * 2;
    const speed = speedPxPerSec * (0.85 + rng.next() * 0.3);

    return {
      x: position.x,
      y: position.y,
      speedPxPerSec: speed,
      headingRad,
      turnRateRadPerSec: randomRange(
        -motionProfile.maxTurnRateRadPerSec,
        motionProfile.maxTurnRateRadPerSec,
        rng,
      ),
      turnJitterTimerMs: randomRange(
        motionProfile.minTurnIntervalMs,
        motionProfile.maxTurnIntervalMs,
        rng,
      ),
      minTurnIntervalMs: motionProfile.minTurnIntervalMs,
      maxTurnIntervalMs: motionProfile.maxTurnIntervalMs,
      maxTurnRateRadPerSec: motionProfile.maxTurnRateRadPerSec,
      rngSeed,
      rng,
    };
  });
}

function resolvePlayableTotalObjects(input: {
  targetCount: number;
  recommendedTotalObjects: number;
  crowdingMode: CrowdingMode;
  width: number;
  height: number;
}): number {
  const { targetCount, recommendedTotalObjects, crowdingMode, width, height } = input;
  const minDimension = Math.min(width, height);
  const area = width * height;

  // Base: start from the recommended total (formula-derived)
  let adjustedTotal = recommendedTotalObjects;

  // Crowding mode offset
  if (crowdingMode === 'low') adjustedTotal -= 1;
  if (crowdingMode === 'dense') adjustedTotal += 1;

  // Scale by arena surface area:
  // - Small mobile (~360×640 = ~230k px²): reduce by 2-3
  // - Medium tablet (~600×900 = ~540k px²): reduce by 1
  // - Desktop (~800×600 = ~480k px²): no change
  // - Large desktop (≥820 min dim): increase
  if (area < 200_000) {
    adjustedTotal -= 3;
  } else if (area < 300_000) {
    adjustedTotal -= 2;
  } else if (minDimension < 420) {
    adjustedTotal -= 1;
  }

  // Large desktop displays need more objects to produce meaningful crowding.
  if (minDimension >= 820) adjustedTotal += 2;
  if (Math.max(width, height) >= 1300) adjustedTotal += 1;

  // Minimum: always at least targetCount + 2 distractors (never less than 4 total)
  return Math.max(targetCount + 2, Math.min(MAX_RENDERED_OBJECTS, adjustedTotal));
}

function resolvePlayableSpeedPxPerSec(input: {
  speedPxPerSec: number;
  targetCount: number;
  width: number;
  height: number;
}): number {
  const { speedPxPerSec, targetCount, width, height } = input;
  const minDimension = Math.min(width, height);
  let adjustedSpeed = speedPxPerSec;

  if (minDimension < 420 && targetCount >= 4) {
    adjustedSpeed *= 0.9;
  }
  if (minDimension < 360 && targetCount >= 5) {
    adjustedSpeed *= 0.88;
  }

  return Math.max(80, Math.round(adjustedSpeed));
}

function resolveCrowdingThresholdPx(input: {
  targetCount: number;
  totalObjects: number;
  crowdingMode: CrowdingMode;
  complexity: MotionComplexity;
  width: number;
  height: number;
}): number {
  const { targetCount, totalObjects, crowdingMode, complexity, width, height } = input;
  const minDimension = Math.min(width, height);
  const complexityBase =
    complexity === 'smooth'
      ? BALL_DIAMETER * 2.1
      : complexity === 'agile'
        ? BALL_DIAMETER * 1.45
        : BALL_DIAMETER * 1.75;
  const crowdingBias =
    crowdingMode === 'low'
      ? BALL_DIAMETER * 0.35
      : crowdingMode === 'dense'
        ? -BALL_DIAMETER * 0.2
        : 0;
  const densityPenalty = Math.max(0, totalObjects - (targetCount + 3)) * 1.5;
  const mobilePenalty = minDimension < 420 ? 6 : 0;
  return Math.max(
    BALL_DIAMETER * 1.25,
    complexityBase + crowdingBias - densityPenalty - mobilePenalty,
  );
}

function resolveMinSeparationPx(crowdingThresholdPx: number): number {
  return Math.max(BALL_DIAMETER * 1.05, crowdingThresholdPx * 0.72);
}

function clampToArena(value: number, max: number): number {
  return Math.max(INSET, Math.min(max - INSET, value));
}

function resolveFinalSelectionPositions(
  positions: readonly { x: number; y: number }[],
  width: number,
  height: number,
  minSeparationPx: number,
): { positions: { x: number; y: number }[]; adjusted: boolean } {
  const resolved = positions.map((position) => ({ ...position }));
  let adjusted = false;

  for (let pass = 0; pass < 6; pass++) {
    let passAdjusted = false;

    for (let i = 0; i < resolved.length; i++) {
      for (let j = i + 1; j < resolved.length; j++) {
        const first = resolved[i];
        const second = resolved[j];
        if (!first || !second) continue;

        let dx = second.x - first.x;
        let dy = second.y - first.y;
        let distance = Math.hypot(dx, dy);

        if (distance >= minSeparationPx) continue;

        if (distance < 0.001) {
          const angle = ((i + 1) * (j + 3) * Math.PI) / 7;
          dx = Math.cos(angle);
          dy = Math.sin(angle);
          distance = 1;
        }

        const nx = dx / distance;
        const ny = dy / distance;
        const correction = (minSeparationPx - distance) / 2;

        first.x = clampToArena(first.x - nx * correction, width);
        first.y = clampToArena(first.y - ny * correction, height);
        second.x = clampToArena(second.x + nx * correction, width);
        second.y = clampToArena(second.y + ny * correction, height);

        adjusted = true;
        passAdjusted = true;
      }
    }

    if (!passAdjusted) break;
  }

  return { positions: resolved, adjusted };
}

function observeCrowdingMetrics(
  balls: MovingBallState[],
  metrics: TrackRoundRuntimeMetrics,
  config: TrackSessionPlayConfig,
): void {
  for (let i = 0; i < balls.length; i++) {
    for (let j = i + 1; j < balls.length; j++) {
      const first = balls[i];
      const second = balls[j];
      if (!first || !second) continue;

      const dx = second.x - first.x;
      const dy = second.y - first.y;
      const distance = Math.hypot(dx, dy);
      const pairKey = `${i}:${j}`;

      if (distance <= config.crowdingThresholdPx) {
        if (!metrics.activeCrowdingPairs.has(pairKey)) {
          metrics.activeCrowdingPairs.add(pairKey);
          metrics.crowdingEvents += 1;
        }
      } else {
        metrics.activeCrowdingPairs.delete(pairKey);
      }

      metrics.minInterObjectDistancePx = Math.min(metrics.minInterObjectDistancePx, distance);
    }
  }
}

// =============================================================================
// Main Page
// =============================================================================

export {
  ACCURACY_PASS,
  BALL_DIAMETER,
  BALL_IDS,
  BALL_RADIUS,
  COUNTDOWN_SECONDS,
  DEFAULT_TARGET_COUNT,
  DEFAULT_TOTAL_OBJECTS,
  DEFAULT_TOTAL_ROUNDS,
  DEPTH_FAR_SCALE,
  DEPTH_NEAR_SCALE,
  DUAL_TRACK_PATH_STORAGE_KEY,
  DUAL_TRACK_TIERS_PER_PHASE,
  FEEDBACK_MS,
  FINAL_SELECTION_MIN_SEPARATION_PX,
  FINAL_SELECTION_SETTLE_MS,
  FLOATING_CONTROL_PADDING,
  HIGHLIGHT_MS,
  MAX_RENDERED_OBJECTS,
  TRACK_IDENTITY_LETTER_SPACING_MS,
  TRACK_IDENTITY_LETTER_TAIL_MS,
  TRACKING_MS,
  TRACKING_SPEED_PX_PER_SEC,
  advanceBall,
  applySoftRepulsion,
  resolveCollisions,
  applyBall3dLook,
  applyTrackingIdentityFeatures,
  buildAdaptivePathSnapshot,
  buildAdaptivePathSnapshotFromEvaluation,
  clampToArena,
  clearBall3dLook,
  countTrackFalseAlarms,
  createAdaptiveSessionPlan,
  createDualTrackCalibrationPlan,
  createEmptyTrackFeedbackState,
  createEnvelope,
  createMovingBalls,
  estimateCalibrationResult,
  getDeviceInfo,
  getMotionProfile,
  getSelectionPromptOrder,
  getSequentialTrackHighlightColor,
  getTemporalContext,
  getTrackIdentityColor,
  getTrackIdentityPromptColors,
  setTrackColorTheme,
  getTrackIdentityPromptLetters,
  getTrackIdentityPromptPositions,
  getTrackIdentityPromptShapes,
  getTrackIdentityPromptDirections,
  getTrackIdentityPromptDigits,
  getTrackIdentityPromptEmotions,
  getTrackIdentityPromptWords,
  getTrackIdentityPromptTones,
  isWebglSupported,
  materializeMotEvent,
  observeCrowdingMetrics,
  persistEvent,
  pickTargets,
  randomPositions,
  randomRange,
  reflectAxis,
  resolveCrowdingThresholdPx,
  resolveFinalSelectionPositions,
  resolveMinSeparationPx,
  resolvePlayableSpeedPxPerSec,
  resolvePlayableTotalObjects,
  resolveTrackIdentityPreviewDurationMs,
  resolveTrackRoundConfig,
  serializeMovingBalls,
  updateBallDepthPresentation,
};

export type {
  AdaptivePathSnapshot,
  CalibrationBloc,
  CalibrationIdentityMode,
  CalibrationRoundPlan,
  CrowdingMode,
  DepthMode,
  EventEmitter,
  ImageShape,
  JourneyRouterState,
  MotionComplexity,
  MotEventDraft,
  MovingBallState,
  Phase,
  RoundResult,
  RuntimeMovingBallState,
  SelectionControlDragState,
  SelectionControlId,
  SelectionControlOffset,
  SerializableMovingBallState,
  SessionPlayContext,
  TrackFeedbackState,
  TrackIdentityColor,
  TrackIdentityColorId,
  TrackIdentityVisualColorId,
  TrackRenderMode,
  TrackRoundRuntimeMetrics,
  TrackSessionPlayConfig,
  TrackSessionRuntime,
  TrackingIdentityMode,
};
