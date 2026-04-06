/**
 * Session Report Types - Unified model for end-of-game reports
 *
 * Provides a standardized structure for displaying session results
 * across all game modes (Tempo, Flow, Memo, Jaeggi, BrainWorkshop, Libre).
 *
 * Key principles:
 * - Two scores: Mode Score (native) + Performance % (unified cross-mode)
 * - Unified counts (hits/misses/FA/CR) with proxies for Flow/Memo
 * - Tour-by-tour detail accessible via TurnSummary
 */

import type { ModalityId, SDTCountsNullable } from './core';
import type { SessionPlayContext } from '../engine/events';
import type {
  HybridJourneyStageProgress,
  JourneyDecision,
  JourneyModeType,
  JourneyProtocol,
  JourneySessionRole,
} from './journey';
import type { PerformanceTier, UnifiedPerformanceScore } from './ups';
import type { XPBreakdown } from './xp';
import type { FocusStats } from '../ports/stats-port';
import {
  UPS_TIER_ELITE,
  UPS_TIER_ADVANCED,
  UPS_TIER_INTERMEDIATE,
  UPS_TIER_NOVICE,
} from '../specs/thresholds';

// =============================================================================
// Game Mode Types
// =============================================================================

/**
 * Supported game modes for session reports.
 */
export type ReportGameMode =
  | 'dualnback-classic'
  | 'dual-place'
  | 'dual-memo'
  | 'dual-trace'
  | 'dual-time'
  | 'dual-track'
  | 'dual-track-dnb-hybrid'
  | 'dualnback-classic'
  | 'sim-brainworkshop'
  | 'dual-pick'
  | 'corsi-block'
  | 'ospan'
  | 'running-span'
  | 'pasat'
  | 'swm'
  | 'cognitive-task'
  | 'custom';

/**
 * Session end reason.
 */
export type SessionEndReason = 'completed' | 'abandoned' | 'error';

// =============================================================================
// Mode Score Types
// =============================================================================

/**
 * Native metric for each mode.
 * The "truth" of the mode's scoring system.
 *
 * Uses i18n keys for labels/tooltips instead of hardcoded strings.
 * UI resolves keys via t() function.
 */
export interface ModeScore {
  /** i18n key for display label (e.g., 'report.modeScore.dprime') */
  readonly labelKey: string;
  /** Numeric value */
  readonly value: number;
  /** Unit for display (e.g., "%", "d′") */
  readonly unit: '%' | "d'" | 'score';
  /** i18n key for tooltip explaining how the score is calculated */
  readonly tooltipKey?: string;
}

// =============================================================================
// Unified Modality Stats
// =============================================================================

/**
 * Unified counts per modality.
 *
 * For Tempo-like modes (Dual Tempo, Jaeggi, BrainWorkshop, Custom):
 * - All SDT counts are applicable (hits, misses, falseAlarms, correctRejections)
 *
 * For Flow/Memo modes:
 * - Flow: correctDrops → hits, errorCount → misses, FA=null, CR=null
 * - Memo: correctPicks → hits, wrongPicks → misses, FA=null, CR=null
 *
 * Rule: If a field is not applicable, use `null` (not 0). UI should hide null fields.
 */
export interface UnifiedModalityStats extends SDTCountsNullable {
  /** Average reaction time in ms (null if not applicable) */
  readonly avgRT: number | null;
  /** d-prime if computable (null for Flow/Memo) */
  readonly dPrime: number | null;
}

/**
 * Unified totals across all modalities.
 * FA/CR are null for Flow/Memo modes (not applicable).
 * Alias for SDTCountsNullable for semantic clarity.
 */
export type UnifiedTotals = SDTCountsNullable;

// =============================================================================
// Error Profile
// =============================================================================

/**
 * Error breakdown for visual display.
 *
 * For Tempo-like modes: errorRate = (misses + FA) / total_actions
 * For Flow/Memo: errorRate = misses / total_actions (FA not applicable)
 */
export interface ErrorProfile {
  /** Error rate: (misses + FA) / total for Tempo, misses / total for Flow/Memo */
  readonly errorRate: number;
  /** misses / total_errors. For Flow/Memo where FA=null, this equals 1.0 */
  readonly missShare: number;
  /** FA / total_errors. null = not applicable (Flow/Memo modes) */
  readonly faShare: number | null;
}

// =============================================================================
// Speed/Rhythm Stats
// =============================================================================

/**
 * Speed/rhythm metrics (mode-dependent).
 *
 * Uses i18n keys for labels instead of hardcoded strings.
 * UI resolves keys via t() function.
 */
export interface SpeedStats {
  /** i18n key for the primary speed metric label */
  readonly labelKey: string;
  /** Primary value in ms */
  readonly valueMs: number;
  /** Secondary metrics (optional) */
  readonly secondary?: {
    readonly labelKey: string;
    readonly valueMs: number;
  }[];
  /** Distribution if available */
  readonly distribution?: {
    readonly min: number;
    readonly median: number;
    readonly max: number;
  };
}

// Re-export FocusStats for consumers who import from session-report
export type { FocusStats } from '../ports/stats-port';

// =============================================================================
// Next Step Recommendation
// =============================================================================

/**
 * Recommendation for next session.
 */
export interface NextStepRecommendation {
  /** Recommended N-level for next session */
  readonly nextLevel: number;
  /** Direction: up, same, down */
  readonly direction: 'up' | 'same' | 'down';
  /** Brief explanation */
  readonly reason?: string;
}

// =============================================================================
// Journey Context (if applicable)
// =============================================================================

/**
 * Journey-specific context when session is part of a journey stage.
 */
export interface JourneyContext {
  /**
   * Stable journey identifier.
   *
   * Optional for backward compatibility with older stored reports/events.
   * New projections should always provide it.
   */
  readonly journeyId?: string;
  readonly stageId: number;
  readonly stageMode: JourneyModeType;
  readonly nLevel: number;
  /** Display name of the journey (e.g., "Brain Workshop", "Dual N-Back Classique") */
  readonly journeyName: string;
  /** Game mode for simulator journeys (e.g., "sim-brainworkshop"), undefined for classic journeys */
  readonly journeyGameMode?: string;
  /** UPS threshold required to validate this stage (0-100) */
  readonly upsThreshold: number;
  /** Whether this session validates the stage (UPS >= threshold) */
  readonly isValidating: boolean;
  /** Current count of validating sessions for this stage */
  readonly validatingSessions: number;
  /** Total sessions required to complete stage */
  readonly sessionsRequired: number;
  /**
   * Optional progressive fill (0-100).
   * Used by continuous progression journeys (e.g. Dual Catch).
   */
  readonly progressPct?: number;
  /** Best score tracked for the current stage when available. */
  readonly bestScore?: number | null;
  /** Whether the stage was just completed */
  readonly stageCompleted: boolean;
  /** Next stage unlocked (if stage completed) */
  readonly nextStageUnlocked: number | null;
  /**
   * Stage à jouer ensuite selon la décision parcours.
   * - Peut être inférieur au stage courant en cas de régression.
   * - Null si le parcours est terminé.
   */
  readonly nextPlayableStage?: number | null;
  /** Concrete game mode to launch for the next journey session when the protocol alternates. */
  readonly nextSessionGameMode?: string;
  /**
   * Consecutive strikes at current level (0-2).
   * Only for BrainWorkshop binary progression.
   * 3 strikes = DOWN (regression to previous level).
   */
  readonly consecutiveStrikes?: number;

  /**
   * Suggested new startLevel when the player regressed below the configured startLevel.
   * When present and < journey startLevel, the UI can expand the journey and restart at the correct N.
   */
  readonly suggestedStartLevel?: number;
  /** Optional journey protocol descriptor for report guidance. */
  readonly journeyProtocol?: JourneyProtocol;
  /** Role of the current session inside the journey protocol. */
  readonly sessionRole?: JourneySessionRole;
  /** Authoritative journey decision for the current session/report. */
  readonly journeyDecision?: JourneyDecision;
  /** Compact journey label for small report cards. */
  readonly journeyNameShort?: string;
  /** Whether this guidance comes from the current journey state rather than the historical session. */
  readonly guidanceSource?: 'historical-session' | 'current-state';
  /** Exact hybrid loop state for alternating journeys. */
  readonly hybridProgress?: HybridJourneyStageProgress;
}

// =============================================================================
// Tour-by-Tour Types
// =============================================================================

/**
 * Turn kind - maps to how the turn is displayed.
 */
export type TurnKind =
  | 'tempo-trial'
  | 'recall-window'
  | 'flow-turn'
  | 'trace-trial'
  | 'track-trial'
  | 'corsi-trial'
  | 'cognitive-task-trial';

/**
 * Turn verdict - outcome of the turn.
 */
export type TurnVerdict = 'correct' | 'incorrect' | 'partial' | 'no-action' | 'skipped';

/**
 * Error tags for filtering.
 */
export type TurnErrorTag = 'miss' | 'false-alarm' | 'order-error' | 'wrong-pick' | 'slow';

/**
 * Summary of a single turn for the tour-by-tour list.
 */
export interface TurnSummary {
  /** 1-based index for display */
  readonly index: number;
  /** Type of turn */
  readonly kind: TurnKind;
  /** Start time (epoch ms, optional) */
  readonly startedAt?: number;
  /** End time (epoch ms, optional) */
  readonly endedAt?: number;
  /** Duration in ms (computed) */
  readonly durationMs?: number;

  // --- Display fields ---
  /** Compact headline (e.g., "#12 [POS+AUDIO]") */
  readonly headline: string;
  /** Subline (e.g., "RT: 410ms") */
  readonly subline?: string;

  // --- Verdict ---
  readonly verdict: TurnVerdict;
  /** Error tags for filtering */
  readonly errorTags?: readonly TurnErrorTag[];

  // --- Detail payload (shown in expanded view) ---
  readonly detail: TurnDetail;
}

/**
 * Detailed turn info for expanded view.
 */
export type TurnDetail =
  | TempoTrialDetail
  | MemoWindowDetail
  | PlaceTurnDetail
  | TrackTurnDetail
  | CorsiTurnDetail
  | CognitiveTaskTrialDetail
  | OspanSetDetail;

/**
 * Tempo-like trial detail.
 */
export interface TempoTrialDetail {
  readonly kind: 'tempo-trial';
  /** Whether this trial is a warmup/buffer trial and should not be scored for N-back. */
  readonly isBuffer?: boolean;
  /** Stimulus values (null if not available) */
  readonly stimulus?: {
    readonly position?: number | null;
    readonly audio?: string | null;
    readonly color?: string | null;
  };
  /** Expected targets */
  readonly targets: readonly ModalityId[];
  /** Response per modality */
  readonly responses: Record<
    ModalityId,
    {
      readonly pressed: boolean;
      readonly reactionTimeMs?: number;
      readonly phase?: 'during_stimulus' | 'after_stimulus';
      readonly result: 'hit' | 'miss' | 'false-alarm' | 'correct-rejection';
    }
  >;
}

/**
 * Recall window detail.
 */
export interface MemoWindowDetail {
  readonly kind: 'recall-window';
  /** Window depth */
  readonly windowDepth: number;
  /** Required cells per modality */
  readonly required: Record<ModalityId, { slotIndex: number; expected: number | string }[]>;
  /** Actual picks per modality */
  readonly picks: Record<
    ModalityId,
    { slotIndex: number; picked: number | string; correct: boolean }[]
  >;
  /** Correct count / total count */
  readonly correctCount: number;
  readonly totalCount: number;
  /** Recall duration in ms */
  readonly recallDurationMs?: number;
}

/**
 * Flow turn detail.
 */
export interface PlaceTurnDetail {
  readonly kind: 'flow-turn';
  /** Proposals to place */
  readonly proposals: {
    readonly id: string;
    readonly type: 'position' | 'audio';
    readonly value: number | string;
  }[];
  /** Drops attempted */
  readonly drops: {
    readonly proposalId: string;
    readonly targetSlot: number;
    readonly correct: boolean;
    readonly placementTimeMs?: number;
  }[];
  /** Total turn duration in ms */
  readonly turnDurationMs?: number;
  /** Confidence score if computed */
  readonly confidenceScore?: number;
}

/**
 * Dual Track / MOT turn detail.
 */
export interface TrackTurnDetail {
  readonly kind: 'track-trial';
  readonly totalObjects: number;
  readonly targetCount: number;
  readonly targetIndices: readonly number[];
  readonly selectedIndices: readonly number[];
  readonly correctCount: number;
  readonly misses: number;
  readonly falseAlarms: number;
  readonly responseTimeMs?: number;
  readonly crowdingEvents?: number;
  readonly minInterObjectDistancePx?: number;
  readonly trialSeed?: string;
  readonly arenaWidthPx?: number;
  readonly arenaHeightPx?: number;
  readonly initialObjects?: readonly {
    readonly x: number;
    readonly y: number;
    readonly speedPxPerSec: number;
    readonly headingRad: number;
    readonly turnRateRadPerSec: number;
    readonly turnJitterTimerMs: number;
    readonly minTurnIntervalMs: number;
    readonly maxTurnIntervalMs: number;
    readonly maxTurnRateRadPerSec: number;
    readonly rngSeed: string;
  }[];
}

/**
 * Corsi Block trial detail.
 */
export interface CorsiTurnDetail {
  readonly kind: 'corsi-trial';
  readonly span: number;
  readonly sequence: readonly number[];
  readonly recalled: readonly number[];
  readonly correct: boolean;
  readonly responseTimeMs: number;
  readonly firstErrorIndex?: number;
}

/**
 * Generic cognitive task trial detail.
 * Used by all 22 cognitive task modes (flanker, go-nogo, stroop, etc.).
 */
export interface CognitiveTaskTrialDetail {
  readonly kind: 'cognitive-task-trial';
  readonly taskType: string;
  readonly correct: boolean;
  readonly responseTimeMs: number;
  readonly condition?: string;
  readonly trialData?: Readonly<Record<string, unknown>>;
}

export interface OspanSetDetail {
  readonly kind: 'ospan-set';
  readonly setIndex: number;
  readonly span: number;
  readonly letters: readonly string[];
  readonly recalled: readonly string[];
  readonly recallCorrect: boolean;
  readonly equationAccuracy: number;
  readonly responseTimeMs: number;
}

// =============================================================================
// Mode-Specific Details
// =============================================================================

/**
 * Debug data for TempoConfidence algorithm.
 * Used to understand why confidence score is what it is.
 */
export interface TempoConfidenceDebug {
  /** Final score 0-100 */
  readonly score: number;
  /** Whether enough data was available */
  readonly hasEnoughData: boolean;
  /** Weights effectively used to aggregate components */
  readonly weights: {
    readonly timingDiscipline: number;
    readonly rtStability: number;
    readonly pressStability: number;
    readonly errorAwareness: number;
    readonly focusScore: number;
  };
  /** Individual component scores (each 0-100) */
  readonly components: {
    readonly timingDiscipline: number;
    readonly rtStability: number;
    readonly pressStability: number;
    readonly errorAwareness: number;
    readonly focusScore: number;
  };
  /** Raw data used for calculations */
  readonly rawData: {
    /** Total valid responses used */
    readonly totalResponses: number;
    /** Responses during stimulus (penalized) */
    readonly responsesDuringStimulus: number;
    /** Responses after stimulus (good) */
    readonly responsesAfterStimulus: number;
    /** Coefficient of Variation for reaction times */
    readonly rtCV: number | null;
    /** Mean reaction time (ms) */
    readonly rtMean: number | null;
    /** Coefficient of Variation for press durations */
    readonly pressCV: number | null;
    /** Mean press duration (ms) */
    readonly pressMean: number | null;
    /** Post-Error Slowing ratio (avgRTPostError / avgRTCorrect) */
    readonly pesRatio: number | null;
    /** Number of error→correct pairs used for PES */
    readonly pesErrorPairs: number;
    /** Number of micro-lapses detected (RT > 2.5x median) */
    readonly lapseCount: number;
    /** Total hits used for lapse calculation */
    readonly lapseHitsTotal: number;

    /** Focus interruptions captured (FOCUS_LOST count) */
    readonly focusLostCount?: number;
    /** Total time unfocused (sum of FOCUS_REGAINED.lostDurationMs) */
    readonly focusLostTotalMs?: number;

    /** Input misfires captured (Tempo) */
    readonly misfireCount?: number;
    /** Duplicate presses captured (Tempo) */
    readonly duplicateCount?: number;
    /** Which signal powers the "pressStability" slot */
    readonly pressStabilityKind?: 'pressDuration' | 'inputControl';

    /** Baseline hit rate on target opportunities (0-1) */
    readonly baselineHitRate?: number;
    /** Hit rate on target opportunities within post-error windows (0-1) */
    readonly postErrorHitRate?: number;
    /** Count of target opportunities included in postErrorHitRate */
    readonly postErrorTargetCount?: number;

    /** Count of false alarms among user actions (RT>0) */
    readonly falseAlarmActions?: number;
    /** Count of user actions used for falseAlarmFraction (hits + falseAlarms) */
    readonly actionCount?: number;
    /** falseAlarmActions / actionCount (0-1) */
    readonly falseAlarmFraction?: number;
    /** Which signal powers the "errorAwareness" component */
    readonly errorAwarenessKind?: 'pes' | 'recovery' | 'inhibition' | 'mixed';

    // --- Engagement / no-interaction diagnostics (Tempo only; optional for backward compatibility) ---
    /** Trials where at least one target existed (any modality) */
    readonly targetTrials?: number;
    /** Target trials where the user made zero actions (no key/click/tap) */
    readonly targetTrialsNoAction?: number;
    /** Longest streak (in trials) of targetTrialsNoAction */
    readonly targetTrialsNoActionMaxStreak?: number;
    /** Trials with at least one user action (any modality) */
    readonly trialsWithAnyAction?: number;
  };
}

/**
 * Dual Tempo specific details.
 */
export interface TempoDetails {
  readonly kind: 'tempo';
  /** d' target (if adaptive) */
  readonly targetDPrime?: number;
  /** Average ISI */
  readonly avgIsiMs: number;
  /** Average stimulus duration */
  readonly avgStimulusDurationMs: number;
  /** Target probability range */
  readonly pTargetRange?: { min: number; max: number; avg: number };
  /** Lure probability range */
  readonly pLureRange?: { min: number; max: number; avg: number };
  /** Debug data for confidence algorithm (only in dev/debug mode) */
  readonly confidenceDebug?: TempoConfidenceDebug;
}

/**
 * Jaeggi/BrainWorkshop specific details.
 */
export interface SimulatorDetails {
  readonly kind: 'simulator';
  /** Protocol name */
  readonly protocol: 'jaeggi' | 'brainworkshop';
  /** Threshold for advancement */
  readonly advancementThreshold: number;
  /** Worst modality performance */
  readonly worstModality?: {
    readonly modality: ModalityId;
    readonly dPrime: number;
  };
}

/**
 * Libre (custom) specific details.
 */
export interface LibreDetails {
  readonly kind: 'libre';
  /** Generator name */
  readonly generatorName: string;
  /** Configuration summary */
  readonly config: {
    readonly pTarget: number;
    readonly pLure: number;
    readonly isiMs: number;
    readonly stimulusDurationMs: number;
  };
}

/**
 * Dual Memo specific details.
 */
export interface MemoDetails {
  readonly kind: 'memo';
  /** Accuracy by slot depth */
  readonly bySlotIndex?: Record<number, { accuracy: number; count: number }>;
  /** Average recall time */
  readonly avgRecallTimeMs?: number;
  /** Trend indicator */
  readonly trend?: 'improving' | 'stable' | 'declining';
  /** Recent accuracies (last N windows) */
  readonly recentAccuracies?: readonly number[];
  // --- Mode Insights (spec §Cbis) ---
  /** Confidence score (0-100): recall quality */
  readonly confidenceScore?: number;
  /** Fluency score (0-100): regularity and corrections */
  readonly fluencyScore?: number;
  /** Number of corrections made */
  readonly correctionsCount?: number;
}

/**
 * Dual Flow specific details.
 */
export interface PlaceDetails {
  readonly kind: 'flow';
  /** Correct drops */
  readonly correctDrops: number;
  /** Error count */
  readonly errorCount: number;
  /** Mirror timeline enabled */
  readonly mirrorEnabled?: boolean;
  /** Confidence score (0-100): trajectory quality */
  readonly confidenceScore?: number;
  /** Average placement time */
  readonly avgPlacementTimeMs?: number;
  // --- Mode Insights (spec §Cbis) ---
  /** Directness ratio (0-1): straight line vs zigzag */
  readonly directnessRatio?: number;
  /** Time spent on wrong slots (ms) */
  readonly wrongSlotDwellMs?: number;
}

/**
 * Dual Pick specific details.
 */
export interface DualPickDetails {
  readonly kind: 'dual-pick';
  /** Correct drops */
  readonly correctDrops: number;
  /** Error count */
  readonly errorCount: number;
  /** Mirror timeline enabled */
  readonly mirrorEnabled?: boolean;
  /** Confidence score (0-100) */
  readonly confidenceScore?: number;
  /** Average placement time */
  readonly avgPlacementTimeMs?: number;
  // --- Mode Insights (same as Flow) ---
  /** Directness ratio (0-1): straight line vs zigzag */
  readonly directnessRatio?: number;
  /** Time spent on wrong slots (ms) */
  readonly wrongSlotDwellMs?: number;
}

/**
 * Dual Trace specific details.
 */
export interface TraceDetails {
  readonly kind: 'trace';
  /** Correct position responses */
  readonly correctPositions: number;
  /** Incorrect position responses */
  readonly incorrectPositions: number;
  /** Timeout count */
  readonly timeouts: number;
  /** Rhythm mode: timed or self-paced */
  readonly rhythmMode: 'timed' | 'self-paced';
  /** Average response time for position (ms) */
  readonly avgResponseTimeMs?: number;
  /** Writing enabled */
  readonly writingEnabled: boolean;
  /** Writing accuracy (0-1) if enabled */
  readonly writingAccuracy?: number;
  /** Correct writing responses */
  readonly correctWritings?: number;
  /** Total writing responses */
  readonly totalWritings?: number;
  /** Average writing time (ms) */
  readonly avgWritingTimeMs?: number;
  /** Color modality enabled */
  readonly colorEnabled?: boolean;
  /** Color accuracy (0-1) if enabled */
  readonly colorAccuracy?: number;
  /** Correct color responses */
  readonly correctColors?: number;
  /** Total color responses */
  readonly totalColors?: number;
  /** Confidence score (0-100): response time stability */
  readonly confidenceScore?: number;
}

/**
 * Dual Track specific details.
 */
export interface TrackDetails {
  readonly kind: 'track';
  readonly totalObjects: number;
  readonly targetCount: number;
  readonly perfectRounds: number;
  readonly selectionPrecision: number;
  readonly selectionQuality: number;
  readonly avgResponseTimeMs?: number;
  readonly trackingDurationMs: number;
  readonly speedPxPerSec: number;
  readonly motionComplexity: 'smooth' | 'standard' | 'agile';
  readonly crowdingThresholdPx?: number;
  readonly totalCrowdingEvents?: number;
  readonly avgCrowdingEventsPerTrial?: number;
  readonly minInterObjectDistancePx?: number;
  readonly masteryTargetCountStage?: number;
  readonly masteryDifficultyTier?: number;
  readonly masteryTierCount?: number;
  readonly masteryStageProgressPct?: number;
  readonly masteryPhaseIndex?: number;
  readonly masteryPhaseIdentityMode?: 'classic' | 'audio' | 'color' | 'audio-color';
  readonly highestCompletedTargetCount?: number;
  readonly promotedTargetCount?: boolean;
  readonly performanceBand?: 'mastery' | 'solid' | 'building' | 'struggling';
  readonly nextTargetCountStage?: number;
  readonly nextDifficultyTier?: number;
}

export interface OspanDetails {
  readonly kind: 'ospan';
  readonly absoluteScore: number;
  readonly maxSpan: number;
  readonly processingAccuracy: number;
  readonly recallAccuracy: number;
  readonly isValidMeasure: boolean;
}

export type ModeSpecificDetails =
  | TempoDetails
  | SimulatorDetails
  | LibreDetails
  | MemoDetails
  | PlaceDetails
  | DualPickDetails
  | TraceDetails
  | TrackDetails
  | OspanDetails;

// =============================================================================
// Main Report Model
// =============================================================================

/**
 * Unified session end report model.
 *
 * Used for:
 * - End of session display (live)
 * - History modal (from stored summary)
 */
export interface SessionEndReportModel {
  // === Identity ===
  readonly sessionId: string;
  readonly createdAt: string; // ISO date
  readonly userId?: string;
  readonly reason: SessionEndReason;

  // === Mode & Context ===
  readonly gameMode: ReportGameMode;
  readonly gameModeLabel: string; // Display name
  /** For cognitive-task mode: the specific task type (e.g. 'stroop', 'flanker', 'ant').
   *  Used for spec-driven report display and task-specific metrics. */
  readonly taskType?: string;
  /**
   * Stable journey identifier when the session belongs to a journey.
   *
   * Not all journey sessions have a computed JourneyContext (legacy data / missing system event),
   * but they still carry journeyId in start/end events. Keep this field optional for backward
   * compatibility and reliable UI features (e.g. "report freshness").
   */
  readonly journeyId?: string;
  /**
   * Stable journey stage identifier when the session belongs to a journey.
   *
   * Optional for backward compatibility: older sessions may not have a computed JourneyContext
   * (e.g. missing JOURNEY_CONTEXT_COMPUTED) but still carry journeyStageId in start/end events.
   */
  readonly journeyStageId?: number;
  readonly journeyContext?: JourneyContext;
  /** Explicit context at play time: journey stage vs free training */
  readonly playContext?: SessionPlayContext;

  // === Config ===
  readonly nLevel: number;
  readonly activeModalities: readonly ModalityId[];
  readonly trialsCount: number;
  readonly durationMs: number;

  // === Scores ===
  /** Unified Performance Score (0-100, cross-mode comparable) */
  readonly ups: UnifiedPerformanceScore;
  /** Unified accuracy (0-1, cross-mode comparable) - legacy, now derived from UPS.components.accuracy */
  readonly unifiedAccuracy: number;
  /** Native mode score */
  readonly modeScore: ModeScore;
  /** Internal pass/fail (for progression logic, not displayed as verdict) */
  readonly passed?: boolean;

  // === Unified Counts ===
  readonly totals: UnifiedTotals;
  readonly byModality: Record<ModalityId, UnifiedModalityStats>;

  // === Derived Metrics ===
  readonly errorProfile: ErrorProfile;
  readonly speedStats?: SpeedStats;
  readonly focusStats?: FocusStats;

  // === Next Step ===
  readonly nextStep?: NextStepRecommendation;

  // === Mode-Specific Details ===
  readonly modeDetails?: ModeSpecificDetails;

  /** Task-specific metrics from events (e.g. congruency effect, d-prime, etc.) */
  readonly taskMetrics?: Readonly<Record<string, unknown>>;

  // === Tour-by-Tour (lazy loaded in UI) ===
  /** Available only when events are loaded */
  readonly turns?: readonly TurnSummary[];

  // === XP (optional, present when session completed with XP calculation) ===
  /** XP breakdown for this session (base, bonuses, total) */
  readonly xpBreakdown?: XPBreakdown;

  /** BrainWorkshop only: strike tracking for report UI (used when JourneyContext is not available yet). */
  readonly brainWorkshop?: {
    readonly strikesBefore: number;
    readonly strikesAfter: number;
    readonly strikesToDown: number;
  };
}

// =============================================================================
// Contextual Message Types
// =============================================================================

/**
 * Performance level for contextual messaging.
 */
export type PerformanceLevel = 'excellent' | 'good' | 'average' | 'below-average' | 'struggling';

/**
 * A translatable message with i18n key and interpolation parameters.
 * Used by logic layer to return translation-ready data that UI resolves.
 */
export interface TranslatableMessage {
  /** i18n key (e.g., 'stats.contextual.headlines.abandonedV1') */
  readonly key: string;
  /** Interpolation parameters for the translation */
  readonly params?: Record<string, string | number>;
}

/**
 * Contextual message data returned by logic layer.
 * Contains i18n keys that UI must resolve via t() function.
 */
export interface ContextualMessageData {
  /** Performance level derived from results */
  readonly level: PerformanceLevel;
  /** Main headline (i18n key + params) */
  readonly headline: TranslatableMessage;
  /** Subline with specific insight (i18n key + params) */
  readonly subline: TranslatableMessage;
  /** Key insight from the session (optional, i18n key + params) */
  readonly insight?: TranslatableMessage;
}

/**
 * Contextual message data-driven from session results.
 * @deprecated Use ContextualMessageData with i18n keys instead
 */
export interface ContextualMessage {
  /** Performance level derived from results */
  readonly level: PerformanceLevel;
  /** Main headline (factual, not cliché) */
  readonly headline: string;
  /** Subline with specific insight */
  readonly subline: string;
  /** Key insight from the session (optional) */
  readonly insight?: string;
}

/**
 * Derive performance level from UPS score.
 * Uses the same tier thresholds as PerformanceTier.
 */
export function derivePerformanceLevelFromUPS(upsScore: number): PerformanceLevel {
  if (upsScore >= UPS_TIER_ELITE) return 'excellent';
  if (upsScore >= UPS_TIER_ADVANCED) return 'good';
  if (upsScore >= UPS_TIER_INTERMEDIATE) return 'average';
  if (upsScore >= UPS_TIER_NOVICE) return 'below-average';
  return 'struggling';
}

/**
 * Maps UPS PerformanceTier to legacy PerformanceLevel.
 */
export function tierToPerformanceLevel(tier: PerformanceTier): PerformanceLevel {
  switch (tier) {
    case 'elite':
      return 'excellent';
    case 'advanced':
      return 'good';
    case 'intermediate':
      return 'average';
    case 'novice':
      return 'below-average';
  }
}
