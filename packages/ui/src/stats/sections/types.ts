/**
 * Shared types for report sections
 */

import type {
  SessionEndReportModel,
  ContextualMessage,
  JourneyContext,
  ModalityFamily,
} from '@neurodual/logic';
import { getModeColors as getModeColorsFromSpec } from '@neurodual/logic';

// =============================================================================
// Mode Colors
// =============================================================================

export interface ModeColors {
  readonly bg: string;
  readonly border: string;
  readonly text: string;
  readonly textLight: string;
}

// =============================================================================
// Labels (subset of UnifiedSessionReportLabels)
// =============================================================================

export interface ReportLabels {
  // Header
  readonly performance: string;
  readonly modeScore: string;
  readonly upsScore: string;
  readonly upsAccuracy: string;
  readonly upsConfidence: string;
  readonly upsTooltip: string;
  /** Tooltip prefix when UPS is not computed (no count). */
  readonly upsNotComputed?: string;
  /** Tooltip prefix when UPS is not computed (placeholder: {count}). */
  readonly upsNotComputedWithCount?: string;
  // Dynamic mode-specific labels (resolved from spec i18n keys)
  /** Resolved from data.modeScore.labelKey */
  readonly modeScoreLabel?: string;
  /** Resolved from data.modeScore.tooltipKey */
  readonly modeScoreTooltip?: string;
  /** Resolved from data.speedStats.labelKey */
  readonly speedLabel?: string;
  /** Resolved from data.speedStats.secondary[].labelKey */
  readonly speedSecondaryLabels?: readonly string[];
  // Modality labels (dynamic, supports N modalities)
  readonly modality?: Partial<Record<ModalityFamily, string>>;
  // Legacy modality labels (kept for backward compatibility)
  readonly position?: string;
  readonly audio?: string;
  readonly color?: string;
  // Stats labels
  readonly hits: string;
  readonly misses: string;
  readonly falseAlarms: string;
  readonly correctRejections: string;
  readonly accuracy: string;
  readonly dPrime: string;
  readonly reactionTime: string;
  // Error profile
  readonly errorProfile: string;
  readonly errorRate: string;
  readonly missShare: string;
  readonly faShare: string;
  // Speed
  readonly speedRhythm: string;
  // Mode Insights
  readonly modeInsights: string;
  readonly confidenceScore: string;
  readonly directnessRatio: string;
  readonly wrongSlotDwell: string;
  readonly placementTime: string;
  readonly fluencyScore: string;
  readonly corrections: string;
  readonly recallTime: string;
  readonly trend: string;
  readonly trendImproving: string;
  readonly trendStable: string;
  readonly trendDeclining: string;
  /** Message when not enough sessions for trend (placeholder: {count}) */
  readonly trendNotEnoughSessions?: string;
  // Memo slot details (optional)
  readonly slotAccuracy?: string;
  readonly recentAccuracies?: string;
  // Trace mode (optional)
  readonly writingAccuracy?: string;
  // Next step
  readonly nextSession: string;
  readonly nextSessionRecommended?: string;
  readonly levelUp: string;
  readonly levelSame: string;
  readonly levelDown: string;
  readonly levelUpHint?: string;
  readonly levelDownHint?: string;
  /** Button label to replay at specific level (placeholder: {level}) */
  readonly replayLevel?: string;
  /** Button label to go to specific level (placeholder: {level}) */
  readonly goToLevel?: string;
  /** Button label to return to a lower level (placeholder: {level}) */
  readonly backToLevel?: string;
  /** Button label to stay at the current level (placeholder: {level}) */
  readonly stayAtLevel?: string;
  /** Level indicator (e.g., "Niveau") */
  readonly level?: string;
  // Details
  readonly details: string;
  readonly turnByTurn: string;
  readonly allTurns: string;
  readonly errorsOnly: string;
  readonly noDetails: string;
  readonly loading?: string;
  // Actions
  readonly playAgain: string;
  readonly backToHome: string;
  /** Navigate to statistics dashboard / page. */
  readonly goToStats?: string;
  readonly nextStage: string;
  readonly replay?: string;
  /** Generic label for settings (used in journey completion card). */
  readonly settings?: string;
  // Journey
  readonly sessionValidated: string;
  readonly sessionNotValidated: string;
  /** "Étape validée" - used for journey context instead of sessionValidated */
  readonly stageValidated?: string;
  /** "Étape non validée" - used for journey context instead of sessionNotValidated */
  readonly stageNotValidated?: string;
  readonly minScore: string;
  readonly stage: string;
  readonly progress: string;
  readonly stageCompleted: string;
  readonly journeyCompleted?: string;
  readonly stageUnlocked: string;
  readonly yourScore: string;
  readonly requiredScore: string;
  /** Label for "erreurs" (Dual N-Back Classic error display) */
  readonly errorsLabel?: string;
  /** Title for per-modality error row (Dual N-Back Classic). */
  readonly errorsByModality?: string;
  /** Error analysis: no error state */
  readonly noErrors?: string;
  /** Explanation for Dual N-Back Classic threshold */
  readonly dualnbackClassicThresholdExplanation?: string;
  /** Dual N-Back Classic contextual rule snippets (used in recommendation cards) */
  readonly dualnbackClassicRuleUp?: string;
  readonly dualnbackClassicRuleStay?: string;
  readonly dualnbackClassicRuleDown?: string;
  /** Brain Workshop zone labels */
  readonly bwZoneUp?: string;
  readonly bwZoneStay?: string;
  readonly bwZoneStrike?: string;
  readonly bwUp?: string;
  readonly bwStay?: string;
  readonly bwStrike?: string;
  /** Brain Workshop explicit DOWN (3 strikes) label */
  readonly bwDown?: string;
  /** Brain Workshop strike headline without fraction (used with dots indicator) */
  readonly bwStrikeHeadline?: string;
  readonly bwThresholdExplanation?: string;
  /** Explanation for 3 strikes rule */
  readonly bwStrikeExplanation?: string;
  /** Brain Workshop contextual rule snippets (used in recommendation cards) */
  readonly bwRuleUp?: string;
  readonly bwRuleStay?: string;
  readonly bwRuleStrike?: string;
  readonly bwRuleDown?: string;
  /** Brain Workshop unified messages for simplified card layout */
  readonly bwMessages?: {
    readonly up: string;
    readonly stay: string;
    readonly down: string;
    readonly strikeFirst: string;
    readonly strikeSecond: string;
    readonly strikeThird: string;
  };
  /** Journey label (e.g., "Parcours") */
  readonly journey?: string;
  /** Short name for the hybrid alternating journey card. */
  readonly hybridJourneyName?: string;
  /** Hybrid journey contextual messages for report guidance. */
  readonly hybridJourneyMessages?: {
    readonly up: string;
    readonly stay: string;
    readonly down: string;
    readonly pendingPair: string;
    readonly rule: string;
    readonly trackTitle?: string;
    readonly trackBody?: string;
    readonly validationTitle?: string;
    readonly validationBody?: string;
    readonly stayProgressTitle?: string;
    readonly stayProgressBody?: string;
    readonly failureTitle?: string;
    readonly failureBody?: string;
    readonly upDecisionTitle?: string;
    readonly stayDecisionTitle?: string;
    readonly downDecisionTitle?: string;
  };
  /** Dual Track journey messages. */
  readonly trackMessages?: {
    readonly up?: string;
    readonly upBody?: string;
    readonly stay?: string;
    readonly stayBody?: string;
    readonly down?: string;
    readonly downBody?: string;
    readonly promoted?: string;
    readonly promotedBody?: string;
  };
  /** Context label for free training sessions (e.g., "Entraînement libre") */
  readonly reportContextFree?: string;
  /** Context label for journey sessions (e.g., "Parcours") */
  readonly reportContextJourney?: string;
  // Turn details
  readonly turnCorrect: string;
  readonly turnIncorrect: string;
  readonly turnPartial: string;
  // Reward progress
  readonly rewardNextPass?: string;
  readonly rewardRemaining?: string;
  readonly rewardDays?: string;
  readonly reward1Month?: string;
  readonly reward3Months?: string;
  readonly rewardLifetime?: string;
  readonly rewardAllUnlocked?: string;
  readonly rewardLifetimeEarned?: string;
  // XP Section
  readonly xpTitle?: string;
  readonly xpBase?: string;
  readonly xpPerformance?: string;
  readonly xpAccuracy?: string;
  readonly xpStreakBonus?: string;
  readonly xpDailyBonus?: string;
  readonly xpBadgeBonus?: string;
  readonly xpFlowBonus?: string;
  readonly xpConfidenceMultiplier?: string;
  readonly xpDailyCapReached?: string;
  readonly xpLevelReached?: string;
  // Badges
  readonly badgesNewUnlocked?: string;
  // Confidence breakdown
  readonly confidenceBreakdown?: string;
  readonly confidenceTiming?: string;
  readonly confidenceRTStability?: string;
  readonly confidencePressStability?: string;
  readonly confidenceErrorAwareness?: string;
  readonly confidenceFocus?: string;
  readonly confidenceInsufficientData?: string;
  /** Tooltip title when confidence cannot be computed (placeholders: {count}, {min}). */
  readonly confidenceNotComputed?: string;
  // Accordion section titles
  readonly accordionPerformance?: string;
  readonly accordionConfidenceAnalysis?: string;
  readonly accordionErrorAnalysis?: string;
  readonly accordionTrend?: string;
  readonly accordionTimeline?: string;
  readonly accordionXPDetails?: string;
  // Analysis card (kept for backward compatibility)
  readonly analysisTitle?: string;
}

// =============================================================================
// Shared Props
// =============================================================================

export interface BaseSectionProps {
  readonly data: SessionEndReportModel;
  readonly labels: ReportLabels;
}

export interface HeroSectionProps extends BaseSectionProps {
  readonly message: ContextualMessage;
  readonly modeColors: ModeColors;
}

export interface InsightsSectionProps extends BaseSectionProps {
  readonly modeColors: ModeColors;
}

export interface ActionsSectionProps {
  readonly journeyContext?: JourneyContext;
  readonly labels: ReportLabels;
  readonly onPlayAgain: () => void;
  readonly onBackToHome: () => void;
  readonly onNextStage?: () => void;
  readonly onReplay?: () => void;
  readonly onCorrect?: () => void;
}

// =============================================================================
// Mode Colors (spec-driven)
// =============================================================================

const DEFAULT_MODE_COLOR: ModeColors = {
  bg: 'bg-slate-50',
  border: 'border-slate-200',
  text: 'text-slate-700',
  textLight: 'text-slate-600',
};

/**
 * Get mode colors from spec.
 * Derives textLight from the accent color (e.g., 'violet-500' → 'text-violet-600').
 *
 * @param gameMode The game mode ID
 * @returns ModeColors with bg, border, text, textLight
 */
export function getModeColors(gameMode: string, taskType?: string): ModeColors {
  const specColors = getModeColorsFromSpec(gameMode, taskType);

  // Derive textLight from accent (e.g., 'violet-500' → 'text-violet-600')
  const textLight = specColors.accent
    ? `text-${specColors.accent.replace('-500', '-600')}`
    : DEFAULT_MODE_COLOR.textLight;

  return {
    bg: specColors.bg,
    border: specColors.border,
    text: specColors.text,
    textLight,
  };
}

// =============================================================================
// Modality Helpers
// =============================================================================

// NOTE: MODALITY_COLORS and getModalityLabel have been moved to @neurodual/logic
// Use getModalityColor() and getModalityLabelInfo() from logic instead.
