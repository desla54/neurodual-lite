/**
 * SessionSelector - Session picker with enriched metadata
 *
 * Features:
 * - Dropdown with session preview (date, mode, N-level, events count, duration)
 * - Filter chips by mode (Tempo, Flow, Recall, DualPick, Trace)
 * - Sorted by date (most recent first)
 */

import type { GameEvent } from '@neurodual/logic';
import { Card } from '@neurodual/ui';
import {
  CaretDown,
  GameController,
  ArrowsClockwise,
  Brain,
  Tag,
  PencilLine,
} from '@phosphor-icons/react';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { type SessionMode, getEventMode } from './event-columns';

// =============================================================================
// Types
// =============================================================================

export interface SessionMeta {
  sessionId: string;
  startedAt: number;
  endedAt?: number;
  mode: SessionMode;
  gameMode: string;
  nLevel: number;
  eventsCount: number;
  durationMs: number;
  score?: number;
  reason?: 'completed' | 'abandoned' | 'error';
}

interface SessionSelectorProps {
  sessions: SessionMeta[];
  selectedSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  modeFilter: SessionMode | 'all';
  onModeFilterChange: (mode: SessionMode | 'all') => void;
}

// =============================================================================
// Mode Icons & Colors
// =============================================================================

const MODE_CONFIG: Record<
  SessionMode,
  {
    icon: ReactNode;
    labelKey: string;
    labelDefault: string;
    color: string;
  }
> = {
  tempo: {
    icon: <GameController size={14} weight="bold" />,
    labelKey: 'admin.sessions.modes.tempo',
    labelDefault: 'Tempo',
    color: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  },
  flow: {
    icon: <ArrowsClockwise size={14} weight="bold" />,
    labelKey: 'admin.sessions.modes.flow',
    labelDefault: 'Dual Place',
    color: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  },
  recall: {
    icon: <Brain size={14} weight="bold" />,
    labelKey: 'admin.sessions.modes.recall',
    labelDefault: 'Dual Memo',
    color: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  },
  'dual-pick': {
    icon: <Tag size={14} weight="bold" />,
    labelKey: 'admin.sessions.modes.dualPick',
    labelDefault: 'Dual Pick',
    color: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  },
  trace: {
    icon: <PencilLine size={14} weight="bold" />,
    labelKey: 'admin.sessions.modes.trace',
    labelDefault: 'Dual Trace',
    color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  },
};

// =============================================================================
// Helper Functions
// =============================================================================

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function formatDate(timestamp: number, locale?: string): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString(locale, {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Extract session metadata from events
 */
export function extractSessionsMeta(events: readonly GameEvent[]): SessionMeta[] {
  const sessionsMap = new Map<
    string,
    { events: GameEvent[]; startEvent?: GameEvent; endEvent?: GameEvent }
  >();

  // Group events by session
  for (const event of events) {
    const sessionId = event.sessionId;
    if (!sessionsMap.has(sessionId)) {
      sessionsMap.set(sessionId, { events: [] });
    }
    const session = sessionsMap.get(sessionId);
    if (!session) continue;
    session.events.push(event);

    // Track start/end events
    if (
      event.type === 'SESSION_STARTED' ||
      event.type === 'FLOW_SESSION_STARTED' ||
      event.type === 'RECALL_SESSION_STARTED' ||
      event.type === 'DUAL_PICK_SESSION_STARTED' ||
      event.type === 'TRACE_SESSION_STARTED'
    ) {
      session.startEvent = event;
    }
    if (
      event.type === 'SESSION_ENDED' ||
      event.type === 'FLOW_SESSION_ENDED' ||
      event.type === 'RECALL_SESSION_ENDED' ||
      event.type === 'DUAL_PICK_SESSION_ENDED' ||
      event.type === 'TRACE_SESSION_ENDED'
    ) {
      session.endEvent = event;
    }
  }

  // Build metadata
  const metas: SessionMeta[] = [];
  for (const [sessionId, { events: sessionEvents, startEvent, endEvent }] of sessionsMap) {
    if (!startEvent) continue; // Skip orphan events

    const mode = getEventMode(startEvent.type);

    // Extract nLevel
    let nLevel = 0;
    if ('nLevel' in startEvent) {
      nLevel = (startEvent as { nLevel: number }).nLevel;
    } else if ('config' in startEvent) {
      const config = (startEvent as { config?: { nLevel?: number } }).config;
      nLevel = config?.nLevel ?? 0;
    }

    // Extract gameMode
    let gameMode = 'unknown';
    if ('gameMode' in startEvent) {
      gameMode = (startEvent as { gameMode?: string }).gameMode ?? 'unknown';
    }

    // Duration
    const startTime = startEvent.timestamp;
    const endTime =
      endEvent?.timestamp ?? sessionEvents[sessionEvents.length - 1]?.timestamp ?? startTime;
    const durationMs = endTime - startTime;

    // Reason
    let reason: 'completed' | 'abandoned' | 'error' | undefined;
    if (endEvent && 'reason' in endEvent) {
      reason = (endEvent as { reason: 'completed' | 'abandoned' | 'error' }).reason;
    }

    metas.push({
      sessionId,
      startedAt: startTime,
      endedAt: endEvent?.timestamp,
      mode,
      gameMode,
      nLevel,
      eventsCount: sessionEvents.length,
      durationMs,
      reason,
    });
  }

  // Sort by date (most recent first)
  return metas.sort((a, b) => b.startedAt - a.startedAt);
}

// =============================================================================
// Components
// =============================================================================

function ModeChip({
  mode,
  active,
  onClick,
  count,
}: {
  mode: SessionMode | 'all';
  active: boolean;
  onClick: () => void;
  count: number;
}): ReactNode {
  const { t } = useTranslation();
  const config = mode === 'all' ? null : MODE_CONFIG[mode];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border transition-all
        ${
          active
            ? mode === 'all'
              ? 'bg-white/10 text-white border-white/30'
              : config?.color
            : 'bg-transparent text-muted-foreground border-border/50 opacity-60 hover:opacity-100'
        }
      `}
    >
      {config?.icon}
      <span>
        {mode === 'all'
          ? t('admin.sessions.all', 'All')
          : config
            ? t(config.labelKey, config.labelDefault)
            : ''}
      </span>
      <span className="opacity-60">({count})</span>
    </button>
  );
}

function SessionOption({
  session,
  selected,
  onClick,
}: {
  session: SessionMeta;
  selected: boolean;
  onClick: () => void;
}): ReactNode {
  const { t, i18n } = useTranslation();
  const config = MODE_CONFIG[session.mode];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        w-full text-left p-3 flex items-center gap-3 transition-colors rounded-lg
        ${selected ? 'bg-accent/10' : 'hover:bg-surface'}
      `}
    >
      {/* Mode icon */}
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${config.color}`}>
        {config.icon}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">
            {formatDate(session.startedAt, i18n.language)}
          </span>
          <span className="text-xs text-muted-foreground">{session.gameMode}</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
          <span>N-{session.nLevel}</span>
          <span>{t('admin.sessions.events', { count: session.eventsCount })}</span>
          <span>{formatDuration(session.durationMs)}</span>
          {session.reason && (
            <span
              className={`px-1.5 py-0.5 rounded text-3xs font-medium ${
                session.reason === 'completed'
                  ? 'bg-green-500/20 text-green-400'
                  : session.reason === 'abandoned'
                    ? 'bg-amber-500/20 text-amber-400'
                    : 'bg-red-500/20 text-red-400'
              }`}
            >
              {t(`admin.sessions.reasons.${session.reason}`, session.reason)}
            </span>
          )}
        </div>
      </div>

      {/* Selected indicator */}
      {selected && <div className="w-2 h-2 rounded-full bg-accent" />}
    </button>
  );
}

export function SessionSelector({
  sessions,
  selectedSessionId,
  onSelectSession,
  modeFilter,
  onModeFilterChange,
}: SessionSelectorProps): ReactNode {
  const { t, i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  // Filter sessions by mode
  const filteredSessions = useMemo(() => {
    if (modeFilter === 'all') return sessions;
    return sessions.filter((s) => s.mode === modeFilter);
  }, [sessions, modeFilter]);

  // Count by mode
  const modeCounts = useMemo(() => {
    const counts: Record<SessionMode | 'all', number> = {
      all: sessions.length,
      tempo: 0,
      flow: 0,
      recall: 0,
      'dual-pick': 0,
      trace: 0,
    };
    for (const s of sessions) {
      counts[s.mode]++;
    }
    return counts;
  }, [sessions]);

  const selectedSession = sessions.find((s) => s.sessionId === selectedSessionId);

  const handleSelectSession = useCallback(
    (sessionId: string) => {
      onSelectSession(sessionId);
      setIsOpen(false);
    },
    [onSelectSession],
  );

  return (
    <Card className="mb-4">
      {/* Mode filter chips */}
      <div className="flex flex-wrap gap-2 mb-3">
        <ModeChip
          mode="all"
          active={modeFilter === 'all'}
          onClick={() => onModeFilterChange('all')}
          count={modeCounts.all}
        />
        {(['tempo', 'flow', 'recall', 'dual-pick', 'trace'] as SessionMode[]).map((mode) => (
          <ModeChip
            key={mode}
            mode={mode}
            active={modeFilter === mode}
            onClick={() => onModeFilterChange(mode)}
            count={modeCounts[mode]}
          />
        ))}
      </div>

      {/* Session dropdown */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between p-3 bg-surface border border-border rounded-lg hover:border-border/80 transition-colors"
        >
          {selectedSession ? (
            <div className="flex items-center gap-3">
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center ${MODE_CONFIG[selectedSession.mode].color}`}
              >
                {MODE_CONFIG[selectedSession.mode].icon}
              </div>
              <div className="text-left">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">
                    {formatDate(selectedSession.startedAt, i18n.language)}
                  </span>
                  <span className="text-xs text-muted-foreground">{selectedSession.gameMode}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  N-{selectedSession.nLevel} |{' '}
                  {t('admin.sessions.events', { count: selectedSession.eventsCount })} |{' '}
                  {formatDuration(selectedSession.durationMs)}
                </div>
              </div>
            </div>
          ) : (
            <span className="text-muted-foreground">
              {t('admin.sessions.select', 'Select a session...')}
            </span>
          )}
          <CaretDown
            size={16}
            className={`text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {/* Dropdown */}
        {isOpen && (
          <div className="absolute z-50 w-full mt-2 bg-background border border-border rounded-lg shadow-lg max-h-80 overflow-y-auto">
            {filteredSessions.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground text-sm">
                {t('admin.sessions.noSessionsFound', 'No sessions found')}
              </div>
            ) : (
              <div className="p-1">
                {filteredSessions.map((session) => (
                  <SessionOption
                    key={session.sessionId}
                    session={session}
                    selected={session.sessionId === selectedSessionId}
                    onClick={() => handleSelectSession(session.sessionId)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="mt-2 text-xs text-muted-foreground">
        {t('admin.sessions.sessionsAvailable', { count: filteredSessions.length })}
      </div>
    </Card>
  );
}
