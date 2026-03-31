/**
 * ReportConfidenceBreakdown - Confidence score breakdown for Tempo modes
 *
 * Shows the 5 components that make up the confidence score.
 * Part of the standard report, not a debug section.
 */

import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { SubCard } from '../../primitives/card';
import { InfoSheet } from '../../primitives/info-sheet';
import type { TempoConfidenceDebug } from '@neurodual/logic';
import type { ReportLabels } from './types';
import { useTranslation } from 'react-i18next';

// =============================================================================
// Types
// =============================================================================

export interface ReportConfidenceBreakdownProps {
  readonly confidenceDebug: TempoConfidenceDebug;
  readonly labels: ReportLabels;
}

// =============================================================================
// Helpers
// =============================================================================

function getScoreColor(score: number): string {
  if (score >= 80) return 'text-green-500';
  if (score >= 60) return 'text-amber-500';
  if (score >= 40) return 'text-orange-500';
  return 'text-red-500';
}

function getScoreBg(score: number): string {
  if (score >= 80) return 'bg-green-500/10';
  if (score >= 60) return 'bg-amber-500/10';
  if (score >= 40) return 'bg-orange-500/10';
  return 'bg-red-500/10';
}

function formatWeight(weight: number): string {
  if (!Number.isFinite(weight) || weight <= 0) return '0';
  const s = weight.toFixed(2);
  return s.replace(/\.00$/, '').replace(/(\.[0-9])0$/, '$1');
}

// =============================================================================
// Component
// =============================================================================

export function ReportConfidenceBreakdown({
  confidenceDebug,
  labels,
}: ReportConfidenceBreakdownProps): ReactNode {
  const { t } = useTranslation();
  const { score, hasEnoughData, components, rawData } = confidenceDebug;
  const weights = confidenceDebug.weights;
  const minResponses = 10;
  const notComputedLabel = labels.confidenceNotComputed
    ? labels.confidenceNotComputed
        .replace('{count}', String(rawData.totalResponses))
        .replace('{min}', String(minResponses))
    : `Not computed for this session (${rawData.totalResponses} responses, min ${minResponses}).`;

  const noActionTargets = rawData.targetTrialsNoAction ?? null;
  const targetTrials = rawData.targetTrials ?? null;
  const maxNoActionStreak = rawData.targetTrialsNoActionMaxStreak ?? null;

  const displayScore: number | null = hasEnoughData ? score : null;
  const scoreText = displayScore === null ? '—' : String(displayScore);

  // Component definitions with labels and weights
  const componentDefs = [
    {
      key: 'timingDiscipline',
      label:
        labels.confidenceTiming ?? t('stats.unifiedReport.confidence.components.timing', 'Timing'),
      score: components.timingDiscipline,
      weight: weights.timingDiscipline,
      detail: `${rawData.responsesDuringStimulus}/${rawData.totalResponses}`,
      help: t(
        'stats.unifiedReport.confidence.components.timingHelp',
        'Share of responses made during stimulus display (lower = better). Can be disabled (x0) on some sessions.',
      ),
    },
    {
      key: 'rtStability',
      label:
        labels.confidenceRTStability ??
        t('stats.unifiedReport.confidence.components.rtConsistency', 'RT consistency'),
      score: components.rtStability,
      weight: weights.rtStability,
      detail: rawData.rtMean !== null ? `${Math.round(rawData.rtMean)}ms` : '-',
      help: t(
        'stats.unifiedReport.confidence.components.rtConsistencyHelp',
        'Stability of reaction times (consistency). Measured on the first action of each trial (second responses in double-match are not mixed).',
      ),
    },
    {
      key: 'pressStability',
      label:
        rawData.pressStabilityKind === 'inputControl'
          ? (labels.confidencePressStability ??
            t('stats.unifiedReport.confidence.components.inputControl', 'Input control'))
          : (labels.confidencePressStability ??
            t('stats.unifiedReport.confidence.components.pressStability', 'Press stability')),
      score: components.pressStability,
      weight: weights.pressStability,
      detail:
        rawData.pressStabilityKind === 'inputControl'
          ? `${(rawData.misfireCount ?? 0) + (rawData.duplicateCount ?? 0)} noise`
          : rawData.pressMean !== null
            ? `${Math.round(rawData.pressMean)}ms`
            : '-',
      help:
        rawData.pressStabilityKind === 'inputControl'
          ? t(
              'stats.unifiedReport.confidence.components.inputControlHelp',
              'Input quality (touch/mouse): penalizes misfires and accidental double taps.',
            )
          : t(
              'stats.unifiedReport.confidence.components.pressStabilityHelp',
              'Stability of press duration (keyboard/controller). On touch/mouse it can be disabled (x0) because it is too noisy.',
            ),
    },
    {
      key: 'errorAwareness',
      label:
        labels.confidenceErrorAwareness ??
        t('stats.unifiedReport.confidence.components.errorAwareness', 'Error awareness'),
      score: components.errorAwareness,
      weight: weights.errorAwareness,
      detail:
        rawData.errorAwarenessKind === 'inhibition'
          ? rawData.falseAlarmFraction !== undefined
            ? `FA ${(rawData.falseAlarmFraction * 100).toFixed(0)}%`
            : '-'
          : `${rawData.pesErrorPairs} pairs`,
      help:
        rawData.errorAwarenessKind === 'inhibition'
          ? t(
              'stats.unifiedReport.confidence.components.inhibitionHelp',
              'Inhibition: the fewer non-target presses (false alarms), the higher the score.',
            )
          : t(
              'stats.unifiedReport.confidence.components.pesHelp',
              'After an error: slowing down (PES) and recovery (accuracy).',
            ),
    },
    {
      key: 'focusScore',
      label:
        labels.confidenceFocus ?? t('stats.unifiedReport.confidence.components.focus', 'Focus'),
      score: components.focusScore,
      weight: weights.focusScore,
      detail:
        rawData.focusLostCount && rawData.focusLostCount > 0
          ? `${rawData.lapseCount} lapses, ${rawData.focusLostCount} interruptions`
          : `${rawData.lapseCount} lapses`,
      help: t(
        'stats.unifiedReport.confidence.components.focusHelp',
        'Micro-lapses (very slow actions) + interruptions (leaving the app / losing focus).',
      ),
    },
  ];

  return (
    <div className="w-full space-y-3">
      <div className="flex items-center justify-center gap-2">
        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest text-center">
          {labels.confidenceBreakdown ??
            t('stats.unifiedReport.confidence.title', 'Confidence analysis')}
        </h3>
        <InfoSheet iconSize={10}>
          <div className="space-y-2">
            {!hasEnoughData && <p className="font-medium text-foreground">{notComputedLabel}</p>}
            <p>{t('stats.report.confidence.behavioralScoreDesc')}</p>
          </div>
        </InfoSheet>
      </div>

      {/* Main score */}
      <div className="flex items-center justify-center gap-3">
        <div
          className={cn(
            'px-4 py-2 rounded-xl font-bold text-2xl',
            displayScore === null
              ? 'bg-muted/60 text-muted-foreground'
              : cn(getScoreBg(score), getScoreColor(score)),
          )}
        >
          {scoreText}
          {displayScore !== null && <span className="text-base opacity-70">/100</span>}
        </div>
      </div>

      {/* Warning if not enough data */}
      {!hasEnoughData && (
        <p className="text-center text-xs text-muted-foreground italic">
          {labels.confidenceInsufficientData ??
            t(
              'stats.unifiedReport.confidence.insufficientData',
              `Insufficient data (${rawData.totalResponses} responses, min 10)`,
            )}
        </p>
      )}

      {/* No-interaction diagnostic */}
      {hasEnoughData &&
        noActionTargets !== null &&
        targetTrials !== null &&
        targetTrials > 0 &&
        noActionTargets > 0 && (
          <p className="text-center text-3xs text-muted-foreground">
            {t('stats.unifiedReport.confidence.noActionOnTargets', 'No action on target trials')}:{' '}
            {noActionTargets}/{targetTrials}
            {maxNoActionStreak !== null && maxNoActionStreak > 1
              ? ` (streak max ${maxNoActionStreak})`
              : ''}
          </p>
        )}

      {/* Components grid */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {componentDefs.map((comp) => {
          const active = hasEnoughData && comp.weight > 0;
          return (
            <SubCard key={comp.key} className="p-2.5 flex flex-col gap-1.5">
              {/* Header: title (with weight inline) + info icon */}
              <div className="flex items-start gap-1">
                <span className="flex-1 text-3xs text-muted-foreground uppercase tracking-wide leading-snug min-w-0">
                  {comp.label}{' '}
                  <span className="text-muted-foreground/50 tabular-nums normal-case">
                    ×{formatWeight(comp.weight)}
                  </span>
                </span>
                <span className="shrink-0 -mt-0.5">
                  <InfoSheet iconSize={10}>
                    <div className="space-y-2">
                      <p className="text-sm">{comp.help}</p>
                      {comp.weight <= 0 && (
                        <p className="text-sm text-muted-foreground">
                          {t('stats.report.confidence.notIncluded')}
                        </p>
                      )}
                    </div>
                  </InfoSheet>
                </span>
              </div>

              {/* Score + detail — pushed to bottom so bars align across cards */}
              <div className="flex items-baseline justify-between mt-auto">
                {active ? (
                  <>
                    <span className={cn('text-lg font-bold font-mono', getScoreColor(comp.score))}>
                      {comp.score}
                    </span>
                    <span className="text-3xs text-muted-foreground font-mono text-right">
                      {comp.detail}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-lg font-bold font-mono text-muted-foreground">—</span>
                    <span className="text-3xs text-muted-foreground/60 font-mono">—</span>
                  </>
                )}
              </div>

              {/* Progress bar */}
              <div className="h-1 bg-muted rounded-full overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    active ? getScoreBg(comp.score) : 'bg-muted-foreground/25',
                  )}
                  style={{ width: `${active ? comp.score : 0}%` }}
                />
              </div>
            </SubCard>
          );
        })}
      </div>
    </div>
  );
}
