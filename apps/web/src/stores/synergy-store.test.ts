import { describe, expect, it } from 'bun:test';

import {
  advanceSynergyProgress,
  getActiveGameMode,
  getRemainingSynergyLoops,
  reduceSynergyEvents,
  type SynergyState,
} from './synergy-store';

function createState(overrides?: Partial<SynergyState>): SynergyState {
  return {
    phase: 'running',
    config: {
      totalLoops: 5,
      dualTrackIdentityMode: 'color',
      dualTrackNLevel: 2,
      dualTrackTrialsCount: 3,
      dualTrackTrackingDurationMs: 5000,
      dualTrackTrackingSpeedPxPerSec: 160,
      dualTrackMotionComplexity: 'standard',
      dualTrackCrowdingMode: 'standard',
      dualTrackTotalObjects: null,
      dualTrackBallsOffset: 0,
      nbackModality: 'position',
      nbackNLevel: 2,
      nbackTrialsCount: 10,
    },
    loopIndex: 0,
    stepIndex: 0,
    sessionResults: [],
    ...overrides,
  };
}

describe('synergy-store helpers', () => {
  it('advances from dual-track to n-back within the same loop', () => {
    expect(advanceSynergyProgress(createState())).toEqual({
      phase: 'running',
      loopIndex: 0,
      stepIndex: 1,
    });
  });

  it('advances from n-back to the next loop', () => {
    expect(advanceSynergyProgress(createState({ loopIndex: 2, stepIndex: 1 }))).toEqual({
      phase: 'running',
      loopIndex: 3,
      stepIndex: 0,
    });
  });

  it('marks the flow complete after the final n-back step', () => {
    expect(advanceSynergyProgress(createState({ loopIndex: 4, stepIndex: 1 }))).toEqual({
      phase: 'complete',
      loopIndex: 5,
      stepIndex: 0,
    });
  });

  it('keeps the live mode aligned with the current step', () => {
    expect(getActiveGameMode(createState({ stepIndex: 0 }))).toBe('dual-track');
    expect(getActiveGameMode(createState({ stepIndex: 1 }))).toBe('sim-brainworkshop');
  });

  it('counts the current loop as spent once the n-back half begins', () => {
    expect(getRemainingSynergyLoops(createState({ loopIndex: 0, stepIndex: 0 }))).toBe(5);
    expect(getRemainingSynergyLoops(createState({ loopIndex: 0, stepIndex: 1 }))).toBe(4.5);
    expect(getRemainingSynergyLoops(createState({ loopIndex: 3, stepIndex: 1 }))).toBe(1.5);
  });

  it('rebuilds state from persisted events (config + start + steps + reset)', () => {
    const state = reduceSynergyEvents([
      {
        type: 'SYNERGY_CONFIG_UPDATED',
        timestamp: 1,
        patch: { totalLoops: 7, nbackModality: 'audio' },
      },
      {
        type: 'SYNERGY_LOOP_STARTED',
        timestamp: 2,
        config: { ...createState().config, totalLoops: 7, nbackModality: 'audio' },
      },
      {
        type: 'SYNERGY_STEP_COMPLETED',
        timestamp: 3,
        result: { mode: 'dual-track', score: 84, nLevel: 2 },
      },
      {
        type: 'SYNERGY_STEP_COMPLETED',
        timestamp: 4,
        result: { mode: 'sim-brainworkshop', score: 71, nLevel: 2 },
      },
    ]);

    expect(state.phase).toBe('running');
    expect(state.config.totalLoops).toBe(7);
    expect(state.config.nbackModality).toBe('audio');
    expect(state.loopIndex).toBe(1);
    expect(state.stepIndex).toBe(0);
    expect(state.sessionResults).toHaveLength(2);
  });

  it('keeps complete reserved for the actual end of the loop plan', () => {
    const events = Array.from({ length: 10 }, (_, index) => ({
      type: 'SYNERGY_STEP_COMPLETED' as const,
      timestamp: index + 1,
      result: {
        mode: index % 2 === 0 ? 'dual-track' : 'sim-brainworkshop',
        score: 80,
        nLevel: 2,
      },
    }));

    const state = reduceSynergyEvents([
      {
        type: 'SYNERGY_LOOP_STARTED',
        timestamp: 0,
        config: createState().config,
      },
      ...events,
    ]);

    expect(state.phase).toBe('complete');
    expect(state.loopIndex).toBe(5);
    expect(state.stepIndex).toBe(0);
  });

  it('reset returns to idle', () => {
    const state = reduceSynergyEvents([
      {
        type: 'SYNERGY_LOOP_STARTED',
        timestamp: 0,
        config: createState().config,
      },
      {
        type: 'SYNERGY_STEP_COMPLETED',
        timestamp: 1,
        result: { mode: 'dual-track', score: 80, nLevel: 2 },
      },
      {
        type: 'SYNERGY_LOOP_RESET',
        timestamp: 2,
      },
    ]);

    expect(state.phase).toBe('idle');
    expect(state.loopIndex).toBe(0);
    expect(state.stepIndex).toBe(0);
    expect(state.sessionResults).toHaveLength(0);
  });
});
