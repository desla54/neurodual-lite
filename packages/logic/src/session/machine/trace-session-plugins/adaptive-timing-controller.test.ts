import { describe, expect, it } from 'bun:test';
import {
  createAdaptiveTimingController,
  createNoopAdaptiveTimingController,
} from './adaptive-timing-controller';
import {
  TRACE_ADAPTIVE_TARGET_ACCURACY,
  TRACE_ADAPTIVE_MIN_TRIALS,
  TRACE_ADAPTIVE_STIMULUS_MIN_MS,
  TRACE_ADAPTIVE_STIMULUS_MAX_MS,
  TRACE_ADAPTIVE_EXTINCTION_MIN,
  TRACE_ADAPTIVE_EXTINCTION_MAX,
  TRACE_ADAPTIVE_RESPONSE_WINDOW_MIN_MS,
  TRACE_ADAPTIVE_RESPONSE_WINDOW_MAX_MS,
  TRACE_EXTINCTION_RATIO,
} from '../../../specs/thresholds';

describe('createAdaptiveTimingController', () => {
  const defaultConfig = {
    enabled: true,
    isTimed: false,
    initialStimulusDurationMs: 1000,
    initialExtinctionRatio: TRACE_EXTINCTION_RATIO,
    initialResponseWindowMs: 3000,
  };

  describe('isEnabled', () => {
    it('should return true when enabled', () => {
      const controller = createAdaptiveTimingController({
        ...defaultConfig,
        enabled: true,
      });
      expect(controller.isEnabled()).toBe(true);
    });

    it('should return false when disabled', () => {
      const controller = createAdaptiveTimingController({
        ...defaultConfig,
        enabled: false,
      });
      expect(controller.isEnabled()).toBe(false);
    });
  });

  describe('onTrialCompleted', () => {
    it('should ignore warmup trials', () => {
      const controller = createAdaptiveTimingController(defaultConfig);

      controller.onTrialCompleted({
        isCorrect: false,
        responseTimeMs: 500,
        isWarmup: true,
      });

      expect(controller.getTrialCount()).toBe(0);
    });

    it('should count non-warmup trials', () => {
      const controller = createAdaptiveTimingController(defaultConfig);

      controller.onTrialCompleted({
        isCorrect: true,
        responseTimeMs: 500,
        isWarmup: false,
      });

      expect(controller.getTrialCount()).toBe(1);
    });

    it('should track accuracy in sliding window', () => {
      const controller = createAdaptiveTimingController(defaultConfig);

      // Record 5 correct trials
      for (let i = 0; i < 5; i++) {
        controller.onTrialCompleted({
          isCorrect: true,
          responseTimeMs: 500,
          isWarmup: false,
        });
      }

      // Accuracy should be close to 1.0 (with EMA smoothing from initial 0.75)
      const accuracy = controller.getEstimatedAccuracy();
      expect(accuracy).toBeGreaterThan(0.75);
    });
  });

  describe('adaptive adjustments', () => {
    it('should not adjust before minimum trials', () => {
      const controller = createAdaptiveTimingController(defaultConfig);
      const initialStimulus = controller.getCurrentStimulusDurationMs();

      // Record less than MIN_TRIALS
      for (let i = 0; i < TRACE_ADAPTIVE_MIN_TRIALS - 1; i++) {
        controller.onTrialCompleted({
          isCorrect: true,
          responseTimeMs: 500,
          isWarmup: false,
        });
      }

      expect(controller.getCurrentStimulusDurationMs()).toBe(initialStimulus);
    });

    it('should decrease stimulus duration when accuracy is high (easier to encode)', () => {
      const controller = createAdaptiveTimingController(defaultConfig);

      // Record many correct trials (high accuracy)
      for (let i = 0; i < 15; i++) {
        controller.onTrialCompleted({
          isCorrect: true,
          responseTimeMs: 500,
          isWarmup: false,
        });
      }

      // High accuracy → should decrease stimulus (make harder)
      const stimulusDuration = controller.getCurrentStimulusDurationMs();
      expect(stimulusDuration).toBeLessThan(defaultConfig.initialStimulusDurationMs);
    });

    it('should increase stimulus duration when accuracy is low (more time to encode)', () => {
      const controller = createAdaptiveTimingController(defaultConfig);

      // Record many incorrect trials (low accuracy)
      for (let i = 0; i < 15; i++) {
        controller.onTrialCompleted({
          isCorrect: false,
          responseTimeMs: 500,
          isWarmup: false,
        });
      }

      // Low accuracy → should increase stimulus (make easier)
      const stimulusDuration = controller.getCurrentStimulusDurationMs();
      expect(stimulusDuration).toBeGreaterThan(defaultConfig.initialStimulusDurationMs);
    });
  });

  describe('bounds enforcement', () => {
    it('should clamp stimulus duration to minimum', () => {
      const controller = createAdaptiveTimingController({
        ...defaultConfig,
        initialStimulusDurationMs: TRACE_ADAPTIVE_STIMULUS_MIN_MS + 100,
      });

      // Record many correct trials to push towards minimum
      for (let i = 0; i < 50; i++) {
        controller.onTrialCompleted({
          isCorrect: true,
          responseTimeMs: 500,
          isWarmup: false,
        });
      }

      const stimulusDuration = controller.getCurrentStimulusDurationMs();
      expect(stimulusDuration).toBeGreaterThanOrEqual(TRACE_ADAPTIVE_STIMULUS_MIN_MS);
    });

    it('should clamp stimulus duration to maximum', () => {
      const controller = createAdaptiveTimingController({
        ...defaultConfig,
        initialStimulusDurationMs: TRACE_ADAPTIVE_STIMULUS_MAX_MS - 100,
      });

      // Record many incorrect trials to push towards maximum
      for (let i = 0; i < 50; i++) {
        controller.onTrialCompleted({
          isCorrect: false,
          responseTimeMs: 500,
          isWarmup: false,
        });
      }

      const stimulusDuration = controller.getCurrentStimulusDurationMs();
      expect(stimulusDuration).toBeLessThanOrEqual(TRACE_ADAPTIVE_STIMULUS_MAX_MS);
    });

    it('should clamp extinction ratio to bounds', () => {
      const controller = createAdaptiveTimingController(defaultConfig);

      // Push towards minimum (high accuracy)
      for (let i = 0; i < 50; i++) {
        controller.onTrialCompleted({
          isCorrect: true,
          responseTimeMs: 500,
          isWarmup: false,
        });
      }

      const extinctionRatio = controller.getCurrentExtinctionRatio();
      expect(extinctionRatio).toBeGreaterThanOrEqual(TRACE_ADAPTIVE_EXTINCTION_MIN);
      expect(extinctionRatio).toBeLessThanOrEqual(TRACE_ADAPTIVE_EXTINCTION_MAX);
    });

    it('should clamp response window to bounds in timed mode', () => {
      const controller = createAdaptiveTimingController({
        ...defaultConfig,
        isTimed: true,
        initialResponseWindowMs: TRACE_ADAPTIVE_RESPONSE_WINDOW_MIN_MS + 500,
      });

      // Push towards minimum (high accuracy)
      for (let i = 0; i < 50; i++) {
        controller.onTrialCompleted({
          isCorrect: true,
          responseTimeMs: 500,
          isWarmup: false,
        });
      }

      const responseWindow = controller.getCurrentResponseWindowMs();
      expect(responseWindow).toBeGreaterThanOrEqual(TRACE_ADAPTIVE_RESPONSE_WINDOW_MIN_MS);
      expect(responseWindow).toBeLessThanOrEqual(TRACE_ADAPTIVE_RESPONSE_WINDOW_MAX_MS);
    });
  });

  describe('self-paced vs timed mode', () => {
    it('should not adjust response window in self-paced mode', () => {
      const controller = createAdaptiveTimingController({
        ...defaultConfig,
        isTimed: false,
        initialResponseWindowMs: 3000,
      });

      // Record trials
      for (let i = 0; i < 15; i++) {
        controller.onTrialCompleted({
          isCorrect: true,
          responseTimeMs: 500,
          isWarmup: false,
        });
      }

      // In self-paced mode, response window should remain unchanged
      // (it's not used anyway, but the value stays fixed)
      expect(controller.getCurrentResponseWindowMs()).toBe(3000);
    });

    it('should adjust response window in timed mode', () => {
      const controller = createAdaptiveTimingController({
        ...defaultConfig,
        isTimed: true,
        initialResponseWindowMs: 3000,
      });

      // Record high accuracy trials
      for (let i = 0; i < 15; i++) {
        controller.onTrialCompleted({
          isCorrect: true,
          responseTimeMs: 500,
          isWarmup: false,
        });
      }

      // In timed mode, response window should decrease (make harder)
      const responseWindow = controller.getCurrentResponseWindowMs();
      expect(responseWindow).toBeLessThan(3000);
    });
  });

  describe('serialize and restore', () => {
    it('should serialize current state', () => {
      const controller = createAdaptiveTimingController(defaultConfig);

      controller.onTrialCompleted({
        isCorrect: true,
        responseTimeMs: 500,
        isWarmup: false,
      });
      controller.onTrialCompleted({
        isCorrect: false,
        responseTimeMs: 600,
        isWarmup: false,
      });

      const state = controller.serialize();

      expect(state.trialCount).toBe(2);
      expect(state.recentTrials.length).toBe(2);
      expect(state.estimatedAccuracy).toBeDefined();
      expect(state.currentValues.stimulusDurationMs).toBeDefined();
      expect(state.currentValues.extinctionRatio).toBeDefined();
      expect(state.currentValues.responseWindowMs).toBeDefined();
    });

    it('should restore from serialized state', () => {
      const controller1 = createAdaptiveTimingController(defaultConfig);

      // Record some trials
      for (let i = 0; i < 10; i++) {
        controller1.onTrialCompleted({
          isCorrect: i % 3 === 0,
          responseTimeMs: 500 + i * 10,
          isWarmup: false,
        });
      }

      const state = controller1.serialize();

      // Create new controller and restore
      const controller2 = createAdaptiveTimingController(defaultConfig);
      controller2.restore(state);

      expect(controller2.getTrialCount()).toBe(state.trialCount);
      expect(controller2.getEstimatedAccuracy()).toBe(state.estimatedAccuracy);
      expect(controller2.getCurrentStimulusDurationMs()).toBe(
        state.currentValues.stimulusDurationMs,
      );
      expect(controller2.getCurrentExtinctionRatio()).toBe(state.currentValues.extinctionRatio);
      expect(controller2.getCurrentResponseWindowMs()).toBe(state.currentValues.responseWindowMs);
    });
  });

  describe('convergence towards target', () => {
    it('should converge towards target accuracy over time', () => {
      const controller = createAdaptiveTimingController({
        ...defaultConfig,
        initialStimulusDurationMs: 1500,
      });

      // Deterministic 60% correct (avoid flaky Math.random-driven test)
      // Pattern: 3 correct, 2 incorrect => 60% correct
      const pattern = [true, true, true, false, false] as const;
      for (let i = 0; i < 50; i++) {
        const isCorrect = pattern[i % pattern.length] ?? false;
        controller.onTrialCompleted({
          isCorrect,
          responseTimeMs: 500,
          isWarmup: false,
        });
      }

      // With 60% accuracy < 75% target, stimulus should increase (easier)
      const stimulusDuration = controller.getCurrentStimulusDurationMs();
      expect(stimulusDuration).toBeGreaterThan(1500);
    });
  });
});

describe('createNoopAdaptiveTimingController', () => {
  const config = {
    stimulusDurationMs: 1000,
    extinctionRatio: 0.65,
    responseWindowMs: 3000,
  };

  it('should return disabled', () => {
    const controller = createNoopAdaptiveTimingController(config);
    expect(controller.isEnabled()).toBe(false);
  });

  it('should return fixed values', () => {
    const controller = createNoopAdaptiveTimingController(config);

    expect(controller.getCurrentStimulusDurationMs()).toBe(1000);
    expect(controller.getCurrentExtinctionRatio()).toBe(0.65);
    expect(controller.getCurrentResponseWindowMs()).toBe(3000);
  });

  it('should not change values after trial completion', () => {
    const controller = createNoopAdaptiveTimingController(config);

    controller.onTrialCompleted({
      isCorrect: true,
      responseTimeMs: 500,
      isWarmup: false,
    });

    expect(controller.getCurrentStimulusDurationMs()).toBe(1000);
    expect(controller.getTrialCount()).toBe(0);
  });

  it('should return target accuracy', () => {
    const controller = createNoopAdaptiveTimingController(config);
    expect(controller.getEstimatedAccuracy()).toBe(TRACE_ADAPTIVE_TARGET_ACCURACY);
  });

  it('should serialize to fixed state', () => {
    const controller = createNoopAdaptiveTimingController(config);
    const state = controller.serialize();

    expect(state.trialCount).toBe(0);
    expect(state.recentTrials).toHaveLength(0);
    expect(state.currentValues.stimulusDurationMs).toBe(1000);
    expect(state.currentValues.extinctionRatio).toBe(0.65);
    expect(state.currentValues.responseWindowMs).toBe(3000);
  });
});
