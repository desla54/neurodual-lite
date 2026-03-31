/**
 * UPSProjector Tests
 *
 * Tests for the Unified Performance Score projection from events.
 */

import { describe, expect, test } from 'bun:test';
import { UPSProjector } from './ups-projector';

import type {
  FlowDropAttemptedEvent,
  PlaceSessionEndedEvent,
  PlaceSessionStartedEvent,
  FlowTurnCompletedEvent,
  GameEvent,
  RecallPickedEvent,
  MemoSessionEndedEvent,
  MemoSessionStartedEvent,
  RecallWindowCommittedEvent,
  RecallWindowOpenedEvent,
  SessionEndedEvent,
  SessionStartedEvent,
  TrialPresentedEvent,
  UserResponseEvent,
} from './events';
import type { Trial } from '../types/core';

// =============================================================================
// Helpers
// =============================================================================

let sessionIdCounter = 0;
function nextSessionId(prefix: string): string {
  sessionIdCounter += 1;
  return `${prefix}-${sessionIdCounter}`;
}

function createTempoSession(options: {
  nLevel?: number;
  trials?: { isPositionTarget: boolean; isSoundTarget: boolean }[];
  responses?: { trialIndex: number; modality: 'position' | 'audio'; reactionTimeMs: number }[];
}): GameEvent[] {
  const events: GameEvent[] = [];
  const sessionId = nextSessionId('session-tempo');

  const sessionStart: SessionStartedEvent = {
    id: `start-${sessionId}`,
    timestamp: Date.now(),
    sessionId,
    type: 'SESSION_STARTED',
    userId: 'user-1',
    nLevel: options.nLevel ?? 2,
    device: {
      platform: 'web',
      screenWidth: 1920,
      screenHeight: 1080,
      userAgent: 'test',
      touchCapable: false,
    },
    context: {
      timeOfDay: 'morning',
      localHour: 9,
      dayOfWeek: 1,
      timezone: 'Europe/Paris',
    },
    config: {
      nLevel: options.nLevel ?? 2,
      trialsCount: options.trials?.length ?? 20,
      activeModalities: ['position', 'audio'],
      targetProbability: 0.25,
      lureProbability: 0.1,
      // @ts-expect-error test override
      stimulusDurationMs: 500,
      isiMinMs: 2000,
      isiMaxMs: 2500,
    },
  };
  events.push(sessionStart);

  const trials = options.trials ?? [
    { isPositionTarget: true, isSoundTarget: false },
    { isPositionTarget: false, isSoundTarget: true },
    { isPositionTarget: true, isSoundTarget: true },
    { isPositionTarget: false, isSoundTarget: false },
  ];

  for (let i = 0; i < trials.length; i++) {
    const trial = trials[i]!;
    // @ts-expect-error test override
    events.push({
      id: `trial-${sessionId}-${i}`,
      timestamp: sessionStart.timestamp + (i + 1) * 3000,
      sessionId,
      type: 'TRIAL_PRESENTED',
      trial: {
        index: i,
        position: 1,
        sound: 'C',
        color: 'red',
        trialType: 'standard',
        isPositionTarget: trial.isPositionTarget,
        isSoundTarget: trial.isSoundTarget,
        isColorTarget: false,
        isBuffer: false,
      },
      isiMs: 2000,
      stimulusDurationMs: 500,
    } as TrialPresentedEvent);
  }

  const responses = options.responses ?? [];
  for (const resp of responses) {
    events.push({
      id: `resp-${sessionId}-${resp.trialIndex}-${resp.modality}`,
      timestamp: sessionStart.timestamp + (resp.trialIndex + 1) * 3000 + 400,
      sessionId,
      type: 'USER_RESPONDED',
      trialIndex: resp.trialIndex,
      modality: resp.modality,
      reactionTimeMs: resp.reactionTimeMs,
      pressDurationMs: 150,
      responsePhase: 'during_stimulus',
    } as UserResponseEvent);
  }

  events.push({
    id: `end-${sessionId}`,
    timestamp: sessionStart.timestamp + (trials.length + 1) * 3000,
    sessionId,
    type: 'SESSION_ENDED',
    reason: 'completed',
  } as SessionEndedEvent);

  return events;
}

function createPlaceSession(options: {
  nLevel?: number;
  drops?: { correct: boolean; placementTimeMs: number }[];
}): GameEvent[] {
  const events: GameEvent[] = [];
  const sessionId = nextSessionId('session-flow');
  const drops = options.drops ?? [
    { correct: true, placementTimeMs: 500 },
    { correct: true, placementTimeMs: 600 },
  ];

  // @ts-expect-error test override
  const sessionStart: PlaceSessionStartedEvent = {
    id: `start-${sessionId}`,
    timestamp: Date.now(),
    sessionId,
    type: 'FLOW_SESSION_STARTED',
    eventId: `start-${sessionId}`,
    seq: 0,
    schemaVersion: 1,
    occurredAtMs: Date.now(),
    monotonicMs: 0,
    userId: 'user-1',
    config: {
      nLevel: options.nLevel ?? 2,
      activeModalities: ['position', 'audio'],
      trialsCount: 10,
      stimulusDurationMs: 500,
      placementOrderMode: 'free',
    },
    device: {
      platform: 'web',
      screenWidth: 1920,
      screenHeight: 1080,
      userAgent: 'test',
      touchCapable: true,
    },
    context: {
      timeOfDay: 'morning',
      localHour: 9,
      dayOfWeek: 1,
      timezone: 'Europe/Paris',
    },
  };
  events.push(sessionStart);

  let seq = 1;
  for (let i = 0; i < drops.length; i++) {
    const drop = drops[i]!;
    events.push({
      id: `drop-${sessionId}-${i}`,
      sessionId,
      type: 'FLOW_DROP_ATTEMPTED',
      eventId: `drop-${sessionId}-${i}`,
      seq: seq++,
      schemaVersion: 1,
      occurredAtMs: sessionStart.timestamp + 1000 + i * 1000,
      monotonicMs: 1000 + i * 1000,
      trialIndex: 0,
      proposalId: `prop-${i}`,
      proposalType: i % 2 === 0 ? 'position' : 'audio',
      proposalValue: i % 2 === 0 ? 1 : 'C',
      targetSlot: i,
      correct: drop.correct,
      placementTimeMs: drop.placementTimeMs,
      dropOrder: i + 1,
      totalDistancePx: 100,
      directDistancePx: 95,
      dragStartedAtMs: sessionStart.timestamp + 1000 + i * 1000 - drop.placementTimeMs,
    } as FlowDropAttemptedEvent);
  }

  events.push({
    id: `turn-${sessionId}-0`,
    sessionId,
    type: 'FLOW_TURN_COMPLETED',
    eventId: `turn-${sessionId}-0`,
    seq: seq++,
    schemaVersion: 1,
    occurredAtMs: sessionStart.timestamp + 3000,
    monotonicMs: 3000,
    trialIndex: 0,
    turnDurationMs: 2000,
  } as FlowTurnCompletedEvent);

  events.push({
    id: `end-${sessionId}`,
    sessionId,
    type: 'FLOW_SESSION_ENDED',
    eventId: `end-${sessionId}`,
    seq: seq++,
    schemaVersion: 1,
    occurredAtMs: sessionStart.timestamp + 5000,
    monotonicMs: 5000,
    reason: 'completed',
    totalTrials: 10,
  } as PlaceSessionEndedEvent);

  return events;
}

function createMemoSession(
  options: {
    nLevel?: number;
    picks?: { slotIndex: number; modality: 'position' | 'audio'; value: number | string }[];
  },
  trials: Trial[],
): GameEvent[] {
  const events: GameEvent[] = [];
  const sessionId = nextSessionId('session-memo');

  const sessionStart: MemoSessionStartedEvent = {
    id: `start-${sessionId}`,
    timestamp: Date.now(),
    sessionId,
    type: 'RECALL_SESSION_STARTED',
    eventId: `start-${sessionId}`,
    seq: 0,
    schemaVersion: 1,
    occurredAtMs: Date.now(),
    monotonicMs: 0,
    userId: 'user-1',
    config: {
      nLevel: options.nLevel ?? 2,
      activeModalities: ['position', 'audio'],
      trialsCount: trials.length,
      // @ts-expect-error test override
      stimulusDurationMs: 500,
      feedbackDurationMs: 1000,
    },
    device: {
      platform: 'web',
      screenWidth: 1920,
      screenHeight: 1080,
      userAgent: 'test',
      touchCapable: true,
    },
    context: {
      timeOfDay: 'morning',
      localHour: 9,
      dayOfWeek: 1,
      timezone: 'Europe/Paris',
    },
    trialsSeed: 'seed-1',
    trialsHash: 'hash-1',
    trialsCount: trials.length,
  };
  events.push(sessionStart);

  events.push({
    id: `window-${sessionId}-0`,
    sessionId,
    type: 'RECALL_WINDOW_OPENED',
    eventId: `window-${sessionId}-0`,
    seq: 1,
    schemaVersion: 1,
    occurredAtMs: sessionStart.timestamp + 1000,
    monotonicMs: 1000,
    trialIndex: 2,
    requiredWindowDepth: options.nLevel ?? 2,
  } as RecallWindowOpenedEvent);

  const picks = options.picks ?? [
    { slotIndex: 1, modality: 'position' as const, value: 1 },
    { slotIndex: 1, modality: 'audio' as const, value: 'C' },
    { slotIndex: 2, modality: 'position' as const, value: 2 },
    { slotIndex: 2, modality: 'audio' as const, value: 'D' },
  ];

  let seq = 2;
  for (let i = 0; i < picks.length; i++) {
    const pick = picks[i]!;
    events.push({
      id: `pick-${sessionId}-${i}`,
      sessionId,
      type: 'RECALL_PICKED',
      eventId: `pick-${sessionId}-${i}`,
      seq: seq++,
      schemaVersion: 1,
      occurredAtMs: sessionStart.timestamp + 1500 + i * 200,
      monotonicMs: 1500 + i * 200,
      trialIndex: 2,
      slotIndex: pick.slotIndex,
      pick: {
        modality: pick.modality,
        value: pick.value,
      },
    } as RecallPickedEvent);
  }

  events.push({
    id: `commit-${sessionId}-0`,
    sessionId,
    type: 'RECALL_WINDOW_COMMITTED',
    eventId: `commit-${sessionId}-0`,
    seq: seq++,
    schemaVersion: 1,
    occurredAtMs: sessionStart.timestamp + 3000,
    monotonicMs: 3000,
    trialIndex: 2,
    recallDurationMs: 2000,
  } as RecallWindowCommittedEvent);

  events.push({
    id: `end-${sessionId}`,
    sessionId,
    type: 'RECALL_SESSION_ENDED',
    eventId: `end-${sessionId}`,
    seq: seq++,
    schemaVersion: 1,
    occurredAtMs: sessionStart.timestamp + 5000,
    monotonicMs: 5000,
    reason: 'completed',
    totalTrials: trials.length,
  } as MemoSessionEndedEvent);

  return events;
}

function createTrials(count: number): Trial[] {
  const positions = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const sounds = ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'H', 'K'];

  // @ts-expect-error test override
  return Array.from({ length: count }, (_, i) => ({
    index: i,
    position: positions[i % 9]!,
    sound: sounds[i % 9]!,
    color: 'red',
    isPositionTarget: false,
    isAudioTarget: false,
    isColorTarget: false,
    isBuffer: i < 2,
  }));
}

// =============================================================================
// Tests
// =============================================================================

describe('UPSProjector', () => {
  test('diagnostic', () => {
    expect(UPSProjector).toBeDefined();
    expect(typeof UPSProjector.detectMode).toBe('function');
    expect(typeof UPSProjector.project).toBe('function');
  });

  describe('detectMode()', () => {
    test('detects tempo mode', () => {
      const events = createTempoSession({});
      expect(UPSProjector.detectMode(events)).toBe('tempo');
    });

    test('detects flow mode', () => {
      const events = createPlaceSession({});
      expect(UPSProjector.detectMode(events)).toBe('flow');
    });

    test('detects memo mode', () => {
      const trials = createTrials(5);
      const events = createMemoSession({}, trials);
      expect(UPSProjector.detectMode(events)).toBe('recall');
    });

    test('returns unknown for empty events', () => {
      expect(UPSProjector.detectMode([])).toBe('unknown');
    });
  });

  describe('projectTempo()', () => {
    test('projects tempo session with UPS', () => {
      const events = createTempoSession({
        trials: [
          { isPositionTarget: true, isSoundTarget: false },
          { isPositionTarget: false, isSoundTarget: true },
          { isPositionTarget: false, isSoundTarget: false },
          { isPositionTarget: true, isSoundTarget: true },
        ],
        responses: [
          { trialIndex: 0, modality: 'position', reactionTimeMs: 400 },
          { trialIndex: 1, modality: 'audio', reactionTimeMs: 450 },
          { trialIndex: 3, modality: 'position', reactionTimeMs: 380 },
          { trialIndex: 3, modality: 'audio', reactionTimeMs: 420 },
        ],
      });

      const result = UPSProjector.projectTempo(events);

      expect(result).not.toBeNull();
      expect(result!.mode).toBe('tempo');
      expect(result!.ups.score).toBeGreaterThanOrEqual(0);
      expect(result!.ups.score).toBeLessThanOrEqual(100);
      expect(result!.completed).toBe(true);
    });

    test('returns null for non-tempo events', () => {
      const events = createPlaceSession({});
      const result = UPSProjector.projectTempo(events);
      expect(result).toBeNull();
    });

    test('includes journey stage id when present', () => {
      const events = createTempoSession({});
      const sessionStart = events.find((e: any) => e.type === 'SESSION_STARTED');
      if (sessionStart) {
        (sessionStart as any).journeyStageId = 5;
      }

      const result = UPSProjector.projectTempo(events);

      expect(result).not.toBeNull();
      expect(result!.journeyStageId).toBe(5);
    });
  });

  describe('projectFlow()', () => {
    test('projects flow session with UPS', () => {
      const events = createPlaceSession({
        drops: [
          { correct: true, placementTimeMs: 500 },
          { correct: true, placementTimeMs: 600 },
          { correct: false, placementTimeMs: 800 },
          { correct: true, placementTimeMs: 550 },
        ],
      });

      const result = UPSProjector.projectFlow(events);

      expect(result).not.toBeNull();
      expect(result!.mode).toBe('flow');
      expect(result!.ups.score).toBeGreaterThanOrEqual(0);
      expect(result!.ups.score).toBeLessThanOrEqual(100);
      expect(result!.ups.components.accuracy).toBe(75);
    });

    test('handles zero responses correctly', () => {
      const events = createPlaceSession({
        drops: [],
      });

      const result = UPSProjector.projectFlow(events);

      expect(result).not.toBeNull();
      expect(result!.ups.components.accuracy).toBe(0);
      expect(result!.ups.score).toBeLessThan(100);
    });

    test('returns null for non-flow events', () => {
      const events = createTempoSession({});
      const result = UPSProjector.projectFlow(events);
      expect(result).toBeNull();
    });

    test('perfect drops yield high UPS', () => {
      const events = createPlaceSession({
        drops: [
          { correct: true, placementTimeMs: 400 },
          { correct: true, placementTimeMs: 450 },
          { correct: true, placementTimeMs: 380 },
          { correct: true, placementTimeMs: 420 },
        ],
      });

      const result = UPSProjector.projectFlow(events);

      expect(result).not.toBeNull();
      expect(result!.ups.components.accuracy).toBe(100);
      expect(result!.ups.score).toBeGreaterThan(80);
    });
  });

  describe('projectRecall()', () => {
    test('projects memo session with UPS', () => {
      const trials = createTrials(5);
      // @ts-expect-error test override
      trials[2]!.position = 1;
      // @ts-expect-error test override
      trials[2]!.sound = 'C';
      // @ts-expect-error test override
      trials[1]!.position = 2;
      // @ts-expect-error test override
      trials[1]!.sound = 'D';

      const events = createMemoSession(
        {
          nLevel: 2,
          picks: [
            { slotIndex: 1, modality: 'position', value: 1 },
            { slotIndex: 1, modality: 'audio', value: 'C' },
            { slotIndex: 2, modality: 'position', value: 2 },
            { slotIndex: 2, modality: 'audio', value: 'D' },
          ],
        },
        trials,
      );

      const result = UPSProjector.projectRecall(events, trials);

      expect(result).not.toBeNull();
      expect(result!.mode).toBe('recall');
      expect(result!.ups.score).toBeGreaterThanOrEqual(0);
      expect(result!.ups.score).toBeLessThanOrEqual(100);
    });

    test('returns null for non-memo events', () => {
      const trials = createTrials(5);
      const events = createPlaceSession({});
      const result = UPSProjector.projectRecall(events, trials);
      expect(result).toBeNull();
    });
  });

  describe('project()', () => {
    test('auto-detects tempo mode', () => {
      const events = createTempoSession({});
      const result = UPSProjector.project(events);

      expect(result).not.toBeNull();
      expect(result!.mode).toBe('tempo');
    });

    test('auto-detects flow mode', () => {
      const events = createPlaceSession({});
      const result = UPSProjector.project(events);

      expect(result).not.toBeNull();
      expect(result!.mode).toBe('flow');
    });

    test('auto-detects memo mode', () => {
      const trials = createTrials(5);
      const events = createMemoSession({}, trials);
      const result = UPSProjector.project(events, trials);

      expect(result).not.toBeNull();
      expect(result!.mode).toBe('recall');
    });

    test('returns null for unknown events', () => {
      const result = UPSProjector.project([]);
      expect(result).toBeNull();
    });

    test('gaming flag affects journey eligibility', () => {
      const events = createPlaceSession({
        drops: Array(10).fill({ correct: true, placementTimeMs: 500 }),
      });

      const normalResult = UPSProjector.project(events, undefined, false);
      const gamingResult = UPSProjector.project(events, undefined, true);

      expect(normalResult!.ups.journeyEligible).toBe(true);
      expect(gamingResult!.ups.journeyEligible).toBe(false);
    });
  });

  describe('getScore()', () => {
    test('returns just the score', () => {
      const events = createPlaceSession({
        drops: [
          { correct: true, placementTimeMs: 500 },
          { correct: true, placementTimeMs: 600 },
        ],
      });

      const score = UPSProjector.getScore(events);

      expect(score).not.toBeNull();
      expect(typeof score).toBe('number');
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    test('returns null for invalid events', () => {
      const score = UPSProjector.getScore([]);
      expect(score).toBeNull();
    });
  });
});
