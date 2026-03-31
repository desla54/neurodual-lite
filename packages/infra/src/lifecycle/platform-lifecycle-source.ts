/**
 * Platform Lifecycle Source Factory
 *
 * Auto-detects the platform and creates the appropriate lifecycle source.
 */

import type { PlatformLifecycleSource } from '@neurodual/logic';
import { Capacitor } from '@capacitor/core';
import { WebPlatformLifecycleSource } from './platform-lifecycle-source-web';
import { MobilePlatformLifecycleSource } from './platform-lifecycle-source-mobile';
import { lifecycleLog } from '../logger';

/**
 * Create a PlatformLifecycleSource for the current platform.
 *
 * - Native (iOS/Android): Uses Capacitor App plugin
 * - Web: Uses document.visibilitychange
 */
export function createPlatformLifecycleSource(): PlatformLifecycleSource {
  const isNative = Capacitor.isNativePlatform();

  if (isNative) {
    lifecycleLog.info('[PlatformLifecycle] Creating mobile source (Capacitor)');
    return new MobilePlatformLifecycleSource();
  }

  lifecycleLog.info('[PlatformLifecycle] Creating web source (visibilitychange)');
  return new WebPlatformLifecycleSource();
}

// Re-export for convenience
export { WebPlatformLifecycleSource } from './platform-lifecycle-source-web';
export { MobilePlatformLifecycleSource } from './platform-lifecycle-source-mobile';
