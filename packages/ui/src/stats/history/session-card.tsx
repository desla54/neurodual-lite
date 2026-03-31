/**
 * SessionCard - Individual session entry in history list
 *
 * Features:
 * - Long press (mobile) or Ctrl+Click (desktop) for selection mode
 * - Compact display with N-level, date, UPS score
 * - Delete button (hidden in selection mode)
 */

import { getModeI18nKey, getModeScoringStrategy, type SessionHistoryItem } from '@neurodual/logic';
import { Check, Square, Trash } from '@phosphor-icons/react';
import { memo, useCallback, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Get translated mode name from spec (SSOT).
 * Uses getModeI18nKey to derive the translation key from the mode ID.
 */
function getTranslatedModeName(
  t: ReturnType<typeof useTranslation>['t'],
  gameMode: string | undefined,
  fallback: string,
): string {
  const key = getModeI18nKey(gameMode);
  return key ? t(key) : fallback;
}

/**
 * Determines if a mode uses d-prime display (spec-driven).
 * Reads directly from the spec via getModeScoringStrategy.
 *
 * - 'sdt': Show d-prime
 * - 'dualnback-classic': Show error rate (separate handling)
 * - 'accuracy' or 'brainworkshop': Show accuracy percentage
 *
 * Falls back to accuracy display for unknown modes.
 */
function usesSdtDisplay(gameMode: string | undefined): boolean {
  const strategy = getModeScoringStrategy(gameMode);
  return strategy === 'sdt';
}

/**
 * Determines if a mode uses Dual N-Back Classic error-based display.
 * Dual N-Back Classic (2008 protocol) tracks errors, not d-prime.
 */
function usesDualnbackClassicDisplay(gameMode: string | undefined): boolean {
  const strategy = getModeScoringStrategy(gameMode);
  return strategy === 'dualnback-classic';
}

/**
 * Compute Dual N-Back Classic error rate from raw modality counts.
 * Formula: (misses + false alarms) / (hits + misses + false alarms), CR excluded.
 */
function computeDualnbackClassicErrorRatePercent(session: SessionHistoryItem): number | null {
  let hits = 0;
  let misses = 0;
  let falseAlarms = 0;

  for (const modalityStats of Object.values(session.byModality)) {
    hits += modalityStats.hits;
    misses += modalityStats.misses;
    falseAlarms += modalityStats.falseAlarms;
  }

  const totalRelevant = hits + misses + falseAlarms;
  if (totalRelevant > 0) {
    return Math.round(((misses + falseAlarms) / totalRelevant) * 100);
  }

  return null;
}

/**
 * Get d-prime color (higher is better)
 */
function getDPrimeColor(dPrime: number): string {
  if (dPrime >= 2.0) return 'text-woven-correct';
  if (dPrime >= 1.0) return 'text-woven-focus';
  return 'text-woven-incorrect';
}

/**
 * Get accuracy color (higher is better)
 */
function getAccuracyColor(accuracy: number): string {
  if (accuracy >= 80) return 'text-woven-correct';
  if (accuracy >= 60) return 'text-woven-focus';
  return 'text-woven-incorrect';
}

/**
 * Get error rate color (lower is better)
 * For Dual N-Back Classic: < 15% errors = excellent, < 30% = good, >= 30% = needs improvement
 */
function getErrorRateColor(errorRate: number | null, passed: boolean): string {
  if (errorRate === null) return 'text-muted-foreground';
  if (passed) return 'text-woven-correct';
  if (errorRate <= 30) return 'text-woven-focus';
  return 'text-woven-incorrect';
}

export interface SessionCardProps {
  readonly session: SessionHistoryItem;
  readonly onDelete: (session: SessionHistoryItem) => void;
  readonly onClick: (session: SessionHistoryItem) => void;
  readonly selectionMode: boolean;
  readonly isSelected: boolean;
  readonly onToggleSelect: (sessionId: string) => void;
  readonly onLongPress: (sessionId: string) => void;
  /** If true, show actual UPS score (beta feature) */
  readonly betaEnabled?: boolean;
}

const LONG_PRESS_DURATION = 500; // ms
const LONG_PRESS_MOVE_TOLERANCE = 10; // px
const TOUCH_SCROLL_COOLDOWN = 180; // ms
let lastTouchScrollAt = 0;

export const SessionCard = memo(function SessionCard({
  session,
  onDelete,
  onClick,
  selectionMode,
  isSelected,
  onToggleSelect,
  onLongPress,
  betaEnabled = false,
}: SessionCardProps): ReactNode {
  const { t, i18n } = useTranslation();
  const isRecent = Date.now() - session.createdAt.getTime() < 24 * 60 * 60 * 1000;
  const isDualTrackCalibration = session.generator === 'dual-track-calibration';
  const dualnbackErrorRatePercent = computeDualnbackClassicErrorRatePercent(session);

  // UPS score (beta feature)
  const upsScore = session.upsScore ?? Math.round(session.unifiedMetrics.accuracy * 100);
  const upsDisplay = betaEnabled ? String(upsScore) : '—';
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPress = useRef(false);
  const longPressCancelled = useRef(false);
  const touchStartPoint = useRef<{ x: number; y: number } | null>(null);

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;

      touchStartPoint.current = { x: touch.clientX, y: touch.clientY };
      longPressCancelled.current = false;
      clearLongPressTimer();

      if (Date.now() - lastTouchScrollAt < TOUCH_SCROLL_COOLDOWN) {
        longPressCancelled.current = true;
        return;
      }

      isLongPress.current = false;
      longPressTimer.current = setTimeout(() => {
        if (longPressCancelled.current) return;
        isLongPress.current = true;
        onLongPress(session.id);
      }, LONG_PRESS_DURATION);
    },
    [clearLongPressTimer, onLongPress, session.id],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      const touch = e.touches[0];
      const start = touchStartPoint.current;
      if (!touch || !start) return;

      const deltaX = Math.abs(touch.clientX - start.x);
      const deltaY = Math.abs(touch.clientY - start.y);
      if (deltaX <= LONG_PRESS_MOVE_TOLERANCE && deltaY <= LONG_PRESS_MOVE_TOLERANCE) return;

      longPressCancelled.current = true;
      lastTouchScrollAt = Date.now();
      clearLongPressTimer();
    },
    [clearLongPressTimer],
  );

  const handleTouchEnd = useCallback(() => {
    touchStartPoint.current = null;
    longPressCancelled.current = false;
    clearLongPressTimer();
  }, [clearLongPressTimer]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (isLongPress.current) {
        isLongPress.current = false;
        return;
      }

      // Ctrl+Click (Windows/Linux) or Cmd+Click (Mac) to enter selection mode
      const isModifierClick = e.ctrlKey || e.metaKey;

      if (isModifierClick) {
        e.preventDefault();
        if (!selectionMode) {
          // Enter selection mode and select this item
          onLongPress(session.id);
        } else {
          // Toggle selection in existing selection mode
          onToggleSelect(session.id);
        }
        return;
      }

      if (selectionMode) {
        onToggleSelect(session.id);
      } else {
        onClick(session);
      }
    },
    [selectionMode, onToggleSelect, onClick, onLongPress, session],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (selectionMode) {
          onToggleSelect(session.id);
        } else {
          onClick(session);
        }
      }
    },
    [selectionMode, onToggleSelect, onClick, session],
  );

  // Score display component (reused in mobile and desktop layouts)
  const ScoreDisplay = (
    <>
      {usesSdtDisplay(session.gameMode) ? (
        <div className="flex flex-col items-end flex-shrink-0">
          <span className={`text-lg font-bold ${getDPrimeColor(session.dPrime)}`}>
            {session.dPrime.toFixed(1)}
          </span>
          <span className="text-xxs font-bold uppercase tracking-wider text-muted-foreground/60">
            d&apos;
          </span>
        </div>
      ) : usesDualnbackClassicDisplay(session.gameMode) ? (
        <div className="flex flex-col items-end flex-shrink-0">
          <span
            className={`text-lg font-bold ${getErrorRateColor(dualnbackErrorRatePercent, session.passed)}`}
          >
            {dualnbackErrorRatePercent === null ? '—' : `${dualnbackErrorRatePercent}%`}
          </span>
          <span className="text-xxs font-bold uppercase tracking-wider text-muted-foreground/60">
            {t('stats.history.errorRate', 'Err')}
          </span>
        </div>
      ) : (
        <div className="flex flex-col items-end flex-shrink-0">
          <span
            className={`text-lg font-bold ${getAccuracyColor(Math.round(session.unifiedMetrics.accuracy * 100))}`}
          >
            {Math.round(session.unifiedMetrics.accuracy * 100)}%
          </span>
          <span className="text-xxs font-bold uppercase tracking-wider text-muted-foreground/60">
            {t('stats.history.accuracy', 'Acc')}
          </span>
        </div>
      )}
    </>
  );

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      data-testid={`history-session-${session.id}`}
      className={`w-full text-left bg-surface border rounded-xl p-3 hover:bg-secondary/30 transition-all cursor-pointer ${
        isSelected ? 'border-primary bg-primary/5' : 'border-border'
      }`}
    >
      {/* Mobile layout (< sm): stacked */}
      <div className="flex flex-col gap-2 sm:hidden">
        {/* Row 1: Checkbox/Level + Mode + Date */}
        <div className="flex items-center gap-2">
          {selectionMode ? (
            <div
              className={`w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 transition-colors ${
                isSelected ? 'bg-primary text-primary-foreground' : 'bg-secondary'
              }`}
            >
              {isSelected ? (
                <Check size={16} />
              ) : (
                <Square size={16} className="text-muted-foreground" />
              )}
            </div>
          ) : (
            <div className="px-2 py-1 rounded-md bg-primary/10 flex-shrink-0">
              <span className="text-xs font-bold text-primary">N-{session.nLevel}</span>
            </div>
          )}
          <span className="text-sm font-semibold text-foreground truncate flex-1">
            {getTranslatedModeName(t, session.gameMode, session.gameMode ?? session.generator)}
          </span>
          {isDualTrackCalibration && !selectionMode && (
            <span className="inline-flex items-center px-1.5 py-0.5 text-xxs font-bold uppercase tracking-wider bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 rounded flex-shrink-0">
              {t('journey.calibration.badge', 'Calibration')}
            </span>
          )}
          {isRecent && !selectionMode && (
            <span className="inline-flex items-center px-1.5 py-0.5 text-xxs font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400 rounded flex-shrink-0">
              {t('stats.history.new')}
            </span>
          )}
          <span className="text-xs text-muted-foreground flex-shrink-0">
            {session.createdAt.toLocaleDateString(i18n.language, {
              day: 'numeric',
              month: 'short',
            })}
          </span>
        </div>

        {/* Row 2: Scores + Delete */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {ScoreDisplay}
            <div className="w-px h-6 bg-border" />
            <div className="flex flex-col items-end flex-shrink-0">
              <span
                className={`text-lg font-bold ${betaEnabled ? 'text-foreground' : 'text-muted-foreground/50'}`}
              >
                {upsDisplay}
              </span>
              <span className="text-xxs font-bold uppercase tracking-wider text-muted-foreground/60">
                {t('stats.ups.label', 'UPS · BETA')}
              </span>
            </div>
          </div>
          {!selectionMode && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(session);
              }}
              onTouchStart={(e) => e.stopPropagation()}
              onTouchEnd={(e) => e.stopPropagation()}
              data-testid={`history-session-delete-${session.id}`}
              className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors flex-shrink-0"
              aria-label={t('common.delete')}
            >
              <Trash size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Desktop layout (>= sm): horizontal */}
      <div className="hidden sm:flex items-center justify-between gap-3">
        {/* Left: Selection checkbox or Level */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {selectionMode ? (
            <div
              className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
                isSelected ? 'bg-primary text-primary-foreground' : 'bg-secondary'
              }`}
            >
              {isSelected ? (
                <Check size={20} />
              ) : (
                <Square size={20} className="text-muted-foreground" />
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center w-12 h-12 rounded-lg bg-primary/5 flex-shrink-0">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                N-{session.nLevel}
              </span>
            </div>
          )}
          <div className="min-w-0 flex-1">
            {/* Mode name */}
            <div className="flex items-center gap-2">
              {selectionMode && (
                <span className="text-xs font-bold text-muted-foreground">N-{session.nLevel}</span>
              )}
              <span className="text-sm font-semibold text-foreground">
                {getTranslatedModeName(t, session.gameMode, session.gameMode ?? session.generator)}
              </span>
              {isDualTrackCalibration && !selectionMode && (
                <span className="inline-flex items-center px-1.5 py-0.5 text-xxs font-bold uppercase tracking-wider bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 rounded">
                  {t('journey.calibration.badge', 'Calibration')}
                </span>
              )}
              {isRecent && !selectionMode && (
                <span className="inline-flex items-center px-1.5 py-0.5 text-xxs font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400 rounded">
                  {t('stats.history.new')}
                </span>
              )}
            </div>
            {/* Date */}
            <span className="text-xs text-muted-foreground">
              {session.createdAt.toLocaleDateString(i18n.language, {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
        </div>

        {/* Right: Mode-appropriate score + UPS + Delete */}
        <div className="flex items-center gap-2">
          {ScoreDisplay}

          {/* Separator */}
          <div className="w-px h-8 bg-border" />

          {/* UPS Score - visible si beta */}
          <div className="flex flex-col items-end flex-shrink-0">
            <span
              className={`text-lg font-bold ${betaEnabled ? 'text-foreground' : 'text-muted-foreground/50'}`}
            >
              {upsDisplay}
            </span>
            <span className="text-xxs font-bold uppercase tracking-wider text-muted-foreground/60">
              {t('stats.ups.label', 'UPS · BETA')}
            </span>
          </div>

          {/* Delete Button (hidden in selection mode) */}
          {!selectionMode && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(session);
              }}
              onTouchStart={(e) => e.stopPropagation()}
              onTouchEnd={(e) => e.stopPropagation()}
              data-testid={`history-session-delete-${session.id}`}
              className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors flex-shrink-0"
              aria-label={t('common.delete')}
            >
              <Trash size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
});
