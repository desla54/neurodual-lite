/**
 * MemoSession Plugins
 *
 * Plugin architecture for MemoSessionMachine.
 * Follows the same pattern as GameSessionPlugins and TraceSessionPlugins.
 */

// Types
export type {
  MemoSessionPlugins,
  CreateDefaultPluginsConfig,
  PickProcessor,
  PickInput,
  PickResult,
  WindowEvaluator,
  WindowEvalInput,
  WindowEvalResult,
  FillOrderGenerator,
  FillOrderInput,
  SnapshotBuilder,
  SnapshotBuilderInput,
  AudioPolicy,
  AlgorithmStateManager,
  DeviceContextCollector,
  DeviceInfo,
  SessionContextInfo,
} from './types';

// Default implementations
export { DefaultPickProcessor } from './pick-processor';
export { DefaultWindowEvaluator } from './window-evaluator';
export { DefaultFillOrderGenerator } from './fill-order-generator';
export { DefaultSnapshotBuilder } from './snapshot-builder';
export { DefaultAudioPolicy } from './audio-policy';
export { DefaultAlgorithmStateManager } from './algorithm-state-manager';
export { DefaultDeviceContextCollector } from './device-context-collector';

// Factory
export { createDefaultMemoPlugins } from './create-default-plugins';
