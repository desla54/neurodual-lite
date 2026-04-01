/**
 * Thresholds & Constants - Single Source of Truth
 *
 * TOUTES les valeurs numériques sont centralisées ici.
 * Les specs assemblent ces valeurs, elles ne les définissent JAMAIS.
 *
 * NAMING CONVENTION:
 * - Prefix = Catégorie (SCORING_, TIMING_, GEN_, DEFAULT_, etc.)
 * - Mode-specific = Mode prefix (JAEGGI_, BW_, TRACE_, etc.)
 *
 * CRÉER UN NOUVEAU MODE:
 * 1. Vérifier si les valeurs existent déjà ici
 * 2. Si non, les ajouter avec un nom clair
 * 3. Assembler la spec en important ces valeurs
 */

// #############################################################################
// #                                                                           #
// #                           APP METADATA                                     #
// #                    (Version et infos application)                         #
// #                                                                           #
// #############################################################################

/**
 * App version - Single Source of Truth.
 * Update this on each release.
 * Format: semver (MAJOR.MINOR.PATCH)
 */
export const APP_VERSION = '0.9.29' as const;

// #############################################################################
// #                                                                           #
// #                              SCORING                                       #
// #                    (Ce qui fait passer/échouer)                           #
// #                                                                           #
// #############################################################################

// =============================================================================
// SDT (Signal Detection Theory) - Dual Catch, Dual Tempo
// =============================================================================

/** SDT: d-prime pour monter (N+1) */
export const SDT_DPRIME_PASS = 1.5;

/** ALGO: d' cible par défaut (zone de flow) */
export const ADAPTIVE_TARGET_DPRIME_DEFAULT = SDT_DPRIME_PASS;

/** SDT: d-prime pour descendre (N-1) */
export const SDT_DPRIME_DOWN = 0.8;

// =============================================================================
// Jaeggi Protocol (Jaeggi et al., 2008) - dualnback-classic
// =============================================================================

/** JAEGGI: Seuil d'erreurs par modalité (< 3, "fewer than three" per Jaeggi 2008) */
export const JAEGGI_MAX_ERRORS_PER_MODALITY = 3;

/** JAEGGI: Erreurs par modalité pour descendre */
export const JAEGGI_ERRORS_DOWN = 5;

// =============================================================================
// BrainWorkshop Protocol - sim-brainworkshop
// =============================================================================

// -----------------------------------------------------------------------------
// BW Faithful Algorithm (matching original Brain Workshop 5.0)
// Two-stage stimulus generation: Guaranteed Match (12.5%) then Interference (12.5%)
// -----------------------------------------------------------------------------

/** BW FAITHFUL: Probabilité de guaranteed match (12.5%) */
export const BW_CHANCE_GUARANTEED_MATCH = 0.125;

/** BW FAITHFUL: Probabilité d'interférence near-miss (12.5%) */
export const BW_CHANCE_INTERFERENCE = 0.125;

/** BW FAITHFUL: Base du nombre de trials (20) */
export const BW_TRIALS_BASE = 20;

/** BW FAITHFUL: Facteur multiplicatif pour formule trials (1) */
export const BW_TRIALS_FACTOR = 1;

/** BW FAITHFUL: Exposant pour formule trials (2) → 20 + n² */
export const BW_TRIALS_EXPONENT = 2;

/** BW FAITHFUL: Ticks par défaut (30 = 3.0 secondes) */
export const BW_TICKS_DEFAULT = 30;

/** BW FAITHFUL: Durée d'un tick en ms (100ms = 0.1s) */
export const BW_TICK_DURATION_MS = 100;

/** BW FAITHFUL: Palier de réglage des probabilités (12.5%) */
export const BW_PROBABILITY_STEP = 0.125;

/**
 * BW FAITHFUL: Multi-stimulus interference reduction factor.
 * BW original divides interference probability by 1.5 when multiStimulus > 1.
 * This is a FIXED factor, not based on the number of streams.
 */
export const BW_MULTI_STIMULUS_INTERFERENCE_DIVISOR = 1.5;

/**
 * BW FAITHFUL: Global swap probability (1/3 = ~33%).
 * BW original has a 1/3 chance to circularly shift all visual stimuli
 * after generation, creating cross-stream confusion.
 */
export const BW_GLOBAL_SWAP_PROBABILITY = 1 / 3;

/**
 * BW FAITHFUL: Stimulus display base ticks (5 ticks = 500ms).
 * The stimulus is visible for this duration, then disappears.
 * This challenges iconic memory (short-term visual memory).
 */
export const BW_STIMULUS_BASE_TICKS = 5;

/**
 * BW FAITHFUL: Additional ticks per extra position stimulus.
 * For multiStimulus > 1, add 1 tick (100ms) per additional position.
 * - 1 position: 5 ticks = 500ms
 * - 2 positions: 6 ticks = 600ms
 * - 3 positions: 7 ticks = 700ms
 * - 4 positions: 8 ticks = 800ms
 */
export const BW_STIMULUS_TICKS_PER_EXTRA_POSITION = 1;

// -----------------------------------------------------------------------------
// BW Scoring (existing)
// -----------------------------------------------------------------------------

/** BW: Score normalisé pour monter (0.8 = 80%) */
export const BW_SCORE_PASS_NORMALIZED = 0.8;

/**
 * @deprecated Use BW_SCORE_PASS_NORMALIZED instead.
 * This was for the incorrect formula (H+CR-FA-M)/Total on scale -1 to +1.
 * The correct BW formula H/(H+M+FA) uses scale 0 to 1.
 */
export const BW_RAW_SCORE_PASS = 0.6;

/** BW: Score normalisé pour strike (0.5 = 50%) */
export const BW_SCORE_DOWN_NORMALIZED = 0.5;

/** BW: Seuil de progression en pourcentage */
export const BW_SCORE_UP_PERCENT = 80;

/** BW: Seuil de régression en pourcentage */
export const BW_SCORE_DOWN_PERCENT = 50;

/** BW: Strikes consécutifs pour descendre */
export const BW_STRIKES_TO_DOWN = 3;

/** BW: Base pour conversion score% → d' (50% → d'=0) */
export const BW_DPRIME_CONVERSION_BASE = 50;

/** BW: Facteur pour conversion score% → d' (80% → d'≈1.8, 100% → d'≈3.0) */
export const BW_DPRIME_CONVERSION_FACTOR = 0.06;

/** BW: Score neutre (50%) - utilisé comme fallback quand pas de données */
export const BW_NEUTRAL_SCORE = BW_DPRIME_CONVERSION_BASE;

// -----------------------------------------------------------------------------
// BW Multi-Stimulus (multiple positions/sounds per trial)
// Each position/audio stream has independent N-back history and scoring
// -----------------------------------------------------------------------------

/** BW MULTI: Nombre de stimuli simultanés (1-4) */
export type MultiStimulusCount = 1 | 2 | 3 | 4;

/** BW MULTI: Mode de différenciation visuelle */
export type MultiStimulusMode = 'color' | 'image';

/** BW MULTI: Modalités position par niveau de multi-stimulus */
export const MULTI_STIMULUS_POSITION_MODALITIES = {
  1: ['position'] as const,
  2: ['position', 'position2'] as const,
  3: ['position', 'position2', 'position3'] as const,
  4: ['position', 'position2', 'position3', 'position4'] as const,
} as const;

/** BW MULTI: Modalités audio par niveau (1-2 sons) */
export const MULTI_AUDIO_MODALITIES = {
  1: ['audio'] as const,
  2: ['audio', 'audio2'] as const,
} as const;

/** BW MULTI: Couleurs pour différenciation visuelle (mode 'color') */
export const MULTI_STIMULUS_COLORS = [
  '#3B82F6', // Bleu (position1)
  '#EF4444', // Rouge (position2)
  '#22C55E', // Vert (position3)
  '#F59E0B', // Orange (position4)
] as const;

/** BW MULTI: Formes pour différenciation visuelle (mode 'image') */
export const MULTI_STIMULUS_SHAPES = ['circle', 'square', 'triangle', 'diamond'] as const;

// -----------------------------------------------------------------------------
// Image N-Back Modality
// Images/shapes that player must remember (separate from multi-stimulus differentiation)
// -----------------------------------------------------------------------------

/** IMAGE MODALITY: 8 formes distinctes pour le N-back image (comme les 8 sons) */
export const IMAGE_MODALITY_SHAPES = [
  'circle',
  'square',
  'triangle',
  'diamond',
  'pentagon',
  'hexagon',
  'star',
  'cross',
] as const;

export type ImageShape = (typeof IMAGE_MODALITY_SHAPES)[number];

// -----------------------------------------------------------------------------
// Spatial Modality (8 arrow directions)
// -----------------------------------------------------------------------------

/** SPATIAL MODALITY: 8 directions (cardinal + diagonal) */
export const SPATIAL_DIRECTIONS = [
  'up',
  'up-right',
  'right',
  'down-right',
  'down',
  'down-left',
  'left',
  'up-left',
] as const;

export type SpatialDirection = (typeof SPATIAL_DIRECTIONS)[number];

// -----------------------------------------------------------------------------
// Digits Modality (0-9)
// -----------------------------------------------------------------------------

/** DIGITS MODALITY: 10 chiffres (0-9) */
export const DIGIT_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

export type DigitValue = (typeof DIGIT_VALUES)[number];

// -----------------------------------------------------------------------------
// Emotions Modality (8 universal emotions)
// -----------------------------------------------------------------------------

/**
 * EMOTIONS MODALITY: 8 émotions universelles (Ekman 6 + surprise + contempt).
 * Values are locale-agnostic keys; UI layer maps to translated labels.
 */
export const EMOTION_VALUES = [
  'joy',
  'sadness',
  'anger',
  'fear',
  'disgust',
  'surprise',
  'contempt',
  'neutral',
] as const;

export type EmotionValue = (typeof EMOTION_VALUES)[number];

// -----------------------------------------------------------------------------
// Words Modality (8 short common words)
// -----------------------------------------------------------------------------

/**
 * WORDS MODALITY: 8 mots courts et courants.
 * Values are locale-agnostic keys; UI layer maps to translated labels.
 *
 * French: main, chat, lune, feu, eau, roi, clé, vent
 * English: hand, cat, moon, fire, water, king, key, wind
 */
export const WORD_VALUES = [
  'word-hand',
  'word-cat',
  'word-moon',
  'word-fire',
  'word-water',
  'word-king',
  'word-key',
  'word-wind',
] as const;

export type WordValue = (typeof WORD_VALUES)[number];

// -----------------------------------------------------------------------------
// Tones Modality (8 familiar scale notes: Do Re Mi Fa Sol La Si Do)
// -----------------------------------------------------------------------------

/**
 * TONES MODALITY: 8 notes d'une gamme diatonique familiere.
 * Values are note identifiers; UI/audio layer maps them to frequencies.
 *
 * C4=261.6Hz, D4=293.7Hz, E4=329.6Hz, F4=349.2Hz,
 * G4=392.0Hz, A4=440.0Hz, B4=493.9Hz, C5=523.3Hz
 */
export const TONE_VALUES = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'] as const;

export type ToneValue = (typeof TONE_VALUES)[number];

// -----------------------------------------------------------------------------
// BW Arithmetic Modality (math problems)
// -----------------------------------------------------------------------------

/**
 * ARITHMETIC MODALITY: Possible answer values (0-12)
 * BW original uses answers up to 12 by default.
 * The user tracks the ANSWER to the arithmetic problem, not the problem itself.
 * E.g., "3+2" has answer 5, "7-4" has answer 3
 *
 * IMPORTANT: The UI should display only "A op B = ?" (no answer shown).
 * This ensures active mental calculation, not pattern recognition.
 */
export const ARITHMETIC_ANSWERS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
export type ArithmeticAnswer = (typeof ARITHMETIC_ANSWERS)[number];

/**
 * ARITHMETIC MODALITY: Operators available
 * BW original includes division at highest difficulty
 */
export const ARITHMETIC_OPERATORS = ['+', '-', '*', '/'] as const;
export type ArithmeticOperator = (typeof ARITHMETIC_OPERATORS)[number];

/**
 * ARITHMETIC MODALITY: Difficulty levels determine which operators and ranges are used
 * BW FAITHFUL: Each operator can be toggled, we expose 4 levels for simplicity:
 * Level 1: Addition only (+)
 * Level 2: Addition and subtraction (+ -)
 * Level 3: Addition, subtraction, and multiplication (+ - ×)
 * Level 4: All four operations (+ - × ÷)
 */
export const ARITHMETIC_DIFFICULTY_LEVELS = [1, 2, 3, 4] as const;
export type ArithmeticDifficulty = (typeof ARITHMETIC_DIFFICULTY_LEVELS)[number];

/**
 * ARITHMETIC MODALITY: Operators available per difficulty level
 * BW original allows toggling each operator independently, we simplify to 4 levels
 */
export const ARITHMETIC_OPERATORS_BY_DIFFICULTY: Record<
  ArithmeticDifficulty,
  readonly ArithmeticOperator[]
> = {
  1: ['+'],
  2: ['+', '-'],
  3: ['+', '-', '*'],
  4: ['+', '-', '*', '/'],
} as const;

/** BW MULTI: Bonus de timing en ticks par niveau de multi-stimulus */
export const MULTI_STIMULUS_TIMING_BONUS_TICKS = {
  1: 0, // Pas de bonus
  2: 5, // +0.5s (5 * 100ms)
  3: 10, // +1.0s
  4: 15, // +1.5s
} as const;

/** BW MULTI: Bonus de timing en ms */
export const MULTI_STIMULUS_TIMING_BONUS_MS = {
  1: 0,
  2: 500,
  3: 1000,
  4: 1500,
} as const;

/** BW MULTI: Décalage entre sons simultanés (en ms) pour clarté */
// BW dual-audio starts both players "simultaneously" (no intentional stagger).
export const MULTI_AUDIO_STAGGER_MS = 0;

// -----------------------------------------------------------------------------
// BW Self-Paced Mode (user advances manually instead of timer)
// -----------------------------------------------------------------------------

/** BW SELF-PACED: Timeout maximum en self-paced (ms) - évite les sessions infinies */
export const SELF_PACED_MAX_TIMEOUT_MS = 60000; // 60 secondes max par trial

// =============================================================================
// Score Bounds (universal)
// =============================================================================

/** SCORE: Score maximum (100) */
export const SCORE_MAX = 100;

/** SCORE: Score minimum (0) */
export const SCORE_MIN = 0;

// =============================================================================
// Accuracy-based (Flow, Recall, DualPick, Trace)
// =============================================================================

/** ACCURACY: Seuil pour passer (0.8 = 80%) */
export const ACCURACY_PASS_NORMALIZED = 0.8;

/** TRACE ACCURACY: Seuil pour passer (0.7 = 70%, mode beta) */
export const TRACE_ACCURACY_PASS_NORMALIZED = 0.7;

// =============================================================================
// Journey Scoring
// =============================================================================

/** JOURNEY: Score minimum pour session validante */
export const JOURNEY_MIN_PASSING_SCORE = 80;

/** JOURNEY: Score excellent → 1 session */
export const JOURNEY_SCORE_EXCELLENT = 95;

/** JOURNEY: Score bon → 2 sessions */
export const JOURNEY_SCORE_GOOD = 85;

/** JOURNEY: Score minimum → 3 sessions (= JOURNEY_MIN_PASSING_SCORE) */
export const JOURNEY_SCORE_PASSING = JOURNEY_MIN_PASSING_SCORE;

/** JOURNEY: UPS minimum pour éligibilité (same as UPS_TIER_INTERMEDIATE = 70) */
export const JOURNEY_MIN_UPS = 70;

/** JOURNEY: Sessions requises pour score excellent */
export const JOURNEY_SESSIONS_EXCELLENT = 1;

/** JOURNEY: Sessions requises pour score bon */
export const JOURNEY_SESSIONS_GOOD = 2;

/** JOURNEY: Sessions requises pour score passant */
export const JOURNEY_SESSIONS_PASSING = 3;

// =============================================================================
// UPS Tiers (elite/advanced/intermediate/novice)
// =============================================================================

export const UPS_TIER_ELITE = 90;
export const UPS_TIER_ADVANCED = 80;
export const UPS_TIER_INTERMEDIATE = 70;
export const UPS_TIER_NOVICE = 50;

/** UPS Tier accuracy (pour conversion accuracy → tier) = UPS_TIER_* / 100 */
export const UPS_TIER_ELITE_ACCURACY = UPS_TIER_ELITE / 100;
export const UPS_TIER_ADVANCED_ACCURACY = UPS_TIER_ADVANCED / 100;
export const UPS_TIER_INTERMEDIATE_ACCURACY = UPS_TIER_INTERMEDIATE / 100;

// =============================================================================
// Report PerformanceLevel (excellent/good/average/below-average/struggling)
// =============================================================================

export const REPORT_LEVEL_EXCELLENT_ACCURACY = 0.95;
export const REPORT_LEVEL_GOOD_ACCURACY = 0.85;
export const REPORT_LEVEL_AVERAGE_ACCURACY = 0.7;
export const REPORT_LEVEL_BELOW_AVERAGE_ACCURACY = 0.5;

export const REPORT_LEVEL_EXCELLENT_UPS = UPS_TIER_ELITE;
export const REPORT_LEVEL_GOOD_UPS = UPS_TIER_ADVANCED;
export const REPORT_LEVEL_AVERAGE_UPS = UPS_TIER_INTERMEDIATE;
export const REPORT_LEVEL_BELOW_AVERAGE_UPS = UPS_TIER_NOVICE;

// =============================================================================
// Progression Strategy
// =============================================================================

export const PROGRESSION_SCORE_UP = 80;
export const PROGRESSION_SCORE_STRIKE = 50;
export const PROGRESSION_STRIKES_TO_DOWN = 3;

// =============================================================================
// Flow State Detection
// =============================================================================

export const FLOW_CONFIDENCE_THRESHOLD = 80;

// #############################################################################
// #                                                                           #
// #                              TIMING                                        #
// #                    (Durées en millisecondes)                              #
// #                                                                           #
// #############################################################################

// =============================================================================
// Stimulus Duration (durée d'affichage du stimulus)
// =============================================================================

/** TEMPO: Durée stimulus standard (500ms) */
export const TIMING_STIMULUS_TEMPO_MS = 500;

/** FLOW/LABEL: Durée stimulus plus longue pour réflexion (1500ms) */
export const TIMING_STIMULUS_FLOW_MS = 1500;

/** RECALL: Durée stimulus pour mémorisation (1200ms) */
export const TIMING_STIMULUS_RECALL_MS = 1200;

/** TRACE: Durée stimulus pour swipe (2000ms) */
export const TIMING_STIMULUS_TRACE_MS = 2000;

/** TRACE WARMUP: Durée stimulus warmup (2500ms) */
export const TIMING_STIMULUS_TRACE_WARMUP_MS = 2500;

/**
 * TRACE: Extinction (cacher le stimulus avant fin).
 * Extinction = ratio * stimulusDurationMs, clamp [min, max].
 */
export const TRACE_EXTINCTION_RATIO = 0.65;
export const TRACE_EXTINCTION_MIN_MS = 200;
export const TRACE_EXTINCTION_MAX_MS = 1500;

// =============================================================================
// Trace Adaptive Timing (automatic difficulty adjustment)
// =============================================================================
// Maintains accuracy around 75% by adjusting timing parameters

/** TRACE ADAPTIVE: Target accuracy (75% = zone de flow) */
export const TRACE_ADAPTIVE_TARGET_ACCURACY = 0.75;

/** TRACE ADAPTIVE: Sliding window size for accuracy calculation */
export const TRACE_ADAPTIVE_WINDOW_SIZE = 15;

/** TRACE ADAPTIVE: EMA smoothing factor (0.3 = moderate responsiveness) */
export const TRACE_ADAPTIVE_SMOOTHING_FACTOR = 0.3;

/** TRACE ADAPTIVE: Minimum trials before adaptation starts */
export const TRACE_ADAPTIVE_MIN_TRIALS = 5;

// Bounds for adaptive parameters
/** TRACE ADAPTIVE: Stimulus duration minimum (ms) */
export const TRACE_ADAPTIVE_STIMULUS_MIN_MS = 600;

/** TRACE ADAPTIVE: Stimulus duration maximum (ms) */
export const TRACE_ADAPTIVE_STIMULUS_MAX_MS = 2500;

/** TRACE ADAPTIVE: Extinction ratio minimum */
export const TRACE_ADAPTIVE_EXTINCTION_MIN = 0.45;

/** TRACE ADAPTIVE: Extinction ratio maximum */
export const TRACE_ADAPTIVE_EXTINCTION_MAX = 0.8;

/** TRACE ADAPTIVE: Response window minimum (ms) - timed mode only */
export const TRACE_ADAPTIVE_RESPONSE_WINDOW_MIN_MS = 1500;

/** TRACE ADAPTIVE: Response window maximum (ms) - timed mode only */
export const TRACE_ADAPTIVE_RESPONSE_WINDOW_MAX_MS = 5000;

// Gains (adjustment step per unit of error)
/** TRACE ADAPTIVE: Stimulus duration adjustment per 10% accuracy error (ms) */
export const TRACE_ADAPTIVE_GAIN_STIMULUS_MS = 150;

/** TRACE ADAPTIVE: Extinction ratio adjustment per 10% accuracy error */
export const TRACE_ADAPTIVE_GAIN_EXTINCTION = 0.05;

/** TRACE ADAPTIVE: Response window adjustment per 10% accuracy error (ms) - timed mode only */
export const TRACE_ADAPTIVE_GAIN_RESPONSE_WINDOW_MS = 200;

// =============================================================================
// Interval (délai entre stimuli)
// =============================================================================

/** DEFAULT: Intervalle standard (3000ms) */
export const TIMING_INTERVAL_DEFAULT_MS = 3000;

/** TRACE: Intervalle court (500ms) */
export const TIMING_INTERVAL_TRACE_MS = 500;

// =============================================================================
// Visual Offset (compensation latence visuelle)
// =============================================================================

/**
 * Visual offset in ms (visual callback fires this many ms before the audio target).
 *
 * Set to 0: the visual callback fires at the same time as the audio target.
 * The browser render delay (~28-33ms) means the paint lands slightly after the audio,
 * producing an audio-first perception which is less noticeable than visual-first
 * (human threshold: ~45ms audio-first vs ~20ms visual-first).
 */
export const TIMING_VISUAL_OFFSET_DEFAULT_MS = 0;

/** Classic Dual N-Back (Jaeggi): same offset as default. */
export const TIMING_VISUAL_OFFSET_JAEGGI_MS = 0;

/**
 * Post-visual offset: compensates render delay at extinction so the visual hide paint
 * lands at the same time as the audio end. One RAF frame at 60fps ≈ 33ms.
 * This effectively shortens the visible stimulus to ~467ms while keeping start+end
 * audio-visual alignment symmetric.
 */
export const TIMING_POST_VISUAL_OFFSET_MS = 33;

// =============================================================================
// Response & Feedback
// =============================================================================

/** Session prep delay avant premier trial (4000ms: 3, 2, 1, 0 avec 1s/step) */
export const TIMING_SESSION_PREP_MS = 4000;

/** Temps de réaction minimum valide (100ms) */
export const TIMING_MIN_VALID_RT_MS = 100;

/** RECALL/TRACE: Durée feedback longue (1500ms) */
export const TIMING_FEEDBACK_MS = 1500;

/** DEFAULT: Durée feedback standard (500ms) - fallback timers */
export const TIMING_FEEDBACK_DEFAULT_MS = 500;

/** TIMER: Intervalle minimum entre actions utilisateur (100ms) - anti-spam */
export const TIMING_MIN_INTERVAL_SPAM_MS = 100;

/** TRACE: Fenêtre de réponse en mode timed (3000ms) */
export const TIMING_RESPONSE_WINDOW_TRACE_MS = 3000;

/** TRACE: Durée affichage règle (1000ms) */
export const TIMING_RULE_DISPLAY_TRACE_MS = 1000;

/** DUAL LABEL: Délai inter-trial (500ms) */
export const TIMING_DUAL_PICK_INTER_TRIAL_MS = 500;

/** DUAL LABEL: Points perdus par erreur (fallback sans trajectory data) */
export const DUAL_PICK_FALLBACK_POINTS_PER_ERROR = 5;

/** FLOW: Délai de démarrage session (300ms) */
export const TIMING_SESSION_STARTUP_MS = 300;

// =============================================================================
// Validation Bounds (limites de validation config)
// =============================================================================

/** VALIDATION: Intervalle minimum en secondes (0.5s) */
export const VALIDATION_MIN_INTERVAL_SECONDS = 0.5;

/** RECALL: Pause additionnelle ISI = stimulus + pause (0.5s) */
export const TIMING_ISI_PAUSE_SECONDS = 0.5;

// #############################################################################
// #                                                                           #
// #                            GENERATION                                      #
// #                    (Probabilités de génération)                           #
// #                                                                           #
// #############################################################################

// =============================================================================
// Target Probability (probabilité de cible N-back)
// =============================================================================

/** DEFAULT: Probabilité target standard (30%) */
export const GEN_TARGET_PROBABILITY_DEFAULT = 0.3;

/** RECALL: Probabilité target élevée (50%) */
export const GEN_TARGET_PROBABILITY_HIGH = 0.5;

/**
 * JAEGGI: Distribution fixe par modalité (30% = 6/20).
 *
 * Le générateur Jaeggi utilise une distribution FIXE (4 V-Seul + 4 A-Seul + 2 Dual + 10 Non-Cible).
 * Cette valeur est documentative - le générateur n'utilise pas targetProbability.
 *
 * Distribution par modalité:
 * - Position targets: 4 V-Seul + 2 Dual = 6/20 = 30%
 * - Audio targets: 4 A-Seul + 2 Dual = 6/20 = 30%
 */
export const GEN_TARGET_PROBABILITY_JAEGGI = 0.3;

/** FLOW/BW: Probabilité target basse (25%) */
export const GEN_TARGET_PROBABILITY_LOW = 0.25;

// =============================================================================
// Lure Probability (probabilité de leurre)
// =============================================================================

/** DEFAULT: Probabilité lure standard (15%) */
export const GEN_LURE_PROBABILITY_DEFAULT = 0.15;

/** LABEL: Probabilité lure réduite (10%) */
export const GEN_LURE_PROBABILITY_LABEL = 0.1;

/** BW: Probabilité lure BrainWorkshop (12.5%) */
export const GEN_LURE_PROBABILITY_BW = 0.125;

/** JAEGGI/FLOW/RECALL: Pas de lures (0%) */
export const GEN_LURE_PROBABILITY_NONE = 0;

// =============================================================================
// Sequence Engine Constants
// =============================================================================

/** SEQUENCE: Multiplicateur minimum de probabilité (plancher) */
export const SEQUENCE_MIN_PROBABILITY_MULTIPLIER = 0.001;

/** SEQUENCE: Taux de fatigue par défaut (baisse de perf par trial) */
export const SEQUENCE_FATIGUE_RATE_DEFAULT = 0.001;

/** SEQUENCE: Tolérance pour normalisation des probabilités (erreurs d'arrondi float) */
export const SEQUENCE_PROBABILITY_TOLERANCE = 0.0001;

// =============================================================================
// Sequence Validation Defaults
// =============================================================================

/** SEQUENCE_VALIDATION: Tolérance pour les taux cibles (±10%) */
export const SEQUENCE_VALIDATION_TOLERANCE = 0.1;

/** SEQUENCE_VALIDATION: Max valeurs consécutives identiques (warning) */
export const SEQUENCE_VALIDATION_MAX_CONSECUTIVE_SAME = 3;

/** SEQUENCE_VALIDATION: Max targets consécutifs (warning) */
export const SEQUENCE_VALIDATION_MAX_CONSECUTIVE_TARGETS = 4;

/** SEQUENCE_VALIDATION: Ratio minimum de diversité des valeurs */
export const SEQUENCE_VALIDATION_MIN_DIVERSITY_RATIO = 0.5;

// =============================================================================
// Sequence Constraints
// =============================================================================

/** CONSTRAINT: Poids par défaut pour PreferVariety (soft constraint) */
export const CONSTRAINT_PREFER_VARIETY_WEIGHT = 0.5;

/** CONSTRAINT: Poids réduit pour PreferVariety dans les soft constraints par défaut */
export const CONSTRAINT_PREFER_VARIETY_WEIGHT_DEFAULT = 0.35;

/** CONSTRAINT: Fenêtre de lookback pour PreferVariety */
export const CONSTRAINT_PREFER_VARIETY_LOOKBACK = 5;

// =============================================================================
// Event Store Retry Configuration
// =============================================================================

/** STORE: Délai initial de retry en ms (5s) */
export const STORE_RETRY_BASE_DELAY_MS = 5000;

/** STORE: Multiplicateur backoff exponentiel */
export const STORE_RETRY_BACKOFF_MULTIPLIER = 1.5;

/** STORE: Délai maximum de retry en ms (2 minutes) */
export const STORE_RETRY_MAX_DELAY_MS = 120_000;

/** STORE: Nombre max de retries avant abandon */
export const STORE_RETRY_MAX_ATTEMPTS = 10;

/** STORE: Taille max de la queue d'écriture en attente */
export const STORE_RETRY_MAX_PENDING_SIZE = 100;

// #############################################################################
// #                                                                           #
// #                             DEFAULTS                                       #
// #                    (Valeurs par défaut des sessions)                      #
// #                                                                           #
// #############################################################################

// =============================================================================
// N-Level
// =============================================================================

/** DEFAULT: Niveau N de départ */
export const DEFAULT_N_LEVEL = 2;

// =============================================================================
// Trials Count (nombre de trials par session)
// =============================================================================

/** TEMPO/TRACE: Nombre de trials standard (20) */
export const DEFAULT_TRIALS_COUNT_TEMPO = 20;

/** FLOW/LABEL/RECALL: Nombre de trials réduit (12) */
export const DEFAULT_TRIALS_COUNT_FLOW = 12;

// =============================================================================
// Distractor Defaults (Place/Pick modes)
// =============================================================================

/** DISTRACTOR: Nombre de distracteurs par défaut */
export const DEFAULT_DISTRACTOR_COUNT = 0;

// #############################################################################
// #                                                                           #
// #                          RECALL-SPECIFIC                                   #
// #                    (Configuration Dual Memo)                              #
// #                                                                           #
// #############################################################################

/** RECALL: Profondeur de fenêtre (N, N-1, N-2 = 3) */
export const RECALL_WINDOW_DEPTH = 3;

/** RECALL Progressive: Profondeur initiale */
export const RECALL_PROGRESSIVE_INITIAL_DEPTH = 1;

/** RECALL Progressive: Seuil d'expansion (80%) */
export const RECALL_PROGRESSIVE_EXPANSION_THRESHOLD = 0.8;

/** RECALL Progressive: Seuil de contraction (50%) */
export const RECALL_PROGRESSIVE_CONTRACTION_THRESHOLD = 0.5;

/** RECALL Progressive: Fenêtres d'observation */
export const RECALL_PROGRESSIVE_OBSERVATION_WINDOWS = 4;

/** RECALL Progressive: Fenêtres de cooldown */
export const RECALL_PROGRESSIVE_COOLDOWN_WINDOWS = 2;

// #############################################################################
// #                                                                           #
// #                          TRACE-SPECIFIC                                    #
// #                    (Configuration Dual Trace)                             #
// #                                                                           #
// #############################################################################

/** TRACE Writing: Taille minimum zone d'écriture (px) */
export const TRACE_WRITING_MIN_SIZE_PX = 200;

/** TRACE Writing: Timeout de sécurité (ms) */
export const TRACE_WRITING_TIMEOUT_MS = 60000;

/** TRACE Writing: Opacité du fade de grille */
export const TRACE_WRITING_GRID_FADE_OPACITY = 0.2;

/** TRACE Writing: Nombre minimum de points pour déclencher la reconnaissance */
export const TRACE_WRITING_MIN_POINTS_FOR_RECOGNITION = 10;

/** TRACE Writing: Seuil minimum de confiance pour une reconnaissance valide */
export const TRACE_WRITING_MIN_CONFIDENCE_THRESHOLD = 0.3;

// =============================================================================
// Trace Arithmetic Interference
// =============================================================================
// Occupe la boucle phonologique entre stimulus et réponse pour éviter le chunking

/** TRACE Arithmetic: Nombre minimum d'opérations */
export const TRACE_ARITHMETIC_MIN_OPERATIONS = 1;

/** TRACE Arithmetic: Nombre maximum d'opérations */
export const TRACE_ARITHMETIC_MAX_OPERATIONS = 1;

/** TRACE Arithmetic: Résultat minimum (clavier: pas de négatifs, pas de 0) */
export const TRACE_ARITHMETIC_MIN_RESULT = 1;

/** TRACE Arithmetic: Résultat maximum (facile à écrire) */
export const TRACE_ARITHMETIC_MAX_RESULT = 20;

/** TRACE Arithmetic: Valeur maximum des chiffres */
export const TRACE_ARITHMETIC_MAX_DIGIT = 9;

/** TRACE Arithmetic: Timeout écriture (ms) */
export const TRACE_ARITHMETIC_TIMEOUT_MS = 15000;

// =============================================================================
// Trace Mirror Grid (Dyslatéralisation)
// =============================================================================

/** TRACE Mirror Grid: nombre de colonnes */
export const TRACE_GRID_COLS_MIRROR = 4;

/** TRACE Mirror Grid: nombre de lignes */
export const TRACE_GRID_ROWS_MIRROR = 3;

/** TRACE Mirror Grid: nombre total de positions (3×4 = 12) */
export const TRACE_POSITIONS_MIRROR = 12;

// =============================================================================
// Corsi Block
// =============================================================================

/** CORSI: Block highlight duration during sequence presentation (ms) */
export const CORSI_BLOCK_HIGHLIGHT_MS = 700;

/** CORSI: Gap between blocks during sequence presentation (ms) */
export const CORSI_BLOCK_GAP_MS = 300;

/** CORSI: Default starting span */
export const CORSI_DEFAULT_START_SPAN = 2;

/** CORSI: Maximum span (9 positions on 3×3 grid) */
export const CORSI_MAX_SPAN = 9;

/** CORSI: Consecutive failures before session ends */
export const CORSI_MAX_CONSECUTIVE_FAILURES = 2;

// #############################################################################
// #                                                                           #
// #                              BADGES                                        #
// #                    (Seuils spécifiques aux badges)                        #
// #                                                                           #
// #############################################################################

// =============================================================================
// Badge Session Milestones
// =============================================================================

/** BADGE: Première session */
export const BADGE_SESSIONS_FIRST = 1;

/** BADGE: Sessions Bronze (10) */
export const BADGE_SESSIONS_BRONZE = 10;

/** BADGE: Sessions Argent (25) */
export const BADGE_SESSIONS_SILVER = 25;

/** BADGE: Sessions Or (50) */
export const BADGE_SESSIONS_GOLD = 50;

/** BADGE: Sessions early/late minimum (5) */
export const BADGE_SESSIONS_TIME_OF_DAY = 5;

/** BADGE: Sessions sans abandon pour Zen Master */
export const BADGE_ZEN_MASTER_SESSIONS = 10;

/** BADGE: Sessions sans abandon pour Imperturbable */
export const BADGE_IMPERTURBABLE_TRIALS = 20;

/** BADGE: Erreurs minimum pour Sang-Froid */
export const BADGE_SANG_FROID_MIN_ERRORS = 5;

/** BADGE: Sessions consécutives sans pause pour badge Sans Interruption */
export const BADGE_NO_PAUSE_STREAK = 5;

// =============================================================================
// Badge Streak Thresholds
// =============================================================================

/** BADGE: Streak naissant (3 jours) */
export const BADGE_STREAK_NASCENT = 3;

/** BADGE: Streak quotidien (7 jours) */
export const BADGE_STREAK_WEEKLY = 7;

/** BADGE: Streak ancré (14 jours) */
export const BADGE_STREAK_BIWEEKLY = 14;

/** BADGE: Streak discipline (30 jours) */
export const BADGE_STREAK_MONTHLY = 30;

/** BADGE: Streak trimestriel (90 jours) */
export const BADGE_STREAK_QUARTERLY = 90;

/** BADGE: Streak annuel (365 jours) */
export const BADGE_STREAK_YEARLY = 365;

/** BADGE: Jours d'absence pour Retour en Force */
export const BADGE_COMEBACK_DAYS = 3;

/** BADGE: Heure max pour Lève-tôt (avant 8h) */
export const BADGE_EARLY_BIRD_HOUR = 8;

/** BADGE: Heure min pour Oiseau de Nuit (22h ou après) */
export const BADGE_NIGHT_OWL_HOUR = 22;

// =============================================================================
// Badge Accuracy Thresholds
// =============================================================================

/** BADGE: Accuracy forte pour skill gap (80%) */
export const BADGE_STRONG_MODALITY_ACCURACY = 0.8;

/** BADGE: Accuracy faible pour skill gap (70%) */
export const BADGE_WEAK_MODALITY_ACCURACY = 0.7;

/** BADGE: Sniper accuracy (90%) */
export const BADGE_ACCURACY_SNIPER = 0.9;

/** BADGE: Chirurgical accuracy (95%) */
export const BADGE_ACCURACY_SURGICAL = 0.95;

/** BADGE: Laser accuracy (98%) */
export const BADGE_ACCURACY_LASER = 0.98;

/** BADGE: Dual Master accuracy (85%) */
export const BADGE_ACCURACY_DUAL_MASTER = 0.85;

/** BADGE: Dual Elite accuracy (90%) */
export const BADGE_ACCURACY_DUAL_ELITE = 0.9;

// =============================================================================
// Badge Reaction Time Thresholds
// =============================================================================

/** BADGE: RT vif (500ms) */
export const BADGE_RT_QUICK_MS = 500;

/** BADGE: RT flash (400ms) */
export const BADGE_RT_FLASH_MS = 400;

/** BADGE: RT éclair (300ms) */
export const BADGE_RT_LIGHTNING_MS = 300;

/** BADGE: Temps de réaction rapide - alias */
export const BADGE_FAST_RT_MS = BADGE_RT_LIGHTNING_MS;

/** BADGE: RT std dev pour Régulier (100ms) */
export const BADGE_RT_CONSISTENT_STD_MS = 100;

/** BADGE: RT std dev pour Métronome (50ms) */
export const BADGE_RT_METRONOME_STD_MS = 50;

/** BADGE: Trials minimum pour Métronome */
export const BADGE_METRONOME_MIN_TRIALS = 20;

// =============================================================================
// Badge N-Level Thresholds
// =============================================================================

/** BADGE: Cerveau Affûté (N-3) */
export const BADGE_N_LEVEL_SHARP = 3;

/** BADGE: Génie en Herbe (N-4) */
export const BADGE_N_LEVEL_GENIUS = 4;

/** BADGE: Virtuose (N-5) */
export const BADGE_N_LEVEL_VIRTUOSO = 5;

/** BADGE: Légende (N-7) */
export const BADGE_N_LEVEL_LEGEND = 7;

/** BADGE: Transcendé (N-10) */
export const BADGE_N_LEVEL_TRANSCENDED = 10;

// =============================================================================
// Badge D-Prime Thresholds
// =============================================================================

/** BADGE: Maître d' (d-prime > 3.0) */
export const BADGE_DPRIME_MASTER = 3.0;

/** BADGE: Expert SDT (d-prime > 4.0) */
export const BADGE_DPRIME_EXPERT = 4.0;

/** BADGE: Second Souffle - amélioration d-prime */
export const BADGE_DPRIME_IMPROVEMENT = 0.3;

// =============================================================================
// Badge Modality Balance Thresholds
// =============================================================================

/** BADGE: Ratio déséquilibre Audiophile (80% audio) */
export const BADGE_MODALITY_IMBALANCE_HIGH = 0.8;

/** BADGE: Ratio déséquilibre Eye (70% position) */
export const BADGE_MODALITY_IMBALANCE_LOW = 0.7;

/** BADGE: Tolérance Synchronisé (5%) */
export const BADGE_MODALITY_SYNC_TOLERANCE = 0.05;

// =============================================================================
// Badge Cognitive Thresholds
// =============================================================================

/** BADGE: État de Grâce - seuil composantes (= FLOW_CONFIDENCE_THRESHOLD) */
export const BADGE_FLOW_STATE_THRESHOLD = FLOW_CONFIDENCE_THRESHOLD;

/** BADGE: Vétéran - jours d'activité (365) */
export const BADGE_VETERAN_DAYS = 365;

// =============================================================================
// Badge Milestone Thresholds (trials/sessions totaux)
// =============================================================================

/** BADGE: Milestones de sessions totales */
export const BADGE_MILESTONE_SESSIONS = [100, 250, 500, 1000] as const;

/** BADGE: Trials 500 (Pratiquant) */
export const BADGE_TRIALS_PRACTITIONER = 500;

/** BADGE: Trials 1000 (Entraîné) */
export const BADGE_TRIALS_TRAINED = 1000;

/** BADGE: Milestones de trials totaux (high tier) */
export const BADGE_MILESTONE_TRIALS = [5000, 10000, 50000] as const;

// #############################################################################
// #                                                                           #
// #                         UPS (Unified Performance Score)                   #
// #                    (Calcul du score unifié)                               #
// #                                                                           #
// #############################################################################

// =============================================================================
// UPS Formula Weights
// =============================================================================

/** UPS: Poids accuracy dans formule (60%) */
export const UPS_ACCURACY_WEIGHT = 0.6;

/** UPS: Poids confidence dans formule (40%) */
export const UPS_CONFIDENCE_WEIGHT = 0.4;

// =============================================================================
// UPS Minimum Data Requirements
// =============================================================================

/** UPS TEMPO: Minimum responses (USER_RESPONDED) to compute confidence reliably */
export const UPS_MIN_TRIALS_FOR_CONFIDENCE = 10;

/** UPS FLOW: Minimum drops pour calculer confidence */
export const UPS_MIN_DROPS_FOR_CONFIDENCE = 10;

/** UPS RECALL: Minimum windows pour calculer confidence */
export const UPS_MIN_WINDOWS_FOR_CONFIDENCE = 1;

// =============================================================================
// Tempo Confidence Weights (sum = 1.0)
// =============================================================================

/** TEMPO CONFIDENCE: Poids discipline timing */
export const TEMPO_WEIGHT_TIMING_DISCIPLINE = 0.35;

/** TEMPO CONFIDENCE: Poids stabilité RT */
export const TEMPO_WEIGHT_RT_STABILITY = 0.2;

/** TEMPO CONFIDENCE: Poids stabilité pression */
export const TEMPO_WEIGHT_PRESS_STABILITY = 0.2;

/** TEMPO CONFIDENCE: Poids conscience erreur */
export const TEMPO_WEIGHT_ERROR_AWARENESS = 0.2;

/** TEMPO CONFIDENCE: Poids focus */
export const TEMPO_WEIGHT_FOCUS = 0.05;

/** TEMPO CONFIDENCE: Score neutre par défaut */
export const TEMPO_CONFIDENCE_NEUTRAL = 50;

// =============================================================================
// Tempo Stability Thresholds (CV = Coefficient of Variation)
// =============================================================================

/** TEMPO STABILITY: Seuil CV pour stabilité RT (60% variation) */
export const TEMPO_RT_CV_THRESHOLD = 0.6;

/** TEMPO STABILITY: Seuil CV pour stabilité pression (80% variation) */
export const TEMPO_PRESS_CV_THRESHOLD = 0.8;

// =============================================================================
// Mouse Input Adjustments
// =============================================================================

/**
 * MOUSE INPUT: Estimated cursor speed in pixels per millisecond.
 * Used to estimate travel time from cursor travel distance.
 * Average mouse speed is ~400-600 px/s = 0.4-0.6 px/ms.
 * Using 0.5 px/ms as a reasonable middle ground.
 */
export const MOUSE_CURSOR_SPEED_PX_PER_MS = 0.5;

/**
 * MOUSE INPUT: Minimum proportion of mouse responses to trigger mouse-aware calculations.
 * If >= 50% of responses are mouse input, we apply mouse-specific adjustments.
 */
export const MOUSE_RESPONSE_THRESHOLD = 0.5;

// =============================================================================
// Tempo Post-Error Slowing (PES) Thresholds
// =============================================================================
// Post-Error Slowing (PES) measures metacognitive awareness by comparing
// response times after errors vs on correct hits.
//
// PES Ratio = RT_after_error / RT_on_hits
//   > 1.0 = User slows down after error (good, vigilant behavior)
//   < 1.0 = User speeds up after error (impulsive, potentially problematic)
//   ≈ 1.0 = Neutral (no effect)
//
// Reference: Dutilh et al. (2012) - Testing theories of post-error slowing
//
// UI Labels (based on ratio):
//   > 1.10 = "Vigilant" (green)   - Clearly slows down
//   0.95-1.10 = "Adjusts" (yellow) - Moderate adjustment
//   0.90-0.95 = "Neutral" (gray)   - No significant change
//   < 0.90 = "Rushes" (red)        - Speeds up (impulsive)

/**
 * TEMPO PES: Minimum post-error pairs needed for reliable calculation.
 * With < 3 pairs, the ratio is statistically unreliable.
 */
export const TEMPO_PES_MIN_PAIRS = 3;

/**
 * TEMPO PES: Ratio below which user is considered "impulsive/rushing".
 * < 0.9 means user speeds up by >10% after an error.
 */
export const TEMPO_PES_MIN_RATIO = 0.9;

/**
 * TEMPO PES: Ratio above which user is considered "vigilant".
 * > 1.1 means user slows down by >10% after an error.
 */
export const TEMPO_PES_MAX_RATIO = 1.1;

/**
 * TEMPO PES: Maximum lookahead window (in trials) to find a "post-error" hit.
 *
 * Why: relying on strictly (trialIndex+1) is brittle when the event stream
 * doesn't explicitly contain correct rejections (no response) or when there are
 * gaps (e.g., CR between an error and the next hit). A small lookahead keeps the
 * metric interpretable while making it measurable.
 */
export const TEMPO_PES_LOOKAHEAD_TRIALS = 3;

// =============================================================================
// Tempo Focus (Micro-Lapse) Thresholds
// =============================================================================

/** TEMPO FOCUS: Minimum hits pour calculer focus */
export const TEMPO_FOCUS_MIN_HITS = 10;

/** TEMPO FOCUS: Multiplicateur RT pour détecter lapse (2.5x médiane) */
export const TEMPO_FOCUS_LAPSE_MULTIPLIER = 2.5;

// =============================================================================
// Jaeggi Confidence Weights
// =============================================================================
// Mode Jaeggi classique : formule conditionnelle basée sur l'accuracy
// Si accuracy >= 90% : timing annulé (joueur rapide ET bon = vivacité)
// Si accuracy < 90% : timing pénalisé (réponse rapide = fébrilité)

/** JAEGGI CONFIDENCE: Seuil accuracy pour annuler pénalité timing */
export const JAEGGI_CONFIDENCE_ACCURACY_THRESHOLD = 0.9;

// Poids AVEC timing (accuracy < 90%) - sum = 1.0
/** JAEGGI CONFIDENCE: Poids stabilité RT (avec timing) */
export const JAEGGI_WEIGHT_RT_STABILITY = 0.35;

/** JAEGGI CONFIDENCE: Poids conscience erreur (avec timing) */
export const JAEGGI_WEIGHT_ERROR_AWARENESS = 0.25;

/** JAEGGI CONFIDENCE: Poids focus (avec timing) */
export const JAEGGI_WEIGHT_FOCUS = 0.2;

/** JAEGGI CONFIDENCE: Poids discipline timing (avec timing) */
export const JAEGGI_WEIGHT_TIMING = 0.1;

/** JAEGGI CONFIDENCE: Poids stabilité pression (avec timing) */
export const JAEGGI_WEIGHT_PRESS_STABILITY = 0.1;

// Poids SANS timing (accuracy >= 90%) - sum = 1.0
/** JAEGGI CONFIDENCE: Poids stabilité RT (sans timing) */
export const JAEGGI_WEIGHT_RT_STABILITY_HIGH = 0.4;

/** JAEGGI CONFIDENCE: Poids conscience erreur (sans timing) */
export const JAEGGI_WEIGHT_ERROR_AWARENESS_HIGH = 0.3;

/** JAEGGI CONFIDENCE: Poids focus (sans timing) */
export const JAEGGI_WEIGHT_FOCUS_HIGH = 0.2;

/** JAEGGI CONFIDENCE: Poids stabilité pression (sans timing) */
export const JAEGGI_WEIGHT_PRESS_STABILITY_HIGH = 0.1;

// #############################################################################
// #                                                                           #
// #                      ADAPTIVE ALGORITHMS                                   #
// #                   (ARM, Thompson Sampling, Meta-Learning)                  #
// #                                                                           #
// #############################################################################

// =============================================================================
// D-Prime Window (Sliding window for performance estimation)
// =============================================================================

/** ADAPTIVE: Taille fenêtre glissante pour estimer d-prime */
export const ADAPTIVE_DPRIME_WINDOW_SIZE = 40;

// =============================================================================
// ARM Parameter Bounds (Adaptive Resource Manager)
// =============================================================================

/** ARM: Probabilité target minimum */
export const ARM_PTARGET_MIN = 0.15;

/** ARM: Probabilité target maximum */
export const ARM_PTARGET_MAX = 0.45;

/** ARM: Probabilité lure minimum */
export const ARM_PLURE_MIN = 0.02;

/** ARM: Probabilité lure maximum */
export const ARM_PLURE_MAX = 0.25;

/** ARM: ISI minimum (ms) */
export const ARM_ISI_MIN_MS = 1500;

/** ARM: ISI maximum (ms) */
export const ARM_ISI_MAX_MS = 5000;

/** ARM: Durée stimulus minimum (ms) */
export const ARM_STIMULUS_DURATION_MIN_MS = 250;

/** ARM: Durée stimulus maximum (ms) */
export const ARM_STIMULUS_DURATION_MAX_MS = 1500;

/** ARM JITTER: Base ISI minimum (ms) */
export const ARM_JITTER_BASE_ISI_MIN_MS = 2000;

/** ARM JITTER: Base ISI maximum (ms) */
export const ARM_JITTER_BASE_ISI_MAX_MS = 4000;

/** ARM JITTER: Jitter minimum (ms) */
export const ARM_JITTER_MIN_MS = 0;

/** ARM JITTER: Jitter maximum (ms) */
export const ARM_JITTER_MAX_MS = 500;

// =============================================================================
// Preferred ISI (User cognitive profile)
// =============================================================================

/** PROFILE: ISI préféré par défaut (ms) */
export const PROFILE_PREFERRED_ISI_DEFAULT_MS = 2500;

/** PROFILE: ISI préféré minimum (ms) */
export const PROFILE_PREFERRED_ISI_MIN_MS = 1500;

/** PROFILE: ISI préféré maximum (ms) */
export const PROFILE_PREFERRED_ISI_MAX_MS = 4000;

/** PROFILE: Multiplicateur RT moyen pour calculer ISI préféré */
export const PROFILE_ISI_RT_MULTIPLIER = 1.8;

/** PROFILE: Offset ajouté au RT * multiplier (ms) */
export const PROFILE_ISI_OFFSET_MS = 500;

/** PROFILE: flowScore par défaut (neutre) */
export const PROFILE_FLOW_SCORE_DEFAULT = 0.5;

// #############################################################################
// #                                                                           #
// #                         XP & LEVEL SYSTEM                                  #
// #                    (Train-to-Own Progression)                             #
// #                                                                           #
// #############################################################################

// =============================================================================
// XP Caps & Bonuses
// =============================================================================

/** XP: Nombre max de sessions/jour pour gagner de l'XP */
export const XP_DAILY_SESSION_CAP = 5;

/** XP: Plancher minimum par session (présence) */
export const XP_MIN_FLOOR = 50;

/** XP: Bonus état de flow */
export const XP_FLOW_BONUS = 100;

/** XP: Bonus par nouveau badge (performance badges) */
export const XP_BADGE_BONUS = 100;

/** XP: Bonus par badge cumulatif (milestone/consistency) - réduit pour éviter le farming */
export const XP_BADGE_BONUS_CUMULATIVE = 25;

/** Badge: Seuil minimum de réponses pour session valide (50%) */
export const BADGE_MIN_RESPONSE_RATE = 0.5;

/** Badge: Maximum de badges débloquables par session (anti-spam) */
export const BADGE_MAX_PER_SESSION = 2;

// =============================================================================
// Badge Anti-Gaming Thresholds (prévention des déverrouillages inappropriés)
// =============================================================================

/** Badge RT: Minimum de réponses pour valider un badge RT */
export const BADGE_RT_MIN_RESPONSES = 10;

/** Badge RT: Accuracy minimale pour badges RT rapides (évite le spam) */
export const BADGE_RT_MIN_ACCURACY = 0.7;

/** Badge Modalité: Minimum de trials par modalité pour badges exploration */
export const BADGE_MIN_TRIALS_PER_MODALITY = 10;

/** Badge Synchronized: Accuracy minimale pour les deux modalités */
export const BADGE_SYNC_MIN_ACCURACY = 0.6;

/** Badge Sang-Froid: Accuracy minimale pour valider le badge */
export const BADGE_SANG_FROID_MIN_ACCURACY = 0.7;

/** Badge Imperturbable: Accuracy minimale pour valider le badge */
export const BADGE_IMPERTURBABLE_MIN_ACCURACY = 0.6;

/** Badge Second Souffle: d-prime minimum pour la seconde moitié */
export const BADGE_SECOND_WIND_MIN_DPRIME = 2.0;

/** Badge Second Souffle: Minimum de trials pour avoir des moitiés significatives */
export const BADGE_SECOND_WIND_MIN_TRIALS = 20;

/** Badge Comeback Strong: d-prime minimum absolu pour valider le badge */
export const BADGE_COMEBACK_MIN_DPRIME = 2.5;

/** Badge No Pause: Accuracy minimale pour valider le badge (évite sessions triviales) */
export const BADGE_NO_PAUSE_MIN_ACCURACY = 0.75;

/** Badge Steady Hands: Accuracy minimale pour valider le badge */
export const BADGE_STEADY_HANDS_MIN_ACCURACY = 0.8;

/** Badge Dual Master: Minimum de leurres par modalité (évite sessions sans leurres) */
export const BADGE_MIN_LURES_PER_MODALITY = 6;

/** XP: Bonus première session du jour */
export const XP_DAILY_FIRST_BONUS = 25;

/** XP: Multiplicateur streak (si >= 2 jours) */
export const XP_STREAK_MULTIPLIER = 0.2;

/** XP: Jours minimum pour activer streak bonus */
export const XP_STREAK_MIN_DAYS = 2;

// =============================================================================
// XP Performance Weights (calcul du score de performance)
// =============================================================================

/** XP: Poids du niveau N (50 XP par niveau N) */
export const XP_N_LEVEL_WEIGHT = 50;

/** XP: Poids du d-prime (100 XP par point de d') */
export const XP_DPRIME_WEIGHT = 100;

/** XP: Poids de l'accuracy (200 XP pour 100%) */
export const XP_ACCURACY_WEIGHT = 200;

// =============================================================================
// Level Thresholds (30 niveaux)
// =============================================================================

/**
 * XP requise pour chaque niveau.
 * Train-to-Own milestones:
 * - Level 5 (10k XP) → 7 jours Premium
 * - Level 10 (40k XP) → 1 mois Premium
 * - Level 20 (120k XP) → 3 mois Premium
 * - Level 30 (300k XP) → Accès Permanent
 */
export const XP_LEVEL_THRESHOLDS: readonly number[] = [
  0, // Level 1
  500, // Level 2
  1200, // Level 3
  2500, // Level 4
  10000, // Level 5  - REWARD: 7 jours Premium
  14000, // Level 6
  19000, // Level 7
  25000, // Level 8
  32000, // Level 9
  40000, // Level 10 - REWARD: 1 mois Premium
  49000, // Level 11
  59000, // Level 12
  70000, // Level 13
  82000, // Level 14
  95000, // Level 15
  105000, // Level 16
  112000, // Level 17
  116000, // Level 18
  118000, // Level 19
  120000, // Level 20 - REWARD: 3 mois Premium
  135000, // Level 21
  152000, // Level 22
  171000, // Level 23
  192000, // Level 24
  215000, // Level 25
  240000, // Level 26
  260000, // Level 27
  275000, // Level 28
  288000, // Level 29
  300000, // Level 30 - REWARD: Accès Permanent
] as const;

/** XP: Niveau maximum */
export const XP_MAX_LEVEL = 30;

// =============================================================================
// Premium Reward Levels (Train-to-Own)
// =============================================================================

/** PREMIUM: Niveau pour 7 jours */
export const PREMIUM_LEVEL_7_DAYS = 5;

/** PREMIUM: Niveau pour 1 mois */
export const PREMIUM_LEVEL_1_MONTH = 10;

/** PREMIUM: Niveau pour 3 mois */
export const PREMIUM_LEVEL_3_MONTHS = 20;

/** PREMIUM: Niveau pour lifetime */
export const PREMIUM_LEVEL_LIFETIME = 30;

/** PREMIUM: Seuil N-level pour fonctionnalités premium (N >= 4 = premium) */
export const PREMIUM_N_THRESHOLD = 4;

// ---------------------------------------------------------------------------
// DAILY PLAYTIME GATE (time-based freemium)
// ---------------------------------------------------------------------------

/** Nombre de jours de grâce après la première session (limite plus généreuse) */
export const DAILY_PLAYTIME_GRACE_DAYS = 4;

/** Limite de temps gratuit par jour pendant la période de grâce (ms) */
export const DAILY_PLAYTIME_GRACE_LIMIT_MS = 20 * 60 * 1000; // 20 minutes

/** Limite de temps gratuit par jour après la période de grâce (ms) */
export const DAILY_PLAYTIME_STANDARD_LIMIT_MS = 20 * 60 * 1000; // 20 minutes

/** Durée du trial illimité offert au premier wall (jours) */
export const FREE_TRIAL_DURATION_DAYS = 7;

// #############################################################################
// #                                                                           #
// #                         JOURNEY STRUCTURE                                  #
// #                    (Configuration du parcours)                            #
// #                                                                           #
// #############################################################################

/** JOURNEY: Niveau N maximum supporté */
export const JOURNEY_MAX_LEVEL = 10;

/** JOURNEY: Niveau N cible par défaut */
export const JOURNEY_DEFAULT_TARGET_LEVEL = 5;

/** JOURNEY: Niveau N de départ par défaut */
export const JOURNEY_DEFAULT_START_LEVEL = 1;

/** JOURNEY: Nombre de modes par niveau (hors simulateur) */
export const JOURNEY_MODES_PER_LEVEL = 4;

// #############################################################################
// #                                                                           #
// #                         AUDIO TIMING                                       #
// #                    (Synchronisation audio/visuel)                         #
// #                                                                           #
// #############################################################################

/** AUDIO: Buffer de sync avant stimulus (80ms) */
export const AUDIO_SYNC_BUFFER_MS = 80;

/** AUDIO: Buffer après fin audio recall (100ms) */
export const AUDIO_END_BUFFER_MS = 100;

/** VISUAL: Offset latence visuelle (30ms) */
export const VISUAL_LATENCY_OFFSET_MS = 30;

/** TRAJECTORY: Intervalle d'échantillonnage (50ms = 20Hz) */
export const TRAJECTORY_SAMPLE_INTERVAL_MS = 50;

/** TRAJECTORY: Sample rate fixe (20Hz) */
export const TRAJECTORY_SAMPLE_RATE_HZ = 20;

/** TRAJECTORY: Maximum points per trajectory (20Hz * 30s = 600 points max) */
export const TRAJECTORY_MAX_POINTS = 600;

/** TRAJECTORY: Maximum trajectory duration in ms (30 seconds) */
export const TRAJECTORY_MAX_DURATION_MS = 30_000;

/** TRAJECTORY: Warning threshold for trajectory size (500 points) */
export const TRAJECTORY_WARNING_POINTS = 500;

/** REPLAY: Buffer animation landing après drop (ms) */
export const REPLAY_LANDING_BUFFER_MS = 150;

/** REPLAY: Fallback durée placement Flow si données manquantes (5s) */
export const REPLAY_FALLBACK_PLACEMENT_MS = 5000;

/** REPLAY: Fallback durée fenêtre Recall si données manquantes (10s) */
export const REPLAY_FALLBACK_RECALL_MS = 10000;

// #############################################################################
// #                                                                           #
// #                         SESSION TIMING                                     #
// #                    (Timing spécifique par mode)                           #
// #                                                                           #
// #############################################################################

/** DUAL LABEL: Délai inter-trial (800ms) */
export const TIMING_INTER_TRIAL_LABEL_MS = 800;

/** TUTORIAL: Délai feedback par défaut (600ms) */
export const TIMING_TUTORIAL_FEEDBACK_MS = 600;

/** TUTORIAL: Délai auto-avance par défaut (200ms) */
export const TIMING_TUTORIAL_AUTO_ADVANCE_MS = 200;

/** TUTORIAL: Durée d'affichage du stimulus (1200ms) */
export const TIMING_TUTORIAL_STIMULUS_MS = 1200;

/** RECALL: Corrections max par cellule */
export const RECALL_MAX_CORRECTIONS_PER_CELL = 3;

// #############################################################################
// #                                                                           #
// #                         SCORING POINTS                                     #
// #                    (Points par action)                                    #
// #                                                                           #
// #############################################################################

/** FLOW/LABEL: Points perdus par erreur */
export const SCORING_POINTS_PER_ERROR = 5;

/** JAEGGI JOURNEY: Points perdus par erreur (scoring journey) */
export const JAEGGI_POINTS_PER_ERROR = 10;

// #############################################################################
// #                                                                           #
// #                         TREND DETECTION                                    #
// #                    (Détection de tendances)                               #
// #                                                                           #
// #############################################################################

/** TREND: Taille fenêtre d'observation */
export const TREND_WINDOW_SIZE = 5;

/** TREND: Seuil de changement (+/-5%) */
export const TREND_THRESHOLD = 0.05;

// #############################################################################
// #                                                                           #
// #                         COACHING ALGORITHMS                                #
// #                    (Algorithmes adaptatifs non-ML)                         #
// #                                                                           #
// #############################################################################

/** COACH: Minimum trials pour calculer tendance d' */
export const COACH_MIN_TRIALS_FOR_TREND = 6;

/** COACH: Minimum RTs pour calculer tendance RT */
export const COACH_MIN_RTS_FOR_RT_TREND = 4;

/** COACH: Seuil d-prime pour tendance (improving/declining) */
export const COACH_DPRIME_TREND_THRESHOLD = 0.3;

/** COACH: Seuil RT pour tendance (ms faster/slower) */
export const COACH_RT_TREND_THRESHOLD_MS = 50;

/** COACH: Ajustement estimation d-prime finale */
export const COACH_DPRIME_ESTIMATION_ADJUSTMENT = 0.2;

/** COACH: Diviseur difficulty → zone (difficulty / X = zone) */
export const COACH_DIFFICULTY_TO_ZONE_DIVISOR = 5;

// =============================================================================
// Cognitive Profiler Thresholds
// =============================================================================

/** COGNITIVE: Seuil flowScore pour être considéré "in flow" (0.7 = 70%) */
export const COGNITIVE_FLOW_ENTRY_THRESHOLD = 0.7;

/** COGNITIVE: Seuil resilienceScore pour profil "resilient" (0.7 = 70%) */
export const COGNITIVE_RESILIENCE_THRESHOLD = 0.7;

/** COGNITIVE: Seuil resilienceScore pour profil "fragile" (0.4 = 40%) */
export const COGNITIVE_FRAGILE_THRESHOLD = 0.4;

/** COGNITIVE: Seuil probabilité d'erreur pour suggérer pause (0.7 = 70%) */
export const COGNITIVE_ERROR_PROBABILITY_BREAK = 0.7;

/** COGNITIVE: Seuil probabilité d'erreur pour baisser difficulté (0.5 = 50%) */
export const COGNITIVE_ERROR_PROBABILITY_DECREASE = 0.5;

/** COGNITIVE: Seuil score global pour augmenter difficulté (0.8 = 80%) */
export const COGNITIVE_SCORE_INCREASE_DIFFICULTY = 0.8;

/** COGNITIVE: Facteur slowdownScore quand récupération trop rapide */
export const COGNITIVE_RECOVERY_TOO_FAST_FACTOR = 0.7;

// =============================================================================
// Generator Fallbacks (valeurs par défaut pour générateurs adaptatifs)
// =============================================================================

/** GEN FALLBACK: ISI par défaut en secondes (3.0s) */
export const GEN_FALLBACK_ISI_SECONDS = 3.0;

/** GEN FALLBACK: Durée stimulus par défaut en secondes (0.5s) */
export const GEN_FALLBACK_STIMULUS_DURATION_SECONDS = 0.5;

// =============================================================================
// Difficulty Formula (calcul de difficulté 0-100)
// =============================================================================

/** DIFFICULTY: N-level max pour normalisation (N=9 → factor=1) */
export const DIFFICULTY_MAX_N_LEVEL = 8;

/** DIFFICULTY: Probabilité target de référence pour scaling */
export const DIFFICULTY_TARGET_PROBABILITY_REF = 0.5;

/** DIFFICULTY: ISI minimum pour formule (1500ms = max difficulté ISI) */
export const DIFFICULTY_ISI_MIN_MS = 1500;

/** DIFFICULTY: ISI range pour normalisation (3500ms range) */
export const DIFFICULTY_ISI_RANGE_MS = 3500;

// #############################################################################
// #                                                                           #
// #                         CONFIDENCE SCORING                                 #
// #                    (Calcul de confiance drag & drop)                      #
// #                                                                           #
// #############################################################################

/** CONFIDENCE: Poids directness dans score */
export const CONFIDENCE_DIRECTNESS_WEIGHT = 60;

/** CONFIDENCE: Seuil dwell significatif (150ms) */
export const CONFIDENCE_SIGNIFICANT_DWELL_MS = 150;

/** CONFIDENCE: Pénalité par 100ms sur mauvais slot */
export const CONFIDENCE_WRONG_SLOT_PENALTY_PER_100MS = 5;

/** CONFIDENCE: Seuil drag rapide (800ms) */
export const CONFIDENCE_FAST_DRAG_THRESHOLD_MS = 800;

/** CONFIDENCE: Ratio directness minimum */
export const CONFIDENCE_DIRECT_RATIO_THRESHOLD = 0.9;

/** CONFIDENCE: Bonus vitesse */
export const CONFIDENCE_SPEED_BONUS = 10;

/** CONFIDENCE: Score par défaut (fallback) */
export const CONFIDENCE_DEFAULT_SCORE = 70;

// #############################################################################
// #                                                                           #
// #                    TRAJECTORY CONFIDENCE ANALYSIS                          #
// #                    (Analyse trajectoire drag & drop)                       #
// #                                                                           #
// #############################################################################

/** TRAJECTORY: Minimum de points pour analyse */
export const TRAJECTORY_MIN_POINTS = 6;

/** TRAJECTORY: Distance directe minimum (px) */
export const TRAJECTORY_MIN_DIRECT_DISTANCE_PX = 10;

/** TRAJECTORY: Tolérance resampling (ms) */
export const TRAJECTORY_RESAMPLE_TOLERANCE_MS = 10;

/** TRAJECTORY: Ratio max d'irrégularité */
export const TRAJECTORY_MAX_IRREGULAR_RATIO = 0.2;

/** TRAJECTORY: Pause minimum détectable (ms) */
export const TRAJECTORY_PAUSE_MIN_MS = 150;

/** TRAJECTORY: Vitesse minimum (normalized units/ms) */
export const TRAJECTORY_MIN_VSTOP = 0.0001;

/** TRAJECTORY: Seuil directness bon (95%) */
export const TRAJECTORY_DIRECTNESS_GOOD = 0.95;

/** TRAJECTORY: Seuil directness mauvais (80%) */
export const TRAJECTORY_DIRECTNESS_BAD = 0.8;

/** TRAJECTORY: Seuil AUC bon */
export const TRAJECTORY_AUC_GOOD = 0.05;

/** TRAJECTORY: Seuil AUC mauvais */
export const TRAJECTORY_AUC_BAD = 0.2;

/** TRAJECTORY: Seuil MD (max deviation) bon */
export const TRAJECTORY_MD_GOOD = 0.08;

/** TRAJECTORY: Seuil MD mauvais */
export const TRAJECTORY_MD_BAD = 0.2;

/** TRAJECTORY: Seuil backtrack mauvais */
export const TRAJECTORY_BACKTRACK_BAD = 2;

/** TRAJECTORY: Seuil pause mauvaise (ms) */
export const TRAJECTORY_PAUSE_BAD_MS = 250;

// =============================================================================
// Trajectory Confidence Weights & Penalties
// =============================================================================

/** TRAJECTORY: Poids directness dans score */
export const TRAJECTORY_WEIGHT_DIRECTNESS = 0.4;

/** TRAJECTORY: Poids déviation dans score */
export const TRAJECTORY_WEIGHT_DEVIATION = 0.25;

/** TRAJECTORY: Poids backtrack dans score */
export const TRAJECTORY_WEIGHT_BACKTRACK = 0.2;

/** TRAJECTORY: Poids pause dans score */
export const TRAJECTORY_WEIGHT_PAUSE = 0.15;

/** TRAJECTORY: Poids AUC dans déviation */
export const TRAJECTORY_DEVIATION_AUC_WEIGHT = 0.6;

/** TRAJECTORY: Poids MD (max deviation) dans déviation */
export const TRAJECTORY_DEVIATION_MD_WEIGHT = 0.4;

/** TRAJECTORY: Pénalité par slot incorrect visité */
export const TRAJECTORY_PENALTY_PER_WRONG_SLOT = 15;

/** TRAJECTORY: Pénalité par va-et-vient */
export const TRAJECTORY_PENALTY_PER_BACK_AND_FORTH = 10;

/** TRAJECTORY: Cap maximum des pénalités */
export const TRAJECTORY_PENALTY_CAP = 70;

// =============================================================================
// Trajectory Velocity Ratios (relative to peak speed)
// =============================================================================

/** TRAJECTORY: Ratio vPeak pour vitesse arrêt (5% du pic) */
export const TRAJECTORY_VSTOP_PEAK_RATIO = 0.05;

/** TRAJECTORY: Ratio vPeak pour backtrack (10% du pic) */
export const TRAJECTORY_VBACKTRACK_PEAK_RATIO = 0.1;

/** TRAJECTORY: Ratio vPeak pour mouvement (10% du pic) - trimStaticPhases */
export const TRAJECTORY_VMOVE_PEAK_RATIO = 0.1;

// =============================================================================
// Trajectory Wrong Dwell Penalty
// =============================================================================

/** TRAJECTORY: Seuil dwell sur mauvais slot (ms) - pas de pénalité en-dessous */
export const TRAJECTORY_WRONG_DWELL_THRESHOLD_MS = 150;

/** TRAJECTORY: Diviseur pour calcul pénalité dwell */
export const TRAJECTORY_WRONG_DWELL_DIVISOR_MS = 300;

/** TRAJECTORY: Pénalité maximum pour dwell sur mauvais slot */
export const TRAJECTORY_WRONG_DWELL_MAX_PENALTY = 20;

// =============================================================================
// Trajectory Sigmoid Transform
// =============================================================================

/** TRAJECTORY: Pente sigmoid pour scoring strict (steepness) */
export const TRAJECTORY_SIGMOID_STEEPNESS = 6;

/** TRAJECTORY: Centre sigmoid (x=0.5 → y=0.5) */
export const TRAJECTORY_SIGMOID_CENTER = 0.5;

// =============================================================================
// Dual Label Trajectory Ratio
// =============================================================================

/** DUAL LABEL: Ratio minimum de drops avec trajectory data (50%) */
export const DUAL_PICK_MIN_TRAJECTORY_RATIO = 0.5;

// #############################################################################
// #                                                                           #
// #                         RECALL CONFIDENCE                                  #
// #                    (Confiance mode Recall)                                #
// #                                                                           #
// #############################################################################

/** RECALL CONF: Seuil hésitation premier pick (2000ms) */
export const RECALL_FIRST_PICK_HESITATION_MS = 2000;

/** RECALL CONF: Pénalité hésitation premier pick */
export const RECALL_FIRST_PICK_HESITATION_PENALTY = 10;

/** RECALL CONF: Pénalité par correction */
export const RECALL_CORRECTION_PENALTY = 8;

/** RECALL CONF: Pénalité max pour taux de corrections élevé */
export const RECALL_CORRECTION_RATE_MAX_PENALTY = 30;

/** RECALL CONF: Seuil irrégularité timing (500ms) */
export const RECALL_TIMING_IRREGULARITY_MS = 500;

/** RECALL CONF: Pénalité max irrégularité */
export const RECALL_TIMING_IRREGULARITY_MAX_PENALTY = 20;

/** RECALL CONF: Seuil burst rapide (300ms) */
export const RECALL_BURST_THRESHOLD_MS = 300;

/** RECALL CONF: Seuil séquentiel (500ms) */
export const RECALL_SEQUENTIAL_THRESHOLD_MS = 500;

/** RECALL CONF: Min picks pour stratégie */
export const RECALL_MIN_PICKS_FOR_STRATEGY = 3;

// #############################################################################
// #                                                                           #
// #                         REPORT ANALYSIS                                    #
// #                    (Seuils pour messages contextuels)                     #
// #                                                                           #
// #############################################################################

// =============================================================================
// Error Type Classification
// =============================================================================

/** REPORT: Ratio pour classifier erreurs dominantes (misses) */
export const REPORT_MISS_DOMINANT_RATIO = 0.7;

/** REPORT: Ratio pour classifier erreurs dominantes (false alarms) */
export const REPORT_FA_DOMINANT_RATIO = 0.3;

// =============================================================================
// Modality Gap Analysis
// =============================================================================

/** REPORT: Seuil pour performance équilibrée (5%) */
export const REPORT_MODALITY_BALANCED_GAP = 0.05;

/** REPORT: Seuil pour point d'attention (15%) */
export const REPORT_MODALITY_ATTENTION_GAP = 0.15;

/** REPORT: Seuil pour asymétrie significative (20%) */
export const REPORT_MODALITY_ASYMMETRY_GAP = 0.2;

// =============================================================================
// Error Rate Thresholds
// =============================================================================

/** REPORT: Taux de fausses alertes élevé (15%) */
export const REPORT_HIGH_FA_RATE = 0.15;

/** REPORT: Taux d'omissions élevé (40%) */
export const REPORT_HIGH_MISS_RATE = 0.4;

/** REPORT: Seuil de rapidité pour insight (400ms) */
export const REPORT_FAST_RT_INSIGHT_MS = 400;

// =============================================================================
// Precise Message Patterns
// =============================================================================

/** REPORT: Seuil de taux de miss pour "total miss" (100%) */
export const REPORT_TOTAL_MISS_RATE = 1.0;

/** REPORT: Seuil de taux de miss pour "presque toutes" (>= 90%) */
export const REPORT_ALMOST_ALL_MISS_RATE = 0.9;

/** REPORT: Seuil de taux de miss pour "majorité" (>= 70%) */
export const REPORT_MAJORITY_MISS_RATE = 0.7;

/** REPORT: Seuil de taux de FA pour "impulsif" (>= 25%) */
export const REPORT_IMPULSIVE_FA_RATE = 0.25;

/** REPORT: Seuil de RT pour comportement impulsif (< 300ms) */
export const REPORT_IMPULSIVE_RT_MS = 300;

/** REPORT: Seuil pour "presque réussi" (écart au threshold en %) */
export const REPORT_ALMOST_PASSED_GAP = 0.05;

/** REPORT: Seuil minimum d'essais pour session valide (50% des trials prévus) */
export const REPORT_MIN_TRIALS_RATIO = 0.5;

/** REPORT: Seuil d'écart entre modalités pour message spécifique (>= 25%) */
export const REPORT_MODALITY_STRONG_GAP = 0.25;

// #############################################################################
// #                                                                           #
// #                         PROFILE & JOURNEY                                  #
// #                    (Analyse de profil cognitif)                           #
// #                                                                           #
// #############################################################################

// =============================================================================
// D-Prime Conversion Formula (Journey)
// =============================================================================

/** JOURNEY FORMULA: Base pourcentage pour d-prime = 0 */
export const DPRIME_TO_PERCENT_BASE = 50;

/** JOURNEY FORMULA: Diviseur d-prime pour mapping linéaire */
export const DPRIME_TO_PERCENT_DIVISOR = 4;

/** JOURNEY FORMULA: Multiplicateur d-prime pour Tempo */
export const DPRIME_TO_PERCENT_MULTIPLIER = 23.3;

/** JOURNEY FORMULA: Diviseur d-prime pour Recall (accuracy * 3) */
export const DPRIME_RECALL_DIVISOR = 3;

// =============================================================================
// Profile Analysis Thresholds
// =============================================================================

/** PROFILE: Valeur par défaut lureVulnerability */
export const PROFILE_LURE_VULNERABILITY_DEFAULT = 0.5;

/** PROFILE: Écart d-prime pour forces/faiblesses */
export const PROFILE_DPRIME_GAP_THRESHOLD = 0.5;

/** PROFILE: Seuil d-prime pour mastery count */
export const PROFILE_MASTERY_DPRIME_THRESHOLD = 2.5;

/** PROFILE: Jours d'activité conservés dans le profil */
export const PROFILE_ACTIVITY_RETENTION_DAYS = 90;

/** PROFILE: Millisecondes par jour (constante) */
export const MS_PER_DAY = 86400000;

// =============================================================================
// Recall Fluency Scoring
// =============================================================================

/** RECALL FLUENCY: Diviseur pour pénalité timing */
export const RECALL_FLUENCY_TIMING_DIVISOR = 500;

/** RECALL FLUENCY: Pénalité par irrégularité */
export const RECALL_FLUENCY_IRREGULARITY_PENALTY = 20;

// =============================================================================
// XP Flow Bonus (UPS threshold for flow state)
// =============================================================================

/** XP: Seuil UPS pour bonus Flow (= FLOW_CONFIDENCE_THRESHOLD) */
export const XP_FLOW_UPS_THRESHOLD = FLOW_CONFIDENCE_THRESHOLD;

// #############################################################################
// #                                                                           #
// #                         UNIFIED METRICS                                    #
// #                    (Calcul zone/métriques unifiées)                       #
// #                                                                           #
// #############################################################################

/** ZONE: Zones par niveau N */
export const ZONE_PER_N_LEVEL = 3;

/** ZONE: Accuracy minimum pour bonus */
export const ZONE_MIN_ACCURACY_FOR_BONUS = 0.5;

/** ZONE: Bonus accuracy maximum */
export const ZONE_MAX_ACCURACY_BONUS = 3;

/** ZONE: Zone minimum */
export const ZONE_MIN = 1;

/** ZONE: Zone maximum */
export const ZONE_MAX = 20;

// =============================================================================
// Empty Unified Metrics Defaults
// =============================================================================

/** UNIFIED: Zone par défaut (départ) */
export const DEFAULT_ZONE = 1;

/** UNIFIED: Zone progress par défaut */
export const DEFAULT_ZONE_PROGRESS = 0;

// #############################################################################
// #                                                                           #
// #                         SESSION STATS                                      #
// #                    (Statistiques de session)                              #
// #                                                                           #
// #############################################################################

/** STATS: Minimum trials pour stats valides */
export const STATS_MIN_TRIALS_FOR_VALID = 20;

/** STATS: Multiplicateur IQR pour filtrer les outliers (1.5 = mild outliers) */
export const STATS_IQR_OUTLIER_MULTIPLIER = 1.5;

/** STATS: Multiplicateur médiane pour détecter micro-lapses (RT > median * X) */
export const STATS_MICROLAPSE_MEDIAN_MULTIPLIER = 2.5;

/** STATS: Fenêtre par défaut pour getDailyStats (jours) */
export const STATS_DAILY_WINDOW_DAYS = 30;

/** STATS: Minimum sessions pour calcul de meilleure heure */
export const STATS_BEST_HOUR_MIN_SESSIONS = 5;

/** STATS: Minimum sessions à une heure pour la considérer */
export const STATS_BEST_HOUR_MIN_PER_SLOT = 2;

// =============================================================================
// Trend Analysis
// =============================================================================

/** TREND: Fenêtre récente (dernières N sessions) */
export const TREND_RECENT_WINDOW = 5;

/** TREND: Fenêtre plus ancienne (sessions 5-15) */
export const TREND_OLDER_WINDOW = 15;

/** TREND: Minimum sessions pour calcul de tendance */
export const TREND_MIN_SESSIONS = 3;

/** TREND: Seuil pour considérer amélioration (%) */
export const TREND_IMPROVING_THRESHOLD_PERCENT = 10;

/** TREND: Seuil pour considérer déclin (%) */
export const TREND_DECLINING_THRESHOLD_PERCENT = -10;

/** TREND: Minimum sessions pour confiance haute */
export const TREND_CONFIDENCE_HIGH_MIN_SESSIONS = 20;

/** TREND: Minimum sessions pour confiance moyenne */
export const TREND_CONFIDENCE_MEDIUM_MIN_SESSIONS = 10;

/** PLATEAU: Seuil de variance pour détection de plateau */
export const PLATEAU_DETECTION_THRESHOLD = 0.1;

// =============================================================================
// Time of Day
// =============================================================================

/** TIME: Heure de début du matin (5h) */
export const TIME_OF_DAY_MORNING = 5;

/** TIME: Heure de début de l'après-midi (12h) */
export const TIME_OF_DAY_NOON = 12;

/** TIME: Heure de début de la soirée (17h) */
export const TIME_OF_DAY_EVENING = 17;

/** TIME: Heure de début de la nuit (21h) */
export const TIME_OF_DAY_NIGHT = 21;

/** TIME: Type pour la période de la journée */
export type TimeOfDayPeriod = 'morning' | 'afternoon' | 'evening' | 'night';

/**
 * Détermine la période de la journée à partir de l'heure.
 * @param hour Heure (0-23)
 * @returns 'morning' | 'afternoon' | 'evening' | 'night'
 */
export function getTimeOfDayFromHour(hour: number): TimeOfDayPeriod {
  if (hour >= TIME_OF_DAY_MORNING && hour < TIME_OF_DAY_NOON) return 'morning';
  if (hour >= TIME_OF_DAY_NOON && hour < TIME_OF_DAY_EVENING) return 'afternoon';
  if (hour >= TIME_OF_DAY_EVENING && hour < TIME_OF_DAY_NIGHT) return 'evening';
  return 'night';
}

// =============================================================================
// Storage Quota Monitoring
// =============================================================================

/** STORAGE: Warning threshold percentage (80%) */
export const STORAGE_WARNING_THRESHOLD_PERCENT = 80;

/** STORAGE: Critical threshold percentage (95%) */
export const STORAGE_CRITICAL_THRESHOLD_PERCENT = 95;

// =============================================================================
// Cloud Sync Backoff
// =============================================================================

/** SYNC: Délai initial de backoff (ms) */
export const SYNC_BACKOFF_INITIAL_MS = 1000;

/** SYNC: Délai maximum de backoff (ms) */
export const SYNC_BACKOFF_MAX_MS = 60000;

/** SYNC: Multiplicateur de backoff */
export const SYNC_BACKOFF_MULTIPLIER = 2;

/** SYNC: Nombre maximum de tentatives */
export const SYNC_BACKOFF_MAX_RETRIES = 5;

// #############################################################################
// #                                                                           #
// #                         SESSION HEALTH METRICS                             #
// #                    (Fiabilité des mesures RT)                             #
// #                                                                           #
// #############################################################################

// =============================================================================
// Processing Lag Thresholds (time from browser event to XState processing)
// =============================================================================

/** HEALTH: Processing lag warning threshold (ms) - >10ms = suspect */
export const HEALTH_PROCESSING_LAG_WARNING_MS = 10;

/** HEALTH: Processing lag degraded threshold (ms) - >50ms = degraded */
export const HEALTH_PROCESSING_LAG_DEGRADED_MS = 50;

// =============================================================================
// RT Stability Thresholds (Coefficient of Variation)
// =============================================================================

/** HEALTH: RT CV warning threshold - CV > 0.3 = variable */
export const HEALTH_RT_CV_WARNING = 0.3;

/** HEALTH: RT CV degraded threshold - CV > 0.5 = highly variable */
export const HEALTH_RT_CV_DEGRADED = 0.5;

// =============================================================================
// Event Loop Lag Thresholds (main thread congestion)
// =============================================================================

/** HEALTH: Event loop lag warning threshold (ms) - >30ms = congestion */
export const HEALTH_EVENTLOOP_LAG_WARNING_MS = 30;

/** HEALTH: Event loop lag degraded threshold (ms) - >100ms = problem */
export const HEALTH_EVENTLOOP_LAG_DEGRADED_MS = 100;

// =============================================================================
// Reliability Score Tiers
// =============================================================================

/** HEALTH: Score >= 80 = high quality */
export const HEALTH_SCORE_HIGH = 80;

/** HEALTH: Score 50-79 = medium quality */
export const HEALTH_SCORE_MEDIUM = 50;

// Score < 50 = degraded

// =============================================================================
// Weight Factors for Reliability Score
// =============================================================================

/** HEALTH: Weight for processing lag in score (0-1) */
export const HEALTH_WEIGHT_PROCESSING_LAG = 0.3;

/** HEALTH: Weight for event loop lag in score (0-1) */
export const HEALTH_WEIGHT_EVENTLOOP_LAG = 0.2;

/** HEALTH: Weight for RT stability in score (0-1) */
export const HEALTH_WEIGHT_RT_STABILITY = 0.25;

/** HEALTH: Weight for focus metrics in score (0-1) */
export const HEALTH_WEIGHT_FOCUS = 0.15;

/** HEALTH: Weight for freeze/long task count in score (0-1) */
export const HEALTH_WEIGHT_FREEZES = 0.1;

// #############################################################################
// #                                                                           #
// #                         PSYCHOMETRIC THRESHOLDS                            #
// #                    (Seuils psychométriques SDT)                           #
// #                                                                           #
// #############################################################################

/** PSYCHOMETRIC: d' élite */
export const PSYCHOMETRIC_DPRIME_ELITE = 3.0;

/** PSYCHOMETRIC: d' avancé */
export const PSYCHOMETRIC_DPRIME_ADVANCED = 2.0;

/** PSYCHOMETRIC: d' intermédiaire */
export const PSYCHOMETRIC_DPRIME_INTERMEDIATE = 1.0;

/** PSYCHOMETRIC: Seuil hit rate spam (>95% = spam) */
export const PSYCHOMETRIC_SPAM_HIT_RATE = 0.95;

/** PSYCHOMETRIC: Seuil FA rate spam (>50% = spam) */
export const PSYCHOMETRIC_SPAM_FA_RATE = 0.5;

/** PSYCHOMETRIC: Seuil hit rate inactif (<10% = inactif) */
export const PSYCHOMETRIC_INACTIVE_HIT_RATE = 0.1;

/** PSYCHOMETRIC: Seuil biais libéral (criterion < -0.3 → tendance à répondre "oui") */
export const PSYCHOMETRIC_BIAS_LIBERAL_THRESHOLD = -0.3;

/** PSYCHOMETRIC: Seuil biais conservateur (criterion > 0.3 → tendance à répondre "non") */
export const PSYCHOMETRIC_BIAS_CONSERVATIVE_THRESHOLD = 0.3;

/** PSYCHOMETRIC: Cap d' pour approximation inverse erf (quand |x| >= 1) */
export const PSYCHOMETRIC_DPRIME_INVERSE_ERF_CAP = 3.5;

// #############################################################################
// #                                                                           #
// #                         VALIDATION RANGES                                  #
// #                    (Bornes pour validation Zod)                           #
// #                                                                           #
// #############################################################################

// =============================================================================
// Probability Ranges
// =============================================================================

/** VALID: Probabilité minimum */
export const VALID_PROBABILITY_MIN = 0;

/** VALID: Probabilité maximum */
export const VALID_PROBABILITY_MAX = 1;

// =============================================================================
// D-Prime Ranges (SDT/Jaeggi/BW strategies)
// =============================================================================

/** VALID: d-prime minimum raisonnable */
export const VALID_DPRIME_MIN = 0.5;

/** VALID: d-prime maximum raisonnable */
export const VALID_DPRIME_MAX = 5.0;

// =============================================================================
// Accuracy Ranges
// =============================================================================

/** VALID: Accuracy minimum */
export const VALID_ACCURACY_MIN = 0;

/** VALID: Accuracy maximum */
export const VALID_ACCURACY_MAX = 1;

// =============================================================================
// Difficulty Levels
// =============================================================================

/** VALID: Niveau difficulté minimum */
export const VALID_DIFFICULTY_MIN = 1;

/** VALID: Niveau difficulté maximum */
export const VALID_DIFFICULTY_MAX = 5;

// #############################################################################
// #                                                                           #
// #                         MODE COLORS (UI)                                   #
// #               (Tailwind classes for report display)                       #
// #                                                                           #
// #############################################################################

/**
 * Mode color specifications for reports.
 * Each mode has bg, border, text, and accent colors.
 * Format: { bg, border, text, accent }
 *
 * IMPORTANT: These colors MUST match the MODE_CONFIG in apps/web/src/pages/home.tsx
 * to ensure visual consistency across the app.
 */
export const MODE_COLOR_DUAL_CATCH = {
  bg: 'bg-violet-100 dark:bg-violet-500/20',
  border: 'border-violet-200',
  text: 'text-violet-600 dark:text-violet-400',
  accent: 'violet-500',
} as const;

export const MODE_COLOR_DUAL_PLACE = {
  bg: 'bg-orange-100 dark:bg-orange-500/20',
  border: 'border-orange-200',
  text: 'text-orange-600 dark:text-orange-400',
  accent: 'orange-500',
} as const;

export const MODE_COLOR_DUAL_MEMO = {
  bg: 'bg-blue-100 dark:bg-blue-500/20',
  border: 'border-blue-200',
  text: 'text-blue-600 dark:text-blue-400',
  accent: 'blue-500',
} as const;

export const MODE_COLOR_DUAL_TRACE = {
  bg: 'bg-teal-100 dark:bg-teal-500/20',
  border: 'border-teal-200',
  text: 'text-teal-600 dark:text-teal-400',
  accent: 'teal-500',
} as const;

export const MODE_COLOR_DUAL_PICK = {
  bg: 'bg-pink-100 dark:bg-pink-500/20',
  border: 'border-pink-200',
  text: 'text-pink-600 dark:text-pink-400',
  accent: 'pink-500',
} as const;

export const MODE_COLOR_DUAL_TIME = {
  bg: 'bg-amber-100 dark:bg-amber-500/20',
  border: 'border-amber-200',
  text: 'text-amber-600 dark:text-amber-400',
  accent: 'amber-500',
} as const;

export const MODE_COLOR_SIM_JAEGGI = {
  bg: 'bg-amber-100 dark:bg-amber-500/20',
  border: 'border-amber-200',
  text: 'text-amber-600 dark:text-amber-400',
  accent: 'amber-500',
} as const;

export const MODE_COLOR_SIM_BRAINWORKSHOP = {
  bg: 'bg-cyan-100 dark:bg-cyan-500/20',
  border: 'border-cyan-200',
  text: 'text-cyan-600 dark:text-cyan-400',
  accent: 'cyan-500',
} as const;

export const MODE_COLOR_CUSTOM = {
  bg: 'bg-emerald-100 dark:bg-emerald-500/20',
  border: 'border-emerald-200',
  text: 'text-emerald-600 dark:text-emerald-400',
  accent: 'emerald-500',
} as const;

export const MODE_COLOR_CORSI_BLOCK = {
  bg: 'bg-indigo-100 dark:bg-indigo-500/20',
  border: 'border-indigo-200',
  text: 'text-indigo-600 dark:text-indigo-400',
  accent: 'indigo-500',
} as const;

// =============================================================================
// Dual Track (MOT - Multiple Object Tracking)
// =============================================================================

/** MOT: Total number of objects on screen */
export const MOT_DEFAULT_TOTAL_OBJECTS = 8;
/** MOT: Number of targets to track */
export const MOT_DEFAULT_TARGET_COUNT = 3;
/** MOT: Duration of target highlight phase (ms) */
export const MOT_HIGHLIGHT_DURATION_MS = 2000;
/** MOT: Duration of tracking phase (ms) */
export const MOT_TRACKING_DURATION_MS = 5000;
/** MOT: Ball radius in pixels */
export const MOT_BALL_RADIUS_PX = 24;
/** MOT: Movement speed (pixels per second) */
export const MOT_SPEED_PX_PER_SEC = 80;
/** MOT: Default number of rounds per session */
export const MOT_DEFAULT_ROUNDS = 10;

export const MODE_COLOR_DUAL_TRACK = {
  bg: 'bg-cyan-100 dark:bg-cyan-500/20',
  border: 'border-cyan-200',
  text: 'text-cyan-600 dark:text-cyan-400',
  accent: 'cyan-500',
} as const;

// =============================================================================
// Operation Span (OSPAN)
// =============================================================================

/** OSPAN: Default starting span (number of items to remember) — Unsworth et al. 2005: 3 */
export const OSPAN_DEFAULT_START_SPAN = 3;
/** OSPAN: Maximum span — Unsworth et al. 2005: 7 */
export const OSPAN_MAX_SPAN = 7;
/** OSPAN: Consecutive failures before session ends */
export const OSPAN_MAX_CONSECUTIVE_FAILURES = 2;
/** OSPAN: Duration to display each memory item (ms) */
export const OSPAN_ITEM_DISPLAY_MS = 1000;
/** OSPAN: Duration to display the processing task (equation) (ms) */
export const OSPAN_EQUATION_TIMEOUT_MS = 5000;
/** OSPAN: Gap between items during presentation (ms) */
export const OSPAN_ITEM_GAP_MS = 500;

export const MODE_COLOR_OSPAN = {
  bg: 'bg-rose-100 dark:bg-rose-500/20',
  border: 'border-rose-200',
  text: 'text-rose-600 dark:text-rose-400',
  accent: 'rose-500',
} as const;

// =============================================================================
// Running Span
// =============================================================================

/** RUNNING_SPAN: Default starting span (last N items to recall) */
export const RUNNING_SPAN_DEFAULT_START_SPAN = 3;
/** RUNNING_SPAN: Maximum span */
export const RUNNING_SPAN_MAX_SPAN = 9;
/** RUNNING_SPAN: Consecutive failures before session ends */
export const RUNNING_SPAN_MAX_CONSECUTIVE_FAILURES = 2;
/** RUNNING_SPAN: Duration to display each stream item (ms) */
export const RUNNING_SPAN_ITEM_DISPLAY_MS = 800;
/** RUNNING_SPAN: Gap between stream items (ms) */
export const RUNNING_SPAN_ITEM_GAP_MS = 200;
/** RUNNING_SPAN: Minimum extra items before the recall window */
export const RUNNING_SPAN_MIN_EXTRA_ITEMS = 2;
/** RUNNING_SPAN: Maximum extra items before the recall window */
export const RUNNING_SPAN_MAX_EXTRA_ITEMS = 5;

export const MODE_COLOR_RUNNING_SPAN = {
  bg: 'bg-cyan-100 dark:bg-cyan-500/20',
  border: 'border-cyan-200',
  text: 'text-cyan-600 dark:text-cyan-400',
  accent: 'cyan-500',
} as const;

// =============================================================================
// PASAT (Paced Auditory Serial Addition Test)
// =============================================================================

/** PASAT: Default inter-stimulus interval (ms) */
export const PASAT_DEFAULT_ISI_MS = 3000;
/** PASAT: Minimum ISI (fastest pace) */
export const PASAT_MIN_ISI_MS = 1500;
/** PASAT: ISI decrease step on success block (ms) */
export const PASAT_ISI_STEP_MS = 200;
/** PASAT: Consecutive failures before session ends */
export const PASAT_MAX_CONSECUTIVE_FAILURES = 3;
/** PASAT: Default number of trials per session */
export const PASAT_DEFAULT_TRIALS = 20;

export const MODE_COLOR_PASAT = {
  bg: 'bg-amber-100 dark:bg-amber-500/20',
  border: 'border-amber-200',
  text: 'text-amber-600 dark:text-amber-400',
  accent: 'amber-500',
} as const;

// =============================================================================
// SWM (Spatial Working Memory)
// =============================================================================

/** SWM: Default starting number of boxes */
export const SWM_DEFAULT_START_BOXES = 4;
/** SWM: Maximum number of boxes */
export const SWM_MAX_BOXES = 8;
/** SWM: Consecutive failures before session ends */
export const SWM_MAX_CONSECUTIVE_FAILURES = 2;
/** SWM: Timeout per search round (ms) — 0 = no timeout */
export const SWM_SEARCH_TIMEOUT_MS = 30000;

export const MODE_COLOR_SWM = {
  bg: 'bg-teal-100 dark:bg-teal-500/20',
  border: 'border-teal-200',
  text: 'text-teal-600 dark:text-teal-400',
  accent: 'teal-500',
} as const;

// =============================================================================
// Stroop Task
// =============================================================================

/** STROOP: Default number of trials per session */
export const STROOP_DEFAULT_TRIALS = 96;
/** STROOP: Stimulus timeout (ms) — no response after this = timeout */
export const STROOP_STIMULUS_TIMEOUT_MS = 2500;
/** STROOP: Inter-trial interval (ms) */
export const STROOP_ITI_MS = 3000;

export const MODE_COLOR_STROOP = {
  bg: 'bg-rose-100 dark:bg-rose-500/20',
  border: 'border-rose-200',
  text: 'text-rose-600 dark:text-rose-400',
  accent: 'rose-500',
} as const;

export const MODE_COLOR_STROOP_FLEX = {
  bg: 'bg-fuchsia-100 dark:bg-fuchsia-500/20',
  border: 'border-fuchsia-200',
  text: 'text-fuchsia-600 dark:text-fuchsia-400',
  accent: 'fuchsia-500',
} as const;

// =============================================================================
// Flanker Task (Eriksen)
// =============================================================================

/** FLANKER: Default number of trials per session */
export const FLANKER_DEFAULT_TRIALS = 96;
/** FLANKER: Stimulus timeout (ms) */
export const FLANKER_STIMULUS_TIMEOUT_MS = 2000;
/** FLANKER: Inter-trial interval (ms) */
export const FLANKER_ITI_MS = 2500;

export const MODE_COLOR_FLANKER = {
  bg: 'bg-orange-100 dark:bg-orange-500/20',
  border: 'border-orange-200',
  text: 'text-orange-600 dark:text-orange-400',
  accent: 'orange-500',
} as const;

// =============================================================================
// Simon Task
// =============================================================================

/** SIMON: Default number of trials per session */
export const SIMON_DEFAULT_TRIALS = 96;
/** SIMON: Stimulus timeout (ms) */
export const SIMON_STIMULUS_TIMEOUT_MS = 2000;
/** SIMON: Inter-trial interval (ms) */
export const SIMON_ITI_MS = 2500;

export const MODE_COLOR_SIMON = {
  bg: 'bg-pink-100 dark:bg-pink-500/20',
  border: 'border-pink-200',
  text: 'text-pink-600 dark:text-pink-400',
  accent: 'pink-500',
} as const;

// =============================================================================
// Go/No-Go Task
// =============================================================================

/** GO_NOGO: Default number of trials per session */
export const GO_NOGO_DEFAULT_TRIALS = 96;
/** GO_NOGO: Stimulus duration (ms) — how long the circle shows */
export const GO_NOGO_STIMULUS_DURATION_MS = 1000;
/** GO_NOGO: Inter-trial interval (ms) */
export const GO_NOGO_ITI_MS = 1500;
/** GO_NOGO: Proportion of go trials (0-1) */
export const GO_NOGO_GO_PROBABILITY = 0.75;

export const MODE_COLOR_GO_NOGO = {
  bg: 'bg-emerald-100 dark:bg-emerald-500/20',
  border: 'border-emerald-200',
  text: 'text-emerald-600 dark:text-emerald-400',
  accent: 'emerald-500',
} as const;

// =============================================================================
// Stop-Signal Task
// =============================================================================

/** STOP_SIGNAL: Default number of trials per session */
export const STOP_SIGNAL_DEFAULT_TRIALS = 96;
/** STOP_SIGNAL: GO stimulus duration (ms) */
export const STOP_SIGNAL_STIMULUS_DURATION_MS = 1000;
/** STOP_SIGNAL: Inter-trial interval (ms) — blank between trials */
export const STOP_SIGNAL_ITI_MS = 1000;
/** STOP_SIGNAL: Proportion of go trials (0-1) */
export const STOP_SIGNAL_GO_PROBABILITY = 0.75;
/** STOP_SIGNAL: Initial Stop Signal Delay (ms) */
export const STOP_SIGNAL_INITIAL_SSD_MS = 250;
/** STOP_SIGNAL: SSD staircase step (ms) */
export const STOP_SIGNAL_SSD_STEP_MS = 50;
/** STOP_SIGNAL: Minimum SSD (ms) */
export const STOP_SIGNAL_SSD_MIN_MS = 50;
/** STOP_SIGNAL: Maximum SSD (ms) */
export const STOP_SIGNAL_SSD_MAX_MS = 900;

export const MODE_COLOR_STOP_SIGNAL = {
  bg: 'bg-rose-100 dark:bg-rose-500/20',
  border: 'border-rose-200',
  text: 'text-rose-600 dark:text-rose-400',
  accent: 'rose-500',
} as const;

// =============================================================================
// Antisaccade Task
// =============================================================================

/** ANTISACCADE: Default number of trials per session */
export const ANTISACCADE_DEFAULT_TRIALS = 96;
/** ANTISACCADE: Fixation duration (ms) */
export const ANTISACCADE_FIXATION_MS = 500;
/** ANTISACCADE: Cue flash duration (ms) */
export const ANTISACCADE_CUE_DURATION_MS = 200;
/** ANTISACCADE: Gap between cue offset and target onset (ms) */
export const ANTISACCADE_GAP_MS = 100;
/** ANTISACCADE: Target display timeout (ms) */
export const ANTISACCADE_TARGET_TIMEOUT_MS = 1500;
/** ANTISACCADE: Proportion of prosaccade trials (0-1) */
export const ANTISACCADE_PRO_PROBABILITY = 0.5;

export const MODE_COLOR_ANTISACCADE = {
  bg: 'bg-purple-100 dark:bg-purple-500/20',
  border: 'border-purple-200',
  text: 'text-purple-600 dark:text-purple-400',
  accent: 'purple-500',
} as const;

// =============================================================================
// PVT (Psychomotor Vigilance Test)
// =============================================================================

/** PVT: Default number of trials per session */
export const PVT_DEFAULT_TRIALS = 10;
/** PVT: Minimum foreperiod (ms) */
export const PVT_FOREPERIOD_MIN_MS = 2000;
/** PVT: Maximum foreperiod (ms) */
export const PVT_FOREPERIOD_MAX_MS = 10000;
/** PVT: Lapse threshold (ms) — RT above this is a lapse */
export const PVT_LAPSE_THRESHOLD_MS = 500;

export const MODE_COLOR_PVT = {
  bg: 'bg-green-100 dark:bg-green-500/20',
  border: 'border-green-200',
  text: 'text-green-600 dark:text-green-400',
  accent: 'green-500',
} as const;

// =============================================================================
// Posner Cueing Task
// =============================================================================

/** POSNER: Default number of trials per session */
export const POSNER_DEFAULT_TRIALS = 30;
/** POSNER: Fixation duration (ms) */
export const POSNER_FIXATION_MS = 500;
/** POSNER: Cue flash duration (ms) */
export const POSNER_CUE_DURATION_MS = 100;
/** POSNER: SOA range min (ms) — stimulus onset asynchrony */
export const POSNER_SOA_MIN_MS = 50;
/** POSNER: SOA range max (ms) */
export const POSNER_SOA_MAX_MS = 200;
/** POSNER: Target display timeout (ms) */
export const POSNER_TARGET_TIMEOUT_MS = 1500;
/** POSNER: Proportion of valid trials (0-1) */
export const POSNER_VALID_PROBABILITY = 0.8;

export const MODE_COLOR_POSNER_CUEING = {
  bg: 'bg-sky-100 dark:bg-sky-500/20',
  border: 'border-sky-200',
  text: 'text-sky-600 dark:text-sky-400',
  accent: 'sky-500',
} as const;

// =============================================================================
// WCST (Wisconsin Card Sorting Test)
// =============================================================================

/** WCST: Default number of trials */
export const WCST_DEFAULT_TRIALS = 64;

/** WCST: Consecutive correct sorts before rule change */
export const WCST_RULE_CHANGE_THRESHOLD = 6;

/** WCST: Stimulus timeout (ms) — unlimited, player decides */
export const WCST_STIMULUS_TIMEOUT_MS = 60_000;

/** WCST: Feedback display duration (ms) */
export const WCST_FEEDBACK_MS = 500;

/** WCST: Inter-trial interval (ms) */
export const WCST_ITI_MS = 300;

export const MODE_COLOR_WCST = {
  bg: 'bg-yellow-100 dark:bg-yellow-500/20',
  border: 'border-yellow-200',
  text: 'text-yellow-600 dark:text-yellow-400',
  accent: 'yellow-500',
} as const;

// =============================================================================
// Task Switching
// =============================================================================

/** TASK_SWITCHING: Default number of trials */
export const TASK_SWITCHING_DEFAULT_TRIALS = 32;

/** TASK_SWITCHING: Cue display duration before stimulus (ms) */
export const TASK_SWITCHING_CUE_MS = 500;

/** TASK_SWITCHING: Stimulus timeout (ms) */
export const TASK_SWITCHING_STIMULUS_TIMEOUT_MS = 2500;

/** TASK_SWITCHING: Feedback display duration (ms) */
export const TASK_SWITCHING_FEEDBACK_MS = 300;

/** TASK_SWITCHING: Inter-trial interval (ms) */
export const TASK_SWITCHING_ITI_MS = 200;

export const MODE_COLOR_TASK_SWITCHING = {
  bg: 'bg-fuchsia-100 dark:bg-fuchsia-500/20',
  border: 'border-fuchsia-200',
  text: 'text-fuchsia-600 dark:text-fuchsia-400',
  accent: 'fuchsia-500',
} as const;

// =============================================================================
// Trail Making Test
// =============================================================================

/** TRAIL_MAKING: Number of items in TMT-A */
export const TRAIL_MAKING_A_ITEMS = 12;

/** TRAIL_MAKING: Number of items in TMT-B (6 numbers + 6 letters) */
export const TRAIL_MAKING_B_ITEMS = 12;

/** TRAIL_MAKING: Stimulus duration (unlimited — player paced) */
export const TRAIL_MAKING_STIMULUS_TIMEOUT_MS = 120_000;

/** TRAIL_MAKING: Inter-phase interval (ms) */
export const TRAIL_MAKING_ITI_MS = 1000;

export const MODE_COLOR_TRAIL_MAKING = {
  bg: 'bg-lime-100 dark:bg-lime-500/20',
  border: 'border-lime-200',
  text: 'text-lime-600 dark:text-lime-400',
  accent: 'lime-500',
} as const;

// =============================================================================
// ANT (Attention Network Test)
// =============================================================================

export const MODE_COLOR_ANT = {
  bg: 'bg-emerald-100 dark:bg-emerald-500/20',
  border: 'border-emerald-200',
  text: 'text-emerald-600 dark:text-emerald-400',
  accent: 'emerald-500',
} as const;

// =============================================================================
// Visual Search
// =============================================================================

/** VISUAL_SEARCH: Default number of trials per session */
export const VISUAL_SEARCH_DEFAULT_TRIALS = 96;

/** VISUAL_SEARCH: Fixation duration before search display (ms) */
export const VISUAL_SEARCH_FIXATION_MS = 500;

/** VISUAL_SEARCH: Search response timeout (ms) */
export const VISUAL_SEARCH_RESPONSE_TIMEOUT_MS = 5000;

/** VISUAL_SEARCH: Feedback display duration (ms) */
export const VISUAL_SEARCH_FEEDBACK_MS = 600;

/** VISUAL_SEARCH: Inter-trial interval minimum (ms) */
export const VISUAL_SEARCH_ITI_MIN_MS = 900;

/** VISUAL_SEARCH: Inter-trial interval maximum (ms) */
export const VISUAL_SEARCH_ITI_MAX_MS = 1300;

export const MODE_COLOR_VISUAL_SEARCH = {
  bg: 'bg-teal-100 dark:bg-teal-500/20',
  border: 'border-teal-200',
  text: 'text-teal-600 dark:text-teal-400',
  accent: 'teal-500',
} as const;

// =============================================================================
// Change Detection
// =============================================================================

export const MODE_COLOR_CHANGE_DETECTION = {
  bg: 'bg-slate-100 dark:bg-slate-500/20',
  border: 'border-slate-200',
  text: 'text-slate-600 dark:text-slate-400',
  accent: 'slate-500',
} as const;

// =============================================================================
// AX-CPT
// =============================================================================

export const MODE_COLOR_AX_CPT = {
  bg: 'bg-purple-100 dark:bg-purple-500/20',
  border: 'border-purple-200',
  text: 'text-purple-600 dark:text-purple-400',
  accent: 'purple-500',
} as const;

// =============================================================================
// Digit Span
// =============================================================================

/** DIGIT_SPAN: Default starting span */
export const DIGIT_SPAN_DEFAULT_START_SPAN = 3;
/** DIGIT_SPAN: Maximum span */
export const DIGIT_SPAN_MAX_SPAN = 9;
/** DIGIT_SPAN: Consecutive failures before phase ends */
export const DIGIT_SPAN_MAX_CONSECUTIVE_FAILURES = 2;
/** DIGIT_SPAN: Duration to display each digit (ms) */
export const DIGIT_SPAN_DIGIT_DISPLAY_MS = 800;
/** DIGIT_SPAN: Gap between digits during presentation (ms) */
export const DIGIT_SPAN_DIGIT_GAP_MS = 200;

export const MODE_COLOR_DIGIT_SPAN = {
  bg: 'bg-stone-100 dark:bg-stone-500/20',
  border: 'border-stone-200',
  text: 'text-stone-600 dark:text-stone-400',
  accent: 'stone-500',
} as const;

// =============================================================================
// Reading Span
// =============================================================================

/** READING_SPAN: Default starting set size */
export const READING_SPAN_DEFAULT_START_SPAN = 2;
/** READING_SPAN: Maximum set size */
export const READING_SPAN_MAX_SPAN = 7;
/** READING_SPAN: Consecutive failures before session ends */
export const READING_SPAN_MAX_CONSECUTIVE_FAILURES = 2;
/** READING_SPAN: Duration to display target word (ms) */
export const READING_SPAN_WORD_DISPLAY_MS = 1500;

export const MODE_COLOR_READING_SPAN = {
  bg: 'bg-blue-100 dark:bg-blue-500/20',
  border: 'border-blue-200',
  text: 'text-blue-600 dark:text-blue-400',
  accent: 'blue-500',
} as const;

// =============================================================================
// Sternberg Memory Search
// =============================================================================

/** STERNBERG: Default number of trials */
export const STERNBERG_DEFAULT_TRIALS = 24;
/** STERNBERG: Duration to display memory set (ms) */
export const STERNBERG_SET_DISPLAY_MS = 2500;
/** STERNBERG: Blank interval between set and probe (ms) */
export const STERNBERG_BLANK_MS = 1000;
/** STERNBERG: Response timeout (ms) */
export const STERNBERG_RESPONSE_TIMEOUT_MS = 3000;

export const MODE_COLOR_STERNBERG = {
  bg: 'bg-zinc-100 dark:bg-zinc-500/20',
  border: 'border-zinc-200',
  text: 'text-zinc-600 dark:text-zinc-400',
  accent: 'zinc-500',
} as const;

// =============================================================================
// Letter-Number Sequencing
// =============================================================================

/** LETTER_NUMBER: Default starting span */
export const LETTER_NUMBER_DEFAULT_START_SPAN = 3;
/** LETTER_NUMBER: Maximum span */
export const LETTER_NUMBER_MAX_SPAN = 9;
/** LETTER_NUMBER: Consecutive failures before session ends */
export const LETTER_NUMBER_MAX_CONSECUTIVE_FAILURES = 2;
/** LETTER_NUMBER: Duration to display each item (ms) */
export const LETTER_NUMBER_ITEM_DISPLAY_MS = 800;
/** LETTER_NUMBER: Gap between items during presentation (ms) */
export const LETTER_NUMBER_ITEM_GAP_MS = 200;

export const MODE_COLOR_LETTER_NUMBER = {
  bg: 'bg-cyan-100 dark:bg-cyan-500/20',
  border: 'border-cyan-200',
  text: 'text-cyan-600 dark:text-cyan-400',
  accent: 'cyan-500',
} as const;
// =============================================================================
// Symmetry Span
// =============================================================================

/** SYMMETRY_SPAN: Default starting set size */
export const SYMMETRY_SPAN_DEFAULT_SET_SIZE = 2;
/** SYMMETRY_SPAN: Maximum set size */
export const SYMMETRY_SPAN_MAX_SET_SIZE = 5;
/** SYMMETRY_SPAN: Total number of sets per session */
export const SYMMETRY_SPAN_TOTAL_SETS = 12;
/** SYMMETRY_SPAN: Consecutive failures before session ends */
export const SYMMETRY_SPAN_MAX_CONSECUTIVE_FAILURES = 2;
/** SYMMETRY_SPAN: Duration to show position to remember (ms) */
export const SYMMETRY_SPAN_POSITION_DISPLAY_MS = 1000;
/** SYMMETRY_SPAN: Processing accuracy threshold to advance */
export const SYMMETRY_SPAN_PROCESSING_THRESHOLD = 0.85;

export const MODE_COLOR_SYMMETRY_SPAN = {
  bg: 'bg-violet-100 dark:bg-violet-500/20',
  border: 'border-violet-200',
  text: 'text-violet-600 dark:text-violet-400',
  accent: 'violet-500',
} as const;

// =============================================================================
// Mental Rotation
// =============================================================================

/** MENTAL_ROTATION: Default number of trials */
export const MENTAL_ROTATION_DEFAULT_TRIALS = 24;
/** MENTAL_ROTATION: Response timeout (ms) */
export const MENTAL_ROTATION_TIMEOUT_MS = 8000;
/** MENTAL_ROTATION: Inter-trial interval (ms) */
export const MENTAL_ROTATION_ITI_MS = 1000;

export const MODE_COLOR_MENTAL_ROTATION = {
  bg: 'bg-amber-100 dark:bg-amber-500/20',
  border: 'border-amber-200',
  text: 'text-amber-600 dark:text-amber-400',
  accent: 'amber-500',
} as const;

// =============================================================================
// Ravens Progressive Matrices
// =============================================================================

/** RAVENS: Default number of problems */
export const RAVENS_DEFAULT_TRIALS = 12;

export const MODE_COLOR_RAVENS = {
  bg: 'bg-indigo-100 dark:bg-indigo-500/20',
  border: 'border-indigo-200',
  text: 'text-indigo-600 dark:text-indigo-400',
  accent: 'indigo-500',
} as const;

// =============================================================================
// SART (Sustained Attention to Response Task)
// =============================================================================

/** SART: Default number of trials (225 = 25 blocks x 9 digits) */
export const SART_DEFAULT_TRIALS = 225;
/** SART: Stimulus display duration (ms) */
export const SART_STIMULUS_DURATION_MS = 250;
/** SART: Mask duration (ms) */
export const SART_MASK_DURATION_MS = 900;
/** SART: No-go digit (withhold response) */
export const SART_NOGO_DIGIT = 3;
/** SART: Go probability (8/9 digits are go) */
export const SART_GO_PROBABILITY = 0.889;

export const MODE_COLOR_SART = {
  bg: 'bg-rose-100 dark:bg-rose-500/20',
  border: 'border-rose-200',
  text: 'text-rose-600 dark:text-rose-400',
  accent: 'rose-500',
} as const;

// =============================================================================
// CPT (Continuous Performance Test)
// =============================================================================

/** CPT: Default number of trials */
export const CPT_DEFAULT_TRIALS = 200;
/** CPT: Stimulus display duration (ms) */
export const CPT_STIMULUS_DURATION_MS = 250;
/** CPT: Inter-stimulus interval (ms) */
export const CPT_ISI_MS = 1000;
/** CPT: Target probability (A-X sequence) */
export const CPT_TARGET_PROBABILITY = 0.1;

export const MODE_COLOR_CPT = {
  bg: 'bg-pink-100 dark:bg-pink-500/20',
  border: 'border-pink-200',
  text: 'text-pink-600 dark:text-pink-400',
  accent: 'pink-500',
} as const;

// =============================================================================
// PAL (Paired Associates Learning)
// =============================================================================

/** PAL: Default starting number of pairs */
export const PAL_DEFAULT_START_PAIRS = 2;
/** PAL: Maximum number of pairs */
export const PAL_MAX_PAIRS = 8;
/** PAL: Duration to reveal each box (ms) */
export const PAL_REVEAL_DURATION_MS = 2000;
/** PAL: Max consecutive failures before end */
export const PAL_MAX_CONSECUTIVE_FAILURES = 2;

export const MODE_COLOR_PAL = {
  bg: 'bg-emerald-100 dark:bg-emerald-500/20',
  border: 'border-emerald-200',
  text: 'text-emerald-600 dark:text-emerald-400',
  accent: 'emerald-500',
} as const;

// =============================================================================
// Word List Learning (RAVLT-inspired)
// =============================================================================

/** WORD_LIST: Default number of words per list */
export const WORD_LIST_DEFAULT_LIST_SIZE = 15;
/** WORD_LIST: Number of learning trials */
export const WORD_LIST_LEARNING_TRIALS = 5;
/** WORD_LIST: Word display duration (ms) */
export const WORD_LIST_WORD_DISPLAY_MS = 1000;
/** WORD_LIST: Inter-word interval (ms) */
export const WORD_LIST_IWI_MS = 500;

export const MODE_COLOR_WORD_LIST = {
  bg: 'bg-lime-100 dark:bg-lime-500/20',
  border: 'border-lime-200',
  text: 'text-lime-600 dark:text-lime-400',
  accent: 'lime-500',
} as const;

// =============================================================================
// Pattern Recognition Memory
// =============================================================================

/** PATTERN_RECOGNITION: Default number of patterns to encode */
export const PATTERN_RECOGNITION_DEFAULT_PATTERNS = 12;
/** PATTERN_RECOGNITION: Display duration per pattern (ms) */
export const PATTERN_RECOGNITION_DISPLAY_MS = 3000;
/** PATTERN_RECOGNITION: Delay before test phase (ms) */
export const PATTERN_RECOGNITION_DELAY_MS = 5000;

export const MODE_COLOR_PATTERN_RECOGNITION = {
  bg: 'bg-green-100 dark:bg-green-500/20',
  border: 'border-green-200',
  text: 'text-green-600 dark:text-green-400',
  accent: 'green-500',
} as const;

// =============================================================================
// Tower (Tower of London / Hanoi)
// =============================================================================

/** TOWER: Default number of problems */
export const TOWER_DEFAULT_PROBLEMS = 12;
/** TOWER: Minimum moves for first problem */
export const TOWER_MIN_MOVES_START = 2;
/** TOWER: Maximum moves for hardest problem */
export const TOWER_MAX_MOVES = 7;
/** TOWER: Time limit per problem (ms) */
export const TOWER_TIME_LIMIT_MS = 60000;

export const MODE_COLOR_TOWER = {
  bg: 'bg-orange-100 dark:bg-orange-500/20',
  border: 'border-orange-200',
  text: 'text-orange-600 dark:text-orange-400',
  accent: 'orange-500',
} as const;

// =============================================================================
// Gridlock (Sliding Puzzle)
// =============================================================================

/** GRIDLOCK: Default number of puzzles */
export const GRIDLOCK_DEFAULT_PUZZLES = 12;
/** GRIDLOCK: Time limit per puzzle (ms) */
export const GRIDLOCK_TIME_LIMIT_MS = 120000;

export const MODE_COLOR_GRIDLOCK = {
  bg: 'bg-sky-100 dark:bg-sky-500/20',
  border: 'border-sky-200',
  text: 'text-sky-600 dark:text-sky-400',
  accent: 'sky-500',
} as const;

// =============================================================================
// Maze Planning
// =============================================================================

/** MAZE: Default number of mazes */
export const MAZE_DEFAULT_PROBLEMS = 10;
/** MAZE: Starting grid size */
export const MAZE_START_GRID_SIZE = 5;
/** MAZE: Maximum grid size */
export const MAZE_MAX_GRID_SIZE = 12;
/** MAZE: Planning phase time limit (ms) */
export const MAZE_PLANNING_TIME_MS = 10000;

export const MODE_COLOR_MAZE = {
  bg: 'bg-yellow-100 dark:bg-yellow-500/20',
  border: 'border-yellow-200',
  text: 'text-yellow-600 dark:text-yellow-400',
  accent: 'yellow-500',
} as const;

// =============================================================================
// Word Flow (Verbal Fluency)
// =============================================================================

/** WORD_FLOW: Duration per round (ms) - 60 seconds */
export const WORD_FLOW_ROUND_DURATION_MS = 60000;
/** WORD_FLOW: Number of rounds per session */
export const WORD_FLOW_DEFAULT_ROUNDS = 3;

export const MODE_COLOR_WORD_FLOW = {
  bg: 'bg-fuchsia-100 dark:bg-fuchsia-500/20',
  border: 'border-fuchsia-200',
  text: 'text-fuchsia-600 dark:text-fuchsia-400',
  accent: 'fuchsia-500',
} as const;

// =============================================================================
// Word Chain (Associative Fluency)
// =============================================================================

/** WORD_CHAIN: Duration per round (ms) - 60 seconds */
export const WORD_CHAIN_ROUND_DURATION_MS = 60000;
/** WORD_CHAIN: Number of rounds per session */
export const WORD_CHAIN_DEFAULT_ROUNDS = 3;

export const MODE_COLOR_WORD_CHAIN = {
  bg: 'bg-purple-100 dark:bg-purple-500/25',
  border: 'border-purple-300',
  text: 'text-purple-700 dark:text-purple-300',
  accent: 'purple-600',
} as const;

// =============================================================================
// ProMem (Prospective Memory)
// =============================================================================

/** PROMEM: Default number of ongoing task trials */
export const PROMEM_DEFAULT_TRIALS = 120;
/** PROMEM: Prospective target frequency (1 in N) */
export const PROMEM_TARGET_FREQUENCY = 15;
/** PROMEM: Ongoing task stimulus timeout (ms) */
export const PROMEM_STIMULUS_TIMEOUT_MS = 2000;
/** PROMEM: ITI (ms) */
export const PROMEM_ITI_MS = 500;

export const MODE_COLOR_PROMEM = {
  bg: 'bg-sky-100 dark:bg-sky-500/20',
  border: 'border-sky-200',
  text: 'text-sky-600 dark:text-sky-400',
  accent: 'sky-500',
} as const;

// =============================================================================
// Time-Based ProMem
// =============================================================================

/** TIME_PROMEM: Target interval to remember (ms) - 2 minutes */
export const TIME_PROMEM_TARGET_INTERVAL_MS = 120000;
/** TIME_PROMEM: Session duration (ms) - 10 minutes */
export const TIME_PROMEM_SESSION_DURATION_MS = 600000;
/** TIME_PROMEM: Acceptable window around target (ms) - +/- 5s */
export const TIME_PROMEM_ACCEPTABLE_WINDOW_MS = 5000;

export const MODE_COLOR_TIME_PROMEM = {
  bg: 'bg-sky-100 dark:bg-sky-600/20',
  border: 'border-sky-300',
  text: 'text-sky-700 dark:text-sky-300',
  accent: 'sky-600',
} as const;

// =============================================================================
// Dual Task
// =============================================================================

/** DUAL_TASK: Default session duration (ms) - 3 minutes */
export const DUAL_TASK_SESSION_DURATION_MS = 180000;
/** DUAL_TASK: Visual task stimulus timeout (ms) */
export const DUAL_TASK_VISUAL_TIMEOUT_MS = 2000;
/** DUAL_TASK: Auditory task stimulus timeout (ms) */
export const DUAL_TASK_AUDITORY_TIMEOUT_MS = 2500;

export const MODE_COLOR_DUAL_TASK = {
  bg: 'bg-red-100 dark:bg-red-500/20',
  border: 'border-red-200',
  text: 'text-red-600 dark:text-red-400',
  accent: 'red-500',
} as const;

// =============================================================================
// Task Juggling
// =============================================================================

/** TASK_JUGGLING: Number of concurrent sub-tasks */
export const TASK_JUGGLING_DEFAULT_SUBTASKS = 3;
/** TASK_JUGGLING: Session duration (ms) - 5 minutes */
export const TASK_JUGGLING_SESSION_DURATION_MS = 300000;
/** TASK_JUGGLING: Deadline per sub-task (ms) */
export const TASK_JUGGLING_SUBTASK_DEADLINE_MS = 15000;

export const MODE_COLOR_TASK_JUGGLING = {
  bg: 'bg-red-100 dark:bg-red-600/20',
  border: 'border-red-300',
  text: 'text-red-700 dark:text-red-300',
  accent: 'red-600',
} as const;

// =============================================================================
// UFOV (Useful Field of View)
// =============================================================================

/** UFOV: Default number of trials per subtask */
export const UFOV_DEFAULT_TRIALS = 24;
/** UFOV: Initial display duration (ms) */
export const UFOV_INITIAL_DISPLAY_MS = 500;
/** UFOV: Minimum display duration (ms) */
export const UFOV_MIN_DISPLAY_MS = 16;
/** UFOV: Mask duration (ms) */
export const UFOV_MASK_DURATION_MS = 500;

export const MODE_COLOR_UFOV = {
  bg: 'bg-teal-100 dark:bg-teal-600/20',
  border: 'border-teal-300',
  text: 'text-teal-700 dark:text-teal-300',
  accent: 'teal-600',
} as const;

// =============================================================================
// Gabor Detection
// =============================================================================

/** GABOR: Default number of trials */
export const GABOR_DEFAULT_TRIALS = 40;
/** GABOR: Stimulus display duration (ms) */
export const GABOR_DISPLAY_MS = 200;
/** GABOR: Response timeout (ms) */
export const GABOR_RESPONSE_TIMEOUT_MS = 3000;

export const MODE_COLOR_GABOR = {
  bg: 'bg-neutral-100 dark:bg-neutral-500/20',
  border: 'border-neutral-200',
  text: 'text-neutral-600 dark:text-neutral-400',
  accent: 'neutral-500',
} as const;

// =============================================================================
// Odd One Out
// =============================================================================

/** ODD_ONE_OUT: Default number of trials */
export const ODD_ONE_OUT_DEFAULT_TRIALS = 24;
/** ODD_ONE_OUT: Response timeout (ms) */
export const ODD_ONE_OUT_TIMEOUT_MS = 10000;
/** ODD_ONE_OUT: Starting grid size */
export const ODD_ONE_OUT_START_GRID_SIZE = 4;

export const MODE_COLOR_ODD_ONE_OUT = {
  bg: 'bg-violet-100 dark:bg-violet-600/20',
  border: 'border-violet-300',
  text: 'text-violet-700 dark:text-violet-300',
  accent: 'violet-600',
} as const;

// =============================================================================
// Number Series
// =============================================================================

/** NUMBER_SERIES: Default number of problems */
export const NUMBER_SERIES_DEFAULT_TRIALS = 20;
/** NUMBER_SERIES: Response timeout (ms) */
export const NUMBER_SERIES_TIMEOUT_MS = 30000;

export const MODE_COLOR_NUMBER_SERIES = {
  bg: 'bg-indigo-100 dark:bg-indigo-600/20',
  border: 'border-indigo-300',
  text: 'text-indigo-700 dark:text-indigo-300',
  accent: 'indigo-600',
} as const;

// =============================================================================
// Analogies
// =============================================================================

/** ANALOGIES: Default number of problems */
export const ANALOGIES_DEFAULT_TRIALS = 20;
/** ANALOGIES: Response timeout (ms) */
export const ANALOGIES_TIMEOUT_MS = 30000;

export const MODE_COLOR_ANALOGIES = {
  bg: 'bg-amber-100 dark:bg-amber-600/20',
  border: 'border-amber-300',
  text: 'text-amber-700 dark:text-amber-300',
  accent: 'amber-600',
} as const;

// =============================================================================
// Time Estimation
// =============================================================================

/** TIME_ESTIMATION: Default number of trials */
export const TIME_ESTIMATION_DEFAULT_TRIALS = 20;
/** TIME_ESTIMATION: Minimum target duration (ms) */
export const TIME_ESTIMATION_MIN_DURATION_MS = 1000;
/** TIME_ESTIMATION: Maximum target duration (ms) */
export const TIME_ESTIMATION_MAX_DURATION_MS = 10000;
/** TIME_ESTIMATION: Acceptable error ratio (e.g. 0.15 = +/- 15%) */
export const TIME_ESTIMATION_ACCEPTABLE_ERROR = 0.15;

export const MODE_COLOR_TIME_ESTIMATION = {
  bg: 'bg-cyan-100 dark:bg-cyan-600/20',
  border: 'border-cyan-300',
  text: 'text-cyan-700 dark:text-cyan-300',
  accent: 'cyan-600',
} as const;

// =============================================================================
// Rhythm Reproduction
// =============================================================================

/** RHYTHM: Default number of patterns */
export const RHYTHM_DEFAULT_TRIALS = 15;
/** RHYTHM: Starting number of beats */
export const RHYTHM_START_BEATS = 3;
/** RHYTHM: Maximum number of beats */
export const RHYTHM_MAX_BEATS = 8;
/** RHYTHM: Acceptable timing error (ms) */
export const RHYTHM_ACCEPTABLE_ERROR_MS = 100;

export const MODE_COLOR_RHYTHM = {
  bg: 'bg-rose-100 dark:bg-rose-600/20',
  border: 'border-rose-300',
  text: 'text-rose-700 dark:text-rose-300',
  accent: 'rose-600',
} as const;

// =============================================================================
// Binding Task
// =============================================================================

/** BINDING: Default number of trials */
export const BINDING_DEFAULT_TRIALS = 24;
/** BINDING: Display duration for memory array (ms) */
export const BINDING_DISPLAY_MS = 500;
/** BINDING: Retention interval (ms) */
export const BINDING_RETENTION_MS = 1000;
/** BINDING: Starting set size */
export const BINDING_START_SET_SIZE = 3;
/** BINDING: Maximum set size */
export const BINDING_MAX_SET_SIZE = 6;

export const MODE_COLOR_BINDING = {
  bg: 'bg-stone-100 dark:bg-stone-600/20',
  border: 'border-stone-300',
  text: 'text-stone-700 dark:text-stone-300',
  accent: 'stone-600',
} as const;

// =============================================================================
// Soroban (Japanese Abacus)
// =============================================================================

/** SOROBAN: Default number of trials per session */
export const SOROBAN_DEFAULT_TRIALS = 20;
/** SOROBAN: Response timeout (ms) - generous for bead manipulation */
export const SOROBAN_RESPONSE_TIMEOUT_MS = 15000;
/** SOROBAN: Inter-trial interval (ms) */
export const SOROBAN_ITI_MS = 1000;

export const MODE_COLOR_SOROBAN = {
  bg: 'bg-amber-100 dark:bg-amber-500/20',
  border: 'border-amber-200',
  text: 'text-amber-600 dark:text-amber-400',
  accent: 'amber-500',
} as const;

// =============================================================================
// Reflex (Whack-a-Mole)
// =============================================================================

/** REFLEX: Default number of trials per session */
export const REFLEX_DEFAULT_TRIALS = 30;
/** REFLEX: Initial stimulus display duration (ms) — decreases as player improves */
export const REFLEX_INITIAL_STIMULUS_MS = 1500;
/** REFLEX: Minimum stimulus display duration (ms) — fastest possible */
export const REFLEX_MIN_STIMULUS_MS = 800;
/** REFLEX: Inter-trial interval (ms) */
export const REFLEX_ITI_MS = 600;
/** REFLEX: Fixation cross duration (ms) */
export const REFLEX_FIXATION_MS = 400;
/** REFLEX: Proportion of target (go) trials */
export const REFLEX_TARGET_PROBABILITY = 0.7;

export const MODE_COLOR_REFLEX = {
  bg: 'bg-lime-100 dark:bg-lime-500/20',
  border: 'border-lime-200',
  text: 'text-lime-600 dark:text-lime-400',
  accent: 'lime-500',
} as const;

// =============================================================================
// Speed Sort
// =============================================================================

/** SPEED_SORT: Default number of trials */
export const SPEED_SORT_DEFAULT_TRIALS = 30;
/** SPEED_SORT: Time limit per card (ms) */
export const SPEED_SORT_STIMULUS_TIMEOUT_MS = 3000;
/** SPEED_SORT: Inter-trial interval (ms) */
export const SPEED_SORT_ITI_MS = 300;
/** SPEED_SORT: Feedback duration (ms) */
export const SPEED_SORT_FEEDBACK_MS = 300;
/** SPEED_SORT: Rule switch interval (min cards before switch) */
export const SPEED_SORT_RULE_SWITCH_MIN = 5;
/** SPEED_SORT: Rule switch interval (max cards before switch) */
export const SPEED_SORT_RULE_SWITCH_MAX = 8;

export const MODE_COLOR_SPEED_SORT = {
  bg: 'bg-sky-100 dark:bg-sky-600/20',
  border: 'border-sky-200',
  text: 'text-sky-600 dark:text-sky-400',
  accent: 'sky-500',
} as const;

// =============================================================================
// Rhythm Tap
// =============================================================================

/** RHYTHM_TAP: Default number of trials per session */
export const RHYTHM_TAP_DEFAULT_TRIALS = 12;
/** RHYTHM_TAP: Acceptable timing tolerance (ms) */
export const RHYTHM_TAP_TOLERANCE_MS = 150;

export const MODE_COLOR_RHYTHM_TAP = {
  bg: 'bg-fuchsia-100 dark:bg-fuchsia-500/20',
  border: 'border-fuchsia-200',
  text: 'text-fuchsia-600 dark:text-fuchsia-400',
  accent: 'fuchsia-500',
} as const;

// #############################################################################
// #                                                                           #
// #                      CONVENIENCE OBJECT EXPORT                             #
// #                    (Pour vérification rapide)                             #
// #                                                                           #
// #############################################################################

export const THRESHOLDS = {
  scoreBounds: {
    max: SCORE_MAX,
    min: SCORE_MIN,
  },

  scoring: {
    sdt: { pass: SDT_DPRIME_PASS, down: SDT_DPRIME_DOWN },
    jaeggi: { maxErrors: JAEGGI_MAX_ERRORS_PER_MODALITY, errorsDown: JAEGGI_ERRORS_DOWN },
    brainworkshop: {
      passNorm: BW_SCORE_PASS_NORMALIZED,
      rawPass: BW_RAW_SCORE_PASS,
      downNorm: BW_SCORE_DOWN_NORMALIZED,
      upPercent: BW_SCORE_UP_PERCENT,
      downPercent: BW_SCORE_DOWN_PERCENT,
      strikes: BW_STRIKES_TO_DOWN,
      // BW Faithful Algorithm
      guaranteedMatch: BW_CHANCE_GUARANTEED_MATCH,
      interference: BW_CHANCE_INTERFERENCE,
      trialsBase: BW_TRIALS_BASE,
      trialsFactor: BW_TRIALS_FACTOR,
      trialsExponent: BW_TRIALS_EXPONENT,
      ticksDefault: BW_TICKS_DEFAULT,
      tickDurationMs: BW_TICK_DURATION_MS,
      probabilityStep: BW_PROBABILITY_STEP,
    },
    accuracy: { pass: ACCURACY_PASS_NORMALIZED, tracePass: TRACE_ACCURACY_PASS_NORMALIZED },
    journey: {
      minPassing: JOURNEY_MIN_PASSING_SCORE,
      excellent: JOURNEY_SCORE_EXCELLENT,
      good: JOURNEY_SCORE_GOOD,
      passing: JOURNEY_SCORE_PASSING,
      minUps: JOURNEY_MIN_UPS,
      sessionsExcellent: JOURNEY_SESSIONS_EXCELLENT,
      sessionsGood: JOURNEY_SESSIONS_GOOD,
      sessionsPassing: JOURNEY_SESSIONS_PASSING,
    },
    upsTier: {
      elite: UPS_TIER_ELITE,
      advanced: UPS_TIER_ADVANCED,
      intermediate: UPS_TIER_INTERMEDIATE,
      novice: UPS_TIER_NOVICE,
    },
    reportLevel: {
      excellentAcc: REPORT_LEVEL_EXCELLENT_ACCURACY,
      goodAcc: REPORT_LEVEL_GOOD_ACCURACY,
      averageAcc: REPORT_LEVEL_AVERAGE_ACCURACY,
      belowAvgAcc: REPORT_LEVEL_BELOW_AVERAGE_ACCURACY,
    },
    progression: {
      up: PROGRESSION_SCORE_UP,
      strike: PROGRESSION_SCORE_STRIKE,
      strikesToDown: PROGRESSION_STRIKES_TO_DOWN,
    },
    flow: { confidence: FLOW_CONFIDENCE_THRESHOLD },
  },

  timing: {
    stimulus: {
      tempo: TIMING_STIMULUS_TEMPO_MS,
      flow: TIMING_STIMULUS_FLOW_MS,
      recall: TIMING_STIMULUS_RECALL_MS,
      trace: TIMING_STIMULUS_TRACE_MS,
      traceWarmup: TIMING_STIMULUS_TRACE_WARMUP_MS,
    },
    interval: {
      default: TIMING_INTERVAL_DEFAULT_MS,
      trace: TIMING_INTERVAL_TRACE_MS,
    },
    transition: {
      default: TIMING_VISUAL_OFFSET_DEFAULT_MS,
      jaeggi: TIMING_VISUAL_OFFSET_JAEGGI_MS,
    },
    response: {
      sessionPrep: TIMING_SESSION_PREP_MS,
      sessionStartup: TIMING_SESSION_STARTUP_MS,
      minValidRt: TIMING_MIN_VALID_RT_MS,
      feedback: TIMING_FEEDBACK_MS,
      feedbackDefault: TIMING_FEEDBACK_DEFAULT_MS,
      minIntervalSpam: TIMING_MIN_INTERVAL_SPAM_MS,
      traceWindow: TIMING_RESPONSE_WINDOW_TRACE_MS,
      ruleDisplay: TIMING_RULE_DISPLAY_TRACE_MS,
      dualPickInterTrial: TIMING_DUAL_PICK_INTER_TRIAL_MS,
    },
  },

  generation: {
    target: {
      default: GEN_TARGET_PROBABILITY_DEFAULT,
      high: GEN_TARGET_PROBABILITY_HIGH,
      low: GEN_TARGET_PROBABILITY_LOW,
    },
    lure: {
      default: GEN_LURE_PROBABILITY_DEFAULT,
      label: GEN_LURE_PROBABILITY_LABEL,
      bw: GEN_LURE_PROBABILITY_BW,
      none: GEN_LURE_PROBABILITY_NONE,
    },
    sequence: {
      minProbabilityMultiplier: SEQUENCE_MIN_PROBABILITY_MULTIPLIER,
      fatigueRateDefault: SEQUENCE_FATIGUE_RATE_DEFAULT,
    },
  },

  defaults: {
    nLevel: DEFAULT_N_LEVEL,
    trialsTempo: DEFAULT_TRIALS_COUNT_TEMPO,
    trialsFlow: DEFAULT_TRIALS_COUNT_FLOW,
    distractorCount: DEFAULT_DISTRACTOR_COUNT,
    zone: DEFAULT_ZONE,
    zoneProgress: DEFAULT_ZONE_PROGRESS,
  },

  recall: {
    windowDepth: RECALL_WINDOW_DEPTH,
    progressive: {
      initialDepth: RECALL_PROGRESSIVE_INITIAL_DEPTH,
      expansion: RECALL_PROGRESSIVE_EXPANSION_THRESHOLD,
      contraction: RECALL_PROGRESSIVE_CONTRACTION_THRESHOLD,
      observation: RECALL_PROGRESSIVE_OBSERVATION_WINDOWS,
      cooldown: RECALL_PROGRESSIVE_COOLDOWN_WINDOWS,
    },
  },

  trace: {
    writing: {
      minSize: TRACE_WRITING_MIN_SIZE_PX,
      timeout: TRACE_WRITING_TIMEOUT_MS,
      gridFade: TRACE_WRITING_GRID_FADE_OPACITY,
    },
  },

  badges: {
    strongAcc: BADGE_STRONG_MODALITY_ACCURACY,
    weakAcc: BADGE_WEAK_MODALITY_ACCURACY,
    fastRt: BADGE_FAST_RT_MS,
  },

  ups: {
    weights: {
      accuracy: UPS_ACCURACY_WEIGHT,
      confidence: UPS_CONFIDENCE_WEIGHT,
    },
    minData: {
      trials: UPS_MIN_TRIALS_FOR_CONFIDENCE,
      drops: UPS_MIN_DROPS_FOR_CONFIDENCE,
      windows: UPS_MIN_WINDOWS_FOR_CONFIDENCE,
    },
    tempoConfidence: {
      weights: {
        timing: TEMPO_WEIGHT_TIMING_DISCIPLINE,
        rt: TEMPO_WEIGHT_RT_STABILITY,
        press: TEMPO_WEIGHT_PRESS_STABILITY,
        error: TEMPO_WEIGHT_ERROR_AWARENESS,
        focus: TEMPO_WEIGHT_FOCUS,
      },
      stability: {
        rtCv: TEMPO_RT_CV_THRESHOLD,
        pressCv: TEMPO_PRESS_CV_THRESHOLD,
      },
      pes: {
        minPairs: TEMPO_PES_MIN_PAIRS,
        minRatio: TEMPO_PES_MIN_RATIO,
        maxRatio: TEMPO_PES_MAX_RATIO,
      },
      focus: {
        minHits: TEMPO_FOCUS_MIN_HITS,
        lapseMultiplier: TEMPO_FOCUS_LAPSE_MULTIPLIER,
      },
      neutral: TEMPO_CONFIDENCE_NEUTRAL,
    },
  },

  xp: {
    dailyCap: XP_DAILY_SESSION_CAP,
    minFloor: XP_MIN_FLOOR,
    flowBonus: XP_FLOW_BONUS,
    badgeBonus: XP_BADGE_BONUS,
    dailyFirstBonus: XP_DAILY_FIRST_BONUS,
    streakMultiplier: XP_STREAK_MULTIPLIER,
    streakMinDays: XP_STREAK_MIN_DAYS,
    maxLevel: XP_MAX_LEVEL,
    levelThresholds: XP_LEVEL_THRESHOLDS,
    premiumLevels: {
      days7: PREMIUM_LEVEL_7_DAYS,
      month1: PREMIUM_LEVEL_1_MONTH,
      months3: PREMIUM_LEVEL_3_MONTHS,
      lifetime: PREMIUM_LEVEL_LIFETIME,
    },
    premiumNThreshold: PREMIUM_N_THRESHOLD,
    dailyPlaytime: {
      graceDays: DAILY_PLAYTIME_GRACE_DAYS,
      graceLimitMs: DAILY_PLAYTIME_GRACE_LIMIT_MS,
      standardLimitMs: DAILY_PLAYTIME_STANDARD_LIMIT_MS,
    },
  },

  validation: {
    probability: { min: VALID_PROBABILITY_MIN, max: VALID_PROBABILITY_MAX },
    dprime: { min: VALID_DPRIME_MIN, max: VALID_DPRIME_MAX },
    accuracy: { min: VALID_ACCURACY_MIN, max: VALID_ACCURACY_MAX },
    difficulty: { min: VALID_DIFFICULTY_MIN, max: VALID_DIFFICULTY_MAX },
    minIntervalSeconds: VALIDATION_MIN_INTERVAL_SECONDS,
    isiPauseSeconds: TIMING_ISI_PAUSE_SECONDS,
  },

  journeyStructure: {
    maxLevel: JOURNEY_MAX_LEVEL,
    defaultTargetLevel: JOURNEY_DEFAULT_TARGET_LEVEL,
    defaultStartLevel: JOURNEY_DEFAULT_START_LEVEL,
    modesPerLevel: JOURNEY_MODES_PER_LEVEL,
  },

  audioTiming: {
    syncBuffer: AUDIO_SYNC_BUFFER_MS,
    endBuffer: AUDIO_END_BUFFER_MS,
    visualLatency: VISUAL_LATENCY_OFFSET_MS,
    trajectorySample: TRAJECTORY_SAMPLE_INTERVAL_MS,
    trajectorySampleRate: TRAJECTORY_SAMPLE_RATE_HZ,
    replayLandingBuffer: REPLAY_LANDING_BUFFER_MS,
  },

  sessionTiming: {
    interTrialLabel: TIMING_INTER_TRIAL_LABEL_MS,
    tutorialFeedback: TIMING_TUTORIAL_FEEDBACK_MS,
    tutorialAutoAdvance: TIMING_TUTORIAL_AUTO_ADVANCE_MS,
    tutorialStimulus: TIMING_TUTORIAL_STIMULUS_MS,
    recallMaxCorrections: RECALL_MAX_CORRECTIONS_PER_CELL,
  },

  scoringPoints: {
    perError: SCORING_POINTS_PER_ERROR,
    jaeggiPerError: JAEGGI_POINTS_PER_ERROR,
  },

  trend: {
    windowSize: TREND_WINDOW_SIZE,
    threshold: TREND_THRESHOLD,
  },

  confidence: {
    directnessWeight: CONFIDENCE_DIRECTNESS_WEIGHT,
    significantDwell: CONFIDENCE_SIGNIFICANT_DWELL_MS,
    wrongSlotPenalty: CONFIDENCE_WRONG_SLOT_PENALTY_PER_100MS,
    fastDragThreshold: CONFIDENCE_FAST_DRAG_THRESHOLD_MS,
    directRatioThreshold: CONFIDENCE_DIRECT_RATIO_THRESHOLD,
    speedBonus: CONFIDENCE_SPEED_BONUS,
    defaultScore: CONFIDENCE_DEFAULT_SCORE,
  },

  trajectoryAnalysis: {
    minPoints: TRAJECTORY_MIN_POINTS,
    minDirectDistancePx: TRAJECTORY_MIN_DIRECT_DISTANCE_PX,
    resampleToleranceMs: TRAJECTORY_RESAMPLE_TOLERANCE_MS,
    maxIrregularRatio: TRAJECTORY_MAX_IRREGULAR_RATIO,
    pauseMinMs: TRAJECTORY_PAUSE_MIN_MS,
    minVstop: TRAJECTORY_MIN_VSTOP,
    directnessGood: TRAJECTORY_DIRECTNESS_GOOD,
    directnessBad: TRAJECTORY_DIRECTNESS_BAD,
    aucGood: TRAJECTORY_AUC_GOOD,
    aucBad: TRAJECTORY_AUC_BAD,
    mdGood: TRAJECTORY_MD_GOOD,
    mdBad: TRAJECTORY_MD_BAD,
    backtrackBad: TRAJECTORY_BACKTRACK_BAD,
    pauseBadMs: TRAJECTORY_PAUSE_BAD_MS,
    weights: {
      directness: TRAJECTORY_WEIGHT_DIRECTNESS,
      deviation: TRAJECTORY_WEIGHT_DEVIATION,
      backtrack: TRAJECTORY_WEIGHT_BACKTRACK,
      pause: TRAJECTORY_WEIGHT_PAUSE,
    },
    deviationWeights: {
      auc: TRAJECTORY_DEVIATION_AUC_WEIGHT,
      md: TRAJECTORY_DEVIATION_MD_WEIGHT,
    },
    penalties: {
      perWrongSlot: TRAJECTORY_PENALTY_PER_WRONG_SLOT,
      perBackAndForth: TRAJECTORY_PENALTY_PER_BACK_AND_FORTH,
      cap: TRAJECTORY_PENALTY_CAP,
    },
    velocityRatios: {
      vstop: TRAJECTORY_VSTOP_PEAK_RATIO,
      vbacktrack: TRAJECTORY_VBACKTRACK_PEAK_RATIO,
      vmove: TRAJECTORY_VMOVE_PEAK_RATIO,
    },
    wrongDwell: {
      thresholdMs: TRAJECTORY_WRONG_DWELL_THRESHOLD_MS,
      divisorMs: TRAJECTORY_WRONG_DWELL_DIVISOR_MS,
      maxPenalty: TRAJECTORY_WRONG_DWELL_MAX_PENALTY,
    },
  },

  recallConfidence: {
    firstPickHesitation: RECALL_FIRST_PICK_HESITATION_MS,
    firstPickPenalty: RECALL_FIRST_PICK_HESITATION_PENALTY,
    correctionPenalty: RECALL_CORRECTION_PENALTY,
    correctionRateMaxPenalty: RECALL_CORRECTION_RATE_MAX_PENALTY,
    timingIrregularity: RECALL_TIMING_IRREGULARITY_MS,
    timingMaxPenalty: RECALL_TIMING_IRREGULARITY_MAX_PENALTY,
    burstThreshold: RECALL_BURST_THRESHOLD_MS,
    sequentialThreshold: RECALL_SEQUENTIAL_THRESHOLD_MS,
    minPicksForStrategy: RECALL_MIN_PICKS_FOR_STRATEGY,
  },

  zone: {
    perNLevel: ZONE_PER_N_LEVEL,
    minAccuracyForBonus: ZONE_MIN_ACCURACY_FOR_BONUS,
    maxAccuracyBonus: ZONE_MAX_ACCURACY_BONUS,
    min: ZONE_MIN,
    max: ZONE_MAX,
  },

  stats: {
    minTrialsForValid: STATS_MIN_TRIALS_FOR_VALID,
    iqrOutlierMultiplier: STATS_IQR_OUTLIER_MULTIPLIER,
    microlapseMedianMultiplier: STATS_MICROLAPSE_MEDIAN_MULTIPLIER,
  },

  psychometric: {
    dprimeElite: PSYCHOMETRIC_DPRIME_ELITE,
    dprimeAdvanced: PSYCHOMETRIC_DPRIME_ADVANCED,
    dprimeIntermediate: PSYCHOMETRIC_DPRIME_INTERMEDIATE,
    spamHitRate: PSYCHOMETRIC_SPAM_HIT_RATE,
    spamFaRate: PSYCHOMETRIC_SPAM_FA_RATE,
    inactiveHitRate: PSYCHOMETRIC_INACTIVE_HIT_RATE,
  },

  adaptiveAlgorithms: {
    dprimeWindowSize: ADAPTIVE_DPRIME_WINDOW_SIZE,
    arm: {
      pTarget: { min: ARM_PTARGET_MIN, max: ARM_PTARGET_MAX },
      pLure: { min: ARM_PLURE_MIN, max: ARM_PLURE_MAX },
      isiMs: { min: ARM_ISI_MIN_MS, max: ARM_ISI_MAX_MS },
      stimulusDurationMs: { min: ARM_STIMULUS_DURATION_MIN_MS, max: ARM_STIMULUS_DURATION_MAX_MS },
    },
    jitter: {
      baseIsiMs: { min: ARM_JITTER_BASE_ISI_MIN_MS, max: ARM_JITTER_BASE_ISI_MAX_MS },
      jitterMs: { min: ARM_JITTER_MIN_MS, max: ARM_JITTER_MAX_MS },
    },
  },

  profile: {
    preferredIsi: {
      default: PROFILE_PREFERRED_ISI_DEFAULT_MS,
      min: PROFILE_PREFERRED_ISI_MIN_MS,
      max: PROFILE_PREFERRED_ISI_MAX_MS,
    },
    isiFormula: {
      rtMultiplier: PROFILE_ISI_RT_MULTIPLIER,
      offsetMs: PROFILE_ISI_OFFSET_MS,
    },
    flowScoreDefault: PROFILE_FLOW_SCORE_DEFAULT,
  },

  dualPick: {
    fallbackPointsPerError: DUAL_PICK_FALLBACK_POINTS_PER_ERROR,
    minTrajectoryRatio: DUAL_PICK_MIN_TRAJECTORY_RATIO,
  },

  coaching: {
    minTrialsForTrend: COACH_MIN_TRIALS_FOR_TREND,
    minRtsForRtTrend: COACH_MIN_RTS_FOR_RT_TREND,
    dprimeTrendThreshold: COACH_DPRIME_TREND_THRESHOLD,
    rtTrendThresholdMs: COACH_RT_TREND_THRESHOLD_MS,
    dprimeEstimationAdjustment: COACH_DPRIME_ESTIMATION_ADJUSTMENT,
    difficultyToZoneDivisor: COACH_DIFFICULTY_TO_ZONE_DIVISOR,
  },

  cognitiveProfiler: {
    flowEntryThreshold: COGNITIVE_FLOW_ENTRY_THRESHOLD,
    resilienceThreshold: COGNITIVE_RESILIENCE_THRESHOLD,
    fragileThreshold: COGNITIVE_FRAGILE_THRESHOLD,
    errorProbabilityBreak: COGNITIVE_ERROR_PROBABILITY_BREAK,
    errorProbabilityDecrease: COGNITIVE_ERROR_PROBABILITY_DECREASE,
    scoreIncreaseDifficulty: COGNITIVE_SCORE_INCREASE_DIFFICULTY,
    recoveryTooFastFactor: COGNITIVE_RECOVERY_TOO_FAST_FACTOR,
  },

  generatorFallbacks: {
    isiSeconds: GEN_FALLBACK_ISI_SECONDS,
    stimulusDurationSeconds: GEN_FALLBACK_STIMULUS_DURATION_SECONDS,
  },

  difficulty: {
    maxNLevel: DIFFICULTY_MAX_N_LEVEL,
    targetProbabilityRef: DIFFICULTY_TARGET_PROBABILITY_REF,
    isiMinMs: DIFFICULTY_ISI_MIN_MS,
    isiRangeMs: DIFFICULTY_ISI_RANGE_MS,
  },

  trajectorySigmoid: {
    steepness: TRAJECTORY_SIGMOID_STEEPNESS,
    center: TRAJECTORY_SIGMOID_CENTER,
  },
} as const;

export type Thresholds = typeof THRESHOLDS;
