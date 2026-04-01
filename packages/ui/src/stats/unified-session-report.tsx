/**
 * UnifiedSessionReport - Spec-Driven end-of-game report
 *
 * Redesigned for progressive disclosure:
 * - Essential info visible immediately (score, recommendation, XP summary)
 * - Details in collapsible accordions
 * - Hatching separators between major zones
 *
 * Architecture:
 * - ModeSpec defines the "communication contract" (WHAT to show)
 * - Disclosure components for progressive disclosure
 * - Hatching for visual separation
 */

import { type ReactNode, useRef } from 'react';
import { X } from '@phosphor-icons/react';
import { ChartBar, Warning, TrendUp, ListChecks, Star, Brain } from '@phosphor-icons/react';
import gsap from 'gsap';
import { cn } from '../lib/utils';
import { useTranslation } from 'react-i18next';
import type {
  SessionEndReportModel,
  ContextualMessage,
  ReportSectionId,
  XPBreakdown,
  BadgeDefinition,
  TempoConfidenceDebug,
} from '@neurodual/logic';
import { AllSpecs, computeProgressionIndicatorModel } from '@neurodual/logic';
import { Hatching, Disclosure, BetaBadge } from '../primitives';

import {
  ReportSecondaryActions,
  ReportXPSection,
  ReportXPSummary,
  ReportHero,
  ReportPerformance,
  ReportErrorProfile,
  ReportDetails,
  ReportTrend,
  ReportConfidenceBreakdown,
  ProgressionIndicator,
  getModeColors,
} from './sections';
import type { ReportLabels } from './sections';
import { useMountEffect } from '../hooks';

// =============================================================================
// Types
// =============================================================================

export interface UnifiedSessionReportLabels extends ReportLabels {}

/**
 * XP data passed from useSessionCompletion hook.
 * Optional - if not provided, XP section is not displayed.
 */
export interface XPData {
  readonly xpBreakdown: XPBreakdown;
  readonly leveledUp: boolean;
  readonly newLevel: number;
  readonly newBadges: readonly BadgeDefinition[];
}

export interface UnifiedSessionReportProps {
  readonly data: SessionEndReportModel;
  readonly message: ContextualMessage;
  readonly labels: UnifiedSessionReportLabels;
  readonly onPlayAgain: () => void;
  readonly onBackToHome: () => void;
  readonly onGoToStats?: (report: SessionEndReportModel) => void;
  /** Start a free training session at a given N-level (for progression card CTAs). */
  readonly onStartAtLevel?: (level: number) => void;
  /** Navigate to a journey stage (for progression card CTA). */
  readonly onGoToJourneyStage?: (stageId: number, nLevel: number) => void;
  /** Notice shown below the progression card (e.g. link to a more recent journey session). */
  readonly journeyNotice?: ReactNode;
  readonly onReplay?: () => void;
  /** Interactive correction mode (only for Tempo sessions) */
  readonly onCorrect?: () => void;
  readonly className?: string;
  /** XP data from session completion - if provided, shows XP section */
  readonly xpData?: XPData;
  /** Beta features enabled - if false, shows teaser for confidence analysis */
  readonly betaEnabled?: boolean;
  /** Show mobile close button inside title area. */
  readonly showMobileCloseButton?: boolean;
  /** Show floating close button on report frame corner (desktop only). */
  readonly showFloatingCloseButton?: boolean;
}

// =============================================================================
// Spec Lookup
// =============================================================================

/**
 * Default sections order when no spec is found.
 * This is a fallback for legacy modes or custom configurations.
 */
const DEFAULT_SECTIONS: readonly ReportSectionId[] = [
  'HERO',
  'PERFORMANCE',
  'ERROR_PROFILE',
  'INSIGHTS',
  'SPEED',
  'NEXT_STEP',
  'REWARD_INDICATOR',
  'DETAILS',
];

/**
 * Get the report sections from the ModeSpec.
 * Falls back to default sections if spec is not found.
 */
function getReportSections(gameMode: string, taskType?: string): readonly ReportSectionId[] {
  // For cognitive tasks, try the specific taskType first
  if (taskType) {
    const taskSpec = AllSpecs[taskType as keyof typeof AllSpecs];
    if (taskSpec?.report?.sections) return taskSpec.report.sections;
  }
  const spec = AllSpecs[gameMode as keyof typeof AllSpecs];
  if (spec?.report?.sections) {
    return spec.report.sections;
  }
  // Fallback for unknown modes
  return DEFAULT_SECTIONS;
}

const TEMPO_GAME_MODES = new Set<SessionEndReportModel['gameMode']>([
  'dualnback-classic',
  'dualnback-classic',
  'sim-brainworkshop',
  'custom',
]);

function createFallbackConfidenceDebug(data: SessionEndReportModel): TempoConfidenceDebug {
  const approxResponses = (data.totals.hits ?? 0) + (data.totals.falseAlarms ?? 0);
  // When confidenceDebug isn't available, do not invent component scores.
  // The report should surface "not computed" rather than a plausible-looking number.
  const fallbackScore = 50;
  return {
    score: fallbackScore,
    hasEnoughData: false,
    weights: {
      timingDiscipline: 0.35,
      rtStability: 0.2,
      pressStability: 0.2,
      errorAwareness: 0.2,
      focusScore: 0.05,
    },
    components: {
      timingDiscipline: 50,
      rtStability: 50,
      pressStability: 50,
      errorAwareness: 50,
      focusScore: 50,
    },
    rawData: {
      totalResponses: approxResponses,
      responsesDuringStimulus: 0,
      responsesAfterStimulus: 0,
      rtCV: null,
      rtMean: null,
      pressCV: null,
      pressMean: null,
      pesRatio: null,
      pesErrorPairs: 0,
      lapseCount: data.focusStats?.focusLostCount ?? 0,
      lapseHitsTotal: data.totals.hits,
    },
  };
}

// =============================================================================
// Main Component
// =============================================================================

export function UnifiedSessionReport({
  data,
  message,
  labels,
  onPlayAgain,
  onBackToHome,
  onGoToStats,
  onStartAtLevel,
  onGoToJourneyStage,
  onReplay,
  onCorrect,
  className,
  xpData,
  betaEnabled = false,
  showMobileCloseButton = true,
  showFloatingCloseButton = false,
  journeyNotice,
}: UnifiedSessionReportProps): ReactNode {
  const { t } = useTranslation();
  // Keep one contextual message per displayed report to avoid random phrase drift on rerenders.
  // A new mount (e.g. reopening history modal) can still pick a different phrase.
  const stableMessageRef = useRef<{ sessionId: string; message: ContextualMessage } | null>(null);
  if (stableMessageRef.current === null || stableMessageRef.current.sessionId !== data.sessionId) {
    stableMessageRef.current = { sessionId: data.sessionId, message };
  }
  const stableMessage = stableMessageRef.current.message;

  // Get sections from ModeSpec
  const allSections = getReportSections(data.gameMode, data.taskType);

  // Check which sections are active
  const hasPerformance = allSections.includes('PERFORMANCE');
  const hasConfidenceSection = allSections.includes('CONFIDENCE_BREAKDOWN');
  const hasErrorProfile = allSections.includes('ERROR_PROFILE');
  const hasDetails = allSections.includes('DETAILS');
  const hasTrend = allSections.includes('RECENT_TREND');
  const tempoConfidenceDebug =
    data.modeDetails?.kind === 'tempo'
      ? (data.modeDetails.confidenceDebug ?? createFallbackConfidenceDebug(data))
      : TEMPO_GAME_MODES.has(data.gameMode)
        ? createFallbackConfidenceDebug(data)
        : undefined;

  // Compute UPS score for journey header
  const totalActions =
    data.totals.hits +
    data.totals.misses +
    (data.totals.falseAlarms ?? 0) +
    (data.totals.correctRejections ?? 0);
  const hasScorableTrials = totalActions > 0;

  // Check if secondary actions are needed
  const hasSecondaryActions = onReplay || onCorrect;

  const modeColors = getModeColors(data.gameMode, data.taskType);
  const progressionModel = computeProgressionIndicatorModel(data);
  const heroProgressTone = progressionModel?.tone;
  const progressionTintClass =
    progressionModel?.journeyCompletion === 'journey-completed'
      ? 'bg-amber-500/[0.12]'
      : progressionModel?.tone === 'up'
        ? 'bg-woven-correct/[0.12]'
        : progressionModel?.tone === 'down'
          ? 'bg-woven-incorrect/[0.12]'
          : progressionModel
            ? 'bg-woven-focus/[0.14]'
            : '';

  // Animation on mount
  const containerRef = useRef<HTMLDivElement>(null);
  useMountEffect(() => {
    if (!containerRef.current) return;

    // Start hidden
    gsap.set(containerRef.current, { opacity: 0, scale: 0.95 });

    // Animate in
    gsap.to(containerRef.current, {
      opacity: 1,
      scale: 1,
      duration: 0.3,
      ease: 'power2.out',
    });
  });

  return (
    <div
      ref={containerRef}
      className={cn('relative w-full md:max-w-md lg:max-w-lg md:mx-auto', className)}
    >
      {showFloatingCloseButton && (
        <button
          type="button"
          onClick={onBackToHome}
          aria-label={t('common.close', 'Close')}
          className="hidden md:flex absolute -top-3 -right-3 items-center justify-center p-2 bg-woven-bg text-woven-incorrect hover:text-woven-incorrect/90 hover:bg-woven-incorrect/10 rounded-full transition-colors z-20 border border-border shadow-sm"
        >
          <X size={20} />
        </button>
      )}
      <Hatching id="report-frame-top" className="text-foreground/70" />
      <div className="flex items-stretch gap-x-2">
        <Hatching
          id="report-frame-left"
          orientation="vertical"
          className="shrink-0 text-foreground/70"
        />
        <div className="flex-1 min-w-0">
          {/* ═══════════════════════════════════════════════════════════════════════
              ZONE 1: HERO
              Badge Mode + Message + Dual Score (UPS + Mode) + Back button
          ═══════════════════════════════════════════════════════════════════════ */}
          <div className="px-2 pt-4 pb-0">
            <ReportHero
              data={data}
              message={stableMessage}
              labels={labels}
              modeColors={modeColors}
              onBackToHome={onBackToHome}
              onGoToStats={onGoToStats ? () => onGoToStats(data) : undefined}
              betaEnabled={betaEnabled}
              showMobileCloseButton={showMobileCloseButton}
              progressTone={heroProgressTone}
            />
          </div>

          {/* ═══════════════════════════════════════════════════════════════════════
              ZONE 2: PROGRESSION INDICATOR (colors + CTA)
          ═══════════════════════════════════════════════════════════════════════ */}
          {progressionModel && !journeyNotice && (
            <>
              <div className="-mx-2 px-[1px] py-[1px] rounded-2xl overflow-hidden">
                <div className={cn('px-3 py-5 transition-colors', progressionTintClass)}>
                  <div className="relative z-10">
                    <ProgressionIndicator
                      model={progressionModel}
                      labels={labels}
                      surfaceVariant="flat"
                      onPlayAgain={onPlayAgain}
                      onStartAtLevel={onStartAtLevel}
                      onGoToJourneyStage={onGoToJourneyStage}
                      onBackToHome={onBackToHome}
                    />
                  </div>
                </div>
              </div>
              <Hatching id="report-progression-hatch" className="text-foreground/70" />
            </>
          )}
          {journeyNotice && (
            <div className="px-2 pt-3 pb-1">
              <div className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-center">
                <div className="text-xs text-muted-foreground leading-relaxed">{journeyNotice}</div>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════════
              ZONE 4: XP SUMMARY (compact)
          ═══════════════════════════════════════════════════════════════════════ */}
          {xpData && (
            <>
              <div className="px-2 py-6">
                <ReportXPSummary
                  sessionId={data.sessionId}
                  xpBreakdown={xpData.xpBreakdown}
                  leveledUp={xpData.leveledUp}
                  newLevel={xpData.newLevel}
                  labels={labels}
                />
              </div>

              <Hatching id="report-xp-hatch" className="text-foreground/70" />
            </>
          )}

          {/* ═══════════════════════════════════════════════════════════════════════
              ZONE 5: ACCORDIONS (Progressive Disclosure)
              All details collapsed by default
          ═══════════════════════════════════════════════════════════════════════ */}
          <div className="px-2 py-6 space-y-2">
            {/* Performance accordion */}
            {hasPerformance && (
              <Disclosure
                title={
                  labels.accordionPerformance ??
                  t('stats.unifiedReport.accordions.performance', 'Performance by modality')
                }
                icon={<ChartBar size={18} weight="duotone" className="text-primary" />}
                lazy
                keepMounted={false}
                render={() => <ReportPerformance data={data} labels={labels} />}
              />
            )}

            {/* Confidence Analysis accordion */}
            {hasConfidenceSection && tempoConfidenceDebug && (
              <Disclosure
                title={
                  labels.accordionConfidenceAnalysis ??
                  t('stats.unifiedReport.accordions.confidence', 'Confidence analysis')
                }
                icon={<Brain size={18} weight="duotone" className="text-primary" />}
                badge={<BetaBadge size="sm" />}
                lazy
                keepMounted={false}
                render={() => (
                  <ReportConfidenceBreakdown
                    confidenceDebug={tempoConfidenceDebug}
                    labels={labels}
                  />
                )}
              />
            )}

            {/* Error Analysis accordion */}
            {hasErrorProfile && hasScorableTrials && (
              <Disclosure
                title={
                  labels.accordionErrorAnalysis ??
                  t('stats.unifiedReport.accordions.errors', 'Error analysis')
                }
                icon={<Warning size={18} weight="duotone" className="text-woven-incorrect" />}
                lazy
                keepMounted={false}
                render={() => <ReportErrorProfile data={data} labels={labels} />}
              />
            )}

            {/* Trend accordion */}
            {hasTrend && (
              <Disclosure
                title={
                  labels.accordionTrend ?? t('stats.unifiedReport.accordions.trend', 'Recent trend')
                }
                icon={<TrendUp size={18} weight="duotone" className="text-primary" />}
                lazy
                keepMounted={false}
                render={() => <ReportTrend data={data} labels={labels} />}
              />
            )}

            {/* Timeline accordion */}
            {hasDetails && (
              <Disclosure
                title={
                  labels.accordionTimeline ??
                  t('stats.unifiedReport.accordions.timeline', 'Detailed timeline')
                }
                icon={<ListChecks size={18} weight="duotone" className="text-muted-foreground" />}
                lazy
                keepMounted={false}
                render={() => <ReportDetails data={data} labels={labels} />}
              />
            )}

            {/* XP Details accordion (full breakdown) */}
            {xpData && (
              <Disclosure
                title={
                  labels.accordionXPDetails ??
                  t('stats.unifiedReport.accordions.xp', 'XP & Rewards Details')
                }
                icon={<Star size={18} weight="duotone" className="text-amber-500" />}
                lazy
                keepMounted={false}
                render={() => (
                  <ReportXPSection
                    sessionId={data.sessionId}
                    xpBreakdown={xpData.xpBreakdown}
                    nLevel={data.nLevel}
                    leveledUp={xpData.leveledUp}
                    newLevel={xpData.newLevel}
                    newBadges={xpData.newBadges}
                    labels={labels}
                  />
                )}
              />
            )}
          </div>

          {/* ═══════════════════════════════════════════════════════════════════════
              ZONE 6: SECONDARY ACTIONS (Review + Correct)
          ═══════════════════════════════════════════════════════════════════════ */}
          {hasSecondaryActions && (
            <>
              <Hatching id="report-secondary-hatch" className="text-foreground/70" />
              <div className="px-2 py-6">
                <ReportSecondaryActions labels={labels} onReplay={onReplay} onCorrect={onCorrect} />
              </div>
            </>
          )}
        </div>
        <Hatching
          id="report-frame-right"
          orientation="vertical"
          className="shrink-0 text-foreground/70"
        />
      </div>
      <Hatching id="report-frame-bottom" className="text-foreground/70" />
    </div>
  );
}
