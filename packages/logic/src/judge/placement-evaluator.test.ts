/**
 * PlacementEvaluator tests
 *
 * Tests the placement evaluation logic for Flow/DualPick modes.
 */

import { describe, expect, it } from 'bun:test';
import type { PlaceProposal } from '../types/place';
import { evaluatePlacement, findCorrectSlot, type HistoryItem } from './placement-evaluator';

// =============================================================================
// Test Fixtures
// =============================================================================

function createHistory(items: Array<{ position: number; sound: string }>): HistoryItem[] {
  return items.map((item) => ({
    position: item.position,
    sound: item.sound,
  }));
}

function createPositionProposal(position: number, isDistractor = false): PlaceProposal {
  return {
    id: `pos-${position}`,
    type: 'position',
    value: position,
    // @ts-expect-error test override
    position,
    isDistractor,
  };
}

function createAudioProposal(sound: string, isDistractor = false): PlaceProposal {
  return {
    id: `audio-${sound}`,
    type: 'audio',
    // @ts-expect-error test override
    value: sound,
    sound,
    isDistractor,
  };
}

function createUnifiedProposal(
  position: number,
  sound: string,
  isDistractor = false,
): PlaceProposal {
  return {
    id: `unified-${position}-${sound}`,
    type: 'unified',
    position,
    // @ts-expect-error test override
    sound,
    isDistractor,
  };
}

// =============================================================================
// evaluatePlacement Tests
// =============================================================================

describe('PlacementEvaluator', () => {
  describe('evaluatePlacement', () => {
    describe('distractors', () => {
      it('should reject distractors', () => {
        const history = createHistory([{ position: 1, sound: 'A' }]);
        const proposal = createPositionProposal(1, true);
        const result = evaluatePlacement(proposal, 0, history);

        expect(result.isCorrect).toBe(false);
        expect(result.reason).toBe('distractor');
      });

      it('should reject distractor even if value matches history', () => {
        const history = createHistory([{ position: 5, sound: 'B' }]);
        const proposal = createPositionProposal(5, true);
        const result = evaluatePlacement(proposal, 0, history);

        expect(result.isCorrect).toBe(false);
        expect(result.reason).toBe('distractor');
      });
    });

    describe('position mode', () => {
      it('should accept correct position at slot 0 (N)', () => {
        const history = createHistory([
          { position: 1, sound: 'A' },
          { position: 2, sound: 'B' },
          { position: 3, sound: 'C' },
        ]);
        const proposal = createPositionProposal(3);
        const result = evaluatePlacement(proposal, 0, history);

        expect(result.isCorrect).toBe(true);
        expect(result.reason).toBeUndefined();
      });

      it('should accept correct position at slot 1 (N-1)', () => {
        const history = createHistory([
          { position: 1, sound: 'A' },
          { position: 2, sound: 'B' },
          { position: 3, sound: 'C' },
        ]);
        const proposal = createPositionProposal(2);
        const result = evaluatePlacement(proposal, 1, history);

        expect(result.isCorrect).toBe(true);
      });

      it('should reject wrong position value', () => {
        const history = createHistory([
          { position: 1, sound: 'A' },
          { position: 2, sound: 'B' },
        ]);
        const proposal = createPositionProposal(5);
        const result = evaluatePlacement(proposal, 0, history);

        expect(result.isCorrect).toBe(false);
        expect(result.reason).toBe('wrong-value');
      });
    });

    describe('audio mode', () => {
      it('should accept correct audio at slot 0', () => {
        const history = createHistory([
          { position: 1, sound: 'A' },
          { position: 2, sound: 'B' },
        ]);
        const proposal = createAudioProposal('B');
        const result = evaluatePlacement(proposal, 0, history);

        expect(result.isCorrect).toBe(true);
      });

      it('should reject wrong audio value', () => {
        const history = createHistory([
          { position: 1, sound: 'A' },
          { position: 2, sound: 'B' },
        ]);
        const proposal = createAudioProposal('Z');
        const result = evaluatePlacement(proposal, 0, history);

        expect(result.isCorrect).toBe(false);
        expect(result.reason).toBe('wrong-value');
      });
    });

    describe('unified mode', () => {
      it('should accept when both position and audio match', () => {
        const history = createHistory([
          { position: 1, sound: 'A' },
          { position: 2, sound: 'B' },
        ]);
        const proposal = createUnifiedProposal(2, 'B');
        const result = evaluatePlacement(proposal, 0, history);

        expect(result.isCorrect).toBe(true);
        expect(result.byModality?.position).toBe(true);
        expect(result.byModality?.audio).toBe(true);
      });

      it('should reject when only position matches', () => {
        const history = createHistory([
          { position: 1, sound: 'A' },
          { position: 2, sound: 'B' },
        ]);
        const proposal = createUnifiedProposal(2, 'Z');
        const result = evaluatePlacement(proposal, 0, history);

        expect(result.isCorrect).toBe(false);
        expect(result.reason).toBe('wrong-binding');
        expect(result.byModality?.position).toBe(true);
        expect(result.byModality?.audio).toBe(false);
      });

      it('should reject when only audio matches', () => {
        const history = createHistory([
          { position: 1, sound: 'A' },
          { position: 2, sound: 'B' },
        ]);
        const proposal = createUnifiedProposal(9, 'B');
        const result = evaluatePlacement(proposal, 0, history);

        expect(result.isCorrect).toBe(false);
        expect(result.reason).toBe('wrong-binding');
        expect(result.byModality?.position).toBe(false);
        expect(result.byModality?.audio).toBe(true);
      });

      it('should reject when neither matches', () => {
        const history = createHistory([{ position: 1, sound: 'A' }]);
        const proposal = createUnifiedProposal(9, 'Z');
        const result = evaluatePlacement(proposal, 0, history);

        expect(result.isCorrect).toBe(false);
        expect(result.byModality?.position).toBe(false);
        expect(result.byModality?.audio).toBe(false);
      });
    });

    describe('edge cases', () => {
      it('should handle empty history', () => {
        const proposal = createPositionProposal(1);
        const result = evaluatePlacement(proposal, 0, []);

        expect(result.isCorrect).toBe(false);
        expect(result.reason).toBe('no-history');
      });

      it('should handle slot beyond history length', () => {
        const history = createHistory([{ position: 1, sound: 'A' }]);
        const proposal = createPositionProposal(1);
        const result = evaluatePlacement(proposal, 5, history);

        expect(result.isCorrect).toBe(false);
        expect(result.reason).toBe('no-history');
      });

      it('should handle negative slot', () => {
        const history = createHistory([{ position: 1, sound: 'A' }]);
        const proposal = createPositionProposal(1);
        const result = evaluatePlacement(proposal, -1, history);

        expect(result.isCorrect).toBe(false);
        expect(result.reason).toBe('no-history');
      });
    });
  });

  // ===========================================================================
  // findCorrectSlot Tests
  // ===========================================================================

  describe('findCorrectSlot', () => {
    it('should find correct slot for position proposal', () => {
      const history = createHistory([
        { position: 1, sound: 'A' },
        { position: 2, sound: 'B' },
        { position: 3, sound: 'C' },
      ]);
      const proposal = createPositionProposal(2);

      expect(findCorrectSlot(proposal, history)).toBe(1);
    });

    it('should find correct slot for audio proposal', () => {
      const history = createHistory([
        { position: 1, sound: 'A' },
        { position: 2, sound: 'B' },
        { position: 3, sound: 'C' },
      ]);
      const proposal = createAudioProposal('A');

      expect(findCorrectSlot(proposal, history)).toBe(2);
    });

    it('should find correct slot for unified proposal', () => {
      const history = createHistory([
        { position: 1, sound: 'A' },
        { position: 2, sound: 'B' },
        { position: 3, sound: 'C' },
      ]);
      const proposal = createUnifiedProposal(1, 'A');

      expect(findCorrectSlot(proposal, history)).toBe(2);
    });

    it('should return null for distractor', () => {
      const history = createHistory([{ position: 1, sound: 'A' }]);
      const proposal = createPositionProposal(1, true);

      expect(findCorrectSlot(proposal, history)).toBeNull();
    });

    it('should return null if value not in history', () => {
      const history = createHistory([{ position: 1, sound: 'A' }]);
      const proposal = createPositionProposal(9);

      expect(findCorrectSlot(proposal, history)).toBeNull();
    });

    it('should return first matching slot for duplicates', () => {
      const history = createHistory([
        { position: 5, sound: 'X' },
        { position: 5, sound: 'Y' },
        { position: 5, sound: 'Z' },
      ]);
      const proposal = createPositionProposal(5);

      // Slot 0 is most recent (position 5), should match first
      expect(findCorrectSlot(proposal, history)).toBe(0);
    });
  });
});
