import { describe, expect, it } from 'bun:test';
import { DefaultDeviceContextCollector } from './device-context-collector';
import type { PlatformInfoPort } from '../../../ports/platform-info-port';
import type { AudioPort } from '../../../ports/audio-port';

describe('DefaultDeviceContextCollector', () => {
  // Mock platform info
  function createMockPlatformInfo(): PlatformInfoPort {
    return {
      getPlatformInfo: () => ({
        platform: 'web' as const,
        screenWidth: 1920,
        screenHeight: 1080,
        userAgent: 'TestBrowser/1.0',
        touchCapable: true,
      }),
    };
  }

  // Mock audio port
  function createMockAudioPort(volume: number | null = 0.8): AudioPort {
    return {
      getVolumeLevel: () => volume,
      getCurrentTime: () => 0,
      scheduleCallback: () => 0,
      cancelCallback: () => {},
    } as unknown as AudioPort;
  }

  describe('getDeviceInfo', () => {
    it('should return device info from platform port', () => {
      const collector = new DefaultDeviceContextCollector(createMockPlatformInfo());
      const info = collector.getDeviceInfo(createMockAudioPort());

      expect(info.platform).toBe('web');
      expect(info.screenWidth).toBe(1920);
      expect(info.screenHeight).toBe(1080);
      expect(info.userAgent).toBe('TestBrowser/1.0');
      expect(info.touchCapable).toBe(true);
      expect(info.volumeLevel).toBe(0.8);
      expect(typeof info.appVersion).toBe('string');
    });

    it('should return defaults when platform info not provided', () => {
      const collector = new DefaultDeviceContextCollector();
      const info = collector.getDeviceInfo(createMockAudioPort());

      expect(info.platform).toBe('web');
      expect(info.screenWidth).toBe(0);
      expect(info.screenHeight).toBe(0);
      expect(info.userAgent).toBe('unknown');
      expect(info.touchCapable).toBe(false);
    });

    it('should handle null volume', () => {
      const collector = new DefaultDeviceContextCollector();
      const info = collector.getDeviceInfo(createMockAudioPort(null));

      expect(info.volumeLevel).toBe(null);
    });
  });

  describe('getTemporalContext', () => {
    it('should return temporal context', () => {
      const collector = new DefaultDeviceContextCollector();
      const context = collector.getTemporalContext();

      expect(['morning', 'afternoon', 'evening', 'night']).toContain(context.timeOfDay);
      expect(context.localHour).toBeGreaterThanOrEqual(0);
      expect(context.localHour).toBeLessThan(24);
      expect(context.dayOfWeek).toBeGreaterThanOrEqual(0);
      expect(context.dayOfWeek).toBeLessThanOrEqual(6);
      expect(typeof context.timezone).toBe('string');
    });
  });
});
