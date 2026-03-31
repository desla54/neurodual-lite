import { describe, expect, it } from 'bun:test';
import {
  projectImportedSessionToSummaryInput,
  projectTraceSessionToSummaryInput,
  projectTempoSessionToSummaryInput,
  projectRecallSessionToSummaryInput,
  projectFlowSessionToSummaryInput,
  projectDualPickSessionToSummaryInput,
  projectTimeSessionToSummaryInput,
  projectTrackSessionToSummaryInput,
  projectCorsiSessionToSummaryInput,
  projectOspanSessionToSummaryInput,
  projectRunningSpanSessionToSummaryInput,
  projectPasatSessionToSummaryInput,
  projectSwmSessionToSummaryInput,
} from './session-summary-input-projectors';
import type { SessionImportedEvent, GameEvent } from './events';
import { createMockEvent } from '../test-utils/test-factories';

// =============================================================================
// Helpers
// =============================================================================

const userId = 'user-test-123';
const sessionId = 'session-test-456';
const baseTimestamp = 1710000000000; // 2024-03-09T...

function makeImportedEvent(overrides: Partial<SessionImportedEvent> = {}): SessionImportedEvent {
  return {
    id: 'evt-1',
    timestamp: baseTimestamp,
    sessionId,
    schemaVersion: 1,
    type: 'SESSION_IMPORTED',
    nLevel: 2,
    dPrime: 2.0,
    passed: true,
    trialsCount: 20,
    durationMs: 60000,
    generator: 'BrainWorkshop',
    activeModalities: ['position', 'audio'],
    byModality: {
      position: {
        hits: 8,
        misses: 2,
        falseAlarms: 1,
        correctRejections: 9,
        avgRT: 450,
        dPrime: 2.1,
      },
      audio: { hits: 7, misses: 3, falseAlarms: 2, correctRejections: 8, avgRT: 500, dPrime: 1.5 },
    },
    originalCreatedAt: '2024-03-08T10:00:00Z',
    playContext: 'free',
    ...overrides,
  } as unknown as SessionImportedEvent;
}

function makeTraceStartEvent(overrides: Record<string, unknown> = {}): GameEvent {
  return createMockEvent('TRACE_SESSION_STARTED', {
    sessionId,
    timestamp: baseTimestamp,
    userId,
    config: {
      nLevel: 3,
      trialsCount: 10,
      rhythmMode: 'self-paced',
      stimulusDurationMs: 500,
      responseWindowMs: 0,
    },
    device: {
      platform: 'web',
      screenWidth: 1920,
      screenHeight: 1080,
      userAgent: 'test-agent',
      touchCapable: false,
    },
    context: { timeOfDay: 'morning', localHour: 10, dayOfWeek: 1, timezone: 'UTC' },
    playContext: 'free',
    ...overrides,
  } as any);
}

function makeTraceResponse(
  trialIndex: number,
  isCorrect: boolean,
  isWarmup = false,
  timestampOffset = 0,
): GameEvent {
  return createMockEvent('TRACE_RESPONDED', {
    sessionId,
    timestamp: baseTimestamp + 1000 + timestampOffset,
    trialIndex,
    responseType: 'swipe',
    position: isCorrect ? 3 : 5,
    expectedPosition: 3,
    isCorrect,
    isWarmup,
    responseTimeMs: 300,
  } as any);
}

function makeTraceEndEvent(overrides: Record<string, unknown> = {}): GameEvent {
  return createMockEvent('TRACE_SESSION_ENDED', {
    sessionId,
    timestamp: baseTimestamp + 60000,
    reason: 'completed',
    totalTrials: 10,
    trialsCompleted: 10,
    score: 80,
    durationMs: 60000,
    playContext: 'free',
    ...overrides,
  } as any);
}

// =============================================================================
// projectImportedSessionToSummaryInput
// =============================================================================

describe('projectImportedSessionToSummaryInput', () => {
  describe('happy path', () => {
    it('projects a complete imported session', () => {
      const event = makeImportedEvent();
      const result = projectImportedSessionToSummaryInput(event, userId);

      expect(result.sessionId).toBe(sessionId);
      expect(result.userId).toBe(userId);
      expect(result.nLevel).toBe(2);
      expect(result.durationMs).toBe(60000);
      expect(result.trialsCount).toBe(20);
      expect(result.globalDPrime).toBe(2.0);
      expect(result.passed).toBe(true);
      expect(result.reason).toBe('completed');
      expect(result.playContext).toBe('free');
    });

    it('computes totals from byModality', () => {
      const event = makeImportedEvent();
      const result = projectImportedSessionToSummaryInput(event, userId);

      // position: 8+7=15 hits, 2+3=5 misses, 1+2=3 fa, 9+8=17 cr
      expect(result.totalHits).toBe(15);
      expect(result.totalMisses).toBe(5);
      expect(result.totalFa).toBe(3);
      expect(result.totalCr).toBe(17);
    });

    it('computes accuracy from totals', () => {
      const event = makeImportedEvent();
      const result = projectImportedSessionToSummaryInput(event, userId);

      // accuracy = (hits + cr) / (hits + misses + fa + cr) = (15 + 17) / (15 + 5 + 3 + 17) = 32/40 = 0.8
      expect(result.accuracy).toBeCloseTo(0.8, 5);
    });

    it('preserves timing metrics from event', () => {
      const event = makeImportedEvent({
        avgResponseTimeMs: 450,
        medianResponseTimeMs: 430,
        responseTimeStdDev: 50,
        avgPressDurationMs: 120,
        pressDurationStdDev: 20,
        responsesDuringStimulus: 15,
        responsesAfterStimulus: 5,
      });
      const result = projectImportedSessionToSummaryInput(event, userId);

      expect(result.avgResponseTimeMs).toBe(450);
      expect(result.medianResponseTimeMs).toBe(430);
      expect(result.responseTimeStdDev).toBe(50);
      expect(result.avgPressDurationMs).toBe(120);
      expect(result.pressDurationStdDev).toBe(20);
      expect(result.responsesDuringStimulus).toBe(15);
      expect(result.responsesAfterStimulus).toBe(5);
    });

    it('preserves focus metrics from event', () => {
      const event = makeImportedEvent({
        focusLostCount: 3,
        focusLostTotalMs: 5000,
      });
      const result = projectImportedSessionToSummaryInput(event, userId);

      expect(result.focusLostCount).toBe(3);
      expect(result.focusLostTotalMs).toBe(5000);
    });

    it('preserves flow confidence metrics', () => {
      const event = makeImportedEvent({
        flowConfidenceScore: 0.85,
        flowDirectnessRatio: 0.9,
        flowWrongSlotDwellMs: 200,
      });
      const result = projectImportedSessionToSummaryInput(event, userId);

      expect(result.flowConfidenceScore).toBe(0.85);
      expect(result.flowDirectnessRatio).toBe(0.9);
      expect(result.flowWrongSlotDwellMs).toBe(200);
    });

    it('preserves recall confidence metrics', () => {
      const event = makeImportedEvent({
        recallConfidenceScore: 0.75,
        recallFluencyScore: 0.8,
        recallCorrectionsCount: 2,
      });
      const result = projectImportedSessionToSummaryInput(event, userId);

      expect(result.recallConfidenceScore).toBe(0.75);
      expect(result.recallFluencyScore).toBe(0.8);
      expect(result.recallCorrectionsCount).toBe(2);
    });
  });

  describe('session type derivation', () => {
    it('derives "tempo" for dual-catch game mode', () => {
      const event = makeImportedEvent({ gameMode: 'dual-catch' });
      const result = projectImportedSessionToSummaryInput(event, userId);
      expect(result.sessionType).toBe('tempo');
    });

    it('derives "tempo" for dualnback-classic game mode', () => {
      const event = makeImportedEvent({ gameMode: 'dualnback-classic' });
      const result = projectImportedSessionToSummaryInput(event, userId);
      expect(result.sessionType).toBe('tempo');
    });

    it('derives "tempo" for sim-brainworkshop game mode', () => {
      const event = makeImportedEvent({ gameMode: 'sim-brainworkshop' });
      const result = projectImportedSessionToSummaryInput(event, userId);
      expect(result.sessionType).toBe('tempo');
    });

    it('derives "recall" for dual-memo game mode', () => {
      const event = makeImportedEvent({ gameMode: 'dual-memo' });
      const result = projectImportedSessionToSummaryInput(event, userId);
      expect(result.sessionType).toBe('recall');
    });

    it('derives "flow" for dual-place game mode', () => {
      const event = makeImportedEvent({ gameMode: 'dual-place' });
      const result = projectImportedSessionToSummaryInput(event, userId);
      expect(result.sessionType).toBe('flow');
    });

    it('derives "dual-pick" for dual-pick game mode', () => {
      const event = makeImportedEvent({ gameMode: 'dual-pick' });
      const result = projectImportedSessionToSummaryInput(event, userId);
      expect(result.sessionType).toBe('dual-pick');
    });

    it('derives "trace" for dual-trace game mode', () => {
      const event = makeImportedEvent({ gameMode: 'dual-trace' });
      const result = projectImportedSessionToSummaryInput(event, userId);
      expect(result.sessionType).toBe('trace');
    });

    it('defaults to "imported" for unknown game mode', () => {
      const event = makeImportedEvent({ gameMode: undefined });
      const result = projectImportedSessionToSummaryInput(event, userId);
      expect(result.sessionType).toBe('imported');
    });
  });

  describe('createdAt parsing (parseFlexibleDate)', () => {
    it('parses ISO date string', () => {
      const event = makeImportedEvent({
        originalCreatedAt: '2024-03-08T10:00:00Z',
      });
      const result = projectImportedSessionToSummaryInput(event, userId);
      expect(result.createdAt.getTime()).toBe(Date.parse('2024-03-08T10:00:00Z'));
    });

    it('falls back to timestamp when originalCreatedAt is invalid', () => {
      const event = makeImportedEvent({
        originalCreatedAt: 'not-a-date' as any,
        timestamp: baseTimestamp,
      });
      // parseFlexibleDate should throw for invalid date with no valid fallback
      // But the function has a fallback to event.timestamp
      const result = projectImportedSessionToSummaryInput(event, userId);
      expect(result.createdAt.getTime()).toBe(baseTimestamp);
    });
  });

  describe('UPS score', () => {
    it('uses provided upsScore when available', () => {
      const event = makeImportedEvent({
        upsScore: 85.5,
        upsAccuracy: 0.9,
        upsConfidence: 0.8,
      });
      const result = projectImportedSessionToSummaryInput(event, userId);
      expect(result.upsScore).toBe(85.5);
      expect(result.upsAccuracy).toBe(0.9);
      expect(result.upsConfidence).toBe(0.8);
    });

    it('computes fallback UPS when upsScore is missing', () => {
      const event = makeImportedEvent({
        upsScore: undefined,
        upsAccuracy: undefined,
        upsConfidence: undefined,
      });
      const result = projectImportedSessionToSummaryInput(event, userId);
      // Should have a computed UPS from the byModality data
      expect(result.upsScore).toBeDefined();
      expect(typeof result.upsScore).toBe('number');
    });
  });

  describe('worstModalityErrorRate', () => {
    it('computes worst error rate across modalities', () => {
      const event = makeImportedEvent({
        byModality: {
          // position: errorRate = (2+1)/(8+2+1)*100 = 3/11*100 = 27.27%
          position: {
            hits: 8,
            misses: 2,
            falseAlarms: 1,
            correctRejections: 9,
            avgRT: 450,
            dPrime: 2.0,
          },
          // audio: errorRate = (5+3)/(5+5+3)*100 = 8/13*100 = 61.54%
          audio: {
            hits: 5,
            misses: 5,
            falseAlarms: 3,
            correctRejections: 7,
            avgRT: 500,
            dPrime: 0.5,
          },
        },
      });
      const result = projectImportedSessionToSummaryInput(event, userId);

      expect(result.worstModalityErrorRate).toBeDefined();
      // Worst should be audio at ~61.54%
      expect(result.worstModalityErrorRate!).toBeGreaterThan(60);
      expect(result.worstModalityErrorRate!).toBeLessThan(62);
    });

    it('returns undefined when byModality is empty', () => {
      const event = makeImportedEvent({
        byModality: {},
      });
      const result = projectImportedSessionToSummaryInput(event, userId);
      expect(result.worstModalityErrorRate).toBeUndefined();
    });
  });

  describe('edge cases', () => {
    it('handles empty byModality', () => {
      const event = makeImportedEvent({
        byModality: {},
      });
      const result = projectImportedSessionToSummaryInput(event, userId);

      expect(result.totalHits).toBe(0);
      expect(result.totalMisses).toBe(0);
      expect(result.totalFa).toBe(0);
      expect(result.totalCr).toBe(0);
      expect(result.accuracy).toBe(0);
    });

    it('defaults reason to "completed" when not provided', () => {
      const event = makeImportedEvent({ reason: undefined });
      const result = projectImportedSessionToSummaryInput(event, userId);
      expect(result.reason).toBe('completed');
    });

    it('converts journeyStageId to string', () => {
      const event = makeImportedEvent({
        journeyStageId: 5,
        journeyId: 'journey-1',
        playContext: 'journey',
      } as any);
      const result = projectImportedSessionToSummaryInput(event, userId);
      expect(result.journeyStageId).toBe('5');
    });

    it('handles single modality', () => {
      const event = makeImportedEvent({
        byModality: {
          position: {
            hits: 10,
            misses: 0,
            falseAlarms: 0,
            correctRejections: 10,
            avgRT: 400,
            dPrime: 3.0,
          },
        },
      });
      const result = projectImportedSessionToSummaryInput(event, userId);
      expect(result.totalHits).toBe(10);
      expect(result.totalMisses).toBe(0);
      expect(result.accuracy).toBe(1.0);
    });
  });
});

// =============================================================================
// projectTraceSessionToSummaryInput
// =============================================================================

describe('projectTraceSessionToSummaryInput', () => {
  describe('happy path', () => {
    it('projects a complete trace session with correct/incorrect responses', () => {
      const events: GameEvent[] = [
        makeTraceStartEvent(),
        makeTraceResponse(0, true, false, 100),
        makeTraceResponse(1, true, false, 200),
        makeTraceResponse(2, false, false, 300),
        makeTraceResponse(3, true, false, 400),
        makeTraceResponse(4, true, false, 500),
        makeTraceEndEvent(),
      ];

      const result = projectTraceSessionToSummaryInput({
        sessionId,
        sessionEvents: events,
        userId,
      });

      expect(result).not.toBeNull();
      expect(result!.sessionType).toBe('trace');
      expect(result!.sessionId).toBe(sessionId);
      expect(result!.userId).toBe(userId);
      expect(result!.nLevel).toBe(3);
      expect(result!.durationMs).toBe(60000);
      expect(result!.totalHits).toBe(4); // 4 correct
      expect(result!.totalMisses).toBe(1); // 1 incorrect
      expect(result!.totalFa).toBe(0);
      expect(result!.totalCr).toBe(0);
      expect(result!.accuracy).toBeCloseTo(0.8, 5); // 4/5
      expect(result!.globalDPrime).toBeCloseTo(0.8 * 3, 5); // accuracy * 3
      expect(result!.generator).toBe('dual-trace');
      expect(result!.gameMode).toBe('dual-trace');
      expect(result!.reason).toBe('completed');
      expect(result!.byModality).toEqual({});
    });

    it('marks session as passed when accuracy >= TRACE_ACCURACY_PASS_NORMALIZED', () => {
      // 8/10 = 0.8 > 0.7 threshold
      const responses = Array.from({ length: 10 }, (_, i) =>
        makeTraceResponse(i, i < 8, false, i * 100),
      );
      const events: GameEvent[] = [
        makeTraceStartEvent(),
        ...responses,
        makeTraceEndEvent({ totalTrials: 10 }),
      ];

      const result = projectTraceSessionToSummaryInput({
        sessionId,
        sessionEvents: events,
        userId,
      });

      expect(result!.accuracy).toBeCloseTo(0.8, 5);
      expect(result!.passed).toBe(true);
    });

    it('marks session as failed when accuracy < TRACE_ACCURACY_PASS_NORMALIZED', () => {
      // 5/10 = 0.5 < 0.7
      const responses = Array.from({ length: 10 }, (_, i) =>
        makeTraceResponse(i, i < 5, false, i * 100),
      );
      const events: GameEvent[] = [
        makeTraceStartEvent(),
        ...responses,
        makeTraceEndEvent({ totalTrials: 10 }),
      ];

      const result = projectTraceSessionToSummaryInput({
        sessionId,
        sessionEvents: events,
        userId,
      });

      expect(result!.accuracy).toBeCloseTo(0.5, 5);
      expect(result!.passed).toBe(false);
    });
  });

  describe('warmup filtering', () => {
    it('excludes warmup trials from accuracy calculation', () => {
      const events: GameEvent[] = [
        makeTraceStartEvent(),
        makeTraceResponse(0, false, true, 50), // warmup - should be ignored
        makeTraceResponse(1, false, true, 100), // warmup - should be ignored
        makeTraceResponse(2, true, false, 200), // real
        makeTraceResponse(3, true, false, 300), // real
        makeTraceEndEvent(),
      ];

      const result = projectTraceSessionToSummaryInput({
        sessionId,
        sessionEvents: events,
        userId,
      });

      expect(result).not.toBeNull();
      expect(result!.totalHits).toBe(2);
      expect(result!.totalMisses).toBe(0);
      expect(result!.accuracy).toBeCloseTo(1.0, 5);
    });
  });

  describe('edge cases', () => {
    it('returns null when no TRACE_SESSION_ENDED event', () => {
      const events: GameEvent[] = [makeTraceStartEvent(), makeTraceResponse(0, true, false, 100)];

      const result = projectTraceSessionToSummaryInput({
        sessionId,
        sessionEvents: events,
        userId,
      });

      expect(result).toBeNull();
    });

    it('handles zero responses (uses score from end event)', () => {
      const events: GameEvent[] = [
        makeTraceStartEvent(),
        makeTraceEndEvent({ score: 75, totalTrials: 10 }),
      ];

      const result = projectTraceSessionToSummaryInput({
        sessionId,
        sessionEvents: events,
        userId,
      });

      expect(result).not.toBeNull();
      expect(result!.totalHits).toBe(0);
      expect(result!.totalMisses).toBe(0);
      // With 0 responses, falls back to score/100 = 0.75
      expect(result!.accuracy).toBeCloseTo(0.75, 5);
    });

    it('uses end event timestamp as fallback for createdAt when no start event', () => {
      const events: GameEvent[] = [
        // No start event
        makeTraceResponse(0, true, false, 100),
        makeTraceEndEvent({ durationMs: 30000 }),
      ];

      const result = projectTraceSessionToSummaryInput({
        sessionId,
        sessionEvents: events,
        userId,
      });

      expect(result).not.toBeNull();
      // createdAt should be derived from end event timestamp - durationMs
      const endTimestamp = baseTimestamp + 60000;
      expect(result!.createdAt.getTime()).toBe(endTimestamp - 30000);
    });

    it('defaults nLevel to 2 when no start event', () => {
      const events: GameEvent[] = [makeTraceResponse(0, true, false, 100), makeTraceEndEvent()];

      const result = projectTraceSessionToSummaryInput({
        sessionId,
        sessionEvents: events,
        userId,
      });

      expect(result).not.toBeNull();
      expect(result!.nLevel).toBe(2); // fallback
    });

    it('extracts journey context from start event', () => {
      const events: GameEvent[] = [
        makeTraceStartEvent({
          journeyStageId: 3,
          journeyId: 'journey-abc',
          playContext: 'journey',
          journeyStartLevel: 2,
          journeyTargetLevel: 4,
          journeyGameMode: 'dual-trace',
        }),
        makeTraceResponse(0, true, false, 100),
        makeTraceEndEvent({
          playContext: 'journey',
          journeyStageId: 3,
          journeyId: 'journey-abc',
          journeyStartLevel: 2,
          journeyTargetLevel: 4,
          journeyGameMode: 'dual-trace',
        }),
      ];

      const result = projectTraceSessionToSummaryInput({
        sessionId,
        sessionEvents: events,
        userId,
      });

      expect(result).not.toBeNull();
      expect(result!.journeyStageId).toBe('3');
      expect(result!.journeyId).toBe('journey-abc');
      expect(result!.playContext).toBe('journey');
    });

    it('uses abandoned reason from end event', () => {
      const events: GameEvent[] = [
        makeTraceStartEvent(),
        makeTraceEndEvent({ reason: 'abandoned' }),
      ];

      const result = projectTraceSessionToSummaryInput({
        sessionId,
        sessionEvents: events,
        userId,
      });

      expect(result).not.toBeNull();
      expect(result!.reason).toBe('abandoned');
    });

    it('handles score fallback when accuracy is from score and score is 0', () => {
      const events: GameEvent[] = [makeTraceStartEvent(), makeTraceEndEvent({ score: 0 })];

      const result = projectTraceSessionToSummaryInput({
        sessionId,
        sessionEvents: events,
        userId,
      });

      expect(result).not.toBeNull();
      expect(result!.accuracy).toBe(0);
      expect(result!.passed).toBe(false);
    });

    it('clamps score-based accuracy between 0 and 1', () => {
      const events: GameEvent[] = [makeTraceStartEvent(), makeTraceEndEvent({ score: 100 })];

      const result = projectTraceSessionToSummaryInput({
        sessionId,
        sessionEvents: events,
        userId,
      });

      expect(result).not.toBeNull();
      expect(result!.accuracy).toBeLessThanOrEqual(1);
      expect(result!.accuracy).toBeGreaterThanOrEqual(0);
    });
  });

  describe('UPS projection', () => {
    it('projects UPS for a trace session with start and end events', () => {
      const events: GameEvent[] = [
        makeTraceStartEvent(),
        makeTraceResponse(0, true, false, 100),
        makeTraceResponse(1, true, false, 200),
        makeTraceResponse(2, true, false, 300),
        makeTraceEndEvent(),
      ];

      const result = projectTraceSessionToSummaryInput({
        sessionId,
        sessionEvents: events,
        userId,
      });

      expect(result).not.toBeNull();
      expect(result!.upsScore).toBeDefined();
      expect(typeof result!.upsScore).toBe('number');
    });

    it('has undefined UPS when start event is missing (UPSProjector returns null)', () => {
      const events: GameEvent[] = [makeTraceResponse(0, true, false, 100), makeTraceEndEvent()];

      const result = projectTraceSessionToSummaryInput({
        sessionId,
        sessionEvents: events,
        userId,
      });

      expect(result).not.toBeNull();
      expect(result!.upsScore).toBeUndefined();
    });
  });

  describe('input methods extraction', () => {
    it('extracts input methods from trace response events', () => {
      const events: GameEvent[] = [
        makeTraceStartEvent(),
        createMockEvent('TRACE_RESPONDED', {
          sessionId,
          timestamp: baseTimestamp + 100,
          trialIndex: 0,
          responseType: 'swipe',
          position: 3,
          expectedPosition: 3,
          isCorrect: true,
          isWarmup: false,
          responseTimeMs: 300,
          inputMethod: 'touch',
        } as any),
        makeTraceEndEvent(),
      ];

      const result = projectTraceSessionToSummaryInput({
        sessionId,
        sessionEvents: events,
        userId,
      });

      expect(result).not.toBeNull();
      expect(result!.inputMethods).toBe('touch');
    });
  });
});

// =============================================================================
// Null-return edge cases for other projectors
// =============================================================================

describe('projector null returns', () => {
  it('projectTempoSessionToSummaryInput returns null with empty events', () => {
    const result = projectTempoSessionToSummaryInput({
      sessionId,
      sessionEvents: [],
      userId,
    });
    expect(result).toBeNull();
  });

  it('projectRecallSessionToSummaryInput returns null without RECALL_SESSION_STARTED', () => {
    const result = projectRecallSessionToSummaryInput({
      sessionId,
      sessionEvents: [],
      userId,
    });
    expect(result).toBeNull();
  });

  it('projectFlowSessionToSummaryInput returns null without FLOW_SESSION_STARTED', () => {
    const result = projectFlowSessionToSummaryInput({
      sessionId,
      sessionEvents: [],
      userId,
    });
    expect(result).toBeNull();
  });

  it('projectDualPickSessionToSummaryInput returns null without DUAL_PICK_SESSION_STARTED', () => {
    const result = projectDualPickSessionToSummaryInput({
      sessionId,
      sessionEvents: [],
      userId,
    });
    expect(result).toBeNull();
  });

  it('projectTimeSessionToSummaryInput returns null with empty events', () => {
    const result = projectTimeSessionToSummaryInput({
      sessionId,
      sessionEvents: [],
      userId,
    });
    expect(result).toBeNull();
  });

  it('projectTrackSessionToSummaryInput returns null with empty events', () => {
    const result = projectTrackSessionToSummaryInput({
      sessionId,
      sessionEvents: [],
      userId,
    });
    expect(result).toBeNull();
  });

  it('projectCorsiSessionToSummaryInput returns null with empty events', () => {
    const result = projectCorsiSessionToSummaryInput({
      sessionId,
      sessionEvents: [],
      userId,
    });
    expect(result).toBeNull();
  });

  it('projectOspanSessionToSummaryInput returns null with empty events', () => {
    const result = projectOspanSessionToSummaryInput({
      sessionId,
      sessionEvents: [],
      userId,
    });
    expect(result).toBeNull();
  });

  it('projectRunningSpanSessionToSummaryInput returns null with empty events', () => {
    const result = projectRunningSpanSessionToSummaryInput({
      sessionId,
      sessionEvents: [],
      userId,
    });
    expect(result).toBeNull();
  });

  it('projectPasatSessionToSummaryInput returns null with empty events', () => {
    const result = projectPasatSessionToSummaryInput({
      sessionId,
      sessionEvents: [],
      userId,
    });
    expect(result).toBeNull();
  });

  it('projectSwmSessionToSummaryInput returns null with empty events', () => {
    const result = projectSwmSessionToSummaryInput({
      sessionId,
      sessionEvents: [],
      userId,
    });
    expect(result).toBeNull();
  });
});

// =============================================================================
// computeWorstModalityErrorRate (tested through imported projector)
// =============================================================================

describe('computeWorstModalityErrorRate (via imported projector)', () => {
  it('picks the highest error rate among modalities', () => {
    const event = makeImportedEvent({
      byModality: {
        // error rate = (0+0)/(10+0+0) = 0%
        position: {
          hits: 10,
          misses: 0,
          falseAlarms: 0,
          correctRejections: 10,
          avgRT: 400,
          dPrime: 3.0,
        },
        // error rate = (5+5)/(5+5+5) = 66.67%
        audio: {
          hits: 5,
          misses: 5,
          falseAlarms: 5,
          correctRejections: 5,
          avgRT: 500,
          dPrime: 0.5,
        },
      },
    });
    const result = projectImportedSessionToSummaryInput(event, userId);

    expect(result.worstModalityErrorRate).toBeDefined();
    expect(result.worstModalityErrorRate!).toBeCloseTo(66.67, 1);
  });

  it('handles modalities with zero total', () => {
    const event = makeImportedEvent({
      byModality: {
        position: { hits: 0, misses: 0, falseAlarms: 0, correctRejections: 0, avgRT: 0, dPrime: 0 },
      },
    });
    const result = projectImportedSessionToSummaryInput(event, userId);

    // No trials means no error rate
    expect(result.worstModalityErrorRate).toBeUndefined();
  });

  it('handles modalities with "correct" key instead of "hits"', () => {
    const event = makeImportedEvent({
      byModality: {
        position: {
          correct: 10,
          incorrect: 2,
          falseAlarms: 1,
          correctRejections: 7,
          avgRT: 400,
          dPrime: 2.0,
        } as any,
      },
    });
    const result = projectImportedSessionToSummaryInput(event, userId);

    // computeWorstModalityErrorRate uses d.hits || d.correct
    // hits = Number(d.hits) || Number(d.correct) = 0 || 10 = 10
    // misses = Number(d.misses) || Number(d.incorrect) = 0 || 2 = 2
    // fa = Number(d.falseAlarms) = 1
    // total = 10 + 2 + 1 = 13
    // errorRate = (2+1)/13 * 100 = 23.08%
    expect(result.worstModalityErrorRate).toBeDefined();
    expect(result.worstModalityErrorRate!).toBeCloseTo(23.08, 0);
  });
});

// =============================================================================
// computeImportedTotals edge cases (via imported projector)
// =============================================================================

describe('computeImportedTotals edge cases (via imported projector)', () => {
  it('handles missing stats fields in byModality values (undefined→0)', () => {
    const event = makeImportedEvent({
      byModality: {
        position: {
          hits: undefined,
          misses: undefined,
          falseAlarms: undefined,
          correctRejections: undefined,
          avgRT: 0,
          dPrime: 0,
        } as any,
      },
    });
    const result = projectImportedSessionToSummaryInput(event, userId);

    expect(result.totalHits).toBe(0);
    expect(result.totalMisses).toBe(0);
    expect(result.totalFa).toBe(0);
    expect(result.totalCr).toBe(0);
    expect(result.accuracy).toBe(0);
  });

  it('handles many modalities', () => {
    const event = makeImportedEvent({
      byModality: {
        position: {
          hits: 5,
          misses: 1,
          falseAlarms: 0,
          correctRejections: 4,
          avgRT: 400,
          dPrime: 2.0,
        },
        audio: {
          hits: 4,
          misses: 2,
          falseAlarms: 1,
          correctRejections: 3,
          avgRT: 500,
          dPrime: 1.5,
        },
        color: {
          hits: 6,
          misses: 0,
          falseAlarms: 0,
          correctRejections: 4,
          avgRT: 350,
          dPrime: 3.0,
        },
        image: {
          hits: 3,
          misses: 3,
          falseAlarms: 2,
          correctRejections: 2,
          avgRT: 600,
          dPrime: 0.5,
        },
      },
    });
    const result = projectImportedSessionToSummaryInput(event, userId);

    expect(result.totalHits).toBe(5 + 4 + 6 + 3);
    expect(result.totalMisses).toBe(1 + 2 + 0 + 3);
    expect(result.totalFa).toBe(0 + 1 + 0 + 2);
    expect(result.totalCr).toBe(4 + 3 + 4 + 2);
  });
});
