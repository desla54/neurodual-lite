/**
 * Journey Projector Tests
 *
 * Tests for the journey state projection logic.
 * Binary progression (Jaeggi + BrainWorkshop) and Dual Catch continuous progression.
 */

import { describe, expect, it } from 'bun:test';
import {
  projectJourneyFromHistory,
  createEmptyJourneyState,
  getCurrentStageProgress,
  isJourneyComplete,
} from './journey-projector';
import { getTotalStagesForTarget } from '../domain/journey/constants';

describe('Journey Projector', () => {
  describe('projectJourneyFromHistory', () => {
    describe('continuous simulator progression (Dual Catch)', () => {
      it('should fill progressPct and unlock next stage when reaching 100%', () => {
        const journeyId = 'dual-catch-journey';
        const sessions = Array.from({ length: 15 }, (_, i) => ({
          journeyStageId: 1,
          journeyId,
          nLevel: 2,
          dPrime: 2.5,
          gameMode: 'dual-catch' as const,
          timestamp: i + 1,
        }));

        const state = projectJourneyFromHistory(sessions, 3, 2, journeyId, true, 'dual-catch');

        expect(state.currentStage).toBe(2);
        expect(state.stages[0]?.status).toBe('completed');
        expect(state.stages[0]?.progressPct).toBe(100);
        expect(state.stages[1]?.status).toBe('unlocked');
        expect(state.stages[1]?.progressPct).toBe(0);
      });
    });

    describe('continuous simulator progression (Dual Track)', () => {
      it('should accumulate visible progress before the stage is fully completed', () => {
        const journeyId = 'dual-track-journey';
        const sessions = [
          {
            journeyStageId: 1,
            journeyId,
            nLevel: 4,
            dPrime: 0,
            gameMode: 'dual-track' as const,
            upsScore: 74,
            timestamp: 1,
          },
        ];

        const state = projectJourneyFromHistory(sessions, 5, 4, journeyId, true, 'dual-track');

        expect(state.currentStage).toBe(1);
        expect(state.stages[0]?.status).toBe('unlocked');
        expect(state.stages[0]?.validatingSessions).toBe(0);
        // 74 UPS → +3% (new conservative delta)
        expect(state.stages[0]?.progressPct).toBe(3);
      });

      it('should prefer adaptive path progress over the fallback UPS estimate', () => {
        const journeyId = 'dual-track-journey';
        const sessions = [
          {
            journeyStageId: 1,
            journeyId,
            nLevel: 4,
            dPrime: 0,
            gameMode: 'dual-track' as const,
            upsScore: 92,
            adaptivePathProgressPct: 12,
            timestamp: 1,
          },
        ];

        const state = projectJourneyFromHistory(sessions, 5, 4, journeyId, true, 'dual-track');

        expect(state.currentStage).toBe(1);
        expect(state.stages[0]?.progressPct).toBe(12);
      });

      it('should complete the stage and unlock the next one after enough strong sessions', () => {
        const journeyId = 'dual-track-journey';
        // Need ~15 sessions at 92 UPS (+7% each) to reach 100%
        const sessions = Array.from({ length: 15 }, (_, index) => ({
          journeyStageId: 1,
          journeyId,
          nLevel: 4,
          dPrime: 0,
          gameMode: 'dual-track' as const,
          upsScore: 92,
          timestamp: index + 1,
        }));

        const state = projectJourneyFromHistory(sessions, 5, 4, journeyId, true, 'dual-track');

        expect(state.currentStage).toBe(2);
        expect(state.stages[0]?.status).toBe('completed');
        expect(state.stages[0]?.progressPct).toBe(100);
        expect(state.stages[1]?.status).toBe('unlocked');
      });

      it('should still allow completion on repeated near-perfect sessions', () => {
        const journeyId = 'dual-track-journey';
        // 15 sessions at 99 UPS → +7% each = 105% (clamped to 100%)
        const sessions = Array.from({ length: 15 }, (_, index) => ({
          journeyStageId: 1,
          journeyId,
          nLevel: 4,
          dPrime: 0,
          gameMode: 'dual-track' as const,
          upsScore: 99,
          timestamp: index + 1,
        }));

        const state = projectJourneyFromHistory(sessions, 5, 4, journeyId, true, 'dual-track');

        expect(state.currentStage).toBe(2);
        expect(state.stages[0]?.status).toBe('completed');
        expect(state.stages[0]?.progressPct).toBe(100);
        expect(state.stages[1]?.status).toBe('unlocked');
      });

      it('should allow weak sessions to reduce the current mastery bar', () => {
        const journeyId = 'dual-track-journey';
        const sessions = [
          {
            journeyStageId: 1,
            journeyId,
            nLevel: 4,
            dPrime: 0,
            gameMode: 'dual-track' as const,
            upsScore: 90,
            timestamp: 1,
          },
          {
            journeyStageId: 1,
            journeyId,
            nLevel: 4,
            dPrime: 0,
            gameMode: 'dual-track' as const,
            upsScore: 45,
            timestamp: 2,
          },
        ];

        const state = projectJourneyFromHistory(sessions, 5, 4, journeyId, true, 'dual-track');

        expect(state.currentStage).toBe(1);
        expect(state.stages[0]?.status).toBe('unlocked');
        // 90 UPS → +7%, then 45 UPS → -4% = 3%
        expect(state.stages[0]?.progressPct).toBe(3);
      });
    });

    describe('binary simulator progression (Jaeggi)', () => {
      it('advances after one track calibration and two consecutive clean DNB sessions', () => {
        const journeyId = 'dual-track-dnb-journey';
        const passingModality = {
          position: { hits: 9, misses: 0, falseAlarms: 0, correctRejections: 10 },
          audio: { hits: 8, misses: 1, falseAlarms: 0, correctRejections: 10 },
        };
        const sessions = [
          {
            journeyStageId: 1,
            journeyId,
            nLevel: 2,
            dPrime: 0,
            gameMode: 'dual-track' as const,
            upsScore: 88,
            timestamp: 1,
          },
          {
            journeyStageId: 1,
            journeyId,
            nLevel: 2,
            dPrime: 0,
            gameMode: 'dualnback-classic' as const,
            timestamp: 2,
            byModality: passingModality,
          },
          {
            journeyStageId: 1,
            journeyId,
            nLevel: 2,
            dPrime: 0,
            gameMode: 'dualnback-classic' as const,
            timestamp: 3,
            byModality: passingModality,
          },
        ];

        const state = projectJourneyFromHistory(
          sessions,
          5,
          2,
          journeyId,
          true,
          'dual-track-dnb-hybrid',
        );

        expect(state.currentStage).toBe(2);
        expect(state.stages[0]?.status).toBe('completed');
        expect(state.nextSessionGameMode).toBe('dual-track');
        expect(state.acceptedSessionCount).toBe(3);
      });

      it('keeps the same level after the track half until the dual n-back half is completed', () => {
        const journeyId = 'dual-track-dnb-journey';
        const sessions = [
          {
            journeyStageId: 1,
            journeyId,
            nLevel: 2,
            dPrime: 0,
            gameMode: 'dual-track' as const,
            upsScore: 91,
            timestamp: 1,
          },
        ];

        const state = projectJourneyFromHistory(
          sessions,
          5,
          2,
          journeyId,
          true,
          'dual-track-dnb-hybrid',
        );

        expect(state.currentStage).toBe(1);
        expect(state.stages[0]?.status).toBe('unlocked');
        expect(state.stages[0]?.bestScore).toBeNull();
        expect(state.stages[0]?.progressPct).toBe(25);
        expect(state.nextSessionGameMode).toBe('dualnback-classic');
      });

      it('accepts track sessions whose nLevel (MOT targetCount) differs from the N-back level', () => {
        const journeyId = 'dual-track-dnb-journey';
        // Track sessions store targetCount (e.g. 3) in nLevel, NOT the N-back level (e.g. 2).
        // The projector must not filter them out by nLevel.
        const sessions = [
          {
            journeyStageId: 1,
            journeyId,
            nLevel: 3, // MOT targetCount, different from startLevel=2
            dPrime: 0,
            gameMode: 'dual-track' as const,
            upsScore: 91,
            timestamp: 1,
          },
        ];

        const state = projectJourneyFromHistory(
          sessions,
          5,
          2,
          journeyId,
          true,
          'dual-track-dnb-hybrid',
        );

        expect(state.currentStage).toBe(1);
        expect(state.stages[0]?.progressPct).toBe(25);
        expect(state.nextSessionGameMode).toBe('dualnback-classic');
        expect(state.acceptedSessionCount).toBe(1);
      });

      it('stays in DNB phase after two consecutive stay-zone DNB sessions (stay does not build streaks)', () => {
        const journeyId = 'dual-track-dnb-journey';
        const stayModality = {
          position: { hits: 7, misses: 1, falseAlarms: 1, correctRejections: 10 },
          audio: { hits: 7, misses: 0, falseAlarms: 0, correctRejections: 10 },
        };
        const sessions = [
          {
            journeyStageId: 1,
            journeyId,
            nLevel: 2,
            dPrime: 0,
            gameMode: 'dual-track' as const,
            upsScore: 91,
            timestamp: 1,
          },
          {
            journeyStageId: 1,
            journeyId,
            nLevel: 2,
            dPrime: 0,
            gameMode: 'dualnback-classic' as const,
            timestamp: 2,
            byModality: stayModality,
          },
          {
            journeyStageId: 1,
            journeyId,
            nLevel: 2,
            dPrime: 0,
            gameMode: 'dualnback-classic' as const,
            timestamp: 3,
            byModality: stayModality,
          },
        ];

        const state = projectJourneyFromHistory(
          sessions,
          5,
          2,
          journeyId,
          true,
          'dual-track-dnb-hybrid',
        );

        // 2× stay does NOT trigger an early block end — 1 DNB session remaining
        expect(state.currentStage).toBe(1);
        expect(state.stages[0]?.status).toBe('unlocked');
        expect(state.stages[0]?.progressPct).toBe(75); // 3/4 sessions done in cycle
        expect(state.nextSessionGameMode).toBe('dualnback-classic');
      });

      it('supports custom block sizes for the hybrid loop', () => {
        const journeyId = 'dual-track-dnb-journey';
        const sessions = [
          {
            journeyStageId: 1,
            journeyId,
            nLevel: 2,
            dPrime: 0,
            gameMode: 'dual-track' as const,
            upsScore: 88,
            timestamp: 1,
          },
          {
            journeyStageId: 1,
            journeyId,
            nLevel: 2,
            dPrime: 0,
            gameMode: 'dual-track' as const,
            upsScore: 90,
            timestamp: 2,
          },
        ];

        const state = projectJourneyFromHistory(
          sessions,
          5,
          2,
          journeyId,
          true,
          'dual-track-dnb-hybrid',
          {
            trackSessionsPerBlock: 2,
            dnbSessionsPerBlock: 3,
          },
        );

        expect(state.currentStage).toBe(1);
        expect(state.nextSessionGameMode).toBe('dualnback-classic');
        expect(state.stages[0]?.progressPct).toBe(40);
      });

      it('tracks exact hybrid progress during the track half', () => {
        const journeyId = 'dual-track-dnb-journey';
        const sessions = [
          {
            journeyStageId: 1,
            journeyId,
            nLevel: 2,
            dPrime: 0,
            gameMode: 'dual-track' as const,
            upsScore: 88,
            timestamp: 1,
          },
        ];

        const state = projectJourneyFromHistory(
          sessions,
          5,
          2,
          journeyId,
          true,
          'dual-track-dnb-hybrid',
          {
            trackSessionsPerBlock: 2,
            dnbSessionsPerBlock: 2,
          },
        );

        expect(state.stages[0]?.hybridProgress).toEqual({
          loopPhase: 'track',
          trackSessionsCompleted: 1,
          trackSessionsRequired: 2,
          dnbSessionsCompleted: 0,
          dnbSessionsRequired: 2,
        });
      });

      it('tracks exact clean validation streak during the DNB half', () => {
        const journeyId = 'dual-track-dnb-journey';
        const passingModality = {
          position: { hits: 9, misses: 0, falseAlarms: 0, correctRejections: 10 },
          audio: { hits: 8, misses: 1, falseAlarms: 0, correctRejections: 10 },
        };
        const sessions = [
          {
            journeyStageId: 1,
            journeyId,
            nLevel: 2,
            dPrime: 0,
            gameMode: 'dual-track' as const,
            upsScore: 88,
            timestamp: 1,
          },
          {
            journeyStageId: 1,
            journeyId,
            nLevel: 2,
            dPrime: 0,
            gameMode: 'dualnback-classic' as const,
            timestamp: 2,
            byModality: passingModality,
          },
        ];

        const state = projectJourneyFromHistory(
          sessions,
          5,
          2,
          journeyId,
          true,
          'dual-track-dnb-hybrid',
        );

        expect(state.stages[0]?.hybridProgress).toEqual({
          loopPhase: 'dnb',
          trackSessionsCompleted: 1,
          trackSessionsRequired: 1,
          dnbSessionsCompleted: 1,
          dnbSessionsRequired: 3,
          decisionZone: 'clean',
          decisionStreakCount: 1,
          decisionStreakRequired: 2,
        });
      });

      it('tracks exact failure streak during the DNB half', () => {
        const journeyId = 'dual-track-dnb-journey';
        const downModality = {
          position: { hits: 4, misses: 3, falseAlarms: 1, correctRejections: 10 },
          audio: { hits: 4, misses: 2, falseAlarms: 1, correctRejections: 10 },
        };
        const sessions = [
          {
            journeyStageId: 1,
            journeyId,
            nLevel: 2,
            dPrime: 0,
            gameMode: 'dual-track' as const,
            upsScore: 88,
            timestamp: 1,
          },
          {
            journeyStageId: 1,
            journeyId,
            nLevel: 2,
            dPrime: 0,
            gameMode: 'dualnback-classic' as const,
            timestamp: 2,
            byModality: downModality,
          },
        ];

        const state = projectJourneyFromHistory(
          sessions,
          5,
          2,
          journeyId,
          true,
          'dual-track-dnb-hybrid',
        );

        expect(state.stages[0]?.hybridProgress).toEqual({
          loopPhase: 'dnb',
          trackSessionsCompleted: 1,
          trackSessionsRequired: 1,
          dnbSessionsCompleted: 1,
          dnbSessionsRequired: 3,
          decisionZone: 'down',
          decisionStreakCount: 1,
          decisionStreakRequired: 2,
        });
      });

      it('should advance with byModality stats (production code path)', () => {
        const journeyId = 'dualnback-classic-journey';
        const sessions = [
          {
            journeyStageId: 1,
            journeyId,
            nLevel: 2,
            dPrime: 0,
            gameMode: 'dualnback-classic' as const,
            upsScore: 80,
            timestamp: 1,
            byModality: {
              position: { hits: 9, misses: 1, falseAlarms: 0, correctRejections: 10 },
              audio: { hits: 8, misses: 1, falseAlarms: 1, correctRejections: 10 },
            },
          },
        ];

        const state = projectJourneyFromHistory(
          sessions,
          5,
          2,
          journeyId,
          true,
          'dualnback-classic',
        );

        // < 3 errors per modality → score 100 → UP → advance to stage 2
        expect(state.currentStage).toBe(2);
        expect(state.stages[0]?.status).toBe('completed');
        expect(state.stages[1]?.status).toBe('unlocked');
      });

      it('marks the last stage as completed when the journey finishes (start=2, target=5)', () => {
        const journeyId = 'dualnback-classic-journey';
        const passingModality = {
          position: { hits: 9, misses: 1, falseAlarms: 0, correctRejections: 10 },
          audio: { hits: 9, misses: 0, falseAlarms: 1, correctRejections: 10 },
        };
        const sessions = [
          {
            journeyStageId: 1,
            journeyId,
            nLevel: 2,
            dPrime: 0,
            gameMode: 'dualnback-classic' as const,
            timestamp: 1,
            byModality: passingModality,
          },
          {
            journeyStageId: 2,
            journeyId,
            nLevel: 3,
            dPrime: 0,
            gameMode: 'dualnback-classic' as const,
            timestamp: 2,
            byModality: passingModality,
          },
          {
            journeyStageId: 3,
            journeyId,
            nLevel: 4,
            dPrime: 0,
            gameMode: 'dualnback-classic' as const,
            timestamp: 3,
            byModality: passingModality,
          },
          {
            journeyStageId: 4,
            journeyId,
            nLevel: 5,
            dPrime: 0,
            gameMode: 'dualnback-classic' as const,
            timestamp: 4,
            byModality: passingModality,
          },
        ];

        const state = projectJourneyFromHistory(
          sessions,
          5,
          2,
          journeyId,
          true,
          'dualnback-classic',
        );
        const totalStages = getTotalStagesForTarget(5, 2, true);

        expect(state.currentStage).toBe(totalStages + 1);
        expect(isJourneyComplete(state)).toBe(true);
        expect(getCurrentStageProgress(state)).toBeNull();
        expect(state.stages[totalStages - 1]?.status).toBe('completed');
      });

      it('should NOT advance when byModality has >= 3 errors per modality', () => {
        const journeyId = 'dualnback-classic-journey';
        const sessions = [
          {
            journeyStageId: 1,
            journeyId,
            nLevel: 2,
            dPrime: 0,
            gameMode: 'dualnback-classic' as const,
            upsScore: 100,
            timestamp: 1,
            byModality: {
              position: { hits: 7, misses: 2, falseAlarms: 1, correctRejections: 10 },
              audio: { hits: 5, misses: 3, falseAlarms: 2, correctRejections: 10 },
            },
          },
        ];

        const state = projectJourneyFromHistory(
          sessions,
          5,
          2,
          journeyId,
          true,
          'dualnback-classic',
        );

        // audio: 3 misses + 2 FA = 5 errors >= 3 → STAY
        expect(state.currentStage).toBe(1);
        expect(state.stages[0]?.status).toBe('unlocked');
      });

      it('should NOT advance on passive session with zero hits even if errors are low', () => {
        const journeyId = 'dualnback-classic-journey';
        const sessions = [
          {
            journeyStageId: 1,
            journeyId,
            nLevel: 2,
            dPrime: 0,
            gameMode: 'dualnback-classic' as const,
            timestamp: 1,
            byModality: {
              position: { hits: 0, misses: 1, falseAlarms: 0, correctRejections: 10 },
              audio: { hits: 0, misses: 2, falseAlarms: 0, correctRejections: 10 },
            },
          },
        ];

        const state = projectJourneyFromHistory(
          sessions,
          5,
          2,
          journeyId,
          true,
          'dualnback-classic',
        );

        expect(state.currentStage).toBe(1);
        expect(state.stages[0]?.status).toBe('unlocked');
      });

      it('should not skip levels when replaying the same N-level after an UP', () => {
        const journeyId = 'dualnback-classic-journey';
        // All 3 sessions have < 3 errors per modality → UP
        // But only the first one is at currentNLevel=2, the rest replay N=2 after UP to N=3
        const passingModality = {
          position: { hits: 9, misses: 1, falseAlarms: 0, correctRejections: 10 },
          audio: { hits: 9, misses: 0, falseAlarms: 1, correctRejections: 10 },
        };
        const sessions = [
          {
            journeyStageId: 1,
            journeyId,
            nLevel: 2,
            dPrime: 0,
            gameMode: 'dualnback-classic' as const,
            timestamp: 1,
            byModality: passingModality,
          },
          {
            journeyStageId: 1,
            journeyId,
            nLevel: 2,
            dPrime: 0,
            gameMode: 'dualnback-classic' as const,
            timestamp: 2,
            byModality: passingModality,
          },
          {
            journeyStageId: 1,
            journeyId,
            nLevel: 2,
            dPrime: 0,
            gameMode: 'dualnback-classic' as const,
            timestamp: 3,
            byModality: passingModality,
          },
        ];

        const state = projectJourneyFromHistory(
          sessions,
          5,
          2,
          journeyId,
          true,
          'dualnback-classic',
        );

        expect(state.currentStage).toBe(2);
        expect(state.stages[0]?.status).toBe('completed');
        expect(state.stages[1]?.status).toBe('unlocked');
        expect(state.stages[2]?.status).toBe('locked');
      });

      it('should suggest journey expansion when regressing below startLevel', () => {
        const journeyId = 'dualnback-classic-journey';
        // > 5 errors on worst modality → DOWN (from N=2 to N=1, below startLevel=2)
        const sessions = [
          {
            journeyStageId: 1,
            journeyId,
            nLevel: 2,
            dPrime: 0,
            gameMode: 'dualnback-classic' as const,
            timestamp: 1,
            byModality: {
              position: { hits: 3, misses: 4, falseAlarms: 3, correctRejections: 10 },
              audio: { hits: 4, misses: 3, falseAlarms: 3, correctRejections: 10 },
            },
          },
        ];

        const state = projectJourneyFromHistory(
          sessions,
          5,
          2,
          journeyId,
          true,
          'dualnback-classic',
        );

        expect(state.suggestedStartLevel).toBe(1);
        expect(state.currentStage).toBe(1);
      });

      it('should fallback to projected score when byModality is missing', () => {
        const journeyId = 'dualnback-classic-journey';
        const sessions = [
          {
            journeyStageId: 1,
            journeyId,
            nLevel: 2,
            dPrime: 0,
            gameMode: 'dualnback-classic' as const,
            upsScore: 92,
            timestamp: 1,
          },
        ];

        const state = projectJourneyFromHistory(
          sessions,
          5,
          2,
          journeyId,
          true,
          'dualnback-classic',
        );

        expect(state.currentStage).toBe(2);
        expect(state.stages[0]?.status).toBe('completed');
        expect(state.stages[1]?.status).toBe('unlocked');
      });

      it('keeps current level when legacy rows only provide passed=false', () => {
        const journeyId = 'dualnback-classic-journey';
        const sessions = [
          {
            journeyStageId: 1,
            journeyId,
            nLevel: 2,
            dPrime: 0,
            gameMode: 'dualnback-classic' as const,
            timestamp: 1,
            passed: false,
          },
        ];

        const state = projectJourneyFromHistory(
          sessions,
          5,
          2,
          journeyId,
          true,
          'dualnback-classic',
        );

        expect(state.currentStage).toBe(1);
        expect(state.stages[0]?.status).toBe('unlocked');
        expect(state.suggestedStartLevel).toBeUndefined();
      });
    });

    describe('non-binary modes return empty state', () => {
      it('should return empty state for non-binary game modes', () => {
        const sessions = [{ journeyStageId: 1, dPrime: 2.0 }];

        const state = projectJourneyFromHistory(sessions);

        // Non-binary modes return empty state (no active progression)
        expect(state.currentStage).toBe(1);
        // @ts-expect-error test: nullable access
        expect(state!.stages![0].status).toBe('unlocked');
        // @ts-expect-error test: nullable access
        expect(state!.stages![0].validatingSessions).toBe(0);
      });
    });
  });

  describe('Utility Functions', () => {
    it('getCurrentStageProgress should return correct stage or null', () => {
      const state = createEmptyJourneyState(5, 1, true);
      const progress = getCurrentStageProgress(state);
      expect(progress?.stageId).toBe(1);

      const totalStages = getTotalStagesForTarget(5, 1, true);
      state.currentStage = totalStages + 1;
      expect(getCurrentStageProgress(state)).toBeNull();
    });

    it('isJourneyComplete should return true when all stages are done', () => {
      const state = createEmptyJourneyState(5, 1, true);
      expect(isJourneyComplete(state)).toBe(false);

      const totalStages = getTotalStagesForTarget(5, 1, true);
      state.currentStage = totalStages + 1;
      expect(isJourneyComplete(state)).toBe(true);
    });
  });

  describe('sim-brainworkshop progression', () => {
    it('should use BrainWorkshop scoring for sim-brainworkshop mode', () => {
      const journeyId = 'brainworkshop-journey';
      const sessions = [
        {
          journeyStageId: 1,
          journeyId,
          nLevel: 2,
          dPrime: 0,
          gameMode: 'sim-brainworkshop',
          upsScore: 80,
          timestamp: 1,
          byModality: {
            position: { hits: 8, misses: 2, falseAlarms: 1, correctRejections: 9 },
            audio: { hits: 7, misses: 3, falseAlarms: 2, correctRejections: 8 },
          },
        },
      ] as const;

      const state = projectJourneyFromHistory(sessions, 5, 2, journeyId, true, 'sim-brainworkshop');

      expect(state.currentStage).toBeGreaterThanOrEqual(1);
    });

    it('should progress when BrainWorkshop score >= threshold', () => {
      const journeyId = 'brainworkshop-journey';
      const sessions = [
        {
          journeyStageId: 1,
          journeyId,
          nLevel: 2,
          dPrime: 0,
          gameMode: 'sim-brainworkshop',
          upsScore: 85,
          timestamp: 1,
          byModality: {
            position: { hits: 9, misses: 1, falseAlarms: 0, correctRejections: 10 },
            audio: { hits: 9, misses: 1, falseAlarms: 0, correctRejections: 10 },
          },
        },
      ] as const;

      const state = projectJourneyFromHistory(sessions, 5, 2, journeyId, true, 'sim-brainworkshop');

      // @ts-expect-error test: nullable access
      expect(state!.stages![0].status).toBe('completed');
    });

    it('should suggest lower start level when failing repeatedly in BrainWorkshop', () => {
      const journeyId = 'brainworkshop-journey';
      const sessions = [
        {
          journeyStageId: 1,
          journeyId,
          nLevel: 2,
          dPrime: 0,
          gameMode: 'sim-brainworkshop',
          upsScore: 30,
          timestamp: 1,
          byModality: {
            position: { hits: 3, misses: 7, falseAlarms: 5, correctRejections: 5 },
            audio: { hits: 3, misses: 7, falseAlarms: 5, correctRejections: 5 },
          },
        },
        {
          journeyStageId: 1,
          journeyId,
          nLevel: 2,
          dPrime: 0,
          gameMode: 'sim-brainworkshop',
          upsScore: 30,
          timestamp: 2,
          byModality: {
            position: { hits: 3, misses: 7, falseAlarms: 5, correctRejections: 5 },
            audio: { hits: 3, misses: 7, falseAlarms: 5, correctRejections: 5 },
          },
        },
        {
          journeyStageId: 1,
          journeyId,
          nLevel: 2,
          dPrime: 0,
          gameMode: 'sim-brainworkshop',
          upsScore: 30,
          timestamp: 3,
          byModality: {
            position: { hits: 3, misses: 7, falseAlarms: 5, correctRejections: 5 },
            audio: { hits: 3, misses: 7, falseAlarms: 5, correctRejections: 5 },
          },
        },
      ] as const;

      const state = projectJourneyFromHistory(sessions, 5, 2, journeyId, true, 'sim-brainworkshop');

      expect(state.suggestedStartLevel).toBe(1);
    });

    it('marks the last stage as completed when the BrainWorkshop journey finishes (start=2, target=5)', () => {
      const journeyId = 'brainworkshop-journey';
      const passingBwModality = {
        position: { hits: 8, misses: 2, falseAlarms: 0, correctRejections: 10 },
        audio: { hits: 8, misses: 2, falseAlarms: 0, correctRejections: 10 },
      };
      const sessions = [
        {
          journeyStageId: 1,
          journeyId,
          nLevel: 2,
          dPrime: 0,
          gameMode: 'sim-brainworkshop',
          timestamp: 1,
          byModality: passingBwModality,
        },
        {
          journeyStageId: 2,
          journeyId,
          nLevel: 3,
          dPrime: 0,
          gameMode: 'sim-brainworkshop',
          timestamp: 2,
          byModality: passingBwModality,
        },
        {
          journeyStageId: 3,
          journeyId,
          nLevel: 4,
          dPrime: 0,
          gameMode: 'sim-brainworkshop',
          timestamp: 3,
          byModality: passingBwModality,
        },
        {
          journeyStageId: 4,
          journeyId,
          nLevel: 5,
          dPrime: 0,
          gameMode: 'sim-brainworkshop',
          timestamp: 4,
          byModality: passingBwModality,
        },
      ] as const;

      const state = projectJourneyFromHistory(sessions, 5, 2, journeyId, true, 'sim-brainworkshop');
      const totalStages = getTotalStagesForTarget(5, 2, true);

      expect(state.currentStage).toBe(totalStages + 1);
      expect(isJourneyComplete(state)).toBe(true);
      expect(getCurrentStageProgress(state)).toBeNull();
      expect(state.stages[totalStages - 1]?.status).toBe('completed');
    });

    it('resets strikes on UP (accumulated strikes do not carry to next level)', () => {
      const journeyId = 'bw-j';
      const lowScore = {
        position: { hits: 3, misses: 7, falseAlarms: 5, correctRejections: 5 },
        audio: { hits: 3, misses: 7, falseAlarms: 5, correctRejections: 5 },
      };
      const highScore = {
        position: { hits: 9, misses: 1, falseAlarms: 0, correctRejections: 10 },
        audio: { hits: 9, misses: 1, falseAlarms: 0, correctRejections: 10 },
      };
      const sessions = [
        // N=2: 2 strikes then UP → strikes should reset
        {
          journeyStageId: 1,
          journeyId,
          nLevel: 2,
          dPrime: 0,
          gameMode: 'sim-brainworkshop',
          timestamp: 1,
          byModality: lowScore,
        },
        {
          journeyStageId: 1,
          journeyId,
          nLevel: 2,
          dPrime: 0,
          gameMode: 'sim-brainworkshop',
          timestamp: 2,
          byModality: lowScore,
        },
        {
          journeyStageId: 1,
          journeyId,
          nLevel: 2,
          dPrime: 0,
          gameMode: 'sim-brainworkshop',
          timestamp: 3,
          byModality: highScore,
        },
        // N=3: 1 strike then UP → should still UP (strikes were reset at level change)
        {
          journeyStageId: 2,
          journeyId,
          nLevel: 3,
          dPrime: 0,
          gameMode: 'sim-brainworkshop',
          timestamp: 4,
          byModality: lowScore,
        },
        {
          journeyStageId: 2,
          journeyId,
          nLevel: 3,
          dPrime: 0,
          gameMode: 'sim-brainworkshop',
          timestamp: 5,
          byModality: highScore,
        },
      ] as const;

      const state = projectJourneyFromHistory(sessions, 5, 2, journeyId, true, 'sim-brainworkshop');

      // Should be at N=4 (stage 3): UP from 2→3, then UP from 3→4
      expect(state.currentStage).toBe(3);
      expect(state.stages[0]?.status).toBe('completed'); // N=2
      expect(state.stages[1]?.status).toBe('completed'); // N=3
      expect(state.stages[2]?.status).toBe('unlocked'); // N=4
      expect(state.consecutiveStrikes).toBe(0);
    });

    it('resets strikes on DOWN (3 strikes → down, then strikes restart at new level)', () => {
      const journeyId = 'bw-j';
      const lowScore = {
        position: { hits: 3, misses: 7, falseAlarms: 5, correctRejections: 5 },
        audio: { hits: 3, misses: 7, falseAlarms: 5, correctRejections: 5 },
      };
      const midScore = {
        position: { hits: 6, misses: 4, falseAlarms: 1, correctRejections: 9 },
        audio: { hits: 6, misses: 4, falseAlarms: 1, correctRejections: 9 },
      };
      const sessions = [
        // N=3: 3 strikes → DOWN to N=2
        {
          journeyStageId: 2,
          journeyId,
          nLevel: 3,
          dPrime: 0,
          gameMode: 'sim-brainworkshop',
          timestamp: 1,
          byModality: lowScore,
        },
        {
          journeyStageId: 2,
          journeyId,
          nLevel: 3,
          dPrime: 0,
          gameMode: 'sim-brainworkshop',
          timestamp: 2,
          byModality: lowScore,
        },
        {
          journeyStageId: 2,
          journeyId,
          nLevel: 3,
          dPrime: 0,
          gameMode: 'sim-brainworkshop',
          timestamp: 3,
          byModality: lowScore,
        },
        // N=2: 1 strike then STAY → should have exactly 1 strike, NOT 4
        {
          journeyStageId: 1,
          journeyId,
          nLevel: 2,
          dPrime: 0,
          gameMode: 'sim-brainworkshop',
          timestamp: 4,
          byModality: lowScore,
        },
        {
          journeyStageId: 1,
          journeyId,
          nLevel: 2,
          dPrime: 0,
          gameMode: 'sim-brainworkshop',
          timestamp: 5,
          byModality: midScore,
        },
      ] as const;

      const state = projectJourneyFromHistory(sessions, 5, 2, journeyId, true, 'sim-brainworkshop');

      // After DOWN, strikes reset. 1 more strike at N=2, then a STAY. Still at N=2.
      expect(state.currentStage).toBe(1); // stage 1 = N=2 (startLevel=2)
      expect(state.consecutiveStrikes).toBe(1); // only the 1 strike at N=2
    });

    it('handles multimodality Jaeggi: worst modality drives the decision', () => {
      const journeyId = 'jaeggi-j';
      const sessions = [
        {
          journeyStageId: 1,
          journeyId,
          nLevel: 2,
          dPrime: 0,
          gameMode: 'dualnback-classic',
          timestamp: 1,
          byModality: {
            // position: 1 error → fine
            position: { hits: 9, misses: 1, falseAlarms: 0, correctRejections: 10 },
            // audio: 4 errors → worst modality, but < 5, so not DOWN. >= 3, so not UP → STAY
            audio: { hits: 6, misses: 2, falseAlarms: 2, correctRejections: 10 },
          },
        },
      ] as const;

      const state = projectJourneyFromHistory(sessions, 5, 2, journeyId, true, 'dualnback-classic');

      // 4 errors worst modality: >=3 (no UP) and <=5 (no DOWN) → STAY at N=2
      expect(state.currentStage).toBe(1); // stage 1 = N=2
    });

    it('Jaeggi UP requires ALL modalities < 3 errors', () => {
      const journeyId = 'jaeggi-j';
      const sessions = [
        {
          journeyStageId: 1,
          journeyId,
          nLevel: 2,
          dPrime: 0,
          gameMode: 'dualnback-classic',
          timestamp: 1,
          byModality: {
            position: { hits: 9, misses: 1, falseAlarms: 0, correctRejections: 10 },
            audio: { hits: 9, misses: 0, falseAlarms: 1, correctRejections: 10 },
          },
        },
      ] as const;

      const state = projectJourneyFromHistory(sessions, 5, 2, journeyId, true, 'dualnback-classic');

      // Both modalities < 3 errors → UP to N=3
      expect(state.currentStage).toBe(2);
      expect(state.stages[0]?.status).toBe('completed');
    });
  });

  describe('createEmptyJourneyState', () => {
    it('should create simulator state with stage 1 unlocked and others locked', () => {
      const state = createEmptyJourneyState(5, 1, true);
      const totalStages = getTotalStagesForTarget(5, 1, true); // 5

      expect(state.stages.length).toBe(totalStages);
      // @ts-expect-error test: nullable access
      expect(state!.stages![0].status).toBe('unlocked');
      // @ts-expect-error test: nullable access
      expect(state!.stages![1].status).toBe('locked');
      // @ts-expect-error test: nullable access
      expect(state!.stages![totalStages - 1].status).toBe('locked');
      expect(state.currentStage).toBe(1);
      expect(state.isActive).toBe(true);
    });
  });
});
