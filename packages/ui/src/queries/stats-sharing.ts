/**
 * Stats Sharing Queries
 *
 * TanStack Query mutations for anonymous stats submission.
 * Fire-and-forget pattern with automatic retry on failure.
 */

import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import type { SessionEndReportModel } from '@neurodual/logic';

// =============================================================================
// Types
// =============================================================================

/** Result from stats submission */
export interface SubmitStatsResult {
  success: boolean;
  duplicate?: boolean;
  error?: string;
}

// =============================================================================
// Adapter References (injected via Provider)
// =============================================================================

type SubmitStatsFn = (
  playerId: string,
  report: SessionEndReportModel,
) => Promise<SubmitStatsResult>;

let submitStatsFn: SubmitStatsFn | null = null;

export function setStatsAdapter(adapter: { submitStats: SubmitStatsFn }): void {
  submitStatsFn = adapter.submitStats;
}

// =============================================================================
// Mutation
// =============================================================================

export interface SubmitStatsInput {
  playerId: string;
  report: SessionEndReportModel;
}

/**
 * Submit anonymous session stats.
 *
 * Features:
 * - Fire-and-forget pattern (doesn't block UI)
 * - Automatic retry on network errors (3 attempts)
 * - Server-side deduplication (returns duplicate: true if already submitted)
 * - Visible in React Query DevTools
 *
 * Usage:
 * ```tsx
 * const { mutate: submitStats } = useSubmitStats();
 * submitStats({ playerId, report });
 * ```
 */
export function useSubmitStats(): UseMutationResult<SubmitStatsResult, Error, SubmitStatsInput> {
  return useMutation<SubmitStatsResult, Error, SubmitStatsInput>({
    mutationFn: async ({ playerId, report }): Promise<SubmitStatsResult> => {
      if (!submitStatsFn) {
        throw new Error('Stats adapter not initialized. Call setStatsAdapter first.');
      }
      return submitStatsFn(playerId, report);
    },
    // Retry on network errors
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
  });
}
