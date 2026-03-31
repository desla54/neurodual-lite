/**
 * Tests for interactive-replay-engine.ts
 */

import { describe, expect, it } from 'bun:test';
import { InteractiveReplayEngine } from './interactive-replay-engine';
import type { GameEvent, TrialPresentedEvent, UserResponseEvent } from './events';
import type { Trial } from '../types/core';

// =============================================================================
// Test Helpers
// =============================================================================

let eventCounter = 0;

function createEventId(): string {
  return `event-${++eventCounter}`;
}

function createTrial(index: number, overrides: Partial<Trial> = {}): Trial {
  return {
    index,
    // @ts-expect-error test override
    position: index % 9,
    sound: 'C',
    isBuffer: index < 2,
    isPositionTarget: false,
    isSoundTarget: false,
    isPositionLure: false,
    isSoundLure: false,
    isColorTarget: false,
    ...overrides,
  };
}

function createSessionStartEvent(timestamp = 0, sessionId = 'session-1'): GameEvent {
  // @ts-expect-error test override
  return {
    type: 'SESSION_STARTED',
    id: createEventId(),
    timestamp,
    sessionId,
    schemaVersion: 1,
    userId: 'user-1',
    nLevel: 2,
    config: {
      nLevel: 2,
      trialsCount: 20,
      activeModalities: ['position', 'audio'],
      intervalSeconds: 3,
      stimulusDurationMs: 500,
      generator: 'Sequence',
    },
    gameMode: 'dual-catch',
  } as GameEvent;
}

function createTrialPresentedEvent(
  trialIndex: number,
  timestamp: number,
  sessionId = 'session-1',
  trialOverrides: Partial<Trial> = {},
): TrialPresentedEvent {
  return {
    type: 'TRIAL_PRESENTED',
    id: createEventId(),
    timestamp,
    sessionId,
    schemaVersion: 1,
    trial: createTrial(trialIndex, trialOverrides),
    isiMs: 3000,
    stimulusDurationMs: 500,
  } as TrialPresentedEvent;
}

function createUserResponseEvent(
  trialIndex: number,
  modality: 'position' | 'audio',
  timestamp: number,
  sessionId = 'session-1',
): UserResponseEvent {
  return {
    type: 'USER_RESPONDED',
    id: createEventId(),
    timestamp,
    sessionId,
    schemaVersion: 1,
    trialIndex,
    modality,
    reactionTimeMs: 400,
    pressDurationMs: 100,
    responsePhase: 'during_stimulus',
  } as UserResponseEvent;
}

function createSessionEndEvent(timestamp: number, sessionId = 'session-1'): GameEvent {
  return {
    type: 'SESSION_ENDED',
    id: createEventId(),
    timestamp,
    sessionId,
    schemaVersion: 1,
    reason: 'completed',
  } as GameEvent;
}

// Flow mode helpers
function createFlowSessionStartEvent(timestamp = 0, sessionId = 'flow-session-1'): GameEvent {
  return {
    type: 'FLOW_SESSION_STARTED',
    id: createEventId(),
    timestamp,
    sessionId,
    schemaVersion: 1,
    userId: 'user-1',
    config: { nLevel: 2, trialsCount: 15 },
    gameMode: 'dual-place',
  } as GameEvent;
}

function createFlowStimulusShownEvent(
  trialIndex: number,
  timestamp: number,
  sessionId = 'flow-session-1',
): GameEvent {
  return {
    type: 'FLOW_STIMULUS_SHOWN',
    id: createEventId(),
    timestamp,
    sessionId,
    schemaVersion: 1,
    trialIndex,
    position: trialIndex % 8,
    sound: 'C',
    stimulusDurationMs: 600,
  } as GameEvent;
}

function createFlowDropAttemptedEvent(
  trialIndex: number,
  timestamp: number,
  correct: boolean,
  sessionId = 'flow-session-1',
): GameEvent {
  return {
    type: 'FLOW_DROP_ATTEMPTED',
    id: createEventId(),
    timestamp,
    sessionId,
    schemaVersion: 1,
    trialIndex,
    proposalId: `proposal-${trialIndex}`,
    proposalType: 'position',
    proposalValue: trialIndex % 8,
    targetSlot: 0,
    correct,
  } as GameEvent;
}

function createFlowSessionEndEvent(timestamp: number, sessionId = 'flow-session-1'): GameEvent {
  return {
    type: 'FLOW_SESSION_ENDED',
    id: createEventId(),
    timestamp,
    sessionId,
    schemaVersion: 1,
    reason: 'completed',
  } as GameEvent;
}

// Recall mode helpers
function createRecallSessionStartEvent(timestamp = 0, sessionId = 'recall-session-1'): GameEvent {
  return {
    type: 'RECALL_SESSION_STARTED',
    id: createEventId(),
    timestamp,
    sessionId,
    schemaVersion: 1,
    userId: 'user-1',
    config: { nLevel: 2, trialsCount: 10 },
    gameMode: 'dual-memo',
  } as GameEvent;
}

function createRecallStimulusShownEvent(
  trialIndex: number,
  timestamp: number,
  sessionId = 'recall-session-1',
): GameEvent {
  // @ts-expect-error test override
  return {
    type: 'RECALL_STIMULUS_SHOWN',
    id: createEventId(),
    timestamp,
    sessionId,
    schemaVersion: 1,
    trialIndex,
    stimulusSequence: [
      { modality: 'position', value: trialIndex % 8 },
      { modality: 'audio', value: 'E' },
    ],
    stimulusDurationMs: 600,
  } as GameEvent;
}

function createRecallPickedEvent(
  trialIndex: number,
  timestamp: number,
  isCorrection: boolean,
  sessionId = 'recall-session-1',
): GameEvent {
  // @ts-expect-error test override
  return {
    type: 'RECALL_PICKED',
    id: createEventId(),
    timestamp,
    sessionId,
    schemaVersion: 1,
    trialIndex,
    slotIndex: 1,
    modality: 'position',
    value: trialIndex % 8,
    isCorrection,
  } as GameEvent;
}

function createRecallSessionEndEvent(timestamp: number, sessionId = 'recall-session-1'): GameEvent {
  return {
    type: 'RECALL_SESSION_ENDED',
    id: createEventId(),
    timestamp,
    sessionId,
    schemaVersion: 1,
    reason: 'completed',
  } as GameEvent;
}

// DualPick mode helpers
function createDualPickSessionStartEvent(
  timestamp = 0,
  sessionId = 'dualpick-session-1',
): GameEvent {
  return {
    type: 'DUAL_PICK_SESSION_STARTED',
    id: createEventId(),
    timestamp,
    sessionId,
    schemaVersion: 1,
    userId: 'user-1',
    config: { nLevel: 2, trialsCount: 12 },
    gameMode: 'dual-pick',
  } as GameEvent;
}

function createDualPickStimulusShownEvent(
  trialIndex: number,
  timestamp: number,
  sessionId = 'dualpick-session-1',
): GameEvent {
  // @ts-expect-error test override
  return {
    type: 'DUAL_PICK_STIMULUS_SHOWN',
    id: createEventId(),
    timestamp,
    sessionId,
    schemaVersion: 1,
    trialIndex,
    position: trialIndex % 8,
    sound: 'D',
    stimulusDurationMs: 500,
  } as GameEvent;
}

function createDualPickDropAttemptedEvent(
  trialIndex: number,
  timestamp: number,
  correct: boolean,
  sessionId = 'dualpick-session-1',
): GameEvent {
  // @ts-expect-error test override
  return {
    type: 'DUAL_PICK_DROP_ATTEMPTED',
    id: createEventId(),
    timestamp,
    sessionId,
    schemaVersion: 1,
    trialIndex,
    proposalId: `pick-proposal-${trialIndex}`,
    label: 'Match',
    targetSlot: 0,
    correct,
  } as GameEvent;
}

function createDualPickSessionEndEvent(
  timestamp: number,
  sessionId = 'dualpick-session-1',
): GameEvent {
  return {
    type: 'DUAL_PICK_SESSION_ENDED',
    id: createEventId(),
    timestamp,
    sessionId,
    schemaVersion: 1,
    reason: 'completed',
  } as GameEvent;
}

// =============================================================================
// Tests
// =============================================================================

describe('InteractiveReplayEngine', () => {
  describe('constructor', () => {
    it('creates engine with minimal events', () => {
      const events: GameEvent[] = [createSessionStartEvent(0), createSessionEndEvent(1000)];

      const engine = new InteractiveReplayEngine(events, ['position'], 'tempo');
      expect(engine).toBeDefined();
      expect(engine.getSessionType()).toBe('tempo');
    });

    it('handles flow session type', () => {
      const events: GameEvent[] = [createFlowSessionStartEvent(0), createFlowSessionEndEvent(1000)];
      const engine = new InteractiveReplayEngine(events, ['position'], 'flow');
      expect(engine.getSessionType()).toBe('flow');
    });

    it('handles recall session type', () => {
      const events: GameEvent[] = [
        createRecallSessionStartEvent(0),
        createRecallSessionEndEvent(1000),
      ];
      const engine = new InteractiveReplayEngine(events, ['position'], 'recall');
      expect(engine.getSessionType()).toBe('recall');
    });

    it('handles dual-pick session type', () => {
      const events: GameEvent[] = [
        createDualPickSessionStartEvent(0),
        createDualPickSessionEndEvent(1000),
      ];
      const engine = new InteractiveReplayEngine(events, ['position'], 'dual-pick');
      expect(engine.getSessionType()).toBe('dual-pick');
    });

    it('builds trial states from parent events', () => {
      const events: GameEvent[] = [
        createSessionStartEvent(0),
        createTrialPresentedEvent(0, 100),
        createTrialPresentedEvent(1, 3100),
        createSessionEndEvent(6000),
      ];

      const engine = new InteractiveReplayEngine(events, ['position', 'audio'], 'tempo');

      expect(engine.getTrialState(0)).toBeDefined();
      expect(engine.getTrialState(1)).toBeDefined();
      expect(engine.getTrialState(2)).toBeUndefined();
    });
  });

  describe('tick', () => {
    it('returns array of events', () => {
      const events: GameEvent[] = [
        createSessionStartEvent(0),
        createTrialPresentedEvent(0, 100),
        createSessionEndEvent(1000),
      ];

      const engine = new InteractiveReplayEngine(events, ['position'], 'tempo');
      const result = engine.tick(200);

      expect(Array.isArray(result)).toBe(true);
    });

    it('auto-plays structure events', () => {
      const events: GameEvent[] = [createSessionStartEvent(0), createTrialPresentedEvent(0, 100)];

      const engine = new InteractiveReplayEngine(events, ['position'], 'tempo');
      const result = engine.tick(150);

      const types = result.map((e) => e.type);
      expect(types).toContain('SESSION_STARTED');
      expect(types).toContain('TRIAL_PRESENTED');
    });

    it('updates currentTrialIndex on TRIAL_PRESENTED', () => {
      const events: GameEvent[] = [
        createSessionStartEvent(0),
        createTrialPresentedEvent(0, 100),
        createTrialPresentedEvent(1, 3100),
        createTrialPresentedEvent(2, 6100),
      ];

      const engine = new InteractiveReplayEngine(events, ['position'], 'tempo');

      expect(engine.getCurrentTrialIndex()).toBe(0);

      engine.tick(150);
      expect(engine.getCurrentTrialIndex()).toBe(0);

      engine.tick(3050); // 3200ms total
      expect(engine.getCurrentTrialIndex()).toBe(1);

      engine.tick(3000); // 6200ms total
      expect(engine.getCurrentTrialIndex()).toBe(2);
    });

    it('processes events in time order', () => {
      const events: GameEvent[] = [
        createSessionStartEvent(0),
        createTrialPresentedEvent(0, 100),
        createUserResponseEvent(0, 'position', 400),
        createTrialPresentedEvent(1, 3100),
      ];

      const engine = new InteractiveReplayEngine(events, ['position'], 'tempo');

      // Tick to 500ms - should process start, trial 0, response
      const result = engine.tick(500);
      expect(result.length).toBe(3);
      expect(result[0]!.type).toBe('SESSION_STARTED');
      expect(result[1]!.type).toBe('TRIAL_PRESENTED');
      expect(result[2]!.type).toBe('USER_RESPONDED');
    });

    it('auto-plays hit responses', () => {
      const events: GameEvent[] = [
        createSessionStartEvent(0),
        createTrialPresentedEvent(0, 100, 'session-1', { isPositionTarget: true }),
        createUserResponseEvent(0, 'position', 400), // Hit - target trial
      ];

      const engine = new InteractiveReplayEngine(events, ['position'], 'tempo');
      const result = engine.tick(500);

      const responseEvent = result.find((e) => e.type === 'USER_RESPONDED');
      expect(responseEvent).toBeDefined();
      expect(responseEvent!.actor).toBe('auto');
      expect(responseEvent!.skipped).toBe(false);
    });

    it('skips false alarm responses', () => {
      const events: GameEvent[] = [
        createSessionStartEvent(0),
        createTrialPresentedEvent(0, 100, 'session-1', { isPositionTarget: false }), // Non-target
        createUserResponseEvent(0, 'position', 400), // False alarm
      ];

      const engine = new InteractiveReplayEngine(events, ['position'], 'tempo');
      const result = engine.tick(500);

      const responseEvent = result.find((e) => e.type === 'USER_RESPONDED');
      expect(responseEvent).toBeDefined();
      expect(responseEvent!.skipped).toBe(true);
      expect(responseEvent!.skipReason).toBe('false_alarm');
    });
  });

  describe('getCurrentTimeMs', () => {
    it('starts at 0', () => {
      const events: GameEvent[] = [createSessionStartEvent(0)];
      const engine = new InteractiveReplayEngine(events, ['position'], 'tempo');

      expect(engine.getCurrentTimeMs()).toBe(0);
    });

    it('advances with tick', () => {
      const events: GameEvent[] = [createSessionStartEvent(0)];
      const engine = new InteractiveReplayEngine(events, ['position'], 'tempo');

      engine.tick(500);
      expect(engine.getCurrentTimeMs()).toBe(500);

      engine.tick(300);
      expect(engine.getCurrentTimeMs()).toBe(800);
    });
  });

  describe('isFinished', () => {
    it('returns false when not finished', () => {
      const events: GameEvent[] = [
        createSessionStartEvent(0),
        createTrialPresentedEvent(0, 100),
        createSessionEndEvent(1000),
      ];

      const engine = new InteractiveReplayEngine(events, ['position'], 'tempo');
      expect(engine.isFinished()).toBe(false);
    });

    it('returns true when all events processed', () => {
      const events: GameEvent[] = [createSessionStartEvent(0), createSessionEndEvent(100)];

      const engine = new InteractiveReplayEngine(events, ['position'], 'tempo');
      engine.tick(200);
      expect(engine.isFinished()).toBe(true);
    });
  });

  describe('getEmittedEvents', () => {
    it('returns all emitted events', () => {
      const events: GameEvent[] = [createSessionStartEvent(0), createTrialPresentedEvent(0, 100)];

      const engine = new InteractiveReplayEngine(events, ['position'], 'tempo');
      engine.tick(200);

      const emitted = engine.getEmittedEvents();
      expect(emitted.length).toBe(2);
    });

    it('includes user responses', () => {
      const events: GameEvent[] = [
        createSessionStartEvent(0),
        createTrialPresentedEvent(0, 100, 'session-1', { isPositionTarget: true }), // Target - miss
      ];

      const engine = new InteractiveReplayEngine(events, ['position'], 'tempo');
      engine.tick(200);

      // User adds correction for missed target
      engine.handleUserResponse('position');

      const emitted = engine.getEmittedEvents();
      const userEvent = emitted.find((e) => e.actor === 'user');
      expect(userEvent).toBeDefined();
      expect(userEvent!.type).toBe('USER_RESPONDED');
    });
  });

  describe('handleUserResponse', () => {
    it('creates user response event', () => {
      const events: GameEvent[] = [
        createSessionStartEvent(0),
        createTrialPresentedEvent(0, 100, 'session-1', { isPositionTarget: true }),
      ];

      const engine = new InteractiveReplayEngine(events, ['position'], 'tempo');
      engine.tick(200);

      const result = engine.handleUserResponse('position');

      expect(result).not.toBeNull();
      expect(result!.actor).toBe('user');
      expect(result!.type).toBe('USER_RESPONDED');
      expect(result!.payload.modality).toBe('position');
    });

    it('returns null for duplicate response', () => {
      const events: GameEvent[] = [
        createSessionStartEvent(0),
        createTrialPresentedEvent(0, 100, 'session-1', { isPositionTarget: true }),
      ];

      const engine = new InteractiveReplayEngine(events, ['position'], 'tempo');
      engine.tick(200);

      engine.handleUserResponse('position');
      const duplicate = engine.handleUserResponse('position');

      expect(duplicate).toBeNull();
    });

    it('returns null if already auto-played (hit)', () => {
      const events: GameEvent[] = [
        createSessionStartEvent(0),
        createTrialPresentedEvent(0, 100, 'session-1', { isPositionTarget: true }),
        createUserResponseEvent(0, 'position', 400), // Auto-played hit
      ];

      const engine = new InteractiveReplayEngine(events, ['position'], 'tempo');
      engine.tick(500);

      // Try to add user response for already-responded modality
      const result = engine.handleUserResponse('position');
      expect(result).toBeNull();
    });

    it('returns null for invalid trial index', () => {
      const events: GameEvent[] = [createSessionStartEvent(0)];
      const engine = new InteractiveReplayEngine(events, ['position'], 'tempo');

      // No trial presented yet
      const result = engine.handleUserResponse('position');
      expect(result).toBeNull();
    });
  });

  describe('hasRespondedForModality', () => {
    it('returns false when no response', () => {
      const events: GameEvent[] = [createSessionStartEvent(0), createTrialPresentedEvent(0, 100)];

      const engine = new InteractiveReplayEngine(events, ['position', 'audio'], 'tempo');
      engine.tick(200);

      expect(engine.hasRespondedForModality('position')).toBe(false);
      expect(engine.hasRespondedForModality('audio')).toBe(false);
    });

    it('returns true for auto-played hit', () => {
      const events: GameEvent[] = [
        createSessionStartEvent(0),
        createTrialPresentedEvent(0, 100, 'session-1', { isPositionTarget: true }),
        createUserResponseEvent(0, 'position', 400),
      ];

      const engine = new InteractiveReplayEngine(events, ['position'], 'tempo');
      engine.tick(500);

      expect(engine.hasRespondedForModality('position')).toBe(true);
    });

    it('returns true for user response', () => {
      const events: GameEvent[] = [
        createSessionStartEvent(0),
        createTrialPresentedEvent(0, 100, 'session-1', { isPositionTarget: true }),
      ];

      const engine = new InteractiveReplayEngine(events, ['position'], 'tempo');
      engine.tick(200);
      engine.handleUserResponse('position');

      expect(engine.hasRespondedForModality('position')).toBe(true);
    });
  });

  describe('wasParentFalseAlarm', () => {
    it('returns false when no false alarm', () => {
      const events: GameEvent[] = [
        createSessionStartEvent(0),
        createTrialPresentedEvent(0, 100, 'session-1', { isPositionTarget: true }),
        createUserResponseEvent(0, 'position', 400), // Hit, not false alarm
      ];

      const engine = new InteractiveReplayEngine(events, ['position'], 'tempo');
      engine.tick(500);

      expect(engine.wasParentFalseAlarm('position')).toBe(false);
    });

    it('returns true for false alarm', () => {
      const events: GameEvent[] = [
        createSessionStartEvent(0),
        createTrialPresentedEvent(0, 100, 'session-1', { isPositionTarget: false }),
        createUserResponseEvent(0, 'position', 400), // False alarm
      ];

      const engine = new InteractiveReplayEngine(events, ['position'], 'tempo');
      engine.tick(500);

      expect(engine.wasParentFalseAlarm('position')).toBe(true);
    });
  });

  describe('computeScore', () => {
    it('returns score delta with counters', () => {
      const events: GameEvent[] = [
        createSessionStartEvent(0),
        createTrialPresentedEvent(0, 100, 'session-1', { isPositionTarget: false }),
        createUserResponseEvent(0, 'position', 400), // False alarm
        createTrialPresentedEvent(1, 3100, 'session-1', { isPositionTarget: true }),
        // No response - miss
      ];

      const engine = new InteractiveReplayEngine(events, ['position'], 'tempo');
      engine.tick(4000);

      // User corrects the miss
      engine.handleUserResponse('position');

      const score = engine.computeScore();

      expect(score.falseAlarmsSkipped).toBe(1);
      expect(score.missesCorrections).toBe(1);
      expect(score.newFalseAlarms).toBe(0);
    });

    it('counts new false alarms from user', () => {
      const events: GameEvent[] = [
        createSessionStartEvent(0),
        createTrialPresentedEvent(0, 100, 'session-1', { isPositionTarget: false }), // Non-target
      ];

      const engine = new InteractiveReplayEngine(events, ['position'], 'tempo');
      engine.tick(200);

      // User incorrectly responds to non-target
      engine.handleUserResponse('position');

      const score = engine.computeScore();
      expect(score.newFalseAlarms).toBe(1);
    });
  });

  describe('toReplayEventInputs', () => {
    it('converts emitted events to persistence format', () => {
      const events: GameEvent[] = [createSessionStartEvent(0), createTrialPresentedEvent(0, 100)];

      const engine = new InteractiveReplayEngine(events, ['position'], 'tempo');
      engine.tick(200);

      const inputs = engine.toReplayEventInputs('run-123');

      expect(inputs.length).toBe(2);
      expect(inputs[0]!.runId).toBe('run-123');
      expect(inputs[0]!.type).toBe('SESSION_STARTED');
      expect(inputs[0]!.actor).toBe('auto');
      expect(typeof inputs[0]!.timestamp).toBe('number');
    });

    it('includes user events', () => {
      const events: GameEvent[] = [
        createSessionStartEvent(0),
        createTrialPresentedEvent(0, 100, 'session-1', { isPositionTarget: true }),
      ];

      const engine = new InteractiveReplayEngine(events, ['position'], 'tempo');
      engine.tick(200);
      engine.handleUserResponse('position');

      const inputs = engine.toReplayEventInputs('run-456');

      const userInput = inputs.find((i) => i.actor === 'user');
      expect(userInput).toBeDefined();
      expect(userInput!.type).toBe('USER_RESPONDED');
    });
  });

  describe('seekTo', () => {
    it('fast-forwards to target time', () => {
      const events: GameEvent[] = [
        createSessionStartEvent(0),
        createTrialPresentedEvent(0, 100),
        createTrialPresentedEvent(1, 3100),
        createTrialPresentedEvent(2, 6100),
        createSessionEndEvent(9000),
      ];

      const engine = new InteractiveReplayEngine(events, ['position'], 'tempo');

      engine.seekTo(5000);

      expect(engine.getCurrentTimeMs()).toBe(5000);
      expect(engine.getCurrentTrialIndex()).toBe(1);
    });

    it('does not emit events during seek', () => {
      const events: GameEvent[] = [
        createSessionStartEvent(0),
        createTrialPresentedEvent(0, 100),
        createTrialPresentedEvent(1, 3100),
      ];

      const engine = new InteractiveReplayEngine(events, ['position'], 'tempo');

      engine.seekTo(4000);

      expect(engine.getEmittedEvents().length).toBe(0);
    });
  });

  describe('restoreEmittedEvents', () => {
    it('restores events from DB', () => {
      const events: GameEvent[] = [createSessionStartEvent(0), createTrialPresentedEvent(0, 100)];

      const engine = new InteractiveReplayEngine(events, ['position'], 'tempo');

      const savedEvents = [
        {
          runId: 'run-1',
          type: 'SESSION_STARTED',
          timestamp: 0,
          payload: {},
          actor: 'auto' as const,
          originEventId: events[0]!.id,
          skipped: false,
          skipReason: null,
        },
      ];

      engine.restoreEmittedEvents(savedEvents);

      expect(engine.getEmittedEvents().length).toBe(1);
    });

    it('restores user responses to trial state', () => {
      const events: GameEvent[] = [createSessionStartEvent(0), createTrialPresentedEvent(0, 100)];

      const engine = new InteractiveReplayEngine(events, ['position'], 'tempo');
      engine.tick(200);

      const savedEvents = [
        {
          runId: 'run-1',
          type: 'USER_RESPONDED',
          timestamp: 150,
          payload: { trialIndex: 0, modality: 'position' as const },
          actor: 'user' as const,
          originEventId: null,
          skipped: false,
          skipReason: null,
        },
      ];

      engine.restoreEmittedEvents(savedEvents);

      // User response restored - duplicate should return null
      const duplicate = engine.handleUserResponse('position');
      expect(duplicate).toBeNull();
    });
  });

  describe('getLastEmittedEvent', () => {
    it('returns null when no events', () => {
      const events: GameEvent[] = [createSessionStartEvent(0)];
      const engine = new InteractiveReplayEngine(events, ['position'], 'tempo');

      expect(engine.getLastEmittedEvent()).toBeNull();
    });

    it('returns last emitted event', () => {
      const events: GameEvent[] = [createSessionStartEvent(0), createTrialPresentedEvent(0, 100)];

      const engine = new InteractiveReplayEngine(events, ['position'], 'tempo');
      engine.tick(200);

      const last = engine.getLastEmittedEvent();
      expect(last).not.toBeNull();
      expect(last!.type).toBe('TRIAL_PRESENTED');
    });
  });

  // ===========================================================================
  // Flow Mode Tests
  // ===========================================================================

  describe('Flow mode', () => {
    it('auto-plays flow structure events', () => {
      const events: GameEvent[] = [
        createFlowSessionStartEvent(0),
        createFlowStimulusShownEvent(0, 100),
        createFlowSessionEndEvent(5000),
      ];

      const engine = new InteractiveReplayEngine(events, ['position'], 'flow');
      const result = engine.tick(200);

      const types = result.map((e) => e.type);
      expect(types).toContain('FLOW_SESSION_STARTED');
      expect(types).toContain('FLOW_STIMULUS_SHOWN');
    });

    it('skips incorrect flow drops', () => {
      const events: GameEvent[] = [
        createFlowSessionStartEvent(0),
        createFlowStimulusShownEvent(0, 100),
        createFlowDropAttemptedEvent(0, 400, false), // Incorrect drop
      ];

      const engine = new InteractiveReplayEngine(events, ['position'], 'flow');
      const result = engine.tick(500);

      const dropEvent = result.find((e) => e.type === 'FLOW_DROP_ATTEMPTED');
      expect(dropEvent).toBeDefined();
      expect(dropEvent!.skipped).toBe(true);
    });

    it('handleFlowDrop creates correction event', () => {
      const events: GameEvent[] = [
        createFlowSessionStartEvent(0),
        createFlowStimulusShownEvent(0, 100),
      ];

      const engine = new InteractiveReplayEngine(events, ['position'], 'flow');
      engine.tick(200);

      const result = engine.handleFlowDrop('proposal-1', 'position', 5, 0);

      expect(result).not.toBeNull();
      expect(result!.actor).toBe('user');
      expect(result!.type).toBe('FLOW_DROP_ATTEMPTED');
      expect(result!.payload.isCorrection).toBe(true);
    });

    it('handleFlowDrop returns null for wrong session type', () => {
      const events: GameEvent[] = [createSessionStartEvent(0)];
      const engine = new InteractiveReplayEngine(events, ['position'], 'tempo');

      const result = engine.handleFlowDrop('proposal-1', 'position', 5, 0);
      expect(result).toBeNull();
    });
  });

  // ===========================================================================
  // Recall Mode Tests
  // ===========================================================================

  describe('Recall mode', () => {
    it('auto-plays recall structure events', () => {
      const events: GameEvent[] = [
        createRecallSessionStartEvent(0),
        createRecallStimulusShownEvent(0, 100),
        createRecallSessionEndEvent(5000),
      ];

      const engine = new InteractiveReplayEngine(events, ['position'], 'recall');
      const result = engine.tick(200);

      const types = result.map((e) => e.type);
      expect(types).toContain('RECALL_SESSION_STARTED');
      expect(types).toContain('RECALL_STIMULUS_SHOWN');
    });

    it('skips correction recall picks', () => {
      const events: GameEvent[] = [
        createRecallSessionStartEvent(0),
        createRecallStimulusShownEvent(0, 100),
        createRecallPickedEvent(0, 400, true), // isCorrection: true = user had to retry
      ];

      const engine = new InteractiveReplayEngine(events, ['position'], 'recall');
      const result = engine.tick(500);

      const pickEvent = result.find((e) => e.type === 'RECALL_PICKED');
      expect(pickEvent).toBeDefined();
      expect(pickEvent!.skipped).toBe(true);
      expect(pickEvent!.skipReason).toBe('error');
    });

    it('handleRecallPick creates correction event', () => {
      const events: GameEvent[] = [
        createRecallSessionStartEvent(0),
        createRecallStimulusShownEvent(0, 100),
      ];

      const engine = new InteractiveReplayEngine(events, ['position'], 'recall');
      engine.tick(200);

      const result = engine.handleRecallPick(1, 'position', 5);

      expect(result).not.toBeNull();
      expect(result!.actor).toBe('user');
      expect(result!.type).toBe('RECALL_PICKED');
      expect(result!.payload.isCorrection).toBe(true);
    });

    it('handleRecallPick returns null for wrong session type', () => {
      const events: GameEvent[] = [createSessionStartEvent(0)];
      const engine = new InteractiveReplayEngine(events, ['position'], 'tempo');

      const result = engine.handleRecallPick(1, 'position', 5);
      expect(result).toBeNull();
    });
  });

  // ===========================================================================
  // DualPick Mode Tests
  // ===========================================================================

  describe('DualPick mode', () => {
    it('auto-plays dual-pick structure events', () => {
      const events: GameEvent[] = [
        createDualPickSessionStartEvent(0),
        createDualPickStimulusShownEvent(0, 100),
        createDualPickSessionEndEvent(5000),
      ];

      const engine = new InteractiveReplayEngine(events, ['position'], 'dual-pick');
      const result = engine.tick(200);

      const types = result.map((e) => e.type);
      expect(types).toContain('DUAL_PICK_SESSION_STARTED');
      expect(types).toContain('DUAL_PICK_STIMULUS_SHOWN');
    });

    it('skips incorrect dual-pick drops', () => {
      const events: GameEvent[] = [
        createDualPickSessionStartEvent(0),
        createDualPickStimulusShownEvent(0, 100),
        createDualPickDropAttemptedEvent(0, 400, false), // Incorrect
      ];

      const engine = new InteractiveReplayEngine(events, ['position'], 'dual-pick');
      const result = engine.tick(500);

      const dropEvent = result.find((e) => e.type === 'DUAL_PICK_DROP_ATTEMPTED');
      expect(dropEvent).toBeDefined();
      expect(dropEvent!.skipped).toBe(true);
    });

    it('handleDualPickDrop creates correction event', () => {
      const events: GameEvent[] = [
        createDualPickSessionStartEvent(0),
        createDualPickStimulusShownEvent(0, 100),
      ];

      const engine = new InteractiveReplayEngine(events, ['position'], 'dual-pick');
      engine.tick(200);

      const result = engine.handleDualPickDrop('pick-1', 'Match', 0);

      expect(result).not.toBeNull();
      expect(result!.actor).toBe('user');
      expect(result!.type).toBe('DUAL_PICK_DROP_ATTEMPTED');
      expect(result!.payload.isCorrection).toBe(true);
    });

    it('handleDualPickDrop returns null for wrong session type', () => {
      const events: GameEvent[] = [createSessionStartEvent(0)];
      const engine = new InteractiveReplayEngine(events, ['position'], 'tempo');

      const result = engine.handleDualPickDrop('pick-1', 'Match', 0);
      expect(result).toBeNull();
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('edge cases', () => {
    it('handles empty events array', () => {
      const engine = new InteractiveReplayEngine([], ['position'], 'tempo');

      expect(engine.getCurrentTimeMs()).toBe(0);
      expect(engine.isFinished()).toBe(true);
    });

    it('handles events without session start', () => {
      const events: GameEvent[] = [createTrialPresentedEvent(0, 100)];

      const engine = new InteractiveReplayEngine(events, ['position'], 'tempo');
      expect(engine.getCurrentTimeMs()).toBe(0);
    });

    it('handles multiple modalities', () => {
      const events: GameEvent[] = [
        createSessionStartEvent(0),
        createTrialPresentedEvent(0, 100, 'session-1', {
          isPositionTarget: true,
          isSoundTarget: true,
        }),
      ];

      const engine = new InteractiveReplayEngine(events, ['position', 'audio'], 'tempo');
      engine.tick(200);

      // Can respond to both modalities
      const posResult = engine.handleUserResponse('position');
      const audioResult = engine.handleUserResponse('audio');

      expect(posResult).not.toBeNull();
      expect(audioResult).not.toBeNull();

      expect(engine.hasRespondedForModality('position')).toBe(true);
      expect(engine.hasRespondedForModality('audio')).toBe(true);
    });

    it('getTrialState returns undefined for invalid index', () => {
      const events: GameEvent[] = [createSessionStartEvent(0)];
      const engine = new InteractiveReplayEngine(events, ['position'], 'tempo');

      expect(engine.getTrialState(999)).toBeUndefined();
    });

    it('wasParentFalseAlarm returns false for invalid trial', () => {
      const events: GameEvent[] = [createSessionStartEvent(0)];
      const engine = new InteractiveReplayEngine(events, ['position'], 'tempo');

      expect(engine.wasParentFalseAlarm('position')).toBe(false);
    });

    it('hasRespondedForModality returns false for invalid trial', () => {
      const events: GameEvent[] = [createSessionStartEvent(0)];
      const engine = new InteractiveReplayEngine(events, ['position'], 'tempo');

      expect(engine.hasRespondedForModality('position')).toBe(false);
    });
  });
});
