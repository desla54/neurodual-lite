/**
 * DeviceContextCollector Plugin
 *
 * Gathers device and session context information.
 *
 * Data in / Data out: Pure data collection, no side effects.
 */

import type { AudioPort } from '../../../ports/audio-port';
import type { PlatformInfoPort } from '../../../ports/platform-info-port';
import { APP_VERSION, getTimeOfDayFromHour } from '../../../specs/thresholds';
import type { DeviceContextCollector, DeviceInfo, SessionContextInfo } from './types';

/**
 * Default DeviceContextCollector implementation.
 */
export class DefaultDeviceContextCollector implements DeviceContextCollector {
  constructor(private readonly platformInfo?: PlatformInfoPort) {}

  getTimeOfDay(): 'morning' | 'afternoon' | 'evening' | 'night' {
    const hour = new Date().getHours();
    return getTimeOfDayFromHour(hour);
  }

  getDeviceInfo(audio: AudioPort): DeviceInfo {
    const info = this.platformInfo?.getPlatformInfo();
    return {
      platform: info?.platform ?? 'web',
      screenWidth: info?.screenWidth ?? 0,
      screenHeight: info?.screenHeight ?? 0,
      userAgent: info?.userAgent ?? 'unknown',
      touchCapable: info?.touchCapable ?? false,
      volumeLevel: audio.getVolumeLevel(),
      appVersion: APP_VERSION,
    };
  }

  getSessionContextInfo(): SessionContextInfo {
    const now = new Date();
    return {
      timeOfDay: this.getTimeOfDay(),
      localHour: now.getHours(),
      dayOfWeek: now.getDay(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  }
}
