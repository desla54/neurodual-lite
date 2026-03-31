/**
 * PlaceSession Plugin Factory
 *
 * Creates default plugin instances for PlaceSessionMachine.
 */

import type { PlaceSessionPlugins, CreateDefaultPluginsConfig } from './types';
import { DefaultDeviceContextCollector } from './device-context-collector';
import { DefaultProposalGenerator } from './proposal-generator';
import { DefaultDropValidator } from './drop-validator';
import { DefaultTurnOrchestrator } from './turn-orchestrator';
import { DefaultSnapshotBuilder } from './snapshot-builder';
import { DefaultAudioPolicy } from './audio-policy';
import { DefaultAlgorithmStateManager } from './algorithm-state-manager';

/**
 * Create default plugins for PlaceSessionMachine.
 */
export function createDefaultPlacePlugins(config: CreateDefaultPluginsConfig): PlaceSessionPlugins {
  return {
    deviceContext: new DefaultDeviceContextCollector(config.platformInfo),
    proposal: new DefaultProposalGenerator(),
    drop: new DefaultDropValidator(),
    turn: new DefaultTurnOrchestrator(),
    snapshot: new DefaultSnapshotBuilder(),
    audio: new DefaultAudioPolicy(),
    algorithmState: new DefaultAlgorithmStateManager(),
  };
}
