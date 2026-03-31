/**
 * Mode Specification Types
 *
 * This is the contract for all game mode specifications.
 * Every mode MUST define all required fields.
 *
 * The spec IS the source of truth. The code consumes it.
 */

import type { ReportUISpec } from './modality-ui';

// =============================================================================
// Scoring Strategy
// =============================================================================

/**
 * Scoring strategy determines how "passed" is calculated.
 */
export type ScoringStrategy = 'sdt' | 'dualnback-classic' | 'brainworkshop' | 'accuracy';

/**
 * UPS (Unified Performance Score) configuration.
 * Formula: UPS = 100 * (Accuracy^accuracyWeight) * (Confidence^confidenceWeight)
 */
export interface UPSSpec {
  /** Weight for accuracy component (0-1). Default: 0.6 */
  readonly accuracyWeight: number;
  /** Weight for confidence component (0-1). Default: 0.4 */
  readonly confidenceWeight: number;
}

/**
 * Tempo Confidence weights configuration.
 * Controls how sub-scores are weighted in the confidence calculation.
 * Sum should equal 1.0.
 *
 * @see domain/scoring/tempo-confidence.ts
 */
export interface TempoConfidenceSpec {
  /** Weight for timing discipline (penalizes responses during stimulus). Default: 0.35 */
  readonly timingDiscipline: number;
  /** Weight for RT stability (CV of reaction times). Default: 0.2 */
  readonly rtStability: number;
  /** Weight for press duration stability (CV of press durations). Default: 0.2 */
  readonly pressStability: number;
  /** Weight for error awareness (Post-Error Slowing). Default: 0.2 */
  readonly errorAwareness: number;
  /** Weight for focus score (micro-lapse detection). Default: 0.05 */
  readonly focusScore: number;

  /**
   * Post-Error Slowing (PES) lookahead window in trials.
   * If not provided, uses defaults from thresholds.ts.
   */
  readonly pesLookaheadTrials?: number;
}

/**
 * Jaeggi Confidence weights configuration (conditional system).
 *
 * Jaeggi uses two sets of weights based on session accuracy:
 * - If accuracy < accuracyThreshold (90%): apply timing penalty
 * - If accuracy >= accuracyThreshold: waive timing penalty (player is fast AND good)
 *
 * @see domain/scoring/jaeggi-confidence.ts
 */
export interface DualnbackClassicConfidenceSpec {
  /** Accuracy threshold (0-1) above which timing penalty is waived. Default: 0.9 */
  readonly accuracyThreshold: number;

  /**
   * Post-Error Slowing (PES) lookahead window in trials.
   * If not provided, uses defaults from thresholds.ts.
   */
  readonly pesLookaheadTrials?: number;

  /**
   * Weights when accuracy < threshold (timing penalty applied).
   * Sum should equal 1.0.
   */
  readonly withTiming: {
    readonly rtStability: number;
    readonly errorAwareness: number;
    readonly focusScore: number;
    readonly timingDiscipline: number;
    readonly pressStability: number;
  };

  /**
   * Weights when accuracy >= threshold (timing penalty waived).
   * Sum should equal 1.0.
   */
  readonly withoutTiming: {
    readonly rtStability: number;
    readonly errorAwareness: number;
    readonly focusScore: number;
    readonly pressStability: number;
  };
}

/**
 * Scoring configuration for a mode.
 */
export interface ScoringSpec {
  /** Which strategy to use */
  readonly strategy: ScoringStrategy;
  /** Threshold for passing (interpretation depends on strategy) */
  readonly passThreshold: number;
  /** Threshold for regression recommendation (optional) */
  readonly downThreshold?: number;
  /** Threshold for flow state detection (0-100). Default: 80 */
  readonly flowThreshold?: number;
  /** UPS configuration. If not provided, uses defaults from thresholds.ts */
  readonly ups?: UPSSpec;
  /**
   * Confidence weights configuration.
   * - TempoConfidenceSpec: Standard weights (for Tempo, BrainWorkshop)
   * - DualnbackClassicConfidenceSpec: Conditional weights based on accuracy (for Jaeggi)
   * If not provided, uses defaults from thresholds.ts
   */
  readonly confidence?: TempoConfidenceSpec | DualnbackClassicConfidenceSpec;
}

// =============================================================================
// Timing Configuration
// =============================================================================

/**
 * Timing parameters for a mode.
 * All values in milliseconds for consistency.
 */
export interface TimingSpec {
  /** Duration of stimulus display (ms) */
  readonly stimulusDurationMs: number;
  /** Inter-stimulus interval (ms) */
  readonly intervalMs: number;
  /**
   * Preparation delay before first trial (ms).
   * Duration of "3, 2, 1, 0" countdown before session starts.
   * Default: 4000ms (from thresholds.TIMING_SESSION_PREP_MS).
   */
  readonly prepDelayMs?: number;
  /** Response window duration (ms) - for timed modes */
  readonly responseWindowMs?: number;
  /** Feedback display duration (ms) */
  readonly feedbackDurationMs?: number;
  /** Warmup stimulus duration (ms) - often longer */
  readonly warmupStimulusDurationMs?: number;
  /**
   * Visual latency compensation (ms).
   *
   * How early to trigger the visual relative to the audio sync time, to compensate
   * for render/layout latency. This is not a "fade duration".
   */
  readonly visualOffsetMs?: number;
  /**
   * Audio preset for this mode.
   * Only 'default' (varied_aac) is supported.
   */
  readonly audioPreset?: 'default';
  /**
   * Minimum valid reaction time (ms).
   * Responses faster than this are physiologically impossible and ignored.
   * Default: 100ms.
   */
  readonly minValidRtMs?: number;
}

// =============================================================================
// Generation Configuration
// =============================================================================

/**
 * Trial generation configuration.
 */
export interface GenerationSpec {
  /** Generator type */
  readonly generator: 'Sequence' | 'DualnbackClassic' | 'BrainWorkshop' | 'Aleatoire';
  /** Target probability (0-1) */
  readonly targetProbability: number;
  /** Lure probability (0-1) */
  readonly lureProbability: number;
  /** Sequence mode for adaptive generators */
  readonly sequenceMode?: 'tempo' | 'memo' | 'flow';
}

// =============================================================================
// Session Defaults
// =============================================================================

/**
 * Default session configuration.
 */
export interface SessionDefaultsSpec {
  /** Default N-Level */
  readonly nLevel: number;
  /** Default number of trials */
  readonly trialsCount: number;
  /** Active modalities */
  readonly activeModalities: readonly string[];
}

// =============================================================================
// Mode Metadata
// =============================================================================

/**
 * Mode metadata for display and categorization.
 */
export interface ModeMetadataSpec {
  /** Unique identifier */
  readonly id: string;
  /** Display name */
  readonly displayName: string;
  /** Description */
  readonly description: string;
  /** Tags for categorization */
  readonly tags: readonly string[];
  /** Difficulty level (1-5) */
  readonly difficultyLevel: 1 | 2 | 3 | 4 | 5;
  /** Version for tracking changes */
  readonly version: string;
}

// =============================================================================
// Adaptivity Configuration
// =============================================================================

/**
 * Adaptivity configuration for a mode.
 */
export interface AdaptivitySpec {
  /** Algorithm name */
  readonly algorithm: 'none' | 'jaeggi-v1' | 'brainworkshop-v1' | 'adaptive';
  /** Where N-level comes from */
  readonly nLevelSource: 'user' | 'profile';
  /** Settings the user can configure */
  readonly configurableSettings: readonly string[];
}

// =============================================================================
// Session Type
// =============================================================================

/**
 * Which session class handles this mode.
 */
export type SessionType =
  | 'GameSession'
  | 'PlaceSession'
  | 'MemoSession'
  | 'DualPickSession'
  | 'TraceSession';

// =============================================================================
// Complete Mode Spec
// =============================================================================

/**
 * Complete specification for a game mode.
 *
 * This is the SINGLE SOURCE OF TRUTH for mode behavior.
 * All code should consume this spec, not define behavior inline.
 */
export interface ModeSpec {
  /** Metadata (id, name, description, etc.) */
  readonly metadata: ModeMetadataSpec;

  /** Which session class handles this mode */
  readonly sessionType: SessionType;

  /** Scoring configuration */
  readonly scoring: ScoringSpec;

  /** Timing parameters */
  readonly timing: TimingSpec;

  /** Trial generation configuration */
  readonly generation: GenerationSpec;

  /** Default session values */
  readonly defaults: SessionDefaultsSpec;

  /** Adaptivity configuration */
  readonly adaptivity: AdaptivitySpec;

  /**
   * Report configuration - the "communication contract".
   * Defines what sections to show and in what order.
   */
  readonly report: ModeReportSpec;

  /**
   * Stats page configuration.
   * Controls which sections appear in Simple/Advanced tabs.
   * If not provided, falls back to mode-appropriate defaults.
   */
  readonly stats?: ModeStatsSpec;

  /**
   * Mode-specific extensions.
   * Use this for parameters unique to a mode family.
   */
  readonly extensions?: Readonly<Record<string, unknown>>;
}

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Check if a spec has a specific extension.
 */
export function hasExtension<T>(
  spec: ModeSpec,
  key: string,
): spec is ModeSpec & { extensions: { [K in typeof key]: T } } {
  return spec.extensions !== undefined && key in spec.extensions;
}

// =============================================================================
// Report Display Configuration (Spec-Driven)
// =============================================================================

/**
 * Tailwind color classes for a mode.
 * Centralized here instead of hardcoded in UI.
 */
export interface ModeColorSpec {
  /** Background class (e.g., 'bg-violet-50') */
  readonly bg: string;
  /** Border class (e.g., 'border-violet-200') */
  readonly border: string;
  /** Text class (e.g., 'text-violet-700') */
  readonly text: string;
  /** Accent color name for charts (e.g., 'violet-500') */
  readonly accent: string;
}

/**
 * Insight metric identifiers for INSIGHTS section.
 * Each mode can declare which metrics to show.
 */
export type InsightMetricId =
  | 'confidence' // Confidence score (all modes)
  | 'directness' // Directness ratio (flow/dual-pick)
  | 'placementTime' // Placement time (flow/dual-pick)
  | 'wrongSlotDwell' // Time on wrong slots (flow/dual-pick)
  | 'fluency' // Fluency score (memo)
  | 'corrections' // Correction count (memo)
  | 'slotAccuracy' // Per-slot accuracy (memo)
  | 'recentAccuracies' // Recent accuracies (memo)
  | 'responseTime' // Response time (trace)
  | 'writingAccuracy'; // Writing accuracy (trace)

/**
 * Report display specification.
 * Controls how the mode score and speed stats are displayed.
 *
 * Uses i18n keys instead of hardcoded strings.
 */
export interface ReportDisplaySpec {
  /** i18n key for mode score label (e.g., 'report.modeScore.dprime') */
  readonly modeScoreKey: string;
  /** i18n key for mode score tooltip */
  readonly modeScoreTooltipKey: string;
  /** i18n key for speed stat label (e.g., 'report.speed.reactionTime') */
  readonly speedStatKey: string;
  /** Metrics to display in INSIGHTS section */
  readonly insightMetrics?: readonly InsightMetricId[];
  /** Tailwind colors for this mode */
  readonly colors: ModeColorSpec;
}

// =============================================================================
// Report Section Configuration
// =============================================================================

/**
 * Semantic identifiers for report sections.
 *
 * These are NOT UI components - they are semantic intents.
 * The Spec says "I want to communicate about these key points, in this order".
 * The UI is responsible for how (design, colors, animations).
 *
 * A mode can choose to omit a section even if the data is present,
 * enabling "minimalist beta modes" or focused experimental variants.
 */
export type ReportSectionId =
  | 'HERO' // Primary score display (UPS + Mode Score)
  | 'RECENT_TREND' // Historical trend chart (last 5 sessions)
  | 'PERFORMANCE' // Per-modality grid (Hits/Misses/FA/CR)
  | 'CONFIDENCE_BREAKDOWN' // Confidence analysis breakdown (Tempo modes only)
  | 'ERROR_PROFILE' // Error analysis (miss vs FA distribution)
  | 'INSIGHTS' // Mode-specific metrics (Flow confidence, Memo trend, etc.)
  | 'SPEED' // Reaction time / Rhythm metrics
  | 'NEXT_STEP' // Progression recommendation
  | 'REWARD_INDICATOR' // XP progress towards next Premium reward
  | 'DETAILS'; // Collapsible turn-by-turn history

/**
 * Report configuration for a mode.
 *
 * This is the "communication contract" - what the mode wants to tell the user.
 * The order matters and drives the UI layout.
 */
export interface ModeReportSpec {
  /**
   * Ordered list of sections to display.
   * Sections not in this list will NOT be shown, even if data exists.
   * This enables intentional minimalism for experimental modes.
   */
  readonly sections: readonly ReportSectionId[];

  /**
   * Display configuration for the report.
   * Controls labels, colors, and metrics display.
   * Uses i18n keys for localization.
   */
  readonly display: ReportDisplaySpec;

  /**
   * UI configuration for the report.
   * Controls layout and styling of modality display.
   */
  readonly ui?: ReportUISpec;
}

// =============================================================================
// Stats Section Configuration (Aggregate Stats Page)
// =============================================================================

/**
 * Section IDs for SimpleStatsTab.
 * Each ID maps to a specific card or chart in the simplified stats view.
 *
 * The Spec declares WHAT to show, the UI decides HOW.
 * Data guards remain in components (null/empty → return null).
 */
export type SimpleStatsSectionId =
  | 'ACTIVITY_KPIS' // Sessions count, Time, Active Days, Avg Duration
  | 'SESSIONS_PER_DAY' // Bar chart of sessions per day
  | 'PERFORMANCE_KPIS' // N-Level, Accuracy, UPS (mode-aware)
  | 'MODE_SCORE' // Mode-specific score highlight
  | 'FLOW_CONFIDENCE' // Flow-only: confidence, directness
  | 'RECALL_CONFIDENCE' // Recall-only: confidence, fluency, corrections
  | 'EVOLUTION_ACCURACY' // Accuracy trend line chart
  | 'EVOLUTION_ERROR_RATE' // Error rate trend (Jaeggi: lower is better)
  | 'EVOLUTION_N_LEVEL' // N-Level trend line chart
  | 'EVOLUTION_UPS' // UPS trend (for global view)
  | 'MODE_BREAKDOWN' // Global view: visual bar breakdown by mode
  | 'MODALITY_TABLE' // Per-modality accuracy table
  | 'ERROR_PROFILE'; // Error breakdown (omissions/FA)

/**
 * Section IDs for AdvancedStatsTab.
 * Each ID maps to a specific card or table in the detailed stats view.
 */
export type AdvancedStatsSectionId =
  // Temps (Time)
  | 'TIMING_STATS' // Response time, ISI, stimulus duration
  | 'TIMING_BY_MODALITY' // Response time breakdown by modality (position vs audio)
  | 'TIMING_VARIABILITY' // Response time variability (CV) by modality - concentration indicator
  | 'ERROR_AWARENESS' // Post-Error Slowing (PES) - metacognitive awareness indicator
  // Performance
  | 'UPS_SUMMARY' // UPS last/avg/best
  | 'MODE_SCORE' // Mode-specific score
  | 'FLOW_CONFIDENCE' // Flow-only extended metrics
  | 'RECALL_CONFIDENCE' // Recall-only extended metrics
  | 'DISTRIBUTION' // Accuracy histogram + percentiles
  | 'SDT_MODALITY_TABLE' // Tempo-only: Hits/Miss/FA/CR/d' table
  | 'MODE_BREAKDOWN_TABLE' // Global view: full table with all columns
  // Évolution
  | 'EVOLUTION_UPS'; // UPS trend over time

/**
 * Stats configuration for a mode.
 * Controls which sections appear in Simple and Advanced stats tabs.
 *
 * Follows the same pattern as ModeReportSpec for session reports.
 */
export interface ModeStatsSpec {
  /**
   * Sections for SimpleStatsTab, in display order.
   * Sections not listed will not appear.
   */
  readonly simple: {
    readonly sections: readonly SimpleStatsSectionId[];
  };

  /**
   * Sections for AdvancedStatsTab, in display order.
   */
  readonly advanced: {
    readonly sections: readonly AdvancedStatsSectionId[];
  };
}

// =============================================================================
// Tutorial Specification
// =============================================================================

/**
 * Intent of a tutorial step - drives GSAP behaviors.
 * - DEMO: Passive observation, no user action required
 * - COMPARE: Pause to highlight slots for comparison
 * - ACTION: User must respond (press button)
 */
export type TutorialIntent = 'DEMO' | 'COMPARE' | 'ACTION';

/**
 * Exit condition for a tutorial step.
 * - AUTO: Proceed automatically after animation/delay
 * - RESPONSE: Wait for user response before proceeding
 */
export type TutorialExitCondition = 'AUTO' | 'RESPONSE';

/**
 * Position classification for Dual Pick mode.
 */
export type PositionClassification = 'HAUT' | 'MILIEU' | 'BAS';

/**
 * Sound classification for Dual Pick mode.
 */
export type SoundClassification = 'VOYELLE' | 'CONSONNE';

/**
 * Expected classification for a tutorial step (Dual Pick mode).
 */
export interface ExpectedClassification {
  readonly position?: PositionClassification;
  readonly sound?: SoundClassification;
}

/**
 * Expected match response for classic N-Back tutorial.
 * Explicitly declares what the user should respond.
 */
export interface ExpectedMatch {
  /** User should press Position match */
  readonly position?: boolean;
  /** User should press Audio match */
  readonly audio?: boolean;
}

/**
 * Timeline slot identifiers for highlighting.
 */
export type TimelineSlotId = 'n' | 'n-1' | 'n-2';

/**
 * Specification for a single tutorial step.
 *
 * This is the contract for tutorial step behavior.
 * The UI interprets this spec to drive animations and annotations.
 */
export interface TutorialStepSpec {
  /** Unique step identifier */
  readonly id: string;
  /** Trial data for this step */
  readonly trial: {
    readonly position: number;
    readonly sound: string;
  };
  /** Step intent - drives GSAP animation behavior */
  readonly intent: TutorialIntent;
  /** i18n key for the annotation text */
  readonly annotationKey: string;
  /** Condition to proceed to next step */
  readonly exitCondition: TutorialExitCondition;
  /** Animation time scale (1.0 = normal, 0.5 = half speed) */
  readonly timeScale?: number;
  /** Slots to highlight during COMPARE intent */
  readonly highlightSlots?: readonly TimelineSlotId[];
  /** Expected classification for Dual Pick tutorials */
  readonly expectedClassification?: ExpectedClassification;
  /** Expected match response for classic N-Back tutorials */
  readonly expectedMatch?: ExpectedMatch;
  /** Expected swipe response for Trace tutorials */
  readonly expectedSwipe?: ExpectedSwipe;
  /** Expected placement for Place tutorials (single) */
  readonly expectedPlacement?: ExpectedPlacement;
  /** Expected placements for Place tutorials (batch) */
  readonly expectedPlacements?: readonly ExpectedPlacement[];
  /** Expected recall for Memo tutorials (single) */
  readonly expectedRecall?: ExpectedRecall;
  /** Expected recalls for Memo tutorials (batch) */
  readonly expectedRecalls?: readonly ExpectedRecall[];
}

/**
 * Control layout for tutorial UI.
 * - classic: Standard Position/Audio match buttons
 * - dual-pick: Classification buttons (HAUT/MILIEU/BAS + VOYELLE/CONSONNE)
 * - trace: Swipe gestures for active recall
 * - place: Drag-and-drop cards to timeline slots
 * - memo: Click-to-pick memory recall interface
 */
export type TutorialControlLayout = 'classic' | 'dual-pick' | 'trace' | 'place' | 'memo';

/**
 * Expected swipe response for Trace tutorial.
 * Describes what the user should do to respond correctly.
 */
export interface ExpectedSwipe {
  /** Target position to swipe towards (N-back position) */
  readonly targetPosition: number;
  /** Whether this is an audio match (double-tap required) */
  readonly audioMatch?: boolean;
}

/**
 * Timeline slot for Place/Memo tutorials.
 */
export type TutorialSlot = 'N' | 'N-1' | 'N-2';

/**
 * Expected placement for Place tutorial (drag-and-drop).
 * Describes what card should be placed where.
 */
export interface ExpectedPlacement {
  /** Modalité concernée */
  readonly modality: 'position' | 'audio';
  /** Slot cible dans la timeline */
  readonly slot: TutorialSlot;
  /** Valeur attendue (0-8 pour position, lettre pour audio) */
  readonly value: number | string;
}

/**
 * Expected recall for Memo tutorial (click-to-pick).
 * Describes what value should be selected for which slot.
 */
export interface ExpectedRecall {
  /** Slot cible dans la fenêtre de rappel */
  readonly slot: TutorialSlot;
  /** Modalité concernée */
  readonly modality: 'position' | 'audio';
  /** Valeur attendue (0-8 pour position, lettre pour audio) */
  readonly value: number | string;
}

/**
 * Complete specification for a tutorial.
 *
 * This is the SINGLE SOURCE OF TRUTH for tutorial behavior.
 * The UI consumes this spec instead of hardcoding trial sequences.
 */
export interface TutorialSpec {
  /** Unique tutorial identifier */
  readonly id: string;
  /** N-Level for this tutorial */
  readonly nLevel: number;
  /** Ordered sequence of tutorial steps */
  readonly steps: readonly TutorialStepSpec[];

  // ========== Hub Metadata ==========

  /** Associated game mode ID (null for 'basics' tutorial) */
  readonly associatedModeId: string | null;
  /** i18n key for hub card title */
  readonly titleKey: string;
  /** i18n key for hub card description */
  readonly descriptionKey: string;
  /** Phosphor icon name for hub card */
  readonly iconName: string;

  // ========== UI Configuration ==========

  /** Control layout for this tutorial (default: 'classic') */
  readonly controlLayout?: TutorialControlLayout;

  // ========== Timing Configuration ==========

  /** Timing configuration (optional, has sensible defaults) */
  readonly timing?: TutorialTimingConfig;

  // ========== Spotlight/Onboarding ==========

  /** Spotlight configuration for UI walkthrough (optional) */
  readonly spotlight?: TutorialSpotlightConfig;

  // ========== Assessment (Optional) ==========

  /**
   * Optional assessment segment at the end of a tutorial.
   * Used to run the last part "like a real game" and compute a score.
   */
  readonly assessment?: TutorialAssessmentConfig;
}

/**
 * Assessment configuration for a tutorial.
 * The UI and machine can use this to remove coaching and compute a pass/fail.
 */
export interface TutorialAssessmentConfig {
  /** Inclusive start step index for assessment segment (0-based). */
  readonly startStepIndex: number;
  /** Number of initial "warmup" steps inside the assessment segment that are NOT scored. Default: 0 */
  readonly warmupSteps?: number;
  /** Minimum accuracy required to pass (0..1). Default: 0.7 */
  readonly minAccuracy?: number;
  /** Response window for each assessment step (ms). Default: 1200 */
  readonly responseWindowMs?: number;
}

/**
 * Timing configuration for tutorial animations.
 */
export interface TutorialTimingConfig {
  /** Delay after correct response before advancing (ms). Default: 600 */
  readonly feedbackDelayMs?: number;
  /** Delay before auto-advancing to next step (ms). Default: 200 */
  readonly autoAdvanceDelayMs?: number;
  /** Duration of stimulus display (ms). Default: 1200 */
  readonly stimulusDurationMs?: number;
}

// =============================================================================
// Spotlight Configuration
// =============================================================================

/**
 * Target identifiers for spotlight steps.
 * These map to ref elements in the tutorial UI.
 */
export type SpotlightTarget =
  | 'hud'
  | 'timeline'
  | 'grid'
  | 'controls'
  | 'letter'
  | 'annotation'
  | 'cardPool' // Place tutorial: draggable card pool
  | 'recallZone' // Memo tutorial: recall input zone
  | 'validateButton'; // Memo tutorial: validate button

/**
 * Callout position relative to spotlight target.
 */
export type SpotlightPosition = 'top' | 'bottom' | 'left' | 'right' | 'center';

/**
 * Specification for a single spotlight step.
 */
export interface SpotlightStepSpec {
  /** Unique step identifier */
  readonly id: string;
  /** Target element to highlight */
  readonly target: SpotlightTarget;
  /** i18n key for callout content */
  readonly contentKey: string;
  /** Callout position relative to target. Default: 'bottom' */
  readonly position?: SpotlightPosition;
}

/**
 * Spotlight/onboarding configuration for a tutorial.
 * Defines the UI walkthrough before the tutorial begins.
 */
export interface TutorialSpotlightConfig {
  /** Ordered sequence of spotlight steps */
  readonly steps: readonly SpotlightStepSpec[];
  /** i18n key for intro message (before spotlight begins) */
  readonly introMessageKey?: string;
  /** i18n key for intro button text. Default: 'Continuer' */
  readonly introButtonKey?: string;
  /** i18n key for outro message (after spotlight ends) */
  readonly outroMessageKey?: string;
  /** i18n key for outro button text. Default: 'Commencer' */
  readonly outroButtonKey?: string;
}

/**
 * Tutorial ID type for registry lookup.
 */
export type TutorialId = string;
