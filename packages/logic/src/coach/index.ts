/**
 * @neurodual/coach
 *
 * Trial generation and stats calculation for Dual N-Back.
 * Note: Coach class has been removed - use GameSession which now
 * directly uses TrialGenerator and RunningStatsCalculator.
 */

// Re-export domain essentials for convenience
export { DEFAULT_CONFIG, JAEGGI_CONFIG } from '../domain';

// Trial Generators
export type { TrialGenerator } from './trial-generator';
export { PreGeneratedTrialGenerator } from './pre-generated-trial-generator';
export { SequenceTrialGenerator, createSequenceTrialGenerator } from './sequence-trial-generator';

// Running Stats
export { RunningStatsCalculator } from './running-stats';

// Types (still needed for stats and responses)
export type {
  TrainingModalityStats,
  TrainingRunningStats,
  TrialResponse,
} from './types';

// Game Modes (Abstract Factory)
export type {
  ConfigurableSettingKey,
  GameModeDefinition,
  GameModeId,
  ModeResolutionContext,
  ModeSettings,
  ResolvedGameMode,
} from './game-mode';
export { gameModeRegistry } from './game-mode';
