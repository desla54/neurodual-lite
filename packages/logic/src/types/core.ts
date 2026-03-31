/**
 * Core Types - Dual N-Back
 *
 * Types fondamentaux pour le jeu Dual N-Back.
 * RÈGLE: Zéro import interne sauf thresholds.ts. Cette couche est la fondation.
 */

import {
  AUDIO_SYNC_BUFFER_MS as _AUDIO_SYNC_BUFFER_MS,
  VISUAL_LATENCY_OFFSET_MS as _VISUAL_LATENCY_OFFSET_MS,
  TIMING_VISUAL_OFFSET_DEFAULT_MS as _TIMING_VISUAL_OFFSET_DEFAULT_MS,
  TIMING_POST_VISUAL_OFFSET_MS as _TIMING_POST_VISUAL_OFFSET_MS,
  DEFAULT_N_LEVEL,
  DEFAULT_TRIALS_COUNT_TEMPO,
  GEN_TARGET_PROBABILITY_LOW,
  GEN_TARGET_PROBABILITY_DEFAULT,
  GEN_LURE_PROBABILITY_DEFAULT,
  GEN_LURE_PROBABILITY_NONE,
  TIMING_INTERVAL_DEFAULT_MS,
  TIMING_STIMULUS_TEMPO_MS,
  IMAGE_MODALITY_SHAPES as _IMAGE_MODALITY_SHAPES,
  type ImageShape as _ImageShape,
  ARITHMETIC_ANSWERS as _ARITHMETIC_ANSWERS,
  type ArithmeticAnswer as _ArithmeticAnswer,
  type ArithmeticOperator as _ArithmeticOperator,
  type ArithmeticDifficulty as _ArithmeticDifficulty,
  ARITHMETIC_OPERATORS_BY_DIFFICULTY as _ARITHMETIC_OPERATORS_BY_DIFFICULTY,
  SPATIAL_DIRECTIONS as _SPATIAL_DIRECTIONS,
  type SpatialDirection as _SpatialDirection,
  DIGIT_VALUES as _DIGIT_VALUES,
  type DigitValue as _DigitValue,
  EMOTION_VALUES as _EMOTION_VALUES,
  type EmotionValue as _EmotionValue,
  WORD_VALUES as _WORD_VALUES,
  type WordValue as _WordValue,
  TONE_VALUES as _TONE_VALUES,
  type ToneValue as _ToneValue,
} from '../specs/thresholds';

// Re-export Image modality types
export const IMAGE_MODALITY_SHAPES = _IMAGE_MODALITY_SHAPES;
export type ImageShape = _ImageShape;

// Re-export Arithmetic modality types
export const ARITHMETIC_ANSWERS = _ARITHMETIC_ANSWERS;
export type ArithmeticAnswer = _ArithmeticAnswer;
export type ArithmeticOperator = _ArithmeticOperator;
export type ArithmeticDifficulty = _ArithmeticDifficulty;
export const ARITHMETIC_OPERATORS_BY_DIFFICULTY = _ARITHMETIC_OPERATORS_BY_DIFFICULTY;

// Re-export new modality types (V2)
export const SPATIAL_DIRECTIONS = _SPATIAL_DIRECTIONS;
export type SpatialDirection = _SpatialDirection;
export const DIGIT_VALUES = _DIGIT_VALUES;
export type DigitValue = _DigitValue;
export const EMOTION_VALUES = _EMOTION_VALUES;
export type EmotionValue = _EmotionValue;
export const WORD_VALUES = _WORD_VALUES;
export type WordValue = _WordValue;
export const TONE_VALUES = _TONE_VALUES;
export type ToneValue = _ToneValue;

/**
 * Brain Workshop arithmetic operation identifiers (used for operation audio cues).
 *
 * Note: BW uses operation names (not symbols) and plays an operation sound each trial.
 */
export type BWArithmeticOperation = 'add' | 'subtract' | 'multiply' | 'divide';

/**
 * An arithmetic problem for the arithmetic N-back modality.
 * The user tracks the ANSWER, not the problem expression.
 */
export interface ArithmeticProblem {
  readonly operand1: number;
  readonly operator: ArithmeticOperator;
  readonly operand2: number;
  readonly answer: ArithmeticAnswer;
}

// =============================================================================
// Constantes du Domaine
// =============================================================================

export const POSITIONS = [0, 1, 2, 3, 4, 5, 6, 7] as const;
// Letters from Jaeggi et al. (2008) original Dual N-Back study & Brain Workshop
export const SOUNDS = ['C', 'H', 'K', 'L', 'Q', 'R', 'S', 'T'] as const;

/**
 * Buffer de synchronisation audio-visuelle (en ms).
 * @see thresholds.ts (SSOT)
 */
export const AUDIO_SYNC_BUFFER_MS = _AUDIO_SYNC_BUFFER_MS;

/**
 * Compensation de latence visuelle (en ms).
 * @see thresholds.ts (SSOT)
 */
export const VISUAL_LATENCY_OFFSET_MS = _VISUAL_LATENCY_OFFSET_MS;

/**
 * Décalage visuel par défaut pour la synchronisation audio-visuelle (en ms).
 * @see thresholds.ts (SSOT)
 */
export const TIMING_VISUAL_OFFSET_DEFAULT_MS = _TIMING_VISUAL_OFFSET_DEFAULT_MS;
export const TIMING_POST_VISUAL_OFFSET_MS = _TIMING_POST_VISUAL_OFFSET_MS;
/**
 * 8 ink-style colors for Dual Trace mode.
 * Includes red/green for cognitive interference with feedback colors.
 */
export const COLORS = [
  'ink-black', // Noir encre
  'ink-navy', // Bleu marine
  'ink-burgundy', // Rouge bordeaux (interference with error feedback)
  'ink-forest', // Vert forêt (interference with success feedback)
  'ink-burnt', // Orange brûlé
  'ink-plum', // Violet prune
  'ink-teal', // Cyan/Turquoise
  'ink-mustard', // Ocre/Jaune moutarde
] as const;

/**
 * CSS color values for COLORS (used in UI layer).
 */
export const COLOR_VALUES: Record<Color, string> = {
  'ink-black': '#1a1815',
  'ink-navy': '#1e3a5f',
  'ink-burgundy': '#722f37',
  'ink-forest': '#2d5a3d',
  'ink-burnt': '#b5651d',
  'ink-plum': '#5c3d5e',
  'ink-teal': '#2a6d6d',
  'ink-mustard': '#c4a35a',
};

// =============================================================================
// Types Primitifs
// =============================================================================

export type Position = (typeof POSITIONS)[number];
export type Sound = (typeof SOUNDS)[number];
export type Color = (typeof COLORS)[number];

/**
 * ModalityId - identifiant de modalité extensible.
 * Permet d'ajouter de nouvelles modalités sans modifier les types.
 */
export type ModalityId = string;

/**
 * KnownModality - modalités actuellement supportées avec propriétés Trial hardcodées.
 * Utilisé pour les switch statements type-safe sur les modalités connues.
 */
export type KnownModality =
  | 'position'
  | 'audio'
  | 'color'
  | 'image'
  | 'arithmetic'
  | 'spatial'
  | 'digits'
  | 'emotions'
  | 'words'
  | 'tones';

const KNOWN_MODALITIES: ReadonlySet<string> = new Set<KnownModality>([
  'position',
  'audio',
  'color',
  'image',
  'arithmetic',
  'spatial',
  'digits',
  'emotions',
  'words',
  'tones',
]);

/** Type guard pour vérifier si un ModalityId est une modalité connue */
export function isKnownModality(id: ModalityId): id is KnownModality {
  return KNOWN_MODALITIES.has(id);
}

// =============================================================================
// Multi-Stimulus Helpers
// =============================================================================

/**
 * Check if a modalityId is a position modality (position, position2, position3, position4).
 * Used for multi-stimulus Brain Workshop mode.
 */
export function isPositionModality(id: ModalityId): boolean {
  return id === 'position' || id.startsWith('position');
}

/**
 * Check if a modalityId is an audio modality (audio, audio2).
 * Used for multi-stimulus Brain Workshop mode.
 */
export function isAudioModality(id: ModalityId): boolean {
  return id === 'audio' || id.startsWith('audio');
}

/**
 * Get the index of a position modality (0 for position, 1 for position2, etc.)
 */
export function getPositionModalityIndex(id: ModalityId): number {
  if (id === 'position') return 0;
  const match = id.match(/^position(\d+)$/);
  if (match?.[1]) return Number.parseInt(match[1], 10) - 1;
  return -1;
}

/**
 * Get the index of an audio modality (0 for audio, 1 for audio2)
 */
export function getAudioModalityIndex(id: ModalityId): number {
  if (id === 'audio') return 0;
  const match = id.match(/^audio(\d+)$/);
  if (match?.[1]) return Number.parseInt(match[1], 10) - 1;
  return -1;
}

/**
 * Check if a modalityId is an arithmetic modality.
 * Used for Brain Workshop arithmetic mode.
 */
export function isArithmeticModality(id: ModalityId): boolean {
  return id === 'arithmetic';
}

export type TrialType = 'V-Seul' | 'A-Seul' | 'Dual' | 'Non-Cible' | 'Tampon';
export type LureType = 'n-1' | 'n+1' | 'sequence';

/**
 * LureIntention - Intention de near-miss pour Brain Workshop fidèle.
 * Décrit pourquoi un stimulus a été choisi comme leurre.
 *
 * - 'lure-n-1': Un trial trop tôt (serait un match au prochain trial)
 * - 'lure-n+1': Un trial trop tard (aurait été un match au trial précédent)
 * - 'lure-cycle': N trials trop tard (aurait été un match un "cycle" avant)
 */
export type LureIntention = 'lure-n-1' | 'lure-n+1' | 'lure-cycle';

/**
 * TrialIntention - Intention de génération d'un trial.
 * Décrit si le trial a été généré comme target, lure, ou neutre.
 */
export type TrialIntention = 'target' | LureIntention | 'neutral';

/** Résultat d'un trial pour une modalité (Signal Detection Theory) */
export type TrialResult = 'hit' | 'miss' | 'falseAlarm' | 'correctRejection';

// =============================================================================
// SDT (Signal Detection Theory) Counts - SINGLE SOURCE OF TRUTH
// =============================================================================

/**
 * Base SDT counts for a single modality.
 * ALL SDT-related types MUST extend or alias this type.
 *
 * This is the canonical representation of the 4 SDT metrics.
 * Used by: ModalityStats, ModalityRunningStats, TrainingModalityStats, etc.
 */
export interface SDTCounts {
  readonly hits: number;
  readonly misses: number;
  readonly falseAlarms: number;
  readonly correctRejections: number;
}

/**
 * SDT counts with nullable FA/CR for modes without rejection concept.
 * Used by Flow, Recall, DualPick modes where there's no "non-target" stimulus.
 *
 * In these modes:
 * - hits = correct placements
 * - misses = items not placed or placed incorrectly
 * - falseAlarms = null (no concept of pressing when shouldn't)
 * - correctRejections = null (no concept of correctly ignoring)
 */
export interface SDTCountsNullable {
  readonly hits: number;
  readonly misses: number;
  readonly falseAlarms: number | null;
  readonly correctRejections: number | null;
}

// =============================================================================
// Response Types (Generic)
// =============================================================================

/**
 * Enregistrement d'une réponse utilisateur pour une modalité
 */
export interface ResponseRecord {
  readonly pressed: boolean;
  readonly rt: number | null;
}

/**
 * État d'une touche en attente (keydown sans keyup)
 */
export interface PendingKeyRecord {
  readonly keydownTime: number;
  readonly rt: number;
  /** Trial index when the key was pressed (prevents race condition on keyup) */
  readonly trialIndex: number;
  /** Input method used (keyboard ~30-50ms faster than touch/mouse) */
  readonly inputMethod?: 'keyboard' | 'mouse' | 'touch' | 'gamepad' | 'bot';
  /** performance.now() captured at keydown/pointerdown (optional) */
  readonly capturedAtMs?: number;
  /** Correlation ID for UI pipeline telemetry (optional) */
  readonly telemetryId?: string;
}

/**
 * Noms des générateurs de séquence disponibles.
 * - 'Aleatoire': Générateur libre (LibreStrategy)
 * - 'BrainWorkshop': Protocole Brain Workshop
 * - 'DualnbackClassic': Protocole clinique Dual N-Back Classic
 * - 'Sequence': Nouveau moteur de séquences (Dual Tempo/Memo/Flow)
 */
export type GeneratorName = 'Aleatoire' | 'BrainWorkshop' | 'DualnbackClassic' | 'Sequence';

// =============================================================================
// Trial
// =============================================================================

export interface Trial {
  readonly index: number;
  readonly isBuffer: boolean;
  readonly position: Position;
  readonly sound: Sound;
  readonly color: Color;
  readonly image: ImageShape;
  readonly spatial?: SpatialDirection;
  readonly digits?: DigitValue;
  readonly emotions?: EmotionValue;
  readonly words?: WordValue;
  readonly tones?: ToneValue;
  readonly trialType: TrialType;
  // Ground truth flags
  readonly isPositionTarget: boolean;
  readonly isSpatialTarget?: boolean;
  readonly isDigitsTarget?: boolean;
  readonly isEmotionsTarget?: boolean;
  readonly isWordsTarget?: boolean;
  readonly isTonesTarget?: boolean;
  /** Target flag for multi-stimulus position2 stream (Brain Workshop) */
  readonly isPosition2Target?: boolean;
  /** Target flag for multi-stimulus position3 stream (Brain Workshop) */
  readonly isPosition3Target?: boolean;
  /** Target flag for multi-stimulus position4 stream (Brain Workshop) */
  readonly isPosition4Target?: boolean;
  /** Target flag for multi-stimulus vis1 stream (Brain Workshop) */
  readonly isVis1Target?: boolean;
  /** Target flag for multi-stimulus vis2 stream (Brain Workshop) */
  readonly isVis2Target?: boolean;
  /** Target flag for multi-stimulus vis3 stream (Brain Workshop) */
  readonly isVis3Target?: boolean;
  /** Target flag for multi-stimulus vis4 stream (Brain Workshop) */
  readonly isVis4Target?: boolean;
  readonly isSoundTarget: boolean;
  readonly isColorTarget: boolean;
  readonly isImageTarget: boolean;
  // Combination modalities (Brain Workshop)
  /**
   * Visual letter stimulus for Brain Workshop combination modes.
   * Uses the same 8-letter pool as the audio stimuli.
   */
  readonly vis?: Sound;
  /** Target flag for visvis modality (visual & n-visual match) */
  readonly isVisVisTarget?: boolean;
  /** Target flag for visaudio modality (visual & n-audio match) */
  readonly isVisAudioTarget?: boolean;
  /** Target flag for audiovis modality (audio & n-visual match) */
  readonly isAudioVisTarget?: boolean;
  // Lure detection
  readonly isPositionLure?: boolean;
  readonly isSpatialLure?: boolean;
  readonly isDigitsLure?: boolean;
  readonly isEmotionsLure?: boolean;
  readonly isWordsLure?: boolean;
  readonly isTonesLure?: boolean;
  /** Lure flag for multi-stimulus position2 stream (Brain Workshop) */
  readonly isPosition2Lure?: boolean;
  /** Lure flag for multi-stimulus position3 stream (Brain Workshop) */
  readonly isPosition3Lure?: boolean;
  /** Lure flag for multi-stimulus position4 stream (Brain Workshop) */
  readonly isPosition4Lure?: boolean;
  /** Lure flag for multi-stimulus vis1 stream (Brain Workshop) */
  readonly isVis1Lure?: boolean;
  /** Lure flag for multi-stimulus vis2 stream (Brain Workshop) */
  readonly isVis2Lure?: boolean;
  /** Lure flag for multi-stimulus vis3 stream (Brain Workshop) */
  readonly isVis3Lure?: boolean;
  /** Lure flag for multi-stimulus vis4 stream (Brain Workshop) */
  readonly isVis4Lure?: boolean;
  readonly isSoundLure?: boolean;
  readonly isColorLure?: boolean;
  readonly isImageLure?: boolean;
  /** Lure flag for visvis modality */
  readonly isVisVisLure?: boolean;
  /** Lure flag for visaudio modality */
  readonly isVisAudioLure?: boolean;
  /** Lure flag for audiovis modality */
  readonly isAudioVisLure?: boolean;
  readonly positionLureType?: LureType;
  readonly spatialLureType?: LureType;
  readonly digitsLureType?: LureType;
  readonly emotionsLureType?: LureType;
  readonly wordsLureType?: LureType;
  readonly tonesLureType?: LureType;
  /** Lure type for multi-stimulus position2 stream (Brain Workshop) */
  readonly position2LureType?: LureType;
  /** Lure type for multi-stimulus position3 stream (Brain Workshop) */
  readonly position3LureType?: LureType;
  /** Lure type for multi-stimulus position4 stream (Brain Workshop) */
  readonly position4LureType?: LureType;
  /** Lure type for multi-stimulus vis1 stream (Brain Workshop) */
  readonly vis1LureType?: LureType;
  /** Lure type for multi-stimulus vis2 stream (Brain Workshop) */
  readonly vis2LureType?: LureType;
  /** Lure type for multi-stimulus vis3 stream (Brain Workshop) */
  readonly vis3LureType?: LureType;
  /** Lure type for multi-stimulus vis4 stream (Brain Workshop) */
  readonly vis4LureType?: LureType;
  readonly soundLureType?: LureType;
  readonly colorLureType?: LureType;
  readonly imageLureType?: LureType;
  /** Lure type for visvis modality */
  readonly visvisLureType?: LureType;
  /** Lure type for visaudio modality */
  readonly visaudioLureType?: LureType;
  /** Lure type for audiovis modality */
  readonly audiovisLureType?: LureType;

  // Multi-stimulus support (Brain Workshop mode)
  /**
   * Additional positions for multi-stimulus mode.
   * Pairs of [modalityId, value] (JSON-serializable for persistence & replay).
   *
   * Keys: position2, position3, position4
   */
  readonly positions?: ReadonlyArray<readonly [ModalityId, Position]>;
  /**
   * Multi-stimulus vis values (Brain Workshop multi-stimulus color/image replacement).
   * Pairs of [modalityId, value] (JSON-serializable for persistence & replay).
   *
   * Keys: vis1, vis2, vis3, vis4
   * Values: 0-7 (index in the 8-item visual pool)
   */
  readonly visValues?: ReadonlyArray<readonly [ModalityId, number]>;
  /**
   * Second audio sound for dual-audio mode (audio2).
   */
  readonly sound2?: Sound;
  /**
   * Target flag for sound2 modality.
   */
  readonly isSound2Target?: boolean;
  /**
   * Lure flag for sound2 modality.
   */
  readonly isSound2Lure?: boolean;
  /**
   * Lure type for sound2 modality.
   */
  readonly sound2LureType?: LureType;

  // Arithmetic modality (Brain Workshop mode)
  /**
   * Brain Workshop arithmetic:
   * - Shows the current number visually each trial
   * - Plays an operation cue (add/subtract/multiply/divide)
   * - User types the RESULT using the n-back number as the left operand
   */
  readonly arithmeticNumber?: number;
  readonly arithmeticOperation?: BWArithmeticOperation;
  /**
   * Effective (per-trial) N-back distance used by BW generators (crab/variable N-back).
   * Provided for fidelity-critical modalities like arithmetic typed-answer evaluation.
   */
  readonly effectiveNBack?: number;
  /**
   * Legacy arithmetic problem (non-BW style).
   * Kept for backward compatibility with older arithmetic implementations.
   */
  readonly arithmeticProblem?: ArithmeticProblem;
  /**
   * Target flag for arithmetic modality.
   */
  readonly isArithmeticTarget?: boolean;
  /**
   * Lure flag for arithmetic modality.
   */
  readonly isArithmeticLure?: boolean;
  /**
   * Lure type for arithmetic modality.
   */
  readonly arithmeticLureType?: LureType;
}

// =============================================================================
// Feedback Configuration
// =============================================================================

/** Canal de feedback après chaque trial */
export type FeedbackChannel = 'visual' | 'audio' | 'haptic';

/**
 * Configuration du feedback par modalité.
 * Tableau vide = pas de feedback pour cette modalité.
 * @example { position: ['visual', 'audio'], audio: [] }
 */
export type FeedbackMode = Record<ModalityId, readonly FeedbackChannel[]>;

// =============================================================================
// Block Configuration
// =============================================================================

export interface BlockConfig {
  readonly nLevel: number;
  /** Nom du générateur de séquence (BrainWorkshop, Jaeggi, Libre) */
  readonly generator: GeneratorName;
  /** Modalités actives (ex: ['position', 'audio', 'color', 'shape']) */
  readonly activeModalities: readonly string[];
  readonly trialsCount: number;
  // BrainWorkshop specific
  readonly targetProbability: number;
  readonly lureProbability: number;
  // Timing (seconds)
  readonly intervalSeconds: number;
  readonly stimulusDurationSeconds: number;
  /** Feedback par modalité. Undefined = pas de feedback (comportement classique) */
  readonly feedbackMode?: FeedbackMode;
  /** Placement order mode for Place/Pick modes */
  readonly placementOrderMode?: 'free' | 'random' | 'oldestFirst' | 'newestFirst';
}

export interface Block {
  readonly id: string;
  readonly config: BlockConfig;
  readonly trials: Trial[];
  readonly createdAt: Date;
  readonly seed: string;
}

// =============================================================================
// Scoring
// =============================================================================

export interface ModalityStats extends SDTCounts {
  readonly hitRate: number;
  readonly falseAlarmRate: number;
  readonly dPrime: number;
  readonly reactionTimes: number[];
  readonly avgReactionTime: number | null;
}

export interface BlockScore {
  readonly statsByModality: Record<ModalityId, ModalityStats>;
  readonly globalDPrime: number;
  readonly passed: boolean;
}

// =============================================================================
// User Input
// =============================================================================

export interface TrialInput {
  readonly position?: boolean;
  readonly positionRT?: number;
  readonly audio?: boolean;
  readonly audioRT?: number;
  readonly color?: boolean;
  readonly colorRT?: number;
}

export type UserInputs = Record<number, TrialInput>;

// =============================================================================
// Defaults
// =============================================================================

/** @see thresholds.ts SSOT for all numeric values */
export const DEFAULT_CONFIG: BlockConfig = {
  nLevel: DEFAULT_N_LEVEL,
  generator: 'BrainWorkshop',
  activeModalities: ['position', 'audio'],
  trialsCount: DEFAULT_TRIALS_COUNT_TEMPO,
  targetProbability: GEN_TARGET_PROBABILITY_LOW,
  lureProbability: GEN_LURE_PROBABILITY_DEFAULT,
  intervalSeconds: TIMING_INTERVAL_DEFAULT_MS / 1000,
  stimulusDurationSeconds: TIMING_STIMULUS_TEMPO_MS / 1000,
};

/** @see thresholds.ts SSOT for all numeric values */
export const JAEGGI_CONFIG: Partial<BlockConfig> = {
  generator: 'DualnbackClassic',
  activeModalities: ['position', 'audio'],
  trialsCount: DEFAULT_TRIALS_COUNT_TEMPO,
  targetProbability: GEN_TARGET_PROBABILITY_DEFAULT,
  lureProbability: GEN_LURE_PROBABILITY_NONE,
  intervalSeconds: TIMING_INTERVAL_DEFAULT_MS / 1000,
  stimulusDurationSeconds: TIMING_STIMULUS_TEMPO_MS / 1000,
};

// =============================================================================
// Brain Workshop Faithful Mode Extensions
// =============================================================================

/**
 * BWExtensions - Configuration spécifique au mode Brain Workshop fidèle.
 *
 * Ces extensions permettent de répliquer exactement le comportement
 * du logiciel Brain Workshop 5.0 original.
 *
 * @see https://github.com/brain-workshop/brainworkshop
 */
export interface BWExtensions {
  /**
   * Variable N-Back mode.
   * Le N varie pendant la session selon une distribution beta.
   * Pour 3-back: génère 1, 2, ou 3 avec biais vers valeurs basses.
   */
  readonly variableNBack: boolean;

  /**
   * Crab-Back mode.
   * Le N oscille: 1-3-5-1-3-5... (pour 3-back).
   * Formule: real_back = 1 + 2 * ((trial - 1) % n)
   */
  readonly crabBackMode: boolean;

  /**
   * Multi-stimulus mode (1-4 visuels simultanés).
   * 1 = standard single stimulus.
   */
  readonly multiStimulus: 1 | 2 | 3 | 4;

  /**
   * Mode de différenciation des stimuli multiples.
   * 'color' = différenciés par couleur.
   * 'image' = différenciés par forme/image.
   */
  readonly multiMode: 'color' | 'image';

  /**
   * Probabilité de guaranteed match (12.5% par défaut).
   * Force un match correct à chaque trial (stage 1 de l'algorithme BW).
   */
  readonly guaranteedMatchProbability: number;

  /**
   * Probabilité d'interférence near-miss (12.5% par défaut).
   * Génère des stimuli presque-mais-pas-tout-à-fait corrects (stage 2).
   * Utilise les offsets [-1, +1, N] pour créer une confusion cognitive.
   */
  readonly interferenceProbability: number;
}

/**
 * MultiStimulusCount - Nombre de stimuli visuels simultanés.
 */
export type MultiStimulusCount = 1 | 2 | 3 | 4;

/**
 * MultiStimulusMode - Mode de différenciation des stimuli multiples.
 */
export type MultiStimulusMode = 'color' | 'image';
