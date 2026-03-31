/**
 * JourneySessionReport - End of session report for journey mode
 *
 * Focused report showing:
 * - Stage info (mode, stage number, level)
 * - Validation status and score
 * - Detailed stats per modality
 * - Progress toward stage completion
 * - Navigation actions
 */

import { ArrowRight, Check, House, ArrowsClockwise, X } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { cn } from '../lib/utils';

// =============================================================================
// Types
// =============================================================================

export interface ModalityDetailedStats {
  readonly hits: number;
  readonly misses: number;
  readonly falseAlarms: number;
  readonly correctRejections: number;
  readonly accuracy: number; // percentage 0-100
}

export interface JourneySessionReportData {
  /** Stage mode: 'catch', 'place', or 'memo' */
  readonly mode: 'catch' | 'place' | 'memo';
  /** Stage ID (1-30) */
  readonly stageId: number;
  /** N-level for this stage */
  readonly nLevel: number;
  /** Global score as percentage (0-100) */
  readonly scorePercent: number;
  /** Detailed stats by modality */
  readonly modalityStats: {
    readonly position?: ModalityDetailedStats;
    readonly audio?: ModalityDetailedStats;
  };
  /** Whether the session counts as validating (>= 80%) */
  readonly isValidating: boolean;
  /** Current validating sessions count for this stage */
  readonly validatingSessions: number;
  /** Total sessions required for validation */
  readonly sessionsRequired: number;
  /** Whether the stage was just completed */
  readonly stageCompleted: boolean;
  /** Next stage ID if unlocked */
  readonly nextStageUnlocked: number | null;
}

export interface JourneySessionReportLabels {
  readonly modeCatch: string;
  readonly modePlace: string;
  readonly modeMemo: string;
  readonly stage: string;
  readonly level: string;
  readonly sessionValidated: string;
  readonly sessionNotValidated: string;
  readonly score: string;
  readonly position: string;
  readonly audio: string;
  readonly progress: string;
  readonly stageCompleted: string;
  readonly stageUnlocked: string;
  readonly replay: string;
  readonly nextStage: string;
  readonly home: string;
  readonly minScore: string;
  // Detail labels
  readonly hits: string;
  readonly misses: string;
  readonly falseAlarms: string;
  readonly correctRejections: string;
}

export interface JourneySessionReportProps {
  readonly data: JourneySessionReportData;
  readonly labels: JourneySessionReportLabels;
  readonly onReplay: () => void;
  readonly onNextStage?: () => void;
  readonly onHome: () => void;
  readonly className?: string;
}

// =============================================================================
// Component
// =============================================================================

export function JourneySessionReport({
  data,
  labels,
  onReplay,
  onNextStage,
  onHome,
  className,
}: JourneySessionReportProps): ReactNode {
  const modeName =
    data.mode === 'catch'
      ? labels.modeCatch
      : data.mode === 'place'
        ? labels.modePlace
        : labels.modeMemo;
  const isComplete = data.stageCompleted;
  const showProgress = !isComplete && data.isValidating;

  // Action button: "Étape suivante" if completed and has next stage, otherwise "Rejouer"
  const showNextStageButton = isComplete && data.nextStageUnlocked && onNextStage;

  return (
    <div className={cn('max-w-md mx-auto flex flex-col gap-4 items-center w-full', className)}>
      {/* Main Card */}
      <div className="w-full bg-surface rounded-2xl border border-border shadow-sm overflow-hidden">
        {/* Header - Mode + Stage + Level */}
        <div className="px-4 py-3 bg-secondary/50 border-b border-border">
          <div className="flex items-center justify-center gap-2">
            <span className="text-sm font-semibold text-foreground">{modeName}</span>
            <span className="text-muted-foreground">•</span>
            <span className="text-sm text-muted-foreground">
              {labels.stage} {data.stageId}
            </span>
            <span className="text-muted-foreground">•</span>
            <span className="text-sm font-mono font-bold text-primary">N-{data.nLevel}</span>
          </div>
        </div>

        {/* Validation Status + Score */}
        <div className="p-6 text-center space-y-4">
          <div className="flex flex-col items-center gap-3">
            <div
              className={cn(
                'inline-flex items-center justify-center w-14 h-14 rounded-full',
                data.isValidating
                  ? 'bg-emerald-100 text-emerald-600'
                  : 'bg-orange-100 text-orange-600',
              )}
            >
              {data.isValidating ? <Check className="w-7 h-7" /> : <X className="w-7 h-7" />}
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">
                {data.isValidating ? labels.sessionValidated : labels.sessionNotValidated}
              </h2>
              {!data.isValidating && (
                <p className="text-xs text-muted-foreground mt-1">{labels.minScore}</p>
              )}
            </div>
          </div>

          {/* Global Score */}
          <div className="pt-2">
            <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
              {labels.score}
            </div>
            <div
              className={cn(
                'text-4xl font-bold tracking-tight',
                data.isValidating ? 'text-emerald-600' : 'text-orange-600',
              )}
            >
              {data.scorePercent}%
            </div>
          </div>
        </div>

        {/* Modality Stats */}
        <div className="px-4 pb-4 space-y-3">
          {data.modalityStats.position && (
            <ModalityCard
              label={labels.position}
              stats={data.modalityStats.position}
              labels={labels}
              colorClass="text-visual"
              bgClass="bg-visual/5"
            />
          )}
          {data.modalityStats.audio && (
            <ModalityCard
              label={labels.audio}
              stats={data.modalityStats.audio}
              labels={labels}
              colorClass="text-audio"
              bgClass="bg-audio/5"
            />
          )}
        </div>

        {/* Progress / Completion */}
        <div className="px-4 pb-4">
          <div className="p-3 bg-secondary/50 rounded-xl">
            {isComplete ? (
              <div className="text-center space-y-1">
                <div className="text-base font-bold text-emerald-600">{labels.stageCompleted}</div>
                {data.nextStageUnlocked && (
                  <div className="text-xs text-muted-foreground">
                    {labels.stageUnlocked.replace('{{stage}}', String(data.nextStageUnlocked))}
                  </div>
                )}
              </div>
            ) : showProgress ? (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{labels.progress}</span>
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    {Array.from({ length: data.sessionsRequired }).map((_, i) => (
                      <div
                        key={i}
                        className={cn(
                          'w-2.5 h-2.5 rounded-full',
                          i < data.validatingSessions ? 'bg-emerald-500' : 'bg-border',
                        )}
                      />
                    ))}
                  </div>
                  <span className="text-sm font-bold text-foreground">
                    {data.validatingSessions}/{data.sessionsRequired}
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-center text-xs text-muted-foreground">{labels.minScore}</div>
            )}
          </div>
        </div>
      </div>

      {/* Actions - Home left, Action right */}
      <div className="flex gap-3 w-full">
        <button
          type="button"
          onClick={onHome}
          className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-surface hover:bg-surface/80 text-foreground font-medium rounded-xl border border-border transition-colors"
        >
          <House className="w-4 h-4" />
          {labels.home}
        </button>
        {showNextStageButton ? (
          <button
            type="button"
            onClick={onNextStage}
            className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl transition-colors"
          >
            {labels.nextStage}
            <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onReplay}
            className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl transition-colors"
          >
            <ArrowsClockwise className="w-4 h-4" />
            {labels.replay}
          </button>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

interface ModalityCardProps {
  label: string;
  stats: ModalityDetailedStats;
  labels: JourneySessionReportLabels;
  colorClass: string;
  bgClass: string;
}

function ModalityCard({ label, stats, labels, colorClass, bgClass }: ModalityCardProps): ReactNode {
  // For recall mode (Dual Mémo), false alarms and correct rejections are always 0
  // Only show them for signal detection mode (Dual Tempo)
  const isSignalDetection = stats.falseAlarms > 0 || stats.correctRejections > 0;

  return (
    <div className={cn('p-3 rounded-xl border border-border', bgClass)}>
      <div className="flex items-center justify-between mb-2">
        <span className={cn('text-xs font-bold uppercase tracking-wide', colorClass)}>{label}</span>
        <span className="text-lg font-bold text-foreground">{stats.accuracy}%</span>
      </div>
      {isSignalDetection ? (
        // Signal detection mode: show all 4 columns
        <div className="grid grid-cols-4 gap-2 text-center">
          <StatItem label={labels.hits} value={stats.hits} variant="success" />
          <StatItem label={labels.misses} value={stats.misses} variant="error" />
          <StatItem label={labels.falseAlarms} value={stats.falseAlarms} variant="warning" />
          <StatItem
            label={labels.correctRejections}
            value={stats.correctRejections}
            variant="muted"
          />
        </div>
      ) : (
        // Memo mode: only show hits and misses
        <div className="grid grid-cols-2 gap-4 text-center">
          <StatItem label={labels.hits} value={stats.hits} variant="success" />
          <StatItem label={labels.misses} value={stats.misses} variant="error" />
        </div>
      )}
    </div>
  );
}

interface StatItemProps {
  label: string;
  value: number;
  variant: 'success' | 'error' | 'warning' | 'muted';
}

function StatItem({ label, value, variant }: StatItemProps): ReactNode {
  const valueColors = {
    success: 'text-emerald-600',
    error: 'text-red-500',
    warning: 'text-orange-500',
    muted: 'text-muted-foreground',
  };

  return (
    <div className="flex flex-col">
      <span className={cn('text-sm font-bold', valueColors[variant])}>{value}</span>
      <span className="text-3xs text-muted-foreground leading-tight">{label}</span>
    </div>
  );
}
