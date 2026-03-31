'use client';

/**
 * Session History Context
 *
 * Provides history adapter access via module-level injection.
 */

import type { HistoryPort } from '@neurodual/logic';
import { getHistoryAdapter, getOptionalHistoryAdapter } from '../queries';

/**
 * Hook to get the history adapter.
 * Throws if adapter is not initialized.
 * Use useOptionalHistoryAdapter() for HMR-safe access.
 */
export function useHistoryAdapter(): HistoryPort {
  return getHistoryAdapter();
}

/**
 * Hook to get the history adapter optionally.
 * Returns null if adapter is not initialized (safe during HMR).
 */
export function useOptionalHistoryAdapter(): HistoryPort | null {
  return getOptionalHistoryAdapter();
}
