/**
 * usePowerSyncWatch — reactive SQL query using the same db.query().watch()
 * mechanism as the read-model adapter (NOT useQuery from @powersync/react).
 *
 * This ensures consistent reactivity with the rest of the app.
 */

// biome-ignore lint/style/noRestrictedImports: need direct React hooks for external store
import { useSyncExternalStore, useRef, useCallback, useEffect } from 'react';
import { usePowerSync } from '@powersync/react';

interface WatchSnapshot<T> {
  readonly data: T;
  readonly isPending: boolean;
  readonly error: Error | null;
}

/**
 * Watches a SQL query reactively using PowerSync's db.query().watch() mechanism.
 * Provides the same instant reactivity as the read-model adapter pattern used
 * throughout the app (useSubscribable + createPowerSyncWatchStore).
 */
export function usePowerSyncWatch<TRow>(
  sql: string,
  params: readonly (string | number | null)[],
): WatchSnapshot<readonly TRow[]> {
  const db = usePowerSync();
  const paramsKey = JSON.stringify(params);

  // Stable refs for the external store
  const snapshotRef = useRef<WatchSnapshot<readonly TRow[]>>({
    data: [],
    isPending: true,
    error: null,
  });
  const listenersRef = useRef(new Set<() => void>());

  const emit = useCallback(() => {
    for (const l of listenersRef.current) l();
  }, []);

  const subscribe = useCallback((listener: () => void) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const getSnapshot = useCallback(() => snapshotRef.current, []);

  // Set up the watch when db/sql/params change
  useEffect(() => {
    if (!db) return;

    // Reset to pending on param change
    snapshotRef.current = { data: [], isPending: true, error: null };
    emit();

    const watchedQuery = db.query({ sql, parameters: [...params] }).watch();

    const dispose = watchedQuery.registerListener({
      onData: (rows: unknown) => {
        const arr = Array.isArray(rows) ? rows : [];
        snapshotRef.current = {
          data: arr as readonly TRow[],
          isPending: false,
          error: null,
        };
        emit();
      },
      onError: (error: unknown) => {
        snapshotRef.current = {
          ...snapshotRef.current,
          isPending: false,
          error: error instanceof Error ? error : new Error(String(error)),
        };
        emit();
      },
    });

    return () => {
      dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, sql, paramsKey, emit]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
