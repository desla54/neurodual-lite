/**
 * Property-Based Tests for UPSProjector
 *
 * Invariants that must hold regardless of input:
 * - UPS score is always bounded [0, 100]
 * - Same events produce same UPS (determinism)
 * - Mode detection is consistent
 * - Tier thresholds are respected
 */
import { describe, expect, it } from 'bun:test';
import * as fc from 'fast-check';
import { UPSProjector } from './ups-projector';
import { generateId } from '../domain';
import { createMockEvent } from '../test-utils/test-factories';
import type { GameEvent, SessionStartedEvent, SessionEndedEvent } from './events';

// =============================================================================
// Event Factories using createMockEvent
// =============================================================================

const createSessionStarted = (
  sessionId: string,
  nLevel: number,
  timestamp: number,
): SessionStartedEvent =>
  createMockEvent('SESSION_STARTED', {
    id: generateId(),
    timestamp,
    sessionId,
    userId: 'test-user',
    nLevel,
    gameMode: 'dualnback-classic',
    device: {
      platform: 'web',
      screenWidth: 1920,
      screenHeight: 1080,
      userAgent: 'Test',
      touchCapable: false,
    },
    context: {
      timeOfDay: 'afternoon',
      localHour: 14,
      dayOfWeek: 3,
      timezone: 'Europe/Paris',
    },
    config: {
      nLevel,
      activeModalities: ['position', 'audio'],
      trialsCount: 20,
      targetProbability: 0.25,
      lureProbability: 0.15,
      intervalSeconds: 2.5,
      stimulusDurationSeconds: 0.5,
      // @ts-expect-error test override
      generator: 'adaptive',
    },
  }) as SessionStartedEvent;

const createSessionEnded = (
  sessionId: string,
  timestamp: number,
  stats: { hits: number; misses: number; fa: number; cr: number },
  reason: 'completed' | 'abandoned' = 'completed',
): SessionEndedEvent =>
  createMockEvent('SESSION_ENDED', {
    id: generateId(),
    timestamp,
    sessionId,
    reason,
    // @ts-expect-error test override
    totalTrials: stats.hits + stats.misses + stats.fa + stats.cr,
    durationMs: 60000,
    finalStats: {
      byModality: {
        position: {
          hits: stats.hits,
          misses: stats.misses,
          falseAlarms: stats.fa,
          correctRejections: stats.cr,
          dPrime: 1.5,
        },
      },
    },
  }) as SessionEndedEvent;

const createTrialPresented = (
  sessionId: string,
  trialIndex: number,
  timestamp: number,
  isTarget: boolean,
): GameEvent =>
  createMockEvent('TRIAL_PRESENTED', {
    id: generateId(),
    timestamp,
    sessionId,
    trial: {
      index: trialIndex,
      isBuffer: trialIndex < 2,
      position: (trialIndex % 8) as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7,
      sound: 'C',
      // @ts-expect-error test override
      color: 'blue',
      // @ts-expect-error test override
      trialType: isTarget ? 'Cible' : 'Non-Cible',
      isPositionTarget: isTarget,
      isSoundTarget: false,
      isColorTarget: false,
      // @ts-expect-error test override
      image: null,
      isImageTarget: false,
      isPositionLure: false,
      isSoundLure: false,
      isColorLure: false,
      isImageLure: false,
      lureType: null,
      positionNBack: null,
      soundNBack: null,
      colorNBack: null,
      imageNBack: null,
    },
    isiMs: 2500,
    stimulusDurationMs: 500,
  });

const createUserResponse = (sessionId: string, trialIndex: number, timestamp: number): GameEvent =>
  createMockEvent('USER_RESPONDED', {
    id: generateId(),
    timestamp,
    sessionId,
    trialIndex,
    modality: 'position',
    reactionTimeMs: 350,
    pressDurationMs: 120,
    responsePhase: 'during_stimulus',
  });

// =============================================================================
// Session Generator
// =============================================================================

type Outcome = 'hit' | 'miss' | 'fa' | 'cr';
const outcomeArb = fc.constantFrom('hit', 'miss', 'fa', 'cr') as fc.Arbitrary<Outcome>;

const generateTempoSession = (
  sessionId: string,
  nLevel: number,
  outcomes: Outcome[],
  completed: boolean,
): GameEvent[] => {
  const events: GameEvent[] = [];
  let ts = Date.now();

  events.push(createSessionStarted(sessionId, nLevel, ts));
  ts += 100;

  let hits = 0;
  let misses = 0;
  let fa = 0;
  let cr = 0;

  for (let i = 0; i < outcomes.length; i++) {
    const outcome = outcomes[i];
    const isTarget = outcome === 'hit' || outcome === 'miss';
    const shouldRespond = outcome === 'hit' || outcome === 'fa';

    events.push(createTrialPresented(sessionId, i, ts, isTarget));
    ts += 500;

    if (shouldRespond) {
      events.push(createUserResponse(sessionId, i, ts));
    }
    ts += 2500;

    if (outcome === 'hit') hits++;
    else if (outcome === 'miss') misses++;
    else if (outcome === 'fa') fa++;
    else cr++;
  }

  events.push(
    createSessionEnded(
      sessionId,
      ts,
      { hits, misses, fa, cr },
      completed ? 'completed' : 'abandoned',
    ),
  );

  return events;
};

// =============================================================================
// Property Tests
// =============================================================================

describe('UPSProjector - Property Tests', () => {
  describe('Score Bounds Invariants', () => {
    it('UPS score is always in [0, 100]', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          fc.integer({ min: 1, max: 8 }),
          fc.array(outcomeArb, { minLength: 5, maxLength: 30 }),
          fc.boolean(),
          (sessionId, nLevel, outcomes, completed) => {
            const events = generateTempoSession(sessionId, nLevel, outcomes, completed);
            const result = UPSProjector.project(events);

            if (!result) return true;

            return (
              result.ups.score >= 0 && result.ups.score <= 100 && Number.isInteger(result.ups.score)
            );
          },
        ),
        { numRuns: 100 },
      );
    });

    it('UPS accuracy is always in [0, 100]', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          fc.integer({ min: 1, max: 8 }),
          fc.array(outcomeArb, { minLength: 5, maxLength: 20 }),
          (sessionId, nLevel, outcomes) => {
            const events = generateTempoSession(sessionId, nLevel, outcomes, true);
            const result = UPSProjector.project(events);

            if (!result) return true;

            return result.ups.components.accuracy >= 0 && result.ups.components.accuracy <= 100;
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('Determinism Invariants', () => {
    it('same events produce identical UPS', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          fc.integer({ min: 1, max: 8 }),
          fc.array(outcomeArb, { minLength: 5, maxLength: 15 }),
          (sessionId, nLevel, outcomes) => {
            const events = generateTempoSession(sessionId, nLevel, outcomes, true);

            const r1 = UPSProjector.project(events);
            const r2 = UPSProjector.project(events);
            const r3 = UPSProjector.project(events);

            if (!r1 || !r2 || !r3) return r1 === r2 && r2 === r3;

            return (
              r1.ups.score === r2.ups.score &&
              r2.ups.score === r3.ups.score &&
              r1.ups.tier === r2.ups.tier &&
              r2.ups.tier === r3.ups.tier
            );
          },
        ),
        { numRuns: 50 },
      );
    });

    it('getScore equals project().ups.score', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          fc.integer({ min: 1, max: 8 }),
          fc.array(outcomeArb, { minLength: 5, maxLength: 15 }),
          (sessionId, nLevel, outcomes) => {
            const events = generateTempoSession(sessionId, nLevel, outcomes, true);

            const fullResult = UPSProjector.project(events);
            const scoreOnly = UPSProjector.getScore(events);

            if (!fullResult) return scoreOnly === null;

            return fullResult.ups.score === scoreOnly;
          },
        ),
        { numRuns: 30 },
      );
    });
  });

  describe('Mode Detection Invariants', () => {
    it('SESSION_STARTED detects tempo mode', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          fc.integer({ min: 1, max: 8 }),
          fc.array(outcomeArb, { minLength: 3, maxLength: 10 }),
          (sessionId, nLevel, outcomes) => {
            const events = generateTempoSession(sessionId, nLevel, outcomes, true);
            const mode = UPSProjector.detectMode(events);
            return mode === 'tempo';
          },
        ),
        { numRuns: 30 },
      );
    });

    it('empty events returns unknown mode', () => {
      expect(UPSProjector.detectMode([])).toBe('unknown');
    });

    it('mode detection matches projection mode', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          fc.integer({ min: 1, max: 8 }),
          fc.array(outcomeArb, { minLength: 5, maxLength: 15 }),
          (sessionId, nLevel, outcomes) => {
            const events = generateTempoSession(sessionId, nLevel, outcomes, true);

            const detected = UPSProjector.detectMode(events);
            const result = UPSProjector.project(events);

            if (!result) return detected === 'unknown';

            return result.mode === detected;
          },
        ),
        { numRuns: 30 },
      );
    });
  });

  describe('Tier Threshold Invariants', () => {
    it('tier is always valid', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          fc.integer({ min: 1, max: 8 }),
          fc.array(outcomeArb, { minLength: 5, maxLength: 20 }),
          (sessionId, nLevel, outcomes) => {
            const events = generateTempoSession(sessionId, nLevel, outcomes, true);
            const result = UPSProjector.project(events);

            if (!result) return true;

            const validTiers = ['novice', 'intermediate', 'advanced', 'elite'];
            return validTiers.includes(result.ups.tier);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('tier matches score thresholds', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          fc.integer({ min: 1, max: 8 }),
          fc.array(outcomeArb, { minLength: 5, maxLength: 20 }),
          (sessionId, nLevel, outcomes) => {
            const events = generateTempoSession(sessionId, nLevel, outcomes, true);
            const result = UPSProjector.project(events);

            if (!result) return true;

            const { score, tier } = result.ups;

            if (score < 70) return tier === 'novice';
            if (score < 80) return tier === 'intermediate';
            if (score < 90) return tier === 'advanced';
            return tier === 'elite';
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('Data Preservation Invariants', () => {
    it('sessionId is preserved', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          fc.integer({ min: 1, max: 8 }),
          fc.array(outcomeArb, { minLength: 5, maxLength: 10 }),
          (sessionId, nLevel, outcomes) => {
            const events = generateTempoSession(sessionId, nLevel, outcomes, true);
            const result = UPSProjector.project(events);

            if (!result) return true;

            return result.sessionId === sessionId;
          },
        ),
        { numRuns: 30 },
      );
    });

    it('nLevel is preserved', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          fc.integer({ min: 1, max: 8 }),
          fc.array(outcomeArb, { minLength: 5, maxLength: 10 }),
          (sessionId, nLevel, outcomes) => {
            const events = generateTempoSession(sessionId, nLevel, outcomes, true);
            const result = UPSProjector.project(events);

            if (!result) return true;

            return result.nLevel === nLevel;
          },
        ),
        { numRuns: 30 },
      );
    });

    it('completed flag matches reason', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          fc.integer({ min: 1, max: 8 }),
          fc.array(outcomeArb, { minLength: 5, maxLength: 10 }),
          fc.boolean(),
          (sessionId, nLevel, outcomes, completed) => {
            const events = generateTempoSession(sessionId, nLevel, outcomes, completed);
            const result = UPSProjector.project(events);

            if (!result) return true;

            return result.completed === completed;
          },
        ),
        { numRuns: 30 },
      );
    });
  });
});
