/**
 * Pipeline Recovery Storage (Web)
 *
 * Stores SessionEndPipeline crash recovery state in localStorage.
 * The pipeline itself is created via injected ports (composition root).
 */

import type { PersistedPipelineState, PipelineRecoveryStoragePort } from '@neurodual/logic';
import { logger } from '../lib/logger';

const RECOVERY_KEY = 'neurodual:pipeline:recovery';

export function createLocalStoragePipelineRecoveryStorage(): PipelineRecoveryStoragePort {
  return {
    async save(state: PersistedPipelineState): Promise<void> {
      try {
        const t0 = performance.now();
        const json = JSON.stringify(state);
        const stringifyMs = performance.now() - t0;

        const t1 = performance.now();
        localStorage.setItem(RECOVERY_KEY, json);
        const setItemMs = performance.now() - t1;

        const totalMs = performance.now() - t0;
        if (totalMs > 25) {
          logger.warn(
            `[Pipeline] saveRecoveryState slow: total=${Math.round(totalMs)}ms (stringify=${Math.round(
              stringifyMs,
            )}ms setItem=${Math.round(setItemMs)}ms bytes=${json.length})`,
          );
        }
      } catch (error) {
        logger.warn('[Pipeline] Failed to save recovery state', error);
      }
    },

    async load(): Promise<PersistedPipelineState | null> {
      try {
        const data = localStorage.getItem(RECOVERY_KEY);
        if (!data) return null;
        return JSON.parse(data) as PersistedPipelineState;
      } catch (error) {
        logger.warn('[Pipeline] Failed to load recovery state', error);
        return null;
      }
    },

    async clear(): Promise<void> {
      try {
        localStorage.removeItem(RECOVERY_KEY);
      } catch (error) {
        logger.warn('[Pipeline] Failed to clear recovery state', error);
      }
    },
  };
}
