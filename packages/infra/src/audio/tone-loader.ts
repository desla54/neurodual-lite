type ToneModule = typeof import('tone');

let toneModule: ToneModule | null = null;
let tonePromise: Promise<ToneModule> | null = null;

/**
 * Load Tone.js on-demand.
 *
 * Tone is a large dependency; importing it at module scope causes noticeable
 * parse/compile cost on low-end devices even when audio isn't used.
 */
export async function loadTone(): Promise<ToneModule> {
  if (toneModule) return toneModule;
  if (!tonePromise) {
    tonePromise = import('tone').then((mod) => {
      toneModule = mod as unknown as ToneModule;
      return toneModule;
    });
  }
  return tonePromise;
}

/**
 * Synchronous access when Tone was already loaded.
 * Useful in user-gesture call stacks (iOS PWA unlock path).
 */
export function getToneSync(): ToneModule | null {
  return toneModule;
}
