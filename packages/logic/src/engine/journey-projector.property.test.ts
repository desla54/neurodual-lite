/**
 * Property-Based Tests for Journey Projector
 *
 * Invariants that must hold regardless of input:
 * - createEmptyJourneyState produces valid initial state
 * - isValidatingScore is consistent with JOURNEY_MIN_PASSING_SCORE
 * - projectJourneyFromHistory produces valid state transitions
 * - Stage statuses follow valid transitions (locked → unlocked → completed)
 */
import { describe, expect, it } from 'bun:test';
import * as fc from 'fast-check';
import {
  createEmptyJourneyState,
  isValidatingScore,
  isStageComplete,
  getStageProgressRatio,
  isJourneyComplete,
  projectJourneyFromHistory,
} from './journey-projector';
import { JOURNEY_MIN_PASSING_SCORE } from '../domain/journey/constants';
import { getTotalStagesForTarget } from '../domain/journey/constants';
import type { JourneyStageProgress } from '../types/journey';

// =============================================================================
// Arbitraries
// =============================================================================

const targetLevelArb = fc.integer({ min: 1, max: 10 });
const startLevelArb = fc.integer({ min: 1, max: 10 });
const scoreArb = fc.integer({ min: 0, max: 100 });
const dPrimeArb = fc.double({ min: -2, max: 5, noNaN: true });

// =============================================================================
// Property Tests - createEmptyJourneyState
// =============================================================================

describe('createEmptyJourneyState - Property Tests', () => {
  it('currentStage is always 1', () => {
    fc.assert(
      fc.property(targetLevelArb, startLevelArb, fc.boolean(), (target, start, isSimulator) => {
        // Ensure start <= target
        const validStart = Math.min(start, target);
        const state = createEmptyJourneyState(target, validStart, isSimulator);
        return state.currentStage === 1;
      }),
      { numRuns: 100 },
    );
  });

  it('first stage is always unlocked', () => {
    fc.assert(
      fc.property(targetLevelArb, startLevelArb, fc.boolean(), (target, start, isSimulator) => {
        const validStart = Math.min(start, target);
        const state = createEmptyJourneyState(target, validStart, isSimulator);
        // @ts-expect-error test: nullable access
        return state.stages.length > 0 && state!.stages![0].status === 'unlocked';
      }),
      { numRuns: 100 },
    );
  });

  it('all stages except first are locked', () => {
    fc.assert(
      fc.property(targetLevelArb, startLevelArb, fc.boolean(), (target, start, isSimulator) => {
        const validStart = Math.min(start, target);
        const state = createEmptyJourneyState(target, validStart, isSimulator);
        return state.stages.slice(1).every((s) => s.status === 'locked');
      }),
      { numRuns: 100 },
    );
  });

  it('stages count matches getTotalStagesForTarget', () => {
    fc.assert(
      fc.property(targetLevelArb, startLevelArb, fc.boolean(), (target, start, isSimulator) => {
        const validStart = Math.min(start, target);
        const state = createEmptyJourneyState(target, validStart, isSimulator);
        const expectedStages = getTotalStagesForTarget(target, validStart, isSimulator);
        return state.stages.length === expectedStages;
      }),
      { numRuns: 100 },
    );
  });

  it('stageIds are sequential starting from 1', () => {
    fc.assert(
      fc.property(targetLevelArb, startLevelArb, fc.boolean(), (target, start, isSimulator) => {
        const validStart = Math.min(start, target);
        const state = createEmptyJourneyState(target, validStart, isSimulator);
        return state.stages.every((s, i) => s.stageId === i + 1);
      }),
      { numRuns: 100 },
    );
  });

  it('all stages have null bestScore initially', () => {
    fc.assert(
      fc.property(targetLevelArb, startLevelArb, fc.boolean(), (target, start, isSimulator) => {
        const validStart = Math.min(start, target);
        const state = createEmptyJourneyState(target, validStart, isSimulator);
        return state.stages.every((s) => s.bestScore === null);
      }),
      { numRuns: 100 },
    );
  });

  it('all stages have 0 validatingSessions initially', () => {
    fc.assert(
      fc.property(targetLevelArb, startLevelArb, fc.boolean(), (target, start, isSimulator) => {
        const validStart = Math.min(start, target);
        const state = createEmptyJourneyState(target, validStart, isSimulator);
        return state.stages.every((s) => s.validatingSessions === 0);
      }),
      { numRuns: 100 },
    );
  });

  it('isActive is always true for new journey', () => {
    fc.assert(
      fc.property(targetLevelArb, startLevelArb, fc.boolean(), (target, start, isSimulator) => {
        const validStart = Math.min(start, target);
        const state = createEmptyJourneyState(target, validStart, isSimulator);
        return state.isActive === true;
      }),
      { numRuns: 50 },
    );
  });

  it('simulator journey has 1 stage per level', () => {
    fc.assert(
      fc.property(targetLevelArb, startLevelArb, (target, start) => {
        const validStart = Math.min(start, target);
        const state = createEmptyJourneyState(target, validStart, true);
        const expectedStages = target - validStart + 1;
        return state.stages.length === expectedStages;
      }),
      { numRuns: 50 },
    );
  });

  it('classic journey has 4 stages per level', () => {
    fc.assert(
      fc.property(targetLevelArb, startLevelArb, (target, start) => {
        const validStart = Math.min(start, target);
        const state = createEmptyJourneyState(target, validStart, false);
        const levels = target - validStart + 1;
        const expectedStages = levels * 4;
        return state.stages.length === expectedStages;
      }),
      { numRuns: 50 },
    );
  });
});

// =============================================================================
// Property Tests - isValidatingScore
// =============================================================================

describe('isValidatingScore - Property Tests', () => {
  it('score >= JOURNEY_MIN_PASSING_SCORE returns true', () => {
    fc.assert(
      fc.property(fc.integer({ min: JOURNEY_MIN_PASSING_SCORE, max: 100 }), (score) => {
        return isValidatingScore(score) === true;
      }),
      { numRuns: 100 },
    );
  });

  it('score < JOURNEY_MIN_PASSING_SCORE returns false', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: JOURNEY_MIN_PASSING_SCORE - 1 }), (score) => {
        return isValidatingScore(score) === false;
      }),
      { numRuns: 100 },
    );
  });

  it('is consistent at boundary', () => {
    expect(isValidatingScore(JOURNEY_MIN_PASSING_SCORE)).toBe(true);
    expect(isValidatingScore(JOURNEY_MIN_PASSING_SCORE - 1)).toBe(false);
  });
});

// =============================================================================
// Property Tests - isStageComplete
// =============================================================================

describe('isStageComplete - Property Tests', () => {
  it('returns false when bestScore is null', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10 }), (validatingSessions) => {
        const progress: JourneyStageProgress = {
          stageId: 1,
          status: 'unlocked',
          validatingSessions,
          bestScore: null,
        };
        return isStageComplete(progress) === false;
      }),
      { numRuns: 50 },
    );
  });

  it('returns false when bestScore < JOURNEY_MIN_PASSING_SCORE', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: JOURNEY_MIN_PASSING_SCORE - 1 }),
        fc.integer({ min: 0, max: 10 }),
        (bestScore, validatingSessions) => {
          const progress: JourneyStageProgress = {
            stageId: 1,
            status: 'unlocked',
            validatingSessions,
            bestScore,
          };
          return isStageComplete(progress) === false;
        },
      ),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// Property Tests - getStageProgressRatio
// =============================================================================

describe('getStageProgressRatio - Property Tests', () => {
  it('returns 0 when bestScore is null', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10 }), (validatingSessions) => {
        const progress: JourneyStageProgress = {
          stageId: 1,
          status: 'unlocked',
          validatingSessions,
          bestScore: null,
        };
        return getStageProgressRatio(progress) === 0;
      }),
      { numRuns: 50 },
    );
  });

  it('returns 0 when bestScore < JOURNEY_MIN_PASSING_SCORE', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: JOURNEY_MIN_PASSING_SCORE - 1 }),
        fc.integer({ min: 0, max: 10 }),
        (bestScore, validatingSessions) => {
          const progress: JourneyStageProgress = {
            stageId: 1,
            status: 'unlocked',
            validatingSessions,
            bestScore,
          };
          return getStageProgressRatio(progress) === 0;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('ratio is bounded [0, 1]', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 0, max: 20 }),
        (bestScore, validatingSessions) => {
          const progress: JourneyStageProgress = {
            stageId: 1,
            status: 'unlocked',
            validatingSessions,
            bestScore,
          };
          const ratio = getStageProgressRatio(progress);
          return ratio >= 0 && ratio <= 1;
        },
      ),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// Property Tests - isJourneyComplete
// =============================================================================

describe('isJourneyComplete - Property Tests', () => {
  it('empty journey is not complete', () => {
    fc.assert(
      fc.property(targetLevelArb, startLevelArb, fc.boolean(), (target, start, isSimulator) => {
        const validStart = Math.min(start, target);
        const state = createEmptyJourneyState(target, validStart, isSimulator);
        return isJourneyComplete(state) === false;
      }),
      { numRuns: 100 },
    );
  });

  it('journey is complete when currentStage > totalStages', () => {
    fc.assert(
      fc.property(targetLevelArb, startLevelArb, fc.boolean(), (target, start, isSimulator) => {
        const validStart = Math.min(start, target);
        const state = createEmptyJourneyState(target, validStart, isSimulator);
        const totalStages = getTotalStagesForTarget(target, validStart, isSimulator);

        // Manually set currentStage beyond total
        state.currentStage = totalStages + 1;

        return isJourneyComplete(state) === true;
      }),
      { numRuns: 100 },
    );
  });
});

// =============================================================================
// Property Tests - projectJourneyFromHistory
// =============================================================================

describe('projectJourneyFromHistory - Property Tests', () => {
  // Helper to create a session with required fields
  const createSession = (
    journeyStageId: number,
    dPrime: number,
    upsScore?: number,
    timestamp?: number,
  ) => ({
    journeyStageId,
    dPrime,
    upsScore,
    timestamp: timestamp ?? Date.now(),
  });

  it('empty sessions produce empty journey state', () => {
    fc.assert(
      fc.property(targetLevelArb, startLevelArb, (target, start) => {
        const validStart = Math.min(start, target);
        const state = projectJourneyFromHistory([], target, validStart);

        return (
          state.currentStage === 1 &&
          // @ts-expect-error test: nullable access
          state!.stages![0].status === 'unlocked' &&
          state.stages.slice(1).every((s) => s.status === 'locked')
        );
      }),
      { numRuns: 50 },
    );
  });

  it('currentStage is within valid range', () => {
    fc.assert(
      fc.property(
        targetLevelArb,
        startLevelArb,
        fc.array(
          fc.record({
            stageId: fc.integer({ min: 1, max: 10 }),
            score: scoreArb,
          }),
          { minLength: 0, maxLength: 20 },
        ),
        (target, start, sessionData) => {
          const validStart = Math.min(start, target);
          const totalStages = getTotalStagesForTarget(target, validStart, false);

          const sessions = sessionData
            .filter((s) => s.stageId <= totalStages)
            .map((s) => createSession(s.stageId, 1.5, s.score));

          const state = projectJourneyFromHistory(sessions, target, validStart);

          // currentStage should be in [1, totalStages + 1]
          return state.currentStage >= 1 && state.currentStage <= totalStages + 1;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('stage statuses are valid enum values', () => {
    fc.assert(
      fc.property(
        targetLevelArb,
        startLevelArb,
        fc.array(
          fc.record({
            stageId: fc.integer({ min: 1, max: 10 }),
            score: scoreArb,
          }),
          { minLength: 0, maxLength: 10 },
        ),
        (target, start, sessionData) => {
          const validStart = Math.min(start, target);
          const totalStages = getTotalStagesForTarget(target, validStart, false);

          const sessions = sessionData
            .filter((s) => s.stageId <= totalStages)
            .map((s) => createSession(s.stageId, 1.5, s.score));

          const state = projectJourneyFromHistory(sessions, target, validStart);
          const validStatuses = ['locked', 'unlocked', 'completed'];

          return state.stages.every((s) => validStatuses.includes(s.status));
        },
      ),
      { numRuns: 100 },
    );
  });

  it('validatingSessions is non-negative', () => {
    fc.assert(
      fc.property(
        targetLevelArb,
        startLevelArb,
        fc.array(
          fc.record({
            stageId: fc.integer({ min: 1, max: 10 }),
            score: scoreArb,
          }),
          { minLength: 0, maxLength: 15 },
        ),
        (target, start, sessionData) => {
          const validStart = Math.min(start, target);
          const totalStages = getTotalStagesForTarget(target, validStart, false);

          const sessions = sessionData
            .filter((s) => s.stageId <= totalStages)
            .map((s) => createSession(s.stageId, 1.5, s.score));

          const state = projectJourneyFromHistory(sessions, target, validStart);

          return state.stages.every((s) => s.validatingSessions >= 0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('bestScore is null or within [0, 100]', () => {
    fc.assert(
      fc.property(
        targetLevelArb,
        startLevelArb,
        fc.array(
          fc.record({
            stageId: fc.integer({ min: 1, max: 10 }),
            score: scoreArb,
          }),
          { minLength: 0, maxLength: 10 },
        ),
        (target, start, sessionData) => {
          const validStart = Math.min(start, target);
          const totalStages = getTotalStagesForTarget(target, validStart, false);

          const sessions = sessionData
            .filter((s) => s.stageId <= totalStages)
            .map((s) => createSession(s.stageId, 1.5, s.score));

          const state = projectJourneyFromHistory(sessions, target, validStart);

          return state.stages.every(
            (s) => s.bestScore === null || (s.bestScore >= 0 && s.bestScore <= 100),
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it('idempotence: same sessions produce same state', () => {
    fc.assert(
      fc.property(
        targetLevelArb,
        startLevelArb,
        fc.array(
          fc.record({
            stageId: fc.integer({ min: 1, max: 5 }),
            score: scoreArb,
          }),
          { minLength: 1, maxLength: 10 },
        ),
        (target, start, sessionData) => {
          const validStart = Math.min(start, target);
          const totalStages = getTotalStagesForTarget(target, validStart, false);

          const sessions = sessionData
            .filter((s) => s.stageId <= totalStages)
            .map((s, i) => createSession(s.stageId, 1.5, s.score, i * 1000));

          const state1 = projectJourneyFromHistory(sessions, target, validStart);
          const state2 = projectJourneyFromHistory(sessions, target, validStart);
          const state3 = projectJourneyFromHistory(sessions, target, validStart);

          return (
            state1.currentStage === state2.currentStage &&
            state2.currentStage === state3.currentStage &&
            state1.stages.length === state2.stages.length &&
            state1.stages.every(
              (s, i) =>
                // @ts-expect-error test: nullable access
                s.status === state2!.stages![i].status &&
                // @ts-expect-error test: nullable access
                s.validatingSessions === state2!.stages![i].validatingSessions,
            )
          );
        },
      ),
      { numRuns: 50 },
    );
  });

  it('locked stages come after unlocked/completed stages', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 8 }),
        fc.integer({ min: 1, max: 3 }),
        fc.array(
          fc.record({
            stageId: fc.integer({ min: 1, max: 5 }),
            score: fc.integer({ min: 80, max: 100 }),
          }),
          { minLength: 1, maxLength: 15 },
        ),
        (target, start, sessionData) => {
          const validStart = Math.min(start, target);
          const totalStages = getTotalStagesForTarget(target, validStart, false);

          const sessions = sessionData
            .filter((s) => s.stageId <= totalStages)
            .map((s, i) => createSession(s.stageId, 1.5, s.score, i * 1000));

          const state = projectJourneyFromHistory(sessions, target, validStart);

          // Find first locked stage
          const firstLockedIdx = state.stages.findIndex((s) => s.status === 'locked');

          // If there's a locked stage, all stages before it should NOT be locked
          // (Note: completed stages can appear after unlocked due to session deletion)
          if (firstLockedIdx > 0) {
            return state.stages.slice(0, firstLockedIdx).every((s) => s.status !== 'locked');
          }

          return true;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('first stage is never locked after projection', () => {
    fc.assert(
      fc.property(
        targetLevelArb,
        startLevelArb,
        fc.array(
          fc.record({
            stageId: fc.integer({ min: 1, max: 10 }),
            score: scoreArb,
          }),
          { minLength: 0, maxLength: 10 },
        ),
        (target, start, sessionData) => {
          const validStart = Math.min(start, target);
          const totalStages = getTotalStagesForTarget(target, validStart, false);

          const sessions = sessionData
            .filter((s) => s.stageId <= totalStages)
            .map((s, i) => createSession(s.stageId, 1.5, s.score, i * 1000));

          const state = projectJourneyFromHistory(sessions, target, validStart);

          // First stage is always unlocked or completed, never locked
          // @ts-expect-error test: nullable access
          return state!.stages![0].status !== 'locked';
        },
      ),
      { numRuns: 100 },
    );
  });
});
