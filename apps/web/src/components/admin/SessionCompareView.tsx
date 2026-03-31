/**
 * SessionCompareView - Side-by-side session comparison
 *
 * Features:
 * - Dual session selectors
 * - Synchronized scroll between tables
 * - Comparative stats (avg RT, accuracy, etc.)
 * - Visual diff highlighting
 */

import type { GameEvent } from '@neurodual/logic';
import { Button, Card } from '@neurodual/ui';
import { ArrowsLeftRight, X, Timer, Target } from '@phosphor-icons/react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type UIEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import type { SessionMeta } from './SessionSelector';
import { EVENT_COLORS, EVENT_SHORT_LABELS } from './event-columns';

// =============================================================================
// Types
// =============================================================================

interface SessionCompareViewProps {
  sessions: SessionMeta[];
  loadSessionEvents: (sessionId: string) => Promise<readonly GameEvent[]>;
  onClose: () => void;
}

interface CompareStats {
  avgRT: number;
  accuracy: number;
  totalResponses: number;
  duration: number;
}

// =============================================================================
// Helpers
// =============================================================================

function computeStats(events: readonly GameEvent[]): CompareStats {
  let totalRT = 0;
  let rtCount = 0;
  let correct = 0;
  let total = 0;
  let startTime = 0;
  let endTime = 0;

  for (const event of events) {
    // Track time
    if (startTime === 0) startTime = event.timestamp;
    endTime = event.timestamp;

    // Extract RT
    if ('reactionTimeMs' in event) {
      const rt = (event as { reactionTimeMs: number }).reactionTimeMs;
      if (rt > 0) {
        totalRT += rt;
        rtCount++;
      }
    }
    if ('placementTimeMs' in event) {
      const rt = (event as { placementTimeMs: number }).placementTimeMs;
      if (rt > 0) {
        totalRT += rt;
        rtCount++;
      }
    }

    // Extract correctness
    if ('correct' in event) {
      total++;
      if ((event as { correct: boolean }).correct) {
        correct++;
      }
    }
  }

  return {
    avgRT: rtCount > 0 ? Math.round(totalRT / rtCount) : 0,
    accuracy: total > 0 ? Math.round((correct / total) * 100) : 0,
    totalResponses: total,
    duration: endTime - startTime,
  };
}

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

// =============================================================================
// Components
// =============================================================================

function SessionDropdown({
  sessions,
  selectedId,
  onSelect,
  label,
}: {
  sessions: SessionMeta[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  label: string;
}): ReactNode {
  const { t, i18n } = useTranslation();
  const selected = sessions.find((s) => s.sessionId === selectedId);

  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <select
        value={selectedId ?? ''}
        onChange={(e) => onSelect(e.target.value)}
        className="w-full p-2 bg-surface border border-border rounded-lg text-sm"
      >
        <option value="">{t('admin.sessions.select', 'Select a session...')}</option>
        {sessions.map((session) => (
          <option key={session.sessionId} value={session.sessionId}>
            {formatDate(session.startedAt, i18n.language)} - {session.gameMode} N-{session.nLevel} ({' '}
            {t('admin.sessions.events', { count: session.eventsCount })})
          </option>
        ))}
      </select>
      {selected && (
        <div className="text-xs text-muted-foreground">
          {t('admin.sessions.events', { count: selected.eventsCount })} |{' '}
          {formatDuration(selected.durationMs)}
        </div>
      )}
    </div>
  );
}

function StatComparison({
  labelA,
  labelB,
  statsA,
  statsB,
}: {
  labelA: string;
  labelB: string;
  statsA: CompareStats;
  statsB: CompareStats;
}): ReactNode {
  const { t } = useTranslation();
  const rtDiff = statsA.avgRT - statsB.avgRT;
  const accDiff = statsA.accuracy - statsB.accuracy;

  return (
    <Card className="mb-4">
      <div className="text-sm font-semibold mb-3">
        {t('admin.compare.comparisonSummary', 'Comparison summary')}
      </div>
      <div className="grid grid-cols-2 gap-4">
        {/* Headers */}
        <div className="text-center text-xs font-medium text-muted-foreground">{labelA}</div>
        <div className="text-center text-xs font-medium text-muted-foreground">{labelB}</div>

        {/* Avg RT */}
        <div className="bg-surface/50 p-3 rounded-lg text-center">
          <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground mb-1">
            <Timer size={12} />
            {t('admin.compare.avgRt', 'Avg RT')}
          </div>
          <div className="font-mono text-lg">{statsA.avgRT}ms</div>
        </div>
        <div className="bg-surface/50 p-3 rounded-lg text-center">
          <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground mb-1">
            <Timer size={12} />
            {t('admin.compare.avgRt', 'Avg RT')}
          </div>
          <div className="font-mono text-lg">{statsB.avgRT}ms</div>
          {rtDiff !== 0 && (
            <div className={`text-xs ${rtDiff > 0 ? 'text-green-400' : 'text-red-400'}`}>
              {rtDiff > 0 ? '-' : '+'}
              {Math.abs(rtDiff)}ms
            </div>
          )}
        </div>

        {/* Accuracy */}
        <div className="bg-surface/50 p-3 rounded-lg text-center">
          <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground mb-1">
            <Target size={12} />
            {t('admin.compare.accuracy', 'Accuracy')}
          </div>
          <div className="font-mono text-lg">{statsA.accuracy}%</div>
        </div>
        <div className="bg-surface/50 p-3 rounded-lg text-center">
          <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground mb-1">
            <Target size={12} />
            {t('admin.compare.accuracy', 'Accuracy')}
          </div>
          <div className="font-mono text-lg">{statsB.accuracy}%</div>
          {accDiff !== 0 && (
            <div className={`text-xs ${accDiff > 0 ? 'text-red-400' : 'text-green-400'}`}>
              {accDiff > 0 ? '-' : '+'}
              {Math.abs(accDiff)}%
            </div>
          )}
        </div>

        {/* Duration */}
        <div className="text-center text-xs text-muted-foreground">
          {t('admin.compare.duration', 'Duration')}: {formatDuration(statsA.duration)}
        </div>
        <div className="text-center text-xs text-muted-foreground">
          {t('admin.compare.duration', 'Duration')}: {formatDuration(statsB.duration)}
        </div>
      </div>
    </Card>
  );
}

function EventTable({
  events,
  startTime,
  scrollRef,
  onScroll,
}: {
  events: readonly GameEvent[];
  startTime: number;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onScroll: (e: UIEvent<HTMLDivElement>) => void;
}): ReactNode {
  const { t } = useTranslation();
  return (
    <div
      ref={scrollRef}
      className="h-[400px] overflow-y-auto border border-border rounded-lg"
      onScroll={onScroll}
    >
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-surface z-10">
          <tr className="border-b border-border">
            <th className="px-2 py-1.5 text-left text-muted-foreground">
              {t('admin.compare.timeHeader', '+time')}
            </th>
            <th className="px-2 py-1.5 text-left text-muted-foreground">
              {t('admin.compare.typeHeader', 'type')}
            </th>
            <th className="px-2 py-1.5 text-right text-muted-foreground">
              {t('admin.compare.valueHeader', 'value')}
            </th>
          </tr>
        </thead>
        <tbody>
          {events.map((event, idx) => {
            const relTime = ((event.timestamp - startTime) / 1000).toFixed(2);
            const eventColor = EVENT_COLORS[event.type] ?? 'bg-gray-500';

            // Extract main value
            let value = '-';
            if ('correct' in event) {
              value = (event as { correct: boolean }).correct ? '✓' : '✗';
            } else if ('reactionTimeMs' in event) {
              value = `${(event as { reactionTimeMs: number }).reactionTimeMs}ms`;
            } else if ('nLevel' in event) {
              value = `N-${(event as { nLevel: number }).nLevel}`;
            }

            return (
              <tr
                key={event.id}
                className={`border-b border-border/20 ${idx % 2 === 0 ? '' : 'bg-surface/30'}`}
              >
                <td className="px-2 py-1 font-mono text-muted-foreground">{relTime}s</td>
                <td className="px-2 py-1">
                  <span
                    className={`inline-block px-1.5 py-0.5 rounded text-3xs font-bold text-white ${eventColor}`}
                  >
                    {EVENT_SHORT_LABELS[event.type] ?? event.type.slice(0, 6)}
                  </span>
                </td>
                <td className="px-2 py-1 text-right font-mono">{value}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function SessionCompareView({
  sessions,
  loadSessionEvents,
  onClose,
}: SessionCompareViewProps): ReactNode {
  const { t, i18n } = useTranslation();
  const [sessionA, setSessionA] = useState<string | null>(null);
  const [sessionB, setSessionB] = useState<string | null>(null);
  const [isSyncScroll, setIsSyncScroll] = useState(true);
  const [loadingA, setLoadingA] = useState(false);
  const [loadingB, setLoadingB] = useState(false);
  const [errorA, setErrorA] = useState<string | null>(null);
  const [errorB, setErrorB] = useState<string | null>(null);
  const [eventsA, setEventsA] = useState<readonly GameEvent[]>([]);
  const [eventsB, setEventsB] = useState<readonly GameEvent[]>([]);

  const scrollRefA = useRef<HTMLDivElement>(null);
  const scrollRefB = useRef<HTMLDivElement>(null);
  const isScrolling = useRef(false);

  useEffect(() => {
    let cancelled = false;
    if (!sessionA) {
      setEventsA([]);
      setErrorA(null);
      setLoadingA(false);
      return;
    }
    setLoadingA(true);
    setErrorA(null);
    loadSessionEvents(sessionA)
      .then((events) => {
        if (cancelled) return;
        setEventsA(events);
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        setErrorA(message);
      })
      .finally(() => {
        if (cancelled) return;
        setLoadingA(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadSessionEvents, sessionA]);

  useEffect(() => {
    let cancelled = false;
    if (!sessionB) {
      setEventsB([]);
      setErrorB(null);
      setLoadingB(false);
      return;
    }
    setLoadingB(true);
    setErrorB(null);
    loadSessionEvents(sessionB)
      .then((events) => {
        if (cancelled) return;
        setEventsB(events);
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        setErrorB(message);
      })
      .finally(() => {
        if (cancelled) return;
        setLoadingB(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadSessionEvents, sessionB]);

  // Compute stats
  const statsA = useMemo(() => computeStats(eventsA), [eventsA]);
  const statsB = useMemo(() => computeStats(eventsB), [eventsB]);

  // Get start times
  const startTimeA = eventsA.length > 0 ? (eventsA[0]?.timestamp ?? 0) : 0;
  const startTimeB = eventsB.length > 0 ? (eventsB[0]?.timestamp ?? 0) : 0;

  // Synchronized scroll handlers
  const handleScrollA = useCallback(
    (e: UIEvent<HTMLDivElement>) => {
      if (!isSyncScroll || isScrolling.current) return;
      isScrolling.current = true;

      const target = e.currentTarget;
      if (scrollRefB.current) {
        const scrollPercentage = target.scrollTop / (target.scrollHeight - target.clientHeight);
        const bScrollHeight = scrollRefB.current.scrollHeight - scrollRefB.current.clientHeight;
        scrollRefB.current.scrollTop = scrollPercentage * bScrollHeight;
      }

      requestAnimationFrame(() => {
        isScrolling.current = false;
      });
    },
    [isSyncScroll],
  );

  const handleScrollB = useCallback(
    (e: UIEvent<HTMLDivElement>) => {
      if (!isSyncScroll || isScrolling.current) return;
      isScrolling.current = true;

      const target = e.currentTarget;
      if (scrollRefA.current) {
        const scrollPercentage = target.scrollTop / (target.scrollHeight - target.clientHeight);
        const aScrollHeight = scrollRefA.current.scrollHeight - scrollRefA.current.clientHeight;
        scrollRefA.current.scrollTop = scrollPercentage * aScrollHeight;
      }

      requestAnimationFrame(() => {
        isScrolling.current = false;
      });
    },
    [isSyncScroll],
  );

  const metaA = sessions.find((s) => s.sessionId === sessionA);
  const metaB = sessions.find((s) => s.sessionId === sessionB);

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm overflow-y-auto">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <ArrowsLeftRight size={24} className="text-accent" />
            <h2 className="text-xl font-bold">{t('admin.compare.title', 'Session comparison')}</h2>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={isSyncScroll}
                onChange={(e) => setIsSyncScroll(e.target.checked)}
                className="rounded"
              />
              {t('admin.compare.syncScroll', 'Sync scroll')}
            </label>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X size={16} />
            </Button>
          </div>
        </div>

        {/* Session Selectors */}
        <div className="grid grid-cols-2 gap-6 mb-6">
          <SessionDropdown
            sessions={sessions}
            selectedId={sessionA}
            onSelect={setSessionA}
            label={t('admin.compare.sessionA', 'Session A')}
          />
          <SessionDropdown
            sessions={sessions.filter((s) => s.sessionId !== sessionA)}
            selectedId={sessionB}
            onSelect={setSessionB}
            label={t('admin.compare.sessionB', 'Session B')}
          />
        </div>

        {/* Stats Comparison */}
        {sessionA && sessionB && eventsA.length > 0 && eventsB.length > 0 && (
          <StatComparison
            labelA={
              metaA
                ? `${metaA.gameMode} (${formatDate(metaA.startedAt, i18n.language)})`
                : t('admin.compare.sessionA', 'Session A')
            }
            labelB={
              metaB
                ? `${metaB.gameMode} (${formatDate(metaB.startedAt, i18n.language)})`
                : t('admin.compare.sessionB', 'Session B')
            }
            statsA={statsA}
            statsB={statsB}
          />
        )}

        {/* Side-by-side tables */}
        <div className="grid grid-cols-2 gap-6">
          <div>
            <div className="text-sm font-medium mb-2 text-muted-foreground">
              {t('admin.compare.sessionA', 'Session A')}{' '}
              {loadingA
                ? `(${t('admin.compare.loading', 'loading...')})`
                : eventsA.length > 0
                  ? `(${t('admin.sessions.events', { count: eventsA.length })})`
                  : ''}
            </div>
            {errorA ? (
              <div className="h-[400px] flex items-center justify-center border border-dashed border-border rounded-lg text-red-400">
                {errorA}
              </div>
            ) : eventsA.length > 0 ? (
              <EventTable
                events={eventsA}
                startTime={startTimeA}
                scrollRef={scrollRefA}
                onScroll={handleScrollA}
              />
            ) : (
              <div className="h-[400px] flex items-center justify-center border border-dashed border-border rounded-lg text-muted-foreground">
                {t('admin.compare.selectSession', 'Select a session')}
              </div>
            )}
          </div>
          <div>
            <div className="text-sm font-medium mb-2 text-muted-foreground">
              {t('admin.compare.sessionB', 'Session B')}{' '}
              {loadingB
                ? `(${t('admin.compare.loading', 'loading...')})`
                : eventsB.length > 0
                  ? `(${t('admin.sessions.events', { count: eventsB.length })})`
                  : ''}
            </div>
            {errorB ? (
              <div className="h-[400px] flex items-center justify-center border border-dashed border-border rounded-lg text-red-400">
                {errorB}
              </div>
            ) : eventsB.length > 0 ? (
              <EventTable
                events={eventsB}
                startTime={startTimeB}
                scrollRef={scrollRefB}
                onScroll={handleScrollB}
              />
            ) : (
              <div className="h-[400px] flex items-center justify-center border border-dashed border-border rounded-lg text-muted-foreground">
                {t('admin.compare.selectSession', 'Select a session')}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
