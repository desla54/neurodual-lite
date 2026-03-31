/**
 * SnapshotBuilder Plugin
 *
 * Builds UI snapshots from session state.
 *
 * Data in / Data out: Pure transformation, no side effects.
 */

import type { SlotPicks, MemoRunningStats } from '../../../types/memo';
import { MemoSessionProjector } from '../../../engine/memo-projector';
import {
  getWindowDepthForTrial,
  isWindowComplete,
  createEmptyMemoStats,
} from '../../../types/memo';
import type {
  SnapshotBuilder,
  SnapshotBuilderInput,
  MemoSessionSnapshot,
  MemoPhase,
} from './types';
import type { MemoEvent } from '../../../engine/events';
import type { Trial } from '../../../types/core';
import type { MemoExtendedSummary } from '../../../engine/memo-projector';

/**
 * Default SnapshotBuilder implementation.
 */
export class DefaultSnapshotBuilder implements SnapshotBuilder {
  build(input: SnapshotBuilderInput): MemoSessionSnapshot {
    const {
      phase,
      phaseEnteredAt,
      trialIndex,
      currentTrial,
      currentPicks,
      correctionCounts,
      fillOrder,
      fillOrderIndex,
      effectiveWindowDepth,
      sessionEvents,
      trials,
      generator,
      spec,
      message,
      finalSummary,
    } = input;

    const activeModalities = spec.defaults.activeModalities;

    // Compute stats from events
    const stats: MemoRunningStats =
      sessionEvents.length > 0
        ? MemoSessionProjector.computeStatsUpToWindow(
            sessionEvents as MemoEvent[],
            trials as Trial[],
            trialIndex,
            activeModalities,
          )
        : createEmptyMemoStats();

    // Stimulus info (only during stimulus phase)
    const stimulus =
      phase === 'stimulus' && currentTrial
        ? {
            position: currentTrial.position,
            sound: currentTrial.sound,
            color: currentTrial.color,
          }
        : null;

    // Recall prompt info
    const requiredDepth = getWindowDepthForTrial(trialIndex, effectiveWindowDepth);
    const currentFillCell =
      fillOrderIndex < fillOrder.length ? (fillOrder[fillOrderIndex] ?? null) : null;

    const recallPrompt =
      phase === 'recall' || phase === 'feedback'
        ? {
            requiredWindowDepth: requiredDepth,
            currentPicks: currentPicks as Map<number, SlotPicks>,
            isComplete: isWindowComplete(currentPicks, trialIndex, requiredDepth, activeModalities),
            fillOrder,
            activeCell: currentFillCell,
            correctionCounts: new Map(correctionCounts),
          }
        : null;

    return {
      phase: phase as MemoPhase,
      phaseEnteredAt,
      trialIndex,
      totalTrials: generator.getTotalTrials(),
      stimulus,
      recallPrompt,
      stats,
      nLevel: spec.defaults.nLevel,
      activeModalities,
      message,
      summary: finalSummary as MemoExtendedSummary | null,
      adaptiveZone: generator.getZoneNumber?.() ?? null,
    };
  }
}
