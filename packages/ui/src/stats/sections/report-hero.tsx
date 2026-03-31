/**
 * ReportHero - Primary score display section
 *
 * Displays:
 * - Prominent mode title with themed accent marker
 * - Contextual message
 * - Dual score card: UPS (primary) + Mode Score (secondary)
 *
 * Simplified design - accuracy/confidence moved to Performance accordion.
 */

import type { ReactNode } from 'react';
import { X } from '@phosphor-icons/react';
import { cn } from '../../lib/utils';
import { Hatching } from '../../primitives';
import { InfoSheet } from '../../primitives/info-sheet';
import { useTranslation } from 'react-i18next';
import type {
  SessionEndReportModel,
  ContextualMessage,
  TempoConfidenceDebug,
} from '@neurodual/logic';
import type { ReportLabels, ModeColors } from './types';

// =============================================================================
// Types
// =============================================================================

export interface ReportHeroProps {
  readonly data: SessionEndReportModel;
  readonly message: ContextualMessage;
  readonly labels: ReportLabels;
  readonly modeColors?: ModeColors;
  readonly onBackToHome: () => void;
  readonly onGoToStats?: () => void;
  /** If true, show actual UPS score (beta feature) */
  readonly betaEnabled?: boolean;
  /** Display mode title + level badge row */
  readonly showTitle?: boolean;
  /** Display message + scores + nav card */
  readonly showCard?: boolean;
  /** Optional progression tone from progression indicator (SSOT). */
  readonly progressTone?: 'up' | 'stay' | 'down';
  /** Show mobile close button in the title area. */
  readonly showMobileCloseButton?: boolean;
}

// =============================================================================
// Component
// =============================================================================

export function ReportHero({
  data,
  message: _message,
  labels,
  modeColors,
  onBackToHome,
  onGoToStats: _onGoToStats,
  betaEnabled: _betaEnabled = false,
  showTitle = true,
  showCard = true,
  progressTone,
  showMobileCloseButton = true,
}: ReportHeroProps): ReactNode {
  const { t } = useTranslation();
  const totalActions =
    data.totals.hits +
    data.totals.misses +
    (data.totals.falseAlarms ?? 0) +
    (data.totals.correctRejections ?? 0);
  const hasScorableActions = totalActions > 0;
  const confidenceDebug = (
    data.modeDetails as { confidenceDebug?: TempoConfidenceDebug } | undefined
  )?.confidenceDebug;
  const confidenceResponses = confidenceDebug?.rawData.totalResponses ?? null;
  const upsNotComputedBecauseNoResponses = confidenceResponses === 0;

  // UPS shown in report (still labeled Beta). Hide when not computable/meaningful.
  const upsScoreValue = typeof data.ups?.score === 'number' ? data.ups.score : null;
  const hasUpsScore =
    hasScorableActions && upsScoreValue !== null && !upsNotComputedBecauseNoResponses;
  const upsScoreDisplay = hasUpsScore ? String(upsScoreValue) : '—';
  const upsTooltipPrefix = (() => {
    if (hasUpsScore) return '';
    if (confidenceResponses !== null) {
      const template = labels.upsNotComputedWithCount;
      if (!template) return '';
      return `${template.replace('{count}', String(confidenceResponses))} `;
    }
    return labels.upsNotComputed ? `${labels.upsNotComputed} ` : '';
  })();

  const scoreColorClass =
    progressTone === 'up'
      ? 'text-woven-correct'
      : progressTone === 'down'
        ? 'text-woven-incorrect'
        : 'text-woven-focus';

  // Format mode score for display
  const modeScoreDisplay =
    data.modeScore.unit === '%'
      ? `${Math.round(data.modeScore.value)}%`
      : data.modeScore.unit === "d'"
        ? data.modeScore.value.toFixed(2)
        : String(data.modeScore.value);

  // Use mode color for the title and mode score, with fallback
  const modeColorClass = modeColors?.text ?? 'text-muted-foreground';
  const rawLevelTemplate = labels.level ?? t('stats.unifiedReport.level', 'N-{level}');
  const levelText = rawLevelTemplate.replace('{level}', String(data.nLevel));
  const forcedTwoLineTitle = (() => {
    if (data.gameMode !== 'dualnback-classic' && data.gameMode !== 'sim-brainworkshop') {
      return null;
    }
    const words = data.gameModeLabel
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 0);
    if (words.length < 2) return null;
    const lastWord = words[words.length - 1];
    const firstLine = words.slice(0, -1).join(' ');
    return { firstLine, lastWord };
  })();
  return (
    <div className="text-center w-full">
      {showTitle && (
        <div className="space-y-2">
          {/* Mode title - prominent and color-coded */}
          <div className="relative mx-auto w-full max-w-sm">
            {showMobileCloseButton && (
              <button
                type="button"
                onClick={onBackToHome}
                aria-label={t('common.close', 'Close')}
                className="md:hidden absolute top-0 right-0 p-2 text-woven-incorrect hover:text-woven-incorrect/90 hover:bg-woven-incorrect/10 rounded-full transition-colors z-10"
              >
                <X size={20} />
              </button>
            )}
            <h2
              title={data.gameModeLabel}
              className={cn(
                'text-2xl sm:text-3xl font-black tracking-tight leading-tight text-center',
                'whitespace-normal break-words',
                showMobileCloseButton ? 'pr-12 md:pr-0' : 'pr-0',
                modeColorClass,
              )}
            >
              {forcedTwoLineTitle ? (
                <>
                  <span className="block">{forcedTwoLineTitle.firstLine}</span>
                  <span className="inline-flex items-center gap-2">
                    <span>{forcedTwoLineTitle.lastWord}</span>
                    <span
                      className={cn(
                        'inline-flex align-middle -translate-y-px items-center px-3 py-1.5 rounded-lg',
                        'text-sm font-bold leading-none tabular-nums tracking-wide',
                        'whitespace-nowrap bg-surface border border-border text-foreground',
                      )}
                    >
                      {levelText}
                    </span>
                  </span>
                </>
              ) : (
                <>
                  {data.gameModeLabel}
                  {'\u00A0'}
                  <span
                    className={cn(
                      'inline-flex align-middle -translate-y-px items-center px-3 py-1.5 rounded-lg',
                      'text-sm font-bold leading-none tabular-nums tracking-wide',
                      'whitespace-nowrap bg-surface border border-border text-foreground',
                    )}
                  >
                    {levelText}
                  </span>
                </>
              )}
            </h2>
          </div>
          <Hatching id="report-hero-title-hatch" className="text-foreground/70" />
        </div>
      )}

      {showCard && (
        <>
          <div className={cn('mx-auto w-full max-w-sm', 'p-1', showTitle && 'mt-4')}>
            <div className="flex items-stretch">
              <div className="w-2/3 px-3 py-2 flex flex-col items-center justify-center text-center">
                <div className="flex items-center gap-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {labels.modeScoreLabel ?? t(data.modeScore.labelKey)}
                  </p>
                  {labels.modeScoreTooltip && (
                    <InfoSheet iconSize={10}>{labels.modeScoreTooltip}</InfoSheet>
                  )}
                </div>
                <span
                  className={cn(
                    'text-6xl sm:text-7xl font-black tabular-nums tracking-tight',
                    scoreColorClass,
                  )}
                >
                  {modeScoreDisplay}
                </span>
              </div>

              <Hatching
                id="report-hero-score-divider"
                orientation="vertical"
                className="text-foreground/70"
              />

              <div className="w-1/3 px-2 py-2 flex flex-col items-center justify-center text-center">
                <div className="flex items-center gap-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {labels.upsScore}
                  </p>
                  <InfoSheet iconSize={10}>
                    {upsTooltipPrefix}
                    {labels.upsTooltip}
                  </InfoSheet>
                </div>
                <span
                  className={cn(
                    'nd-secondary-metric-value',
                    hasUpsScore ? 'text-foreground' : 'text-muted-foreground/50',
                  )}
                >
                  {upsScoreDisplay}
                </span>
              </div>
            </div>
          </div>
          <Hatching id="report-hero-score-hatch" className="mt-3 text-foreground/70" />
        </>
      )}
    </div>
  );
}
