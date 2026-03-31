/**
 * Algorithm State Adapter
 *
 * Implements AlgorithmStatePort using SQLite for persistence.
 * Enables meta-learning algorithms to persist state across sessions.
 */

import type {
  AlgorithmState,
  AlgorithmStatePort,
  AlgorithmType,
  PersistencePort,
  StoredAlgorithmState,
} from '@neurodual/logic';
import { AlgorithmStateSchema, parseOrDefault } from '@neurodual/logic';

// =============================================================================
// Factory (Injection-based)
// =============================================================================

/**
 * Create an AlgorithmStatePort with explicit persistence injection.
 */
export function createAlgorithmStateAdapter(persistence: PersistencePort): AlgorithmStatePort {
  return {
    async loadState(
      userId: string,
      algorithmType: AlgorithmType,
    ): Promise<StoredAlgorithmState | null> {
      const result = await persistence.getAlgorithmState(userId, algorithmType);

      if (!result) return null;

      const validatedState = parseOrDefault(
        AlgorithmStateSchema,
        result.stateJson,
        null,
        'algorithm-state-adapter.loadState',
      );

      if (!validatedState) {
        console.warn('[AlgorithmStateAdapter] Invalid state from DB, resetting');
        return null;
      }

      return {
        state: validatedState as AlgorithmState,
        updatedAt: new Date(),
        saveCount: result.sessionCount,
      };
    },

    async saveState(
      userId: string,
      algorithmType: AlgorithmType,
      state: AlgorithmState,
    ): Promise<void> {
      const stateRecord: Record<string, unknown> = {
        algorithmType: state.algorithmType,
        version: state.version,
        data: state.data,
      };
      await persistence.saveAlgorithmState(userId, algorithmType, stateRecord);
    },

    async clearStates(userId: string): Promise<void> {
      await persistence.clearAlgorithmStates(userId);
    },
  };
}
