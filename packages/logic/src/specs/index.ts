/**
 * Specs Index - Central Export
 *
 * This is the entry point for all game mode and journey specifications.
 * Import from here to access the single source of truth.
 *
 * THE SPEC HUB:
 *
 * GAME MODES (1 mode = 1 file):
 * - types.ts             → Interface ModeSpec (the contract)
 * - thresholds.ts        → All scoring thresholds (SSOT)
 * - tempo-shared.ts      → Shared types for tempo modes
 * - dual-catch.spec.ts   → Dual Catch (SDT scoring)
 * - jaeggi.spec.ts       → Sim Jaeggi (clinical protocol)
 * - brainworkshop.spec.ts→ Sim BrainWorkshop (BW protocol)
 * - custom.spec.ts       → Custom (full manual control)
 * - place.spec.ts         → Dual Place
 * - memo.spec.ts       → Dual Memo
 * - pick.spec.ts        → Dual Pick
 * - trace.spec.ts        → Dual Trace
 *
 * JOURNEY:
 * - journey.spec.ts → Parcours, modes, seuils, routing
 *
 * Usage:
 *   import { DualCatchSpec, THRESHOLDS, JourneyModeSpecs } from '@neurodual/logic/specs';
 */

// =============================================================================
// Types
// =============================================================================

export type {
  ModeSpec,
  ModeMetadataSpec,
  ScoringSpec,
  ScoringStrategy,
  UPSSpec,
  TempoConfidenceSpec,
  DualnbackClassicConfidenceSpec,
  TimingSpec,
  GenerationSpec,
  SessionDefaultsSpec,
  AdaptivitySpec,
  SessionType,
  // Report types
  ReportSectionId,
  ModeReportSpec,
  ReportDisplaySpec,
  ModeColorSpec,
  InsightMetricId,
  // Stats types (aggregate stats page)
  SimpleStatsSectionId,
  AdvancedStatsSectionId,
  ModeStatsSpec,
  // Tutorial types
  TutorialSpec,
  TutorialStepSpec,
  TutorialIntent,
  TutorialExitCondition,
  TimelineSlotId,
  TutorialId,
  TutorialControlLayout,
  TutorialTimingConfig,
  PositionClassification,
  SoundClassification,
  ExpectedClassification,
  ExpectedMatch,
  ExpectedSwipe,
  ExpectedPlacement,
  ExpectedRecall,
  TutorialSlot,
  // Spotlight types
  SpotlightTarget,
  SpotlightPosition,
  SpotlightStepSpec,
  TutorialSpotlightConfig,
} from './types';

export { hasExtension } from './types';

// =============================================================================
// Thresholds
// =============================================================================

export {
  THRESHOLDS,
  // App Metadata
  APP_VERSION,
  // SDT
  SDT_DPRIME_PASS,
  SDT_DPRIME_DOWN,
  // Jaeggi
  JAEGGI_MAX_ERRORS_PER_MODALITY,
  JAEGGI_ERRORS_DOWN,
  // BrainWorkshop
  BW_SCORE_PASS_NORMALIZED,
  BW_RAW_SCORE_PASS,
  BW_SCORE_DOWN_NORMALIZED,
  BW_DPRIME_CONVERSION_BASE,
  BW_DPRIME_CONVERSION_FACTOR,
  // Multi-stimulus
  MULTI_AUDIO_STAGGER_MS,
  MULTI_STIMULUS_POSITION_MODALITIES,
  MULTI_AUDIO_MODALITIES,
  MULTI_STIMULUS_COLORS,
  MULTI_STIMULUS_SHAPES,
  MULTI_STIMULUS_TIMING_BONUS_MS,
  // Accuracy
  ACCURACY_PASS_NORMALIZED,
  TRACE_ACCURACY_PASS_NORMALIZED,
  // UPS
  JOURNEY_MIN_UPS,
  // Session Timing
  TIMING_SESSION_PREP_MS,
  TIMING_FEEDBACK_DEFAULT_MS,
  TIMING_MIN_INTERVAL_SPAM_MS,
  TIMING_ISI_PAUSE_SECONDS,
  // Progression
  PROGRESSION_SCORE_UP,
  PROGRESSION_SCORE_STRIKE,
  PROGRESSION_STRIKES_TO_DOWN,
  // Psychometric
  PSYCHOMETRIC_BIAS_LIBERAL_THRESHOLD,
  PSYCHOMETRIC_BIAS_CONSERVATIVE_THRESHOLD,
  // Sequence Engine
  SEQUENCE_MIN_PROBABILITY_MULTIPLIER,
  SEQUENCE_FATIGUE_RATE_DEFAULT,
  // Generation
  GEN_TARGET_PROBABILITY_DEFAULT,
  // Storage Monitoring
  STORAGE_WARNING_THRESHOLD_PERCENT,
  STORAGE_CRITICAL_THRESHOLD_PERCENT,
  // Trajectory Limits
  TRAJECTORY_MAX_POINTS,
  TRAJECTORY_MAX_DURATION_MS,
  TRAJECTORY_WARNING_POINTS,
  // Trace Arithmetic Interference
  TRACE_ARITHMETIC_MIN_OPERATIONS,
  TRACE_ARITHMETIC_MAX_OPERATIONS,
  TRACE_ARITHMETIC_MIN_RESULT,
  TRACE_ARITHMETIC_MAX_RESULT,
  TRACE_ARITHMETIC_MAX_DIGIT,
  TRACE_ARITHMETIC_TIMEOUT_MS,
  // Trace Mirror Grid (Dyslatéralisation)
  TRACE_GRID_COLS_MIRROR,
  TRACE_GRID_ROWS_MIRROR,
  TRACE_POSITIONS_MIRROR,
  // Stroop
  STROOP_DEFAULT_TRIALS,
  STROOP_STIMULUS_TIMEOUT_MS,
  STROOP_ITI_MS,
  // Flanker
  FLANKER_DEFAULT_TRIALS,
  FLANKER_STIMULUS_TIMEOUT_MS,
  FLANKER_ITI_MS,
  // Simon
  SIMON_DEFAULT_TRIALS,
  SIMON_STIMULUS_TIMEOUT_MS,
  SIMON_ITI_MS,
  // Go/No-Go
  GO_NOGO_DEFAULT_TRIALS,
  GO_NOGO_STIMULUS_DURATION_MS,
  GO_NOGO_ITI_MS,
  GO_NOGO_GO_PROBABILITY,
  // Stop-Signal
  STOP_SIGNAL_DEFAULT_TRIALS,
  STOP_SIGNAL_STIMULUS_DURATION_MS,
  STOP_SIGNAL_ITI_MS,
  STOP_SIGNAL_GO_PROBABILITY,
  STOP_SIGNAL_INITIAL_SSD_MS,
  STOP_SIGNAL_SSD_STEP_MS,
  STOP_SIGNAL_SSD_MIN_MS,
  STOP_SIGNAL_SSD_MAX_MS,
  MODE_COLOR_STOP_SIGNAL,
  // Antisaccade
  ANTISACCADE_DEFAULT_TRIALS,
  ANTISACCADE_FIXATION_MS,
  ANTISACCADE_CUE_DURATION_MS,
  ANTISACCADE_GAP_MS,
  ANTISACCADE_TARGET_TIMEOUT_MS,
  ANTISACCADE_PRO_PROBABILITY,
  MODE_COLOR_ANTISACCADE,
  // PVT
  PVT_DEFAULT_TRIALS,
  PVT_FOREPERIOD_MIN_MS,
  PVT_FOREPERIOD_MAX_MS,
  PVT_LAPSE_THRESHOLD_MS,
  MODE_COLOR_PVT,
  // Posner Cueing
  POSNER_DEFAULT_TRIALS,
  POSNER_FIXATION_MS,
  POSNER_CUE_DURATION_MS,
  POSNER_SOA_MIN_MS,
  POSNER_SOA_MAX_MS,
  POSNER_TARGET_TIMEOUT_MS,
  POSNER_VALID_PROBABILITY,
  MODE_COLOR_POSNER_CUEING,
  // Symmetry Span
  SYMMETRY_SPAN_DEFAULT_SET_SIZE,
  SYMMETRY_SPAN_MAX_SET_SIZE,
  SYMMETRY_SPAN_TOTAL_SETS,
  SYMMETRY_SPAN_MAX_CONSECUTIVE_FAILURES,
  SYMMETRY_SPAN_POSITION_DISPLAY_MS,
  SYMMETRY_SPAN_PROCESSING_THRESHOLD,
  MODE_COLOR_SYMMETRY_SPAN,
  // Mental Rotation
  MENTAL_ROTATION_DEFAULT_TRIALS,
  MENTAL_ROTATION_TIMEOUT_MS,
  MENTAL_ROTATION_ITI_MS,
  MODE_COLOR_MENTAL_ROTATION,
  // Ravens
  RAVENS_DEFAULT_TRIALS,
  MODE_COLOR_RAVENS,
  // Digit Span
  DIGIT_SPAN_DEFAULT_START_SPAN,
  DIGIT_SPAN_MAX_SPAN,
  DIGIT_SPAN_MAX_CONSECUTIVE_FAILURES,
  DIGIT_SPAN_DIGIT_DISPLAY_MS,
  DIGIT_SPAN_DIGIT_GAP_MS,
  MODE_COLOR_DIGIT_SPAN,
  // Reading Span
  READING_SPAN_DEFAULT_START_SPAN,
  READING_SPAN_MAX_SPAN,
  READING_SPAN_MAX_CONSECUTIVE_FAILURES,
  READING_SPAN_WORD_DISPLAY_MS,
  MODE_COLOR_READING_SPAN,
  // Sternberg
  STERNBERG_DEFAULT_TRIALS,
  STERNBERG_SET_DISPLAY_MS,
  STERNBERG_BLANK_MS,
  STERNBERG_RESPONSE_TIMEOUT_MS,
  MODE_COLOR_STERNBERG,
  // Letter-Number
  LETTER_NUMBER_DEFAULT_START_SPAN,
  LETTER_NUMBER_MAX_SPAN,
  LETTER_NUMBER_MAX_CONSECUTIVE_FAILURES,
  LETTER_NUMBER_ITEM_DISPLAY_MS,
  LETTER_NUMBER_ITEM_GAP_MS,
  MODE_COLOR_LETTER_NUMBER,
  MODE_COLOR_ANT,
  MODE_COLOR_VISUAL_SEARCH,
  MODE_COLOR_CHANGE_DETECTION,
  MODE_COLOR_AX_CPT,
  // SART
  SART_DEFAULT_TRIALS,
  SART_STIMULUS_DURATION_MS,
  SART_MASK_DURATION_MS,
  SART_NOGO_DIGIT,
  SART_GO_PROBABILITY,
  MODE_COLOR_SART,
  // CPT
  CPT_DEFAULT_TRIALS,
  CPT_STIMULUS_DURATION_MS,
  CPT_ISI_MS,
  CPT_TARGET_PROBABILITY,
  MODE_COLOR_CPT,
  // PAL
  PAL_DEFAULT_START_PAIRS,
  PAL_MAX_PAIRS,
  PAL_REVEAL_DURATION_MS,
  PAL_MAX_CONSECUTIVE_FAILURES,
  MODE_COLOR_PAL,
  // Word List
  WORD_LIST_DEFAULT_LIST_SIZE,
  WORD_LIST_LEARNING_TRIALS,
  WORD_LIST_WORD_DISPLAY_MS,
  WORD_LIST_IWI_MS,
  MODE_COLOR_WORD_LIST,
  // Pattern Recognition
  PATTERN_RECOGNITION_DEFAULT_PATTERNS,
  PATTERN_RECOGNITION_DISPLAY_MS,
  PATTERN_RECOGNITION_DELAY_MS,
  MODE_COLOR_PATTERN_RECOGNITION,
  // Tower
  TOWER_DEFAULT_PROBLEMS,
  TOWER_MIN_MOVES_START,
  TOWER_MAX_MOVES,
  TOWER_TIME_LIMIT_MS,
  MODE_COLOR_TOWER,
  // Maze
  MAZE_DEFAULT_PROBLEMS,
  MAZE_START_GRID_SIZE,
  MAZE_MAX_GRID_SIZE,
  MAZE_PLANNING_TIME_MS,
  MODE_COLOR_MAZE,
  // Word Flow
  WORD_FLOW_ROUND_DURATION_MS,
  WORD_FLOW_DEFAULT_ROUNDS,
  MODE_COLOR_WORD_FLOW,
  // Word Chain
  WORD_CHAIN_ROUND_DURATION_MS,
  WORD_CHAIN_DEFAULT_ROUNDS,
  MODE_COLOR_WORD_CHAIN,
  // ProMem
  PROMEM_DEFAULT_TRIALS,
  PROMEM_TARGET_FREQUENCY,
  PROMEM_STIMULUS_TIMEOUT_MS,
  PROMEM_ITI_MS,
  MODE_COLOR_PROMEM,
  // Time ProMem
  TIME_PROMEM_TARGET_INTERVAL_MS,
  TIME_PROMEM_SESSION_DURATION_MS,
  TIME_PROMEM_ACCEPTABLE_WINDOW_MS,
  MODE_COLOR_TIME_PROMEM,
  // Dual Task
  DUAL_TASK_SESSION_DURATION_MS,
  DUAL_TASK_VISUAL_TIMEOUT_MS,
  DUAL_TASK_AUDITORY_TIMEOUT_MS,
  MODE_COLOR_DUAL_TASK,
  // Task Juggling
  TASK_JUGGLING_DEFAULT_SUBTASKS,
  TASK_JUGGLING_SESSION_DURATION_MS,
  TASK_JUGGLING_SUBTASK_DEADLINE_MS,
  MODE_COLOR_TASK_JUGGLING,
  // UFOV
  UFOV_DEFAULT_TRIALS,
  UFOV_INITIAL_DISPLAY_MS,
  UFOV_MIN_DISPLAY_MS,
  UFOV_MASK_DURATION_MS,
  MODE_COLOR_UFOV,
  // Gabor
  GABOR_DEFAULT_TRIALS,
  GABOR_DISPLAY_MS,
  GABOR_RESPONSE_TIMEOUT_MS,
  MODE_COLOR_GABOR,
  // Odd One Out
  ODD_ONE_OUT_DEFAULT_TRIALS,
  ODD_ONE_OUT_TIMEOUT_MS,
  ODD_ONE_OUT_START_GRID_SIZE,
  MODE_COLOR_ODD_ONE_OUT,
  // Number Series
  NUMBER_SERIES_DEFAULT_TRIALS,
  NUMBER_SERIES_TIMEOUT_MS,
  MODE_COLOR_NUMBER_SERIES,
  // Analogies
  ANALOGIES_DEFAULT_TRIALS,
  ANALOGIES_TIMEOUT_MS,
  MODE_COLOR_ANALOGIES,
  // Time Estimation
  TIME_ESTIMATION_DEFAULT_TRIALS,
  TIME_ESTIMATION_MIN_DURATION_MS,
  TIME_ESTIMATION_MAX_DURATION_MS,
  TIME_ESTIMATION_ACCEPTABLE_ERROR,
  MODE_COLOR_TIME_ESTIMATION,
  // Rhythm
  RHYTHM_DEFAULT_TRIALS,
  RHYTHM_START_BEATS,
  RHYTHM_MAX_BEATS,
  RHYTHM_ACCEPTABLE_ERROR_MS,
  MODE_COLOR_RHYTHM,
  // Binding
  BINDING_DEFAULT_TRIALS,
  BINDING_DISPLAY_MS,
  BINDING_RETENTION_MS,
  BINDING_START_SET_SIZE,
  BINDING_MAX_SET_SIZE,
  MODE_COLOR_BINDING,
  // Soroban
  SOROBAN_DEFAULT_TRIALS,
  SOROBAN_RESPONSE_TIMEOUT_MS,
  SOROBAN_ITI_MS,
  MODE_COLOR_SOROBAN,
  // Reflex
  REFLEX_DEFAULT_TRIALS,
  REFLEX_INITIAL_STIMULUS_MS,
  REFLEX_MIN_STIMULUS_MS,
  REFLEX_ITI_MS,
  REFLEX_FIXATION_MS,
  REFLEX_TARGET_PROBABILITY,
  MODE_COLOR_REFLEX,
  // Speed Sort
  SPEED_SORT_DEFAULT_TRIALS,
  SPEED_SORT_STIMULUS_TIMEOUT_MS,
  SPEED_SORT_ITI_MS,
  SPEED_SORT_FEEDBACK_MS,
  SPEED_SORT_RULE_SWITCH_MIN,
  SPEED_SORT_RULE_SWITCH_MAX,
  MODE_COLOR_SPEED_SORT,
} from './thresholds';

// =============================================================================
// Tempo Specs (GameSession modes) - Each mode in its own file
// =============================================================================

// Shared types
export type { TempoUiExtensions } from './tempo-shared';

// Dual Catch
export { DualCatchSpec } from './dual-catch.spec';

// Sim Jaeggi
export { DualnbackClassicSpec, type DualnbackClassicExtensions } from './dualnback-classic.spec';

// Sim BrainWorkshop
export {
  SimBrainWorkshopSpec,
  calculateBWTrialsCount,
  calculateBWIntervalMs,
  type BrainWorkshopExtensions,
} from './brainworkshop.spec';

// Custom
export { CustomModeSpec } from './custom.spec';

// Combined registry for backwards compatibility
import { DualCatchSpec } from './dual-catch.spec';
import { DualnbackClassicSpec } from './dualnback-classic.spec';
import { SimBrainWorkshopSpec } from './brainworkshop.spec';
import { CustomModeSpec } from './custom.spec';

export const TempoSpecs = {
  'dual-catch': DualCatchSpec,
  'dualnback-classic': DualnbackClassicSpec,
  'sim-brainworkshop': SimBrainWorkshopSpec,
  custom: CustomModeSpec,
} as const;

// =============================================================================
// Flow Specs (PlaceSession modes)
// =============================================================================

export {
  DualPlaceSpec,
  PlaceSpecs,
  type PlaceExtensions,
  type PlaceSpec,
} from './place.spec';

// =============================================================================
// Memo Specs (MemoSession modes)
// =============================================================================

export {
  DualMemoSpec,
  MemoSpecs,
  type MemoExtensions,
  type MemoSpec,
} from './memo.spec';

// =============================================================================
// Label Specs (DualPickSession modes)
// =============================================================================

export {
  DualPickSpec,
  PickSpecs,
  type PickExtensions,
  type PickSpec,
} from './pick.spec';

// =============================================================================
// Time Specs (Dual Time - alpha)
// =============================================================================

export { DualTimeSpec, TimeSpecs } from './time.spec';

// =============================================================================
// Corsi Block Specs
// =============================================================================

export {
  CorsiBlockSpec,
  CorsiSpecs,
  type CorsiExtensions,
} from './corsi.spec';

// =============================================================================
// Track Specs (Dual Track - MOT)
// =============================================================================

export {
  DualTrackSpec,
  TrackSpecs,
  type TrackExtensions,
} from './track.spec';

// =============================================================================
// OSPAN Specs (Operation Span)
// =============================================================================

export {
  OspanSpec,
  OspanSpecs,
  type OspanExtensions,
} from './ospan.spec';

export {
  RunningSpanSpec,
  RunningSpanSpecs,
  type RunningSpanExtensions,
} from './running-span.spec';

export {
  PasatSpec,
  PasatSpecs,
  type PasatExtensions,
} from './pasat.spec';

export {
  SwmSpec,
  SwmSpecs,
  type SwmExtensions,
} from './swm.spec';

// =============================================================================
// Stroop Specs
// =============================================================================

export { StroopSpec, StroopSpecs } from './stroop.spec';

// =============================================================================
// Flanker Specs
// =============================================================================

export { FlankerSpec, FlankerSpecs } from './flanker.spec';

// =============================================================================
// Soroban Specs
// =============================================================================

export { SorobanSpec, SorobanSpecs } from './soroban.spec';

// =============================================================================
// Simon Specs
// =============================================================================

export { SimonSpec, SimonSpecs } from './simon.spec';

// =============================================================================
// Go/No-Go Specs
// =============================================================================

export { GoNogoSpec, GoNogoSpecs } from './go-nogo.spec';

// =============================================================================
// Stop-Signal Specs
// =============================================================================

export { StopSignalSpec, StopSignalSpecs } from './stop-signal.spec';

// =============================================================================
// Antisaccade Specs
// =============================================================================

export { AntisaccadeSpec, AntisaccadeSpecs } from './antisaccade.spec';

// =============================================================================
// PVT Specs
// =============================================================================

export { PvtSpec, PvtSpecs } from './pvt.spec';

// =============================================================================
// Posner Cueing Specs
// =============================================================================

export { PosnerCueingSpec, PosnerCueingSpecs } from './posner-cueing.spec';

// =============================================================================
// WCST Specs
// =============================================================================

export {
  WcstSpec,
  WcstSpecs,
  type WcstExtensions,
} from './wcst.spec';

// =============================================================================
// Task Switching Specs
// =============================================================================

export {
  TaskSwitchingSpec,
  TaskSwitchingSpecs,
  type TaskSwitchingExtensions,
} from './task-switching.spec';

// =============================================================================
// Trail Making Specs
// =============================================================================

export {
  TrailMakingSpec,
  TrailMakingSpecs,
  type TrailMakingExtensions,
} from './trail-making.spec';

// =============================================================================
// ANT Specs (Attention Network Test)
// =============================================================================

export { AntSpec, AntSpecs } from './ant.spec';

// =============================================================================
// Visual Search Specs
// =============================================================================

export { VisualSearchSpec, VisualSearchSpecs } from './visual-search.spec';

// =============================================================================
// Change Detection Specs
// =============================================================================

export { ChangeDetectionSpec, ChangeDetectionSpecs } from './change-detection.spec';

// =============================================================================
// AX-CPT Specs
// =============================================================================

export { AxCptSpec, AxCptSpecs } from './ax-cpt.spec';

// =============================================================================
// Digit Span Specs
// =============================================================================

export { DigitSpanSpec, DigitSpanSpecs } from './digit-span.spec';

// =============================================================================
// Memory Match Specs
// =============================================================================

export { MemoryMatchSpec, MemoryMatchSpecs } from './memory-match.spec';

// =============================================================================
// Lights Out Specs
// =============================================================================

export { LightsOutSpec, LightsOutSpecs } from './lights-out.spec';

// =============================================================================
// Pipeline Specs
// =============================================================================

export { PipelineSpec, PipelineSpecs, MODE_COLOR_PIPELINE } from './pipeline.spec';

// =============================================================================
// Mirror Specs
// =============================================================================

export { MirrorSpec, MirrorSpecs, MODE_COLOR_MIRROR } from './mirror.spec';

// =============================================================================
// Sokoban Specs
// =============================================================================

export { SokobanSpec, SokobanSpecs, MODE_COLOR_SOKOBAN } from './sokoban.spec';
export { TangramSpec, TangramSpecs, MODE_COLOR_TANGRAM } from './tangram.spec';

// =============================================================================
// Nonogram Specs
// =============================================================================

export {
  NonogramSpec,
  NonogramSpecs,
  MODE_COLOR_NONOGRAM,
  NONOGRAM_GRID_CONFIGS,
} from './nonogram.spec';

// =============================================================================
// Flood Specs
// =============================================================================

export { FloodSpec, FloodSpecs, MODE_COLOR_FLOOD, FLOOD_GRID_CONFIGS } from './flood.spec';

// =============================================================================
// Fifteen Specs
// =============================================================================

export {
  FifteenSpec,
  FifteenSpecs,
  MODE_COLOR_FIFTEEN,
  FIFTEEN_GRID_CONFIGS,
} from './fifteen.spec';

// =============================================================================
// Pegs Specs
// =============================================================================

export { PegsSpec, PegsSpecs, MODE_COLOR_PEGS } from './pegs.spec';

// =============================================================================
// Sudoku Specs
// =============================================================================

export { SudokuSpec, SudokuSpecs, MODE_COLOR_SUDOKU } from './sudoku.spec';

// =============================================================================
// 2048 Specs
// =============================================================================

export {
  TwentyFortyEightSpec,
  TwentyFortyEightSpecs,
  MODE_COLOR_2048,
} from './twenty-forty-eight.spec';

// =============================================================================
// Wave 2 Tatham Specs
// =============================================================================

export { GuessSpec, GuessSpecs, MODE_COLOR_GUESS } from './guess.spec';
export { SameGameSpec, SameGameSpecs, MODE_COLOR_SAMEGAME } from './samegame.spec';
export { UntangleSpec, UntangleSpecs, MODE_COLOR_UNTANGLE } from './untangle.spec';
export { UnrulySpec, UnrulySpecs, MODE_COLOR_UNRULY } from './unruly.spec';
export { TwiddleSpec, TwiddleSpecs, MODE_COLOR_TWIDDLE } from './twiddle.spec';
export { MapColoringSpec, MapColoringSpecs, MODE_COLOR_MAP_COLORING } from './map-coloring.spec';

// =============================================================================
// Wave 3 Tatham Specs
// =============================================================================

export { TowersSpec, TowersSpecs, MODE_COLOR_TOWERS } from './towers.spec';
export { BridgesSpec, BridgesSpecs, MODE_COLOR_BRIDGES } from './bridges.spec';
export { NetSpec, NetSpecs, MODE_COLOR_NET } from './net.spec';
export { InertiaSpec, InertiaSpecs, MODE_COLOR_INERTIA } from './inertia.spec';
export { SignpostSpec, SignpostSpecs, MODE_COLOR_SIGNPOST } from './signpost.spec';
export { KeenSpec, KeenSpecs, MODE_COLOR_KEEN } from './keen.spec';

// =============================================================================
// Wave 4 Tatham Specs
// =============================================================================

export { DominosaSpec, DominosaSpecs, MODE_COLOR_DOMINOSA } from './dominosa.spec';
export { SinglesSpec, SinglesSpecs, MODE_COLOR_SINGLES } from './singles.spec';
export { LightUpSpec, LightUpSpecs, MODE_COLOR_LIGHTUP } from './lightup.spec';
export { TentsSpec, TentsSpecs, MODE_COLOR_TENTS } from './tents.spec';
export { SlantSpec, SlantSpecs, MODE_COLOR_SLANT } from './slant.spec';
export { FillingSpec, FillingSpecs, MODE_COLOR_FILLING } from './filling.spec';

// =============================================================================
// Wave 5 Tatham Specs
// =============================================================================

export { LoopySpec, LoopySpecs, MODE_COLOR_LOOPY } from './loopy.spec';
export { PearlSpec, PearlSpecs, MODE_COLOR_PEARL } from './pearl.spec';
export { MagnetsSpec, MagnetsSpecs, MODE_COLOR_MAGNETS } from './magnets.spec';
export { GalaxiesSpec, GalaxiesSpecs, MODE_COLOR_GALAXIES } from './galaxies.spec';
export { RectanglesSpec, RectanglesSpecs, MODE_COLOR_RECTANGLES } from './rectangles.spec';
export { TracksSpec, TracksSpecs, MODE_COLOR_TRACKS } from './tracks.spec';

// =============================================================================
// Wave 6 Tatham Specs
// =============================================================================

export { BlackBoxSpec, BlackBoxSpecs, MODE_COLOR_BLACKBOX } from './blackbox.spec';
export { UndeadSpec, UndeadSpecs, MODE_COLOR_UNDEAD } from './undead.spec';
export { MosaicSpec, MosaicSpecs, MODE_COLOR_MOSAIC } from './mosaic.spec';
export { SixteenSpec, SixteenSpecs, MODE_COLOR_SIXTEEN } from './sixteen.spec';
export { PalisadeSpec, PalisadeSpecs, MODE_COLOR_PALISADE } from './palisade.spec';
export { RangeSpec, RangeSpecs, MODE_COLOR_RANGE } from './range.spec';
export { CubeSpec, CubeSpecs, MODE_COLOR_CUBE } from './cube.spec';
export { NetslideSpec, NetslideSpecs, MODE_COLOR_NETSLIDE } from './netslide.spec';
export { FlipSpec, FlipSpecs, MODE_COLOR_FLIP } from './flip.spec';

// =============================================================================
// Reflex Specs
// =============================================================================

export { ReflexSpec, ReflexSpecs } from './reflex.spec';

// =============================================================================
// Speed Sort Specs
// =============================================================================

export { SpeedSortSpec, SpeedSortSpecs } from './speed-sort.spec';

// =============================================================================
// Rhythm Tap Specs
// =============================================================================

export { RhythmTapSpec, RhythmTapSpecs } from './rhythm-tap.spec';

// =============================================================================
// Color Rush Specs
// =============================================================================

export { ColorRushSpec, ColorRushSpecs, MODE_COLOR_COLOR_RUSH } from './color-rush.spec';

// =============================================================================
// Spot Diff Specs
// =============================================================================

export { SpotDiffSpec, SpotDiffSpecs, MODE_COLOR_SPOT_DIFF } from './spot-diff.spec';

// =============================================================================
// Tetris Mind Specs
// =============================================================================

export { TetrisMindSpec, TetrisMindSpecs, MODE_COLOR_TETRIS_MIND } from './tetris-mind.spec';

// =============================================================================
// Reading Span Specs
// =============================================================================

export { ReadingSpanSpec, ReadingSpanSpecs } from './reading-span.spec';

// =============================================================================
// Sternberg Specs
// =============================================================================

export { SternbergSpec, SternbergSpecs } from './sternberg.spec';

// =============================================================================
// Letter-Number Specs
// =============================================================================

export { LetterNumberSpec, LetterNumberSpecs } from './letter-number.spec';

// =============================================================================
// Symmetry Span Specs
// =============================================================================

export { SymmetrySpanSpec, SymmetrySpanSpecs } from './symmetry-span.spec';

// =============================================================================
// Mental Rotation Specs
// =============================================================================

export { MentalRotationSpec, MentalRotationSpecs } from './mental-rotation.spec';

// =============================================================================
// Ravens Specs
// =============================================================================

export { RavensSpec, RavensSpecs } from './ravens.spec';

// =============================================================================
// SART Specs (Sustained Attention to Response Task)
// =============================================================================

export { SartSpec, SartSpecs } from './sart.spec';

// =============================================================================
// CPT Specs (Continuous Performance Test)
// =============================================================================

export { CptSpec, CptSpecs } from './cpt.spec';

// =============================================================================
// PAL Specs (Paired Associates Learning)
// =============================================================================

export { PalSpec, PalSpecs } from './pal.spec';

// =============================================================================
// Word List Specs (RAVLT-inspired)
// =============================================================================

export { WordListSpec, WordListSpecs } from './word-list.spec';

// =============================================================================
// Pattern Recognition Memory Specs
// =============================================================================

export { PatternRecognitionSpec, PatternRecognitionSpecs } from './pattern-recognition.spec';

// =============================================================================
// Tower Specs (Tower of London)
// =============================================================================

export { TowerSpec, TowerSpecs } from './tower.spec';

// =============================================================================
// Gridlock Specs (Sliding Puzzle)
// =============================================================================

export { GridlockSpec, GridlockSpecs } from './gridlock.spec';

// =============================================================================
// Maze Specs (Maze Planning)
// =============================================================================

export { MazeSpec, MazeSpecs } from './maze.spec';

// =============================================================================
// Word Flow Specs (Verbal Fluency)
// =============================================================================

export { WordFlowSpec, WordFlowSpecs } from './word-flow.spec';

// =============================================================================
// Word Chain Specs (Associative Fluency)
// =============================================================================

export { WordChainSpec, WordChainSpecs } from './word-chain.spec';

// =============================================================================
// ProMem Specs (Prospective Memory)
// =============================================================================

export { ProMemSpec, ProMemSpecs } from './promem.spec';

// =============================================================================
// Time ProMem Specs (Time-Based Prospective Memory)
// =============================================================================

export { TimeProMemSpec, TimeProMemSpecs } from './time-promem.spec';

// =============================================================================
// Dual Task Specs
// =============================================================================

export { DualTaskSpec, DualTaskSpecs } from './dual-task.spec';

// =============================================================================
// Task Juggling Specs
// =============================================================================

export { TaskJugglingSpec, TaskJugglingSpecs } from './task-juggling.spec';

// =============================================================================
// UFOV Specs (Useful Field of View)
// =============================================================================

export { UfovSpec, UfovSpecs } from './ufov.spec';

// =============================================================================
// Gabor Specs (Gabor Detection)
// =============================================================================

export { GaborSpec, GaborSpecs } from './gabor.spec';

// =============================================================================
// Odd One Out Specs
// =============================================================================

export { OddOneOutSpec, OddOneOutSpecs } from './odd-one-out.spec';

// =============================================================================
// Number Series Specs
// =============================================================================

export { NumberSeriesSpec, NumberSeriesSpecs } from './number-series.spec';

// =============================================================================
// Analogies Specs
// =============================================================================

export { AnalogiesSpec, AnalogiesSpecs } from './analogies.spec';

// =============================================================================
// Time Estimation Specs
// =============================================================================

export { TimeEstimationSpec, TimeEstimationSpecs } from './time-estimation.spec';

// =============================================================================
// Rhythm Specs (Rhythm Reproduction)
// =============================================================================

export { RhythmSpec, RhythmSpecs } from './rhythm.spec';

// =============================================================================
// Binding Specs (Feature Binding)
// =============================================================================

export { BindingSpec, BindingSpecs } from './binding.spec';

// =============================================================================
// Chain Recall Specs (Growing Sequence Memory)
// =============================================================================

export { ChainRecallSpec, ChainRecallSpecs } from './chain-recall.spec';

// =============================================================================
// Trace Specs (TraceSession modes)
// =============================================================================

export {
  DualTraceSpec,
  buildTraceSessionConfig,
  type ArithmeticInterferenceConfig,
  type TraceExtensions,
  type TraceSpec,
  type TraceWritingMode,
  type TraceRhythmMode,
} from './trace.spec';

// =============================================================================
// Tutorial Specs
// =============================================================================

export {
  ClassicTutorialSpec,
  PlaceTutorialSpec,
  PickTutorialSpec,
  TraceTutorialSpec,
  MemoTutorialSpec,
  TutorialSpecs,
  getTutorialSpec,
  TUTORIAL_HUB_ORDER,
  type TutorialSpecId,
} from './tutorial.spec';

// =============================================================================
// All Specs Registry
// =============================================================================

import { PlaceSpecs } from './place.spec';
import { MemoSpecs } from './memo.spec';
import { PickSpecs } from './pick.spec';
import { DualTraceSpec } from './trace.spec';
import { TimeSpecs } from './time.spec';
import { CorsiSpecs } from './corsi.spec';
import { TrackSpecs } from './track.spec';
import { OspanSpecs } from './ospan.spec';
import { RunningSpanSpecs } from './running-span.spec';
import { PasatSpecs } from './pasat.spec';
import { SwmSpecs } from './swm.spec';
import { StroopSpecs } from './stroop.spec';
import { FlankerSpecs } from './flanker.spec';
import { SorobanSpecs } from './soroban.spec';
import { SimonSpecs } from './simon.spec';
import { GoNogoSpecs } from './go-nogo.spec';
import { StopSignalSpecs } from './stop-signal.spec';
import { AntisaccadeSpecs } from './antisaccade.spec';
import { PvtSpecs } from './pvt.spec';
import { PosnerCueingSpecs } from './posner-cueing.spec';
import { WcstSpecs } from './wcst.spec';
import { TaskSwitchingSpecs } from './task-switching.spec';
import { TrailMakingSpecs } from './trail-making.spec';
import { AntSpecs } from './ant.spec';
import { VisualSearchSpecs } from './visual-search.spec';
import { ChangeDetectionSpecs } from './change-detection.spec';
import { AxCptSpecs } from './ax-cpt.spec';
import { DigitSpanSpecs } from './digit-span.spec';
import { MemoryMatchSpecs } from './memory-match.spec';
import { ReadingSpanSpecs } from './reading-span.spec';
import { SternbergSpecs } from './sternberg.spec';
import { LetterNumberSpecs } from './letter-number.spec';
import { SartSpecs } from './sart.spec';
import { CptSpecs } from './cpt.spec';
import { PalSpecs } from './pal.spec';
import { WordListSpecs } from './word-list.spec';
import { PatternRecognitionSpecs } from './pattern-recognition.spec';
import { TowerSpecs } from './tower.spec';
import { GridlockSpecs } from './gridlock.spec';
import { MazeSpecs } from './maze.spec';
import { WordFlowSpecs } from './word-flow.spec';
import { WordChainSpecs } from './word-chain.spec';
import { ProMemSpecs } from './promem.spec';
import { TimeProMemSpecs } from './time-promem.spec';
import { DualTaskSpecs } from './dual-task.spec';
import { TaskJugglingSpecs } from './task-juggling.spec';
import { UfovSpecs } from './ufov.spec';
import { GaborSpecs } from './gabor.spec';
import { OddOneOutSpecs } from './odd-one-out.spec';
import { NumberSeriesSpecs } from './number-series.spec';
import { AnalogiesSpecs } from './analogies.spec';
import { TimeEstimationSpecs } from './time-estimation.spec';
import { RhythmSpecs } from './rhythm.spec';
import { BindingSpecs } from './binding.spec';
import { ChainRecallSpecs } from './chain-recall.spec';
import { LightsOutSpecs } from './lights-out.spec';
import { PipelineSpecs } from './pipeline.spec';
import { SokobanSpecs } from './sokoban.spec';
import { MirrorSpecs } from './mirror.spec';
import { NonogramSpecs } from './nonogram.spec';
import { FloodSpecs } from './flood.spec';
import { FifteenSpecs } from './fifteen.spec';
import { PegsSpecs } from './pegs.spec';
import { SudokuSpecs } from './sudoku.spec';
import { TwentyFortyEightSpecs } from './twenty-forty-eight.spec';
import { GuessSpecs } from './guess.spec';
import { SameGameSpecs } from './samegame.spec';
import { UntangleSpecs } from './untangle.spec';
import { UnrulySpecs } from './unruly.spec';
import { TwiddleSpecs } from './twiddle.spec';
import { MapColoringSpecs } from './map-coloring.spec';
import { TowersSpecs } from './towers.spec';
import { BridgesSpecs } from './bridges.spec';
import { NetSpecs } from './net.spec';
import { InertiaSpecs } from './inertia.spec';
import { SignpostSpecs } from './signpost.spec';
import { KeenSpecs } from './keen.spec';
import { DominosaSpecs } from './dominosa.spec';
import { SinglesSpecs } from './singles.spec';
import { LightUpSpecs } from './lightup.spec';
import { TentsSpecs } from './tents.spec';
import { SlantSpecs } from './slant.spec';
import { FillingSpecs } from './filling.spec';
import { LoopySpecs } from './loopy.spec';
import { PearlSpecs } from './pearl.spec';
import { MagnetsSpecs } from './magnets.spec';
import { GalaxiesSpecs } from './galaxies.spec';
import { RectanglesSpecs } from './rectangles.spec';
import { TracksSpecs } from './tracks.spec';
import { BlackBoxSpecs } from './blackbox.spec';
import { UndeadSpecs } from './undead.spec';
import { MosaicSpecs } from './mosaic.spec';
import { SixteenSpecs } from './sixteen.spec';
import { PalisadeSpecs } from './palisade.spec';
import { RangeSpecs } from './range.spec';
import { CubeSpecs } from './cube.spec';
import { NetslideSpecs } from './netslide.spec';
import { FlipSpecs } from './flip.spec';
import { ReflexSpecs } from './reflex.spec';
import { SpeedSortSpecs } from './speed-sort.spec';
import { RhythmTapSpecs } from './rhythm-tap.spec';
import { ColorRushSpecs } from './color-rush.spec';
import { SpotDiffSpecs } from './spot-diff.spec';
import { TetrisMindSpecs } from './tetris-mind.spec';
import { TangramSpecs } from './tangram.spec';
import { MentalRotationSpecs } from './mental-rotation.spec';
import { RavensSpecs } from './ravens.spec';
import { TutorialSpecs } from './tutorial.spec';

/**
 * All mode specs in a single registry.
 * Use this to iterate over all modes or look up by ID.
 */
export const AllSpecs = {
  ...TempoSpecs,
  ...PlaceSpecs,
  ...MemoSpecs,
  ...PickSpecs,
  'dual-trace': DualTraceSpec,
  ...TimeSpecs,
  ...CorsiSpecs,
  ...TrackSpecs,
  ...OspanSpecs,
  ...RunningSpanSpecs,
  ...PasatSpecs,
  ...SwmSpecs,
  ...StroopSpecs,
  ...FlankerSpecs,
  ...SorobanSpecs,
  ...SimonSpecs,
  ...GoNogoSpecs,
  ...StopSignalSpecs,
  ...AntisaccadeSpecs,
  ...PvtSpecs,
  ...PosnerCueingSpecs,
  ...WcstSpecs,
  ...TaskSwitchingSpecs,
  ...TrailMakingSpecs,
  ...AntSpecs,
  ...VisualSearchSpecs,
  ...ChangeDetectionSpecs,
  ...AxCptSpecs,
  ...DigitSpanSpecs,
  ...MemoryMatchSpecs,
  ...ReadingSpanSpecs,
  ...SternbergSpecs,
  ...LetterNumberSpecs,
  // New placeholders
  ...SartSpecs,
  ...CptSpecs,
  ...PalSpecs,
  ...WordListSpecs,
  ...PatternRecognitionSpecs,
  ...TowerSpecs,
  ...GridlockSpecs,
  ...MazeSpecs,
  ...WordFlowSpecs,
  ...WordChainSpecs,
  ...ProMemSpecs,
  ...TimeProMemSpecs,
  ...DualTaskSpecs,
  ...TaskJugglingSpecs,
  ...UfovSpecs,
  ...GaborSpecs,
  ...OddOneOutSpecs,
  ...NumberSeriesSpecs,
  ...AnalogiesSpecs,
  ...TimeEstimationSpecs,
  ...RhythmSpecs,
  ...BindingSpecs,
  ...ChainRecallSpecs,
  ...LightsOutSpecs,
  ...PipelineSpecs,
  ...SokobanSpecs,
  ...MirrorSpecs,
  ...NonogramSpecs,
  ...FloodSpecs,
  ...FifteenSpecs,
  ...PegsSpecs,
  ...SudokuSpecs,
  ...TwentyFortyEightSpecs,
  ...GuessSpecs,
  ...SameGameSpecs,
  ...UntangleSpecs,
  ...UnrulySpecs,
  ...TwiddleSpecs,
  ...MapColoringSpecs,
  ...TowersSpecs,
  ...BridgesSpecs,
  ...NetSpecs,
  ...InertiaSpecs,
  ...SignpostSpecs,
  ...KeenSpecs,
  ...DominosaSpecs,
  ...SinglesSpecs,
  ...LightUpSpecs,
  ...TentsSpecs,
  ...SlantSpecs,
  ...FillingSpecs,
  ...LoopySpecs,
  ...PearlSpecs,
  ...MagnetsSpecs,
  ...GalaxiesSpecs,
  ...RectanglesSpecs,
  ...TracksSpecs,
  ...BlackBoxSpecs,
  ...UndeadSpecs,
  ...MosaicSpecs,
  ...SixteenSpecs,
  ...PalisadeSpecs,
  ...RangeSpecs,
  ...CubeSpecs,
  ...NetslideSpecs,
  ...FlipSpecs,
  ...ReflexSpecs,
  ...SpeedSortSpecs,
  ...RhythmTapSpecs,
  ...ColorRushSpecs,
  ...SpotDiffSpecs,
  ...TetrisMindSpecs,
  ...TangramSpecs,
  ...MentalRotationSpecs,
  ...RavensSpecs,
} as const;

/**
 * All tutorial specs in a single registry.
 */
export const AllTutorialSpecs = TutorialSpecs;

export type ModeId = keyof typeof AllSpecs;

// =============================================================================
// Journey Specs (Parcours d'entraînement)
// =============================================================================

export {
  // Types
  type SimulatorJourneySpec,
  type JourneyModeType,
  type JourneyProjectionKind,
  type IndicatorConfig,
  // Constants
  JOURNEY_MAX_LEVEL,
  JOURNEY_DEFAULT_TARGET_LEVEL,
  JOURNEY_DEFAULT_START_LEVEL,
  JOURNEY_PREMIUM_N_THRESHOLD,
  JOURNEY_MODES_PER_LEVEL,
  // Mode Specs
  SimulatorSpecs,
  // Score Thresholds
  JOURNEY_MIN_PASSING_SCORE,
  JOURNEY_SCORE_THRESHOLDS,
  JOURNEY_SESSIONS_BY_SCORE,
  // Helpers
  getSessionsRequired,
  getScoringStrategyForGameMode,
  isSimulatorMode,
  usesBinaryProgression,
  isNLevelPremium,
  getFirstPremiumStage,
  getTotalStages,
  // Backwards Compatibility
  JOURNEY_MODE_TO_GAME_MODE,
  GAME_MODE_TO_ROUTE,
} from './journey.spec';

// =============================================================================
// Stats Specs (Aggregate Stats Page Configuration)
// =============================================================================

export { GlobalStatsSpec, JourneyStatsSpec, DefaultStatsSpec } from './stats.spec';

import { GlobalStatsSpec, JourneyStatsSpec, DefaultStatsSpec } from './stats.spec';
import type { ModeStatsSpec } from './types';

/**
 * Map i18n/UI ModeType keys to spec mode IDs.
 *
 * This mapping handles the translation between:
 * - i18n keys used in UI (PascalCase: DualTempo, DualPlace, DualnbackClassic, Libre)
 * - Spec IDs used in logic (kebab-case: dual-catch, dual-place, dualnback-classic, custom)
 *
 * Used by:
 * - getStatsSpec() for resolving stats page configuration
 * - UI components that receive mode type from i18n or URL params
 *
 * DO NOT confuse with:
 * - Journey mode types (pick, place, memo, catch) - see JourneyModeSpecs
 *
 * @see getModeI18nKey() for the inverse mapping (spec ID → i18n key)
 */
const I18N_KEY_TO_SPEC_ID: Record<string, string> = {
  DualTempo: 'dual-catch',
  DualPlace: 'dual-place',
  DualMemo: 'dual-memo',
  DualPick: 'dual-pick',
  DualTrace: 'dual-trace',
  DualTime: 'dual-time',
  DualTrack: 'dual-track',
  CorsiBlock: 'corsi-block',
  Ospan: 'ospan',
  RunningSpan: 'running-span',
  PASAT: 'pasat',
  SWM: 'swm',
  DualnbackClassic: 'dualnback-classic',
  BrainWorkshop: 'sim-brainworkshop',
  Libre: 'custom',
  Stroop: 'stroop',
  Flanker: 'flanker',
  GoNogo: 'go-nogo',
  StopSignal: 'stop-signal',
  Antisaccade: 'antisaccade',
  WCST: 'wcst',
  TrailMaking: 'trail-making',
  TaskSwitching: 'task-switching',
  ChangeDetection: 'change-detection',
  ANT: 'ant',
  SymmetrySpan: 'symmetry-span',
  PVT: 'pvt',
  ReadingSpan: 'reading-span',
  DigitSpan: 'digit-span',
  MemoryMatch: 'memory-match',
  Simon: 'simon',
  PosnerCueing: 'posner-cueing',
  Sternberg: 'sternberg',
  AXCPT: 'ax-cpt',
  MentalRotation: 'mental-rotation',
  Ravens: 'visual-logic',
  VisualSearch: 'visual-search',
  LetterNumber: 'letter-number',
  // New placeholders
  SART: 'sart',
  CPT: 'cpt',
  PAL: 'pal',
  WordList: 'word-list',
  PatternRecognition: 'pattern-recognition',
  Tower: 'tower',
  Maze: 'maze',
  WordFlow: 'word-flow',
  WordChain: 'word-chain',
  ProMem: 'promem',
  TimeProMem: 'time-promem',
  DualTask: 'dual-task',
  TaskJuggling: 'task-juggling',
  UFOV: 'ufov',
  Gabor: 'gabor',
  OddOneOut: 'odd-one-out',
  NumberSeries: 'number-series',
  Analogies: 'analogies',
  TimeEstimation: 'time-estimation',
  Rhythm: 'rhythm',
  Binding: 'binding',
  ChainRecall: 'chain-recall',
  Pipeline: 'pipeline',
  Reflex: 'reflex',
  RhythmTap: 'rhythm-tap',
  ColorRush: 'color-rush',
  SpotDiff: 'spot-diff',
  TetrisMind: 'tetris-mind',
  Tangram: 'tangram',
  LightsOut: 'lights-out',
  SpeedSort: 'speed-sort',
  Nonogram: 'nonogram',
  Flood: 'flood',
  Fifteen: 'fifteen',
  Pegs: 'pegs',
  Sudoku: 'sudoku',
  TwentyFortyEight: '2048',
  Guess: 'guess',
  SameGame: 'samegame',
  Untangle: 'untangle',
  Unruly: 'unruly',
  Twiddle: 'twiddle',
  MapColoring: 'map-coloring',
  Towers: 'towers',
  Bridges: 'bridges',
  Net: 'net',
  Inertia: 'inertia',
  Signpost: 'signpost',
  Keen: 'keen',
  Dominosa: 'dominosa',
  Singles: 'singles',
  LightUp: 'lightup',
  Tents: 'tents',
  Slant: 'slant',
  Filling: 'filling',
  Loopy: 'loopy',
  Pearl: 'pearl',
  Magnets: 'magnets',
  Galaxies: 'galaxies',
  Rectangles: 'rectangles',
  Tracks: 'tracks',
  BlackBox: 'blackbox',
  Undead: 'undead',
  Mosaic: 'mosaic',
  Sixteen: 'sixteen',
  Palisade: 'palisade',
  Range: 'range',
  CubePuzzle: 'cube',
  Netslide: 'netslide',
  Flip: 'flip',
  Sokoban: 'sokoban',
  Mirror: 'mirror',
};

/**
 * Get the stats spec for a mode or view.
 *
 * Handles special cases:
 * - 'all' → GlobalStatsSpec (cross-mode aggregate)
 * - 'Journey' → JourneyStatsSpec (training path aggregate)
 * - UI ModeType (DualTempo, DualPlace, etc.) → Maps to spec ID
 * - Mode ID → Mode's stats spec or DefaultStatsSpec fallback
 *
 * @param mode The mode type ('all', 'Journey', UI ModeType, or a game mode ID)
 * @returns The stats spec for that mode
 */
export function getStatsSpec(mode: string): ModeStatsSpec {
  // Handle global/journey views
  if (mode === 'all') return GlobalStatsSpec;
  if (mode === 'Journey') return JourneyStatsSpec;

  // Map i18n/UI ModeType key to spec ID if needed
  const specId = I18N_KEY_TO_SPEC_ID[mode] ?? mode;

  // Look up mode spec
  const modeSpec = AllSpecs[specId as keyof typeof AllSpecs];
  if (modeSpec?.stats) {
    return modeSpec.stats;
  }

  // Fallback to default (tempo-like sections)
  return DefaultStatsSpec;
}

// =============================================================================
// Modality UI Helpers (Spec-Driven UI Configuration)
// =============================================================================

export {
  // Types
  type ModalityFamily,
  type ModalityLayout,
  type ReportUISpec,
  type ModalityLabelInfo,
  // Helpers
  getModalityFamily,
  getModalityColor,
  getModalityLabelInfo,
  getOptimalModalityLayout,
  isHexColor,
} from './modality-ui';

// =============================================================================
// Control Configuration (Data-Driven Game Controls)
// =============================================================================

export type { ControlColor } from './control-types';

export {
  // Types
  type ControlConfig,
  // Constants
  MODALITY_SHORTCUTS,
  MODALITY_COLORS,
  MODALITY_LABEL_KEYS,
  // Helpers
  getControlConfig,
  getControlConfigs,
  resolveModalityForKey,
  getModalitiesForKey,
  isGameControlKey,
} from './control-config';

// =============================================================================
// Report Display Helpers (Spec-Driven)
// =============================================================================

import type { ReportDisplaySpec, ModeColorSpec } from './types';

/**
 * Default display spec for modes without explicit configuration.
 * Uses generic labels and neutral colors.
 */
const DEFAULT_DISPLAY_SPEC: ReportDisplaySpec = {
  modeScoreKey: 'report.modeScore.accuracy',
  modeScoreTooltipKey: 'report.modeScore.accuracyTooltip',
  speedStatKey: 'report.speed.reactionTime',
  colors: {
    bg: 'bg-gray-50',
    border: 'border-gray-200',
    text: 'text-gray-700',
    accent: 'gray-500',
  },
};

/**
 * Default colors for unknown modes.
 */
const DEFAULT_MODE_COLORS: ModeColorSpec = {
  bg: 'bg-gray-50',
  border: 'border-gray-200',
  text: 'text-gray-700',
  accent: 'gray-500',
};

/**
 * Get the display spec for a game mode.
 * Falls back to default if mode not found or display not configured.
 *
 * @param gameMode The game mode ID (e.g., 'dual-catch', 'dual-place')
 * @returns The ReportDisplaySpec for this mode
 */
export function getModeDisplaySpec(gameMode: string, taskType?: string): ReportDisplaySpec {
  // For cognitive tasks, try the specific taskType first
  if (taskType) {
    const taskSpec = AllSpecs[taskType as keyof typeof AllSpecs];
    if (taskSpec?.report?.display) return taskSpec.report.display;
  }
  const spec = AllSpecs[gameMode as keyof typeof AllSpecs];
  if (spec?.report?.display) {
    return spec.report.display;
  }
  return DEFAULT_DISPLAY_SPEC;
}

/**
 * Get the color spec for a game mode.
 * Falls back to default colors if mode not found.
 *
 * @param gameMode The game mode ID (e.g., 'dual-catch', 'dual-place')
 * @param taskType Optional cognitive task type for spec-driven lookup
 * @returns The ModeColorSpec for this mode
 */
export function getModeColors(gameMode: string, taskType?: string): ModeColorSpec {
  if (taskType) {
    const taskSpec = AllSpecs[taskType as keyof typeof AllSpecs];
    if (taskSpec?.report?.display?.colors) return taskSpec.report.display.colors;
  }
  const spec = AllSpecs[gameMode as keyof typeof AllSpecs];
  if (spec?.report?.display?.colors) {
    return spec.report.display.colors;
  }
  return DEFAULT_MODE_COLORS;
}

/**
 * Get the report sections for a game mode.
 * Falls back to default sections if mode not found.
 *
 * @param gameMode The game mode ID
 * @returns The sections array for this mode
 */
export function getReportSections(
  gameMode: string,
  taskType?: string,
): readonly import('./types').ReportSectionId[] {
  if (taskType) {
    const taskSpec = AllSpecs[taskType as keyof typeof AllSpecs];
    if (taskSpec?.report?.sections) return taskSpec.report.sections;
  }
  const spec = AllSpecs[gameMode as keyof typeof AllSpecs];
  if (spec?.report?.sections) {
    return spec.report.sections;
  }
  return ['HERO', 'PERFORMANCE', 'DETAILS'];
}

/**
 * Get the scoring strategy for a game mode from its spec.
 * This is the SSOT for determining which metric to display in history cards.
 *
 * - 'sdt': Show d-prime (Signal Detection Theory)
 * - 'dualnback-classic': Show d-prime (Jaeggi protocol)
 * - 'brainworkshop': Show accuracy percentage
 * - 'accuracy': Show accuracy percentage
 *
 * Falls back to undefined if mode not found (caller handles fallback).
 *
 * @param gameMode The game mode ID (e.g., 'dual-catch', 'sim-brainworkshop')
 * @returns The scoring strategy from the spec, or undefined
 */
export function getModeScoringStrategy(
  gameMode: string | undefined,
): 'sdt' | 'dualnback-classic' | 'brainworkshop' | 'accuracy' | undefined {
  if (!gameMode) return undefined;
  const spec = AllSpecs[gameMode as keyof typeof AllSpecs];
  return spec?.scoring?.strategy;
}

// =============================================================================
// Mode Display Name Helpers (SSOT for mode names)
// =============================================================================

/**
 * Mapping of mode IDs to their i18n key suffixes.
 * This handles cases where the translation key doesn't match a simple camelCase conversion.
 *
 * SSOT: All mode → i18n key mappings are defined here.
 */
const MODE_I18N_KEY_MAP: Record<string, string> = {
  'dual-catch': 'dualCatch',
  'dual-place': 'dualPlace',
  'dual-memo': 'dualMemo',
  'dual-pick': 'dualPick',
  'dual-trace': 'dualTrace',
  'dual-time': 'dualTime',
  'dual-track': 'dualTrack',
  'corsi-block': 'corsiBlock',
  ospan: 'ospan',
  'running-span': 'runningSpan',
  pasat: 'pasat',
  swm: 'swm',
  'dualnback-classic': 'dualnbackClassic', // Special case: 'dualnback-classic' → 'dualnbackClassic'
  'sim-brainworkshop': 'brainWorkshop', // Special case: 'sim-brainworkshop' → 'brainWorkshop'
  custom: 'libre', // Special case: 'custom' → 'libre'
  stroop: 'stroop',
  flanker: 'flanker',
  'go-nogo': 'goNogo',
  'stop-signal': 'stopSignal',
  antisaccade: 'antisaccade',
  wcst: 'wcst',
  'trail-making': 'trailMaking',
  'task-switching': 'taskSwitching',
  'change-detection': 'changeDetection',
  ant: 'ant',
  'symmetry-span': 'symmetrySpan',
  pvt: 'pvt',
  'reading-span': 'readingSpan',
  'digit-span': 'digitSpan',
  simon: 'simon',
  'posner-cueing': 'posnerCueing',
  sternberg: 'sternberg',
  'ax-cpt': 'axCpt',
  'mental-rotation': 'mentalRotation',
  'visual-logic': 'visualLogic',
  'visual-search': 'visualSearch',
  'letter-number': 'letterNumber',
  // New placeholders
  sart: 'sart',
  cpt: 'cpt',
  pal: 'pal',
  'word-list': 'wordList',
  'pattern-recognition': 'patternRecognition',
  tower: 'tower',
  maze: 'maze',
  'word-flow': 'wordFlow',
  'word-chain': 'wordChain',
  promem: 'proMem',
  'time-promem': 'timeProMem',
  'dual-task': 'dualTask',
  'task-juggling': 'taskJuggling',
  ufov: 'ufov',
  gabor: 'gabor',
  'odd-one-out': 'oddOneOut',
  'number-series': 'numberSeries',
  analogies: 'analogies',
  'time-estimation': 'timeEstimation',
  rhythm: 'rhythm',
  binding: 'binding',
  'chain-recall': 'chainRecall',
  pipeline: 'pipeline',
  'memory-match': 'memoryMatch',
  reflex: 'reflex',
  'rhythm-tap': 'rhythmTap',
  'color-rush': 'colorRush',
  'spot-diff': 'spotDiff',
  'tetris-mind': 'tetrisMind',
  tangram: 'tangram',
  'lights-out': 'lightsOut',
  'speed-sort': 'speedSort',
  nonogram: 'nonogram',
  flood: 'flood',
  fifteen: 'fifteen',
  pegs: 'pegs',
  sudoku: 'sudoku',
  '2048': 'twentyFortyEight',
  guess: 'guess',
  samegame: 'sameGame',
  untangle: 'untangle',
  unruly: 'unruly',
  twiddle: 'twiddle',
  'map-coloring': 'mapColoring',
  towers: 'towers',
  bridges: 'bridges',
  net: 'net',
  inertia: 'inertia',
  signpost: 'signpost',
  keen: 'keen',
  dominosa: 'dominosa',
  singles: 'singles',
  lightup: 'lightUp',
  tents: 'tents',
  slant: 'slant',
  filling: 'filling',
  loopy: 'loopy',
  pearl: 'pearl',
  magnets: 'magnets',
  galaxies: 'galaxies',
  rectangles: 'rectangles',
  tracks: 'tracks',
  blackbox: 'blackBox',
  undead: 'undead',
  mosaic: 'mosaic',
  sixteen: 'sixteen',
  palisade: 'palisade',
  range: 'range',
  cube: 'cubePuzzle',
  netslide: 'netslide',
  flip: 'flip',
  sokoban: 'sokoban',
  mirror: 'mirror',
};

/**
 * Get the i18n translation key for a game mode.
 * This is the SSOT for mapping mode IDs to translation keys.
 *
 * Pattern: settings.gameMode.{keySuffix}
 * Examples:
 *   'dual-catch' → 'settings.gameMode.dualCatch'
 *   'dualnback-classic' → 'settings.gameMode.dualnbackClassic'
 *
 * @param gameMode The game mode ID (e.g., 'dual-catch', 'dualnback-classic')
 * @returns The i18n translation key
 */
export function getModeI18nKey(gameMode: string | undefined): string {
  if (!gameMode) return '';
  const keySuffix = MODE_I18N_KEY_MAP[gameMode];
  if (!keySuffix) return ''; // Unknown mode, return empty string
  return `settings.gameMode.${keySuffix}`;
}

/**
 * Get the display name for a game mode from its spec.
 * Falls back to the mode ID if spec not found.
 *
 * NOTE: For i18n-enabled UIs, prefer using getModeI18nKey() with your
 * translation function instead of this method which returns the raw
 * displayName from the spec (which may not be localized).
 *
 * @param gameMode The game mode ID (e.g., 'dual-catch', 'dual-place')
 * @returns The display name from the spec, or the mode ID as fallback
 */
export function getModeName(gameMode: string | undefined): string {
  if (!gameMode) return '';
  const spec = AllSpecs[gameMode as keyof typeof AllSpecs];
  return spec?.metadata.displayName ?? gameMode;
}

/**
 * Get all mode IDs from the specs registry.
 * Useful for dynamically building UI filters and labels.
 *
 * @returns Array of all mode IDs
 */
export function getAllModeIds(): string[] {
  return Object.keys(AllSpecs);
}

// =============================================================================
// Spec → BlockConfig Conversion (Phase 4: Simplification)
// =============================================================================

import type { ModeSpec } from './types';
import { VALIDATION_MIN_INTERVAL_SECONDS } from './thresholds';

/**
 * Convert a ModeSpec to a BlockConfig-compatible object.
 * This allows GameModeRegistry to derive defaultConfig from spec,
 * eliminating the need for separate getXxxBlockConfig() functions.
 *
 * @param spec The mode specification
 * @returns A BlockConfig-compatible object
 */
export function getBlockConfigFromSpec(spec: ModeSpec): {
  nLevel: number;
  generator: 'Sequence' | 'DualnbackClassic' | 'BrainWorkshop' | 'Aleatoire';
  activeModalities: string[];
  trialsCount: number;
  targetProbability: number;
  lureProbability: number;
  intervalSeconds: number;
  stimulusDurationSeconds: number;
} {
  // Brain Workshop: derive effective modalities from extensions
  // (multiStimulus adds position2-4, multiAudio adds audio2, and
  // multiStimulus+color/image replaces color/image with vis1-4 like BW 5.0).
  const baseActiveModalities = [...spec.defaults.activeModalities];
  const extensions = spec.extensions as { multiStimulus?: number; multiAudio?: number } | undefined;
  const activeModalities =
    spec.generation.generator === 'BrainWorkshop' && extensions
      ? (() => {
          let derived = [...baseActiveModalities];

          // BW Combination modes (visvis/visaudio/audiovis) always include audio and are
          // incompatible with multi-stimulus + multi-audio (BW does not generate those variants).
          const hasCombination = derived.some(
            (m) => m === 'visvis' || m === 'visaudio' || m === 'audiovis',
          );
          if (hasCombination) {
            for (const m of ['visvis', 'visaudio', 'audiovis'] as const) {
              if (!derived.includes(m)) derived.push(m);
            }
            if (!derived.includes('audio')) derived.push('audio');
          }

          // BW multi-stimulus is not offered when both color+image are active, or for combo/arithmetic modes.
          const forbidsMultiStimulus =
            hasCombination ||
            derived.includes('arithmetic') ||
            (derived.includes('color') && derived.includes('image'));

          const multiStimulus = forbidsMultiStimulus
            ? 1
            : Math.min(Math.max(extensions.multiStimulus ?? 1, 1), 4);
          if (multiStimulus > 1 && derived.includes('position')) {
            const positionIndex = derived.indexOf('position');
            for (let i = 2; i <= multiStimulus; i++) {
              const id = `position${i}`;
              if (!derived.includes(id)) {
                // BW: insert position2..n right after position1
                derived.splice(positionIndex + (i - 1), 0, id);
              }
            }
          }

          // BW multi-stimulus: if color or image is selected, replace it with vis1..n
          // and remove both color and image modalities.
          const wantsMultiVis =
            multiStimulus > 1 && (derived.includes('color') || derived.includes('image'));
          if (wantsMultiVis) {
            const firstPositionIndex = derived.indexOf('position');
            const insertAt = (() => {
              if (firstPositionIndex === -1) return derived.length;
              let idx = firstPositionIndex;
              while (idx < derived.length && String(derived[idx]).startsWith('position')) idx++;
              return idx;
            })();

            for (let i = 1; i <= multiStimulus; i++) {
              const id = `vis${i}`;
              if (!derived.includes(id)) {
                // BW: insert vis1..n right after position modalities
                derived.splice(insertAt + (i - 1), 0, id);
              }
            }

            // BW: remove 'color' and 'image' (replaced by vis1..n)
            derived = derived.filter((m) => m !== 'color' && m !== 'image');
          }

          const multiAudio =
            hasCombination || derived.includes('arithmetic')
              ? 1
              : Math.min(Math.max(extensions.multiAudio ?? 1, 1), 2);
          if (multiAudio > 1 && derived.includes('audio')) {
            const audioIndex = derived.indexOf('audio');
            if (!derived.includes('audio2')) {
              // Insert right after audio
              derived.splice(audioIndex + 1, 0, 'audio2');
            }
          }

          return derived;
        })()
      : baseActiveModalities;

  return {
    nLevel: spec.defaults.nLevel,
    generator: spec.generation.generator,
    activeModalities,
    trialsCount: spec.defaults.trialsCount,
    targetProbability: spec.generation.targetProbability,
    lureProbability: spec.generation.lureProbability ?? 0,
    intervalSeconds: Math.max(spec.timing.intervalMs / 1000, VALIDATION_MIN_INTERVAL_SECONDS),
    stimulusDurationSeconds: Math.min(
      spec.timing.stimulusDurationMs / 1000,
      spec.timing.intervalMs / 1000,
    ),
  };
}
