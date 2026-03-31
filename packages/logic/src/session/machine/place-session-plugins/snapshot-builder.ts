/**
 * SnapshotBuilder Plugin
 *
 * Builds UI snapshots from session state.
 *
 * Data in / Data out: Pure transformation, no side effects.
 */

import type { PlaceSessionMachineSnapshot, SnapshotBuilder, SnapshotBuilderInput } from './types';

/**
 * Default SnapshotBuilder implementation.
 */
export class DefaultSnapshotBuilder implements SnapshotBuilder {
  build(input: SnapshotBuilderInput): PlaceSessionMachineSnapshot {
    const {
      phase,
      trialIndex,
      totalTrials,
      nLevel,
      stimulus,
      proposals,
      placedProposals,
      currentTarget,
      stats,
      history,
      summary,
      adaptiveZone,
    } = input;

    return {
      phase,
      trialIndex,
      totalTrials,
      nLevel,
      stimulus,
      proposals: [...proposals],
      placedProposals: new Map(placedProposals),
      currentTarget,
      stats,
      history: [...history],
      summary,
      adaptiveZone,
    };
  }
}
