/**
 * DeviceContextCollector Plugin
 *
 * Collects device and session context info for events.
 *
 * Data in / Data out: Pure data collection, no side effects.
 */

import type { AudioPort } from '../../../ports/audio-port';
import type { PlatformInfoPort } from '../../../ports/platform-info-port';
import { APP_VERSION, getTimeOfDayFromHour } from '../../../specs/thresholds';
import type { DeviceContextCollector, DeviceInfo, TemporalContext } from './types';

/**
 * Default DeviceContextCollector implementation.
 */
export class DefaultDeviceContextCollector implements DeviceContextCollector {
  constructor(private readonly platformInfo?: PlatformInfoPort) {}

  getDeviceInfo(audio?: AudioPort): DeviceInfo {
    const info = this.platformInfo?.getPlatformInfo();

    return {
      platform: info?.platform ?? 'web',
      screenWidth: info?.screenWidth ?? 0,
      screenHeight: info?.screenHeight ?? 0,
      userAgent: info?.userAgent ?? 'unknown',
      touchCapable: info?.touchCapable ?? false,
      volumeLevel: audio?.getVolumeLevel() ?? null,
      appVersion: APP_VERSION,
    };
  }

  getTemporalContext(): TemporalContext {
    const now = new Date();
    const hour = now.getHours();

    return {
      timeOfDay: getTimeOfDayFromHour(hour),
      localHour: hour,
      dayOfWeek: now.getDay(),
      timezone:
        typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC',
    };
  }
}
