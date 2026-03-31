'use client';

/**
 * Progression Context
 *
 * Provides progression adapter access via module-level injection.
 */

import type { ProgressionPort } from '@neurodual/logic';
import { getProgressionAdapter } from '../queries';

/**
 * Hook to get the progression adapter.
 * Adapter is injected via NeurodualQueryProvider.
 */
export function useProgressionAdapter(): ProgressionPort {
  return getProgressionAdapter();
}
