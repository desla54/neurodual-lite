/**
 * SnapshotBuilder Plugin
 *
 * Builds UI snapshots from session state.
 *
 * Data in / Data out: Pure transformation, no side effects.
 */

import type { DualPickSnapshot as DualPickSessionSnapshot } from '../../../types/dual-pick';
import type { SnapshotBuilder, SnapshotBuilderInput } from './types';

/**
 * Default SnapshotBuilder implementation.
 */
export class DefaultSnapshotBuilder implements SnapshotBuilder {
  build(input: SnapshotBuilderInput): DualPickSessionSnapshot {
    const {
      phase,
      trialIndex,
      totalTrials,
      stimulus,
      proposals,
      timelineCards,
      stats,
      nLevel,
      summary,
      history,
      activeModalities,
      currentTarget,
    } = input;

    return {
      phase,
      trialIndex,
      totalTrials,
      stimulus,
      proposals: [...proposals],
      timelineCards: [...timelineCards],
      stats,
      nLevel,
      summary,
      history: [...history],
      activeModalities: activeModalities as readonly ('position' | 'audio')[],
      currentTarget,
    };
  }
}
