/**
 * HistoryView - Paginated session history list with selection mode
 *
 * Features:
 * - Paginated list (20 per page)
 * - Selection mode (long press mobile, Ctrl+Click desktop)
 * - Single and bulk delete with confirmation
 * - Loading and empty states
 * - Shows RunStackCard for sessions with correction runs
 * - Lazy loading of runs per session via PowerSync watched queries
 */

import type { SessionHistoryItem } from '@neurodual/logic';
import { Brain, CaretLeft, CaretRight, Clock, Trash, X } from '@phosphor-icons/react';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useStagger } from '../../animations';
import { profileDevEffectSync } from '../../debug/dev-effect-profiler';
import { SessionWithRuns, type SessionWithRunsProps } from './session-with-runs';
import { BulkDeleteModal, DeleteConfirmModal } from './delete-modals';
import { useOptionalReplayInteractifAdapter } from '../../context/ReplayInteractifContext';
import {
  useReplayRunsQuery,
  useSessionSummariesPageQuery,
  type SessionSummariesCursor,
  type SessionSummariesFilters,
} from '../../queries';

export interface HistoryViewProps {
  readonly filters: SessionSummariesFilters;
  readonly filteredCount: number;
  readonly onDelete: (sessionId: string) => void;
  readonly onBulkDelete: (sessionIds: string[]) => void;
  readonly onSelect: (session: SessionHistoryItem) => void;
  /** Callback when a run tab is clicked (optional) */
  readonly onRunClick?: (sessionId: string, runId: string | null) => void;
  /** Callback when a run is deleted */
  readonly onDeleteRun?: (sessionId: string, runId: string | null) => void;
  /** If true, show actual UPS score (beta feature) */
  readonly betaEnabled?: boolean;
}

// =============================================================================
// SessionRow - Lazy-loads runs for a single session via PowerSync watched query
// =============================================================================

interface SessionRowProps extends Omit<SessionWithRunsProps, 'runs'> {
  readonly session: SessionHistoryItem;
}

/**
 * SessionRow wraps SessionWithRuns and handles lazy loading of runs.
 * Each row manages its own query, preventing the "20 queries at once" bottleneck.
 * TanStack Query handles caching and deduplication automatically.
 */
const SessionRow = memo(function SessionRow({ session, ...props }: SessionRowProps) {
  const adapter = useOptionalReplayInteractifAdapter();

  const { data: runs } = useReplayRunsQuery(session.id, adapter);

  return <SessionWithRuns session={session} runs={runs} {...props} />;
});

export function HistoryView({
  filters,
  filteredCount,
  onDelete,
  onBulkDelete,
  onSelect,
  onRunClick,
  onDeleteRun,
  betaEnabled = false,
}: HistoryViewProps): ReactNode {
  const { t } = useTranslation();
  const [currentPage, setCurrentPage] = useState(0);
  const [cursorsByPage, setCursorsByPage] = useState<Array<SessionSummariesCursor | null>>([null]);
  const [deleteConfirm, setDeleteConfirm] = useState<SessionHistoryItem | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const pageSize = 20;
  const listRef = useRef<HTMLDivElement>(null);
  const prevFiltersKeyRef = useRef('');
  const prevPageRef = useRef(0);

  const filtersKey = useMemo(() => {
    const modalities = Array.from(filters.modalities).sort().join(',');
    const levels = Array.from(filters.nLevels)
      .map((level) => String(level))
      .sort((a, b) => a.localeCompare(b))
      .join(',');
    const startIso = filters.startDate ? filters.startDate.toISOString() : '';
    const endIso = filters.endDate ? filters.endDate.toISOString() : '';
    return [
      filters.mode,
      filters.journeyFilter,
      filters.freeModeFilter,
      modalities,
      startIso,
      endIso,
      levels,
    ].join('|');
  }, [filters]);

  const cursor = cursorsByPage[currentPage] ?? null;
  const { sessions, nextCursor, isPending, error } = useSessionSummariesPageQuery(
    filters,
    cursor,
    pageSize,
  );

  // Single pagination guard: handles filter reset, page-scoped selection reset,
  // and empty-page fallback after deletions.
  useEffect(() => {
    return profileDevEffectSync('HistoryView.paginationGuard', () => {
      const filtersChanged = prevFiltersKeyRef.current !== filtersKey;
      const pageChanged = prevPageRef.current !== currentPage;

      // 1. Filters changed → reset pagination + selection
      if (filtersChanged) {
        prevFiltersKeyRef.current = filtersKey;
        prevPageRef.current = 0;
        setCurrentPage(0);
        setCursorsByPage([null]);
        setSelectionMode(false);
        setSelectedIds(new Set());
        return;
      }

      // 2. Page changed → reset selection (page-scoped to prevent accidental bulk actions)
      if (pageChanged) {
        prevPageRef.current = currentPage;
        setSelectionMode(false);
        setSelectedIds(new Set());
      }

      // 3. Empty page fallback → go back one page after deletions
      if (!isPending && sessions.length === 0 && currentPage > 0) {
        setCurrentPage((p) => Math.max(0, p - 1));
      }
    });
  }, [filtersKey, currentPage, isPending, sessions.length]);

  const totalPages = useMemo(() => {
    if (filteredCount <= 0) return 0;
    return Math.ceil(filteredCount / pageSize);
  }, [filteredCount, pageSize]);

  const canGoPrevious = currentPage > 0;
  const canGoNext = useMemo(() => {
    if (nextCursor == null) return false;
    return (currentPage + 1) * pageSize < filteredCount;
  }, [currentPage, filteredCount, nextCursor, pageSize]);

  // Stagger animation for session list (re-animate on page change)
  useStagger(listRef, '> *', { deps: [currentPage, sessions.length] });

  const handleDeleteClick = useCallback((session: SessionHistoryItem) => {
    setDeleteConfirm(session);
  }, []);

  const handleConfirmDelete = useCallback(
    (sessionId: string) => {
      onDelete(sessionId);
      setDeleteConfirm(null);
    },
    [onDelete],
  );

  const handleEnterSelectionMode = useCallback(
    (sessionId: string) => {
      if (!selectionMode) {
        setSelectionMode(true);
        setSelectedIds(new Set([sessionId]));
      }
    },
    [selectionMode],
  );

  const handleToggleSelect = useCallback((sessionId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    if (selectedIds.size === sessions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sessions.map((s) => s.id)));
    }
  }, [selectedIds.size, sessions]);

  const handleCancelSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const handleConfirmBulkDelete = useCallback(() => {
    if (selectedIds.size > 0) {
      onBulkDelete(Array.from(selectedIds));
      setSelectedIds(new Set());
      setSelectionMode(false);
      setBulkDeleteConfirm(false);
    }
  }, [selectedIds, onBulkDelete]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center space-y-4 opacity-60">
        <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center">
          <Brain size={32} className="text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">{t('stats.history.noSessions')}</p>
        <p className="text-xs text-muted-foreground">{String(error.message ?? error)}</p>
      </div>
    );
  }

  if (isPending) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
        <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center animate-pulse">
          <Brain size={32} className="text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center space-y-4 opacity-60">
        <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center">
          <Brain size={32} className="text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">{t('stats.history.noSessions')}</p>
        <p className="text-xs text-muted-foreground">{t('stats.history.noSessionsHint')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 nd-extension-contained" data-testid="history-view">
      {/* Header with selection bar */}
      {selectionMode ? (
        <div className="flex items-center justify-between gap-2 px-2 py-3 mb-4 bg-primary/5 rounded-xl border border-primary/20">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleCancelSelection}
              className="p-2 text-muted-foreground hover:text-foreground rounded-lg transition-colors"
              aria-label={t('stats.history.cancelSelection')}
            >
              <X size={20} />
            </button>
            <span className="text-sm font-semibold text-foreground">
              {selectedIds.size}{' '}
              {selectedIds.size > 1
                ? t('stats.history.selectedPlural')
                : t('stats.history.selected')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSelectAll}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-secondary text-foreground hover:bg-secondary/80 transition-colors"
            >
              {selectedIds.size === sessions.length
                ? t('stats.history.deselectAll')
                : t('stats.history.selectAll')}
            </button>
            <button
              type="button"
              onClick={() => setBulkDeleteConfirm(true)}
              disabled={selectedIds.size === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Trash size={14} />
              {t('common.delete')}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 px-2 mb-4">
          <Clock size={18} className="text-muted-foreground" />
          <h2 className="text-lg font-bold text-foreground">{t('stats.history.title')}</h2>
          <span className="text-sm text-muted-foreground">({filteredCount})</span>
          {/* Desktop: Hint for selection mode */}
          <span className="hidden md:inline-block ml-auto text-xs text-muted-foreground">
            {t('stats.history.ctrlClickHint')}
          </span>
        </div>
      )}

      {/* Session List */}
      <div ref={listRef} className="space-y-2">
        {sessions.map((session) => (
          <SessionRow
            key={session.id}
            session={session}
            onDelete={handleDeleteClick}
            onClick={onSelect}
            onRunClick={onRunClick}
            onDeleteRun={onDeleteRun}
            selectionMode={selectionMode}
            isSelected={selectedIds.has(session.id)}
            onToggleSelect={handleToggleSelect}
            onLongPress={handleEnterSelectionMode}
            betaEnabled={betaEnabled}
          />
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-6 pt-4 border-t border-border">
          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
            disabled={!canGoPrevious}
            className="flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-lg bg-secondary text-muted-foreground hover:bg-secondary/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <CaretLeft size={16} />
            {t('stats.history.previous')}
          </button>
          <span className="px-3 py-2 text-sm font-medium rounded-lg bg-secondary text-foreground">
            {currentPage + 1} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => {
              if (!canGoNext) return;
              setCursorsByPage((prev) => {
                const next = [...prev];
                if (!next[currentPage + 1]) {
                  next[currentPage + 1] = nextCursor;
                }
                return next;
              });
              setCurrentPage((p) => p + 1);
            }}
            disabled={!canGoNext}
            className="flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-lg bg-secondary text-muted-foreground hover:bg-secondary/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {t('stats.history.next')}
            <CaretRight size={16} />
          </button>
        </div>
      )}

      {/* Single Delete Confirmation Modal */}
      {deleteConfirm && (
        <DeleteConfirmModal
          session={deleteConfirm}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}

      {/* Bulk Delete Confirmation Modal */}
      {bulkDeleteConfirm && (
        <BulkDeleteModal
          count={selectedIds.size}
          onConfirm={handleConfirmBulkDelete}
          onCancel={() => setBulkDeleteConfirm(false)}
        />
      )}
    </div>
  );
}
