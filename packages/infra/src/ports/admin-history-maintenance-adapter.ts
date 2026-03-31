import type { AdminHistoryMaintenancePort } from '@neurodual/logic';
import { rebuildAllSummaries } from '../history/history-projection';

export const adminHistoryMaintenanceAdapter: AdminHistoryMaintenancePort = {
  async rebuildAllSummaries(persistence) {
    return await rebuildAllSummaries(persistence);
  },
};
