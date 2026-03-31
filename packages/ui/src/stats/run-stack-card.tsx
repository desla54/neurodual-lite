/**
 * RunStackCard
 *
 * Displays a session with its correction runs as stacked tabs.
 * Shows P1 (original) and P2-P4 (corrections) with UPS score on each tab.
 * Design matches SessionCard for consistency.
 */

import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Pencil, Trash, Warning, X } from '@phosphor-icons/react';
import {
  getModeI18nKey,
  getModeScoringStrategy,
  type ReplayRun,
  type SessionEndReportModel,
} from '@neurodual/logic';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { cn } from '../lib/utils';

// =============================================================================
// Helpers
// =============================================================================

/**
 * Get color class for UPS score (higher is better)
 * Uses theme colors: woven-correct (green), woven-focus (amber), woven-incorrect (red)
 */
function getUpsColor(ups: number): string {
  if (!Number.isFinite(ups)) return 'text-muted-foreground/50';
  if (ups >= 80) return 'text-woven-correct';
  if (ups >= 50) return 'text-woven-focus';
  return 'text-woven-incorrect';
}

// =============================================================================
// Types
// =============================================================================

export interface RunStackCardLabels {
  readonly originalRun: string;
  readonly correctionRun: string;
  readonly deltaLabel: string;
  readonly inProgress: string;
  readonly completed: string;
  readonly delete: string;
}

export interface RunStackCardProps {
  /** Session ID */
  readonly sessionId: string;
  /** Original session UPS score (Run 0 = P1) */
  readonly originalUPS: number;
  /** Original session d' for reference */
  readonly originalDPrime: number;
  /** Original session accuracy [0,1] for mode-specific display */
  readonly originalAccuracy: number;
  /** Optional archived UPS accuracy percentage [0,100] */
  readonly originalUpsAccuracy?: number;
  /** Optional modality counts (for dualnback-classic error-rate computation) */
  readonly originalByModality?: Readonly<
    Record<string, { readonly hits: number; readonly misses: number; readonly falseAlarms: number }>
  >;
  /** Runs derived from this session (R1, R2, R3 = P2, P3, P4) */
  readonly runs: readonly ReplayRun[];
  /** UPS score for each run (keyed by run id) */
  readonly runScores: ReadonlyMap<string, number>;
  /** Projected report for each run (keyed by run id) */
  readonly runReports?: ReadonlyMap<string, SessionEndReportModel>;
  /** Labels for i18n */
  readonly labels: RunStackCardLabels;
  /** Callback when the active run's card is clicked (to open report) */
  readonly onOpenReport: (runId: string | null) => void;
  /** Callback when a run is deleted */
  readonly onDeleteRun: (runId: string | null) => void;
  /** Session metadata for display */
  readonly sessionMeta: {
    readonly nLevel: number;
    readonly mode: string;
    readonly createdAt: Date;
    readonly durationMs: number;
  };
  /** Run metadata (keyed by run id, null key = original) */
  readonly runMeta?: ReadonlyMap<
    string | null,
    {
      readonly createdAt: Date;
      readonly durationMs: number;
    }
  >;
  readonly className?: string;
  /** Language for date formatting */
  readonly language?: string;
  /** If true, show actual UPS score (beta feature) */
  readonly betaEnabled?: boolean;
}

// =============================================================================
// Helper Components
// =============================================================================

interface RunTabProps {
  readonly label: string;
  readonly score: number;
  readonly isActive: boolean;
  readonly isCorrection: boolean;
  readonly onClick: () => void;
  readonly betaEnabled?: boolean;
}

function RunTab({
  label,
  score,
  isActive,
  isCorrection,
  onClick,
  betaEnabled = false,
}: RunTabProps): ReactNode {
  const { t } = useTranslation();
  const displayScore = betaEnabled && Number.isFinite(score) ? Math.round(score) : '—';
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative flex flex-col items-center px-3 py-1.5 rounded-t-lg border border-b-0 transition-all min-w-[48px]',
        isActive
          ? 'bg-card border-border z-10 -mb-px'
          : 'bg-secondary/50 border-transparent hover:bg-secondary/80',
      )}
    >
      <div className="flex items-center gap-1">
        {isCorrection && <Pencil size={10} className="text-amber-600" weight="fill" />}
        <span className="text-xs font-bold">{label}</span>
      </div>
      <div className="flex flex-col items-center">
        <span
          className={cn(
            'text-sm font-bold tabular-nums',
            betaEnabled
              ? isActive
                ? 'text-foreground'
                : 'text-muted-foreground'
              : 'text-muted-foreground/50',
          )}
        >
          {displayScore}
        </span>
        <span className="text-2xs font-bold uppercase tracking-wider text-muted-foreground/60">
          {t('stats.ups.label', 'UPS · BETA')}
        </span>
      </div>
    </button>
  );
}

// =============================================================================
// Helper Functions
// =============================================================================

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function getTranslatedModeName(t: ReturnType<typeof useTranslation>['t'], modeId: string): string {
  const key = getModeI18nKey(modeId);
  return key ? t(key) : modeId;
}

function usesSdtDisplay(gameMode: string): boolean {
  return getModeScoringStrategy(gameMode) === 'sdt';
}

function usesDualnbackClassicDisplay(gameMode: string): boolean {
  return getModeScoringStrategy(gameMode) === 'dualnback-classic';
}

function computeDualnbackClassicErrorRatePercent(
  byModality: Readonly<
    Record<string, { readonly hits: number; readonly misses: number; readonly falseAlarms: number }>
  >,
  fallbackAccuracy: number,
): number {
  let hits = 0;
  let misses = 0;
  let falseAlarms = 0;

  for (const stats of Object.values(byModality)) {
    hits += stats.hits;
    misses += stats.misses;
    falseAlarms += stats.falseAlarms;
  }

  const totalRelevant = hits + misses + falseAlarms;
  if (totalRelevant > 0) {
    return Math.round(((misses + falseAlarms) / totalRelevant) * 100);
  }

  const normalizedAccuracy = Number.isFinite(fallbackAccuracy)
    ? Math.min(1, Math.max(0, fallbackAccuracy))
    : 0;
  return Math.round((1 - normalizedAccuracy) * 100);
}

function getDPrimeColor(dPrime: number): string {
  if (dPrime >= 2.0) return 'text-woven-correct';
  if (dPrime >= 1.0) return 'text-woven-focus';
  return 'text-woven-incorrect';
}

function getAccuracyColor(accuracy: number): string {
  if (accuracy >= 80) return 'text-woven-correct';
  if (accuracy >= 60) return 'text-woven-focus';
  return 'text-woven-incorrect';
}

function getErrorRateColor(errorRate: number): string {
  if (errorRate <= 15) return 'text-woven-correct';
  if (errorRate <= 30) return 'text-woven-focus';
  return 'text-woven-incorrect';
}

// =============================================================================
// Main Component
// =============================================================================

export function RunStackCard({
  sessionId: _sessionId,
  originalUPS,
  originalDPrime,
  originalAccuracy,
  originalUpsAccuracy,
  originalByModality,
  runs,
  runScores,
  runReports,
  labels,
  onOpenReport,
  onDeleteRun,
  sessionMeta,
  runMeta,
  className,
  language = 'fr',
  betaEnabled = false,
}: RunStackCardProps): ReactNode {
  const { t } = useTranslation();

  // Track which tab is active (null = original P1)
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  // Delete confirmation modal state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // If the active correction run was deleted (or runs list changed), fall back to original.
  useEffect(() => {
    if (activeRunId === null) return;
    if (runs.some((r) => r.id === activeRunId)) return;
    setActiveRunId(null);
  }, [activeRunId, runs]);

  // Get the active run's metadata
  const activeRunIndex = activeRunId === null ? -1 : runs.findIndex((r) => r.id === activeRunId);
  const activeRun = activeRunIndex >= 0 ? runs[activeRunIndex] : null;

  // Get metadata for active run
  const activeMeta = runMeta?.get(activeRunId) ?? {
    createdAt: activeRun?.createdAt ? new Date(activeRun.createdAt) : sessionMeta.createdAt,
    durationMs: sessionMeta.durationMs,
  };

  // Get score/report for active run
  const activeRunReport = activeRunId === null ? null : (runReports?.get(activeRunId) ?? null);
  const activeScore =
    activeRunId === null ? originalUPS : (runScores.get(activeRunId) ?? Number.NaN);

  // Determine N-level for display
  const displayNLevel = sessionMeta.nLevel;
  const modeDisplay = getTranslatedModeName(t, sessionMeta.mode);
  const fallbackAccuracy =
    typeof originalUpsAccuracy === 'number' ? originalUpsAccuracy / 100 : originalAccuracy;
  const dualnbackErrorRatePercent = computeDualnbackClassicErrorRatePercent(
    originalByModality ?? {},
    fallbackAccuracy,
  );

  const modeScoreDisplay = (() => {
    // Loading state for correction tabs (report fetch still in progress)
    if (activeRunId !== null && !activeRunReport) {
      return (
        <div className="flex flex-col items-end flex-shrink-0">
          <span className="text-lg font-bold text-muted-foreground/50">—</span>
          <span className="text-xxs font-bold uppercase tracking-wider text-muted-foreground/60">
            {usesDualnbackClassicDisplay(sessionMeta.mode)
              ? t('stats.history.errorRate', 'Err')
              : usesSdtDisplay(sessionMeta.mode)
                ? "d'"
                : t('stats.history.accuracy', 'Acc')}
          </span>
        </div>
      );
    }

    // Per-tab score from projected report (ground truth for correction runs)
    if (activeRunReport) {
      const unit = activeRunReport.modeScore.unit;
      const value = activeRunReport.modeScore.value;
      const isDualnbackClassic = activeRunReport.gameMode === 'dualnback-classic';

      if (unit === "d'") {
        return (
          <div className="flex flex-col items-end flex-shrink-0">
            <span className={cn('text-lg font-bold', getDPrimeColor(value))}>
              {value.toFixed(1)}
            </span>
            <span className="text-xxs font-bold uppercase tracking-wider text-muted-foreground/60">
              d&apos;
            </span>
          </div>
        );
      }

      if (isDualnbackClassic) {
        const errorRate = Math.round(value);
        return (
          <div className="flex flex-col items-end flex-shrink-0">
            <span className={cn('text-lg font-bold', getErrorRateColor(errorRate))}>
              {errorRate}%
            </span>
            <span className="text-xxs font-bold uppercase tracking-wider text-muted-foreground/60">
              {t('stats.history.errorRate', 'Err')}
            </span>
          </div>
        );
      }

      const accuracyValue =
        unit === '%' ? Math.round(value) : Math.round(activeRunReport.unifiedAccuracy * 100);
      return (
        <div className="flex flex-col items-end flex-shrink-0">
          <span className={cn('text-lg font-bold', getAccuracyColor(accuracyValue))}>
            {accuracyValue}%
          </span>
          <span className="text-xxs font-bold uppercase tracking-wider text-muted-foreground/60">
            {t('stats.history.accuracy', 'Acc')}
          </span>
        </div>
      );
    }

    // Original session fallback (P1)
    if (usesSdtDisplay(sessionMeta.mode)) {
      return (
        <div className="flex flex-col items-end flex-shrink-0">
          <span className={cn('text-lg font-bold', getDPrimeColor(originalDPrime))}>
            {originalDPrime.toFixed(1)}
          </span>
          <span className="text-xxs font-bold uppercase tracking-wider text-muted-foreground/60">
            d&apos;
          </span>
        </div>
      );
    }

    if (usesDualnbackClassicDisplay(sessionMeta.mode)) {
      return (
        <div className="flex flex-col items-end flex-shrink-0">
          <span className={cn('text-lg font-bold', getErrorRateColor(dualnbackErrorRatePercent))}>
            {dualnbackErrorRatePercent}%
          </span>
          <span className="text-xxs font-bold uppercase tracking-wider text-muted-foreground/60">
            {t('stats.history.errorRate', 'Err')}
          </span>
        </div>
      );
    }

    const accuracy = Math.round(originalAccuracy * 100);
    return (
      <div className="flex flex-col items-end flex-shrink-0">
        <span className={cn('text-lg font-bold', getAccuracyColor(accuracy))}>{accuracy}%</span>
        <span className="text-xxs font-bold uppercase tracking-wider text-muted-foreground/60">
          {t('stats.history.accuracy', 'Acc')}
        </span>
      </div>
    );
  })();

  const upsDisplayValue =
    betaEnabled && Number.isFinite(activeScore) ? String(Math.round(activeScore)) : '—';

  // Handle tab click - just activate the tab
  const handleTabClick = useCallback((runId: string | null) => {
    setActiveRunId(runId);
  }, []);

  // Handle card click - open the report for active run
  const handleCardClick = useCallback(() => {
    onOpenReport(activeRunId);
  }, [activeRunId, onOpenReport]);

  // Handle delete click - show confirmation modal
  const handleDeleteClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDeleteConfirm(true);
  }, []);

  // Confirm deletion
  const handleConfirmDelete = useCallback(() => {
    onDeleteRun(activeRunId);
    setShowDeleteConfirm(false);
  }, [activeRunId, onDeleteRun]);

  // Cancel deletion
  const handleCancelDelete = useCallback(() => {
    setShowDeleteConfirm(false);
  }, []);

  // Check if this is a recent session (within 24h)
  const isRecent = Date.now() - activeMeta.createdAt.getTime() < 24 * 60 * 60 * 1000;
  const deleteModal = showDeleteConfirm ? (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        role="button"
        tabIndex={0}
        aria-label={t('common.close')}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleCancelDelete}
        onKeyDown={(e) => e.key === 'Escape' && handleCancelDelete()}
      />

      {/* Modal */}
      <div className="relative bg-surface/80 backdrop-blur-xl border border-border/50 rounded-2xl max-w-sm w-full p-6 animate-in fade-in zoom-in-95 duration-200">
        {/* Close button */}
        <button
          type="button"
          onClick={handleCancelDelete}
          className="absolute top-4 right-4 p-1 text-muted-foreground hover:text-foreground rounded-lg transition-colors"
        >
          <X size={20} />
        </button>

        {/* Icon */}
        <div className="flex justify-center mb-4">
          <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center">
            <Warning size={28} className="text-destructive" />
          </div>
        </div>

        {/* Content */}
        <h3 className="text-lg font-bold text-center text-foreground mb-2">
          {activeRunId === null
            ? t('stats.delete.deleteSession', 'Delete this session?')
            : t('stats.delete.deleteCorrection', 'Delete this correction?')}
        </h3>
        <p className="text-sm text-muted-foreground text-center mb-6">
          {activeRunId === null
            ? t(
                'stats.delete.sessionWarning',
                'This will delete the session and all its corrections.',
              )
            : t('stats.delete.correctionWarning', 'This action is irreversible.')}
        </p>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleCancelDelete}
            className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl bg-secondary text-foreground hover:bg-secondary/80 transition-colors"
          >
            {t('common.cancel', 'Cancel')}
          </button>
          <button
            type="button"
            onClick={handleConfirmDelete}
            className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
          >
            {t('common.delete', 'Delete')}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div className={cn('', className)}>
      {/* Run tabs */}
      <div className="flex items-end gap-0.5">
        {/* P1 tab (original session) */}
        <RunTab
          label="P1"
          score={originalUPS}
          isActive={activeRunId === null}
          isCorrection={false}
          onClick={() => handleTabClick(null)}
          betaEnabled={betaEnabled}
        />

        {/* P2, P3, P4 tabs (corrections) */}
        {runs.map((run) => (
          <RunTab
            key={run.id}
            label={`P${run.depth + 1}`}
            score={runScores.get(run.id) ?? Number.NaN}
            isActive={activeRunId === run.id}
            isCorrection={true}
            onClick={() => handleTabClick(run.id)}
            betaEnabled={betaEnabled}
          />
        ))}
      </div>

      {/* Session card - same design as SessionCard */}
      <div
        role="button"
        tabIndex={0}
        onClick={handleCardClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleCardClick();
          }
        }}
        className="w-full text-left bg-surface border border-border rounded-lg rounded-t-none p-3 hover:bg-secondary/30 transition-all cursor-pointer"
      >
        {/* Mobile layout (< sm): stacked like SessionCard */}
        <div className="flex flex-col gap-2 sm:hidden">
          <div className="flex items-center gap-2 min-w-0">
            <div className="px-2 py-1 rounded-md bg-primary/10 flex-shrink-0">
              <span className="text-xs font-bold text-primary">N-{displayNLevel}</span>
            </div>
            <span className="text-sm font-semibold text-foreground truncate flex-1">
              {modeDisplay}
            </span>
            {isRecent && (
              <span className="inline-flex items-center px-1.5 py-0.5 text-xxs font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 rounded flex-shrink-0">
                {t('stats.history.new', 'Nouveau')}
              </span>
            )}
            <span className="text-xs text-muted-foreground flex-shrink-0">
              {activeMeta.createdAt.toLocaleDateString(language, {
                day: 'numeric',
                month: 'short',
              })}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {modeScoreDisplay}
              <div className="w-px h-6 bg-border" />
              <div className="flex flex-col items-end flex-shrink-0">
                <span
                  className={cn(
                    'text-lg font-bold',
                    betaEnabled && Number.isFinite(activeScore)
                      ? getUpsColor(activeScore)
                      : 'text-muted-foreground/50',
                  )}
                >
                  {upsDisplayValue}
                </span>
                <span className="text-xxs font-bold uppercase tracking-wider text-muted-foreground/60">
                  {t('stats.ups.label', 'UPS · BETA')}
                </span>
              </div>
              <button
                type="button"
                onClick={handleDeleteClick}
                className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors flex-shrink-0"
                aria-label={labels.delete}
              >
                <Trash size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Desktop layout (>= sm): same information hierarchy as SessionCard */}
        <div className="hidden sm:flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="flex flex-col items-center justify-center w-12 h-12 rounded-lg bg-primary/5 flex-shrink-0">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                N-{displayNLevel}
              </span>
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-semibold text-foreground truncate">
                  {modeDisplay}
                </span>
                {isRecent && (
                  <span className="inline-flex items-center px-1.5 py-0.5 text-xxs font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 rounded flex-shrink-0">
                    {t('stats.history.new', 'Nouveau')}
                  </span>
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                {activeMeta.createdAt.toLocaleDateString(language, {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}{' '}
                • {formatDuration(activeMeta.durationMs)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {modeScoreDisplay}
            <div className="w-px h-8 bg-border" />
            <div className="flex flex-col items-end flex-shrink-0">
              <span
                className={cn(
                  'text-lg font-bold',
                  betaEnabled && Number.isFinite(activeScore)
                    ? getUpsColor(activeScore)
                    : 'text-muted-foreground/50',
                )}
              >
                {upsDisplayValue}
              </span>
              <span className="text-xxs font-bold uppercase tracking-wider text-muted-foreground/60">
                {t('stats.ups.label', 'UPS · BETA')}
              </span>
            </div>
            <button
              type="button"
              onClick={handleDeleteClick}
              className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors flex-shrink-0"
              aria-label={labels.delete}
            >
              <Trash size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm &&
        (typeof document === 'undefined' ? deleteModal : createPortal(deleteModal, document.body))}
    </div>
  );
}
