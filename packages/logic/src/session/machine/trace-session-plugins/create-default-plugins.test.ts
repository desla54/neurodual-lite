import { describe, expect, it } from 'bun:test';
import {
  createDefaultTracePlugins,
  type CreateDefaultPluginsConfig,
} from './create-default-plugins';
import { DualTraceSpec } from '../../../specs/trace.spec';
import type { TimingSource } from './types';

describe('createDefaultTracePlugins', () => {
  function createConfig(): CreateDefaultPluginsConfig {
    const timingSource: TimingSource = {
      stimulusDurationMs: DualTraceSpec.timing.stimulusDurationMs,
      responseWindowMs: DualTraceSpec.timing.responseWindowMs ?? 3000,
      feedbackDurationMs: DualTraceSpec.timing.feedbackDurationMs ?? 500,
      ruleDisplayMs: DualTraceSpec.extensions.ruleDisplayMs,
      intervalMs: DualTraceSpec.timing.intervalMs,
      // @ts-expect-error test override
      warmupStimulusDurationMs: DualTraceSpec.extensions.warmupStimulusDurationMs,
    };

    return {
      spec: DualTraceSpec,
      getTimingSource: () => timingSource,
    };
  }

  it('should create all required plugins', () => {
    const plugins = createDefaultTracePlugins(createConfig());

    expect(plugins.response).toBeDefined();
    expect(plugins.audio).toBeDefined();
    expect(plugins.rhythm).toBeDefined();
    expect(plugins.modality).toBeDefined();
    expect(plugins.writing).toBeDefined();
    expect(plugins.arithmetic).toBeDefined();
  });

  it('should return frozen object', () => {
    const plugins = createDefaultTracePlugins(createConfig());

    expect(Object.isFrozen(plugins)).toBe(true);
  });

  it('should create response processor with correct spec', () => {
    const plugins = createDefaultTracePlugins(createConfig());

    // Test that response processor works
    expect(typeof plugins.response.isWarmupTrial).toBe('function');
    expect(typeof plugins.response.getExpectedPosition).toBe('function');
    expect(typeof plugins.response.processSwipe).toBe('function');
  });

  it('should create audio policy with correct spec', () => {
    const plugins = createDefaultTracePlugins(createConfig());

    expect(typeof plugins.audio.isAudioEnabled).toBe('function');
    expect(typeof plugins.audio.isSoundEnabled).toBe('function');
    expect(typeof plugins.audio.getStimulusSound).toBe('function');
    expect(typeof plugins.audio.getFeedbackSound).toBe('function');
  });

  it('should create rhythm controller with hot-reload support', () => {
    // @ts-expect-error test override
    let timingValues: TimingSource = {
      stimulusDurationMs: 2000,
      responseWindowMs: 3000,
      feedbackDurationMs: 500,
      ruleDisplayMs: 1000,
      intervalMs: 500,
      warmupStimulusDurationMs: 2500,
    };

    const plugins = createDefaultTracePlugins({
      spec: DualTraceSpec,
      getTimingSource: () => timingValues,
    });

    // Initial values
    // @ts-expect-error test override
    expect(plugins.rhythm.getStimulusDurationMs()).toBe(2000);

    // Hot-reload: update timing source
    timingValues = { ...timingValues, stimulusDurationMs: 3000 };

    // Should reflect new value
    // @ts-expect-error test override
    expect(plugins.rhythm.getStimulusDurationMs()).toBe(3000);
  });

  it('should create modality evaluator', () => {
    const plugins = createDefaultTracePlugins(createConfig());

    expect(typeof plugins.modality.isEnabled).toBe('function');
    expect(typeof plugins.modality.getEnabledModalities).toBe('function');
    expect(typeof plugins.modality.evaluate).toBe('function');
  });

  it('should create writing orchestrator', () => {
    const plugins = createDefaultTracePlugins(createConfig());

    expect(typeof plugins.writing.needsWritingPhase).toBe('function');
    expect(typeof plugins.writing.getTimeoutMs).toBe('function');
    expect(typeof plugins.writing.createTimeoutResult).toBe('function');
    expect(typeof plugins.writing.isWritingEnabled).toBe('function');
  });

  it('should create arithmetic orchestrator', () => {
    const plugins = createDefaultTracePlugins(createConfig());

    expect(typeof plugins.arithmetic.isEnabled).toBe('function');
    expect(typeof plugins.arithmetic.getTimeoutMs).toBe('function');
    expect(typeof plugins.arithmetic.generateProblem).toBe('function');
    expect(typeof plugins.arithmetic.validateAnswer).toBe('function');
  });
});
