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
 * - dualnback-classic.spec.ts → Sim Jaeggi (clinical protocol)
 * - brainworkshop.spec.ts→ Sim BrainWorkshop (BW protocol)
 * - stroop.spec.ts       → Stroop (inhibitory control)
 * - custom.spec.ts       → Custom (full manual control)
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

// Stub types for deleted game modes (Place, Memo, Pick, Trace)
export type PlaceSpec = ModeSpec;
export type MemoSpec = ModeSpec;
export type PickSpec = ModeSpec;
export type PlaceExtensions = Record<string, unknown>;
export type MemoExtensions = Record<string, unknown>;
export type PickExtensions = Record<string, unknown>;
export type TraceExtensions = Record<string, unknown>;
export type ArithmeticInterferenceConfig = Record<string, unknown>;
export type TraceWritingMode = string;
export type TraceRhythmMode = string;

// Stub constants for deleted modes
export const TRAJECTORY_MAX_POINTS = 1000;
export const TRAJECTORY_MAX_DURATION_MS = 30000;
export const TRAJECTORY_WARNING_POINTS = 800;

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
  // Stroop
  STROOP_DEFAULT_TRIALS,
  STROOP_STIMULUS_TIMEOUT_MS,
  STROOP_ITI_MS,
  MODE_COLOR_STROOP_FLEX,
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
// Stroop Specs
// =============================================================================

export { StroopSpec, StroopFlexSpec, StroopSpecs } from './stroop.spec';

// =============================================================================
// OSPAN Specs (Operation Span)
// =============================================================================

export { OspanSpec, OspanSpecs, type OspanExtensions } from './ospan.spec';

// =============================================================================
// Tutorial Specs
// =============================================================================

export {
  ClassicTutorialSpec,
  TutorialSpecs,
  getTutorialSpec,
  TUTORIAL_HUB_ORDER,
  type TutorialSpecId,
} from './tutorial.spec';

// =============================================================================
// All Specs Registry
// =============================================================================

import { StroopSpecs } from './stroop.spec';
import { OspanSpecs } from './ospan.spec';
import { TutorialSpecs } from './tutorial.spec';

/**
 * All mode specs in a single registry.
 * Use this to iterate over all modes or look up by ID.
 */
export const AllSpecs = {
  ...TempoSpecs,
  ...StroopSpecs,
  ...OspanSpecs,
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
  DUAL_TRACK_DNB_HYBRID_MODE_ID,
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
 * - i18n keys used in UI (PascalCase: DualTempo, DualnbackClassic, Libre)
 * - Spec IDs used in logic (kebab-case: dual-catch, dualnback-classic, custom)
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
  DualnbackClassic: 'dualnback-classic',
  BrainWorkshop: 'sim-brainworkshop',
  Libre: 'custom',
  Stroop: 'stroop',
  StroopFlex: 'stroop-flex',
  Ospan: 'ospan',
};

/**
 * Get the stats spec for a mode or view.
 *
 * Handles special cases:
 * - 'all' → GlobalStatsSpec (cross-mode aggregate)
 * - 'Journey' → JourneyStatsSpec (training path aggregate)
 * - UI ModeType (DualTempo, etc.) → Maps to spec ID
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
 * @param gameMode The game mode ID (e.g., 'dual-catch', 'stroop')
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
 * @param gameMode The game mode ID (e.g., 'dual-catch', 'stroop')
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
  'dualnback-classic': 'dualnbackClassic',
  'sim-brainworkshop': 'brainWorkshop',
  custom: 'libre',
  stroop: 'stroop',
  'stroop-flex': 'stroopFlex',
  ospan: 'ospan',
  gridlock: 'gridlock',
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
 * @param gameMode The game mode ID (e.g., 'dual-catch', 'stroop')
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
