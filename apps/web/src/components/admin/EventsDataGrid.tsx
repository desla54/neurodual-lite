/**
 * EventsDataGrid - Excel-like table with grouped columns
 *
 * Features:
 * - Column groups with expand/collapse
 * - Sticky header
 * - Row click for details
 * - Pagination
 * - Event type badges with colors
 */

import type { GameEvent } from '@neurodual/logic';
import { Button, Card } from '@neurodual/ui';
import { CaretLeft, CaretRight, CaretDown, CaretUp, Gear } from '@phosphor-icons/react';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type SessionMode,
  type ColumnGroup,
  COLUMN_GROUPS,
  getColumnGroupsForMode,
  EVENT_COLORS,
  EVENT_SHORT_LABELS,
} from './event-columns';

// =============================================================================
// Types
// =============================================================================

interface EventsDataGridProps {
  events: readonly GameEvent[];
  mode: SessionMode;
  onEventClick: (event: GameEvent) => void;
  startTime: number;
}

const ITEMS_PER_PAGE = 50;

// =============================================================================
// Components
// =============================================================================

function ColumnGroupHeader({
  group,
  expanded,
  onToggle,
  isCore,
}: {
  group: ColumnGroup;
  expanded: boolean;
  onToggle: () => void;
  isCore: boolean;
}): ReactNode {
  const colSpan = expanded ? group.columns.length : 1;

  return (
    <th
      colSpan={colSpan}
      className={`
        px-2 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider
        border-b border-r border-border/50 bg-surface/80 backdrop-blur-sm
        ${isCore ? '' : 'cursor-pointer hover:bg-surface'}
      `}
      onClick={isCore ? undefined : onToggle}
    >
      <div className="flex items-center justify-center gap-1">
        <span>{group.label}</span>
        {!isCore && (
          <span className="opacity-60">
            {expanded ? <CaretUp size={12} /> : <CaretDown size={12} />}
          </span>
        )}
      </div>
    </th>
  );
}

function ColumnHeaders({
  groups,
  expandedGroups,
}: {
  groups: ColumnGroup[];
  expandedGroups: Set<string>;
}): ReactNode {
  return (
    <tr className="border-b border-border">
      {groups.map((group) => {
        const isCore = group.id === 'core';
        const isExpanded = isCore || expandedGroups.has(group.id);

        if (!isExpanded) {
          // Collapsed: show single "-" cell
          return (
            <th
              key={group.id}
              className="px-2 py-1.5 text-3xs text-muted-foreground/50 text-center border-r border-border/30 bg-surface/50"
            >
              -
            </th>
          );
        }

        // Expanded: show all column headers
        return group.columns.map((col, idx) => (
          <th
            key={`${group.id}-${col.key}`}
            className={`
              px-2 py-1.5 text-3xs font-medium text-muted-foreground whitespace-nowrap
              ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}
              ${idx === group.columns.length - 1 ? 'border-r border-border/30' : ''}
              bg-surface/50
            `}
            style={{ width: col.width, minWidth: col.width }}
          >
            {col.shortLabel ?? col.label}
          </th>
        ));
      })}
    </tr>
  );
}

function EventRow({
  event,
  groups,
  expandedGroups,
  startTime,
  onClick,
  rowIndex,
}: {
  event: GameEvent;
  groups: ColumnGroup[];
  expandedGroups: Set<string>;
  startTime: number;
  onClick: () => void;
  rowIndex: number;
}): ReactNode {
  const bgColor = rowIndex % 2 === 0 ? 'bg-transparent' : 'bg-surface/30';
  const eventColor = EVENT_COLORS[event.type] ?? 'bg-gray-500';

  return (
    <tr
      className={`
        ${bgColor} hover:bg-accent/5 cursor-pointer transition-colors
        border-b border-border/20
      `}
      onClick={onClick}
    >
      {groups.map((group) => {
        const isCore = group.id === 'core';
        const isExpanded = isCore || expandedGroups.has(group.id);

        if (!isExpanded) {
          // Collapsed: show empty cell
          return (
            <td
              key={group.id}
              className="px-2 py-1.5 text-center text-muted-foreground/30 border-r border-border/20"
            >
              -
            </td>
          );
        }

        // Expanded: render all columns
        return group.columns.map((col, idx) => {
          let content: ReactNode = col.render(event, startTime);

          // Special styling for type column
          if (col.key === 'type') {
            content = (
              <span
                className={`
                  inline-block px-1.5 py-0.5 rounded text-3xs font-bold text-white
                  ${eventColor}
                `}
              >
                {EVENT_SHORT_LABELS[event.type] ?? event.type.slice(0, 6)}
              </span>
            );
          }

          return (
            <td
              key={`${group.id}-${col.key}`}
              className={`
                px-2 py-1.5 text-xs font-mono whitespace-nowrap
                ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}
                ${idx === group.columns.length - 1 ? 'border-r border-border/20' : ''}
              `}
              style={{ width: col.width, minWidth: col.width }}
            >
              {content}
            </td>
          );
        });
      })}
    </tr>
  );
}

function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  totalItems,
}: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalItems: number;
}): ReactNode {
  if (totalPages <= 1) return null;

  const startItem = currentPage * ITEMS_PER_PAGE + 1;
  const endItem = Math.min((currentPage + 1) * ITEMS_PER_PAGE, totalItems);

  return (
    <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
      <span className="text-xs text-muted-foreground">
        {startItem}-{endItem} of {totalItems} events
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 0}
        >
          <CaretLeft size={16} />
        </Button>
        <span className="text-sm min-w-[60px] text-center">
          {currentPage + 1} / {totalPages}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages - 1}
        >
          <CaretRight size={16} />
        </Button>
      </div>
    </div>
  );
}

function ColumnConfigurator({
  groups,
  expandedGroups,
  onToggleGroup,
}: {
  groups: ColumnGroup[];
  expandedGroups: Set<string>;
  onToggleGroup: (groupId: string) => void;
}): ReactNode {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <Button variant="ghost" size="sm" onClick={() => setIsOpen(!isOpen)} className="gap-1">
        <Gear size={14} />
        <span className="text-xs">{t('admin.events.columns', 'Columns')}</span>
      </Button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <button
            type="button"
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
            aria-label={t('aria.closeMenu', 'Close menu')}
          />

          {/* Popover */}
          <div className="absolute right-0 top-full mt-1 z-50 bg-background border border-border rounded-lg shadow-lg p-3 min-w-[180px]">
            <div className="text-xs font-semibold text-muted-foreground mb-2">
              {t('admin.events.columnGroups', 'Column groups')}
            </div>
            <div className="space-y-1">
              {groups.map((group) => {
                const isCore = group.id === 'core';
                const isExpanded = isCore || expandedGroups.has(group.id);

                return (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => !isCore && onToggleGroup(group.id)}
                    disabled={isCore}
                    className={`
                      w-full flex items-center justify-between p-2 rounded text-left text-sm
                      ${isCore ? 'opacity-50 cursor-not-allowed' : 'hover:bg-surface cursor-pointer'}
                    `}
                  >
                    <span>{group.label}</span>
                    <span
                      className={`
                        w-4 h-4 rounded border flex items-center justify-center text-xs
                        ${isExpanded ? 'bg-accent border-accent text-white' : 'border-border'}
                      `}
                    >
                      {isExpanded ? '✓' : ''}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function EventsDataGrid({
  events,
  mode,
  onEventClick,
  startTime,
}: EventsDataGridProps): ReactNode {
  const { t } = useTranslation();
  const [currentPage, setCurrentPage] = useState(0);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    // Default expanded groups
    const defaults = new Set<string>();
    for (const group of COLUMN_GROUPS) {
      if (group.defaultExpanded && group.id !== 'core') {
        defaults.add(group.id);
      }
    }
    return defaults;
  });

  // Get relevant groups for this mode
  const groups = useMemo(() => getColumnGroupsForMode(mode), [mode]);

  // Paginate events
  const totalPages = Math.ceil(events.length / ITEMS_PER_PAGE);
  const paginatedEvents = useMemo(() => {
    const start = currentPage * ITEMS_PER_PAGE;
    return events.slice(start, start + ITEMS_PER_PAGE);
  }, [events, currentPage]);

  // Toggle group expansion
  const handleToggleGroup = useCallback((groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }, []);

  // Reset page when events change
  useMemo(() => {
    setCurrentPage(0);
  }, [events.length]);

  if (events.length === 0) {
    return (
      <Card>
        <div className="text-center py-12 text-muted-foreground">
          {t('admin.events.noEventsInSession', 'No events in this session')}
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold">
          {t('admin.events.eventsTitle', 'Events')}
          <span className="ml-2 text-muted-foreground font-normal">
            {t('admin.events.eventsTotal', {
              count: events.length,
              defaultValue: '({{count}} total)',
            })}
          </span>
        </div>
        <ColumnConfigurator
          groups={groups}
          expandedGroups={expandedGroups}
          onToggleGroup={handleToggleGroup}
        />
      </div>

      {/* Table */}
      <div className="overflow-x-auto -mx-4 px-4">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10">
            {/* Group headers */}
            <tr>
              {groups.map((group) => (
                <ColumnGroupHeader
                  key={group.id}
                  group={group}
                  expanded={group.id === 'core' || expandedGroups.has(group.id)}
                  onToggle={() => handleToggleGroup(group.id)}
                  isCore={group.id === 'core'}
                />
              ))}
            </tr>
            {/* Column headers */}
            <ColumnHeaders groups={groups} expandedGroups={expandedGroups} />
          </thead>
          <tbody>
            {paginatedEvents.map((event, idx) => (
              <EventRow
                key={event.id}
                event={event}
                groups={groups}
                expandedGroups={expandedGroups}
                startTime={startTime}
                onClick={() => onEventClick(event)}
                rowIndex={currentPage * ITEMS_PER_PAGE + idx}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
        totalItems={events.length}
      />
    </Card>
  );
}
