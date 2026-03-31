import { describe, expect, it } from 'bun:test';
import { createDefaultDualPickPlugins } from './create-default-plugins';
import type { CreateDefaultPluginsConfig } from './types';
import { DualPickSpec } from '../../../specs';

describe('createDefaultDualPickPlugins', () => {
  const mockConfig: CreateDefaultPluginsConfig = {
    spec: DualPickSpec,
    platformInfo: {
      // @ts-expect-error test override
      platform: 'web',
      isIOSSafari: false,
    },
  };

  it('should create all required plugins', () => {
    const plugins = createDefaultDualPickPlugins(mockConfig);

    expect(plugins.deviceContext).toBeDefined();
    expect(plugins.timeline).toBeDefined();
    expect(plugins.drop).toBeDefined();
    expect(plugins.placement).toBeDefined();
    expect(plugins.snapshot).toBeDefined();
    expect(plugins.audio).toBeDefined();
  });

  it('should create device context collector with required methods', () => {
    const plugins = createDefaultDualPickPlugins(mockConfig);

    expect(typeof plugins.deviceContext.getDeviceInfo).toBe('function');
    expect(typeof plugins.deviceContext.getTemporalContext).toBe('function');
  });

  it('should create timeline generator with required methods', () => {
    const plugins = createDefaultDualPickPlugins(mockConfig);

    expect(typeof plugins.timeline.generate).toBe('function');
    expect(typeof plugins.timeline.generatePlacementOrder).toBe('function');
  });

  it('should create drop validator with required methods', () => {
    const plugins = createDefaultDualPickPlugins(mockConfig);

    expect(typeof plugins.drop.validate).toBe('function');
  });

  it('should create placement orchestrator with required methods', () => {
    const plugins = createDefaultDualPickPlugins(mockConfig);

    expect(typeof plugins.placement.getCurrentTarget).toBe('function');
    expect(typeof plugins.placement.isAllLabelsPlaced).toBe('function');
  });

  it('should create snapshot builder with required methods', () => {
    const plugins = createDefaultDualPickPlugins(mockConfig);

    expect(typeof plugins.snapshot.build).toBe('function');
  });

  it('should create audio policy with required methods', () => {
    const plugins = createDefaultDualPickPlugins(mockConfig);

    expect(typeof plugins.audio.shouldPlayStimulus).toBe('function');
  });
});
