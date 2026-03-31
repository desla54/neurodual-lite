/**
 * Tests for deriveJourneyContextFromState
 *
 * Covers:
 * - 3-tier stage resolution (direct stageId, nLevel re-resolve, currentStage fallback)
 * - Journey decision derivation (up, down, stay, undefined)
 * - Context assembly (all fields populated correctly)
 * - Null returns for invalid inputs
 */

import { describe, it, expect } from 'bun:test';
import {
  deriveJourneyContextFromState,
  type DeriveJourneyContextInput,
} from './derive-journey-context';
import type { JourneyState, JourneyStageProgress } from '../../types/journey';

// =============================================================================
// Helpers
// =============================================================================

function makeStageProgress(
  stageId: number,
  status: 'locked' | 'unlocked' | 'completed' = 'unlocked',
  overrides: Partial<JourneyStageProgress> = {},
): JourneyStageProgress {
  return {
    stageId,
    status,
    validatingSessions: status === 'completed' ? 3 : 0,
    bestScore: status === 'completed' ? 90 : null,
    progressPct: status === 'completed' ? 100 : 0,
    ...overrides,
  };
}

function makeJourneyState(overrides: Partial<JourneyState> = {}): JourneyState {
  // Default: simulator journey from level 1 to 5, currently at stage 3
  const stages: JourneyStageProgress[] = [
    makeStageProgress(1, 'completed'),
    makeStageProgress(2, 'completed'),
    makeStageProgress(3, 'unlocked'),
    makeStageProgress(4, 'locked'),
    makeStageProgress(5, 'locked'),
  ];
  return {
    currentStage: 3,
    stages,
    isActive: true,
    startLevel: 1,
    targetLevel: 5,
    isSimulator: true,
    ...overrides,
  };
}

function makeInput(overrides: Partial<DeriveJourneyContextInput> = {}): DeriveJourneyContextInput {
  return {
    journeyState: makeJourneyState(),
    sessionStageId: 3,
    journeyId: 'test-journey',
    ...overrides,
  };
}

// =============================================================================
// Strategy 1: Direct stageId match
// =============================================================================

describe('deriveJourneyContextFromState', () => {
  describe('Strategy 1: direct stageId match', () => {
    it('resolves stage by direct stageId match', () => {
      const result = deriveJourneyContextFromState(makeInput({ sessionStageId: 3 }));
      expect(result).not.toBeNull();
      expect(result!.stageId).toBe(3);
      expect(result!.nLevel).toBe(3); // simulator: stageId 3 = N-3
    });

    it('resolves completed stage correctly', () => {
      const result = deriveJourneyContextFromState(makeInput({ sessionStageId: 1 }));
      expect(result).not.toBeNull();
      expect(result!.stageId).toBe(1);
      expect(result!.stageCompleted).toBe(true);
    });

    it('resolves unlocked (non-completed) stage', () => {
      const result = deriveJourneyContextFromState(makeInput({ sessionStageId: 3 }));
      expect(result).not.toBeNull();
      expect(result!.stageCompleted).toBe(false);
    });
  });

  // ===========================================================================
  // Strategy 2: nLevel re-resolve after stage renumbering
  // ===========================================================================

  describe('Strategy 2: nLevel re-resolve', () => {
    it('re-resolves by nLevel when stageId maps to wrong nLevel after expansion', () => {
      // Simulate atomic expansion: startLevel changed from 2 to 1
      // Old stageId=1 was N-2, now stageId=1 is N-1 and N-2 is stageId=2
      const state = makeJourneyState({
        startLevel: 1,
        targetLevel: 5,
        isSimulator: true,
        stages: [
          makeStageProgress(1, 'completed'),
          makeStageProgress(2, 'completed'), // N-2
          makeStageProgress(3, 'unlocked'),
          makeStageProgress(4, 'locked'),
          makeStageProgress(5, 'locked'),
        ],
        currentStage: 3,
      });

      // Session was played at old stageId=1 which was N-2
      // After expansion, stageId=1 is now N-1, but sessionNLevel=2 should find stageId=2
      const result = deriveJourneyContextFromState({
        journeyState: state,
        sessionStageId: 1,
        sessionNLevel: 2, // The session was actually at N-2
        journeyId: 'test-journey',
      });

      expect(result).not.toBeNull();
      // stageId=1 maps to N-1 in expanded stages, but sessionNLevel=2 → should correct to stageId=2
      expect(result!.stageId).toBe(2);
      expect(result!.nLevel).toBe(2);
    });

    it('keeps direct match when nLevel matches', () => {
      const state = makeJourneyState();
      const result = deriveJourneyContextFromState({
        journeyState: state,
        sessionStageId: 1,
        sessionNLevel: 1, // Matches: stageId=1 IS N-1
        journeyId: 'test-journey',
      });

      expect(result).not.toBeNull();
      expect(result!.stageId).toBe(1);
      expect(result!.nLevel).toBe(1);
    });
  });

  // ===========================================================================
  // Strategy 3: currentStage fallback
  // ===========================================================================

  describe('Strategy 3: currentStage fallback', () => {
    it('falls back to currentStage when sessionStageId not found', () => {
      const state = makeJourneyState({ currentStage: 3 });
      const result = deriveJourneyContextFromState({
        journeyState: state,
        sessionStageId: 99, // doesn't exist
        journeyId: 'test-journey',
      });

      expect(result).not.toBeNull();
      expect(result!.stageId).toBe(3); // falls back to currentStage
    });

    it('returns null when neither stageId nor currentStage can be resolved', () => {
      const state = makeJourneyState({
        currentStage: 99, // beyond stages array
        stages: [makeStageProgress(1, 'completed')],
      });
      const result = deriveJourneyContextFromState({
        journeyState: state,
        sessionStageId: 50,
        journeyId: 'test-journey',
      });

      expect(result).toBeNull();
    });
  });

  // ===========================================================================
  // Journey decision
  // ===========================================================================

  describe('journey decision', () => {
    it('returns "up" when nextPlayableStage > effectiveStageId', () => {
      const state = makeJourneyState({ currentStage: 4 }); // moved past stage 3
      const result = deriveJourneyContextFromState({
        journeyState: state,
        sessionStageId: 3,
        journeyId: 'test-journey',
      });

      expect(result).not.toBeNull();
      expect(result!.journeyDecision).toBe('up');
    });

    it('returns "down" when nextPlayableStage < effectiveStageId', () => {
      const state = makeJourneyState({ currentStage: 2 }); // regressed from stage 3
      const result = deriveJourneyContextFromState({
        journeyState: state,
        sessionStageId: 3,
        journeyId: 'test-journey',
      });

      expect(result).not.toBeNull();
      expect(result!.journeyDecision).toBe('down');
    });

    it('returns "stay" when stage completed and still at same stage', () => {
      const state = makeJourneyState({
        currentStage: 3,
        stages: [
          makeStageProgress(1, 'completed'),
          makeStageProgress(2, 'completed'),
          makeStageProgress(3, 'completed'), // completed but currentStage still 3
          makeStageProgress(4, 'locked'),
          makeStageProgress(5, 'locked'),
        ],
      });
      const result = deriveJourneyContextFromState({
        journeyState: state,
        sessionStageId: 3,
        journeyId: 'test-journey',
      });

      expect(result).not.toBeNull();
      expect(result!.journeyDecision).toBe('stay');
    });

    it('returns undefined when stage not completed and same stage', () => {
      const state = makeJourneyState({ currentStage: 3 });
      const result = deriveJourneyContextFromState({
        journeyState: state,
        sessionStageId: 3,
        journeyId: 'test-journey',
      });

      expect(result).not.toBeNull();
      expect(result!.journeyDecision).toBeUndefined();
    });

    it('returns "up" when journey completed (currentStage > totalStages)', () => {
      const state = makeJourneyState({
        currentStage: 6, // beyond 5 stages → journey completed
        stages: [
          makeStageProgress(1, 'completed'),
          makeStageProgress(2, 'completed'),
          makeStageProgress(3, 'completed'),
          makeStageProgress(4, 'completed'),
          makeStageProgress(5, 'completed'),
        ],
      });
      const result = deriveJourneyContextFromState({
        journeyState: state,
        sessionStageId: 5,
        journeyId: 'test-journey',
      });

      expect(result).not.toBeNull();
      expect(result!.journeyDecision).toBe('up');
      expect(result!.nextPlayableStage).toBeNull();
    });
  });

  // ===========================================================================
  // Context assembly
  // ===========================================================================

  describe('context assembly', () => {
    it('populates all required fields', () => {
      const result = deriveJourneyContextFromState(makeInput());
      expect(result).not.toBeNull();

      expect(result!.journeyId).toBe('test-journey');
      expect(result!.stageMode).toBe('simulator');
      expect(result!.upsThreshold).toBe(80);
      expect(result!.guidanceSource).toBe('current-state');
    });

    it('uses journeyName from input or falls back to journeyId', () => {
      const withName = deriveJourneyContextFromState(makeInput({ journeyName: 'My Journey' }));
      expect(withName!.journeyName).toBe('My Journey');

      const withoutName = deriveJourneyContextFromState(makeInput());
      expect(withoutName!.journeyName).toBe('test-journey');
    });

    it('passes through optional fields', () => {
      const state = makeJourneyState({
        consecutiveStrikes: 2,
        suggestedStartLevel: 1,
        nextSessionGameMode: 'dual-track',
      });
      const result = deriveJourneyContextFromState({
        journeyState: state,
        sessionStageId: 3,
        journeyId: 'test-journey',
        journeyGameMode: 'sim-brainworkshop',
        journeyNameShort: 'BW',
      });

      expect(result).not.toBeNull();
      expect(result!.consecutiveStrikes).toBe(2);
      expect(result!.suggestedStartLevel).toBe(1);
      expect(result!.nextSessionGameMode).toBe('dual-track');
      expect(result!.journeyGameMode).toBe('sim-brainworkshop');
      expect(result!.journeyNameShort).toBe('BW');
    });

    it('calculates nextStageUnlocked for completed stages', () => {
      const state = makeJourneyState({
        stages: [
          makeStageProgress(1, 'completed'),
          makeStageProgress(2, 'completed'),
          makeStageProgress(3, 'completed'),
          makeStageProgress(4, 'locked'),
          makeStageProgress(5, 'locked'),
        ],
      });
      const result = deriveJourneyContextFromState({
        journeyState: state,
        sessionStageId: 3,
        journeyId: 'test-journey',
      });

      expect(result!.stageCompleted).toBe(true);
      expect(result!.nextStageUnlocked).toBe(4);
    });

    it('returns null nextStageUnlocked for last stage completed', () => {
      const state = makeJourneyState({
        currentStage: 6,
        stages: [
          makeStageProgress(1, 'completed'),
          makeStageProgress(2, 'completed'),
          makeStageProgress(3, 'completed'),
          makeStageProgress(4, 'completed'),
          makeStageProgress(5, 'completed'),
        ],
      });
      const result = deriveJourneyContextFromState({
        journeyState: state,
        sessionStageId: 5,
        journeyId: 'test-journey',
      });

      expect(result!.stageCompleted).toBe(true);
      expect(result!.nextStageUnlocked).toBeNull();
    });

    it('returns null nextStageUnlocked for non-completed stages', () => {
      const result = deriveJourneyContextFromState(makeInput({ sessionStageId: 3 }));
      expect(result!.stageCompleted).toBe(false);
      expect(result!.nextStageUnlocked).toBeNull();
    });
  });

  // ===========================================================================
  // Standard (non-simulator) journey
  // ===========================================================================

  describe('standard (non-simulator) journey', () => {
    it('resolves stages in a 4-mode-per-level journey', () => {
      // Standard journey: 4 modes per level, so level 1 = stages 1-4
      const stages: JourneyStageProgress[] = [];
      for (let i = 1; i <= 8; i++) {
        stages.push(makeStageProgress(i, i <= 4 ? 'completed' : i === 5 ? 'unlocked' : 'locked'));
      }
      const state: JourneyState = {
        currentStage: 5,
        stages,
        isActive: true,
        startLevel: 1,
        targetLevel: 2,
        isSimulator: false,
      };
      const result = deriveJourneyContextFromState({
        journeyState: state,
        sessionStageId: 5,
        journeyId: 'std-journey',
      });

      expect(result).not.toBeNull();
      expect(result!.stageId).toBe(5);
      expect(result!.nLevel).toBe(2); // stage 5 = first stage of level 2
      expect(result!.stageMode).toBe('pick'); // first mode of level 2
    });
  });

  // ===========================================================================
  // Null returns
  // ===========================================================================

  describe('null returns', () => {
    it('returns null when stage progress not found and fallback fails', () => {
      const state = makeJourneyState({
        currentStage: 99,
        stages: [],
      });
      const result = deriveJourneyContextFromState({
        journeyState: state,
        sessionStageId: 50,
        journeyId: 'test-journey',
      });
      expect(result).toBeNull();
    });

    it('returns null when stage definition cannot be found', () => {
      // Create a state where stageId exists in stages but not in generated definitions
      // This happens when targetLevel is very low but stageId is high
      const state: JourneyState = {
        currentStage: 1,
        stages: [makeStageProgress(100, 'unlocked')], // stageId 100 exists in progress
        isActive: true,
        startLevel: 1,
        targetLevel: 1,
        isSimulator: true,
      };
      const result = deriveJourneyContextFromState({
        journeyState: state,
        sessionStageId: 100,
        journeyId: 'test-journey',
      });
      // stageId 100 found in stages, but getStageDefinition(100, 1, 1, true) returns undefined
      expect(result).toBeNull();
    });
  });
});
