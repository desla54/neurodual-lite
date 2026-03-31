/**
 * PickProcessor Plugin
 *
 * Validates user picks during recall phase.
 * Checks correction limits, validates active cell.
 *
 * Data in / Data out: Pure validation, no side effects.
 */

import type { FillCell, SlotPicks } from '../../../types/memo';
import { RECALL_MAX_CORRECTIONS_PER_CELL } from '../../../specs/thresholds';
import type { PickProcessor, PickInput, PickResult } from './types';

/**
 * Default PickProcessor implementation.
 */
export class DefaultPickProcessor implements PickProcessor {
  private readonly maxCorrections: number;

  constructor() {
    this.maxCorrections = RECALL_MAX_CORRECTIONS_PER_CELL;
  }

  process(input: PickInput): PickResult {
    const { slotIndex, pick, currentPicks, correctionCounts, fillOrder, fillOrderIndex } = input;

    const key = `${slotIndex}:${pick.modality}`;

    // Check if this is a correction (cell already filled)
    const slotPicks = currentPicks.get(slotIndex);
    const existingValue = slotPicks?.[pick.modality as keyof SlotPicks];
    const isCorrection = existingValue !== undefined;

    // Check correction limits
    if (isCorrection) {
      const correctionCount = correctionCounts.get(key) ?? 0;
      if (correctionCount >= this.maxCorrections) {
        // Max corrections reached - reject
        return {
          isAccepted: false,
          isCorrection: true,
          newPicks: currentPicks,
          newCorrectionCounts: correctionCounts,
          newFillOrderIndex: fillOrderIndex,
        };
      }
    } else {
      // For new picks, check if cell is active
      const currentCell: FillCell | undefined =
        fillOrderIndex < fillOrder.length ? fillOrder[fillOrderIndex] : undefined;

      if (
        currentCell &&
        (currentCell.slot !== slotIndex || currentCell.modality !== pick.modality)
      ) {
        // Cell not active - reject
        return {
          isAccepted: false,
          isCorrection: false,
          newPicks: currentPicks,
          newCorrectionCounts: correctionCounts,
          newFillOrderIndex: fillOrderIndex,
        };
      }
    }

    // Update picks
    const newPicks = new Map(currentPicks);
    const updatedSlot = { ...newPicks.get(slotIndex) };
    switch (pick.modality) {
      case 'position':
        updatedSlot.position = pick.value;
        break;
      case 'audio':
        updatedSlot.audio = pick.value;
        break;
      case 'color':
        updatedSlot.color = pick.value;
        break;
    }
    newPicks.set(slotIndex, updatedSlot);

    // Update corrections and fill order
    const newCorrectionCounts = new Map(correctionCounts);
    let newFillOrderIndex = fillOrderIndex;

    if (isCorrection) {
      newCorrectionCounts.set(key, (newCorrectionCounts.get(key) ?? 0) + 1);
    } else {
      // Advance fill order only for new picks
      newFillOrderIndex = fillOrderIndex + 1;
    }

    return {
      isAccepted: true,
      isCorrection,
      newPicks,
      newCorrectionCounts,
      newFillOrderIndex,
    };
  }

  getMaxCorrections(): number {
    return this.maxCorrections;
  }
}
