/**
 * Tests for ReplayRecoveryProjector
 */

import { describe, expect, test } from 'bun:test';
import { ReplayRecoveryProjector } from './replay-recovery-projector';
import type { ReplayRun, ReplayEvent } from '../types/replay-interactif';

describe('ReplayRecoveryProjector', () => {
  const mockRun: ReplayRun = {
    id: 'run-123',
    sessionId: 'session-456',
    // @ts-expect-error test override
    sessionType: 'tempo',
    parentRunId: null,
    depth: 1,
    status: 'in_progress',
    createdAt: Date.now(),
  };

  const mockEvents: ReplayEvent[] = [
    { type: 'SESSION_STARTED', timestamp: 1000, payload: {}, actor: 'auto' } as any,
    {
      type: 'TRIAL_PRESENTED',
      timestamp: 2000,
      payload: { trial: { index: 5 } },
      actor: 'auto',
    } as any,
    { type: 'USER_RESPONDED', timestamp: 2500, payload: {}, actor: 'user' } as any,
  ];

  describe('project()', () => {
    test('should return null for completed runs', () => {
      const result = ReplayRecoveryProjector.project(
        { ...mockRun, status: 'completed' },
        mockEvents,
      );
      expect(result).toBeNull();
    });

    test('should return null for empty events', () => {
      const result = ReplayRecoveryProjector.project(mockRun, []);
      expect(result).toBeNull();
    });

    test('should project recoverable state', () => {
      const result = ReplayRecoveryProjector.project(mockRun, mockEvents);
      expect(result).not.toBeNull();
      expect(result?.lastTimeMs).toBe(2500);
      expect(result?.lastTrialIndex).toBe(5);
      expect(result?.isStale).toBe(false);
    });

    test('should detect stale snapshots', () => {
      const oldTimestamp = Date.now() - 40 * 60 * 1000; // 40 mins ago
      const result = ReplayRecoveryProjector.project(mockRun, mockEvents, oldTimestamp);
      expect(result?.isStale).toBe(true);
    });
  });

  describe('Helper Methods', () => {
    test('getLastTimeMs should return 0 for empty events', () => {
      expect(ReplayRecoveryProjector.getLastTimeMs([])).toBe(0);
    });

    test('getLastTrialIndex should return -1 if no trial events', () => {
      expect(ReplayRecoveryProjector.getLastTrialIndex([{ type: 'OTHER' } as any])).toBe(-1);
    });

    test('getLastTrialIndex should work for different modes', () => {
      expect(
        ReplayRecoveryProjector.getLastTrialIndex([
          { type: 'FLOW_STIMULUS_SHOWN', payload: { trial: { index: 10 } } } as any,
        ]),
      ).toBe(10);
      expect(
        ReplayRecoveryProjector.getLastTrialIndex([
          { type: 'RECALL_STIMULUS_SHOWN' } as any, // No payload.trial.index
        ]),
      ).toBe(0); // Falls back to length - 1
    });

    test('countActiveEvents should ignore skipped events', () => {
      const events = [
        { skipped: false } as any,
        { skipped: true } as any,
        { skipped: false } as any,
      ];
      expect(ReplayRecoveryProjector.countActiveEvents(events)).toBe(2);
    });

    test('hasUserProgress should detect user actions', () => {
      expect(ReplayRecoveryProjector.hasUserProgress([{ actor: 'auto' } as any])).toBe(false);
      expect(ReplayRecoveryProjector.hasUserProgress([{ actor: 'user' } as any])).toBe(true);
    });
  });
});
