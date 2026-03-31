/**
 * FillOrderGenerator Plugin
 *
 * Generates the fill order for recall phase.
 * Supports sequential and random modes with anti-chunking.
 *
 * Data in / Data out: Pure generation, no side effects.
 */

import type { FillCell } from '../../../types/memo';
import type { FillOrderGenerator, FillOrderInput } from './types';

/**
 * Default FillOrderGenerator implementation.
 */
export class DefaultFillOrderGenerator implements FillOrderGenerator {
  generate(input: FillOrderInput, rng: () => number): FillCell[] {
    const { windowDepth, activeModalities, fillOrderMode } = input;

    // Generate all cells: for each slot, add all modalities
    // Sequential order: oldest slot first, then each modality in order
    const cells: FillCell[] = [];
    for (let slot = windowDepth; slot >= 1; slot--) {
      for (const modality of activeModalities) {
        cells.push({ slot, modality });
      }
    }

    if (fillOrderMode === 'random') {
      // Fisher-Yates shuffle at CELL level (full randomization)
      for (let i = cells.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const temp = cells[i] as FillCell;
        cells[i] = cells[j] as FillCell;
        cells[j] = temp;
      }
    }

    return cells;
  }
}
