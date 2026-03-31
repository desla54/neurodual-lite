/**
 * TimelineGenerator Plugin
 *
 * Generates timeline cards and proposals for dual label sessions.
 *
 * Data in / Data out: Pure generation, no side effects.
 */

import type {
  DualPickTimelineCard,
  DualPickProposal,
  DualPickPlacementTarget,
  DualPickId,
} from '../../../types/dual-pick';
import type {
  TimelineGenerator,
  TimelineGeneratorInput,
  TimelineGeneratorResult,
  PlacementOrderInput,
} from './types';

/**
 * Default TimelineGenerator implementation.
 */
export class DefaultTimelineGenerator implements TimelineGenerator {
  generate(input: TimelineGeneratorInput): TimelineGeneratorResult {
    const timelineCards = this.generateTimelineCards(input);
    const proposals = this.generateProposals(input);

    return { timelineCards, proposals };
  }

  generatePlacementOrder(input: PlacementOrderInput): DualPickPlacementTarget[] {
    const { proposals, placementOrderMode, rng } = input;

    if (placementOrderMode === 'free') {
      return [];
    }

    const sortedProposals = [...proposals];

    if (placementOrderMode === 'oldestFirst') {
      sortedProposals.sort((a, b) => b.correctSlot - a.correctSlot);
    } else if (placementOrderMode === 'newestFirst') {
      sortedProposals.sort((a, b) => a.correctSlot - b.correctSlot);
    }

    const targets: DualPickPlacementTarget[] = sortedProposals.map((p) => ({
      proposalId: p.id,
      proposalType: p.type,
    }));

    if (placementOrderMode === 'random') {
      return this.shuffleArray(targets, rng);
    }

    return targets;
  }

  private generateTimelineCards(input: TimelineGeneratorInput): DualPickTimelineCard[] {
    const {
      history,
      trialIndex,
      nLevel,
      activeModalities,
      timelineMode,
      distractorCount,
      distractorSource,
      rng,
      generateId,
    } = input;

    const cards: DualPickTimelineCard[] = [];
    const windowSize = Math.min(trialIndex + 1, nLevel + 1);
    const isUnified = timelineMode === 'unified';

    // Track used values for random distractor generation
    const usedPositions = new Set<number>();
    const usedSounds = new Set<string>();

    // Generate cards for items in the recall window
    for (let slot = 0; slot < windowSize; slot++) {
      const historyIndex = history.length - 1 - slot;
      if (historyIndex < 0) continue;

      const item = history[historyIndex];
      if (!item) continue;

      usedPositions.add(item.position);
      usedSounds.add(item.sound);

      if (isUnified) {
        cards.push({
          slot,
          type: 'unified',
          position: item.position,
          sound: item.sound,
          placedLabel: null,
        });
      } else {
        if (activeModalities.includes('position')) {
          cards.push({
            slot,
            type: 'position',
            position: item.position,
            placedLabel: null,
          });
        }
        if (activeModalities.includes('audio')) {
          cards.push({
            slot,
            type: 'audio',
            sound: item.sound,
            placedLabel: null,
          });
        }
      }
    }

    // Generate distractor cards
    if (distractorCount > 0) {
      const distractorCards = this.generateDistractorCards({
        history,
        windowSize,
        distractorCount,
        distractorSource,
        usedPositions,
        usedSounds,
        isUnified,
        activeModalities,
        rng,
        generateId,
      });
      cards.push(...distractorCards);
    }

    return this.shuffleArray(cards, rng);
  }

  private generateDistractorCards(config: {
    history: readonly { position: number; sound: string }[];
    windowSize: number;
    distractorCount: number;
    distractorSource: 'random' | 'proactive';
    usedPositions: Set<number>;
    usedSounds: Set<string>;
    isUnified: boolean;
    activeModalities: readonly string[];
    rng: () => number;
    generateId: () => string;
  }): DualPickTimelineCard[] {
    const {
      history,
      windowSize,
      distractorCount,
      distractorSource,
      usedPositions,
      usedSounds,
      isUnified,
      activeModalities,
      rng,
      generateId,
    } = config;

    const cards: DualPickTimelineCard[] = [];
    let proactiveGenerated = 0;

    // Proactive interference: use items from outside the window
    if (distractorSource === 'proactive') {
      const outsideWindowItems = history.slice(0, Math.max(0, history.length - windowSize));

      for (let i = 0; i < distractorCount && i < outsideWindowItems.length; i++) {
        const distractorId = generateId();
        const itemIndex = outsideWindowItems.length - 1 - i;
        const item = outsideWindowItems[itemIndex];

        if (!item) continue;

        proactiveGenerated++;

        if (isUnified) {
          cards.push({
            slot: -1 - i,
            type: 'unified',
            position: item.position,
            sound: item.sound,
            placedLabel: null,
            isDistractor: true,
            distractorId,
          });
        } else {
          if (activeModalities.includes('position')) {
            cards.push({
              slot: -1 - i,
              type: 'position',
              position: item.position,
              placedLabel: null,
              isDistractor: true,
              distractorId: `${distractorId}-position`,
            });
          }
          if (activeModalities.includes('audio')) {
            cards.push({
              slot: -1 - i,
              type: 'audio',
              sound: item.sound,
              placedLabel: null,
              isDistractor: true,
              distractorId: `${distractorId}-audio`,
            });
          }
        }
      }
    }

    // Fallback to random for remaining distractors
    const remainingCount = distractorCount - proactiveGenerated;
    if (remainingCount > 0) {
      const allPositions = [0, 1, 2, 3, 4, 5, 6, 7];
      const allSounds = ['C', 'H', 'K', 'L', 'Q', 'R', 'S', 'T'];

      const unusedPositions = allPositions.filter((p) => !usedPositions.has(p));
      const unusedSounds = allSounds.filter((s) => !usedSounds.has(s));

      for (let i = 0; i < remainingCount; i++) {
        const distractorId = generateId();
        const slotIndex = proactiveGenerated + i;

        const pickRandom = <T>(arr: T[]): T => {
          const idx = Math.floor(rng() * arr.length);
          const item = arr[idx];
          if (item === undefined) {
            throw new Error('Unexpected empty array in random pick');
          }
          return item;
        };

        const position =
          unusedPositions.length > 0 ? pickRandom(unusedPositions) : pickRandom(allPositions);
        const sound = unusedSounds.length > 0 ? pickRandom(unusedSounds) : pickRandom(allSounds);

        if (isUnified) {
          cards.push({
            slot: -1 - slotIndex,
            type: 'unified',
            position,
            sound,
            placedLabel: null,
            isDistractor: true,
            distractorId,
          });
        } else {
          if (activeModalities.includes('position')) {
            cards.push({
              slot: -1 - slotIndex,
              type: 'position',
              position,
              placedLabel: null,
              isDistractor: true,
              distractorId: `${distractorId}-position`,
            });
          }
          if (activeModalities.includes('audio')) {
            cards.push({
              slot: -1 - slotIndex,
              type: 'audio',
              sound,
              placedLabel: null,
              isDistractor: true,
              distractorId: `${distractorId}-audio`,
            });
          }
        }
      }
    }

    return cards;
  }

  private generateProposals(input: TimelineGeneratorInput): DualPickProposal[] {
    const { trialIndex, nLevel, activeModalities, timelineMode, rng, generateId } = input;

    const labels: DualPickId[] = ['N', 'N-1', 'N-2'];
    const windowSize = Math.min(trialIndex + 1, nLevel + 1);
    const isUnified = timelineMode === 'unified';

    const proposals: DualPickProposal[] = [];

    if (isUnified) {
      for (let i = 0; i < windowSize; i++) {
        const label = labels[i];
        if (!label) continue;
        proposals.push({
          id: generateId(),
          label,
          type: 'unified',
          correctSlot: i,
        });
      }
    } else {
      for (const modality of activeModalities) {
        for (let i = 0; i < windowSize; i++) {
          const label = labels[i];
          if (!label) continue;
          proposals.push({
            id: generateId(),
            label,
            type: modality as 'position' | 'audio',
            correctSlot: i,
          });
        }
      }
    }

    return this.shuffleArray(proposals, rng);
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
