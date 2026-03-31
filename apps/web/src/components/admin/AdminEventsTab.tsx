/**
 * AdminEventsTab - Event sourcing debug tools (REFACTORED)
 *
 * Features:
 * - Session selector with mode filter
 * - Excel-like data grid with grouped columns
 * - Event detail modal
 * - Export CSV/JSON
 * - Search bar with advanced syntax
 * - Mini charts (RT, accuracy, response phase, input method)
 * - Session comparison (coming soon)
 */

import type { GameEvent, SessionSummaryRow } from '@neurodual/logic';
import { Button, Card, Spinner, useSessionSummariesQuery } from '@neurodual/ui';
import {
  ArrowClockwise,
  Trash,
  FileJs,
  FileCsv,
  MagnifyingGlass,
  ArrowsLeftRight,
  Bug,
} from '@phosphor-icons/react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { useAppPorts } from '../../providers';
import { SessionSelector, type SessionMeta } from './SessionSelector';
import { EventsDataGrid } from './EventsDataGrid';
import { EventDetailModal } from './EventDetailModal';
import { SessionMiniCharts } from './SessionMiniCharts';
import { SessionCompareView } from './SessionCompareView';
import { type SessionMode, getSessionMode } from './event-columns';

// =============================================================================
// Export Helpers
// =============================================================================

type RawPayloadSampleRow = {
  id: string;
  type: string;
  timestamp: number;
  payloadLen: number;
  payloadPreview: string;
  parseOk: boolean;
};

interface SessionEventsExport {
  readonly exportedAt: string;
  readonly sessionId: string;
  readonly summary: SessionSummaryRow | null;
  readonly events: readonly GameEvent[];
}

interface SessionsEventsExport {
  readonly exportedAt: string;
  readonly sessions: readonly SessionEventsExport[];
}

function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function eventsToCSV(events: readonly GameEvent[]): string {
  if (events.length === 0) return '';

  // Collect all unique keys across all events
  const allKeys = new Set<string>();
  for (const event of events) {
    for (const key of Object.keys(event)) {
      allKeys.add(key);
    }
  }
  const keys = Array.from(allKeys).sort();

  // Header
  const header = keys.join(',');

  // Rows
  const rows = events.map((event) => {
    return keys
      .map((key) => {
        const value = (event as unknown as Record<string, unknown>)[key];
        if (value === undefined || value === null) return '';
        if (typeof value === 'object') return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
        if (typeof value === 'string') return `"${value.replace(/"/g, '""')}"`;
        return String(value);
      })
      .join(',');
  });

  return [header, ...rows].join('\n');
}

function sessionSummaryToMeta(row: SessionSummaryRow): SessionMeta {
  const startedAt = new Date(row.created_at).getTime();
  const durationMs = Number(row.duration_ms) || 0;
  const endedAt = durationMs > 0 ? startedAt + durationMs : undefined;

  // In summaries, session_type is the reliable "mode".
  const mode =
    row.session_type === 'tempo' ||
    row.session_type === 'flow' ||
    row.session_type === 'recall' ||
    row.session_type === 'dual-pick' ||
    row.session_type === 'trace'
      ? row.session_type
      : 'tempo';

  const reason =
    row.reason === 'completed' || row.reason === 'abandoned' || row.reason === 'error'
      ? (row.reason as SessionMeta['reason'])
      : undefined;

  return {
    sessionId: row.session_id,
    startedAt,
    endedAt,
    mode,
    gameMode: row.game_mode ?? row.session_type ?? 'unknown',
    nLevel: Number(row.n_level) || 0,
    eventsCount: Number(row.trials_count) || 0,
    durationMs,
    reason,
  };
}

// =============================================================================
// Search Bar Component (Placeholder for now)
// =============================================================================

function SearchBar({
  value,
  onChange,
  matchCount,
  totalCount,
}: {
  value: string;
  onChange: (value: string) => void;
  matchCount: number;
  totalCount: number;
}): ReactNode {
  const { t } = useTranslation();
  return (
    <div className="relative mb-4">
      <div className="flex items-center gap-2 bg-surface border border-border rounded-lg px-3 py-2">
        <MagnifyingGlass size={16} className="text-muted-foreground" />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t(
            'admin.events.searchPlaceholder',
            'Search... (e.g., type:RESPONSE, RT>500)',
          )}
          className="flex-1 bg-transparent border-none outline-none text-sm placeholder:text-muted-foreground/50"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="text-xs text-muted-foreground hover:text-white px-2 py-0.5 rounded bg-surface"
          >
            {t('admin.events.clearSearch', 'Clear')}
          </button>
        )}
      </div>
      {value && (
        <div className="absolute right-3 top-full mt-1 text-xs text-muted-foreground">
          {t('admin.events.matchCount', {
            matchCount,
            totalCount,
            defaultValue: '{{matchCount}} / {{totalCount}} events',
          })}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Simple Search Parser
// =============================================================================

interface SearchFilter {
  key: string;
  operator: '=' | '>' | '<' | 'contains';
  value: string;
  negate: boolean;
}

function parseSearchQuery(query: string): SearchFilter[] {
  if (!query.trim()) return [];

  const filters: SearchFilter[] = [];
  const parts = query.split(/\s+/);

  for (const part of parts) {
    let negate = false;
    let p = part;

    // Check for negation
    if (p.startsWith('!')) {
      negate = true;
      p = p.slice(1);
    }

    // Parse operator
    let operator: SearchFilter['operator'] = 'contains';
    let key = '';
    let value = '';

    if (p.includes(':')) {
      const colonIdx = p.indexOf(':');
      key = p.slice(0, colonIdx).toLowerCase();
      value = p.slice(colonIdx + 1);

      if (value.startsWith('*') && value.endsWith('*')) {
        operator = 'contains';
        value = value.slice(1, -1);
      } else {
        operator = '=';
      }
    } else if (p.includes('>')) {
      const idx = p.indexOf('>');
      key = p.slice(0, idx).toLowerCase();
      value = p.slice(idx + 1);
      operator = '>';
    } else if (p.includes('<')) {
      const idx = p.indexOf('<');
      key = p.slice(0, idx).toLowerCase();
      value = p.slice(idx + 1);
      operator = '<';
    } else {
      // Plain text search - search in type
      key = 'type';
      value = p;
      operator = 'contains';
    }

    if (key && value) {
      filters.push({ key, operator, value, negate });
    }
  }

  return filters;
}

function matchesFilter(event: GameEvent, filter: SearchFilter): boolean {
  const getValue = (obj: unknown, path: string): unknown => {
    const parts = path.split('.');
    let current = obj;
    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  };

  // Map common short keys to actual paths
  const keyMappings: Record<string, string> = {
    type: 'type',
    rt: 'reactionTimeMs',
    modality: 'modality',
    correct: 'correct',
    position: 'position',
    trial: 'trialIndex',
    input: 'inputMethod',
    phase: 'responsePhase',
  };

  const actualKey = keyMappings[filter.key] ?? filter.key;
  let eventValue = getValue(event, actualKey);

  // Try nested paths if direct access fails
  if (eventValue === undefined) {
    // Try in trial object
    eventValue = getValue(event, `trial.${actualKey}`);
  }
  if (eventValue === undefined) {
    // Try in pick object
    eventValue = getValue(event, `pick.${actualKey}`);
  }

  if (eventValue === undefined) return false;

  const strValue = String(eventValue).toLowerCase();
  const filterValue = filter.value.toLowerCase();

  let matches = false;
  switch (filter.operator) {
    case '=':
      matches = strValue === filterValue;
      break;
    case '>':
      matches = Number(eventValue) > Number(filter.value);
      break;
    case '<':
      matches = Number(eventValue) < Number(filter.value);
      break;
    case 'contains':
      matches = strValue.includes(filterValue);
      break;
  }

  return filter.negate ? !matches : matches;
}

function filterEvents(events: readonly GameEvent[], query: string): GameEvent[] {
  const filters = parseSearchQuery(query);
  if (filters.length === 0) return [...events];

  return events.filter((event) => {
    return filters.every((filter) => matchesFilter(event, filter));
  });
}

// =============================================================================
// Main Component
// =============================================================================

export function AdminEventsTab(): ReactNode {
  const { t } = useTranslation();
  const { persistence, eventReaderFactory } = useAppPorts();
  const eventReader = useMemo(
    () => (persistence ? eventReaderFactory.create(persistence) : null),
    [eventReaderFactory, persistence],
  );

  // State
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [modeFilter, setModeFilter] = useState<SessionMode | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sessionEvents, setSessionEvents] = useState<readonly GameEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<GameEvent | null>(null);
  const [includeAbandoned, setIncludeAbandoned] = useState(false);
  const [loadingSession, setLoadingSession] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCompare, setShowCompare] = useState(false);
  const [rawPayloadSample, setRawPayloadSample] = useState<RawPayloadSampleRow[] | null>(null);
  const [rawPayloadLoading, setRawPayloadLoading] = useState(false);
  const [rawPayloadError, setRawPayloadError] = useState<string | null>(null);
  const [exportingSelected, setExportingSelected] = useState(false);
  const [exportingAll, setExportingAll] = useState(false);

  const sessionEventsCache = useRef(new Map<string, readonly GameEvent[]>());

  const {
    data: sessionSummaries,
    isPending: loadingSessions,
    error: sessionsError,
  } = useSessionSummariesQuery({ includeAbandoned });

  const sessions = useMemo(() => {
    return sessionSummaries.map(sessionSummaryToMeta);
  }, [sessionSummaries]);
  const sessionSummaryById = useMemo(
    () => new Map(sessionSummaries.map((row) => [row.session_id, row])),
    [sessionSummaries],
  );

  useEffect(() => {
    setSelectedSessionId((prev) => {
      if (prev && sessions.some((s) => s.sessionId === prev)) return prev;
      return sessions[0]?.sessionId ?? null;
    });
  }, [sessions]);

  const loadSessionEvents = useCallback(
    async (sessionId: string, options?: { force?: boolean }): Promise<readonly GameEvent[]> => {
      if (!eventReader) return [];
      const cached = sessionEventsCache.current.get(sessionId);
      if (cached && options?.force !== true) return cached;

      const events = await eventReader.getSessionEvents(sessionId);
      sessionEventsCache.current.set(sessionId, events);
      return events;
    },
    [eventReader],
  );

  const inspectRawPayload = useCallback(async (): Promise<void> => {
    if (!persistence) return;
    if (!selectedSessionId) return;

    setRawPayloadLoading(true);
    setRawPayloadError(null);
    try {
      // Emmett-only: inspect the decoded event payload from emt_messages.
      const res = await persistence.query<{
        id: string;
        type: string;
        timestamp: number;
        payload: unknown;
      }>(
        `SELECT
           message_id as id,
           message_type as type,
           CAST(json_extract(message_data, '$.data.timestamp') AS INTEGER) as timestamp,
           json_extract(message_data, '$.data') as payload
         FROM emt_messages
         WHERE message_kind = 'E'
           AND stream_id = 'session:' || ?
           AND is_archived = 0
         ORDER BY CAST(global_position AS INTEGER) ASC
         LIMIT 10`,
        [selectedSessionId],
      );

      const rows = res.rows ?? [];
      const mapped: RawPayloadSampleRow[] = rows.map((row) => {
        const raw = row.payload;
        const asString =
          typeof raw === 'string'
            ? raw
            : raw && typeof raw === 'object'
              ? JSON.stringify(raw)
              : raw == null
                ? ''
                : String(raw);
        let parseOk = false;
        try {
          const parsed = JSON.parse(asString);
          parseOk = !!parsed && typeof parsed === 'object';
        } catch {
          parseOk = false;
        }

        const preview = asString.length > 240 ? `${asString.slice(0, 240)}…` : asString;
        return {
          id: String(row.id),
          type: String(row.type),
          timestamp: Number(row.timestamp),
          payloadLen: asString.length,
          payloadPreview: preview,
          parseOk,
        };
      });

      setRawPayloadSample(mapped);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setRawPayloadError(message);
      setRawPayloadSample(null);
    } finally {
      setRawPayloadLoading(false);
    }
  }, [persistence, selectedSessionId]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedSessionId) {
      setSessionEvents([]);
      setRawPayloadSample(null);
      setRawPayloadError(null);
      return;
    }

    setLoadingSession(true);
    setError(null);
    setRawPayloadSample(null);
    setRawPayloadError(null);
    loadSessionEvents(selectedSessionId)
      .then((events) => {
        if (cancelled) return;
        setSessionEvents(events);
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
      })
      .finally(() => {
        if (cancelled) return;
        setLoadingSession(false);
      });

    return () => {
      cancelled = true;
    };
  }, [loadSessionEvents, selectedSessionId]);

  // Apply search filter
  const filteredEvents = useMemo(() => {
    return filterEvents(sessionEvents, searchQuery);
  }, [sessionEvents, searchQuery]);

  const payloadCoverage = useMemo(() => {
    const RESERVED = new Set(['id', 'type', 'sessionId', 'timestamp']);
    let envelopeOnly = 0;
    let hasTrial = 0;
    let hasAnyPayload = 0;
    for (const e of sessionEvents) {
      const keys = Object.keys(e as unknown as Record<string, unknown>);
      const nonEnvelope = keys.filter((k) => !RESERVED.has(k));
      if (nonEnvelope.length === 0) envelopeOnly++;
      else hasAnyPayload++;
      if ((e as unknown as { trial?: unknown }).trial !== undefined) hasTrial++;
    }
    return {
      total: sessionEvents.length,
      envelopeOnly,
      hasAnyPayload,
      hasTrial,
    };
  }, [sessionEvents]);

  // Get session mode
  const sessionMode = useMemo(() => {
    return getSessionMode(sessionEvents);
  }, [sessionEvents]);

  // Get start time
  const startTime = useMemo(() => {
    if (sessionEvents.length === 0) return 0;
    return sessionEvents[0]?.timestamp ?? 0;
  }, [sessionEvents]);

  // Handlers
  const handleRefresh = useCallback(async () => {
    sessionEventsCache.current.clear();
    if (selectedSessionId) {
      setLoadingSession(true);
      try {
        const events = await loadSessionEvents(selectedSessionId, { force: true });
        setSessionEvents(events);
      } finally {
        setLoadingSession(false);
      }
    }
  }, [loadSessionEvents, selectedSessionId]);

  const handleClearLocal = useCallback(async () => {
    if (!persistence) return;
    if (
      window.confirm(
        [
          t('admin.events.confirmClearLocalTitle', 'Clear local database?'),
          '',
          t(
            'admin.events.confirmClearLocalHint',
            'If cloud sync is enabled, PowerSync may download events again after the wipe.',
          ),
        ].join('\n'),
      )
    ) {
      await persistence.clear();
      sessionEventsCache.current.clear();
      setSelectedSessionId(null);
      setSessionEvents([]);
    }
  }, [persistence, t]);

  const handleDeleteSelectedSession = useCallback(async () => {
    if (!persistence) return;
    if (!selectedSessionId) return;

    if (
      window.confirm(
        [
          t('admin.events.confirmDeleteSessionTitle', 'Delete this session?'),
          '',
          t(
            'admin.events.confirmDeleteSessionHint1',
            'This performs a soft-delete for synced events (propagates via cloud sync).',
          ),
          t(
            'admin.events.confirmDeleteSessionHint2',
            'Local-only events for this session will be removed too.',
          ),
        ].join('\n'),
      )
    ) {
      setLoadingSession(true);
      setError(null);
      try {
        await persistence.deleteSession(selectedSessionId);
        sessionEventsCache.current.delete(selectedSessionId);
        setSessionEvents([]);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
      } finally {
        setLoadingSession(false);
      }
    }
  }, [persistence, selectedSessionId, t]);

  const handleExportJSON = useCallback(() => {
    const data = JSON.stringify(filteredEvents, null, 2);
    const sessionMeta = sessions.find((s) => s.sessionId === selectedSessionId);
    const filename = sessionMeta
      ? `events_${sessionMeta.gameMode}_${new Date(sessionMeta.startedAt).toISOString().slice(0, 10)}.json`
      : 'events.json';
    downloadFile(data, filename, 'application/json');
  }, [filteredEvents, sessions, selectedSessionId]);

  const handleExportCSV = useCallback(() => {
    const csv = eventsToCSV(filteredEvents);
    const sessionMeta = sessions.find((s) => s.sessionId === selectedSessionId);
    const filename = sessionMeta
      ? `events_${sessionMeta.gameMode}_${new Date(sessionMeta.startedAt).toISOString().slice(0, 10)}.csv`
      : 'events.csv';
    downloadFile(csv, filename, 'text/csv');
  }, [filteredEvents, sessions, selectedSessionId]);

  const handleExportSelectedSession = useCallback(async () => {
    if (!selectedSessionId) return;

    setExportingSelected(true);
    setError(null);
    try {
      const events = await loadSessionEvents(selectedSessionId);
      const payload: SessionEventsExport = {
        exportedAt: new Date().toISOString(),
        sessionId: selectedSessionId,
        summary: sessionSummaryById.get(selectedSessionId) ?? null,
        events,
      };
      const date = new Date().toISOString().slice(0, 10);
      downloadFile(
        JSON.stringify(payload, null, 2),
        `session-events-${selectedSessionId}-${date}.json`,
        'application/json',
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setExportingSelected(false);
    }
  }, [loadSessionEvents, selectedSessionId, sessionSummaryById]);

  const handleExportAllSessions = useCallback(async () => {
    setExportingAll(true);
    setError(null);
    try {
      const exportedSessions = await Promise.all(
        sessions.map(async (sessionMeta): Promise<SessionEventsExport> => {
          const events = await loadSessionEvents(sessionMeta.sessionId);
          return {
            exportedAt: new Date().toISOString(),
            sessionId: sessionMeta.sessionId,
            summary: sessionSummaryById.get(sessionMeta.sessionId) ?? null,
            events,
          };
        }),
      );

      const payload: SessionsEventsExport = {
        exportedAt: new Date().toISOString(),
        sessions: exportedSessions,
      };
      const date = new Date().toISOString().slice(0, 10);
      downloadFile(
        JSON.stringify(payload, null, 2),
        `all-session-events-${date}.json`,
        'application/json',
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setExportingAll(false);
    }
  }, [loadSessionEvents, sessionSummaryById, sessions]);

  // Waiting for persistence
  if (!persistence) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <Spinner size={48} className="mx-auto mb-4 text-accent" />
          <p className="text-sm text-muted-foreground">
            {t('admin.events.initializingDb', 'Initializing database...')}
          </p>
        </div>
      </div>
    );
  }

  // Loading state
  if (loadingSessions) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <Spinner size={48} className="mx-auto mb-4 text-accent" />
          <p className="text-sm text-muted-foreground">
            {t('admin.events.loadingSessions', 'Loading sessions...')}
          </p>
        </div>
      </div>
    );
  }

  // Empty state
  if (sessions.length === 0) {
    return (
      <Card className="text-center py-16">
        <p className="text-muted-foreground mb-4">
          {t('admin.events.noSessionsFound', 'No sessions found.')}
        </p>
        <p className="text-sm text-muted-foreground">
          {t(
            'admin.events.noSessionsHint',
            'Play a session to generate a summary, or enable cloud sync to fetch your history.',
          )}
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header actions */}
      <div className="flex items-center justify-between">
        <div className="text-sm space-x-2">
          <span className="font-bold">
            {t('admin.events.sessionsCount', {
              count: sessions.length,
              defaultValue: '{{count}} sessions',
            })}
          </span>
          {selectedSessionId && (
            <span>
              <span className="text-muted-foreground">·</span>{' '}
              <span className="font-bold">
                {t('admin.events.eventsInSelectedSession', {
                  count: sessionEvents.length,
                  defaultValue: '{{count}} events in selected session',
                })}
              </span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void handleExportAllSessions()}
            disabled={exportingAll || sessions.length === 0}
            className="gap-1.5"
          >
            <FileJs size={14} />
            {exportingAll ? t('common.loading', 'Loading...') : 'Export all events'}
          </Button>
          <Button
            variant={includeAbandoned ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setIncludeAbandoned((v) => !v)}
          >
            {includeAbandoned
              ? t('admin.events.includeAbandonedOn', 'Abandoned: on')
              : t('admin.events.includeAbandonedOff', 'Abandoned: off')}
          </Button>
          {sessions.length >= 2 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowCompare(true)}
              className="gap-1.5"
            >
              <ArrowsLeftRight size={14} />
              {t('admin.events.compare', 'Compare')}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={handleRefresh}>
            <ArrowClockwise size={16} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void inspectRawPayload()}
            disabled={!selectedSessionId || rawPayloadLoading}
            title={t('admin.events.inspectPayload', 'Inspect raw payload')}
          >
            <Bug size={16} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDeleteSelectedSession}
            className="text-red-400"
            disabled={!selectedSessionId}
          >
            <Trash size={16} />
          </Button>
          <Button variant="ghost" size="sm" onClick={handleClearLocal} className="text-red-400">
            {t('admin.events.clearLocal', 'Clear local')}
          </Button>
        </div>
      </div>

      {/* Session Selector */}
      <SessionSelector
        sessions={sessions}
        selectedSessionId={selectedSessionId}
        onSelectSession={setSelectedSessionId}
        modeFilter={modeFilter}
        onModeFilterChange={setModeFilter}
      />

      {/* Mini Charts */}
      {selectedSessionId && sessionEvents.length > 0 && (
        <SessionMiniCharts events={sessionEvents} />
      )}

      {/* Data integrity hint (helps diagnose "empty event values") */}
      {selectedSessionId && sessionEvents.length > 0 && payloadCoverage.envelopeOnly > 0 && (
        <Card className="p-3">
          <div className="text-sm font-semibold">
            {t('admin.events.integrity.title', 'Event payload integrity')}
          </div>
          <div className="text-xs text-muted-foreground mt-1 space-y-1">
            <div>
              {t('admin.events.integrity.envelopeOnly', {
                defaultValue: 'Envelope-only events: {{count}} / {{total}}',
                count: payloadCoverage.envelopeOnly,
                total: payloadCoverage.total,
              })}
            </div>
            <div>
              {t('admin.events.integrity.hasTrial', {
                defaultValue: 'Events with trial data: {{count}} / {{total}}',
                count: payloadCoverage.hasTrial,
                total: payloadCoverage.total,
              })}
            </div>
            <div className="opacity-90">
              {t(
                'admin.events.integrity.hint',
                'If events look empty in the grid/modal, click the bug icon to inspect the raw stored payload string.',
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Raw payload sample */}
      {selectedSessionId && (rawPayloadSample || rawPayloadError) && (
        <Card className="p-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">
              {t('admin.events.rawPayload.title', 'Raw payload sample')}
            </div>
            <div className="text-3xs text-muted-foreground">
              {rawPayloadLoading ? t('common.loading', 'Loading...') : null}
            </div>
          </div>
          {rawPayloadError && <div className="text-xs text-red-400 mt-2">{rawPayloadError}</div>}
          {rawPayloadSample && rawPayloadSample.length === 0 && (
            <div className="text-xs text-muted-foreground mt-2">
              {t('admin.events.rawPayload.empty', 'No rows found for this session.')}
            </div>
          )}
          {rawPayloadSample && rawPayloadSample.length > 0 && (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="text-left py-1 pr-2">Type</th>
                    <th className="text-right py-1 pr-2">Len</th>
                    <th className="text-center py-1 pr-2">JSON</th>
                    <th className="text-left py-1">Preview</th>
                  </tr>
                </thead>
                <tbody>
                  {rawPayloadSample.map((row) => (
                    <tr key={row.id} className="border-t border-border/30">
                      <td className="py-1 pr-2 font-mono whitespace-nowrap">{row.type}</td>
                      <td className="py-1 pr-2 font-mono text-right">{row.payloadLen}</td>
                      <td className="py-1 pr-2 text-center font-mono">{row.parseOk ? '✓' : '✗'}</td>
                      <td className="py-1 font-mono text-4xs whitespace-nowrap">
                        {row.payloadPreview || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {loadingSession && (
        <div className="text-xs text-muted-foreground">
          {t('admin.events.loadingSelectedSession', 'Loading selected session events...')}
        </div>
      )}

      {(error ?? sessionsError?.message) && (
        <Card className="p-3">
          <div className="text-sm text-red-400">{t('admin.events.error', 'Error')}</div>
          <div className="text-xs text-muted-foreground mt-1">
            {error ?? sessionsError?.message}
          </div>
        </Card>
      )}

      {/* Search Bar */}
      {selectedSessionId && (
        <SearchBar
          value={searchQuery}
          onChange={setSearchQuery}
          matchCount={filteredEvents.length}
          totalCount={sessionEvents.length}
        />
      )}

      {/* Events Grid */}
      {selectedSessionId && (
        <EventsDataGrid
          events={filteredEvents}
          mode={sessionMode}
          onEventClick={setSelectedEvent}
          startTime={startTime}
        />
      )}

      {/* Export buttons */}
      {selectedSessionId && filteredEvents.length > 0 && (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void handleExportSelectedSession()}
            className="gap-1.5"
            disabled={exportingSelected}
          >
            <FileJs size={14} />
            {exportingSelected ? t('common.loading', 'Loading...') : 'Export session bundle'}
          </Button>
          <Button variant="secondary" size="sm" onClick={handleExportCSV} className="gap-1.5">
            <FileCsv size={14} />
            Export CSV
          </Button>
          <Button variant="secondary" size="sm" onClick={handleExportJSON} className="gap-1.5">
            <FileJs size={14} />
            Export JSON
          </Button>
        </div>
      )}

      {/* Event Detail Modal */}
      {selectedEvent && (
        <EventDetailModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      )}

      {/* Session Compare View */}
      {showCompare && (
        <SessionCompareView
          sessions={sessions}
          loadSessionEvents={loadSessionEvents}
          onClose={() => setShowCompare(false)}
        />
      )}
    </div>
  );
}
