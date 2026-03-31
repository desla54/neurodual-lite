/**
 * PlaceSession Plugins
 *
 * Plugin architecture for PlaceSessionMachine.
 * Follows the same pattern as GameSessionPlugins, TraceSessionPlugins, MemoSessionPlugins, DualPickSessionPlugins.
 */

// Types
export type {
  PlaceSessionPlugins,
  CreateDefaultPluginsConfig,
  DeviceContextCollector,
  DeviceInfo,
  TemporalContext,
  ProposalGenerator,
  ProposalGeneratorInput,
  ProposalGeneratorResult,
  PlacementOrderInput,
  HistoryItem,
  DropValidator,
  DropValidatorInput,
  DropValidatorResult,
  TurnOrchestrator,
  TurnCompleteInput,
  SnapshotBuilder,
  SnapshotBuilderInput,
  AudioPolicy,
} from './types';

// Default implementations
export { DefaultDeviceContextCollector } from './device-context-collector';
export { DefaultProposalGenerator } from './proposal-generator';
export { DefaultDropValidator } from './drop-validator';
export { DefaultTurnOrchestrator } from './turn-orchestrator';
export { DefaultSnapshotBuilder } from './snapshot-builder';
export { DefaultAudioPolicy } from './audio-policy';

// Factory
export { createDefaultPlacePlugins } from './create-default-plugins';
