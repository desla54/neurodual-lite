/**
 * ProposalGenerator Plugin
 *
 * Generates proposals and placement order for flow sessions.
 *
 * Data in / Data out: Pure generation, no side effects.
 */

import type { PlaceProposal, PlacementTarget } from '../../../types/place';
import type { Sound } from '../../../types/core';
import type {
  ProposalGenerator,
  ProposalGeneratorInput,
  ProposalGeneratorResult,
  PlacementOrderInput,
} from './types';

/**
 * Default ProposalGenerator implementation.
 */
export class DefaultProposalGenerator implements ProposalGenerator {
  generate(input: ProposalGeneratorInput): ProposalGeneratorResult {
    const { history, trialIndex, nLevel, activeModalities, timelineMode, rng, generateId } = input;

    const proposals: PlaceProposal[] = [];
    const windowSize = Math.min(trialIndex + 1, nLevel + 1);
    const isUnified = timelineMode === 'unified';

    for (let slot = 0; slot < windowSize; slot++) {
      const historyIndex = history.length - 1 - slot;
      if (historyIndex < 0) continue;

      const item = history[historyIndex];
      if (!item) continue;

      if (isUnified) {
        proposals.push({
          id: generateId(),
          type: 'unified',
          position: item.position,
          sound: item.sound as Sound,
          correctSlot: slot,
        });
      } else {
        if (activeModalities.includes('position')) {
          proposals.push({
            id: generateId(),
            type: 'position',
            value: item.position,
            correctSlot: slot,
          });
        }
        if (activeModalities.includes('audio')) {
          proposals.push({
            id: generateId(),
            type: 'audio',
            value: item.sound as Sound,
            correctSlot: slot,
          });
        }
      }
    }

    // Shuffle proposals
    return { proposals: this.shuffleArray(proposals, rng) };
  }

  generatePlacementOrder(input: PlacementOrderInput): PlacementTarget[] {
    const { proposals, placementOrderMode, rng } = input;

    if (placementOrderMode === 'free') {
      return [];
    }

    const validProposals = proposals.filter((p) => !p.isDistractor);
    const targets: PlacementTarget[] = validProposals.map((p) => ({
      proposalId: p.id,
      targetSlot: p.correctSlot,
    }));

    if (placementOrderMode === 'random') {
      return this.shuffleArray(targets, rng);
    }

    if (placementOrderMode === 'oldestFirst') {
      targets.sort((a, b) => b.targetSlot - a.targetSlot);
    } else if (placementOrderMode === 'newestFirst') {
      targets.sort((a, b) => a.targetSlot - b.targetSlot);
    }

    return targets;
  }

  private shuffleArray<T>(array: T[], rng: () => number): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const temp = result[i];
      const swap = result[j];
      if (temp !== undefined && swap !== undefined) {
        result[i] = swap;
        result[j] = temp;
      }
    }
    return result;
  }
}
