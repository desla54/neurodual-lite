/**
 * Metamorphic Property Tests for Session Projector
 *
 * Tests metamorphic relations that must hold for event sourcing projection:
 *
 * 1. Event ordering invariants
 * 2. Idempotency
 * 3. Incremental consistency
 * 4. Count preservation
 * 5. Score derivation consistency
 * 6. Timestamp ordering
 * 7. Session boundary handling
 * 8. Replay determinism
 *
 * Metamorphic testing verifies that related inputs produce related outputs,
 * even when the exact output is not known a priori.
 */
import { describe, expect, it } from 'bun:test';
import * as fc from 'fast-check';
import { SessionProjector } from './session-projector';
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
  RunningStats,
} from './events';
import type { ModalityId, TrialResult } from '../types/core';
import { StatisticalCalculator } from './statistical-calculator';

// =============================================================================
// Arbitraries
// =============================================================================

const timestampArb = fc.integer({ min: 1000000000000, max: 2000000000000 });
const nLevelArb = fc.integer({ min: 1, max: 8 });
const trialsCountArb = fc.integer({ min: 5, max: 30 });
const reactionTimeArb = fc.integer({ min: 100, max: 2500 });
const pressDurationArb = fc.integer({ min: 50, max: 500 });
const isiMsArb = fc.integer({ min: 1000, max: 5000 });
const stimulusDurationMsArb = fc.integer({ min: 300, max: 1000 });

type Outcome = 'hit' | 'miss' | 'fa' | 'cr';
const outcomeArb = fc.constantFrom('hit', 'miss', 'fa', 'cr') as fc.Arbitrary<Outcome>;

const modalityArb = fc.constantFrom('position', 'audio') as fc.Arbitrary<ModalityId>;

const gameModeArb = fc.constantFrom('dual-catch', 'dualnback-classic', 'sim-brainworkshop');

// =============================================================================
// Event Factories
// =============================================================================

const createSessionStarted = (
  sessionId: string,
  nLevel: number,
  timestamp: number,
  activeModalities: readonly ModalityId[] = ['position', 'audio'],
  gameMode = 'dual-catch',
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
// Trial Configuration
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

// =============================================================================
// Session Generator
// =============================================================================

const generateSession = (
  sessionId: string,
  nLevel: number,
  trialsConfig: readonly TrialConfig[],
  completed: boolean,
  activeModalities: readonly ModalityId[] = ['position', 'audio'],
  gameMode = 'dual-catch',
  focusLostCount = 0,
  startTimestamp = Date.now(),
): GameEvent[] => {
  const events: GameEvent[] = [];
  let ts = startTimestamp;

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
// Metamorphic Relations - Event Ordering Invariants
// =============================================================================

describe('SessionProjector - Metamorphic Tests', () => {
  describe('MR1: Event Ordering Invariants', () => {
    it('MR1.1: SESSION_STARTED must come first for valid projection', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 5, maxLength: 15 }),
          (sessionId, nLevel, trials) => {
            const events = generateSession(sessionId, nLevel, trials, true);

            // Valid order produces a summary
            const summary = SessionProjector.project(events);
            expect(summary).not.toBeNull();

            // Remove SESSION_STARTED
            const withoutStart = events.filter((e) => e.type !== 'SESSION_STARTED');
            const summaryNoStart = SessionProjector.project(withoutStart);

            return summaryNoStart === null;
          },
        ),
        { numRuns: 50 },
      );
    });

    it('MR1.2: Events without SESSION_STARTED always return null', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 3, maxLength: 10 }),
          (sessionId, nLevel, trials) => {
            const events = generateSession(sessionId, nLevel, trials, true);
            const eventsWithoutStart = events.slice(1); // Remove SESSION_STARTED

            return SessionProjector.project(eventsWithoutStart) === null;
          },
        ),
        { numRuns: 30 },
      );
    });

    it('MR1.3: TRIAL_PRESENTED before USER_RESPONDED for same trial - responses without trials are ignored', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 5, maxLength: 15 }),
          (sessionId, nLevel, trials) => {
            const events = generateSession(sessionId, nLevel, trials, true);
            const summary = SessionProjector.project(events);

            if (!summary) return true;

            // Add orphan response (trial index that doesn't exist)
            const orphanResponseIndex = nLevel + trials.length + 100;
            const orphanResponse = createUserResponse(
              sessionId,
              orphanResponseIndex,
              Date.now(),
              'position',
              350,
              100,
            );

            const eventsWithOrphan = [
              ...events.slice(0, -1),
              orphanResponse,
              events[events.length - 1],
            ];
            // @ts-expect-error test override
            const summaryWithOrphan = SessionProjector.project(eventsWithOrphan);

            if (!summaryWithOrphan) return true;

            // Orphan response should be ignored - outcome count unchanged
            return summary.outcomes.length === summaryWithOrphan.outcomes.length;
          },
        ),
        { numRuns: 30 },
      );
    });

    it('MR1.4: Buffer trials appear before real trials', () => {
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

            // First nLevel trials should be buffers
            const bufferTrials = trialEvents.slice(0, nLevel);
            const realTrials = trialEvents.slice(nLevel);

            const allBuffersFirst = bufferTrials.every((t) => t.trial.isBuffer === true);
            const noBuffersAfter = realTrials.every((t) => t.trial.isBuffer === false);

            return allBuffersFirst && noBuffersAfter;
          },
        ),
        { numRuns: 50 },
      );
    });

    it('MR1.5: Trial indices are sequential', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 5, maxLength: 20 }),
          (sessionId, nLevel, trials) => {
            const events = generateSession(sessionId, nLevel, trials, true);
            const summary = SessionProjector.project(events);

            if (!summary || summary.outcomes.length === 0) return true;

            // Outcomes should be in ascending trial index order
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
  });

  // =============================================================================
  // Metamorphic Relations - Idempotency
  // =============================================================================

  describe('MR2: Idempotency', () => {
    it('MR2.1: Project(events) twice yields identical results', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 5, maxLength: 20 }),
          (sessionId, nLevel, trials) => {
            const events = generateSession(sessionId, nLevel, trials, true);

            const s1 = SessionProjector.project(events);
            const s2 = SessionProjector.project(events);

            if (!s1 || !s2) return s1 === s2;

            return (
              s1.sessionId === s2.sessionId &&
              s1.nLevel === s2.nLevel &&
              s1.totalTrials === s2.totalTrials &&
              s1.durationMs === s2.durationMs &&
              s1.passed === s2.passed &&
              s1.finalStats.globalDPrime === s2.finalStats.globalDPrime &&
              s1.outcomes.length === s2.outcomes.length
            );
          },
        ),
        { numRuns: 100 },
      );
    });

    it('MR2.2: Multiple projections yield structurally identical outcomes', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 5, maxLength: 15 }),
          (sessionId, nLevel, trials) => {
            const events = generateSession(sessionId, nLevel, trials, true);

            const results = Array.from({ length: 5 }, () => SessionProjector.project(events));

            const allValid = results.every((r) => r !== null);
            if (!allValid) return results.every((r) => r === results[0]);

            const first = results[0]!;
            return results.every(
              (r) =>
                r!.outcomes.length === first.outcomes.length &&
                // @ts-expect-error test: nullable access
                r!.outcomes.every((o, i) => o.trialIndex === first!.outcomes[i].trialIndex),
            );
          },
        ),
        { numRuns: 50 },
      );
    });

    it('MR2.3: computeRunningStats is idempotent', () => {
      fc.assert(
        fc.property(fc.array(outcomeArb, { minLength: 5, maxLength: 30 }), (outcomes) => {
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

          const stats1 = SessionProjector.computeRunningStats(trialOutcomes);
          const stats2 = SessionProjector.computeRunningStats(trialOutcomes);

          return (
            stats1.trialsCompleted === stats2.trialsCompleted &&
            stats1.globalDPrime === stats2.globalDPrime &&
            // @ts-expect-error test: nullable access
            stats1!.byModality.position.hits === stats2!.byModality.position.hits
          );
        }),
        { numRuns: 50 },
      );
    });

    it('MR2.4: computeTrialResult is pure function', () => {
      fc.assert(
        fc.property(fc.boolean(), fc.boolean(), (isTarget, pressed) => {
          const r1 = SessionProjector.computeTrialResult(isTarget, pressed);
          const r2 = SessionProjector.computeTrialResult(isTarget, pressed);
          const r3 = SessionProjector.computeTrialResult(isTarget, pressed);

          return r1 === r2 && r2 === r3;
        }),
        { numRuns: 50 },
      );
    });
  });

  // =============================================================================
  // Metamorphic Relations - Incremental Consistency
  // =============================================================================

  describe('MR3: Incremental Consistency', () => {
    it('MR3.1: computeStatsAtTrial(N) stats are subset of computeStatsAtTrial(N+1)', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 10, maxLength: 25 }),
          fc.integer({ min: 0, max: 8 }),
          (sessionId, nLevel, trials, offset) => {
            const events = generateSession(sessionId, nLevel, trials, true);

            const cutoffN = nLevel + offset;
            const cutoffN1 = cutoffN + 1;

            const statsN = SessionProjector.computeStatsAtTrial(events, cutoffN);
            const statsN1 = SessionProjector.computeStatsAtTrial(events, cutoffN1);

            // trials at N+1 >= trials at N
            return statsN1.trialsCompleted >= statsN.trialsCompleted;
          },
        ),
        { numRuns: 50 },
      );
    });

    it('MR3.2: Final stats equals computeStatsAtTrial for last trial', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 5, maxLength: 15 }),
          (sessionId, nLevel, trials) => {
            const events = generateSession(sessionId, nLevel, trials, true);
            const summary = SessionProjector.project(events);

            if (!summary) return true;

            const lastTrialIndex = nLevel + trials.length - 1;
            const statsAtLast = SessionProjector.computeStatsAtTrial(events, lastTrialIndex);

            return summary.finalStats.trialsCompleted === statsAtLast.trialsCompleted;
          },
        ),
        { numRuns: 50 },
      );
    });

    it('MR3.3: Adding one trial increases trialsCompleted by at most 1', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 5, maxLength: 15 }),
          trialConfigArb,
          (sessionId, nLevel, trials, extraTrial) => {
            const events1 = generateSession(sessionId, nLevel, trials, true);
            const events2 = generateSession(sessionId, nLevel, [...trials, extraTrial], true);

            const s1 = SessionProjector.project(events1);
            const s2 = SessionProjector.project(events2);

            if (!s1 || !s2) return true;

            const diff = s2.outcomes.length - s1.outcomes.length;
            return diff === 1;
          },
        ),
        { numRuns: 50 },
      );
    });

    it('MR3.4: Stats accumulate monotonically for each outcome type', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 5, maxLength: 15 }),
          (sessionId, nLevel, trials) => {
            const events = generateSession(sessionId, nLevel, trials, true);

            let prevStats: RunningStats | null = null;

            for (let i = nLevel; i < nLevel + trials.length; i++) {
              const stats = SessionProjector.computeStatsAtTrial(events, i);

              if (prevStats) {
                const pPos = prevStats.byModality.position;
                const cPos = stats.byModality.position;

                if (!pPos || !cPos) continue;

                // Each count should be >= previous
                if (
                  cPos.hits < pPos.hits ||
                  cPos.misses < pPos.misses ||
                  cPos.falseAlarms < pPos.falseAlarms ||
                  cPos.correctRejections < pPos.correctRejections
                ) {
                  return false;
                }
              }

              prevStats = stats;
            }

            return true;
          },
        ),
        { numRuns: 30 },
      );
    });
  });

  // =============================================================================
  // Metamorphic Relations - Count Preservation
  // =============================================================================

  describe('MR4: Count Preservation', () => {
    it('MR4.1: Number of TRIAL_PRESENTED events equals totalTrials', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 5, maxLength: 20 }),
          (sessionId, nLevel, trials) => {
            const events = generateSession(sessionId, nLevel, trials, true);
            const summary = SessionProjector.project(events);

            if (!summary) return true;

            const trialPresentedCount = events.filter((e) => e.type === 'TRIAL_PRESENTED').length;

            return summary.totalTrials === trialPresentedCount;
          },
        ),
        { numRuns: 100 },
      );
    });

    it('MR4.2: outcomes.length equals non-buffer TRIAL_PRESENTED count', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 5, maxLength: 20 }),
          (sessionId, nLevel, trials) => {
            const events = generateSession(sessionId, nLevel, trials, true);
            const summary = SessionProjector.project(events);

            if (!summary) return true;

            const nonBufferTrials = events.filter(
              (e): e is TrialPresentedEvent => e.type === 'TRIAL_PRESENTED' && !e.trial.isBuffer,
            ).length;

            return summary.outcomes.length === nonBufferTrials;
          },
        ),
        { numRuns: 100 },
      );
    });

    it('MR4.3: hits + misses + falseAlarms + correctRejections equals trialsCompleted per modality', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 5, maxLength: 20 }),
          (sessionId, nLevel, trials) => {
            const events = generateSession(sessionId, nLevel, trials, true);
            const summary = SessionProjector.project(events);

            if (!summary) return true;

            for (const [, stats] of Object.entries(summary.finalStats.byModality)) {
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

    it('MR4.4: Focus events count matches focusLostCount', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 5, maxLength: 15 }),
          fc.integer({ min: 0, max: 5 }),
          (sessionId, nLevel, trials, focusLostCount) => {
            const events = generateSession(
              sessionId,
              nLevel,
              trials,
              true,
              ['position', 'audio'],
              'dual-catch',
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

    it('MR4.5: Outcome count per result type matches computed stats', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 5, maxLength: 15 }),
          (sessionId, nLevel, trials) => {
            const events = generateSession(sessionId, nLevel, trials, true);
            const summary = SessionProjector.project(events);

            if (!summary) return true;

            // Count outcomes manually
            const countByResult: Record<TrialResult, number> = {
              hit: 0,
              miss: 0,
              falseAlarm: 0,
              correctRejection: 0,
            };

            for (const outcome of summary.outcomes) {
              const posResult = outcome.byModality.position?.result;
              if (posResult) {
                countByResult[posResult]++;
              }
            }

            const posStats = summary.finalStats.byModality.position;
            if (!posStats) return true;

            return (
              posStats.hits === countByResult.hit &&
              posStats.misses === countByResult.miss &&
              posStats.falseAlarms === countByResult.falseAlarm &&
              posStats.correctRejections === countByResult.correctRejection
            );
          },
        ),
        { numRuns: 50 },
      );
    });

    it('MR4.6: User responses per modality match response events', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 5, maxLength: 15 }),
          (sessionId, nLevel, trials) => {
            const events = generateSession(sessionId, nLevel, trials, true);
            const summary = SessionProjector.project(events);

            if (!summary) return true;

            // Count position responses in events
            const positionResponses = events.filter(
              (e): e is UserResponseEvent =>
                e.type === 'USER_RESPONDED' && e.modality === 'position',
            ).length;

            // Position responses = hits + falseAlarms
            const posStats = summary.finalStats.byModality.position;
            if (!posStats) return true;

            const computedResponses = posStats.hits + posStats.falseAlarms;

            return computedResponses === positionResponses;
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  // =============================================================================
  // Metamorphic Relations - Score Derivation Consistency
  // =============================================================================

  describe('MR5: Score Derivation Consistency', () => {
    it('MR5.1: globalDPrime is average of modality dPrimes', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 5, maxLength: 20 }),
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
        { numRuns: 100 },
      );
    });

    it('MR5.2: Manually computed d-prime matches finalStats.byModality.*.dPrime', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 10, maxLength: 20 }),
          (sessionId, nLevel, trials) => {
            const events = generateSession(sessionId, nLevel, trials, true);
            const summary = SessionProjector.project(events);

            if (!summary) return true;

            const posStats = summary.finalStats.byModality.position;
            if (!posStats) return true;

            const manualDPrime = StatisticalCalculator.computeDPrime(
              posStats.hits,
              posStats.misses,
              posStats.falseAlarms,
              posStats.correctRejections,
            );

            return Math.abs(posStats.dPrime - manualDPrime) < 0.001;
          },
        ),
        { numRuns: 50 },
      );
    });

    it('MR5.3: avgRT is computed correctly from responses with reaction times', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 5, maxLength: 15 }),
          (sessionId, nLevel, trials) => {
            const events = generateSession(sessionId, nLevel, trials, true);
            const summary = SessionProjector.project(events);

            if (!summary) return true;

            // Collect reaction times from outcomes
            const reactionTimes: number[] = [];
            for (const outcome of summary.outcomes) {
              const rt = outcome.byModality.position?.reactionTime;
              if (rt !== null && rt !== undefined) {
                reactionTimes.push(rt);
              }
            }

            const posStats = summary.finalStats.byModality.position;
            if (!posStats) return true;

            if (reactionTimes.length === 0) {
              return posStats.avgRT === null;
            }

            const manualAvgRT = reactionTimes.reduce((a, b) => a + b, 0) / reactionTimes.length;

            return Math.abs((posStats.avgRT ?? 0) - manualAvgRT) < 0.001;
          },
        ),
        { numRuns: 50 },
      );
    });

    it('MR5.4: ISI stats computed correctly from trial events', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 5, maxLength: 15 }),
          (sessionId, nLevel, trials) => {
            const events = generateSession(sessionId, nLevel, trials, true);
            const summary = SessionProjector.project(events);

            if (!summary) return true;

            const trialEvents = events.filter(
              (e): e is TrialPresentedEvent => e.type === 'TRIAL_PRESENTED',
            );

            const isiValues = trialEvents.map((t) => t.isiMs);

            return (
              summary.isiStats.values.length === isiValues.length &&
              summary.isiStats.min <= summary.isiStats.avg &&
              summary.isiStats.avg <= summary.isiStats.max
            );
          },
        ),
        { numRuns: 50 },
      );
    });

    it('MR5.5: All targets responded = all hits for that modality', () => {
      // Create a session where all position targets are pressed
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(
            fc.record({
              isPositionTarget: fc.constant(true),
              isAudioTarget: fc.boolean(),
              positionPressed: fc.constant(true),
              audioPressed: fc.boolean(),
              isiMs: isiMsArb,
              stimulusDurationMs: stimulusDurationMsArb,
              reactionTimeMs: reactionTimeArb,
              pressDurationMs: pressDurationArb,
            }),
            { minLength: 5, maxLength: 15 },
          ),
          (sessionId, nLevel, trials) => {
            const events = generateSession(sessionId, nLevel, trials, true, ['position']);
            const summary = SessionProjector.project(events);

            if (!summary) return true;

            const posStats = summary.finalStats.byModality.position;
            if (!posStats) return true;

            // All targets pressed = misses should be 0
            return posStats.misses === 0;
          },
        ),
        { numRuns: 30 },
      );
    });
  });

  // =============================================================================
  // Metamorphic Relations - Timestamp Ordering
  // =============================================================================

  describe('MR6: Timestamp Ordering', () => {
    it('MR6.1: Duration equals end timestamp minus start timestamp', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 5, maxLength: 15 }),
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
        { numRuns: 100 },
      );
    });

    it('MR6.2: SESSION_STARTED has earliest timestamp, SESSION_ENDED has latest', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 5, maxLength: 15 }),
          (sessionId, nLevel, trials) => {
            const events = generateSession(sessionId, nLevel, trials, true);

            const startEvent = events.find((e) => e.type === 'SESSION_STARTED');
            const endEvent = events.find((e) => e.type === 'SESSION_ENDED');

            if (!startEvent || !endEvent) return true;

            // SESSION_STARTED should have the earliest timestamp
            const startIsEarliest = events.every((e) => e.timestamp >= startEvent.timestamp);

            // SESSION_ENDED should have the latest or equal timestamp
            const endIsLatest = events.every((e) => e.timestamp <= endEvent.timestamp);

            return startIsEarliest && endIsLatest;
          },
        ),
        { numRuns: 50 },
      );
    });

    it('MR6.3: Session without SESSION_ENDED uses last event timestamp', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 5, maxLength: 10 }),
          (sessionId, nLevel, trials) => {
            const events = generateSession(sessionId, nLevel, trials, true);
            const eventsNoEnd = events.filter((e) => e.type !== 'SESSION_ENDED');

            const summary = SessionProjector.project(eventsNoEnd);

            if (!summary) return true;

            const startEvent = eventsNoEnd.find((e) => e.type === 'SESSION_STARTED');
            const lastEvent = eventsNoEnd[eventsNoEnd.length - 1];

            if (!startEvent || !lastEvent) return true;

            return summary.durationMs === lastEvent.timestamp - startEvent.timestamp;
          },
        ),
        { numRuns: 30 },
      );
    });

    it('MR6.4: Timing stats min/max/avg are consistent with values array', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 5, maxLength: 15 }),
          (sessionId, nLevel, trials) => {
            const events = generateSession(sessionId, nLevel, trials, true);
            const summary = SessionProjector.project(events);

            if (!summary || summary.isiStats.values.length === 0) return true;

            const values = summary.isiStats.values;
            const min = Math.min(...values);
            const max = Math.max(...values);
            const avg = values.reduce((a, b) => a + b, 0) / values.length;

            return (
              summary.isiStats.min === min &&
              summary.isiStats.max === max &&
              Math.abs(summary.isiStats.avg - avg) < 0.001
            );
          },
        ),
        { numRuns: 50 },
      );
    });

    it('MR6.5: totalFocusLostMs is sum of focus regained lostDurationMs', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 5, maxLength: 10 }),
          fc.integer({ min: 1, max: 5 }),
          (sessionId, nLevel, trials, focusLostCount) => {
            const events = generateSession(
              sessionId,
              nLevel,
              trials,
              true,
              ['position', 'audio'],
              'dual-catch',
              focusLostCount,
            );
            const summary = SessionProjector.project(events);

            if (!summary) return true;

            const focusRegainedEvents = events.filter(
              (e): e is FocusRegainedEvent => e.type === 'FOCUS_REGAINED',
            );

            const totalLostMs = focusRegainedEvents.reduce((sum, e) => sum + e.lostDurationMs, 0);

            return summary.totalFocusLostMs === totalLostMs;
          },
        ),
        { numRuns: 30 },
      );
    });
  });

  // =============================================================================
  // Metamorphic Relations - Session Boundary Handling
  // =============================================================================

  describe('MR7: Session Boundary Handling', () => {
    it('MR7.1: Empty events array returns null', () => {
      expect(SessionProjector.project([])).toBeNull();
    });

    it('MR7.2: Session with only SESSION_STARTED and SESSION_ENDED has 0 outcomes', () => {
      fc.assert(
        fc.property(fc.uuid(), nLevelArb, (sessionId, nLevel) => {
          const events: GameEvent[] = [
            createSessionStarted(sessionId, nLevel, Date.now()),
            createSessionEnded(sessionId, Date.now() + 1000),
          ];

          const summary = SessionProjector.project(events);

          if (!summary) return true;

          return summary.outcomes.length === 0 && summary.totalTrials === 0;
        }),
        { numRuns: 30 },
      );
    });

    it('MR7.3: Session with only buffer trials has 0 outcomes', () => {
      fc.assert(
        fc.property(fc.uuid(), nLevelArb, (sessionId, nLevel) => {
          const events = generateSession(sessionId, nLevel, [], true);
          const summary = SessionProjector.project(events);

          if (!summary) return true;

          return (
            summary.outcomes.length === 0 &&
            summary.totalTrials === nLevel &&
            summary.finalStats.trialsCompleted === 0
          );
        }),
        { numRuns: 30 },
      );
    });

    it('MR7.4: Events from different sessions are not mixed (sessionId filtering)', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 3, maxLength: 10 }),
          (sessionId1, sessionId2, nLevel, trials) => {
            // Create events for session 1
            const events1 = generateSession(sessionId1, nLevel, trials, true);

            // Create a trial event with different sessionId
            const alienTrial = createTrialPresented(
              sessionId2,
              nLevel + 100,
              Date.now(),
              true,
              false,
              false,
              2500,
              500,
            );

            // Insert alien event
            const mixedEvents = [...events1.slice(0, -1), alienTrial, events1[events1.length - 1]];

            // @ts-expect-error test override
            const summary = SessionProjector.project(mixedEvents);

            if (!summary) return true;

            // Summary should only include trials from sessionId1
            return summary.sessionId === sessionId1;
          },
        ),
        { numRuns: 30 },
      );
    });

    it('MR7.5: Abandoned session still produces valid projection', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 5, maxLength: 15 }),
          (sessionId, nLevel, trials) => {
            const events = generateSession(sessionId, nLevel, trials, false); // abandoned
            const summary = SessionProjector.project(events);

            if (!summary) return true;

            return summary.sessionId === sessionId && summary.outcomes.length === trials.length;
          },
        ),
        { numRuns: 30 },
      );
    });

    it('MR7.6: nLevel is preserved in projection', () => {
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
  });

  // =============================================================================
  // Metamorphic Relations - Replay Determinism
  // =============================================================================

  describe('MR8: Replay Determinism', () => {
    it('MR8.1: Same events in same order produce identical projection', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 5, maxLength: 20 }),
          (sessionId, nLevel, trials) => {
            const events = generateSession(sessionId, nLevel, trials, true);

            // Project multiple times
            const projections = Array.from({ length: 10 }, () => SessionProjector.project(events));

            const first = projections[0];
            if (!first) return projections.every((p) => p === null);

            return projections.every(
              (p) =>
                p !== null &&
                p.sessionId === first.sessionId &&
                p.nLevel === first.nLevel &&
                p.totalTrials === first.totalTrials &&
                p.durationMs === first.durationMs &&
                p.finalStats.globalDPrime === first.finalStats.globalDPrime &&
                p.passed === first.passed,
            );
          },
        ),
        { numRuns: 50 },
      );
    });

    it('MR8.2: Deep copy of events produces identical projection', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 5, maxLength: 15 }),
          (sessionId, nLevel, trials) => {
            const events = generateSession(sessionId, nLevel, trials, true);
            const eventsCopy = JSON.parse(JSON.stringify(events));

            const s1 = SessionProjector.project(events);
            const s2 = SessionProjector.project(eventsCopy);

            if (!s1 || !s2) return s1 === null && s2 === null;

            return (
              s1.sessionId === s2.sessionId &&
              s1.nLevel === s2.nLevel &&
              s1.totalTrials === s2.totalTrials &&
              s1.outcomes.length === s2.outcomes.length &&
              s1.finalStats.globalDPrime === s2.finalStats.globalDPrime
            );
          },
        ),
        { numRuns: 30 },
      );
    });

    it('MR8.3: Immutable events - projection does not modify input', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 5, maxLength: 15 }),
          (sessionId, nLevel, trials) => {
            const events = generateSession(sessionId, nLevel, trials, true);
            const originalJson = JSON.stringify(events);

            SessionProjector.project(events);

            const afterJson = JSON.stringify(events);

            return originalJson === afterJson;
          },
        ),
        { numRuns: 30 },
      );
    });

    it('MR8.4: Game mode is preserved through projection', () => {
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

            return summary.gameMode === gameMode;
          },
        ),
        { numRuns: 50 },
      );
    });

    it('MR8.5: Generator is preserved through projection', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 5, maxLength: 15 }),
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

    it('MR8.6: Active modalities are correctly reflected in stats', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 5, maxLength: 15 }),
          fc.subarray(['position', 'audio', 'color'] as ModalityId[], { minLength: 1 }),
          (sessionId, nLevel, trials, modalities) => {
            const events = generateSession(sessionId, nLevel, trials, true, modalities);
            const summary = SessionProjector.project(events);

            if (!summary) return true;

            // All active modalities should appear in byModality
            return modalities.every((m) => summary.finalStats.byModality[m] !== undefined);
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  // =============================================================================
  // Additional Metamorphic Relations
  // =============================================================================

  describe('MR9: Outcome Correctness', () => {
    it('MR9.1: computeTrialResult truth table is correct', () => {
      // Exhaustive test of all 4 combinations
      expect(SessionProjector.computeTrialResult(true, true)).toBe('hit');
      expect(SessionProjector.computeTrialResult(true, false)).toBe('miss');
      expect(SessionProjector.computeTrialResult(false, true)).toBe('falseAlarm');
      expect(SessionProjector.computeTrialResult(false, false)).toBe('correctRejection');
    });

    it('MR9.2: Hit rate + miss rate = 1 for targets', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 10, maxLength: 25 }),
          (sessionId, nLevel, trials) => {
            const events = generateSession(sessionId, nLevel, trials, true);
            const summary = SessionProjector.project(events);

            if (!summary) return true;

            const posStats = summary.finalStats.byModality.position;
            if (!posStats) return true;

            const targets = posStats.hits + posStats.misses;
            if (targets === 0) return true;

            const hitRate = posStats.hits / targets;
            const missRate = posStats.misses / targets;

            return Math.abs(hitRate + missRate - 1) < 0.001;
          },
        ),
        { numRuns: 50 },
      );
    });

    it('MR9.3: False alarm rate + correct rejection rate = 1 for non-targets', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 10, maxLength: 25 }),
          (sessionId, nLevel, trials) => {
            const events = generateSession(sessionId, nLevel, trials, true);
            const summary = SessionProjector.project(events);

            if (!summary) return true;

            const posStats = summary.finalStats.byModality.position;
            if (!posStats) return true;

            const nonTargets = posStats.falseAlarms + posStats.correctRejections;
            if (nonTargets === 0) return true;

            const faRate = posStats.falseAlarms / nonTargets;
            const crRate = posStats.correctRejections / nonTargets;

            return Math.abs(faRate + crRate - 1) < 0.001;
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  describe('MR10: Edge Cases', () => {
    it('MR10.1: Session with all hits has maximum d-prime', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.integer({ min: 5, max: 15 }),
          (sessionId, nLevel, trialsCount) => {
            // All targets, all pressed
            const allHitTrials: TrialConfig[] = Array.from({ length: trialsCount }, () => ({
              isPositionTarget: true,
              isAudioTarget: false,
              positionPressed: true,
              audioPressed: false,
              isiMs: 2500,
              stimulusDurationMs: 500,
              reactionTimeMs: 350,
              pressDurationMs: 100,
            }));

            const events = generateSession(sessionId, nLevel, allHitTrials, true, ['position']);
            const summary = SessionProjector.project(events);

            if (!summary) return true;

            const posStats = summary.finalStats.byModality.position;
            if (!posStats) return true;

            // All hits, no misses
            return posStats.hits === trialsCount && posStats.misses === 0;
          },
        ),
        { numRuns: 30 },
      );
    });

    it('MR10.2: Session with all misses has minimum hit rate', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.integer({ min: 5, max: 15 }),
          (sessionId, nLevel, trialsCount) => {
            // All targets, none pressed
            const allMissTrials: TrialConfig[] = Array.from({ length: trialsCount }, () => ({
              isPositionTarget: true,
              isAudioTarget: false,
              positionPressed: false,
              audioPressed: false,
              isiMs: 2500,
              stimulusDurationMs: 500,
              reactionTimeMs: 350,
              pressDurationMs: 100,
            }));

            const events = generateSession(sessionId, nLevel, allMissTrials, true, ['position']);
            const summary = SessionProjector.project(events);

            if (!summary) return true;

            const posStats = summary.finalStats.byModality.position;
            if (!posStats) return true;

            // All misses, no hits
            return posStats.misses === trialsCount && posStats.hits === 0;
          },
        ),
        { numRuns: 30 },
      );
    });

    it('MR10.3: Session with all false alarms has maximum false alarm rate', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.integer({ min: 5, max: 15 }),
          (sessionId, nLevel, trialsCount) => {
            // All non-targets, all pressed (false alarms)
            const allFATrials: TrialConfig[] = Array.from({ length: trialsCount }, () => ({
              isPositionTarget: false,
              isAudioTarget: false,
              positionPressed: true,
              audioPressed: false,
              isiMs: 2500,
              stimulusDurationMs: 500,
              reactionTimeMs: 350,
              pressDurationMs: 100,
            }));

            const events = generateSession(sessionId, nLevel, allFATrials, true, ['position']);
            const summary = SessionProjector.project(events);

            if (!summary) return true;

            const posStats = summary.finalStats.byModality.position;
            if (!posStats) return true;

            // All false alarms, no correct rejections
            return posStats.falseAlarms === trialsCount && posStats.correctRejections === 0;
          },
        ),
        { numRuns: 30 },
      );
    });

    it('MR10.4: Session with all correct rejections has zero false alarm rate', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.integer({ min: 5, max: 15 }),
          (sessionId, nLevel, trialsCount) => {
            // All non-targets, none pressed (correct rejections)
            const allCRTrials: TrialConfig[] = Array.from({ length: trialsCount }, () => ({
              isPositionTarget: false,
              isAudioTarget: false,
              positionPressed: false,
              audioPressed: false,
              isiMs: 2500,
              stimulusDurationMs: 500,
              reactionTimeMs: 350,
              pressDurationMs: 100,
            }));

            const events = generateSession(sessionId, nLevel, allCRTrials, true, ['position']);
            const summary = SessionProjector.project(events);

            if (!summary) return true;

            const posStats = summary.finalStats.byModality.position;
            if (!posStats) return true;

            // All correct rejections, no false alarms
            return posStats.correctRejections === trialsCount && posStats.falseAlarms === 0;
          },
        ),
        { numRuns: 30 },
      );
    });

    it('MR10.5: d-prime is finite for any valid outcome distribution', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 5, maxLength: 30 }),
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
  });

  describe('MR11: Lure Stats', () => {
    it('MR11.1: luresCount values are non-negative', () => {
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

    it('MR11.2: luresCount contains all active modalities', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 5, maxLength: 15 }),
          (sessionId, nLevel, trials) => {
            const modalities: ModalityId[] = ['position', 'audio'];
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

  describe('MR12: TempoConfidence Consistency', () => {
    it('MR12.1: tempoConfidence is null or has valid score range', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 15, maxLength: 30 }),
          (sessionId, nLevel, trials) => {
            const events = generateSession(sessionId, nLevel, trials, true);
            const summary = SessionProjector.project(events);

            if (!summary || summary.tempoConfidence === null) return true;

            const tc = summary.tempoConfidence;
            return tc.score >= 0 && tc.score <= 100;
          },
        ),
        { numRuns: 30 },
      );
    });

    it('MR12.2: tempoConfidence components are bounded [0, 100]', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          nLevelArb,
          fc.array(trialConfigArb, { minLength: 15, maxLength: 30 }),
          (sessionId, nLevel, trials) => {
            const events = generateSession(sessionId, nLevel, trials, true);
            const summary = SessionProjector.project(events);

            if (!summary || summary.tempoConfidence === null) return true;

            const c = summary.tempoConfidence.components;
            return (
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
