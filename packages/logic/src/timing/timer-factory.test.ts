/**
 * Timer Factory Unit Tests
 *
 * Tests for the timer creation factory.
 */

import { describe, it, expect, mock } from 'bun:test';
import {
  createTimer,
  createTimerFromMode,
  createTimerForTrace,
  getTimingMode,
  rhythmModeToTimingMode,
} from './timer-factory';
import { IntervalTimer } from './interval-timer';
import { SelfPacedTimer } from './self-paced-timer';
import { RhythmicTimer } from './rhythmic-timer';
import type { ModeSpec } from '../specs/types';
import type { AudioPort } from '../ports/audio-port';

// =============================================================================
// Mock Data
// =============================================================================

function createMockAudioPort(): AudioPort {
  return {
    getCurrentTime: () => 0,
    scheduleCallback: mock(() => 0),
    cancelCallback: mock(() => {}),
    init: mock(() => Promise.resolve()),
    play: mock(() => {}),
    playClick: mock(() => {}),
    playCorrect: mock(() => {}),
    playIncorrect: mock(() => {}),
    stopAll: mock(() => {}),
    isReady: mock(() => true),
  } as unknown as AudioPort;
}

function createMockSpec(timingMode?: string): ModeSpec {
  // @ts-expect-error test override
  return {
    metadata: {
      id: 'test-mode',
      displayName: 'Test Mode',
      description: 'Test',
      tags: [],
      difficultyLevel: 1,
      version: '1.0.0',
    },
    sessionType: 'GameSession',
    scoring: {
      strategy: 'balanced',
      passThreshold: 0.8,
    },
    timing: {
      stimulusDurationMs: 500,
      intervalMs: 3000,
      responseWindowMs: 2500,
      feedbackDurationMs: 200,
    },
    generation: {
      generator: 'Random',
      targetProbability: 0.33,
      lureProbability: 0,
    },
    defaults: {
      nLevel: 2,
      trialsCount: 20,
      activeModalities: ['position', 'audio'],
    },
    adaptivity: {
      algorithm: 'none',
      nLevelSource: 'user',
      configurableSettings: [],
    },
    extensions: timingMode ? { timingMode } : {},
  } as ModeSpec;
}

// =============================================================================
// Tests
// =============================================================================

describe('Timer Factory', () => {
  describe('getTimingMode', () => {
    it('should return interval by default', () => {
      const spec = createMockSpec();
      expect(getTimingMode(spec)).toBe('interval');
    });

    it('should return self-paced when specified', () => {
      const spec = createMockSpec('self-paced');
      expect(getTimingMode(spec)).toBe('self-paced');
    });

    it('should return rhythmic when specified', () => {
      const spec = createMockSpec('rhythmic');
      expect(getTimingMode(spec)).toBe('rhythmic');
    });

    it('should default to interval for unknown modes', () => {
      const spec = createMockSpec('unknown-mode');
      expect(getTimingMode(spec)).toBe('interval');
    });
  });

  describe('createTimerFromMode', () => {
    it('should create IntervalTimer for interval mode', () => {
      const timer = createTimerFromMode('interval');
      expect(timer).toBeInstanceOf(IntervalTimer);
    });

    it('should create SelfPacedTimer for self-paced mode', () => {
      const timer = createTimerFromMode('self-paced');
      expect(timer).toBeInstanceOf(SelfPacedTimer);
    });

    it('should create RhythmicTimer for rhythmic mode', () => {
      const timer = createTimerFromMode('rhythmic');
      expect(timer).toBeInstanceOf(RhythmicTimer);
    });
  });

  describe('createTimer', () => {
    it('should create and initialize timer from spec', () => {
      const spec = createMockSpec();
      const audio = createMockAudioPort();

      const timer = createTimer(spec, audio);

      expect(timer).toBeInstanceOf(IntervalTimer);
    });

    it('should respect self-paced mode in spec', () => {
      const spec = createMockSpec('self-paced');
      const audio = createMockAudioPort();

      const timer = createTimer(spec, audio);

      expect(timer).toBeInstanceOf(SelfPacedTimer);
    });
  });

  describe('rhythmModeToTimingMode', () => {
    it('should map self-paced to self-paced', () => {
      expect(rhythmModeToTimingMode('self-paced')).toBe('self-paced');
    });

    it('should map timed to interval', () => {
      expect(rhythmModeToTimingMode('timed')).toBe('interval');
    });
  });

  describe('createTimerForTrace', () => {
    it('should create interval timer for timed mode', () => {
      const audio = createMockAudioPort();
      const config = {
        rhythmMode: 'timed' as const,
        intervalMs: 3000,
        stimulusDurationMs: 500,
        responseWindowMs: 2500,
        feedbackDurationMs: 200,
      };

      const timer = createTimerForTrace(config, audio);

      expect(timer).toBeInstanceOf(IntervalTimer);
    });

    it('should create self-paced timer for self-paced mode', () => {
      const audio = createMockAudioPort();
      const config = {
        rhythmMode: 'self-paced' as const,
        intervalMs: 3000,
        stimulusDurationMs: 500,
        responseWindowMs: 2500,
        feedbackDurationMs: 200,
      };

      const timer = createTimerForTrace(config, audio);

      expect(timer).toBeInstanceOf(SelfPacedTimer);
    });
  });
});
