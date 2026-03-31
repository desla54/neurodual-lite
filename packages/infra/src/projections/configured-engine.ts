/**
 * Configured Processor Engine — drop-in replacement for getProjectionProcessor.
 *
 * Creates the ProcessorEngine with event store + checkpointer and registers
 * all built-in projection/processor definitions.
 */

import type { AbstractPowerSyncDatabase } from '@powersync/web';
import type { PersistencePort } from '@neurodual/logic';
import { createEmmettEventStore } from '../es-emmett/powersync-emmett-event-store';
import { createCheckpointer } from '../es-emmett/checkpointer';
import {
  getProcessorEngine,
  resetProcessorEngine,
  invalidateProcessorEngineCache,
  type ProcessorEngine,
} from '../es-emmett/processor-engine';
import { streakProjectionDefinition } from './streak-projection';
import { dailyActivityProjectionDefinition } from './daily-activity-projection';
import { nLevelProjectionDefinition } from './n-level-projection';
import { journeyStateProjectionDefinition } from './journey-state-projection';
import { createSessionSummariesProjectionDefinition } from './session-summaries-projection';
import { cognitiveProfileProjectionDefinition } from './cognitive-profile-projection';

/**
 * Get (or create) the singleton ProcessorEngine with all projections registered.
 *
 * Drop-in replacement for the old `getProjectionProcessor(db, { persistence })`.
 */
export function getConfiguredProcessorEngine(
  db: AbstractPowerSyncDatabase,
  options?: { persistence?: PersistencePort },
): ProcessorEngine {
  const store = createEmmettEventStore(db);
  const checkpointer = createCheckpointer(db);
  const engine = getProcessorEngine(db, store, checkpointer);

  // Register all built-in processors
  engine.register(streakProjectionDefinition);
  engine.register(dailyActivityProjectionDefinition);
  engine.register(nLevelProjectionDefinition);
  engine.register(journeyStateProjectionDefinition);
  if (options?.persistence) {
    engine.register(createSessionSummariesProjectionDefinition(options.persistence));
  }
  engine.register(cognitiveProfileProjectionDefinition);

  return engine;
}

export { resetProcessorEngine, invalidateProcessorEngineCache };
export type { ProcessorEngine };
