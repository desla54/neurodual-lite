import type { TraceModality, TraceTrial } from '../types/trace';
import type { Color, Sound } from '../types/core';
import {
  COLORS,
  SOUNDS,
  IMAGE_MODALITY_SHAPES,
  DIGIT_VALUES,
  EMOTION_VALUES,
  WORD_VALUES,
  TONE_VALUES,
  SPATIAL_DIRECTIONS,
} from '../domain';

export interface TraceTrialGenerationRandom {
  random: () => number;
}

/**
 * Generate active modalities for a trial based on dynamic rules.
 *
 * Distribution:
 * - 2 modalities: 80% both, 10% first only, 10% second only
 * - 3 modalities: 10% all, 80% random pair, 10% random single
 *
 * When dynamic rules are disabled, all enabled modalities are always active.
 */
export function generateTraceActiveModalities(
  enabledModalities: readonly TraceModality[],
  dynamicRules: boolean,
  random: TraceTrialGenerationRandom,
): readonly TraceModality[] {
  if (!dynamicRules) return enabledModalities;

  // Need at least 2 modalities for dynamic rules to make sense
  if (enabledModalities.length < 2) return enabledModalities;

  const roll = random.random();

  if (enabledModalities.length === 2) {
    if (roll < 0.1) return [enabledModalities[0] as TraceModality];
    if (roll < 0.2) return [enabledModalities[1] as TraceModality];
    return enabledModalities;
  }

  // 3 modalities: 10% all, 80% pairs, 10% single
  if (roll < 0.1) {
    return enabledModalities;
  }
  if (roll < 0.9) {
    const pairs: TraceModality[][] = [
      [enabledModalities[0] as TraceModality, enabledModalities[1] as TraceModality],
      [enabledModalities[0] as TraceModality, enabledModalities[2] as TraceModality],
      [enabledModalities[1] as TraceModality, enabledModalities[2] as TraceModality],
    ];
    const pairIndex = Math.floor(random.random() * 3);
    return pairs[pairIndex] as TraceModality[];
  }

  const singleIndex = Math.floor(random.random() * enabledModalities.length);
  return [enabledModalities[singleIndex] as TraceModality];
}

export interface GenerateTraceTrialsOptions {
  readonly trialsCount: number;
  readonly enabledModalities: readonly TraceModality[];
  readonly dynamicRules: boolean;
  readonly dynamicSwipeDirection: boolean;
  readonly random: TraceTrialGenerationRandom;
  readonly numPositions: number;
  readonly mirrorAxisSetting?: 'horizontal' | 'vertical' | 'dynamic';
}

/**
 * Generate trials for Dual Trace sessions.
 *
 * This is intentionally pure + deterministic with the provided random source.
 * It lives in logic to keep the web page spec-driven and to enable unit tests.
 */
export function generateTraceTrials(options: GenerateTraceTrialsOptions): TraceTrial[] {
  const {
    trialsCount,
    enabledModalities,
    dynamicRules,
    dynamicSwipeDirection,
    random,
    numPositions,
    mirrorAxisSetting,
  } = options;

  const trials: TraceTrial[] = [];
  const useDynamicSwipeDirection = dynamicSwipeDirection && enabledModalities.includes('position');

  const hasImage = enabledModalities.includes('image');
  const hasDigits = enabledModalities.includes('digits');
  const hasEmotions = enabledModalities.includes('emotions');
  const hasWords = enabledModalities.includes('words');
  const hasTones = enabledModalities.includes('tones');
  const hasSpatial = enabledModalities.includes('spatial');

  for (let i = 0; i < trialsCount; i++) {
    const position = Math.floor(random.random() * numPositions);
    const soundIndex = Math.floor(random.random() * SOUNDS.length);
    const sound = SOUNDS[soundIndex] as Sound;
    const colorIndex = Math.floor(random.random() * COLORS.length);
    const color = COLORS[colorIndex] as Color;

    const activeModalities = generateTraceActiveModalities(enabledModalities, dynamicRules, random);

    const swipeDirection =
      useDynamicSwipeDirection &&
      // Spec: dynamic swipe direction ONLY applies when position is the only active modality.
      activeModalities.length === 1 &&
      activeModalities[0] === 'position'
        ? random.random() < 0.5
          ? ('n-to-target' as const)
          : ('target-to-n' as const)
        : undefined;

    const mirrorAxis =
      mirrorAxisSetting === 'dynamic'
        ? random.random() < 0.5
          ? ('horizontal' as const)
          : ('vertical' as const)
        : undefined;

    const trial: TraceTrial = {
      position,
      sound,
      color,
      activeModalities,
      swipeDirection,
      mirrorAxis,
      ...(hasImage && {
        image: IMAGE_MODALITY_SHAPES[Math.floor(random.random() * IMAGE_MODALITY_SHAPES.length)],
      }),
      ...(hasDigits && {
        digit: DIGIT_VALUES[Math.floor(random.random() * DIGIT_VALUES.length)],
      }),
      ...(hasEmotions && {
        emotion: EMOTION_VALUES[Math.floor(random.random() * EMOTION_VALUES.length)],
      }),
      ...(hasWords && {
        word: WORD_VALUES[Math.floor(random.random() * WORD_VALUES.length)],
      }),
      ...(hasTones && {
        tone: TONE_VALUES[Math.floor(random.random() * TONE_VALUES.length)],
      }),
      ...(hasSpatial && {
        spatialDirection:
          SPATIAL_DIRECTIONS[Math.floor(random.random() * SPATIAL_DIRECTIONS.length)],
      }),
    };

    trials.push(trial);
  }

  return trials;
}
