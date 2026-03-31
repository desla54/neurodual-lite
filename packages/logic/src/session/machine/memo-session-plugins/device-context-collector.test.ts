import { describe, expect, it } from 'bun:test';
import { DefaultDeviceContextCollector } from './device-context-collector';
import type { PlatformInfoPort } from '../../../ports/platform-info-port';
import type { AudioPort } from '../../../ports/audio-port';

describe('DefaultDeviceContextCollector (Memo)', () => {
  // Mock platform info
  function createMockPlatformInfo(): PlatformInfoPort {
    return {
      getPlatformInfo: () => ({
        platform: 'ios' as const,
        screenWidth: 375,
        screenHeight: 812,
        userAgent: 'Safari/iOS',
        touchCapable: true,
      }),
    };
  }

  // Mock audio port
  function createMockAudioPort(): AudioPort {
    return {
      getVolumeLevel: () => 0.5,
      getCurrentTime: () => 0,
      scheduleCallback: () => 0,
      cancelCallback: () => {},
    } as unknown as AudioPort;
  }

  describe('getTimeOfDay', () => {
    it('should return a valid time of day', () => {
      const collector = new DefaultDeviceContextCollector();
      const timeOfDay = collector.getTimeOfDay();

      expect(['morning', 'afternoon', 'evening', 'night']).toContain(timeOfDay);
    });
  });

  describe('getDeviceInfo', () => {
    it('should return device info from platform port', () => {
      const collector = new DefaultDeviceContextCollector(createMockPlatformInfo());
      const info = collector.getDeviceInfo(createMockAudioPort());

      expect(info.platform).toBe('ios');
      expect(info.screenWidth).toBe(375);
      expect(info.screenHeight).toBe(812);
      expect(info.userAgent).toBe('Safari/iOS');
      expect(info.touchCapable).toBe(true);
      expect(info.volumeLevel).toBe(0.5);
    });

    it('should return defaults when platform info not provided', () => {
      const collector = new DefaultDeviceContextCollector();
      const info = collector.getDeviceInfo(createMockAudioPort());

      expect(info.platform).toBe('web');
      expect(info.screenWidth).toBe(0);
      expect(info.screenHeight).toBe(0);
      expect(info.touchCapable).toBe(false);
    });
  });

  describe('getSessionContextInfo', () => {
    it('should return session context info', () => {
      const collector = new DefaultDeviceContextCollector();
      const context = collector.getSessionContextInfo();

      expect(['morning', 'afternoon', 'evening', 'night']).toContain(context.timeOfDay);
      expect(context.localHour).toBeGreaterThanOrEqual(0);
      expect(context.localHour).toBeLessThan(24);
      expect(context.dayOfWeek).toBeGreaterThanOrEqual(0);
      expect(context.dayOfWeek).toBeLessThanOrEqual(6);
      expect(typeof context.timezone).toBe('string');
    });
  });
});
