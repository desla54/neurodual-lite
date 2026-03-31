'use client';

/**
 * Profile Context
 *
 * Provides profile adapter access via module-level injection.
 */

import type { ProfilePort } from '@neurodual/logic';
import { getProfileAdapter } from '../queries';

/**
 * Hook to get the profile adapter.
 * Adapter is injected via NeurodualQueryProvider.
 */
export function useProfileAdapter(): ProfilePort {
  return getProfileAdapter();
}
