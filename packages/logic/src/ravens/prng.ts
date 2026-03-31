import type { SeededRandom } from '../domain/random';

export { SeededRandom } from '../domain/random';

/**
 * Sample N elements without replacement from an array.
 */
export function choiceN<T>(rng: SeededRandom, array: readonly T[], n: number): T[] {
  if (n >= array.length) return rng.shuffle([...array]);
  const pool = [...array];
  const result: T[] = [];
  for (let i = 0; i < n; i++) {
    const idx = rng.int(0, pool.length);
    result.push(pool[idx]!);
    pool.splice(idx, 1);
  }
  return result;
}

/**
 * Generate a random permutation of indices [0..n-1].
 */
export function permutation(rng: SeededRandom, n: number): number[] {
  const arr = Array.from({ length: n }, (_, i) => i);
  return rng.shuffle(arr);
}

/**
 * Pick a random integer in [min, max] (inclusive on both ends).
 */
export function intInclusive(rng: SeededRandom, min: number, max: number): number {
  return rng.int(min, max + 1);
}
