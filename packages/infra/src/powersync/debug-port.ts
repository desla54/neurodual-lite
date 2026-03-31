/**
 * PowerSync debug port stub (NeuroDual Lite)
 */

export interface PowerSyncDebugPort {
  pendingCrudCount(): Promise<number>;
  query(sql: string): Promise<unknown[]>;
}

export function getPowerSyncDebugPort(): PowerSyncDebugPort | null {
  return null;
}
