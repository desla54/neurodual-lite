/**
 * RandomPort
 *
 * Interface for random number generation.
 * Allows seedable randomness for reproducibility and testing.
 */

export interface RandomPort {
  /**
   * Generate a random number between 0 (inclusive) and 1 (exclusive).
   */
  random(): number;

  /**
   * Generate a unique identifier.
   */
  generateId(): string;

  /**
   * Get the current seed (if seeded).
   * Returns undefined for non-seeded implementations.
   */
  getSeed?(): string | undefined;
}

/**
 * Default random using crypto APIs.
 */
export const cryptoRandom: RandomPort = {
  random: () => Math.random(),
  generateId: () => crypto.randomUUID(),
};

/**
 * Create a seeded random port for reproducibility.
 * Uses a simple mulberry32 PRNG.
 */
export function createSeededRandom(seed: string): RandomPort {
  // Hash string to number
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(31, h) + seed.charCodeAt(i);
  }

  // Mulberry32 PRNG
  const mulberry32 = (): number => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  let idCounter = 0;

  return {
    random: mulberry32,
    generateId: () => {
      idCounter++;
      return `${seed}-${idCounter.toString(36)}`;
    },
    getSeed: () => seed,
  };
}
