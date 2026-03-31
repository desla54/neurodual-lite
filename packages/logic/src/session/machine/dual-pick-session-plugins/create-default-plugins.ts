/**
 * DualPickSession Plugin Factory
 *
 * Creates default plugin instances for DualPickSessionMachine.
 */

import type { DualPickSessionPlugins, CreateDefaultPluginsConfig } from './types';
import { DefaultDeviceContextCollector } from './device-context-collector';
import { DefaultTimelineGenerator } from './timeline-generator';
import { DefaultDropValidator } from './drop-validator';
import { DefaultPlacementOrchestrator } from './placement-orchestrator';
import { DefaultSnapshotBuilder } from './snapshot-builder';
import { DefaultAudioPolicy } from './audio-policy';

/**
 * Create default plugins for DualPickSessionMachine.
 */
export function createDefaultDualPickPlugins(
  config: CreateDefaultPluginsConfig,
): DualPickSessionPlugins {
  return {
    deviceContext: new DefaultDeviceContextCollector(config.platformInfo),
    timeline: new DefaultTimelineGenerator(),
    drop: new DefaultDropValidator(),
    placement: new DefaultPlacementOrchestrator(),
    snapshot: new DefaultSnapshotBuilder(),
    audio: new DefaultAudioPolicy(),
  };
}
