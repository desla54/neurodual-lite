import { describe, test, expect } from 'bun:test';
import {
  migrateAndValidateEvent,
  migrateAndValidateEventBatch,
  isValidEventShape,
  safeParseEvent,
} from '../event-validator';
import type { RawVersionedEvent } from '../types';

// =============================================================================
// Test Fixtures
// =============================================================================

function createValidSessionStartedEvent(): RawVersionedEvent {
  return {
    id: crypto.randomUUID(),
    type: 'SESSION_STARTED',
    sessionId: crypto.randomUUID(),
    timestamp: Date.now(),
    schemaVersion: 1,
    playContext: 'free',
    userId: 'user-1',
    nLevel: 2,
    device: {
      platform: 'web',
      screenWidth: 1920,
      screenHeight: 1080,
      userAgent: 'test-agent',
      touchCapable: false,
    },
    context: {
      timeOfDay: 'morning',
      localHour: 9,
      dayOfWeek: 1,
      timezone: 'UTC',
    },
    config: {
      nLevel: 2,
      activeModalities: ['position', 'audio'],
      trialsCount: 20,
      targetProbability: 0.33,
      lureProbability: 0.1,
      intervalSeconds: 2.5,
      stimulusDurationSeconds: 0.5,
      generator: 'BrainWorkshop',
    },
  };
}

function createValidFlowSessionStartedEvent(params?: {
  readonly placementOrderMode?: 'free' | 'random' | 'oldestFirst' | 'newestFirst' | 'guided';
}): RawVersionedEvent {
  const base = createValidSessionStartedEvent();
  return {
    id: crypto.randomUUID(),
    type: 'FLOW_SESSION_STARTED',
    sessionId: base.sessionId,
    timestamp: base.timestamp,
    schemaVersion: 1,
    eventId: crypto.randomUUID(),
    seq: 0,
    occurredAtMs: base.timestamp,
    monotonicMs: 0,
    playContext: 'free',
    userId: 'user-1',
    device: base.device,
    context: base.context,
    config: {
      nLevel: 2,
      activeModalities: ['position', 'audio'],
      trialsCount: 20,
      stimulusDurationMs: 800,
      placementOrderMode: params?.placementOrderMode ?? 'free',
    },
  };
}

function createValidDualPickSessionStartedEvent(params?: {
  readonly placementOrderMode?: 'free' | 'random' | 'oldestFirst' | 'newestFirst' | 'guided';
}): RawVersionedEvent {
  const base = createValidSessionStartedEvent();
  return {
    id: crypto.randomUUID(),
    type: 'DUAL_PICK_SESSION_STARTED',
    sessionId: base.sessionId,
    timestamp: base.timestamp,
    schemaVersion: 1,
    eventId: crypto.randomUUID(),
    seq: 0,
    occurredAtMs: base.timestamp,
    monotonicMs: 0,
    playContext: 'free',
    userId: 'user-1',
    device: base.device,
    context: base.context,
    config: {
      nLevel: 2,
      activeModalities: ['position', 'audio'],
      trialsCount: 20,
      stimulusDurationMs: 800,
      placementOrderMode: params?.placementOrderMode ?? 'free',
      distractorCount: 0,
    },
  };
}

function createValidUserResponseEvent(): RawVersionedEvent {
  return {
    id: crypto.randomUUID(),
    type: 'USER_RESPONDED',
    sessionId: crypto.randomUUID(),
    timestamp: Date.now(),
    schemaVersion: 1,
    trialIndex: 5,
    modality: 'position',
    reactionTimeMs: 450,
    pressDurationMs: 120,
    responsePhase: 'during_stimulus',
  };
}

function createValidFocusLostEvent(): RawVersionedEvent {
  return {
    id: crypto.randomUUID(),
    type: 'FOCUS_LOST',
    sessionId: crypto.randomUUID(),
    timestamp: Date.now(),
    schemaVersion: 1,
    trialIndex: 5,
    phase: 'stimulus',
  };
}

function createValidSessionEndedEvent(): RawVersionedEvent {
  return {
    id: crypto.randomUUID(),
    type: 'SESSION_ENDED',
    sessionId: crypto.randomUUID(),
    timestamp: Date.now(),
    schemaVersion: 1,
    reason: 'completed',
    playContext: 'free',
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('EventValidator', () => {
  describe('migrateAndValidateEvent', () => {
    test('validates correct SESSION_STARTED event', () => {
      const event = createValidSessionStartedEvent();
      const result = migrateAndValidateEvent(event);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.event.type).toBe('SESSION_STARTED');
        expect(result.migrated).toBe(false);
        expect(result.fromVersion).toBe(1);
        expect(result.toVersion).toBe(1);
      }
    });

    test('validates correct USER_RESPONDED event', () => {
      const event = createValidUserResponseEvent();
      const result = migrateAndValidateEvent(event);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.event.type).toBe('USER_RESPONDED');
      }
    });

    test('normalizes legacy USER_RESPONSE to USER_RESPONDED', () => {
      const legacyEvent: RawVersionedEvent = {
        id: crypto.randomUUID(),
        type: 'USER_RESPONSE',
        sessionId: crypto.randomUUID(),
        timestamp: Date.now(),
        schemaVersion: 1,
        trialIndex: 5,
        modality: 'position',
        reactionTimeMs: 450,
        pressDurationMs: 120,
        responsePhase: 'during_stimulus',
      };

      const result = migrateAndValidateEvent(legacyEvent);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.event.type).toBe('USER_RESPONDED');
      }
    });

    test('validates correct FOCUS_LOST event', () => {
      const event = createValidFocusLostEvent();
      const result = migrateAndValidateEvent(event);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.event.type).toBe('FOCUS_LOST');
      }
    });

    test('validates correct SESSION_ENDED event', () => {
      const event = createValidSessionEndedEvent();
      const result = migrateAndValidateEvent(event);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.event.type).toBe('SESSION_ENDED');
      }
    });

    test('does not strip unknown keys on successful validation (lossless read)', () => {
      const event: RawVersionedEvent = {
        ...createValidSessionEndedEvent(),
        // Simulate fields introduced later than the current schema or not modeled in Zod.
        // Must not conflict with refineJourneyPlayContext invariants for playContext='free'.
        unknownFutureField: { nested: true },
      };

      const result = migrateAndValidateEvent(event, {
        strict: false,
        logErrors: false,
        targetVersion: 1,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(
          (result.event as unknown as { unknownFutureField?: unknown }).unknownFutureField,
        ).toEqual({
          nested: true,
        });
      }
    });

    test('rejects event with invalid type', () => {
      const event: RawVersionedEvent = {
        id: crypto.randomUUID(),
        type: 'INVALID_TYPE',
        sessionId: crypto.randomUUID(),
        timestamp: Date.now(),
        schemaVersion: 1,
      };

      const result = migrateAndValidateEvent(event, {
        strict: false,
        logErrors: false,
        targetVersion: 1,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.stage).toBe('validation');
        // Zod error messages differ across major versions; keep the assertion focused on the field.
        expect(result.error).toContain('type:');
      }
    });

    test('rejects SESSION_STARTED with missing required fields', () => {
      const event: RawVersionedEvent = {
        id: crypto.randomUUID(),
        type: 'SESSION_STARTED',
        sessionId: crypto.randomUUID(),
        timestamp: Date.now(),
        schemaVersion: 1,
        // Missing userId, nLevel, device, context, config
      };

      const result = migrateAndValidateEvent(event, {
        strict: false,
        logErrors: false,
        targetVersion: 1,
      });

      expect(result.success).toBe(false);
    });

    test('throws in strict mode for invalid event', () => {
      const event: RawVersionedEvent = {
        id: crypto.randomUUID(),
        type: 'INVALID_TYPE',
        sessionId: crypto.randomUUID(),
        timestamp: Date.now(),
        schemaVersion: 1,
      };

      expect(() => {
        migrateAndValidateEvent(event, {
          strict: true,
          logErrors: false,
          targetVersion: 1,
        });
      }).toThrow();
    });

    test('handles missing schemaVersion (defaults to 1)', () => {
      const event = {
        ...createValidFocusLostEvent(),
        schemaVersion: undefined,
      } as unknown as RawVersionedEvent;

      const result = migrateAndValidateEvent(event, {
        strict: false,
        logErrors: false,
        targetVersion: 1,
      });

      expect(result.success).toBe(true);
    });

    test("normalizes legacy placementOrderMode 'guided' to 'random' (FLOW_SESSION_STARTED)", () => {
      const legacy = createValidFlowSessionStartedEvent({ placementOrderMode: 'guided' });
      const result = migrateAndValidateEvent(legacy);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.event.type).toBe('FLOW_SESSION_STARTED');
        expect(
          (result.event as unknown as { config?: { placementOrderMode?: string } }).config,
        ).toMatchObject({ placementOrderMode: 'random' });
      }
    });

    test("normalizes legacy placementOrderMode 'guided' to 'random' (DUAL_PICK_SESSION_STARTED)", () => {
      const legacy = createValidDualPickSessionStartedEvent({ placementOrderMode: 'guided' });
      const result = migrateAndValidateEvent(legacy);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.event.type).toBe('DUAL_PICK_SESSION_STARTED');
        expect(
          (result.event as unknown as { config?: { placementOrderMode?: string } }).config,
        ).toMatchObject({ placementOrderMode: 'random' });
      }
    });

    test('repairs legacy BADGE_UNLOCKED with nested badge.badgeId only', () => {
      const event: RawVersionedEvent = {
        id: crypto.randomUUID(),
        type: 'BADGE_UNLOCKED',
        sessionId: crypto.randomUUID(),
        timestamp: Date.now(),
        schemaVersion: 1,
        badge: {
          badgeId: 'first_session',
        },
      } as unknown as RawVersionedEvent;

      const result = migrateAndValidateEvent(event, {
        strict: false,
        logErrors: false,
        targetVersion: 1,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.event).toMatchObject({
          type: 'BADGE_UNLOCKED',
          badgeId: 'first_session',
          category: 'consistency',
          priority: 0,
        });
      }
    });
  });

  describe('migrateAndValidateEventBatch', () => {
    test('validates batch of valid events', () => {
      const events = [
        createValidSessionStartedEvent(),
        createValidUserResponseEvent(),
        createValidFocusLostEvent(),
        createValidSessionEndedEvent(),
      ];

      const result = migrateAndValidateEventBatch(events, {
        strict: false,
        logErrors: false,
        targetVersion: 1,
      });

      expect(result.events).toHaveLength(4);
      expect(result.errorCount).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    test('handles batch with mixed valid/invalid events', () => {
      const validEvent = createValidFocusLostEvent();
      const invalidEvent: RawVersionedEvent = {
        id: crypto.randomUUID(),
        type: 'INVALID_TYPE',
        sessionId: crypto.randomUUID(),
        timestamp: Date.now(),
        schemaVersion: 1,
      };

      const result = migrateAndValidateEventBatch([validEvent, invalidEvent], {
        strict: false,
        logErrors: false,
        targetVersion: 1,
      });

      expect(result.events).toHaveLength(1);
      expect(result.errorCount).toBe(1);
      expect(result.errors).toHaveLength(1);
      // @ts-expect-error test: nullable access
      expect(result!.errors![0].event).toEqual(invalidEvent);
    });

    test('returns all errors for batch of invalid events', () => {
      const invalid1: RawVersionedEvent = {
        id: crypto.randomUUID(),
        type: 'INVALID_1',
        sessionId: crypto.randomUUID(),
        timestamp: Date.now(),
        schemaVersion: 1,
      };
      const invalid2: RawVersionedEvent = {
        id: crypto.randomUUID(),
        type: 'INVALID_2',
        sessionId: crypto.randomUUID(),
        timestamp: Date.now(),
        schemaVersion: 1,
      };

      const result = migrateAndValidateEventBatch([invalid1, invalid2], {
        strict: false,
        logErrors: false,
        targetVersion: 1,
      });

      expect(result.events).toHaveLength(0);
      expect(result.errorCount).toBe(2);
    });
  });

  describe('isValidEventShape', () => {
    test('returns true for valid shape', () => {
      expect(
        isValidEventShape({
          id: 'test',
          type: 'USER_RESPONDED',
          sessionId: 'session',
          timestamp: 12345,
        }),
      ).toBe(true);
    });

    test('returns false for missing id', () => {
      expect(
        isValidEventShape({
          type: 'USER_RESPONDED',
          sessionId: 'session',
          timestamp: 12345,
        }),
      ).toBe(false);
    });

    test('returns false for missing type', () => {
      expect(
        isValidEventShape({
          id: 'test',
          sessionId: 'session',
          timestamp: 12345,
        }),
      ).toBe(false);
    });

    test('returns false for missing sessionId', () => {
      expect(
        isValidEventShape({
          id: 'test',
          type: 'USER_RESPONDED',
          timestamp: 12345,
        }),
      ).toBe(false);
    });

    test('returns false for missing timestamp', () => {
      expect(
        isValidEventShape({
          id: 'test',
          type: 'USER_RESPONDED',
          sessionId: 'session',
        }),
      ).toBe(false);
    });

    test('returns false for null', () => {
      expect(isValidEventShape(null)).toBe(false);
    });

    test('returns false for string', () => {
      expect(isValidEventShape('string')).toBe(false);
    });

    test('returns false for wrong types', () => {
      expect(
        isValidEventShape({
          id: 123, // Should be string
          type: 'USER_RESPONDED',
          sessionId: 'session',
          timestamp: 12345,
        }),
      ).toBe(false);
    });
  });

  describe('safeParseEvent', () => {
    test('returns GameEvent for valid event', () => {
      const event = createValidFocusLostEvent();
      const result = safeParseEvent(event);

      expect(result).not.toBeNull();
      if (result) {
        expect(result.type).toBe('FOCUS_LOST');
      }
    });

    test('returns null for invalid event', () => {
      const result = safeParseEvent({ invalid: true });
      expect(result).toBeNull();
    });

    test('returns null for null input', () => {
      const result = safeParseEvent(null);
      expect(result).toBeNull();
    });

    test('returns null for invalid event type', () => {
      const event: RawVersionedEvent = {
        id: crypto.randomUUID(),
        type: 'INVALID_TYPE',
        sessionId: crypto.randomUUID(),
        timestamp: Date.now(),
        schemaVersion: 1,
      };

      const result = safeParseEvent(event);
      expect(result).toBeNull();
    });
  });
});
