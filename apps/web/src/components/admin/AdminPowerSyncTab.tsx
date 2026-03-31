import type { PersistenceHealthData, ReadModelSnapshot } from '@neurodual/logic';
import { Button, Card } from '@neurodual/ui';
import { ArrowClockwise, Database, WarningCircle } from '@phosphor-icons/react';
import { useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppPorts } from '../../providers';

function useSubscribable<T>(store: {
  subscribe: (l: () => void) => () => void;
  getSnapshot: () => T;
}): T {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

function formatMaybeNumber(value: number | null): string {
  return value === null ? '-' : String(value);
}

function formatMaybeFloat(value: number | null, suffix = ''): string {
  return value === null ? '-' : `${value.toFixed(1)}${suffix}`;
}

function formatMaybeMs(value: number | null): string {
  return value === null ? '-' : `${Math.round(value)} ms`;
}

function formatMaybeIso(value: string | null): string {
  return value ?? '-';
}

function formatSyncBlockedReason(
  value:
    | 'supabase-not-configured'
    | 'not-authenticated'
    | 'no-cloud-sync'
    | 'secondary-tab'
    | 'instance-guard-blocked'
    | null
    | undefined,
): string {
  switch (value) {
    case 'supabase-not-configured':
      return 'supabase-not-configured';
    case 'not-authenticated':
      return 'not-authenticated';
    case 'no-cloud-sync':
      return 'no-cloud-sync';
    case 'secondary-tab':
      return 'secondary-tab';
    case 'instance-guard-blocked':
      return 'instance-guard-blocked';
    default:
      return '-';
  }
}

export function AdminPowerSyncTab(): ReactNode {
  const { t } = useTranslation();
  const { persistenceHealth } = useAppPorts();
  const store = useMemo(() => persistenceHealth.watchHealth(), [persistenceHealth]);
  const snap = useSubscribable<ReadModelSnapshot<PersistenceHealthData>>(store);

  const data = snap.data;

  const sync = data.sync;
  const projections = data.projections;
  const runtime = data.powerSync;

  const resetVfsPreference = () => {
    try {
      localStorage.removeItem('neurodual_powersync_vfs_pref_v1');
    } catch {
      // ignore
    }
    try {
      localStorage.removeItem('neurodual_powersync_runtime_v1');
    } catch {
      // ignore
    }
    window.location.reload();
  };

  const hasMismatch = projections.status === 'degraded' || projections.status === 'error';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Database size={18} weight="bold" />
          <h2 className="text-lg font-bold">{t('admin.powersync.title', 'PowerSync / SQLite')}</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => persistenceHealth.refresh()}>
            <ArrowClockwise size={16} weight="bold" />
            {t('admin.powersync.refresh', 'Refresh')}
          </Button>
          <Button variant="ghost" size="sm" onClick={resetVfsPreference}>
            {t('admin.powersync.resetVfsPreference', 'Reset VFS preference')}
          </Button>
        </div>
      </div>

      {snap.error && (
        <Card className="border-red-500/30 bg-red-500/10">
          <div className="flex items-start gap-2">
            <WarningCircle size={18} className="text-red-300 mt-0.5" />
            <div>
              <div className="font-bold">{t('admin.powersync.healthError', 'Health error')}</div>
              <div className="text-sm text-muted-foreground">{String(snap.error)}</div>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <div className="font-bold mb-2">{t('admin.powersync.sync.title', 'Sync')}</div>
          <div className="text-sm space-y-1">
            <div>
              {t('admin.powersync.sync.status', 'Status')}:{' '}
              <span className="font-mono">{sync.status}</span>
            </div>
            <div>
              {t('admin.powersync.sync.available', 'Available')}:{' '}
              <span className="font-mono">{String(sync.isAvailable)}</span>
            </div>
            <div>
              {t('admin.powersync.sync.pending', 'Pending')}:{' '}
              <span className="font-mono">{sync.pendingCount}</span>
            </div>
            <div>
              {t('admin.powersync.sync.lastSync', 'Last sync')}:{' '}
              <span className="font-mono">
                {sync.lastSyncAt ? new Date(sync.lastSyncAt).toISOString() : '-'}
              </span>
            </div>
            <div>
              {t('admin.powersync.sync.error', 'Error')}:{' '}
              <span className="font-mono">{sync.errorMessage ?? '-'}</span>
            </div>
            <div>
              {t('admin.powersync.sync.blockedReason', 'Blocked reason')}:{' '}
              <span className="font-mono">
                {formatSyncBlockedReason(runtime?.syncGate?.blockedReason)}
              </span>
            </div>
          </div>
        </Card>

        <Card>
          <div className="font-bold mb-2">{t('admin.powersync.runtime.title', 'Runtime')}</div>
          <div className="text-sm space-y-1">
            <div>
              {t('admin.powersync.runtime.stage', 'Stage')}:{' '}
              <span className="font-mono">{data.persistenceStage ?? '-'}</span>
            </div>
            <div>
              {t('admin.powersync.runtime.vfsSelected', 'VFS (selected)')}:{' '}
              <span className="font-mono">{runtime?.selectedVfs ?? '-'}</span>
            </div>
            <div>
              {t('admin.powersync.runtime.vfsPreferred', 'VFS (preferred)')}:{' '}
              <span className="font-mono">{runtime?.preferredVfs ?? '-'}</span>
            </div>
            <div>
              {t('admin.powersync.runtime.browser', 'Browser')}:{' '}
              <span className="font-mono">{runtime?.browser ?? '-'}</span>
            </div>
            <div>
              {t('admin.powersync.runtime.platform', 'Platform')}:{' '}
              <span className="font-mono">{runtime?.platform ?? '-'}</span>
            </div>
            <div>
              {t('admin.powersync.runtime.opfsSupported', 'OPFS supported')}:{' '}
              <span className="font-mono">
                {runtime?.opfsDiagnostics ? String(runtime.opfsDiagnostics.supported) : '-'}
              </span>
            </div>
            <div>
              {t('admin.powersync.runtime.opfsChecks', 'OPFS checks')}:{' '}
              <span className="font-mono break-all">
                {runtime?.opfsDiagnostics
                  ? `dir=${String(runtime.opfsDiagnostics.hasOPFS)} locks=${String(runtime.opfsDiagnostics.hasWebLocks)} bc=${String(runtime.opfsDiagnostics.hasBroadcastChannel)} sah=${String(runtime.opfsDiagnostics.hasSyncAccessHandle)} window=${String(runtime.opfsDiagnostics.isWindow)} chromium=${String(runtime.opfsDiagnostics.isChromium)} iosWeb=${String(runtime.opfsDiagnostics.isIOSWeb)} tauri=${String(runtime.opfsDiagnostics.isTauriDesktop)}`
                  : '-'}
              </span>
            </div>
            <div>
              {t('admin.powersync.runtime.activeWatches', 'Active watches')}:{' '}
              <span className="font-mono">{data.activeWatchSubscriptions}</span>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <div className="font-bold mb-2">
            {t('admin.powersync.lifecycle.title', 'Sleep / wake lifecycle')}
          </div>
          <div className="text-sm space-y-1">
            <div>
              {t('admin.powersync.lifecycle.hiddenVisible', 'Hidden / visible')}:{' '}
              <span className="font-mono">
                {runtime
                  ? `${runtime.lifecycle.hiddenCount} / ${runtime.lifecycle.visibleCount}`
                  : '-'}
              </span>
            </div>
            <div>
              {t('admin.powersync.lifecycle.pagehidePageshow', 'Pagehide / pageshow')}:{' '}
              <span className="font-mono">
                {runtime
                  ? `${runtime.lifecycle.pagehideCount} / ${runtime.lifecycle.pageshowCount}`
                  : '-'}
              </span>
            </div>
            <div>
              {t('admin.powersync.lifecycle.online', 'Online events')}:{' '}
              <span className="font-mono">{runtime ? runtime.lifecycle.onlineCount : '-'}</span>
            </div>
            <div>
              {t('admin.powersync.lifecycle.lastBackground', 'Last background')}:{' '}
              <span className="font-mono">
                {runtime ? formatMaybeMs(runtime.lifecycle.lastBackgroundDurationMs) : '-'}
              </span>
            </div>
            <div>
              {t('admin.powersync.lifecycle.maxBackground', 'Max background')}:{' '}
              <span className="font-mono">
                {runtime ? formatMaybeMs(runtime.lifecycle.maxBackgroundDurationMs) : '-'}
              </span>
            </div>
            <div>
              {t('admin.powersync.lifecycle.lastHiddenAt', 'Last hidden')}:{' '}
              <span className="font-mono">
                {runtime ? formatMaybeIso(runtime.lifecycle.lastHiddenAt) : '-'}
              </span>
            </div>
            <div>
              {t('admin.powersync.lifecycle.lastVisibleAt', 'Last visible')}:{' '}
              <span className="font-mono">
                {runtime ? formatMaybeIso(runtime.lifecycle.lastVisibleAt) : '-'}
              </span>
            </div>
          </div>
        </Card>

        <Card>
          <div className="font-bold mb-2">
            {t('admin.powersync.reconnect.title', 'Reconnect diagnostics')}
          </div>
          <div className="text-sm space-y-1">
            <div>
              {t('admin.powersync.reconnect.attempts', 'Attempts / ok / failed')}:{' '}
              <span className="font-mono">
                {runtime
                  ? `${runtime.reconnect.attempts} / ${runtime.reconnect.successes} / ${runtime.reconnect.failures}`
                  : '-'}
              </span>
            </div>
            <div>
              {t('admin.powersync.reconnect.reason', 'Last reason')}:{' '}
              <span className="font-mono">{runtime?.reconnect.lastReason ?? '-'}</span>
            </div>
            <div>
              {t('admin.powersync.reconnect.duration', 'Last duration')}:{' '}
              <span className="font-mono">
                {runtime ? formatMaybeMs(runtime.reconnect.lastDurationMs) : '-'}
              </span>
            </div>
            <div>
              {t('admin.powersync.reconnect.startedAt', 'Last started')}:{' '}
              <span className="font-mono">
                {runtime ? formatMaybeIso(runtime.reconnect.lastStartedAt) : '-'}
              </span>
            </div>
            <div>
              {t('admin.powersync.reconnect.completedAt', 'Last completed')}:{' '}
              <span className="font-mono">
                {runtime ? formatMaybeIso(runtime.reconnect.lastCompletedAt) : '-'}
              </span>
            </div>
            <div>
              {t('admin.powersync.reconnect.error', 'Last error')}:{' '}
              <span className="font-mono break-all">{runtime?.reconnect.lastError ?? '-'}</span>
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <div className="font-bold mb-2">
          {t('admin.powersync.memory.title', 'Runtime memory / storage')}
        </div>
        <div className="text-sm space-y-1">
          <div>
            {t('admin.powersync.memory.sampledAt', 'Sampled at')}:{' '}
            <span className="font-mono">{runtime?.memory?.sampledAt ?? '-'}</span>
          </div>
          <div>
            {t('admin.powersync.memory.reason', 'Sample reason')}:{' '}
            <span className="font-mono">{runtime?.memory?.reason ?? '-'}</span>
          </div>
          <div>
            {t('admin.powersync.memory.jsHeapUsed', 'JS heap used')}:{' '}
            <span className="font-mono">
              {formatMaybeFloat(runtime?.memory?.jsHeapUsedMb ?? null, ' MB')}
            </span>
          </div>
          <div>
            {t('admin.powersync.memory.jsHeapLimit', 'JS heap limit')}:{' '}
            <span className="font-mono">
              {formatMaybeFloat(runtime?.memory?.jsHeapLimitMb ?? null, ' MB')}
            </span>
          </div>
          <div>
            {t('admin.powersync.memory.storageUsage', 'Storage usage')}:{' '}
            <span className="font-mono">
              {formatMaybeFloat(runtime?.memory?.storageUsageMb ?? null, ' MB')}
            </span>
          </div>
          <div>
            {t('admin.powersync.memory.storageQuota', 'Storage quota')}:{' '}
            <span className="font-mono">
              {formatMaybeFloat(runtime?.memory?.storageQuotaMb ?? null, ' MB')}
            </span>
          </div>
          <div>
            {t('admin.powersync.memory.deviceMemory', 'Device memory')}:{' '}
            <span className="font-mono">
              {formatMaybeFloat(runtime?.memory?.deviceMemoryGb ?? null, ' GB')}
            </span>
          </div>
        </div>
      </Card>

      <Card className={hasMismatch ? 'border-yellow-500/30 bg-yellow-500/10' : undefined}>
        <div className="font-bold mb-2">
          {t('admin.powersync.projections.title', 'Projections')}
        </div>
        <div className="text-sm space-y-1">
          <div>
            {t('admin.powersync.projections.status', 'Projection status')}:{' '}
            <span className="font-mono">{projections.status}</span>
          </div>
          <div>
            {t('admin.powersync.projections.source', 'Projection source')}:{' '}
            <span className="font-mono">{projections.source}</span>
          </div>
          <div>
            {t('admin.powersync.projections.endedSessions', 'Ended sessions (emt_messages)')}:{' '}
            <span className="font-mono">{formatMaybeNumber(projections.endedSessions)}</span>
          </div>
          <div>
            {t('admin.powersync.projections.sessionSummaries', 'Session summaries')}:{' '}
            <span className="font-mono">{formatMaybeNumber(projections.sessionSummaries)}</span>
          </div>
          <div>
            {t('admin.powersync.projections.missingSummaries', 'Missing summaries')}:{' '}
            <span className="font-mono">{formatMaybeNumber(projections.missingSummaries)}</span>
          </div>
          <div>
            {t('admin.powersync.projections.orphanSummaries', 'Orphan summaries')}:{' '}
            <span className="font-mono">{formatMaybeNumber(projections.orphanSummaries)}</span>
          </div>
          <div>
            {t('admin.powersync.projections.lastChecked', 'Last checked')}:{' '}
            <span className="font-mono">{projections.lastCheckedAt ?? '-'}</span>
          </div>
          <div>
            {t('admin.powersync.projections.error', 'Projection error')}:{' '}
            <span className="font-mono break-all">{projections.errorMessage ?? '-'}</span>
          </div>
          {hasMismatch && (
            <div className="text-yellow-300">
              {t(
                'admin.powersync.projections.mismatchDetected',
                'Projection diagnostics detected drift or a failed invariant.',
              )}
            </div>
          )}
        </div>
      </Card>

      {runtime?.lastEvents?.length ? (
        <Card>
          <div className="font-bold mb-2">
            {t('admin.powersync.runtimeEventsLatest', 'Runtime events (latest)')}
          </div>
          <div className="text-xs font-mono whitespace-pre-wrap">
            {runtime.lastEvents.map((e) => `${e.at} ${e.phase} ${e.detail}`).join('\n')}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
