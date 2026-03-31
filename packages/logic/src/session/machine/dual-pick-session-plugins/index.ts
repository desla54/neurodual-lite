/**
 * DualPickSession Plugins
 *
 * Plugin architecture for DualPickSessionMachine.
 * Follows the same pattern as GameSessionPlugins, TraceSessionPlugins, and MemoSessionPlugins.
 */

// Types
export type {
  DualPickSessionPlugins,
  CreateDefaultPluginsConfig,
  DeviceContextCollector,
  DeviceInfo,
  TemporalContext,
  TimelineGenerator,
  TimelineGeneratorInput,
  TimelineGeneratorResult,
  PlacementOrderInput,
  HistoryItem,
  DropValidator,
  DropValidatorInput,
  DropValidatorResult,
  PlacementOrchestrator,
  CurrentTargetInput,
  PlacementCompleteInput,
  SnapshotBuilder,
  SnapshotBuilderInput,
  AudioPolicy,
} from './types';

// Default implementations
export { DefaultDeviceContextCollector } from './device-context-collector';
export { DefaultTimelineGenerator } from './timeline-generator';
export { DefaultDropValidator } from './drop-validator';
export { DefaultPlacementOrchestrator } from './placement-orchestrator';
export { DefaultSnapshotBuilder } from './snapshot-builder';
export { DefaultAudioPolicy } from './audio-policy';

// Factory
export { createDefaultDualPickPlugins } from './create-default-plugins';
