/**
 * Tests for Turn Projectors
 */

import { describe, expect, test } from 'bun:test';
import {
  projectTempoTurns,
  projectMemoTurns,
  projectPlaceTurns,
  projectCorsiTurns,
} from './turn-projectors';
import type { Trial } from '../types/core';
import type { GameEvent, MemoEvent, PlaceEvent } from './events';

describe('Turn Projectors', () => {
  describe('projectTempoTurns', () => {
    const sessionId = 'session-123';

    test('should project a standard tempo session', () => {
      const events: GameEvent[] = [
        { type: 'SESSION_STARTED', sessionId, nLevel: 2, timestamp: 1000 } as any,
        {
          type: 'TRIAL_PRESENTED',
          sessionId,
          trial: { index: 0, isPositionTarget: false, isSoundTarget: false } as any,
          timestamp: 1100,
          isiMs: 2000,
          stimulusDurationMs: 500,
        } as any,
        {
          type: 'TRIAL_PRESENTED',
          sessionId,
          trial: { index: 1, isPositionTarget: false, isSoundTarget: false } as any,
          timestamp: 3600,
          isiMs: 2000,
          stimulusDurationMs: 500,
        } as any,
        {
          type: 'TRIAL_PRESENTED',
          sessionId,
          trial: {
            index: 2,
            position: 1,
            sound: 'C',
            isPositionTarget: true,
            isSoundTarget: false,
          } as any,
          timestamp: 6100,
          isiMs: 2000,
          stimulusDurationMs: 500,
        } as any,
        {
          type: 'USER_RESPONDED',
          sessionId,
          trialIndex: 2,
          modality: 'position',
          reactionTimeMs: 400,
          responsePhase: 'during_stimulus',
        } as any,
      ];

      const turns = projectTempoTurns(events);

      // Should skip first 2 (nLevel=2)
      expect(turns).toHaveLength(1);
      const turn = turns[0];
      expect(turn!.index).toBe(3);
      expect(turn!.verdict).toBe('correct'); // Hit position, CR audio
      expect(turn!.headline).toContain('POS✓ AUD✓');
      expect(turn!.subline).toBe('RT: 400ms');
    });

    test('should handle partial and incorrect verdicts', () => {
      const events: GameEvent[] = [
        { type: 'SESSION_STARTED', sessionId, nLevel: 0, timestamp: 1000 } as any,
        {
          type: 'TRIAL_PRESENTED',
          sessionId,
          trial: { index: 0, isPositionTarget: true, isSoundTarget: true } as any,
          timestamp: 1100,
          isiMs: 2000,
          stimulusDurationMs: 500,
        } as any,
        {
          type: 'USER_RESPONDED',
          sessionId,
          trialIndex: 0,
          modality: 'position',
          reactionTimeMs: 300,
        } as any,
        {
          type: 'TRIAL_PRESENTED',
          sessionId,
          trial: { index: 1, isPositionTarget: true, isSoundTarget: true } as any,
          timestamp: 3600,
          isiMs: 2000,
          stimulusDurationMs: 500,
        } as any,
      ];

      const turns = projectTempoTurns(events);

      expect(turns[0]!.verdict).toBe('partial'); // Hit position, Miss audio
      expect(turns[0]!.errorTags).toContain('miss');
      expect(turns[1]!.verdict).toBe('incorrect'); // Miss both
    });

    test('should handle false alarms', () => {
      const events: GameEvent[] = [
        { type: 'SESSION_STARTED', sessionId, nLevel: 0, timestamp: 1000 } as any,
        {
          type: 'TRIAL_PRESENTED',
          sessionId,
          trial: { index: 0, isPositionTarget: false, isSoundTarget: false } as any,
          timestamp: 1100,
          isiMs: 2000,
          stimulusDurationMs: 500,
        } as any,
        {
          type: 'USER_RESPONDED',
          sessionId,
          trialIndex: 0,
          modality: 'position',
          reactionTimeMs: 300,
        } as any,
      ];

      const turns = projectTempoTurns(events);
      expect(turns[0]!.verdict).toBe('partial'); // False alarm position, CR audio
      expect(turns[0]!.errorTags).toContain('false-alarm');
    });

    test('should handle unknown modalities gracefully', () => {
      const events: GameEvent[] = [
        { type: 'SESSION_STARTED', sessionId, nLevel: 0, timestamp: 1000 } as any,
        {
          type: 'TRIAL_PRESENTED',
          sessionId,
          trial: {
            index: 0,
            isPositionTarget: false,
            isSoundTarget: false,
            isColorTarget: false,
          } as any,
          timestamp: 1100,
          isiMs: 2000,
          stimulusDurationMs: 500,
        } as any,
        {
          type: 'USER_RESPONDED',
          sessionId,
          trialIndex: 0,
          modality: 'unknown' as any,
          reactionTimeMs: 300,
        } as any,
      ];

      const turns = projectTempoTurns(events);
      expect(turns[0]!.verdict).toBe('correct'); // Unknown modality response doesn't count for position/audio
    });

    test('should handle color modality', () => {
      const events: GameEvent[] = [
        {
          type: 'SESSION_STARTED',
          sessionId,
          nLevel: 0,
          timestamp: 1000,
          config: { activeModalities: ['position', 'audio', 'color'] },
        } as any,
        {
          type: 'TRIAL_PRESENTED',
          sessionId,
          trial: {
            index: 0,
            position: 0,
            sound: 'C',
            color: 'ink-navy',
            isPositionTarget: false,
            isSoundTarget: false,
            isColorTarget: true,
          } as any,
          timestamp: 1100,
          isiMs: 2000,
          stimulusDurationMs: 500,
        } as any,
      ];

      const turns = projectTempoTurns(events);
      expect(turns[0]!.detail.kind).toBe('tempo-trial');
      expect(turns[0]!.headline).toContain('COL✗');
      // @ts-expect-error test override
      expect(turns[0]!.detail.targets).toContain('color');
      // @ts-expect-error test override
      expect(turns[0]!.detail.responses).toHaveProperty('color');
    });

    test('should project image and arithmetic modalities when configured', () => {
      const events: GameEvent[] = [
        {
          type: 'SESSION_STARTED',
          sessionId,
          nLevel: 0,
          timestamp: 1000,
          config: { activeModalities: ['position', 'audio', 'image', 'arithmetic'] },
        } as any,
        {
          type: 'TRIAL_PRESENTED',
          sessionId,
          trial: {
            index: 0,
            position: 0,
            sound: 'C',
            color: 'ink-navy',
            image: 'circle',
            isPositionTarget: false,
            isSoundTarget: false,
            isColorTarget: false,
            isImageTarget: true,
            isArithmeticTarget: true,
          } as any,
          timestamp: 1100,
          isiMs: 2000,
          stimulusDurationMs: 500,
        } as any,
        {
          type: 'USER_RESPONDED',
          sessionId,
          trialIndex: 0,
          modality: 'image',
          reactionTimeMs: 350,
        } as any,
        {
          type: 'USER_RESPONDED',
          sessionId,
          trialIndex: 0,
          modality: 'arithmetic',
          reactionTimeMs: 420,
          answerText: '7',
        } as any,
      ];

      const turns = projectTempoTurns(events);
      expect(turns).toHaveLength(1);
      expect(turns[0]!.headline).toContain('IMA✓');
      expect(turns[0]!.headline).toContain('ARI✓');
      // @ts-expect-error test override
      expect(turns[0]!.detail.targets).toContain('image');
      // @ts-expect-error test override
      expect(turns[0]!.detail.targets).toContain('arithmetic');
      // @ts-expect-error test override
      expect(turns[0]!.detail.responses).toHaveProperty('image');
      // @ts-expect-error test override
      expect(turns[0]!.detail.responses).toHaveProperty('arithmetic');
    });
  });

  describe('projectMemoTurns', () => {
    const trials: Trial[] = [
      { index: 0, position: 1, sound: 'C' } as any,
      { index: 1, position: 2, sound: 'H' } as any,
    ];

    test('should project a recall session', () => {
      const events: MemoEvent[] = [
        {
          type: 'RECALL_WINDOW_OPENED',
          trialIndex: 1,
          requiredWindowDepth: 2,
          timestamp: 5000,
        } as any,
        {
          type: 'RECALL_PICKED',
          trialIndex: 1,
          slotIndex: 0,
          pick: { modality: 'position', value: 2 },
          timestamp: 6000,
        } as any,
        {
          type: 'RECALL_PICKED',
          trialIndex: 1,
          slotIndex: 1,
          pick: { modality: 'position', value: 1 },
          timestamp: 7000,
        } as any,
        {
          type: 'RECALL_WINDOW_COMMITTED',
          trialIndex: 1,
          timestamp: 8000,
          recallDurationMs: 3000,
        } as any,
      ];

      const turns = projectMemoTurns(events, trials);

      expect(turns).toHaveLength(1);
      const turn = turns[0];
      expect(turn!.verdict).toBe('correct');
      expect(turn!.headline).toBe('#2 [2/2]');
      expect(turn!.subline).toBe('3s');
    });

    test('should handle incorrect picks and partial verdicts', () => {
      const events: MemoEvent[] = [
        {
          type: 'RECALL_WINDOW_OPENED',
          trialIndex: 1,
          requiredWindowDepth: 2,
          timestamp: 5000,
        } as any,
        {
          type: 'RECALL_PICKED',
          trialIndex: 1,
          slotIndex: 0,
          pick: { modality: 'position', value: 99 }, // Wrong
          timestamp: 6000,
        } as any,
      ];

      const turns = projectMemoTurns(events, trials);
      expect(turns[0]!.verdict).toBe('incorrect'); // 0 correct out of 1 pick
      expect(turns[0]!.errorTags).toContain('wrong-pick');
    });

    test('should return no-action verdict for empty windows', () => {
      const events: MemoEvent[] = [
        {
          type: 'RECALL_WINDOW_OPENED',
          trialIndex: 1,
          requiredWindowDepth: 2,
          timestamp: 5000,
        } as any,
      ];

      const turns = projectMemoTurns(events, trials);
      expect(turns[0]!.verdict).toBe('no-action');
    });
  });

  describe('projectPlaceTurns', () => {
    test('should project a flow session', () => {
      const events: PlaceEvent[] = [
        {
          type: 'FLOW_STIMULUS_SHOWN',
          trialIndex: 0,
          position: 1,
          sound: 'C',
          timestamp: 1000,
        } as any,
        {
          type: 'FLOW_PLACEMENT_STARTED',
          trialIndex: 0,
          proposalIds: ['pos-0'],
          timestamp: 1500,
        } as any,
        {
          type: 'FLOW_DROP_ATTEMPTED',
          trialIndex: 0,
          proposalId: 'pos-0',
          correct: true,
          timestamp: 2000,
        } as any,
        {
          type: 'FLOW_TURN_COMPLETED',
          trialIndex: 0,
          turnDurationMs: 1000,
          timestamp: 2500,
        } as any,
      ];

      const turns = projectPlaceTurns(events);

      expect(turns).toHaveLength(1);
      const turn = turns[0];
      expect(turn!.verdict).toBe('correct');
      expect(turn!.headline).toBe('#1 [1/1]');
      expect(turn!.subline).toBe('1.0s');
      expect(turn!.detail.kind).toBe('flow-turn');
    });

    test('should handle multiple proposals and partial success', () => {
      const events: PlaceEvent[] = [
        {
          type: 'FLOW_STIMULUS_SHOWN',
          trialIndex: 0,
          position: 1,
          sound: 'C',
          timestamp: 1000,
        } as any,
        {
          type: 'FLOW_PLACEMENT_STARTED',
          trialIndex: 0,
          proposalIds: ['pos-0', 'audio-0'],
          timestamp: 1500,
        } as any,
        { type: 'FLOW_DROP_ATTEMPTED', trialIndex: 0, proposalId: 'pos-0', correct: true } as any,
        {
          type: 'FLOW_DROP_ATTEMPTED',
          trialIndex: 0,
          proposalId: 'audio-0',
          correct: false,
        } as any,
      ];

      const turns = projectPlaceTurns(events);
      expect(turns[0]!.verdict).toBe('partial');
      expect(turns[0]!.errorTags).toContain('order-error');
    });

    test('should handle no-action verdict', () => {
      const events: PlaceEvent[] = [
        { type: 'FLOW_PLACEMENT_STARTED', trialIndex: 0, proposalIds: [], timestamp: 1500 } as any,
      ];

      const turns = projectPlaceTurns(events);
      expect(turns[0]!.verdict).toBe('no-action');
    });

    test('should reconstruct proposals from history depth', () => {
      const events: PlaceEvent[] = [
        { type: 'FLOW_STIMULUS_SHOWN', trialIndex: 0, position: 1, sound: 'C' } as any,
        { type: 'FLOW_STIMULUS_SHOWN', trialIndex: 1, position: 2, sound: 'H' } as any,
        { type: 'FLOW_PLACEMENT_STARTED', trialIndex: 1, proposalIds: ['pos-1', 'audio-0'] } as any,
      ];

      const turns = projectPlaceTurns(events);
      const proposals = (turns[0]!.detail as any).proposals;
      expect(proposals).toHaveLength(2);
      // pos-1 refers to trial 0 (1-1=0)
      expect(proposals.find((p: any) => p.id === 'pos-1').value).toBe(1);
      // audio-0 refers to trial 1 (1-0=1), which has sound 'H'
      expect(proposals.find((p: any) => p.id === 'audio-0').value).toBe('H');
    });

    test('should handle "position" long label in Flow', () => {
      const events: PlaceEvent[] = [
        { type: 'FLOW_STIMULUS_SHOWN', trialIndex: 0, position: 5 } as any,
        { type: 'FLOW_PLACEMENT_STARTED', trialIndex: 0, proposalIds: ['position-0'] } as any,
      ];

      const turns = projectPlaceTurns(events);
      const proposals = (turns[0]!.detail as any).proposals;
      expect(proposals[0].value).toBe(5);
    });
  });

  describe('projectCorsiTurns', () => {
    test('should project detailed Corsi trials', () => {
      const events: GameEvent[] = [
        {
          type: 'CORSI_TRIAL_COMPLETED',
          trialIndex: 0,
          span: 3,
          sequence: [0, 4, 8],
          recalled: [0, 4, 8],
          correct: true,
          responseTimeMs: 1320,
          timestamp: 1000,
        } as any,
        {
          type: 'CORSI_TRIAL_COMPLETED',
          trialIndex: 1,
          span: 4,
          sequence: [0, 2, 5, 7],
          recalled: [0, 2, 6, 7],
          correct: false,
          responseTimeMs: 1710,
          timestamp: 3000,
        } as any,
      ];

      const turns = projectCorsiTurns(events);

      expect(turns).toHaveLength(2);
      expect(turns[0]!.detail.kind).toBe('corsi-trial');
      expect(turns[0]!.verdict).toBe('correct');
      expect(turns[0]!.headline).toBe('#1 Span 3');
      expect(turns[1]!.verdict).toBe('incorrect');
      expect(turns[1]!.errorTags).toContain('order-error');
      expect((turns[1]!.detail as any).firstErrorIndex).toBe(2);
    });
  });
});
