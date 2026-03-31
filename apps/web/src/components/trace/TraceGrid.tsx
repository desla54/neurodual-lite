/**
 * TraceGrid - Interactive 3x3 grid for Dual Trace mode
 *
 * Handles swipe and double-tap gestures for N-back position responses.
 * Features GSAP-powered animations using the INK visual style.
 */

import {
  cn,
  CanvasWeave,
  CircularSelector,
  DrawingCanvas,
  Grid,
  StringArtPlus,
  canvasStrokesToPoints,
  type Stroke,
  type CircularSelectorItem,
  useOptionalDigitRecognizerLoader,
  useOptionalHandwritingRecognizerLoader,
  type DigitRecognizer,
  type HandwritingRecognizer,
  wovenCssVar,
  useMountEffect,
} from '@neurodual/ui';
import {
  getLastMeasuredLag,
  type Sound,
  type Color,
  type ImageShape,
  COLORS,
  COLOR_VALUES,
  IMAGE_MODALITY_SHAPES,
  EMOTION_VALUES,
  WORD_VALUES,
  TONE_VALUES,
  SPATIAL_DIRECTIONS,
  type TraceWritingResult,
  type TraceArithmeticProblem,
} from '@neurodual/logic';
import { useAppPorts } from '../../providers';
import { Eraser, Keyboard } from '@phosphor-icons/react';
import gsap from 'gsap';
import type { ReactNode } from 'react';
import { memo, useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '../../stores/settings-store';
import { useHaptic } from '../../hooks/use-haptic';
import { TraceStimulusShape, TraceStimulusValueDisplay } from './trace-stimulus-display';

function cssVarHsl(varName: string, fallback: string, alpha?: number): string {
  if (typeof document === 'undefined') return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  if (!raw) return fallback;
  if (alpha === undefined) return `hsl(${raw})`;
  return `hsl(${raw} / ${alpha})`;
}

function validateActionDuration(
  durationMs: number,
  targetMs: number,
  toleranceMs: number,
): boolean {
  const safeDuration = Math.max(0, durationMs);
  const safeTarget = Math.max(0, targetMs);
  const safeTolerance = Math.max(0, toleranceMs);
  const minMs = Math.max(0, safeTarget - safeTolerance);
  const maxMs = safeTarget + safeTolerance;
  return safeDuration >= minMs && safeDuration <= maxMs;
}

// =============================================================================
// Types
// =============================================================================

export interface TraceGridProps {
  /** Currently active position (0-7, excluding center) */
  activePosition: number | null;
  /** Whether to show the stimulus indicator */
  showStimulus: boolean;
  /** Color of the stimulus (for color modality) */
  stimulusColor?: Color | null;
  /** Optional text displayed inside the active cell during stimulus */
  activeStimulusText?: string | null;
  /** Optional shape displayed inside the active cell during stimulus */
  activeStimulusShape?: ImageShape | null;
  /** Position showing feedback */
  feedbackPosition: number | null;
  /** Type of feedback being shown */
  feedbackType: 'correct' | 'incorrect' | null;
  /** Whether feedback was triggered by user action (vs timeout) */
  feedbackFromUserAction: boolean;
  /** Whether interactions are disabled */
  disabled: boolean;
  /** Called when user swipes from one position to another */
  onSwipe: (
    from: number,
    to: number,
    inputMethod: 'mouse' | 'touch',
    capturedAtMs: number,
    actionDurationMs?: number,
  ) => void;
  /** Called when user double-taps a position */
  onDoubleTap: (position: number, inputMethod: 'mouse' | 'touch', capturedAtMs: number) => void;
  /** Called when user press-and-holds for a position match */
  onHold?: (
    position: number,
    inputMethod: 'mouse' | 'touch',
    capturedAtMs: number,
    actionDurationMs: number,
  ) => void;
  /** Called when user double-taps the center (reject position response) */
  onCenterDoubleTap?: (inputMethod: 'mouse' | 'touch', capturedAtMs: number) => void;
  /** Whether in writing phase (center cell becomes writing zone) */
  isWriting?: boolean;
  /** Whether to show writing feedback (grid hidden, only badge visible) */
  showWritingFeedback?: boolean;
  /** Expected letter for writing recognition */
  expectedSound?: Sound | null;
  /** Whether color modality is enabled */
  colorEnabled?: boolean;
  /** Expected N-back color for writing (color modality) */
  expectedColor?: Color | null;
  /** Whether image modality is enabled */
  imageEnabled?: boolean;
  /** Expected shape for writing (image modality) */
  expectedImage?: string | null;
  /** Whether digits modality is enabled */
  digitsEnabled?: boolean;
  /** Expected digit for writing (digits modality) */
  expectedDigit?: string | null;
  /** Whether emotions modality is enabled */
  emotionsEnabled?: boolean;
  /** Expected emotion for writing (emotions modality) */
  expectedEmotion?: string | null;
  /** Whether words modality is enabled */
  wordsEnabled?: boolean;
  /** Expected word for writing (words modality) */
  expectedWord?: string | null;
  /** Whether tones modality is enabled */
  tonesEnabled?: boolean;
  /** Expected tone for writing (tones modality) */
  expectedTone?: string | null;
  /** Whether spatial modality is enabled */
  spatialEnabled?: boolean;
  /** Expected direction for writing (spatial modality) */
  expectedSpatialDirection?: string | null;
  /** Called when writing is submitted */
  onWritingSubmit?: (result: TraceWritingResult) => void;
  /** Last writing result for border flash feedback */
  writingResult?: TraceWritingResult | null;
  /** Swipe feedback: from position (shows "1") */
  swipeFeedbackFrom?: number | null;
  /** Swipe feedback: to position (shows "2") */
  swipeFeedbackTo?: number | null;
  /** Whether from position was correct */
  swipeFeedbackFromCorrect?: boolean;
  /** Whether to position was correct */
  swipeFeedbackToCorrect?: boolean;
  /** Whether in arithmetic phase (handwriting digit input) */
  isArithmetic?: boolean;
  /** Expected answer for arithmetic validation */
  expectedAnswer?: number;
  /** Current arithmetic problem (for advanced interference display) */
  arithmeticProblem?: TraceArithmeticProblem | null;
  /** Called when arithmetic answer is submitted */
  onArithmeticSubmit?: (userAnswer: number, confidence: number, writingTimeMs: number) => void;
  /** Called when user asks for a new arithmetic (captcha-like) */
  onArithmeticRefresh?: () => void;
  /** Grid visual style: 'trace' (rounded cells) or 'classic' (square cells with borders) */
  gridStyle?: 'trace' | 'classic';
  /** Grid layout mode: '3x3' | '3x4' | '4x3' | '4x4' */
  gridMode?: '3x3' | '3x4' | '4x3' | '4x4';
  /** Whether session is paused (shows blur overlay with resume button) */
  paused?: boolean;
  /** Called when resume button is clicked in pause overlay */
  onResume?: () => void;
  /** Additional class name */
  className?: string;

  // Visual settings (from settings store)
  /** Visual stimulus style: 'full' | 'dots' | 'stringart' | 'custom' */
  visualStimulusStyle?: 'full' | 'dots' | 'stringart' | 'custom';
  /** Visual stimulus color (from settings, e.g., 'blue', 'red') */
  visualStimulusColor?: string;
  /** Custom image URL for stimulus (base64 data URL) */
  customImageUrl?: string;
  /** String Art: number of points per branch */
  stringArtPoints?: number;
  /** Sequential mode: cells visited by intermediate swipes (shown greyed during response) */
  visitedCells?: readonly number[];
  /** Sequential mode: per-step results for multi-cell feedback during positionFeedback */
  sequentialStepResults?: ReadonlyArray<{
    readonly fromPosition: number;
    readonly toPosition: number;
    readonly expectedFromPosition: number;
    readonly expectedToPosition: number;
    readonly expectedFromGesture: number;
    readonly expectedToGesture: number;
    readonly fromCorrect: boolean;
    readonly toCorrect: boolean;
    readonly isCorrect: boolean;
  }>;
  /** Sequential writing step index — triggers canvas clear between steps */
  writingStepIndex?: number;
  /** Whether mindful timing mode is active */
  mindfulTimingEnabled?: boolean;
  /** Whether the current trial expects a mindful hold instead of a double tap */
  mindfulHoldEnabled?: boolean;
  /** Target duration for mindful position actions (ms) */
  mindfulPositionDurationMs?: number;
  /** Tolerance for mindful position actions (ms) */
  mindfulPositionToleranceMs?: number;
  /** Target duration for mindful writing actions (ms) */
  mindfulWritingDurationMs?: number;
  /** Tolerance for mindful writing actions (ms) */
  mindfulWritingToleranceMs?: number;
  /** Called when local position timing feedback changes */
  onPositionTimingFeedbackChange?: (
    feedback: {
      readonly label: string;
      readonly durationMs: number;
      readonly accepted: boolean;
    } | null,
  ) => void;
  /** Called when local writing timing feedback changes */
  onWritingTimingFeedbackChange?: (
    feedback: {
      readonly label: string;
      readonly durationMs: number;
      readonly accepted: boolean;
    } | null,
  ) => void;
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Grid positions: 0-7 (excluding center)
 * Layout: [0,1,2] [3,_,4] [5,6,7]
 * null represents the center position (no interaction)
 */
const GRID_MAP = [0, 1, 2, 3, null, 4, 5, 6, 7] as const;

/** Grid positions for 3x4 layout: 12 positions (3 rows × 4 cols) */
const GRID_MAP_3x4 = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;

/** Grid positions for 4x3 layout: 12 positions (4 rows × 3 cols) */
const GRID_MAP_4x3 = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;

/** Grid positions for 4x4 layout: 16 positions (4 rows × 4 cols) */
const GRID_MAP_4x4 = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] as const;

/** Double-tap detection threshold in milliseconds */
const DOUBLE_TAP_THRESHOLD_MS = 400;
/** Max sampled points while dragging (kept low for stable FPS on mobile browsers) */
const TRAIL_MAX_POINTS = 20;
/** Number of tiny ink droplets emitted on swipe completion */
const SWIPE_SPARK_COUNT = 1;
type SwipeFxMode = 'full' | 'lite' | 'minimal';
type TrailPoint = { x: number; y: number };
type WritingChoiceStatus = 'correct' | 'incorrect';
type WritingChoiceFeedback = {
  readonly key: string;
  readonly label: string;
  readonly status: WritingChoiceStatus;
};
type WritingDraftValues = {
  readonly recognizedLetter?: string | null;
  readonly recognizedDigit?: string | null;
  readonly recognizedWord?: string | null;
  readonly recognizedTone?: string | null;
  readonly recognizedDirection?: string | null;
  readonly selectedColor?: Color | null;
  readonly selectedImage?: string | null;
  readonly selectedEmotion?: string | null;
};

type EffectiveWritingInputMethod = 'keyboard' | 'handwriting';

function downsampleStrokePoints<
  T extends { readonly x: number; readonly y: number; readonly strokeId: number },
>(points: readonly T[], maxPoints: number): readonly T[] {
  if (points.length <= maxPoints) return points;
  const stride = Math.ceil(points.length / maxPoints);
  const sampled: T[] = [];
  for (let i = 0; i < points.length; i += stride) {
    const p = points[i];
    if (p) sampled.push(p);
  }
  const last = points[points.length - 1];
  if (last && sampled[sampled.length - 1] !== last) sampled.push(last);
  return sampled;
}

function buildTrailPath(points: TrailPoint[]): string {
  if (points.length < 2) return '';
  const first = points[0];
  if (!first) return '';
  let d = `M ${first.x} ${first.y}`;

  if (points.length === 2) {
    const second = points[1];
    if (second) {
      d += ` L ${second.x} ${second.y}`;
    }
    return d;
  }

  for (let i = 1; i < points.length - 1; i++) {
    const point = points[i];
    const next = points[i + 1];
    if (!point || !next) continue;
    const midX = (point.x + next.x) / 2;
    const midY = (point.y + next.y) / 2;
    d += ` Q ${point.x} ${point.y} ${midX} ${midY}`;
  }

  const last = points[points.length - 1];
  if (last) {
    d += ` L ${last.x} ${last.y}`;
  }
  return d;
}

/** Visual settings color to hex mapping (for trace style cells) */
const VISUAL_COLOR_HEX: Record<string, string> = {
  black: '#111827',
  // Keep aligned with the overridden Tailwind palette in `apps/web/tailwind.config.ts`.
  gray: '#787570', // slate-500 (warm gray override)
  red: '#ef4444',
  blue: '#6B7880', // blue-500 (warm slate-blue override)
  green: '#22c55e',
  yellow: '#eab308',
  purple: '#a855f7',
  orange: '#A68568', // orange-500 (warm terracotta override)
  cyan: '#688580', // cyan-500 (warm teal-gray override)
  magenta: '#d946ef',
};

/** Background color classes for dots pattern */
const DOT_COLOR_CLASSES: Record<string, string> = {
  // Use foreground for black: dark in light mode, light in dark mode (for visibility)
  black: 'bg-foreground',
  gray: 'bg-slate-500',
  red: 'bg-red-500',
  blue: 'bg-blue-500',
  green: 'bg-green-500',
  yellow: 'bg-yellow-500',
  purple: 'bg-purple-500',
  orange: 'bg-orange-500',
  cyan: 'bg-cyan-500',
  magenta: 'bg-fuchsia-500',
};

/** Text color classes for StringArt */
const TEXT_COLOR_CLASSES: Record<string, string> = {
  // Use foreground for black: dark in light mode, light in dark mode (for visibility)
  black: 'text-foreground',
  gray: 'text-slate-500',
  red: 'text-red-500',
  blue: 'text-blue-500',
  green: 'text-green-500',
  yellow: 'text-yellow-500',
  purple: 'text-purple-500',
  orange: 'text-orange-500',
  cyan: 'text-cyan-500',
  magenta: 'text-fuchsia-500',
};

/** Nine dots pattern for 'dots' stimulus style */
function NineDotsPattern({ color }: { color?: string }): ReactNode {
  const dotColorClass = (color && DOT_COLOR_CLASSES[color]) || 'bg-woven-cell-active';

  return (
    <div className="absolute inset-0 grid grid-cols-3 gap-1 p-2">
      {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((dotIdx) => (
        <div key={`dot-${dotIdx}`} className="flex items-center justify-center">
          <div
            className={cn('rounded-full', dotColorClass)}
            style={{
              width: '50%',
              height: '50%',
              aspectRatio: '1',
            }}
          />
        </div>
      ))}
    </div>
  );
}

const SHAPE_LABELS: Record<ImageShape, string> = {
  circle: 'Circle',
  square: 'Square',
  triangle: 'Triangle',
  diamond: 'Diamond',
  pentagon: 'Pentagon',
  hexagon: 'Hexagon',
  star: 'Star',
  cross: 'Cross',
};

const EMOTION_LABELS: Record<string, string> = {
  joy: 'Joy',
  sadness: 'Sadness',
  anger: 'Anger',
  fear: 'Fear',
  disgust: 'Disgust',
  surprise: 'Surprise',
  contempt: 'Contempt',
  neutral: 'Neutral',
};

const WORD_LABELS: Record<string, string> = {
  'word-hand': 'Hand',
  'word-cat': 'Cat',
  'word-moon': 'Moon',
  'word-fire': 'Fire',
  'word-water': 'Water',
  'word-king': 'King',
  'word-key': 'Key',
  'word-wind': 'Wind',
};

const COLOR_SELECTOR_ITEMS: readonly CircularSelectorItem[] = COLORS.map((color) => ({
  id: color,
  label: color,
  color: COLOR_VALUES[color],
}));

const SHAPE_SELECTOR_ITEMS: readonly CircularSelectorItem[] = IMAGE_MODALITY_SHAPES.map(
  (shape) => ({
    id: shape,
    label: SHAPE_LABELS[shape],
  }),
);

const EMOTION_SELECTOR_ITEMS: readonly CircularSelectorItem[] = EMOTION_VALUES.map((emotion) => ({
  id: emotion,
  label: EMOTION_LABELS[emotion] ?? emotion,
}));

const WORD_SELECTOR_ITEMS: readonly CircularSelectorItem[] = WORD_VALUES.map((word) => ({
  id: word,
  label: WORD_LABELS[word] ?? word,
}));

const TONE_SELECTOR_ITEMS: readonly CircularSelectorItem[] = TONE_VALUES.map((tone) => ({
  id: tone,
  label: tone,
}));

const SPATIAL_SELECTOR_ITEMS: readonly CircularSelectorItem[] = SPATIAL_DIRECTIONS.map(
  (direction) => ({
    id: direction,
    label: direction.replace(/-/g, ' '),
  }),
);

function getSelectorValueClass(size: number): string {
  if (size >= 68) {
    return 'flex h-12 w-12 items-center justify-center text-4xl leading-none';
  }
  if (size >= 56) {
    return 'flex h-10 w-10 items-center justify-center text-3xl leading-none';
  }
  return 'flex h-8 w-8 items-center justify-center text-2xl leading-none';
}

function getSelectorShapeClass(size: number): string {
  if (size >= 68) {
    return 'h-12 w-12';
  }
  if (size >= 56) {
    return 'h-10 w-10';
  }
  return 'h-8 w-8';
}

function computeExpectedMatch<T extends string>(
  expected: T | null | undefined,
  actual: T | null | undefined,
): boolean | null {
  if (expected == null) {
    return actual == null ? null : false;
  }
  return actual === expected;
}

function isExpectedSatisfied<T extends string>(
  expected: T | null | undefined,
  actual: T | null | undefined,
): boolean {
  return expected == null ? actual == null : actual === expected;
}

function buildTraceWritingResult({
  expectedSound,
  expectedColor,
  expectedImage,
  expectedDigit,
  expectedEmotion,
  expectedWord,
  expectedTone,
  expectedSpatialDirection,
  confidence,
  writingTimeMs,
  timedOut,
  recognizedLetter = null,
  recognizedDigit = null,
  recognizedWord = null,
  recognizedTone = null,
  recognizedDirection = null,
  selectedColor = null,
  selectedImage = null,
  selectedEmotion = null,
}: {
  readonly expectedSound: Sound | null;
  readonly expectedColor: Color | null;
  readonly expectedImage: string | null;
  readonly expectedDigit: string | null;
  readonly expectedEmotion: string | null;
  readonly expectedWord: string | null;
  readonly expectedTone: string | null;
  readonly expectedSpatialDirection: string | null;
  readonly confidence: number;
  readonly writingTimeMs: number;
  readonly timedOut: boolean;
} & WritingDraftValues): TraceWritingResult {
  // DEBUG: trace expected vs actual for all modalities
  console.log(
    `[TraceGrid] WRITING RESULT` +
      ` | emotion: expected=${expectedEmotion} actual=${selectedEmotion} match=${expectedEmotion === selectedEmotion}` +
      ` | word: expected=${expectedWord} actual=${recognizedWord}` +
      ` | tone: expected=${expectedTone} actual=${recognizedTone}` +
      ` | spatial: expected=${expectedSpatialDirection} actual=${recognizedDirection}` +
      ` | sound: expected=${expectedSound} actual=${recognizedLetter}`,
  );
  const colorCorrect = computeExpectedMatch(expectedColor, selectedColor);
  const imageCorrect = computeExpectedMatch(expectedImage, selectedImage);
  const digitCorrect = computeExpectedMatch(expectedDigit, recognizedDigit);
  const emotionCorrect = computeExpectedMatch(expectedEmotion, selectedEmotion);
  const wordCorrect = computeExpectedMatch(expectedWord, recognizedWord);
  const toneCorrect = computeExpectedMatch(expectedTone, recognizedTone);
  const directionCorrect = computeExpectedMatch(expectedSpatialDirection, recognizedDirection);

  return {
    recognizedLetter,
    expectedLetter: expectedSound,
    isCorrect:
      isExpectedSatisfied(expectedSound, recognizedLetter) &&
      isExpectedSatisfied(expectedColor, selectedColor) &&
      isExpectedSatisfied(expectedImage, selectedImage) &&
      isExpectedSatisfied(expectedDigit, recognizedDigit) &&
      isExpectedSatisfied(expectedEmotion, selectedEmotion) &&
      isExpectedSatisfied(expectedWord, recognizedWord) &&
      isExpectedSatisfied(expectedTone, recognizedTone) &&
      isExpectedSatisfied(expectedSpatialDirection, recognizedDirection),
    confidence,
    writingTimeMs,
    timedOut,
    selectedColor,
    expectedColor,
    colorCorrect,
    selectedImage,
    expectedImage,
    imageCorrect,
    recognizedDigit,
    expectedDigit,
    digitCorrect,
    selectedEmotion,
    expectedEmotion,
    emotionCorrect,
    recognizedWord,
    expectedWord,
    wordCorrect,
    recognizedTone,
    expectedTone,
    toneCorrect,
    recognizedDirection,
    expectedDirection: expectedSpatialDirection,
    directionCorrect,
  };
}

// =============================================================================
// Component
// =============================================================================

export const TraceGrid = memo(function TraceGrid({
  activePosition,
  showStimulus,
  stimulusColor = null,
  activeStimulusText = null,
  activeStimulusShape = null,
  feedbackPosition,
  feedbackType,
  feedbackFromUserAction,
  disabled,
  onSwipe,
  onDoubleTap,
  onHold,
  onCenterDoubleTap,
  isWriting = false,
  showWritingFeedback = false,
  expectedSound = null,
  colorEnabled = false,
  expectedColor = null,
  imageEnabled = false,
  expectedImage = null,
  digitsEnabled = false,
  expectedDigit = null,
  emotionsEnabled = false,
  expectedEmotion = null,
  wordsEnabled = false,
  expectedWord = null,
  tonesEnabled = false,
  expectedTone = null,
  spatialEnabled = false,
  expectedSpatialDirection = null,
  onWritingSubmit,
  writingResult = null,
  swipeFeedbackFrom = null,
  swipeFeedbackTo = null,
  swipeFeedbackFromCorrect = true,
  swipeFeedbackToCorrect = true,
  isArithmetic = false,
  expectedAnswer,
  arithmeticProblem = null,
  onArithmeticSubmit,
  onArithmeticRefresh,
  gridStyle = 'trace',
  gridMode = '3x3',
  paused = false,
  onResume,
  className,
  // Visual settings
  visualStimulusStyle,
  visualStimulusColor,
  customImageUrl,
  stringArtPoints,
  visitedCells,
  sequentialStepResults,
  writingStepIndex = 0,
  mindfulTimingEnabled = false,
  mindfulHoldEnabled = false,
  mindfulPositionDurationMs = 3000,
  mindfulPositionToleranceMs = 200,
  mindfulWritingDurationMs = 2000,
  mindfulWritingToleranceMs = 200,
  onPositionTimingFeedbackChange,
  onWritingTimingFeedbackChange,
}: TraceGridProps): ReactNode {
  const { diagnostics } = useAppPorts();
  const { t } = useTranslation();
  const haptic = useHaptic();
  const traceWritingInputMethod = useSettingsStore((s) => s.ui.traceWritingInputMethod);
  const [prefersHandwritingOnThisDevice, setPrefersHandwritingOnThisDevice] = useState(false);

  // Heuristic for "auto" input method: handwriting on mobile/coarse pointers, keyboard on desktop.
  useMountEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

    const mqCoarse = window.matchMedia('(pointer: coarse)');
    const mqSmall = window.matchMedia('(max-width: 767px)');
    const compute = () => setPrefersHandwritingOnThisDevice(mqCoarse.matches || mqSmall.matches);
    compute();

    if (typeof mqCoarse.addEventListener === 'function') {
      mqCoarse.addEventListener('change', compute);
      mqSmall.addEventListener('change', compute);
      return () => {
        mqCoarse.removeEventListener('change', compute);
        mqSmall.removeEventListener('change', compute);
      };
    }

    mqCoarse.addListener(compute);
    mqSmall.addListener(compute);
    return () => {
      mqCoarse.removeListener(compute);
      mqSmall.removeListener(compute);
    };
  });

  const effectiveWritingInputMethod: EffectiveWritingInputMethod = useMemo(() => {
    if (traceWritingInputMethod === 'keyboard') return 'keyboard';
    if (traceWritingInputMethod === 'handwriting') return 'handwriting';
    return prefersHandwritingOnThisDevice ? 'handwriting' : 'keyboard';
  }, [traceWritingInputMethod, prefersHandwritingOnThisDevice]);

  // Temporary runtime fallback (e.g. when handwriting model isn't available or is too uncertain)
  const [forcedWritingInputMethod, setForcedWritingInputMethod] =
    useState<EffectiveWritingInputMethod | null>(null);
  const [forcedArithmeticInputMethod, setForcedArithmeticInputMethod] =
    useState<EffectiveWritingInputMethod | null>(null);

  // Step-based writing flow: each modality input fills the zone, one at a time
  const [modalityStepIdx, setWritingStepIdx] = useState(0);

  const hasAudioTarget = expectedSound !== null;
  const hasDigitTarget = digitsEnabled && expectedDigit !== null;

  // Step-based writing: ordered list of modality inputs, each takes full zone one at a time
  const writingSteps = useMemo(() => {
    // Only add a step when the modality is enabled AND there is an expected value to recall.
    // Without the expected check, warmup trials or dynamic-rules trials where the N-back trial
    // didn't have this modality would show a step with no correct answer (always marked wrong).
    const steps: string[] = [];
    if (expectedSound !== null) steps.push('audio');
    if (digitsEnabled && expectedDigit !== null) steps.push('digits');
    if (colorEnabled && expectedColor !== null) steps.push('color');
    if (imageEnabled && expectedImage !== null) steps.push('image');
    if (emotionsEnabled && expectedEmotion !== null) steps.push('emotions');
    if (wordsEnabled && expectedWord !== null) steps.push('words');
    if (tonesEnabled && expectedTone !== null) steps.push('tones');
    if (spatialEnabled && expectedSpatialDirection !== null) steps.push('spatial');
    return steps;
  }, [
    expectedSound,
    digitsEnabled,
    expectedDigit,
    colorEnabled,
    expectedColor,
    imageEnabled,
    expectedImage,
    emotionsEnabled,
    expectedEmotion,
    wordsEnabled,
    expectedWord,
    tonesEnabled,
    expectedTone,
    spatialEnabled,
    expectedSpatialDirection,
  ]);
  const currentWritingStep = writingSteps[modalityStepIdx] ?? null;
  const isLastWritingStep = modalityStepIdx >= writingSteps.length - 1;

  const handwritingPrimaryModalityCount = [hasAudioTarget, hasDigitTarget].filter(Boolean).length;
  const requiresStructuredWritingInput =
    wordsEnabled || tonesEnabled || spatialEnabled || handwritingPrimaryModalityCount > 1;
  const canUseHandwritingForWriting =
    !requiresStructuredWritingInput && handwritingPrimaryModalityCount === 1;

  const writingInputMethod =
    forcedWritingInputMethod ??
    (canUseHandwritingForWriting ? effectiveWritingInputMethod : 'keyboard');
  const arithmeticInputMethod = forcedArithmeticInputMethod ?? effectiveWritingInputMethod;

  const effectiveGridMap =
    gridMode === '4x4'
      ? GRID_MAP_4x4
      : gridMode === '4x3'
        ? GRID_MAP_4x3
        : gridMode === '3x4'
          ? GRID_MAP_3x4
          : GRID_MAP;
  const gridCols = gridMode === '4x3' || gridMode === '3x3' ? 3 : 4;
  const gridRows = gridMode === '3x4' || gridMode === '3x3' ? 3 : 4;

  // Tailwind needs literal class names (no dynamic interpolation)
  const gridClasses: Record<string, string> = {
    '3x3': 'grid-cols-3 grid-rows-3',
    '3x4': 'grid-cols-4 grid-rows-3',
    '4x3': 'grid-cols-3 grid-rows-4',
    '4x4': 'grid-cols-4 grid-rows-4',
  };
  const gridClass = gridClasses[gridMode] ?? 'grid-cols-3 grid-rows-3';

  const gridRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const trailShadowRef = useRef<SVGPathElement>(null);
  const trailRef = useRef<SVGPathElement>(null);
  const trailHighlightRef = useRef<SVGPathElement>(null);
  const trailHeadOuterRef = useRef<SVGCircleElement>(null);
  const trailHeadInnerRef = useRef<SVGCircleElement>(null);
  const cellRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const centerCellRef = useRef<HTMLDivElement>(null);

  const dragHoverPosRef = useRef<number | null>(null);
  const setDragHoverPos = useCallback(
    (next: number | null) => {
      const prev = dragHoverPosRef.current;
      if (prev === next) return;

      if (prev !== null) {
        const prevEl = cellRefs.current.get(prev);
        prevEl?.classList.remove('nd-trace-drag-hover');
      }

      dragHoverPosRef.current = next;
      if (next !== null) {
        const nextEl = cellRefs.current.get(next);
        nextEl?.classList.add('nd-trace-drag-hover');
      }
    },
    [dragHoverPosRef, cellRefs],
  );

  const touchStartRef = useRef<{
    position: number;
    time: number;
    startedAtMs: number;
    exitHapticTriggered: boolean;
  } | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const activePointerTypeRef = useRef<'mouse' | 'touch' | 'pen' | null>(null);
  const trailPointsRef = useRef<TrailPoint[]>([]);
  const gestureRectRef = useRef<DOMRect | null>(null);
  const trailRafRef = useRef<number>(0);
  const swipeFxRafRef = useRef<number>(0);
  const lastTapRef = useRef<{ position: number; time: number } | null>(null);
  const lastCenterTapRef = useRef<number | null>(null); // Timestamp of last center tap
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [swipeFxMode, setSwipeFxMode] = useState<SwipeFxMode>('full');

  // Writing state
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [isRecognizing, setIsRecognizing] = useState(false);
  const recognizerRef = useRef<HandwritingRecognizer | null>(null);
  const startTimeRef = useRef<number>(0);
  const [clearTrigger, setClearTrigger] = useState(0);
  const [selectedColor, setSelectedColor] = useState<Color | null>(null);
  const [selectedShape, setSelectedShape] = useState<string | null>(null);
  const [selectedEmotion, setSelectedEmotion] = useState<string | null>(null);
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [selectedTone, setSelectedTone] = useState<string | null>(null);
  const [selectedDirection, setSelectedDirection] = useState<string | null>(null);
  const [typedLetter, setTypedLetter] = useState('');
  const [typedDigit, setTypedDigit] = useState('');
  const typedLetterRef = useRef<HTMLInputElement>(null);
  const typedDigitRef = useRef<HTMLInputElement>(null);

  const handwritingLoader = useOptionalHandwritingRecognizerLoader();

  // Arithmetic state
  const [arithmeticStrokes, setArithmeticStrokes] = useState<Stroke[]>([]);
  const [isArithmeticRecognizing, setIsArithmeticRecognizing] = useState(false);
  const digitRecognizerRef = useRef<DigitRecognizer | null>(null);
  const arithmeticStartTimeRef = useRef<number>(0);
  const [arithmeticClearTrigger, setArithmeticClearTrigger] = useState(0);
  const [arithmeticFeedback, setArithmeticFeedback] = useState<'correct' | 'incorrect' | null>(
    null,
  );
  const [typedNumber, setTypedNumber] = useState('');
  const typedNumberRef = useRef<HTMLInputElement>(null);

  const arithmeticAutoClearTimeoutRef = useRef<number | null>(null);
  const arithmeticSubmitDelayTimeoutRef = useRef<number | null>(null);
  const positionTimingFeedbackTimeoutRef = useRef<number | null>(null);
  const writingTimingFeedbackTimeoutRef = useRef<number | null>(null);
  const writingActionStartTimeRef = useRef<number | null>(null);
  const selectorAutoSubmitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isTwoStepArithmetic =
    isArithmetic &&
    (arithmeticProblem?.variant === 'color-cue-2step' ||
      arithmeticProblem?.variant === 'grid-cue-chain');
  const arithmeticCueDisplayMs =
    arithmeticProblem?.variant === 'color-cue-2step' ||
    arithmeticProblem?.variant === 'grid-cue-chain'
      ? arithmeticProblem.cueDisplayMs
      : undefined;
  const [arithmeticSubphase, setArithmeticSubphase] = useState<'cue' | 'solve'>('solve');

  const digitLoader = useOptionalDigitRecognizerLoader();

  // Writing feedback state - controlled by parent via showWritingFeedback prop
  const feedbackRef = useRef<HTMLDivElement>(null);
  const writingOverlayFeedbackRef = useRef<HTMLDivElement>(null);
  const arithmeticFeedbackRef = useRef<HTMLDivElement>(null);

  const focusPrimaryWritingInput = useEffectEvent(() => {
    if (hasAudioTarget) {
      typedLetterRef.current?.focus();
      return;
    }
    if (hasDigitTarget) {
      typedDigitRef.current?.focus();
    }
  });

  const writingFeedbacks = useMemo<readonly WritingChoiceFeedback[]>(() => {
    if (!showWritingFeedback || !writingResult) return [];

    const items: WritingChoiceFeedback[] = [];
    if (hasAudioTarget) {
      items.push({
        key: 'audio',
        label: t('common.audio', 'Audio'),
        status: isExpectedSatisfied(expectedSound, writingResult.recognizedLetter)
          ? 'correct'
          : 'incorrect',
      });
    }
    if (colorEnabled) {
      items.push({
        key: 'color',
        label: t('common.color', 'Color'),
        status: isExpectedSatisfied(expectedColor, writingResult.selectedColor)
          ? 'correct'
          : 'incorrect',
      });
    }
    if (imageEnabled) {
      items.push({
        key: 'image',
        label: t('trace.image', 'Shape'),
        status: isExpectedSatisfied(expectedImage, writingResult.selectedImage)
          ? 'correct'
          : 'incorrect',
      });
    }
    if (hasDigitTarget) {
      items.push({
        key: 'digits',
        label: t('trace.digits', 'Digits'),
        status: isExpectedSatisfied(expectedDigit, writingResult.recognizedDigit)
          ? 'correct'
          : 'incorrect',
      });
    }
    if (emotionsEnabled) {
      items.push({
        key: 'emotions',
        label: t('trace.emotions', 'Emotion'),
        status: isExpectedSatisfied(expectedEmotion, writingResult.selectedEmotion)
          ? 'correct'
          : 'incorrect',
      });
    }
    if (wordsEnabled) {
      items.push({
        key: 'words',
        label: t('trace.words', 'Word'),
        status: isExpectedSatisfied(expectedWord, writingResult.recognizedWord)
          ? 'correct'
          : 'incorrect',
      });
    }
    if (tonesEnabled) {
      items.push({
        key: 'tones',
        label: t('trace.tones', 'Tone'),
        status: isExpectedSatisfied(expectedTone, writingResult.recognizedTone)
          ? 'correct'
          : 'incorrect',
      });
    }
    if (spatialEnabled) {
      items.push({
        key: 'spatial',
        label: t('trace.spatial', 'Direction'),
        status: isExpectedSatisfied(expectedSpatialDirection, writingResult.recognizedDirection)
          ? 'correct'
          : 'incorrect',
      });
    }
    return items;
  }, [
    colorEnabled,
    emotionsEnabled,
    expectedColor,
    expectedDigit,
    expectedEmotion,
    expectedImage,
    expectedSound,
    expectedSpatialDirection,
    expectedTone,
    expectedWord,
    hasAudioTarget,
    hasDigitTarget,
    imageEnabled,
    showWritingFeedback,
    spatialEnabled,
    t,
    tonesEnabled,
    wordsEnabled,
    writingResult,
  ]);

  const audioFeedback =
    writingFeedbacks.find((feedback) => feedback.key === 'audio')?.status ?? null;
  const writingFeedback = writingFeedbacks[0]?.status ?? null;

  const pushPositionTimingFeedback = useCallback(
    (
      feedback: {
        readonly label: string;
        readonly durationMs: number;
        readonly accepted: boolean;
      } | null,
    ) => {
      onPositionTimingFeedbackChange?.(feedback);
      if (positionTimingFeedbackTimeoutRef.current !== null) {
        window.clearTimeout(positionTimingFeedbackTimeoutRef.current);
        positionTimingFeedbackTimeoutRef.current = null;
      }
      if (feedback && !feedback.accepted) {
        positionTimingFeedbackTimeoutRef.current = window.setTimeout(() => {
          positionTimingFeedbackTimeoutRef.current = null;
          onPositionTimingFeedbackChange?.(null);
        }, 900);
      }
    },
    [onPositionTimingFeedbackChange],
  );

  const pushWritingTimingFeedback = useCallback(
    (
      feedback: {
        readonly label: string;
        readonly durationMs: number;
        readonly accepted: boolean;
      } | null,
    ) => {
      onWritingTimingFeedbackChange?.(feedback);
      if (writingTimingFeedbackTimeoutRef.current !== null) {
        window.clearTimeout(writingTimingFeedbackTimeoutRef.current);
        writingTimingFeedbackTimeoutRef.current = null;
      }
      if (feedback && !feedback.accepted) {
        writingTimingFeedbackTimeoutRef.current = window.setTimeout(() => {
          writingTimingFeedbackTimeoutRef.current = null;
          onWritingTimingFeedbackChange?.(null);
        }, 900);
      }
    },
    [onWritingTimingFeedbackChange],
  );

  const validateMindfulPositionAction = useCallback(
    (durationMs: number) =>
      validateActionDuration(durationMs, mindfulPositionDurationMs, mindfulPositionToleranceMs),
    [mindfulPositionDurationMs, mindfulPositionToleranceMs],
  );

  const validateMindfulWritingAction = useCallback(
    (durationMs: number) =>
      validateActionDuration(durationMs, mindfulWritingDurationMs, mindfulWritingToleranceMs),
    [mindfulWritingDurationMs, mindfulWritingToleranceMs],
  );

  const sequentialCellFeedback = useMemo(() => {
    if (!sequentialStepResults || sequentialStepResults.length === 0) return null;

    const map = new Map<number, boolean>();
    for (const step of sequentialStepResults) {
      const fromOk = step.fromCorrect;
      const toOk = step.toCorrect;

      const prevFrom = map.get(step.fromPosition);
      map.set(step.fromPosition, prevFrom === undefined ? fromOk : prevFrom && fromOk);

      const prevTo = map.get(step.toPosition);
      map.set(step.toPosition, prevTo === undefined ? toOk : prevTo && toOk);
    }

    return map;
  }, [sequentialStepResults]);

  // Animate badge when it appears — useEffectEvent so the animation callback
  // doesn't add closure deps that would re-fire the effect unnecessarily.
  const animateBadgeIn = useEffectEvent(() => {
    const targets = [feedbackRef.current, writingOverlayFeedbackRef.current].filter(
      (n): n is HTMLDivElement => !!n,
    );
    if (targets.length === 0) return;

    gsap.killTweensOf(targets);
    gsap.fromTo(
      targets,
      { scale: 0, opacity: 0 },
      {
        scale: 1,
        opacity: 1,
        duration: 0.2,
        ease: 'back.out(2)',
      },
    );
  });

  useEffect(() => {
    if (writingFeedback) {
      animateBadgeIn();
    }
  }, [writingFeedback]);

  // Initialize letter recognizer (singleton - shared across components)
  useEffect(() => {
    let cancelled = false;

    // Only pay TFJS + model cost when handwriting is actually the chosen input method.
    // Loading + warmup can be expensive on some mobile GPUs.
    if (writingInputMethod !== 'handwriting' || !hasAudioTarget) {
      return () => {
        cancelled = true;
      };
    }

    if (!handwritingLoader) {
      return () => {
        cancelled = true;
      };
    }

    let idleId: number | null = null;
    let timeoutId: number | null = null;

    const startLoad = () => {
      handwritingLoader('/models/emnist-letters/model.json')
        .then((recognizer) => {
          if (!cancelled) {
            recognizerRef.current = recognizer;
          }
        })
        .catch((err: unknown) => {
          console.error('[TraceGrid] Failed to load handwriting model:', err);
        });
    };

    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
      idleId = window.requestIdleCallback(
        () => {
          if (cancelled) return;
          startLoad();
        },
        { timeout: 500 },
      );
    } else {
      timeoutId = window.setTimeout(() => {
        if (cancelled) return;
        startLoad();
      }, 250);
    }

    return () => {
      cancelled = true;
      if (
        idleId !== null &&
        typeof window !== 'undefined' &&
        typeof window.cancelIdleCallback === 'function'
      ) {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
      // Don't dispose - singleton is shared
    };
  }, [handwritingLoader, writingInputMethod, hasAudioTarget]);

  // Initialize digit recognizer for arithmetic and trace digit recall (singleton - shared across components)
  useEffect(() => {
    let cancelled = false;

    const needsArithmeticDigits = isArithmetic && arithmeticInputMethod === 'handwriting';
    const needsWritingDigits = writingInputMethod === 'handwriting' && hasDigitTarget;
    if (!needsArithmeticDigits && !needsWritingDigits) {
      return () => {
        cancelled = true;
      };
    }

    if (!digitLoader) {
      return () => {
        cancelled = true;
      };
    }

    let idleId: number | null = null;
    let timeoutId: number | null = null;

    const startLoad = () => {
      digitLoader()
        .then((recognizer) => {
          if (!cancelled) {
            digitRecognizerRef.current = recognizer;
          }
        })
        .catch((err: unknown) => {
          console.error('[TraceGrid] Failed to load digit model:', err);
        });
    };

    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
      idleId = window.requestIdleCallback(
        () => {
          if (cancelled) return;
          startLoad();
        },
        { timeout: 500 },
      );
    } else {
      timeoutId = window.setTimeout(() => {
        if (cancelled) return;
        startLoad();
      }, 100);
    }

    return () => {
      cancelled = true;
      if (
        idleId !== null &&
        typeof window !== 'undefined' &&
        typeof window.cancelIdleCallback === 'function'
      ) {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
      // Don't dispose - singleton is shared
    };
  }, [digitLoader, isArithmetic, arithmeticInputMethod, writingInputMethod, hasDigitTarget]);

  // Animate arithmetic feedback badge
  useEffect(() => {
    if (!arithmeticFeedbackRef.current) return;

    // Clear any pending delayed actions from previous feedback/submits.
    if (arithmeticAutoClearTimeoutRef.current !== null) {
      window.clearTimeout(arithmeticAutoClearTimeoutRef.current);
      arithmeticAutoClearTimeoutRef.current = null;
    }

    if (arithmeticFeedback) {
      gsap.killTweensOf(arithmeticFeedbackRef.current);
      gsap.fromTo(
        arithmeticFeedbackRef.current,
        { scale: 0, opacity: 0 },
        {
          scale: 1,
          opacity: 1,
          duration: 0.2,
          ease: 'back.out(2)',
        },
      );

      // Auto-hide after showing
      if (arithmeticFeedback === 'incorrect') {
        // On incorrect: show briefly, then clear canvas for retry
        arithmeticAutoClearTimeoutRef.current = window.setTimeout(() => {
          arithmeticAutoClearTimeoutRef.current = null;
          setArithmeticFeedback(null);
          setArithmeticStrokes([]);
          setArithmeticClearTrigger((t) => t + 1);
          setTypedNumber('');
        }, 600);
      }
      // On correct: parent will transition to next phase
    }
  }, [arithmeticFeedback]);

  // Ensure no dangling timeouts if the user quits mid-overlay.
  useEffect(() => {
    return () => {
      if (arithmeticAutoClearTimeoutRef.current !== null) {
        window.clearTimeout(arithmeticAutoClearTimeoutRef.current);
        arithmeticAutoClearTimeoutRef.current = null;
      }
      if (arithmeticSubmitDelayTimeoutRef.current !== null) {
        window.clearTimeout(arithmeticSubmitDelayTimeoutRef.current);
        arithmeticSubmitDelayTimeoutRef.current = null;
      }
      if (positionTimingFeedbackTimeoutRef.current !== null) {
        window.clearTimeout(positionTimingFeedbackTimeoutRef.current);
        positionTimingFeedbackTimeoutRef.current = null;
      }
      if (writingTimingFeedbackTimeoutRef.current !== null) {
        window.clearTimeout(writingTimingFeedbackTimeoutRef.current);
        writingTimingFeedbackTimeoutRef.current = null;
      }
      onPositionTimingFeedbackChange?.(null);
      onWritingTimingFeedbackChange?.(null);
    };
  }, [onPositionTimingFeedbackChange, onWritingTimingFeedbackChange]);

  // Reset strokes and color selection when entering writing mode OR advancing to next sequential step
  useEffect(() => {
    if (isWriting) {
      setStrokes([]);
      setClearTrigger((t) => t + 1);
      setWritingStepIdx(0);
      setSelectedColor(null);
      setSelectedShape(null);
      setSelectedEmotion(null);
      setSelectedWord(null);
      setSelectedTone(null);
      setSelectedDirection(null);
      setTypedLetter('');
      setTypedDigit('');
      setForcedWritingInputMethod(null);
      startTimeRef.current = performance.now();
      writingActionStartTimeRef.current = null;
      pushWritingTimingFeedback(null);
    }
  }, [isWriting, writingStepIndex, pushWritingTimingFeedback]);

  // Reset strokes when entering arithmetic mode
  useEffect(() => {
    if (isArithmetic) {
      setArithmeticStrokes([]);
      setArithmeticClearTrigger((t) => t + 1);
      setArithmeticFeedback(null);
      setTypedNumber('');
      setForcedArithmeticInputMethod(null);
      arithmeticStartTimeRef.current = performance.now();
    }
  }, [isArithmetic]);

  // 2-step arithmetic: show cue first, then switch to solve.
  // Important: depend on stable fields (expression/variant) to avoid re-triggering
  // if arithmeticProblem reference changes due to unrelated renders.
  const cueTimerRef = useRef<number | null>(null);
  const lastCueExpressionRef = useRef<string | null>(null);
  useEffect(() => {
    if (cueTimerRef.current !== null) {
      window.clearTimeout(cueTimerRef.current);
      cueTimerRef.current = null;
    }

    if (!isArithmetic) {
      lastCueExpressionRef.current = null;
      setArithmeticSubphase('solve');
      return;
    }

    if (
      arithmeticProblem?.variant !== 'color-cue-2step' &&
      arithmeticProblem?.variant !== 'grid-cue-chain'
    ) {
      lastCueExpressionRef.current = null;
      setArithmeticSubphase('solve');
      return;
    }

    const expr = arithmeticProblem.expression;
    if (!expr) {
      setArithmeticSubphase('solve');
      return;
    }

    // Only replay the cue when a NEW problem arrives (expression change).
    if (lastCueExpressionRef.current === expr) {
      return;
    }
    lastCueExpressionRef.current = expr;

    setArithmeticSubphase('cue');
    const ms = Math.max(0, arithmeticProblem.cueDisplayMs ?? 1000);
    cueTimerRef.current = window.setTimeout(() => {
      cueTimerRef.current = null;
      setArithmeticSubphase('solve');
    }, ms);

    return () => {
      if (cueTimerRef.current !== null) {
        window.clearTimeout(cueTimerRef.current);
        cueTimerRef.current = null;
      }
    };
  }, [
    isArithmetic,
    arithmeticProblem?.variant,
    arithmeticProblem?.expression,
    arithmeticCueDisplayMs,
  ]);

  // When the arithmetic problem changes (refresh), reset input state and timing.
  const lastArithmeticExpressionRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isArithmetic) {
      lastArithmeticExpressionRef.current = null;
      return;
    }
    const expr = arithmeticProblem?.expression ?? null;
    if (!expr) return;
    if (lastArithmeticExpressionRef.current === expr) return;
    lastArithmeticExpressionRef.current = expr;

    setArithmeticStrokes([]);
    setArithmeticClearTrigger((t) => t + 1);
    setArithmeticFeedback(null);
    setTypedNumber('');
    setForcedArithmeticInputMethod(null);
    arithmeticStartTimeRef.current = performance.now();
  }, [isArithmetic, arithmeticProblem?.expression]);

  // Auto-focus inputs when entering keyboard mode
  useEffect(() => {
    if (!isWriting) return;
    if (writingInputMethod !== 'keyboard') return;
    const raf = requestAnimationFrame(() => focusPrimaryWritingInput());
    return () => cancelAnimationFrame(raf);
  }, [isWriting, writingInputMethod, clearTrigger, focusPrimaryWritingInput]);

  useEffect(() => {
    if (!isArithmetic) return;
    if (arithmeticInputMethod !== 'keyboard') return;

    // In 2-step arithmetic, the input isn't mounted during the cue subphase.
    if (isTwoStepArithmetic && arithmeticSubphase !== 'solve') return;
    if (isArithmeticRecognizing || !!arithmeticFeedback) return;

    const raf = requestAnimationFrame(() => {
      // Avoid stealing focus if the user is interacting elsewhere.
      if (document.activeElement === typedNumberRef.current) return;
      typedNumberRef.current?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [
    isArithmetic,
    arithmeticInputMethod,
    isTwoStepArithmetic,
    arithmeticSubphase,
    isArithmeticRecognizing,
    arithmeticFeedback,
  ]);

  const fallbackToKeyboardWriting = useCallback(
    (reason: string) => {
      console.warn(`[TraceGrid] Falling back to keyboard (writing): ${reason}`);
      setForcedWritingInputMethod('keyboard');
      setStrokes([]);
      setClearTrigger((t) => t + 1);
      requestAnimationFrame(() => focusPrimaryWritingInput());
    },
    [focusPrimaryWritingInput],
  );

  const fallbackToKeyboardArithmetic = useCallback(
    (reason: string) => {
      console.warn(`[TraceGrid] Falling back to keyboard (arithmetic): ${reason}`);
      setForcedArithmeticInputMethod('keyboard');
      setTypedNumber('');
      setArithmeticFeedback(null);
      setArithmeticStrokes([]);
      setArithmeticClearTrigger((t) => t + 1);
      requestAnimationFrame(() => typedNumberRef.current?.focus());
    },
    [setForcedArithmeticInputMethod],
  );

  // Keep strokes in ref for auto-submit access
  const strokesRef = useRef<Stroke[]>([]);
  strokesRef.current = strokes;

  const markWritingInteractionStart = useCallback(() => {
    if (writingActionStartTimeRef.current === null) {
      writingActionStartTimeRef.current = performance.now();
    }
  }, []);

  const handleWritingStrokeStart = useCallback(() => {
    markWritingInteractionStart();
  }, [markWritingInteractionStart]);

  const finalizeWritingSubmit = useCallback(
    (result: TraceWritingResult) => {
      setIsRecognizing(false);
      writingActionStartTimeRef.current = null;
      onWritingSubmit?.(result);
    },
    [onWritingSubmit],
  );

  // Submit writing for recognition (uses ref for strokes to avoid stale closure)
  const doSubmit = useCallback(async () => {
    if (isRecognizing || !onWritingSubmit) return;
    const handwritingRecognizer = recognizerRef.current;
    const digitRecognizer = digitRecognizerRef.current;

    if (hasAudioTarget && !handwritingRecognizer?.isReady) {
      fallbackToKeyboardWriting('recognizer-not-ready');
      return;
    }
    if (hasDigitTarget && !digitRecognizer?.isReady) {
      fallbackToKeyboardWriting('digit-recognizer-not-ready');
      return;
    }

    const currentStrokes = strokesRef.current;
    setIsRecognizing(true);
    const endAtMs = performance.now();
    const writingStartMs =
      writingActionStartTimeRef.current ?? (mindfulTimingEnabled ? endAtMs : startTimeRef.current);
    const writingTimeMs = Math.max(0, endAtMs - writingStartMs);
    const points = downsampleStrokePoints(canvasStrokesToPoints(currentStrokes), 1400);

    if (mindfulTimingEnabled) {
      const timing = validateMindfulWritingAction(writingTimeMs);
      if (!timing) {
        setIsRecognizing(false);
        setStrokes([]);
        setClearTrigger((t) => t + 1);
        setTypedLetter('');
        setTypedDigit('');
        writingActionStartTimeRef.current = null;
        startTimeRef.current = performance.now();
        pushWritingTimingFeedback({
          label: t('trace.feedback.writingDuration', 'Writing'),
          durationMs: writingTimeMs,
          accepted: false,
        });
        haptic.notification('error');
        return;
      }

      pushWritingTimingFeedback(null);
    }

    if (points.length === 0) {
      finalizeWritingSubmit(
        buildTraceWritingResult({
          expectedSound,
          expectedColor: colorEnabled ? expectedColor : null,
          expectedImage: imageEnabled ? expectedImage : null,
          expectedDigit: hasDigitTarget ? expectedDigit : null,
          expectedEmotion: emotionsEnabled ? expectedEmotion : null,
          expectedWord: wordsEnabled ? expectedWord : null,
          expectedTone: tonesEnabled ? expectedTone : null,
          expectedSpatialDirection: spatialEnabled ? expectedSpatialDirection : null,
          confidence: 0,
          writingTimeMs,
          timedOut: false,
          selectedColor: colorEnabled ? selectedColor : null,
          selectedImage: imageEnabled ? selectedShape : null,
          selectedEmotion: emotionsEnabled ? selectedEmotion : null,
          recognizedWord: wordsEnabled ? selectedWord : null,
          recognizedTone: tonesEnabled ? selectedTone : null,
          recognizedDirection: spatialEnabled ? selectedDirection : null,
        }),
      );
      return;
    }

    if (hasDigitTarget) {
      let digitRecognition: Awaited<ReturnType<DigitRecognizer['recognizeNumberAsync']>>;
      try {
        if (!digitRecognizer) {
          fallbackToKeyboardWriting('digit-recognizer-missing');
          setIsRecognizing(false);
          return;
        }
        digitRecognition = await digitRecognizer.recognizeNumberAsync(points);
      } catch (err: unknown) {
        console.error('[TraceGrid] Digit recognition failed:', err);
        setIsRecognizing(false);
        fallbackToKeyboardWriting('digit-recognition-error');
        return;
      }

      if (!Number.isFinite(digitRecognition.value)) {
        setIsRecognizing(false);
        fallbackToKeyboardWriting('digit-low-confidence');
        return;
      }

      finalizeWritingSubmit(
        buildTraceWritingResult({
          expectedSound,
          expectedColor: colorEnabled ? expectedColor : null,
          expectedImage: imageEnabled ? expectedImage : null,
          expectedDigit,
          expectedEmotion: emotionsEnabled ? expectedEmotion : null,
          expectedWord: wordsEnabled ? expectedWord : null,
          expectedTone: tonesEnabled ? expectedTone : null,
          expectedSpatialDirection: spatialEnabled ? expectedSpatialDirection : null,
          confidence: digitRecognition.confidence,
          writingTimeMs,
          timedOut: false,
          recognizedDigit: String(digitRecognition.value),
          selectedColor: colorEnabled ? selectedColor : null,
          selectedImage: imageEnabled ? selectedShape : null,
          selectedEmotion: emotionsEnabled ? selectedEmotion : null,
          recognizedWord: wordsEnabled ? selectedWord : null,
          recognizedTone: tonesEnabled ? selectedTone : null,
          recognizedDirection: spatialEnabled ? selectedDirection : null,
        }),
      );
      return;
    }

    // Use async recognition to avoid blocking main thread
    let recognition: Awaited<ReturnType<HandwritingRecognizer['recognizeAsync']>>;
    try {
      if (!handwritingRecognizer) {
        fallbackToKeyboardWriting('recognizer-missing');
        setIsRecognizing(false);
        return;
      }
      recognition = await handwritingRecognizer.recognizeAsync(points);
    } catch (err: unknown) {
      console.error('[TraceGrid] Handwriting recognition failed:', err);
      setIsRecognizing(false);
      fallbackToKeyboardWriting('recognition-error');
      return;
    }

    if (!recognition.letter) {
      setIsRecognizing(false);
      fallbackToKeyboardWriting('empty-recognition');
      return;
    }

    finalizeWritingSubmit(
      buildTraceWritingResult({
        expectedSound,
        expectedColor: colorEnabled ? expectedColor : null,
        expectedImage: imageEnabled ? expectedImage : null,
        expectedDigit: hasDigitTarget ? expectedDigit : null,
        expectedEmotion: emotionsEnabled ? expectedEmotion : null,
        expectedWord: wordsEnabled ? expectedWord : null,
        expectedTone: tonesEnabled ? expectedTone : null,
        expectedSpatialDirection: spatialEnabled ? expectedSpatialDirection : null,
        confidence: recognition.score,
        writingTimeMs,
        timedOut: false,
        recognizedLetter: recognition.letter,
        selectedColor: colorEnabled ? selectedColor : null,
        selectedImage: imageEnabled ? selectedShape : null,
        selectedEmotion: emotionsEnabled ? selectedEmotion : null,
        recognizedWord: wordsEnabled ? selectedWord : null,
        recognizedTone: tonesEnabled ? selectedTone : null,
        recognizedDirection: spatialEnabled ? selectedDirection : null,
      }),
    );
  }, [
    colorEnabled,
    emotionsEnabled,
    expectedColor,
    expectedDigit,
    expectedEmotion,
    expectedImage,
    expectedSound,
    expectedSpatialDirection,
    expectedTone,
    expectedWord,
    imageEnabled,
    hasAudioTarget,
    hasDigitTarget,
    finalizeWritingSubmit,
    fallbackToKeyboardWriting,
    haptic,
    isRecognizing,
    mindfulTimingEnabled,
    onWritingSubmit,
    pushWritingTimingFeedback,
    selectedColor,
    selectedDirection,
    selectedEmotion,
    selectedShape,
    selectedTone,
    selectedWord,
    spatialEnabled,
    t,
    tonesEnabled,
    validateMindfulWritingAction,
    wordsEnabled,
  ]);

  const doKeyboardSubmit = useCallback(() => {
    if (isRecognizing || !onWritingSubmit) return;

    setIsRecognizing(true);
    const endAtMs = performance.now();
    const writingStartMs =
      writingActionStartTimeRef.current ?? (mindfulTimingEnabled ? endAtMs : startTimeRef.current);
    const writingTimeMs = Math.max(0, endAtMs - writingStartMs);
    const letter = typedLetter.trim().toUpperCase();

    if (mindfulTimingEnabled) {
      const timing = validateMindfulWritingAction(writingTimeMs);
      if (!timing) {
        setIsRecognizing(false);
        setTypedLetter('');
        setTypedDigit('');
        setStrokes([]);
        setClearTrigger((t) => t + 1);
        writingActionStartTimeRef.current = null;
        startTimeRef.current = performance.now();
        pushWritingTimingFeedback({
          label: t('trace.feedback.writingDuration', 'Writing'),
          durationMs: writingTimeMs,
          accepted: false,
        });
        haptic.notification('error');
        return;
      }

      pushWritingTimingFeedback(null);
    }
    finalizeWritingSubmit(
      buildTraceWritingResult({
        expectedSound,
        expectedColor: colorEnabled ? expectedColor : null,
        expectedImage: imageEnabled ? expectedImage : null,
        expectedDigit: hasDigitTarget ? expectedDigit : null,
        expectedEmotion: emotionsEnabled ? expectedEmotion : null,
        expectedWord: wordsEnabled ? expectedWord : null,
        expectedTone: tonesEnabled ? expectedTone : null,
        expectedSpatialDirection: spatialEnabled ? expectedSpatialDirection : null,
        confidence: 1,
        writingTimeMs,
        timedOut: false,
        recognizedLetter: hasAudioTarget ? letter || null : null,
        recognizedDigit: hasDigitTarget ? typedDigit.trim().slice(0, 1) || null : null,
        recognizedWord: wordsEnabled ? selectedWord : null,
        recognizedTone: tonesEnabled ? selectedTone : null,
        recognizedDirection: spatialEnabled ? selectedDirection : null,
        selectedColor: colorEnabled ? selectedColor : null,
        selectedImage: imageEnabled ? selectedShape : null,
        selectedEmotion: emotionsEnabled ? selectedEmotion : null,
      }),
    );
  }, [
    colorEnabled,
    emotionsEnabled,
    expectedColor,
    expectedDigit,
    expectedEmotion,
    expectedImage,
    expectedSound,
    expectedSpatialDirection,
    expectedTone,
    expectedWord,
    finalizeWritingSubmit,
    hasAudioTarget,
    hasDigitTarget,
    haptic,
    imageEnabled,
    isRecognizing,
    mindfulTimingEnabled,
    onWritingSubmit,
    pushWritingTimingFeedback,
    selectedColor,
    selectedEmotion,
    selectedDirection,
    selectedShape,
    selectedTone,
    selectedWord,
    t,
    tonesEnabled,
    typedDigit,
    typedLetter,
    validateMindfulWritingAction,
    wordsEnabled,
    spatialEnabled,
  ]);

  // Advance to next writing step, or submit if last step
  const advanceWritingStep = useCallback(() => {
    setWritingStepIdx((prev) => prev + 1);
    setClearTrigger((t) => t + 1);
    setStrokes([]);
  }, []);

  // Step-based auto-advance: after a selector tap, advance or submit
  const handleSelectorStepComplete = useEffectEvent(() => {
    if (isRecognizing || writingFeedback) return;
    if (isLastWritingStep) {
      doKeyboardSubmit();
    } else {
      advanceWritingStep();
    }
  });

  const scheduleSelectorAdvance = useCallback(() => {
    if (selectorAutoSubmitTimerRef.current) clearTimeout(selectorAutoSubmitTimerRef.current);
    selectorAutoSubmitTimerRef.current = setTimeout(handleSelectorStepComplete, 350);
  }, [handleSelectorStepComplete]);

  // For handwriting/keyboard steps: validate current step, advance or submit
  const handleWritingStepValidate = useEffectEvent(() => {
    if (isRecognizing || writingFeedback) return;
    if (isLastWritingStep) {
      doKeyboardSubmit();
    } else {
      advanceWritingStep();
    }
  });

  // Cleanup auto-submit timer when writing phase ends
  useEffect(() => {
    if (!isWriting) {
      if (selectorAutoSubmitTimerRef.current) {
        clearTimeout(selectorAutoSubmitTimerRef.current);
        selectorAutoSubmitTimerRef.current = null;
      }
    }
  }, [isWriting]);

  // Handle stroke completion (no auto-submit - user taps to validate)
  const handleStrokeEnd = useCallback((newStrokes: Stroke[]) => {
    setStrokes(newStrokes);
  }, []);

  // Tap handler - validates drawing (empty canvas = audio rejection)
  const handleTap = useCallback(() => {
    if (isRecognizing) return;
    if (isLastWritingStep) {
      doSubmit(); // Last step: recognize + submit
    } else {
      doSubmit(); // Non-last: recognize, then advanceWritingStep is called from doSubmit flow
      // TODO: For multi-step handwriting, recognition needs to advance instead of submit
      // For now, handwriting steps are always treated as "submit all at once" when first
    }
  }, [isRecognizing, doSubmit, isLastWritingStep]);

  const handleKeyboardWritingKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        doKeyboardSubmit();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        const field = e.currentTarget.getAttribute('data-writing-field');
        if (field === 'digit') {
          setTypedDigit('');
          return;
        }
        setTypedLetter('');
      }
    },
    [doKeyboardSubmit],
  );

  // Keep arithmetic strokes in ref for submit access
  const arithmeticStrokesRef = useRef<Stroke[]>([]);
  arithmeticStrokesRef.current = arithmeticStrokes;

  // Arithmetic submit handler
  const doArithmeticSubmit = useCallback(async () => {
    if (isArithmeticRecognizing || !onArithmeticSubmit) return;
    if (!digitRecognizerRef.current?.isReady) {
      fallbackToKeyboardArithmetic('digit-recognizer-not-ready');
      return;
    }
    if (expectedAnswer === undefined) return;

    const currentStrokes = arithmeticStrokesRef.current;
    setIsArithmeticRecognizing(true);
    const writingTimeMs = performance.now() - arithmeticStartTimeRef.current;
    const points = downsampleStrokePoints(canvasStrokesToPoints(currentStrokes), 900);

    if (points.length === 0) {
      // Empty canvas = invalid, show feedback and retry
      setArithmeticFeedback('incorrect');
      setIsArithmeticRecognizing(false);
      return;
    }

    // Use async recognition to avoid blocking main thread
    let recognition: Awaited<ReturnType<DigitRecognizer['recognizeNumberAsync']>>;
    try {
      recognition = await digitRecognizerRef.current.recognizeNumberAsync(points);
    } catch (err: unknown) {
      console.error('[TraceGrid] Digit recognition failed:', err);
      setIsArithmeticRecognizing(false);
      fallbackToKeyboardArithmetic('recognition-error');
      return;
    }

    if (!Number.isFinite(recognition.value)) {
      setIsArithmeticRecognizing(false);
      fallbackToKeyboardArithmetic('low-confidence');
      return;
    }

    const isCorrect = recognition.value === expectedAnswer;

    setArithmeticFeedback(isCorrect ? 'correct' : 'incorrect');
    setIsArithmeticRecognizing(false);

    if (isCorrect) {
      // Correct answer - notify parent after brief feedback display
      if (arithmeticSubmitDelayTimeoutRef.current !== null) {
        window.clearTimeout(arithmeticSubmitDelayTimeoutRef.current);
      }
      arithmeticSubmitDelayTimeoutRef.current = window.setTimeout(() => {
        arithmeticSubmitDelayTimeoutRef.current = null;
        onArithmeticSubmit(recognition.value, recognition.confidence, writingTimeMs);
      }, 150);
    }
    // Incorrect: feedback effect will auto-clear canvas via useEffect
  }, [expectedAnswer, onArithmeticSubmit, isArithmeticRecognizing, fallbackToKeyboardArithmetic]);

  const doArithmeticKeyboardSubmit = useCallback(() => {
    if (isArithmeticRecognizing || !onArithmeticSubmit) return;
    if (expectedAnswer === undefined) return;
    if (arithmeticFeedback) return;

    const writingTimeMs = performance.now() - arithmeticStartTimeRef.current;
    const raw = typedNumber.trim();

    if (!raw) {
      setArithmeticFeedback('incorrect');
      return;
    }

    const value = Number.parseInt(raw, 10);
    if (!Number.isFinite(value)) {
      setArithmeticFeedback('incorrect');
      return;
    }

    const isCorrect = value === expectedAnswer;
    setArithmeticFeedback(isCorrect ? 'correct' : 'incorrect');

    if (isCorrect) {
      if (arithmeticSubmitDelayTimeoutRef.current !== null) {
        window.clearTimeout(arithmeticSubmitDelayTimeoutRef.current);
      }
      arithmeticSubmitDelayTimeoutRef.current = window.setTimeout(() => {
        arithmeticSubmitDelayTimeoutRef.current = null;
        onArithmeticSubmit(value, 1, writingTimeMs);
      }, 150);
    }
  }, [
    typedNumber,
    expectedAnswer,
    onArithmeticSubmit,
    isArithmeticRecognizing,
    arithmeticFeedback,
  ]);

  const handleKeyboardArithmeticKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        doArithmeticKeyboardSubmit();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setTypedNumber('');
      }
    },
    [doArithmeticKeyboardSubmit],
  );

  // Arithmetic stroke end handler
  const handleArithmeticStrokeEnd = useCallback((newStrokes: Stroke[]) => {
    setArithmeticStrokes(newStrokes);
  }, []);

  // Arithmetic erase handler
  const handleArithmeticErase = useCallback(() => {
    setArithmeticStrokes([]);
    setArithmeticClearTrigger((t) => t + 1);
  }, []);

  // Arithmetic tap handler - validates answer
  const handleArithmeticTap = useCallback(() => {
    if (isArithmeticRecognizing || arithmeticFeedback) return;
    doArithmeticSubmit();
  }, [isArithmeticRecognizing, arithmeticFeedback, doArithmeticSubmit]);

  // Get grid dimensions for full-grid DrawingCanvas
  const getGridSize = useCallback((): number => {
    if (!gridRef.current) return 300;
    const rect = gridRef.current.getBoundingClientRect();
    return Math.min(rect.width, rect.height);
  }, []);

  const [gridSize, setGridSize] = useState(300);

  // Update grid size on resize
  useEffect(() => {
    let rafId: number | null = null;
    const updateSize = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      rafId = requestAnimationFrame(() => {
        setGridSize(getGridSize());
        rafId = null;
      });
    };
    updateSize();
    window.addEventListener('resize', updateSize, { passive: true });
    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      window.removeEventListener('resize', updateSize);
    };
  }, [getGridSize]);

  // Animate cells fade out/in when entering/exiting writing or arithmetic mode
  // Note: showWritingFeedback keeps cells VISIBLE with badge at center
  useEffect(() => {
    const cells = Array.from(cellRefs.current.values());
    const center = centerCellRef.current;

    if (isWriting || isArithmetic) {
      // Fade out all position cells for overlay
      gsap.to(cells, {
        opacity: 0,
        scale: 0.8,
        duration: 0.15,
        ease: 'power2.in',
        stagger: 0.02,
      });
      // Hide center focus line
      if (center) {
        gsap.to(center, { opacity: 0, duration: 0.1 });
      }
    } else {
      // Fade in cells when exiting writing/arithmetic mode
      gsap.to(cells, {
        opacity: 1,
        scale: 0.98,
        duration: 0.2,
        ease: 'power2.out',
        stagger: 0.02,
      });
      if (center) {
        gsap.to(center, { opacity: 1, duration: 0.15 });
      }
    }
  }, [isWriting, isArithmetic]);

  // Respect reduced motion preference while keeping gameplay interactions unchanged.
  useMountEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setPrefersReducedMotion(mediaQuery.matches);
    update();

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', update);
      return () => mediaQuery.removeEventListener('change', update);
    }

    mediaQuery.addListener(update);
    return () => mediaQuery.removeListener(update);
  });

  // Adaptive swipe FX: keep rich visuals on capable devices and degrade progressively on lag.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const root = document.documentElement;

    const pickMode = (lagMs?: number): SwipeFxMode => {
      if (
        prefersReducedMotion ||
        root.classList.contains('reduce-motion') ||
        root.classList.contains('perf-reduce-motion')
      ) {
        return 'minimal';
      }
      if (typeof lagMs === 'number') {
        if (lagMs >= 170) return 'minimal';
        if (lagMs >= 90) return 'lite';
      }
      return 'full';
    };

    const applyFromLag = () => {
      const lagMs = getLastMeasuredLag();
      const next = pickMode(lagMs);
      setSwipeFxMode((prev) => (prev === next ? prev : next));
    };

    const unsubLongTask = diagnostics.onLongTask((event) => {
      if (event.durationMs >= 220) {
        setSwipeFxMode((prev) => (prev === 'minimal' ? prev : 'minimal'));
      } else if (event.durationMs >= 110) {
        setSwipeFxMode((prev) => (prev === 'full' ? 'lite' : prev));
      }
    });

    const rootObserver = new MutationObserver(applyFromLag);
    rootObserver.observe(root, { attributes: true, attributeFilter: ['class'] });

    applyFromLag();
    const intervalId = window.setInterval(applyFromLag, 1000);
    return () => {
      unsubLongTask();
      rootObserver.disconnect();
      window.clearInterval(intervalId);
    };
  }, [prefersReducedMotion, diagnostics, getLastMeasuredLag]);

  const updateTrailDom = useCallback(() => {
    const shadow = trailShadowRef.current;
    const core = trailRef.current;
    const highlight = trailHighlightRef.current;
    const headOuter = trailHeadOuterRef.current;
    const headInner = trailHeadInnerRef.current;
    if (!shadow || !core || !highlight || !headOuter || !headInner) return;

    const points = trailPointsRef.current;
    if (points.length < 2) {
      shadow.style.display = 'none';
      core.style.display = 'none';
      highlight.style.display = 'none';
      headOuter.style.display = 'none';
      headInner.style.display = 'none';
      return;
    }

    const path = buildTrailPath(points);
    shadow.setAttribute('d', path);
    core.setAttribute('d', path);
    highlight.setAttribute('d', path);
    shadow.style.display = '';
    core.style.display = '';
    highlight.style.display = '';

    const head = points[points.length - 1];
    if (!head) {
      headOuter.style.display = 'none';
      headInner.style.display = 'none';
      return;
    }
    headOuter.setAttribute('cx', String(head.x));
    headOuter.setAttribute('cy', String(head.y));
    headInner.setAttribute('cx', String(head.x));
    headInner.setAttribute('cy', String(head.y));
    headOuter.style.display = '';
    headInner.style.display = '';
  }, []);

  const queueTrailRender = useCallback(() => {
    if (trailRafRef.current) return;
    trailRafRef.current = requestAnimationFrame(() => {
      trailRafRef.current = 0;
      updateTrailDom();
    });
  }, [updateTrailDom]);

  const clearTrail = useCallback(() => {
    trailPointsRef.current = [];
    if (trailRafRef.current) {
      cancelAnimationFrame(trailRafRef.current);
      trailRafRef.current = 0;
    }
    updateTrailDom();
  }, [updateTrailDom]);

  const fadeTrailOut = useCallback(
    (duration = 0.22) => {
      const shadow = trailShadowRef.current;
      const core = trailRef.current;
      const spine = trailHighlightRef.current;
      const headOuter = trailHeadOuterRef.current;
      const headInner = trailHeadInnerRef.current;
      if (!shadow || !core || !spine || !headOuter || !headInner) {
        clearTrail();
        return;
      }

      const points = trailPointsRef.current;
      if (points.length < 2) {
        clearTrail();
        return;
      }

      // Ensure latest path/head are rendered before fading.
      updateTrailDom();

      const nodes = [shadow, core, spine, headOuter, headInner];
      gsap.killTweensOf(nodes);

      gsap.to(nodes, {
        opacity: 0,
        duration,
        ease: 'power1.out',
        onComplete: () => {
          // Restore authored SVG opacities (attributes) for next gesture.
          nodes.forEach((node) => {
            (node as unknown as { style: { opacity: string } }).style.opacity = '';
          });
          clearTrail();
        },
      });
    },
    [clearTrail, updateTrailDom],
  );

  const getGestureRect = useCallback(() => {
    const cached = gestureRectRef.current;
    if (cached) return cached;
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) return null;
    gestureRectRef.current = rect;
    return rect;
  }, []);

  // Get position from screen coordinates
  const getPositionFromEvent = useCallback((clientX: number, clientY: number): number | null => {
    for (const [position, cell] of cellRefs.current.entries()) {
      const rect = cell.getBoundingClientRect();
      if (
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom
      ) {
        return position;
      }
    }
    return null;
  }, []);

  // Check if touch is on center cell
  const isCenterCell = useCallback(
    (clientX: number, clientY: number): boolean => {
      if (gridMode !== '3x3') return false; // No center cell in non-3×3 grids
      if (!gridRef.current) return false;
      const rect = gridRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const cellWidth = rect.width / 3;
      const cellHeight = rect.height / 3;
      const col = Math.floor(x / cellWidth);
      const row = Math.floor(y / cellHeight);
      // Center is at row=1, col=1 (gridIndex 4)
      return col === 1 && row === 1;
    },
    [gridMode],
  );

  // Animate center rejection (visual feedback for double-tap on center)
  const animateCenterReject = useCallback(() => {
    if (!centerCellRef.current) return;
    const center = centerCellRef.current;

    // Flash effect on center cell
    // Note: Use hex colors - GSAP cannot parse CSS variables
    gsap
      .timeline()
      .to(center, {
        scale: 1.1,
        backgroundColor: 'rgba(128, 128, 128, 0.3)',
        duration: 0.1,
        ease: 'power2.out',
      })
      .to(center, {
        scale: 1,
        backgroundColor: 'transparent',
        duration: 0.2,
        ease: 'power2.out',
      });
  }, []);

  // Get cell center for animations
  const getCellCenter = useCallback(
    (position: number): { x: number; y: number } | null => {
      if (!gridRef.current) return null;
      const rect = gridRef.current.getBoundingClientRect();
      const cellWidth = rect.width / gridCols;
      const cellHeight = rect.height / gridRows;
      const gridIndex = effectiveGridMap.indexOf(position as never);
      if (gridIndex === -1) return null;
      const col = gridIndex % gridCols;
      const row = Math.floor(gridIndex / gridCols);
      return {
        x: col * cellWidth + cellWidth / 2,
        y: row * cellHeight + cellHeight / 2,
      };
    },
    [gridCols, gridRows, effectiveGridMap],
  );

  // Animate impact on cell - GPU-friendly (backgroundColor + opacity only)
  const animateImpact = useCallback((position: number, isCorrect: boolean) => {
    const cell = cellRefs.current.get(position);
    if (!cell) return;

    // Use theme tokens (ink palette) rather than ad-hoc Tailwind greens/reds.
    const color = isCorrect
      ? cssVarHsl('--woven-correct', '#2D5A4A')
      : cssVarHsl('--woven-incorrect', '#8B3A3A');

    // Subtle ring ripple adds "respondant" feel without going arcade.
    const ring = isCorrect
      ? cssVarHsl('--woven-correct', 'rgba(45, 90, 74, 0.35)', 0.35)
      : cssVarHsl('--woven-incorrect', 'rgba(139, 58, 58, 0.35)', 0.35);

    const ringTransparent = isCorrect
      ? cssVarHsl('--woven-correct', 'rgba(45, 90, 74, 0)', 0)
      : cssVarHsl('--woven-incorrect', 'rgba(139, 58, 58, 0)', 0);

    gsap.killTweensOf(cell);

    gsap
      .timeline()
      .set(cell, {
        backgroundColor: color,
        opacity: 1,
        scale: 1,
        boxShadow: `0 0 0 0 ${ring}`,
      })
      .to(
        cell,
        {
          scale: 1.03,
          opacity: 0.92,
          boxShadow: `0 0 0 14px ${ringTransparent}`,
          duration: 0.14,
          ease: 'power2.out',
        },
        0,
      )
      .to(
        cell,
        {
          opacity: 1,
          scale: 1,
          backgroundColor: '',
          boxShadow: '',
          duration: 0.26,
          ease: 'power1.out',
          clearProps: 'backgroundColor,boxShadow,scale',
        },
        0.12,
      );
  }, []);

  const animateTap = useCallback((position: number) => {
    const cell = cellRefs.current.get(position);
    if (!cell) return;

    // Ink-like tap ring (theme-aware, avoids "UI amber" feel)
    const ring = 'hsl(var(--woven-text) / 0.18)';

    gsap.killTweensOf(cell);
    gsap
      .timeline()
      .set(cell, { boxShadow: `0 0 0 0 ${ring}`, scale: 1 })
      .to(cell, {
        scale: 1.025,
        boxShadow: `0 0 0 10px rgba(0,0,0,0)`,
        duration: 0.12,
        ease: 'power2.out',
      })
      .to(cell, {
        scale: 1,
        boxShadow: '',
        duration: 0.2,
        ease: 'power1.out',
        clearProps: 'boxShadow,scale',
      });
  }, []);

  // Animate swipe trail with layered ink effect (cross-browser, no SVG filters).
  const animateSwipeComplete = useCallback(
    (fromPos: number, toPos: number) => {
      const startCenter = getCellCenter(fromPos);
      const endCenter = getCellCenter(toPos);
      if (!startCenter || !endCenter || !svgRef.current) return;

      // Pre-resolve CSS variable to a concrete color for dynamic SVG elements
      // (Android WebView doesn't resolve CSS vars in dynamically created SVG attributes)
      const inkColor = cssVarHsl('--woven-text', '#1a1a2e');

      // Calculate line length for stroke animation
      const dx = endCenter.x - startCenter.x;
      const dy = endCenter.y - startCenter.y;
      const length = Math.hypot(dx, dy);
      if (length <= 0) return;

      const dirX = dx / length;
      const dirY = dy / length;
      const normalX = -dirY;
      const normalY = dirX;

      const createLine = (
        width: number,
        opacity: number,
        stroke: string,
        offsetX = 0,
        offsetY = 0,
      ) => {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', String(startCenter.x + offsetX));
        line.setAttribute('y1', String(startCenter.y + offsetY));
        line.setAttribute('x2', String(endCenter.x + offsetX));
        line.setAttribute('y2', String(endCenter.y + offsetY));
        line.setAttribute('stroke', stroke);
        line.setAttribute('stroke-width', String(width));
        line.setAttribute('stroke-linecap', 'round');
        line.setAttribute('stroke-linejoin', 'round');
        line.style.opacity = String(opacity);
        line.style.strokeDasharray = String(length);
        line.style.strokeDashoffset = String(length);
        line.dataset['swipeFx'] = 'true';
        return line;
      };

      // Minimal mode: keep feedback ink but avoid decorative layers.
      if (swipeFxMode === 'minimal') {
        const layer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        layer.dataset['swipeFx'] = 'true';

        // Still "minimal", but avoid the single-line look: stack 3 ink layers.
        const offset = 0.7;
        const bleed = createLine(14.5, 0.1, inkColor, normalX * offset, normalY * offset);
        const body = createLine(8.4, 0.92, inkColor);
        const spine = createLine(3.4, 0.55, inkColor, normalX * -0.45, normalY * -0.45);

        const endBlot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        endBlot.setAttribute('cx', String(endCenter.x));
        endBlot.setAttribute('cy', String(endCenter.y));
        endBlot.setAttribute('r', '1.2');
        endBlot.setAttribute('fill', inkColor);
        endBlot.style.opacity = '0';
        endBlot.dataset['swipeFx'] = 'true';

        layer.append(bleed, body, spine, endBlot);
        svgRef.current.appendChild(layer);

        gsap
          .timeline({ onComplete: () => layer.remove() })
          .to(
            [bleed, body, spine],
            {
              strokeDashoffset: 0,
              duration: prefersReducedMotion ? 0.12 : 0.18,
              ease: 'power1.out',
            },
            0,
          )
          .to(
            endBlot,
            {
              opacity: 0.22,
              attr: { r: 7.5 },
              duration: prefersReducedMotion ? 0.22 : 0.32,
              ease: 'power1.out',
            },
            prefersReducedMotion ? 0.08 : 0.12,
          )
          .to(
            [bleed, body, spine],
            {
              opacity: 0.62,
              duration: prefersReducedMotion ? 0.18 : 0.28,
              ease: 'power1.out',
            },
            prefersReducedMotion ? 0.18 : 0.25,
          )
          .to(
            [bleed, body, spine, endBlot],
            {
              opacity: 0,
              duration: prefersReducedMotion ? 0.22 : 0.55,
              ease: 'power1.out',
            },
            prefersReducedMotion ? 0.3 : 0.45,
          );
        return;
      }

      // Lite mode: layered stroke only, no pulse/spark particles.
      if (swipeFxMode === 'lite') {
        const layer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        layer.dataset['swipeFx'] = 'true';
        // Heavier stroke stack (shadow + body + spine) to feel like a pen.

        const offset = 0.9;
        const shadow = createLine(16, 0.1, inkColor, normalX * offset, normalY * offset);
        const body = createLine(9.2, 0.92, inkColor);
        const spine = createLine(3.6, 0.62, inkColor, normalX * -0.5, normalY * -0.5);

        const endBlot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        endBlot.setAttribute('cx', String(endCenter.x));
        endBlot.setAttribute('cy', String(endCenter.y));
        endBlot.setAttribute('r', '1.4');
        endBlot.setAttribute('fill', inkColor);
        endBlot.style.opacity = '0';
        endBlot.dataset['swipeFx'] = 'true';

        layer.append(shadow, body, spine, endBlot);
        svgRef.current.appendChild(layer);

        gsap
          .timeline({ onComplete: () => layer.remove() })
          .to(
            [shadow, body, spine],
            {
              strokeDashoffset: 0,
              duration: prefersReducedMotion ? 0.14 : 0.22,
              ease: 'power2.out',
            },
            0,
          )
          .to(
            endBlot,
            {
              opacity: 0.18,
              attr: { r: 9 },
              duration: prefersReducedMotion ? 0.22 : 0.34,
              ease: 'power1.out',
            },
            prefersReducedMotion ? 0.1 : 0.14,
          )
          .to(
            [shadow, body, spine, endBlot],
            {
              opacity: 0.6,
              duration: prefersReducedMotion ? 0.18 : 0.3,
              ease: 'power1.out',
            },
            prefersReducedMotion ? 0.2 : 0.28,
          )
          .to(
            [shadow, body, spine, endBlot],
            {
              opacity: 0,
              duration: prefersReducedMotion ? 0.25 : 0.7,
              ease: 'power1.out',
            },
            prefersReducedMotion ? 0.34 : 0.55,
          );
        return;
      }

      const layer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      layer.dataset['swipeFx'] = 'true';
      // Full mode: calligraphy-like stroke (wider + darker, no bright highlight).
      const offset = 1.05;
      const shadow = createLine(18, 0.12, inkColor, normalX * offset, normalY * offset);
      const body = createLine(10.2, 0.93, inkColor);
      const spine = createLine(3.8, 0.68, inkColor, normalX * -0.55, normalY * -0.55);

      const createPulse = () => {
        const pulse = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        pulse.setAttribute('fill', 'none');
        pulse.setAttribute('stroke', inkColor);
        pulse.setAttribute('stroke-width', '2');
        pulse.style.opacity = '0';
        pulse.dataset['swipeFx'] = 'true';
        return pulse;
      };

      const startPulse = createPulse();
      startPulse.setAttribute('cx', String(startCenter.x));
      startPulse.setAttribute('cy', String(startCenter.y));
      startPulse.setAttribute('r', '3');

      const endPulse = createPulse();
      endPulse.setAttribute('cx', String(endCenter.x));
      endPulse.setAttribute('cy', String(endCenter.y));
      endPulse.setAttribute('r', '2');

      const head = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      head.setAttribute('cx', String(startCenter.x));
      head.setAttribute('cy', String(startCenter.y));
      head.setAttribute('r', '3.1');
      head.setAttribute('fill', inkColor);
      head.style.opacity = '0.9';
      head.dataset['swipeFx'] = 'true';

      const endBlot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      endBlot.setAttribute('cx', String(endCenter.x));
      endBlot.setAttribute('cy', String(endCenter.y));
      endBlot.setAttribute('r', '1.4');
      endBlot.setAttribute('fill', inkColor);
      endBlot.style.opacity = '0';
      endBlot.dataset['swipeFx'] = 'true';

      const sparks = Array.from({ length: SWIPE_SPARK_COUNT }, (_, index) => {
        const t = (index + 1) / (SWIPE_SPARK_COUNT + 1);
        const baseX = startCenter.x + dx * t;
        const baseY = startCenter.y + dy * t;
        const drift = (index % 2 === 0 ? 1 : -1) * (3 + index * 2);

        const spark = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        spark.setAttribute('cx', String(baseX));
        spark.setAttribute('cy', String(baseY));
        spark.setAttribute('r', '1.2');
        spark.setAttribute('fill', inkColor);
        spark.style.opacity = '0.5';
        spark.dataset['swipeFx'] = 'true';

        return {
          node: spark,
          targetX: baseX + normalX * drift + dirX * 2,
          targetY: baseY + normalY * drift + dirY * 2,
        };
      });

      layer.append(shadow, body, spine, startPulse, endPulse);
      for (const spark of sparks) {
        layer.appendChild(spark.node);
      }
      layer.append(head, endBlot);
      svgRef.current.appendChild(layer);

      const timeline = gsap.timeline({
        onComplete: () => layer.remove(),
      });

      timeline.to(
        [shadow, body, spine],
        {
          strokeDashoffset: 0,
          duration: prefersReducedMotion ? 0.14 : 0.22,
          ease: 'power2.out',
        },
        0,
      );

      if (prefersReducedMotion) {
        timeline.to(
          [shadow, body, spine],
          {
            opacity: 0,
            duration: 0.4,
            ease: 'power1.out',
          },
          0.14,
        );
        return;
      }

      timeline
        .to(
          head,
          {
            attr: { cx: endCenter.x, cy: endCenter.y },
            duration: 0.2,
            ease: 'power2.out',
          },
          0,
        )
        .fromTo(
          startPulse,
          { attr: { r: 3 }, opacity: 0.45 },
          { attr: { r: 14 }, opacity: 0, duration: 0.26, ease: 'power1.out' },
          0,
        )
        .fromTo(
          endPulse,
          { attr: { r: 2 }, opacity: 0 },
          { attr: { r: 18 }, opacity: 0.45, duration: 0.22, ease: 'power2.out' },
          0.12,
        )
        .to(
          endBlot,
          {
            opacity: 0.16,
            attr: { r: 10 },
            duration: 0.38,
            ease: 'power1.out',
          },
          0.12,
        )
        .to(
          endPulse,
          {
            opacity: 0,
            duration: 0.2,
            ease: 'power1.in',
          },
          0.3,
        )
        .to(
          [shadow, body, spine, head, endBlot],
          {
            opacity: 0.55,
            duration: 0.4,
            ease: 'power1.out',
          },
          0.26,
        )
        .to(
          [shadow, body, spine, head, endBlot],
          {
            opacity: 0,
            duration: 0.85,
            ease: 'power1.out',
          },
          0.7,
        );

      for (const [index, spark] of sparks.entries()) {
        timeline.fromTo(
          spark.node,
          { attr: { r: 1.2 }, opacity: 0.45 },
          {
            attr: { cx: spark.targetX, cy: spark.targetY, r: 0.2 },
            opacity: 0,
            duration: 0.3,
            ease: 'power1.out',
          },
          0.08 + index * 0.03,
        );
      }
    },
    [getCellCenter, prefersReducedMotion, swipeFxMode],
  );

  const queueSwipeEffect = useCallback(
    (fromPos: number, toPos: number) => {
      if (swipeFxRafRef.current) {
        cancelAnimationFrame(swipeFxRafRef.current);
      }
      swipeFxRafRef.current = requestAnimationFrame(() => {
        swipeFxRafRef.current = 0;
        animateSwipeComplete(fromPos, toPos);
      });
    },
    [animateSwipeComplete],
  );

  // Pointer handlers (unified touch + mouse + pen)
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled) return;
      if (activePointerIdRef.current !== null) return;

      // Only left click for mouse.
      if (e.pointerType === 'mouse' && e.button !== 0) return;

      e.preventDefault();

      const pointerType: 'mouse' | 'touch' | 'pen' =
        e.pointerType === 'touch' || e.pointerType === 'pen' ? e.pointerType : 'mouse';
      const inputMethod: 'mouse' | 'touch' = pointerType === 'mouse' ? 'mouse' : 'touch';

      const now = Date.now();

      // Check for center cell first (for position rejection)
      if (isCenterCell(e.clientX, e.clientY)) {
        // Check for double-tap on center
        if (lastCenterTapRef.current && now - lastCenterTapRef.current < DOUBLE_TAP_THRESHOLD_MS) {
          if (onCenterDoubleTap) {
            const capturedAtMs = performance.now();
            onCenterDoubleTap(inputMethod, capturedAtMs);
            animateCenterReject();
          }
          lastCenterTapRef.current = null;
        } else {
          lastCenterTapRef.current = now;
        }
        return;
      }

      const position = getPositionFromEvent(e.clientX, e.clientY);
      if (position === null || position === undefined) return;

      // Check for double-tap on position cell
      if (
        !mindfulTimingEnabled &&
        lastTapRef.current &&
        lastTapRef.current.position === position &&
        now - lastTapRef.current.time < DOUBLE_TAP_THRESHOLD_MS
      ) {
        const capturedAtMs = performance.now();
        onDoubleTap(position, inputMethod, capturedAtMs);
        lastTapRef.current = null;
        // Animate double-tap (neutral)
        animateTap(position);
        if (pointerType !== 'mouse') {
          haptic.impact('light');
        }
        return;
      }

      gestureRectRef.current = gridRef.current?.getBoundingClientRect() ?? null;
      const rect = getGestureRect();
      if (!rect) return;
      const relX = e.clientX - rect.left;
      const relY = e.clientY - rect.top;

      activePointerIdRef.current = e.pointerId;
      activePointerTypeRef.current = pointerType;

      // Pointer capture keeps the gesture stable on touch/pen when finger leaves the grid.
      if (pointerType !== 'mouse') {
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // Ignore: some browsers can throw if capture isn't available.
        }
      }

      const startedAtMs = performance.now();
      touchStartRef.current = {
        position,
        time: now,
        startedAtMs,
        exitHapticTriggered: false,
      };
      trailPointsRef.current = [{ x: relX, y: relY }];
      queueTrailRender();

      setDragHoverPos(position);

      // Animate start cell pulse - lightweight scale only
      const cell = cellRefs.current.get(position);
      if (cell) {
        gsap.set(cell, { scale: 1.05, opacity: 0.85 });
      }
    },
    [
      disabled,
      getPositionFromEvent,
      isCenterCell,
      mindfulTimingEnabled,
      onDoubleTap,
      onCenterDoubleTap,
      animateTap,
      animateCenterReject,
      getGestureRect,
      queueTrailRender,
      setDragHoverPos,
      haptic,
    ],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (disabled) return;

      const touchStart = touchStartRef.current;
      const activePointerId = activePointerIdRef.current;
      if (!touchStart || activePointerId === null || e.pointerId !== activePointerId) return;

      e.preventDefault();

      const hoverPos = getPositionFromEvent(e.clientX, e.clientY);
      if (hoverPos !== null) {
        const prev = dragHoverPosRef.current;
        setDragHoverPos(hoverPos);
        if (prev !== hoverPos) {
          if (activePointerTypeRef.current !== 'mouse') {
            if (mindfulTimingEnabled) {
              if (!touchStart.exitHapticTriggered && hoverPos !== touchStart.position) {
                touchStart.exitHapticTriggered = true;
                haptic.selectionChanged();
              }
            } else {
              haptic.selectionChanged();
            }
          }
        }
      }

      const rect = getGestureRect();
      if (!rect) return;

      const nativeEvent = e.nativeEvent;
      const coalesced = nativeEvent.getCoalescedEvents?.();
      // Android WebView/Chromium variants can expose getCoalescedEvents but return an empty array.
      const events = coalesced && coalesced.length > 0 ? coalesced : [nativeEvent];

      // Mutate ref to avoid allocations, batch render via rAF.
      const pts = trailPointsRef.current;
      for (const ce of events) {
        pts.push({ x: ce.clientX - rect.left, y: ce.clientY - rect.top });
      }
      if (pts.length > TRAIL_MAX_POINTS) {
        pts.splice(0, pts.length - TRAIL_MAX_POINTS);
      }
      queueTrailRender();
    },
    [
      disabled,
      getGestureRect,
      queueTrailRender,
      getPositionFromEvent,
      setDragHoverPos,
      haptic,
      mindfulTimingEnabled,
    ],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      const touchStart = touchStartRef.current;
      const activePointerId = activePointerIdRef.current;
      if (disabled || !touchStart || activePointerId === null || e.pointerId !== activePointerId) {
        return;
      }

      e.preventDefault();

      const pointerType = activePointerTypeRef.current ?? 'mouse';
      const inputMethod: 'mouse' | 'touch' = pointerType === 'mouse' ? 'mouse' : 'touch';

      const endPosition = getPositionFromEvent(e.clientX, e.clientY);
      const now = Date.now();

      // Reset start cell
      const startCell = cellRefs.current.get(touchStart.position);
      if (startCell) {
        gsap.set(startCell, { scale: 0.98, opacity: 1 });
      }

      setDragHoverPos(null);

      if (
        !mindfulTimingEnabled &&
        endPosition === touchStart.position &&
        now - touchStart.time < 200
      ) {
        lastTapRef.current = { position: touchStart.position, time: now };
      } else if (
        mindfulTimingEnabled &&
        endPosition === touchStart.position &&
        mindfulHoldEnabled &&
        onHold
      ) {
        const capturedAtMs = performance.now();
        const actionDurationMs = capturedAtMs - touchStart.startedAtMs;
        const timing = validateMindfulPositionAction(actionDurationMs);
        if (!timing) {
          pushPositionTimingFeedback({
            label: t('trace.feedback.holdDuration', 'Hold'),
            durationMs: actionDurationMs,
            accepted: false,
          });
          haptic.notification('error');
        } else {
          pushPositionTimingFeedback(null);
          onHold(touchStart.position, inputMethod, capturedAtMs, actionDurationMs);
        }
      } else if (endPosition !== null && endPosition !== touchStart.position) {
        // Valid swipe - animate and callback
        const capturedAtMs = performance.now();
        const actionDurationMs = mindfulTimingEnabled
          ? Math.max(0, capturedAtMs - touchStart.startedAtMs)
          : undefined;
        if (mindfulTimingEnabled && actionDurationMs !== undefined) {
          const timing = validateMindfulPositionAction(actionDurationMs);
          if (!timing) {
            pushPositionTimingFeedback({
              label: t('trace.feedback.gestureDuration', 'Gesture'),
              durationMs: actionDurationMs,
              accepted: false,
            });
            haptic.notification('error');
          } else {
            pushPositionTimingFeedback(null);
            onSwipe(touchStart.position, endPosition, inputMethod, capturedAtMs, actionDurationMs);
            queueSwipeEffect(touchStart.position, endPosition);
            if (pointerType !== 'mouse') {
              haptic.selectionChanged();
            }
          }
        } else {
          onSwipe(touchStart.position, endPosition, inputMethod, capturedAtMs, actionDurationMs);
          queueSwipeEffect(touchStart.position, endPosition);
          if (pointerType !== 'mouse') {
            haptic.impact('light');
          }
        }
      }

      touchStartRef.current = null;
      activePointerIdRef.current = null;
      activePointerTypeRef.current = null;
      gestureRectRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore.
      }

      if (prefersReducedMotion) {
        clearTrail();
      } else {
        fadeTrailOut(0.26);
      }
    },
    [
      disabled,
      getPositionFromEvent,
      mindfulHoldEnabled,
      mindfulTimingEnabled,
      pushPositionTimingFeedback,
      t,
      validateMindfulPositionAction,
      onHold,
      onSwipe,
      queueSwipeEffect,
      prefersReducedMotion,
      clearTrail,
      fadeTrailOut,
      setDragHoverPos,
      haptic,
    ],
  );

  const handlePointerCancel = useCallback(
    (e: React.PointerEvent) => {
      const activePointerId = activePointerIdRef.current;
      if (activePointerId === null || e.pointerId !== activePointerId) return;

      const touchStart = touchStartRef.current;
      if (touchStart) {
        const cell = cellRefs.current.get(touchStart.position);
        if (cell) {
          gsap.set(cell, { scale: 0.98, opacity: 1 });
        }
      }

      touchStartRef.current = null;
      activePointerIdRef.current = null;
      activePointerTypeRef.current = null;
      gestureRectRef.current = null;
      setDragHoverPos(null);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore.
      }

      if (prefersReducedMotion) {
        clearTrail();
      } else {
        fadeTrailOut(0.18);
      }
    },
    [prefersReducedMotion, clearTrail, fadeTrailOut, setDragHoverPos],
  );

  const handlePointerLeave = useCallback(
    (e: React.PointerEvent) => {
      if (activePointerTypeRef.current !== 'mouse') return;
      handlePointerCancel(e);
    },
    [handlePointerCancel],
  );

  // Cleanup running swipe effects when unmounting to avoid dangling animations.
  useEffect(() => {
    return () => {
      clearTrail();
      setDragHoverPos(null);
      if (swipeFxRafRef.current) {
        cancelAnimationFrame(swipeFxRafRef.current);
        swipeFxRafRef.current = 0;
      }
      gestureRectRef.current = null;
      activePointerIdRef.current = null;
      activePointerTypeRef.current = null;
      if (!svgRef.current) return;
      const nodes = svgRef.current.querySelectorAll('[data-swipe-fx="true"]');
      gsap.killTweensOf(Array.from(nodes));
      // biome-ignore lint/suspicious/useIterableCallbackReturn: forEach side-effect only
      nodes.forEach((node) => node.remove());
    };
  }, [clearTrail]);

  // Animate feedback when it changes (only for user actions, not timeouts)
  useEffect(() => {
    if (feedbackPosition !== null && feedbackType && feedbackFromUserAction) {
      animateImpact(feedbackPosition, feedbackType === 'correct');
      haptic.notification(feedbackType === 'correct' ? 'success' : 'error');
    }
  }, [feedbackPosition, feedbackType, feedbackFromUserAction, animateImpact, haptic]);

  const handwritingStrokeColor = useMemo(() => {
    if (stimulusColor) {
      return COLOR_VALUES[stimulusColor];
    }
    if (!visualStimulusColor || visualStimulusColor === 'black') {
      // "black" is theme-aware: dark ink in light theme, light ink in dark theme.
      return 'hsl(var(--foreground))';
    }
    return (
      VISUAL_COLOR_HEX[visualStimulusColor] ??
      wovenCssVar(visualStimulusColor) ??
      'hsl(var(--foreground))'
    );
  }, [stimulusColor, visualStimulusColor]);

  const digitFeedback =
    writingFeedbacks.find((feedback) => feedback.key === 'digits')?.status ?? null;
  const primaryWritingFeedback = audioFeedback ?? digitFeedback ?? writingFeedback;
  const fullSelectorSize = gridSize;
  const writingSurfaceWidth = Math.max(160, gridSize - 32);

  const hasAnyWritingDraft =
    strokes.length > 0 ||
    typedLetter.length > 0 ||
    typedDigit.length > 0 ||
    selectedColor !== null ||
    selectedShape !== null ||
    selectedEmotion !== null ||
    selectedWord !== null ||
    selectedTone !== null ||
    selectedDirection !== null;

  const clearWritingDraft = useCallback(() => {
    setStrokes([]);
    setClearTrigger((t) => t + 1);
    setTypedLetter('');
    setTypedDigit('');
    setSelectedColor(null);
    setSelectedShape(null);
    setSelectedEmotion(null);
    setSelectedWord(null);
    setSelectedTone(null);
    setSelectedDirection(null);
    writingActionStartTimeRef.current = null;
    startTimeRef.current = performance.now();
    if (writingInputMethod === 'keyboard') {
      requestAnimationFrame(() => focusPrimaryWritingInput());
    }
  }, [focusPrimaryWritingInput, writingInputMethod]);

  return (
    <div className={cn('relative aspect-square', className)}>
      {/* Full-grid writing overlay - appears when in writing mode */}
      {isWriting && (
        <div className="absolute inset-0 z-40 rounded-2xl border-2 border-dashed border-woven-focus bg-woven-surface flex flex-col items-center justify-center">
          {/* AUDIO step: handwriting or keyboard letter input */}
          {currentWritingStep === 'audio' &&
            (writingInputMethod === 'handwriting' ? (
              <DrawingCanvas
                width={writingSurfaceWidth}
                height={gridSize - 32}
                strokeColor={
                  primaryWritingFeedback
                    ? primaryWritingFeedback === 'correct'
                      ? cssVarHsl('--woven-correct', '#2D5A4A')
                      : cssVarHsl('--woven-incorrect', '#8B3A3A')
                    : handwritingStrokeColor
                }
                strokeWidth={8}
                inkEffect={false}
                onStrokeStart={handleWritingStrokeStart}
                onStrokeEnd={handleStrokeEnd}
                onTap={handleTap}
                clearTrigger={clearTrigger}
                disabled={isRecognizing || !!writingFeedback}
              />
            ) : (
              <div
                className="flex w-full max-w-[18rem] flex-col items-center gap-3"
                onPointerDown={() => {
                  if (writingActionStartTimeRef.current === null) {
                    markWritingInteractionStart();
                  }
                }}
              >
                <button
                  type="button"
                  className="relative h-28 w-full rounded-2xl border border-woven-border bg-woven-surface/60 p-0 text-left shadow-sm"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    focusPrimaryWritingInput();
                  }}
                  disabled={isRecognizing || !!writingFeedback}
                  aria-label={t('trace.keyboard.letterInput', 'Letter')}
                >
                  <div className="absolute left-6 right-6 top-[62%] h-px bg-woven-border/70" />
                  <div className="absolute left-1/2 top-[calc(62%+0.5rem)] -translate-x-1/2 text-woven-text-muted/80">
                    <Keyboard size={16} weight="regular" />
                  </div>
                  <div className="absolute inset-0 flex items-end justify-center pb-[34%]">
                    <span
                      className={cn(
                        'whitespace-pre font-mono text-[clamp(3.5rem,12vmin,6rem)] font-bold leading-none',
                        audioFeedback === 'correct'
                          ? 'text-woven-correct'
                          : audioFeedback === 'incorrect'
                            ? 'text-woven-incorrect'
                            : 'text-woven-text',
                      )}
                    >
                      {typedLetter || ' '}
                    </span>
                  </div>
                  <input
                    ref={typedLetterRef}
                    value={typedLetter}
                    onChange={(e) => {
                      const cleaned = e.target.value
                        .toUpperCase()
                        .replace(/[^A-Z]/g, '')
                        .slice(0, 1);
                      if (cleaned) {
                        markWritingInteractionStart();
                      }
                      setTypedLetter(cleaned);
                    }}
                    onKeyDown={handleKeyboardWritingKeyDown}
                    disabled={isRecognizing || !!writingFeedback}
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck={false}
                    inputMode="text"
                    maxLength={1}
                    className="absolute inset-0 h-full w-full opacity-0"
                    data-writing-field="letter"
                    tabIndex={-1}
                  />
                </button>
                <button
                  type="button"
                  onClick={handleWritingStepValidate}
                  disabled={isRecognizing || !!writingFeedback}
                  className="inline-flex h-11 items-center justify-center rounded-xl bg-woven-focus px-4 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {t('game.validate', 'Validate')}
                </button>
              </div>
            ))}

          {/* DIGITS step: handwriting or keyboard digit input */}
          {currentWritingStep === 'digits' &&
            (writingInputMethod === 'handwriting' ? (
              <DrawingCanvas
                width={writingSurfaceWidth}
                height={gridSize - 32}
                strokeColor={
                  primaryWritingFeedback
                    ? primaryWritingFeedback === 'correct'
                      ? cssVarHsl('--woven-correct', '#2D5A4A')
                      : cssVarHsl('--woven-incorrect', '#8B3A3A')
                    : handwritingStrokeColor
                }
                strokeWidth={8}
                inkEffect={false}
                onStrokeStart={handleWritingStrokeStart}
                onStrokeEnd={handleStrokeEnd}
                onTap={handleTap}
                clearTrigger={clearTrigger}
                disabled={isRecognizing || !!writingFeedback}
              />
            ) : (
              <div
                className="flex w-full max-w-[18rem] flex-col items-center gap-3"
                onPointerDown={() => {
                  if (writingActionStartTimeRef.current === null) {
                    markWritingInteractionStart();
                  }
                }}
              >
                <button
                  type="button"
                  className="relative h-28 w-full rounded-2xl border border-woven-border bg-woven-surface/60 p-0 text-left shadow-sm"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    typedDigitRef.current?.focus();
                  }}
                  disabled={isRecognizing || !!writingFeedback}
                  aria-label={t('trace.keyboard.numberInput', 'Number')}
                >
                  <div className="absolute left-6 right-6 top-[62%] h-px bg-woven-border/70" />
                  <div className="absolute left-1/2 top-[calc(62%+0.5rem)] -translate-x-1/2 text-woven-text-muted/80">
                    <Keyboard size={16} weight="regular" />
                  </div>
                  <div className="absolute inset-0 flex items-end justify-center pb-[34%]">
                    <span
                      className={cn(
                        'whitespace-pre font-mono text-[clamp(3.5rem,12vmin,6rem)] font-bold leading-none',
                        digitFeedback === 'correct'
                          ? 'text-woven-correct'
                          : digitFeedback === 'incorrect'
                            ? 'text-woven-incorrect'
                            : 'text-woven-text',
                      )}
                    >
                      {typedDigit || ' '}
                    </span>
                  </div>
                  <input
                    ref={typedDigitRef}
                    value={typedDigit}
                    onChange={(e) => {
                      const cleaned = e.target.value.replace(/[^0-9]/g, '').slice(0, 1);
                      if (cleaned) {
                        markWritingInteractionStart();
                      }
                      setTypedDigit(cleaned);
                    }}
                    onKeyDown={handleKeyboardWritingKeyDown}
                    disabled={isRecognizing || !!writingFeedback}
                    autoCorrect="off"
                    spellCheck={false}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={1}
                    className="absolute inset-0 h-full w-full opacity-0"
                    data-writing-field="digit"
                    tabIndex={-1}
                  />
                </button>
                <button
                  type="button"
                  onClick={handleWritingStepValidate}
                  disabled={isRecognizing || !!writingFeedback}
                  className="inline-flex h-11 items-center justify-center rounded-xl bg-woven-focus px-4 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {t('game.validate', 'Validate')}
                </button>
              </div>
            ))}

          {/* COLOR step: full-zone CircularSelector */}
          {currentWritingStep === 'color' && (
            <CircularSelector
              borderless
              items={COLOR_SELECTOR_ITEMS}
              selected={selectedColor}
              onSelect={(color) => {
                markWritingInteractionStart();
                setSelectedColor(color as Color);
                scheduleSelectorAdvance();
              }}
              onClear={() => setSelectedColor(null)}
              size={fullSelectorSize}
              disabled={isRecognizing || !!writingFeedback}
            />
          )}

          {/* IMAGE/SHAPES step: full-zone CircularSelector */}
          {currentWritingStep === 'image' && (
            <CircularSelector
              borderless
              items={SHAPE_SELECTOR_ITEMS}
              selected={selectedShape}
              onSelect={(shape) => {
                markWritingInteractionStart();
                setSelectedShape(shape);
                scheduleSelectorAdvance();
              }}
              onClear={() => setSelectedShape(null)}
              size={fullSelectorSize}
              disabled={isRecognizing || !!writingFeedback}
              renderItem={(item, _isSelected, size) => (
                <TraceStimulusShape
                  shape={item.id as ImageShape}
                  color="currentColor"
                  className={getSelectorShapeClass(size)}
                />
              )}
              renderCenter={(item, size) =>
                item ? (
                  <TraceStimulusShape
                    shape={item.id as ImageShape}
                    color="currentColor"
                    className={getSelectorShapeClass(size)}
                  />
                ) : null
              }
            />
          )}

          {/* EMOTIONS step */}
          {currentWritingStep === 'emotions' && (
            <CircularSelector
              borderless
              items={EMOTION_SELECTOR_ITEMS}
              selected={selectedEmotion}
              onSelect={(emotion) => {
                markWritingInteractionStart();
                setSelectedEmotion(emotion);
                scheduleSelectorAdvance();
              }}
              onClear={() => setSelectedEmotion(null)}
              size={fullSelectorSize}
              disabled={isRecognizing || !!writingFeedback}
              renderItem={(item, _isSelected, size) => (
                <TraceStimulusValueDisplay
                  value={item.id}
                  className={getSelectorValueClass(size)}
                />
              )}
              renderCenter={(item, size) =>
                item ? (
                  <TraceStimulusValueDisplay
                    value={item.id}
                    className={getSelectorValueClass(size)}
                  />
                ) : null
              }
            />
          )}

          {/* WORDS step */}
          {currentWritingStep === 'words' && (
            <CircularSelector
              borderless
              items={WORD_SELECTOR_ITEMS}
              selected={selectedWord}
              onSelect={(word) => {
                markWritingInteractionStart();
                setSelectedWord(word);
                scheduleSelectorAdvance();
              }}
              onClear={() => setSelectedWord(null)}
              size={fullSelectorSize}
              disabled={isRecognizing || !!writingFeedback}
              renderItem={(item, _isSelected, size) => (
                <TraceStimulusValueDisplay
                  value={item.id}
                  className={getSelectorValueClass(size)}
                />
              )}
              renderCenter={(item, size) =>
                item ? (
                  <TraceStimulusValueDisplay
                    value={item.id}
                    className={getSelectorValueClass(size)}
                  />
                ) : null
              }
            />
          )}

          {/* TONES step */}
          {currentWritingStep === 'tones' && (
            <CircularSelector
              borderless
              items={TONE_SELECTOR_ITEMS}
              selected={selectedTone}
              onSelect={(tone) => {
                markWritingInteractionStart();
                setSelectedTone(tone);
                scheduleSelectorAdvance();
              }}
              onClear={() => setSelectedTone(null)}
              size={fullSelectorSize}
              disabled={isRecognizing || !!writingFeedback}
              renderItem={(item, _isSelected, size) => (
                <TraceStimulusValueDisplay
                  value={item.id}
                  className={getSelectorValueClass(size)}
                />
              )}
              renderCenter={(item, size) =>
                item ? (
                  <TraceStimulusValueDisplay
                    value={item.id}
                    className={getSelectorValueClass(size)}
                  />
                ) : null
              }
            />
          )}

          {/* SPATIAL step */}
          {currentWritingStep === 'spatial' && (
            <CircularSelector
              borderless
              items={SPATIAL_SELECTOR_ITEMS}
              selected={selectedDirection}
              onSelect={(direction) => {
                markWritingInteractionStart();
                setSelectedDirection(direction);
                scheduleSelectorAdvance();
              }}
              onClear={() => setSelectedDirection(null)}
              size={fullSelectorSize}
              disabled={isRecognizing || !!writingFeedback}
              renderItem={(item, _isSelected, size) => (
                <TraceStimulusValueDisplay
                  value={item.id}
                  className={getSelectorValueClass(size)}
                />
              )}
              renderCenter={(item, size) =>
                item ? (
                  <TraceStimulusValueDisplay
                    value={item.id}
                    className={getSelectorValueClass(size)}
                  />
                ) : null
              }
            />
          )}

          {/* Step progress dots */}
          {writingSteps.length > 1 && (
            <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 gap-1.5">
              {writingSteps.map((_, i) => (
                <div
                  key={writingSteps[i]}
                  className={cn(
                    'h-2 w-2 rounded-full transition-colors',
                    i === modalityStepIdx
                      ? 'bg-woven-focus'
                      : i < modalityStepIdx
                        ? 'bg-woven-correct'
                        : 'bg-woven-border/40',
                  )}
                />
              ))}
            </div>
          )}

          {/* Eraser button */}
          {hasAnyWritingDraft && !isRecognizing && !writingFeedback && (
            <button
              type="button"
              onClick={clearWritingDraft}
              className="absolute right-3 top-3 z-50 flex h-10 w-10 items-center justify-center rounded-full border border-woven-border bg-woven-surface text-woven-text-muted shadow-md transition-colors hover:text-woven-text"
            >
              <Eraser size={20} />
            </button>
          )}

          {/* Feedback overlay */}
          {writingFeedbacks.length > 0 && (
            <div
              ref={writingOverlayFeedbackRef}
              className="pointer-events-none absolute inset-x-6 bottom-4 z-20 flex flex-wrap items-center justify-center gap-2"
            >
              {writingFeedbacks.map((feedback) => (
                <div
                  key={feedback.key}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white shadow-lg',
                    feedback.status === 'correct' ? 'bg-woven-correct' : 'bg-woven-incorrect',
                  )}
                >
                  <span>{feedback.status === 'correct' ? '\u2713' : '\u2717'}</span>
                  <span>{feedback.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Full-grid arithmetic overlay - appears when in arithmetic mode */}
      {isArithmetic && (
        <div className="absolute inset-0 z-40 flex items-center justify-center rounded-2xl bg-woven-surface border-2 border-dashed border-woven-focus">
          {isTwoStepArithmetic &&
          arithmeticSubphase === 'cue' &&
          (arithmeticProblem?.variant === 'color-cue-2step' ||
            arithmeticProblem?.variant === 'grid-cue-chain') ? (
            <div className="relative" style={{ width: gridSize - 32, height: gridSize - 32 }}>
              <div className="absolute inset-0 flex items-center justify-between px-10">
                <span
                  className={cn(
                    'font-mono font-bold leading-none text-[clamp(4.5rem,16vmin,9rem)]',
                    arithmeticProblem.cue.leftToken === 'V'
                      ? 'text-woven-correct'
                      : 'text-woven-text',
                  )}
                >
                  {arithmeticProblem.cue.leftDigit}
                </span>
                <span
                  className={cn(
                    'font-mono font-bold leading-none text-[clamp(4.5rem,16vmin,9rem)]',
                    arithmeticProblem.cue.rightToken === 'V'
                      ? 'text-woven-correct'
                      : 'text-woven-text',
                  )}
                >
                  {arithmeticProblem.cue.rightDigit}
                </span>
              </div>
              <div className="absolute bottom-3 left-0 right-0 text-center text-xs text-woven-text-muted">
                {t('trace.arithmetic.cueHint', 'Memorize the 2 digits')}
              </div>
            </div>
          ) : (
            <>
              {(arithmeticProblem?.variant === 'color-cue-2step' ||
                arithmeticProblem?.variant === 'grid-cue-chain') && (
                <div className="absolute top-3 left-3 right-3 z-50 flex items-center justify-center pointer-events-none">
                  <div className="px-3 py-1 rounded-lg bg-woven-surface/80 border border-woven-border text-woven-text text-xl font-mono font-bold backdrop-blur-sm">
                    {arithmeticProblem.expression} = ?
                  </div>
                </div>
              )}

              {arithmeticInputMethod === 'handwriting' ? (
                <DrawingCanvas
                  width={gridSize - 32}
                  height={gridSize - 32}
                  strokeColor={
                    arithmeticFeedback
                      ? arithmeticFeedback === 'correct'
                        ? cssVarHsl('--woven-correct', '#2D5A4A')
                        : cssVarHsl('--woven-incorrect', '#8B3A3A')
                      : handwritingStrokeColor
                  }
                  strokeWidth={8}
                  inkEffect={false}
                  onStrokeEnd={handleArithmeticStrokeEnd}
                  onTap={handleArithmeticTap}
                  clearTrigger={arithmeticClearTrigger}
                  disabled={isArithmeticRecognizing || !!arithmeticFeedback}
                />
              ) : (
                <button
                  type="button"
                  className="relative bg-transparent p-0 border-0"
                  style={{ width: gridSize - 32, height: gridSize - 32 }}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    typedNumberRef.current?.focus();
                  }}
                  disabled={isArithmeticRecognizing || !!arithmeticFeedback}
                  aria-label={t('trace.keyboard.numberInput', 'Number')}
                >
                  {/* Baseline */}
                  <div className="absolute left-8 right-8 top-[62%] h-px bg-woven-border/70" />

                  {/* Keyboard icon under baseline */}
                  <div className="absolute left-1/2 top-[calc(62%+0.75rem)] -translate-x-1/2 text-woven-text-muted/80">
                    <Keyboard size={16} weight="regular" />
                  </div>

                  {/* Number display */}
                  <div className="absolute inset-0 flex items-end justify-center pb-[38%]">
                    <span
                      className={cn(
                        'whitespace-pre font-mono font-bold leading-none text-[clamp(4.5rem,16vmin,9rem)]',
                        arithmeticFeedback === 'correct'
                          ? 'text-woven-correct'
                          : arithmeticFeedback === 'incorrect'
                            ? 'text-woven-incorrect'
                            : 'text-woven-text',
                      )}
                    >
                      {typedNumber || ' '}
                    </span>
                  </div>

                  {/* Hidden input */}
                  <input
                    ref={typedNumberRef}
                    value={typedNumber}
                    onChange={(e) => {
                      const cleaned = e.target.value.replace(/[^0-9]/g, '').slice(0, 4);
                      setTypedNumber(cleaned);
                    }}
                    onKeyDown={handleKeyboardArithmeticKeyDown}
                    disabled={isArithmeticRecognizing || !!arithmeticFeedback}
                    autoCorrect="off"
                    spellCheck={false}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    className="absolute inset-0 w-full h-full opacity-0"
                    tabIndex={-1}
                  />
                </button>
              )}
            </>
          )}
          {/* Feedback badge - center */}
          {arithmeticFeedback && (
            <div
              ref={arithmeticFeedbackRef}
              className={cn(
                'absolute z-20 w-14 h-14 flex items-center justify-center rounded-full shadow-lg',
                arithmeticFeedback === 'correct' && 'bg-woven-correct',
                arithmeticFeedback === 'incorrect' && 'bg-woven-incorrect',
              )}
            >
              <span className="text-2xl text-white font-bold">
                {arithmeticFeedback === 'correct' ? '✓' : '✗'}
              </span>
            </div>
          )}
          {/* Eraser button - top right */}
          {((arithmeticInputMethod === 'handwriting' && arithmeticStrokes.length > 0) ||
            (arithmeticInputMethod === 'keyboard' && typedNumber.length > 0)) &&
            !isArithmeticRecognizing &&
            !arithmeticFeedback && (
              <button
                type="button"
                onClick={() => {
                  if (arithmeticInputMethod === 'handwriting') {
                    handleArithmeticErase();
                  } else {
                    setTypedNumber('');
                    typedNumberRef.current?.focus();
                  }
                }}
                className="absolute top-3 right-3 w-10 h-10 flex items-center justify-center rounded-full bg-woven-surface border border-woven-border text-woven-text-muted hover:text-woven-text transition-colors shadow-md"
              >
                <Eraser size={20} />
              </button>
            )}
          {/* Hint text + refresh button (2-step variant) */}
          {!(isTwoStepArithmetic && arithmeticSubphase === 'cue') && (
            <div className="absolute bottom-3 left-3 right-3 z-50 flex items-center justify-between gap-3">
              {(arithmeticProblem?.variant === 'color-cue-2step' ||
                arithmeticProblem?.variant === 'grid-cue-chain') &&
                onArithmeticRefresh && (
                  <button
                    type="button"
                    onClick={() => onArithmeticRefresh()}
                    className="shrink-0 px-3 py-2 rounded-lg bg-woven-surface border border-woven-border text-woven-text text-xs font-medium hover:bg-woven-cell-rest transition-colors"
                  >
                    {t('trace.arithmetic.refresh', 'New')}
                  </button>
                )}
              <div className="flex-1 text-center text-xs text-woven-text-muted">
                {arithmeticInputMethod === 'handwriting'
                  ? t('trace.hint.writeResult', 'Write the result • Tap to validate')
                  : t('trace.hint.typeResult', 'Type the result • Enter to validate')}
              </div>
              {(arithmeticProblem?.variant === 'color-cue-2step' ||
                arithmeticProblem?.variant === 'grid-cue-chain') &&
                onArithmeticRefresh && <div className="shrink-0 w-[72px]" aria-hidden="true" />}
            </div>
          )}
        </div>
      )}

      {/* SVG overlay for trails and effects */}
      <svg
        ref={svgRef}
        className="absolute inset-0 pointer-events-none z-30"
        style={{ width: '100%', height: '100%' }}
        aria-hidden="true"
      >
        {/* No SVG filters - they cause severe perf issues on low-end devices */}

        {/* Active trail during swipe - layered ink style */}
        <path
          ref={trailShadowRef}
          fill="none"
          stroke="hsl(var(--woven-text))"
          strokeWidth="12"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.14"
          style={{ display: 'none' }}
        />
        <path
          ref={trailRef}
          fill="none"
          stroke="hsl(var(--woven-text))"
          strokeWidth="7.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.94"
          style={{ display: 'none' }}
        />
        <path
          ref={trailHighlightRef}
          fill="none"
          stroke="hsl(var(--woven-text))"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.55"
          style={{ display: 'none' }}
        />
        <circle
          ref={trailHeadOuterRef}
          r="3"
          fill="hsl(var(--woven-text))"
          opacity="0.92"
          style={{ display: 'none' }}
        />
        <circle
          ref={trailHeadInnerRef}
          r="1.3"
          fill="hsl(var(--woven-text))"
          opacity="0.35"
          style={{ display: 'none' }}
        />
      </svg>

      {/* Grid - Classic style uses actual Grid component from ui package */}
      {gridStyle === 'classic' ? (
        <div
          ref={gridRef}
          role="application"
          aria-label={t('aria.traceGrid', 'Trace grid')}
          className="relative touch-none select-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onPointerLeave={handlePointerLeave}
          onLostPointerCapture={handlePointerCancel}
        >
          {/* Actual Grid component from @neurodual/ui */}
          <Grid
            activePosition={showStimulus ? activePosition : null}
            showStimulus={showStimulus}
            // Color modality takes priority, otherwise use visual settings color
            color={stimulusColor ?? visualStimulusColor}
            stimulusStyle={visualStimulusStyle}
            customImageUrl={customImageUrl}
            stringArtPoints={stringArtPoints}
            activeStimulusText={activeStimulusText}
            activeStimulusShape={activeStimulusShape}
            hideCross={isWriting || isArithmetic}
            className="w-full"
          />

          {/* Feedback overlay - transparent layer with feedback indicators */}
          <div className={`absolute inset-0 pointer-events-none z-10 grid ${gridClass}`}>
            {effectiveGridMap.map((logicPos, index) => {
              if (logicPos === null) {
                // Center cell - show audio feedback badge (color feedback is in preview circle)
                return (
                  <div key="center" className="relative flex items-center justify-center">
                    {audioFeedback && (
                      <div
                        ref={feedbackRef}
                        className={cn(
                          'absolute z-20 w-10 h-10 flex items-center justify-center rounded-full shadow-lg',
                          audioFeedback === 'correct' && 'bg-woven-correct',
                          audioFeedback === 'incorrect' && 'bg-woven-incorrect',
                        )}
                      >
                        <span className="text-lg text-white font-bold">
                          {audioFeedback === 'correct' ? '✓' : '✗'}
                        </span>
                      </div>
                    )}
                  </div>
                );
              }

              const isFeedback = feedbackPosition === logicPos;
              const isSwipeFrom = swipeFeedbackFrom === logicPos;
              const isSwipeTo = swipeFeedbackTo === logicPos;

              // Sequential step feedback: per-cell correctness across ALL step endpoints.
              const seqCellCorrect = sequentialCellFeedback?.get(logicPos);
              const isSeqFeedback = seqCellCorrect !== undefined;

              // Visited cells: greyed out during sequential response
              const isVisited = visitedCells?.includes(logicPos) ?? false;

              // Only render overlay when there's feedback to show
              const showFeedbackOverlay =
                isSwipeFrom ||
                isSwipeTo ||
                (isFeedback && feedbackType && feedbackFromUserAction) ||
                isSeqFeedback ||
                isVisited;

              if (!showFeedbackOverlay) {
                return <div key={`cell-${index}`} />;
              }

              // Determine feedback color
              let feedbackBg = '';
              let feedbackStyle: React.CSSProperties | undefined;
              if (isSeqFeedback) {
                feedbackBg = seqCellCorrect ? 'bg-woven-correct' : 'bg-woven-incorrect';
              } else if (isSwipeFrom) {
                feedbackBg = swipeFeedbackFromCorrect ? 'bg-woven-correct' : 'bg-woven-incorrect';
              } else if (isSwipeTo) {
                feedbackBg = swipeFeedbackToCorrect ? 'bg-woven-correct' : 'bg-woven-incorrect';
              } else if (isFeedback) {
                feedbackBg = feedbackType === 'correct' ? 'bg-woven-correct' : 'bg-woven-incorrect';
              } else if (isVisited) {
                // While sweeping (response phase), keep visited cells strongly selected (black ink).
                // Use theme-aware "text" color so it remains visible in dark mode too.
                feedbackBg = 'bg-woven-text';
              }

              return (
                <div
                  key={`cell-${index}`}
                  ref={(el) => {
                    if (el) cellRefs.current.set(logicPos, el);
                  }}
                  className={cn(
                    'relative flex items-center justify-center',
                    !feedbackStyle && feedbackBg,
                    'animate-in fade-in duration-150',
                  )}
                  style={feedbackStyle}
                >
                  {/* Swipe feedback numbers */}
                  {isSwipeFrom && (
                    <span className="text-2xl font-bold text-white drop-shadow-md">2</span>
                  )}
                  {isSwipeTo && (
                    <span className="text-2xl font-bold text-white drop-shadow-md">1</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Trace style - custom grid with rounded cells and canvas texture */
        <div
          ref={gridRef}
          role="application"
          aria-label={t('aria.traceGrid')}
          className={`relative grid ${gridClass} aspect-square overflow-hidden touch-none select-none bg-woven-surface/85 backdrop-blur-xl border border-woven-border/80 gap-3 p-4 rounded-2xl shadow-[0_4px_20px_-4px_hsl(var(--woven-border)/0.4)]`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onPointerLeave={handlePointerLeave}
          onLostPointerCapture={handlePointerCancel}
        >
          {/* Canvas weave texture - lowered opacity for subtler background */}
          <CanvasWeave opacity={0.15} className="stroke-neutral-400" />

          {effectiveGridMap.map((logicPos, index) => {
            if (logicPos === null) {
              // Center cell - focus line and feedback badge
              return (
                <div
                  key="center"
                  ref={centerCellRef}
                  className="relative flex items-center justify-center z-10 overflow-hidden rounded-xl"
                >
                  {/* Feedback badge - small circle with symbol (audio only) */}
                  {audioFeedback && (
                    <div
                      ref={feedbackRef}
                      className={cn(
                        'absolute z-20 w-10 h-10 flex items-center justify-center rounded-full shadow-lg',
                        audioFeedback === 'correct' && 'bg-woven-correct',
                        audioFeedback === 'incorrect' && 'bg-woven-incorrect',
                      )}
                    >
                      <span className="text-lg text-white font-bold">
                        {audioFeedback === 'correct' ? '✓' : '✗'}
                      </span>
                    </div>
                  )}

                  {/* Focus line */}
                  <div className="w-6 h-0.5 rounded-sm bg-woven-focus" />
                </div>
              );
            }

            const isActive = showStimulus && activePosition === logicPos;
            const isFeedback = feedbackPosition === logicPos;
            const isSwipeFrom = swipeFeedbackFrom === logicPos;
            const isSwipeTo = swipeFeedbackTo === logicPos;
            const hasSwipeFeedback = isSwipeFrom || isSwipeTo;

            // Sequential step feedback: per-cell correctness across ALL step endpoints.
            const seqCellCorrect = sequentialCellFeedback?.get(logicPos);
            const isSeqFeedback = seqCellCorrect !== undefined;
            const isVisited = visitedCells?.includes(logicPos) ?? false;

            // Determine cell background based on feedback
            let cellBg = 'bg-woven-cell-rest';
            let cellStyle: React.CSSProperties | undefined;

            // Determine stimulus style rendering
            const effectiveStyle = visualStimulusStyle || 'full';
            const effectiveColor = stimulusColor
              ? COLOR_VALUES[stimulusColor]
              : visualStimulusColor;
            const hasActiveStimulusVisual = isActive && (activeStimulusText || activeStimulusShape);

            if (isActive && effectiveStyle === 'full' && !hasActiveStimulusVisual) {
              // Full style - solid background color
              if (stimulusColor) {
                cellStyle = { backgroundColor: COLOR_VALUES[stimulusColor] };
              } else if (visualStimulusColor && visualStimulusColor !== 'black') {
                const hex =
                  VISUAL_COLOR_HEX[visualStimulusColor] ?? wovenCssVar(visualStimulusColor);
                if (hex) {
                  cellStyle = { backgroundColor: hex };
                } else {
                  cellBg = 'bg-woven-cell-active';
                }
              } else {
                cellBg = 'bg-woven-cell-active';
              }
            } else if (isSeqFeedback) {
              cellBg = seqCellCorrect ? 'bg-woven-correct' : 'bg-woven-incorrect';
            } else if (isSwipeFrom) {
              cellBg = swipeFeedbackFromCorrect ? 'bg-woven-correct' : 'bg-woven-incorrect';
            } else if (isSwipeTo) {
              cellBg = swipeFeedbackToCorrect ? 'bg-woven-correct' : 'bg-woven-incorrect';
            } else if (isFeedback && feedbackType === 'correct') {
              cellBg = 'bg-woven-correct';
            } else if (isFeedback && feedbackType === 'incorrect') {
              cellBg = 'bg-woven-incorrect';
            } else if (isVisited) {
              // While sweeping (response phase), keep visited cells strongly selected (black ink).
              // Use theme-aware "text" color so it remains visible in dark mode too.
              cellBg = 'bg-woven-text';
            }

            return (
              <div
                key={`cell-${index}`}
                ref={(el) => {
                  if (el) cellRefs.current.set(logicPos, el);
                }}
                data-position={logicPos}
                className={cn(
                  'relative z-10 transition-[transform,background-color,opacity] duration-150 flex items-center justify-center rounded-xl border border-woven-border overflow-hidden',
                  isActive && 'scale-100 shadow-lg',
                  !isActive &&
                    !hasSwipeFeedback &&
                    !isFeedback &&
                    !isSeqFeedback &&
                    !isVisited &&
                    'scale-[0.98]',
                  !cellStyle && cellBg,
                )}
                style={cellStyle}
              >
                {/* Visual stimulus styles (dots, stringart, custom) */}
                {!hasActiveStimulusVisual && isActive && effectiveStyle === 'dots' && (
                  <NineDotsPattern color={effectiveColor} />
                )}
                {!hasActiveStimulusVisual && isActive && effectiveStyle === 'stringart' && (
                  <div className="absolute inset-1 flex items-center justify-center">
                    <StringArtPlus
                      size="full"
                      numPoints={stringArtPoints}
                      className={cn(
                        'w-full h-full',
                        effectiveColor && TEXT_COLOR_CLASSES[effectiveColor]
                          ? TEXT_COLOR_CLASSES[effectiveColor]
                          : 'text-woven-cell-active',
                      )}
                    />
                  </div>
                )}
                {!hasActiveStimulusVisual &&
                  isActive &&
                  effectiveStyle === 'custom' &&
                  customImageUrl && (
                    <img
                      src={customImageUrl}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  )}
                {isActive && activeStimulusShape && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
                    <TraceStimulusShape
                      shape={activeStimulusShape}
                      color={effectiveColor ?? 'hsl(var(--foreground))'}
                    />
                  </div>
                )}
                {isActive && activeStimulusText && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
                    <TraceStimulusValueDisplay
                      value={activeStimulusText}
                      color={effectiveColor ?? undefined}
                    />
                  </div>
                )}

                {/* Swipe feedback number - chronological order: 1=N-back (first), 2=current (second) */}
                {isSwipeFrom && (
                  <span className="text-2xl font-bold text-white drop-shadow-md">2</span>
                )}
                {isSwipeTo && (
                  <span className="text-2xl font-bold text-white drop-shadow-md">1</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pause overlay - blur with resume button (like main Grid) */}
      {paused && (
        <div className="absolute inset-0 z-50 bg-woven-bg/40 rounded-2xl flex items-center justify-center">
          <button
            type="button"
            onClick={onResume}
            className="w-16 h-16 rounded-full bg-amber-500 hover:bg-amber-400 flex items-center justify-center transition-[transform,background-color] hover:scale-105 active:scale-95"
          >
            <svg
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-8 h-8 text-white ml-1"
              role="img"
              aria-label={t('aria.resume', 'Resume')}
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
});
