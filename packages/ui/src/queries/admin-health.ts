import { useSubscribable } from '../reactive/use-subscribable';
import { getReadModelsAdapter } from './read-models';

export interface AdminRecentSessionHealthRowDb {
  session_id: string;
  timestamp: number;
  n_level: number | null;
  health_metrics: string | null;
}

export function useAdminRecentSessionHealthQuery(
  userId: string,
  refreshToken: number,
): {
  data: AdminRecentSessionHealthRowDb[];
  isPending: boolean;
  error: Error | null;
} {
  const snap = useSubscribable(
    getReadModelsAdapter().adminRecentSessionHealth(userId, refreshToken),
  );
  return {
    data: snap.data as AdminRecentSessionHealthRowDb[],
    isPending: snap.isPending,
    error: snap.error ? new Error(snap.error) : null,
  };
}
