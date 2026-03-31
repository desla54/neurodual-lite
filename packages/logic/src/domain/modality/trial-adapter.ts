/**
 * Trial Adapter
 *
 * Convertit FlexibleTrial vers le format Trial.
 */

import type {
  Color,
  DigitValue,
  EmotionValue,
  ImageShape,
  LureType,
  ModalityId,
  Position,
  SpatialDirection,
  Sound,
  ToneValue,
  Trial,
  TrialInput,
  WordValue,
} from '../types';
import { isKnownModality } from '../types';
import { IMAGE_MODALITY_SHAPES } from '../../specs/thresholds';
import type { FlexibleTrial } from './flexible-trial';

// =============================================================================
// FlexibleTrial → Trial (Legacy)
// =============================================================================

/**
 * Convertit un FlexibleTrial vers l'ancien format Trial.
 * Utilisé pour la compatibilité avec l'UI et le code existant.
 *
 * Multi-stimulus support:
 * - Extracts position2-4 into `positions` (tuple array) if present
 * - Extracts audio2 into `sound2` if present
 */
export function toTrial(flexible: FlexibleTrial): Trial {
  const posStimulus = flexible.stimuli.get('position');
  const audioStimulus = flexible.stimuli.get('audio');
  const colorStimulus = flexible.stimuli.get('color');
  const imageStimulus = flexible.stimuli.get('image');
  const spatialStimulus = flexible.stimuli.get('spatial');
  const digitsStimulus = flexible.stimuli.get('digits');
  const emotionsStimulus = flexible.stimuli.get('emotions');
  const wordsStimulus = flexible.stimuli.get('words');
  const tonesStimulus = flexible.stimuli.get('tones');
  const visvisStimulus = flexible.stimuli.get('visvis');
  const visaudioStimulus = flexible.stimuli.get('visaudio');
  const audiovisStimulus = flexible.stimuli.get('audiovis');

  // Multi-stimulus: extract additional positions (position2, position3, position4)
  const positions: Array<readonly [ModalityId, Position]> = [];
  let position2Target: boolean | undefined;
  let position3Target: boolean | undefined;
  let position4Target: boolean | undefined;
  let position2Lure: boolean | undefined;
  let position3Lure: boolean | undefined;
  let position4Lure: boolean | undefined;
  let position2LureType: LureType | undefined;
  let position3LureType: LureType | undefined;
  let position4LureType: LureType | undefined;

  // Multi-stimulus: extract vis1-4 values (Brain Workshop multi-stimulus color/image replacement)
  const visValues: Array<readonly [ModalityId, number]> = [];
  let vis1Target: boolean | undefined;
  let vis2Target: boolean | undefined;
  let vis3Target: boolean | undefined;
  let vis4Target: boolean | undefined;
  let vis1Lure: boolean | undefined;
  let vis2Lure: boolean | undefined;
  let vis3Lure: boolean | undefined;
  let vis4Lure: boolean | undefined;
  let vis1LureType: LureType | undefined;
  let vis2LureType: LureType | undefined;
  let vis3LureType: LureType | undefined;
  let vis4LureType: LureType | undefined;
  for (const [modalityId, stimulus] of flexible.stimuli) {
    if (modalityId.startsWith('position') && modalityId !== 'position') {
      const positionValue = stimulus.value as Position;
      positions.push([modalityId, positionValue] as const);
      if (modalityId === 'position2') {
        position2Target = stimulus.isTarget;
        position2Lure = stimulus.isLure;
        position2LureType = stimulus.lureType;
      } else if (modalityId === 'position3') {
        position3Target = stimulus.isTarget;
        position3Lure = stimulus.isLure;
        position3LureType = stimulus.lureType;
      } else if (modalityId === 'position4') {
        position4Target = stimulus.isTarget;
        position4Lure = stimulus.isLure;
        position4LureType = stimulus.lureType;
      }
    }

    if (/^vis[1-4]$/.test(modalityId)) {
      const visValue = stimulus.value as number;
      visValues.push([modalityId, visValue] as const);
      if (modalityId === 'vis1') {
        vis1Target = stimulus.isTarget;
        vis1Lure = stimulus.isLure;
        vis1LureType = stimulus.lureType;
      } else if (modalityId === 'vis2') {
        vis2Target = stimulus.isTarget;
        vis2Lure = stimulus.isLure;
        vis2LureType = stimulus.lureType;
      } else if (modalityId === 'vis3') {
        vis3Target = stimulus.isTarget;
        vis3Lure = stimulus.isLure;
        vis3LureType = stimulus.lureType;
      } else if (modalityId === 'vis4') {
        vis4Target = stimulus.isTarget;
        vis4Lure = stimulus.isLure;
        vis4LureType = stimulus.lureType;
      }
    }
  }

  // Multi-audio: extract audio2 if present
  const audio2Stimulus = flexible.stimuli.get('audio2');

  const baseTrial: Trial = {
    index: flexible.index,
    isBuffer: flexible.isBuffer,
    position: (posStimulus?.value ?? 0) as Position,
    sound: (audioStimulus?.value ?? 'C') as Sound,
    color: (colorStimulus?.value ?? 'ink-black') as Color,
    image: (imageStimulus?.value ?? IMAGE_MODALITY_SHAPES[0]) as ImageShape,
    ...(spatialStimulus?.value !== undefined && {
      spatial: spatialStimulus.value as SpatialDirection,
    }),
    ...(digitsStimulus?.value !== undefined && { digits: digitsStimulus.value as DigitValue }),
    ...(emotionsStimulus?.value !== undefined && {
      emotions: emotionsStimulus.value as EmotionValue,
    }),
    ...(wordsStimulus?.value !== undefined && { words: wordsStimulus.value as WordValue }),
    ...(tonesStimulus?.value !== undefined && { tones: tonesStimulus.value as ToneValue }),
    trialType: flexible.trialType,
    isPositionTarget: posStimulus?.isTarget ?? false,
    isSoundTarget: audioStimulus?.isTarget ?? false,
    isColorTarget: colorStimulus?.isTarget ?? false,
    isImageTarget: imageStimulus?.isTarget ?? false,
    ...(spatialStimulus !== undefined && { isSpatialTarget: spatialStimulus.isTarget }),
    ...(digitsStimulus !== undefined && { isDigitsTarget: digitsStimulus.isTarget }),
    ...(emotionsStimulus !== undefined && { isEmotionsTarget: emotionsStimulus.isTarget }),
    ...(wordsStimulus !== undefined && { isWordsTarget: wordsStimulus.isTarget }),
    ...(tonesStimulus !== undefined && { isTonesTarget: tonesStimulus.isTarget }),
    ...(visvisStimulus?.value !== undefined && { vis: visvisStimulus.value as Sound }),
    ...(visaudioStimulus?.value !== undefined &&
      visvisStimulus?.value === undefined && { vis: visaudioStimulus.value as Sound }),
    ...(visvisStimulus !== undefined && {
      isVisVisTarget: visvisStimulus.isTarget,
      isVisVisLure: visvisStimulus.isLure,
      visvisLureType: visvisStimulus.lureType,
    }),
    ...(visaudioStimulus !== undefined && {
      isVisAudioTarget: visaudioStimulus.isTarget,
      isVisAudioLure: visaudioStimulus.isLure,
      visaudioLureType: visaudioStimulus.lureType,
    }),
    ...(audiovisStimulus !== undefined && {
      isAudioVisTarget: audiovisStimulus.isTarget,
      isAudioVisLure: audiovisStimulus.isLure,
      audiovisLureType: audiovisStimulus.lureType,
    }),
    isPositionLure: posStimulus?.isLure,
    isSoundLure: audioStimulus?.isLure,
    isColorLure: colorStimulus?.isLure,
    isImageLure: imageStimulus?.isLure,
    ...(spatialStimulus !== undefined && { isSpatialLure: spatialStimulus.isLure }),
    ...(digitsStimulus !== undefined && { isDigitsLure: digitsStimulus.isLure }),
    ...(emotionsStimulus !== undefined && { isEmotionsLure: emotionsStimulus.isLure }),
    ...(wordsStimulus !== undefined && { isWordsLure: wordsStimulus.isLure }),
    ...(tonesStimulus !== undefined && { isTonesLure: tonesStimulus.isLure }),
    positionLureType: posStimulus?.lureType,
    ...(spatialStimulus?.lureType !== undefined && { spatialLureType: spatialStimulus.lureType }),
    ...(digitsStimulus?.lureType !== undefined && { digitsLureType: digitsStimulus.lureType }),
    ...(emotionsStimulus?.lureType !== undefined && {
      emotionsLureType: emotionsStimulus.lureType,
    }),
    ...(wordsStimulus?.lureType !== undefined && { wordsLureType: wordsStimulus.lureType }),
    ...(tonesStimulus?.lureType !== undefined && { tonesLureType: tonesStimulus.lureType }),
    ...(position2Target !== undefined && { isPosition2Target: position2Target }),
    ...(position3Target !== undefined && { isPosition3Target: position3Target }),
    ...(position4Target !== undefined && { isPosition4Target: position4Target }),
    ...(position2Lure !== undefined && { isPosition2Lure: position2Lure }),
    ...(position3Lure !== undefined && { isPosition3Lure: position3Lure }),
    ...(position4Lure !== undefined && { isPosition4Lure: position4Lure }),
    ...(position2LureType !== undefined && { position2LureType }),
    ...(position3LureType !== undefined && { position3LureType }),
    ...(position4LureType !== undefined && { position4LureType }),
    ...(vis1Target !== undefined && { isVis1Target: vis1Target }),
    ...(vis2Target !== undefined && { isVis2Target: vis2Target }),
    ...(vis3Target !== undefined && { isVis3Target: vis3Target }),
    ...(vis4Target !== undefined && { isVis4Target: vis4Target }),
    ...(vis1Lure !== undefined && { isVis1Lure: vis1Lure }),
    ...(vis2Lure !== undefined && { isVis2Lure: vis2Lure }),
    ...(vis3Lure !== undefined && { isVis3Lure: vis3Lure }),
    ...(vis4Lure !== undefined && { isVis4Lure: vis4Lure }),
    ...(vis1LureType !== undefined && { vis1LureType }),
    ...(vis2LureType !== undefined && { vis2LureType }),
    ...(vis3LureType !== undefined && { vis3LureType }),
    ...(vis4LureType !== undefined && { vis4LureType }),
    soundLureType: audioStimulus?.lureType,
    colorLureType: colorStimulus?.lureType,
    imageLureType: imageStimulus?.lureType,
    // Multi-stimulus fields (optional)
    ...(positions.length > 0 && { positions }),
    ...(visValues.length > 0 && { visValues }),
    ...(audio2Stimulus && {
      sound2: audio2Stimulus.value as Sound,
      isSound2Target: audio2Stimulus.isTarget,
      isSound2Lure: audio2Stimulus.isLure,
      sound2LureType: audio2Stimulus.lureType,
    }),
  };

  return baseTrial;
}

/**
 * Convertit un tableau de FlexibleTrial vers l'ancien format
 */
export function toTrials(flexibles: FlexibleTrial[]): Trial[] {
  return flexibles.map(toTrial);
}

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Vérifie si c'est un FlexibleTrial
 */
export function isFlexibleTrial(trial: Trial | FlexibleTrial): trial is FlexibleTrial {
  return 'stimuli' in trial && trial.stimuli instanceof Map;
}

// =============================================================================
// Helpers pour accès simplifié
// =============================================================================

/**
 * Récupère la position d'un trial (fonctionne avec les deux formats)
 */
export function getPosition(trial: Trial | FlexibleTrial): Position {
  if (isFlexibleTrial(trial)) {
    return (trial.stimuli.get('position')?.value ?? 0) as Position;
  }
  return trial.position;
}

/**
 * Récupère le son d'un trial (fonctionne avec les deux formats)
 */
export function getSound(trial: Trial | FlexibleTrial): Sound {
  if (isFlexibleTrial(trial)) {
    return (trial.stimuli.get('audio')?.value ?? 'C') as Sound;
  }
  return trial.sound;
}

/**
 * Récupère la couleur d'un trial (fonctionne avec les deux formats)
 */
export function getColor(trial: Trial | FlexibleTrial): Color {
  if (isFlexibleTrial(trial)) {
    return (trial.stimuli.get('color')?.value ?? 'ink-black') as Color;
  }
  return trial.color;
}

/**
 * Récupère l'image d'un trial (fonctionne avec les deux formats)
 */
export function getImage(trial: Trial | FlexibleTrial): ImageShape {
  if (isFlexibleTrial(trial)) {
    return (trial.stimuli.get('image')?.value ?? IMAGE_MODALITY_SHAPES[0]) as ImageShape;
  }
  return trial.image;
}

// =============================================================================
// Helpers génériques pour accès aux propriétés (dual-format)
// =============================================================================

/**
 * Vérifie si une modalité est une cible (fonctionne avec les deux formats)
 */
export function getIsTarget(trial: Trial | FlexibleTrial, modalityId: ModalityId): boolean {
  if (isFlexibleTrial(trial)) {
    return trial.stimuli.get(modalityId)?.isTarget ?? false;
  }
  // Multi-stimulus support (legacy Trial)
  if (modalityId === 'position2') return trial.isPosition2Target ?? false;
  if (modalityId === 'position3') return trial.isPosition3Target ?? false;
  if (modalityId === 'position4') return trial.isPosition4Target ?? false;
  if (modalityId === 'vis1') return trial.isVis1Target ?? false;
  if (modalityId === 'vis2') return trial.isVis2Target ?? false;
  if (modalityId === 'vis3') return trial.isVis3Target ?? false;
  if (modalityId === 'vis4') return trial.isVis4Target ?? false;
  if (modalityId === 'audio2') return trial.isSound2Target ?? false;
  // Combination modalities (legacy Trial)
  if (modalityId === 'visvis') return trial.isVisVisTarget ?? false;
  if (modalityId === 'visaudio') return trial.isVisAudioTarget ?? false;
  if (modalityId === 'audiovis') return trial.isAudioVisTarget ?? false;
  // Legacy fallback
  if (!isKnownModality(modalityId)) return false;
  switch (modalityId) {
    case 'position':
      return trial.isPositionTarget;
    case 'audio':
      return trial.isSoundTarget;
    case 'color':
      return trial.isColorTarget;
    case 'image':
      return trial.isImageTarget;
    case 'arithmetic':
      return trial.isArithmeticTarget ?? false;
    case 'spatial':
      return trial.isSpatialTarget ?? false;
    case 'digits':
      return trial.isDigitsTarget ?? false;
    case 'emotions':
      return trial.isEmotionsTarget ?? false;
    case 'words':
      return trial.isWordsTarget ?? false;
    case 'tones':
      return trial.isTonesTarget ?? false;
  }
}

/**
 * Vérifie si une modalité est un leurre (fonctionne avec les deux formats)
 */
export function getIsLure(trial: Trial | FlexibleTrial, modalityId: ModalityId): boolean {
  if (isFlexibleTrial(trial)) {
    return trial.stimuli.get(modalityId)?.isLure ?? false;
  }
  // Multi-stimulus support (legacy Trial)
  if (modalityId === 'position2') return trial.isPosition2Lure ?? false;
  if (modalityId === 'position3') return trial.isPosition3Lure ?? false;
  if (modalityId === 'position4') return trial.isPosition4Lure ?? false;
  if (modalityId === 'vis1') return trial.isVis1Lure ?? false;
  if (modalityId === 'vis2') return trial.isVis2Lure ?? false;
  if (modalityId === 'vis3') return trial.isVis3Lure ?? false;
  if (modalityId === 'vis4') return trial.isVis4Lure ?? false;
  if (modalityId === 'audio2') return trial.isSound2Lure ?? false;
  // Combination modalities (legacy Trial)
  if (modalityId === 'visvis') return trial.isVisVisLure ?? false;
  if (modalityId === 'visaudio') return trial.isVisAudioLure ?? false;
  if (modalityId === 'audiovis') return trial.isAudioVisLure ?? false;
  // Legacy fallback
  if (!isKnownModality(modalityId)) return false;
  switch (modalityId) {
    case 'position':
      return trial.isPositionLure ?? false;
    case 'audio':
      return trial.isSoundLure ?? false;
    case 'color':
      return trial.isColorLure ?? false;
    case 'image':
      return trial.isImageLure ?? false;
    case 'arithmetic':
      return trial.isArithmeticLure ?? false;
    case 'spatial':
      return trial.isSpatialLure ?? false;
    case 'digits':
      return trial.isDigitsLure ?? false;
    case 'emotions':
      return trial.isEmotionsLure ?? false;
    case 'words':
      return trial.isWordsLure ?? false;
    case 'tones':
      return trial.isTonesLure ?? false;
  }
}

/**
 * Récupère le type de leurre (fonctionne avec les deux formats)
 */
export function getLureType(trial: Trial | FlexibleTrial, modalityId: ModalityId): LureType | null {
  if (isFlexibleTrial(trial)) {
    return trial.stimuli.get(modalityId)?.lureType ?? null;
  }
  // Multi-stimulus support (legacy Trial)
  if (modalityId === 'position2') return trial.position2LureType ?? null;
  if (modalityId === 'position3') return trial.position3LureType ?? null;
  if (modalityId === 'position4') return trial.position4LureType ?? null;
  if (modalityId === 'vis1') return trial.vis1LureType ?? null;
  if (modalityId === 'vis2') return trial.vis2LureType ?? null;
  if (modalityId === 'vis3') return trial.vis3LureType ?? null;
  if (modalityId === 'vis4') return trial.vis4LureType ?? null;
  if (modalityId === 'audio2') return trial.sound2LureType ?? null;
  // Combination modalities (legacy Trial)
  if (modalityId === 'visvis') return trial.visvisLureType ?? null;
  if (modalityId === 'visaudio') return trial.visaudioLureType ?? null;
  if (modalityId === 'audiovis') return trial.audiovisLureType ?? null;
  // Legacy fallback
  if (!isKnownModality(modalityId)) return null;
  switch (modalityId) {
    case 'position':
      return trial.positionLureType ?? null;
    case 'audio':
      return trial.soundLureType ?? null;
    case 'color':
      return trial.colorLureType ?? null;
    case 'image':
      return trial.imageLureType ?? null;
    case 'arithmetic':
      return trial.arithmeticLureType ?? null;
    case 'spatial':
      return trial.spatialLureType ?? null;
    case 'digits':
      return trial.digitsLureType ?? null;
    case 'emotions':
      return trial.emotionsLureType ?? null;
    case 'words':
      return trial.wordsLureType ?? null;
    case 'tones':
      return trial.tonesLureType ?? null;
  }
}

// =============================================================================
// TrialInput Helpers (pour lecture des réponses utilisateur)
// =============================================================================

/**
 * Type flexible pour les entrées utilisateur (Map-based)
 */
export interface FlexibleTrialInput {
  readonly responses: ReadonlyMap<ModalityId, { pressed: boolean; rt?: number }>;
}

/**
 * Type guard pour FlexibleTrialInput
 */
export function isFlexibleTrialInput(
  input: TrialInput | FlexibleTrialInput | undefined,
): input is FlexibleTrialInput {
  return input !== undefined && 'responses' in input && input.responses instanceof Map;
}

/**
 * Vérifie si l'utilisateur a répondu pour une modalité donnée
 * (fonctionne avec TrialInput legacy et FlexibleTrialInput)
 */
export function getHasResponse(
  input: TrialInput | FlexibleTrialInput | undefined,
  modalityId: ModalityId,
): boolean {
  if (!input) return false;

  if (isFlexibleTrialInput(input)) {
    return input.responses.get(modalityId)?.pressed ?? false;
  }

  // Legacy fallback
  if (!isKnownModality(modalityId)) return false;
  switch (modalityId) {
    case 'position':
      return input.position === true;
    case 'audio':
      return input.audio === true;
    case 'color':
      return input.color === true;
    case 'image':
      // TrialInput legacy doesn't have image field
      return false;
    case 'arithmetic':
      // TrialInput legacy doesn't have arithmetic field
      return false;
    case 'spatial':
    case 'digits':
    case 'emotions':
    case 'words':
    case 'tones':
      return false;
  }
}

/**
 * Récupère le temps de réaction pour une modalité donnée
 * (fonctionne avec TrialInput legacy et FlexibleTrialInput)
 */
export function getResponseRT(
  input: TrialInput | FlexibleTrialInput | undefined,
  modalityId: ModalityId,
): number | undefined {
  if (!input) return undefined;

  if (isFlexibleTrialInput(input)) {
    return input.responses.get(modalityId)?.rt;
  }

  // Legacy fallback
  if (!isKnownModality(modalityId)) return undefined;
  switch (modalityId) {
    case 'position':
      return input.positionRT;
    case 'audio':
      return input.audioRT;
    case 'color':
      return input.colorRT;
    case 'image':
      // TrialInput legacy doesn't have imageRT field
      return undefined;
    case 'arithmetic':
      // TrialInput legacy doesn't have arithmeticRT field
      return undefined;
    case 'spatial':
    case 'digits':
    case 'emotions':
    case 'words':
    case 'tones':
      return undefined;
  }
}
