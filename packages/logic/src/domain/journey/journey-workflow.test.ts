/**
 * Tests for journey-workflow.ts
 *
 * Covers:
 * - deriveNextSession: standard journey, simulator, alternating/hybrid modes
 * - toWorkflowConfig: conversion from JourneyConfig
 * - Null returns for completed journeys and invalid stage definitions
 */

import { describe, it, expect } from 'bun:test';
import {
  deriveNextSession,
  toWorkflowConfig,
  type JourneyWorkflowConfig,
} from './journey-workflow';
import type { JourneyState, JourneyStageProgress, JourneyConfig } from '../../types/journey';

// =============================================================================
// Helpers
// =============================================================================

function makeStageProgress(
  stageId: number,
  status: 'locked' | 'unlocked' | 'completed' = 'unlocked',
): JourneyStageProgress {
  return {
    stageId,
    status,
    validatingSessions: status === 'completed' ? 3 : 0,
    bestScore: status === 'completed' ? 90 : null,
  };
}

function makeState(overrides: Partial<JourneyState> = {}): JourneyState {
  const stages: JourneyStageProgress[] = [];
  for (let i = 1; i <= 5; i++) {
    stages.push(makeStageProgress(i, i < 3 ? 'completed' : i === 3 ? 'unlocked' : 'locked'));
  }
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

function makeConfig(overrides: Partial<JourneyWorkflowConfig> = {}): JourneyWorkflowConfig {
  return {
    journeyId: 'test-journey',
    startLevel: 1,
    targetLevel: 5,
    isSimulator: true,
    gameMode: 'dualnback-classic',
    ...overrides,
  };
}

// =============================================================================
// deriveNextSession
// =============================================================================

describe('deriveNextSession', () => {
  describe('journey completed', () => {
    it('returns null when currentStage > totalStages', () => {
      const state = makeState({ currentStage: 6 }); // 5 stages, stage 6 = completed
      const result = deriveNextSession(state, makeConfig());
      expect(result).toBeNull();
    });

    it('returns null when currentStage equals totalStages + 1', () => {
      // Simulator: 5 levels (1-5) = 5 stages. currentStage 6 = done.
      const state = makeState({ currentStage: 6 });
      const result = deriveNextSession(state, makeConfig());
      expect(result).toBeNull();
    });
  });

  describe('simulator mode', () => {
    it('uses configured gameMode for simulator journeys', () => {
      const state = makeState({ currentStage: 3 });
      const config = makeConfig({ gameMode: 'sim-brainworkshop' });
      const result = deriveNextSession(state, config);

      expect(result).not.toBeNull();
      expect(result!.kind).toBe('Command');
      expect(result!.type).toBe('NextSession');
      expect(result!.gameMode).toBe('sim-brainworkshop');
      expect(result!.stageId).toBe(3);
      expect(result!.nLevel).toBe(3); // simulator: stage 3 = N-3
    });

    it('returns correct route for dualnback-classic', () => {
      const state = makeState({ currentStage: 1 });
      const config = makeConfig({ gameMode: 'dualnback-classic' });
      const result = deriveNextSession(state, config);

      expect(result).not.toBeNull();
      expect(result!.route).toBe('/nback');
    });
  });

  describe('alternating/hybrid mode', () => {
    it('uses nextSessionGameMode from state for alternating journeys', () => {
      const state = makeState({
        currentStage: 1,
        nextSessionGameMode: 'dualnback-classic',
      });
      const config = makeConfig({ gameMode: 'dual-track-dnb-hybrid' });
      const result = deriveNextSession(state, config);

      expect(result).not.toBeNull();
      expect(result!.gameMode).toBe('dualnback-classic');
    });

    it('falls back to ALTERNATING_JOURNEY_FIRST_MODE when nextSessionGameMode not set', () => {
      const state = makeState({
        currentStage: 1,
        nextSessionGameMode: undefined,
      });
      const config = makeConfig({ gameMode: 'dual-track-dnb-hybrid' });
      const result = deriveNextSession(state, config);

      expect(result).not.toBeNull();
      expect(result!.gameMode).toBe('dual-track'); // ALTERNATING_JOURNEY_FIRST_MODE
    });
  });

  describe('standard (non-simulator) journey', () => {
    it('derives gameMode from stage definition mode type', () => {
      // Standard journey: 4 modes per level
      const stages: JourneyStageProgress[] = [];
      for (let i = 1; i <= 8; i++) {
        stages.push(makeStageProgress(i, i < 5 ? 'completed' : i === 5 ? 'unlocked' : 'locked'));
      }
      const state: JourneyState = {
        currentStage: 5,
        stages,
        isActive: true,
        startLevel: 1,
        targetLevel: 2,
        isSimulator: false,
      };
      const config: JourneyWorkflowConfig = {
        journeyId: 'std-journey',
        startLevel: 1,
        targetLevel: 2,
        isSimulator: false,
        // no gameMode → standard journey
      };
      const result = deriveNextSession(state, config);

      expect(result).not.toBeNull();
      expect(result!.stageId).toBe(5);
      // Stage 5 in standard journey = first mode of level 2 = 'pick' → 'dual-pick'
      expect(result!.gameMode).toBe('dual-pick');
      expect(result!.nLevel).toBe(2);
    });

    it('maps each journey mode type to correct game mode', () => {
      // Test all 4 standard modes at level 1
      const stages: JourneyStageProgress[] = [];
      for (let i = 1; i <= 4; i++) {
        stages.push(makeStageProgress(i, 'unlocked'));
      }

      for (let stageIdx = 1; stageIdx <= 4; stageIdx++) {
        const state: JourneyState = {
          currentStage: stageIdx,
          stages,
          isActive: true,
          startLevel: 1,
          targetLevel: 1,
          isSimulator: false,
        };
        const config: JourneyWorkflowConfig = {
          journeyId: 'std-journey',
          startLevel: 1,
          targetLevel: 1,
          isSimulator: false,
        };
        const result = deriveNextSession(state, config);
        expect(result).not.toBeNull();
        // Modes: pick, place, memo, catch → dual-pick, dual-place, dual-memo, dual-catch
        const expectedModes = ['dual-pick', 'dual-place', 'dual-memo', 'dual-catch'];
        // @ts-expect-error test override
        expect(result!.gameMode).toBe(expectedModes[stageIdx - 1]);
      }
    });
  });

  describe('edge cases', () => {
    it('returns null when getStageDefinition returns undefined', () => {
      // Force invalid state: currentStage points to a stage that doesn't exist in generated defs
      const state: JourneyState = {
        currentStage: 100, // way beyond any generated stages
        stages: [makeStageProgress(100, 'unlocked')],
        isActive: true,
        startLevel: 1,
        targetLevel: 1, // only 1 stage
        isSimulator: true,
      };
      const config = makeConfig({ targetLevel: 1 });
      // totalStages = 1 (one level in simulator), currentStage = 100 > 1 → completed → null
      const result = deriveNextSession(state, config);
      expect(result).toBeNull();
    });

    it('handles first stage (currentStage = 1)', () => {
      const state = makeState({ currentStage: 1 });
      const config = makeConfig();
      const result = deriveNextSession(state, config);

      expect(result).not.toBeNull();
      expect(result!.stageId).toBe(1);
      expect(result!.nLevel).toBe(1);
    });

    it('handles last stage', () => {
      const state = makeState({ currentStage: 5 });
      const config = makeConfig();
      const result = deriveNextSession(state, config);

      expect(result).not.toBeNull();
      expect(result!.stageId).toBe(5);
      expect(result!.nLevel).toBe(5);
    });
  });
});

// =============================================================================
// toWorkflowConfig
// =============================================================================

describe('toWorkflowConfig', () => {
  it('converts a JourneyConfig to JourneyWorkflowConfig', () => {
    const config: JourneyConfig = {
      journeyId: 'my-journey',
      startLevel: 2,
      targetLevel: 7,
      gameMode: 'dualnback-classic',
    };
    const result = toWorkflowConfig(config);

    expect(result.journeyId).toBe('my-journey');
    expect(result.startLevel).toBe(2);
    expect(result.targetLevel).toBe(7);
    expect(result.gameMode).toBe('dualnback-classic');
    expect(result.isSimulator).toBe(true); // dualnback-classic is a simulator mode
  });

  it('sets isSimulator=false for non-simulator gameModes', () => {
    const config: JourneyConfig = {
      journeyId: 'my-journey',
      startLevel: 1,
      targetLevel: 5,
      gameMode: undefined,
    };
    const result = toWorkflowConfig(config);
    expect(result.isSimulator).toBe(false);
  });

  it('passes through hybrid config', () => {
    const config: JourneyConfig = {
      journeyId: 'hybrid-journey',
      startLevel: 1,
      targetLevel: 5,
      gameMode: 'dual-track-dnb-hybrid',
      hybridTrackSessionsPerBlock: 2,
      hybridDnbSessionsPerBlock: 4,
    };
    const result = toWorkflowConfig(config);

    expect(result.hybridTrackSessionsPerBlock).toBe(2);
    expect(result.hybridDnbSessionsPerBlock).toBe(4);
  });

  it('sets isSimulator=true for sim-brainworkshop', () => {
    const config: JourneyConfig = {
      journeyId: 'bw-journey',
      startLevel: 1,
      targetLevel: 5,
      gameMode: 'sim-brainworkshop',
    };
    const result = toWorkflowConfig(config);
    expect(result.isSimulator).toBe(true);
  });
});
