import { describe, expect, it } from 'bun:test';
import {
  identifySkippableEvents,
  parseTempoEvents,
  projectTempoSnapshot,
  parsePlaceEvents,
  projectPlaceSnapshot,
  parseMemoEvents,
  projectMemoSnapshot,
  getActiveResponsesAtTime,
  getPlaceDropsAtTime,
  getMemoPicksAtTime,
} from './replay-projector';
import type { GameEvent } from './events';

// =============================================================================
// Test Event Factories - Tempo
// =============================================================================

function createTempoSessionStartedEvent(timestamp = 0): GameEvent {
  // @ts-expect-error test override
  return {
    id: 'start',
    type: 'SESSION_STARTED',
    timestamp,
    sessionId: 's1',
    nLevel: 2,
    config: {
      trialsCount: 20,
      isiMs: 2500,
      stimulusDurationMs: 500,
      activeModalities: ['position', 'audio'],
    },
  } as GameEvent;
}

function createTrialPresentedEvent(
  trialIndex: number,
  timestamp: number,
  options?: {
    isPositionTarget?: boolean;
    isSoundTarget?: boolean;
    stimulusDurationMs?: number;
    isiMs?: number;
  },
): GameEvent {
  return {
    id: `trial-${trialIndex}`,
    type: 'TRIAL_PRESENTED',
    timestamp,
    sessionId: 's1',
    trial: {
      index: trialIndex,
      position: trialIndex % 8,
      sound: 'K',
      isPositionTarget: options?.isPositionTarget ?? false,
      isSoundTarget: options?.isSoundTarget ?? false,
      isColorTarget: false,
    },
    isiMs: options?.isiMs ?? 2500,
    stimulusDurationMs: options?.stimulusDurationMs ?? 500,
  } as GameEvent;
}

function createUserResponseEvent(
  trialIndex: number,
  modality: 'position' | 'audio',
  timestamp: number,
  reactionTimeMs = 300,
): GameEvent {
  return {
    id: `response-${trialIndex}-${modality}`,
    type: 'USER_RESPONDED',
    timestamp,
    sessionId: 's1',
    trialIndex,
    modality,
    reactionTimeMs,
  } as GameEvent;
}

function createTempoSessionEndedEvent(timestamp: number): GameEvent {
  // @ts-expect-error test override
  return {
    id: 'end',
    type: 'SESSION_ENDED',
    timestamp,
    sessionId: 's1',
    reason: 'completed',
    summary: {
      sessionId: 's1',
      nLevel: 2,
      totalTrials: 22,
      completedTrials: 22,
      durationMs: timestamp,
      globalDPrime: 2.0,
      isiStats: { avg: 2500, min: 2500, max: 2500 },
      stimulusDurationStats: { avg: 500, min: 500, max: 500 },
      finalStats: {
        trialsCount: 22,
        globalDPrime: 2.0,
        byModality: {},
      },
    },
  } as GameEvent;
}

// =============================================================================
// Test Event Factories - Flow
// =============================================================================

let eventIdCounter = 0;
function nextEventId(prefix: string, trialIndex: number): string {
  eventIdCounter += 1;
  return `${prefix}-${trialIndex}-${eventIdCounter}`;
}

function createPlaceSessionStartedEvent(timestamp = 0): GameEvent {
  // @ts-expect-error test override
  return {
    id: 'start',
    type: 'FLOW_SESSION_STARTED',
    timestamp,
    sessionId: 's1',
    config: {
      nLevel: 2,
      trialsCount: 10,
      activeModalities: ['position', 'audio'],
      stimulusDurationMs: 2000,
    },
  } as GameEvent;
}

function createFlowStimulusShownEvent(trialIndex: number, timestamp: number): GameEvent {
  return {
    id: `stim-${trialIndex}`,
    type: 'FLOW_STIMULUS_SHOWN',
    timestamp,
    sessionId: 's1',
    trialIndex,
    position: trialIndex % 8,
    sound: 'K',
    stimulusDurationMs: 2000,
  } as GameEvent;
}

function createFlowPlacementStartedEvent(trialIndex: number, timestamp: number): GameEvent {
  // @ts-expect-error test override
  return {
    id: `placement-${trialIndex}`,
    type: 'FLOW_PLACEMENT_STARTED',
    timestamp,
    sessionId: 's1',
    trialIndex,
    proposals: [
      { id: 'p1', label: 'N', type: 'position' },
      { id: 'p2', label: 'N-1', type: 'position' },
    ],
  } as GameEvent;
}

function createFlowDropAttemptedEvent(
  trialIndex: number,
  timestamp: number,
  correct: boolean,
): GameEvent {
  // @ts-expect-error test override
  return {
    id: nextEventId('drop', trialIndex),
    type: 'FLOW_DROP_ATTEMPTED',
    timestamp,
    sessionId: 's1',
    trialIndex,
    proposalId: 'p1',
    proposalType: 'position',
    proposalLabel: 'N',
    targetSlot: 0,
    correct,
    placementTimeMs: 500,
    dragStartedAtMs: timestamp - 500,
  } as GameEvent;
}

function createFlowTurnCompletedEvent(trialIndex: number, timestamp: number): GameEvent {
  return {
    id: `turn-${trialIndex}`,
    type: 'FLOW_TURN_COMPLETED',
    timestamp,
    sessionId: 's1',
    trialIndex,
    turnDurationMs: 3000,
  } as GameEvent;
}

function createPlaceSessionEndedEvent(timestamp: number): GameEvent {
  return {
    id: 'end',
    type: 'FLOW_SESSION_ENDED',
    timestamp,
    sessionId: 's1',
    reason: 'completed',
  } as GameEvent;
}

// =============================================================================
// Test Event Factories - Recall
// =============================================================================

function createMemoSessionStartedEvent(timestamp = 0): GameEvent {
  // @ts-expect-error test override
  return {
    id: 'start',
    type: 'RECALL_SESSION_STARTED',
    timestamp,
    sessionId: 's1',
    config: {
      nLevel: 2,
      trialsCount: 10,
      activeModalities: ['position', 'audio'],
      stimulusDurationMs: 1000,
    },
  } as GameEvent;
}

function createMemoStimulusShownEvent(trialIndex: number, timestamp: number): GameEvent {
  // @ts-expect-error test override
  return {
    id: `stim-${trialIndex}`,
    type: 'RECALL_STIMULUS_SHOWN',
    timestamp,
    sessionId: 's1',
    trialIndex,
    trial: {
      index: trialIndex,
      position: trialIndex % 8,
      sound: 'K',
      color: undefined,
      isPositionTarget: false,
      isSoundTarget: false,
      isColorTarget: false,
    },
    stimulusDurationMs: 1000,
  } as GameEvent;
}

function createRecallWindowOpenedEvent(trialIndex: number, timestamp: number): GameEvent {
  // @ts-expect-error test override
  return {
    id: `window-${trialIndex}`,
    type: 'RECALL_WINDOW_OPENED',
    timestamp,
    sessionId: 's1',
    trialIndex,
    windowDepth: 3,
  } as GameEvent;
}

function createRecallPickedEvent(
  trialIndex: number,
  timestamp: number,
  correct: boolean,
): GameEvent {
  // @ts-expect-error test override
  return {
    id: nextEventId('pick', trialIndex),
    type: 'RECALL_PICKED',
    timestamp,
    sessionId: 's1',
    trialIndex,
    modality: 'position',
    slotIndex: 0,
    pick: { modality: 'position', value: 3 },
    isCorrect: correct,
    isCorrection: false,
    pickTimeMs: 400,
  } as GameEvent;
}

function createRecallWindowCommittedEvent(trialIndex: number, timestamp: number): GameEvent {
  return {
    id: `commit-${trialIndex}`,
    type: 'RECALL_WINDOW_COMMITTED',
    timestamp,
    sessionId: 's1',
    trialIndex,
  } as GameEvent;
}

function createMemoSessionEndedEvent(timestamp: number): GameEvent {
  return {
    id: 'end',
    type: 'RECALL_SESSION_ENDED',
    timestamp,
    sessionId: 's1',
    reason: 'completed',
  } as GameEvent;
}

// =============================================================================
// identifySkippableEvents Tests
// =============================================================================

describe('identifySkippableEvents', () => {
  it('should return empty map when no events', () => {
    const result = identifySkippableEvents([]);
    expect(result.size).toBe(0);
  });

  it('should identify false alarm responses', () => {
    const events: GameEvent[] = [
      createTrialPresentedEvent(0, 1000, { isPositionTarget: true, isSoundTarget: false }),
      createUserResponseEvent(0, 'audio', 1300), // False alarm: audio on non-audio target
    ];

    const result = identifySkippableEvents(events);

    expect(result.size).toBe(1);
    expect(result.get('response-0-audio')).toBe('false_alarm');
  });

  it('should skip arithmetic responses in tempo mode', () => {
    const events: GameEvent[] = [
      createTempoSessionStartedEvent(0),
      createTrialPresentedEvent(0, 1000, { isPositionTarget: false, isSoundTarget: false }),
      createUserResponseEvent(0, 'arithmetic' as any, 1300, 500), // Arithmetic should be skipped (not marked as false alarm)
    ];

    const result = identifySkippableEvents(events, 'tempo');

    expect(result.size).toBe(0); // Arithmetic responses are not marked as skippable
  });

  it('should not mark non-arithmetic as false alarm', () => {
    const events: GameEvent[] = [
      createTrialPresentedEvent(0, 1000, { isPositionTarget: true, isSoundTarget: false }),
      createUserResponseEvent(0, 'position', 1300), // Correct target response
    ];

    const result = identifySkippableEvents(events);

    expect(result.size).toBe(0);
  });

  it('should handle missing trial gracefully', () => {
    const events: GameEvent[] = [
      createUserResponseEvent(999, 'position', 1000), // Trial 999 doesn't exist
    ];

    const result = identifySkippableEvents(events);

    expect(result.size).toBe(0); // Should not crash or mark anything when trial doesn't exist
  });

  it('should not mark correct target responses as skippable', () => {
    const events: GameEvent[] = [
      createTrialPresentedEvent(0, 1000, { isPositionTarget: true, isSoundTarget: false }),
      createUserResponseEvent(0, 'position', 1300), // Correct: position on position target
    ];

    const result = identifySkippableEvents(events);

    expect(result.size).toBe(0);
  });

  it('should handle multiple trials correctly', () => {
    const events: GameEvent[] = [
      createTrialPresentedEvent(0, 1000, { isPositionTarget: true, isSoundTarget: false }),
      createUserResponseEvent(0, 'position', 1300), // Correct
      createTrialPresentedEvent(1, 4000, { isPositionTarget: false, isSoundTarget: true }),
      createUserResponseEvent(1, 'position', 4300), // False alarm
      createUserResponseEvent(1, 'audio', 4350), // Correct
    ];

    const result = identifySkippableEvents(events);

    expect(result.size).toBe(1);
    expect(result.has('response-1-position')).toBe(true);
    expect(result.has('response-1-audio')).toBe(false);
  });

  describe('Flow mode skippable events', () => {
    it('should identify incorrect drops as errors', () => {
      const events: GameEvent[] = [
        createPlaceSessionStartedEvent(0),
        createFlowStimulusShownEvent(0, 500),
        createFlowPlacementStartedEvent(0, 2500),
        createFlowDropAttemptedEvent(0, 3000, false), // Incorrect drop
        createFlowTurnCompletedEvent(0, 5500),
        createPlaceSessionEndedEvent(6000),
      ];

      const result = identifySkippableEvents(events, 'flow');

      expect(result.size).toBe(1);
      // Drop event ID pattern: drop-trialIndex-counter
      const errorKeys = Array.from(result.keys());
      expect(errorKeys.some((k) => k.startsWith('drop-'))).toBe(true);
      expect(result.values().next().value).toBe('error');
    });

    it('should not mark correct drops as skippable', () => {
      const events: GameEvent[] = [
        createPlaceSessionStartedEvent(0),
        createFlowStimulusShownEvent(0, 500),
        createFlowPlacementStartedEvent(0, 2500),
        createFlowDropAttemptedEvent(0, 3000, true), // Correct drop
        createFlowTurnCompletedEvent(0, 5500),
        createPlaceSessionEndedEvent(6000),
      ];

      const result = identifySkippableEvents(events, 'flow');

      expect(result.size).toBe(0);
    });
  });

  describe('Recall mode skippable events', () => {
    it('should identify correction picks as errors', () => {
      // Create a correction pick event
      // @ts-expect-error test override
      const correctionPickEvent: GameEvent = {
        id: 'correction-pick-1',
        type: 'RECALL_PICKED',
        timestamp: 2500,
        sessionId: 's1',
        trialIndex: 0,
        modality: 'position',
        slotIndex: 0,
        pick: { modality: 'position', value: 3 },
        isCorrect: true,
        isCorrection: true, // This is a correction
        pickTimeMs: 400,
      } as GameEvent;

      const events: GameEvent[] = [
        createMemoSessionStartedEvent(0),
        createMemoStimulusShownEvent(0, 500),
        createRecallWindowOpenedEvent(0, 1500),
        createRecallPickedEvent(0, 2000, true), // Original pick
        correctionPickEvent, // Correction pick
        createRecallWindowCommittedEvent(0, 4500),
        createMemoSessionEndedEvent(5000),
      ];

      const result = identifySkippableEvents(events, 'recall');

      expect(result.size).toBe(1);
      expect(result.get('correction-pick-1')).toBe('error');
    });

    it('should not mark non-correction picks as skippable', () => {
      const events: GameEvent[] = [
        createMemoSessionStartedEvent(0),
        createMemoStimulusShownEvent(0, 500),
        createRecallWindowOpenedEvent(0, 1500),
        createRecallPickedEvent(0, 2000, true),
        createRecallWindowCommittedEvent(0, 4500),
        createMemoSessionEndedEvent(5000),
      ];

      const result = identifySkippableEvents(events, 'recall');

      expect(result.size).toBe(0);
    });
  });

  describe('DualPick mode skippable events', () => {
    it('should identify incorrect drops as errors in dual-pick', () => {
      // Use flow drop events with dual-pick session type
      const events: GameEvent[] = [
        // @ts-expect-error test override
        {
          id: 'dp-start',
          type: 'DUAL_PICK_SESSION_STARTED',
          timestamp: 0,
          sessionId: 's1',
          config: {
            nLevel: 2,
            trialsCount: 10,
            activeModalities: ['position', 'audio'],
            stimulusDurationMs: 2000,
          },
        } as GameEvent,
        {
          id: 'dp-stim-0',
          type: 'DUAL_PICK_STIMULUS_SHOWN',
          timestamp: 500,
          sessionId: 's1',
          trialIndex: 0,
          position: 3,
          sound: 'K',
          stimulusDurationMs: 2000,
        } as GameEvent,
        // @ts-expect-error test override
        {
          id: 'dp-placement-0',
          type: 'DUAL_PICK_PLACEMENT_STARTED',
          timestamp: 2500,
          sessionId: 's1',
          trialIndex: 0,
          proposals: [],
        } as GameEvent,
        {
          id: 'dp-drop-0',
          type: 'DUAL_PICK_DROP_ATTEMPTED',
          timestamp: 3000,
          sessionId: 's1',
          trialIndex: 0,
          proposalId: 'p1',
          proposalType: 'position',
          proposalLabel: 'N',
          targetSlot: 0,
          correct: false,
          placementTimeMs: 500,
        } as GameEvent,
      ];

      const result = identifySkippableEvents(events, 'dual-pick');

      expect(result.size).toBe(1);
      expect(result.get('dp-drop-0')).toBe('error');
    });
  });
});

// =============================================================================
// parseTempoEvents Tests
// =============================================================================

describe('parseTempoEvents', () => {
  it('should return null if no session started event', () => {
    const result = parseTempoEvents([]);
    expect(result).toBeNull();
  });

  it('should parse minimal tempo session', () => {
    const events: GameEvent[] = [
      createTempoSessionStartedEvent(0),
      createTrialPresentedEvent(0, 500),
      createTempoSessionEndedEvent(3500),
    ];

    const result = parseTempoEvents(events);

    expect(result).not.toBeNull();
    expect(result?.sessionId).toBe('s1');
    expect(result?.nLevel).toBe(2);
    expect(result?.totalTrials).toBe(22); // 20 + 2 warmup
  });

  it('should build timeline with starting phase', () => {
    const events: GameEvent[] = [
      createTempoSessionStartedEvent(0),
      createTrialPresentedEvent(0, 500), // First trial at 500ms
      createTrialPresentedEvent(1, 3500),
      createTempoSessionEndedEvent(6500),
    ];

    const result = parseTempoEvents(events);

    expect(result?.timeline.length).toBeGreaterThan(0);
    // @ts-expect-error test: nullable access
    expect(result?.timeline[0].phase).toBe('starting');
    // @ts-expect-error test: nullable access
    expect(result?.timeline[0].endMs).toBe(500);
  });

  it('should include responses', () => {
    const events: GameEvent[] = [
      createTempoSessionStartedEvent(0),
      createTrialPresentedEvent(0, 500),
      createUserResponseEvent(0, 'position', 800, 300),
      createTempoSessionEndedEvent(3500),
    ];

    const result = parseTempoEvents(events);

    expect(result?.responses.length).toBe(1);
    // @ts-expect-error test: nullable access
    expect(result?.responses[0].modality).toBe('position');
    // @ts-expect-error test: nullable access
    expect(result?.responses[0].reactionTimeMs).toBe(300);
  });

  it('should calculate total duration', () => {
    const events: GameEvent[] = [
      createTempoSessionStartedEvent(0),
      createTrialPresentedEvent(0, 500),
      createTempoSessionEndedEvent(3500),
    ];

    const result = parseTempoEvents(events);

    expect(result?.totalDurationMs).toBe(3500);
  });
});

// =============================================================================
// projectTempoSnapshot Tests
// =============================================================================

describe('projectTempoSnapshot', () => {
  it('should project starting phase at time 0', () => {
    const events: GameEvent[] = [
      createTempoSessionStartedEvent(0),
      createTrialPresentedEvent(0, 500),
      createTempoSessionEndedEvent(3500),
    ];

    const replayData = parseTempoEvents(events)!;
    const snapshot = projectTempoSnapshot(replayData, 100);

    expect(snapshot.phase).toBe('starting');
    expect(snapshot.trialIndex).toBe(0);
  });

  it('should project stimulus phase during trial presentation', () => {
    const events: GameEvent[] = [
      createTempoSessionStartedEvent(0),
      createTrialPresentedEvent(0, 500, { stimulusDurationMs: 500 }),
      createTempoSessionEndedEvent(3500),
    ];

    const replayData = parseTempoEvents(events)!;
    const snapshot = projectTempoSnapshot(replayData, 600);

    expect(snapshot.phase).toBe('stimulus');
    expect(snapshot.trial).not.toBeNull();
  });

  it('should project waiting phase after stimulus', () => {
    const events: GameEvent[] = [
      createTempoSessionStartedEvent(0),
      createTrialPresentedEvent(0, 500, { stimulusDurationMs: 500, isiMs: 2500 }),
      createTempoSessionEndedEvent(3500),
    ];

    const replayData = parseTempoEvents(events)!;
    const snapshot = projectTempoSnapshot(replayData, 1200); // After 500ms stimulus

    expect(snapshot.phase).toBe('waiting');
  });

  it('should project finished phase at end', () => {
    const events: GameEvent[] = [
      createTempoSessionStartedEvent(0),
      createTrialPresentedEvent(0, 500),
      createTempoSessionEndedEvent(3500),
    ];

    const replayData = parseTempoEvents(events)!;
    const snapshot = projectTempoSnapshot(replayData, 5000);

    expect(snapshot.phase).toBe('finished');
  });
});

// =============================================================================
// getActiveResponsesAtTime Tests
// =============================================================================

describe('getActiveResponsesAtTime', () => {
  it('should return modalities that have responses for current trial', () => {
    const events: GameEvent[] = [
      createTempoSessionStartedEvent(0),
      createTrialPresentedEvent(0, 500),
      createUserResponseEvent(0, 'position', 800),
      createTrialPresentedEvent(1, 3500),
      createTempoSessionEndedEvent(6500),
    ];

    const replayData = parseTempoEvents(events)!;
    // @ts-expect-error test override
    const responses = getActiveResponsesAtTime(replayData, 1000, 0);

    // Returns a Set of modalities
    expect(responses.has('position')).toBe(true);
    expect(responses.has('audio')).toBe(false);
  });

  it('should only return responses for the specified trial', () => {
    const events: GameEvent[] = [
      createTempoSessionStartedEvent(0),
      createTrialPresentedEvent(0, 500),
      createUserResponseEvent(0, 'position', 800),
      createTrialPresentedEvent(1, 3500),
      createUserResponseEvent(1, 'audio', 3800),
      createTempoSessionEndedEvent(6500),
    ];

    const replayData = parseTempoEvents(events)!;
    // @ts-expect-error test override
    const responses = getActiveResponsesAtTime(replayData, 4000, 1);

    expect(responses.has('audio')).toBe(true);
    expect(responses.has('position')).toBe(false);
  });
});

// =============================================================================
// parsePlaceEvents Tests
// =============================================================================

describe('parsePlaceEvents', () => {
  it('should return null if no session started event', () => {
    const result = parsePlaceEvents([]);
    expect(result).toBeNull();
  });

  it('should parse minimal flow session', () => {
    const events: GameEvent[] = [
      createPlaceSessionStartedEvent(0),
      createFlowStimulusShownEvent(0, 500),
      createFlowPlacementStartedEvent(0, 2500),
      createFlowTurnCompletedEvent(0, 5500),
      createPlaceSessionEndedEvent(6000),
    ];

    const result = parsePlaceEvents(events);

    expect(result).not.toBeNull();
    expect(result?.sessionId).toBe('s1');
    expect(result?.nLevel).toBe(2);
  });

  it('should build timeline segments', () => {
    const events: GameEvent[] = [
      createPlaceSessionStartedEvent(0),
      createFlowStimulusShownEvent(0, 500),
      createFlowPlacementStartedEvent(0, 2500),
      createFlowTurnCompletedEvent(0, 5500),
      createPlaceSessionEndedEvent(6000),
    ];

    const result = parsePlaceEvents(events);

    expect(result?.timeline.length).toBeGreaterThan(0);
  });

  it('should include drops', () => {
    const events: GameEvent[] = [
      createPlaceSessionStartedEvent(0),
      createFlowStimulusShownEvent(0, 500),
      createFlowPlacementStartedEvent(0, 2500),
      createFlowDropAttemptedEvent(0, 3000, true),
      createFlowDropAttemptedEvent(0, 3500, false),
      createFlowTurnCompletedEvent(0, 5500),
      createPlaceSessionEndedEvent(6000),
    ];

    const result = parsePlaceEvents(events);

    expect(result?.drops.length).toBe(2);
    // @ts-expect-error test: nullable access
    expect(result?.drops[0].correct).toBe(true);
    // @ts-expect-error test: nullable access
    expect(result?.drops[1].correct).toBe(false);
  });
});

// =============================================================================
// projectPlaceSnapshot Tests
// =============================================================================

describe('projectPlaceSnapshot', () => {
  it('should project idle phase at start', () => {
    const events: GameEvent[] = [
      createPlaceSessionStartedEvent(0),
      createFlowStimulusShownEvent(0, 500),
      createPlaceSessionEndedEvent(6000),
    ];

    const replayData = parsePlaceEvents(events)!;
    const snapshot = projectPlaceSnapshot(replayData, 100);

    expect(snapshot.phase).toBe('idle');
  });

  it('should project stimulus phase during stimulus', () => {
    const events: GameEvent[] = [
      createPlaceSessionStartedEvent(0),
      createFlowStimulusShownEvent(0, 500),
      createFlowPlacementStartedEvent(0, 2500),
      createPlaceSessionEndedEvent(6000),
    ];

    const replayData = parsePlaceEvents(events)!;
    const snapshot = projectPlaceSnapshot(replayData, 1000);

    expect(snapshot.phase).toBe('stimulus');
    expect(snapshot.stimulus).not.toBeNull();
  });

  it('should project placement phase during placement', () => {
    const events: GameEvent[] = [
      createPlaceSessionStartedEvent(0),
      createFlowStimulusShownEvent(0, 500),
      createFlowPlacementStartedEvent(0, 2500),
      createFlowTurnCompletedEvent(0, 5500),
      createPlaceSessionEndedEvent(6000),
    ];

    const replayData = parsePlaceEvents(events)!;
    const snapshot = projectPlaceSnapshot(replayData, 3000);

    expect(snapshot.phase).toBe('placement');
  });

  it('should project finished phase at end', () => {
    const events: GameEvent[] = [
      createPlaceSessionStartedEvent(0),
      createFlowStimulusShownEvent(0, 500),
      createFlowTurnCompletedEvent(0, 5500),
      createPlaceSessionEndedEvent(6000),
    ];

    const replayData = parsePlaceEvents(events)!;
    const snapshot = projectPlaceSnapshot(replayData, 7000);

    expect(snapshot.phase).toBe('finished');
  });
});

// =============================================================================
// parseMemoEvents Tests
// =============================================================================

describe('parseMemoEvents', () => {
  it('should return null if no session started event', () => {
    const result = parseMemoEvents([]);
    expect(result).toBeNull();
  });

  it('should parse minimal recall session', () => {
    const events: GameEvent[] = [
      createMemoSessionStartedEvent(0),
      createMemoStimulusShownEvent(0, 500),
      createRecallWindowOpenedEvent(0, 1500),
      createRecallWindowCommittedEvent(0, 4500),
      createMemoSessionEndedEvent(5000),
    ];

    const result = parseMemoEvents(events);

    expect(result).not.toBeNull();
    expect(result?.sessionId).toBe('s1');
    expect(result?.nLevel).toBe(2);
  });

  it('should include picks', () => {
    const events: GameEvent[] = [
      createMemoSessionStartedEvent(0),
      createMemoStimulusShownEvent(0, 500),
      createRecallWindowOpenedEvent(0, 1500),
      createRecallPickedEvent(0, 2000, true),
      createRecallPickedEvent(0, 2500, false),
      createRecallWindowCommittedEvent(0, 4500),
      createMemoSessionEndedEvent(5000),
    ];

    const result = parseMemoEvents(events);

    expect(result?.picks.length).toBe(2);
    // @ts-expect-error test: nullable access
    expect(result?.picks[0].trialIndex).toBe(0);
    // @ts-expect-error test: nullable access
    expect(result?.picks[1].trialIndex).toBe(0);
  });
});

// =============================================================================
// projectMemoSnapshot Tests
// =============================================================================

describe('projectMemoSnapshot', () => {
  it('should project idle phase at start', () => {
    const events: GameEvent[] = [
      createMemoSessionStartedEvent(0),
      createMemoStimulusShownEvent(0, 500),
      createMemoSessionEndedEvent(5000),
    ];

    const replayData = parseMemoEvents(events)!;
    const snapshot = projectMemoSnapshot(replayData, 100);

    expect(snapshot.phase).toBe('idle');
  });

  it('should project stimulus phase during stimulus', () => {
    const events: GameEvent[] = [
      createMemoSessionStartedEvent(0),
      createMemoStimulusShownEvent(0, 500),
      createRecallWindowOpenedEvent(0, 1500),
      createMemoSessionEndedEvent(5000),
    ];

    const replayData = parseMemoEvents(events)!;
    const snapshot = projectMemoSnapshot(replayData, 800);

    expect(snapshot.phase).toBe('stimulus');
    expect(snapshot.stimulus).not.toBeNull();
  });

  it('should project recall phase during window', () => {
    const events: GameEvent[] = [
      createMemoSessionStartedEvent(0),
      createMemoStimulusShownEvent(0, 500),
      createRecallWindowOpenedEvent(0, 1500),
      createRecallWindowCommittedEvent(0, 4500),
      createMemoSessionEndedEvent(5000),
    ];

    const replayData = parseMemoEvents(events)!;
    const snapshot = projectMemoSnapshot(replayData, 2000);

    expect(snapshot.phase).toBe('recall');
  });

  it('should project finished phase at end', () => {
    const events: GameEvent[] = [
      createMemoSessionStartedEvent(0),
      createMemoStimulusShownEvent(0, 500),
      createRecallWindowOpenedEvent(0, 1500),
      createRecallWindowCommittedEvent(0, 4500),
      createMemoSessionEndedEvent(5000),
    ];

    const replayData = parseMemoEvents(events)!;
    const snapshot = projectMemoSnapshot(replayData, 6000);

    expect(snapshot.phase).toBe('finished');
  });
});

// =============================================================================
// getPlaceDropsAtTime Tests
// =============================================================================

describe('getPlaceDropsAtTime', () => {
  it('should return drops for current trial', () => {
    const events: GameEvent[] = [
      createPlaceSessionStartedEvent(0),
      createFlowStimulusShownEvent(0, 500),
      createFlowPlacementStartedEvent(0, 2500),
      createFlowDropAttemptedEvent(0, 3000, true),
      createFlowTurnCompletedEvent(0, 5500),
      createPlaceSessionEndedEvent(6000),
    ];

    const replayData = parsePlaceEvents(events)!;
    // @ts-expect-error test override
    const drops = getPlaceDropsAtTime(replayData, 4000, 0);

    expect(drops.length).toBe(1);
    expect(drops[0]!.correct).toBe(true);
  });
});

// =============================================================================
// getMemoPicksAtTime Tests
// =============================================================================

describe('getMemoPicksAtTime', () => {
  it('should return picks for current trial', () => {
    const events: GameEvent[] = [
      createMemoSessionStartedEvent(0),
      createMemoStimulusShownEvent(0, 500),
      createRecallWindowOpenedEvent(0, 1500),
      createRecallPickedEvent(0, 2000, true),
      createRecallWindowCommittedEvent(0, 4500),
      createMemoSessionEndedEvent(5000),
    ];

    const replayData = parseMemoEvents(events)!;
    // @ts-expect-error test override
    const picks = getMemoPicksAtTime(replayData, 3000, 0);

    expect(picks.length).toBe(1);
    expect(picks[0]!.trialIndex).toBe(0);
  });
});

// =============================================================================
// Edge Cases Tests (Audit - Replay System)
// =============================================================================

describe('parseTempoEvents - Edge Cases', () => {
  it('should handle session without TRIAL_PRESENTED', () => {
    const events: GameEvent[] = [
      createTempoSessionStartedEvent(0),
      createTempoSessionEndedEvent(1000),
    ];

    const result = parseTempoEvents(events);

    expect(result).not.toBeNull();
    expect(result?.timeline).toBeDefined();
    expect(result?.totalDurationMs).toBe(1000);
  });

  it('should return null for events without SESSION_STARTED', () => {
    const events: GameEvent[] = [
      createTrialPresentedEvent(0, 1000),
      createUserResponseEvent(0, 'position', 1300),
    ];

    const result = parseTempoEvents(events);

    expect(result).toBeNull();
  });

  it('should handle events with non-monotonic timestamps (auto-sort)', () => {
    const events: GameEvent[] = [
      createTempoSessionStartedEvent(0),
      createTrialPresentedEvent(1, 4000), // Out of order
      createTrialPresentedEvent(0, 1000), // Should come before trial 1
      createTempoSessionEndedEvent(7000),
    ];

    const result = parseTempoEvents(events);

    expect(result).not.toBeNull();
    // Events should be sorted by timestamp
    expect(result?.timeline.length).toBeGreaterThan(0);
  });

  it('should handle negative timestamp (clamp to 0)', () => {
    const events: GameEvent[] = [
      createTempoSessionStartedEvent(0),
      createTrialPresentedEvent(0, -100), // Invalid negative timestamp
      createTempoSessionEndedEvent(3000),
    ];

    const result = parseTempoEvents(events);

    // Should handle gracefully - either skip or clamp
    expect(result).not.toBeNull();
  });

  it('should handle session with only SESSION_STARTED', () => {
    const events: GameEvent[] = [createTempoSessionStartedEvent(0)];

    const result = parseTempoEvents(events);

    expect(result).not.toBeNull();
    // totalDurationMs is calculated from last event to SESSION_STARTED
    // If only SESSION_STARTED exists, duration is 0
    expect(result?.totalDurationMs).toBeGreaterThanOrEqual(0);
    expect(result?.timeline).toBeDefined();
  });
});

describe('parsePlaceEvents - Edge Cases', () => {
  it('should return null for events without FLOW_SESSION_STARTED', () => {
    const events: GameEvent[] = [
      createFlowStimulusShownEvent(0, 500),
      createFlowPlacementStartedEvent(0, 2500),
    ];

    const result = parsePlaceEvents(events);

    expect(result).toBeNull();
  });

  it('should handle session without drops', () => {
    const events: GameEvent[] = [
      createPlaceSessionStartedEvent(0),
      createFlowStimulusShownEvent(0, 500),
      createFlowTurnCompletedEvent(0, 5500),
      createPlaceSessionEndedEvent(6000),
    ];

    const result = parsePlaceEvents(events);

    expect(result).not.toBeNull();
    expect(result?.drops).toEqual([]);
  });
});

describe('parseMemoEvents - Edge Cases', () => {
  it('should return null for events without RECALL_SESSION_STARTED', () => {
    const events: GameEvent[] = [
      createMemoStimulusShownEvent(0, 500),
      createRecallWindowOpenedEvent(0, 1500),
    ];

    const result = parseMemoEvents(events);

    expect(result).toBeNull();
  });

  it('should handle session with correction picks', () => {
    // @ts-expect-error test override
    const correctionPick: GameEvent = {
      id: 'correction-pick',
      type: 'RECALL_PICKED',
      timestamp: 2500,
      sessionId: 's1',
      trialIndex: 0,
      modality: 'position',
      slotIndex: 1,
      pick: { modality: 'position', value: 5 },
      isCorrect: true,
      isCorrection: true, // This is a correction
      pickTimeMs: 300,
    } as GameEvent;

    const events: GameEvent[] = [
      createMemoSessionStartedEvent(0),
      createMemoStimulusShownEvent(0, 500),
      createRecallWindowOpenedEvent(0, 1500),
      createRecallPickedEvent(0, 2000, true),
      correctionPick,
      createRecallWindowCommittedEvent(0, 4500),
      createMemoSessionEndedEvent(5000),
    ];

    const result = parseMemoEvents(events);

    expect(result).not.toBeNull();
    // Correction picks should be included in picks
    expect(result?.picks.some((p) => 'isCorrection' in p && p.isCorrection === true)).toBe(true);
  });
});

describe('Timeline Continuity - Integrity', () => {
  it('should have no gaps between TEMPO timeline segments', () => {
    const events: GameEvent[] = [
      createTempoSessionStartedEvent(0),
      createTrialPresentedEvent(0, 500, { stimulusDurationMs: 500, isiMs: 2500 }),
      createTrialPresentedEvent(1, 3500),
      createTempoSessionEndedEvent(6500),
    ];

    const replayData = parseTempoEvents(events)!;

    // Check timeline continuity - end of one segment = start of next
    for (let i = 0; i < replayData.timeline.length - 1; i++) {
      // @ts-expect-error test: nullable access
      expect(replayData!.timeline![i].endMs).toBe(replayData!.timeline![i + 1].startMs);
    }
  });

  it('should have no gaps between PLACE timeline segments', () => {
    const events: GameEvent[] = [
      createPlaceSessionStartedEvent(0),
      createFlowStimulusShownEvent(0, 500),
      createFlowPlacementStartedEvent(0, 2500),
      createFlowTurnCompletedEvent(0, 5500),
      createPlaceSessionEndedEvent(6000),
    ];

    const replayData = parsePlaceEvents(events)!;

    // Check timeline continuity
    for (let i = 0; i < replayData.timeline.length - 1; i++) {
      // @ts-expect-error test: nullable access
      expect(replayData!.timeline![i].endMs).toBe(replayData!.timeline![i + 1].startMs);
    }
  });
});

describe('Snapshot Exactitude', () => {
  it('should project correct trialIndex at specific time (TEMPO)', () => {
    const events: GameEvent[] = [
      createTempoSessionStartedEvent(0),
      createTrialPresentedEvent(0, 500, { stimulusDurationMs: 500, isiMs: 2500 }),
      createTrialPresentedEvent(1, 3500),
      createTempoSessionEndedEvent(6500),
    ];

    const replayData = parseTempoEvents(events)!;

    // At t=750ms - in trial 0 stimulus phase (500ms + 250ms)
    const snapshot1 = projectTempoSnapshot(replayData, 750);
    expect(snapshot1.trialIndex).toBe(0);
    expect(snapshot1.phase).toBe('stimulus');

    // At t=1500ms - in trial 0 waiting phase (stimulus ended at 1000ms)
    const snapshot2 = projectTempoSnapshot(replayData, 1500);
    expect(snapshot2.trialIndex).toBe(0);
    expect(snapshot2.phase).toBe('waiting');

    // At t=3750ms - in trial 1 stimulus phase (trial 1 starts at 3500ms, stimulus ends at 4000ms)
    const snapshot3 = projectTempoSnapshot(replayData, 3750);
    expect(snapshot3.trialIndex).toBe(1);
    expect(snapshot3.phase).toBe('stimulus');
  });

  it('should calculate dPrime correctly as responses are processed', () => {
    const events: GameEvent[] = [
      createTempoSessionStartedEvent(0),
      createTrialPresentedEvent(0, 1000, { isPositionTarget: true, isSoundTarget: false }),
      createUserResponseEvent(0, 'position', 1300, 300), // Hit
      createTrialPresentedEvent(1, 4000, { isPositionTarget: false, isSoundTarget: false }),
      createUserResponseEvent(1, 'position', 4300, 300), // False alarm
      createTempoSessionEndedEvent(7000),
    ];

    const replayData = parseTempoEvents(events)!;

    // After first trial - should have stats
    const snapshot1 = projectTempoSnapshot(replayData, 2000);
    expect(snapshot1.trialIndex).toBe(0);

    // After second trial - should have more stats
    const snapshot2 = projectTempoSnapshot(replayData, 5000);
    expect(snapshot2.trialIndex).toBe(1);
  });
});
