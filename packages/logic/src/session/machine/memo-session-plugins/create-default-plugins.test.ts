import { describe, expect, it } from 'bun:test';
import { createDefaultMemoPlugins } from './create-default-plugins';
import type { CreateDefaultPluginsConfig } from './types';
import { DualMemoSpec } from '../../../specs';

describe('createDefaultMemoPlugins', () => {
  const mockConfig: CreateDefaultPluginsConfig = {
    spec: DualMemoSpec,
    platformInfo: {
      // @ts-expect-error test override
      platform: 'web',
      isIOSSafari: false,
    },
  };

  it('should create all required plugins', () => {
    const plugins = createDefaultMemoPlugins(mockConfig);

    expect(plugins.pick).toBeDefined();
    expect(plugins.windowEval).toBeDefined();
    expect(plugins.fillOrder).toBeDefined();
    expect(plugins.snapshot).toBeDefined();
    expect(plugins.audio).toBeDefined();
    expect(plugins.algorithmState).toBeDefined();
    expect(plugins.deviceContext).toBeDefined();
  });

  it('should create pick processor with required methods', () => {
    const plugins = createDefaultMemoPlugins(mockConfig);

    expect(typeof plugins.pick.process).toBe('function');
    expect(typeof plugins.pick.getMaxCorrections).toBe('function');
  });

  it('should create window evaluator with required methods', () => {
    const plugins = createDefaultMemoPlugins(mockConfig);

    expect(typeof plugins.windowEval.evaluate).toBe('function');
  });

  it('should create fill order generator with required methods', () => {
    const plugins = createDefaultMemoPlugins(mockConfig);

    expect(typeof plugins.fillOrder.generate).toBe('function');
  });

  it('should create snapshot builder with required methods', () => {
    const plugins = createDefaultMemoPlugins(mockConfig);

    expect(typeof plugins.snapshot.build).toBe('function');
  });

  it('should create audio policy with required methods', () => {
    const plugins = createDefaultMemoPlugins(mockConfig);

    expect(typeof plugins.audio.shouldPlayStimulus).toBe('function');
    expect(typeof plugins.audio.getAudioSyncBufferMs).toBe('function');
  });

  it('should create algorithm state manager with required methods', () => {
    const plugins = createDefaultMemoPlugins(mockConfig);

    expect(typeof plugins.algorithmState.canPersist).toBe('function');
    expect(typeof plugins.algorithmState.getAlgorithmType).toBe('function');
    expect(typeof plugins.algorithmState.serializeState).toBe('function');
    expect(typeof plugins.algorithmState.saveState).toBe('function');
    expect(typeof plugins.algorithmState.loadAndRestoreState).toBe('function');
  });

  it('should create device context collector with required methods', () => {
    const plugins = createDefaultMemoPlugins(mockConfig);

    expect(typeof plugins.deviceContext.getDeviceInfo).toBe('function');
    expect(typeof plugins.deviceContext.getSessionContextInfo).toBe('function');
    expect(typeof plugins.deviceContext.getTimeOfDay).toBe('function');
  });
});
