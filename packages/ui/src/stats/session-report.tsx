/**
 * SessionReport - End of game report component.
 *
 * Rich, themed report inspired by Nordic design.
 * Shows progression, performance breakdown, scientific analysis.
 */

import { CaretDown, Flask, Pencil, Target, Timer } from '@phosphor-icons/react';
import { type ReactNode, useState } from 'react';
import { cn } from '../lib/utils';
import { InfoSheet } from '../primitives/info-sheet';
import { useTranslation } from 'react-i18next';

// =============================================================================
// Event Types (using proper GameEvent from logic)
// =============================================================================

import type { GameEvent } from '@neurodual/logic';

/** Re-export GameEvent as JournalEvent for backward compatibility */
export type JournalEvent = GameEvent;

// =============================================================================
// Types
// =============================================================================

export interface ModalityStats {
  readonly hits: number;
  readonly misses: number;
  readonly falseAlarms: number;
  readonly correctRejections: number;
  /** Hit Rate: hits / (hits + misses) - targets only */
  readonly accuracy: number;
  /** Overall Accuracy: Balanced (hitRate + crRate) / 2 - anti-gaming */
  readonly overallAccuracy: number;
  readonly hitRate: number;
  readonly falseAlarmRate: number;
  readonly dPrime: number;
  readonly avgReactionTime: number | null;
  readonly focusStability?: number;
}

/** Game mode/generator type */
export type GameMode =
  | 'DualTempo'
  | 'DualPlace'
  | 'DualMemo'
  | 'DualnbackClassic'
  | 'BrainWorkshop'
  | 'Libre'
  | 'Journey';

export interface SessionReportData {
  readonly nLevel: number;
  readonly nextLevel: number;
  readonly dPrime: number;
  readonly formattedDPrime: string;
  /**
   * Primary metric displayed in the header/scientific cards.
   * Default: 'dprime' (legacy behavior).
   */
  readonly primaryMetric?: 'dprime' | 'accuracy';
  readonly duration: string;
  readonly totalTrials: number;
  readonly passed: boolean;
  readonly activeModalities: string[];
  readonly modalityStats: Record<string, ModalityStats>;
  readonly isAutoMode?: boolean;
  /** Game mode (generator) used for this session */
  readonly gameMode?: GameMode;
}

export interface SessionReportLabels {
  readonly levelUp: string;
  readonly levelUpDesc: string;
  readonly levelDown: string;
  readonly levelDownDesc: string;
  readonly levelSame: string;
  readonly levelSameDesc: string;
  readonly sessionPerformance: string;
  readonly hits: string;
  readonly misses: string;
  readonly falseAlarms: string;
  readonly accuracy: string;
  readonly scientificAnalysis: string;
  readonly reactionTime: string;
  readonly focusStability: string;
  readonly nextSession: string;
  readonly playAgain: string;
  readonly backToHome: string;
  readonly position: string;
  readonly audio: string;
  readonly color: string;
  // Mode labels
  readonly modeDualTempo?: string;
  readonly modeDualPlace?: string;
  readonly modeDualMemo?: string;
  readonly modeDualnbackClassic?: string;
  readonly modeBrainWorkshop?: string;
  readonly modeLibre?: string;
  readonly modeJourney?: string;
  // Accuracy tooltips by mode
  readonly accuracyTooltipDefault?: string;
  readonly accuracyTooltipDualnbackClassic?: string;
  readonly accuracyTooltipBrainWorkshop?: string;
  // Journal labels
  readonly details?: string;
  readonly sessionJournal?: string;
  // Interactive replay (correction)
  readonly correct?: string;
}

export interface SessionReportProps {
  readonly data: SessionReportData;
  readonly labels: SessionReportLabels;
  readonly onPlayAgain: () => void;
  readonly onBackToHome: () => void;
  /** Callback for interactive replay (correction mode) - only shown for Tempo sessions */
  readonly onCorrect?: () => void;
  readonly className?: string;
  /** Optional events for displaying the session journal */
  readonly events?: readonly JournalEvent[];
}

// =============================================================================
// Constants
// =============================================================================

const MODALITY_COLORS: Record<string, string> = {
  position: 'text-visual',
  audio: 'text-audio',
  color: 'text-pink-500',
};

const MODALITY_BG: Record<string, string> = {
  position: 'bg-visual/10',
  audio: 'bg-audio/10',
  color: 'bg-pink-500/10',
};

// Event journal styling
const EVENT_COLORS: Record<string, string> = {
  SESSION_STARTED: 'bg-green-500',
  SESSION_ENDED: 'bg-red-500',
  TRIAL_PRESENTED: 'bg-yellow-500',
  USER_RESPONDED: 'bg-purple-500',
  INPUT_MISFIRED: 'bg-orange-500',
  FOCUS_LOST: 'bg-red-400',
  FOCUS_REGAINED: 'bg-green-400',
  USER_STATE_DECLARED: 'bg-blue-500',
};

const EVENT_ICONS: Record<string, string> = {
  SESSION_STARTED: '▶',
  SESSION_ENDED: '⏹',
  TRIAL_PRESENTED: '👁',
  USER_RESPONDED: '👆',
  INPUT_MISFIRED: '✗',
  FOCUS_LOST: '⚠',
  FOCUS_REGAINED: '✓',
  USER_STATE_DECLARED: '😊',
};

// =============================================================================
// Helpers
// =============================================================================

function getProgressionInfo(
  data: SessionReportData,
  labels: SessionReportLabels,
): { title: string; subtitle: string; passed: boolean } {
  if (data.nextLevel > data.nLevel) {
    return { title: labels.levelUp, subtitle: labels.levelUpDesc, passed: true };
  }
  if (data.nextLevel < data.nLevel) {
    return { title: labels.levelDown, subtitle: labels.levelDownDesc, passed: false };
  }
  return { title: labels.levelSame, subtitle: labels.levelSameDesc, passed: data.passed };
}

function getModalityLabel(modality: string, labels: SessionReportLabels): string {
  const map: Record<string, string> = {
    position: labels.position,
    audio: labels.audio,
    color: labels.color,
  };
  return map[modality] ?? modality;
}

function getModeLabel(mode: GameMode | undefined, labels: SessionReportLabels): string {
  if (!mode) return '';
  const map: Record<GameMode, string | undefined> = {
    DualTempo: labels.modeDualTempo,
    DualPlace: labels.modeDualPlace,
    DualMemo: labels.modeDualMemo,
    DualnbackClassic: labels.modeDualnbackClassic,
    BrainWorkshop: labels.modeBrainWorkshop,
    Libre: labels.modeLibre,
    Journey: labels.modeJourney,
  };
  return map[mode] ?? mode;
}

/**
 * Get the appropriate accuracy value based on game mode.
 * - Dual N-Back Classic: uses overallAccuracy (includes FA as errors) - need ≥90% to pass
 * - BrainWorkshop: uses overallAccuracy (penalty score %) - need ≥80% to pass
 * - Others: uses accuracy (hit rate on targets)
 */
function getDisplayAccuracy(stats: ModalityStats, mode: GameMode | undefined): number {
  // Both Dual N-Back Classic and BrainWorkshop use overallAccuracy (which equals penalty score %)
  if (mode === 'DualnbackClassic' || mode === 'BrainWorkshop') {
    return stats.overallAccuracy;
  }
  return stats.accuracy;
}

function getAccuracyTooltip(mode: GameMode | undefined, labels: SessionReportLabels): string {
  if (mode === 'DualnbackClassic' && labels.accuracyTooltipDualnbackClassic) {
    return labels.accuracyTooltipDualnbackClassic;
  }
  if (mode === 'BrainWorkshop' && labels.accuracyTooltipBrainWorkshop) {
    return labels.accuracyTooltipBrainWorkshop;
  }
  return labels.accuracyTooltipDefault ?? '';
}

function getModalityColor(modality: string): string {
  return MODALITY_COLORS[modality] ?? 'text-muted-foreground';
}

function getModalityBg(modality: string): string {
  return MODALITY_BG[modality] ?? 'bg-secondary';
}

function getEventSummary(event: JournalEvent): string {
  switch (event.type) {
    case 'SESSION_STARTED':
      return `N=${event.nLevel} | ${event.context?.timeOfDay ?? ''}`;
    case 'SESSION_ENDED':
      return event.reason ?? '';
    case 'TRIAL_PRESENTED': {
      const trial = event.trial;
      if (!trial) return '';
      const targets = [];
      if (trial.isPositionTarget) targets.push('POS');
      if (trial.isSoundTarget) targets.push('SON');
      const targetStr = targets.length > 0 ? `[${targets.join('+')}]` : '[--]';
      return `#${trial.index} ${targetStr}`;
    }
    case 'USER_RESPONDED':
      return `${event.modality} RT=${event.reactionTimeMs?.toFixed(0) ?? '-'}ms`;
    case 'INPUT_MISFIRED':
      return `trial #${event.trialIndex ?? '-'}`;
    case 'FOCUS_LOST':
      return `trial #${event.trialIndex ?? '-'}`;
    case 'FOCUS_REGAINED':
      return `${((event.lostDurationMs ?? 0) / 1000).toFixed(1)}s away`;
    default:
      return '';
  }
}

// =============================================================================
// Sub-components
// =============================================================================

function SuccessIcon(): ReactNode {
  return (
    <svg
      className="w-8 h-8"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2.5"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function RetryIcon(): ReactNode {
  return (
    <svg
      className="w-8 h-8"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2.5"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
      />
    </svg>
  );
}

function CheckIcon(): ReactNode {
  return (
    <svg
      className="w-3 h-3"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="3"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function MinusIcon(): ReactNode {
  return (
    <svg
      className="w-3 h-3"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="3"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 12H6" />
    </svg>
  );
}

function AlertIcon(): ReactNode {
  return (
    <svg
      className="w-3 h-3"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="3"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
      />
    </svg>
  );
}

interface ModalityBreakdownProps {
  readonly modality: string;
  readonly stats: ModalityStats;
  readonly labels: SessionReportLabels;
}

function ModalityBreakdown({ modality, stats, labels }: ModalityBreakdownProps): ReactNode {
  const colorClass = getModalityColor(modality);
  const label = getModalityLabel(modality, labels);

  return (
    <div className="p-4 bg-surface rounded-xl border border-border space-y-2">
      <span
        className={cn(colorClass, 'font-bold text-xs uppercase tracking-wide block text-center')}
      >
        {label}
      </span>
      <div className="space-y-1 text-xs">
        <div className="flex justify-between items-center">
          <span className="text-emerald-600 flex items-center gap-1">
            <CheckIcon />
            {labels.hits}
          </span>
          <span className="font-bold text-foreground">{stats.hits}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-orange-600 flex items-center gap-1">
            <MinusIcon />
            {labels.misses}
          </span>
          <span className="font-bold text-foreground">{stats.misses}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-pink-600 flex items-center gap-1">
            <AlertIcon />
            {labels.falseAlarms}
          </span>
          <span className="font-bold text-foreground">{stats.falseAlarms}</span>
        </div>
      </div>
    </div>
  );
}

interface ScientificCardProps {
  readonly modality: string;
  readonly stats: ModalityStats;
  readonly labels: SessionReportLabels;
  readonly primaryMetric: 'dprime' | 'accuracy';
}

function ScientificCard({
  modality,
  stats,
  labels,
  primaryMetric,
}: ScientificCardProps): ReactNode {
  const colorClass = getModalityColor(modality);
  const bgClass = getModalityBg(modality);
  const label = getModalityLabel(modality, labels);

  return (
    <div className="p-6 bg-surface rounded-2xl border border-border flex flex-col items-center transition-transform hover:scale-[1.02]">
      <span className={cn(colorClass, 'font-bold text-xs uppercase tracking-widest mb-3')}>
        {label}
      </span>
      {primaryMetric === 'accuracy' ? (
        <>
          <span className="text-4xl font-bold text-foreground tracking-tighter">
            {Math.round(stats.overallAccuracy)}%
          </span>
          <span className="text-xs text-muted-foreground mt-1">{labels.accuracy}</span>
        </>
      ) : (
        <>
          <span className="text-4xl font-bold text-foreground tracking-tighter">
            {stats.dPrime.toFixed(1)}
          </span>
          <span className="text-xs text-muted-foreground mt-1">d-prime</span>
        </>
      )}

      {stats.avgReactionTime !== null && (
        <div className="mt-3 flex items-center gap-1.5 px-2 py-1 bg-secondary rounded-lg border border-border">
          <Timer className="w-3 h-3 text-muted-foreground" />
          <span className="text-xs font-mono font-bold text-muted-foreground">
            {Math.round(stats.avgReactionTime)}ms
          </span>
        </div>
      )}

      {stats.focusStability !== undefined && (
        <div
          className={cn(
            'mt-2 flex items-center gap-1.5 px-2 py-1 rounded-lg border',
            bgClass,
            'border-border',
          )}
        >
          <Target className={cn('w-3 h-3', colorClass)} />
          <span className={cn('text-xs font-bold', colorClass)}>
            {labels.focusStability}: {Math.round(stats.focusStability)}%
          </span>
        </div>
      )}
    </div>
  );
}

interface EventJournalProps {
  readonly events: readonly JournalEvent[];
  readonly label: string;
}

function EventJournal({ events, label }: EventJournalProps): ReactNode {
  if (events.length === 0) return null;

  const startTime = events[0]?.timestamp ?? 0;

  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground mb-2">{label}</div>
      <div className="relative pl-6 border-l-2 border-border max-h-64 overflow-y-auto">
        {events.map((event) => {
          const relativeTime = event.timestamp - startTime;
          const color = EVENT_COLORS[event.type] ?? 'bg-gray-500';
          const icon = EVENT_ICONS[event.type] ?? '•';

          return (
            <div
              key={event.id}
              className="relative mb-2 pb-2 border-b border-border/30 last:border-0"
            >
              {/* Dot on timeline */}
              <div
                className={cn(
                  'absolute -left-[17px] w-3 h-3 rounded-full flex items-center justify-center text-micro',
                  color,
                )}
              >
                <span className="text-white">{icon}</span>
              </div>

              {/* Time + Event */}
              <div className="flex items-center gap-2 text-3xs">
                <span className="text-muted-foreground font-mono w-12">
                  +{(relativeTime / 1000).toFixed(1)}s
                </span>
                <span className={cn('px-1.5 py-0.5 rounded text-white font-medium', color)}>
                  {event.type.replace(/_/g, ' ')}
                </span>
              </div>

              {/* Summary */}
              <div className="text-3xs text-muted-foreground mt-0.5 pl-14 font-mono">
                {getEventSummary(event)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =============================================================================
// SessionReport
// =============================================================================

export function SessionReport({
  data,
  labels,
  onPlayAgain,
  onBackToHome,
  onCorrect,
  className = '',
  events,
}: SessionReportProps): ReactNode {
  const { t } = useTranslation();
  const progression = getProgressionInfo(data, labels);
  const isMultiModal = data.activeModalities.length > 1;
  const [showDetails, setShowDetails] = useState(false);
  const primaryMetric = data.primaryMetric ?? 'dprime';

  return (
    <div className={cn('max-w-md mx-auto flex flex-col gap-8 items-center w-full', className)}>
      {/* Header with Icon */}
      <div className="text-center space-y-3">
        {/* Mode Badge */}
        {data.gameMode && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-secondary rounded-full border border-border mb-2">
            <Flask size={12} className="text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">
              {getModeLabel(data.gameMode, labels)}
            </span>
          </div>
        )}

        <div
          className={cn(
            'inline-flex items-center justify-center w-16 h-16 rounded-full mb-2',
            progression.passed
              ? 'bg-emerald-100 text-emerald-700'
              : 'bg-orange-100 text-orange-700',
          )}
        >
          {progression.passed ? <SuccessIcon /> : <RetryIcon />}
        </div>
        <h2 className="text-3xl font-bold text-foreground tracking-tight">{progression.title}</h2>
        <p className="text-muted-foreground">{progression.subtitle}</p>

        {/* Global primary metric indicator */}
        <div className="flex items-center justify-center gap-2 pt-2">
          <span className="text-sm text-muted-foreground">
            {primaryMetric === 'accuracy'
              ? t('stats.sessionReport.overallAccuracy', 'Overall accuracy:')
              : t('stats.sessionReport.globalDPrime', "Global d':")}
          </span>
          <span
            className={cn('text-lg font-bold', data.passed ? 'text-emerald-600' : 'text-amber-600')}
          >
            {data.formattedDPrime}
          </span>
        </div>
      </div>

      {/* Performance Breakdown */}
      <div className="w-full space-y-3">
        <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider text-center">
          {labels.sessionPerformance}
        </h3>

        <div
          className={cn(
            'grid gap-3',
            data.activeModalities.length === 1
              ? 'grid-cols-1'
              : data.activeModalities.length === 2
                ? 'grid-cols-2'
                : 'grid-cols-3',
          )}
        >
          {data.activeModalities.map((modality) => {
            const stats = data.modalityStats[modality];
            if (!stats) return null;
            return (
              <ModalityBreakdown key={modality} modality={modality} stats={stats} labels={labels} />
            );
          })}
        </div>
      </div>

      {/* Accuracy Rates */}
      <div className="w-full p-4 bg-secondary rounded-xl border border-border">
        <div
          className={cn('flex items-center', isMultiModal ? 'justify-around' : 'justify-center')}
        >
          {data.activeModalities.map((modality, index) => {
            const stats = data.modalityStats[modality];
            if (!stats) return null;

            const colorClass = getModalityColor(modality);
            const label = getModalityLabel(modality, labels);
            const displayAccuracy = getDisplayAccuracy(stats, data.gameMode);
            const accuracyTooltip = getAccuracyTooltip(data.gameMode, labels);

            return (
              <div key={modality} className="flex items-center">
                {index > 0 && <div className="h-12 w-px bg-border mx-4" />}
                <div className="text-center">
                  <span
                    className={cn(
                      colorClass,
                      'font-bold text-xs uppercase tracking-wide block mb-1',
                    )}
                  >
                    {label}
                  </span>
                  <span className="text-2xl font-bold text-foreground">{displayAccuracy}%</span>
                  <span className="text-3xs text-muted-foreground mt-0.5 flex items-center justify-center gap-1">
                    {labels.accuracy}
                    {accuracyTooltip && <InfoSheet iconSize={10}>{accuracyTooltip}</InfoSheet>}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Scientific Analysis */}
      <div className="w-full space-y-3">
        <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider text-center">
          {labels.scientificAnalysis}
        </h3>

        <div
          className={cn(
            'grid gap-4 w-full',
            data.activeModalities.length === 1 ? 'grid-cols-1' : 'grid-cols-2',
          )}
        >
          {data.activeModalities.map((modality) => {
            const stats = data.modalityStats[modality];
            if (!stats) return null;
            return (
              <ScientificCard
                key={modality}
                modality={modality}
                stats={stats}
                labels={labels}
                primaryMetric={primaryMetric}
              />
            );
          })}
        </div>
      </div>

      {/* Next Session Indicator */}
      <div className="w-full p-5 bg-secondary rounded-xl flex justify-between items-center border border-border">
        <span className="text-muted-foreground text-sm font-medium">{labels.nextSession}</span>
        <div className="flex items-center gap-2">
          {data.isAutoMode && (
            <span className="text-3xs font-bold bg-visual/10 text-visual px-2 py-0.5 rounded uppercase tracking-widest">
              {t('common.auto')}
            </span>
          )}
          <span className="text-xl font-bold text-foreground">N-{data.nextLevel}</span>
        </div>
      </div>

      {/* Details Dropdown (Session Journal) */}
      {events && events.length > 0 && (
        <div className="w-full">
          <button
            type="button"
            onClick={() => setShowDetails(!showDetails)}
            className="w-full flex items-center justify-between p-3 bg-surface rounded-xl border border-border hover:bg-surface/80 transition-colors"
          >
            <span className="text-sm font-medium text-muted-foreground">
              {labels.details ?? t('common.details', 'Details')}
            </span>
            <CaretDown
              className={cn(
                'w-4 h-4 text-muted-foreground transition-transform duration-200',
                showDetails && 'rotate-180',
              )}
            />
          </button>

          {showDetails && (
            <div className="mt-2 p-3 bg-surface rounded-xl border border-border">
              <EventJournal
                events={events}
                label={labels.sessionJournal ?? `${events.length} événements`}
              />
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col gap-3 w-full">
        <button
          type="button"
          onClick={onPlayAgain}
          className="w-full py-3 px-4 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl transition-colors"
        >
          {labels.playAgain}
        </button>
        {/* Correction button - only for Tempo sessions */}
        {onCorrect && (
          <button
            type="button"
            onClick={onCorrect}
            className="w-full py-3 px-4 bg-amber-100 hover:bg-amber-200 text-amber-800 font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            <Pencil className="w-4 h-4" />
            {labels.correct ?? t('stats.sessionReport.correct', 'Correct')}
          </button>
        )}
        <button
          type="button"
          onClick={onBackToHome}
          className="w-full py-3 px-4 bg-secondary hover:bg-secondary/80 text-foreground font-medium rounded-xl transition-colors"
        >
          {labels.backToHome}
        </button>
      </div>
    </div>
  );
}
