/**
 * Global type declarations for browser APIs with vendor prefixes
 */

declare global {
  interface Window {
    /** Safari/older WebKit browsers use webkitAudioContext */
    webkitAudioContext?: typeof AudioContext;
  }

  /** Debug API for audio timing analysis (dev only) */
  // eslint-disable-next-line @typescript-eslint/naming-convention
  var __ND_AUDIO__: unknown;
}

export {};
