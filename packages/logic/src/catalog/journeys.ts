import type { Reliability } from './stats-catalog';
import type { JourneyStrategyConfig } from '../types/journey';

/** Built-in journey IDs (canonical) */
export const DEFAULT_JOURNEY_ID = 'neurodual-default';
export const DUALNBACK_CLASSIC_JOURNEY_ID = 'dualnback-classic-journey';
export const BRAINWORKSHOP_JOURNEY_ID = 'sim-brainworkshop-journey';

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
