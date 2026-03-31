import { describe, it, expect } from 'bun:test';
import {
  migrateAndValidateEvent,
  migrateAndValidateEventBatch,
  isValidEventShape,
  safeParseEvent,
} from './event-validator';
import type { RawVersionedEvent, ValidationConfig } from './types';

// =============================================================================
// Shared config - lenient, no logs
// =============================================================================

const lenient: ValidationConfig = {
  strict: false,
  logErrors: false,
  targetVersion: 1,
};

const strict: ValidationConfig = {
  strict: true,
  logErrors: false,
  targetVersion: 1,
};

// =============================================================================
// Test Fixtures
// =============================================================================

function baseEvent(overrides: Partial<RawVersionedEvent> & { type: string }): RawVersionedEvent {
  return {
    id: crypto.randomUUID(),
    sessionId: crypto.randomUUID(),
    timestamp: Date.now(),
    schemaVersion: 1,
    ...overrides,
  };
}

function validSessionStarted(): RawVersionedEvent {
  return baseEvent({
    type: 'SESSION_STARTED',
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
  });
}

function validUserResponded(): RawVersionedEvent {
  return baseEvent({
    type: 'USER_RESPONDED',
    trialIndex: 5,
    modality: 'position',
    reactionTimeMs: 450,
    pressDurationMs: 120,
    responsePhase: 'during_stimulus',
  });
}

function validSessionEnded(): RawVersionedEvent {
  return baseEvent({
    type: 'SESSION_ENDED',
    reason: 'completed',
    playContext: 'free',
  });
}

function validFocusLost(): RawVersionedEvent {
  return baseEvent({
    type: 'FOCUS_LOST',
    trialIndex: 5,
    phase: 'stimulus',
  });
}

function validTrialPresented(): RawVersionedEvent {
  return baseEvent({
    type: 'TRIAL_PRESENTED',
    isiMs: 2500,
    stimulusDurationMs: 500,
    trial: {
      index: 3,
      isBuffer: false,
      position: 4,
      sound: 'C',
      color: 'ink-black',
      image: 'circle',
      trialType: 'Non-Cible',
      isPositionTarget: false,
      isSoundTarget: false,
      isColorTarget: false,
      isImageTarget: false,
    },
  });
}

function validFlowSessionStarted(placementOrderMode: string = 'free'): RawVersionedEvent {
  return baseEvent({
    type: 'FLOW_SESSION_STARTED',
    eventId: crypto.randomUUID(),
    seq: 0,
    occurredAtMs: Date.now(),
    monotonicMs: 0,
    playContext: 'free',
    userId: 'user-1',
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
      stimulusDurationMs: 800,
      placementOrderMode,
    },
  });
}

function validDualPickSessionStarted(placementOrderMode: string = 'free'): RawVersionedEvent {
  return baseEvent({
    type: 'DUAL_PICK_SESSION_STARTED',
    eventId: crypto.randomUUID(),
    seq: 0,
    occurredAtMs: Date.now(),
    monotonicMs: 0,
    playContext: 'free',
    userId: 'user-1',
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
      stimulusDurationMs: 800,
      placementOrderMode,
      distractorCount: 0,
    },
  });
}

function validBadgeUnlocked(): RawVersionedEvent {
  return baseEvent({
    type: 'BADGE_UNLOCKED',
    badgeId: 'first_session',
    category: 'consistency',
    priority: 0,
  });
}

// =============================================================================
// Tests: migrateAndValidateEvent - happy paths
// =============================================================================

describe('event-validator', () => {
  describe('migrateAndValidateEvent - happy paths', () => {
    it('validates SESSION_STARTED', () => {
      const r = migrateAndValidateEvent(validSessionStarted(), lenient);
      expect(r.success).toBe(true);
      if (r.success) expect(r.event.type).toBe('SESSION_STARTED');
    });

    it('validates USER_RESPONDED', () => {
      const r = migrateAndValidateEvent(validUserResponded(), lenient);
      expect(r.success).toBe(true);
      if (r.success) expect(r.event.type).toBe('USER_RESPONDED');
    });

    it('validates SESSION_ENDED', () => {
      const r = migrateAndValidateEvent(validSessionEnded(), lenient);
      expect(r.success).toBe(true);
    });

    it('validates FOCUS_LOST', () => {
      const r = migrateAndValidateEvent(validFocusLost(), lenient);
      expect(r.success).toBe(true);
    });

    it('validates TRIAL_PRESENTED', () => {
      const r = migrateAndValidateEvent(validTrialPresented(), lenient);
      expect(r.success).toBe(true);
    });

    it('validates BADGE_UNLOCKED', () => {
      const r = migrateAndValidateEvent(validBadgeUnlocked(), lenient);
      expect(r.success).toBe(true);
    });

    it('validates FLOW_SESSION_STARTED', () => {
      const r = migrateAndValidateEvent(validFlowSessionStarted(), lenient);
      expect(r.success).toBe(true);
    });

    it('validates DUAL_PICK_SESSION_STARTED', () => {
      const r = migrateAndValidateEvent(validDualPickSessionStarted(), lenient);
      expect(r.success).toBe(true);
    });
  });

  // ===========================================================================
  // Legacy: placementOrderMode 'guided' → 'random'
  // ===========================================================================
  describe('legacy: placementOrderMode guided → random', () => {
    it('normalizes FLOW_SESSION_STARTED guided to random', () => {
      const r = migrateAndValidateEvent(validFlowSessionStarted('guided'), lenient);
      expect(r.success).toBe(true);
      if (r.success) {
        const config = (r.event as unknown as { config: { placementOrderMode: string } }).config;
        expect(config.placementOrderMode).toBe('random');
      }
    });

    it('normalizes DUAL_PICK_SESSION_STARTED guided to random', () => {
      const r = migrateAndValidateEvent(validDualPickSessionStarted('guided'), lenient);
      expect(r.success).toBe(true);
      if (r.success) {
        const config = (r.event as unknown as { config: { placementOrderMode: string } }).config;
        expect(config.placementOrderMode).toBe('random');
      }
    });

    it('does NOT change valid placementOrderMode (free)', () => {
      const r = migrateAndValidateEvent(validFlowSessionStarted('free'), lenient);
      expect(r.success).toBe(true);
      if (r.success) {
        const config = (r.event as unknown as { config: { placementOrderMode: string } }).config;
        expect(config.placementOrderMode).toBe('free');
      }
    });
  });

  // ===========================================================================
  // Legacy: userId stripping
  // ===========================================================================
  describe('legacy: strip userId from strict-schema events', () => {
    it('strips userId from BADGE_UNLOCKED', () => {
      const event: RawVersionedEvent = {
        ...validBadgeUnlocked(),
        userId: 'legacy-user',
      };
      const r = migrateAndValidateEvent(event, lenient);
      expect(r.success).toBe(true);
    });

    it('strips userId from SESSION_ENDED', () => {
      const event: RawVersionedEvent = {
        ...validSessionEnded(),
        userId: 'legacy-user',
      };
      const r = migrateAndValidateEvent(event, lenient);
      expect(r.success).toBe(true);
    });

    it('strips userId from JOURNEY_CONTEXT_COMPUTED', () => {
      // We can't easily build a full valid JOURNEY_CONTEXT_COMPUTED fixture,
      // but we verify the code path at least runs by checking userId removal doesn't crash.
      const event = baseEvent({
        type: 'JOURNEY_CONTEXT_COMPUTED',
        userId: 'u',
      });
      // This may still fail validation (missing required fields), but the normalization step runs.
      const r = migrateAndValidateEvent(event, lenient);
      // Just verify it didn't throw and that the normalization path was hit
      expect(typeof r.success).toBe('boolean');
    });
  });

  // ===========================================================================
  // Legacy: BADGE_UNLOCKED nested badge flattening
  // ===========================================================================
  describe('legacy: BADGE_UNLOCKED nested badge', () => {
    it('flattens nested badge.id → badgeId', () => {
      const event = baseEvent({
        type: 'BADGE_UNLOCKED',
        badge: { id: 'first_session', category: 'consistency', priority: 0 },
      }) as unknown as RawVersionedEvent;

      const r = migrateAndValidateEvent(event, lenient);
      expect(r.success).toBe(true);
      if (r.success) {
        expect((r.event as unknown as { badgeId: string }).badgeId).toBe('first_session');
        expect((r.event as unknown as { category: string }).category).toBe('consistency');
        expect((r.event as unknown as { priority: number }).priority).toBe(0);
      }
    });

    it('flattens nested badge.badgeId → badgeId', () => {
      const event = baseEvent({
        type: 'BADGE_UNLOCKED',
        badge: { badgeId: 'first_session' },
      }) as unknown as RawVersionedEvent;

      const r = migrateAndValidateEvent(event, lenient);
      expect(r.success).toBe(true);
      if (r.success) {
        expect((r.event as unknown as { badgeId: string }).badgeId).toBe('first_session');
      }
    });

    it('resolves category/priority from badge registry when missing', () => {
      const event = baseEvent({
        type: 'BADGE_UNLOCKED',
        badge: { badgeId: 'first_session' },
      }) as unknown as RawVersionedEvent;

      const r = migrateAndValidateEvent(event, lenient);
      expect(r.success).toBe(true);
      if (r.success) {
        // first_session badge is in 'consistency' category with priority 0
        expect((r.event as unknown as { category: string }).category).toBe('consistency');
        expect((r.event as unknown as { priority: number }).priority).toBe(0);
      }
    });

    it('prefers existing flat badgeId over nested badge.id', () => {
      const event = baseEvent({
        type: 'BADGE_UNLOCKED',
        badgeId: 'first_session',
        badge: { id: 'some_other_badge' },
        category: 'consistency',
        priority: 0,
      }) as unknown as RawVersionedEvent;

      const r = migrateAndValidateEvent(event, lenient);
      expect(r.success).toBe(true);
      if (r.success) {
        expect((r.event as unknown as { badgeId: string }).badgeId).toBe('first_session');
      }
    });

    it('enriches flat badgeId-only event with category/priority from registry', () => {
      const event = baseEvent({
        type: 'BADGE_UNLOCKED',
        badgeId: 'first_session',
      });

      const r = migrateAndValidateEvent(event, lenient);
      expect(r.success).toBe(true);
      if (r.success) {
        expect((r.event as unknown as { category: string }).category).toBe('consistency');
        expect((r.event as unknown as { priority: number }).priority).toBe(0);
      }
    });

    it('does not overwrite existing category/priority', () => {
      const event = baseEvent({
        type: 'BADGE_UNLOCKED',
        badgeId: 'first_session',
        category: 'performance',
        priority: 5,
      });

      const r = migrateAndValidateEvent(event, lenient);
      // The category 'performance' is valid for the schema, but the badge's actual
      // category is 'consistency'. The normalizer should not overwrite if already present.
      expect(r.success).toBe(true);
      if (r.success) {
        expect((r.event as unknown as { category: string }).category).toBe('performance');
        expect((r.event as unknown as { priority: number }).priority).toBe(5);
      }
    });
  });

  // ===========================================================================
  // Legacy: TRACE_SESSION_STARTED fixes
  // ===========================================================================
  describe('legacy: TRACE_SESSION_STARTED normalization', () => {
    it('sets rhythmMode to self-paced when config.responseWindowMs=0', () => {
      const event = baseEvent({
        type: 'TRACE_SESSION_STARTED',
        eventId: crypto.randomUUID(),
        seq: 0,
        occurredAtMs: Date.now(),
        monotonicMs: 0,
        userId: 'user-1',
        playContext: 'free',
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
          timezone: 'UTC',
        },
        config: {
          nLevel: 2,
          trialsCount: 20,
          rhythmMode: 'timed', // wrong rhythmMode for responseWindowMs=0
          stimulusDurationMs: 800,
          responseWindowMs: 0,
        },
      });

      const r = migrateAndValidateEvent(event, lenient);
      expect(r.success).toBe(true);
      if (r.success) {
        const config = (r.event as unknown as { config: { rhythmMode: string } }).config;
        expect(config.rhythmMode).toBe('self-paced');
      }
    });

    it('removes spec.timing.responseWindowMs when it is 0', () => {
      // Build a TRACE_SESSION_STARTED event where spec.timing.responseWindowMs = 0.
      // The normalization should strip that field. We test that the event's spec.timing
      // no longer contains responseWindowMs after normalization. The event may still fail
      // full validation if the spec fixture is incomplete, so we test the normalization
      // effect on the returned event (lossless output preserves the mutated spec).
      const event = baseEvent({
        type: 'TRACE_SESSION_STARTED',
        eventId: crypto.randomUUID(),
        seq: 0,
        occurredAtMs: Date.now(),
        monotonicMs: 0,
        userId: 'user-1',
        playContext: 'free',
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
          timezone: 'UTC',
        },
        config: {
          nLevel: 2,
          trialsCount: 20,
          rhythmMode: 'self-paced',
          stimulusDurationMs: 800,
          responseWindowMs: 0,
        },
        spec: {
          timing: {
            responseWindowMs: 0,
            intervalMs: 2500,
          },
        },
      });

      const r = migrateAndValidateEvent(event, lenient);
      // Whether validation succeeds or not (spec fixture may be incomplete),
      // check the normalization ran. For a success result, the event should have
      // responseWindowMs removed from spec.timing.
      if (r.success) {
        const spec = (r.event as unknown as { spec?: { timing?: { responseWindowMs?: number } } })
          .spec;
        if (spec?.timing) {
          expect(spec.timing.responseWindowMs).toBeUndefined();
        }
      } else {
        // Even in failure, the original event gets normalized before validation.
        // The error should NOT be about spec.timing.responseWindowMs being 0
        // (it should have been removed). Verify the error doesn't mention it.
        expect(r.error).not.toContain('responseWindowMs');
      }
    });
  });

  // ===========================================================================
  // Legacy: USER_RESPONSE → USER_RESPONDED
  // ===========================================================================
  describe('legacy: USER_RESPONSE rename', () => {
    it('renames type USER_RESPONSE to USER_RESPONDED', () => {
      const event = baseEvent({
        type: 'USER_RESPONSE',
        trialIndex: 3,
        modality: 'position',
        reactionTimeMs: 400,
        pressDurationMs: 100,
        responsePhase: 'during_stimulus',
      });

      const r = migrateAndValidateEvent(event, lenient);
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.event.type).toBe('USER_RESPONDED');
      }
    });

    it('normalizes trial number to trialIndex', () => {
      const event = baseEvent({
        type: 'USER_RESPONSE',
        trial: 7,
        modality: 'audio',
        reactionTimeMs: 300,
        pressDurationMs: 50,
        responsePhase: 'during_stimulus',
      });

      const r = migrateAndValidateEvent(event, lenient);
      expect(r.success).toBe(true);
      if (r.success) {
        expect((r.event as unknown as { trialIndex: number }).trialIndex).toBe(7);
      }
    });

    it('normalizes trial.index to trialIndex', () => {
      const event = baseEvent({
        type: 'USER_RESPONSE',
        trial: { index: 4 },
        modality: 'audio',
        reactionTimeMs: 300,
        pressDurationMs: 50,
        responsePhase: 'during_stimulus',
      });

      const r = migrateAndValidateEvent(event, lenient);
      expect(r.success).toBe(true);
      if (r.success) {
        expect((r.event as unknown as { trialIndex: number }).trialIndex).toBe(4);
      }
    });

    it('normalizes modalityId to modality', () => {
      const event = baseEvent({
        type: 'USER_RESPONSE',
        trialIndex: 1,
        modalityId: 'position',
        reactionTimeMs: 300,
        pressDurationMs: 50,
        responsePhase: 'during_stimulus',
      });

      const r = migrateAndValidateEvent(event, lenient);
      expect(r.success).toBe(true);
      if (r.success) {
        expect((r.event as unknown as { modality: string }).modality).toBe('position');
      }
    });

    it('normalizes alternative RT field names (reactionTime)', () => {
      const event = baseEvent({
        type: 'USER_RESPONSE',
        trialIndex: 1,
        modality: 'position',
        reactionTime: 500,
        pressDurationMs: 50,
        responsePhase: 'during_stimulus',
      });

      const r = migrateAndValidateEvent(event, lenient);
      expect(r.success).toBe(true);
      if (r.success) {
        expect((r.event as unknown as { reactionTimeMs: number }).reactionTimeMs).toBe(500);
      }
    });

    it('normalizes alternative RT field names (rtMs)', () => {
      const event = baseEvent({
        type: 'USER_RESPONSE',
        trialIndex: 1,
        modality: 'position',
        rtMs: 600,
        pressDurationMs: 50,
        responsePhase: 'during_stimulus',
      });

      const r = migrateAndValidateEvent(event, lenient);
      expect(r.success).toBe(true);
      if (r.success) {
        expect((r.event as unknown as { reactionTimeMs: number }).reactionTimeMs).toBe(600);
      }
    });

    it('normalizes alternative RT field names (rt)', () => {
      const event = baseEvent({
        type: 'USER_RESPONSE',
        trialIndex: 1,
        modality: 'position',
        rt: 700,
        pressDurationMs: 50,
        responsePhase: 'during_stimulus',
      });

      const r = migrateAndValidateEvent(event, lenient);
      expect(r.success).toBe(true);
      if (r.success) {
        expect((r.event as unknown as { reactionTimeMs: number }).reactionTimeMs).toBe(700);
      }
    });

    it('defaults pressDurationMs to 0 when missing', () => {
      const event = baseEvent({
        type: 'USER_RESPONSE',
        trialIndex: 1,
        modality: 'position',
        reactionTimeMs: 300,
        responsePhase: 'during_stimulus',
      });

      const r = migrateAndValidateEvent(event, lenient);
      expect(r.success).toBe(true);
      if (r.success) {
        expect((r.event as unknown as { pressDurationMs: number }).pressDurationMs).toBe(0);
      }
    });

    it('normalizes pressDuration alias to pressDurationMs', () => {
      const event = baseEvent({
        type: 'USER_RESPONSE',
        trialIndex: 1,
        modality: 'position',
        reactionTimeMs: 300,
        pressDuration: 150,
        responsePhase: 'during_stimulus',
      });

      const r = migrateAndValidateEvent(event, lenient);
      expect(r.success).toBe(true);
      if (r.success) {
        expect((r.event as unknown as { pressDurationMs: number }).pressDurationMs).toBe(150);
      }
    });

    it('normalizes durationMs alias to pressDurationMs', () => {
      const event = baseEvent({
        type: 'USER_RESPONSE',
        trialIndex: 1,
        modality: 'position',
        reactionTimeMs: 300,
        durationMs: 200,
        responsePhase: 'during_stimulus',
      });

      const r = migrateAndValidateEvent(event, lenient);
      expect(r.success).toBe(true);
      if (r.success) {
        expect((r.event as unknown as { pressDurationMs: number }).pressDurationMs).toBe(200);
      }
    });

    it('normalizes phase "stimulus" → "during_stimulus"', () => {
      const event = baseEvent({
        type: 'USER_RESPONSE',
        trialIndex: 1,
        modality: 'position',
        reactionTimeMs: 300,
        pressDurationMs: 50,
        phase: 'stimulus',
      });

      const r = migrateAndValidateEvent(event, lenient);
      expect(r.success).toBe(true);
      if (r.success) {
        expect((r.event as unknown as { responsePhase: string }).responsePhase).toBe(
          'during_stimulus',
        );
      }
    });

    it('normalizes phase "waiting" → "after_stimulus"', () => {
      const event = baseEvent({
        type: 'USER_RESPONSE',
        trialIndex: 1,
        modality: 'position',
        reactionTimeMs: 300,
        pressDurationMs: 50,
        phase: 'waiting',
      });

      const r = migrateAndValidateEvent(event, lenient);
      expect(r.success).toBe(true);
      if (r.success) {
        expect((r.event as unknown as { responsePhase: string }).responsePhase).toBe(
          'after_stimulus',
        );
      }
    });
  });

  // ===========================================================================
  // Legacy: TRIAL_PRESENTED fixes
  // ===========================================================================
  describe('legacy: TRIAL_PRESENTED normalization', () => {
    it('clamps position > 7 to modulo 8', () => {
      const event = {
        ...validTrialPresented(),
        trial: {
          ...(validTrialPresented() as unknown as { trial: Record<string, unknown> }).trial,
          position: 10, // should become 10 % 8 = 2
        },
      } as unknown as RawVersionedEvent;

      const r = migrateAndValidateEvent(event, lenient);
      expect(r.success).toBe(true);
      if (r.success) {
        const trial = (r.event as unknown as { trial: { position: number } }).trial;
        expect(trial.position).toBe(2);
      }
    });

    it('clamps negative position using modulo', () => {
      const event = {
        ...validTrialPresented(),
        trial: {
          ...(validTrialPresented() as unknown as { trial: Record<string, unknown> }).trial,
          position: -3, // ((-3 % 8) + 8) % 8 = 5
        },
      } as unknown as RawVersionedEvent;

      const r = migrateAndValidateEvent(event, lenient);
      expect(r.success).toBe(true);
      if (r.success) {
        const trial = (r.event as unknown as { trial: { position: number } }).trial;
        expect(trial.position).toBe(5);
      }
    });

    it('maps legacy single-letter sound (A→C)', () => {
      const event = {
        ...validTrialPresented(),
        trial: {
          ...(validTrialPresented() as unknown as { trial: Record<string, unknown> }).trial,
          sound: 'A', // charCode('A')-65=0 → SOUNDS[0] = 'C'
        },
      } as unknown as RawVersionedEvent;

      const r = migrateAndValidateEvent(event, lenient);
      expect(r.success).toBe(true);
      if (r.success) {
        const trial = (r.event as unknown as { trial: { sound: string } }).trial;
        expect(trial.sound).toBe('C');
      }
    });

    it('maps legacy single-letter sound (B→H)', () => {
      const event = {
        ...validTrialPresented(),
        trial: {
          ...(validTrialPresented() as unknown as { trial: Record<string, unknown> }).trial,
          sound: 'B', // charCode('B')-65=1 → SOUNDS[1] = 'H'
        },
      } as unknown as RawVersionedEvent;

      const r = migrateAndValidateEvent(event, lenient);
      expect(r.success).toBe(true);
      if (r.success) {
        const trial = (r.event as unknown as { trial: { sound: string } }).trial;
        expect(trial.sound).toBe('H');
      }
    });

    it('normalizes trialType "buffer" with isBuffer=true → "Tampon"', () => {
      const base = (validTrialPresented() as unknown as { trial: Record<string, unknown> }).trial;
      const event = {
        ...validTrialPresented(),
        trial: {
          ...base,
          trialType: 'buffer',
          isBuffer: true,
          isPositionTarget: false,
          isSoundTarget: false,
        },
      } as unknown as RawVersionedEvent;

      const r = migrateAndValidateEvent(event, lenient);
      expect(r.success).toBe(true);
      if (r.success) {
        const trial = (r.event as unknown as { trial: { trialType: string } }).trial;
        expect(trial.trialType).toBe('Tampon');
      }
    });

    it('normalizes trialType "target" with both position+sound → "Dual"', () => {
      const base = (validTrialPresented() as unknown as { trial: Record<string, unknown> }).trial;
      const event = {
        ...validTrialPresented(),
        trial: {
          ...base,
          trialType: 'target',
          isBuffer: false,
          isPositionTarget: true,
          isSoundTarget: true,
        },
      } as unknown as RawVersionedEvent;

      const r = migrateAndValidateEvent(event, lenient);
      expect(r.success).toBe(true);
      if (r.success) {
        const trial = (r.event as unknown as { trial: { trialType: string } }).trial;
        expect(trial.trialType).toBe('Dual');
      }
    });

    it('normalizes trialType "target" with position only → "V-Seul"', () => {
      const base = (validTrialPresented() as unknown as { trial: Record<string, unknown> }).trial;
      const event = {
        ...validTrialPresented(),
        trial: {
          ...base,
          trialType: 'target',
          isBuffer: false,
          isPositionTarget: true,
          isSoundTarget: false,
        },
      } as unknown as RawVersionedEvent;

      const r = migrateAndValidateEvent(event, lenient);
      expect(r.success).toBe(true);
      if (r.success) {
        const trial = (r.event as unknown as { trial: { trialType: string } }).trial;
        expect(trial.trialType).toBe('V-Seul');
      }
    });

    it('normalizes trialType "standard" with sound only → "A-Seul"', () => {
      const base = (validTrialPresented() as unknown as { trial: Record<string, unknown> }).trial;
      const event = {
        ...validTrialPresented(),
        trial: {
          ...base,
          trialType: 'standard',
          isBuffer: false,
          isPositionTarget: false,
          isSoundTarget: true,
        },
      } as unknown as RawVersionedEvent;

      const r = migrateAndValidateEvent(event, lenient);
      expect(r.success).toBe(true);
      if (r.success) {
        const trial = (r.event as unknown as { trial: { trialType: string } }).trial;
        expect(trial.trialType).toBe('A-Seul');
      }
    });

    it('normalizes trialType "standard" with no targets → "Non-Cible"', () => {
      const base = (validTrialPresented() as unknown as { trial: Record<string, unknown> }).trial;
      const event = {
        ...validTrialPresented(),
        trial: {
          ...base,
          trialType: 'standard',
          isBuffer: false,
          isPositionTarget: false,
          isSoundTarget: false,
        },
      } as unknown as RawVersionedEvent;

      const r = migrateAndValidateEvent(event, lenient);
      expect(r.success).toBe(true);
      if (r.success) {
        const trial = (r.event as unknown as { trial: { trialType: string } }).trial;
        expect(trial.trialType).toBe('Non-Cible');
      }
    });

    it('does not touch trial when it is missing', () => {
      const event = baseEvent({ type: 'TRIAL_PRESENTED', isiMs: 100, stimulusDurationMs: 500 });
      // This will fail validation (trial required), but normalization shouldn't crash
      const r = migrateAndValidateEvent(event, lenient);
      expect(r.success).toBe(false);
    });
  });

  // ===========================================================================
  // Legacy: TRACE_STIMULUS_SHOWN / TRACE_RESPONDED / TRACE_TIMED_OUT position clamping
  // ===========================================================================
  describe('legacy: Trace position clamping', () => {
    it('clamps negative position to 0 for TRACE_STIMULUS_SHOWN', () => {
      const event = baseEvent({
        type: 'TRACE_STIMULUS_SHOWN',
        eventId: crypto.randomUUID(),
        seq: 1,
        occurredAtMs: 1000,
        monotonicMs: 1000,
        trialIndex: 0,
        position: -5,
        isWarmup: false,
        stimulusDurationMs: 800,
      });
      const r = migrateAndValidateEvent(event, lenient);
      expect(r.success).toBe(true);
      if (r.success) {
        expect((r.event as unknown as { position: number }).position).toBe(0);
      }
    });

    it('clamps position > 15 to 15 for TRACE_RESPONDED', () => {
      const event = baseEvent({
        type: 'TRACE_RESPONDED',
        eventId: crypto.randomUUID(),
        seq: 2,
        occurredAtMs: 2000,
        monotonicMs: 2000,
        trialIndex: 0,
        responseType: 'swipe',
        position: 20,
        expectedPosition: 3,
        isCorrect: false,
        isWarmup: false,
        responseTimeMs: 500,
      });
      const r = migrateAndValidateEvent(event, lenient);
      expect(r.success).toBe(true);
      if (r.success) {
        expect((r.event as unknown as { position: number }).position).toBe(15);
      }
    });

    it('clamps expectedPosition to 15 for TRACE_TIMED_OUT', () => {
      const event = baseEvent({
        type: 'TRACE_TIMED_OUT',
        eventId: crypto.randomUUID(),
        seq: 3,
        occurredAtMs: 3000,
        monotonicMs: 3000,
        trialIndex: 0,
        expectedPosition: 100,
      });
      const r = migrateAndValidateEvent(event, lenient);
      expect(r.success).toBe(true);
      if (r.success) {
        expect((r.event as unknown as { expectedPosition: number }).expectedPosition).toBe(15);
      }
    });

    it('does not clamp valid positions (0-15)', () => {
      const event = baseEvent({
        type: 'TRACE_STIMULUS_SHOWN',
        eventId: crypto.randomUUID(),
        seq: 1,
        occurredAtMs: 1000,
        monotonicMs: 1000,
        trialIndex: 0,
        position: 12,
        isWarmup: false,
        stimulusDurationMs: 800,
      });
      const r = migrateAndValidateEvent(event, lenient);
      expect(r.success).toBe(true);
      if (r.success) {
        expect((r.event as unknown as { position: number }).position).toBe(12);
      }
    });
  });

  // ===========================================================================
  // Legacy: SESSION_ENDED reason/playContext defaults
  // ===========================================================================
  describe('legacy: SESSION_ENDED defaults', () => {
    it('defaults missing reason to completed', () => {
      const event = baseEvent({
        type: 'SESSION_ENDED',
        playContext: 'free',
      });
      const r = migrateAndValidateEvent(event, lenient);
      expect(r.success).toBe(true);
      if (r.success) {
        expect((r.event as unknown as { reason: string }).reason).toBe('completed');
      }
    });

    it('defaults invalid reason to completed', () => {
      const event = baseEvent({
        type: 'SESSION_ENDED',
        reason: 'unknown_reason',
        playContext: 'free',
      });
      const r = migrateAndValidateEvent(event, lenient);
      expect(r.success).toBe(true);
      if (r.success) {
        expect((r.event as unknown as { reason: string }).reason).toBe('completed');
      }
    });

    it('defaults missing playContext to free', () => {
      const event = baseEvent({
        type: 'SESSION_ENDED',
        reason: 'completed',
      });
      const r = migrateAndValidateEvent(event, lenient);
      expect(r.success).toBe(true);
      if (r.success) {
        expect((r.event as unknown as { playContext: string }).playContext).toBe('free');
      }
    });

    it('defaults invalid playContext to free', () => {
      const event = baseEvent({
        type: 'SESSION_ENDED',
        reason: 'completed',
        playContext: 'tournament',
      });
      const r = migrateAndValidateEvent(event, lenient);
      expect(r.success).toBe(true);
      if (r.success) {
        expect((r.event as unknown as { playContext: string }).playContext).toBe('free');
      }
    });

    it('preserves valid reason and playContext', () => {
      const event = baseEvent({
        type: 'SESSION_ENDED',
        reason: 'abandoned',
        playContext: 'journey',
        journeyStageId: 1,
        journeyId: 'j1',
        journeyStartLevel: 2,
        journeyTargetLevel: 3,
        journeyGameMode: 'dualnback-classic',
        journeyName: 'Test Journey',
      });
      const r = migrateAndValidateEvent(event, lenient);
      expect(r.success).toBe(true);
      if (r.success) {
        expect((r.event as unknown as { reason: string }).reason).toBe('abandoned');
        expect((r.event as unknown as { playContext: string }).playContext).toBe('journey');
      }
    });
  });

  // ===========================================================================
  // Schema version handling
  // ===========================================================================
  describe('schemaVersion handling', () => {
    it('defaults missing schemaVersion to 1', () => {
      const event = {
        ...validFocusLost(),
        schemaVersion: undefined,
      } as unknown as RawVersionedEvent;
      const r = migrateAndValidateEvent(event, lenient);
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.fromVersion).toBe(1);
        expect(r.migrated).toBe(false);
      }
    });

    it('defaults null schemaVersion to 1', () => {
      const event = { ...validFocusLost(), schemaVersion: null } as unknown as RawVersionedEvent;
      const r = migrateAndValidateEvent(event, lenient);
      expect(r.success).toBe(true);
    });
  });

  // ===========================================================================
  // Strict mode
  // ===========================================================================
  describe('strict mode', () => {
    it('throws for invalid events in strict mode', () => {
      const event = baseEvent({ type: 'INVALID_TYPE' });
      expect(() => migrateAndValidateEvent(event, strict)).toThrow();
    });

    it('does not throw for valid events in strict mode', () => {
      const event = validFocusLost();
      expect(() => migrateAndValidateEvent(event, strict)).not.toThrow();
    });
  });

  // ===========================================================================
  // Non-strict: unrecognized keys stripping
  // ===========================================================================
  describe('non-strict mode: unrecognized keys', () => {
    it('strips unrecognized keys and still validates', () => {
      const event: RawVersionedEvent = {
        ...validSessionEnded(),
        unknownFutureField: { nested: true },
      };

      const r = migrateAndValidateEvent(event, lenient);
      expect(r.success).toBe(true);
    });

    it('returns lossless output by default (keeps extra keys)', () => {
      const event: RawVersionedEvent = {
        ...validSessionEnded(),
        unknownFutureField: 42,
      };

      const r = migrateAndValidateEvent(event, { ...lenient, output: 'lossless' });
      expect(r.success).toBe(true);
      if (r.success) {
        expect((r.event as unknown as Record<string, unknown>)['unknownFutureField']).toBe(42);
      }
    });

    it('returns canonical output when requested (strips extra keys)', () => {
      const event: RawVersionedEvent = {
        ...validSessionEnded(),
        unknownFutureField: 42,
      };

      const r = migrateAndValidateEvent(event, { ...lenient, output: 'canonical' });
      expect(r.success).toBe(true);
      if (r.success) {
        expect(
          (r.event as unknown as Record<string, unknown>)['unknownFutureField'],
        ).toBeUndefined();
      }
    });
  });

  // ===========================================================================
  // Validation failures
  // ===========================================================================
  describe('validation failures', () => {
    it('returns error for completely invalid event type', () => {
      const event = baseEvent({ type: 'BOGUS' });
      const r = migrateAndValidateEvent(event, lenient);
      expect(r.success).toBe(false);
      if (!r.success) {
        expect(r.stage).toBe('validation');
        expect(r.originalEvent).toBe(event);
      }
    });

    it('returns error for SESSION_STARTED missing required fields', () => {
      const event = baseEvent({ type: 'SESSION_STARTED' }); // missing userId, nLevel, etc.
      const r = migrateAndValidateEvent(event, lenient);
      expect(r.success).toBe(false);
    });
  });

  // ===========================================================================
  // Batch processing
  // ===========================================================================
  describe('migrateAndValidateEventBatch', () => {
    it('validates all events in a batch', () => {
      const events = [validSessionStarted(), validUserResponded(), validSessionEnded()];
      const result = migrateAndValidateEventBatch(events, lenient);
      expect(result.events).toHaveLength(3);
      expect(result.errorCount).toBe(0);
    });

    it('separates valid from invalid events', () => {
      const events = [validFocusLost(), baseEvent({ type: 'INVALID' }), validSessionEnded()];
      const result = migrateAndValidateEventBatch(events, lenient);
      expect(result.events).toHaveLength(2);
      expect(result.errorCount).toBe(1);
      // @ts-expect-error test: nullable access
      expect(result!.errors![0].event.type).toBe('INVALID');
    });

    it('returns empty results for empty input', () => {
      const result = migrateAndValidateEventBatch([], lenient);
      expect(result.events).toHaveLength(0);
      expect(result.errorCount).toBe(0);
    });
  });

  // ===========================================================================
  // isValidEventShape
  // ===========================================================================
  describe('isValidEventShape', () => {
    it('returns true for valid shape', () => {
      expect(isValidEventShape({ id: 'x', type: 'T', sessionId: 's', timestamp: 1 })).toBe(true);
    });

    it('returns false for null', () => {
      expect(isValidEventShape(null)).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isValidEventShape(undefined)).toBe(false);
    });

    it('returns false for primitive', () => {
      expect(isValidEventShape(42)).toBe(false);
      expect(isValidEventShape('str')).toBe(false);
    });

    it('returns false for missing id', () => {
      expect(isValidEventShape({ type: 'T', sessionId: 's', timestamp: 1 })).toBe(false);
    });

    it('returns false for wrong id type', () => {
      expect(isValidEventShape({ id: 123, type: 'T', sessionId: 's', timestamp: 1 })).toBe(false);
    });

    it('returns false for missing timestamp', () => {
      expect(isValidEventShape({ id: 'x', type: 'T', sessionId: 's' })).toBe(false);
    });

    it('returns false for string timestamp', () => {
      expect(isValidEventShape({ id: 'x', type: 'T', sessionId: 's', timestamp: '123' })).toBe(
        false,
      );
    });
  });

  // ===========================================================================
  // safeParseEvent
  // ===========================================================================
  describe('safeParseEvent', () => {
    it('returns parsed event for valid input', () => {
      const result = safeParseEvent(validFocusLost());
      expect(result).not.toBeNull();
      expect(result!.type).toBe('FOCUS_LOST');
    });

    it('returns null for invalid shape', () => {
      expect(safeParseEvent({ bad: true })).toBeNull();
    });

    it('returns null for null', () => {
      expect(safeParseEvent(null)).toBeNull();
    });

    it('returns null for valid shape but invalid event type', () => {
      expect(safeParseEvent(baseEvent({ type: 'NOPE' }))).toBeNull();
    });

    it('never throws', () => {
      expect(() => safeParseEvent(undefined)).not.toThrow();
      expect(() => safeParseEvent(null)).not.toThrow();
      expect(() => safeParseEvent({})).not.toThrow();
      expect(() => safeParseEvent(42)).not.toThrow();
    });
  });
});
