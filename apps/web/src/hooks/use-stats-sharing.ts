/**
 * useStatsSharing - Hook for sharing anonymous session stats
 *
 * Checks if user has opted in and sends stats to the cloud.
 * Fire-and-forget pattern - doesn't block the UI.
 *
 * Uses TanStack Query useMutation for:
 * - Automatic retry (3 attempts with exponential backoff)
 * - Observability in React Query DevTools
 * - Consistent mutation state management
 */

import { useRef, useCallback } from 'react';
import type { SessionEndReportModel } from '@neurodual/logic';
import { useSubmitStats } from '@neurodual/ui';
import { useAppPorts } from '../providers';
import { useSettingsStore } from '../stores/settings-store';
import { logger } from '../lib';

/**
 * Hook that provides a function to share session stats.
 * Returns a callback that can be called when a session finishes.
 */
export function useStatsSharing() {
  const { infraProbe } = useAppPorts();
  const playerId = useSettingsStore((s) => s.ui.playerId);
  const shareAnonymousStats = useSettingsStore((s) => s.ui.shareAnonymousStats);
  const submittedRef = useRef<Set<string>>(new Set());

  const { mutate: submitStats } = useSubmitStats();

  /**
   * Share session stats if enabled.
   * Safe to call multiple times - deduplicates by sessionId.
   */
  const shareStats = useCallback(
    (report: SessionEndReportModel) => {
      // Skip if already submitted
      if (submittedRef.current.has(report.sessionId)) {
        return;
      }

      // Skip if user has opted out
      if (!shareAnonymousStats) {
        logger.debug('[StatsSharing] User has opted out, skipping');
        return;
      }

      // Skip if Supabase not configured
      if (!infraProbe.isSupabaseConfigured()) {
        return;
      }

      // Mark as submitted (prevent duplicates)
      submittedRef.current.add(report.sessionId);

      // Fire and forget via TanStack Query mutation
      // - Automatic retry (3 attempts with exponential backoff)
      // - Visible in React Query DevTools
      submitStats(
        { playerId, report },
        {
          onSuccess: (result) => {
            if (result.success) {
              if (result.duplicate) {
                logger.debug('[StatsSharing] Stats submitted (duplicate)');
              } else {
                logger.debug('[StatsSharing] Stats submitted');
              }
            } else {
              console.warn('[StatsSharing] Submission failed:', result.error);
              // Remove from set so retry is possible on next call
              submittedRef.current.delete(report.sessionId);
            }
          },
          onError: () => {
            // Network error after all retries - allow retry on next call
            submittedRef.current.delete(report.sessionId);
          },
        },
      );
    },
    [playerId, shareAnonymousStats, submitStats, infraProbe],
  );

  return { shareStats };
}
