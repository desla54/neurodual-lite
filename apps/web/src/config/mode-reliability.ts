/**
 * Mode reliability and access gating.
 *
 * Single source of truth for which game modes are stable/beta/alpha.
 * UI can still render placeholders for locked modes, but playability must
 * always be derived from this file + the current access flags.
 */

export type ReliabilityLevel = 'stable' | 'beta' | 'alpha' | 'prototype';

export interface FeatureAccessFlags {
  betaEnabled: boolean;
  alphaEnabled: boolean;
  prototypesEnabled: boolean;
}

const TUTORIAL_ONLY_MODE_IDS = new Set<string>();

// Keep ordering intentional (stable -> beta -> alpha)
export const STABLE_GAME_MODES = [
  // --- Training modes ---
  'dualnback-classic',
  'sim-brainworkshop',
  'dual-trace',
  'dual-track',
  'running-span',
  'swm',
  'mental-rotation',
  'rhythm',
  'stroop-flex',
  'chain-recall',
  'color-rush',
  'rhythm-tap',
  'pipeline',
  'tangram',
  'tower',
  'corsi-block',
  'gridlock',
  'flood',
  'fifteen',
  'pegs',
  'sudoku',
  '2048',
  'guess',
  'samegame',
  'untangle',
  'unruly',
  'towers',
  'bridges',
  'net',
  'inertia',
  'signpost',
  'keen',
  'lightup',
  'tents',
  'slant',
  'filling',
  'loopy',
  'pearl',
  'task-switching',
  'memory-match',
  'lights-out',
  'spot-diff',
  'mirror',
  'symmetry-span',
  'speed-sort',
  'nonogram',
  'sokoban',
  // --- Cognitive tests (V1) ---
  'stroop',
  'flanker',
  'go-nogo',
  'stop-signal',
  'simon',
  'antisaccade',
  'ant',
  'pvt',
  'sart',
  'visual-search',
  'dsst',
  'inspection-time',
  'pasat',
  'digit-span',
  'ospan',
  'reading-span',
  'change-detection',
  'trail-making',
  'wcst',
  // --- Stable cognitive tests (notable shortlist) ---
  'posner-cueing',
  'ax-cpt',
  'cpt',
  'ufov',
  'symbol-search',
  'letter-number',
  'sternberg',
  'gabor',
  'odd-one-out',
  'number-series',
  'analogies',
  'pattern-comparison',
  'double-decision',
  'time-estimation',
  'binding',
] as const;
export const BETA_GAME_MODES = [
  // --- Training modes kept in beta ---
  'soroban',
  'dual-time',
  'tetris-mind',
  'reflex',
  'twiddle',
  'map-coloring',
  'dominosa',
  'singles',
  'magnets',
  'galaxies',
  'rectangles',
  'tracks',
  'blackbox',
  'undead',
  'mosaic',
  'sixteen',
  'palisade',
  'range',
  'cube',
  'netslide',
  'flip',
] as const;
export const ALPHA_GAME_MODES = [
  'visual-logic',
  'dual-track-dnb-hybrid',
  'dual-catch',
  'dual-place',
  'dual-pick',
  'dual-memo',
  'custom',
  'pal',
  'word-list',
  'pattern-recognition',
  'maze',
  'word-flow',
  'word-chain',
  'promem',
  'time-promem',
  'dual-task',
  'task-juggling',
  // --- New placeholder modes ---
  'temporal-bisection',
  'toj',
  'prediction-motion',
  'temporal-generalization',
  'duration-reproduction',
  'foreperiod',
  'sync-continuation',
  'iowa-gambling',
  'bart',
  'delay-discounting',
  'reversal-learning',
  'weather-prediction',
  'multi-armed-bandit',
  'beads-task',
  'contrast-sensitivity',
  'motion-coherence',
  'contour-integration',
  'crowding',
  'vernier-acuity',
  'texture-discrimination',
  'biological-motion',
  'navon',
  'ambiguous-figures',
  'orientation-discrimination',
  'attentional-blink',
  'change-blindness',
  'dot-probe',
  'attentional-capture',
  'dichotic-listening',
  'face-name',
  'mnemonic-discrimination',
  'source-memory',
  'rey-figure',
  'delayed-matching',
  'directed-forgetting',
  'spaced-retrieval',
  'verbal-fluency',
  'design-fluency',
  'twenty-questions',
  'hayling',
  'brixton',
  'cognitive-estimation',
  'ied-set-shift',
  'facial-emotion',
  'eyes-test',
  'vocal-prosody',
  'gaze-direction',
  'faux-pas',
  'empathic-accuracy',
  'affective-go-nogo',
  'confidence-calibration',
  'judgment-of-learning',
  'cognitive-bias',
  'feeling-of-knowing',
  'remote-associates',
  'alternate-uses',
  'rebus-puzzles',
  'consequences',
  'embedded-figures',
  'paper-folding',
  'perspective-taking',
  'mental-cutting',
  'surface-development',
  'block-design',
  'cognitive-map',
  'water-level',
  'ans-comparison',
  'number-line',
  'subitizing',
  'arithmetic-speed',
  'numerical-stroop',
  'chain-calculation',
  'frequency-discrimination',
  'gap-detection',
  'sound-sweeps',
  'speech-in-noise',
  'phoneme-discrimination',
  'auditory-figure-ground',
  'auditory-duration',
  'srtt',
  'finger-tapping',
  'pursuit-tracking',
  'mirror-tracing',
  'fitts-tapping',
  'lexical-decision',
  'anagram',
  'rapid-naming',
  'sentence-verification',
  'cryptogram',
  'audiovisual-binding',
  'cross-modal-matching',
  'artificial-grammar',
  'statistical-learning',
  'contextual-cueing',
  'emotional-go-nogo',
  'emotional-stroop',
  'emotional-nback',
  'train-of-thought',
  'memobox',
  'route-planning',
  'pinball-recall',
  'scene-crasher',
  'speed-pack',
  // --- Wave 2 ---
  'cambridge-gambling',
  'information-sampling',
  'game-of-dice',
  'self-ordered-pointing',
  'cancellation',
  'rvp',
  'line-orientation',
  'hooper-visual',
  'prototype-distortion',
  'syllogisms',
  'proverb-interpretation',
  'sentence-completion',
  'brown-peterson',
  'judgment-of-recency',
  'negative-priming',
  'clock-drawing',
] as const;

export const PROTOTYPE_GAME_MODES = [
  // Add prototype-only game modes here (dev only, never shipped)
] as const;

export const ALL_GAME_MODES = [
  ...STABLE_GAME_MODES,
  ...BETA_GAME_MODES,
  ...ALPHA_GAME_MODES,
  ...PROTOTYPE_GAME_MODES,
] as const;

/**
 * Map modeId -> reliability.
 * Stable modes are intentionally omitted and treated as the default.
 */
export const MODE_RELIABILITY: Readonly<Record<string, ReliabilityLevel>> = Object.freeze(
  Object.fromEntries([
    ...BETA_GAME_MODES.map((mode) => [mode, 'beta'] as const),
    ...ALPHA_GAME_MODES.map((mode) => [mode, 'alpha'] as const),
    ...PROTOTYPE_GAME_MODES.map((mode) => [mode, 'prototype'] as const),
  ]),
);

export function getReliabilityForGameMode(gameMode?: string): ReliabilityLevel {
  if (!gameMode) return 'stable';
  return MODE_RELIABILITY[gameMode] ?? 'stable';
}

export function isReliabilityVisible(
  reliability: ReliabilityLevel,
  access: FeatureAccessFlags,
): boolean {
  if (reliability === 'prototype') return access.prototypesEnabled;
  if (reliability === 'alpha') return access.alphaEnabled;
  if (reliability === 'beta') return access.betaEnabled;
  return true;
}

/**
 * True when the mode is allowed to be used (playable/selectable) for the current access.
 */
export function isGameModeVisibleForAccess(
  gameMode: string | undefined,
  access: FeatureAccessFlags,
): boolean {
  if (!gameMode) return true;
  if (TUTORIAL_ONLY_MODE_IDS.has(gameMode)) return false;
  return isReliabilityVisible(getReliabilityForGameMode(gameMode), access);
}
