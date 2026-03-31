import { describe, expect, it, mock } from 'bun:test';
import { DualTraceSpec } from '../../specs/trace.spec';
import { createSeededRandom } from '../../ports/random-port';
import type { AudioPort, ClockPort } from '../../ports';
import {
  buildDualTraceSessionMachineInput,
  createTimingSourceFromTraceSessionTimings,
  deriveTraceSessionTimings,
  resolveTraceGridMode,
} from './trace-session-input-builder';

function createMockAudio(): AudioPort {
  return {
    init: mock(() => Promise.resolve(undefined)),
    isReady: mock(() => true),
    play: mock(() => undefined),
    schedule: mock(() => undefined),
    scheduleCallback: mock(() => 1),
    cancelCallback: mock(() => undefined),
    stopAll: mock(() => undefined),
    getCurrentTime: mock(() => 0),
    getVolumeLevel: mock(() => 1),
    playCorrect: mock(() => undefined),
    playIncorrect: mock(() => undefined),
    playClick: mock(() => undefined),
    playSwipe: mock(() => undefined),
    setConfig: mock(() => undefined),
    // @ts-expect-error test override
    getConfig: mock(() => ({ language: 'fr', voice: 'default' })),
  };
}

function createMockClock(): ClockPort {
  return {
    now: mock(() => 0),
    dateNow: mock(() => 1_700_000_000_000),
  };
}

describe('trace-session-input-builder', () => {
  it('resolveTraceGridMode derives an even grid when mirrorSwipe is enabled', () => {
    expect(
      resolveTraceGridMode({
        gridMode: '3x3',
        mirrorSwipe: false,
        mirrorAxis: 'horizontal',
      }),
    ).toBe('3x3');

    expect(
      resolveTraceGridMode({
        gridMode: '3x3',
        mirrorSwipe: true,
        mirrorAxis: 'horizontal',
      }),
    ).toBe('3x4');

    expect(
      resolveTraceGridMode({
        gridMode: '3x3',
        mirrorSwipe: true,
        mirrorAxis: 'vertical',
      }),
    ).toBe('4x3');

    expect(
      resolveTraceGridMode({
        gridMode: '3x3',
        mirrorSwipe: true,
        mirrorAxis: 'dynamic',
      }),
    ).toBe('4x4');
  });

  it('deriveTraceSessionTimings matches timed and self-paced policies', () => {
    const timed = deriveTraceSessionTimings({ rhythmMode: 'timed', isiMs: 2000 });
    expect(timed).toEqual({
      stimulusDurationMs: 400,
      responseWindowMs: 600,
      feedbackDurationMs: 500,
      ruleDisplayMs: 300,
      intervalMs: 500,
      warmupStimulusDurationMs: 600,
    });

    const selfPaced = deriveTraceSessionTimings({
      rhythmMode: 'self-paced',
      isiMs: 2000,
      selfPacedTimings: {
        stimulusDurationMs: 1234,
        feedbackDurationMs: 456,
        ruleDisplayMs: 789,
        intervalMs: 321,
      },
    });
    expect(selfPaced).toEqual({
      stimulusDurationMs: 1234,
      responseWindowMs: 600,
      feedbackDurationMs: 456,
      ruleDisplayMs: 789,
      intervalMs: 321,
      warmupStimulusDurationMs: 1734,
    });
  });

  it('buildDualTraceSessionMachineInput syncs modalities + dyslat gridMode into spec', () => {
    const baseSpec = {
      ...DualTraceSpec,
      defaults: {
        ...DualTraceSpec.defaults,
        trialsCount: 3,
        activeModalities: ['position', 'color'],
      },
      extensions: {
        ...DualTraceSpec.extensions,
        rhythmMode: 'timed',
        writing: {
          ...DualTraceSpec.extensions.writing,
          enabled: false,
        },
        dyslatéralisation: {
          ...DualTraceSpec.extensions.dyslatéralisation,
          mirrorSwipe: true,
          mirrorAxis: 'vertical',
        },
      },
    };

    const sessionTimings = deriveTraceSessionTimings({ rhythmMode: 'timed', isiMs: 2000 });
    const timingSource = createTimingSourceFromTraceSessionTimings(sessionTimings, true);
    const { input, enabledModalities, gridMode, gridCols, gridRows, numPositions } =
      buildDualTraceSessionMachineInput({
        sessionId: 'sid',
        userId: 'uid',
        playMode: 'free',
        audio: createMockAudio(),
        clock: createMockClock(),
        random: createSeededRandom('seed'),
        baseSpec: baseSpec as unknown as Parameters<
          typeof buildDualTraceSessionMachineInput
        >[0]['baseSpec'],
        sessionTimings,
        soundEnabled: true,
        adaptiveTimingEnabled: false,
        getTimingSource: () => timingSource,
      });

    expect(enabledModalities).toEqual(['position', 'color']);
    expect(input.spec.extensions.audioEnabled).toBe(false);
    expect(input.spec.extensions.colorEnabled).toBe(true);
    expect(input.spec.extensions.writing.enabled).toBe(true);

    // mirrorSwipe + vertical forces 4×3
    expect(gridMode).toBe('4x3');
    expect(gridCols).toBe(3);
    expect(gridRows).toBe(4);
    expect(numPositions).toBe(12);

    // Spec should reflect derived gridMode (SSOT for machine)
    expect(input.spec.extensions.dyslatéralisation.gridMode).toBe('4x3');
    expect(input.trials).toHaveLength(3);
  });

  it('disables mindful timing in the effective spec when sequential trace is enabled', () => {
    const baseSpec = {
      ...DualTraceSpec,
      extensions: {
        ...DualTraceSpec.extensions,
        rhythmMode: 'self-paced',
        sequentialTrace: true,
        mindfulTiming: {
          ...DualTraceSpec.extensions.mindfulTiming,
          enabled: true,
        },
      },
    };

    const sessionTimings = deriveTraceSessionTimings({
      rhythmMode: 'self-paced',
      isiMs: 2000,
      selfPacedTimings: {
        stimulusDurationMs: 1000,
        feedbackDurationMs: 700,
        ruleDisplayMs: 600,
        intervalMs: 400,
      },
    });
    const timingSource = createTimingSourceFromTraceSessionTimings(sessionTimings, true);
    const { input } = buildDualTraceSessionMachineInput({
      sessionId: 'sid',
      userId: 'uid',
      playMode: 'free',
      audio: createMockAudio(),
      clock: createMockClock(),
      random: createSeededRandom('seed'),
      baseSpec: baseSpec as Parameters<typeof buildDualTraceSessionMachineInput>[0]['baseSpec'],
      sessionTimings,
      soundEnabled: true,
      adaptiveTimingEnabled: false,
      getTimingSource: () => timingSource,
    });

    expect(input.spec.extensions.mindfulTiming.enabled).toBe(false);
  });
});
