import { describe, expect, it } from 'bun:test';
import { DefaultPickProcessor } from './pick-processor';
// @ts-expect-error test override
import type { PickInput, FillCell } from './types';
import type { SlotPicks } from '../../../types/memo';
import { RECALL_MAX_CORRECTIONS_PER_CELL } from '../../../specs/thresholds';

describe('DefaultPickProcessor', () => {
  const processor = new DefaultPickProcessor();

  // Helper to create a fill order
  function createFillOrder(slots: number[], modalities: string[]): FillCell[] {
    const order: FillCell[] = [];
    for (const slot of slots) {
      for (const modality of modalities) {
        order.push({ slot, modality });
      }
    }
    return order;
  }

  describe('process', () => {
    it('should accept new pick matching active cell in fill order', () => {
      const fillOrder = createFillOrder([2, 1], ['position', 'audio']);
      const input: PickInput = {
        slotIndex: 2,
        pick: { modality: 'position', value: 3 },
        currentPicks: new Map(),
        correctionCounts: new Map(),
        fillOrder,
        fillOrderIndex: 0, // First cell is (slot:2, modality:position)
        trialIndex: 2,
      };

      const result = processor.process(input);

      expect(result.isAccepted).toBe(true);
      expect(result.isCorrection).toBe(false);
      expect(result.newFillOrderIndex).toBe(1); // Advances
      expect(result.newPicks.get(2)?.position).toBe(3);
    });

    it('should reject pick not matching active cell', () => {
      const fillOrder = createFillOrder([2, 1], ['position', 'audio']);
      const input: PickInput = {
        slotIndex: 1, // Wrong slot - active is slot 2
        pick: { modality: 'position', value: 3 },
        currentPicks: new Map(),
        correctionCounts: new Map(),
        fillOrder,
        fillOrderIndex: 0,
        trialIndex: 2,
      };

      const result = processor.process(input);

      expect(result.isAccepted).toBe(false);
      expect(result.isCorrection).toBe(false);
      expect(result.newFillOrderIndex).toBe(0); // Does not advance
    });

    it('should reject pick with wrong modality for active cell', () => {
      const fillOrder = createFillOrder([2, 1], ['position', 'audio']);
      const input: PickInput = {
        slotIndex: 2,
        pick: { modality: 'audio', value: 'C' }, // Wrong modality - should be position
        currentPicks: new Map(),
        correctionCounts: new Map(),
        fillOrder,
        fillOrderIndex: 0,
        trialIndex: 2,
      };

      const result = processor.process(input);

      expect(result.isAccepted).toBe(false);
    });

    it('should accept correction under limit', () => {
      const fillOrder = createFillOrder([2, 1], ['position', 'audio']);
      const existingPicks = new Map<number, SlotPicks>();
      existingPicks.set(2, { position: 5 }); // Already filled

      const input: PickInput = {
        slotIndex: 2,
        pick: { modality: 'position', value: 3 }, // Correction
        currentPicks: existingPicks,
        correctionCounts: new Map([['2:position', 1]]), // 1 correction so far
        fillOrder,
        fillOrderIndex: 4, // Past this cell
        trialIndex: 2,
      };

      const result = processor.process(input);

      expect(result.isAccepted).toBe(true);
      expect(result.isCorrection).toBe(true);
      expect(result.newCorrectionCounts.get('2:position')).toBe(2);
      expect(result.newFillOrderIndex).toBe(4); // Does not advance for corrections
      expect(result.newPicks.get(2)?.position).toBe(3);
    });

    it('should reject correction over limit', () => {
      const fillOrder = createFillOrder([2, 1], ['position', 'audio']);
      const existingPicks = new Map<number, SlotPicks>();
      existingPicks.set(2, { position: 5 });

      const input: PickInput = {
        slotIndex: 2,
        pick: { modality: 'position', value: 3 },
        currentPicks: existingPicks,
        correctionCounts: new Map([['2:position', RECALL_MAX_CORRECTIONS_PER_CELL]]), // At limit
        fillOrder,
        fillOrderIndex: 4,
        trialIndex: 2,
      };

      const result = processor.process(input);

      expect(result.isAccepted).toBe(false);
      expect(result.isCorrection).toBe(true);
    });

    it('should track correction count per cell', () => {
      const fillOrder = createFillOrder([2, 1], ['position', 'audio']);
      const existingPicks = new Map<number, SlotPicks>();
      // @ts-expect-error test override
      existingPicks.set(2, { position: 5, audio: 'A' });

      const input: PickInput = {
        slotIndex: 2,
        // @ts-expect-error test override
        pick: { modality: 'audio', value: 'B' }, // Correcting audio
        currentPicks: existingPicks,
        correctionCounts: new Map([['2:position', 2]]), // Position has 2 corrections
        fillOrder,
        fillOrderIndex: 4,
        trialIndex: 2,
      };

      const result = processor.process(input);

      expect(result.isAccepted).toBe(true);
      expect(result.newCorrectionCounts.get('2:audio')).toBe(1);
      expect(result.newCorrectionCounts.get('2:position')).toBe(2); // Unchanged
    });

    it('should handle audio pick correctly', () => {
      const fillOrder: FillCell[] = [{ slot: 1, modality: 'audio' }];
      const input: PickInput = {
        slotIndex: 1,
        pick: { modality: 'audio', value: 'K' },
        currentPicks: new Map(),
        correctionCounts: new Map(),
        fillOrder,
        fillOrderIndex: 0,
        trialIndex: 1,
      };

      const result = processor.process(input);

      expect(result.isAccepted).toBe(true);
      expect(result.newPicks.get(1)?.audio).toBe('K');
    });

    it('should handle color pick correctly', () => {
      const fillOrder: FillCell[] = [{ slot: 1, modality: 'color' }];
      const input: PickInput = {
        slotIndex: 1,
        // @ts-expect-error test override
        pick: { modality: 'color', value: 'red' },
        currentPicks: new Map(),
        correctionCounts: new Map(),
        fillOrder,
        fillOrderIndex: 0,
        trialIndex: 1,
      };

      const result = processor.process(input);

      expect(result.isAccepted).toBe(true);
      // @ts-expect-error test override
      expect(result.newPicks.get(1)?.color).toBe('red');
    });
  });

  describe('getMaxCorrections', () => {
    it('should return value from thresholds', () => {
      expect(processor.getMaxCorrections()).toBe(RECALL_MAX_CORRECTIONS_PER_CELL);
    });
  });
});
