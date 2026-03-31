/**
 * AdminHealthTab - Session health monitoring
 *
 * Displays:
 * - Recent sessions table with healthMetrics
 * - Quality badge (high/medium/degraded)
 * - Alerts for degraded sessions
 * - Detailed metrics on click
 */

import { Button, Card, useAdminRecentSessionHealthQuery, useEffectiveUserId } from '@neurodual/ui';
import { ArrowClockwise, Warning, CheckCircle, WarningCircle } from '@phosphor-icons/react';
import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

// SessionHealthMetrics interface (matches logic/types/events.ts)
interface SessionHealthMetrics {
  readonly processingLag: {
    readonly min: number;
    readonly max: number;
    readonly avg: number;
    readonly p95: number;
  };
  readonly eventLoopLagAtStartMs: number;
  readonly rtStabilityCV: number;
  readonly focusLossCount: number;
  readonly totalFocusLostMs: number;
  readonly freezeCount: number;
  readonly longTaskCount: number;
  readonly reliabilityScore: number;
  readonly quality: 'high' | 'medium' | 'degraded';
}

// =============================================================================
// Types
// =============================================================================

interface SessionHealthRow {
  sessionId: string;
  timestamp: number;
  nLevel: number;
  quality: 'high' | 'medium' | 'degraded';
  reliabilityScore: number;
  healthMetrics: SessionHealthMetrics;
}

// =============================================================================
// Quality Badge Component
// =============================================================================

function QualityBadge({ quality }: { quality: 'high' | 'medium' | 'degraded' }): ReactNode {
  const { t } = useTranslation();
  const colors = {
    high: 'bg-green-500/20 text-green-400 border-green-500/30',
    medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    degraded: 'bg-red-500/20 text-red-400 border-red-500/30',
  };

  const icons = {
    high: <CheckCircle size={14} weight="bold" />,
    medium: <WarningCircle size={14} weight="bold" />,
    degraded: <Warning size={14} weight="bold" />,
  };

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full border ${colors[quality]}`}
    >
      {icons[quality]}
      {t(`admin.health.quality_${quality}`, quality)}
    </span>
  );
}

// =============================================================================
// Session Details Modal
// =============================================================================

function SessionDetails({
  session,
  onClose,
}: {
  session: SessionHealthRow;
  onClose: () => void;
}): ReactNode {
  const { t, i18n } = useTranslation();
  const { healthMetrics } = session;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm safe-overlay-padding">
      <Card className="w-full max-w-lg max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">
            {t('admin.health.sessionDetailsTitle', 'Session details')}
          </h3>
          <Button variant="ghost" size="sm" onClick={onClose}>
            &times;
          </Button>
        </div>

        <div className="space-y-4">
          {/* Session Info */}
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-muted-foreground">
                {t('admin.health.sessionId', 'Session ID')}:
              </span>
              <span className="ml-2 font-mono">{session.sessionId.slice(0, 12)}...</span>
            </div>
            <div>
              <span className="text-muted-foreground">{t('admin.health.nLevel', 'N level')}:</span>
              <span className="ml-2 font-bold">N-{session.nLevel}</span>
            </div>
            <div>
              <span className="text-muted-foreground">{t('admin.health.date', 'Date')}:</span>
              <span className="ml-2">
                {new Date(session.timestamp).toLocaleString(i18n.language)}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">{t('admin.health.quality', 'Quality')}:</span>
              <span className="ml-2">
                <QualityBadge quality={session.quality} />
              </span>
            </div>
          </div>

          {/* Reliability Score */}
          <div className="bg-surface rounded-lg p-4 text-center">
            <div className="text-3xl font-bold">{healthMetrics.reliabilityScore.toFixed(0)}</div>
            <div className="text-sm text-muted-foreground">
              {t('admin.health.reliabilityScore', 'Reliability Score')}
            </div>
          </div>

          {/* Processing Lag */}
          <div>
            <h4 className="text-sm font-bold mb-2">
              {t('admin.health.processingLag', 'Processing Lag')}
            </h4>
            <div className="grid grid-cols-4 gap-2 text-xs">
              <div className="bg-surface rounded p-2 text-center">
                <div className="font-bold">{healthMetrics.processingLag.min.toFixed(1)}ms</div>
                <div className="text-muted-foreground">
                  {t('admin.health.statLabels.min', 'min')}
                </div>
              </div>
              <div className="bg-surface rounded p-2 text-center">
                <div className="font-bold">{healthMetrics.processingLag.avg.toFixed(1)}ms</div>
                <div className="text-muted-foreground">
                  {t('admin.health.statLabels.avg', 'avg')}
                </div>
              </div>
              <div className="bg-surface rounded p-2 text-center">
                <div className="font-bold">{healthMetrics.processingLag.max.toFixed(1)}ms</div>
                <div className="text-muted-foreground">
                  {t('admin.health.statLabels.max', 'max')}
                </div>
              </div>
              <div className="bg-surface rounded p-2 text-center">
                <div className="font-bold">{healthMetrics.processingLag.p95.toFixed(1)}ms</div>
                <div className="text-muted-foreground">
                  {t('admin.health.statLabels.p95', 'p95')}
                </div>
              </div>
            </div>
          </div>

          {/* Other Metrics */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="bg-surface rounded p-3">
              <div className="text-muted-foreground text-xs mb-1">
                {t('admin.health.metrics.eventLoopLag', 'Event loop lag at start')}
              </div>
              <div className="font-bold">{healthMetrics.eventLoopLagAtStartMs.toFixed(1)}ms</div>
            </div>
            <div className="bg-surface rounded p-3">
              <div className="text-muted-foreground text-xs mb-1">
                {t('admin.health.metrics.rtStability', 'RT stability (CV)')}
              </div>
              <div className="font-bold">{healthMetrics.rtStabilityCV.toFixed(3)}</div>
            </div>
            <div className="bg-surface rounded p-3">
              <div className="text-muted-foreground text-xs mb-1">
                {t('admin.health.metrics.focusLoss', 'Focus loss')}
              </div>
              <div className="font-bold">
                {healthMetrics.focusLossCount}x (
                {(healthMetrics.totalFocusLostMs / 1000).toFixed(1)}s)
              </div>
            </div>
            <div className="bg-surface rounded p-3">
              <div className="text-muted-foreground text-xs mb-1">
                {t('admin.health.metrics.freezes', 'Freezes')} /{' '}
                {t('admin.health.metrics.longTasks', 'Long tasks')}
              </div>
              <div className="font-bold">
                {healthMetrics.freezeCount} / {healthMetrics.longTaskCount}
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function AdminHealthTab(): ReactNode {
  const { t, i18n } = useTranslation();
  const [selectedSession, setSelectedSession] = useState<SessionHealthRow | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const userId = useEffectiveUserId();
  const {
    data: rows,
    isPending: loading,
    error,
  } = useAdminRecentSessionHealthQuery(userId, refreshToken);

  const sessions = useMemo<SessionHealthRow[]>(() => {
    if (!rows) return [];
    return rows
      .map((row) => {
        if (!row.health_metrics) return null;
        try {
          const healthMetrics = JSON.parse(row.health_metrics) as SessionHealthMetrics;
          return {
            sessionId: row.session_id,
            timestamp: Number(row.timestamp),
            nLevel: row.n_level == null ? 2 : Number(row.n_level),
            quality: healthMetrics.quality,
            reliabilityScore: healthMetrics.reliabilityScore,
            healthMetrics,
          };
        } catch {
          return null;
        }
      })
      .filter((r): r is SessionHealthRow => r !== null);
  }, [rows, rows?.length]);

  // Count by quality
  const highCount = sessions.filter((s) => s.quality === 'high').length;
  const mediumCount = sessions.filter((s) => s.quality === 'medium').length;
  const degradedCount = sessions.filter((s) => s.quality === 'degraded').length;

  // Degraded sessions for alerts
  const degradedSessions = sessions.filter((s) => s.quality === 'degraded');

  const formatDate = (ts: number) =>
    new Date(ts).toLocaleDateString(i18n.language, {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <div className="space-y-6">
      {/* Header with stats */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-3">
          <div className="px-3 py-1 rounded-full bg-green-500/20 text-green-400 text-sm">
            <CheckCircle size={14} weight="bold" className="inline mr-1" />
            {highCount} {t('admin.health.quality_high', 'High')}
          </div>
          <div className="px-3 py-1 rounded-full bg-yellow-500/20 text-yellow-400 text-sm">
            <WarningCircle size={14} weight="bold" className="inline mr-1" />
            {mediumCount} {t('admin.health.quality_medium', 'Medium')}
          </div>
          <div className="px-3 py-1 rounded-full bg-red-500/20 text-red-400 text-sm">
            <Warning size={14} weight="bold" className="inline mr-1" />
            {degradedCount} {t('admin.health.quality_degraded', 'Degraded')}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setRefreshToken((v) => v + 1)}
          disabled={loading}
        >
          <ArrowClockwise size={16} className={loading ? 'animate-spin' : ''} />
          {t('admin.health.refresh', 'Refresh')}
        </Button>
      </div>

      {error && (
        <Card className="p-3">
          <div className="text-sm text-red-400">{t('admin.health.errorTitle', 'Error')}</div>
          <div className="text-xs text-muted-foreground mt-1">{String(error)}</div>
        </Card>
      )}

      {/* Alerts for degraded sessions */}
      {degradedSessions.length > 0 && (
        <Card className="border-red-500/30 bg-red-500/5">
          <div className="flex items-center gap-2 mb-3">
            <Warning size={20} weight="bold" className="text-red-400" />
            <h3 className="font-bold text-red-400">
              {t('admin.health.alertsTitle', 'Degraded Sessions')}
            </h3>
          </div>
          <div className="space-y-2">
            {degradedSessions.slice(0, 5).map((s) => (
              <div
                key={s.sessionId}
                className="flex items-center justify-between p-2 bg-red-500/10 rounded text-sm"
              >
                <div>
                  <span className="font-mono">{s.sessionId.slice(0, 8)}...</span>
                  <span className="text-muted-foreground ml-2">{formatDate(s.timestamp)}</span>
                </div>
                <div className="text-right">
                  <span className="text-red-400 font-bold">
                    {t('admin.health.score', 'Score')}: {s.reliabilityScore.toFixed(0)}
                  </span>
                  {s.healthMetrics.processingLag.max > 50 && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {t('admin.health.processingLag', 'Processing lag')}:{' '}
                      {s.healthMetrics.processingLag.max.toFixed(0)}ms
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Sessions table */}
      <Card>
        <h3 className="font-bold mb-4">
          {t('admin.health.recentSessions', 'Recent Sessions')} ({sessions.length})
        </h3>

        {loading ? (
          <div className="text-center py-8 text-muted-foreground">
            {t('admin.health.loading', 'Loading...')}
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {t('admin.health.noSessions', 'No sessions with health metrics yet.')}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left p-2">{t('admin.health.sessionId', 'Session ID')}</th>
                  <th className="text-left p-2">{t('admin.health.date', 'Date')}</th>
                  <th className="text-center p-2">{t('admin.health.nLevel', 'N level')}</th>
                  <th className="text-center p-2">{t('admin.health.quality', 'Quality')}</th>
                  <th className="text-center p-2">{t('admin.health.score', 'Score')}</th>
                  <th className="text-center p-2">
                    {t('admin.health.processingLag', 'Processing lag')} (p95)
                  </th>
                  <th className="text-center p-2">{t('admin.health.actions', 'Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr
                    key={s.sessionId}
                    className="border-b border-border/50 hover:bg-surface/50 cursor-pointer"
                    onClick={() => setSelectedSession(s)}
                  >
                    <td className="p-2 font-mono">{s.sessionId.slice(0, 12)}...</td>
                    <td className="p-2">{formatDate(s.timestamp)}</td>
                    <td className="p-2 text-center font-bold">N-{s.nLevel}</td>
                    <td className="p-2 text-center">
                      <QualityBadge quality={s.quality} />
                    </td>
                    <td className="p-2 text-center font-bold">{s.reliabilityScore.toFixed(0)}</td>
                    <td className="p-2 text-center">
                      {s.healthMetrics.processingLag.p95.toFixed(1)}ms
                    </td>
                    <td className="p-2 text-center">
                      <Button variant="ghost" size="sm">
                        {t('admin.health.view', 'View')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Session details modal */}
      {selectedSession && (
        <SessionDetails session={selectedSession} onClose={() => setSelectedSession(null)} />
      )}
    </div>
  );
}
