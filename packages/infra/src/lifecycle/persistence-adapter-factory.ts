/**
 * Persistence Adapter Factory (Legacy Stub)
 *
 * The SQLiteWorkerBridge has been removed. Persistence is now handled
 * entirely by PowerSync (see powersync/ and persistence/setup-persistence.ts).
 *
 * This file retains the public API so existing consumers (e.g. HMR cleanup
 * in app-root.tsx) keep compiling. All functions are no-ops.
 */

import { PersistenceLifecycleAdapter } from './persistence-lifecycle-machine';

let persistenceAdapter: PersistenceLifecycleAdapter | null = null;

/**
 * @deprecated No-op. PowerSync persistence is managed via setupPersistence().
 */
export function createPersistenceAdapter(): PersistenceLifecycleAdapter {
  if (persistenceAdapter) {
    return persistenceAdapter;
  }
  persistenceAdapter = new PersistenceLifecycleAdapter({
    createWorker: async () => {},
    terminateWorker: async () => {},
  });
  return persistenceAdapter;
}

/**
 * @deprecated No-op. PowerSync persistence is managed via setupPersistence().
 */
export function getPersistenceAdapter(): PersistenceLifecycleAdapter {
  if (!persistenceAdapter) {
    throw new Error(
      '[SetupPersistence] Adapter not created. Call createPersistenceAdapter() first.',
    );
  }
  return persistenceAdapter;
}

/**
 * Reset persistence adapter (for HMR cleanup).
 */
export async function resetPersistenceAdapter(): Promise<void> {
  if (persistenceAdapter) {
    const adapter = persistenceAdapter;
    persistenceAdapter = null;
    await adapter.shutdown();
  }
}
