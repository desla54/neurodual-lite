/**
 * Sync status badge component
 *
 * Uses FORCE SYNC (reset cursor + full pull) to ensure all cloud data is fetched.
 * This is a troubleshooting tool - always does a complete re-sync.
 *
 * Uses TanStack Query useMutation for:
 * - Automatic cache invalidation on success
 * - Observability in React Query DevTools
 * - Consistent mutation state management
 */

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowsClockwise, Cloud, CloudSlash, Crown } from '@phosphor-icons/react';
import { Card, Spinner, useHasCloudSync, useSyncQuery, useForceFullResync } from '@neurodual/ui';

export function SyncStatusBadge(): ReactNode {
  const { t } = useTranslation();
  const syncState = useSyncQuery();
  const hasCloudSync = useHasCloudSync();
  const { mutate: forceSync, isPending: isForceSyncing } = useForceFullResync();

  const handleForceSync = () => {
    forceSync(undefined, {
      onError: (err) => {
        console.error('[SyncStatusBadge] Force sync failed:', err);
      },
    });
  };

  // Format last sync time
  const formatLastSync = (timestamp: number | null): string => {
    if (!timestamp) return t('settings.sync.never', 'Never');
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return t('settings.sync.justNow', 'Just now');
    if (minutes < 60) return t('settings.sync.minutesAgo', '{{count}} min', { count: minutes });
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return t('settings.sync.hoursAgo', '{{count}}h', { count: hours });
    return t('settings.sync.daysAgo', '{{count}}d', { count: Math.floor(hours / 24) });
  };

  const isOnline = syncState?.status !== 'offline';
  const hasPending = (syncState?.pendingCount ?? 0) > 0;
  const hasError = syncState?.status === 'error';
  const showSyncing = isForceSyncing || syncState?.status === 'syncing';

  // Free users: show premium upsell instead of sync status
  if (!hasCloudSync) {
    return (
      <Card>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="p-2.5 rounded-xl bg-amber-100 text-amber-600">
              <Crown size={20} weight="regular" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground">
                {t('settings.sync.premiumOnly', 'Premium sync')}
              </div>
              <div className="text-xs text-muted-foreground">
                {t('settings.sync.premiumHint', 'Upgrade to Premium to sync your data')}
              </div>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div
            className={`p-2.5 rounded-xl ${
              !isOnline
                ? 'bg-muted text-muted-foreground'
                : hasError
                  ? 'bg-red-100 text-red-600'
                  : hasPending
                    ? 'bg-amber-100 text-amber-600'
                    : 'bg-green-100 text-green-600'
            }`}
          >
            {!isOnline ? (
              <CloudSlash size={20} weight="regular" />
            ) : showSyncing ? (
              <Spinner size={20} className="text-current" />
            ) : hasError ? (
              <CloudSlash size={20} weight="regular" />
            ) : (
              <Cloud size={20} weight="regular" />
            )}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground">
              {!isOnline
                ? t('settings.sync.offline', 'Offline')
                : showSyncing
                  ? t('settings.sync.syncing', 'Syncing...')
                  : hasError
                    ? t('settings.sync.error', 'Sync error')
                    : hasPending
                      ? t('settings.sync.pending', '{{count}} pending', {
                          count: syncState?.pendingCount ?? 0,
                        })
                      : t('settings.sync.upToDate', 'Up to date')}
            </div>
            <div className="text-xs text-muted-foreground break-words">
              {hasError && syncState?.errorMessage
                ? syncState.errorMessage
                : `${t('settings.sync.lastSync', 'Last sync:')} ${formatLastSync(syncState?.lastSyncAt ?? null)}`}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={handleForceSync}
          disabled={!isOnline || showSyncing}
          className="w-full sm:w-auto p-2.5 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center"
          title={t('settings.sync.forceSync', 'Full sync')}
        >
          <ArrowsClockwise size={18} className={showSyncing ? 'animate-spin' : ''} />
        </button>
      </div>
    </Card>
  );
}
