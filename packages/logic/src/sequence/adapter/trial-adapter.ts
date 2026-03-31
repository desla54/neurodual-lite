/**
 * TrialAdapter - Adapte le nouveau moteur de séquence à l'ancien format Trial
 *
 * Convertit les GeneratedTrial du SequenceEngine vers le format Trial existant
 * utilisé par GameSession et le reste de l'application.
 */

import type {
  Color,
  DigitValue,
  EmotionValue,
  ImageShape,
  LureType,
  Position,
  SpatialDirection,
  Sound,
  ToneValue,
  Trial,
  TrialType,
  WordValue,
} from '../../types/core';
import {
  COLORS,
  EMOTION_VALUES,
  SOUNDS,
  SPATIAL_DIRECTIONS,
  TONE_VALUES,
  WORD_VALUES,
} from '../../types/core';
import { DIGIT_VALUES, IMAGE_MODALITY_SHAPES } from '../../specs/thresholds';
import type { GeneratedTrial, ModalityValue, SequenceSpec } from '../types';

// =============================================================================
// Type Mapping
// =============================================================================

/**
 * Convertit une valeur de position (0-8) en Position type-safe.
 */
function toPosition(value: number | string): Position {
  const pos = typeof value === 'number' ? value : parseInt(value, 10);
  if (pos < 0 || pos > 7) {
    // Fallback si la valeur est hors limites
    return (pos % 8) as Position;
  }
  return pos as Position;
}

/**
 * Convertit une valeur audio en Sound type-safe.
 */
function toSound(value: number | string): Sound {
  if (typeof value === 'string') {
    if (SOUNDS.includes(value as Sound)) {
      return value as Sound;
    }
    // Fallback si la valeur n'est pas valide
    return SOUNDS[0];
  }
  // Si c'est un nombre, utiliser comme index
  return SOUNDS[value % SOUNDS.length] as Sound;
}

/**
 * Convertit une valeur de couleur en Color type-safe.
 */
function toColor(value: number | string): Color {
  if (typeof value === 'string') {
    if (COLORS.includes(value as Color)) {
      return value as Color;
    }
    return COLORS[0];
  }
  return COLORS[value % COLORS.length] as Color;
}

/**
 * Convertit une valeur d'image en ImageShape type-safe.
 */
function toImage(value: number | string): ImageShape {
  if (typeof value === 'string') {
    if ((IMAGE_MODALITY_SHAPES as readonly string[]).includes(value)) {
      return value as ImageShape;
    }
    return IMAGE_MODALITY_SHAPES[0];
  }
  return IMAGE_MODALITY_SHAPES[value % IMAGE_MODALITY_SHAPES.length] as ImageShape;
}

function toSpatial(value: number | string): SpatialDirection {
  if (typeof value === 'string' && SPATIAL_DIRECTIONS.includes(value as SpatialDirection)) {
    return value as SpatialDirection;
  }
  const index = typeof value === 'number' ? value : Number.parseInt(value, 10);
  return SPATIAL_DIRECTIONS[Math.abs(index) % SPATIAL_DIRECTIONS.length] as SpatialDirection;
}

function toDigit(value: number | string): DigitValue {
  const digit = typeof value === 'number' ? value : Number.parseInt(value, 10);
  if (DIGIT_VALUES.includes(digit as DigitValue)) {
    return digit as DigitValue;
  }
  return DIGIT_VALUES[Math.abs(digit) % DIGIT_VALUES.length] as DigitValue;
}

function toEmotion(value: number | string): EmotionValue {
  if (typeof value === 'string' && EMOTION_VALUES.includes(value as EmotionValue)) {
    return value as EmotionValue;
  }
  const index = typeof value === 'number' ? value : Number.parseInt(value, 10);
  return EMOTION_VALUES[Math.abs(index) % EMOTION_VALUES.length] as EmotionValue;
}

function toWord(value: number | string): WordValue {
  if (typeof value === 'string' && WORD_VALUES.includes(value as WordValue)) {
    return value as WordValue;
  }
  const index = typeof value === 'number' ? value : Number.parseInt(value, 10);
  return WORD_VALUES[Math.abs(index) % WORD_VALUES.length] as WordValue;
}

function toTone(value: number | string): ToneValue {
  if (typeof value === 'string' && TONE_VALUES.includes(value as ToneValue)) {
    return value as ToneValue;
  }
  const index = typeof value === 'number' ? value : Number.parseInt(value, 10);
  return TONE_VALUES[Math.abs(index) % TONE_VALUES.length] as ToneValue;
}

// =============================================================================
// Trial Type Determination
// =============================================================================

/**
 * Détermine le TrialType basé sur les intentions des modalités.
 */
function determineTrialType(
  generated: GeneratedTrial,
  _spec: SequenceSpec,
  isBuffer: boolean,
): TrialType {
  if (isBuffer) {
    return 'Tampon';
  }

  const audioValue = generated.values['audio'];
  const tonesValue = generated.values['tones'];
  const visualTargets = [
    generated.values['position'],
    generated.values['color'],
    generated.values['image'],
    generated.values['spatial'],
    generated.values['digits'],
    generated.values['emotions'],
    generated.values['words'],
  ];

  const isVisualTarget = visualTargets.some((value) => value?.intention === 'target');
  const isAudioTarget = audioValue?.intention === 'target' || tonesValue?.intention === 'target';

  if (isVisualTarget && isAudioTarget) {
    return 'Dual';
  }
  if (isVisualTarget) {
    return 'V-Seul';
  }
  if (isAudioTarget) {
    return 'A-Seul';
  }
  return 'Non-Cible';
}

/**
 * Extrait le LureType d'une intention.
 */
function extractLureType(intention: ModalityValue['intention']): LureType | undefined {
  if (intention === 'lure-n-1') return 'n-1';
  if (intention === 'lure-n+1') return 'n+1';
  return undefined;
}

// =============================================================================
// Main Adapter
// =============================================================================

/**
 * Convertit un GeneratedTrial en Trial.
 */
export function toTrial(generated: GeneratedTrial, spec: SequenceSpec): Trial {
  const isBuffer = generated.index < spec.nLevel;

  const positionValue = generated.values['position'];
  const audioValue = generated.values['audio'];
  const colorValue = generated.values['color'];
  const imageValue = generated.values['image'];
  const spatialValue = generated.values['spatial'];
  const digitsValue = generated.values['digits'];
  const emotionsValue = generated.values['emotions'];
  const wordsValue = generated.values['words'];
  const tonesValue = generated.values['tones'];

  // Valeurs par défaut si la modalité n'existe pas
  const position = positionValue ? toPosition(positionValue.value) : 0;
  const sound = audioValue ? toSound(audioValue.value) : SOUNDS[0];
  const color = colorValue ? toColor(colorValue.value) : COLORS[0];
  const image = imageValue ? toImage(imageValue.value) : IMAGE_MODALITY_SHAPES[0];
  const spatial = spatialValue ? toSpatial(spatialValue.value) : undefined;
  const digits = digitsValue ? toDigit(digitsValue.value) : undefined;
  const emotions = emotionsValue ? toEmotion(emotionsValue.value) : undefined;
  const words = wordsValue ? toWord(wordsValue.value) : undefined;
  const tones = tonesValue ? toTone(tonesValue.value) : undefined;

  // Détermination des flags target
  const isPositionTarget = positionValue?.intention === 'target';
  const isSoundTarget = audioValue?.intention === 'target';
  const isColorTarget = colorValue?.intention === 'target';
  const isImageTarget = imageValue?.intention === 'target';
  const isSpatialTarget = spatialValue?.intention === 'target';
  const isDigitsTarget = digitsValue?.intention === 'target';
  const isEmotionsTarget = emotionsValue?.intention === 'target';
  const isWordsTarget = wordsValue?.intention === 'target';
  const isTonesTarget = tonesValue?.intention === 'target';

  // Détermination des flags lure
  const isPositionLure =
    positionValue?.intention === 'lure-n-1' || positionValue?.intention === 'lure-n+1';
  const isSoundLure = audioValue?.intention === 'lure-n-1' || audioValue?.intention === 'lure-n+1';
  const isColorLure = colorValue?.intention === 'lure-n-1' || colorValue?.intention === 'lure-n+1';
  const isImageLure = imageValue?.intention === 'lure-n-1' || imageValue?.intention === 'lure-n+1';
  const isSpatialLure =
    spatialValue?.intention === 'lure-n-1' || spatialValue?.intention === 'lure-n+1';
  const isDigitsLure =
    digitsValue?.intention === 'lure-n-1' || digitsValue?.intention === 'lure-n+1';
  const isEmotionsLure =
    emotionsValue?.intention === 'lure-n-1' || emotionsValue?.intention === 'lure-n+1';
  const isWordsLure = wordsValue?.intention === 'lure-n-1' || wordsValue?.intention === 'lure-n+1';
  const isTonesLure = tonesValue?.intention === 'lure-n-1' || tonesValue?.intention === 'lure-n+1';

  return {
    index: generated.index,
    isBuffer,
    position,
    sound,
    color,
    image,
    ...(spatial !== undefined && { spatial }),
    ...(digits !== undefined && { digits }),
    ...(emotions !== undefined && { emotions }),
    ...(words !== undefined && { words }),
    ...(tones !== undefined && { tones }),
    trialType: determineTrialType(generated, spec, isBuffer),
    isPositionTarget,
    isSoundTarget,
    isColorTarget,
    isImageTarget,
    ...(isSpatialTarget !== undefined && { isSpatialTarget }),
    ...(isDigitsTarget !== undefined && { isDigitsTarget }),
    ...(isEmotionsTarget !== undefined && { isEmotionsTarget }),
    ...(isWordsTarget !== undefined && { isWordsTarget }),
    ...(isTonesTarget !== undefined && { isTonesTarget }),
    isPositionLure,
    isSoundLure,
    isColorLure: colorValue ? isColorLure : undefined,
    isImageLure: imageValue ? isImageLure : undefined,
    ...(spatialValue && { isSpatialLure }),
    ...(digitsValue && { isDigitsLure }),
    ...(emotionsValue && { isEmotionsLure }),
    ...(wordsValue && { isWordsLure }),
    ...(tonesValue && { isTonesLure }),
    positionLureType: positionValue ? extractLureType(positionValue.intention) : undefined,
    soundLureType: audioValue ? extractLureType(audioValue.intention) : undefined,
    colorLureType: colorValue ? extractLureType(colorValue.intention) : undefined,
    imageLureType: imageValue ? extractLureType(imageValue.intention) : undefined,
    spatialLureType: spatialValue ? extractLureType(spatialValue.intention) : undefined,
    digitsLureType: digitsValue ? extractLureType(digitsValue.intention) : undefined,
    emotionsLureType: emotionsValue ? extractLureType(emotionsValue.intention) : undefined,
    wordsLureType: wordsValue ? extractLureType(wordsValue.intention) : undefined,
    tonesLureType: tonesValue ? extractLureType(tonesValue.intention) : undefined,
  };
}
