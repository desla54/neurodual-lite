/**
 * Property-Based Tests for Session Summary Projection
 *
 * Comprehensive tests for SessionProjector invariants that must hold
 * regardless of input events:
 *
 * 1. Summary always has valid session ID
 * 2. Score calculations are deterministic
 * 3. Trial counts match original data
 * 4. Timestamps are valid
 * 5. Modality stats are consistent
 * 6. UPS score bounds
 * 7. d-prime bounds and consistency
 * 8. Running stats accumulation correctness
 * 9. Focus event tracking
 * 10. Timing stats validity
 */
import { describe, expect, it } from 'bun:test';
import * as fc from 'fast-check';
import { SessionProjector, extractTempoResponseData } from './session-projector';
import { generateId } from '../domain';
import { createMockEvent } from '../test-utils/test-factories';
import type {
  GameEvent,
  SessionStartedEvent,
  SessionEndedEvent,
  TrialPresentedEvent,
  UserResponseEvent,
  FocusLostEvent,
  FocusRegainedEvent,
  TrialOutcome,
} from './events';
import type { ModalityId, TrialResult } from '../types/core';

// =============================================================================
// Arbitraries
// =============================================================================

const timestampArb = fc.integer({ min: 1000000000000, max: 2000000000000 });
const nLevelArb = fc.integer({ min: 1, max: 8 });
const trialsCountArb = fc.integer({ min: 5, max: 50 });
const durationMsArb = fc.integer({ min: 1000, max: 300000 });
const reactionTimeArb = fc.integer({ min: 100, max: 2500 });
const pressDurationArb = fc.integer({ min: 50, max: 500 });
const isiMsArb = fc.integer({ min: 1000, max: 5000 });
const stimulusDurationMsArb = fc.integer({ min: 300, max: 1000 });

type Outcome = 'hit' | 'miss' | 'fa' | 'cr';
const outcomeArb = fc.constantFrom('hit', 'miss', 'fa', 'cr') as fc.Arbitrary<Outcome>;

const modalityArb = fc.constantFrom('position', 'audio', 'color') as fc.Arbitrary<ModalityId>;

const activemodalitiesArb = fc
  .array(modalityArb, { minLength: 1, maxLength: 3 })
  .map((arr) => [...new Set(arr)] as ModalityId[]);

const gameModeArb = fc.constantFrom('dualnback-classic', 'sim-brainworkshop');

// =============================================================================
// Event Factories
// =============================================================================

const createSessionStarted = (
  sessionId: string,
  nLevel: number,
  timestamp: number,
  activeModalities: readonly ModalityId[] = ['position', 'audio'],
  gameMode = 'dualnback-classic',
): SessionStartedEvent =>
  createMockEvent('SESSION_STARTED', {
    id: generateId(),
    timestamp,
    sessionId,
    userId: 'test-user',
    nLevel,
    // @ts-expect-error test override
    gameMode,
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
      activeModalities: activeModalities as ModalityId[],
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
  reason: 'completed' | 'abandoned' = 'completed',
): SessionEndedEvent =>
  createMockEvent('SESSION_ENDED', {
    id: generateId(),
    timestamp,
    sessionId,
    reason,
  }) as SessionEndedEvent;

const createTrialPresented = (
  sessionId: string,
  trialIndex: number,
  timestamp: number,
  isPositionTarget: boolean,
  isAudioTarget: boolean,
  isBuffer: boolean,
  isiMs: number,
  stimulusDurationMs: number,
): TrialPresentedEvent =>
  createMockEvent('TRIAL_PRESENTED', {
    id: generateId(),
    timestamp,
    sessionId,
    trial: {
      index: trialIndex,
      isBuffer,
      position: (trialIndex % 8) as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7,
      sound: 'C',
      // @ts-expect-error test override
      color: 'blue',
      // @ts-expect-error test override
      trialType: isPositionTarget || isAudioTarget ? 'Cible' : 'Non-Cible',
      isPositionTarget,
      isSoundTarget: isAudioTarget,
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
    isiMs,
    stimulusDurationMs,
  }) as TrialPresentedEvent;

const createUserResponse = (
  sessionId: string,
  trialIndex: number,
  timestamp: number,
  modality: ModalityId,
  reactionTimeMs: number,
  pressDurationMs: number,
): UserResponseEvent =>
  createMockEvent('USER_RESPONDED', {
    id: generateId(),
    timestamp,
    sessionId,
    trialIndex,
    modality,
    reactionTimeMs,
    pressDurationMs,
    responsePhase: 'during_stimulus',
  }) as UserResponseEvent;

const createFocusLost = (
  sessionId: string,
  timestamp: number,
  trialIndex: number | null,
): FocusLostEvent =>
  createMockEvent('FOCUS_LOST', {
    id: generateId(),
    timestamp,
    sessionId,
    trialIndex,
    phase: 'stimulus',
  }) as FocusLostEvent;

const createFocusRegained = (
  sessionId: string,
  timestamp: number,
  trialIndex: number | null,
  lostDurationMs: number,
): FocusRegainedEvent =>
  createMockEvent('FOCUS_REGAINED', {
    id: generateId(),
    timestamp,
    sessionId,
    trialIndex,
    lostDurationMs,
  }) as FocusRegainedEvent;

// =============================================================================
// Session Generator
// =============================================================================

interface TrialConfig {
  isPositionTarget: boolean;
  isAudioTarget: boolean;
  positionPressed: boolean;
  audioPressed: boolean;
  isiMs: number;
  stimulusDurationMs: number;
  reactionTimeMs: number;
  pressDurationMs: number;
}

const trialConfigArb: fc.Arbitrary<TrialConfig> = fc.record({
  isPositionTarget: fc.boolean(),
  isAudioTarget: fc.boolean(),
  positionPressed: fc.boolean(),
  audioPressed: fc.boolean(),
  isiMs: isiMsArb,
  stimulusDurationMs: stimulusDurationMsArb,
  reactionTimeMs: reactionTimeArb,
  pressDurationMs: pressDurationArb,
});

const generateSession = (
  sessionId: string,
  nLevel: number,
  trialsConfig: readonly TrialConfig[],
  completed: boolean,
  activeModalities: readonly ModalityId[] = ['position', 'audio'],
  gameMode = 'dualnback-classic',
  focusLostCount = 0,
): GameEvent[] => {
  const events: GameEvent[] = [];
  let ts = Date.now();

  events.push(createSessionStarted(sessionId, nLevel, ts, activeModalities, gameMode));
  ts += 100;

  // Buffer trials (nLevel trials)
  for (let i = 0; i < nLevel; i++) {
    events.push(createTrialPresented(sessionId, i, ts, false, false, true, 2500, 500));
    ts += 3000;
  }

  // Real trials
  for (let i = 0; i < trialsConfig.length; i++) {
    const config = trialsConfig[i];
    const trialIndex = nLevel + i;

    events.push(
      createTrialPresented(
        sessionId,
        trialIndex,
        ts,
        config!.isPositionTarget,
        config!.isAudioTarget,
        false,
        config!.isiMs,
        config!.stimulusDurationMs,
      ),
    );
    ts += config!.stimulusDurationMs;

    if (config!.positionPressed && activeModalities.includes('position')) {
      events.push(
        createUserResponse(
          sessionId,
          trialIndex,
          ts,
          'position',
          config!.reactionTimeMs,
          config!.pressDurationMs,
        ),
      );
    }

    if (config!.audioPressed && activeModalities.includes('audio')) {
      events.push(
        createUserResponse(
          sessionId,
          trialIndex,
          ts + 50,
          'audio',
          config!.reactionTimeMs + 50,
          config!.pressDurationMs,
        ),
      );
    }

    ts += config!.isiMs - config!.stimulusDurationMs;
  }

  // Add focus lost/regained events
  for (let i = 0; i < focusLostCount; i++) {
    events.push(createFocusLost(sessionId, ts, nLevel + i));
    ts += 1000;
    events.push(createFocusRegained(sessionId, ts, nLevel + i, 1000));
    ts += 100;
  }

  events.push(createSessionEnded(sessionId, ts, completed ? 'completed' : 'abandoned'));

  return events;
};

// =============================================================================
// Property Tests - Basic Invariants
// =============================================================================

describe('SessionProjector - Property Tests', () => {
  describe('Session ID Invariants', () => {
    it('summary.sessionId always matches input session ID', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 3, maxLength: 20 }),
          fc.boolean(),
          (sessionId, nLevel, trials, completed) => {
            const events = generateSession(sessionId, nLevel, trials, completed);
            const summary = SessionProjector.project(events);

            if (!summary) return true;
            return summary.sessionId === sessionId;
          },
        ),
        { numRuns: 100 },
      );
    });

    it('summary.sessionId is never empty', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 3, maxLength: 15 }),
          (sessionId, nLevel, trials) => {
            const events = generateSession(sessionId, nLevel, trials, true);
            const summary = SessionProjector.project(events);

            if (!summary) return true;
            return summary.sessionId.length > 0;
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  describe('Determinism Invariants', () => {
    it('same events produce identical summary', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 5, maxLength: 15 }),
          (sessionId, nLevel, trials) => {
            const events = generateSession(sessionId, nLevel, trials, true);

            const s1 = SessionProjector.project(events);
            const s2 = SessionProjector.project(events);
            const s3 = SessionProjector.project(events);

            if (!s1 || !s2 || !s3) return s1 === s2 && s2 === s3;

            return (
              s1.sessionId === s2.sessionId &&
              s2.sessionId === s3.sessionId &&
              s1.nLevel === s2.nLevel &&
              s2.nLevel === s3.nLevel &&
              s1.totalTrials === s2.totalTrials &&
              s2.totalTrials === s3.totalTrials &&
              s1.finalStats.globalDPrime === s2.finalStats.globalDPrime &&
              s2.finalStats.globalDPrime === s3.finalStats.globalDPrime &&
              s1.passed === s2.passed &&
              s2.passed === s3.passed
            );
          },
        ),
        { numRuns: 50 },
      );
    });

    it('project is idempotent on outcomes', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 5, maxLength: 10 }),
          (sessionId, nLevel, trials) => {
            const events = generateSession(sessionId, nLevel, trials, true);

            const s1 = SessionProjector.project(events);
            const s2 = SessionProjector.project(events);

            if (!s1 || !s2) return s1 === s2;

            return (
              s1.outcomes.length === s2.outcomes.length &&
              s1.outcomes.every((o, i) => {
                const o2 = s2.outcomes[i];
                return o.trialIndex === o2!.trialIndex;
              })
            );
          },
        ),
        { numRuns: 30 },
      );
    });
  });

  describe('Trial Count Invariants', () => {
    it('totalTrials equals buffer + real trials', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 3, maxLength: 20 }),
          (sessionId, nLevel, trials) => {
            const events = generateSession(sessionId, nLevel, trials, true);
            const summary = SessionProjector.project(events);

            if (!summary) return true;

            const expectedTotal = nLevel + trials.length;
            return summary.totalTrials === expectedTotal;
          },
        ),
        { numRuns: 100 },
      );
    });

    it('outcomes length equals real trials (excluding buffers)', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 5, maxLength: 25 }),
          (sessionId, nLevel, trials) => {
            const events = generateSession(sessionId, nLevel, trials, true);
            const summary = SessionProjector.project(events);

            if (!summary) return true;

            return summary.outcomes.length === trials.length;
          },
        ),
        { numRuns: 100 },
      );
    });

    it('finalStats.trialsCompleted equals outcomes.length', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 5, maxLength: 15 }),
          (sessionId, nLevel, trials) => {
            const events = generateSession(sessionId, nLevel, trials, true);
            const summary = SessionProjector.project(events);

            if (!summary) return true;

            return summary.finalStats.trialsCompleted === summary.outcomes.length;
          },
        ),
        { numRuns: 100 },
      );
    });

    it('totalTrials is always non-negative', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 0, maxLength: 15 }),
          (sessionId, nLevel, trials) => {
            const events = generateSession(sessionId, nLevel, trials, true);
            const summary = SessionProjector.project(events);

            if (!summary) return true;
            return summary.totalTrials >= 0;
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  describe('Timestamp Invariants', () => {
    it('durationMs is non-negative', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 3, maxLength: 15 }),
          fc.boolean(),
          (sessionId, nLevel, trials, completed) => {
            const events = generateSession(sessionId, nLevel, trials, completed);
            const summary = SessionProjector.project(events);

            if (!summary) return true;
            return summary.durationMs >= 0;
          },
        ),
        { numRuns: 100 },
      );
    });

    it('durationMs equals end - start timestamp', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 5, maxLength: 10 }),
          (sessionId, nLevel, trials) => {
            const events = generateSession(sessionId, nLevel, trials, true);
            const summary = SessionProjector.project(events);

            if (!summary) return true;

            const startEvent = events.find((e) => e.type === 'SESSION_STARTED');
            const endEvent = events.find((e) => e.type === 'SESSION_ENDED');

            if (!startEvent || !endEvent) return true;

            return summary.durationMs === endEvent.timestamp - startEvent.timestamp;
          },
        ),
        { numRuns: 50 },
      );
    });

    it('totalFocusLostMs is non-negative', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 3, maxLength: 10 }),
          fc.integer({ min: 0, max: 5 }),
          (sessionId, nLevel, trials, focusLostCount) => {
            const events = generateSession(
              sessionId,
              nLevel,
              trials,
              true,
              ['position', 'audio'],
              'dualnback-classic',
              focusLostCount,
            );
            const summary = SessionProjector.project(events);

            if (!summary) return true;
            return summary.totalFocusLostMs >= 0;
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  describe('Modality Stats Invariants', () => {
    it('byModality contains all active modalities', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 5, maxLength: 15 }),
          activemodalitiesArb,
          (sessionId, nLevel, trials, modalities) => {
            const events = generateSession(sessionId, nLevel, trials, true, modalities);
            const summary = SessionProjector.project(events);

            if (!summary) return true;

            return modalities.every((m) => summary.finalStats.byModality[m] !== undefined);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('modality stats counts are non-negative', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 5, maxLength: 15 }),
          (sessionId, nLevel, trials) => {
            const events = generateSession(sessionId, nLevel, trials, true);
            const summary = SessionProjector.project(events);

            if (!summary) return true;

            for (const stats of Object.values(summary.finalStats.byModality)) {
              if (
                stats.hits < 0 ||
                stats.misses < 0 ||
                stats.falseAlarms < 0 ||
                stats.correctRejections < 0
              ) {
                return false;
              }
            }
            return true;
          },
        ),
        { numRuns: 100 },
      );
    });

    it('modality stats sum equals trials completed', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 5, maxLength: 15 }),
          (sessionId, nLevel, trials) => {
            const events = generateSession(sessionId, nLevel, trials, true);
            const summary = SessionProjector.project(events);

            if (!summary) return true;

            for (const stats of Object.values(summary.finalStats.byModality)) {
              const total = stats.hits + stats.misses + stats.falseAlarms + stats.correctRejections;
              if (total !== summary.finalStats.trialsCompleted) {
                return false;
              }
            }
            return true;
          },
        ),
        { numRuns: 100 },
      );
    });

    it('avgRT is null or positive', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 5, maxLength: 15 }),
          (sessionId, nLevel, trials) => {
            const events = generateSession(sessionId, nLevel, trials, true);
            const summary = SessionProjector.project(events);

            if (!summary) return true;

            for (const stats of Object.values(summary.finalStats.byModality)) {
              if (stats.avgRT !== null && stats.avgRT < 0) {
                return false;
              }
            }
            return true;
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('D-Prime Invariants', () => {
    it('globalDPrime is finite', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 5, maxLength: 20 }),
          (sessionId, nLevel, trials) => {
            const events = generateSession(sessionId, nLevel, trials, true);
            const summary = SessionProjector.project(events);

            if (!summary) return true;

            return Number.isFinite(summary.finalStats.globalDPrime);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('globalDPrime is bounded (typically -4 to 4)', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 5, maxLength: 20 }),
          (sessionId, nLevel, trials) => {
            const events = generateSession(sessionId, nLevel, trials, true);
            const summary = SessionProjector.project(events);

            if (!summary) return true;

            // d' typically bounded by probit function limits
            return summary.finalStats.globalDPrime >= -5 && summary.finalStats.globalDPrime <= 5;
          },
        ),
        { numRuns: 100 },
      );
    });

    it('modality dPrimes are all finite', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 5, maxLength: 15 }),
          (sessionId, nLevel, trials) => {
            const events = generateSession(sessionId, nLevel, trials, true);
            const summary = SessionProjector.project(events);

            if (!summary) return true;

            for (const stats of Object.values(summary.finalStats.byModality)) {
              if (!Number.isFinite(stats.dPrime)) {
                return false;
              }
            }
            return true;
          },
        ),
        { numRuns: 100 },
      );
    });

    it('globalDPrime is average of modality dPrimes', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 5, maxLength: 15 }),
          (sessionId, nLevel, trials) => {
            const events = generateSession(sessionId, nLevel, trials, true);
            const summary = SessionProjector.project(events);

            if (!summary) return true;

            const modalityDPrimes = Object.values(summary.finalStats.byModality).map(
              (s) => s.dPrime,
            );

            if (modalityDPrimes.length === 0) return true;

            const avgDPrime = modalityDPrimes.reduce((a, b) => a + b, 0) / modalityDPrimes.length;

            return Math.abs(summary.finalStats.globalDPrime - avgDPrime) < 0.001;
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  describe('NLevel Invariants', () => {
    it('summary.nLevel matches session config', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 5, maxLength: 15 }),
          (sessionId, nLevel, trials) => {
            const events = generateSession(sessionId, nLevel, trials, true);
            const summary = SessionProjector.project(events);

            if (!summary) return true;
            return summary.nLevel === nLevel;
          },
        ),
        { numRuns: 100 },
      );
    });

    it('nLevel is always positive', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 3, maxLength: 10 }),
          (sessionId, nLevel, trials) => {
            const events = generateSession(sessionId, nLevel, trials, true);
            const summary = SessionProjector.project(events);

            if (!summary) return true;
            return summary.nLevel > 0;
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  describe('Passed Invariants', () => {
    it('passed is always boolean', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 5, maxLength: 15 }),
          gameModeArb,
          (sessionId, nLevel, trials, gameMode) => {
            const events = generateSession(
              sessionId,
              nLevel,
              trials,
              true,
              ['position', 'audio'],
              gameMode,
            );
            const summary = SessionProjector.project(events);

            if (!summary) return true;
            return typeof summary.passed === 'boolean';
          },
        ),
        { numRuns: 100 },
      );
    });

    it('passed is deterministic for same events', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 5, maxLength: 15 }),
          (sessionId, nLevel, trials) => {
            const events = generateSession(sessionId, nLevel, trials, true);

            const s1 = SessionProjector.project(events);
            const s2 = SessionProjector.project(events);

            if (!s1 || !s2) return s1 === s2;
            return s1.passed === s2.passed;
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  describe('Timing Stats Invariants', () => {
    it('isiStats.min <= isiStats.avg <= isiStats.max', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 5, maxLength: 15 }),
          (sessionId, nLevel, trials) => {
            const events = generateSession(sessionId, nLevel, trials, true);
            const summary = SessionProjector.project(events);

            if (!summary) return true;
            if (summary.isiStats.values.length === 0) return true;

            return (
              summary.isiStats.min <= summary.isiStats.avg &&
              summary.isiStats.avg <= summary.isiStats.max
            );
          },
        ),
        { numRuns: 100 },
      );
    });

    it('stimulusDurationStats bounds are valid', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 5, maxLength: 15 }),
          (sessionId, nLevel, trials) => {
            const events = generateSession(sessionId, nLevel, trials, true);
            const summary = SessionProjector.project(events);

            if (!summary) return true;
            if (summary.stimulusDurationStats.values.length === 0) return true;

            return (
              summary.stimulusDurationStats.min <= summary.stimulusDurationStats.avg &&
              summary.stimulusDurationStats.avg <= summary.stimulusDurationStats.max
            );
          },
        ),
        { numRuns: 100 },
      );
    });

    it('timing stats values count equals totalTrials', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 5, maxLength: 15 }),
          (sessionId, nLevel, trials) => {
            const events = generateSession(sessionId, nLevel, trials, true);
            const summary = SessionProjector.project(events);

            if (!summary) return true;

            return (
              summary.isiStats.values.length === summary.totalTrials &&
              summary.stimulusDurationStats.values.length === summary.totalTrials
            );
          },
        ),
        { numRuns: 50 },
      );
    });

    it('all timing values are positive', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 5, maxLength: 15 }),
          (sessionId, nLevel, trials) => {
            const events = generateSession(sessionId, nLevel, trials, true);
            const summary = SessionProjector.project(events);

            if (!summary) return true;

            const allIsiPositive = summary.isiStats.values.every((v) => v > 0);
            const allStimulusPositive = summary.stimulusDurationStats.values.every((v) => v > 0);

            return allIsiPositive && allStimulusPositive;
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  describe('Focus Event Invariants', () => {
    it('focusLostCount matches focus lost events', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 3, maxLength: 10 }),
          fc.integer({ min: 0, max: 5 }),
          (sessionId, nLevel, trials, focusLostCount) => {
            const events = generateSession(
              sessionId,
              nLevel,
              trials,
              true,
              ['position', 'audio'],
              'dualnback-classic',
              focusLostCount,
            );
            const summary = SessionProjector.project(events);

            if (!summary) return true;
            return summary.focusLostCount === focusLostCount;
          },
        ),
        { numRuns: 50 },
      );
    });

    it('focusLostCount is non-negative', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 3, maxLength: 10 }),
          (sessionId, nLevel, trials) => {
            const events = generateSession(sessionId, nLevel, trials, true);
            const summary = SessionProjector.project(events);

            if (!summary) return true;
            return summary.focusLostCount >= 0;
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  describe('Lures Count Invariants', () => {
    it('luresCount values are non-negative', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 5, maxLength: 15 }),
          (sessionId, nLevel, trials) => {
            const events = generateSession(sessionId, nLevel, trials, true);
            const summary = SessionProjector.project(events);

            if (!summary) return true;

            for (const count of Object.values(summary.luresCount)) {
              if (count < 0) return false;
            }
            return true;
          },
        ),
        { numRuns: 50 },
      );
    });

    it('luresCount contains active modalities', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 5, maxLength: 15 }),
          activemodalitiesArb,
          (sessionId, nLevel, trials, modalities) => {
            const events = generateSession(sessionId, nLevel, trials, true, modalities);
            const summary = SessionProjector.project(events);

            if (!summary) return true;

            return modalities.every((m) => summary.luresCount[m] !== undefined);
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  describe('Outcome Invariants', () => {
    it('all outcome trialIndices are unique', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 5, maxLength: 20 }),
          (sessionId, nLevel, trials) => {
            const events = generateSession(sessionId, nLevel, trials, true);
            const summary = SessionProjector.project(events);

            if (!summary) return true;

            const indices = summary.outcomes.map((o) => o.trialIndex);
            const uniqueIndices = new Set(indices);

            return indices.length === uniqueIndices.size;
          },
        ),
        { numRuns: 50 },
      );
    });

    it('outcome trialIndices are sorted ascending', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 5, maxLength: 15 }),
          (sessionId, nLevel, trials) => {
            const events = generateSession(sessionId, nLevel, trials, true);
            const summary = SessionProjector.project(events);

            if (!summary) return true;

            for (let i = 1; i < summary.outcomes.length; i++) {
              // @ts-expect-error test: nullable access
              if (summary!.outcomes[i].trialIndex <= summary!.outcomes[i - 1].trialIndex) {
                return false;
              }
            }
            return true;
          },
        ),
        { numRuns: 50 },
      );
    });

    it('outcome results are valid TrialResult enum values', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 5, maxLength: 15 }),
          (sessionId, nLevel, trials) => {
            const events = generateSession(sessionId, nLevel, trials, true);
            const summary = SessionProjector.project(events);

            if (!summary) return true;

            const validResults: TrialResult[] = ['hit', 'miss', 'falseAlarm', 'correctRejection'];

            for (const outcome of summary.outcomes) {
              for (const modalityOutcome of Object.values(outcome.byModality)) {
                if (!validResults.includes(modalityOutcome.result)) {
                  return false;
                }
              }
            }
            return true;
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  describe('Null/Missing Data Invariants', () => {
    it('returns null when no SESSION_STARTED event', () => {
      const summary = SessionProjector.project([]);
      expect(summary).toBeNull();
    });

    it('returns null for events without SESSION_STARTED', () => {
      fc.assert(
        fc.property(fc.uuid(), (sessionId) => {
          const events: GameEvent[] = [createSessionEnded(sessionId, Date.now(), 'completed')];
          const summary = SessionProjector.project(events);
          return summary === null;
        }),
        { numRuns: 20 },
      );
    });

    it('handles session with only buffer trials', () => {
      fc.assert(
        fc.property(fc.uuid(), nLevelArb, (sessionId, nLevel) => {
          const events = generateSession(sessionId, nLevel, [], true);
          const summary = SessionProjector.project(events);

          if (!summary) return true;

          return summary.outcomes.length === 0 && summary.finalStats.trialsCompleted === 0;
        }),
        { numRuns: 30 },
      );
    });
  });

  describe('computeTrialResult Invariants', () => {
    it('returns hit for target + pressed', () => {
      fc.assert(
        fc.property(fc.boolean(), (_) => {
          return SessionProjector.computeTrialResult(true, true) === 'hit';
        }),
        { numRuns: 10 },
      );
    });

    it('returns miss for target + not pressed', () => {
      fc.assert(
        fc.property(fc.boolean(), (_) => {
          return SessionProjector.computeTrialResult(true, false) === 'miss';
        }),
        { numRuns: 10 },
      );
    });

    it('returns falseAlarm for non-target + pressed', () => {
      fc.assert(
        fc.property(fc.boolean(), (_) => {
          return SessionProjector.computeTrialResult(false, true) === 'falseAlarm';
        }),
        { numRuns: 10 },
      );
    });

    it('returns correctRejection for non-target + not pressed', () => {
      fc.assert(
        fc.property(fc.boolean(), (_) => {
          return SessionProjector.computeTrialResult(false, false) === 'correctRejection';
        }),
        { numRuns: 10 },
      );
    });

    it('result covers all combinations', () => {
      fc.assert(
        fc.property(fc.boolean(), fc.boolean(), (isTarget, pressed) => {
          const result = SessionProjector.computeTrialResult(isTarget, pressed);
          const validResults: TrialResult[] = ['hit', 'miss', 'falseAlarm', 'correctRejection'];
          return validResults.includes(result);
        }),
        { numRuns: 20 },
      );
    });
  });

  describe('computeRunningStats Invariants', () => {
    it('empty outcomes produce zero stats', () => {
      const stats = SessionProjector.computeRunningStats([]);

      expect(stats.trialsCompleted).toBe(0);
      expect(stats.globalDPrime).toBe(0);
      expect(Object.keys(stats.byModality)).toHaveLength(0);
    });

    it('stats accumulate correctly for single modality', () => {
      fc.assert(
        fc.property(fc.array(outcomeArb, { minLength: 5, maxLength: 20 }), (outcomes) => {
          const trialOutcomes: TrialOutcome[] = outcomes.map((o, i) => ({
            trialIndex: i,
            byModality: {
              position: {
                result:
                  o === 'hit'
                    ? 'hit'
                    : o === 'miss'
                      ? 'miss'
                      : o === 'fa'
                        ? 'falseAlarm'
                        : 'correctRejection',
                reactionTime: o === 'hit' || o === 'fa' ? 350 : null,
                wasLure: false,
              },
            },
          }));

          const stats = SessionProjector.computeRunningStats(trialOutcomes);

          const expectedHits = outcomes.filter((o) => o === 'hit').length;
          const expectedMisses = outcomes.filter((o) => o === 'miss').length;
          const expectedFA = outcomes.filter((o) => o === 'fa').length;
          const expectedCR = outcomes.filter((o) => o === 'cr').length;

          return (
            stats.trialsCompleted === outcomes.length &&
            // @ts-expect-error test: nullable access
            stats!.byModality.position.hits === expectedHits &&
            // @ts-expect-error test: nullable access
            stats!.byModality.position.misses === expectedMisses &&
            // @ts-expect-error test: nullable access
            stats!.byModality.position.falseAlarms === expectedFA &&
            // @ts-expect-error test: nullable access
            stats!.byModality.position.correctRejections === expectedCR
          );
        }),
        { numRuns: 50 },
      );
    });
  });

  describe('computeStatsAtTrial Invariants', () => {
    it('stats at trial N include only trials <= N', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 10, maxLength: 20 }),
          fc.integer({ min: 0, max: 9 }),
          (sessionId, nLevel, trials, cutoffOffset) => {
            const events = generateSession(sessionId, nLevel, trials, true);
            const cutoffIndex = nLevel + cutoffOffset;

            const stats = SessionProjector.computeStatsAtTrial(events, cutoffIndex);

            // Should include trials from nLevel to cutoffIndex (non-buffer only)
            const expectedTrials = Math.min(cutoffOffset + 1, trials.length);

            return stats.trialsCompleted <= expectedTrials;
          },
        ),
        { numRuns: 30 },
      );
    });

    it('stats at trial 0 with buffer returns 0 trials', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          fc.integer({ min: 2, max: 8 }),
          fc.array(trialConfigArb, { minLength: 5, maxLength: 15 }),
          (sessionId, nLevel, trials) => {
            const events = generateSession(sessionId, nLevel, trials, true);

            // Trial index 0 is a buffer trial
            const stats = SessionProjector.computeStatsAtTrial(events, 0);

            return stats.trialsCompleted === 0;
          },
        ),
        { numRuns: 20 },
      );
    });
  });

  describe('extractTempoResponseData Invariants', () => {
    it('response data length matches responses', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 5, maxLength: 15 }),
          (sessionId, nLevel, trials) => {
            const events = generateSession(sessionId, nLevel, trials, true);

            const trialEvents = events.filter(
              (e): e is TrialPresentedEvent => e.type === 'TRIAL_PRESENTED',
            );
            const responses = events.filter(
              (e): e is UserResponseEvent => e.type === 'USER_RESPONDED',
            );

            const responseData = extractTempoResponseData(trialEvents, responses, [
              'position',
              'audio',
            ]);

            // Response data includes both responses and misses
            // So it should be >= responses.length
            return responseData.length >= responses.length;
          },
        ),
        { numRuns: 30 },
      );
    });
  });

  describe('Game Mode Invariants', () => {
    it('gameMode is preserved from SESSION_STARTED', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 5, maxLength: 10 }),
          gameModeArb,
          (sessionId, nLevel, trials, gameMode) => {
            const events = generateSession(
              sessionId,
              nLevel,
              trials,
              true,
              ['position', 'audio'],
              gameMode,
            );
            const summary = SessionProjector.project(events);

            if (!summary) return true;
            return summary.gameMode === gameMode;
          },
        ),
        { numRuns: 50 },
      );
    });

    it('generator is preserved from SESSION_STARTED config', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 5, maxLength: 10 }),
          (sessionId, nLevel, trials) => {
            const events = generateSession(sessionId, nLevel, trials, true);
            const summary = SessionProjector.project(events);

            if (!summary) return true;
            return summary.generator === 'adaptive';
          },
        ),
        { numRuns: 30 },
      );
    });
  });

  describe('TempoConfidence Invariants', () => {
    it('tempoConfidence is null or has valid structure', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 10, maxLength: 25 }),
          (sessionId, nLevel, trials) => {
            const events = generateSession(sessionId, nLevel, trials, true);
            const summary = SessionProjector.project(events);

            if (!summary) return true;

            if (summary.tempoConfidence === null) return true;

            // Check structure - tempoConfidence has score, components, and hasEnoughData
            const tc = summary.tempoConfidence;
            return (
              typeof tc.score === 'number' &&
              typeof tc.hasEnoughData === 'boolean' &&
              typeof tc.components === 'object' &&
              typeof tc.components.timingDiscipline === 'number' &&
              typeof tc.components.rtStability === 'number' &&
              typeof tc.components.pressStability === 'number' &&
              typeof tc.components.focusScore === 'number' &&
              typeof tc.components.errorAwareness === 'number'
            );
          },
        ),
        { numRuns: 30 },
      );
    });

    it('tempoConfidence scores are bounded [0, 100]', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 15, maxLength: 30 }),
          (sessionId, nLevel, trials) => {
            const events = generateSession(sessionId, nLevel, trials, true);
            const summary = SessionProjector.project(events);

            if (!summary?.tempoConfidence) return true;

            const tc = summary.tempoConfidence;
            const c = tc.components;
            return (
              tc.score >= 0 &&
              tc.score <= 100 &&
              // @ts-expect-error test: nullable access
              c!.timingDiscipline >= 0 &&
              // @ts-expect-error test: nullable access
              c!.timingDiscipline <= 100 &&
              c.rtStability >= 0 &&
              c.rtStability <= 100 &&
              c.pressStability >= 0 &&
              c.pressStability <= 100 &&
              c.focusScore >= 0 &&
              c.focusScore <= 100 &&
              c.errorAwareness >= 0 &&
              c.errorAwareness <= 100
            );
          },
        ),
        { numRuns: 30 },
      );
    });
  });
});
