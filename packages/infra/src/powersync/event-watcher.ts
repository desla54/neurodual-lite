/**
 * Event watcher stubs (NeuroDual Lite - cloud sync removed)
 *
 * These watched-query helpers used PowerSync's reactive watch API.
 * In Lite mode, they return empty/no-op results.
 */

import type { AbstractPowerSyncDatabase } from '@powersync/web';

export function getActivePowerSyncWatchSubscriptions(): number {
  return 0;
}

export function watchUserDeletedSessions(
  _db: AbstractPowerSyncDatabase,
  _userIds: readonly string[],
  _callback: (rows: unknown[]) => void,
): () => void {
  return () => {};
}

export function watchUserEventSignalsByTypes(
  _db: AbstractPowerSyncDatabase,
  _userIds: readonly string[],
  _types: readonly string[],
  _callback: (rows: unknown[]) => void,
): () => void {
  return () => {};
}

export function watchUserResets(
  _db: AbstractPowerSyncDatabase,
  _userIds: readonly string[],
  _callback: (rows: unknown[]) => void,
): () => void {
  return () => {};
}
