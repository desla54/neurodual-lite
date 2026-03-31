/**
 * PlacementOrchestrator Plugin
 *
 * Manages guided placement mode progression.
 *
 * Data in / Data out: Pure logic, no side effects.
 */

import type { DualPickPlacementTarget } from '../../../types/dual-pick';
import type { PlacementOrchestrator, CurrentTargetInput, PlacementCompleteInput } from './types';

/**
 * Default PlacementOrchestrator implementation.
 */
export class DefaultPlacementOrchestrator implements PlacementOrchestrator {
  getCurrentTarget(input: CurrentTargetInput): DualPickPlacementTarget | null {
    const { placementOrderMode, placementOrder, placementOrderIndex } = input;

    if (placementOrderMode === 'free') return null;
    if (placementOrderIndex >= placementOrder.length) return null;

    return placementOrder[placementOrderIndex] ?? null;
  }

  isAllLabelsPlaced(input: PlacementCompleteInput): boolean {
    const { timelineCards } = input;

    return timelineCards
      .filter((card) => !card.isDistractor)
      .every((card) => card.placedLabel !== null);
  }
}
