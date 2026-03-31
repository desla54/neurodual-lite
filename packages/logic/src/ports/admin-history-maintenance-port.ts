import type { PersistencePort } from './persistence-port';

export interface AdminHistoryMaintenancePort {
  rebuildAllSummaries(persistence: PersistencePort): Promise<number>;
}
