/**
 * Mode Metadata - Lightweight configuration for UI display
 *
 * This file contains ONLY the minimal data needed for the home page to display
 * mode selectors without importing the heavy gameModeRegistry (~1MB).
 *
 * The full gameModeRegistry is lazy-loaded only when starting a game session.
 *
 * WARNING: These values must stay in sync with specs/*.spec.ts
 * If you modify thresholds.ts or specs, update this file too.
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Game mode ID - matches @neurodual/logic GameModeId (which is just string)
 */
export type GameModeId = string;

/**
 * Known game mode IDs (for type safety in this module's records)
 */
type KnownGameModeId =
  | 'dual-catch'
  | 'dual-place'
  | 'dual-pick'
  | 'dual-trace'
  | 'dual-memo'
  | 'dualnback-classic'
  | 'sim-brainworkshop'
  | 'dual-time'
  | 'dual-track'
  | 'corsi-block'
  | 'ospan'
  | 'running-span'
  | 'pasat'
  | 'swm'
  | 'custom'
  | 'stroop'
  | 'stroop-flex'
  | 'flanker'
  | 'go-nogo'
  | 'stop-signal'
  | 'antisaccade'
  | 'wcst'
  | 'trail-making'
  | 'task-switching'
  | 'change-detection'
  | 'ant'
  | 'symmetry-span'
  | 'pvt'
  | 'reading-span'
  | 'digit-span'
  | 'simon'
  | 'posner-cueing'
  | 'sternberg'
  | 'ax-cpt'
  | 'mental-rotation'
  | 'visual-logic'
  | 'visual-search'
  | 'letter-number'
  | 'sart'
  | 'cpt'
  | 'pal'
  | 'word-list'
  | 'pattern-recognition'
  | 'tower'
  | 'gridlock'
  | 'maze'
  | 'word-flow'
  | 'word-chain'
  | 'promem'
  | 'time-promem'
  | 'dual-task'
  | 'task-juggling'
  | 'ufov'
  | 'gabor'
  | 'odd-one-out'
  | 'number-series'
  | 'analogies'
  | 'time-estimation'
  | 'rhythm'
  | 'binding'
  // --- New game modes (Waves 1-4) ---
  | 'lights-out'
  | 'memory-match'
  | 'chain-recall'
  | 'reflex'
  | 'speed-sort'
  | 'nonogram'
  | 'sokoban'
  | 'mirror'
  | 'color-rush'
  | 'spot-diff'
  | 'tetris-mind'
  | 'rhythm-tap'
  | 'pipeline'
  | 'tangram'
  // --- Tatham-inspired puzzle modes ---
  | 'flood'
  | 'fifteen'
  | 'pegs'
  | 'sudoku'
  | '2048'
  | 'guess'
  | 'samegame'
  | 'untangle'
  | 'unruly'
  | 'twiddle'
  | 'map-coloring'
  | 'towers'
  | 'bridges'
  | 'net'
  | 'inertia'
  | 'signpost'
  | 'keen'
  | 'dominosa'
  | 'singles'
  | 'lightup'
  | 'tents'
  | 'slant'
  | 'filling'
  | 'loopy'
  | 'pearl'
  | 'magnets'
  | 'galaxies'
  | 'rectangles'
  | 'tracks'
  | 'blackbox'
  | 'undead'
  | 'mosaic'
  | 'sixteen'
  | 'palisade'
  | 'range'
  | 'cube'
  | 'netslide'
  | 'flip'
  // --- New placeholder modes ---
  | 'temporal-bisection'
  | 'toj'
  | 'prediction-motion'
  | 'temporal-generalization'
  | 'duration-reproduction'
  | 'foreperiod'
  | 'sync-continuation'
  | 'iowa-gambling'
  | 'bart'
  | 'delay-discounting'
  | 'reversal-learning'
  | 'weather-prediction'
  | 'multi-armed-bandit'
  | 'beads-task'
  | 'contrast-sensitivity'
  | 'motion-coherence'
  | 'contour-integration'
  | 'crowding'
  | 'vernier-acuity'
  | 'texture-discrimination'
  | 'biological-motion'
  | 'navon'
  | 'ambiguous-figures'
  | 'orientation-discrimination'
  | 'attentional-blink'
  | 'change-blindness'
  | 'dot-probe'
  | 'attentional-capture'
  | 'dichotic-listening'
  | 'face-name'
  | 'mnemonic-discrimination'
  | 'source-memory'
  | 'rey-figure'
  | 'delayed-matching'
  | 'directed-forgetting'
  | 'spaced-retrieval'
  | 'verbal-fluency'
  | 'design-fluency'
  | 'twenty-questions'
  | 'hayling'
  | 'brixton'
  | 'cognitive-estimation'
  | 'ied-set-shift'
  | 'dsst'
  | 'symbol-search'
  | 'pattern-comparison'
  | 'inspection-time'
  | 'double-decision'
  | 'facial-emotion'
  | 'eyes-test'
  | 'vocal-prosody'
  | 'gaze-direction'
  | 'faux-pas'
  | 'empathic-accuracy'
  | 'affective-go-nogo'
  | 'confidence-calibration'
  | 'judgment-of-learning'
  | 'cognitive-bias'
  | 'feeling-of-knowing'
  | 'remote-associates'
  | 'alternate-uses'
  | 'rebus-puzzles'
  | 'consequences'
  | 'embedded-figures'
  | 'paper-folding'
  | 'perspective-taking'
  | 'mental-cutting'
  | 'surface-development'
  | 'block-design'
  | 'cognitive-map'
  | 'water-level'
  | 'ans-comparison'
  | 'number-line'
  | 'subitizing'
  | 'arithmetic-speed'
  | 'numerical-stroop'
  | 'chain-calculation'
  | 'soroban'
  | 'frequency-discrimination'
  | 'gap-detection'
  | 'sound-sweeps'
  | 'speech-in-noise'
  | 'phoneme-discrimination'
  | 'auditory-figure-ground'
  | 'auditory-duration'
  | 'srtt'
  | 'finger-tapping'
  | 'pursuit-tracking'
  | 'mirror-tracing'
  | 'fitts-tapping'
  | 'lexical-decision'
  | 'anagram'
  | 'rapid-naming'
  | 'sentence-verification'
  | 'cryptogram'
  | 'audiovisual-binding'
  | 'cross-modal-matching'
  | 'artificial-grammar'
  | 'statistical-learning'
  | 'contextual-cueing'
  | 'emotional-go-nogo'
  | 'emotional-stroop'
  | 'emotional-nback'
  | 'train-of-thought'
  | 'memobox'
  | 'route-planning'
  | 'pinball-recall'
  | 'scene-crasher'
  | 'speed-pack'
  // --- Wave 2 placeholder modes ---
  | 'cambridge-gambling'
  | 'information-sampling'
  | 'game-of-dice'
  | 'self-ordered-pointing'
  | 'cancellation'
  | 'rvp'
  | 'line-orientation'
  | 'hooper-visual'
  | 'prototype-distortion'
  | 'syllogisms'
  | 'proverb-interpretation'
  | 'sentence-completion'
  | 'brown-peterson'
  | 'judgment-of-recency'
  | 'negative-priming'
  | 'clock-drawing';

export type GameRoute =
  | '/nback'
  | '/dual-place'
  | '/dual-memo'
  | '/dual-pick'
  | '/dual-trace'
  | '/dual-time'
  | '/dual-track'
  | '/corsi-block'
  | '/ospan'
  | '/running-span'
  | '/pasat'
  | '/swm'
  | '/stroop'
  | '/stroop-flex'
  | '/flanker'
  | '/go-nogo'
  | '/stop-signal'
  | '/antisaccade'
  | '/wcst'
  | '/trail-making'
  | '/task-switching'
  | '/change-detection'
  | '/ant'
  | '/symmetry-span'
  | '/pvt'
  | '/reading-span'
  | '/digit-span'
  | '/simon'
  | '/posner-cueing'
  | '/sternberg'
  | '/ax-cpt'
  | '/mental-rotation'
  | '/visual-logic'
  | '/visual-search'
  | '/letter-number'
  | '/sart'
  | '/cpt'
  | '/pal'
  | '/word-list'
  | '/pattern-recognition'
  | '/tower'
  | '/gridlock'
  | '/maze'
  | '/word-flow'
  | '/word-chain'
  | '/promem'
  | '/time-promem'
  | '/dual-task'
  | '/task-juggling'
  | '/ufov'
  | '/gabor'
  | '/odd-one-out'
  | '/number-series'
  | '/analogies'
  | '/time-estimation'
  | '/rhythm'
  | '/binding'
  // --- New game modes (Waves 1-4) ---
  | '/lights-out'
  | '/memory-match'
  | '/chain-recall'
  | '/reflex'
  | '/speed-sort'
  | '/nonogram'
  | '/sokoban'
  | '/mirror'
  | '/color-rush'
  | '/spot-diff'
  | '/tetris-mind'
  | '/rhythm-tap'
  | '/pipeline'
  | '/tangram'
  // --- Tatham-inspired puzzle modes ---
  | '/flood'
  | '/fifteen'
  | '/pegs'
  | '/sudoku'
  | '/2048'
  | '/guess'
  | '/samegame'
  | '/untangle'
  | '/unruly'
  | '/twiddle'
  | '/map-coloring'
  | '/towers'
  | '/bridges'
  | '/net-puzzle'
  | '/inertia'
  | '/signpost'
  | '/keen'
  | '/dominosa'
  | '/singles'
  | '/lightup'
  | '/tents'
  | '/slant'
  | '/filling'
  | '/loopy'
  | '/pearl'
  | '/magnets'
  | '/galaxies'
  | '/rectangles'
  | '/tracks-puzzle'
  | '/blackbox'
  | '/undead'
  | '/mosaic'
  | '/sixteen'
  | '/palisade'
  | '/range-puzzle'
  | '/cube-puzzle'
  | '/netslide'
  | '/flip'
  // --- New placeholder modes ---
  | '/temporal-bisection'
  | '/toj'
  | '/prediction-motion'
  | '/temporal-generalization'
  | '/duration-reproduction'
  | '/foreperiod'
  | '/sync-continuation'
  | '/iowa-gambling'
  | '/bart'
  | '/delay-discounting'
  | '/reversal-learning'
  | '/weather-prediction'
  | '/multi-armed-bandit'
  | '/beads-task'
  | '/contrast-sensitivity'
  | '/motion-coherence'
  | '/contour-integration'
  | '/crowding'
  | '/vernier-acuity'
  | '/texture-discrimination'
  | '/biological-motion'
  | '/navon'
  | '/ambiguous-figures'
  | '/orientation-discrimination'
  | '/attentional-blink'
  | '/change-blindness'
  | '/dot-probe'
  | '/attentional-capture'
  | '/dichotic-listening'
  | '/face-name'
  | '/mnemonic-discrimination'
  | '/source-memory'
  | '/rey-figure'
  | '/delayed-matching'
  | '/directed-forgetting'
  | '/spaced-retrieval'
  | '/verbal-fluency'
  | '/design-fluency'
  | '/twenty-questions'
  | '/hayling'
  | '/brixton'
  | '/cognitive-estimation'
  | '/ied-set-shift'
  | '/dsst'
  | '/symbol-search'
  | '/pattern-comparison'
  | '/inspection-time'
  | '/double-decision'
  | '/facial-emotion'
  | '/eyes-test'
  | '/vocal-prosody'
  | '/gaze-direction'
  | '/faux-pas'
  | '/empathic-accuracy'
  | '/affective-go-nogo'
  | '/confidence-calibration'
  | '/judgment-of-learning'
  | '/cognitive-bias'
  | '/feeling-of-knowing'
  | '/remote-associates'
  | '/alternate-uses'
  | '/rebus-puzzles'
  | '/consequences'
  | '/embedded-figures'
  | '/paper-folding'
  | '/perspective-taking'
  | '/mental-cutting'
  | '/surface-development'
  | '/block-design'
  | '/cognitive-map'
  | '/water-level'
  | '/ans-comparison'
  | '/number-line'
  | '/subitizing'
  | '/arithmetic-speed'
  | '/numerical-stroop'
  | '/chain-calculation'
  | '/soroban-journey'
  | '/frequency-discrimination'
  | '/gap-detection'
  | '/sound-sweeps'
  | '/speech-in-noise'
  | '/phoneme-discrimination'
  | '/auditory-figure-ground'
  | '/auditory-duration'
  | '/srtt'
  | '/finger-tapping'
  | '/pursuit-tracking'
  | '/mirror-tracing'
  | '/fitts-tapping'
  | '/lexical-decision'
  | '/anagram'
  | '/rapid-naming'
  | '/sentence-verification'
  | '/cryptogram'
  | '/audiovisual-binding'
  | '/cross-modal-matching'
  | '/artificial-grammar'
  | '/statistical-learning'
  | '/contextual-cueing'
  | '/emotional-go-nogo'
  | '/emotional-stroop'
  | '/emotional-nback'
  | '/train-of-thought'
  | '/memobox'
  | '/route-planning'
  | '/pinball-recall'
  | '/scene-crasher'
  | '/speed-pack'
  // --- Wave 2 routes ---
  | '/cambridge-gambling'
  | '/information-sampling'
  | '/game-of-dice'
  | '/self-ordered-pointing'
  | '/cancellation'
  | '/rvp'
  | '/line-orientation'
  | '/hooper-visual'
  | '/prototype-distortion'
  | '/syllogisms'
  | '/proverb-interpretation'
  | '/sentence-completion'
  | '/brown-peterson'
  | '/judgment-of-recency'
  | '/negative-priming'
  | '/clock-drawing';

// =============================================================================
// Route Mappings (from specs/journey.spec.ts)
// =============================================================================

/**
 * Mapping game mode → route
 * Source: packages/logic/src/specs/journey.spec.ts
 */
export const GAME_MODE_ROUTES: Record<KnownGameModeId, GameRoute> = {
  'dualnback-classic': '/nback',
  'sim-brainworkshop': '/nback',
  'dual-catch': '/nback',
  'dual-place': '/dual-place',
  'dual-pick': '/dual-pick',
  'dual-memo': '/dual-memo',
  'dual-trace': '/dual-trace',
  'dual-time': '/dual-time',
  'dual-track': '/dual-track',
  'corsi-block': '/corsi-block',
  ospan: '/ospan',
  'running-span': '/running-span',
  pasat: '/pasat',
  swm: '/swm',
  custom: '/nback',
  stroop: '/stroop',
  'stroop-flex': '/stroop-flex',
  flanker: '/flanker',
  'go-nogo': '/go-nogo',
  'stop-signal': '/stop-signal',
  antisaccade: '/antisaccade',
  wcst: '/wcst',
  'trail-making': '/trail-making',
  'task-switching': '/task-switching',
  'change-detection': '/change-detection',
  ant: '/ant',
  'symmetry-span': '/symmetry-span',
  pvt: '/pvt',
  'reading-span': '/reading-span',
  'digit-span': '/digit-span',
  simon: '/simon',
  'posner-cueing': '/posner-cueing',
  sternberg: '/sternberg',
  'ax-cpt': '/ax-cpt',
  'mental-rotation': '/mental-rotation',
  'visual-logic': '/visual-logic',
  'visual-search': '/visual-search',
  'letter-number': '/letter-number',
  sart: '/sart',
  cpt: '/cpt',
  pal: '/pal',
  'word-list': '/word-list',
  'pattern-recognition': '/pattern-recognition',
  tower: '/tower',
  gridlock: '/gridlock',
  maze: '/maze',
  'word-flow': '/word-flow',
  'word-chain': '/word-chain',
  promem: '/promem',
  'time-promem': '/time-promem',
  'dual-task': '/dual-task',
  'task-juggling': '/task-juggling',
  ufov: '/ufov',
  gabor: '/gabor',
  'odd-one-out': '/odd-one-out',
  'number-series': '/number-series',
  analogies: '/analogies',
  'time-estimation': '/time-estimation',
  rhythm: '/rhythm',
  binding: '/binding',
  // --- New game modes (Waves 1-4) ---
  'lights-out': '/lights-out',
  'memory-match': '/memory-match',
  'chain-recall': '/chain-recall',
  reflex: '/reflex',
  'speed-sort': '/speed-sort',
  nonogram: '/nonogram',
  sokoban: '/sokoban',
  mirror: '/mirror',
  'color-rush': '/color-rush',
  'spot-diff': '/spot-diff',
  'tetris-mind': '/tetris-mind',
  'rhythm-tap': '/rhythm-tap',
  pipeline: '/pipeline',
  tangram: '/tangram',
  // --- Tatham-inspired puzzle modes ---
  flood: '/flood',
  fifteen: '/fifteen',
  pegs: '/pegs',
  sudoku: '/sudoku',
  '2048': '/2048',
  guess: '/guess',
  samegame: '/samegame',
  untangle: '/untangle',
  unruly: '/unruly',
  twiddle: '/twiddle',
  'map-coloring': '/map-coloring',
  towers: '/towers',
  bridges: '/bridges',
  net: '/net-puzzle',
  inertia: '/inertia',
  signpost: '/signpost',
  keen: '/keen',
  dominosa: '/dominosa',
  singles: '/singles',
  lightup: '/lightup',
  tents: '/tents',
  slant: '/slant',
  filling: '/filling',
  loopy: '/loopy',
  pearl: '/pearl',
  magnets: '/magnets',
  galaxies: '/galaxies',
  rectangles: '/rectangles',
  tracks: '/tracks-puzzle',
  blackbox: '/blackbox',
  undead: '/undead',
  mosaic: '/mosaic',
  sixteen: '/sixteen',
  palisade: '/palisade',
  range: '/range-puzzle',
  cube: '/cube-puzzle',
  netslide: '/netslide',
  flip: '/flip',
  // --- New placeholder modes ---
  'temporal-bisection': '/temporal-bisection',
  toj: '/toj',
  'prediction-motion': '/prediction-motion',
  'temporal-generalization': '/temporal-generalization',
  'duration-reproduction': '/duration-reproduction',
  foreperiod: '/foreperiod',
  'sync-continuation': '/sync-continuation',
  'iowa-gambling': '/iowa-gambling',
  bart: '/bart',
  'delay-discounting': '/delay-discounting',
  'reversal-learning': '/reversal-learning',
  'weather-prediction': '/weather-prediction',
  'multi-armed-bandit': '/multi-armed-bandit',
  'beads-task': '/beads-task',
  'contrast-sensitivity': '/contrast-sensitivity',
  'motion-coherence': '/motion-coherence',
  'contour-integration': '/contour-integration',
  crowding: '/crowding',
  'vernier-acuity': '/vernier-acuity',
  'texture-discrimination': '/texture-discrimination',
  'biological-motion': '/biological-motion',
  navon: '/navon',
  'ambiguous-figures': '/ambiguous-figures',
  'orientation-discrimination': '/orientation-discrimination',
  'attentional-blink': '/attentional-blink',
  'change-blindness': '/change-blindness',
  'dot-probe': '/dot-probe',
  'attentional-capture': '/attentional-capture',
  'dichotic-listening': '/dichotic-listening',
  'face-name': '/face-name',
  'mnemonic-discrimination': '/mnemonic-discrimination',
  'source-memory': '/source-memory',
  'rey-figure': '/rey-figure',
  'delayed-matching': '/delayed-matching',
  'directed-forgetting': '/directed-forgetting',
  'spaced-retrieval': '/spaced-retrieval',
  'verbal-fluency': '/verbal-fluency',
  'design-fluency': '/design-fluency',
  'twenty-questions': '/twenty-questions',
  hayling: '/hayling',
  brixton: '/brixton',
  'cognitive-estimation': '/cognitive-estimation',
  'ied-set-shift': '/ied-set-shift',
  dsst: '/dsst',
  'symbol-search': '/symbol-search',
  'pattern-comparison': '/pattern-comparison',
  'inspection-time': '/inspection-time',
  'double-decision': '/double-decision',
  'facial-emotion': '/facial-emotion',
  'eyes-test': '/eyes-test',
  'vocal-prosody': '/vocal-prosody',
  'gaze-direction': '/gaze-direction',
  'faux-pas': '/faux-pas',
  'empathic-accuracy': '/empathic-accuracy',
  'affective-go-nogo': '/affective-go-nogo',
  'confidence-calibration': '/confidence-calibration',
  'judgment-of-learning': '/judgment-of-learning',
  'cognitive-bias': '/cognitive-bias',
  'feeling-of-knowing': '/feeling-of-knowing',
  'remote-associates': '/remote-associates',
  'alternate-uses': '/alternate-uses',
  'rebus-puzzles': '/rebus-puzzles',
  consequences: '/consequences',
  'embedded-figures': '/embedded-figures',
  'paper-folding': '/paper-folding',
  'perspective-taking': '/perspective-taking',
  'mental-cutting': '/mental-cutting',
  'surface-development': '/surface-development',
  'block-design': '/block-design',
  'cognitive-map': '/cognitive-map',
  'water-level': '/water-level',
  'ans-comparison': '/ans-comparison',
  'number-line': '/number-line',
  subitizing: '/subitizing',
  'arithmetic-speed': '/arithmetic-speed',
  'numerical-stroop': '/numerical-stroop',
  'chain-calculation': '/chain-calculation',
  soroban: '/soroban-journey',
  'frequency-discrimination': '/frequency-discrimination',
  'gap-detection': '/gap-detection',
  'sound-sweeps': '/sound-sweeps',
  'speech-in-noise': '/speech-in-noise',
  'phoneme-discrimination': '/phoneme-discrimination',
  'auditory-figure-ground': '/auditory-figure-ground',
  'auditory-duration': '/auditory-duration',
  srtt: '/srtt',
  'finger-tapping': '/finger-tapping',
  'pursuit-tracking': '/pursuit-tracking',
  'mirror-tracing': '/mirror-tracing',
  'fitts-tapping': '/fitts-tapping',
  'lexical-decision': '/lexical-decision',
  anagram: '/anagram',
  'rapid-naming': '/rapid-naming',
  'sentence-verification': '/sentence-verification',
  cryptogram: '/cryptogram',
  'audiovisual-binding': '/audiovisual-binding',
  'cross-modal-matching': '/cross-modal-matching',
  'artificial-grammar': '/artificial-grammar',
  'statistical-learning': '/statistical-learning',
  'contextual-cueing': '/contextual-cueing',
  'emotional-go-nogo': '/emotional-go-nogo',
  'emotional-stroop': '/emotional-stroop',
  'emotional-nback': '/emotional-nback',
  'train-of-thought': '/train-of-thought',
  memobox: '/memobox',
  'route-planning': '/route-planning',
  'pinball-recall': '/pinball-recall',
  'scene-crasher': '/scene-crasher',
  'speed-pack': '/speed-pack',
  // --- Wave 2 ---
  'cambridge-gambling': '/cambridge-gambling',
  'information-sampling': '/information-sampling',
  'game-of-dice': '/game-of-dice',
  'self-ordered-pointing': '/self-ordered-pointing',
  cancellation: '/cancellation',
  rvp: '/rvp',
  'line-orientation': '/line-orientation',
  'hooper-visual': '/hooper-visual',
  'prototype-distortion': '/prototype-distortion',
  syllogisms: '/syllogisms',
  'proverb-interpretation': '/proverb-interpretation',
  'sentence-completion': '/sentence-completion',
  'brown-peterson': '/brown-peterson',
  'judgment-of-recency': '/judgment-of-recency',
  'negative-priming': '/negative-priming',
  'clock-drawing': '/clock-drawing',
} as const;

// =============================================================================
// Default Values (from specs/thresholds.ts)
// =============================================================================

/**
 * Default N-level for all modes
 * Source: packages/logic/src/specs/thresholds.ts DEFAULT_N_LEVEL
 */
const DEFAULT_N_LEVEL = 2;

/**
 * Default trials count for tempo modes (Dual Catch, Dual N-Back Classic, BrainWorkshop, Custom)
 * Source: packages/logic/src/specs/thresholds.ts DEFAULT_TRIALS_COUNT_TEMPO
 */
const DEFAULT_TRIALS_COUNT_TEMPO = 20;

/**
 * Default trials count for flow/label/recall/trace modes
 * Source: packages/logic/src/specs/thresholds.ts DEFAULT_TRIALS_COUNT_FLOW
 */
const DEFAULT_TRIALS_COUNT_FLOW = 12;

/**
 * Mode defaults - just nLevel and trialsCount
 */
export interface ModeDefaults {
  nLevel: number;
  trialsCount: number;
}

/**
 * Default configurations per mode
 */
export const MODE_DEFAULTS: Record<KnownGameModeId, ModeDefaults> = {
  'dual-catch': { nLevel: DEFAULT_N_LEVEL, trialsCount: DEFAULT_TRIALS_COUNT_TEMPO },
  'dual-place': { nLevel: DEFAULT_N_LEVEL, trialsCount: DEFAULT_TRIALS_COUNT_FLOW },
  'dual-pick': { nLevel: DEFAULT_N_LEVEL, trialsCount: DEFAULT_TRIALS_COUNT_FLOW },
  // Dual Trace has mode-specific defaults in the spec (n=1, 20 trials).
  'dual-trace': { nLevel: 1, trialsCount: DEFAULT_TRIALS_COUNT_TEMPO },
  'dual-memo': { nLevel: DEFAULT_N_LEVEL, trialsCount: DEFAULT_TRIALS_COUNT_FLOW },
  'dualnback-classic': { nLevel: DEFAULT_N_LEVEL, trialsCount: DEFAULT_TRIALS_COUNT_TEMPO },
  'sim-brainworkshop': { nLevel: DEFAULT_N_LEVEL, trialsCount: DEFAULT_TRIALS_COUNT_TEMPO },
  'dual-time': { nLevel: 1, trialsCount: DEFAULT_TRIALS_COUNT_FLOW },
  'dual-track': { nLevel: 3, trialsCount: 10 },
  'corsi-block': { nLevel: 2, trialsCount: 14 },
  ospan: { nLevel: 2, trialsCount: 15 },
  'running-span': { nLevel: 3, trialsCount: 15 },
  pasat: { nLevel: 1, trialsCount: 20 },
  swm: { nLevel: 4, trialsCount: 12 },
  custom: { nLevel: DEFAULT_N_LEVEL, trialsCount: DEFAULT_TRIALS_COUNT_TEMPO },
  stroop: { nLevel: 1, trialsCount: 96 },
  'stroop-flex': { nLevel: 1, trialsCount: 96 },
  flanker: { nLevel: 1, trialsCount: 96 },
  'go-nogo': { nLevel: 1, trialsCount: 96 },
  'stop-signal': { nLevel: 1, trialsCount: 96 },
  antisaccade: { nLevel: 1, trialsCount: 96 },
  wcst: { nLevel: 1, trialsCount: 64 },
  'trail-making': { nLevel: 1, trialsCount: 2 },
  'task-switching': { nLevel: 1, trialsCount: DEFAULT_TRIALS_COUNT_TEMPO },
  'change-detection': { nLevel: DEFAULT_N_LEVEL, trialsCount: DEFAULT_TRIALS_COUNT_TEMPO },
  ant: { nLevel: 1, trialsCount: 96 },
  'symmetry-span': { nLevel: DEFAULT_N_LEVEL, trialsCount: 12 },
  pvt: { nLevel: 1, trialsCount: DEFAULT_TRIALS_COUNT_TEMPO },
  'reading-span': { nLevel: DEFAULT_N_LEVEL, trialsCount: 12 },
  'digit-span': { nLevel: 3, trialsCount: 14 },
  simon: { nLevel: 1, trialsCount: 96 },
  'posner-cueing': { nLevel: 1, trialsCount: DEFAULT_TRIALS_COUNT_TEMPO },
  sternberg: { nLevel: DEFAULT_N_LEVEL, trialsCount: DEFAULT_TRIALS_COUNT_TEMPO },
  'ax-cpt': { nLevel: 1, trialsCount: DEFAULT_TRIALS_COUNT_TEMPO },
  'mental-rotation': { nLevel: 1, trialsCount: DEFAULT_TRIALS_COUNT_TEMPO },
  'visual-logic': { nLevel: 1, trialsCount: 12 },
  'visual-search': { nLevel: 1, trialsCount: 96 },
  'letter-number': { nLevel: DEFAULT_N_LEVEL, trialsCount: 14 },
  sart: { nLevel: 1, trialsCount: DEFAULT_TRIALS_COUNT_TEMPO },
  cpt: { nLevel: 1, trialsCount: DEFAULT_TRIALS_COUNT_TEMPO },
  pal: { nLevel: DEFAULT_N_LEVEL, trialsCount: DEFAULT_TRIALS_COUNT_FLOW },
  'word-list': { nLevel: 1, trialsCount: DEFAULT_TRIALS_COUNT_FLOW },
  'pattern-recognition': { nLevel: 1, trialsCount: DEFAULT_TRIALS_COUNT_TEMPO },
  tower: { nLevel: 1, trialsCount: DEFAULT_TRIALS_COUNT_FLOW },
  gridlock: { nLevel: 1, trialsCount: DEFAULT_TRIALS_COUNT_FLOW },
  maze: { nLevel: 1, trialsCount: DEFAULT_TRIALS_COUNT_FLOW },
  'word-flow': { nLevel: 1, trialsCount: DEFAULT_TRIALS_COUNT_TEMPO },
  'word-chain': { nLevel: 1, trialsCount: DEFAULT_TRIALS_COUNT_TEMPO },
  promem: { nLevel: 1, trialsCount: DEFAULT_TRIALS_COUNT_TEMPO },
  'time-promem': { nLevel: 1, trialsCount: DEFAULT_TRIALS_COUNT_TEMPO },
  'dual-task': { nLevel: 1, trialsCount: DEFAULT_TRIALS_COUNT_TEMPO },
  'task-juggling': { nLevel: 1, trialsCount: DEFAULT_TRIALS_COUNT_TEMPO },
  ufov: { nLevel: 1, trialsCount: DEFAULT_TRIALS_COUNT_TEMPO },
  gabor: { nLevel: 1, trialsCount: DEFAULT_TRIALS_COUNT_TEMPO },
  'odd-one-out': { nLevel: 1, trialsCount: DEFAULT_TRIALS_COUNT_FLOW },
  'number-series': { nLevel: 1, trialsCount: DEFAULT_TRIALS_COUNT_FLOW },
  analogies: { nLevel: 1, trialsCount: DEFAULT_TRIALS_COUNT_FLOW },
  'time-estimation': { nLevel: 1, trialsCount: DEFAULT_TRIALS_COUNT_TEMPO },
  rhythm: { nLevel: 1, trialsCount: DEFAULT_TRIALS_COUNT_TEMPO },
  binding: { nLevel: DEFAULT_N_LEVEL, trialsCount: DEFAULT_TRIALS_COUNT_TEMPO },
  // --- New game modes (Waves 1-4) ---
  'lights-out': { nLevel: 1, trialsCount: 10 },
  'memory-match': { nLevel: 1, trialsCount: 10 },
  'chain-recall': { nLevel: 1, trialsCount: 10 },
  reflex: { nLevel: 1, trialsCount: 20 },
  'speed-sort': { nLevel: 1, trialsCount: 15 },
  nonogram: { nLevel: 1, trialsCount: 10 },
  sokoban: { nLevel: 1, trialsCount: 10 },
  mirror: { nLevel: 1, trialsCount: 10 },
  'color-rush': { nLevel: 1, trialsCount: 20 },
  'spot-diff': { nLevel: 1, trialsCount: 10 },
  'tetris-mind': { nLevel: 1, trialsCount: 10 },
  'rhythm-tap': { nLevel: 1, trialsCount: 15 },
  pipeline: { nLevel: 1, trialsCount: 10 },
  tangram: { nLevel: 1, trialsCount: 10 },
  // --- Tatham-inspired puzzle modes ---
  flood: { nLevel: 1, trialsCount: 5 },
  fifteen: { nLevel: 1, trialsCount: 5 },
  pegs: { nLevel: 2, trialsCount: 3 },
  sudoku: { nLevel: 1, trialsCount: 1 },
  '2048': { nLevel: 1, trialsCount: 1 },
  guess: { nLevel: 1, trialsCount: 3 },
  samegame: { nLevel: 1, trialsCount: 3 },
  untangle: { nLevel: 1, trialsCount: 3 },
  unruly: { nLevel: 1, trialsCount: 5 },
  twiddle: { nLevel: 1, trialsCount: 5 },
  'map-coloring': { nLevel: 1, trialsCount: 5 },
  towers: { nLevel: 1, trialsCount: 3 },
  bridges: { nLevel: 1, trialsCount: 3 },
  net: { nLevel: 1, trialsCount: 5 },
  inertia: { nLevel: 1, trialsCount: 3 },
  signpost: { nLevel: 1, trialsCount: 5 },
  keen: { nLevel: 1, trialsCount: 3 },
  dominosa: { nLevel: 2, trialsCount: 3 },
  singles: { nLevel: 1, trialsCount: 5 },
  lightup: { nLevel: 1, trialsCount: 3 },
  tents: { nLevel: 1, trialsCount: 5 },
  slant: { nLevel: 1, trialsCount: 5 },
  filling: { nLevel: 1, trialsCount: 5 },
  loopy: { nLevel: 1, trialsCount: 3 },
  pearl: { nLevel: 1, trialsCount: 3 },
  magnets: { nLevel: 1, trialsCount: 3 },
  galaxies: { nLevel: 1, trialsCount: 3 },
  rectangles: { nLevel: 1, trialsCount: 5 },
  tracks: { nLevel: 1, trialsCount: 3 },
  blackbox: { nLevel: 1, trialsCount: 3 },
  undead: { nLevel: 1, trialsCount: 3 },
  mosaic: { nLevel: 1, trialsCount: 5 },
  sixteen: { nLevel: 1, trialsCount: 5 },
  palisade: { nLevel: 1, trialsCount: 3 },
  range: { nLevel: 1, trialsCount: 3 },
  cube: { nLevel: 1, trialsCount: 5 },
  netslide: { nLevel: 1, trialsCount: 5 },
  flip: { nLevel: 1, trialsCount: 5 },
  // --- New placeholder modes ---
  'temporal-bisection': { nLevel: 1, trialsCount: 20 },
  toj: { nLevel: 1, trialsCount: 20 },
  'prediction-motion': { nLevel: 1, trialsCount: 20 },
  'temporal-generalization': { nLevel: 1, trialsCount: 20 },
  'duration-reproduction': { nLevel: 1, trialsCount: 20 },
  foreperiod: { nLevel: 1, trialsCount: 20 },
  'sync-continuation': { nLevel: 1, trialsCount: 20 },
  'iowa-gambling': { nLevel: 1, trialsCount: 20 },
  bart: { nLevel: 1, trialsCount: 20 },
  'delay-discounting': { nLevel: 1, trialsCount: 20 },
  'reversal-learning': { nLevel: 1, trialsCount: 20 },
  'weather-prediction': { nLevel: 1, trialsCount: 20 },
  'multi-armed-bandit': { nLevel: 1, trialsCount: 20 },
  'beads-task': { nLevel: 1, trialsCount: 20 },
  'contrast-sensitivity': { nLevel: 1, trialsCount: 20 },
  'motion-coherence': { nLevel: 1, trialsCount: 20 },
  'contour-integration': { nLevel: 1, trialsCount: 20 },
  crowding: { nLevel: 1, trialsCount: 20 },
  'vernier-acuity': { nLevel: 1, trialsCount: 20 },
  'texture-discrimination': { nLevel: 1, trialsCount: 20 },
  'biological-motion': { nLevel: 1, trialsCount: 20 },
  navon: { nLevel: 1, trialsCount: 20 },
  'ambiguous-figures': { nLevel: 1, trialsCount: 20 },
  'orientation-discrimination': { nLevel: 1, trialsCount: 20 },
  'attentional-blink': { nLevel: 1, trialsCount: 20 },
  'change-blindness': { nLevel: 1, trialsCount: 20 },
  'dot-probe': { nLevel: 1, trialsCount: 20 },
  'attentional-capture': { nLevel: 1, trialsCount: 20 },
  'dichotic-listening': { nLevel: 1, trialsCount: 20 },
  'face-name': { nLevel: 1, trialsCount: 20 },
  'mnemonic-discrimination': { nLevel: 1, trialsCount: 20 },
  'source-memory': { nLevel: 1, trialsCount: 20 },
  'rey-figure': { nLevel: 1, trialsCount: 20 },
  'delayed-matching': { nLevel: 1, trialsCount: 20 },
  'directed-forgetting': { nLevel: 1, trialsCount: 20 },
  'spaced-retrieval': { nLevel: 1, trialsCount: 20 },
  'verbal-fluency': { nLevel: 1, trialsCount: 20 },
  'design-fluency': { nLevel: 1, trialsCount: 20 },
  'twenty-questions': { nLevel: 1, trialsCount: 20 },
  hayling: { nLevel: 1, trialsCount: 20 },
  brixton: { nLevel: 1, trialsCount: 20 },
  'cognitive-estimation': { nLevel: 1, trialsCount: 20 },
  'ied-set-shift': { nLevel: 1, trialsCount: 20 },
  dsst: { nLevel: 1, trialsCount: 20 },
  'symbol-search': { nLevel: 1, trialsCount: 20 },
  'pattern-comparison': { nLevel: 1, trialsCount: 20 },
  'inspection-time': { nLevel: 1, trialsCount: 20 },
  'double-decision': { nLevel: 1, trialsCount: 20 },
  'facial-emotion': { nLevel: 1, trialsCount: 20 },
  'eyes-test': { nLevel: 1, trialsCount: 20 },
  'vocal-prosody': { nLevel: 1, trialsCount: 20 },
  'gaze-direction': { nLevel: 1, trialsCount: 20 },
  'faux-pas': { nLevel: 1, trialsCount: 20 },
  'empathic-accuracy': { nLevel: 1, trialsCount: 20 },
  'affective-go-nogo': { nLevel: 1, trialsCount: 20 },
  'confidence-calibration': { nLevel: 1, trialsCount: 20 },
  'judgment-of-learning': { nLevel: 1, trialsCount: 20 },
  'cognitive-bias': { nLevel: 1, trialsCount: 20 },
  'feeling-of-knowing': { nLevel: 1, trialsCount: 20 },
  'remote-associates': { nLevel: 1, trialsCount: 20 },
  'alternate-uses': { nLevel: 1, trialsCount: 20 },
  'rebus-puzzles': { nLevel: 1, trialsCount: 20 },
  consequences: { nLevel: 1, trialsCount: 20 },
  'embedded-figures': { nLevel: 1, trialsCount: 20 },
  'paper-folding': { nLevel: 1, trialsCount: 20 },
  'perspective-taking': { nLevel: 1, trialsCount: 20 },
  'mental-cutting': { nLevel: 1, trialsCount: 20 },
  'surface-development': { nLevel: 1, trialsCount: 20 },
  'block-design': { nLevel: 1, trialsCount: 20 },
  'cognitive-map': { nLevel: 1, trialsCount: 20 },
  'water-level': { nLevel: 1, trialsCount: 20 },
  'ans-comparison': { nLevel: 1, trialsCount: 20 },
  'number-line': { nLevel: 1, trialsCount: 20 },
  subitizing: { nLevel: 1, trialsCount: 20 },
  'arithmetic-speed': { nLevel: 1, trialsCount: 20 },
  'numerical-stroop': { nLevel: 1, trialsCount: 20 },
  'chain-calculation': { nLevel: 1, trialsCount: 20 },
  soroban: { nLevel: 2, trialsCount: 20 },
  'frequency-discrimination': { nLevel: 1, trialsCount: 20 },
  'gap-detection': { nLevel: 1, trialsCount: 20 },
  'sound-sweeps': { nLevel: 1, trialsCount: 20 },
  'speech-in-noise': { nLevel: 1, trialsCount: 20 },
  'phoneme-discrimination': { nLevel: 1, trialsCount: 20 },
  'auditory-figure-ground': { nLevel: 1, trialsCount: 20 },
  'auditory-duration': { nLevel: 1, trialsCount: 20 },
  srtt: { nLevel: 1, trialsCount: 20 },
  'finger-tapping': { nLevel: 1, trialsCount: 20 },
  'pursuit-tracking': { nLevel: 1, trialsCount: 20 },
  'mirror-tracing': { nLevel: 1, trialsCount: 20 },
  'fitts-tapping': { nLevel: 1, trialsCount: 20 },
  'lexical-decision': { nLevel: 1, trialsCount: 20 },
  anagram: { nLevel: 1, trialsCount: 20 },
  'rapid-naming': { nLevel: 1, trialsCount: 20 },
  'sentence-verification': { nLevel: 1, trialsCount: 20 },
  cryptogram: { nLevel: 1, trialsCount: 20 },
  'audiovisual-binding': { nLevel: 1, trialsCount: 20 },
  'cross-modal-matching': { nLevel: 1, trialsCount: 20 },
  'artificial-grammar': { nLevel: 1, trialsCount: 20 },
  'statistical-learning': { nLevel: 1, trialsCount: 20 },
  'contextual-cueing': { nLevel: 1, trialsCount: 20 },
  'emotional-go-nogo': { nLevel: 1, trialsCount: 20 },
  'emotional-stroop': { nLevel: 1, trialsCount: 20 },
  'emotional-nback': { nLevel: 1, trialsCount: 20 },
  'train-of-thought': { nLevel: 1, trialsCount: 20 },
  memobox: { nLevel: 1, trialsCount: 20 },
  'route-planning': { nLevel: 1, trialsCount: 20 },
  'pinball-recall': { nLevel: 1, trialsCount: 20 },
  'scene-crasher': { nLevel: 1, trialsCount: 20 },
  'speed-pack': { nLevel: 1, trialsCount: 20 },
  // --- Wave 2 ---
  'cambridge-gambling': { nLevel: 1, trialsCount: 20 },
  'information-sampling': { nLevel: 1, trialsCount: 20 },
  'game-of-dice': { nLevel: 1, trialsCount: 20 },
  'self-ordered-pointing': { nLevel: 1, trialsCount: 20 },
  cancellation: { nLevel: 1, trialsCount: 20 },
  rvp: { nLevel: 1, trialsCount: 20 },
  'line-orientation': { nLevel: 1, trialsCount: 20 },
  'hooper-visual': { nLevel: 1, trialsCount: 20 },
  'prototype-distortion': { nLevel: 1, trialsCount: 20 },
  syllogisms: { nLevel: 1, trialsCount: 20 },
  'proverb-interpretation': { nLevel: 1, trialsCount: 20 },
  'sentence-completion': { nLevel: 1, trialsCount: 20 },
  'brown-peterson': { nLevel: 1, trialsCount: 20 },
  'judgment-of-recency': { nLevel: 1, trialsCount: 20 },
  'negative-priming': { nLevel: 1, trialsCount: 20 },
  'clock-drawing': { nLevel: 1, trialsCount: 20 },
} as const;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * User settings that can override defaults
 */
export interface UserModeSettings {
  nLevel?: number;
  trialsCount?: number;
}

/**
 * Default fallback for unknown modes
 */
const FALLBACK_DEFAULTS: ModeDefaults = {
  nLevel: DEFAULT_N_LEVEL,
  trialsCount: DEFAULT_TRIALS_COUNT_TEMPO,
};

/**
 * Get effective mode configuration by merging user settings with defaults.
 *
 * @param modeId - Game mode ID
 * @param userSettings - User overrides from settings store
 * @returns Effective configuration (user setting or default)
 */
export function getEffectiveModeConfig(
  modeId: GameModeId,
  userSettings: UserModeSettings = {},
): ModeDefaults {
  const defaults = MODE_DEFAULTS[modeId as KnownGameModeId] ?? FALLBACK_DEFAULTS;
  return {
    nLevel: userSettings.nLevel ?? defaults.nLevel,
    trialsCount: userSettings.trialsCount ?? defaults.trialsCount,
  };
}

/**
 * Get route for a game mode
 */
export function getRouteForMode(modeId: GameModeId): GameRoute {
  return GAME_MODE_ROUTES[modeId as KnownGameModeId] ?? '/nback';
}

const ROUTE_TO_GAME_MODE = (() => {
  const routeToModes = new Map<GameRoute, KnownGameModeId[]>();

  for (const [modeId, route] of Object.entries(GAME_MODE_ROUTES) as Array<
    [KnownGameModeId, GameRoute]
  >) {
    const existing = routeToModes.get(route) ?? [];
    existing.push(modeId);
    routeToModes.set(route, existing);
  }

  const uniqueRoutes = new Map<GameRoute, KnownGameModeId>();
  for (const [route, modeIds] of routeToModes) {
    const onlyMode = modeIds[0];
    if (modeIds.length === 1 && onlyMode) {
      uniqueRoutes.set(route, onlyMode);
    }
  }
  return uniqueRoutes;
})();

export function getModeForRoute(route: string): GameModeId | undefined {
  return ROUTE_TO_GAME_MODE.get(route as GameRoute);
}

/**
 * Check if a mode uses tempo-style session (GameSessionMachine)
 */
export function isTempoMode(modeId: GameModeId): boolean {
  return (
    modeId === 'dual-catch' ||
    modeId === 'dualnback-classic' ||
    modeId === 'sim-brainworkshop' ||
    modeId === 'custom'
  );
}
