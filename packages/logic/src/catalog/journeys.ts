import type { Reliability } from './stats-catalog';
import type { JourneyStrategyConfig } from '../types/journey';
import { DUAL_TRACK_DNB_HYBRID_MODE_ID } from '../specs/journey.spec';

// Re-export so existing consumers keep working
export { DUAL_TRACK_DNB_HYBRID_MODE_ID } from '../specs/journey.spec';

/** Built-in journey IDs (canonical) */
export const DEFAULT_JOURNEY_ID = 'neurodual-default';
export const DUALNBACK_CLASSIC_JOURNEY_ID = 'dualnback-classic-journey';
export const BRAINWORKSHOP_JOURNEY_ID = 'sim-brainworkshop-journey';
export const DUAL_TRACE_JOURNEY_ID = 'dual-trace-journey';
export const DUAL_TRACK_EASY_JOURNEY_ID = 'dual-track-easy-journey';
export const DUAL_TRACK_MEDIUM_JOURNEY_ID = 'dual-track-medium-journey';
export const DUAL_TRACK_JOURNEY_ID = 'dual-track-journey';
export const DUAL_TRACK_DNB_JOURNEY_ID = 'dual-track-dnb-journey';

export interface BuiltInJourneyDefinition {
  readonly id: string;
  /** i18n label key (use in UI) */
  readonly nameKey: string;
  /** Fallback label when the locale key is missing. */
  readonly name: string;
  readonly startLevel: number;
  readonly targetLevel: number;
  readonly gameMode?: string;
  readonly strategyConfig?: JourneyStrategyConfig;
  readonly reliability?: Reliability;
  readonly isDefault: true;
  readonly createdAt: 0;
}

/**
 * Built-in journeys used by Settings as defaults.
 *
 * Note: Names are i18n keys; UI should translate them.
 */
export const BUILT_IN_JOURNEYS: readonly BuiltInJourneyDefinition[] = [
  {
    id: DUALNBACK_CLASSIC_JOURNEY_ID,
    nameKey: 'stats.journey.simJaeggi',
    name: 'Dual N-Back Classic Journey',
    startLevel: 2,
    targetLevel: 5,
    gameMode: 'dualnback-classic',
    reliability: 'stable',
    isDefault: true,
    createdAt: 0,
  },
  {
    id: BRAINWORKSHOP_JOURNEY_ID,
    nameKey: 'stats.journey.simBrainworkshop',
    name: 'Brain Workshop Journey',
    startLevel: 2,
    targetLevel: 5,
    gameMode: 'sim-brainworkshop',
    reliability: 'stable',
    isDefault: true,
    createdAt: 0,
  },
  {
    id: DUAL_TRACE_JOURNEY_ID,
    nameKey: 'stats.journey.dualTrace',
    name: 'Dual Trace Journey',
    startLevel: 2,
    targetLevel: 5,
    gameMode: 'dual-trace',
    reliability: 'stable',
    isDefault: true,
    createdAt: 0,
  },
  {
    id: DUAL_TRACK_JOURNEY_ID,
    nameKey: 'stats.mode.dualTrack',
    name: 'Dual Track Journey',
    startLevel: 2,
    targetLevel: 5,
    gameMode: 'dual-track',
    strategyConfig: {
      dualTrack: {
        preset: 'medium',
      },
    },
    reliability: 'stable',
    isDefault: true,
    createdAt: 0,
  },
  {
    id: DUAL_TRACK_DNB_JOURNEY_ID,
    nameKey: 'stats.journey.dualTrackDnbHybrid',
    name: 'Dual Track + Dual N-Back Journey',
    startLevel: 2,
    targetLevel: 5,
    gameMode: DUAL_TRACK_DNB_HYBRID_MODE_ID,
    strategyConfig: {
      hybrid: {
        trackSessionsPerBlock: 1,
        dnbSessionsPerBlock: 3,
      },
      dualTrack: {
        preset: 'medium',
      },
    },
    reliability: 'alpha',
    isDefault: true,
    createdAt: 0,
  },
  {
    id: DEFAULT_JOURNEY_ID,
    nameKey: 'stats.journey.classic',
    name: 'Neurodual Journey',
    startLevel: 1,
    targetLevel: 5,
    reliability: 'alpha',
    isDefault: true,
    createdAt: 0,
  },
] as const;
