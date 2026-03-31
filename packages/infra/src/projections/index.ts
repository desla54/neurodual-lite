// packages/infra/src/projections/index.ts
/**
 * Projections Module
 *
 * Read model projections from Emmett event store.
 * Uses ProjectionProcessor framework with version-based replay.
 */

// Framework
export {
  DEFAULT_PARTITION,
  type ProjectedEvent,
  type ProjectionDefinition,
} from './projection-definition';
export {
  getProjectionProcessor,
  resetProjectionProcessor,
  toProjectedEvent,
  type ProjectionProcessor,
  type ProjectionCatchUpReport,
} from './projection-processor';

// New processor engine (replaces ProjectionProcessor)
export {
  getConfiguredProcessorEngine,
  resetProcessorEngine,
  type ProcessorEngine,
} from './configured-engine';

// Pure computation functions
export { computeStreak, computeNLevel } from './projection-manager';

// Projection definitions
export { streakProjectionDefinition } from './streak-projection';
export { dailyActivityProjectionDefinition } from './daily-activity-projection';
export { nLevelProjectionDefinition } from './n-level-projection';
export { journeyStateProjectionDefinition } from './journey-state-projection';

// Projection logic (state evolution)
export {
  createInitialStreakState,
  evolveStreakState,
  evolveStreakStateFromEmmett,
  streakStateToInfo,
  getCurrentDate,
  type StreakState,
  type StreakCheckpoint,
  type StreakInfo, // Canonical type from @neurodual/logic, re-exported for convenience
} from './streak-projection';

export {
  createInitialDailyActivityState,
  evolveDailyActivityState,
  evolveDailyActivityStateFromEmmett,
  getRecentActivity,
  getActivityForDate as getProjectionActivityForDate,
  getTotalSessions,
  type DailyActivityState,
  type DailyActivityCheckpoint,
  type DailyActivity,
} from './daily-activity-projection';

export type { NLevelState, NLevelEntry } from './n-level-projection';

// Adapters (implement ports for UI integration)
export {
  createStreakAdapter,
  type StreakAdapter,
  type StreakAdapterOptions,
} from './streak-adapter';

export {
  createDailyActivityAdapter,
  type DailyActivityAdapter,
  type DailyActivityAdapterOptions,
} from './daily-activity-adapter';
