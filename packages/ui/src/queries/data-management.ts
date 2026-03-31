/**
 * Data Management Queries
 *
 * TanStack Query mutations for user data management.
 * Destructive operations with no automatic retry.
 */

import { useMutation, type UseMutationResult } from '@tanstack/react-query';

// =============================================================================
// Types
// =============================================================================

/** Result from data deletion */
export interface DeleteDataResult {
  success: boolean;
  error?: string;
}

// =============================================================================
// Adapter References (injected via Provider)
// =============================================================================

type DeleteAllDataFn = () => Promise<DeleteDataResult>;

let deleteAllDataFn: DeleteAllDataFn | null = null;

export function setDataManagementAdapter(adapter: { deleteAllUserData: DeleteAllDataFn }): void {
  deleteAllDataFn = adapter.deleteAllUserData;
}

// =============================================================================
// Mutation
// =============================================================================

/**
 * Delete all user data.
 *
 * Features:
 * - Destructive operation (no automatic retry)
 * - Explicit loading/error states via mutation result
 * - Visible in React Query DevTools
 *
 * Usage:
 * ```tsx
 * const { mutate, isPending, error } = useDeleteAllData();
 * mutate(undefined, {
 *   onSuccess: (result) => { if (result.success) navigate('/') }
 * });
 * ```
 */
export function useDeleteAllData(): UseMutationResult<DeleteDataResult, Error, void> {
  return useMutation<DeleteDataResult, Error, void>({
    mutationFn: async (): Promise<DeleteDataResult> => {
      if (!deleteAllDataFn) {
        throw new Error(
          'Data management adapter not initialized. Call setDataManagementAdapter first.',
        );
      }
      return deleteAllDataFn();
    },
    // No retry for destructive operations
    retry: false,
  });
}
