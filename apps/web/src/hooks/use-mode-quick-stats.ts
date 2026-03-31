/**
 * useModeQuickStats
 *
 * Reactive per-mode stats sourced from the read-model adapter.
 * Keeps SQL/user scoping inside infra instead of issuing ad hoc UI queries.
 */

import { getReadModelsAdapter, useCurrentUser, useSubscribable } from '@neurodual/ui';
import { useMemo } from 'react';

export interface ModeQuickStats {
  sessions: number;
  totalTimeMs: number;
  maxLevel: number;
}

const EMPTY_MAP = new Map<string, ModeQuickStats>();

export function useModeQuickStats(): Map<string, ModeQuickStats> {
  const currentUser = useCurrentUser();
  const snapshot = useSubscribable(
    getReadModelsAdapter().modeQuickStats(currentUser?.user.id ?? null),
  );

  return useMemo(() => {
    if (!Array.isArray(snapshot.data) || snapshot.data.length === 0) {
      return EMPTY_MAP;
    }

    const map = new Map<string, ModeQuickStats>();
    for (const row of snapshot.data as ReadonlyArray<{
      game_mode?: string | null;
      sessions?: number | null;
      total_time_ms?: number | null;
      max_level?: number | null;
    }>) {
      if (!row.game_mode) continue;
      map.set(row.game_mode, {
        sessions: Number(row.sessions ?? 0),
        totalTimeMs: Number(row.total_time_ms ?? 0),
        maxLevel: Math.max(1, Number(row.max_level ?? 1)),
      });
    }
    return map;
  }, [snapshot.data]);
}
