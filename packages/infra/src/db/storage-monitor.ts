/**
 * Storage Quota Monitor
 *
 * Monitors IndexedDB usage and warns when approaching limits.
 * Browser limits vary: ~50MB guaranteed, up to 10% of disk on some browsers.
 */

import {
  STORAGE_WARNING_THRESHOLD_PERCENT,
  STORAGE_CRITICAL_THRESHOLD_PERCENT,
} from '@neurodual/logic';

// =============================================================================
// Types
// =============================================================================

export interface StorageQuotaInfo {
  /** Used storage in bytes */
  usage: number;
  /** Total quota in bytes */
  quota: number;
  /** Usage percentage (0-100) */
  usagePercent: number;
  /** Whether we're approaching the limit (>80%) */
  isWarning: boolean;
  /** Whether we're critically low (<5% remaining) */
  isCritical: boolean;
}

// =============================================================================
// Utilities
// =============================================================================

/**
 * Format bytes to human-readable string.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Get current storage quota information.
 * Returns null if StorageManager API is not available.
 */
export async function getStorageQuotaInfo(): Promise<StorageQuotaInfo | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
    console.warn('[StorageMonitor] StorageManager API not available');
    return null;
  }

  try {
    const estimate = await navigator.storage.estimate();
    const usage = estimate.usage ?? 0;
    const quota = estimate.quota ?? 0;

    if (quota === 0) return null;

    const usagePercent = (usage / quota) * 100;
    const isWarning = usagePercent >= STORAGE_WARNING_THRESHOLD_PERCENT;
    const isCritical = usagePercent >= STORAGE_CRITICAL_THRESHOLD_PERCENT;

    return {
      usage,
      quota,
      usagePercent,
      isWarning,
      isCritical,
    };
  } catch (error) {
    console.error('[StorageMonitor] Failed to get storage estimate:', error);
    return null;
  }
}

/**
 * Check storage and log warnings if needed.
 * Call this periodically (e.g., after session end).
 */
export async function checkStorageAndWarn(): Promise<void> {
  const info = await getStorageQuotaInfo();
  if (!info) return;

  if (info.isCritical) {
    console.error(
      `[StorageMonitor] CRITICAL: Storage at ${info.usagePercent.toFixed(1)}% ` +
        `(${formatBytes(info.usage)} / ${formatBytes(info.quota)}). ` +
        `Consider syncing and cleaning old data.`,
    );
  } else if (info.isWarning) {
    console.warn(
      `[StorageMonitor] WARNING: Storage at ${info.usagePercent.toFixed(1)}% ` +
        `(${formatBytes(info.usage)} / ${formatBytes(info.quota)})`,
    );
  }
}
