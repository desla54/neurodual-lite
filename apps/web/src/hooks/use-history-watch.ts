/**
 * useHistoryWatch — monitors emt_messages for new events and triggers projection
 * catch-up (session_summaries, cognitive_profile, streaks, etc.).
 *
 * Purely local — does NOT depend on cloud sync or authentication.
 * Extracted from PowerSyncProvider to reduce provider complexity.
 */

// biome-ignore lint/style/noRestrictedImports: external sync subscription requires useEffect
import { useEffect, useRef } from 'react';
import type { AbstractPowerSyncDatabase } from '@powersync/web';
import { setupHistoryPowerSyncWatch, withWatchdogContext } from '@neurodual/infra';
import type { HistoryPort, PersistencePort } from '@neurodual/logic';
import { logger } from '../lib';

/**
 * Set up a PowerSync watch that bridges events → session_summaries projection → UI refresh.
 *
 * Re-subscribes when `db` or `userId` changes. Cleans up on unmount.
 */
export function useHistoryWatch(
  db: AbstractPowerSyncDatabase | null,
  userId: string,
  persistence: PersistencePort | null,
  historyAdapter: HistoryPort | null,
): void {
  const unsubRef = useRef<(() => void) | null>(null);
  const activeUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Android/native startup can open PowerSync before persistence/adapters finish wiring.
    // Re-run the effect when those dependencies become available so the history watch is
    // not silently skipped until the next app restart.
    if (!db || !persistence || !historyAdapter) return;

    const persistencePort = persistence;
    const historyPort = historyAdapter;
    const scopedUserId = userId || 'local';

    // Reconfigure watch if scope changed.
    if (unsubRef.current && activeUserIdRef.current !== scopedUserId) {
      unsubRef.current();
      unsubRef.current = null;
      activeUserIdRef.current = null;
    }

    if (!unsubRef.current) {
      unsubRef.current = withWatchdogContext('useHistoryWatch.setupHistoryPowerSyncWatch', () =>
        setupHistoryPowerSyncWatch(db, scopedUserId, persistencePort, historyPort),
      );
      activeUserIdRef.current = scopedUserId;
      logger.debug('[useHistoryWatch] History watch set up for user scope:', scopedUserId);
    }

    return () => {
      if (unsubRef.current) {
        unsubRef.current();
        unsubRef.current = null;
        activeUserIdRef.current = null;
      }
    };
  }, [db, userId, persistence, historyAdapter]);
}
