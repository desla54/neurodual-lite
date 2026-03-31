/**
 * PowerSync runtime policy stubs (NeuroDual Lite)
 */

/**
 * Detects if an error is likely caused by a closed PowerSync database.
 */
export function isLikelyClosedPowerSyncError(error: unknown): boolean {
  if (!error) return false;
  const msg = error instanceof Error ? error.message : String(error);
  return (
    msg.includes('database is closed') ||
    msg.includes('not open') ||
    msg.includes('Cannot read properties of null') ||
    msg.includes('SQLITE_MISUSE')
  );
}

/**
 * Detects if an error is a fatal storage error (e.g. OPFS not available).
 */
export function isLikelyFatalPowerSyncStorageError(error: unknown): boolean {
  if (!error) return false;
  const msg = error instanceof Error ? error.message : String(error);
  return (
    msg.includes('storage') ||
    msg.includes('OPFS') ||
    msg.includes('disk I/O error') ||
    msg.includes('database disk image is malformed')
  );
}
