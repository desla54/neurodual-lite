/**
 * PlatformInfoPort
 *
 * Read-only platform information (device + display characteristics).
 * Used to keep `packages/logic` free from direct browser API access.
 */

export interface PlatformInfo {
  readonly platform: 'web' | 'android' | 'ios';
  readonly screenWidth: number;
  readonly screenHeight: number;
  readonly userAgent: string;
  readonly touchCapable: boolean;
}

export interface PlatformInfoPort {
  getPlatformInfo(): PlatformInfo;
}
