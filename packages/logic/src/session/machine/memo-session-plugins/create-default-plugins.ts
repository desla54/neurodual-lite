/**
 * MemoSession Plugin Factory
 *
 * Creates default plugin instances for MemoSessionMachine.
 */

import type { MemoSessionPlugins, CreateDefaultPluginsConfig } from './types';
import { DefaultPickProcessor } from './pick-processor';
import { DefaultWindowEvaluator } from './window-evaluator';
import { DefaultFillOrderGenerator } from './fill-order-generator';
import { DefaultSnapshotBuilder } from './snapshot-builder';
import { DefaultAudioPolicy } from './audio-policy';
import { DefaultAlgorithmStateManager } from './algorithm-state-manager';
import { DefaultDeviceContextCollector } from './device-context-collector';

/**
 * Create default plugins for MemoSessionMachine.
 */
export function createDefaultMemoPlugins(config: CreateDefaultPluginsConfig): MemoSessionPlugins {
  return {
    pick: new DefaultPickProcessor(),
    windowEval: new DefaultWindowEvaluator(),
    fillOrder: new DefaultFillOrderGenerator(),
    snapshot: new DefaultSnapshotBuilder(),
    audio: new DefaultAudioPolicy(),
    algorithmState: new DefaultAlgorithmStateManager(),
    deviceContext: new DefaultDeviceContextCollector(config.platformInfo),
  };
}
